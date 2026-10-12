// HFC cmn-init.js v2.9.73 — STF-CMN-03 시트 초기화("시트 준비")
// 근거: 프로그램 설계서 §20, DB 물리 설계 v0.1 §6(서식·검증)·§7(시드), 결정 P2
// 하는 일: 신규 탭 18개를 정해진 열 순서·텍스트 서식·드롭다운 검증·헤더 고정/보호로 만들고, 기본 거래처 2건과 기본 코드·설정값을 넣는다.
// 지키는 것: 이미 있는 탭·데이터는 비우거나 덮어쓰지 않는다 / 다른 헤더는 고치지 않고 보고만 한다 / 다시 실행해도 안전하다.
// 의존: schema.js, common.js, cmn-sheet.js (hrGet·hrSend·hrAppend·hrReadIds·hrToday)

const HR_INIT_MSG={
  create:'탭을 만들 수 없습니다. 로그인 상태와 시트 권한을 확인해 주세요.',
  meta:'시트 정보를 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
};
// 탭 하나를 만드는 요청 묶음 — 한 번의 batchUpdate(전부 성공 또는 전부 취소)이므로 중간에 끊겨도 "헤더 없는 탭"이 남지 않는다.
// 탭 번호 순서(S20, S21 … S39) — 시트 아래쪽 탭 줄에서 찾기 쉽도록 이 순서로 만들고 정렬한다(변경 002, 사용자 승인 2026-10-12)
const HR_NUM_ORDER=[...HR_ORDER].sort((a,b)=>parseInt(a.slice(1),10)-parseInt(b.slice(1),10));
function hrCreateRequests(k,sid,index){
  const t=HR_TABS[k], cols=HR_COLS[k];
  const req=[
    {addSheet:{properties:{sheetId:sid,title:t.tab,index,gridProperties:{rowCount:t.rows,columnCount:cols.length,frozenRowCount:1}}}},
    {updateCells:{start:{sheetId:sid,rowIndex:0,columnIndex:0},fields:'userEnteredValue',
      rows:[{values:cols.map(c=>({userEnteredValue:{stringValue:c.name}}))}]}},
  ];
  cols.forEach((c,i)=>{
    const range={sheetId:sid,startRowIndex:1,startColumnIndex:i,endColumnIndex:i+1};
    if(c.text) req.push({repeatCell:{range,cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}});
    if(c.enum) req.push({setDataValidation:{range,rule:{condition:{type:'ONE_OF_LIST',values:c.enum.map(v=>({userEnteredValue:v}))},strict:true,showCustomUi:true}}});
  });
  // 헤더 행 보호 — 경고형(수정하려 하면 확인 창이 뜸). 잠금형은 소유자 외 편집자가 막혀 에이전트·다른 사용자 작업을 방해할 수 있어 경고형으로 한다.
  req.push({addProtectedRange:{protectedRange:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1},description:'헤더 행 — 열 이름을 바꾸면 화면과 에이전트가 동작하지 않습니다',warningOnly:true}}});
  return req;
}
// S10에 없는 기본 코드·설정값만 추가. 읽기가 실패하면 쓰지 않는다.
async function hrSeedS10(){
  const r=await hrGet(`${HR_API}/values/${encodeURIComponent(R.S10[0]+'!'+R.S10[1])}?key=${API_KEY}`);
  if(!r.ok) return {ok:false,message:'설정(S10)을 읽을 수 없어 기본 코드를 넣지 않았습니다.'};
  const values=r.json.values||[]; const header=(values[0]||[]).map(String);
  const need=['setting_key','setting_value','category'];
  if(!need.every(h=>header.includes(h))) return {ok:false,message:'S10 헤더가 정의와 다릅니다 — 기본 코드를 넣지 않았습니다.'};
  const ix=Object.fromEntries(header.map((h,i)=>[h,i]));
  const have=new Set(); values.slice(1).forEach(row=>{ const key=String(row[ix.setting_key]??'').trim(); if(key) have.add(String(row[ix.category]??'')+'|'+key); });
  const today=hrToday(); const add=[]; let existed=0;
  const push=(category,key,value,desc)=>{
    if(have.has(category+'|'+key)){ existed++; return; }
    const row=header.map(()=>''); row[ix.setting_key]=key; row[ix.setting_value]=value; row[ix.category]=category;
    if(ix.description!==undefined) row[ix.description]=desc||''; if(ix.updated_at!==undefined) row[ix.updated_at]=today;
    add.push(row);
  };
  Object.entries(HR_SEED_CODES).forEach(([cat,names])=>names.forEach(n=>push(cat,n,'','')));
  HR_SEED_SETTINGS.forEach(s=>push(S10_HR_SETTING_CAT,s.key,s.value,s.desc));
  if(!add.length) return {ok:true,added:0,existed};
  // 읽기 범위(R.S10)를 넘는 행은 화면이 못 읽는다 — 넘칠 경우 쓰지 않고 알린다.
  const limit=parseInt(R.S10[1].replace(/\D+/g,' ').trim().split(' ').pop(),10);
  if(values.length+add.length>limit) return {ok:false,message:`S10 행이 읽기 범위(${limit}행)를 넘게 되어 기본 코드를 넣지 않았습니다.`};
  const w=await hrSend('POST',`${HR_API}/values/${encodeURIComponent(R.S10[0]+'!A:'+colLetter(header.length))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{values:add});
  return w.ok?{ok:true,added:add.length,existed}:{ok:false,message:HR_MSG.write};
}
// 인력 모듈 탭 18개를 번호순으로 나란히 둔다. 다른 탭(S01~S17 등)의 상대 순서는 그대로, 인력 모듈 탭만 그 뒤로 모은다. 탭 위치만 바뀌고 데이터는 건드리지 않는다.
// 구글의 순서 이동은 "이동 전 기준 위치"를 쓰므로, 앞에서부터 차례로 제 위치로 옮긴다(앞 칸은 이미 확정이므로 항상 앞쪽으로 이동).
async function hrOrderTabs(){
  const meta=await hrGet(`${HR_API}?fields=sheets.properties(sheetId,title,index)&key=${API_KEY}`);
  if(!meta.ok) return {ok:false,message:HR_INIT_MSG.meta};
  const list=(meta.json.sheets||[]).map(x=>x.properties).sort((a,b)=>a.index-b.index);
  const mineTitles=new Set(HR_NUM_ORDER.map(k=>HR_TABS[k].tab));
  const others=list.filter(p=>!mineTitles.has(p.title));
  const mine=HR_NUM_ORDER.map(k=>list.find(p=>p.title===HR_TABS[k].tab)).filter(Boolean);
  const desired=[...others,...mine];
  const first=desired.findIndex((p,i)=>list[i].sheetId!==p.sheetId);
  if(first<0) return {ok:true,changed:false};
  const requests=desired.slice(first).map((p,j)=>({updateSheetProperties:{properties:{sheetId:p.sheetId,index:first+j},fields:'index'}}));
  const w=await hrSend('POST',`${HR_API}:batchUpdate`,{requests});
  return w.ok?{ok:true,changed:true}:{ok:false,message:'탭 순서를 바꾸지 못했습니다. 로그인 상태와 시트 권한을 확인해 주세요.'};
}
// 시트 준비 실행. onProgress(문구)는 선택. 반환 {ok, tabs:[{target,status,message}], seeds:[{target,status,message}], message?}
//   status: created(새로 만들어짐) / exists(이미 있음) / header(헤더 불일치) / fail(실패) / skipped(미실행)
async function hrInitSheets(onProgress){
  const say=m=>{ try{ if(onProgress) onProgress(m); }catch(e){} };
  const out={ok:true,tabs:[],seeds:[]};
  Object.keys(hrHeaderCache).forEach(k=>delete hrHeaderCache[k]); hrSheetIdCache=null;
  const meta=await hrGet(`${HR_API}?fields=sheets.properties(sheetId,title)&key=${API_KEY}`);
  if(!meta.ok){ out.ok=false; out.message=HR_INIT_MSG.meta; return out; }
  const sheets=meta.json.sheets||[]; const byTitle=Object.fromEntries(sheets.map(s=>[s.properties.title,s.properties.sheetId]));
  let nextIndex=sheets.length; let nextId=sheets.reduce((m,s)=>Math.max(m,s.properties.sheetId),0)+1;
  let stopped=false;
  for(const k of HR_NUM_ORDER){
    const t=HR_TABS[k];
    if(stopped){ out.tabs.push({target:t.tab,status:'skipped',message:'미실행'}); continue; }
    say(t.tab);
    if(byTitle[t.tab]!==undefined){ // 이미 있는 탭: 헤더만 읽어 비교하고 고치지 않는다
      const h=await hrGet(`${HR_API}/values/${encodeURIComponent(t.tab+'!1:1')}?key=${API_KEY}`);
      if(!h.ok){ out.tabs.push({target:t.tab,status:'fail',message:'헤더를 읽을 수 없습니다.'}); out.ok=false; stopped=true; continue; }
      const got=((h.json.values||[])[0]||[]).map(String);
      const same=got.length===HEADERS[k].length&&HEADERS[k].every((n,i)=>got[i]===n);
      out.tabs.push(same?{target:t.tab,status:'exists',message:'이미 있음'}:{target:t.tab,status:'header',message:`${t.tab} 탭 헤더가 정의와 다릅니다`});
      continue;
    }
    const sid=nextId++;
    const r=await hrSend('POST',`${HR_API}:batchUpdate`,{requests:hrCreateRequests(k,sid,nextIndex)});
    if(r.ok){ out.tabs.push({target:t.tab,status:'created',message:'새로 만들어짐'}); byTitle[t.tab]=sid; nextIndex++; }
    else { out.tabs.push({target:t.tab,status:'fail',message:HR_INIT_MSG.create}); out.ok=false; out.message=HR_INIT_MSG.create; stopped=true; }
  }
  if(stopped) return out; // 만들기에 실패하면 기본 행·코드는 넣지 않는다(다시 실행하면 이어서 진행)
  // 탭 순서 정리(번호순)
  say('탭 순서');
  const o=await hrOrderTabs();
  out.seeds.push(o.ok?{target:'탭 순서(번호순)',status:o.changed?'created':'exists',message:o.changed?'번호순으로 정렬함':'이미 번호순'}:{target:'탭 순서(번호순)',status:'fail',message:o.message});
  if(!o.ok) out.ok=false;
  // 기본 거래처(S27)
  if(out.tabs.find(x=>x.target===HR_TABS.S27.tab).status==='header'){
    out.seeds.push({target:'S27 기본 거래처',status:'skipped',message:'S27 헤더가 정의와 다르므로 넣지 않았습니다.'});
  } else {
    say('S27 기본 행');
    const ids=await hrReadIds('S27');
    if(ids===null) out.seeds.push({target:'S27 기본 거래처',status:'fail',message:HR_MSG.read(HR_TABS.S27.tab)});
    else {
      for(const p of HR_SEED_PARTIES){
        if(ids.some(x=>x.id===p.party_id)){ out.seeds.push({target:`${p.party_id} ${p.name}`,status:'exists',message:'이미 있음'}); continue; }
        const a=await hrAppend('S27',p);
        out.seeds.push({target:`${p.party_id} ${p.name}`,status:a.ok?'created':'fail',message:a.ok?'추가됨':a.message});
        if(!a.ok) out.ok=false;
      }
    }
  }
  // 기본 코드·설정값(S10)
  say('S10 기본 코드');
  const s=await hrSeedS10();
  out.seeds.push(s.ok?{target:'S10 기본 코드·설정값',status:s.added?'created':'exists',message:s.added?`${s.added}건 추가 (이미 있는 ${s.existed}건은 그대로)`:'이미 있음'}
                     :{target:'S10 기본 코드·설정값',status:'fail',message:s.message});
  if(!s.ok) out.ok=false;
  return out;
}
