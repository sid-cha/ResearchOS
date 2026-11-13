/**
 * v0.19 commodity fundamentals expansion: GDELT media-candidate expansion,
 * EIA natural-gas observations, UN Comtrade fertilizer trade flows, USDA FAS
 * PSD crop supply/demand records and a USGS mineral statistics capture ledger.
 * Every source is source-dated with explicit limitations; none establishes a
 * verified supply disruption, verified issuer impact or any price forecast.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=x=>structuredClone(x);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nowIso=()=>new Date().toISOString();
const safe=(x,n=240)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const month=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const year=x=>typeof x==='string'&&/^(19|20)\d{2}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inRange=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;

export const COMMODITIES=Object.freeze({potash:'potash',urea:'urea fertilizer',phosphate:'phosphate fertilizer'});
export function requireCommodity(value){
 if(!Object.hasOwn(COMMODITIES,value))throw err('Choose a supported pilot commodity');
 return value;
}

/* ---------- GDELT commodity media expansion (step 1) ---------- */
export const GDELT_SOURCE='GDELT_DOC_COMMODITY_EXPANDED';
export const GDELT_QUERIES=Object.freeze({potash:'potash',urea:'urea fertilizer',phosphate:'phosphate fertilizer'});
const GDELT_BASE='https://api.gdeltproject.org/api/v2/doc/doc';
export const GDELT_CATEGORIES=Object.freeze([
 ['SANCTIONS_EXPORT_CONTROLS',/\b(sanction[s]?\b|export (?:ban|control|restriction)|embargo|blacklist)/i],
 ['TRADE_POLICY',/\b(tariff[s]?\b|anti-?dumping|import (?:duty|quota|curb)|trade restriction|duty)/i],
 ['PRODUCTION_SUPPLY',/\b(outage|halt(?:ed)?|shutdown|strike|capacity|shortage|supply disruption|production cut|mine)/i],
 ['TRANSPORT_LOGISTICS',/\b(port\b|rail|shipping|vessel|freight|logistics|strait|canal|container)/i],
 ['PRICES_MARKETS',/\b(price[s]?\b|contract|spot market|rally|premium|benchmark)/i],
 ['WEATHER_AGRICULTURE',/\b(drought|harvest|crop|monsoon|planting|rainfall|frost)/i]
]);
export function classifyGdeltArticle(title){
 const text=safe(title,400);
 for(const [category,rule] of GDELT_CATEGORIES)if(rule.test(text))return category;
 return 'UNCLASSIFIED_MEDIA_REPORT';
}
const parseSeen=x=>{
 if(typeof x!=='string'||!/^\d{14}$/.test(x))return null;
 const t=Date.parse(x.slice(0,4)+'-'+x.slice(4,6)+'-'+x.slice(6,8)+'T'+x.slice(8,10)+':'+x.slice(10,12)+':'+x.slice(12,14)+'Z');
 return Number.isFinite(t)?new Date(t).toISOString():null;
};
const dayBetween=(a,b)=>Math.abs((Date.parse(a.slice(0,10))-Date.parse(b.slice(0,10)))/86400000);
export function normalizeGdeltCommodityFeed(payload,{commodity,fetchedAt=nowIso(),today=fetchedAt.slice(0,10)}={}){
 requireCommodity(commodity);
 if(!day(today))throw err('Malformed request metadata',502);
 if(!payload||!Array.isArray(payload.articles))throw err('Malformed GDELT response',502);
 const seen=new Set(),items=[];
 for(const article of payload.articles.slice(0,30)){
  const url=typeof article?.url==='string'?article.url:'',domain=safe(article?.domain,120);
  const title=safe(article?.title,280),seenAt=parseSeen(article?.seendate);
  if(!title||!seenAt||seenAt.slice(0,10)>today||!/^https:\/\//.test(url))continue;
  const key=domain+'|'+title.slice(0,80).toLowerCase();
  if(seen.has(key))continue;seen.add(key);
  try{items.push({id:'gdelt:'+digest({url,title}).slice(0,20),commodity,source:GDELT_SOURCE,
   category:classifyGdeltArticle(title),title,domain,providerFirstSeenAt:seenAt,
   fetchedAt,sourceUrl:new URL(url).href,
   classification:'MEDIA_REPORT_CANDIDATE_NOT_VERIFIED_DISRUPTION',
   confirmedDisruption:false,observedIssuerImpact:false});}
  catch{continue;}
  if(items.length>=12)break;
 }
 return {commodity,source:GDELT_SOURCE,results:items,fetchedAt,
  coverage:{returned:payload.articles.length,accepted:items.length},
  limitations:['Media reports are event candidates, not confirmation of a fertilizer supply disruption.',
   'GDELT first-seen time is crawl discovery, not original publication time.']};
}
export function corroborateDocuments(mediaItems,officialDocs,{maxWindowDays=7}={}){
 if(!Array.isArray(mediaItems)||!Array.isArray(officialDocs))throw err('Corroboration inputs are malformed');
 const pairs=[];
 for(const media of mediaItems){
  for(const revision of officialDocs){
   const d=revision?.document||revision;
   if(d?.commodity!==media?.commodity||!day(d?.publishedDate))continue;
   const windowDays=Math.round(dayBetween(media.providerFirstSeenAt,d.publishedDate));
   if(windowDays<=maxWindowDays)pairs.push({mediaId:media.id,documentId:d.id,commodity:media.commodity,
    windowDays,status:'CALENDAR_PROXIMITY_CANDIDATE',corroborationVerified:false,
    note:'Same-commodity media report within '+maxWindowDays+' days of the official document; chronology overlap is not causal or factual confirmation.'});
  }
 }
 return pairs;
}
export function gdeltUrl(commodity){
 requireCommodity(commodity);
 const url=new URL(GDELT_BASE);
 url.searchParams.set('query',GDELT_QUERIES[commodity]);
 url.searchParams.set('mode','artlist');url.searchParams.set('maxrecords','30');
 url.searchParams.set('format','json');url.searchParams.set('sort','datedesc');
 return url.href;
}

/* ---------- EIA natural gas (step 2) ---------- */
const EIA_SOURCE='EIA_SERIES_V1';
export const EIA_SERIES=Object.freeze([
 Object.freeze({id:'henry_hub_spot',seriesId:'NG.RNGWHHD.M',label:'Henry Hub natural gas spot price',
  unit:'USD per million Btu',frequency:'monthly',sourceUrl:'https://www.eia.gov/dnav/ng/hist/rngwhhdM.htm',
  role:'Energy cost input to nitrogen fertilizer production; not a fertilizer price series.'}),
 Object.freeze({id:'us_dry_gas_production',seriesId:'NG.N9070US2.M',label:'US dry natural gas production',
  unit:'billion cubic feet',frequency:'monthly',sourceUrl:'https://www.eia.gov/dnav/ng/hist/n9070us2m.htm',
  role:'US energy supply context for ammonia and urea economics; not a fertilizer supply measure.'})
]);
const EIA_API='https://api.eia.gov/series/';
export function eiaKey(env){const key=env?.EIA_API_KEY;
 if(typeof key!=='string'||!/^[a-z0-9]{16,80}$/.test(key))throw err('EIA_API_KEY is not configured on the server',503);
 return key;}
export function normalizeEiaSeries(payload,{indicatorId,fetchedAt=nowIso(),today=fetchedAt.slice(0,10)}={}){
 const def=EIA_SERIES.find(x=>x.id===indicatorId);
 if(!def||!day(today))throw err('Unsupported EIA series or malformed request',502);
 const series=Array.isArray(payload?.series)?payload.series.find(s=>s?.series_id===def.seriesId):null;
 if(!series||!Array.isArray(series.data))throw err('Malformed EIA response for '+def.seriesId,502);
 const observations=[];
 for(const row of series.data){
  const period=typeof row?.period==='string'?row.period:'';
  if(!(month(period)||year(period)))continue;
  if(period>(month(period)?today.slice(0,7):today.slice(0,4)))continue;
  const value=row?.value==='.'||row?.value===null||row?.value===undefined?null:
   (typeof row.value==='number'?row.value:(typeof row.value==='string'&&row.value.trim()!==''?Number(row.value):NaN));
  if(value===null||!finite(value)){observations.push({period,value:null,status:'MISSING_OR_WITHHELD_SOURCE_VALUE'});continue;}
  observations.push({period,value,unit:def.unit,status:'AVAILABLE',observedPeriodType:month(period)?'MONTHLY':'ANNUAL'});
 }
 observations.sort((a,b)=>b.period.localeCompare(a.period));
 return {source:EIA_SOURCE,indicatorId,seriesId:def.seriesId,label:def.label,unit:def.unit,
  frequency:def.frequency,role:def.role,sourceUrl:def.sourceUrl,fetchedAt,
  observations:observations.slice(0,24),coverage:{returned:series.data.length,accepted:observations.length},
  limitations:['Published series periods are release-calendar periods, not original intraday publication clocks.',
   'Energy observations inform fertilizer cost context; they do not establish fertilizer supply disruptions.']};
}

/* ---------- UN Comtrade fertilizer trade flows (step 2) ---------- */
const COMTRADE_SOURCE='UN_COMTRADE_PREVIEW';
export const FERTILIZER_HS=Object.freeze({3102:'nitrogenous fertilizers',3103:'phosphatic fertilizers',3104:'potassic fertilizers',3105:'mixed fertilizers'});
export const COMTRADE_REPORTERS=Object.freeze({842:'United States',124:'Canada',643:'Russia',112:'Belarus',76:'Brazil',156:'China'});
export function comtradeUrl(commodity,flow,reporter,{period=null}={}){
 requireCommodity(commodity);
 const hs={potash:'3104',urea:'3102',phosphate:'3103'}[commodity];
 if(!['M','X'].includes(flow))throw err('Choose import (M) or export (X) flow');
 if(!Object.hasOwn(COMTRADE_REPORTERS,reporter))throw err('Choose a supported reporter economy');
 const query=year(period)?period:String(new Date().getUTCFullYear()-1);
 return 'https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode='+hs+'&flowCode='+flow+
  '&reporterCode='+reporter+'&period='+query;
}
export function normalizeComtrade(payload,{commodity,flow,reporter,fetchedAt=nowIso()}={}){
 requireCommodity(commodity);
 if(!['M','X'].includes(flow)||!Object.hasOwn(COMTRADE_REPORTERS,reporter))throw err('Unsupported trade flow or reporter');
 if(!payload||!Array.isArray(payload.data))throw err('Malformed Comtrade response',502);
 const rows=[];
 for(const row of payload.data.slice(0,60)){
  const period=typeof row?.period==='string'?row.period:String(row?.period??'');
  if(!year(period))continue;
  const value=finite(row?.tradeValue)?row.tradeValue:null,net=finite(row?.netWgt)?row.netWgt:null;
  if(value===null&&net===null)continue;
  rows.push({source:COMTRADE_SOURCE,commodity,flow,flowLabel:flow==='M'?'IMPORTS':'EXPORTS',
   hsCode:String(row?.cmdCode||''),commodityGroup:FERTILIZER_HS[String(row?.cmdCode||'')]||'UNSUPPORTED_HS_CODE',
   reporterCode:reporter,reporter:COMTRADE_REPORTERS[reporter],
   partnerCode:Number.isInteger(row?.partnerCode)?row.partnerCode:null,
   partner:safe(row?.partnerDesc,80)||null,period,tradeValueUsd:value,netWeightKg:net,
   classification:'ANNUAL_TRADE_FLOW_TOTAL',fetchedAt,
   sourceUrl:'https://comtradeplus.un.org/'});
 }
 rows.sort((a,b)=>b.period.localeCompare(a.period));
 return {source:COMTRADE_SOURCE,commodity,flow,reporter:COMTRADE_REPORTERS[reporter],rows:rows.slice(0,24),
  coverage:{returned:payload.data.length,accepted:rows.length},
  limitations:['Annual trade totals are not shipment-level, real-time or live supply alerts.',
   'Trade values do not identify fertilizer grade, contract terms or destination-use.']};
}

/* ---------- USDA FAS PSD crop supply/demand (step 2) ---------- */
const USDA_SOURCE='USDA_FAS_PSD_API';
export const PSD_COMMODITIES=Object.freeze({wheat:'0410000',corn:'0440000',soybeans:'2222000'});
export const PSD_ATTRIBUTES=Object.freeze(['AREA HARVESTED','BEGINNING STOCKS','PRODUCTION','IMPORTS','EXPORTS','ENDING STOCKS']);
export function psdUrl(crop){
 const code=PSD_COMMODITIES[crop];
 if(!code)throw err('Choose a supported PSD crop series (wheat, corn or soybeans)',400);
 return 'https://api.fas.usda.gov/api/psd/commodity/'+code;
}
export function usdaKey(env){const key=env?.USDA_FAS_API_KEY;
 if(typeof key!=='string'||!/^[a-z0-9-]{16,120}$/i.test(key))throw err('USDA_FAS_API_KEY is not configured on the server',503);
 return key;}
export function normalizePsd(payload,{crop,fetchedAt=nowIso(),today=fetchedAt.slice(0,10)}={}){
 const code=PSD_COMMODITIES[crop];
 if(!code)throw err('Choose a supported PSD crop series (wheat, corn or soybeans)',400);
 if(!Array.isArray(payload))throw err('Malformed PSD response',502);
 const records=[];
 for(const row of payload.slice(0,120)){
  const attribute=safe(row?.attribute,60).toUpperCase(),country=safe(row?.country||row?.countryName,90);
  const marketYear=typeof row?.marketYear==='string'?row.marketYear:String(row?.marketYear??'');
  if(!/^(19|20)\d{2}(\/\d{2})?$/.test(marketYear))continue;
  const value=finite(row?.value)?row.value:null;
  if(!attribute||!country||!year(marketYear.slice(0,4))||value===null)continue;
  if(!PSD_ATTRIBUTES.includes(attribute))continue;
  if(marketYear.slice(0,4)>today.slice(0,4))continue;
  records.push({source:USDA_SOURCE,crop,psdCommodityCode:code,country,marketYear,attribute,
   unit:safe(row?.unit||row?.unitDescription,40)||'unspecified',
   value,classification:'CROP_SUPPLY_DEMAND_ESTIMATE',fetchedAt,
   sourceUrl:'https://apps.fas.usda.gov/psdonline/app/index.html#/app/advQuery'});
 }
 records.sort((a,b)=>b.marketYear.localeCompare(a.marketYear)||a.country.localeCompare(b.country));
 return {source:USDA_SOURCE,crop,records:records.slice(0,40),
  coverage:{returned:payload.length,accepted:records.length},
  limitations:['PSD crop estimates are analyst-maintained supply/demand estimates, revised over time.',
   'Crop production is a demand-side proxy for fertilizer use, not a measured fertilizer demand series.',
   'Records were not verified against WASDE report publication timing.']};
}

/* ---------- USGS capture ledger (step 2: annual, transcribed) ---------- */
const USGS_SOURCE='USGS_MINERAL_STATISTICS_CAPTURE';
const USGS_HOSTS=Object.freeze(new Set(['www.usgs.gov','pubs.usgs.gov','usgs.gov']));
export function usgsStatsPage(){return 'https://www.usgs.gov/centers/national-minerals-information-center/potash-statistics-and-information';}
function usgsId(url){return 'usgs:'+createHash('sha256').update(url).digest('hex').slice(0,12);}
export function normalizeUsgsCapture(input,{clock=nowIso,today=clock().toISOString().slice(0,10)}={}){
 const officialUrl=safe(input?.officialUrl,400);
 if(!officialUrl)throw err('Provide the official USGS publication URL');
 let parsed;try{parsed=new URL(officialUrl)}catch{throw err('Official USGS URL is not a valid URL')}
 if(!USGS_HOSTS.has(parsed.hostname)||parsed.protocol!=='https:')throw err('Official URL must be an https usgs.gov publication');
 const title=safe(input?.title,280);if(title.length<6)throw err('Provide the official publication title');
 const releaseDate=input?.releaseDate;
 if(!day(releaseDate)||releaseDate>today)throw err('Release date must be a real past calendar date');
 const statistics=input?.statistics;
 if(!Array.isArray(statistics)||!inRange(statistics.length,1,20))throw err('Capture between one and twenty transcribed statistics');
 const rows=statistics.map(stat=>{
  const commodity=requireCommodity(safe(stat?.commodity,20));
  const attribute=safe(stat?.attribute,80),unit=safe(stat?.unit,40),anchor=safe(stat?.anchor,120);
  const period=safe(stat?.period,12),value=finite(stat?.value)?stat.value:null;
  if(attribute.length<3)throw err('Each statistic needs a named attribute');
  if(!(year(period)||month(period)||day(period)))throw err('Each statistic needs a year, month or date period');
  if(value===null)throw err('Each transcribed statistic needs a numeric value');
  if(!unit)throw err('Each statistic needs its official unit');
  return {commodity,attribute,period,value,unit,anchor:anchor||null,
   provenance:'ANALYST_TRANSCRIBED_FROM_OFFICIAL_PUBLICATION'};
 });
 const url=parsed.href;
 return {id:usgsId(url),source:USGS_SOURCE,title,releaseDate,officialUrl:url,statistics:rows,
  publisher:'USGS',classification:'ANNUAL_TRANSCRIBED_STATISTIC_CAPTURE',
  capturedAt:clock(),confirmedDisruption:false,limitations:[
  'Transcribed statistics are analyst-entered from the cited official publication; transcription errors are possible.',
  'USGS mineral statistics are annual or infrequent; they are not live supply alerts.',
  'Statistics describe production, reserves or trade context; they do not establish a disruption or company impact.']};
}
export function createUsgsLedger({filename,clock=nowIso}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw err('USGS capture ledger requires an absolute path');
 let state={revisions:[]},loaded=false,serial=Promise.resolve();
 const ensure=async()=>{if(loaded)return;
  try{const stored=JSON.parse(await fs.readFile(filename,'utf8'));
   if(!stored||!Array.isArray(stored.revisions)||stored.revisions.length>600)throw err('USGS capture store requires review',500);
   state=stored;}
  catch(e){if(e.code!=='ENOENT')throw e;state={revisions:[]};}
  loaded=true;};
 const read=async fn=>{await serial;await ensure();return copy(fn(state));};
 const write=fn=>{const job=serial.then(async()=>{
   await ensure();const next=copy(state),value=fn(next);
   await fs.mkdir(path.dirname(filename),{recursive:true});
   const tmp=filename+'.'+randomUUID()+'.tmp';
   try{await fs.writeFile(tmp,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,filename);}
   finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
   state=next;return copy(value);});
  serial=job.catch(()=>{});return job;};
 const latest=s=>{const map=new Map();for(const r of s.revisions)map.set(r.capture.id,r);
  return [...map.values()].sort((a,b)=>b.capture.releaseDate.localeCompare(a.capture.releaseDate));};
 return {
  capture(input){return write(s=>{
   const captured=normalizeUsgsCapture(input,{clock});
   const prev=s.revisions.filter(r=>r.capture.id===captured.id).at(-1);
   const hash=digest({title:captured.title,releaseDate:captured.releaseDate,officialUrl:captured.officialUrl,statistics:captured.statistics});
   if(prev?.contentHash===hash)return {added:false,changed:false,revisionId:prev.revisionId};
   if(s.revisions.length>=600)throw err('USGS capture capacity reached',409);
   const stamp=clock();
   s.revisions.push({revisionId:'u:'+randomUUID(),capture:{...captured,capturedAt:stamp},contentHash:hash,
    capturedAt:stamp,firstObservedAt:prev?.firstObservedAt??stamp,
    previousRevisionId:prev?.revisionId??null,originalSourceRevisionKnown:false});
   return {added:!prev,changed:Boolean(prev),revisionId:s.revisions.at(-1).revisionId};});},
  list(commodity=null){return read(s=>latest(s).filter(r=>!commodity||r.capture.statistics.some(x=>x.commodity===commodity)).slice(0,40));},
  history(id){return read(s=>s.revisions.filter(r=>r.capture.id===id));}
 };
}

/* ---------- bounded fetch + service ---------- */
async function responseJson(res,limit=420000){
 const reader=res.body?.getReader?.();
 let text='';
 if(reader){const buffers=[];let total=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>limit){await reader.cancel();throw err('Provider response exceeds size limit',502);}buffers.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  text=Buffer.concat(buffers).toString('utf8');
 }else{text=await res.text();if(Buffer.byteLength(text)>limit)throw err('Provider response exceeds size limit',502);}
 try{return JSON.parse(text)}catch{throw err('Provider response is not JSON',502);}
}
async function providerFetch(url,{fetchImpl=fetch,headers={},timeoutMs=12000,label='Provider'}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetchImpl(url,{method:'GET',redirect:'error',signal:controller.signal,
   headers:{Accept:'application/json',...headers}});
  if(!res.ok){await res.body?.cancel?.();
   throw err(res.status===429?label+' rate limited this request':label+' is unavailable',res.status===429?429:502);}
  const type=res.headers?.get?.('content-type')||'';
  if(type&&!type.toLowerCase().includes('json')){await res.body?.cancel?.();throw err(label+' returned unsupported content type',502);}
  return await responseJson(res);
 }catch(e){if(e?.name==='AbortError')throw err(label+' timed out',504);if(e?.status)throw e;
  throw err(label+' request failed',502);}
 finally{clearTimeout(timer);}
}
export function createCommodityFundamentals({env=process.env,fetchImpl=fetch,clock=nowIso,
 usgsFile,officialDocuments=()=>[],cacheMs=300000}={}){
 const cache=new Map();
 const cached=async(key,fn)=>{
  const hit=cache.get(key);
  if(hit?.expires>Date.now())return copy(hit.value);
  const value=await fn();
  cache.set(key,{expires:Date.now()+cacheMs,value:copy(value)});
  return copy(value);
 };
 const usgs=createUsgsLedger({filename:usgsFile,clock});
 return {
  usgs,
  catalog(){return {method:'commodity-fundamentals-v1',
   sources:['GDELT_DOC_COMMODITY_EXPANDED','EIA_SERIES_V1','UN_COMTRADE_PREVIEW','USDA_FAS_PSD_API','USGS_MINERAL_STATISTICS_CAPTURE'],
   commodities:Object.keys(COMMODITIES),eiaSeries:EIA_SERIES.map(x=>({id:x.id,label:x.label,unit:x.unit})),
   fertilizerHsCodes:FERTILIZER_HS,psdCommodities:Object.keys(PSD_COMMODITIES),comtradeReporters:COMTRADE_REPORTERS,
   usgsPage:usgsStatsPage(),predictionsAvailable:false,liveDisruptionVerification:false};},
  async gdelt({commodity}){
   requireCommodity(commodity);
   return cached('gdelt:'+commodity,async()=>{
    const today=clock().toISOString();
    const payload=await providerFetch(gdeltUrl(commodity),{fetchImpl,label:'GDELT'});
    const normalized=normalizeGdeltCommodityFeed(payload,{commodity,today,fetchedAt:today});
    return {...normalized,corroboration:corroborateDocuments(normalized.results,officialDocuments())};
   });},
  async eia({indicatorId='henry_hub_spot'}={}){
   const key=eiaKey(env);
   const def=EIA_SERIES.find(x=>x.id===indicatorId);if(!def)throw err('Choose a supported EIA series');
   return cached('eia:'+indicatorId,async()=>{
    const url=new URL(EIA_API);url.searchParams.set('api_key',key);url.searchParams.set('series_id',def.seriesId);
    const payload=await providerFetch(url.href,{fetchImpl,label:'EIA'});
    return normalizeEiaSeries(payload,{indicatorId,fetchedAt:clock().toISOString()});});},
  async comtrade({commodity,flow='M',reporter='842',period=null}={}){
   const url=comtradeUrl(commodity,flow,reporter,{period});
   const subscription=env?.COMTRADE_SUBSCRIPTION_KEY;
   return cached('comtrade:'+commodity+flow+reporter,async()=>{
    const headers={};
    if(typeof subscription==='string'&&subscription.length>=8){headers['Ocp-Apim-Subscription-Key']=subscription;}
    const payload=await providerFetch(url,{fetchImpl,headers,label:'UN Comtrade'});
    return normalizeComtrade(payload,{commodity,flow,reporter,fetchedAt:clock().toISOString()});});},
  async usda({crop}={}){
   const url=psdUrl(crop),key=usdaKey(env);
   return cached('usda:'+crop,async()=>{
    const payload=await providerFetch(url,{fetchImpl,headers:{'X-Api-Key':key},label:'USDA FAS'});
    return normalizePsd(payload,{crop,fetchedAt:clock().toISOString()});});},
  async snapshot({commodity}={}){
   requireCommodity(commodity);
   const run=async(name,fn)=>{
    try{return {source:name,status:'AVAILABLE',...(await fn())};}
    catch(e){
     if(e?.status===503)return {source:name,status:'NOT_CONFIGURED',reason:e.message,rows:[],results:[]};
     return {source:name,status:'UNAVAILABLE',reason:'Source temporarily unavailable',rows:[],results:[]};}
   };
   const [gdelt,eia,comtrade,usda]=await Promise.all([
    run('GDELT_DOC_COMMODITY_EXPANDED',()=>this.gdelt({commodity})),
    run('EIA_SERIES_V1',()=>this.eia({indicatorId:'henry_hub_spot'})),
    run('UN_COMTRADE_PREVIEW',()=>this.comtrade({commodity,flow:'M',reporter:'842'})),
    run('USDA_FAS_PSD_API',async()=>{const series=[];
     for(const crop of Object.keys(PSD_COMMODITIES))series.push(await this.usda({crop}));
     return {records:series.flatMap(x=>x.records),coverage:{returned:series.reduce((sum,x)=>sum+x.coverage.returned,0),accepted:series.reduce((sum,x)=>sum+x.coverage.accepted,0)},limitations:series[0]?.limitations||[]};})
   ]);
   const captures=await usgs.list(commodity);
   return {commodity,fetchedAt:clock().toISOString(),sources:[gdelt,eia,comtrade,usda],
    usgs:{source:USGS_SOURCE,status:'AVAILABLE',captures},
    predictiveAccuracyMeasured:false,
    note:'Snapshot rows are source-dated research context. None of the sources establishes a verified disruption, verified issuer impact or forecast.'};
  }
 };
}

