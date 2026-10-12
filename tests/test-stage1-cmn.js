// 단계 ① 공통 기능 시험: STF-CMN-04 / CMN-05 / CMN-06 / CMN-07 (프로그램 설계서 §21.7, §22.7, §23.7, §24 의 시험 케이스)
const {makeEnv,runTests,eq,ok}=require('./harness.js');
const FILES=['schema.js','common.js','cmn-sheet.js','cmn-derive.js','cmn-stage.js','cmn-alert.js','cmn-msg.js'];
const mk=()=>makeEnv(FILES);
function seed(env,k,objs=[]){
  const T=env.run('HR_TABS')[k], H=env.run('HEADERS')[k];
  env.mock.addTab(T.tab,H,objs.map(o=>H.map(h=>o[h]??'')),{rowCount:T.rows,colCount:H.length,frozen:1});
}
const call=(env,code,vars={})=>{ Object.entries(vars).forEach(([k,v])=>{ env.ctx['__'+k]=JSON.parse(JSON.stringify(v)); }); return env.run(code); };
const J=x=>JSON.parse(JSON.stringify(x));
const tests=[]; const T=(id,desc,fn)=>tests.push([id,desc,fn]);
const R=(id,extra={})=>({request_id:id,alias:'A',requester_party_id:'PTY-003',closed_state:'진행',received_at:'2026-10-01',...extra});
const L=(id,req,extra={})=>({line_id:id,request_id:req,headcount:'2',is_cancelled:'N',...extra});
const C=(id,line,stage,extra={})=>({cand_id:id,line_id:line,person_id:'PSN-'+id.slice(-4),stage,...extra});
const O=(id,req,extra={})=>({order_id:id,request_id:req,party_id:'PTY-004',reply_state:'대기',reply_due:'2026-10-17',...extra});

