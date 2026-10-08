// HFC calc.js v2.0 — MM 날짜대응·월할·라운딩 도메인 계산(SSOT, DOM 무관 순수 함수)
// v2.9.9: pad2·ymList를 input.html에서 이전 — calc.js가 다른 화면 파일의 함수에 의존하던 모듈 독립성 결함 수정
// (아키텍처 원칙: 도메인 계산 계층은 DOM 무관 순수 함수로, 자기 완결적이어야 함).
function pad2(n){return String(n).padStart(2,'0');}
// v2.9.69: 고정비 계획 1건에 실제 통장 거래 여러 건을 연결(분할 지급 지원)하기 위한 SSOT —
// matched_txn_id 칼럼 값을 "콤마로 구분된 거래ID 목록"으로 다룬다(기존 단일 ID 값도 길이 1인
// 목록으로 그대로 유효). cashflow.html(통장 대사)·fixed.html(고정비 계획) 양쪽에서 공용으로 사용.
function splitIds(s){ return String(s||'').split(',').map(x=>x.trim()).filter(Boolean); }
function joinIds(arr){ return [...new Set(arr.filter(Boolean))].join(','); }
function ymList(s,e){const a=new Date(s),b=new Date(e);const r=[];let c=new Date(a.getFullYear(),a.getMonth(),1);
  while(c<=b){const dim=new Date(c.getFullYear(),c.getMonth()+1,0).getDate();
    const f=(c.getFullYear()===a.getFullYear()&&c.getMonth()===a.getMonth())?a.getDate():1;
    const t=(c.getFullYear()===b.getFullYear()&&c.getMonth()===b.getMonth())?b.getDate():dim;
    r.push({y:c.getFullYear(),m:c.getMonth()+1,w:(t-f+1)/dim});
    c=new Date(c.getFullYear(),c.getMonth()+1,1);} return r;}
