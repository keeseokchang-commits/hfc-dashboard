// HFC cmn-drive.js v2.11.0 — 이력서 드라이브 연동 (설계서 resume-intake-process-design v0.2 Phase 2, 사용자 승인 2026-11-02)
// 하는 일: New 폴더 읽기 · 이력서 올리기(속성 부착) · Result 폴더의 결과 파일 읽기 · 처리 끝난 파일 옮기기(New→Done/Fail, Fail→New, Result→Done 보관).
// 안전장치(설계서 §7): ① 폴더 번호는 이 파일 상수(drive-folders-v0.1)에서만 온다 ② 옮기기는 아래 허용표의 조합만, 그리고 파일이 실제로 출발 폴더에 있을 때만
//   ③ 삭제·이름 바꾸기·복사는 만들지 않았다 ④ 폴더 만들기는 Done 아래 「결과 보관」 하나뿐.
// 의존: auth.js(authFetch·authHasDrive), cmn-sheet.js 는 쓰지 않는다(시트 처리는 화면 코드가 한다).
const DRV={parent:'1QTRj7_6tuWFtl03D9B4PJcVKLZDmhOc7',NEW:'1vqCHjkuroS_ra477ZHOFwWE2TuHr5YhA',DONE:'1NdeNccd-rzu8gOYCpy6qj76HXaCEsZ_e',FAIL:'14kxW4rIb6QCB12uwvXYsmHxrvE6cvcDh',RESULT:'',ARCHIVE:''};
const DRV_API='https://www.googleapis.com/drive/v3', DRV_UP='https://www.googleapis.com/upload/drive/v3';
const DRV_FOLDER='application/vnd.google-apps.folder';
const DRV_EXT=['pdf','docx','doc','pptx'];                 // 0단계 시험에서 읽은 형식
const DRV_FIELDS='id,name,mimeType,size,createdTime,parents,appProperties,sha256Checksum,webViewLink';
const DRV_MOVES={NEW:['DONE','FAIL'],FAIL:['NEW'],RESULT:['ARCHIVE']};   // 옮길 수 있는 (출발→도착) 조합 전부
const DRV_MSG={scope:'드라이브 권한이 없습니다. 「드라이브 권한 허용」을 눌러 주세요.',api:'드라이브를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.',noResult:'드라이브 HFC_human_resource 아래에 Result 폴더가 없습니다. 폴더를 만들면 Claude 가 읽은 결과를 여기서 바로 받을 수 있습니다.',
  ext:'받을 수 있는 형식이 아닙니다(pdf, docx, doc, pptx).'};

