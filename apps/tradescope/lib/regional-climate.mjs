/**
 * NASA POWER historical monthly point meteorology — retrospective evidence only.
 * NEVER use currently revised MERRA-2 meteorology as an as-of publication vintage.
 * No verified issuer exposure, rainfall anomaly, insured loss or financial forecast.
 */
import {createHash} from 'node:crypto';
import {isoDay} from './macro-vintage.mjs';

const API='https://power.larc.nasa.gov/api/temporal/monthly/point';
const DOCUMENTATION='https://power.larc.nasa.gov/docs/services/api/temporal/monthly/';
const SOURCE='NASA_POWER_MONTHLY_CURRENT_REVISION';
const MIN_YEAR=1981;
const REGIONS=Object.freeze([
 Object.freeze({id:'argentina-pampas',label:'Pampas, Argentina — representative point',country:'Argentina',lat:-33.89,lon:-60.57,graphId:'enso-fertilizer',pointOnly:true}),
 Object.freeze({id:'brazil-south',label:'Southern Brazil — representative point',country:'Brazil',lat:-28.26,lon:-52.41,graphId:'enso-fertilizer',pointOnly:true}),
 Object.freeze({id:'california-foothills',label:'California foothills — representative point',country:'United States',lat:38.58,lon:-120.75,graphId:'wildfire-insurance',pointOnly:true}),
 Object.freeze({id:'colorado-high-country',label:'Colorado high country — representative point',country:'United States',lat:39.25,lon:-106.30,graphId:'snow-hydropower',pointOnly:true})
]);
const REGIONS_BY_ID=new Map(REGIONS.map(x=>[x.id,x]));
const clone=x=>structuredClone(x);
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const months=Object.freeze(Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')));
const currentYear=now=>now().getUTCFullYear();
const validateYear=(year,now)=>{
 if(!Number.isInteger(year)||year<MIN_YEAR||year>=currentYear(now))
  throw err('Select a complete historical year from 1981 through the preceding calendar year');
 return year;
};
const validAsOf=(asOf,year,now)=>{
 if(asOf===null||asOf===undefined)return null;
 if(!isoDay(asOf)||!asOf.startsWith(year+'-')||asOf>now().toISOString().slice(0,10))
  throw err('asOf must be a valid date in the requested historical year');
 return asOf;
};
const normalizeUnit=(x)=>typeof x==='string'?x.trim().replace(/\s+/g,'').toLowerCase():null;
const PRECIP_UNITS=new Set(['mm/day','mm/d']);
const TEMP_UNITS=new Set(['c','°c','degc','degreec']);
function parseValue(raw,{name,year,month}){
 if(raw===null||raw===undefined||raw===-999||raw===-999.0||raw==='-999')return null;
 if(typeof raw!=='number'||!Number.isFinite(raw))throw err('NASA POWER returned a malformed '+name+' monthly observation',502);
 if((name==='PRECTOTCORR'&&(raw<0||raw>500))||(name==='T2M'&&(raw< -100||raw>100)))
  throw err('NASA POWER returned out-of-range monthly meteorology',502);
 return Number(raw.toFixed(4));
}
export function createPowerMonthlyUrl(region,year){
 if(!region||!REGIONS_BY_ID.has(region.id)||REGIONS_BY_ID.get(region.id)!==region)
  throw err('Unsupported geographic research point');
 if(!Number.isInteger(year)||year<MIN_YEAR||year>2100)throw err('Invalid historical year');
 const url=new URL(API);
 for(const [k,v] of Object.entries({parameters:'PRECTOTCORR,T2M',community:'AG',longitude:region.lon,
  latitude:region.lat,start:year,end:year,format:'JSON'}))url.searchParams.set(k,String(v));
 return url.toString();
}
/** Public response omits raw provider JSON; integrity digest covers the normalized
 *  received snapshot, NOT original historical publication authenticity.
 */
export function normalizePowerMonthly(payload,{region,year,fetchedAt,asOf=null}={}){
 if(!REGIONS_BY_ID.has(region?.id)||!Number.isInteger(year)||!isoDay(fetchedAt?.slice(0,10))||
    !payload||typeof payload!=='object'||Array.isArray(payload)||
    !payload.properties||typeof payload.properties!=='object')throw err('Invalid NASA POWER observation response',502);
 const coords=payload.geometry?.coordinates;
 if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1])||
   Math.abs(coords[0]-region.lon)>1||Math.abs(coords[1]-region.lat)>1)
  throw err('NASA POWER location does not match selected geographic point',502);
 const source=payload.properties.parameter;
 const prcp=source?.PRECTOTCORR,temperature=source?.T2M;
 if(!prcp||!temperature||typeof prcp!=='object'||typeof temperature!=='object')
  throw err('NASA POWER meteorology parameters are missing',502);
 const precipUnits=normalizeUnit(payload.parameters?.PRECTOTCORR?.units);
 const temperatureUnits=normalizeUnit(payload.parameters?.T2M?.units);
 if(!PRECIP_UNITS.has(precipUnits)||!TEMP_UNITS.has(temperatureUnits))
  throw err('NASA POWER meteorology units are unverified',502);
 const rows=months.map(month=>{
  const key=year+month;
  return {month:key,precipitationMmPerDay:parseValue(prcp[key],{name:'PRECTOTCORR',year,month}),
   temperatureC:parseValue(temperature[key],{name:'T2M',year,month})};
 });
 const eligible=asOf?rows.filter(row=>row.month<asOf.slice(0,7).replace('-','')):rows;
 const precipitationCount=eligible.filter(x=>x.precipitationMmPerDay!==null).length;
 const temperatureCount=eligible.filter(x=>x.temperatureC!==null).length;
 const canonical=JSON.stringify({source:SOURCE,region:region.id,year,rows,unit:['mm/day','C']});
 const digest=createHash('sha256').update(canonical,'utf8').digest('hex');
 const asOfLabel=asOf?'calendar filter only — not historical publication-time reconstruction':'full-year retrospective review';
 return {schemaVersion:1,source:SOURCE,sourceUrl:createPowerMonthlyUrl(region,year),sourceDocumentation:DOCUMENTATION,
  region:clone(region),year,asOf,asOfSemantics:asOfLabel,geoScope:'ONE MODEL GRID POINT; NOT A REGIONAL AVERAGE',
  metrics:{precipitation:{name:'PRECTOTCORR',unit:'mm/day',meaning:'Retrospective monthly average daily precipitation rate; NOT monthly total'},
   temperature:{name:'T2M',unit:'°C',meaning:'Retrospective monthly mean near-surface air temperature'}},
  months:eligible,coverage:{monthsReturned:eligible.length,precipitationMonths:precipitationCount,
   temperatureMonths:temperatureCount,missingPrecipitationMonths:eligible.length-precipitationCount,
   missingTemperatureMonths:eligible.length-temperatureCount},
  dataStatus:precipitationCount||temperatureCount?'RETROSPECTIVE_REVISED_OBSERVATIONS':'INSUFFICIENT_SOURCE_OBSERVATIONS',
  provenance:{fetchedAt,receipt:{algorithm:'sha256',digest,hashMeaning:'normalized complete-year received values; not original source issue-time proof'},
   firstPublishedAt:null,sourceRevisionId:null,sourcePublicationClockVerified:false,
   originalAsOfVintageAvailable:false,provider:'NASA POWER / retrospective MERRA-2 meteorology'},
  derivedAnomaly:null,weatherForecast:null,commodityEffect:null,companyExposure:null,estimatedReturn:null,
  calibratedForecast:false,validForHistoricalExAnteSignal:false,
  limitations:[
   'Monthly NASA POWER historical values are current-revision model/assimilation products, not first-issued archival forecasts or station measurements.',
   'The selected location is a representative model point, NOT a whole crop-growing region, watershed, insured footprint, or administrative polygon.',
   'The asOf filter discards months that were not fully completed by the selected date, but it does NOT reconstruct original data publication/revision times.',
   'No climatological anomaly, causality, crop yield impact, insured loss, company exposure or market-risk probability is inferred.'
  ]};
}
async function boundedJson(response){
 const LIMIT=350000;
 if(Number(response.headers?.get?.('content-length'))>LIMIT){await response.body?.cancel?.();throw err('Climate provider response exceeded the byte bound',502);}
 if(response.body?.getReader){
  const reader=response.body.getReader(),buffers=[];let total=0;
  try{for(;;){const x=await reader.read();if(x.done)break;total+=x.value.byteLength;
    if(total>LIMIT){await reader.cancel();throw err('Climate provider response exceeded the byte bound',502);}buffers.push(Buffer.from(x.value));}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(buffers).toString('utf8'))}catch{throw err('NASA POWER returned malformed JSON',502);}
 }
 const s=await response.text();if(Buffer.byteLength(s)>LIMIT)throw err('Climate provider response exceeded the byte bound',502);
 try{return JSON.parse(s)}catch{throw err('NASA POWER returned malformed JSON',502);}
}
export function createRegionalClimate({fetchImpl=fetch,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 async function fetchYear(region,year){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(createPowerMonthlyUrl(region,year),{method:'GET',redirect:'error',
    headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok){
    await response.body?.cancel?.();
    throw err(response.status===429?'NASA POWER rate limit reached':'NASA POWER historical data unavailable',
     response.status===429?429:502);
   }
   const type=response.headers?.get?.('content-type')||'';
   if(type&&!type.toLowerCase().includes('json')){await response.body?.cancel?.();throw err('NASA POWER returned unsupported content type',502);}
   const payload=await boundedJson(response);
   return {payload,fetchedAt:now().toISOString()};
  }catch(e){
   if(e?.name==='AbortError')throw err('NASA POWER historical data request timed out',504);
   if(e?.status)throw e;
   throw err('NASA POWER historical data request failed',502);
  }finally{clearTimeout(timer);}
 }
 async function load(region,year){
  const key=region.id+':'+year,hit=cache.get(key);
  if(hit?.expiry>Date.now())return clone(hit.entry);
  if(pending.has(key))return clone(await pending.get(key));
  const job=fetchYear(region,year).then(entry=>{
   cache.set(key,{expiry:Date.now()+600000,entry});
   if(cache.size>24)cache.delete(cache.keys().next().value);
   return entry;
  });
  pending.set(key,job);
  try{return clone(await job);}finally{pending.delete(key);}
 }
 return {
  catalog(){return {schemaVersion:1,provider:'NASA POWER',source:SOURCE,documentation:DOCUMENTATION,
   regions:clone(REGIONS),minYear:MIN_YEAR,lastCompleteYear:currentYear(now)-1,
   models:'Retrospective model/assimilation meteorology, not original historical publications',
   metrics:['PRECTOTCORR','T2M'],pointOnly:true,publicFreeAccess:true,
   issueTimeVerified:false,asOfVintage:false,climatologicalAnomaliesComputed:false,issuerExposureVerified:false};},
  async monthly({regionId,year,asOf=null}={}){
   const region=REGIONS_BY_ID.get(regionId);if(!region)throw err('Choose a registered geographic research point');
   validateYear(year,now);validAsOf(asOf,year,now);
   const entry=await load(region,year);
   return normalizePowerMonthly(entry.payload,{region,year,asOf,fetchedAt:entry.fetchedAt});
  }
 };
}
export function createRegionalClimateApi({service=createRegionalClimate()}={}){
 const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/geoclimate/'))return false;
  if(req.method!=='GET'){reply(res,405,{error:'Historical geographic climate API is read-only'});return true;}
  if(url.pathname==='/api/geoclimate/catalog'){reply(res,200,service.catalog());return true;}
  if(url.pathname==='/api/geoclimate/monthly'){
   try{
    const keys=[...url.searchParams.keys()];
    if(!['region','year'].every(k=>url.searchParams.getAll(k).length===1)||
      keys.some(k=>!['region','year','asOf'].includes(k)||url.searchParams.getAll(k).length!==1))
      throw err('Specify exactly one region and year; optionally one calendar asOf');
    const y=url.searchParams.get('year');
    if(!/^\d{4}$/.test(y))throw err('year must be four digits');
    reply(res,200,await service.monthly({regionId:url.searchParams.get('region'),year:Number(y),asOf:url.searchParams.get('asOf')}));
   }catch(e){
    const status=[400,429,502,503,504].includes(e?.status)?e.status:502;
    reply(res,status,{error:e?.status?e.message:'Historical geographic climate source unavailable'});
   }
   return true;
  }
  reply(res,404,{error:'Unknown geographic climate research endpoint'});return true;
 };
}
