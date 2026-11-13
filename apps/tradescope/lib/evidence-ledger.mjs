/**
 * v0.24 local evidence provenance journal.
 * Hash-chained, versioned, source-limited and single-process append serialized.
 * NOT an independently signed timestamp, immutable WORM store, licensed redistribution system,
 * or proof that a historic source was available to traders at any given time.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SOURCES=new Set(['FRED_ALFRED_OFFICIAL_API','TRADESCOPE_DOSSIER']);
const KINDS=new Set(['FRED_SEARCH','FRED_SERIES_METADATA','FRED_VINTAGE_CALENDAR',
 'FRED_RELEASE_MAPPING','FRED_RELEASE_CALENDAR','FRED_AS_OF_OBSERVATIONS','ANALYSIS_SUMMARY']);
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,115}$/;
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&!Number.isNaN(Date.parse(x));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const fail=(m,status=400)=>Object.assign(new Error(m),{status});
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x),'utf8').digest('hex');
const clone=x=>structuredClone(x);
const MIN_HASH='0'.repeat(64);
const fixed=x=>typeof x==='string'?x.slice(0,256):null;
const officialUrl=x=>{if(!x)return null;try{
 const u=new URL(x);
 if(u.protocol!=='https:'||!['fred.stlouisfed.org','www.stlouisfed.org'].includes(u.hostname)||
  u.search||u.hash||u.username||u.password)return null;
 return u.href;
 }catch{return null;}};
function assertCapture(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||!SOURCES.has(x.source)||
  !KINDS.has(x.kind)||!idPattern.test(x.subjectId)||!Array.isArray(x.facts)||x.facts.length>500||
  x.requestedAsOf!=null&&!day(x.requestedAsOf)||
  x.sourceIssuedAt!=null&&!iso(x.sourceIssuedAt)||
  x.sourceReleaseDate!=null&&!day(x.sourceReleaseDate)||
  x.sourcePublishedClockVerified!==false||
  x.historicalEligibility!=='UNVERIFIED_OR_NOT_APPLICABLE'||
  x.licenseStatus!=='NOT_REVIEWED'||
  (x.sourceUrl!=null&&!officialUrl(x.sourceUrl)))
  throw fail('Invalid bounded provenance capture');
 const body=JSON.stringify(x);
 if(body.length>105000)throw fail('Evidence record exceeds bounded size',413);
 if(/api[_-]?key|access[_-]?token|subscription[_-]?key|secret|password/i.test(JSON.stringify(Object.keys(x))))
  throw fail('Evidence capture contains prohibited credential fields');
 return body;
}
export function captureFredEvidence(data,options={}){
 if(data?.source!=='FRED_ALFRED_OFFICIAL_API')throw fail('Only normalized FRED source data can be journaled');
 const type=data.type,subject=(options.id||'SEARCH_DIRECTORY');
 if(!idPattern.test(subject))throw fail('Unsupported FRED evidence subject');
 const kinds={search:'FRED_SEARCH',series:'FRED_SERIES_METADATA',vintages:'FRED_VINTAGE_CALENDAR',
  release:'FRED_RELEASE_MAPPING',releaseDates:'FRED_RELEASE_CALENDAR',observations:'FRED_AS_OF_OBSERVATIONS'};
 if(!kinds[type])throw fail('Unsupported FRED evidence kind');
 const facts=type==='observations'?
  (data.observations||[]).map(x=>({date:x.date,value:x.value,vintageStart:x.vintageStart,vintageEnd:x.vintageEnd})):
  type==='vintages'?(data.dates||[]).map(date=>({date})):
  type==='releaseDates'?(data.dates||[]).map(x=>({date:x.date,releaseId:x.releaseId})):
  type==='release'?(data.releases||[]).map(x=>({id:x.id,label:fixed(x.label)})):
  (data.series||[]).map(x=>({id:x.id,title:fixed(x.title),units:fixed(x.units),frequency:fixed(x.frequency),
   observationStart:x.observationStart,observationEnd:x.observationEnd,lastUpdated:fixed(x.lastUpdated)}));
 const query={type,seriesId:options.id||null,asOf:options.asOf||null,
  months:options.months==null?null:Number(options.months),
  searchTerm:type==='search'?fixed(options.q):null,
  releaseId:type==='releaseDates'?Number(options.releaseId):null};
 const result={source:data.source,kind:kinds[type],subjectId:subject,requestedAsOf:options.asOf||null,
  sourceIssuedAt:null,sourceReleaseDate:null,sourcePublishedClockVerified:false,
  historicalEligibility:'UNVERIFIED_OR_NOT_APPLICABLE',licenseStatus:'NOT_REVIEWED',
  sourceUrl:officialUrl(data.sourceUrl)||officialUrl(facts.length===1?data.series?.[0]?.sourceUrl:null),
  query,facts};
 assertCapture(result);
 return result;
}
const officialResearchUrl=x=>{if(!x)return null;try{
 const u=new URL(x);
 const hosts=new Set(['fred.stlouisfed.org','www.eia.gov','www.cpc.ncep.noaa.gov',
  'cpc.ncep.noaa.gov','power.larc.nasa.gov','apps.fas.usda.gov','comtradeplus.un.org',
  'www.sec.gov','www.usgs.gov','pubs.usgs.gov','www.federalregister.gov',
  'api.gdeltproject.org','www.gdeltproject.org']);
 if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password||u.search)return null;
 u.hash='';return u.href;
 }catch{return null;}};
export function captureDossierEvidence(data){
 if(!data?.scenario?.id||!idPattern.test(data.scenario.id)||
  !data.coverage||!Array.isArray(data.sourceStatuses)||!Array.isArray(data.edges))throw fail('Malformed dossier summary');
 const sourcedInputs=(data.nodes||[]).flatMap(node=>{
  const context=(node.researchInputs||[]).map(x=>({
   kind:'RESEARCH_CONTEXT_INPUT',nodeId:fixed(node.id),source:fixed(x.source),
   period:fixed(x.period),label:fixed(x.label),unit:fixed(x.unit),
   value:typeof x.value==='number'&&Number.isFinite(x.value)?x.value:null,
   dataClass:fixed(x.dataClass),sourceUrl:officialResearchUrl(x.sourceUrl),
   providerFetchedAt:iso(x.fetchedAt)?x.fetchedAt:null,originalReleaseClockVerified:false
  }));
  if(node.observation)context.push({kind:'SOURCE_ISSUE_DATED_DOCUMENT',
   nodeId:fixed(node.id),source:fixed(node.observation.source),
   issueDate:day(node.observation.issueDate)?node.observation.issueDate:null,
   sourceUrl:officialResearchUrl(node.observation.sourceUrl),
   originalReleaseClockVerified:false,originalWebsiteRevisionVerified:false});
  return context;
 });
 const supplemental=(data.otherContext||[]).map(x=>({
  kind:'UNASSIGNED_SOURCE_CONTEXT',source:fixed(x.source),period:fixed(x.period),
  label:fixed(x.label),value:typeof x.value==='number'&&Number.isFinite(x.value)?x.value:null,
  unit:fixed(x.unit),dataClass:fixed(x.dataClass),
  sourceUrl:officialResearchUrl(x.sourceUrl),originalReleaseClockVerified:false
 }));
 const allInputs=[...sourcedInputs,...supplemental];
 const facts=[
  {kind:'COUNTS',totalNodes:data.coverage.totalNodes,contextNodes:data.coverage.contextNodes,
   contextEvidenceRows:data.coverage.contextEvidenceRows,totalEdges:data.coverage.totalEdges,
   validatedEdges:data.coverage.validatedEdges,verifiedIssuerImpacts:data.coverage.verifiedIssuerImpacts,
   sourceInputsArchived:Math.min(allInputs.length,80),sourceInputsOmitted:Math.max(0,allInputs.length-80)},
  ...data.sourceStatuses.slice(0,24).map(x=>({kind:'PROVIDER_STATUS',source:fixed(x.source),
   status:fixed(x.status),eligibleInputRows:x.eligibleInputRows})),
  ...data.edges.slice(0,36).map(x=>({kind:'GRAPH_EDGE',edgeId:fixed(x.id),verification:fixed(x.verification),
   inputCoverage:fixed(x.inputCoverage) })),
  ...allInputs.slice(0,80)
 ];
 const result={source:'TRADESCOPE_DOSSIER',kind:'ANALYSIS_SUMMARY',subjectId:data.scenario.id,
  requestedAsOf:data.asOf||null,sourceIssuedAt:null,sourceReleaseDate:null,
  sourcePublishedClockVerified:false,historicalEligibility:'UNVERIFIED_OR_NOT_APPLICABLE',
  licenseStatus:'NOT_REVIEWED',sourceUrl:null,
  query:{mode:data.mode,regionId:data.regionId,commodity:data.commodity,
   year:data.year,registryVersion:data.registryVersion},
  facts};
 assertCapture(result);return result;
}
export function createEvidenceLedger({filename,now=()=>new Date(),maxBytes=16000000,maxEntries=10000}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new TypeError('A local absolute journal path is required');
 let pending=Promise.resolve();
 const queue=fn=>{const step=pending.then(fn);pending=step.catch(()=>{});return step;};
 async function readJournal(){
  let raw;
  try{raw=await fs.readFile(filename,'utf8');}catch(e){if(e.code==='ENOENT')return [];throw fail('Evidence journal not readable',503);}
  if(Buffer.byteLength(raw)>maxBytes)throw fail('Evidence journal reached configured size',507);
  if(raw&&!raw.endsWith('\n'))throw fail('Evidence journal has a partial trailing record',409);
  const rows=raw?raw.trimEnd().split('\n'):[];
  if(rows.length>maxEntries)throw fail('Evidence journal exceeds entry limit',507);
  const records=[];let prev=MIN_HASH;
  for(const line of rows){
   let row;try{row=JSON.parse(line);}catch{throw fail('Evidence journal contains malformed JSON',409);}
   if(!row||row.schemaVersion!==1||row.seq!==records.length+1||row.previousHash!==prev||
    !/^[0-9a-f]{64}$/.test(row.recordHash||'')||!iso(row.capturedAt)||
    !/^[0-9a-f]{64}$/.test(row.payloadHash||''))throw fail('Evidence journal chain metadata invalid',409);
   const {recordHash,...withoutHash}=row;
   if(hash(withoutHash)!==recordHash||hash(row.capture)!==row.payloadHash)throw fail('Evidence journal hash mismatch',409);
   assertCapture(row.capture);
   records.push(row);prev=row.recordHash;
  }
  return records;
 }
 async function append(capture){
  const raw=assertCapture(capture);
  return queue(async()=>{
   const records=await readJournal();
   const scope=hash({source:capture.source,kind:capture.kind,subjectId:capture.subjectId,
    requestedAsOf:capture.requestedAsOf,query:capture.query});
   const previous=[...records].reverse().find(x=>x.scopeHash===scope);
   const digest=hash(capture);
   if(previous?.payloadHash===digest)return {status:'UNCHANGED',record:publicRecord(previous)};
   if(records.length>=maxEntries)throw fail('Evidence journal entry limit reached',507);
   const row={schemaVersion:1,seq:records.length+1,previousHash:records.at(-1)?.recordHash||MIN_HASH,
    capturedAt:now().toISOString(),source:capture.source,subjectId:capture.subjectId,
    scopeHash:scope,payloadHash:digest,priorScopeSeq:previous?.seq||null,
    changeStatus:previous?'CHANGED_SINCE_LOCAL_CAPTURE':'FIRST_LOCAL_CAPTURE',
    capture:JSON.parse(raw)};
   const recordHash=hash(row);const entry={...row,recordHash};
   const line=JSON.stringify(entry)+'\n';
   const stat=await fs.stat(filename).catch(e=>{if(e.code==='ENOENT')return {size:0};throw e;});
   if(stat.size+Buffer.byteLength(line)>maxBytes)throw fail('Evidence journal capacity reached',507);
   await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
   const file=await fs.open(filename,'a',0o600);
   try{await file.writeFile(line,'utf8');await file.sync();}finally{await file.close();}
   return {status:'CAPTURED',record:publicRecord(entry)};
  });
 }
 const publicRecord=x=>({seq:x.seq,recordHash:x.recordHash,previousHash:x.previousHash,
  capturedAt:x.capturedAt,source:x.source,subjectId:x.subjectId,kind:x.capture.kind,
  requestedAsOf:x.capture.requestedAsOf,sourceIssuedAt:x.capture.sourceIssuedAt,
  sourceReleaseDate:x.capture.sourceReleaseDate,
  sourcePublishedClockVerified:false,historicalEligibility:x.capture.historicalEligibility,
  licenseStatus:x.capture.licenseStatus,sourceUrl:x.capture.sourceUrl,
  factCount:x.capture.facts.length,scopeHash:x.scopeHash,payloadHash:x.payloadHash,
  priorScopeSeq:x.priorScopeSeq,changeStatus:x.changeStatus});
 async function status(){
  return queue(async()=>{const r=await readJournal();return {schemaVersion:1,enabled:true,
   integrity:'HASH_CHAIN_VALID',entries:r.length,lastSeq:r.at(-1)?.seq||0,
   lastCapturedAt:r.at(-1)?.capturedAt||null,storage:'LOCAL_SINGLE_PROCESS_JSONL',
   tamperProof:false,independentlyTimestamped:false,licenseStatus:'NOT_REVIEWED',
   originalPublishedAtVerified:false,
   warnings:['A SHA-256 chain detects file alterations when compared with an independently retained hash, but a local administrator can rewrite the entire chain.',
    'A later ALFRED as-of query is not evidence that TradeScope observed those records at the historical cutoff.',
    'No data is redistributed or declared licensed by writing a local research journal.']};});
 }
 async function list({source=null,subjectId=null,limit=30}={}){
  if(source!==null&&!SOURCES.has(source)||subjectId!==null&&!idPattern.test(subjectId)||
   !Number.isInteger(limit)||limit<1||limit>100)throw fail('Invalid evidence search');
  return queue(async()=>{
   const r=await readJournal();
   return {schemaVersion:1,entries:r.filter(x=>(!source||x.source===source)&&(!subjectId||x.subjectId===subjectId))
    .slice(-limit).reverse().map(publicRecord),readOnly:true};
  });
 }
 async function get(seq){
  if(!Number.isInteger(seq)||seq<1)throw fail('Invalid evidence sequence');
  return queue(async()=>{
   const r=await readJournal(),x=r[seq-1];if(!x)throw fail('Evidence record not found',404);
   return {...publicRecord(x),query:clone(x.capture.query),facts:clone(x.capture.facts)};
  });
 }
 return {append,status,list,get,
  captureFred:(data,options)=>append(captureFredEvidence(data,options)),
  captureDossier:data=>append(captureDossierEvidence(data))};
}
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function createEvidenceLedgerApi({ledger=null}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/evidence-ledger/'))return false;
  if(req.method!=='GET'){reply(res,405,{error:'Evidence ledger is read-only over HTTP'});return true;}
  if(!ledger){reply(res,200,{enabled:false,integrity:'NOT_ENABLED',
   note:'Set RESEARCH_EVIDENCE_LEDGER_ENABLED=true for local source capture after reviewing storage and provider license terms.'});return true;}
  try{
   const route=url.pathname.slice('/api/evidence-ledger/'.length),q=url.searchParams,
    names=[...q.keys()];
   if(names.some(x=>!['source','subject','limit','seq'].includes(x)||q.getAll(x).length!==1))throw fail('Invalid evidence query');
   if(route==='status'&&q.size===0){reply(res,200,await ledger.status());return true;}
   if(route==='entries'&&names.every(x=>['source','subject','limit'].includes(x))){
    const n=q.has('limit')?Number(q.get('limit')):30;
    reply(res,200,await ledger.list({source:q.get('source'),subjectId:q.get('subject'),limit:n}));return true;
   }
   if(route==='detail'&&names.length===1&&names[0]==='seq'){
    reply(res,200,await ledger.get(Number(q.get('seq'))));return true;
   }
   throw fail('Unknown evidence ledger endpoint',404);
  }catch(e){reply(res,[400,404,405,409,413,503,507].includes(e.status)?e.status:502,
   {error:e.status?e.message:'Evidence ledger unavailable'});}
  return true;
 };
}
