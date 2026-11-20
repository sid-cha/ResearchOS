/**
 * v0.32 Global Event Collection: server-only, opt-in, fixed-provider reads.
 * CapturedAt/firstObservedAt is OUR observation clock, never a retroactive publication time.
 * Three independent sources retain original IDs and never imply company/market causality.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createFaaLiveService} from './event-intelligence.mjs';

export const GLOBAL_EVENT_SOURCES=Object.freeze([
 {id:'USGS',name:'USGS 4.5+ earthquakes (past day)',family:'climate',
  url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
  coverage:'USGS 4.5+ earthquake summary, past 24h; provider updates and removals possible'},
 {id:'NASA_EONET',name:'NASA EONET open natural events',family:'climate',
  url:'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
  coverage:'100 currently open EONET events at most; not a complete historical natural disaster record'},
 {id:'FAA_NAS_STATUS',name:'FAA current airport advisories',family:'aviation',
  url:'https://nasstatus.faa.gov/api/airport-events',
  coverage:'Airport ground stop, delay and closure snapshots only; not FAA national notice archive'}
]);
const error=(message,status=400)=>Object.assign(Error(message),{status});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nowUTC=()=>new Date().toISOString();
const iso=x=>typeof x==='string'&&x.length<=44&&Number.isFinite(Date.parse(x))?new Date(x).toISOString():null;
const millis=x=>Number.isFinite(x)&&x>=0&&x<=4102444800000?new Date(x).toISOString():null;
const clean=(x,n=200)=>typeof x==='string'?x.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const strId=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,96}$/.test(x)?x:null;
const validCoord=(lon,lat)=>Number.isFinite(lon)&&Math.abs(lon)<=180&&Number.isFinite(lat)&&Math.abs(lat)<=90?[lon,lat]:null;
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=480?u.href:null;}catch{return null;}};
function canonicalCollectedEvent(v,source){
 const id=typeof v?.id==='string'&&v.id.length<=160&&
   /^[A-Za-z0-9_.:-]+$/.test(v.id)&&v.id.startsWith(source.id+':')?v.id:null;
 if(!id||v.source!==source.id||v.family!==source.family||!safeUrl(v.sourceUrl))return null;
 const point=Array.isArray(v.location)?validCoord(v.location[0],v.location[1]):null;
 return observable(id,source.id,source.family,clean(v.type,60)||'OBSERVED_EVENT',
   clean(v.title,200)||'Untitled source observation',clean(v.description,450),
   iso(v.eventTime),iso(v.providerUpdatedAt),safeUrl(v.sourceUrl),point,
   clean(v.status,40)||'reported');
}
const observable=(id,source,family,type,title,description,eventTime,providerUpdatedAt,url,geometry=null,status='reported')=>({
 id,source,family,type,title,description,eventTime,providerUpdatedAt,sourceUrl:url,
 location:geometry,status,knowledgeClass:'SOURCE_OBSERVATION',
 issuerExposureVerified:false,financialImpactVerified:false,forecastProbability:null
});
export function normalizeUsgs(payload){
 if(!payload||payload.type!=='FeatureCollection'||!Array.isArray(payload.features)||payload.features.length>500)
  throw error('Unexpected USGS feed structure',502);
 const out=[];
 for(const f of payload.features.slice(0,150)){
  const id=strId(f?.id),p=f?.properties,c=f?.geometry?.coordinates;
  if(!id||!p||typeof p!=='object'||f.geometry?.type!=='Point')continue;
  const mag=typeof p.mag==='number'&&Number.isFinite(p.mag)?p.mag:null;
  if(mag===null||mag<4.5)continue;
  const start=millis(p.time),updated=millis(p.updated);
  if(!start)continue;
  const place=clean(p.place,160);
  const sourceUrl=safeUrl(p.url)||'https://earthquake.usgs.gov/earthquakes/feed/v1.0/';
  out.push(observable('USGS:'+id,'USGS','climate','EARTHQUAKE',
   'M'+mag.toFixed(1)+' · '+(place||'Location unavailable'),
   'USGS earthquake observation. Magnitude '+mag.toFixed(1)+'. This does not establish damage or company loss.',
   start,updated,sourceUrl,
   Array.isArray(c)?validCoord(c[0],c[1]):null,clean(p.status,30)||'reported'));
 }
 return out;
}
export function normalizeEonet(payload){
 if(!payload||!Array.isArray(payload.events)||payload.events.length>500)
  throw error('Unexpected NASA EONET feed structure',502);
 const out=[];
 for(const e of payload.events.slice(0,150)){
  const id=strId(e?.id);if(!id)continue;
  const category=Array.isArray(e.categories)?e.categories.map(x=>clean(x?.id||x?.title,32)).filter(Boolean):[];
  const latest=Array.isArray(e.geometry)?e.geometry.filter(x=>iso(x?.date)).at(-1):null;
  const point=latest?.type==='Point'&&Array.isArray(latest.coordinates)?
   validCoord(latest.coordinates[0],latest.coordinates[1]):null;
  const type=category.includes('wildfires')?'WILDFIRE':category.includes('severeStorms')?'SEVERE_STORM':
    category.includes('volcanoes')?'VOLCANIC_ACTIVITY':'NATURAL_EVENT';
  const url=safeUrl(e.link)||'https://eonet.gsfc.nasa.gov/';
  out.push(observable('NASA_EONET:'+id,'NASA_EONET','climate',type,
    clean(e.title,200)||'NASA EONET natural event',
    clean(e.description,450)||'Curated NASA EONET event metadata; not a verified economic impact.',
    latest?iso(latest.date):null,iso(e.closed),url,point,
    e.closed?'closed':'open'));
 }
 return out;
}
export function normalizeFaaCollection(data){
 if(!data||data.source!=='FAA_NAS_STATUS'||!Array.isArray(data.events)||data.events.length>300)
  throw error('Unexpected FAA normalized airport feed',502);
 return data.events.slice(0,150).flatMap(e=>{
  if(!e||!(/^[A-Z0-9]{3,4}$/).test(e.airport)||!(['GROUND_STOP','GROUND_DELAY','AIRPORT_CLOSURE'].includes(e.type)))return [];
  const providerId=strId(e.id)||e.airport+':'+e.type;
  return [observable('FAA_NAS_STATUS:'+e.airport+':'+e.type+':'+providerId,
   'FAA_NAS_STATUS','aviation','AVIATION_'+e.type,
   e.airport+' · '+e.type.replaceAll('_',' ').toLowerCase(),
   clean(e.reason,400)||'FAA airport-specific advisory, reason unspecified.',
   iso(e.startAt),iso(e.endAt),'https://nasstatus.faa.gov/',null,'current_snapshot')];
 });
}
async function boundedJson(url,{fetchImpl=globalThis.fetch,timeoutMs=8000,maxBytes=1100000}={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:ctrl.signal,
   headers:{Accept:'application/json','User-Agent':'ResearchOS-LocalEventCollector/0.32 (public research; contact via project repository)'}});
  if(!response?.ok)throw error('Provider unavailable',503);
  const contentType=response.headers?.get?.('content-type')||'';
  if(contentType&&!/json/i.test(contentType))throw error('Unexpected provider format',502);
  if(Number(response.headers?.get?.('content-length')||0)>maxBytes)throw error('Provider data exceeded byte limit',502);
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes)throw error('Provider data exceeded byte limit',502);
  return JSON.parse(text);
 }catch{throw error('Provider response unavailable or invalid',503);}
 finally{clearTimeout(timer);}
}
export function createGlobalEventAdapters({fetchImpl=globalThis.fetch,faaLive=createFaaLiveService({fetchImpl})}={}){
 return Object.freeze({
  USGS:async()=>normalizeUsgs(await boundedJson(GLOBAL_EVENT_SOURCES[0].url,{fetchImpl})),
  NASA_EONET:async()=>normalizeEonet(await boundedJson(GLOBAL_EVENT_SOURCES[1].url,{fetchImpl})),
  FAA_NAS_STATUS:async()=>normalizeFaaCollection(await faaLive())
 });
}
const BUCKET_MS=6*60*60*1000, MAX_POLL_WINDOWS=4000;
const bucket=at=>new Date(Math.floor(Date.parse(at)/BUCKET_MS)*BUCKET_MS).toISOString();
const blank=()=>({schemaVersion:1,events:[],pollWindows:[],providers:Object.fromEntries(GLOBAL_EVENT_SOURCES.map(s=>
 [s.id,{status:'never_checked',lastCheckedAt:null,lastSuccessAt:null,lastFailureAt:null,
  lastCount:null,error:null}]))});
function checkDocument(doc,maxEvents,maxRevisions){
 if(!doc||doc.schemaVersion!==1||!Array.isArray(doc.events)||doc.events.length>maxEvents||!doc.providers)
  throw error('Global event store has an invalid schema',500);
 // Legacy v0.32 stores have no historical polling denominators. Do not invent them.
 if(doc.pollWindows===undefined)doc.pollWindows=[];
 if(!Array.isArray(doc.pollWindows)||doc.pollWindows.length>MAX_POLL_WINDOWS)
  throw error('Invalid polling coverage history',500);
 const coverageKeys=new Set();
 for(const w of doc.pollWindows){
  const key=w?.source+':'+w?.windowStart;
  if(!w||!GLOBAL_EVENT_SOURCES.some(s=>s.id===w.source)||!iso(w.windowStart)||
   w.windowStart!==bucket(w.windowStart)||!Number.isSafeInteger(w.successes)||
   !Number.isSafeInteger(w.failures)||w.successes<0||w.failures<0||
   w.successes+w.failures<1||!(w.firstSuccessAt===null||iso(w.firstSuccessAt))||
   !(w.lastSuccessAt===null||iso(w.lastSuccessAt))||
   (w.successes===0)!==(w.firstSuccessAt===null&&w.lastSuccessAt===null)||
   (w.successes>0&&(w.firstSuccessAt>w.lastSuccessAt||
    bucket(w.firstSuccessAt)!==w.windowStart||bucket(w.lastSuccessAt)!==w.windowStart))||
   coverageKeys.has(key))throw error('Invalid polling coverage checkpoint',500);
  coverageKeys.add(key);
 }
 const seen=new Set();let count=0;
 for(const entry of doc.events){
  if(!entry||typeof entry.id!=='string'||seen.has(entry.id)||!iso(entry.firstObservedAt)||
   !iso(entry.lastObservedAt)||!Array.isArray(entry.revisions)||!entry.revisions.length)
   throw error('Global event store has an invalid record',500);
  seen.add(entry.id);let previous=null;
  for(const r of entry.revisions){
   if(!r||!iso(r.capturedAt)||!r.event||r.event.id!==entry.id||
    !/^[a-f0-9]{64}$/.test(r.contentHash)||r.contentHash!==digest(r.event)||
    previous&&Date.parse(previous.capturedAt)>Date.parse(r.capturedAt)||
    previous&&previous.contentHash===r.contentHash)
    throw error('Global event revisions cannot be verified',500);
   previous=r;count++;
  }
  if(entry.firstObservedAt!==entry.revisions[0].capturedAt||
    Date.parse(entry.lastObservedAt)<Date.parse(previous.capturedAt))throw error('Invalid event observation clock',500);
 }
 if(count>maxRevisions)throw error('Global event revision capacity exceeded',500);
 return doc;
}
export function createGlobalEventCollector({filename,enabled=false,autoPoll=false,intervalMs=300000,
 adapters=createGlobalEventAdapters(),now=nowUTC,setIntervalFn=setInterval,clearIntervalFn=clearInterval,
 maxEvents=600,maxRevisions=3000,maxBytes=12000000}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>2000||
   !Number.isInteger(maxRevisions)||maxRevisions<1||maxRevisions>10000||
   !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>50000000||
   !Number.isInteger(intervalMs)||intervalMs<60000||intervalMs>3600000)throw TypeError('Invalid global collector configuration');
 const enabledHere=enabled===true;let state=null,loading=null,queue=Promise.resolve(),timer=null,closed=false;
 const stamp=()=>{const t=iso(now());if(!t)throw error('Collector clock unavailable',500);return t;};
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.stat(filename);
    if(stat.size>maxBytes)throw error('Global event store exceeds size limit',500);
    return state=checkDocument(JSON.parse(await fs.readFile(filename,'utf8')),maxEvents,maxRevisions);
   }catch(e){
    if(e.code==='ENOENT')return state=blank();
    throw error('Global event store cannot be verified',500);
   }
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 async function save(next){
  const data=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(data)>maxBytes)throw error('Global event store is full; migrate or archive before further ingestion',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,data,{mode:0o600,flag:'wx'});await fs.rename(temp,filename);}
  catch{throw error('Could not persist global event records',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 const serial=fn=>{
  const work=queue.then(async()=>{await load();return fn();});
  queue=work.catch(()=>{});
  return work;
 };
 const status=async()=>{
  await queue;const d=await load();
  return {schemaVersion:1,enabled:enabledHere,autoPoll:enabledHere&&autoPoll,
   intervalMs,sourceCount:GLOBAL_EVENT_SOURCES.length,
   sources:GLOBAL_EVENT_SOURCES.map(s=>({...s,...d.providers[s.id]})),
   eventCount:d.events.length,revisionCount:d.events.reduce((n,e)=>n+e.revisions.length,0),
    pollWindowCount:d.pollWindows.length,
   bounds:{maxEvents,maxRevisions,maxBytes},
   limitations:['CapturedAt is local first observation, never retrospective original publication proof.',
    'Only three bounded source feeds; missing items do not establish resolution or absence.',
    'Source events do not prove issuer exposure, market movement or causality.']};
 };
 function markPoll(doc,source,at,success){
  const start=bucket(at);
  let w=doc.pollWindows.find(x=>x.source===source&&x.windowStart===start);
  if(!w){
   if(doc.pollWindows.length>=MAX_POLL_WINDOWS)
    throw error('Polling history capacity reached; migrate before continuing',409);
   w={source,windowStart:start,successes:0,failures:0,firstSuccessAt:null,lastSuccessAt:null};
   doc.pollWindows.push(w);
  }
  if(success){w.successes++;w.firstSuccessAt??=at;w.lastSuccessAt=at;}
  else w.failures++;
 }
 async function poll(){
  if(!enabledHere)throw error('Global event collection is disabled',403);
  if(closed)throw error('Global event collector is closed',503);
  return serial(async()=>{
   const startedAt=stamp(),next=structuredClone(state),runs=[];
   let lastCaptureAt=startedAt;
   for(const source of GLOBAL_EVENT_SOURCES){
    // Per-provider staging prevents capacity or malformed-payload failures
    // from committing a partial batch while reporting that source as failed.
    const staged=structuredClone(next);
    const p=staged.providers[source.id];
    try{
     const incoming=await adapters[source.id]();
     // Network response must complete before local knowledge can be timestamped.
     const completedAt=stamp();lastCaptureAt=completedAt;
     p.lastCheckedAt=completedAt;
     if(!Array.isArray(incoming)||incoming.length>150)throw error('Unexpected normalized provider batch',502);
     let added=0,revised=0,unchanged=0;
     const batchSeen=new Set();
     for(const value of incoming){
      const event=canonicalCollectedEvent(value,source);
      if(!event||batchSeen.has(event.id))continue;
      batchSeen.add(event.id);
      const hash=digest(event);
      let record=staged.events.find(x=>x.id===event.id);
      if(!record){
       if(staged.events.length>=maxEvents)throw error('Global event event capacity reached',409);
       if(staged.events.reduce((n,e)=>n+e.revisions.length,0)>=maxRevisions)throw error('Global revision capacity reached',409);
       record={id:event.id,source:source.id,firstObservedAt:completedAt,lastObservedAt:completedAt,revisions:[]};
       staged.events.push(record);added++;
      }else{
       record.lastObservedAt=completedAt;
       if(record.revisions.at(-1)?.contentHash===hash){unchanged++;continue;}
       if(staged.events.reduce((n,e)=>n+e.revisions.length,0)>=maxRevisions)throw error('Global revision capacity reached',409);
       revised++;
      }
      record.revisions.push({version:record.revisions.length+1,capturedAt:completedAt,contentHash:hash,event});
     }
     p.status='ok';p.lastSuccessAt=completedAt;p.lastCount=batchSeen.size;p.error=null;
     markPoll(staged,source.id,completedAt,true);
     // Commit this provider's all-or-nothing staged snapshot.
     next.events=staged.events;next.providers[source.id]=p;next.pollWindows=staged.pollWindows;
     runs.push({source:source.id,status:'ok',received:batchSeen.size,added,revised,unchanged});
    }catch(e){
     const failedAt=stamp();lastCaptureAt=failedAt;
     const failed=next.providers[source.id];failed.lastCheckedAt=failedAt;
     failed.status='failed';failed.lastFailureAt=failedAt;failed.error=e?.status===409?
      'Local archive capacity reached; no new source evidence was committed':'Feed unavailable or payload rejected';
     markPoll(next,source.id,failedAt,false);
     runs.push({source:source.id,status:'failed',error:failed.error});
    }
   }
   checkDocument(next,maxEvents,maxRevisions);
   await save(next);
   state=next;
   return {capturedAt:lastCaptureAt,results:runs,eventCount:state.events.length};
  });
 }
 async function list({source=null,family=null,asOf=null,limit=100}={}){
  if(source&&!GLOBAL_EVENT_SOURCES.some(x=>x.id===source))throw error('Unsupported source filter');
  if(family&&!['aviation','climate'].includes(family))throw error('Unsupported event family filter');
  if(asOf&&!iso(asOf))throw error('Invalid knowledge as-of time');
  if(!Number.isInteger(limit)||limit<1||limit>200)throw error('Invalid result limit');
  await queue;const doc=await load();
  const items=doc.events.filter(e=>(!source||e.source===source)).flatMap(e=>{
   const eligible=e.revisions.filter(r=>!asOf||r.capturedAt<=iso(asOf));
   if(!eligible.length)return[];
   const latest=eligible.at(-1),event=latest.event;
   if(family&&event.family!==family)return[];
   return[{...event,firstObservedAt:e.firstObservedAt,
    lastObservedAt:asOf?latest.capturedAt:e.lastObservedAt,
    revision:latest.version,lastRevisionCapturedAt:latest.capturedAt,
    knowledgeStatus:'OBSERVED_IN_LOCAL_ARCHIVE',
    originalFirstPublicationVerified:false}];
  });
  items.sort((a,b)=>b.lastRevisionCapturedAt.localeCompare(a.lastRevisionCapturedAt)||a.id.localeCompare(b.id));
  return {schemaVersion:1,asOf,source,family,total:items.length,events:items.slice(0,limit),
   isPartial:items.length>limit,knowledgeBoundary:'Only events first captured by this local collector are eligible.'};
 }
 async function precursorEvidence({asOf=null}={}){
  if(asOf!==null&&!iso(asOf))throw error('Invalid precursor as-of time');
  await queue;const doc=await load(),cutoff=asOf?iso(asOf):stamp();
  const events=doc.events.flatMap(entry=>{
   if(entry.firstObservedAt>cutoff)return [];
   const revisions=entry.revisions.filter(r=>r.capturedAt<=cutoff),latest=revisions.at(-1);
   if(!latest)return [];
   return [{id:entry.id,source:entry.source,firstObservedAt:entry.firstObservedAt,
    eventTime:latest.event.eventTime,providerUpdatedAt:latest.event.providerUpdatedAt,
    type:latest.event.type,location:latest.event.location,revisionCount:revisions.length,
    latestRevisionAt:latest.capturedAt}];
  });
  const pollWindows=doc.pollWindows.filter(w=>Date.parse(w.windowStart)+BUCKET_MS<=Date.parse(cutoff));
  return {schemaVersion:1,asOf:cutoff,events,pollWindows:structuredClone(pollWindows),
   note:'Only fully completed polling buckets and locally available event revisions are eligible. Earlier v0.32 history was not backfilled.'};
 }
 async function detail(id){
  if(typeof id!=='string'||id.length>160||!GLOBAL_EVENT_SOURCES.some(x=>id.startsWith(x.id+':')))throw error('Invalid event ID');
  await queue;const doc=await load(),entry=doc.events.find(e=>e.id===id);
  if(!entry)throw error('Event not captured',404);
  return {id,source:entry.source,firstObservedAt:entry.firstObservedAt,
   lastObservedAt:entry.lastObservedAt,revisions:structuredClone(entry.revisions),
   warning:'Revisions reflect changes to locally normalized snapshots, not necessarily official amendments.'};
 }
 function start(){
  if(!enabledHere||!autoPoll||timer!==null||closed)return;
  timer=setIntervalFn(()=>{void poll().catch(()=>{});},intervalMs);
  timer?.unref?.();
  void poll().catch(()=>{});
 }
 async function close(){
  closed=true;
  if(timer!==null)clearIntervalFn(timer);timer=null;await queue;
 }
 return {status,poll,list,detail,precursorEvidence,start,close};
}
function respond(res,status,body){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));
}
export function createGlobalEventApi({collector,host='127.0.0.1'}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/global-events/'))return false;
  const route=u.pathname.slice('/api/global-events/'.length);
  try{
   if(route==='status'&&req.method==='GET'&&u.searchParams.size===0)respond(res,200,await collector.status());
   else if(route==='events'&&req.method==='GET'){
    if([...u.searchParams.keys()].some(x=>!['source','family','asOf','limit'].includes(x)||
     u.searchParams.getAll(x).length!==1))throw error('Unsupported event query');
    const limit=u.searchParams.has('limit')?Number(u.searchParams.get('limit')):100;
    respond(res,200,await collector.list({source:u.searchParams.get('source'),
     family:u.searchParams.get('family'),asOf:u.searchParams.get('asOf'),limit}));
   }else if(route==='detail'&&req.method==='GET'){
    if(u.searchParams.getAll('id').length!==1||u.searchParams.size!==1)throw error('Invalid event detail query');
    respond(res,200,await collector.detail(u.searchParams.get('id')));
   }else if(route==='refresh'&&req.method==='POST'){
    if(u.searchParams.size)throw error('Unsupported refresh query');
    if(!['127.0.0.1','localhost','::1'].includes(host)||req.headers['sec-fetch-site']==='cross-site'||
       req.headers['x-researchos-event-refresh']!=='1'||
       req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)
       throw error('Local same-origin explicit refresh required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw error('Expected JSON',415);
    let raw='',bytes=0;
    for await(const part of req){bytes+=part.length;if(bytes>256)throw error('Request too large',413);raw+=part;}
    let parsed;try{parsed=JSON.parse(raw);}catch{throw error('Invalid refresh JSON');}
    if(!parsed||Array.isArray(parsed)||Object.keys(parsed).length)throw error('Refresh requires empty JSON object');
    respond(res,200,await collector.poll());
   }else throw error('Unknown event collection endpoint or method',404);
  }catch(e){
   respond(res,[400,403,404,409,413,415,500,503].includes(e?.status)?e.status:503,
    {error:e?.status?e.message:'Global event collection service unavailable'});
  }
  return true;
 };
}
