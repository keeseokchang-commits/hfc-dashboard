// HFC cmn-msg.js v2.9.76 — STF-CMN-07 서치업체 전달 문구 생성 (읽기 전용 · 시스템이 업체에 보내지 않음, 사용자가 복사해 전달)
// 근거: 프로그램 설계서 §24(CMN-07), DB 물리 설계 v0.1 (단가는 원 단위 저장)
// 반드시 지키는 규칙(코드로 고정 — 템플릿이 바뀌어도 깨지지 않음):
//   · 매입 목표 단가만 넣는다. 판매 단가·마진·메모·내부 우려 사항은 어떤 경로로도 문구에 들어가지 않는다.
//   · 고객사를 비공개(disclose_client≠Y)로 한 의뢰는 고객사 줄을 빼고 별칭만 쓴다. 그래도 문구에 고객사 이름이 남아 있으면 경고한다.
// 템플릿: S10(category=hr_setting)의 order_msg_template 이 있으면 그 틀을 쓰고, 없으면 기본 문구. 틀 안에서 쓸 수 있는 자리표시자는
//   {수신} {의뢰정보} {요청인력} {회신요청} 네 개뿐이며, 각 자리의 내용은 이 코드가 만든다(규칙을 틀이 바꿀 수 없다).
// 의존: cmn-derive.js(없음 — 순수 문자열 처리)

const CMN_MSG={
  noLine:'전달할 라인을 선택해 주세요.',
  noRate:'단가가 없어 단가 협의로 대체했습니다.',
};
const CMN_MSG_DEFAULT_TEMPLATE='안녕하세요, {수신}님.\n아래 인력 요청 건을 전달드립니다.\n\n{의뢰정보}\n\n{요청인력}\n\n{회신요청}\n\n감사합니다.';
// 원 → "700만원/월" (소수는 한 자리까지). 값이 없으면 null
function cmnRateText(won){
  const n=parseFloat(String(won??'').replace(/,/g,'')); if(!(n>0)) return null;
  const man=Math.round(n/1000)/10;   // 만원 단위, 소수 한 자리
  return `${man.toLocaleString('ko-KR',{maximumFractionDigits:1})}만원/월`;
}
const cmnList=s=>String(s??'').split(',').map(x=>x.trim()).filter(Boolean);
// in: {req(S32 행), lines(전달할 S33 행들), partyName(수신 업체), replyDue('YYYY-MM-DD'), clientName(공개 허용 시 쓸 고객사 이름), clientTerms(고객을 알 수 있는 모든 표기), template?, replyItems?}
// out: {ok:true,text,warnings:[…]} / {ok:false,message}
function cmnBuildOrderMessage(inp){
  const req=inp.req||{}, lines=(inp.lines||[]).filter(l=>!cmnYes(l.is_cancelled)); const warn=[];
  if(!lines.length) return {ok:false,message:CMN_MSG.noLine};
  const disclose=cmnYes(req.disclose_client);
  // 의뢰 정보
  const info=['■ 의뢰 정보',`- 건명: ${req.alias||'(별칭 없음)'}`];
  if(disclose&&!cmnBlank(inp.clientName)) info.push(`- 고객사: ${inp.clientName}`);
  if(!cmnBlank(req.work_place)) info.push(`- 근무지: ${req.work_place}`); else warn.push('근무지가 비어 있습니다.');
  const start=[req.start_ym,req.start_note].map(x=>String(x??'').trim()).filter(Boolean).join(' ');
  if(start) info.push(`- 투입 시기: ${start}`); else warn.push('투입 시기가 비어 있습니다.');
  if(!cmnBlank(req.duration_months)) info.push(`- 기간: ${req.duration_months}개월`); else warn.push('기간이 비어 있습니다.');
  // 요청 인력 — 판매 단가(rate_sell)는 읽지도 않는다
  const body=['■ 요청 인력'];
  lines.forEach((l,i)=>{
    const roles=cmnList(l.role_codes).join(', '); const head=[roles||null,l.grade||null,cmnBlank(l.headcount)?null:`${l.headcount}명`].filter(Boolean).join(' · ');
    if(!roles||!l.grade||cmnBlank(l.headcount)) warn.push(`요청 라인 ${i+1}의 역할·등급·인원 중 비어 있는 값이 있습니다.`);
    body.push(`[${i+1}] ${head||'(내용 없음)'}`);
    const must=cmnList(l.must_skills).join(', '), nice=cmnList(l.nice_skills).join(', ');
    if(must) body.push(`  - 필수 기술: ${must}`);
    if(nice) body.push(`  - 우대 기술: ${nice}`);
    if(!cmnBlank(l.industry)) body.push(`  - 업종: ${l.industry}`);
    if(!cmnBlank(l.project_type)) body.push(`  - 프로젝트 유형: ${cmnList(l.project_type).join(', ')}`);
    const rate=cmnRateText(l.rate_buy_target);
    if(rate) body.push(`  - 단가: ${rate}`);
    else { body.push('  - 단가: 단가 협의'); if(!warn.includes(CMN_MSG.noRate)) warn.push(CMN_MSG.noRate); }
  });
  // 회신 요청
  const reply=['■ 회신 요청'];
  if(!cmnBlank(inp.replyDue)) reply.push(`- 회신 기한: ${inp.replyDue}`); else warn.push('회신 기한이 비어 있습니다.');
  reply.push(`- 회신 항목: ${inp.replyItems||'이름을 제외한 이력서(연락처 제외), 희망 단가, 투입 가능 시점'}`);
  // 틀에 끼워 넣기
  const tpl=cmnBlank(inp.template)?CMN_MSG_DEFAULT_TEMPLATE:String(inp.template);
  let text=tpl.split('{수신}').join(inp.partyName||'담당자').split('{의뢰정보}').join(info.join('\n'))
    .split('{요청인력}').join(body.join('\n')).split('{회신요청}').join(reply.join('\n'));
  // 비공개 의뢰인데 고객사 이름이 남아 있으면 경고(자동으로 고치지 않고 사용자가 확인)
  if(!disclose){
    (inp.clientTerms||[]).map(t=>String(t??'').trim()).filter(t=>t.length>=2).forEach(t=>{
      if(text.includes(t)) warn.push(`고객사 비공개 의뢰인데 문구에 "${t}"가 들어 있습니다. 별칭·기술 항목을 확인해 주세요.`);
    });
  }
  return {ok:true,text,warnings:[...new Set(warn)]};
}
