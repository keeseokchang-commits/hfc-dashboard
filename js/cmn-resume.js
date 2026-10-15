// HFC cmn-resume.js v2.9.82 — STF-BAT-01 이력서 등록(방식 ①: Claude 가 이력서를 읽어 만든 JSON 을 SCR-06 에서 가져온다)
// 근거: 프로그램 설계서 §8(BAT-01) 처리 로직 4~8단계(동일인 판정·저장·등급 추정·보호 값·개인정보). 읽는 일(추출)만 Claude 가 하고, 시트에 쓰는 규칙은 설계서 그대로 이 파일이 한다.
// 사용자 결정: 2026-10-14 "1 로 가자"(BAT-01 방식 ① 선택).
// JSON 형식(hfc-resume-import/1) — 정한 것 2026-10-14:
//   {"schema":"hfc-resume-import/1","trigger":"수동 파일|수동 폴더(생략 가능)",
//    "resumes":[{"file":{"drive_file_id","file_name","drive_url","file_hash","received_at","source_party_id"},
//      "status":"성공|읽기실패","error":"읽기실패 사유(개인정보 값 금지)",
//      "person":{"name","name_en","birth_date","birth_year","gender","region","grade_reported","career_years_reported","avail_text","avail_from","summary","desired_rate_text","desired_rate"},
//      "private":{"mobile","email","rid_head7"},                       // S39 에만 저장
//      "roles":[{"role_code","level","basis"}], "skills":[{"skill_type","skill_name","level"}],
//      "careers":[{"kind","employer","client_name","project_name","industry","project_type","role_text","role_codes","start_ym","end_ym","is_current","duration_months","duration_basis","duration_text","tasks","env","tech"}],
//      "certs":[{"kind","name","org","cert_date"}]}]}
// 규칙: 파일 해시가 S28 에 있으면 건너뜀(읽기실패였던 파일은 다시 읽은 결과로 그 행을 갱신) / 이름+생년월일(또는 주민번호 앞 7자리)이 같으면 기존 후보 갱신 / 이름만 같으면 새 후보 + 동일인확인 /
//   같은 키(line_key) 줄은 새 값이 orig_json 과 다르고 현재 값과도 다를 때만 pending_json 에 보관 / 사용자가 입력한 값(등급 판정·연차 수기·구분·접촉·현행 프로젝트·연락처)은 바꾸지 않음 / 오류·실행 기록에 개인정보 값을 쓰지 않음.
// 의존: schema.js, common.js, cmn-sheet.js(hrReadMany·hrAppend·hrAppendMany·hrUpdate·hrNextIds·hrNow·hrToday), cmn-derive.js(cmnCareerSpan), cmn-person.js(cmnGradeEstimate·cmnParseGradeRule·cmnPersonHidden), cmn-review.js(CMN_LINE_FIELDS·cmnParseJson)

