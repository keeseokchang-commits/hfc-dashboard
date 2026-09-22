// tests/e2e_confirmed_data.js — 확정 데이터 보호 + 마일스톤 저장/복원 E2E 회귀.
// 커버 범위: 확정 데이터 필터(is_received='Y', invoice_date 존재는 재생성 대상에서 원천 제외)
//           v2.9.12(마일스톤 회차 설정 저장·복원, S17_MILESTONE)
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_confirmed_data');

  // ── 확정 데이터 보호: is_received='Y'인 매출, invoice_date 있는 매입은 재생성 대상 필터에서 제외 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','c','','80','13000000','2026-09-01','2027-03-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','p','c','13000000','2026-09-01','2027-03-31','수주']],
      S04_REVENUE: [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        // 이미 입금 완료된 건(is_received=Y) — 재생성에서 절대 지워지면 안 됨
        ['REV-CONFIRMED','PRJ-1','2026-09','5000000','5500000','2026-09-30','Y','기입금건','500000','2026-09-30','2026-09-30','TXN-1','2026-09-30']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        // 이미 세금계산서 수취된 건(invoice_date 있음) — 재생성에서 절대 지워지면 안 됨
        ['COST-CONFIRMED','PRJ-1','2026-09','외주비','','','','3000000','2026-09-30','기수취건','300000','2026-09-30','2026-09-30','TXN-2','2026-09-30']],
      S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','인력','고급','','','13000000','7000000','','7','2026-09-01','2027-03-31','','']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('confirmed'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-1';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const savedRev = (wc.S04 || []).slice(1);
    const savedCost = (wc.S05 || []).slice(1);
    s.check(savedRev.some(r => r[0] === 'REV-CONFIRMED'), '확정 매출(입금완료)은 재생성 후에도 시트에 그대로 존재');
    s.check(savedCost.some(r => r[0] === 'COST-CONFIRMED'), '확정 매입(세금계산서 수취)은 재생성 후에도 시트에 그대로 존재');
  }

  // ── v2.9.12: 마일스톤 회차 설정(비율·기준일) 저장 후 재조회 시 복원 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-03-12','2026-09-11','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행 모바일뱅킹','부산은행','69500000','2026-03-12','2026-09-11','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id']],
      S17_MILESTONE: [['project_id','rounds','items_json','updated_at']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('milestone1'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal()');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    d.getElementById('msR_0').value = '25'; d.getElementById('msR_1').value = '45'; d.getElementById('msR_2').value = '30';
    d.getElementById('msD_0').value = '2026-09-10';
    w.eval('msCalc()');
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    s.check(!!wc.S17, 'v2.9.12: 마일스톤 설정이 S17에 저장됨');

    // 재조회: 저장된 값으로 다시 로드
    const sheetData2 = { ...sheetData, S17_MILESTONE: wc.S17 };
    const { dom: dom2 } = await openPage(ROOT, portFor('milestone2'), 'input.html', sheetData2, { confirm: () => true });
    const w2 = dom2.window, d2 = w2.document;
    w2.eval('openGenModal()');
    d2.getElementById('genPrj').value = 'PRJ-2026-007';
    w2.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const r0 = d2.getElementById('msR_0').value, d0 = d2.getElementById('msD_0').value;
    s.check(r0 === '25' && d0 === '2026-09-10', 'v2.9.12: 재조회 시 커스텀 회차 설정(25%, 9/10) 정확히 복원');
  }

  // ── v2.9.25: 지급형태를 세금계산서형→사업소득형으로 바꿔 견적 매입이 0이 된 경우,
  //           매출 체크 해제+매입 체크만 있는 상태에서도 저장 버튼이 열려 과거 매입 스케줄을
  //           정리할 수 있어야 함(사용자 반복 지적: "변경 사항이 업데이트가 안 된다"). ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-09-03','2027-04-02','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행 모바일뱅킹','부산은행','69500000','2026-09-03','2027-04-02','수주']],
      S04_REVENUE: [['revenue_id']],
      // 과거 세금계산서형 기준으로 이미 생성된 매입 스케줄 3건
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['COST-2026-001','PRJ-2026-007','2026-09','외주비','','','','20850000','2026-10-31','매입 스케줄 자동생성','2085000','2026-09-03','','',''],
        ['COST-2026-002','PRJ-2026-007','2026-12','외주비','','','','27800000','2027-01-31','매입 스케줄 자동생성','2780000','2026-12-17','','',''],
        ['COST-2026-003','PRJ-2026-007','2027-04','외주비','','','','20850000','2027-05-31','매입 스케줄 자동생성','2085000','2027-04-02','','','']],
      S06_FIXED_COST: [['fixed_id']],
      // 이후 지급형태를 사업소득형으로 변경(세금계산서형 인력 없음 → 매입 스케줄 생성 대상 0)
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-105','인건비','이무헌','특급','','','69500000','56000000','','7','2026-09-03','2027-04-02','사업소득형','']],
    };
    const wc = {};
    const { dom } = await require('./_e2e_helpers').openPage(ROOT, portFor('paytype-switch'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    d.getElementById('genDoRev').checked = false;
    d.getElementById('genDoRev').dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(!d.getElementById('genSaveBtn').disabled,
      'v2.9.25: 매출 체크 해제+매입 0건(지급형태 변경)이어도 저장 버튼 활성화(정리 가능 상태)');
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const remaining = (wc.S05 || []).slice(1);
    s.check(remaining.length === 0, 'v2.9.25: 저장 시 과거 세금계산서형 매입 스케줄 3건이 정리됨');
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
