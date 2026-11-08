// HFC cmn-alert.js v2.9.76 — STF-CMN-06 알림 집계 및 연락처 유무 확인 (읽기 전용)
// 근거: 프로그램 설계서 §23(CMN-06), 통합 설계서 v0.9 "파생값 표"
// 하는 일: 회신 지연·연락처 요청·인터뷰 대기·철수 예정·재확인 필요·생일 알림의 목록과 건수를 한 곳에서 계산한다.
// 이 파일은 S39(민감·연락 정보)를 읽는 유일한 코드다. 휴대폰·이메일·요청일 열만 읽어 "있다/없다"만 돌려주고 값은 돌려주지 않는다.
// 주민번호 앞자리(rid_head7) 등 다른 열은 읽지 않는다. 읽기가 실패하면 연락처 요청 알림만 "확인 불가"로 하고 나머지는 정상 표시한다.
// 의존: cmn-derive.js(날짜·파생 계산), cmn-sheet.js(hrHeader·hrGet·hrRangeUrl), schema.js(HR_TABS·colLetter·R)

const CMN_ALERT_MSG={empty:'확인할 알림이 없습니다.',contactUnknown:'확인 불가'};
const CMN_BIRTHDAY_WINDOW=14;   // 생일·일정 창(일) — 설계서 §23.2 고정값

// 후보 id 목록 → {id:{has:true|false, requested_at:'YYYY-MM-DD'|''}}. 연락처 값은 돌려주지 않는다.
// 반환 {ok:true,map} / {ok:false,message}
async function cmnContactPresence(personIds){
  const ids=[...new Set((personIds||[]).filter(Boolean))];
  if(!ids.length) return {ok:true,map:{}};
  const h=await hrHeader('S39'); if(!h.ok) return {ok:false,message:h.message};
  const need=['person_id','mobile','email','contact_requested_at'];
  const L=Object.fromEntries(need.map(n=>[n,colLetter(h.header.indexOf(n)+1)]));
  const t=HR_TABS.S39; const last=t.rows;
  const qs=need.map(n=>'ranges='+encodeURIComponent(`${t.tab}!${L[n]}1:${L[n]}${last}`)).join('&');
  const r=await hrGet(`${HR_API}/values:batchGet?${qs}&key=${API_KEY}`);
  if(!r.ok) return {ok:false,message:HR_MSG.read(t.tab)};
  const cols=need.map((n,i)=>((r.json.valueRanges||[])[i]||{}).values||[]);
  const want=new Set(ids); const map={};
  const rows=Math.max(...cols.map(c=>c.length));
  for(let i=1;i<rows;i++){
    const pid=String((cols[0][i]||[])[0]??'').trim(); if(!pid||!want.has(pid)) continue;
    const mobile=String((cols[1][i]||[])[0]??'').trim(), email=String((cols[2][i]||[])[0]??'').trim();
    map[pid]={has:mobile!==''||email!=='',requested_at:String((cols[3][i]||[])[0]??'').trim()};
  }
  ids.forEach(id=>{ if(!map[id]) map[id]={has:false,requested_at:''}; });
  return {ok:true,map};
}