// ───────── CMN-04 파생값 ─────────
T('TC-CMN04-01','의뢰 상태 — 후보 2명(회신, 인터뷰) → 인터뷰',()=>{
  const env=mk(); eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{r:[R('REQ-2026-001')],l:[L('LN-0001','REQ-2026-001')],c:[C('CND-00001','LN-0001','회신'),C('CND-00002','LN-0001','인터뷰')],o:[]}),'인터뷰');
});
T('TC-CMN04-02','후보 없는 의뢰 — 발송만 있으면 탐색, 없으면 접수',()=>{
  const env=mk(); const base={r:[R('REQ-2026-001')],l:[L('LN-0001','REQ-2026-001')],c:[]};
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{...base,o:[O('ORD-00001','REQ-2026-001')]}),'탐색');
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{...base,o:[]}),'접수');
});
T('TC-CMN04-03','실패·취소로 닫은 의뢰는 저장된 값',()=>{
  const env=mk(); const d={l:[L('LN-0001','REQ-2026-001')],c:[C('CND-00001','LN-0001','계약')],o:[]};
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{...d,r:[R('REQ-2026-001',{closed_state:'실패'})]}),'실패');
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{...d,r:[R('REQ-2026-001',{closed_state:'취소'})]}),'취소');
});
T('CMN04-03b','탈락·철회 후보만 있으면 후보 없음으로 본다 / 취소 라인의 후보는 상태에 반영하지 않는다',()=>{
  const env=mk();
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{r:[R('REQ-2026-001')],l:[L('LN-0001','REQ-2026-001')],c:[C('CND-00001','LN-0001','탈락'),C('CND-00002','LN-0001','철회')],o:[O('ORD-00001','REQ-2026-001')]}),'탐색');
  eq(call(env,"cmnRequestStatus(__r[0],__l,__c,__o)",{r:[R('REQ-2026-001')],l:[L('LN-0001','REQ-2026-001',{is_cancelled:'Y'}),L('LN-0002','REQ-2026-001')],c:[C('CND-00001','LN-0001','계약'),C('CND-00002','LN-0002','회신')],o:[]}),'회신');
});
T('TC-CMN04-04','충원 — 라인 인원 2명, 선정 1 계약 1 → 2/2',()=>{
  const env=mk(); const f=call(env,"cmnFill('REQ-2026-001',__l,__c)",{l:[L('LN-0001','REQ-2026-001')],c:[C('CND-00001','LN-0001','선정'),C('CND-00002','LN-0001','계약'),C('CND-00003','LN-0001','인터뷰')]});
  eq([f.need,f.filled,f.short],[2,2,false]);
});
T('TC-CMN04-05','취소 라인은 충원 집계에서 제외',()=>{
  const env=mk(); const f=call(env,"cmnFill('REQ-2026-001',__l,__c)",{l:[L('LN-0001','REQ-2026-001'),L('LN-0002','REQ-2026-001',{is_cancelled:'Y',headcount:'5'})],c:[C('CND-00001','LN-0001','선정')]});
  eq([f.need,f.filled,f.short],[2,1,true]);
});
T('CMN04-05b','한 라인이 초과 충원돼도 다른 라인의 부족을 가리지 않는다 / 선정 이상만 충원(R2)',()=>{
  const env=mk(); const f=call(env,"cmnFill('REQ-2026-001',__l,__c)",{l:[L('LN-0001','REQ-2026-001',{headcount:'1'}),L('LN-0002','REQ-2026-001',{headcount:'1'})],c:[C('CND-00001','LN-0001','선정'),C('CND-00002','LN-0001','계약'),C('CND-00003','LN-0002','인터뷰')]});
  eq([f.need,f.filled,f.short],[2,1,true]); eq([f.lines[0].filled,f.lines[0].counted],[2,1],'라인별 표시는 초과도 그대로');
});
T('TC-CMN04-06','회신 지연 — 기한 어제·대기 → 지연, 의뢰를 닫으면 지연 아님',()=>{
  const env=mk(); const d={o:O('ORD-00001','REQ-2026-001',{reply_due:'2026-10-09'}),r:R('REQ-2026-001')};
  eq(J(call(env,"cmnReplyDelay(__o,__r,'2026-10-10')",d)),{delayed:true,days:1});
  eq(call(env,"cmnReplyDelay(__o,__r,'2026-10-10')",{...d,r:R('REQ-2026-001',{closed_state:'취소'})}).delayed,false);
  eq(call(env,"cmnReplyDelay(__o,__r,'2026-10-09')",d).delayed,false,'기한 당일은 지연 아님');
  eq(call(env,"cmnReplyDelay(__o,__r,'2026-10-10')",{...d,o:O('ORD-00001','REQ-2026-001',{reply_due:'2026-10-09',reply_state:'후보 추천'})}).delayed,false,'대기가 아니면 지연 아님');
  eq(call(env,"cmnReplyDelay(__o,__r,'2026-10-10')",{...d,o:O('ORD-00001','REQ-2026-001',{reply_due:''})}).delayed,false,'기한 없음');
});
T('TC-CMN04-07','만 나이 — 생일 전·후 기준일',()=>{
  const env=mk(); const p={birth_date:'1979-10-12'};
  eq(call(env,"cmnAge(__p,'2026-10-10')",{p}).label,'만 46세'); eq(call(env,"cmnAge(__p,'2026-10-13')",{p}).label,'만 47세');
  eq(call(env,"cmnAge(__p,'2026-10-12')",{p}).age,47,'생일 당일은 만 나이가 오른다');
});
T('TC-CMN04-08','연도 추정 — 연도만 있으면 범위, 아무것도 없으면 미상',()=>{
  const env=mk(); eq(J(call(env,"cmnAge(__p,'2026-10-10')",{p:{birth_year:'1979',birth_precision:'연도추정'}})),{kind:'range',min:46,max:47,label:'연도 추정 만 46~47세'});
  eq(call(env,"cmnAge(__p,'2026-10-10')",{p:{}}).kind,'unknown');
});
T('TC-CMN04-09','경력 연차 — 겹치는 프로젝트 두 건은 겹침을 한 번만 센다(18개월)',()=>{
  const env=mk(); const careers=[{career_id:'CAR-000001',kind:'프로젝트',start_ym:'2024-01',end_ym:'2024-12'},{career_id:'CAR-000002',kind:'프로젝트',start_ym:'2024-07',end_ym:'2025-06'}];
  const r=call(env,"cmnCareerYears(__c,__p,'2026-10-10')",{c:careers,p:{}}); eq([r.months,r.auto_years,r.applied.basis],[18,1.5,'auto']);
});
T('CMN04-09b','총 경력 = 회사재직 ∪ 프로젝트 합집합(통합 설계서 v0.9) · 직접 입력 연차 우선 + 자동값 병기(R1) · 시작>종료는 제외하고 표시 · 진행 중은 기준 월까지',()=>{
  const env=mk();
  const careers=[{career_id:'CAR-000001',kind:'회사재직',start_ym:'2020-01',end_ym:'2022-12'},{career_id:'CAR-000002',kind:'프로젝트',start_ym:'2022-06',end_ym:'2023-05'},
    {career_id:'CAR-000003',kind:'프로젝트',start_ym:'2025-05',end_ym:'2025-01'},{career_id:'CAR-000004',kind:'프로젝트',start_ym:'2026-08',is_current:'Y'},{career_id:'CAR-000005',kind:'프로젝트',start_ym:'2019'}];
  const r=call(env,"cmnCareerYears(__c,__p,'2026-10-10')",{c:careers,p:{career_years_manual:'12.5'}});
  eq(r.months,36+5+3,'2020-01~2023-05=41 + 2026-08~2026-10=3'); eq([r.company_months,r.project_months],[36,12+3]);
  eq(J(r.applied),{years:12.5,basis:'manual'}); eq(r.auto_years,Math.round(44/12*10)/10); eq([r.invalid.length,r.hasDateIssue,r.unknown.length],[1,true,1]);
});
T('TC-CMN04-10','단기 이력 — 기준 3개월: 2개월·5개월·종료 모름 → 단기 1건, 종료 모름은 미상으로 제외',()=>{
  const env=mk(); const c=[{career_id:'CAR-000001',kind:'회사재직',start_ym:'2025-01',end_ym:'2025-02'},{career_id:'CAR-000002',kind:'회사재직',start_ym:'2025-03',end_ym:'2025-07'},{career_id:'CAR-000003',kind:'회사재직',start_ym:'2025-09'}];
  const r=call(env,"cmnShortTenure(__c,'2026-10-10',3)",{c}); eq([r.count,r.unknown,r.known],[1,1,2]); eq(r.avg_months,2); eq(Math.round(r.ratio*100),50);
});
T('CMN04-10b','단기 이력 경계 — 3개월은 단기(D14 이하), 정상종료는 기본 제외·옵션으로 포함, 기간만 적힌 이력은 저장된 개월 수 사용',()=>{
  const env=mk(); const c=[{career_id:'CAR-000001',kind:'회사재직',start_ym:'2025-01',end_ym:'2025-03'},{career_id:'CAR-000002',kind:'프로젝트',start_ym:'2025-04',end_ym:'2025-05',exit_reason:'정상종료'},{career_id:'CAR-000003',kind:'회사재직',duration_months:'2'}];
  eq(call(env,"cmnShortTenure(__c,'2026-10-10',3).count",{c}),2); eq(call(env,"cmnShortTenure(__c,'2026-10-10',3,{includeNormal:true}).count",{c}),3);
});
T('TC-CMN04-11','재확인 필요 — 현행 정보 입력 후 91일(기준 90일) → 필요 / 90일은 아직',()=>{
  const env=mk(); const cs=[{assign_id:'ASG-00001',contact_date:'2026-07-11'},{assign_id:'',contact_date:'2026-10-01'}];
  eq(J(call(env,"cmnReconfirm(__c,'2026-10-10',90)",{c:cs})),{last:'2026-07-11',elapsed:91,needed:true});
  eq(call(env,"cmnReconfirm(__c,'2026-10-09',90)",{c:cs}).needed,false);
  eq(call(env,"cmnReconfirm(__c,'2026-10-10',90)",{c:[{assign_id:'',contact_date:'2026-01-01'}]}),null,'현행 정보를 입력한 접촉이 없으면 대상 아님');
});
T('CMN04-12','의뢰 묶음 계산 — 상태·충원·지연이 한 번에',()=>{
  const env=mk(); const d={reqs:[R('REQ-2026-001'),R('REQ-2026-002',{closed_state:'실패'})],lines:[L('LN-0001','REQ-2026-001'),L('LN-0002','REQ-2026-002')],cands:[C('CND-00001','LN-0001','선정')],
    orders:[O('ORD-00001','REQ-2026-001',{reply_due:'2026-10-01'}),O('ORD-00002','REQ-2026-002',{reply_due:'2026-10-01'})]};
  const r=call(env,"cmnDeriveRequests(__d,'2026-10-10')",{d});
  eq([r['REQ-2026-001'].status,r['REQ-2026-001'].filled,r['REQ-2026-001'].need,r['REQ-2026-001'].delayed.length,r['REQ-2026-001'].delayed[0].days],['선정',1,2,1,9]);
  eq([r['REQ-2026-002'].status,r['REQ-2026-002'].closed,r['REQ-2026-002'].delayed.length],['실패',true,0]);
});

