/**
 * ResearchOS v0.44 P0: source-bound corporate precursor capture.
 * Media allegations are NOT verified misconduct or predictive stock signals.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const fault=(message,status=400)=>Object.assign(Error(message),{status});
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const time=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&Number.isFinite(Date.parse(s));
const clean=(v,n=260)=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const names=Object.freeze({NVDA:'Nvidia',AMD:'AMD',MSFT:'Microsoft',AAPL:'Apple',META:'Meta',AMZN:'Amazon',TSLA:'Tesla',PLTR:'Palantir'});
export const PRECURSOR_VERSION='CORPORATE-PRECURSOR-0.44.1';
export const PRECURSOR_PROVIDERS=Object.freeze(['GDELT_MEDIA','FEDERAL_REGISTER','ALPACA_MEDIA']);
const patterns=[
 ['NATIONAL_SECURITY_ALLEGATION',/\b(?:spy|spying|spies|espionage|intelligence operation|intelligence agency)\b/i],
 ['EXPORT_CONTROL',/\b(?:export[- ]control|export[- ]restriction|export ban|chip diversion|chip smuggling|sanctions)\b/i],
 ['REGULATORY_SCRUTINY',/\b(?:investigation|investigate|probe|subpoena|congressional inquiry|senator calls for|regulator)\b/i],
 ['EXECUTIVE_GOVERNANCE',/\b(?:resigns|resignation|steps down|removed as ceo|leadership inquiry)\b/i],
 ['SUPPLY_CHAIN',/\b(?:supply chain|supplier disruption|counterparty|chip shipment)\b/i]
];
const mentioned=(title,symbol)=>{
 const n=names[symbol];
 if(!n)return false;
 const t=' '+title.toLowerCase()+' ';
 return [n,symbol].some(x=>new RegExp('(^|[^a-z0-9])'+x.toLowerCase()+'([^a-z0-9]|$)').test(t));
};
export function classifyCorporateHeadline(title,symbol){
 if(!names[symbol])throw fault('Unsupported issuer');
 const text=clean(title);
 const categories=mentioned(text,symbol)?patterns.filter(p=>p[1].test(text)).map(p=>p[0]):[];
 return {issuerMentioned:mentioned(text,symbol),categories,
  attention:categories.includes('NATIONAL_SECURITY_ALLEGATION')?'PROMPT_HUMAN_REVIEW':
   categories.some(x=>['EXPORT_CONTROL','REGULATORY_SCRUTINY'].includes(x))?'ELEVATED_HUMAN_REVIEW':
   categories.length?'RESEARCH_QUEUE':'NO_SIGNAL',
  allegationVerified:false,personMisconductEstablished:false,marketImpactVerified:false};
}
export function corporateSourceUrl(symbol,source){
 if(!names[symbol]||!PRECURSOR_PROVIDERS.includes(source))throw fault('Unsupported company/source');
 if(source==='ALPACA_MEDIA')return null;
 if(source==='GDELT_MEDIA'){
  const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  for(const [k,v] of Object.entries({query:'"'+names[symbol]+'" (investigation OR "export controls" OR espionage OR smuggling OR sanctions OR subpoena OR regulator)',mode:'ArtList',format:'json',maxrecords:'40',timespan:'1week',sort:'DateDesc'}))
   url.searchParams.set(k,v);
  return url.href;
 }
 const url=new URL('https://www.federalregister.gov/api/v1/documents.json');
 url.searchParams.set('conditions[term]',names[symbol]);
 url.searchParams.set('per_page','25');url.searchParams.set('order','newest');
 for(const f of ['document_number','title','publication_date','html_url','type'])url.searchParams.append('fields[]',f);
 return url.href;
}
const safeUrl=x=>{try{
 const u=new URL(x);return ['https:','http:'].includes(u.protocol)&&u.hostname&&
 !u.username&&!u.password&&!['localhost','127.0.0.1'].includes(u.hostname)&&
 u.href.length<850?u.href:null;
}catch{return null;}};
const origin=x=>{try{return new URL(x).hostname.replace(/^www\./,'').toLowerCase();}catch{return null;}};
function gdeltTime(x){
 if(typeof x!=='string'||!/^20\d{6}T?\d{6}Z?$/.test(x))return null;
 const s=x.replace('T','').replace('Z','');
 const t=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'Z';
 return time(t)&&new Date(t).toISOString().slice(0,19)+'Z'===t?t:null;
}
export function normalizeCorporateNews(raw,{source,symbol}={}){
 if(!names[symbol]||!PRECURSOR_PROVIDERS.includes(source))throw fault('Unsupported source/symbol');
 const rows=source==='GDELT_MEDIA'?raw?.articles:source==='FEDERAL_REGISTER'?raw?.results:raw?.events;
 if(!Array.isArray(rows)||rows.length>50)throw fault('Provider response has invalid article list',502);
 if((source==='GDELT_MEDIA'&&rows.length>=40)||(source==='FEDERAL_REGISTER'&&rows.length>=25))
  throw fault('News result page is full and may be truncated',409);
 const items=[],skipped={invalid:0,unrelated:0,noRiskTerms:0};
 for(const a of rows){
  if(!a||typeof a!=='object'){skipped.invalid++;continue;}
  const headline=clean(source==='GDELT_MEDIA'?a.title:source==='FEDERAL_REGISTER'?a.title:a.headline);
  const url=safeUrl(source==='GDELT_MEDIA'?a.url:source==='FEDERAL_REGISTER'?a.html_url:a.sourceUrl);
  if(!headline||!url){skipped.invalid++;continue;}
  if(!mentioned(headline,symbol)){skipped.unrelated++;continue;}
  if(source==='FEDERAL_REGISTER'&&origin(url)!=='federalregister.gov'){skipped.invalid++;continue;}
  const classified=classifyCorporateHeadline(headline,symbol);
  if(source!=='FEDERAL_REGISTER'&&!classified.categories.length){skipped.noRiskTerms++;continue;}
  const date=source==='FEDERAL_REGISTER'&&/^\d{4}-\d{2}-\d{2}$/.test(a.publication_date||'')&&
    !Number.isNaN(Date.parse(a.publication_date+'T00:00:00Z'))?a.publication_date:null;
  const indexed=source==='GDELT_MEDIA'?gdeltTime(a.seendate):
    source==='ALPACA_MEDIA'&&time(a.providerFirstSeenAt||a.publishedAt)?
     new Date(a.providerFirstSeenAt||a.publishedAt).toISOString():null;
  items.push({
   id:hash(source+'|'+url).slice(0,24),source,headline,url,domain:origin(url),
   sourceRecordId:source==='FEDERAL_REGISTER'?clean(a.document_number,80):
     source==='ALPACA_MEDIA'?clean(a.id,90):null,
   publishedAtVerified:null,publisherPublicationDate:date,providerIndexedAt:indexed,
   categories:source==='FEDERAL_REGISTER'?[]:classified.categories,
   attention:source==='FEDERAL_REGISTER'?'OFFICIAL_DOCUMENT_SEARCH_CANDIDATE':classified.attention,
   sourceClaimStatus:source==='FEDERAL_REGISTER'?'OFFICIAL_DOCUMENT_KEYWORD_HIT_NOT_ISSUER_LINK':
     'MEDIA_REPORT_NOT_VERIFIED_ALLEGATION',
   independentlyConfirmed:false,personMisconductVerified:false,priceImpactForecast:null
  });
 }
 return {items,skipped,totalRows:rows.length,
  coverage:source==='GDELT_MEDIA'?'GDELT_LATEST_WEEK':
   source==='FEDERAL_REGISTER'?'FEDERAL_REGISTER_LIMITED_SEARCH':'ALPACA_LATEST_SYMBOL_NEWS'};
}
async function requestOfficial(url,fetchImpl){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const r=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal:ctrl.signal,
    headers:{Accept:'application/json'}});
  if(!r?.ok)throw fault('Corporate public provider unavailable',503);
  if(!(r.headers?.get?.('content-type')||'').toLowerCase().includes('json'))
   throw fault('Corporate provider did not return JSON',502);
  if(Number(r.headers?.get?.('content-length')||0)>650000)
   throw fault('Corporate source exceeds response bound',413);
  if(!r.body||typeof r.body[Symbol.asyncIterator]!=='function')throw fault('Source stream unavailable',503);
  let bytes=0;const chunks=[];
  for await(const p of r.body){
   if(!(p instanceof Uint8Array))throw fault('Invalid source response chunk',503);
   bytes+=p.byteLength;if(bytes>650000){ctrl.abort();throw fault('Corporate source exceeds streamed size bound',413);}
   chunks.push(Buffer.from(p));
  }
  const buffer=Buffer.concat(chunks);
  let json;try{json=JSON.parse(buffer.toString('utf8'));}catch{throw fault('Invalid corporate source JSON',502);}
  return {json,bytes,hash:hash(buffer)};
 }catch(e){if(e?.status)throw e;throw fault('Corporate provider transport unavailable',503);}
 finally{clearTimeout(timer);}
}
function validate(doc,max){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.rows)||doc.rows.length>max)
  throw fault('Corporate research journal has invalid schema',500);
 let previous='GENESIS',stamp=null;
 for(const [i,x] of doc.rows.entries()){
  if(!x||x.seq!==i||!/^precursor-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x.id||'')||
   x.previousHash!==previous||!time(x.capturedAt)||stamp&&x.capturedAt<stamp||
   !names[x.symbol]||!PRECURSOR_PROVIDERS.includes(x.source)||
   !Array.isArray(x.items)||x.items.length>40)throw fault('Corporate journal record invalid',500);
  const {hash:check,...base}=x;
  if(hash(base)!==check)throw fault('Corporate research journal integrity mismatch',500);
  if(x.items.some(a=>!a||!safeUrl(a.url)||!/^[a-f0-9]{24}$/.test(a.id||'')||
   !Array.isArray(a.categories)||a.categories.some(k=>!patterns.some(p=>p[0]===k))))
   throw fault('Corporate journal contains malformed article evidence',500);
  previous=x.hash;stamp=x.capturedAt;
 }
 return doc;
}
export function createCorporatePrecursor({filename,newsSources,fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString(),enabled=false,rightsAcknowledged=false,maxSnapshots=120}={}){
 if(!path.isAbsolute(filename||'')||typeof newsSources?.news!=='function'||
  !Number.isInteger(maxSnapshots)||maxSnapshots<1||maxSnapshots>500)
  throw TypeError('Corporate monitor needs a private journal and registered Alpaca news adapter');
 let doc=null,loading=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!time(t))throw fault('Research capture clock invalid',503);return t;};
 const allowed=()=>{if(!enabled)throw fault('Private news monitoring disabled on nonloopback host',403);};
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>7000000)throw fault('Corporate precursor journal exceeds file bound',500);
    return doc=validate(JSON.parse(await fs.readFile(filename,'utf8')),maxSnapshots);
   }catch(e){if(e.code==='ENOENT')return doc={schemaVersion:1,rows:[]};
    throw fault('Private corporate journal cannot be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{const p=queue.then(async()=>{await load();return fn();});queue=p.catch(()=>{});return p;};
 async function save(value){
  if(doc.rows.length>=maxSnapshots)throw fault('Corporate journal capacity reached',409);
  const capturedAt=clock(),last=doc.rows.at(-1);
  if(last&&capturedAt<last.capturedAt)throw fault('Corporate journal clock moved backwards',409);
  const base={id:'precursor-'+randomUUID(),seq:doc.rows.length,
   capturedAt,previousHash:last?.hash||'GENESIS',...value};
  const entry={...base,hash:hash(base)},next={schemaVersion:1,rows:[...doc.rows,entry]};
  const body=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(body)>7000000)throw fault('Corporate journal storage limit reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,body,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw fault('Cannot persist corporate research snapshot',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  doc=next;return entry;
 }
 const catalog=()=>({version:PRECURSOR_VERSION,enabled,rightsAcknowledged,
  issuers:Object.keys(names),providers:PRECURSOR_PROVIDERS,automaticPolling:false,
  requiredClocks:['publishedAtVerified','publisherPublicationDate','providerIndexedAt','localFirstObservedAt'],
  note:'Media metadata and search results are not corroborated allegations. Historical article dates cannot be backdated into platform observation history.'});
 async function capture({symbol,source}={}){
  allowed();
  if(!rightsAcknowledged)throw fault('Explicit local provider use/retention acknowledgement required',403);
  if(!names[symbol]||!PRECURSOR_PROVIDERS.includes(source))
   throw fault('Use an approved issuer and fixed corporate source');
  return serial(async()=>{
   if(doc.rows.length>=maxSnapshots)throw fault('Corporate journal reached limit',409);
   let payload,bytes,bodyHash,url=null;
   if(source==='ALPACA_MEDIA'){
    const result=await newsSources.news(symbol,30);
    if(result?.source!=='ALPACA_NEWS'||!Array.isArray(result.events)||result.events.length>30)
     throw fault('Alpaca news adapter returned invalid response',502);
    payload={events:result.events};
    const serialized=JSON.stringify(payload);bytes=Buffer.byteLength(serialized);bodyHash=hash(serialized);
   }else{
    url=corporateSourceUrl(symbol,source);
    const response=await requestOfficial(url,fetchImpl);
    payload=response.json;bytes=response.bytes;bodyHash=response.hash;
   }
   const normalized=normalizeCorporateNews(payload,{symbol,source});
   const previous=doc.rows.findLast(x=>x.symbol===symbol&&x.source===source&&x.bodySha256===bodyHash);
   if(previous)return {deduplicated:true,record:previous};
   const record=await save({symbol,source,queryUrl:url,bodySha256:bodyHash,
    responseBytes:bytes,items:normalized.items,skipped:normalized.skipped,
    providerRows:normalized.totalRows,coverage:normalized.coverage,
    publisherTimeVerified:false,sourceUsageLegallyAudited:false});
   return {deduplicated:false,record};
  });
 }
 async function view({asOf=null,symbol=null}={}){
  allowed();const t=asOf||clock();
  if(!time(t)||t>clock()||(symbol!==null&&!names[symbol]))
   throw fault('Invalid issuer/as-of research filter');
  await queue;await load();
  const snapshots=doc.rows.filter(x=>x.capturedAt<=t&&(!symbol||x.symbol===symbol));
  const stories=new Map();
  for(const s of snapshots)for(const a of s.items){
   const id=s.symbol+'|'+a.id,previous=stories.get(id);
   stories.set(id,{...a,symbol:s.symbol,
    localFirstObservedAt:previous?.localFirstObservedAt||s.capturedAt,
    localLastObservedAt:s.capturedAt,revisions:(previous?.revisions||0)+1,
    publisherPublicationTimeVerified:false,officialInvestigationIndependentlyVerified:false,
    independentlyVerifiedEntityConnections:0,review:'HUMAN_REQUIRED',
    marketImpactPrediction:null});
  }
  const items=[...stories.values()].sort((a,b)=>b.localFirstObservedAt.localeCompare(a.localFirstObservedAt)||
    a.id.localeCompare(b.id));
  const health=new Map();
  for(const s of snapshots)health.set(s.symbol+'|'+s.source,{
   symbol:s.symbol,provider:s.source,capturedAt:s.capturedAt,filtered:s.items.length,
   providerRows:s.providerRows,skipped:s.skipped,bodySha256:s.bodySha256,coverage:s.coverage});
  return {version:PRECURSOR_VERSION,asOf:t,items,sourceHealth:[...health.values()],
   capturedSnapshots:snapshots.length,
   alerts:items.filter(x=>x.attention!=='NO_SIGNAL'&&x.attention!=='OFFICIAL_DOCUMENT_SEARCH_CANDIDATE').map(x=>({
    id:x.id,symbol:x.symbol,headline:x.headline,attention:x.attention,
    categories:x.categories,localFirstObservedAt:x.localFirstObservedAt,
    evidenceStatus:x.sourceClaimStatus,allegationVerified:false,
    officialSourceCorroborationRequired:true,priceImpact:null
   })),
   disclaimer:'Media allegations are not proven wrongdoing or market forecasts. Federal Register keyword hits do not prove issuer involvement. Provider-index timestamps are not verified first publication times.'};
 }
 async function close(){await queue;}
 return {catalog,capture,view,close};
}
const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export function createCorporatePrecursorApi({monitor,host='127.0.0.1'}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/corporate-precursor/'))return false;
  const op=u.pathname.slice('/api/corporate-precursor/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!u.searchParams.size)respond(res,200,monitor.catalog());
    else if(op==='view'){
     if([...u.searchParams.keys()].some(k=>!['symbol','asOf'].includes(k)||
       u.searchParams.getAll(k).length!==1))throw fault('Invalid precursor filter');
     respond(res,200,await monitor.view({asOf:u.searchParams.get('asOf')||null,
      symbol:u.searchParams.get('symbol')||null}));
    }else throw fault('Unknown precursor read route',404);
   }else if(req.method==='POST'&&op==='capture'&&!u.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-corporate-precursor']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw fault('Explicit same-origin loopback research capture required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw fault('JSON body required',415);
    let input='',bytes=0;
    for await(const chunk of req){bytes+=chunk.byteLength;if(bytes>500)throw fault('Oversized capture input',413);input+=chunk;}
    let args;try{args=JSON.parse(input);}catch{throw fault('Invalid capture JSON');}
    if(!args||typeof args!=='object'||Array.isArray(args)||
      Object.keys(args).some(k=>!['symbol','source'].includes(k)))
     throw fault('Only issuer and fixed provider inputs allowed');
    respond(res,200,await monitor.capture(args));
   }else throw fault('Unsupported precursor method',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   respond(res,status,{error:e?.status?e.message:'Corporate precursor unavailable'});
  }
  return true;
 };
}
