// HFC scr-request.js v2.9.76 — STF-SCR-01 의뢰 대장
// 근거: 프로그램 설계서 §4(SCR-01). 인력 의뢰 건을 한 화면에서 보고, 부족한 건과 조치가 필요한 건을 바로 찾게 한다. 읽기 전용(등록·수정은 의뢰 상세에서).
// 의존: schema.js, common.js, cmn-sheet.js, cmn-derive.js(상태·충원·지연), cmn-alert.js(알림·연락처 유무), hr-ui.js
const PAGE_SIZE=50;                     // 한 화면 표시 건수 (R5 확정) — 이후 "더 보기"
const DUE_SOON_DAYS=7;                  // 마감 임박 기준 (R3 확정: 7일 이내)
const REQ_STATUSES=['접수','탐색',...CMN_STAGE_ORDER,'실패','취소'];
const STATUS_COLOR={접수:'gray',탐색:'gray',추천수령:'blue',회신:'blue',서류통과:'blue',인터뷰:'amber',선정:'green',계약:'green',실패:'red',취소:'gray'};
let D={S32:[],S33:[],S34:[],S31:[],S27:[]};
let ROWS=[], ALERTS=null, ASOF='';
let sortKey='received', sortDir=-1;      // 기본 정렬: 의뢰일 최신순 (R4 확정)
let quick='';                             // 상단 카드로 거른 조건 (R6 확정: 카드를 누르면 목록이 그 조건으로 걸러진다)
let shown=PAGE_SIZE;

// 의뢰 한 건의 화면용 행 — 저장하지 않는 값(상태·충원·부족)은 CMN-04 에서 가져온다
function buildRows(d,asOf){
  const pm=hrMap(d.S27,'party_id'); const der=cmnDeriveRequests({reqs:d.S32,lines:d.S33,cands:d.S31,orders:d.S34},asOf);
  return d.S32.map(r=>{
    const x=der[r.request_id]; const lines=d.S33.filter(l=>l.request_id===r.request_id&&!cmnYes(l.is_cancelled));
    const roles=[...new Set(lines.flatMap(l=>hrSplit(l.role_codes)))];
    const customer=r.end_client_party_id?hrPartyName(pm,r.end_client_party_id):(r.end_client_name||'');
    const parties=x.partyIds.map(id=>hrPartyName(pm,id));
    const dueIn=cmnDiffDays(asOf,r.requester_due);
    return {id:r.request_id,customer,alias:r.alias,roles:roles.join(', '),need:x.need,filled:x.filled,short:x.short&&!x.closed,closed:x.closed,
      sellText:hrRangeMan(lines.map(l=>l.rate_sell)),buyText:hrRangeMan(lines.map(l=>l.rate_buy_target)),
      sellMin:Math.min(...lines.map(l=>parseFloat(l.rate_sell)||Infinity)),buyMin:Math.min(...lines.map(l=>parseFloat(l.rate_buy_target)||Infinity)),
      received:r.received_at||'',status:x.status,parties,partyText:parties.length?parties[0]+(parties.length>1?` 외 ${parties.length-1}곳`:''):'',
      dueSoon:!x.closed&&dueIn!==null&&dueIn<=DUE_SOON_DAYS,dueIn,delayed:x.delayed,orderCount:x.orderCount};
  });
}
function contactRequestIds(){ return new Set(((ALERTS&&ALERTS.contactRequest.list)||[]).map(c=>c.request_id)); }
const isOpen=r=>!r.closed;
// 상단 요약 카드의 숫자와 카드별 거르기 조건
function kpiDefs(){
  const open=ROWS.filter(isOpen); const cr=ALERTS?ALERTS.contactRequest:{status:'unavailable',count:null};
  const crIds=contactRequestIds();
  return [
    {key:'open',label:'진행 중 의뢰',value:open.length,unit:'건',cls:'blue',test:r=>isOpen(r)},
    {key:'short',label:'인원 부족 의뢰',value:open.filter(r=>r.short).length,unit:'건',cls:'red',test:r=>r.short},
    {key:'contact',label:'연락처 요청 필요 후보',value:cr.status==='ok'?cr.count:'확인 불가',unit:cr.status==='ok'?'명':'',cls:'amber',test:r=>crIds.has(r.id)},
    {key:'due',label:'마감 임박 의뢰',value:open.filter(r=>r.dueSoon).length,unit:'건',cls:'amber',sub:`요청자 회신 기한 ${DUE_SOON_DAYS}일 이내`,test:r=>r.dueSoon},
  ];
}
function renderKpis(){
  hrQ('kpis').innerHTML=kpiDefs().map(k=>`<button class="hr-kpi ${k.cls}${quick===k.key?' on':''}" data-kpi="${k.key}" onclick="toggleQuick('${k.key}')"><div class="l">${hrEsc(k.label)}</div><div class="v">${hrEsc(k.value)}<span style="font-size:12px;font-weight:500"> ${hrEsc(k.unit)}</span></div><div class="s">${hrEsc(k.sub||(quick===k.key?'다시 누르면 해제':'누르면 목록을 걸러 봅니다'))}</div></button>`).join('');
}
function toggleQuick(k){ quick=quick===k?'':k; shown=PAGE_SIZE; render(); }

