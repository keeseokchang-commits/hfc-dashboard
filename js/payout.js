// HFC payout.js v2.9.107 — 지급 스케줄(S15) 도메인 계산(SSOT, DOM 무관 순수 함수)
// 근거: 지급 스케줄 설계서 v0.3(2026-10-26 승인, Phase 1). 계산서 없는 지급(사업소득·급여·기타경비)을 월·사람별 행으로 저장하고,
//       원천세·4대보험 납부도 별도 행으로 만든다. 자금수지·월마감 리포트·지급 스케줄 화면이 이 모듈 하나를 공유한다.
// 의존: calc.js(monthlyAmounts·monthlyProfile·calcOpt·ymList·pad2·mmTotal)
// 행 종류(pay_type): 급여 / 사업소득 / 기타경비 = 본인(또는 거래처) 지급, 원천세 / 4대보험 = 납부.
//   현금 = 지급 행은 net_amt, 납부 행은 gross_amt.  회사 비용 = gross + employer(급여) / gross(사업소득·기타경비).

const PO_PAY=['급여','사업소득','기타경비'], PO_REMIT=['원천세','4대보험'];
const PO_CODE={'급여':'SAL','사업소득':'BIZ','기타경비':'ETC','원천세':'TAX','4대보험':'INS'};
const PO_BIZ_TAG='사업소득형:세전';          // 견적 memo — 세전 입력(새 방식). 'S12 memo=사업소득형'은 공제 후 입력(기존)
const PO_RULE_KEYS={'급여':'payout_pay_salary','사업소득':'payout_pay_biz','기타경비':'payout_pay_etc','원천세':'payout_remit_tax','4대보험':'payout_remit_ins'};
const poN=v=>{ const n=parseInt(String(v??'').replace(/,/g,''),10); return isNaN(n)?0:n; };
const poPad=n=>String(n).padStart(2,'0');

