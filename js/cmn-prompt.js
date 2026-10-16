// HFC cmn-prompt.js v2.9.89 — STF-CMN-08 Claude 질문 프롬프트 생성 (읽기 전용, 시스템은 Claude를 호출하지 않고 복사용 문구만 만든다)
// 근거: 프로그램 설계서 §25(CMN-08). 만든 문구는 어디에도 저장하지 않는다.
// 지키는 것: 이 함수는 연락처(S39)·주민번호·단가·마진·우려 사항(concern_note)·의뢰 별칭/고객사를 "읽지도 않는다" — 입력으로 받은 값에 없으므로 문구에 섞일 수 없다.
//   후보 이름은 후보 A, B, C 로 바꾸고, 혹시 경력·기술 칸에 후보의 실명이 적혀 있으면 마지막에 한 번 더 후보 A 등으로 바꾼다(안전망). 대응표(map)는 화면에만 보여 준다.
// 정한 것(2026-10-15): 질문 종류 5종의 요청 문장은 코드에 기본값을 두고, S10 hr_setting 의 claude_prompt_template 이 있으면 문구 틀로 쓴다({요청조건}·{후보자료}·{요청문장} 자리표시).
//   후보 자료에는 등급·만 나이·경력 연차·역할 수준·핵심 기술·가용 시기·최근 프로젝트 줄(최대 8줄)·단기 이력 요약만 넣는다. 후보 요약(S20.summary)·역할 근거(evidence)는 실명이 섞일 수 있어 넣지 않는다.
// 의존: cmn-derive.js, cmn-person.js, cmn-fit.js(cmnFitCompare 는 쓰지 않음 — 사실 대조는 화면에서 따로 보여 줌)

const CMN_ASK_KINDS=['적합도 비교','인터뷰 질문 제안','강약점 정리','단기 이력 확인','추천 순위'];
const CMN_ASK_TEXT={
  '적합도 비교':'요청 조건과 각 후보의 이력을 항목별(등급·역할 경험·업종/유형 경험·필수 기술·가용 시기)로 대조해, 후보별 적합도(상/중/하)와 그 이유를 표로 정리해 주세요. 자료에 없는 내용은 추측하지 말고 "확인 필요"로 표시해 주세요.',
  '인터뷰 질문 제안':'요청 조건에 비추어 각 후보에게 확인해야 할 인터뷰 질문을 후보별로 5개씩 제안해 주세요. 이력의 공백·모호한 부분·요청 조건과 맞닿는 경험의 깊이를 묻는 질문을 포함해 주세요.',
  '강약점 정리':'각 후보의 강점과 보완이 필요한 점을 요청 조건 기준으로 후보별 3줄 이내로 정리하고, 요청자에게 추천할 때 쓸 포인트를 2~4줄로 제안해 주세요.',
  '단기 이력 확인':'각 후보의 단기 이력(짧게 끝난 프로젝트·재직)을 살펴, 사유를 확인해야 할 건과 확인 질문을 정리해 주세요. 자료로 알 수 없는 사유는 단정하지 말아 주세요.',
  '추천 순위':'요청 조건에 가장 잘 맞는 순서로 후보 순위를 매기고, 순위의 근거와 순위를 바꿀 수 있는 불확실한 점을 설명해 주세요.',
};
const CMN_PROMPT_DEFAULT_TEMPLATE='아래는 인력 의뢰 한 건의 요청 조건과 후보자 자료입니다. 후보 이름은 가명(후보 A, B…)이며 연락처·단가 등은 포함하지 않았습니다.\n\n■ 요청 조건\n{요청조건}\n\n■ 후보자 자료\n{후보자료}\n\n■ 요청\n{요청문장}';
const CMN_PROMPT_MAX=6;
const CMN_PROMPT_MSG={noCand:'질문할 후보를 선택해 주세요.',many:'한 번에 6명까지 권장합니다.',noCareer:'경력 정보 없음'};
const CMN_PROMPT_EXCLUDED=['연락처·주민번호','후보 실명 (후보 A, B…로 표기)','판매·매입 단가와 마진','내부 메모·우려 사항','의뢰 건명·고객사'];
const cmnPromptAlias=i=>'후보 '+String.fromCharCode(65+i);   // 6명 권장이지만 26명까지는 문자로

