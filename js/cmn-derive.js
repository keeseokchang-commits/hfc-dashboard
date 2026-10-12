// HFC cmn-derive.js v2.9.76 — STF-CMN-04 파생값 계산 (읽기 전용 · 시트에 쓰지 않음)
// 근거: 프로그램 설계서 §21(CMN-04), 통합 설계서 v0.9 §3.1(의뢰 상태)·§3.4(소요 개월수)·"파생값 표"
// 원칙: 화면이 이미 읽은 행 배열과 기준일만 받는다(시트를 직접 읽지 않음) / 입력이 부족하면 "미상"을 돌려주고 추측하지 않는다.
// 모든 화면이 이 함수들만 쓴다 — 화면마다 따로 계산하면 값이 어긋난다.
// 의존: 없음(순수 계산). 기준일은 'YYYY-MM-DD' 문자열.

// 진행 순서 — 탈락·철회는 순서 밖(앞선 단계를 따질 때 제외)
const CMN_STAGE_ORDER=['추천수령','회신','서류통과','인터뷰','선정','계약'];
// 충원으로 치는 단계 — 선정 이상 (프로그램 설계서 §4.8 R2 확정)
const CMN_FILLED_STAGES=['선정','계약'];
const CMN_MS_DAY=86400000;

// 'YYYY-MM-DD' → {y,m,d} (달력에 없는 날짜는 null)
function cmnDate(s){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s??'').trim()); if(!m) return null;
  const y=+m[1], mo=+m[2], d=+m[3]; const t=new Date(Date.UTC(y,mo-1,d));
  if(t.getUTCFullYear()!==y||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d) return null;
  return {y,m:mo,d};
}
const cmnDayNo=o=>Date.UTC(o.y,o.m-1,o.d)/CMN_MS_DAY;
// b − a (일). 날짜가 아니면 null
function cmnDiffDays(a,b){ const x=cmnDate(a), y=cmnDate(b); return (x&&y)?Math.round(cmnDayNo(y)-cmnDayNo(x)):null; }
function cmnAddDays(s,n){ const x=cmnDate(s); if(!x) return null; return new Date((cmnDayNo(x)+n)*CMN_MS_DAY).toISOString().slice(0,10); }
// 'YYYY-MM' → 달 번호(연*12+월-1). 아니면 null
function cmnYm(s){ const m=/^(\d{4})-(\d{2})$/.exec(String(s??'').trim()); if(!m||+m[2]<1||+m[2]>12) return null; return +m[1]*12+(+m[2]-1); }
const cmnYmStr=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
const cmnYes=v=>String(v??'').trim().toUpperCase()==='Y';
const cmnBlank=v=>String(v??'').trim()==='';

// ── 의뢰 상태 ───────────────────────────────────────────────────────────────
// 실패·취소는 저장된 값. 그 외에는 (취소 라인을 뺀) 라인의 후보 중 가장 앞선 단계,
// 후보가 없으면 발송 기록 있음=탐색 / 없음=접수. 탈락·철회 후보만 있는 경우는 후보가 없는 것으로 본다.
function cmnRequestStatus(req,lines,cands,orders){
  const cs=String(req.closed_state??'').trim();
  if(cs==='실패'||cs==='취소') return cs;
  const liveLines=new Set(lines.filter(l=>l.request_id===req.request_id&&!cmnYes(l.is_cancelled)).map(l=>l.line_id));
  let best=-1;
  cands.forEach(c=>{ if(!liveLines.has(c.line_id)) return; const i=CMN_STAGE_ORDER.indexOf(c.stage); if(i>best) best=i; });
  if(best>=0) return CMN_STAGE_ORDER[best];
  return orders.some(o=>o.request_id===req.request_id)?'탐색':'접수';
}
// 의뢰가 닫혔는가 (실패·취소) — 회신 지연·진행 중 판단에 쓴다
const cmnIsClosed=req=>{ const cs=String(req.closed_state??'').trim(); return cs==='실패'||cs==='취소'; };

