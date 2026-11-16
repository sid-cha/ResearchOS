/**
 * ResearchOS v0.48 — evidence-typed, read-only causal/exposure graph.
 * Composes local, as-of source journals; does not fetch or invent relationships.
 * Mechanism chains remain conditional; official site metadata + SEC identity
 * + analyst claim never establish verified legal ownership or financial impact.
 */
import {createHash} from 'node:crypto';
import {MECHANISMS} from './mechanism-radar.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&
  Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,19)===s.slice(0,19);
const frs=/^\d{12}$/;
const eventRef=/^(?:USGS|NASA_EONET|FAA_NAS_STATUS):[A-Za-z0-9_.:-]{1,150}$/;
const clampText=(x,n=220)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f<>]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,n):'';
const safeUrl=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&
 u.hostname&&u.href.length<=1200?u.href:null;}catch{return null;}};
const knownThemes=new Set(MECHANISMS.map(x=>x.id));
const MAX=Object.freeze({nodes:900,edges:1500,paths:240});
export const DYNAMIC_EXPOSURE_VERSION='CAUSAL-EXPOSURE-GRAPH-0.48.1';
export const EXPOSURE_PROOF_GATES=Object.freeze([
 'SOURCE_CAPTURE_IS_NOT_ORIGINAL_PUBLICATION_TIME',
 'CAUSAL_TEMPLATE_NOT_INDEPENDENTLY_VERIFIED',
 'INDUSTRY_EXPOSURE_NEEDS_OBSERVED_INPUT_AND_TRADE_FLOW',
 'EPA_LOCATION_IS_NOT_SURVEYED_ASSET_FOOTPRINT',
 'HAZARD_INTERSECTION_IS_NOT_PHYSICAL_DAMAGE',
 'PROXIMITY_IS_NOT_STRUCTURE_DAMAGE_OR_CAUSALITY',
 'SHAKEMAP_MODEL_MMI_IS_NOT_A_MEASURED_SITE_LOSS',
 'SEC_CIK_AND_ANALYST_CLAIM_DO_NOT_PROVE_LEGAL_FACILITY_OWNERSHIP',
 'UNAUTHENTICATED_REVIEW_ALIASES_NOT_INDEPENDENT_ADJUDICATION',
 'NO_ISSUER_REVENUE_MATERIALITY_OR_STOCK_CAUSALITY'
]);
const statusRank=Object.freeze({
 REPORTED_HAZARD_OVERLAP:0,MODELED_MMI_NEARBY:1,
 HAZARD_BOUNDARY_UNCERTAIN:2,EVENT_POINT_PROXIMITY:3
});
const node=(id,type,title,detail={})=>({id,type,title:clampText(title,240),...detail});
const directed=(from,to,relation,status,extra={})=>({
 id:sha({from,to,relation,source:extra.sourceId||null}).slice(0,20),from,to,relation,status,
 independentlyVerified:false,causalEffectVerified:false,...extra});
const evidenceRef=(sourceKind,sourceId,capturedAt,sourceUrl=null,sourceSha256=null)=>({
 sourceKind,sourceId,firstSeenAt:capturedAt,
 sourceUrl:safeUrl(sourceUrl),sourceSha256,
 originalPublisherTimeVerified:false});
const challenge=(type,question,need)=>({type,question,requiredEvidence:need,
 answeredByCurrentSources:false});
