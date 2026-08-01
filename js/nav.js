// HFC nav.js v2.0 — 사이드바·탭바 단일 렌더(메뉴 변경은 이 파일만 수정)
const NAV_ITEMS=[
  ['dash','🏠','대시보드','index.html',true],
  ['pipeline','📋','사업기회','pipeline.html',true],
  ['estimate','📊','견적','estimate.html',true],
  ['project','📁','프로젝트','project.html',true],
  ['input','🧾','세금계산서','input.html',true],
  ['fixed','🏢','고정비','fixed.html',false],
  ['cashflow','💰','자금수지','cashflow.html',true],
  ['vat','🧾','부가세','vat.html',false],
  ['settings','⚙️','설정','settings.html',false],
];
function renderNav(active){
  const sn=document.querySelector('nav.side-nav');
  if(sn) sn.innerHTML=NAV_ITEMS.map(([k,ic,label,href])=>
    `<button class="side-nav-item${k===active?' active':''}" ${k===active?'':`onclick="location.href='${href}'"`}><span class="sn-icon">${ic}</span>${label}</button>`).join('\n');
  const tb=document.querySelector('nav.tab-bar');
  if(tb) tb.innerHTML=NAV_ITEMS.filter(x=>x[4]).map(([k,ic,label,href])=>
    `<button class="tab-item${k===active?' active':''}" ${k===active?'':`onclick="location.href='${href}'"`}><span class="tab-icon">${ic}</span>${label==='대시보드'?'홈':label}</button>`).join('\n');
}
document.addEventListener('DOMContentLoaded',()=>{ const p=document.body.dataset.page; if(p) renderNav(p); });
if(document.readyState!=='loading'){ const p=document.body&&document.body.dataset.page; if(p) renderNav(p); }