class DriveError extends Error{ constructor(msg,status){ super(msg); this.status=status||0; } }
const driveHas=()=>typeof authHasDrive==='function'&&authHasDrive();
const drvQ=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
async function drvJson(url,opts){
  let res; try{ res=await authFetch(url,opts); }catch(e){ throw new DriveError(DRV_MSG.api,0); }
  if(!res||!res.ok) throw new DriveError(res&&res.status===403?DRV_MSG.scope:DRV_MSG.api,res?res.status:0);
  return res;
}
// 폴더 안의 파일(폴더 제외) 전부
async function driveList(folderId,extraQ){
  const out=[]; let tok='';
  do{
    const q=`'${folderId}' in parents and trashed=false and mimeType!='${DRV_FOLDER}'${extraQ?' and '+extraQ:''}`;
    const u=`${DRV_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(`nextPageToken,files(${DRV_FIELDS})`)}&pageSize=200&orderBy=createdTime${tok?'&pageToken='+encodeURIComponent(tok):''}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const j=await (await drvJson(u)).json(); out.push(...(j.files||[])); tok=j.nextPageToken||'';
  }while(tok);
  return out;
}
// 이름으로 찾는 폴더(상위 폴더 바로 아래)
async function driveFindFolder(parentId,name){
  const q=`'${parentId}' in parents and trashed=false and mimeType='${DRV_FOLDER}' and name='${drvQ(name)}'`;
  const j=await (await drvJson(`${DRV_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name)')}&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
  return (j.files||[])[0]||null;
}
async function driveFindResult(){
  if(DRV.RESULT) return DRV.RESULT;
  const f=await driveFindFolder(DRV.parent,'Result'); if(f) DRV.RESULT=f.id; return DRV.RESULT;
}
async function driveEnsureArchive(){     // Done 아래 「결과 보관」 — 이 앱이 만드는 유일한 폴더
  if(DRV.ARCHIVE) return DRV.ARCHIVE;
  const f=await driveFindFolder(DRV.DONE,'결과 보관'); if(f){ DRV.ARCHIVE=f.id; return f.id; }
  const res=await drvJson(`${DRV_API}/files?fields=id&supportsAllDrives=true`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'결과 보관',mimeType:DRV_FOLDER,parents:[DRV.DONE]})});
  DRV.ARCHIVE=(await res.json()).id; return DRV.ARCHIVE;
}
// 화면이 한 번에 쓰는 현황: New·Fail·Result 의 파일 목록. 실패하면 throw.
async function driveSnapshot(){
  const [nw,fl,rid]=await Promise.all([driveList(DRV.NEW),driveList(DRV.FAIL),driveFindResult()]);
  const rs=rid?(await driveList(rid)).filter(f=>/\.json$/i.test(f.name||'')):[];
  return {newFiles:nw,failFiles:fl,resultFiles:rs,resultFolder:!!rid};
}
async function driveReadText(fileId){ return await (await drvJson(`${DRV_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`)).text(); }

// ── 해시·형식·중복 ────────────────────────────────────────────────────────────
const drvExt=n=>{ const m=/\.([A-Za-z0-9]+)$/.exec(String(n||'')); return m?m[1].toLowerCase():''; };
const drvExtOk=n=>DRV_EXT.includes(drvExt(n));
async function drvSha16(blob){ const d=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16); }
const drvH16=f=>String((f&&f.sha256Checksum)||'').toLowerCase().slice(0,16);
const drvRowMatches=(row,f)=>{ const h=drvH16(f); return (row.drive_file_id&&row.drive_file_id===f.id)||(h&&String(row.file_hash||'').toLowerCase().slice(0,16)===h); };
// 올리기 전 중복 확인 → '' 이면 올려도 됨, 아니면 사람에게 보여 줄 이유
function drvDupReason(hash16,s28,newFiles,nameOf){
  const row=(s28||[]).find(r=>r.file_hash&&String(r.file_hash).toLowerCase().slice(0,16)===hash16);
  if(row){ const who=row.person_id&&nameOf?nameOf(row.person_id):''; return `이미 등록된 이력서${who&&who!=='-'?' — '+who:''}`; }
  if((newFiles||[]).some(f=>drvH16(f)===hash16)) return '이미 New 폴더에 있는 이력서';
  return '';
}
// New 파일 분류(순수 함수): 읽을 대상 / 이미 처리됐는데 옮기지 못한 것(어디로 옮길지 포함)
const DRV_FAILS=['읽기실패','처리종료'];
function drvClassify(newFiles,s28){
  const pending=[], stuck=[];
  (newFiles||[]).forEach(f=>{
    const row=(s28||[]).find(r=>drvRowMatches(r,f)); const st=String((row&&row.parse_status)||'').trim();
    if(!row||st==='대기'||!st) return pending.push(f);
    if(DRV_FAILS.includes(st)){ if(f.appProperties&&f.appProperties.reread) pending.push(f); else stuck.push({file:f,row,to:'FAIL'}); }   // 다시 읽기로 되돌린 파일은 읽을 대상
    else stuck.push({file:f,row,to:'DONE'});
  });
  return {pending,stuck};
}

