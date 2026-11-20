import test from 'node:test';
import assert from 'node:assert/strict';
import {rankThematicAnalogues,createThematicResearch} from '../lib/thematic-analogues.mjs';
const NOW=Date.parse('2026-11-12T22:00:00Z');
const filing=(id,day,form='8-K',headline='Issuer announced material contract')=>({
 id:'sec:'+id,headline,type:'FILING',form,source:'SEC EDGAR',
 publishedAt:day+'T16:00:00Z',
 sourceUrl:'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/fixture.htm',symbols:['MSFT']
});
const samples=[
 filing('new','2026-11-11'),
 filing('old','2026-10-11'),
 filing('other','2026-09-11','10-Q','Issuer reports new quarterly results'),
 filing('future','2026-11-20')
];
test('corporate theme compares only older dated records; no causal or forecast claims',()=>{
 const r=rankThematicAnalogues(samples,{theme:'corporate',eventId:'sec:new',now:NOW,limit:5});
 assert.equal(r.event.id,'sec:new');
 assert.deepEqual(r.matches.map(x=>x.event.id),['sec:old','sec:other']);
 assert(r.matches.every(x=>x.event.comparisonTime<r.event.comparisonTime));
 assert(r.matches.every(x=>x.similarity>=0&&x.similarity<=1));
 assert(r.coverage.incompleteHistory);assert.match(r.limitations.join(' '),/not a statistically validated/);
 assert(r.matches.every(x=>x.limitations.join(' ').includes('No issuer exposure')));
});
test('historical comparison rejects stale IDs and unsupported themes',()=>{
 assert.throws(()=>rankThematicAnalogues(samples,{theme:'corporate',eventId:'sec:missing',now:NOW}),{status:404});
 assert.throws(()=>rankThematicAnalogues(samples,{theme:'currency',eventId:'sec:new',now:NOW}),{status:400});
 assert.throws(()=>rankThematicAnalogues(samples,{theme:'corporate',eventId:'sec:new',limit:99,now:NOW}),{status:400});
});
test('source list distinguishes provider coverage and media reports from verified events',async()=>{
 const m=createThematicResearch({now:()=>NOW,sources:{
  async filings(){return {filings:samples,fetchedAt:'2026-11-12T20:00:00Z'};},
  async news(){return {events:[{id:'alpaca:one',headline:'Issuer business update',publishedAt:'2026-11-10T10:00:00Z',source:'Alpaca News'}]};},
  async hazards(){return {events:[{id:'usgs:x',headline:'Earthquake record',occurredAt:'2026-11-10T10:00:00Z',source:'USGS'}]};},
  async geopolitics(){return {events:[{id:'gdelt:x',headline:'Media reported supply bottleneck',publishedAt:'2026-11-10T10:00:00Z',source:'GDELT'}]};}
 }});
 const corporate=await m.list({theme:'corporate',symbol:'MSFT'});assert.equal(corporate.source,'SEC_EDGAR');
 assert(!corporate.events.some(x=>x.id==='sec:future'));
 const compared=await m.analogues({theme:'corporate',symbol:'MSFT',eventId:'sec:new'});
 assert.equal(compared.matches.length,2);
 const news=await m.list({theme:'news',symbol:'MSFT'});assert.equal(news.source,'ALPACA_NEWS');
 const geo=await m.list({theme:'geopolitical',symbol:'MSFT'});assert.equal(geo.source,'GDELT_MEDIA');
 assert.match(geo.limitations.join(' '),/media coverage candidates/);
});
test('missing optional providers do not break existing research constructor',async()=>{
 const m=createThematicResearch({now:()=>NOW,sources:{async filings(){return {filings:samples};}}});
 assert.equal((await m.list({theme:'corporate'})).events.length,3);
 await assert.rejects(m.list({theme:'news'}),{status:503});
});
