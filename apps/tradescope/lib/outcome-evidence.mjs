/**
 * v0.36: bounded official-document capture plus reproducible prospective research dataset.
 * A source's HTTP response is observed evidence, not verification of a labeled outcome.
 * Never follows redirects, probes arbitrary hosts, or accepts private-network evidence links.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const error=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=data=>createHash('sha256').update(data).digest('hex');
const digest=v=>sha(JSON.stringify(v));
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const validTime=v=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v));
const RID=/^desk-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const VID=/^validation-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SID=/^snapshot-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const SOURCE_ARCHIVE_VERSION='OFFICIAL-HTTP-SNAPSHOT-0.36.1';
export const PROSPECTIVE_DATASET_VERSION='PROSPECTIVE-RESEARCH-DATASET-0.36.1';
export const OFFICIAL_SNAPSHOT_HOSTS=Object.freeze([
 'www.sec.gov','data.sec.gov','earthquake.usgs.gov','eonet.gsfc.nasa.gov',
 'nasstatus.faa.gov','www.faa.gov','www.weather.gov','www.epa.gov'
]);
export function approvedSourceUrl(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
    u.href.length>650||!OFFICIAL_SNAPSHOT_HOSTS.includes(u.hostname.toLowerCase())||
    !u.pathname.startsWith('/')||u.pathname.includes('\\'))return null;
  return u.href;
 }catch{return null;}
}
const note='Captured HTTP content is NOT independent verification of a reviewer label, publication date, causal link, or economic impact.';
const sane=value=>String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,480);
export async function fetchOfficialSnapshot(url,{fetchImpl=globalThis.fetch,timeoutMs=8000,
 maxBodyBytes=120000,userAgent='ResearchOS-LocalResearch/0.36 contact via repository'}={}){
 const approved=approvedSourceUrl(url);
 if(!approved)throw error('Snapshot retrieval is restricted to approved official HTTPS hosts',403);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(approved,{method:'GET',redirect:'error',signal:controller.signal,
   headers:{Accept:'text/html,application/json,text/plain,application/xml,text/xml',
    'User-Agent':userAgent},cache:'no-store'});
  if(!response?.ok)throw error('Official source did not return a successful response',503);
  const media=(response.headers?.get?.('content-type')||'').toLowerCase().split(';')[0].trim();
  if(!['text/html','application/json','text/plain','application/xml','text/xml','application/xhtml+xml'].includes(media))
   throw error('Official source content type is unsupported for bounded text snapshots',415);
  const advertised=Number(response.headers?.get?.('content-length')||0);
  if(advertised>maxBodyBytes)throw error('Official source exceeds the maximum archive length',413);
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')
   throw error('Official source did not supply a bounded readable stream',503);
  const pieces=[];let count=0;
  for await(const piece of response.body){
   if(!(piece instanceof Uint8Array))throw error('Unexpected official response stream data',503);
   count+=piece.byteLength;
   if(count>maxBodyBytes){controller.abort();throw error('Official source exceeded streamed size limit',413);}
   pieces.push(Buffer.from(piece));
  }
  const bytes=Buffer.concat(pieces);
  const encoding=bytes.toString('utf8');
  const lastModified=response.headers?.get?.('last-modified');
  return {sourceUrl:approved,mediaType:media,bodySha256:sha(bytes),responseBytes:bytes.byteLength,
   excerpt:sane(encoding),httpStatus:response.status||200,
   sourceLastModified:lastModified&&!Number.isNaN(Date.parse(lastModified))?
    new Date(lastModified).toISOString():null,
   etagSha256:response.headers?.get?.('etag')?sha(response.headers.get('etag')):null,
   documentMeaningVerified:false,originalPublishedAtVerified:false};
 }catch(e){
  if(e.status)throw e;
  throw error('Official source was unavailable or failed transport validation',503);
 }finally{clearTimeout(timer);}
}
function validEntry(e,i,previous){
 const {hash,...base}=e||{};
 if(!e||!SID.test(e.id)||e.seq!==i||e.previousHash!==previous||!validTime(e.capturedAt)||
   !RID.test(e.runId)||!VID.test(e.registrationId)||!approvedSourceUrl(e.sourceUrl)||
   !/^[a-f0-9]{64}$/.test(e.bodySha256)||e.documentMeaningVerified!==false||
   e.originalPublishedAtVerified!==false||hash!==digest(base))
  throw error('Official source evidence journal integrity invalid',500);
 return hash;
}
function datasetWithSnapshots(records,entries,asOf){
 const rows=records.map(row=>{
  const snapshots=entries.filter(e=>e.runId===row.runId&&
   e.registrationId===row.registrationId&&Date.parse(e.capturedAt)<=Date.parse(asOf))
   .map(e=>({snapshotId:e.id,sourceHost:new URL(e.sourceUrl).hostname,
    sourceUrl:e.sourceUrl,bodySha256:e.bodySha256,capturedAt:e.capturedAt,
    sourceLastModified:e.sourceLastModified,documentMeaningVerified:false}));
  return {...row,sourceSnapshots:snapshots};
 });
 const core={schemaVersion:1,version:PROSPECTIVE_DATASET_VERSION,
  asOf,rows,metrics:{precision:null,recall:null,verifiedFalsePositiveRate:null,
   predictiveAccuracy:null,groundTruthCases:0},
  caveats:['Manual cohort selection is NOT an autonomous prediction.',
   'Reviewer aliases and public source HTTP snapshots are not independently verified outcome labels.',
   'No true-negative sampling frame or calibrated denominator exists.',
   'Export is a reproducible descriptive dataset, NOT certified model performance.']};
 return {...core,manifestSha256:digest(core)};
}
export function prospectiveDatasetCsv(dataset){
 const fields=['runId','eventId','runKnowledgeAsOf','registeredAt','horizonEndsAt',
  'operatorDeclaredCohort','reviewStatus','reviewCount','agreedHumanAttestation',
  'groundTruthVerified','sourceSnapshotCount','sourceDigestList','registrationId'];
 const q=v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+\-@\t\r]/,'\u200b$&')+'"';
 const lines=[fields.join(',')];
 for(const r of dataset.rows)lines.push(fields.map(key=>{
  const val=key==='sourceSnapshotCount'?r.sourceSnapshots.length:
   key==='sourceDigestList'?r.sourceSnapshots.map(x=>x.bodySha256).join(';'):r[key];
  return q(val);
 }).join(','));
 return '# ResearchOS '+dataset.version+'; asOf='+dataset.asOf+'; manifestSha256='+dataset.manifestSha256+'\n'+lines.join('\n')+'\n';
}
export function createOutcomeEvidenceArchive({validation,filename,enabled=true,fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString(),maxSnapshots=80,maxBytes=4000000,userAgent=process.env.SEC_USER_AGENT}={}){
 if(!validation?.evidenceLinks||!validation?.datasetRows||!path.isAbsolute(filename||'')||
   !Number.isInteger(maxSnapshots)||maxSnapshots<1||maxSnapshots>1000||
   !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('Official evidence archive requires research validation and a private absolute path');
 let doc=null,loading=null,queue=Promise.resolve();
 const stamp=()=>{
  const t=now();if(!validTime(t))throw error('Local archive capture clock invalid',503);
  return t;
 };
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>maxBytes)throw error('Official evidence journal exceeds size limit',500);
    const loaded=JSON.parse(await fs.readFile(filename,'utf8'));
    if(loaded.schemaVersion!==1||!Array.isArray(loaded.snapshots)||loaded.snapshots.length>maxSnapshots)
     throw error('Official evidence archive schema invalid',500);
    let prev='GENESIS';
    for(const [i,e] of loaded.snapshots.entries()){
     prev=validEntry(e,i,prev);
     if(i>0&&Date.parse(e.capturedAt)<Date.parse(loaded.snapshots[i-1].capturedAt))
      throw error('Official archive clock order invalid',500);
    }
    return doc=loaded;
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,snapshots:[]};
    throw error('Official evidence journal failed integrity validation',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{
  const result=queue.then(async()=>{await load();return fn();});
  queue=result.catch(()=>{});return result;
 };
 async function persist(snapshots){
  const serialized=JSON.stringify({schemaVersion:1,snapshots},null,2)+'\n';
  if(Buffer.byteLength(serialized)>maxBytes)throw error('Official source archive capacity reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const tmp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,serialized,{flag:'wx',mode:0o600});await fs.rename(tmp,filename);}
  catch{throw error('Could not persist official source snapshot',503);}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  doc={schemaVersion:1,snapshots};
 }
 const status=()=>({enabled,version:SOURCE_ARCHIVE_VERSION,supportedHosts:[...OFFICIAL_SNAPSHOT_HOSTS],
  maxSnapshots,sourceResponseLimitBytes:120000,
  note,reviewerIdentityVerified:false,autonomousOutcomeVerification:false});
 async function capture({runId,registrationId,sourceUrl}={}){
  if(!enabled)throw error('Private official source capture disabled',403);
  if(!RID.test(runId||'')||!VID.test(registrationId||'')||!approvedSourceUrl(sourceUrl))
   throw error('Select a preregistered run and an approved official outcome-evidence URL');
  return serial(async()=>{
   if(doc.snapshots.length>=maxSnapshots)throw error('Local official source archive is full',409);
   const evidence=await validation.evidenceLinks(runId);
   if(evidence.registrationId!==registrationId||!evidence.links.some(e=>e.url===sourceUrl))
    throw error('Source URL must match a previously submitted outcome review for this registration',403);
   if(Date.parse(stamp())<Date.parse(evidence.windowEndsAt))
    throw error('Outcome horizon is not yet complete',409);
   const result=await fetchOfficialSnapshot(sourceUrl,{fetchImpl,
    userAgent:userAgent||'ResearchOS-LocalResearch/0.36 contact via project repository'});
   // Capture only after full authorized HTTP response; never backdate to claimed publication.
   const capturedAt=stamp();
   const duplicate=doc.snapshots.find(e=>e.runId===runId&&
    e.registrationId===registrationId&&e.sourceUrl===sourceUrl&&e.bodySha256===result.bodySha256);
   if(duplicate)return {snapshotId:duplicate.id,deduplicated:true,sourceUrl:duplicate.sourceUrl,
    capturedAt:duplicate.capturedAt,bodySha256:duplicate.bodySha256,documentMeaningVerified:false,note};
   const base={id:'snapshot-'+randomUUID(),seq:doc.snapshots.length,
    previousHash:doc.snapshots.at(-1)?.hash||'GENESIS',capturedAt,runId,registrationId,
    ...result};
   const entry={...base,hash:digest(base)};
   await persist([...doc.snapshots,entry]);
   return {snapshotId:entry.id,deduplicated:false,sourceUrl:entry.sourceUrl,
    capturedAt:entry.capturedAt,bodySha256:entry.bodySha256,
    documentMeaningVerified:false,note};
  });
 }
 async function snapshots({runId}={}){
  if(!enabled)throw error('Private outcome evidence access is disabled on nonloopback host',403);
  if(runId!==undefined&&!RID.test(runId))throw error('Invalid research run ID');
  await queue;await load();
  return {snapshots:doc.snapshots.filter(e=>!runId||e.runId===runId).map(e=>({
   id:e.id,runId:e.runId,registrationId:e.registrationId,
   sourceUrl:e.sourceUrl,capturedAt:e.capturedAt,sourceLastModified:e.sourceLastModified,
   mediaType:e.mediaType,bodySha256:e.bodySha256,responseBytes:e.responseBytes,
   excerpt:e.excerpt,documentMeaningVerified:false,originalPublishedAtVerified:false
  })),note};
 }
 async function dataset({asOf=null}={}){
  if(!enabled)throw error('Private research dataset access is disabled on nonloopback host',403);
  const cutoff=asOf||stamp();
  if(!validTime(cutoff)||Date.parse(cutoff)>Date.parse(stamp()))
   throw error('Dataset as-of must be a nonfuture UTC instant');
  const base=await validation.datasetRows({asOf:cutoff});
  await queue;await load();
  return datasetWithSnapshots(base.rows,doc.snapshots,cutoff);
 }
 async function close(){await queue;}
 return {status,capture,snapshots,dataset,close};
}
const send=(res,status,body,type='application/json; charset=utf-8')=>{
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});res.end(typeof body==='string'?body:JSON.stringify(body));
};
export function createOutcomeEvidenceApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/outcome-evidence/'))return false;
  try{
   const op=url.pathname.slice('/api/outcome-evidence/'.length);
   const params=url.searchParams;
   if(req.method==='GET'){
    if(op==='catalog'&&!params.size)send(res,200,service.status());
    else if(op==='snapshots'&&[...params.keys()].every(k=>k==='runId')&&params.getAll('runId').length<=1)
     send(res,200,await service.snapshots({runId:params.get('runId')||undefined}));
    else if(op==='dataset'){
     if([...params.keys()].some(k=>!['asOf','format'].includes(k)||params.getAll(k).length!==1))
      throw error('Unsupported dataset query');
     const format=params.get('format')||'json';
     if(!['csv','json'].includes(format))throw error('Dataset format must be json or csv');
     const result=await service.dataset({asOf:params.get('asOf')||null});
     if(format==='csv')send(res,200,prospectiveDatasetCsv(result),'text/csv; charset=utf-8');
     else send(res,200,result);
    }else throw error('Unknown outcome evidence operation',404);
   }else if(req.method==='POST'&&op==='capture'&&!params.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-outcome-capture']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw error('Explicit local same-origin snapshot request required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw error('JSON required for official source capture',415);
    let size=0,raw='';
    for await(const part of req){size+=part.length;if(size>1500)throw error('Capture request too large',413);raw+=part;}
    let args;try{args=JSON.parse(raw);}catch{throw error('Invalid capture request');}
    if(!args||Array.isArray(args)||typeof args!=='object'||
     Object.keys(args).some(k=>!['runId','registrationId','sourceUrl'].includes(k)))
     throw error('Unexpected source capture parameters');
    send(res,200,await service.capture(args));
   }else throw error('Unsupported outcome evidence request',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,503].includes(e.status)?e.status:503;
   send(res,status,{error:e.status?e.message:'Official evidence archive unavailable'});
  }
  return true;
 };
}
