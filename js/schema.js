// HFC schema.js v2.0 — 시트·범위·헤더·상태 단일 정의(SSOT). 이 파일 외 하드코딩 금지.
const R={ // 읽기 [시트명, 범위]
  S01:['S01_PIPELINE','A1:M300'],
  S02:['S02_CASHFLOW_EST','A1:G24'],
  S03:['S03_PROJECT','A1:K200'],
  S04:['S04_REVENUE','A1:M1000'],
  S05:['S05_COST','A1:O1000'],
  S06:['S06_FIXED_COST','A1:J300'],
  S07:['S07_PROFILE','A1:S500'],
  S16:['S16_PROFILE_ITEM','A1:M3000'],
  S08:['S08_CASHFLOW_ACT','A1:O24'],
  S08_DETAIL:['S08_DETAIL','A1:J2000'],
  S09:['S09_DASHBOARD','A1:H24'],
  S10:['S10_SETTINGS','A1:E300'],
  S11:['S11_GRADE_RATE','A1:H100'],
  S12:['S12_ESTIMATE','A1:W500'],
  S13:['S13_VAT','A1:N20'],
  S14:['S14_HISTORY','A1:H999'],
  S17:['S17_MILESTONE','A1:D300'],
  S15:['S15_PAYOUT','A1:R3000'],   // v2.9.106 지급 스케줄(계산서 없는 지급: 사업소득·급여·기타경비·원천세·4대보험)
};
const W={ // 쓰기 [시트명, 범위]
  S01:['S01_PIPELINE','A:M'],
  S02:['S02_CASHFLOW_EST','A:G'],
  S03:['S03_PROJECT','A:K'],
  S04:['S04_REVENUE','A:M'],
  S05:['S05_COST','A:O'],
  S06:['S06_FIXED_COST','A:J'],
  S07:['S07_PROFILE','A:S'],
  S16:['S16_PROFILE_ITEM','A:M'],
  S08:['S08_CASHFLOW_ACT','A:O'],
  S08_DETAIL:['S08_DETAIL','A:J'],
  S09:['S09_DASHBOARD','A:H'],
  S10:['S10_SETTINGS','A:E'],
  S11:['S11_GRADE_RATE','A:H'],
  S12:['S12_ESTIMATE','A:W'],
  S13:['S13_VAT','A:N'],
  S14:['S14_HISTORY','A:H'],
  S17:['S17_MILESTONE','A:D'],
  S15:['S15_PAYOUT','A:R'],
};
const HEADERS={
  // v2.9.12: 프로젝트별 마일스톤(회차) 설정 저장 — 1프로젝트=1행, rounds(회차 수)와 각 회차의 [항목명,비율,기준일]을
  // JSON 문자열로 압축 저장(회차 수가 프로젝트마다 달라 고정 컬럼으로는 표현이 어려움). project_id로 조회.
  S17:['project_id','rounds','items_json','updated_at'],
  // v2.9.106 지급 스케줄 S15 — 계산서 없는 지급을 월·사람별 행으로 저장(지급 스케줄 설계서 v0.3 §3). 원천세·4대보험 납부도 별도 행.
  S15:['payout_id','project_id','year_month','pay_type','person_name','est_item','gross_amt','withheld_amt','ins_emp_amt','employer_amt','net_amt','payment_date','est_status','date_edited','memo','matched_txn_id','pay_actual_date','updated_at'],
  S07:['profile_id','name','birth','gender','career_years','grade','military','address','phone','email','skills','buy_price','last_price','source','resume_link','status','avail_date','memo','updated_at'],
  S16:['item_id','profile_id','section','title','org','role','start','end','detail','lang','dbms','tool','sort'],
  S01:["pipeline_id", "opportunity", "client", "end_client", "probability", "contract_amount", "expected_start", "expected_end", "payment_cycle", "status", "memo", "created_at", "biz_type"],
  S02:["year_month","est_inflow","est_outflow","est_vat","est_balance","pipeline_basis","updated_at"],
  S03:["project_id","project_name","client","end_client","contract_amount","start_date","end_date","status","payment_terms","pipeline_id","memo"],
  S04:["revenue_id", "project_id", "year_month", "tax_invoice_amt", "cash_recv_amt", "cash_recv_date", "is_received", "memo", "vat_amt", "invoice_plan_date", "invoice_date", "matched_txn_id", "recv_actual_date"],
  S05:["cost_id", "project_id", "year_month", "cost_type", "person_name", "unit_price", "mm", "amount", "payment_date", "memo", "vat_amt", "invoice_plan_date", "invoice_date", "matched_txn_id", "pay_actual_date"],
  // v2.9.22: 기타경비(고정비)의 세금계산서 수취 여부·부가세 추가(사용자 확정) — 프로젝트 매입(S05)에 안 걸리는
  // 임대료·통신비 등 비정기 매입세액공제 대상을 부가세 계산에 반영하기 위함.
  // v2.9.41: 고정비도 매출(S04)·매입(S05)과 동일하게 통장 대사(계획↔실제 거래 매칭) 대상이 되어야 한다는
  // 사용자 확정 — matched_txn_id(대사된 통장거래 ID)·pay_actual_date(실제 지급일) 추가.
  S06:["fixed_id", "year_month", "category", "amount", "payment_date", "memo", "has_tax_invoice", "vat_amt", "matched_txn_id", "pay_actual_date"],
  S08:["year_month","act_balance","act_inflow","act_outflow","inflow_revenue","outflow_cost","outflow_fixed","outflow_tax","outflow_card","outflow_ai","outflow_etc","inflow_capital","inflow_etc","unclassified_cnt","csv_uploaded_at"],
  S08_DETAIL:["txn_id", "txn_date", "description", "inflow_amt", "outflow_amt", "balance", "recv", "branch", "category", "year_month"],
  S09:["year_month","est_balance","act_balance","diff_amount","accuracy_pct","diff_cause","alert_flag","updated_at"],
  // v2.9.9: 저장 로직(settings.html)의 실제 헤더는 setting_key/setting_value — 구 정의(key/value)는 결함이었음(설계서 결정2 반영, 즉시 수정)
  S10:["setting_key", "setting_value", "description", "category", "updated_at"],
  S11:["set_id","set_name","grade","sell_price","buy_price","description","is_default","updated_at"],
  S12:["estimate_id","pipeline_id","comp_type","item_name","grade","grade_set_id","qty","unit_price","buy_price","amount","mm","start_date","end_date","memo","created_at","mm_round","cut_unit","cut_mode","buy_mm_round","buy_cut_unit","buy_cut_mode","mm_mode","buy_mm_mode"],
  S13:["vat_id","year","quarter_code","period_start","period_end","due_date","sales_vat","purchase_vat","estimated_payment","actual_payment","paid_date","cashflow_reflected","status","memo"],
  S14:["hist_id","changed_at","pipeline_id","target","old_value","new_value","reason","source"],
};
const ST={PIPELINE:['기회','확정','수주','계약','종료','포기','실주'],FIN:['수주','계약','종료'],GEN:['확정','수주','계약','종료'],REV:['발행대기','발행완료','입금완료'],COST:['수취대기','수취완료','지급완료']};

