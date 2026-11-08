// HFC scr-contact.js v2.9.88 — STF-SCR-09 후보 상세 · 접촉·현행 프로젝트 (candidate-detail.html 의 "접촉·현행 프로젝트" 탭)
// 근거: 프로그램 설계서 §13(SCR-09). 사용 탭: S26(접촉 이력 추가·수정·삭제), S25(투입·현행 프로젝트 추가·수정, 삭제 없음), S27·S03(읽기만), S23(이력서 "진행 중" 참고 표시)
// 정한 것(2026-10-15):
//   · 현행 프로젝트의 시작·종료는 월(YYYY-MM)로 받는다. 일까지 쓰면 월로 자른다(설계서 "월로 자름"). 종료 월은 필수.
//   · 고객사 선택지 = 거래처 중 역할에 '고객'·'최종 고객사'가 있는 곳, 경유 업체 선택지 = '서치업체'·'중개업자'·'인력업체'·'경로'. 선택하면 이름을 자동으로 채운다.
//   · "같은 프로젝트" = 고객사 이름·프로젝트명이 공백·(주) 제거 후 같음.
//   · S03 프로젝트 목록은 HFC 투입을 고를 때만 읽고, 읽지 못해도 이 탭은 그대로 쓴다(프로젝트 연결만 못 함).
//   · 접촉 저장은 ID를 미리 받아 S25→S26 순서로 쓴다. 한쪽이 실패하면 그 사실을 알리고 새로 읽는다.
//   · 설계서 §13.6 표의 S26 수정·삭제 "—" 는 §13.9 R1(수정·삭제 가능, 확정)과 어긋나므로 R1 을 따른다(다음 개정 때 표 정정).
// 의존: scr-cand-detail.js(D·P·V·PID·PM·ASOF·mine·fld·sel·say·save·reload·render·ACT), cmn-sheet.js, hr-ui.js
let touch={editCur:false,editContact:'',notice:'',s03:null,s03Fail:false};
const T_TYPES=['통화','문자','메일','미팅','기타'], T_DIR=['발신','수신'], T_CONF=['확정','예정','불확실'], T_SRC=['본인','서치업체','지인·기타'], T_KIND=['HFC 투입','외부 투입'];
const CLIENT_ROLES=['고객','최종 고객사'], VIA_ROLES=['서치업체','중개업자','인력업체','경로'];
const tNorm=s=>String(s||'').replace(/\s|\(주\)|㈜/g,'').toLowerCase();
const tYm=s=>{ const t=String(s||'').trim(); const m=/^(\d{4})-(0[1-9]|1[0-2])(-\d{2})?$/.exec(t); return m?`${m[1]}-${m[2]}`:null; };
const progressRow=()=>mine('S25').filter(a=>String(a.status??'').trim()==='진행').sort((p,q)=>String(q.created_at||'').localeCompare(String(p.created_at||'')))[0]||null;
const partyOpts=(roles,cur)=>{ const rows=D.S27.filter(p=>String(p.is_active??'Y').trim()!=='N'&&cmnSplit(p.roles).some(r=>roles.includes(r))||p.party_id===cur);
  return `<option value="">선택 안 함</option>`+rows.map(p=>`<option value="${hrEsc(p.party_id)}"${p.party_id===cur?' selected':''}>${hrEsc(p.name)} (${hrEsc(p.party_id)})</option>`).join(''); };
const projOpts=cur=>{ const rows=touch.s03||[]; return `<option value="">연결 안 함</option>`+rows.map(r=>`<option value="${hrEsc(r.project_id)}"${r.project_id===cur?' selected':''}>${hrEsc(r.project_name)} (${hrEsc(r.project_id)})</option>`).join(''); };

