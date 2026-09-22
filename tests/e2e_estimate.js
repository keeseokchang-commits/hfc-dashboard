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

  // ── v2.9.17/18: 한 사람 두 행(사업소득형/급여형) + 급여형 MM=1 고정, 이중계산 없음 ──
  {
    const sheetData = baseSheet([['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at']]);
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('paytype'), 'estimate.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    d.getElementById('oppSel').value = 'PL-999';
    w.eval('loadOpp()');
    await new Promise(r => setTimeout(r, 100));
    // 급여형: 9/15 입사(어중간한 날짜)인데 실지급액을 그대로 입력 — 이중 일할계산 없어야 함
    w.eval(`labor=[
      {name:'박신입',grade:'초급',setId:'',sell:0,buy:1200000,start:'',end:'',mm:0,payType:'급여형'},
      {name:'이무헌',grade:'특급',setId:'',sell:13000000,buy:7000000,start:'2026-09-01',end:'2027-03-31',mm:7,payType:'사업소득형'}
    ]`);
    w.eval('renderLabor();');
    await new Promise(r => setTimeout(r, 50));
    const dateInputs = [...d.querySelectorAll('#laborList input[type=date]')];
    dateInputs[0].value = '2026-09-15'; dateInputs[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    dateInputs[1].value = '2026-09-30'; dateInputs[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    s.check(w.eval('labor[0].mm') === 1, 'v2.9.18: 급여형은 어중간한 입사일이어도 MM=1 고정');
    s.check(d.getElementById('mm_0').disabled === true, 'v2.9.18: 급여형 MM 입력칸 비활성화');
    s.check(Math.round(w.eval('labor[0].buy*labor[0].mm')) === 1200000, 'v2.9.18: 급여형 원가=실지급액 그대로(이중계산 없음)');

    await w.eval('saveEstimate()');
    await new Promise(r => setTimeout(r, 300));
    const rows = (wc.S12 || []).slice(1).filter(r => r[2] === '인건비');
    const salaried = rows.find(r => r[3] === '박신입');
    const biz = rows.find(r => r[3] === '이무헌');
    s.check(salaried && salaried[13] === '급여형', 'v2.9.17: 급여형은 memo="급여형"으로 저장');
    s.check(biz && biz[13] === '', 'v2.9.17: 사업소득형은 memo=공백으로 저장(기존 데이터 호환)');
    s.check(salaried && salaried[8] === 1200000, 'v2.9.17: 급여형 매입단가(buy_price) 실지급액 그대로 저장');
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
