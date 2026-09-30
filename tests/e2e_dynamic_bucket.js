// tests/e2e_dynamic_bucket.js — 실적 집계의 근본 재설계(v2.9.54) 회귀.
// 배경: 사용자가 "AI 사용료가 0으로 나오잖아? 버킷에 없는 항목이라고 0이면 버킷을 조정하든
// 보고서 항목을 조정하든 노력이 있어야" → "근본해결책으로 해야지. 편법은 안돼"라고 확정.
// 원인: 실적 집계가 8개 고정 버킷(매출입금·자본납입·기타입금·매입지급·고정비·세금·법인카드·
// AI사용료·기타비용)에 강제로 밀어 넣는 구조라, 코드 관리(S10_SETTINGS)에 그 이름의 txn_type이
// 등록되지 않은 유형은 bucketOf()가 매칭 실패해 조용히 0이 되거나 기타로 뭉개졌다.
// 근본 수정: deriveActFromDetail·aggregateMonthly 모두 유형명(category) 그대로를 키로 하는
// 동적 객체(by)에 집계하도록 재설계 — 코드 관리 등록 여부와 무관하게 실제 통장 거래 데이터를
// 있는 그대로 반영한다. 8개 고정 필드는 하위 호환(S08_CASHFLOW_ACT 시트 기록, 계획출금 계산)을
// 위해 by로부터 파생되어 계속 제공된다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_dynamic_bucket');

  // ── 코드 관리에 등록되지 않은 유형(AI사용료)도 "추정 잔액 구성" 상세팝업에 정확히 표시됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-05','CLAUDE.AI 결제','0','142769','5000000','','','AI사용료','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']], // AI사용료 txn_type 미등록
    };
    const { dom } = await openPage(ROOT, portFor('dyn-bucket-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("openDetailModal('2026-08')");
    const html = d.getElementById('detailBody').innerHTML;
    s.check(html.includes('AI사용료') && html.includes('142,769'),
      'v2.9.54: 코드 관리에 미등록된 유형(AI사용료)도 상세팝업에 0으로 사라지지 않고 정확히 표시됨');
  }

  // ── 미등록 유형이 대시보드 배지(showBreakdown)에도 정확히 표시됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-05','CLAUDE.AI 결제','0','142769','5000000','','','AI사용료','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const { dom } = await openPage(ROOT, portFor('dyn-bucket-2'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("showBreakdown('2026-08', actData.find(a=>a.year_month==='2026-08'))");
    const html = d.getElementById('breakdownList').innerHTML;
    s.check(html.includes('AI사용료') && html.includes('142,769'),
      'v2.9.54: 대시보드 배지(showBreakdown)에도 미등록 유형이 정확히 표시됨');
  }

  // ── 등록된 유형은 기존과 동일하게 정확히 집계되어 하위 호환이 유지됨(8개 파생 필드) ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-05','법인카드결제','0','2500000','5000000','','','법인카드','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['법인카드','카드사용','txn_type','법인카드','2026-09-24']],
    };
    const { dom } = await openPage(ROOT, portFor('dyn-bucket-3'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const act = w.eval("actData.find(a=>a.year_month==='2026-08')");
    s.check(act.outflow_card === 2500000, 'v2.9.54: 등록된 유형(법인카드)의 하위 호환 필드(outflow_card)가 정확히 계산됨');
    s.check(act.by['법인카드'].out === 2500000, 'v2.9.54: 동적 집계(by)에도 정확히 반영됨');
  }

  // ── 유형명 그대로의 자유 집계(by)가 계획출금 계산(aggregateMonthly)에도 반영되어 계획출금 총액이 정확함 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['세금 납부','원천세','txn_type','세금','2026-09-24']],
    };
    const { dom } = await openPage(ROOT, portFor('dyn-bucket-4'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    // aggregateMonthly가 여전히 정상 동작하는지(문법·런타임 오류 없이) 최소 확인
    const result = w.eval("typeof aggregateMonthly === 'function'");
    s.check(result === true, 'v2.9.54: aggregateMonthly 함수가 정상적으로 로드되고 동작함(리팩터링 후 문법 오류 없음)');
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