// ── 현행 프로젝트 입력 칸 (접촉 입력 안의 것 'n', ① 수정 'e') ─────────────────────────────
function curFields(p,r){
  r=r||{}; const hfc=(r.assign_kind||'외부 투입')==='HFC 투입';
  return `<div class="hr-row" style="margin-top:8px">
    ${fld(p+'Kind','구분',null,{fixed:1,w:130,html:`<select class="hr-select" id="${p}Kind" data-curkind="${p}">${sel(T_KIND,r.assign_kind||'외부 투입')}</select>`})}
    ${fld(p+'Client','고객사',r.client_name||'',{w:180})}
    ${fld(p+'ClientParty','고객사 거래처(선택)',null,{w:180,html:`<select class="hr-select" id="${p}ClientParty" data-curparty="${p}">${partyOpts(CLIENT_ROLES,r.client_party_id)}</select>`})}
    ${fld(p+'Project','프로젝트명',r.project_name||'',{w:200})}
  </div>
  <div class="hr-row" id="${p}ProjRow" style="${hfc?'':'display:none'}">
    ${fld(p+'ProjId','HFC 프로젝트 연결',null,{w:260,html:`<select class="hr-select" id="${p}ProjId" data-curproj="${p}">${projOpts(r.project_id)}</select>`})}
    <div class="hr-sub" id="${p}ProjNote" style="align-self:flex-end;padding-bottom:6px"></div>
  </div>
  <div class="hr-row">
    ${fld(p+'Role','역할',null,{fixed:1,w:130,html:`<select class="hr-select" id="${p}Role">${sel(CODES.role,r.role_code||'','선택 안 함')}</select>`})}
    ${fld(p+'Start','시작 월',r.start_ym||'',{fixed:1,w:110,ph:'YYYY-MM'})}
    ${fld(p+'End','종료(예정) 월',r.end_ym||'',{fixed:1,w:120,ph:'YYYY-MM'})}
    ${fld(p+'Conf','확신도',null,{fixed:1,w:110,html:`<select class="hr-select" id="${p}Conf">${sel(T_CONF,r.confidence||'확정')}</select>`})}
    ${fld(p+'Load','투입률(%)',r.load_pct||'100',{fixed:1,w:90,inputmode:'numeric'})}
  </div>
  <div class="hr-row">
    ${fld(p+'Via','경유 업체(선택)',null,{w:200,html:`<select class="hr-select" id="${p}Via">${partyOpts(VIA_ROLES,r.via_party_id)}</select>`})}
    ${fld(p+'Src','정보 출처',null,{fixed:1,w:140,html:`<select class="hr-select" id="${p}Src">${sel(T_SRC,r.info_source||'본인')}</select>`})}
  </div>`;
}
// 입력 검사 + 값 만들기. 문제가 있으면 null (칸 아래에 안내)
function readCur(p){
  const v=id=>hrQ(p+id).value.trim(); let bad=false; const say=(id,m)=>{ hrQ(p+id+'Err').textContent=m; bad=true; };
  ['Kind','Client','Project','Start','End','Conf','Load','Src'].forEach(i=>{ const e=hrQ(p+i+'Err'); if(e) e.textContent=''; });
  let client=v('Client'); const party=v('ClientParty'); if(!client&&party&&PM.get(party)) client=PM.get(party).name;
  if(!client) say('Client','고객사를 입력해 주세요.');
  if(!v('Project')) say('Project','프로젝트명을 입력해 주세요.');
  const s=v('Start')?tYm(v('Start')):'', e=tYm(v('End'));
  if(v('Start')&&!s) say('Start','시작 월은 YYYY-MM 형식으로 입력해 주세요.');
  if(!v('End')) say('End','종료 월을 입력해 주세요.'); else if(!e) say('End','종료 월은 YYYY-MM 형식으로 입력해 주세요.');
  else if(s&&e<s) say('End','종료 월은 시작 월 이후여야 합니다.');
  const load=v('Load')===''?100:parseInt(v('Load'),10); if(isNaN(load)||load<0||load>300||!/^\d+$/.test(v('Load')||'100')) say('Load','투입률은 0~300 사이 숫자로 입력해 주세요.');
  if(bad) return null;
  const kind=v('Kind');
  return {assign_kind:kind,project_id:kind==='HFC 투입'?v('ProjId'):'',client_name:client,client_party_id:party,project_name:v('Project'),role_code:v('Role'),start_ym:s||'',end_ym:e,confidence:v('Conf'),load_pct:load,via_party_id:v('Via'),info_source:v('Src')};
}

