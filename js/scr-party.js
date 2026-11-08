// HFC scr-party.js v2.9.76 — STF-SCR-11 거래처 관리
// 근거: 프로그램 설계서 §15(SCR-11). 거래처(S27)와 담당자(S36)를 한 곳에서 관리하고, 의뢰·발송 화면이 이 목록을 선택지로 쓴다.
// 삭제는 없다(숨김으로 대체). 기본 행 "직접"(PTY-001)·"내부"(PTY-002)는 이름·역할 변경과 숨김이 불가능하다.
// 의존: schema.js, common.js, cmn-sheet.js, hr-ui.js
let D={S27:[],S36:[],S32:[],S34:[],S28:[]};
let selParty=null;      // 선택한 거래처 ID (null = 새 거래처 입력 중)
let selContact=null;    // 선택한 담당자 ID (null = 새 담당자)
let pfRoles=new Set();
const BASE_IDS=new Set(HR_SEED_PARTIES.map(p=>p.party_id));
const MSG_BASE='기본 거래처는 변경할 수 없습니다.';

// 이름 비교용 정규화 — 공백과 (주)·㈜·주식회사를 뺀 뒤 대소문자 구분 없이 비교
function normName(s){ return String(s??'').toLowerCase().replace(/\s+/g,'').replace(/\(주\)|（주）|㈜|주식회사/g,''); }
// 같은 이름·별칭이 이미 있는 거래처 찾기. names = 새로 넣을 이름과 별칭들. self = 수정 중인 자기 자신(제외)
function findDupParty(rows,names,self){
  const want=names.map(normName).filter(Boolean);
  for(const p of rows){
    if(p.party_id===self) continue;
    const have=[p.name,...hrSplit(p.aliases)].map(normName).filter(Boolean);
    if(want.some(w=>have.includes(w))) return p;
  }
  return null;
}
// 진행 중 의뢰 중 이 거래처를 쓰는 의뢰 수 — 요청자·최종 고객사로 연결됐거나 서치업체로 발송한 의뢰
function openRequestsUsing(partyId,reqs,orders){
  const open=reqs.filter(r=>!cmnIsClosed(r));
  const ids=new Set(open.filter(r=>r.requester_party_id===partyId||r.end_client_party_id===partyId).map(r=>r.request_id));
  orders.filter(o=>o.party_id===partyId).forEach(o=>{ if(open.some(r=>r.request_id===o.request_id)) ids.add(o.request_id); });
  return ids.size;
}
function countsFor(pid){
  return {contacts:D.S36.filter(c=>c.party_id===pid&&hrYes(c.is_active||'Y')).length,
    requests:D.S32.filter(r=>r.requester_party_id===pid).length,
    orders:D.S34.filter(o=>o.party_id===pid).length,
    files:D.S28.filter(f=>f.source_party_id===pid).length};
}

async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const r=await hrLoadScreen(['S27','S36','S32','S34','S28']);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  box.innerHTML=''; hrQ('screen').style.display='';
  D=r.data;
  const sel=hrQ('fRole'); const cur=sel.value;
  sel.innerHTML='<option value="">전체 역할</option>'+ST.PARTY_ROLES.map(x=>`<option>${hrEsc(x)}</option>`).join('');
  sel.value=cur;
  const want=new URLSearchParams(location.search).get('id');
  if(!selParty&&want&&D.S27.some(p=>p.party_id===want)) selParty=want;
  renderList(); fillForm(); renderContacts();
}

