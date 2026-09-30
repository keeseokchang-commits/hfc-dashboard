// tests/e2e_net_outflow.js — 고정비 항목의 순지출(net) 계산 회귀(v2.9.56).
// 배경: 사용자가 "법인카드 회수분이 있었다면 고정비 상세 화면은 회수분이 누락된거였네? 그게
// 법인카드만 해당되는걸까? 예를 들어 급여도 지급했다가 오지급으로 입금받고 재지급하고
// 했었거든"라고 지적. 원인: "고정비 항목별 계획 대비 실적" 카드와 "N월 상세" 팝업 모두, 같은
// 유형명의 출금만 더하고 입금(카드값 환급, 급여 오지급 회수 등)을 무시했다 — 실제 순지출이
// 계획과 정확히 일치해도 총출금만 보면 "예산 초과"로 잘못 표시됐다. 이는 법인카드에만 국한된
// 문제가 아니라, 입금·출금이 같은 유형명으로 오갈 수 있는 모든 고정비 항목에 공통되는 구조적
// 결함이었다. 수정: 두 화면 모두 (출금 − 같은 유형 입금)의 순지출로 계획과 비교하도록 통일.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_net_outflow');

  // ── 급여 오지급(3,700,000원) 후 일부 회수(1,000,000원) — 순지출이 계획(2,700,000원)과 정확히 일치 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-08-01','2026-08-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-08-01','2026-08-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-08','기본급여','2700000','2026-08-10','','N','0','','']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-10','급여오지급','0','3700000','5000000','','','기본급여','2026-08'],
        ['T2','2026-08-11','급여회수','1000000','0','5000000','','','기본급여','2026-08']],
      S02_CASHFLOW_EST: [['year_month','est_inflow','est_outflow','est_vat','est_balance','pipeline_basis','updated_at'],
        ['2026-08','0','2700000','0','5000000','자동계산','2026-09-24']],
      S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']], S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('net-outflow-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));

    // "고정비 항목별 계획 대비 실적" 카드
    d.getElementById('fciYear').value = '2026';
    d.getElementById('fciMonth').value = '08';
    w.eval('renderFixCompareItems()');
    const cardHtml = d.getElementById('fixCompareBody').innerHTML;
    s.check(cardHtml.includes('기본급여') && cardHtml.includes('2,700,000원'),
      'v2.9.56: 고정비 항목별 카드에서 급여의 순지출(2,700,000원)이 계획과 정확히 일치하여 표시됨');
    s.check(!cardHtml.includes('3,700,000'),
      'v2.9.56: 회수분을 반영하지 않은 총출금(3,700,000원)이 더 이상 나타나지 않음');

    // "N월 상세" 팝업 — v2.9.57에서 사용자 확정("이전처럼 순지출로 표현하면 출금합계가 다름.
    // 따라서 지출내역 기준")에 따라 이 화면은 총액(지출 내역 그대로) 표시로 정책이 바뀌었다.
    // "고정비 항목별 계획 대비 실적" 카드(위에서 이미 검증)는 순지출 원칙을 그대로 유지하고,
    // 이 상세팝업만 입금·출금을 각각 통장에 찍힌 그대로 보여준다.
    w.eval("openDetailModal('2026-08')");
    const modalHtml = d.getElementById('detailBody').innerHTML;
    s.check(modalHtml.includes('급여회수') === false && modalHtml.includes('1,000,000'),
      'v2.9.57: 상세팝업 입금 내역에 급여 회수(1,000,000원)가 그대로 표시됨');
    s.check(modalHtml.includes('3,700,000'),
      'v2.9.57: 상세팝업 출금 내역에 급여 총지급액(3,700,000원)이 그대로(지출 내역 기준) 표시됨');
    const act = w.eval("actData.find(a=>a.year_month==='2026-08')");
    s.check(modalHtml.includes(`-${act.act_outflow.toLocaleString()}원`) || modalHtml.includes('2,700,000원'),
      'v2.9.57: 상세팝업 출금 합계가 실제 통장 총출금과 정확히 일치함');
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
