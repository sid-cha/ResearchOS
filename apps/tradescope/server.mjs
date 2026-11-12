import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeSources} from './lib/sources.mjs';
import {createIntelligenceApi} from './lib/api.mjs';
import {createCaseApi} from './lib/case-api.mjs';
import {createAssistantApi} from './lib/assistant-api.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || '8000');
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.APCA_API_KEY_ID;
const SECRET = process.env.APCA_API_SECRET_KEY;
const ORIGIN = 'https://data.alpaca.markets';
const DEFAULT_SYMBOLS = ['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
let cachedSnapshot = {expires:0, value:null};
const handleIntelligence = createIntelligenceApi(makeSources());
const caseFile = process.env.CASE_STORE_PATH || path.join(ROOT,'.local-data','cases.json');
const handleCases = createCaseApi({filename:caseFile});
const handleAssistant = createAssistantApi({filename:caseFile});

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
    const raw=await r.text();let payload;try{payload=JSON.parse(raw)}catch{payload={message:'Invalid upstream response'}}
    if(!r.ok)throw Object.assign(new Error(`${payload.message||'Market data request failed'} (HTTP ${r.status})`),{status:r.status===429?429:502});
    return payload;
  }catch(e){if(e.name==='AbortError')throw Object.assign(new Error('Market data provider timed out'),{status:504});throw e;}finally{clearTimeout(timeout)}
}
function publicTrade(symbol,t){if(!t||typeof t.p!=='number'||typeof t.t!=='string')return null;return {symbol,sourceId:String(t.i??t.t),time:t.t,price:t.p,quantity:Number(t.s)||0,venue:t.x||'IEX',conditions:Array.isArray(t.c)?t.c:[]};}
function publicQuote(symbol,q){if(!q||typeof q.t!=='string')return null;return {symbol,time:q.t,bid:Number(q.bp)||0,ask:Number(q.ap)||0,bidSize:Number(q.bs)||0,askSize:Number(q.as)||0,bidVenue:q.bx||'IEX',askVenue:q.ax||'IEX'};}
function sanitizeSnapshots(snapshots){const result={};for(const sym of DEFAULT_SYMBOLS){const a=snapshots?.[sym];if(!a)continue;result[sym]={trade:publicTrade(sym,a.latestTrade),quote:publicQuote(sym,a.latestQuote),minuteBar:a.minuteBar?{time:a.minuteBar.t,open:a.minuteBar.o,high:a.minuteBar.h,low:a.minuteBar.l,close:a.minuteBar.c,volume:a.minuteBar.v}:null,previousClose:Number(a.prevDailyBar?.c)||null};}return result;}

export function createServer(){return http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${HOST}:${PORT}`);
    if(await handleCases(req,res,u))return;
    if(await handleAssistant(req,res,u))return;
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
    if(await handleIntelligence(req,res,u))return;
    if(u.pathname==='/api/health'){json(res,200,{ready:true,configured:Boolean(KEY&&SECRET),feed:'iex',pollSeconds:15,source:'ALPACA_IEX',marketDataDisclaimer:'Single-venue IEX data; not the consolidated US market.'});return;}
    if(u.pathname==='/api/live'){
      if(Date.now()<cachedSnapshot.expires&&cachedSnapshot.value){json(res,200,{...cachedSnapshot.value,cacheHit:true});return;}
      const symbols=DEFAULT_SYMBOLS.join(',');const response=await alpacaGet(`/v2/stocks/snapshots?symbols=${symbols}&feed=iex`);
      const output={source:'ALPACA_IEX',mode:'LATEST_AVAILABLE',fetchedAt:new Date().toISOString(),snapshots:sanitizeSnapshots(response)};
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
    const ALLOWED={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/live-adapter.js':'live-adapter.js','/event-workspace.js':'event-workspace.js','/intelligence.css':'intelligence.css','/cases.css':'cases.css','/case-workspace.js':'case-workspace.js','/assistant-workspace.js':'assistant-workspace.js','/theme-controls.js':'theme-controls.js','/terminal-theme.css':'terminal-theme.css','/workspace-nav.js':'workspace-nav.js'};
    const file=ALLOWED[u.pathname];if(!file){json(res,404,{error:'Not found'});return;}
    const data=await fs.readFile(path.join(ROOT,file));
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(data);
  }catch(e){const status=e.status||500;json(res,status,{error:status===500?'Local data service error':e.message});}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  createServer().listen(PORT,HOST,()=>{console.log(`TradeScope local: http://${HOST}:${PORT}`);console.log(`Alpaca credentials: ${KEY&&SECRET?'configured':'missing (demo is still available)'}`);});
}
export {isoDateValid,sanitizeSnapshots,publicTrade,publicQuote};
