// HFC scr-cand-detail.js v2.9.81 — STF-SCR-07 후보 상세(개요) · SCR-08 경력 · SCR-10 의뢰·경로·이력서
// 근거: 프로그램 설계서 §11(SCR-07), §12(SCR-08), §14(SCR-10). 주소: candidate-detail.html?id=PSN-0001
// 정한 것(2026-10-13): 기본 정보에 생년월일을 넣으면 birth_precision=일·birth_source=수동으로 같이 저장 / 역할은 수준 변경·추가만(삭제 수단은 기준선 변경 사항으로 보고) /
//   연락처는 "연락처 보기"를 눌렀을 때만 S39 를 읽는다 / 접촉·현행 프로젝트 탭(SCR-09)은 단계 ③에서 연다.
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-person.js, cmn-review.js, hr-ui.js
const KEYS=['S20','S21','S22','S23','S24','S25','S26','S27','S28','S29','S31','S32','S33','S10'];
const GRADES=['특급','고급','중급','초급'];
let PID='', D={}, P=null, V=null, ASOF='', PM=new Map(), CODES={role:[],industry:[],project_type:[]}, RULE=null, tab='overview', editCar='', contactState=null, busy=false;

const sel=(items,cur,blank)=>(blank!==undefined?`<option value="">${hrEsc(blank)}</option>`:'')+items.map(x=>`<option${x===cur?' selected':''}>${hrEsc(x)}</option>`).join('');
const fld=(id,label,val,o={})=>`<div class="hr-field${o.fixed?' fixed':''}"${o.w?` style="min-width:${o.w}px"`:''}><label for="${id}">${hrEsc(label)}</label>${o.html||(o.area?`<textarea class="hr-input" id="${id}" rows="${o.rows||5}" style="width:100%;min-height:96px;resize:vertical;line-height:1.5;white-space:pre-wrap">${hrEsc(val)}</textarea>`:`<input class="hr-input" id="${id}" type="${o.type||'text'}" value="${hrEsc(val)}"${o.ph?` placeholder="${hrEsc(o.ph)}"`:''}${o.inputmode?` inputmode="${o.inputmode}"`:''}>`)}<div class="hr-err" id="${id}Err"></div></div>`;
const mine=k=>(D[k]||[]).filter(r=>r.person_id===PID);
function codesOf(rows){ const c={role:[],industry:[],project_type:[]}; rows.forEach(r=>{ const cat=String(r.category??'').trim(), key=String(r.setting_key??'').trim(); if(key&&c[cat]) c[cat].push(key); }); return c; }
function ruleOf(rows){ const r=rows.find(x=>String(x.setting_key??'').trim()==='grade_rule'); return r?cmnParseGradeRule(r.setting_value):null; }
function settingsOf(rows){ const o={}; rows.forEach(r=>{ const v=parseInt(r.setting_value,10); if(['short_tenure_months','exit_alert_days','reconfirm_days'].includes(r.setting_key)&&!isNaN(v)) o[r.setting_key]=v; }); return o; }
function view(){
  const data={persons:[P],roles:mine('S21'),skills:mine('S22'),careers:mine('S23'),assigns:mine('S25'),files:mine('S28'),ratings:mine('S29'),cands:mine('S31'),contacts:mine('S26')};
  return cmnPersonViews(data,ASOF,settingsOf(D.S10),null)[PID]||null;
}
function say(r,ok='저장했습니다.'){ if(r&&r.ok){ toast(ok); return true; } toast(hrSaveFailText(r),true); return false; }
async function save(btn,fn,okMsg){ return hrBusy(btn,async()=>{ const r=await fn(); if(say(r,okMsg)){ await reload(); return true; } if(r&&(r.code==='CONFLICT')) await reload(); return false; }); }

// ── 읽기 ────────────────────────────────────────────────────────────────────
async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  PID=new URLSearchParams(location.search).get('id')||'';
  const r=await hrLoadScreen(KEYS);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  D=r.data; ASOF=hrToday(); PM=hrMap(D.S27,'party_id'); CODES=codesOf(D.S10); RULE=ruleOf(D.S10);
  P=D.S20.find(p=>p.person_id===PID);
  if(!P){ hrQ('screen').style.display='none'; box.innerHTML='<div class="hr-empty">후보를 찾을 수 없습니다.<br><a class="btn btn-secondary btn-sm" style="margin-top:10px" href="candidate.html">후보 목록으로</a></div>'; return; }
  if(cmnPersonHidden(P)){
    hrQ('screen').style.display='none';
    box.innerHTML=`<div class="hr-empty">다른 후보에 합침되었습니다.${P.merged_into?`<br><a class="btn btn-secondary btn-sm" style="margin-top:10px" data-merged href="candidate-detail.html?id=${encodeURIComponent(P.merged_into)}">합침된 후보 보기</a>`:''}</div>`; return; }
  box.innerHTML=''; hrQ('screen').style.display=''; V=view(); render();
}
async function reload(){ const y=window.scrollY; const keepTab=tab; await loadAll(); tab=keepTab; if(V) render(); window.scrollTo(0,y); }

