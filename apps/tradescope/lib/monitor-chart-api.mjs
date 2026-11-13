/** Monitor completed-session chart API.
 * IEX daily OHLCV is a venue-limited historical source, never a tick-complete
 * reconstruction or an intraday/live price candle. No credentials reach clients.
 */
const PILOT=new Set(['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR']);
const WINDOWS=new Set([20,60,120,250]);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const dateET=value=>{
 const d=new Date(value);
 if(!Number.isFinite(d.valueOf()))return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const get=type=>parts.find(part=>part.type===type)?.value;
 return [get('year'),get('month'),get('day')].join('-');
};
const finitePrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<1_000_000_000;
export function normalizeDailyCandles(data,{symbol,sessions=60,now=Date.now()}={}){
 if(!PILOT.has(symbol)||!WINDOWS.has(sessions))throw error('Unsupported pilot symbol or daily chart window');
 const stamp=Number(now);
 if(!Number.isFinite(stamp))throw error('Chart clock is unavailable',500);
 const today=dateET(stamp);
 if(data?.source!=='ALPACA_IEX'||data.feed!=='iex'||!Array.isArray(data.bars))throw error('IEX completed daily bar source unavailable',502);
 if(data.bars.length>3000)throw error('Upstream returned excessive daily bar history',502);
 const byDay=new Map();let discarded=0;
 for(const bar of data.bars){
  const day=typeof bar?.t==='string'&&Number.isFinite(Date.parse(bar.t))?dateET(bar.t):null;
  if(!day||day>=today){discarded++;continue;}
  if(![bar.o,bar.h,bar.l,bar.c].every(finitePrice)||typeof bar.v!=='number'||!Number.isSafeInteger(bar.v)||bar.v<0
    ||bar.l>Math.min(bar.o,bar.c)||bar.h<Math.max(bar.o,bar.c)||bar.l>bar.h){discarded++;continue;}
  // A duplicate date is ambiguous, not a second session. Keep the first.
  if(byDay.has(day)){discarded++;continue;}
  byDay.set(day,{time:day,open:bar.o,high:bar.h,low:bar.l,close:bar.c,volume:bar.v});
 }
 const candles=[...byDay.values()].sort((a,b)=>a.time.localeCompare(b.time)).slice(-sessions);
 return {schemaVersion:1,symbol,mode:'HISTORICAL_COMPLETED_DAILY_BARS',feed:'iex',provider:'alpaca',
  source:'ALPACA_IEX',coverage:'single-venue',adjustment:data.adjustment||'split',
  interval:'1Day',includesLivePrice:false,includesQuotes:false,
  windowSessions:sessions,bars:candles,asOf:candles.at(-1)?.time||null,
  fetchedAt:new Date(stamp).toISOString(),
  quality:{returnedSessions:candles.length,discardedBars:discarded,
   partialHistory:Boolean(data.partialHistory),incompleteWindow:candles.length<sessions,
   upstreamHasMore:Boolean(data.hasMore)},
  limitations:['Daily candles reflect sourced completed IEX market-data bars, not real-time or consolidated SIP OHLCV.',
   'Current New York session is excluded to avoid presenting an unfinished daily candle as complete.',
   'Live observed trade price is separate from the latest historical daily close.',
   'No candle, volume, VWAP or forecast is inferred from sparse polling snapshots.']};
}
export function createMonitorChartApi({sources,now=Date.now}={}){
 if(typeof sources?.researchBars!=='function')throw new TypeError('Monitor chart API requires existing bounded market-bar source');
 const cache=new Map(),pending=new Map();
 return async function(req,res,url){
  if(url.pathname!=='/api/chart/daily')return false;
  const send=(status,payload)=>{
   if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
  };
  try{
   if(req.method!=='GET')throw error('Method not allowed',405);
   const symbol=url.searchParams.get('symbol')||'',sessions=Number(url.searchParams.get('sessions')||60);
   if(!PILOT.has(symbol)||!WINDOWS.has(sessions))throw error('Choose a supported pilot symbol and 20, 60, 120 or 250 sessions.');
   const day=dateET(now()),key=symbol+':'+sessions;
   const saved=cache.get(key);
   if(saved&&saved.day===day&&saved.until>now()){send(200,saved.data);return true;}
   let work=pending.get(key);
   if(!work){
    work=(async()=>{
     const raw=await sources.researchBars(symbol,{days:Math.min(1100,sessions*2+25),feed:'iex',adjustment:'split'});
     const result=normalizeDailyCandles(raw,{symbol,sessions,now});
     cache.set(key,{day,until:Number(now())+60000,data:result});
     return result;
    })();
    pending.set(key,work);
    work.finally(()=>{if(pending.get(key)===work)pending.delete(key);}).catch(()=>{});
   }
   send(200,await work);
  }catch(e){
   const status=e?.status===400||e?.status===405||e?.status===429||e?.status===503?e.status:502;
   send(status,{error:status===502?'Historical daily IEX chart is unavailable; check market-data credentials and entitlement.':e.message});
  }
  return true;
 };
}
