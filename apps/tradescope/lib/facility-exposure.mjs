/**
 * v0.37 — Company / Facility Exposure Crosswalk
 * Uses fixed official EPA FRS and SEC EDGAR identity metadata endpoints.
 * All company↔facility links remain operator claims, never verified ownership.
 * Geographic proximity is not evidence of physical loss, economic materiality or stock movement.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const str=(v,max=180)=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const frsId=x=>typeof x==='string'&&/^\d{12}$/.test(x);
const cikId=x=>typeof x==='string'&&/^\d{1,10}$/.test(x);
const canonCik=x=>String(BigInt(x)).padStart(10,'0');
const officialSecUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&
 ['www.sec.gov','sec.gov'].includes(u.hostname)&&u.pathname.startsWith('/Archives/edgar/data/')&&
 !u.username&&!u.password&&!u.port&&!u.hash&&u.href.length<=600?u.href:null;
 }catch{return null;}};
const geo=(lat,lon)=>lat!==null&&lon!==null&&lat!==undefined&&lon!==undefined&&String(lat).trim()!==''&&String(lon).trim()!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&
 Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180?[Number(lon),Number(lat)]:null;
const distanceKm=(p,q)=>{
 const rad=Math.PI/180,la1=p[1]*rad,la2=q[1]*rad;
 const a=Math.sin((q[1]-p[1])*rad/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((q[0]-p[0])*rad/2)**2;
 return Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))*10)/10;
};
const EPA_URL='https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities';
const SEC_URL='https://data.sec.gov/submissions/';
export const EXPOSURE_VERSION='FACILITY-CROSSWALK-0.37.1';
export const EXPOSURE_LIMIT_KM=250;
export const RELATIONSHIP_TYPES=Object.freeze(['POTENTIAL_OWNER','POTENTIAL_OPERATOR','POTENTIAL_SUPPLIER','POTENTIAL_CUSTOMER']);
async function fixedJson(url,{fetchImpl=globalThis.fetch,maxBytes=200000,timeoutMs=9000,
 userAgent='ResearchOS-LocalFacilityResearch/0.37 contact via repository'}={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:ctrl.signal,
   headers:{Accept:'application/json','User-Agent':userAgent},cache:'no-store'});
  if(!response?.ok)throw fail('Official provider query unavailable',503);
  const type=response.headers?.get?.('content-type')||'application/json';
  if(!/json/i.test(type))throw fail('Unexpected official provider content format',502);
  if(Number(response.headers?.get?.('content-length')||0)>maxBytes)
   throw fail('Official provider response exceeded size bound',413);
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')
   throw fail('Official provider returned no bounded stream',503);
  const bufs=[];let count=0;
  for await(const chunk of response.body){
   if(!(chunk instanceof Uint8Array))throw fail('Malformed official provider bytes',503);
   count+=chunk.byteLength;if(count>maxBytes){ctrl.abort();throw fail('Official provider response exceeded streamed limit',413);}
   bufs.push(Buffer.from(chunk));
  }
  const bytes=Buffer.concat(bufs);
  try{return {json:JSON.parse(bytes.toString('utf8')),sha256:createHash('sha256').update(bytes).digest('hex'),
   responseBytes:bytes.byteLength};}
  catch{throw fail('Official provider JSON malformed',502);}
 }catch(e){if(e?.status)throw e;throw fail('Official provider response unavailable',503);}
 finally{clearTimeout(timer);}
}
function epaCandidates(payload){
 if(Array.isArray(payload))return payload;
 const direct=[payload?.FRSFacilities?.FRSFacility,payload?.FRSFacilities?.Facility,
  payload?.Facilities?.Facility,payload?.Facilities?.FRSFacility,
  payload?.FRSFacility,payload?.facilities,payload?.results,payload?.Results];
 for(const v of direct){if(Array.isArray(v))return v;if(v&&typeof v==='object'&&
  (v.RegistryId||v.registryId))return[v];}
 return payload&&(payload.RegistryId||payload.registryId)?[payload]:[];
}
export function normalizeFrs(payload,registryId){
 if(!frsId(registryId))throw fail('EPA FRS Registry ID must contain 12 digits');
 const items=epaCandidates(payload);
 if(items.length>50)throw fail('FRS identity query returned an unbounded response',502);
 const exact=items.filter(x=>String(x?.RegistryId??x?.registryId??'')===registryId);
 if(exact.length!==1)throw fail('EPA FRS registry ID not uniquely resolved; no facility saved',502);
 const record=exact[0],location=geo(record.Latitude83??record.latitude83??record.latitude,
  record.Longitude83??record.longitude83??record.longitude);
 if(!location||!str(record.FacilityName??record.facilityName,180))
  throw fail('EPA FRS record lacks unambiguous coordinates or facility name',502);
 return {registryId,facilityName:str(record.FacilityName??record.facilityName,180),
  location,address:[record.LocationAddress,record.CityName,record.StateAbbr,record.ZipCode]
   .map(x=>str(x,100)).filter(Boolean).join(', ').slice(0,240),
  coordinateDatum:'NAD83_PROVIDER_REPORTED',coordinatesIndependentlySurveyed:false,
  facilityRegistryIdentity:'EPA_FRS_SOURCE_REPORTED',
  providerUrl:EPA_URL+'?registry_id='+registryId+'&output=JSON',
  operatorConfirmed:false,ownershipVerified:false};
}
export function normalizeSec(payload,cik){
 if(!cikId(cik))throw fail('SEC CIK must contain 1 to 10 digits');
 const requested=canonCik(cik);
 const received=payload?.cik;
 if(received===null||received===undefined||!/^[0-9]{1,10}$/.test(String(received))||
  !Number.isSafeInteger(Number(received))||canonCik(String(received))!==requested||!str(payload?.name,200))
  throw fail('SEC entity CIK/name mismatch or missing',502);
 const tickers=Array.isArray(payload.tickers)?
  payload.tickers.filter(x=>typeof x==='string'&&/^[A-Z0-9.-]{1,12}$/.test(x)).slice(0,12):[];
 return {cik:requested,companyName:str(payload.name,200),tickers,
  sourceUrl:SEC_URL+'CIK'+requested+'.json',publicTickerAssociation:'SEC_REPORTED',
  ownershipOfAnyFacilityVerified:false};
}
export async function fetchFrs(registryId,{fetchImpl=globalThis.fetch,userAgent}={}){
 if(!frsId(registryId))throw fail('Invalid EPA FRS ID');
 const url=EPA_URL+'?registry_id='+registryId+'&output=JSON';
 const result=await fixedJson(url,{fetchImpl,maxBytes:500000,userAgent});
 return {...normalizeFrs(result.json,registryId),bodySha256:result.sha256,responseBytes:result.responseBytes};
}
export async function fetchSec(cik,{fetchImpl=globalThis.fetch,userAgent}={}){
 if(!cikId(cik))throw fail('Invalid SEC CIK');
 const url=SEC_URL+'CIK'+canonCik(cik)+'.json';
 const result=await fixedJson(url,{fetchImpl,maxBytes:1800000,userAgent});
 return {...normalizeSec(result.json,cik),bodySha256:result.sha256,responseBytes:result.responseBytes};
}
function verifyDocument(doc,maxEntries){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.entries)||doc.entries.length>maxEntries)
  throw fail('Facility crosswalk journal schema invalid',500);
 let previous='GENESIS';const ids=new Set();
 for(const [i,e] of doc.entries.entries()){
  if(!e||e.seq!==i||typeof e.id!=='string'||!/^crosswalk-[0-9a-f-]{36}$/i.test(e.id)||
   ids.has(e.id)||!iso(e.capturedAt)||e.previousHash!==previous||
   !['FACILITY','COMPANY','RELATIONSHIP'].includes(e.type)||!e.value||typeof e.value!=='object'||
   e.hash!==hash({id:e.id,seq:e.seq,capturedAt:e.capturedAt,previousHash:e.previousHash,type:e.type,value:e.value})||
   (i>0&&e.capturedAt<doc.entries[i-1].capturedAt))
   throw fail('Facility crosswalk journal integrity cannot be verified',500);
  ids.add(e.id);previous=e.hash;
 }
 return doc;
}
export function buildExposureCandidates({facilities,companies,relationships,events,asOf,limitKm=EXPOSURE_LIMIT_KM}={}){
 if(!iso(asOf)||!Array.isArray(facilities)||!Array.isArray(companies)||
 !Array.isArray(relationships)||!Array.isArray(events)||!Number.isFinite(limitKm)||limitKm<1||limitKm>500)
  throw fail('Invalid exposure evaluation inputs');
 const byCompany=new Map(companies.map(x=>[x.cik,x]));
 const assoc=new Map();
 for(const r of relationships){if(!assoc.has(r.registryId))assoc.set(r.registryId,[]);
  if(byCompany.has(r.cik))assoc.get(r.registryId).push({...r,company:byCompany.get(r.cik)});}
 const results=[];
 for(const ev of events){
  const point=ev.location;if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||
   !iso(ev.firstObservedAt)||ev.firstObservedAt>asOf)continue;
  for(const fac of facilities){
   if(!Array.isArray(fac.location)||!iso(fac.capturedAt)||fac.capturedAt>asOf)continue;
   const km=distanceKm(point,fac.location);
   if(km>limitKm)continue;
   const claims=assoc.get(fac.registryId)||[];
   results.push({eventId:ev.id,eventSource:ev.source,eventType:ev.type,eventFirstSeenAt:ev.firstObservedAt,
    facilityId:fac.registryId,facilityName:fac.facilityName,facilityCapturedAt:fac.capturedAt,
    distanceKm:km,searchRadiusKm:limitKm,
    links:claims.filter(x=>iso(x.capturedAt)&&x.capturedAt<=asOf).map(x=>({
     cik:x.cik,companyName:x.company.companyName,tickers:x.company.tickers,
     claimedRelationship:x.relationshipType,evidenceUrl:x.evidenceUrl,
     claimCapturedAt:x.capturedAt,ownershipVerified:false})),
    resultClass:'GEOGRAPHIC_CANDIDATE_ONLY',siteDamageVerified:false,
    ownershipVerified:false,issuerEconomicImpactVerified:false,
    economicLossEstimate:null,sharePriceEffect:null,
    antiAgentFlags:['GEOGRAPHY_DOES_NOT_PROVE_FACILITY_DAMAGE',
     'EPA_REGISTRY_NAME_DOES_NOT_PROVE_PUBLIC_ISSUER_OWNERSHIP',
     'SEC_CIK_DOES_NOT_PROVE_AFFILIATED_FACILITY',
     'SOURCE_CAPTURE_AS_OF_IS_NOT_ORIGINAL_PUBLICATION',
     'NO_MATERIALITY_OR_SUPPLY_CHAIN_FLOW_PROOF']});
  }
 }
 return results.sort((a,b)=>a.distanceKm-b.distanceKm||a.eventId.localeCompare(b.eventId)||a.facilityId.localeCompare(b.facilityId));
}
export function createFacilityExposure({collector,filename,fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString(),enabled=true,maxEntries=300,maxBytes=7000000,
 userAgent=process.env.SEC_USER_AGENT}={}){
 if(typeof collector?.list!=='function'||!path.isAbsolute(filename||'')||
  !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>2000||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>30000000)throw TypeError('Facility crosswalk requires local event collector and private absolute file');
 let doc=null,loading=null,queue=Promise.resolve();
 const stamp=()=>{const v=now();if(!iso(v))throw fail('Facility research clock invalid',503);return v;};
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>maxBytes)throw fail('Facility journal exceeds storage limit',500);
    const data=JSON.parse(await fs.readFile(filename,'utf8'));
    return doc=verifyDocument(data,maxEntries);
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,entries:[]};
    throw fail('Facility journal corrupted or unverifiable',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{const work=queue.then(async()=>{await load();return fn();});queue=work.catch(()=>{});return work;};
 async function write(type,value){
  if(doc.entries.length>=maxEntries)throw fail('Crosswalk journal capacity reached',409);
  const capturedAt=stamp();
  if(doc.entries.length&&capturedAt<doc.entries.at(-1).capturedAt)
   throw fail('Crosswalk clock reversed',409);
  const base={id:'crosswalk-'+randomUUID(),seq:doc.entries.length,capturedAt,type,value,
   previousHash:doc.entries.at(-1)?.hash||'GENESIS'};
  const entry={...base,hash:hash(base)};
  const next={schemaVersion:1,entries:[...doc.entries,entry]};
  const encoded=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(encoded)>maxBytes)throw fail('Crosswalk storage is full',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,encoded,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw fail('Cannot persist facility research journal',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  doc=next;return entry;
 }
 function projection(asOf){
  const entries=doc.entries.filter(e=>e.capturedAt<=asOf);
  const facilities=new Map(),companies=new Map(),links=[];
  for(const e of entries){
   if(e.type==='FACILITY')facilities.set(e.value.registryId,{...e.value,capturedAt:e.capturedAt});
   else if(e.type==='COMPANY')companies.set(e.value.cik,{...e.value,capturedAt:e.capturedAt});
   else if(e.type==='RELATIONSHIP')links.push({...e.value,capturedAt:e.capturedAt});
  }
  return {facilities:[...facilities.values()],companies:[...companies.values()],
   relationships:links};
 }
 const catalog=()=>({enabled,version:EXPOSURE_VERSION,
  sources:[{provider:'US_EPA_FRS',key:'12-digit Registry ID',url:EPA_URL},
   {provider:'US_SEC_EDGAR',key:'CIK',url:SEC_URL}],
  relationships:RELATIONSHIP_TYPES,defaultRadiusKm:EXPOSURE_LIMIT_KM,
  sourceRecordsAreNotOwnershipProof:true,
  note:'EPA identifies reported facility metadata; SEC identifies filers. Neither independently certifies company facility ownership or effects of a nearby event.'});
 async function captureFacility({registryId}={}){
  if(!enabled)throw fail('Facility research disabled on nonloopback host',403);
  if(!frsId(registryId))throw fail('EPA FRS Registry ID must be 12 digits');
  return serial(async()=>{
   const result=await fetchFrs(registryId,{fetchImpl,userAgent});
   const value={...result,sourceClass:'EPA_FRS_OFFICIAL_METADATA',relationshipVerified:false};
   const existing=doc.entries.findLast(e=>e.type==='FACILITY'&&e.value.registryId===registryId);
   if(existing&&hash(existing.value)===hash(value))return {deduplicated:true,record:existing};
   return {deduplicated:false,record:await write('FACILITY',value)};
  });
 }
 async function captureCompany({cik}={}){
  if(!enabled)throw fail('Facility research disabled on nonloopback host',403);
  if(!cikId(cik))throw fail('SEC CIK must be numeric up to 10 digits');
  return serial(async()=>{
   const result=await fetchSec(cik,{fetchImpl,userAgent});
   const value={...result,sourceClass:'SEC_EDGAR_OFFICIAL_METADATA',relationshipVerified:false};
   const existing=doc.entries.findLast(e=>e.type==='COMPANY'&&e.value.cik===value.cik);
   if(existing&&hash(existing.value)===hash(value))return {deduplicated:true,record:existing};
   return {deduplicated:false,record:await write('COMPANY',value)};
  });
 }
 async function linkCompany({registryId,cik,relationshipType,evidenceUrl,rationale}={}){
  if(!enabled)throw fail('Facility research disabled on nonloopback host',403);
  if(!frsId(registryId)||!cikId(cik)||!RELATIONSHIP_TYPES.includes(relationshipType)||
   !officialSecUrl(evidenceUrl)||typeof rationale!=='string'||rationale.trim().length<25||
   rationale.length>600)throw fail('Provide archived EPA and SEC entities, a relationship type, SEC filing URL and bounded research rationale');
  return serial(async()=>{
   const key=canonCik(cik),view=projection(stamp());
   if(!view.facilities.some(x=>x.registryId===registryId)||
      !view.companies.some(x=>x.cik===key))throw fail('Both official metadata records must be captured before linking',409);
   const value={registryId,cik:key,relationshipType,evidenceUrl:officialSecUrl(evidenceUrl),
    rationale:str(rationale,600),status:'HUMAN_CLAIM_UNVERIFIED',
    ownershipVerified:false,relationshipContentIndependentlyChecked:false};
   const existing=doc.entries.find(e=>e.type==='RELATIONSHIP'&&hash(e.value)===hash(value));
   if(existing)return {deduplicated:true,record:existing};
   return {deduplicated:false,record:await write('RELATIONSHIP',value)};
  });
 }
 async function view({asOf=null,eventId=null,radiusKm=EXPOSURE_LIMIT_KM}={}){
  if(!enabled)throw fail('Private facility research disabled on nonloopback host',403);
  const cutoff=asOf||stamp();
  if(!iso(cutoff)||cutoff>stamp()||!Number.isFinite(radiusKm)||radiusKm<1||radiusKm>500||
   (eventId!==null&&(typeof eventId!=='string'||!/^(USGS|NASA_EONET|FAA_NAS_STATUS):[A-Za-z0-9_.:-]{1,150}$/.test(eventId))))
   throw fail('Invalid facility research cutoff, radius or source event identifier');
  await queue;await load();
  const snapshot=projection(cutoff);
  const eventResponse=await collector.list({asOf:cutoff,limit:200});
  if(eventResponse.isPartial)throw fail('Local source-event archive exceeds 200 items; narrow event scope before evaluating',409);
  const events=eventId?eventResponse.events.filter(e=>e.id===eventId):eventResponse.events;
  return {schemaVersion:1,ruleVersion:EXPOSURE_VERSION,asOf:cutoff,
   ...snapshot,events:eventResponse.events.map(x=>({id:x.id,source:x.source,title:x.title,
    firstObservedAt:x.firstObservedAt,location:x.location,eventTime:x.eventTime})),
   candidates:buildExposureCandidates({...snapshot,events,asOf:cutoff,limitKm:radiusKm}).slice(0,200),
   note:'Nearby facility plus asserted company relationship is a research lead, not verified ownership, asset damage, supply-chain disruption, or financial impact.',
   measuredEconomicImpact:null,verifiedOwnershipCount:0};
 }
 async function close(){await queue;}
 return {catalog,captureFacility,captureCompany,linkCompany,view,close};
}
const respond=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
export function createFacilityExposureApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/facility-exposure/'))return false;
  const op=url.pathname.slice('/api/facility-exposure/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)respond(res,200,service.catalog());
    else if(op==='view'){
     if([...url.searchParams.keys()].some(k=>!['asOf','eventId','radiusKm'].includes(k)||
       url.searchParams.getAll(k).length!==1))throw fail('Unsupported facility query');
     respond(res,200,await service.view({asOf:url.searchParams.get('asOf')||null,
      eventId:url.searchParams.get('eventId')||null,
      radiusKm:url.searchParams.has('radiusKm')?Number(url.searchParams.get('radiusKm')):EXPOSURE_LIMIT_KM}));
    }else throw fail('Unknown facility research query',404);
   }else if(req.method==='POST'&&['facility','company','link'].includes(op)&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
      req.headers['x-researchos-facility-research']!=='1'||
      req.headers['sec-fetch-site']==='cross-site'||
      (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw fail('Explicit same-origin loopback research required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw fail('JSON required for facility research',415);
    let text='',count=0;
    for await(const part of req){count+=part.length;if(count>1600)throw fail('Research input too large',413);text+=part;}
    let args;try{args=JSON.parse(text);}catch{throw fail('Invalid JSON input');}
    const allowed=op==='facility'?['registryId']:op==='company'?['cik']:
     ['registryId','cik','relationshipType','evidenceUrl','rationale'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(x=>!allowed.includes(x)))
     throw fail('Unsupported facility research parameters');
    respond(res,200,op==='facility'?await service.captureFacility(args):
     op==='company'?await service.captureCompany(args):await service.linkCompany(args));
   }else throw fail('Unsupported facility research method',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,503].includes(e?.status)?e.status:503;
   respond(res,status,{error:e?.status?e.message:'Facility research unavailable'});
  }
  return true;
 };
}
