/**
 * v0.33 Precursor Radar: deterministic, source-scoped descriptive observations.
 * Zero financial predictions, no retrospective pre-archive lookahead and no inferred ground truth.
 */
import {GLOBAL_EVENT_SOURCES} from './global-event-collector.mjs';

export const PRECURSOR_RULE_VERSION='PRECURSOR-0.33.1';
const HOUR=3600000,WINDOW=6*HOUR,BASELINE=4,RADIUS_KM=200;
const issue=(message,status=400)=>Object.assign(Error(message),{status});
const strictISO=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&s.length<=32;
const ms=s=>Date.parse(s);
const utc=n=>new Date(n).toISOString();
const midpoint=v=>Math.floor(v/WINDOW)*WINDOW;
const distKm=(p,q)=>{
 const toRad=Math.PI/180,phi1=p[1]*toRad,phi2=q[1]*toRad;
 const dlat=(q[1]-p[1])*toRad,dlon=(q[0]-p[0])*toRad;
 const a=Math.sin(dlat/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.max(0,a)),Math.sqrt(Math.max(0,1-a)));
};
const coord=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&
 Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function windowData(evidence,source,start){
 const end=start+WINDOW,isoStart=utc(start);
 const poll=evidence.pollWindows.find(x=>x.source===source&&x.windowStart===isoStart);
 const covered=Boolean(poll&&poll.successes>=2&&poll.failures===0&&
   ms(poll.firstSuccessAt)-start<=2*HOUR&&end-ms(poll.lastSuccessAt)<=2*HOUR);
 const newlySeen=evidence.events.filter(e=>e.source===source&&
   ms(e.firstObservedAt)>=start&&ms(e.firstObservedAt)<end);
 const timely=newlySeen.filter(e=>strictISO(e.eventTime)&&ms(e.eventTime)>=start&&ms(e.eventTime)<end);
 const revised=evidence.events.filter(e=>e.source===source&&
   e.revisionCount>1&&ms(e.latestRevisionAt)>=start&&ms(e.latestRevisionAt)<end).length;
 return {startAt:isoStart,endAt:utc(end),source,
  successes:poll?.successes||0,failedChecks:poll?.failures||0,covered,
  newlySeen: new Set(newlySeen.map(e=>e.id)).size,
  timelyDistinct: new Set(timely.map(e=>e.id)).size,
  unverifiedSourceTime:newlySeen.length-timely.length,
  revisedRecords:revised,
  evidence:timely};
}
function cluster(events){
 const valid=events.filter(e=>coord(e.location));
 let best=[];
 for(const anchor of valid){
  const group=valid.filter(e=>distKm(anchor.location,e.location)<=RADIUS_KM);
  if(group.length>best.length)best=group;
 }
 return {spatialCandidateCount:best.length,spatialRadiusKm:RADIUS_KM,
  spatialEvidenceIds:best.slice(0,16).map(e=>e.id),
  disclaimer:'Same-source location concentration is not independently confirmed geographic harm, causality or future escalation.'};
}
function compare(target,history){
 const mean=history.reduce((n,w)=>n+w.timelyDistinct,0)/BASELINE;
 const current=target.timelyDistinct;
 const ratio=Number((current/Math.max(1,mean)).toFixed(3));
 return {baselineMean:Number(mean.toFixed(3)),activityRatio:ratio,
  activityExcess:Number((current-mean).toFixed(3)),
  thresholdMet:current>=3&&ratio>=2.5&&current-mean>=2};
}
function eligibility(windows){
 const missing=windows.filter(w=>!w.covered);
 return {ok:missing.length===0,reason:missing.length===0?'COVERAGE_QUALIFIED':
  'INSUFFICIENT_OBSERVED_POLLING_COVERAGE',
  missingWindows:missing.map(x=>({startAt:x.startAt,successes:x.successes,failedChecks:x.failedChecks})),
  measuredBuckets:windows.length,coveredBuckets:windows.length-missing.length};
}
export function assessPrecursorEvidence({evidence,asOf,source}={}){
 if(!strictISO(asOf))throw issue('As-of must be a complete UTC ISO timestamp');
 if(!evidence||!Array.isArray(evidence.events)||!Array.isArray(evidence.pollWindows))
  throw issue('Verified local event observations and polling coverage are required');
 const supported=GLOBAL_EVENT_SOURCES.map(x=>x.id);
 if(source&&!supported.includes(source))throw issue('Unknown precursor provider');
 const candidates=source?[source]:supported;
 const end=midpoint(ms(asOf));
 // Last fully completed six-hour period. Avoid counting unfinished windows.
 const evaluate=provider=>{
  const latest=windowData(evidence,provider,end-WINDOW);
  const baseline=Array.from({length:BASELINE},(_,i)=>windowData(
   evidence,provider,end-WINDOW*(BASELINE+1-i)));
  const history=[...baseline,latest],quality=eligibility(history);
  const counts={current:latest.timelyDistinct,prior:baseline.map(x=>x.timelyDistinct),
   newlyObserved:latest.newlySeen,timestampIneligible:latest.unverifiedSourceTime,
   providerUpdates:latest.revisedRecords};
  const comparison=quality.ok?compare(latest,baseline):null;
  const spatial=cluster(latest.evidence);
  const warning=Boolean(quality.ok&&comparison.thresholdMet);
  // Evaluate each *earlier* completed control window with its OWN earlier four-window
  // baseline. Never use the latest target window or future provider revisions.
  const controls=[];
  for(let lag=1;lag<=24;lag++){
   const stop=end-WINDOW*lag;
   const candidate=windowData(evidence,provider,stop-WINDOW);
   const prior=Array.from({length:BASELINE},(_,i)=>
    windowData(evidence,provider,stop-WINDOW*(BASELINE+1-i)));
   if(!eligibility([...prior,candidate]).ok)continue;
   const c=compare(candidate,prior);
   controls.push({windowStart:candidate.startAt,observedCount:candidate.timelyDistinct,
    thresholdMet:c.thresholdMet,baselineMean:c.baselineMean});
  }
  controls.sort((a,b)=>a.windowStart.localeCompare(b.windowStart));
  const controlAlerts=controls.filter(x=>x.thresholdMet).length;
  return {source:provider,family:GLOBAL_EVENT_SOURCES.find(s=>s.id===provider).family,
   evaluationEnd:utc(end),evaluationWindow:{startAt:latest.startAt,endAt:latest.endAt},
   status:!quality.ok?'ABSTAIN_COVERAGE':warning?'INVESTIGATE_OBSERVED_ACTIVITY':'NO_ACTIVITY_SPIKE',
   eligible:quality.ok,coverage:quality,counts,comparison,
   evidenceIds:quality.ok?latest.evidence.slice(0,20).map(e=>e.id):[],
   geoObservation:quality.ok?spatial:null,
   controls:{method:'PRIOR_FULLY_COVERED_WINDOWS_WITH_OWN_ROLLING_BASELINES',
    evaluated:controls.length,thresholdWindows:controlAlerts,
    controlHitFraction:controls.length?Number((controlAlerts/controls.length).toFixed(3)):null,
    precision:null,recall:null,falsePositiveRate:null,
    note:'Earlier threshold hits are not labeled false positives: no verified downstream outcomes/negative labels exist.'},
   interpretation:!quality.ok?
    'Abstain: five consecutive complete 6-hour periods with distributed successful, failure-free observations are required.' :
    warning?'Observed activity concentration warrants verification; it is not a prediction of another event.':
    'Observed activity did not exceed this heuristic threshold; absence of a signal does not imply safety.',
   predictiveWarningIssued:false,verifiedFutureOutcome:false,probability:null,issuerExposureValidated:false};
 };
 return {schemaVersion:1,ruleVersion:PRECURSOR_RULE_VERSION,asOf:utc(ms(asOf)),
  windowHours:6,baselineWindowCount:BASELINE,sourceTimeRule:'EVENT_TIME_WITHIN_WINDOW_AND_FIRST_OBSERVED_WITHIN_WINDOW',
  thresholds:{minNewTimedEvents:3,minRatioToBaseline:2.5,minAbsoluteExcess:2,
   minimumSuccessfulPollsPerWindow:2,maxFirstOrLastCheckOffsetHours:2,
   allowedFailedChecksPerWindow:0},
  evaluations:candidates.map(evaluate),
  limitations:[
   'Only local capture-time history, not original source-publication first-seen timestamps.',
   'Successful feed polling does not prove source coverage or lack of missing incidents.',
   'Distinct provider IDs may correspond to related aftershocks; no causal independence is established.',
   'An observed activity spike is not a forecast, lead-time measurement, investment signal or verified warning.',
   'No labeled future outcomes exist; precision, recall and false-positive rates remain unknown.'
  ]};
}
export function createPrecursorEngine({collector,now=()=>new Date().toISOString()}={}){
 if(typeof collector?.precursorEvidence!=='function')throw TypeError('A collector exposing verified precursor evidence is required');
 const catalog=()=>({schemaVersion:1,ruleVersion:PRECURSOR_RULE_VERSION,
  sources:GLOBAL_EVENT_SOURCES.map(s=>({id:s.id,coverage:s.coverage,family:s.family})),
  windowHours:6,baselineWindows:BASELINE,minSuccessfulChecks:2,validation:'NOT_PREDICTIVE',
  note:'Precursor Radar measures observed source activity only; it emits no trading alerts.'});
 async function analyze({asOf=null,source=null}={}){
  if(source&&!GLOBAL_EVENT_SOURCES.some(s=>s.id===source))throw issue('Unknown precursor source');
  const reference=now();
  if(!strictISO(reference))throw issue('Current collector time invalid',503);
  const cutoff=asOf??reference;
  if(!strictISO(cutoff)||ms(cutoff)>ms(reference))throw issue('Choose a valid nonfuture UTC as-of instant');
  const snapshot=await collector.precursorEvidence({asOf:cutoff});
  return assessPrecursorEvidence({evidence:snapshot,asOf:cutoff,source});
 }
 return {catalog,analyze};
}
const send=(res,code,payload)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
export function createPrecursorApi({engine}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/precursors/'))return false;
  try{
   if(req.method!=='GET')throw issue('Precursor research is read-only',405);
   const route=u.pathname.slice('/api/precursors/'.length);
   if(route==='catalog'&&u.searchParams.size===0)send(res,200,engine.catalog());
   else if(route==='analysis'){
    if([...u.searchParams.keys()].some(k=>!['source','asOf'].includes(k)||
       u.searchParams.getAll(k).length!==1))throw issue('Unsupported precursor query');
    send(res,200,await engine.analyze({source:u.searchParams.get('source'),
     asOf:u.searchParams.get('asOf')}));
   }else throw issue('Unknown precursor endpoint',404);
  }catch(e){send(res,[400,404,405,503].includes(e?.status)?e.status:503,
   {error:e?.status?e.message:'Precursor data unavailable'});}
  return true;
 };
}
