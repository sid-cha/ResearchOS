/** Local single-user research API. No credentials or raw SEC responses leave it. */
import {makeSources} from './sources.mjs';
import {researchCatalog,INSTRUMENTS,RESEARCH_SYMBOLS,METRIC_IDS} from './research-catalog.mjs';
import {buildTechnicalMetrics} from './research-technical.mjs';
import {buildFinancialMetrics} from './research-fundamentals.mjs';
import {BUILTIN_RULES,BUILTIN_SCREENS,validateScreen,evaluateRule,screenCompanies} from './research-rules.mjs';
import {createResearchStore} from './research-store.mjs';
import {createFilingReader} from './filing-intelligence.mjs';
import {createEarthquakeResearch,compareEventOutcomes} from './event-analogues.mjs';
import {validEventTimestamp} from './market-events.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const safeCopy=value=>structuredClone(value);
function respond(res,status,value){
 if(res.destroyed||res.writableEnded)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(value));
}
async function readBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail('Send application/json',415);
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>32768)throw fail('Research request exceeds 32KB',413);chunks.push(chunk);}
 try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}
 catch{throw fail('Research request must contain a JSON object');}
}
function sameOrigin(req){
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 if(!req.headers.origin)return true;
 try{return new URL(req.headers.origin).origin===`http://${req.headers.host}`;}catch{return false;}
}
function publicError(error,source){
 const status=Number.isInteger(error?.status)?error.status:502;
 const message=status===503?(source==='SEC'?'Set SEC_USER_AGENT locally to enable reported company facts.':source==='ALPACA_IEX'?'Configure local Alpaca credentials to load market bars.':'Public event service is temporarily unavailable.'):
  status===422?'SEC company coverage is unavailable for this instrument.':
  status===429?'Provider rate limit reached; retry after the provider window.':
  status===504?'Provider request timed out.':'Provider data is unavailable or access was rejected.';
 return {source,status,message};
}
async function providerRequest(task,source){
 try{return await task();}catch(error){
  const status=[400,404,422,429,503,504].includes(error?.status)?error.status:502;
  const message=status===400?'Provider rejected the selected research record.':status===404?'Provider research record is unavailable.':publicError({...error,status},source).message;
  throw fail(message,status);
 }
}
const checkedSymbol=value=>{const symbol=String(value||'AAPL').toUpperCase();if(!RESEARCH_SYMBOLS.includes(symbol))throw fail('Choose one of the ten supported research symbols');return symbol;};
const checkedSymbols=value=>{
 if(value===undefined)return [...RESEARCH_SYMBOLS];
 if(!Array.isArray(value)||!value.length||value.length>10)throw fail('Choose between one and ten pilot symbols');
 const result=[...new Set(value.map(checkedSymbol))];return result;
};
const isoDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export function createResearchApi({filename,sources=makeSources(),store=createResearchStore(filename),
 filingReader=createFilingReader(),earthquakes=createEarthquakeResearch(),now=Date.now}={}){
 const companies=new Map(),inflight=new Map(),queue=[];
 let active=0;
 const previousObservations=record=>record.observations.filter(item=>item.details?.previousAsOf).map(item=>({...item,
  value:item.details.previousValue,status:item.details.previousStatus||'available',asOf:item.details.previousAsOf}));
 function pump(){while(active<2&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
 function bounded(task){if(queue.length>=20)throw fail('Local research queue is busy; retry shortly',503);return new Promise((resolve,reject)=>{queue.push({task,resolve,reject});pump();});}
 async function company(symbol){
  const cached=companies.get(symbol);if(cached&&cached.until>now())return safeCopy(cached.value);
  if(inflight.has(symbol))return safeCopy(await inflight.get(symbol));
  const promise=bounded(async()=>{
   const [market,financial]=await Promise.allSettled([
    sources.researchBars(symbol,{days:800,feed:'iex',adjustment:'split'}),sources.companyFacts(symbol)
   ]);
   const timestamp=new Date(now()).toISOString(),errors=[];
   if(market.status==='rejected')errors.push(publicError(market.reason,'ALPACA_IEX'));
   if(financial.status==='rejected')errors.push(publicError(financial.reason,'SEC'));
   const marketData=market.status==='fulfilled'?market.value:null;
   const facts=financial.status==='fulfilled'?financial.value:null;
   const technical=buildTechnicalMetrics(marketData?.bars||[],{symbol,source:'ALPACA_IEX',fetchedAt:marketData?.fetchedAt||timestamp,now:now(),adjustment:marketData?.adjustment||'split'});
   const close=technical.observations.find(item=>item.id==='price.close');
   const fundamentals=buildFinancialMetrics(facts?.facts||{}, {symbol,asOf:timestamp.slice(0,10),
    price:close?.status==='available'?close.value:null,priceAsOf:close?.asOf||null,priceSource:'ALPACA_IEX',fetchedAt:facts?.fetchedAt||timestamp});
   const item={schemaVersion:1,symbol,instrument:INSTRUMENTS.find(item=>item.symbol===symbol),
    company:(typeof fundamentals.company==='string'?fundamentals.company:fundamentals.company?.name)||INSTRUMENTS.find(item=>item.symbol===symbol)?.name||symbol,
    observations:[...technical.observations,...fundamentals.observations],series:technical.series||[],
    asOf:technical.asOf||null,checkedAt:timestamp,errors,
    quality:{technical:technical.inputQuality,financial:fundamentals.quality,partial:errors.length>0,partialHistory:marketData?.partialHistory??false},
    methodology:{technical:technical.methodology,financial:fundamentals.methodology,adjustment:marketData?.adjustment||'split'},
    coverage:'Ten-symbol US-listed pilot; IEX single venue; reported SEC facts where supported'};
   companies.set(symbol,{until:now()+(errors.length?10000:60000),value:item});
   return item;
  });
  inflight.set(symbol,promise);
  try{return safeCopy(await promise);}finally{inflight.delete(symbol);}
 }
 async function evaluations(symbol){
  const record=await company(symbol);
  const previous=previousObservations(record);
  const results=BUILTIN_RULES.map(rule=>({...evaluateRule(rule,{symbol,observations:record.observations,previousObservations:previous,now:now(),mode:'LIVE'}),name:rule.name,category:rule.category||'Research condition'}));
  for(const result of results)await store.recordEvaluation(result,{now:now(),cooldownSeconds:300});
  return {company:record,evaluations:results.map(result=>({...result,reason:(result.reasons||[]).join(' ')})),alerts:await store.listAlerts({symbol})};
 }
 async function runScreen(body){
  const symbols=checkedSymbols(body.symbols);
  const input=body.screen||BUILTIN_SCREENS.find(item=>item.id===body.presetId);
  if(!input)throw fail('Supply a screen or a supported preset');
  const criteria=validateScreen(input,{metricIds:METRIC_IDS});
  if(criteria.symbols)checkedSymbols(criteria.symbols);
  const outcomes=await Promise.allSettled(symbols.map(symbol=>company(symbol)));
  const records=outcomes.flatMap((result,index)=>result.status==='fulfilled'?[result.value]:[{symbol:symbols[index],observations:[],errors:[{source:'research',message:'Company research unavailable'}]}]);
  const result=screenCompanies(records.map(record=>({...record,previousObservations:previousObservations(record)})),criteria,{now:now(),mode:'LIVE'});
  return {...result,errors:records.flatMap(record=>(record.errors||[]).map(error=>({...error,symbol:record.symbol}))),
   coverage:{requested:symbols.length,available:records.filter(record=>record.observations.some(metric=>metric.status==='available')).length,
    universe:'requested subset of ten pilot symbols',completeMarket:false}};
 }
 async function eventOutcomes(symbol,eventTime){
  const timestamp=Date.parse(eventTime);
  if(!validEventTimestamp(eventTime)||!Number.isFinite(timestamp)||timestamp>now()||timestamp<Date.parse('2016-01-01T00:00:00Z'))throw fail('Choose a past ISO event time covered by market history');
  if(symbol==='SPY')throw fail('Choose a security other than the SPY benchmark',422);
  const start=new Date(timestamp-70*86400000).toISOString().slice(0,10);
  const end=new Date(Math.min(now(),timestamp+65*86400000)).toISOString().slice(0,10);
  const safeStart=start<'2016-01-01'?'2016-01-01':start;
  const [stock,benchmark]=await Promise.all([
   providerRequest(()=>sources.researchBars(symbol,{start:safeStart,end,adjustment:'all'}),'ALPACA_IEX'),providerRequest(()=>sources.researchBars('SPY',{start:safeStart,end,adjustment:'all'}),'ALPACA_IEX')
  ]);
  return {schemaVersion:1,symbol,benchmark:'SPY',source:'ALPACA_IEX',adjustment:'all',
   study:compareEventOutcomes(eventTime,stock.bars,benchmark.bars,{now:now()}),
   coverage:'Supported US-listed IEX daily price proxy; not a global exposure or forecast model'};
 }
 return async function handleResearch(req,res,url){
  if(!url.pathname.startsWith('/api/research/'))return false;
  try{
   if(!sameOrigin(req))throw fail('Use the same-origin local TradeScope terminal',403);
   const resource=url.pathname.slice('/api/research/'.length),parts=resource.split('/'),method=req.method;
   if(method==='GET'&&resource==='catalog'){respond(res,200,researchCatalog());return true;}
   if(method==='GET'&&resource==='company'){respond(res,200,await company(checkedSymbol(url.searchParams.get('symbol'))));return true;}
   if(method==='POST'&&resource==='evaluate'){const body=await readBody(req);respond(res,200,await evaluations(checkedSymbol(body.symbol)));return true;}
   if(method==='POST'&&resource==='screen'){respond(res,200,await runScreen(await readBody(req)));return true;}
   if(method==='GET'&&resource==='screens'){respond(res,200,{screens:await store.listScreens(),presets:BUILTIN_SCREENS});return true;}
   if(method==='POST'&&resource==='screens'){
    const body=await readBody(req),screen=validateScreen(body.screen||body,{metricIds:METRIC_IDS});
    if(screen.symbols)checkedSymbols(screen.symbols);
    const saved=await store.saveScreen(screen,{expectedRevision:body.expectedRevision});respond(res,201,saved);return true;
   }
   if(method==='DELETE'&&parts[0]==='screens'&&parts.length===2){const body=await readBody(req);await store.deleteScreen(parts[1],{expectedRevision:body.expectedRevision});respond(res,200,{deleted:true});return true;}
   if(method==='GET'&&resource==='alerts'){
    const status=url.searchParams.get('status')||undefined,symbol=url.searchParams.has('symbol')?checkedSymbol(url.searchParams.get('symbol')):undefined;
    respond(res,200,{alerts:await store.listAlerts({status,symbol})});return true;
   }
   if(method==='PATCH'&&parts[0]==='alerts'&&parts.length===2){respond(res,200,{alert:await store.updateAlert(parts[1],await readBody(req))});return true;}
   if(method==='GET'&&resource==='filing'){
    const symbol=checkedSymbol(url.searchParams.get('symbol')),accession=url.searchParams.get('accession');
    if(!/^\d{10}-\d{2}-\d{6}$/.test(accession||''))throw fail('Choose a valid accession from the current SEC filing list');
    const filings=await providerRequest(()=>sources.filings(symbol),'SEC'),filing=filings.filings.find(item=>item.accession===accession);
    if(!filing)throw fail('Filing is not in the supported issuer filing list',404);
    respond(res,200,await providerRequest(()=>filingReader.read({filing,symbol}),'SEC'));return true;
   }
   if(method==='GET'&&resource==='earthquakes'){respond(res,200,await providerRequest(()=>earthquakes.recentEvents(),'USGS'));return true;}
   if(method==='GET'&&resource==='analogues'){
    const eventId=url.searchParams.get('eventId');if(!eventId)throw fail('Select an official earthquake first');
    respond(res,200,await providerRequest(()=>earthquakes.findAnalogues({eventId,limit:5}),'USGS'));return true;
   }
   if(method==='GET'&&resource==='event-outcomes'){respond(res,200,await eventOutcomes(checkedSymbol(url.searchParams.get('symbol')),url.searchParams.get('eventTime')));return true;}
   respond(res,405,{error:'Method or research resource is not supported'});
  }catch(error){const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<600?error.status:500;
   respond(res,status,{error:status===500?'Local research service error; retry or inspect the server.':error.message});
  }
  return true;
 };
}
