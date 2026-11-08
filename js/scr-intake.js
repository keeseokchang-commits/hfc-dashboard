// HFC scr-intake.js v2.11.0 — STF-SCR-06 이력서 등록
// 근거: 프로그램 설계서 §10(SCR-06). 이력서 읽기 에이전트(BAT-01)를 수동으로 요청하고, 사람이 확인해야 하는 건을 한 목록에서 처리한다. 후보를 한 명씩 직접 만드는 입력은 없다.
// 2026-10-14: BAT-01 방식 ① 확정(사용자 "1 로 가자") — Claude 가 읽어 만든 JSON 을 이 화면에서 가져온다(규칙은 cmn-resume.js). "읽기 요청" 버튼은 Claude 에게 읽을 일을 알리는 기록으로 남는다.
// 정한 것(2026-10-13, BAT-01 계약 — 에이전트 본체는 기준선 결정 대기):
//   · 수동 실행 요청 = S37 에 state='요청됨' 행 추가. 폴더: trigger='수동 폴더', target_ref 비움 / 파일: trigger='수동 파일', target_ref='<Drive 링크> ; party=<거래처ID>'(경로를 함께 전달)
//   · 다시 읽기 = 그 파일만 S37 '수동 파일' 요청(target_ref = S28.drive_url, 없으면 drive_file_id)
//   · 같은 사람 확인 파일: 에이전트가 새 후보(S20)와 경력을 만들고 S28.person_id=새 후보, match_person_id=기존 후보로 둔다 → "같은 사람" = CMN-09(새 후보를 기존 후보로 합침), "다른 사람" = S28.parse_status 를 성공으로, match_person_id 비움
//   · 검토 필요 파일: S23.pending_json 의 file_id 가 그 파일. 그 파일의 보류 항목을 모두 처리하면 S28.parse_status 를 성공으로
//   · "처리 종료"(읽기 실패를 목록에서 빼기)는 파일 상태 값이 설계에 없어 만들지 않았다 — 사용자 결정 대기
// v2.11.0 (설계서 resume-intake-process-design v0.2 Phase 2): 드라이브 연동. 드라이브 권한이 있으면 ①올리기 ②Claude 에게 한 줄 ③Result 폴더 결과 가져오기 ④처리 끝난 파일 자동 Done/Fail 이동을 한 화면에서 한다.
//   권한이 없거나 드라이브가 읽히지 않으면 v2.10.1 의 S37 기록 방식(문구 복사 → 결과 파일 올리기)이 그대로 동작한다.
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-person.js, cmn-review.js, cmn-merge.js, cmn-drive.js, hr-ui.js
const KEYS=['S37','S28','S23','S20','S27'];
const NEED=['읽기실패','검토필요','동일인확인'];
const NEED_LABEL={읽기실패:'읽기 실패',검토필요:'검토 필요',동일인확인:'같은 사람 확인'};
const MSG={link:'Drive 파일 링크가 아닙니다. 링크를 다시 확인해 주세요.',running:'실행 중입니다. 완료 후 다시 눌러 주세요.',empty:'처리할 건이 없습니다.',merge:'이 작업은 되돌릴 수 없습니다. 변경 건수를 확인하고 진행하세요.'};
const DRIVE=[/^https:\/\/drive\.google\.com\/file\/d\/[\w-]{10,}/,/^https:\/\/drive\.google\.com\/(open|uc)\?(.*&)?id=[\w-]{10,}/,/^https:\/\/docs\.google\.com\/(document|spreadsheet|presentation)\/d\/[\w-]{10,}/];
let D={}, filter='', panel=null, PM=new Map(), PERS=new Map();
const DR0={ok:false,reason:'scope',err:'',newFiles:[],failFiles:[],resultFiles:[],resultFolder:false};
let DR={...DR0}, impMatches=[], impSrc=[];

const isDriveLink=s=>DRIVE.some(r=>r.test(String(s||'').trim()));
// 「실행 중」으로 30분 넘게 남은 줄은 중간에 끊긴 것으로 보고 새 요청을 막지 않는다(화면을 닫거나 통신이 끊기면 완료 표시가 안 남는다)
const STALE_MIN=30;
const stale=r=>{ if(String(r.state||'').trim()!=='실행 중') return false; const t=Date.parse(String(r.started_at||r.requested_at||'').replace(' ','T')+'+09:00'); return !isNaN(t)&&(Date.now()-t)>STALE_MIN*60000; };
const running=()=>D.S37.some(r=>{ const s=String(r.state||'').trim(); return s==='요청됨'||(s==='실행 중'&&!stale(r)); });
const pname=id=>{ const p=PERS.get(id); return p?(p.name||id):(id||'-'); };

