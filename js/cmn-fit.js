// HFC cmn-fit.js v2.9.89 — STF-CMN-04 중 "적합 평가 대조표" 계산 (읽기 전용, 저장하지 않음)
// 근거: 프로그램 설계서 §6(SCR-03 6.3③·6.4 9·13·14·6.5). 요청 라인 조건과 후보 이력을 항목별로 대조해 사실 판정을 만든다.
// 지키는 것: 자동 확정하지 않는다 — 결과는 "제안"이고 사용자가 확인·수정해 저장한다. 판정 상태: ok(맞음) / warn(일부·확인) / bad(안 맞음, 등록은 막지 않음) / unknown(자료 없음) / none(조건 없음)
// 정한 것(2026-10-15): 등급은 후보가 요청 등급 이상이면 맞음(상회 표시), 낮으면 불일치 / 고객사·업종·유형 경험의 제안값은 있음·없음·확인 필요 /
//   가용 시기는 가용일이 투입 시기(월 1일)보다 늦으면 불일치 / 필수 기술은 후보 기술(S22)과 경력의 기술 칸(S23.tech)에서 대소문자 무시로 찾음 / 나이는 연도 추정이면 범위로 대조.
// 의존: cmn-derive.js(cmnDate·cmnAge·cmnYm), cmn-person.js(cmnRoleMonths·cmnSplit), schema.js(GRADE4 순서 상수)

