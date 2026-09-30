// tests/e2e_detail_modal_redesign.js — "N월 상세" 팝업(openDetailModal) 재설계 회귀(v2.9.55~57).
// 배경: 사용자 지적(v2.9.55) — "법인카드가 두번 나오는거도 오류인거 같고, 이 보고서가 보여주려고
// 했던 양식 목표가 사라진 듯 해." v2.9.54가 8개 고정 버킷을 없애면서 통장 실적을 단순 나열만 하게
// 됐는데, 이 화면의 원래 목적("추정과 실제 잔액의 차이가 왜 발생했는지 설명")을 놓쳤다. v2.9.55는
// 계획 대비 실적 비교를 도입했고, v2.9.56은 순지출(net) 원칙을 적용했다.
// v2.9.57 최종 확정(사용자 요청 — "프로답게 보일 수 있도록" UI/UX 정비): 세 블록(KPI 스트립,
// 입금 내역, 출금 내역)으로 명확히 구조화하고, 사용자가 "이전처럼 순지출로 표현하면 출금합계가
// 다름. 지출내역 기준"이라고 확정한 대로, 이 화면의 출금 내역은 순지출이 아니라 유형별 총출금을
// 그대로 보여줘 합계가 실제 통장 총출금과 정확히 일치하도록 정책을 바꿨다(순지출 원칙은 "고정비
// 항목별 계획 대비 실적" 카드에만 남아 있음 — e2e_net_outflow.js, e2e_fix_compare_items.js 참고).
// 계획 대비 비교는 각 항목 옆에 보조 정보로 유지.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_detail_modal_redesign');

  // ── KPI 스트립, 입금/출금 블록 구조, 총액 표시, 계획 대비 보조 정보가 모두 정확히 나타남 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-08-01','2026-08-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-08-01','2026-08-31','수주']],
      S04_REVENUE: [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        ['REV-1','PRJ-1','2026-08','30000000','33511500','2026-08-05','Y','','3000000','2026-08-05','2026-08-05','','']],
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
    const act = w.eval("actData.find(a=>a.year_month==='2026-08')");

    s.check(d.querySelector('.kpi-strip') !== null,
      'v2.9.57: 추정 잔액·실잔액·차이가 KPI 스트립(3분할 블록)으로 표시됨');
    s.check(d.querySelectorAll('.flow-section').length === 2,
      'v2.9.57: 입금 내역·출금 내역이 정확히 두 개의 블록으로 구성됨');

    s.check(html.includes('법인카드') && html.includes('608,500'),
      'v2.9.57: 입금 내역에 법인카드 환급(608,500원)이 그대로 표시됨');
    s.check(html.includes('15,389,870') && html.includes('2,700,000') && html.includes('+12,689,870'),
      'v2.9.57: 출금 내역의 기본급여에 계획(2,700,000원)·실적(15,389,870원)·차이(+12,689,870원)가 보조 정보로 표시됨');
    s.check(html.includes('33,511,500'),
      'v2.9.57: 매출 입금의 실적(33,511,500원)이 정확히 표시됨');

    // v2.9.57: 사용자 확정("지출내역 기준") — 법인카드는 순지출이 아니라 총출금(4,766,460원)
    // 그대로 표시되어야 하고, 출금 합계는 실제 통장 총출금과 정확히 일치해야 한다.
    s.check(html.includes('4,766,460'),
      'v2.9.57: 출금 내역의 법인카드가 순지출이 아니라 총출금(4,766,460원) 그대로 표시됨');
    s.check(!html.includes('4,157,960'),
      'v2.9.57: 법인카드 순지출 값(4,157,960원)이 더 이상 나타나지 않음(총액 방식으로 전환)');

    const totalOutText = act.act_outflow.toLocaleString() + '원';
    s.check(html.includes(totalOutText),
      'v2.9.57: 출금 내역 합계가 실제 통장 총출금(' + totalOutText + ')과 정확히 일치');
    const totalInText = act.act_inflow.toLocaleString() + '원';
    s.check(html.includes(totalInText),
      'v2.9.57: 입금 내역 합계가 실제 통장 총입금(' + totalInText + ')과 정확히 일치');
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
