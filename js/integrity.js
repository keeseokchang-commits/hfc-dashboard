// HFC 데이터 점검 v3.5.0 — 시트를 읽기만 해서 서로 맞지 않는 곳을 찾는다(순수 함수, 화면·시트 접근 없음).
// 근거: 무결성 점검(STF-BAT-02) 설계 — 묶음 A 인력 / B 재무 / C 코드. 이 파일은 시트를 고치지 않는다.
// 의존: schema.js(R·HR_TABS·HR_CODE_COLS·HR_CODE_RE·hrCodeMapOf·hrCellToCodes), calc.js(calcSumMatch·splitIds)
// 입력 data: { 시트키: 값 2차원 배열(헤더 포함, R 범위로 읽은 그대로) | null(읽지 못함·탭 없음) }
// 출력: [{id,title,items:[{label,status:'ok'|'warn'|'err'|'skip',count,note,details:[{sheet,row,text}]}]}]
const INTEG_MAX_DETAIL=30;   // 항목별 자세히 보여 주는 최대 줄 수(전체 건수는 count에 그대로)
const INTEG_WARN_RATIO=0.9;  // 읽기 한도의 90% 이상이면 경고

function integTable(values){   // 값 배열 → {hdr, rows:[{row(시트 행 번호), o}]}
  if(!values||!values.length) return null;
  const hdr=(values[0]||[]).map(x=>String(x??'').trim());
  const rows=[];
  for(let i=1;i<values.length;i++){
    const r=values[i]||[]; if(!r.some(x=>String(x??'').trim()!=='')) continue;
    const o={}; hdr.forEach((h,j)=>{ if(h) o[h]=String(r[j]??'').trim(); });
    rows.push({row:i+1,o});
  }
  return {hdr,rows};
}
function integItem(label,details,opt){
  opt=opt||{}; const n=details.length;
  return {label,status:n?(opt.warn?'warn':'err'):'ok',count:n,note:opt.note||'',details:details.slice(0,INTEG_MAX_DETAIL),more:Math.max(0,n-INTEG_MAX_DETAIL)};
}
function integSkip(label,why){ return {label,status:'skip',count:0,note:why,details:[],more:0}; }
function integLimitOf(key){ const rg=(typeof R!=='undefined'&&R[key])?String(R[key][1]):''; const m=rg.match(/:[A-Z]+(\d+)$/); return m?parseInt(m[1],10):0; }

// ── A. 인력 ──
const INTEG_HR_KEYS=['S20','S21','S22','S23','S24','S25','S26','S27','S28','S29','S31','S32','S33','S34','S36','S37','S38','S39'];
const INTEG_FK=[   // [자식, 열, 부모, 부모 열] — 빈 칸은 건너뛴다
  ['S21','person_id','S20','person_id'],['S22','person_id','S20','person_id'],['S23','person_id','S20','person_id'],
  ['S24','person_id','S20','person_id'],['S25','person_id','S20','person_id'],['S26','person_id','S20','person_id'],
  ['S28','person_id','S20','person_id'],['S28','match_person_id','S20','person_id'],['S29','person_id','S20','person_id'],
  ['S39','person_id','S20','person_id'],['S31','person_id','S20','person_id'],
  ['S31','line_id','S33','line_id'],['S33','request_id','S32','request_id'],
  ['S34','request_id','S32','request_id'],['S34','line_id','S33','line_id'],['S38','cand_id','S31','cand_id'],
  ['S36','party_id','S27','party_id'],['S32','requester_party_id','S27','party_id'],
];
function integGroupA(data){
  const t={}; INTEG_HR_KEYS.forEach(k=>{ t[k]=integTable(data[k]); });
  const items=[];
  if(!t.S20){ return {id:'A',title:'A. 인력',items:[integSkip('인력 시트','인력 탭(S20_PERSON)을 읽지 못해 점검을 건너뛰었습니다.')]}; }
  // A1 번호 중복(각 탭의 첫 열)
  const dup=[];
  INTEG_HR_KEYS.forEach(k=>{ const tb=t[k]; if(!tb||!tb.hdr.length) return; const idc=tb.hdr[0]; const seen={};
    tb.rows.forEach(r=>{ const v=r.o[idc]; if(!v) return; (seen[v]=seen[v]||[]).push(r.row); });
    Object.entries(seen).filter(([,rs])=>rs.length>1).forEach(([v,rs])=>dup.push({sheet:R[k][0],row:rs[0],text:`${idc} ${v} 가 ${rs.length}번 쓰임 (행 ${rs.join(', ')})`}));
  });
  items.push(integItem('같은 번호(ID)가 두 번 쓰인 곳',dup));
  // A2 없는 번호를 가리키는 행
  const orph=[];
  INTEG_FK.forEach(([c,col,p,pcol])=>{ const ct=t[c], pt=t[p]; if(!ct||!pt||!ct.hdr.includes(col)) return;
    const ids=new Set(pt.rows.map(r=>r.o[pcol]).filter(Boolean));
    ct.rows.forEach(r=>{ const v=r.o[col]; if(v&&!ids.has(v)) orph.push({sheet:R[c][0],row:r.row,text:`${col} ${v} 가 ${R[p][0]} 에 없음`}); });
  });
  items.push(integItem('없는 번호를 가리키는 행(고아 행)',orph));
  // A3 합쳐진 인력이 아직 쓰이는 곳
  const merged=new Set(t.S20.rows.filter(r=>r.o.merged_into).map(r=>r.o.person_id));
  const stale=[];
  if(merged.size) ['S21','S22','S23','S24','S25','S26','S28','S29','S31','S39'].forEach(k=>{ const tb=t[k]; if(!tb||!tb.hdr.includes('person_id')) return;
    tb.rows.forEach(r=>{ if(merged.has(r.o.person_id)) stale.push({sheet:R[k][0],row:r.row,text:`합쳐져 숨겨진 인력 ${r.o.person_id} 를 아직 가리킴`}); }); });
  items.push(integItem('합쳐진(숨겨진) 인력을 아직 가리키는 행',stale));
  return {id:'A',title:'A. 인력',items};
}

