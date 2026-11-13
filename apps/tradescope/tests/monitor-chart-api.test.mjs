import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeDailyCandles,createMonitorChartApi} from '../lib/monitor-chart-api.mjs';
const NOW=Date.parse('2026-11-12T20:00:00Z');
const bar=(day,overrides={})=>({t:day+'T05:00:00Z',o:101,h:104,l:100,c:103,v:2000,...overrides});
const source=(bars)=>({source:'ALPACA_IEX',feed:'iex',adjustment:'split',bars,partialHistory:false,hasMore:false});
test('completed IEX daily candles preserve OHLCV, exclude current day and reject malformed rows',()=>{
 const raw=source([bar('2026-11-09'),bar('2026-11-10'),bar('2026-11-11'),bar('2026-11-12'),bar('2026-11-10',{h:4}),bar('2026-11-08',{v:-10})]);
 const data=normalizeDailyCandles(raw,{symbol:'NVDA',sessions:20,now:NOW});
 assert.deepEqual(data.bars.map(b=>b.time),['2026-11-09','2026-11-10','2026-11-11']);
 assert.equal(data.bars[2].close,103);
 assert.equal(data.quality.discardedBars,3);
 assert.equal(data.quality.incompleteWindow,true);
 assert.equal(data.coverage,'single-venue');
 assert.equal(data.includesLivePrice,false);
 assert.match(data.limitations.join(' '),/not real-time or consolidated SIP/);
});
test('bar normalization rejects crossed OHLCV, unknown symbols and non-IEX provider attribution',()=>{
 assert.equal(normalizeDailyCandles(source([bar('2026-11-11',{l:105})]),{symbol:'AAPL',sessions:20,now:NOW}).bars.length,0);
 assert.equal(normalizeDailyCandles(source([bar('2026-11-11',{h:90})]),{symbol:'AAPL',sessions:20,now:NOW}).bars.length,0);
 assert.throws(()=>normalizeDailyCandles(source([]),{symbol:'EVIL',sessions:20,now:NOW}),{status:400});
 assert.throws(()=>normalizeDailyCandles({...source([]),source:'ALPACA_SIP'}, {symbol:'NVDA',sessions:20,now:NOW}),{status:502});
 assert.throws(()=>normalizeDailyCandles(source([]), {symbol:'NVDA',sessions:999,now:NOW}),{status:400});
});
async function serve(t,chart){
 const server=http.createServer(async(req,res)=>{
  if(!await chart(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 return 'http://127.0.0.1:'+server.address().port;
}
test('daily candle HTTP route enforces pilot limits and reuses bounded provider response',async t=>{
 let calls=0,opts=null;
 const chart=createMonitorChartApi({now:()=>NOW,sources:{async researchBars(symbol,options){calls++;opts=options;return source([bar('2026-11-11')]);}}});
 const base=await serve(t,chart);
 const invalid=await fetch(base+'/api/chart/daily?symbol=NOT_PERMITTED&sessions=20');
 assert.equal(invalid.status,400);assert.equal(calls,0);
 const bad=await fetch(base+'/api/chart/daily?symbol=NVDA&sessions=999');
 assert.equal(bad.status,400);assert.equal(calls,0);
 const [a,b]=await Promise.all([fetch(base+'/api/chart/daily?symbol=NVDA&sessions=20'),fetch(base+'/api/chart/daily?symbol=NVDA&sessions=20')]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(calls,1);
 assert.equal(opts.feed,'iex');assert.equal(opts.adjustment,'split');
 const data=await a.json();assert.equal(data.bars.length,1);assert.equal(data.quality.returnedSessions,1);
 assert.equal((await fetch(base+'/api/chart/daily?symbol=NVDA&sessions=20',{method:'POST'})).status,405);
});
test('upstream failure never leaks keys in public market-chart response',async t=>{
 const chart=createMonitorChartApi({now:()=>NOW,sources:{async researchBars(){throw Error('APCA_API_SECRET_KEY=should-never-appear');}}});
 const base=await serve(t,chart);
 const r=await fetch(base+'/api/chart/daily?symbol=NVDA&sessions=20');
 assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(await r.json()),/should-never-appear/);
});
