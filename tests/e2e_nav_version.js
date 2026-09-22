// tests/e2e_nav_version.js — 배포 버전 표시(v2.9.28) E2E 회귀.
// nav.js가 모든 화면 헤더(.app-logo 또는 .app-title)에 버전 배지를 주입하는지 확인.
// 화면마다 헤더 클래스명이 다른(app-logo/app-title) 기존 비일관성 때문에 특정 화면(profile.html)만
// 누락되는 사고가 있었음 — 신규 화면 추가 시 이 목록에도 반영해 누락을 조기 발견한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html','pipeline.html','estimate.html','project.html','input.html',
  'profile.html','fixed.html','cashflow.html','vat.html','settings.html'];

async function run() {
  const s = makeSuite('e2e_nav_version');
  for (const page of PAGES) {
    const { dom } = await openPage(ROOT, portFor('ver-'+page), page, {}, { Chart: true });
    const badge = dom.window.document.querySelector('.hfc-ver-badge');
    s.check(!!badge && /^v\d+\.\d+\.\d+$/.test(badge.textContent),
      `${page}: 헤더에 버전 배지 표시(${badge ? badge.textContent : '없음'})`);
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