// ── 화면 ────────────────────────────────────────────────────────────────────
function touchHtml(){
  const cur=progressRow(), recon=V.recon;
  let a;
  if(cur){
    const kv=(l,x)=>`<div><span class="hr-sub">${l}</span> ${x}</div>`;
    const party=cur.client_party_id?` <span class="hr-sub">${hrEsc(hrPartyLabel(PM,cur.client_party_id))}</span>`:'';
    a=`<div class="hr-row" style="gap:18px;flex-wrap:wrap" id="curView">
      ${kv('구분',hrEsc(cur.assign_kind||'-'))}${kv('고객사',hrEsc(cur.client_name||'-')+party)}${kv('프로젝트',hrEsc(cur.project_name||'-'))}${kv('역할',hrEsc(cur.role_code||'-'))}
      ${kv('기간',`${hrEsc(cur.start_ym||'?')} ~ ${hrEsc(cur.end_ym||'미정')}`)}${kv('확신도',hrEsc(cur.confidence||'-'))}${kv('투입률',hrEsc(cur.load_pct||'100')+'%')}
      ${kv('경유',hrEsc(cur.via_party_id?hrPartyLabel(PM,cur.via_party_id):'-'))}${kv('정보 출처',hrEsc(cur.info_source||'-'))}${kv('마지막 확인일',hrEsc(recon?recon.last:'-'))}
      ${V.exitDue?'<span class="hr-badge amber">철수 예정</span>':''}${recon&&recon.needed?'<span class="hr-badge amber">재확인 필요</span>':''}</div>
      ${touch.editCur?`<div class="card" style="margin-top:10px" id="curEdit"><div class="card-title">현행 프로젝트 수정 <span class="hr-sub">수정해도 마지막 확인일은 바뀌지 않습니다. 확인한 날은 접촉으로 남겨 주세요.</span></div>${curFields('e',cur)}
        <div class="hr-row" style="margin-top:8px"><button class="btn btn-primary" data-act="saveCur" data-assign="${hrEsc(cur.assign_id)}">저장</button><button class="btn btn-secondary" data-act="cancelCur">취소</button></div></div>`
      :`<div class="hr-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-act="editCur">수정</button><button class="btn btn-secondary btn-sm" data-act="endCur" data-st="종료" data-assign="${hrEsc(cur.assign_id)}">종료 처리</button><button class="btn btn-secondary btn-sm" data-act="endCur" data-st="취소" data-assign="${hrEsc(cur.assign_id)}">취소 처리</button></div>`}`;
  } else {
    const rc=V.current&&V.current.kind==='resume'?V.current:null;
    a=`<div class="hr-muted" id="noCur">확인된 현행 프로젝트가 없습니다. 아래 접촉 입력에서 현행 프로젝트를 함께 기록하세요.</div>
      ${rc?`<div style="margin-top:8px"><span class="hr-badge gray" data-resume="1">이력서 기재(미확인)</span> ${hrEsc([rc.client,rc.project].filter(Boolean).join(' · ')||'-')} <span class="hr-sub">철수 일정에는 들어가지 않습니다.</span></div>`:''}`;
  }
  const f=(id,label,val,o)=>fld(id,label,val,o);
  const form=`<div class="hr-row">
      ${f('nDate','접촉일',hrToday(),{type:'date',fixed:1,w:150})}
      ${f('nType','유형',null,{fixed:1,w:110,html:`<select class="hr-select" id="nType">${sel(T_TYPES,'통화')}</select>`})}
      ${f('nDir','방향',null,{fixed:1,w:100,html:`<select class="hr-select" id="nDir">${sel(T_DIR,'발신')}</select>`})}</div>
    ${f('nSummary','내용',  '',{area:1,rows:3})}${f('nFeedback','후보 반응·피드백','',{area:1,rows:2})}
    <div class="hr-row">${f('nNextAct','다음 할 일','',{w:260})}${f('nNextDate','다음 할 일 날짜','',{type:'date',fixed:1,w:150})}</div>
    <div class="hr-sub" style="margin:2px 0 6px">다음 할 일은 기록만 하며 알림에는 올라가지 않습니다.</div>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="nCurOn" data-act="toggleCur"> 현행 프로젝트 정보도 함께 입력·갱신 <span class="hr-sub">(체크하면 마지막 확인일이 이 접촉일이 됩니다)</span></label>
    <div id="nCurBox" style="display:none">${curFields('n',cur)}</div>
    <div style="margin-top:8px"><button class="btn btn-primary" data-act="saveTouch">접촉 저장</button></div>`;
  const cons=mine('S26').slice().sort((p,q)=>String(q.contact_date||'').localeCompare(String(p.contact_date||''))||String(q.contact_id).localeCompare(String(p.contact_id)));
  const cRows=cons.map(c=>{
    if(touch.editContact===c.contact_id) return `<tr data-contact="${hrEsc(c.contact_id)}"><td colspan="5"><div id="ctEdit">
      <div class="hr-row">${f('xDate','접촉일',c.contact_date||'',{type:'date',fixed:1,w:150})}
      ${f('xType','유형',null,{fixed:1,w:110,html:`<select class="hr-select" id="xType">${sel(T_TYPES,c.type)}</select>`})}
      ${f('xDir','방향',null,{fixed:1,w:100,html:`<select class="hr-select" id="xDir">${sel(T_DIR,c.direction)}</select>`})}</div>
      ${f('xSummary','내용',c.summary||'',{area:1,rows:3})}${f('xFeedback','후보 반응·피드백',c.feedback||'',{area:1,rows:2})}
      <div class="hr-row">${f('xNextAct','다음 할 일',c.next_action||'',{w:260})}${f('xNextDate','다음 할 일 날짜',c.next_date||'',{type:'date',fixed:1,w:150})}</div>
      <div class="hr-row" style="margin-top:6px"><button class="btn btn-primary btn-sm" data-act="saveCt" data-contact="${hrEsc(c.contact_id)}">저장</button><button class="btn btn-secondary btn-sm" data-act="cancelCt">취소</button></div></div></td></tr>`;
    return `<tr data-contact="${hrEsc(c.contact_id)}"><td style="white-space:nowrap">${hrEsc(c.contact_date||'-')}</td><td>${hrEsc(c.type||'-')} · ${hrEsc(c.direction||'-')}</td>
      <td style="white-space:pre-wrap">${hrEsc(c.summary||'')}${c.feedback?`<div class="hr-sub" style="white-space:pre-wrap">반응: ${hrEsc(c.feedback)}</div>`:''}${c.next_action||c.next_date?`<div class="hr-sub">다음: ${hrEsc(c.next_action||'')}${c.next_date?` (${hrEsc(c.next_date)})`:''}</div>`:''}</td>
      <td>${String(c.assign_id||'').trim()?'<span class="hr-badge blue" data-withcur="1">현행 정보 입력</span>':''}</td>
      <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-act="editCt" data-contact="${hrEsc(c.contact_id)}">수정</button> <button class="btn btn-secondary btn-sm" data-act="delCt" data-contact="${hrEsc(c.contact_id)}">삭제</button></td></tr>`; }).join('');
  const hist=cons.length?`<div class="hr-scroll"><table class="hr-table auto" style="min-width:640px"><thead><tr><th>접촉일</th><th>유형·방향</th><th>내용</th><th>표시</th><th></th></tr></thead><tbody>${cRows}</tbody></table></div>`:'<div class="hr-muted" id="noContact">접촉 기록이 없습니다.</div>';
  const past=mine('S25').filter(x=>String(x.status??'').trim()!=='진행').sort((p,q)=>String(q.end_ym||'').localeCompare(String(p.end_ym||'')));
  const pastT=past.length?`<div class="hr-scroll"><table class="hr-table auto" style="min-width:640px"><thead><tr><th>구분</th><th>고객사</th><th>프로젝트</th><th>기간</th><th>확신도</th><th>상태</th></tr></thead><tbody>${past.map(x=>`<tr data-assign="${hrEsc(x.assign_id)}"><td>${hrEsc(x.assign_kind||'-')}</td><td>${hrEsc(x.client_name||'-')}</td><td>${hrEsc(x.project_name||'-')}</td><td>${hrEsc(x.start_ym||'?')} ~ ${hrEsc(x.end_ym||'?')}</td><td>${hrEsc(x.confidence||'-')}</td><td>${hrEsc(x.status||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="hr-muted" id="noPast">과거 투입 이력이 없습니다.</div>';
  return `<div class="card"><div class="card-title">현행 프로젝트</div>${a}</div>
    <div class="card"><div class="card-title">접촉 입력</div>${form}</div>
    <div class="card"><div class="card-title">접촉 이력 <span class="hr-sub">최신순</span></div>${touch.notice?`<div class="hr-notice" id="ctNotice">${hrEsc(touch.notice)}</div>`:''}${hist}</div>
    <div class="card"><div class="card-title">과거 투입 이력</div>${pastT}</div>`;
}

// S03 프로젝트 목록은 HFC 투입을 고를 때 처음 한 번만 읽는다
async function loadS03(){
  if(touch.s03||touch.s03Fail) return;
  const r=await hrReadMany(['S03']); if(r.failed.length){ touch.s03Fail=true; return; }
  touch.s03=r.tabs.S03.rows.filter(x=>x.project_id);
}
async function onKind(selEl){
  const p=selEl.dataset.curkind, hfc=selEl.value==='HFC 투입';
  hrQ(p+'ProjRow').style.display=hfc?'':'none';
  if(hfc){ await loadS03(); const s=hrQ(p+'ProjId'), keep=s.value; s.innerHTML=projOpts(keep); hrQ(p+'ProjNote').textContent=touch.s03Fail?'프로젝트 목록을 읽지 못했습니다. 연결 없이 저장할 수 있습니다.':''; }
}
function onProj(selEl){
  const p=selEl.dataset.curproj, pr=(touch.s03||[]).find(x=>x.project_id===selEl.value); if(!pr) return;
  if(!hrQ(p+'Project').value.trim()) hrQ(p+'Project').value=pr.project_name||'';
  if(!hrQ(p+'Client').value.trim()) hrQ(p+'Client').value=pr.end_client||pr.client||'';
}
function onParty(selEl){
  const p=selEl.dataset.curparty, pt=PM.get(selEl.value); if(pt&&!hrQ(p+'Client').value.trim()) hrQ(p+'Client').value=pt.name;
}

// ── 접촉 입력 값 읽기 ────────────────────────────────────────────────────────
function readContact(p){
  const v=id=>hrQ(p+id).value.trim(); let bad=false; const miss=(id,l)=>{ hrQ(p+id+'Err').textContent=`${l}을(를) 입력해 주세요.`; bad=true; };
  ['Date','Summary'].forEach(i=>hrQ(p+i+'Err').textContent='');
  if(!v('Date')) miss('Date','접촉일'); if(!v('Summary')) miss('Summary','내용');
  if(bad) return null;
  return {contact_date:v('Date'),type:v('Type'),direction:v('Dir'),summary:v('Summary'),feedback:v('Feedback'),next_action:v('NextAct'),next_date:v('NextDate')};
}
const failMsg=r=>toast((r&&r.message)||hrSaveFailText(r),true);

async function saveTouch(btn){
  const c=readContact('n'); const useCur=hrQ('nCurOn').checked; const cv=useCur?readCur('n'):{};
  if(!c||(useCur&&!cv)) return;
  const old=progressRow(); const same=useCur&&old&&tNorm(old.client_name)===tNorm(cv.client_name)&&tNorm(old.project_name)===tNorm(cv.project_name);
  if(useCur&&old&&!same&&!confirm(`진행 중인 프로젝트(${[old.client_name,old.project_name].filter(Boolean).join(' · ')})를 종료로 바꾸고 새로 등록합니다.`)) return;
  await hrBusy(btn,async()=>{
    if(!useCur){ const r=await hrAppend('S26',{person_id:PID,...c}); if(!r.ok){ failMsg(r); return; } touch.notice=''; toast('접촉을 저장했습니다.'); await reload(); return; }
    const ci=await hrNextIds('S26',1); if(!ci.ok){ failMsg(ci); return; }
    const ctId=ci.ids[0]; let asgId;
    if(same){
      asgId=old.assign_id; const r=await hrUpdate('S25',asgId,{...cv,source_contact_id:ctId},{readUpdatedAt:old.updated_at});
      if(!r.ok){ failMsg(r); if(r.code==='CONFLICT') await reload(); return; }
    } else {
      if(old){ const r=await hrUpdate('S25',old.assign_id,{status:'종료'},{readUpdatedAt:old.updated_at}); if(!r.ok){ failMsg(r); if(r.code==='CONFLICT') await reload(); return; } }
      const ai=await hrNextIds('S25',1); if(!ai.ok){ failMsg(ai); await reload(); return; }
      asgId=ai.ids[0]; const r=await hrAppend('S25',{assign_id:asgId,person_id:PID,...cv,status:'진행',source_contact_id:ctId});
      if(!r.ok){ failMsg(r); await reload(); return; }
    }
    const r2=await hrAppend('S26',{contact_id:ctId,person_id:PID,...c,assign_id:asgId});
    if(!r2.ok){ toast('현행 프로젝트는 저장했지만 접촉 이력 저장에 실패했습니다. 접촉을 다시 입력해 주세요.',true); await hrUpdate('S25',asgId,{source_contact_id:''},{readUpdatedAt:await hrFresh('S25',asgId)}); await reload(); return; }
    touch.notice=''; toast('접촉과 현행 프로젝트를 저장했습니다.'); await reload();
  });
}
// 저장 직후 행의 수정일시를 다시 읽는다(롤백 보정용)
async function hrFresh(k,id){ const row=await hrFindRow(k,id); const h=await hrHeader(k); const cur=row>0&&h.ok?await hrReadRow(k,row,h.header):null; return cur?cur.updated_at:''; }

async function saveCur(btn){
  const row=D.S25.find(x=>x.assign_id===btn.dataset.assign); if(!row) return; const cv=readCur('e'); if(!cv) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S25',row.assign_id,cv,{readUpdatedAt:row.updated_at});
    if(r.ok){ touch.editCur=false; toast('현행 프로젝트를 수정했습니다.'); await reload(); } else { failMsg(r); if(r.code==='CONFLICT') await reload(); } });
}
async function endCur(btn){
  const row=D.S25.find(x=>x.assign_id===btn.dataset.assign); if(!row) return; const st=btn.dataset.st;
  if(!confirm(`진행 중인 프로젝트를 ${st}로 바꿉니다. 기록은 과거 투입 이력에 남습니다.`)) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S25',row.assign_id,{status:st},{readUpdatedAt:row.updated_at});
    if(r.ok){ touch.editCur=false; toast(`${st} 처리했습니다.`); await reload(); } else { failMsg(r); if(r.code==='CONFLICT') await reload(); } });
}
async function saveCt(btn){
  const row=D.S26.find(x=>x.contact_id===btn.dataset.contact); if(!row) return; const c=readContact('x'); if(!c) return;
  await hrBusy(btn,async()=>{ const r=await hrUpdate('S26',row.contact_id,c,{readUpdatedAt:row.updated_at});
    if(r.ok){ touch.editContact=''; touch.notice=String(row.assign_id||'').trim()?'접촉 내용이 바뀌었으니 현행 정보를 확인하세요.':''; toast('접촉을 수정했습니다.'); await reload(); } else { failMsg(r); if(r.code==='CONFLICT') await reload(); } });
}
async function delCt(btn){
  const row=D.S26.find(x=>x.contact_id===btn.dataset.contact); if(!row) return;
  if(!confirm('접촉 이력을 삭제합니다.')) return;
  await hrBusy(btn,async()=>{
    const r=await hrDelete('S26',row.contact_id,{readUpdatedAt:row.updated_at});
    if(!r.ok){ failMsg(r); if(r.code==='CONFLICT'||r.code==='NOT_FOUND') await reload(); return; }
    // 연결된 현행 프로젝트(S25)는 그대로 두고 연결만 비운다
    const x=await hrReadMany(['S25']); const linked=x.failed.length?[]:x.tabs.S25.rows.filter(a=>a.source_contact_id===row.contact_id);
    for(const a of linked){ const u=await hrUpdate('S25',a.assign_id,{source_contact_id:''},{readUpdatedAt:a.updated_at}); if(!u.ok){ failMsg(u); break; } }
    touch.notice=''; touch.editContact=''; toast('접촉 이력을 삭제했습니다.'); await reload();
  });
}
Object.assign(ACT,{saveTouch,saveCur,endCur,saveCt,delCt,
  toggleCur:()=>{ hrQ('nCurBox').style.display=hrQ('nCurOn').checked?'':'none'; },
  editCur:()=>{ touch.editCur=true; render(); },cancelCur:()=>{ touch.editCur=false; render(); },
  editCt:b=>{ touch.editContact=b.dataset.contact; render(); const e=hrQ('ctEdit'); if(e&&e.scrollIntoView) e.scrollIntoView({block:'center'}); },cancelCt:()=>{ touch.editContact=''; render(); }});
document.addEventListener('change',ev=>{
  const e=ev.target; if(e.dataset.curkind) onKind(e); else if(e.dataset.curproj) onProj(e); else if(e.dataset.curparty) onParty(e);
});
