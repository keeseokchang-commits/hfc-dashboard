// HFC scr-cand-add.js v2.9.89 — STF-SCR-03 후보 선택·적합 평가 (candidate-add.html?line=LN-0001, 의뢰 상세 ⑤에서 연다)
// 근거: 프로그램 설계서 §6(SCR-03). 후보자 관리에 등록된 사람만 고르고, 의뢰 라인 조건과 후보 이력을 항목별로 대조(cmn-fit.js)해 적합 평가를 확정한 뒤 "이 의뢰에 후보로 등록".
// 쓰는 탭: S31(추가) · S38(추가) · S39(연락처 입력 때 추가·수정) / 읽기: S20~S25, S26, S27, S28, S29, S32, S33, S34, S10
// 정한 것(2026-10-15):
//   · 화면은 의뢰 상세와 별도 페이지(주소의 line=라인 번호)로 연다. 등록하면 성공 안내와 "의뢰 상세로 / 다른 후보 추가" 버튼을 보여 준다(자동 이동 없음).
//   · 검색 조건 미리 채움 = 라인의 역할·등급("이 등급 이상")·필수 기술(하나라도)·연령. 업종·유형·가용일은 비워 둔다. 블랙 제외가 기본.
//   · 나이·등급을 모르는 후보는 걸러내지 않고 "미정/미상"으로 보여 준다. 정렬은 설계서 R1: 역할 수준 → 가용 시기 → 경력 연차.
//   · 경로 선택지 = 이 의뢰로 발송한 업체 + 직접·내부(PTY-001·002). 선택하면 같은 라인·업체의 발송 기록(S34)을 order_id 로 연결한다.
//   · 시작 단계는 '추천수령'(단계 8개 중 첫째). S31 을 추가한 뒤 S38 한 줄(단계일 = 추천 수령일)을 추가한다. 둘째가 실패하면 알리고 의뢰 상세에서 확인하게 한다.
//   · 등록 때 적합 평가는 '확정'(fit_state)으로 저장한다. 대조표는 제안일 뿐이며 사용자가 적합도·경험 항목을 직접 고른다.
//   · 같은 (라인, 후보, 경로)는 등록을 거부하고, 같은 라인에 다른 경로로 이미 있으면 중복 추천 경고만 한다(설계서 §6.7·SCR-02 R2).
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-alert.js, cmn-person.js, cmn-fit.js, cmn-prompt.js, hr-ui.js
const KEYS=['S20','S21','S22','S23','S24','S25','S26','S27','S28','S29','S31','S32','S33','S34','S10'];
const START_STAGE=ST.STAGE8[0];
const RATE_MAX_MAN=5000;
const MSG={none:'조건에 맞는 후보가 없습니다. 조건을 넓히거나 이력서를 먼저 등록해 주세요.',dup:'이미 이 라인에 같은 경로로 등록된 후보입니다.',black:'블랙 구분 후보입니다. 그래도 등록하시겠습니까?'};
const GRADES=['특급','고급','중급','초급'];
let D={}, LINE=null, REQ=null, VIEWS=[], PM=new Map(), ASOF='', CODES={industry:[],project_type:[]}, PROMPT_TPL='', SEL=null, roleSel=new Set(), shown=50, SKILLS=new Map(), CAREERS=new Map(), done=null, askText=null;
const q=hrQ;
const sel$=(items,cur,blank)=>(blank!==undefined?`<option value="">${hrEsc(blank)}</option>`:'')+items.map(x=>`<option${x===cur?' selected':''}>${hrEsc(x)}</option>`).join('');
const F=(id,label,html,req)=>`<div class="hr-field"><label for="${id}"${req?' class="hr-req"':''}>${hrEsc(label)}</label>${html}<div class="hr-err" id="${id}Err"></div></div>`;
const settingsOf=rows=>{ const o={}; (rows||[]).forEach(r=>{ const v=parseInt(r.setting_value,10); if(['short_tenure_months','exit_alert_days','reconfirm_days'].includes(r.setting_key)&&!isNaN(v)) o[r.setting_key]=v; }); return o; };

