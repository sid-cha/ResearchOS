/** Bounded official NOAA NCEI HazEL historical tsunami catalogue adapter.
 * These are retrospective, revised historical records, NOT observed-time alerts.
 * A date without an hour is never promoted to an exact event timestamp.
 */
const BASE='https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events';
const MAX_BYTES=2*1024*1024;
const MAX_RESULTS=200;
const err=(message,status=502)=>Object.assign(new Error(message),{status});
const isoDay=(year,month,day)=>{
 if(![year,month,day].every(Number.isInteger)||year<1900||year>2100||month<1||month>12||day<1||day>31)return null;
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):null;
};
const num=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
function record(raw){
 if(!raw||typeof raw!=='object'||!Number.isSafeInteger(raw.id)||raw.id<1)return null;
 if(typeof raw.eventValidity==='number'&&raw.eventValidity<=0)return null;
 const day=isoDay(raw.year,raw.month,raw.day);if(!day)return null;
 const exact=Number.isInteger(raw.hour)&&Number.isInteger(raw.minute)&&raw.hour>=0&&raw.hour<24&&raw.minute>=0&&raw.minute<60;
 const second=num(raw.second,0,59.9999);
 const eventTime=exact?day+'T'+String(raw.hour).padStart(2,'0')+':'+String(raw.minute).padStart(2,'0')+':'+String(Math.floor(second??0)).padStart(2,'0')+'Z':null;
 const place=[raw.locationName,raw.country].filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,90)).join(', ');
 return {id:'noaa:tsunami:'+raw.id,type:'TSUNAMI',category:'NATURAL',
  headline:'Historical tsunami'+(place?' · '+place:'')+' · '+day,
  source:'NOAA NCEI HazEL',sourceUrl:'https://www.ngdc.noaa.gov/hazel/view/hazards/tsunami/event-search',
  occurredAt:eventTime,publishedAt:null,comparisonTime:eventTime||day,
  timeBasis:eventTime?'occurred_at':'calendar_day_only',
  timePrecision:eventTime?'minute':'day',sourceEventId:raw.id,
  date:day,location:place||null,causeCode:num(raw.causeCode,0,99),
  validityCode:num(raw.eventValidity,1,9),eqMagnitude:num(raw.eqMagnitude,0,10),
  evidenceLevel:'retrospective_catalog',symbols:[],
  limitations:'Historical catalog data can be revised and is not an alert captured at the time; no confirmed company exposure or loss is inferred.'};
}
async function readBoundedJson(response){
 const stated=response.headers?.get?.('content-length');
 if(stated&&/^\d+$/.test(stated)&&Number(stated)>MAX_BYTES){await response.body?.cancel?.().catch(()=>{});throw err('NOAA response exceeded the bounded 2 MiB cap.',413);}
 const reader=response.body?.getReader?.();if(!reader)throw err('NOAA returned an empty response');
 const chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>MAX_BYTES)throw err('NOAA response exceeded the bounded 2 MiB cap.',413);
   chunks.push(Buffer.from(value));}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}catch{throw err('NOAA returned an invalid JSON response');}
}
export function normalizeTsunamiRecords(payload,{now=Date.now()}={}){
 if(!payload||!Array.isArray(payload.items)||payload.items.length>MAX_RESULTS)throw err('NOAA returned an unsupported or oversized tsunami schema');
 const cutoff=Number(now);if(!Number.isFinite(cutoff))throw err('Research clock is unavailable',500);
 const events=payload.items.map(record).filter(Boolean).filter(x=>Date.parse(x.comparisonTime)<=cutoff);
 const unique=[...new Map(events.map(x=>[x.id,x])).values()].sort((a,b)=>b.comparisonTime.localeCompare(a.comparisonTime)||a.id.localeCompare(b.id));
 return {source:'NOAA_NCEI_HAZEL',events:unique,
  coverage:{dataset:'NOAA Global Historical Tsunami Database (NCEI/WDS)',mode:'retrospective_revisioned_catalog',
   receivedCount:payload.items.length,usableCount:unique.length,queryCapReached:payload.items.length>=MAX_RESULTS,
   incompleteHistory:true},
  limitations:['NOAA NCEI historical tsunami catalogue is retrospective and may be corrected; provider original publication time is unavailable.',
   'Only the first page of a bounded recent-year query is used; this is NOT a complete historical tsunami series.',
   'A year/month/day without hour/minute is day precision only: no intraday market-outcome attribution or exact event timestamp is inferred.',
   'An earthquake or tsunami warning does not itself prove tsunami coastal damage or security exposure.']};
}
export function createTsunamiResearch({fetchImpl=fetch,now=Date.now,timeoutMs=12000,cacheMs=600000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000||!Number.isInteger(cacheMs)||cacheMs<0||cacheMs>3600000)throw new TypeError('Invalid bounded tsunami adapter configuration');
 let memo=null,inFlight=null;
 async function list(){
  const current=Number(now());if(memo&&memo.until>current)return structuredClone(memo.data);
  if(inFlight)return structuredClone(await inFlight);
  inFlight=(async()=>{
   const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
   try{
    const maxYear=new Date(current).getUTCFullYear();
    const uri=new URL(BASE);
    uri.search=new URLSearchParams({minYear:String(maxYear-25),maxYear:String(maxYear),itemsPerPage:String(MAX_RESULTS),page:'1'}).toString();
    const response=await fetchImpl(uri.href,{headers:{Accept:'application/json'},redirect:'error',signal:ctrl.signal});
    if(!response.ok){await response.body?.cancel?.().catch(()=>{});throw err(response.status===429?'NOAA rate limited historical tsunami research.':'NOAA historical tsunami source unavailable.',response.status===429?429:502);}
    if(response.url&&response.url!==uri.href)throw err('Unexpected NOAA redirect or response URL.');
    const payload=await readBoundedJson(response);
    const data=normalizeTsunamiRecords(payload,{now:current});
    memo={until:current+cacheMs,data};
    return data;
   }catch(error){
    if(ctrl.signal.aborted||error?.name==='AbortError')throw err('NOAA tsunami request timed out.',504);
    if(error?.status)throw error;
    throw err('NOAA tsunami research could not be retrieved.');
   }finally{clearTimeout(timeout);}
  })();
  try{return structuredClone(await inFlight);}finally{inFlight=null;}
 }
 return {list};
}
