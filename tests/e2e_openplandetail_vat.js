// tests/e2e_openplandetail_vat.js — "N월 계획출금 구성" 팝업(openPlanDetail)의 VAT 이중계산 결함(v2.9.48) 회귀.
// 배경: v2.9.43에서 계산서없음 매입(NOINV-, 이미 VAT 없는 순수 금액)에 무조건 ×1.1을 곱하던 결함을
// 4곳(openDetailModal, renderPlanAct, 대시보드 배지) 수정했다고 판단했으나, 실제 사용자가 매번
// 보는 화면인 이 팝업(대시보드 "N월" 클릭 시 뜨는 "N월 계획출금 구성 (지급예정일 기준·VAT 포함)")
// 하나를 완전히 놓쳤다. 사용자가 실제 화면 스크린샷 3장(8·9·10월)을 첨부하고 "부산은행 숫자가
// 정확히 1.1배로 부풀려져 있다"고 정확히 짚어서야 발견 — v2.9.43 수정 당시 이 팝업을 검증하지
// 않았던 것이 근본 원인(원칙37: "결함 패턴을 고쳤다"는 판단은 그 패턴이 나타나는 모든 화면을
// 실제로 하나씩 열어본 뒤에만 성립한다).
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_openplandetail_vat');

  // ── 세금계산서형 + 계산서없음이 혼재된 상황에서 "N월 계획출금 구성" 팝업이 정확히 계산 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S06_FIXED_COST: [['fixed_id']], S08_DETAIL: [['txn_id']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-1','2026-08','외주비','','','','7000000','2026-09-30','','700000','2026-08-31','2026-08-31','','']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S10_SETTINGS: [['setting_key']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','프리랜서','고급','','','10000000','8000000','','1','2026-08-01','2026-08-31','사업소득형','']],
      S03_PROJECT_REAL: null,
    };
    // S03_PROJECT는 PRJ-1과 PL-1을 함께 등록해야 함
    sheetData.S03_PROJECT = [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
      ['PRJ-1','PL-1','테스트','고객','30000000','2026-08-01','2026-08-31','수주']];
    sheetData.S01_PIPELINE = [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
      ['PL-1','x','고객','','80','30000000','2026-08-01','2026-08-31','기타','수주','','','인력공급']];
    const { dom } = await openPage(ROOT, portFor('openplan-vat-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    // 계산서없음 매입은 익월 10일 지급(v2.9.46) → 2026-09-10
    w.eval("openPlanDetail('2026-09','out')");
    const html = d.getElementById('planModalBody').innerHTML;
    s.check(html.includes('8,000,000원'),
      'v2.9.48: 계산서없음 매입(견적 8,000,000원)이 "N월 계획출금 구성" 팝업에서 VAT 없이 정확히 표시됨');
    s.check(!html.includes('8,800,000원'),
      'v2.9.48: 계산서없음 매입에 VAT 10%가 잘못 더해진 값(8,800,000원)이 나타나지 않음');
    s.check(html.includes('(계산서없음)'),
      'v2.9.48: 계산서없음 매입 항목에 구분 라벨이 정확히 표시됨');
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