// ═══ v2.9.9 데이터 타입 표준화 설계서 Step2 — 타입 메타(SSOT) ═══
// NUMERIC_COLS: 이 이름을 가진 컬럼은 어느 시트에 있든 항상 숫자로 취급(콤마 제거 후 파싱).
// toObj()의 1차 방어와 전역 헬퍼 num()의 2차 방어가 이 목록 하나를 공유한다(설계서 결정3: 전체 적용).
const NUMERIC_COLS=new Set([
  // 금액류
  'contract_amount','tax_invoice_amt','cash_recv_amt','vat_amt','amount','unit_price','buy_price','sell_price',
  'est_inflow','est_outflow','est_vat','est_balance','act_balance','act_inflow','act_outflow',
  'inflow_revenue','outflow_cost','outflow_fixed','outflow_tax','outflow_card','outflow_ai','outflow_etc','inflow_capital','inflow_etc',
  'inflow_amt','outflow_amt','balance','estimated_payment','actual_payment','sales_vat','purchase_vat','diff_amount',
  'gross_amt','withheld_amt','ins_emp_amt','employer_amt','net_amt',
  // 수량·비율·순번류
  'probability','qty','mm','career_years','unclassified_cnt','accuracy_pct','sort','year',
]);
// ZERO_DEFAULT_COLS: 값이 없을 때 0으로 채우는 컬럼(설계서 결정1) — "발생 안 함=0"이 명확한 금액·집계류.
// 이 목록에 없는 숫자 컬럼(NUMERIC_COLS − ZERO_DEFAULT_COLS, 예: mm·qty·sort)은 공백일 때 공백을 유지한다 —
// 존재하지 않는 사실(예: 인건비 아닌 항목의 공수)을 0으로 만들어내지 않기 위함.
const ZERO_DEFAULT_COLS=new Set([
  'contract_amount','tax_invoice_amt','cash_recv_amt','vat_amt','amount','unit_price','buy_price','sell_price',
  'est_inflow','est_outflow','est_vat','est_balance','act_balance','act_inflow','act_outflow',
  'inflow_revenue','outflow_cost','outflow_fixed','outflow_tax','outflow_card','outflow_ai','outflow_etc','inflow_capital','inflow_etc',
  'inflow_amt','outflow_amt','balance','estimated_payment','actual_payment','sales_vat','purchase_vat','diff_amount',
  'gross_amt','withheld_amt','ins_emp_amt','employer_amt','net_amt',
  'probability','unclassified_cnt','accuracy_pct',
]);
// FREE_TEXT_DATE_COLS: 날짜처럼 보이지만 원본 표기를 보존해야 하는 컬럼(설계서 결정5) — 표준 날짜 변환 대상에서 제외.
const FREE_TEXT_DATE_COLS=new Set(['birth','start','end']);

