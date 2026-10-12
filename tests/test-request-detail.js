// STF-SCR-02 의뢰 상세 시험 (프로그램 설계서 §5.8 중 단계 ①에 해당하는 것) — request-detail.html 을 브라우저에서 연다. 오늘 = 2026-10-10
const {runTests,eq,ok}=require('./harness.js');
const U=require('./ui-helper.js');
const T=[]; const t=(id,desc,fn)=>T.push([id,desc,fn]); let browser;
const P=(id,name,roles,x={})=>({party_id:id,name,roles,aliases:'',is_active:'Y',created_at:'2026-09-01',updated_at:'2026-09-01 09:00:00',...x});
const PARTIES=[P('PTY-001','직접','경로'),P('PTY-003','가나다','고객,최종 고객사',{aliases:'GND'}),P('PTY-004','서치에이','서치업체'),P('PTY-005','서치비','서치업체'),P('PTY-006','숨긴서치','서치업체',{is_active:'N'}),P('PTY-007','요청사','중개업자')];
const R=(id,alias,x={})=>({request_id:id,alias,requester_party_id:'PTY-007',received_at:'2026-10-01',closed_state:'진행',disclose_client:'N',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...x});
const L=(id,req,hc,x={})=>({line_id:id,request_id:req,line_no:'1',role_codes:'DBA',grade:'고급',headcount:String(hc),rate_sell:'8000000',rate_buy_target:'7000000',is_cancelled:'N',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...x});
const O=(id,req,line,party,x={})=>({order_id:id,request_id:req,line_id:line,party_id:party,sent_at:'2026-10-01',reply_due:'2026-10-17',offered_rate_buy:'7000000',reply_state:'대기',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...x});
const S10=[...['PM','DA','DBA'].map(k=>[k,'','', 'role','2026-10-01']),['증권','','','industry','2026-10-01'],['FDS','','','project_type','2026-10-01'],['후보 부족','','','fail_reason','2026-10-01'],['고객 취소','','','fail_reason','2026-10-01']];
const BASE={S27:PARTIES,S32:[R('REQ-2026-001','AI 플랫폼',{end_client_name:'비밀고객',end_client_party_id:'PTY-003',work_place:'서울',start_ym:'2026-11',duration_months:'6'})],S33:[L('LN-0001','REQ-2026-001',2)],S34:[],S31:[],S36:[]};
function mock(x={},s10=S10){ const m=U.newMock({...BASE,...x}); if(s10) m.addTab('S10_SETTINGS',U.HDR.S10,s10,{rowCount:300,colCount:5}); return m; }
const open=(m,q='?id=REQ-2026-001',o={})=>U.open(browser,'request-detail.html',m,{query:q,...o});
const stubClip=p=>p.evaluate(()=>{ window.__clip=''; Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>{ window.__clip=s; }},configurable:true}); });

