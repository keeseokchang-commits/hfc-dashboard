// tests/calc_mm.js — MM 일할계산 공식 회귀(v2.9.19 확정: 실무 방식)
// 공식: 완전월=1.00, 시작월=(그달 말일-투입일+1)/그달 총일수, 종료월=철수일/그달 총일수,
//       총MM=시작월+중간완전월+종료월. mmMonthly는 마지막 달을 총MM에서 역산(반올림 오차 흡수, 사용자 확정).
// 이 파일이 실패하면: MM 계산 공식이 실무 방식에서 벗어났다는 뜻 — 절대 "구 SI 관례"로 되돌리지 말 것(v2.9.19 커밋 사유 참조).
const { loadPureContext, makeSuite } = require('./_helpers');

function run() {
  const ctx = loadPureContext();
  const s = makeSuite('calc_mm');
  const mmTotal = (a, b) => vmEval(ctx, `mmTotal('${a}','${b}')`);
  const mmMonthly = (a, b) => vmEval(ctx, `JSON.stringify(mmMonthly('${a}','${b}'))`);

  // 사용자 제시 원본 예시(2026-09-14 대화에서 직접 확정)
  s.check(mmTotal('2026-02-25', '2026-02-28') === '0.14', 'mmTotal 2/25~2/28(28일월) = 0.14');
  s.check(mmTotal('2026-03-25', '2026-03-31') === '0.23', 'mmTotal 3/25~3/31(31일월) = 0.23');

  // 3인 예제(v1.2 승인) — v2.9.19 공식 갱신 후 기대값
  s.check(mmTotal('2026-03-12', '2026-09-11') === '6.01', '이무헌 3/12~9/11 = 6.01(구 6.00에서 갱신)');
  s.check(mmTotal('2026-03-12', '2026-11-11') === '8.01', '권용현 3/12~11/11 = 8.01(구 8.00에서 갱신)');
  s.check(mmTotal('2026-01-01', '2026-01-31') === '1.00', '정혜림 1/1~1/31(월초~월말 만근) = 1.00');
  s.check(mmTotal('2026-02-01', '2026-02-28') === '1.00', '2월 만근(평년, 28일) = 1.00');

  // mmMonthly: 총합이 mmTotal과 정확히 일치해야 함(마지막 달 역산 원칙, v2.9.19)
  const m1 = JSON.parse(mmMonthly('2026-03-12', '2026-09-11'));
  const sum1 = m1.reduce((a, x) => a + x.mm, 0);
  s.check(Math.abs(sum1 - 6.01) < 0.001, 'mmMonthly 합계가 mmTotal(6.01)과 정확히 일치');
  s.check(m1[0].mm === 0.65, '시작월(3월)은 실제 근무일 기준 0.65');
  s.check(m1[m1.length - 1].mm === 0.36, '종료월(9월)은 총MM 역산값 0.36');

  const m2 = JSON.parse(mmMonthly('2026-03-12', '2026-11-11'));
  const sum2 = m2.reduce((a, x) => a + x.mm, 0);
  s.check(Math.abs(sum2 - 8.01) < 0.001, '권용현 mmMonthly 합계가 mmTotal(8.01)과 정확히 일치');

  // 단일월(같은 달 시작~종료)
  const m3 = JSON.parse(mmMonthly('2026-02-25', '2026-02-28'));
  s.check(m3.length === 1 && m3[0].mm === 0.14, '단일월 케이스: mmTotal 그대로 사용');

  return s;
}

function vmEval(ctx, code) {
  const vm = require('vm');
  return vm.runInContext(code, ctx);
}

if (require.main === module) {
  const s = run();
  const sum = s.summary();
  s.results.forEach(r => console.log((r.pass ? '✓ ' : '❌ ') + r.label));
  console.log(`\n${sum.name}: ${sum.pass}/${sum.total} 통과`);
  process.exit(sum.fail ? 1 : 0);
}
module.exports = run;
