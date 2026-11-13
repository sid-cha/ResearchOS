/** FRED/ALFRED research discovery (v0.23).
 * Fixed official hostname, server-side key, bounded metadata and historical-as-of observations.
 * Release-date and revision-date metadata do NOT prove intraday dissemination.
 */
const BASE='https://api.stlouisfed.org/fred/';
const err=(m,status=400)=>Object.assign(new Error(m),{status});
const okDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const sid=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9._-]{0,39}$/.test(x);
const readable=x=>typeof x==='string'?x.slice(0,320):null;
function validateKey(env){const v=env?.FRED_API_KEY;if(typeof v!=='string'||!/^[a-z0-9]{32}$/.test(v))throw err('FRED_API_KEY is not configured',503);return v;}
export function fredResearchUrl(type,options={},env={}){
 const paths={search:'series/search',series:'series',vintages:'series/vintagedates',
  release:'series/release',releaseDates:'release/dates',observations:'series/observations'};
 const path=paths[type];if(!path)throw err('Unsupported official FRED endpoint');
 const url=new URL(BASE+path);
 url.searchParams.set('api_key',validateKey(env));
 url.searchParams.set('file_type','json');
 if(type==='search'){
  const q=options.q;
  if(typeof q!=='string'||q.trim().length<2||q.length>70||/[<>[\]{}\\]/.test(q))throw err('Search must contain 2–70 safe characters');
  url.searchParams.set('search_text',q.trim());url.searchParams.set('limit','15');
 }else if(type==='releaseDates'){
  const id=Number(options.releaseId);
  if(!Number.isSafeInteger(id)||id<1||id>20000)throw err('Choose a valid FRED release ID');
  url.searchParams.set('release_id',String(id));url.searchParams.set('limit','100');
  url.searchParams.set('sort_order','desc');
 }else{
  if(!sid(options.id))throw err('Choose a valid FRED series ID');
  url.searchParams.set('series_id',options.id);
  if(type==='vintages'){url.searchParams.set('limit','150');url.searchParams.set('sort_order','desc');}
  if(type==='observations'){
   if(!okDay(options.asOf))throw err('Choose a valid historical asOf date');
   const months=Number(options.months??18);
   if(!Number.isInteger(months)||months<1||months>60)throw err('Choose a 1–60 month window');
   const cutoff=new Date(options.asOf+'T00:00:00Z');
   cutoff.setUTCMonth(cutoff.getUTCMonth()-months);
   url.searchParams.set('realtime_start',options.asOf);
   url.searchParams.set('realtime_end',options.asOf);
   url.searchParams.set('observation_start',cutoff.toISOString().slice(0,10));
   url.searchParams.set('observation_end',options.asOf);
   url.searchParams.set('sort_order','desc');url.searchParams.set('limit','500');
  }
 }
 return url;
}
export function normalizeFredResearch(type,raw,{id=null,asOf=null,fetchedAt}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw err('Malformed FRED source response',502);
 const common={source:'FRED_ALFRED_OFFICIAL_API',type,seriesId:id,
  fetchedAt,originalIntradayReleaseVerified:false,
  note:'Current FRED metadata and ALFRED historical vintage dates do not establish intraday first-publication or complete proprietary rights.'};
 if(type==='search'||type==='series'){
  const rows=raw.seriess;
  if(!Array.isArray(rows)||rows.length>(type==='search'?15:5))throw err('FRED series discovery schema mismatch',502);
  return {...common,series:rows.map(x=>({
   id:sid(x?.id)?x.id:null,title:readable(x.title),
   frequency:readable(x.frequency),units:readable(x.units),seasonalAdjustment:readable(x.seasonal_adjustment),
   observationStart:okDay(x.observation_start)?x.observation_start:null,
   observationEnd:okDay(x.observation_end)?x.observation_end:null,
   lastUpdated:readable(x.last_updated),
   sourceUrl:sid(x.id)?'https://fred.stlouisfed.org/series/'+x.id:null
  })).filter(x=>x.id)};
 }
 if(type==='vintages'){
  if(!Array.isArray(raw.vintage_dates)||raw.vintage_dates.length>150)throw err('FRED vintage calendar schema mismatch',502);
  return {...common,dates:raw.vintage_dates.filter(okDay).slice(0,150),
   note:'Vintage dates mark changes/new values; not all source release dates and not confirmed publication timestamps.'};
 }
 if(type==='release'){
  if(!Array.isArray(raw.releases)||raw.releases.length>10)throw err('FRED series release schema mismatch',502);
  return {...common,releases:raw.releases.filter(x=>Number.isInteger(x?.id)).map(x=>({
   id:x.id,label:readable(x.name),sourceUrl:'https://fred.stlouisfed.org/releases/'+x.id
  }))};
 }
 if(type==='releaseDates'){
  if(!Array.isArray(raw.release_dates)||raw.release_dates.length>100)throw err('FRED release date schema mismatch',502);
  return {...common,dates:raw.release_dates.filter(x=>okDay(x.date)).map(x=>({date:x.date,releaseId:Number(x.release_id)})),
   note:'Release dates are source calendars and may not coincide with availability on FRED/ALFRED.'};
 }
 if(type==='observations'){
  if(!okDay(asOf)||raw.realtime_start!==asOf||raw.realtime_end!==asOf||
   !Array.isArray(raw.observations)||raw.observations.length>500)throw err('FRED as-of observation vintage mismatch',502);
  const points=[];
  for(const x of raw.observations){
   if(!okDay(x?.date)||x.date>asOf||!okDay(x.realtime_start)||!okDay(x.realtime_end)||
    x.realtime_start>asOf||x.realtime_end<asOf)throw err('FRED returned future or non-vintage observations',502);
   const v=x.value==='.'?null:Number(x.value);
   if(v!==null&&!Number.isFinite(v))throw err('FRED returned a non-numeric observation',502);
   points.push({date:x.date,value:v,vintageStart:x.realtime_start,vintageEnd:x.realtime_end});
  }
  return {...common,asOf,observations:points,sourceUrl:'https://fred.stlouisfed.org/series/'+id,
   note:'As-of values use FRED real-time calendar-day windows. Intraday availability and later website revisions remain unverified.'};
 }
 throw err('Unsupported response normalizer');
}
async function limitedJson(response,max=700000){
 const content=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(content)&&content>max)throw err('FRED payload exceeded bound',502);
 const type=response.headers?.get?.('content-type')||'';
 if(type&&!type.toLowerCase().includes('json'))throw err('FRED returned non-JSON content',502);
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;
   if(size>max){await reader.cancel();throw err('FRED payload exceeded bound',502);}
   chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw err('FRED JSON was invalid',502);}
 }
 const text=await response.text();if(Buffer.byteLength(text)>max)throw err('FRED payload exceeded bound',502);
 try{return JSON.parse(text);}catch{throw err('FRED JSON was invalid',502);}
}
export function createFredExplorer({fetchImpl=fetch,env=process.env,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 async function query(type,options={}){
  const today=now().toISOString().slice(0,10);
  if(type==='observations'&&options.asOf>today)throw err('As-of date must not be in the future');
  const url=fredResearchUrl(type,options,env),cacheKey=type+':'+JSON.stringify(options);
  const existing=cache.get(cacheKey);if(existing?.expiry>Date.now())return structuredClone(existing.value);
  if(pending.has(cacheKey))return structuredClone(await pending.get(cacheKey));
  const load=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok){
     await response.body?.cancel?.();
     throw err(response.status===429?'FRED rate limited':
      response.status===401||response.status===403?'FRED API key rejected':'FRED data unavailable',
      response.status===429?429:response.status===401||response.status===403?503:502);
    }
    const data=normalizeFredResearch(type,await limitedJson(response),{
     id:options.id,asOf:options.asOf,fetchedAt:now().toISOString()});
    cache.set(cacheKey,{value:data,expiry:Date.now()+180000});
    if(cache.size>60)cache.delete(cache.keys().next().value);
    return data;
   }catch(e){
    if(e?.name==='AbortError')throw err('FRED request timed out',504);
    if(e?.status)throw e;
    throw err('FRED research provider unavailable',502);
   }finally{clearTimeout(timer);}
  })();
  pending.set(cacheKey,load);
  try{return structuredClone(await load);}finally{pending.delete(cacheKey);}
 }
 return {query,catalog(){return {schemaVersion:1,source:'FRED_ALFRED_OFFICIAL_API',configured:typeof env.FRED_API_KEY==='string'&&/^[a-z0-9]{32}$/.test(env.FRED_API_KEY),
  endpoints:['search','series','vintages','release','releaseDates','observations'],
  descriptions:{
   search:'Find economic series by name; discovery only.',
   series:'Series frequency/units metadata.',
   vintages:'Dates values were added or revised.',
   release:'Source economic release for a series.',
   releaseDates:'Publisher release calendar; not FRED same-day availability proof.',
   observations:'Calendar-day historically as-of values using realtime_start=realtime_end.'
  },originalIntradayReleaseVerified:false};}};
}
export function createFredExplorerApi({service}={}){
 if(!service)throw new TypeError('FRED explorer service is required');
 const reply=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/fred-explorer/'))return false;
  try{
   if(req.method!=='GET')throw err('FRED research endpoints are read only',405);
   const type=url.pathname.slice('/api/fred-explorer/'.length),qs=url.searchParams;
   if(type==='catalog'&&qs.size===0){reply(res,200,service.catalog());return true;}
   const allowed={search:['q'],series:['id'],vintages:['id'],release:['id'],
    releaseDates:['releaseId'],observations:['id','asOf','months']};
   if(!allowed[type]||qs.size<1||[...qs.keys()].some(k=>!allowed[type].includes(k)||qs.getAll(k).length!==1)||
    !qs.has(type==='search'?'q':type==='releaseDates'?'releaseId':'id')||
    type==='observations'&&!qs.has('asOf'))throw err('Select approved FRED research parameters');
   const options={};
   for(const key of allowed[type])if(qs.has(key))options[key]=qs.get(key);
   reply(res,200,await service.query(type,options));
  }catch(e){reply(res,[400,405,429,502,503,504].includes(e?.status)?e.status:502,
   {error:e?.status?e.message:'FRED research unavailable'});}
  return true;
 };
}