// ── 올리기 ──────────────────────────────────────────────────────────────────
async function driveUpload(file,props){
  const b='hfc'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  const meta=JSON.stringify({name:file.name,parents:[DRV.NEW],appProperties:props||{}});
  const body=new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${file.type||'application/octet-stream'}\r\n\r\n`,file,`\r\n--${b}--`]);
  const res=await drvJson(`${DRV_UP}/files?uploadType=multipart&fields=${encodeURIComponent(DRV_FIELDS)}&supportsAllDrives=true`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${b}`},body});
  return await res.json();
}

// ── 옮기기 ──────────────────────────────────────────────────────────────────
async function driveMove(fileId,from,to,props){
  if(!(DRV_MOVES[from]||[]).includes(to)) throw new DriveError('허용되지 않은 이동입니다.',0);
  const fid=await (from==='RESULT'?driveFindResult():DRV[from]); const tid=to==='ARCHIVE'?await driveEnsureArchive():DRV[to];
  if(!fid||!tid) throw new DriveError(DRV_MSG.noResult,0);
  const cur=await (await drvJson(`${DRV_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,parents')}&supportsAllDrives=true`)).json();
  if(!(cur.parents||[]).includes(fid)) return {skipped:true};   // 출발 폴더에 없는 파일(이미 옮겨졌거나 폴더 밖)은 건드리지 않는다
  const body=props?JSON.stringify({appProperties:props}):'{}';
  const res=await drvJson(`${DRV_API}/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(tid)}&removeParents=${encodeURIComponent(fid)}&fields=id,parents&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
  return await res.json();
}

// ── 결과 JSON ↔ New 파일 맞추기 ────────────────────────────────────────────────
const drvDay=iso=>{ const t=Date.parse(iso||''); return isNaN(t)?'':new Date(t+9*3600e3).toISOString().slice(0,10); };
function drvMatchNew(entry,newFiles){
  const f=(entry&&entry.file)||{}; const id=String(f.drive_file_id||'').trim(), nm=String(f.file_name||'').trim(), h=String(f.file_hash||'').toLowerCase().slice(0,16);
  return (id&&newFiles.find(x=>x.id===id))||(nm&&newFiles.find(x=>x.name===nm))||(h.length>=16&&newFiles.find(x=>drvH16(x)===h))||null;
}
// 가져오기 전에 JSON 의 file 항목을 드라이브 사실로 채운다. 반환 {text, matches[i]=New 파일|null}
//   우선순위: 드라이브(파일 번호·링크·해시·올릴 때 붙인 보낸 곳·받은 날) > JSON 에 적힌 값 > 화면에서 고른 기본 보낸 곳 / 파일이 드라이브에 들어온 날
function drvPrepare(text,newFiles,defaults){
  let j; try{ j=JSON.parse(String(text||'').trim()); }catch(e){ return {text,matches:[]}; }
  if(!j||!Array.isArray(j.resumes)) return {text,matches:[]};
  const d=defaults||{}; const matches=j.resumes.map(r=>{
    if(!r||typeof r!=='object') return null; r.file=r.file&&typeof r.file==='object'?r.file:{};
    const m=drvMatchNew(r,newFiles); const f=r.file;
    if(m){ f.drive_file_id=m.id; f.drive_url=m.webViewLink||f.drive_url||''; if(drvH16(m)) f.file_hash=drvH16(m); if(!f.file_name) f.file_name=m.name;
      const ap=m.appProperties||{}; if(!f.source_party_id&&ap.party) f.source_party_id=ap.party; if(!f.received_at) f.received_at=ap.received||drvDay(m.createdTime); }
    if(!f.source_party_id&&d.party) f.source_party_id=d.party;
    return m;
  });
  return {text:JSON.stringify(j),matches};
}
// 가져오기 결과의 한 줄 → 파일을 보낼 곳. 중단된 줄은 옮기지 않는다.
const drvDest=res=>!res||res.action==='중단'?null:(res.action==='실패'?'FAIL':'DONE');
