// HFC cmn-review.js v2.9.81 — 경력 줄 변경 검토·수정 공통 처리 (SCR-06 · SCR-08 · SCR-10 이 같은 함수를 쓴다)
// 근거: 프로그램 설계서 §10.5(SCR-06 변경 검토), §12.4~12.5(SCR-08 경력 줄 수정·되돌리기·검토 해소), §14.5(SCR-10), SCR-06 R2 [확정 2026-10-10: 두 곳 모두 가능, 같은 처리 함수]
// 하는 일: ① 보류 값(S23.pending_json)을 "현재 값(수정본) / 이전 이력서 값(orig_json) / 새 이력서 값" 중 골라 반영 ② 경력 줄 전 항목 수정(개월 수 다시 계산, edited_at 기록) ③ 이력서 값으로 되돌리기
// 불변: S23.line_key 와 S23.orig_json(수정 때)은 바꾸지 않는다(새 이력서 값을 고를 때만 orig_json 의 그 항목을 새 값으로 갱신).
// 시트에 저장되는 JSON 형식(2026-10-13 정한 것 — BAT-01 이 따라야 하는 계약):
//   orig_json    = {"employer":"…","start_ym":"2025-01",…}                       이력서에서 처음 읽은 줄 값(CMN_LINE_FIELDS 의 항목)
//   pending_json = {"file_id":"FIL-00007","values":{"end_ym":"2026-06",…}}        새 이력서에서 온, 현재 값과 다른 항목만
// 의존: schema.js, cmn-sheet.js(hrUpdate·hrReadMany·hrToday), cmn-derive.js(cmnCareerSpan·cmnBlank)

const CMN_LINE_FIELDS=[['employer','회사'],['client_name','고객사'],['project_name','프로젝트명'],['industry','업종'],['project_type','프로젝트 유형'],['role_text','역할(원문)'],['role_codes','역할'],
  ['start_ym','시작 월'],['end_ym','종료 월'],['is_current','진행 중'],['duration_months','개월 수'],['duration_basis','계산 근거'],['duration_text','기간 표기'],['tasks','담당 업무'],['env','환경'],['tech','기술']];
const CMN_LINE_LABEL=Object.fromEntries(CMN_LINE_FIELDS);
const CMN_REVIEW_MSG={done:'이미 처리된 항목입니다. 다시 불러왔습니다.',raw:'새 이력서의 변경 내용을 표시하지 못했습니다. 이력서를 열어 확인한 뒤 "확인 완료"를 눌러 주세요.'};

function cmnParseJson(s){ try{ const j=JSON.parse(String(s??'')); return (j&&typeof j==='object'&&!Array.isArray(j))?j:null; }catch(e){ return null; } }
function cmnPendingOf(row){
  const j=cmnParseJson(row.pending_json); if(!j) return {values:{},file_id:'',valid:false};
  const v=(j.values&&typeof j.values==='object')?j.values:Object.fromEntries(Object.entries(j).filter(([k])=>k!=='file_id'));
  return {values:Object.fromEntries(Object.entries(v).filter(([k])=>CMN_LINE_LABEL[k])),file_id:j.file_id||'',valid:true};
}
// 검토 대기 목록(항목 단위). 반환 [{career_id,person_id,kind,lineLabel,field,fieldLabel,current,prev,next,hasEdit,file_id,row}] + raw 항목(내용을 읽지 못한 검토 대기)
function cmnReviewItems(careers){
  const out=[];
  (careers||[]).forEach(row=>{
    if(String(row.review_state??'').trim()!=='검토필요') return;
    const orig=cmnParseJson(row.orig_json)||{}; const p=cmnPendingOf(row); const fields=Object.keys(p.values);
    const lineLabel=`${row.kind==='회사재직'?(row.employer||'회사'):(row.project_name||row.client_name||'프로젝트')} · ${row.start_ym||'시작 미상'}`;
    if(!p.valid||!fields.length){ out.push({career_id:row.career_id,person_id:row.person_id,kind:row.kind,lineLabel,field:'',fieldLabel:'',raw:true,row}); return; }
    fields.forEach(f=>out.push({career_id:row.career_id,person_id:row.person_id,kind:row.kind,lineLabel,field:f,fieldLabel:CMN_LINE_LABEL[f],
      current:String(row[f]??''),prev:Object.prototype.hasOwnProperty.call(orig,f)?String(orig[f]??''):String(row[f]??''),next:String(p.values[f]??''),
      hasEdit:Object.prototype.hasOwnProperty.call(orig,f)&&String(orig[f]??'')!==String(row[f]??''),file_id:p.file_id,row}));
  });
  return out;
}
// 이 줄의 값이 이력서 원본과 다른 항목이 하나라도 있으면 수정된 줄
function cmnLineEdited(row,orig){ return CMN_LINE_FIELDS.some(([f])=>Object.prototype.hasOwnProperty.call(orig,f)&&String(row[f]??'')!==String(orig[f]??'')); }
// 시작·종료(진행 중)가 바뀌면 개월 수를 다시 계산한다(시작·종료 월 포함). 계산할 수 없으면 null(기존 값 유지)
function cmnLineMonths(row){ const r=cmnCareerSpan(row,hrToday()); return r.ok?r.e-r.s+1:null; }
const CMN_DATE_FIELDS=['start_ym','end_ym','is_current'];

