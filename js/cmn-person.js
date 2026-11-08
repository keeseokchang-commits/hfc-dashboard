// HFC cmn-person.js v2.9.81 — STF-CMN-04 후보 파생값 (읽기 전용 · 시트에 쓰지 않음)
// 근거: 프로그램 설계서 §7(SCR-04)·§11(SCR-07)·§12(SCR-08)의 계산 항목, §21(CMN-04), claude/grade-estimation-rule-v0.1(등급 추정, 사용자 승인 2026-10-10)
// 원칙: cmn-derive.js 와 같다 — 화면이 이미 읽은 행 배열과 기준일만 받는다 / 입력이 부족하면 "미상"을 돌려주고 추측하지 않는다 / 시트에 쓰지 않는다.
// 이 파일은 S39를 읽지 않는다(연락처 유무는 cmn-alert.js 의 cmnContactPresence 만 읽는다).
// 의존: cmn-derive.js(날짜·경력·단기·재확인 계산)

const CMN_LEVELS=['주력','가능','보조'];                 // 역할 수준 순서(검색 결과 정렬 기준: 주력 > 가능 > 보조)
const CMN_BASE_ROUTES=new Set(['PTY-001','PTY-002']);     // 직접·내부 — "경유 서치업체 수"에 넣지 않는다
const CMN_DEGREES=['고졸','전문학사','학사','석사','박사'];
const cmnGroup=(list,key)=>{ const m=new Map(); (list||[]).forEach(r=>{ const k=r[key]; if(!m.has(k)) m.set(k,[]); m.get(k).push(r); }); return m; };
const cmnSplit=s=>String(s??'').split(',').map(x=>x.trim()).filter(Boolean);

// ── 구분(화이트/일반/블랙): S29 최신 행. 없으면 일반 ─────────────────────────────
function cmnLatestRating(rows){
  const v=(rows||[]).slice().sort((a,b)=>String(a.rated_at||'').localeCompare(String(b.rated_at||''))||String(a.rating_id||'').localeCompare(String(b.rating_id||'')));
  const last=v[v.length-1]; return last?{flag:String(last.flag||'일반'),reason:last.reason||'',rated_at:last.rated_at||''}:{flag:'일반',reason:'',rated_at:''};
}

// ── 역할: S21 의 역할·수준 + S23 경력으로 역할별 경험 개월(겹친 달은 한 번) ─────────
function cmnRoleMonths(careers,code,asOf){
  const spans=[]; (careers||[]).forEach(c=>{ if(!cmnSplit(c.role_codes).includes(code)) return; const r=cmnCareerSpan(c,asOf); if(r.ok) spans.push(r); });
  return cmnUnionMonths(spans);
}
// 반환 [{code,level,months}] — 수준 순(주력>가능>보조>미정), 같은 수준이면 경험 개월 많은 순
function cmnRoleList(roleRows,careers,asOf){
  const seen=new Set(); const out=[];
  (roleRows||[]).forEach(r=>{ const code=String(r.role_code||'').trim(); if(!code||seen.has(code)) return; seen.add(code);
    out.push({code,level:CMN_LEVELS.includes(r.level)?r.level:'',months:cmnRoleMonths(careers,code,asOf),prole_id:r.prole_id,updated_at:r.updated_at}); });
  const ord=l=>{ const i=CMN_LEVELS.indexOf(l); return i<0?9:i; };
  return out.sort((a,b)=>ord(a.level)-ord(b.level)||b.months-a.months||a.code.localeCompare(b.code));
}
// "PM 주력 · DBA 가능" (수준이 아직 없으면 역할만)
const cmnRoleLabel=list=>list.map(r=>r.level?`${r.code} ${r.level}`:r.code).join(' · ');
// 겸임 경험: 한 경력 줄에 역할이 둘 이상 적힌 경우. {has, combos:['DA+DBA',…], codes:Set}
function cmnMultiRole(careers){
  const combos=new Set(), codes=new Set();
  (careers||[]).forEach(c=>{ const v=[...new Set(cmnSplit(c.role_codes))]; if(v.length>=2){ combos.add(v.slice().sort().join('+')); v.forEach(x=>codes.add(x)); } });
  return {has:combos.size>0,combos:[...combos],codes};
}

