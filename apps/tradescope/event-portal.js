/* ResearchOS Event Intelligence v0.28 — no automatic inference of issuer impacts. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const safeLink=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const link=(url,label)=>{const s=safeLink(url);return s?'<a href="'+esc(s)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'Source unavailable';};
const load=async(path)=>{const r=await fetch('/api/event-intelligence/'+path,{cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Research API unavailable');return j;};
let catalog=null,caseSeq=0,faaSeq=0;
const familyName=id=>catalog?.families.find(f=>f.id===id)?.label||id;
function renderCatalog(){
 if(!catalog)return;
 const theme=$('familyFilter').value,q=$('scenarioSearch').value.toLowerCase().trim();
 const items=catalog.scenarios.filter(s=>(theme==='all'||s.theme===theme)&&
  (s.title+' '+s.industry+' '+s.eventClass+' '+s.theme).toLowerCase().includes(q));
 $('matches').textContent=items.length+' / '+catalog.scenarios.length+' PATHWAYS';
 $('scenarioList').innerHTML=items.length?items.map(s=>'<article class="scenario-card '+(s.caseId?'active':'')+'"><div class="card-top"><span class="tiny-label">'+esc(familyName(s.theme))+'</span><span class="state-label">'+esc(s.status.replaceAll('_',' '))+'</span></div><h3>'+esc(s.title)+'</h3><p>'+esc(s.industry)+'</p><p>'+esc(s.limitations)+'</p><a href="'+(s.caseId?'#case-study':'/transmission-lab.html')+'">'+(s.caseId?'Inspect source-dated case':'Open transmission hypotheses')+' ↗</a></article>').join(''):'<div class="empty">No matching pathways. Change the filter.</div>';
}
async function initCatalog(){
 try{
  catalog=await load('catalog');
  $('familyCount').textContent=catalog.families.length;
  $('scenarioCount').textContent=catalog.scenarioCount;
  $('familyFilter').innerHTML='<option value="all">All event families</option>'+catalog.families.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.label)+'</option>').join('');
  $('catalogStatus').textContent=catalog.scenarioCount+' PATHWAYS · 1 SHARED REGISTRY';
  $('familyFilter').addEventListener('change',renderCatalog);
  $('scenarioSearch').addEventListener('input',renderCatalog);
  renderCatalog();
 }catch(e){$('catalogStatus').textContent='REGISTRY UNAVAILABLE';$('scenarioList').textContent='Cannot load catalog: '+e.message;}
}
function renderCase(data){
 const isReplay=data.mode==='PRECURSOR_REPLAY_RESTRICTED';
 const ev=data.event;
 $('caseOverview').innerHTML='<div class="status-row"><span class="tag '+(isReplay?'warning':'')+'">'+
  (isReplay?'PRE-EVENT / NO INCIDENT KNOWLEDGE':'RETROSPECTIVE / EVENT REPORTED')+'</span><span class="tag">PREDICTIVE VALIDATION: NOT ESTABLISHED</span></div>'+
  '<h3>'+esc(isReplay?'What was publicly documented before the incident?':ev.title)+'</h3>'+
  '<p>'+esc(isReplay?'The system hides post-event facts, outcomes and issuer pathways. Sources are filtered by conservative publication-day cutoffs; first-seen archival proof is still missing.':ev.description)+'</p>'+
  '<small>'+esc(data.precursorContext.statement)+'</small>';
 const e=data.precursorContext.observations;
 $('precursors').innerHTML=e.length?e.map(x=>'<article class="evidence-item"><div class="item-top"><span>'+esc(x.kind)+' / '+esc(x.publishedOn)+'</span><span class="unverified">First-seen unverified</span></div><h3 class="item-heading">'+esc(x.title)+'</h3><p class="item-body">'+esc(x.summary)+'</p><div class="item-foot">'+link(x.url,x.source)+'</div></article>').join(''):'<div class="empty">No dated precursor documents were eligible by this checkpoint. This is not evidence that no warnings existed.</div>';
 $('pathways').innerHTML=data.pathways.length?data.pathways.map(p=>'<article class="path-item"><div class="item-top"><span>'+esc(p.horizon.replaceAll('_',' '))+'</span><span>UNVERIFIED TRANSMISSION</span></div><h3 class="item-heading">'+esc(p.title)+'</h3><p class="item-body">'+esc(p.mechanism)+'</p><div class="item-foot">Investigate: '+esc(p.candidates.join(', ')||'No verified issuer candidates')+'</div><p class="item-body"><strong>Proof needed:</strong> '+esc(p.checks.join(' · '))+'</p></article>').join(''):'<div class="empty">Incident-dependent market impact pathways are intentionally hidden before the event. No future issuer information can be used as a precursor.</div>';
 $('challenges').innerHTML=data.challenges.map(c=>'<article class="challenge-item"><div class="item-top"><span>'+esc(c.code)+'</span><span>OPEN CHALLENGE</span></div><h3 class="item-heading">'+esc(c.question)+'</h3><p class="item-body">'+esc(c.required)+'</p></article>').join('');
 $('analogues').innerHTML=data.analogues.length?data.analogues.map(a=>'<article class="analogue-item"><div class="item-top"><span>'+esc(a.date)+'</span><span>'+esc(a.comparability)+'</span></div><h3 class="item-heading">'+esc(a.event)+'</h3><p class="item-body">'+esc(a.reason)+'</p></article>').join(''):'<div class="empty">Historical event analogues are hidden in this pre-event checkpoint to avoid selecting them with hindsight.</div>';
}
async function runCase(){
 const version=++caseSeq,button=$('loadCase'),selected=$('asOf').value;
 button.disabled=true;$('caseStatus').textContent='Checking dated evidence…';
 try{
  const d=await load('case?id=faa-national-ground-stop-2026-11-13'+(selected==='current'?'':'&asOf='+encodeURIComponent(selected)));
  if(version!==caseSeq)return;
  renderCase(d);
  $('caseStatus').textContent=selected==='current'?'Retrospective case · financial outcomes unverified':'Pre-event document-date cutoff applied · no historical first-seen proof';
 }catch(e){if(version===caseSeq){$('caseStatus').textContent='Case unavailable: '+e.message;}}
 finally{if(version===caseSeq)button.disabled=false;}
}
async function refreshFaa(){
 const version=++faaSeq,button=$('refreshFaa');
 button.disabled=true;$('faaStatus').textContent='Requesting FAA current airport events…';$('faaResults').innerHTML='';
 try{
  const d=await load('faa-live');if(version!==faaSeq)return;
  $('faaStatus').innerHTML='<strong>FAA current airport snapshot</strong> · Captured '+esc(d.fetchedAt)+
  ' · '+esc(d.counts.groundStops)+' ground stops / '+esc(d.counts.groundDelays)+' ground delay programs / '+esc(d.counts.airportClosures)+' closures. <strong>Nationwide order not verified from this feed.</strong> '+link('https://nasstatus.faa.gov/','Official FAA status');
  $('faaResults').innerHTML=d.events.length?d.events.slice(0,32).map(x=>
   '<article class="faa-item"><strong>'+esc(x.airport)+' · '+esc(x.type.replaceAll('_',' '))+'</strong><small>'+esc(x.reason||'Reason unavailable')+'</small></article>').join(''):'<div class="empty">No normalized ground stops, delays or closures in this response. This cannot establish systemwide normal operations.</div>';
 }catch(e){if(version===faaSeq){$('faaStatus').textContent='FAA status unavailable: '+e.message+'. No fallback live data is assumed.';}}
 finally{if(version===faaSeq)button.disabled=false;}
}

// v0.32 source-observed global event collection (not the curated retrospective case).
const eventApi=async(route,options={})=>{
 const r=await fetch('/api/global-events/'+route,{cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'Event archive unavailable');
 return data;
};
let globalSeq=0,detailsSeq=0,collectionActive=false;
const feedMessage=msg=>{$('globalFeedMessage').textContent=msg;};
async function globalStatus(){
 const data=await eventApi('status');
 collectionActive=data.enabled===true;
 $('globalFeedState').textContent=(collectionActive?'ENABLED':'DISABLED')+' · '+data.eventCount+' SAVED EVENTS';
 $('globalPoll').disabled=!collectionActive;
 $('globalProviders').innerHTML=data.sources.map(x=>
  '<div class="global-provider"><strong>'+esc(x.name)+'</strong><span class="'+(x.status==='failed'?'global-failure':'')+'">'+
  esc(x.status.replaceAll('_',' '))+'</span><small>Last checked: '+esc(x.lastCheckedAt||'not yet')+
  ' · Latest success: '+esc(x.lastSuccessAt||'not yet')+'</small>'+
  '<small>'+esc(x.coverage)+'</small>'+(x.error?'<small>'+esc(x.error)+'</small>':'')+'</div>').join('');
 return data;
}
async function globalList(){
 const seq=++globalSeq;
 const source=$('globalSource').value,family=$('globalFamily').value,asOf=$('globalAsOf').value.trim();
 if(asOf&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(asOf)||!Number.isFinite(Date.parse(asOf)))){
  feedMessage('Knowledge as-of must be a full UTC ISO instant, for example 2026-11-13T20:53:00Z.');
  return;
 }
 $('globalListRefresh').disabled=true;
 try{
  const query=new URLSearchParams({limit:'100'});
  if(source)query.set('source',source);if(family)query.set('family',family);if(asOf)query.set('asOf',asOf);
  const data=await eventApi('events?'+query.toString());if(seq!==globalSeq)return;
  feedMessage(data.total+' event(s) match your captured-source filter'+(data.isPartial?' · displaying first 100':'')+
   '. Local first-seen evidence begins only when this collector first ran.');
  $('globalEventList').innerHTML=data.events.length?data.events.map(e=>
   '<article class="collected-event"><div class="item-top"><span>'+esc(e.source)+' · '+esc(e.type)+'</span><span>REV '+esc(e.revision)+'</span></div>'+
   '<h3>'+esc(e.title)+'</h3><p>'+esc(e.description)+'</p>'+
   '<div class="collected-times"><span>Source event: '+esc(e.eventTime||'unavailable')+'</span>'+
   '<span>First locally observed: '+esc(e.firstObservedAt)+'</span>'+
   '<span>Latest captured revision: '+esc(e.lastRevisionCapturedAt)+'</span></div>'+
   '<div class="item-foot">'+link(e.sourceUrl,'Official source')+
   ' <button type="button" class="event-detail-button" data-global-id="'+esc(e.id)+'">Revision evidence</button></div>'+
   '</article>').join(''):'<div class="empty">No locally captured source events match. A bounded feed can be empty or unavailable without proving no disruptions.</div>';
 }catch(e){if(seq===globalSeq)feedMessage('Could not read source archive: '+e.message);}
 finally{if(seq===globalSeq)$('globalListRefresh').disabled=false;}
}
async function globalDetail(id){
 const seq=++detailsSeq;
 $('globalEventDetail').textContent='Verifying revision history…';
 try{
  const data=await eventApi('detail?id='+encodeURIComponent(id));if(seq!==detailsSeq)return;
  $('globalEventDetail').innerHTML='<strong>Verified local revision history</strong>'+
  '<p>'+esc(data.id)+' · first observed '+esc(data.firstObservedAt)+'</p>'+
  data.revisions.map(r=>'<article class="revision-item"><strong>Revision '+esc(r.version)+'</strong>'+
   '<small>Local capture: '+esc(r.capturedAt)+'</small>'+
   '<small>Source updated: '+esc(r.event.providerUpdatedAt||'unavailable')+'</small>'+
   '<small>SHA-256: '+esc(r.contentHash.slice(0,20))+'…</small></article>').join('')+
  '<p>'+esc(data.warning)+'</p>';
 }catch(e){if(seq===detailsSeq)$('globalEventDetail').textContent='Revision history unavailable: '+e.message;}
}
async function globalPoll(){
 if(!collectionActive){feedMessage('Collection is disabled; review the private server configuration first.');return;}
 $('globalPoll').disabled=true;feedMessage('Collecting fixed official feeds. Failed sources will not be misreported as healthy.');
 try{
  const data=await eventApi('refresh',{method:'POST',
   headers:{'Content-Type':'application/json','X-ResearchOS-Event-Refresh':'1'},body:'{}'});
  feedMessage('Local collection completed at '+data.capturedAt+' · '+data.results.map(x=>
   x.source+': '+(x.status==='ok'?x.added+' new, '+x.revised+' changed':x.error)).join(' · '));
  await globalStatus();
  await globalList();
 }catch(e){feedMessage('Collection failed: '+e.message+'. Existing evidence was not replaced.');}
 finally{$('globalPoll').disabled=!collectionActive;}
}
$('globalPoll').addEventListener('click',globalPoll);
$('globalListRefresh').addEventListener('click',globalList);
$('globalSource').addEventListener('change',globalList);
$('globalFamily').addEventListener('change',globalList);
$('globalEventList').addEventListener('click',e=>{
 const id=e.target.closest('[data-global-id]')?.dataset.globalId;if(id)void globalDetail(id);
});
async function initGlobalFeed(){
 try{
  const info=await globalStatus();
  if(!info.enabled)feedMessage('Collection disabled by default. Set GLOBAL_EVENT_COLLECTION_ENABLED=true in your ignored local .env and restart Node. No external request has been made by this page.');
  await globalList();
 }catch(e){feedMessage('Local event collection service unavailable: '+e.message);}
}
void initGlobalFeed();


// v0.33 read-only Precursor Radar; never a live market alert or direct provider call.
let precursorSeq=0;
const precursorApi=async query=>{
 const response=await fetch('/api/precursors/'+query,{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Precursor analysis unavailable');
 return data;
};
async function runPrecursor(){
 const seq=++precursorSeq,button=$('runPrecursor');
 const cutoff=$('precursorAsOf').value.trim();
 const source=$('precursorSource').value;
 if(cutoff&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(cutoff)||!Number.isFinite(Date.parse(cutoff)))){
  $('precursorStatus').textContent='Enter a complete UTC timestamp such as 2026-11-14T12:00:00Z.';return;
 }
 button.disabled=true;
 $('precursorStatus').textContent='Inspecting locally archived observations and 6-hour polling coverage…';
 try{
  const params=new URLSearchParams();
  if(source)params.set('source',source);
  if(cutoff)params.set('asOf',cutoff);
  const data=await precursorApi('analysis'+(params.size?'?'+params.toString():''));
  if(seq!==precursorSeq)return;
  const eligible=data.evaluations.filter(x=>x.eligible).length,leads=data.evaluations.filter(x=>x.status==='INVESTIGATE_OBSERVED_ACTIVITY').length;
  $('precursorState').textContent=eligible+' / '+data.evaluations.length+' COVERED · '+leads+' INVESTIGATION LEADS';
  $('precursorStatus').textContent='Rule '+data.ruleVersion+' · as-of '+data.asOf+
   ' · source activity only; no prediction, company loss or validated false-positive rate.';
  $('precursorResults').innerHTML=data.evaluations.map(e=>{
   const hasLead=e.status==='INVESTIGATE_OBSERVED_ACTIVITY';
   const state=hasLead?'OBSERVED ACTIVITY INCREASE':e.eligible?'NO RULE THRESHOLD':'ABSTAIN / COVERAGE';
   const className=hasLead?'precursor-lead':e.eligible?'precursor-clear':'precursor-abstain';
   const ratio=e.comparison?e.comparison.activityRatio+'×':'Not evaluated';
   const baseline=e.comparison?e.comparison.baselineMean:'Not available';
   const fails=e.coverage.missingWindows;
   const controls=e.controls.evaluated>0?
    e.controls.thresholdWindows+' / '+e.controls.evaluated+' prior covered windows also crossed the rule threshold':
    'No independent historical comparison windows qualify yet';
   const evidence=e.evidenceIds.length?
    e.evidenceIds.slice(0,8).map(id=>'<code>'+esc(id)+'</code>').join(' '):
    'No eligible evidence references';
   const geo=e.geoObservation?.spatialCandidateCount>=3?
    '<p class="precursor-spatial">Same-source spatial concentration: '+esc(e.geoObservation.spatialCandidateCount)+
    ' events within '+esc(e.geoObservation.spatialRadiusKm)+' km of one observation. Not a verified escalation.</p>':'';
   return '<article class="precursor-card '+className+'">'+
    '<div class="item-top"><span>'+esc(e.source)+' / '+esc(e.family)+'</span><strong>'+esc(state)+'</strong></div>'+
    '<div class="precursor-metrics">'+
     '<div><small>TIMELY NEW SOURCE OBSERVATIONS</small><b>'+esc(e.counts.current)+'</b></div>'+
     '<div><small>PRIOR 4-WINDOW MEAN</small><b>'+esc(baseline)+'</b></div>'+
     '<div><small>OBSERVED ACTIVITY RATIO</small><b>'+esc(ratio)+'</b></div></div>'+
    '<p><strong>Window:</strong> '+esc(e.evaluationWindow.startAt)+' to '+esc(e.evaluationWindow.endAt)+'</p>'+
    '<p>'+esc(e.interpretation)+'</p>'+
    '<p>Archive readiness: '+esc(e.coverage.coveredBuckets)+' / '+esc(e.coverage.measuredBuckets)+
     ' covered 6-hour windows. New observations with ineligible source times: '+esc(e.counts.timestampIneligible)+
     '. Changed source records: '+esc(e.counts.providerUpdates)+'.</p>'+
    (fails.length?'<p class="precursor-coverage">Missing coverage: '+fails.map(x=>esc(x.startAt)).join(' · ')+'</p>':'')+
    geo+'<div class="precursor-evidence"><small>Evidence IDs:</small> '+evidence+'</div>'+
    '<div class="precursor-controls-note"><strong>Historical controls:</strong> '+esc(controls)+
    '. No ground-truth negative outcomes exist; false-positive rate, precision and recall are unknown.</div>'+
    '<button type="button" class="event-detail-button" data-precursor-source="'+esc(e.source)+'">Inspect source observations</button>'+
    '</article>';
  }).join('');
 }catch(e){
  if(seq===precursorSeq){$('precursorState').textContent='ANALYSIS UNAVAILABLE';$('precursorStatus').textContent='Could not analyze local evidence: '+e.message;}
 }finally{if(seq===precursorSeq)button.disabled=false;}
}
$('runPrecursor').addEventListener('click',runPrecursor);
$('precursorResults').addEventListener('click',event=>{
 const source=event.target.closest('[data-precursor-source]')?.dataset.precursorSource;
 if(!source)return;
 $('globalSource').value=source;
 void globalList();
 $('global-feed').scrollIntoView({block:'start',behavior:'smooth'});
});
void runPrecursor();

$('loadCase').addEventListener('click',runCase);
$('asOf').addEventListener('change',runCase);
$('refreshFaa').addEventListener('click',refreshFaa);
void initCatalog();void runCase();
})();