function addMonthsKeepDay(d,k){
  const y=d.getFullYear(),m=d.getMonth()+k,day=d.getDate();
  const nd=new Date(y,m,day);
  if(nd.getDate()!==day) return new Date(y,m+1,0); // 월말 보정 (1/31+1개월→2/28)
  return nd;
}
// v2.9.62: 투입일 앵커 방식(구 SI 관례)으로 재복귀(사용자 확정, 2026-09-27) — v2.9.19에서
// "캘린더 월(1일~말일) 기준 일할"로 전면 교체했던 결정을 다시 번복한다.
// 번복 이유: v2.9.19 방식은 시작월과 종료월의 "총일수"가 서로 다르면(전형적으로 31일↔28일,
// 즉 2월이 시작월이나 종료월에 걸리면) 실제 근무일수를 다 더하면 정확히 30일=1개월인데도
// 결과가 정수로 안 떨어지는 구조적 오차가 있었다(예: 10/26~익년2/25 — 6일(10월,31일 기준)+
// 24일(11,12,1월 각 만근)+25일(2월,28일 기준) = 실제로는 6+25=31일=정확히 1개월인데
// 6/31+25/28로 계산하면 4.09가 나옴). 사용자가 실무에서 기대하는 계산은 "투입일과 같은 날짜를
// 매달의 경계로 고정"하는 방식 — 10/26~11/25, 11/26~12/25, 12/26~1/25, 1/26~2/25 각각을
// 예외 없이 정확히 1개월(1.00)로 본다. 이 방식은 월의 총일수가 서로 달라도 "그 구간의 실제
// 일수를 다음 앵커 구간의 일수로 나누는" 방식이라 이런 왜곡이 생기지 않는다.
// 검증(사용자 확정 사례): 3/12~9/11=6.00, 3/12~11/11=8.00(v2.9.19 도입 전 원래 값),
// 10/26~2/25=4.00(2026-09-27 이번 사례로 재확인).
function mmTotal(s,e){
  if(!s||!e) return '0.00';
  const a=new Date(s), b=new Date(e);
  if(isNaN(a)||isNaN(b)||b<a) return '0.00';
  // 완전월 개수: addMonthsKeepDay(a,k)에서 시작해 "다음 앵커 하루 전"까지가 매번 정확히 1개월.
  // b가 그 하루 전 날짜 이상이면 그 달은 만근(1.00)으로 센다.
  let months=0;
  while(true){
    const nextAnchor=addMonthsKeepDay(a,months+1);
    const lastDayOfThisMonth=new Date(nextAnchor.getFullYear(),nextAnchor.getMonth(),nextAnchor.getDate()-1);
    if(lastDayOfThisMonth<=b){ months++; } else break;
  }
  const anchor=addMonthsKeepDay(a,months);
  if(anchor>b) return months.toFixed(2); // 안전망(위 while 로직상 이론적으로 도달하지 않음)
  const nextAnchor=addMonthsKeepDay(a,months+1);
  const denom=Math.round((nextAnchor-anchor)/86400000); // 다음 앵커까지의 실제 일수(=1개월 단위 길이)
  const daysPartial=Math.round((b-anchor)/86400000)+1; // 앵커일 포함, b까지의 실제 경과일수
  const frac=daysPartial/denom;
  return (months+frac).toFixed(2);
}
function mmMonthly(sd,ed){
  // v2.9.62: 총MM은 위 mmTotal(투입일 앵커 방식)로 구하되, 월별 배분은 앵커 구간을 캘린더월로
  // 다시 쪼개려 하지 않는다 — 앵커 구간(예: 3/12~4/11)의 길이는 그 구간이 걸친 두 캘린더월의
  // 일수와 다를 수 있어서(3월 31일, 4월 30일), 구간의 날짜 수를 그대로 캘린더월에 배분하면
  // 완전월인 4월조차 1.00이 아니라 0.99·1.01처럼 어긋나는 문제가 재발한다(실제로 시도해보고
  // 발견). 대신 v2.9.19 이전부터 쓰던 훨씬 단순하고 안전한 방식을 그대로 재사용한다: 시작월은
  // "그 달의 잔여일수/그 달 총일수"로 캘린더 기준 일할, 중간에 완전히 걸치는 달은 전부 1.00,
  // 마지막 달은 총MM(anchor 방식)에서 앞선 달들의 합을 뺀 잔여값으로 역산한다. 이렇게 하면
  // ①완전월은 예외 없이 정확히 1.00 ②월별 합계가 총MM(정수로 딱 떨어지는 anchor 계산 결과)과
  // 항상 정확히 일치 ③시작월의 표시값만 실제 근무일수 기준 소수로 자연스럽게 남는다.
  const a=new Date(sd), b=new Date(ed);
  if(isNaN(a)||isNaN(b)||b<a) return [];
  const total=parseFloat(mmTotal(sd,ed));
  const list=[]; let c=new Date(a.getFullYear(),a.getMonth(),1);
  while(c<=b){ list.push({y:c.getFullYear(),m:c.getMonth()+1,mm:0}); c=new Date(c.getFullYear(),c.getMonth()+1,1); }
  if(list.length===1){ list[0].mm=total; return list; }
  const dim0=new Date(a.getFullYear(),a.getMonth()+1,0).getDate();
  const first=Math.round((dim0-a.getDate()+1)/dim0*100)/100;
  list[0].mm=first; let acc=first;
  for(let i=1;i<list.length-1;i++){ list[i].mm=1; acc+=1; }
  list[list.length-1].mm=Math.max(0,Math.round((total-acc)*100)/100);
  return list;
}
function monthlyProfile(items,priceField,defStart,defEnd){
  // 항목별 기간 기반 월별 원시 금액(실수) 합산 — 라운딩은 profileToRows에서 일괄 처리
  // v2.9.9: calc.js는 common.js의 num()을 참조할 수 없는 순수 계산 모듈이므로 자체 안전 파싱을 사용
  // (여기가 v2.9.7~8 "백만분의 1 축소" 결함의 실제 발생 지점이었음 — 콤마 포함 시트값 방어 누락).
  const _n=v=>parseInt(String(v??'').replace(/,/g,''))||0;
  const byM={};
  items.forEach(e=>{
    // v2.9.23: 급여형 인건비(memo="급여형|{월별지급액 JSON}")는 회사 급여대장에서 이미 확정된 월별 금액을
    // 그대로 반영해야 한다 — mmMonthly(시작~종료일 기준 일할계산)를 타면 여러 달에 걸친 단가가 다시
    // 일할 분배되어 총액이 왜곡된다(사용자 지적으로 발견된 논리 오류). 매출(unit_price)에는 이 개념이
    // 없으므로(매출 견적은 지급형태 무관하게 항상 일할계산) priceField가 buy_price일 때만 적용한다.
    const isSalaried=e.comp_type==='인건비'&&(e.memo||'').startsWith('급여형')&&priceField==='buy_price';
    if(isSalaried){
      let monthlyOverride={};
      const jsonPart=(e.memo||'').split('|').slice(1).join('|');
      if(jsonPart){ try{ monthlyOverride=JSON.parse(jsonPart)||{}; }catch(err){ monthlyOverride={}; } }
      Object.keys(monthlyOverride).forEach(k=>{ byM[k]=(byM[k]||0)+(_n(monthlyOverride[k])); });
      return;
    }
    // v2.9.30: UI 표준(단가×MM=총액 대칭 구조, 사용자 확립)에 따라 사업소득형의 buy_price도 다시
    // "단가"로 되돌아왔으므로(v2.9.26~27의 총액 직접입력 방식은 폐기), 세금계산서형과 완전히 동일한
    // mmMonthly(단가×월별 근무비중) 경로를 그대로 탄다 — 별도 분기가 불필요해졌다(v2.9.27의 isBizIncome
    // 분기를 유지했다면 이제 "단가"를 "총액"으로 오인해 이중으로 나누는 반대 방향의 결함이 재발했을 것).
    const p=_n(e[priceField]); if(!p)return;
    if(e.comp_type==='인건비'){
      mmMonthly(e.start_date||defStart,e.end_date||defEnd).forEach(x=>{
        const k=`${x.y}-${pad2(x.m)}`; byM[k]=(byM[k]||0)+p*x.mm;});
    } else {
      const total=(_n(e.qty)||1)*p;
      if(e.start_date&&e.end_date){
        const ms=ymList(e.start_date,e.end_date); const tw=ms.reduce((s,x)=>s+x.w,0)||1;
        ms.forEach(x=>{const k=`${x.y}-${pad2(x.m)}`; byM[k]=(byM[k]||0)+total*x.w/tw;});
      } else {
        const sd=new Date(e.start_date||defStart);
        const k=`${sd.getFullYear()}-${pad2(sd.getMonth()+1)}`;
        byM[k]=(byM[k]||0)+total;
      }
    }
  });
  return byM;
}
