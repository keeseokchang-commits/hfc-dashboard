// 모의 구글 시트 — 시험 전용. Google Sheets API v4 중 이 프로젝트가 쓰는 호출만 흉내 낸다.
// (읽기 values.get / batchGet, 쓰기 append / update / clear / batchUpdate, 탭 메타 읽기, batchUpdate 요청 6종)
// 실제 구글의 규칙을 따른다: 격자 크기를 넘는 범위는 400, 값은 읽을 때 문자열, 쓰기는 로그인 토큰 필요(없으면 401),
// batchUpdate는 한 요청이라도 틀리면 전부 취소.
const ID='1PZs1mEbqoWUlgbx7FgvCoTHoDjzJTv6JNDoX6-yVg5Q';
function colNum(s){ let n=0; for(const ch of s) n=n*26+ch.charCodeAt(0)-64; return n; }
function colLetter(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
class Mock{
  constructor(){ this.sheets=[]; this.nextId=0; this.log=[]; this.fail=[]; this.nowMs=Date.UTC(2026,9,12,3,0,0); }
  addTab(title,header,rows=[],opts={}){
    const id=this.nextId++; const colCount=opts.colCount||header.length; const rowCount=opts.rowCount||1000;
    this.sheets.push({id,title,rowCount,colCount,frozen:opts.frozen||0,cells:[header.slice(),...rows.map(r=>r.slice())],fmt:{},valid:{},prot:[]});
    return id;
  }
  tab(title){ return this.sheets.find(s=>s.title===title); }
  // 사람이 시트를 직접 고치는 상황(다른 화면·사용자의 수정)
  set(title,row,col,v){ const s=this.tab(title); while(s.cells.length<row) s.cells.push([]); const r=s.cells[row-1]; while(r.length<col) r.push(''); r[col-1]=v; }
  failNext(match,status,times=1,applyFirst=false,skip=0){ this.fail.push({match,status,times,applyFirst,skip}); }
  parse(range){ // "탭!A1:Z9" | "탭!A:A" | "탭!1:1" | "탭!A5"
    const i=range.lastIndexOf('!'); const tab=range.slice(0,i), a=range.slice(i+1);
    let m; const o={tab};
    if((m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a))) Object.assign(o,{c1:colNum(m[1]),r1:+m[2],c2:colNum(m[3]),r2:+m[4]});
    else if((m=/^([A-Z]+):([A-Z]+)$/.exec(a))) Object.assign(o,{c1:colNum(m[1]),c2:colNum(m[2])});
    else if((m=/^(\d+):(\d+)$/.exec(a))) Object.assign(o,{r1:+m[1],r2:+m[2]});
    else if((m=/^([A-Z]+)(\d+)$/.exec(a))) Object.assign(o,{c1:colNum(m[1]),r1:+m[2],c2:colNum(m[1]),r2:+m[2]});
    else throw new Error('bad range '+range);
    return o;
  }
  grid(p){ const s=this.tab(p.tab); if(!s) return {err:'Unable to parse range: '+p.tab};
    if((p.r2&&p.r2>s.rowCount)||(p.c2&&p.c2>s.colCount)) return {err:`Range (${p.tab}) exceeds grid limits. Max rows: ${s.rowCount}, max columns: ${s.colCount}`}; return {s}; }
  read(range){
    const p=this.parse(range); const g=this.grid(p); if(g.err) return {err:g.err}; const s=g.s;
    const r1=p.r1||1, r2=p.r2||s.cells.length, c1=p.c1||1, c2=p.c2||s.colCount;
    const out=[]; for(let r=r1;r<=Math.min(r2,s.cells.length);r++){ const row=(s.cells[r-1]||[]).slice(c1-1,c2).map(v=>v===undefined||v===null?'':String(v)); while(row.length&&row[row.length-1]==='') row.pop(); out.push(row); }
    while(out.length&&out[out.length-1].length===0) out.pop();
    const rng=`${p.tab}!${colLetter(c1)}${r1}:${colLetter(c2)}${r2}`; return {values:out,range:rng,p};
  }
  write(tab,r,c,vals){ const s=this.tab(tab); vals.forEach((row,i)=>row.forEach((v,j)=>this.set(tab,r+i,c+j,v))); }
  lastRow(s,c1,c2){ let last=0; s.cells.forEach((row,i)=>{ for(let c=c1;c<=c2;c++){ const v=row[c-1]; if(v!==undefined&&v!==''&&v!==null){ last=i+1; break; } } }); return last; }
  // 한 HTTP 호출 처리 → {status, body}
  handle(method,url,headers,bodyText){
    const u=new URL(url); const path=decodeURIComponent(u.pathname.replace(/%3A/gi,'\u0001')).replace(/\u0001/g,':');
    const rawPath=u.pathname; this.log.push(method+' '+rawPath.replace('/v4/spreadsheets/'+ID,'')+(u.search.includes('ranges')?'?batch':''));
    const auth=(headers.authorization||headers.Authorization||'');
    const isWrite=method!=='GET';
    // 실패 주입
    for(const f of this.fail){ if(f.times>0&&f.match.test(method+' '+rawPath)){ if(f.skip>0){ f.skip--; continue; } f.times--; if(f.applyFirst&&isWrite){ const r=this.route(method,u,rawPath,auth,bodyText); return f.status===0?{status:0}:{status:f.status,body:{error:{message:'injected'}}}; } return f.status===0?{status:0}:{status:f.status,body:{error:{message:'injected'}}}; } }
    return this.route(method,u,rawPath,auth,bodyText);
  }
  route(method,u,rawPath,auth,bodyText){
    const base='/v4/spreadsheets/'+ID; if(!rawPath.startsWith(base)) return {status:404,body:{error:{message:'not found'}}};
    if(method!=='GET'&&!/^Bearer \S+/.test(auth)) return {status:401,body:{error:{message:'unauthorized'}}};
    const rest=rawPath.slice(base.length); const body=bodyText?JSON.parse(bodyText):null;
    const dec=s=>decodeURIComponent(s);
    if(rest===''&&method==='GET') return {status:200,body:{sheets:this.sheets.map(s=>({properties:{sheetId:s.id,title:s.title,gridProperties:{rowCount:s.rowCount,columnCount:s.colCount,frozenRowCount:s.frozen}}}))}};
    if(rest===':batchUpdate') return this.batchUpdate(body);
    if(rest==='/values:batchGet'){ const ranges=u.searchParams.getAll('ranges'); const vr=[]; for(const r of ranges){ const x=this.read(r); if(x.err) return {status:400,body:{error:{message:x.err}}}; vr.push({range:x.range,values:x.values}); } return {status:200,body:{valueRanges:vr}}; }
    if(rest==='/values:batchUpdate'){ for(const d of body.data){ const x=this.parse(d.range); const g=this.grid(x); if(g.err) return {status:400,body:{error:{message:g.err}}}; }
      for(const d of body.data){ const x=this.parse(d.range); this.write(x.tab,x.r1,x.c1,d.values); } return {status:200,body:{totalUpdatedCells:body.data.length}}; }
    let m;
    if((m=/^\/values\/(.+):append$/.exec(rest))){ const p=this.parse(dec(m[1])); const g=this.grid(p); if(g.err) return {status:400,body:{error:{message:g.err}}};
      const s=g.s; const c1=p.c1||1; const last=this.lastRow(s,c1,p.c2||s.colCount); const row=last+1; const vals=body.values;
      this.write(p.tab,row,c1,vals); if(s.cells.length>s.rowCount) s.rowCount=s.cells.length;
      return {status:200,body:{updates:{updatedRange:`${p.tab}!${colLetter(c1)}${row}:${colLetter(c1+vals[0].length-1)}${row+vals.length-1}`,updatedRows:vals.length}}}; }
    if((m=/^\/values\/(.+):clear$/.exec(rest))){ const p=this.parse(dec(m[1])); const g=this.grid(p); if(g.err) return {status:400,body:{error:{message:g.err}}};
      const s=g.s; const c1=p.c1||1,c2=p.c2||s.colCount; for(let r=(p.r1||1);r<=(p.r2||s.cells.length);r++){ const row=s.cells[r-1]; if(row) for(let c=c1;c<=c2;c++) if(c-1<row.length) row[c-1]=''; } return {status:200,body:{}}; }
    if((m=/^\/values\/(.+)$/.exec(rest))){ const rg=dec(m[1]);
      if(method==='GET'){ const x=this.read(rg); if(x.err) return {status:400,body:{error:{message:x.err}}}; return {status:200,body:{range:x.range,values:x.values}}; }
      if(method==='PUT'){ const p=this.parse(rg); const g=this.grid({tab:p.tab}); if(g.err) return {status:400,body:{error:{message:g.err}}};
        const s=g.s; const vals=body.values; if((p.r1||1)+vals.length-1>s.rowCount) return {status:400,body:{error:{message:'exceeds grid limits'}}};
        this.write(p.tab,p.r1||1,p.c1||1,vals); return {status:200,body:{updatedRows:vals.length}}; } }
    return {status:404,body:{error:{message:'unsupported '+method+' '+rest}}};
  }
  batchUpdate(body){
    const snap=JSON.stringify(this.sheets), snapId=this.nextId; const replies=[];
    const fail=msg=>{ this.sheets=JSON.parse(snap); this.nextId=snapId; return {status:400,body:{error:{message:msg}}}; };
    const byId=id=>this.sheets.find(s=>s.id===id);
    for(const rq of body.requests){
      if(rq.addSheet){ const p=rq.addSheet.properties; if(this.tab(p.title)) return fail(`A sheet with the name "${p.title}" already exists.`);
        const id=p.sheetId!==undefined?p.sheetId:this.nextId; if(byId(id)) return fail('sheetId exists'); this.nextId=Math.max(this.nextId,id+1);
        const gp=p.gridProperties||{}; this.sheets.push({id,title:p.title,rowCount:gp.rowCount||1000,colCount:gp.columnCount||26,frozen:gp.frozenRowCount||0,cells:[],fmt:{},valid:{},prot:[]});
        replies.push({addSheet:{properties:{sheetId:id,title:p.title}}}); }
      else if(rq.updateCells){ const s=byId(rq.updateCells.start.sheetId); if(!s) return fail('no sheet');
        rq.updateCells.rows.forEach((row,i)=>row.values.forEach((c,j)=>{ const v=c.userEnteredValue; if(v) this.set(s.title,rq.updateCells.start.rowIndex+1+i,rq.updateCells.start.columnIndex+1+j,v.stringValue!==undefined?v.stringValue:v.numberValue); })); replies.push({}); }
      else if(rq.repeatCell){ const s=byId(rq.repeatCell.range.sheetId); if(!s) return fail('no sheet'); const t=rq.repeatCell.cell.userEnteredFormat&&rq.repeatCell.cell.userEnteredFormat.numberFormat; if(t) for(let c=rq.repeatCell.range.startColumnIndex;c<rq.repeatCell.range.endColumnIndex;c++) s.fmt[c]=t.type; replies.push({}); }
      else if(rq.setDataValidation){ const s=byId(rq.setDataValidation.range.sheetId); if(!s) return fail('no sheet'); const r=rq.setDataValidation.rule; if(r.condition.type!=='ONE_OF_LIST') return fail('bad rule');
        for(let c=rq.setDataValidation.range.startColumnIndex;c<rq.setDataValidation.range.endColumnIndex;c++) s.valid[c]={values:r.condition.values.map(v=>v.userEnteredValue),strict:!!r.strict}; replies.push({}); }
      else if(rq.addProtectedRange){ const s=byId(rq.addProtectedRange.protectedRange.range.sheetId); if(!s) return fail('no sheet'); s.prot.push(rq.addProtectedRange.protectedRange); replies.push({}); }
      else if(rq.deleteDimension){ const r=rq.deleteDimension.range; const s=byId(r.sheetId); if(!s) return fail('no sheet'); if(r.dimension!=='ROWS') return fail('rows only'); s.cells.splice(r.startIndex,r.endIndex-r.startIndex); replies.push({}); }
      else return fail('unsupported request '+Object.keys(rq)[0]);
    }
    return {status:200,body:{replies}};
  }
  // 사람이 시트에 직접 입력할 때의 드롭다운 검증을 흉내: 허용값이 아니면 거부
  typeIn(title,row,colName,value){ const s=this.tab(title); const ci=s.cells[0].indexOf(colName); const v=s.valid[ci]; if(v&&v.strict&&value!==''&&!v.values.includes(value)) return false; this.set(title,row,ci+1,value); return true; }
}
module.exports={Mock,ID};