function render(){
  hrQ('title').innerHTML=`${hrEsc(P.name||PID)} <span class="hr-sub">${hrEsc(PID)}</span> ${V.rating.flag==='블랙'?'<span class="hr-badge red">블랙</span>':V.rating.flag==='화이트'?'<span class="hr-badge green">화이트</span>':''} ${V.review?'<span class="hr-badge red">검토 필요</span>':''}`;
  const yrs=V.years.applied, cur=V.current;
  const card=(l,v,s)=>`<div class="hr-kpi" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:16px">${v}</div><div class="s">${s||''}</div></div>`;
  hrQ('summary').innerHTML=card('역할·등급',hrEsc(V.roleLabel||'-'),hrEsc(V.grade||(V.gradeReported?V.gradeReported+'(이력서 기재)':'등급 미정')))
    +card('적용 경력 연차',`${hrEsc(yrs.years)}년${yrs.basis==='manual'?' <span class="hr-badge gray">수기</span>':''}`,`이력서 기준 ${hrEsc(V.years.auto_years)}년`)
    +card('현행 프로젝트',cur?hrEsc([cur.client,cur.project].filter(Boolean).join(' · ')||'-'):'-',cur?(cur.end_ym?`${hrEsc(cur.end_ym)} 종료`:(cur.kind==='resume'?'이력서 기준':'종료 미정')):'')
    +card('가용일',hrEsc(V.avail.text),`마지막 확인일 ${hrEsc(V.recon?V.recon.last:'-')}`);
  [...hrQ('tabs').children].forEach(c=>c.classList.toggle('on',c.dataset.tab===tab));
  hrQ('body').innerHTML=tab==='career'?careerHtml():tab==='route'?routeHtml():overviewHtml();
  if(tab==='overview') bindContact();
}

