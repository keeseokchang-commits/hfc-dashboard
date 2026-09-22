// tests/e2e_cashflow.js — 자금수지(cashflow.html) E2E 회귀.
// 커버 범위: v2.9.20("추정 재계산 필요" 배너 — 스케줄 변경 시각 vs 마지막 재계산 시각 비교)
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_cashflow');
  const baseSheet = (settingsRows) => ({
    S02_CASHFLOW_EST: [['year_month','est_inflow','est_outflow','est_vat','est_balance','pipeline_basis','updated_at'],
      ['2026-09','1000000','500000','','','','2026-09-10']],
    S09_DASHBOARD: [['year_month']],
    S10_SETTINGS: settingsRows,
    S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
    S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']], S13_VAT: [['vat_id']],
    S08_DETAIL: [['txn_id']], S12_ESTIMATE: [['estimate_id']],
  });

  // ── 스케줄 변경이 재계산보다 최신이면 배너 표시 ──
  {
    const sheetData = baseSheet([['setting_key','setting_value','category','description','updated_at'],
      ['last_schedule_change_at','2026-09-14T10:00:00.000Z','system','','2026-09-14']]); // 재계산(9/10)보다 나중
    const { dom } = await openPage(ROOT, portFor('stale1'), 'cashflow.html', sheetData, { Chart: true });
    const d = dom.window.document;
    s.check(d.getElementById('staleEstBanner').style.display === 'flex', 'v2.9.20: 스케줄 변경>재계산 시 배너 표시');
  }

  // ── 재계산이 스케줄 변경보다 최신이면 배너 없음 ──
  {
    const sheetData = baseSheet([['setting_key','setting_value','category','description','updated_at'],
      ['last_schedule_change_at','2026-09-05T10:00:00.000Z','system','','2026-09-05']]); // 재계산(9/10)보다 이전
    const { dom } = await openPage(ROOT, portFor('stale2'), 'cashflow.html', sheetData, { Chart: true });
    const d = dom.window.document;
    s.check(d.getElementById('staleEstBanner').style.display === 'none', '재계산>스케줄변경 시 배너 미표시');
  }

  // ── 변경 이력 자체가 없으면(구버전 데이터) 판단 보류, 배너 없음(오탐 방지) ──
  {
    const sheetData = baseSheet([['setting_key','setting_value','category','description','updated_at']]);
    const { dom } = await openPage(ROOT, portFor('stale3'), 'cashflow.html', sheetData, { Chart: true });
    const d = dom.window.document;
    s.check(d.getElementById('staleEstBanner').style.display === 'none', '변경 이력 없음(구버전 데이터) 시 배너 미표시(오탐 방지)');
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
