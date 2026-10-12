// STF-SCR-11 거래처 관리 시험 (프로그램 설계서 §15.8) — 실제 party.html 을 브라우저에서 연다
const {runTests,eq,ok}=require('./harness.js');
const U=require('./ui-helper.js');
const T=[]; const t=(id,desc,fn)=>T.push([id,desc,fn]); let browser;
const P=(id,name,roles,extra={})=>({party_id:id,name,roles,aliases:'',main_phone:'',memo:'',is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00',...extra});
const BASE=[P('PTY-001','직접','경로'),P('PTY-002','내부','경로')];
const mock=(extra={})=>U.newMock({S27:BASE,S36:[],S32:[],S34:[],S28:[],...extra});
const items=p=>p.$$eval('#partyList .hr-list-item',els=>els.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
const pickRoles=async(p,rs)=>{ for(const r of rs) await p.click(`#pfRoles .hr-chip:text-is("${r}")`); };

t('TC-SCR11-01','거래처 등록 — 이름·역할 입력 후 저장: S27 한 줄 추가, ID 발번, 역할 두 개 저장',async()=>{
  const m=mock(); const {page,close}=await U.open(browser,'party.html',m);
  await page.fill('#pfName','㈜가나다'); await pickRoles(page,['고객','최종 고객사']); await page.click('#btnSaveParty');
  eq(await U.toastText(page),'✓ 거래처를 등록했습니다'); const r=U.rowsOf(m,'S27'); eq(r.length,3); const n=r[2];
  eq([n.party_id,n.name,n.roles,n.is_active,n.created_at],['PTY-003','㈜가나다','고객,최종 고객사','Y','2026-10-10']); ok(/^2026-10-10 \d\d:\d\d:\d\d$/.test(n.updated_at),'수정일시 '+n.updated_at);
  ok((await items(page)).some(x=>x.startsWith('㈜가나다')),'목록에 나타남'); eq(page.__errors,[]); await close();
});
t('TC-SCR11-02','역할 미선택 — 저장 안 됨, 안내 문구 / 이름 없음도 안내',async()=>{
  const m=mock(); const {page,close}=await U.open(browser,'party.html',m);
  await page.fill('#pfName','가나다'); await page.click('#btnSaveParty'); eq(await page.textContent('#pfRolesErr'),'역할을(를) 선택해 주세요.');
  await page.fill('#pfName',''); await page.click('#btnSaveParty'); eq(await page.textContent('#pfNameErr'),'거래처명을(를) 입력해 주세요.');
  eq(U.writes(m).length,0); eq(U.rowsOf(m,'S27').length,2); await close();
});
t('TC-SCR11-03','중복 이름 검사 — "(주)가나다"로 등록 시도: 확인 창, 취소하면 등록 안 됨 / 확인하면 등록',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','㈜가나다','고객')]}); const {page,dialogs,setAnswer,close}=await U.open(browser,'party.html',m);
  setAnswer(false); await page.fill('#pfName','(주) 가나다'); await pickRoles(page,['고객']); await page.click('#btnSaveParty'); await page.waitForTimeout(200);
  eq(dialogs[0],'같은 이름의 거래처(㈜가나다)가 있습니다. 그래도 등록할까요?'); eq(U.rowsOf(m,'S27').length,3,'취소 → 등록 안 됨');
  setAnswer(true); await page.click('#btnSaveParty'); await page.waitForTimeout(400); eq(U.rowsOf(m,'S27').length,4,'확인 → 등록'); await close();
});
t('CMN-dup','중복 검사는 별칭도 본다(이름 ↔ 별칭 어느 쪽이든) / 자기 자신은 제외',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객',{aliases:'가나다정보, GND'})]}); const {page,dialogs,setAnswer,close}=await U.open(browser,'party.html',m);
  setAnswer(false); await page.fill('#pfName','gnd'); await pickRoles(page,['고객']); await page.click('#btnSaveParty'); await page.waitForTimeout(200);
  ok(dialogs[0]&&dialogs[0].includes('가나다'),'별칭과 같은 이름 → 경고'); eq(U.rowsOf(m,'S27').length,3,'취소 → 등록 안 됨');
  setAnswer(true); dialogs.length=0; await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.fill('#pfMemo','메모 수정'); await page.click('#btnSaveParty'); await page.waitForTimeout(300);
  eq(dialogs.length,0,'자기 자신과는 비교하지 않음'); eq(U.rowsOf(m,'S27')[2].memo,'메모 수정'); await close();
});
t('TC-SCR11-04','별칭 추가 — 별칭 저장: S27.aliases 에 쉼표로 저장, 바뀐 열만 쓴다',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.fill('#pfAliases','가나다정보 ,  GND'); await page.click('#btnSaveParty'); eq(await U.toastText(page),'✓ 저장했습니다');
  const r=U.rowsOf(m,'S27')[2]; eq([r.aliases,r.name,r.roles,r.created_at],['가나다정보,GND','가나다','고객','2026-09-01']); ok(r.updated_at.startsWith('2026-10-10'),'수정일시 갱신'); await close();
});
t('TC-SCR11-05','기본 행 보호 — "직접" 이름 수정·숨김 시도: 불가 안내, 시트 변화 없음',async()=>{
  const m=mock(); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("직접")'); eq(await page.isDisabled('#pfName'),true,'이름 입력칸 잠김');
  await page.click('#pfRoles .hr-chip:text-is("고객")'); eq(await page.textContent('#pfMsg'),'기본 거래처는 변경할 수 없습니다.');
  await page.click('#btnHideParty'); eq(await page.textContent('#pfMsg'),'기본 거래처는 변경할 수 없습니다.'); eq(U.writes(m).length,0);
  await page.fill('#pfPhone','02-000-0000'); await page.click('#btnSaveParty'); await page.waitForTimeout(300); eq(U.rowsOf(m,'S27')[0].main_phone,'02-000-0000','이름·역할 외 항목은 수정 가능'); eq(U.rowsOf(m,'S27')[0].name,'직접'); await close();
});
t('TC-SCR11-06','사용 중인 거래처 숨김 — 확인 후 is_active=N, 기존 의뢰 그대로, 신규 선택지에서 제외',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')],S32:[{request_id:'REQ-2026-001',alias:'A',requester_party_id:'PTY-003',closed_state:'진행',received_at:'2026-10-01'},{request_id:'REQ-2026-002',alias:'B',requester_party_id:'PTY-003',closed_state:'실패',received_at:'2026-09-01'}]});
  const {page,dialogs,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.click('#btnHideParty'); await page.waitForTimeout(400);
  ok(dialogs[0].startsWith('진행 중 의뢰 1건에서 사용 중입니다.'),dialogs[0]); eq(U.rowsOf(m,'S27')[2].is_active,'N'); eq(U.rowsOf(m,'S32').length,2,'의뢰 불변');
  ok(!(await items(page)).some(x=>x.startsWith('가나다')),'목록에서 사라짐(숨김 포함 꺼짐)'); await page.check('#fHidden'); ok((await items(page)).some(x=>x.startsWith('가나다')&&x.includes('숨김')),'숨김 포함 → 보임');
  await page.click('#partyList .hr-list-item:has-text("가나다")'); eq(await page.textContent('#btnHideParty'),'숨김 해제'); await page.click('#btnHideParty'); await page.waitForTimeout(400); eq(U.rowsOf(m,'S27')[2].is_active,'Y'); await close();
});
t('CMN-hide2','숨김 확인 창에서 취소하면 아무것도 쓰지 않는다 / 쓰이지 않는 거래처는 확인 없이 숨김',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객'),P('PTY-004','라마바','서치업체')],S32:[{request_id:'REQ-2026-001',alias:'A',requester_party_id:'PTY-003',closed_state:'진행',received_at:'2026-10-01'}]});
  const {page,dialogs,setAnswer,close}=await U.open(browser,'party.html',m);
  setAnswer(false); await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.click('#btnHideParty'); await page.waitForTimeout(300); eq(U.writes(m).length,0); eq(dialogs.length,1);
  dialogs.length=0; await page.click('#partyList .hr-list-item:has-text("라마바")'); await page.click('#btnHideParty'); await page.waitForTimeout(400); eq(dialogs.length,0); eq(U.rowsOf(m,'S27')[3].is_active,'N'); await close();
});
t('TC-SCR11-07','담당자 등록 — 전화 앞자리 0 유지(텍스트 저장)',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.fill('#cfName','홍길동'); await page.fill('#cfTitleIn','부장'); await page.fill('#cfPhone','010-0000-0000'); await page.fill('#cfEmail','h@x.com'); await page.fill('#cfLast','2026-10-01');
  await page.click('#btnSaveContact'); eq(await U.toastText(page),'✓ 담당자를 저장했습니다'); const c=U.rowsOf(m,'S36')[0];
  eq([c.pcontact_id,c.party_id,c.name,c.title,c.phone,c.email,c.last_contacted_at,c.is_primary,c.is_active],['PCT-0001','PTY-003','홍길동','부장','010-0000-0000','h@x.com','2026-10-01','N','Y']);
  await close();
});
t('TC-SCR11-07b','전화를 숫자만 넣어도 앞자리 0이 사라지지 않는다(RAW 저장 + 텍스트 서식)',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.fill('#cfName','홍길동'); await page.fill('#cfPhone','01012345678'); await page.click('#btnSaveContact'); await page.waitForTimeout(400);
  eq(U.rowsOf(m,'S36')[0].phone,'01012345678'); await close();
});
t('TC-SCR11-08','주 담당자 변경 — 새 주 담당자 1명만 남고 기존 해제, 안내 표시',async()=>{
  const C=(id,name,pri)=>({pcontact_id:id,party_id:'PTY-003',name,is_primary:pri,is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00'});
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')],S36:[C('PCT-0001','홍길동','Y'),C('PCT-0002','김철수','N')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); ok((await page.textContent('#contactList')).includes('주 담당자'));
  await page.click('#contactList .hr-list-item:has-text("김철수")'); await page.check('#cfPrimary'); await page.click('#btnSaveContact');
  eq(await U.toastText(page),'✓ 저장했습니다 · 기존 주 담당자(홍길동)가 해제되었습니다'); const r=U.rowsOf(m,'S36'); eq(r.map(x=>x.is_primary),['N','Y'],'1명만'); await close();
});
t('CMN-primary2','주 담당자 해제 단계에서 실패해도 주 담당자가 둘이 되지 않는다 / 숨긴 담당자는 주 담당자 불가',async()=>{
  const C=(id,name,pri)=>({pcontact_id:id,party_id:'PTY-003',name,is_primary:pri,is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00'});
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')],S36:[C('PCT-0001','홍길동','Y'),C('PCT-0002','김철수','N')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); await page.click('#contactList .hr-list-item:has-text("김철수")'); await page.check('#cfPrimary');
  m.failNext(/POST .*values:batchUpdate/,500,2); await page.click('#btnSaveContact'); await page.waitForTimeout(600);
  eq(U.rowsOf(m,'S36').filter(x=>x.is_primary==='Y').length,1,'여전히 1명'); eq(U.rowsOf(m,'S36')[1].is_primary,'N');
  await page.click('#contactList .hr-list-item:has-text("김철수")'); await page.check('#cfPrimary'); await page.check('#cfHidden'); await page.click('#btnSaveContact'); eq(await page.textContent('#cfMsg'),'숨긴 담당자는 주 담당자로 둘 수 없습니다.'); await close();
});
t('TC-SCR11-09','건수 표시 — 의뢰 2건, 발송 3건, 이력서, 담당자 수가 S32·S34·S28·S36 집계와 일치',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객'),P('PTY-004','라마바','서치업체')],
    S32:[1,2].map(i=>({request_id:'REQ-2026-00'+i,alias:'A'+i,requester_party_id:'PTY-003',closed_state:'진행',received_at:'2026-10-01'})),
    S34:[1,2,3].map(i=>({order_id:'ORD-0000'+i,request_id:'REQ-2026-001',party_id:'PTY-004',reply_state:'대기',reply_due:'2026-10-17'})),
    S28:[{file_id:'FIL-00001',person_id:'PSN-0001',source_party_id:'PTY-004'}],S36:[{pcontact_id:'PCT-0001',party_id:'PTY-004',name:'가',is_active:'Y'},{pcontact_id:'PCT-0002',party_id:'PTY-004',name:'나',is_active:'N'}]});
  const {page,close}=await U.open(browser,'party.html',m); const it=await items(page);
  ok(it.find(x=>x.startsWith('가나다')).includes('담당자 0 · 의뢰 2 · 발송 0 · 이력서 0'),it.join('|')); ok(it.find(x=>x.startsWith('라마바')).includes('담당자 1 · 의뢰 0 · 발송 3 · 이력서 1'),'숨긴 담당자는 세지 않음'); await close();
});
t('TC-SCR11-10','검색·필터 — 역할 "서치업체", 별칭 검색, 숨김은 스위치를 켤 때만',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객',{aliases:'GND'}),P('PTY-004','라마바','서치업체'),P('PTY-005','사아자','서치업체,인력업체',{is_active:'N'})]});
  const {page,close}=await U.open(browser,'party.html',m);
  await page.selectOption('#fRole','서치업체'); eq((await items(page)).map(x=>x.split(' ')[0]),['라마바']);
  await page.check('#fHidden'); eq((await items(page)).map(x=>x.split(' ')[0]).sort(),['라마바','사아자']);
  await page.selectOption('#fRole',''); await page.uncheck('#fHidden'); await page.fill('#fSearch','gnd'); eq((await items(page)).map(x=>x.split(' ')[0]),['가나다']);
  await page.fill('#fSearch','없는이름'); eq(await page.textContent('#partyList'),'조건에 맞는 거래처가 없습니다.'); await close();
});
t('CMN-conflict','다른 곳에서 먼저 수정했으면 저장하지 않고 안내한다',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); m.set('S27_PARTY',4,HDR_COL(m,'updated_at'),'2026-10-10 09:59:59'); await page.fill('#pfMemo','내 수정'); await page.click('#btnSaveParty'); await page.waitForTimeout(300);
  eq(await page.textContent('#pfMsg'),'다른 곳에서 수정되었습니다. 다시 불러온 뒤 수정해 주세요.'); eq(U.rowsOf(m,'S27')[2].memo,''); await close();
});
const HDR_COL=(m,name)=>U.HDR.S27.indexOf(name)+1;
t('CMN-load','탭이 없으면 "시트 초기화가 필요합니다." / 읽기 실패면 로그인 안내 / 화면 값은 HTML로 해석되지 않는다',async()=>{
  const m=U.newMock({S27:BASE}); let h=await U.open(browser,'party.html',m); ok((await h.page.textContent('#loadBox')).includes('시트 초기화가 필요합니다.')); ok(await h.page.isVisible('#loadBox a[href="settings.html"]')); await h.close();
  const m2=mock(); m2.failNext(/GET .*values:batchGet/,403,4); m2.failNext(/GET .*S27_PARTY/,403,4); h=await U.open(browser,'party.html',m2,{wait:1500}); ok((await h.page.textContent('#loadBox')).includes('데이터를 불러오지 못했습니다. 다시 로그인해 주세요.')); await h.close();
  const m3=mock({S27:[...BASE,P('PTY-003','<img src=x onerror="window.__x=1">','고객')]}); h=await U.open(browser,'party.html',m3); eq(await h.page.evaluate(()=>window.__x),undefined); eq(h.page.__errors,[]); await h.close();
});
t('CMN-url','주소의 id 로 거래처를 미리 선택해 열 수 있다 / 새 거래처 버튼은 선택을 해제한다',async()=>{
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')]}); const {page,close}=await U.open(browser,'party.html',m,{query:'?id=PTY-003'});
  eq(await page.inputValue('#pfName'),'가나다'); ok(await page.isVisible('#contactCard')); await page.click('#btnNewParty'); eq(await page.inputValue('#pfName',''),''); ok(!(await page.isVisible('#contactCard'))); await close();
});