// ── 현행 프로젝트 · 가용일 ────────────────────────────────────────────────────
// S25 진행 행(후보당 최대 1). 없으면 이력서의 "진행 중" 줄을 참고 정보(미확인)로만 돌려준다.
function cmnCurrentProject(assigns,careers){
  const a=(assigns||[]).filter(x=>String(x.status??'').trim()==='진행');
  if(a.length){ const x=a.slice().sort((p,q)=>String(q.created_at||'').localeCompare(String(p.created_at||'')))[0];
    return {kind:'assign',client:x.client_name||'',project:x.project_name||'',end_ym:x.end_ym||'',confidence:x.confidence||'',assign_kind:x.assign_kind||'',assign_id:x.assign_id}; }
  const c=(careers||[]).filter(x=>cmnYes(x.is_current)).sort((p,q)=>String(q.start_ym||'').localeCompare(String(p.start_ym||'')))[0];
  if(c) return {kind:'resume',client:c.client_name||c.employer||'',project:c.project_name||'',end_ym:'',confidence:'',assign_kind:''};
  return null;
}
// 가용일: 진행 중 S25 종료 다음 달(월 표기), 없으면 S20.avail_from. 반환 {text,date:'YYYY-MM-DD'|null,kind}
function cmnAvailable(person,assigns,asOf){
  const act=(assigns||[]).filter(x=>String(x.status??'').trim()==='진행');
  if(act.length){
    const ends=act.map(x=>cmnYm(String(x.end_ym||'').slice(0,7))).filter(n=>n!==null);
    if(!ends.length) return {text:'종료 미정',date:null,kind:'open'};
    const ym=cmnYmStr(Math.max(...ends)+1); return {text:ym,date:ym+'-01',kind:'assign'};
  }
  const f=String(person&&person.avail_from||'').trim();
  if(cmnDate(f)) return {text:f,date:f,kind:'avail_from'};
  return {text:'미상',date:null,kind:'unknown'};
}

// ── 경로: S28(이력서 보낸 곳) ∪ S31(추천 경유 업체) ────────────────────────────
// 반환 {latestPartyId, count(서치업체 수), partyIds:[…]} — 직접·내부는 서치업체 수에서 제외
function cmnRouteInfo(files,cands){
  const ids=new Set();
  (files||[]).forEach(f=>{ if(f.source_party_id) ids.add(f.source_party_id); });
  (cands||[]).forEach(c=>{ if(c.via_party_id) ids.add(c.via_party_id); });
  const fs=(files||[]).filter(f=>f.source_party_id).slice().sort((a,b)=>String(b.received_at||'').localeCompare(String(a.received_at||''))||(parseInt(b.version_no)||0)-(parseInt(a.version_no)||0));
  const search=[...ids].filter(x=>!CMN_BASE_ROUTES.has(x));
  return {latestPartyId:fs[0]?fs[0].source_party_id:'',count:search.length,partyIds:[...ids],searchIds:search};
}

// ── 학력·자격 판별(S24) ───────────────────────────────────────────────────────
function cmnDegreeOf(c){
  const t=`${c.name||''} ${c.org||''}`;
  if(/박사/.test(t)) return '박사'; if(/석사/.test(t)) return '석사'; if(/전문학사|전문대|2년제/.test(t)) return '전문학사';
  if(/학사|대졸|학부|대학교\s*졸업/.test(t)) return '학사'; if(/고졸|고등학교/.test(t)) return '고졸'; return '';
}
function cmnCertKindOf(c){
  const t=String(c.name||'');
  if(/기술사/.test(t)) return '기술사'; if(/산업기사/.test(t)) return '산업기사'; if(/기사/.test(t)) return '기사'; return '';
}

