import {normalizeNews,normalizeUsgs,normalizeNasa,normalizeGdelt} from './analysis.mjs';
import {summarizeCompanyFacts,extractFilings} from './fundamentals.mjs';
export const SYMBOLS=['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const CIK={NVDA:'0001045810',AAPL:'0000320193',MSFT:'0000789019',TSLA:'0001318605',AMD:'0000002488',META:'0001326801',AMZN:'0001018724',PLTR:'0001321655'};
const TOPICS={sanctions:'(sanctions OR "export restrictions")',conflict:'("armed conflict" OR geopolitical conflict)',supply:'("supply chain disruption" OR port closure)',cyber:'("cyber attack" OR ransomware OR "data breach")',industrial:'("industrial accident" OR "factory explosion" OR "chemical spill")',transport:'("rail derailment" OR "aviation accident" OR "ship collision")',energy:'("power outage" OR "pipeline disruption" OR "refinery shutdown")'};
const fromDate=(days)=>new Date(Date.now()-days*86400000).toISOString();
const DIRECTORY_URL='https://www.sec.gov/files/company_tickers_exchange.json';
const validSymbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(value);
const normalizeCik=value=>{const text=typeof value==='string'?value:Number.isSafeInteger(value)?String(value):'';return /^\d{1,10}$/.test(text)&&Number(text)>0?text.padStart(10,'0'):null;};
const sourceError=(message,status=400)=>Object.assign(new Error(message),{status});
export function makeSources({fetchImpl=fetch,env=process.env,instrumentResolver}={}){
 const cache=new Map(),inflight=new Map();let secQueue=Promise.resolve();
 async function cancelBody(response){try{await response.body?.cancel?.();}catch{/* Preserve the bounded public error if upstream cancellation fails. */}}
 async function readBounded(response,maxBytes){
  if(Number(response.headers?.get?.('content-length'))>maxBytes){await cancelBody(response);throw Object.assign(new Error('Upstream payload exceeds limit'),{status:502});}
  if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>maxBytes)throw Object.assign(new Error('Upstream payload exceeds limit'),{status:502});return text;}
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw Object.assign(new Error('Upstream payload exceeds limit'),{status:502});}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
 }
 async function get(url,{headers={},maxBytes=12000000}={}){
   const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
   try{const response=await fetchImpl(url,{headers:{Accept:'application/json',...headers},signal:ctrl.signal,redirect:'error'});if(!response.ok){await cancelBody(response);throw Object.assign(new Error(`Upstream returned HTTP ${response.status}`),{status:response.status===429?429:502});}
     const raw=await readBounded(response,maxBytes);try{return JSON.parse(raw)}catch{throw Object.assign(new Error('Upstream did not return JSON'),{status:502})}}
   catch(e){if(e.name==='AbortError')throw Object.assign(new Error('External data provider timed out'),{status:504});throw e}finally{clearTimeout(timeout)}
 }
 async function cached(key,ttl,producer){const found=cache.get(key);if(found?.until>Date.now())return found.value;if(inflight.has(key))return inflight.get(key);
  const pending=Promise.resolve().then(producer).then(value=>{cache.set(key,{value,until:Date.now()+ttl});if(cache.size>128)cache.delete(cache.keys().next().value);return value;});inflight.set(key,pending);try{return await pending;}finally{inflight.delete(key);}}
 function credentials(){if(!env.APCA_API_KEY_ID||!env.APCA_API_SECRET_KEY)throw Object.assign(new Error('Alpaca credentials missing; add them to .env for news and bars.'),{status:503});return {'APCA-API-KEY-ID':env.APCA_API_KEY_ID,'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY};}
 async function alpaca(url){return get('https://data.alpaca.markets'+url,{headers:credentials()});}
 async function sec(url){const agent=env.SEC_USER_AGENT;if(!agent||!/.+@.+\..+/.test(agent))throw Object.assign(new Error('Set SEC_USER_AGENT to an app name and contact email in .env.'),{status:503});
   const run=async()=>{await new Promise(r=>setTimeout(r,400));return get(url,{headers:{'User-Agent':agent}})};const next=secQueue.then(run,run);secQueue=next.catch(()=>{});return next;}
 async function requireInstrument(symbol){
  if(!validSymbol(symbol))throw sourceError('Unsupported registered research symbol');
  if(instrumentResolver){let instrument;try{instrument=await instrumentResolver(symbol);}catch(error){throw sourceError(error?.status===404?'Research symbol is not registered':'Registered instrument lookup is unavailable',error?.status===404?400:502);}
   if(!instrument||instrument.symbol!==symbol||instrument.instrumentId!=='US_EQUITY:'+symbol)throw sourceError('Unsupported registered research symbol');return instrument;}
  if(!SYMBOLS.includes(symbol))throw sourceError('Unsupported registered research symbol');
  return {symbol,instrumentId:'US_EQUITY:'+symbol,cik:CIK[symbol]??null,secCompanySupported:Boolean(CIK[symbol])};
 }
 const requireCompany=async symbol=>{const instrument=await requireInstrument(symbol),cik=normalizeCik(instrument.cik??CIK[symbol]);if(instrument.secCompanySupported===false||!cik)throw sourceError('SEC company filings not supported for this ticker (ETFs or unavailable mapping).',422);return cik;};
 const companyFacts=async symbol=>{const cik=await requireCompany(symbol);return cached(`facts:${symbol}:${cik}`,900000,async()=>{
  const facts=await sec(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);if(normalizeCik(facts?.cik)!==cik)throw sourceError('SEC company facts issuer does not match the registered identity',422);
  return {symbol,source:'SEC_EDGAR_XBRL',facts,fetchedAt:new Date().toISOString()};});};
 const barReq=(symbol,days=240,feed='iex')=>{const start=fromDate(days),end=new Date().toISOString();return `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&feed=${feed}&limit=1000&sort=asc`;};
 async function directory(){return cached('sec:issuer-directory',86400000,async()=>{
  const payload=await sec(DIRECTORY_URL);
  if(!Array.isArray(payload?.fields)||!Array.isArray(payload.data)||payload.data.length>30000)throw sourceError('Official issuer directory has an unsupported schema',502);
  const positions=Object.fromEntries(['cik','name','ticker','exchange'].map(field=>[field,payload.fields.indexOf(field)]));
  if(Object.values(positions).some(position=>position<0))throw sourceError('Official issuer directory has an unsupported schema',502);
  const fetchedAt=new Date().toISOString(),values=new Map(),conflicts=new Set();let rejected=0,duplicates=0;
  for(const row of payload.data){
   if(!Array.isArray(row)){rejected++;continue;}
   const symbol=row[positions.ticker],name=row[positions.name],cik=normalizeCik(row[positions.cik]),exchange=row[positions.exchange];
   if(!validSymbol(symbol)||typeof name!=='string'||!name.trim()||name.trim().length>255||!cik||exchange!==null&&exchange!==undefined&&(typeof exchange!=='string'||exchange.length>60)){rejected++;continue;}
   const instrument={instrumentId:'US_EQUITY:'+symbol,symbol,name:name.trim(),cik,issuerId:'SEC_CIK:'+cik,type:'unknown',currency:'USD',
    currencyBasis:'US-equity market-data denomination; not a field supplied by the SEC ticker directory.',exchange:typeof exchange==='string'?exchange.trim():null,
    sector:null,classification:'unavailable',marketTimeZone:'America/New_York',secCompanySupported:true,
    identitySource:'SEC_COMPANY_TICKERS_EXCHANGE',sourceUrl:DIRECTORY_URL,verifiedAt:fetchedAt};
   if(values.has(symbol)){duplicates++;const existing=values.get(symbol);if(existing.cik!==cik||existing.name!==instrument.name||existing.exchange!==instrument.exchange)conflicts.add(symbol);}
   else values.set(symbol,instrument);
  }
  for(const selected of conflicts)values.delete(selected);
  return {instruments:[...values.values()],fetchedAt,coverage:{sourceRecords:payload.data.length,eligible:values.size,rejected,duplicateRecords:duplicates,conflictingSymbols:[...conflicts]}};
 });}
 async function searchInstruments(query,{limit=20}={}){
  if(typeof query!=='string'||!query.trim()||query.trim().length>80||/[\x00-\x1f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>20)throw sourceError('Enter a search query and limit between one and twenty');
  const term=query.trim().toLowerCase(),data=await directory();
  const matches=data.instruments.filter(item=>`${item.symbol} ${item.name}`.toLowerCase().includes(term)).sort((left,right)=>(left.symbol.toLowerCase()===term?-1:right.symbol.toLowerCase()===term?1:left.symbol.localeCompare(right.symbol)));
  return {source:'SEC_COMPANY_TICKERS_EXCHANGE',results:matches.slice(0,limit).map(item=>structuredClone(item)),fetchedAt:data.fetchedAt,
   coverage:{...structuredClone(data.coverage),matched:matches.length,truncated:matches.length>limit},limitations:['SEC ticker mapping does not establish sector, instrument type, trading eligibility or permanent security identity.']};
 }
 async function resolveInstrument(symbol){
  if(!validSymbol(symbol))throw sourceError('Choose a valid uppercase research symbol');
  const data=await directory(),instrument=data.instruments.find(item=>item.symbol===symbol);
  if(!instrument)throw sourceError('No exact official issuer directory match exists for this symbol',404);return structuredClone(instrument);
 }
 return {
  searchInstruments,resolveInstrument,
  async news(symbol,limit=20){await requireInstrument(symbol);if(!Number.isInteger(limit)||limit<1||limit>30)throw sourceError('News limit must be between one and thirty');
   return cached(`news:${symbol}:${limit}`,60000,async()=>{const data=await alpaca(`/v1beta1/news?${new URLSearchParams({symbols:symbol,limit:String(limit),sort:'desc'})}`);return {source:'ALPACA_NEWS',symbol,events:normalizeNews(data),fetchedAt:new Date().toISOString()};});},
  async filings(symbol){const cik=await requireCompany(symbol);const found=await cached(`filing:${cik}`,900000,async()=>{
   const data=await sec(`https://data.sec.gov/submissions/CIK${cik}.json`);if(normalizeCik(data?.cik)!==cik)throw sourceError('SEC filings issuer does not match the registered identity',422);return {data,fetchedAt:new Date().toISOString()};
  });return {source:'SEC_EDGAR',symbol,company:found.data.name,filings:extractFilings(found.data,20),fetchedAt:found.fetchedAt};},
  async fundamentals(symbol){const data=await companyFacts(symbol);return {symbol,...summarizeCompanyFacts(data.facts),fetchedAt:data.fetchedAt};},
  companyFacts,
  async bars(symbol,{days=240,feed='iex'}={}){await requireInstrument(symbol);if(!Number.isInteger(days)||days<1||days>1100||!['iex','sip'].includes(feed))throw sourceError('Unsupported bounded bar request');const data=await cached(`bars:${symbol}:${days}:${feed}`,60000,()=>alpaca(barReq(symbol,days,feed)));return {symbol,source:`ALPACA_${feed.toUpperCase()}`,bars:data.bars||[],hasMore:Boolean(data.next_page_token),fetchedAt:new Date().toISOString()};},
  async researchBars(symbol,{days=800,feed='iex',start=null,end=null,adjustment='split'}={}){
   if(!['iex','sip'].includes(feed)||!['raw','split','all'].includes(adjustment)||!Number.isInteger(days)||days<1||days>1100)throw Object.assign(new Error('Unsupported bounded research bar request'),{status:400});
   await requireInstrument(symbol);
   const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
   const today=new Date().toISOString().slice(0,10);
   const first=start??new Date(Date.now()-days*86400000).toISOString().slice(0,10),last=end??today;
   if(!validDate(first)||!validDate(last)||first>last||first<'2016-01-01'||last>today||(Date.parse(last)-Date.parse(first))/86400000>1100)throw Object.assign(new Error('Research dates must be a bounded past ISO calendar range'),{status:400});
   return cached(`research-bars:${symbol}:${feed}:${first}:${last}:${adjustment}`,60000,async()=>{
    const bars=[],tokens=new Set();let token=null,pages=0,hasMore=false;
    do{
     const params=new URLSearchParams({timeframe:'1Day',start:first+'T00:00:00Z',end:last+'T23:59:59Z',feed,adjustment,limit:'1000',sort:'asc'});
     if(token)params.set('page_token',token);
     const data=await alpaca(`/v2/stocks/${encodeURIComponent(symbol)}/bars?${params.toString()}`);
     if(!Array.isArray(data.bars)||data.bars.length>1000)throw Object.assign(new Error('Malformed market bar response'),{status:502});
     bars.push(...data.bars);pages++;
     const next=data.next_page_token;
     hasMore=typeof next==='string'&&next.length>0;
     if(hasMore&&(next.length>2048||tokens.has(next)))throw Object.assign(new Error('Invalid market bar pagination'),{status:502});
     if(hasMore)tokens.add(next);token=hasMore?next:null;
    }while(token&&pages<3);
    return {symbol,source:`ALPACA_${feed.toUpperCase()}`,feed,coverage:feed==='iex'?'single-venue':'entitled SIP',bars,hasMore,partialHistory:hasMore,pages,adjustment,start:first,end:last,fetchedAt:new Date().toISOString()};
   });
  },
  async intradayBars(symbol,{interval='5Min',days=7,feed='iex'}={}){
   const intervals=new Set(['1Min','5Min','15Min','1Hour']);
   if(!intervals.has(interval)||!Number.isInteger(days)||days<1||days>14||feed!=='iex')throw sourceError('Choose a bounded intraday interval and IEX feed');
   await requireInstrument(symbol);
   return cached('intraday:'+symbol+':'+interval+':'+days,45000,async()=>{
    const first=new Date(Date.now()-days*86400000).toISOString(),last=new Date().toISOString();
    const bars=[],seenTokens=new Set();let token=null,pages=0,hasMore=false;
    do{
     const params=new URLSearchParams({timeframe:interval,start:first,end:last,feed:'iex',adjustment:'split',limit:'1000',sort:'asc'});
     if(token)params.set('page_token',token);
     const data=await alpaca('/v2/stocks/'+encodeURIComponent(symbol)+'/bars?'+params);
     if(!Array.isArray(data.bars)||data.bars.length>1000)throw sourceError('Malformed intraday IEX bars',502);
     bars.push(...data.bars);pages++;
     const next=data.next_page_token;hasMore=typeof next==='string'&&next.length>0;
     if(hasMore&&(next.length>2048||seenTokens.has(next)))throw sourceError('Invalid intraday pagination',502);
     if(hasMore)seenTokens.add(next);token=hasMore?next:null;
    }while(token&&pages<4);
    return {source:'ALPACA_IEX',feed:'iex',coverage:'single-venue',interval,adjustment:'split',symbol,
     bars,hasMore,partialHistory:hasMore,pages,start:first,end:last,fetchedAt:new Date().toISOString()};
   });
  },
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
