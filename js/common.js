// HFC common.js v2.0 — 설정·인증·API·유틸 단일 정의(SSOT)
const SHEETS_ID='1PZs1mEbqoWUlgbx7FgvCoTHoDjzJTv6JNDoX6-yVg5Q';
// v2.9.111: API_KEY·SCOPES·accessToken·signIn·initOAuth 는 js/auth.js 로 이동(로그인 게이트·세션·자동 잠금). 읽기도 로그인 열쇠로만 한다.
const CLIENT_ID='129067702204-tn3oom6h6giu0cj2bphs4ve8rsti03be.apps.googleusercontent.com';
// v3.6.0(결함 후보 #14): 「오늘」은 한국 시간 기준 날짜 — new Date().toISOString() 은 세계 표준시라 한국 0~9시에 전날로 기록됐다
function kstToday(){ return new Date(Date.now()+9*3600*1000).toISOString().slice(0,10); }
function kstNow16(){ return new Date(Date.now()+9*3600*1000).toISOString().slice(0,16).replace('T',' '); }
async function fetchSheet(sheet,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!'+range)}`;
  // v2.0.2: 429(쿼터)·5xx 일시 오류 자동 재시도 — 0.8s→1.6s→3.2s 백오프
  for(let i=0;i<4;i++){
    const res=await authFetch(url);
    if(res.ok) return (await res.json()).values||[];
    if(res.status===429||res.status>=500){
      if(i<3){ await new Promise(r=>setTimeout(r,800*Math.pow(2,i))); continue; }
      throw new Error(sheet+' 읽기 오류 '+res.status+' — API 호출 한도. 잠시 후 다시 시도하세요');
    }
    throw new Error(sheet+' 읽기 오류 '+res.status+(res.status===403?' (이 구글 계정은 시트 접근 권한이 없습니다)':''));
  }
}
// v2.8.2: 존재하지 않는 시트를 안전하게 조회(400 → 빈 배열). 필요 시 자동 생성 후 헤더 기록.
async function fetchSheetSafe(sheet,range){
  try{ return await fetchSheet(sheet,range); }
  catch(e){ if(String(e.message).includes('오류 400')) return null; throw e; }
}
async function ensureSheet(sheet,header){
  if(!accessToken){ await signIn(); if(!accessToken) return false; }
  try{
    const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}:batchUpdate`,{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{addSheet:{properties:{title:sheet}}}]})});
    if(!r.ok && r.status!==400) throw new Error('시트 생성 실패 '+r.status); // 400=이미 존재 가능성, 계속 진행
  }catch(e){ /* 이미 존재하면 addSheet가 400 — 무시하고 헤더만 기록 */ }
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!A1')}`;
  const r2=await fetch(base+'?valueInputOption=RAW',{method:'PUT',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({values:[header]})});
  return r2.ok;
}
// v3.5.1(결함 후보 #2·#5): 전체 덮어쓰기 안전장치 — 읽기 범위(R)의 끝 행 바로 아래에 값이 있으면 그 행들은 이 화면이 읽지 못했으므로
// 덮어쓰면 사라진다. 그 경우 쓰지 않는다. 확인 자체가 실패해도(권한·통신) 안전을 위해 쓰지 않는다. 탭이 아직 없으면(400) 그대로 진행.
async function writeGuard(sheet){
  try{
    if(typeof R==='undefined') return {ok:true};
    const k=Object.keys(R).find(x=>R[x][0]===sheet); if(!k) return {ok:true};
    const m=String(R[k][1]).match(/:[A-Z]+(\d+)$/); if(!m) return {ok:true};
    const L=parseInt(m[1],10);
    const res=await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!A'+(L+1)+':A'+(L+1))}`);
    if(res.status===400) return {ok:true};
    if(!res.ok) return {ok:false,msg:`${sheet} 의 행 수를 확인하지 못해 저장을 중단했습니다.`};
    const v=(await res.json()).values||[];
    if(v.length&&String((v[0]||[])[0]??'').trim()!=='') return {ok:false,msg:`${sheet} 에 읽기 한도(${L}행)를 넘는 행이 있어 저장을 중단했습니다. 넘는 행은 읽히지 않아 저장하면 사라집니다. 관리자 확인이 필요합니다.`};
    return {ok:true};
  }catch(e){ return {ok:false,msg:`${sheet} 의 행 수를 확인하지 못해 저장을 중단했습니다.`}; }
}
async function clearAndWrite(sheet,range,rows){
  if(!accessToken){ await signIn(); if(!accessToken) return false; }
  const g=await writeGuard(sheet);
  if(!g.ok){ console.error(g.msg); try{ alert(g.msg); }catch(_){ if(typeof toast==='function') toast(g.msg,true); } return false; }   // 호출한 쪽이 곧바로 「저장 실패」 토스트로 덮어쓰므로, 이유는 알림 창으로 알린다
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!'+range)}`;
  try{
    let r=await fetch(base+':clear',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});
    if(!r.ok) throw new Error('clear '+r.status);
    r=await fetch(base+'?valueInputOption=RAW',{method:'PUT',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
    if(!r.ok) throw new Error('write '+r.status);
    return true;
  }catch(e){ console.error(e); return false; }
}
// v2.9.9: 객체 배열 → 시트 행 배열 변환의 단일 관문(설계서 결정1·4). 기존 각 화면의
// `list.map(r=>H.map(h=>r[h]??''))` 패턴을 대체 — 숫자 컬럼은 항상 콤마 없는 순수 숫자로,
// ZERO_DEFAULT_COLS는 공백일 때 0으로 채워 저장한다(그 외 숫자 컬럼은 공백을 그대로 보존 — mm·qty처럼
// "값 없음"과 "0"이 다른 의미를 갖는 컬럼을 억지로 0으로 만들지 않기 위함). 화면에 콤마 텍스트로
// 남아있던 기존 값도 다음 저장 시 이 관문을 지나며 자동으로 정규화된다(별도 마이그레이션 스크립트 불필요).
function rowsFor(H,list){
  return list.map(r=>H.map(h=>{
    let v=r[h];
    if(NUMERIC_COLS.has(h)){
      if(v===undefined||v===null||v===''){ return ZERO_DEFAULT_COLS.has(h)?0:''; }
      return (typeof DECIMAL_COLS!=='undefined'&&DECIMAL_COLS.has(h))?numF(v):num(v); // v2.9.73: 소수 한 자리 컬럼(경력 연수)은 정수로 자르지 않는다
    }
    return v??'';
  }));
}
// v2.9.9: 데이터 타입 표준화 설계서 Step2·3 적용.
// 타입 메타(NUMERIC_COLS·ZERO_DEFAULT_COLS)는 js/schema.js에 SSOT로 이전(전 시트 공통 컬럼명 기준).
// 원인 요약: 구글시트를 사용자가 직접 편집하며 콤마 포함 텍스트("13,200,000")로 저장하면,
// 코드 전역의 parseInt(obj.field) 호출이 콤마에서 끊겨 자릿수가 크게 줄어든다(예: 13,200,000→13).
// 화면 입력은 항상 un()/uncomma()로 안전하지만, 시트 원본이 이미 콤마 포함이면 그 방어를 우회한다.
// 방어 2단계: ①toObj()가 읽기 즉시 알려진 숫자 컬럼의 콤마를 제거 ②계산부는 parseInt 대신 num()을 써서
// toObj가 못 잡은 컬럼(스키마 미등재·오탈자 등)도 최종 계산 직전에 한 번 더 방어(설계서 결정3: 전체 적용, 화면별 순차 교체).
function toObj(rows){ if(!rows||!rows.length) return []; const h=rows[0];
  return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>{
    let v=r[i]??'';
    if(NUMERIC_COLS.has(k)&&typeof v==='string'&&v.includes(',')) v=v.replace(/,/g,'');
    return [k,v];
  })));
}
// num(): parseInt(obj.field) 전면 교체용 안전 헬퍼 — 콤마·공백을 제거한 뒤 정수로 파싱, 실패 시 0.
function num(v){ return parseInt(String(v??'').replace(/,/g,'').trim())||0; }
// numF(): 소수(예: mm 공수)가 필요한 곳의 안전 헬퍼 — parseFloat(obj.field) 대체.
function numF(v){ return parseFloat(String(v??'').replace(/,/g,'').trim())||0; }
const toObjects=toObj;
function dedupe(list,key){ const m=new Map(); (list||[]).forEach(r=>{ if(r&&r[key]) m.set(r[key],r); }); return [...m.values()]; }
function toast(msg,err=false){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.style.background=err?'#DC2626':'#1A202C'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function comma(n){ return (parseInt(String(n).replace(/,/g,''))||0).toLocaleString(); }
// v3.6.2(#18): 변경 이력 값 표시 — 숫자만 천 단위 쉼표, 상태·날짜 같은 문자열은 그대로
function histVal(v){ const s=String(v??'').trim(); return /^-?[\d,]+$/.test(s)&&s!==''?comma(s):s; }
function wonFull(n){ return comma(n)+'원'; }
function fc(el){ el.value=comma(el.value); }
function un(v){ return parseInt(String(v).replace(/,/g,''))||0; }
