const {chromium}=require('playwright'); const path=require('path');
(async()=>{ const b=await chromium.launch(); let bad=0;
  for(const f of ['index','input','pipeline','project','estimate','cashflow','vat','fixed','profile','settings','party','request','request-detail']){
    const p=await (await b.newContext()).newPage(); const errs=[];
    p.on('pageerror',e=>errs.push(e.message));
    await p.route('**/*',r=>{ const u=r.request().url(); if(u.startsWith('file://')) return r.continue();
      if(u.startsWith('https://sheets.googleapis.com')) return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({values:[]})});
      return r.fulfill({status:200,contentType:'text/javascript',body:"window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}};"}); });
    await p.goto('file://'+path.join(__dirname,'..',f+'.html')); await p.waitForTimeout(700);
    const has=await p.evaluate(()=>typeof HR_TABS!=='undefined'&&typeof R!=='undefined'&&Object.keys(R).length);
    console.log((errs.length?'✗':'✓'),f+'.html','에러',errs.length,errs.slice(0,2).join(' | '),'R키',has); bad+=errs.length?1:0; }
  await b.close(); process.exit(bad?1:0); })();
