// HFC scr-request-resume.js v2.12.0 — 의뢰 상세 ④ 발송 행별 「받은 이력서 올리기」 · 처리 단계 요약 · 후보 등록 연결 · 회신 상태 제안 · 읽기 실패 알림
// 근거: 설계서 resume-intake-process-design v0.2 §5(Phase 3, 사용자 승인 2026-11-02 「3단계 승인」), DB 물리 설계 변경 014(S28.order_id).
// 흐름: 발송 행에서 파일을 올리면 드라이브 New 폴더에 저장되고 파일에 발송 건(order)·업체(party)가 붙는다 → 이력서 등록 화면에서 읽기·가져오기(S28.order_id 기록) → 여기서 「후보로 등록」(후보 선택 화면에 라인·경로·이력서가 채워짐).
// 정한 것: ① 상태 저장값을 따로 만들지 않고 드라이브 New 폴더·S28·S31 에서 계산한다. ② 회신 상태 「대기」는 자동으로 바꾸지 않고 묻는다(한 번 「나중에」를 누르면 이 브라우저에서는 다시 묻지 않음). ③ S28 시트에 order_id 머리글이 없으면 올리기를 막고 안내한다.
// 의존: scr-request-detail.js(D·ORDERS·REQ·LINES·loadAll), cmn-drive.js, cmn-sheet.js, hr-ui.js
let RS={drive:false,driveErr:'',newFiles:[],s28:[],names:new Map(),merged:new Map(),hasOrderCol:true,fail:false,msg:{},busy:false};
const RS_BAD=['읽기실패','처리종료'];
const rsSkipKey=id=>'hfc_rs_skip_'+id;
const rsSkipped=id=>{ try{ return localStorage.getItem(rsSkipKey(id))==='1'; }catch(e){ return false; } };
async function rsLoad(){
  RS={...RS,drive:false,driveErr:'',newFiles:[],fail:false};
  const r=await hrReadMany(['S28','S20']);
  if(r.failed.length){ RS.fail=true; return; }
  RS.s28=r.tabs.S28.rows; RS.hasOrderCol=(r.tabs.S28.headers||[]).includes('order_id');
  RS.names=new Map(r.tabs.S20.rows.map(p=>[p.person_id,p.name])); RS.merged=new Map(r.tabs.S20.rows.map(p=>[p.person_id,String(p.merged_into||'').trim()]));
  if(driveHas()){ RS.drive=true; try{ RS.newFiles=await driveList(DRV.NEW); }catch(e){ RS.drive=false; RS.driveErr=e.message||DRV_MSG.api; } }
}
const rsPerson=pid=>{ let p=pid; for(let i=0;i<5&&RS.merged.get(p);i++) p=RS.merged.get(p); return p; };
const rsName=pid=>RS.names.get(rsPerson(pid))||pid;
function rsLine(o){ return o.line_id||((LINES.find(l=>!cmnYes(l.is_cancelled))||{}).line_id)||''; }
// 한 발송 건의 현황(순수 계산)
function rsStatus(o){
  const files=RS.s28.filter(f=>f.order_id===o.order_id);
  const pend=drvClassify(RS.newFiles,RS.s28).pending.filter(f=>(f.appProperties||{}).order===o.order_id);
  const failed=files.filter(f=>String(f.parse_status).trim()==='읽기실패');
  const got=new Map();   // 가져온 사람(합쳐진 사람은 남은 쪽으로) → 상태
  files.filter(f=>f.person_id&&!RS_BAD.includes(String(f.parse_status).trim())).forEach(f=>{ const p=rsPerson(f.person_id), same=String(f.parse_status).trim()==='동일인확인'; const cur=got.get(p); if(!cur) got.set(p,{same,file:f.file_name}); else if(cur.same&&!same) cur.same=false; });
  const registered=pid=>D.S31.some(c=>c.person_id===pid&&(c.order_id===o.order_id||(c.line_id===rsLine(o)&&c.via_party_id===o.party_id)));
  const people=[...got.entries()].map(([pid,x])=>({pid,same:x.same,file:x.file,done:registered(pid)}));
  return {files,pend,failed,people,todo:people.filter(x=>!x.done),regN:people.filter(x=>x.done).length};
}
function rsBlock(o){
  const st=rsStatus(o); const pm=hrMap(D.S27,'party_id'); const can=RS.drive&&RS.hasOrderCol&&!(DER&&DER.closed);
  const line=rsLine(o);
  const steps=`<span class="hr-sub" data-rs-steps>처리 단계: 읽기 대기 <b>${st.pend.length}</b>건 → 가져옴 <b>${st.people.length}</b>명 → 후보 등록 <b>${st.regN}</b>명</span>`;
  const badge=st.pend.length?'<span class="hr-badge amber">읽기 대기</span>':(st.todo.some(x=>!x.same)?'<span class="hr-badge blue">후보 등록 차례</span>':(st.people.length?'<span class="hr-badge green">등록 완료</span>':''));
  const list=st.todo.length?`<div style="margin-top:8px"><b>이 회신에서 가져온 후보 ${st.todo.length}명 — 후보로 등록</b>${st.todo.map(x=>`<div class="hr-row" style="margin-top:4px;align-items:center" data-rs-person="${hrEsc(x.pid)}"><span>${hrEsc(rsName(x.pid))} <span class="hr-sub">${hrEsc(x.pid)} · ${hrEsc(x.file||'')}</span></span>${x.same?'<span class="hr-badge blue">같은 사람 확인 필요</span> <a class="btn btn-secondary btn-sm" href="intake.html">이력서 등록에서 처리</a>'
      :(line?`<a class="btn btn-primary btn-sm" href="candidate-add.html?line=${encodeURIComponent(line)}&person=${encodeURIComponent(x.pid)}&via=${encodeURIComponent(o.party_id)}&order=${encodeURIComponent(o.order_id)}">후보로 등록</a>`:'')}</div>`).join('')}</div>`:'';
  const fail=st.failed.length?`<div class="hr-notice warn" style="margin-top:8px" data-rs-fail>읽지 못한 이력서 ${st.failed.length}건 — ${hrEsc(hrPartyName(pm,o.party_id))}에 다시 요청할까요? <span class="hr-sub">(${st.failed.map(f=>hrEsc(f.file_name||f.file_id)).join(', ')})</span></div>`:'';
  const suggest=(o.reply_state==='대기'&&(st.pend.length||st.files.length)&&!rsSkipped(o.order_id))?`<div class="hr-notice" style="margin-top:8px" data-rs-suggest>이력서를 받았습니다. 회신 상태를 「후보 추천」으로 바꾸고 회신일을 오늘로 할까요? <button class="btn btn-primary btn-sm" data-rs="reply" data-order="${hrEsc(o.order_id)}">바꾸기</button> <button class="btn btn-secondary btn-sm" data-rs="skip" data-order="${hrEsc(o.order_id)}">나중에</button></div>`:'';
  const link=st.pend.length?` <a href="intake.html" style="font-size:12px">이력서 등록 화면에서 읽기를 맡기세요</a>`:'';
  return `<div class="hr-row" style="margin-top:10px;align-items:center;border-top:1px dashed var(--border);padding-top:10px">
      <button class="btn btn-secondary btn-sm" data-rs="pick" data-order="${hrEsc(o.order_id)}"${can?'':' disabled'}>받은 이력서 올리기</button>
      <input type="file" multiple accept=".pdf,.docx,.doc,.pptx" data-rs-file="${hrEsc(o.order_id)}" style="display:none">${badge} ${steps}${link}</div>
    <div class="prog" data-rs-prog style="display:none" role="status"><span class="spinner"></span><span data-rs-progtxt></span></div>
    <div data-rs-msg>${RS.msg[o.order_id]||''}</div>${suggest}${list}${fail}`;
}
async function renderResumes(){
  const boxes=[...document.querySelectorAll('[data-resume]')]; if(!boxes.length||!REQ) return;
  boxes.forEach(b=>{ b.innerHTML='<div class="hr-sub">받은 이력서 현황을 불러오는 중…</div>'; });
  await rsLoad();
  const n=hrQ('rsNotice'); let h='';
  if(RS.fail){ boxes.forEach(b=>{ b.innerHTML='<div class="hr-sub">받은 이력서 현황을 읽지 못했습니다. 새로고침해 주세요.</div>'; }); return; }
  if(!driveHas()) h+=`<div class="hr-notice" style="margin-bottom:8px" id="rsNoDrive">받은 이력서를 이 화면에서 올리려면 드라이브 권한이 필요합니다. <button class="btn btn-primary btn-sm" data-rs="grant">드라이브 권한 허용</button></div>`;
  else if(RS.driveErr) h+=`<div class="hr-notice err" style="margin-bottom:8px" id="rsDriveErr">${hrEsc(RS.driveErr)}</div>`;
  if(!RS.hasOrderCol) h+=`<div class="hr-notice warn" style="margin-bottom:8px" id="rsNoCol">구글 시트 S28_PERSON_FILE 탭의 1행 맨 오른쪽 빈 칸(P1)에 <b>order_id</b> 를 입력해 주세요. 그때까지 「받은 이력서 올리기」는 쓸 수 없습니다.</div>`;
  if(n) n.innerHTML=h;
  boxes.forEach(b=>{ const o=ORDERS.find(x=>x.order_id===b.dataset.resume); b.innerHTML=o?rsBlock(o):''; });
}
function rsProg(orderId,t){ const c=document.querySelector(`[data-order="${CSS.escape(orderId)}"]`); if(!c) return; const e=c.querySelector('[data-rs-prog]'); if(!e) return; e.style.display=t?'':'none'; c.querySelector('[data-rs-progtxt]').textContent=t||''; }
async function rsUpload(orderId,files){
  const o=ORDERS.find(x=>x.order_id===orderId); if(!o||!files.length) return;
  await rsLoad();
  if(!RS.drive||!RS.hasOrderCol){ RS.msg[orderId]=`<div class="hr-err">${hrEsc(RS.driveErr||(RS.hasOrderCol?DRV_MSG.scope:'시트에 order_id 열이 없어 올릴 수 없습니다.'))}</div>`; await renderResumes(); return; }
  const props={order:o.order_id,party:o.party_id,received:hrToday(),via:'hfc-request'}; const rows=[]; const seen=new Set(); let up=0, k=0;
  for(const f of files){
    rsProg(orderId,`이력서를 올리는 중… ${++k} / ${files.length} (${f.name})`);
    if(!drvExtOk(f.name)){ rows.push([f.name,'올리지 않음',DRV_MSG.ext]); continue; }
    let h; try{ h=await drvSha16(f); }catch(e){ rows.push([f.name,'올리지 않음','파일을 읽지 못했습니다.']); continue; }
    if(seen.has(h)){ rows.push([f.name,'올리지 않음','이번에 고른 파일 중 같은 내용이 있습니다.']); continue; } seen.add(h);
    const why=drvDupReason(h,RS.s28,RS.newFiles,rsName); if(why){ rows.push([f.name,'올리지 않음',why]); continue; }
    try{ const x=await driveUpload(f,props); RS.newFiles.push(x); up++; rows.push([f.name,'올림','New 폴더']); }
    catch(e){ rows.push([f.name,'실패',e.message||DRV_MSG.api]); }
  }
  rsProg(orderId,'');
  const no=rows.filter(r=>r[1]==='올리지 않음').length, bad=rows.filter(r=>r[1]==='실패').length;
  RS.msg[orderId]=`<div style="margin:8px 0" data-rs-result>올림 <b>${up}</b> · 올리지 않음 <b>${no}</b> · 실패 <b>${bad}</b>${up?' — 이력서 등록 화면에서 읽기를 맡기면 후보로 가져옵니다. <a href="intake.html">이력서 등록으로</a>':''}</div>`
    +(no||bad?`<div class="hr-scroll"><table class="hr-table auto"><thead><tr><th>파일</th><th>결과</th><th>사유</th></tr></thead><tbody>${rows.filter(r=>r[1]!=='올림').map(r=>`<tr><td>${hrEsc(r[0])}</td><td style="text-align:center">${hrEsc(r[1])}</td><td>${hrEsc(r[2])}</td></tr>`).join('')}</tbody></table></div>`:'');
  toast(up?`${up}건을 New 폴더에 올렸습니다.`:'올린 파일이 없습니다.',!up);
  await renderResumes();
}
async function rsReply(orderId){
  const o=ORDERS.find(x=>x.order_id===orderId); if(!o) return;
  const r=await hrUpdate('S34',o.order_id,{reply_state:'후보 추천',replied_at:hrToday()},{readUpdatedAt:o.updated_at});
  if(!r.ok){ toast(hrSaveFailText(r),true); return; }
  toast('✓ 회신 상태를 후보 추천으로 바꿨습니다'); await loadAll();
}
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-rs]'); if(!b) return; const act=b.dataset.rs, id=b.dataset.order;
  if(act==='pick'){ const inp=b.closest('[data-order]').querySelector('[data-rs-file]'); if(inp) inp.click(); return; }
  if(act==='skip'){ try{ localStorage.setItem(rsSkipKey(id),'1'); }catch(e){} renderResumes(); return; }
  if(act==='reply'){ hrBusy(b,()=>rsReply(id)); return; }
  if(act==='grant'){ hrBusy(b,async()=>{ const ok=await authGrantDrive(); if(!ok){ toast('드라이브 권한을 받지 못했습니다. 동의 창에서 드라이브 항목을 선택해 주세요.',true); return; } await renderResumes(); }); }
});
document.addEventListener('change',ev=>{
  const i=ev.target.closest&&ev.target.closest('[data-rs-file]'); if(!i) return; const files=[...(i.files||[])]; const id=i.dataset.rsFile; i.value='';
  if(files.length) rsUpload(id,files);
});
