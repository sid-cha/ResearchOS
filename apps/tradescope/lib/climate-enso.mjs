/**
 * NOAA CPC historical ENSO issue-date evidence (research only).
 * Fetches fixed-host monthly issued discussions; never treats later revised ENSO
 * indices as original forecasts or links outcomes to issuers without evidence.
 */
import {isoDay} from './macro-vintage.mjs';
const BASE='https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/';
const ARCHIVE='https://www.cpc.ncep.noaa.gov/products/expert_assessment/ENSO_DD_archive.php';
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const err=(msg,status=400)=>Object.assign(new Error(msg),{status});
const clone=x=>structuredClone(x);
const validMonth=(y,m)=>Number.isInteger(y)&&Number.isInteger(m)&&y>=2001&&y<=2100&&m>=1&&m<=12;
const monthAgo=(date,n)=>{const [y,m]=date.slice(0,7).split('-').map(Number);const out=new Date(Date.UTC(y,m-1-n,1));return {year:out.getUTCFullYear(),month:out.getUTCMonth()+1};};
export function cpcMonthlyUrl(year,month){
 if(!validMonth(year,month))throw err('Unsupported NOAA CPC publication month');
 return BASE+'enso_disc_'+MONTHS[month-1]+year+'/ensodisc.html';
}
function htmlText(raw){
 // No HTML, scripting, or links are returned to the browser: strictly plain text.
 return raw.replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|#160);/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&#(\d{1,5});/g,(_,n)=>String.fromCodePoint(Math.min(65533,Number(n))))
  .replace(/\s+/g,' ').trim();
}
function dateFromEnglish(day,month,year){
 const index=NAMES.findIndex(m=>m.toLowerCase()===month.toLowerCase());
 if(index<0)return null;
 const date=String(year)+'-'+String(index+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 return isoDay(date)?date:null;
}
/** Any original issue date is an assertion contained in today's archive page.
 * Original HTML revision/first-seen time is NOT independently verified.
 */
export function parseCpcIssuedDiscussion(html,{year,month,sourceUrl}={}){
 if(!validMonth(year,month)||sourceUrl!==cpcMonthlyUrl(year,month)||typeof html!=='string'||html.length>260000)
  throw err('Unsupported archived CPC discussion input',502);
 const text=htmlText(html);
 const headerIndex=text.search(/DIAGNOSTIC DISCUSSION/i),synopsisIndex=text.search(/\bSynopsis\s*:/i);
 if(headerIndex<0||synopsisIndex<=headerIndex||synopsisIndex-headerIndex>1700)
  throw err('CPC discussion missing its expected issue metadata',502);
 const header=text.slice(headerIndex,synopsisIndex);
 const dates=[...header.matchAll(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi)];
 const expected=dates.map(match=>dateFromEnglish(match[1],match[2],match[3])).filter(x=>x?.startsWith(year+'-'+String(month).padStart(2,'0')+'-'));
 if(expected.length!==1)throw err('CPC discussion issue date is ambiguous or does not match the archived month',502);
 const synopsisStart=synopsisIndex+text.slice(synopsisIndex).match(/^Synopsis\s*:/i)[0].length;
 const body=text.slice(synopsisStart).trim();
 if(body.length<18)throw err('CPC discussion synopsis is missing',502);
 const excerpt=body.slice(0,520).trim();
 const synopsis=excerpt.length===520?excerpt.replace(/\s+\S*$/,'')+'…':excerpt;
 return {source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',sourceUrl,issueDate:expected[0],
  archiveMonth:year+'-'+String(month).padStart(2,'0'),synopsis,
  sourcePublishedAt:expected[0]+' (calendar date asserted by source)',
  firstSeenAt:null,publicationClockVerified:false,
  originalArchiveRevisionVerified:false,forecastProbabilityCalibratedByResearchOS:false,
  numericEnsoIndex:null,riskProbability:null};
}
async function boundedHtml(response){
 const cap=260000;
 if(Number(response.headers?.get?.('content-length'))>cap){await response.body?.cancel?.();throw err('NOAA CPC response exceeds size limit',502);}
 if(!response.body?.getReader){
  const text=await response.text();if(Buffer.byteLength(text)>cap)throw err('NOAA CPC response exceeds size limit',502);return text;
 }
 const reader=response.body.getReader(),buf=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>cap){await reader.cancel();throw err('NOAA CPC response exceeds size limit',502);}buf.push(Buffer.from(value));}}
 finally{reader.releaseLock();}
 return Buffer.concat(buf).toString('utf8');
}
export function createCpcEnsoArchive({fetchImpl=fetch,now=()=>new Date(),timeoutMs=12000}={}){
 const cached=new Map(),pending=new Map();
 async function fetchMonth(year,month){
  const url=cpcMonthlyUrl(year,month),ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'text/html'},signal:ctrl.signal});
   if(response.status===404){await response.body?.cancel?.();return null;}
   if(!response.ok){await response.body?.cancel?.();throw err(response.status===429?'NOAA CPC rate limited the research query':'NOAA CPC historical source unavailable',response.status===429?429:502);}
   const mime=response.headers?.get?.('content-type')||'';
   if(mime&&!/(?:text\/html|application\/xhtml\+xml)/i.test(mime)){await response.body?.cancel?.();throw err('NOAA CPC returned unsupported content type',502);}
   return parseCpcIssuedDiscussion(await boundedHtml(response),{year,month,sourceUrl:url});
  }catch(e){
   if(e.name==='AbortError')throw err('NOAA CPC source timed out',504);
   if(e.status)throw e;
   throw err('NOAA CPC historical source request failed',502);
  }finally{clearTimeout(timer);}
 }
 async function month(year,month){
  const key=year+'-'+month,hit=cached.get(key);
  if(hit?.until>Date.now())return clone(hit.value);
  if(pending.has(key))return clone(await pending.get(key));
  const task=fetchMonth(year,month).then(value=>{cached.set(key,{until:Date.now()+3600000,value});if(cached.size>30)cached.delete(cached.keys().next().value);return value;});
  pending.set(key,task);try{return clone(await task);}finally{pending.delete(key);}
 }
 async function asOf(date){
  const today=now().toISOString().slice(0,10);
  if(!isoDay(date)||date<'2001-01-01'||date>today)throw err('asOf must be a past date in the NOAA CPC discussion archive');
  const attempted=[];
  for(let n=0;n<2;n++){
   const {year,month:mo}=monthAgo(date,n);if(year<2001)break;
   const item=await month(year,mo);attempted.push(year+'-'+String(mo).padStart(2,'0'));
   if(item&&item.issueDate<=date){
    return {asOf:date,mode:'END_OF_CALENDAR_DAY',evidenceStatus:'DATED_ISSUE_VISIBLE_ARCHIVE_REVISION_NOT_VERIFIED',
     discussion:item,attemptedMonths:attempted,archiveUrl:ARCHIVE,fetchedAt:now().toISOString(),
     calibratedForecast:false,marketRiskScore:null,issuerImpactVerified:false,
     limitations:['NOAA CPC archive pages display claimed issue dates, but page edit history and original intraday publication timestamps are not independently verified.',
      'Only the newest discussion already issued by the selected date is eligible; future issues and subsequently revised ocean indices are excluded.',
      'ENSO outlook statements do not establish geographic crop impact, potash supply changes, company exposure or equity returns.']};
   }
  }
  return {asOf:date,mode:'END_OF_CALENDAR_DAY',evidenceStatus:'NO_ELIGIBLE_ISSUED_DISCUSSION_IN_BOUNDED_WINDOW',
   discussion:null,attemptedMonths:attempted,archiveUrl:ARCHIVE,fetchedAt:now().toISOString(),
   calibratedForecast:false,marketRiskScore:null,issuerImpactVerified:false,
   limitations:['No issue-dated eligible NOAA CPC discussion was retrieved for this date; no outlook or probability has been inferred.']};
 }
 return {catalog(){return {source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',archiveUrl:ARCHIVE,
   earliestSupportedDate:'2001-01-01',asOfSemantics:'END_OF_CALENDAR_DAY',historicalHtmlRevisionVerified:false,
   originalPublicationClockVerified:false,calibratedForecast:false};},asOf};
}
export function createCpcEnsoApi({service=createCpcEnsoArchive()}={}){
 const reply=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/climate/'))return false;
  if(req.method!=='GET'){reply(res,405,{error:'Historical climate research is read-only'});return true;}
  if(url.pathname==='/api/climate/catalog'){reply(res,200,service.catalog());return true;}
  if(url.pathname==='/api/climate/enso'){
   try{
    if(url.searchParams.getAll('asOf').length!==1||[...url.searchParams.keys()].some(x=>x!=='asOf'))
     throw err('Supply exactly one historical asOf date');
    reply(res,200,await service.asOf(url.searchParams.get('asOf')));
   }catch(error){const status=[400,429,502,504].includes(error?.status)?error.status:502;reply(res,status,{error:error?.status?error.message:'Historical NOAA CPC lookup failed'});}
   return true;
  }
  reply(res,404,{error:'Unknown climate research endpoint'});return true;
 };
}