t('TC-SCR11-11','거래처 삭제(변경 004) — 쓰이지 않은 거래처는 담당자와 함께 삭제 / 쓰이는 거래처·기본 거래처는 거부 / 사용 확인 실패면 삭제 안 함',async()=>{
  const C=(id,pid)=>({pcontact_id:id,party_id:pid,name:'담'+id,is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00'});
  const x={S31:[],S25:[],S23:[]};
  const m=mock({...x,S27:[...BASE,P('PTY-003','미사용','고객'),P('PTY-004','사용중','서치업체')],S36:[C('PCT-0001','PTY-003'),C('PCT-0002','PTY-003'),C('PCT-0003','PTY-004')],S34:[{order_id:'ORD-00001',request_id:'REQ-2026-001',party_id:'PTY-004',reply_state:'대기'}]});
  const {page,dialogs,setAnswer,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("사용중")'); await page.click('#btnDeleteParty'); await page.waitForTimeout(400); eq(await page.textContent('#pfMsg'),'사용 중이라 삭제할 수 없습니다 (발송 1건). 숨김을 사용해 주세요.'); eq(U.rowsOf(m,'S27').length,4);
  await page.click('#partyList .hr-list-item:has-text("직접")'); eq(await page.isVisible('#btnDeleteParty'),false,'기본 거래처는 삭제 버튼 없음');
  await page.click('#partyList .hr-list-item:has-text("미사용")'); setAnswer(false); await page.click('#btnDeleteParty'); await page.waitForTimeout(400); ok(dialogs.at(-1).includes('담당자 2명')); eq(U.rowsOf(m,'S27').length,4,'확인 취소 → 삭제 안 함');
  setAnswer(true); await page.click('#btnDeleteParty'); await page.waitForTimeout(900); eq(U.rowsOf(m,'S27').map(r=>r.party_id),['PTY-001','PTY-002','PTY-004']); eq(U.rowsOf(m,'S36').map(r=>r.pcontact_id),['PCT-0003'],'다른 거래처 담당자는 그대로');
  m.failNext(/GET .*values:batchGet/,403,1); m.failNext(/GET .*S23_PERSON_CAREER/,403,2); await page.click('#partyList .hr-list-item:has-text("사용중")'); await page.click('#btnDeleteParty'); await page.waitForTimeout(2500); eq(await page.textContent('#pfMsg'),'사용 여부를 확인하지 못해 삭제하지 않았습니다. 다시 시도해 주세요.'); eq(U.rowsOf(m,'S27').length,3); await close();
});
t('TC-SCR11-12','담당자 삭제 — 선택한 담당자 한 명만 삭제',async()=>{
  const C=(id)=>({pcontact_id:id,party_id:'PTY-003',name:'담'+id,is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00'});
  const m=mock({S27:[...BASE,P('PTY-003','가나다','고객')],S36:[C('PCT-0001'),C('PCT-0002')]}); const {page,close}=await U.open(browser,'party.html',m);
  await page.click('#partyList .hr-list-item:has-text("가나다")'); eq(await page.isVisible('#btnDeleteContact'),false); await page.click('#contactList .hr-list-item:has-text("PCT-0002")'); await page.click('#btnDeleteContact'); await page.waitForTimeout(800);
  eq(U.rowsOf(m,'S36').map(r=>r.pcontact_id),['PCT-0001']); await close();
});

(async()=>{ browser=await U.launch(); const f=await runTests(T,'SCR-11 거래처 관리'); await browser.close(); process.exit(f?1:0); })();
