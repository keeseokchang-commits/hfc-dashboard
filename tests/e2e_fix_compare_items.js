// tests/e2e_fix_compare_items.js — 고정비 항목별 계획 대비 실적(v2.9.53) 신규 기능 회귀.
// 배경(사용자 확정): "고정비 항목을 잡고 월별 고정비 집행 계획을 세웠어. 그러면 해당 월의 고정비
// 집행 실적을 계획 대비로 보아야 아 이번 달은 세금을 많이 냈구나, 법인카드를 덜 썼구나 하는
// 경영 인사이트가 필요한 거거든." 설계 원칙: 계획(fixed.html의 category)과 실적(통장 거래의
// category)이 같은 이름 체계를 공유하므로, 건별 대사(매칭) 없이 이름을 그대로 조인 키로 써서
// 그 달의 계획 합계와 실적 합계를 항목별로 비교한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_fix_compare_items');

  // ── 계획과 실적이 항목명으로 정확히 매칭되어 차이가 계산됨(계획대로/초과/절감/예산외) ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-08','급여','2700000','2026-08-10','','N','0','',''],
        ['FIX-2','2026-08','세금','56800','2026-08-10','','N','0','',''],
        ['FIX-3','2026-08','법인카드','2500000','2026-08-31','','N','0','','']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-10','급여이체','0','2700000','5000000','','','급여','2026-08'],
        ['T2','2026-08-10','원천세','0','100000','5000000','','','세금','2026-08'],
        ['T3','2026-08-31','카드결제','0','1500000','5000000','','','법인카드','2026-08'],
        ['T4','2026-08-15','통신비청구','0','120000','5000000','','','통신요금','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('fix-compare-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    d.getElementById('fciYear').value = '2026';
    d.getElementById('fciMonth').value = '08';
    w.eval('renderFixCompareItems()');
    const html = d.getElementById('fixCompareBody').innerHTML;

    s.check(html.includes('급여') && html.includes('2,700,000원'),
      'v2.9.53: 계획과 실적이 정확히 일치하는 항목(급여)이 정확히 표시됨');
    s.check(html.includes('법인카드') && html.includes('2,500,000원') && html.includes('1,500,000원') && html.includes('-1,000,000원'),
      'v2.9.53: 예산보다 덜 쓴 항목(법인카드)의 계획·실적·차이(-1,000,000원)가 정확히 계산됨');
    s.check(html.includes('세금') && html.includes('56,800원') && html.includes('100,000원') && html.includes('+43,200원'),
      'v2.9.53: 예산보다 더 쓴 항목(세금)의 계획·실적·차이(+43,200원)가 정확히 계산됨');
    s.check(html.includes('통신요금') && html.includes('예산 외') && html.includes('120,000원'),
      'v2.9.53: 계획에 없던 항목(통신요금)이 "예산 외" 표시와 함께 정확히 나타남');
    s.check(html.includes('5,256,800원') && html.includes('4,420,000원'),
      'v2.9.53: 계획 합계(5,256,800원)와 실적 합계(4,420,000원)가 정확히 계산됨');
  }

  // ── 계획은 있는데 그 달 실적이 전혀 없는 항목은 "미집행"으로 표시 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-08','AI사용료','150000','2026-08-20','','N','0','','']],
      S08_DETAIL: [['txn_id']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('fix-compare-2'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    d.getElementById('fciYear').value = '2026';
    d.getElementById('fciMonth').value = '08';
    w.eval('renderFixCompareItems()');
    const html = d.getElementById('fixCompareBody').innerHTML;
    s.check(html.includes('AI사용료') && html.includes('미집행'),
      'v2.9.53: 계획만 있고 실적이 없는 항목(AI사용료)이 "미집행"으로 정확히 표시됨');
  }

  // ── 매출입금·매입지급 등 입금 계열은 이 카드의 대상이 아니므로 집계에서 제외됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-08','법인카드','2500000','2026-08-31','','N','0','','']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-05','매출입금','37083120','0','5000000','','','매출 입금','2026-08'],
        ['T2','2026-08-31','카드결제','0','2500000','5000000','','','법인카드','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('fix-compare-3'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    d.getElementById('fciYear').value = '2026';
    d.getElementById('fciMonth').value = '08';
    w.eval('renderFixCompareItems()');
    const html = d.getElementById('fixCompareBody').innerHTML;
    s.check(!html.includes('매출 입금') && !html.includes('37,083,120'),
      'v2.9.53: 매출 입금(입금 계열)이 이 카드의 출금 항목 비교에 섞이지 않고 정확히 제외됨');
    s.check(html.includes('법인카드') && html.includes('2,500,000원'),
      'v2.9.53: 출금 항목(법인카드)은 정확히 집계됨');
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
