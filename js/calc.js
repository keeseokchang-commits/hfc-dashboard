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
  // SI 관례(2026-07-25 승인): d일 투입 ~ (d-1)일 철수 = 정확히 1개월.
  // 총MM = 대응 개월수 k + 잔여일/잔여월 총일수(소수 2자리)
  if(!s||!e) return 0;
  const a=new Date(s), b=new Date(e);
  if(isNaN(a)||isNaN(b)||b<a) return 0;
  let k=0;
  while(k<240){
    const cycEnd=new Date(addMonthsKeepDay(a,k+1).getTime()-86400000);
    if(cycEnd<=b) k++; else break;
  }
  const anchor=addMonthsKeepDay(a,k);
  let frac=0;
  if(anchor<=b){
    const dim=new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate();
    const days=Math.round((b-anchor)/86400000)+1;
    frac=Math.round(days/dim*100)/100;
  }
  return (k+frac).toFixed(2);
}
function mmMonthly(sd,ed){
  // 월별 MM 분해: 시작월=일할 소수2자리 반올림(1일 시작이면 1.00), 중간=1.00, 마지막월=총MM-앞선 합(잔여)
  const a=new Date(sd), b=new Date(ed);
  if(isNaN(a)||isNaN(b)||b<a) return [];
  const total=parseFloat(mmTotal(sd,ed));
  const list=[]; let c=new Date(a.getFullYear(),a.getMonth(),1);
  while(c<=b){ list.push({y:c.getFullYear(),m:c.getMonth()+1,mm:0}); c=new Date(c.getFullYear(),c.getMonth()+1,1); }
  if(list.length===1){ list[0].mm=total; return list; }
  const dim0=new Date(a.getFullYear(),a.getMonth()+1,0).getDate();
  let first=(a.getDate()===1)?1:Math.round((dim0-a.getDate()+1)/dim0*100)/100;
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
