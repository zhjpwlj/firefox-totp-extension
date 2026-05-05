const ui={csvFile:csvFile,csvInput:csvInput,masterPassword:masterPassword,importBtn:importBtn,unlockPassword:unlockPassword,unlockBtn:unlockBtn,search:search,accountList:accountList,lockBtn:lockBtn,viewToggle:viewToggle,status:status,vault:vault,lockTimeout:lockTimeout};
let viewAll=false,currentDomain="",allAccounts=[],matchedAccounts=[];
const setStatus=(m)=>ui.status.textContent=m;

async function getCurrentTabDomain(){const t=await browser.tabs.query({active:true,currentWindow:true});try{return new URL(t[0].url).hostname}catch{return""}}
function secondsRemaining(){return 30-(Math.floor(Date.now()/1000)%30)}

async function renderAccounts(){
  const q=ui.search.value.toLowerCase().trim();
  const source=(viewAll?allAccounts:matchedAccounts).filter(a=>[a.name,a.username,a.url].join(" ").toLowerCase().includes(q));
  ui.accountList.innerHTML="";
  for(const a of source){
    const d=document.createElement("div");d.className="account";
    d.innerHTML=`<div><strong>${a.name}</strong></div><div class="meta">${a.username} · ${a.url||'No URL'}</div><div class="actions"><button data-act="copy-user">Copy User</button><button data-act="copy-pass">Copy Pass</button>${a.totp_secret?'<button data-act="copy-totp">Copy TOTP</button>':''}</div>`;
    d.addEventListener("click",async(e)=>{const act=e.target?.dataset?.act;if(!act)return; if(act==='copy-user')await navigator.clipboard.writeText(a.username||''); if(act==='copy-pass')await navigator.clipboard.writeText(a.password||''); if(act==='copy-totp'){const r=await browser.runtime.sendMessage({type:'GENERATE_TOTP',secret:a.totp_secret});if(r?.ok)await navigator.clipboard.writeText(r.code);} setStatus(`Copied (${act.replace('copy-','')})`);});
    ui.accountList.appendChild(d);
  }
}

async function refreshMatches(){
  const res=await browser.runtime.sendMessage({type:"GET_MATCHING_ACCOUNTS",domain:currentDomain});
  if(!res?.ok){ui.vault.classList.add("hidden");setStatus("Vault locked. Unlock to continue.");return;}
  matchedAccounts=res.matches;allAccounts=res.all;ui.vault.classList.remove("hidden");
  setStatus(`Site matches: ${matchedAccounts.length} • TOTP refresh in ${secondsRemaining()}s`);
  renderAccounts();
}

ui.csvFile.addEventListener('change',async()=>{const f=ui.csvFile.files?.[0];if(f)ui.csvInput.value=await f.text();});
ui.importBtn.addEventListener("click",async()=>{const csv=ui.csvInput.value,password=ui.masterPassword.value;if(!csv||!password)return setStatus("CSV + Master Password required.");const parsed=await browser.runtime.sendMessage({type:"IMPORT_CSV",csv});const saved=await browser.runtime.sendMessage({type:"SAVE_ENCRYPTED_VAULT",accounts:parsed.imported,masterPassword:password});setStatus(saved?.ok?`Imported ${parsed.imported.length} account(s).`:"Import failed.")});
ui.unlockBtn.addEventListener("click",async()=>{const mins=Math.max(1,Math.min(60,Number(ui.lockTimeout.value||10)));await browser.runtime.sendMessage({type:'UPDATE_SETTINGS',lockTimeoutMs:mins*60_000});const r=await browser.runtime.sendMessage({type:"UNLOCK_VAULT",masterPassword:ui.unlockPassword.value});if(!r?.ok)return setStatus(r?.error||'Unlock failed');refreshMatches();});
ui.lockBtn.addEventListener("click",async()=>{await browser.runtime.sendMessage({type:"LOCK_VAULT"});ui.vault.classList.add("hidden");setStatus("Vault locked.")});
ui.viewToggle.addEventListener("click",()=>{viewAll=!viewAll;ui.viewToggle.textContent=viewAll?"Site Only":"View All";renderAccounts();});
ui.search.addEventListener("input",renderAccounts);
setInterval(()=>{if(!ui.vault.classList.contains('hidden')) refreshMatches();},5000);
(async()=>{currentDomain=await getCurrentTabDomain();setStatus(`Current domain: ${currentDomain||'N/A'}`);})();
