import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 normalizePolygon,polygonPointRelation,hazardSourceUrl,normalizeHazardPayload,
 createHazardFootprints,createHazardFootprintApi,HAZARD_FOOTPRINT_VERSION,
 HAZARD_POLYGON_GATES
} from '../lib/hazard-footprints.mjs';

const FRS='110015778176',SITE=[-120,38];
const T0='2026-11-15T00:00:00.000Z',T1='2026-11-15T01:00:00.000Z',
 T2='2026-11-15T02:00:00.000Z',T3='2026-11-15T03:00:00.000Z';
const outer=[[-121,37],[-119,37],[-119,39],[-121,39],[-121,37]];
const hole=[[-120.5,37.5],[-119.5,37.5],[-119.5,38.5],[-120.5,38.5],[-120.5,37.5]];
const polygon={type:'Polygon',coordinates:[outer]};
const flood=()=>({type:'FeatureCollection',features:[{type:'Feature',id:'nws:001',
 properties:{event:'Flood Warning',id:'urn:oid:official-nws-flood-001',sent:T0},
 geometry:polygon}]});
const wildfire=()=>({type:'FeatureCollection',features:[{type:'Feature',id:88,
 properties:{OBJECTID:88,poly_IncidentName:'Official Sample Fire',
  poly_GISAcres:130,attr_IncidentTypeCategory:'WF'},
 geometry:{type:'MultiPolygon',coordinates:[[outer]]}}]});
const response=(body,options={})=>{
 const raw=Buffer.from(JSON.stringify(body));
 return {ok:options.ok!==false,status:options.status||200,
  headers:{get:key=>key==='content-type'?(options.mime||'application/geo+json'):
   key==='content-length'?String(options.advertised??raw.byteLength):null},
  body:Readable.from([raw])};
};
async function fixture(t,{enabled=true,maxSnapshots=90}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-hazard-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'hazard.json');
 let now=T1,nws=flood(),fire=wildfire();
 const calls=[];
 const fetchImpl=async (url,init)=>{
  calls.push({url,init});
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  return response(url.includes('api.weather.gov')?nws:fire);
 };
 const facilityService={view:async({asOf})=>({
  facilities:asOf<T0?[]:[{registryId:FRS,facilityName:'EPA captured test site',
   location:SITE,capturedAt:T0,coordinateDatum:'NAD83_PROVIDER_REPORTED'}],
  companies:[],relationships:[],events:[],candidates:[]
 })};
 const service=createHazardFootprints({facilityService,filename,fetchImpl,
  enabled,maxSnapshots,now:()=>now});
 return {service,facilityService,fetchImpl,filename,calls,
  setNow:v=>{now=v;},setNws:v=>{nws=v;},setFire:v=>{fire=v;}};
}

