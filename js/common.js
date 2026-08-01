// HFC common.js v2.0 — 설정·인증·API·유틸 단일 정의(SSOT)
const SHEETS_ID='1PZs1mEbqoWUlgbx7FgvCoTHoDjzJTv6JNDoX6-yVg5Q';
const API_KEY='AIzaSyBrS2UCtL1aRqo-lFltJvbCwNxTt_ooIOE';
const CLIENT_ID='129067702204-tn3oom6h6giu0cj2bphs4ve8rsti03be.apps.googleusercontent.com';
const SCOPES='https://www.googleapis.com/auth/spreadsheets';
let accessToken=null,tokenClient;
function initOAuth(){
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CLIENT_ID,scope:SCOPES,
    callback:(resp)=>{
      if(resp.access_token){ accessToken=resp.access_token; toast('로그인 완료 ✓'); }
      if(pendingAuth){ const r=pendingAuth; pendingAuth=null; r(!!accessToken); }
    }
  });
}
function signIn(){
  return new Promise(res=>{
    pendingAuth=res;
    try{ tokenClient.requestAccessToken(); }
    catch(e){ pendingAuth=null; res(false); return; }
    setTimeout(()=>{ if(pendingAuth){ const r=pendingAuth; pendingAuth=null; r(!!accessToken); } },60000);
  });
}
async function fetchSheet(sheet,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!'+range)}?key=${API_KEY}`;
  const res=await fetch(url);
  if(!res.ok) throw new Error(sheet+' 읽기 오류 '+res.status);
  return (await res.json()).values||[];
}
async function clearAndWrite(sheet,range,rows){
  if(!accessToken){ await signIn(); if(!accessToken) return false; }
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheet+'!'+range)}`;
  try{
    let r=await fetch(base+':clear',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});
    if(!r.ok) throw new Error('clear '+r.status);
    r=await fetch(base+'?valueInputOption=RAW',{method:'PUT',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
    if(!r.ok) throw new Error('write '+r.status);
    return true;
  }catch(e){ console.error(e); return false; }
}
function toObj(rows){ if(!rows||!rows.length) return []; const h=rows[0]; return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??'']))); }
const toObjects=toObj;
function dedupe(list,key){ const m=new Map(); (list||[]).forEach(r=>{ if(r&&r[key]) m.set(r[key],r); }); return [...m.values()]; }
function toast(msg,err=false){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.style.background=err?'#DC2626':'#1A202C'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function comma(n){ return (parseInt(String(n).replace(/,/g,''))||0).toLocaleString(); }
function wonFull(n){ return comma(n)+'원'; }
function fc(el){ el.value=comma(el.value); }
function un(v){ return parseInt(String(v).replace(/,/g,''))||0; }
