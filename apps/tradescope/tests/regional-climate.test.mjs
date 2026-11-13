import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
 createRegionalClimate,createRegionalClimateApi,createPowerMonthlyUrl,normalizePowerMonthly
} from '../lib/regional-climate.mjs';

const now=()=>new Date('2026-11-13T12:00:00Z');
const region={id:'argentina-pampas',label:'Pampas, Argentina — representative point',country:'Argentina',lat:-33.89,lon:-60.57,graphId:'enso-fertilizer',pointOnly:true};
const monthly=year=>Object.fromEntries(Array.from({length:12},(_,i)=>[year+String(i+1).padStart(2,'0'),i+1]));
const data=(year=2007,overrides={})=>{
 const result={geometry:{type:'Point',coordinates:[region.lon,region.lat,100]},
   parameters:{PRECTOTCORR:{units:'mm/day'},T2M:{units:'C'}},
   properties:{parameter:{PRECTOTCORR:monthly(year),T2M:monthly(year)}}};
 return {...result,...overrides};
};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
test('provider URL is fixed NASA POWER monthly AG, with registered point and bounded inputs',()=>{
 const svc=createRegionalClimate({now,fetchImpl:async()=>json(data())});
 const r=svc.catalog().regions[0];
 const u=new URL(createPowerMonthlyUrl(r,2007));
 assert.equal(u.origin,'https://power.larc.nasa.gov');
 assert.equal(u.pathname,'/api/temporal/monthly/point');
 assert.equal(u.searchParams.get('community'),'AG');
 assert.equal(u.searchParams.get('parameters'),'PRECTOTCORR,T2M');
 assert.equal(u.searchParams.get('format'),'JSON');
 assert.equal(u.searchParams.get('start'),'2007');
 assert.equal(u.searchParams.get('end'),'2007');
 assert.equal(u.searchParams.get('longitude'),'-60.57');
 assert.throws(()=>createPowerMonthlyUrl({...r,lon:0},2007),/Unsupported/);
 assert.throws(()=>createPowerMonthlyUrl(r,1970),/Invalid/);
});
test('monthly climate values are sourced point observations, not historical warning inputs or anomalies',async()=>{
 const calls=[],svc=createRegionalClimate({now,fetchImpl:async(url,options)=>{calls.push({url,options});return json(data())}});
 const result=await svc.monthly({regionId:'argentina-pampas',year:2007});
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(result.region.id,'argentina-pampas');
 assert.equal(result.geoScope,'ONE MODEL GRID POINT; NOT A REGIONAL AVERAGE');
 assert.equal(result.months.length,12);
 assert.equal(result.months[0].precipitationMmPerDay,1);
 assert.equal(result.months[0].temperatureC,1);
 assert.equal(result.metrics.precipitation.unit,'mm/day');
 assert.equal(result.coverage.precipitationMonths,12);
 assert.equal(result.source,'NASA_POWER_MONTHLY_CURRENT_REVISION');
 assert.equal(result.validForHistoricalExAnteSignal,false);
 assert.equal(result.provenance.originalAsOfVintageAvailable,false);
 assert.equal(result.provenance.firstPublishedAt,null);
 assert.match(result.provenance.receipt.digest,/^[a-f0-9]{64}$/);
 assert.equal(result.derivedAnomaly,null);
 assert.equal(result.companyExposure,null);
 assert.equal(result.estimatedReturn,null);
});
test('calendar cutoff hides future months but makes no publication-time availability claim',async()=>{
 let calls=0;
 const svc=createRegionalClimate({now,fetchImpl:async()=>{calls++;return json(data())}});
 const first=await svc.monthly({regionId:'argentina-pampas',year:2007,asOf:'2007-08-01'});
 assert.equal(first.months.length,7);
 assert.equal(first.months.at(-1).month,'200707');
 assert(!first.months.some(x=>x.month>='200708'));
 assert.match(first.asOfSemantics,/not historical publication-time/);
 assert.equal(first.validForHistoricalExAnteSignal,false);
 const second=await svc.monthly({regionId:'argentina-pampas',year:2007,asOf:'2007-04-01'});
 assert.equal(second.months.length,3);
 assert.equal(calls,1);
 assert.equal(first.provenance.receipt.digest,second.provenance.receipt.digest);
 second.months[0].precipitationMmPerDay=999;
 const third=await svc.monthly({regionId:'argentina-pampas',year:2007});
 assert.equal(third.months[0].precipitationMmPerDay,1);
});
test('zero precipitation is real; -999 and absent fields are missing rather than invented or negative',async()=>{
 const x=data();
 x.properties.parameter.PRECTOTCORR['200701']=0;
 x.properties.parameter.PRECTOTCORR['200702']=-999;
 delete x.properties.parameter.T2M['200703'];
 const svc=createRegionalClimate({now,fetchImpl:async()=>json(x)});
 const r=await svc.monthly({regionId:'argentina-pampas',year:2007});
 assert.equal(r.months[0].precipitationMmPerDay,0);
 assert.equal(r.months[1].precipitationMmPerDay,null);
 assert.equal(r.months[2].temperatureC,null);
 assert.equal(r.coverage.missingPrecipitationMonths,1);
 assert.equal(r.coverage.missingTemperatureMonths,1);
});
test('provider payload rejects bad geometry, bad units, impossible values and invalid JSON',async()=>{
 const opts={year:2007,region,fetchedAt:'2026-11-13T12:00:00Z'};
 const mismatch=data(2007,{geometry:{coordinates:[25,45]}});
 assert.throws(()=>normalizePowerMonthly(mismatch,opts),/location/);
 const noUnit=data(2007,{parameters:{PRECTOTCORR:{units:'unknown'},T2M:{units:'C'}}});
 assert.throws(()=>normalizePowerMonthly(noUnit,opts),/units/);
 const wrong=data();wrong.properties.parameter.PRECTOTCORR['200704']=-4;
 assert.throws(()=>normalizePowerMonthly(wrong,opts),/out-of-range/);
 const huge=data();huge.properties.parameter.T2M['200705']=Infinity;
 assert.throws(()=>normalizePowerMonthly(huge,opts),/malformed/);
 const svc=createRegionalClimate({now,fetchImpl:async()=>new Response('bad json',{headers:{'content-type':'application/json'}})});
 await assert.rejects(svc.monthly({regionId:'argentina-pampas',year:2007}),e=>e.status===502);
});
test('invalid region, partial or future year, and inconsistent asOf reject without a provider call',async()=>{
 let calls=0;
 const svc=createRegionalClimate({now,fetchImpl:async()=>{calls++;return json(data())}});
 for(const input of [
  {regionId:'outside-allowlist',year:2007},{regionId:'argentina-pampas',year:2026},
  {regionId:'argentina-pampas',year:1980},{regionId:'argentina-pampas',year:2007,asOf:'2008-01-01'},
  {regionId:'argentina-pampas',year:2007,asOf:'2007-02-30'},
  {regionId:'argentina-pampas',year:2007,asOf:'2026-12-12'}]){
  await assert.rejects(svc.monthly(input),e=>e.status===400);
 }
 assert.equal(calls,0);
});
test('upstream rate limits, forbidden MIME and response-size violations are explicit and bounded',async()=>{
 const opts={now};
 const limited=createRegionalClimate({...opts,fetchImpl:async()=>new Response('sensitive',{status:429})});
 await assert.rejects(limited.monthly({regionId:'argentina-pampas',year:2007}),e=>e.status===429&&!e.message.includes('sensitive'));
 const mime=createRegionalClimate({...opts,fetchImpl:async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}})});
 await assert.rejects(mime.monthly({regionId:'argentina-pampas',year:2007}),e=>e.status===502);
 const big=createRegionalClimate({...opts,fetchImpl:async()=>new Response('x'.repeat(350001),{headers:{'content-type':'application/json'}})});
 await assert.rejects(big.monthly({regionId:'argentina-pampas',year:2007}),e=>e.status===502);
});
test('read-only API validates request params and never exposes raw provider data',async t=>{
 const svc=createRegionalClimate({now,fetchImpl:async()=>json(data())}),api=createRegionalClimateApi({service:svc});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const catalog=await fetch(base+'/api/geoclimate/catalog');
 assert.equal(catalog.status,200);
 const catalogData=await catalog.json();
 assert.equal(catalogData.regions.length,4);
 assert.equal(catalogData.asOfVintage,false);
 const response=await fetch(base+'/api/geoclimate/monthly?region=argentina-pampas&year=2007&asOf=2007-08-01');
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.months.length,7);
 assert.equal(body.validForHistoricalExAnteSignal,false);
 assert(!('properties' in body));
 assert.equal((await fetch(base+'/api/geoclimate/monthly?region=argentina-pampas&year=2007&year=2008')).status,400);
 assert.equal((await fetch(base+'/api/geoclimate/monthly?region=argentina-pampas&year=2007&url=https://evil.invalid')).status,400);
 assert.equal((await fetch(base+'/api/geoclimate/monthly?region=argentina-pampas&year=2007&asOf=2007-09-31')).status,400);
 assert.equal((await fetch(base+'/api/geoclimate/catalog',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/geoclimate/unknown')).status,404);
});
