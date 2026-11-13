/** TradeScope Market Hub v0.20.
 * Market-sector ETF groupings are editorial proxies, NOT economic exposure edges.
 * Price bars are completed, split-adjusted single-venue IEX, never consolidated quotes.
 * SEC history is as-filed by date cutoff, with unknown fields left blank.
 */
const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=x=>structuredClone(x);
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const todayEt=(clock)=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock);const v=t=>p.find(x=>x.type===t).value;return v('year')+'-'+v('month')+'-'+v('day');};
const minus=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);
const errUp=e=>{if(e.name==='AbortError')return fault('Market provider timed out',504);return e?.status?e:fault('Market provider unavailable',502);};
const FUNDS=[
 ['US Equity','S&P 500','SPY'],['US Equity','Nasdaq 100','QQQ'],['US Equity','Dow 30','DIA'],['US Equity','Russell 2000','IWM'],
 ['US Sectors','Technology','XLK'],['US Sectors','Financials','XLF'],['US Sectors','Energy','XLE'],['US Sectors','Healthcare','XLV'],['US Sectors','Industrials','XLI'],['US Sectors','Consumer Staples','XLP'],['US Sectors','Consumer Discretionary','XLY'],['US Sectors','Materials','XLB'],['US Sectors','Utilities','XLU'],['US Sectors','Real Estate','XLRE'],
 ['Technology Themes','Semiconductors','SMH'],['Technology Themes','Semiconductor Industry','SOXX'],['Technology Themes','Semiconductor Dynamic','PSI'],['Technology Themes','Cybersecurity','CIBR'],['Technology Themes','Cloud Computing','SKYY'],['Technology Themes','Robotics','ROBO'],['Technology Themes','Artificial Intelligence','AIQ'],
 ['Clean Energy','Nuclear & Uranium Equities','NLR'],['Clean Energy','Solar','TAN'],['Clean Energy','Wind','FAN'],['Clean Energy','Clean Energy','ICLN'],
 ['Materials & Mining','Gold Miners','GDX'],['Materials & Mining','Junior Gold Miners','GDXJ'],['Materials & Mining','Copper Miners','COPX'],['Materials & Mining','Metals & Mining','XME'],['Materials & Mining','Steel','SLX'],['Materials & Mining','Silver Miners','SIL'],
 ['Financial Themes','Insurance','KIE'],['Financial Themes','Property & Casualty','KBWP'],['Financial Themes','Banks','KBWB'],['Financial Themes','Regional Banks','KRE'],['Financial Themes','Broker Dealers','IAI'],
 ['Infrastructure','US Homebuilders','XHB'],['Infrastructure','Transportation','IYT'],['Infrastructure','Aerospace & Defense','PPA'],['Infrastructure','Smart Grid','GRID'],['Infrastructure','Water','PIO'],
 ['Consumer','Retail','XRT'],['Consumer','Food & Beverage','PBJ'],['Consumer','Leisure & Entertainment','PEJ'],['Consumer','Online Retail','IBUY'],
 ['Healthcare','Medical Devices','IHI'],['Healthcare','Healthcare Providers','IHF'],['Healthcare','Biotech','PBE'],['Healthcare','Pharmaceuticals','PJP'],
 ['Energy','Oil & Gas Exploration','XOP'],['Energy','Oil Services','OIH'],['Energy','Natural Gas Producers','FCG'],['Energy','Uranium Equities','URA'],
 ['Fixed Income','Long US Treasuries','TLT'],['Fixed Income','Intermediate US Treasuries','IEF'],['Fixed Income','Inflation Protected','TIP'],['Fixed Income','High Yield','HYG'],['Fixed Income','Investment Grade','LQD'],
 ['Global Markets','Emerging Markets','EEM'],['Global Markets','Developed Markets','EFA'],['Global Markets','India Equities','INDA'],['Global Markets','Japan Equities','EWJ'],['Global Markets','Brazil Equities','EWZ'],['Global Markets','China Large Caps','FXI'],
 ['Commodities & Currency','Gold Trust','GLD'],['Commodities & Currency','Silver Trust','SLV'],['Commodities & Currency','US Oil Fund','USO'],['Commodities & Currency','US Natural Gas Fund','UNG'],['Commodities & Currency','US Dollar Bullish','UUP'],
];
export const ETF_CATALOG=Object.freeze(FUNDS.map(([group,label,symbol])=>Object.freeze({group,label,symbol,type:'US_LISTED_ETF_PROXY',classification:'CURATED_RESEARCH_GROUP_NOT_LIVE_HOLDINGS'})));
const GROUPS=[...new Set(ETF_CATALOG.map(x=>x.group))];
const EQUITIES=Object.freeze([{symbol:'AAPL',name:'Apple'},{symbol:'MSFT',name:'Microsoft'},{symbol:'NVDA',name:'NVIDIA'},
 {symbol:'AMZN',name:'Amazon'},{symbol:'AMD',name:'Advanced Micro Devices'},{symbol:'META',name:'Meta Platforms'},
 {symbol:'TSLA',name:'Tesla'},{symbol:'PLTR',name:'Palantir'}]);
