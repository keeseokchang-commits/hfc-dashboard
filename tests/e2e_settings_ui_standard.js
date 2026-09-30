// tests/e2e_settings_ui_standard.js — 설정 화면 코드 관리의 UI 표준 준수 회귀(v2.9.59).
// 배경: 사용자 지적 — "설정의 코드 관리에서 버킷을 급하게 만드느라고 그랬는지 UI표준 원칙이
// 깨져 있다." v2.9.45에서 "①거래유형&키워드" 행에 집계 버킷 <select>를 추가할 때, 이 화면의
// 공통 스타일(.code-row input — flex:1, 통일된 패딩·테두리·폰트)에 select를 포함시키지 않고
// 인라인 style="max-width:150px"만 붙였다. 그 결과 select에 input과 같은 시각 스타일이
// 전혀 적용되지 않았고, flex 배분도 안 돼 선택된 옵션 텍스트 길이에 따라 행마다 폭이 제멋대로
// 달라 보였다(예: "매출입금(입금)"이 선택된 행은 넓고, "세금(출금)"이 선택된 행은 좁음).
// 수정: .code-row select 규칙을 신설해 input과 동일한 패딩·테두리·폰트를 적용하고,
// flex:0 0 132px로 고정폭을 줘 어떤 옵션이 선택되어도 모든 행에서 폭이 정확히 동일하도록 함.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_settings_ui_standard');

  // ── 집계 버킷 select에 인라인 스타일 잔재가 없고, 전부 동일한 CSS 클래스 규칙만 따름 ──
  {
    const sheetData = {
      S10_SETTINGS: [['setting_key','setting_value','category','description','updated_at'],
        ['매출 입금','이노라인','txn_type','매출입금','2026-09-24'],
        ['기본세금','건강연금,원천세','txn_type','세금','2026-09-24'],
        ['법인카드','거래점 분류 규칙으로 관리','txn_type','법인카드','2026-09-24']],
    };
    const { dom } = await openPage(ROOT, portFor('settings-ui-1'), 'settings.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const selects = d.querySelectorAll('#ctTxn select');
    s.check(selects.length === 3, 'v2.9.59: 3개 거래유형 행 모두 집계 버킷 select가 정확히 렌더링됨');

    let allClean = true;
    selects.forEach(sel => { if (sel.getAttribute('style')) allClean = false; });
    s.check(allClean, 'v2.9.59: select에 인라인 max-width 스타일 잔재가 없음(순수 CSS 클래스로만 스타일 적용)');
  }

  // ── .code-row select CSS 규칙이 실제로 존재하고, input과 동일한 시각 속성(패딩·테두리·폰트)을 가짐 ──
  {
    const sheetData = { S10_SETTINGS: [['setting_key']] };
    const { dom } = await openPage(ROOT, portFor('settings-ui-2'), 'settings.html', sheetData, {});
    const w = dom.window, d = w.document;
    const styleTags = Array.from(d.querySelectorAll('style')).map(t => t.textContent).join('\n');
    s.check(styleTags.includes('.code-row select'),
      'v2.9.59: .code-row select CSS 규칙이 스타일시트에 정의됨');
    s.check(/\.code-row select\{[^}]*flex:0 0 132px/.test(styleTags),
      'v2.9.59: select의 폭이 고정값(132px)으로 명시되어 선택된 옵션과 무관하게 모든 행에서 동일함');
    s.check(/\.code-row select\{[^}]*padding:7px 9px/.test(styleTags),
      'v2.9.59: select가 input과 동일한 패딩을 사용해 시각적으로 통일됨');
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