// ── 충원 ────────────────────────────────────────────────────────────────────
// 라인별: 선정·계약 단계 후보 수 / 필요 인원. 취소 라인은 제외.
// 의뢰 합계: 필요 = 라인 필요 인원 합, 충원 = 라인별 min(충원, 필요)의 합 — 한 라인이 초과 충원돼도 다른 라인의 부족을 가리지 않게 한다.
// (라인별 표시는 초과도 그대로 보여 준다: filled 는 실제 수, counted 는 합계에 넣은 수)
function cmnFill(requestId,lines,cands){
  const per=[]; let need=0, filled=0;
  lines.filter(l=>l.request_id===requestId&&!cmnYes(l.is_cancelled)).forEach(l=>{
    const n=parseInt(String(l.headcount??'').replace(/,/g,''),10)||0;
    const f=cands.filter(c=>c.line_id===l.line_id&&CMN_FILLED_STAGES.includes(c.stage)).length;
    const counted=Math.min(f,n);
    per.push({line_id:l.line_id,need:n,filled:f,counted});
    need+=n; filled+=counted;
  });
  return {need,filled,short:need>filled,lines:per};
}

// ── 회신 지연 ───────────────────────────────────────────────────────────────
// 회신 기한 < 기준일 이고 회신 상태=대기. 의뢰가 닫히면 지연이 아니라 종결 취급.
function cmnReplyDelay(order,req,asOf){
  if(req&&cmnIsClosed(req)) return {delayed:false,days:0};
  if(String(order.reply_state??'').trim()!=='대기') return {delayed:false,days:0};
  const d=cmnDiffDays(order.reply_due,asOf);
  if(d===null||d<=0) return {delayed:false,days:0};
  return {delayed:true,days:d};
}

// ── 만 나이 ─────────────────────────────────────────────────────────────────
// 생년월일이 있으면 만 나이, 연도만 있으면 "연도 추정" 범위(예: 만 46~47세), 모두 없으면 미상.
// 반환 {kind:'exact',age,label} | {kind:'range',min,max,label} | {kind:'unknown',label:'미상'}
function cmnAge(person,asOf){
  const b=cmnDate(person&&person.birth_date), a=cmnDate(asOf);
  if(a&&b){
    let age=a.y-b.y; if(a.m<b.m||(a.m===b.m&&a.d<b.d)) age--;
    if(age>=0) return {kind:'exact',age,label:`만 ${age}세`};
  }
  const y=parseInt(String(person&&person.birth_year||'').trim(),10);
  if(a&&y>1900&&y<=a.y){ const hi=a.y-y, lo=hi-1; return {kind:'range',min:Math.max(lo,0),max:hi,label:`연도 추정 만 ${Math.max(lo,0)}~${hi}세`}; }
  return {kind:'unknown',label:'미상'};
}

// ── 경력 연차 ───────────────────────────────────────────────────────────────
// 이력 한 줄의 [시작월, 끝월] 달 번호. 진행 중(is_current)은 끝을 기준일의 달로 본다.
// 반환 {ok:true,s,e} | {ok:false,why:'unknown'|'order'}  (order = 시작 > 종료 → 날짜 확인 필요)
function cmnCareerSpan(c,asOf){
  const s=cmnYm(c.start_ym); const a=cmnDate(asOf);
  const e=cmnYes(c.is_current)?(a?a.y*12+a.m-1:null):cmnYm(c.end_ym);
  if(s===null||e===null) return {ok:false,why:'unknown'};
  if(s>e) return {ok:false,why:'order'};
  return {ok:true,s,e};
}
// 겹치는 구간을 합쳐 달 수를 센다(시작·종료 월 모두 포함, D13)
function cmnUnionMonths(spans){
  const v=spans.slice().sort((x,y)=>x.s-y.s); let total=0, cs=null, ce=null;
  v.forEach(x=>{ if(cs===null){ cs=x.s; ce=x.e; } else if(x.s<=ce+1){ ce=Math.max(ce,x.e); } else { total+=ce-cs+1; cs=x.s; ce=x.e; } });
  if(cs!==null) total+=ce-cs+1;
  return total;
}
// 총 경력 = 회사재직 ∪ 프로젝트 합집합(겹친 달은 한 번만) — 통합 설계서 v0.9 §3.4(사용자 결정 2026-10-09)
// 직접 입력한 연차(S20.career_years_manual)가 있으면 그 값을 적용하고 자동 계산값도 함께 돌려준다(CMN-04 R1).
function cmnCareerYears(careers,person,asOf){
  const spans=[], byKind={회사재직:[],프로젝트:[]}, invalid=[], unknown=[];
  (careers||[]).forEach(c=>{
    const r=cmnCareerSpan(c,asOf);
    if(r.ok){ spans.push(r); if(byKind[c.kind]) byKind[c.kind].push(r); }
    else if(r.why==='order') invalid.push(c.career_id);
    else unknown.push(c.career_id);
  });
  const months=cmnUnionMonths(spans);
  const autoYears=Math.round(months/12*10)/10;
  const manualRaw=person&&person.career_years_manual;
  const hasManual=!cmnBlank(manualRaw)&&!isNaN(parseFloat(manualRaw));
  const manual=hasManual?parseFloat(manualRaw):null;
  return {months,company_months:cmnUnionMonths(byKind.회사재직),project_months:cmnUnionMonths(byKind.프로젝트),
    auto_years:autoYears,manual_years:manual,
    applied:hasManual?{years:manual,basis:'manual'}:{years:autoYears,basis:'auto'},
    invalid,unknown,hasDateIssue:invalid.length>0};
}