// ───────── CMN-05 후보 단계 변경 ─────────
const S31row=(extra={})=>({cand_id:'CND-00001',line_id:'LN-0001',person_id:'PSN-0001',via_party_id:'PTY-001',stage:'회신',created_at:'2026-10-01',updated_at:'2026-10-01 09:00:00',...extra});
const stg=(n,cand,stage,date)=>({log_id:'STG-'+String(n).padStart(6,'0'),cand_id:cand,stage,stage_date:date,memo:'',created_at:date});
function stageEnv(cands=[S31row()],logs=[stg(1,'CND-00001','추천수령','2026-10-01'),stg(2,'CND-00001','회신','2026-10-03')]){
  const env=mk(); env.login(); seed(env,'S31',cands); seed(env,'S38',logs); return env;
}
const s31=(env,row,name)=>{ const s=env.mock.tab('S31_CANDIDACY'); return s.cells[row-1][s.cells[0].indexOf(name)]; };
const s38rows=env=>env.mock.tab('S38_CAND_STAGE_LOG').cells.slice(1).filter(r=>r[0]);
T('TC-CMN05-01','정상 변경 — 회신→서류통과: S38 1줄 추가, S31.stage 갱신',async()=>{
  const env=stageEnv(); const r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과',stage_date:'2026-10-10',memo:'서류 확인'})");
  ok(r.ok,r.message); eq(r.canPromote,false); eq(s38rows(env).length,3); const last=s38rows(env)[2]; eq([last[1],last[2],last[3],last[4]],['CND-00001','서류통과','2026-10-10','서류 확인']);
  eq(s31(env,2,'stage'),'서류통과'); ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s31(env,2,'updated_at'))&&s31(env,2,'updated_at')!=='2026-10-01 09:00:00','수정일시 갱신');
});
T('TC-CMN05-02','탈락 사유 필수 — 사유 없이 저장하면 아무것도 쓰지 않는다',async()=>{
  const env=stageEnv(); const before=env.mock.log.length; const r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'탈락'})");
  ok(!r.ok&&r.message==='탈락 사유를 선택해 주세요.',r.message); eq(env.mock.log.length,before,'호출 자체가 없음'); eq(s38rows(env).length,2);
});
T('TC-CMN05-03','탈락 저장 — 사유 함께 갱신, 다시 다른 단계로 돌리면 사유를 비운다',async()=>{
  const env=stageEnv(); let r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'탈락',fail_reason_code:'단가 불일치'})"); ok(r.ok,r.message);
  eq([s31(env,2,'stage'),s31(env,2,'fail_reason_code')],['탈락','단가 불일치']);
  r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'회신'})"); ok(r.ok,r.message); eq([s31(env,2,'stage'),s31(env,2,'fail_reason_code')],['회신','']);
});
T('TC-CMN05-04','인터뷰 진입 — 유형·일시 저장, 승격 가능 신호',async()=>{
  const env=stageEnv(); const r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'인터뷰',interview_type:'대면',interview_at:'2026-10-20'})");
  ok(r.ok,r.message); eq(r.canPromote,true); eq([s31(env,2,'interview_type'),s31(env,2,'interview_at')],['대면','2026-10-20']);
});
T('TC-CMN05-05','같은 단계 — 안내하고 기록을 만들지 않는다',async()=>{
  const env=stageEnv(); const r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'회신'})");
  ok(!r.ok&&r.message==='이미 같은 단계입니다.'); eq(s38rows(env).length,2);
});
T('TC-CMN05-06','정정 행 — 잘못 올린 단계를 올바른 단계로 다시 저장: 기존 행 유지, 정정 행 추가, 현재 단계=마지막 행 / 앞 단계로 되돌림도 허용(R1)',async()=>{
  const env=stageEnv(); await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'인터뷰'})");
  const r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과',memo:'정정'})"); ok(r.ok,r.message);
  eq(s38rows(env).map(x=>x[2]),['추천수령','회신','인터뷰','서류통과']); eq(s31(env,2,'stage'),'서류통과');
});
T('TC-CMN05-07','S31 쓰기 실패 — 안내하고, 다시 저장하면 S38에 중복 행 없이 S31만 맞춘다',async()=>{
  const env=stageEnv(); env.mock.failNext(/POST .*values:batchUpdate/,500,2);   // 재시도까지 실패
  let r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과'})");
  ok(!r.ok&&r.partial&&r.message==='단계 기록과 현재 단계가 달라졌습니다. 다시 저장해 주세요.',r.message); eq(s38rows(env).length,3,'이력은 남음'); eq(s31(env,2,'stage'),'회신','현재 단계는 이전 값');
  r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과'})"); ok(r.ok,r.message); eq(r.repaired,true); eq(s38rows(env).length,3,'이력 중복 없음'); eq(s31(env,2,'stage'),'서류통과');
});
T('CMN05-07b','읽기 실패 — 아무것도 쓰지 않는다 / 후보를 못 찾으면 중단 / 화면이 읽은 뒤 다른 곳에서 바뀌었으면 충돌',async()=>{
  let env=stageEnv(); env.mock.failNext(/GET .*S38_CAND_STAGE_LOG/,500,4);
  let r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과'})"); ok(!r.ok&&r.code==='READ_FAIL'); eq(s38rows(env).length,2); eq(s31(env,2,'stage'),'회신');
  env=stageEnv(); r=await call(env,"cmnChangeStage({cand_id:'CND-09999',stage:'서류통과'})"); ok(!r.ok&&r.code==='NOT_FOUND'); eq(s38rows(env).length,2);
  env=stageEnv(); r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과',readUpdatedAt:'2026-09-30 00:00:00'})"); ok(!r.ok&&r.code==='CONFLICT'); eq(s38rows(env).length,2,'충돌이면 이력도 쓰지 않음');
});
T('CMN05-07c','잘못된 단계 값·날짜는 쓰기 전에 거절',async()=>{
  const env=stageEnv(); let r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'없는단계'})"); ok(!r.ok&&r.code==='NO_STAGE');
  r=await call(env,"cmnChangeStage({cand_id:'CND-00001',stage:'서류통과',stage_date:'2026-02-30'})"); ok(!r.ok&&r.code==='NO_DATE'); eq(s38rows(env).length,2);
});