// 보류 값 한 항목 처리. choice: 'current' 현재 값 유지 | 'prev' 이전 이력서 값 | 'next' 새 이력서 값
async function cmnReviewApply(row,field,choice){
  const p=cmnPendingOf(row); if(!p.valid||!Object.prototype.hasOwnProperty.call(p.values,field)) return {ok:false,code:'DONE',message:CMN_REVIEW_MSG.done};
  const orig=cmnParseJson(row.orig_json)||{}; const ch={};
  if(choice==='next'){ ch[field]=p.values[field]; orig[field]=p.values[field]; }
  else if(choice==='prev'){ if(Object.prototype.hasOwnProperty.call(orig,field)) ch[field]=orig[field]; }
  const values={...p.values}; delete values[field]; const left=Object.keys(values).length;
  ch.pending_json=left?JSON.stringify({file_id:p.file_id,values}):''; if(!left) ch.review_state='확정';
  const merged={...row,...ch};
  if(CMN_DATE_FIELDS.some(f=>Object.prototype.hasOwnProperty.call(ch,f))&&!Object.prototype.hasOwnProperty.call(ch,'duration_months')){ const m=cmnLineMonths(merged); if(m!==null){ ch.duration_months=m; ch.duration_basis='날짜계산'; merged.duration_months=m; } }
  if(choice==='next'){ if(Object.prototype.hasOwnProperty.call(ch,'duration_months')){ orig.duration_months=ch.duration_months; orig.duration_basis=ch.duration_basis; } ch.orig_json=JSON.stringify(orig); }
  ch.edited_at=cmnLineEdited(merged,orig)?(row.edited_at||hrToday()):'';
  return hrUpdate('S23',row.career_id,ch,{readUpdatedAt:row.updated_at});
}
// 내용을 읽지 못한 검토 대기(pending_json 없음·손상)를 사람이 확인한 뒤 해소 — 기존 값 유지
async function cmnReviewDismiss(row){ return hrUpdate('S23',row.career_id,{pending_json:'',review_state:'확정'},{readUpdatedAt:row.updated_at}); }

// 경력 줄 수정 저장(SCR-08). values = {항목:값}; 바뀐 항목만 쓴다. line_key·orig_json 은 건드리지 않는다.
async function cmnLineSave(row,values){
  const orig=cmnParseJson(row.orig_json)||{}; const ch={};
  Object.keys(values).forEach(f=>{ if(CMN_LINE_LABEL[f]&&String(values[f]??'')!==String(row[f]??'')) ch[f]=values[f]; });
  if(Object.prototype.hasOwnProperty.call(values,'exit_reason')&&String(values.exit_reason)!==String(row.exit_reason??'')) ch.exit_reason=values.exit_reason;
  if(!Object.keys(ch).length) return {ok:true,unchanged:true};
  const merged={...row,...ch};
  if(CMN_DATE_FIELDS.some(f=>Object.prototype.hasOwnProperty.call(ch,f))&&!Object.prototype.hasOwnProperty.call(ch,'duration_months')){ const m=cmnLineMonths(merged); if(m!==null){ ch.duration_months=m; ch.duration_basis='날짜계산'; merged.duration_months=m; } }
  if(CMN_LINE_FIELDS.some(([f])=>Object.prototype.hasOwnProperty.call(ch,f))) ch.edited_at=cmnLineEdited(merged,orig)?(row.edited_at||hrToday()):'';
  return hrUpdate('S23',row.career_id,ch,{readUpdatedAt:row.updated_at});
}
// 이력서 값으로 되돌리기: orig_json 의 값으로 줄을 복원하고 edited_at 를 비운다
async function cmnLineRevert(row){
  const orig=cmnParseJson(row.orig_json); if(!orig) return {ok:false,code:'NO_ORIG',message:'이력서 원본 값이 없어 되돌릴 수 없습니다.'};
  const ch={}; CMN_LINE_FIELDS.forEach(([f])=>{ if(Object.prototype.hasOwnProperty.call(orig,f)&&String(orig[f]??'')!==String(row[f]??'')) ch[f]=orig[f]; });
  ch.edited_at='';
  return hrUpdate('S23',row.career_id,ch,{readUpdatedAt:row.updated_at});
}
// 마지막 검토 대기가 풀리면 후보의 "검토 필요" 표시를 정리한다. 등급 판정(S20.grade)이 필요한 경우(이력서 기재 등급은 있는데 판정이 없음)는 그대로 둔다.
async function cmnPersonReviewClear(personId){
  const r=await hrReadMany(['S20','S23']); if(r.failed.length) return {ok:false,message:HR_MSG.read(R[r.failed[0]][0])};
  const p=r.tabs.S20.rows.find(x=>x.person_id===personId); if(!p||String(p.review_state??'').trim()!=='검토필요') return {ok:true,changed:false};
  if(r.tabs.S23.rows.some(c=>c.person_id===personId&&String(c.review_state??'').trim()==='검토필요')) return {ok:true,changed:false};
  if(!cmnBlank(p.grade_reported)&&cmnBlank(p.grade)) return {ok:true,changed:false};
  const u=await hrUpdate('S20',personId,{review_state:'확정'},{readUpdatedAt:p.updated_at}); return u.ok?{ok:true,changed:true}:u;
}
