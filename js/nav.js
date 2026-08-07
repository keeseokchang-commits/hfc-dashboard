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
  if(tb){
    const moreKeys=NAV_ITEMS.filter(x=>!x[4]).map(x=>x[0]);
    const moreActive=moreKeys.includes(active);
    tb.innerHTML=NAV_ITEMS.filter(x=>x[4]).map(([k,ic,label,href])=>
      `<button class="tab-item${k===active?' active':''}" ${k===active?'':`onclick="location.href='${href}'"`}><span class="tab-icon">${ic}</span>${label==='대시보드'?'홈':label}</button>`).join('\n')
      +`<button class="tab-item${moreActive?' active':''}" onclick="toggleMoreNav()"><span class="tab-icon">⋯</span>더보기</button>`;
  }
}
document.addEventListener('DOMContentLoaded',()=>{ const p=document.body.dataset.page; if(p) renderNav(p); });
if(document.readyState!=='loading'){ const p=document.body&&document.body.dataset.page; if(p) renderNav(p); }

// v2.5.3: 모바일 하단 탭 [더보기] — 고정비·부가세·설정 진입 경로
function toggleMoreNav(){
  let m=document.getElementById('moreNav');
  if(m){ m.remove(); return; }
  const active=document.body.dataset.page;
  m=document.createElement('div'); m.id='moreNav';
  m.style.cssText='position:fixed;right:10px;bottom:64px;z-index:250;background:var(--surface,#fff);border:1px solid var(--border,#E2E8F0);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:8px;min-width:150px';
  m.innerHTML=NAV_ITEMS.filter(x=>!x[4]).map(([k,ic,label,href])=>
    `<button style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:none;background:${k===active?'var(--blue-lt,#EFF6FF)':'none'};border-radius:9px;font-size:13px;cursor:pointer;color:${k===active?'var(--blue,#2563EB)':'inherit'};font-weight:${k===active?'700':'500'}" onclick="location.href='${href}'">${ic} ${label}</button>`).join('');
  document.body.appendChild(m);
  setTimeout(()=>document.addEventListener('click',function h(e){ if(!m.contains(e.target)&&!e.target.closest('.tab-item')){m.remove();document.removeEventListener('click',h);} }),50);
}
