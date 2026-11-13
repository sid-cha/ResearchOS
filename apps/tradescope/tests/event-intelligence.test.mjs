import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {EVENT_FAMILIES,normalizeFaaAirportEvents,buildEventCase,eventCatalog,createFaaLiveService,createEventIntelligenceApi} from '../lib/event-intelligence.mjs';

test('one event universe exposes aviation plus all existing scenario pathways without changing the v0.23 registry',()=>{
 const catalog=eventCatalog();
 assert.equal(EVENT_FAMILIES.length,8);
 assert.equal(catalog.families.length,8);
 assert.equal(catalog.scenarioCount,13);
 assert.equal(catalog.scenarios.length,13);
 assert.equal(catalog.scenarios.filter(x=>x.caseId).length,1);
 assert.equal(catalog.scenarios[0].theme,'aviation');
 assert.equal(catalog.scenarios[0].connectedFeed,'FAA_NAS_STATUS');
 assert(catalog.scenarios.some(x=>x.theme==='climate'));
 assert(catalog.scenarios.every(x=>!x.verifiedMarketImpact));
});

test('pre-event replay excludes the future incident, exposure pathways and sources not yet published',()=>{
 const before=buildEventCase({asOf:'2026-11-13T20:53:00Z',now:'2026-11-13T23:00:00Z'});
 assert.equal(before.event,null);
 assert.deepEqual(before.analogues,[]);
 assert.deepEqual(before.pathways,[]);
 assert.equal(before.precursorContext.observations.length,4);
 assert.equal(before.forecast.probability,null);
 assert.equal(before.precursorContext.warningIssuedInRealTime,false);
 assert(before.precursorContext.observations.every(e=>e.firstAvailableVerified===false));
 const earlier=buildEventCase({asOf:'2026-11-09T23:59:59Z',now:'2026-11-13T23:00:00Z'});
 assert.equal(earlier.precursorContext.observations.length,3);
 assert(!earlier.precursorContext.observations.some(e=>e.id==='smart-2026'));
 const oldest=buildEventCase({asOf:'2026-09-13T23:59:59Z',now:'2026-11-13T23:00:00Z'});
 assert.deepEqual(oldest.precursorContext.observations.map(e=>e.id),['gau-2024']);
});

test('current retrospective case presents candidate pathways, explicit unknown loss and adversarial review',()=>{
 const c=buildEventCase({now:'2026-11-13T23:00:00Z'});
 assert.equal(c.event.id,'faa-national-ground-stop-2026-11-13');
 assert(c.pathways.length>=6);
 assert(c.challenges.length>=5);
 assert(c.pathways.every(x=>x.measuredLoss===null&&!x.causalEdgeValidated&&!x.verifiedIssuerExposure));
 assert.equal(c.forecast.status,'NOT_VALIDATED');
 assert(c.challenges.some(c=>c.code==='CAUSALITY_UNPROVEN'));
 assert(c.challenges.some(c=>c.code==='LOOKAHEAD_RISK'));
});

test('historical checkpoints enforce UTC second precision and reject future cutoffs',()=>{
 for(const asOf of ['2026-11-13','garbage','2026-11-14T00:00:00Z','2026-11-13T20:53:00+00:00','2026-11-13T20:54:00Z','2026-11-13T20:55:00Z','2026-02-31T00:00:00Z']){
  assert.throws(()=>buildEventCase({asOf,now:'2026-11-13T23:00:00Z'}));
 }
});

test('FAA adapter normalizes airport status without inferring a nationwide stop or issuer damage',()=>{
 const result=normalizeFaaAirportEvents([
  {airportId:'JFK',groundStop:{id:'abc',reason:'AIR TRAFFIC CONTROL'},airportConfig:{arrivalRate:23}},
  {airportId:'ORD',groundDelay:{reason:'weather'}},
  {airportId:'LAX',airportClosure:{reason:'runway'}},
  {airportId:'https://bad.invalid',groundStop:{reason:'not valid'}}
 ],{fetchedAt:'2026-11-13T22:00:00Z'});
 assert.equal(result.counts.groundStops,1);
 assert.equal(result.counts.groundDelays,1);
 assert.equal(result.counts.airportClosures,1);
 assert.equal(result.events.length,3);
 assert.equal(result.nationwideOrderVerified,false);
 assert(result.events.every(x=>x.nationwideOrderVerified===false));
 assert(!JSON.stringify(result).includes('bad.invalid'));
 assert.throws(()=>normalizeFaaAirportEvents({events:[]}));
});

