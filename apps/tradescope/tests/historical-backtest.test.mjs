import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMacroVintage,evaluateMacroWarnings,MACRO_INDICATORS} from '../lib/macro-vintage.mjs';
import {planReplayDates,forwardOutcome,normalizeBenchmark,buildHistoricalStudy,createHistoricalBacktest,createHistoricalBacktestApi} from '../lib/historical-backtest.mjs';

const asDate=(base,n)=>new Date(Date.parse(base+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const key='a'.repeat(32);
function vintage(day,{curve=-0.2,hy=6.5,nfci=0.2,missing=[]}={}){
 const observations=MACRO_INDICATORS.map((ind,index)=>({
  id:ind.id,seriesId:ind.seriesId,source:'FRED_ALFRED_VINTAGE',asOf:day,status:missing.includes(ind.id)?'unavailable':'available',
  value:missing.includes(ind.id)?null:[curve,hy,nfci][index],observationDate:day,
  vintageStart:day,vintageEnd:day
 }));
 const raw={source:'FRED_ALFRED_VINTAGE',asOf:day,observations};
 return {...raw,earlyWarning:evaluateMacroWarnings(raw)};
}
function fakeMacro(options={}){
 return {catalog:()=>({credentialsConfigured:options.configured!==false}),snapshot:async day=>{
  if(options.calls)options.calls.push(day);
  return vintage(day,options.missingFor?.(day)||{});
 }};
}
function barsAfter(start,n,closeFor=i=>100){
 return Array.from({length:n},(_,i)=>({date:asDate(start,i),close:closeFor(i)}));
}
function providerBars(start,n,closeFor=i=>100){
 return {source:'ALPACA_IEX',feed:'iex',adjustment:'split',hasMore:false,partialHistory:false,
  bars:Array.from({length:n},(_,i)=>({t:asDate(start,i)+'T20:00:00Z',c:closeFor(i)}))};
}
test('preset planner bounds days, future dates, user-selected scenarios and requested horizons',()=>{
 const now=()=>new Date('2026-11-13T12:00:00Z');
 const p=planReplayDates({caseId:'financial-2008'},now);
 assert.equal(p.dates.length,7);
 assert.equal(p.dates[0],'2007-06-01');
 assert.equal(p.dates.at(-1),'2007-08-24');
 assert.equal(p.horizonSessions,20);
 assert.throws(()=>planReplayDates({caseId:'unknown'},now),/registered/);
 assert.throws(()=>planReplayDates({caseId:'covid-2020',start:'2020-01-01',end:'2020-08-01'},now),/bounded/);
 assert.throws(()=>planReplayDates({caseId:'control-2017',start:'2017-01-01',end:'2027-01-01'},now),/bounded/);
 assert.throws(()=>planReplayDates({caseId:'covid-2020',cadenceDays:1},now),/Unsupported/);
 assert.throws(()=>planReplayDates({caseId:'covid-2020',horizonSessions:12},now),/Unsupported/);
});
test('forward market labels never read a same-day close, require complete future windows and find first drawdown',()=>{
 const bars=barsAfter('2020-01-01',28,i=>i===12?88:100);
 const x=forwardOutcome({asOf:'2020-01-02',bars,horizonSessions:20,lossThresholdPct:10});
 assert.equal(x.status,'measured');
 assert.equal(x.entryDate,'2020-01-03');
 assert.equal(x.eventOccurred,true);
 assert.equal(x.firstBreachDate,'2020-01-13');
 assert.equal(x.sessionsUntilBreach,10);
 const absent=forwardOutcome({asOf:'2020-01-25',bars,horizonSessions:20,lossThresholdPct:10});
 assert.equal(absent.status,'unavailable');
});
test('benchmark validation rejects partial history, ambiguous duplicates and large unobserved gaps',()=>{
 const mock=providerBars('2020-01-01',10);
 assert.equal(normalizeBenchmark(mock).length,10);
 assert.throws(()=>normalizeBenchmark({...mock,partialHistory:true}),/partial/);
 assert.throws(()=>normalizeBenchmark({...mock,bars:[...mock.bars,mock.bars[0]]}),/duplicate/);
 assert.throws(()=>normalizeBenchmark({...mock,bars:[mock.bars[0],{t:'2020-03-01T20:00:00Z',c:99}]}),/gap/);
});
test('historical macro replay correctly records missing market 2008 without fabricated false alarms',async()=>{
 const service=createHistoricalBacktest({macro:fakeMacro(),marketSources:{researchBars:async()=>{throw Error('should never fetch 2008 market history')}},now:()=>new Date('2026-11-13T12:00:00Z')});
 const study=await service.replay({caseId:'financial-2008'});
 assert.equal(study.timeline.length,7);
 assert.equal(study.coverage.warningDecisions,7);
 assert.equal(study.coverage.benchmarkStatus,'unsupported_before_2016');
 assert.equal(study.coverage.benchmarkLabelledDecisions,0);
 assert.equal(study.outcomes.descriptiveConfusion,null);
 assert.equal(study.outcomes.precision,null);
 assert.equal(study.crashProbability,null);
 assert.equal(study.calibratedForecast,false);
});
test('replay marks inadequate macro evidence as indeterminate rather than nonwarning',async()=>{
 const service=createHistoricalBacktest({macro:fakeMacro({missingFor:()=>({missing:['high_yield_oas','financial_conditions_nfci']})}),now:()=>new Date('2026-11-13T12:00:00Z')});
 const study=await service.replay({caseId:'financial-2008'});
 assert.equal(study.coverage.evaluatedDecisions,0);
 assert.equal(study.coverage.warningDecisions,0);
 assert(study.timeline.every(row=>row.signal==='insufficient_data'));
 assert(study.timeline.every(row=>row.market.status==='unavailable'));
});
test('wrong historical macro snapshot dates or invalid realtime validity are rejected',()=>{
 const plan=planReplayDates({caseId:'financial-2008'},()=>new Date('2026-11-13T12:00:00Z'));
 const snapshots=plan.dates.map(day=>vintage(day));
 snapshots[0].asOf='2007-06-02';
 assert.throws(()=>buildHistoricalStudy({plan,snapshots}),/mismatched/);
 snapshots[0]=vintage(plan.dates[0]);
 snapshots[0].observations[0].vintageStart='2020-01-01';
 assert.throws(()=>buildHistoricalStudy({plan,snapshots}),/contemporaneous/);
});
test('non-overlapping outcomes contribute to descriptive counts; derived performance rates remain unavailable for small samples',()=>{
 const plan=planReplayDates({caseId:'covid-2020',start:'2020-01-03',end:'2020-02-14',cadenceDays:7,horizonSessions:5},()=>new Date('2026-11-13T12:00:00Z'));
 const snapshots=plan.dates.map((d,i)=>vintage(d,i%2?{curve:1,hy:3,nfci:-1}:{curve:-0.5,hy:8,nfci:1}));
 const bars=barsAfter('2020-01-01',85,i=>i>8&&i<12?80:100);
 const study=buildHistoricalStudy({plan,snapshots,benchmarkBars:bars,benchmarkStatus:'available'});
 assert.equal(study.timeline.length,7);
 assert(study.coverage.independentLabelledDecisions<study.coverage.benchmarkLabelledDecisions);
 assert(study.coverage.overlappingOutcomesExcluded>0);
 assert.equal(study.outcomes.ratesStatus,'INSUFFICIENT_INDEPENDENT_SAMPLE');
 assert.equal(study.outcomes.precision,null);
 const confusion=study.outcomes.descriptiveConfusion;
 assert.equal(confusion.trueWarning+confusion.falseWarning+confusion.missedDrop+confusion.trueNormal,study.coverage.independentLabelledDecisions);
});
test('provider retrieval uses registered SPY only and split-adjusted IEX with bounded end, caches results',async()=>{
 const calls=[],dates=[],macro=fakeMacro({calls:dates});
 const service=createHistoricalBacktest({macro,marketSources:{researchBars:async(symbol,options)=>{
  calls.push({symbol,options});
  return providerBars('2020-01-03',200,i=>i>45&&i<56?85:100);
 }},now:()=>new Date('2026-11-13T12:00:00Z')});
 const params={caseId:'covid-2020',start:'2020-01-03',end:'2020-02-14',cadenceDays:7,horizonSessions:5};
 const a=await service.replay(params);
 assert.equal(a.sourceProvenance.market,'ALPACA_IEX_SPY_SPLIT_ADJUSTED');
 assert.equal(calls.length,1);
 assert.equal(calls[0].symbol,'SPY');
 assert.equal(calls[0].options.feed,'iex');
 assert.equal(calls[0].options.adjustment,'split');
 a.timeline[0].signal='mutated';
 const b=await service.replay(params);
 assert.notEqual(b.timeline[0].signal,'mutated');
 assert.equal(calls.length,1);
 assert.equal(dates.length,7);
});
test('historical replay requires credentials before expensive requests',async()=>{
 let requests=0;
 const service=createHistoricalBacktest({macro:{catalog:()=>({credentialsConfigured:false}),snapshot:async()=>{requests++}},now:()=>new Date('2026-11-13T12:00:00Z')});
 await assert.rejects(service.replay({caseId:'financial-2008'}),e=>e.status===503);
 assert.equal(requests,0);
});
test('backtest read-only routes strictly validate parameters and expose preset metadata',async t=>{
 const service=createHistoricalBacktest({macro:fakeMacro({configured:false}),now:()=>new Date('2026-11-13T12:00:00Z')});
 const handler=createHistoricalBacktestApi({service});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const c=await fetch(base+'/api/backtest/catalog');assert.equal(c.status,200);
 const catalog=await c.json();assert.equal(catalog.presets.length,3);
 assert.equal(catalog.calibratedForecast,false);
 assert.equal((await fetch(base+'/api/backtest/replay?case=financial-2008')).status,503);
 assert.equal((await fetch(base+'/api/backtest/replay?case=financial-2008&case=covid-2020')).status,400);
 assert.equal((await fetch(base+'/api/backtest/replay?case=financial-2008&feed=sip')).status,400);
 assert.equal((await fetch(base+'/api/backtest/replay?case=financial-2008&cadence=NaN')).status,400);
 assert.equal((await fetch(base+'/api/backtest/catalog',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/backtest/nothing')).status,404);
});
test('real ALFRED adapter can serve deterministic injected replay without a live credential',async()=>{
 const dates=[];
 const macro=createMacroVintage({env:{FRED_API_KEY:key},now:()=>new Date('2026-11-13T12:00:00Z'),
  fetchImpl:async url=>{
   const u=new URL(url),day=u.searchParams.get('realtime_start'),series=u.searchParams.get('series_id');
   dates.push({day,series});
   const val=series==='T10Y3M'?'-0.2':series==='NFCI'?'0.5':'7.0';
   return new Response(JSON.stringify({realtime_start:day,realtime_end:day,count:1,observations:[{
    date:day,value:val,realtime_start:day,realtime_end:day
   }]}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
 const replay=createHistoricalBacktest({macro,now:()=>new Date('2026-11-13T12:00:00Z')});
 const s=await replay.replay({caseId:'financial-2008'});
 assert.equal(s.timeline.length,7);
 assert.equal(dates.length,21);
 assert(dates.every(x=>s.timeline.some(t=>t.asOf===x.day)));
 assert.equal(s.coverage.warningDecisions,7);
});
