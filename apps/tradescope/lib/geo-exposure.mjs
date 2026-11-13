/**
 * v0.25 Geo/issuer exposure research.
 * USGS earthquake events are public revised observations, NOT measured site shaking/damage.
 * Facility geo/owner input is an unverified LOCAL ANALYST CLAIM with separate SEC and location
 * source references; proximity screening NEVER produces a validated loss or issuer impact.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {companyProfiles} from './commodity-platform.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const ID=/^[A-Za-z][A-Za-z0-9._-]{1,49}$/;
const ISSUERS=Object.freeze([
 {symbol:'MOS',cik:'0001285785'},
 {symbol:'CF',cik:'0001324404'},
 {symbol:'IPI',cik:'0001421461'}
]);
const USGS='USGS_COMCAT_RECENT_GEOJSON';
const URLS=Object.freeze({
 '4.5_week':'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
 '4.5_month':'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
 'significant_month':'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson'
});
const OFFICIAL_ASSET_HOSTS=new Set(['www.sec.gov','www.eia.gov','www.usgs.gov','earthquake.usgs.gov',
 'www.epa.gov','echo.epa.gov','ofmpub.epa.gov','www.noaa.gov','www.nrcs.usda.gov']);
function officialUrl(s,mode='asset'){
 try{
  const u=new URL(s);
  const hosts=mode==='event'?new Set(['earthquake.usgs.gov']):OFFICIAL_ASSET_HOSTS;
  return u.protocol==='https:'&&hosts.has(u.hostname)&&!u.username&&!u.password&&
   !u.search&&!u.hash&&u.href.length<=500?u.href:null;
 }catch{return null;}
}
const clean=(x,n=180)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=n&&
 !/[\u0000-\u001f<>]/.test(x)?x.trim():null;
const clone=x=>structuredClone(x);
function dateTime(millis){return Number.isSafeInteger(millis)&&millis>0&&millis<Date.now()+86400000?
 new Date(millis).toISOString():null;}
export function normalizeUsgsEvents(raw,{tier='4.5_week',fetchedAt=new Date().toISOString()}={}){
 if(!Object.hasOwn(URLS,tier)||!raw||raw.type!=='FeatureCollection'||
  !Array.isArray(raw.features)||raw.features.length>1600||
  !Number.isSafeInteger(raw.metadata?.generated))throw fail('USGS GeoJSON feed schema mismatch',502);
 const items=[],seen=new Set();
 for(const f of raw.features){
  const coords=f?.geometry?.coordinates,properties=f?.properties,id=f?.id;
  if(f?.type!=='Feature'||f.geometry?.type!=='Point'||!Array.isArray(coords)||coords.length<2||
   !ID.test(id||'')||!finite(coords[0])||!finite(coords[1])||
   coords[0]<-180||coords[0]>180||coords[1]<-90||coords[1]>90||
   !finite(properties?.mag)||properties.mag<0||properties.mag>11||
   !dateTime(properties.time)||!dateTime(properties.updated)||
   !officialUrl(properties.url,'event'))throw fail('USGS event is missing safe official point metadata',502);
  if(seen.has(id))throw fail('USGS event feed has duplicate IDs',502);
  seen.add(id);
  items.push({id,source:USGS,longitude:coords[0],latitude:coords[1],
   depthKm:finite(coords[2])?coords[2]:null,magnitude:properties.mag,
   place:clean(properties.place,150)||'Unnamed USGS event',occurredAt:dateTime(properties.time),
   providerUpdatedAt:dateTime(properties.updated),
   sourceUrl:officialUrl(properties.url,'event'),
   interpretation:'EPICENTER_ONLY_NOT_SHAKING_INTENSITY_OR_SITE_DAMAGE',
   publicationClockVerified:false,hasVerifiedIssuerLink:false});
 }
 return {source:USGS,tier,sourceUrl:URLS[tier],fetchedAt,
  providerGeneratedAt:dateTime(raw.metadata.generated),
  currentRevisionOnly:true,historicalAsOfEligible:false,
  events:items.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,200),
  coverage:{returned:raw.features.length,displayed:Math.min(items.length,200),
   truncated:raw.features.length>200},
  limitations:['USGS event coordinates represent an epicenter, not local shaking or insured/financial damage.',
   'Current USGS feed can be revised. Original publication and revision history have not been independently archived.',
   'Distance to an epicenter is a triage screen only and cannot validate operational disruption or company exposure.']};
}
async function boundedJson(response,limit=1250000){
 const len=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(len)&&len>limit)throw fail('USGS payload too large',502);
 const mime=response.headers?.get?.('content-type')||'';
 if(mime&&!mime.toLowerCase().includes('json'))throw fail('Unexpected USGS response type',502);
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit){await reader.cancel();throw fail('USGS payload too large',502);}
    chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('USGS JSON unavailable',502);}
 }
 const text=await response.text();if(Buffer.byteLength(text)>limit)throw fail('USGS payload too large',502);
 try{return JSON.parse(text);}catch{throw fail('USGS JSON unavailable',502);}
}
export function createUsgsEventFeed({fetchImpl=fetch,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 async function recent(tier='4.5_week'){
  if(!Object.hasOwn(URLS,tier))throw fail('Choose approved USGS feed');
  if(cache.get(tier)?.expires>Date.now())return clone(cache.get(tier).data);
  if(pending.has(tier))return clone(await pending.get(tier));
  const task=(async()=>{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
   try{
    const response=await fetchImpl(URLS[tier],{method:'GET',headers:{Accept:'application/geo+json,application/json'},
     redirect:'error',signal:ctrl.signal});
    if(!response.ok){await response.body?.cancel?.();
     throw fail(response.status===429?'USGS feed rate limited':'USGS observations unavailable',response.status===429?429:502);}
    const data=normalizeUsgsEvents(await boundedJson(response),{tier,fetchedAt:now().toISOString()});
    cache.set(tier,{data,expires:Date.now()+120000});return data;
   }catch(e){if(e.name==='AbortError')throw fail('USGS data request timed out',504);
    if(e.status)throw e;throw fail('USGS events currently unavailable',502);
   }finally{clearTimeout(timer);}
  })();
  pending.set(tier,task);
  try{return clone(await task);}finally{pending.delete(tier);}
 }
 return {recent,catalog(){return {source:USGS,feedTiers:Object.keys(URLS),
  authentication:'NO_KEY_FOR_PUBLIC_FEED',currentRevisionOnly:true,
  screeningOnly:true,sourceDocumentation:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php'};}};
}
export function normalizeAssetClaim(input,{now=()=>new Date()}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Asset record must be a structured object');
 const keys=Object.keys(input),allowed=new Set(['symbol','cik','assetName','assetType','country',
  'latitude','longitude','issuerFilingUrl','issuerFilingDate','issuerExcerpt','geoEvidenceUrl',
  'geoEvidenceDate','geoExcerpt','notes']);
 if(keys.some(x=>!allowed.has(x)))throw fail('Asset claim contains unknown or prohibited fields');
 const issuer=ISSUERS.find(x=>x.symbol===input.symbol&&x.cik===input.cik);
 if(!issuer)throw fail('Issuer must match an existing SEC-linked pilot identity');
 const assetName=clean(input.assetName,120),country=clean(input.country,80),
  assetType=clean(input.assetType,60),
  issuerExcerpt=clean(input.issuerExcerpt,420),geoExcerpt=clean(input.geoExcerpt,420);
 if(!assetName||!country||!assetType||!issuerExcerpt||!geoExcerpt||
  !finite(input.latitude)||!finite(input.longitude)||input.latitude< -90||
  input.latitude>90||input.longitude< -180||input.longitude>180||
  !officialUrl(input.issuerFilingUrl)||new URL(input.issuerFilingUrl).hostname!=='www.sec.gov'||
  !officialUrl(input.geoEvidenceUrl)||!day(input.issuerFilingDate)||!day(input.geoEvidenceDate)||
  input.issuerFilingDate>now().toISOString().slice(0,10)||
  input.geoEvidenceDate>now().toISOString().slice(0,10))
  throw fail('Claim requires issuer filing, separately dated coordinate evidence and valid geographic coordinates');
 return {symbol:issuer.symbol,cik:issuer.cik,assetName,assetType,country,
  latitude:input.latitude,longitude:input.longitude,issuerFilingUrl:input.issuerFilingUrl,
  issuerFilingDate:input.issuerFilingDate,issuerExcerpt,
  geoEvidenceUrl:input.geoEvidenceUrl,geoEvidenceDate:input.geoEvidenceDate,geoExcerpt,
  notes:clean(input.notes,350),
  evidenceStatus:'ANALYST_SUBMITTED_UNVERIFIED',independentlyVerified:false,
  historicalFirstAvailableVerified:false,operationsVerified:false};
}
export function greatCircleKm(a,b){
 const radius=6371.0088,rad=v=>v*Math.PI/180;
 if(![a.latitude,a.longitude,b.latitude,b.longitude].every(finite))throw fail('Coordinates required');
 const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
 const k=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
 return Math.round(radius*2*Math.asin(Math.sqrt(Math.min(1,k)))*10)/10;
}
export function createExposureRegistry({filename,now=()=>new Date(),maxAssets=120}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new TypeError('Absolute local registry path required');
 let serial=Promise.resolve();
 const work=fn=>{const t=serial.then(fn);serial=t.catch(()=>{});return t;};
 async function read(){
  let x;
  try{x=JSON.parse(await fs.readFile(filename,'utf8'));}
  catch(e){if(e.code==='ENOENT')return {version:1,revision:0,assets:[]};
   throw fail('Local exposure registry unreadable; no automatic reset',409);}
  if(x?.version!==1||!Number.isSafeInteger(x.revision)||x.revision<0||
   !Array.isArray(x.assets)||x.assets.length>maxAssets||x.assets.some(a=>
    typeof a.id!=='string'||!ID.test(a.id)||!a.claim||a.claim.evidenceStatus!=='ANALYST_SUBMITTED_UNVERIFIED'||
    a.claim.independentlyVerified!==false))throw fail('Local exposure registry schema mismatch',409);
  return x;
 }
 async function list(){
  return work(async()=>{const db=await read();return {version:db.version,revision:db.revision,
   assets:db.assets.map(a=>({id:a.id,createdAt:a.createdAt,evidenceHash:a.evidenceHash,...clone(a.claim)})),
   total:db.assets.length,security:'LOCAL_ANALYST_EVIDENCE_ONLY_NOT_INDEPENDENTLY_VERIFIED'};});
 }
 async function add(input){
  const claim=normalizeAssetClaim(input,{now});
  return work(async()=>{
   const db=await read();
   if(db.assets.length>=maxAssets)throw fail('Exposure asset registry capacity reached',409);
   const normalizedHash=sha(claim),duplicate=db.assets.find(x=>x.evidenceHash===normalizedHash);
   if(duplicate)return {status:'ALREADY_SUBMITTED',id:duplicate.id,revision:db.revision};
   const item={id:'asset-'+randomUUID(),createdAt:now().toISOString(),evidenceHash:normalizedHash,claim};
   db.assets.push(item);db.revision++;
   await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
   const tmp=filename+'.'+randomUUID()+'.tmp';
   try{await fs.writeFile(tmp,JSON.stringify(db),{encoding:'utf8',flag:'wx',mode:0o600});
    await fs.rename(tmp,filename);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
   return {status:'RECORDED_UNVERIFIED',id:item.id,revision:db.revision};
  });
 }
 return {list,add};
}
export function proximityScreen(event,assets,{radiusKm=100,asOf=null}={}){
 if(![25,50,100,250].includes(radiusKm))throw fail('Select a bounded proximity screen');
 if(asOf!==null&&!day(asOf))throw fail('Choose a valid calendar cutoff');
 const matches=[];
 for(const asset of assets){
  const priorToCutoff=asOf&&asset.issuerFilingDate<=asOf&&asset.geoEvidenceDate<=asOf;
  if(asOf&&!priorToCutoff)continue;
  const km=greatCircleKm({latitude:event.latitude,longitude:event.longitude},
   {latitude:asset.latitude,longitude:asset.longitude});
  if(km>radiusKm)continue;
  matches.push({assetId:asset.id,assetName:asset.assetName,symbol:asset.symbol,cik:asset.cik,
   distanceKm:km,issuerFilingUrl:asset.issuerFilingUrl,geoEvidenceUrl:asset.geoEvidenceUrl,
   assetEvidenceStatus:'ANALYST_SUBMITTED_UNVERIFIED',
   screenStatus:'EPICENTER_PROXIMITY_CANDIDATE_NOT_SHAKING_OR_LOSS',
   independentDamageVerification:false,issuerImpactVerified:false,estimatedFinancialLoss:null,
   historicalEligibility:asOf?'HISTORICAL_FIRST_AVAILABLE_NOT_VERIFIED':'CURRENT_FEED_ONLY'});
 }
 return matches.sort((x,y)=>x.distanceKm-y.distanceKm).slice(0,100);
}
export function createGeoExposureService({events=createUsgsEventFeed(),registry=null,
 profiles=companyProfiles,now=()=>new Date()}={}){
 function catalog(){
  const disclosed=['potash','urea','phosphate'].flatMap(commodity=>profiles(commodity,{asOf:now().toISOString().slice(0,10)}))
   .filter((x,i,a)=>a.findIndex(y=>x.symbol===y.symbol)===i)
   .map(x=>({symbol:x.symbol,cik:x.cik,company:x.company,commodities:x.commodities,
    geographies:x.geographies,filingDate:x.filingDate,sourceUrl:x.sourceUrl,
    evidenceStatus:'SOURCE_REFERENCED_BUSINESS_ACTIVITY_UNREVALIDATED',
    facilityCoordinates:null,eventSpecificExposureVerified:false}));
  return {version:1,source:'USGS_COMCAT_RECENT_GEOJSON',facilitiesRegisteredByAnalyst:registry!==null,
   issuerBusinessProfiles:disclosed,feed:events.catalog(),
   disclaimers:['Country-level issuer activities from SEC filing references do not establish coordinates or ownership of any site.',
    'Local facility claims are unverified until independent document and coordinate checks.',
    'Epicenter proximity does not measure shaking, physical damage, insurance loss or stock impact.',
    'Recent USGS data is currently revised and is NOT historical-as-of evidence.']};
 }
 async function listing(){return registry?registry.list():{version:1,revision:0,assets:[],total:0,
  security:'REGISTRY_NOT_ENABLED_LOCAL_OPT_IN_REQUIRED'};}
 async function screen({tier='4.5_week',eventId,radiusKm=100,asOf=null}={}){
  if(typeof eventId!=='string'||!ID.test(eventId))throw fail('Select a valid observed USGS event ID');
  if(![25,50,100,250].includes(radiusKm))throw fail('Select a supported radius');
  if(asOf!==null&&!day(asOf))throw fail('Invalid as-of cutoff');
  const feed=await events.recent(tier),event=feed.events.find(x=>x.id===eventId);
  if(!event)throw fail('Event ID not present in current source feed',404);
  const stored=await listing();
  return {source:feed.source,event,screeningRadiusKm:radiusKm,requestedAsOf:asOf,
   facilityClaims:stored.total,
   observedCurrentFeed:true,historicalAsOfEligible:false,
   matches:proximityScreen(event,stored.assets,{radiusKm,asOf}),
   warning:'Proximity reflects epicenter distance only; independently verify shaking intensity, actual asset ownership, operations, and financial materiality.'};
 }
 return {catalog,listing,screen,events,record:input=>{
  if(!registry)throw fail('Local asset claim capture is not enabled',403);
  return registry.add(input);
 }};
}
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
export function createGeoExposureApi({service,writeEnabled=false}={}){
 if(!service)throw new TypeError('Geographic exposure service required');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/geo-exposure/'))return false;
  try{
   const op=url.pathname.slice('/api/geo-exposure/'.length),q=url.searchParams;
   if(op==='assets'&&req.method==='POST'&&q.size===0){
    if(!writeEnabled)throw fail('Local asset recording is disabled',403);
    const origin=req.headers.origin;
    let parsed;
    try{parsed=new URL(origin);}catch{throw fail('Same-origin browser request required',403);}
    if(!['http:','https:'].includes(parsed.protocol)||parsed.host!==req.headers.host||
     req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
     throw fail('Same-origin JSON request required',403);
    let body='';for await(const chunk of req){body+=chunk.toString('utf8');
     if(Buffer.byteLength(body)>6500)throw fail('Local asset evidence payload too large',413);}
    let data;try{data=JSON.parse(body);}catch{throw fail('Expected structured JSON asset claim');}
    json(res,201,await service.record(data));return true;
   }
   if(req.method!=='GET')throw fail('Geographic exposure API is read only unless local opt in is enabled',405);
   if(op==='catalog'&&q.size===0){json(res,200,service.catalog());return true;}
   if(op==='assets'&&q.size===0){json(res,200,await service.listing());return true;}
   if(op==='events'&&[...q.keys()].every(k=>k==='tier'&&q.getAll(k).length===1)){
    json(res,200,await service.events.recent(q.get('tier')||'4.5_week'));return true;}
   if(op==='proximity'&&q.has('eventId')&&[...q.keys()].every(k=>
    ['eventId','tier','radiusKm','asOf'].includes(k)&&q.getAll(k).length===1)){
    json(res,200,await service.screen({eventId:q.get('eventId'),tier:q.get('tier')||'4.5_week',
     radiusKm:q.has('radiusKm')?Number(q.get('radiusKm')):100,asOf:q.get('asOf')}));return true;}
   throw fail('Unknown or unsupported geographic research endpoint',404);
  }catch(e){json(res,[400,403,404,405,409,413,429,502,503,504].includes(e.status)?e.status:502,
   {error:e.status?e.message:'Geographic source unavailable'});}
  return true;
 };
}
