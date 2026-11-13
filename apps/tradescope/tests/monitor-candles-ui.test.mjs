import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../monitor-candles.js',import.meta.url),'utf8');
const bars=Array.from({length:55},(_,i)=>{
 const date=new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10);
 return {time:date,open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i*5};
});
const chart={schemaVersion:1,symbol:'NVDA',mode:'HISTORICAL_COMPLETED_DAILY_BARS',feed:'iex',provider:'alpaca',coverage:'single-venue',source:'ALPACA_IEX',
 interval:'1Day',includesLivePrice:false,windowSessions:60,bars,asOf:bars.at(-1).time,adjustment:'split',quality:{incompleteWindow:true}};
function harness(fetchImpl){
 const ids=new Map(),requests=[];
 const element=id=>{
  if(!ids.has(id))ids.set(id,{id,hidden:false,textContent:'',innerHTML:'',value:id==='chartDayWindow'?'60':'',
   events:new Map(),addEventListener(type,handler){this.events.set(type,handler);},fire(type){this.events.get(type)?.({target:this});}});
  return ids.get(id);
 };
 const w={addEventListener(){}};
 const context=vm.createContext({document:{getElementById:element},window:w,
  fetch:(url,options)=>{requests.push({url,options});return fetchImpl(url,options);},
  URLSearchParams,AbortController,Date,Intl,Number,String,Math,setTimeout,clearTimeout});
 vm.runInContext(source,context,{filename:'monitor-candles.js'});
 return {window:w,element,requests,flush:async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('historical Monitor renders real labeled candlesticks, SMA and volume without altering selected live trade',async()=>{
 const h=harness(async()=>({ok:true,json:async()=>chart}));
 h.window.TradeScopeCandles.render({mode:'DEMO',symbol:'NVDA'});await h.flush();assert.equal(h.requests.length,0);
 h.window.TradeScopeCandles.render({mode:'LIVE',symbol:'NVDA'});
 await h.flush();
 assert.equal(h.requests.length,1);
 assert.match(h.requests[0].url,/\/api\/chart\/daily\?symbol=NVDA&sessions=60/);
 assert.match(h.element('marketChart').innerHTML,/candle-svg/);
 assert.match(h.element('marketChart').innerHTML,/LAST COMPLETED SESSION CLOSE/);
 assert.match(h.element('marketChart').innerHTML,/SMA20/);
 assert.match(h.element('chartHistoryMeta').textContent,/HISTORICAL \/ COMPLETED 1D IEX BARS/);
 assert.match(h.element('chartHistoryMeta').textContent,/SINGLE VENUE/);
 assert.doesNotMatch(h.element('chartHistoryMeta').textContent,/PREDICTED/i);
});
test('unsupported chart response preserves explicit unavailable instead of drawing synthetic candles',async()=>{
 const h=harness(async()=>({ok:true,json:async()=>({...chart,source:'ALPACA_SIP'})}));
 h.window.TradeScopeCandles.render({mode:'LIVE',symbol:'NVDA'});
 await h.flush();
 assert.match(h.element('marketChart').innerHTML,/HISTORICAL CHART UNAVAILABLE/);
 assert.doesNotMatch(h.element('marketChart').innerHTML,/<svg/);
});
test('snapshot mode changes do not request a new chart on every live trade repaint',async()=>{
 const h=harness(async()=>({ok:true,json:async()=>chart}));
 h.window.TradeScopeCandles.render({mode:'LIVE',symbol:'NVDA'});
 await h.flush();
 h.window.TradeScopeCandles.render({mode:'LIVE',symbol:'NVDA'});
 await h.flush();
 assert.equal(h.requests.length,1);
});

test('Monitor intraday selector requests supported interval without mixing daily sessions or live trade price',async()=>{
 const intraday={...chart,mode:'HISTORICAL_COMPLETED_INTRADAY_BARS',interval:'5Min',windowSessions:undefined,
  bars:[{time:'2026-11-12T19:30:00.000Z',open:100,high:102,low:99,close:101,volume:1000},
  {time:'2026-11-12T19:35:00.000Z',open:101,high:104,low:100,close:103,volume:1100}],asOf:'2026-11-12T19:35:00.000Z'};
 const h=harness(async url=>({ok:true,json:async()=>url.includes('/intraday?')?intraday:chart}));
 h.window.TradeScopeCandles.render({mode:'LIVE',symbol:'NVDA'});await h.flush();
 h.element('chartInterval').value='5Min';h.element('chartInterval').fire('change');await h.flush();
 assert(h.requests.some(r=>r.url.includes('/api/chart/intraday?symbol=NVDA&interval=5Min')));
 assert.equal(h.element('chartDayWindowWrap').hidden,true);
 assert.match(h.element('marketChart').innerHTML,/LAST COMPLETED BAR CLOSE/);
 assert.match(h.element('marketChart').innerHTML,/BAR VOLUME/);
 assert.match(h.element('chartHistoryMeta').textContent,/HISTORICAL \/ COMPLETED 5Min IEX BARS/);
 assert.doesNotMatch(h.element('chartHistoryMeta').textContent,/PREDICTION PROBABILITY/);
});
