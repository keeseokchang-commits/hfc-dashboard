// HFC hr-quick.js v3.10.0 — 인력 의뢰 원스톱 등록: 선택 목록에서 화면을 떠나지 않고 거래처·코드값을 새로 만든다
// 근거: 인력의뢰 프로세스 간소화 설계서 v0.2 §4 원칙 6 · AT-SP-10·11.
// 하는 일: ① 작은 입력창(모달) ② 거래처(S27) 새로 등록 ③ 코드값(S10: 역할·업종·프로젝트 유형) 새로 등록(코드는 자동 채번, 이름만 입력)
// 지키는 것: 같은 이름이 있으면 만들지 않고 기존 값을 고르게 한다 / 읽기에 실패하면 쓰지 않는다 / 저장된 뒤에만 호출한 화면에 돌려준다.
// 의존: schema.js(ST·S10_CODE_PREFIX·nextCodeId·R), common.js(fetchSheetSafe·kstToday·toObj), cmn-sheet.js(hrAppend·hrSend·hrReadMany·hrCodeMap·HR_API), hr-ui.js
const HQ_NEW='__new__';                         // 선택 목록의 「+ 새로 등록」 항목 값
const hqNorm=s=>String(s??'').toLowerCase().replace(/\s+/g,'').replace(/\(주\)|（주）|㈜|주식회사/g,'');
const HQ_CODE_LABEL={role:'역할',industry:'업종',project_type:'프로젝트 유형'};

// 이미 있는 이름 찾기(순수). rows=[{name,...}] — 정규화한 이름이 같으면 같은 것
function hqFindSame(rows,name,nameOf){ const w=hqNorm(name); if(!w) return null; return (rows||[]).find(r=>hqNorm(nameOf?nameOf(r):r.name)===w)||null; }
// 새 코드값 한 줄을 시트 머리글 순서에 맞춰 만든다(순수). headers=S10 1행, used=같은 코드군의 기존 코드
function hqCodeRow(headers,cat,name,used,today){
  const rec={setting_key:name,setting_value:'',category:cat,description:'',updated_at:today,code_id:nextCodeId(S10_CODE_PREFIX[cat],used),is_active:'Y'};
  return {rec,row:headers.map(h=>rec[h]===undefined?'':rec[h])};
}

// ── 모달 ────────────────────────────────────────────────────────────────────
// spec: {title, help?, fields:[{id,label,kind:'text'|'chips',options?,value?,required?}], save:async(vals)=>({ok,error?,result?})}
// 반환: Promise<result|null>  (취소·닫기 = null)
function hqModal(spec){
  return new Promise(resolve=>{
    const ov=document.createElement('div'); ov.className='hr-modal-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    const sel={}; spec.fields.forEach(f=>{ if(f.kind==='chips') sel[f.id]=new Set(f.value||[]); });
    const fieldHtml=spec.fields.map(f=>f.kind==='chips'
      ? `<div class="hr-field"><div class="hr-lbl${f.required?' hr-req':''}">${hrEsc(f.label)}</div><div class="hr-chips" data-hq-chips="${hrEsc(f.id)}" style="margin-top:4px">${f.options.map(o=>`<span class="hr-chip${sel[f.id].has(o)?' on':''}" data-hq-chip="${hrEsc(o)}">${hrEsc(o)}</span>`).join('')}</div><div class="hr-err" data-hq-err="${hrEsc(f.id)}"></div></div>`
      : `<div class="hr-field"><label class="${f.required?'hr-req':''}" for="hq_${hrEsc(f.id)}">${hrEsc(f.label)}</label><input class="hr-input" id="hq_${hrEsc(f.id)}" maxlength="100" value="${hrEsc(f.value||'')}" autocomplete="off"><div class="hr-err" data-hq-err="${hrEsc(f.id)}"></div></div>`).join('');
    ov.innerHTML=`<div class="hr-modal"><div class="hr-modal-title">${hrEsc(spec.title)}</div>${spec.help?`<div class="hr-help" style="margin-bottom:8px">${hrEsc(spec.help)}</div>`:''}${fieldHtml}
      <div class="hr-err" data-hq-msg style="margin-top:6px"></div>
      <div class="hr-row" style="margin-top:12px"><button type="button" class="btn btn-primary" data-hq="save">등록</button><button type="button" class="btn btn-secondary" data-hq="cancel">취소</button></div></div>`;
    document.body.appendChild(ov);
    const done=v=>{ document.removeEventListener('keydown',onKey,true); ov.remove(); resolve(v); };
    const errs=()=>ov.querySelectorAll('[data-hq-err],[data-hq-msg]').forEach(e=>{ e.textContent=''; });
    const doSave=async()=>{
      errs(); const vals={}; let bad=false;
      spec.fields.forEach(f=>{
        const v=f.kind==='chips'?[...sel[f.id]]:ov.querySelector('#hq_'+f.id).value.trim(); vals[f.id]=v;
        if(f.required&&(f.kind==='chips'?!v.length:!v)){ ov.querySelector(`[data-hq-err="${f.id}"]`).textContent=`${f.label}을(를) ${f.kind==='chips'?'선택':'입력'}해 주세요.`; bad=true; }
      });
      if(bad) return;
      const btn=ov.querySelector('[data-hq="save"]'); btn.disabled=true;
      let r; try{ r=await spec.save(vals); }catch(e){ r={ok:false,error:'저장하지 못했습니다. 다시 시도해 주세요.'}; }
      btn.disabled=false;
      if(!r.ok){ ov.querySelector('[data-hq-msg]').textContent=r.error||'저장하지 못했습니다. 다시 시도해 주세요.'; return; }
      done(r.result);
    };
    const onKey=ev=>{ if(ev.key==='Escape'){ ev.stopPropagation(); done(null); } };
    document.addEventListener('keydown',onKey,true);
    ov.addEventListener('click',ev=>{
      if(ev.target===ov){ return; }                                   // 바깥 클릭으로는 닫지 않는다(입력 중 실수 방지)
      const c=ev.target.closest('[data-hq-chip]'); if(c){ const set=sel[c.parentElement.dataset.hqChips]; const v=c.dataset.hqChip; set.has(v)?set.delete(v):set.add(v); c.classList.toggle('on'); return; }
      const b=ev.target.closest('[data-hq]'); if(!b) return; b.dataset.hq==='save'?doSave():done(null);
    });
    ov.addEventListener('keydown',ev=>{ if(ev.key==='Enter'&&ev.target.tagName==='INPUT'){ ev.preventDefault(); doSave(); } });
    const first=ov.querySelector('input'); if(first) first.focus();
  });
}

