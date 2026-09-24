// tests/e2e_csv_popup_readability.js — "CSV 거래 내역" 팝업의 가독성 재설계(v2.9.49) 회귀.
// 배경: v2.9.47에서 재지정 드롭다운을 추가했으나 컬럼 폭을 전혀 고려하지 않아, 긴 유형명("기타
// 지급(세금계산서)" 등)이 드롭다운 안에서 잘려 보였다(사용자 지적: "UI 표준 원칙에 가독성은
// 없었나?"). 첫 시도(table-layout:fixed + colgroup, 112px 고정폭)는 옵션 텍스트 자체는 안
// 잘렸지만 실제 렌더링 폭이 여전히 부족해 시각적으로는 잘려 보였다 — 당시 테스트가 "옵션 텍스트가
// 문자열로 온전히 존재하는지"만 확인하고 "그 텍스트를 담을 폭이 충분한지"는 확인하지 않아 결함을
// 못 잡았다(사용자가 실제 화면 스크린샷으로 재확인). v2.9.49 최종 수정: 6컬럼 표 자체를 버리고
// 기존 "미분류·기타 재지정" 섹션과 동일한 카드형 레이아웃(정보 줄 + 드롭다운 전체 폭 별도 줄)으로
// 전면 재설계 — 어떤 길이의 유형명도 카드 전체 폭(모달 폭)을 쓰므로 원천적으로 잘릴 수 없다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_csv_popup_readability');

  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id','matched_txn_id']],
      S05_COST: [['cost_id','matched_txn_id']], S06_FIXED_COST: [['fixed_id']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-03-28 18:00:38','가비아 도메인 결제 매우 긴 적요 텍스트 테스트용','0','60390','5000000','','','기타 지급(세금계산서)','2026-03']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']],
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['기타 지급(세금계산서)','가비아,도메인','txn_type','기타비용','2026-09-24']],
    };
    const { dom } = await openPage(ROOT, portFor('csv-readability-1'), 'cashflow.html', sheetData, { Chart: true });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval('openTxModal()');

    // 표(6컬럼) 구조를 완전히 버렸는지 확인 — 남아있다면 좁은 컬럼 폭 문제가 재발할 수 있음
    const table = d.querySelector('#txBody table');
    s.check(!table, 'v2.9.49: 건별 내역이 더 이상 좁은 컬럼 표가 아니라 카드형 레이아웃으로 렌더링됨');

    const sel = d.getElementById('rct_T1');
    s.check(!!sel, 'v2.9.49: 재지정 드롭다운이 카드 안에 정확히 존재함');
    // 드롭다운이 좁은 셀이 아니라 카드 전체 폭(width:100%)을 쓰는지 — 컨테이너 자체가 셀이 아닌
    // 카드의 하위 div이므로, 긴 텍스트를 담을 폭이 원천적으로 부족할 수 없음을 구조로 확인.
    s.check(sel.style.width === '100%', 'v2.9.49: 재지정 드롭다운이 카드 전체 폭(width:100%)을 사용 — 좁은 표 컬럼에 갇히지 않음');
    const parentIsTableCell = sel.closest('td');
    s.check(!parentIsTableCell, 'v2.9.49: 드롭다운의 부모가 표 셀(td)이 아님 — 표 컬럼 폭 제약에서 완전히 벗어남');
    s.check(Array.from(sel.options).some(o => o.text === '기타 지급(세금계산서)'),
      'v2.9.49: 긴 유형명("기타 지급(세금계산서)")이 잘리지 않고 옵션 텍스트에 온전히 저장됨');

    const card = d.querySelector('#txBody > div');
    s.check(!!card, 'v2.9.49: 거래 카드가 정확히 렌더링됨');
    const dateSpan = card.querySelector('span');
    s.check(dateSpan.textContent === '2026-03-28', 'v2.9.49: 일자가 시분초 없이 날짜만 표시됨(가독성)');

    const descSpan = card.querySelectorAll('span')[1];
    s.check(descSpan.getAttribute('title') === '가비아 도메인 결제 매우 긴 적요 텍스트 테스트용',
      'v2.9.49: 긴 적요도 title 속성으로 전체 내용을 확인할 수 있음');
  }

  // ── 저장 기능이 새 카드형 구조에서도 정확히 동작하는지(v2.9.47 기능의 회귀 방지) ──
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
    const { dom } = await openPage(ROOT, portFor('csv-readability-2'), 'cashflow.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval('openTxModal()');
    const sel = d.getElementById('rct_T1');
    sel.value = '매입지급';
    await w.eval('saveReclass()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S08 || []).slice(1);
    const row = saved.find(r => r[0] === 'T1');
    s.check(!!row && row[8] === '매입지급', 'v2.9.49: 카드형 레이아웃으로 바뀐 뒤에도 재지정 저장 기능이 정확히 동작');
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
