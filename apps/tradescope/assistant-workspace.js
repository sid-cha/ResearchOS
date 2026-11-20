/* Research copilot: evidence-grounded briefs, with opt-in server-side model phrasing. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let caseId=null,focus='overview',last=null;
function safeUrl(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
async function api(path,{method='GET',data}={}){const r=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const p=await r.json().catch(()=>({}));if(!r.ok)throw Error(p.error||'Connection unavailable');return p;}
function render(b){last=b;$('assistMode').textContent=b.mode==='MODEL_ASSISTED'?`AI MODEL · ${b.model||'CONNECTED'}`:'EVIDENCE ENGINE · NO AI KEY';$('assistTitle').textContent=b.heading||'Research brief';$('assistMethod').textContent=b.method||'';
 const lines=b.observations||[];$('assistObservations').innerHTML=lines.length?lines.map((item,i)=>`<div class="assist-observation"><span class="assist-bullet">${String(i+1).padStart(2,'0')}</span><span>${esc(item.text)}</span></div>`).join(''):'<div class="assist-placeholder">No matching verified observations in the saved case.</div>';
 $('assistGaps').innerHTML=(b.gaps||[]).slice(0,4).map(x=>`<div class="assist-gap"><span>!</span>${esc(x.text)}</div>`).join('')||'<div class="assist-placeholder">No gaps identified by the baseline rules. This is not a completeness guarantee.</div>';
 $('assistNext').innerHTML=(b.nextSteps||[]).map((x,i)=>`<div class="assist-next"><span>${i+1}.</span><span>${esc(x)}</span></div>`).join('');
 $('assistRefs').innerHTML=(b.refs||[]).slice(0,5).map(r=>safeUrl(r.url)?`<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.id)} · ${esc(r.title)} ↗</a>`:'').join('')||'<span>None linked yet</span>';
 $('assistCaution').textContent=b.notice||'';
 $('assistModelAnswer').hidden=!b.answer;$('assistModelAnswer').textContent=b.answer||'';
 $('assistError').textContent=b.warning||'';
 $('assistContext').textContent=`${b.symbol||'—'} / ${b.synthetic?'SYNTHETIC':'SOURCED'} / ${String(b.status||'OPEN').replaceAll('_',' ')}`;
}
async function getBrief(nextFocus=focus){focus=nextFocus;document.querySelectorAll('[data-assist-focus]').forEach(x=>x.classList.toggle('is-active',x.dataset.assistFocus===focus));
 if(!caseId){$('assistContext').textContent='NO INVESTIGATION SELECTED';$('assistObservations').innerHTML='<div class="assist-placeholder">Select an investigation in the case queue to generate a grounded evidence brief.</div>';$('assistGaps').innerHTML='';$('assistNext').innerHTML='';$('assistRefs').innerHTML='';return;}
 const old=caseId;$('assistError').textContent='Analyzing saved case evidence…';try{const b=await api(`/api/assistant/cases/${encodeURIComponent(old)}/brief?focus=${encodeURIComponent(focus)}`);if(caseId===old)render(b)}catch(e){$('assistError').textContent=`Analysis unavailable: ${e.message}`;}}
function setCase(id){if(caseId===id)return;caseId=id;getBrief('overview');}
document.querySelectorAll('[data-assist-focus]').forEach(x=>x.addEventListener('click',()=>getBrief(x.dataset.assistFocus)));
$('assistAskForm').addEventListener('submit',async e=>{e.preventDefault();if(!caseId){$('assistError').textContent='Select an investigation first.';return;}const question=$('assistQuestion').value.trim();if(!question)return;
 const b=$('assistAsk');b.disabled=true;$('assistError').textContent='Evaluating case evidence…';try{const data=await api(`/api/assistant/cases/${encodeURIComponent(caseId)}/ask`,{method:'POST',data:{question}});render(data);}catch(err){$('assistError').textContent=err.message;}finally{b.disabled=false;}});
$('assistCopy').addEventListener('click',async()=>{if(!last)return;const text=[last.heading,`Case: ${last.caseId}`,`Source: ${last.mode}`,last.answer||'',...(last.observations||[]).map(x=>'- '+x.text),'Evidence gaps:',...(last.gaps||[]).map(x=>'- '+x.text),'Next steps:',...(last.nextSteps||[]).map(x=>'- '+x),last.notice].filter(Boolean).join('\n');try{await navigator.clipboard.writeText(text);$('assistError').textContent='Brief copied to clipboard.';}catch{$('assistError').textContent='Clipboard access unavailable in this browser.';}});
document.addEventListener('tradescope:case-selected',e=>setCase(e.detail?.id||null));
// Global assistant navigation is owned by workspace-nav.js to avoid hidden-panel scrolling.
getBrief();
})();
