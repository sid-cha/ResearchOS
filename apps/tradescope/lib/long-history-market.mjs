/**
 * EODHD long-history, research-only SPY benchmark adapter.
 * Public browser APIs must never expose raw provider bars or API tokens.
 * adjusted_close is CURRENTLY REVISED by future corporate actions and is ONLY
 * used for subsequently realized outcome labels, never historical signal inputs.
 */
import {isoDay} from './macro-vintage.mjs';
export const EODHD_SOURCE='EODHD_SPY_DIVIDEND_SPLIT_ADJUSTED_CURRENT_REVISION';
const BASE='https://eodhd.com/api/eod/SPY.US';
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const DAY=86400000;
const offset=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const age=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY;
const validToken=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(x)&&x!=='replace_with_your_eodhd_key';
const copy=x=>structuredClone(x);
function validateWindow(start,end,now){
 const last=offset(now().toISOString().slice(0,10),-1);
 if(!isoDay(start)||!isoDay(end)||start<'1993-01-29'||end>last||start>end||age(start,end)>825)
  throw err('Historical benchmark window must be a past 825-day or shorter SPY date range starting in 1993');
}
/** Strict chronology and adjusted-price provenance, no missing-day synthesis. */
export function normalizeEodhdDaily(rows,{start,end,fetchedAt}={}){
 if(!isoDay(start)||!isoDay(end)||!Array.isArray(rows)||rows.length===0||rows.length>650)
  throw err('EODHD returned empty, oversized or malformed daily history',502);
 const dates=new Set(),series=[];
 for(const x of rows){
  if(!x||!isoDay(x.date)||x.date<start||x.date>end||dates.has(x.date)||
     typeof x.close!=='number'||!Number.isFinite(x.close)||x.close<=0||
     typeof x.adjusted_close!=='number'||!Number.isFinite(x.adjusted_close)||x.adjusted_close<=0||
     x.adjusted_close>1e9||x.close>1e9)
   throw err('EODHD returned invalid, duplicated or out-of-range market prices',502);
  dates.add(x.date);
  series.push({date:x.date,close:x.adjusted_close});
 }
 series.sort((a,b)=>a.date.localeCompare(b.date));
 for(let i=1;i<series.length;i++)if(age(series[i-1].date,series[i].date)>8)
  throw err('EODHD benchmark history has a large unexplained gap',502);
 if(age(start,series[0].date)>8||age(series.at(-1).date,end)>8)
  throw err('EODHD benchmark history lacks beginning or ending coverage',502);
 return {source:EODHD_SOURCE,provider:'EODHD',symbol:'SPY.US',priceBasis:'adjusted_close',adjustment:'current-revision-split-and-dividend',
  fetchedAt,coverage:{start:series[0].date,end:series.at(-1).date,sessions:series.length},
  bars:series,limitations:[
   'EODHD adjusted_close incorporates split and dividend adjustments and may be revised after the historical decision date.',
   'Bars are market outcome labels, never historical macro signal features.',
   'Provider access and redistribution are subject to your data-license terms.'
  ]};
}
async function boundedJson(response){
 const limit=640000,declared=Number(response.headers?.get?.('content-length'));
 if(declared>limit){await response.body?.cancel?.();throw err('Historical provider response too large',502)}
 if(!response.body?.getReader){const txt=await response.text();if(Buffer.byteLength(txt)>limit)throw err('Historical provider response too large',502);
  try{return JSON.parse(txt)}catch{throw err('Historical provider returned invalid JSON',502)}}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw err('Historical provider response too large',502)}chunks.push(Buffer.from(r.value))}}
 finally{reader.releaseLock()}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw err('Historical provider returned invalid JSON',502)}
}
export function createLongHistoryMarket({fetchImpl=fetch,env=process.env,now=()=>new Date(),timeoutMs=12000}={}){
 const ready=()=>validToken(env.EODHD_API_TOKEN)&&env.EODHD_INTERNAL_RESEARCH_ENABLED==='true';
 const cache=new Map(),pending=new Map();
 async function load(start,end){
  validateWindow(start,end,now);
  if(!ready())throw err('Long-history EODHD access is not configured for internal research',503);
  const url=new URL(BASE);
  for(const [k,v] of Object.entries({api_token:env.EODHD_API_TOKEN,from:start,to:end,period:'d',fmt:'json',order:'a'}))url.searchParams.set(k,v);
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchImpl(url.toString(),{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:ctrl.signal});
   if(!response.ok){
    await response.body?.cancel?.();
    throw err(response.status===429?'EODHD daily request rate limit exceeded':
     [401,402,403].includes(response.status)?'EODHD subscription or authentication does not permit this historical window':
     'EODHD historical benchmark data unavailable',response.status===429?429:[401,402,403].includes(response.status)?503:502);
   }
   const rows=await boundedJson(response);
   return normalizeEodhdDaily(rows,{start,end,fetchedAt:now().toISOString()});
  }catch(e){
   if(e.name==='AbortError')throw err('Historical benchmark provider timed out',504);
   if(e.status)throw e;
   // Important: NEVER echo raw upstream response bodies or the URL with api_token.
   throw err('Historical market provider request failed',502);
  }finally{clearTimeout(timeout)}
 }
 return {
  catalog(){return {provider:'EODHD',source:EODHD_SOURCE,symbol:'SPY.US',
   enabled:ready(),firstSupportedDate:'1993-01-29',maxCalendarDays:825,
   priceBasis:'current-revision dividend-and-split-adjusted_close',
   license:'Internal research only; check subscription scope and rights before commercial redistribution',
   rawHistoryPubliclyExposed:false,requiresPaidHistoryFor2008:true,
   docs:'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes'};},
  async history({start,end}={}){
   validateWindow(start,end,now);
   if(!ready())throw err('Long-history EODHD access is not configured for internal research',503);
   const id=start+':'+end,hit=cache.get(id);
   if(hit?.until>Date.now())return copy(hit.value);
   if(pending.has(id))return copy(await pending.get(id));
   const job=load(start,end).then(x=>{
    cache.set(id,{until:Date.now()+300000,value:x});
    if(cache.size>12)cache.delete(cache.keys().next().value);
    return x;
   });
   pending.set(id,job);
   try{return copy(await job)}finally{pending.delete(id)}
  }
 };
}
