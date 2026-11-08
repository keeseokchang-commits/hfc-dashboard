// HFC scr-exit.js v2.9.88 — STF-SCR-05 철수·재확인·생일 일정 (candidate.html 의 "철수·재확인 일정" 탭, 조회 전용)
// 근거: 프로그램 설계서 §9(SCR-05). 사용 탭: S20, S25, S26 (scr-candidate.js 가 이미 읽은 D 를 그대로 쓴다) — 입력은 하지 않고 이름을 누르면 후보 상세의 접촉 탭(SCR-09)으로 간다.
// 정한 것(2026-10-15):
//   · 계산은 CMN-06(cmnAlerts)을 그대로 쓴다. 생일 목록은 기준일부터 14일(설계서 §9.9 R1 확정, CMN_BIRTHDAY_WINDOW). 후보 목록의 "이번 주 생일" 칩(7일)과는 다른 기준이다.
//   · 정렬은 §9.9 R2: 철수 예정=종료 빠른 순, 재확인=경과 일수 많은 순, 생일=가까운 순.
//   · 기준일을 바꾸면 이미 읽은 데이터로 세 목록을 다시 계산한다(시트를 다시 읽지 않는다). 기준일을 비우면 오늘.
//   · 만 나이는 "다가오는 생일에 되는 나이"로 표시한다.
// 의존: scr-candidate.js(D·ASOF·settingsOf), cmn-alert.js(cmnAlerts·CMN_BIRTHDAY_WINDOW), cmn-derive.js, hr-ui.js
let exitAsOf='', exitOpen=false;
const exitMsg={none:'해당하는 후보가 없습니다.',noCurrent:'접촉 탭에서 현행 프로젝트를 입력하면 여기에 표시됩니다.'};
function exitData(asOf){
  const persons=Object.fromEntries((D.S20||[]).map(p=>[p.person_id,p]));
  const st=settingsOf(D.S10);
  const al=cmnAlerts({assigns:D.S25||[],contacts:D.S26||[],persons},asOf,st,null);
  const asg=new Map((D.S25||[]).map(a=>[a.assign_id,a]));
  const full=e=>String(e||'').length===7?e+'-31':String(e||'');
  const exit=al.exitSoon.map(x=>{ const a=asg.get(x.assign_id)||{}; const d=cmnDate(x.end);
    const start=d?cmnAddDays(x.end,-(st.exit_alert_days||30)):(cmnYm(x.end)!==null?cmnYmStr(cmnYm(x.end)-1)+'-01':'');
    return {...x,project:a.project_name||'',alertFrom:start}; }).sort((p,q)=>full(p.end).localeCompare(full(q.end)));
  const recon=al.reconfirm.slice().sort((p,q)=>(q.elapsed||0)-(p.elapsed||0));
  const bday=al.birthday.map(b=>{ const by=cmnDate(b.birth_date); const next=cmnAddDays(asOf,b.left); const ny=cmnDate(next); return {...b,date:next,age:by&&ny?ny.y-by.y:null}; }).sort((p,q)=>p.left-q.left);
  return {exit,recon,bday,st,hasCurrent:(D.S25||[]).some(a=>String(a.status??'').trim()==='진행')};
}
const exitName=(pid)=>{ const p=(D.S20||[]).find(x=>x.person_id===pid); return `<a href="candidate-detail.html?id=${encodeURIComponent(pid)}&tab=contact" data-open="${hrEsc(pid)}" style="font-weight:600;color:inherit">${hrEsc(p?p.name:pid)}</a><div class="hr-sub">${hrEsc(pid)}</div>`; };
function exitTable(head,rows,id){
  if(!rows.length) return `<div class="hr-empty" id="${id}Empty">${exitMsg.none}</div>`;
  return `<div class="hr-scroll"><table class="hr-table auto" id="${id}" style="min-width:560px"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function renderExit(){
  const box=hrQ('paneExit'); const asOf=exitAsOf||ASOF; const r=exitData(asOf);
  const chip=(id,l,n)=>`<span class="hr-chip" data-jump="${id}" id="chip_${id}">${l} <b>${n}</b></span>`;
  const exitRows=r.exit.map(x=>`<tr data-p="${hrEsc(x.person_id)}"><td>${exitName(x.person_id)}</td><td>${hrEsc(x.client_name||'-')}<div class="hr-sub">${hrEsc(x.project||'')}</div></td><td>${hrEsc(x.end||'-')}</td><td>${hrEsc(x.alertFrom||'-')}</td><td>${hrEsc(x.confidence||'-')}</td><td>${hrEsc(((D.S26||[]).filter(c=>c.person_id===x.person_id&&String(c.assign_id||'').trim()).map(c=>c.contact_date).sort().pop())||'-')}</td></tr>`);
  const reconRows=r.recon.map(x=>`<tr data-p="${hrEsc(x.person_id)}"><td>${exitName(x.person_id)}</td><td>${hrEsc(x.last)}</td><td class="r">${hrEsc(x.elapsed)}일</td></tr>`);
  const bdayRows=r.bday.map(x=>`<tr data-p="${hrEsc(x.person_id)}"><td>${exitName(x.person_id)}</td><td>${hrEsc(x.date)}${x.left===0?' <span class="hr-badge blue">오늘</span>':` <span class="hr-sub">(${x.left}일 후)</span>`}</td><td class="r">${x.age===null?'-':hrEsc(x.age)+'세'}</td></tr>`);
  box.innerHTML=`<div class="card"><div class="hr-row">
      <div class="hr-field fixed" style="min-width:160px"><label for="xAsOf">기준일</label><input class="hr-input" type="date" id="xAsOf" value="${hrEsc(exitAsOf||ASOF)}"></div>
      <div class="hr-chips" id="exitChips" style="align-self:flex-end">${chip('secExit','철수 예정',r.exit.length)}${chip('secRecon','재확인 필요',r.recon.length)}${chip('secBday','생일',r.bday.length)}</div></div>
      <div class="hr-sub" style="margin-top:6px">철수 예정은 종료 ${r.st.exit_alert_days||30}일 전부터, 재확인은 현행 정보를 마지막으로 확인한 지 ${r.st.reconfirm_days||90}일 초과, 생일은 기준일부터 ${CMN_BIRTHDAY_WINDOW}일 이내입니다. 이력서에만 "진행 중"으로 적힌 경력은 포함하지 않습니다.</div></div>
    ${r.hasCurrent?'':`<div class="hr-notice" id="noCurrentAll">${exitMsg.noCurrent}</div>`}
    <div class="card" id="secExit"><div class="card-title">철수 예정 <span class="hr-sub">종료 빠른 순</span></div>${exitTable(['후보','현행 고객사·프로젝트','종료 예정 월','알림 시작일','확신도','마지막 확인일'],exitRows,'tExit')}</div>
    <div class="card" id="secRecon"><div class="card-title">재확인 필요 <span class="hr-sub">경과 일수 많은 순</span></div>${exitTable(['후보','마지막 현행 정보 확인일','경과'],reconRows,'tRecon')}</div>
    <div class="card" id="secBday"><div class="card-title">생일 <span class="hr-sub">가까운 순</span></div>${exitTable(['후보','생일','만 나이(다가오는 생일)'],bdayRows,'tBday')}</div>`;
}
function showTab(name){
  exitOpen=name==='exit';
  [...hrQ('tabs').children].forEach(c=>{ if(c.dataset.tab==='list'||c.dataset.tab==='exit') c.classList.toggle('on',c.dataset.tab===name); });
  hrQ('paneList').style.display=exitOpen?'none':''; hrQ('paneExit').style.display=exitOpen?'':'none';
  if(exitOpen) renderExit();
}
document.addEventListener('click',ev=>{
  const t=ev.target.closest('#tabs [data-tab]'); if(t&&(t.dataset.tab==='list'||t.dataset.tab==='exit')){ showTab(t.dataset.tab); return; }
  const j=ev.target.closest('[data-jump]'); if(j){ const e=hrQ(j.dataset.jump); if(e&&e.scrollIntoView) e.scrollIntoView({block:'start'}); return; }
  const tr=ev.target.closest('#paneExit tr[data-p]'); if(tr&&!ev.target.closest('a')) location.href=`candidate-detail.html?id=${encodeURIComponent(tr.dataset.p)}&tab=contact`;   // 행 어디를 눌러도 접촉 탭으로
});
document.addEventListener('change',ev=>{ if(ev.target.id==='xAsOf'){ exitAsOf=ev.target.value||''; renderExit(); } });
// 새로고침(loadAll)이 다시 그린 뒤에도 보던 탭을 유지한다
window.addEventListener('load',()=>{ const base=window.loadAll; if(typeof base==='function'){ window.loadAll=async function(){ await base.apply(this,arguments); if(exitOpen) renderExit(); }; } });
