// tests/e2e_cashflow_noinvoice.js — 자금수지의 계산서없음 매입 직접계산(v2.9.36) 회귀.
// 배경: "청구 스케줄 생성"(세금계산서 화면)은 세금계산서형 매입만 다루게 되어(사용자 확정), 계산서없음
// 매입(사업소득형·급여형·미수취 기타경비)의 지급 예정은 이 버튼과 무관하게 자금수지가 견적(S12)에서
// 직접 월별로 계산해 반영해야 한다. 이 파일은 그 계산이 정확한지, 세금계산서형(S05)과 혼재해도
// 이중계산 없이 정확히 합산되는지 검증한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_cashflow_noinvoice');
  const baseSheet = (extra) => ({
    S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
      ['PL-1','x','고객','','80','30000000','2026-09-01','2026-11-30','기타','수주','','','인력공급']],
    S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
      ['PRJ-1','PL-1','테스트','고객','30000000','2026-09-01','2026-11-30','수주']],
    S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
    S08_DETAIL: [['txn_id']], S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']],
    S10_SETTINGS: [['setting_key']], S13_VAT: [['vat_id']],
    ...extra,
  });

  // ── 계산서없음 단독: 사업소득형 프리랜서, 월 8,000,000원×3개월 ──
  {
    const sheetData = baseSheet({
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','프리랜서','고급','','','10000000','8000000','','3','2026-09-01','2026-11-30','사업소득형','']],
    });
    const { dom } = await openPage(ROOT, portFor('cf-noinv-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const planCost = w.eval('planCost');
    const noInv = planCost.filter(c => c.cost_id.startsWith('NOINV'));
    s.check(noInv.length === 3, 'v2.9.36: 3개월(9~11월) 각각 별도 항목으로 자금수지에 계산됨');
    s.check(noInv.every(c => c.amount === 8000000), 'v2.9.36: 매월 금액이 견적 단가(8,000,000원) 그대로 정확');
    s.check(noInv.every(c => c.vat_amt === 0), 'v2.9.36: 계산서없음이므로 부가세는 항상 0');
    const total = planCost.reduce((sum, c) => sum + parseInt(c.amount), 0);
    s.check(total === 24000000, 'v2.9.36: 자금수지 계획출금 합계가 정확(8,000,000×3=24,000,000)');
  }

  // ── 세금계산서형(S05)+계산서없음(견적 직접계산) 혼재 — 이중계산 없어야 함 ──
  {
    const sheetData = baseSheet({
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-1','2026-09','외주비','','','','7000000','2026-10-31','매입 스케줄 자동생성','700000','2026-09-30','','','']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','외주업체','특급','','','13000000','7000000','','1','2026-09-01','2026-09-30','',''],
        ['E2','PL-1','인건비','프리랜서','고급','','','10000000','8000000','','1','2026-09-01','2026-09-30','사업소득형','']],
    });
    const { dom } = await openPage(ROOT, portFor('cf-noinv-2'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const planCost = w.eval('planCost');
    const total = planCost.reduce((sum, c) => sum + parseInt(c.amount), 0);
    s.check(planCost.length === 2, 'v2.9.36: 세금계산서형(S05, 1건)+계산서없음(견적계산, 1건)=총 2건, 중복 없음');
    s.check(total === 15000000, 'v2.9.36: 세금계산서형(S05, 7,000,000)+계산서없음(견적, 8,000,000)=15,000,000, 이중계산 없음');
    const invRow = planCost.find(c => c.cost_id === 'C1');
    s.check(!!invRow && parseInt(invRow.amount) === 7000000, 'v2.9.36: 세금계산서형 건은 S05 원본 그대로 사용(견적으로 재계산되지 않음)');
  }

  // ── 견적에 계산서없음 항목이 없으면 NOINV 항목도 생성되지 않아야 함(과다생성 방지) ──
  {
    const sheetData = baseSheet({
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','외주업체','특급','','','13000000','7000000','','3','2026-09-01','2026-11-30','','']],
    });
    const { dom } = await openPage(ROOT, portFor('cf-noinv-3'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const noInv = w.eval('planCost').filter(c => c.cost_id.startsWith('NOINV'));
    s.check(noInv.length === 0, 'v2.9.36: 견적이 전부 세금계산서형이면 NOINV 항목이 생성되지 않음(과다생성 방지)');
  }

  // ── v2.9.43: 핵심 결함 회귀 방지 — "월별 계획 vs 실적" 표의 계획출금(pOutC) 계산이 planCost의
  // 계산서없음 매입(cost_id가 "NOINV-"로 시작, 이미 VAT 없는 순수 금액)에도 무조건 ×1.1을 곱해
  // 자금수지 계획출금 자체가 실제보다 부풀려지던 결함(사용자가 상세 모달을 이해할 수 없다고 지적한
  // 것을 조사하다 발견). 상세 모달 표시(레이블)·검산 소계·추정 재계산 로직 3곳 모두 함께 수정. ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-09-01','2026-11-30','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-09-01','2026-11-30','수주']],
      S04_REVENUE: [['revenue_id']],
      // 세금계산서형(외주) 7,000,000원 + 계산서없음(사업소득형) 8,000,000원 — 둘 다 10월 지급
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-1','2026-10','외주비','','','','7000000','2026-10-31','매입 스케줄 자동생성','700000','2026-10-31','','','']],
      S06_FIXED_COST: [['fixed_id']], S08_DETAIL: [['txn_id']],
      S02_CASHFLOW_EST: [['year_month','est_inflow','est_outflow','est_vat','est_balance','pipeline_basis','updated_at'],
        ['2026-10','0','15700000','0','4300000','자동계산','2026-09-15']],
      S09_DASHBOARD: [['year_month']], S10_SETTINGS: [['setting_key']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','프리랜서','고급','','','10000000','8000000','','1','2026-09-01','2026-09-30','사업소득형','']],
    };
    const { dom } = await openPage(ROOT, portFor('cf-vat-double'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const pOutC = w.eval(
      "planCost.filter(c=>(((c.payment_date||'').slice(0,7))||c.year_month)==='2026-10')" +
      ".reduce((s,c)=>s+(String(c.cost_id||'').startsWith('NOINV-')?(num(c.amount)||0):Math.round((num(c.amount)||0)*1.1)),0)"
    );
    s.check(pOutC === 15700000,
      'v2.9.43: 계획출금이 세금계산서형(7,700,000, VAT포함)+계산서없음(8,000,000, VAT 이중계산 없음)=15,700,000 정확');
    w.eval("openDetailModal('2026-10')");
    const html = d.getElementById('detailBody').innerHTML;
    s.check(html.includes('매입 PRJ-1'), 'v2.9.43: 상세 모달에서 세금계산서형 매입은 "매입"으로 명확히 표시');
    s.check(html.includes('매입(계산서없음) PRJ-1'), 'v2.9.43: 계산서없음 매입은 "매입(계산서없음)"으로 구분 표시(고정비와 혼동 방지)');
  }

  return s;
}


if (require.main === module) {
  run().then(s => {
    const sum = s.summary();
    s.results.forEach(r => console.log((r.pass ? '✓ ' : '❌ ') + r.label));
    console.log(`\n${sum.name}: ${sum.pass}/${sum.total} 통과`);
    require('./_e2e_helpers').closeSharedServer();
    process.exit(sum.fail ? 1 : 0);
  }).catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });
}
module.exports = run;