async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const r=await hrLoadScreen(KEYS);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  box.innerHTML=''; hrQ('screen').style.display=''; D=r.data; PM=hrMap(D.S27,'party_id'); PERS=hrMap(D.S20,'person_id');
  await loadDrive(); fillParties(); render();
}
// 드라이브 현황(New·Fail·Result). 권한이 없거나 읽지 못하면 DR.ok=false 로 두고 예전 방식으로 동작한다.
async function loadDrive(){
  if(!driveHas()){ DR={...DR0}; return; }
  try{ DR={...DR0,ok:true,reason:'',...await driveSnapshot()}; }
  catch(e){ DR={...DR0,reason:'api',err:e.message||DRV_MSG.api,status:e.status||0,why:e.reason||''}; }
}
const drvC=()=>drvClassify(DR.newFiles,D.S28);
function fillParties(){
  const cur=hrQ('fParty').value; const ps=D.S27.filter(p=>hrYes(p.is_active)&&hrSplit(p.roles).some(x=>['서치업체','경로'].includes(x)));
  const pc=hrQ('pParty').value; hrQ('pParty').innerHTML='<option value="">선택 안 함</option>'+ps.map(p=>`<option value="${hrEsc(p.party_id)}">${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join(''); hrQ('pParty').value=pc; if(!hrQ('pDate').value) hrQ('pDate').value=hrToday(); refreshPrompt();
  hrQ('fParty').innerHTML='<option value="">선택 안 함</option>'+ps.map(p=>`<option value="${hrEsc(p.party_id)}">${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join(''); hrQ('fParty').value=cur;
  const opts='<option value="">선택 안 함</option>'+ps.map(p=>`<option value="${hrEsc(p.party_id)}">${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join('');
  ['uParty','iParty'].forEach(id=>{ const e=hrQ(id); if(!e) return; const c=e.value; e.innerHTML=opts; e.value=c; }); if(!hrQ('uDate').value) hrQ('uDate').value=hrToday();
}
// 이력서 Drive 폴더(프로젝트 문서 drive-folders-v0.1, 2026-10-10 생성). 폴더를 바꾸면 이 값과 문서를 함께 고친다.
const DRIVE_DIR=[['New','신규 이력서(읽을 대상)','1vqCHjkuroS_ra477ZHOFwWE2TuHr5YhA'],['Done','처리 완료','1NdeNccd-rzu8gOYCpy6qj76HXaCEsZ_e'],['Fail','읽기 실패','14kxW4rIb6QCB12uwvXYsmHxrvE6cvcDh']];
function renderFolder(){
  const rl=DR.ok&&DR.resultFolder?` · <a href="https://drive.google.com/drive/folders/${DRV.RESULT}" target="_blank" rel="noopener"><b>Result</b></a> Claude 가 읽은 결과`:'';
  const a=([n,d,id])=>`<a href="https://drive.google.com/drive/folders/${id}" target="_blank" rel="noopener"><b>${n}</b></a> ${d}`;
  hrQ('folderPath').innerHTML='읽는 폴더: 내 드라이브 › HFC_human_resource › '+a(DRIVE_DIR[0])+'<br><span class="hr-muted">같은 상위 폴더 안: '+DRIVE_DIR.slice(1).map(a).join(' · ')+rl+'</span>';
}
function render(){ renderFolder(); renderProc(); renderNotice(); renderFail(); renderNeed(); renderRuns(); }

// ── 에이전트 상태 · 최근 결과 ──────────────────────────────────────────────────
const runsSorted=()=>D.S37.slice().sort((a,b)=>String(b.requested_at||'').localeCompare(String(a.requested_at||''))||String(b.run_id).localeCompare(String(a.run_id)));
const cnt=r=>`신규 ${parseInt(r.cnt_new)||0} · 갱신 ${parseInt(r.cnt_updated)||0} · 검토 ${parseInt(r.cnt_review)||0} · 실패 ${parseInt(r.cnt_fail)||0}`;
const stCls={요청됨:'amber','실행 중':'blue',완료:'green',실패:'red'};
// ── 프로세스 화면: 지금 할 일 + 단계 카드 (설계서 resume-intake-process-design-v0.2 Phase 1) ──
// 단계 판정은 시트 기록에서 계산한다(저장값 없음): 요청됨이 있으면 ③ 결과 가져오기 차례, 없고 확인 필요가 있으면 ④, 둘 다 없으면 ② 읽기 맡기기.
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
const pendingReq=()=>D.S37.filter(r=>String(r.state||'').trim()==='요청됨').sort((a,b)=>String(a.requested_at||'').localeCompare(String(b.requested_at||''))||String(a.run_id).localeCompare(String(b.run_id)));
function procMode(){
  if(DR.ok){ if(DR.resultFiles.length) return 'import'; if(drvC().pending.length) return 'ask'; return needRows().length?'need':'idle'; }   // 드라이브 상태로 판정
  return pendingReq().length?'import':(needRows().length?'need':'ask');                                                                   // 예전 방식: S37 기록으로 판정
}
let lastMode='';
function renderProc(){ if(DR.ok) return renderProcDrive(); hrQ('secUp').style.display='none'; hrQ('askParty').style.display=''; hrQ('drvImp').style.display='none'; renderProcOld(); }
function renderProcOld(){
  const mode=procMode(), pend=pendingReq(), need=needRows(), sd=D.S37.filter(stale);
  const age=pend.length?Math.max(0,dayDiff(String(pend[0].requested_at||'').slice(0,10)||hrToday(),hrToday())):0;
  hrQ('procAge').textContent=pend.length?(age===0?'오늘 요청함':`요청한 지 ${age}일째`):'';
  hrQ('procNow').classList.toggle('calm',mode==='ask');
  const bd=hrQ('procBadge'); bd.className='hr-badge '+(mode==='ask'?'gray':(mode==='import'?'blue':'amber')); bd.textContent=mode==='ask'?'새 이력서가 있을 때':(mode==='import'?'진행 중 · Claude 와 함께':'지금 할 일 · 내 차례');
  const by=k=>need.filter(f=>f.parse_status===k).length;
  const T={ask:['② Claude 에게 읽기를 맡기세요','먼저 이력서를 드라이브 New 폴더에 넣어 두세요. 처리할 이력서가 없으면 지금 할 일은 없습니다.'],
    import:['Claude 에게 문구를 보내 읽기를 맡기고, 받은 결과 파일을 ③에서 올리세요',(age>=1?'결과를 아직 받지 못했다면 ② 의 문구를 다시 복사해 보내세요. ':'')+'결과 파일을 받으면 아래 ③에서 올려 가져옵니다. 요청을 없애려면 ③ 아래 「이 요청 취소」를 누르세요.'],
    need:[`④ 확인이 필요한 ${need.length}건을 처리하세요`,NEED.map(k=>by(k)?`${NEED_LABEL[k]} ${by(k)}건`:'').filter(Boolean).join(' · ')+' — 아래 「④ 확인 필요 처리」 목록에서 처리합니다.']}[mode];
  hrQ('procTitle').textContent=T[0]; hrQ('procSub').textContent=T[1]+(D.S37.some(r=>String(r.state||'').trim()==='실행 중'&&!stale(r))?' (가져오기가 진행 중입니다.)':'');
  hrQ('staleBox').innerHTML=sd.length?`<div class="hr-sub" id="staleNote" style="margin-top:8px">중간에 끊긴 실행이 ${sd.length}건 남아 있습니다(${hrEsc(sd.map(r=>r.requested_at).join(', '))}). 새 요청에는 영향이 없습니다. <button class="btn btn-secondary btn-sm" data-act="clearStale">끊긴 실행 정리</button></div>`:'';
  hrQ('askOld').style.display=''; hrQ('askHelpOld').style.display=''; hrQ('askHelpDrv').style.display='none';
  if('o:'+mode!==lastMode){ hrQ('secAsk').open=(mode!=='need'); hrQ('secImport').open=(mode==='import'); lastMode='o:'+mode; }
  hrQ('reqTools').innerHTML=pend.length?`<span class="hr-sub">읽기 요청 ${pend.length}건 대기 중 (${hrEsc(String(pend[0].requested_at||'').slice(0,10))} 요청)</span><button class="btn btn-secondary btn-sm" data-act="cancelReq">이 요청 취소</button>`:'';
  const cls={ask:['','cur','wait','wait'],import:['done','cur','wait','wait'],need:['done','done','done','cur']}[mode];
  const lab={done:'완료',cur:'지금 할 차례',wait:'대기'}; const labI={cur:'진행 중',wait:'결과가 오면'};
  const who=w=>`<span class="proc-who">${w}</span>`;
  const info=[
    `드라이브 New 폴더에 이력서 저장 ${who('나')}<br>${DRIVE_DIR[0]?`<a href="https://drive.google.com/drive/folders/${DRIVE_DIR[0][2]}" target="_blank" rel="noopener">New 폴더 열기</a>`:''}`,
    mode==='ask'?`Claude 에게 문구와 이력서 전달 ${who('나 → Claude')}`:(pend.length?`${hrEsc(String(pend[0].requested_at||'').slice(0,10))} 요청 · Claude 가 읽는 중 ${who('나 → Claude')}`:`읽기 요청 완료 ${who('나 → Claude')}`),
    mode==='need'?`가져오기 완료 ${who('나')}`:`Claude 가 준 결과 파일 올리기 ${who('나')}`,
    need.length?`${need.length}건 남음 ${who('나')}`:`가져온 뒤 생김 ${who('나')}`];
  const name=['① 이력서 넣기','② 읽기 맡기기','③ 결과 가져오기','④ 확인 필요 처리'];
  const first=[mode==='ask'?'먼저 넣어 두기':'완료',mode==='import'?labI.cur:lab[cls[1]],mode==='import'?labI.wait:lab[cls[2]],lab[cls[3]]];
  hrQ('procSteps').innerHTML=name.map((n,i)=>`<div class="proc-st ${cls[i]}" data-step="${i+1}"><div class="n">${n}</div><div class="t">${first[i]}</div><div class="w">${info[i]}</div></div>`).join('');
}

// ── 드라이브 방식(v2.11.0): 판정은 New·Result 폴더와 시트(S28)에서 계산한다 ─────────────────────
function renderProcDrive(){
  const mode=procMode(), C=drvC(), pend=C.pending, need=needRows(), nRes=DR.resultFiles.length, sd=D.S37.filter(stale);
  hrQ('secUp').style.display=''; hrQ('askParty').style.display='none'; hrQ('drvImp').style.display=''; hrQ('askOld').style.display='none'; hrQ('askHelpOld').style.display='none'; hrQ('askHelpDrv').style.display='';
  const oldest=pend.map(f=>drvDay(f.createdTime)).filter(Boolean).sort()[0]; const age=oldest?Math.max(0,dayDiff(oldest,hrToday())):0;
  hrQ('procAge').textContent=mode==='ask'&&oldest?(age===0?'오늘 넣음':`New 폴더에 넣은 지 ${age}일째`):'';
  hrQ('procNow').classList.toggle('calm',mode==='idle');
  const bd=hrQ('procBadge'); bd.className='hr-badge '+(mode==='idle'?'gray':'amber');
  bd.textContent={idle:'처리할 이력서 없음',ask:'지금 할 일 · Claude 에게 맡기기',import:'결과 도착 · 내 차례',need:'지금 할 일 · 내 차례'}[mode];
  const by=k=>need.filter(f=>f.parse_status===k).length;
  const T={idle:['새로 처리할 이력서가 없습니다','이력서가 생기면 ①에서 올리거나 드라이브 New 폴더에 넣어 두세요. 올린 뒤에는 이 화면이 다음 할 일을 알려 줍니다.'],
    ask:[`② Claude 에게 읽기를 맡기세요 — 새 이력서 ${pend.length}건`,'아래 ②의 한 줄을 복사해 새 Claude 대화에 붙여 넣으세요. Claude 가 읽은 결과가 Result 폴더에 도착하면 이 화면이 알려 줍니다.'+(age>=1?' 며칠 지났다면 결과가 도착했는지 🔄 새로고침으로 확인해 보세요.':'')],
    import:[`③ Claude 가 읽은 결과가 도착했습니다 (${nRes}개)`,'「결과 불러와 미리보기」를 누르고 건수를 확인한 뒤 「가져오기」를 누르세요. 가져온 이력서 파일은 자동으로 Done/Fail 폴더로 옮겨집니다.'],
    need:[`④ 확인이 필요한 ${need.length}건을 처리하세요`,NEED.map(k=>by(k)?`${NEED_LABEL[k]} ${by(k)}건`:'').filter(Boolean).join(' · ')+' — 아래 「④ 확인 필요 처리」 목록에서 처리합니다.']}[mode];
  hrQ('procTitle').textContent=T[0]; hrQ('procSub').textContent=T[1];
  hrQ('staleBox').innerHTML=sd.length?`<div class="hr-sub" id="staleNote" style="margin-top:8px">중간에 끊긴 실행이 ${sd.length}건 남아 있습니다(${hrEsc(sd.map(r=>r.requested_at).join(', '))}). 새 요청에는 영향이 없습니다. <button class="btn btn-secondary btn-sm" data-act="clearStale">끊긴 실행 정리</button></div>`:'';
  const pr=pendingReq(); hrQ('reqTools').innerHTML=pr.length?`<span class="hr-sub">예전 방식의 읽기 요청 ${pr.length}건이 남아 있습니다 (${hrEsc(String(pr[0].requested_at||'').slice(0,10))} 요청)</span><button class="btn btn-secondary btn-sm" data-act="cancelReq">이 요청 취소</button>`:'';
  hrQ('drvResult').innerHTML=nRes?`<div class="hr-sub" style="margin-bottom:6px">Result 폴더에 도착한 결과 ${nRes}개: ${DR.resultFiles.map(f=>`<a href="${hrEsc(f.webViewLink||'#')}" target="_blank" rel="noopener">${hrEsc(f.name)}</a>`).join(', ')}</div><button class="btn btn-primary" data-act="drvLoadResult">결과 불러와 미리보기</button>`
    :`<div class="hr-muted">${DR.resultFolder?'Result 폴더에 도착한 결과가 없습니다.':'Result 폴더가 없어 자동으로 받을 수 없습니다. 아래에 결과를 직접 붙여 넣거나 파일로 올리세요.'}</div>`;
  const key='d:'+mode; if(key!==lastMode){ hrQ('secUp').open=(mode==='idle'); hrQ('secAsk').open=(mode==='ask'); hrQ('secImport').open=(mode==='import'); lastMode=key; }
  const cls={idle:['','wait','wait','wait'],ask:['done','cur','wait','wait'],import:['done','done','cur','wait'],need:['done','done','done','cur']}[mode];
  const first={idle:['필요할 때','대기','대기','대기'],ask:['완료','지금 할 차례','결과가 오면','대기'],import:['완료','완료','지금 할 차례','대기'],need:['완료','완료','완료','지금 할 차례']}[mode];
  const who=w=>`<span class="proc-who">${w}</span>`;
  const info=[`이력서 올리기 ${who('나')}<br>${pend.length?`New 폴더에 읽을 이력서 ${pend.length}건`:'New 폴더에 읽을 이력서가 없습니다'}<br><a href="https://drive.google.com/drive/folders/${DRV.NEW}" target="_blank" rel="noopener">New 폴더 열기</a>`,
    mode==='ask'?`Claude 에게 한 줄 전달 ${who('나 → Claude')}`:(mode==='idle'?`Claude 가 New 폴더를 읽음 ${who('나 → Claude')}`:`읽기 완료 ${who('Claude')}`),
    mode==='import'?`결과 ${nRes}개 도착 · 가져오기 ${who('나')}`:(mode==='need'?`가져오기 완료 ${who('나')}`:`결과 미리보고 가져오기 ${who('나')}`),
    need.length?`${need.length}건 남음 ${who('나')}`:`가져온 뒤 생김 ${who('나')}`];
  const name=['① 이력서 넣기','② 읽기 맡기기','③ 결과 가져오기','④ 확인 필요 처리'];
  hrQ('procSteps').innerHTML=name.map((n,i)=>`<div class="proc-st ${cls[i]}" data-step="${i+1}"><div class="n">${n}</div><div class="t">${first[mode==='idle'?i:i]}</div><div class="w">${info[i]}</div></div>`).join('');
}
function renderNotice(){
  const el=hrQ('drvNotice'); let h=''; const box=(t,err)=>`<div class="hr-notice${err?' err':''}" style="margin-top:8px">${t}</div>`;
  if(!DR.ok&&DR.reason==='scope') h=box('드라이브 권한이 아직 없습니다. 허용하면 이력서를 이 화면에서 올리고, 처리가 끝난 파일이 자동으로 Done/Fail 폴더로 옮겨집니다. 허용하기 전에는 예전 방식(문구 복사 → 결과 파일 올리기)으로 쓸 수 있습니다. <button class="btn btn-primary btn-sm" data-act="grantDrive">드라이브 권한 허용</button>');
  else if(!DR.ok) h=box(`${hrEsc(DR.err||DRV_MSG.api)} <span class="hr-sub">(오류 ${DR.status||'통신'}${DR.why&&DR.why!=='apiOff'?' · '+hrEsc(DR.why):''})</span> 예전 방식(문구 복사 → 결과 파일 올리기)으로 쓸 수 있습니다. <button class="btn btn-secondary btn-sm" data-act="reloadDrive">다시 시도</button>${DR.status===403&&DR.why!=='apiOff'?' <button class="btn btn-primary btn-sm" data-act="grantDrive">드라이브 권한 허용</button>':''}`,true);
  else {
    if(!DR.resultFolder) h+=box(DRV_MSG.noResult+' 만들기 전에는 Claude 가 준 결과 파일을 ③에서 직접 올려 가져옵니다.');
    const st=drvC().stuck; if(st.length){ const d=st.filter(x=>x.to==='DONE').length, f=st.length-d; h+=box(`처리가 끝났지만 아직 옮기지 못한 이력서 ${st.length}건이 New 폴더에 남아 있습니다 (Done 으로 ${d}건 · Fail 로 ${f}건). <button class="btn btn-primary btn-sm" data-act="moveStuck">지금 옮기기</button>`); }
  }
  el.innerHTML=h;
}
function renderFail(){
  const c=hrQ('failCard'); if(!DR.ok||!DR.failFiles.length){ c.style.display='none'; return; } c.style.display='';
  hrQ('failCount').textContent=`${DR.failFiles.length}건`;
  hrQ('failBox').innerHTML=`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>파일</th><th>보낸 곳</th><th>넣은 날</th><th>읽지 못한 이유</th><th></th></tr></thead><tbody>${DR.failFiles.map(f=>{
    const row=D.S28.find(r=>drvRowMatches(r,f)); const pt=(f.appProperties||{}).party||(row&&row.source_party_id)||'';
    return `<tr data-fail="${hrEsc(f.id)}"><td><a href="${hrEsc(f.webViewLink||'#')}" target="_blank" rel="noopener">${hrEsc(f.name)}</a></td><td style="text-align:center">${pt?hrEsc(hrPartyLabel(PM,pt)):'-'}</td><td style="text-align:center">${hrEsc(drvDay(f.createdTime)||'-')}</td><td>${hrEsc((row&&row.parse_error)||'-')}</td><td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-act="rereadFail" data-id="${hrEsc(f.id)}" title="New 폴더로 되돌려 다시 읽게 합니다">다시 읽기</button></td></tr>`; }).join('')}</tbody></table></div>
    <div class="hr-sub" style="margin-top:6px">서치업체에서 다시 받아야 하는 파일이면 서치업체에 다시 요청하세요. 「다시 읽기」는 파일을 New 폴더로 되돌립니다.</div>`;
}
// 오래 걸리는 작업의 진행 표시(맨 위 안내 아래 한 줄). 끝나면 setProg('')
function setProg(t){ const e=hrQ('drvProg'); if(!e) return; e.style.display=t?'':'none'; hrQ('drvProgTxt').textContent=t||''; }
async function grantDrive(btn){ await hrBusy(btn,async()=>{ const ok=await authGrantDrive(); if(!ok){ toast('드라이브 권한을 받지 못했습니다. 동의 창에서 드라이브 항목을 선택해 주세요.',true); return; } toast('드라이브 권한을 받았습니다.'); await loadAll(); }); }
async function reloadDrive(btn){ await hrBusy(btn,async()=>{ await loadAll(); }); }
async function moveStuck(btn){
  await hrBusy(btn,async()=>{
    await loadDrive(); const st=DR.ok?drvC().stuck:[]; let ok=0,bad=0;
    let i=0; for(const x of st){ setProg(`파일을 옮기는 중… ${++i} / ${st.length}`); try{ const r=await driveMove(x.file.id,'NEW',x.to,{reread:null}); if(!r.skipped) ok++; }catch(e){ bad++; } }
    setProg('');
    toast(bad?`${ok}건을 옮기고 ${bad}건은 옮기지 못했습니다. 다시 눌러 주세요.`:`${ok}건을 옮겼습니다.`,!!bad); await loadAll();
  });
}
async function moveBack(btn,id){   // Fail → New (다시 읽기). 되돌린 표시를 붙여 「읽을 대상」으로 센다.
  await hrBusy(btn,async()=>{
    try{ const r=await driveMove(id,'FAIL','NEW',{reread:hrToday()}); toast(r.skipped?'이 파일은 이미 Fail 폴더에 없습니다.':'New 폴더로 되돌렸습니다. 다시 읽기를 맡겨 주세요.',!!r.skipped); }
    catch(e){ toast(e.message||DRV_MSG.api,true); }
    await loadAll();
  });
}
const rereadFail=btn=>moveBack(btn,btn.dataset.id);

// ① 이력서 올리기: 형식 확인 → 내용 해시로 중복 확인 → New 폴더에 저장(보낸 곳·받은 날을 파일 속성으로 붙인다)
async function doUpload(btn){
  const inp=hrQ('uFiles'); const files=[...(inp.files||[])]; hrQ('uResult').innerHTML='';
  if(!files.length){ hrQ('uResult').innerHTML='<div class="hr-err">올릴 이력서 파일을 선택해 주세요.</div>'; return; }
  await hrBusy(btn,async()=>{
    await loadDrive(); if(!DR.ok){ hrQ('uResult').innerHTML=`<div class="hr-err">${hrEsc(DR.err||DRV_MSG.scope)}</div>`; return; }
    const props={}; const party=hrQ('uParty').value, day=hrQ('uDate').value; if(party) props.party=party; if(day) props.received=day; props.via='hfc-screen';
    const rows=[]; const seen=new Set(); let up=0;
    let k=0; for(const f of files){
      setProg(`이력서를 올리는 중… ${++k} / ${files.length} (${f.name})`);
      if(!drvExtOk(f.name)){ rows.push([f.name,'올리지 않음',DRV_MSG.ext]); continue; }
      let h; try{ h=await drvSha16(f); }catch(e){ rows.push([f.name,'올리지 않음','파일을 읽지 못했습니다.']); continue; }
      if(seen.has(h)){ rows.push([f.name,'올리지 않음','이번에 고른 파일 중 같은 내용이 있습니다.']); continue; } seen.add(h);
      const why=drvDupReason(h,D.S28,DR.newFiles,pname); if(why){ rows.push([f.name,'올리지 않음',why]); continue; }
      try{ const o=await driveUpload(f,props); DR.newFiles.push(o); up++; rows.push([f.name,'올림','New 폴더']); }
      catch(e){ rows.push([f.name,'실패',e.message||DRV_MSG.api]); }
    }
    setProg(''); inp.value=''; await loadAll();
    hrQ('uResult').innerHTML=`<div id="uCounts" style="margin:8px 0">올림 <b>${up}</b> · 올리지 않음 <b>${rows.filter(r=>r[1]==='올리지 않음').length}</b> · 실패 <b>${rows.filter(r=>r[1]==='실패').length}</b></div><div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>파일</th><th>결과</th><th>사유</th></tr></thead><tbody>${rows.map(r=>`<tr data-up="1"><td>${hrEsc(r[0])}</td><td style="text-align:center">${hrEsc(r[1])}</td><td>${hrEsc(r[2])}</td></tr>`).join('')}</tbody></table></div>`;
    toast(up?`${up}건을 New 폴더에 올렸습니다.`:'올린 파일이 없습니다.',!up);
  });
}
// ③ Result 폴더의 결과 JSON 을 모두 합쳐 불러오고 바로 미리보기
async function drvLoadResult(btn){
  await hrBusy(btn,async()=>{
    await loadDrive(); if(!DR.ok||!DR.resultFiles.length){ render(); toast('도착한 결과가 없습니다.',true); return; }
    const merged={schema:'hfc-resume-import/1',resumes:[]}; const used=[], bad=[];
    setProg('Result 폴더의 결과를 읽는 중…'); for(const f of DR.resultFiles){ try{ const j=JSON.parse(await driveReadText(f.id)); if(j&&Array.isArray(j.resumes)){ merged.resumes.push(...j.resumes); used.push(f.id); } else bad.push(f.name); }catch(e){ bad.push(f.name); } }
    if(!used.length){ hrQ('impErr').textContent=`결과 파일을 읽지 못했습니다: ${bad.join(', ')}`; return; }
    setProg(''); hrQ('impText').value=JSON.stringify(merged); impReset(); impSrc=used;
    await impPreview(hrQ('btnPreview'));
    if(bad.length) hrQ('impErr').textContent=`읽지 못한 결과 파일이 있어 건너뛰었습니다(폴더에 그대로 둡니다): ${bad.join(', ')}`;
  });
}
// 가져오기 뒤 파일 정리: 이력서는 New → Done/Fail, 다 처리된 결과 파일은 Done 아래 「결과 보관」으로
async function drvAfter(r,matches,src){
  const o={done:0,fail:0,err:0}; const total=(r.results||[]).length;
  for(let i=0;i<total;i++){
    const m=matches[i], to=drvDest(r.results[i]); if(!m||!to) continue; setProg(`이력서 파일을 Done/Fail 폴더로 옮기는 중… ${i+1} / ${total}`);
    try{ const x=await driveMove(m.id,'NEW',to,{reread:null}); if(!x.skipped) o[to==='FAIL'?'fail':'done']++; }catch(e){ o.err++; }
  }
  if(!r.stopped&&r.ok!==false&&o.err===0){ setProg('결과 파일을 보관 폴더로 옮기는 중…'); for(const id of src){ try{ await driveMove(id,'RESULT','ARCHIVE'); }catch(e){ o.err++; } } }
  setProg(''); return o;
}
async function cancelReq(btn){
  if(!confirm('읽기 요청 기록을 취소합니다. 이미 받은 결과 파일에는 영향이 없습니다. 계속할까요?')) return;
  await hrBusy(btn,async()=>{
    const r0=await hrReadMany(['S37']); if(r0.failed.length){ toast(HR_MSG.read(HR_TABS.S37.tab),true); return; }
    D.S37=dedupe(r0.tabs.S37.rows,HEADERS.S37[0]); let fail=0; const list=pendingReq();
    for(const r of list){ const u=await hrUpdate('S37',r.run_id,{state:'실패',finished_at:hrNow(),error:'사용자가 취소'},{readUpdatedAt:r.updated_at}); if(!u.ok) fail++; }
    toast(fail?`${fail}건은 취소하지 못했습니다. 다시 눌러 주세요.`:`읽기 요청 ${list.length}건을 취소했습니다.`,!!fail); await loadAll();
  });
}
function renderRuns(){
  const rs=runsSorted().slice(0,10);
  hrQ('runBox').innerHTML=rs.length?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>요청 시각</th><th>종류</th><th>상태</th><th>결과</th><th>대상</th></tr></thead><tbody>${rs.map(r=>`<tr data-run="${hrEsc(r.run_id)}"><td>${hrEsc(r.requested_at)}</td><td>${hrEsc(r.trigger)}</td><td><span class="hr-badge ${stCls[r.state]||'gray'}">${hrEsc(r.state)}</span></td><td>${r.state==='완료'?hrEsc(cnt(r)):(r.state==='실패'?hrEsc(r.error||'-'):'-')}</td><td>${hrEsc(String(r.target_ref||'폴더').split(' ; ')[0])}</td></tr>`).join('')}</tbody></table></div>`
    :'<div class="hr-muted">아직 실행 기록이 없습니다.</div>';
}

// ── 실행 요청 ────────────────────────────────────────────────────────────────
async function request(btn,trigger,ref){
  await hrBusy(btn,async()=>{
    const r0=await hrReadMany(['S37']); if(r0.failed.length){ toast(HR_MSG.read(HR_TABS.S37.tab),true); return; }   // 쓰기 직전 다시 확인
    D.S37=dedupe(r0.tabs.S37.rows,HEADERS.S37[0]);
    if(running()){ toast(MSG.running,true); render(); return; }
    const a=await hrAppend('S37',{trigger,target_ref:ref,requested_at:hrNow(),state:'요청됨'});
    if(!a.ok){ toast(hrSaveFailText(a),true); return; }
    toast('읽기를 요청했습니다.'); await loadAll();
  });
}
async function clearStale(btn){
  await hrBusy(btn,async()=>{
    const r0=await hrReadMany(['S37']); if(r0.failed.length){ toast(HR_MSG.read(HR_TABS.S37.tab),true); return; }
    D.S37=dedupe(r0.tabs.S37.rows,HEADERS.S37[0]); const list=D.S37.filter(stale); let fail=0;
    for(const r of list){ const u=await hrUpdate('S37',r.run_id,{state:'실패',finished_at:hrNow(),error:'중간에 끊겨 화면에서 정리함'},{readUpdatedAt:r.updated_at}); if(!u.ok) fail++; }
    toast(fail?`${fail}건은 정리하지 못했습니다. 다시 눌러 주세요.`:`끊긴 실행 ${list.length}건을 정리했습니다.`,!!fail); await loadAll();
  });
}
function runFolder(btn){ return request(btn,'수동 폴더',''); }
function runFile(btn){
  const link=hrQ('fLink').value.trim(); hrQ('fLinkErr').textContent='';
  if(!isDriveLink(link)){ hrQ('fLinkErr').textContent=MSG.link; return; }
  const party=hrQ('fParty').value; return request(btn,'수동 파일',party?`${link} ; party=${party}`:link);
}

// ── 처리 필요 ────────────────────────────────────────────────────────────────
function pendingByFile(){
  const m=new Map(); cmnReviewItems(D.S23).forEach(it=>{ const k=it.file_id||''; if(!m.has(k)) m.set(k,[]); m.get(k).push(it); }); return m;
}
function needRows(){ return D.S28.filter(f=>NEED.includes(String(f.parse_status||'').trim())).sort((a,b)=>String(b.received_at||'').localeCompare(String(a.received_at||''))||String(b.file_id).localeCompare(String(a.file_id))); }
function renderNeed(){
  const all=needRows(); const by=Object.fromEntries(NEED.map(k=>[k,all.filter(f=>f.parse_status===k).length]));
  hrQ('needCount').textContent=`${all.length}건`;
  hrQ('needChips').innerHTML=`<span class="hr-chip${filter===''?' on':''}" data-filter="">전체 ${all.length}</span>`+NEED.map(k=>`<span class="hr-chip${filter===k?' on':''}" data-filter="${k}">${NEED_LABEL[k]} ${by[k]}</span>`).join('');
  const list=filter?all.filter(f=>f.parse_status===filter):all;
  if(!list.length){ hrQ('needBox').innerHTML=`<div class="hr-empty" id="noNeed">${MSG.empty}</div>`; renderPanel(); return; }
  const pend=pendingByFile();
  hrQ('needBox').innerHTML=`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>구분</th><th>파일</th><th>후보</th><th>내용</th><th></th></tr></thead><tbody>${list.map(f=>{
    const st=f.parse_status; const cls=st==='읽기실패'?'red':st==='검토필요'?'amber':'blue';
    let info='', btn='';
    if(st==='읽기실패'){ info=hrEsc(f.parse_error||'읽지 못했습니다.'); btn=`<button class="btn btn-secondary btn-sm" data-act="reread" data-file="${hrEsc(f.file_id)}">다시 읽기</button> <button class="btn btn-secondary btn-sm" data-act="closeFile" data-file="${hrEsc(f.file_id)}" title="목록에서 뺍니다. 파일은 그대로 보관됩니다.">처리 종료</button>`; }
    else if(st==='검토필요'){ const n=(pend.get(f.file_id)||[]).length; info=`변경 검토 ${n}건`; btn=`<button class="btn btn-primary btn-sm" data-act="openReview" data-file="${hrEsc(f.file_id)}">변경 검토</button>`; }
    else { info=`이름이 같은 기존 후보: ${hrEsc(pname(f.match_person_id))} (${hrEsc(f.match_person_id||'-')})`; btn=`<button class="btn btn-primary btn-sm" data-act="openMerge" data-file="${hrEsc(f.file_id)}">같은 사람</button> <button class="btn btn-secondary btn-sm" data-act="notSame" data-file="${hrEsc(f.file_id)}">다른 사람</button>`; }
    return `<tr data-file="${hrEsc(f.file_id)}"><td><span class="hr-badge ${cls}">${NEED_LABEL[st]}</span></td><td>${hrEsc(f.file_name||f.file_id)}<div class="hr-sub">${hrEsc(f.received_at||'')}${f.source_party_id?' · '+hrEsc(hrPartyLabel(PM,f.source_party_id)):''}${f.order_id?' · 발송 '+hrEsc(f.order_id):''}</div></td><td>${f.person_id?`<a href="candidate-detail.html?id=${encodeURIComponent(f.person_id)}">${hrEsc(pname(f.person_id))}</a>`:'-'}</td><td>${info}</td><td style="white-space:nowrap">${btn}</td></tr>`; }).join('')}</tbody></table></div>`;
  renderPanel();
}
async function reread(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f) return;
  if(DR.ok){   // 드라이브 방식: Fail 폴더의 파일은 New 로 되돌린다. S37 요청 기록은 만들지 않는다.
    const ff=DR.failFiles.find(x=>drvRowMatches(f,x)); if(ff) return moveBack(btn,ff.id);
    if(DR.newFiles.some(x=>drvRowMatches(f,x))){ toast('이미 New 폴더에 있습니다. 위 ② 에서 읽기를 맡겨 주세요.'); return; }
    toast('Fail·New 폴더에서 이 파일을 찾지 못했습니다. 파일을 New 폴더에 다시 넣어 주세요.',true); return;
  }
  const ref=f.drive_url||f.drive_file_id;
  if(!ref){ toast('다시 읽을 파일의 보관 위치를 알 수 없습니다.',true); return; }
  await request(btn,'수동 파일',f.source_party_id?`${ref} ; party=${f.source_party_id}`:ref);
}

// 읽기 실패 → 처리 종료 (설계서 §10.5·§10.9 R1 / 변경 006). 파일은 그대로 두고 목록에서만 뺀다. 이력에서는 상태 '처리종료'로 남는다.
async function closeFile(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f||f.parse_status!=='읽기실패') return;
  if(!confirm('이 파일을 처리 종료합니다. 목록에서 빠지며 파일은 그대로 보관됩니다.')) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S28',f.file_id,{parse_status:'처리종료'},{readUpdatedAt:f.updated_at});
    if(r.ok){ toast('처리 종료했습니다.'); await loadAll(); } else { toast(hrSaveFailText(r),true); await loadAll(); } });
}
// 다른 사람 — 새 후보로 확정(후보는 에이전트가 이미 만들어 두었다)
async function notSame(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S28',f.file_id,{parse_status:'성공',match_person_id:''},{readUpdatedAt:f.updated_at});
    if(r.ok){ toast('다른 사람으로 처리했습니다.'); await loadAll(); } else { toast(hrSaveFailText(r),true); if(r.code==='CONFLICT') await loadAll(); } });
}

