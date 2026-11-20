(()=>{'use strict';
const $=id=>document.getElementById(id);
const put=(id,value)=>{$(id).textContent=String(value??'—');};
const node=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;};
function add(parent,tag,text,className){const x=node(tag,text);if(className)x.className=className;parent.append(x);return x;}
async function request(route,{method='GET',payload=null}={}){
 const response=await fetch('/api/agent-validation/'+route,{method,cache:'no-store',
  headers:payload?{'Content-Type':'application/json','X-ResearchOS-Validation':'1'}:{},
  body:payload?JSON.stringify(payload):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Evidence validation service unavailable');
 return data;
}
let chosenRun=null,audit=null,working=false,writeEnabled=false;
const warning=message=>put('validationMessage',message);
function claimCard(claim){
 const div=node('article');div.className='validation-claim';
 add(div,'strong',claim.id+' · '+claim.kind.toUpperCase());
 add(div,'p',claim.text);
 add(div,'div',claim.traceabilityScore+' / 100 — TRACEABILITY ONLY','score');
 const meter=add(div,'meter');meter.min=0;meter.max=100;meter.value=claim.traceabilityScore;
 add(div,'small',claim.evidenceStatus+' · '+claim.refs.join(', '));
 if(claim.flags.length)add(div,'p',claim.flags.join(' · '),'flags');
 return div;
}
function showPairs(){
 const select=$('validationPair');select.replaceChildren();
 if(!audit||!audit.pairs.length){
  add(select,'option','No hypothesis pairs available').value='';
  put('pairStatus','No Analyst-versus-Anti-Agent comparison exists in this run.');
  return;
 }
 for(const [index,pair] of audit.pairs.entries()){
  const option=add(select,'option','Comparison '+(index+1)+' · '+pair.status);
  option.value=pair.id;
 }
 updatePair();
}
function updatePair(){
 const pair=audit?.pairs?.find(x=>x.id===$('validationPair').value);
 if(!pair){put('pairStatus','No selected comparison.');return;}
 put('pairStatus','Analyst: '+pair.analystClaimId+'  |  Anti-Agent: '+pair.challengerClaimId+
  '\nReview status: '+pair.review.status+' · '+pair.review.count+'/2 reviewer aliases'+
  (pair.review.agreedDecision?' · shared assessment: '+pair.review.agreedDecision:'')+
  '\nThese are manually attested positions, not factually verified contradictions.');
}
function outcomeStatus(){
 const r=audit?.outcome;
 if(!r){
  put('registrationStatus','No frozen outcome question. An operator must define a measurable future test.');
  put('outcomeStatus','Register the question and horizon before outcome labels can be accepted.');
  return;
 }
 put('registrationStatus','FROZEN ON '+r.registeredAt+'\nQuestion: '+r.question+
  '\nCriterion: '+r.operationalCriterion+'\nHorizon: '+r.horizonDays+' day(s) · ends '+r.windowEndsAt+
  '\nCohort: '+r.signalTag+' · operator-declared, not model-predicted.');
 put('outcomeStatus','Review status: '+r.status+' · '+r.reviewsReceived+'/2 reviewer aliases'+
  (r.agreedLabel?' · AGREED LABEL '+r.agreedLabel:'')+
  '. Reviewer identities and external evidence contents are NOT independently verified.'+
  (Date.now()<Date.parse(r.windowEndsAt)?' Outcome window still open; labeling blocked until it ends.':''));
}
function renderAudit(data){
 audit=data;chosenRun=data.runId;
 put('auditTotals',data.totals.claims+' CLAIMS · '+data.totals.withReferences+' CITED');
 const box=$('claimAuditRows');box.replaceChildren();
 for(const c of data.claims)box.append(claimCard(c));
 if(!data.claims.length)add(box,'p','This research run has no individually scored claims.');
 showPairs();outcomeStatus();
 void loadOfficialSnapshots();
 $('captureOfficialSource').disabled=!writeEnabled||!data.outcome;
 $('submitPairReview').disabled=!writeEnabled||!data.pairs.length;
 $('registerOutcome').disabled=!writeEnabled||Boolean(data.outcome);
 $('submitOutcomeReview').disabled=!writeEnabled||!data.outcome||
  Date.now()<Date.parse(data.outcome.windowEndsAt)||data.outcome.reviewsReceived>=2;
 warning('Audited run '+data.runId+'. Citation scores are metadata quality, never probability or verification.');
}
async function loadAudit(){
 const id=$('validationRun').value;if(!id){warning('Choose a saved Agent Desk run first.');return;}
 try{renderAudit(await request('run?id='+encodeURIComponent(id)));}
 catch(e){warning('Audit unavailable: '+e.message);}
}
async function loadRuns(){
 const response=await fetch('/api/agent-desk/runs',{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Saved research runs unavailable');
 const select=$('validationRun'),prior=select.value;
 select.replaceChildren();
 add(select,'option','Choose a saved run').value='';
 for(const r of data.runs||[]){
  const item=add(select,'option',r.eventId+' · '+r.createdAt+' · '+r.mode);
  item.value=r.id;
 }
 if(prior&&Array.from(select.options).some(x=>x.value===prior))select.value=prior;
 $('loadAudit').disabled=!select.value;
 return data;
}
async function loadCatalog(){
 const c=await request('catalog');
 writeEnabled=c.enabled===true;
 put('validationMode',writeEnabled?'LOCAL MANUAL REVIEWS':'READ-ONLY AUDIT');
 return c;
}
async function loadReport(){
 const r=await request('report'),box=$('validationReport');box.replaceChildren();
 const grid=add(box,'div',undefined,'validation-report-grid');
 for(const [caption,value] of [
  ['Preregistered protocols',r.registered],
  ['Awaiting second review',r.awaitingTwoReviewers],
  ['Reviewer disagreements',r.disputed],
  ['Two aliases agree (unverified)',r.agreedUnverified]
 ]){
  const card=add(grid,'div',undefined,'validation-metric');
  add(card,'strong',value);add(card,'small',caption);
 }
 const counts=r.descriptiveCounts||{};
 const p=add(box,'p',undefined,'validation-hint');
 p.textContent='Declared candidates: '+(counts.candidateObserved||0)+' observed / '+
  (counts.candidateNotObserved||0)+' not observed · Declared controls: '+
  (counts.controlObserved||0)+' observed / '+(counts.controlNotObserved||0)+' not observed. '+
  'These are unverified human attestations, not validated positive or negative labels.';
 add(box,'p','Precision, recall, prediction accuracy, false-positive rate, and forecast probability are unmeasured (null).');
}
async function mutation(op,payload){
 if(working)return null;working=true;
 for(const id of ['submitPairReview','registerOutcome','submitOutcomeReview'])$(id).disabled=true;
 try{
  const result=await request(op,{method:'POST',payload});
  await loadAudit();
  await loadReport();
  return result;
 }catch(e){warning('Review rejected: '+e.message);return null;}
 finally{
  working=false;
  if(audit){
   $('submitPairReview').disabled=!writeEnabled||!audit.pairs.length;
   $('registerOutcome').disabled=!writeEnabled||Boolean(audit.outcome);
   $('submitOutcomeReview').disabled=!writeEnabled||!audit.outcome||
    Date.now()<Date.parse(audit.outcome.windowEndsAt)||audit.outcome.reviewsReceived>=2;
  }
 }
}

/* v0.36 source-capture and point-in-time export. No provider fetch until explicit user click. */
async function evidenceRequest(route,{method='GET',payload=null}={}){
 const response=await fetch('/api/outcome-evidence/'+route,{
  method,cache:'no-store',
  headers:payload?{'Content-Type':'application/json','X-ResearchOS-Outcome-Capture':'1'}:{},
  body:payload?JSON.stringify(payload):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Source evidence request unavailable');
 return data;
}
async function loadOfficialSnapshots(){
 const box=$('capturedSourceList');box.replaceChildren();
 if(!chosenRun){add(box,'p','Choose a saved research run first.');return;}
 try{
  const data=await evidenceRequest('snapshots?runId='+encodeURIComponent(chosenRun));
  if(!data.snapshots.length){
   add(box,'p','No original HTTP content snapshots retained for this run.');
   return;
  }
  for(const snap of data.snapshots){
   const card=add(box,'div',undefined,'validation-claim');
   add(card,'strong',snap.sourceUrl);
   add(card,'small','Captured '+snap.capturedAt+' · '+snap.responseBytes+' bytes · '+snap.mediaType);
   add(card,'small','SHA-256 '+snap.bodySha256);
   add(card,'p',snap.excerpt);
   add(card,'small','Content observed only. Claim semantics and original publication time unverified.');
  }
 }catch(e){add(box,'p','Could not read source snapshots: '+e.message);}
}
$('captureSourceForm').addEventListener('submit',event=>{
 event.preventDefault();
 if(!audit?.outcome){put('captureSourceStatus','No preregistered outcome exists.');return;}
 const sourceUrl=$('captureSourceUrl').value.trim();
 $('captureOfficialSource').disabled=true;
 put('captureSourceStatus','Retrieving an explicitly reviewed, allowlisted official-source document…');
 void evidenceRequest('capture',{method:'POST',payload:{
  runId:chosenRun,registrationId:audit.outcome.registrationId,sourceUrl
 }}).then(async result=>{
  put('captureSourceStatus',(result.deduplicated?'Already captured':'Source captured')+
   ' · '+result.capturedAt+' · SHA-256 '+result.bodySha256+
   '. This confirms fetched HTTP bytes, NOT the review outcome.');
  await loadOfficialSnapshots();
 }).catch(error=>put('captureSourceStatus','Official source capture rejected: '+error.message))
 .finally(()=>{$('captureOfficialSource').disabled=!writeEnabled||!audit?.outcome;});
});
async function exportDataset(format){
 const cutoff=$('datasetAsOf').value.trim();
 if(cutoff&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(cutoff)||
  !Number.isFinite(Date.parse(cutoff)))){
  put('datasetStatus','Enter a full UTC ISO timestamp such as 2026-11-15T18:00:00Z.');return;
 }
 const query=new URLSearchParams({format});if(cutoff)query.set('asOf',cutoff);
 for(const id of ['downloadDatasetJson','downloadDatasetCsv'])$(id).disabled=true;
 put('datasetStatus','Generating point-in-time export from the private local archive…');
 try{
  const response=await fetch('/api/outcome-evidence/dataset?'+query.toString(),{cache:'no-store'});
  if(!response.ok){const e=await response.json().catch(()=>({}));
   throw Error(e.error||'Dataset export unavailable');}
  const body=await response.text();
  const blob=new Blob([body],{type:format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'});
  const href=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=href;link.download='ResearchOS_v036_prospective_'+(cutoff||'latest').replace(/[^a-zA-Z0-9_-]/g,'_')+'.'+format;
  document.body.append(link);link.click();link.remove();URL.revokeObjectURL(href);
  if(format==='json'){
   const result=JSON.parse(body);
   put('datasetStatus','Exported '+result.rows.length+' preregistered rows as-of '+
    result.asOf+' · manifest '+result.manifestSha256+
    '. No reviewer identities or verified prediction metrics.');
  }else put('datasetStatus','Exported CSV with a point-in-time manifest digest. All reported outcomes remain unverified.');
 }catch(e){put('datasetStatus','Dataset export failed: '+e.message);}
 finally{for(const id of ['downloadDatasetJson','downloadDatasetCsv'])$(id).disabled=false;}
}
$('downloadDatasetJson').addEventListener('click',()=>void exportDataset('json'));
$('downloadDatasetCsv').addEventListener('click',()=>void exportDataset('csv'));
$('validationRun').addEventListener('change',()=>{
 $('loadAudit').disabled=!$('validationRun').value;
 chosenRun=null;audit=null;
 put('auditTotals','NOT LOADED');$('claimAuditRows').replaceChildren();
 put('pairStatus','Run changed; load its audit first.');
});
$('loadAudit').addEventListener('click',()=>void loadAudit());
$('validationPair').addEventListener('change',updatePair);
$('pairReviewForm').addEventListener('submit',event=>{
 event.preventDefault();if(!audit)return;
 const payload={
  runId:chosenRun,pairId:$('validationPair').value,reviewer:$('pairReviewer').value.trim(),
  decision:$('pairDecision').value,rationale:$('pairRationale').value.trim(),
  evidenceRefIds:$('pairRefs').value.split(',').map(x=>x.trim()).filter(Boolean)
 };
 void mutation('review-pair',payload).then(x=>{if(x)$('pairRationale').value='';});
});
$('registerOutcomeForm').addEventListener('submit',event=>{
 event.preventDefault();if(!audit)return;
 void mutation('register',{
  runId:chosenRun,question:$('outcomeQuestion').value.trim(),
  operationalCriterion:$('outcomeCriterion').value.trim(),
  horizonDays:Number($('outcomeHorizon').value),signalTag:$('signalTag').value
 });
});
$('outcomeReviewForm').addEventListener('submit',event=>{
 event.preventDefault();if(!audit?.outcome)return;
 void mutation('label-outcome',{
  runId:chosenRun,registrationId:audit.outcome.registrationId,
  reviewer:$('outcomeReviewer').value.trim(),decision:$('outcomeDecision').value,
  rationale:$('outcomeRationale').value.trim(),
  evidenceUrl:$('outcomeEvidenceUrl').value.trim(),
  evidencePublishedAt:$('outcomePublished').value.trim()
 }).then(result=>{if(result){$('outcomeRationale').value='';$('captureSourceUrl').value=$('outcomeEvidenceUrl').value.trim();}});
});
$('refreshValidationReport').addEventListener('click',()=>void loadReport().catch(e=>warning(e.message)));
void (async()=>{
 try{
  await Promise.all([loadCatalog(),loadRuns(),loadReport()]);
  const requested=new URLSearchParams(location.search).get('run');
  if(requested&&Array.from($('validationRun').options).some(x=>x.value===requested)){
   $('validationRun').value=requested;
   await loadAudit();
  }
  if(!$('validationRun').value)warning('Select a saved research run. Create one in the Agent Desk if needed.');
 }catch(e){warning('Validation workspace unavailable: '+e.message);}
})();
})();