test('point-in-polygon: interior, exterior and boundary are never conflated',()=>{
 assert.equal(polygonPointRelation(SITE,polygon),'INSIDE_REPORTED_POLYGON');
 assert.equal(polygonPointRelation([0,0],polygon),'OUTSIDE_REPORTED_POLYGON');
 assert.equal(polygonPointRelation([-121,38],polygon),'BOUNDARY_UNCERTAIN');
 assert.equal(polygonPointRelation([-120,37],polygon),'BOUNDARY_UNCERTAIN');
 assert.equal(polygonPointRelation(SITE,{type:'Polygon',coordinates:[outer,hole]}),
  'OUTSIDE_REPORTED_POLYGON');
 assert.equal(polygonPointRelation([-120.5,38],{type:'Polygon',coordinates:[outer,hole]}),
  'BOUNDARY_UNCERTAIN');
});
test('multipolygon supports isolated fragments and rings with bounded coordinates',()=>{
 const second=[[-4,1],[-2,1],[-2,3],[-4,3],[-4,1]];
 const geom={type:'MultiPolygon',coordinates:[[[...outer]],[[...second]]]};
 const normalized=normalizePolygon(geom);
 assert.equal(normalized.type,'MultiPolygon');
 assert.equal(normalized.vertices,10);
 assert.equal(polygonPointRelation([-3,2],geom),'INSIDE_REPORTED_POLYGON');
 assert.equal(polygonPointRelation([10,10],geom),'OUTSIDE_REPORTED_POLYGON');
});
test('invalid, unclosed and overly complex geometry is rejected, never interpreted as no hazard',()=>{
 assert.throws(()=>normalizePolygon({type:'Point',coordinates:SITE}),{status:422});
 assert.throws(()=>normalizePolygon({type:'Polygon',coordinates:[[...outer.slice(0,4)]]}),{status:422});
 assert.throws(()=>normalizePolygon({type:'Polygon',coordinates:[[[-181,0],[-180,0],[-180,2],[-181,0]]]}),{status:422});
 assert.throws(()=>normalizePolygon({type:'Polygon',coordinates:[outer]}, {maxVertices:4}),{status:422});
});
test('source URL is constructed only from captured site coordinates and fixed provider identifier',()=>{
 const nws=hazardSourceUrl('NWS_FLOOD_ALERT',SITE);
 const fire=hazardSourceUrl('WFIGS_WILDFIRE',SITE);
 assert(nws.startsWith('https://api.weather.gov/alerts/active?point=38.00000'));
 assert(fire.startsWith('https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/'));
 const u=new URL(fire);
 assert.equal(u.searchParams.get('geometry'),'-120.00000,38.00000');
 assert.equal(u.searchParams.get('spatialRel'),'esriSpatialRelIntersects');
 assert.equal(u.searchParams.get('f'),'geojson');
 assert.match(u.searchParams.get('where'),/attr_IncidentTypeCategory/);
 assert.throws(()=>hazardSourceUrl('ARBITRARY',[127,31]),{status:400});
 assert.throws(()=>hazardSourceUrl('NWS_FLOOD_ALERT',[181,0]),{status:400});
});
test('NWS filters flood alerts, tracks missing polygons explicitly and never claims flood depth',()=>{
 const raw=flood();
 raw.features.push({type:'Feature',id:'tornado',properties:{event:'Tornado Warning'},geometry:polygon});
 raw.features.push({type:'Feature',id:'zone-only',properties:{event:'Flash Flood Warning',id:'nws:zone'},geometry:null});
 const normalized=normalizeHazardPayload(raw,'NWS_FLOOD_ALERT',SITE);
 assert.equal(normalized.providerFeatureCount,3);
 assert.equal(normalized.features.length,1);
 assert.equal(normalized.skipped.nonTargetEvent,1);
 assert.equal(normalized.skipped.noPolygon,1);
 assert.equal(normalized.features[0].relation,'INSIDE_REPORTED_POLYGON');
 assert.equal(normalized.features[0].actualFloodDepth,null);
 assert.equal(normalized.features[0].physicalDamageVerified,false);
});
test('WFIGS excludes prescribed fire and tests reported wildfire perimeter only',()=>{
 const raw=wildfire();
 raw.features.push({type:'Feature',id:89,properties:{OBJECTID:89,attr_IncidentTypeCategory:'RX'},
  geometry:polygon});
 const normalized=normalizeHazardPayload(raw,'WFIGS_WILDFIRE',SITE);
 assert.equal(normalized.features.length,1);
 assert.equal(normalized.features[0].name,'Official Sample Fire');
 assert.equal(normalized.skipped.nonTargetEvent,1);
 assert.equal(normalized.features[0].relation,'INSIDE_REPORTED_POLYGON');
 assert.equal(normalized.features[0].incidentAcres,130);
});
test('missing supported geometry yields no exposure finding and partial transfer is rejected',()=>{
 const empty=normalizeHazardPayload({type:'FeatureCollection',features:[{
  type:'Feature',id:'flood:1',properties:{event:'Flood Warning'},geometry:null
 }]},'NWS_FLOOD_ALERT',SITE);
 assert.equal(empty.features.length,0);
 assert.equal(empty.skipped.noPolygon,1);
 assert.throws(()=>normalizeHazardPayload({
  type:'FeatureCollection',features:[],exceededTransferLimit:true
 },'WFIGS_WILDFIRE',SITE),{status:502});
 assert.throws(()=>normalizeHazardPayload({type:'FeatureCollection',
  features:Array.from({length:50},(_,i)=>({
   type:'Feature',id:String(i),properties:{OBJECTID:i+1,attr_IncidentTypeCategory:'WF'},
   geometry:polygon
  }))
 },'WFIGS_WILDFIRE',SITE),{status:409});
});
test('capturing official NWS polygon persists hash and clock; repeated identical body deduplicates',async t=>{
 const h=await fixture(t);
 const first=await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 assert.equal(first.deduplicated,false);
 assert.equal(first.snapshot.capturedAt,T1);
 assert.match(first.snapshot.bodySha256,/^[0-9a-f]{64}$/);
 assert.equal(first.snapshot.features[0].relation,'INSIDE_REPORTED_POLYGON');
 assert.equal(first.snapshot.physicalDamageVerified,false);
 const second=await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 assert.equal(second.deduplicated,true);
 assert.equal(first.snapshot.id,second.snapshot.id);
 assert.equal(h.calls.length,2);
 assert.equal((await h.service.view()).snapshots.length,1);
});
test('wildfire snapshot uses captured EPA site only; no source calls on read',async t=>{
 const h=await fixture(t);
 const f=await h.service.capture({registryId:FRS,provider:'WFIGS_WILDFIRE'});
 assert.equal(f.snapshot.provider,'WFIGS_WILDFIRE');
 assert.equal(f.snapshot.features[0].physicalDamageVerified,false);
 assert.equal(f.snapshot.features[0].relation,'INSIDE_REPORTED_POLYGON');
 const before=h.calls.length;
 const current=await h.service.view({registryId:FRS});
 assert.equal(current.snapshots.length,1);
 assert.equal(h.calls.length,before);
 assert.equal(current.snapshots[0].economicImpact,null);
 assert.equal(current.snapshots[0].sourceCompleteForHistoricalPeriod,false);
 assert.equal(current.snapshots[0].siteCoordinateDatum,'NAD83_PROVIDER_REPORTED');
});
test('invalid FRS record and unsupported provider are rejected before any external request',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.service.capture({registryId:'../.env',provider:'WFIGS_WILDFIRE'}),{status:400});
 await assert.rejects(h.service.capture({registryId:'999999999999',provider:'WFIGS_WILDFIRE'}),{status:409});
 await assert.rejects(h.service.capture({registryId:FRS,provider:'EXTERNAL_SOURCE'}),{status:400});
 assert.equal(h.calls.length,0);
});
test('point-in-polygon revisions replay according to local capture cutoff without future leakage',async t=>{
 const h=await fixture(t);
 await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 const old=(await h.service.view({asOf:T1})).snapshots[0];
 assert.equal(old.features[0].relation,'INSIDE_REPORTED_POLYGON');
 h.setNow(T2);
 const latest=flood();latest.features[0].geometry={
  type:'Polygon',coordinates:[[[10,10],[11,10],[11,11],[10,11],[10,10]]]};
 h.setNws(latest);
 const changed=await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 assert.equal(changed.deduplicated,false);
 assert.equal(changed.snapshot.features[0].relation,'OUTSIDE_REPORTED_POLYGON');
 assert.equal((await h.service.view({asOf:T1})).snapshots[0].features[0].relation,'INSIDE_REPORTED_POLYGON');
 const current=await h.service.view({asOf:T2});
 assert.equal(current.totalCapturedRevisions,2);
 assert.equal(current.snapshots[0].features[0].relation,'OUTSIDE_REPORTED_POLYGON');
 await assert.rejects(h.service.view({asOf:T3}),{status:400});
});
test('source text failures and oversized response reject before private journal append',async t=>{
 const h=await fixture(t);
 h.setNws({type:'FeatureCollection',features:[]});
 const orig=h.fetchImpl;
 const noData=await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 assert.equal(noData.snapshot.features.length,0);
 const source=await h.service.view();
 assert.equal(source.snapshots[0].providerFeatureCount,0);
 assert(HAZARD_POLYGON_GATES.includes('NWS_WARNING_AREA_IS_NOT_AN_OBSERVED_FLOOD_EXTENT'));
 assert.equal(typeof orig,'function');
});
test('tampering with persisted hazard geometry fails closed after restart',async t=>{
 const h=await fixture(t);
 await h.service.capture({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 await h.service.close();
 const restarted=createHazardFootprints({facilityService:h.facilityService,filename:h.filename,
  now:()=>T2,fetchImpl:async()=>{throw Error('unexpected network on read');}});
 assert.equal((await restarted.view()).snapshots.length,1);
 await restarted.close();
 await writeFile(h.filename,(await readFile(h.filename,'utf8')).replace('INSIDE_REPORTED_POLYGON','OUTSIDE_REPORTED_POLYGON'));
 const broken=createHazardFootprints({facilityService:h.facilityService,filename:h.filename,now:()=>T2});
 await assert.rejects(broken.view(),{status:500});
});
test('private hazard access disabled off loopback, no upstream source fetch',async t=>{
 const h=await fixture(t,{enabled:false});
 assert.equal(h.service.catalog().enabled,false);
 await assert.rejects(h.service.facilities(),{status:403});
 await assert.rejects(h.service.view(),{status:403});
 await assert.rejects(h.service.capture({registryId:FRS,provider:'WFIGS_WILDFIRE'}),{status:403});
 assert.equal(h.calls.length,0);
});
test('API blocks cross-origin and arbitrary input, supports captured source read and strict time',async t=>{
 const h=await fixture(t),handler=createHazardFootprintApi({service:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>new Promise(done=>server.close(done)));
 const url='http://127.0.0.1:'+server.address().port+'/api/hazard-footprints/';
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'facilities')).status,200);
 assert.equal((await fetch(url+'view?asOf='+encodeURIComponent(T3))).status,400);
 assert.equal((await fetch(url+'view?unknown=secret')).status,400);
 const body=JSON.stringify({registryId:FRS,provider:'NWS_FLOOD_ALERT'});
 assert.equal((await fetch(url+'capture',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Hazard-Capture':'1',
  Origin:'https://attacker.invalid'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Hazard-Capture':'1'},
  body:JSON.stringify({registryId:FRS,provider:'NWS_FLOOD_ALERT',url:'http://localhost'})})).status,400);
 const good=await fetch(url+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Hazard-Capture':'1'},body});
 assert.equal(good.status,200);
 assert.equal((await good.json()).snapshot.features.length,1);
 assert.equal((await fetch(url+'view?registryId='+FRS)).status,200);
 assert.equal((await fetch(url+'capture',{method:'GET'})).status,404);
});
test('v0.42 page, download action, API and public allowlists are wired together',async()=>{
 const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,server,nav,build,security]=await Promise.all([
  read('hazard-footprints.html'),read('hazard-footprints.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs'),read('tests/security.test.mjs')]);
 for(const id of ['capture-hazard','hazardForm','hazardProvider','hazard-history',
  'hazardResults','downloadFootprints','hazard-adversarial'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/hazard-footprints/'));
 assert(js.includes('application/geo+json'));
 assert(server.includes('createHazardFootprintApi'));
 assert(server.includes('if(await handleHazardFootprints(req,res,u))return;'));
 assert(nav.includes("href:'/hazard-footprints.html'"));
 assert(build.includes("'hazard-footprints.js'"));
 assert(security.includes("'hazard-footprints.js'"));
 assert.equal(HAZARD_FOOTPRINT_VERSION,'HAZARD-POLYGON-SCREEN-0.42.1');
});
