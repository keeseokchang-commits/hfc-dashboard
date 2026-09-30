// tests/e2e_project_buyprice.js — S12.buy_price "단가" 계약 회귀(v2.9.31 근본 결함 발견 계기).
// 배경: project.html·cashflow.html·input.html은 전부 S12.buy_price를 "단가"로 취급해 mm을 곱해 총액을
// 계산한다. estimate.html의 저장 로직이 한때(v2.9.26~30 구간) 이 필드에 "이미 계산된 총액"을 잘못
// 저장한 적이 있었고, 그 결과 소비처에서 mm이 다시 곱해져 정확히 mm배만큼 원가가 부풀려졌다(세금계산서형
// 포함 — 사업소득형 UI만의 문제가 아니라 전체 인건비 매입 계산에 영향을 준 근본 결함이었음, 2026-09-14
// 실제 재현·확인). 이 계약("buy_price=단가, 급여형만 예외")이 앞으로도 깨지지 않는지 지켜본다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_project_buyprice');

  // 단가 7,000,000원 × MM 2 = 정확한 원가 14,000,000원(세금계산서형)
  const sheetData = {
    S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
      ['PL-BP','x','c','','80','30000000','2026-09-03','2026-11-02','기타','수주','','','인력공급']],
    S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
      ['PRJ-BP','PL-BP','p','c','30000000','2026-09-03','2026-11-02','수주']],
    S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']],
    S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
      ['E1','PL-BP','인건비','외주인력','고급','','','8500000','7000000','','2','2026-09-03','2026-11-02','','']],
  };

  // project.html: 견적 매입 합계가 buy_price(단가)×mm으로 정확히 계산되는지
  {
    const { dom } = await openPage(ROOT, portFor('bp-project'), 'project.html?pid=PRJ-BP', sheetData, { Chart: true });
    const d = dom.window.document;
    d.querySelectorAll('script').forEach(el => el.remove());
    const body = d.body.textContent.replace(/\s+/g, ' ');
    const m = body.match(/견적: 매출[^◆]{0,60}/);
    s.check(!!m && m[0].includes('14,000,000'),
      'project.html: 견적 매입 합계가 단가×MM=14,000,000으로 정확(총액으로 오인해 2배 부풀려지지 않음)');
  }

  // cashflow.html: 파이프라인 견적 원가율(estRatio, recalcEstimate 내부 지역함수라 직접 호출 불가) —
  // estAll 로드 자체가 정상이고 그 계산식(comp_type==='인건비' ? num(buy_price)*mm : ...)이 여전히
  // "buy_price=단가" 전제로 남아있는지 소스 레벨에서 확인(계약이 코드에서 실수로 바뀌지 않았는지 감시).
  {
    const src = require('fs').readFileSync(path.join(ROOT, 'cashflow.html'), 'utf8');
    const hasCorrectFormula = /num\(e\.buy_price\)\|\|0\)\*\(numF\(e\.mm\)\|\|0\)/.test(src);
    s.check(hasCorrectFormula,
      'cashflow.html: estRatio 계산식이 여전히 buy_price×mm(단가 계약) 형태를 유지 — 총액으로 오인하는 변경 없음');
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