const problemsFor=(kind,hasClaim,hasReview)=>{
 const result=[challenge('ORIGINAL_RELEASE_CLOCK','When did this source first become publicly available?',
 'Original publisher/agency release archive; local capture timestamp is insufficient'),
 challenge('CAUSAL_ALTERNATIVES','Can another mechanism explain the observed event or economic impact?',
 'Precommitted alternative-cause controls and contemporaneous evidence'),
 challenge('REAL_WORLD_DAMAGE',
  kind==='MODELED_MMI_NEARBY'?'Does modeled shaking actually damage this asset?':
   kind==='EVENT_POINT_PROXIMITY'?'Did the source event affect this site beyond proximity?':
   'Did the mapped or warned hazard physically affect this particular site?',
 'Independent surveyed site footprint, condition inspection and measured disruption')];
 if(hasClaim)result.push(challenge('COMPANY_LINK',
  'Does the SEC filer legally own, operate, buy from or sell to this facility?',
  'Authenticated contemporary contracts/corporate registers, not an asserted filing URL'));
 else result.push(challenge('MISSING_COMPANY_LINK','Which legal company has documented exposure to this site?',
  'Confirmed ownership/operator/supplier entity and legal identifiers'));
 if(hasReview)result.push(challenge('REVIEW_INDEPENDENCE',
  'Are human review aliases independently authenticated and their conclusions externally corroborated?',
  'Authenticated reviewers and independently sourced proof of relationship meaning/effective dates'));
 result.push(challenge('ECONOMIC_MATERIALITY','Does this event change revenue, input costs, capacity or insured loss?',
  'Original segment/contract data, measured event effect and baseline controls'));
 return result;
};
function buildDynamicGraph({
 asOf,themeId=null,registryId=null,eventId=null,
 mechanism,climate,facility,entity,relationship,hazard,shakemap
}={}){
 if(!iso(asOf)||themeId!==null&&!knownThemes.has(themeId)||
  registryId!==null&&!frs.test(registryId)||
  eventId!==null&&!eventRef.test(eventId))
  throw fail('Invalid graph replay filter');
 for(const [name,value] of Object.entries({mechanism,climate,facility,entity,relationship,hazard,shakemap})){
  if(!value||typeof value!=='object'||value.asOf!==asOf)
   throw fail('Point-in-time source disagreement or unavailable '+name+' snapshot',502);
 }
 for(const [label,array] of Object.entries({
  mechanisms:mechanism.results,climate:climate.metrics,facilities:facility.facilities,
  companies:facility.companies,claims:facility.relationships,
  graphNodes:entity.nodes,graphEdges:entity.edges,
  relationshipReviews:relationship.proposals,
  hazards:hazard.snapshots,mmi:shakemap.results,candidates:facility.candidates
 })){
  if(!Array.isArray(array)||array.length>2500)
   throw fail('Source graph contains unavailable or unbounded '+label+' records',502);
 }
 const nodes=new Map(),edges=new Map(),paths=[];
 const insertNode=n=>{
  if(!n?.id||!n?.type)throw fail('Graph node missing required identity',502);
  if(!nodes.has(n.id))nodes.set(n.id,n);
 };
 const insertEdge=e=>{
  if(!nodes.has(e.from)||!nodes.has(e.to))throw fail('Graph edge endpoints missing',502);
  if(!edges.has(e.id))edges.set(e.id,e);
 };
 const checkClock=(value,label)=>{
  if(!iso(value)||value>asOf)throw fail('Source evidence clock exceeds as-of cutoff: '+label,502);
 };
 const selected=mechanism.results.filter(m=>!themeId||m.id===themeId);
 for(const model of selected){
  for(const stage of model.nodes){
   const id='mechanism:'+model.id+':'+stage.id;
   insertNode(node(id,'MECHANISM_STAGE',stage.title,{
    stageKind:stage.kind,themeId:model.id,proofStatus:
     (model.observedNodes||[]).includes(stage.id)?'SOURCE_REPORTED_LEAD':'CONDITIONAL_HYPOTHESIS',
    requirement:stage.requiredEvidence,verifiedOutcome:false}));
  }
  for(const relation of model.edges){
   insertEdge(directed('mechanism:'+model.id+':'+relation.from,
    'mechanism:'+model.id+':'+relation.to,'CONDITIONAL_MECHANISM',
    'UNVERIFIED_HYPOTHESIS',{
      caveat:clampText(relation.context),mechanism:clampText(relation.mechanism),
      proofRequired:true,sourceId:null}));
  }
  for(const obs of model.observations){
   checkClock(obs.localFirstSeenAt,'mechanism observation');
   const id='source:theme:'+model.id+':'+sha({id:obs.id,capturedAt:obs.localFirstSeenAt}).slice(0,20);
   insertNode(node(id,'REPORTED_SOURCE_OBSERVATION',obs.title,{
    proofStatus:'SOURCE_REPORTED_LEAD',themeId:model.id,
    evidence:evidenceRef(obs.provider,obs.id,obs.localFirstSeenAt,obs.sourceUrl)}));
   const root=model.nodes[0];
   if(root)insertEdge(directed(id,'mechanism:'+model.id+':'+root.id,
    'SOURCE_LEAD_FOR_THEME','REPORT_ONLY_NOT_CAUSAL_PROOF',{
      sourceId:obs.id,sourceCapturedAt:obs.localFirstSeenAt}));
  }
 }
 if(!themeId||themeId==='enso-circulation'){
  const anchor='mechanism:enso-circulation:climate-observation';
  for(const m of climate.metrics){
   checkClock(m.capturedAt,'numeric climate');
   const id='source:climate:'+m.metricId+':'+sha({metric:m.metricId,at:m.capturedAt}).slice(0,12);
   insertNode(node(id,'NUMERIC_SOURCE_OBSERVATION',m.label,{
    proofStatus:'SOURCE_REPORTED_NUMERIC_CONTEXT',metricId:m.metricId,
    latestValue:m.trend?.latest?.value??null,latestPeriod:m.trend?.latest?.period||null,
    evidence:evidenceRef('NOAA_CPC_NUMERIC',m.metricId,m.capturedAt,m.sourceUrl,m.bodySha256),
    officialEnsoPhaseVerified:false}));
   if(nodes.has(anchor))insertEdge(directed(id,anchor,'NUMERICAL_CONTEXT_NOT_FORECAST',
     'SOURCE_REPORTED_ONLY',{sourceId:m.metricId,sourceCapturedAt:m.capturedAt}));
  }
 }
 const siteMap=new Map();
 for(const f of facility.facilities.filter(x=>!registryId||x.registryId===registryId)){
  if(!frs.test(f.registryId))continue;
  checkClock(f.capturedAt,'EPA site');
  const id='frs:'+f.registryId;
  siteMap.set(f.registryId,id);
  insertNode(node(id,'EPA_REPORTED_SITE',f.facilityName||f.registryId,{
   registryId:f.registryId,coordinates:Array.isArray(f.location)?f.location.slice(0,2):null,
   proofStatus:'EPA_SITE_METADATA_NOT_SURVEYED_FOOTPRINT',
   evidence:evidenceRef('EPA_FRS',f.registryId,f.capturedAt,f.providerUrl,f.bodySha256),
   ownershipVerified:false}));
 }
 const companies=new Map();
 for(const c of facility.companies){
  if(!/^\d{10}$/.test(c.cik||''))continue;
  checkClock(c.capturedAt,'SEC company');
  companies.set(c.cik,c);
 }
 const claimsBySite=new Map();
 for(const claim of facility.relationships){
  if(!siteMap.has(claim.registryId)||!companies.has(claim.cik))continue;
  checkClock(claim.capturedAt,'analyst relationship');
  const company=companies.get(claim.cik),cid='cik:'+claim.cik;
  insertNode(node(cid,'SEC_REGISTERED_FILER',company.companyName||claim.cik,{
   cik:claim.cik,tickers:Array.isArray(company.tickers)?company.tickers.slice(0,20):[],
   proofStatus:'SEC_IDENTITY_ONLY',ownershipVerified:false,
   evidence:evidenceRef('SEC_EDGAR',claim.cik,company.capturedAt,company.providerUrl,company.bodySha256)}));
  if(!claimsBySite.has(claim.registryId))claimsBySite.set(claim.registryId,[]);
  const assessment=(relationship.proposals||[]).filter(p=>p.relationshipId===claim.relationshipId);
  const matched=assessment.some(p=>p.textMatchedInPreviouslyCapturedDocument===true);
  const c={...claim,filingExcerptMatched:matched,hasReview:assessment.length>0};
  claimsBySite.get(claim.registryId).push(c);
  insertEdge(directed(siteMap.get(claim.registryId),cid,'OPERATOR_RELATIONSHIP_CLAIM',
   'HUMAN_CLAIM_UNVERIFIED',{
    relationshipId:claim.relationshipId,relationshipType:claim.relationshipType,
    sourceId:claim.relationshipId,sourceCapturedAt:claim.capturedAt,
    evidence:evidenceRef('ANALYST_SEC_FILING_URL',claim.relationshipId,claim.capturedAt,claim.evidenceUrl),
    filingExcerptMatched:matched,
    unverifiedEvenWithReview:true}));
 }
 // Identity graph is retained for legal context, NEVER promoted to facility title.
 for(const n of entity.nodes){
  if(n.kind!=='LEGAL_ENTITY'&&n.kind!=='GLEIF_PARENT_REFERENCE')continue;
  if(!n.id?.startsWith('lei:'))continue;
  if(n.capturedAt){checkClock(n.capturedAt,'GLEIF identity');}
  insertNode(node(n.id,'GLEIF_LEGAL_ENTITY',n.label||n.lei,{
   lei:n.lei,proofStatus:'GLEIF_SOURCE_REPORTED_IDENTITY',
   evidence:n.capturedAt?evidenceRef('GLEIF',n.lei,n.capturedAt,n.source):null,
   legalOwnershipVerified:false}));
 }
 for(const e of entity.edges){
  if(!['GLEIF_LEVEL2_RECORDED_CONSOLIDATION','REPORTED_ACCOUNTING_CONSOLIDATION',
    'OPERATOR_IDENTIFIER_CANDIDATE'].includes(e.type))continue;
  if(!nodes.has(e.from)||!nodes.has(e.to))continue;
  if(e.capturedAt)checkClock(e.capturedAt,'GLEIF relation');
  insertEdge(directed(e.from,e.to,e.type,'REPORTED_ACCOUNTING_OR_IDENTIFIER_ONLY',{
   sourceId:sha(e).slice(0,16),sourceCapturedAt:e.capturedAt||null,
   evidence:e.capturedAt?evidenceRef('GLEIF_OR_ANALYST_CROSSWALK',
    e.type,e.capturedAt,e.evidenceUrl||e.sourceEvidence):null,
   legalOwnershipVerified:false}));
 }
 const addPath=(originId,siteId,method,title,source,detail)=>{
  if(!nodes.has(originId)||!nodes.has(siteId))return;
  const claims=claimsBySite.get(siteId.slice(4))||[];
  const candidates=claims.length?claims:[null];
  for(const claim of candidates){
   const questions=problemsFor(method,!!claim,!!claim?.hasReview);
   const id=sha({originId,siteId,method,relationshipId:claim?.relationshipId||null,
     originEvidence:source?.sourceId||null}).slice(0,24);
   paths.push({
    id,originNodeId:originId,siteNodeId:siteId,
    issuerNodeId:claim?'cik:'+claim.cik:null,
    title:clampText(title,220),method,
    methodDescription:detail,
    source,linkStatus:claim?'HUMAN_ASSERTED_RELATIONSHIP_ONLY':'NO_CAPTURED_ISSUER_LINK',
    relationshipId:claim?.relationshipId||null,
    claimFilingMatched:claim?.filingExcerptMatched||false,
    verifiedLegalOwnership:false,verifiedPhysicalDamage:false,
    verifiedSupplyChainDependency:false,verifiedIssuerMateriality:false,
    measuredEconomicImpact:null,stockReturnForecast:null,
    automatedInvestmentAction:false,
    reviewQuestions:questions,openProofGates:questions.map(q=>q.type),
    priorityForManualReview:statusRank[method]??9
   });
  }
 };
 // Geographic candidates: distance is only a search heuristic.
 for(const c of facility.candidates){
  if(!siteMap.has(c.facilityId)||eventId&&c.eventId!==eventId)continue;
  if(!eventRef.test(c.eventId||'')||!Number.isFinite(c.distanceKm)||c.distanceKm<0)continue;
  checkClock(c.eventFirstSeenAt,'local event');
  const ev=facility.events.find(e=>e.id===c.eventId);
  if(!ev)continue;
  const nid='event:'+c.eventId;
  insertNode(node(nid,'CAPTURED_GLOBAL_EVENT',ev.title||c.eventId,{
   proofStatus:'REPORTED_EVENT_POINT_NOT_A_DAMAGE_FOOTPRINT',
   evidence:evidenceRef(ev.source||c.eventSource,c.eventId,c.eventFirstSeenAt),
   coordinates:Array.isArray(ev.location)?ev.location.slice(0,2):null}));
  insertEdge(directed(nid,siteMap.get(c.facilityId),'GEOGRAPHIC_PROXIMITY',
   'DISTANCE_ONLY_NO_DAMAGE',{
    sourceId:c.eventId,sourceCapturedAt:c.eventFirstSeenAt,
    distanceKm:c.distanceKm,searchRadiusKm:c.searchRadiusKm}));
  addPath(nid,siteMap.get(c.facilityId),'EVENT_POINT_PROXIMITY',
   (ev.title||c.eventId)+' → '+(c.facilityName||c.facilityId),
   evidenceRef(ev.source||c.eventSource,c.eventId,c.eventFirstSeenAt),
   'Event observation and facility point are nearby; proximity alone cannot verify impact');
 }
 // Hazard observations: only supported source polygons with actual site relation.
 for(const h of hazard.snapshots){
  // Hazard polygons are not independently matched to a specific USGS/FAA event ID.
  // A filtered event replay must not imply that an unrelated flood/fire footprint is connected.
  if(eventId||!siteMap.has(h.registryId))continue;
  checkClock(h.capturedAt,'hazard capture');
  for(const feat of h.features){
   if(!['INSIDE_REPORTED_POLYGON','BOUNDARY_UNCERTAIN','OUTSIDE_REPORTED_POLYGON'].includes(feat.relation))
    throw fail('Unknown hazard-site spatial relation',502);
   const nid='hazard:'+h.provider+':'+h.registryId+':'+sha({
    id:feat.id,at:h.capturedAt,relation:feat.relation}).slice(0,12);
   const source=evidenceRef(h.provider,feat.id,h.capturedAt,h.sourceUrl,h.bodySha256);
   insertNode(node(nid,'PROVIDER_HAZARD_POLYGON',feat.name||h.provider,{
    proofStatus:feat.relation,provider:h.provider,relation:feat.relation,evidence:source,
    reportedRegionOnly:true,physicalDamageVerified:false}));
   insertEdge(directed(nid,siteMap.get(h.registryId),'REPORTED_HAZARD_POLYGON_SCREEN',
    feat.relation==='INSIDE_REPORTED_POLYGON'?'SPATIAL_INTERSECTION_NOT_DAMAGE':
    feat.relation==='BOUNDARY_UNCERTAIN'?'BOUNDARY_UNCERTAIN':'OUTSIDE_POLYGON_NOT_SAFETY_PROOF',{
      sourceId:feat.id,sourceCapturedAt:h.capturedAt}));
   if(feat.relation!=='OUTSIDE_REPORTED_POLYGON')
    addPath(nid,siteMap.get(h.registryId),
     feat.relation==='INSIDE_REPORTED_POLYGON'?'REPORTED_HAZARD_OVERLAP':'HAZARD_BOUNDARY_UNCERTAIN',
     (feat.name||h.provider)+' / '+h.siteName,source,
     h.provider==='NWS_FLOOD_ALERT'?
      'NWS warning service polygon, NOT measured inundation':
      'WFIGS reported wildfire perimeter, NOT verified structure damage');
  }
 }
 for(const mm of shakemap.results){
  if(!siteMap.has(mm.registryId)||eventId&&mm.eventId!==eventId)continue;
  checkClock(mm.capturedAt,'ShakeMap capture');
  if(!eventRef.test(mm.eventId||''))throw fail('ShakeMap references unsupported event identity',502);
  const nid='mmi:'+mm.eventId+':'+mm.registryId;
  const source=evidenceRef('USGS_SHAKEMAP_GRID',mm.eventId,mm.capturedAt,
    mm.gridUrl||mm.eventDetailUrl,mm.gridSha256||mm.detailSha256);
  insertNode(node(nid,'MODELED_SITE_INTENSITY',mm.eventTitle||mm.eventId,{
   proofStatus:mm.sample?.status||'NO_GRID',estimatedMmi:mm.sample?.estimatedMmi??null,
   nearestDistanceKm:mm.sample?.nearestDistanceKm??null,evidence:source,
   siteDamageVerified:false}));
  insertEdge(directed(nid,siteMap.get(mm.registryId),'USGS_MMI_GRID_SAMPLE',
    'MODEL_ESTIMATE_NOT_SITE_LOSS',{sourceId:mm.eventId,
     sourceCapturedAt:mm.capturedAt}));
  if(mm.sample?.status==='USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE'&&
    Number.isFinite(mm.sample?.estimatedMmi))
   addPath(nid,siteMap.get(mm.registryId),'MODELED_MMI_NEARBY',
    'USGS ShakeMap / '+(mm.siteName||mm.registryId),source,
    'Modeled intensity at closest available grid node, not physical site damage');
 }
 const ordered=paths.sort((a,b)=>a.priorityForManualReview-b.priorityForManualReview||
   a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 if(nodes.size>MAX.nodes||edges.size>MAX.edges||paths.length>MAX.paths)
  throw fail('Exposure graph exceeds bounded source inventory; narrow the facility/event/theme filter',409);
 const sortedNodes=[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  sortedEdges=[...edges.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.id.localeCompare(b.id));
 const proofSummary={
  locallyCapturedSourceNodes:sortedNodes.filter(x=>x.type.endsWith('SOURCE_OBSERVATION')).length,
  candidateExposurePaths:paths.length,companyClaimedPaths:paths.filter(x=>x.issuerNodeId).length,
  verifiedCompanyFacilityOwnership:0,verifiedDamage:0,verifiedFinancialOutcomes:0,
  incompleteResearchQuestions:ordered.reduce((s,p)=>s+p.reviewQuestions.length,0)};
 return {
  version:DYNAMIC_EXPOSURE_VERSION,asOf,filters:{themeId,registryId,eventId},
  nodes:sortedNodes,edges:sortedEdges,paths:ordered,
  metrics:proofSummary,
  sourceCatalog:{mechanism:mechanism.ruleVersion,climate:climate.version,
    facility:facility.ruleVersion,entity:entity.ruleVersion,
    relationship:relationship.version,hazard:hazard.version,shakemap:shakemap.version},
  replayDigest:sha({asOf,filters:{themeId,registryId,eventId},
   nodes:sortedNodes,edges:sortedEdges,paths:ordered}),
  antiAgent:{
   challenges:EXPOSURE_PROOF_GATES,verifiedExposureCases:0,
   automaticContradictionStatus:'DETERMINISTIC_MISSING_PROOF_CHECKLIST_ONLY',
   trueIndependentAdjudication:false},
  warning:'Causal template branches are research hypotheses; hazard overlap, source reported MMI and SEC/FRS/LEI metadata do not prove ownership, actual damage, issuer loss or predicted returns.'
 };
}
export {buildDynamicGraph};

export function createDynamicExposureGraph({facilityService,entityGraph,relationshipService,
 hazardService,shakeMapService,mechanismRadar,climateNumeric,
 enabled=true,now=()=>new Date().toISOString()}={}){
 if([facilityService,entityGraph,relationshipService,hazardService,shakeMapService,
  mechanismRadar,climateNumeric].some(x=>typeof x?.view!=='function'))
  throw TypeError('Dynamic exposure graph needs all source-scoped read-only adapters');
 const nowUtc=()=>{const at=now();if(!iso(at))throw fail('Graph clock invalid',503);return at;};
 const catalog=()=>({enabled,version:DYNAMIC_EXPOSURE_VERSION,
  replayOnly:true,allSourcesPreviouslyCaptured:true,externalFetchOnRead:false,
  themes:MECHANISMS.map(x=>({id:x.id,title:x.title})),
  proofGates:EXPOSURE_PROOF_GATES,
  supportedEvidence:['MECHANISM_TEMPLATE','GDELT_OR_NOAA_SOURCE_LEAD',
    'NOAA_NUMERIC_CONTEXT','EPA_FRS_SITE','SEC_FILER_IDENTITY',
    'HUMAN_FACILITY_RELATIONSHIP_CLAIM','GLEIF_ACCOUNTING_REPORT',
    'USGS_EVENT_PROXIMITY','NWS_WFIGS_POLYGON','USGS_SHAKEMAP_MMI'],
  caveat:'No independent company ownership, seasonal regional cause, damage, supply contracts, or portfolio price prediction.'});
 async function view({asOf=null,themeId=null,registryId=null,eventId=null}={}){
  if(!enabled)throw fail('Exposure graph disabled off loopback',403);
  const t=asOf||nowUtc();
  if(!iso(t)||t>nowUtc()||(themeId!==null&&!knownThemes.has(themeId))||
    (registryId!==null&&!frs.test(registryId))||
    (eventId!==null&&!eventRef.test(eventId)))
   throw fail('Invalid point-in-time graph filters');
  // No source collection is initiated by graph replay. Strict common cutoff.
  const params={asOf:t};
  const [mechanism,climate,facility,entity,relationship,hazard,shakemap]=await Promise.all([
   mechanismRadar.view(params),climateNumeric.view(params),
   facilityService.view({...params,radiusKm:250}),
   entityGraph.view(params),relationshipService.view(params),
   hazardService.view(params),shakeMapService.view(params)
  ]);
  return buildDynamicGraph({asOf:t,themeId,registryId,eventId,
   mechanism,climate,facility,entity,relationship,hazard,shakemap});
 }
 return {catalog,view};
}
const write=(res,status,value)=>{res.writeHead(status,{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export function createDynamicExposureApi({service}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/dynamic-exposure/'))return false;
  try{
   if(req.method!=='GET')throw fail('Read-only graph endpoint',405);
   const op=u.pathname.slice('/api/dynamic-exposure/'.length);
   if(op==='catalog'&&!u.searchParams.size)write(res,200,service.catalog());
   else if(op==='view'){
    if([...u.searchParams.keys()].some(k=>!['asOf','themeId','registryId','eventId'].includes(k)||
      u.searchParams.getAll(k).length!==1))throw fail('Unknown graph query parameter');
    write(res,200,await service.view({asOf:u.searchParams.get('asOf')||null,
     themeId:u.searchParams.get('themeId')||null,
     registryId:u.searchParams.get('registryId')||null,
     eventId:u.searchParams.get('eventId')||null}));
   }else throw fail('Unknown graph endpoint',404);
  }catch(e){
   const code=[400,403,404,405,409,413,500,502,503].includes(e?.status)?e.status:503;
   write(res,code,{error:e?.status?e.message:'Dynamic exposure graph unavailable'});
  }
  return true;
 };
}
