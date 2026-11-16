/**
 * v0.45 Mechanism-first Radar: generic physical/regulatory/logistics/energy themes.
 * Captured media topics are leads, not facts. NOAA CPC issue dates are source assertions.
 * Every causal edge is conditional and requires independent downstream evidence.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const fail=(message,status=400)=>Object.assign(Error(message),{status});
const digest=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const simple=x=>typeof x==='string'?x.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,260):'';
const urlOk=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password&&u.href.length<=900?u.href:null;}catch{return null;}};
export const MECHANISM_RULE='GENERIC-CAUSAL-RADAR-0.45.1';
const node=(id,title,kind,requirement)=>({id,title,kind,requiredEvidence:requirement});
const edge=(from,to,mechanism,context)=>({from,to,mechanism,context,causallyVerified:false,
 independentlyValidated:false,conditional:true});
const enso={
 id:'enso-circulation',title:'ENSO circulation and cross-border economic exposures',class:'CLIMATE_PHYSICAL',
 query:'("El Nino" OR "La Nina" OR "trade winds" OR "Kelvin waves") (Pacific OR Peru OR California OR fisheries OR rainfall)',
 patterns:[/\bel ni(?:ñ|n)o\b/i,/\bla ni(?:ñ|n)a\b/i,/\btrade winds?\b/i,/\bkelvin waves?\b/i,/\bENSO\b/i],
 official:'NOAA_CPC',
 nodes:[
  node('climate-observation','Equatorial Pacific climate observation','early_signal','Dated NOAA CPC wind, SST, subsurface and atmospheric observations'),
  node('enso-coupling','Coupled ENSO phase','physical_mechanism','Independent ocean–atmosphere coupling evidence; RONI/ONI and circulation diagnostics'),
  node('jet-stream','North Pacific jet-stream teleconnection','regional_driver','Region- and season-specific probabilistic forecast'),
  node('california-storms','California winter precipitation odds','regional_hazard','CPC issued precipitation outlook and local storm observations'),
  node('california-assets','California facility/flood exposure','asset_exposure','Observed flood footprint, property site geometry and verified operator'),
  node('coastal-upwelling','Eastern Pacific coastal nutrient upwelling','physical_mechanism','Observed coastal upwelling, temperature and plankton/fisheries conditions'),
  node('peru-anchoveta','Peruvian anchoveta availability','commodity_supply','Independent landed catch, catch rules, fleet quotas and fish stocks'),
  node('fishmeal','Fishmeal supply and feed input pricing','commodity_market','Trade flows, production share, inventory and fishmeal price by period'),
  node('aqua-margin','Aquaculture/feed-sector economics','sector_cashflow','Cost pass-through, species inputs and region-specific contracts'),
  node('sa-rain','South American rainfall distribution','regional_hazard','Specific regional/seasonal forecast; opposite-signed regions possible'),
  node('crop-farming','Crop planting and yield response','crop_production','Dated soil moisture, regional acreage, local agronomy and crop calendars'),
  node('fert-market','Potash/fertilizer demand and imports','commodity_demand','Measured N/P/K demand, capacity and prices; independent supply controls'),
  node('issuer','Named issuer legal and revenue exposure','issuer_exposure','Valid entity/facility/contracts and segment revenue, original vintage')
 ],
 edges:[
  edge('climate-observation','enso-coupling','Wind/heat anomalies can precede a coupled ENSO regime','Bjerknes feedback; multiple confirming indicators'),
  edge('enso-coupling','jet-stream','Tropical convective changes influence jet-stream patterns','Probabilistic teleconnection, not deterministic'),
  edge('jet-stream','california-storms','Storm-track differences may change California winter precipitation odds','Depends on ENSO flavor, season and other variability'),
  edge('california-storms','california-assets','Actual storms may affect assets if hazard footprint overlaps a verified site','NWS warning is not measured flood extent'),
  edge('enso-coupling','coastal-upwelling','Ocean heat and circulation changes can weaken nutrient-rich coastal upwelling','Peru/Ecuador coastal ocean data required'),
  edge('coastal-upwelling','peru-anchoveta','Nutrient and habitat changes may alter fish distributions and catch','Actual fishery reports required'),
  edge('peru-anchoveta','fishmeal','Anchoveta fishery availability can influence fishmeal supply','Alternative suppliers, quotas and demand matter'),
  edge('fishmeal','aqua-margin','Fishmeal availability may change some feed costs and margins','Product mix, pass-through and hedging matter'),
  edge('enso-coupling','sa-rain','ENSO shifts odds of differing regional rainfall anomalies','Northern and southern South America may move differently'),
  edge('sa-rain','crop-farming','Water stress or excess rainfall may affect crop calendar and yields','Specific region/crop/season required'),
  edge('crop-farming','fert-market','Crop economics may change fertilizer demand and imports','Potash effect not assumed from a rainfall change'),
  edge('california-assets','issuer','Financial loss requires verified assets and observed damage','Issuer exposure not established'),
  edge('aqua-margin','issuer','Issuer exposure requires verified product and revenue link','Named company impact not established'),
  edge('fert-market','issuer','Fertilizer price exposure requires verified contracts and financial inputs','Named issuer impact not established')
 ]};
const policy={
 id:'regulatory-export',title:'Export-control and regulatory disruption',class:'REGULATORY_POLICY',
 query:'("export controls" OR "export restrictions" OR "export license" OR sanctions OR "trade restrictions")',
 patterns:[/\bexport[- ]controls?\b/i,/\bexport[- ]restrictions?\b/i,/\bexport licenses?\b/i,/\bsanctions\b/i,/\btrade restrictions?\b/i],
 nodes:[
  node('policy-observation','Policy/regulatory source mention','early_signal','Original official rule or independently attributed investigation report'),
  node('legal-scope','Effective legal restriction and counterparty scope','legal_mechanism','Official text, jurisdiction, implementation date and legal entities'),
  node('shipment','Product licensing and logistics friction','operational_impact','Actual shipment delay, license denial or contractual evidence'),
  node('revenue','Customer and supplier financial sensitivity','sector_cashflow','Dated customer contracts, segments, inventory and alternatives'),
  node('issuer','Issuer-specific market implication','issuer_exposure','SEC links, materiality and contemporaneous benchmark outcomes')
 ],edges:[
  edge('policy-observation','legal-scope','Reported risk may become a legally enforceable rule','A headline is not proof of a government action'),
  edge('legal-scope','shipment','Effective restrictions may change allowed shipments','Applicability and compliance exceptions required'),
  edge('shipment','revenue','Operational friction may affect business margin and cash flows','Actual sales exposure and counterfactual needed'),
  edge('revenue','issuer','Reported issuer effects may affect fundamentals','No automatic return direction')
 ]};
const logistics={
 id:'logistics-bottleneck',title:'Transport chokepoints and supply chain disruption',class:'PHYSICAL_NETWORK',
 query:'("port closure" OR "shipping disruption" OR "canal transit" OR "freight delays" OR "rail shutdown")',
 patterns:[/\bport closur(?:e|es)\b/i,/\bshipping disruptions?\b/i,/\bcanal transit\b/i,/\bfreight delays?\b/i,/\brail shutdown\b/i],
 nodes:[
  node('transport-observation','Observed or announced transit disruption','early_signal','Dated port/canal/rail operator notice'),
  node('capacity','Route and network capacity constraint','physical_mechanism','Actual closure duration, throughput and alternative route'),
  node('flows','Regional material and commodity flow','commodity_supply','Trade route shares, inventories, shipments and customs statistics'),
  node('sector','Industry costs and delivery delays','sector_cashflow','Verified freight charges, customer costs and hedges'),
  node('issuer','Issuer with confirmed route dependency','issuer_exposure','Dated customer and contract links')
 ],edges:[
  edge('transport-observation','capacity','Operator event can constrain network capacity','Check actual functioning routes'),
  edge('capacity','flows','Transit capacity can influence flows','Route substitution and inventory required'),
  edge('flows','sector','Freight/commodity changes may affect sector margins','Input mix and pass-through required'),
  edge('sector','issuer','Issuer effect depends on contractual exposure','No causal stock inference')
 ]};
const energy={
 id:'energy-supply',title:'Energy supply and substitution shock',class:'ENERGY_SYSTEM',
 query:'("gas pipeline outage" OR "power plant shutdown" OR "oil supply disruption" OR "grid emergency" OR "hydropower drought")',
 patterns:[/\bpipeline outages?\b/i,/\bpower plant shutdown\b/i,/\boil supply disruptions?\b/i,/\bgrid emergenc(?:y|ies)\b/i,/\bhydropower drought\b/i],
 nodes:[
  node('energy-observation','Official energy service notice','early_signal','Dated grid/pipeline/utility operator notice'),
  node('supply','Regional capacity and reserve balance','physical_mechanism','EIA/ISO dispatch, reserves and substitution options'),
  node('cost','Input fuel and electricity cost','commodity_market','Observed prices and contract settlement periods'),
  node('industry','Energy-intensive sector margin','sector_cashflow','Verified process intensity and pass-through'),
  node('issuer','Issuer energy exposure','issuer_exposure','Facility fuel/utility contracts and financial materiality')
 ],edges:[
  edge('energy-observation','supply','Outages may constrain supply availability','Verify actual capacity loss'),
  edge('supply','cost','Regional balance may affect energy prices','Check congestion and storage'),
  edge('cost','industry','Prices may affect sector margins','Hedges and pass-through matter'),
  edge('industry','issuer','Issuer impact requires actual facility/sector map','No stock forecast')
 ]};
export const MECHANISMS=Object.freeze([enso,policy,logistics,energy].map(x=>Object.freeze(x)));
const MECHANISM_MAP=new Map(MECHANISMS.map(x=>[x.id,x]));
export function graphForTheme(id){
 const s=MECHANISM_MAP.get(id);if(!s)throw fail('Choose a registered causal mechanism');
 const ids=new Set(s.nodes.map(x=>x.id));
 if(ids.size!==s.nodes.length||s.edges.some(x=>!ids.has(x.from)||!ids.has(x.to)||x.from===x.to))
  throw TypeError('Mechanism graph invalid');
 return structuredClone({id:s.id,title:s.title,class:s.class,nodes:s.nodes,edges:s.edges});
}
export function classifyMechanismText(title){
 const text=simple(title);return MECHANISMS.filter(x=>x.patterns.some(p=>p.test(text))).map(x=>x.id);
}
export function themeSourceUrl(id){
 const s=MECHANISM_MAP.get(id);if(!s)throw fail('Unsupported mechanism');
 const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
 for(const [key,val] of Object.entries({query:s.query,mode:'ArtList',format:'json',
  timespan:'1week',maxrecords:'40',sort:'DateDesc'}))u.searchParams.set(key,val);
 return u.href;
}
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 !Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function normalizeThemeMedia(json,id){
 if(!MECHANISM_MAP.has(id)||!Array.isArray(json?.articles)||json.articles.length>40)
  throw fail('GDELT mechanism source schema invalid',502);
 if(json.articles.length===40)throw fail('GDELT article page at limit; completeness unknown',409);
 const items=[];let unrelated=0,invalid=0;
 for(const a of json.articles){
  const url=typeof a?.url==='string'?a.url:null;
  if(!a||typeof a.title!=='string'||!url||!urlOk(url)){invalid++;continue;}
  const text=simple(a.title),matched=classifyMechanismText(text);
  let indexedAt=null;
  if(typeof a.seendate==='string'&&/^20\d{6}T?\d{6}Z?$/.test(a.seendate)){
   const raw=a.seendate.replace('T','').replace('Z','');
   const stamp=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T'+
     raw.slice(8,10)+':'+raw.slice(10,12)+':'+raw.slice(12,14)+'Z';
   if(iso(stamp)&&new Date(stamp).toISOString().slice(0,19)+'Z'===stamp)indexedAt=stamp;
  }
  if(!matched.includes(id)){unrelated++;continue;}
  items.push({id:digest(url).slice(0,24),title:text,sourceUrl:url,
   categories:matched,providerIndexedAt:indexedAt,publisherOriginalTimeVerified:false,
   underlyingMechanismVerified:false,companyIdentityVerified:false,
   contentStatus:'MEDIA_TITLE_TOPIC_MATCH_ONLY'});
 }
 return {items,skipped:{unrelated,invalid},providerRows:json.articles.length};
}
async function boundedJson(url,fetchImpl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const res=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'error',
   headers:{Accept:'application/json'},signal:controller.signal});
  if(!res?.ok)throw fail('GDELT theme discovery unavailable',503);
  if(!(res.headers?.get?.('content-type')||'').toLowerCase().includes('json'))
   throw fail('Unexpected GDELT response type',502);
  if(Number(res.headers?.get?.('content-length')||0)>650000)
   throw fail('GDELT source payload exceeds cap',413);
  if(!res.body||typeof res.body[Symbol.asyncIterator]!=='function')
   throw fail('GDELT source stream unavailable',503);
  const pieces=[];let bytes=0;
  for await(const part of res.body){
   if(!(part instanceof Uint8Array))throw fail('Invalid GDELT data chunk',503);
   bytes+=part.byteLength;
   if(bytes>650000){controller.abort();throw fail('GDELT stream over response cap',413);}
   pieces.push(Buffer.from(part));
  }
  const body=Buffer.concat(pieces);
  let json;try{json=JSON.parse(body.toString('utf8'));}
  catch{throw fail('GDELT JSON malformed',502);}
  return {json,responseBytes:body.length,bodySha256:digest(body)};
 }catch(e){if(e?.status)throw e;throw fail('Mechanism source network request failed',503);}
 finally{clearTimeout(timer);}
}
function verifyJournal(doc,cap){
 if(doc?.schemaVersion!==1||!Array.isArray(doc.snapshots)||doc.snapshots.length>cap)
  throw fail('Mechanism research journal schema invalid',500);
 let last='GENESIS',stamp=null;
 for(const [i,r] of doc.snapshots.entries()){
  if(!r||r.seq!==i||r.previousHash!==last||!iso(r.capturedAt)||
   (stamp&&r.capturedAt<stamp)||!MECHANISM_MAP.has(r.themeId)||
   !['GDELT_MEDIA','NOAA_CPC'].includes(r.provider)||!Array.isArray(r.observations)||
   r.observations.length>40||
   !/^mechanism-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(r.id||''))
   throw fail('Mechanism journal record invalid',500);
  const {hash,...payload}=r;
  if(digest(payload)!==hash)throw fail('Mechanism journal hash mismatch',500);
  stamp=r.capturedAt;last=r.hash;
 }
 return doc;
}
export function createMechanismRadar({filename,cpc,fetchImpl=globalThis.fetch,
 enabled=false,rightsAcknowledged=false,now=()=>new Date().toISOString(),
 maxSnapshots=100}={}){
 if(!path.isAbsolute(filename||'')||typeof cpc?.asOf!=='function'||
  !Number.isInteger(maxSnapshots)||maxSnapshots<1||maxSnapshots>500)
  throw TypeError('Mechanism radar needs local journal and NOAA CPC research adapter');
 let state=null,loadPromise=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!iso(t))throw fail('Mechanism clock invalid',503);return t;};
 const local=()=>{if(!enabled)throw fail('Mechanism radar restricted to local host',403);};
 async function load(){
  if(state)return state;
  if(!loadPromise)loadPromise=(async()=>{
   try{
    const st=await fs.lstat(filename);
    if(!st.isFile()||st.size>6500000)throw fail('Mechanism journal larger than bound',500);
    return state=verifyJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxSnapshots);
   }catch(e){if(e.code==='ENOENT')return state={schemaVersion:1,snapshots:[]};
    throw fail('Mechanism journal cannot be verified',500);}
  })().catch(e=>{loadPromise=null;throw e;});
  return loadPromise;
 }
 const serial=fn=>{const p=queue.then(async()=>{await load();return fn();});queue=p.catch(()=>{});return p;};
 async function append(value){
  if(state.snapshots.length>=maxSnapshots)throw fail('Mechanism journal capacity reached',409);
  const capturedAt=clock(),last=state.snapshots.at(-1);
  if(last&&capturedAt<last.capturedAt)throw fail('Mechanism journal clock reversed',409);
  const base={id:'mechanism-'+randomUUID(),seq:state.snapshots.length,capturedAt,
   previousHash:last?.hash||'GENESIS',...value};
  const record={...base,hash:digest(base)},next={schemaVersion:1,
   snapshots:[...state.snapshots,record]};
  const body=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(body)>6500000)throw fail('Mechanism journal storage limit reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,body,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw fail('Unable to persist theme observation',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  state=next;return record;
 }
 const catalog=()=>({enabled,rightsAcknowledged,version:MECHANISM_RULE,
  themes:MECHANISMS.map(x=>({id:x.id,title:x.title,category:x.class,
   nodes:x.nodes.length,conditionalEdges:x.edges.length})),
  sources:['GDELT_MEDIA','NOAA_CPC'],autoPolling:false,
  limitations:['No arbitrary entities or issuer name list required for theme detection.',
   'Only the upstream early signal node may be marked source-observed, and then only as a source report.',
   'All downstream economic pathways remain CONDITIONAL hypotheses pending original dated proof.',
   'No automatic corporate exposure, calibrated climate forecast or stock-price signal.']});
 async function capture({themeId,provider}={}){
  local();
  if(!rightsAcknowledged)throw fail('Permitted-use/retention acknowledgement required for theme capture',403);
  if(!MECHANISM_MAP.has(themeId)||!['GDELT_MEDIA','NOAA_CPC'].includes(provider)||
   (provider==='NOAA_CPC'&&themeId!=='enso-circulation'))
   throw fail('Choose supported theme and fixed source');
  return serial(async()=>{
   if(state.snapshots.length>=maxSnapshots)throw fail('Mechanism archive capacity reached',409);
   let sourceUrl,observations,bodySha256,sourceStatus,providerRows=0;
   if(provider==='NOAA_CPC'){
    const date=clock().slice(0,10);
    const response=await cpc.asOf(date);
    const disc=response?.discussion||null;
    sourceUrl=disc?.sourceUrl||response?.archiveUrl||null;
    if(disc&&(!validDate(disc.issueDate)||disc.issueDate>date||!urlOk(sourceUrl)))
     throw fail('NOAA issue-claimed date invalid for current capture',502);
    observations=disc?[{
     id:'noaa-cpc-'+disc.archiveMonth,
     title:simple(disc.synopsis),
     sourceUrl,issueDateClaimedByArchive:disc.issueDate,
     availableOriginalPublicationClockVerified:false,
     firstObservedByResearchOS:null,
     contentStatus:'NOAA_ARCHIVED_DISCUSSION_OBSERVED_NOW_ORIGINAL_REVISION_UNVERIFIED'
    }]:[];
    sourceStatus=response?.evidenceStatus||'NO_DISCUSSION';
    bodySha256=digest({sourceUrl,observations,sourceStatus});
    providerRows=observations.length;
   }else{
    sourceUrl=themeSourceUrl(themeId);
    const result=await boundedJson(sourceUrl,fetchImpl);
    const normalized=normalizeThemeMedia(result.json,themeId);
    observations=normalized.items;bodySha256=result.bodySha256;
    sourceStatus='MEDIA_TOPIC_SEARCH_ONLY_NOT_VERIFIED_EVENT';
    providerRows=normalized.providerRows;
   }
   const prior=state.snapshots.findLast(x=>x.themeId===themeId&&x.provider===provider&&
    x.bodySha256===bodySha256);
   if(prior)return {deduplicated:true,snapshot:prior};
   const snapshot=await append({themeId,provider,sourceUrl,bodySha256,
    sourceStatus,providerRows,observations,retrospectiveVintageVerified:false});
   return {deduplicated:false,snapshot};
  });
 }
 async function view({asOf=null,themeId=null}={}){
  local();const cutoff=asOf||clock();
  if(!iso(cutoff)||cutoff>clock()||
   (themeId!==null&&!MECHANISM_MAP.has(themeId)))
   throw fail('Invalid mechanism or historical cutoff');
  await queue;await load();
  const visible=state.snapshots.filter(x=>x.capturedAt<=cutoff&&
   (!themeId||x.themeId===themeId));
  const results=MECHANISMS.filter(x=>!themeId||x.id===themeId).map(spec=>{
   const captured=visible.filter(x=>x.themeId===spec.id);
   const observations=captured.flatMap(s=>s.observations.map(o=>({
    ...o,provider:s.provider,localFirstSeenAt:s.capturedAt,
    originallyAvailableAtVerified:false
   })));
   const g=graphForTheme(spec.id);
   return {...g,observations,sourceCaptures:captured.length,
    readiness:observations.length?'SOURCE_OBSERVATION_LEAD_ONLY':'NO_LOCALLY_CAPTURED_SIGNAL',
    observedNodes:observations.length?[g.nodes[0].id]:[],
    missingEvidence:g.nodes.slice(1).map(n=>({nodeId:n.id,requirement:n.requiredEvidence,
      status:'NOT_ESTABLISHED_BY_THEME_DISCOVERY'})),
    namedIssuerExposure:null,causalEffectVerified:false,
    forecastProbabilities:null,expectedFinancialReturns:null};
  });
  return {ruleVersion:MECHANISM_RULE,asOf:cutoff,results,
   warnings:['The first step is a source-reported signal, not an established causal chain.',
   'No retrospective as-of alert is claimed before the local first capture.',
   'ENSO changes probabilities, not guaranteed California storms or Peru fishery losses.',
   'Potash/fertilizer demand is conditional on crop-region, agriculture, inventory and trade data.']};
 }
 async function close(){await queue;}
 return {catalog,capture,view,close};
}
const respond=(res,status,x)=>{res.writeHead(status,{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(x));};
export function createMechanismApi({radar,host='127.0.0.1'}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/mechanism-radar/'))return false;
  const op=u.pathname.slice('/api/mechanism-radar/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!u.searchParams.size)respond(res,200,radar.catalog());
    else if(op==='view'){
     if([...u.searchParams.keys()].some(x=>!['asOf','themeId'].includes(x)||
       u.searchParams.getAll(x).length!==1))throw fail('Unexpected mechanism filter');
     respond(res,200,await radar.view({
      asOf:u.searchParams.get('asOf')||null,themeId:u.searchParams.get('themeId')||null}));
    }else throw fail('Unknown mechanism research endpoint',404);
   }else if(req.method==='POST'&&op==='capture'&&!u.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
       req.headers['x-researchos-mechanism']!=='1'||
       req.headers['sec-fetch-site']==='cross-site'||
       (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw fail('Explicit loopback same-origin capture required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw fail('Mechanism capture requires JSON',415);
    let body='',size=0;
    for await(const chunk of req){size+=chunk.byteLength;if(size>450)throw fail('Mechanism request too large',413);body+=chunk;}
    let args;try{args=JSON.parse(body);}catch{throw fail('Invalid mechanism JSON');}
    if(!args||typeof args!=='object'||Array.isArray(args)||
       Object.keys(args).some(x=>!['themeId','provider'].includes(x)))
     throw fail('Only fixed theme and official provider choices are accepted');
    respond(res,200,await radar.capture(args));
   }else throw fail('Unsupported mechanism operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,502,503].includes(e?.status)?e.status:503;
   respond(res,status,{error:e?.status?e.message:'Generic mechanism research unavailable'});
  }
  return true;
 };
}
