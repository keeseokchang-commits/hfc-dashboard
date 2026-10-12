// HFC cmn-stage.js v2.9.76 — STF-CMN-05 후보 단계 변경 (후보 단계를 바꾸는 유일한 통로)
// 근거: 프로그램 설계서 §22(CMN-05), DB 물리 설계 v0.1 §9 쓰기 규칙 "후보 단계 변경"
// 하는 일: 단계 이력(S38)에 한 줄을 추가하고, 현재 단계 캐시(S31.stage)를 같이 갱신한다. S38은 이력이라 덮어쓰거나 지우지 않는다(정정은 새 행 추가).
// 지키는 것: 읽기가 실패하면 아무것도 쓰지 않는다 / 둘 중 하나만 성공하면 알리고, 다시 저장할 때 S38에 같은 행을 또 만들지 않고 S31만 맞춘다.
// 의존: schema.js(ST·HEADERS), cmn-sheet.js(hr*)
// ※ 단계 ①에서는 후보가 없으므로 어떤 화면에도 연결하지 않는다(개발 순서 v0.1). 후보가 생기는 단계(③·④)에서 화면이 이 함수를 부른다.

const CMN_STAGE_MSG={
  needReason:'탈락 사유를 선택해 주세요.',
  needStage:'단계를 선택해 주세요.',
  needDate:'단계일을 입력해 주세요.',
  same:'이미 같은 단계입니다.',
  sync:'단계 기록과 현재 단계가 달라졌습니다. 다시 저장해 주세요.',
  read:'시트를 읽을 수 없어 저장하지 않았습니다.',
};
// p: {cand_id, stage, stage_date?(기본 오늘), memo?, fail_reason_code?(탈락이면 필수), interview_type?, interview_at?(인터뷰), readUpdatedAt?(화면이 읽은 S31 수정일시 — 있으면 충돌 검사)}
// 반환 {ok:true, stage, logId?, repaired, canPromote} / {ok:false, code, message, partial?, logId?}
async function cmnChangeStage(p){
  const stage=String(p.stage??'').trim();
  if(!ST.STAGE8.includes(stage)) return {ok:false,code:'NO_STAGE',message:CMN_STAGE_MSG.needStage};
  const date=String(p.stage_date||hrToday()).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!cmnDate(date)) return {ok:false,code:'NO_DATE',message:CMN_STAGE_MSG.needDate};
  const reason=String(p.fail_reason_code??'').trim();
  if(stage==='탈락'&&!reason) return {ok:false,code:'NO_REASON',message:CMN_STAGE_MSG.needReason};

  // 1) 읽기 — 후보 현재 행(S31)과 이 후보의 단계 이력(S38). 하나라도 실패하면 쓰지 않는다.
  const h=await hrHeader('S31'); if(!h.ok) return h;
  const row=await hrFindRow('S31',p.cand_id);
  if(row===null) return {ok:false,code:'READ_FAIL',message:CMN_STAGE_MSG.read};
  if(row<0) return {ok:false,code:'NOT_FOUND',message:HR_MSG.notFound};
  const cur=await hrReadRow('S31',row,h.header);
  if(cur===null) return {ok:false,code:'READ_FAIL',message:CMN_STAGE_MSG.read};
  const logs=await hrReadMany(['S38']);
  if(logs.failed.length) return {ok:false,code:'READ_FAIL',message:CMN_STAGE_MSG.read};
  const mine=logs.tabs.S38.rows.filter(r=>r.cand_id===p.cand_id);   // 시트 순서 = 입력 순서
  const lastLog=mine.length?mine[mine.length-1].stage:'';
  if(p.readUpdatedAt!==undefined&&String(cur.updated_at??'')!==String(p.readUpdatedAt??'')) return {ok:false,code:'CONFLICT',message:HR_MSG.conflict};

  // 2) 같은 단계 거절 / 이전 저장이 반쪽만 된 경우(이력은 목표 단계인데 현재 단계 캐시만 다름)는 S31만 맞춘다
  const repair=(lastLog===stage&&cur.stage!==stage);
  if(!repair&&cur.stage===stage) return {ok:false,code:'SAME',message:CMN_STAGE_MSG.same};

  // 3) 이력 추가
  let logId;
  if(!repair){
    const a=await hrAppend('S38',{cand_id:p.cand_id,stage,stage_date:date,memo:p.memo||''});
    if(!a.ok) return a;           // 아무것도 바뀌지 않았다
    logId=a.id;
  }
  // 4) 현재 단계 갱신 — 탈락이면 사유, 인터뷰이면 유형·일시. 탈락에서 다른 단계로 돌아오면 사유를 비운다.
  const ch={stage};
  if(stage==='탈락') ch.fail_reason_code=reason;
  else if(!cmnBlank(cur.fail_reason_code)) ch.fail_reason_code='';
  if(stage==='인터뷰'){ if(p.interview_type!==undefined) ch.interview_type=p.interview_type; if(p.interview_at!==undefined) ch.interview_at=p.interview_at; }
  const u=await hrUpdate('S31',p.cand_id,ch,{readUpdatedAt:cur.updated_at});
  if(!u.ok) return {ok:false,code:'SYNC',message:CMN_STAGE_MSG.sync,partial:!repair,logId,cause:u.code};
  return {ok:true,stage,logId,repaired:repair,canPromote:stage==='인터뷰',updated_at:u.updated_at};
}
