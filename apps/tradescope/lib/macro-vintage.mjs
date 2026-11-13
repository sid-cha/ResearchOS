/**
 * v0.15: ALFRED date-vintage reads, no current-vintage fallbacks.
 * An asOf date means end of that calendar day, NOT intraday release-time availability.
 */
const SOURCE='FRED_ALFRED_VINTAGE';
const START='2005-01-01';
const API='https://api.stlouisfed.org/fred/series/observations';
export const MACRO_INDICATORS=Object.freeze([
 Object.freeze({id:'yield_curve_10y_3m',seriesId:'T10Y3M',label:'10Y minus 3M Treasury spread',unit:'percentage points',maxAgeDays:10,operator:'lte',threshold:0,explanation:'A nonpositive curve is a candidate credit-cycle warning, not a crash forecast.'}),
 Object.freeze({id:'high_yield_oas',seriesId:'BAMLH0A0HYM2',label:'US high-yield option-adjusted spread',unit:'percentage points',maxAgeDays:10,operator:'gte',threshold:6,explanation:'A wide high-yield spread can indicate elevated credit risk; threshold is exploratory.'}),
 Object.freeze({id:'financial_conditions_nfci',seriesId:'NFCI',label:'Chicago Fed National Financial Conditions Index',unit:'index',maxAgeDays:21,operator:'gt',threshold:0,explanation:'A positive value indicates tighter-than-average financial conditions; the vintage may be unavailable for earlier dates.'})
]);
const err=(message,status=400)=>Object.assign(new Error(message),{status});
export const isoDay=(value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const days=(from,to)=>(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
const deepCopy=obj=>structuredClone(obj);
function readAsOf(asOf,now){
 const today=now().toISOString().slice(0,10);
 if(!isoDay(asOf)||asOf<START||asOf>today)throw err('asOf must be a valid date from 2005-01-01 through today');
 return asOf;
}
function assessIndicator(def,observation){
 const ready=observation?.status==='available'&&typeof observation.value==='number'&&Number.isFinite(observation.value);
 const trigger=ready?(def.operator==='lte'?observation.value<=def.threshold:def.operator==='gte'?observation.value>=def.threshold:observation.value>def.threshold):null;
 return {id:def.id,label:def.label,seriesId:def.seriesId,ruleVersion:'macro-thresholds-v1-exploratory',operator:def.operator,threshold:def.threshold,unit:def.unit,
  status:ready?(trigger?'candidate_triggered':'candidate_not_triggered'):'unavailable',triggered:trigger,
  value:ready?observation.value:null,observationDate:observation?.observationDate||null,ageDays:observation?.ageDays??null,
  reason:ready?def.explanation:observation?.reason||'No verified point-in-time observation',provenance:ready?{source:SOURCE,asOf:observation.asOf,vintageStart:observation.vintageStart,vintageEnd:observation.vintageEnd}:null};
}
export function evaluateMacroWarnings(snapshot){
 if(!snapshot||!isoDay(snapshot.asOf)||!Array.isArray(snapshot.observations))throw err('Macro snapshot is malformed');
 const rules=MACRO_INDICATORS.map(def=>assessIndicator(def,snapshot.observations.find(row=>row.id===def.id)));
 const available=rules.filter(r=>r.triggered!==null).length,triggered=rules.filter(r=>r.triggered===true).length;
 return {asOf:snapshot.asOf,mode:'DETERMINISTIC_RESEARCH_RULES',modelVersion:'macro-thresholds-v1-exploratory',
  evidenceStatus:available===0?'INSUFFICIENT_POINT_IN_TIME_EVIDENCE':available<rules.length?'PARTIAL_POINT_IN_TIME_EVIDENCE':'VINTAGE_OBSERVATIONS_AVAILABLE',
  availableRules:available,totalRules:rules.length,triggeredRules:triggered,
  rules,calibratedForecast:false,crashProbability:null,marketOutcomeBacktested:false,
  warning:'Rule triggers are unvalidated historical research candidates. No calibrated crash probability, crisis prediction, backtested lead time, or intraday publication-time evidence is asserted.'};
}
async function boundedJson(response){
 if(Number(response.headers?.get?.('content-length'))>300000)throw err('Macro provider response exceeded size limit',502);
 if(!response.body?.getReader){const txt=await response.text();if(Buffer.byteLength(txt)>300000)throw err('Macro provider response exceeded size limit',502);try{return JSON.parse(txt)}catch{throw err('Invalid macro provider JSON',502)}}
 const rd=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const x=await rd.read();if(x.done)break;size+=x.value.byteLength;if(size>300000){await rd.cancel();throw err('Macro provider response exceeded size limit',502)}chunks.push(Buffer.from(x.value));}}
 finally{rd.releaseLock()}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw err('Invalid macro provider JSON',502)}
}
export function parseAlfredSeries(payload,{series,asOf}){
 if(!isoDay(asOf)||!MACRO_INDICATORS.some(d=>d.seriesId===series))throw err('Unsupported macro series/date');
 if(!payload||payload.realtime_start!==asOf||payload.realtime_end!==asOf||!Array.isArray(payload.observations)||
   !Number.isSafeInteger(payload.count)||payload.count<0||payload.count>1000||
   payload.observations.length>1000||payload.count>payload.observations.length)
  throw err('Macro vintage response is incomplete or misdated',502);
 const def=MACRO_INDICATORS.find(d=>d.seriesId===series);
 let latest=null;
 for(const row of payload.observations){
  if(!row||!isoDay(row.date)||row.date>asOf||!isoDay(row.realtime_start)||!isoDay(row.realtime_end)||
    row.realtime_start>asOf||row.realtime_end<asOf)throw err('Macro provider returned future or non-vintage observations',502);
  if(row.value==='.'||row.value===null)continue;
  if(typeof row.value!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(row.value.trim())||!Number.isFinite(Number(row.value)))
   throw err('Macro provider returned invalid numerical data',502);
  if(!latest||row.date>latest.observationDate)latest={value:Number(row.value),observationDate:row.date,vintageStart:row.realtime_start,vintageEnd:row.realtime_end};
 }
 const age=latest?days(latest.observationDate,asOf):null;
 if(!latest||age>def.maxAgeDays)return {id:def.id,seriesId:series,status:'unavailable',value:null,asOf,
  observationDate:latest?.observationDate||null,ageDays:age,reason:!latest?'No released nonmissing value in the bounded historical window':'Most recent visible observation is stale for this rule',source:SOURCE};
 return {id:def.id,seriesId:series,status:'available',value:latest.value,observationDate:latest.observationDate,
  ageDays:age,vintageStart:latest.vintageStart,vintageEnd:latest.vintageEnd,asOf,source:SOURCE,
  sourceUrl:'https://fred.stlouisfed.org/series/'+series};
}
export function createMacroVintage({fetchImpl=fetch,env=process.env,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 const apiKey=()=>{const key=env.FRED_API_KEY;if(typeof key!=='string'||!/^[a-z0-9]{32}$/.test(key))throw err('FRED_API_KEY is not configured on the server',503);return key;};
 async function read(series,asOf){
  const key=apiKey(),url=new URL(API);
  const start=new Date(Date.parse(asOf+'T00:00:00Z')-120*86400000).toISOString().slice(0,10);
  for(const [k,v] of Object.entries({series_id:series,api_key:key,file_type:'json',realtime_start:asOf,realtime_end:asOf,
   observation_start:start,observation_end:asOf,sort_order:'desc',limit:'1000'}))url.searchParams.set(k,v);
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchImpl(url.toString(),{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:ctrl.signal});
   if(!response.ok){await response.body?.cancel?.();throw err(response.status===429?'FRED rate limited this request':response.status===400||response.status===401?'FRED rejected the server credentials':'FRED upstream is unavailable',response.status===429?429:response.status===400||response.status===401?503:502)}
   return parseAlfredSeries(await boundedJson(response),{series,asOf});
  }catch(e){if(e.name==='AbortError')throw err('FRED vintage request timed out',504);if(e.status)throw e;throw err('FRED vintage request failed',502)}
  finally{clearTimeout(timeout)}
 }
 async function cachedRead(series,asOf){
  const id=series+':'+asOf,entry=cache.get(id);
  if(entry?.expires>Date.now())return deepCopy(entry.value);
  if(pending.has(id))return deepCopy(await pending.get(id));
  const task=read(series,asOf).then(value=>{cache.set(id,{value,expires:Date.now()+300000});if(cache.size>64)cache.delete(cache.keys().next().value);return value});
  pending.set(id,task);
  try{return deepCopy(await task)}finally{pending.delete(id)}
 }
 return {
  catalog(){return {source:SOURCE,asOfSemantics:'END_OF_CALENDAR_DAY_NOT_INTRADAY',indicators:deepCopy(MACRO_INDICATORS),minimumDate:START,
   credentialsConfigured:typeof env.FRED_API_KEY==='string'&&/^[a-z0-9]{32}$/.test(env.FRED_API_KEY),
   methodology:'https://fred.stlouisfed.org/docs/api/fred/realtime_period.html',calibratedForecast:false};},
  async snapshot(asOf){
   readAsOf(asOf,now);apiKey();
   const settled=await Promise.allSettled(MACRO_INDICATORS.map(def=>cachedRead(def.seriesId,asOf)));
   const observations=settled.map((x,i)=>x.status==='fulfilled'?x.value:{id:MACRO_INDICATORS[i].id,seriesId:MACRO_INDICATORS[i].seriesId,
    status:'unavailable',value:null,asOf,reason:'Provider unavailable: '+(x.reason?.status===429?'rate limited':x.reason?.status===504?'timed out':'unverified upstream response'),source:SOURCE});
   const snapshot={source:SOURCE,asOf,asOfSemantics:'END_OF_CALENDAR_DAY_NOT_INTRADAY',fetchedAt:now().toISOString(),observations,
    provenanceNote:'ALFRED real-time validity dates are checked; original intraday publication times are not provided. Missing series are not interpolated.'};
   return {...snapshot,earlyWarning:evaluateMacroWarnings(snapshot)};
  }
 };
}
export function createMacroVintageApi({service=createMacroVintage()}={}){
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 return async (req,res,url)=>{
  if(!url.pathname.startsWith('/api/macro/'))return false;
  if(req.method!=='GET'){reply(res,405,{error:'Read-only macro research API'});return true;}
  if(url.pathname==='/api/macro/catalog'){reply(res,200,service.catalog());return true;}
  if(url.pathname==='/api/macro/snapshot'){
   try{const day=url.searchParams.get('asOf');if(url.searchParams.getAll('asOf').length!==1)throw err('Supply exactly one asOf date');
    reply(res,200,await service.snapshot(day));}catch(error){reply(res,error.status&&[400,429,502,503,504].includes(error.status)?error.status:502,{error:error.status?error.message:'Macro research service failed'});}
   return true;
  }
  reply(res,404,{error:'Unknown macro research endpoint'});return true;
 };
}
