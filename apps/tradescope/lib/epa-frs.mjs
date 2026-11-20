/**
 * v0.26: EPA FRS public facility identifier / coordinate corroboration.
 * This validates official FRS facility metadata only. It NEVER asserts the legal
 * operator, SEC CIK relationship, issuer loss, original vintage or investment impact.
 *
 * Docs: https://www.epa.gov/frs/frs-api
 */
import {createHash} from 'node:crypto';
import {greatCircleKm} from './geo-exposure.mjs';

const BASE='https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities';
const DOCS='https://www.epa.gov/frs/frs-api';
const ID=/^\d{10,14}$/;
const FIELD=/^[A-Za-z0-9 .,'()&/_-]{1,200}$/;
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=x=>structuredClone(x);
const small=x=>typeof x==='string'&&x.length<=200?x.trim().slice(0,200):null;
const time=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x)?x:null;
const number=x=>x==null||x===''?null:Number(x);
const latitude=x=>{const n=number(x);return Number.isFinite(n)&&n>=-90&&n<=90?n:null};
const longitude=x=>{const n=number(x);return Number.isFinite(n)&&n>=-180&&n<=180?n:null};
const sha=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const validRegistryId=x=>typeof x==='string'&&ID.test(x);
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export function frsLookupUrl(registryId){
 if(!validRegistryId(registryId))throw err('Enter a 10–14 digit official EPA FRS Registry ID');
 const url=new URL(BASE);
 url.searchParams.set('registry_id',registryId);
 url.searchParams.set('program_output','yes');
 url.searchParams.set('output','JSON');
 return url;
}
function candidateRows(raw){
 if(Array.isArray(raw))return raw;
 if(!raw||typeof raw!=='object')throw err('EPA FRS schema unavailable',502);
 // EPA's public service has returned differing JSON wrappers across deployments.
 const queue=[raw];
 for(let depth=0;depth<4;depth++){
  const next=[];
  for(const x of queue){
   if(Array.isArray(x))return x;
   if(!x||typeof x!=='object')continue;
   if(typeof x.RegistryId==='string'&&Object.hasOwn(x,'FacilityName'))return [x];
   for(const key of ['FRSFacility','FRSFacilities','Facilities','Facility','get_facilities','GetFacilities','result','Results']){
    if(Object.hasOwn(x,key))next.push(x[key]);
   }
  }
  queue.splice(0,queue.length,...next);
 }
 throw err('Unrecognized EPA FRS JSON response shape',502);
}
function programRows(row){
 const container=row.ProgramFacilities??row.ProgramFacility??null;
 if(!container)return [];
 if(Array.isArray(container))return container;
 if(Array.isArray(container.ProgramFacility))return container.ProgramFacility;
 if(container.ProgramFacility&&typeof container.ProgramFacility==='object')return [container.ProgramFacility];
 return [];
}
export function normalizeFrsRecord(raw,{registryId,fetchedAt=new Date().toISOString()}={}){
 frsLookupUrl(registryId);
 const candidates=candidateRows(raw);
 if(candidates.length>15)throw err('EPA FRS returned too many facilities for one registry ID',502);
 const matches=candidates.filter(x=>x?.RegistryId===registryId);
 if(matches.length===0)return {source:'EPA_FRS_PUBLIC_REST',registryId,status:'NO_MATCH',record:null,
  fetchedAt,sourceDocumentation:DOCS,historicalAsOfEligible:false,
  limitations:['No record was returned for this ID; this is not proof of no operating facility.']};
 if(matches.length!==1)throw err('Ambiguous EPA Registry ID response',502);
 const row=matches[0],facName=small(row.FacilityName);
 if(!facName||!FIELD.test(facName))throw err('EPA FRS facility name is missing or unsupported',502);
 const lat=latitude(row.Latitude83),lon=longitude(row.Longitude83);
 // Unknown official coordinates are represented as null, never (0,0).
 const geoStatus=lat===null||lon===null?'UNAVAILABLE':'OFFICIAL_NAD83_REPORTED_POINT';
 const programs=programRows(row).slice(0,30).map(x=>({
  system:small(x.ProgramSystemAcronym),id:small(x.ProgramSystemId),
  facilityName:small(x.ProgramFacilityName)
 })).filter(x=>x.system&&x.id&&FIELD.test(x.system)&&FIELD.test(x.id));
 const record={registryId,facilityName:facName,latitude:lat,longitude:lon,coordinateStatus:geoStatus,
  horizontalDatum:'NAD83',locationAddress:small(row.LocationAddress),city:small(row.CityName),
  state:small(row.StateAbbr),postal:small(row.ZipCode),
  programLinks:programs,
  officialRegistryIdentity:'EPA_FRS_REGISTRY_ID_OBSERVED',
  currentOwnerVerified:false,publicCompanyCikVerified:false,facilityOperatingVerified:false,
  originalPublicationVerified:false,siteDamageVerified:false};
 return {source:'EPA_FRS_PUBLIC_REST',registryId,status:'FOUND',record,
  fetchedAt,providerOriginalPublishedAt:null,originalPublicationClockVerified:false,
  historicalAsOfEligible:false,recordHash:sha(record),
  sourceDocumentation:DOCS,
  originalRecordLink:'https://www.epa.gov/frs/frs-query',
  limitations:['EPA FRS provides a facility identity and possibly NAD83 coordinates, not a verified public-company owner or legal operator.',
   'FRS program links are government program identifiers, not SEC CIK subsidiary ownership crosswalks.',
   'This is a current-source lookup; historic site ownership and original first-issued publication have not been verified.',
   'The response does not establish physical damage, supply interruption, issuer earnings or a trading forecast.']};
}
async function boundedJson(response,maxBytes=350000){
 const declared=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)throw err('EPA FRS response exceeded limit',502);
 const contentType=response.headers?.get?.('content-type')||'';
 if(contentType&&!contentType.toLowerCase().includes('json'))throw err('EPA FRS returned unsupported response format',502);
 const chunks=[];let size=0;
 if(response.body?.getReader){
  const reader=response.body.getReader();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw err('EPA FRS response exceeded limit',502);}
    chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 }else{const x=await response.text();size=Buffer.byteLength(x);if(size>maxBytes)throw err('EPA FRS response exceeded limit',502);chunks.push(Buffer.from(x));}
 let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw err('EPA FRS JSON could not be parsed',502);}
 return parsed;
}
export function createEpaFrsLookup({fetchImpl=fetch,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 async function lookup(registryId){
  const url=frsLookupUrl(registryId),hit=cache.get(registryId);
  if(hit?.expires>Date.now())return copy(hit.data);
  if(pending.has(registryId))return copy(await pending.get(registryId));
  const task=(async()=>{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
   try{
    const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:ctrl.signal});
    if(!response.ok){await response.body?.cancel?.();throw err(response.status===429?'EPA FRS temporarily rate-limited':'EPA FRS not available',response.status===429?429:502);}
    const record=normalizeFrsRecord(await boundedJson(response),{registryId,fetchedAt:now().toISOString()});
    cache.set(registryId,{expires:Date.now()+300000,data:record});
    if(cache.size>80)cache.delete(cache.keys().next().value);
    return record;
   }catch(e){
    if(e?.name==='AbortError')throw err('EPA FRS request timed out',504);
    if(e?.status)throw e;
    throw err('EPA FRS provider unavailable',502);
   }finally{clearTimeout(timer);}
  })();
  pending.set(registryId,task);
  try{return copy(await task);}finally{pending.delete(registryId);}
 }
 return {lookup,catalog:()=>({
  source:'EPA_FRS_PUBLIC_REST',keyRequired:false,
  endpoint:'https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities',
  documentation:DOCS,query:'Exact Registry ID only; no arbitrary URL or unbounded facility search',
  verifiedRelation:'EPA registry identity; NAD83 coordinate if returned',
  unverifiedRelations:['SEC CIK owner','facility operating entity','event-specific damage','historical asset ownership'],
  historicalAsOfEligible:false
 })};
}
const TEST_METERS=1000;
export function adversarialFacilityReview({asset,frs,asOf=null}={}){
 if(!asset||!frs||typeof asset!=='object')throw err('A local facility claim and an EPA FRS lookup are required');
 if(asOf!==null&&!validDay(asOf))throw err('Invalid historical cutoff');
 const issues=[],record=frs.record;
 const challenge=(id,priority,observation,request)=>issues.push({id,priority,observation,requiredProof:request,
  disposition:'OPEN',resolvedByIndependentEvidence:false});
 let distanceKm=null,locationStatus='NO_OFFICIAL_COORDINATE';
 if(!record){
  locationStatus='EPA_REGISTRY_ID_NOT_RESOLVED';
  challenge('EPA_ID_NOT_FOUND','HIGH','No exact EPA FRS record was returned for the specified registry ID.',
   'Find an official FRS registry identity and confirm it names the actual site.');
 }else{
  if(record.latitude===null||record.longitude===null){
   challenge('EPA_COORDINATE_MISSING','HIGH','Official EPA FRS response did not include a usable site coordinate.',
    'Obtain an official site point/polygon from a second authoritative source.');
  }else{
   distanceKm=greatCircleKm(record,{latitude:asset.latitude,longitude:asset.longitude});
   locationStatus=distanceKm<=1?'OFFICIAL_SITE_COORDINATE_CONSISTENT':'OFFICIAL_SITE_COORDINATE_CONFLICT';
   if(distanceKm>1)challenge('SITE_COORDINATE_CONFLICT','CRITICAL',
    'Analyst coordinate is '+distanceKm+' km from the EPA FRS point (threshold 1 km).',
    'Reconcile coordinate datum, street/site identity and point accuracy before association.');
  }
  const name=(x)=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(name(record.facilityName)!==name(asset.assetName)){
   challenge('FACILITY_NAME_VARIANT','MEDIUM','Local asset label differs from EPA FRS facility name.',
    'Corroborate alternate names with exact source IDs and effective-date legal identities; similarity is not ownership proof.');
  }
 }
 challenge('ISSUER_OPERATOR_NOT_PROVEN','CRITICAL',
  'An SEC business-activity excerpt and EPA facility name do not independently establish legal owner/operator ↔ public company CIK.',
  'Obtain a dated SEC subsidiary/property table or official corporate operator filing naming the facility and legal entity, with traceable CIK bridge.');
 challenge('HISTORICAL_FIRST_AVAILABLE_UNKNOWN','HIGH',
  'EPA current records and manually supplied filing dates do not establish original as-of availability.',
  'Obtain original publication/vintage/revision records and effective operating dates, then test the cutoff.');
 challenge('OPERATIONAL_AND_FINANCIAL_EFFECT_UNKNOWN','HIGH',
  'An officially identified facility and a geographic event do not establish shutdown, damage, earnings sensitivity or market returns.',
  'Require independently issued site-operation/disruption evidence and documented financial materiality.');
 if(asOf&&(asset.issuerFilingDate>asOf||asset.geoEvidenceDate>asOf))
  challenge('SOURCE_DATE_AFTER_AS_OF','CRITICAL',
   'At least one entered source publication date follows the requested research cutoff.',
   'Exclude the source from the proposed historical replay, or select a later valid evidence date.');
 return {schemaVersion:1,subject:{assetId:asset.id||null,symbol:asset.symbol,cik:asset.cik,assetName:asset.assetName,
   epaRegistryId:frs.registryId},
  epaStatus:frs.status,epaSourceFetchedAt:frs.fetchedAt,epaCurrentRevisionOnly:true,
  locationStatus,distanceKm,locationThresholdKm:TEST_METERS/1000,
  officialFacilityIdentityObserved:frs.status==='FOUND',
  verifiedSecOperatorLink:false,verifiedCurrentOperations:false,verifiedHistoricalExposure:false,
  verifiedIssuerFinancialEffect:false,estimatedLoss:null,causalAttribution:null,
  outcome:'RESEARCH_GAPS_REQUIRE_INDEPENDENT_CORROBORATION',
  critic:{mode:'DETERMINISTIC_EVIDENCE_CHALLENGER_NOT_AI_AGENT',issueCount:issues.length,
   critical:issues.filter(x=>x.priority==='CRITICAL').length,challenges:issues,
   canOverridePrimaryResearch:false,canApproveVerifiedLink:false},
  limitations:['Proximity and metadata alignment do not establish ownership, actual hazard intensity, loss or forecast accuracy.',
   'No language model, independent adversarial search worker or cross-agent debate has been executed.']};
}
export function createFacilityVerificationApi({lookup,assets}={}){
 if(!lookup||!assets)throw new TypeError('EPA FRS lookup and local asset list providers are required');
 const send=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/facility-verification/'))return false;
  try{
   if(req.method!=='GET')throw err('Facility source inspection is read-only',405);
   const route=url.pathname.slice('/api/facility-verification/'.length),q=url.searchParams;
   if(route==='catalog'&&q.size===0){send(res,200,lookup.catalog());return true;}
   if(route==='lookup'&&q.size===1&&q.has('registryId')){
    send(res,200,await lookup.lookup(q.get('registryId')));return true;}
   if(route==='challenge'&&q.has('registryId')&&q.has('assetId')&&
    [...q.keys()].every(x=>['assetId','registryId','asOf'].includes(x)&&q.getAll(x).length===1)){
    // Lookup and sensitive asset record are server-side, never passed as an untrusted client graph.
    const list=await assets(),asset=list.assets?.find(x=>x.id===q.get('assetId'));
    if(!asset)throw err('The local source-linked asset claim was not found',404);
    const frs=await lookup.lookup(q.get('registryId'));
    send(res,200,adversarialFacilityReview({asset,frs,asOf:q.get('asOf')}));return true;
   }
   throw err('Unknown or unsupported facility verification endpoint',404);
  }catch(e){send(res,[400,404,405,429,502,503,504].includes(e.status)?e.status:502,
   {error:e.status?e.message:'Official facility verification unavailable'});}
  return true;
 };
}
