import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeIntradayBars,createIntradayChartApi} from '../lib/intraday-chart.mjs';
const NOW=Date.parse('2026-11-12T20:00:00Z');
const bar=(time,o=100,h=105,l=98,c=103,v=900)=>({t:time,o,h,l,c,v});
const response=(bars,interval='5Min')=>({source:'ALPACA_IEX',feed:'iex',interval,bars,hasMore:false,pages:1});
async function serve(t,handler){const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});return 'http://127.0.0.1:'+server.address().port;}
test('intraday bars exclude unfinished intervals and reject fabricated or malformed prices',()=>{
 const result=normalizeIntradayBars(response([
   bar('2026-11-12T19:40:00Z'),bar('2026-11-12T19:50:00Z'),
   bar('2026-11-12T19:59:00Z'),bar('2026-11-12T19:40:00Z'),
   bar('2026-11-12T19:30:00Z',100,90,99,91,20),
   bar('2026-11-12T18:30:00Z',100,101,99,100,-1)
 ]),{symbol:'NVDA',interval:'5Min',now:NOW});
 assert.deepEqual(result.bars.map(x=>x.time),['2026-11-12T19:40:00.000Z','2026-11-12T19:50:00.000Z']);
 assert.equal(result.quality.rejectedBars,4);
 assert.equal(result.mode,'HISTORICAL_COMPLETED_INTRADAY_BARS');
 assert.equal(result.coverage,'single-venue');
 assert.equal(result.includesLivePrice,false);
 assert.match(result.limitations.join(' '),/Gaps are never filled/);
});
test('invalid source or interval rejected; timezones are normalized to UTC',()=>{
 const valid=normalizeIntradayBars(response([bar('2026-11-12T14:30:00-05:00')]),{symbol:'AAPL',interval:'5Min',now:NOW});
 assert.equal(valid.bars[0].time,'2026-11-12T19:30:00.000Z');
 assert.throws(()=>normalizeIntradayBars(response([]),{symbol:'FAKE',interval:'5Min',now:NOW}),{status:400});
 assert.throws(()=>normalizeIntradayBars(response([], '3Hour'),{symbol:'AAPL',interval:'3Hour',now:NOW}),{status:400});
 assert.throws(()=>normalizeIntradayBars({...response([]),source:'ALPACA_SIP'},{symbol:'AAPL',interval:'5Min',now:NOW}),{status:502});
});
test('bounded intraday API caches concurrent responses, validates requests and hides provider errors',async t=>{
 let requests=0;
 const api=createIntradayChartApi({now:()=>NOW,sources:{async intradayBars(symbol,opts){requests++;assert.equal(opts.feed,'iex');return response([bar('2026-11-12T19:30:00Z')],opts.interval);}}});
 const base=await serve(t,api);
 assert.equal((await fetch(base+'/api/chart/intraday?symbol=INVALID&interval=5Min')).status,400);
 assert.equal((await fetch(base+'/api/chart/intraday?symbol=AAPL&interval=3Hour')).status,400);
 const [a,b]=await Promise.all([fetch(base+'/api/chart/intraday?symbol=AAPL&interval=5Min'),fetch(base+'/api/chart/intraday?symbol=AAPL&interval=5Min')]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(requests,1);
 assert.equal((await a.json()).bars.length,1);
 assert.equal((await fetch(base+'/api/chart/intraday?symbol=AAPL',{method:'POST'})).status,405);
 const bad=createIntradayChartApi({now:()=>NOW,sources:{async intradayBars(){throw Error('SECRET_DO_NOT_LEAK')}}});
 const other=await serve(t,bad);const r=await fetch(other+'/api/chart/intraday?symbol=NVDA');
 assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(await r.json()),/SECRET_DO_NOT_LEAK/);
});