const CMN_IMPORT_SCHEMA='hfc-resume-import/1';
const CMN_IMPORT_TABS=['S20','S21','S22','S23','S24','S28','S39','S37','S10'];
const CMN_IMPORT_MSG={
  notJson:'JSON 형식이 아닙니다. Claude 가 만든 결과를 그대로 붙여 넣었는지 확인해 주세요.',
  schema:'이력서 읽기 결과 형식이 아닙니다. (schema 가 hfc-resume-import/1 이어야 합니다)',
  empty:'가져올 이력서가 없습니다.',
  read:'시트를 읽지 못해 가져오기를 중단했습니다. 다시 로그인한 뒤 시도해 주세요.',
};
const CMN_GRADES=['특급','고급','중급','초급'];
const cmnNorm=s=>String(s??'').toLowerCase().replace(/주식회사|\(주\)|㈜/g,'').replace(/[\s()\[\]{}.,\-_·ㆍ'"]/g,'');
const cmnTxt=v=>String(v??'').trim();
const cmnYm7=v=>{ const m=/^(\d{4})-(\d{2})/.exec(cmnTxt(v)); return m&&+m[2]>=1&&+m[2]<=12?m[1]+'-'+m[2]:''; };

// 이력 줄 판단 키 — 회사재직은 회사, 프로젝트는 프로젝트명(없으면 고객사) 정규화 + 시작 연-월
function cmnLineKey(c){ const base=c.kind==='회사재직'?(c.employer||''):(c.project_name||c.client_name||c.employer||''); return cmnNorm(base)+'|'+cmnYm7(c.start_ym); }
// 주민번호 앞 7자리 → {birth_date,gender}. 세기: 1·2·5·6=1900, 3·4·7·8=2000, 9·0=1800. 날짜가 맞지 않으면 null
function cmnRidInfo(h7){
  const m=/^(\d{2})(\d{2})(\d{2})(\d)$/.exec(cmnTxt(h7)); if(!m) return null;
  const c={1:1900,2:1900,5:1900,6:1900,3:2000,4:2000,7:2000,8:2000,9:1800,0:1800}[+m[4]]; const y=c+ +m[1];
  const d=new Date(Date.UTC(y,+m[2]-1,+m[3])); if(d.getUTCFullYear()!==y||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3]) return null;
  return {birth_date:`${y}-${m[2]}-${m[3]}`,gender:(+m[4])%2===1?'남':'여'};
}
// 붙여 넣은 글 → {ok,payload,problems[]}. 개인정보 값은 문제 목록에 넣지 않는다(번호·파일 이름만).
function cmnImportParse(text){
  let j; try{ j=JSON.parse(String(text||'').trim()); }catch(e){ return {ok:false,message:CMN_IMPORT_MSG.notJson}; }
  if(!j||typeof j!=='object'||j.schema!==CMN_IMPORT_SCHEMA) return {ok:false,message:CMN_IMPORT_MSG.schema};
  if(!Array.isArray(j.resumes)||!j.resumes.length) return {ok:false,message:CMN_IMPORT_MSG.empty};
  const problems=[];
  j.resumes.forEach((r,i)=>{
    const no=`${i+1}번째`; const f=(r&&r.file)||{};
    if(!r||typeof r!=='object'){ problems.push(`${no}: 형식이 맞지 않습니다.`); return; }
    if(!cmnTxt(f.drive_file_id)) problems.push(`${no}: file.drive_file_id 가 없습니다.`);
    if(!['성공','읽기실패'].includes(r.status)) problems.push(`${no}: status 는 성공 또는 읽기실패여야 합니다.`);
    if(r.status==='성공'&&!(r.person&&cmnTxt(r.person.name))) problems.push(`${no}${f.file_name?` (${f.file_name})`:''}: person.name 이 없습니다. 이름을 읽지 못한 파일은 status 를 읽기실패로 해 주세요.`);
    ['roles','skills','careers','certs'].forEach(k=>{ if(r[k]!==undefined&&!Array.isArray(r[k])) problems.push(`${no}: ${k} 는 목록이어야 합니다.`); });
  });
  return problems.length?{ok:false,message:problems.slice(0,8).join('\n'),problems}:{ok:true,payload:j};
}

// 경력 한 줄을 저장 형식으로 — 월까지만 저장, 개월 수는 시작·종료 월을 모두 포함해 계산(날짜를 모르면 적힌 개월 수)
function cmnImportCareer(c,today){
  const kind=c.kind==='회사재직'?'회사재직':'프로젝트'; const cur=['Y','y',true,'예'].includes(c.is_current)||String(c.is_current).toUpperCase()==='Y';
  const o={kind,employer:cmnTxt(c.employer),client_name:cmnTxt(c.client_name),project_name:cmnTxt(c.project_name),industry:cmnTxt(c.industry),project_type:cmnTxt(c.project_type),role_text:cmnTxt(c.role_text),role_codes:cmnTxt(c.role_codes),
    start_ym:cmnYm7(c.start_ym),end_ym:cur?'':cmnYm7(c.end_ym),is_current:cur?'Y':'N',duration_text:cmnTxt(c.duration_text),tasks:cmnTxt(c.tasks),env:cmnTxt(c.env),tech:cmnTxt(c.tech)};
  const sp=cmnCareerSpan(o,today);
  if(sp.ok){ o.duration_months=sp.e-sp.s+1; o.duration_basis='날짜계산'; }
  else { const dm=parseInt(String(c.duration_months??'').replace(/,/g,''),10); o.duration_months=dm>0?dm:''; o.duration_basis=dm>0?(['기간표기','추정'].includes(c.duration_basis)?c.duration_basis:'기간표기'):''; }
  return o;
}
const cmnOrigOf=o=>Object.fromEntries(CMN_LINE_FIELDS.map(([f])=>[f,String(o[f]??'')]));

// 한 이력서 처리. io = {nextId(k), appendMany(k,objs), update(k,id,changes,row)} (진짜 쓰기 또는 미리보기용). 상태 st 를 함께 갱신해 같은 묶음의 다음 이력서가 앞의 결과를 본다.
async function cmnImportOne(st,res,io,runId){
  const f=res.file||{}; const today=st.today; const out={file:cmnTxt(f.file_name)||cmnTxt(f.drive_file_id),action:'',notes:[],cnt:{new:0,updated:0,review:0,fail:0},name:''};
  const S=k=>st.tabs[k];
  const prior=S('S28').find(x=>(cmnTxt(f.file_hash)&&x.file_hash===f.file_hash)||x.drive_file_id===f.drive_file_id);
  if(prior&&prior.parse_status!=='읽기실패'){
    out.action='건너뜀'; out.notes.push('이미 읽은 파일입니다.');
    // 예외(사용자 승인 2026-10-15): 건너뛰는 파일이라도 비어 있던 역할 근거(빈 칸·옛 표시 '이력서')와 비어 있던 요약만 채운다. 그 밖의 값은 건드리지 않는다.
    let pid=cmnTxt(prior.person_id); const pers=x=>S('S20').find(y=>y.person_id===x); for(let i=0;i<5&&pid&&pers(pid)&&cmnTxt(pers(pid).merged_into);i++) pid=cmnTxt(pers(pid).merged_into);
    const per=pid&&pers(pid); let filled=0;
    if(per){
      for(const r of (res.roles||[])){ const code=cmnTxt(r.role_code), basis=String(r.basis??'').trim().slice(0,1000); if(!code||!basis) continue; const row=S('S21').find(x=>x.person_id===pid&&x.role_code===code); if(!row) continue; const cur=cmnTxt(row.evidence); if(cur===''||cur==='이력서'){ await io.update('S21',row.prole_id,{evidence:basis},row); filled++; } }
      const sm=cmnTxt((res.person||{}).summary); if(sm&&cmnBlank(per.summary)){ await io.update('S20',pid,{summary:sm},per); filled++; }
    }
    if(filled) out.notes.push(`비어 있던 근거·요약 ${filled}건을 채웠습니다.`);
    return out;
  }
  const fileBase={drive_file_id:cmnTxt(f.drive_file_id),file_name:cmnTxt(f.file_name),drive_url:cmnTxt(f.drive_url),file_hash:cmnTxt(f.file_hash),source_party_id:cmnTxt(f.source_party_id),received_at:cmnTxt(f.received_at)||today,run_id:runId||'',parsed_at:today};
  const writeFile=async(extra,id)=>{ const rec={...fileBase,...extra}; if(prior){ await io.update('S28',prior.file_id,rec,prior); return prior.file_id; } const ids=await io.appendMany('S28',[{...(id?{file_id:id}:{}),...rec}]); return ids[0]; };
  if(res.status==='읽기실패'){
    await writeFile({parse_status:'읽기실패',parse_error:cmnTxt(res.error).slice(0,200)||'읽지 못했습니다.',person_id:'',version_no:'',match_person_id:''});
    out.action='실패'; out.cnt.fail=1; out.notes.push(cmnTxt(res.error).slice(0,200)||'읽지 못했습니다.'); return out;
  }
  const p=res.person||{}, pr=res.private||{}; out.name=cmnTxt(p.name);
  const rid=cmnRidInfo(pr.rid_head7); const birthGiven=/^\d{4}-\d{2}-\d{2}$/.test(cmnTxt(p.birth_date))&&!isNaN(Date.parse(p.birth_date))?cmnTxt(p.birth_date):'';
  const birth=birthGiven||(rid?rid.birth_date:''); const birthSrc=birthGiven?'이력서':(rid?'주민번호':'');
  const gender=['남','여'].includes(p.gender)?p.gender:(rid?rid.gender:'');
  const codes=st.codes, warn=new Set();
  const okRole=c=>{ if(!codes.role.length||codes.role.includes(c)) return true; warn.add('목록에 없는 역할 코드를 제외했습니다.'); return false; };
  const roles=(res.roles||[]).map(r=>({role_code:cmnTxt(r.role_code),level:CMN_LEVELS.includes(r.level)?r.level:'가능',basis:String(r.basis??'').trim().slice(0,1000)})).filter(r=>r.role_code&&okRole(r.role_code));
  const skills=(res.skills||[]).map(s=>({skill_type:['DBMS','언어','도구','업무도메인'].includes(s.skill_type)?s.skill_type:'도구',skill_name:cmnTxt(s.skill_name),level:['상','중','하'].includes(s.level)?s.level:'중'})).filter(s=>s.skill_name);
  const careers=(res.careers||[]).map(c=>{ const o=cmnImportCareer(c,today);
    o.role_codes=cmnSplit(o.role_codes).filter(okRole).join(',');
    if(o.industry&&codes.industry.length&&!codes.industry.includes(o.industry)){ warn.add('목록에 없는 업종 값을 비웠습니다.'); o.industry=''; }
    if(o.project_type){ const keep=cmnSplit(o.project_type).filter(x=>!codes.project_type.length||codes.project_type.includes(x)); if(keep.length!==cmnSplit(o.project_type).length) warn.add('목록에 없는 프로젝트 유형 값을 제외했습니다.'); o.project_type=keep.join(','); }
    o.line_key=cmnLineKey(o); return o; });
  const certs=(res.certs||[]).map(c=>({kind:['학력','자격','교육'].includes(c.kind)?c.kind:'자격',name:cmnTxt(c.name),org:cmnTxt(c.org),cert_date:cmnYm7(c.cert_date)})).filter(c=>c.name);
  // 동일인 판정
  const nm=cmnNorm(p.name); const same=S('S20').filter(x=>!cmnPersonHidden(x)&&cmnNorm(x.name)===nm).sort((a,b)=>a.person_id.localeCompare(b.person_id));
  const h7=cmnTxt(pr.rid_head7);
  const exact=same.find(x=>(birth&&x.birth_date===birth)||(h7&&S('S39').some(t=>t.person_id===x.person_id&&cmnTxt(t.rid_head7)===h7)));
  const gradeRep=CMN_GRADES.includes(p.grade_reported)?p.grade_reported:'';
  const reviewNeeded=(allCareers,allCerts,finalGrade)=>{ const est=cmnGradeEstimate(allCareers,allCerts,st.rule,today).grade; const known=[...new Set([est,gradeRep,finalGrade].filter(g=>CMN_GRADES.includes(g)))]; return known.length>1; };
  const fileId=prior?prior.file_id:await io.nextId('S28');
  const years=cmnTxt(p.career_years_reported);
  if(!exact){
    // 신규 후보 (이름만 같은 후보가 있으면 동일인확인으로 표시해 사람이 판단)
    const dup=same.length?same[0]:null;
    const rec={name:cmnTxt(p.name),name_en:cmnTxt(p.name_en),birth_date:birth,birth_year:birth?'':(/^\d{4}$/.test(cmnTxt(p.birth_year))?cmnTxt(p.birth_year):''),birth_precision:birth?'일':(/^\d{4}$/.test(cmnTxt(p.birth_year))?'연도추정':'미상'),birth_source:birth?birthSrc:'',
      gender,region:cmnTxt(p.region),grade_reported:gradeRep,career_years_reported:years,avail_text:cmnTxt(p.avail_text),avail_from:/^\d{4}-\d{2}-\d{2}$/.test(cmnTxt(p.avail_from))?cmnTxt(p.avail_from):'',summary:cmnTxt(p.summary),desired_rate_text:cmnTxt(p.desired_rate_text),desired_rate:cmnTxt(p.desired_rate),
      review_state:reviewNeeded(careers,certs,'')?'검토필요':'확정',is_active:'Y'};
    const pid=(await io.appendMany('S20',[rec]))[0];
    await io.appendMany('S21',roles.map(r=>({person_id:pid,role_code:r.role_code,level:r.level,evidence:r.basis||''})));
    await io.appendMany('S22',skills.map(s=>({person_id:pid,...s})));
    await io.appendMany('S23',careers.map(c=>({person_id:pid,...c,origin:'resume',file_id:fileId,review_state:'확정',orig_json:JSON.stringify(cmnOrigOf(c))})));
    await io.appendMany('S24',certs.map(c=>({person_id:pid,...c})));
    if(cmnTxt(pr.mobile)||cmnTxt(pr.email)||h7) await io.appendMany('S39',[{person_id:pid,rid_head7:h7,mobile:cmnTxt(pr.mobile),email:cmnTxt(pr.email),contact_source:'이력서 기재',contact_acquired_at:(cmnTxt(pr.mobile)||cmnTxt(pr.email))?today:''}]);
    await writeFile({person_id:pid,version_no:1,parse_status:dup?'동일인확인':'성공',parse_error:'',match_person_id:dup?dup.person_id:''},fileId);
    out.cnt.new=1; if(dup){ out.cnt.review=1; out.action='신규(같은 사람 확인 필요)'; out.notes.push('이름이 같은 기존 후보가 있어 같은 사람인지 확인이 필요합니다.'); } else out.action='신규';
    out.person_id=pid; warn.forEach(w=>out.notes.push(w)); return out;
  }
  // 기존 후보 갱신
  const pid=exact.person_id; let changed=false, pendingN=0;
  const myFiles=S('S28').filter(x=>x.person_id===pid&&x!==prior); const ver=Math.max(0,...myFiles.map(x=>parseInt(x.version_no)||0))+1;
  // 후보 기본 정보: 빈 칸만 채우고, 이력서에서 오는 값(기재 등급·기재 연차)은 새 값으로. 사용자가 입력한 값은 건드리지 않는다.
  const ch={}; const fill=(c,v)=>{ if(v!==''&&cmnBlank(exact[c])) ch[c]=v; };
  fill('name_en',cmnTxt(p.name_en)); fill('gender',gender); fill('region',cmnTxt(p.region)); fill('avail_text',cmnTxt(p.avail_text)); fill('summary',cmnTxt(p.summary)); fill('desired_rate_text',cmnTxt(p.desired_rate_text));
  if(birth&&cmnBlank(exact.birth_date)){ ch.birth_date=birth; ch.birth_precision='일'; ch.birth_source=birthSrc; }
  if(gradeRep&&exact.grade_reported!==gradeRep) ch.grade_reported=gradeRep;
  if(years!==''&&String(exact.career_years_reported??'')!==years) ch.career_years_reported=years;
  // 역할·기술·자격: 없는 것만 추가(수준 확정은 사용자)
  const haveRole=new Set(S('S21').filter(x=>x.person_id===pid).map(x=>x.role_code)); const newRoles=roles.filter(r=>!haveRole.has(r.role_code));
  const haveSkill=new Set(S('S22').filter(x=>x.person_id===pid).map(x=>cmnNorm(x.skill_name))); const newSkills=skills.filter((s,i,a)=>!haveSkill.has(cmnNorm(s.skill_name))&&a.findIndex(y=>cmnNorm(y.skill_name)===cmnNorm(s.skill_name))===i);
  const haveCert=new Set(S('S24').filter(x=>x.person_id===pid).map(x=>x.kind+'|'+cmnNorm(x.name))); const newCerts=certs.filter(c=>!haveCert.has(c.kind+'|'+cmnNorm(c.name)));
  // 경력: 같은 키 줄은 orig_json 과 비교해 다르고 현재 값과도 다르면 보류
  const mineC=S('S23').filter(x=>x.person_id===pid); const addC=[]; const updC=[];
  careers.forEach(c=>{
    const row=mineC.find(x=>cmnTxt(x.line_key)===c.line_key);
    if(!row){ if(!addC.some(a=>a.line_key===c.line_key)) addC.push(c); return; }
    const orig=cmnParseJson(row.orig_json)||{}; const pend=cmnParseJson(row.pending_json)||{}; const vals={...(pend.values||{})};
    CMN_LINE_FIELDS.forEach(([fl])=>{ if(!Object.prototype.hasOwnProperty.call(orig,fl)) return; const nv=String(c[fl]??''), ov=String(orig[fl]??''), cv=String(row[fl]??''); if(nv!==ov&&nv!==cv) vals[fl]=nv; });
    if(Object.keys(vals).length&&JSON.stringify(vals)!==JSON.stringify(pend.values||{})) updC.push({row,vals});
  });
  pendingN=updC.length;
  const allC=[...mineC,...addC], allCert=[...S('S24').filter(x=>x.person_id===pid),...newCerts];
  const finalGrade=ch.grade!==undefined?ch.grade:exact.grade; const repAfter=ch.grade_reported!==undefined?ch.grade_reported:exact.grade_reported;
  const est=cmnGradeEstimate(allC,allCert,st.rule,today).grade; const known=[...new Set([est,repAfter,finalGrade].filter(g=>CMN_GRADES.includes(g)))];
  if((known.length>1||pendingN)&&String(exact.review_state||'').trim()!=='검토필요') ch.review_state='검토필요';
  if(Object.keys(ch).length){ await io.update('S20',pid,ch,exact); changed=true; }
  if(newRoles.length){ await io.appendMany('S21',newRoles.map(r=>({person_id:pid,role_code:r.role_code,level:r.level,evidence:r.basis||''}))); changed=true; }
  // 이미 있는 역할: 근거가 비어 있거나 옛 표시('이력서')뿐이면 새 근거를 채운다. 수준과 사용자가 쓴 근거는 바꾸지 않는다.
  for(const r of roles){ if(!r.basis) continue; const row=S('S21').find(x=>x.person_id===pid&&x.role_code===r.role_code); if(!row) continue; const cur=cmnTxt(row.evidence); if(cur===''||cur==='이력서'){ await io.update('S21',row.prole_id,{evidence:r.basis},row); changed=true; } }
  if(newSkills.length){ await io.appendMany('S22',newSkills.map(s=>({person_id:pid,...s}))); changed=true; }
  if(newCerts.length){ await io.appendMany('S24',newCerts.map(c=>({person_id:pid,...c}))); changed=true; }
  if(addC.length){ await io.appendMany('S23',addC.map(c=>({person_id:pid,...c,origin:'resume',file_id:fileId,review_state:'확정',orig_json:JSON.stringify(cmnOrigOf(c))}))); changed=true; }
  for(const u of updC){ await io.update('S23',u.row.career_id,{pending_json:JSON.stringify({file_id:fileId,values:u.vals}),review_state:'검토필요'},u.row); changed=true; }
  // 연락처: 빈 칸만 채움
  const t39=S('S39').find(x=>x.person_id===pid);
  if(cmnTxt(pr.mobile)||cmnTxt(pr.email)||h7){
    if(!t39) await io.appendMany('S39',[{person_id:pid,rid_head7:h7,mobile:cmnTxt(pr.mobile),email:cmnTxt(pr.email),contact_source:'이력서 기재',contact_acquired_at:(cmnTxt(pr.mobile)||cmnTxt(pr.email))?today:''}]);
    else { const c39={}; [['rid_head7',h7],['mobile',cmnTxt(pr.mobile)],['email',cmnTxt(pr.email)]].forEach(([c,v])=>{ if(v&&cmnBlank(t39[c])) c39[c]=v; });
      if(Object.keys(c39).length){ if((c39.mobile||c39.email)&&cmnBlank(t39.contact_acquired_at)){ c39.contact_acquired_at=today; if(cmnBlank(t39.contact_source)) c39.contact_source='이력서 기재'; } await io.update('S39',pid,c39,t39); changed=true; } }
  }
  await writeFile({person_id:pid,version_no:ver,parse_status:pendingN?'검토필요':'성공',parse_error:'',match_person_id:''},fileId);
  if(changed) out.cnt.updated=1; if(pendingN) out.cnt.review=1;
  out.action=pendingN?'갱신(변경 검토 필요)':(changed?'갱신':'변경 없음'); if(pendingN) out.notes.push(`변경 검토 ${pendingN}건`); out.person_id=pid; warn.forEach(w=>out.notes.push(w));
  return out;
}

// 쓰기 담당 — 진짜 시트에 쓰는 것과 미리보기(쓰지 않음)
function cmnImportIo(st,dry){
  let seq=0;
  const add=(k,rec)=>{ const row={...rec,updated_at:rec.updated_at||hrNow()}; st.tabs[k].push(row); return row; };
  const idOf=(k,row)=>row[HEADERS[k][0]];
  if(dry) return {
    nextId:async k=>`DRY-${k}-${++seq}`,
    appendMany:async(k,objs)=>objs.map(o=>{ const idn=HEADERS[k][0]; const r=add(k,{...o,[idn]:o[idn]||`DRY-${k}-${++seq}`}); return idOf(k,r); }),
    update:async(k,id,ch,row)=>{ Object.assign(row,ch); },
  };
  return {
    nextId:async k=>{ const n=await hrNextIds(k,1); if(!n.ok) throw new Error(n.message||HR_MSG.noId); return n.ids[0]; },
    appendMany:async(k,objs)=>{ if(!objs.length) return []; const r=await hrAppendMany(k,objs); if(!r.ok) throw new Error(r.message||HR_MSG.write); r.rows.forEach(x=>st.tabs[k].push(x)); return r.ids; },
    update:async(k,id,ch,row)=>{
      const r=await hrUpdate(k,id,ch,{readUpdatedAt:row.updated_at}); if(!r.ok) throw new Error(r.message||HR_MSG.write);
      Object.assign(row,ch); if(r.updated_at) row.updated_at=r.updated_at; },
  };
}
function cmnImportState(r){
  const T=k=>r.tabs[k].rows; const rows=T('S10'); const codes={role:[],industry:[],project_type:[]};
  rows.forEach(x=>{ const cat=cmnTxt(x.category), key=cmnTxt(x.setting_key); if(key&&codes[cat]) codes[cat].push(key); });
  const rr=rows.find(x=>cmnTxt(x.setting_key)==='grade_rule');
  return {tabs:Object.fromEntries(['S20','S21','S22','S23','S24','S28','S39'].map(k=>[k,T(k).map(x=>({...x}))])),codes,rule:rr?cmnParseGradeRule(rr.setting_value):null,today:hrToday(),s37:T('S37')};
}
// 가져오기. opts.dry=true 면 쓰지 않고 결과만 계산한다. 반환 {ok,dry,results[],cnt,stopped?,message?}
async function cmnImportRun(payload,opts={}){
  const dry=!!opts.dry; const r=await hrReadMany(CMN_IMPORT_TABS);
  if(r.failed.length) return {ok:false,message:CMN_IMPORT_MSG.read};
  const st=cmnImportState(r); const io=cmnImportIo(st,dry); const resumes=payload.resumes;
  let runId='', runRow=null; const open=st.s37.filter(x=>cmnTxt(x.state)==='요청됨').sort((a,b)=>String(a.requested_at).localeCompare(String(b.requested_at))||String(a.run_id).localeCompare(String(b.run_id)));
  const now=hrNow();
  if(!dry){
    try{
      if(open.length){ runRow=open[0]; runId=runRow.run_id; const u=await hrUpdate('S37',runId,{state:'실행 중',started_at:now},{readUpdatedAt:runRow.updated_at}); if(!u.ok) throw new Error(u.message); }
      else { const a=await hrAppend('S37',{trigger:['수동 파일','수동 폴더'].includes(payload.trigger)?payload.trigger:(resumes.length===1?'수동 파일':'수동 폴더'),target_ref:'JSON 가져오기',requested_at:now,started_at:now,state:'실행 중'}); if(!a.ok) throw new Error(a.message); runId=a.id; }
    }catch(e){ return {ok:false,message:e.message||HR_MSG.write}; }
  }
  const results=[]; const cnt={new:0,updated:0,review:0,fail:0}; let stopped=null;
  for(let i=0;i<resumes.length;i++){
    try{ const o=await cmnImportOne(st,resumes[i],io,runId); results.push(o); Object.keys(cnt).forEach(k=>{ cnt[k]+=o.cnt[k]; }); }
    catch(e){ const f=resumes[i].file||{}; results.push({file:cmnTxt(f.file_name)||cmnTxt(f.drive_file_id),action:'중단',notes:[e.message||HR_MSG.write],cnt:{new:0,updated:0,review:0,fail:0}}); stopped=e.message||HR_MSG.write; cnt.fail++; break; }
  }
  if(!dry){
    const fin={state:stopped?'실패':'완료',finished_at:hrNow(),cnt_new:cnt.new,cnt_updated:cnt.updated,cnt_review:cnt.review,cnt_fail:cnt.fail,error:stopped?String(stopped).slice(0,200):''};
    const cur=await hrReadMany(['S37']); const row=cur.failed.length?null:cur.tabs.S37.rows.find(x=>x.run_id===runId);
    if(row){ await hrUpdate('S37',runId,fin,{readUpdatedAt:row.updated_at}); }
    // 같은 가져오기로 함께 처리된 나머지 "요청됨" 은 완료로 닫는다(요청 건수만큼 다시 눌러야 하는 일을 막는다)
    for(const o of open.slice(1)){ const c2=await hrReadMany(['S37']); const rw=c2.failed.length?null:c2.tabs.S37.rows.find(x=>x.run_id===o.run_id); if(rw&&cmnTxt(rw.state)==='요청됨') await hrUpdate('S37',o.run_id,{state:'완료',finished_at:hrNow(),error:'다른 가져오기와 함께 처리됨'},{readUpdatedAt:rw.updated_at}); }
  }
  return {ok:!stopped,dry,results,cnt,stopped,message:stopped||'',runId};
}
