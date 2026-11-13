(()=>{
'use strict';
const by=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayDate=s=>s&&typeof s==='string'?s:'—';
async function api(route,options){
 const response=await fetch('/api/provider-control/'+route,{cache:'no-store',...options});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||'Source diagnostics unavailable');
 return body;
}
let pending=null;
function table(data){
 const src=data.sources||[];
 by('sourceCount').textContent=String(src.length);
 by('configuredCount').textContent=String(src.filter(s=>s.configured).length);
 by('successCount').textContent=String(src.filter(s=>s.status==='SUCCESS').length);
 by('failedCount').textContent=String(src.filter(s=>['FAILED','NOT_CONFIGURED'].includes(s.status)).length);
 by('sourceRows').innerHTML=src.map(s=>'<tr><td><strong>'+esc(s.label)+'</strong><small>'+esc(s.method)+'</small></td>'+
  '<td>'+esc(s.area)+'</td>'+
  '<td>'+(!s.credentialRequired?'Not needed':s.configured?'Locally set':'Missing')+
  '<small>'+esc(s.envNames.join(', ')||'No secret')+'</small></td>'+
  '<td><span class="status '+esc(s.status)+'">'+esc(s.status.replace(/_/g,' '))+'</span>'+
  (s.failureCategory?'<small>'+esc(s.failureCategory.replace(/_/g,' '))+'</small>':'')+'</td>'+
  '<td>'+esc(displayDate(s.latestObservationDate))+'</td>'+
  '<td>'+esc(displayDate(s.lastCheckedAt))+'</td>'+
  '<td><button type="button" data-probe="'+esc(s.id)+'" '+(!s.probeSupported||!s.configured||pending?'disabled':'')+
  '>'+(pending===s.id?'Checking…':'Check now')+'</button></td></tr>').join('');
 const rows=data.history||[];
 by('history').innerHTML=rows.length?rows.map(r=>'<div class="history-row"><span><strong>'+esc(r.sourceLabel)+
  '</strong> <span class="status '+esc(r.status)+'">'+esc(r.status)+'</span></span><small>'+
  esc(r.checkedAt)+(r.observedRecords===null?'':' · '+esc(r.observedRecords)+' observed')+
  (r.failureCategory?' · '+esc(r.failureCategory):'')+'</small></div>').join(''):
  '<div class="history-row"><small>No probes run. Checking credentials does not itself contact an upstream provider.</small></div>';
}
async function refresh(){
 try{
  const r=await api('catalog');table(r);
  by('status').textContent='Local configuration inventory. Live checks are manual and can be rate-limited by external providers.';
 }catch(e){by('status').textContent=e.message;by('sourceRows').innerHTML='<tr><td colspan="7">'+esc(e.message)+'</td></tr>';}
}
by('refresh').addEventListener('click',()=>{void refresh();});
by('sourceRows').addEventListener('click',async e=>{
 const button=e.target.closest('[data-probe]');if(!button||pending)return;
 const id=button.dataset.probe;pending=id;
 by('status').textContent='Checking '+id+' with the configured provider; credentials remain on the local server…';
 await refresh();
 try{
  const r=await api('probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  by('status').textContent=r.status==='SUCCESS'?'Sourced check completed; review coverage and date before use.':
   r.status==='EMPTY'?'Provider returned no eligible observations; this is not a failed network request.':
   'Provider check failed ('+(r.failureCategory||'unknown')+'). Previous successful observations are retained only while this server is running.';
 }catch(err){by('status').textContent='Check could not start: '+err.message;}
 finally{pending=null;await refresh();}
});
void refresh();
})();