/** Event Intelligence v0.28 — domain-agnostic taxonomy, FAA source adapter and conservative research dossiers.
 * Research hypotheses ≠ verified causal pathways, forecasts, or active nationwide orders.
 */
import {SCENARIO_REGISTRY} from './scenario-registry.mjs';

export const EVENT_FAMILIES = Object.freeze([
 {id:'aviation',label:'Aviation & Transport',description:'Airspace controls, airports, air cargo and mobility'},
 {id:'climate',label:'Climate & Disasters',description:'Weather, fires, earthquakes, drought and precipitation'},
 {id:'energy',label:'Energy & Infrastructure',description:'Utilities, fuel supply, grid and systems availability'},
 {id:'geopolitical',label:'Geopolitics & Trade',description:'Sanctions, trade restrictions and geopolitical shocks'},
 {id:'industrial',label:'Industry & Supply Chains',description:'Inputs, facilities, production and logistics'},
 {id:'macro',label:'Macro & Credit',description:'Liquidity, rate shocks, growth and credit stress'},
 {id:'cyber',label:'Cyber & Technology',description:'Technology outages, security and operational dependencies'},
 {id:'health',label:'Health & Society',description:'Public health, labor availability and demand shocks'}
]);
const FAA_URL='https://nasstatus.faa.gov/api/airport-events';
const FAA_PUBLIC_URL='https://nasstatus.faa.gov/';
const CASE_ID='faa-national-ground-stop-2026-11-13';
const CASE={
 id:CASE_ID,theme:'aviation',eventType:'AVIATION_NATIONWIDE_GROUND_STOP',
 title:'U.S. nationwide aviation ground stop — November 13, 2026',
 description:'Research case: reported FAA nationwide departure halt amid air-traffic-control communications disruption. Cause and company-level financial outcomes not independently established.',
 eventTime:'2026-11-13T20:54:00Z',
 source:{provider:'Associated Press (contemporaneous report)',url:'https://apnews.com/article/f81b0904331dafad6133f291e5f531a8',publishedAt:'2026-11-13',timestampPrecision:'DATE_ONLY',firstSeenAt:null,archivedOriginal:false},
 location:'United States',issuerEffectsVerified:false,historicalPredictionValidated:false
};
const EVIDENCE=Object.freeze([
 {id:'gau-2024',kind:'PRECURSOR',title:'GAO documents aging, unsustainable FAA ATC systems',
  publishedOn:'2024-09-23',summary:'Systems sustainability and modernization concerns; not a dated prediction of a national ground stop.',
  source:'U.S. GAO',url:'https://www.gao.gov/products/gao-24-107001'},
 {id:'gao-2026',kind:'PRECURSOR',title:'GAO finds modernization cost and scheduling weaknesses',
  publishedOn:'2026-09-14',summary:'Documented infrastructure dependencies, risk and modernization planning gaps. No incident-specific causal claim.',
  source:'U.S. GAO',url:'https://www.gao.gov/products/gao-26-107992'},
 {id:'spectrum-2026',kind:'PRECURSOR',title:'GAO reviews threats to aviation communications',
  publishedOn:'2026-09-21',summary:'Communications resilience and threat-monitoring gaps. This does not prove a cyberattack caused this event.',
  source:'U.S. GAO',url:'https://www.gao.gov/products/gao-26-108439'},
 {id:'smart-2026',kind:'CONTEXT',title:'FAA announces nationwide expansion of SMART',
  publishedOn:'2026-11-10',summary:'A recent rollout warrants a dependency review, but temporal proximity alone is not evidence of causation.',
  source:'FAA',url:'https://www.faa.gov/newsroom/statements/general-statements'}
]);
const ANALOGUES=Object.freeze([
 {date:'2001-09-11',event:'U.S. airspace shutdown',class:'SECURITY_EMERGENCY',comparability:'LOW',reason:'Security attack; fundamentally different demand, confidence and closure mechanisms.'},
 {date:'2023-01-11',event:'Nationwide NOTAM system outage',class:'TECHNOLOGY_OUTAGE',comparability:'OPERATIONALLY_RELEVANT',reason:'Technical systems outage and nationwide departure halt; still requires independent duration and recovery comparisons.'},
 {date:'2026-11-13',event:'Reported nationwide communications-related stop',class:'COMMUNICATIONS_DISRUPTION',comparability:'CURRENT_CASE',reason:'Cause and duration not conclusively established from dated research sources.'}
]);
const PATHWAYS=Object.freeze([
 {id:'airlines',title:'Airline operations and recovery',horizon:'HOURS_TO_DAYS',candidates:['AAL','DAL','UAL','LUV','ALK'],
  mechanism:'Grounded departures → missed rotations and crew windows → recovery costs and possible contribution-margin changes.',
  checks:['Affected departures by carrier','Pre-stop cancellation baseline','Crew and aircraft recovery records','Refunds versus rebookings']},
 {id:'air-cargo',title:'Air cargo and time-critical logistics',horizon:'HOURS_TO_DAYS',candidates:['FDX','UPS'],
  mechanism:'Delayed cargo departures → hub backlog → possible delivery and production effects.',
  checks:['Actual cargo movements and routes','Scheduled delivery times','Verified customer dependencies']},
 {id:'travel',title:'Travel platforms and hospitality',horizon:'HOURS_TO_WEEKS',candidates:['BKNG','EXPE','MAR','HLT'],
  mechanism:'Stranded passengers and schedule changes → rebooking, hotel stays and cancellations with mixed demand outcomes.',
  checks:['Booked-versus-occupied rooms','Travel platform cancellations','Net refunds and booking fees']},
 {id:'road',title:'Road transportation substitution',horizon:'HOURS_TO_DAYS',candidates:['UBER','LYFT','CAR'],
  mechanism:'Some travelers may switch to road transport where distance, capacity and prices allow.',
  checks:['Actual city-pair substitution','Transport demand and price data','Alternative explanations']},
 {id:'fuel',title:'Jet fuel and refinery demand',horizon:'DAYS_TO_WEEKS',candidates:['VLO','MPC'],
  mechanism:'Sustained changes in flying → potential jet-fuel consumption effects; short disruptions may be immaterial.',
  checks:['Cancelled flight-hours versus shifted hours','Fuel draw and inventory','Refinery jet-fuel exposure']},
 {id:'insurance',title:'Travel insurance claim exposure',horizon:'DAYS_TO_QUARTER',candidates:[],
  mechanism:'Covered travel-delay events → possible claims, subject to deductibles, exclusions and limits.',
  checks:['Policy wording and insured population','Claims filings','Coverage triggers and exclusions']}
]);
const CHALLENGES=Object.freeze([
 {code:'ANALOGUE_MISMATCH',question:'Does the 2001 security shock actually predict effects of a technical outage?',required:'Match incident cause, duration, recovery and controls before transferring outcome patterns.'},
 {code:'CAUSALITY_UNPROVEN',question:'Did the SMART expansion cause the disruption?',required:'Independent incident report, implementation dependencies and alternative causes; do not infer from three-day proximity.'},
 {code:'BASELINE_MISSING',question:'Were all reported delays and cancellations caused by the ground stop?',required:'Pre-announcement baseline, weather and operations-adjusted changes by airport and carrier.'},
 {code:'ENTITY_EXPOSURE_MISSING',question:'Which issuer actually operated affected aircraft, cargo routes or facilities?',required:'Verified flight/asset and legal-entity crosswalk, not ticker proximity.'},
 {code:'LOOKAHEAD_RISK',question:'Could the warning have been generated before 20:54Z using only then-available evidence?',required:'Original publication, first-observed clocks and a retained immutable source copy.'},
 {code:'OUTCOME_VALIDATION',question:'Did a proposed market reaction exceed normal volatility or the sector benchmark?',required:'Licensed price histories, event-time controls, negative samples and held-out tests.'}
]);
const atDayEnd=day=>day+'T23:59:59Z';
const isAsOf=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000','')===v;
const clone=v=>structuredClone(v);
const boundedString=(v,n=150)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n):null;
const isoOrNull=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const domainOf=eventClass=>({
 climate:'climate',natural_hazard:'climate',energy:'energy',geopolitical:'geopolitical',
 logistics:'industrial',industry:'industrial',commodity:'industrial',macro:'macro',
 finance:'macro',credit:'macro',health:'health',cyber:'cyber'
})[eventClass]||'industrial';

