import test from 'node:test';
import assert from 'node:assert/strict';
import {technicalIndicators,eventStudy,volatilityBaseline,normalizeNews,normalizeUsgs,normalizeNasa,normalizeGdelt} from '../lib/analysis.mjs';
import {summarizeCompanyFacts,extractFilings} from '../lib/fundamentals.mjs';
import {makeSources} from '../lib/sources.mjs';
import {createIntelligenceApi} from '../lib/api.mjs';
import http from 'node:http';
const bars=(n=90,base=100)=>Array.from({length:n},(_,i)=>({t:new Date(Date.UTC(2026,4,1+i)).toISOString(),c:base+i*0.2,h:base+i*0.2+2,l:base+i*0.2-2,v:1000+i*10}));

test('technical indicators use only observed bars and missing history is honest',()=>{
 const a=technicalIndicators(bars());assert.equal(a.barsCount,90);assert.ok(a.sma20>0&&a.sma50>0);assert.equal(a.rsi14,100);assert.ok(Number.isFinite(a.macd));assert.ok(Number.isFinite(a.atr14));
 const b=technicalIndicators(bars(10));assert.equal(b.sma20,null);assert.equal(b.macd,null);assert.equal(b.rsi14,null);
});
test('EWMA baseline validates past-only projections and never claims directional accuracy',()=>{
 const f=volatilityBaseline(bars(90));assert.equal(f.status,'baseline');assert.equal(f.validationSessions,25);assert.ok(f.walkForwardAbsReturnMaePct>=0);assert.ok(f.volatilityEstimatePct>=0);
 assert.equal(volatilityBaseline(bars(15)).status,'insufficient_data');
});
test('event-study uses only completed sessions following the event and supports missing future bars',()=>{
 const d=['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11'];
 const a=d.map((day,i)=>({t:day+'T05:00:00Z',c:100+i*2,v:1000}));const b=d.map((day,i)=>({t:day+'T05:00:00Z',c:100+i,v:1000}));
 const s=eventStudy('2026-11-04T14:00:00Z',a,b,new Date('2026-11-11T19:00:00Z'));
 assert.equal(s.status,'observed');assert.equal(s.referenceSession,'2026-11-04');assert.equal(s.horizons[0].date,'2026-11-05');assert.equal(s.horizons[1].date,'2026-11-09');
 assert.equal(eventStudy('2026-11-10T21:00:00Z',a,b,new Date('2026-11-11T19:00:00Z')).status,'insufficient_data');
 assert.throws(()=>eventStudy('2099-11-11T00:00:00Z',a,b),/past/);
});
test('SEC quarterly facts require quarter-duration facts and comparable prior-year',()=>{
 const fact=(value,start,end,filed='2026-11-04')=>({val:value,start,end,form:'10-Q',filed});
 const x={cik:320193,entityName:'Test Company',facts:{'us-gaap':{
 RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[fact(120,'2026-07-01','2026-09-30'),fact(100,'2025-07-01','2025-09-30','2025-11-04'),fact(999,'2026-01-01','2026-09-30')] }},
 NetIncomeLoss:{units:{USD:[fact(20,'2026-07-01','2026-09-30')]}},GrossProfit:{units:{USD:[fact(60,'2026-07-01','2026-09-30')]}}
 }}};
 const f=summarizeCompanyFacts(x,'2026-11-11');assert.equal(f.quarterly.revenue.value,120);assert.equal(f.quarterly.revenue.yoyPct,20);assert.equal(f.ratios.quarterGrossMarginPct,50);assert.equal(f.quarterly.operatingIncome.value,null);
});
test('SEC filings preserve provenance and archive links',()=>{
 const out=extractFilings({cik:320193,name:'Test',tickers:['AAPL'],filings:{recent:{form:['10-Q','8-K','4'],accessionNumber:['0000320193-26-000001','0000320193-26-000002','0000320193-26-000003'],filingDate:['2026-11-04','2026-11-06','2026-11-07'],primaryDocument:['report.htm','news.htm','other.htm']}}});
 assert.equal(out.length,2);assert.ok(out[0].sourceUrl.includes('000032019326000001'));
});
test('source normalization does not imply news or natural events caused stock changes',()=>{
 const n=normalizeNews({news:[{id:1,headline:'Sample',created_at:'2026-11-11T10:00:00Z',symbols:['AAPL'],url:'https://example.org'}]});assert.deepEqual(n[0].symbols,['AAPL']);assert.equal(n[0].occurredAt,null);
 const e=normalizeUsgs({features:[{id:'a',properties:{title:'M 6.0 earthquake',time:1794400000000},geometry:{coordinates:[80,20,12]}}]});assert.deepEqual(e[0].symbols,[]);assert.equal(e[0].location.latitude,20);
 assert.equal(normalizeNasa({events:[{id:'x',title:'Wildfire',categories:[{title:'Wildfires'}],geometry:[{date:'2026-11-10T00:00:00Z',coordinates:[1,2]}]}]})[0].symbols.length,0);
 assert.equal(normalizeGdelt({articles:[{title:'Some report',seendate:'20261111T101010Z',url:'javascript:alert(1)'}]})[0].sourceUrl,null);
});
test('provider routes contain bounded fixed upstream URLs, credentials are not returned',async()=>{
 const seen=[];const fetchImpl=async (url,opts)=>{seen.push(String(url));assert.ok(/^(https:\/\/data\.alpaca\.markets|https:\/\/data\.sec\.gov|https:\/\/earthquake\.usgs\.gov|https:\/\/eonet\.gsfc\.nasa\.gov|https:\/\/api\.gdeltproject\.org)/.test(String(url)));return new Response(JSON.stringify(String(url).includes('/v1beta1/news')?{news:[{id:9,headline:'sample',created_at:'2026-11-11T10:00:00Z',symbols:['AAPL']}]}:{bars:[]}),{status:200});};
 const sources=makeSources({fetchImpl,env:{APCA_API_KEY_ID:'fake_key',APCA_API_SECRET_KEY:'fake_secret',SEC_USER_AGENT:'TestApp owner@example.com'}});
 const handle=createIntelligenceApi(sources);const server=http.createServer(async (req,res)=>{const u=new URL(req.url,'http://localhost');if(!await handle(req,res,u)){res.writeHead(404);res.end('missing')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}`;const ok=await fetch(url+'/api/intelligence/news?symbol=AAPL');assert.equal(ok.status,200);const value=await ok.text();assert.ok(value.includes('sample'));assert.ok(!value.includes('fake_secret'));const invalid=await fetch(url+'/api/intelligence/news?symbol=../FOO');assert.equal(invalid.status,400);const missing=await fetch(url+'/api/intelligence/impact?symbol=AAPL');assert.equal(missing.status,400);assert.equal(seen.length,1);}finally{await new Promise(r=>server.close(r));}
});