function renderList(){
  const q=normName(hrQ('fSearch').value), role=hrQ('fRole').value, showHidden=hrQ('fHidden').checked;
  const list=D.S27.filter(p=>{
    if(!showHidden&&String(p.is_active).trim()==='N') return false;
    if(role&&!hrSplit(p.roles).includes(role)) return false;
    if(q){ const hay=[p.name,...hrSplit(p.aliases)].map(normName).join('|'); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>(BASE_IDS.has(b.party_id)-BASE_IDS.has(a.party_id))||String(a.name).localeCompare(String(b.name),'ko'));
  const box=hrQ('partyList');
  if(!D.S27.length){ box.innerHTML='<div class="hr-empty">등록된 거래처가 없습니다.</div>'; return; }
  if(!list.length){ box.innerHTML='<div class="hr-empty">조건에 맞는 거래처가 없습니다.</div>'; return; }
  box.innerHTML=list.map(p=>{
    const c=countsFor(p.party_id); const hidden=String(p.is_active).trim()==='N';
    return `<div class="hr-list-item${p.party_id===selParty?' on':''}${hidden?' off':''}" data-id="${hrEsc(p.party_id)}" onclick="pickParty('${hrEsc(p.party_id)}')">
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;font-size:13px">${hrEsc(p.name)}${hidden?' <span class="hr-badge gray">숨김</span>':''}${BASE_IDS.has(p.party_id)?' <span class="hr-badge blue">기본</span>':''}</div>
        <div class="hr-help" data-pid="1" style="margin-top:2px">${hrEsc(p.party_id)}</div>
        <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${hrSplit(p.roles).map(x=>`<span class="hr-badge gray">${hrEsc(x)}</span>`).join('')}</div>
        <div class="hr-help" style="margin-top:4px">${p.main_phone?'☎ '+hrEsc(p.main_phone)+' · ':''}담당자 ${c.contacts} · 의뢰 ${c.requests} · 발송 ${c.orders} · 이력서 ${c.files}</div>
      </div></div>`;
  }).join('');
}

// ── ③ 거래처 입력·수정 ──────────────────────────────────────────────────────
function curParty(){ return D.S27.find(p=>p.party_id===selParty)||null; }
function renderRoleChips(locked){
  hrQ('pfRoles').innerHTML=ST.PARTY_ROLES.map(x=>`<span class="hr-chip${pfRoles.has(x)?' on':''}${locked?' disabled':''}" onclick="toggleRole('${x}')">${hrEsc(x)}</span>`).join('');
}
function toggleRole(x){ const p=curParty(); if(p&&BASE_IDS.has(p.party_id)){ hrQ('pfMsg').textContent=MSG_BASE; return; } pfRoles.has(x)?pfRoles.delete(x):pfRoles.add(x); renderRoleChips(false); }
function clearErrors(){ ['pfNameErr','pfRolesErr','pfMsg','cfNameErr','cfMsg'].forEach(i=>hrQ(i).textContent=''); }
function fillForm(){
  clearErrors(); const p=curParty(); const base=p&&BASE_IDS.has(p.party_id);
  hrQ('pfTitle').textContent=p?'③ 거래처 수정':'③ 거래처 입력';
  hrQ('pfName').value=p?p.name:''; hrQ('pfAliases').value=p?p.aliases:''; hrQ('pfPhone').value=p?p.main_phone:''; hrQ('pfMemo').value=p?p.memo:'';
  pfRoles=new Set(p?hrSplit(p.roles):[]); renderRoleChips(base);
  hrQ('pfName').disabled=!!base;
  const hid=p&&String(p.is_active).trim()==='N';
  hrQ('pfBadges').innerHTML=p?`<span class="hr-sub" data-pid-form="1">${hrEsc(p.party_id)}</span> <button type="button" class="btn btn-secondary btn-sm" data-act="copyPid" data-pid="${hrEsc(p.party_id)}">ID 복사</button> ${base?'<span class="hr-badge blue">기본 거래처</span> ':''}${hid?'<span class="hr-badge gray">숨김</span>':''}`:'';
  const b=hrQ('btnHideParty'); b.style.display=p?'':'none'; b.textContent=hid?'숨김 해제':'숨김';
  hrQ('btnDeleteParty').style.display=p&&!base?'':'none';
  hrQ('contactCard').style.display=p?'':'none';
}
function newParty(){ selParty=null; selContact=null; fillForm(); renderList(); renderContacts(); hrQ('pfName').focus(); }
function pickParty(id){ selParty=id; selContact=null; fillForm(); renderList(); renderContacts(); }

async function saveParty(){
  await hrBusy(hrQ('btnSaveParty'),async()=>{
    clearErrors(); const p=curParty(); const base=p&&BASE_IDS.has(p.party_id);
    const v={name:hrQ('pfName').value.trim(),aliases:hrSplit(hrQ('pfAliases').value).join(','),main_phone:hrQ('pfPhone').value.trim(),memo:hrQ('pfMemo').value.trim(),
      roles:ST.PARTY_ROLES.filter(x=>pfRoles.has(x)).join(',')};
    let bad=false;
    if(!v.name){ hrQ('pfNameErr').textContent='거래처명을(를) 입력해 주세요.'; bad=true; }
    if(!v.roles){ hrQ('pfRolesErr').textContent='역할을(를) 선택해 주세요.'; bad=true; }
    if(bad) return;
    if(base&&(v.name!==p.name||v.roles!==p.roles)){ hrQ('pfMsg').textContent=MSG_BASE; return; }
    const dup=findDupParty(D.S27,[v.name,...hrSplit(v.aliases)],p?p.party_id:null);
    if(dup&&!confirm(`같은 이름의 거래처(${dup.name})가 있습니다. 그래도 ${p?'저장':'등록'}할까요?`)) return;
    if(!p){
      const r=await hrAppend('S27',{...v,is_active:'Y'});
      if(!r.ok){ hrQ('pfMsg').textContent=hrSaveFailText(r); return; }
      toast('✓ 거래처를 등록했습니다'); selParty=r.id;
    } else {
      const ch={}; ['name','roles','aliases','main_phone','memo'].forEach(k=>{ if(String(p[k]??'')!==String(v[k])) ch[k]=v[k]; });
      if(!Object.keys(ch).length){ toast('변경된 내용이 없습니다'); return; }
      const r=await hrUpdate('S27',p.party_id,ch,{readUpdatedAt:p.updated_at});
      if(!r.ok){ hrQ('pfMsg').textContent=hrSaveFailText(r); return; }
      toast('✓ 저장했습니다');
    }
    await loadAll();
  });
}
async function toggleHideParty(){
  await hrBusy(hrQ('btnHideParty'),async()=>{
    clearErrors(); const p=curParty(); if(!p) return;
    if(BASE_IDS.has(p.party_id)){ hrQ('pfMsg').textContent=MSG_BASE; return; }
    const hiding=String(p.is_active).trim()!=='N';
    if(hiding){
      const n=openRequestsUsing(p.party_id,D.S32,D.S34);
      if(n>0&&!confirm(`진행 중 의뢰 ${n}건에서 사용 중입니다. 숨겨도 기존 의뢰·기록은 그대로이고, 새 의뢰의 선택지에서만 빠집니다. 숨길까요?`)) return;
    }
    const r=await hrUpdate('S27',p.party_id,{is_active:hiding?'N':'Y'},{readUpdatedAt:p.updated_at});
    if(!r.ok){ hrQ('pfMsg').textContent=hrSaveFailText(r); return; }
    toast(hiding?'숨겼습니다':'숨김을 해제했습니다'); await loadAll();
  });
}

// 거래처 삭제 — 어디에도 쓰이지 않은 거래처만(변경 004). 사용 여부는 지금 시트를 다시 읽어 확인하고, 확인이 안 되면 삭제하지 않는다. 담당자는 함께 삭제한다.
async function partyUsage(pid){
  const r=await hrReadMany(['S32','S34','S31','S28','S25','S23']); if(r.failed.length) return null;
  const t=r.tabs; const n=(k,f)=>t[k].rows.filter(f).length;
  return [['의뢰',n('S32',x=>x.requester_party_id===pid||x.end_client_party_id===pid)],['발송',n('S34',x=>x.party_id===pid)],['후보 경로',n('S31',x=>x.via_party_id===pid)],['이력서',n('S28',x=>x.source_party_id===pid)],
    ['투입',n('S25',x=>x.via_party_id===pid||x.client_party_id===pid)],['경력',n('S23',x=>x.client_party_id===pid)]].filter(x=>x[1]>0);
}
async function deleteParty(){
  await hrBusy(hrQ('btnDeleteParty'),async()=>{
    clearErrors(); const p=curParty(); if(!p) return;
    if(BASE_IDS.has(p.party_id)){ hrQ('pfMsg').textContent=MSG_BASE; return; }
    const use=await partyUsage(p.party_id);
    if(use===null){ hrQ('pfMsg').textContent='사용 여부를 확인하지 못해 삭제하지 않았습니다. 다시 시도해 주세요.'; return; }
    if(use.length){ hrQ('pfMsg').textContent=`사용 중이라 삭제할 수 없습니다 (${use.map(x=>x[0]+' '+x[1]+'건').join(' · ')}). 숨김을 사용해 주세요.`; return; }
    const cs=D.S36.filter(c=>c.party_id===p.party_id);
    if(!confirm(`‘${p.name}’ 거래처${cs.length?`와 담당자 ${cs.length}명`:''}을(를) 삭제합니다. 되돌릴 수 없습니다. 삭제할까요?`)) return;
    for(const c of cs){ const d=await hrDelete('S36',c.pcontact_id,{readUpdatedAt:c.updated_at}); if(!d.ok){ hrQ('pfMsg').textContent=hrSaveFailText(d); await loadAll(); return; } }
    const d=await hrDelete('S27',p.party_id,{readUpdatedAt:p.updated_at}); if(!d.ok){ hrQ('pfMsg').textContent=hrSaveFailText(d); await loadAll(); return; }
    toast('✓ 거래처를 삭제했습니다'); selParty=null; selContact=null; await loadAll();
  });
}
async function deleteContact(){
  await hrBusy(hrQ('btnDeleteContact'),async()=>{
    hrQ('cfMsg').textContent=''; const c=D.S36.find(x=>x.pcontact_id===selContact); if(!c) return;
    if(!confirm(`담당자 ‘${c.name}’을(를) 삭제합니다. 되돌릴 수 없습니다. 삭제할까요?`)) return;
    const d=await hrDelete('S36',c.pcontact_id,{readUpdatedAt:c.updated_at}); if(!d.ok){ hrQ('cfMsg').textContent=hrSaveFailText(d); return; }
    toast('✓ 담당자를 삭제했습니다'); selContact=null; await loadAll();
  });
}
// ── ④ 담당자 ────────────────────────────────────────────────────────────────
function contactsOf(pid){
  return D.S36.filter(c=>c.party_id===pid).sort((a,b)=>(hrYes(b.is_primary)-hrYes(a.is_primary))||((String(a.is_active)==='N')-(String(b.is_active)==='N'))||String(a.name).localeCompare(String(b.name),'ko'));
}
function renderContacts(){
  const p=curParty(); if(!p){ return; }
  hrQ('ctTitle').textContent=`④ 담당자 — ${p.name}`;
  const list=contactsOf(p.party_id);
  hrQ('contactList').innerHTML=list.length?list.map(c=>{
    const hid=String(c.is_active).trim()==='N';
    return `<div class="hr-list-item${c.pcontact_id===selContact?' on':''}${hid?' off':''}" data-cid="${hrEsc(c.pcontact_id)}" onclick="pickContact('${hrEsc(c.pcontact_id)}')">
      <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:13px">${hrEsc(c.name)}${c.title?' <span class="hr-muted" style="font-weight:400">'+hrEsc(c.title)+'</span>':''}
        ${hrYes(c.is_primary)?' <span class="hr-badge green">주 담당자</span>':''}${hid?' <span class="hr-badge gray">숨김</span>':''}</div>
        <div class="hr-help" style="margin-top:3px">${[c.phone&&'☎ '+hrEsc(c.phone),c.email&&hrEsc(c.email),c.last_contacted_at&&'마지막 연락 '+hrEsc(c.last_contacted_at)].filter(Boolean).join(' · ')}</div></div></div>`;
  }).join(''):'<div class="hr-empty">등록된 담당자가 없습니다.</div>';
  fillContact();
}
function fillContact(){
  const c=D.S36.find(x=>x.pcontact_id===selContact)||null;
  hrQ('cfNameErr').textContent=''; hrQ('cfMsg').textContent='';
  hrQ('cfTitle').textContent=c?'담당자 수정':'담당자 입력';
  hrQ('cfName').value=c?c.name:''; hrQ('cfTitleIn').value=c?c.title:''; hrQ('cfPhone').value=c?c.phone:''; hrQ('cfEmail').value=c?c.email:'';
  hrQ('cfLast').value=c?c.last_contacted_at:''; hrQ('cfMemo').value=c?c.contact_memo:'';
  hrQ('btnDeleteContact').style.display=c?'':'none';
  hrQ('cfPrimary').checked=!!c&&hrYes(c.is_primary); hrQ('cfHidden').checked=!!c&&String(c.is_active).trim()==='N';
}
function newContact(){ selContact=null; renderContacts(); hrQ('cfName').focus(); }
function pickContact(id){ selContact=id; renderContacts(); }
async function saveContact(){
  await hrBusy(hrQ('btnSaveContact'),async()=>{
    hrQ('cfNameErr').textContent=''; hrQ('cfMsg').textContent='';
    const p=curParty(); if(!p) return;
    const cur=D.S36.find(x=>x.pcontact_id===selContact)||null;
    const v={name:hrQ('cfName').value.trim(),title:hrQ('cfTitleIn').value.trim(),phone:hrQ('cfPhone').value.trim(),email:hrQ('cfEmail').value.trim(),
      contact_memo:hrQ('cfMemo').value.trim(),last_contacted_at:hrQ('cfLast').value.trim(),is_primary:hrQ('cfPrimary').checked?'Y':'N',is_active:hrQ('cfHidden').checked?'N':'Y'};
    if(!v.name){ hrQ('cfNameErr').textContent='이름을(를) 입력해 주세요.'; return; }
    if(v.is_primary==='Y'&&v.is_active==='N'){ hrQ('cfMsg').textContent='숨긴 담당자는 주 담당자로 둘 수 없습니다.'; return; }
    // 주 담당자 지정 — 거래처당 1명. 기존 주 담당자를 먼저 풀고 새로 지정한다(중간에 실패해도 주 담당자가 둘이 되지 않게).
    let released='';
    if(v.is_primary==='Y'){
      const others=D.S36.filter(c=>c.party_id===p.party_id&&hrYes(c.is_primary)&&c.pcontact_id!==(cur&&cur.pcontact_id));
      for(const o of others){
        const r=await hrUpdate('S36',o.pcontact_id,{is_primary:'N'},{readUpdatedAt:o.updated_at});
        if(!r.ok){ hrQ('cfMsg').textContent=hrSaveFailText(r); return; }
        released=o.name;
      }
    }
    let r;
    if(!cur) r=await hrAppend('S36',{...v,party_id:p.party_id});
    else {
      const ch={}; Object.keys(v).forEach(k=>{ if(String(cur[k]??'')!==String(v[k])) ch[k]=v[k]; });
      if(!Object.keys(ch).length){ toast(released?`기존 주 담당자(${released})가 해제되었습니다`:'변경된 내용이 없습니다'); await loadAll(); return; }
      r=await hrUpdate('S36',cur.pcontact_id,ch,{readUpdatedAt:cur.updated_at});
    }
    if(!r.ok){ hrQ('cfMsg').textContent=hrSaveFailText(r)+(released?' (기존 주 담당자는 이미 해제되었습니다)':''); await loadAll(); return; }
    if(!cur) selContact=r.id;
    toast(released?`✓ 저장했습니다 · 기존 주 담당자(${released})가 해제되었습니다`:'✓ 담당자를 저장했습니다');
    await loadAll();
  });
}
window.addEventListener('load',loadAll);

// 거래처 ID 복사 (이력서 JSON의 source_party_id에 붙여 넣기 위함)
document.addEventListener('click',e=>{ const b=e.target.closest('[data-act="copyPid"]'); if(!b) return; const id=b.dataset.pid;
  const done=()=>{ b.textContent='복사됨'; setTimeout(()=>{ b.textContent='ID 복사'; },1200); };
  try{ navigator.clipboard.writeText(id).then(done,()=>{ b.textContent=id; }); }catch(_){ b.textContent=id; } });
