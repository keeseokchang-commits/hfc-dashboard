// HFC scr-request-cands.js v2.9.89 — STF-SCR-02 의뢰 상세 ⑤ 후보 단계 · ⑥ Claude 질문 (개발 단계 ④)
// 근거: 프로그램 설계서 §5(SCR-02) ⑤⑥, §25(CMN-08), §22(CMN-05). scr-request-detail.js 의 전역(D·REQ·LINES·CODES·PM 등)을 그대로 쓴다.
// 쓰는 탭: S31(채택 경로 is_adopted 수정) · S38/S31.stage(CMN-05 가 함) / 읽기: S20·S21·S22·S23·S25·S26·S28·S29(후보 이름·이력 — 이 두 영역을 그릴 때만 따로 읽는다)
// 정한 것(2026-10-15):
//   · 사람 자료 탭이 하나라도 읽히지 않으면 ⑤는 후보 번호만으로 단계 변경까지는 되게 두고 ⑥은 "읽지 못함"으로 막는다(다른 영역은 정상).
//   · ⑤ 단계 변경은 CMN-05 를 그대로 부른다. 탈락=사유 필수, 인터뷰=유형·일시 입력. 같은 단계 저장은 "이미 같은 단계입니다."
//   · 중복 추천 = 같은 의뢰 안에서 같은 사람이 둘 이상 경로로 들어온 경우. 경로·제시 단가를 나란히 보이고 "채택 경로"를 하나 고른다(S31.is_adopted, 나머지는 N).
//   · 사업기회 승격·견적 반영은 scr-request-promote.js (v2.9.101).
//   · ⑥ 문구는 어디에도 저장하지 않는다. 라인을 바꾸면 후보 선택은 초기화한다.
let PV=null, PV_FAIL=false, PV_DATA={}, candLine='', askSel=new Set(), askKind=CMN_ASK_KINDS[0], askExtra='', askResult=null, PROMPT_TPL='';
const CAND_KEYS=['S20','S21','S22','S23','S25','S26','S28','S29'];
async function loadPeople(){
  PV=null; PV_FAIL=false; PV_DATA={};
  const r=await hrReadMany([...CAND_KEYS,'S10','S38']);
  if(r.failed.length){ PV_FAIL=true; return; }
  CAND_KEYS.forEach(k=>{ PV_DATA[k]=r.tabs[k].rows; }); PV_DATA.S38=r.tabs.S38.rows;
  PROMPT_TPL=''; r.tabs.S10.rows.forEach(s=>{ if(String(s.category??'').trim()===S10_HR_SETTING_CAT&&String(s.setting_key??'').trim()==='claude_prompt_template') PROMPT_TPL=String(s.setting_value??''); });
  const st={}; r.tabs.S10.rows.forEach(s=>{ const v=parseInt(s.setting_value,10); if(['short_tenure_months','exit_alert_days','reconfirm_days'].includes(s.setting_key)&&!isNaN(v)) st[s.setting_key]=v; });
  PV=cmnPersonViews({persons:PV_DATA.S20,roles:PV_DATA.S21,skills:PV_DATA.S22,careers:PV_DATA.S23,assigns:PV_DATA.S25,files:PV_DATA.S28,ratings:PV_DATA.S29,cands:D.S31,contacts:PV_DATA.S26},hrToday(),st,null);
}
const liveLines=()=>LINES.filter(l=>!cmnYes(l.is_cancelled));
const candsOf=lid=>D.S31.filter(c=>c.line_id===lid).sort((a,b)=>String(a.cand_id).localeCompare(String(b.cand_id)));
const pName=pid=>{ const v=PV&&PV[pid]; if(v) return v.name; const p=(PV_DATA.S20||[]).find(x=>x.person_id===pid); return p?p.name:pid; };
async function renderCands(){
  const box=hrQ('candBox'), cbox=hrQ('askBox'); if(!box) return;
  if(!REQ){ box.innerHTML=needSaved(); cbox.innerHTML=needSaved(); return; }
  await loadPeople();
  const live=liveLines();
  if(!live.length){ box.innerHTML='<div class="hr-empty">요청 라인을 먼저 추가해 주세요.</div>'; cbox.innerHTML='<div class="hr-empty">요청 라인을 먼저 추가해 주세요.</div>'; return; }
  if(!live.some(l=>l.line_id===candLine)) candLine=live[0].line_id;
  renderCandBox(); renderAskBox();
}
function dupInfo(c){
  const same=D.S31.filter(x=>x.person_id===c.person_id&&x.cand_id!==c.cand_id&&LINES.some(l=>l.line_id===x.line_id));
  return same;
}
function renderCandBox(){
  const box=hrQ('candBox'); const live=liveLines(); const line=live.find(l=>l.line_id===candLine); const pm=hrMap(D.S27,'party_id');
  const chips=live.map(l=>`<span class="hr-chip${l.line_id===candLine?' on':''}" data-cl="${hrEsc(l.line_id)}">${hrEsc(lineLabel(l))} <b>${candsOf(l.line_id).length}</b></span>`).join('');
  const rows=candsOf(candLine);
  const failOpts=CODES.fail_reason.map(c=>({v:c,t:c}));
  const body=rows.length?rows.map(c=>{
    const dups=dupInfo(c); const closed=DER&&DER.closed;
    const stage=c.stage||ST.STAGE8[0]; const lastLog=(PV_DATA.S38||[]).filter(x=>x.cand_id===c.cand_id).map(x=>x.stage_date).filter(Boolean).sort().pop()||'';
    const fit=c.fit_level?`<span class="hr-badge ${c.fit_level==='상'?'green':c.fit_level==='중'?'amber':'red'}">적합 ${hrEsc(c.fit_level)}</span>`:'<span class="hr-badge gray">평가 없음</span>';
    return `<div class="hr-line-card" data-cand="${hrEsc(c.cand_id)}">
      <div class="hr-row" style="justify-content:space-between;margin-bottom:6px"><span><b>${hrEsc(pName(c.person_id))}</b> <span class="hr-sub">${hrEsc(c.person_id)} · ${hrEsc(c.cand_id)}</span> ${fit} ${cmnYes(c.is_adopted)?'<span class="hr-badge green">채택 경로</span>':''}</span>
        <span class="hr-sub">경로 ${hrEsc(c.via_party_id?hrPartyLabel(pm,c.via_party_id):'-')}${c.rate_buy!==''&&c.rate_buy!==undefined?` · 매입 ${hrEsc(hrFmtMan(c.rate_buy))}만원`:''}</span></div>
      ${c.pitch_points?`<div class="hr-sub" style="white-space:pre-line;margin-bottom:6px">${hrEsc(c.pitch_points)}</div>`:''}
      ${dups.length?`<div class="hr-notice warn" data-dup="1">중복 추천: ${dups.map(x=>`${hrEsc(x.via_party_id?hrPartyName(pm,x.via_party_id):'-')}${x.rate_buy!==''&&x.rate_buy!==undefined?` (${hrEsc(hrFmtMan(x.rate_buy))}만원)`:''}`).join(', ')} 에서도 들어왔습니다. ${cmnYes(c.is_adopted)?'':'<button class="btn btn-secondary btn-sm" data-cact="adopt">이 경로를 채택</button>'}</div>`:''}
      <div class="hr-row">
        <div class="hr-field fixed" style="min-width:140px"><label>단계</label><select class="hr-select cc-stage">${optList(ST.STAGE8.map(s=>({v:s,t:s})),stage)}</select></div>
        <div class="hr-field fixed" style="min-width:160px"><label>단계일</label><input class="hr-input cc-date" type="date" value="${hrToday()}"><div class="hr-sub">직전 ${hrEsc(lastLog||'-')}</div></div>
        <div class="hr-field fixed cc-failbox" style="min-width:160px;${stage==='탈락'?'':'display:none'}"><label class="hr-req">탈락 사유</label><select class="hr-select cc-fail">${optList(failOpts,c.fail_reason_code||'','선택')}</select></div>
        <div class="hr-field fixed cc-ivbox" style="min-width:300px;${stage==='인터뷰'?'':'display:none'}"><label>인터뷰</label><div class="hr-row"><select class="hr-select cc-ivtype" style="width:110px">${optList([{v:'대면',t:'대면'},{v:'비대면',t:'비대면'}],c.interview_type||'','유형')}</select><input class="hr-input cc-ivat" type="date" value="${hrEsc(c.interview_at||'')}"></div></div>
        <div class="hr-field"><label>메모</label><input class="hr-input cc-memo"></div>
      </div>
      <div class="hr-err cc-msg"></div>
      <div class="hr-row" style="margin-top:6px"><button class="btn btn-primary btn-sm" data-cact="stage">단계 저장</button></div></div>`;
  }).join(''):'<div class="hr-empty" id="candEmpty">아직 이 라인에 등록된 후보가 없습니다.</div>';
  box.innerHTML=`<div class="hr-chips" id="candLines" style="margin-bottom:8px">${chips}</div>
    <div class="hr-row" style="margin-bottom:8px"><a class="btn btn-primary btn-sm" id="btnPick" href="candidate-add.html?line=${encodeURIComponent(candLine)}">후보 선택</a>${PV_FAIL?'<span class="hr-sub">후보 이름을 읽지 못해 번호로 표시합니다.</span>':''}</div>${body}`;
}
async function candAction(b){
  const card=b.closest('[data-cand]'); const cur=D.S31.find(c=>c.cand_id===card.dataset.cand); const msg=card.querySelector('.cc-msg'); msg.textContent='';
  if(b.dataset.cact==='adopt'){
    const peers=D.S31.filter(x=>x.person_id===cur.person_id&&LINES.some(l=>l.line_id===x.line_id));
    for(const x of peers){ const want=x.cand_id===cur.cand_id?'Y':'N'; if(String(x.is_adopted||'N')===want) continue;
      const r=await hrUpdate('S31',x.cand_id,{is_adopted:want},{readUpdatedAt:x.updated_at}); if(!r.ok){ msg.textContent=hrSaveFailText(r); await loadAll(); return; } }
    toast('✓ 채택 경로를 지정했습니다'); await loadAll(); return;
  }
  const stage=card.querySelector('.cc-stage').value, date=card.querySelector('.cc-date').value, fail=card.querySelector('.cc-fail').value;
  if(stage==='탈락'&&!fail){ msg.textContent=CMN_STAGE_MSG.needReason; return; }
  const p={cand_id:cur.cand_id,stage,stage_date:date,memo:card.querySelector('.cc-memo').value.trim(),fail_reason_code:fail,readUpdatedAt:cur.updated_at};
  if(stage==='인터뷰'){ p.interview_type=card.querySelector('.cc-ivtype').value; p.interview_at=card.querySelector('.cc-ivat').value; }
  const r=await cmnChangeStage(p); if(!r.ok){ msg.textContent=r.message||hrSaveFailText(r); if(r.partial) await loadAll(); return; }
  toast('✓ 단계를 저장했습니다'); await loadAll();
}
document.addEventListener('click',ev=>{
  const cl=ev.target.closest('#candLines [data-cl]'); if(cl){ candLine=cl.dataset.cl; renderCandBox(); return; }
  const b=ev.target.closest('[data-cact]'); if(b){ hrBusy(b,()=>candAction(b)); }
});
document.addEventListener('change',ev=>{
  if(ev.target.matches('.cc-stage')){ const card=ev.target.closest('[data-cand]'); card.querySelector('.cc-failbox').style.display=ev.target.value==='탈락'?'':'none'; card.querySelector('.cc-ivbox').style.display=ev.target.value==='인터뷰'?'':'none'; }
});