// ── 등급 추정(저장하지 않음) — claude/grade-estimation-rule-v0.1 ──────────────────
// rule = S10 grade_rule(JSON). 자격 기준과 학력 기준 중 하나라도 해당하면 그 등급, 둘 다 해당하면 높은 등급. 기준표에 칸이 없는 조합은 "기준없음".
// 해석(2026-10-13 정한 것): ① 학력·자격 각각 "취득/졸업 다음 달부터"의 경력 월(회사재직∪프로젝트 합집합)로 센다 ② 학력 칸은 표의 이름이 같을 때만 맞추되, 초급 칸 "전문학사"는 "전문학사 이상"이므로 학사·석사·박사도 맞춘다
// ③ 학력·자격 하나에 대해 위 등급 중 칸이 없는 등급이 있으면(예: 석사의 고급·중급) 확정하지 않는다(기준없음) — 임의로 채우지 않는다.
function cmnParseGradeRule(v){
  if(v&&typeof v==='object') return v; try{ const j=JSON.parse(String(v||'')); return j&&typeof j==='object'?j:null; }catch(e){ return null; }
}
function cmnExpMonthsAfter(careers,asOf,afterYm){
  const spans=[]; (careers||[]).forEach(c=>{ const r=cmnCareerSpan(c,asOf); if(!r.ok) return; const s=Math.max(r.s,afterYm+1); if(r.e>=s) spans.push({s,e:r.e}); });
  return cmnUnionMonths(spans);
}
function cmnGradeEstimate(careers,certs,rule,asOf){
  const order=['특급','고급','중급','초급']; const grades=(rule&&rule.grades)||{};
  const creds=[];
  (certs||[]).forEach(c=>{
    if(c.kind==='학력'){ const d=cmnDegreeOf(c); if(d) creds.push({type:'edu',key:d,label:`${d} 졸업`,date:c.cert_date}); }
    else if(c.kind==='자격'){ const k=cmnCertKindOf(c); if(k) creds.push({type:'cert',key:k,label:`${c.name||k} 취득`,date:c.cert_date}); }
  });
  if(!creds.length) return {grade:'미상',basis:[],note:'학력·자격 정보가 없어 추정하지 못했습니다.'};
  const defin=[], basis=[];
  creds.forEach(cr=>{
    const ym=cmnYm(cr.date);
    if(ym===null){ basis.push(`${cr.label}: 날짜가 없어 판정하지 못했습니다.`); return; }
    const months=cmnExpMonthsAfter(careers,asOf,ym); const years=Math.round(months/12*10)/10;
    const cell=g=>{ const tbl=(grades[g]||{})[cr.type]||{}; if(Object.prototype.hasOwnProperty.call(tbl,cr.key)) return tbl[cr.key];
      if(cr.type==='edu'&&CMN_DEGREES.indexOf(cr.key)>CMN_DEGREES.indexOf('전문학사')&&Object.prototype.hasOwnProperty.call(tbl,'전문학사')) return tbl['전문학사']; return undefined; };
    let top=null, gap=false, need=null;
    for(const g of order){ const n=cell(g); if(n===undefined||n===null){ if(!top) gap=true; continue; } if(months>=n*12){ top=g; need=n; break; } }
    const head=`${cr.label} ${cr.date}, 경력 ${years}년`;
    if(top&&!gap){ defin.push(top); basis.push(`${head} → ${top} (${cr.key} ${need>0?need+'년 이상':'해당'})`); }
    else basis.push(`${head} → 기준없음 (기준표에 없는 조합이 있어 확정하지 않음)`);
  });
  if(defin.length){ const best=order.find(g=>defin.includes(g)); return {grade:best,basis,note:''}; }
  return {grade:'기준없음',basis,note:''};
}

// ── 합침으로 숨겨진 후보의 이름 → 유지 후보로 연결 (이름 검색용 별칭) ────────────────
// S20 에 별칭 열이 없으므로 없앨 후보 행(merged_into)을 그대로 두고 이름을 따라간다. 반환 Map(유지 후보 id → [이름…])
function cmnPersonAliasMap(persons){
  const m=new Map(); (persons||[]).forEach(p=>{ const t=String(p.merged_into||'').trim(); if(!t) return; if(!m.has(t)) m.set(t,[]); if(p.name) m.get(t).push(p.name); });
  return m;
}
const cmnPersonHidden=p=>!cmnBlank(p.merged_into)||String(p.is_active??'Y').trim()==='N';