// ── 읽기 ────────────────────────────────────────────────────────────────────
async function loadAll(){
  const box=q('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const lid=new URLSearchParams(location.search).get('line')||'';
  const r=await hrLoadScreen(KEYS);
  if(r.state!=='ok'){ q('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  D=r.data; ASOF=hrToday(); PM=hrMap(D.S27,'party_id');
  LINE=D.S33.find(l=>l.line_id===lid)||null; REQ=LINE?D.S32.find(x=>x.request_id===LINE.request_id)||null:null;
  if(!LINE||!REQ){ q('screen').style.display='none'; box.innerHTML='<div class="hr-notice err">해당 요청 라인을 찾을 수 없습니다. <a href="request.html" style="color:inherit;font-weight:600">의뢰 대장으로 돌아가기</a></div>'; return; }
  if(cmnYes(LINE.is_cancelled)){ q('screen').style.display='none'; box.innerHTML='<div class="hr-notice warn">취소된 라인에는 후보를 등록할 수 없습니다. <a href="request-detail.html?id='+encodeURIComponent(REQ.request_id)+'" style="color:inherit;font-weight:600">의뢰 상세로</a></div>'; return; }
  box.innerHTML=''; q('screen').style.display='';
  CODES={industry:[],project_type:[]}; PROMPT_TPL='';
  D.S10.forEach(s=>{ const cat=String(s.category??'').trim(), key=String(s.setting_key??'').trim(); if(CODES[cat]&&key) CODES[cat].push(key); else if(cat===S10_HR_SETTING_CAT&&key==='claude_prompt_template') PROMPT_TPL=String(s.setting_value??''); });
  q('btnBack').href='request-detail.html?id='+encodeURIComponent(REQ.request_id);
  q('title').innerHTML=`${hrEsc(REQ.alias||REQ.request_id)} <span class="hr-sub">${hrEsc(REQ.request_id)}</span>`;
  q('lineInfo').textContent=`요청 라인 ${LINE.line_no||''} · ${hrSplit(LINE.role_codes).join('·')||'(역할 없음)'} ${LINE.grade||''} ${LINE.headcount||''}명${LINE.must_skills?' · 필수 '+LINE.must_skills:''}`;
  VIEWS=build(); fillSelects(); if(!q('fSearch').dataset.init){ resetFilters(); q('fSearch').dataset.init='1'; }
  render();
}
function build(){
  const views=cmnPersonViews({persons:D.S20,roles:D.S21,skills:D.S22,careers:D.S23,assigns:D.S25,files:D.S28,ratings:D.S29,cands:D.S31,contacts:D.S26},ASOF,settingsOf(D.S10),null);
  SKILLS=cmnGroup(D.S22,'person_id'); CAREERS=cmnGroup(D.S23,'person_id');
  return Object.values(views).map(v=>{ const cs=CAREERS.get(v.id)||[]; v.inds=new Set(cs.map(c=>c.industry).filter(Boolean)); v.types=new Set(cs.flatMap(c=>cmnSplit(c.project_type)));
    v.skillSet=new Set([...(SKILLS.get(v.id)||[]).map(s=>String(s.skill_name||'').toLowerCase()),...cs.flatMap(c=>cmnSplit(c.tech).map(x=>x.toLowerCase()))]); return v; });
}
function fillSelects(){
  const keep=['fInd','fType'].map(i=>q(i).value);
  q('fGrade').innerHTML='<option value="">전체</option>'+GRADES.map(g=>`<option value="${g}">${g} 이상</option>`).join('');
  const inds=[...new Set([...CODES.industry,...VIEWS.flatMap(v=>[...v.inds])])].sort((a,b)=>a.localeCompare(b,'ko')), tys=[...new Set([...CODES.project_type,...VIEWS.flatMap(v=>[...v.types])])].sort((a,b)=>a.localeCompare(b,'ko'));
  q('fInd').innerHTML='<option value="">전체</option>'+inds.map(x=>`<option>${hrEsc(x)}</option>`).join(''); q('fType').innerHTML='<option value="">전체</option>'+tys.map(x=>`<option>${hrEsc(x)}</option>`).join('');
  ['fInd','fType'].forEach((i,n)=>{ q(i).value=keep[n]; });
}
// 라인 조건으로 검색 조건을 채운다 (역할·등급·필수 기술·연령)
function resetFilters(){
  roleSel=new Set(hrSplit(LINE.role_codes)); q('fSearch').value=''; q('fGrade').value=GRADES.includes(LINE.grade)?LINE.grade:''; q('fSkills').value=hrSplit(LINE.must_skills).join(', ');
  q('fAgeMin').value=LINE.age_min||''; q('fAgeMax').value=LINE.age_max||''; q('fAvail').value=''; q('fInd').value=''; q('fType').value=''; q('fRoleMode').value='any'; q('fMulti').checked=false; q('fNoBlack').checked=true; shown=50;
}

// ── 검색 ────────────────────────────────────────────────────────────────────
const numOf=id=>{ const t=q(id).value.trim(); if(t==='') return null; const n=parseInt(t,10); return isNaN(n)?null:n; };
function filtered(){
  const text=q('fSearch').value.trim().toLowerCase(), g=q('fGrade').value, mode=q('fRoleMode').value, multi=q('fMulti').checked, noBlack=q('fNoBlack').checked;
  const skills=hrSplit(q('fSkills').value).map(s=>s.toLowerCase()), a1=numOf('fAgeMin'), a2=numOf('fAgeMax'), av=q('fAvail').value, ind=q('fInd').value, ty=q('fType').value;
  const list=VIEWS.filter(v=>{
    if(noBlack&&v.rating.flag==='블랙') return false;
    if(text&&!v.search.includes(text)) return false;
    if(g){ const h=GRADES.indexOf(v.grade||v.gradeReported); if(h>=0&&h>GRADES.indexOf(g)) return false; }
    if(roleSel.size){ const have=new Set(v.roles.map(r=>r.code)); const s=[...roleSel]; if(!(mode==='all'?s.every(r=>have.has(r)):s.some(r=>have.has(r)))) return false; }
    if(multi&&!v.multi.has) return false;
    if(skills.length&&!skills.some(s=>v.skillSet.has(s))) return false;
    if(a1!==null||a2!==null){ const a=v.age; if(a.kind==='exact'){ if(a1!==null&&a.age<a1) return false; if(a2!==null&&a.age>a2) return false; } else if(a.kind==='range'){ if(a1!==null&&a.max<a1) return false; if(a2!==null&&a.min>a2) return false; } }
    if(av&&!(v.avail.date&&v.avail.date<=av)) return false;
    if(ind&&!v.inds.has(ind)) return false; if(ty&&!v.types.has(ty)) return false;
    return true; });
  const lv=r=>{ const i=CMN_LEVELS.indexOf(r); return i<0?9:i; };
  const best=v=>roleSel.size?Math.min(...v.roles.filter(r=>roleSel.has(r.code)).map(r=>lv(r.level)),9):0;
  return list.sort((a,b)=>best(a)-best(b)||String(a.avail.date||'9999').localeCompare(String(b.avail.date||'9999'))||(b.years.applied.years-a.years.applied.years)||a.name.localeCompare(b.name,'ko'));
}
const onLine=pid=>D.S31.filter(c=>c.line_id===LINE.line_id&&c.person_id===pid);
function rowHtml(v){
  const on=onLine(v.id); const g=v.grade||(v.gradeReported?v.gradeReported+'(기재)':'등급 미정');
  return `<tr data-id="${hrEsc(v.id)}"><td><b>${hrEsc(v.name)}</b><div class="hr-sub">${hrEsc(v.id)}</div></td><td>${hrEsc(v.roleLabel||'-')}<div class="hr-sub">${hrEsc(g)}</div></td><td>${hrEsc(v.skills.slice(0,4).join(', ')||'-')}</td>
    <td>${hrEsc(v.age.label||'-')}</td><td class="r">${hrEsc(v.years.applied.years)}년</td><td>${hrEsc(v.avail.text)}</td>
    <td>${v.rating.flag==='블랙'?'<span class="hr-badge red">블랙</span> ':v.rating.flag==='화이트'?'<span class="hr-badge green">화이트</span> ':''}${on.length?`<span class="hr-badge blue" data-onlist="1">이 라인에 등록됨 ${on.length}</span> `:''}${v.review?'<span class="hr-badge red">검토 필요</span>':''}</td>
    <td><button class="btn ${SEL===v.id?'btn-primary':'btn-secondary'} btn-sm" data-act="pick" data-id="${hrEsc(v.id)}">${SEL===v.id?'선택됨':'선택'}</button></td></tr>`;
}
function renderList(){
  const box=q('listBox');
  if(!VIEWS.length){ box.innerHTML=`<div class="hr-empty" id="noMatch">${MSG.none}</div>`; q('listCount').textContent=''; return; }
  const list=filtered(); q('listCount').textContent=`${list.length}명`;
  if(!list.length){ box.innerHTML=`<div class="hr-empty" id="noMatch">${MSG.none}</div>`; return; }
  const cols=[['후보',150],['역할·등급',150],['핵심 기술',200],['나이',100],['연차',60],['가용',90],['표시',200],['',80]];
  box.innerHTML=`<div class="hr-scroll"><table class="hr-table auto" style="min-width:${cols.reduce((s,c)=>s+c[1],0)}px"><thead><tr>${cols.map(([l,w],i)=>`<th class="${i===4?'r':''}" style="width:${w}px">${l}</th>`).join('')}</tr></thead><tbody>${list.slice(0,shown).map(rowHtml).join('')}</tbody></table></div>`
    +(list.length>shown?`<div style="text-align:center;margin-top:10px"><button class="btn btn-secondary" id="btnMore">더 보기 (남은 ${list.length-shown}명)</button></div>`:'');
}
function renderRoleChips(){
  const codes=[...new Set([...hrSplit(LINE.role_codes),...VIEWS.flatMap(v=>v.roles.map(r=>r.code))])].sort((a,b)=>a.localeCompare(b,'ko'));
  q('roleChips').innerHTML=codes.map(c=>`<span class="hr-chip${roleSel.has(c)?' on':''}" data-role="${hrEsc(c)}">${hrEsc(c)}</span>`).join('')||'<span class="hr-sub">등록된 역할이 없습니다.</span>';
}
function render(){ renderRoleChips(); renderList(); renderForm(); }

// ── ②③④ 추천 정보 · 적합 평가 · 연락처 ──────────────────────────────────────
const STATUS_TXT={ok:['green','맞음'],warn:['amber','확인'],bad:['red','불일치'],unknown:['gray','자료 없음'],none:['gray','조건 없음']};
function viaOptions(){
  const ids=new Set(D.S34.filter(o=>o.request_id===REQ.request_id).map(o=>o.party_id)); ['PTY-001','PTY-002'].forEach(i=>{ if(PM.has(i)) ids.add(i); });
  return [...ids].filter(i=>PM.has(i)).map(i=>({v:i,t:hrPartyLabel(PM,i)}));
}
function prevRoutes(pid){
  const lines=hrMap(D.S33,'line_id'), reqs=hrMap(D.S32,'request_id');
  return D.S31.filter(c=>c.person_id===pid&&c.line_id!==LINE.line_id).map(c=>{ const l=lines.get(c.line_id), r=l?reqs.get(l.request_id):null; return `${r?(r.alias||r.request_id):c.line_id} · ${c.via_party_id?hrPartyLabel(PM,c.via_party_id):'-'} · ${c.stage||'-'}`; });
}
function renderForm(){
  const box=q('formBox'); if(!SEL){ box.innerHTML=''; return; }
  const v=VIEWS.find(x=>x.id===SEL); if(!v){ box.innerHTML=''; return; }
  const careers=CAREERS.get(v.id)||[], skills=SKILLS.get(v.id)||[];
  const fit=cmnFitCompare({line:LINE,req:REQ,view:v,careers,skills,asOf:ASOF,parties:PM});
  const on=onLine(v.id); const prev=prevRoutes(v.id);
  const files=D.S28.filter(f=>f.person_id===v.id).sort((a,b)=>(parseInt(b.version_no)||0)-(parseInt(a.version_no)||0));
  const via=viaOptions();
  const exp=(k,label)=>`<div class="hr-field fixed" style="min-width:150px"><label for="${k}">${label}</label><select class="hr-select" id="${k}">${sel$(['있음','없음','확인 필요'],fit.suggest[k]||'확인 필요')}</select><input class="hr-input" id="${k}_note" placeholder="메모" style="margin-top:4px"><div class="hr-sub">제안: ${hrEsc(fit.suggest[k]||'확인 필요')}</div></div>`;
  box.innerHTML=`<div class="card" id="secForm" data-person="${hrEsc(v.id)}">
    <div class="card-title"><span><span class="hr-block-no">2</span>추천 정보 — ${hrEsc(v.name)} <span class="hr-sub">${hrEsc(v.id)}</span> ${v.rating.flag==='블랙'?'<span class="hr-badge red">블랙</span>':''}</span></div>
    ${on.length?`<div class="hr-notice warn" id="dupWarn">이미 이 라인에 등록된 후보입니다 (경로: ${on.map(c=>hrEsc(c.via_party_id?hrPartyLabel(PM,c.via_party_id):'-')).join(', ')}). 다른 경로로 들어온 중복 추천이면 계속 등록할 수 있습니다.</div>`:''}
    ${v.pending?`<div class="hr-notice warn" id="pendWarn">이력서 변경 검토 대기 ${v.pending}건이 있습니다. <a href="candidate-detail.html?id=${encodeURIComponent(v.id)}&tab=career" style="color:inherit;font-weight:600">경력 탭에서 확인</a></div>`:''}
    <div class="hr-row">
      ${F('fVia','경로 (추천한 곳)',`<select class="hr-select" id="fVia"><option value="">선택</option>${via.map(x=>`<option value="${hrEsc(x.v)}">${hrEsc(x.t)}</option>`).join('')}</select>`,true)}
      ${F('fRecv','추천 수령일',`<input class="hr-input" type="date" id="fRecv" value="${hrEsc(ASOF)}">`,true)}
      <div class="hr-field"><label>가용 시기</label><div class="hr-sub" style="padding:8px 0" id="availTxt">${hrEsc(v.avail.text)}${v.person.avail_text?` · ${hrEsc(v.person.avail_text)}`:''}</div></div>
    </div>
    <div class="hr-rate-pair" style="margin-top:6px">
      ${F('fBuy','매입 단가 (만원/월) · 업체 제시',`<input class="hr-input num hr-amt" id="fBuy" inputmode="decimal">`)}
      ${F('fSell','판매 단가 (만원/월)',`<input class="hr-input num hr-amt" id="fSell" inputmode="decimal">`)}
    </div>
    <div class="hr-sub" style="margin:4px 0 8px">마진 <b id="marginTxt">-</b> 만원/월 (판매 − 매입, 저장하지 않음)</div>
    <div class="hr-row">${F('fResume','사용할 이력서',`<select class="hr-select" id="fResume">${files.map((f,i)=>`<option value="${hrEsc(f.file_id)}"${i===0?' selected':''}>v${hrEsc(f.version_no||'?')} · ${hrEsc(f.file_name||f.file_id)}${i===0?' (기준)':''}</option>`).join('')||'<option value="">등록된 이력서 없음</option>'}</select>`)}</div>
    <div class="hr-sub" id="prevRoutes" style="margin-bottom:6px">${prev.length?'이전 경로 이력: '+prev.map(hrEsc).join(' / '):'이전 경로 이력 없음'}</div>
  </div>
  <div class="card" id="secFit"><div class="card-title"><span><span class="hr-block-no">3</span>적합 평가</span><span class="hr-badge amber">초안 — 검토 필요</span></div>
    <div class="hr-sub" style="margin-bottom:6px">저장된 자료를 규칙으로 비교한 사실 판정입니다. 등록은 막지 않으며, 아래 항목은 확인하고 직접 고쳐 저장합니다.</div>
    <div class="hr-scroll"><table class="hr-table auto" id="fitTable" style="min-width:560px"><thead><tr><th style="width:150px">항목</th><th style="width:90px">판정</th><th>내용</th></tr></thead><tbody>${fit.items.map(i=>`<tr data-fit="${i.key}"><td>${hrEsc(i.label)}</td><td><span class="hr-badge ${STATUS_TXT[i.status][0]}">${STATUS_TXT[i.status][1]}</span></td><td style="white-space:normal;${i.status==='bad'?'color:var(--red);':''}">${hrEsc(i.text)}</td></tr>`).join('')}</tbody></table></div>
    <div class="hr-row" style="margin-top:10px">
      ${F('fLevel','적합도',`<select class="hr-select" id="fLevel" style="width:120px">${sel$(['상','중','하'],'','선택')}</select>`,true)}
      ${exp('client_exp','고객사 경험')}${exp('industry_exp','업종 경험')}${exp('type_exp','프로젝트 유형 경험')}</div>
    ${F('fReason','적합 이유','<textarea class="hr-input" id="fReason" rows="2" style="width:100%"></textarea>')}
    ${F('fPitch','추천 포인트 (2~4줄)','<textarea class="hr-input" id="fPitch" rows="3" style="width:100%"></textarea>')}
    ${F('fConcern','우려 사항 (내부용 — 요청자 출력·Claude 질문에는 넣지 않습니다)','<textarea class="hr-input" id="fConcern" rows="2" style="width:100%"></textarea>')}
    <div class="hr-row"><button class="btn btn-secondary btn-sm" data-act="ask">Claude 질문 문구 만들기 (이 후보)</button></div>
    <div id="askBox"></div>
  </div>
  <div class="card" id="secContact"><div class="card-title"><span><span class="hr-block-no">4</span>연락처 (필요할 때만)</span></div>
    <div class="hr-sub" style="margin-bottom:6px">입력한 값은 시트에만 저장되고 이 화면의 목록에는 나오지 않습니다.</div>
    <div class="hr-row">${F('fMobile','휴대전화','<input class="hr-input" id="fMobile">')}${F('fEmail','이메일','<input class="hr-input" id="fEmail">')}
      ${F('fSource','입수 경로',`<select class="hr-select" id="fSource">${sel$(['서치업체','후보 본인','이력서 기재'],'','선택')}</select>`)}${F('fReqAt','요청일','<input class="hr-input" type="date" id="fReqAt">')}</div>
  </div>
  <div class="card"><div class="hr-err" id="regMsg" style="margin-bottom:6px"></div>
    <div class="hr-row"><button class="btn btn-primary" data-act="register" id="btnReg">이 의뢰에 후보로 등록</button><a class="btn btn-secondary" id="btnCancel" href="request-detail.html?id=${encodeURIComponent(REQ.request_id)}">취소</a></div></div>`;
}
function marginUpdate(){ const b=hrManToWon(q('fBuy').value), s=hrManToWon(q('fSell').value); const e=q('marginTxt'); if(!e) return;
  e.textContent=(typeof b==='number'&&typeof s==='number'&&!isNaN(b)&&!isNaN(s))?(Math.round((s-b)/1000)/10).toLocaleString('ko-KR',{maximumFractionDigits:1}):'-'; }

// ── Claude 질문 (이 후보 1명, CMN-08) ────────────────────────────────────────
function ask(){
  const v=VIEWS.find(x=>x.id===SEL); if(!v) return;
  const r=cmnBuildPrompt({line:LINE,req:REQ,cands:[{view:v,careers:CAREERS.get(v.id)||[],skills:SKILLS.get(v.id)||[]}],kind:'강약점 정리',template:PROMPT_TPL});
  q('askBox').innerHTML=r.ok?`<div class="hr-sub" style="margin:8px 0 4px">추천 포인트 초안을 받으려면 아래 문구를 Claude 에 붙여 넣으세요. (제외: ${r.excluded.map(hrEsc).join(', ')})</div><textarea class="hr-input" id="askText" rows="10" style="width:100%">${hrEsc(r.text)}</textarea><div class="hr-row" style="margin-top:6px"><button class="btn btn-secondary btn-sm" data-act="copyAsk">복사</button></div>`:`<div class="hr-err">${hrEsc(r.message)}</div>`;
}
async function copyAsk(){ const t=q('askText').value; try{ await navigator.clipboard.writeText(t); toast('복사했습니다.'); }catch(e){ q('askText').select(); toast('선택된 문구를 직접 복사해 주세요.',true); } }

// ── 등록 ────────────────────────────────────────────────────────────────────
async function register(btn){
  const v=VIEWS.find(x=>x.id===SEL); if(!v) return; const msg=q('regMsg'); msg.textContent='';
  ['fVia','fRecv','fBuy','fSell','fLevel'].forEach(i=>{ const e=q(i+'Err'); if(e) e.textContent=''; });
  let bad=false; const err=(id,m)=>{ q(id+'Err').textContent=m; bad=true; };
  const via=q('fVia').value, recv=q('fRecv').value, lvl=q('fLevel').value;
  if(!via) err('fVia','경로를 선택해 주세요.'); if(!recv) err('fRecv','추천 수령일을 입력해 주세요.'); if(!lvl) err('fLevel','적합도를 선택해 주세요.');
  const buy=hrManToWon(q('fBuy').value), sell=hrManToWon(q('fSell').value);
  if(typeof buy==='number'&&isNaN(buy)) err('fBuy','단가는 숫자로 입력해 주세요.'); else if(typeof buy==='number'&&buy>RATE_MAX_MAN*10000) err('fBuy',`단가는 만원 단위입니다. 월 ${RATE_MAX_MAN.toLocaleString('ko-KR')}만원 이하로 입력해 주세요.`);
  if(typeof sell==='number'&&isNaN(sell)) err('fSell','단가는 숫자로 입력해 주세요.'); else if(typeof sell==='number'&&sell>RATE_MAX_MAN*10000) err('fSell',`단가는 만원 단위입니다. 월 ${RATE_MAX_MAN.toLocaleString('ko-KR')}만원 이하로 입력해 주세요.`);
  if(bad) return;
  if(v.rating.flag==='블랙'&&!confirm(MSG.black)) return;
  await hrBusy(btn,async()=>{
    // 지금 시트를 다시 읽어 같은 (라인, 후보, 경로)가 있는지 확인
    const cur=await hrReadMany(['S31']); if(cur.failed.length){ msg.textContent='시트를 읽을 수 없어 저장하지 않았습니다.'; return; }
    if(cur.tabs.S31.rows.some(c=>c.line_id===LINE.line_id&&c.person_id===v.id&&c.via_party_id===via)){ q('fViaErr').textContent=MSG.dup; return; }
    const ord=D.S34.find(o=>o.request_id===REQ.request_id&&o.line_id===LINE.line_id&&o.party_id===via)||D.S34.find(o=>o.request_id===REQ.request_id&&o.party_id===via);
    const rec={line_id:LINE.line_id,person_id:v.id,via_party_id:via,order_id:ord?ord.order_id:'',stage:START_STAGE,rate_buy:typeof buy==='number'?buy:'',rate_sell:typeof sell==='number'?sell:'',resume_file_id:q('fResume').value||'',
      fit_state:'확정',fit_level:lvl,fit_reason:q('fReason').value.trim(),pitch_points:q('fPitch').value.trim(),concern_note:q('fConcern').value.trim(),
      client_exp:q('client_exp').value,client_exp_note:q('client_exp_note').value.trim(),industry_exp:q('industry_exp').value,industry_exp_note:q('industry_exp_note').value.trim(),type_exp:q('type_exp').value,type_exp_note:q('type_exp_note').value.trim()};
    const a=await hrAppend('S31',rec); if(!a.ok){ msg.textContent=hrSaveFailText(a); return; }
    const notes=[];
    const s=await hrAppend('S38',{cand_id:a.id,stage:START_STAGE,stage_date:recv,memo:''});
    if(!s.ok) notes.push('후보는 등록했지만 단계 기록(추천수령)을 남기지 못했습니다. 의뢰 상세에서 단계를 확인해 주세요.');
    const m=q('fMobile').value.trim(), e=q('fEmail').value.trim(), src=q('fSource').value, rq=q('fReqAt').value;
    if(m||e||src||rq){
      const x=await hrReadMany(['S39']); let ok2=false;
      if(!x.failed.length){ const row=x.tabs.S39.rows.find(z=>z.person_id===v.id); const ch={}; const want={mobile:m,email:e,contact_source:src,contact_requested_at:rq};
        Object.keys(want).forEach(k=>{ if(want[k]!==''&&want[k]!==String((row&&row[k])??'')) ch[k]=want[k]; });
        if((m||e)&&!(row&&String(row.contact_acquired_at||'').trim())) ch.contact_acquired_at=ASOF;
        if(!Object.keys(ch).length) ok2=true; else { const r=row?await hrUpdate('S39',v.id,ch,{readUpdatedAt:row.updated_at}):await hrAppend('S39',{person_id:v.id,...ch}); ok2=r.ok; } }
      if(!ok2) notes.push('후보는 등록했지만 연락처를 저장하지 못했습니다. 후보 상세에서 다시 입력해 주세요.');
    }
    done={name:v.name,notes};
    SEL=null; await loadAll(); renderDone();
  });
}
function renderDone(){
  if(!done){ q('doneBox').innerHTML=''; return; }
  q('doneBox').innerHTML=`<div class="hr-notice ${done.notes.length?'warn':''}" id="doneMsg"><b>${hrEsc(done.name)}</b> 후보를 이 의뢰에 등록했습니다.${done.notes.map(n=>`<div>${hrEsc(n)}</div>`).join('')}
    <div class="hr-row" style="margin-top:8px"><a class="btn btn-primary btn-sm" href="request-detail.html?id=${encodeURIComponent(REQ.request_id)}">의뢰 상세로</a><button class="btn btn-secondary btn-sm" data-act="again">다른 후보 추가</button></div></div>`;
}

// ── 이벤트 ───────────────────────────────────────────────────────────────────
const ACT={
  pick:b=>{ SEL=b.dataset.id; done=null; renderDone(); renderList(); renderForm(); const e=q('secForm'); if(e&&e.scrollIntoView) e.scrollIntoView({block:'start'}); },
  register,ask,copyAsk,again:()=>{ done=null; renderDone(); window.scrollTo(0,0); },
};
document.addEventListener('click',ev=>{
  const r=ev.target.closest('[data-role]'); if(r&&r.closest('#roleChips')){ const c=r.dataset.role; roleSel.has(c)?roleSel.delete(c):roleSel.add(c); shown=50; renderRoleChips(); renderList(); return; }
  if(ev.target.id==='btnMore'){ shown+=50; renderList(); return; }
  if(ev.target.id==='btnReset'){ resetFilters(); renderRoleChips(); renderList(); return; }
  const a=ev.target.closest('[data-act]'); if(a&&ACT[a.dataset.act]) ACT[a.dataset.act](a);
});
document.addEventListener('input',ev=>{ const id=ev.target.id;
  if(['fSearch','fSkills','fAgeMin','fAgeMax'].includes(id)){ shown=50; renderList(); } else if(id==='fBuy'||id==='fSell') marginUpdate(); });
document.addEventListener('change',ev=>{ const id=ev.target.id; if(['fGrade','fRoleMode','fMulti','fAvail','fInd','fType','fNoBlack'].includes(id)){ shown=50; renderList(); } });
window.addEventListener('load',loadAll);
