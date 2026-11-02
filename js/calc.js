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
// v2.9.111~92: 일할 계산 옵션(사용자 승인 2026-10-21, KB증권 계약서 사례) — 계약마다 다르고, 매출과 매입을 따로 지정할 수 있다.
//  · mmRound: 일할 비율을 소수 몇째 자리에서 반올림할지(2→0.4, 3→0.42, 4→0.419). 이 반올림한 비율을 단가에 곱한다. M/M 표시도 같은 자리.
//  · cutUnit: 곱한 입사월 금액을 처리할 단위(1=원, 1000=천원, 10000=만원). 만근월은 단가 그대로, 종료월은 총액에서 앞 달을 뺀 잔액.
//  · cutMode: 위 단위로 '절사' 또는 '반올림'.
// 기본값은 설정 화면(S10 hr_setting: mm_round_digit, cut_unit, cut_mode) — 값이 없으면 3째 자리(루틴 B)·만원·절사. 행의 값이 있으면 행이 우선.
// 행의 열: 매출 = mm_round·mm_mode·cut_unit·cut_mode / 매입 = buy_ 접두어 (비어 있으면 설정 기본값). mm_mode = 비율 반올림/올림/버림, cut_mode = 금액 절사/반올림/올림 (비어 있으면 설정 기본값)
let CALC_OPT={mmRound:3,mmMode:'반올림',cutUnit:10000,cutMode:'절사'};
const CALC_ROUNDS=[2,3,4], CALC_CUTS=[1,1000,10000], CALC_MODES=['절사','반올림','올림'], CALC_RMODES=['반올림','올림','버림'];
// 비율 처리(mmMode): 지정 자리에서 반올림/올림/버림. 금액 처리(cutMode): 단위로 절사/반올림/올림.
const calcRatio=(x,digit,mode)=>{ const k=Math.pow(10,digit-1), y=Math.round(x*1e9)/1e9; return (mode==='올림'?Math.ceil(y*k-1e-9):mode==='버림'?Math.floor(y*k+1e-9):Math.round(y*k+1e-9))/k; };
function calcApplySettings(rows){
  (rows||[]).forEach(r=>{ if(String(r.category||'')!=='hr_setting') return; const raw=String(r.setting_value??'').replace(/,/g,'').trim(), v=parseInt(raw,10);
    if(r.setting_key==='mm_round_digit'&&CALC_ROUNDS.includes(v)) CALC_OPT.mmRound=v;
    if(r.setting_key==='mm_mode'&&CALC_RMODES.includes(raw)) CALC_OPT.mmMode=raw;
    if(r.setting_key==='cut_unit'&&CALC_CUTS.includes(v)) CALC_OPT.cutUnit=v;
    if(r.setting_key==='cut_mode'&&CALC_MODES.includes(raw)) CALC_OPT.cutMode=raw; });
}
// field: 'unit_price'(매출) / 'buy_price'(매입) — 행의 해당 열을 읽는다
function calcOpt(e,field){
  const pre=field==='buy_price'?'buy_':''; const g=k=>(e&&e[pre+k]);
  const r=parseInt(String(g('mm_round')??'').trim(),10), c=parseInt(String(g('cut_unit')??'').replace(/,/g,'').trim(),10), m=String(g('cut_mode')??'').trim(), rm=String(g('mm_mode')??'').trim();
  return {mmRound:CALC_ROUNDS.includes(r)?r:CALC_OPT.mmRound, mmMode:CALC_RMODES.includes(rm)?rm:CALC_OPT.mmMode, cutUnit:CALC_CUTS.includes(c)?c:CALC_OPT.cutUnit, cutMode:CALC_MODES.includes(m)?m:CALC_OPT.cutMode};
}
// 단위 처리 — 절사는 내림, 반올림은 사사오입. 부동소수 오차 방어
const calcUnit=(v,unit,mode)=>{ const x=Math.round(v*1e6)/1e6; return (mode==='반올림'?Math.floor(x/unit+0.5):mode==='올림'?Math.ceil(x/unit-1e-9):Math.floor(x/unit))*unit; };
// 투입일 앵커 방식의 총 M/M — {months:완전월 수, frac:남은 일수/앵커 구간 일수(정확값)}. 못 구하면 null
function mmParts(s,e){
  if(!s||!e) return null;
  const a=new Date(s), b=new Date(e);
  if(isNaN(a)||isNaN(b)||b<a) return null;
  // 완전월 개수: addMonthsKeepDay(a,k)에서 시작해 "다음 앵커 하루 전"까지가 매번 정확히 1개월.
  // b가 그 하루 전 날짜 이상이면 그 달은 만근(1.00)으로 센다.
  let months=0;
  while(true){
    const nextAnchor=addMonthsKeepDay(a,months+1);
    const lastDayOfThisMonth=new Date(nextAnchor.getFullYear(),nextAnchor.getMonth(),nextAnchor.getDate()-1);
    if(lastDayOfThisMonth<=b){ months++; } else break;
  }
  const anchor=addMonthsKeepDay(a,months);
  if(anchor>b) return {months,frac:0}; // 안전망(위 while 로직상 이론적으로 도달하지 않음)
  const nextAnchor=addMonthsKeepDay(a,months+1);
  const denom=Math.round((nextAnchor-anchor)/86400000); // 다음 앵커까지의 실제 일수(=1개월 단위 길이)
  const daysPartial=Math.round((b-anchor)/86400000)+1; // 앵커일 포함, b까지의 실제 경과일수
  return {months,frac:daysPartial/denom};
}
function mmTotal(s,e){
  const p=mmParts(s,e); if(!p) return '0.00';
  return (p.months+p.frac).toFixed(2);
}
function monthList(sd,ed){
  const a=new Date(sd), b=new Date(ed); const list=[]; let c=new Date(a.getFullYear(),a.getMonth(),1);
  while(c<=b){ list.push({y:c.getFullYear(),m:c.getMonth()+1}); c=new Date(c.getFullYear(),c.getMonth()+1,1); }
  return list;
}
// 시작월의 정확한 일수 비율 = (그 달 잔여일수 ÷ 그 달 총일수). 1일 시작이면 1
function firstFrac(sd){ const a=new Date(sd); const dim=new Date(a.getFullYear(),a.getMonth()+1,0).getDate(); return (dim-a.getDate()+1)/dim; }
// 월별 M/M. 구조는 v2.9.62 그대로: 총M/M는 투입일 앵커, 시작월=일수 비율(지정 자리에서 반올림), 중간월=1, 마지막 월=총M/M−앞 달 합.
function mmMonthly(sd,ed,opt){
  const o=opt||calcOpt(); const rd=x=>calcRatio(x,o.mmRound,o.mmMode);
  const pr=mmParts(sd,ed); if(!pr) return [];
  const total=pr.months+pr.frac;
  const list=monthList(sd,ed).map(x=>({...x,mm:0}));
  if(list.length===1){ list[0].mm=rd(total); return list; }
  const ff=firstFrac(sd); const first=ff>=1?1:rd(ff);
  list[0].mm=first; let acc=first;
  for(let i=1;i<list.length-1;i++){ list[i].mm=1; acc+=1; }
  list[list.length-1].mm=Math.max(0,rd(total-acc));
  return list;
}
// 월별 금액(실제 계산) — 부분월은 "반올림한 비율×단가"를 단위·방식(절사/반올림)으로 처리, 만근월은 단가, 마지막 월은 총액−앞 달 합.
// 총액 = 단가×완전월 + (남은 일수 비율을 같은 규칙으로 처리한 금액). 반환 [{y,m,mm(표시),amount}]
function monthlyAmounts(price,sd,ed,opt){
  const o=opt||calcOpt(); const pr=mmParts(sd,ed); if(!pr) return [];
  const mms=mmMonthly(sd,ed,o); const n=mms.length; if(!n) return [];
  const rd=x=>calcRatio(x,o.mmRound,o.mmMode);
  const part=ratio=>calcUnit(price*rd(ratio),o.cutUnit,o.cutMode);
  const totalAmt=price*pr.months+(pr.frac>0?part(pr.frac):0);
  if(n===1) return [{...mms[0],amount:totalAmt}];
  const ff=firstFrac(sd); let acc=0;
  return mms.map((x,i)=>{
    let v;
    if(i===n-1) v=Math.max(0,totalAmt-acc);
    else if(i===0) v=ff>=1?price:part(ff);
    else v=price;
    acc+=v; return {...x,amount:v};
  });
}
// 견적 인건비 한 행의 총액(단가×투입). 기간이 있고 MM이 날짜 계산값과 같으면 월별 금액 합(부분월 절사 반영), 아니면 단가×MM(직접 고친 MM 존중). 급여형 매입은 기존 식 그대로.
function laborAmt(e,field){
  const p=parseInt(String(e[field]??'').replace(/,/g,''),10)||0, mm=parseFloat(e.mm)||0;
  if(field==='buy_price'&&String(e.memo||'').startsWith('급여형')) return Math.round(p*mm);
  if(e.start_date&&e.end_date){ const t=parseFloat(mmTotal(e.start_date,e.end_date));
    if(t>0&&Math.abs(t-mm)<0.006) return monthlyAmounts(p,e.start_date,e.end_date,calcOpt(e,field)).reduce((x,y)=>x+y.amount,0); }
  return Math.round(p*mm);
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
      Object.keys(monthlyOverride).filter(k=>/^\d{4}-\d{2}$/.test(k)).forEach(k=>{ byM[k]=(byM[k]||0)+(_n(monthlyOverride[k])); });
      return;
    }
    // v2.9.30: UI 표준(단가×MM=총액 대칭 구조, 사용자 확립)에 따라 사업소득형의 buy_price도 다시
    // "단가"로 되돌아왔으므로(v2.9.26~27의 총액 직접입력 방식은 폐기), 세금계산서형과 완전히 동일한
    // mmMonthly(단가×월별 근무비중) 경로를 그대로 탄다 — 별도 분기가 불필요해졌다(v2.9.27의 isBizIncome
    // 분기를 유지했다면 이제 "단가"를 "총액"으로 오인해 이중으로 나누는 반대 방향의 결함이 재발했을 것).
    const p=_n(e[priceField]); if(!p)return;
    if(e.comp_type==='인건비'){
      // v2.9.111: 금액은 M/M 표시값(반올림)이 아니라 정확한 일수 비율로 계산하고 절사 단위를 적용한다(행의 mm_round·cut_unit, 없으면 설정 기본값)
      monthlyAmounts(p,e.start_date||defStart,e.end_date||defEnd,calcOpt(e,priceField)).forEach(x=>{
        const k=`${x.y}-${pad2(x.m)}`; byM[k]=(byM[k]||0)+x.amount;});
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

// v2.9.111: 통장 CSV 운영 리듬(자금 입출 리듬 설계서 v0.1 §6) — 오늘(today)과 저장된 마지막 거래일(last)로 알림을 정한다. 순수 함수.
// 규칙: 1일=전월 말일까지 CSV 신청 안내 / 2일부터 전월 말일 데이터 없으면 지연 / 13~15일 12일까지 데이터 없으면 업로드 안내 / 16일부터 없으면 지연.
function csvRhythm(today,last){
  const out=[]; if(!today) return out;
  const [y,m,d]=today.split('-').map(Number); const pe=new Date(y,m-1,0); // 전월 말일
  const prevEnd=`${pe.getFullYear()}-${String(pe.getMonth()+1).padStart(2,'0')}-${String(pe.getDate()).padStart(2,'0')}`;
  const ym=today.slice(0,7), c12=ym+'-12', L=last||'';
  const tail=L?` (마지막 거래일 ${L})`:' (저장된 거래가 없습니다)';
  if(d>=2&&L<prevEnd) out.push({level:'late',msg:`전월 마감용 CSV(전월 말일까지)가 아직 올라오지 않았습니다${tail}`});
  if(d===1&&L<prevEnd) out.push({level:'info',msg:'은행에 전월 말일까지 거래내역 CSV를 신청하세요(수령은 2일)'});
  if(d>=13&&d<=15&&L<c12) out.push({level:'info',msg:`오늘~15일 사이에 CSV를 올려 주세요. 10~12일 지급분이 아직 반영되지 않았습니다${tail}`});
  if(d>=16&&L<c12) out.push({level:'late',msg:`당월 10~12일 지급분이 아직 반영되지 않았습니다${tail}`});
  return out;
}

// ── v2.9.111: 법인카드 월 예산 방식(설계서 cash-rhythm v0.2, 사용자 승인) ──
// 고정비 항목명이 「법인카드」인 줄은 그 달 월 예산으로 본다. 체크카드라 쓴 날 통장에서 빠지므로
// 사용액 = 그 달 통장 거래 중 유형(category)이 법인카드인 건의 순액(출금-입금). 남은 사용 예상 = max(0, 예산-사용).
const CARD_BUDGET_ITEM='법인카드';
function isCardBudget(f){ return String((f&&f.category)||'').trim()===CARD_BUDGET_ITEM; }
function cardBudgetStatus(ym,fixRows,detailRows){
  const n=v=>parseInt(String(v??'').replace(/,/g,'').trim())||0;
  const budget=(fixRows||[]).filter(f=>isCardBudget(f)&&f.year_month===ym).reduce((s,f)=>s+n(f.amount),0);
  const used=(detailRows||[]).filter(t=>String(t.category||'').trim()===CARD_BUDGET_ITEM&&String(t.txn_date||'').slice(0,7)===ym)
    .reduce((s,t)=>s+n(t.outflow_amt)-n(t.inflow_amt),0);
  return {budget,used,remain:Math.max(0,budget-used),over:Math.max(0,used-budget)};
}
// 월 예산 월 목록(예산이 있는 달) — 마지막 거래일(last)이 그 달 말일 이전일 때만 「남은 예상」이 유효(월이 이미 끝까지 반영됐으면 0)
function cardBudgetMonths(fixRows){ return [...new Set((fixRows||[]).filter(isCardBudget).map(f=>f.year_month).filter(Boolean))].sort(); }
