import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLongHistoryMarket,normalizeEodhdDaily,EODHD_SOURCE} from '../lib/long-history-market.mjs';
import {createHistoricalBacktest,createHistoricalBacktestApi} from '../lib/historical-backtest.mjs';
import {evaluateMacroWarnings,MACRO_INDICATORS} from '../lib/macro-vintage.mjs';
const now=()=>new Date('2026-11-13T12:00:00Z');
const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function tradingRows(start,days,{adj=i=>100+i*.1,close=i=>120+i*.1}={}){
 const rows=[];
 for(let i=0;i<days;i++){
  const date=plus(start,i),dow=new Date(date+'T12:00:00Z').getUTCDay();
  if(dow===0||dow===6)continue;
  rows.push({date,open:99,high:123,low:98,close:close(i),adjusted_close:adj(i),volume:250000});
 }
 return rows;
}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function macro(){
 return {catalog:()=>({credentialsConfigured:true}),snapshot:async asOf=>{
  const observations=MACRO_INDICATORS.map((d,i)=>({
   id:d.id,seriesId:d.seriesId,status:'available',source:'FRED_ALFRED_VINTAGE',
   value:[-0.2,8,0.5][i],observationDate:asOf,asOf,vintageStart:asOf,vintageEnd:asOf}));
  const snapshot={source:'FRED_ALFRED_VINTAGE',asOf,observations};
  return {...snapshot,earlyWarning:evaluateMacroWarnings(snapshot)};
 }};
}
test('long-history adapter uses bounded fixed-host SPY.US JSON requests with private server token',async()=>{
 const seen=[],rows=tradingRows('2007-05-15',170);
 const svc=createLongHistoryMarket({env:{EODHD_API_TOKEN:'ExamplePrivateToken_12',EODHD_INTERNAL_RESEARCH_ENABLED:'true'},now,
  fetchImpl:async (url,options)=>{seen.push({url,options});return response(rows)}});
 const a=await svc.history({start:'2007-05-15',end:'2007-10-31'});
 assert.equal(seen.length,1);
 const u=new URL(seen[0].url);
 assert.equal(u.origin,'https://eodhd.com');
 assert.equal(u.pathname,'/api/eod/SPY.US');
 assert.equal(u.searchParams.get('fmt'),'json');
 assert.equal(u.searchParams.get('from'),'2007-05-15');
 assert.equal(u.searchParams.get('to'),'2007-10-31');
 assert.equal(u.searchParams.get('api_token'),'ExamplePrivateToken_12');
 assert.equal(seen[0].options.redirect,'error');
 assert.equal(a.source,EODHD_SOURCE);
 assert.equal(a.bars[0].close,100);
 assert.equal(a.priceBasis,'adjusted_close');
 assert(!JSON.stringify(a).includes('ExamplePrivateToken_12'));
 a.bars[0].close=1;
 const b=await svc.history({start:'2007-05-15',end:'2007-10-31'});
 assert.equal(seen.length,1);
 assert.equal(b.bars[0].close,100);
});
test('adjusted closes are not raw closes, and duplicate, missing, future or oversized responses fail',()=>{
 const rows=tradingRows('2007-06-01',20,{adj:i=>80+i,close:i=>120+i});
 const options={start:'2007-06-01',end:'2007-06-20',fetchedAt:'2026-11-13T00:00:00Z'};
 const item=normalizeEodhdDaily(rows,options);
 assert.equal(item.bars[0].close,80);
 assert.equal(item.coverage.sessions,rows.length);
 assert.throws(()=>normalizeEodhdDaily([...rows,rows[0]],options),/duplicated/);
 assert.throws(()=>normalizeEodhdDaily([{...rows[0],adjusted_close:undefined},...rows.slice(1)],options),/invalid/);
 assert.throws(()=>normalizeEodhdDaily([{...rows[0],date:'2020-01-01'},...rows.slice(1)],options),/out-of-range/);
 assert.throws(()=>normalizeEodhdDaily(rows.slice(6),options),/beginning/);
 assert.throws(()=>normalizeEodhdDaily(Array.from({length:651},(_,i)=>({...rows[0],date:plus('2006-01-01',i)})),options),/oversized/);
});
test('missing feature flag or credentials never fetch historical price data',async()=>{
 let calls=0;
 for(const env of [{},{EODHD_API_TOKEN:'ExamplePrivateToken_12'},{EODHD_API_TOKEN:'replace_with_your_eodhd_key',EODHD_INTERNAL_RESEARCH_ENABLED:'true'}]){
  const svc=createLongHistoryMarket({env,now,fetchImpl:async()=>{calls++;throw Error('provider must not be invoked')}});
  assert.equal(svc.catalog().enabled,false);
  await assert.rejects(svc.history({start:'2007-06-01',end:'2007-08-31'}),e=>e.status===503);
 }
 assert.equal(calls,0);
});
test('provider error messages never echo raw credential, provider body, or request URL',async()=>{
 const secret='SecretKeyProvidedX9';
 const svc=createLongHistoryMarket({env:{EODHD_API_TOKEN:secret,EODHD_INTERNAL_RESEARCH_ENABLED:'true'},now,
  fetchImpl:async()=>new Response('secret=' + secret,{status:403})});
 await assert.rejects(svc.history({start:'2007-06-01',end:'2007-08-31'}),e=>{
  assert.equal(e.status,503);assert(!e.message.includes(secret));assert(!e.message.includes('secret='));return true;
 });
});
test('unbounded requests and future dates are rejected before any external network call',async()=>{
 let calls=0;
 const svc=createLongHistoryMarket({env:{EODHD_API_TOKEN:'ExamplePrivateToken_12',EODHD_INTERNAL_RESEARCH_ENABLED:'true'},now,
  fetchImpl:async()=>{calls++;throw Error('must not request')}});
 for(const [start,end] of [['2007-01-01','2010-01-01'],['2026-11-12','2026-11-13'],['1990-01-01','1991-01-01'],['2007-02-30','2007-03-01']]){
  await assert.rejects(svc.history({start,end}),e=>e.status===400);
 }
 assert.equal(calls,0);
});
test('2008 replay includes licensed long-history SPY outcomes without feeding outcomes into macro signals',async()=>{
 const requests=[],market=createLongHistoryMarket({env:{EODHD_API_TOKEN:'ExamplePrivateToken_12',EODHD_INTERNAL_RESEARCH_ENABLED:'true'},now,
  fetchImpl:async url=>{requests.push(url);const u=new URL(url);const start=u.searchParams.get('from'),end=u.searchParams.get('to');
   const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
   return response(tradingRows(start,days,{adj:i=>i>=80?79:100,close:i=>i>=80?90:120}));}});
 const service=createHistoricalBacktest({macro:macro(),longHistoryMarket:market,
  marketSources:{researchBars:async()=>{throw Error('Alpaca should not run before 2016')}},now});
 const result=await service.replay({caseId:'financial-2008',horizonSessions:20,lossThresholdPct:10});
 assert.equal(requests.length,1);
 assert.equal(result.coverage.benchmarkStatus,'available_long_history_adjusted');
 assert.equal(result.sourceProvenance.market,EODHD_SOURCE);
 assert.equal(result.benchmarkPriceBasis,'current-revision dividend-and-split adjusted closing price');
 assert(result.coverage.benchmarkLabelledDecisions>0);
 assert(result.timeline.some(t=>t.market.marketSource===EODHD_SOURCE));
 assert(result.timeline.every(t=>t.signal==='candidate_warning'));
 assert.equal(result.crashProbability,null);
 assert.equal(result.calibratedForecast,false);
 assert(!JSON.stringify(result).includes('ExamplePrivateToken_12'));
 assert(!('bars' in result));
});
test('long-history subscription errors do not create fabricated 2008 forward outcomes',async()=>{
 const market=createLongHistoryMarket({env:{EODHD_API_TOKEN:'ExamplePrivateToken_12',EODHD_INTERNAL_RESEARCH_ENABLED:'true'},now,
  fetchImpl:async()=>new Response('not entitled',{status:403})});
 const service=createHistoricalBacktest({macro:macro(),longHistoryMarket:market,now});
 const result=await service.replay({caseId:'financial-2008'});
 assert.equal(result.coverage.benchmarkStatus,'unavailable_long_history_entitlement');
 assert.equal(result.coverage.benchmarkLabelledDecisions,0);
 assert(result.timeline.every(t=>t.market.status==='unavailable'));
 assert.equal(result.outcomes.descriptiveConfusion,null);
});
test('catalog confirms opt-in history and read-only API does not redistribute raw vendor bars',async t=>{
 const market=createLongHistoryMarket({env:{},now});
 const service=createHistoricalBacktest({macro:macro(),longHistoryMarket:market,now});
 const catalog=service.catalog();
 assert.equal(catalog.longHistory.enabled,false);
 assert.equal(catalog.longHistory.rawHistoryPubliclyExposed,false);
 const api=createHistoricalBacktestApi({service});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/backtest/replay?case=financial-2008');
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.coverage.benchmarkStatus,'unavailable_long_history_not_configured');
 assert(!('bars' in body));assert(!('api_token' in body));
 assert.equal((await fetch(base+'/api/backtest/replay',{method:'POST'})).status,405);
});
