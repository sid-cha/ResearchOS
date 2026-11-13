import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeSources} from './lib/sources.mjs';
import {createIntelligenceApi} from './lib/api.mjs';
import {createCaseApi} from './lib/case-api.mjs';
import {createAssistantApi} from './lib/assistant-api.mjs';
import {createMarketStream} from './lib/alpaca-stream.mjs';
import {createMarketDelivery} from './lib/market-sse.mjs';
import {createResearchApi} from './lib/research-api.mjs';
import {createCaseStore} from './lib/cases.mjs';
import {createRegulatoryApi} from './lib/regulatory-api.mjs';
import {createFilingReader} from './lib/filing-intelligence.mjs';
import {classifyCorporateEvent,createCorporateAlertStore} from './lib/corporate-intelligence.mjs';
import {createEventArchive} from './lib/event-archive.mjs';
import {createResearchUniverse} from './lib/research-universe.mjs';
import {createDiscoveryApi} from './lib/discovery-api.mjs';
import {createMonitorChartApi} from './lib/monitor-chart-api.mjs';
import {createIntradayChartApi} from './lib/intraday-chart.mjs';
import {createCrisisAtlasApi} from './lib/crisis-atlas.mjs';
import {createMacroVintage,createMacroVintageApi} from './lib/macro-vintage.mjs';
import {createHistoricalBacktest,createHistoricalBacktestApi} from './lib/historical-backtest.mjs';
import {createLongHistoryMarket} from './lib/long-history-market.mjs';
import {createCpcEnsoApi} from './lib/climate-enso.mjs';
import {createTransmissionApi} from './lib/transmission-graph.mjs';
import {createRegionalClimateApi} from './lib/regional-climate.mjs';
import {createCommodityWorkbench,createCommodityApi} from './lib/commodity-platform.mjs';
import {createCommodityFundamentals,createCommodityFundamentalsApi} from './lib/commodity-fundamentals.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || '8000');
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.APCA_API_KEY_ID;
const SECRET = process.env.APCA_API_SECRET_KEY;
const ORIGIN = 'https://data.alpaca.markets';
const DEFAULT_SYMBOLS = ['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
let cachedSnapshot = {expires:0, value:null};
const directorySources=makeSources();
const universeFile=process.env.RESEARCH_UNIVERSE_PATH||path.join(ROOT,'.local-data','universe.json');
const sharedUniverse=createResearchUniverse({filename:universeFile,searchDirectory:directorySources.searchInstruments,resolveDirectory:directorySources.resolveInstrument});
const sharedSources=makeSources({instrumentResolver:symbol=>sharedUniverse.getInstrument(symbol)});
const handleIntelligence = createIntelligenceApi(sharedSources);
const defaultDiscoveryApi=createDiscoveryApi({universe:sharedUniverse,sources:sharedSources});
const defaultMonitorChartApi=createMonitorChartApi({sources:sharedSources});
const defaultIntradayChartApi=createIntradayChartApi({sources:sharedSources});
const defaultCrisisAtlasApi=createCrisisAtlasApi();
const defaultCpcEnsoApi=createCpcEnsoApi();
const defaultTransmissionApi=createTransmissionApi();
const defaultRegionalClimateApi=createRegionalClimateApi();
const commodityFile=process.env.COMMODITY_PILOT_STORE_PATH||path.join(ROOT,'.local-data','commodity-pilot.json');
const fundamentalsFile=process.env.COMMODITY_FUNDAMENTALS_STORE_PATH||path.join(ROOT,'.local-data','commodity-fundamentals.json');
const defaultCommodityWorkbench=createCommodityWorkbench({filename:commodityFile,fundamentals:createCommodityFundamentals({usgsFile:fundamentalsFile,officialDocuments:()=>defaultCommodityWorkbench.ledger.list(null)})});
const defaultFundamentalsApi=createCommodityFundamentalsApi({service:defaultCommodityWorkbench.fundamentals});
const defaultCommodityApi=createCommodityApi({service:defaultCommodityWorkbench});
const sharedMacroVintage=createMacroVintage();
const defaultMacroVintageApi=createMacroVintageApi({service:sharedMacroVintage});
const sharedLongHistoryMarket=createLongHistoryMarket();
const defaultBacktestApi=createHistoricalBacktestApi({service:createHistoricalBacktest({macro:sharedMacroVintage,marketSources:directorySources,longHistoryMarket:sharedLongHistoryMarket})});
const caseFile = process.env.CASE_STORE_PATH || path.join(ROOT,'.local-data','cases.json');
const defaultCaseStore = createCaseStore(caseFile);
const researchFile=process.env.RESEARCH_STORE_PATH||path.join(ROOT,'.local-data','research.json');
const monitorFile=process.env.MONITOR_STORE_PATH||path.join(ROOT,'.local-data','monitors.json');
const corporateFile=process.env.CORPORATE_STORE_PATH||path.join(ROOT,'.local-data','corporate-alerts.json');
const archiveFile=process.env.EVENT_ARCHIVE_PATH||path.join(ROOT,'.local-data','event-revisions.json');
const defaultRegulatoryApi=createRegulatoryApi({sources:sharedSources,filingReader:createFilingReader(),classifyCorporateEvent,
 corporateStore:createCorporateAlertStore({filename:corporateFile}),eventArchive:createEventArchive({filename:archiveFile}),
 caseStore:defaultCaseStore,
 captureEnabled:process.env.REGULATORY_LOCAL_CAPTURE_ENABLED==='true'});

function json(res,status,body){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});
  res.end(JSON.stringify(body));
}
function isoDateValid(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false; const [y,m,day]=d.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,day));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===day;}
function nextUTCDate(d){const dt=new Date(`${d}T00:00:00Z`);dt.setUTCDate(dt.getUTCDate()+1);return dt.toISOString().slice(0,10);}
async function alpacaGet(endpoint){
  if(!KEY||!SECRET) throw Object.assign(new Error('Credentials not set. Add Alpaca paper-data keys to .env and restart the server.'),{status:503});
  const url = new URL(endpoint,ORIGIN);
  if(url.origin!==ORIGIN)throw new Error('Invalid upstream URL');
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(url,{method:'GET',headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET,'Accept':'application/json'},signal:ctrl.signal});
    // Never echo arbitrary provider error bodies: they can contain credentials.
    if(!r.ok){await r.body?.cancel();throw Object.assign(new Error(r.status===401||r.status===403?'Market data authentication or entitlement failed':`Market data request failed (HTTP ${r.status})`),{status:r.status===429?429:502});}
    const raw=await r.text();let payload;try{payload=JSON.parse(raw)}catch{throw Object.assign(new Error('Invalid market data response'),{status:502});}
    return payload;
  }catch(e){if(e.name==='AbortError')throw Object.assign(new Error('Market data provider timed out'),{status:504});throw e;}finally{clearTimeout(timeout)}
}
const numberOrNull=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const quantityOrNull=value=>numberOrNull(value)!==null&&value>=0?value:null;
const venueOrNull=value=>typeof value==='string'&&/^[A-Za-z0-9@#*?._:+/-]{1,32}$/.test(value)?value:null;
function publicTrade(symbol,t){if(!t||numberOrNull(t.p)===null||t.p<=0||typeof t.t!=='string')return null;return {symbol,sourceId:typeof t.i==='string'||Number.isSafeInteger(t.i)?String(t.i):null,time:t.t,price:t.p,quantity:quantityOrNull(t.s),venue:venueOrNull(t.x),conditions:Array.isArray(t.c)?t.c.filter(c=>typeof c==='string'&&/^[A-Za-z0-9@#*?._:+/-]{1,32}$/.test(c)).slice(0,32):null};}
function publicQuote(symbol,q){if(!q||typeof q.t!=='string')return null;return {symbol,time:q.t,bid:numberOrNull(q.bp),ask:numberOrNull(q.ap),bidSize:quantityOrNull(q.bs),askSize:quantityOrNull(q.as),bidVenue:venueOrNull(q.bx),askVenue:venueOrNull(q.ax)};}
function sanitizeSnapshots(snapshots){const result={};for(const sym of DEFAULT_SYMBOLS){const a=snapshots?.[sym];if(!a)continue;result[sym]={trade:publicTrade(sym,a.latestTrade),quote:publicQuote(sym,a.latestQuote),minuteBar:a.minuteBar?{time:a.minuteBar.t,open:a.minuteBar.o,high:a.minuteBar.h,low:a.minuteBar.l,close:a.minuteBar.c,volume:a.minuteBar.v}:null,previousClose:Number(a.prevDailyBar?.c)||null};}return result;}

export function createServer({marketStream = createMarketStream({key:KEY,secret:SECRET,symbols:DEFAULT_SYMBOLS}), deliveryOptions = {}, researchApi = createResearchApi({filename:researchFile,monitorFilename:monitorFile,sources:sharedSources}), intelligenceApi = handleIntelligence, caseStore = defaultCaseStore, regulatoryApi = defaultRegulatoryApi, discoveryApi=defaultDiscoveryApi, monitorChartApi=defaultMonitorChartApi, intradayChartApi=defaultIntradayChartApi, crisisAtlasApi=defaultCrisisAtlasApi, macroVintageApi=defaultMacroVintageApi,backtestApi=defaultBacktestApi,climateApi=defaultCpcEnsoApi,transmissionApi=defaultTransmissionApi,regionalClimateApi=defaultRegionalClimateApi,commodityApi=defaultCommodityApi,commodityWorkbench=defaultCommodityWorkbench,fundamentalsApi=defaultFundamentalsApi} = {}){
 const delivery=createMarketDelivery({...deliveryOptions,stream:marketStream});
 const handleCases=createCaseApi({store:caseStore}),handleAssistant=createAssistantApi({store:caseStore});
 const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${HOST}:${PORT}`);
    if(delivery.handle(req,res,u))return;
    if(await monitorChartApi(req,res,u))return;
    if(await intradayChartApi(req,res,u))return;
    if(await crisisAtlasApi(req,res,u))return;
    if(await climateApi(req,res,u))return;
    if(await transmissionApi(req,res,u))return;
    if(await regionalClimateApi(req,res,u))return;
    if(await fundamentalsApi(req,res,u))return;
    if(await commodityApi(req,res,u))return;
    if(await macroVintageApi(req,res,u))return;
    if(await backtestApi(req,res,u))return;
    if(await discoveryApi(req,res,u))return;
    if(await regulatoryApi(req,res,u))return;
    if(await researchApi(req,res,u))return;
    if(await handleCases(req,res,u))return;
    if(await handleAssistant(req,res,u))return;
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
    if(await intelligenceApi(req,res,u))return;
    if(u.pathname==='/api/health'){json(res,200,{ready:true,configured:Boolean(KEY&&SECRET),feed:'iex',pollSeconds:15,source:'ALPACA_IEX',marketData:marketStream.getHealth(),marketDataDisclaimer:'Single-venue IEX data; not the consolidated US market.'});return;}
    if(u.pathname==='/api/live'){
      if(Date.now()<cachedSnapshot.expires&&cachedSnapshot.value){json(res,200,{...cachedSnapshot.value,cacheHit:true});return;}
      const symbols=DEFAULT_SYMBOLS.join(',');const response=await alpacaGet(`/v2/stocks/snapshots?symbols=${symbols}&feed=iex`);
      const output={source:'ALPACA_IEX',mode:'LATEST_AVAILABLE',transport:'snapshot-polling',provider:'alpaca',feed:'iex',coverage:'single-venue',fetchedAt:new Date().toISOString(),snapshots:sanitizeSnapshots(response)};
      cachedSnapshot={expires:Date.now()+14000,value:output};json(res,200,{...output,cacheHit:false});return;
    }
    if(u.pathname==='/api/history'){
      const symbol=(u.searchParams.get('symbol')||'AAPL').toUpperCase();const day=u.searchParams.get('date')||'';const feed=(u.searchParams.get('feed')||'iex').toLowerCase();
      if(!DEFAULT_SYMBOLS.includes(symbol)||!isoDateValid(day)||!['iex','sip'].includes(feed)){json(res,400,{error:'Choose a supported symbol and valid YYYY-MM-DD date'});return;}
      const today=new Date().toISOString().slice(0,10);
      if(day>today||day<'2016-01-01'||(feed==='sip'&&day>=today)){json(res,400,{error:'Historical date is outside supported range'});return;}
      const upstream=await alpacaGet(`/v2/stocks/${symbol}/trades?feed=${feed}&start=${day}T00%3A00%3A00Z&end=${nextUTCDate(day)}T00%3A00%3A00Z&sort=desc&limit=1000`);
      const trades=(upstream.trades||[]).map(t=>publicTrade(symbol,t)).filter(Boolean).reverse();
      json(res,200,{source:feed==='sip'?'ALPACA_SIP_HISTORY':'ALPACA_IEX',mode:'HISTORICAL_TRADES',feed,symbol,date:day,fetchedAt:new Date().toISOString(),trades,hasMore:Boolean(upstream.next_page_token),limit:1000});return;
    }
    const ALLOWED={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/live-adapter.js':'live-adapter.js','/event-workspace.js':'event-workspace.js','/intelligence.css':'intelligence.css','/cases.css':'cases.css','/case-workspace.js':'case-workspace.js','/assistant-workspace.js':'assistant-workspace.js','/theme-controls.js':'theme-controls.js','/terminal-theme.css':'terminal-theme.css','/workspace-nav.js':'workspace-nav.js','/research-workspace.js':'research-workspace.js','/research.css':'research.css','/research-operations.js':'research-operations.js','/research-operations.css':'research-operations.css','/discovery-workspace.js':'discovery-workspace.js','/discovery-workspace.css':'discovery-workspace.css','/monitor-candles.js':'monitor-candles.js','/monitor-candles.css':'monitor-candles.css','/crisis-workspace.js':'crisis-workspace.js','/crisis-workspace.css':'crisis-workspace.css','/commodity.html':'commodity.html','/commodity.js':'commodity.js','/commodity.css':'commodity.css'};
    const file=ALLOWED[u.pathname];if(!file){json(res,404,{error:'Not found'});return;}
    const data=await fs.readFile(path.join(ROOT,file));
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(data);
  }catch(e){const status=e.status||500;json(res,status,{error:status===500?'Local data service error':e.message});}
 });
 // Close delivery before HTTP shutdown because SSE connections are long-lived.
 server.closeMarketData=()=>delivery.close();
 server.closeResearch=()=>{researchApi.close?.();commodityWorkbench.close?.();};
 server.once('listening',async()=>{try{await researchApi.start?.();}catch{console.error('Local research monitoring could not start; check the monitor store.');}
  try{await commodityWorkbench.start?.();}catch{console.error('Local commodity pilot scheduler could not start; check its store.');}});
 server.once('close',()=>{delivery.close();server.closeResearch();});
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createServer();
  server.listen(PORT,HOST,()=>{console.log(`TradeScope local: http://${HOST}:${PORT}`);console.log(`Alpaca credentials: ${KEY&&SECRET?'configured':'missing (demo is still available)'}`);});
  const shutdown=()=>{server.closeResearch();server.closeMarketData();server.close();};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
export {isoDateValid,sanitizeSnapshots,publicTrade,publicQuote};
