// HFC calc.js v2.0 — MM 날짜대응·월할·라운딩 도메인 계산(SSOT, DOM 무관 순수 함수)
// v2.9.9: pad2·ymList를 input.html에서 이전 — calc.js가 다른 화면 파일의 함수에 의존하던 모듈 독립성 결함 수정
// (아키텍처 원칙: 도메인 계산 계층은 DOM 무관 순수 함수로, 자기 완결적이어야 함).
function pad2(n){return String(n).padStart(2,'0');}
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
function mmTotal(s,e){
  // v2.9.19: 실무 방식으로 재정의(사용자 지정, 2026-09-14 확정) — 투입일 앵커 방식(구 SI 관례) 폐기.
  // 캘린더 월(1일~말일)을 고정 단위로 삼는다:
  //   ①완전월(월초~월말 만근)=1.00  ②시작월(중간투입)=(그 달 말일-투입일+1)/그 달 총일수
  //   ③종료월(중간철수)=철수일/그 달 총일수  ④총MM=시작월+중간완전월 개수+종료월(각 항을 합산 후 소수 2자리 반올림)
  // ymList()와 동일한 원칙(캘린더 월 기준 일할)이며, 시작월·종료월을 각각 독립 계산하므로
  // 구 방식(투입일~투입일-1=1개월 고정)과 달리 시작월+종료월 합이 정수로 안 떨어질 수 있다(예: 6.01).
  if(!s||!e) return 0;
  const a=new Date(s), b=new Date(e);
  if(isNaN(a)||isNaN(b)||b<a) return 0;
  if(a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()){
    const dim=new Date(a.getFullYear(),a.getMonth()+1,0).getDate();
    return ((b.getDate()-a.getDate()+1)/dim).toFixed(2);
  }
  const dimStart=new Date(a.getFullYear(),a.getMonth()+1,0).getDate();
  const startFrac=(dimStart-a.getDate()+1)/dimStart;
  const dimEnd=new Date(b.getFullYear(),b.getMonth()+1,0).getDate();
  const endFrac=b.getDate()/dimEnd;
  let mid=0, cy=a.getFullYear(), cm=a.getMonth()+1; // 0-based month+1 = 다음 달부터 카운트 시작
  while(!(cy===b.getFullYear()&&cm===b.getMonth())){ mid++; cm++; if(cm>11){cm=0;cy++;} }
  return (startFrac+mid+endFrac).toFixed(2);
}
function mmMonthly(sd,ed){
  // v2.9.19: 시작월은 캘린더 월 기준 일할(실무 방식) 그대로 독립 계산하되, 마지막 달은 총MM에서
  // 앞선 달들의 합을 뺀 잔여값으로 역산한다(사용자 확정, 2026-09-14) — 시작월·종료월을 각각 독립
  // 반올림하면 총합이 mmTotal과 0.01 정도 어긋날 수 있어(예: 6.02 vs 6.01), 총 MM(견적서 표시값)과
  // 월별 배분 합계가 항상 정확히 일치하도록 오차를 마지막 달에 흡수시킨다.
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
    // v2.9.27: 사업소득형 인건비(memo="사업소득형")의 buy_price는 v2.9.26부터 "이미 확정된 지급 총액"이지
    // "월 단가"가 아니다 — mmMonthly(단가×개월비중)로 계산하면 그 총액에 다시 개월수를 곱하는 이중계산이 된다.
    // 매출(unit_price)에는 이 구분이 없으므로 priceField가 buy_price일 때만 적용, 총액을 근무기간에 걸쳐
    // 균등 일할 배분한다(비인건비 항목과 동일한 기간 배분 방식 — 그 사람이 실제 그 기간에 지급받는 돈이므로).
    const isBizIncome=e.comp_type==='인건비'&&(e.memo||'')==='사업소득형'&&priceField==='buy_price';
    if(isBizIncome){
      const total=_n(e.buy_price); if(!total) return;
      if(e.start_date&&e.end_date){
        const ms=ymList(e.start_date,e.end_date); const tw=ms.reduce((s,x)=>s+x.w,0)||1;
        ms.forEach(x=>{const k=`${x.y}-${pad2(x.m)}`; byM[k]=(byM[k]||0)+total*x.w/tw;});
      } else {
        const sd=new Date(e.start_date||defStart);
        const k=`${sd.getFullYear()}-${pad2(sd.getMonth()+1)}`;
        byM[k]=(byM[k]||0)+total;
      }
      return;
    }
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
