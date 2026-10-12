// HFC cmn-sheet.js v2.9.73 — STF-CMN-01 시트 읽기·쓰기(행 단위 포함) · STF-CMN-02 ID 발번
// 근거: 프로그램 설계서 §18(CMN-01), §19(CMN-02), DB 물리 설계 v0.1 §9 쓰기 규칙 · 결정 P1(행 단위 쓰기)·P3(ID 발번)
// 원칙: 값은 입력한 그대로 저장(RAW) / 읽기가 실패하면 쓰지 않는다 / 열은 헤더 이름으로 찾는다(열 번호 하드코딩 금지)
// 기존 clearAndWrite(전체 덮어쓰기)는 그대로 두고, 소규모 탭(mode:'full')에서만 hrOverwrite로 감싸 쓴다.
// 의존: schema.js(R·W·HEADERS·HR_TABS·HR_DELETABLE), common.js(SHEETS_ID·API_KEY·accessToken·signIn·rowsFor·clearAndWrite)

const HR_API=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}`;
// 화면에 그대로 보여 줄 수 있는 메시지(설계서 §18.6, §19.6)
const HR_MSG={
  read:t=>`${t} 탭을 읽을 수 없어 저장을 중단했습니다.`,
  conflict:'다른 곳에서 수정되었습니다. 다시 불러온 뒤 수정해 주세요.',
  write:'저장에 실패했습니다. 로그인 상태를 확인해 주세요.',
  notAllowed:t=>`${t} 탭은 행 삭제가 허용되지 않습니다.`,
  noId:'번호를 정할 수 없어 저장을 중단했습니다.',
  notFound:'대상 행을 찾을 수 없습니다. 다시 불러와 주세요.',
};
const hrSleep=ms=>new Promise(r=>setTimeout(r,ms));
// 한국 시간 기준 오늘(YYYY-MM-DD) — 기기 시간대와 무관하게 같은 날짜
function hrToday(){ return new Date(Date.now()+9*3600*1000).toISOString().slice(0,10); }
const HR_RETRY_MS=800;
const hrHeaderCache={};   // {S20:[헤더…]} — 쓰기 전에 한 번 확인한 실제 시트 헤더
let hrSheetIdCache=null;  // {탭이름:sheetId}

// ── 저수준: 읽기(API 키) / 쓰기(로그인 토큰) ─────────────────────────────────
// 읽기: 429·5xx는 0.8s→1.6s→3.2s 백오프로 자동 재시도(fetchSheet와 동일 정책)
async function hrGet(url){
  for(let i=0;i<4;i++){
    let res;
    try{ res=await fetch(url); }catch(e){ if(i<3){ await hrSleep(HR_RETRY_MS*Math.pow(2,i)); continue; } return {ok:false,status:0,json:null}; }
    if(res.ok) return {ok:true,status:res.status,json:await res.json()};
    if((res.status===429||res.status>=500)&&i<3){ await hrSleep(HR_RETRY_MS*Math.pow(2,i)); continue; }
    return {ok:false,status:res.status,json:null};
  }
  return {ok:false,status:0,json:null};
}
// 쓰기: 로그인 확인 → 요청. 401이면 다시 로그인해 1회 재시도, 429·5xx·네트워크 오류는 0.8초 뒤 1회 재시도(설계서 R2: 자동 재시도 1회 후 안내)
// 반환 {ok,status,json,retried} — retried=true면 재시도가 일어났다(호출한 쪽에서 중복 쓰기 여부 확인용)
async function hrSend(method,url,body){
  if(!accessToken){ await signIn(); if(!accessToken) return {ok:false,status:401,json:null,retried:false}; }
  const once=async()=>{
    try{
      const res=await fetch(url,{method,headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      let json=null; try{ json=await res.json(); }catch(e){}
      return {ok:res.ok,status:res.status,json};
    }catch(e){ return {ok:false,status:0,json:null}; }
  };
  let r=await once();
  if(r.ok) return {...r,retried:false};
  if(r.status===401){ accessToken=null; await signIn(); if(!accessToken) return {...r,retried:false}; r=await once(); return {...r,retried:true}; }
  if(r.status===0||r.status===429||r.status>=500){ await hrSleep(HR_RETRY_MS); r=await once(); return {...r,retried:true}; }
  return {...r,retried:false};
}
const hrRangeUrl=(k,range)=>`${HR_API}/values/${encodeURIComponent(HR_TABS[k].tab+'!'+range)}`;

// ── 읽기 ─────────────────────────────────────────────────────────────────────
// 시트 값(2차원 배열) → {headers, rows:[{…,_row:시트 행 번호}]} — 숫자 컬럼 콤마 제거는 toObj와 같은 규칙
function hrParse(values){
  const v=values||[]; const headers=(v[0]||[]).map(String);
  const rows=v.slice(1).map((r,i)=>{ const o={_row:i+2}; headers.forEach((h,j)=>{ let x=r[j]??''; if(NUMERIC_COLS.has(h)&&typeof x==='string'&&x.includes(',')) x=x.replace(/,/g,''); o[h]=x; }); return o; })
    .filter(o=>headers.some(h=>String(o[h]).trim()!==''));
  return {headers,rows};
}
// 여러 탭 읽기(TC-CMN01-01/02): batchGet 1회. 한 탭이라도 실패해 전체가 거부되면 탭별로 다시 읽어 실패한 탭만 실패로 표시한다.
// 반환 {tabs:{키:{ok,headers,rows,message?}}, failed:[키…], calls}
async function hrReadMany(keys){
  const out={tabs:{},failed:[],calls:0};
  const qs=keys.map(k=>'ranges='+encodeURIComponent(R[k][0]+'!'+R[k][1])).join('&');
  out.calls++;
  const b=await hrGet(`${HR_API}/values:batchGet?${qs}&key=${API_KEY}`);
  if(b.ok){
    const vr=b.json.valueRanges||[];
    keys.forEach((k,i)=>{ out.tabs[k]={ok:true,...hrParse((vr[i]||{}).values)}; });
    return out;
  }
  for(const k of keys){
    out.calls++;
    const r=await hrGet(`${HR_API}/values/${encodeURIComponent(R[k][0]+'!'+R[k][1])}?key=${API_KEY}`);
    if(r.ok) out.tabs[k]={ok:true,...hrParse(r.json.values)};
    else { out.tabs[k]={ok:false,headers:[],rows:[],message:HR_MSG.read(R[k][0])}; out.failed.push(k); }
  }
  return out;
}
// 실제 시트의 헤더 행을 읽어 정의와 맞는지 확인(캐시). 정의의 열 이름이 하나라도 없으면 실패.
async function hrHeader(k,force){
  if(!force&&hrHeaderCache[k]) return {ok:true,header:hrHeaderCache[k]};
  const r=await hrGet(hrRangeUrl(k,'1:1')+`?key=${API_KEY}`);
  if(!r.ok) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(HR_TABS[k].tab)};
  const header=((r.json.values||[])[0]||[]).map(String);
  const missing=HEADERS[k].filter(h=>!header.includes(h));
  if(missing.length) return {ok:false,code:'HEADER',message:`${HR_TABS[k].tab} 탭 헤더가 정의와 다릅니다 (없는 열: ${missing.join(', ')}).`};
  hrHeaderCache[k]=header;
  return {ok:true,header};
}
// ID 열(첫 열) 전체 읽기 → [{id,row}] (헤더 제외, 빈 칸 제외)
async function hrReadIds(k){
  const r=await hrGet(hrRangeUrl(k,'A:A')+`?key=${API_KEY}`);
  if(!r.ok) return null;
  const col=(r.json.values||[]);
  const out=[]; for(let i=1;i<col.length;i++){ const id=String((col[i]||[])[0]??'').trim(); if(id) out.push({id,row:i+1}); }
  return out;
}
// ID로 시트 행 번호 찾기. 읽기 실패 null, 없음 -1
async function hrFindRow(k,id){
  const ids=await hrReadIds(k); if(ids===null) return null;
  const hit=ids.find(x=>x.id===id); return hit?hit.row:-1;
}
// 시트 한 행을 객체로 읽기(헤더 이름 기준)
async function hrReadRow(k,row,header){
  const last=colLetter(Math.max(header.length,HEADERS[k].length));
  const r=await hrGet(hrRangeUrl(k,`A${row}:${last}${row}`)+`?key=${API_KEY}`);
  if(!r.ok) return null;
  const v=(r.json.values||[])[0]||[]; const o={};
  header.forEach((h,j)=>{ let x=v[j]??''; if(NUMERIC_COLS.has(h)&&typeof x==='string'&&x.includes(',')) x=x.replace(/,/g,''); o[h]=x; });
  return o;
}

// ── STF-CMN-02 ID 발번 ───────────────────────────────────────────────────────
// 저장 직전에 ID 열을 다시 읽어 같은 접두어(연도형이면 연도 포함)의 최대 번호+1부터 count개를 연속 발번한다.
// 반환 {ok:true, ids:[…]} / {ok:false, message}. 형식이 맞지 않는 ID는 계산에서 제외(무결성 점검 BAT-02에서 표시).
// 발번만 하고 쓰지 않은 번호는 시트에 남지 않으므로 다시 발번될 수 있다(R1 확정 — 별도 카운터 탭 없음).
async function hrNextIds(k,count=1,year){
  const spec=HR_TABS[k]&&HR_TABS[k].id;
  if(!spec) return {ok:false,message:HR_MSG.noId};
  const ids=await hrReadIds(k);
  if(ids===null) return {ok:false,code:'READ_FAIL',message:HR_MSG.noId};
  const head=spec.prefix+(spec.yearly?String(year||new Date(Date.now()+9*3600*1000).getUTCFullYear())+'-':'');
  let max=0;
  ids.forEach(({id})=>{
    if(!id.startsWith(head)) return;
    const tail=id.slice(head.length); if(!/^\d+$/.test(tail)) return;
    max=Math.max(max,parseInt(tail,10));
  });
  const out=[]; for(let i=1;i<=count;i++) out.push(head+String(max+i).padStart(spec.digits,'0'));
  return {ok:true,ids:out};
}

// ── STF-CMN-01 쓰기 ──────────────────────────────────────────────────────────
// 행 추가(TC-CMN01-03): ID 열이 비어 있으면 CMN-02로 발번해 마지막 행 다음에 한 줄 추가한다.
// opts.year — 연도형 ID(S32)의 기준 연도. 반환 {ok, id, row?} / {ok:false, code, message}
async function hrAppend(k,obj,opts={}){
  const t=HR_TABS[k]; if(!t) return {ok:false,code:'BAD_TAB',message:'알 수 없는 탭입니다: '+k};
  const h=await hrHeader(k); if(!h.ok) return h;
  const rec={...obj}, idName=HEADERS[k][0], today=hrToday();
  if(t.id&&!rec[idName]){
    const n=await hrNextIds(k,1,opts.year||(rec.received_at?String(rec.received_at).slice(0,4):undefined));
    if(!n.ok) return n;
    rec[idName]=n.ids[0];
  }
  ['created_at','updated_at'].forEach(c=>{ if(HEADERS[k].includes(c)&&(rec[c]===undefined||rec[c]==='')) rec[c]=today; });
  if(HEADERS[k].includes('updated_at')&&HEADERS[k].includes('created_at')&&obj.updated_at===undefined) rec.updated_at=rec.created_at; // 신규 입력은 수정일시=등록일 (S26 L열 규칙)
  const row=rowsFor(h.header,[rec])[0];
  const url=hrRangeUrl(k,'A:'+t.last)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  let r=await hrSend('POST',url,{values:[row]});
  if(!r.ok){
    // 재시도 뒤에도 실패. 재시도 전 요청이 실제로는 반영됐을 수 있으므로(중복 추가 방지) 같은 ID가 이미 있는지 확인한다.
    if(r.retried&&rec[idName]){ const f=await hrFindRow(k,rec[idName]); if(f&&f>0) return {ok:true,id:rec[idName],row:f}; }
    return {ok:false,code:'WRITE_FAIL',message:HR_MSG.write};
  }
  if(r.retried&&rec[idName]){ // 재시도로 성공한 경우, 첫 요청이 이미 반영됐다면 같은 ID가 두 번 쓰였을 수 있다
    const ids=await hrReadIds(k);
    if(ids){ const hits=ids.filter(x=>x.id===rec[idName]); if(hits.length>1){ await hrDeleteRowRaw(k,hits[hits.length-1].row); } }
  }
  const m=/!A(\d+)/.exec((r.json&&r.json.updates&&r.json.updates.updatedRange)||'');
  return {ok:true,id:rec[idName],row:m?parseInt(m[1],10):undefined};
}
// 충돌 판단: 읽은 시점의 수정일시가 지금 시트와 다르거나, 화면이 읽어 둔 행 내용(readRow)이 지금 시트 행과 다르면 충돌.
// ※ 수정일시(updated_at)는 날짜(YYYY-MM-DD)까지만 저장되므로 같은 날 두 번 고친 경우는 일시만으로는 구분되지 않는다 —
//   그래서 호출하는 화면은 hrReadMany가 돌려준 행 객체(readRow)도 함께 넘기는 것을 원칙으로 한다.
function hrConflict(k,cur,opts){
  const has=HEADERS[k].includes('updated_at');
  if(has&&opts.readUpdatedAt!==undefined&&String(cur.updated_at??'')!==String(opts.readUpdatedAt??'')) return true;
  if(opts.readRow){
    for(const c of HEADERS[k]){ if(c==='updated_at'&&has&&opts.readUpdatedAt!==undefined) continue;
      if(String(cur[c]??'')!==String(opts.readRow[c]??'')) return true; }
  }
  return false;
}
// 행 수정(TC-CMN01-04/05): 쓰기 직전 대상 행을 다시 읽어 충돌을 확인한 뒤, 바뀐 셀만 쓰고 수정일시를 갱신한다.
// opts.readUpdatedAt — 읽은 시점의 수정일시(수정일시 열이 있는 탭 필수), opts.readRow — 읽은 시점의 행 객체(권장)
async function hrUpdate(k,id,changes,opts={}){
  const t=HR_TABS[k]; if(!t) return {ok:false,code:'BAD_TAB',message:'알 수 없는 탭입니다: '+k};
  const hasUpd=HEADERS[k].includes('updated_at');
  if(opts.readUpdatedAt===undefined&&!opts.readRow) return {ok:false,code:'NO_BASIS',message:'읽은 시점의 수정일시 또는 행 내용이 필요합니다.'};
  const bad=Object.keys(changes).filter(c=>!HEADERS[k].includes(c)); if(bad.length) return {ok:false,code:'BAD_COL',message:'정의에 없는 열입니다: '+bad.join(', ')};
  const h=await hrHeader(k); if(!h.ok) return h;
  const row=await hrFindRow(k,id);
  if(row===null) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(t.tab)};
  if(row<0) return {ok:false,code:'NOT_FOUND',message:HR_MSG.notFound};
  const cur=await hrReadRow(k,row,h.header);
  if(cur===null) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(t.tab)};
  if(hrConflict(k,cur,opts)) return {ok:false,code:'CONFLICT',message:HR_MSG.conflict};
  const upd={...changes}; if(hasUpd&&upd.updated_at===undefined) upd.updated_at=hrToday();
  const data=Object.keys(upd).map(c=>{
    const col=colLetter(h.header.indexOf(c)+1);
    return {range:`${t.tab}!${col}${row}`,values:[rowsFor([c],[upd])[0]]};
  });
  const r=await hrSend('POST',`${HR_API}/values:batchUpdate`,{valueInputOption:'RAW',data});
  if(!r.ok) return {ok:false,code:'WRITE_FAIL',message:HR_MSG.write};
  return {ok:true,row,updated_at:upd.updated_at};
}
// 탭 이름 → sheetId (행 삭제에 필요). 캐시.
async function hrSheetIds(){
  if(hrSheetIdCache) return hrSheetIdCache;
  const r=await hrGet(`${HR_API}?fields=sheets.properties(sheetId,title)&key=${API_KEY}`);
  if(!r.ok) return null;
  hrSheetIdCache=Object.fromEntries((r.json.sheets||[]).map(s=>[s.properties.title,s.properties.sheetId]));
  return hrSheetIdCache;
}
async function hrDeleteRowRaw(k,row){
  const ids=await hrSheetIds(); const sid=ids&&ids[HR_TABS[k].tab];
  if(sid===undefined) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(HR_TABS[k].tab)};
  const r=await hrSend('POST',`${HR_API}:batchUpdate`,{requests:[{deleteDimension:{range:{sheetId:sid,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]});
  return r.ok?{ok:true}:{ok:false,code:'WRITE_FAIL',message:HR_MSG.write};
}
// 행 삭제(TC-CMN01-06/07): 허용한 탭(기본 S26)만. 삭제 뒤 아래 행이 당겨지므로 호출한 화면은 탭을 다시 읽어야 한다.
async function hrDelete(k,id,opts={}){
  if(!HR_TABS[k]) return {ok:false,code:'BAD_TAB',message:'알 수 없는 탭입니다: '+k};
  if(!HR_DELETABLE.has(k)) return {ok:false,code:'NOT_ALLOWED',message:HR_MSG.notAllowed(HR_TABS[k].tab)}; // 네트워크 호출 전에 거절
  const h=await hrHeader(k); if(!h.ok) return h;
  const row=await hrFindRow(k,id);
  if(row===null) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(HR_TABS[k].tab)};
  if(row<0) return {ok:false,code:'NOT_FOUND',message:HR_MSG.notFound};
  if(opts.readUpdatedAt!==undefined||opts.readRow){
    const cur=await hrReadRow(k,row,h.header);
    if(cur===null) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(HR_TABS[k].tab)};
    if(hrConflict(k,cur,opts)) return {ok:false,code:'CONFLICT',message:HR_MSG.conflict};
  }
  const d=await hrDeleteRowRaw(k,row); if(!d.ok) return d;
  return {ok:true,row};
}
// 전체 덮어쓰기: 소규모 탭(mode:'full')만. 행 단위 탭을 통째로 덮어쓰면 동시 수정에 취약하므로 거절한다.
async function hrOverwrite(k,list){
  const t=HR_TABS[k]; if(!t) return {ok:false,code:'BAD_TAB',message:'알 수 없는 탭입니다: '+k};
  if(t.mode!=='full') return {ok:false,code:'NOT_ALLOWED',message:`${t.tab} 탭은 전체 덮어쓰기가 허용되지 않습니다. 행 단위로 저장해 주세요.`};
  const ok=await clearAndWrite(...W[k],[HEADERS[k],...rowsFor(HEADERS[k],list)]);
  return ok?{ok:true}:{ok:false,code:'WRITE_FAIL',message:HR_MSG.write};
}