// ── 패널: 변경 검토 / 같은 사람(합침) ──────────────────────────────────────────
function renderPanel(){
  const box=hrQ('panelBox'); if(!panel){ box.innerHTML=''; return; }
  if(panel.type==='review') box.innerHTML=reviewPanel();
  else box.innerHTML=mergePanel();
}
function openReview(btn){ panel={type:'review',file:btn.dataset.file}; renderPanel(); hrQ('panelBox').scrollIntoView&&hrQ('panelBox').scrollIntoView({block:'nearest'}); }
function reviewPanel(){
  const f=D.S28.find(x=>x.file_id===panel.file); const items=(pendingByFile().get(panel.file)||[]);
  if(!f) return '';
  const head=`<div class="card-title" style="margin-top:14px"><span>변경 검토 · ${hrEsc(f.file_name||f.file_id)}</span><button class="btn btn-secondary btn-sm" data-act="closePanel">닫기</button></div>`;
  if(!items.length) return `<div id="reviewPanel">${head}<div class="hr-muted">검토할 변경이 없습니다.</div><button class="btn btn-primary btn-sm" data-act="finishFile" data-file="${hrEsc(f.file_id)}">검토 완료로 처리</button></div>`;
  return `<div id="reviewPanel">${head}<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>경력 줄</th><th>현재 값</th><th>이전 이력서 값</th><th>새 이력서 값</th><th></th></tr></thead><tbody>${items.map(it=>it.raw
    ?`<tr data-rv="${hrEsc(it.career_id)}"><td>${hrEsc(it.lineLabel)}</td><td colspan="3" class="hr-muted">${hrEsc(CMN_REVIEW_MSG.raw)}</td><td><button class="btn btn-secondary btn-sm" data-act="rvDismiss" data-car="${hrEsc(it.career_id)}">확인 완료</button></td></tr>`
    :`<tr data-rv="${hrEsc(it.career_id)}" data-field="${hrEsc(it.field)}"><td>${hrEsc(pname(it.person_id))} · ${hrEsc(it.lineLabel)}<div class="hr-sub">${hrEsc(it.fieldLabel)}</div></td><td>${hrEsc(it.current||'-')}${it.hasEdit?' <span class="hr-badge gray">수정본</span>':''}</td><td>${hrEsc(it.prev||'-')}</td><td>${hrEsc(it.next||'-')}</td>
      <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="current">현재 값 유지</button>${it.hasEdit?` <button class="btn btn-secondary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="prev">이전 이력서 값</button>`:''} <button class="btn btn-primary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="next">새 이력서 값</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
// 그 파일의 보류 항목이 모두 처리되면 파일 상태를 성공으로, 후보의 검토 표시를 정리한다
async function afterReview(personId,fileId){
  await cmnPersonReviewClear(personId);
  const r=await hrReadMany(['S28','S23']); if(r.failed.length) return;
  const left=cmnReviewItems(r.tabs.S23.rows).filter(i=>i.file_id===fileId).length; const f=r.tabs.S28.rows.find(x=>x.file_id===fileId);
  if(!left&&f&&f.parse_status==='검토필요') await hrUpdate('S28',fileId,{parse_status:'성공'},{readUpdatedAt:f.updated_at});
}
async function rvApply(btn){
  const row=D.S23.find(c=>c.career_id===btn.dataset.car); if(!row) return; const fid=cmnPendingOf(row).file_id||panel&&panel.file;
  await hrBusy(btn,async()=>{ const r=await cmnReviewApply(row,btn.dataset.f,btn.dataset.c);
    if(r.ok){ toast('처리했습니다.'); const x=await hrReadMany(['S23']); if(!x.failed.length) await afterReview(row.person_id,fid); } else toast(r.message||hrSaveFailText(r),true); await loadAll(); });
}
async function rvDismiss(btn){
  const row=D.S23.find(c=>c.career_id===btn.dataset.car); if(!row) return; const fid=cmnPendingOf(row).file_id||panel&&panel.file;
  await hrBusy(btn,async()=>{ const r=await cmnReviewDismiss(row); if(r.ok){ toast('처리했습니다.'); await afterReview(row.person_id,fid); } else toast(hrSaveFailText(r),true); await loadAll(); });
}
async function finishFile(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S28',f.file_id,{parse_status:'성공'},{readUpdatedAt:f.updated_at}); if(r.ok){ panel=null; toast('처리했습니다.'); } else toast(hrSaveFailText(r),true); await loadAll(); });
}
function closePanel(){ panel=null; renderPanel(); }

async function openMerge(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f) return;
  const a=f.person_id, b=f.match_person_id; if(!a||!b){ toast('합칠 후보를 알 수 없습니다.',true); return; }
  const keep=[a,b].sort()[0], drop=keep===a?b:a;           // 기본: 번호가 작은(먼저 만들어진) 후보를 남긴다
  panel={type:'merge',file:f.file_id,a,b,keep,drop,pv:null,busy:true}; renderPanel(); await loadPreview();
}
async function loadPreview(){
  panel.busy=true; panel.pv=await cmnMergePreview(panel.keep,panel.drop); panel.busy=false; renderPanel();
}
function mergePanel(){
  const p=panel, pv=p.pv; const opt=id=>`<option value="${hrEsc(id)}"${id===p.keep?' selected':''}>${hrEsc(pname(id))} (${hrEsc(id)})</option>`;
  let body='<div class="hr-muted">변경 건수를 계산하는 중…</div>';
  if(pv){
    if(!pv.ok) body=`<div class="hr-notice err" id="mergeMsg">${hrEsc(pv.message)}</div>`;
    else body=`<div id="mergeCounts">옮겨질 항목: <b>${hrEsc(cmnMergeSummary(pv.counts))}</b></div>${pv.blocked?`<div class="hr-notice err" id="mergeMsg">${hrEsc(pv.blocked.message)}</div>`:''}
      <div class="hr-sub" style="margin:6px 0">${hrEsc(pname(p.drop))}(${hrEsc(p.drop)})의 기록이 ${hrEsc(pname(p.keep))}(${hrEsc(p.keep)})로 옮겨지고, ${hrEsc(p.drop)} 후보는 목록에서 숨겨집니다.</div>
      <button class="btn btn-primary" id="btnMerge" data-act="doMerge"${pv.blocked||p.busy?' disabled':''}>합침 실행</button>`;
  }
  return `<div id="mergePanel"><div class="card-title" style="margin-top:14px"><span>같은 사람 — 합침</span><button class="btn btn-secondary btn-sm" data-act="closePanel">닫기</button></div>
    <div class="hr-row"><div class="hr-field"><label for="mKeep">남길 후보</label><select class="hr-select" id="mKeep">${[p.a,p.b].map(opt).join('')}</select></div></div>
    <div style="margin-top:10px">${body}</div><div class="hr-sub" style="margin-top:6px">${MSG.merge}</div></div>`;
}
async function doMerge(btn){
  if(!confirm(MSG.merge+'\n\n'+cmnMergeSummary(panel.pv.counts))) return;
  await hrBusy(btn,async()=>{
    const r=await cmnMergeRun(panel.keep,panel.drop);
    if(r.ok){ toast('합쳤습니다.'); panel=null; await loadAll(); }
    else { toast(r.message||'합치지 못했습니다.',true); await loadAll(); if(r.code==='WRITE_FAIL'){ panel=null; } }
  });
}


