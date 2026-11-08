// HFC cmn-merge.js v2.9.81 — STF-CMN-09 동일인 합침 (쓰기)
// 근거: 프로그램 설계서 §26(CMN-09), DB 물리 설계 v0.1 §9 "동일인 합침". 같은 사람이 후보 두 건으로 등록된 경우 한 건으로 합친다. 합친 뒤에는 되돌릴 수 없다.
// 하는 일: 없앨 후보에 달린 역할·기술·경력·자격·투입·접촉·이력서·구분·의뢰 연결·연락처를 유지할 후보로 옮기고, 없앨 후보 행은 지우지 않고 merged_into/is_active=N 으로 숨긴다.
// 원칙: 쓰기 직전에 관련 탭을 다시 읽는다 / 읽기가 하나라도 실패하면 쓰지 않는다 / 없앨 후보 행은 맨 마지막에 숨긴다 → 중간에 멈추면 다시 실행해 이어서 처리할 수 있다.
// 단계 기록(S38)은 건드리지 않는다(cand_id 로 연결돼 있어 S31 의 person_id 만 바뀌면 그대로 이어진다).
// 의존: schema.js, cmn-sheet.js(hrReadMany·hrUpdate·hrAppend·hrSend·HR_API·hrNow·hrToday), cmn-person.js(cmnPersonHidden)

const CMN_MERGE_MOVE=['S21','S22','S23','S24','S25','S26','S28','S29','S31'];   // person_id 를 바꿔 옮기는 탭
const CMN_MERGE_LABEL={S21:'역할',S22:'기술',S23:'경력',S24:'학력·자격',S25:'투입·현행 프로젝트',S26:'접촉 이력',S28:'이력서 파일',S29:'구분(평가)',S31:'의뢰 연결',S39:'연락처'};
const CMN_MERGE_MSG={
  same:'서로 다른 후보를 선택해 주세요.',
  sameRequest:'같은 의뢰에 두 후보가 모두 있습니다. 한쪽을 먼저 정리해 주세요.',
  bothActive:'두 후보 모두 현행 프로젝트가 진행 중입니다. 한쪽을 먼저 종료 처리해 주세요.',
  notFound:'합칠 후보를 찾을 수 없습니다.',
  hidden:'이미 다른 후보에 합침되었거나 비활성인 후보입니다.',
};
const CMN_MERGE_FILL_S20=p=>!['person_id','name','merged_into','is_active','created_at','updated_at','review_state'].includes(p);
const CMN_MERGE_FILL_S39=['rid_head7','mobile','email','contact_source','contact_requested_at','contact_acquired_at'];

// 합침 전 확인: 옮겨질 건수를 센다(읽기만). 반환 {ok,keep,drop,counts,blocked?,tabs} / {ok:false,code,message}
async function cmnMergePreview(keepId,dropId){
  if(!keepId||!dropId||keepId===dropId) return {ok:false,code:'SAME',message:CMN_MERGE_MSG.same};
  const keys=['S20',...CMN_MERGE_MOVE,'S33','S39'];
  const r=await hrReadMany(keys);
  if(r.failed.length) return {ok:false,code:'READ_FAIL',message:HR_MSG.read(R[r.failed[0]][0])};
  const T=k=>r.tabs[k].rows;
  const keep=T('S20').find(p=>p.person_id===keepId), drop=T('S20').find(p=>p.person_id===dropId);
  if(!keep||!drop) return {ok:false,code:'NOT_FOUND',message:CMN_MERGE_MSG.notFound};
  if(cmnPersonHidden(keep)||cmnPersonHidden(drop)) return {ok:false,code:'HIDDEN',message:CMN_MERGE_MSG.hidden};
  const counts={}; CMN_MERGE_MOVE.forEach(k=>{ counts[k]=T(k).filter(x=>x.person_id===dropId).length; });
  counts.S39=T('S39').some(x=>x.person_id===dropId)?1:0;
  let blocked=null;
  // 같은 의뢰에 두 후보가 모두 연결돼 있으면 중단(S31 유일성: 의뢰 라인·후보·경로)
  const lineReq=new Map(T('S33').map(l=>[l.line_id,l.request_id]));
  const reqOf=id=>new Set(T('S31').filter(c=>c.person_id===id).map(c=>lineReq.get(c.line_id)||c.line_id));
  const kr=reqOf(keepId); if([...reqOf(dropId)].some(x=>kr.has(x))) blocked={code:'SAME_REQUEST',message:CMN_MERGE_MSG.sameRequest};
  // 후보당 진행 중 현행 프로젝트는 하나(S25 유일성)
  if(!blocked){ const act=id=>T('S25').some(a=>a.person_id===id&&String(a.status??'').trim()==='진행'); if(act(keepId)&&act(dropId)) blocked={code:'BOTH_ACTIVE',message:CMN_MERGE_MSG.bothActive}; }
  return {ok:true,keep,drop,counts,blocked,tabs:r.tabs};
}
const cmnMergeSummary=counts=>CMN_MERGE_MOVE.concat(['S39']).filter(k=>counts[k]>0).map(k=>`${CMN_MERGE_LABEL[k]} ${counts[k]}건`).join(', ')||'옮길 항목 없음';