// 합침으로 숨겨진 후보(merged_into 있음 또는 비활성)는 모든 알림에서 제외 — S20에 없는 후보는 그대로 둔다
function cmnPersonActive(persons,pid){
  const p=persons&&persons[pid]; if(!p) return true;
  return cmnBlank(p.merged_into)&&String(p.is_active??'Y').trim()!=='N';
}
// 연락처 요청 대상 후보 행: 열려 있는 의뢰의, 취소되지 않은 라인의, 선정 이상 단계 후보
function cmnContactCandidates(data){
  const openReq=new Set((data.reqs||[]).filter(r=>!cmnIsClosed(r)).map(r=>r.request_id));
  const liveLine=new Map((data.lines||[]).filter(l=>!cmnYes(l.is_cancelled)&&openReq.has(l.request_id)).map(l=>[l.line_id,l]));
  return (data.cands||[]).filter(c=>CMN_FILLED_STAGES.includes(c.stage)&&liveLine.has(c.line_id)).map(c=>({...c,request_id:liveLine.get(c.line_id).request_id}));
}
// 다음 생일까지 남은 일수 (생년월일이 있는 경우만). 2월 29일생은 평년에 2월 28일로 본다.
function cmnDaysToBirthday(birthDate,asOf){
  const b=cmnDate(birthDate), a=cmnDate(asOf); if(!b||!a) return null;
  const at=y=>{ let d=b.d; if(b.m===2&&b.d===29&&!(y%4===0&&(y%100!==0||y%400===0))) d=28; return `${y}-${String(b.m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; };
  let t=at(a.y); if(cmnDiffDays(asOf,t)<0) t=at(a.y+1);
  return cmnDiffDays(asOf,t);
}
// 철수 예정: S25 진행 행의 종료(예정)가 기준일+철수 알림 일수 이내. 종료가 월 단위만 알려진 경우 종료 월의 직전 월 1일부터.
function cmnExitDue(a,asOf,days){
  const full=cmnDate(a.end_ym);
  if(full){ const d=cmnDiffDays(asOf,a.end_ym); return d!==null&&d<=days?{due:true,end:a.end_ym,left:d}:{due:false}; }
  const ym=cmnYm(a.end_ym); if(ym===null) return {due:false};
  const startFrom=cmnYmStr(ym-1)+'-01';
  const after=cmnDiffDays(startFrom,asOf);
  return after!==null&&after>=0?{due:true,end:a.end_ym,left:null}:{due:false};
}

// 알림 계산(읽은 행 배열만 사용). data:{reqs,lines,cands,orders,assigns,contacts,persons(맵: id→S20 행)}
// presence: cmnContactPresence 의 map, 읽기 실패면 null(연락처 요청만 "확인 불가")
// settings: {exit_alert_days,reconfirm_days}
function cmnAlerts(data,asOf,settings,presence){
  const st={exit_alert_days:30,reconfirm_days:90,...(settings||{})};
  const persons=data.persons||{}; const okP=pid=>cmnPersonActive(persons,pid);
  const reqById=new Map((data.reqs||[]).map(r=>[r.request_id,r]));
  const nameOf=pid=>(persons[pid]&&persons[pid].name)||'';
  const out={};
  // 회신 지연
  out.replyDelay=[];
  (data.orders||[]).forEach(o=>{ const d=cmnReplyDelay(o,reqById.get(o.request_id),asOf); if(d.delayed) out.replyDelay.push({request_id:o.request_id,order_id:o.order_id,party_id:o.party_id,reply_due:o.reply_due,days:d.days}); });
  // 연락처 요청
  const cc=cmnContactCandidates(data).filter(c=>okP(c.person_id));
  if(presence===null||presence===undefined){ out.contactRequest={status:'unavailable',count:null,list:[]}; }
  else {
    const list=[]; cc.forEach(c=>{ const p=presence[c.person_id]; if(p&&!p.has&&p.requested_at){ list.push({cand_id:c.cand_id,person_id:c.person_id,request_id:c.request_id,requested_at:p.requested_at,days:cmnDiffDays(p.requested_at,asOf)}); } });
    out.contactRequest={status:'ok',count:list.length,list};
  }
  // 인터뷰 대기 — 단계=인터뷰 이고 인터뷰 일시가 기준일 이전(결과 미입력)
  const openReq=new Set((data.reqs||[]).filter(r=>!cmnIsClosed(r)).map(r=>r.request_id));
  const lineReq=new Map((data.lines||[]).filter(l=>!cmnYes(l.is_cancelled)).map(l=>[l.line_id,l.request_id]));
  out.interviewWait=[];
  (data.cands||[]).forEach(c=>{
    if(c.stage!=='인터뷰'||!okP(c.person_id)) return; const rid=lineReq.get(c.line_id); if(!rid||!openReq.has(rid)) return;
    const d=cmnDiffDays(c.interview_at,asOf); if(d!==null&&d>0) out.interviewWait.push({cand_id:c.cand_id,person_id:c.person_id,request_id:rid,interview_at:c.interview_at,days:d});
  });
  // 철수 예정
  out.exitSoon=[];
  (data.assigns||[]).forEach(a=>{
    if(String(a.status??'').trim()!=='진행'||!okP(a.person_id)) return;
    const r=cmnExitDue(a,asOf,st.exit_alert_days); if(r.due) out.exitSoon.push({assign_id:a.assign_id,person_id:a.person_id,client_name:a.client_name,end:r.end,left:r.left,confidence:a.confidence});
  });
  // 재확인 필요
  out.reconfirm=[];
  const byPerson={}; (data.contacts||[]).forEach(c=>{ (byPerson[c.person_id]=byPerson[c.person_id]||[]).push(c); });
  Object.keys(byPerson).forEach(pid=>{ if(!okP(pid)) return; const r=cmnReconfirm(byPerson[pid],asOf,st.reconfirm_days); if(r&&r.needed) out.reconfirm.push({person_id:pid,last:r.last,elapsed:r.elapsed}); });
  // 생일 — 생년월일을 아는 후보만(연도만 아는 후보는 제외)
  out.birthday=[];
  Object.keys(persons).forEach(pid=>{
    const p=persons[pid]; if(!okP(pid)) return;
    if(String(p.birth_precision??'').trim()==='연도추정'||String(p.birth_precision??'').trim()==='미상') return;
    const left=cmnDaysToBirthday(p.birth_date,asOf); if(left!==null&&left<=CMN_BIRTHDAY_WINDOW) out.birthday.push({person_id:pid,name:nameOf(pid),birth_date:p.birth_date,left});
  });
  out.counts={replyDelay:out.replyDelay.length,contactRequest:out.contactRequest.count,interviewWait:out.interviewWait.length,exitSoon:out.exitSoon.length,reconfirm:out.reconfirm.length,birthday:out.birthday.length};
  out.empty=['replyDelay','interviewWait','exitSoon','reconfirm','birthday'].every(k=>out[k].length===0)&&(out.contactRequest.status!=='ok'||out.contactRequest.count===0);
  return out;
}
// 화면용 한 번에: 연락처 유무가 필요한 후보가 있을 때만 S39를 읽는다(없으면 S39를 건드리지 않음).
async function cmnAlertSummary(data,asOf,settings){
  const cc=cmnContactCandidates(data).filter(c=>cmnPersonActive(data.persons||{},c.person_id));
  let presence={};
  if(cc.length){ const r=await cmnContactPresence(cc.map(c=>c.person_id)); presence=r.ok?r.map:null; }
  return cmnAlerts(data,asOf,settings,presence);
}
