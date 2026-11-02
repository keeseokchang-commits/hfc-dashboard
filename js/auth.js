// HFC auth.js v2.9.111 — 로그인 게이트 · 세션 · 자동 잠금 · 화면 잠금 비밀번호 (설계서 security-login-design v0.1, 사용자 승인 2026-11-02)
// 원칙: ① 구글 로그인 후에만 시트를 읽고 쓴다(읽기용 키 제거). ② 접속 열쇠는 이 탭(sessionStorage)에만 둔다.
//       ③ 마지막 입력 후 N분(기본 10)이 지나면 화면을 가리고 열쇠를 폐기한다. ④ 잠금 해제 = 구글 로그인 + 4자리 번호.
// 의존: common.js(SHEETS_ID·CLIENT_ID·clearAndWrite), schema.js(W·HEADERS) — 모두 호출 시점에만 사용한다.
const API_KEY='';   // 과거 호환용 빈 값 — 읽기용 키는 더 이상 쓰지 않는다(authFetch가 URL의 key= 를 제거)
const SCOPES='https://www.googleapis.com/auth/spreadsheets openid email';
const SHEETS_BASE=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}`;
let accessToken=null,tokenClient=null;
const AUTH={exp:0,email:'',waiters:[],idleMin:10,warned:false,locked:false,lastAct:Date.now(),timer:null,refreshing:false,silentCb:null,triedSilent:false,pinVal:'',stage:'',busy:false};
const _ss=(k,v)=>{ try{ if(v===undefined) return sessionStorage.getItem(k); if(v===null) sessionStorage.removeItem(k); else sessionStorage.setItem(k,v); }catch(e){} return null; };
const _ls=(k,v)=>{ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; };

// ── 세션 복원 ───────────────────────────────────────────────
function authRestore(){
  if(_ls('hfc_lock')){ _ss('hfc_tok',null); _ss('hfc_pinok',null); return; }   // 어느 탭에서든 잠겼으면 이 탭도 잠금
  const raw=_ss('hfc_tok'); if(!raw) return;
  try{ const o=JSON.parse(raw); if(o.t&&o.exp>Date.now()+60000){ accessToken=o.t; AUTH.exp=o.exp; AUTH.email=o.email||''; } }catch(e){}
}
function authOk(){ return !!accessToken&&AUTH.exp>Date.now()+30000&&_ss('hfc_pinok')==='1'; }
function authEmail(){ return AUTH.email||_ls('hfc_email')||''; }
function authSaveTok(){ _ss('hfc_tok',JSON.stringify({t:accessToken,exp:AUTH.exp,email:AUTH.email})); }

// ── 외부에서 쓰는 관문 ───────────────────────────────────────
function authReady(){
  if(authOk()) return Promise.resolve(true);
  return new Promise(res=>{ AUTH.waiters.push(res); authShow(); });
}
async function signIn(){ await authReady(); return !!accessToken; }   // 과거 호환: 로그인 완료까지 기다린다
function initOAuth(){ gsiReady().then(authMkClient).catch(()=>{}); }  // 과거 호환(각 화면 onload) — 멱등
const _stripKey=u=>String(u).replace(/([?&])key=[^&]*&?/,'$1').replace(/[?&]$/,'');
async function authFetch(url,opts){
  opts=opts||{}; url=_stripKey(url);
  for(let a=0;a<2;a++){
    await authReady();
    const res=await fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+accessToken}});
    if(res.status===401&&a===0){ accessToken=null; AUTH.exp=0; _ss('hfc_tok',null); continue; }   // 열쇠 만료 → 다시 로그인 후 1회 재시도
    return res;
  }
}

// ── 구글 로그인 ─────────────────────────────────────────────
function gsiReady(){
  return new Promise((res,rej)=>{
    const ok=()=>window.google&&google.accounts&&google.accounts.oauth2;
    if(ok()) return res();
    if(!document.querySelector('script[src*="accounts.google.com/gsi/client"]')){ const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true; document.head.appendChild(s); }
    let n=0; const t=setInterval(()=>{ if(ok()){ clearInterval(t); res(); } else if(++n>75){ clearInterval(t); rej(new Error('gsi')); } },200);
  });
}
function authMkClient(){
  if(tokenClient||!(window.google&&google.accounts&&google.accounts.oauth2)) return;
  tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:authOnToken,
    error_callback:()=>{ if(AUTH.silentCb){ const f=AUTH.silentCb; AUTH.silentCb=null; f(false); } else authMsg('로그인 창이 열리지 못했거나 닫혔습니다. 팝업 차단을 확인해 주세요.'); }});
}
async function authLogin(selectAccount){
  try{ await gsiReady(); authMkClient(); }catch(e){ authMsg('구글 로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); return; }
  tokenClient.requestAccessToken({prompt:selectAccount?'select_account':'',hint:_ls('hfc_email')||undefined});
}
function authSilent(){
  if(AUTH.refreshing) return Promise.resolve(false);
  AUTH.refreshing=true;
  return new Promise(async res=>{
    const fin=ok=>{ AUTH.refreshing=false; res(ok); };
    try{ await gsiReady(); authMkClient(); }catch(e){ return fin(false); }
    AUTH.silentCb=fin;
    setTimeout(()=>{ if(AUTH.silentCb===fin){ AUTH.silentCb=null; fin(false); } },10000);
    try{ tokenClient.requestAccessToken({prompt:'',hint:_ls('hfc_email')||undefined}); }catch(e){ AUTH.silentCb=null; fin(false); }
  });
}
async function authOnToken(resp){
  if(!resp||resp.error||!resp.access_token){ if(AUTH.silentCb){ const f=AUTH.silentCb; AUTH.silentCb=null; f(false); } else authMsg('로그인에 실패했습니다. 다시 시도해 주세요.'); return; }
  accessToken=resp.access_token; AUTH.exp=Date.now()+(parseInt(resp.expires_in,10)||3600)*1000;
  if(!AUTH.email){ try{ const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+accessToken}}); if(r.ok) AUTH.email=(await r.json()).email||''; }catch(e){} }
  if(AUTH.email) _ls('hfc_email',AUTH.email);
  authSaveTok();
  const cb=AUTH.silentCb; AUTH.silentCb=null;
  if(_ss('hfc_pinok')==='1'){ authDone(); if(cb) cb(true); return; }   // 같은 세션의 열쇠 갱신 — 번호는 다시 묻지 않는다
  if(cb) cb(true);
  await authPinStage();
}

// ── 화면 잠금 비밀번호(S10 category=security) ────────────────────
const _hex=u8=>[...u8].map(b=>b.toString(16).padStart(2,'0')).join('');
async function pinHash(pin,saltHex){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  const salt=Uint8Array.from(saltHex.match(/../g).map(h=>parseInt(h,16)));
  return _hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:150000},key,256)));
}
async function pinMake(pin){ const salt=_hex(crypto.getRandomValues(new Uint8Array(16))); return salt+':'+await pinHash(pin,salt); }
async function pinCheck(pin,stored){ const [salt,h]=String(stored||'').split(':'); if(!salt||!h) return false; return (await pinHash(pin,salt))===h; }
async function secReadS10(){   // 열쇠로 직접 읽는다(authFetch를 쓰면 로그인 대기와 순환하므로)
  try{
    const r=await fetch(`${SHEETS_BASE}/values/${encodeURIComponent(W.S10[0]+'!'+W.S10[1])}`,{headers:{Authorization:'Bearer '+accessToken}});
    if(!r.ok) return {ok:false,status:r.status,rows:[]};
    const v=(await r.json()).values||[]; const H=HEADERS.S10, hdr=(v[0]||H).map(String);
    const rows=v.slice(1).map(row=>Object.fromEntries(H.map(h=>[h,row[hdr.indexOf(h)]??'']))).filter(o=>o.setting_key);
    return {ok:true,status:200,rows};
  }catch(e){ return {ok:false,status:0,rows:[]}; }
}
async function secRead(){
  const s=await secReadS10(); if(!s.ok) return s;
  const g=k=>(s.rows.find(r=>r.category==='security'&&r.setting_key===k)||{}).setting_value||'';
  const m=parseInt(g('lock_minutes'),10);
  return {ok:true,pin:g('lock_pin'),minutes:(m>=1&&m<=120)?m:10};
}
async function secWrite(mut){
  const s=await secReadS10(); if(!s.ok) return false;
  const next=mut(s.rows); const H=HEADERS.S10;
  return await clearAndWrite(...W.S10,[H,...next.map(o=>H.map(h=>o[h]??''))]);
}
function _secRow(key,val,desc){ return {setting_key:key,setting_value:val,description:desc,category:'security',updated_at:new Date(Date.now()+9*3600*1000).toISOString().slice(0,10)}; }
async function secWritePin(pin){
  const val=await pinMake(pin);
  return secWrite(rows=>[...rows.filter(r=>!(r.category==='security'&&r.setting_key==='lock_pin')),_secRow('lock_pin',val,'화면 잠금 비밀번호(4자리, 변환값만 저장)')]);
}
async function secSetIdle(min){
  min=parseInt(min,10); if(!(min>=1&&min<=120)) return {ok:false,msg:'1~120분 사이로 입력해 주세요.'};
  const ok=await secWrite(rows=>[...rows.filter(r=>!(r.category==='security'&&r.setting_key==='lock_minutes')),_secRow('lock_minutes',String(min),'자동 잠금까지 걸리는 시간(분)')]);
  if(ok){ AUTH.idleMin=min; _ls('hfc_idle',String(min)); }
  return {ok,msg:ok?'저장했습니다.':'저장에 실패했습니다.'};
}
async function secChangePin(oldPin,newPin){   // 설정 화면용: 현재 번호 확인(없으면 최초 지정) 후 변경
  if(!/^\d{4}$/.test(newPin)) return {ok:false,msg:'새 번호는 숫자 4자리여야 합니다.'};
  await authReady();
  const sec=await secRead(); if(!sec.ok) return {ok:false,msg:'설정을 읽지 못했습니다.'};
  if(sec.pin){
    const lk=pinLockLeft(); if(lk>0) return {ok:false,msg:`번호를 여러 번 틀려 ${Math.ceil(lk/60000)}분 뒤에 다시 시도할 수 있습니다.`};
    if(!await pinCheck(oldPin,sec.pin)){ pinFail(); return {ok:false,msg:'현재 번호가 맞지 않습니다.'}; }
    pinReset();
  }
  const ok=await secWritePin(newPin);
  return {ok,msg:ok?'변경했습니다.':'저장에 실패했습니다.'};
}
async function secStatus(){ await authReady(); const s=await secRead(); return s.ok?{ok:true,hasPin:!!s.pin,minutes:s.minutes}:{ok:false}; }
// 틀린 횟수(5회 → 5분 차단). 새로고침·새 탭으로 초기화되지 않도록 localStorage에 둔다.
function _pf(){ try{ return JSON.parse(_ls('hfc_pinfail')||'{}'); }catch(e){ return {}; } }
function pinLockLeft(){ const f=_pf(); return f.until&&f.until>Date.now()?f.until-Date.now():0; }
function pinFail(){ const f=_pf(); const n=(f.until&&f.until<=Date.now()?0:(f.n||0))+1; _ls('hfc_pinfail',JSON.stringify(n>=5?{n:0,until:Date.now()+5*60000}:{n,until:0})); return n; }
function pinReset(){ _ls('hfc_pinfail',null); }

async function authPinStage(){
  const sec=await secRead();
  if(!sec.ok){
    accessToken=null; AUTH.exp=0; _ss('hfc_tok',null);
    authRender('login',sec.status===403||sec.status===404?'이 구글 계정으로는 시트를 열 수 없습니다. 시트가 공유된 계정으로 다시 로그인해 주세요.':'설정을 읽지 못했습니다. 잠시 후 다시 시도해 주세요. (오류 '+sec.status+')');
    return;
  }
  AUTH.idleMin=sec.minutes; _ls('hfc_idle',String(sec.minutes)); AUTH.pinVal=sec.pin;
  authRender(sec.pin?'pin':'setpin');
}
async function authPinSubmit(){
  if(AUTH.busy) return;
  const el=document.getElementById('hfcPin'); const v=el?el.value:'';
  if(!/^\d{4}$/.test(v)) return;
  const lk=pinLockLeft(); if(lk>0){ authMsg(`번호를 여러 번 틀려 ${Math.ceil(lk/60000)}분 뒤에 다시 시도할 수 있습니다.`); el.value=''; return; }
  AUTH.busy=true;
  try{
    if(await pinCheck(v,AUTH.pinVal)){ pinReset(); _ss('hfc_pinok','1'); _ls('hfc_lock',null); authDone(); }
    else { const n=pinFail(); el.value=''; authMsg(pinLockLeft()>0?'5번 틀려 5분간 입력이 막혔습니다.':`번호가 맞지 않습니다. (${n}/5)`); }
  }finally{ AUTH.busy=false; }
}
async function authPinSet(){
  if(AUTH.busy) return;
  const a=document.getElementById('hfcPin').value, b=document.getElementById('hfcPin2').value;
  if(!/^\d{4}$/.test(a)) return authMsg('숫자 4자리를 입력해 주세요.');
  if(a!==b) return authMsg('두 번호가 같지 않습니다.');
  AUTH.busy=true;
  try{
    if(!await secWritePin(a)) return authMsg('저장에 실패했습니다. 다시 시도해 주세요.');
    _ss('hfc_pinok','1'); _ls('hfc_lock',null); authDone();
  }finally{ AUTH.busy=false; }
}

// ── 완료·잠금·로그아웃 ───────────────────────────────────────
function authDone(){
  AUTH.locked=false; AUTH.triedSilent=false; AUTH.lastAct=Date.now(); _ls('hfc_act',String(AUTH.lastAct));
  const idle=parseInt(_ls('hfc_idle'),10); if(idle>=1&&idle<=120) AUTH.idleMin=idle;
  authSaveTok();
  const w=AUTH.waiters; AUTH.waiters=[];
  authHide(); w.forEach(r=>r(true));
  document.querySelectorAll('.hfc-who').forEach(e=>{ e.textContent=authEmail(); });
}
function authLock(fromStorage){
  if(AUTH.locked) return; AUTH.locked=true;
  if(!fromStorage) _ls('hfc_lock',String(Date.now()));
  const t=accessToken; accessToken=null; AUTH.exp=0; _ss('hfc_tok',null); _ss('hfc_pinok',null);
  try{ if(t&&window.google&&google.accounts&&google.accounts.oauth2) google.accounts.oauth2.revoke(t,()=>{}); }catch(e){}
  authWarn(false); authShow();
}
function authLockNow(){ authLock(false); }
function authLogout(){
  const t=accessToken; accessToken=null; AUTH.exp=0; _ss('hfc_tok',null); _ss('hfc_pinok',null); _ls('hfc_lock',null);
  try{ if(t&&window.google&&google.accounts&&google.accounts.oauth2) google.accounts.oauth2.revoke(t,()=>{}); }catch(e){}
  authWarn(false); authShow();
}

// ── 유휴 감시 ───────────────────────────────────────────────
function authAct(){ const n=Date.now(); if(n-AUTH.lastAct<3000) return; AUTH.lastAct=n; _ls('hfc_act',String(n)); if(AUTH.warned) authWarn(false); }
function authTick(){
  if(!authOk()) return;
  const lim=(AUTH.idleMin||10)*60000; const last=Math.max(AUTH.lastAct,parseInt(_ls('hfc_act'),10)||0); const idle=Date.now()-last;
  if(idle>=lim){ authLock(false); return; }
  authWarn(idle>=lim-60000);
  if(AUTH.exp-Date.now()<5*60000&&!AUTH.refreshing) authSilent();   // 사용 중이면 열쇠를 조용히 갱신(실패하면 다음 읽기·쓰기 때 로그인 창)
}
function authWarn(on){
  AUTH.warned=!!on; let b=document.getElementById('hfcWarn');
  if(!on){ if(b) b.remove(); return; }
  if(b||!document.body) return;
  b=document.createElement('div'); b.id='hfcWarn';
  b.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147482000;background:#92400E;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  b.textContent='🔒 1분 뒤 화면이 잠깁니다 — 키보드나 마우스를 움직이면 연장됩니다';
  document.body.appendChild(b);
}
function authIdleStart(){
  if(AUTH.timer) return;
  const idle=parseInt(_ls('hfc_idle'),10); if(idle>=1&&idle<=120) AUTH.idleMin=idle;
  AUTH.timer=setInterval(authTick,5000);
  ['mousemove','mousedown','keydown','touchstart','wheel','scroll'].forEach(e=>addEventListener(e,authAct,{passive:true,capture:true}));
  addEventListener('storage',e=>{ if(e.key==='hfc_lock'&&e.newValue&&authOk()) authLock(true); });
}

// ── 화면(로그인·잠금·번호) ───────────────────────────────────
function authCss(){
  if(document.getElementById('hfcAuthCss')) return;
  const s=document.createElement('style'); s.id='hfcAuthCss';
  s.textContent=`html.hfc-lock body>*:not(#hfcAuth){visibility:hidden!important}
#hfcAuth{position:fixed;inset:0;z-index:2147483000;background:var(--bg,#F1F5F9);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}
#hfcAuth .box{width:100%;max-width:360px;background:var(--surface,#fff);border:1px solid var(--border,#E2E8F0);border-radius:16px;padding:28px 24px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);color:var(--text,#1A202C)}
#hfcAuth h2{font-size:17px;margin:0 0 6px}#hfcAuth p{font-size:13px;color:var(--text2,#4A5568);margin:0 0 16px;line-height:1.5}
#hfcAuth .btn{width:100%;padding:12px;border-radius:10px;border:none;background:var(--blue,#2563EB);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
#hfcAuth .lnk{display:inline-block;margin-top:12px;font-size:12px;color:var(--text3,#718096);cursor:pointer;background:none;border:none;text-decoration:underline}
#hfcAuth input{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border,#E2E8F0);border-radius:10px;font-size:22px;letter-spacing:12px;text-align:center;margin-bottom:10px;background:var(--surface,#fff);color:inherit}
#hfcAuth .msg{min-height:18px;font-size:12px;color:#DC2626;margin-top:6px}`;
  document.head.appendChild(s);
}
function authShow(){
  const stage=_ls('hfc_lock')?'locked':(_ss('hfc_pinok')==='1'?'relogin':'login');
  if(stage==='relogin'&&!AUTH.triedSilent){
    AUTH.triedSilent=true; authRender('relogin','로그인 정보를 갱신하는 중…',true);
    authSilent().then(ok=>{ if(!ok&&!authOk()) authRender('relogin'); });
    return;
  }
  authRender(stage);
}
function authHide(){ const o=document.getElementById('hfcAuth'); if(o) o.remove(); document.documentElement.classList.remove('hfc-lock'); }
function authMsg(t){ const m=document.getElementById('hfcMsg'); if(m) m.textContent=t||''; }
function authRender(stage,msg,noBtn){
  if(!document.body){ document.addEventListener('DOMContentLoaded',()=>authRender(stage,msg,noBtn)); return; }
  authCss(); AUTH.stage=stage; document.documentElement.classList.add('hfc-lock');
  let o=document.getElementById('hfcAuth'); if(!o){ o=document.createElement('div'); o.id='hfcAuth'; document.body.appendChild(o); }
  const em=_ls('hfc_email');
  const loginBtn=noBtn?'':`<button class="btn" onclick="authLogin(false)">Google 계정으로 로그인</button>${em?`<div style="font-size:12px;color:var(--text3,#718096);margin-top:10px">${em}</div><button class="lnk" onclick="authLogin(true)">다른 계정으로 로그인</button>`:''}`;
  let body='';
  if(stage==='login') body=`<h2>🏢 HFC 경영관리</h2><p>구글 계정으로 로그인해야 데이터를 볼 수 있습니다.</p>${loginBtn}`;
  else if(stage==='locked') body=`<h2>🔒 화면이 잠겼습니다</h2><p>${AUTH.idleMin}분 이상 사용하지 않아 잠겼습니다.<br>구글 로그인 후 잠금 번호를 입력하면 이전 화면으로 돌아갑니다.</p>${loginBtn}`;
  else if(stage==='relogin') body=`<h2>🔑 다시 로그인해 주세요</h2><p>로그인 시간이 지났습니다. 보던 화면은 그대로 유지됩니다.</p>${loginBtn}`;
  else if(stage==='pin') body=`<h2>🔒 잠금 번호</h2><p>숫자 4자리를 입력하세요.</p><input id="hfcPin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" oninput="this.value=this.value.replace(/\\D/g,'');if(this.value.length===4)authPinSubmit()"><button class="btn" onclick="authPinSubmit()">확인</button>`;
  else if(stage==='setpin') body=`<h2>🔒 잠금 번호 만들기</h2><p>화면이 잠겼을 때 풀 번호입니다.<br>숫자 4자리를 두 번 입력하세요.</p><input id="hfcPin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••" oninput="this.value=this.value.replace(/\\D/g,'')"><input id="hfcPin2" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••" oninput="this.value=this.value.replace(/\\D/g,'')"><button class="btn" onclick="authPinSet()">저장하고 시작</button>`;
  o.innerHTML=`<div class="box">${body}<div class="msg" id="hfcMsg">${msg||''}</div>${stage==='pin'||stage==='setpin'?'<button class="lnk" onclick="authLogout()">다른 계정으로 로그인 / 로그아웃</button>':''}</div>`;
  const f=document.getElementById('hfcPin'); if(f) setTimeout(()=>f.focus(),50);
}

// ── 시작 ────────────────────────────────────────────────────
authRestore();
if(!authOk()){ document.documentElement.classList.add('hfc-lock'); if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',authShow); else authShow(); }
authIdleStart();
