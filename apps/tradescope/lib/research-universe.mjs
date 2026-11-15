/** Bounded local research identities and watchlists, separate from live feed subscriptions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {INSTRUMENTS} from './research-catalog.mjs';
import {validEventTimestamp} from './market-events.mjs';

const DIRECTORY_URL='https://www.sec.gov/files/company_tickers_exchange.json';
const CIK={NVDA:'0001045810',AAPL:'0000320193',MSFT:'0000789019',TSLA:'0001318605',AMD:'0000002488',META:'0001326801',AMZN:'0001018724',PLTR:'0001321655'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=value=>structuredClone(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const symbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(value);
const instant=validEventTimestamp;
const bounded=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
const seed=INSTRUMENTS.map(item=>({...item,cik:CIK[item.symbol]??null,issuerId:CIK[item.symbol]?'SEC_CIK:'+CIK[item.symbol]:null,
 identitySource:'TRADESCOPE_SEED_MAPPING',sourceUrl:CIK[item.symbol]?`https://data.sec.gov/submissions/CIK${CIK[item.symbol]}.json`:null,
 verifiedAt:null,registeredAt:null,updatedAt:null,identityLimitations:'Initial reviewed pilot mapping; not newly verified or a permanent security identifier.'}));
const seedBySymbol=new Map(seed.map(item=>[item.symbol,item]));

function directoryInstrument(input){
 if(!object(input)||!symbol(input.symbol)||input.instrumentId!=='US_EQUITY:'+input.symbol||
  !/^\d{10}$/.test(input.cik||'')||/^0+$/.test(input.cik)||input.issuerId!=='SEC_CIK:'+input.cik||
  input.identitySource!=='SEC_COMPANY_TICKERS_EXCHANGE'||input.sourceUrl!==DIRECTORY_URL||!instant(input.verifiedAt))throw fail('Official issuer identity is unavailable or inconsistent',502);
 const name=bounded(input.name,255);if(!name)throw fail('Official issuer identity is incomplete',502);
 return {instrumentId:input.instrumentId,symbol:input.symbol,name,cik:input.cik,issuerId:input.issuerId,
  type:'unknown',currency:'USD',currencyBasis:'US-equity market-data denomination; not a field supplied by the SEC ticker directory.',
  exchange:bounded(input.exchange,60),sector:null,classification:'unavailable',marketTimeZone:'America/New_York',
  coverage:'Registered US-listed research symbol; market data remains provider/entitlement dependent',secCompanySupported:true,
  identitySource:input.identitySource,sourceUrl:DIRECTORY_URL,verifiedAt:input.verifiedAt,
  identityLimitations:'SEC ticker/issuer mapping does not establish security type, sector, trading eligibility or a permanent instrument identifier.'};
}

export function createResearchUniverse({filename,searchDirectory,resolveDirectory,now=Date.now,maxInstruments=50,maxWatchlists=20,maxWatchlistSymbols=25}={}){
 if(typeof filename!=='string'||!filename)throw fail('A universe store filename is required');
 if(!Number.isInteger(maxInstruments)||maxInstruments<seed.length||maxInstruments>50||!Number.isInteger(maxWatchlists)||maxWatchlists<1||maxWatchlists>20||
  !Number.isInteger(maxWatchlistSymbols)||maxWatchlistSymbols<1||maxWatchlistSymbols>25)throw fail('Invalid universe storage bounds');
 let state=null,loading=null,serial=Promise.resolve();const pendingRegistrations=new Map();
 const timestamp=()=>{const time=Number(now());if(!Number.isFinite(time))throw fail('Invalid universe clock',500);return new Date(time).toISOString();};
 const normalizeSymbol=value=>{if(!symbol(value))throw fail('Choose a valid uppercase research symbol');return value;};
 function watchlist(input){
  if(!object(input))throw fail('Watchlist must be an object');
  const name=bounded(input.name,120);if(!name)throw fail('Watchlist name is required and must be at most 120 characters');
  if(!Array.isArray(input.symbols)||input.symbols.length>maxWatchlistSymbols||!input.symbols.every(symbol))throw fail(`Choose up to ${maxWatchlistSymbols} valid registered symbols`);
  if(new Set(input.symbols).size!==input.symbols.length)throw fail('Watchlist symbols must be unique');
  return {name,symbols:[...input.symbols]};
 }
 function checkedDocument(input){
  if(!object(input)||input.schemaVersion!==1||!Array.isArray(input.instruments)||!Array.isArray(input.watchlists)||input.instruments.length>maxInstruments||input.watchlists.length>maxWatchlists)throw fail('Universe store has an invalid schema',500);
  const instruments=input.instruments.map(item=>{
   if(!object(item)||!symbol(item.symbol))throw fail('Universe identity has an invalid schema',500);
   const known=seedBySymbol.get(item.symbol);
   if(known&&item.identitySource==='TRADESCOPE_SEED_MAPPING')return copy(known);
   let clean;try{clean=directoryInstrument(item);}catch{throw fail('Universe identity has an invalid source contract',500);}
   if(!instant(item.registeredAt)||!instant(item.updatedAt))throw fail('Universe identity dates are invalid',500);
   return {...clean,registeredAt:item.registeredAt,updatedAt:item.updatedAt};
  });
  if(new Set(instruments.map(item=>item.symbol)).size!==instruments.length||seed.some(item=>!instruments.some(candidate=>candidate.symbol===item.symbol)))throw fail('Universe identities are incomplete or duplicated',500);
  const allowed=new Set(instruments.map(item=>item.symbol));
  const watchlists=input.watchlists.map(item=>{
   let clean;try{clean=watchlist(item);}catch{throw fail('Stored watchlist has an invalid schema',500);}
   if(!/^WATCHLIST-[a-f0-9-]{36}$/.test(item.id||'')||!Number.isSafeInteger(item.revision)||item.revision<1||!instant(item.createdAt)||!instant(item.updatedAt)||clean.symbols.some(value=>!allowed.has(value)))throw fail('Stored watchlist has an invalid schema',500);
   return {...clean,id:item.id,revision:item.revision,createdAt:item.createdAt,updatedAt:item.updatedAt};
  });
  if(new Set(watchlists.map(item=>item.id)).size!==watchlists.length)throw fail('Stored watchlists have duplicate identifiers',500);
  return {schemaVersion:1,instruments,watchlists};
 }
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{const info=await fs.stat(filename);if(info.size>524288)throw fail('Universe store exceeds its size limit',500);state=checkedDocument(JSON.parse(await fs.readFile(filename,'utf8')));}
   catch(error){if(error.code==='ENOENT')state={schemaVersion:1,instruments:copy(seed),watchlists:[]};else if(error.status===500)throw error;else throw fail('Universe store could not be read safely',500);}
   return state;
  })().catch(error=>{loading=null;throw error;});return loading;
 }
 async function save(document){
  await fs.mkdir(path.dirname(filename),{recursive:true});const temporary=`${filename}.${randomUUID()}.tmp`;
  try{await fs.writeFile(temporary,JSON.stringify(document,null,2)+'\n',{encoding:'utf8',mode:0o600});await fs.rename(temporary,filename);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 }
 const write=operation=>{const result=serial.then(async()=>{await load();const candidate=copy(state),value=operation(candidate);await save(candidate);state=candidate;return copy(value);});serial=result.catch(()=>{});return result;};
 const read=async operation=>{await serial;await load();return copy(operation(state));};
 const find=(document,id)=>{const item=document.watchlists.find(value=>value.id===id);if(!item)throw fail('Watchlist not found',404);return item;};
 const revision=(expected,item)=>{if(expected!==item.revision)throw fail('Watchlist changed; refresh and retry',409);};
 const unavailable=error=>({source:'SEC_COMPANY_TICKERS_EXCHANGE',status:error?.status===503?503:error?.status===429?429:502,
  message:error?.status===503?'Set SEC_USER_AGENT locally to search the official issuer directory.':error?.status===429?'SEC directory rate limit reached; retry later.':'Official issuer search is unavailable; registered symbols remain usable.'});
 return {
  listInstruments(){return read(document=>document.instruments);},
  async getInstrument(value){const selected=normalizeSymbol(value);return read(document=>{const item=document.instruments.find(entry=>entry.symbol===selected);if(!item)throw fail('Research symbol is not registered',404);return item;});},
  async search(query,{limit=20}={}){
   const term=bounded(query,80);if(!term||/[\x00-\x1f]/.test(term)||!Number.isInteger(limit)||limit<1||limit>20)throw fail('Enter a search query and limit between one and twenty');
   const local=await read(document=>document.instruments.filter(item=>`${item.symbol} ${item.name}`.toLowerCase().includes(term.toLowerCase()))),errors=[];
   let external=[],fetchedAt=null,providerCoverage=null;
   if(typeof searchDirectory==='function')try{const result=await searchDirectory(term,{limit});external=(Array.isArray(result?.results)?result.results:[]).slice(0,20).map(directoryInstrument);fetchedAt=result.fetchedAt??null;providerCoverage=result.coverage??null;}catch(error){errors.push(unavailable(error));}
   else errors.push(unavailable({status:503}));
   const merged=new Map(local.map(item=>[item.symbol,item]));for(const item of external)merged.set(item.symbol,item);
   const matches=[...merged.values()].sort((left,right)=>(left.symbol===term.toUpperCase()?-1:right.symbol===term.toUpperCase()?1:left.symbol.localeCompare(right.symbol)));
   return {results:matches.slice(0,limit),source:external.length?'SEC_COMPANY_TICKERS_EXCHANGE':'LOCAL_REGISTERED_UNIVERSE',fetchedAt,
    coverage:{registered:local.length,returned:Math.min(matches.length,limit),truncated:matches.length>limit,directory:providerCoverage},errors,
    limitations:['Directory matches require explicit registration before research or watchlist use.','Ticker mappings are not permanent security identities or authoritative sector classifications.']};
  },
  async register(value){
   const selected=normalizeSymbol(value),found=await read(document=>({existing:document.instruments.find(item=>item.symbol===selected),count:document.instruments.length}));if(found.existing)return found.existing;
   if(pendingRegistrations.has(selected))return copy(await pendingRegistrations.get(selected));
   if(found.count>=maxInstruments)throw fail('Registered research instrument limit reached',409);
   if(pendingRegistrations.size>=maxInstruments)throw fail('Official issuer registration queue is busy',503);
   const pending=(async()=>{
    if(typeof resolveDirectory!=='function')throw fail('Official issuer directory is not configured',503);
    let resolved;try{resolved=directoryInstrument(await resolveDirectory(selected));}catch(error){if(error?.status===404)throw fail('No exact official issuer directory match exists for this symbol',404);const safe=unavailable(error);throw fail(safe.message,safe.status);}
    if(resolved.symbol!==selected)throw fail('Official issuer lookup returned a different symbol',502);
    return write(document=>{const found=document.instruments.find(item=>item.symbol===selected);if(found)return found;if(document.instruments.length>=maxInstruments)throw fail('Registered research instrument limit reached',409);
     const stamp=timestamp(),created={...resolved,registeredAt:stamp,updatedAt:stamp};document.instruments.push(created);return created;});
   })();pendingRegistrations.set(selected,pending);try{return copy(await pending);}finally{pendingRegistrations.delete(selected);}
  },
  listWatchlists(){return read(document=>document.watchlists.slice().sort((left,right)=>right.updatedAt.localeCompare(left.updatedAt)));},
  getWatchlist(id){return read(document=>find(document,id));},
  async saveWatchlist(input,{expectedRevision}={}){
   const clean=watchlist(input);
   return write(document=>{
    if(clean.symbols.some(value=>!document.instruments.some(item=>item.symbol===value)))throw fail('Register every watchlist symbol before saving');
    const stamp=timestamp();
    if(input.id!==undefined){const current=find(document,input.id);revision(expectedRevision,current);const updated={...clean,id:current.id,revision:current.revision+1,createdAt:current.createdAt,updatedAt:stamp};document.watchlists[document.watchlists.indexOf(current)]=updated;return updated;}
    if(document.watchlists.length>=maxWatchlists)throw fail('Local watchlist limit reached',409);
    const created={...clean,id:'WATCHLIST-'+randomUUID(),revision:1,createdAt:stamp,updatedAt:stamp};document.watchlists.push(created);return created;
   });
  },
  deleteWatchlist(id,{expectedRevision}={}){return write(document=>{const current=find(document,id);revision(expectedRevision,current);document.watchlists=document.watchlists.filter(item=>item.id!==id);return {id,deleted:true};});},
 };
}
