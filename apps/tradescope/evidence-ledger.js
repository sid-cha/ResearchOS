/* Local research journal UI: only our own read-only source API. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async route=>{const r=await fetch('/api/evidence-ledger/'+route,{cache:'no-store'}),v=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(v.error||'Local source journal unavailable');return v;};
let enabled=false;
const show=(x)=>x===null||x===undefined?'—':String(x);
const safeHash=x=>typeof x==='string'?x.slice(0,16)+'…':'—';
async function refresh(){
 try{
  const status=await api('status');enabled=status.enabled===true;
  el('ledgerMode').textContent=enabled?'LOCAL JOURNAL ENABLED':'NOT ENABLED';
  el('entryCount').textContent=enabled?status.entries:'—';
  el('integrity').textContent=show(status.integrity);
  el('lastCaptured').textContent=show(status.lastCapturedAt);
  if(!enabled){el('entries').innerHTML='<tr><td colspan="7">Enable RESEARCH_EVIDENCE_LEDGER_ENABLED=true in local .env to preserve future captures; nothing is silently recorded.</td></tr>';
   el('status').textContent='Local capture is off. Querying this page does not contact upstream sources.';return;}
  const params=new URLSearchParams({limit:el('limit').value}),source=el('source').value,
   subject=el('subject').value.trim();
  if(source)params.set('source',source);
  if(subject)params.set('subject',subject);
  const data=await api('entries?'+params.toString());
  el('entries').innerHTML=data.entries.length?data.entries.map(x=>'<tr><td>#'+esc(x.seq)+'</td><td><strong>'+
   esc(x.subjectId)+'</strong><small>'+esc(x.source)+' · '+esc(x.kind)+'</small></td><td>'+esc(x.capturedAt)+'</td>'+
   '<td>'+esc(show(x.requestedAsOf))+'</td><td><span class="state '+(x.changeStatus==='CHANGED_SINCE_LOCAL_CAPTURE'?'changed':'')+'">'+esc(x.changeStatus.replace(/_/g,' '))+'</span>'+
   (x.priorScopeSeq?'<small>Previous #'+esc(x.priorScopeSeq)+'</small>':'')+'</td><td>'+esc(x.factCount)+'</td>'+
   '<td><button type="button" data-seq="'+esc(x.seq)+'">Inspect</button></td></tr>').join(''):
   '<tr><td colspan="7">No matching records. Create a FRED query or transmission dossier after enabling local capture.</td></tr>';
  el('status').textContent='Verified local hash chain ('+data.entries.length+' visible records). A valid chain is not an independent timestamp guarantee.';
 }catch(e){el('status').textContent='Evidence journal unavailable: '+e.message;
  el('integrity').textContent='CHECK FAILED';}
}
async function inspect(seq){
 try{
  const d=await api('detail?seq='+encodeURIComponent(seq)),fields=[
   ['Capture sequence','#'+d.seq],['Source',d.source],['Subject',d.subjectId],['Kind',d.kind],
   ['Captured UTC',d.capturedAt],['Requested historical as-of',d.requestedAsOf],
   ['Original source publication',d.sourceIssuedAt],['Verified publication clock','NO'],
   ['Source licensing',d.licenseStatus],['Change status',d.changeStatus],
   ['Earlier capture in scope',d.priorScopeSeq],['Record SHA-256',d.recordHash],
   ['Previous SHA-256',d.previousHash],['Normalized payload SHA-256',d.payloadHash],
   ['Historical source availability',d.historicalEligibility]];
  el('detail').innerHTML='<div class="detail-grid">'+fields.map(([label,v])=>
   '<div class="kv"><b>'+esc(label)+'</b><span>'+esc(show(v))+'</span></div>').join('')+'</div>'+
   '<div class="facts"><strong>First five captured normalized facts</strong><pre>'+
   esc(JSON.stringify(d.facts.slice(0,5),null,2))+'</pre></div>';
 }catch(e){el('detail').textContent=e.message;}
}
el('refresh').addEventListener('click',()=>void refresh());
el('source').addEventListener('change',()=>void refresh());
el('limit').addEventListener('change',()=>void refresh());
el('subject').addEventListener('change',()=>void refresh());
el('entries').addEventListener('click',e=>{const v=e.target.closest('[data-seq]')?.dataset.seq;
 if(v)void inspect(v);});
void refresh();
})();