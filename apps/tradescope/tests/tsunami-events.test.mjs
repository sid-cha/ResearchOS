import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTsunamiRecords,createTsunamiResearch} from '../lib/tsunami-events.mjs';
import {createThematicResearch} from '../lib/thematic-analogues.mjs';
const NOW=Date.parse('2026-11-12T22:00:00Z');
const fixture={items:[
 {id:1001,year:2020,month:8,day:10,hour:5,minute:30,second:2.5,eventValidity:4,locationName:'Pacific example',country:'Example Coast',causeCode:1,eqMagnitude:7.2},
 {id:1002,year:2018,month:11,day:3,eventValidity:4,locationName:'Day precision only',country:'Example Coast',causeCode:3},
 {id:1003,year:2029,month:8,day:10,eventValidity:4,locationName:'Future catalogue record'},
 {id:1004,year:2020,month:2,day:30,eventValidity:4,locationName:'Impossible date'},
 {id:1005,year:2020,month:8,day:10,eventValidity:0,locationName:'Invalidated record'}]};
test('NOAA tsunami records preserve calendar-only precision and filter invalid or future records',()=>{
 const out=normalizeTsunamiRecords(fixture,{now:NOW});
 assert.equal(out.events.length,2);
 assert.equal(out.source,'NOAA_NCEI_HAZEL');
 const exact=out.events.find(x=>x.id==='noaa:tsunami:1001');
 assert.equal(exact.timeBasis,'occurred_at');assert.equal(exact.occurredAt,'2020-08-10T05:30:02Z');
 const day=out.events.find(x=>x.id==='noaa:tsunami:1002');
 assert.equal(day.timeBasis,'calendar_day_only');assert.equal(day.occurredAt,null);
 assert.equal(day.comparisonTime,'2018-11-03');assert.equal(day.timePrecision,'day');
 assert(out.limitations.join(' ').includes('NOT a complete'));
});
test('NOAA response is bounded and does not forward external provider error bodies',async()=>{
 const source=createTsunamiResearch({now:()=>NOW,fetchImpl:async()=>new Response(JSON.stringify(fixture),{headers:{'content-type':'application/json'}})});
 const first=await source.list(),again=await source.list();assert.equal(first.events.length,2);assert.deepEqual(first,again);
 first.events[0].headline='Client mutation';
 assert.notEqual((await source.list()).events[0].headline,'Client mutation');
 const bad=createTsunamiResearch({now:()=>NOW,fetchImpl:async()=>new Response('private NOAA detail',{status:429})});
 await assert.rejects(bad.list(),error=>error.status===429&&!error.message.includes('private NOAA detail'));
 const over=createTsunamiResearch({now:()=>NOW,fetchImpl:async()=>new Response(new ReadableStream({cancel(){}}),{headers:{'content-length':String(3*1024*1024)}})});
 await assert.rejects(over.list(),{status:413});
});
test('thematic tsunami integration and natural event category filters are source-backed',async()=>{
 const tsunamis=createTsunamiResearch({now:()=>NOW,fetchImpl:async()=>new Response(JSON.stringify(fixture),{headers:{'content-type':'application/json'}})});
 const sources={
  async filings(){return {filings:[]};},
  async hazards(){return {events:[
   {id:'eonet:1',headline:'California wildfires',type:'WILDFIRES',occurredAt:'2026-11-01T00:00:00Z',source:'NASA EONET'},
   {id:'eonet:2',headline:'Pacific cyclone',type:'SEVERE_STORMS',occurredAt:'2026-11-01T00:00:00Z',source:'NASA EONET'},
   {id:'eonet:3',headline:'River flooding',type:'FLOODS',occurredAt:'2026-11-01T00:00:00Z',source:'NASA EONET'}]};}
 };
 const model=createThematicResearch({sources,now:()=>NOW,tsunamis});
 const ts=await model.list({theme:'tsunami',symbol:'AAPL'});
 assert.equal(ts.events.length,2);assert.equal(ts.source,'NOAA_NCEI_HAZEL');
 assert.equal(ts.events.find(e=>e.id==='noaa:tsunami:1002').timeBasis,'calendar_day_only');
 const analogues=await model.analogues({theme:'tsunami',eventId:'noaa:tsunami:1001'});
 assert.equal(analogues.matches.length,1);assert.equal(analogues.matches[0].event.id,'noaa:tsunami:1002');
 assert(analogues.coverage.incompleteHistory);assert.match(analogues.limitations.join(' '),/not a statistically validated/);
 assert.equal((await model.list({theme:'natural',hazardType:'wildfire'})).events.length,1);
 assert.equal((await model.list({theme:'natural',hazardType:'storm'})).events.length,1);
 assert.equal((await model.list({theme:'natural',hazardType:'flood'})).events.length,1);
 await assert.rejects(model.list({theme:'natural',hazardType:'unknown'}),{status:400});
});