// ───────── CMN-06 알림 ─────────
const SET={exit_alert_days:30,reconfirm_days:90};
const alerts=(env,data,asOf,presence)=>call(env,"cmnAlerts(__d,'"+asOf+"',__s,__p)",{d:data,s:SET,p:presence===undefined?{}:presence});
T('TC-CMN06-01','회신 지연 — 기한 10/8, 기준 10/10 → 2일',()=>{
  const env=mk(); const a=alerts(env,{reqs:[R('REQ-2026-001')],lines:[],cands:[],orders:[O('ORD-00001','REQ-2026-001',{reply_due:'2026-10-08'})]},'2026-10-10');
  eq([a.replyDelay.length,a.replyDelay[0].days],[1,2]);
});
const cdata=(stage,extra={})=>({reqs:[R('REQ-2026-001')],lines:[L('LN-0001','REQ-2026-001')],cands:[C('CND-00001','LN-0001',stage,extra)],orders:[]});
T('TC-CMN06-02','연락처 요청 — 선정 후보, 연락처 없음, 요청일 있음 → 알림 포함',()=>{
  const env=mk(); const a=alerts(env,cdata('선정'),'2026-10-10',{'PSN-0001':{has:false,requested_at:'2026-10-05'}});
  eq([a.contactRequest.status,a.contactRequest.count,a.contactRequest.list[0].days],['ok',1,5]);
});
T('TC-CMN06-03','연락처 확보 — 알림에서 제외 / 요청일을 입력하지 않았으면 올리지 않음(R1) / 선정 전 단계는 제외',()=>{
  const env=mk();
  eq(alerts(env,cdata('선정'),'2026-10-10',{'PSN-0001':{has:true,requested_at:'2026-10-05'}}).contactRequest.count,0);
  eq(alerts(env,cdata('선정'),'2026-10-10',{'PSN-0001':{has:false,requested_at:''}}).contactRequest.count,0);
  eq(alerts(env,cdata('인터뷰'),'2026-10-10',{'PSN-0001':{has:false,requested_at:'2026-10-05'}}).contactRequest.count,0);
});
T('TC-CMN06-04','인터뷰 대기 — 인터뷰 일시가 지난 후보(결과 미입력)',()=>{
  const env=mk(); eq(alerts(env,cdata('인터뷰',{interview_at:'2026-10-08'}),'2026-10-10').interviewWait.length,1);
  eq(alerts(env,cdata('인터뷰',{interview_at:'2026-10-10'}),'2026-10-10').interviewWait.length,0,'당일은 아직 대기 아님');
  eq(alerts(env,cdata('선정',{interview_at:'2026-10-08'}),'2026-10-10').interviewWait.length,0);
});
const asg=(extra)=>({assign_id:'ASG-00001',person_id:'PSN-0001',status:'진행',client_name:'가나다',...extra});
T('TC-CMN06-05','철수 예정(일 단위) — 종료 2026-11-05, 기준 2026-10-10 → 포함 / 30일 이내만',()=>{
  const env=mk(); eq(alerts(env,{assigns:[asg({end_ym:'2026-11-05'})]},'2026-10-10').exitSoon.length,1);
  eq(alerts(env,{assigns:[asg({end_ym:'2026-11-09'})]},'2026-10-10').exitSoon.length,1,'정확히 30일 후는 포함');
  eq(alerts(env,{assigns:[asg({end_ym:'2026-11-10'})]},'2026-10-10').exitSoon.length,0,'31일 후는 제외');
  eq(alerts(env,{assigns:[asg({end_ym:'2026-11-05',status:'종료'})]},'2026-10-10').exitSoon.length,0,'진행이 아니면 제외');
});
T('TC-CMN06-06','철수 예정(월 단위) — 종료 2026-12 → 2026-11-01부터 포함',()=>{
  const env=mk(); eq(alerts(env,{assigns:[asg({end_ym:'2026-12'})]},'2026-10-31').exitSoon.length,0); eq(alerts(env,{assigns:[asg({end_ym:'2026-12'})]},'2026-11-01').exitSoon.length,1);
  eq(alerts(env,{assigns:[asg({end_ym:''})]},'2026-11-01').exitSoon.length,0,'종료를 모르면 제외');
});
T('TC-CMN06-07','재확인 — 현행 정보 입력 후 91일(기준 90일) → 포함',()=>{
  const env=mk(); const a=alerts(env,{contacts:[{contact_id:'CT-000001',person_id:'PSN-0001',assign_id:'ASG-00001',contact_date:'2026-07-11'}]},'2026-10-10'); eq([a.reconfirm.length,a.reconfirm[0].elapsed],[1,91]);
});
T('TC-CMN06-08','생일 — 14일 이내 후보만, 연도만 아는 후보는 제외 / 2월 29일생은 평년 2월 28일',()=>{
  const env=mk(); const persons={'PSN-0001':{name:'가',birth_date:'1980-10-20',birth_precision:'일'},'PSN-0002':{name:'나',birth_year:'1979',birth_precision:'연도추정'},'PSN-0003':{name:'다',birth_date:'1980-12-25',birth_precision:'일'},
    'PSN-0004':{name:'라',birth_date:'1990-10-10',birth_precision:'일'},'PSN-0005':{name:'마',birth_date:'1988-10-24',birth_precision:'일'}};
  const a=alerts(env,{persons},'2026-10-10'); eq(a.birthday.map(x=>[x.person_id,x.left]).sort(),[['PSN-0001',10],['PSN-0004',0],['PSN-0005',14]],'14일째까지 포함, 연도추정(PSN-0002)·12월(PSN-0003) 제외');
});
T('CMN06-08b','생일 창 경계 14일 포함·15일 제외 / 평년 2월 29일생',()=>{
  const env=mk(); eq(call(env,"cmnDaysToBirthday('1988-10-24','2026-10-10')"),14); eq(call(env,"cmnDaysToBirthday('1988-10-25','2026-10-10')"),15);
  eq(call(env,"cmnDaysToBirthday('1988-02-29','2027-02-20')"),8,'2027은 평년 → 2/28'); eq(call(env,"cmnDaysToBirthday('1988-02-29','2028-02-20')"),9,'2028은 윤년 → 2/29');
  eq(call(env,"cmnDaysToBirthday('1990-01-05','2026-12-30')"),6,'해를 넘기는 경우'); eq(call(env,"cmnDaysToBirthday('','2026-12-30')"),null);
});
T('TC-CMN06-09','값 미노출 — 연락처 유무 조회 결과에 휴대폰·이메일 값이 없다 / 다른 열은 읽지 않는다',async()=>{
  const env=mk(); seed(env,'S39',[{person_id:'PSN-0001',rid_head7:'8001011',mobile:'010-1234-5678',email:'a@b.com',contact_requested_at:'2026-10-05',updated_at:'2026-10-05 10:00:00'},{person_id:'PSN-0002',rid_head7:'9001012',contact_requested_at:'2026-10-06',updated_at:'2026-10-06 10:00:00'}]);
  const r=await call(env,"cmnContactPresence(['PSN-0001','PSN-0002','PSN-0003'])"); ok(r.ok);
  eq(J(r.map),{'PSN-0001':{has:true,requested_at:'2026-10-05'},'PSN-0002':{has:false,requested_at:'2026-10-06'},'PSN-0003':{has:false,requested_at:''}});
  const s=JSON.stringify(r); ok(!s.includes('010-1234')&&!s.includes('a@b.com')&&!s.includes('8001011'),'값이 반환에 없음');
  const ranges=env.mock.log.filter(x=>/batch/.test(x)); eq(ranges.length,1,'한 번에 읽음');
});
T('TC-CMN06-10','합침 후보 제외 — merged_into·비활성 후보는 모든 알림에서 제외',()=>{
  const env=mk(); const persons={'PSN-0001':{name:'가',merged_into:'PSN-0009',is_active:'N',birth_date:'1980-10-12',birth_precision:'일'}};
  const d={...cdata('선정'),persons,assigns:[asg({end_ym:'2026-10-20'})],contacts:[{person_id:'PSN-0001',assign_id:'ASG-00001',contact_date:'2025-01-01'}]};
  const a=alerts(env,d,'2026-10-10',{'PSN-0001':{has:false,requested_at:'2026-10-05'}}); eq(a.counts,{replyDelay:0,contactRequest:0,interviewWait:0,exitSoon:0,reconfirm:0,birthday:0}); ok(a.empty);
});
T('TC-CMN06-11','S39 읽기 실패 — 연락처 요청만 "확인 불가", 나머지 알림은 정상',async()=>{
  const env=mk(); seed(env,'S39',[]); env.mock.failNext(/GET .*values:batchGet/,500,4);
  const d={...cdata('선정'),orders:[O('ORD-00001','REQ-2026-001',{reply_due:'2026-10-01'})]};
  const a=await call(env,"cmnAlertSummary(__d,'2026-10-10',__s)",{d,s:SET});
  eq([a.contactRequest.status,a.contactRequest.count,a.replyDelay.length],['unavailable',null,1]); eq(a.empty,false);
});
T('CMN06-12','후보가 없으면 S39를 읽지 않는다 / 열려 있는 의뢰의 후보만 연락처 요청 대상',async()=>{
  const env=mk(); seed(env,'S39',[]);
  let a=await call(env,"cmnAlertSummary(__d,'2026-10-10',__s)",{d:{reqs:[R('REQ-2026-001')],lines:[],cands:[],orders:[]},s:SET});
  eq(env.mock.log.filter(x=>/S39|batch/.test(x)).length,0,'S39 호출 없음'); eq(a.contactRequest.status,'ok'); ok(a.empty,'알림 없음');
  a=await call(env,"cmnAlertSummary(__d,'2026-10-10',__s)",{d:{...cdata('선정'),reqs:[R('REQ-2026-001',{closed_state:'실패'})]},s:SET}); eq(a.contactRequest.count,0);
  eq(env.mock.log.filter(x=>/batch/.test(x)).length,0,'닫힌 의뢰의 후보는 조회 대상도 아님');
});

