// tests/e2e_detail_modal_redesign.js — "N월 상세" 팝업(openDetailModal) 근본 재설계(v2.9.55) 회귀.
// 배경: 사용자 지적 — "법인카드가 두번 나오는거도 오류인거 같고, 이 보고서가 보여주려고 했던
// 양식 목표가 사라진 듯 해." v2.9.54는 8개 고정 버킷을 없애면서 통장 실적을 단순 나열만 하게
// 됐는데, 이 화면의 원래 목적("추정과 실제 잔액의 차이가 왜 발생했는지 설명")을 놓쳤다. 같은
// 유형명이 입금·출금 양쪽에 있으면(예: 법인카드 환급 입금 + 카드값 결제 출금) 라벨 구분 없이
// 같은 이름이 두 번 나와 혼란스러웠다. v2.9.55: 매출 입금·매입 지급은 그 달 계획(planRev·
// planCost) 대비 실적으로, 고정비 세부 항목은 계획(planFix) 대비 실적으로 비교해 보여주고,
// 입금·출금 섹션을 명확히 분리하며 같은 이름이 양쪽에 있으면 "(입금)"/"(출금)"으로 구분한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_detail_modal_redesign');

  // ── 같은 유형명(법인카드)이 입금·출금 양쪽에 있어도 라벨로 명확히 구분되고, 계획 대비 실적이 표시됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-08-01','2026-08-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-08-01','2026-08-31','수주']],
      S04_REVENUE: [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        ['REV-1','PRJ-1','2026-08','30000000','33000000','2026-08-05','Y','','3000000','2026-08-05','2026-08-05','','']],
      S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-08','기본급여','2700000','2026-08-10','','N','0','',''],
        ['FIX-2','2026-08','법인카드','2500000','2026-08-31','','N','0','','']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-05','매출입금','33511500','0','5000000','','','매출 입금','2026-08'],
        ['T2','2026-08-06','법인카드환급','608500','0','5000000','','','법인카드','2026-08'],
        ['T3','2026-08-10','급여이체','0','15389870','5000000','','','기본급여','2026-08'],
        ['T4','2026-08-31','카드결제','0','4766460','5000000','','','법인카드','2026-08']],
      S02_CASHFLOW_EST: [['year_month','est_inflow','est_outflow','est_vat','est_balance','pipeline_basis','updated_at'],
        ['2026-08','30000000','5200000','0','37234153','자동계산','2026-09-24']],
      S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']], S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('detail-redesign-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("openDetailModal('2026-08')");
    const html = d.getElementById('detailBody').innerHTML;

    s.check(html.includes('법인카드 (입금, 참고)'), 'v2.9.56: 입금 계열의 법인카드가 "법인카드 (입금, 참고)"로 명확히 구분 표시됨');
    s.check(html.includes('608,500'), 'v2.9.55: 법인카드 입금 금액(608,500원)이 정확히 표시됨');
    s.check(html.includes('기본급여') && html.includes('2,700,000') && html.includes('15,389,870') && html.includes('+12,689,870'),
      'v2.9.55: 기본급여의 계획(2,700,000원)·실적(15,389,870원)·차이(+12,689,870원)가 정확히 표시됨');
    s.check(html.includes('매출 입금') && html.includes('33,000,000') && html.includes('33,511,500') && html.includes('+511,500'),
      'v2.9.55: 매출 입금의 계획·실적·차이가 정확히 계산되어 표시됨');
    s.check(html.includes('▸ 입금') && html.includes('▸ 출금'), 'v2.9.55: 입금·출금 섹션이 명확히 분리되어 표시됨');

    // v2.9.56: 근본 결함 수정(사용자 지적: "법인카드 회수분이 있었다면 고정비 상세 화면은
    // 회수분이 누락된거였네?") — 출금 섹션의 법인카드는 총출금(4,766,460원)이 아니라 순지출
    // (출금 4,766,460원 − 입금 608,500원 = 4,157,960원)로 계획과 비교되어야 한다.
    const cardOutMatch = html.match(/법인카드<\/span>[\s\S]*?계획 2,500,000원[\s\S]*?실적 4,157,960원/);
    s.check(!!cardOutMatch, 'v2.9.56: 출금 계열의 법인카드가 계획(2,500,000원) 대비 순지출(4,157,960원=출금-입금)으로 정확히 비교 표시됨');
    s.check(!html.includes('4,766,460'), 'v2.9.56: 출금 섹션에 회수분을 반영하지 않은 총출금(4,766,460원)이 더 이상 나타나지 않음');
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
