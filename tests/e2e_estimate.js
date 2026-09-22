// tests/e2e_estimate.js — 견적서(estimate.html) E2E 회귀.
// 커버 범위: v2.9.13(_EMPTY 빈상태 마커, 삭제 후 재조회 시 빈행 부활 방지)
//           v2.9.17(지급형태 구분 — 사업소득형/급여형, 한 사람 두 행)
//           v2.9.18(급여형 MM=1 고정, 이중 일할계산 방지)
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_estimate');
  const baseSheet = (est) => ({
    S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
      ['PL-999','테스트','고객','','80','13000000','2026-09-01','2027-03-31','기타','수주','','','인력공급']],
    S03_PROJECT: [['project_id']],
    S11_GRADE_RATE: [['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at']],
    S14_HISTORY: [['hist_id']],
    S12_ESTIMATE: est,
  });

  // ── v2.9.13: 인력을 전부 삭제하고 저장 → 재조회해도 빈 행이 부활하지 않아야 함 ──
  {
    const sheetData = baseSheet([['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
      ['E1', 'PL-999', '인건비', '이무헌', '특급', '', '', '13000000', '7000000', '', '7', '2026-09-01', '2027-03-31', '', '']]);
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('emptymark1'), 'estimate.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    d.getElementById('oppSel').value = 'PL-999';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    w.eval('labor=[];renderLabor();');
    await w.eval('saveEstimate()');
    await new Promise(r => setTimeout(r, 300));
    const rows = (wc.S12 || []).slice(1).filter(r => r[2] === '인건비' || r[2] === '_EMPTY');
    s.check(rows.length === 1 && rows[0][2] === '_EMPTY', 'v2.9.13: 전부 삭제 후 저장하면 _EMPTY 마커 남김');

    // 재조회(새 세션 시뮬 — 새로고침 후에도 재현되던 케이스)
    const sheetData2 = baseSheet(wc.S12);
    const { dom: dom2 } = await openPage(ROOT, portFor('emptymark2'), 'estimate.html', sheetData2, { confirm: () => true });
    const w2 = dom2.window, d2 = w2.document;
    d2.getElementById('oppSel').value = 'PL-999';
    w2.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    s.check(w2.eval('labor.length') === 0, 'v2.9.13: 새 세션에서 재조회해도 빈 행 부활 없음(마커로 판별)');
  }

  // ── v2.9.13 회귀: 진짜 신규 견적은 여전히 편의상 빈 행 자동 추가 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-NEW','신규','고객','','80','50000000','2026-10-01','2027-03-31','기타','기회','','','인력공급']],
      S03_PROJECT: [['project_id']],
      S11_GRADE_RATE: [['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at']],
      S14_HISTORY: [['hist_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at']],
    };
    const { dom } = await openPage(ROOT, portFor('newest'), 'estimate.html', sheetData, {});
    const w = dom.window, d = w.document;
    d.getElementById('oppSel').value = 'PL-NEW';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    s.check(w.eval('labor.length') === 1, 'v2.9.13 회귀: 진짜 신규 견적은 빈 행 자동 추가 유지');
  }

  // ── v2.9.17/18/23: 한 사람 두 행(사업소득형/급여형) + 급여형 월별 지급액(부분월 실정산+만근월 단가) ──
  // v2.9.18(MM=1 고정)은 여러 달에 걸친 급여형 총액이 반영 안 되는 논리 오류였음(사용자 지적, 2026-09-14) —
  // v2.9.23에서 "월별 지급액 편집" 방식으로 재설계. 이 테스트도 새 설계 기준으로 갱신.
  {
    const sheetData = baseSheet([['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at']]);
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('paytype'), 'estimate.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    d.getElementById('oppSel').value = 'PL-999';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    // 급여형: 9/15 입사(부분월)~12/31, 월 240만원. 9월만 실정산액(120만)으로 오버라이드, 10~12월은 단가 그대로.
    w.eval(`labor=[
      {name:'박신입',grade:'초급',setId:'',sell:0,buy:2400000,start:'',end:'',mm:0,payType:'급여형',monthlyOverride:{}},
      {name:'이무헌',grade:'특급',setId:'',sell:13000000,buy:7000000,start:'2026-09-01',end:'2027-03-31',mm:7,payType:'사업소득형'}
    ]`);
    w.eval('renderLabor();');
    await new Promise(r => setTimeout(r, 50));
    const dateInputs = [...d.querySelectorAll('#laborList input[type=date]')];
    dateInputs[0].value = '2026-09-15'; dateInputs[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    dateInputs[1].value = '2026-12-31'; dateInputs[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const ovInputs = [...d.querySelectorAll('#laborList .fr3 + div input')];
    s.check(ovInputs.length === 4, 'v2.9.23: 급여형 월별 지급액 편집칸이 근무 개월수(4개월)만큼 렌더됨');
    ovInputs[0].value = '1200000';
    ovInputs[0].dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(w.eval('laborBuyTotal(labor[0])') === 8400000, 'v2.9.23: 부분월(120만)+만근3개월(240만×3)=840만원 정확 합산');

    await w.eval('saveEstimate()');
    await new Promise(r => setTimeout(r, 300));
    const rows = (wc.S12 || []).slice(1).filter(r => r[2] === '인건비');
    const salaried = rows.find(r => r[3] === '박신입');
    const biz = rows.find(r => r[3] === '이무헌');
    s.check(salaried && salaried[13].startsWith('급여형|'), 'v2.9.23: 급여형은 memo="급여형|{월별JSON}"으로 저장');
    // v2.9.24: 세금계산서형(계산서 발행, memo=공백)과 구분하기 위해 사업소득형도 명시 태그 필요해짐
    s.check(biz && biz[13] === '사업소득형', 'v2.9.24: 사업소득형은 memo="사업소득형"으로 명시 저장(세금계산서형과 구분)');
    s.check(salaried && salaried[8] === 8400000, 'v2.9.23: 급여형 buy_price는 월별 지급액 합계(8,400,000)로 저장');
    const savedJson = JSON.parse(salaried[13].split('|').slice(1).join('|'));
    s.check(Object.keys(savedJson).length === 4 && savedJson['2026-09'] === 1200000,
      'v2.9.23: 저장된 JSON에 4개월 전부 명시(9월=오버라이드값, 나머지=단가)');
  }

  // ── v2.9.26: 사업소득형 매입금액이 저장→재조회를 거쳐도 MM만큼 곱해지지 않아야 함(사용자 신고 버그) ──
  // 원인: 저장 시 buy(단가)×mm으로 총액화한 값을 buy_price에 넣었는데, 재조회 시 이 총액을 다시 "단가"로
  // 오인해 화면의 buy 필드에 복원 → 다음 저장 때 또 mm을 곱해 이중 반영됨. 해결: 단가(buy)와 금액(buyAmount)을
  // 별도 필드로 분리해, 사업소득형은 항상 buyAmount만 사용(mm 곱셈 없음).
  {
    const sheetData = baseSheet([['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at']]);
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('bizamount'), 'estimate.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    d.getElementById('oppSel').value = 'PL-999';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    w.eval(`labor=[{name:'김기황',grade:'고급',setId:'',sell:0,buy:0,buyAmount:9369234,start:'',end:'',mm:0,payType:'사업소득형'}]`);
    w.eval('renderLabor();');
    await new Promise(r => setTimeout(r, 50));
    const dateInputs = [...d.querySelectorAll('#laborList input[type=date]')];
    dateInputs[0].value = '2026-08-03'; dateInputs[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    dateInputs[1].value = '2026-09-02'; dateInputs[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(w.eval('laborBuyTotal(labor[0])') === 9369234, 'v2.9.26: 사업소득형 매입금액은 MM(1)과 무관하게 그대로');
    await w.eval('saveEstimate()');
    await new Promise(r => setTimeout(r, 300));
    const row = (wc.S12 || []).slice(1).find(r => r[3] === '김기황');
    s.check(row && row[8] === 9369234, 'v2.9.26: 저장된 buy_price가 이중계산 없이 9,369,234 그대로');

    // 재조회(새 세션) — 여기서 MM만큼 늘어나는 게 신고된 버그였음
    const sheetData2 = baseSheet(wc.S12);
    const { dom: dom2 } = await openPage(ROOT, portFor('bizamount2'), 'estimate.html', sheetData2, { confirm: () => true });
    const w2 = dom2.window, d2 = w2.document;
    d2.getElementById('oppSel').value = 'PL-999';
    w2.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    s.check(w2.eval('laborBuyTotal(labor[0])') === 9369234,
      'v2.9.26: 재조회해도 매입금액이 9,369,234 그대로(MM만큼 늘어나지 않음 — 신고된 버그 재현 방지)');
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
