// HFC change.js v3.9.0 — 프로젝트 변경(인력 철수·종료일 단축) 도메인 계산(SSOT, DOM 무관 순수 함수)
// 근거: 프로젝트 변경(철수) 설계서 v0.2(승인 2026-11-12). 의존: calc.js(mmTotal·laborAmt·monthlyProfile·pad2), payout.js(poGenerate·poIsNonInvoice·poN·poAmtKeys·poCash)
// 원칙: ① 발행·수취·입금·지급·대사된 건은 바꾸지 않는다 ② 효력일 이전은 그대로, 이후만 다시 계산 ③ 적용은 "변경 후 값"을 지정하므로 다시 해도 같은 결과(멱등)
const CHG_TYPES=['인력철수','종료일단축'];
const CHG_REASONS_DEFAULT=['고객 요청','성과 사유','본인 사정','예산 축소','기타'];
const CHG_STEPS=['견적','지급스케줄','매출','매입','프로젝트','이력'];
const chgYm=d=>String(d||'').slice(0,7);
const chgIsDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!isNaN(new Date(s));
const chgLastDay=ym=>{ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); };
// 수정세금계산서 발급 기한 — 변동 사유가 발생한 날이 속하는 달의 다음 달 10일
const chgDueDate=eff=>{ const [y,m]=chgYm(eff).split('-').map(Number); const d=new Date(y,m,10); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-10`; };
const chgIsSal=r=>String(r&&r.memo||'').startsWith('급여형');

// ── 급여형 월별 JSON ────────────────────────────────────────────────
function chgSalaryObj(memo){ const part=String(memo||'').split('|').slice(1).join('|'); let o={}; if(part){ try{ o=JSON.parse(part)||{}; }catch(e){ o={}; } } return o; }
// 효력월 급여 제안값 — 기존 효력월 금액을 (효력일 ÷ 그 달 일수)로 일할. 말일이면 그대로. 급여대장 값으로 고쳐 쓰도록 「추정」으로 둔다.
function chgSalarySuggest(row,eff){
  const ym=chgYm(eff), dim=chgLastDay(ym), day=+String(eff).slice(8,10), f=day>=dim?1:day/dim;
  const o=chgSalaryObj(row.memo), d=o._d&&o._d[ym], sc=v=>Math.round(poN(v)*f);
  if(d) return {g:sc(d.g),w:sc(d.w),i:sc(d.i),e:sc(d.e),s:'추정'};
  return {g:sc(o[ym]),w:0,i:0,e:0,s:'추정'};
}
// ── 견적 인건비 행 1건의 종료일을 effective 로 줄인 새 행 ─────────────────
function chgValidateCut(row,eff,span){
  const st=row.start_date||span.start_date, en=row.end_date||span.end_date;
  if(!chgIsDate(eff)) return '마지막 근무일을 날짜(YYYY-MM-DD)로 입력해 주세요.';
  if(!st||!en) return '견적에 투입 시작·종료일이 없어 처리할 수 없습니다. 견적에서 기간을 먼저 입력해 주세요.';
  if(eff<st) return `마지막 근무일이 투입 시작일(${st})보다 빠릅니다. 투입 전 철수는 견적에서 행을 지워 주세요.`;
  if(eff>=en) return `마지막 근무일이 현재 종료일(${en}) 이후입니다. 이 기능은 종료일을 앞당기는 변경만 처리합니다.`;
  return '';
}
function chgCutRow(row,eff,span,sal){
  const st=row.start_date||span.start_date, n={...row,start_date:st,end_date:eff}, ym=chgYm(eff);
  n.mm=parseFloat(mmTotal(st,eff))||0;
  if(chgIsSal(row)){
    const o=chgSalaryObj(row.memo);
    Object.keys(o).forEach(k=>{ if(/^\d{4}-\d{2}$/.test(k)&&k>ym) delete o[k]; });
    if(o._d){ Object.keys(o._d).forEach(k=>{ if(k>ym) delete o._d[k]; }); }
    const s=sal||chgSalarySuggest(row,eff);
    o._d=o._d||{}; o._d[ym]={g:poN(s.g),w:poN(s.w),i:poN(s.i),e:poN(s.e),s:s.s||'추정'};
    o[ym]=poN(s.g)+poN(s.e);
    if(!Object.keys(o._d).length) delete o._d;
    n.buy_price=Object.keys(o).filter(k=>/^\d{4}-\d{2}$/.test(k)).reduce((a,k)=>a+poN(o[k]),0);
    n.memo='급여형|'+JSON.stringify(o);
  }
  n.amount=laborAmt(n,'unit_price');
  return n;
}
const CHG_EST_FIELDS=['start_date','end_date','mm','amount','buy_price','memo'];
const chgPick=(o,ks)=>Object.fromEntries(ks.map(k=>[k,o[k]]));
// 견적 합계(공급가) — 인건비는 laborAmt, 기타는 수량×단가. 급여형 매입은 buy_price(월별 합계 총액) 그대로.
function chgTotals(items){
  const it=(items||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY');
  const sell=it.reduce((s,e)=>s+(e.comp_type==='인건비'?laborAmt(e,'unit_price'):(poN(e.qty)||1)*poN(e.unit_price)),0);
  const buy=it.reduce((s,e)=>s+(e.comp_type==='인건비'?laborAmt(e,'buy_price'):(poN(e.qty)||1)*poN(e.buy_price)),0);
  return {sell:Math.round(sell),buy:Math.round(buy)};
}
// 월별 계획 금액 차이(변경 전 − 변경 후, 양수=감액)
function chgMonthDelta(before,after,field,span,filterFn){
  const f=filterFn||(()=>true), clean=a=>(a||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY'&&f(e));
  const b=monthlyProfile(clean(before),field,span.start_date,span.end_date), a=monthlyProfile(clean(after),field,span.start_date,span.end_date);
  const keys=[...new Set([...Object.keys(b),...Object.keys(a)])].sort(), delta={}, bm={};
  keys.forEach(k=>{ const bv=Math.round(b[k]||0), av=Math.round(a[k]||0); bm[k]=bv; if(bv!==av) delta[k]=bv-av; });
  return {delta,before:bm};
}
// ── 청구 스케줄(S04 매출 / S05 매입 계산서형) ───────────────────────────
// 발행(수취)·입금(지급)된 행은 건드리지 않고 수정세금계산서 목록으로 안내한다. 미발행 행만 감액·삭제한다.
function chgPlanBilling(rows,projectId,delta,beforeMonth,kind,eff){
  const S4=kind==='S04', idKey=S4?'revenue_id':'cost_id', amtKey=S4?'tax_invoice_amt':'amount', label=S4?'매출':'매입';
  const issued=r=>!!r.invoice_date||(S4?r.is_received==='Y':!!r.pay_actual_date);
  const paid=r=>S4?r.is_received==='Y':!!r.pay_actual_date;
  const impacts=[], amends=[], notes=[];
  Object.keys(delta).sort().forEach(k=>{
    let d=delta[k];
    if(d<0){ notes.push(`${k} ${label} 계획이 늘어난 달(${d.toLocaleString()}원)은 자동으로 바꾸지 않았습니다.`); return; }
    const mine=(rows||[]).filter(r=>r.project_id===projectId&&String(r.year_month)===k&&(S4||!/계산서없음/.test(String(r.cost_type||'')+String(r.memo||''))));
    if(!mine.length){ notes.push(`${k} ${label}: 청구 스케줄 행이 없어 건너뜁니다(감액 ${d.toLocaleString()}원).`); return; }
    const tot=mine.reduce((s,r)=>s+poN(r[amtKey]),0);
    if(Math.abs(tot-(beforeMonth[k]||0))>100) notes.push(`${k} ${label}: 청구 금액(${tot.toLocaleString()}원)이 견적 월 금액(${(beforeMonth[k]||0).toLocaleString()}원)과 달라 차액만큼만 줄입니다.`);
    const open=mine.filter(r=>!issued(r)), done=mine.filter(issued);
    for(const r of open){ if(d<=0) break; const sup=poN(r[amtKey]), take=Math.min(sup,d), after=sup-take; d-=take;
      impacts.push({sheet:kind,key:r[idKey],month:k,action:after>0?'감액':'삭제',before:sup,after,vat:S4?Math.round(after*0.1):(poN(r.vat_amt)>0?Math.round(after*0.1):0)}); }
    if(d>0&&done.length){
      amends.push({kind:label,month:k,ref:done.map(r=>r[idKey]).join(','),cut_amount:d,paid:done.some(paid),write_date:eff,due_date:chgDueDate(eff),done:false}); d=0; }
    if(d>0) notes.push(`${k} ${label}: 감액 ${d.toLocaleString()}원을 반영할 청구 행이 부족합니다.`);
  });
  return {impacts,amends,notes};
}
// ── 지급 스케줄(S15) ───────────────────────────────────────────────
// 변경 전·후 견적에서 각각 행을 만들어, 금액이 달라지거나 사라지는 행만 대상으로 한다(사용자가 직접 고친 다른 행은 건드리지 않음).
// 지급완료·대사된 행은 바꾸지 않고 정산 필요 목록으로 안내한다. 확정 행은 실적이 아니므로 바꾼다.
function chgPlanPayout(existing,genBefore,genAfter,eff){
  const effYm=chgYm(eff), gb=Object.fromEntries((genBefore||[]).map(g=>[g.payout_id,g])), ga=Object.fromEntries((genAfter||[]).map(g=>[g.payout_id,g]));
  const impacts=[], settle=[]; let confirmed=0;
  (existing||[]).forEach(r=>{
    if(String(r.year_month)<effYm) return;
    const b=gb[r.payout_id], a=ga[r.payout_id]; if(!b) return;       // 이 변경과 무관한 행
    const affected=!a||poAmtKeys.some(k=>poN(b[k])!==poN(a[k])); if(!affected) return;
    if(r.pay_actual_date||r.matched_txn_id){ settle.push({payout_id:r.payout_id,month:r.year_month,pay_type:r.pay_type,person:r.person_name,amount:poCash(r),new_amount:a?poCash(a):0}); return; }
    const conf=r.est_status==='확정'; if(conf) confirmed++;
    if(!a){ impacts.push({sheet:'S15',key:r.payout_id,action:'삭제',month:r.year_month,pay_type:r.pay_type,person:r.person_name,before:poCash(r),after:0,confirmed:conf}); return; }
    const pd=r.date_edited==='Y'?r.payment_date:a.payment_date;
    impacts.push({sheet:'S15',key:r.payout_id,action:'변경',month:r.year_month,pay_type:r.pay_type,person:r.person_name,before:poCash(r),after:poCash(a),confirmed:conf,
      fields:{...chgPick(a,poAmtKeys),payment_date:pd}});
  });
  return {impacts,settle,confirmed};
}
// ── 전체 계획 ───────────────────────────────────────────────────────
// ctx: {type, estimate_id, effective, newEnd, salary:{estimate_id:{g,w,i,e,s}}, span:{start_date,end_date}, project_id, items(S12 해당 사업기회 행), s04, s05, s15(해당 프로젝트 행), settings}
function chgPlan(ctx){
  const out={ok:false,error:'',blocks:[],notes:[],estChanges:[],itemsAfter:null,payout:{impacts:[],settle:[],confirmed:0},rev:{impacts:[],amends:[],notes:[]},cost:{impacts:[],amends:[],notes:[]},totals:null,prj:null,amends:[],effective:''};
  const span=ctx.span||{}, items=(ctx.items||[]).filter(e=>e.comp_type&&e.comp_type!=='_EMPTY');
  const cuts=[]; // [{row, eff}]
  if(ctx.type==='인력철수'){
    const row=items.find(e=>e.estimate_id===ctx.estimate_id&&e.comp_type==='인건비');
    if(!row){ out.error='철수할 인력을 선택해 주세요.'; return out; }
    const err=chgValidateCut(row,ctx.effective,span); if(err){ out.error=err; return out; }
    cuts.push({row,eff:ctx.effective}); out.effective=ctx.effective;
  } else if(ctx.type==='종료일단축'){
    const ne=ctx.newEnd;
    if(!chgIsDate(ne)){ out.error='새 종료일을 날짜(YYYY-MM-DD)로 입력해 주세요.'; return out; }
    if(!span.end_date||ne>=span.end_date){ out.error=`새 종료일은 현재 종료일(${span.end_date||'없음'})보다 앞서야 합니다.`; return out; }
    if(span.start_date&&ne<span.start_date){ out.error=`새 종료일이 프로젝트 시작일(${span.start_date})보다 빠릅니다.`; return out; }
    out.effective=ne;
    items.forEach(e=>{
      const en=e.end_date||span.end_date, st=e.start_date||span.start_date;
      if(e.comp_type==='인건비'){
        if(en&&en>ne){ if(st&&st>ne) out.blocks.push(`「${e.item_name}」은 시작일(${st})이 새 종료일 이후입니다. 견적에서 이 행을 직접 지워 주세요.`); else cuts.push({row:e,eff:ne}); }
      } else if(e.end_date&&e.end_date>ne) out.notes.push(`「${e.item_name}」(${e.comp_type}) 항목은 종료일이 ${e.end_date}입니다. 금액을 임의로 바꿀 수 없어 그대로 두었습니다. 필요하면 견적에서 직접 고쳐 주세요.`);
    });
    if(!cuts.length&&!out.blocks.length){ out.error='새 종료일 이후까지 이어지는 인건비 행이 없습니다.'; return out; }
    out.prj={newEnd:ne};
  } else { out.error='변경 유형을 선택해 주세요.'; return out; }
  if(out.blocks.length){ out.error='처리할 수 없는 항목이 있습니다.'; return out; }

  const after=items.map(e=>{ const c=cuts.find(x=>x.row.estimate_id===e.estimate_id); return c?chgCutRow(e,c.eff,span,chgIsSal(e)?((ctx.salary||{})[e.estimate_id]||null):null):e; });
  out.itemsAfter=after;
  cuts.forEach(c=>{ const n=after.find(x=>x.estimate_id===c.row.estimate_id);
    out.estChanges.push({estimate_id:c.row.estimate_id,item_name:c.row.item_name,pay:chgIsSal(c.row)?'급여형':(String(c.row.memo||'').startsWith('사업소득형')?'사업소득형':'세금계산서형'),eff:c.eff,
      sell_before:laborAmt(c.row,'unit_price'),sell_after:laborAmt(n,'unit_price'),buy_before:laborAmt(c.row,'buy_price'),buy_after:laborAmt(n,'buy_price'),
      fields:chgPick(n,CHG_EST_FIELDS),sal:chgIsSal(c.row)?((n.memo&&chgSalaryObj(n.memo)._d||{})[chgYm(c.eff)]||null):null}); });

  const tb=chgTotals(items), ta=chgTotals(after); out.totals={sell_before:tb.sell,sell_after:ta.sell,buy_before:tb.buy,buy_after:ta.buy};
  const eff=out.effective;
  const sd=chgMonthDelta(items,after,'unit_price',span), bd=chgMonthDelta(items,after,'buy_price',span,e=>!poIsNonInvoice(e));
  out.rev=chgPlanBilling(ctx.s04,ctx.project_id,sd.delta,sd.before,'S04',eff);
  out.cost=chgPlanBilling(ctx.s05,ctx.project_id,bd.delta,bd.before,'S05',eff);
  const prjX={project_id:ctx.project_id,start_date:span.start_date,end_date:span.end_date};
  if((ctx.s15||[]).length) out.payout=chgPlanPayout(ctx.s15,poGenerate(prjX,items,ctx.settings||{}),poGenerate(prjX,after,ctx.settings||{}),eff);
  else out.notes.push('이 프로젝트는 지급 스케줄이 만들어져 있지 않습니다. 자금수지는 견적을 직접 읽으므로 변경된 견적이 그대로 반영됩니다.');
  out.amends=[...out.rev.amends,...out.cost.amends];
  out.ok=true; return out;
}
// ── 적용(순수): 시트에서 막 읽은 행에 "변경 후 값"을 지정한다. 여러 번 실행해도 같은 결과. ─────────────
// 반환 {rows, done, skipped, conflicts:[메시지]}
function chgApplyEstimate(rows,estChanges){
  let done=0; const conflicts=[];
  (estChanges||[]).forEach(c=>{ const r=(rows||[]).find(x=>x.estimate_id===c.estimate_id);
    if(!r){ conflicts.push(`견적 행 ${c.estimate_id}(${c.item_name})을 찾지 못했습니다.`); return; }
    Object.assign(r,c.fields); done++; });
  return {rows,done,skipped:0,conflicts};
}
function chgApplyBilling(rows,kind,impacts){
  const S4=kind==='S04', idKey=S4?'revenue_id':'cost_id', amtKey=S4?'tax_invoice_amt':'amount';
  const issued=r=>!!r.invoice_date||(S4?r.is_received==='Y':!!r.pay_actual_date);
  let done=0,skipped=0; const conflicts=[], del=new Set();
  (impacts||[]).forEach(im=>{ const r=(rows||[]).find(x=>x[idKey]===im.key);
    if(!r){ skipped++; return; }                                   // 이미 지워짐 — 다시 적용한 경우
    if(issued(r)){ conflicts.push(`${im.key}(${im.month}) 행이 미리보기 뒤에 발행(수취)·입금(지급)되어 바꾸지 않았습니다.`); return; }
    if(poN(r[amtKey])!==im.before&&poN(r[amtKey])!==im.after){ conflicts.push(`${im.key}(${im.month}) 금액이 미리보기 뒤에 바뀌어 건드리지 않았습니다.`); return; }
    if(im.action==='삭제'){ del.add(im.key); done++; return; }
    r[amtKey]=im.after; r.vat_amt=im.vat;
    if(S4) r.cash_recv_amt=Math.round(im.after*1.1);
    done++; });
  return {rows:(rows||[]).filter(r=>!del.has(r[idKey])),done,skipped,conflicts};
}
function chgApplyPayout(rows,impacts){
  let done=0,skipped=0; const conflicts=[], del=new Set();
  (impacts||[]).forEach(im=>{ const r=(rows||[]).find(x=>x.payout_id===im.key);
    if(!r){ skipped++; return; }
    if(r.pay_actual_date||r.matched_txn_id){ conflicts.push(`${im.key}(${im.month}) 행이 미리보기 뒤에 지급·대사되어 바꾸지 않았습니다.`); return; }
    if(im.action==='삭제'){ del.add(im.key); done++; return; }
    Object.assign(r,im.fields); done++; });
  return {rows:(rows||[]).filter(r=>!del.has(r.payout_id)),done,skipped,conflicts};
}
// 종료일 단축 — 사업기회(S01) 종료 예정일, 프로젝트(S03) 종료일을 새 종료일로(현재가 더 늦은 경우만)
function chgApplyProject(pls,prjs,pipelineId,projectId,newEnd){
  let done=0;
  const pl=(pls||[]).find(p=>p.pipeline_id===pipelineId); if(pl&&pl.expected_end&&pl.expected_end>newEnd){ pl.expected_end=newEnd; done++; }
  const pj=(prjs||[]).find(p=>p.project_id===projectId); if(pj&&pj.end_date&&pj.end_date>newEnd){ pj.end_date=newEnd; done++; }
  return {pls,prjs,done};
}
// ── 변경 건(S18) 기록 ─────────────────────────────────────────────
function chgNextId(rows,year){
  const pre=`CHG-${year}-`; let mx=0;
  (rows||[]).forEach(r=>{ const id=String(r.change_id||''); if(id.startsWith(pre)){ const n=parseInt(id.slice(pre.length),10)||0; if(n>mx) mx=n; } });
  return pre+String(mx+1).padStart(3,'0');
}
const CHG_JSON_LIMIT=45000; // 구글 시트 한 칸 5만 자 한도보다 작게
function chgRecord(plan,meta){
  const impact={est:plan.estChanges.map(c=>({estimate_id:c.estimate_id,item_name:c.item_name,fields:c.fields})),
    payout:plan.payout.impacts,settle:plan.payout.settle,rev:plan.rev.impacts,cost:plan.cost.impacts,prj:plan.prj};
  const impact_json=JSON.stringify(impact), amend_json=JSON.stringify(plan.amends);
  if(impact_json.length>CHG_JSON_LIMIT||amend_json.length>CHG_JSON_LIMIT) throw new Error('영향받는 행이 너무 많아 한 건으로 기록할 수 없습니다. 인력별로 나누어 처리해 주세요.');
  return {change_id:meta.change_id,project_id:meta.project_id,pipeline_id:meta.pipeline_id,change_type:meta.type,
    target_item:meta.type==='인력철수'?(plan.estChanges[0]&&plan.estChanges[0].item_name||''):'',effective_date:plan.effective,
    reason_code:meta.reason_code||'',reason_memo:meta.reason_memo||'',status:'적용중',steps_done:'',impact_json,amend_json,
    sell_before:plan.totals.sell_before,sell_after:plan.totals.sell_after,buy_before:plan.totals.buy_before,buy_after:plan.totals.buy_after,created_at:meta.created_at};
}
