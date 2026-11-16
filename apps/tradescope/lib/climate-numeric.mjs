/**
 * v0.46 NOAA CPC numerical precursor observations.
 * Captured current files may contain historical readings. Source measurement months
 * are never substituted for original public release time or local first-seen time.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const error=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const utc=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&Number.isFinite(Date.parse(s));
const monthValid=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const r2=n=>Math.round(n*100)/100;
export const CLIMATE_NUMERIC_VERSION='CLIMATE-NUMERIC-P0-0.46.1';
export const NUMERIC_DATASETS=Object.freeze([
 {id:'RONI',label:'Relative Oceanic Niño Index (RONI)',kind:'SEASONAL',unit:'°C',
  sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt',
  signal:'OCEAN_RELATIVE_3_MONTH',description:'Relative Niño 3.4 averaged over three overlapping months; warm threshold +0.5 is one ENSO indicator, not a forecast'},
 {id:'RELATIVE_NINO34',label:'Monthly relative Niño 3.4 SST anomaly',kind:'MONTHLY',unit:'°C',
  sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt',
  signal:'OCEAN_RELATIVE_1_MONTH',description:'Monthly relative SST anomaly; different smoothing from seasonal RONI'},
 {id:'SOI',label:'Southern Oscillation Index anomaly',kind:'SECTIONED',unit:'index',
  sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/soi',
  signal:'ATMOSPHERIC_PRESSURE',description:'Negative SOI anomalies can accompany El Niño; separate from sea-surface temperature'},
 {id:'TRADE_WIND_CPAC',label:'Central Pacific 850 mb trade-wind anomaly',kind:'SECTIONED',unit:'index',
  sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/cpac850',
  signal:'ATMOSPHERIC_WIND',description:'Negative anomalous easterly trade wind index can support weakening trade winds in central Pacific'},
 {id:'TRADE_WIND_WPAC',label:'Western Pacific 850 mb trade-wind anomaly',kind:'SECTIONED',unit:'index',
  sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/wpac850',
  signal:'ATMOSPHERIC_WIND',description:'Western Pacific wind index; independent region, not automatically identical to central Pacific'}
]);
const datasets=new Map(NUMERIC_DATASETS.map(d=>[d.id,d]));
const seasonMonths=new Map(['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ'].map((s,i)=>[s,String(i+1).padStart(2,'0')]));
const invalidValue=v=>!Number.isFinite(v)||Math.abs(v)>=90||v===-999.9||v===999.9;
function checkedSeries(records,id){
 if(!Array.isArray(records)||!records.length||records.length>1600)throw error('NOAA dataset has no usable monthly observations',502);
 const seen=new Set();
 for(const r of records){
  if(!monthValid(r.period)||seen.has(r.period)||!Number.isFinite(r.value)||Math.abs(r.value)>40)
   throw error('NOAA index contains duplicate or invalid monthly observation',502);
  seen.add(r.period);
 }
 records.sort((a,b)=>a.period.localeCompare(b.period));
 if(records.some((x,i)=>i&&x.period<=records[i-1].period))throw error('NOAA index period order invalid',502);
 return {metricId:id,observations:records};
}
export function parseCpcNumerical(text,id,{maxRows=1600}={}){
 const descriptor=datasets.get(id);
 if(!descriptor||typeof text!=='string'||text.length>350000)
  throw error('Unsupported or oversized NOAA index file',502);
 if(!Number.isInteger(maxRows)||maxRows<12||maxRows>1600)throw TypeError('Invalid numerical source row bound');
 let rows=[];
 if(descriptor.kind==='SEASONAL'){
  const lines=text.split(/\r?\n/);
  if(!lines.some(x=>/^\s*SEAS\s+YR\s+ANOM\s*$/i.test(x)))throw error('NOAA RONI file header invalid',502);
  for(const line of lines){
   const t=line.trim();if(!t||/^SEAS\s+YR\s+ANOM$/i.test(t))continue;
   const m=t.match(/^([A-Z]{3})\s+(\d{4})\s+([-+]?\d+(?:\.\d+)?)$/);
   if(!m||!seasonMonths.has(m[1]))throw error('NOAA RONI season row malformed',502);
   const value=Number(m[3]);
   if(invalidValue(value))continue;
   rows.push({period:m[2]+'-'+seasonMonths.get(m[1]),value:r2(value),
    sourcePeriod:m[1]+' '+m[2],provisional:true});
  }
 }else if(descriptor.kind==='MONTHLY'){
  const lines=text.split(/\r?\n/);
  if(!lines.some(x=>/^\s*YR\s+MTH\s+ANOM\s*$/i.test(x)))throw error('NOAA SST anomaly file header invalid',502);
  for(const line of lines){
   const t=line.trim();if(!t||/^YR\s+MTH\s+ANOM$/i.test(t))continue;
   const m=t.match(/^(\d{4})\s+(\d{1,2})\s+([-+]?\d+(?:\.\d+)?)$/);
   if(!m||Number(m[2])<1||Number(m[2])>12)throw error('NOAA monthly SST row malformed',502);
   const value=Number(m[3]);if(invalidValue(value))continue;
   rows.push({period:m[1]+'-'+m[2].padStart(2,'0'),value:r2(value),
    sourcePeriod:m[1]+'-'+m[2].padStart(2,'0'),provisional:true});
  }
 }else{
  // CPC 850-mb wind/SOI text has ORIGINAL, ANOMALY and STANDARDIZED sections.
  // Only ANOMALY may be used, never raw means or normalized values.
  const lines=text.split(/\r?\n/);
  let inAnomaly=false,foundAnomaly=false,yearCount=0;
  for(const line of lines){
   const t=line.trim();
   if(/^\s*ANOMALY\s*$/i.test(line)){
    if(foundAnomaly)throw error('NOAA index has duplicate anomaly sections',502);
    foundAnomaly=true;inAnomaly=true;continue;
   }
   if(inAnomaly&&/\bSTANDARDIZED\b/i.test(t))break;
   if(!inAnomaly||!t||/^YEAR\s+JAN\s+FEB\s+MAR/i.test(t))continue;
   const m=t.match(/^(\d{4})(.*)$/);
   if(!m)continue; // Section title repeated; reject missing anomaly block below.
   const year=Number(m[1]);
   if(year<1850||year>2100)throw error('NOAA anomaly year invalid',502);
   const values=[...m[2].matchAll(/[-+]?\d+(?:\.\d+)?/g)].map(x=>Number(x[0]));
   if(values.length!==12)throw error('NOAA anomaly year does not contain 12 monthly values',502);
   yearCount++;
   values.forEach((v,i)=>{if(!invalidValue(v))rows.push({
    period:m[1]+'-'+String(i+1).padStart(2,'0'),value:r2(v),
    sourcePeriod:m[1]+'-'+String(i+1).padStart(2,'0'),provisional:true});});
  }
  if(!foundAnomaly||yearCount<2)throw error('NOAA anomaly section unavailable',502);
 }
 if(rows.length>maxRows)throw error('NOAA numerical observation limit exceeded',413);
 return checkedSeries(rows,id);
}
export function numericalTrend(observations){
 const x=observations.slice().sort((a,b)=>a.period.localeCompare(b.period));
 if(!x.length)return {state:'NO_SOURCE_OBSERVATION',latest:null,delta3:null,threeMonthMean:null};
 const latest=x.at(-1);
 const prior=x.find(o=>o.period===new Date(Date.UTC(Number(latest.period.slice(0,4)),
  Number(latest.period.slice(5,7))-1-3,1)).toISOString().slice(0,7));
 const recent=x.slice(-3);
 const consecutive=recent.length===3&&recent.every((o,i)=>{
  if(i===0)return true;
  const d=new Date(Date.UTC(Number(recent[i-1].period.slice(0,4)),
   Number(recent[i-1].period.slice(5,7)),1)).toISOString().slice(0,7);
  return o.period===d;
 });
 return {state:'SOURCE_REPORTED_NUMERIC_TREND',latest,
  delta3:prior?r2(latest.value-prior.value):null,
  threeMonthMean:consecutive?r2(recent.reduce((s,a)=>s+a.value,0)/3):null,
  lastThreeConsecutive:consecutive,
  originalReleaseTimeVerified:false,statisticallyCalibrated:false};
}
const withinMonths=(a,b)=>{
 if(!a||!b)return false;
 return Math.abs((Number(a.slice(0,4))-Number(b.slice(0,4)))*12+
  Number(a.slice(5,7))-Number(b.slice(5,7)))<=2;
};
export function assessEnsoNumerics(metrics){
 const entries=Object.fromEntries(metrics.map(x=>[x.metricId,x]));
 const r=entries.RONI?.trend?.latest,monthly=entries.RELATIVE_NINO34?.trend?.latest;
 const atmosphere=['SOI','TRADE_WIND_CPAC','TRADE_WIND_WPAC'].map(id=>entries[id]).filter(Boolean);
 const warmOcean=r?.value>=0.5;
 const coolOcean=r?.value<=-0.5;
 const atmosphereAvailable=atmosphere.filter(x=>withinMonths(x.trend.latest?.period,r?.period));
 const warmSupport=atmosphereAvailable.filter(x=>x.trend.latest.value<=-1).length;
 const coolSupport=atmosphereAvailable.filter(x=>x.trend.latest.value>=1).length;
 const observed=metrics.map(x=>x.metricId);
 const status=warmOcean&&warmSupport>=2?'MULTI_INDEX_WARM_CONTEXT':
  coolOcean&&coolSupport>=2?'MULTI_INDEX_COOL_CONTEXT':
  warmOcean||coolOcean?'OCEAN_THRESHOLD_WITHOUT_TWO_ATMOSPHERIC_INDICATORS':
  r?'NO_SEASONAL_RONI_THRESHOLD':'INSUFFICIENT_RONI_DATA';
 return {status,observedIndices:observed,roni:r?.value??null,
  roniSeason:r?.sourcePeriod||null,relativeNino34:monthly?.value??null,
  atmosphericSupportCount:warmOcean?warmSupport:coolOcean?coolSupport:0,
  atmosphereCompared:atmosphereAvailable.map(x=>x.metricId),
  cutoffWindowMonths:2,
  noaaOfficialEpisodeClassificationVerified:false,
  regionalTeleconnectionVerified:false,forecastSkillKnown:false,
  falsePositiveRate:null,issuerImpactVerified:false,
  interpretation:'Numerical cross-index context only. No independent diagnosis of ENSO phase, calibrated lead time, storm likelihood, fishery collapse, crop loss or asset damage.'};
}
async function fetchOfficial(url,fetchImpl){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const res=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
    signal:ctrl.signal,headers:{Accept:'text/plain'}});
  if(!res?.ok)throw error('Official NOAA numerical index source unavailable',503);
  const mime=(res.headers?.get?.('content-type')||'').toLowerCase();
  if(mime&&!/(?:text\/plain|application\/octet-stream)/.test(mime))
   throw error('Unexpected NOAA index content type',502);
  if(Number(res.headers?.get?.('content-length')||0)>350000)
   throw error('Official NOAA response exceeds size bound',413);
  if(!res.body||typeof res.body[Symbol.asyncIterator]!=='function')
   throw error('Official NOAA source did not return a stream',503);
  let n=0;const pieces=[];
  for await(const part of res.body){
   if(!(part instanceof Uint8Array))throw error('NOAA response byte stream invalid',503);
   n+=part.byteLength;
   if(n>350000){ctrl.abort();throw error('Streamed NOAA index exceeds size bound',413);}
   pieces.push(Buffer.from(part));
  }
  const body=Buffer.concat(pieces);
  return {bodySha256:hash(body),responseBytes:body.length,text:body.toString('utf8')};
 }catch(e){if(e?.status)throw e;throw error('NOAA source transport failure',503);}
 finally{clearTimeout(timer);}
}
function validateJournal(doc,max){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.entries)||doc.entries.length>max)
  throw error('Numerical climate journal schema invalid',500);
 let previous='GENESIS',stamp=null;
 for(const [i,e] of doc.entries.entries()){
  if(!e||e.seq!==i||e.previousHash!==previous||!utc(e.capturedAt)||
   (stamp&&e.capturedAt<stamp)||!datasets.has(e.metricId)||
   !/^numeric-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(e.id||'')||
   !Array.isArray(e.series)||e.series.length>48||
   e.series.some(x=>!monthValid(x.period)||!Number.isFinite(x.value)))
   throw error('Numerical climate journal record invalid',500);
  const {hash:signature,...body}=e;
  if(signature!==hash(body))throw error('Numerical climate journal hash mismatch',500);
  previous=e.hash;stamp=e.capturedAt;
 }
 return doc;
}
export function createClimateNumeric({filename,fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString(),enabled=false,rightsAcknowledged=false,
 maxSnapshots=100,maxBytes=6000000}={}){
 if(!path.isAbsolute(filename||'')||!Number.isInteger(maxSnapshots)||
  maxSnapshots<1||maxSnapshots>400||!Number.isInteger(maxBytes)||maxBytes<100000)
  throw TypeError('NOAA numeric research requires a private journal and strict capacity');
 let doc=null,pending=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!utc(t))throw error('Climate numeric clock invalid',503);return t;};
 const local=()=>{if(!enabled)throw error('Numerical research disabled off local host',403);};
 async function load(){
  if(doc)return doc;
  if(!pending)pending=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>maxBytes)throw error('Numerical journal exceeds size bound',500);
    return doc=validateJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxSnapshots);
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,entries:[]};
    throw error('Numerical journal cannot be verified',500);}
  })().catch(e=>{pending=null;throw e;});
  return pending;
 }
 const serial=fn=>{const p=queue.then(async()=>{await load();return fn();});queue=p.catch(()=>{});return p;};
 async function append(value){
  if(doc.entries.length>=maxSnapshots)throw error('Climate journal capacity reached',409);
  const capturedAt=clock(),last=doc.entries.at(-1);
  if(last&&capturedAt<last.capturedAt)throw error('Climate journal clock moved backwards',409);
  const base={id:'numeric-'+randomUUID(),seq:doc.entries.length,
   capturedAt,previousHash:last?.hash||'GENESIS',...value};
  const entry={...base,hash:hash(base)},next={schemaVersion:1,entries:[...doc.entries,entry]};
  const raw=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(raw)>maxBytes)throw error('Climate journal storage limit reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,raw,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw error('Numerical journal persistence failed',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  doc=next;return entry;
 }
 const catalog=()=>({version:CLIMATE_NUMERIC_VERSION,enabled,rightsAcknowledged,
  metrics:NUMERIC_DATASETS,
  sourceFamily:'NOAA_CPC_FIXED_MONTHLY_FILES',
  automaticCollection:false,officialENSOClassification:false,
  historicPublicationTimeVerified:false,
  warning:'Source data can be revised after a measured month. Only a local capture clock establishes when ResearchOS learned this value.'});
 async function capture({metricId}={}){
  local();if(!rightsAcknowledged)throw error('Source terms and retention acknowledgement required',403);
  const metric=datasets.get(metricId);if(!metric)throw error('Use a registered NOAA index');
  return serial(async()=>{
   if(doc.entries.length>=maxSnapshots)throw error('Climate journal capacity reached',409);
   const raw=await fetchOfficial(metric.sourceUrl,fetchImpl);
   const parsed=parseCpcNumerical(raw.text,metricId);
   const nowMonth=clock().slice(0,7);
   const history=parsed.observations.filter(x=>x.period<=nowMonth);
   if(!history.length)throw error('NOAA source contains no periods eligible by capture month',502);
   const series=history.slice(-48).map(x=>({...x,
    originalFirstReleaseVerified:false,
    provisional:x.period>=new Date(Date.UTC(Number(nowMonth.slice(0,4)),
     Number(nowMonth.slice(5,7))-1-2,1)).toISOString().slice(0,7)}));
   const previous=doc.entries.findLast(e=>e.metricId===metricId);
   if(previous&&previous.bodySha256===raw.bodySha256)
    return {deduplicated:true,record:previous};
   const prior=new Map((previous?.series||[]).map(x=>[x.period,x.value]));
   const revised=series.filter(x=>prior.has(x.period)&&prior.get(x.period)!==x.value)
    .map(x=>({period:x.period,before:prior.get(x.period),after:x.value}));
   const added=series.filter(x=>!prior.has(x.period)).map(x=>x.period);
   const value={metricId,sourceUrl:metric.sourceUrl,bodySha256:raw.bodySha256,
    responseBytes:raw.responseBytes,series,
    changedSincePrevious:revised.slice(0,48),addedPeriods:added,
    sourceValuesMayBeRevised:true,actualOriginalReleaseClockVerified:false,
    provenance:'SOURCE_CURRENT_FILE_CAPTURED_NOW_NOT_HISTORICALLY_FIRST_AVAILABLE'};
   return {deduplicated:false,record:await append(value)};
  });
 }
 async function view({asOf=null,metricId=null}={}){
  local();const t=asOf||clock();
  if(!utc(t)||t>clock()||(metricId!==null&&!datasets.has(metricId)))
   throw error('Invalid numerical climate cutoff or metric');
  await queue;await load();
  const visible=doc.entries.filter(x=>x.capturedAt<=t&&(!metricId||x.metricId===metricId));
  const latest=new Map();
  for(const e of visible)latest.set(e.metricId,e);
  const metrics=[...latest.values()].map(e=>{
   const info=datasets.get(e.metricId);
   return {metricId:e.metricId,label:info.label,unit:info.unit,
    signal:info.signal,sourceUrl:e.sourceUrl,capturedAt:e.capturedAt,
    bodySha256:e.bodySha256,series:e.series,trend:numericalTrend(e.series),
    revisions:e.changedSincePrevious,addedPeriods:e.addedPeriods,
    sourceValuesMayBeRevised:true,originalSourcePublicationVerified:false,
    numericValuesCausallyPredictFutureEvents:false};
  }).sort((a,b)=>a.metricId.localeCompare(b.metricId));
  return {version:CLIMATE_NUMERIC_VERSION,asOf:t,metrics,
   totalCapturedVersions:visible.length,assessment:assessEnsoNumerics(metrics),
   mechanismId:'enso-circulation',downstreamEvidenceVerified:false,
   warning:'Source months are measurement periods, not first-seen/release clocks. Oceanic and atmospheric agreement is context, not confirmed impacts on California rain, Peru fisheries, fertilizer or NVDA.'};
 }
 async function close(){await queue;}
 return {catalog,capture,view,close};
}
const send=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
export function createClimateNumericApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/climate-numeric/'))return false;
  const op=url.pathname.slice('/api/climate-numeric/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)send(res,200,service.catalog());
    else if(op==='view'){
     if([...url.searchParams.keys()].some(x=>!['asOf','metricId'].includes(x)||
       url.searchParams.getAll(x).length!==1))throw error('Unsupported climate query filter');
     send(res,200,await service.view({asOf:url.searchParams.get('asOf')||null,
      metricId:url.searchParams.get('metricId')||null}));
    }else throw error('Unknown climate numerical endpoint',404);
   }else if(req.method==='POST'&&op==='capture'&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-climate-numeric']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw error('Explicit same-origin loopback climate capture required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw error('JSON request required',415);
    let body='',n=0;for await(const part of req){
     n+=part.byteLength;if(n>350)throw error('Climate input too large',413);
     body+=part;
    }
    let args;try{args=JSON.parse(body);}catch{throw error('Invalid climate capture JSON');}
    if(!args||Array.isArray(args)||typeof args!=='object'||
     Object.keys(args).some(x=>x!=='metricId'))throw error('Only a fixed index identifier is accepted');
    send(res,200,await service.capture(args));
   }else throw error('Unsupported climate numeric method',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   send(res,status,{error:e?.status?e.message:'Climate numeric research unavailable'});
  }
  return true;
 };
}
