// HFC scr-intake.js v2.9.81 — STF-SCR-06 이력서 등록
// 근거: 프로그램 설계서 §10(SCR-06). 이력서 읽기 에이전트(BAT-01)를 수동으로 요청하고, 사람이 확인해야 하는 건을 한 목록에서 처리한다. 후보를 한 명씩 직접 만드는 입력은 없다.
// 2026-10-14: BAT-01 방식 ① 확정(사용자 "1 로 가자") — Claude 가 읽어 만든 JSON 을 이 화면에서 가져온다(규칙은 cmn-resume.js). "읽기 요청" 버튼은 Claude 에게 읽을 일을 알리는 기록으로 남는다.
// 정한 것(2026-10-13, BAT-01 계약 — 에이전트 본체는 기준선 결정 대기):
//   · 수동 실행 요청 = S37 에 state='요청됨' 행 추가. 폴더: trigger='수동 폴더', target_ref 비움 / 파일: trigger='수동 파일', target_ref='<Drive 링크> ; party=<거래처ID>'(경로를 함께 전달)
//   · 다시 읽기 = 그 파일만 S37 '수동 파일' 요청(target_ref = S28.drive_url, 없으면 drive_file_id)
//   · 같은 사람 확인 파일: 에이전트가 새 후보(S20)와 경력을 만들고 S28.person_id=새 후보, match_person_id=기존 후보로 둔다 → "같은 사람" = CMN-09(새 후보를 기존 후보로 합침), "다른 사람" = S28.parse_status 를 성공으로, match_person_id 비움
//   · 검토 필요 파일: S23.pending_json 의 file_id 가 그 파일. 그 파일의 보류 항목을 모두 처리하면 S28.parse_status 를 성공으로
//   · "처리 종료"(읽기 실패를 목록에서 빼기)는 파일 상태 값이 설계에 없어 만들지 않았다 — 사용자 결정 대기
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-person.js, cmn-review.js, cmn-merge.js, hr-ui.js
const KEYS=['S37','S28','S23','S20','S27'];
const NEED=['읽기실패','검토필요','동일인확인'];
const NEED_LABEL={읽기실패:'읽기 실패',검토필요:'검토 필요',동일인확인:'같은 사람 확인'};
const MSG={link:'Drive 파일 링크가 아닙니다. 링크를 다시 확인해 주세요.',running:'실행 중입니다. 완료 후 다시 눌러 주세요.',empty:'처리할 건이 없습니다.',merge:'이 작업은 되돌릴 수 없습니다. 변경 건수를 확인하고 진행하세요.'};
const DRIVE=[/^https:\/\/drive\.google\.com\/file\/d\/[\w-]{10,}/,/^https:\/\/drive\.google\.com\/(open|uc)\?(.*&)?id=[\w-]{10,}/,/^https:\/\/docs\.google\.com\/(document|spreadsheet|presentation)\/d\/[\w-]{10,}/];
let D={}, filter='', panel=null, PM=new Map(), PERS=new Map();

const isDriveLink=s=>DRIVE.some(r=>r.test(String(s||'').trim()));
const running=()=>D.S37.some(r=>['요청됨','실행 중'].includes(String(r.state||'').trim()));
const pname=id=>{ const p=PERS.get(id); return p?(p.name||id):(id||'-'); };

