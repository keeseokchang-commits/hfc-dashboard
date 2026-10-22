// HFC scr-request-promote.js v2.9.97 — STF-SCR-02 의뢰 상세: 사업기회 승격 · 견적에 반영 (개발 단계 ④-2, 사용자 승인 2026-10-21)
// 근거: 통합 설계서 v0.9 §3.3 불변식·§기존 시스템 연결(S01), §5.4 마진·재무 연결(S12).
// 쓰는 탭: S32.pipeline_id(수정, CMN-01) · S01 사업기회(새 행 추가) · S12 견적(새 행 추가). 기존 S01·S12 행은 바꾸지 않는다.
// 정한 것(2026-10-21 승인한 기본값):
//   · 승격은 인터뷰 이후(인터뷰·선정·계약) 사용자가 누르는 한 번의 동작. 이미 연결된 의뢰는 다시 만들지 않는다.
//   · 새 사업기회: 계약금액 비움 · 상태 '기회' · 유형 '인력공급' · 확도 비움(0%로 집계되어 예상 매출에 섞이지 않음) · 이름=고객명(알면) 또는 별칭(고칠 수 있음).
//   · 기존 사업기회에 연결도 고를 수 있다(유사한 것을 위에 표시). 이미 다른 의뢰에 연결된 사업기회는 고를 수 없다.
//   · 견적 반영: 선정·계약 단계 후보만, 새 행만 추가(같은 사업기회에 같은 이름의 인건비 행이 있으면 건너뜀). 기존 견적 행은 건드리지 않는다.
//     단가 = 후보 단가, 없으면 요청 라인 단가. 두 단가 중 하나라도 없으면 건너뜀. 기간 = 의뢰 투입 시기 + 개월 수. 지급 형태는 세금계산서형(기본).
// 의존: scr-request-detail.js(REQ·D·LINES·DER), scr-request-cands.js(PV·PV_DATA·pName), calc.js, cmn-sheet.js, hr-ui.js
const PRM={opps:[],mode:'new',busy:false};
const prmQ=id=>document.getElementById(id);
const PRM_STAGES=['인터뷰','선정','계약'];
const prmEsc=s=>hrEsc(String(s??''));
const prmWon=v=>{ const n=parseFloat(String(v??'').replace(/,/g,'')); return isNaN(n)?0:n; };
const prmNum=n=>Math.round(n).toLocaleString('ko-KR');

// ── 날짜 ──
function prmStart(){ return /^\d{4}-\d{2}$/.test(String(REQ.start_ym||'').trim())?String(REQ.start_ym).trim()+'-01':''; }
function prmEnd(){ // 투입 시기 월 + 개월 수 → 마지막 달의 말일. 시작 월이 월 중간(초/중/말)이라도 월 단위로만 계산한다.
  const sd=prmStart(), n=parseInt(REQ.duration_months,10); if(!sd||!(n>0)) return '';
  const y=parseInt(sd.slice(0,4),10), m=parseInt(sd.slice(5,7),10);
  return new Date(Date.UTC(y,m-1+n,0)).toISOString().slice(0,10);
}
function prmRequesterName(){ const p=(D.S27||[]).find(x=>x.party_id===REQ.requester_party_id); return p?p.name:''; }
function prmEndClientName(){
  const t=String(REQ.end_client_name||'').trim(); if(t) return t;
  const p=(D.S27||[]).find(x=>x.party_id===REQ.end_client_party_id); return p?p.name:'';
}