// ── 읽은 결과 가져오기(BAT-01 방식 ①) ─────────────────────────────────────────
const IMP_FORMAT=`{"schema":"hfc-resume-import/1",
 "resumes":[{
  "file":{"drive_file_id":"…","file_name":"…","drive_url":"https://drive.google.com/…","file_hash":"…","received_at":"2026-10-12","source_party_id":"PTY-004"},
  "status":"성공"  (또는 "읽기실패" + "error":"사유, 개인정보 값 금지"),
  "person":{"name":"…","birth_date":"1980-02-03","gender":"남","region":"…","grade_reported":"고급","career_years_reported":"12","summary":"여러 줄(줄바꿈 \\n)"},
  "private":{"mobile":"010…","email":"…","rid_head7":"8002031"},
  "roles":[{"role_code":"PM","level":"주력","basis":"수준을 정한 근거"}],
  "skills":[{"skill_type":"DBMS","skill_name":"Oracle","level":"상"}],
  "careers":[{"kind":"프로젝트","employer":"…","client_name":"…","project_name":"…","industry":"…","project_type":"…","role_codes":"PM","start_ym":"2025-01","end_ym":"2025-03","is_current":"N","tasks":"…","env":"…","tech":"…"}],
  "certs":[{"kind":"학력","name":"…","org":"…","cert_date":"2008-02"}]
 }]}`;
