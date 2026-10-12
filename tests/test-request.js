// STF-SCR-01 의뢰 대장 시험 (프로그램 설계서 §4.8) — 실제 request.html 을 브라우저에서 연다. 오늘 = 2026-10-10
const {runTests,eq,ok}=require('./harness.js');
const U=require('./ui-helper.js');
const T=[]; const t=(id,desc,fn)=>T.push([id,desc,fn]); let browser;
const P=(id,name,roles)=>({party_id:id,name,roles,aliases:'',is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00'});
const PARTIES=[P('PTY-001','직접','경로'),P('PTY-003','가나다','고객,최종 고객사'),P('PTY-004','서치에이','서치업체'),P('PTY-005','서치비','서치업체')];
const R=(id,alias,extra={})=>({request_id:id,alias,requester_party_id:'PTY-001',received_at:'2026-10-01',closed_state:'진행',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...extra});
const L=(id,req,hc,extra={})=>({line_id:id,request_id:req,line_no:1,role_codes:'PM',grade:'고급',headcount:String(hc),rate_sell:'8000000',rate_buy_target:'7000000',is_cancelled:'N',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...extra});
const O=(id,req,line,party,extra={})=>({order_id:id,request_id:req,line_id:line,party_id:party,sent_at:'2026-10-01',reply_due:'2026-10-20',reply_state:'대기',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...extra});
const C=(id,line,stage,extra={})=>({cand_id:id,line_id:line,person_id:'PSN-0001',stage,created_at:'2026-10-02',updated_at:'2026-10-02 09:00:00',...extra});
const BASE={
  S27:PARTIES,
  S32:[R('REQ-2026-001','A프로젝트',{end_client_party_id:'PTY-003',requester_due:'2026-10-14'}),R('REQ-2026-002','B프로젝트',{end_client_name:'직접입력사',received_at:'2026-09-15',requester_due:'2026-11-30'}),
       R('REQ-2025-003','C프로젝트',{end_client_party_id:'PTY-003',received_at:'2025-10-20'}),R('REQ-2026-004','D프로젝트',{received_at:'2026-08-05',closed_state:'실패',requester_due:'2026-10-11'})],
  S33:[L('LN-0001','REQ-2026-001',2),L('LN-0002','REQ-2026-001',1,{line_no:'2',rate_buy_target:'6500000',role_codes:'DBA'}),L('LN-0003','REQ-2026-002',1),L('LN-0004','REQ-2025-003',1),L('LN-0005','REQ-2026-004',1)],
  S34:[O('ORD-00001','REQ-2026-002','LN-0003','PTY-004',{reply_due:'2026-10-05'}),O('ORD-00002','REQ-2026-001','LN-0001','PTY-004'),O('ORD-00003','REQ-2026-001','LN-0001','PTY-005')],
  S31:[C('CND-00001','LN-0001','선정'),C('CND-00002','LN-0004','계약',{person_id:'PSN-0002'})],
  S39:[{person_id:'PSN-0001',mobile:'',email:'',contact_requested_at:'2026-10-05'},{person_id:'PSN-0002',mobile:'010-1111-2222',email:'a@b.c',contact_requested_at:''}],
};
const mock=(x={})=>U.newMock({...BASE,...x});
const ids=p=>p.$$eval('#listBox tbody tr',els=>els.map(e=>e.dataset.id));
const kpi=async(p,k)=>(await p.textContent(`[data-kpi="${k}"] .v`)).replace(/\s+/g,'');

t('TC-SCR01-01','목록 — 의뢰 4건이 의뢰일 최신순으로 나온다, 건수 표시',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock()); eq(await ids(page),['REQ-2026-001','REQ-2026-002','REQ-2026-004','REQ-2025-003']); eq((await page.textContent('#listCount')).trim(),'4건'); eq(page.__errors,[]); await close();
});
t('TC-SCR01-02','인원 부족 — 필요 3 충원 1(선정) → 부족 2명 표시, 충족/종료 건은 부족 아님',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock()); const row=await page.innerText('tr[data-id="REQ-2026-001"]'); ok(/\b3\b/.test(row)&&row.includes('부족 2명'),row);
  ok((await page.innerText('tr[data-id="REQ-2025-003"]')).includes('충족')); ok((await page.innerText('tr[data-id="REQ-2026-004"]')).includes('-'));
  eq(await kpi(page,'short'),'2건','A·B 부족(종료 D 제외)'); await close();
});
t('TC-SCR01-03','연도·월 필터는 서로 독립 — 2026+10월=A만 / 10월만=A·C / 연도만',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock());
  await page.selectOption('#fYear','2026'); await page.selectOption('#fMonth','10'); eq(await ids(page),['REQ-2026-001']);
  await page.selectOption('#fYear',''); eq(await ids(page),['REQ-2026-001','REQ-2025-003']); await page.selectOption('#fMonth',''); await page.selectOption('#fYear','2025'); eq(await ids(page),['REQ-2025-003']); await close();
});
t('TC-SCR01-04','상단 카드 — 진행 중 3 / 부족 2 / 연락처 요청 1 / 마감 임박 1(종료 건 제외), 카드를 누르면 걸러진다',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock());
  eq([await kpi(page,'open'),await kpi(page,'short'),await kpi(page,'contact'),await kpi(page,'due')],['3건','2건','1명','1건']);
  await page.click('[data-kpi="due"]'); eq(await ids(page),['REQ-2026-001']); await page.click('[data-kpi="contact"]'); eq(await ids(page),['REQ-2026-001']);
  await page.click('[data-kpi="short"]'); eq((await ids(page)).sort(),['REQ-2026-001','REQ-2026-002']); await page.click('[data-kpi="short"]'); eq((await ids(page)).length,4,'다시 누르면 해제'); await close();
});
t('TC-SCR01-05','알림 — 회신 지연 / 연락처 요청(값 없이 인원만) / 인터뷰 대기',async()=>{
  const m=mock({S31:[...BASE.S31,C('CND-00003','LN-0003','인터뷰',{person_id:'PSN-0003',interview_at:'2026-10-08'})]});
  const {page,close}=await U.open(browser,'request.html',m); const a=await page.innerText('#alertBox');
  ok(a.includes('B프로젝트')&&a.includes('회신 지연 5일'),a); ok(a.includes('A프로젝트 — 연락처 미확보 후보 1명'),a); ok(a.includes('인터뷰 결과 대기 1명'),a);
  ok(!/010|@/.test(await page.innerText('body')),'연락처 값이 화면에 없다'); await close();
});
t('TC-SCR01-06','단가 — 라인별 판매·매입 단가가 만원/월로, 서로 다르면 범위',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock()); const tds=await page.$$eval('tr[data-id="REQ-2026-001"] td',e=>e.map(x=>x.innerText.trim()));
  eq([tds[7],tds[8]],['800','650~700']); await close();
});
t('TC-SCR01-07','빈 상태 — 의뢰 0건: "등록된 의뢰가 없습니다." / 필터 결과 없음 / 탭 없음 / 읽기 실패',async()=>{
  let h=await U.open(browser,'request.html',mock({S32:[],S33:[],S34:[],S31:[]})); eq((await h.page.textContent('#listBox')).trim(),'등록된 의뢰가 없습니다.'); eq(await h.page.textContent('#alertBox'),'확인할 알림이 없습니다.'); await h.close();
  h=await U.open(browser,'request.html',mock()); await h.page.fill('#fSearch','없는검색어'); ok((await h.page.textContent('#listBox')).includes('조건에 맞는 의뢰가 없습니다.')); await h.page.click('#listBox button'); eq((await ids(h.page)).length,4); await h.close();
  const m=U.newMock({S27:PARTIES}); h=await U.open(browser,'request.html',m); ok((await h.page.textContent('#loadBox')).includes('시트 초기화가 필요합니다.')); await h.close();
  const m2=mock(); m2.failNext(/GET .*values:batchGet/,403,4); m2.failNext(/GET .*S32_REQUEST/,403,4); h=await U.open(browser,'request.html',m2,{wait:1500}); ok((await h.page.textContent('#loadBox')).includes('데이터를 불러오지 못했습니다. 다시 로그인해 주세요.')); eq(U.writes(m2).length,0); await h.close();
});
t('TC-SCR01-08','연락처 읽기 실패 — 연락처 요청 카드만 "확인 불가", 나머지 정상',async()=>{
  const m=mock(); m.failNext(/GET .*S39/,403,6); const {page,close}=await U.open(browser,'request.html',m,{wait:1500});
  eq(await kpi(page,'contact'),'확인불가'); eq(await kpi(page,'open'),'3건'); ok((await page.innerText('#alertBox')).includes('연락처 요청 알림: 확인 불가')); await close();
});
t('CMN-sort','정렬 — 머리글 누르면 오름/내림 전환, 필요 인원 숫자 정렬',async()=>{
  const {page,close}=await U.open(browser,'request.html',mock()); await page.click('th[data-sort="id"]'); eq((await ids(page))[0],'REQ-2025-003'); await page.click('th[data-sort="id"]'); eq((await ids(page))[0],'REQ-2026-004');
  await page.click('th[data-sort="need"]'); eq((await ids(page))[0],'REQ-2026-001','필요 3이 맨 위(내림)'); await close();
});
t('CMN-more','더 보기 — 120건 중 50건만 보이고 누를 때마다 50건씩',async()=>{
  const S32=[],S33=[]; for(let i=1;i<=120;i++){ S32.push(R('REQ-2026-'+String(i).padStart(3,'0'),'P'+i,{received_at:'2026-10-01'})); S33.push(L('LN-'+String(i).padStart(4,'0'),'REQ-2026-'+String(i).padStart(3,'0'),1)); }
  const {page,close}=await U.open(browser,'request.html',mock({S32,S33,S34:[],S31:[]})); eq((await ids(page)).length,50); await page.click('text=더 보기'); eq((await ids(page)).length,100); await page.click('text=더 보기'); eq((await ids(page)).length,120); await close();
});
t('CMN-xss','시트 값은 HTML로 해석되지 않는다 / 행을 누르면 상세로 이동 주소가 맞다',async()=>{
  const m=mock({S32:[R('REQ-2026-001','<img src=x onerror="window.__x=1">')],S33:[L('LN-0001','REQ-2026-001',1)],S34:[],S31:[]}); const {page,close}=await U.open(browser,'request.html',m);
  eq(await page.evaluate(()=>window.__x),undefined); eq(page.__errors,[]); eq(await page.evaluate(()=>{ let u=''; openReq=id=>{u='request-detail.html?id='+encodeURIComponent(id);}; document.querySelector('tr[data-id]').click(); return u; }),'request-detail.html?id=REQ-2026-001'); await close();
});

(async()=>{ browser=await U.launch(); const f=await runTests(T,'SCR-01 의뢰 대장'); await browser.close(); process.exit(f?1:0); })();
