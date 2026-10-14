// HFC hr-ui.js v2.9.76 — 인력 의뢰·거래처 화면(SCR-01·02·11) 공통 화면 도우미
// 하는 일: HTML 이스케이프, 금액(원↔만원) 변환, 화면 읽기(탭 없음/읽기 실패 구분), 거래처 이름 찾기 등 세 화면이 같이 쓰는 작은 함수.
// 시트 값은 사람이 직접 고칠 수 있으므로 화면에 넣는 모든 값은 hrEsc 를 거친다.
// 의존: schema.js, common.js(toast), cmn-sheet.js(hrReadMany)

let pendingAuth=null;   // common.js 의 로그인 흐름이 쓰는 전역(기존 화면들이 페이지마다 선언하던 것을 이 파일이 대신 선언)
const hrEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hrQ=id=>document.getElementById(id);
// 금액: 시트에는 원(월 단가)으로 저장하고, 화면에서는 만원 단위로 보여 주고 입력받는다(프로그램 설계서 "금액(만원/월)", DB 물리 설계 "월 단가, 원").
function hrWonToMan(won){ const n=parseFloat(String(won??'').replace(/,/g,'')); return isNaN(n)?'':Math.round(n/1000)/10; }
function hrManToWon(man){ const t=String(man??'').replace(/,/g,'').trim(); if(t==='') return ''; const n=parseFloat(t); return isNaN(n)||n<0?NaN:Math.round(n*10000); }
function hrFmtMan(won){ const m=hrWonToMan(won); return m===''?'':m.toLocaleString('ko-KR',{maximumFractionDigits:1}); }
// 여러 라인의 단가를 한 칸에: 모두 같으면 그 값, 다르면 "최소~최대", 하나도 없으면 "-"
function hrRangeMan(wons){
  const v=wons.map(w=>hrWonToMan(w)).filter(x=>x!==''&&x>0); if(!v.length) return '-';
  const lo=Math.min(...v), hi=Math.max(...v); const f=x=>x.toLocaleString('ko-KR',{maximumFractionDigits:1});
  return lo===hi?f(lo):`${f(lo)}~${f(hi)}`;
}
// 화면이 여는 탭을 한 번에 읽는다. 반환 {state:'ok'|'noTab'|'fail', data:{키:행 배열}, tabs, message}
//   noTab = 탭이 없음(구글이 400) → "시트 초기화가 필요합니다." / fail = 그 외 읽기 실패 → "데이터를 불러오지 못했습니다. 다시 로그인해 주세요."
async function hrLoadScreen(keys){
  const r=await hrReadMany(keys);
  if(r.failed.length){
    const noTab=r.failed.some(k=>r.tabs[k].status===400);
    return {state:noTab?'noTab':'fail',data:{},tabs:r.tabs,failed:r.failed,
      message:noTab?'시트 초기화가 필요합니다.':'데이터를 불러오지 못했습니다. 다시 로그인해 주세요.'};
  }
  // 같은 ID가 두 줄이면 뒤의 줄만 남긴다(수동 편집·재시도로 생긴 중복이 집계를 부풀리지 않게 — 기존 dedupe 관례)
  const data={}; keys.forEach(k=>{ data[k]=dedupe(r.tabs[k].rows,HEADERS[k][0]); });
  return {state:'ok',data,tabs:r.tabs,failed:[]};
}
const hrMap=(rows,idCol)=>new Map(rows.map(r=>[r[idCol],r]));
// 거래처 이름 — 대표 이름만 보여 준다(별칭이 아니라)
const hrPartyName=(pm,id)=>{ const p=pm.get(id); return p?p.name:(id||''); };
const hrPartyLabel=(pm,id)=>{ const p=pm.get(id); return p?`${p.name} (${id})`:(id||''); };  // 이름 + 거래처 ID. 이력서 JSON의 source_party_id를 화면에서 확인하기 위함
// 화면 상태 안내(탭 없음/읽기 실패)를 한 곳에서 그린다
function hrShowLoadProblem(el,state,message){
  const link=state==='noTab'?' <a href="settings.html" style="color:inherit;font-weight:600">설정 화면으로 이동</a>':' <button class="btn btn-secondary btn-sm" onclick="hrRelogin()">다시 로그인</button>';
  el.innerHTML=`<div class="hr-notice err">${hrEsc(message)}${link}</div>`;
}
async function hrRelogin(){ accessToken=null; await signIn(); if(typeof loadAll==='function') loadAll(); }
// 버튼 중복 클릭 방지
async function hrBusy(btn,fn){ if(btn.disabled) return; btn.disabled=true; try{ return await fn(); } finally{ btn.disabled=false; } }
const hrYes=v=>String(v??'').trim().toUpperCase()==='Y';
// 쉼표 목록 ↔ 배열
const hrSplit=s=>String(s??'').split(',').map(x=>x.trim()).filter(Boolean);
// 저장 실패 문구(설계서 §5.7 "저장하지 못했습니다. 다시 시도해 주세요.") — 충돌·읽기 실패는 그 이유를 그대로 보여 준다
function hrSaveFailText(r){ return (r&&(r.code==='CONFLICT'||r.code==='READ_FAIL'||r.code==='NOT_FOUND')&&r.message)?r.message:'저장하지 못했습니다. 다시 시도해 주세요.'; }

// 금액 입력칸 표준(2026-10-12 사용자 지정): 금액을 넣는 칸(class="hr-amt")은 입력하는 즉시 천 단위 쉼표를 찍어 자릿수 실수를 막는다.
// 만원 단위 칸은 소수 한 자리까지(예: 700.5). 쉼표는 저장 전에 hrManToWon 이 지운다.
function hrFmtAmt(raw,decimals){
  let t=String(raw??'').replace(/[^\d.]/g,''); const i=t.indexOf('.');
  let ip=i<0?t:t.slice(0,i), dp=i<0?null:t.slice(i+1).replace(/\./g,'').slice(0,decimals);
  ip=ip.replace(/^0+(?=\d)/,''); ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return dp===null?ip:(decimals>0?ip+'.'+dp:ip);
}
document.addEventListener('input',ev=>{
  const el=ev.target; if(!el.classList||!el.classList.contains('hr-amt')) return;
  const dec=parseInt(el.dataset.dec||'1',10); const pos=el.selectionStart; const before=el.value.slice(0,pos).replace(/,/g,'').length;
  const f=hrFmtAmt(el.value,dec); if(f===el.value) return; el.value=f;
  let n=0,c=0; for(;c<f.length&&n<before;c++){ if(f[c]!==',') n++; } try{ el.setSelectionRange(c,c); }catch(e){}
});
