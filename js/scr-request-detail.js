// HFC scr-request-detail.js v2.9.76 — STF-SCR-02 의뢰 상세 (개발 단계 ①: 영역 ①②③④⑦ + 실패·취소)
// 근거: 프로그램 설계서 §5(SCR-02). 한 의뢰를 접수 → 요청 라인 → 서치업체 발송 → 회신 관리 순서로 처리한다.
// 사업기회 승격·견적에 반영은 js/scr-request-promote.js (v2.9.103)
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js, cmn-msg.js, hr-ui.js
const q$=(root,sel)=>root.querySelector(sel);
let REQ_ID=null, IS_NEW=false;
let D={S32:[],S33:[],S34:[],S31:[],S27:[],S36:[]};
let REQ=null, LINES=[], ORDERS=[], DER=null, CODES={role:[],industry:[],project_type:[],fail_reason:[]}, TEMPLATE='', CODES_OK=true;
let newLine=false;          // 새 요청 라인 입력 카드를 열어 둔 상태
let selParties=new Set();   // ③ 에서 고른 서치업체
let selLines=new Set();     // ③ 에서 고른 라인
let closeKind='';           // 열려 있는 실패·취소 패널 종류
let MSGS=[];                // 만든 전달 문구 [{party,text,warnings}]

const RATE_MAX_MAN=5000;   // 월 단가 상한(만원) — 원 단위로 잘못 넣는 실수를 막는 확인선(정한 것, 개발 기록 참고)
const rateTooBig=w=>typeof w==='number'&&w>RATE_MAX_MAN*10000;
const RATE_BIG_MSG=`단가는 만원 단위입니다. 월 ${RATE_MAX_MAN.toLocaleString('ko-KR')}만원 이하로 입력해 주세요.`;
const num1=v=>{ const t=String(v??'').replace(/,/g,'').trim(); if(t==='') return ''; const n=parseFloat(t); return isNaN(n)?NaN:n; };
const partyActive=p=>String(p.is_active??'Y').trim()!=='N';
const lineLabel=l=>`${hrSplit(l.role_codes).join('·')||'(역할 없음)'} ${l.grade||''} ${l.headcount||''}명`.replace(/\s+/g,' ').trim();
const marginText=(sell,buy)=>{ const s=hrWonToMan(sell), b=hrWonToMan(buy); if(s===''||b==='') return '-'; const m=Math.round((s-b)*10)/10; return m.toLocaleString('ko-KR',{maximumFractionDigits:1}); };
const optList=(items,sel,blank)=>(blank!==undefined?`<option value="">${hrEsc(blank)}</option>`:'')+items.map(x=>`<option value="${hrEsc(x.v)}"${x.v===sel?' selected':''}>${hrEsc(x.t)}</option>`).join('');

// ── 읽기 ────────────────────────────────────────────────────────────────────
async function readCodes(){
  CODES={role:[],industry:[],project_type:[],fail_reason:[]}; TEMPLATE=''; CODES_OK=true;
  let rows; try{ rows=await fetchSheetSafe(...R.S10); }catch(e){ rows=null; }
  if(!rows){ CODES_OK=false; return; }
  toObj(rows).forEach(r=>{
    const cat=String(r.category??'').trim(), key=String(r.setting_key??'').trim(); if(!key) return;
    if(CODES[cat]) CODES[cat].push(key);
    else if(cat===S10_HR_SETTING_CAT&&key==='order_msg_template') TEMPLATE=String(r.setting_value??'');
  });
}
async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const sp=new URLSearchParams(location.search); IS_NEW=sp.get('new')==='1'&&!sp.get('id'); REQ_ID=sp.get('id')||REQ_ID;
  const r=await hrLoadScreen(['S32','S33','S34','S31','S27','S36']);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  await readCodes();
  D=r.data; REQ=REQ_ID?D.S32.find(x=>x.request_id===REQ_ID)||null:null;
  if(!IS_NEW&&!REQ){ hrQ('screen').style.display='none'; box.innerHTML='<div class="hr-notice err">해당 의뢰를 찾을 수 없습니다. <a href="request.html" style="color:inherit;font-weight:600">의뢰 대장으로 돌아가기</a></div>'; return; }
  box.innerHTML=CODES_OK?'':'<div class="hr-notice warn">코드 목록(역할·업종 등)을 읽지 못했습니다. 설정 화면의 코드를 확인하거나 다시 불러와 주세요.</div>';
  hrQ('screen').style.display='';
  LINES=REQ?D.S33.filter(l=>l.request_id===REQ.request_id).sort((a,b)=>(parseInt(a.line_no)||0)-(parseInt(b.line_no)||0)):[];
  ORDERS=REQ?D.S34.filter(o=>o.request_id===REQ.request_id):[];
  DER=REQ?cmnDeriveRequests({reqs:[REQ],lines:D.S33,cands:D.S31,orders:D.S34},hrToday())[REQ.request_id]:null;
  if(!selLines.size||[...selLines].some(id=>!LINES.some(l=>l.line_id===id&&!cmnYes(l.is_cancelled)))) selLines=new Set(LINES.filter(l=>!cmnYes(l.is_cancelled)).map(l=>l.line_id));
  MSGS=[]; renderTop(); fillInfo(); renderLines(); renderSend(); renderOrders(); hrQ('fMemo').value=REQ?REQ.memo:''; if(typeof renderCands==='function') renderCands(); if(typeof renderPromote==='function') renderPromote();
  ['btnSaveMemo'].forEach(i=>hrQ(i).disabled=!REQ);
}
const needSaved=()=>'<div class="hr-empty">의뢰 정보를 먼저 저장해 주세요.</div>';