// ── 버튼 상태 ──
function prmAdoptable(){
  const live=LINES.filter(l=>!cmnYes(l.is_cancelled)), out=[], seen=new Set();
  live.forEach(l=>{
    const cs=D.S31.filter(c=>c.line_id===l.line_id&&['선정','계약'].includes(c.stage));
    cs.sort((a,b)=>(cmnYes(b.is_adopted)?1:0)-(cmnYes(a.is_adopted)?1:0)||String(a.cand_id).localeCompare(String(b.cand_id)));
    cs.forEach(c=>{
      const key=l.line_id+'|'+c.person_id; if(seen.has(key)) return; seen.add(key);   // 같은 사람이 여러 경로로 들어왔으면 채택 경로(없으면 앞선 것) 하나만
      out.push({cand:c,line:l,sell:prmWon(c.rate_sell)||prmWon(l.rate_sell),buy:prmWon(c.rate_buy)||prmWon(l.rate_buy_target)});
    });
  });
  return out;
}
function renderPromote(){
  const bp=prmQ('btnPromote'), be=prmQ('btnEstimate'), help=prmQ('promoteHelp'); if(!bp||!be) return;
  prmQ('promotePanel').style.display='none';
  if(!REQ){ bp.disabled=be.disabled=true; help.textContent='의뢰 정보를 먼저 저장해 주세요.'; return; }
  const closed=!!(DER&&DER.closed), st=DER?DER.status:'', pid=String(REQ.pipeline_id||'').trim();
  bp.disabled=!(!closed&&!pid&&PRM_STAGES.includes(st));
  const ad=prmAdoptable();
  be.disabled=!(pid&&!closed&&ad.length);
  bp.title=pid?'이미 사업기회와 연결된 의뢰입니다.':(closed?'종료된 의뢰입니다.':(bp.disabled?'후보가 인터뷰 단계에 들어가면 사용할 수 있습니다.':''));
  be.title=!pid?'사업기회 승격 후 사용할 수 있습니다.':(closed?'종료된 의뢰입니다.':(!ad.length?'선정·계약 단계의 후보가 있으면 사용할 수 있습니다.':''));
  if(pid) help.innerHTML=`사업기회 <b>${prmEsc(pid)}</b> 와 연결되어 있습니다. <a href="estimate.html?pid=${encodeURIComponent(pid)}" style="color:inherit;font-weight:600">견적 화면에서 보기</a>${ad.length?'':' · 선정·계약 단계의 후보가 생기면 「견적에 반영」을 쓸 수 있습니다.'}`;
  else if(closed) help.textContent='종료(실패·취소)된 의뢰는 사업기회로 승격하지 않습니다.';
  else if(!PRM_STAGES.includes(st)) help.textContent='사업기회 승격은 후보가 인터뷰 단계에 들어간 뒤에 할 수 있습니다.';
  else help.textContent='후보가 인터뷰 단계에 들어갔습니다. 계약 가능성이 보이면 사업기회로 승격해 주세요(한 번만).';
}
function prmClose(){ prmQ('promotePanel').style.display='none'; }