// 필터 — 연도와 월은 서로 독립이며 모두 AND (의뢰일 기준)
function filtered(){
  const y=hrQ('fYear').value, m=hrQ('fMonth').value, st=hrQ('fStatus').value, cl=hrQ('fClient').value, q=hrQ('fSearch').value.trim().toLowerCase();
  const kp=quick?kpiDefs().find(k=>k.key===quick):null;
  return ROWS.filter(r=>{
    if(y&&r.received.slice(0,4)!==y) return false;
    if(m&&r.received.slice(5,7)!==m.padStart(2,'0')) return false;
    if(st&&r.status!==st) return false;
    if(cl&&(r.customer||'(미확인)')!==cl) return false;
    if(q&&![r.id,r.alias,r.customer,r.roles,...r.parties].join(' ').toLowerCase().includes(q)) return false;
    if(kp&&!kp.test(r)) return false;
    return true;
  });
}
const SORTERS={id:r=>r.id,customer:r=>r.customer,alias:r=>r.alias,roles:r=>r.roles,need:r=>r.need,filled:r=>r.filled,short:r=>(r.short?1:0),
  sell:r=>r.sellMin,buy:r=>r.buyMin,received:r=>r.received,status:r=>REQ_STATUSES.indexOf(r.status),party:r=>r.partyText};
function sorted(list){
  const f=SORTERS[sortKey]; const num=typeof f(list[0]||{need:0,sellMin:0,buyMin:0,received:''})==='number';
  return list.slice().sort((a,b)=>{ const x=f(a), y=f(b); const c=num?(x-y):String(x).localeCompare(String(y),'ko'); return (c||String(a.id).localeCompare(String(b.id)))*sortDir; });
}
function setSort(k){ if(sortKey===k) sortDir=-sortDir; else { sortKey=k; sortDir=(k==='received'||k==='need'||k==='filled')?-1:1; } render(); }
function onFilter(){ shown=PAGE_SIZE; render(); }
function clearFilters(){ ['fYear','fMonth','fStatus','fClient'].forEach(i=>hrQ(i).value=''); hrQ('fSearch').value=''; quick=''; shown=PAGE_SIZE; render(); }
function showMore(){ shown+=PAGE_SIZE; renderList(); }

const COLS=[['id','의뢰 번호',110,''],['customer','고객사',110,''],['alias','프로젝트명',150,''],['roles','역할',110,''],['need','필요 인원',64,'r'],['filled','충원 인원',64,'r'],['short','부족 여부',84,''],
  ['sell','판매 단가(만원/월)',96,'r'],['buy','매입 목표 단가(만원/월)',104,'r'],['received','의뢰일',92,''],['status','상태',84,''],['party','서치업체',130,'']];
