// 선행 공통 기능 시험: STF-CMN-01 / CMN-02 / CMN-03 (프로그램 설계서 §18.7, §19.7, §20.7의 시험 케이스)
const {makeEnv,runTests,eq,ok}=require('./harness.js');
const TODAY=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);

// 탭을 모의 시트에 미리 만들어 둔다(정의된 헤더·격자 크기 그대로)
function seed(env,k,objs=[]){
  const T=env.run('HR_TABS')[k], H=env.run('HEADERS')[k];
  env.mock.addTab(T.tab,H,objs.map(o=>H.map(h=>o[h]??'')),{rowCount:T.rows,colCount:H.length,frozen:1});
}
const S26=(n,extra={})=>({contact_id:'CT-'+String(n).padStart(6,'0'),person_id:'PSN-0001',contact_date:'2026-09-01',type:'통화',direction:'발신',summary:'요약'+n,created_at:'2026-09-01',updated_at:'2026-09-01',...extra});
const col=(env,k,name)=>env.run('HEADERS')[k].indexOf(name)+1;
const cell=(env,k,row,name)=>{ const s=env.mock.tab(env.run('HR_TABS')[k].tab); return (s.cells[row-1]||[])[col(env,k,name)-1]; };
const tests=[];
const T=(id,desc,fn)=>tests.push([id,desc,fn]);

// ───────── 정의(schema.js) 점검 ─────────
T('SCHEMA-01','신규 탭 18개의 읽기·쓰기 범위가 DB 물리 설계 §3 표와 같다',async()=>{
  const env=makeEnv(); const R=env.run('R'),W=env.run('W');
  const exp={S27:['S27_PARTY','A1:I200','A:I'],S36:['S36_PARTY_CONTACT','A1:L600','A:L'],S32:['S32_REQUEST','A1:R800','A:R'],S33:['S33_REQUEST_LINE','A1:Q1400','A:Q'],
    S34:['S34_SEARCH_ORDER','A1:M2400','A:M'],S31:['S31_CANDIDACY','A1:Z5000','A:Z'],S38:['S38_CAND_STAGE_LOG','A1:F20000','A:F'],S20:['S20_PERSON','A1:Z1000','A:Z'],
    S39:['S39_PERSON_PRIVATE','A1:H1000','A:H'],S21:['S21_PERSON_ROLE','A1:G3000','A:G'],S22:['S22_PERSON_SKILL','A1:G10000','A:G'],S24:['S24_PERSON_CERT','A1:H4000','A:H'],
    S23:['S23_PERSON_CAREER','A1:AD16000','A:AD'],S25:['S25_ASSIGNMENT','A1:R3000','A:R'],S26:['S26_CONTACT_LOG','A1:L6000','A:L'],S28:['S28_PERSON_FILE','A1:O3000','A:O'],
    S29:['S29_RATING','A1:F1200','A:F'],S37:['S37_AGENT_RUN','A1:L4000','A:L']};
  eq(Object.keys(exp).length,18); for(const k in exp){ eq([R[k][0],R[k][1],W[k][1]],exp[k],k); }
});
T('SCHEMA-02','기존 탭 정의(S01~S17)와 겹치지 않고, 열 이름이 탭 안에서 중복되지 않는다',async()=>{
  const env=makeEnv(); const H=env.run('HEADERS'); const R=env.run('R');
  const old=['S01','S02','S03','S04','S05','S06','S07','S16','S08','S08_DETAIL','S09','S10','S11','S12','S13','S14','S17'];
  const oldTabs=new Set(old.map(k=>R[k][0]));
  env.run('HR_ORDER').forEach(k=>{ ok(!oldTabs.has(R[k][0]),'탭 이름 겹침 '+k); eq(new Set(H[k]).size,H[k].length,'열 이름 중복 '+k); });
});
T('SCHEMA-03','소수 한 자리 경력 연수는 저장 변환에서 정수로 잘리지 않는다',async()=>{
  const env=makeEnv(); const v=env.run("rowsFor(['career_years_reported','career_years_manual','desired_rate','cnt_new'],[{career_years_reported:'7.5',career_years_manual:'',desired_rate:'7,000,000'}])[0]");
  eq(Array.from(v),[7.5,'',7000000,0]);
});

