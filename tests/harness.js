// 시험 공통: 실제 소스(schema.js·common.js·cmn-*.js)를 브라우저와 같은 방식으로 한 공간에 올리고, fetch를 모의 구글 시트로 연결한다.
const fs=require('fs'), vm=require('vm'), path=require('path');
const {Mock,ID}=require('./mock-sheets.js');
const SRC=path.join(__dirname,'..','js');
function makeEnv(files=['schema.js','common.js','cmn-sheet.js','cmn-init.js']){
  const mock=new Mock();
  const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,URL,Promise,encodeURIComponent,decodeURIComponent,parseInt,parseFloat};
  ctx.fetch=async(url,opts={})=>{
    const r=mock.handle((opts.method||'GET').toUpperCase(),String(url),opts.headers||{},opts.body);
    if(r.status===0) throw new TypeError('network down');
    return {ok:r.status<300,status:r.status,json:async()=>r.body};
  };
  ctx.document={getElementById:()=>null};
  vm.createContext(ctx);
  files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f}));
  const run=code=>vm.runInContext(code,ctx);
  return {mock,ctx,run,login(){ run("accessToken='test-token'"); },logout(){ run('accessToken=null'); }};
}
async function runTests(list,title){
  let pass=0,fail=0; const lines=[];
  for(const [id,desc,fn] of list){
    try{ await fn(); pass++; lines.push(`  ✓ ${id}  ${desc}`); }
    catch(e){ fail++; lines.push(`  ✗ ${id}  ${desc}\n      → ${e.message}`); }
  }
  console.log(`\n■ ${title}  통과 ${pass} / 실패 ${fail}`); console.log(lines.join('\n'));
  return fail;
}
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'값 불일치')+` — 실제 ${JSON.stringify(a)} / 기대 ${JSON.stringify(b)}`); };
const ok=(c,m)=>{ if(!c) throw new Error(m||'조건 불충족'); };
module.exports={makeEnv,runTests,eq,ok,ID};
