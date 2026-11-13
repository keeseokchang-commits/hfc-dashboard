// HFC change.js v3.11.0 — 프로젝트 변경(구성 변경) 도메인 계산(SSOT, DOM 무관 순수 함수)
// 근거: 프로젝트 변경 설계서 v0.2(승인 2026-11-12). 의존: calc.js(mmTotal·laborAmt·monthlyProfile·monthList·pad2), payout.js(poGenerate·poN·poAmtKeys·poCash·poIsNonInvoice·PO_BIZ_TAG)
// 원칙: ① 견적(S12)이 원본, 지급·매출·매입은 견적에서 파생 ② 발행·수취·입금·지급·대사된 건은 바꾸지 않는다 ③ "변경 후 값"을 지정하므로 다시 해도 같은 결과(멱등)
const CHG_TYPE_NEW='구성변경';
const CHG_STEPS=['견적','지급스케줄','매출','매입','프로젝트','이력'];
const chgYm=d=>String(d||'').slice(0,7);
const chgIsDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!isNaN(new Date(s));
const chgLastDay=ym=>{ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); };
const chgMonthEnd=ym=>`${ym}-${pad2(chgLastDay(ym))}`;
const chgNextMonthEnd=ym=>{ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m,1); return chgMonthEnd(`${d.getFullYear()}-${pad2(d.getMonth()+1)}`); };
// 수정세금계산서 발급 기한 — 변동 사유가 발생한 날이 속하는 달의 다음 달 10일
const chgDueDate=eff=>{ const [y,m]=chgYm(eff).split('-').map(Number); const d=new Date(y,m,10); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-10`; };
const chgIsSal=r=>String(r&&r.memo||'').startsWith('급여형');
const chgPayType=r=>chgIsSal(r)?'급여형':(String(r&&r.memo||'').startsWith('사업소득형')?'사업소득형':'세금계산서형');
const chgIsLabor=e=>e&&e.comp_type==='인건비';

// ── 급여형 월별 값 ──────────────────────────────────────────────────
function chgSalaryObj(memo){ const part=String(memo||'').split('|').slice(1).join('|'); let o={}; if(part){ try{ o=JSON.parse(part)||{}; }catch(e){ o={}; } } return o; }
// 견적 행의 급여 월별 값 {YYYY-MM:{g,w,i,e,s}}
function chgSalMap(row){
  const o=chgSalaryObj(row&&row.memo), out={};
  Object.keys(o).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().forEach(ym=>{ const d=o._d&&o._d[ym];
    out[ym]=d?{g:poN(d.g),w:poN(d.w),i:poN(d.i),e:poN(d.e),s:d.s||'추정'}:{g:poN(o[ym]),w:0,i:0,e:0,s:'추정'}; });
  return out;
}
// 시작~종료 기간에 맞춰 월별 값을 다시 맞춘다. 입력해 둔 달은 그대로, 늘어난 달은 마지막 달 값을 「추정」으로 복사, 줄어든 달은 버린다.
// lastDay(마지막 근무일)를 주면 그 달 값을 원래 값(orig)에서 일할(날짜÷그 달 일수)로 제안한다. 말일이면 그대로.
function chgSalFit(prev,start,end,lastDay,orig){
  const out={}; if(!chgIsDate(start)||!chgIsDate(end)||end<start) return out;
  const yms=monthList(start,end).map(x=>`${x.y}-${pad2(x.m)}`);
  const pk=Object.keys(prev||{}).sort(), lp=pk.length?prev[pk[pk.length-1]]:null;
  yms.forEach(ym=>{ const p=prev&&prev[ym];
    out[ym]=p?{...p}:(lp?{g:lp.g,w:lp.w,i:lp.i,e:lp.e,s:'추정'}:{g:0,w:0,i:0,e:0,s:'추정'}); });
  if(lastDay&&chgIsDate(lastDay)){ const ym=chgYm(lastDay);
    if(out[ym]){ const src=(orig&&orig[ym])||(prev&&prev[ym])||out[ym], dim=chgLastDay(ym), day=+String(lastDay).slice(8,10), f=day>=dim?1:day/dim, sc=v=>Math.round(poN(v)*f);
      out[ym]={g:sc(src.g),w:sc(src.w),i:sc(src.i),e:sc(src.e),s:'추정'}; } }
  return out;
}
// 월별 값 → 견적 memo·매입 총액(buy_price). estimate.html 저장 형식과 같다: o[ym]=세전+회사부담, o._d=상세
function chgSalMemo(sal){
  const o={}, d={}; let buy=0;
  Object.keys(sal||{}).sort().forEach(ym=>{ const x=sal[ym]; d[ym]={g:poN(x.g),w:poN(x.w),i:poN(x.i),e:poN(x.e),s:x.s||'추정'}; o[ym]=poN(x.g)+poN(x.e); buy+=o[ym]; });
  if(Object.keys(d).length) o._d=d;
  return {memo:'급여형|'+JSON.stringify(o),buy};
}

// ── 견적 인건비 행 만들기·검증 ───────────────────────────────────────
// base: 기존 견적 행(없으면 새 줄), f: {name,grade,payType,start,end,sell,buy,sal,bizLegacy}
function chgBuildRow(base,f){
  const n={...(base||{})}, pay=f.payType||chgPayType(base);
  n.comp_type='인건비'; n.item_name=f.name; n.grade=f.grade||''; n.qty=1; n.start_date=f.start; n.end_date=f.end;
  n.unit_price=poN(f.sell); n.mm=parseFloat(mmTotal(f.start,f.end))||0;
  if(pay==='급여형'){ const m=chgSalMemo(f.sal||{}); n.memo=m.memo; n.buy_price=m.buy; }
  else { n.buy_price=poN(f.buy);
    n.memo=(base&&chgPayType(base)===pay)?base.memo:(pay==='사업소득형'?PO_BIZ_TAG:''); }
  n.amount=laborAmt(n,'unit_price');
  return n;
}
// 한 줄 검증 → 메시지 배열(없으면 통과)
function chgCheckRow(f){
  const m=[], nm=f.name||'(이름 없음)';
  if(!String(f.name||'').trim()) m.push('항목명(인력)을 입력해 주세요.');
  if(!chgIsDate(f.start)||!chgIsDate(f.end)) m.push(`「${nm}」의 시작일·종료일을 입력해 주세요.`);
  else if(f.end<f.start) m.push(`「${nm}」의 종료일이 시작일보다 빠릅니다.`);
  if(poN(f.sell)<0||poN(f.buy)<0) m.push(`「${nm}」의 단가는 0 이상이어야 합니다.`);
  if(f.payType==='급여형'&&chgIsDate(f.start)&&chgIsDate(f.end)&&f.end>=f.start){
    const sal=f.sal||{}, yms=monthList(f.start,f.end).map(x=>`${x.y}-${pad2(x.m)}`);
    Object.keys(sal).forEach(k=>{ if(!yms.includes(k)) m.push(`「${nm}」의 ${k} 급여가 기간 밖에 있습니다.`); });
    yms.forEach(k=>{ if(!sal[k]) m.push(`「${nm}」의 ${k} 급여가 비어 있습니다.`); });
  }
  return m;
}
const chgLaborTotals=(rows)=>({sell:Math.round((rows||[]).reduce((s,e)=>s+laborAmt(e,'unit_price'),0)),buy:Math.round((rows||[]).reduce((s,e)=>s+laborAmt(e,'buy_price'),0))});
// 견적 합계(공급가) — 인건비는 laborAmt, 기타는 수량×단가. 급여형 매입은 buy_price(월별 합계 총액) 그대로.
function chgTotals(items){
  const it=(items||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY');
  const sell=it.reduce((s,e)=>s+(e.comp_type==='인건비'?laborAmt(e,'unit_price'):(poN(e.qty)||1)*poN(e.unit_price)),0);
  const buy=it.reduce((s,e)=>s+(e.comp_type==='인건비'?laborAmt(e,'buy_price'):(poN(e.qty)||1)*poN(e.buy_price)),0);
  return {sell:Math.round(sell),buy:Math.round(buy)};
}
// 변경 후 프로젝트 기간 제안 — 끝은 모든 행(날짜 있는 것)의 최대 종료일, 시작은 현재 시작과 행들의 최소 시작일 중 빠른 쪽(시작을 자동으로 늦추지는 않는다)
function chgSuggestSpan(items,span){
  const it=(items||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY');
  const ends=it.map(e=>e.end_date).filter(chgIsDate), sts=it.map(e=>e.start_date).filter(chgIsDate);
  const end=ends.length?ends.reduce((a,b)=>a>b?a:b):(span.end_date||''), st0=sts.length?sts.reduce((a,b)=>a<b?a:b):'';
  const st=span.start_date?(st0&&st0<span.start_date?st0:span.start_date):st0;
  return {start_date:st||'',end_date:end||''};
}
// 월별 계획 금액 차이(변경 전 − 변경 후, 양수=감액·음수=증액). spanA 를 주면 변경 후 기간 기본값으로 쓴다.
function chgMonthDelta(before,after,field,span,filterFn,spanA){
  const f=filterFn||(()=>true), clean=a=>(a||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY'&&f(e)), sa=spanA||span;
  const b=monthlyProfile(clean(before),field,span.start_date,span.end_date), a=monthlyProfile(clean(after),field,sa.start_date,sa.end_date);
  const keys=[...new Set([...Object.keys(b),...Object.keys(a)])].sort(), delta={}, bm={};
  keys.forEach(k=>{ const bv=Math.round(b[k]||0), av=Math.round(a[k]||0); bm[k]=bv; if(bv!==av) delta[k]=bv-av; });
  return {delta,before:bm};
}

// ── 청구 스케줄(S04 매출 / S05 매입 계산서형) ───────────────────────────
// 감액(양수): 미발행 행부터 줄이고, 발행분이 남으면 수정세금계산서 목록. 증액(음수): 미발행 행이 있으면 거기에 더하고, 없으면 새 행(추가 청구)을 넣는다.
// seq: {n} 새 행 번호 카운터(호출한 쪽이 시트의 최대 번호로 시작)
function chgPlanBilling(rows,projectId,delta,beforeMonth,kind,eff,seq,cycle){
  const S4=kind==='S04', idKey=S4?'revenue_id':'cost_id', amtKey=S4?'tax_invoice_amt':'amount', label=S4?'매출':'매입', pre=S4?'REV-2026-':'COST-2026-';
  const issued=r=>!!r.invoice_date||(S4?r.is_received==='Y':!!r.pay_actual_date);
  const paid=r=>S4?r.is_received==='Y':!!r.pay_actual_date;
  const impacts=[], amends=[], notes=[], sq=seq||{n:0};
  Object.keys(delta).sort().forEach(k=>{
    let d=delta[k];
    const mine=(rows||[]).filter(r=>r.project_id===projectId&&String(r.year_month)===k&&(S4||!/계산서없음/.test(String(r.cost_type||'')+String(r.memo||''))));
    if(mine.length){ const tot=mine.reduce((s,r)=>s+poN(r[amtKey]),0);
      if(Math.abs(tot-(beforeMonth[k]||0))>100) notes.push(`${k} ${label}: 청구 금액(${tot.toLocaleString()}원)이 견적 월 금액(${(beforeMonth[k]||0).toLocaleString()}원)과 달라 차액만큼만 바꿉니다.`); }
    const open=mine.filter(r=>!issued(r)), done=mine.filter(issued);
    if(d<0){                                                  // 증액
      const add=-d;
      if(open.length){ const r=open[open.length-1], sup=poN(r[amtKey]), after=sup+add;
        impacts.push({sheet:kind,key:r[idKey],month:k,action:'증액',before:sup,after,vat:S4?Math.round(after*0.1):(poN(r.vat_amt)>0?Math.round(after*0.1):0)}); return; }
      sq.n++; const id=pre+String(sq.n).padStart(3,'0'), plan=chgMonthEnd(k);
      const row=S4?{revenue_id:id,project_id:projectId,year_month:k,tax_invoice_amt:add,cash_recv_amt:Math.round(add*1.1),cash_recv_date:cycle==='기타'?plan:chgNextMonthEnd(k),is_received:'N',memo:'프로젝트 변경 추가 청구',vat_amt:Math.round(add*0.1),invoice_plan_date:plan,invoice_date:'',matched_txn_id:'',recv_actual_date:''}
        :{cost_id:id,project_id:projectId,year_month:k,cost_type:'외주비',person_name:'',unit_price:'',mm:'',amount:add,payment_date:chgNextMonthEnd(k),memo:'프로젝트 변경 추가 매입',vat_amt:Math.round(add*0.1),invoice_plan_date:plan,invoice_date:'',matched_txn_id:'',pay_actual_date:''};
      impacts.push({sheet:kind,key:id,month:k,action:'추가',before:0,after:add,row});
      if(done.length) notes.push(`${k} ${label}: 이미 발행(수취)된 달이라 늘어난 ${add.toLocaleString()}원은 새 청구 행으로 넣었습니다. 추가 세금계산서를 발행(수취)해 주세요.`);
      return; }
    if(!mine.length){ notes.push(`${k} ${label}: 청구 스케줄 행이 없어 건너뜁니다(감액 ${d.toLocaleString()}원).`); return; }
    for(const r of open){ if(d<=0) break; const sup=poN(r[amtKey]), take=Math.min(sup,d), after=sup-take; d-=take;
      impacts.push({sheet:kind,key:r[idKey],month:k,action:after>0?'감액':'삭제',before:sup,after,vat:S4?Math.round(after*0.1):(poN(r.vat_amt)>0?Math.round(after*0.1):0)}); }
    if(d>0&&done.length){
      amends.push({kind:label,month:k,ref:done.map(r=>r[idKey]).join(','),cut_amount:d,paid:done.some(paid),write_date:eff,due_date:chgDueDate(eff),done:false}); d=0; }
    if(d>0) notes.push(`${k} ${label}: 감액 ${d.toLocaleString()}원을 반영할 청구 행이 부족합니다.`);
  });
  return {impacts,amends,notes};
}
// ── 지급 스케줄(S15) ───────────────────────────────────────────────
// 변경 전·후 견적에서 각각 행을 만든다. 후에만 있으면 추가, 전·후 금액이 다르면 변경, 후에 없으면 삭제.
// 사용자가 직접 고친 다른 행은 건드리지 않는다. 지급완료·대사된 행은 바꾸지 않고 정산 필요 목록으로 안내. 확정 행은 실적이 아니므로 바꾼다.
function chgPlanPayout(existing,genBefore,genAfter){
  const ex=Object.fromEntries((existing||[]).map(r=>[r.payout_id,r])), gb=Object.fromEntries((genBefore||[]).map(g=>[g.payout_id,g])), ga=Object.fromEntries((genAfter||[]).map(g=>[g.payout_id,g]));
  const impacts=[], settle=[]; let confirmed=0;
  Object.keys(ga).sort().forEach(id=>{ if(ex[id]) return; const a=ga[id];
    impacts.push({sheet:'S15',key:id,action:'추가',month:a.year_month,pay_type:a.pay_type,person:a.person_name,before:0,after:poCash(a),row:a}); });
  (existing||[]).forEach(r=>{
    const b=gb[r.payout_id], a=ga[r.payout_id]; if(!b) return;       // 이 변경과 무관한 행
    const affected=!a||poAmtKeys.some(k=>poN(b[k])!==poN(a[k])); if(!affected) return;
    if(r.pay_actual_date||r.matched_txn_id){ settle.push({payout_id:r.payout_id,month:r.year_month,pay_type:r.pay_type,person:r.person_name,amount:poCash(r),new_amount:a?poCash(a):0}); return; }
    const conf=r.est_status==='확정'; if(conf) confirmed++;
    if(!a){ impacts.push({sheet:'S15',key:r.payout_id,action:'삭제',month:r.year_month,pay_type:r.pay_type,person:r.person_name,before:poCash(r),after:0,confirmed:conf}); return; }
    const pd=r.date_edited==='Y'?r.payment_date:a.payment_date;
    impacts.push({sheet:'S15',key:r.payout_id,action:'변경',month:r.year_month,pay_type:r.pay_type,person:r.person_name,before:poCash(r),after:poCash(a),confirmed:conf,
      fields:{...Object.fromEntries(poAmtKeys.map(k=>[k,a[k]])),payment_date:pd}});
  });
  impacts.sort((x,y)=>String(x.month).localeCompare(String(y.month))||String(x.person).localeCompare(String(y.person)));
  return {impacts,settle,confirmed};
}
// 사람별 잠긴 달 — 지급 스케줄에서 지급완료·대사된 행. {이름:{YYYY-MM:'지급완료'|'대사'}}
function chgLockedMonths(s15){
  const out={};
  (s15||[]).forEach(r=>{ if(!(r.pay_actual_date||r.matched_txn_id)) return;
    if(['원천세','4대보험'].includes(r.pay_type)) return;
    (out[r.person_name]=out[r.person_name]||{})[r.year_month]=r.pay_actual_date?'지급완료':'대사'; });
  return out;
}
// ── 견적 변경 목록(추가·수정·제외) ─────────────────────────────────────
const CHG_CMP=['item_name','grade','start_date','end_date','mm','unit_price','buy_price','amount','memo'];
const chgNum=v=>parseFloat(String(v??'').replace(/,/g,''))||0;
// 같은 내용인지 — 숫자는 값으로, 급여형 메모는 월별 값으로 비교한다(저장 모양이 달라도 내용이 같으면 같은 것)
function chgSame(a,b){
  const sal=chgIsSal(a)&&chgIsSal(b);
  return CHG_CMP.every(k=>{
    if(['mm','unit_price','buy_price','amount'].includes(k)) return Math.abs(chgNum(a[k])-chgNum(b[k]))<0.006;
    if(k==='memo'&&sal) return JSON.stringify(chgSalMap(a))===JSON.stringify(chgSalMap(b));
    return String(a[k]??'')===String(b[k]??''); });
}
// beforeLabor: 현재 견적 인건비 행, afterLabor: 화면의 변경 후 행(기존 행은 estimate_id 유지, 새 줄은 _new:true)
// allEstIds: 시트 전체 견적 ID(새 번호 계산용)
function chgEstOps(beforeLabor,afterLabor,allEstIds,pipelineId,today){
  const ops=[], ids=new Set(afterLabor.filter(r=>!r._new).map(r=>r.estimate_id));
  let n=(allEstIds||[]).reduce((m,id)=>Math.max(m,parseInt(String(id).replace(/\D/g,'').slice(-3))||0),0);
  const mk=(r)=>({match:{name:r.item_name,start:r.start_date,end:r.end_date}});
  afterLabor.forEach(a=>{
    if(a._new){ n++; const id=`EST-2026-${String(n).padStart(3,'0')}`; const {_new,estimate_id,...f}=a;
      ops.push({op:'add',estimate_id:id,item_name:a.item_name,pay:chgPayType(a),fields:{...f,pipeline_id:pipelineId,created_at:today||''},sell_before:0,sell_after:laborAmt(a,'unit_price'),buy_before:0,buy_after:laborAmt(a,'buy_price')});
      return; }
    const b=beforeLabor.find(x=>x.estimate_id===a.estimate_id); if(!b||chgSame(a,b)) return;
    const {estimate_id,...f}=a;
    ops.push({op:'update',estimate_id:a.estimate_id,item_name:a.item_name,pay:chgPayType(a),...mk(b),fields:f,sell_before:laborAmt(b,'unit_price'),sell_after:laborAmt(a,'unit_price'),buy_before:laborAmt(b,'buy_price'),buy_after:laborAmt(a,'buy_price')});
  });
  beforeLabor.forEach(b=>{ if(ids.has(b.estimate_id)) return;
    ops.push({op:'delete',estimate_id:b.estimate_id,item_name:b.item_name,pay:chgPayType(b),...mk(b),sell_before:laborAmt(b,'unit_price'),sell_after:0,buy_before:laborAmt(b,'buy_price'),buy_after:0}); });
  return ops;
}
// ── 전체 계획 ───────────────────────────────────────────────────────
// ctx: {project_id, span, items(S12 해당 사업기회 행), afterLabor(변경 후 인건비 행), allEstIds, today, newSpan, s04, s05, s15(해당 프로젝트 행), settings, cycle}
function chgPlan(ctx){
  const out={ok:false,error:'',blocks:[],notes:[],ops:[],itemsAfter:null,payout:{impacts:[],settle:[],confirmed:0},rev:{impacts:[],amends:[],notes:[]},cost:{impacts:[],amends:[],notes:[]},totals:null,prj:null,amends:[],effective:'',months:[],counts:null};
  const span=ctx.span||{}, items=(ctx.items||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY');
  const bl=items.filter(chgIsLabor).map(e=>({...e,start_date:e.start_date||span.start_date,end_date:e.end_date||span.end_date})), other=items.filter(e=>!chgIsLabor(e)), al=ctx.afterLabor||[];
  const ops=chgEstOps(bl,al,ctx.allEstIds,ctx.pipeline_id,ctx.today);
  if(!ops.length&&!(ctx.newSpan&&(ctx.newSpan.start_date!==span.start_date||ctx.newSpan.end_date!==span.end_date))){ out.error='바뀐 내용이 없습니다. 인력 줄이나 기간을 고친 뒤 미리보기를 눌러 주세요.'; return out; }
  const after=[...other,...al.map(a=>a._new?{...a,estimate_id:(ops.find(o=>o.op==='add'&&o.fields.item_name===a.item_name&&o.fields.start_date===a.start_date&&o.fields.end_date===a.end_date)||{}).estimate_id||'NEW'}:a)];
  out.ops=ops; out.itemsAfter=after;
  if(!al.length) out.notes.push('변경 후 인력이 한 명도 없습니다. 프로젝트 전체를 중단하는 경우라면 현행 포기·실주 처리 규칙을 먼저 확인해 주세요.');
  const tb=chgTotals(items), ta=chgTotals(after); out.totals={sell_before:tb.sell,sell_after:ta.sell,buy_before:tb.buy,buy_after:ta.buy,n_before:bl.length,n_after:al.length};
  const nsp=ctx.newSpan&&ctx.newSpan.start_date&&ctx.newSpan.end_date?ctx.newSpan:span;
  const sd=chgMonthDelta(items,after,'unit_price',span,null,nsp), bd=chgMonthDelta(items,after,'buy_price',span,e=>!poIsNonInvoice(e),nsp);
  const months=[...new Set([...Object.keys(sd.delta),...Object.keys(bd.delta)])].sort();
  const e0=months[0]; const eff0=e0?`${e0}-01`:(ctx.today||'');
  const seq4={n:(ctx.s04||[]).reduce((m,r)=>Math.max(m,parseInt(String(r.revenue_id||'').replace(/\D/g,'').slice(-3))||0),0)};
  const seq5={n:(ctx.s05||[]).reduce((m,r)=>Math.max(m,parseInt(String(r.cost_id||'').replace(/\D/g,'').slice(-3))||0),0)};
  out.rev=chgPlanBilling(ctx.s04,ctx.project_id,sd.delta,sd.before,'S04',eff0,seq4,ctx.cycle);
  out.cost=chgPlanBilling(ctx.s05,ctx.project_id,bd.delta,bd.before,'S05',eff0,seq5,ctx.cycle);
  const prjB={project_id:ctx.project_id,start_date:span.start_date,end_date:span.end_date}, prjA={project_id:ctx.project_id,start_date:nsp.start_date,end_date:nsp.end_date};
  const gB=poGenerate(prjB,items,ctx.settings||{}), gA=poGenerate(prjA,after,ctx.settings||{});
  if((ctx.s15||[]).length||gA.length) out.payout=chgPlanPayout(ctx.s15||[],gB,gA);
  if(!(ctx.s15||[]).length&&gB.length) out.notes.push('이 프로젝트는 지급 스케줄이 만들어져 있지 않았습니다. 지급 스케줄 행은 추가로 만들어지며, 자금수지는 견적을 직접 읽으므로 변경된 견적이 그대로 반영됩니다.');
  if((nsp.start_date!==span.start_date||nsp.end_date!==span.end_date)) out.prj={newStart:nsp.start_date,newEnd:nsp.end_date,oldStart:span.start_date,oldEnd:span.end_date};
  out.amends=[...out.rev.amends,...out.cost.amends];
  const pm=out.payout.impacts.map(i=>i.month).concat(out.payout.settle.map(i=>i.month));
  out.months=[...new Set([...months,...pm])].filter(Boolean).sort();
  out.effective=out.months.length?`${out.months[0]}-01`:(ctx.today||'');
  out.counts={add:ops.filter(o=>o.op==='add').length,update:ops.filter(o=>o.op==='update').length,del:ops.filter(o=>o.op==='delete').length};
  out.ok=true; return out;
}
// 영향 행 수(확인창용): 시트 수와 행 수
function chgCountRows(plan){
  const parts=[[plan.ops.length],[plan.payout.impacts.length],[plan.rev.impacts.length],[plan.cost.impacts.length],[plan.prj?2:0]];
  return {sheets:parts.filter(p=>p[0]>0).length,rows:parts.reduce((s,p)=>s+p[0],0)};
}
// ── 적용(순수): 시트에서 막 읽은 행에 "변경 후 값"을 지정한다. 여러 번 실행해도 같은 결과. ─────────────
// 반환 {rows, done, skipped, conflicts:[메시지]}
function chgApplyEstimate(rows,ops,pipelineId,today){
  let done=0; const conflicts=[], list=rows||[];
  const find=(o)=>{ let r=list.find(x=>x.estimate_id===o.estimate_id&&(!pipelineId||x.pipeline_id===pipelineId||!x.pipeline_id));
    if(!r&&o.match) r=list.find(x=>x.pipeline_id===pipelineId&&x.comp_type==='인건비'&&x.item_name===o.match.name&&x.start_date===o.match.start&&x.end_date===o.match.end);
    return r; };
  const del=new Set();
  (ops||[]).forEach(o=>{ const op=o.op||'update';
    if(op==='add'){
      const dup=list.find(x=>x.pipeline_id===pipelineId&&x.comp_type==='인건비'&&x.item_name===o.fields.item_name&&x.start_date===o.fields.start_date&&x.end_date===o.fields.end_date&&x.created_at===o.fields.created_at&&x.estimate_id===o.estimate_id);
      if(dup){ Object.assign(dup,o.fields); done++; return; }     // 이어서 적용 — 이미 넣은 줄
      let id=o.estimate_id; if(list.some(x=>x.estimate_id===id)){ const mx=list.reduce((m,x)=>Math.max(m,parseInt(String(x.estimate_id).replace(/\D/g,'').slice(-3))||0),0); id=`EST-2026-${String(mx+1).padStart(3,'0')}`; }
      list.push({...o.fields,estimate_id:id,pipeline_id:pipelineId,created_at:o.fields.created_at||today||''}); done++; return; }
    const r=find(o);
    if(op==='delete'){ if(r) del.add(r); done++; return; }       // 이미 지워졌으면 그대로(멱등)
    if(!r){ conflicts.push(`견적 행 ${o.estimate_id}(${o.item_name})을 찾지 못했습니다.`); return; }
    Object.assign(r,o.fields); done++; });
  let out=list.filter(r=>!del.has(r));
  if(pipelineId&&!out.some(r=>r.pipeline_id===pipelineId)){ const mx=out.reduce((m,x)=>Math.max(m,parseInt(String(x.estimate_id).replace(/\D/g,'').slice(-3))||0),0);
    out.push({estimate_id:`EST-2026-${String(mx+1).padStart(3,'0')}`,pipeline_id:pipelineId,comp_type:'_EMPTY',item_name:'',memo:'견적 항목 없음(의도적 삭제 표시)',created_at:today||''}); }
  else out=out.filter(r=>!(r.pipeline_id===pipelineId&&r.comp_type==='_EMPTY'&&out.some(x=>x.pipeline_id===pipelineId&&x.comp_type!=='_EMPTY')));
  return {rows:out,done,skipped:0,conflicts};
}
function chgApplyBilling(rows,kind,impacts){
  const S4=kind==='S04', idKey=S4?'revenue_id':'cost_id', amtKey=S4?'tax_invoice_amt':'amount';
  const issued=r=>!!r.invoice_date||(S4?r.is_received==='Y':!!r.pay_actual_date);
  let done=0,skipped=0; const conflicts=[], del=new Set(), list=rows||[];
  (impacts||[]).forEach(im=>{
    if(im.action==='추가'){
      const ex=list.find(x=>x[idKey]===im.key);
      if(ex){ if(ex.project_id===im.row.project_id&&String(ex.memo||'').startsWith('프로젝트 변경')){ Object.assign(ex,im.row); done++; return; }   // 이어서 적용
        const mx=list.reduce((m,x)=>Math.max(m,parseInt(String(x[idKey]).replace(/\D/g,'').slice(-3))||0),0); const pre=S4?'REV-2026-':'COST-2026-';
        list.push({...im.row,[idKey]:pre+String(mx+1).padStart(3,'0')}); done++; return; }
      list.push({...im.row}); done++; return; }
    const r=list.find(x=>x[idKey]===im.key);
    if(!r){ skipped++; return; }                                   // 이미 지워짐 — 다시 적용한 경우
    if(issued(r)){ conflicts.push(`${im.key}(${im.month}) 행이 미리보기 뒤에 발행(수취)·입금(지급)되어 바꾸지 않았습니다.`); return; }
    if(poN(r[amtKey])!==im.before&&poN(r[amtKey])!==im.after){ conflicts.push(`${im.key}(${im.month}) 금액이 미리보기 뒤에 바뀌어 건드리지 않았습니다.`); return; }
    if(im.action==='삭제'){ del.add(im.key); done++; return; }
    r[amtKey]=im.after; r.vat_amt=im.vat;
    if(S4) r.cash_recv_amt=Math.round(im.after*1.1);
    done++; });
  return {rows:list.filter(r=>!del.has(r[idKey])),done,skipped,conflicts};
}
function chgApplyPayout(rows,impacts){
  let done=0,skipped=0; const conflicts=[], del=new Set(), list=rows||[];
  (impacts||[]).forEach(im=>{
    if(im.action==='추가'){ const ex=list.find(x=>x.payout_id===im.key);
      if(ex){ if(ex.pay_actual_date||ex.matched_txn_id){ conflicts.push(`${im.key}(${im.month}) 행이 이미 지급·대사되어 바꾸지 않았습니다.`); return; } Object.assign(ex,im.row); done++; return; }
      list.push({...im.row}); done++; return; }
    const r=list.find(x=>x.payout_id===im.key);
    if(!r){ skipped++; return; }
    if(r.pay_actual_date||r.matched_txn_id){ conflicts.push(`${im.key}(${im.month}) 행이 미리보기 뒤에 지급·대사되어 바꾸지 않았습니다.`); return; }
    if(im.action==='삭제'){ del.add(im.key); done++; return; }
    Object.assign(r,im.fields); done++; });
  return {rows:list.filter(r=>!del.has(r.payout_id)),done,skipped,conflicts};
}
// 프로젝트 기간 — 사업기회(S01) 시작·종료 예정일, 프로젝트(S03) 시작·종료일을 변경 후 값으로. 이전(v3.9.0) 종료일 단축 건은 {newEnd}만 있고 현재가 더 늦을 때만 줄인다.
function chgApplyProject(pls,prjs,pipelineId,projectId,prj){
  let done=0; const pl=(pls||[]).find(p=>p.pipeline_id===pipelineId), pj=(prjs||[]).find(p=>p.project_id===projectId);
  if(prj.newStart===undefined){ const ne=prj.newEnd;
    if(pl&&pl.expected_end&&pl.expected_end>ne){ pl.expected_end=ne; done++; }
    if(pj&&pj.end_date&&pj.end_date>ne){ pj.end_date=ne; done++; }
    return {pls,prjs,done}; }
  if(pl){ if(prj.newStart&&pl.expected_start!==prj.newStart){ pl.expected_start=prj.newStart; done++; } if(prj.newEnd&&pl.expected_end!==prj.newEnd){ pl.expected_end=prj.newEnd; done++; } }
  if(pj){ if(prj.newStart&&pj.start_date!==prj.newStart){ pj.start_date=prj.newStart; done++; } if(prj.newEnd&&pj.end_date!==prj.newEnd){ pj.end_date=prj.newEnd; done++; } }
  return {pls,prjs,done};
}
// ── 변경 건(S18) 기록 ─────────────────────────────────────────────
function chgNextId(rows,year){
  const pre=`CHG-${year}-`; let mx=0;
  (rows||[]).forEach(r=>{ const id=String(r.change_id||''); if(id.startsWith(pre)){ const n=parseInt(id.slice(pre.length),10)||0; if(n>mx) mx=n; } });
  return pre+String(mx+1).padStart(3,'0');
}
const CHG_JSON_LIMIT=45000; // 구글 시트 한 칸 5만 자 한도보다 작게
function chgSummary(plan){ const c=plan.counts||{add:0,update:0,del:0}; return [c.add?`추가 ${c.add}`:'',c.update?`수정 ${c.update}`:'',c.del?`제외 ${c.del}`:'',plan.prj?'기간 변경':''].filter(Boolean).join(' · ')||'변경'; }
function chgRecord(plan,meta){
  const impact={est:plan.ops,payout:plan.payout.impacts,settle:plan.payout.settle,rev:plan.rev.impacts,cost:plan.cost.impacts,prj:plan.prj};
  const impact_json=JSON.stringify(impact), amend_json=JSON.stringify(plan.amends);
  if(impact_json.length>CHG_JSON_LIMIT||amend_json.length>CHG_JSON_LIMIT) throw new Error('영향받는 행이 너무 많아 한 건으로 기록할 수 없습니다. 인력별로 나누어 처리해 주세요.');
  return {change_id:meta.change_id,project_id:meta.project_id,pipeline_id:meta.pipeline_id,change_type:CHG_TYPE_NEW,
    target_item:chgSummary(plan),effective_date:plan.effective,
    reason_code:'',reason_memo:meta.reason_memo||'',status:'적용중',steps_done:'',impact_json,amend_json,
    sell_before:plan.totals.sell_before,sell_after:plan.totals.sell_after,buy_before:plan.totals.buy_before,buy_after:plan.totals.buy_after,created_at:meta.created_at};
}