// ── ⑥ Claude 질문 ───────────────────────────────────────────────────────────
function renderAskBox(){
  const box=hrQ('askBox'); if(PV_FAIL||!PV){ box.innerHTML='<div class="hr-notice warn" id="askFail">후보 자료를 읽지 못해 질문 문구를 만들 수 없습니다. 다시 불러와 주세요.</div>'; return; }
  const rows=candsOf(candLine);
  if(!rows.length){ box.innerHTML='<div class="hr-empty">이 라인에 후보를 등록한 뒤 사용할 수 있습니다.</div>'; return; }
  askSel=new Set([...askSel].filter(id=>rows.some(c=>c.cand_id===id)));
  box.innerHTML=`<div class="hr-lbl">질문할 후보 (선택한 라인: ${hrEsc(lineLabel(liveLines().find(l=>l.line_id===candLine)||{}))})</div>
    <div class="hr-chips" id="askCands" style="margin:4px 0">${rows.map(c=>`<span class="hr-chip${askSel.has(c.cand_id)?' on':''}" data-ac="${hrEsc(c.cand_id)}">${hrEsc(pName(c.person_id))}</span>`).join('')}</div>
    <div class="hr-row"><div class="hr-field fixed" style="min-width:220px"><label for="askKind">질문 종류</label><select class="hr-select" id="askKind">${optList(CMN_ASK_KINDS.map(k=>({v:k,t:k})),askKind)}</select></div>
      <div class="hr-field"><label for="askExtra">덧붙일 말</label><input class="hr-input" id="askExtra" value="${hrEsc(askExtra)}"></div></div>
    <div class="hr-row" style="margin-top:8px"><button class="btn btn-primary" id="btnAsk">질문 문구 만들기</button></div>
    <div id="askOut"></div>`;
  hrQ('btnAsk').onclick=makeAsk; if(askResult) showAsk();
}
function makeAsk(){
  askKind=hrQ('askKind').value; askExtra=hrQ('askExtra').value;
  const cands=[...askSel].map(id=>{ const c=D.S31.find(x=>x.cand_id===id); const v=c&&PV[c.person_id]; if(!v) return null; return {view:v,careers:PV_DATA.S23.filter(x=>x.person_id===v.id),skills:PV_DATA.S22.filter(x=>x.person_id===v.id)}; }).filter(Boolean);
  const l=liveLines().find(x=>x.line_id===candLine);
  askResult=cmnBuildPrompt({line:l,req:REQ,cands,kind:askKind,extra:askExtra,template:PROMPT_TPL}); showAsk();
}
function showAsk(){
  const out=hrQ('askOut'); const r=askResult;
  if(!r.ok){ out.innerHTML=`<div class="hr-err" id="askErr" style="margin-top:6px">${hrEsc(r.message)}</div>`; return; }
  out.innerHTML=`${r.warnings.map(w=>`<div class="hr-notice warn">${hrEsc(w)}</div>`).join('')}
    <div class="hr-sub" style="margin:8px 0 4px" id="askMap">화면에서만 보는 대응: ${r.map.map(m=>`${hrEsc(m.alias)} = ${hrEsc(pName(m.id))}`).join(' · ')}</div>
    <textarea class="hr-input" id="askText" rows="14" style="width:100%">${hrEsc(r.text)}</textarea>
    <div class="hr-sub" style="margin-top:4px">제외한 정보: ${r.excluded.map(hrEsc).join(', ')} · 이 문구는 저장하지 않습니다.</div>
    <div class="hr-row" style="margin-top:6px"><button class="btn btn-secondary btn-sm" id="btnCopyAsk">복사</button></div>`;
  hrQ('btnCopyAsk').onclick=async()=>{ const t=hrQ('askText').value; try{ await navigator.clipboard.writeText(t); toast('복사했습니다.'); }catch(e){ hrQ('askText').select(); toast('선택된 문구를 직접 복사해 주세요.',true); } };
}
document.addEventListener('click',ev=>{ const a=ev.target.closest('#askCands [data-ac]'); if(!a) return; const id=a.dataset.ac; askSel.has(id)?askSel.delete(id):askSel.add(id); a.classList.toggle('on'); askResult=null; const o=hrQ('askOut'); if(o) o.innerHTML=''; });