test('FAA source uses a fixed official URL, bounded JSON, timeout and no user-controlled external URLs',async()=>{
 let seen;
 const live=createFaaLiveService({now:()=> '2026-11-13T23:00:00Z',fetchImpl:async(url,options)=>{
  seen={url,options};return {ok:true,headers:{get:()=> 'application/json'},
   text:async()=>JSON.stringify([{airportId:'DFW',groundStop:{reason:'Equipment'}}])};
 }});
 const data=await live();
 assert.equal(seen.url,'https://nasstatus.faa.gov/api/airport-events');
 assert.equal(seen.options.redirect,'error');
 assert.equal(data.events[0].airport,'DFW');
 assert.equal(data.nationwideOrderVerified,false);
 const bad=createFaaLiveService({fetchImpl:async()=>({ok:true,headers:{get:()=> 'application/json'},text:async()=>'{bad'})});
 await assert.rejects(bad(),/FAA live source unavailable/);
});

test('HTTP route is read-only, rejects unknown inputs, exposes catalog and historical as-of with no future incident facts',async t=>{
 const api=createEventIntelligenceApi({now:()=> '2026-11-13T23:00:00Z',
  live:async()=>normalizeFaaAirportEvents([{airportId:'JFK',groundStop:{reason:'test fixture'}}])});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port+'/api/event-intelligence/';
 const catalog=await(await fetch(root+'catalog')).json();
 assert.equal(catalog.scenarioCount,13);
 const replay=await(await fetch(root+'case?id=faa-national-ground-stop-2026-11-13&asOf=2026-11-13T20%3A53%3A00Z')).json();
 assert.equal(replay.event,null);
 const current=await(await fetch(root+'case?id=faa-national-ground-stop-2026-11-13')).json();
 assert.equal(current.event.eventType,'AVIATION_NATIONWIDE_GROUND_STOP');
 assert.equal((await fetch(root+'case?id=faa-national-ground-stop-2026-11-13&asOf=2028-01-01T00%3A00%3A00Z')).status,400);
 assert.equal((await fetch(root+'case?id=evil')).status,400);
 assert.equal((await fetch(root+'faa-live?url=https://evil.invalid')).status,404);
 assert.equal((await fetch(root+'case',{method:'POST'})).status,405);
 const f=await(await fetch(root+'faa-live')).json();assert.equal(f.events[0].airport,'JFK');
});

test('portal assets are syntax-valid, accessible from static allowlist and contain source/uncertainty guards',async()=>{
 const [html,js,css,build,server]=await Promise.all([
  readFile(new URL('../event-portal.html',import.meta.url),'utf8'),
  readFile(new URL('../event-portal.js',import.meta.url),'utf8'),
  readFile(new URL('../event-portal.css',import.meta.url),'utf8'),
  readFile(new URL('../scripts/build-static.mjs',import.meta.url),'utf8'),
  readFile(new URL('../server.mjs',import.meta.url),'utf8')
 ]);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(html,/id="familyFilter"/);
 assert.match(html,/id="precursors"/);
 assert.match(html,/id="challenges"/);
 assert.match(html,/id="refreshFaa"/);
 assert.match(html,/id="asOf"/);
 assert.match(js,/nationwideOrderVerified|Nationwide order not verified/);
 assert.match(html,/source-first/i);
 for(const name of ['event-portal.html','event-portal.js','event-portal.css']){
  assert(build.includes("'"+name+"'"));
  assert(server.includes("'"+'/'+name+"'"));
 }
 assert(css.includes('@media'));
});