// ── 거래처(S27) ─────────────────────────────────────────────────────────────
// opts.roles = 미리 눌러 둘 역할(예: 요청자 → ['고객'], 서치업체 → ['서치업체']). 반환: 새 거래처 행 또는 null
async function hqNewParty(opts={}){
  return hqModal({title:'거래처 새로 등록',help:'등록하면 바로 선택됩니다. 담당자·연락처 등은 나중에 거래처 관리에서 보완하세요.',
    fields:[{id:'name',label:'거래처명',kind:'text',required:true},{id:'roles',label:'역할',kind:'chips',options:ST.PARTY_ROLES,value:opts.roles||[],required:true}],
    save:async v=>{
      const r=await hrReadMany(['S27']); if(r.failed.length) return {ok:false,error:'거래처 목록을 읽지 못해 등록하지 않았습니다. 다시 시도해 주세요.'};
      const same=hqFindSame(r.tabs.S27.rows,v.name);
      if(same) return {ok:false,error:`같은 이름의 거래처(${same.name}, ${same.party_id})가 이미 있습니다. 목록에서 선택해 주세요.`};
      const rec={name:v.name,roles:ST.PARTY_ROLES.filter(x=>v.roles.includes(x)).join(','),aliases:'',main_phone:'',memo:'',is_active:'Y'};
      const a=await hrAppend('S27',rec); if(!a.ok) return {ok:false,error:hrSaveFailText(a)};
      return {ok:true,result:{...rec,party_id:a.id,created_at:hrToday(),updated_at:''}};
    }});
}

// ── 코드값(S10) ─────────────────────────────────────────────────────────────
// cat = role | industry | project_type. 이름만 입력받고 코드(RL-001 …)는 자동으로 붙인다. 반환: {name,code_id} 또는 null
async function hqNewCode(cat,opts={}){
  const label=HQ_CODE_LABEL[cat]||cat;
  return hqModal({title:`${label} 새로 등록`,help:'등록하면 바로 선택됩니다. 코드 번호는 자동으로 붙습니다. 이름 변경·사용 중지는 설정 화면의 코드 관리에서 합니다.',
    fields:[{id:'name',label:`${label} 이름`,kind:'text',required:true,value:opts.name||''}],
    save:async v=>{
      if(!S10_CODE_PREFIX[cat]) return {ok:false,error:'알 수 없는 코드군입니다.'};
      const vals=await fetchSheetSafe(...R.S10); if(!vals||!vals.length) return {ok:false,error:'설정을 읽지 못해 등록하지 않았습니다. 다시 시도해 주세요.'};
      const limit=parseInt(R.S10[1].split(':')[1].replace(/\D/g,''),10);
      if(vals.length>=limit) return {ok:false,error:'설정 시트가 읽기 범위를 채워 등록할 수 없습니다. 관리자 확인이 필요합니다.'};
      const headers=vals[0].map(String), rows=toObj(vals).filter(r=>r.category===cat);
      const same=hqFindSame(rows,v.name,r=>r.setting_key);
      if(same) return {ok:false,error:String(same.is_active??'Y').trim().toUpperCase()==='N'?`사용 중지된 같은 이름(${same.setting_key})이 있습니다. 설정 화면의 코드 관리에서 「다시 사용」으로 바꿔 주세요.`:`같은 이름(${same.setting_key})이 이미 있습니다. 목록에서 선택해 주세요.`};
      const {rec,row}=hqCodeRow(headers,cat,v.name,rows.map(r=>r.code_id).filter(Boolean),kstToday());
      const url=`${HR_API}/values/${encodeURIComponent(R.S10[0]+'!A:'+String.fromCharCode(64+Math.max(headers.length,7)))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      const w=await hrSend('POST',url,{values:[row]});
      if(!w.ok) return {ok:false,error:'저장하지 못했습니다. 다시 시도해 주세요.'};
      try{ await hrCodeMap(true); }catch(e){}                       // 코드 지도를 다시 읽어 새 코드가 바로 이름↔코드 변환에 쓰이게 한다
      return {ok:true,result:{name:rec.setting_key,code_id:rec.code_id}};
    }});
}

// 선택 목록(select) 끝에 「+ 새로 등록」 항목을 붙인다. 이미 있으면 다시 붙이지 않는다.
function hqAddNewOption(sel,text){ if(!sel||sel.querySelector(`option[value="${HQ_NEW}"]`)) return; const o=document.createElement('option'); o.value=HQ_NEW; o.textContent=text||'+ 새로 등록…'; sel.appendChild(o); }