// ── B. 재무 ──
const INTEG_LIMIT_KEYS=['S01','S03','S04','S05','S06','S07','S08_DETAIL','S10','S12','S14','S15','S16','S17',...INTEG_HR_KEYS];
function integGroupB(data){
  const items=[];
  const s04=integTable(data.S04), s05=integTable(data.S05), s06=integTable(data.S06), det=integTable(data.S08_DETAIL);
  if(!det){ items.push(integSkip('거래 연결','통장 거래(S08_DETAIL)를 읽지 못해 연결 점검을 건너뛰었습니다.')); }
  else{
    const tx={}; det.rows.forEach(r=>{ if(r.o.txn_id) tx[r.o.txn_id]=r.o; });
    const num=v=>parseInt(String(v||'').replace(/,/g,''),10)||0;
    // B1 없는 거래를 가리키는 연결 번호
    const ghost=[];
    [[s04,'S04'],[s05,'S05'],[s06,'S06']].forEach(([tb,k])=>{ if(!tb||!tb.hdr.includes('matched_txn_id')) return;
      tb.rows.forEach(r=>splitIds(r.o.matched_txn_id).forEach(id=>{ if(!tx[id]) ghost.push({sheet:R[k][0],row:r.row,text:`연결된 거래 ${id} 가 ${R.S08_DETAIL[0]} 에 없음`}); })); });
    items.push(integItem('없는 거래를 가리키는 연결 번호',ghost));
    // B2 거래 한 건이 서로 맞지 않게 중복 연결된 경우 (합산 매칭은 합계가 허용 범위 안이면 정상)
    const bad=[];
    const grp=(tb,amtFn,dirKey,k)=>{ if(!tb||!tb.hdr.includes('matched_txn_id')) return;
      const by={}; tb.rows.forEach(r=>{ splitIds(r.o.matched_txn_id).forEach(id=>{ (by[id]=by[id]||[]).push(r); }); });
      Object.entries(by).forEach(([id,rs])=>{ if(rs.length<2||!tx[id]) return;
        const r=calcSumMatch(rs.map(x=>amtFn(x.o)),num(tx[id][dirKey]));
        if(!r.ok) bad.push({sheet:R[k][0],row:rs[0].row,text:`거래 ${id} 에 ${rs.length}건이 연결됨 — 합계 ${r.sum.toLocaleString()}원 / 거래 ${r.txnAmt.toLocaleString()}원 (차액 ${r.diff.toLocaleString()}원, 허용 ±${r.tol.toLocaleString()}원 초과)`}); }); };
    grp(s04,o=>num(o.cash_recv_amt),'inflow_amt','S04');
    grp(s05,o=>Math.round(num(o.amount)*1.1),'outflow_amt','S05');
    // 고정비는 거래 여러 건 → 계획 1건이 정상이므로, 같은 거래가 계획 두 건 이상에 걸린 경우만 본다
    if(s06&&s06.hdr.includes('matched_txn_id')){ const by={}; s06.rows.forEach(r=>splitIds(r.o.matched_txn_id).forEach(id=>{ (by[id]=by[id]||[]).push(r.row); }));
      Object.entries(by).filter(([,rs])=>rs.length>1).forEach(([id,rs])=>bad.push({sheet:R.S06[0],row:rs[0],text:`거래 ${id} 가 고정비 계획 ${rs.length}건에 걸림 (행 ${rs.join(', ')})`})); }
    // 서로 다른 종류(매출·매입·고정비)에 같은 거래가 걸린 경우
    const kinds={}; [[s04,'매출'],[s05,'매입'],[s06,'고정비']].forEach(([tb,nm])=>{ if(!tb||!tb.hdr.includes('matched_txn_id')) return;
      tb.rows.forEach(r=>splitIds(r.o.matched_txn_id).forEach(id=>{ (kinds[id]=kinds[id]||{})[nm]=r.row; })); });
    Object.entries(kinds).filter(([,k])=>Object.keys(k).length>1).forEach(([id,k])=>bad.push({sheet:R.S08_DETAIL[0],row:0,text:`거래 ${id} 가 ${Object.keys(k).join('·')} 에 동시에 연결됨`}));
    items.push(integItem('거래 한 건이 맞지 않게 중복 연결된 곳',bad,{note:'합산 매칭(합계가 허용 범위 안)은 정상으로 봅니다.'}));
  }
  // B3 읽기 한도(행이 잘려 저장 때 사라질 위험)
  const lim=[]; let anyErr=false;
  INTEG_LIMIT_KEYS.forEach(k=>{ const v=data[k]; const L=integLimitOf(k); if(!v||!L) return;
    const n=v.length; if(n>=L){ anyErr=true; lim.push({sheet:R[k][0],row:0,text:`읽은 행이 한도(${L}행)를 채움 — 뒤쪽 행이 잘렸을 수 있고, 저장하면 사라집니다`}); }
    else if(n>=L*INTEG_WARN_RATIO) lim.push({sheet:R[k][0],row:0,text:`한도 ${L}행 중 ${n}행 사용 (${Math.round(n/L*100)}%) — 곧 한도에 닿습니다`}); });
  items.push(integItem('읽기 한도에 가까운 시트',lim,{warn:!anyErr}));
  return {id:'B',title:'B. 재무',items};
}

