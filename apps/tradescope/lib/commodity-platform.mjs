/**
 * Source-first fertilizer research pilot. Federal Register matches are candidates
 * only; annual SEC filing citations do not establish event exposure or returns.
 * Single-process local store and opt-in polling; no customer billing/delivery.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const SRC='FEDERAL_REGISTER_DOCUMENT_SEARCH';
const BASE='https://www.federalregister.gov/api/v1/documents.json';
const TERMS=Object.freeze({potash:'potash',urea:'urea fertilizer',phosphate:'phosphate fertilizer'});
const issue=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=x=>structuredClone(x);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nowIso=()=>new Date().toISOString();
const safe=(x,n=240)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const inRange=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
const COMPANY_DISCLOSURES=Object.freeze([
 {symbol:'MOS',company:'The Mosaic Company',cik:'0001285785',filingDate:'2026-02-27',
  form:'10-K',periodEnd:'2025-12-31',sourceUrl:'https://www.sec.gov/Archives/edgar/data/1285785/000128578526000017/mos-20251231.htm',
  commodities:['potash','phosphate'],geographies:['Brazil','Canada','United States','Peru'],
  claim:'The 2025 filing describes potash and phosphate production and fertilizer distribution operations, including in Brazil.',
  scope:'DISCLOSED_BUSINESS_ACTIVITY',impactDirection:null,percentageOfRevenue:null},
 {symbol:'CF',company:'CF Industries Holdings, Inc.',cik:'0001324404',filingDate:'2026-02-25',
  form:'10-K',periodEnd:'2025-12-31',sourceUrl:'https://www.sec.gov/Archives/edgar/data/1324404/000132440426000007/cf-20251231.htm',
  commodities:['urea'],geographies:['United States','Canada'],
  claim:'The 2025 filing describes ammonia and granular urea production and manufacturing facilities in the United States and Canada.',
  scope:'DISCLOSED_BUSINESS_ACTIVITY',impactDirection:null,percentageOfRevenue:null},
 {symbol:'IPI',company:'Intrepid Potash, Inc.',cik:'0001421461',filingDate:'2026-03-05',
  form:'10-K',periodEnd:'2025-12-31',sourceUrl:'https://www.sec.gov/Archives/edgar/data/1421461/000142146126000008/ipi-20251231.htm',
  commodities:['potash'],geographies:['United States'],
  claim:'The 2025 filing describes potash-related operations and mineral production in the United States.',
  scope:'DISCLOSED_BUSINESS_ACTIVITY',impactDirection:null,percentageOfRevenue:null}
]);
export function commoditySearchUrl(commodity){
 if(!Object.hasOwn(TERMS,commodity))throw issue('Choose a supported pilot commodity');
 const url=new URL(BASE);url.searchParams.set('conditions[term]',TERMS[commodity]);
 url.searchParams.set('order','newest');url.searchParams.set('per_page','15');return url.href;
}
export function normalizeOfficialDocs(payload,{commodity,fetchedAt=nowIso(),today=fetchedAt.slice(0,10)}={}){
 commoditySearchUrl(commodity);
 if(!Array.isArray(payload?.results)||payload.results.length>15||!day(today))throw issue('Malformed Federal Register response',502);
 const seen=new Set(),items=[];
 for(const item of payload.results){
  const no=item?.document_number,publication=item?.publication_date;
  if(typeof no!=='string'||! /^\d{4}-\d{4,6}$/.test(no)||!day(publication))throw issue('Invalid official document identity or issue date',502);
  if(publication>today||seen.has(no))continue;seen.add(no);
  const doc={id:'fr:'+no+':'+commodity,documentNumber:no,commodity,source:SRC,publishedDate:publication,
   title:safe(item.title,280),summary:safe(item.abstract,700),documentType:safe(item.type,45),
   sourceUrl:'https://www.federalregister.gov/d/'+no,
   classification:'KEYWORD_MATCHED_REGULATORY_DOCUMENT',confirmedDisruption:false,
   observedIssuerImpact:false,actualCommodityPriceImpact:null};
  if(!doc.title)throw issue('Official document title missing',502);items.push(doc);
 }
 return {commodity,source:SRC,results:items,fetchedAt,
  coverage:{returned:payload.results.length,accepted:items.length},
  limitations:['Search matches are not proof of fertilizer supply disruptions.',
   'Published date is calendar-day metadata, not original intraday availability.']};
}
async function responseJson(res,limit=550000){
 const declared=Number(res.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>limit){await res.body?.cancel?.();throw issue('Official response exceeds size limit',502);}
 const reader=res.body?.getReader?.();
 let text='';
 if(reader){
  const buffers=[];let total=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>limit){await reader.cancel();throw issue('Official response exceeds size limit',502);}buffers.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  text=Buffer.concat(buffers).toString('utf8');
 }else{text=await res.text();if(Buffer.byteLength(text)>limit)throw issue('Official response exceeds size limit',502);}
 try{return JSON.parse(text)}catch{throw issue('Official response is not JSON',502);}
}
export function createOfficialCommodityFeed({fetchImpl=fetch,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map();
 return async commodity=>{
  const url=commoditySearchUrl(commodity);
  const hit=cache.get(commodity);if(hit?.expires>Date.now())return copy(hit.value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const res=await fetchImpl(url,{method:'GET',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
   if(!res.ok){await res.body?.cancel?.();throw issue(res.status===429?'Official document source rate limited':'Official document provider unavailable',res.status===429?429:502);}
   const type=res.headers?.get?.('content-type')||'';
   if(type&&!type.toLowerCase().includes('json')){await res.body?.cancel?.();throw issue('Official document source returned unsupported MIME',502);}
   const output=normalizeOfficialDocs(await responseJson(res),{commodity,today:now().toISOString().slice(0,10),fetchedAt:now().toISOString()});
   cache.set(commodity,{expires:Date.now()+300000,value:output});
   return copy(output);
  }catch(e){if(e?.name==='AbortError')throw issue('Official document source timed out',504);if(e?.status)throw e;throw issue('Official document source unavailable',502);}
  finally{clearTimeout(timer);}
 };
}
export function companyProfiles(commodity,{asOf=nowIso().slice(0,10)}={}){
 commoditySearchUrl(commodity);if(!day(asOf))throw issue('Invalid as-of calendar date');
 return COMPANY_DISCLOSURES.filter(x=>x.commodities.includes(commodity)&&x.filingDate<=asOf)
  .map(x=>({...copy(x),claimType:'SOURCE_ANCHORED_DISCLOSED_ACTIVITY',
    filingCheckedByPrototype:false,issuerShockImpactVerified:false,
    modeledSensitivity:null,verifiedCounterpartyConnection:false,
    limitation:'Annual filing describes the company business, not an exposure to this regulatory document.'}));
}
const blank=()=>({version:1,revisions:[],watches:[],runs:[],feedback:[]});
function valid(s){
 if(!s||s.version!==1||!Array.isArray(s.revisions)||!Array.isArray(s.watches)||
   !Array.isArray(s.runs)||!Array.isArray(s.feedback)||s.revisions.length>1200||
   s.watches.length>12||s.runs.length>160||s.feedback.length>90)throw issue('Local pilot database requires review',500);
 return s;
}
export function createCommodityLedger({filename,clock=nowIso}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw issue('Local evidence ledger requires an absolute path');
 let state=blank(),loaded=false,serial=Promise.resolve();
 const ensure=async()=>{
  if(loaded)return;
  try{state=valid(JSON.parse(await fs.readFile(filename,'utf8')));}
  catch(e){if(e.code!=='ENOENT')throw e;state=blank();}
  loaded=true;
 };
 const read=async fn=>{await serial;await ensure();return copy(fn(state));};
 const write=fn=>{
  const job=serial.then(async()=>{
   await ensure();const next=copy(state),value=fn(next);valid(next);
   await fs.mkdir(path.dirname(filename),{recursive:true});
   const tmp=filename+'.'+randomUUID()+'.tmp';
   try{await fs.writeFile(tmp,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,filename);}
   finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
   state=next;return copy(value);
  });
  serial=job.catch(()=>{});return job;
 };
 const latest=s=>{
  const map=new Map();for(const r of s.revisions)map.set(r.document.id,r);
  return [...map.values()].sort((a,b)=>b.document.publishedDate.localeCompare(a.document.publishedDate));
 };
 return {
  capture(items){return write(s=>{
   let added=0,changed=0,unchanged=0;
   for(const item of items){
    if(!item?.id?.startsWith('fr:')||!Object.hasOwn(TERMS,item.commodity))throw issue('Unsupported captured document');
    const prev=s.revisions.filter(r=>r.document.id===item.id).at(-1);
    const hash=digest(item);
    if(prev?.contentHash===hash){unchanged++;continue;}
    if(s.revisions.length>=1200)throw issue('Archive capacity reached',409);
    const stamp=clock();
    s.revisions.push({revisionId:'e:'+randomUUID(),document:copy(item),contentHash:hash,
     capturedAt:stamp,firstObservedAt:prev?.firstObservedAt??stamp,
     previousRevisionId:prev?.revisionId??null,originalSourceRevisionKnown:false,
     originalFirstPublicationTimeKnown:false});
    if(prev)changed++;else added++;
   }
   return {added,changed,unchanged,totalRetainedRevisions:s.revisions.length};
  });},
  list(commodity=null){return read(s=>latest(s).filter(r=>!commodity||r.document.commodity===commodity).slice(0,80));},
  get(id){return read(s=>latest(s).find(r=>r.document.id===id)||null);},
  history(id){return read(s=>s.revisions.filter(r=>r.document.id===id));},
  watches(){return read(s=>s.watches);},
  watch(id){return read(s=>s.watches.find(w=>w.id===id)||null);},
  createWatch(input){return write(s=>{
   if(s.watches.length>=12)throw issue('Local pilot watch limit reached',409);
   commoditySearchUrl(input?.commodity);
   const intervalMinutes=Number(input?.intervalMinutes??60);
   if(!inRange(intervalMinutes,15,1440))throw issue('Choose a 15–1440 minute interval');
   const stamp=clock(),w={id:'watch:'+randomUUID(),name:safe(input?.name,80)||'Commodity monitor',
    commodity:input.commodity,intervalMinutes,enabled:false,revision:1,createdAt:stamp,updatedAt:stamp,
    lastRunAt:null,lastResult:null,lastSeenIds:[],runCount:0};
   s.watches.push(w);return w;
  });},
  setWatch(id,body){return write(s=>{
   const w=s.watches.find(x=>x.id===id);if(!w)throw issue('Watch not found',404);
   if(!inRange(body?.expectedRevision,1,1000000)||body.expectedRevision!==w.revision)throw issue('Watch revision conflict',409);
   if(typeof body.enabled!=='boolean')throw issue('enabled must be boolean');
   w.enabled=body.enabled;w.revision++;w.updatedAt=clock();return w;
  });},
  recordWatchRun(id,result){return write(s=>{
   const w=s.watches.find(x=>x.id===id);if(!w)throw issue('Watch not found',404);
   if(w.commodity!==result.commodity)throw issue('Watch source mismatch');
   const first=!w.lastRunAt,previous=new Set(w.lastSeenIds),ids=result.results.map(x=>x.id);
   const newCandidates=first?0:ids.filter(id=>!previous.has(id)).length;
   const stamp=clock();
   w.lastRunAt=stamp;w.runCount++;w.lastSeenIds=ids.slice(0,40);
   w.lastResult={status:'completed',baselineEstablished:first,candidateDocuments:ids.length,
    newCandidates,providerFetchedAt:result.fetchedAt};
   s.runs.push({id:'run:'+randomUUID(),watchId:id,at:stamp,...w.lastResult});
   if(s.runs.length>150)s.runs.shift();
   return {watch:w,summary:w.lastResult};
  });},
  runs(){return read(s=>s.runs.slice(-40).reverse());},
  feedback(input){return write(s=>{
   if(!inRange(input?.minutesBefore,1,720)||!inRange(input?.minutesWith,1,720)||
      !inRange(input?.sourceQuality,1,5))throw issue('Provide actual before/after minutes and source quality 1–5');
   if(s.feedback.length>=80)throw issue('Pilot feedback limit reached',409);
   const item={id:'feedback:'+randomUUID(),at:clock(),minutesBefore:input.minutesBefore,
    minutesWith:input.minutesWith,sourceQuality:input.sourceQuality,notes:safe(input.notes,650),selfReported:true};
   s.feedback.push(item);return item;
  });},
  metrics(){return read(s=>{
   const n=s.feedback.length;
   const mean=key=>n?Number((s.feedback.reduce((sum,f)=>sum+f[key],0)/n).toFixed(2)):null;
   return {selfReportedSamples:n,minutesBeforeMean:mean('minutesBefore'),
    minutesWithMean:mean('minutesWith'),qualityMean:mean('sourceQuality'),
    independentTimeSavingValidation:false,confirmedPayingCustomers:null,
    enabledWatches:s.watches.filter(x=>x.enabled).length,completedWatchRuns:s.runs.length,
    externalNotificationDelivery:false,clientAdoptionEvidence:false};
  });}
 };
}
export function createCommodityWorkbench({filename,feed=createOfficialCommodityFeed(),clock=nowIso,schedulerMs=60000}={}){
 const ledger=createCommodityLedger({filename,clock});let timer=null,busy=false;
 async function scan(commodity){commoditySearchUrl(commodity);
  const result=await feed(commodity);
  if(result?.commodity!==commodity||!Array.isArray(result.results))throw issue('Source result commodity mismatch',502);
  const capture=await ledger.capture(result.results);
  return {...result,capture};
 }
 async function scanWatch(id){const watch=await ledger.watch(id);if(!watch)throw issue('Watch not found',404);
  const r=await scan(watch.commodity);return ledger.recordWatchRun(id,r);
 }
 async function tick(){
  if(busy)return;busy=true;
  try{
   const watches=await ledger.watches();
   for(const w of watches.filter(x=>x.enabled)){
    if(w.lastRunAt&&Date.now()-Date.parse(w.lastRunAt)<w.intervalMinutes*60000)continue;
    try{await scanWatch(w.id)}catch{/* Manual scan surfaces provider errors; keep last successful run on transient failure. */}
   }
  }finally{busy=false;}
 }
 async function brief(id){
  const entry=await ledger.get(id);if(!entry)throw issue('Capture a source document first',404);
  const d=entry.document,companies=companyProfiles(d.commodity,{asOf:d.publishedDate});
  const lines=['# TradeScope — Commodity disruption research brief','',
   'Document: '+d.title,'Commodity: '+d.commodity.toUpperCase(),
   'Official source: '+d.sourceUrl,'Official publication calendar date: '+d.publishedDate,
   'First local observed: '+entry.firstObservedAt,'Latest capture: '+entry.capturedAt,
   'Revision: '+entry.revisionId,'Normalized record SHA-256: '+entry.contentHash,'',
   '## Official document summary',d.summary||'No description available in the official search result.',
   '','## Issuer business activity (NOT specific event impact)'];
  for(const p of companies)lines.push('',p.symbol+' — '+p.company,p.claim,
   'SEC 2025 10-K filed '+p.filingDate+': '+p.sourceUrl,'Exposure to this event: NOT VERIFIED');
  if(!companies.length)lines.push('No eligible issuer disclosure for the publication date.');
  lines.push('','## Evidence gaps','Keyword match does not establish a disruption or change in commodity supply.',
   'Annual filings describe relevant business operations, not company-specific consequences from the document.',
   'Supply chain, signed exposure, price sensitivity, economic impact and return forecasts are unavailable.',
   'No investment recommendation or quantified risk score is generated.');
  return {document:d,evidence:{revisionId:entry.revisionId,firstObservedAt:entry.firstObservedAt,
    capturedAt:entry.capturedAt,contentHash:entry.contentHash,firstPublicationVerified:false},
   companies,coverage:{companyDisclosureMatches:companies.length,validatedDisruptionEvents:0,
    validatedIssuerImpactEdges:0,measuredReturns:0},
   predictiveAccuracyMeasured:false,report:lines.join('\n')};
 }
 return {
  catalog(){return {method:'commodity-vertical-pilot-v1',milestones:['M1','M2','M3','M4'],
   commodities:Object.keys(TERMS),sources:[SRC,'SEC_EDGAR_10K'],
   issuers:COMPANY_DISCLOSURES.map(c=>({symbol:c.symbol,name:c.company,commodities:c.commodities})),
   candidateFeedOnly:true,liveProviderValidated:false,multiTenant:false,
   predictionsAvailable:false,productionReady:false};},
  feed,scan,scanWatch,brief,ledger,
  async start(){if(timer)return;timer=setInterval(()=>{void tick().catch(()=>{});},schedulerMs);timer.unref?.();},
  close(){if(timer){clearInterval(timer);timer=null;}}
 };
}
export function createCommodityApi({service}={}){
 if(!service)throw issue('Commodity workbench service is required');
 const reply=(res,status,value,plain=false)=>{
  res.writeHead(status,{'Content-Type':plain?'text/plain; charset=utf-8':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(plain?{'Content-Disposition':'attachment; filename="tradescope-commodity-brief.txt"'}:{})});
  res.end(plain?value:JSON.stringify(value));
 };
 const body=async req=>{
  if(Number(req.headers['content-length']||0)>12000)throw issue('Request too large',413);
  let input='';
  for await(const chunk of req){input+=chunk.toString('utf8');if(Buffer.byteLength(input)>12000)throw issue('Request too large',413);}
  try{const p=JSON.parse(input||'{}');if(!p||typeof p!=='object'||Array.isArray(p))throw Error();return p;}
  catch{throw issue('Expected JSON object body');}
 };
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/commodity/'))return false;
  try{
   if(!['GET','POST','PATCH'].includes(req.method))throw issue('Unsupported method',405);
   if(req.method!=='GET'&&req.headers.origin){
    let u;try{u=new URL(req.headers.origin)}catch{throw issue('Invalid write origin',403)}
    if(u.host!==req.headers.host||!['http:','https:'].includes(u.protocol))throw issue('Cross-origin writes forbidden',403);
   }
   const op=decodeURIComponent(url.pathname.slice('/api/commodity/'.length)),qs=url.searchParams;
   if(req.method==='GET'&&op==='catalog')reply(res,200,service.catalog());
   else if(req.method==='GET'&&op==='live'){
    const c=qs.get('commodity');
    if(qs.getAll('commodity').length!==1||[...qs.keys()].some(x=>x!=='commodity'))throw issue('Select one commodity');
    reply(res,200,await service.feed(c));
   }else if(req.method==='POST'&&op==='scan')reply(res,200,await service.scan((await body(req)).commodity));
   else if(req.method==='GET'&&op==='events'){
    if([...qs.keys()].some(x=>x!=='commodity')||qs.getAll('commodity').length>1)throw issue('Unexpected filter');
    const c=qs.get('commodity');if(c!==null)commoditySearchUrl(c);
    reply(res,200,{events:await service.ledger.list(c)});
   }else if(req.method==='GET'&&op==='companies'){
    const c=qs.get('commodity'),asOf=qs.get('asOf')||nowIso().slice(0,10);
    if(qs.getAll('commodity').length!==1||[...qs.keys()].some(k=>!['commodity','asOf'].includes(k)||qs.getAll(k).length!==1))throw issue('Select one commodity');
    reply(res,200,{commodity:c,asOf,companies:companyProfiles(c,{asOf})});
   }else if(req.method==='GET'&&(op==='brief'||op==='brief.txt')){
    const id=qs.get('id');
    if(qs.getAll('id').length!==1||[...qs.keys()].some(x=>x!=='id'))throw issue('Select one event');
    const r=await service.brief(id);
    reply(res,200,op==='brief'?r:r.report,op==='brief.txt');
   }else if(req.method==='GET'&&op==='watches')reply(res,200,{watches:await service.ledger.watches(),runs:await service.ledger.runs()});
   else if(req.method==='POST'&&op==='watches')reply(res,201,{watch:await service.ledger.createWatch(await body(req))});
   else if(req.method==='PATCH'&&/^watches\/watch:[a-f0-9-]{36}$/.test(op))
    reply(res,200,{watch:await service.ledger.setWatch(op.slice(8),await body(req))});
   else if(req.method==='POST'&&/^watches\/watch:[a-f0-9-]{36}\/scan$/.test(op))
    reply(res,200,await service.scanWatch(op.slice(8,-5)));
   else if(req.method==='GET'&&op==='metrics')reply(res,200,await service.ledger.metrics());
   else if(req.method==='POST'&&op==='feedback')reply(res,201,{feedback:await service.ledger.feedback(await body(req))});
   else throw issue('Unknown commodity research route',404);
  }catch(e){const status=[400,403,404,405,409,413,429,500,502,503,504].includes(e?.status)?e.status:502;
   reply(res,status,{error:e?.status?e.message:'Commodity research source unavailable'});}
  return true;
 };
}