// ── 상단 ────────────────────────────────────────────────────────────────────
const STATUS_COLOR={접수:'gray',탐색:'gray',추천수령:'blue',회신:'blue',서류통과:'blue',인터뷰:'amber',선정:'green',계약:'green',실패:'red',취소:'gray'};
function renderTop(){
  hrQ('topTitle').textContent=REQ?REQ.alias:'새 의뢰'; hrQ('topId').textContent=REQ?REQ.request_id:'';
  hrQ('topStatus').innerHTML=DER?`<span class="hr-badge ${STATUS_COLOR[DER.status]||'gray'}" id="statusBadge">${hrEsc(DER.status)}</span>`:'<span class="hr-badge gray" id="statusBadge">접수 전</span>';
  const closed=DER&&DER.closed;
  hrQ('btnFail').style.display=hrQ('btnCancel').style.display=REQ&&!closed?'':'none';
  hrQ('btnReopen').style.display=closed?'':'none'; hrQ('btnDeleteReq').style.display=REQ?'':'none';
  hrQ('closePanel').style.display='none'; closeKind='';
}
function openClosePanel(kind){
  closeKind=kind; hrQ('closePanel').style.display=''; hrQ('closeMsg').textContent=''; hrQ('closeReasonErr').textContent='';
  hrQ('closeTitle').textContent=kind==='실패'?'이 의뢰를 실패로 처리합니다.':'이 의뢰를 취소로 처리합니다.';
  hrQ('closeReasonWrap').style.display=kind==='실패'?'':'none';
  hrQ('closeReason').innerHTML='<option value="">선택</option>'+CODES.fail_reason.map(c=>`<option>${hrEsc(c)}</option>`).join('');
}
async function doClose(){
  await hrBusy(hrQ('btnCloseDo'),async()=>{
    hrQ('closeMsg').textContent=''; hrQ('closeReasonErr').textContent='';
    const reason=hrQ('closeReason').value;
    if(closeKind==='실패'&&!reason){ hrQ('closeReasonErr').textContent='실패 사유를 선택해 주세요.'; return; }
    const ch={closed_state:closeKind,fail_reason_code:closeKind==='실패'?reason:''};
    const r=await hrUpdate('S32',REQ.request_id,ch,{readUpdatedAt:REQ.updated_at});
    if(!r.ok){ hrQ('closeMsg').textContent=hrSaveFailText(r); return; }
    toast(`✓ 의뢰를 ${closeKind}로 처리했습니다`); await loadAll();
  });
}
// 의뢰 삭제 — 발송 기록·후보가 없고 사업기회에 연결되지 않은 의뢰만(변경 004). 지금 시트를 다시 읽어 확인하고, 확인이 안 되면 삭제하지 않는다. 요청 라인은 함께 삭제한다.
async function deleteReq(){
  await hrBusy(hrQ('btnDeleteReq'),async()=>{
    if(!REQ) return; const msg=t=>{ toast(t,true); };
    const r=await hrReadMany(['S32','S33','S34','S31']); if(r.failed.length){ msg('사용 여부를 확인하지 못해 삭제하지 않았습니다. 다시 시도해 주세요.'); return; }
    const cur=r.tabs.S32.rows.find(x=>x.request_id===REQ.request_id); if(!cur){ msg('이미 삭제된 의뢰입니다.'); return; }
    const lines=r.tabs.S33.rows.filter(l=>l.request_id===REQ.request_id), lids=new Set(lines.map(l=>l.line_id));
    const orders=r.tabs.S34.rows.filter(o=>o.request_id===REQ.request_id).length, cands=r.tabs.S31.rows.filter(c=>lids.has(c.line_id)).length;
    if(orders||cands||!cmnBlank(cur.pipeline_id)){ const why=[orders&&`발송 기록 ${orders}건`,cands&&`후보 ${cands}명`,!cmnBlank(cur.pipeline_id)&&'사업기회 연결'].filter(Boolean).join(' · '); msg(`기록이 있어 삭제할 수 없습니다 (${why}). 실패·취소로 처리해 주세요.`); return; }
    if(!confirm(`의뢰 ‘${REQ.alias}’(${REQ.request_id})${lines.length?`와 요청 라인 ${lines.length}건`:''}을(를) 삭제합니다. 되돌릴 수 없습니다. 삭제할까요?`)) return;
    for(const l of lines){ const d=await hrDelete('S33',l.line_id,{readUpdatedAt:l.updated_at}); if(!d.ok){ msg(hrSaveFailText(d)); await loadAll(); return; } }
    const d=await hrDelete('S32',REQ.request_id,{readUpdatedAt:cur.updated_at}); if(!d.ok){ msg(hrSaveFailText(d)); await loadAll(); return; }
    toast('✓ 의뢰를 삭제했습니다'); setTimeout(()=>{ location.href='request.html'; },700);
  });
}
async function reopenReq(){
  if(!REQ||!confirm('이 의뢰를 다시 진행 상태로 되돌릴까요?')) return;
  const r=await hrUpdate('S32',REQ.request_id,{closed_state:'진행',fail_reason_code:''},{readUpdatedAt:REQ.updated_at});
  if(!r.ok){ toast(hrSaveFailText(r),true); return; }
  toast('✓ 진행 상태로 되돌렸습니다'); await loadAll();
}