// ── 단기 이력 ───────────────────────────────────────────────────────────────
// 소요 개월 ≤ 기준(short_tenure_months) 이고 종료 사유가 "정상종료"가 아닌 줄(통합 설계서 v0.9 D14: 3개월 "이하"가 단기).
// 사유가 비어 있으면 사유불명으로 본다. includeNormal=true 면 정상종료도 센다(설정으로 선택 가능).
// 시작·종료 월을 모르는 줄은 판정에서 제외하고 "미상"으로 센다(추정하지 않음).
function cmnTenureMonths(c,asOf){
  const r=cmnCareerSpan(c,asOf);
  if(r.ok) return r.e-r.s+1;
  if(r.why==='order') return null;
  const dm=parseInt(String(c.duration_months??'').replace(/,/g,''),10);
  return dm>0?dm:null;   // 기간만 적힌 이력(예: "3년 2개월"=38)은 저장된 개월 수를 쓴다
}
function cmnShortTenure(careers,asOf,thresholdMonths,opts={}){
  const th=parseInt(thresholdMonths,10); const limit=isNaN(th)?3:th;
  const items=[]; let unknown=0, known=0;
  (careers||[]).forEach(c=>{
    const m=cmnTenureMonths(c,asOf);
    if(m===null){ unknown++; return; }
    known++;
    const normal=String(c.exit_reason??'').trim()==='정상종료';
    if(m<=limit&&(!normal||opts.includeNormal)) items.push({career_id:c.career_id,months:m});
  });
  const avg=items.length?Math.round(items.reduce((s,x)=>s+x.months,0)/items.length*10)/10:0;
  return {count:items.length,known,unknown,ratio:known?items.length/known:0,avg_months:avg,items};
}

// ── 재확인 필요 ─────────────────────────────────────────────────────────────
// 현행 프로젝트 정보를 입력한 마지막 접촉일(S26 중 assign_id가 있는 최신 접촉)로부터 설정 일수(reconfirm_days)가 "지났으면" 필요.
// 접촉 기록이 없으면 대상이 아님(null).  contacts 는 한 후보의 S26 행들.
function cmnReconfirm(contacts,asOf,days){
  const dated=(contacts||[]).filter(c=>!cmnBlank(c.assign_id)&&cmnDate(c.contact_date)).map(c=>c.contact_date).sort();
  if(!dated.length) return null;
  const last=dated[dated.length-1]; const el=cmnDiffDays(last,asOf);
  const d=parseInt(days,10); const lim=isNaN(d)?90:d;
  return {last,elapsed:el,needed:el!==null&&el>lim};
}

// ── 한 번에: 의뢰 목록용 파생값 묶음 ─────────────────────────────────────────
// 입력: {reqs,lines,cands,orders}(읽은 행 배열), asOf. 반환: {의뢰번호:{status,closed,need,filled,short,lines,orderCount,delayed:[…],partyIds:[…]}}
function cmnDeriveRequests(data,asOf){
  const out={};
  data.reqs.forEach(r=>{
    const ords=data.orders.filter(o=>o.request_id===r.request_id);
    const fill=cmnFill(r.request_id,data.lines,data.cands);
    const delayed=[];
    ords.forEach(o=>{ const d=cmnReplyDelay(o,r,asOf); if(d.delayed) delayed.push({order_id:o.order_id,party_id:o.party_id,reply_due:o.reply_due,days:d.days}); });
    out[r.request_id]={status:cmnRequestStatus(r,data.lines,data.cands,data.orders),closed:cmnIsClosed(r),
      need:fill.need,filled:fill.filled,short:fill.short,lines:fill.lines,orderCount:ords.length,delayed,
      partyIds:[...new Set(ords.map(o=>o.party_id).filter(Boolean))]};
  });
  return out;
}
