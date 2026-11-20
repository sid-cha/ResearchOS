import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMacroVintage,createMacroVintageApi,parseAlfredSeries,evaluateMacroWarnings,MACRO_INDICATORS} from '../lib/macro-vintage.mjs';
const key='a'.repeat(32),asOf='2007-08-01';
const observation=(value='-0.25',date='2007-07-31')=>({date,value,realtime_start:'2007-08-01',realtime_end:'2007-08-01'});
const payload=(rows=[observation()])=>({realtime_start:asOf,realtime_end:asOf,count:rows.length,observations:rows});
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
test('ALFRED requests strictly bind realtime and observation_end to the historical asOf date',async()=>{
 const requests=[];
 const service=createMacroVintage({env:{FRED_API_KEY:key},now:()=>new Date('2026-11-13T12:00:00Z'),
  fetchImpl:async url=>{const u=new URL(url);requests.push(u);return json(payload());}});
 const result=await service.snapshot(asOf);
 assert.equal(requests.length,3);
 for(const u of requests){
  assert.equal(u.hostname,'api.stlouisfed.org');
  assert.equal(u.searchParams.get('realtime_start'),asOf);
  assert.equal(u.searchParams.get('realtime_end'),asOf);
  assert.equal(u.searchParams.get('observation_end'),asOf);
  assert(u.searchParams.get('observation_start')<asOf);
  assert.equal(u.searchParams.get('file_type'),'json');
 }
 assert.equal(result.source,'FRED_ALFRED_VINTAGE');
 assert.equal(result.earlyWarning.calibratedForecast,false);
 assert.equal(result.earlyWarning.crashProbability,null);
 assert.equal(result.earlyWarning.availableRules,3);
 assert.equal(result.earlyWarning.triggeredRules,1);
 assert.equal(result.observations[0].value,-0.25);
});
test('reject forward observations, invalid vintage periods and provider dates different from asOf',()=>{
 assert.throws(()=>parseAlfredSeries(payload([observation('1','2007-08-02')]),{series:'T10Y3M',asOf}),/future/);
 assert.throws(()=>parseAlfredSeries(payload([{...observation(),realtime_start:'2007-08-02'}]),{series:'T10Y3M',asOf}),/future/);
 assert.throws(()=>parseAlfredSeries({...payload(),realtime_start:'2026-11-13'},{series:'T10Y3M',asOf}),/misdated/);
 assert.throws(()=>parseAlfredSeries(payload([observation('Infinity')]),{series:'T10Y3M',asOf}),/invalid numerical/);
});
test('stale or absent published vintage observations never become a triggered rule',()=>{
 const old=parseAlfredSeries(payload([observation('99','2007-03-01')]),{series:'BAMLH0A0HYM2',asOf});
 assert.equal(old.status,'unavailable');assert.equal(old.value,null);
 const missing=parseAlfredSeries(payload([observation('.')]),{series:'T10Y3M',asOf});
 assert.equal(missing.status,'unavailable');
 const assessment=evaluateMacroWarnings({asOf,observations:[old,missing]});
 assert.equal(assessment.availableRules,0);assert.equal(assessment.triggeredRules,0);
 assert.equal(assessment.rules[0].triggered,null);
 assert.equal(assessment.crashProbability,null);
});
test('unavailable upstream series are partial observations and never borrowed from future vintages',async()=>{
 const service=createMacroVintage({env:{FRED_API_KEY:key},now:()=>new Date('2026-11-13T12:00:00Z'),
 fetchImpl:async url=>new URL(url).searchParams.get('series_id')==='NFCI'?new Response('fail',{status:503}):json(payload())});
 const result=await service.snapshot(asOf);
 assert.equal(result.earlyWarning.availableRules,2);
 assert.equal(result.observations.find(x=>x.seriesId==='NFCI').status,'unavailable');
 assert.equal(result.earlyWarning.evidenceStatus,'PARTIAL_POINT_IN_TIME_EVIDENCE');
});
test('defensive cache copies prevent mutation leakage across requests',async()=>{
 let calls=0;
 const service=createMacroVintage({env:{FRED_API_KEY:key},now:()=>new Date('2026-11-13T12:00:00Z'),fetchImpl:async()=>{calls++;return json(payload());}});
 const one=await service.snapshot(asOf);one.observations[0].value=100;
 const two=await service.snapshot(asOf);assert.equal(two.observations[0].value,-0.25);assert.equal(calls,3);
});
test('bad date, missing credentials and unsupported dates fail closed',async()=>{
 const noKey=createMacroVintage({env:{},now:()=>new Date('2026-11-13T12:00:00Z')});
 await assert.rejects(noKey.snapshot(asOf),e=>e.status===503);
 const withKey=createMacroVintage({env:{FRED_API_KEY:key},now:()=>new Date('2026-11-13T12:00:00Z')});
 await assert.rejects(withKey.snapshot('2026-11-14'),e=>e.status===400);
 await assert.rejects(withKey.snapshot('2007-02-30'),e=>e.status===400);
});
test('macro API is GET-only with descriptive catalog, no credentials exposed and bounded errors',async t=>{
 const service=createMacroVintage({env:{},now:()=>new Date('2026-11-13T12:00:00Z')});
 const handler=createMacroVintageApi({service});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const c=await fetch(base+'/api/macro/catalog');
 assert.equal(c.status,200);
 const catalog=await c.json();
 assert.equal(catalog.indicators.length,MACRO_INDICATORS.length);
 assert.equal(catalog.credentialsConfigured,false);
 assert(!JSON.stringify(catalog).includes(key));
 assert.equal((await fetch(base+'/api/macro/snapshot?asOf='+asOf)).status,503);
 assert.equal((await fetch(base+'/api/macro/snapshot?asOf='+asOf+'&asOf='+asOf)).status,400);
 assert.equal((await fetch(base+'/api/macro/catalog',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/macro/not-found')).status,404);
});