// ── C. 코드 ──
const INTEG_CODE_COL_FIN=[   // [시트키, 이름 열, 코드 열, S10 코드군]
  ['S08_DETAIL','category','type_code','txn_type'],['S06','category','item_code','fixed_item'],
];
function integGroupC(data){
  const items=[]; const s10=integTable(data.S10);
  if(!s10||!s10.hdr.includes('code_id')) return {id:'C',title:'C. 코드',items:[integSkip('코드 점검','설정(S10)을 읽지 못했거나 아직 코드 열이 없습니다. 「코드 전체 저장」을 먼저 실행하세요.')]};
  const rowsS10=s10.rows.map(r=>r.o);
  const byCode={}; rowsS10.forEach(o=>{ if(o.code_id) byCode[o.code_id]=o; });
  const un=[], inactive=[], ghost=[];
  const checkCode=(sheet,row,col,code)=>{ const o=byCode[code]; if(!o){ ghost.push({sheet,row,text:`${col} ${code} 가 설정(S10)에 없음`}); return; }
    if(String(o.is_active||'').toUpperCase()==='N') inactive.push({sheet,row,text:`${col} ${code}(${o.setting_key||''}) 는 사용 중지된 코드`}); };
  INTEG_CODE_COL_FIN.forEach(([k,nameCol,codeCol,cat])=>{ const tb=integTable(data[k]); if(!tb||!tb.hdr.includes(codeCol)) return;
    tb.rows.forEach(r=>{ const nm=r.o[nameCol], cd=r.o[codeCol];
      if(cd) checkCode(R[k][0],r.row,codeCol,cd);
      else if(nm) un.push({sheet:R[k][0],row:r.row,text:`${nameCol} "${nm}" 에 코드가 없음 (코드 이관 필요)`}); }); });
  const map=hrCodeMapOf(rowsS10);
  HR_CODE_COLS.forEach(c=>{ const tb=integTable(data[c.sheet]); if(!tb||!tb.hdr.includes(c.col)) return;
    tb.rows.forEach(r=>{ const v=r.o[c.col]; if(!v) return;
      (c.multi?v.split(','):[v]).map(x=>x.trim()).filter(Boolean).forEach(x=>{
        if(HR_CODE_RE.test(x)) checkCode(R[c.sheet][0],r.row,c.col,x);
        else{ const cc=hrCellToCodes(map,c.cat,x,false); if(HR_CODE_RE.test(cc)) un.push({sheet:R[c.sheet][0],row:r.row,text:`${c.col} "${x}" 가 이름으로 저장됨 (코드 ${cc} 로 이관 필요)`});
          else un.push({sheet:R[c.sheet][0],row:r.row,text:`${c.col} "${x}" 는 등록된 코드 이름이 아님`}); } }); }); });
  items.push(integItem('코드로 바꾸지 못한 이름이 남은 칸',un,{warn:true,note:'이관 전에는 정상적으로 남아 있을 수 있습니다. 설정 화면의 「코드 이관」으로 채웁니다.'}));
  items.push(integItem('설정에 없는 코드를 쓰는 칸',ghost));
  items.push(integItem('사용 중지된 코드를 쓰는 칸',inactive,{warn:true,note:'기존 기록은 그대로 두고, 새 입력에만 쓰지 않는 코드입니다.'}));
  return {id:'C',title:'C. 코드',items};
}

function integrityRun(data){ return [integGroupA(data),integGroupB(data),integGroupC(data)]; }
// 요약: 오류 N건·경고 N건
function integritySummary(groups){ let err=0,warn=0; groups.forEach(g=>g.items.forEach(i=>{ if(i.status==='err') err+=i.count; else if(i.status==='warn') warn+=i.count; })); return {err,warn}; }
if(typeof module!=='undefined') module.exports={integrityRun,integritySummary,integTable};
