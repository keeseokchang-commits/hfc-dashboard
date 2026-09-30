// tests/e2e_fixed_bulk_edit.js — 고정비 계획 화면의 세 가지 결함 수정(v2.9.50) 회귀.
// 배경(사용자 지적): ①"고정비 추가"를 누르면 생기는 팝업이 이전 정보 초기화가 안 된 상태로
// 나옴 — resetFxEdit()가 편집 관련 상태만 지우고 항목명·금액·지급일·메모는 그대로 남겼던 결함.
// ②수정 팝업에서 기간의 From은 수정이 되지만 TO는 수정이 안 됨 — editFx()가 TO 필드를
// disabled로 막아 아예 입력할 수 없었던 결함. ③체크박스로 여러 개를 한 번에 삭제, 여러 개
// 선택 후 "수정"을 누르면 첫 번째 대상으로만 수정 팝업이 뜨는 기능 신설.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_fixed_bulk_edit');

  // ── ① "고정비 추가" 팝업이 이전 편집 값으로 오염되지 않고 정확히 초기화됨 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-30','법인카드 월사용계획','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-reset-1'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("editFx('FIX-1')");
    d.getElementById('fx_memo').value = '임시메모';
    w.eval("document.getElementById('fxModal').classList.remove('open')");
    w.eval('openFxModal()');
    s.check(d.getElementById('fx_cat').value === '', 'v2.9.50: "고정비 추가" 팝업을 열면 항목명이 정확히 초기화됨');
    s.check(d.getElementById('fx_amt').value === '', 'v2.9.50: 금액이 정확히 초기화됨');
    s.check(d.getElementById('fx_memo').value === '', 'v2.9.50: 메모가 정확히 초기화됨(이전에는 초기화 안 되던 필드)');
    s.check(d.getElementById('fx_day').value === '25', 'v2.9.50: 지급일이 기본값(25)으로 정확히 초기화됨');
  }

  // ── ② 수정 팝업에서 TO(종료월) 필드가 disabled로 막혀있지 않고 정상 입력 가능 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-30','','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-to-1'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("editFx('FIX-1')");
    const em = d.getElementById('fx_em');
    s.check(em.disabled === false, 'v2.9.50: 수정 팝업에서 TO(종료월) 필드가 더 이상 disabled로 막혀있지 않음');
    em.value = '2026-06';
    s.check(em.value === '2026-06', 'v2.9.50: TO 필드에 값을 정상적으로 입력할 수 있음');
  }

  // ── v2.9.51: 단건 수정에서 TO는 저장 시 쓰이지 않으므로(사용자 확정: "From을 수정하면 To도
  // 같은 값으로 대체해주면 되잖아"), FROM을 바꾸면 TO가 자동으로 같은 값을 따라감. 신규 추가
  // 모드에서는 FROM~TO로 여러 달을 반복 생성하는 것이 정상 동작이므로 동기화하지 않음. ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-30','','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-to-sync-1'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("editFx('FIX-1')");
    d.getElementById('fx_sm').value = '2026-07';
    w.eval('syncFxEm()');
    s.check(d.getElementById('fx_em').value === '2026-07',
      'v2.9.51: 편집 모드에서 FROM을 바꾸면 TO가 자동으로 같은 값으로 동기화됨');
    w.eval("document.getElementById('fxModal').classList.remove('open')");
    w.eval('openFxModal()');
    d.getElementById('fx_em').value = '2026-12';
    d.getElementById('fx_sm').value = '2026-09';
    w.eval('syncFxEm()');
    s.check(d.getElementById('fx_em').value === '2026-12',
      'v2.9.51: 신규 추가 모드에서는 FROM을 바꿔도 TO가 자동 동기화되지 않음(반복 생성 정상 동작 유지)');
  }

  // ── ③-1 여러 건 선택 후 "선택 수정" → 첫 번째로 선택된 건(화면 정렬 기준)만 수정 팝업 대상 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-30','법인카드','N','0','',''],
        ['FIX-2','2026-05','급여','2700000','2026-05-10','급여','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const { dom } = await openPage(ROOT, portFor('fx-bulk-1'), 'fixed.html', sheetData, {});
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    w.eval("onFxSelChange('FIX-2',true)");
    w.eval("onFxSelChange('FIX-1',true)");
    s.check(w.eval('fxSelected.size') === 2, 'v2.9.50: 두 건이 정확히 선택됨');
    w.eval('bulkEditFx()');
    s.check(w.eval('editingFxId') === 'FIX-1', 'v2.9.50: "선택 수정"이 화면 정렬상 첫 번째 건(FIX-1, 4월)을 정확히 대상으로 함');
    s.check(d.getElementById('fx_cat').value === '법인카드', 'v2.9.50: 수정 팝업에 첫 번째 건의 데이터가 정확히 채워짐');
  }

  // ── ③-2 여러 건 선택 후 "선택 삭제" → 선택된 건만 정확히 삭제되고 나머지는 보존 ──
  {
    const sheetData = {
      S06: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FIX-1','2026-04','법인카드','2500000','2026-04-30','','N','0','',''],
        ['FIX-2','2026-05','급여','2700000','2026-05-10','','N','0','',''],
        ['FIX-3','2026-06','통신요금','120000','2026-06-10','','N','0','','']],
      S10: [['setting_key','setting_value','category','description','updated_at']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('fx-bulk-2'), 'fixed.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval("onFxSelChange('FIX-1',true)");
    w.eval("onFxSelChange('FIX-2',true)");
    await w.eval('bulkDelFx()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S06 || []).slice(1);
    s.check(saved.length === 1 && saved[0][0] === 'FIX-3',
      'v2.9.50: 선택한 2건만 정확히 삭제되고 선택하지 않은 1건(FIX-3)은 보존됨');
    s.check(w.eval('fxSelected.size') === 0, 'v2.9.50: 삭제 완료 후 선택 상태가 정확히 비워짐');
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
