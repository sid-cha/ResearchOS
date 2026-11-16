import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 detailUrl,validateProductUrl,selectUsGsGridProduct,sampleShakeGrid,
 createShakeMapSampler,createShakeMapApi,USGS_MMI_VERSION,USGS_MMI_GATES
} from '../lib/usgs-shakemap.mjs';

const FRS='110015778176',ID='USGS:us500abc',SOURCE=ID.slice(5),SITE=[-120,38];
const T0='2026-11-15T00:00:00.000Z',T1='2026-11-15T01:00:00.000Z',
 T2='2026-11-15T02:00:00.000Z',T3='2026-11-15T03:00:00.000Z';
const GRID_URL='https://earthquake.usgs.gov/product/shakemap/us500abc/us/1700000000000/download/grid.xml';
const gridXml=(mmi=5.5)=>[
 '<?xml version="1.0" encoding="US-ASCII"?>',
 '<shakemap_grid event_id="us500abc">',
 '<grid_specification lon_min="-121" lon_max="-119" lat_min="37" lat_max="39"',
 ' nominal_lon_spacing="1" nominal_lat_spacing="1" nlon="3" nlat="3" />',
 '<grid_field index="1" name="LON" units="dd" />',
 '<grid_field index="2" name="LAT" units="dd" />',
 '<grid_field index="3" name="MMI" units="mmi" />',
 '<grid_data>',
 '-121 37 2.1','-120 37 3.4','-119 37 1.3',
 '-121 38 4.5','-120 38 '+mmi,'-119 38 3.3',
 '-121 39 2.2','-120 39 3.1','-119 39 2.1',
 '</grid_data></shakemap_grid>'
].join('\n');
const detail=(include=true,grid=GRID_URL)=>({
 type:'Feature',id:SOURCE,properties:include?{products:{shakemap:[{
  status:'UPDATE',preferredWeight:100,updateTime:1700000000000,source:'us',
  code:'us500abc',contents:{'download/grid.xml':{url:grid,contentType:'application/xml'}}
 }]}}:{products:{}}});