// ───────── CMN-01 시트 읽기·쓰기 ─────────
T('TC-CMN01-01','여러 탭 읽기 — 3개 탭을 한 번의 호출로 읽는다',async()=>{
  const env=makeEnv(); ['S32','S33'].forEach(k=>seed(env,k,[])); seed(env,'S27',[{party_id:'PTY-001',name:'직접',roles:'경로',is_active:'Y'}]);
  const r=await env.run("hrReadMany(['S32','S33','S27'])");
  eq(r.calls,1,'호출 횟수'); eq(r.failed.length,0); eq(r.tabs.S27.rows.length,1); eq(r.tabs.S27.rows[0].name,'직접'); eq(r.tabs.S27.rows[0]._row,2);
  eq(Array.from(r.tabs.S32.headers),Array.from(env.run("HEADERS.S32")));
});
T('TC-CMN01-02','읽기 실패 — 실패한 탭만 실패로 표시하고, 그 탭 쓰기는 중단한다',async()=>{
  const env=makeEnv(); env.login(); ['S32','S33'].forEach(k=>seed(env,k,[])); // S34 탭 없음
  const r=await env.run("hrReadMany(['S32','S34','S33'])");
  eq(Array.from(r.failed),['S34']); ok(r.tabs.S32.ok&&r.tabs.S33.ok,'다른 탭은 정상'); ok(!r.tabs.S34.ok); ok(r.tabs.S34.message.includes('S34_SEARCH_ORDER 탭을 읽을 수 없어 저장을 중단했습니다.'),r.tabs.S34.message);
  const w=await env.run("hrAppend('S34',{request_id:'REQ-2026-001'})"); ok(!w.ok&&w.message.includes('읽을 수 없어 저장을 중단'),'쓰기 중단');
  eq(env.mock.tab('S34_SEARCH_ORDER'),undefined,'탭이 만들어지지 않음');
});
T('TC-CMN01-03','행 추가 — 마지막 행 다음에 한 줄 추가, 다른 행은 변하지 않는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1),S26(2)]);
  const before=JSON.stringify(env.mock.tab('S26_CONTACT_LOG').cells);
  const a=await env.run("hrAppend('S26',{person_id:'PSN-0007',contact_date:'2026-10-12',type:'미팅',direction:'수신',summary:'신규'})");
  ok(a.ok,a.message); eq(a.id,'CT-000003'); eq(a.row,4);
  const cells=env.mock.tab('S26_CONTACT_LOG').cells; eq(JSON.stringify(cells.slice(0,3)),JSON.stringify(JSON.parse(before).slice(0,3)),'기존 행 불변');
  eq(cell(env,'S26',4,'contact_id'),'CT-000003'); eq(cell(env,'S26',4,'created_at'),TODAY); eq(cell(env,'S26',4,'updated_at'),TODAY,'수정일시=등록일');
});
T('TC-CMN01-04','행 수정 — 그 행만 바뀌고 수정일시가 갱신된다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1),S26(2),S26(3)]);
  const snap=JSON.stringify(env.mock.tab('S26_CONTACT_LOG').cells);
  const u=await env.run("hrUpdate('S26','CT-000002',{summary:'고친 내용',feedback:'피드백'},{readUpdatedAt:'2026-09-01'})");
  ok(u.ok,u.message); eq(u.row,3); eq(cell(env,'S26',3,'summary'),'고친 내용'); eq(cell(env,'S26',3,'feedback'),'피드백'); eq(cell(env,'S26',3,'updated_at'),TODAY);
  const after=env.mock.tab('S26_CONTACT_LOG').cells, was=JSON.parse(snap);
  eq(JSON.stringify(after[0]),JSON.stringify(was[0])); eq(JSON.stringify(after[1]),JSON.stringify(was[1])); eq(JSON.stringify(after[3]),JSON.stringify(was[3]),'다른 행 불변');
  eq(cell(env,'S26',3,'person_id'),'PSN-0001','수정하지 않은 열 불변');
});
T('TC-CMN01-05','수정 충돌 — 화면 A가 읽은 뒤 B가 같은 행을 고치면 A의 저장은 거부된다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1)]);
  const read=await env.run("hrReadMany(['S26'])"); const rowA=read.tabs.S26.rows[0];                       // A: 읽음
  const b=await env.run("hrUpdate('S26','CT-000001',{summary:'B가 고침'},{readUpdatedAt:'2026-09-01'})"); ok(b.ok,'B 저장');   // B: 수정(수정일시가 오늘로 바뀜)
  const a=await env.run(`hrUpdate('S26','CT-000001',{summary:'A가 고침'},{readUpdatedAt:${JSON.stringify(rowA.updated_at)},readRow:${JSON.stringify(rowA)}})`);
  ok(!a.ok&&a.code==='CONFLICT','충돌 거부'); eq(a.message,'다른 곳에서 수정되었습니다. 다시 불러온 뒤 수정해 주세요.'); eq(cell(env,'S26',2,'summary'),'B가 고침','B의 수정이 유지됨');
});
T('TC-CMN01-05b','같은 날 두 번 수정 — 수정일시(날짜)만으로는 못 잡고, 읽은 행 내용을 함께 비교해야 잡는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1,{created_at:TODAY,updated_at:TODAY})]);
  const rowA=(await env.run("hrReadMany(['S26'])")).tabs.S26.rows[0];
  env.mock.set('S26_CONTACT_LOG',2,col(env,'S26','summary'),'B가 같은 날 고침');                       // 수정일시는 그대로(오늘)
  const only=await env.run(`hrUpdate('S26','CT-000001',{feedback:'수정일시만 비교'},{readUpdatedAt:${JSON.stringify(rowA.updated_at)}})`);
  ok(only.ok,'수정일시만 비교하면 통과해 버림(설계서 방식의 한계)');
  const env2=makeEnv(); env2.login(); seed(env2,'S26',[S26(1,{created_at:TODAY,updated_at:TODAY})]);
  const rowA2=(await env2.run("hrReadMany(['S26'])")).tabs.S26.rows[0];
  env2.mock.set('S26_CONTACT_LOG',2,col(env2,'S26','summary'),'B가 같은 날 고침');
  const both=await env2.run(`hrUpdate('S26','CT-000001',{feedback:'행 내용도 비교'},{readUpdatedAt:${JSON.stringify(rowA2.updated_at)},readRow:${JSON.stringify(rowA2)}})`);
  ok(!both.ok&&both.code==='CONFLICT','행 내용까지 비교하면 거부');
});
T('TC-CMN01-06','행 삭제 — 해당 행만 삭제되고 아래 행이 당겨진다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1),S26(2),S26(3)]);
  const d=await env.run("hrDelete('S26','CT-000002')"); ok(d.ok,d.message);
  const r=await env.run("hrReadMany(['S26'])"); eq(r.tabs.S26.rows.map(x=>x.contact_id),['CT-000001','CT-000003']); eq(r.tabs.S26.rows[1]._row,3,'아래 행이 당겨짐');
});
T('TC-CMN01-07','삭제를 허용하지 않은 탭 — 실행 안 되고 시트 호출도 없다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S31',[{cand_id:'CND-00001',line_id:'LN-0001',person_id:'PSN-0001',via_party_id:'PTY-001',stage:'추천수령',created_at:'2026-10-01',updated_at:'2026-10-01'}]);
  const n=env.mock.log.length; const d=await env.run("hrDelete('S31','CND-00001')");
  ok(!d.ok&&d.code==='NOT_ALLOWED','거절'); eq(env.mock.log.length,n,'네트워크 호출 없음'); eq(cell(env,'S31',2,'cand_id'),'CND-00001','행 그대로');
});
T('TC-CMN01-08','값 그대로 저장 — 연-월·전화번호가 날짜·숫자로 바뀌지 않는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S25',[]); seed(env,'S39',[]);
  const a=await env.run("hrAppend('S25',{person_id:'PSN-0001',assign_kind:'외부 투입',start_ym:'2026-07',end_ym:'2026-12',confidence:'확정',status:'진행',load_pct:'100'})"); ok(a.ok,a.message);
  const b=await env.run("hrAppend('S39',{person_id:'PSN-0001',rid_head7:'0001011',mobile:'010-0000-0000'})"); ok(b.ok,b.message);
  eq(cell(env,'S25',2,'start_ym'),'2026-07'); eq(cell(env,'S39',2,'rid_head7'),'0001011','앞자리 0 보존'); eq(cell(env,'S39',2,'mobile'),'010-0000-0000');
  eq(typeof cell(env,'S25',2,'load_pct'),'number','숫자 열은 숫자로');
});
T('CMN01-쓰기실패','쓰기 실패 — 1회 재시도 후 안내, 일시 오류는 재시도로 성공',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1)]);
  env.mock.failNext(/POST .*append/,503,1); const a=await env.run("hrAppend('S26',{person_id:'PSN-0002'})"); ok(a.ok,'재시도 성공'); eq(a.id,'CT-000002');
  env.mock.failNext(/POST .*append/,503,2); const b=await env.run("hrAppend('S26',{person_id:'PSN-0003'})");
  ok(!b.ok&&b.code==='WRITE_FAIL'&&b.message==='저장에 실패했습니다. 로그인 상태를 확인해 주세요.','두 번 실패하면 안내');
  eq(env.run("hrReadIds('S26')") && (await env.run("hrReadIds('S26')")).length,2,'실패한 건은 시트에 없음');
});
T('CMN01-중복방지','요청은 반영됐는데 응답이 오류로 온 경우 — 재시도해도 같은 번호가 두 번 쓰이지 않는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1)]);
  env.mock.failNext(/POST .*append/,503,1,true);   // 첫 요청은 시트에 반영되지만 503 응답
  const a=await env.run("hrAppend('S26',{person_id:'PSN-0002'})"); ok(a.ok,a.message);
  const ids=(await env.run("hrReadIds('S26')")).map(x=>x.id); eq(ids,['CT-000001','CT-000002'],'중복 없음');
});
T('CMN01-로그인','로그인하지 않은 상태 — 쓰지 않고 안내한다',async()=>{
  const env=makeEnv(); seed(env,'S26',[S26(1)]); const a=await env.run("hrAppend('S26',{person_id:'PSN-0002'})"); ok(!a.ok&&a.code==='WRITE_FAIL'); eq(env.mock.tab('S26_CONTACT_LOG').cells.length,2);
});
T('CMN01-헤더불일치','시트 헤더가 정의와 다르면 쓰지 않는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S26',[S26(1)]); env.mock.set('S26_CONTACT_LOG',1,col(env,'S26','summary'),'요약내용');
  const a=await env.run("hrAppend('S26',{person_id:'PSN-0002'})"); ok(!a.ok&&a.code==='HEADER'&&a.message.includes('summary'),a.message); eq(env.mock.tab('S26_CONTACT_LOG').cells.length,2);
});
T('CMN01-열순서','열이 뒤바뀐 시트에도 헤더 이름으로 맞춰 쓴다 (열 번호 하드코딩 금지)',async()=>{
  const env=makeEnv(); env.login(); const H=env.run('HEADERS').S26.slice(); [H[1],H[2]]=[H[2],H[1]];
  env.mock.addTab('S26_CONTACT_LOG',H,[],{rowCount:6000,colCount:12});
  const a=await env.run("hrAppend('S26',{person_id:'PSN-0009',contact_date:'2026-10-12'})"); ok(a.ok,a.message);
  const row=env.mock.tab('S26_CONTACT_LOG').cells[1]; eq(row[H.indexOf('person_id')],'PSN-0009'); eq(row[H.indexOf('contact_date')],'2026-10-12');
});
T('CMN01-전체덮어쓰기','전체 덮어쓰기는 소규모 탭(S27)만, 행 단위 탭(S26)은 거절',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S27',[{party_id:'PTY-001',name:'직접',roles:'경로',is_active:'Y'},{party_id:'PTY-002',name:'내부',roles:'경로',is_active:'Y'}]); seed(env,'S26',[S26(1)]);
  const o=await env.run("hrOverwrite('S27',[{party_id:'PTY-001',name:'직접',roles:'경로',is_active:'Y'},{party_id:'PTY-003',name:'A사',roles:'고객',is_active:'Y'}])"); ok(o.ok,o.message);
  const r=await env.run("hrReadMany(['S27'])"); eq(r.tabs.S27.rows.map(x=>x.party_id),['PTY-001','PTY-003']);
  const x=await env.run("hrOverwrite('S26',[])"); ok(!x.ok&&x.code==='NOT_ALLOWED'); eq(env.mock.tab('S26_CONTACT_LOG').cells.length,2);
});

