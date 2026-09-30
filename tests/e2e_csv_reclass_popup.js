// tests/e2e_csv_reclass_popup.js — CSV 거래 내역 팝업의 재지정 드롭다운(v2.9.47) 회귀.
// 배경: 기존 "미분류·기타 재지정" UI는 카테고리가 없거나 "기타비용/기타입금"인 거래만 대상으로
// 하므로, 이미 다른 유형으로 분류된 거래(예: 실수로 "법인카드"로 분류된 매입지급 건)는 재지정할
// 방법이 없었다. 사용자 확정: 기존 미분류 UI는 그대로 유지하고, "CSV 거래 내역" 버튼을 눌렀을 때
// 나오는 팝업(건별 내역)에 별도의 재지정 드롭다운을 추가해 이미 분류된 거래도 수정 가능하게 함.
// id 접두사를 "rct_"로 분리해 미분류 UI(id="rc_...")와 동시에 렌더링되어도 값이 섞이지 않도록 함.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_csv_reclass_popup');

  // ── 이미 분류된 거래(법인카드)를 CSV 팝업에서 다른 유형(매입지급)으로 재지정 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-01','카페결제','0','5000','5000000','','','법인카드','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['매입지급','오벳소프트','txn_type','매입지급','2026-09-24'],
        ['법인카드','카드사용','txn_type','법인카드','2026-09-24']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('csv-reclass-1'), 'cashflow.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval('openTxModal()');
    const sel = d.getElementById('rct_T1');
    s.check(!!sel, 'v2.9.47: CSV 거래 내역 팝업에 재지정 드롭다운(rct_ 접두사)이 존재함');
    s.check(sel.value === '법인카드', 'v2.9.47: 드롭다운의 초기 선택값이 현재 분류(법인카드)와 정확히 일치');
    sel.value = '매입지급';
    await w.eval('saveReclass()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S08 || []).slice(1);
    const row = saved.find(r => r[0] === 'T1');
    s.check(!!row && row[8] === '매입지급', 'v2.9.47: 이미 분류된 거래(법인카드)를 CSV 팝업에서 다른 유형(매입지급)으로 정확히 재지정·저장');
    const selAfter = d.getElementById('rct_T1');
    s.check(!!selAfter && selAfter.value === '매입지급', 'v2.9.47: 저장 후 팝업이 다시 그려져 드롭다운이 새 값을 정확히 반영');
  }

  // ── 미분류 목록(rc_)과 CSV 팝업(rct_)이 동시에 열려 있어도 값이 서로 섞이지 않음 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-01','수수료','0','3000','5000000','','','기타비용','2026-08'],
        ['T2','2026-08-02','오벳소프트','0','15000000','5000000','','','매입지급','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['수수료','송금수수료','txn_type','기타비용','2026-09-24'],
        ['매입지급','오벳소프트','txn_type','매입지급','2026-09-24'],
        ['법인카드','카드사용','txn_type','법인카드','2026-09-24']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('csv-reclass-2'), 'cashflow.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval('rebuildRecon()'); // 미분류 재지정 목록에 T1(기타비용) 렌더
    w.eval('openTxModal()'); // CSV 팝업에 T1, T2 둘 다 렌더(같은 T1이 양쪽에 동시 존재)
    const rcT1 = d.getElementById('rc_T1');
    const rctT2 = d.getElementById('rct_T2');
    s.check(!!rcT1 && !!rctT2, 'v2.9.47: 미분류 목록과 CSV 팝업이 동시에 각자의 드롭다운을 정확히 렌더');
    rcT1.value = '법인카드';
    rctT2.value = '법인카드';
    await w.eval('saveReclass()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S08 || []).slice(1);
    const t1 = saved.find(r => r[0] === 'T1'), t2 = saved.find(r => r[0] === 'T2');
    s.check(!!t1 && t1[8] === '법인카드', 'v2.9.47: 미분류 목록(rc_T1)에서의 재지정이 정확히 저장됨');
    s.check(!!t2 && t2[8] === '법인카드', 'v2.9.47: CSV 팝업(rct_T2)에서의 재지정도 값이 섞이지 않고 정확히 저장됨');
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