// ① Claude 에게 보낼 읽기 요청 문구 (읽기 지침 문서 이름은 지침을 새 판으로 올릴 때 함께 바꾼다)
const READING_GUIDE='claude/resume-reading-guide-v0.2';
const READING_GUIDE_DRV='claude/resume-reading-guide-v0.3';   // 드라이브 방식: New 폴더를 읽고 Result 폴더에 JSON 을 저장
function promptText(){
  if(DR.ok) return `이 프로젝트의 ${READING_GUIDE_DRV} 를 읽고, 구글 드라이브 HFC_human_resource 의 New 폴더에 있는 새 이력서를 읽어 가져오기용 JSON 을 Result 폴더에 저장해 줘.`;
  const id=hrQ('pParty').value; const name=id?hrPartyName(PM,id):''; const day=hrQ('pDate').value||hrToday();
  const from=id?`${name}(${id})`:'(아직 모름 — 먼저 나에게 물어봐 줘)';
  return `이 프로젝트의 ${READING_GUIDE} 를 읽고, 첨부한 이력서를 읽어 가져오기용 JSON 파일을 만들어 줘. 보낸 곳은 ${from}, 받은 날은 ${day}.`;
}
function refreshPrompt(){ hrQ('pText').value=promptText(); hrQ('pMsg').textContent=''; }
function copyPrompt(btn){
  const t=hrQ('pText').value; const done=()=>{ hrQ('pMsg').textContent='복사했습니다.'; }; const fail=()=>{ const e=hrQ('pText'); e.focus(); e.select(); hrQ('pMsg').textContent='자동 복사가 안 됩니다. 선택된 문구를 직접 복사해 주세요.'; };
  try{ navigator.clipboard.writeText(t).then(done,fail); }catch(_){ fail(); }
  if(DR.ok){ hrQ('pMsg').textContent='복사했습니다. 새 Claude 대화에 붙여 넣으세요.'; return; }   // 드라이브 방식은 요청 기록을 남기지 않는다(New·Result 폴더로 판정)
  recordAsk(btn);   // 읽기를 맡겼다는 기록(요청됨) — 이미 대기 중인 요청이 있으면 새로 만들지 않는다
}
async function recordAsk(btn){
  if(running()){ toast('같은 문구를 다시 복사했습니다. 이미 읽기를 맡긴 상태로 기록되어 있습니다.'); return; }
  await hrBusy(btn,async()=>{
    const r0=await hrReadMany(['S37']); if(r0.failed.length){ toast('복사는 했지만 읽기 요청 기록을 저장하지 못했습니다. 새로고침 후 다시 눌러 주세요.',true); return; }
    D.S37=dedupe(r0.tabs.S37.rows,HEADERS.S37[0]); if(running()){ render(); return; }
    const a=await hrAppend('S37',{trigger:'수동 폴더',target_ref:'',requested_at:hrNow(),state:'요청됨'});
    if(!a.ok){ toast('복사는 했지만 읽기 요청 기록을 저장하지 못했습니다. '+hrSaveFailText(a),true); return; }
    toast('복사했습니다. 읽기를 맡긴 것으로 기록했습니다. Claude 대화에 붙여 넣고 이력서를 첨부하세요.'); await loadAll();
  });
}
let impPayload=null;
function impReset(){ impPayload=null; hrQ('btnImport').disabled=true; hrQ('impResult').innerHTML=''; hrQ('impErr').textContent=''; }
function impTable(r){
  const cnt=`<div id="impCounts" style="margin-bottom:8px">신규 <b>${r.cnt.new}</b> · 갱신 <b>${r.cnt.updated}</b> · 검토 <b>${r.cnt.review}</b> · 실패 <b>${r.cnt.fail}</b></div>`;
  return cnt+`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>파일</th><th>후보</th><th>결과</th><th>메모</th></tr></thead><tbody>${r.results.map(x=>`<tr data-imp="1"><td>${hrEsc(x.file)}</td><td>${hrEsc(x.name||'-')}</td><td>${hrEsc(x.action)}</td><td>${hrEsc((x.notes||[]).join(' / ')||'-')}</td></tr>`).join('')}</tbody></table></div>`;
}
async function impPreview(btn){
  impReset(); let txt=hrQ('impText').value; impMatches=[];
  if(DR.ok){ const pr=drvPrepare(txt,DR.newFiles,{party:hrQ('iParty').value}); txt=pr.text; impMatches=pr.matches; }   // 드라이브의 파일 번호·링크·해시·보낸 곳·받은 날로 채운다
  const p=cmnImportParse(txt);
  if(!p.ok){ hrQ('impErr').textContent=p.message; return; }
  await hrBusy(btn,async()=>{ const r=await cmnImportRun(p.payload,{dry:true}); if(!r.ok){ hrQ('impErr').textContent=r.message||'미리보기를 만들지 못했습니다.'; return; }
    impPayload=p.payload; hrQ('impResult').innerHTML='<div class="hr-sub" style="margin-bottom:6px">미리보기 — 아직 시트에 쓰지 않았습니다.</div>'+impTable(r);
    hrQ('btnImport').disabled=!r.results.some(x=>!['건너뜀'].includes(x.action)); });
}
async function impRun(btn){
  if(!impPayload) return;
  if(!confirm('읽은 결과를 시트에 저장합니다. 계속할까요?')) return;
  await hrBusy(btn,async()=>{ const p=impPayload; setProg('읽은 결과를 시트에 저장하는 중… (이력서 수에 따라 1~2분 걸릴 수 있습니다)'); const r=await cmnImportRun(p,{dry:false}); setProg(''); impPayload=null; hrQ('btnImport').disabled=true;
    if(!r.ok&&!r.results){ hrQ('impErr').textContent=r.message||'가져오지 못했습니다.'; return; }
    let mv=null; if(DR.ok&&r.results){ setProg('시트에 저장했습니다. 파일을 정리하는 중…'); try{ mv=await drvAfter(r,impMatches,impSrc); }catch(e){ mv={done:0,fail:0,err:1}; } } setProg('');
    impMatches=[]; impSrc=[];
    toast(r.ok?'가져왔습니다.':'가져오기가 중간에 멈췄습니다.',!r.ok); const mvHtml=mv?`<div class="hr-notice${mv.err?' err':''}" id="mvNote" style="margin-bottom:8px">파일 정리: Done 으로 ${mv.done}건 · Fail 로 ${mv.fail}건 옮김${mv.err?` · 옮기지 못한 것 ${mv.err}건(저장된 내용에는 영향 없음 — 위쪽 안내의 「지금 옮기기」로 다시 시도)`:''}</div>`:'';
    const html=mvHtml+(r.stopped?`<div class="hr-notice err">${hrEsc(r.stopped)} 이미 저장된 것은 그대로이며, 같은 결과를 다시 가져오면 이어서 처리합니다.</div>`:'')+impTable(r);
    await loadAll(); hrQ('secImport').open=true; hrQ('impResult').innerHTML=html; });
}
document.addEventListener('click',ev=>{
  const c=ev.target.closest('[data-filter]'); if(c&&c.closest('#needChips')){ filter=c.dataset.filter; panel=null; renderNeed(); return; }
  const a=ev.target.closest('[data-act]'); if(!a) return; const fn={cancelReq,clearStale,runFolder,runFile,reread,closeFile,notSame,openReview,openMerge,doMerge,closePanel,rvApply,rvDismiss,finishFile,impPreview,impRun,copyPrompt,grantDrive,reloadDrive,moveStuck,rereadFail,doUpload,drvLoadResult}[a.dataset.act]; if(fn) fn(a);
});
document.addEventListener('change',ev=>{ if(ev.target.id==='impFile'){ const f=ev.target.files&&ev.target.files[0]; if(f){ const rd=new FileReader(); rd.onload=()=>{ hrQ('impText').value=String(rd.result||''); impReset(); impSrc=[]; }; rd.readAsText(f); } return; }
   if(ev.target.id==='mKeep'&&panel&&panel.type==='merge'){ panel.keep=ev.target.value; panel.drop=ev.target.value===panel.a?panel.b:panel.a; panel.pv=null; renderPanel(); loadPreview(); } });
document.addEventListener('input',ev=>{ if(ev.target.id==='impText'){ impReset(); impSrc=[]; } else if(ev.target.id==='pDate') refreshPrompt(); });
document.addEventListener('change',ev=>{ if(ev.target.id==='pParty'||ev.target.id==='pDate') refreshPrompt(); });
window.addEventListener('load',()=>{ hrQ('impFormat').textContent=IMP_FORMAT; loadAll(); });