const EQUITY_SET=new Set(EQUITIES.map(x=>x.symbol));
const BARS_ALLOWED=new Set([...ETF_CATALOG.map(x=>x.symbol),...EQUITIES.map(x=>x.symbol)]);
const RANGE_DAYS=Object.freeze({'1M':42,'3M':110,'1Y':405,'3Y':1150});
const FRED=Object.freeze([
 {id:'SP500',label:'S&P 500',unit:'index',group:'Markets'},
 {id:'DJIA',label:'Dow Jones Industrial Average',unit:'index',group:'Markets'},
 {id:'NASDAQCOM',label:'Nasdaq Composite',unit:'index',group:'Markets'},
 {id:'VIXCLS',label:'CBOE VIX',unit:'index',group:'Markets'},
 {id:'DGS10',label:'10-year US Treasury',unit:'%',group:'Rates'},
 {id:'DGS2',label:'2-year US Treasury',unit:'%',group:'Rates'},
 {id:'FEDFUNDS',label:'Effective Fed Funds Rate',unit:'%',group:'Rates'},
 {id:'DCOILWTICO',label:'WTI Oil Spot Price',unit:'USD/bbl',group:'Commodities'},
 {id:'UNRATE',label:'Unemployment Rate',unit:'%',group:'Economy'},
 {id:'CPIAUCSL',label:'Consumer Price Index',unit:'index',group:'Economy'},
 {id:'PAYEMS',label:'Nonfarm Payroll Employment',unit:'thousands',group:'Economy'},
 {id:'GDP',label:'Gross Domestic Product',unit:'billions USD',group:'Economy'}
]);
const FRED_BY_ID=new Map(FRED.map(x=>[x.id,x]));
const FACTS=[
 ['revenue','Revenue','USD',['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet']],
 ['grossProfit','Gross Profit','USD',['GrossProfit']],
 ['operatingIncome','Operating Income','USD',['OperatingIncomeLoss']],
 ['netIncome','Net Income','USD',['NetIncomeLoss']],
 ['eps','Diluted EPS','USD/share',['EarningsPerShareDiluted']],
 ['operatingCashFlow','Operating Cash Flow','USD',['NetCashProvidedByUsedInOperatingActivities']],
 ['assets','Total Assets','USD',['Assets']],
 ['cash','Cash and Equivalents','USD',['CashAndCashEquivalentsAtCarryingValue']],
 ['equity','Stockholders Equity','USD',['StockholdersEquity']],
];
export const FINANCIAL_METRICS=Object.freeze(FACTS.map(([id,label,unit])=>({id,label,unit})).concat([{id:'netMargin',label:'Net Margin',unit:'%'},{id:'revenueGrowth',label:'Revenue Growth YoY',unit:'%'}]));
function normalizeBars(response,symbols,{asOf,range}){
 if(!response||typeof response!=='object'||!response.bars||typeof response.bars!=='object'||Array.isArray(response.bars))throw fault('Market bar source schema unavailable',502);
 const lines={};
 for(const symbol of symbols){
  const raw=response.bars[symbol]??[];
  if(!Array.isArray(raw)||raw.length>3500)throw fault('Invalid bounded market bars',502);
  const dates=new Map();
  for(const b of raw){
   const date=typeof b?.t==='string'&&Number.isFinite(Date.parse(b.t))?todayEt(new Date(b.t)):null;
   if(!date||date>=asOf||date<minus(asOf,RANGE_DAYS[range]+8))continue;
   if(![b.o,b.h,b.l,b.c].every(x=>finite(x)&&x>0)||!finite(b.v)||b.v<0||b.l>b.o||b.l>b.c||b.h<b.o||b.h<b.c||b.h<b.l)continue;
   if(!dates.has(date))dates.set(date,{date,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v});
  }
  const bars=[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-850);
  const last=bars.at(-1)||null;
  const changeAt=cutoff=>{if(!last)return null;const earlier=[...bars].reverse().find(b=>b.date<=cutoff);return earlier&&earlier.close>0?Number(((last.close/earlier.close-1)*100).toFixed(4)):null;};
  const sessionsBack=n=>bars.length>n?Number(((last.close/bars.at(-n-1).close-1)*100).toFixed(4)):null;
  const priorYear=last?bars.filter(b=>b.date<last.date.slice(0,4)+'-01-01').at(-1):null;
  const window52=last?bars.filter(b=>b.date>=minus(last.date,365)):[];
  lines[symbol]={symbol,bars,last,asOf:last?.date||null,
   returns:{d1:sessionsBack(1),d5:sessionsBack(5),m1:last?changeAt(minus(last.date,30)):null,
    ytd:last&&priorYear?Number(((last.close/priorYear.close-1)*100).toFixed(4)):null,
    y1:last?changeAt(minus(last.date,365)):null,y3:last?changeAt(minus(last.date,1095)):null},
   dayRange:last?{low:last.low,high:last.high,meaning:'LAST_COMPLETED_IEX_DAILY_BAR'}:null,
   range52w:window52.length>=180?{low:Math.min(...window52.map(x=>x.low)),high:Math.max(...window52.map(x=>x.high)),
    sessions:window52.length,meaning:'COMPLETED_IEX_BARS_NOT_CONSOLIDATED'}:null,
   coverage:{sessions:bars.length,complete52w:window52.length>=180}};
 }
 return lines;
}
function annualFactRows(payload,id,tags,unit,asOf,instant){
 const map=new Map();
 for(let rank=0;rank<tags.length;rank++){
  const tag=tags[rank],items=payload?.facts?.['us-gaap']?.[tag]?.units?.[unit]||[];
  if(!Array.isArray(items))continue;
  for(const x of items){
   if(!x||!validDay(x.end)||!validDay(x.filed)||x.filed>asOf||x.end>asOf||!finite(x.val)||!['10-K','10-K/A'].includes(x.form))continue;
   if(!instant){
    if(!validDay(x.start))continue;
    const period=(Date.parse(x.end)-Date.parse(x.start))/86400000;
    if(period<330||period>380)continue;
   }else if(x.fp!=='FY'&&x.form!=='10-K'&&x.form!=='10-K/A')continue;
   const item={value:x.val,fiscalEnd:x.end,filedAt:x.filed,tag,unit,source:'SEC_EDGAR_XBRL',rank};
   const prev=map.get(x.end);
   if(!prev||x.filed>prev.filedAt||x.filed===prev.filedAt&&rank<prev.rank)map.set(x.end,item);
  }
 }
 return [...map.values()].sort((a,b)=>a.fiscalEnd.localeCompare(b.fiscalEnd)).slice(-12).map(({rank,...x})=>x);
}
export function normalizeCompanyFinancials(raw,{symbol,asOf,now=new Date()}={}){
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!validDay(asOf)||asOf>todayEt(now))throw fault('Choose a registered issuer and valid as-of date');
 const payload=raw?.facts?.['us-gaap']?raw:raw?.facts?.facts?.['us-gaap']?raw.facts:raw;
 if(!payload||typeof payload!=='object')throw fault('Official SEC filing facts are missing',502);
 const series={};
 for(const [id,label,unit,tags] of FACTS)series[id]=annualFactRows(payload,id,tags,unit,asOf,['assets','cash','equity'].includes(id));
 const by=(id)=>new Map(series[id].map(x=>[x.fiscalEnd,x]));
 const revenue=by('revenue'),net=by('netIncome');
 series.netMargin=[...revenue.values()].map(r=>{
  const n=net.get(r.fiscalEnd),v=n&&n.filedAt&&r.value>0?Number((n.value/r.value*100).toFixed(3)):null;
  return {value:v,fiscalEnd:r.fiscalEnd,filedAt:n&&n.filedAt>r.filedAt?n.filedAt:r.filedAt,tag:'DERIVED_SAME_PERIOD',unit:'%',source:'SEC_EDGAR_XBRL',status:v===null?'unavailable':'available'};
 });
 series.revenueGrowth=[...revenue.values()].map(r=>{
  const target=minus(r.fiscalEnd,365),prior=[...revenue.values()].filter(x=>Math.abs(Date.parse(x.fiscalEnd)-Date.parse(target))<=14).at(0);
  const v=prior&&prior.value>0?Number(((r.value/prior.value-1)*100).toFixed(3)):null;
  return {value:v,fiscalEnd:r.fiscalEnd,filedAt:r.filedAt,tag:'DERIVED_COMPARABLE_ANNUAL',unit:'%',source:'SEC_EDGAR_XBRL',status:v===null?'unavailable':'available'};
 });
 return {symbol,company:payload.entityName||null,asOf,source:'SEC_EDGAR_XBRL',sourceUrl:'https://data.sec.gov/api/xbrl/companyfacts/CIK'+String(payload.cik).padStart(10,'0')+'.json',
  metrics:FINANCIAL_METRICS,series,limitations:['Fiscal-year SEC figures; no licensed estimates, live valuations or 40-year completeness are implied.',
   'The latest filing published by the chosen as-of calendar date is selected for each fiscal end; intraday original availability is not reconstructed.',
   'Different company fiscal calendars and GAAP tags limit peer comparability. Missing values remain unavailable.']};
}
async function boundedJson(res,max=2100000){
 const size=Number(res.headers?.get?.('content-length'));
 if(Number.isFinite(size)&&size>max)throw fault('Upstream response exceeds bound',502);
 const reader=res.body?.getReader?.();let body='';
 if(reader){const parts=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
  if(length>max){await reader.cancel();throw fault('Upstream response exceeds bound',502);}parts.push(Buffer.from(value));}}
  finally{reader.releaseLock();}body=Buffer.concat(parts).toString('utf8');}
 else{body=await res.text();if(Buffer.byteLength(body)>max)throw fault('Upstream response exceeds bound',502);}
 try{return JSON.parse(body);}catch{throw fault('Upstream returned invalid JSON',502);}
}
export function createMarketHub({fetchImpl=fetch,env=process.env,now=()=>new Date(),companyFacts,validateSymbol=async symbol=>EQUITY_SET.has(symbol)}={}){
 const cache=new Map(),pending=new Map();
 const cacheRead=async(key,ttl,load)=>{
  const hit=cache.get(key);if(hit?.expires>Date.now())return copy(hit.data);
  if(pending.has(key))return copy(await pending.get(key));
  const task=load().then(data=>{cache.set(key,{data,expires:Date.now()+ttl});if(cache.size>50)cache.delete(cache.keys().next().value);return data});
  pending.set(key,task);try{return copy(await task);}finally{pending.delete(key);}
 };
 async function get(url,headers,max){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
  try{const response=await fetchImpl(url,{headers:{Accept:'application/json',...headers},method:'GET',redirect:'error',signal:c.signal});
   if(!response.ok){await response.body?.cancel?.();throw fault(response.status===429?'Upstream provider rate limited':response.status===401||response.status===403?'Provider authentication or access denied':'Upstream source unavailable',response.status===429?429:response.status===401||response.status===403?503:502);}
   return await boundedJson(response,max);
  }catch(e){throw errUp(e);}finally{clearTimeout(timer);}
 }
 async function series(symbols,range){
  if(!Array.isArray(symbols)||symbols.length<1||symbols.length>10||new Set(symbols).size!==symbols.length||symbols.some(s=>typeof s!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s))||!Object.hasOwn(RANGE_DAYS,range))
   throw fault('Choose 1–10 supported symbols and range 1M, 3M, 1Y or 3Y');
  for(const symbol of symbols)if(!BARS_ALLOWED.has(symbol)&&!await validateSymbol(symbol))throw fault('Register the issuer in TradeScope before requesting its market data');
  if(!env.APCA_API_KEY_ID||!env.APCA_API_SECRET_KEY)throw fault('Configure Alpaca market-data credentials to load completed IEX bars',503);
  const end=todayEt(now()),start=minus(end,RANGE_DAYS[range]);
  const key='bars:'+range+':'+end+':'+[...symbols].sort().join(',');
  return cacheRead(key,60000,async()=>{
   const url=new URL('https://data.alpaca.markets/v2/stocks/bars');
   for(const [k,v] of Object.entries({symbols:symbols.join(','),timeframe:'1Day',start:start+'T00:00:00Z',end:end+'T00:00:00Z',
    feed:'iex',adjustment:'split',sort:'asc',limit:'10000'}))url.searchParams.set(k,v);
   const raw=await get(url.href,{'APCA-API-KEY-ID':env.APCA_API_KEY_ID,'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY},2100000);
   const lines=normalizeBars(raw,symbols,{asOf:end,range});
   return {source:'ALPACA_IEX',feed:'iex',venue:'SINGLE_EXCHANGE_IEX',adjustment:'SPLIT_ONLY_NOT_DIVIDENDS',
    asOfLimit:end,range,completeCurrentSessionExcluded:true,hasMore:!!raw.next_page_token,
    values:lines,requested:symbols,fetchedAt:now().toISOString(),
    limitations:['ETF groupings represent broad investment themes, not verified commodity/company exposure.',
     'IEX-only daily bars are not consolidated market prices or a total-return index.',
     'Returns are price changes between available completed sessions; unavailable lookback baselines remain null.',
     'When hasMore=true, provider truncation can invalidate longer horizon completeness.']};
  });
 }
 async function financials(symbol,asOf=todayEt(now())){
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!validDay(asOf)||asOf>todayEt(now()))throw fault('Choose a registered SEC issuer and as-of date');
  if(!EQUITY_SET.has(symbol)&&!await validateSymbol(symbol))throw fault('Register the issuer in TradeScope before requesting its SEC filing data');
  if(typeof companyFacts!=='function')throw fault('SEC company fact service unavailable',503);
  return cacheRead('sec:'+symbol+':'+asOf,300000,async()=>{
   const raw=await companyFacts(symbol);const normalized=normalizeCompanyFinancials(raw,{symbol,asOf,now:now()});
   return {...normalized,fetchedAt:now().toISOString()};
  });
 }
 async function macro(id,years=10){
  if(!FRED_BY_ID.has(id)||!Number.isInteger(years)||years<1||years>10)throw fault('Choose a supported macro series and 1–10 years');
  if(typeof env.FRED_API_KEY!=='string'||!/^[a-z0-9]{32}$/.test(env.FRED_API_KEY))throw fault('Configure FRED_API_KEY for sourced macro history',503);
  const end=todayEt(now()),start=minus(end,Math.round(years*366));
  return cacheRead('fred:'+id+':'+years+':'+end,600000,async()=>{
   const u=new URL('https://api.stlouisfed.org/fred/series/observations');
   for(const [k,v] of Object.entries({series_id:id,api_key:env.FRED_API_KEY,file_type:'json',observation_start:start,observation_end:end,limit:'5000'}))u.searchParams.set(k,v);
   const raw=await get(u.href,{},1000000);
   if(!Array.isArray(raw.observations)||raw.observations.length>5000)throw fault('Malformed FRED history response',502);
   const history=raw.observations.filter(x=>validDay(x?.date)&&x.date<=end&&typeof x.value==='string'&&x.value!=='.'&&
    Number.isFinite(Number(x.value))).map(x=>({date:x.date,value:Number(x.value)}));
   return {id,label:FRED_BY_ID.get(id).label,unit:FRED_BY_ID.get(id).unit,source:'FRED_CURRENT_REVISION',history,
    latest:history.at(-1)||null,asOf:end,fetchedAt:now().toISOString(),
    limitations:['Current-revision FRED observation history, not ALFRED historically available vintage data.',
     'Different frequency and release lags by series; data must not be interpreted as exchange-live prices.']};
  });
 }
 return {catalog(){return {schemaVersion:1,equities:copy(EQUITIES),etfs:copy(ETF_CATALOG),groups:GROUPS,
  ranges:Object.keys(RANGE_DAYS),financialMetrics:copy(FINANCIAL_METRICS),macroSeries:copy(FRED),
  credentials:{marketDataConfigured:Boolean(env.APCA_API_KEY_ID&&env.APCA_API_SECRET_KEY),
   fredConfigured:typeof env.FRED_API_KEY==='string'&&/^[a-z0-9]{32}$/.test(env.FRED_API_KEY)},
  capacity:{maxSymbolsPerQuery:10,equityFinancials:EQUITIES.length},
  limitations:['The catalog is curated; it does not assert 5,000+ stocks, 80+ historical filters, real-time consolidated data or verified fund holdings.','Research-only prices require valid market entitlements.']};},
  series,financials,macro};
}
export function createMarketHubApi({service}={}){
 if(!service)throw new TypeError('Market hub requires service');
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/market-hub/'))return false;
  try{
   if(req.method!=='GET')throw fault('Market hub is read only',405);
   const path=url.pathname.slice('/api/market-hub/'.length),qs=url.searchParams;
   if(path==='catalog'&&qs.size===0)reply(res,200,service.catalog());
   else if(path==='series'&&[...qs.keys()].every(k=>['symbols','range'].includes(k))&&qs.getAll('symbols').length===1&&qs.getAll('range').length===1){
    const list=qs.get('symbols').split(',');reply(res,200,await service.series(list,qs.get('range')));
   }else if(path==='financials'&&[...qs.keys()].every(k=>['symbol','asOf'].includes(k))&&qs.getAll('symbol').length===1&&qs.getAll('asOf').length<=1){
    reply(res,200,await service.financials(qs.get('symbol'),qs.get('asOf')||undefined));
   }else if(path==='macro'&&[...qs.keys()].every(k=>['id','years'].includes(k))&&qs.getAll('id').length===1&&qs.getAll('years').length<=1){
    reply(res,200,await service.macro(qs.get('id'),qs.has('years')?Number(qs.get('years')):10));
   }else throw fault('Unsupported market hub request',400);
  }catch(e){const status=[400,405,429,502,503,504].includes(e?.status)?e.status:502;reply(res,status,{error:e?.status?e.message:'Market hub data unavailable'});}
  return true;
 };
}