async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const r=await hrLoadScreen(KEYS);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  box.innerHTML=''; hrQ('screen').style.display=''; D=r.data; PM=hrMap(D.S27,'party_id'); PERS=hrMap(D.S20,'person_id');
  fillParties(); render();
}
function fillParties(){
  const cur=hrQ('fParty').value; const ps=D.S27.filter(p=>hrYes(p.is_active)&&hrSplit(p.roles).some(x=>['서치업체','경로'].includes(x)));
  const pc=hrQ('pParty').value; hrQ('pParty').innerHTML='<option value="">선택 안 함</option>'+ps.map(p=>`<option value="${hrEsc(p.party_id)}">${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join(''); hrQ('pParty').value=pc; if(!hrQ('pDate').value) hrQ('pDate').value=hrToday(); refreshPrompt();
  hrQ('fParty').innerHTML='<option value="">선택 안 함</option>'+ps.map(p=>`<option value="${hrEsc(p.party_id)}">${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join(''); hrQ('fParty').value=cur;
}
function render(){ renderStatus(); renderNeed(); renderRuns(); }

// ── 에이전트 상태 · 최근 결과 ──────────────────────────────────────────────────
const runsSorted=()=>D.S37.slice().sort((a,b)=>String(b.requested_at||'').localeCompare(String(a.requested_at||''))||String(b.run_id).localeCompare(String(a.run_id)));
const cnt=r=>`신규 ${parseInt(r.cnt_new)||0} · 갱신 ${parseInt(r.cnt_updated)||0} · 검토 ${parseInt(r.cnt_review)||0} · 실패 ${parseInt(r.cnt_fail)||0}`;
const stCls={요청됨:'amber','실행 중':'blue',완료:'green',실패:'red'};
function renderStatus(){
  const last=runsSorted()[0];
  hrQ('agentStatus').innerHTML=last
    ?`<div id="lastRun">마지막 요청 ${hrEsc(last.requested_at)} · ${hrEsc(last.trigger)} · <span class="hr-badge ${stCls[last.state]||'gray'}">${hrEsc(last.state)}</span>${last.state==='완료'?` · ${hrEsc(cnt(last))}`:''}${last.state==='실패'&&last.error?` · ${hrEsc(last.error)}`:''}</div>`
    :'<div class="hr-muted" id="lastRun">아직 실행 기록이 없습니다.</div>';
  const run=running(); hrQ('btnFolder').disabled=false; hrQ('btnFile').disabled=false;
  if(run) hrQ('agentStatus').insertAdjacentHTML('beforeend','<div class="hr-sub" id="runningNote">실행 요청이 처리되는 중입니다. 완료되면 아래 결과에 나타납니다.</div>');
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
    return `<tr data-file="${hrEsc(f.file_id)}"><td><span class="hr-badge ${cls}">${NEED_LABEL[st]}</span></td><td>${hrEsc(f.file_name||f.file_id)}<div class="hr-sub">${hrEsc(f.received_at||'')}${f.source_party_id?' · '+hrEsc(hrPartyLabel(PM,f.source_party_id)):''}</div></td><td>${f.person_id?`<a href="candidate-detail.html?id=${encodeURIComponent(f.person_id)}">${hrEsc(pname(f.person_id))}</a>`:'-'}</td><td>${info}</td><td style="white-space:nowrap">${btn}</td></tr>`; }).join('')}</tbody></table></div>`;
  renderPanel();
}
async function reread(btn){
  const f=D.S28.find(x=>x.file_id===btn.dataset.file); if(!f) return; const ref=f.drive_url||f.drive_file_id;
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
function promptText(){
  const id=hrQ('pParty').value; const name=id?hrPartyName(PM,id):''; const day=hrQ('pDate').value||hrToday();
  const from=id?`${name}(${id})`:'(아직 모름 — 먼저 나에게 물어봐 줘)';
  return `이 프로젝트의 ${READING_GUIDE} 를 읽고, 첨부한 이력서를 읽어 가져오기용 JSON 파일을 만들어 줘. 보낸 곳은 ${from}, 받은 날은 ${day}.`;
}
function refreshPrompt(){ hrQ('pText').value=promptText(); hrQ('pMsg').textContent=''; }
function copyPrompt(btn){
  const t=hrQ('pText').value; const done=()=>{ hrQ('pMsg').textContent='복사했습니다.'; }; const fail=()=>{ const e=hrQ('pText'); e.focus(); e.select(); hrQ('pMsg').textContent='자동 복사가 안 됩니다. 선택된 문구를 직접 복사해 주세요.'; };
  try{ navigator.clipboard.writeText(t).then(done,fail); }catch(_){ fail(); }
}
let impPayload=null;
function impReset(){ impPayload=null; hrQ('btnImport').disabled=true; hrQ('impResult').innerHTML=''; hrQ('impErr').textContent=''; }
function impTable(r){
  const cnt=`<div id="impCounts" style="margin-bottom:8px">신규 <b>${r.cnt.new}</b> · 갱신 <b>${r.cnt.updated}</b> · 검토 <b>${r.cnt.review}</b> · 실패 <b>${r.cnt.fail}</b></div>`;
  return cnt+`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>파일</th><th>후보</th><th>결과</th><th>메모</th></tr></thead><tbody>${r.results.map(x=>`<tr data-imp="1"><td>${hrEsc(x.file)}</td><td>${hrEsc(x.name||'-')}</td><td>${hrEsc(x.action)}</td><td>${hrEsc((x.notes||[]).join(' / ')||'-')}</td></tr>`).join('')}</tbody></table></div>`;
}
async function impPreview(btn){
  impReset(); const p=cmnImportParse(hrQ('impText').value);
  if(!p.ok){ hrQ('impErr').textContent=p.message; return; }
  await hrBusy(btn,async()=>{ const r=await cmnImportRun(p.payload,{dry:true}); if(!r.ok){ hrQ('impErr').textContent=r.message||'미리보기를 만들지 못했습니다.'; return; }
    impPayload=p.payload; hrQ('impResult').innerHTML='<div class="hr-sub" style="margin-bottom:6px">미리보기 — 아직 시트에 쓰지 않았습니다.</div>'+impTable(r);
    hrQ('btnImport').disabled=!r.results.some(x=>!['건너뜀'].includes(x.action)); });
}
async function impRun(btn){
  if(!impPayload) return;
  if(!confirm('읽은 결과를 시트에 저장합니다. 계속할까요?')) return;
  await hrBusy(btn,async()=>{ const p=impPayload; const r=await cmnImportRun(p,{dry:false}); impPayload=null; hrQ('btnImport').disabled=true;
    if(!r.ok&&!r.results){ hrQ('impErr').textContent=r.message||'가져오지 못했습니다.'; return; }
    toast(r.ok?'가져왔습니다.':'가져오기가 중간에 멈췄습니다.',!r.ok); const html=(r.stopped?`<div class="hr-notice err">${hrEsc(r.stopped)} 이미 저장된 것은 그대로이며, 같은 결과를 다시 가져오면 이어서 처리합니다.</div>`:'')+impTable(r);
    await loadAll(); hrQ('impResult').innerHTML=html; });
}
document.addEventListener('click',ev=>{
  const c=ev.target.closest('[data-filter]'); if(c&&c.closest('#needChips')){ filter=c.dataset.filter; panel=null; renderNeed(); return; }
  const a=ev.target.closest('[data-act]'); if(!a) return; const fn={runFolder,runFile,reread,closeFile,notSame,openReview,openMerge,doMerge,closePanel,rvApply,rvDismiss,finishFile,impPreview,impRun,copyPrompt}[a.dataset.act]; if(fn) fn(a);
});
document.addEventListener('change',ev=>{ if(ev.target.id==='impFile'){ const f=ev.target.files&&ev.target.files[0]; if(f){ const rd=new FileReader(); rd.onload=()=>{ hrQ('impText').value=String(rd.result||''); impReset(); }; rd.readAsText(f); } return; }
   if(ev.target.id==='mKeep'&&panel&&panel.type==='merge'){ panel.keep=ev.target.value; panel.drop=ev.target.value===panel.a?panel.b:panel.a; panel.pv=null; renderPanel(); loadPreview(); } });
document.addEventListener('input',ev=>{ if(ev.target.id==='impText') impReset(); else if(ev.target.id==='pDate') refreshPrompt(); });
document.addEventListener('change',ev=>{ if(ev.target.id==='pParty'||ev.target.id==='pDate') refreshPrompt(); });
window.addEventListener('load',()=>{ hrQ('impFormat').textContent=IMP_FORMAT; loadAll(); });
