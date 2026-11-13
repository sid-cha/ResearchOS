/** Bounded single-process archive of normalized provider observations.
 * Revisions are immutable. Knowledge cutoffs use local durable capture time,
 * never a provider publication/update time or a retrospective import's event time.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validEventTimestamp} from './market-events.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=value=>structuredClone(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const HASH=/^[a-f0-9]{64}$/;
const VERSION=/^REV-[a-f0-9-]{36}$/;
const CITATION=/^[A-Za-z0-9_.:/-]{1,160}$/;
const NAMESPACES=Object.freeze({USGS:'usgs',SEC_EDGAR:'sec',ALPACA_NEWS:'alpaca',NASA_EONET:'eonet',GDELT:'gdelt'});
const LIMITATIONS=Object.freeze([
 'Archive knowledge begins at local capturedAt/firstObservedAt; provider event, publication and update times do not backdate local knowledge.',
 'Latest means latest observed content, not necessarily the provider record with the newest update timestamp. Provider-time regressions are retained and flagged.',
 'A revision means changed normalized observation content, including derived enrichment; it does not prove an official provider amendment.',
 'Retrospective imports cannot reconstruct original first-alert knowledge, complete source revision history, verified company exposure or causal impact.'
]);
const plain=(value,max=500)=>typeof value==='string'?value.slice(0,max*4).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):null;
const symbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(value);
const instant=value=>validEventTimestamp(value)?value:null;
const canonicalTime=value=>instant(value)?new Date(value).toISOString():null;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
const boundedNumber=(value,min,max)=>finite(value)&&value>=min&&value<=max?value:null;
function sourceOf(value){
 if(typeof value!=='string')throw fail('A supported event source is required');
 const source=value.trim().toUpperCase().replace(/[ -]+/g,'_');
 if(source==='USGS')return 'USGS';
 if(['SEC','SEC_EDGAR','SEC_EDGAR_XBRL'].includes(source))return 'SEC_EDGAR';
 if(['ALPACA','ALPACA_NEWS'].includes(source))return 'ALPACA_NEWS';
 if(['NASA','NASA_EONET','EONET'].includes(source))return 'NASA_EONET';
 if(source==='GDELT'||source.startsWith('GDELT_')||source.startsWith('GDELT_/'))return 'GDELT';
 throw fail('Choose a supported normalized event source');
}
function eventId(value,source){
 if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value))throw fail('A bounded provider event identifier is required');
 const namespace=NAMESPACES[source],prefix=value.split(':')[0].toLowerCase();
 if(Object.values(NAMESPACES).includes(prefix)&&prefix!==namespace)throw fail('Event identifier and source disagree');
 const id=value.toLowerCase().startsWith(namespace+':')?namespace+value.slice(namespace.length):namespace+':'+value;
 if(id.length>180)throw fail('Provider event identifier is too long');
 return id;
}
function validId(value){return typeof value==='string'&&/^(?:usgs|sec|alpaca|eonet|gdelt):[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value);}
function safeUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
  if([...url.searchParams.keys()].some(key=>/^(?:api[-_]?key|access[-_]?token|token|secret|password|authorization)$/i.test(key)))return null;
  return url.href;
 }catch{return null;}
}
function normalizeEvent(input,source){
 if(!object(input))throw fail('A normalized provider event is required');
 const id=eventId(input.id,source),headline=plain(input.headline??input.title,350);
 if(!headline)throw fail('An event headline is required');
 const location=object(input.location)?input.location:input;
 const latitude=boundedNumber(location.latitude,-90,90),longitude=boundedNumber(location.longitude,-180,180);
 const classifications=Array.isArray(input.classifications)?input.classifications.slice(0,20).flatMap(item=>{
  const code=plain(typeof item==='string'?item:item?.code??item?.type??item?.id,80);
  if(!code)return [];
  const basis=plain(item?.basis,80),itemCode=plain(item?.itemCode,20);
  return [{code,label:plain(item?.label??item?.title,160),evidenceIds:Array.isArray(item?.evidenceIds)?[...new Set(item.evidenceIds.slice(0,50).filter(value=>typeof value==='string'&&CITATION.test(value)))].sort().slice(0,16):[],...(basis?{basis}:{}),...(itemCode?{itemCode}:{})}];
 }).sort((left,right)=>left.code.localeCompare(right.code)):[];
 const evidence=Array.isArray(input.evidence)?input.evidence.slice(0,16).flatMap(item=>{
  if(!object(item)||typeof item.id!=='string'||!CITATION.test(item.id))return [];
  const kind=plain(item.kind,60);
  return [{id:item.id,text:plain(item.text??item.excerpt,1600),section:plain(item.section??item.title,160),sourceUrl:safeUrl(item.sourceUrl),...(kind?{kind}:{})}];
 }):[];
 const rawSummaries=Array.isArray(input.summaries)?input.summaries:Array.isArray(input.summary)?input.summary:[];
 const summaries=rawSummaries.slice(0,6).flatMap(item=>{
  const text=plain(item?.text,400),evidenceId=typeof item?.evidenceId==='string'&&CITATION.test(item.evidenceId)?item.evidenceId:null;
  return text&&evidenceId?[{text,evidenceId}]:[];
 });
 const normalized={
  id,source,sourceLabel:plain(input.sourceLabel??input.source,100)||source,sourceUrl:safeUrl(input.sourceUrl),
  headline,type:plain(input.type,80)||'UNCLASSIFIED',category:plain(input.category,60)||'OTHER',summary:plain(typeof input.summary==='string'?input.summary:summaries.length?summaries.map(item=>item.text).join(' '):null,2000),
  symbols:Array.isArray(input.symbols)?[...new Set(input.symbols.slice(0,100).filter(symbol))].sort().slice(0,25):[],
  occurredAt:instant(input.occurredAt),publishedAt:source==='USGS'?null:instant(input.publishedAt),
  providerFirstSeenAt:source==='USGS'?null:instant(input.providerFirstSeenAt),providerUpdatedAt:instant(input.providerUpdatedAt??input.updatedAt),
  filingDate:day(input.filingDate),periodEnd:day(input.periodEnd),form:plain(input.form,20),
  accession:typeof input.accession==='string'&&/^\d{10}-\d{2}-\d{6}$/.test(input.accession)?input.accession:null,
  cik:typeof input.cik==='string'&&/^\d{1,10}$/.test(input.cik)?input.cik.padStart(10,'0'):null,
  location:latitude!==null&&longitude!==null?{latitude,longitude}:null,
  magnitude:boundedNumber(input.magnitude,-3,12),depthKm:boundedNumber(input.depthKm,-20,1000),
  tsunamiFlag:typeof input.tsunamiFlag==='boolean'?input.tsunamiFlag:input.tsunamiFlag===1?true:input.tsunamiFlag===0?false:null,
  evidenceLevel:plain(input.evidenceLevel,100),documentHash:HASH.test(input.documentHash||'')?input.documentHash:null,
  classificationMethod:plain(input.classificationMethod,100),classificationVersion:plain(input.classificationVersion,100),
  contentRevision:plain(input.contentRevision,128),classifications,evidence,
  ...(summaries.length?{summaries}:{}),
 };
 if(Buffer.byteLength(JSON.stringify(normalized))>65536)throw fail('Normalized event exceeds archive record limits',413);
 return normalized;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const count=(value,fallback,max,label)=>{const result=value??fallback;if(!Number.isInteger(result)||result<1||result>max)throw fail(`Invalid ${label} limit`);return result;};
const cursorEncode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function cursorDecode(value,kind,scope){
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||value.length>400||!/^[A-Za-z0-9_-]+$/.test(value))throw fail('Invalid archive cursor');
 try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(parsed.kind!==kind||parsed.scope!==scope||!Number.isSafeInteger(parsed.position)||parsed.position<1)throw Error();return parsed.position;
 }catch{throw fail('Archive cursor does not match this query');}
}

export function createEventArchive({filename,now=Date.now,maxEvents=500,maxRevisions=5000,maxBytes=33554432}={}){
 if(typeof filename!=='string'||!filename)throw fail('An event-archive filename is required');
 count(maxEvents,500,500,'archive event');count(maxRevisions,5000,5000,'archive revision');count(maxBytes,33554432,33554432,'archive byte');
 let state=null,loading=null,serial=Promise.resolve();
 const clock=()=>{const value=Number(now());if(!Number.isFinite(value))throw fail('Event archive clock is invalid',500);return value;};
 const timestamp=()=>new Date(clock()).toISOString();
 const find=(document,id)=>{if(!validId(id))throw fail('Choose a valid archived event identifier');const result=document.events.find(item=>item.id===id);if(!result)throw fail('Archived event not found',404);return result;};
 const summary=entry=>({id:entry.id,source:entry.source,firstObservedAt:entry.firstObservedAt,lastObservedAt:entry.lastObservedAt,
  revisionCount:entry.revisions.length,latestRevisionId:entry.revisions.at(-1).id,latest:entry.revisions.at(-1),
  ordering:'latest_observed',knowledgeCoverage:'archive_observed_only',limitations:LIMITATIONS});
 function checkDocument(input){
  if(!object(input)||input.schema!==1||!Array.isArray(input.events)||input.events.length>maxEvents||!Number.isSafeInteger(input.lastSequence)||input.lastSequence<0||input.lastCapturedAt!==null&&!canonicalTime(input.lastCapturedAt))throw fail('Event archive has an invalid schema',500);
  if(input.lastSequence!==input.events.length||Boolean(input.events.length)!==Boolean(input.lastCapturedAt))throw fail('Event archive capture history is invalid',500);
  let total=0;const ids=new Set(),sequences=new Set(),revisionIds=new Set();
  const events=input.events.map(entry=>{
   if(!object(entry)||!validId(entry.id)||ids.has(entry.id)||!Number.isSafeInteger(entry.sequence)||entry.sequence<1||entry.sequence>input.lastSequence||sequences.has(entry.sequence)||!canonicalTime(entry.firstObservedAt)||!canonicalTime(entry.lastObservedAt)||!Array.isArray(entry.revisions)||!entry.revisions.length)throw fail('Event archive record has an invalid schema',500);
   ids.add(entry.id);sequences.add(entry.sequence);const source=sourceOf(entry.source);let previous=null;
   const revisions=entry.revisions.map((revision,index)=>{
    if(!object(revision)||!VERSION.test(revision.id)||revisionIds.has(revision.id)||revision.eventId!==entry.id||revision.version!==index+1||!canonicalTime(revision.capturedAt)||!HASH.test(revision.contentHash)||typeof revision.historicalImport!=='boolean'||typeof revision.providerTimeRegressed!=='boolean'||!['retrospective_import','captured_observation'].includes(revision.knowledgeStatus)||!['provider_observation','metadata_observation','derived_enrichment'].includes(revision.captureKind))throw fail('Event archive revision has an invalid schema',500);
    const event=normalizeEvent(revision.event,source);
    if(event.id!==entry.id||hash(event)!==revision.contentHash||previous&&Date.parse(revision.capturedAt)<Date.parse(previous.capturedAt)||previous?.contentHash===revision.contentHash)throw fail('Event archive revision evidence is invalid',500);
    const expectedRegression=Boolean(previous?.event.providerUpdatedAt&&event.providerUpdatedAt&&Date.parse(event.providerUpdatedAt)<Date.parse(previous.event.providerUpdatedAt));
    if(revision.providerTimeRegressed!==expectedRegression)throw fail('Event archive ordering evidence is invalid',500);
    if(revision.knowledgeStatus!==(revision.historicalImport?'retrospective_import':'captured_observation'))throw fail('Event archive knowledge evidence is invalid',500);
    revisionIds.add(revision.id);
    previous={id:revision.id,eventId:entry.id,version:index+1,contentHash:revision.contentHash,capturedAt:revision.capturedAt,
     reportedObservedAt:instant(revision.reportedObservedAt),event,historicalImport:revision.historicalImport,
     knowledgeStatus:revision.knowledgeStatus,providerTimeRegressed:revision.providerTimeRegressed,captureKind:revision.captureKind,
     changeKind:index===0?'first_capture':'normalized_observation_changed',changedFields:previous?Object.keys(event).filter(key=>JSON.stringify(previous.event[key])!==JSON.stringify(event[key])):Object.keys(event)};return previous;
   });
   if(entry.firstObservedAt!==revisions[0].capturedAt||Date.parse(entry.lastObservedAt)<Date.parse(revisions.at(-1).capturedAt)||Date.parse(entry.lastObservedAt)>Date.parse(input.lastCapturedAt))throw fail('Event archive observation times are invalid',500);
   total+=revisions.length;
   return {id:entry.id,source,sequence:entry.sequence,firstObservedAt:entry.firstObservedAt,lastObservedAt:entry.lastObservedAt,revisions};
  });
  if(total>maxRevisions||input.revisionCount!==total||events.length===0&&input.lastSequence!==0)throw fail('Event archive capacity or revision count is invalid',500);
  return {schema:1,lastSequence:input.lastSequence,lastCapturedAt:input.lastCapturedAt,revisionCount:total,events};
 }
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{const information=await fs.stat(filename);if(information.size>maxBytes)throw fail('Event archive exceeds its configured byte limit',500);state=checkDocument(JSON.parse(await fs.readFile(filename,'utf8')));}
   catch(error){if(error.code==='ENOENT')state={schema:1,lastSequence:0,lastCapturedAt:null,revisionCount:0,events:[]};else if(error.status===500)throw error;else throw fail('Event archive could not be read safely',500);}return state;
  })().catch(error=>{loading=null;throw error;});return loading;
 }
 async function save(document){
  const contents=JSON.stringify(document,null,2)+'\n';if(Buffer.byteLength(contents)>maxBytes)throw fail('Event archive is full; export or migrate it before capturing more evidence',409);
  const temporary=`${filename}.${randomUUID()}.tmp`;
  try{await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(temporary,contents,{encoding:'utf8',mode:0o600});await fs.rename(temporary,filename);}
  catch{throw fail('Event archive could not be saved safely',500);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 }
 const write=operation=>{const pending=serial.then(async()=>{await load();const candidate=copy(state),result=operation(candidate);await save(candidate);state=candidate;return copy(result);});serial=pending.catch(()=>{});return pending;};
 const read=async operation=>{await serial;await load();return copy(operation(state));};
 function append(document,input,capturedAt){
  if(!object(input)||!object(input.event))throw fail('Send a normalized provider event');
  const source=sourceOf(input.source??input.event.source),event=normalizeEvent(input.event,source);
  if(input.observedAt!==undefined&&!instant(input.observedAt))throw fail('An observed timestamp must be a full ISO instant');
  if(input.observedAt&&Date.parse(input.observedAt)>Date.parse(capturedAt)+300000)throw fail('A reported observation time cannot be ahead of the archive clock');
  if(input.historicalImport!==undefined&&typeof input.historicalImport!=='boolean')throw fail('Historical import state must be boolean');
  if(input.captureKind!==undefined&&!['provider_observation','metadata_observation','derived_enrichment'].includes(input.captureKind))throw fail('Choose a supported archive capture kind');
  const historicalImport=input.historicalImport===true||source==='USGS'||String(input.event.knowledgeStatus||'').startsWith('retrospective');
  const digest=hash(event);let entry=document.events.find(item=>item.id===event.id),action='revised';
  if(!entry){
   if(document.events.length>=maxEvents)throw fail('Event archive event capacity reached; export or migrate before adding events',409);
   entry={id:event.id,source,sequence:++document.lastSequence,firstObservedAt:capturedAt,lastObservedAt:capturedAt,revisions:[]};document.events.push(entry);action='created';
  }
  entry.lastObservedAt=capturedAt;const latest=entry.revisions.at(-1);
  if(latest?.contentHash===digest)return {action:'observed',eventId:event.id,revision:latest};
  if(document.revisionCount>=maxRevisions)throw fail('Event archive revision capacity reached; export or migrate before adding revisions',409);
  const revision={id:`REV-${randomUUID()}`,eventId:event.id,version:entry.revisions.length+1,contentHash:digest,capturedAt,
   reportedObservedAt:instant(input.observedAt),event,historicalImport,knowledgeStatus:historicalImport?'retrospective_import':'captured_observation',
   providerTimeRegressed:Boolean(latest?.event.providerUpdatedAt&&event.providerUpdatedAt&&Date.parse(event.providerUpdatedAt)<Date.parse(latest.event.providerUpdatedAt)),
   captureKind:input.captureKind??(event.classifications.length||event.evidence.length||event.documentHash||event.classificationMethod||event.classificationVersion?'derived_enrichment':'provider_observation'),
   changeKind:latest?'normalized_observation_changed':'first_capture',changedFields:latest?Object.keys(event).filter(key=>JSON.stringify(latest.event[key])!==JSON.stringify(event[key])):Object.keys(event)};
  entry.revisions.push(revision);document.revisionCount++;return {action,eventId:event.id,revision};
 }
 function capture(inputs){return write(document=>{
  const capturedAt=timestamp();if(document.lastCapturedAt&&Date.parse(capturedAt)<Date.parse(document.lastCapturedAt))throw fail('Archive clock moved backwards; correct it before capturing more evidence',409);
  const outcomes=inputs.map(input=>append(document,input,capturedAt));document.lastCapturedAt=capturedAt;return outcomes;
 });}
 return {
  async ingest(input){return (await capture([input]))[0];},
  ingestBatch(inputs){if(!Array.isArray(inputs)||!inputs.length||inputs.length>200)return Promise.reject(fail('Capture between one and two hundred normalized events'));return capture(inputs);},
  list({source,symbol:filterSymbol,limit=50,cursor}={}){
   const canonicalSource=source===undefined?null:sourceOf(source);if(filterSymbol!==undefined&&!symbol(filterSymbol))return Promise.reject(fail('Choose a valid archive symbol'));
   limit=count(limit,50,100,'archive list');const scope=hash([canonicalSource,filterSymbol??null]),before=cursorDecode(cursor,'events',scope);
   return read(document=>{
    const all=document.events.filter(entry=>(!canonicalSource||entry.source===canonicalSource)&&(!filterSymbol||entry.revisions.at(-1).event.symbols.includes(filterSymbol))).sort((left,right)=>right.sequence-left.sequence);
    const page=all.filter(entry=>before===null||entry.sequence<before),selected=page.slice(0,limit);
    return {events:selected.map(summary),nextCursor:page.length>limit?cursorEncode({kind:'events',scope,position:selected.at(-1).sequence}):null,total:all.length,
     coverage:{events:document.events.length,revisions:document.revisionCount,maxEvents,maxRevisions,maxBytes,retention:'bounded_append_only_no_silent_eviction',knowledgeCoverage:'archive_observed_only'},limitations:LIMITATIONS};
   });
  },
  get(id){return read(document=>summary(find(document,id)));},
  findRevision(id,{contentRevision}={}){
   if(typeof contentRevision!=='string'||!contentRevision.trim()||contentRevision.length>128)return Promise.reject(fail('Choose a valid archived content revision'));
   return read(document=>{const entry=find(document,id),revision=entry.revisions.filter(item=>item.event.contentRevision===contentRevision).at(-1);
    if(!revision)throw fail('Archived content revision not found',404);return revision;
   });
  },
  revisions(id,{limit=100,cursor}={}){
   limit=count(limit,100,100,'archive revision');const scope=hash(id),after=cursorDecode(cursor,'revisions',scope);
   return read(document=>{const entry=find(document,id),page=entry.revisions.filter(revision=>after===null||revision.version>after),selected=page.slice(0,limit);
    return {eventId:id,revisions:selected,nextCursor:page.length>limit?cursorEncode({kind:'revisions',scope,position:selected.at(-1).version}):null,total:entry.revisions.length,ordering:'capture_then_version_ascending',limitations:LIMITATIONS};
   });
  },
  atCutoff(id,cutoff){
   if(!instant(cutoff))return Promise.reject(fail('Choose a full ISO archive knowledge cutoff'));
   if(Date.parse(cutoff)>clock())return Promise.reject(fail('Archive knowledge cutoff cannot be in the future'));
   return read(document=>{const entry=find(document,id),revision=entry.revisions.filter(item=>Date.parse(item.capturedAt)<=Date.parse(cutoff)).at(-1)??null;
    return {eventId:id,cutoff,status:revision?'observed':'not_observed',revision,firstObservedAt:entry.firstObservedAt,knowledgeCoverage:'archive_observed_only',limitations:LIMITATIONS};
   });
  }
 };
}
