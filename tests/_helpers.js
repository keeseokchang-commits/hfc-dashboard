// tests/_helpers.js — 회귀 테스트 공용 유틸(v2.9.22 기준)
// 순수 계산 계층(schema.js·common.js·calc.js)을 vm 컨텍스트에 로드해 브라우저 없이 검증한다.
// DOM 의존 함수(clearAndWrite의 fetch 호출부 등)는 이 컨텍스트에서 실행하지 않는다 — 그건 tests/e2e_*.js에서 jsdom으로 다룬다.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadPureContext() {
  const ctx = { console };
  vm.createContext(ctx);
  const root = path.join(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8');
  const common = fs.readFileSync(path.join(root, 'js/common.js'), 'utf8')
    .replace(/async function clearAndWrite[\s\S]*?\n}\n/, '')   // fetch 의존부 제외
    .replace(/async function fetchSheetSafe[\s\S]*?\n}\n/, '')
    .replace(/async function ensureSheet[\s\S]*?\n}\n/, '')
    .replace(/async function signIn[\s\S]*?\n}\n/, '');
  const calc = fs.readFileSync(path.join(root, 'js/calc.js'), 'utf8');
  vm.runInContext(schema + '\n' + common + '\n' + calc, ctx);
  return ctx;
}

// 결과 집계용 간단 러너 — 각 테스트 파일이 이 형식의 배열을 반환하면 run_all.js가 합산한다.
function makeSuite(name) {
  const results = [];
  return {
    name,
    check(cond, label) { results.push({ pass: !!cond, label }); },
    results,
    summary() {
      const fail = results.filter(r => !r.pass);
      return { name, total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail };
    }
  };
}

module.exports = { loadPureContext, makeSuite };
