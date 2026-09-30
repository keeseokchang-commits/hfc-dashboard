// tests/e2e_ui_symmetry.js — 매출·매입 UI 대칭 표준(v2.9.32, 사용자 확립) 회귀.
// 원칙: 매출과 매입은 화면에서 항상 같은 구조([유형·항목명] + [단가]×[MM]=[총액] + 동일 컬럼의
// 미리보기 표)로 나열되어야 한다. 이 파일은 그 대칭이 실제로 지켜지는지 검증한다.
const path = require('path');
const { portFor, openPage } = require('./_e2e_helpers');
const { makeSuite } = require('./_helpers');

const ROOT = path.join(__dirname, '..');

async function run() {
  const s = makeSuite('e2e_ui_symmetry');
  // v2.9.35: 개별 등록 폼(유형·항목명·단가×MM 계산기, 목록카드 수정 버튼) 관련 케이스는 폼 자체가
  // 삭제되어(사용자 결정: 예외 처리는 견적 재작성→스케줄 재생성으로 통일) 더 이상 유효하지 않아 제거.
  // 아래는 폼과 무관하게 여전히 유효한 대칭 원칙(미리보기 표, 완료처리 동작, 목록 금액 표시)만 검증.

  // ── 청구 스케줄 미리보기 표: 매출·매입 헤더가 동일 컬럼 구조(항목 컬럼 포함)여야 함 ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-105','부산은행','부산은행','','80','69500000','2026-09-03','2027-04-02','기타','수주','','','용역턴키']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-007','PL-105','부산은행 모바일뱅킹','부산은행','69500000','2026-09-03','2027-04-02','수주']],
      S04_REVENUE: [['revenue_id']], S05_COST: [['cost_id']], S06_FIXED_COST: [['fixed_id']],
      S12_ESTIMATE: [['estimate_id']],
    };
    const { dom } = await openPage(ROOT, portFor('sym-schedule'), 'input.html', sheetData, {});
    const w = dom.window, d = w.document;
    w.eval('openGenModal()');
    d.getElementById('genPrj').value = 'PRJ-2026-007';
    w.eval('onGenPrjChange()');
    await new Promise(r => setTimeout(r, 100));
    const revHeaders = [...d.querySelectorAll('#genPreviewWrap thead th')].map(th => th.textContent);
    const costHeaders = [...d.querySelectorAll('#genCostWrap thead th')].map(th => th.textContent);
    s.check(revHeaders.length === costHeaders.length,
      `매출·매입 미리보기 표의 컬럼 수가 동일(매출 ${revHeaders.length}, 매입 ${costHeaders.length})`);
    s.check(revHeaders.includes('항목'), '매출 미리보기 표에도 "항목" 컬럼 존재(매입과 대칭)');
    const genRows = w.eval('genRows');
    s.check(genRows.length > 0 && genRows.every(g => !!g.name), '마일스톤 방식 매출 스케줄 각 행에 항목명(계약금/중도금/잔금) 부여');
  }

  // ── v2.9.33: 매출 markInvoiced는 발행 완료 시 입금예정일이 비어있으면 자동 계산해 채우는데,
  //           매입 markCostInvoiced는 지급예정일을 전혀 건드리지 않던 비대칭(사용자 지적으로 발견,
  //           단순 문구 차이가 아니라 실제 동작 차이 — 방치하면 지급 계획 관리에 구멍이 생김). ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-1','x','c','','80','10000000','2026-09-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-1','PL-1','테스트','고객','10000000','2026-09-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['COST-1','PRJ-1','2026-09','외주비','','','','7000000','','매입 스케줄 자동생성','700000','2026-09-30','','','']], // payment_date(지급예정일) 공란
      S06_FIXED_COST: [['fixed_id']],
    };
    const wc = {};
    const { dom } = await openPage(ROOT, portFor('mark-invoiced-sym'), 'input.html', sheetData, { writeCapture: wc, confirm: () => true });
    const w = dom.window;
    w.eval('accessToken="t"');
    await w.eval("markCostInvoiced('COST-1')");
    await new Promise(r => setTimeout(r, 300));
    const row = (wc.S05 || []).slice(1)[0];
    s.check(!!row && !!row[8], 'v2.9.33: 매입 수취완료 처리 시 지급예정일이 공란이면 자동 계산되어 채워짐(매출 markInvoiced와 대칭)');
  }

  // ── v2.9.34: 매입 목록 카드가 실제 지급 총액(VAT포함)이 아니라 공급가액(VAT제외)만 라벨 없이
  //           보여주던 결함(사용자 발견 — 매출 카드는 "합계"(VAT포함) 라벨과 공급+VAT 세부내역을
  //           갖췄는데 매입엔 그 구조 자체가 없었음). 실무자가 실제 지급액을 착각할 수 있는 심각한
  //           표시 오류였다. 공급가액+VAT 세부내역과 "합계"(VAT포함) 라벨을 매출과 동일하게 추가. ──
  {
    const sheetData = {
      S01_PIPELINE: [['pipeline_id','opportunity','client','end_client','probability','contract_amount','expected_start','expected_end','payment_cycle','status','memo','created_at','biz_type'],
        ['PL-004','x','금호타이어','','80','50000000','2026-01-01','2026-12-31','기타','수주','','','인력공급']],
      S03_PROJECT: [['project_id','pipeline_id','project_name','client','contract_amount','start_date','end_date','status'],
        ['PRJ-2026-004','PL-004','금호타이어 MES/POP 구축','금호타이어','50000000','2026-01-01','2026-12-31','수주']],
      S04_REVENUE: [['revenue_id']],
      S05_COST: [['cost_id','project_id','year_month','cost_type','person_name','unit_price','mm','amount','payment_date','memo','vat_amt','invoice_plan_date','invoice_date','matched_txn_id','pay_actual_date'],
        ['C1','PRJ-2026-004','2028-04','외주비','','','','2623000','2028-05-31','매입 스케줄 자동생성','262300','2028-04-30','','',''],
        ['C2','PRJ-2026-004','2028-05','인건비(계산서없음)','','','','1000000','2028-06-30','매입 스케줄 자동생성(계산서없음)','0','','','','']],
      S06_FIXED_COST: [['fixed_id']],
    };
    const { dom } = await openPage(ROOT, portFor('cost-total-label'), 'input.html', sheetData, {});
    const html = dom.window.document.getElementById('cost_list').innerHTML;
    s.check(html.includes('공급 2,623,000원'), 'v2.9.34: 매입 카드에 공급가액이 라벨과 함께 표시');
    s.check(html.includes('VAT 262,300원'), 'v2.9.34: 매입 카드에 VAT 금액 표시(매출과 대칭)');
    s.check(html.includes('합계 2,885,300원'), 'v2.9.34: 매입 카드에 "합계"(VAT포함, 2,885,300원) 라벨 표시 — 실제 지급 총액이 정확히 드러남');
    s.check(html.includes('지급예정 2028-05-31'), 'v2.9.34: 합계 옆에 지급예정일 표시(매출의 "예정" 표시와 대칭)');
    // v2.9.36: "세금계산서" 메뉴는 세금계산서 관리 화면이므로, 계산서없음 건(C2)은 이 목록에
    // 아예 나타나지 않아야 한다(사용자 확정 — 계산서없음 매입의 "공급가액"·"수취예정" 표시 자체가
    // 세금계산서 용어를 계산서 없는 거래에 잘못 붙인 것이었다는 지적에 따른 재정정).
    s.check(!html.includes('1,000,000') && !html.includes('계산서없음'),
      'v2.9.36: 계산서없음(vat_amt=0) 건(C2)은 세금계산서 목록에서 완전히 제외됨');
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