// ── 한 번에: 후보 목록용 파생값 ────────────────────────────────────────────────
// data:{persons,roles,skills,careers,assigns,files,ratings,cands,contacts}  presence: cmnContactPresence 의 map 또는 null
// settings:{short_tenure_months,exit_alert_days,reconfirm_days}. 반환 {후보id:뷰}. 숨겨진(합침) 후보는 만들지 않는다.
function cmnPersonViews(data,asOf,settings,presence){
  const st={short_tenure_months:3,exit_alert_days:30,reconfirm_days:90,...(settings||{})};
  const g={roles:cmnGroup(data.roles,'person_id'),skills:cmnGroup(data.skills,'person_id'),careers:cmnGroup(data.careers,'person_id'),assigns:cmnGroup(data.assigns,'person_id'),
    files:cmnGroup(data.files,'person_id'),ratings:cmnGroup(data.ratings,'person_id'),cands:cmnGroup(data.cands,'person_id'),contacts:cmnGroup(data.contacts,'person_id')};
  const alias=cmnPersonAliasMap(data.persons); const out={};
  (data.persons||[]).forEach(p=>{
    if(cmnPersonHidden(p)) return; const id=p.person_id; const get=k=>g[k].get(id)||[];
    const careers=get('careers'), assigns=get('assigns');
    const roles=cmnRoleList(get('roles'),careers,asOf); const multi=cmnMultiRole(careers);
    const yrs=cmnCareerYears(careers,p,asOf); const age=cmnAge(p,asOf); const cur=cmnCurrentProject(assigns,careers); const av=cmnAvailable(p,assigns,asOf);
    const route=cmnRouteInfo(get('files'),get('cands')); const rating=cmnLatestRating(get('ratings')); const short=cmnShortTenure(careers,asOf,st.short_tenure_months);
    const progress=assigns.filter(x=>String(x.status??'').trim()==='진행');
    const exitDue=progress.map(a=>cmnExitDue(a,asOf,st.exit_alert_days)).find(r=>r.due)||null;
    const recon=cmnReconfirm(get('contacts'),asOf,st.reconfirm_days);
    const pending=careers.filter(c=>String(c.review_state??'').trim()==='검토필요').length;
    const review=String(p.review_state??'').trim()==='검토필요'||pending>0;
    const skills=get('skills').slice().sort((a,b)=>({상:0,중:1,하:2}[a.level]??3)-({상:0,중:1,하:2}[b.level]??3)).map(s=>s.skill_name).filter(Boolean);
    const inds={}; careers.forEach(c=>{ if(c.industry) inds[c.industry]=(inds[c.industry]||0)+(parseInt(c.duration_months)||1); });
    const industries=Object.keys(inds).sort((a,b)=>inds[b]-inds[a]);
    const pres=presence===null||presence===undefined?null:(presence[id]||{has:false});
    out[id]={id,person:p,name:p.name||id,aliasNames:alias.get(id)||[],roles,roleLabel:cmnRoleLabel(roles),multi,
      grade:String(p.grade||''),gradeReported:String(p.grade_reported||''),gradeDiff:!!(p.grade&&p.grade_reported&&p.grade!==p.grade_reported),
      age,years:yrs,current:cur,avail:av,route,rating,short,exitDue,recon,pending,review,skills:skills.slice(0,6),industries:industries.slice(0,3),
      contact:pres===null?'unknown':(pres.has?'yes':'no'),
      search:[p.name,p.name_en,...(alias.get(id)||[]),...skills,...Object.keys(inds),...careers.flatMap(c=>[c.client_name,c.project_name,c.employer]),cur&&cur.client,cur&&cur.project,...roles.map(r=>r.code)].filter(Boolean).join(' ').toLowerCase()};
  });
  return out;
}
