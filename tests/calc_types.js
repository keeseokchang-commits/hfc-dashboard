// tests/calc_types.js — 데이터 타입 안전성 회귀(v2.9.9 설계서 5개 결정 반영)
// 이 파일이 실패하면: 시트에 콤마 포함 텍스트가 들어와도 화면이 깨지지 않아야 한다는 원칙이 깨진 것.
// 배경: v2.9.7~8 "백만분의 1 축소" 사고(parseInt("13,200,000")→13) 재발 방지가 목적.
const { loadPureContext } = require('./_helpers');
const { makeSuite } = require('./_helpers');
const vm = require('vm');

function run() {
  const ctx = loadPureContext();
  const s = makeSuite('calc_types');
  const ev = code => vm.runInContext(code, ctx);

  // ① toObj: 콤마 포함 시트값 정규화(1차 방어)
  const obj = ev(`toObj([['revenue_id','tax_invoice_amt'],['R1','13,200,000']])`);
  s.check(obj[0].tax_invoice_amt === '13200000', 'toObj: 콤마 제거(13,200,000→13200000)');

  // ② num()/numF(): 콤마·공백·undefined 방어(2차 방어)
  s.check(ev(`num('13,200,000')`) === 13200000, 'num(): 콤마 포함 문자열 정확 파싱');
  s.check(ev(`num('')`) === 0, "num(): 빈 문자열→0");
  s.check(ev(`num(undefined)`) === 0, 'num(): undefined→0');

  // ③ rowsFor: 결정1(공백 처리 — ZERO_DEFAULT_COLS는 0, 그 외 숫자컬럼은 공백 유지)
  const r1 = ev(`rowsFor(['revenue_id','tax_invoice_amt'],[{revenue_id:'R1',tax_invoice_amt:''}])`);
  s.check(r1[0][1] === 0, 'rowsFor: ZERO_DEFAULT 컬럼(tax_invoice_amt) 공백→0');
  const r2 = ev(`rowsFor(['estimate_id','mm'],[{estimate_id:'E1',mm:''}])`);
  s.check(r2[0][1] === '', 'rowsFor: 비-ZERO_DEFAULT 숫자컬럼(mm) 공백 유지(값 없음≠0)');

  // ④ rowsFor: 결정4(기존 콤마 데이터 자동 마이그레이션 — 다음 저장 시 순수 숫자로)
  const r3 = ev(`rowsFor(['revenue_id','tax_invoice_amt'],[{revenue_id:'R1',tax_invoice_amt:'13,200,000'}])`);
  s.check(r3[0][1] === 13200000 && typeof r3[0][1] === 'number', 'rowsFor: 콤마 포함 값 저장 시 순수 number로 자동 정규화');

  // ⑤ rowsFor: 텍스트 컬럼은 원본 유지(숫자 강제 변환 없음)
  const r4 = ev(`rowsFor(['revenue_id','memo'],[{revenue_id:'R1',memo:'비고'}])`);
  s.check(r4[0][1] === '비고', 'rowsFor: 텍스트 컬럼 원본 그대로');

  // ⑥ 결정5: 자유형식 날짜 컬럼(S07.birth, S16.start/end)은 숫자화되지 않고 그대로 보존
  const r5 = ev(`rowsFor(HEADERS.S07,[{profile_id:'PF-1',name:'홍길동',birth:'76년생',career_years:'10',grade:'고급'}])`);
  const idxBirth = ev(`HEADERS.S07.indexOf('birth')`);
  const idxYears = ev(`HEADERS.S07.indexOf('career_years')`);
  s.check(r5[0][idxBirth] === '76년생', 'S07: birth 자유형식 보존(76년생, 숫자화 안 됨)');
  s.check(r5[0][idxYears] === 10 && typeof r5[0][idxYears] === 'number', 'S07: career_years는 숫자화(10, number)');

  const r6 = ev(`rowsFor(HEADERS.S16,[{item_id:'I1',profile_id:'PF-1',section:'경력',title:'회사A',start:'2020.01',end:'2021.12',sort:'1'}])`);
  const idxStart = ev(`HEADERS.S16.indexOf('start')`);
  const idxSort = ev(`HEADERS.S16.indexOf('sort')`);
  s.check(r6[0][idxStart] === '2020.01', 'S16: start 자유형식 보존(2020.01)');
  s.check(r6[0][idxSort] === 1 && typeof r6[0][idxSort] === 'number', 'S16: sort는 숫자화(1, number)');

  // ⑦ v2.9.22: S06 신규 필드(vat_amt)도 NUMERIC_COLS/ZERO_DEFAULT_COLS에 이미 있어 자동 안전해야 함
  const r7 = ev(`rowsFor(HEADERS.S06,[{fixed_id:'FIX-1',year_month:'2026-03',category:'임차료',amount:'500000',payment_date:'2026-03-25',memo:'',has_tax_invoice:'Y',vat_amt:'50,000'}])`);
  const idxVat = ev(`HEADERS.S06.indexOf('vat_amt')`);
  s.check(r7[0][idxVat] === 50000 && typeof r7[0][idxVat] === 'number', 'S06: vat_amt 콤마 제거+숫자화(50,000→50000)');

  return s;
}

if (require.main === module) {
  const s = run();
  const sum = s.summary();
  s.results.forEach(r => console.log((r.pass ? '✓ ' : '❌ ') + r.label));
  console.log(`\n${sum.name}: ${sum.pass}/${sum.total} 통과`);
  process.exit(sum.fail ? 1 : 0);
}
module.exports = run;