t('TC-SCR02-01','새 의뢰 등록 — 별칭·요청자·접수일 입력 후 저장: S32 한 줄, 번호 REQ-2026-001, 상태 "접수", 고객사 공개 기본 N',async()=>{
  const m=mock({S32:[],S33:[]}); const {page,close}=await open(m,'?new=1'); eq(await page.inputValue('#fReceived'),'2026-10-10','접수일 기본 오늘'); eq(await page.inputValue('#fDisclose'),'N');
  eq(await page.textContent('#lineBox'),'의뢰 정보를 먼저 저장해 주세요.'); ok(await page.isDisabled('#btnAddLine'));
  await page.fill('#fAlias','AI 플랫폼 백엔드'); await page.selectOption('#fRequester','PTY-007'); await page.click('#btnSaveInfo'); await page.waitForTimeout(500);
  const r=U.rowsOf(m,'S32'); eq(r.length,1); eq([r[0].request_id,r[0].alias,r[0].requester_party_id,r[0].closed_state,r[0].disclose_client,r[0].received_at],['REQ-2026-001','AI 플랫폼 백엔드','PTY-007','진행','N','2026-10-10']);
  eq(await page.textContent('#statusBadge'),'접수'); ok(page.url().includes('id=REQ-2026-001')); ok(!(await page.isDisabled('#btnAddLine')),'저장 뒤 라인 추가 가능'); eq(page.__errors,[]); await close();
});
t('TC-SCR02-01b','필수 항목 누락 — 칸 아래 안내, 저장 안 됨 / 번호는 접수 연도 기준',async()=>{
  const m=mock({S32:[],S33:[]}); const {page,close}=await open(m,'?new=1'); await page.fill('#fReceived',''); await page.click('#btnSaveInfo');
  eq([await page.textContent('#fAliasErr'),await page.textContent('#fRequesterErr'),await page.textContent('#fReceivedErr')],['별칭을(를) 입력해 주세요.','요청자를(를) 선택해 주세요.','접수일을(를) 입력해 주세요.']); eq(U.writes(m).length,0);
  await page.fill('#fAlias','X'); await page.selectOption('#fRequester','PTY-007'); await page.fill('#fReceived','2027-01-05'); await page.fill('#fDuration','6개월'); await page.click('#btnSaveInfo'); eq(await page.textContent('#fDurationErr'),'기간은 0 이상의 정수(개월)로 입력해 주세요.');
  await page.fill('#fDuration','6'); await page.click('#btnSaveInfo'); await page.waitForTimeout(500); eq(U.rowsOf(m,'S32')[0].request_id,'REQ-2027-001'); await close();
});
t('TC-SCR02-02','겸임 라인 추가 — 역할 DA, DBA 복수 선택: role_codes="DA,DBA", 라인 번호 2, 판매·매입 만원→원',async()=>{
  const m=mock(); const {page,close}=await open(m); await page.click('#btnAddLine'); const c='[data-new="1"]';
  await page.click(`${c} .hr-chip:text-is("DA")`); await page.click(`${c} .hr-chip:text-is("DBA")`); await page.selectOption(`${c} .lc-grade`,'고급'); await page.fill(`${c} .lc-hc`,'1'); await page.fill(`${c} .lc-must`,'Oracle , Tibero'); await page.selectOption(`${c} .lc-ind`,'증권'); await page.selectOption(`${c} .lc-pt`,'FDS');
  await page.fill(`${c} .lc-sell`,'800'); await page.fill(`${c} .lc-buy`,'700.5'); await page.click(`${c} [data-act="saveLine"]`); await page.waitForTimeout(500);
  const n=U.rowsOf(m,'S33')[1]; eq([n.line_id,n.request_id,n.line_no,n.role_codes,n.grade,n.headcount,n.must_skills,n.industry,n.project_type,n.rate_sell,n.rate_buy_target,n.is_cancelled].map(String),['LN-0002','REQ-2026-001','2','DA,DBA','고급','1','Oracle,Tibero','증권','FDS','8000000','7005000','N']); await close();
});
t('TC-SCR02-02b','라인 필수 항목 — 역할·등급·인원 안내 / 인원 0 거절 / 단가 문자 거절',async()=>{
  const m=mock(); const {page,close}=await open(m); await page.click('#btnAddLine'); const c='[data-new="1"]'; await page.click(`${c} [data-act="saveLine"]`);
  eq([await page.textContent(`${c} .lc-err-roles`),await page.textContent(`${c} .lc-err-grade`)],['역할을(를) 선택해 주세요.','등급을(를) 선택해 주세요.']); ok((await page.textContent(`${c} .lc-err-hc`)).includes('인원'));
  await page.fill(`${c} .lc-hc`,'0'); await page.click(`${c} [data-act="saveLine"]`); ok((await page.textContent(`${c} .lc-err-hc`)).includes('1 이상'));
  await page.fill(`${c} .lc-sell`,'abc'); await page.click(`${c} [data-act="saveLine"]`); ok((await page.textContent(`${c} .lc-err-rate`)).includes('단가')); eq(U.writes(m).length,0); await close();
});
t('TC-SCR02-03','마진 계산 — 판매 800, 매입 700: 마진 100 표시, 시트에는 마진이 저장되지 않는다',async()=>{
  const m=mock(); const {page,close}=await open(m); const c='[data-line="LN-0001"]'; eq((await page.textContent(`${c} .lc-margin`)).trim(),'100');
  await page.fill(`${c} .lc-sell`,'900'); eq((await page.textContent(`${c} .lc-margin`)).trim(),'200'); await page.fill(`${c} .lc-buy`,''); eq((await page.textContent(`${c} .lc-margin`)).trim(),'-');
  await page.fill(`${c} .lc-buy`,'700'); await page.click(`${c} [data-act="saveLine"]`); await page.waitForTimeout(400); const r=U.rowsOf(m,'S33')[0]; eq([r.rate_sell,r.rate_buy_target].map(String),['9000000','7000000']); ok(!U.HDR.S33.some(h=>/margin/.test(h)),'마진 열 없음'); await close();
});
t('TC-SCR02-04','전달 문구 — 매입 목표 단가만, 판매 단가·마진·고객사 줄 없음(공개 N) / 복사하면 토스트',async()=>{
  const m=mock(); const {page,close}=await open(m); await stubClip(page); await page.click('#spChips .hr-chip:text-is("서치에이")'); await page.fill('#sDue','2026-10-17'); await page.click('#btnMsg');
  const txt=await page.textContent('#msgBox pre'); ok(txt.includes('700만원/월')&&txt.includes('서치에이')&&txt.includes('2026-10-17')&&txt.includes('근무지: 서울'),txt); ok(!txt.includes('800')&&!/마진|고객사|비밀고객|가나다/.test(txt),txt);
  await page.click('#msgBox [data-copy="0"]'); eq(await U.toastText(page),'복사했습니다.'); eq(await page.evaluate(()=>window.__clip),txt); eq(U.writes(m).length,0,'문구 만들기는 시트에 쓰지 않는다'); await close();
});
t('CMN-msg-disclose','고객사 공개 Y로 바꾸면 고객사 줄이 들어간다 / 회신 기한·업체 누락 안내',async()=>{
  const m=mock({S32:[R('REQ-2026-001','AI',{end_client_name:'비밀고객',disclose_client:'Y',work_place:'서울',start_ym:'2026-11',duration_months:'6'})]}); const {page,close}=await open(m);
  await page.click('#btnMsg'); eq([await page.textContent('#spErr'),await page.textContent('#sDueErr')],['발송 업체를 선택해 주세요.','회신 기한을(를) 입력해 주세요.']);
  await page.click('#spChips .hr-chip:text-is("서치에이")'); await page.fill('#sDue','2026-10-17'); await page.click('#btnMsg'); ok((await page.textContent('#msgBox pre')).includes('고객사: 비밀고객')); await close();
});
t('TC-SCR02-05','발송 기록 — 업체 2곳, 기한 2026-10-17: S34 2줄(매입 단가 스냅샷·조건·대기), ④ 에 업체별 한 줄, 숨긴 업체는 선택지에 없다',async()=>{
  const m=mock(); const {page,close}=await open(m); ok(!(await page.textContent('#spChips')).includes('숨긴서치'));
  await page.click('#btnSend'); eq(await page.textContent('#spErr'),'발송 업체를 선택해 주세요.'); eq(U.writes(m).length,0);
  await page.click('#spChips .hr-chip:text-is("서치에이")'); await page.click('#spChips .hr-chip:text-is("서치비")'); await page.fill('#sDue','2026-10-17'); await page.click('#btnSend'); await page.waitForTimeout(700);
  const r=U.rowsOf(m,'S34'); eq(r.length,2); eq(r.map(x=>[x.order_id,x.party_id,x.line_id,x.sent_at,x.reply_due,x.offered_rate_buy,x.reply_state].map(String)),[['ORD-00001','PTY-004','LN-0001','2026-10-10','2026-10-17','7000000','대기'],['ORD-00002','PTY-005','LN-0001','2026-10-10','2026-10-17','7000000','대기']]);
  ok(r[0].conditions.includes('DBA 고급 2명')&&r[0].conditions.includes('700만원/월')&&!r[0].conditions.includes('800'),r[0].conditions); eq((await page.$$('#orderBox [data-order]')).length,2); eq(await page.textContent('#statusBadge'),'탐색'); await close();
});
t('CMN-dup-send','같은 업체·라인에 이미 보낸 기록이 있으면 확인 — 취소하면 쓰지 않는다',async()=>{
  const m=mock({S34:[O('ORD-00001','REQ-2026-001','LN-0001','PTY-004')]}); const {page,dialogs,setAnswer,close}=await open(m); setAnswer(false);
  await page.click('#spChips .hr-chip:text-is("서치에이")'); await page.fill('#sDue','2026-10-20'); await page.click('#btnSend'); await page.waitForTimeout(300); ok(dialogs[0].includes('이미 발송 기록이 있습니다')); eq(U.rowsOf(m,'S34').length,1);
  setAnswer(true); await page.click('#btnSend'); await page.waitForTimeout(600); eq(U.rowsOf(m,'S34').length,2); await close();
});
t('TC-SCR02-06','회신 지연 — 기한 2026-10-01, 대기, 오늘 10-10: "지연 9일" / 회신 완료 상태는 지연 아님',async()=>{
  const m=mock({S34:[O('ORD-00001','REQ-2026-001','LN-0001','PTY-004',{reply_due:'2026-10-01'}),O('ORD-00002','REQ-2026-001','LN-0001','PTY-005',{reply_due:'2026-10-01',reply_state:'후보 없음'})]}); const {page,close}=await open(m);
  eq(await page.$$eval('[data-delay]',e=>e.map(x=>x.textContent)),['지연 9일']); await close();
});
t('TC-SCR02-06b','회신 상태 저장 — 상태를 바꾸면 회신일=오늘, 바뀐 열만 쓴다 / 대기로 되돌리면 회신일 비움',async()=>{
  const m=mock({S34:[O('ORD-00001','REQ-2026-001','LN-0001','PTY-004',{reply_due:'2026-10-01'})]}); const {page,close}=await open(m); const c='[data-order="ORD-00001"]';
  await page.selectOption(`${c} .oc-state`,'후보 추천'); await page.click(`${c} [data-oact="save"]`); await page.waitForTimeout(500);
  let r=U.rowsOf(m,'S34')[0]; eq([r.reply_state,r.replied_at,r.reply_due,r.sent_at],['후보 추천','2026-10-10','2026-10-01','2026-10-01']); ok(r.updated_at.startsWith('2026-10-10'));
  eq((await page.$$('[data-delay]')).length,0,'지연 표시 사라짐'); await page.selectOption(`${c} .oc-state`,'대기'); await page.click(`${c} [data-oact="save"]`); await page.waitForTimeout(500); r=U.rowsOf(m,'S34')[0]; eq([r.reply_state,r.replied_at],['대기','']); await close();
});
t('TC-SCR02-10','라인 삭제 제한 — 후보 있는 라인: 삭제 거부·취소 안내 / 후보 없는 라인: 삭제됨 / 취소·취소 해제',async()=>{
  const m=mock({S33:[L('LN-0001','REQ-2026-001',2),L('LN-0002','REQ-2026-001',1,{line_no:'2'})],S31:[{cand_id:'CND-00001',line_id:'LN-0001',person_id:'PSN-0001',stage:'추천수령',updated_at:'2026-10-02 09:00:00'}]});
  const {page,close}=await open(m); await page.click('[data-line="LN-0001"] [data-act="deleteLine"]'); eq(await page.textContent('[data-line="LN-0001"] .lc-msg'),'후보가 있어 삭제할 수 없습니다. 취소로 처리해 주세요.'); eq(U.rowsOf(m,'S33').length,2);
  await page.click('[data-line="LN-0001"] [data-act="cancelLine"]'); await page.waitForTimeout(500); eq(U.rowsOf(m,'S33')[0].is_cancelled,'Y'); eq(U.rowsOf(m,'S33').length,2,'행은 남는다');
  eq((await page.textContent('#fillText')).trim(),'충원 0/1','취소 라인은 필요 인원에서 제외');
  await page.click('[data-line="LN-0001"] [data-act="restoreLine"]'); await page.waitForTimeout(500); eq(U.rowsOf(m,'S33')[0].is_cancelled,'N');
  await page.click('[data-line="LN-0002"] [data-act="deleteLine"]'); await page.waitForTimeout(600); eq(U.rowsOf(m,'S33').map(x=>x.line_id),['LN-0001']); await close();
});
t('TC-SCR02-14','실패·취소 처리 — 실패는 사유 필수, 처리하면 상태 배지 "실패", 대기 발송은 종결 표시 / 되돌리기',async()=>{
  const m=mock({S34:[O('ORD-00001','REQ-2026-001','LN-0001','PTY-004',{reply_due:'2026-10-01'})]}); const {page,close}=await open(m); eq(await page.textContent('#statusBadge'),'탐색'); ok(await page.isDisabled('#btnPromote')&&await page.isDisabled('#btnEstimate'));
  await page.click('#btnFail'); await page.click('#btnCloseDo'); eq(await page.textContent('#closeReasonErr'),'실패 사유를 선택해 주세요.'); eq(U.writes(m).length,0);
  await page.selectOption('#closeReason','고객 취소'); await page.click('#btnCloseDo'); await page.waitForTimeout(500); const r=U.rowsOf(m,'S32')[0]; eq([r.closed_state,r.fail_reason_code],['실패','고객 취소']);
  eq(await page.textContent('#statusBadge'),'실패'); ok((await page.textContent('#orderBox')).includes('종결(의뢰 실패)')); eq((await page.$$('[data-delay]')).length,0,'종료 의뢰는 지연 아님'); ok((await page.textContent('#sendBox')).includes('진행으로 되돌리기'));
  await page.click('#btnReopen'); await page.waitForTimeout(500); const r2=U.rowsOf(m,'S32')[0]; eq([r2.closed_state,r2.fail_reason_code],['진행','']); eq(await page.textContent('#statusBadge'),'탐색');
  await page.click('#btnCancel'); await page.click('#btnCloseDo'); await page.waitForTimeout(500); eq(U.rowsOf(m,'S32')[0].closed_state,'취소'); await close();
});
t('TC-SCR02-15','의뢰 정보 수정·메모 — 바뀐 열만 쓰고 수정일시 갱신 / 라인과 발송은 건드리지 않는다',async()=>{
  const m=mock(); const {page,close}=await open(m); await page.fill('#fPlace','판교'); await page.selectOption('#fDisclose','Y'); await page.click('#btnSaveInfo'); await page.waitForTimeout(500);
  const r=U.rowsOf(m,'S32')[0]; eq([r.work_place,r.disclose_client,r.alias,r.created_at],['판교','Y','AI 플랫폼','2026-10-01']); ok(r.updated_at.startsWith('2026-10-10'));
  await page.fill('#fMemo','메모 내용'); await page.click('#btnSaveMemo'); await page.waitForTimeout(500); eq(U.rowsOf(m,'S32')[0].memo,'메모 내용'); eq(U.rowsOf(m,'S33').length,1); await close();
});
t('CMN-conflict','다른 곳에서 먼저 수정했으면 저장하지 않고 안내 / 저장 실패면 입력값 유지',async()=>{
  const m=mock(); const {page,close}=await open(m); m.set('S32_REQUEST',2,U.HDR.S32.indexOf('updated_at')+1,'2026-10-10 09:59:59'); await page.fill('#fPlace','내 수정'); await page.click('#btnSaveInfo'); await page.waitForTimeout(400);
  eq(await page.textContent('#infoMsg'),'다른 곳에서 수정되었습니다. 다시 불러온 뒤 수정해 주세요.'); eq(U.rowsOf(m,'S32')[0].work_place,'서울');
  const m2=mock(); const h=await open(m2); m2.failNext(/POST .*values:batchUpdate/,500,3); await h.page.fill('#fPlace','실패시험'); await h.page.click('#btnSaveInfo'); await h.page.waitForTimeout(1500);
  eq(await h.page.textContent('#infoMsg'),'저장하지 못했습니다. 다시 시도해 주세요.'); eq(await h.page.inputValue('#fPlace'),'실패시험'); await close(); await h.close();
});
t('CMN-load','없는 의뢰 번호 / 탭 없음 / 읽기 실패 / 코드(S10) 읽기 실패는 안내만 / 값은 HTML로 해석되지 않는다',async()=>{
  let h=await open(mock(),'?id=REQ-9999-999'); ok((await h.page.textContent('#loadBox')).includes('해당 의뢰를 찾을 수 없습니다.')); await h.close();
  h=await open(U.newMock({S27:PARTIES})); ok((await h.page.textContent('#loadBox')).includes('시트 초기화가 필요합니다.')); await h.close();
  const m2=mock(); m2.failNext(/GET .*values:batchGet/,403,4); m2.failNext(/GET .*S32_REQUEST/,403,4); h=await open(m2,'?id=REQ-2026-001',{wait:1500}); ok((await h.page.textContent('#loadBox')).includes('데이터를 불러오지 못했습니다. 다시 로그인해 주세요.')); eq(U.writes(m2).length,0); await h.close();
  h=await open(mock({},null)); ok((await h.page.textContent('#loadBox')).includes('코드 목록')); ok(await h.page.isVisible('#screen'),'나머지 화면은 열린다'); await h.close();
  const m3=mock({S32:[R('REQ-2026-001','<img src=x onerror="window.__x=1">',{end_client_name:'"><b id=zz>'})],S27:[...PARTIES,P('PTY-008','<i id=yy>서치</i>','서치업체')]}); h=await open(m3);
  eq(await h.page.evaluate(()=>window.__x),undefined); eq(await h.page.evaluate(()=>!!document.getElementById('zz')||!!document.getElementById('yy')),false); eq(h.page.__errors,[]); await h.close();
});

(async()=>{ browser=await U.launch(); const f=await runTests(T,'SCR-02 의뢰 상세'); await browser.close(); process.exit(f?1:0); })();