/* ---------- API ---------- */
export function createCommodityFundamentalsApi({service}={}){
 if(!service)throw err('Commodity fundamentals service is required');
 const reply=(res,status,value)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(value));
 };
 const body=async req=>{
  if(Number(req.headers['content-length']||0)>16000)throw err('Request too large',413);
  let input='';
  for await(const chunk of req){input+=chunk.toString('utf8');if(Buffer.byteLength(input)>16000)throw err('Request too large',413);}
  try{const parsed=JSON.parse(input||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}
  catch{throw err('Expected JSON object body');}
 };
 return async(req,res,url)=>{
  const pathname=url.pathname;
  if(!pathname.startsWith('/api/commodity/fundamentals/'))return false;
  try{
   if(!['GET','POST'].includes(req.method))throw err('Unsupported method',405);
   if(req.method==='POST'&&req.headers.origin){
    let origin;try{origin=new URL(req.headers.origin)}catch{throw err('Invalid write origin',403)}
    if(origin.host!==req.headers.host||!['http:','https:'].includes(origin.protocol))throw err('Cross-origin writes forbidden',403);
   }
   const op=decodeURIComponent(pathname.slice('/api/commodity/fundamentals/'.length));
   const single=(name)=>{const values=url.searchParams.getAll(name);
    if(values.length!==1||[...url.searchParams.keys()].some(k=>k!==name))throw err('Provide exactly one '+name+' parameter');
    return values[0];};
   if(req.method==='GET'&&op==='catalog')reply(res,200,service.catalog());
   else if(req.method==='GET'&&op==='gdelt')reply(res,200,await service.gdelt({commodity:single('commodity')}));
   else if(req.method==='GET'&&op==='eia')reply(res,200,await service.eia({indicatorId:url.searchParams.get('indicator')||'henry_hub_spot'}));
   else if(req.method==='GET'&&op==='comtrade')reply(res,200,await service.comtrade({commodity:single('commodity'),
    flow:url.searchParams.get('flow')||'M',reporter:url.searchParams.get('reporter')||'842',
    period:url.searchParams.get('period')||null}));
   else if(req.method==='GET'&&op==='usda')reply(res,200,await service.usda({crop:single('crop')}));
   else if(req.method==='GET'&&op==='usgs'){const c=url.searchParams.get('commodity');
    reply(res,200,{source:'USGS_MINERAL_STATISTICS_CAPTURE',captures:await service.usgs.list(c)});}
   else if(req.method==='POST'&&op==='usgs')reply(res,201,await service.usgs.capture(await body(req)));
   else if(req.method==='GET'&&op==='snapshot')reply(res,200,await service.snapshot({commodity:single('commodity')}));
   else throw err('Unknown commodity fundamentals route',404);
  }catch(e){const status=[400,403,404,405,409,413,429,500,502,503,504].includes(e?.status)?e.status:502;
   reply(res,status,{error:e?.status?e.message:'Commodity fundamentals source unavailable'});}
  return true;
 };
}
