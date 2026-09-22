// tests/e2e_vat.js — 부가세 관리(vat.html) E2E 회귀.
// 커버 범위: v2.9.21(납부완료 분기 확정값 잠금 + 사후 변경 경고)
//           v2.9.22(기타경비 세금계산서 매입세액 반영)
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_vat');
  const baseSheet = (rv, cs, vt, fx) => ({
    S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
      ['PL-1','x','c','','80','13000000','2026-01-01','2026-12-31','기타','수주','','','인력공급']],
    S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
      ['PRJ-1','PL-1','p','c','13000000','2026-01-01','2026-12-31','수주']],
    S04_REVENUE: rv, S05_COST: cs, S13_VAT: vt, S06_FIXED_COST: fx || [['fixed_id']],
  });

  // ── v2.9.21: 납부완료 후 데이터가 바뀌면 확정값은 유지하되 경고를 띄움 ──
  {
    const sheetData = baseSheet(
      [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        ['R1','PRJ-1','2026-02','15000000','16500000','2026-02-28','Y','','1500000','2026-02-28','2026-02-28','','2026-02-28']],
      [['cost_id']],
      [['vat_id','year','quarter_code','period_start','period_end','due_date','sales_vat','purchase_vat','estimated_payment','actual_payment','paid_date','cashflow_reflected','status','memo'],
        ['VAT-2026-1P','2026','1P','2026-01-01','2026-03-30','2026-04-25','1000000','0','1000000','1000000','2026-04-20','N','납부완료','1기 예정']] // 확정 당시 매출은 1000만이었음
    );
    const { dom } = await openPage(ROOT, portFor('vatlock'), 'vat.html', sheetData, {});
    const d = dom.window.document;
    const html = d.getElementById('qList').innerHTML;
    s.check(html.includes('1,000,000원'), 'v2.9.21: 납부완료 분기는 확정값(100만원) 표시(현재 재계산값 150만이 아님)');
    s.check(html.includes('신고 확정'), 'v2.9.21: "신고 확정" 라벨 표시');
    s.check(html.includes('신고 이후'), 'v2.9.21: 확정 후 데이터 변경 시 경고 문구 표시');
  }

  // ── v2.9.21 회귀: 변경 없는 확정 분기는 경고 없음 ──
  {
    const sheetData = baseSheet(
      [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        ['R1','PRJ-1','2026-02','10000000','11000000','2026-02-28','Y','','1000000','2026-02-28','2026-02-28','','2026-02-28']],
      [['cost_id']],
      [['vat_id','year','quarter_code','period_start','period_end','due_date','sales_vat','purchase_vat','estimated_payment','actual_payment','paid_date','cashflow_reflected','status','memo'],
        ['VAT-2026-1P','2026','1P','2026-01-01','2026-03-30','2026-04-25','1000000','0','1000000','1000000','2026-04-20','N','납부완료','1기 예정']]
    );
    const { dom } = await openPage(ROOT, portFor('vatnochg'), 'vat.html', sheetData, {});
    const d = dom.window.document;
    const html = d.getElementById('qList').innerHTML;
    s.check(!html.includes('신고 이후'), 'v2.9.21 회귀: 변경 없으면 경고 없음');
  }

  // ── v2.9.22: 기타경비(고정비) 세금계산서가 매입세액에 합산, 미수취 항목은 제외 ──
  {
    const sheetData = baseSheet(
      [['revenue_id','project_id','year_month','tax_invoice_amt','cash_recv_amt','cash_recv_date','is_received','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','recv_actual_date'],
        ['R1','PRJ-1','2026-02','10000000','11000000','2026-02-28','Y','','1000000','2026-02-28','2026-02-28','','2026-02-28']],
      [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-1','2026-02','외주비','','','','3000000','2026-02-28','','300000','','2026-02-28','','']],
      [['vat_id']],
      [['fixed_id','year_month','category','amount','payment_date','memo','has_tax_invoice','vat_amt'],
        ['FIX-1','2026-02','임차료','500000','2026-02-25','','Y','50000'],
        ['FIX-2','2026-02','통신비','100000','2026-02-25','','N','']]
    );
    const { dom } = await openPage(ROOT, portFor('vatfixed'), 'vat.html', sheetData, {});
    const w = dom.window;
    const c = w.eval("calcQ('1P')");
    s.check(c.pVatPrj === 300000, 'v2.9.22: 프로젝트 매입세액(30만원) 정확');
    s.check(c.pVatFx === 50000, 'v2.9.22: 기타경비 세금계산서(임차료 5만원) 매입세액에 합산');
    s.check(c.pVat === 350000, 'v2.9.22: 총 매입세액=프로젝트+기타경비 합산(35만원)');
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