// ── ① 의뢰 정보 ─────────────────────────────────────────────────────────────
function fillInfo(){
  const act=D.S27.filter(partyActive).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko'));
  const withCur=(list,id)=>id&&!list.some(p=>p.party_id===id)&&D.S27.some(p=>p.party_id===id)?[...list,D.S27.find(p=>p.party_id===id)]:list;
  const cur=REQ||{};
  hrQ('fRequester').innerHTML=optList(withCur(act,cur.requester_party_id).map(p=>({v:p.party_id,t:p.name})),cur.requester_party_id||'','선택');
  const cl=act.filter(p=>hrSplit(p.roles).some(r=>r==='최종 고객사'||r==='고객'));
  hrQ('fClientParty').innerHTML=optList(withCur(cl,cur.end_client_party_id).map(p=>({v:p.party_id,t:p.name})),cur.end_client_party_id||'','연결 안 함');
  hrQ('fAlias').value=cur.alias||''; hrQ('fClientName').value=cur.end_client_name||''; hrQ('fDisclose').value=hrYes(cur.disclose_client)?'Y':'N';
  hrQ('fPlace').value=cur.work_place||''; hrQ('fStartYm').value=/^\d{4}-\d{2}/.test(cur.start_ym||'')?String(cur.start_ym).slice(0,7):''; hrQ('fStartNote').value=cur.start_note||'';
  hrQ('fDuration').value=cur.duration_months||''; hrQ('fReceived').value=cur.received_at||(REQ?'':hrToday()); hrQ('fDue').value=cur.requester_due||'';
  ['fAliasErr','fRequesterErr','fDurationErr','fReceivedErr','infoMsg'].forEach(i=>hrQ(i).textContent='');
  const pc=cur.requester_party_id?D.S36.filter(c=>c.party_id===cur.requester_party_id&&hrYes(c.is_active||'Y')).sort((a,b)=>hrYes(b.is_primary)-hrYes(a.is_primary))[0]:null;
  hrQ('fRequesterHelp').innerHTML=(pc?`요청자 담당자: ${hrEsc(pc.name)}${pc.title?' '+hrEsc(pc.title):''} · `:'')+'목록에 없으면 <a href="party.html">거래처 관리</a>에서 먼저 등록하세요.';
}
async function saveInfo(){
  await hrBusy(hrQ('btnSaveInfo'),async()=>{
    ['fAliasErr','fRequesterErr','fDurationErr','fReceivedErr','infoMsg'].forEach(i=>hrQ(i).textContent='');
    const v={alias:hrQ('fAlias').value.trim(),requester_party_id:hrQ('fRequester').value,end_client_name:hrQ('fClientName').value.trim(),end_client_party_id:hrQ('fClientParty').value,
      disclose_client:hrQ('fDisclose').value,work_place:hrQ('fPlace').value.trim(),start_ym:hrQ('fStartYm').value,start_note:hrQ('fStartNote').value.trim(),
      duration_months:hrQ('fDuration').value.trim(),received_at:hrQ('fReceived').value,requester_due:hrQ('fDue').value};
    let bad=false;
    if(!v.alias){ hrQ('fAliasErr').textContent='별칭을(를) 입력해 주세요.'; bad=true; }
    if(!v.requester_party_id){ hrQ('fRequesterErr').textContent='요청자를(를) 선택해 주세요.'; bad=true; }
    if(!v.received_at){ hrQ('fReceivedErr').textContent='접수일을(를) 입력해 주세요.'; bad=true; }
    if(v.duration_months!==''&&!/^\d+$/.test(v.duration_months)){ hrQ('fDurationErr').textContent='기간은 0 이상의 정수(개월)로 입력해 주세요.'; bad=true; }
    if(bad) return;
    if(!REQ){
      const r=await hrAppend('S32',{...v,closed_state:'진행'},{year:v.received_at.slice(0,4)});
      if(!r.ok){ hrQ('infoMsg').textContent=hrSaveFailText(r); return; }
      toast(`✓ 의뢰를 등록했습니다 (${r.id})`); REQ_ID=r.id; IS_NEW=false; history.replaceState(null,'','request-detail.html?id='+encodeURIComponent(r.id));
    } else {
      const ch={}; Object.keys(v).forEach(k=>{ if(String(REQ[k]??'')!==String(v[k])) ch[k]=v[k]; });
      if(!Object.keys(ch).length){ toast('변경된 내용이 없습니다'); return; }
      const r=await hrUpdate('S32',REQ.request_id,ch,{readUpdatedAt:REQ.updated_at});
      if(!r.ok){ hrQ('infoMsg').textContent=hrSaveFailText(r); return; }
      toast('✓ 저장했습니다');
    }
    await loadAll();
  });
}
async function saveMemo(){
  await hrBusy(hrQ('btnSaveMemo'),async()=>{
    hrQ('memoMsg').textContent=''; const memo=hrQ('fMemo').value;
    if(String(REQ.memo??'')===memo){ toast('변경된 내용이 없습니다'); return; }
    const r=await hrUpdate('S32',REQ.request_id,{memo},{readUpdatedAt:REQ.updated_at});
    if(!r.ok){ hrQ('memoMsg').textContent=hrSaveFailText(r); return; }
    toast('✓ 메모를 저장했습니다'); await loadAll();
  });
}

