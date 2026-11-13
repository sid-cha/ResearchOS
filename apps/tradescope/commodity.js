/* Commodity vertical workbench; same-origin API, no secrets and no predictive claims. */
(()=>{
'use strict';
const get=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&['www.federalregister.gov','www.sec.gov'].includes(u.hostname)?u.href:null;}catch{return null;}};
const say=(id,s)=>{get(id).textContent=s;};
let commodity='potash',currentId=null,sourceDocs=[],localDocs=[],requestToken=0;
async function api(route,method='GET',payload){
 const r=await fetch('/api/commodity/'+route,{method,headers:payload?{'Content-Type':'application/json'}:{},
  body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||'Research provider unavailable');return d;
}
function candidates(){
 const known=new Map(localDocs.map(x=>[x.document.id,x]));
 const docs=sourceDocs.length?sourceDocs:localDocs.map(x=>x.document);
 get('candidateCount').textContent=String(docs.length);
 get('revisionCount').textContent=String(localDocs.length);
 get('events').innerHTML=docs.length?docs.map(d=>{
  const saved=known.get(d.id),u=safeUrl(d.sourceUrl);
  return '<article class="event"><div class="event-row"><small>'+esc(d.publishedDate)+'</small>'+
   '<span class="pill">REGULATORY KEYWORD MATCH</span></div><h3>'+esc(d.title)+'</h3>'+
   '<p>'+esc(d.summary||'No official abstract supplied.')+'</p>'+
   '<div class="item-actions">'+(u?'<a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">Original source</a>':'')+
   (saved?'<button data-open="'+esc(d.id)+'">Prepare cited brief</button>':
   '<span class="muted">Capture to enable a brief</span>')+'</div>'+
   '</article>';
 }).join(''):'<div class="empty">No source documents found or captured.</div>';
}
async function local(){
 const d=await api('events?commodity='+encodeURIComponent(commodity));
 localDocs=d.events||[];candidates();
}
async function companies(){
 const d=await api('companies?commodity='+encodeURIComponent(commodity));
 get('companyCount').textContent=String(d.companies.length);
 get('profiles').innerHTML=d.companies.length?d.companies.map(p=>{
  const url=safeUrl(p.sourceUrl);
  return '<article class="profile"><div class="profile-head"><strong>'+esc(p.symbol)+'</strong>'+
   '<small>'+esc(p.company)+'</small></div><p>'+esc(p.claim)+'</p>'+
   '<small>Business activity: '+esc(p.commodities.join(', '))+'</small>'+
   '<div class="evidence-edge">'+esc(p.commodityEdge?.from||p.symbol)+' → '+esc(p.commodityEdge?.to||'COMMODITY') +'<br><small>SEC disclosure-backed business link; specific event impact NOT VERIFIED</small></div>'+
   '<p class="subtle">Filed '+esc(p.filingDate)+' · Specific disruption impact UNVERIFIED</p>'+
   (url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">SEC original filing</a>':'')+'</article>';
 }).join(''):'<div class="empty">No annual filings available for this period.</div>';
}
async function select(){
 const token=++requestToken;commodity=get('commoditySelect').value;currentId=null;
 sourceDocs=[];localDocs=[];get('briefExport').disabled=true;
 say('briefText','Capture a regulatory document to prepare a research brief.');
 say('feedStatus','Loading local research state...');
 try{await Promise.all([companies(),local()]);if(token===requestToken)say('feedStatus','Ready. Review source matches or capture observations.');}
 catch(e){if(token===requestToken)say('feedStatus',e.message);}
}
async function fetchDocs(capture){
 const token=++requestToken;const button=get(capture?'scan':'preview');button.disabled=true;
 say('feedStatus',capture?'Fetching and capturing official results...':'Fetching official document preview...');
 try{
  const d=capture?await api('scan','POST',{commodity}):await api('live?commodity='+encodeURIComponent(commodity));
  if(token!==requestToken)return;
  sourceDocs=d.results||[];
  if(capture)await local();else candidates();
  say('feedStatus',sourceDocs.length+' keyword-matched documents. Unreviewed, not confirmed disruptions.'+
   (capture?' New: '+d.capture.added+'; revised: '+d.capture.changed+'.':''));
 }catch(e){if(token===requestToken)say('feedStatus',e.message);}
 finally{button.disabled=false;}
}
async function openBrief(id){
 say('briefStatus','Preparing brief from stored evidence...');
 try{
  const b=await api('brief?id='+encodeURIComponent(id));currentId=id;
  get('briefText').textContent=b.report;get('briefExport').disabled=false;
  say('briefStatus',b.coverage.companyDisclosureMatches+' relevant issuer disclosures; no verified event impacts.');
  get('briefArea').scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){say('briefStatus',e.message);}
}
async function watches(){
 const d=await api('watches');
 get('watches').innerHTML=d.watches.length?d.watches.map(w=>{
  const details=w.lastResult?' Last scan: '+w.lastResult.candidateDocuments+
   ' candidates, '+w.lastResult.newCandidates+' new after baseline.':' Not scanned yet.';
  return '<article class="watch"><strong>'+esc(w.name)+'</strong><small>'+
   esc(w.commodity)+' · every '+esc(w.intervalMinutes)+'m · '+(w.enabled?'ENABLED':'DISABLED')+'</small>'+
   '<p>'+esc(details)+'</p><div class="item-actions">'+
   '<button data-toggle="'+esc(w.id)+'" data-revision="'+esc(w.revision)+'" data-enabled="'+esc(w.enabled)+'">'+
   (w.enabled?'Disable':'Enable')+'</button>'+
   '<button data-delete="'+esc(w.id)+'" data-revision="'+esc(w.revision)+'">Remove</button>'+
   '<button data-run="'+esc(w.id)+'">Run once</button></div></article>';
 }).join(''):'<div class="empty">No local commodity watches created yet.</div>';
}
async function metrics(){
 const m=await api('metrics');
 say('pilotMetrics',m.selfReportedSamples+' local evaluations; mean before: '+
  (m.minutesBeforeMean??'—')+' min; using TradeScope: '+(m.minutesWithMean??'—')+
  ' min; reported quality: '+(m.qualityMean??'—')+'/5.');
}
get('commoditySelect').addEventListener('change',()=>{void select();});
get('preview').addEventListener('click',()=>{void fetchDocs(false);});
get('scan').addEventListener('click',()=>{void fetchDocs(true);});
get('events').addEventListener('click',e=>{
 const id=e.target.closest('[data-open]')?.dataset.open;if(id)void openBrief(id);
});
get('briefExport').addEventListener('click',()=>{
 if(currentId)window.location.href='/api/commodity/brief.txt?id='+encodeURIComponent(currentId);
});
get('reviewForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!currentId){say('reviewStatus','Select a captured document and build its brief first.');return;}
 const form=new FormData(e.currentTarget);
 try{
  const result=await api('reviews','POST',{eventId:currentId,
   disposition:form.get('disposition'),rationale:form.get('rationale')});
  say('reviewStatus','Append-only analyst assessment saved at '+result.review.reviewedAt+
   '. This is not independent event-impact verification.');
  await openBrief(currentId);
 }catch(err){say('reviewStatus',err.message);}
});
get('watchForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 try{
  await api('watches','POST',{name:form.get('name'),commodity,intervalMinutes:Number(form.get('intervalMinutes'))});
  await watches();say('watchStatus','Created disabled. Enable to run scheduled scans while this server is running.');
 }catch(err){say('watchStatus',err.message);}
});
get('watches').addEventListener('click',async e=>{
 const toggle=e.target.closest('[data-toggle]'),run=e.target.closest('[data-run]'),del=e.target.closest('[data-delete]');
 if(!toggle&&!run&&!del)return;
 const id=toggle?.dataset.toggle||run?.dataset.run||del?.dataset.delete;
 try{
  if(toggle)await api('watches/'+encodeURIComponent(id),'PATCH',{enabled:toggle.dataset.enabled!=='true',
   expectedRevision:Number(toggle.dataset.revision)});
  else if(del)await api('watches/'+encodeURIComponent(id),'DELETE',{expectedRevision:Number(del.dataset.revision)});
  else await api('watches/'+encodeURIComponent(id)+'/scan','POST',{});
  await watches();if(run)await local();
  say('watchStatus','Local watch action complete. New documents remain unreviewed research candidates.');
 }catch(err){say('watchStatus',err.message);}
});
get('feedbackForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 try{
  await api('feedback','POST',{minutesBefore:Number(form.get('minutesBefore')),
   minutesWith:Number(form.get('minutesWith')),sourceQuality:Number(form.get('sourceQuality')),
   notes:form.get('notes')});
  await metrics();say('feedbackStatus','Saved self-reported pilot evaluation.');e.currentTarget.reset();
 }catch(err){say('feedbackStatus',err.message);}
});
void Promise.allSettled([select(),watches(),metrics()]);
})();