// ── 개요(SCR-07) ─────────────────────────────────────────────────────────────
function overviewHtml(){ return basicHtml()+roleHtml()+gradeHtml()+manualHtml()+contactHtml()+ratingHtml(); }
function basicHtml(){
  return `<div class="card"><div class="card-title">기본 정보</div>
    <div class="hr-row">${fld('bName','이름',P.name)}${fld('bNameEn','영문 이름',P.name_en)}${fld('bBirth','생년월일',P.birth_date,{type:'date',w:150,fixed:1})}
      <div class="hr-field fixed" style="min-width:100px"><label for="bGender">성별</label><select class="hr-select" id="bGender">${sel(['남','여'],P.gender,'미상')}</select></div></div>
    <div class="hr-row" style="margin-top:10px">${fld('bRegion','지역',P.region)}
      <div class="hr-field fixed" style="min-width:120px"><label for="bEmp">고용 형태</label><select class="hr-select" id="bEmp">${sel(['프리랜서','정규직','법인','기타'],P.employment_type,'미상')}</select></div>
      ${fld('bAvailFrom','가용 시작일',P.avail_from,{type:'date',w:150,fixed:1})}${fld('bAvailText','가용 메모',P.avail_text)}</div>
    <div class="hr-row" style="margin-top:10px">${fld('bSummary','요약 (줄바꿈이 그대로 저장·표시됩니다)',P.summary,{area:1,rows:6})}</div>
    <div style="margin-top:12px"><button class="btn btn-primary" id="btnBasic" data-act="saveBasic">저장</button></div></div>`;
}
async function saveBasic(btn){
  const v=id=>hrQ(id).value.trim(); const name=v('bName'); hrQ('bNameErr').textContent='';
  if(!name){ hrQ('bNameErr').textContent='이름을 입력해 주세요.'; return; }
  const want={name,name_en:v('bNameEn'),birth_date:v('bBirth'),gender:v('bGender'),region:v('bRegion'),employment_type:v('bEmp'),avail_from:v('bAvailFrom'),avail_text:v('bAvailText'),summary:v('bSummary')};
  const ch={}; Object.keys(want).forEach(k=>{ if(want[k]!==String(P[k]??'')) ch[k]=want[k]; });
  if(!Object.keys(ch).length){ toast('바뀐 내용이 없습니다.'); return; }
  if('birth_date' in ch){ if(ch.birth_date){ ch.birth_precision='일'; ch.birth_source='수동'; } else { ch.birth_precision='미상'; } }
  await save(btn,()=>hrUpdate('S20',PID,ch,{readUpdatedAt:P.updated_at}));
}
function roleHtml(){
  const rows=mine('S21'); const months=Object.fromEntries(V.roles.map(r=>[r.code,r.months]));
  const have=new Set(rows.map(r=>r.role_code)); const free=CODES.role.filter(c=>!have.has(c));
  const body=rows.length?rows.map(r=>`<tr><td>${hrEsc(r.role_code)}</td><td><select class="hr-select" data-role-level="${hrEsc(r.prole_id)}" style="width:auto">${sel(CMN_LEVELS,r.level)}</select></td><td style="min-width:260px"><textarea class="hr-input" rows="3" data-role-basis="${hrEsc(r.prole_id)}" style="width:100%;resize:vertical;line-height:1.5" placeholder="수준을 정한 근거">${hrEsc(r.evidence||'')}</textarea><button class="btn btn-secondary btn-sm" data-act="saveBasis" data-prole="${hrEsc(r.prole_id)}" style="margin-top:4px">근거 저장</button></td><td class="r">${months[r.role_code]!==undefined?hrEsc(months[r.role_code])+'개월':'-'}</td></tr>`).join('')
    :'<tr><td colspan="4" class="hr-muted">등록된 역할이 없습니다.</td></tr>';
  return `<div class="card"><div class="card-title">역할 · 수준</div>
    <div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>역할</th><th>수준</th><th>판단 근거</th><th class="r">경력에서 센 경험</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="hr-help" id="roleHint" style="margin-top:6px">수준을 바꾸면 판단 근거도 함께 고쳐 주세요. 근거는 읽기 세션이 정한 이유이며 직접 수정할 수 있습니다.</div><div class="hr-err" id="basisErr"></div>
    <div class="hr-row" style="margin-top:10px"><div class="hr-field fixed" style="min-width:140px"><label for="rAdd">역할 추가</label><select class="hr-select" id="rAdd">${sel(free,'', '선택')}</select></div>
      <div class="hr-field fixed" style="min-width:100px"><label for="rLevel">수준</label><select class="hr-select" id="rLevel">${sel(CMN_LEVELS,'가능')}</select></div>
      <button class="btn btn-secondary" data-act="addRole">추가</button></div><div class="hr-err" id="rAddErr"></div></div>`;
}
async function addRole(btn){
  const code=hrQ('rAdd').value; hrQ('rAddErr').textContent=''; if(!code){ hrQ('rAddErr').textContent='추가할 역할을 선택해 주세요.'; return; }
  await save(btn,()=>hrAppend('S21',{person_id:PID,role_code:code,level:hrQ('rLevel').value,evidence:'수동 등록'}));
}
async function saveBasis(btn){
  const row=D.S21.find(r=>r.prole_id===btn.dataset.prole); if(!row) return; const ta=document.querySelector(`[data-role-basis="${btn.dataset.prole}"]`); const nv=ta.value.trim();
  hrQ('basisErr').textContent=''; if(nv===String(row.evidence||'').trim()){ toast('바뀐 내용이 없습니다.'); return; }
  await save(btn,()=>hrUpdate('S21',row.prole_id,{evidence:nv},{readUpdatedAt:row.updated_at}));
}
async function setRoleLevel(selEl){
  const row=D.S21.find(r=>r.prole_id===selEl.dataset.roleLevel); if(!row||row.level===selEl.value) return;
  selEl.disabled=true; const r=await hrUpdate('S21',row.prole_id,{level:selEl.value},{readUpdatedAt:row.updated_at}); selEl.disabled=false;
  if(say(r)) await reload(); else await reload();
}
function gradeHtml(){
  const est=cmnGradeEstimate(mine('S23'),mine('S24'),RULE,ASOF); const known=[...new Set([est.grade,V.gradeReported,V.grade].filter(g=>GRADES.includes(g)))]; const diff=known.length>1;
  return `<div class="card"><div class="card-title"><span>등급</span>${diff?'<span class="hr-badge red" id="gradeDiff">검토 필요</span>':''}</div>
    <div class="hr-row"><div class="hr-field"><div class="hr-lbl">추정 등급 <span class="hr-sub">(저장하지 않는 참고 값)</span></div><div id="gradeEst" style="font-weight:700">${hrEsc(est.grade)}</div>
      <div class="hr-sub">${est.basis.length?est.basis.map(hrEsc).join('<br>'):hrEsc(est.note)}</div></div>
      <div class="hr-field"><div class="hr-lbl">이력서 기재 등급</div><div id="gradeRep" style="font-weight:700">${hrEsc(V.gradeReported||'-')}</div></div>
      <div class="hr-field fixed" style="min-width:140px"><label for="gFinal">HFC 판단 등급</label><select class="hr-select" id="gFinal">${sel(GRADES,V.grade,'미정')}</select></div>
      <button class="btn btn-primary" data-act="saveGrade">저장</button></div></div>`;
}
async function saveGrade(btn){
  const g=hrQ('gFinal').value; if(g===String(P.grade??'')){ toast('바뀐 내용이 없습니다.'); return; }
  await save(btn,async()=>{ const r=await hrUpdate('S20',PID,{grade:g},{readUpdatedAt:P.updated_at}); if(r.ok) await cmnPersonReviewClear(PID); return r; });
}
function manualHtml(){
  const y=V.years;
  return `<div class="card"><div class="card-title">경력 연차</div>
    <div class="hr-sub" style="margin-bottom:8px">이력서 기준 ${hrEsc(y.auto_years)}년(회사 ${hrEsc(Math.round(y.company_months/12*10)/10)}년 · 프로젝트 ${hrEsc(Math.round(y.project_months/12*10)/10)}년, 겹치는 기간은 한 번만 셈)${y.hasDateIssue?' · 기간 오류 줄은 제외':''}</div>
    <div class="hr-row">${fld('mYears','수기 연차 (년)',P.career_years_manual,{inputmode:'decimal',w:120,fixed:1,ph:'비우면 이력서 기준'})}${fld('mNote','수기 입력 사유',P.career_manual_note)}
      <button class="btn btn-primary" data-act="saveManual">저장</button></div>
    <div class="hr-sub" style="margin-top:6px">${P.career_manual_at?`수기 입력일 ${hrEsc(P.career_manual_at)}`:'수기 연차를 넣으면 목록·검색에서 이 값을 씁니다.'}</div></div>`;
}
async function saveManual(btn){
  const t=hrQ('mYears').value.trim(), note=hrQ('mNote').value.trim(); hrQ('mYearsErr').textContent='';
  if(t!==''&&(isNaN(parseFloat(t))||parseFloat(t)<0||parseFloat(t)>60)){ hrQ('mYearsErr').textContent='0~60 사이의 숫자로 입력해 주세요.'; return; }
  const ch={}; if(t!==String(P.career_years_manual??'')) ch.career_years_manual=t; if(note!==String(P.career_manual_note??'')) ch.career_manual_note=note;
  if(!Object.keys(ch).length){ toast('바뀐 내용이 없습니다.'); return; }
  ch.career_manual_at=t===''?'':ASOF;
  await save(btn,()=>hrUpdate('S20',PID,ch,{readUpdatedAt:P.updated_at}));
}
// 연락처 — 값은 "연락처 보기"를 눌렀을 때만 읽는다(화면을 열 때는 읽지 않음)
function contactHtml(){
  if(!contactState) return `<div class="card"><div class="card-title">연락처</div><button class="btn btn-secondary" data-act="showContact">연락처 보기</button></div>`;
  if(contactState.fail) return `<div class="card"><div class="card-title">연락처</div><div class="hr-notice err">${hrEsc(contactState.fail)}</div></div>`;
  const c=contactState.row||{}; const has=!!(String(c.mobile||'').trim()||String(c.email||'').trim());
  return `<div class="card"><div class="card-title">연락처</div>${has?'':'<div class="hr-sub" id="noContact" style="margin-bottom:8px">아직 확보되지 않았습니다.</div>'}
    <div class="hr-row">${fld('cMobile','휴대전화',c.mobile)}${fld('cEmail','이메일',c.email)}
      <div class="hr-field fixed" style="min-width:150px"><label for="cSource">확보 경로</label><select class="hr-select" id="cSource">${sel(['서치업체','후보 본인','이력서 기재'],c.contact_source,'선택')}</select></div>
      <button class="btn btn-primary" data-act="saveContact">저장</button></div></div>`;
}
function bindContact(){}
async function showContact(btn){
  await hrBusy(btn,async()=>{ const r=await hrReadMany(['S39']); if(r.failed.length){ contactState={fail:HR_MSG.read(HR_TABS.S39.tab)}; }
    else contactState={row:r.tabs.S39.rows.find(x=>x.person_id===PID)||null}; render(); });
}
async function saveContact(btn){
  const row=contactState&&contactState.row; const m=hrQ('cMobile').value.trim(), e=hrQ('cEmail').value.trim(), s=hrQ('cSource').value;
  const want={mobile:m,email:e,contact_source:s}; const ch={};
  Object.keys(want).forEach(k=>{ if(want[k]!==String((row&&row[k])??'')) ch[k]=want[k]; });
  if(!Object.keys(ch).length){ toast('바뀐 내용이 없습니다.'); return; }
  if((m||e)&&!(row&&String(row.contact_acquired_at||'').trim())) ch.contact_acquired_at=ASOF;
  await hrBusy(btn,async()=>{
    const r=row?await hrUpdate('S39',PID,ch,{readUpdatedAt:row.updated_at}):await hrAppend('S39',{person_id:PID,...ch});
    if(!say(r)) { if(r&&r.code==='CONFLICT') await showContact({disabled:false}); return; }
    const x=await hrReadMany(['S39']); contactState=x.failed.length?{fail:HR_MSG.read(HR_TABS.S39.tab)}:{row:x.tabs.S39.rows.find(z=>z.person_id===PID)||null}; render();
  });
}
function ratingHtml(){
  const hist=mine('S29').slice().sort((a,b)=>String(b.rated_at||'').localeCompare(String(a.rated_at||''))||String(b.rating_id).localeCompare(String(a.rating_id)));
  const cls={화이트:'green',블랙:'red',일반:'gray'};
  return `<div class="card"><div class="card-title"><span>구분 (화이트 / 일반 / 블랙)</span><span class="hr-badge ${cls[V.rating.flag]||'gray'}">현재 ${hrEsc(V.rating.flag)}</span></div>
    <div class="hr-row"><div class="hr-field fixed" style="min-width:120px"><label for="tFlag">구분</label><select class="hr-select" id="tFlag">${sel(['화이트','일반','블랙'],V.rating.flag)}</select></div>
      ${fld('tReason','사유 (화이트·블랙은 필수)','')}<button class="btn btn-primary" data-act="saveRating">기록</button></div>
    <div class="hr-sub" style="margin:10px 0 4px">변경 이력 (이력은 지우지 않고 쌓입니다)</div>
    ${hist.length?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>일자</th><th>구분</th><th>사유</th></tr></thead><tbody>${hist.map(h=>`<tr><td>${hrEsc(h.rated_at)}</td><td>${hrEsc(h.flag)}</td><td>${hrEsc(h.reason||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="hr-muted">기록이 없습니다. (기본 일반)</div>'}</div>`;
}
async function saveRating(btn){
  const f=hrQ('tFlag').value, why=hrQ('tReason').value.trim(); hrQ('tReasonErr').textContent='';
  if(f===V.rating.flag&&!why){ toast('바뀐 내용이 없습니다.'); return; }
  if(f!=='일반'&&!why){ hrQ('tReasonErr').textContent='사유를 입력해 주세요.'; return; }
  await save(btn,()=>hrAppend('S29',{person_id:PID,flag:f,reason:why,rated_at:ASOF}));
}

// ── 변경 검토(SCR-06·08·10 공통 처리 함수 cmnReview* 사용) ───────────────────────
function reviewHtml(){
  const items=cmnReviewItems(mine('S23'));
  if(!items.length) return `<div class="card"><div class="card-title">변경 검토</div><div class="hr-muted" id="noReview">검토할 변경이 없습니다.</div></div>`;
  const body=items.map(it=>it.raw
    ?`<tr data-rv="${hrEsc(it.career_id)}"><td>${hrEsc(it.lineLabel)}</td><td colspan="3" class="hr-muted">${hrEsc(CMN_REVIEW_MSG.raw)}</td><td><button class="btn btn-secondary btn-sm" data-act="rvDismiss" data-car="${hrEsc(it.career_id)}">확인 완료</button></td></tr>`
    :`<tr data-rv="${hrEsc(it.career_id)}" data-field="${hrEsc(it.field)}"><td>${hrEsc(it.lineLabel)}<div class="hr-sub">${hrEsc(it.fieldLabel)}</div></td><td>${hrEsc(it.current||'-')}${it.hasEdit?' <span class="hr-badge gray">수정본</span>':''}</td><td>${hrEsc(it.prev||'-')}</td><td>${hrEsc(it.next||'-')}</td>
      <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="current">현재 값 유지</button>
      ${it.hasEdit?`<button class="btn btn-secondary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="prev">이전 이력서 값</button>`:''}
      <button class="btn btn-primary btn-sm" data-act="rvApply" data-car="${hrEsc(it.career_id)}" data-f="${hrEsc(it.field)}" data-c="next">새 이력서 값</button></td></tr>`).join('');
  return `<div class="card"><div class="card-title"><span>변경 검토 <span class="hr-badge red">${items.length}건</span></span><span class="hr-sub">새 이력서에서 달라진 항목입니다. 하나씩 고르세요.</span></div>
    <div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>경력 줄</th><th>현재 값</th><th>이전 이력서 값</th><th>새 이력서 값</th><th></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}
async function rvApply(btn){
  const row=D.S23.find(c=>c.career_id===btn.dataset.car); if(!row) return;
  await hrBusy(btn,async()=>{ const r=await cmnReviewApply(row,btn.dataset.f,btn.dataset.c);
    if(r.ok){ await cmnPersonReviewClear(PID); toast('처리했습니다.'); } else toast(r.message||hrSaveFailText(r),true); await reload(); });
}
async function rvDismiss(btn){
  const row=D.S23.find(c=>c.career_id===btn.dataset.car); if(!row) return;
  await hrBusy(btn,async()=>{ const r=await cmnReviewDismiss(row); if(r.ok){ await cmnPersonReviewClear(PID); toast('처리했습니다.'); } else toast(hrSaveFailText(r),true); await reload(); });
}

// ── 경력(SCR-08) ─────────────────────────────────────────────────────────────
const fmtMon=m=>m===null||m===undefined?'미상':m+'개월';
function careerHtml(){
  const cs=mine('S23'), y=V.years, st=V.short, th=settingsOf(D.S10).short_tenure_months||3;
  const sum=`<div class="card"><div class="card-title">경력 요약</div><div class="hr-row" style="gap:18px;flex-wrap:wrap">
    <div>회사 재직 <b>${hrEsc(Math.round(y.company_months/12*10)/10)}년</b> <span class="hr-sub">(${y.company_months}개월)</span></div>
    <div>프로젝트 <b>${hrEsc(Math.round(y.project_months/12*10)/10)}년</b> <span class="hr-sub">(${y.project_months}개월)</span></div>
    <div>합계(겹침 제외) <b>${hrEsc(y.auto_years)}년</b></div>
    <div>적용 연차 <b id="appliedYears">${hrEsc(y.applied.years)}년</b>${y.applied.basis==='manual'?' <span class="hr-badge gray">수기</span>':''}</div></div>
    <div class="hr-sub" style="margin-top:8px" id="shortSum">단기 이력(${th}개월 이하, 정상종료 제외): ${st.count}건 · 비율 ${Math.round(st.ratio*100)}% · 평균 ${st.avg_months}개월 · 최단 ${st.items.length?Math.min(...st.items.map(i=>i.months)):'-'}${st.items.length?'개월':''}${st.unknown?` · 기간을 알 수 없는 ${st.unknown}건은 제외`:''}</div>
    ${y.unknown.length||y.invalid.length?'<div><span class="hr-badge amber">일부 경력 생략 가능</span> <span class="hr-sub">기간을 알 수 없거나 오류인 줄은 연차에서 제외되었습니다.</span></div>':''}</div>`;
  const comp=cs.filter(c=>c.kind==='회사재직').sort((a,b)=>String(b.start_ym).localeCompare(String(a.start_ym)));
  const proj=cs.filter(c=>c.kind==='프로젝트').sort((a,b)=>String(b.start_ym).localeCompare(String(a.start_ym)));
  const compT=comp.length?`<div class="hr-scroll"><table class="hr-table auto" style="min-width:640px"><thead><tr><th>회사</th><th>기간</th><th class="r">개월</th><th>업무</th><th>종료 구분</th></tr></thead><tbody>${comp.map(c=>`<tr data-car="${hrEsc(c.career_id)}"><td>${hrEsc(c.employer||'-')}</td><td>${hrEsc(periodOf(c))}</td><td class="r">${hrEsc(fmtMon(cmnTenureMonths(c,ASOF)))}</td><td>${hrEsc(c.tasks||'-')}</td><td>${exitSel(c)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="hr-muted">회사 재직 이력이 없습니다.</div>';
  const projT=proj.length?`<div class="hr-scroll"><table class="hr-table auto" style="min-width:1100px"><thead><tr><th>고객사</th><th>프로젝트명</th><th>소속</th><th>업종·유형</th><th>역할</th><th>기술</th><th>기간</th><th class="r">개월</th><th>종료 구분</th><th>표시</th><th></th></tr></thead><tbody>${proj.map(c=>projRow(c,st)).join('')}</tbody></table></div>`:'<div class="hr-muted">프로젝트 이력이 없습니다.</div>';
  const skills=mine('S22'), certs=mine('S24');
  const extra=`<div class="card"><div class="card-title">기술</div>${skills.length?skills.map(s=>`<span class="hr-badge gray">${hrEsc(s.skill_name)}${s.level?' · '+hrEsc(s.level):''}</span>`).join(' '):'<span class="hr-muted">등록된 기술이 없습니다.</span>'}</div>
    <div class="card"><div class="card-title">학력 · 자격 · 교육</div>${certs.length?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>구분</th><th>이름</th><th>기관</th><th>일자</th></tr></thead><tbody>${certs.map(c=>`<tr><td>${hrEsc(c.kind)}</td><td>${hrEsc(c.name)}</td><td>${hrEsc(c.org||'-')}</td><td>${hrEsc(c.cert_date||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<span class="hr-muted">등록된 학력·자격이 없습니다.</span>'}</div>`;
  return reviewHtml()+sum+`<div class="card"><div class="card-title">회사 재직</div>${compT}</div><div class="card"><div class="card-title">프로젝트</div>${projT}${editHtml()}</div>`+extra;
}
const periodOf=c=>cmnYm(c.start_ym)===null&&!c.start_ym?(c.duration_text||'기간 미상'):`${c.start_ym||'?'} ~ ${cmnYes(c.is_current)?'진행 중':(c.end_ym||'?')}`;
function exitSel(c){ return `<select class="hr-select" data-exit="${hrEsc(c.career_id)}" style="width:auto">${sel(['정상종료','중도이탈','사유불명'],c.exit_reason,'미입력')}</select>`; }
function projRow(c,st){
  const isShort=st.items.some(i=>i.career_id===c.career_id); const orig=cmnParseJson(c.orig_json)||{}; const edited=!!c.edited_at||cmnLineEdited(c,orig);
  const pend=String(c.review_state??'').trim()==='검토필요';
  const party=c.client_party_id&&PM.get(c.client_party_id)?`<a href="party.html" title="거래처">${hrEsc(PM.get(c.client_party_id).name)}</a>`:hrEsc(c.client_name||'-');
  const roles=cmnSplit(c.role_codes); const m=cmnTenureMonths(c,ASOF);
  return `<tr data-car="${hrEsc(c.career_id)}"><td>${party}</td><td>${hrEsc(c.project_name||'-')}</td><td>${hrEsc(c.employer||'-')}</td><td>${hrEsc([c.industry,c.project_type].filter(Boolean).join(' · ')||'-')}</td>
    <td>${hrEsc(roles.join(', ')||c.role_text||'-')}${roles.length>1?' <span class="hr-badge blue">겸임</span>':''}</td><td>${hrEsc(c.tech||'-')}</td><td>${hrEsc(periodOf(c))}</td><td class="r">${hrEsc(fmtMon(m))}</td><td>${exitSel(c)}</td>
    <td>${isShort?'<span class="hr-badge amber">단기</span> ':''}${edited?'<span class="hr-badge gray" data-edited="1">수정됨</span> ':''}${pend?'<span class="hr-badge red">검토 필요</span>':''}</td>
    <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-act="editCar" data-car="${hrEsc(c.career_id)}">수정</button>${edited&&c.orig_json?` <button class="btn btn-secondary btn-sm" data-act="revertCar" data-car="${hrEsc(c.career_id)}">이력서 값으로</button>`:''}</td></tr>`;
}
function editHtml(){
  const c=editCar&&D.S23.find(x=>x.career_id===editCar); if(!c) return '';
  const f=(id,l,v,o)=>fld('e'+id,l,v,o||{});
  return `<div class="card" id="editBox" style="margin-top:12px;border-color:var(--blue)"><div class="card-title">경력 줄 수정 <span class="hr-sub">${hrEsc(c.career_id)}</span></div>
    <div class="hr-row">${f('Employer','회사',c.employer)}${f('Client','고객사',c.client_name)}${f('Project','프로젝트명',c.project_name)}</div>
    <div class="hr-row" style="margin-top:10px"><div class="hr-field"><label for="eIndustry">업종</label><select class="hr-select" id="eIndustry">${sel(CODES.industry.includes(c.industry)||!c.industry?CODES.industry:[...CODES.industry,c.industry],c.industry,'미입력')}</select></div>
      ${f('Type','프로젝트 유형 (쉼표로 구분)',c.project_type)}${f('RoleCodes','역할 (쉼표로 구분)',c.role_codes)}${f('RoleText','역할 원문',c.role_text)}</div>
    <div class="hr-row" style="margin-top:10px">${f('Start','시작 월 (YYYY-MM)',c.start_ym,{w:130,fixed:1})}${f('End','종료 월 (YYYY-MM)',c.end_ym,{w:130,fixed:1})}
      <div class="hr-field fixed" style="min-width:110px"><label for="eCurrent">진행 중</label><select class="hr-select" id="eCurrent"><option value="N">아니오</option><option value="Y"${cmnYes(c.is_current)?' selected':''}>예</option></select></div>
      ${f('DurText','기간 표기 (원문)',c.duration_text)}</div>
    <div class="hr-row" style="margin-top:10px">${f('Tasks','담당 업무',c.tasks)}${f('Env','환경',c.env)}${f('Tech','기술',c.tech)}</div>
    <div style="margin-top:12px"><button class="btn btn-primary" data-act="saveCar" data-car="${hrEsc(c.career_id)}">저장</button> <button class="btn btn-secondary" data-act="cancelEdit">닫기</button></div></div>`;
}
const YM=/^\d{4}-(0[1-9]|1[0-2])$/;
async function saveCar(btn){
  const c=D.S23.find(x=>x.career_id===btn.dataset.car); if(!c) return; const v=id=>hrQ('e'+id).value.trim();
  ['Start','End'].forEach(k=>hrQ('e'+k+'Err').textContent='');
  const s=v('Start'), e=v('End'), cur=hrQ('eCurrent').value; let bad=false;
  if(s&&!YM.test(s)){ hrQ('eStartErr').textContent='시작 월은 YYYY-MM 형식으로 입력해 주세요.'; bad=true; }
  if(e&&!YM.test(e)){ hrQ('eEndErr').textContent='종료 월은 YYYY-MM 형식으로 입력해 주세요.'; bad=true; }
  if(!bad&&s&&e&&cur!=='Y'&&e<s){ hrQ('eEndErr').textContent='종료 월이 시작 월보다 앞입니다.'; bad=true; }
  if(bad) return;
  const vals={employer:v('Employer'),client_name:v('Client'),project_name:v('Project'),industry:hrQ('eIndustry').value,project_type:v('Type'),role_codes:v('RoleCodes'),role_text:v('RoleText'),start_ym:s,end_ym:cur==='Y'?'':e,is_current:(cur==='N'&&!String(c.is_current??'').trim())?'':cur,duration_text:v('DurText'),tasks:v('Tasks'),env:v('Env'),tech:v('Tech')};
  await hrBusy(btn,async()=>{ const r=await cmnLineSave(c,vals); if(r.unchanged){ toast('바뀐 내용이 없습니다.'); return; } if(say(r)){ editCar=''; await reload(); } else if(r.code==='CONFLICT') await reload(); });
}
async function setExit(selEl){
  const c=D.S23.find(x=>x.career_id===selEl.dataset.exit); if(!c||!selEl.value||c.exit_reason===selEl.value) return;
  selEl.disabled=true; const r=await cmnLineSave(c,{exit_reason:selEl.value}); say(r); await reload();
}
async function revertCar(btn){
  const c=D.S23.find(x=>x.career_id===btn.dataset.car); if(!c) return;
  if(!confirm('이력서에서 읽은 원래 값으로 되돌립니다. 직접 수정한 내용은 사라집니다. 진행할까요?')) return;
  await hrBusy(btn,async()=>{ const r=await cmnLineRevert(c); if(say(r,'이력서 값으로 되돌렸습니다.')) await reload(); else if(r.code==='CONFLICT') await reload(); });
}

// ── 의뢰·경로·이력서(SCR-10) ─────────────────────────────────────────────────
function routeHtml(){
  const cands=mine('S31'), lines=hrMap(D.S33,'line_id'), reqs=hrMap(D.S32,'request_id'), files=mine('S28');
  const reqOf=c=>{ const l=lines.get(c.line_id); return l?reqs.get(l.request_id):null; };
  const viaByReq=new Map(); cands.forEach(c=>{ const r=reqOf(c); if(!r||!c.via_party_id) return; if(!viaByReq.has(r.request_id)) viaByReq.set(r.request_id,new Set()); viaByReq.get(r.request_id).add(c.via_party_id); });
  const dupReq=new Set([...viaByReq].filter(([,s])=>s.size>1).map(([k])=>k));
  const reqRows=cands.length?`<div class="hr-scroll"><table class="hr-table auto" style="min-width:640px"><thead><tr><th>의뢰</th><th>역할</th><th>경유</th><th>단계</th><th>표시</th></tr></thead><tbody>${cands.map(c=>{ const r=reqOf(c); const l=lines.get(c.line_id);
    return `<tr data-cand="${hrEsc(c.cand_id)}"><td>${r?`<a href="request-detail.html?id=${encodeURIComponent(r.request_id)}">${hrEsc(r.alias||r.request_id)}</a> <span class="hr-sub">${hrEsc(r.request_id)}</span>`:hrEsc(c.line_id||'-')}</td><td>${hrEsc(l?l.role_codes:'-')}</td><td>${hrEsc(c.via_party_id?hrPartyName(PM,c.via_party_id):'-')}</td><td>${hrEsc(c.stage||'-')}</td><td>${r&&dupReq.has(r.request_id)?'<span class="hr-badge amber">중복 추천</span>':''}</td></tr>`; }).join('')}</tbody></table></div>`
    :'<div class="hr-muted" id="noCand">아직 추천된 의뢰가 없습니다.</div>';
  const routes=[]; files.forEach(f=>{ if(f.source_party_id) routes.push({d:f.received_at||'',p:f.source_party_id,t:'이력서 수령'}); });
  cands.forEach(c=>{ if(c.via_party_id){ const r=reqOf(c); routes.push({d:c.created_at||'',p:c.via_party_id,t:'추천'+(r?` · ${r.alias||r.request_id}`:'')}); } });
  routes.sort((a,b)=>String(b.d).localeCompare(String(a.d)));
  const routeT=routes.length?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>일자</th><th>경로</th><th>내용</th></tr></thead><tbody>${routes.map(r=>`<tr><td>${hrEsc(r.d||'-')}</td><td>${hrEsc(hrPartyLabel(PM,r.p))}</td><td>${hrEsc(r.t)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="hr-muted">경로 이력이 없습니다.</div>';
  const fs=files.slice().sort((a,b)=>(parseInt(b.version_no)||0)-(parseInt(a.version_no)||0)||String(b.received_at||'').localeCompare(String(a.received_at||'')));
  const fileT=fs.length?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>버전</th><th>파일</th><th>받은 날</th><th>경로</th><th>상태</th><th></th></tr></thead><tbody>${fs.map((f,i)=>`<tr data-file="${hrEsc(f.file_id)}"><td>v${hrEsc(f.version_no||'?')} ${i===0?'<span class="hr-badge blue">기준 이력서</span>':''}</td><td>${hrEsc(f.file_name||f.file_id)}</td><td>${hrEsc(f.received_at||'-')}</td><td>${hrEsc(f.source_party_id?hrPartyLabel(PM,f.source_party_id):'-')}</td><td>${hrEsc(f.parse_status||'-')}</td>
    <td>${/^https:\/\//.test(String(f.drive_url||''))?`<a href="${hrEsc(f.drive_url)}" target="_blank" rel="noopener">열기</a>`:'<span class="hr-sub" data-nolink="1">파일을 열 수 없습니다. 보관 위치를 확인해 주세요.</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="hr-muted">등록된 이력서가 없습니다.</div>';
  return `<div class="card"><div class="card-title">의뢰 참여</div>${reqRows}</div><div class="card"><div class="card-title">경로 이력</div>${routeT}</div><div class="card"><div class="card-title">이력서 버전</div>${fileT}</div>`+reviewHtml();
}

// ── 이벤트 ───────────────────────────────────────────────────────────────────
const ACT={saveBasic,saveBasis,addRole,saveGrade,saveManual,showContact,saveContact,saveRating,rvApply,rvDismiss,saveCar,revertCar,
  editCar:b=>{ editCar=b.dataset.car; render(); const e=hrQ('editBox'); if(e&&e.scrollIntoView) e.scrollIntoView({block:'center'}); },cancelEdit:()=>{ editCar=''; render(); }};
document.addEventListener('click',ev=>{
  const t=ev.target.closest('[data-tab]'); if(t&&t.closest('#tabs')){ if(t.classList.contains('disabled')) return; tab=t.dataset.tab; editCar=''; render(); return; }
  const a=ev.target.closest('[data-act]'); if(a&&ACT[a.dataset.act]) ACT[a.dataset.act](a);
});
document.addEventListener('change',ev=>{
  const e=ev.target; if(e.dataset.roleLevel) setRoleLevel(e); else if(e.dataset.exit) setExit(e);
});
window.addEventListener('load',loadAll);