export function normalizeFaaAirportEvents(raw,{fetchedAt=new Date().toISOString()}={}){
 if(!Array.isArray(raw)||raw.length>2000)throw new TypeError('FAA airport event response has an unexpected shape');
 const events=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const airport=boundedString(item.airportId,4)?.toUpperCase();
  if(!airport||!/^[A-Z0-9]{3,4}$/.test(airport))continue;
  for(const [field,type] of [['groundStop','GROUND_STOP'],['groundDelay','GROUND_DELAY'],['airportClosure','AIRPORT_CLOSURE']]){
   const d=item[field];if(!d||typeof d!=='object'||Array.isArray(d))continue;
   events.push({
    id:boundedString(d.id,80)||airport+':'+type,airport,type,
    reason:boundedString(d.reason||d.reasonForDelay||d.simpleText||d.comment,240),
    startAt:isoOrNull(d.startTime||d.startDate||d.start),
    endAt:isoOrNull(d.endTime||d.endDate||d.end),
    source:'FAA_NAS_STATUS',sourceUrl:FAA_PUBLIC_URL,fetchedAt,
    // A collection of airport incidents cannot prove a national order.
    nationwideOrderVerified:false
   });
   if(events.length>=300)break;
  }
  if(events.length>=300)break;
 }
 return {source:'FAA_NAS_STATUS',sourceUrl:FAA_URL,fetchedAt,
  coverage:'CURRENT_AIRPORT_EVENTS_ONLY',nationwideOrderVerified:false,
  events,counts:{groundStops:events.filter(x=>x.type==='GROUND_STOP').length,
   groundDelays:events.filter(x=>x.type==='GROUND_DELAY').length,
   airportClosures:events.filter(x=>x.type==='AIRPORT_CLOSURE').length},
  caveat:'A current airport-level status snapshot is not an archival national ground-stop notice. Empty results do not certify no disruption; the source is time-varying.'};
}
export function buildEventCase({asOf=null,now=new Date().toISOString()}={}){
 if(asOf!==null&&(!isAsOf(asOf)||asOf>now))throw new TypeError('Use an existing UTC asOf timestamp YYYY-MM-DDTHH:MM:SSZ');
 const historical=asOf!==null;
 const evidence=EVIDENCE.filter(e=>!historical||atDayEnd(e.publishedOn)<=asOf).map(e=>({
  ...e,availability:historical?'DATE_GATED_NOT_ARCHIVED':'DATED_PUBLICATION',
  originalFirstSeenAt:null,firstAvailableVerified:false
 }));
 // The dated sources were not captured by ResearchOS in historical real time.
 // Hide incident-dependent details in pre-event simulation.
 const eventObservable=!historical;
 const phase=historical?'PRECURSOR_REPLAY_RESTRICTED':'CURRENT_RETROSPECTIVE_CASE';
 return {
  schemaVersion:1,caseId:CASE_ID,mode:phase,asOf,generatedAt:now,
  event:eventObservable?clone(CASE):null,
  precursorContext:{status:'DOCUMENTED_RISK_NOT_PREDICTIVE_SIGNAL',observations:evidence,
   warningIssuedInRealTime:false,verifiedFirstAvailableCount:0,
   statement:'Dated public reports establish topics for investigation; they do not prove ResearchOS would have detected or predicted this event in real time.'},
  analogues:eventObservable?clone(ANALOGUES):[],
  pathways:eventObservable?clone(PATHWAYS).map(x=>({...x,verifiedIssuerExposure:false,measuredLoss:null,causalEdgeValidated:false})):[],
  challenges:eventObservable?clone(CHALLENGES):clone(CHALLENGES.filter(c=>['LOOKAHEAD_RISK','CAUSALITY_UNPROVEN'].includes(c.code))),
  forecast:{status:'NOT_VALIDATED',probability:null,priceTargets:null,impactDollars:null,
   requirement:'Historical first-seen snapshots, incident-specific exposure, measured outcomes and negative controls are necessary.'},
  caveats:historical?[
   'Pre-event view excludes incident facts, outcomes and issuer impact pathways.',
   'Original first-available and capture clocks are unverified; this is a conservative document-date exercise, not a valid historical live backtest.'
  ]:[
   'Case uses current reports; it is not a signed original FAA national-order archive.',
   'No financial losses, directional returns, causal edges, or predictive probabilities are verified.'
  ]
 };
}
export function eventCatalog(){
 const existing=SCENARIO_REGISTRY.catalog().scenarios;
 return {schemaVersion:1,portal:'EVENT_INTELLIGENCE',families:clone(EVENT_FAMILIES),
  scenarioCount:existing.length+1,caseCount:1,
  scenarios:[
   {id:'aviation-ground-stop',title:'FAA ground stop → travel, logistics and energy',theme:'aviation',eventClass:'aviation',
    industry:'Air transport / Logistics / Travel',currentMode:'SOURCE_CONTEXT_ONLY',
    connectedFeed:'FAA_NAS_STATUS',caseId:CASE_ID,status:'CASE_STUDY_AND_LIVE_AIRPORT_FEED',
    limitations:'No nationwide ground-stop archival API integration, verified company impact or live backtest.'},
   ...existing.map(s=>({id:s.id,title:s.title,theme:domainOf(s.eventClass),eventClass:s.eventClass,
    industry:s.industry,currentMode:s.currentMode,connectedFeed:null,caseId:null,
    status:s.currentMode==='TEMPLATE_ONLY'?'TEMPLATE_ONLY':'TRANSMISSION_LAB_SOURCE_CONTEXT',
    limitations:'Economic transmission hypotheses; event-specific outcome not verified.'}))
  ],
  note:'One cross-domain event portal; scenario-specific evidence contracts, not interchangeable economic predictions.'};
}
export function createFaaLiveService({fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()}={}){
 return async function fetchCurrentFaa(){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
  try{
   const response=await fetchImpl(FAA_URL,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal,redirect:'error'});
   if(!response.ok)throw Object.assign(new Error('FAA feed unavailable'),{status:502});
   const mime=response.headers?.get?.('content-type')||'';
   if(mime&&!/json/i.test(mime))throw Object.assign(new Error('Unexpected FAA feed format'),{status:502});
   if(Number(response.headers?.get?.('content-length')||0)>750000)throw Object.assign(new Error('FAA response exceeds configured bound'),{status:502});
   const body=await response.text();
   if(body.length>750000)throw Object.assign(new Error('FAA response exceeds configured bound'),{status:502});
   let json;try{json=JSON.parse(body);}catch{throw Object.assign(new Error('Invalid FAA feed response'),{status:502});}
   return normalizeFaaAirportEvents(json,{fetchedAt:now()});
  }catch(e){throw Object.assign(new Error(e.name==='AbortError'?'FAA feed timed out':'FAA live source unavailable'),{status:503});}
  finally{clearTimeout(timer);}
 };
}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
export function createEventIntelligenceApi({live=createFaaLiveService(),now=()=>new Date().toISOString()}={}){
 return async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/event-intelligence/'))return false;
  if(req.method!=='GET'){send(res,405,{error:'Read-only event intelligence API'});return true;}
  const route=url.pathname.slice('/api/event-intelligence/'.length);
  if(route==='catalog'&&![...url.searchParams].length){send(res,200,eventCatalog());return true;}
  if(route==='case'){
   if([...url.searchParams.keys()].some(x=>!['id','asOf'].includes(x))||url.searchParams.get('id')!==CASE_ID){
    send(res,400,{error:'Unknown case or unsupported parameter'});return true;
   }
   try{send(res,200,buildEventCase({asOf:url.searchParams.get('asOf'),now:now()}));}
   catch{send(res,400,{error:'Invalid asOf timestamp or future cutoff'});}
   return true;
  }
  if(route==='faa-live'&&![...url.searchParams].length){
   try{send(res,200,await live());}catch{send(res,503,{error:'FAA provider currently unavailable; no live status is inferred'});}
   return true;
  }
  send(res,404,{error:'Unknown event intelligence endpoint'});return true;
 };
}