// ── ② 요청 라인 ─────────────────────────────────────────────────────────────
function lineCard(l){
  const isNew=!l; const L=l||{}; const cancelled=!isNew&&cmnYes(L.is_cancelled);
  const f=DER&&!isNew?DER.lines.find(x=>x.line_id===L.line_id):null;
  const roles=new Set(hrSplit(L.role_codes));
  const candCount=isNew?0:D.S31.filter(c=>c.line_id===L.line_id).length;
  const dis=cancelled?' disabled':'';
  const man=w=>{ const m=hrWonToMan(w); return m===''?'':m; };
  const roleChips=[...CODES.role,...[...roles].filter(r=>!CODES.role.includes(r))].map(r=>`<span class="hr-chip${roles.has(r)?' on':''}${cancelled?' disabled':''}" data-role="${hrEsc(r)}">${hrEsc(r)}</span>`).join('');
  const inds=CODES.industry.includes(L.industry)||!L.industry?CODES.industry:[...CODES.industry,L.industry];
  const pts=CODES.project_type.includes(L.project_type)||!L.project_type?CODES.project_type:[...CODES.project_type,L.project_type];
  return `<div class="hr-line-card${cancelled?' cancelled':''}" data-line="${isNew?'':hrEsc(L.line_id)}" data-new="${isNew?1:0}">
    <div class="hr-row" style="justify-content:space-between;margin-bottom:8px"><b>${isNew?'새 요청 라인':hrEsc('라인 '+(L.line_no||''))}</b>
      <span>${cancelled?'<span class="hr-badge gray">취소됨</span>':(f?`<span class="hr-badge ${f.filled>=f.need?'green':'blue'}" data-fill>충원 ${f.filled}/${f.need}</span>`:'')}${candCount?` <span class="hr-sub">후보 ${candCount}명</span>`:''}</span></div>
    <div class="hr-lbl hr-req">역할 (겸임이면 복수 선택)</div><div class="hr-chips lc-roles" style="margin:4px 0">${roleChips||'<span class="hr-help">역할 코드가 없습니다. 설정 화면에서 코드를 먼저 등록하세요.</span>'}</div><div class="hr-err lc-err-roles"></div>
    <div class="hr-row">
      <div class="hr-field fixed" style="min-width:110px"><label class="hr-req">등급</label><select class="hr-select lc-grade"${dis}>${optList(GRADE4.map(g=>({v:g,t:g})),L.grade||'','선택')}</select><div class="hr-err lc-err-grade"></div></div>
      <div class="hr-field fixed" style="min-width:90px"><label class="hr-req">인원 (명)</label><input class="hr-input num lc-hc" inputmode="numeric" value="${hrEsc(L.headcount||'')}"${dis}><div class="hr-err lc-err-hc"></div></div>
      <div class="hr-field"><label>필수 기술 (쉼표)</label><input class="hr-input lc-must" value="${hrEsc(L.must_skills||'')}"${dis}></div>
      <div class="hr-field"><label>우대 기술 (쉼표)</label><input class="hr-input lc-nice" value="${hrEsc(L.nice_skills||'')}"${dis}></div>
    </div>
    <div class="hr-row">
      <div class="hr-field"><label>업종</label><select class="hr-select lc-ind"${dis}>${optList(inds.map(x=>({v:x,t:x})),L.industry||'','선택 안 함')}</select></div>
      <div class="hr-field"><label>프로젝트 유형</label><select class="hr-select lc-pt"${dis}>${optList(pts.map(x=>({v:x,t:x})),L.project_type||'','선택 안 함')}</select></div>
      <div class="hr-field fixed" style="min-width:90px"><label>연령 하한</label><input class="hr-input num lc-amin" inputmode="numeric" value="${hrEsc(L.age_min||'')}"${dis}></div>
      <div class="hr-field fixed" style="min-width:90px"><label>연령 상한</label><input class="hr-input num lc-amax" inputmode="numeric" value="${hrEsc(L.age_max||'')}"${dis}><div class="hr-err lc-err-age"></div></div>
    </div>
    <div class="hr-rate-pair" style="margin-top:8px">
      <div class="hr-field"><label>판매 단가 (만원/월) · 요청자 제시</label><input class="hr-input num hr-amt lc-sell" inputmode="decimal" value="${hrEsc(hrFmtMan(L.rate_sell))}"${dis}></div>
      <div class="hr-field"><label>매입 목표 단가 (만원/월) · 서치업체 제시</label><input class="hr-input num hr-amt lc-buy" inputmode="decimal" value="${hrEsc(hrFmtMan(L.rate_buy_target))}"${dis}></div>
    </div>
    <div class="hr-err lc-err-rate"></div>
    <div style="margin-top:6px" class="hr-sub">마진 <b class="lc-margin">${hrEsc(marginText(L.rate_sell,L.rate_buy_target))}</b> 만원/월 (판매 − 매입 목표, 저장하지 않음)</div>
    <div class="hr-err lc-msg" style="margin-top:6px"></div>
    <div class="hr-row" style="margin-top:8px">
      ${cancelled?'':`<button class="btn btn-primary btn-sm" data-act="saveLine">${isNew?'라인 추가':'저장'}</button>`}
      ${isNew?'<button class="btn btn-secondary btn-sm" data-act="dropNew">닫기</button>':(cancelled?'<button class="btn btn-secondary btn-sm" data-act="restoreLine">취소 해제</button>':'<button class="btn btn-secondary btn-sm" data-act="cancelLine">라인 취소</button><button class="btn btn-danger btn-sm" data-act="deleteLine">삭제</button>')}
    </div></div>`;
}
function renderLines(){
  const box=hrQ('lineBox'); hrQ('btnAddLine').disabled=!REQ;
  if(!REQ){ box.innerHTML=needSaved(); hrQ('fillText').textContent=''; return; }
  hrQ('fillText').textContent=DER?`충원 ${DER.filled}/${DER.need}`:'';
  const cards=LINES.map(l=>lineCard(l)).join('')+(newLine?lineCard(null):'');
  box.innerHTML=cards||'<div class="hr-empty">요청 라인이 없습니다. “+ 요청 라인 추가”로 필요한 인력을 입력하세요.</div>';
}
function addLine(){ newLine=true; renderLines(); const c=hrQ('lineBox').querySelector('[data-new="1"]'); if(c) c.scrollIntoView({block:'nearest'}); }
function readLine(card){
  const roles=[...card.querySelectorAll('.lc-roles .hr-chip.on')].map(e=>e.dataset.role);
  const e=s=>q$(card,s); const v={role_codes:roles.join(','),grade:e('.lc-grade').value,headcount:e('.lc-hc').value.trim(),must_skills:hrSplit(e('.lc-must').value).join(','),nice_skills:hrSplit(e('.lc-nice').value).join(','),
    industry:e('.lc-ind').value,project_type:e('.lc-pt').value,age_min:e('.lc-amin').value.trim(),age_max:e('.lc-amax').value.trim()};
  const sell=hrManToWon(e('.lc-sell').value), buy=hrManToWon(e('.lc-buy').value);
  return {v,sell,buy};
}
function validateLine(card,x){
  const e=s=>q$(card,s); ['.lc-err-roles','.lc-err-grade','.lc-err-hc','.lc-err-age','.lc-err-rate','.lc-msg'].forEach(s=>e(s).textContent=''); let bad=false;
  if(!x.v.role_codes){ e('.lc-err-roles').textContent='역할을(를) 선택해 주세요.'; bad=true; }
  if(!x.v.grade){ e('.lc-err-grade').textContent='등급을(를) 선택해 주세요.'; bad=true; }
  if(!/^\d+$/.test(x.v.headcount)||parseInt(x.v.headcount,10)<1){ e('.lc-err-hc').textContent='인원을(를) 1 이상으로 입력해 주세요.'; bad=true; }
  const a=x.v.age_min, b=x.v.age_max;
  if((a!==''&&!/^\d+$/.test(a))||(b!==''&&!/^\d+$/.test(b))||(a!==''&&b!==''&&+a>+b)){ e('.lc-err-age').textContent='연령은 숫자로, 하한이 상한보다 크지 않게 입력해 주세요.'; bad=true; }
  if(Number.isNaN(x.sell)||Number.isNaN(x.buy)){ e('.lc-err-rate').textContent='단가는 0 이상의 숫자(만원)로 입력해 주세요.'; bad=true; }
  else if(rateTooBig(x.sell)||rateTooBig(x.buy)){ e('.lc-err-rate').textContent=RATE_BIG_MSG; bad=true; }
  return !bad;
}
async function saveLine(card){
  const isNew=card.dataset.new==='1'; const x=readLine(card); if(!validateLine(card,x)) return;
  const rec={...x.v,rate_sell:x.sell,rate_buy_target:x.buy};
  const msg=card.querySelector('.lc-msg');
  if(isNew){
    const no=Math.max(0,...LINES.map(l=>parseInt(l.line_no)||0))+1;
    const r=await hrAppend('S33',{...rec,request_id:REQ.request_id,line_no:no,is_cancelled:'N'});
    if(!r.ok){ msg.textContent=hrSaveFailText(r); return; }
    newLine=false; toast('✓ 요청 라인을 추가했습니다');
  } else {
    const cur=LINES.find(l=>l.line_id===card.dataset.line); const ch={};
    Object.keys(rec).forEach(k=>{ if(String(cur[k]??'')!==String(rec[k]??'')) ch[k]=rec[k]; });
    if(!Object.keys(ch).length){ toast('변경된 내용이 없습니다'); return; }
    const r=await hrUpdate('S33',cur.line_id,ch,{readUpdatedAt:cur.updated_at});
    if(!r.ok){ msg.textContent=hrSaveFailText(r); return; }
    toast('✓ 저장했습니다');
  }
  await loadAll();
}
async function setLineCancel(card,flag){
  const cur=LINES.find(l=>l.line_id===card.dataset.line); const msg=card.querySelector('.lc-msg');
  if(flag&&!confirm('이 라인을 취소 처리할까요? (후보·발송 이력은 그대로 남습니다)')) return;
  const r=await hrUpdate('S33',cur.line_id,{is_cancelled:flag?'Y':'N'},{readUpdatedAt:cur.updated_at});
  if(!r.ok){ msg.textContent=hrSaveFailText(r); return; }
  toast(flag?'✓ 라인을 취소했습니다':'✓ 라인 취소를 해제했습니다'); await loadAll();
}
async function deleteLine(card){
  const cur=LINES.find(l=>l.line_id===card.dataset.line); const msg=card.querySelector('.lc-msg'); msg.textContent='';
  if(D.S31.some(c=>c.line_id===cur.line_id)){ msg.textContent='후보가 있어 삭제할 수 없습니다. 취소로 처리해 주세요.'; return; }
  const sent=D.S34.filter(o=>o.line_id===cur.line_id).length;
  if(sent){ msg.textContent=`발송 기록 ${sent}건이 있어 삭제할 수 없습니다. 취소로 처리해 주세요.`; return; }   // 의뢰 삭제와 같은 규칙 — 기록이 있는 것은 지우지 않는다(사용자 지적 2026-10-12)
  if(!confirm('이 요청 라인을 삭제할까요? 되돌릴 수 없습니다.')) return;
  const r=await hrDelete('S33',cur.line_id,{readUpdatedAt:cur.updated_at});
  if(!r.ok){ msg.textContent=hrSaveFailText(r); return; }
  toast('✓ 라인을 삭제했습니다'); await loadAll();
}
document.addEventListener('click',ev=>{
  const chip=ev.target.closest('.lc-roles .hr-chip'); if(chip&&!chip.classList.contains('disabled')){ chip.classList.toggle('on'); return; }
  const b=ev.target.closest('[data-act]'); if(!b) return; const card=b.closest('[data-line]'); if(!card) return;
  hrBusy(b,async()=>{
    switch(b.dataset.act){
      case 'saveLine': return saveLine(card); case 'dropNew': newLine=false; return renderLines();
      case 'cancelLine': return setLineCancel(card,true); case 'restoreLine': return setLineCancel(card,false); case 'deleteLine': return deleteLine(card);
    }
  });
});
document.addEventListener('input',ev=>{
  const card=ev.target.closest('.hr-line-card'); if(!card||!(ev.target.matches('.lc-sell')||ev.target.matches('.lc-buy'))) return;
  const s=hrManToWon(q$(card,'.lc-sell').value), b=hrManToWon(q$(card,'.lc-buy').value);
  q$(card,'.lc-margin').textContent=(s===''||b===''||Number.isNaN(s)||Number.isNaN(b))?'-':marginText(s,b);
});

