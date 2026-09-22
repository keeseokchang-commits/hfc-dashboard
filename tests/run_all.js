#!/usr/bin/env node
// tests/run_all.js — HFC 경영관리 시스템 전체 회귀 테스트 실행기.
// 사용법: cd v20 && node tests/run_all.js
// 새 결함을 고칠 때마다: ①이 스위트를 먼저 돌려 기존이 안 깨졌는지 확인 ②새 케이스를 해당 tests/*.js에 추가 ③다시 전체 실행.
// 파일명 규칙: calc_*.js = 순수 함수(vm, DOM 없음, 빠름) / e2e_*.js = 실제 화면 조작 재현(jsdom, 느림).
const fs = require('fs');
const path = require('path');

const testFiles = fs.readdirSync(__dirname)
  .filter(f => /^(calc_|e2e_).*\.js$/.test(f))
  .sort();

async function main() {
  console.log(`═══ HFC 회귀 테스트 스위트 — ${testFiles.length}개 파일 ═══\n`);
  let totalPass = 0, totalFail = 0;
  const failedSuites = [];

  for (const file of testFiles) {
    const mod = require(path.join(__dirname, file));
    let suite;
    try {
      suite = typeof mod === 'function' ? await mod() : mod;
    } catch (e) {
      console.log(`❌ ${file} — 실행 자체가 실패: ${e.message}\n`);
      totalFail++;
      failedSuites.push(file);
      continue;
    }
    const sum = suite.summary();
    totalPass += sum.pass;
    totalFail += sum.fail;
    const icon = sum.fail === 0 ? '✓' : '❌';
    console.log(`${icon} ${file} — ${sum.pass}/${sum.total} 통과`);
    if (sum.fail > 0) {
      failedSuites.push(file);
      sum.failures.forEach(f => console.log(`    ❌ ${f.label}`));
    }
  }

  try { require('./_e2e_helpers').closeSharedServer(); } catch (e) {}

  console.log(`\n═══ 결과: ${totalPass}개 통과, ${totalFail}개 실패 ═══`);
  if (failedSuites.length) {
    console.log('실패한 파일: ' + failedSuites.join(', '));
    process.exit(1);
  } else {
    console.log('전체 회귀 통과.');
    process.exit(0);
  }
}

main().catch(e => { console.error('러너 오류:', e); process.exit(1); });