// ───────── CMN-02 ID 발번 ─────────
const ps=n=>({person_id:'PSN-'+String(n).padStart(4,'0'),name:'가'});
T('TC-CMN02-01','빈 탭 첫 발번',async()=>{ const env=makeEnv(); seed(env,'S27',[]); const r=await env.run("hrNextIds('S27')"); eq(r.ids,['PTY-001']); });
T('TC-CMN02-02','다음 번호',async()=>{ const env=makeEnv(); seed(env,'S20',[ps(1),ps(3),ps(7)]); eq((await env.run("hrNextIds('S20')")).ids,['PSN-0008']); });
T('TC-CMN02-03','연속 발번',async()=>{ const env=makeEnv(); seed(env,'S20',[ps(7)]); eq((await env.run("hrNextIds('S20',3)")).ids,['PSN-0008','PSN-0009','PSN-0010']); });
T('TC-CMN02-04','연도형 — 2026년 의뢰는 2026 번호 중 최대+1',async()=>{ const env=makeEnv(); seed(env,'S32',[{request_id:'REQ-2025-040'},{request_id:'REQ-2026-011'}]); eq((await env.run("hrNextIds('S32',1,2026)")).ids,['REQ-2026-012']); });
T('TC-CMN02-05','연도가 바뀌면 001부터',async()=>{ const env=makeEnv(); seed(env,'S32',[{request_id:'REQ-2026-100'}]); eq((await env.run("hrNextIds('S32',1,2027)")).ids,['REQ-2027-001']); });
T('TC-CMN02-06','저장 직전 재조회 — A가 열어 둔 사이 B가 추가해도 A의 번호가 겹치지 않는다',async()=>{
  const env=makeEnv(); env.login(); seed(env,'S20',[ps(7)]);
  const first=(await env.run("hrNextIds('S20')")).ids[0]; eq(first,'PSN-0008');         // A가 화면을 열면서 본 번호
  env.mock.set('S20_PERSON',3,1,'PSN-0008'); env.mock.set('S20_PERSON',3,2,'나');       // B가 먼저 PSN-0008 저장
  const a=await env.run("hrAppend('S20',{name:'A가 등록'})"); ok(a.ok,a.message); eq(a.id,'PSN-0009','B의 번호와 겹치지 않음');
});
T('TC-CMN02-07','저장하지 않은 번호는 다시 발번된다',async()=>{ const env=makeEnv(); seed(env,'S20',[ps(7)]); const a=await env.run("hrNextIds('S20')"); const b=await env.run("hrNextIds('S20')"); eq(a.ids,b.ids); });
T('TC-CMN02-08','ID 열을 읽을 수 없으면 발번하지 않고 안내한다',async()=>{
  const env=makeEnv(); seed(env,'S20',[ps(7)]); env.mock.failNext(/GET .*S20_PERSON!A%3AA/,403,5);
  const r=await env.run("hrNextIds('S20')"); ok(!r.ok&&r.message==='번호를 정할 수 없어 저장을 중단했습니다.',JSON.stringify(r));
});
T('CMN02-형식이상','형식이 맞지 않는 ID는 계산에서 제외하고, 자릿수가 넘치면 확장한다',async()=>{
  const env=makeEnv(); seed(env,'S20',[ps(3),{person_id:'PSN-ABC'},{person_id:'xx-0100'},{person_id:'PSN-9999'}]); eq((await env.run("hrNextIds('S20')")).ids,['PSN-10000']);
  const env2=makeEnv(); seed(env2,'S20',[ps(3),{person_id:'PSN-ABC'},{person_id:'psn-0100'}]); eq((await env2.run("hrNextIds('S20')")).ids,['PSN-0004']);
});
T('CMN02-접두어','탭별 접두어·자릿수가 물리 설계의 예시와 같다',async()=>{
  const env=makeEnv(); const exp={S27:'PTY-001',S36:'PCT-0001',S33:'LN-0001',S34:'ORD-00001',S31:'CND-00001',S38:'STG-000001',S20:'PSN-0001',S21:'PRL-00001',S22:'PSK-00001',S24:'CRT-00001',S23:'CAR-000001',S25:'ASG-00001',S26:'CT-000001',S28:'FIL-00001',S29:'RTG-00001',S37:'RUN-00001'};
  for(const k in exp){ seed(env,k,[]); eq((await env.run(`hrNextIds('${k}')`)).ids[0],exp[k],k); }
  seed(env,'S32',[]); eq((await env.run("hrNextIds('S32',1,2026)")).ids[0],'REQ-2026-001');
  seed(env,'S39',[]); ok(!(await env.run("hrNextIds('S39')")).ok,'S39는 발번 대상 아님(키는 S20에서)');
});