function cellOf(r,k){
  switch(k){
    case 'id': return hrEsc(r.id);
    case 'customer': return hrEsc(r.customer||'(미확인)');
    case 'alias': return hrEsc(r.alias);
    case 'roles': return hrEsc(r.roles||'-');
    case 'need': return r.need;
    case 'filled': return r.filled;
    case 'short': return r.closed?'-':(r.need===0?'-':(r.short?`<span class="hr-badge red">부족 ${r.need-r.filled}명</span>`:'<span class="hr-badge green">충족</span>'));
    case 'sell': return hrEsc(r.sellText);
    case 'buy': return hrEsc(r.buyText);
    case 'received': return hrEsc(r.received);
    case 'status': return `<span class="hr-badge ${STATUS_COLOR[r.status]||'gray'}">${hrEsc(r.status)}</span>`;
    case 'party': return hrEsc(r.partyText||'-');
  }
}
const titleOf=(r,k)=>({customer:r.customer,alias:r.alias,roles:r.roles,party:r.parties.length?`${r.parties.join(', ')} (총 ${r.parties.length}곳)`:''})[k]||'';
function renderList(){
  const box=hrQ('listBox');
  if(!ROWS.length){ box.innerHTML='<div class="hr-empty">등록된 의뢰가 없습니다.</div>'; hrQ('btnNewReq').classList.add('btn-emph'); hrQ('listCount').textContent=''; return; }
  hrQ('btnNewReq').classList.remove('btn-emph');
  const list=sorted(filtered()); hrQ('listCount').textContent=`${list.length}건`;
  if(!list.length){ box.innerHTML='<div class="hr-empty">조건에 맞는 의뢰가 없습니다.<br><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="clearFilters()">필터 해제</button></div>'; return; }
  const arrow=k=>sortKey===k?`<span class="hr-sort">${sortDir>0?'▲':'▼'}</span>`:'';
  const head=COLS.map(([k,label,w,cls])=>`<th class="${cls}" style="width:${w}px" onclick="setSort('${k}')" data-sort="${k}">${hrEsc(label)}${arrow(k)}</th>`).join('');
  const body=list.slice(0,shown).map(r=>`<tr data-id="${hrEsc(r.id)}" onclick="openReq(this.dataset.id)">${COLS.map(([k,,,cls])=>`<td class="${cls}" title="${hrEsc(titleOf(r,k))}">${cellOf(r,k)}</td>`).join('')}</tr>`).join('');
  box.innerHTML=`<div class="hr-scroll"><table class="hr-table" style="min-width:${COLS.reduce((s,c)=>s+c[2],0)}px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    +(list.length>shown?`<div style="text-align:center;margin-top:10px"><button class="btn btn-secondary" onclick="showMore()">더 보기 (남은 ${list.length-shown}건)</button></div>`:'');
}
function openReq(id){ location.href='request-detail.html?id='+encodeURIComponent(id); }

// 알림 영역 — 의뢰별로 묶어 문구로 보여 준다. 연락처 값은 어디에도 나오지 않는다.
function renderAlerts(){
  const box=hrQ('alertBox'); const a=ALERTS; const rows=new Map(ROWS.map(r=>[r.id,r])); const out=[];
  const name=id=>(rows.get(id)||{alias:id}).alias;
  const pm=hrMap(D.S27,'party_id');
  a.replyDelay.forEach(x=>out.push(`<div class="hr-alert" data-alert="delay" data-id="${hrEsc(x.request_id)}" onclick="openReq(this.dataset.id)">⏰ ${hrEsc(name(x.request_id))} — ${hrEsc(hrPartyName(pm,x.party_id))} 회신 지연 ${x.days}일 (기한 ${hrEsc(x.reply_due)})</div>`));
  if(a.contactRequest.status==='unavailable') out.push('<div class="hr-alert plain" data-alert="contact-unknown">📞 연락처 요청 알림: 확인 불가 (연락처 정보를 읽지 못했습니다)</div>');
  else { const by={}; a.contactRequest.list.forEach(c=>{ (by[c.request_id]=by[c.request_id]||[]).push(c); });
    Object.keys(by).forEach(id=>out.push(`<div class="hr-alert red" data-alert="contact" data-id="${hrEsc(id)}" onclick="openReq(this.dataset.id)">📞 ${hrEsc(name(id))} — 연락처 미확보 후보 ${by[id].length}명 (요청 후 최대 ${Math.max(...by[id].map(c=>c.days))}일 경과)</div>`)); }
  const iv={}; a.interviewWait.forEach(c=>{ (iv[c.request_id]=iv[c.request_id]||[]).push(c); });
  Object.keys(iv).forEach(id=>out.push(`<div class="hr-alert" data-alert="interview" data-id="${hrEsc(id)}" onclick="openReq(this.dataset.id)">🗓 ${hrEsc(name(id))} — 인터뷰 결과 대기 ${iv[id].length}명 (인터뷰 일시 경과)</div>`));
  box.innerHTML=out.length?out.join(''):`<div class="hr-alert plain">${CMN_ALERT_MSG.empty}</div>`;
}

function fillFilters(){
  const keep=['fYear','fMonth','fStatus','fClient'].map(i=>hrQ(i).value);
  const years=[...new Set(ROWS.map(r=>r.received.slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
  hrQ('fYear').innerHTML='<option value="">전체 연도</option>'+years.map(y=>`<option value="${y}">${y}년</option>`).join('');
  hrQ('fMonth').innerHTML='<option value="">전체 월</option>'+Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join('');
  hrQ('fStatus').innerHTML='<option value="">전체 상태</option>'+REQ_STATUSES.map(s=>`<option>${hrEsc(s)}</option>`).join('');
  const cl=[...new Set(ROWS.map(r=>r.customer||'(미확인)'))].sort((a,b)=>a.localeCompare(b,'ko'));
  hrQ('fClient').innerHTML='<option value="">전체 고객사</option>'+cl.map(c=>`<option>${hrEsc(c)}</option>`).join('');
  ['fYear','fMonth','fStatus','fClient'].forEach((i,n)=>{ hrQ(i).value=keep[n]; });
}
function render(){ renderKpis(); renderList(); }

async function loadAll(){
  const box=hrQ('loadBox'); box.innerHTML='<div class="hr-empty"><span class="spinner"></span></div>';
  const r=await hrLoadScreen(['S32','S33','S34','S31','S27']);
  if(r.state!=='ok'){ hrQ('screen').style.display='none'; hrShowLoadProblem(box,r.state,r.message); return; }
  box.innerHTML=''; hrQ('screen').style.display=''; D=r.data; ASOF=hrToday();
  ROWS=buildRows(D,ASOF);
  // 알림 — 연락처 유무가 필요한 후보가 있을 때만 S39 를 읽는다. 읽기가 실패해도 화면은 정상 표시하고 연락처 요청만 "확인 불가".
  ALERTS=await cmnAlertSummary({reqs:D.S32,lines:D.S33,cands:D.S31,orders:D.S34,persons:{}},ASOF,{});
  fillFilters(); render(); renderAlerts();
}
window.addEventListener('load',loadAll);