// ═══════════════════════════════════════════════════════════════════════════
// v2.9.73 인력 의뢰·후보자 관리 모듈 — 신규 탭 18개 정의(SSOT)
// 근거: DB 물리 설계 v0.1(§3 탭 목록·§4 컬럼·§5 schema.js 반영안·§6 서식과 검증), 프로그램 설계서 STF-CMN-01~03
// 열 순서가 정본이며 끝에만 추가한다(중간 삽입 금지). 화면·에이전트는 헤더 이름으로 열을 찾는다.
// v2.9.74 변경 001(사용자 승인 2026-10-12): 모든 updated_at 열을 DT(YYYY-MM-DD HH:mm:ss, 한국 시간)로 — 같은 날 두 번 수정해도 충돌 검사(수정일시 비교)가 가능하도록. created_at 등 나머지 날짜는 D 그대로.
// 형태 표기: ID 아이디 / T 짧은 글 / TL 긴 글 / T7 문자 보존 숫자(주민번호 앞자리) / N0 정수 / N1 소수 한 자리 /
//           D 날짜 / M 연-월 / DT 일시(초 단위) / YN Y·N / E 정해진 값 / C 코드표 하나 / CL 코드표 여러 개 / J JSON 문자열
// ═══════════════════════════════════════════════════════════════════════════
const STAGE8=['추천수령','회신','서류통과','인터뷰','선정','계약','탈락','철회'];
const GRADE4=['특급','고급','중급','초급'];
const HR_TABS={
  S27:{tab:'S27_PARTY',rows:200,mode:'full',id:{prefix:'PTY-',digits:3},
    cols:'party_id:ID,name:T,roles:CL,aliases:TL,main_phone:T,memo:TL,is_active:YN,created_at:D,updated_at:DT'},
  S36:{tab:'S36_PARTY_CONTACT',rows:600,mode:'full',id:{prefix:'PCT-',digits:4},
    cols:'pcontact_id:ID,party_id:ID,name:T,title:T,phone:T,email:T,contact_memo:TL,last_contacted_at:D,is_primary:YN,is_active:YN,created_at:D,updated_at:DT'},
  S32:{tab:'S32_REQUEST',rows:800,mode:'full',id:{prefix:'REQ-',digits:3,yearly:true},
    cols:'request_id:ID,alias:T,requester_party_id:ID,end_client_name:T,end_client_party_id:ID,disclose_client:YN,work_place:T,start_ym:M,start_note:T,duration_months:N0,received_at:D,requester_due:D,closed_state:E,fail_reason_code:C,pipeline_id:ID,memo:TL,created_at:D,updated_at:DT',
    enums:{closed_state:['진행','실패','취소']}},
  S33:{tab:'S33_REQUEST_LINE',rows:1400,mode:'full',id:{prefix:'LN-',digits:4},
    cols:'line_id:ID,request_id:ID,line_no:N0,role_codes:CL,grade:E,headcount:N0,must_skills:CL,nice_skills:CL,industry:C,project_type:C,rate_sell:N0,rate_buy_target:N0,age_min:N0,age_max:N0,is_cancelled:YN,created_at:D,updated_at:DT',
    enums:{grade:GRADE4}},
  S34:{tab:'S34_SEARCH_ORDER',rows:2400,mode:'full',id:{prefix:'ORD-',digits:5},
    cols:'order_id:ID,request_id:ID,line_id:ID,party_id:ID,sent_at:D,reply_due:D,offered_rate_buy:N0,conditions:TL,reply_state:E,replied_at:D,memo:TL,created_at:D,updated_at:DT',
    enums:{reply_state:['대기','조건 협의 중','후보 추천','후보 없음','종결']}},
  S31:{tab:'S31_CANDIDACY',rows:5000,mode:'row',id:{prefix:'CND-',digits:5},
    cols:'cand_id:ID,line_id:ID,person_id:ID,via_party_id:ID,order_id:ID,stage:E,interview_type:E,interview_at:D,fail_reason_code:C,rate_buy:N0,rate_sell:N0,resume_file_id:ID,is_adopted:YN,fit_state:E,fit_level:E,fit_reason:TL,pitch_points:TL,concern_note:TL,client_exp:E,client_exp_note:TL,industry_exp:E,industry_exp_note:TL,type_exp:E,type_exp_note:TL,created_at:D,updated_at:DT',
    enums:{stage:STAGE8,interview_type:['대면','비대면'],fit_state:['초안','확정'],fit_level:['상','중','하'],
      client_exp:['있음','없음','확인 필요'],industry_exp:['있음','없음','확인 필요'],type_exp:['있음','없음','확인 필요']}},
  S38:{tab:'S38_CAND_STAGE_LOG',rows:20000,mode:'row',id:{prefix:'STG-',digits:6},
    cols:'log_id:ID,cand_id:ID,stage:E,stage_date:D,memo:T,created_at:D',
    enums:{stage:STAGE8}},
  S20:{tab:'S20_PERSON',rows:1000,mode:'row',id:{prefix:'PSN-',digits:4},
    cols:'person_id:ID,name:T,name_en:T,birth_date:D,birth_year:N0,birth_precision:E,birth_source:E,gender:E,region:T,employment_type:E,grade:E,grade_reported:E,career_years_reported:N1,career_years_manual:N1,career_manual_note:T,career_manual_at:D,desired_rate_text:T,desired_rate:N0,avail_text:T,avail_from:D,summary:TL,review_state:E,merged_into:ID,is_active:YN,created_at:D,updated_at:DT',
    enums:{birth_precision:['일','연도추정','미상'],birth_source:['주민번호','이력서','수동'],gender:['남','여'],
      employment_type:['프리랜서','정규직','법인','기타'],grade:GRADE4,grade_reported:GRADE4,review_state:['확정','검토필요']}},
  S39:{tab:'S39_PERSON_PRIVATE',rows:1000,mode:'row',id:null, // 키 person_id는 S20에서 받는다(1:1) — 발번 대상 아님
    cols:'person_id:ID,rid_head7:T7,mobile:T,email:T,contact_source:E,contact_requested_at:D,contact_acquired_at:D,updated_at:DT',
    enums:{contact_source:['서치업체','후보 본인','이력서 기재']}},
  S21:{tab:'S21_PERSON_ROLE',rows:3000,mode:'row',id:{prefix:'PRL-',digits:5},
    cols:'prole_id:ID,person_id:ID,role_code:C,level:E,evidence:T,created_at:D,updated_at:DT',
    enums:{level:['주력','가능','보조']}},
  S22:{tab:'S22_PERSON_SKILL',rows:10000,mode:'row',id:{prefix:'PSK-',digits:5},
    cols:'pskill_id:ID,person_id:ID,skill_type:E,skill_name:C,level:E,created_at:D,updated_at:DT',
    enums:{skill_type:['DBMS','언어','도구','업무도메인'],level:['상','중','하']}},
  S24:{tab:'S24_PERSON_CERT',rows:4000,mode:'row',id:{prefix:'CRT-',digits:5},
    cols:'cert_id:ID,person_id:ID,kind:E,name:T,org:T,cert_date:M,created_at:D,updated_at:DT',
    enums:{kind:['학력','자격','교육']}},
  S23:{tab:'S23_PERSON_CAREER',rows:16000,mode:'row',id:{prefix:'CAR-',digits:6},
    cols:'career_id:ID,person_id:ID,kind:E,employer:T,client_name:T,client_party_id:ID,project_name:T,industry:C,project_type:CL,role_text:T,role_codes:CL,start_ym:M,end_ym:M,is_current:YN,duration_months:N0,duration_basis:E,duration_text:T,tasks:TL,env:TL,tech:TL,exit_reason:E,origin:E,file_id:ID,line_key:T,review_state:E,pending_json:J,created_at:D,updated_at:DT,orig_json:J,edited_at:D',
    enums:{kind:['회사재직','프로젝트'],duration_basis:['날짜계산','기간표기','추정'],exit_reason:['정상종료','중도이탈','사유불명'],
      origin:['resume','수동'],review_state:['확정','검토필요']}},
  S25:{tab:'S25_ASSIGNMENT',rows:3000,mode:'row',id:{prefix:'ASG-',digits:5},
    cols:'assign_id:ID,person_id:ID,assign_kind:E,project_id:ID,client_name:T,client_party_id:ID,project_name:T,role_code:C,start_ym:M,end_ym:M,confidence:E,status:E,load_pct:N0,via_party_id:ID,info_source:E,source_contact_id:ID,created_at:D,updated_at:DT',
    enums:{assign_kind:['HFC 투입','외부 투입'],confidence:['확정','예정','불확실'],status:['진행','종료','취소'],info_source:['본인','서치업체','지인·기타']}},
  S26:{tab:'S26_CONTACT_LOG',rows:6000,mode:'row',id:{prefix:'CT-',digits:6},
    cols:'contact_id:ID,person_id:ID,contact_date:D,type:E,direction:E,summary:TL,feedback:TL,next_action:T,next_date:D,assign_id:ID,created_at:D,updated_at:DT',
    enums:{type:['통화','문자','메일','미팅','기타'],direction:['발신','수신']}},
  S28:{tab:'S28_PERSON_FILE',rows:3000,mode:'row',id:{prefix:'FIL-',digits:5},
    cols:'file_id:ID,person_id:ID,drive_file_id:T,file_name:T,drive_url:T,file_hash:T,version_no:N0,source_party_id:ID,received_at:D,parse_status:E,parse_error:T,match_person_id:ID,run_id:ID,parsed_at:D,created_at:D',
    enums:{parse_status:['대기','성공','읽기실패','검토필요','동일인확인','합침완료','처리종료']}},
  S29:{tab:'S29_RATING',rows:1200,mode:'row',id:{prefix:'RTG-',digits:5},
    cols:'rating_id:ID,person_id:ID,flag:E,reason:TL,rated_at:D,created_at:D',
    enums:{flag:['화이트','일반','블랙']}},
  S37:{tab:'S37_AGENT_RUN',rows:4000,mode:'row',id:{prefix:'RUN-',digits:5},
    cols:'run_id:ID,trigger:E,target_ref:T,requested_at:DT,started_at:DT,finished_at:DT,state:E,cnt_new:N0,cnt_updated:N0,cnt_review:N0,cnt_fail:N0,error:T',
    enums:{trigger:['정기','수동 폴더','수동 파일'],state:['요청됨','실행 중','완료','실패']}},
};
// 열 번호 → 열 문자(1→A … 27→AA)
function colLetter(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
// HR_TABS를 풀어 R(읽기)·W(쓰기)·HEADERS에 등록하고, 열별 형태·허용값 메타(HR_COLS)를 만든다.
const HR_COLS={};      // {S20:[{name,type,enum?}], …}
const HR_ORDER=Object.keys(HR_TABS); // 신규 탭 18개(정의 순서)
(function(){
  const TEXT_FMT=new Set(['ID','D','M','DT','T7']);   // 일반 텍스트 서식 고정(물리 설계 §6)
  const PHONE_COLS=new Set(['phone','mobile','main_phone']);
  Object.entries(HR_TABS).forEach(([k,t])=>{
    t.cols_=t.cols.split(',').map(s=>{ const [name,type]=s.split(':'); const c={name,type};
      c.text=TEXT_FMT.has(type)||PHONE_COLS.has(name);
      if(type==='YN') c.enum=['Y','N'];
      else if(type==='E'){ c.enum=(t.enums||{})[name]; if(!c.enum) throw new Error('허용값 정의 누락 '+k+'.'+name); }
      return c; });
    HR_COLS[k]=t.cols_;
    t.last=colLetter(t.cols_.length);
    R[k]=[t.tab,'A1:'+t.last+t.rows];
    W[k]=[t.tab,'A:'+t.last];
    HEADERS[k]=t.cols_.map(c=>c.name);
  });
})();
// 행 단위 삭제를 허용하는 탭(물리 설계 §9 — 접촉 이력만)
const HR_DELETABLE=new Set(['S26','S33','S32','S27','S36','S34','S21','S22','S24']);   // S33: 설계서 §5.6 "후보 없는 라인만 삭제". S32·S27·S36: 변경 004, S34: 변경 005(사용자 요청 2026-10-12), S21·S22·S24: 변경 007(사용자 승인 2026-10-15, 후보 상세에서 잘못 들어간 역할·기술·학력/자격 행 삭제) — 쓰이지 않는 의뢰·거래처·담당자만 화면(SCR-02·11)이 사용 여부를 확인한 뒤 삭제
// 숫자 컬럼 추가(물리 설계 §5). 단가·인원·연령·개월 수는 빈칸 유지(미정과 0을 구분), cnt_* 만 0 기본값.
['career_years_reported','career_years_manual','desired_rate','birth_year','headcount','line_no','rate_sell','rate_buy_target',
 'offered_rate_buy','rate_buy','age_min','age_max','duration_months','load_pct','version_no','cnt_new','cnt_updated','cnt_review','cnt_fail'
].forEach(c=>NUMERIC_COLS.add(c));
['cnt_new','cnt_updated','cnt_review','cnt_fail'].forEach(c=>ZERO_DEFAULT_COLS.add(c));
// 소수 한 자리(N1) 컬럼 — 정수로 잘리지 않게 rowsFor가 numF로 처리
const DECIMAL_COLS=new Set(['career_years_reported','career_years_manual','mm']); // v2.9.106: 견적 MM은 소수 2자리를 저장해야 한다(정수로 잘리던 결함)
Object.assign(ST,{STAGE8,GRADE4,
  PARTY_ROLES:['고객','최종 고객사','중개업자','서치업체','인력업체','개인','경로'],
  PERSON_LEVEL:['주력','가능','보조']});
// 코드 관리(S10) 카테고리 — 설정 저장·코드 저장이 함께 쓰는 단일 목록(SCR-12: 두 곳으로 흩어져 있던 목록을 한 곳으로 합침)
const S10_LEGACY_CODE_CATS=['txn_type','branch_rule','fixed_item','skill_tag','balance_item','recon_exclude'];          // 기존 코드 카테고리(balance_item: 자금수지 유형별 누적 잔액 대상 — key=거래유형명, value=기준 방향 출금/입금; recon_exclude: 통장 대사 목록에서 뺄 유형 — key=거래유형명)
const S10_HR_CODE_CATS=['role','industry','project_type','fail_reason'];                  // 인력 모듈 코드 카테고리
const S10_CODE_CATS=[...S10_LEGACY_CODE_CATS,...S10_HR_CODE_CATS];                         // 코드 관리 화면이 관리하는 카테고리
const S10_HR_SETTING_CAT='hr_setting';                                                     // 인력 설정값 카테고리(코드 저장·키워드 저장 모두 보존)
const S10_KP_CATS=['keyword','parameter',''];                                              // 키워드·파라미터(설정 저장이 관리)

// ── 시트 초기화(STF-CMN-03)가 넣는 기본 행·기본 코드·기본 설정값 (DB 물리 설계 v0.1 §7, 사용자 확인 P5 · 2026-10-10)
// 이미 있는 것은 건드리지 않고 없는 것만 추가한다.
const HR_SEED_PARTIES=[ // S27 기본 거래처 — 삭제 불가
  {party_id:'PTY-001',name:'직접',roles:'경로',is_active:'Y'},
  {party_id:'PTY-002',name:'내부',roles:'경로',is_active:'Y'},
];
const HR_SEED_CODES={ // S10 category → 코드 이름(순서가 저장 순서). setting_value(설명·동의어)는 비워 둔다.
  role:['PM','PL','PMO','AA','DA','DBA','TA','QA','개발','분석·설계','테스터','퍼블리셔','튜너','운영','사업관리·품질관리','ETL·이행','컨설팅'],
  industry:['증권','보험','은행','카드','공공','제조','통신','유통','기타','신협','새마을금고','우체국'],
  project_type:['FDS','차세대','DW','마이그레이션','유지보수','신규 개발'],
  fail_reason:['후보 부족','시기 불일치','단가 불일치','서류 탈락','인터뷰 탈락','타사 선정','고객 취소','응답 지연','기타'],
};
// 인력 설정값(category=hr_setting). agent_interval·order_msg_template·claude_prompt_template 은 해당 기능을 만드는 단계(②·①·④)에서 값을 정하면서 추가한다.
// grade_rule — 등급 기준표(claude/grade-estimation-rule-v0.1, 사용자 승인 2026-10-10). 기준표에 없는 조합(null)은 "기준없음". 형식은 개발 단계 ②에서 판정 로직과 함께 확정한다.
const HR_SEED_SETTINGS=[
  {key:'short_tenure_months',value:3,desc:'단기 이력 기준 개월'},
  {key:'exit_alert_days',value:30,desc:'철수 알림 일수'},
  {key:'reconfirm_days',value:90,desc:'재확인 일수'},
  {key:'grade_rule',desc:'등급 기준표(JSON) — 학력·자격 취득 후 경력 연수',
   value:JSON.stringify({version:1,unit:'년',grades:{
     '특급':{cert:{'기사':10},edu:{'박사':3,'석사':9,'학사':12}},
     '고급':{cert:{'기사':7},edu:{'학사':6}},
     '중급':{cert:{'기사':3},edu:{'학사':3}},
     '초급':{cert:{'기사':0},edu:{'전문학사':0}}}})},
];

// ── 코드 관리(SCR-12): 코드 삭제 때 "사용 건수"를 세는 위치 [탭, 열, 쉼표로 여러 개 들어가는 열인가] — 설계서 §16.6: S21~S23, S33, S31 조회 + 변경 003(2026-10-12): S25·S32 추가, 모두 읽기만
const S10_CODE_USAGE={
  role:[['S21','role_code',false],['S23','role_codes',true],['S33','role_codes',true],['S25','role_code',false]], // S25 추가: 변경 003(사용자 승인 2026-10-12)
  industry:[['S23','industry',false],['S33','industry',false]],
  project_type:[['S23','project_type',true],['S33','project_type',false]],
  fail_reason:[['S31','fail_reason_code',false],['S32','fail_reason_code',false]], // S32 추가: 변경 003
};
const S10_CODE_LABEL={role:'역할',industry:'업종',project_type:'프로젝트 유형',fail_reason:'실패 사유'};
// 인력 설정값(S10 category=hr_setting) 중 파라미터 카드에서 편집하는 항목 [키, 기본값, 화면 라벨]
const HR_SETTING_FIELDS=[['short_tenure_months',3,'단기 이력 기준'],['exit_alert_days',30,'철수 알림'],['reconfirm_days',90,'재확인'],['mm_round_digit',3,'일할 비율 자리'],['mm_mode','반올림','일할 비율 처리'],['cut_unit',10000,'입사·퇴사월 금액 단위'],['cut_mode','절사','입사·퇴사월 금액 처리'],
  // v2.9.106 지급 스케줄 기본 지급일 — '월오프셋:일' (0=귀속월, 1=익월 / 일 1~28, 99=말일). 행마다 직접 고칠 수 있다.
  ['payout_pay_salary','1:10','급여 지급일 기본'],['payout_pay_biz','1:10','사업소득 지급일 기본'],['payout_pay_etc','1:10','기타경비 지급일 기본'],['payout_remit_tax','0:10','원천세 납부일 기본(지급월 기준)'],['payout_remit_ins','0:10','4대보험 납부일 기본(지급월 기준)']];
