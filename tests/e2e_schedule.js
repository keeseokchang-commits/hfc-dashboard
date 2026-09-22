// tests/e2e_schedule.js — 청구 스케줄 생성(input.html) E2E 회귀.
// 이 파일은 실제 화면 조작 순서를 그대로 재현해야만 잡히는 결함들을 모은 것 — 순수 함수 테스트로는 안 잡힌다.
// 커버 범위: v2.9.10(undefined 저장버그) v2.9.11(견적소실시 과거스케줄 방치) v2.9.14(_EMPTY 마커 오염)
//           v2.9.15(매입 직접입력 기준) v2.9.16(체크박스 강제 OFF 타이밍버그)
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_schedule');

  // ── v2.9.10: 미리보기 금액을 직접 수정하면 undefined가 되어 저장이 막히던 결함 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-09-03','2027-04-02','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행 모바일뱅킹','부산은행','69500000','2026-09-03','2027-04-02','수주']],
      S04_REVENUE: [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date']],
      S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-105','인건비','인력','고급','','','7350000','7000000','','10','2026-09-03','2027-04-02','','']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('undef'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const inputs = [...d.querySelectorAll('#genPreviewWrap input')];
    const el = inputs[1]; // [날짜,금액,날짜, ...] 중 첫 회차 금액칸
    el.value = '22050000';
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    s.check(el.value === '22,050,000', 'v2.9.10: 금액 직접 수정 시 undefined 없이 콤마 표시');
    d.getElementById('genDoCost').checked = false;
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const saved = (wc.S04 || []).slice(1);
    s.check(saved[0] && saved[0][3] === 22050000, 'v2.9.10: 수정한 금액이 저장 시 정확히 반영(undefined 아님)');
  }

  // ── v2.9.16: "직접 입력" 전환 순간 체크박스가 꺼진 채 안 돌아오던 결함 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-09-03','2027-04-02','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행 모바일뱅킹','부산은행','69500000','2026-09-03','2027-04-02','수주']],
      S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['COST-2026-001','PRJ-2026-007','2026-10','외주비','','','','10000000','2026-11-30','매입 스케줄 자동생성','1000000','2026-10-31','','','']],
      S06_FIXED_COST: [['fixed_id']],
      // v2.9.14 재발 방지 겸용: _EMPTY 마커만 있는 상태(견적 실질 없음)에서도 이 결함이 재현됐었음
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['EST-2026-002','PL-105','_EMPTY','','','','','0','0','0','','','','견적 항목 없음(의도적 삭제 표시)','2026-09-21']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('manualcost'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');

    // v2.9.14 확인: _EMPTY 마커가 "견적 있음"으로 오인되지 않아야 함
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c0 = w.eval('genCtx()');
    s.check(c0.hasEst === false, 'v2.9.14: _EMPTY 마커만 있으면 견적 없음으로 정확히 판정');

    // v2.9.16 재현: 매출 체크 해제 → 매입기준 직접입력 전환(금액 0인 찰나) → 이후 금액 입력
    d.getElementById('genDoRev').checked = false;
    d.getElementById('genDoRev').dispatchEvent(new w.Event('change', { bubbles: true }));
    const manualRadio = d.querySelector('input[name=genCostBase][value=manual]');
    manualRadio.checked = true;
    manualRadio.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(!d.getElementById('genDoCost').checked === false, 'v2.9.16: 직접입력 전환 순간에도 체크박스 checked 유지(disabled만 사용)');
    const manualInput = d.getElementById('costBaseManual');
    manualInput.value = '70000000';
    manualInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(!d.getElementById('genDoCost').disabled, 'v2.9.16: 금액 입력 후 체크박스 정상 활성화');
    s.check(!d.getElementById('genSaveBtn').disabled, 'v2.9.16: 저장 버튼 정상 활성화');

    // v2.9.11 확인: 견적 없어 매입 재생성 불가 상태에서도 과거 매입(1건)을 정리 확인 후 삭제
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const savedCost = (wc.S05 || []).slice(1);
    s.check(savedCost.length === 3 && savedCost.reduce((a, r) => a + r[7], 0) === 70000000,
      'v2.9.15/16: 견적 없이 직접입력(70,000,000)으로 매입 3건 정상 저장');
  }

  // ── v2.9.24: 급여형·사업소득형은 세금계산서가 없으므로 매입 스케줄(S05) 생성 대상에서 제외되어야 함.
  //           세금계산서형(외주)만 매입 스케줄에 반영, 3종 혼합 시에도 매출은 전원 포함·매입은 세금계산서형만. ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-999','테스트','고객','','80','30000000','2026-09-01','2027-03-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-999','PL-999','테스트PJ','고객','30000000','2026-09-01','2027-03-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      // 외주업체(세금계산서형)+프리랜서(사업소득형)+정직원(급여형) 3인 혼합
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-999','인건비','외주업체','특급','','','13000000','7000000','','7','2026-09-01','2027-03-31','',''],
        ['E2','PL-999','인건비','프리랜서','고급','','','10000000','8000000','','7','2026-09-01','2027-03-31','사업소득형',''],
        ['E3','PL-999','인건비','정직원','초급','','','0','2400000','','7','2026-09-01','2027-03-31',
          '급여형|{"2026-09":2400000,"2026-10":2400000,"2026-11":2400000,"2026-12":2400000,"2027-01":2400000,"2027-02":2400000,"2027-03":2400000}','']],
    };
    const { dom } = await require('./_e2e_helpers').openPage(ROOT, portFor('salaried-sched'), 'input.html', sheetData, {});
    const w = dom.window, d = w.document;
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-999';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c = w.eval('genCtx()');
    s.check(c.eSell === 161000000, 'v2.9.24: 매출은 지급형태 무관하게 3인 전원 포함(161,000,000)');
    s.check(c.eBuy === 49000000, 'v2.9.24: 매입은 세금계산서형(외주업체)만 포함(49,000,000, 나머지 2인 제외)');

    // 급여형만 단독으로 있으면 매입 생성 자체가 불가능해야 함(canCost=false)
    const sheetData2 = { ...sheetData,
      S12_ESTIMATE: [sheetData.S12_ESTIMATE[0], sheetData.S12_ESTIMATE[3]] };
    const { dom: dom2 } = await require('./_e2e_helpers').openPage(ROOT, portFor('salaried-only'), 'input.html', sheetData2, {});
    const w2 = dom2.window, d2 = w2.document;
    w2.eval('openGenModal(true)');
    d2.getElementById('genPrj').value = 'PRJ-999';
    w2.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c2 = w2.eval('genCtx()');
    s.check(c2.eBuy === 0 && c2.canCost === false, 'v2.9.24: 급여형만 있으면 매입 스케줄 생성 자체가 불가능(canCost=false)');
    s.check(d2.getElementById('genDoCost').disabled === true, 'v2.9.24: 급여형만 있을 때 매입 체크박스 비활성화');
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
