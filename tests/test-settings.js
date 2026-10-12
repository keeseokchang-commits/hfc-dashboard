// SCR-12 코드 관리 확장 시험 — 실제 settings.html을 브라우저(Chromium)에서 열고, 구글 시트 호출만 모의 시트로 연결한다.
const path=require('path');
const {chromium}=require('playwright');
const {Mock,ID}=require('./mock-sheets.js');
const {runTests,eq,ok}=require('./harness.js');
const PAGE='file://'+path.join(__dirname,'..','settings.html');
const S10H=['setting_key','setting_value','category','description','updated_at'];
const D='2026-10-01';
const {makeEnv}=require('./harness.js');
const _e=makeEnv(); const HDR=_e.run('HEADERS'), TABS=_e.run('HR_TABS');
// 정의(schema.js)와 같은 크기의 인력 모듈 탭을 만든다. rows는 {열이름:값} 객체 배열.
function addHrTab(m,k,rows){ m.addTab(TABS[k].tab,HDR[k],rows.map(o=>HDR[k].map(h=>o[h]??'')),{rowCount:TABS[k].rows,colCount:HDR[k].length,frozen:1}); }
// 사용 중인 시트처럼 기존 코드·키워드·파라미터·알 수 없는 카테고리·인력 설정값이 섞여 있는 S10
const baseS10=()=>[
  ['매출입금','오벳소프트,외주비','txn_type','매출입금(입금)',D],['매입지급','외주','txn_type','매입지급(출금)',D],['세금','국세','txn_type','세금(출금)',D],
  ['하나은행0026','법인카드','branch_rule','',D],['임차료','임대','fixed_item','',D],['React','리액트,react','skill_tag','',D],['Java','자바','skill_tag','',D],
  ['kw_revenue_inflow','입금','keyword','매출 입금 키워드',D],['param_alert_days','7','parameter','마감 임박 경고 D-day',D],['param_base_ym','2026-03','parameter','추정 기산월',D],
  ['legacy_flag','keep-me','custom_cat','알 수 없는 카테고리',D],
  ['PM','','role','',D],['DBA','데이터베이스관리자','role','',D],['TA','','role','',D],
  ['보험','','industry','',D],['은행','','industry','',D],
  ['차세대','','project_type','',D],['후보 부족','','fail_reason','',D],['단가 불일치','','fail_reason','',D],
  ['short_tenure_months','3','hr_setting','단기 이력 기준',D],['exit_alert_days','30','hr_setting','철수 알림',D],['reconfirm_days','90','hr_setting','재확인',D],['grade_rule','{"version":1}','hr_setting','등급 기준표',D],
];
function newMock(rows=baseS10()){
  const m=new Mock(); m.addTab('S10_SETTINGS',S10H,rows,{rowCount:1000,colCount:5}); m.addTab('S11_GRADE_RATE',['set_id','set_name','grade','sell_price','buy_price','description','is_default','updated_at'],[['SET-001','기본','특급','1','1','','Y',D]],{rowCount:100,colCount:8}); return m;
}
const s10=m=>m.tab('S10_SETTINGS').cells.slice(1).filter(r=>r[0]);
const cat=(m,c)=>s10(m).filter(r=>r[2]===c).map(r=>r[0]);
const writes=m=>m.log.filter(x=>/^(POST|PUT)/.test(x));
async function open(browser,m){
  const ctx=await browser.newContext(); const page=await ctx.newPage(); const dialogs=[]; let dialogAnswer=true;
  page.on('dialog',async d=>{ dialogs.push(d.message()); dialogAnswer?await d.accept():await d.dismiss(); });
  page.on('pageerror',e=>{ page.__errors=(page.__errors||[]).concat(e.message); });
  await page.route('**/*',async route=>{
    const req=route.request(); const url=req.url();
    if(url.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({status:200,contentType:'text/javascript',body:"window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}};"});
    if(url.startsWith('https://sheets.googleapis.com/')){
      const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
      if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
      const r=m.handle(req.method(),url,req.headers(),req.postData());
      if(r.status===0) return route.abort('connectionfailed');
      return route.fulfill({status:r.status,contentType:'application/json',headers:cors,body:JSON.stringify(r.body)});
    }
    if(url.startsWith('file://')) return route.continue();
    return route.fulfill({status:200,body:''});
  });
  await page.goto(PAGE); await page.waitForFunction(()=>document.querySelectorAll('#ctRole .code-row').length>=0&&typeof loadCodes==='function');
  await page.evaluate(()=>{ accessToken='test-token'; });
  await page.waitForTimeout(400);
  return {page,dialogs,setAnswer:v=>{dialogAnswer=v;},close:()=>ctx.close()};
}
const toast=async p=>{ await p.waitForTimeout(150); return p.evaluate(()=>document.getElementById('toast').textContent); };
const names=(p,id)=>p.$$eval('#'+id+' .code-row input:first-child',els=>els.map(e=>e.value));
const T=[]; const t=(id,desc,fn)=>T.push([id,desc,fn]);
let browser;

t('TC-SCR12-01','기존 코드 보존 — 역할 코드를 추가해 저장해도 거래 유형·기술 태그 등 기존 행이 그대로',async()=>{
  const m=newMock(); const before=s10(m); const {page,close}=await open(browser,m);
  await page.click('button[onclick="addCode(\'role\')"]'); await page.fill('#ctRole .code-row:last-child input:first-child','튜너'); await page.click('button:has-text("코드 전체 저장")');
  eq(await toast(page),'🗂 코드 저장 완료 ✓');
  for(const c of ['txn_type','branch_rule','fixed_item','skill_tag']) eq(s10(m).filter(r=>r[2]===c),before.filter(r=>r[2]===c),c+' 행 불변');
  eq(cat(m,'role'),['PM','DBA','TA','튜너']); eq(s10(m).length,before.length+1,'행 수 +1만'); await close();
});
t('TC-SCR12-02','새 코드 보존 — 역할 코드 저장 뒤 "파라미터 저장"을 눌러도 역할 코드가 사라지거나 바뀌지 않는다',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m);
  await page.click('button:has-text("파라미터 저장")'); eq(await toast(page),'✓ 파라미터 저장 완료');
  eq(cat(m,'role'),['PM','DBA','TA']); eq(cat(m,'industry'),['보험','은행']); eq(cat(m,'project_type'),['차세대']); eq(cat(m,'fail_reason'),['후보 부족','단가 불일치']);
  const kp=s10(m).filter(r=>r[2]==='parameter'||r[2]==='keyword'); ok(['kw_revenue_inflow','param_alert_days','param_base_ym'].every(k=>kp.some(r=>r[0]===k)),'기존 키워드·파라미터 유지'); eq(kp.find(r=>r[0]==='kw_revenue_inflow')[2],'keyword','키워드는 keyword로'); eq(s10(m).filter(r=>!['parameter','keyword'].includes(r[2])).length,baseS10().filter(r=>!['parameter','keyword'].includes(r[2])).length,'그 밖의 행 수 불변'); await close();
});
t('TC-SCR12-03','반대 방향 보존 — 설정값 저장 후 코드 저장, 어느 순서로도 모든 카테고리 행이 유지',async()=>{
  const m=newMock(); const before=s10(m).filter(r=>!['parameter','keyword'].includes(r[2])).length; const {page,close}=await open(browser,m);
  await page.fill('#param_reconfirm_days','120'); await page.click('button:has-text("파라미터 저장")'); await page.click('button:has-text("코드 전체 저장")');
  eq(await toast(page),'🗂 코드 저장 완료 ✓'); eq(s10(m).filter(r=>!['parameter','keyword'].includes(r[2])).length,before,'코드·설정값·기타 행 수 변화 없음');
  eq(cat(m,'fail_reason'),['후보 부족','단가 불일치']); eq(cat(m,'custom_cat'),['legacy_flag'],'알 수 없는 카테고리 보존'); eq(cat(m,'hr_setting').sort(),['exit_alert_days','grade_rule','reconfirm_days','short_tenure_months']);
  eq(s10(m).find(r=>r[0]==='reconfirm_days')[1],'120'); eq(s10(m).find(r=>r[0]==='grade_rule')[1],'{"version":1}','등급 기준표 보존'); await close();
});
t('TC-SCR12-04','코드 추가 — 업종 "금융" 입력 후 저장하면 category=industry 행이 추가',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m);
  await page.click('button[onclick="addCode(\'industry\')"]'); await page.fill('#ctIndustry .code-row:last-child input:first-child','금융'); await page.fill('#ctIndustry .code-row:last-child input:nth-child(2)','은행,증권'); await page.click('button:has-text("코드 전체 저장")');
  await toast(page); const row=s10(m).find(r=>r[0]==='금융'); eq([row[1],row[2]],['은행,증권','industry']); eq(cat(m,'industry'),['보험','은행','금융']); await close();
});
t('TC-SCR12-05','이름 중복 — 같은 이름이면 안내하고 저장하지 않는다',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m); const n=writes(m).length;
  await page.click('button[onclick="addCode(\'industry\')"]'); await page.fill('#ctIndustry .code-row:last-child input:first-child','보험'); await page.click('button:has-text("코드 전체 저장")');
  ok((await toast(page)).startsWith('같은 이름의 코드가 있습니다.'),await toast(page)); eq(writes(m).length,n,'시트에 쓰지 않음'); await close();
});
t('TC-SCR12-06','순서 변경 — ▲ 후 저장, 다시 열면 변경된 순서',async()=>{
  const m=newMock(); const o=await open(browser,m);
  await o.page.click('#ctRole .code-row:nth-child(3) button[title="우선순위 올리기"]'); await o.page.click('button:has-text("코드 전체 저장")'); await toast(o.page);
  eq(cat(m,'role'),['PM','TA','DBA']); await o.page.reload(); await o.page.waitForTimeout(500); eq(await names(o.page,'ctRole'),['PM','TA','DBA']); await o.close();
});
t('TC-SCR12-07','사용 중 코드 삭제 — 사용 건수를 안내하고, 확인하면 삭제되며 기존 기록의 값은 그대로',async()=>{
  const m=newMock(); // S21·S23·S33 에 DBA 사용 기록 3건 (S23은 쉼표로 여러 개 들어간 열)
  addHrTab(m,'S21',[{prole_id:'PRL-00001',person_id:'PSN-0001',role_code:'DBA'},{prole_id:'PRL-00002',person_id:'PSN-0002',role_code:'PM'}]);
  addHrTab(m,'S23',[{career_id:'CAR-000001',person_id:'PSN-0001',kind:'프로젝트',industry:'보험',project_type:'차세대',role_codes:'DA, DBA'},{career_id:'CAR-000002',person_id:'PSN-0001',kind:'프로젝트',role_codes:'PM'}]);
  addHrTab(m,'S33',[{line_id:'LN-0001',request_id:'REQ-2026-001',role_codes:'DBA'}]);
  const {page,dialogs,close}=await open(browser,m);
  await page.click('#ctRole .code-row:nth-child(2) button:has-text("✕")'); await page.waitForTimeout(400);
  eq(dialogs.length,1); ok(dialogs[0].includes('이 코드는 3건에서 사용 중입니다. 삭제하면 기존 기록에는 값만 남습니다.'),dialogs[0]);
  eq(await names(page,'ctRole'),['PM','TA']); await page.click('button:has-text("코드 전체 저장")'); await toast(page);
  eq(cat(m,'role'),['PM','TA']); eq(m.tab('S23_PERSON_CAREER').cells[1][HDR.S23.indexOf('role_codes')],'DA, DBA','기존 기록의 값은 그대로'); await close();
});
t('TC-SCR12-07b','사용 중이 아닌 코드는 확인 창 없이 삭제, 취소하면 삭제되지 않는다',async()=>{
  const m=newMock(); const o=await open(browser,m);
  await o.page.click('#ctIndustry .code-row:nth-child(1) button:has-text("✕")'); await o.page.waitForTimeout(300); eq(o.dialogs.length,0); eq(await names(o.page,'ctIndustry'),['은행']);
  addHrTab(m,'S33',[{line_id:'LN-1',request_id:'R',role_codes:'PM',industry:'은행'}]);
  o.setAnswer(false); await o.page.click('#ctIndustry .code-row:nth-child(1) button:has-text("✕")'); await o.page.waitForTimeout(400);
  eq(o.dialogs.length,1); eq(await names(o.page,'ctIndustry'),['은행'],'취소하면 그대로'); await o.close();
});
t('TC-SCR12-08','설정값 저장 — 재확인 일수 120으로 저장하면 S10 값이 갱신',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m);
  eq(await page.inputValue('#param_reconfirm_days'),'90'); await page.fill('#param_reconfirm_days','120'); await page.fill('#param_short_tenure_months','6'); await page.click('button:has-text("파라미터 저장")'); await toast(page);
  eq(String(s10(m).find(r=>r[0]==='reconfirm_days')[1]),'120'); eq(String(s10(m).find(r=>r[0]==='short_tenure_months')[1]),'6'); eq(String(s10(m).find(r=>r[0]==='exit_alert_days')[1]),'30');
  await page.reload(); await page.waitForTimeout(500); eq(await page.inputValue('#param_reconfirm_days'),'120','다시 열어도 120'); await close();
});
t('TC-SCR12-09','숫자 오류 — 숫자가 아니면 안내하고 저장하지 않는다',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m); const n=writes(m).length;
  for(const bad of ['','1.5','-3']){ await page.fill('#param_exit_alert_days',bad); await page.click('button:has-text("파라미터 저장")'); ok((await toast(page)).startsWith('숫자만 입력해 주세요.'),'입력 '+JSON.stringify(bad)+' → '+await toast(page)); }
  eq(writes(m).length,n,'시트에 쓰지 않음'); await close();
});
t('TC-SCR12-10','읽기 실패 — 코드 저장·파라미터 저장 모두 쓰기를 중단하고 시트는 그대로',async()=>{
  const m=newMock(); const {page,close}=await open(browser,m); const snap=JSON.stringify(m.tab('S10_SETTINGS').cells);
  m.failNext(/GET .*S10_SETTINGS/,403,1); await page.click('button:has-text("코드 전체 저장")'); eq(await toast(page),'설정을 읽을 수 없어 저장을 중단했습니다.');
  m.failNext(/GET .*S10_SETTINGS/,0,1); await page.click('button:has-text("파라미터 저장")'); eq(await toast(page),'설정을 읽을 수 없어 저장을 중단했습니다.','네트워크 끊김');
  eq(JSON.stringify(m.tab('S10_SETTINGS').cells),snap,'시트 변화 없음'); eq(writes(m).length,0,'쓰기 호출 없음'); await close();
});
t('SCR12-잘림방지','S10이 읽기 범위(300행)를 채우면 저장을 중단 — 잘린 채 쓰면 뒤쪽 행이 지워지므로',async()=>{
  const rows=baseS10(); while(rows.length<299) rows.push(['kw_x'+rows.length,'v','keyword','',D]);
  const m=newMock(rows); const {page,close}=await open(browser,m); const snap=JSON.stringify(m.tab('S10_SETTINGS').cells);
  await page.click('button:has-text("코드 전체 저장")'); ok((await toast(page)).includes('읽기 범위(300행)'),await toast(page)); eq(JSON.stringify(m.tab('S10_SETTINGS').cells),snap); await close();
});
t('SCR12-시트준비','시트 준비 버튼 — 확인 창 → 탭 18개·기본 코드 생성, 화면에 결과 표시, 다시 눌러도 안전',async()=>{
  const m=new Mock(); m.addTab('S10_SETTINGS',S10H,[['매출입금','x','txn_type','매출입금(입금)',D],['kw_revenue_inflow','입금','keyword','',D]],{rowCount:1000,colCount:5});
  m.addTab('S11_GRADE_RATE',['set_id'],[['SET-001']]);
  const {page,dialogs,close}=await open(browser,m);
  eq(await names(page,'ctRole'),[]);
  await page.click('#btnPrep'); await page.waitForFunction(()=>/완료|실패/.test(document.getElementById('prepResult').textContent),null,{timeout:15000});
  eq(dialogs[0],'신규 탭 18개를 준비합니다. 이미 있는 탭은 변경하지 않습니다.');
  const txt=await page.textContent('#prepResult'); ok(txt.includes('완료')&&txt.includes('새로 만듦 18'),txt);
  eq(m.sheets.filter(s=>/^S(2\d|3[1-9])_/.test(s.title)).length,18); await page.waitForTimeout(600);
  eq((await names(page,'ctRole')).length,17,'역할 17개가 화면에 나타남'); eq((await names(page,'ctIndustry')).length,12); eq((await names(page,'ctFailReason')).length,9);
  eq(await page.inputValue('#param_reconfirm_days'),'90');
  const snap=JSON.stringify(m.sheets); await page.click('#btnPrep'); await page.waitForFunction(()=>/이미 있음 18/.test(document.getElementById('prepResult').textContent),null,{timeout:15000});
  eq(JSON.stringify(m.sheets),snap,'두 번째 실행은 변화 없음');
  eq(s10(m).filter(r=>r[2]==='txn_type'||r[2]==='keyword').length,2,'기존 행 보존'); await close();
});
t('SCR12-기존동작','코드 저장만으로 기존 거래 유형·키워드·파라미터 행 수와 내용이 변하지 않는다 (코드 변경 없이 저장)',async()=>{
  const m=newMock(); const before=JSON.stringify(s10(m).map(r=>r.slice(0,4)).sort()); const {page,close}=await open(browser,m);
  await page.click('button:has-text("코드 전체 저장")'); await toast(page); eq(JSON.stringify(s10(m).map(r=>r.slice(0,4)).sort()),before); await close();
});

(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined});
  const f=await runTests(T,'SCR-12 코드 관리 확장 (실제 settings.html + 모의 구글 시트)'); await browser.close(); process.exit(f?1:0);
})();
