// tests/e2e_etc_noinvoice.js — 기타원가(인프라·솔루션·기타) 세금계산서 수취 여부 + 개별입력 폼 삭제(v2.9.35) 회귀.
// 배경: 인건비만 지급형태(세금계산서형/사업소득형/급여형) 구분이 있고 기타원가는 구분이 없어 전부
// 자동으로 세금계산서형 취급되던 결함(사용자 발견: 계산서 없이 나간 원격지 근무 기타경비 728,000원이
// 마일스톤 회차로 잘못 쪼개짐). "급여형·사업소득형" 같은 인건비 체계는 기타원가에 안 맞아(허무맹랑한
// 근거였음, 사용자 지적) "세금계산서 수취 여부" 단일 축으로 재설계. 동시에 개별 입력 폼은 완전 삭제
// (예외 처리는 견적 재작성→스케줄 재생성으로 통일, 사용자 결정).
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_etc_noinvoice');

  // ── 개별 입력 폼이 완전히 삭제되었고, 그로 인해 loadAll()이 깨지지 않는지(핵심 회귀) ──
  // v2.9.35 작업 중 실제로 발생했던 사고: 폼 삭제 시 rev_project/cost_project DOM 참조가 남아
  // loadAll()의 try/catch에 걸려 renderLists() 자체가 실행되지 못하고 화면이 완전히 안 뜨던 결함.
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','c','','80','10000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','10000000','2026-09-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-1','2026-09','외주비','','','','1000000','2026-10-31','','100000','2026-09-30','','','']],
      S06_FIXED_COST: [['fixed_id']],
    };
    const { dom } = await openPage(ROOT, portFor('form-removed'), 'input.html', sheetData, {});
    const d = dom.window.document;
    s.check(!d.getElementById('rev_project'), 'v2.9.35: 매출 개별 등록 폼(rev_project 등)이 DOM에서 완전히 제거됨');
    s.check(!d.getElementById('cost_project'), 'v2.9.35: 매입 개별 등록 폼(cost_project 등)이 DOM에서 완전히 제거됨');
    const costHtml = d.getElementById('cost_list').innerHTML;
    s.check(costHtml.includes('1,000,000') || costHtml.includes('외주비'),
      'v2.9.35 핵심 회귀: 폼 삭제 후에도 loadAll()이 정상 실행되어 매입 목록이 정확히 렌더됨(로드 실패로 빈 화면 되지 않음)');
    const revEditButtons = [...d.querySelectorAll('#rev_list .btn-edit')].filter(b => b.textContent === '수정');
    const costEditButtons = [...d.querySelectorAll('#cost_list .btn-edit')].filter(b => b.textContent === '수정');
    s.check(revEditButtons.length === 0 && costEditButtons.length === 0,
      'v2.9.35: 목록 카드의 "수정" 버튼도 폼과 함께 제거됨(예외 처리는 견적 재작성으로 통일)');
  }

  // ── 기타원가 세금계산서 미수취 체크박스: 견적서 UI 존재, 저장·재조회, 청구스케줄 분류 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id']],
      S11_GRADE_RATE: [['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at']],
      S14_HISTORY: [['hist_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('etc-noinvoice'), 'estimate.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    d.getElementById('oppSel').value = 'PL-1';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    w.eval("addItem('etc')");
    await new Promise(r => setTimeout(r, 50));
    const cb = d.getElementById('etcList').querySelector('input[type=checkbox]');
    s.check(!!cb && cb.checked, 'v2.9.35: 기타원가 신규 추가 시 "세금계산서 수취" 기본값=체크(기존 동작과 완전 호환)');
    cb.checked = false;
    cb.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(w.eval('items.etc[0].hasTaxInvoice') === false, 'v2.9.35: 체크 해제 시 hasTaxInvoice=false로 정확히 반영');

    const nameInput = d.getElementById('etcList').querySelectorAll('input')[0];
    nameInput.value = '원격지 근무 지원비';
    nameInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    await w.eval('saveEstimate()');
    await new Promise(r => setTimeout(r, 300));
    const row = (wc.S12 || []).slice(1).find(r => r[3] === '원격지 근무 지원비');
    s.check(row && row[13].startsWith('_NOINVOICE_'), 'v2.9.35: 저장 시 memo에 _NOINVOICE_ 태그 인코딩(스키마 변경 없이)');

    // 재조회
    const sheetData2 = { ...sheetData, S12_ESTIMATE: wc.S12 };
    const { dom: dom2 } = await openPage(ROOT, portFor('etc-noinvoice2'), 'estimate.html', sheetData2, {});
    const w2 = dom2.window, d2 = w2.document;
    d2.getElementById('oppSel').value = 'PL-1';
    w2.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    s.check(w2.eval('items.etc[0].hasTaxInvoice') === false, 'v2.9.35: 재조회 시 체크 해제 상태 정확히 복원');
    const cb2 = d2.getElementById('etcList').querySelector('input[type=checkbox]');
    s.check(!!cb2 && cb2.checked === false, 'v2.9.35: 재조회 시 체크박스 UI도 해제 상태로 정확히 표시');

    // 청구 스케줄 생성에서 정확히 "계산서없음"으로 분류되는지(독립적인 픽스처로 명확히 검증)
    const sheetData3 = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-09-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['EST-2026-001','PL-1','기타','원격지 근무 지원비','','','1','0','728000','','','','','_NOINVOICE_','2026-09-22']],
    };
    const { dom: dom3 } = await openPage(ROOT, portFor('etc-noinvoice3'), 'input.html', sheetData3, {});
    const w3 = dom3.window, d3 = w3.document;
    w3.eval('openGenModal(true)');
    d3.getElementById('genPrj').value = 'PRJ-1';
    w3.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const c = w3.eval('genCtx()');
    s.check(c.eBuyInvoice === 0 && c.eBuyNonInvoice === 728000,
      'v2.9.35: 청구 스케줄 생성 시 세금계산서 미수취 기타원가(728,000원)가 "계산서없음"으로 정확히 분류(세금계산서형 아님)');
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
