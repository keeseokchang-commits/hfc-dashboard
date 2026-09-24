// tests/e2e_cashflow_whitespace.js — 거래유형 집계의 근본 재설계(v2.9.45) 회귀.
// 배경: v2.9.44는 "매출입금"과 "매출 입금"의 공백을 제거해 우연히 일치시키는 편법이었다(사용자
// 지적: "띄어쓰기가 문제인게 아니고, 등록된 유형을 기준으로 분류하도록 해야지. 무조건 편법이라도
// 기능이 돌아가는 것처럼 보이게 하면 신뢰를 받을 수 없어"). 실제 사용자는 "매출 입금"·"매입 지급"·
// "보증보험"·"수수료"·"경조사비" 등 이름도 개수도 하드코딩된 9개와 전혀 다른 유형을 자유롭게
// 등록해두고 있었다. v2.9.45는 근본적으로 재설계: 코드 관리 화면(①거래유형&키워드)에 각 유형이
// 속할 "집계 버킷"을 사용자가 명시적으로 지정하는 드롭다운을 추가하고(S10의 description 컬럼에
// 저장), 자금수지 집계는 하드코딩 문자열과 비교하는 대신 이 매핑을 조회한다 — 유형명이 무엇이든,
// 몇 개를 등록하든 항상 정확하다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_cashflow_whitespace');

  // ── 코드 관리 화면: 유형 등록 시 집계 버킷을 명시적으로 지정·저장·재조회 ──
  {
    const sheetData = {
      S11_GRADE_RATE: [['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('settings-bucket'), 'settings.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval("addCode('txn_type')");
    await new Promise(r => setTimeout(r, 50));
    w.eval("codeRows.txn_type[codeRows.txn_type.length-1]=['매출 입금','이노라인','매출입금']");
    await w.eval('saveCodes()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S10 || []).slice(1);
    const row = saved.find(r => r[0] === '매출 입금');
    s.check(!!row && row[2] === 'txn_type' && row[3] === '매출입금',
      'v2.9.45: 코드 관리에서 등록한 유형명·키워드·집계버킷이 정확히 저장됨(버킷은 description 컬럼)');
  }

  // ── 코드 관리 화면: 저장된 버킷이 재조회 시 드롭다운 선택 상태로 정확히 복원 ──
  {
    const sheetData = {
      S11_GRADE_RATE: [['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['매출 입금', '이노라인', 'txn_type', '매출입금', '2026-09-24']],
    };
    const { dom } = await openPage(ROOT, portFor('settings-bucket-load'), 'settings.html', sheetData, { confirm: () => true });
    const w = dom.window;
    s.check(w.eval("codeRows.txn_type[0][2]") === '매출입금',
      'v2.9.45: 재조회 시 저장된 집계버킷이 정확히 복원됨(codeRows에 세 번째 요소로)');
  }

  // ── 자금수지: 완전히 자유로운 유형명(이름도 개수도 하드코딩 9개와 다름)이 명시된 버킷대로 정확히 집계 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['매출 입금','이노라인,비플레이스','txn_type','매출입금','2026-09-24'],
        ['매입 지급','오벳소프트','txn_type','매입지급','2026-09-24'],
        ['보증보험','서울보증보험','txn_type','기타비용','2026-09-24']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-01','이노라인 입금','37083120','0','5000000','','','매출 입금','2026-08'],
        ['T2','2026-08-02','오벳소프트 지급','0','24200000','5000000','','','매입 지급','2026-08'],
        ['T3','2026-08-03','서울보증보험료','0','100000','5000000','','','보증보험','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
    };
    const { dom } = await openPage(ROOT, portFor('cf-bucket-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const act = w.eval("actData.find(a=>a.year_month==='2026-08')");
    s.check(!!act && act.inflow_revenue === 37083120,
      'v2.9.45: 사용자 정의 유형("매출 입금")이 지정된 버킷(매출입금)으로 정확히 집계됨');
    s.check(!!act && act.outflow_cost === 24200000,
      'v2.9.45: 사용자 정의 유형("매입 지급")이 지정된 버킷(매입지급)으로 정확히 집계됨');
    s.check(!!act && act.outflow_etc === 100000,
      'v2.9.45: 하드코딩 9개에 전혀 없는 유형("보증보험")도 지정된 버킷(기타비용)으로 정확히 집계됨');
  }

  // ── 자금수지: CSV 파싱 직후 실시간 집계 경로도 동일하게 버킷 매핑을 사용 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']], S08_DETAIL: [['txn_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['매출 입금','이노라인','txn_type','매출입금','2026-09-24']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
    };
    const { dom } = await openPage(ROOT, portFor('cf-bucket-2'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    w.eval(`
      const txns=[{ym:'2026-08',date:'2026-08-01',bal:5000000,inAmt:37083120,outAmt:0,cat:'매출 입금'}];
      aggregateMonthly(txns);
    `);
    const m = w.eval("parsedMonthly['2026-08']");
    s.check(!!m && m.inflow_revenue === 37083120,
      'v2.9.45: CSV 파싱 직후 실시간 집계에서도 코드 관리 버킷 매핑이 정확히 적용됨');
  }

  // ── 자금수지: 버킷 미지정(구버전 데이터) 또는 코드 관리에 아예 없는 유형도 안전하게 기타로 폴백 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['법인카드','거래점 분류 규칙으로 관리','txn_type','','2026-09-24']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-08-01','카페','0','5000','5000000','','','법인카드','2026-08'],
        ['T2','2026-08-02','완전미등록','0','3000','5000000','','','완전미등록유형','2026-08']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
    };
    const { dom } = await openPage(ROOT, portFor('cf-bucket-3'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window;
    const act = w.eval("actData.find(a=>a.year_month==='2026-08')");
    s.check(!!act && act.outflow_etc === 8000,
      'v2.9.45: 버킷 미지정·코드 관리에 없는 유형도 누락 없이 기타비용으로 안전 폴백');
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
