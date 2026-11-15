/** Authenticated-to-provider on server; no synthetic intraday candles. */
const SYMBOLS=new Set(['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR']);
const DURATIONS={ '1Min':60000,'5Min':300000,'15Min':900000,'1Hour':3600000 };
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validPrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<1e9;
export function normalizeIntradayBars(payload,{symbol,interval='5Min',now=Date.now()}={}){
 if(!SYMBOLS.has(symbol)||!Object.hasOwn(DURATIONS,interval))throw fail('Unsupported pilot symbol or bar interval');
 if(payload?.source!=='ALPACA_IEX'||payload.feed!=='iex'||payload.interval!==interval||!Array.isArray(payload.bars)||payload.bars.length>4000)throw fail('Unsupported or excessive IEX intraday source',502);
 const current=Number(now);if(!Number.isFinite(current))throw fail('Invalid chart clock',500);
 let rejected=0;const unique=new Map();
 for(const bar of payload.bars){
  const epoch=Date.parse(bar?.t);
  if(!Number.isFinite(epoch)||epoch+DURATIONS[interval]>current||epoch>current){rejected++;continue;}
  if(![bar.o,bar.h,bar.l,bar.c].every(validPrice)||!Number.isSafeInteger(bar.v)||bar.v<0||bar.l>Math.min(bar.o,bar.c)||bar.h<Math.max(bar.o,bar.c)||bar.l>bar.h){rejected++;continue;}
  const time=new Date(epoch).toISOString();
  if(unique.has(time)){rejected++;continue;}
  unique.set(time,{time,open:bar.o,high:bar.h,low:bar.l,close:bar.c,volume:bar.v});
 }
 const bars=[...unique.values()].sort((a,b)=>a.time.localeCompare(b.time)).slice(-400);
 return {schemaVersion:1,source:'ALPACA_IEX',symbol,interval,mode:'HISTORICAL_COMPLETED_INTRADAY_BARS',
  feed:'iex',provider:'alpaca',coverage:'single-venue',adjustment:'split',bars,includesLivePrice:false,
  asOf:bars.at(-1)?.time||null,fetchedAt:new Date(current).toISOString(),
  quality:{returnedBars:bars.length,rejectedBars:rejected,partialHistory:Boolean(payload.partialHistory),hasMore:Boolean(payload.hasMore),sourcePages:payload.pages??null},
  limitations:['IEX single-venue historical intraday bars, not consolidated SIP or the complete market tape.',
  'Only completed intervals are presented. Gaps are never filled with synthetic zero-volume candles.',
  'No realtime streaming trade, quote, inferred VWAP, or calibrated forecast is inserted into this bar series.']};
}
export function createIntradayChartApi({sources,now=Date.now}={}){
 if(typeof sources?.intradayBars!=='function')throw new TypeError('Intraday charting requires a bounded source adapter');
 const cache=new Map(),inflight=new Map();
 return async(req,res,url)=>{
  if(url.pathname!=='/api/chart/intraday')return false;
  const reply=(status,data)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
  try{
   if(req.method!=='GET')throw fail('Method not allowed',405);
   const symbol=url.searchParams.get('symbol')||'',interval=url.searchParams.get('interval')||'5Min';
   if(!SYMBOLS.has(symbol)||!Object.hasOwn(DURATIONS,interval))throw fail('Choose supported security and 1Min/5Min/15Min/1Hour interval');
   const key=symbol+':'+interval,found=cache.get(key);
   if(found?.until>now()){reply(200,found.data);return true;}
   if(!inflight.has(key)){
    const task=(async()=>{const source=await sources.intradayBars(symbol,{interval,days:7,feed:'iex'});
      const result=normalizeIntradayBars(source,{symbol,interval,now:now()});
      cache.set(key,{data:result,until:now()+45000});return result;})();
    inflight.set(key,task);task.finally(()=>{if(inflight.get(key)===task)inflight.delete(key);}).catch(()=>{});
   }
   reply(200,await inflight.get(key));
  }catch(error){
   const status=[400,405,429,503,504].includes(error?.status)?error.status:502;
   reply(status,{error:status===502?'IEX intraday history unavailable; check source configuration, entitlement and coverage.':error.message});
  }
  return true;
 };
}