const CMN_FIT_GRADES=['특급','고급','중급','초급'];
const cmnFitNorm=s=>String(s??'').replace(/\s|\(주\)|㈜|주식회사/g,'').toLowerCase();
function cmnFitCompare(inp){
  const line=inp.line||{}, req=inp.req||{}, v=inp.view||{}, careers=inp.careers||[], skills=inp.skills||[], asOf=inp.asOf, parties=inp.parties||new Map();
  const items=[]; const sug={};
  const add=(key,label,status,text)=>items.push({key,label,status,text});

  // 1) 등급
  const want=String(line.grade||'').trim(), have=String(v.grade||v.gradeReported||'').trim();
  if(!want) add('grade','등급','none','요청 등급 조건 없음');
  else if(!have) add('grade','등급','unknown',`요청 ${want} / 후보 등급 미정`);
  else { const w=CMN_FIT_GRADES.indexOf(want), h=CMN_FIT_GRADES.indexOf(have);
    if(h<0||w<0) add('grade','등급','unknown',`요청 ${want} / 후보 ${have}`);
    else if(h===w) add('grade','등급','ok',`요청 ${want} = 후보 ${have}`);
    else if(h<w) add('grade','등급','ok',`요청 ${want} < 후보 ${have} (상회)`);
    else add('grade','등급','bad',`등급 불일치 — 요청 ${want} / 후보 ${have}`); }

  // 2) 고객사 경험 — 의뢰의 최종 고객사(이름·거래처·별칭)와 후보 경력의 고객사를 비교
  const reqNames=new Set(); const rn=String(req.end_client_name||'').trim(); if(rn) reqNames.add(cmnFitNorm(rn));
  const rp=parties.get&&parties.get(req.end_client_party_id);
  if(rp){ reqNames.add(cmnFitNorm(rp.name)); cmnSplit(String(rp.aliases||'').replace(/\n/g,',')).forEach(a=>reqNames.add(cmnFitNorm(a))); }
  reqNames.delete('');
  if(!reqNames.size){ add('client','고객사 경험','none','고객사 정보 없음'); sug.client_exp='확인 필요'; }
  else { const hit=careers.find(c=>(c.client_party_id&&c.client_party_id===req.end_client_party_id)||reqNames.has(cmnFitNorm(c.client_name)));
    if(hit){ add('client','고객사 경험','ok',`있음 — ${hit.project_name||hit.client_name||''}`.trim()); sug.client_exp='있음'; }
    else if(!careers.length){ add('client','고객사 경험','unknown','경력 정보 없음'); sug.client_exp='확인 필요'; }
    else { add('client','고객사 경험','warn','이력서에서 찾지 못함 (확인 필요)'); sug.client_exp='없음'; } }

  // 3) 업종 경험
  const ind=String(line.industry||'').trim();
  if(!ind){ add('industry','업종 경험','none','업종 조건 없음'); sug.industry_exp='확인 필요'; }
  else { const n=careers.filter(c=>String(c.industry||'').trim()===ind).length;
    if(n){ add('industry','업종 경험','ok',`있음 — ${ind} ${n}건`); sug.industry_exp='있음'; }
    else if(!careers.some(c=>String(c.industry||'').trim())){ add('industry','업종 경험','unknown','경력에 업종 정보 없음'); sug.industry_exp='확인 필요'; }
    else { add('industry','업종 경험','warn',`${ind} 경험을 찾지 못함`); sug.industry_exp='없음'; } }

  // 4) 프로젝트 유형 경험
  const ty=String(line.project_type||'').trim();
  if(!ty){ add('type','프로젝트 유형 경험','none','유형 조건 없음'); sug.type_exp='확인 필요'; }
  else { const n=careers.filter(c=>cmnSplit(c.project_type).includes(ty)).length;
    if(n){ add('type','프로젝트 유형 경험','ok',`있음 — ${ty} ${n}건`); sug.type_exp='있음'; }
    else if(!careers.some(c=>cmnSplit(c.project_type).length)){ add('type','프로젝트 유형 경험','unknown','경력에 유형 정보 없음'); sug.type_exp='확인 필요'; }
    else { add('type','프로젝트 유형 경험','warn',`${ty} 경험을 찾지 못함`); sug.type_exp='없음'; } }

  // 5) 필수 기술 n/N
  const must=cmnSplit(line.must_skills);
  if(!must.length) add('skills','필수 기술','none','필수 기술 조건 없음');
  else { const have2=new Set(skills.map(s=>String(s.skill_name||'').trim().toLowerCase()).filter(Boolean));
    const techText=careers.map(c=>String(c.tech||'')+' '+String(c.env||'')).join(' ').toLowerCase();
    const got=must.filter(m=>have2.has(m.toLowerCase())||techText.includes(m.toLowerCase())); const miss=must.filter(m=>!got.includes(m));
    add('skills','필수 기술',got.length===must.length?'ok':(got.length?'warn':'bad'),`${got.length}/${must.length}${miss.length?` — 없음: ${miss.join(', ')}`:''}`); }

  // 6) 가용 시기
  const st=cmnYm(String(req.start_ym||'').slice(0,7)); const av=v.avail||{};
  if(st===null) add('avail','가용 시기','none',`투입 시기 조건 없음 (후보 ${av.text||'-'})`);
  else if(!av.date) add('avail','가용 시기','unknown',`후보 가용 시기 ${av.text||'미정'} — 확인 필요`);
  else { const startDay=String(req.start_ym).slice(0,7)+'-01';
    if(av.date<=startDay) add('avail','가용 시기','ok',`후보 ${av.text} ≤ 투입 ${String(req.start_ym).slice(0,7)}`);
    else add('avail','가용 시기','bad',`후보 가용 ${av.text} — 투입 시기 ${String(req.start_ym).slice(0,7)}보다 늦음`); }

  // 7) 단기 이력
  const sh=v.short||{count:0};
  add('short','단기 이력',sh.count>0?'warn':'ok',sh.count>0?`${sh.count}건 (평균 ${sh.avg_months}개월)`:'없음');

  // 8) 역할 경험 개월 · 최근 수행 시점 · 겸임
  const roles=cmnSplit(line.role_codes);
  if(!roles.length) add('roles','역할 경험','none','역할 조건 없음');
  else { const parts=roles.map(r=>{ const m=cmnRoleMonths(careers,r,asOf);
      const ends=careers.filter(c=>cmnSplit(c.role_codes).includes(r)).map(c=>cmnYm(String(c.end_ym||'').slice(0,7))!==null?String(c.end_ym).slice(0,7):(cmnYes(c.is_current)?String(asOf).slice(0,7):'')).filter(Boolean).sort();
      return {r,m,last:ends[ends.length-1]||''}; });
    let text=parts.map(p=>`${p.r} ${p.m}개월${p.last?` (최근 ${p.last})`:''}`).join(' · ');
    let status=parts.every(p=>p.m>0)?'ok':(parts.some(p=>p.m>0)?'warn':'bad');
    if(roles.length>=2){ const both=careers.some(c=>{ const cs=cmnSplit(c.role_codes); return roles.every(r=>cs.includes(r)); }); text+=both?' · 겸임 직접 경험':' · 겸임 경험 없음(각각 따로)'; if(!both&&status==='ok') status='warn'; }
    add('roles','역할 경험',status,text); }

  // 9) 나이 (연령 조건)
  const amin=parseInt(line.age_min,10), amax=parseInt(line.age_max,10); const hasMin=!isNaN(amin), hasMax=!isNaN(amax);
  const age=v.age||cmnAge(v.person||{},asOf);
  if(!hasMin&&!hasMax) add('age','나이','none',`연령 조건 없음 (후보 ${age.label||'미상'})`);
  else { const cond=`${hasMin?amin:''}~${hasMax?amax:''}세`;
    if(age.kind==='exact'){ const bad=(hasMin&&age.age<amin)||(hasMax&&age.age>amax); add('age','나이',bad?'bad':'ok',bad?`조건 ${cond} 밖 — ${age.label}${hasMax&&age.age>amax?` (상한 ${amax}세 초과)`:` (하한 ${amin}세 미만)`}`:`${age.label} (조건 ${cond})`); }
    else if(age.kind==='range'){ const out=(hasMin&&age.max<amin)||(hasMax&&age.min>amax); const inside=(!hasMin||age.min>=amin)&&(!hasMax||age.max<=amax);
      add('age','나이',out?'bad':(inside?'ok':'warn'),`${age.label} (조건 ${cond})${out?' — 범위 밖':(inside?'':' — 확인 필요')}`); }
    else add('age','나이','unknown',`나이 미상 (조건 ${cond})`); }
  return {items,suggest:sug};
}
