// tests/e2e_project_list_id.js — 프로젝트 목록 화면에 프로젝트 ID 노출(v2.9.58) 회귀.
// 배경: 사용자 지적 — "프로젝트 메뉴에서 프로젝트 ID가 노출이 안돼. 반면 각종 상세 화면에서는
// 프로젝트 코드로 표현하고 있고." project.html의 openDetail(상세 화면)에는 pid가 명확히
// 표시되는데(예: "PRJ-2026-001 · 사업기회..."), renderList(목록 카드)에는 고객사·기간·사업
// 유형만 있고 프로젝트 ID 자체가 빠져 있었다 — 같은 화면 안에서도 목록과 상세가 다른 정보
// 노출 기준을 갖고 있던 불일치. 목록 카드의 두 번째 줄 맨 앞에 project_id를 추가해 상세
// 화면과 동일한 형식(순수 ID, 예: "PRJ-2026-001")으로 통일.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_project_list_id');

  // ── 프로젝트 목록 카드에 project_id가 상세 화면과 동일한 형식으로 노출됨 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-101','포스코','이노라인','','100','143302450','2026-03-12','2026-09-11','익월말','계약','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-001','PL-101','포스코디엑스 과제 구축','이노라인','143302450','2026-03-12','2026-09-11','계약']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']],
    };
    const { dom } = await openPage(ROOT, portFor('prj-list-id-1'), 'project.html', sheetData, { Chart: false });
    const w = dom.window, d = w.document;
    await new Promise(r => setTimeout(r, 300));
    const card = d.querySelector('.prj-card');
    s.check(!!card, 'v2.9.58: 프로젝트 목록 카드가 정상적으로 렌더링됨');
    s.check(card.innerHTML.includes('PRJ-2026-001'),
      'v2.9.58: 프로젝트 목록 카드에 프로젝트 ID(PRJ-2026-001)가 노출됨 — 상세 화면과 동일한 형식');
    s.check(card.innerHTML.includes('이노라인'),
      'v2.9.58: 프로젝트 ID 추가 후에도 기존 고객사 정보(이노라인)가 그대로 유지됨');
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
