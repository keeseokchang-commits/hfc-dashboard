// HFC scr-candidate.js v2.9.81 — STF-SCR-04 후보자 관리 · 후보 목록
// 근거: 프로그램 설계서 §7(SCR-04). 후보를 역할·등급·기술·경력 연차·가용일 등으로 찾는다. 읽기 전용(등록·수정은 이력서 등록·후보 상세에서).
// 정한 것(2026-10-13): "이번 주 생일" = 기준일부터 7일 이내 / 읽는 탭에 S22·S26·S27·S10 추가 / 연락처 값은 화면에 나오지 않고 유무만 한 번 읽는다.
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-alert.js(cmnContactPresence), cmn-person.js(cmnPersonViews), hr-ui.js
const PAGE_SIZE=50;
const KEYS=['S20','S21','S22','S23','S25','S26','S27','S28','S29','S31','S10'];
let D={}, VIEWS=[], ASOF='', PM=new Map(), PRESENCE=null, shown=PAGE_SIZE, quick='', roleSel=new Set();

const addDays=(s,n)=>cmnAddDays(s,n);
// 생일(월-일)이 기준일부터 7일 안에 오는가 — 생일을 모르면 false
function birthdaySoon(p,asOf){
  const b=cmnDate(p.birth_date); if(!b||p.birth_precision==='연도추정') return false;
  for(let i=0;i<7;i++){ const d=cmnDate(addDays(asOf,i)); if(d&&d.m===b.m&&d.d===b.d) return true; }
  return false;
}
function settingsOf(rows){ const o={}; (rows||[]).forEach(r=>{ const v=parseInt(r.setting_value,10); if(['short_tenure_months','exit_alert_days','reconfirm_days'].includes(r.setting_key)&&!isNaN(v)) o[r.setting_key]=v; }); return o; }
function build(){
  const views=cmnPersonViews({persons:D.S20,roles:D.S21,skills:D.S22,careers:D.S23,assigns:D.S25,files:D.S28,ratings:D.S29,cands:D.S31,contacts:D.S26},ASOF,settingsOf(D.S10),PRESENCE);
  const byP=cmnGroup(D.S23,'person_id');
  return Object.values(views).map(v=>{
    const cs=byP.get(v.id)||[];
    v.inds=new Set(cs.map(c=>c.industry).filter(Boolean)); v.types=new Set(cs.flatMap(c=>cmnSplit(c.project_type)));
    v.bday=birthdaySoon(v.person,ASOF); v.reconNeeded=!!(v.recon&&v.recon.needed);
    return v;
  });
}
const QUICK=[['all','전체',()=>true],['exit','철수 예정',v=>!!v.exitDue],['recon','재확인 필요',v=>v.reconNeeded],['bday','이번 주 생일',v=>v.bday],['review','이력서 검토 필요',v=>v.review]];
function renderQuick(){
  hrQ('quickChips').innerHTML=QUICK.map(([k,l,f])=>{ const n=VIEWS.filter(f).length; const on=(quick||'all')===k;
    return `<span class="hr-chip${on?' on':''}" data-quick="${k}">${hrEsc(l)}${k==='all'?'':` ${n}`}</span>`; }).join('');
}
function flagOk(v,m){ const f=v.rating.flag; return m==='all'||(m==='nb'&&f!=='블랙')||(m==='white'&&f==='화이트')||(m==='black'&&f==='블랙'); }
function num(id){ const t=hrQ(id).value.trim(); if(t==='') return null; const n=parseFloat(t); return isNaN(n)?null:n; }
function filtered(){
  const q=hrQ('fSearch').value.trim().toLowerCase(), g=hrQ('fGrade').value, fl=hrQ('fFlag').value, mode=hrQ('fRoleMode').value, multi=hrQ('fMulti').checked;
  const qf=(QUICK.find(x=>x[0]===(quick||'all'))||QUICK[0])[2];
  const a1=num('fAgeMin'), a2=num('fAgeMax'), asof=hrQ('fAgeAsOf').value||ASOF, av=hrQ('fAvail').value, yr=num('fYears'), ind=hrQ('fInd').value, ty=hrQ('fType').value;
  const sh=hrQ('fShort').checked, rt=hrQ('fRoute').checked, ct=hrQ('fContact').checked;
  const list=VIEWS.filter(v=>{
    if(!qf(v)) return false; if(!flagOk(v,fl)) return false;
    if(q&&!v.search.includes(q)) return false;
    if(g&&(v.grade||'')!==g) return false;
    if(roleSel.size){ const have=new Set(v.roles.map(r=>r.code)); const sel=[...roleSel]; if(!(mode==='all'?sel.every(r=>have.has(r)):sel.some(r=>have.has(r)))) return false; }
    if(multi&&!v.multi.has) return false;
    if(a1!==null||a2!==null){ const a=cmnAge(v.person,asof); if(a.kind!=='exact') return false; if(a1!==null&&a.age<a1) return false; if(a2!==null&&a.age>a2) return false; }
    if(av&&!(v.avail.date&&v.avail.date<=av)) return false;
    if(yr!==null&&!(v.years.applied.years>=yr)) return false;
    if(ind&&!v.inds.has(ind)) return false; if(ty&&!v.types.has(ty)) return false;
    if(sh&&!(v.short.count>0)) return false; if(rt&&!(v.route.count>=2)) return false; if(ct&&v.contact!=='yes') return false;
    return true;
  });
  const lv=r=>CMN_LEVELS.indexOf(r);
  const best=v=>roleSel.size?Math.min(...v.roles.filter(r=>roleSel.has(r.code)).map(r=>{ const i=lv(r.level); return i<0?9:i; }),9):0;
  return list.sort((a,b)=>best(a)-best(b)||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
}
function badges(v){
  const b=[]; const f=v.rating.flag;
  if(f==='블랙') b.push('<span class="hr-badge red">블랙</span>'); else if(f==='화이트') b.push('<span class="hr-badge green">화이트</span>');
  if(v.exitDue) b.push('<span class="hr-badge amber">철수 예정</span>');
  if(v.reconNeeded) b.push('<span class="hr-badge amber">재확인 필요</span>');
  if(v.bday) b.push('<span class="hr-badge blue">이번 주 생일</span>');
  if(v.review) b.push('<span class="hr-badge red">검토 필요</span>');
  if(v.short.count>0) b.push(`<span class="hr-badge gray">단기 ${v.short.count}건</span>`);
  if(v.contact==='no') b.push('<span class="hr-badge gray">연락처 미확보</span>');
  return b.join(' ');
}
function row(v){
  const cur=v.current; const curText=cur?`${hrEsc([cur.client,cur.project].filter(Boolean).join(' · ')||'-')}${cur.end_ym?` <span class="hr-sub">(${hrEsc(cur.end_ym)} 종료)</span>`:''}${cur.kind==='resume'?' <span class="hr-sub">(이력서 기준)</span>':''}`:'-';
  const route=v.route.latestPartyId?`최근 경로 ${hrEsc(hrPartyName(PM,v.route.latestPartyId))}`:'';
  const via=v.route.count>=2?` <span class="hr-badge amber" data-via="1">경유 ${v.route.count}곳</span>`:'';
  const g=v.grade||(v.gradeReported?`${v.gradeReported}(기재)`:'-');
  const yrs=v.years.applied; const dim=v.rating.flag==='블랙'?' style="opacity:.55"':'';
  return `<tr data-id="${hrEsc(v.id)}"${dim}>
    <td><a href="candidate-detail.html?id=${encodeURIComponent(v.id)}" data-name="1" style="font-weight:600;color:inherit">${hrEsc(v.name)}</a><div class="hr-sub">${hrEsc(v.age.label||'')}${route?` · ${route}`:''}${via}</div></td>
    <td>${hrEsc(v.roleLabel||'-')}<div class="hr-sub">${hrEsc(g)}</div></td>
    <td>${hrEsc(v.skills.slice(0,4).join(', ')||'-')}<div class="hr-sub">${hrEsc(v.industries.join(', '))}</div></td>
    <td class="r">${hrEsc(yrs.years)}년${yrs.basis==='manual'?' <span class="hr-badge gray">수기</span>':''}</td>
    <td>${curText}</td>
    <td>${hrEsc(v.avail.text)}</td>
    <td>${badges(v)}</td></tr>`;
}
function renderList(){
  const box=hrQ('listBox');
  if(!VIEWS.length){ box.innerHTML='<div class="hr-empty">등록된 후보자가 없습니다. 이력서 등록 탭에서 이력서를 읽어 주세요.</div>'; hrQ('listCount').textContent=''; return; }
  const list=filtered(); hrQ('listCount').textContent=`${list.length}명`;
  if(!list.length){ box.innerHTML='<div class="hr-empty">조건에 맞는 후보가 없습니다.<br><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="clearFilters()">조건 해제</button></div>'; return; }
  const cols=[['후보',200],['역할·등급',150],['핵심 기술·업종',200],['경력 연차',80],['현행 프로젝트(종료)',200],['가용일',90],['표시',200]];
  box.innerHTML=`<div class="hr-scroll"><table class="hr-table auto" style="min-width:${cols.reduce((s,c)=>s+c[1],0)}px"><thead><tr>${cols.map(([l,w],i)=>`<th class="${i===3?'r':''}" style="width:${w}px">${l}</th>`).join('')}</tr></thead><tbody>${list.slice(0,shown).map(row).join('')}</tbody></table></div>`
    +(list.length>shown?`<div style="text-align:center;margin-top:10px"><button class="btn btn-secondary" id="btnMore">더 보기 (남은 ${list.length-shown}명)</button></div>`:'');
}
function renderRoleChips(){
  const codes=[...new Set(VIEWS.flatMap(v=>v.roles.map(r=>r.code)))].sort((a,b)=>a.localeCompare(b,'ko'));
  hrQ('roleChips').innerHTML=codes.length?codes.map(c=>`<span class="hr-chip${roleSel.has(c)?' on':''}" data-role="${hrEsc(c)}">${hrEsc(c)}</span>`).join(''):'<span class="hr-sub">등록된 역할이 없습니다.</span>';
}
function fillSelects(){
  const keep=['fGrade','fInd','fType'].map(i=>hrQ(i).value);
  hrQ('fGrade').innerHTML='<option value="">전체 등급</option>'+['특급','고급','중급','초급'].map(x=>`<option>${x}</option>`).join('');
  const inds=[...new Set(VIEWS.flatMap(v=>[...v.inds]))].sort((a,b)=>a.localeCompare(b,'ko')), tys=[...new Set(VIEWS.flatMap(v=>[...v.types]))].sort((a,b)=>a.localeCompare(b,'ko'));
  hrQ('fInd').innerHTML='<option value="">전체</option>'+inds.map(x=>`<option>${hrEsc(x)}</option>`).join('');
  hrQ('fType').innerHTML='<option value="">전체</option>'+tys.map(x=>`<option>${hrEsc(x)}</option>`).join('');
  ['fGrade','fInd','fType'].forEach((i,n)=>{ hrQ(i).value=keep[n]; });
}
function render(){ renderQuick(); renderRoleChips(); renderList(); }
function onFilter(){ shown=PAGE_SIZE; renderList(); }
function clearFilters(){
  ['fSearch','fAgeMin','fAgeMax','fAgeAsOf','fAvail','fYears'].forEach(i=>hrQ(i).value=''); ['fGrade','fInd','fType'].forEach(i=>hrQ(i).value='');
  hrQ('fFlag').value='nb'; hrQ('fRoleMode').value='any'; ['fMulti','fShort','fRoute','fContact'].forEach(i=>hrQ(i).checked=false);
  quick=''; roleSel=new Set(); shown=PAGE_SIZE; render();
}
document.addEventListener('click',ev=>{
  const q=ev.target.closest('[data-quick]'); if(q){ quick=q.dataset.quick==='all'?'':(quick===q.dataset.quick?'':q.dataset.quick); shown=PAGE_SIZE; render(); return; }
  const r=ev.target.closest('[data-role]'); if(r&&r.closest('#roleChips')){ const c=r.dataset.role; roleSel.has(c)?roleSel.delete(c):roleSel.add(c); shown=PAGE_SIZE; render(); return; }
  if(ev.target.id==='btnMore'){ shown+=PAGE_SIZE; renderList(); }
});

async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const r=await hrLoadScreen(KEYS);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  box.innerHTML=''; hrQ('screen').style.display=''; D=r.data; ASOF=hrToday(); PM=hrMap(D.S27,'party_id');
  // 연락처는 값이 아니라 있고 없음만 한 번 읽는다. 읽기가 실패해도 화면은 그대로 보여 주고 연락처 조건만 쓰지 못한다.
  const ids=D.S20.filter(p=>!cmnPersonHidden(p)).map(p=>p.person_id); const pr=await cmnContactPresence(ids);
  PRESENCE=pr.ok?pr.map:null;
  hrQ('fContact').disabled=PRESENCE===null; hrQ('contactNote').textContent=PRESENCE===null?'연락처 정보를 읽지 못해 이 조건은 쓸 수 없습니다.':'';
  VIEWS=build(); fillSelects(); render();
}
window.addEventListener('load',loadAll);
