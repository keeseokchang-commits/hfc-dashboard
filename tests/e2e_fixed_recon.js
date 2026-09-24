// tests/e2e_fixed_recon.js — 고정비 통장 대사(v2.9.41, 사용자 확정) 회귀.
// 배경: 매출(S04)·매입(S05)은 통장 대사(자동/수동 매칭, matched_txn_id·실지급일)가 갖춰져 있는데
// 고정비(S06)만 이 개념 자체가 스키마부터 없었다 — "계획"만 있고 "실제로 지급됐는지 확인"이 없는
// 상태. 사용자 확정에 따라 자금수지의 통장 대사 화면에 고정비도 매출·매입과 동일한 방식으로 추가.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_fixed_recon');

  // ── 자동 대사: 통장 CSV의 "고정비" 분류 출금이 계획과 금액·날짜가 일치하면 자동 매칭 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id']], S03_PROJECT: [['project_id']], S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']],
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FX1','2026-09','임차료','1000000','2026-09-25','','N','0','','']],
      S08_DETAIL: [['txn_id','txn_date','description','inflow_amt','outflow_amt','balance','recv','branch','category','year_month'],
        ['T1','2026-09-25','임차료 자동이체','0','1000000','5000000','','','고정비','2026-09']],
      S02_CASHFLOW_EST: [['year_month']], S09_DASHBOARD: [['year_month']], S13_VAT: [['vat_id']],
      S12_ESTIMATE: [['estimate_id']], S10_SETTINGS: [['setting_key']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('fixrecon-auto'), 'cashflow.html', sheetData, { writeCapture: wc, confirm: () => true, Chart: true });
    const w = dom.window;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    w.eval('rebuildRecon()');
    s.check(w.eval('unmatchedFix.length') === 1, 'v2.9.41: 미매칭 고정비 출금이 정확히 감지됨(자동 대사 실행 전)');
    w.eval("parsedTxns=[{date:'2026-09-25',desc:'임차료 자동이체',recv:'',outAmt:1000000,inAmt:0,cat:'고정비',txnId:'T1'}]");
    await w.eval('reconcile()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S06 || []).slice(1)[0];
    s.check(!!saved && saved[8] === 'T1', 'v2.9.41: 자동 대사 시 matched_txn_id가 정확히 채워짐');
    s.check(!!saved && saved[9] === '2026-09-25', 'v2.9.41: 자동 대사 시 pay_actual_date가 정확히 채워짐');
  }

  // ── 고정비 화면(fixed.html): 지급완료 배지 표시, 지급 해제 시 계획 자체는 보존 ──
  {
    const sheetData = {
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FX1','2026-09','임차료','1000000','2026-09-25','','N','0','T1','2026-09-25']],
      S10_SETTINGS: [['setting_key']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('fixrecon-badge'), 'fixed.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    const html = d.getElementById('fxBody').innerHTML;
    s.check(html.includes('지급완료'), 'v2.9.41: 대사 완료된 고정비 건에 "지급완료" 배지 표시');
    s.check(html.includes('지급 해제'), 'v2.9.41: 대사 완료된 건에만 "지급 해제" 버튼 노출');
    await w.eval("unmatchFxPay('FX1')");
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S06 || []).slice(1)[0];
    s.check(saved[8] === '' && saved[9] === '', 'v2.9.41: 지급 해제 시 대사 정보(matched_txn_id·pay_actual_date)만 제거');
    s.check(saved[2] === '임차료' && Number(saved[3]) === 1000000, 'v2.9.41: 지급 해제해도 계획 자체(항목명·금액)는 그대로 보존');
  }

  // ── 헤더 확장 회귀: fixed.html에서 다른 건(FX2)을 수정해도 FX1의 대사 정보가 함께
  //           지워지지 않는지(v2.9.37/38의 "부분 갱신이 전체 데이터를 건드리는" 위험과 동일 계열) ──
  {
    const sheetData = {
      S06_FIXED_COST: [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt','matched_txn_id','pay_actual_date'],
        ['FX1','2026-09','임차료','1000000','2026-09-25','','N','0','T1','2026-09-25'],
        ['FX2','2026-09','통신비','50000','2026-09-25','','N','0','','']],
      S10_SETTINGS: [['setting_key']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('fixrecon-header'), 'fixed.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    await new Promise(r => setTimeout(r, 300));
    // FX2(대사 안 된 건)만 수정 — FX1의 대사 정보가 함께 지워지면 안 됨
    w.eval("editFx('FX2')");
    d.getElementById('fx_amt').value = '55,000';
    await w.eval('saveFx()');
    await new Promise(r => setTimeout(r, 300));
    const saved = (wc.S06 || []).slice(1);
    const fx1 = saved.find(r => r[0] === 'FX1');
    const fx2 = saved.find(r => r[0] === 'FX2');
    s.check(!!fx1 && fx1[8] === 'T1' && fx1[9] === '2026-09-25',
      'v2.9.41: 다른 건(FX2) 수정 시에도 FX1의 대사 정보(matched_txn_id·pay_actual_date)가 그대로 보존');
    s.check(!!fx2 && Number(fx2[3]) === 55000, 'v2.9.41: FX2 자체는 정확히 수정된 금액으로 저장');
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
