// HFC schema.js v2.0 — 시트·범위·헤더·상태 단일 정의(SSOT). 이 파일 외 하드코딩 금지.
const R={ // 읽기 [시트명, 범위]
  S01:['S01_PIPELINE','A1:M300'],
  S02:['S02_CASHFLOW_EST','A1:G24'],
  S03:['S03_PROJECT','A1:K200'],
  S04:['S04_REVENUE','A1:M1000'],
  S05:['S05_COST','A1:O1000'],
  S06:['S06_FIXED_COST','A1:F300'],
  S07:['S07_PROFILE','A1:S500'],
  S16:['S16_PROFILE_ITEM','A1:M3000'],
  S08:['S08_CASHFLOW_ACT','A1:O24'],
  S08_DETAIL:['S08_DETAIL','A1:J2000'],
  S09:['S09_DASHBOARD','A1:H24'],
  S10:['S10_SETTINGS','A1:E300'],
  S11:['S11_GRADE_RATE','A1:H100'],
  S12:['S12_ESTIMATE','A1:O500'],
  S13:['S13_VAT','A1:N20'],
  S14:['S14_HISTORY','A1:H999'],
  S17:['S17_MILESTONE','A1:D300'],
};
const W={ // 쓰기 [시트명, 범위]
  S01:['S01_PIPELINE','A:M'],
  S02:['S02_CASHFLOW_EST','A:G'],
  S03:['S03_PROJECT','A:K'],
  S04:['S04_REVENUE','A:M'],
  S05:['S05_COST','A:O'],
  S06:['S06_FIXED_COST','A:F'],
  S07:['S07_PROFILE','A:S'],
  S16:['S16_PROFILE_ITEM','A:M'],
  S08:['S08_CASHFLOW_ACT','A:O'],
  S08_DETAIL:['S08_DETAIL','A:J'],
  S09:['S09_DASHBOARD','A:H'],
  S10:['S10_SETTINGS','A:E'],
  S11:['S11_GRADE_RATE','A:H'],
  S12:['S12_ESTIMATE','A:O'],
  S13:['S13_VAT','A:N'],
  S14:['S14_HISTORY','A:H'],
  S17:['S17_MILESTONE','A:D'],
};
const HEADERS={
  // v2.9.12: 프로젝트별 마일스톤(회차) 설정 저장 — 1프로젝트=1행, rounds(회차 수)와 각 회차의 [항목명,비율,기준일]을
  // JSON 문자열로 압축 저장(회차 수가 프로젝트마다 달라 고정 컬럼으로는 표현이 어려움). project_id로 조회.
  S17:['project_id','rounds','items_json','updated_at'],
  S07:['profile_id','name','birth','gender','career_years','grade','military','address','phone','email','skills','buy_price','last_price','source','resume_link','status','avail_date','memo','updated_at'],
  S16:['item_id','profile_id','section','title','org','role','start','end','detail','lang','dbms','tool','sort'],
  S01:["pipeline_id", "opportunity", "client", "end_client", "probability", "contract_amount", "expected_start", "expected_end", "payment_cycle", "status", "memo", "created_at", "biz_type"],
  S02:["year_month","est_inflow","est_outflow","est_vat","est_balance","pipeline_basis","updated_at"],
  S03:["project_id","project_name","client","end_client","contract_amount","start_date","end_date","status","payment_terms","pipeline_id","memo"],
  S04:["revenue_id", "project_id", "year_month", "tax_invoice_amt", "cash_recv_amt", "cash_recv_date", "is_received", "memo", "vat_amt", "invoice_plan_date", "invoice_date", "matched_txn_id", "recv_actual_date"],
  S05:["cost_id", "project_id", "year_month", "cost_type", "person_name", "unit_price", "mm", "amount", "payment_date", "memo", "vat_amt", "invoice_plan_date", "invoice_date", "matched_txn_id", "pay_actual_date"],
  S06:["fixed_id", "year_month", "category", "amount", "payment_date", "memo"],
  S08:["year_month","act_balance","act_inflow","act_outflow","inflow_revenue","outflow_cost","outflow_fixed","outflow_tax","outflow_card","outflow_ai","outflow_etc","inflow_capital","inflow_etc","unclassified_cnt","csv_uploaded_at"],
  S08_DETAIL:["txn_id", "txn_date", "description", "inflow_amt", "outflow_amt", "balance", "recv", "branch", "category", "year_month"],
  S09:["year_month","est_balance","act_balance","diff_amount","accuracy_pct","diff_cause","alert_flag","updated_at"],
  // v2.9.9: 저장 로직(settings.html)의 실제 헤더는 setting_key/setting_value — 구 정의(key/value)는 결함이었음(설계서 결정2 반영, 즉시 수정)
  S10:["setting_key", "setting_value", "description", "category", "updated_at"],
  S11:["set_id","set_name","grade","sell_price","buy_price","description","is_default","updated_at"],
  S12:["estimate_id","pipeline_id","comp_type","item_name","grade","grade_set_id","qty","unit_price","buy_price","amount","mm","start_date","end_date","memo","created_at"],
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
  'probability','unclassified_cnt','accuracy_pct',
]);
// FREE_TEXT_DATE_COLS: 날짜처럼 보이지만 원본 표기를 보존해야 하는 컬럼(설계서 결정5) — 표준 날짜 변환 대상에서 제외.
const FREE_TEXT_DATE_COLS=new Set(['birth','start','end']);
