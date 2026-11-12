import {normalizeNews,normalizeUsgs,normalizeNasa,normalizeGdelt} from './analysis.mjs';
import {summarizeCompanyFacts,extractFilings} from './fundamentals.mjs';
export const SYMBOLS=['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const CIK={NVDA:'0001045810',AAPL:'0000320193',MSFT:'0000789019',TSLA:'0001318605',AMD:'0000002488',META:'0001326801',AMZN:'0001018724',PLTR:'0001321655'};
const TOPICS={sanctions:'(sanctions OR "export restrictions")',conflict:'("armed conflict" OR geopolitical conflict)',supply:'("supply chain disruption" OR port closure)'};
const fromDate=(days)=>new Date(Date.now()-days*86400000).toISOString();
export function makeSources({fetchImpl=fetch,env=process.env}={}){
 const cache=new Map();let secQueue=Promise.resolve();
 async function get(url,{headers={},maxBytes=12000000}={}){
   const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
   try{const response=await fetchImpl(url,{headers:{Accept:'application/json',...headers},signal:ctrl.signal,redirect:'error'});if(!response.ok)throw Object.assign(new Error(`Upstream returned HTTP ${response.status}`),{status:response.status===429?429:502});
     const raw=await response.text();if(raw.length>maxBytes)throw Object.assign(new Error('Upstream payload exceeds limit'),{status:502});try{return JSON.parse(raw)}catch{throw Object.assign(new Error('Upstream did not return JSON'),{status:502})}}
   catch(e){if(e.name==='AbortError')throw Object.assign(new Error('External data provider timed out'),{status:504});throw e}finally{clearTimeout(timeout)}
 }
 async function cached(key,ttl,producer){const found=cache.get(key);if(found?.until>Date.now())return found.value;const value=await producer();cache.set(key,{value,until:Date.now()+ttl});return value;}
 function credentials(){if(!env.APCA_API_KEY_ID||!env.APCA_API_SECRET_KEY)throw Object.assign(new Error('Alpaca credentials missing; add them to .env for news and bars.'),{status:503});return {'APCA-API-KEY-ID':env.APCA_API_KEY_ID,'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY};}
 async function alpaca(url){return get('https://data.alpaca.markets'+url,{headers:credentials()});}
 async function sec(url){const agent=env.SEC_USER_AGENT;if(!agent||!/.+@.+\..+/.test(agent))throw Object.assign(new Error('Set SEC_USER_AGENT to an app name and contact email in .env.'),{status:503});
   const run=async()=>{await new Promise(r=>setTimeout(r,400));return get(url,{headers:{'User-Agent':agent}})};const next=secQueue.then(run,run);secQueue=next.catch(()=>{});return next;}
 const requireCompany=(symbol)=>{const cik=CIK[symbol];if(!cik)throw Object.assign(new Error('SEC company filings not supported for this ticker (ETFs or unavailable mapping).'),{status:422});return cik;};
 const barReq=(symbol,days=240,feed='iex')=>{const start=fromDate(days),end=new Date().toISOString();return `/v2/stocks/${symbol}/bars?timeframe=1Day&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&feed=${feed}&limit=1000&sort=asc`;};
 return {
  async news(symbol,limit=20){const data=await cached(`news:${symbol}:${limit}`,60000,()=>alpaca(`/v1beta1/news?symbols=${symbol}&limit=${limit}&sort=desc`));return {source:'ALPACA_NEWS',symbol,events:normalizeNews(data),fetchedAt:new Date().toISOString()};},
  async filings(symbol){const cik=requireCompany(symbol);const data=await cached(`filing:${cik}`,900000,()=>sec(`https://data.sec.gov/submissions/CIK${cik}.json`));return {source:'SEC_EDGAR',symbol,company:data.name,filings:extractFilings(data,20)};},
  async fundamentals(symbol){const cik=requireCompany(symbol);const data=await cached(`facts:${cik}`,900000,()=>sec(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`));return {symbol,...summarizeCompanyFacts(data)};},
  async bars(symbol,{days=240,feed='iex'}={}){const data=await cached(`bars:${symbol}:${days}:${feed}`,60000,()=>alpaca(barReq(symbol,days,feed)));return {symbol,source:`ALPACA_${feed.toUpperCase()}`,bars:data.bars||[],hasMore:Boolean(data.next_page_token),fetchedAt:new Date().toISOString()};},
  async hazards(source='all'){
    const tasks=[];if(source==='all'||source==='usgs')tasks.push(cached('hazards:usgs',120000,()=>get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson')).then(normalizeUsgs));
    if(source==='all'||source==='nasa')tasks.push(cached('hazards:nasa',180000,()=>get('https://eonet.gsfc.nasa.gov/api/v3/events?limit=50&days=30&status=all')).then(normalizeNasa));
    const outcomes=await Promise.allSettled(tasks);return {source:'USGS_NASA',events:outcomes.filter(x=>x.status==='fulfilled').flatMap(x=>x.value).sort((a,b)=>String(b.occurredAt||b.publishedAt).localeCompare(String(a.occurredAt||a.publishedAt))).slice(0,90),errors:outcomes.filter(x=>x.status==='rejected').map(x=>x.reason.message)};
  },
  async geopolitics(topic='sanctions'){
    const expression=TOPICS[topic];if(!expression)throw Object.assign(new Error('Unsupported topic'),{status:400});const p=new URLSearchParams({query:expression,mode:'ArtList',format:'json',maxrecords:'25',timespan:'1week',sort:'DateDesc'});
    const result=await cached(`gdelt:${topic}`,300000,()=>get('https://api.gdeltproject.org/api/v2/doc/doc?'+p.toString()));return {source:'GDELT_DOC',topic,events:normalizeGdelt(result)};
  }
 };
}