// ── 사업기회 승격 ──
async function openPromote(){
  const box=prmQ('promotePanel'); box.style.display=''; box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  let rows; try{ rows=await fetchSheet(...R.S01); }catch(e){ box.innerHTML='<div class="hr-notice err">사업기회 목록을 읽지 못해 승격을 중단했습니다. 다시 시도해 주세요. <button class="btn btn-secondary btn-sm" onclick="prmClose()">닫기</button></div>'; return; }
  PRM.opps=toObj(rows).filter(o=>o.pipeline_id); PRM.mode='new';
  const linked=new Set(D.S32.filter(r=>r.request_id!==REQ.request_id&&String(r.pipeline_id||'').trim()).map(r=>r.pipeline_id));
  const rq=prmRequesterName(), ec=prmEndClientName(), al=String(REQ.alias||'');
  const free=PRM.opps.filter(o=>!linked.has(o.pipeline_id));
  const sim=o=>(rq&&o.client===rq)||(ec&&(o.end_client===ec||String(o.opportunity||'').includes(ec)))||(al&&String(o.opportunity||'').includes(al));
  const opt=o=>`<option value="${prmEsc(o.pipeline_id)}">${prmEsc(o.pipeline_id)} · ${prmEsc(o.opportunity)} · ${prmEsc(o.client||'-')} · ${prmEsc(o.status||'-')}</option>`;
  const simL=free.filter(sim), other=free.filter(o=>!sim(o));
  box.innerHTML=`<div class="hr-lbl">사업기회 승격 — 인터뷰 이후 한 번만 합니다</div>
    <div class="hr-row" style="margin:8px 0"><label><input type="radio" name="prmMode" value="new" checked> 새 사업기회 만들기</label>
      <label style="margin-left:14px"><input type="radio" name="prmMode" value="link"${free.length?'':' disabled'}> 기존 사업기회에 연결${free.length?'':' (연결할 수 있는 것이 없음)'}</label></div>
    <div id="prmNew">
      <div class="hr-row">
        <div class="hr-field" style="min-width:220px"><label class="hr-req" for="prmName">사업기회 이름</label><input class="hr-input" id="prmName" value="${prmEsc(ec||al)}"><div class="hr-err" id="prmNameErr"></div></div>
        <div class="hr-field"><label for="prmClient">고객(요청자)</label><input class="hr-input" id="prmClient" value="${prmEsc(rq)}"></div>
        <div class="hr-field"><label for="prmEndClient">최종 고객</label><input class="hr-input" id="prmEndClient" value="${prmEsc(ec)}"></div>
      </div>
      <div class="hr-row" style="margin-top:6px">
        <div class="hr-field fixed"><label for="prmStart">시작 예정</label><input class="hr-input" type="date" id="prmStart" value="${prmEsc(prmStart())}"></div>
        <div class="hr-field fixed"><label for="prmEnd">종료 예정</label><input class="hr-input" type="date" id="prmEnd" value="${prmEsc(prmEnd())}"></div>
      </div>
      <div class="hr-help" style="margin-top:6px">계약금액은 비워 두고(계약 후 입력), 상태는 「기회」, 유형은 「인력공급」, 확도는 비워서 만듭니다. 이름은 고칠 수 있습니다.</div>
    </div>
    <div id="prmLink" style="display:none"><div class="hr-field"><label for="prmSel">연결할 사업기회</label><select class="hr-select" id="prmSel">
      ${simL.length?`<optgroup label="비슷한 사업기회">${simL.map(opt).join('')}</optgroup>`:''}${other.length?`<optgroup label="그 밖의 사업기회">${other.map(opt).join('')}</optgroup>`:''}</select></div>
      <div class="hr-help" style="margin-top:6px">이미 다른 의뢰에 연결된 사업기회는 목록에 나오지 않습니다. 연결만 하고 사업기회 내용은 바꾸지 않습니다.</div></div>
    <div class="hr-row" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="prmDo" onclick="doPromote()">승격</button><button class="btn btn-secondary btn-sm" onclick="prmClose()">닫기</button></div>
    <div class="hr-err" id="prmMsg" style="margin-top:6px"></div>`;
  box.querySelectorAll('input[name=prmMode]').forEach(r=>r.addEventListener('change',()=>{ PRM.mode=r.value; prmQ('prmNew').style.display=r.value==='new'?'':'none'; prmQ('prmLink').style.display=r.value==='link'?'':'none'; }));
}
async function doPromote(){
  await hrBusy(prmQ('prmDo'),async()=>{
    const msg=prmQ('prmMsg'); msg.textContent=''; prmQ('prmNameErr')&&(prmQ('prmNameErr').textContent='');
    const cur=D.S32.find(r=>r.request_id===REQ.request_id);
    if(String((cur||REQ).pipeline_id||'').trim()){ msg.textContent='이미 사업기회와 연결된 의뢰입니다. 화면을 다시 불러옵니다.'; await loadAll(); return; }
    let pid='', created=false;
    if(PRM.mode==='link'){
      pid=prmQ('prmSel').value; if(!pid){ msg.textContent='연결할 사업기회를 고르세요.'; return; }
      const fresh=await hrReadMany(['S32']); if(fresh.failed.length){ msg.textContent=HR_MSG.read('S32_REQUEST'); return; }
      if(fresh.tabs.S32.rows.some(r=>r.request_id!==REQ.request_id&&String(r.pipeline_id||'').trim()===pid)){ msg.textContent='그 사업기회는 방금 다른 의뢰에 연결되었습니다. 다시 선택해 주세요.'; return; }
    }else{
      const name=prmQ('prmName').value.trim(); if(!name){ prmQ('prmNameErr').textContent='사업기회 이름을 입력해 주세요.'; return; }
      let rows; try{ rows=await fetchSheet(...R.S01); }catch(e){ msg.textContent='사업기회 목록을 읽지 못해 중단했습니다.'; return; }
      const header=(rows[0]||[]).map(String); if(!header.includes('pipeline_id')){ msg.textContent='사업기회 시트의 머리글을 읽지 못해 중단했습니다.'; return; }
      const opps=toObj(rows);
      const maxNum=opps.reduce((m,o)=>{ const n=parseInt(String(o.pipeline_id||'').replace(/\D/g,'').slice(-3),10)||0; return Math.max(m,n); },0);
      pid=`PL-${hrToday().slice(0,4)}-${String(maxNum+1).padStart(3,'0')}`;
      const rec={pipeline_id:pid,opportunity:name,client:prmQ('prmClient').value.trim(),end_client:prmQ('prmEndClient').value.trim(),probability:'',contract_amount:'',
        expected_start:prmQ('prmStart').value,expected_end:prmQ('prmEnd').value,payment_cycle:'',status:'기회',memo:`의뢰 ${REQ.request_id} 에서 승격`,created_at:hrToday(),biz_type:'인력공급'};
      const url=`${HR_API}/values/${encodeURIComponent(R.S01[0]+'!A:M')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      const r=await hrSend('POST',url,{values:rowsFor(header,[rec])});
      if(!r.ok){ msg.textContent=HR_MSG.write; return; }
      created=true;
    }
    const u=await hrUpdate('S32',REQ.request_id,{pipeline_id:pid},{readUpdatedAt:REQ.updated_at});
    if(!u.ok){ msg.textContent=(created?`사업기회 ${pid} 는 만들어졌지만 의뢰에 연결하지 못했습니다. 「기존 사업기회에 연결」로 다시 연결해 주세요. — `:'')+hrSaveFailText(u); return; }
    toast(created?`✓ 사업기회 ${pid} 를 만들고 연결했습니다`:`✓ 사업기회 ${pid} 에 연결했습니다`); await loadAll();
  });
}

// ── 견적에 반영 ──
let PRM_EST=null;
async function openEstimatePanel(){
  const box=prmQ('promotePanel'); box.style.display=''; box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const fail=m=>{ box.innerHTML=`<div class="hr-notice err">${prmEsc(m)} <button class="btn btn-secondary btn-sm" onclick="prmClose()">닫기</button></div>`; };
  let s12, s11, s10; try{ [s12,s11,s10]=await Promise.all([fetchSheet(...R.S12),fetchSheet(...R.S11),fetchSheet(...R.S10).catch(()=>[])]); }catch(e){ fail('견적·단가표를 읽지 못해 중단했습니다. 다시 시도해 주세요.'); return; }
  calcApplySettings(toObj(s10));
  const pid=String(REQ.pipeline_id||'').trim();
  const ests=toObj(s12).filter(e=>e.estimate_id&&e.pipeline_id===pid&&e.comp_type==='인건비');
  const rates=toObj(s11).filter(r=>r.set_id), def=rates.find(r=>String(r.is_default).toUpperCase()==='Y')||rates[0];
  PRM_EST={pid,setId:def?def.set_id:'',items:[]};
  const sd=prmStart(), ed=prmEnd();
  prmAdoptable().forEach((a,i)=>{
    const name=pName(a.cand.person_id); const dup=ests.some(e=>e.item_name===name);
    const reason=dup?'이미 견적에 있음':(!(a.sell>0)||!(a.buy>0)?'단가 없음(후보 단계 ⑤ 또는 요청 라인에서 매출·매입 단가 입력)':'');
    const row={comp_type:'인건비',item_name:name,grade:a.line.grade||'',grade_set_id:PRM_EST.setId,qty:'1',unit_price:String(a.sell),buy_price:String(a.buy),mm:'',start_date:sd,end_date:ed,memo:''};
    if(sd&&ed) row.mm=mmTotal(sd,ed); else if(parseInt(REQ.duration_months,10)>0) row.mm=String(parseInt(REQ.duration_months,10));
    row.amount=String(row.mm!==''?laborAmt(row,'unit_price'):0);
    PRM_EST.items.push({i,name,row,reason,sell:a.sell,buy:a.buy,lineLabel:lineLabel(a.line)});
  });
  const rowsHtml=PRM_EST.items.map(it=>`<tr><td><input type="checkbox" class="prmChk" data-i="${it.i}"${it.reason?' disabled':' checked'}></td><td>${prmEsc(it.name)}<div class="hr-sub">${prmEsc(it.lineLabel)}</div></td>
      <td class="r">${it.sell?prmEsc(hrFmtMan(it.sell))+'만원':'-'}</td><td class="r">${it.buy?prmEsc(hrFmtMan(it.buy))+'만원':'-'}</td>
      <td>${it.row.start_date?prmEsc(it.row.start_date)+' ~ '+prmEsc(it.row.end_date||'?'):'<span class="hr-sub">기간 미정</span>'}</td><td class="r">${it.row.mm!==''?prmEsc(it.row.mm):'-'}</td>
      <td class="r">${prmNum(prmWon(it.row.amount))}</td><td>${it.reason?`<span class="hr-badge gray">${prmEsc(it.reason)}</span>`:''}</td></tr>`).join('');
  const noPeriod=PRM_EST.items.some(it=>!it.row.start_date&&!it.reason);
  box.innerHTML=`<div class="hr-lbl">견적에 반영 — 사업기회 ${prmEsc(pid)} 에 인건비 행을 추가합니다</div>
    <div class="hr-help" style="margin:6px 0">선정·계약 단계의 후보만 새 행으로 추가합니다. 이미 있는 견적 행은 바꾸지 않고, 같은 이름이 이미 있으면 건너뜁니다. 일할 계산은 설정의 기본 규칙을 따르며 견적 화면에서 바꿀 수 있습니다.</div>
    <div style="overflow-x:auto"><table class="hr-table"><thead><tr><th></th><th>후보</th><th>매출 단가</th><th>매입 단가</th><th>기간</th><th>M/M</th><th>총 매출(원)</th><th>비고</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    ${noPeriod?'<div class="hr-notice warn" style="margin-top:6px">의뢰에 투입 시기나 기간(개월)이 없는 행은 기간 없이 추가됩니다. 견적 화면에서 기간을 입력해 주세요.</div>':''}
    <div class="hr-notice warn" style="margin-top:6px">견적 화면을 이미 열어 두었다면 저장 전에 새로고침해 주세요. (열어 둔 화면에서 저장하면 여기서 추가한 행이 사라질 수 있습니다.)</div>
    <div class="hr-row" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="prmEstDo" onclick="doEstimate()">견적에 추가</button><button class="btn btn-secondary btn-sm" onclick="prmClose()">닫기</button></div>
    <div class="hr-err" id="prmMsg" style="margin-top:6px"></div>`;
}
async function doEstimate(){
  await hrBusy(prmQ('prmEstDo'),async()=>{
    const msg=prmQ('prmMsg'); msg.textContent='';
    const picked=[...document.querySelectorAll('.prmChk:checked')].map(c=>PRM_EST.items.find(x=>String(x.i)===c.dataset.i)).filter(Boolean);
    if(!picked.length){ msg.textContent='추가할 후보를 선택해 주세요.'; return; }
    let rows; try{ rows=await fetchSheet(...R.S12); }catch(e){ msg.textContent='견적 시트를 읽지 못해 중단했습니다.'; return; }
    const header=(rows[0]||[]).map(String); if(!header.includes('estimate_id')){ msg.textContent='견적 시트의 머리글을 읽지 못해 중단했습니다.'; return; }
    const cur=toObj(rows).filter(e=>e.estimate_id);
    const have=new Set(cur.filter(e=>e.pipeline_id===PRM_EST.pid&&e.comp_type==='인건비').map(e=>e.item_name));
    const todo=picked.filter(it=>!have.has(it.name));
    if(!todo.length){ msg.textContent='선택한 후보가 이미 견적에 있습니다.'; return; }
    let n=cur.reduce((m,e)=>Math.max(m,parseInt(String(e.estimate_id).replace(/\D/g,'').slice(-3),10)||0),0);
    const today=hrToday(), yr=today.slice(0,4);
    const recs=todo.map(it=>{ n++; return {...it.row,estimate_id:`EST-${yr}-${String(n).padStart(3,'0')}`,pipeline_id:PRM_EST.pid,created_at:today}; });
    const url=`${HR_API}/values/${encodeURIComponent(R.S12[0]+'!A:W')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const r=await hrSend('POST',url,{values:rowsFor(header,recs)});
    if(!r.ok){ msg.textContent=HR_MSG.write; return; }
    const skipped=picked.length-todo.length;
    toast(`✓ 견적에 ${todo.length}건을 추가했습니다`+(skipped?` (이미 있는 ${skipped}건 제외)`:''));
    prmQ('promotePanel').innerHTML=`<div class="hr-notice ok">견적에 ${todo.length}건을 추가했습니다. <a href="estimate.html?pid=${encodeURIComponent(PRM_EST.pid)}" style="color:inherit;font-weight:600">견적 화면에서 확인</a></div>`;
  });
}
