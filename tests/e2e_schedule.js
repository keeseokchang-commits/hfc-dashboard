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

  // ── v2.9.36: "청구 스케줄 생성"(세금계산서 화면)은 세금계산서형 매입만 다룬다(사용자 확정,
  //           2026-09-15). 계산서없음(사업소득형·급여형·미수취 기타경비)의 지급 예정은 이 버튼과
  //           무관하게 자금수지(cashflow.html)가 견적에서 직접 계산해 반영한다 — "세금계산서" 메뉴에
  //           계산서 없는 거래의 "공급가액"·"수취예정" 같은 세금계산서 용어를 붙이는 것 자체가
  //           전제부터 틀렸다는 지적에 따른 재정정(v2.9.27~35의 "매입 스케줄=전 지급형태 포함" 설계 폐기). ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-999','테스트','고객','','80','30000000','2026-09-01','2027-03-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-999','PL-999','테스트PJ','고객','30000000','2026-09-01','2027-03-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      // 외주업체(세금계산서형, 단가7,000,000×7=49,000,000)+프리랜서(사업소득형, 계산서없음)+정직원(급여형, 계산서없음) 3인 혼합
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-999','인건비','외주업체','특급','','','13000000','7000000','','7','2026-09-01','2027-03-31','',''],
        ['E2','PL-999','인건비','프리랜서','고급','','','10000000','8000000','','7','2026-09-01','2027-03-31','사업소득형',''],
        ['E3','PL-999','인건비','정직원','초급','','','0','16800000','','7','2026-09-01','2027-03-31',
          '급여형|{"2026-09":2400000,"2026-10":2400000,"2026-11":2400000,"2026-12":2400000,"2027-01":2400000,"2027-02":2400000,"2027-03":2400000}','']],
    };
    const wc = {};
    const { dom } = await require('./_e2e_helpers').openPage(ROOT, portFor('salaried-sched'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-999';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c = w.eval('genCtx()');
    s.check(c.eSell === 161000000, 'v2.9.27: 매출은 지급형태 무관하게 3인 전원 포함(161,000,000)');
    s.check(c.eBuy === 49000000, 'v2.9.36: 청구 스케줄 매입기준(eBuy)은 세금계산서형(외주업체)만(49,000,000), 계산서없음 2인 제외');

    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const saved = (wc.S05 || []).slice(1);
    const totalAmount = saved.reduce((sum, r) => sum + r[7], 0);
    const totalVat = saved.reduce((sum, r) => sum + r[10], 0);
    s.check(totalAmount === 49000000, 'v2.9.36: 저장된 매입은 세금계산서형(외주업체)만(49,000,000) — 계산서없음은 S05에 생성되지 않음');
    s.check(totalVat === 4900000, 'v2.9.36: 저장된 부가세는 세금계산서형 전액 기준(4,900,000)');
    s.check(saved.every(r => (parseInt(String(r[10]).replace(/,/g,''))||0) > 0 || r[7] === 0),
      'v2.9.36: S05에 저장된 모든 매입 건이 부가세를 가짐(계산서없음 행이 섞이지 않음)');
  }

  // ── v2.9.31: 근본 결함 회귀 방지 — S12.buy_price는 시스템 전체(project.html·cashflow.html·input.html의
  //           monthlyProfile)가 "단가"로 취급해 mm을 곱한다. 세금계산서형 견적을 저장할 때(estimate.html)
  //           buy_price에 실수로 "이미 계산된 총액"이 들어가면, 청구 스케줄 생성 시 그 총액에 mm이
  //           다시 곱해져 정확히 mm배만큼 부풀려진다 — 이 왜곡이 재발하지 않는지 직접 확인한다. ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-U','x','c','','80','30000000','2026-09-03','2026-11-02','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-U','PL-U','p','c','30000000','2026-09-03','2026-11-02','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      // 단가 7,000,000원, MM 2 → 정확한 총액은 14,000,000원(단가 그대로 저장된 정상 케이스)
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-U','인건비','외주인력','고급','','','8500000','7000000','','2','2026-09-03','2026-11-02','','']],
    };
    const { dom } = await require('./_e2e_helpers').openPage(ROOT, portFor('unitprice-guard'), 'input.html', sheetData, {});
    const w = dom.window, d = w.document;
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-U';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c = w.eval('genCtx()');
    s.check(c.eBuy === 14000000,
      'v2.9.31: 단가(7,000,000)×MM(2)=14,000,000 정확 — buy_price를 총액으로 오인해 2배 부풀려지지 않음');
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
