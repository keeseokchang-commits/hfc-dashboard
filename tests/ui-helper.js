// 화면 시험 공통 — 실제 html을 브라우저(Chromium)에서 열고, 구글 호출만 모의 시트로 연결한다. 날짜는 2026-10-10(토) 오전 10시(한국)로 고정.
const path=require('path');
const {chromium}=require('playwright');
const {Mock}=require('./mock-sheets.js');
const {makeEnv}=require('./harness.js');
const _e=makeEnv(); const HDR=_e.run('HEADERS'), TABS=_e.run('HR_TABS');
const TODAY='2026-10-10';
const FIXED=new Date('2026-10-10T01:00:00Z');
// 정의(schema.js)와 같은 크기의 인력 모듈 탭을 만든다. rows는 {열이름:값} 객체 배열.
function addHrTab(m,k,rows=[]){ m.addTab(TABS[k].tab,HDR[k],rows.map(o=>HDR[k].map(h=>o[h]??'')),{rowCount:TABS[k].rows,colCount:HDR[k].length,frozen:1}); }
function newMock(tabs={}){ const m=new Mock(); m.nowMs=FIXED.getTime(); Object.keys(tabs).forEach(k=>addHrTab(m,k,tabs[k])); return m; }
async function launch(){ return chromium.launch(); }
async function open(browser,file,m,opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:900}}); const page=await ctx.newPage(); const dialogs=[]; let dialogAnswer=true; page.__errors=[];
  await page.clock.setFixedTime(FIXED);
  page.on('dialog',async d=>{ dialogs.push(d.message()); dialogAnswer?await d.accept():await d.dismiss(); });
  page.on('pageerror',e=>{ page.__errors.push(e.message); });
  await page.route('**/*',async route=>{
    const req=route.request(); const url=req.url();
    if(url.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({status:200,contentType:'text/javascript',body:"window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){ window.__loginAsked=(window.__loginAsked||0)+1; }})}}};"});
    if(url.startsWith('https://sheets.googleapis.com/')){
      const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
      if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
      const r=m.handle(req.method(),url,req.headers(),req.postData());
      if(r.status===0) return route.abort('connectionfailed');
      return route.fulfill({status:r.status,contentType:'application/json',headers:cors,body:JSON.stringify(r.body)});
    }
    if(url.startsWith('file://')) return route.continue();
    return route.fulfill({status:200,body:''});
  });
  if(opts.token!==false) await page.addInitScript(()=>{ window.__tok=true; });
  await page.goto('file://'+path.join(__dirname,'..',file)+(opts.query||''));
  await page.waitForFunction(()=>typeof loadAll==='function');
  if(opts.token!==false) await page.evaluate(()=>{ accessToken='test-token'; });
  await page.waitForTimeout(opts.wait||500);
  return {page,dialogs,setAnswer:v=>{dialogAnswer=v;},close:()=>ctx.close()};
}
const toastText=async p=>{ await p.waitForTimeout(150); return p.evaluate(()=>document.getElementById('toast').textContent); };
const writes=m=>m.log.filter(x=>/^(POST|PUT)/.test(x));
const rowsOf=(m,k)=>{ const s=m.tab(TABS[k].tab); return s.cells.slice(1).filter(r=>r.some(v=>v!==''&&v!==undefined)).map(r=>Object.fromEntries(HDR[k].map((h,i)=>[h,r[i]??'']))); };
module.exports={HDR,TABS,TODAY,newMock,addHrTab,launch,open,toastText,writes,rowsOf};