// ── ③ 서치업체 발송 ─────────────────────────────────────────────────────────
function searchParties(){ return D.S27.filter(p=>partyActive(p)&&hrSplit(p.roles).includes('서치업체')).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko')); }
function renderSend(){
  const box=hrQ('sendBox'); if(!REQ){ box.innerHTML=needSaved(); return; }
  const live=LINES.filter(l=>!cmnYes(l.is_cancelled)); const sps=searchParties();
  if(!live.length){ box.innerHTML='<div class="hr-empty">요청 라인을 먼저 추가해 주세요.</div>'; return; }
  if(DER&&DER.closed){ box.innerHTML=`<div class="hr-notice warn">${hrEsc(DER.status)}로 처리된 의뢰입니다. 새로 발송하려면 먼저 “진행으로 되돌리기”를 누르세요.</div>`; return; }
  const partyChips=sps.length?sps.map(p=>`<span class="hr-chip${selParties.has(p.party_id)?' on':''}" data-sp="${hrEsc(p.party_id)}">${hrEsc(p.name)} <span class="hr-sub">${hrEsc(p.party_id)}</span></span>`).join(''):'<span class="hr-help">서치업체 역할의 거래처가 없습니다. <a href="party.html">거래처 관리</a>에서 먼저 등록하세요.</span>';
  const lineChips=live.map(l=>`<span class="hr-chip${selLines.has(l.line_id)?' on':''}" data-sl="${hrEsc(l.line_id)}">${hrEsc(lineLabel(l))}</span>`).join('');
  const blank=(DER&&DER.orderCount)?'':'';
  box.innerHTML=`<div class="hr-lbl hr-req">발송할 업체 (여러 곳 선택)</div><div class="hr-chips" id="spChips" style="margin:4px 0">${partyChips}</div><div class="hr-err" id="spErr"></div>
    <div class="hr-lbl" style="margin-top:8px">보낼 요청 라인</div><div class="hr-chips" id="slChips" style="margin:4px 0">${lineChips}</div><div class="hr-err" id="slErr"></div>
    <div class="hr-row"><div class="hr-field fixed" style="min-width:180px"><label class="hr-req" for="sDue">회신 기한</label><input class="hr-input" type="date" id="sDue"><div class="hr-err" id="sDueErr"></div></div>
      <div class="hr-field fixed" style="min-width:180px"><label for="sSent">발송일</label><input class="hr-input" type="date" id="sSent" value="${hrToday()}"></div></div>
    <div class="hr-row" style="margin-top:10px"><button class="btn btn-secondary" id="btnMsg">문구 만들기</button><button class="btn btn-primary" id="btnSend">발송 기록 저장</button></div>
    <div class="hr-help" style="margin-top:4px">문구는 만들어 복사한 뒤 직접 전달합니다. 시스템이 업체에 보내지 않습니다. 매입 목표 단가만 들어가고 판매 단가·마진은 들어가지 않습니다.</div>
    <div class="hr-err" id="sendMsg" style="margin-top:6px"></div><div id="msgBox" style="margin-top:8px"></div>`;
  hrQ('btnMsg').onclick=makeMessages; hrQ('btnSend').onclick=()=>hrBusy(hrQ('btnSend'),saveSend);
}
document.addEventListener('click',ev=>{
  const sp=ev.target.closest('[data-sp]'); if(sp){ const id=sp.dataset.sp; selParties.has(id)?selParties.delete(id):selParties.add(id); sp.classList.toggle('on'); return; }
  const sl=ev.target.closest('[data-sl]'); if(sl){ const id=sl.dataset.sl; selLines.has(id)?selLines.delete(id):selLines.add(id); sl.classList.toggle('on'); return; }
  const cp=ev.target.closest('[data-copy]'); if(cp){ copyText(parseInt(cp.dataset.copy,10)); }
});
function sendInput(){
  ['spErr','slErr','sDueErr','sendMsg'].forEach(i=>hrQ(i).textContent='');
  const due=hrQ('sDue').value, parties=[...selParties].filter(id=>searchParties().some(p=>p.party_id===id)), lines=LINES.filter(l=>selLines.has(l.line_id)&&!cmnYes(l.is_cancelled)); let bad=false;
  if(!parties.length){ hrQ('spErr').textContent='발송 업체를 선택해 주세요.'; bad=true; }
  if(!lines.length){ hrQ('slErr').textContent='보낼 요청 라인을 선택해 주세요.'; bad=true; }
  if(!due){ hrQ('sDueErr').textContent='회신 기한을(를) 입력해 주세요.'; bad=true; }
  return bad?null:{parties,lines,due};
}
function makeMessages(){
  const x=sendInput(); if(!x) return; const pm=hrMap(D.S27,'party_id');
  const cp=REQ.end_client_party_id?pm.get(REQ.end_client_party_id):null;
  const terms=[REQ.end_client_name,cp&&cp.name,...(cp?hrSplit(cp.aliases):[])];
  MSGS=[]; let err='';
  x.parties.forEach(id=>{
    const r=cmnBuildOrderMessage({req:REQ,lines:x.lines,partyName:hrPartyName(pm,id),replyDue:x.due,clientName:cp?cp.name:REQ.end_client_name,clientTerms:terms,template:TEMPLATE});
    if(!r.ok) err=r.message; else MSGS.push({party:hrPartyName(pm,id),text:r.text,warnings:r.warnings});
  });
  if(err){ hrQ('sendMsg').textContent=err; return; }
  hrQ('msgBox').innerHTML=MSGS.map((m,i)=>`<div class="hr-line-card" data-msg="${i}"><div class="hr-row" style="justify-content:space-between;margin-bottom:6px"><b>${hrEsc(m.party)}</b><button class="btn btn-secondary btn-sm" data-copy="${i}">복사</button></div>
    ${m.warnings.map(w=>`<div class="hr-notice warn">${hrEsc(w)}</div>`).join('')}<pre class="hr-pre">${hrEsc(m.text)}</pre></div>`).join('');
}
async function copyText(i){
  const m=MSGS[i]; if(!m) return;
  try{ await navigator.clipboard.writeText(m.text); toast('복사했습니다.'); }
  catch(e){ const pre=document.querySelector(`[data-msg="${i}"] pre`); const r=document.createRange(); r.selectNodeContents(pre); const s=getSelection(); s.removeAllRanges(); s.addRange(r);
    try{ document.execCommand('copy'); toast('복사했습니다.'); }catch(e2){ toast('복사하지 못했습니다. 문구를 직접 선택해 복사해 주세요.',true); } }
}
function orderConditions(l){
  const parts=[lineLabel(l)]; const must=hrSplit(l.must_skills).join(', '); if(must) parts.push('필수: '+must);
  const rate=cmnRateText(l.rate_buy_target); parts.push(rate?`단가 ${rate}`:'단가 협의'); return parts.join(' · ');
}
async function saveSend(){
  const x=sendInput(); if(!x) return; const pm=hrMap(D.S27,'party_id');
  // 이미 같은 업체·라인으로 보낸 기록이 있으면 확인(중복 발송 방지)
  const dups=[]; x.parties.forEach(p=>x.lines.forEach(l=>{ if(D.S34.some(o=>o.party_id===p&&o.line_id===l.line_id)) dups.push(`${hrPartyName(pm,p)} · ${lineLabel(l)}`); }));
  if(dups.length&&!confirm(`이미 발송 기록이 있습니다: ${dups.join(', ')}\n그래도 발송 기록을 또 추가할까요?`)) return;
  const sent=hrQ('sSent').value||hrToday(); let n=0;
  for(const p of x.parties){ for(const l of x.lines){
    const r=await hrAppend('S34',{request_id:REQ.request_id,line_id:l.line_id,party_id:p,sent_at:sent,reply_due:x.due,offered_rate_buy:l.rate_buy_target||'',conditions:orderConditions(l),reply_state:'대기'});
    if(!r.ok){ hrQ('sendMsg').textContent=(n?`${n}건까지 저장했고 `:'')+hrSaveFailText(r); if(n){ selParties=new Set(); await loadAll(); hrQ('sendMsg').textContent=`${n}건까지만 저장되었습니다. 발송 내역을 확인한 뒤 나머지를 다시 저장해 주세요.`; } return; }
    n++;
  } }
  toast(`✓ 발송 기록 ${n}건을 저장했습니다`); selParties=new Set(); await loadAll();
}

// ── ④ 발송 내역·회신 관리 ───────────────────────────────────────────────────
function renderOrders(){
  const box=hrQ('orderBox'); if(!REQ){ box.innerHTML=needSaved(); return; }
  if(!ORDERS.length){ box.innerHTML='<div class="hr-empty">아직 발송한 서치업체가 없습니다.</div>'; return; }
  const pm=hrMap(D.S27,'party_id'), lm=hrMap(D.S33,'line_id'); const closed=DER&&DER.closed; const today=hrToday();
  box.innerHTML=ORDERS.map(o=>{
    const d=cmnReplyDelay(o,REQ,today); const l=lm.get(o.line_id);
    const closedWait=closed&&o.reply_state==='대기';
    return `<div class="hr-line-card" data-order="${hrEsc(o.order_id)}">
      <div class="hr-row" style="justify-content:space-between;margin-bottom:6px"><b>${hrEsc(hrPartyName(pm,o.party_id))}</b><span class="hr-sub">${hrEsc(l?lineLabel(l):'(전체 라인)')} · 발송 ${hrEsc(o.sent_at)}</span>
        <span>${d.delayed?`<span class="hr-badge red" data-delay>지연 ${d.days}일</span>`:''}${closedWait?'<span class="hr-badge gray">종결(의뢰 '+hrEsc(DER.status)+')</span>':''}</span></div>
      <div class="hr-row">
        <div class="hr-field fixed" style="min-width:150px"><label>회신 상태</label><select class="hr-select oc-state">${optList(ORDER_STATES.map(s=>({v:s,t:s})),o.reply_state||'대기')}</select></div>
        <div class="hr-field fixed" style="min-width:160px"><label>회신 기한</label><input class="hr-input oc-due" type="date" value="${hrEsc(o.reply_due||'')}"></div>
        <div class="hr-field fixed" style="min-width:160px"><label>회신일</label><input class="hr-input oc-repl" type="date" value="${hrEsc(o.replied_at||'')}"></div>
        <div class="hr-field fixed" style="min-width:120px"><label>제시 매입 단가 (만원/월)</label><input class="hr-input num hr-amt oc-rate" inputmode="decimal" value="${hrEsc(hrFmtMan(o.offered_rate_buy))}"></div>
      </div>
      <div class="hr-row"><div class="hr-field"><label>조건 요약</label><input class="hr-input oc-cond" value="${hrEsc(o.conditions||'')}"></div><div class="hr-field"><label>메모</label><input class="hr-input oc-memo" value="${hrEsc(o.memo||'')}"></div></div>
      <div class="hr-err oc-msg" style="margin-top:6px"></div>
      <div class="hr-row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-oact="save">저장</button><button class="btn btn-danger btn-sm" data-oact="delete">삭제</button></div></div>`;
  }).join('');
}
const ORDER_STATES=HR_TABS.S34.enums?HR_TABS.S34.enums.reply_state:['대기','조건 협의 중','후보 추천','후보 없음','종결'];
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-oact]'); if(!b) return; const card=b.closest('[data-order]');
  hrBusy(b,()=>b.dataset.oact==='delete'?deleteOrder(card):saveOrder(card));
});
// 발송 기록 삭제 — 잘못 기록한 것을 지운다(변경 005). 이 발송으로 들어온 후보(S31.order_id)가 있으면 삭제하지 않는다. 직전에 시트를 다시 읽어 확인하고, 확인하지 못하면 삭제하지 않는다.
async function deleteOrder(card){
  const cur=ORDERS.find(o=>o.order_id===card.dataset.order); const msg=card.querySelector('.oc-msg'); msg.textContent='';
  const r=await hrReadMany(['S34','S31']); if(r.failed.length){ msg.textContent='사용 여부를 확인하지 못해 삭제하지 않았습니다. 다시 시도해 주세요.'; return; }
  const fresh=r.tabs.S34.rows.find(o=>o.order_id===cur.order_id); if(!fresh){ msg.textContent='이미 삭제된 발송 기록입니다.'; return; }
  const n=r.tabs.S31.rows.filter(c=>c.order_id===cur.order_id).length;
  if(n){ msg.textContent=`이 발송으로 들어온 후보 ${n}명이 연결되어 있어 삭제할 수 없습니다.`; return; }
  const pm=hrMap(D.S27,'party_id');
  if(!confirm(`${hrPartyName(pm,cur.party_id)} 발송 기록(${cur.order_id})을 삭제합니다. 되돌릴 수 없습니다. 삭제할까요?`)) return;
  const d=await hrDelete('S34',cur.order_id,{readUpdatedAt:fresh.updated_at}); if(!d.ok){ msg.textContent=hrSaveFailText(d); return; }
  toast('✓ 발송 기록을 삭제했습니다'); await loadAll();
}
async function saveOrder(card){
  const cur=ORDERS.find(o=>o.order_id===card.dataset.order); const e=s=>q$(card,s); const msg=e('.oc-msg'); msg.textContent='';
  const state=e('.oc-state').value, due=e('.oc-due').value; let repl=e('.oc-repl').value; const rate=hrManToWon(e('.oc-rate').value);
  if(!due){ msg.textContent='회신 기한을(를) 입력해 주세요.'; return; }
  if(Number.isNaN(rate)){ msg.textContent='단가는 0 이상의 숫자(만원)로 입력해 주세요.'; return; }
  if(rateTooBig(rate)){ msg.textContent=RATE_BIG_MSG; return; }
  if(state!==(cur.reply_state||'대기')&&repl===(cur.replied_at||'')) repl=state==='대기'?'':hrToday();   // 상태를 바꾸면 회신일은 오늘(직접 고친 값이 있으면 그대로)
  const rec={reply_state:state,reply_due:due,replied_at:repl,offered_rate_buy:rate,conditions:e('.oc-cond').value.trim(),memo:e('.oc-memo').value.trim()};
  const ch={}; Object.keys(rec).forEach(k=>{ if(String(cur[k]??'')!==String(rec[k]??'')) ch[k]=rec[k]; });
  if(!Object.keys(ch).length){ toast('변경된 내용이 없습니다'); return; }
  const r=await hrUpdate('S34',cur.order_id,ch,{readUpdatedAt:cur.updated_at});
  if(!r.ok){ msg.textContent=hrSaveFailText(r); return; }
  toast('✓ 저장했습니다'); await loadAll();
}
window.addEventListener('load',loadAll);