// 규칙 문자열 '월오프셋:일' → {off,day}. 값이 없거나 형식이 틀리면 기본(익월 10일)
function poRule(settings,payType){
  const raw=String(((settings||{})[PO_RULE_KEYS[payType]])??'');
  const m=/^([01]):(\d{1,2})$/.exec(raw)||/^([01]):(\d{1,2})$/.exec(PO_REMIT.includes(payType)?'0:10':'1:10');
  return {off:+m[1],day:+m[2]};
}
// 'YYYY-MM' + 규칙 → 'YYYY-MM-DD' (일이 그 달 말일보다 크면 말일, 99=말일)
function poDate(ym,rule){
  const [y,m]=String(ym).split('-').map(Number); const d=new Date(y,m-1+rule.off,1);
  const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  const day=rule.day===99?last:Math.min(rule.day,last);
  return `${d.getFullYear()}-${poPad(d.getMonth()+1)}-${poPad(day)}`;
}
// 사업소득 3.3% — 소득세 3%(10원 미만 절사) + 지방소득세(소득세의 10%, 원 단위 절사)
function poBizTax(gross){
  const g=Math.round(+gross||0); const inc=Math.floor(g*0.03/10)*10; const loc=Math.floor(inc*0.1);
  return {inc,loc,w:inc+loc,net:g-inc-loc};
}
// 실지급액(공제 후)에서 세전 금액 역산 제안 — 기존 입력을 세전으로 바꿀 때의 제안값
function poGrossFromNet(net){
  const n=Math.round(+net||0); if(n<=0) return 0; let g=Math.round(n/0.967), best=g, bd=Infinity;
  for(let x=g-100;x<=g+100;x++){ const d=Math.abs(poBizTax(x).net-n); if(d<bd||(d===bd&&x<best)){ bd=d; best=x; } }
  return best;
}
// 견적 항목이 계산서 없는 지급인가 (input.html·cashflow.html의 isInvoiceType의 반대)
function poIsNonInvoice(e){
  if(!e||e.comp_type==='_EMPTY') return false;
  if(e.comp_type==='인건비') return !!(e.memo&&e.memo!=='');
  return String(e.memo||'').startsWith('_NOINVOICE_');
}
function poHash(s){ let h=5381; const t=String(s); for(let i=0;i<t.length;i++) h=((h<<5)+h+t.charCodeAt(i))>>>0; return h.toString(36).slice(0,5); }
// 급여형 memo '급여형[2]|{...}' → {months:{YYYY-MM:회사총액}, detail:{YYYY-MM:{g,w,i,e,s}}|null}
function poParseSalary(memo){
  const part=String(memo||'').split('|').slice(1).join('|'); let obj={};
  if(part){ try{ obj=JSON.parse(part)||{}; }catch(err){ obj={}; } }
  const months={}; Object.keys(obj).forEach(k=>{ if(/^\d{4}-\d{2}$/.test(k)) months[k]=poN(obj[k]); });
  const detail=(obj._d&&typeof obj._d==='object')?obj._d:null;
  return {months,detail};
}
function poMakeRow(base,type,ym,person,estItem,amt,status,memo,settings,payDate){
  const r={payout_id:`PO-${base.project_id}-${ym}-${PO_CODE[type]}-${poHash(estItem)}`,project_id:base.project_id,year_month:ym,pay_type:type,person_name:person,est_item:estItem,
    gross_amt:0,withheld_amt:0,ins_emp_amt:0,employer_amt:0,net_amt:0,payment_date:payDate||'',est_status:status||'추정',date_edited:'',memo:memo||'',matched_txn_id:'',pay_actual_date:'',updated_at:''};
  Object.assign(r,amt); return r;
}
// 지급 행(src)에 딸린 납부 행 한 줄 — 지급일은 지급한 달 기준 규칙(기본 익월 10일)
function poRemitRow(src,type,amount,settings){
  const ym=src.year_month, pd=poDate(String(src.payment_date||poDate(ym,poRule(settings,src.pay_type))).slice(0,7),poRule(settings,type));
  return poMakeRow({project_id:src.project_id},type,ym,type+' 납부 · '+src.person_name,src.est_item,{gross_amt:amount,net_amt:amount},src.est_status,'',settings,pd);
}
// 견적(S12 행들)에서 한 프로젝트의 계산서 없는 지급 행을 만든다. prj: {project_id,start_date,end_date}
function poGenerate(prj,items,settings){
  const rows=[], used={};
  const keyOf=(name,tag)=>{ const k=`${name}|${tag}`; used[k]=(used[k]||0)+1; return used[k]>1?`${k}#${used[k]}`:k; };
  const addRemit=(src,type,ym,amount)=>{ if(amount) rows.push(poRemitRow(src,type,amount,settings)); };
  (items||[]).filter(poIsNonInvoice).forEach(e=>{
    const person=e.item_name||'';
    if(e.comp_type==='인건비'&&String(e.memo).startsWith('급여형')){
      const est=keyOf(person,'급여형'), sal=poParseSalary(e.memo);
      Object.keys(sal.months).sort().forEach(ym=>{
        const d=sal.detail&&sal.detail[ym];
        const g=d?poN(d.g):sal.months[ym], w=d?poN(d.w):0, i=d?poN(d.i):0, em=d?poN(d.e):0;
        if(!g&&!w&&!i&&!em) return;
        const row=poMakeRow(prj,'급여',ym,person,est,{gross_amt:g,withheld_amt:w,ins_emp_amt:i,employer_amt:em,net_amt:g-w-i},(d&&d.s)||'추정',d?'':'기존 입력(회사 총액)',settings,poDate(ym,poRule(settings,'급여')));
        rows.push(row); addRemit(row,'원천세',ym,w); addRemit(row,'4대보험',ym,i+em);
      });
    } else if(e.comp_type==='인건비'){        // 사업소득형 (세전 또는 기존 공제 후)
      const gross=String(e.memo)===PO_BIZ_TAG, est=keyOf(person,'사업소득형');
      const st=e.start_date||prj.start_date, en=e.end_date||prj.end_date;
      monthlyAmounts(poN(e.buy_price),st,en,calcOpt(e,'buy_price')).forEach(x=>{
        const ym=`${x.y}-${poPad(x.m)}`, t=gross?poBizTax(x.amount):{w:0,net:x.amount};
        const row=poMakeRow(prj,'사업소득',ym,person,est,{gross_amt:x.amount,withheld_amt:t.w,net_amt:t.net},'추정',gross?'':'기존 입력(공제 후)',settings,poDate(ym,poRule(settings,'사업소득')));
        rows.push(row); addRemit(row,'원천세',ym,t.w);
      });
    } else {                                   // 계산서 없는 기타경비
      const est=keyOf(person,'기타경비'), byM=monthlyProfile([e],'buy_price',prj.start_date,prj.end_date);
      Object.keys(byM).sort().forEach(ym=>{ const a=Math.round(byM[ym]); if(!a) return;
        rows.push(poMakeRow(prj,'기타경비',ym,person,est,{gross_amt:a,net_amt:a},'추정','',settings,poDate(ym,poRule(settings,'기타경비')))); });
    }
  });
  return rows;
}
const poAmtKeys=['gross_amt','withheld_amt','ins_emp_amt','employer_amt','net_amt'];
const poLocked=r=>r.est_status==='확정'||!!r.pay_actual_date||!!r.matched_txn_id;
// 이미 저장된 행(existing, 한 프로젝트)과 새로 만든 행(generated)을 합친다.
// 확정·지급완료·대사된 행은 덮어쓰지 않고(금액이 달라졌으면 changedLocked로 알림), 지급일을 직접 고친 행은 지급일을 유지한다.
// 견적에서 사라진 기존 행은 지우지 않고 orphans로 알린다.
function poMerge(existing,generated){
  const byId=Object.fromEntries((existing||[]).map(r=>[r.payout_id,r])); const seen=new Set();
  const out=[], stat={added:0,updated:0,kept:0,changedLocked:[],orphans:[]};
  generated.forEach(g=>{
    seen.add(g.payout_id); const ex=byId[g.payout_id];
    if(!ex){ out.push(g); stat.added++; return; }
    const diff=poAmtKeys.some(k=>poN(ex[k])!==poN(g[k]));
    if(poLocked(ex)){ out.push(ex); stat.kept++; if(diff) stat.changedLocked.push(ex.payout_id); return; }
    const n={...ex,...g,payment_date:ex.date_edited==='Y'?ex.payment_date:g.payment_date,date_edited:ex.date_edited,est_status:ex.est_status||g.est_status,
      matched_txn_id:ex.matched_txn_id,pay_actual_date:ex.pay_actual_date,updated_at:ex.updated_at};
    const changed=diff||n.payment_date!==ex.payment_date||n.memo!==ex.memo;
    out.push(changed?n:ex); if(changed) stat.updated++; else stat.kept++;
  });
  (existing||[]).forEach(r=>{ if(!seen.has(r.payout_id)){ out.push(r); stat.orphans.push(r.payout_id); } });
  return {rows:out,...stat};
}
// 한 행의 실제 현금(자금수지·리포트 기준): 지급 행=실지급액, 납부 행=납부액
function poCash(r){ return PO_REMIT.includes(r.pay_type)?poN(r.gross_amt):poN(r.net_amt); }
// 한 행의 회사 비용(손익 기준): 급여=세전+회사부담, 사업소득·기타경비=세전. 납부 행은 비용에서 이미 계산되므로 0
function poCost(r){ if(PO_REMIT.includes(r.pay_type)) return 0; return poN(r.gross_amt)+(r.pay_type==='급여'?poN(r.employer_amt):0); }
// 지급 스케줄 행 → 자금수지의 planCost 항목(NOINV- 접두어를 써서 부가세를 곱하지 않는 기존 규칙을 그대로 탄다)
function poToPlanCosts(rows,okPrj){
  return (rows||[]).filter(r=>r.payout_id&&(!okPrj||okPrj.has(r.project_id))&&poCash(r)).map(r=>({
    cost_id:'NOINV-'+r.payout_id,project_id:r.project_id,year_month:r.year_month,
    cost_type:PO_REMIT.includes(r.pay_type)?r.pay_type+' 납부':r.pay_type+' 지급(계산서없음)',person_name:r.person_name||'',
    unit_price:'',mm:'',amount:poCash(r),payment_date:r.payment_date||'',
    memo:'지급 스케줄('+(r.est_status||'추정')+')',vat_amt:0,invoice_plan_date:'',invoice_date:'',
    matched_txn_id:r.matched_txn_id||'',pay_actual_date:r.pay_actual_date||'',_po:r}));
}
// 지급 스케줄이 없는 프로젝트용 안전장치 — 기존(v2.9.46) 방식: 견적에서 프로젝트·월 합계를 계산, 지급일 익월 10일. 반환 {costs, projects:[project_id]}
function poFallbackCosts(prjList,estAll){
  const costs=[], projects=[];
  (prjList||[]).forEach(prj=>{
    const items=(estAll||[]).filter(e=>e.pipeline_id===prj.pipeline_id&&poIsNonInvoice(e));
    if(!items.length) return;
    const byM=monthlyProfile(items,'buy_price',prj.start_date,prj.end_date); let any=false;
    Object.keys(byM).forEach(ym=>{
      if(!byM[ym]) return; any=true;
      const [yy,mm]=ym.split('-').map(Number); const nm=new Date(yy,mm,10);
      costs.push({cost_id:`NOINV-${prj.project_id}-${ym}`,project_id:prj.project_id,year_month:ym,cost_type:'인건비(계산서없음)',person_name:'',unit_price:'',mm:'',amount:Math.round(byM[ym]),
        payment_date:`${nm.getFullYear()}-${poPad(nm.getMonth()+1)}-10`,memo:'견적 기준 자동계산(계산서없음, 전월 근무분 당월 10일 지급) — 지급 스케줄 미생성',vat_amt:0,invoice_plan_date:'',invoice_date:'',matched_txn_id:'',pay_actual_date:''});
    });
    if(any) projects.push(prj.project_id);
  });
  return {costs,projects};
}
// 자금수지·리포트 공용: 계산서 없는 지급 계획 전체. 지급 스케줄 행이 있는 프로젝트는 그 행을, 없는 프로젝트는 견적 계산(안전장치)을 쓴다.
function poBuildPlan(prjList,estAll,payoutRows,okPrj){
  const have=new Set((payoutRows||[]).filter(r=>r.payout_id).map(r=>r.project_id));
  const fb=poFallbackCosts((prjList||[]).filter(p=>(!okPrj||okPrj.has(p.project_id))&&!have.has(p.project_id)),estAll);
  return {costs:[...poToPlanCosts(payoutRows,okPrj),...fb.costs],fallbackProjects:fb.projects};
}
