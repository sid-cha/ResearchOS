/**
 * ResearchOS v0.47 — bounded, opt-in, single-process source-observation scheduler.
 * Durable local queue and inbox; no external notifications or legal/market conclusions.
 * Disk journals are not multi-process locks or immutable remote evidence.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const ids=/^(?:source-job|source-run|source-alert)-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const bounded=(v,max=170)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const minute=60000;
const TYPES=Object.freeze({
 NOAA_NUMERIC:{min:360,max:1440,providers:['RONI','RELATIVE_NINO34','SOI','TRADE_WIND_CPAC','TRADE_WIND_WPAC']},
 CORPORATE_PRECURSOR:{min:60,max:1440,providers:['GDELT_MEDIA','FEDERAL_REGISTER','ALPACA_MEDIA']},
 MECHANISM_RADAR:{min:60,max:1440,providers:['GDELT_MEDIA','NOAA_CPC']}
});
export const SOURCE_MONITOR_VERSION='SOURCE-MONITOR-0.47.1';
export const SOURCE_MONITOR_LIMITS=Object.freeze({jobs:16,runs:240,alerts:300,bytes:4500000});
const kindTargets={
 NOAA_NUMERIC:['RONI','RELATIVE_NINO34','SOI','TRADE_WIND_CPAC','TRADE_WIND_WPAC'],
 CORPORATE_PRECURSOR:['NVDA','AMD','MSFT','AAPL','META','AMZN','TSLA','PLTR'],
 MECHANISM_RADAR:['enso-circulation','regulatory-export','logistics-bottleneck','energy-supply']
};
const kindOf=(kind,target,provider,intervalMinutes)=>{
 const def=TYPES[kind],allowed=kindTargets[kind];
 if(!def||!allowed?.includes(target)||!def.providers.includes(provider)||
    kind==='NOAA_NUMERIC'&&provider!==target||
    kind==='MECHANISM_RADAR'&&provider==='NOAA_CPC'&&target!=='enso-circulation')
  throw fail('Choose a registered source, target and provider');
 if(!Number.isInteger(intervalMinutes)||intervalMinutes<def.min||intervalMinutes>def.max)
  throw fail('Source interval is outside per-provider limits ('+def.min+'–'+def.max+' minutes)');
 return {kind,target,provider,intervalMinutes};
};
const keyOf=x=>[x.kind,x.target,x.provider].join('|');
const timeOf=(ms)=>new Date(ms).toISOString();
const errSummary=e=>bounded(e?.message||'Source request failed',180);
function validateDoc(doc){
 if(doc?.schema!==1||!Array.isArray(doc.jobs)||!Array.isArray(doc.runs)||!Array.isArray(doc.alerts)||
  doc.jobs.length>SOURCE_MONITOR_LIMITS.jobs||doc.runs.length>SOURCE_MONITOR_LIMITS.runs||
  doc.alerts.length>SOURCE_MONITOR_LIMITS.alerts)
  throw fail('Source monitor journal schema invalid',500);
 const {checksum,...body}=doc;
 if(checksum!==sha(body))throw fail('Source monitor journal checksum invalid',500);
 const jobIds=new Set(),jobKeys=new Set(),runIds=new Set(),alertIds=new Set(),eventKeys=new Set();
 for(const j of doc.jobs){
  if(!j||!ids.test(j.id)||!j.id.startsWith('source-job-')||jobIds.has(j.id)||
   !iso(j.createdAt)||!iso(j.updatedAt)||!iso(j.nextRunAt)||
   typeof j.enabled!=='boolean'||!Number.isInteger(j.failures)||j.failures<0||j.failures>20||
   !['IDLE','RUNNING','SUCCEEDED','FAILED','INTERRUPTED'].includes(j.status))
   throw fail('Source monitor job invalid',500);
  kindOf(j.kind,j.target,j.provider,j.intervalMinutes);
  const k=keyOf(j);if(jobKeys.has(k))throw fail('Duplicate source monitor target',500);
  jobKeys.add(k);jobIds.add(j.id);
 }
 for(const r of doc.runs){
  if(!r||!ids.test(r.id)||!r.id.startsWith('source-run-')||runIds.has(r.id)||
   !jobIds.has(r.jobId)||!['RUNNING','SUCCEEDED','FAILED','INTERRUPTED'].includes(r.status)||
   !iso(r.scheduledAt)||!iso(r.startedAt)||
   (r.finishedAt!==null&&!iso(r.finishedAt)))
   throw fail('Source monitor run invalid',500);
  runIds.add(r.id);
 }
 for(const a of doc.alerts){
  if(!a||!ids.test(a.id)||!a.id.startsWith('source-alert-')||
   alertIds.has(a.id)||eventKeys.has(a.eventKey)||!jobIds.has(a.jobId)||
   !iso(a.inboxAt)||!iso(a.firstObservedAt)||
   !['NEW','ACKNOWLEDGED'].includes(a.status)||
   (a.acknowledgedAt!==null&&!iso(a.acknowledgedAt))||
   !['SOURCE_BASELINE','SOURCE_REVISION','CLIMATE_THRESHOLD_REVIEW',
     'CORPORATE_REPORT_REVIEW','MECHANISM_TOPIC_REVIEW'].includes(a.type))
   throw fail('Source monitor alert invalid',500);
  alertIds.add(a.id);eventKeys.add(a.eventKey);
 }
 return doc;
}
const initial=()=>{const body={schema:1,jobs:[],runs:[],alerts:[]};return {...body,checksum:sha(body)};};
const putChecksum=body=>({...body,checksum:sha(body)});
const clippedRuns=(runs)=>runs.slice(-SOURCE_MONITOR_LIMITS.runs);
const clippedAlerts=(alerts)=>alerts.slice(-SOURCE_MONITOR_LIMITS.alerts);
const alertPriority=x=>x==='PROMPT_HUMAN_REVIEW'?'ELEVATED_REVIEW':x==='ELEVATED_HUMAN_REVIEW'?'REVIEW':'INFORMATIONAL';
export function createSourceMonitor({
 filename,climateNumeric,corporatePrecursor,mechanismRadar,
 enabled=false,rightsAcknowledged=false,now=Date.now,
 setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout,
 maxBytes=SOURCE_MONITOR_LIMITS.bytes
}={}){
 if(!path.isAbsolute(filename||'')||typeof now!=='function'||
  typeof climateNumeric?.capture!=='function'||
  typeof corporatePrecursor?.capture!=='function'||
  typeof mechanismRadar?.capture!=='function'||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>12000000)
  throw TypeError('Source monitor requires private journal, registered collectors and finite store size');
 let doc=null,loading=null,serial=Promise.resolve(),timer=null,started=false,closed=false,active=null;
 const clock=()=>{const t=Number(now());if(!Number.isFinite(t)||t<0)throw fail('Source monitor clock invalid',503);return t;};
 const ts=()=>timeOf(clock());
 const local=()=>{if(!enabled)throw fail('Source monitoring unavailable off loopback or explicitly disabled',403);};
 const allowed=()=>{local();if(!rightsAcknowledged)throw fail('Independent source monitoring permission acknowledgement required',403);};
 const withSerial=fn=>{const p=serial.then(async()=>{await load();return fn();});serial=p.catch(()=>{});return p;};
 const source=(job)=>job.kind==='NOAA_NUMERIC'?climateNumeric:
  job.kind==='CORPORATE_PRECURSOR'?corporatePrecursor:mechanismRadar;
 function permission(job){
  const c=source(job).catalog();
  if(!c.enabled||!c.rightsAcknowledged)throw fail('Underlying provider capture disabled or rights not acknowledged',403);
 }
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>maxBytes)throw fail('Source monitor journal exceeds storage bound',500);
    doc=validateDoc(JSON.parse(await fs.readFile(filename,'utf8')));
   }catch(e){
    if(e.code==='ENOENT')doc=initial();
    else throw fail('Source monitor journal could not be verified',500);
   }
   const abandoned=doc.runs.filter(r=>r.status==='RUNNING');
   if(abandoned.length){
    const at=ts();
    const changed={...doc,
     runs:doc.runs.map(r=>r.status==='RUNNING'?{...r,status:'INTERRUPTED',
      finishedAt:at,error:'Interrupted by process restart; result not assumed delivered'}:r),
     jobs:doc.jobs.map(j=>abandoned.some(r=>r.jobId===j.id)?{...j,status:'INTERRUPTED',
      failures:Math.min(20,j.failures+1),nextRunAt:timeOf(clock()+TYPES[j.kind].min*minute),
      updatedAt:at}:j)};
    await persist(changed);
   }
   return doc;
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 async function persist(next){
  const ready=putChecksum({schema:1,jobs:next.jobs,runs:clippedRuns(next.runs),
   alerts:clippedAlerts(next.alerts)});
  validateDoc(ready);
  const data=JSON.stringify(ready,null,2)+'\n';
  if(Buffer.byteLength(data)>maxBytes)throw fail('Source monitor private journal capacity exhausted',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const tmp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,data,{flag:'wx',mode:0o600});
   await fs.rename(tmp,filename);}catch{throw fail('Unable to persist source monitoring state',503);}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  doc=ready;
 }
 const catalog=()=>({version:SOURCE_MONITOR_VERSION,enabled,rightsAcknowledged,
  automaticPollingConfigured:enabled&&rightsAcknowledged,
  running:started&&!closed,workerConcurrency:1,
  maximumJobs:SOURCE_MONITOR_LIMITS.jobs,
  scheduleRules:Object.entries(TYPES).map(([kind,v])=>({kind,minIntervalMinutes:v.min,
   maxIntervalMinutes:v.max,targets:kindTargets[kind],providers:v.providers})),
  delivery:{localInbox:true,externalPush:false,email:false,webhook:false},
  caveats:['The local process must remain running for checks; no cloud worker or guaranteed service-level latency.',
   'Provider access and licensing must be enabled independently per collector.',
   'Source observation alerts are not verified corporate misconduct, climate impact or investment predictions.',
   'Local clock receipt and alert inbox times are measured; original publisher issue/delivery times are unverified.',
   'Private JSON journal is single-process only, not shared-database/WORM storage.']});
 const view=async({status=null}={})=>{
  local();await load();
  if(status!==null&&!['NEW','ACKNOWLEDGED'].includes(status))throw fail('Invalid alert status filter');
  return {version:SOURCE_MONITOR_VERSION,running:started&&!closed,
   activeJobId:active?.jobId||null,now:ts(),
   jobs:structuredClone(doc.jobs),
   alerts:structuredClone(doc.alerts.filter(a=>!status||a.status===status).slice().reverse()),
   recentRuns:structuredClone(doc.runs.slice(-50).reverse()),
   summary:{jobs:doc.jobs.length,enabledJobs:doc.jobs.filter(j=>j.enabled).length,
    pendingReview:doc.alerts.filter(a=>a.status==='NEW').length,
    recentFailureCount:doc.runs.slice(-50).filter(x=>x.status==='FAILED').length},
   deliveryScope:'DURABLE_LOCAL_REVIEW_INBOX_ONLY',
   realTimePushDelivered:false,originalPublicationLatency:null};
 };
 const resetTimer=()=>{
  if(timer){clearTimeoutImpl(timer);timer=null;}
  if(!started||closed||!enabled||!rightsAcknowledged||active)return;
  const due=doc?.jobs.filter(j=>j.enabled).map(j=>Date.parse(j.nextRunAt))||[];
  if(!due.length)return;
  const delay=Math.min(60000,Math.max(20,Math.min(...due)-clock()));
  timer=setTimeoutImpl(()=>{timer=null;void tick().catch(()=>{});},delay);
  timer?.unref?.();
 };
 const findJob=id=>{const j=doc.jobs.find(x=>x.id===id);
  if(!j)throw fail('Source monitor job does not exist',404);return j;};
 const configure=({kind,target,provider,intervalMinutes,enabled:want=true}={})=>withSerial(async()=>{
  allowed();
  if(closed)throw fail('Source monitor is closed',409);
  const spec=kindOf(kind,target,provider,intervalMinutes);
  if(typeof want!=='boolean')throw fail('Source monitor enabled value must be boolean');
  permission(spec);
  const key=keyOf(spec);
  let job=doc.jobs.find(j=>keyOf(j)===key);
  if(!job&&doc.jobs.length>=SOURCE_MONITOR_LIMITS.jobs)throw fail('Maximum source schedules reached',409);
  const at=ts(),future=timeOf(clock()+intervalMinutes*minute);
  job=job?{...job,intervalMinutes,enabled:want,updatedAt:at,
    nextRunAt:want?future:job.nextRunAt}:
   {id:'source-job-'+randomUUID(),...spec,enabled:want,createdAt:at,updatedAt:at,
    nextRunAt:future,failures:0,status:'IDLE',lastResult:null};
  await persist({...doc,jobs:doc.jobs.some(j=>j.id===job.id)?
   doc.jobs.map(j=>j.id===job.id?job:j):[...doc.jobs,job]});
  resetTimer();return structuredClone(job);
 });
 const toggle=(id,want)=>withSerial(async()=>{
  allowed();if(typeof want!=='boolean')throw fail('Job toggle must be boolean');
  const j=findJob(id);if(want)permission(j);
  const newJob={...j,enabled:want,updatedAt:ts(),
   nextRunAt:want?timeOf(clock()+j.intervalMinutes*minute):j.nextRunAt};
  await persist({...doc,jobs:doc.jobs.map(x=>x.id===id?newJob:x)});
  resetTimer();return structuredClone(newJob);
 });
 const acknowledge=id=>withSerial(async()=>{
  local();
  const alert=doc.alerts.find(a=>a.id===id);
  if(!alert)throw fail('Source inbox alert not found',404);
  if(alert.status==='ACKNOWLEDGED')return structuredClone(alert);
  const updated={...alert,status:'ACKNOWLEDGED',acknowledgedAt:ts()};
  await persist({...doc,alerts:doc.alerts.map(a=>a.id===id?updated:a)});
  return structuredClone(updated);
 });
 function candidates(job,result,record,run){
  const at=ts(),base={jobId:job.id,kind:job.kind,target:job.target,
   source:job.provider,firstObservedAt:record.capturedAt,
   inboxAt:at,sourceScheduledAt:run.scheduledAt,
   localInboxLatencyMs:Math.max(0,Date.parse(at)-Date.parse(record.capturedAt)),
   scheduledStartLagMs:Math.max(0,Date.parse(run.startedAt)-Date.parse(run.scheduledAt)),
   deliveryStatus:'LOCAL_INBOX_ONLY',originalPublisherPublicationVerified:false,
   sourceMaterialityVerified:false,verifiedMarketImpact:false};
  const make=(key,type,priority,title,details)=>({...base,eventKey:sha({job:keyOf(job),key}),
   id:'source-alert-'+randomUUID(),type,priority,title:bounded(title,200),details:bounded(details,230),
   status:'NEW',acknowledgedAt:null});
  if(job.kind==='NOAA_NUMERIC'){
   const baseTitle=job.target+' official NOAA index source captured';
   const revised=(record.changedSincePrevious||[]).length;
   const newPeriods=(record.addedPeriods||[]).length;
   const alerts=[];
   if(revised)alerts.push(make('revision-'+record.bodySha256,'SOURCE_REVISION','REVIEW',
    baseTitle+' · '+revised+' changed periods',
    'Compare values in the NOAA source journal; previous readings were revised after an earlier local capture.'));
   if(!revised){
    alerts.push(make('version-'+record.bodySha256,newPeriods?'SOURCE_BASELINE':'SOURCE_REVISION',
     'INFORMATIONAL',baseTitle,
     'New locally observed NOAA response. A reported measurement month is not an original publication clock.'));
   }
   const latest=record.series?.at(-1);
   if(job.target==='RONI'&&latest&&Math.abs(latest.value)>=0.5)
    alerts.push(make('threshold-'+record.bodySha256,'CLIMATE_THRESHOLD_REVIEW','REVIEW',
     'RONI source-reported absolute anomaly reaches 0.5°C threshold',
     'A threshold is a climate research lead, not a verified ENSO episode or California/Peru outcome.'));
   return alerts;
  }
  const media=job.kind==='CORPORATE_PRECURSOR';
  const observations=media?record.items:record.observations;
  if(!Array.isArray(observations))throw fail('Underlying source observation payload invalid',502);
  return observations.slice(0,40).map(o=>make(
   (o.id||o.articleId)+'|'+(o.attention||o.contentStatus||''),
   media?'CORPORATE_REPORT_REVIEW':'MECHANISM_TOPIC_REVIEW',
   media?alertPriority(o.attention):'INFORMATIONAL',
   media?(o.headline||'Reported corporate research mention'):(o.title||'Mechanism source report'),
   media?'Published report / official keyword candidate. Allegation truth and government action NOT verified.':
    'Mechanism headline/archived discussion is a research lead, not a verified causal event.'
  ));
 }
 async function runUnsafe(job,{manual=false,scheduledAt=null}={}){
  allowed();if(closed)throw fail('Source monitor is closed',409);
  if(active)throw fail('Another source capture is already running',409);
  const actual=ts(),due=scheduledAt||actual;
  const attempt={id:'source-run-'+randomUUID(),jobId:job.id,
   kind:job.kind,target:job.target,provider:job.provider,
   status:'RUNNING',scheduledAt:due,startedAt:actual,finishedAt:null,
   error:null,alertCount:0,deduplicated:null,sourceHash:null,
   manual};
  active={jobId:job.id,runId:attempt.id};
  try{
   await persist({...doc,runs:[...doc.runs,attempt],
    jobs:doc.jobs.map(x=>x.id===job.id?{...x,status:'RUNNING',updatedAt:actual}:x)});
   permission(job);
   let result;
   if(job.kind==='NOAA_NUMERIC')result=await climateNumeric.capture({metricId:job.target});
   else if(job.kind==='CORPORATE_PRECURSOR')result=await corporatePrecursor.capture({
    symbol:job.target,source:job.provider});
   else result=await mechanismRadar.capture({themeId:job.target,provider:job.provider});
   const record=result?.record||result?.snapshot;
   if(!record||!iso(record.capturedAt)||typeof record.bodySha256!=='string'||
    !/^[a-f0-9]{64}$/.test(record.bodySha256))
    throw fail('Collector returned no trustworthy local capture metadata',502);
   const available=candidates(job,result,record,attempt);
   const known=new Set(doc.alerts.map(a=>a.eventKey));
   const fresh=available.filter(a=>!known.has(a.eventKey));
   // First source observation can be discovered when a schedule is installed
   // on an existing capture; it is still marked with ORIGINAL source capture time.
   const after=ts(),success={...attempt,status:'SUCCEEDED',finishedAt:after,
    alertCount:fresh.length,deduplicated:Boolean(result.deduplicated),
    sourceHash:record.bodySha256};
   const next={...job,status:'SUCCEEDED',failures:0,updatedAt:after,
    nextRunAt:timeOf(clock()+job.intervalMinutes*minute),
    lastResult:{status:'SUCCEEDED',runId:success.id,finishedAt:after,
     sourceHash:record.bodySha256,newReviewItems:fresh.length,
     sourceCapturedAt:record.capturedAt,providerRequestDurationMs:
      Math.max(0,Date.parse(after)-Date.parse(actual)),
     scheduledStartLagMs:Math.max(0,Date.parse(actual)-Date.parse(due))}};
   await persist({...doc,runs:doc.runs.map(r=>r.id===success.id?success:r),
    jobs:doc.jobs.map(j=>j.id===job.id?next:j),alerts:[...doc.alerts,...fresh]});
   return structuredClone(success);
  }catch(e){
   const finished=ts(),f= Math.min(20,job.failures+1);
   const retryMinutes=Math.min(job.intervalMinutes,
    Math.max(TYPES[job.kind].min,Math.min(240,60*2**Math.min(5,f-1))));
   const failed={...attempt,status:'FAILED',finishedAt:finished,
    error:errSummary(e)};
   try{await persist({...doc,runs:doc.runs.map(r=>r.id===attempt.id?failed:r),
    jobs:doc.jobs.map(j=>j.id===job.id?{...j,status:'FAILED',failures:f,
     nextRunAt:timeOf(clock()+retryMinutes*minute),updatedAt:finished,
     lastResult:{status:'FAILED',runId:attempt.id,finishedAt:finished,
      summary:'Source attempt failed; review provider access or licensing.'}}:j)});
   }catch{throw fail('Source attempt failed and could not persist its failure state',503);}
   return structuredClone(failed);
  }finally{active=null;resetTimer();}
 }
 const runNow=id=>withSerial(async()=>{
  allowed();const j=findJob(id);
  if(!j.enabled)throw fail('Source schedule disabled',409);
  return runUnsafe(j,{manual:true});
 });
 const tick=()=>withSerial(async()=>{
  allowed();if(closed)return {status:'CLOSED'};
  if(active)return {status:'BUSY'};
  const due=doc.jobs.filter(j=>j.enabled&&Date.parse(j.nextRunAt)<=clock())
   .sort((a,b)=>a.nextRunAt.localeCompare(b.nextRunAt)||a.id.localeCompare(b.id));
  if(!due.length){resetTimer();return {status:'NO_DUE_JOBS'};}
  return runUnsafe(due[0],{manual:false,scheduledAt:due[0].nextRunAt});
 });
 async function start(){
  if(started)return {started:true};
  if(closed)return {started:false,reason:'CLOSED'};
  if(!enabled||!rightsAcknowledged)return {started:false,reason:'NOT_OPTED_IN'};
  await withSerial(async()=>{await load();started=true;resetTimer();});
  return {started:true};
 }
 async function close(){
  if(timer){clearTimeoutImpl(timer);timer=null;}
  started=false;closed=true;
  await serial;
 }
 return {catalog,start,close,view,configure,toggle,acknowledge,runNow,tick};
}
const respond=(res,status,value)=>{res.writeHead(status,{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export function createSourceMonitorApi({monitor,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/source-monitor/'))return false;
  const op=url.pathname.slice('/api/source-monitor/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)respond(res,200,monitor.catalog());
    else if(op==='status'&&
      [...url.searchParams.keys()].every(k=>k==='alertStatus'&&url.searchParams.getAll(k).length===1))
     respond(res,200,await monitor.view({status:url.searchParams.get('alertStatus')||null}));
    else throw fail('Unknown source monitoring read endpoint',404);
   }else if(req.method==='POST'&&['schedule','toggle','run','acknowledge'].includes(op)&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-source-monitor']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw fail('Explicit same-origin loopback source scheduling required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw fail('Source monitor JSON required',415);
    let raw='',bytes=0;for await(const b of req){
     bytes+=b.byteLength;if(bytes>750)throw fail('Source monitoring request too large',413);raw+=b;
    }
    let data;try{data=JSON.parse(raw);}catch{throw fail('Source monitoring JSON malformed');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw fail('Invalid source monitoring request');
    const keys=op==='schedule'?['kind','target','provider','intervalMinutes','enabled']:
     op==='toggle'?['jobId','enabled']:op==='run'?['jobId']:['alertId'];
    if(Object.keys(data).some(k=>!keys.includes(k)))throw fail('Unsupported source monitor configuration');
    if(op==='schedule')respond(res,200,await monitor.configure(data));
    if(op==='toggle')respond(res,200,await monitor.toggle(data.jobId,data.enabled));
    if(op==='run')respond(res,200,await monitor.runNow(data.jobId));
    if(op==='acknowledge')respond(res,200,await monitor.acknowledge(data.alertId));
   }else throw fail('Unsupported source monitoring operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   respond(res,status,{error:e?.status?e.message:'Source monitoring unavailable'});
  }
  return true;
 };
}
