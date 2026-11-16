/**
 * ResearchOS v0.39 — Official identifier graph, first P0 evidence foundation.
 *
 * LEI and CIK are separate identifiers until an explicitly sourced analyst
 * crosswalk is registered. GLEIF reported direct-parent means ACCOUNTING
 * CONSOLIDATION, not legal share ownership or facility operation.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fetchFrs,fetchSec} from './facility-exposure.mjs';

const err=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=b=>createHash('sha256').update(b).digest('hex');
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&!Number.isNaN(Date.parse(s));
const validLei=s=>typeof s==='string'&&/^[0-9A-Z]{18}[0-9]{2}$/.test(s);
const validCik=s=>typeof s==='string'&&/^[0-9]{1,10}$/.test(s);
const canonicalCik=s=>String(BigInt(s)).padStart(10,'0');
const safeText=(s,n=300)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const LEI_BASE='https://api.gleif.org/api/v1/lei-records/';
export const ENTITY_GRAPH_SCHEMA='ENTITY-GRAPH-0.40.1';
export const ENTITY_GRAPH_FLAGS=Object.freeze([
 'LEI_IDENTITY_DOES_NOT_VERIFY_CIK_BINDING',
 'ACCOUNTING_CONSOLIDATION_IS_NOT_LEGAL_OWNERSHIP',
 'GLEIF_RELATIONSHIP_IS_NOT_A_FACILITY_OPERATOR_PROOF',
 'PUBLICATION_CLOCK_AND_EFFECTIVE_PERIOD_NOT_VERIFIED',
 'NO_SITE_MATERIALITY_OR_MARKET_RETURN_INFERENCE'
]);
const isHttpJson=t=>/^(application\/vnd\.api\+json|application\/json)$/i.test(t||'');
async function fixedJson(url,{fetchImpl=globalThis.fetch,maxBytes=180000,timeoutMs=8500}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
   signal:controller.signal,headers:{Accept:'application/vnd.api+json,application/json'}});
  if(response?.status===404)return {notFound:true,url};
  if(!response?.ok)throw err('Official entity registry request unavailable',503);
  const mime=(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!isHttpJson(mime))throw err('Official entity registry returned unexpected media type',502);
  const length=Number(response.headers?.get?.('content-length')||0);
  if(length>maxBytes)throw err('Official entity response exceeds size limit',413);
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')
   throw err('Official entity response stream unavailable',503);
  const bufs=[];let bytes=0;
  for await(const chunk of response.body){
   if(!(chunk instanceof Uint8Array))throw err('Official entity response had invalid chunk type',503);
   bytes+=chunk.byteLength;
   if(bytes>maxBytes){controller.abort();throw err('Official entity body exceeded stream limit',413);}
   bufs.push(Buffer.from(chunk));
  }
  const body=Buffer.concat(bufs);
  let json;
  try{json=JSON.parse(body.toString('utf8'));}
  catch{throw err('Official entity response is not valid JSON',502);}
  return {json,bodySha256:sha(body),responseBytes:body.length,url};
 }catch(e){if(e?.status)throw e;throw err('Official registry transport failed',503);}
 finally{clearTimeout(timer);}
}
export function normalizeLei(record,expected){
 if(!validLei(expected)||!record?.data||Array.isArray(record.data))
  throw err('Invalid or ambiguous GLEIF legal entity record',502);
 const d=record.data,a=d.attributes;
 if(d.id!==expected||!a?.entity?.legalName?.name)
  throw err('GLEIF LEI and legal name mismatch',502);
 return {lei:expected,name:safeText(a.entity.legalName.name,240),
  jurisdiction:safeText(a.entity.jurisdiction,60)||null,
  legalCountry:safeText(a.entity.legalAddress?.country,3)||null,
  registrationStatus:safeText(a.registration?.status,45)||'UNKNOWN',
  gleifRecordSource:'GLEIF_LEVEL_1_CURRENT_REPORTED',
  legalOwnershipVerified:false,secCikVerified:false,
  sourceUrl:LEI_BASE+expected};
}
export function normalizeGleifParent(record,childLei){
 if(!validLei(childLei))throw err('Invalid child LEI');
 if(record?.notFound)return {childLei,parentLei:null,status:'NO_GLEIF_PARENT_RECORD_RETURNED',
  relationshipType:null,sourceUrl:LEI_BASE+childLei+'/direct-parent',
  relationshipEffectiveDatesVerified:false};
 const d=record?.json?.data;
 if(!d||Array.isArray(d)||!validLei(d.id)||d.id===childLei)
  throw err('GLEIF direct-parent result missing valid distinct LEI',502);
 return {childLei,parentLei:d.id,relationshipType:'GLEIF_REPORTED_DIRECT_ACCOUNTING_CONSOLIDATION',
  status:'SOURCE_REPORTED_NOT_LEGAL_OWNERSHIP_CERTIFICATE',
  sourceUrl:LEI_BASE+childLei+'/direct-parent',
  relationshipEffectiveDatesVerified:false,legalShareOwnershipVerified:false,
  parentName:safeText(d.attributes?.entity?.legalName?.name,220)||null};
}
export async function fetchLei(lei,{fetchImpl=globalThis.fetch}={}){
 if(!validLei(lei))throw err('LEI must contain exactly 20 uppercase letters/digits and two numeric check digits');
 const data=await fixedJson(LEI_BASE+lei,{fetchImpl});
 if(data.notFound)throw err('GLEIF LEI not found',404);
 return {...normalizeLei(data.json,lei),bodySha256:data.bodySha256,responseBytes:data.responseBytes};
}
export async function fetchGleifParent(lei,{fetchImpl=globalThis.fetch}={}){
 if(!validLei(lei))throw err('Invalid child LEI');
 const data=await fixedJson(LEI_BASE+lei+'/direct-parent',{fetchImpl});
 return {...normalizeGleifParent(data,lei),bodySha256:data.bodySha256||null,
  responseBytes:data.responseBytes||0};
}

const dateString=value=>typeof value==='string'&&
 (/^\d{4}-\d{2}-\d{2}$/.test(value)||/^\d{4}-\d{2}-\d{2}T/.test(value))&&
 !Number.isNaN(Date.parse(value));
const normalizePeriods=periods=>{
 if(periods==null)return [];
 if(!Array.isArray(periods)||periods.length>8)throw err('GLEIF relationship period list invalid',502);
 return periods.map(x=>{
  if(!x||typeof x!=='object'||typeof x.type!=='string'||
   !['RELATIONSHIP_PERIOD','ACCOUNTING_PERIOD','DOCUMENT_FILING_PERIOD'].includes(x.type)||
   x.startDate!=null&&!dateString(x.startDate)||
   x.endDate!=null&&!dateString(x.endDate)||
   x.startDate&&x.endDate&&Date.parse(x.startDate)>Date.parse(x.endDate))
   throw err('GLEIF relationship period metadata invalid',502);
  return {type:x.type,startDate:x.startDate||null,endDate:x.endDate||null};
 });
};
export function normalizeGleifRelationship(payload,childLei){
 if(!validLei(childLei))throw err('Invalid child LEI');
 if(payload?.notFound)return {childLei,parentLei:null,
  status:'RELATIONSHIP_RECORD_NOT_RETURNED',sourceUrl:LEI_BASE+childLei+'/direct-parent-relationship',
  periods:[],sourceRelationshipVerified:false,legalOwnershipVerified:false};
 const d=payload?.json?.data;
 const attrs=d?.attributes,rel=attrs?.relationship||attrs;
 const child=rel?.startNode?.id, parent=rel?.endNode?.id;
 const relationshipType=rel?.relationshipType||rel?.type;
 if(!d||Array.isArray(d)||child!==childLei||!validLei(parent)||parent===childLei||
    relationshipType!=='IS_DIRECTLY_CONSOLIDATED_BY')
  throw err('GLEIF Level 2 record has mismatched LEI or unsupported relationship type',502);
 const periods=normalizePeriods(rel.relationshipPeriods??rel.periods??attrs.relationshipPeriods);
 return {childLei,parentLei,relationshipType:'GLEIF_REPORTED_DIRECT_ACCOUNTING_CONSOLIDATION',
  rawRelationshipType:relationshipType,
  status:'GLEIF_REPORTED_RELATIONSHIP_RECORD_NOT_LEGAL_OWNER_CERTIFICATE',
  sourceUrl:LEI_BASE+childLei+'/direct-parent-relationship',
  periods,registrationStatus:safeText(attrs?.registration?.status,40)||null,
  corroborationLevel:safeText(attrs?.registration?.corroborationLevel,50)||null,
  effectivePeriodOriginalPublicationVerified:false,legalOwnershipVerified:false,
  independentProviderCorroboration:false};
}
export async function fetchGleifRelationship(lei,{fetchImpl=globalThis.fetch}={}){
 if(!validLei(lei))throw err('Invalid child LEI');
 const data=await fixedJson(LEI_BASE+lei+'/direct-parent-relationship',{fetchImpl});
 return {...normalizeGleifRelationship(data,lei),
  bodySha256:data.bodySha256||null,responseBytes:data.responseBytes||0};
}

const ensureJournal=(doc,maxEntries)=>{
 if(doc?.schemaVersion!==1||!Array.isArray(doc.entries)||doc.entries.length>maxEntries)
  throw err('Entity graph journal schema invalid',500);
 let prior='GENESIS',time=null;const ids=new Set();
 for(const [i,e] of doc.entries.entries()){
  if(!e||e.seq!==i||!/^graph-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id)||
   ids.has(e.id)||!iso(e.capturedAt)||time&&e.capturedAt<time||
   e.previousHash!==prior||!['LEI','DIRECT_PARENT','GLEIF_RELATIONSHIP','CIK_LEI_CANDIDATE'].includes(e.type)||
   !e.value||typeof e.value!=='object')
   throw err('Entity graph journal record invalid',500);
  const {hash:recordHash,...base}=e;
  if(recordHash!==digest(base))throw err('Entity graph journal digest mismatch',500);
  prior=recordHash;time=e.capturedAt;ids.add(e.id);
 }
 return doc;
};
export function buildGraph({leiNodes,secFilers,facilities,parents,candidates,relationshipClaims,relationshipRecords=[],
 asOf}={}){
 if(!iso(asOf))throw err('Point-in-time graph requires exact UTC cutoff');
 const nodes=[
  ...leiNodes.map(x=>({id:'lei:'+x.lei,kind:'LEGAL_ENTITY',label:x.name,
   lei:x.lei,source:x.sourceUrl,capturedAt:x.capturedAt,registryStatus:x.registrationStatus,
   legallyOwnedFacilitiesVerified:false})),
  ...secFilers.map(x=>({id:'cik:'+x.cik,kind:'SEC_FILER',label:x.companyName,
   cik:x.cik,tickers:x.tickers,capturedAt:x.capturedAt,legallyOwnedFacilitiesVerified:false})),
  ...facilities.map(x=>({id:'frs:'+x.registryId,kind:'EPA_FACILITY',
   label:x.facilityName,frs:x.registryId,capturedAt:x.capturedAt,
   coordinates:x.location,legallyOwnedFacilitiesVerified:false}))
 ];
 const known=new Set(nodes.map(x=>x.id));
 const edges=[];
 for(const p of parents){
  if(p.parentLei&&!known.has('lei:'+p.parentLei))
   nodes.push({id:'lei:'+p.parentLei,kind:'GLEIF_PARENT_REFERENCE',
    label:p.parentName||'GLEIF-reported parent (not separately captured)',
    lei:p.parentLei,capturedAt:p.capturedAt,
    identityIndependentlyCaptured:false});
  if(p.parentLei){
   edges.push({from:'lei:'+p.childLei,to:'lei:'+p.parentLei,
    type:'REPORTED_ACCOUNTING_CONSOLIDATION',capturedAt:p.capturedAt,
    evidenceUrl:p.sourceUrl,legalOwnershipVerified:false,
    relationshipEffectiveDatesVerified:false});
  }
 }
 for(const record of relationshipRecords){
  if(!record.parentLei)continue;
  if(!nodes.some(n=>n.id==='lei:'+record.parentLei))
   nodes.push({id:'lei:'+record.parentLei,kind:'GLEIF_PARENT_REFERENCE',
    label:'GLEIF-reported relationship parent',lei:record.parentLei,
    capturedAt:record.capturedAt,identityIndependentlyCaptured:false});
  edges.push({from:'lei:'+record.childLei,to:'lei:'+record.parentLei,
   type:'GLEIF_LEVEL2_RECORDED_CONSOLIDATION',capturedAt:record.capturedAt,
   evidenceUrl:record.sourceUrl,relationshipPeriods:record.periods,
   rawRelationshipType:record.rawRelationshipType,sourceRegistrationStatus:record.registrationStatus,
   legalOwnershipVerified:false,relationshipEffectiveDatesVerified:false,
   independentProviderCorroboration:false});
 }
 for(const c of candidates){
  edges.push({from:'cik:'+c.cik,to:'lei:'+c.lei,type:'OPERATOR_IDENTIFIER_CANDIDATE',
   capturedAt:c.capturedAt,sourceEvidence:c.evidenceUrl,
   relationshipVerified:false,identityVerified:false});
 }
 for(const r of relationshipClaims){
  edges.push({from:'cik:'+r.cik,to:'frs:'+r.registryId,
   type:'HUMAN_FACILITY_RELATIONSHIP_CLAIM',capturedAt:r.capturedAt,
   evidenceUrl:r.evidenceUrl,relationshipId:r.relationshipId,
   legalOwnershipVerified:false});
 }
 return {ruleVersion:ENTITY_GRAPH_SCHEMA,asOf,nodes,edges,
  verifiedCompanyFacilityOwnershipEdges:0,
  antiAgentFlags:ENTITY_GRAPH_FLAGS,
  note:'Displayed lines are source-reported accounting consolidation or analyst-submitted identifier/plant hypotheses. No legal ownership or financial effect is independently certified.'};
}
export function createEntityGraph({facilityService,filename,fetchImpl=globalThis.fetch,
 enabled=true,now=()=>new Date().toISOString(),maxEntries=240,maxBytes=5000000}={}){
 if(typeof facilityService?.view!=='function'||typeof filename!=='string'||!path.isAbsolute(filename)||
  !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>1000||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('Entity graph requires facility crosswalk and bounded private journal');
 let doc=null,loading=null,queue=Promise.resolve();
 const clock=()=>{const time=now();if(!iso(time))throw err('Graph capture clock invalid',503);return time;};
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>maxBytes)throw err('Graph journal size limit exceeded',500);
    return doc=ensureJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxEntries);
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,entries:[]};
    throw err('Entity graph journal cannot be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{const p=queue.then(async()=>{await load();return fn();});queue=p.catch(()=>{});return p;};
 async function append(type,value){
  if(doc.entries.length>=maxEntries)throw err('Entity graph journal capacity reached',409);
  const capturedAt=clock(),last=doc.entries.at(-1);
  if(last&&capturedAt<last.capturedAt)throw err('Entity graph journal clock moved backwards',409);
  const base={id:'graph-'+randomUUID(),seq:doc.entries.length,type,capturedAt,
   previousHash:last?.hash||'GENESIS',value};
  const entry={...base,hash:digest(base)};
  const next={schemaVersion:1,entries:[...doc.entries,entry]};
  const json=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(json)>maxBytes)throw err('Entity graph journal full',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temporary=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,json,{flag:'wx',mode:0o600});
   await fs.rename(temporary,filename);}
  catch{throw err('Entity graph journal persist failure',503);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  doc=next;return entry;
 }
 const records=at=>doc.entries.filter(e=>e.capturedAt<=at);
 const latest=(kind,id,at)=>{
  const rows=records(at).filter(e=>e.type===kind&&
    (kind==='LEI'?e.value.lei===id:kind==='DIRECT_PARENT'||kind==='GLEIF_RELATIONSHIP'?e.value.childLei===id:
     (e.value.cik+'|'+e.value.lei)===id));
  return rows.at(-1)||null;
 };
 async function capturedLei({lei}={}){
  if(!enabled)throw err('Private entity graph unavailable on external host',403);
  if(!validLei(lei))throw err('Valid 20-character uppercase LEI required');
  return serial(async()=>{
   const source=await fetchLei(lei,{fetchImpl});
   const current=latest('LEI',lei,clock());
   if(current&&digest(current.value)===digest(source))
    return {deduplicated:true,record:current};
   return {deduplicated:false,record:await append('LEI',source)};
  });
 }
 async function capturedParent({lei}={}){
  if(!enabled)throw err('Private entity graph unavailable on external host',403);
  if(!validLei(lei))throw err('Valid child LEI required');
  return serial(async()=>{
   if(!latest('LEI',lei,clock()))throw err('Capture child LEI identity first',409);
   const source=await fetchGleifParent(lei,{fetchImpl});
   const previous=latest('DIRECT_PARENT',lei,clock());
   if(previous&&digest(previous.value)===digest(source))
    return {deduplicated:true,record:previous};
   return {deduplicated:false,record:await append('DIRECT_PARENT',source)};
  });
 }
 async function capturedRelationship({lei}={}){
  if(!enabled)throw err('Private entity graph unavailable on external host',403);
  if(!validLei(lei))throw err('Valid child LEI required');
  return serial(async()=>{
   if(!latest('LEI',lei,clock()))throw err('Capture child LEI identity before its Level 2 record',409);
   const source=await fetchGleifRelationship(lei,{fetchImpl});
   const previous=latest('GLEIF_RELATIONSHIP',lei,clock());
   if(previous&&digest(previous.value)===digest(source))
    return {deduplicated:true,record:previous};
   return {deduplicated:false,record:await append('GLEIF_RELATIONSHIP',source)};
  });
 }
 async function candidateLink({lei,cik,evidenceUrl,rationale}={}){
  if(!enabled)throw err('Private entity graph unavailable on external host',403);
  if(!validLei(lei)||!validCik(cik)||evidenceUrl!==LEI_BASE+lei||
   typeof rationale!=='string'||rationale.trim().length<30||rationale.length>480)
   throw err('Choose captured LEI and SEC CIK with exact GLEIF source URL and rationale');
  return serial(async()=>{
   const at=clock(),filers=await facilityService.view({asOf:at,radiusKm:1});
   const canonical=canonicalCik(cik);
   if(!latest('LEI',lei,at)||!filers.companies.some(x=>x.cik===canonical))
    throw err('Both GLEIF identity and SEC CIK must be separately captured first',409);
   const value={lei,cik:canonical,evidenceUrl,
    rationale:safeText(rationale,480),status:'ANALYST_IDENTIFIER_CANDIDATE_UNVERIFIED',
    legalOwnershipVerified:false,secCikLeiBindingVerified:false};
   const prev=latest('CIK_LEI_CANDIDATE',canonical+'|'+lei,at);
   if(prev&&digest(prev.value)===digest(value))return {deduplicated:true,record:prev};
   return {deduplicated:false,record:await append('CIK_LEI_CANDIDATE',value)};
  });
 }
 async function view({asOf=null}={}){
  if(!enabled)throw err('Private entity graph unavailable on external host',403);
  const at=asOf||clock();
  if(!iso(at)||at>clock())throw err('Graph cutoff must be nonfuture ISO UTC instant');
  await queue;await load();
  const f=await facilityService.view({asOf:at,radiusKm:1});
  const l=new Map(),p=new Map(),r=new Map(),c=new Map();
  for(const e of records(at)){
   if(e.type==='LEI')l.set(e.value.lei,{...e.value,capturedAt:e.capturedAt});
   else if(e.type==='DIRECT_PARENT')p.set(e.value.childLei,{...e.value,capturedAt:e.capturedAt});
   else if(e.type==='GLEIF_RELATIONSHIP')r.set(e.value.childLei,{...e.value,capturedAt:e.capturedAt});
   else c.set(e.value.cik+'|'+e.value.lei,{...e.value,capturedAt:e.capturedAt});
  }
  return {...buildGraph({leiNodes:[...l.values()],secFilers:f.companies,
   facilities:f.facilities,parents:[...p.values()],candidates:[...c.values()],
   relationshipClaims:f.relationships,relationshipRecords:[...r.values()],asOf:at}),
   relationshipConflicts:[...r.values()].filter(x=>{
    const parent=p.get(x.childLei);
    return x.parentLei&&parent?.parentLei&&x.parentLei!==parent.parentLei;
   }).map(x=>({childLei:x.childLei,sourceIdentityParent:p.get(x.childLei).parentLei,
    sourceLevel2Parent:x.parentLei,status:'PARENT_SOURCES_CONFLICT',
    claimVerified:false,warning:'Two separately retrieved GLEIF records disagree; neither asserts legal ownership.'})),
   level2Records:[...r.values()].map(x=>({...x,
    independentProviderCorroboration:false,legalOwnershipVerified:false})),
   inventory:{leis:l.size,reportedParents:p.size,level2Records:r.size,secFilers:f.companies.length,
    sites:f.facilities.length,identifierCandidates:c.size,
    facilityRelationshipClaims:f.relationships.length}};
 }
 async function checkSource({source,id}={}){
  if(!enabled)throw err('Provider contract check requires local loopback host',403);
  if(source==='EPA_FRS'){
   if(!/^\d{12}$/.test(id||''))throw err('EPA FRS source ID must contain 12 digits');
   const record=await fetchFrs(id,{fetchImpl});
   return {provider:'EPA_FRS',ok:true,contract:'EXACT_ID_COORDINATES',
    sourceUrl:record.providerUrl,bodySha256:record.bodySha256,bytes:record.responseBytes,
    verifiedLegalOwnership:false,persisted:false};
  }
  if(source==='SEC_EDGAR'){
   if(!validCik(id))throw err('SEC CIK must be 1–10 digits');
   const record=await fetchSec(id,{fetchImpl});
   return {provider:'SEC_EDGAR',ok:true,contract:'CIK_NAME_TICKER',
    sourceUrl:record.sourceUrl,bodySha256:record.bodySha256,bytes:record.responseBytes,
    verifiedLegalOwnership:false,persisted:false};
  }
  if(source==='GLEIF_LEI'){
   if(!validLei(id))throw err('GLEIF LEI must contain 20 permitted characters');
   const record=await fetchLei(id,{fetchImpl});
   return {provider:'GLEIF_LEI',ok:true,contract:'EXACT_LEI_LEGAL_NAME',
    sourceUrl:record.sourceUrl,bodySha256:record.bodySha256,bytes:record.responseBytes,
    verifiedLegalOwnership:false,persisted:false};
  }
  if(source==='GLEIF_LEVEL2_RELATIONSHIP'){
   if(!validLei(id))throw err('GLEIF relationship check needs an exact 20-character child LEI');
   const record=await fetchGleifRelationship(id,{fetchImpl});
   return {provider:'GLEIF_LEVEL2_RELATIONSHIP',
    ok:record.parentLei!==null,contract:'EXACT_CHILD_LEI_AND_DIRECT_ACCOUNTING_PARENT',
    sourceUrl:record.sourceUrl,bodySha256:record.bodySha256,bytes:record.responseBytes,
    note:record.parentLei?'GLEIF-reported, not independently verified ownership':'No matching GLEIF Level 2 relationship record returned',
    verifiedLegalOwnership:false,persisted:false};
  }
  throw err('Only EPA_FRS, SEC_EDGAR, GLEIF_LEI or GLEIF_LEVEL2_RELATIONSHIP checks allowed');
 }
 const catalog=()=>({enabled,version:ENTITY_GRAPH_SCHEMA,
  sourceContracts:['EPA_FRS','SEC_EDGAR','GLEIF_LEI','GLEIF_LEVEL2_RELATIONSHIP'],
  ids:['FRS_REGISTRY_ID','SEC_CIK','GLEIF_LEI'],
  linkTypes:['REPORTED_ACCOUNTING_CONSOLIDATION','OPERATOR_IDENTIFIER_CANDIDATE','HUMAN_FACILITY_RELATIONSHIP_CLAIM'],
  legalOwnershipIndependentlyVerified:false,
  note:'Live provider checks are operator-initiated. CI fixtures do not establish successful live access, licensing or legal ownership.'});
 async function close(){await queue;}
 return {catalog,capturedLei,capturedParent,capturedRelationship,candidateLink,checkSource,view,close};
}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
export function createEntityGraphApi({graph,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/entity-graph/'))return false;
  const op=url.pathname.slice('/api/entity-graph/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)send(res,200,graph.catalog());
    else if(op==='view'&&[...url.searchParams.keys()].every(k=>k==='asOf')&&
     url.searchParams.getAll('asOf').length<=1)
     send(res,200,await graph.view({asOf:url.searchParams.get('asOf')||null}));
    else throw err('Unknown graph read endpoint',404);
   }else if(req.method==='POST'&&['lei','parent','relationship','link','check'].includes(op)&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-entity-graph']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw err('Explicit same-origin loopback action required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw err('JSON request required',415);
    let input='',bytes=0;
    for await(const part of req){bytes+=part.byteLength;if(bytes>1100)throw err('Graph input too large',413);input+=part;}
    let args;
    try{args=JSON.parse(input);}catch{throw err('Invalid graph JSON');}
    const allowed=op==='lei'||op==='parent'||op==='relationship'?['lei']:op==='link'?
     ['lei','cik','evidenceUrl','rationale']:['source','id'];
    if(!args||Array.isArray(args)||typeof args!=='object'||
      Object.keys(args).some(x=>!allowed.includes(x)))throw err('Unsupported graph input fields');
    const output=op==='lei'?await graph.capturedLei(args):op==='parent'?
     await graph.capturedParent(args):op==='relationship'?await graph.capturedRelationship(args):op==='link'?await graph.candidateLink(args):
     await graph.checkSource(args);
    send(res,200,output);
   }else throw err('Unsupported entity graph operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   send(res,status,{error:e?.status?e.message:'Entity graph unavailable'});
  }
  return true;
 };
}