// inp: {line(S33), req(S32, 투입 시기·기간만 사용), cands:[{view, careers, skills}], kind, extra, template}
// out: {ok:true,text,map:[{alias,id}],warnings:[…],excluded:[…]} / {ok:false,message}
function cmnBuildPrompt(inp){
  const cands=inp.cands||[]; if(!cands.length) return {ok:false,message:CMN_PROMPT_MSG.noCand};
  const kind=CMN_ASK_KINDS.includes(inp.kind)?inp.kind:CMN_ASK_KINDS[0]; const warn=[]; const map=[];
  if(cands.length>CMN_PROMPT_MAX) warn.push(CMN_PROMPT_MSG.many);
  const L=inp.line||{}, R=inp.req||{};
  const cond=[]; const roles=cmnSplit(L.role_codes);
  if(roles.length) cond.push(`- 역할: ${roles.join(' + ')}${roles.length>1?' (겸임)':''}`);
  if(L.grade) cond.push(`- 등급: ${L.grade}`); if(L.headcount) cond.push(`- 인원: ${L.headcount}명`);
  if(cmnSplit(L.must_skills).length) cond.push(`- 필수 기술: ${cmnSplit(L.must_skills).join(', ')}`);
  if(cmnSplit(L.nice_skills).length) cond.push(`- 우대 기술: ${cmnSplit(L.nice_skills).join(', ')}`);
  if(L.industry) cond.push(`- 업종: ${L.industry}`); if(L.project_type) cond.push(`- 프로젝트 유형: ${L.project_type}`);
  if(L.age_min||L.age_max) cond.push(`- 연령: ${L.age_min||''}~${L.age_max||''}세`);
  if(R.start_ym) cond.push(`- 투입 시기: ${String(R.start_ym).slice(0,7)}`); if(R.duration_months) cond.push(`- 기간: ${R.duration_months}개월`);
  const blocks=cands.map((c,i)=>{
    const alias=cmnPromptAlias(i); map.push({alias,id:(c.view&&c.view.id)||''});
    const v=c.view||{}, careers=c.careers||[], p=v.person||{};
    const out=[`[${alias}]`];
    out.push(`- 등급: ${v.grade||v.gradeReported||'미정'}`);
    if(v.age&&v.age.kind==='exact') out.push(`- 만 나이: ${v.age.age}세`); else if(v.age&&v.age.kind==='range') out.push(`- 나이: ${v.age.label}`);
    if(v.years&&v.years.applied) out.push(`- 경력 연차: ${v.years.applied.years}년`);
    if((v.roles||[]).length) out.push(`- 역할: ${v.roles.map(r=>`${r.code}${r.level?' '+r.level:''}(${r.months}개월)`).join(', ')}`);
    const sk=(c.skills||[]).map(s=>s.skill_name).filter(Boolean); if(sk.length) out.push(`- 핵심 기술: ${sk.slice(0,12).join(', ')}`);
    if(v.avail&&v.avail.text) out.push(`- 가용 시기: ${v.avail.text}`);
    if(v.short&&v.short.count>0) out.push(`- 단기 이력: ${v.short.count}건 (평균 ${v.short.avg_months}개월)`);
    const proj=careers.filter(x=>x.kind==='프로젝트').sort((a,b)=>String(b.start_ym||'').localeCompare(String(a.start_ym||''))).slice(0,8);
    const comp=careers.filter(x=>x.kind==='회사재직').length;
    if(!careers.length){ out.push(`- 경력: ${CMN_PROMPT_MSG.noCareer}`); warn.push(`${alias}: ${CMN_PROMPT_MSG.noCareer}`); }
    else {
      if(comp) out.push(`- 회사 재직 ${comp}곳`);
      if(proj.length) out.push('- 최근 프로젝트:'); proj.forEach(x=>{ const per=`${x.start_ym||'?'}~${cmnYes(x.is_current)?'진행 중':(x.end_ym||'?')}`;
        out.push(`  · ${per} | ${[x.client_name,x.project_name].filter(Boolean).join(' / ')||'-'} | 역할 ${cmnSplit(x.role_codes).join('+')||x.role_text||'-'}${x.industry?` | ${x.industry}`:''}${x.tasks?` | ${String(x.tasks).replace(/\s+/g,' ').slice(0,80)}`:''}`); });
    }
    return {alias,text:out.join('\n'),names:[p.name,p.name_en,...(v.aliasNames||[])].filter(x=>x&&String(x).trim().length>=2)};
  });
  const tpl=cmnBlank(inp.template)?CMN_PROMPT_DEFAULT_TEMPLATE:String(inp.template);
  const ask=CMN_ASK_TEXT[kind]+(cmnBlank(inp.extra)?'':'\n추가 요청: '+String(inp.extra).trim());
  let text=tpl.replace('{요청조건}',cond.join('\n')||'(조건 없음)').replace('{후보자료}',blocks.map(b=>b.text).join('\n\n')).replace('{요청문장}',ask);
  // 안전망: 후보 실명이 자료 안에 적혀 있으면 가명으로 바꾼다(긴 이름부터)
  const all=[]; blocks.forEach(b=>b.names.forEach(n=>all.push([String(n).trim(),b.alias]))); all.sort((a,b)=>b[0].length-a[0].length);
  all.forEach(([n,a])=>{ text=text.split(n).join(a); });
  return {ok:true,text,map,warnings:warn,excluded:CMN_PROMPT_EXCLUDED.slice(),kind};
}