const response=(body,{status=200,mime,advertised}={})=>{
 const bytes=Buffer.from(body);
 return {ok:status===200,status,headers:{get:k=>k==='content-type'?
  mime||(body.startsWith('<?xml')?'application/xml':'application/geo+json'):
  k==='content-length'?String(advertised??bytes.length):null},
  body:Readable.from([bytes])};
};
async function fixture(t,{enabled=true,maxEntries=150}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-usgs-mmi-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'observations.json'),calls=[];
 let now=T1,xml=gridXml(),json=detail();
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url===detailUrl(ID))return response(JSON.stringify(json),{mime:'application/geo+json'});
  if(url===GRID_URL)return response(xml,{mime:'application/xml'});
  throw Error('Unexpected URL: '+url);
 };
 const facilityService={view:async({asOf})=>({
  facilities:asOf<T0?[]:[{registryId:FRS,facilityName:'EPA Reported Test Plant',
   location:SITE,capturedAt:T0}],events:[],relationships:[],companies:[],candidates:[]
 })};
 const globalEvents={list:async({asOf})=>({
  events:asOf<T0?[]:[{id:ID,title:'M6.1 earthquake in US',type:'EARTHQUAKE',
   source:'USGS',firstObservedAt:T0,eventTime:T0,location:[-120,38]}],
  isPartial:false
 })};
 const service=createShakeMapSampler({facilityService,globalEvents,filename,
  fetchImpl,enabled,maxEntries,now:()=>now});
 return {service,filename,fetchImpl,facilityService,globalEvents,calls,
  setNow:x=>{now=x;},setGrid:x=>{xml=x;},setDetail:x=>{json=x;}};
}
test('only locally captured style earthquake ID produces fixed USGS detail URL',()=>{
 assert.equal(detailUrl(ID),'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us500abc.geojson');
 for(const invalid of ['../etc/passwd','USGS:../../env','NWS:us500abc','USGS:http://x','USGS:a'])
  assert.throws(()=>detailUrl(invalid),{status:400});
});
test('Shakemap product URL cannot point to arbitrary host, port, credential or contour file',()=>{
 assert.equal(validateProductUrl(GRID_URL),GRID_URL);
 for(const invalid of [
  'http://earthquake.usgs.gov/product/shakemap/x/us/123/download/grid.xml',
  'https://earthquake.usgs.gov.attacker.net/product/shakemap/x/us/123/download/grid.xml',
  'https://127.0.0.1/product/shakemap/x/us/123/download/grid.xml',
  'https://evil:pass@earthquake.usgs.gov/product/shakemap/x/us/123/download/grid.xml',
  'https://earthquake.usgs.gov:8443/product/shakemap/x/us/123/download/grid.xml',
  'https://earthquake.usgs.gov/product/shakemap/x/us/123/download/cont_mmi.json',
  'https://earthquake.usgs.gov/product/shakemap/x/us/123/download/grid.xml?next=evil'
 ])assert.equal(validateProductUrl(invalid),null);
});
test('event detail chooses official ShakeMap grid, never assumes ShakeMap exists',()=>{
 const chosen=selectUsGsGridProduct(detail(),ID);
 assert.equal(chosen.gridUrl,GRID_URL);
 assert.equal(chosen.productSource,'us');
 assert.equal(chosen.status,'GRID_AVAILABLE');
 assert.equal(selectUsGsGridProduct(detail(false),ID).status,'NO_USGS_SHAKEMAP_PRODUCT');
 assert.equal(selectUsGsGridProduct(detail(true,'https://localhost/grid.xml'),ID).status,'NO_SUPPORTED_USGS_GRID_XML');
 assert.throws(()=>selectUsGsGridProduct({...detail(),id:'different'},ID),{status:502});
});
test('MMI grid samples nearest reported node, not observed damage',()=>{
 const sample=sampleShakeGrid(gridXml(),SITE);
 assert.equal(sample.status,'USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE');
 assert.equal(sample.estimatedMmi,5.5);
 assert.deepEqual(sample.nearestGridPoint,SITE);
 assert.equal(sample.nearestDistanceKm,0);
 assert.equal(sample.siteDamageVerified,false);
 assert.equal(sample.earthquakeLossEstimate,null);
 assert.equal(sample.gridColumns,3);
 assert.equal(sample.observedGridRows,9);
});
test('outside grid is unknown, not reassuring MMI zero',()=>{
 const s=sampleShakeGrid(gridXml(),[-100,35]);
 assert.equal(s.status,'OUTSIDE_REPORTED_SHAKEMAP_GRID');
 assert.equal(s.estimatedMmi,null);
 assert.equal(s.nearestGridPoint,null);
});
test('XML parser refuses DTD, missing MMI, partial grids, invalid intensity and huge specs',()=>{
 assert.throws(()=>sampleShakeGrid('<!DOCTYPE foo>'+gridXml(),SITE),{status:502});
 assert.throws(()=>sampleShakeGrid(gridXml().replace('name="MMI"','name="PGA"'),SITE),{status:502});
 assert.throws(()=>sampleShakeGrid(gridXml().replace('-120 38 5.5\n',''),SITE),{status:502});
 assert.throws(()=>sampleShakeGrid(gridXml(99),SITE),{status:502});
 assert.throws(()=>sampleShakeGrid(gridXml().replace('nlon="3"','nlon="200000"'),SITE),{status:502});
 assert.throws(()=>sampleShakeGrid(gridXml(),[181,0]),{status:400});
});
test('only saved EPA facilities and USGS events are eligible for capture',async t=>{
 const h=await fixture(t),c=await h.service.choices();
 assert.equal(c.facilities.length,1);
 assert.equal(c.earthquakes.length,1);
 assert.equal(c.earthquakes[0].eventId,ID);
 await assert.rejects(h.service.capture({registryId:'999999999999',eventId:ID}),{status:409});
 await assert.rejects(h.service.capture({registryId:FRS,eventId:'USGS:notcaptured'}),{status:409});
 assert.equal(h.calls.length,0);
});
test('official detail and XML preserve product digest, local capture clock and MMI estimate',async t=>{
 const h=await fixture(t);
 const a=await h.service.capture({registryId:FRS,eventId:ID});
 assert.equal(a.deduplicated,false);
 assert.equal(a.record.sample.estimatedMmi,5.5);
 assert.equal(a.record.capturedAt,T1);
 assert.equal(a.record.siteCapturedAt,T0);
 assert.equal(a.record.eventFirstCapturedAt,T0);
 assert.equal(a.record.gridUrl,GRID_URL);
 assert.match(a.record.detailSha256,/^[a-f0-9]{64}$/);
 assert.match(a.record.gridSha256,/^[a-f0-9]{64}$/);
 assert.equal(a.record.verifiedSiteDamage,false);
 assert.equal(h.calls.length,2);
 assert(h.calls.every(x=>x.options.redirect==='error'&&x.options.method==='GET'));
 assert.equal((await h.service.capture({registryId:FRS,eventId:ID})).deduplicated,true);
 assert.equal((await h.service.view()).results.length,1);
});
test('missing USGS product records honest unknown, not fabricated MMI',async t=>{
 const h=await fixture(t);h.setDetail(detail(false));
 const a=await h.service.capture({registryId:FRS,eventId:ID});
 assert.equal(a.record.sample.status,'NO_USGS_SHAKEMAP_PRODUCT');
 assert.equal(a.record.sample.estimatedMmi,null);
 assert.equal(a.record.gridSha256,null);
 assert.equal(h.calls.length,1);
});
test('revisions are visible only after local capture, not at historical earthquake time',async t=>{
 const h=await fixture(t);
 await h.service.capture({registryId:FRS,eventId:ID});
 h.setNow(T2);h.setGrid(gridXml(6.8));
 const newer=await h.service.capture({registryId:FRS,eventId:ID});
 assert.equal(newer.deduplicated,false);
 assert.equal((await h.service.view({asOf:T1})).results[0].sample.estimatedMmi,5.5);
 const latest=await h.service.view({asOf:T2});
 assert.equal(latest.results[0].sample.estimatedMmi,6.8);
 assert.equal(latest.capturedRevisions,2);
 await assert.rejects(h.service.view({asOf:T3}),{status:400});
});
test('hash-linked local MMI journal survives restart and rejects modification',async t=>{
 const h=await fixture(t);await h.service.capture({registryId:FRS,eventId:ID});await h.service.close();
 const revived=createShakeMapSampler({facilityService:h.facilityService,
  globalEvents:h.globalEvents,filename:h.filename,now:()=>T2,
  fetchImpl:async()=>{throw Error('NO NETWORK ON READ');}});
 assert.equal((await revived.view()).results[0].sample.estimatedMmi,5.5);
 await revived.close();
 const before=await readFile(h.filename,'utf8');
 await writeFile(h.filename,before.replace('"estimatedMmi": 5.5','"estimatedMmi": 3.5'));
 const bad=createShakeMapSampler({facilityService:h.facilityService,
  globalEvents:h.globalEvents,filename:h.filename,now:()=>T2});
 await assert.rejects(bad.view(),{status:500});
});
test('disabled on remote host: no private reads, no network calls',async t=>{
 const h=await fixture(t,{enabled:false});
 await assert.rejects(h.service.choices(),{status:403});
 await assert.rejects(h.service.view(),{status:403});
 await assert.rejects(h.service.capture({registryId:FRS,eventId:ID}),{status:403});
 assert.equal(h.calls.length,0);
});
test('API blocks CSRF and arbitrary URLs, supports strict sampled site query',async t=>{
 const h=await fixture(t),handler=createShakeMapApi({service:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port+'/api/shakemap-mmi/';
 assert.equal((await fetch(root+'catalog')).status,200);
 assert.equal((await fetch(root+'choices')).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(T3))).status,400);
 assert.equal((await fetch(root+'view?unknown=x')).status,400);
 const body=JSON.stringify({registryId:FRS,eventId:ID});
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-ShakeMap':'1',
  Origin:'https://attacker.invalid'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-ShakeMap':'1'},
  body:JSON.stringify({registryId:FRS,eventId:ID,url:'http://localhost/.env'})})).status,400);
 const good=await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-ShakeMap':'1'},body});
 assert.equal(good.status,200);
 assert.equal((await good.json()).record.sample.estimatedMmi,5.5);
 assert.equal((await fetch(root+'view?registryId='+FRS)).status,200);
});
test('v0.43 UI, server route and static allowlist connect to the same source review',async()=>{
 const read=x=>readFile(new URL('../'+x,import.meta.url),'utf8');
 const [html,js,server,nav,build,security]=await Promise.all([
  read('usgs-shakemap.html'),read('usgs-shakemap.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs'),
  read('tests/security.test.mjs')]);
 for(const id of ['shakemap-capture','shakemapForm','mmiEvent','mmiFacility',
  'shakemap-history','mmiResults','mmiExport','mmi-proof-gates'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/shakemap-mmi/'));
 assert(server.includes('createShakeMapApi'));
 assert(server.includes('if(await handleShakeMap(req,res,u))return;'));
 assert(nav.includes("href:'/usgs-shakemap.html'"));
 assert(build.includes("'usgs-shakemap.js'"));
 assert(security.includes("'usgs-shakemap.js'"));
 assert.equal(USGS_MMI_VERSION,'USGS-SHAKEMAP-GRID-0.43.1');
 assert(USGS_MMI_GATES.includes('GRID_MMI_IS_USGS_ESTIMATED_SHAKING_NOT_OBSERVED_DAMAGE'));
});
