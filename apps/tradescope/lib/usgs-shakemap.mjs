/**
 * ResearchOS v0.43 — USGS ShakeMap grid MMI observation at captured EPA site.
 * Uses an explicitly captured USGS earthquake, fixed USGS event detail, and an
 * allowlisted SHAKEMap legacy grid.xml product. Sampling is not a damage forecast.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const fail=(msg,status=400)=>Object.assign(Error(msg),{status});
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
const FRS=/^\d{12}$/,USGS_EVENT=/^USGS:[A-Za-z0-9_-]{3,64}$/;
const validPoint=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&
 Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const R_EARTH=6371;
export const USGS_MMI_VERSION='USGS-SHAKEMAP-GRID-0.43.1';
export const USGS_MMI_GATES=Object.freeze([
 'GRID_MMI_IS_USGS_ESTIMATED_SHAKING_NOT_OBSERVED_DAMAGE',
 'NEAREST_GRID_SAMPLE_NOT_SURVEYED_FACILITY_INTENSITY',
 'EPA_FRS_POINT_IS_NOT_THE_ACTUAL_ASSET_FOOTPRINT',
 'USGS_GRID_IS_PRODUCT_VERSIONED_AND_CAN_BE_REVISED',
 'GRID_XML_LEGACY_SOURCE_MAY_BE_UNAVAILABLE',
 'NO_GROUNDED_COMPANY_OWNERSHIP_OR_FINANCIAL_LOSS'
]);
export function detailUrl(eventId){
 if(!USGS_EVENT.test(eventId||''))throw fail('Choose an existing captured USGS event ID');
 const id=eventId.slice('USGS:'.length);
 return 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/'+id+'.geojson';
}
export function validateProductUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.hostname==='earthquake.usgs.gov'&&
   !u.username&&!u.password&&!u.port&&!u.hash&&!u.search&&
   /^\/product\/shakemap\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/\d+\/download\/grid\.xml$/.test(u.pathname)?
   u.href:null;
 }catch{return null;}
}
export function selectUsGsGridProduct(detail,eventId){
 if(!USGS_EVENT.test(eventId||'')||detail?.type!=='Feature'||detail.id!==eventId.slice(5)||
    !detail.properties||typeof detail.properties!=='object')
  throw fail('USGS event detail did not match the locally captured event',502);
 const products=detail.properties.products?.shakemap;
 if(!Array.isArray(products)||!products.length)
  return {status:'NO_USGS_SHAKEMAP_PRODUCT',gridUrl:null,productUpdatedAt:null};
 const valid=products.filter(p=>p&&p.status!=='DELETE'&&p.contents&&
  typeof p.contents==='object').map(p=>({
    p,weight:Number.isFinite(p.preferredWeight)?p.preferredWeight:-1,
    update:Number.isFinite(p.updateTime)?p.updateTime:0,
    grid:validateProductUrl(p.contents['download/grid.xml']?.url)
  })).filter(x=>x.grid).sort((a,b)=>b.weight-a.weight||b.update-a.update||
  a.grid.localeCompare(b.grid));
 if(!valid.length)return {status:'NO_SUPPORTED_USGS_GRID_XML',gridUrl:null,
  productUpdatedAt:null};
 const chosen=valid[0];
 return {status:'GRID_AVAILABLE',gridUrl:chosen.grid,
  productUpdatedAt:chosen.update?new Date(chosen.update).toISOString():null,
  productSource:typeof chosen.p.source==='string'?chosen.p.source:null,
  productId:typeof chosen.p.code==='string'?chosen.p.code:null};
}
async function fetchOfficial(url,{fetchImpl=globalThis.fetch,mime='json',maxBytes,
 timeoutMs=10000,userAgent='ResearchOS/0.43 local source research contact via maintainer'}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
   signal:controller.signal,headers:{Accept:mime==='xml'?'application/xml,text/xml':'application/geo+json,application/json',
   'User-Agent':userAgent}});
  if(!res?.ok)throw fail('USGS ShakeMap provider request failed',503);
  const type=(res.headers?.get?.('content-type')||'').toLowerCase().split(';')[0].trim();
  if(mime==='xml'?!['application/xml','text/xml','application/octet-stream'].includes(type):
   !['application/json','application/geo+json'].includes(type))
   throw fail('Unexpected official ShakeMap product content type',415);
  if(Number(res.headers?.get?.('content-length')||0)>maxBytes)
   throw fail('USGS ShakeMap product exceeds size limit',413);
  if(!res.body||typeof res.body[Symbol.asyncIterator]!=='function')
   throw fail('USGS source returned no bounded byte stream',503);
  const pieces=[];let total=0;
  for await(const part of res.body){
   if(!(part instanceof Uint8Array))throw fail('USGS source returned unexpected stream chunk',503);
   total+=part.byteLength;
   if(total>maxBytes){controller.abort();throw fail('USGS response exceeded streamed limit',413);}
   pieces.push(Buffer.from(part));
  }
  const bytes=Buffer.concat(pieces);
  return {text:bytes.toString('utf8'),bodySha256:sha(bytes),responseBytes:bytes.byteLength};
 }catch(e){if(e?.status)throw e;throw fail('USGS ShakeMap network request unavailable',503);}
 finally{clearTimeout(timer);}
}
function attributes(xml){
 const out={};
 for(const match of xml.matchAll(/([a-zA-Z_][\w:-]*)\s*=\s*"([^"]*)"/g)){
  if(Object.hasOwn(out,match[1]))throw fail('Duplicate ShakeMap XML attribute',502);
  out[match[1]]=match[2];
 }
 return out;
}
const degDistance=(a,b)=>{
 const lat=(a[1]+b[1])/2*Math.PI/180;
 return Math.sqrt(((a[0]-b[0])*Math.cos(lat))**2+(a[1]-b[1])**2);
};
export function sampleShakeGrid(xml,site){
 if(typeof xml!=='string'||xml.length>12000000||!validPoint(site))
  throw fail('Invalid bounded ShakeMap XML or EPA site');
 if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml))
  throw fail('Untrusted ShakeMap XML declarations rejected',502);
 const fields=[...xml.matchAll(/<grid_field\b([^>]*)\/>/gi)].map(m=>attributes(m[1]));
 if(fields.length<3||fields.length>24)throw fail('USGS ShakeMap grid fields invalid',502);
 const col=new Map();
 for(const f of fields){
  const i=Number(f.index);
  if(!Number.isInteger(i)||i<1||i>fields.length||col.has(f.name))
   throw fail('USGS ShakeMap field order invalid',502);
  col.set(f.name,i-1);
 }
 if(!['LON','LAT','MMI'].every(x=>col.has(x)))
  throw fail('ShakeMap does not provide LON LAT and MMI',502);
 const specTag=xml.match(/<grid_specification\b([^>]*)\/>/i);
 const dataMatch=xml.match(/<grid_data>([\s\S]*?)<\/grid_data>/i);
 if(!specTag||!dataMatch)throw fail('ShakeMap XML grid specification or data missing',502);
 const spec=attributes(specTag[1]);
 const cols=Number(spec.nlon),rows=Number(spec.nlat),
  lonMin=Number(spec.lon_min),lonMax=Number(spec.lon_max),
  latMin=Number(spec.lat_min),latMax=Number(spec.lat_max),
  dx=Number(spec.nominal_lon_spacing),dy=Number(spec.nominal_lat_spacing);
 if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||rows<2||
    cols*rows>200000||cols*rows<4||
    ![lonMin,lonMax,latMin,latMax,dx,dy].every(Number.isFinite)||
    dx<=0||dy<=0||lonMin>=lonMax||latMin>=latMax)
  throw fail('USGS grid dimensions or geographic range invalid',502);
 const inside=site[0]>=lonMin&&site[0]<=lonMax&&site[1]>=latMin&&site[1]<=latMax;
 // A facility outside the declared ShakeMap grid is not a zero-shaking location.
 if(!inside)return {status:'OUTSIDE_REPORTED_SHAKEMAP_GRID',
  estimatedMmi:null,nearestGridPoint:null,nearestDistanceKm:null,
  gridBounds:[lonMin,latMin,lonMax,latMax],gridColumns:cols,gridRows:rows,
  gridQuality:'OUTSIDE_MODEL_COVERAGE',siteDamageVerified:false};
 const lines=dataMatch[1].split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>200000||lines.length!==cols*rows)
  throw fail('USGS ShakeMap rows exceed declared grid dimensions',502);
 let nearest=null,distance=Infinity,found=0;
 for(const line of lines){
  const values=line.split(/\s+/);
  if(values.length!==fields.length)throw fail('USGS ShakeMap row does not match field definition',502);
  const lon=Number(values[col.get('LON')]),lat=Number(values[col.get('LAT')]),
   mmi=Number(values[col.get('MMI')]);
  if(![lon,lat,mmi].every(Number.isFinite)||Math.abs(lon)>180||Math.abs(lat)>90||
    mmi<0||mmi>12)throw fail('USGS ShakeMap row has invalid coordinates or MMI',502);
  const d=degDistance(site,[lon,lat]);
  if(d<distance){nearest={coordinates:[lon,lat],mmi};distance=d;}
  found++;
 }
 // Reject extrapolation beyond approximately 1.5 cell widths.
 if(!nearest||distance>Math.hypot(dx,dy)*1.5)
  return {status:'NO_LOCAL_GRID_CELL',estimatedMmi:null,nearestGridPoint:null,
   nearestDistanceKm:null,gridBounds:[lonMin,latMin,lonMax,latMax],
   gridColumns:cols,gridRows:rows,observedGridRows:found,
   gridQuality:'NO_NEARBY_VALID_SAMPLE',siteDamageVerified:false};
 return {status:'USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE',
  estimatedMmi:nearest.mmi,nearestGridPoint:nearest.coordinates,
  nearestDistanceKm:Math.round(distance*111.2*100)/100,
  gridBounds:[lonMin,latMin,lonMax,latMax],
  gridColumns:cols,gridRows:rows,observedGridRows:found,
  gridQuality:'NEAREST_NODE_ONLY_NO_INTERPOLATION',
  siteDamageVerified:false,issuerFinancialImpactVerified:false,
  earthquakeLossEstimate:null};
}
function checkJournal(doc,maxEntries){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.entries)||doc.entries.length>maxEntries)
  throw fail('USGS ShakeMap archive schema invalid',500);
 let prev='GENESIS',stamp=null;
 for(const [i,e] of doc.entries.entries()){
  if(!e||!/^mmi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id||'')||
   e.seq!==i||e.previousHash!==prev||!iso(e.capturedAt)||
   stamp&&e.capturedAt<stamp||!FRS.test(e.registryId||'')||
   !USGS_EVENT.test(e.eventId||'')||!validPoint(e.siteCoordinates)||
   !['USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE','NO_LOCAL_GRID_CELL',
    'OUTSIDE_REPORTED_SHAKEMAP_GRID','NO_USGS_SHAKEMAP_PRODUCT','NO_SUPPORTED_USGS_GRID_XML'].includes(e.sample?.status))
   throw fail('USGS ShakeMap archive record invalid',500);
  const {hash,...payload}=e;
  if(hash!==sha(payload))throw fail('USGS ShakeMap archive hash mismatch',500);
  prev=hash;stamp=e.capturedAt;
 }
 return doc;
}
export function createShakeMapSampler({facilityService,globalEvents,filename,
 enabled=true,fetchImpl=globalThis.fetch,now=()=>new Date().toISOString(),
 maxEntries=150,maxBytes=3000000,userAgent=process.env.USGS_SOURCE_USER_AGENT}={}){
 if(!facilityService?.view||!globalEvents?.list||!path.isAbsolute(filename||'')||
  !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>600||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('ShakeMap sampler requires captured USGS events and EPA facilities');
 let state=null,loading=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!iso(t))throw fail('Local ShakeMap capture clock invalid',503);return t;};
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>maxBytes)throw fail('USGS archive is larger than limit',500);
    return state=checkJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxEntries);
   }catch(e){if(e.code==='ENOENT')return state={schemaVersion:1,entries:[]};
    throw fail('USGS ShakeMap archive cannot be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{const result=queue.then(async()=>{await load();return fn();});queue=result.catch(()=>{});return result;};
 async function persist(value){
  if(state.entries.length>=maxEntries)throw fail('USGS archive capacity reached',409);
  const capturedAt=clock(),last=state.entries.at(-1);
  if(last&&capturedAt<last.capturedAt)throw fail('USGS archive clock reversed',409);
  const base={id:'mmi-'+randomUUID(),seq:state.entries.length,capturedAt,
   previousHash:last?.hash||'GENESIS',...value};
  const entry={...base,hash:sha(base)},next={schemaVersion:1,entries:[...state.entries,entry]};
  const body=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(body)>maxBytes)throw fail('USGS local grid archive full',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,body,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw fail('USGS ShakeMap could not be stored',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  state=next;return entry;
 }
 const catalog=()=>({enabled,version:USGS_MMI_VERSION,
  fixedDetailFeed:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/',
  product:'download/grid.xml',dataModel:'USGS ShakeMap estimated MMI at nearest XML grid point',
  caveats:USGS_MMI_GATES,automaticTrading:false});
 async function choices({asOf=null}={}){
  if(!enabled)throw fail('Private USGS sampling disabled off loopback',403);
  const t=asOf||clock();
  if(!iso(t)||t>clock())throw fail('Invalid local knowledge cutoff');
  const [f,e]=await Promise.all([
   facilityService.view({asOf:t,radiusKm:1}),
   globalEvents.list({source:'USGS',asOf:t,limit:200})
  ]);
  if(e.isPartial)throw fail('USGS local archive partial; cannot claim complete selection',409);
  return {asOf:t,facilities:f.facilities.map(x=>({
   registryId:x.registryId,facilityName:x.facilityName,coordinates:x.location,
   capturedAt:x.capturedAt
  })).filter(x=>FRS.test(x.registryId)&&validPoint(x.coordinates)),
   earthquakes:e.events.filter(x=>USGS_EVENT.test(x.id||'')&&x.type==='EARTHQUAKE')
    .map(x=>({eventId:x.id,title:x.title,firstObservedAt:x.firstObservedAt,
     eventTime:x.eventTime,location:x.location})),
   missingSourceDataIsNotSafetyEvidence:true};
 }
 async function capture({registryId,eventId}={}){
  if(!enabled)throw fail('Private USGS sampling disabled off loopback',403);
  if(!FRS.test(registryId||'')||!USGS_EVENT.test(eventId||''))
   throw fail('Choose a previously captured FRS facility and USGS earthquake');
  return serial(async()=>{
   if(state.entries.length>=maxEntries)throw fail('ShakeMap storage capacity reached',409);
   const available=await choices({asOf:clock()});
   const site=available.facilities.find(x=>x.registryId===registryId),
    earthquake=available.earthquakes.find(x=>x.eventId===eventId);
   if(!site||!earthquake)throw fail('Both official source observations must be locally captured',409);
   const detailSource=detailUrl(eventId);
   const detail=await fetchOfficial(detailSource,{fetchImpl,mime:'json',maxBytes:850000,userAgent});
   let json;try{json=JSON.parse(detail.text);}catch{throw fail('USGS event detail invalid JSON',502);}
   const product=selectUsGsGridProduct(json,eventId);
   let gridHash=null,gridBytes=null,sample,gridUrl=null;
   if(product.gridUrl){
    gridUrl=product.gridUrl;
    const grid=await fetchOfficial(gridUrl,{fetchImpl,mime:'xml',maxBytes:12000000,userAgent});
    gridHash=grid.bodySha256;gridBytes=grid.responseBytes;
    sample=sampleShakeGrid(grid.text,site.coordinates);
   }else sample={status:product.status,estimatedMmi:null,nearestGridPoint:null,
    nearestDistanceKm:null,siteDamageVerified:false};
   const value={registryId,eventId,eventTitle:earthquake.title,
    eventFirstCapturedAt:earthquake.firstObservedAt,siteCapturedAt:site.capturedAt,
    siteCoordinates:site.coordinates,siteName:site.facilityName,
    eventDetailUrl:detailSource,detailSha256:detail.bodySha256,detailBytes:detail.responseBytes,
    gridUrl,gridSha256:gridHash,gridResponseBytes:gridBytes,
    productUpdatedAtReported:product.productUpdatedAt,
    productProvider:product.productSource||null,
    sample,originalProductPublicationVerified:false,legalIssuerOwnerVerified:false,
    verifiedSiteDamage:false,financialImpactEstimate:null};
   const prev=state.entries.findLast(e=>e.registryId===registryId&&e.eventId===eventId&&
    e.detailSha256===detail.bodySha256&&e.gridSha256===gridHash&&
    JSON.stringify(e.siteCoordinates)===JSON.stringify(site.coordinates));
   if(prev)return {deduplicated:true,record:prev};
   return {deduplicated:false,record:await persist(value)};
  });
 }
 async function view({asOf=null,registryId=null,eventId=null}={}){
  if(!enabled)throw fail('Private USGS sampling disabled off loopback',403);
  const t=asOf||clock();
  if(!iso(t)||t>clock()||
   (registryId!==null&&!FRS.test(registryId))||
   (eventId!==null&&!USGS_EVENT.test(eventId)))
   throw fail('Invalid ShakeMap filter or cutoff');
  await queue;await load();
  const eligible=state.entries.filter(e=>e.capturedAt<=t&&
   e.siteCapturedAt<=t&&e.eventFirstCapturedAt<=t&&
   (!registryId||e.registryId===registryId)&&(!eventId||e.eventId===eventId));
  const latest=new Map();
  for(const e of eligible)latest.set(e.registryId+'|'+e.eventId,e);
  return {version:USGS_MMI_VERSION,asOf:t,
   results:[...latest.values()].map(x=>({
    registryId:x.registryId,eventId:x.eventId,eventTitle:x.eventTitle,
    capturedAt:x.capturedAt,siteCoordinates:x.siteCoordinates,siteName:x.siteName,
    eventDetailUrl:x.eventDetailUrl,detailSha256:x.detailSha256,
    gridUrl:x.gridUrl,gridSha256:x.gridSha256,
    productUpdatedAtReported:x.productUpdatedAtReported,
    sample:x.sample,verifiedSiteDamage:false,legalIssuerOwnerVerified:false,
    financialImpactEstimate:null,originalProductPublicationVerified:false
   })),capturedRevisions:eligible.length,caveats:USGS_MMI_GATES};
 }
 async function close(){await queue;}
 return {catalog,choices,capture,view,close};
}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export function createShakeMapApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/shakemap-mmi/'))return false;
  try{
   const op=url.pathname.slice('/api/shakemap-mmi/'.length);
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)send(res,200,service.catalog());
    else if(op==='choices'||op==='view'){
     if([...url.searchParams.keys()].some(k=>!['asOf','registryId','eventId'].includes(k)||
       url.searchParams.getAll(k).length!==1)||
       (op==='choices'&&(url.searchParams.has('registryId')||url.searchParams.has('eventId'))))
      throw fail('Unexpected USGS source query');
     const args={asOf:url.searchParams.get('asOf')||null};
     if(op==='view'){
      args.registryId=url.searchParams.get('registryId')||null;
      args.eventId=url.searchParams.get('eventId')||null;
     }
     send(res,200,op==='choices'?await service.choices(args):await service.view(args));
    }else throw fail('Unknown USGS MMI endpoint',404);
   }else if(req.method==='POST'&&op==='capture'&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
      req.headers['x-researchos-shakemap']!=='1'||
      req.headers['sec-fetch-site']==='cross-site'||
      (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw fail('Explicit same-origin loopback ShakeMap capture required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw fail('JSON body required',415);
    let text='',size=0;
    for await(const chunk of req){size+=chunk.byteLength;if(size>700)throw fail('ShakeMap input oversized',413);text+=chunk;}
    let args;try{args=JSON.parse(text);}catch{throw fail('Invalid ShakeMap capture JSON');}
    if(!args||typeof args!=='object'||Array.isArray(args)||
      Object.keys(args).some(x=>!['registryId','eventId'].includes(x)))
     throw fail('Unsupported source capture fields');
    send(res,200,await service.capture(args));
   }else throw fail('Unsupported USGS ShakeMap operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   send(res,status,{error:e?.status?e.message:'USGS ShakeMap evidence unavailable'});
  }
  return true;
 };
}
