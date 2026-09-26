// HFC nav.js v2.0 — 사이드바·탭바 단일 렌더(메뉴 변경은 이 파일만 수정)
// v2.9.28: 배포 버전 표시 — 실제 실행 중인 배포가 어느 버전인지 화면에서 바로 구분할 수 있게(사용자 요청).
// 새 버전 배포 시 이 상수 하나만 갱신하면 전 화면(사이드바+모바일 탭바)에 자동 반영된다.
const HFC_VERSION='v2.9.60';
const NAV_ITEMS=[
  ['dash','🏠','대시보드','index.html',true],
  ['pipeline','📋','사업기회','pipeline.html',true],
  ['estimate','📊','견적','estimate.html',true],
  ['project','📁','프로젝트','project.html',true],
  ['input','🧾','세금계산서','input.html',true],
  ['profile','👥','인력 프로필','profile.html',false],
  ['fixed','🏢','고정비','fixed.html',false],
  ['cashflow','💰','자금수지','cashflow.html',true],
  ['vat','🧾','부가세','vat.html',false],
  ['settings','⚙️','설정','settings.html',false],
];
function renderNav(active){
  const sn=document.querySelector('nav.side-nav');
  if(sn) sn.innerHTML=NAV_ITEMS.map(([k,ic,label,href])=>
    `<button class="side-nav-item${k===active?' active':''}" ${k===active?'':`onclick="location.href='${href}'"`}><span class="sn-icon">${ic}</span>${label}</button>`).join('\n')
    +`<div style="margin-top:auto;padding:10px 14px;font-size:11px;color:var(--text3,#94A3B8);border-top:1px solid var(--border,#E2E8F0)">HFC 경영관리 ${HFC_VERSION}</div>`;
  const tb=document.querySelector('nav.tab-bar');
  if(tb){
    const moreKeys=NAV_ITEMS.filter(x=>!x[4]).map(x=>x[0]);
    const moreActive=moreKeys.includes(active);
    tb.innerHTML=NAV_ITEMS.filter(x=>x[4]).map(([k,ic,label,href])=>
      `<button class="tab-item${k===active?' active':''}" ${k===active?'':`onclick="location.href='${href}'"`}><span class="tab-icon">${ic}</span>${label==='대시보드'?'홈':label}</button>`).join('\n')
      +`<button class="tab-item${moreActive?' active':''}" onclick="toggleMoreNav()"><span class="tab-icon">⋯</span>더보기</button>`;
  }
}
// v2.9.28: 모바일(사이드바 숨김)에서도 버전이 보이도록 헤더의 .app-logo에도 작게 배지 주입.
// 클래스 선택자로 붙여 10개 화면 HTML을 개별 수정할 필요 없이 이 파일만 갱신하면 전체 반영된다.
function renderVersionBadge(){
  // profile.html은 헤더 클래스가 app-logo가 아니라 app-title이라 함께 선택(화면마다 헤더 클래스명이 갈리는
  // 기존 비일관성 — 근본 통일은 별도 작업으로 남기고, 여기서는 두 클래스 다 대응해 배지 누락만 방지).
  document.querySelectorAll('.app-logo, .app-title').forEach(el=>{
    if(el.querySelector('.hfc-ver-badge')) return; // 중복 주입 방지
    const b=document.createElement('span');
    b.className='hfc-ver-badge';
    b.style.cssText='color:var(--text3,#94A3B8);font-weight:400;font-size:10px;margin-left:8px;opacity:.7';
    b.textContent=HFC_VERSION;
    el.appendChild(b);
  });
}
document.addEventListener('DOMContentLoaded',()=>{ const p=document.body.dataset.page; if(p) renderNav(p); renderVersionBadge(); });
if(document.readyState!=='loading'){ const p=document.body&&document.body.dataset.page; if(p) renderNav(p); renderVersionBadge(); }

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
