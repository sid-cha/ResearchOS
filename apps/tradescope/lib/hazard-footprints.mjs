/**
 * ResearchOS v0.42: explicit NWS flood alert & WFIGS wildfire polygon captures.
 * Point-in-polygon is geographic screening, never verified damage or legal exposure.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const problem=(msg,status=400)=>Object.assign(Error(msg),{status});
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
const FRS=/^\d{12}$/;
const PROVIDERS=Object.freeze(['NWS_FLOOD_ALERT','WFIGS_WILDFIRE']);
const WFIGS='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';
export const HAZARD_FOOTPRINT_VERSION='HAZARD-POLYGON-SCREEN-0.42.1';
export const HAZARD_POLYGON_GATES=Object.freeze([
 'EPA_FRS_POINT_IS_NOT_A_SURVEYED_SITE_BOUNDARY',
 'NWS_WARNING_AREA_IS_NOT_AN_OBSERVED_FLOOD_EXTENT',
 'WFIGS_PERIMETER_IS_NOT_A_STRUCTURE_DAMAGE_SURVEY',
 'CAPTURE_CLOCK_IS_NOT_ORIGINAL_SOURCE_PUBLICATION_TIME',
 'GEOMETRY_INTERSECTION_DOES_NOT_PROVE_ECONOMIC_LOSS',
 'WFIGS_AND_NWS_COVERAGE_MAY_BE_INCOMPLETE'
]);
const safe=(x,max=150)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const point=x=>Array.isArray(x)&&x.length>=2&&x.slice(0,2).every(Number.isFinite)&&
 Math.abs(x[0])<=180&&Math.abs(x[1])<=90;
function ringValid(r){
 return Array.isArray(r)&&r.length>=4&&r.length<=1800&&r.every(p=>point(p)&&p.length===2)&&
 r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1];
}
export function normalizePolygon(input,{maxVertices=5000}={}){
 if(!input||!['Polygon','MultiPolygon'].includes(input.type))
  throw problem('Source record has no usable GeoJSON polygon',422);
 const polygons=input.type==='Polygon'?[input.coordinates]:input.coordinates;
 if(!Array.isArray(polygons)||!polygons.length||polygons.length>18)
  throw problem('Source geometry exceeds supported polygon count',422);
 let vertices=0;
 for(const polygon of polygons){
  if(!Array.isArray(polygon)||!polygon.length||polygon.length>22)
   throw problem('Source geometry has invalid rings',422);
  for(const ring of polygon){
   if(!ringValid(ring))throw problem('Source geometry has invalid closed coordinate ring',422);
   vertices+=ring.length;
   if(vertices>maxVertices)throw problem('Source geometry has too many points',422);
  }
 }
 return {type:'MultiPolygon',coordinates:polygons.map(poly=>poly.map(ring=>ring.map(p=>[p[0],p[1]]))),
  vertices};
}
function ringLocation([x,y],r){
 let inside=false;
 for(let i=0,j=r.length-1;i<r.length;j=i++){
  const [ax,ay]=r[j],[bx,by]=r[i];
  const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
  if(Math.abs(cross)<1e-9&&x>=Math.min(ax,bx)-1e-9&&
   x<=Math.max(ax,bx)+1e-9&&y>=Math.min(ay,by)-1e-9&&y<=Math.max(ay,by)+1e-9)
   return 'BOUNDARY';
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside?'INSIDE':'OUTSIDE';
}
export function polygonPointRelation(pointCoords,geometry){
 if(!point(pointCoords))throw problem('Facility coordinates invalid');
 const g=normalizePolygon(geometry);
 for(const polygon of g.coordinates){
  const outer=ringLocation(pointCoords,polygon[0]);
  if(outer==='OUTSIDE')continue;
  if(outer==='BOUNDARY')return 'BOUNDARY_UNCERTAIN';
  let hole=false;
  for(const ring of polygon.slice(1)){
   const where=ringLocation(pointCoords,ring);
   if(where==='BOUNDARY')return 'BOUNDARY_UNCERTAIN';
   if(where==='INSIDE'){hole=true;break;}
  }
  if(!hole)return 'INSIDE_REPORTED_POLYGON';
 }
 return 'OUTSIDE_REPORTED_POLYGON';
}
export function hazardSourceUrl(provider,coordinates){
 if(!PROVIDERS.includes(provider)||!point(coordinates))throw problem('Invalid hazard source/provider or facility coordinate');
 const [lon,lat]=coordinates;
 if(provider==='NWS_FLOOD_ALERT'){
  const u=new URL('https://api.weather.gov/alerts/active');
  u.searchParams.set('point',lat.toFixed(5)+','+lon.toFixed(5));
  return u.href;
 }
 const u=new URL(WFIGS);
 for(const [key,value] of [
  ['where',"attr_IncidentTypeCategory='WF'"],
  ['geometry',lon.toFixed(5)+','+lat.toFixed(5)],
  ['geometryType','esriGeometryPoint'],['inSR','4326'],
  ['spatialRel','esriSpatialRelIntersects'],['outSR','4326'],
  ['outFields','OBJECTID,poly_IncidentName,poly_GISAcres,attr_IncidentTypeCategory'],
  ['returnGeometry','true'],['resultRecordCount','50'],['f','geojson']
 ])u.searchParams.set(key,value);
 return u.href;
}
async function fetchBounded(url,{fetchImpl=globalThis.fetch,timeoutMs=9000,maxBytes=900000,
 userAgent='ResearchOS-LocalResearch/0.42 (research terminal; contact repository owner)'}={}){
 const timerCtrl=new AbortController(),timer=setTimeout(()=>timerCtrl.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
   signal:timerCtrl.signal,headers:{Accept:'application/geo+json,application/json',
    'User-Agent':userAgent}});
  if(!response?.ok)throw problem('Official hazard provider unavailable',503);
  const mime=(response.headers?.get?.('content-type')||'').toLowerCase();
  if(!/(?:application\/(?:geo\+json|json|vnd\.geo\+json)|application\/ld\+json)/.test(mime))
   throw problem('Unexpected source geometry content type',415);
  const length=Number(response.headers?.get?.('content-length')||0);
  if(length>maxBytes)throw problem('Provider hazard geometry exceeds response bound',413);
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')
   throw problem('Provider hazard response has no readable stream',503);
  const chunks=[];let total=0;
  for await(const part of response.body){
   if(!(part instanceof Uint8Array))throw problem('Malformed provider response bytes',503);
   total+=part.byteLength;
   if(total>maxBytes){timerCtrl.abort();throw problem('Provider hazard streamed response too large',413);}
   chunks.push(Buffer.from(part));
  }
  const bytes=Buffer.concat(chunks);
  let json;try{json=JSON.parse(bytes.toString('utf8'));}
  catch{throw problem('Provider did not return valid GeoJSON',502);}
  return {json,sourceUrl:url,responseBytes:bytes.byteLength,bodySha256:sha(bytes)};
 }catch(e){if(e?.status)throw e;throw problem('Official hazard source transport failed',503);}
 finally{clearTimeout(timer);}
}
function normalFeatures(payload,provider){
 if(payload?.type!=='FeatureCollection'||!Array.isArray(payload.features)||
  payload.features.length>50||payload.exceededTransferLimit===true||payload.properties?.exceededTransferLimit===true||
  payload.error)
  throw problem('Hazard provider returned incomplete or unsupported feature collection',502);
 // A page exactly equal to max query size is ambiguous: do not imply complete spatial coverage.
 if(provider==='WFIGS_WILDFIRE'&&payload.features.length===50)
  throw problem('WFIGS query may be truncated; cannot assert coverage',409);
 const normalized=[],skipped={noPolygon:0,unsupportedGeometry:0,nonTargetEvent:0,
  invalidGeometry:0};
 for(const f of payload.features){
  if(!f||f.type!=='Feature'||!f.properties||typeof f.properties!=='object'){
   skipped.invalidGeometry++;continue;
  }
  const p=f.properties;
  if(provider==='NWS_FLOOD_ALERT'&&!['Flood Warning','Flash Flood Warning','Flood Advisory'].includes(p.event)){
   skipped.nonTargetEvent++;continue;
  }
  if(provider==='WFIGS_WILDFIRE'&&p.attr_IncidentTypeCategory!=='WF'){
   skipped.nonTargetEvent++;continue;
  }
  if(f.geometry==null){skipped.noPolygon++;continue;}
  let g;
  try{g=normalizePolygon(f.geometry,{maxVertices:5000});}
  catch{skipped.unsupportedGeometry++;continue;}
  const rawId=provider==='NWS_FLOOD_ALERT'?p.id||f.id:
   p.OBJECTID??f.id;
  if(!rawId){skipped.invalidGeometry++;continue;}
  const label=provider==='NWS_FLOOD_ALERT'?safe(p.event):
   safe(p.poly_IncidentName)||'Reported wildfire perimeter';
  normalized.push({id:provider+':'+sha(String(rawId)).slice(0,20),
   name:label,kind:provider==='NWS_FLOOD_ALERT'?'NWS_ACTIVE_FLOOD_ALERT_AREA':'WFIGS_CURRENT_WILDFIRE_PERIMETER',
   declaredHazard:provider==='NWS_FLOOD_ALERT'?safe(p.event):'Wildfire',
   geometry:g,coordinatesCount:g.vertices,
   providerReportedTime:provider==='NWS_FLOOD_ALERT'?safe(p.sent,40)||null:null,
   incidentAcres:provider==='WFIGS_WILDFIRE'&&Number.isFinite(p.poly_GISAcres)?p.poly_GISAcres:null,
   providerFeatureIdHash:sha(String(rawId))});
 }
 if(normalized.length>24)throw problem('Too many intersecting hazard polygons for bounded archive',409);
 if(normalized.reduce((s,x)=>s+x.coordinatesCount,0)>16000)
  throw problem('Hazard polygons exceed bounded storage budget',409);
 return {features:normalized,skipped,providerFeatureCount:payload.features.length};
}
export function normalizeHazardPayload(json,provider,siteCoords){
 if(!PROVIDERS.includes(provider)||!point(siteCoords))throw problem('Invalid provider or facility');
 const data=normalFeatures(json,provider);
 return {...data,features:data.features.map(x=>({...x,
  relation:polygonPointRelation(siteCoords,x.geometry),
  physicalDamageVerified:false,actualFloodDepth:null,measuredShakingIntensity:null,
  probabilityOfFinancialLoss:null}))};
}
function validateJournal(doc,maxSnapshots){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.snapshots)||doc.snapshots.length>maxSnapshots)
  throw problem('Hazard footprint journal schema invalid',500);
 let previous='GENESIS',at=null;
 const ids=new Set();
 for(const [i,e] of doc.snapshots.entries()){
  if(!e||e.seq!==i||typeof e.id!=='string'||
   !/^footprint-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id)||
   ids.has(e.id)||e.previousHash!==previous||!iso(e.capturedAt)||
   (at&&e.capturedAt<at)||!FRS.test(e.registryId||'')||
   !PROVIDERS.includes(e.provider)||!Array.isArray(e.features)||e.hash===undefined)
   throw problem('Hazard journal integrity or record format invalid',500);
  const {hash:recordHash,...body}=e;
  if(recordHash!==sha(body))throw problem('Hazard journal hash mismatch',500);
  if(e.features.length>24||!point(e.siteCoordinates)||
   e.features.some(f=>!['INSIDE_REPORTED_POLYGON','OUTSIDE_REPORTED_POLYGON','BOUNDARY_UNCERTAIN'].includes(f.relation)))
   throw problem('Stored hazard screening record invalid',500);
  previous=recordHash;at=e.capturedAt;ids.add(e.id);
 }
 return doc;
}
export function createHazardFootprints({facilityService,filename,fetchImpl=globalThis.fetch,
 enabled=true,now=()=>new Date().toISOString(),maxSnapshots=90,maxBytes=6000000,
 userAgent=process.env.HAZARD_SOURCE_USER_AGENT}={}){
 if(typeof facilityService?.view!=='function'||!path.isAbsolute(filename||'')||
  !Number.isInteger(maxSnapshots)||maxSnapshots<1||maxSnapshots>600||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('Hazard footprints require private file and local EPA facility service');
 let doc=null,loading=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!iso(t))throw problem('Local hazard snapshot clock invalid',503);return t;};
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>maxBytes)throw problem('Hazard journal file exceeds bound',500);
    return doc=validateJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxSnapshots);
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,snapshots:[]};
    throw problem('Hazard journal could not be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{const p=queue.then(async()=>{await load();return fn();});queue=p.catch(()=>{});return p;};
 async function save(value){
  if(doc.snapshots.length>=maxSnapshots)throw problem('Hazard archive capacity reached',409);
  const capturedAt=clock(),prev=doc.snapshots.at(-1);
  if(prev&&capturedAt<prev.capturedAt)throw problem('Hazard journal time moved backwards',409);
  const base={id:'footprint-'+randomUUID(),seq:doc.snapshots.length,capturedAt,
   previousHash:prev?.hash||'GENESIS',...value};
  const entry={...base,hash:sha(base)},candidate={schemaVersion:1,snapshots:[...doc.snapshots,entry]};
  const data=JSON.stringify(candidate,null,2)+'\n';
  if(Buffer.byteLength(data)>maxBytes)throw problem('Hazard journal storage limit reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,data,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw problem('Hazard journal could not be persisted',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  doc=candidate;return entry;
 }
 const catalog=()=>({enabled,version:HAZARD_FOOTPRINT_VERSION,providers:PROVIDERS,
  defaultStoredSnapshots:maxSnapshots,flags:HAZARD_POLYGON_GATES,
  sourceNetworks:['api.weather.gov','services3.arcgis.com'],
  caveat:'Only selected current polygon sources; no archived full flood extent, structure damage, annual coverage or actual ShakeMap intensity yet.'});
 async function facilities({asOf=null}={}){
  if(!enabled)throw problem('Private facility hazard research disabled off loopback host',403);
  const at=asOf||clock();
  if(!iso(at)||at>clock())throw problem('Hazard site cutoff must be nonfuture UTC instant');
  const f=await facilityService.view({asOf:at,radiusKm:1});
  return {asOf:at,facilities:f.facilities.map(x=>({registryId:x.registryId,
   facilityName:x.facilityName,coordinates:x.location,capturedAt:x.capturedAt,
   coordinateDatum:x.coordinateDatum,siteFootprintIndependentlyVerified:false}))};
 }
 async function capture({registryId,provider}={}){
  if(!enabled)throw problem('Official hazard capture disabled off loopback host',403);
  if(!FRS.test(registryId||'')||!PROVIDERS.includes(provider))
   throw problem('Choose captured EPA FRS Registry ID and supported polygon provider');
  return serial(async()=>{
   if(doc.snapshots.length>=maxSnapshots)throw problem('Hazard archive capacity reached',409);
   const current=clock(),sites=await facilities({asOf:current});
   const site=sites.facilities.find(x=>x.registryId===registryId);
   if(!site||!point(site.coordinates))
    throw problem('Facility must have previously captured EPA location coordinates',409);
   const sourceUrl=hazardSourceUrl(provider,site.coordinates);
   const source=await fetchBounded(sourceUrl,{fetchImpl,
    userAgent:userAgent||'ResearchOS-LocalResearch/0.42 (research terminal; contact project owner)'});
   const normalized=normalizeHazardPayload(source.json,provider,site.coordinates);
   const prior=doc.snapshots.findLast(x=>x.provider===provider&&x.registryId===registryId&&
    x.bodySha256===source.bodySha256&&JSON.stringify(x.siteCoordinates)===JSON.stringify(site.coordinates));
   if(prior)return {deduplicated:true,snapshot:{...prior}};
   const record=await save({provider,registryId,siteName:site.facilityName,
    siteCoordinates:site.coordinates,siteRecordCapturedAt:site.capturedAt,
    siteCoordinateDatum:site.coordinateDatum||'EPA_FRS_REPORTED_NAD83',
    sourceUrl:source.sourceUrl,bodySha256:source.bodySha256,responseBytes:source.responseBytes,
    providerFeatureCount:normalized.providerFeatureCount,
    skipped:normalized.skipped,features:normalized.features,
    sourceAvailableAt:clock(),originalProviderPublicationVerified:false,
    physicalDamageVerified:false,issuerImpactVerified:false});
   return {deduplicated:false,snapshot:record};
  });
 }
 async function view({asOf=null,registryId=null}={}){
  if(!enabled)throw problem('Private facility hazard evidence disabled off loopback host',403);
  const at=asOf||clock();
  if(!iso(at)||at>clock()||(registryId!==null&&!FRS.test(registryId)))
   throw problem('Invalid hazard cutoff or FRS ID');
  await queue;await load();
  const available=doc.snapshots.filter(x=>x.capturedAt<=at&&
   x.siteRecordCapturedAt<=at&&(!registryId||x.registryId===registryId));
  const indexed=new Map();
  for(const s of available)indexed.set(s.registryId+'|'+s.provider,s);
  const snapshots=[...indexed.values()].sort((a,b)=>a.registryId.localeCompare(b.registryId)||
   a.provider.localeCompare(b.provider)).map(s=>({
    id:s.id,provider:s.provider,registryId:s.registryId,siteName:s.siteName,
    siteCoordinates:s.siteCoordinates,siteCoordinateDatum:s.siteCoordinateDatum,
    siteRecordCapturedAt:s.siteRecordCapturedAt,
    capturedAt:s.capturedAt,sourceUrl:s.sourceUrl,bodySha256:s.bodySha256,
    responseBytes:s.responseBytes,providerFeatureCount:s.providerFeatureCount,
    skipped:s.skipped,features:s.features.map(f=>({id:f.id,name:f.name,kind:f.kind,
     relation:f.relation,providerReportedTime:f.providerReportedTime,
     geometry:f.geometry,coordinatesCount:f.coordinatesCount,
     physicalDamageVerified:false,actualFloodDepth:null,measuredShakingIntensity:null})),
    sourceCompleteForHistoricalPeriod:false,physicalDamageVerified:false,
    economicImpact:null
   }));
  return {version:HAZARD_FOOTPRINT_VERSION,asOf:at,snapshots,
   totalCapturedRevisions:available.length,flags:HAZARD_POLYGON_GATES,
   note:'NWS warning polygons are forecast/warning areas; WFIGS current perimeters are mapped wildfire boundaries. An EPA point falling inside either does not verify site damage, closure, loss or legal ownership.'};
 }
 async function close(){await queue;}
 return {catalog,facilities,capture,view,close};
}
const send=(res,status,data)=>{res.writeHead(status,{
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));};
export function createHazardFootprintApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/hazard-footprints/'))return false;
  const op=url.pathname.slice('/api/hazard-footprints/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)send(res,200,service.catalog());
    else if(op==='facilities' || op==='view'){
     if([...url.searchParams.keys()].some(k=>!['asOf','registryId'].includes(k)||
       url.searchParams.getAll(k).length!==1)||
       (op==='facilities'&&url.searchParams.has('registryId')))
      throw problem('Unsupported hazard query parameters');
     const args={asOf:url.searchParams.get('asOf')||null};
     if(op==='view')args.registryId=url.searchParams.get('registryId')||null;
     send(res,200,op==='facilities'?await service.facilities(args):await service.view(args));
    }else throw problem('Unknown hazard footprint endpoint',404);
   }else if(req.method==='POST'&&op==='capture'&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
       req.headers['x-researchos-hazard-capture']!=='1'||
       req.headers['sec-fetch-site']==='cross-site'||
       (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
      throw problem('Explicit same-origin loopback capture is required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw problem('JSON required',415);
    let input='',bytes=0;
    for await(const chunk of req){bytes+=chunk.byteLength;if(bytes>900)throw problem('Hazard capture request too large',413);input+=chunk;}
    let args;try{args=JSON.parse(input);}catch{throw problem('Hazard capture request JSON invalid');}
    if(!args||typeof args!=='object'||Array.isArray(args)||
      Object.keys(args).some(k=>!['registryId','provider'].includes(k)))
     throw problem('Unsupported source capture arguments');
    send(res,200,await service.capture(args));
   }else throw problem('Unsupported hazard operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,422,500,502,503].includes(e?.status)?e.status:503;
   send(res,status,{error:e?.status?e.message:'Hazard research unavailable'});
  }
  return true;
 };
}