// ───────── CMN-03 시트 초기화 ─────────
const s10Header=['setting_key','setting_value','category','description','updated_at'];
const legacyS10=[['매출입금','오벳소프트','txn_type','매출입금(입금)','2026-10-01'],['React','리액트,react','skill_tag','','2026-10-01'],['kw_revenue_inflow','입금','','매출 입금 키워드','2026-10-01'],['param_alert_days','7','parameter','','2026-10-01']];
function freshFile(extra){ const env=makeEnv(); env.login(); env.mock.addTab('S10_SETTINGS',s10Header,legacyS10,{rowCount:1000,colCount:5}); env.mock.addTab('S11_GRADE_RATE',['set_id'],[['SET-001']]); if(extra) extra(env); return env; }
T('TC-CMN03-01','처음 실행 — 탭 18개 생성, 헤더·서식·검증·고정·보호 적용',async()=>{
  const env=freshFile(); const r=await env.run('hrInitSheets()'); ok(r.ok,JSON.stringify(r));
  eq(r.tabs.length,18); ok(r.tabs.every(x=>x.status==='created'),'모두 새로 만들어짐');
  const T_=env.run('HR_TABS'),H=env.run('HEADERS'); const ids=new Set();
  for(const k of env.run('HR_ORDER')){ const s=env.mock.tab(T_[k].tab); ok(s,k+' 생성'); ids.add(s.id);
    eq(s.cells[0],H[k],k+' 헤더'); eq(s.frozen,1,k+' 헤더 고정'); eq(s.rowCount,T_[k].rows,k+' 행 수'); eq(s.colCount,H[k].length,k+' 열 수'); eq(s.prot.length,1,k+' 헤더 보호'); ok(s.prot[0].range.endRowIndex===1); }
  eq(ids.size,18,'탭 번호 중복 없음');
});
T('TC-CMN03-02','다시 실행 — 변경 없음, "이미 있음"',async()=>{
  const env=freshFile(); await env.run('hrInitSheets()'); const snap=JSON.stringify(env.mock.sheets);
  const r=await env.run('hrInitSheets()'); ok(r.ok); ok(r.tabs.every(x=>x.status==='exists'),JSON.stringify(r.tabs.map(x=>x.status))); eq(JSON.stringify(env.mock.sheets),snap,'시트 변화 없음');
  ok(r.seeds.every(x=>x.status==='exists'),JSON.stringify(r.seeds));
});
T('TC-CMN03-03','중간 실패 후 재실행 — 나머지 탭만 생성',async()=>{
  const env=freshFile(); env.mock.failNext(/POST .*:batchUpdate/,403,1,false,9); // 10번째 탭에서 실패
  const r=await env.run('hrInitSheets()'); ok(!r.ok); eq(r.tabs.filter(x=>x.status==='created').length,9); eq(r.tabs[9].status,'fail'); eq(r.tabs.filter(x=>x.status==='skipped').length,8);
  eq(r.seeds.length,0,'실패하면 기본 행·코드는 넣지 않음'); eq(env.mock.sheets.filter(s=>/^S\d\d_/.test(s.title)&&!/S10|S11/.test(s.title)).length,9,'10번째 탭은 반쪽으로 남지 않음');
  const r2=await env.run('hrInitSheets()'); ok(r2.ok,JSON.stringify(r2)); eq(r2.tabs.filter(x=>x.status==='exists').length,9); eq(r2.tabs.filter(x=>x.status==='created').length,9);
});
T('TC-CMN03-04','서식 확인 — ID·연-월·전화 열이 일반 텍스트 서식',async()=>{
  const env=freshFile(); await env.run('hrInitSheets()'); const T_=env.run('HR_TABS'),H=env.run('HEADERS');
  const fmt=(k,n)=>env.mock.tab(T_[k].tab).fmt[H[k].indexOf(n)];
  ['S20.person_id','S20.birth_date','S23.start_ym','S23.end_ym','S39.rid_head7','S39.mobile','S36.phone','S27.main_phone','S37.requested_at','S31.stage_x'.replace('stage_x','cand_id')].forEach(x=>{ const [k,n]=x.split('.'); eq(fmt(k,n),'TEXT',x); });
  ['S20.name','S23.tasks','S33.headcount'].forEach(x=>{ const [k,n]=x.split('.'); eq(fmt(k,n),undefined,x+'은 일반 서식'); });
});
T('TC-CMN03-05','드롭다운 — 허용값 이외 입력은 거부',async()=>{
  const env=freshFile(); await env.run('hrInitSheets()'); const T_=env.run('HR_TABS');
  eq(env.mock.typeIn('S33_REQUEST_LINE',2,'grade','최고급'),false); eq(env.mock.typeIn('S33_REQUEST_LINE',2,'grade','특급'),true);
  eq(env.mock.typeIn('S20_PERSON',2,'is_active','예'),false); eq(env.mock.typeIn('S31_CANDIDACY',2,'stage','선정'),true);
  const v=env.mock.tab('S31_CANDIDACY').valid; eq(v[env.run('HEADERS').S31.indexOf('stage')].values,['추천수령','회신','서류통과','인터뷰','선정','계약','탈락','철회']);
  // E·YN 형태인 열은 빠짐없이 검증이 걸려 있다
  for(const k of env.run('HR_ORDER')){ env.run('HR_COLS')[k].forEach((c,i)=>{ if(c.type==='E'||c.type==='YN') ok(env.mock.tab(T_[k].tab).valid[i],k+'.'+c.name+' 검증 누락'); else ok(!env.mock.tab(T_[k].tab).valid[i],k+'.'+c.name+' 불필요 검증'); }); }
});
T('TC-CMN03-06','기본 행 — S27에 PTY-001 직접, PTY-002 내부',async()=>{
  const env=freshFile(); await env.run('hrInitSheets()'); const r=await env.run("hrReadMany(['S27'])"); const rows=r.tabs.S27.rows;
  eq(rows.map(x=>[x.party_id,x.name,x.roles,x.is_active]),[['PTY-001','직접','경로','Y'],['PTY-002','내부','경로','Y']]);
});
T('TC-CMN03-07','기존 S10 보존 — 기존 행은 모두 불변, 없는 코드·설정값만 추가',async()=>{
  const env=freshFile(); const s10=env.mock.tab('S10_SETTINGS'); s10.cells.push(['PM','사용자가 적은 설명','role','','2026-10-01']); // 사용자가 이미 만든 코드
  await env.run('hrInitSheets()');
  eq(s10.cells.slice(0,6),[s10Header,...legacyS10,['PM','사용자가 적은 설명','role','','2026-10-01']],'기존 행 불변');
  const added=s10.cells.slice(6), by=c=>added.filter(r=>r[2]===c).map(r=>r[0]);
  eq(by('role').length,16,'PM 제외 16개'); ok(!by('role').includes('PM')); eq(by('industry').length,12); eq(by('project_type').length,6); eq(by('fail_reason').length,9);
  eq(by('role').slice(0,3),['PL','PMO','AA']); ok(by('role').includes('ETL·이행')&&by('role').includes('컨설팅')); ok(by('industry').includes('우체국'));
  eq(by('hr_setting').sort(),['exit_alert_days','grade_rule','reconfirm_days','short_tenure_months']);
  const g=added.find(r=>r[0]==='grade_rule'); const j=JSON.parse(g[1]); eq(j.grades['특급'].edu['학사'],12); eq(j.grades['고급'].cert['기사'],7);
  eq(String(added.find(r=>r[0]==='reconfirm_days')[1]),'90'); eq(added.length,16+12+6+9+4);
});
T('TC-CMN03-08','헤더 불일치 — 표시만 하고 탭은 그대로, 나머지는 계속',async()=>{
  const env=freshFile(env=>{ const H=env.run('HEADERS').S26.slice(); H[5]='요약'; env.mock.addTab('S26_CONTACT_LOG',H,[['CT-000001']],{rowCount:6000,colCount:12}); });
  const before=JSON.stringify(env.mock.tab('S26_CONTACT_LOG')); const r=await env.run('hrInitSheets()');
  const x=r.tabs.find(t=>t.target==='S26_CONTACT_LOG'); eq(x.status,'header'); ok(x.message.includes('S26_CONTACT_LOG 탭 헤더가 정의와 다릅니다')); eq(JSON.stringify(env.mock.tab('S26_CONTACT_LOG')),before,'탭 불변');
  eq(r.tabs.filter(t=>t.status==='created').length,17);
});
T('TC-CMN03-09','권한 없음 — 안내 문구, 아무것도 만들지 않는다',async()=>{
  const env=freshFile(); env.logout(); const n=env.mock.sheets.length; const r=await env.run('hrInitSheets()'); ok(!r.ok); eq(r.tabs[0].status,'fail'); eq(r.tabs[0].message,'탭을 만들 수 없습니다. 로그인 상태와 시트 권한을 확인해 주세요.'); eq(env.mock.sheets.length,n);
  const env2=freshFile(); env2.mock.failNext(/POST .*:batchUpdate/,403,50); const r2=await env2.run('hrInitSheets()'); eq(r2.tabs[0].message,'탭을 만들 수 없습니다. 로그인 상태와 시트 권한을 확인해 주세요.');
});
T('CMN03-S10읽기실패','S10을 읽을 수 없으면 기본 코드를 넣지 않는다 (탭 준비는 완료)',async()=>{
  const env=freshFile(); env.mock.failNext(/GET .*S10_SETTINGS/,403,3); const r=await env.run('hrInitSheets()');
  const s=r.seeds.find(x=>x.target.startsWith('S10')); eq(s.status,'fail'); eq(env.mock.tab('S10_SETTINGS').cells.length,5,'S10 불변'); eq(r.tabs.filter(t=>t.status==='created').length,18);
});
T('CMN03-S10열순서','S10 열 순서가 달라도(description↔category) 헤더 이름으로 맞춰 넣는다',async()=>{
  const env=makeEnv(); env.login(); env.mock.addTab('S10_SETTINGS',['setting_key','setting_value','description','category','updated_at'],[['x','y','','keyword','2026-10-01']],{rowCount:1000,colCount:5});
  await env.run('hrInitSheets()'); const row=env.mock.tab('S10_SETTINGS').cells.find(r=>r[0]==='PM'); eq([row[2],row[3]],['','role']);
});

(async()=>{ const f=await runTests(tests,'선행 공통 기능 — CMN-01 · CMN-02 · CMN-03 (모의 구글 시트)'); process.exit(f?1:0); })();
