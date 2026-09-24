// tests/e2e_data_loss_guard.js — 부가 정보 갱신이 본체 데이터 전체 삭제로 이어지던 치명적 결함(v2.9.37) 회귀.
// 배경: 사용자가 8월 마감까지 정상적으로 사용하던 설정(코드 관리 화면의 거래유형·키워드)이 "의지와
// 무관하게" 전부 사라진 사고. 원인 추적 결과, 청구 스케줄 저장 시 자동 실행되는 markScheduleChanged()가
// S10을 "다시 읽어서 last_schedule_change_at 하나만 갱신해 병합"하려 했는데, fetchSheetSafe가 어떤
// 이유로든(네트워크 일시 오류 등) null을 반환하면 이를 "S10이 원래 비어있다"로 오인해 그 상태로
// clearAndWrite — 기존 코드 관리 데이터 전체가 흔적도 없이 사라지는 구조였다. 같은 패턴이 S17
// (마일스톤 설정) 저장에도 있어 함께 수정했다. 원칙: "부가 정보 하나 갱신"이 "읽기 실패 시 본체
// 데이터 전체 삭제"로 이어지면 안 된다 — 읽기가 실패하면 쓰기 자체를 포기해야 한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_data_loss_guard');

  // ── S10(설정/코드관리): 읽기 실패 시 쓰기를 완전히 포기해야 함(가장 치명적이었던 사고) ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-09-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','외주업체','특급','','','13000000','7000000','','3','2026-09-01','2026-12-31','','']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('dataloss-s10'), 'input.html', sheetData, {
      confirm: () => true, writeCapture: wc,
      fetchFailFor: 'S10', // S10에 대한 GET을 항상 실패시켜 fetchSheetSafe가 null을 반환하는 상황(사고 재현) 시뮬레이션
    });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-1';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    s.check(wc.S10 === undefined,
      'v2.9.37: S10 읽기 실패 시 markScheduleChanged()가 쓰기 자체를 포기(기존 코드 관리 데이터 보호)');
  }

  // ── S10 정상 케이스: 읽기 성공 시에는 기존 데이터 보존 + 새 값 정상 병합(회귀 확인) ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','고객','','80','30000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','30000000','2026-09-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S10_SETTINGS: [['setting_key','setting_value','description','category','updated_at'],
        ['매입지급','오벳소프트,외주비','','txn_type','2026-08-01']],
      S12_ESTIMATE: [['estimate_id','pipeline_id','comp_type','item_name','grade','grade_set_id','qty','unit_price','buy_price','amount','mm','start_date','end_date','memo','created_at'],
        ['E1','PL-1','인건비','외주업체','특급','','','13000000','7000000','','3','2026-09-01','2026-12-31','','']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('dataloss-s10-ok'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal(true)');
    d.getElementById('genPrj').value = 'PRJ-1';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    const saved = (wc.S10 || []).slice(1);
    s.check(saved.some(r => r[0] === '매입지급'), 'v2.9.37 회귀: S10 읽기 성공 시 기존 코드 관리 데이터(매입지급) 보존');
    s.check(saved.some(r => r[0] === 'last_schedule_change_at'), 'v2.9.37 회귀: 새 타임스탬프도 정상 병합');
  }

  // ── S17(마일스톤 설정): 로드 자체가 실패하면 저장을 건너뛰어야 함(다른 프로젝트 설정 유실 방지) ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-03-12','2026-09-11','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행','부산은행','69500000','2026-03-12','2026-09-11','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id']],
      // S17 자체를 정의하지 않아 openPage 스텁이 해당 URL을 매칭 못 시키면 기본적으로 빈 값(404 유사)을 반환
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('dataloss-s17'), 'input.html', sheetData, {
      confirm: () => true, writeCapture: wc, fetchFailFor: 'S17',
    });
    const w = dom.window, d = w.document;
    w.eval('accessToken="t"');
    w.eval('openGenModal()');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    s.check(w.eval('milestonesLoadOk') === false, 'v2.9.37: S17 읽기 실패 시 milestonesLoadOk 플래그가 정확히 false');
    await w.eval('saveGen()');
    await new Promise(r => setTimeout(r, 400));
    s.check(wc.S17 === undefined,
      'v2.9.37: S17 로드 실패 상태에서는 마일스톤 저장을 건너뜀(다른 프로젝트 설정 유실 방지)');
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
