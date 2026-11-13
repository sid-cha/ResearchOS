import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {normalizeUsgsEvents,createUsgsEventFeed,normalizeAssetClaim,createExposureRegistry,
 greatCircleKm,proximityScreen,createGeoExposureService,createGeoExposureApi} from '../lib/geo-exposure.mjs';

const now=()=>new Date('2026-11-13T21:00:00Z');
const eventTime=Date.parse('2026-11-12T12:00:00Z');
const feature=(id='us12345678',lon=-117.5,lat=35.8)=>({
 type:'Feature',id,geometry:{type:'Point',coordinates:[lon,lat,8]},
 properties:{mag:5.3,place:'Near Ridgecrest, California',time:eventTime,
 updated:eventTime+30000,url:'https://earthquake.usgs.gov/earthquakes/eventpage/'+id}
});
const earthquake=(features=[feature()])=>({
 type:'FeatureCollection',metadata:{generated:Date.parse('2026-11-13T12:00:00Z'),count:features.length},
 features
});
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
const claim=()=>({
 symbol:'MOS',cik:'0001285785',assetName:'Analyst-submitted test site',assetType:'Production site',
 country:'United States',latitude:35.82,longitude:-117.52,
 issuerFilingUrl:'https://www.sec.gov/Archives/edgar/data/1285785/filing.htm',
 issuerFilingDate:'2026-02-27',
 issuerExcerpt:'The source filing excerpt is recorded for future independent ownership review.',
 geoEvidenceUrl:'https://www.eia.gov/tools/faqs/',
 geoEvidenceDate:'2026-02-25',
 geoExcerpt:'The separate official geographic source excerpt would require exact location validation.',
 notes:'Fixture only, not a claimed real-world facility.'
});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tradescope-geo-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 return path.join(dir,'assets.json');
}
test('USGS GeoJSON normalizer sources valid official coordinates and explicitly refuses damage claims',()=>{
 const d=normalizeUsgsEvents(earthquake(),{fetchedAt:'2026-11-13T20:00:00Z'});
 assert.equal(d.source,'USGS_COMCAT_RECENT_GEOJSON');
 assert.equal(d.tier,'4.5_week');
 assert.equal(d.events.length,1);
 assert.equal(d.events[0].latitude,35.8);
 assert.equal(d.events[0].longitude,-117.5);
 assert.equal(d.events[0].depthKm,8);
 assert.equal(d.events[0].sourceUrl,'https://earthquake.usgs.gov/earthquakes/eventpage/us12345678');
 assert.equal(d.events[0].hasVerifiedIssuerLink,false);
 assert.equal(d.events[0].publicationClockVerified,false);
 assert.equal(d.historicalAsOfEligible,false);
 assert(d.limitations.some(x=>x.includes('epicenter')));
});
test('USGS source validation rejects arbitrary URLs, invalid coordinates, duplications and malformed observations',()=>{
 assert.throws(()=>normalizeUsgsEvents(earthquake([feature('us12345678',200,5)])),e=>e.status===502);
 assert.throws(()=>normalizeUsgsEvents(earthquake([feature(),feature()])),e=>e.status===502);
 const spoof=feature();spoof.properties.url='https://evil.invalid/fake';
 assert.throws(()=>normalizeUsgsEvents(earthquake([spoof])),e=>e.status===502);
 const wrong=feature();wrong.properties.mag=999;
 assert.throws(()=>normalizeUsgsEvents(earthquake([wrong])),e=>e.status===502);
 assert.throws(()=>normalizeUsgsEvents({features:[]}),e=>e.status===502);
 assert.throws(()=>normalizeUsgsEvents(earthquake(),{tier:'arbitrary_url'}),e=>e.status===502);
});
test('USGS live feed connector only contacts documented HTTPS host and never needs API secrets',async()=>{
 let calls=0,request=null;
 const feed=createUsgsEventFeed({now,fetchImpl:async(url,options)=>{calls++;request={url,options};
  return response(earthquake());}});
 const result=await feed.recent('4.5_month');
 assert.equal(result.events[0].id,'us12345678');
 assert.equal(calls,1);
 assert.equal(request.url,'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson');
 assert.equal(request.options.redirect,'error');
 assert.equal(feed.catalog().authentication,'NO_KEY_FOR_PUBLIC_FEED');
 await feed.recent('4.5_month');assert.equal(calls,1);
 await assert.rejects(feed.recent('https://evil.invalid/'),e=>e.status===400);
});
test('asset entry requires two distinct official evidence references, original dates and a bound SEC issuer ID',()=>{
 const a=normalizeAssetClaim(claim(),{now});
 assert.equal(a.independentlyVerified,false);
 assert.equal(a.operationsVerified,false);
 assert.equal(a.historicalFirstAvailableVerified,false);
 assert.equal(a.evidenceStatus,'ANALYST_SUBMITTED_UNVERIFIED');
 assert.throws(()=>normalizeAssetClaim({...claim(),symbol:'NVDA'},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),latitude:400},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),geoEvidenceUrl:'https://evil.invalid/geo'},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),issuerFilingUrl:'https://evil.invalid/fake'},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),assetName:'<script>bad</script>'},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),issuerFilingDate:'2027-01-01'},{now}),e=>e.status===400);
 assert.throws(()=>normalizeAssetClaim({...claim(),providerSecret:'must-not-save'},{now}),e=>e.status===400);
});
test('geo asset store persists local candidate across restart and deduplicates repeated evidence claims',async t=>{
 const filename=await fixture(t),one=createExposureRegistry({filename,now});
 const saved=await one.add(claim());
 assert.equal(saved.status,'RECORDED_UNVERIFIED');
 assert.equal(saved.revision,1);
 const same=await one.add(claim());
 assert.equal(same.status,'ALREADY_SUBMITTED');
 const reopened=createExposureRegistry({filename,now});
 const list=await reopened.list();
 assert.equal(list.total,1);
 assert.equal(list.assets[0].assetName,'Analyst-submitted test site');
 assert.equal(list.assets[0].independentlyVerified,false);
 assert.equal(list.assets[0].issuerExcerpt,claim().issuerExcerpt);
 assert.equal(list.assets[0].evidenceHash.length,64);
 assert(!JSON.stringify(list).includes('providerSecret'));
});
test('corrupted source store is not silently reset and concurrent writes stay serial',async t=>{
 const filename=await fixture(t);
 const registry=createExposureRegistry({filename,now});
 const records=await Promise.all(Array.from({length:9},()=>registry.add(claim())));
 assert.equal(records.filter(x=>x.status==='RECORDED_UNVERIFIED').length,1);
 assert.equal((await registry.list()).total,1);
 await fs.writeFile(filename,'{"bad":true}','utf8');
 await assert.rejects(registry.list(),e=>e.status===409);
 await assert.rejects(registry.add(claim()),e=>e.status===409);
});
test('haversine geospatial screening reports distance but never creates an impact or historical evidence',()=>{
 assert.equal(greatCircleKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
 const event=normalizeUsgsEvents(earthquake()).events[0];
 const listed={id:'asset-test-123',...normalizeAssetClaim(claim(),{now})};
 const result=proximityScreen(event,[listed],{radiusKm:25});
 assert.equal(result.length,1);
 assert(result[0].distanceKm<5);
 assert.equal(result[0].assetEvidenceStatus,'ANALYST_SUBMITTED_UNVERIFIED');
 assert.equal(result[0].screenStatus,'EPICENTER_PROXIMITY_CANDIDATE_NOT_SHAKING_OR_LOSS');
 assert.equal(result[0].independentDamageVerification,false);
 assert.equal(result[0].estimatedFinancialLoss,null);
 assert.equal(proximityScreen(event,[listed],{radiusKm:25,asOf:'2020-02-15'}).length,0);
 assert.equal(proximityScreen(event,[listed],{radiusKm:25,asOf:'2026-11-13'})[0].historicalEligibility,
  'HISTORICAL_FIRST_AVAILABLE_NOT_VERIFIED');
 assert.throws(()=>proximityScreen(event,[listed],{radiusKm:9999}),e=>e.status===400);
});
test('geo research catalog does not quietly convert country-level company disclosures to geocoded facilities',async()=>{
 const svc=createGeoExposureService({events:createUsgsEventFeed({fetchImpl:async()=>response(earthquake()),now})});
 const catalog=svc.catalog();
 assert.equal(catalog.issuerBusinessProfiles.length,3);
 assert(catalog.issuerBusinessProfiles.every(x=>x.facilityCoordinates===null&&x.eventSpecificExposureVerified===false));
 assert.equal(catalog.facilitiesRegisteredByAnalyst,false);
 const none=await svc.listing();assert.equal(none.total,0);
 const screening=await svc.screen({eventId:'us12345678',radiusKm:100});
 assert.equal(screening.facilityClaims,0);
 assert.equal(screening.matches.length,0);
 assert.equal(screening.historicalAsOfEligible,false);
 assert.throws(()=>svc.record(claim()),e=>e.status===403);
});
test('local evidence HTTP recording requires explicit server enablement and same-origin JSON',async t=>{
 const filename=await fixture(t);
 const service=createGeoExposureService({events:createUsgsEventFeed({
  fetchImpl:async()=>response(earthquake()),now
 }),registry:createExposureRegistry({filename,now}),now});
 const api=createGeoExposureApi({service,writeEnabled:true});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const root='http://127.0.0.1:'+server.address().port+'/api/geo-exposure/';
 const catalog=await (await fetch(root+'catalog')).json();
 assert.equal(catalog.facilitiesRegisteredByAnalyst,true);
 const events=await (await fetch(root+'events?tier=4.5_week')).json();
 assert.equal(events.events.length,1);
 assert.equal((await fetch(root+'events?tier=https://evil.invalid')).status,400);
 assert.equal((await fetch(root+'events?url=https://evil.invalid')).status,404);
 const post=async(headers,body=claim())=>fetch(root+'assets',{method:'POST',
  headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post({Origin:'https://evil.invalid'})).status,403);
 assert.equal((await post({})).status,403);
 assert.equal((await post({Origin:'http://127.0.0.1:'+server.address().port},{...claim(),secret:'xyz'})).status,400);
 const saved=await post({Origin:'http://127.0.0.1:'+server.address().port});
 assert.equal(saved.status,201);
 assert.equal((await (await fetch(root+'assets')).json()).total,1);
 const screen=await (await fetch(root+'proximity?eventId=us12345678&radiusKm=25')).json();
 assert.equal(screen.matches.length,1);
 assert.equal(screen.matches[0].issuerImpactVerified,false);
 assert.equal((await fetch(root+'proximity?eventId=unknown')).status,404);
 assert.equal((await fetch(root+'assets',{method:'PUT'})).status,405);
 const notAllowed=createGeoExposureApi({service,writeEnabled:false});
 const disabled=http.createServer((req,res)=>void notAllowed(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>disabled.listen(0,'127.0.0.1',ok));
 t.after(async()=>{disabled.closeAllConnections();await new Promise(ok=>disabled.close(ok));});
 assert.equal((await fetch('http://127.0.0.1:'+disabled.address().port+'/api/geo-exposure/assets',{
  method:'POST',headers:{Origin:'http://127.0.0.1:'+disabled.address().port,'content-type':'application/json'},
  body:JSON.stringify(claim())})).status,403);
});
test('geo exposure frontend remains static, local-first and syntax-valid',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,js,css]=await Promise.all(['geo-exposure.html','geo-exposure.js','geo-exposure.css'].map(x=>fs.readFile(path.join(root,x),'utf8')));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'geo-exposure.js'}));
 for(const id of ['loadEvents','tier','eventCount','events','screen','radius','issuerCount','issuers',
  'assetCount','assets','claimForm','assetName','issuerFilingUrl','geoEvidenceUrl'])
  assert(html.includes('id="'+id+'"'),'Missing '+id);
 assert(html.includes('href="/geo-exposure.css"'));
 assert(html.includes('src="/geo-exposure.js"'));
 assert(js.includes('/api/geo-exposure/'));
 assert(!js.includes('api.eia.gov'));assert(!js.includes('data.alpaca.markets'));
 assert(css.includes('.issuer-grid'));
});
