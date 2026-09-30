// tests/e2e_detailall_dedupe.js — detailAll 로딩 시 중복 txn_id 제거 결함(v2.9.52) 회귀.
// 배경: 사용자가 실제 화면(유형별 집계)에서 "자본 납입 7건, 22,963,120원"을 봤는데, Google Drive로
// 확인한 실제 S08_DETAIL 시트에는 "자본 납입"이 정확히 1건(20,000,000원)뿐이었다 — 새로고침 후에도
// 동일하게 재현됨을 확인. 원인: s04All·s05All은 dedupe(...,'revenue_id'/'cost_id')로 중복을
// 제거하는데 detailAll만 이 처리가 빠져 있어, 시트에 같은 txn_id가 중복 저장되는 경로가 한 번이라도
// 생기면(CSV 재업로드 시 지문 매칭 실패, 수동 편집 등) 화면의 모든 집계가 부풀려지고, saveReclass()가
// 그 부풀려진 배열을 그대로 다시 저장하면 중복이 시트에 영구히 남는 문제로 이어질 수 있었다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_detailall_dedupe');

  // ── 시트에 같은 txn_id가 중복 저장되어 있어도 detailAll에는 한 번만 반영됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['TXN-1','2026-03-27 17:48:53','장기석','20000000','0','20000000','장기석','카카오뱅크0032','자본 납입','2026-03'],
        ['TXN-2','2026-04-01','거래1','0','1000000','19000000','','','자본 납입','2026-04'],
        ['TXN-3','2026-04-02','거래2','0','2000000','17000000','','','자본 납입','2026-04'],
        // TXN-1이 중복 저장된 상황(예전 잘못된 저장의 흔적)
        ['TXN-1','2026-03-27 17:48:53','장기석','20000000','0','20000000','장기석','카카오뱅크0032','자본 납입','2026-03']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('detailall-dedupe-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const detailAll = w.eval('detailAll');
    s.check(detailAll.length === 3, 'v2.9.52: 시트에 4행(1건 중복)이 있어도 detailAll에는 정확히 3건만 반영됨');
    const capital = detailAll.filter(t => t.category === '자본 납입');
    s.check(capital.length === 3, 'v2.9.52: "자본 납입" 유형이 실제 시트 건수(3건)와 정확히 일치하고 부풀려지지 않음');
  }

  // ── 유형별 집계 화면도 dedupe 이후 정확한 건수·금액을 표시 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['TXN-1','2026-03-27 17:48:53','장기석','20000000','0','20000000','장기석','카카오뱅크0032','자본 납입','2026-03'],
        ['TXN-1','2026-03-27 17:48:53','장기석','20000000','0','20000000','장기석','카카오뱅크0032','자본 납입','2026-03']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('detailall-dedupe-2'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval('openTxModal()');
    w.eval("setTxMode('sum')");
    const html = d.getElementById('txBody').innerHTML;
    s.check(html.includes('1건'), 'v2.9.52: 유형별 집계 화면에서 중복 시트 행 2개가 1건으로 정확히 집계됨');
    s.check(!html.includes('2건'), 'v2.9.52: 중복으로 인한 과다 건수(2건)가 나타나지 않음');
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