// 행 번호별 셀 쓰기. changes:[{row,vals:{열이름:값}}] → values:batchUpdate (200셀씩)
async function cmnMergeWrite(k,header,changes){
  const data=[]; const t=HR_TABS[k];
  changes.forEach(c=>Object.keys(c.vals).forEach(col=>{ const i=header.indexOf(col); if(i<0) return; data.push({range:`${t.tab}!${colLetter(i+1)}${c.row}`,values:[[c.vals[col]]]}); }));
  for(let i=0;i<data.length;i+=200){
    const x=await hrSend('POST',`${HR_API}/values:batchUpdate`,{valueInputOption:'RAW',data:data.slice(i,i+200)});
    if(!x.ok) return false;
  }
  return true;
}

// 합침 실행. 반환 {ok:true,moved} / {ok:false,message,moved,failedStep}
async function cmnMergeRun(keepId,dropId){
  const pv=await cmnMergePreview(keepId,dropId); if(!pv.ok) return pv;
  if(pv.blocked) return {ok:false,code:pv.blocked.code,message:pv.blocked.message,moved:{}};
  const moved={}; const now=hrNow();
  const fail=(step,why)=>({ok:false,code:'WRITE_FAIL',failedStep:step,moved:{...moved},message:`${why||HR_MSG.write} 이미 옮긴 항목: ${cmnMergeSummary(moved)}. 다시 합침을 실행하면 남은 항목부터 이어서 처리합니다.`});
  // 1) person_id 교체 (이력서는 버전 번호를 이어 붙인다)
  for(const k of CMN_MERGE_MOVE){
    const tab=pv.tabs[k]; const rows=tab.rows.filter(x=>x.person_id===dropId); if(!rows.length) continue;
    let ch;
    if(k==='S28'){
      const maxV=Math.max(0,...tab.rows.filter(x=>x.person_id===keepId).map(x=>parseInt(x.version_no)||0));
      const ord=rows.slice().sort((a,b)=>String(a.received_at||'').localeCompare(String(b.received_at||''))||(parseInt(a.version_no)||0)-(parseInt(b.version_no)||0)||String(a.file_id).localeCompare(String(b.file_id)));
      ch=ord.map((x,i)=>({row:x._row,vals:{person_id:keepId,version_no:maxV+i+1,...(x.parse_status==='동일인확인'?{parse_status:'합침완료'}:{})}}));
      // 없앨 후보를 "같은 사람 후보"로 가리키던 다른 파일은 유지 후보를 가리키게 한다
      tab.rows.filter(x=>x.person_id!==dropId&&x.match_person_id===dropId).forEach(x=>ch.push({row:x._row,vals:{match_person_id:keepId}}));
    } else ch=rows.map(x=>({row:x._row,vals:{person_id:keepId,...(tab.headers.includes('updated_at')?{updated_at:now}:{})}}));
    if(!await cmnMergeWrite(k,tab.headers,ch)) return fail(k);
    moved[k]=rows.length;
  }
  // 2) 연락처(S39): 유지 후보의 빈 항목만 채운다. 없앨 후보의 행은 그대로 둔다.
  const p39=pv.tabs.S39.rows; const kRow=p39.find(x=>x.person_id===keepId), dRow=p39.find(x=>x.person_id===dropId);
  if(dRow){
    if(!kRow){ const rec={person_id:keepId}; CMN_MERGE_FILL_S39.forEach(c=>{ rec[c]=dRow[c]||''; }); const a=await hrAppend('S39',rec); if(!a.ok) return fail('S39',a.message); }
    else { const chg={}; CMN_MERGE_FILL_S39.forEach(c=>{ if(cmnBlank(kRow[c])&&!cmnBlank(dRow[c])) chg[c]=dRow[c]; });
      if(Object.keys(chg).length){ const u=await hrUpdate('S39',keepId,chg,{readUpdatedAt:kRow.updated_at}); if(!u.ok) return fail('S39',u.message); } }
    moved.S39=1;
  }
  // 3) 후보자(S20): 유지 후보의 빈 항목을 채우고, 값이 둘 다 있으면 유지 후보 값을 쓴다
  const chg={}; HEADERS.S20.filter(CMN_MERGE_FILL_S20).forEach(c=>{ if(cmnBlank(pv.keep[c])&&!cmnBlank(pv.drop[c])) chg[c]=pv.drop[c]; });
  if(Object.keys(chg).length){ const u=await hrUpdate('S20',keepId,chg,{readUpdatedAt:pv.keep.updated_at}); if(!u.ok) return fail('S20',u.message); }
  // 4) 맨 마지막: 없앨 후보를 숨긴다(삭제하지 않음)
  const h=await hrUpdate('S20',dropId,{merged_into:keepId,is_active:'N'},{readUpdatedAt:pv.drop.updated_at}); if(!h.ok) return fail('S20',h.message);
  return {ok:true,moved,keep:pv.keep,drop:pv.drop};
}
