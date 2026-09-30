// tests/e2e_fixed_table_layout.js — 고정비 계획 화면 목록 테이블 줄바꿈/가독성 개선(v2.9.60) 회귀.
// 배경(사용자 지적): "고정비 관리인데 PC에서도 UI가 줄이 바뀌고 있고, 모바일은 더 보기 힘든
// 구조야." .dtable이 컬럼 폭 지정 없이 내용 길이(배지·긴 메모·액션 버튼 3개)에 따라 자유롭게
// 줄바꿈되고 있었다. 고정 폭(table-layout:fixed + colgroup)으로 바꾸고, 줄바꿈이 필요 없는
// 셀(월·금액·지급예정일·체크박스·액션)은 nowrap, 항목의 배지·메모처럼 줄바꿈이 자연스러운
// 셀만 wrap을 허용했다. 480px 이하 모바일에서는 메모 컬럼을 숨기되 정보를 잃지 않도록 항목
// 셀 아래 보조 텍스트(.cat-memo)로 병합 표시한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_fixed_table_layout');

  // ── 테이블이 고정 폭(table-layout:fixed)이고 colgroup으로 7개 컬럼 폭이 명시됨 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-layout-1'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const styleTags = Array.from(d.querySelectorAll('style')).map(t => t.textContent).join('\n');
    s.check(/#fxTable\{[^}]*table-layout:fixed/.test(styleTags),
      'v2.9.60: #fxTable이 table-layout:fixed로 고정 폭 테이블로 전환됨');
    const cols = d.querySelectorAll('#fxTable colgroup col');
    s.check(cols.length === 7, 'v2.9.60: colgroup에 7개 컬럼(체크박스·월·항목·금액·지급예정일·메모·액션) 폭이 모두 정의됨');
  }

  // ── 줄바꿈이 필요 없는 셀(월·금액·지급예정일·체크박스)은 nowrap 클래스로 고정됨 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','기본세금','600000','2026-04-10','원천세,지방세,건강보험 등 매우 긴 메모 테스트 텍스트입니다','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-layout-2'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const row = d.querySelector('#fxBody tr');
    const cells = row.querySelectorAll('td');
    s.check(cells[0].classList.contains('nowrap'), 'v2.9.60: 체크박스 셀이 nowrap으로 고정됨');
    s.check(cells[1].classList.contains('nowrap'), 'v2.9.60: 월 셀이 nowrap으로 고정됨(더 이상 줄바꿈되지 않음)');
    s.check(cells[3].classList.contains('nowrap'), 'v2.9.60: 금액 셀이 nowrap으로 고정됨');
    s.check(cells[4].classList.contains('nowrap'), 'v2.9.60: 지급예정일 셀이 nowrap으로 고정됨');
  }

  // ── 긴 메모가 있어도 항목 셀(cell-cat)은 word-break:keep-all로 자연스럽게만 줄바꿈되고,
  //     메모 셀(cell-memo)은 wrap 클래스로 별도 관리됨 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','기본세금','600000','2026-04-10','원천세,지방세,건강보험 등 매우 긴 메모 테스트 텍스트입니다','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-layout-3'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const row = d.querySelector('#fxBody tr');
    const cells = row.querySelectorAll('td');
    s.check(cells[2].classList.contains('cell-cat'), 'v2.9.60: 항목 셀에 cell-cat 클래스가 적용됨');
    s.check(cells[5].classList.contains('wrap') && cells[5].classList.contains('cell-memo'),
      'v2.9.60: 메모 셀에 wrap·cell-memo 클래스가 적용되어 항목 셀과 독립적으로 줄바꿈됨');
  }

  // ── 액션 버튼 3개(수정/지급 해제/삭제)가 세로 스택(cell-act)으로 고정되어 폭에 상관없이 항상
  //     같은 모양을 유지함(이전에는 인라인 margin-right만 있어 가로 배치 시 줄바꿈됨) ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-10','법카(250)','N','0','','2026-04-10']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-layout-4'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const row = d.querySelector('#fxBody tr');
    const cells = row.querySelectorAll('td');
    const actCell = cells[6];
    s.check(actCell.classList.contains('cell-act'), 'v2.9.60: 액션 셀에 cell-act 클래스가 적용되어 세로 스택으로 렌더링됨');
    const buttons = actCell.querySelectorAll('button');
    s.check(buttons.length === 3, 'v2.9.60: 실지급된 건(pay_actual_date 있음)은 수정·지급 해제·삭제 3개 버튼이 모두 렌더링됨');
    const styleTags = Array.from(d.querySelectorAll('style')).map(t => t.textContent).join('\n');
    s.check(/#fxTable td\.cell-act\{[^}]*flex-direction:column/.test(styleTags),
      'v2.9.60: cell-act CSS 규칙이 flex-direction:column으로 버튼을 세로로 쌓음');
  }

  // ── 480px 이하 모바일에서는 메모 컬럼(cell-memo/th-memo)이 CSS로 숨겨지고, 대신 항목 셀
  //     안의 .cat-memo가 노출되어 정보가 유실되지 않고 위치만 이동함 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','기본세금','600000','2026-04-10','원천세,지방세,건강보험','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-layout-5'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const styleTags = Array.from(d.querySelectorAll('style')).map(t => t.textContent).join('\n');
    const mqBlockMatch = styleTags.match(/@media\(max-width:480px\)\{([\s\S]*?)\n\s*\}/);
    const mqBlock = mqBlockMatch ? mqBlockMatch[1] : '';
    s.check(/#fxTable td\.cell-memo,#fxTable th\.th-memo\{display:none\}/.test(mqBlock),
      'v2.9.60: 480px 이하에서 메모 컬럼(cell-memo·th-memo)이 숨겨지는 규칙이 존재함');
    const catCell = d.querySelector('#fxBody td.cell-cat');
    s.check(catCell.innerHTML.includes('cat-memo') && catCell.textContent.includes('원천세,지방세,건강보험'),
      'v2.9.60: 항목 셀 안에 메모가 .cat-memo로 병합 렌더링되어(모바일에서 메모 컬럼이 숨겨져도) 정보가 유실되지 않음');
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