// ───────── CMN-07 전달 문구 ─────────
const REQ7=R('REQ-2026-001',{alias:'AI 플랫폼 백엔드',disclose_client:'N',work_place:'서울 여의도',start_ym:'2026-11',start_note:'초',duration_months:'6'});
const LN7=[{line_id:'LN-0001',request_id:'REQ-2026-001',role_codes:'DA,DBA',grade:'고급',headcount:'1',must_skills:'Oracle, Tibero',nice_skills:'보험',industry:'보험',project_type:'차세대',rate_sell:'8000000',rate_buy_target:'7000000',is_cancelled:'N'}];
T('TC-SCR02-04','전달 문구 — 매입 목표 단가만, 판매 단가·마진·고객사 줄 없음(고객사 공개 N)',()=>{
  const env=mk(); const r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:REQ7,lines:LN7,partyName:'서치업체 A',replyDue:'2026-10-17',clientName:'가나다생명',clientTerms:['가나다생명']}});
  ok(r.ok); ok(r.text.includes('안녕하세요, 서치업체 A님.')); ok(r.text.includes('700만원/월'),'매입 목표 단가'); ok(!r.text.includes('800')&&!r.text.includes('8,000,000')&&!r.text.includes('마진'),'판매 단가·마진 없음');
  ok(!r.text.includes('고객사')&&!r.text.includes('가나다생명'),'고객사 줄 없음'); ok(r.text.includes('건명: AI 플랫폼 백엔드')); ok(r.text.includes('DA, DBA · 고급 · 1명')); ok(r.text.includes('회신 기한: 2026-10-17'));
  ok(r.text.includes('투입 시기: 2026-11 초')&&r.text.includes('기간: 6개월')); eq(r.warnings.length,0);
});
T('CMN07-02','고객사 공개 Y면 고객사 줄 포함 / 비공개인데 문구에 고객사 이름이 남으면 경고',()=>{
  const env=mk(); let r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:{...REQ7,disclose_client:'Y'},lines:LN7,partyName:'A',replyDue:'2026-10-17',clientName:'가나다생명',clientTerms:['가나다생명']}});
  ok(r.text.includes('- 고객사: 가나다생명')); eq(r.warnings.length,0);
  r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:{...REQ7,alias:'가나다생명 차세대'},lines:LN7,partyName:'A',replyDue:'2026-10-17',clientName:'가나다생명',clientTerms:['가나다생명']}});
  ok(!r.text.includes('- 고객사:')); ok(r.warnings.some(w=>w.includes('가나다생명')),'경고');
});
T('CMN07-03','매입 목표 단가가 비면 "단가 협의"로 대체하고 경고 / 라인 미선택은 거절 / 취소 라인은 제외',()=>{
  const env=mk(); let r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:REQ7,lines:[{...LN7[0],rate_buy_target:''}],partyName:'A',replyDue:'2026-10-17'}});
  ok(r.text.includes('단가: 단가 협의')&&r.warnings.includes('단가가 없어 단가 협의로 대체했습니다.'));
  r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:REQ7,lines:[],partyName:'A'}}); ok(!r.ok&&r.message==='전달할 라인을 선택해 주세요.');
  r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:REQ7,lines:[{...LN7[0],is_cancelled:'Y'}],partyName:'A'}}); ok(!r.ok);
});
T('CMN07-04','S10 틀(order_msg_template)을 쓰되 규칙은 코드가 지킨다 / 틀이 없으면 기본 문구 / 빈 값 경고',()=>{
  const env=mk(); const r=call(env,"cmnBuildOrderMessage(__i)",{i:{req:{...REQ7,work_place:'',duration_months:''},lines:LN7,partyName:'B',template:'[{수신}] {요청인력}\n{회신요청} 판매단가는 {판매단가}',replyDue:''}});
  ok(r.text.startsWith('[B] ■ 요청 인력')); ok(r.text.includes('{판매단가}'),'정의되지 않은 자리표시자는 그대로(값을 채우지 않음)'); ok(!r.text.includes('8000000'));
  ok(r.warnings.includes('근무지가 비어 있습니다.')&&r.warnings.includes('기간이 비어 있습니다.')&&r.warnings.includes('회신 기한이 비어 있습니다.'));
});
T('CMN07-05','단가 표기 — 원을 만원으로 (소수 한 자리까지)',()=>{
  const env=mk(); eq(call(env,"cmnRateText('7000000')"),'700만원/월'); eq(call(env,"cmnRateText('7250000')"),'725만원/월'); eq(call(env,"cmnRateText('7255000')"),'725.5만원/월'); eq(call(env,"cmnRateText('')"),null); eq(call(env,"cmnRateText('0')"),null);
});

runTests(tests,'단계 ① 공통 — CMN-04 / 05 / 06 / 07').then(f=>process.exit(f?1:0));
