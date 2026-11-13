/**
 * Typed climate -> economy transmission research graphs.
 * Graph edges are CONDITIONAL hypotheses, never demonstrated causality.
 * Real dated CPC evidence is attached only to the climate signal node.
 */
import {createCrisisAtlas} from './crisis-atlas.mjs';
import {createCpcEnsoArchive} from './climate-enso.mjs';
import {isoDay} from './macro-vintage.mjs';
import {SCENARIO_REGISTRY} from './scenario-registry.mjs';

const err=(message,status=400)=>Object.assign(new Error(message),{status});
const clone=x=>structuredClone(x);
const TYPES=new Set(['climate_signal','regional_hazard','asset_exposure','crop_production','commodity_demand',
 'commodity_supply','market_balance','hydrology','energy_system','insurance_balance_sheet',
 'industry_cashflow','issuer_exposure','regulatory_event','transport_network','credit_conditions','health_event','labor_supply']);

function compileSpec(spec,atlas,registry){
 const detail=spec.caseId?atlas.detail(spec.caseId):null;
 if(spec.caseId&&(!detail||detail.case.kind!=='scenario'))throw new TypeError('Transmission graph requires existing case for legacy scenario');
 const sourceRefs=detail?detail.sources:spec.sourceReferences.map(id=>registry.source(id));
 const refs=new Map(sourceRefs.map(s=>[s.id,s]));
 const nodes=spec.nodes.map(([id,label,type,stage,requiredEvidence])=>({
  id,label,type,stage,requiredEvidence,observation:null,evidenceStatus:'NOT_OBSERVED_OR_VALIDATED'}));
 const nodeMap=new Map(nodes.map(n=>[n.id,n]));
 if(nodeMap.size!==nodes.length||nodes.some(n=>!TYPES.has(n.type)||!Number.isInteger(n.stage)||n.stage<0))
  throw new TypeError('Transmission nodes must have distinct identifiers and valid ontology');
 const edges=spec.edges.map(([id,from,to,mechanism,sourceId])=>{
  if(!nodeMap.has(from)||!nodeMap.has(to)||nodeMap.get(from).stage>=nodeMap.get(to).stage||!refs.has(sourceId))
   throw new TypeError('Transmission link is ungrounded or would violate directed stage order');
  return {id,from,to,mechanism,sourceId,direction:'CONTEXT_DEPENDENT',lag:'UNMEASURED',
   evidenceStatus:'HYPOTHESIS_NOT_EMPIRICALLY_VALIDATED',estimatedEffect:null};
 });
 if(new Set(edges.map(e=>e.id)).size!==edges.length)throw new TypeError('Transmission edges must have unique identifiers');
 const sources=[...new Set(edges.map(e=>e.sourceId))].map(id=>refs.get(id));
 return Object.freeze({id:spec.id,caseId:spec.caseId,title:spec.title,regionScope:spec.regionScope,
  nodes,edges,sources,affectedSectors:detail?.case?.affectedSectors||[spec.industry],
  eventClass:spec.eventClass,industry:spec.industry,currentMode:spec.currentMode,
  historicalMode:spec.historicalMode,providerBindings:spec.providerBindings});
}
export function createTransmissionGraph({atlas=createCrisisAtlas(),climate=createCpcEnsoArchive(),now=()=>new Date(),registry=SCENARIO_REGISTRY}={}){
 const compiled=new Map(registry.catalog().scenarios.map(row=>{const spec=registry.get(row.id);return [spec.id,compileSpec(spec,atlas,registry)];}));
 const minimal=g=>({id:g.id,caseId:g.caseId,title:g.title,regionScope:g.regionScope,
  graphNodes:g.nodes.length,graphEdges:g.edges.length,eventClass:g.eventClass,
  industry:g.industry,currentMode:g.currentMode,historicalMode:g.historicalMode,
  verifiedEdges:0,verifiedIssuerExposures:0});
 return {
  catalog(){return {schemaVersion:1,registryVersion:'scenario-registry-v1',methodVersion:'directed-economic-hypothesis-graph-v2-registry',graphs:[...compiled.values()].map(minimal),
   edgeStatus:'HYPOTHESIS_NOT_EMPIRICALLY_VALIDATED',predictionModel:false,probabilitiesAvailable:false,
   limitations:['Source links document candidate mechanisms, not validated edges or company exposures.',
    'Company, physical-asset and financial-return nodes remain unsupported without dated issuer-specific evidence.']};},
  async graph({id,asOf=null}={}){
   const spec=compiled.get(id);if(!spec)throw err('Unknown economic transmission graph',404);
   const today=now().toISOString().slice(0,10);
   if(asOf!==null&&(!isoDay(asOf)||asOf<'2001-01-01'||asOf>today))throw err('Invalid past asOf calendar date');
   if(asOf&&!spec.historicalMode)throw err('Only explicitly issue-dated scenarios support historical source evidence');
   const graph=clone(spec);
   let datedEvidence={status:asOf?'NOT_AVAILABLE':'NOT_REQUESTED',asOf,source:null};
   if(id==='enso-fertilizer'&&asOf){
    try{
     const reply=await climate.asOf(asOf);
     if(reply?.asOf!==asOf)throw err('Historical climate source date mismatch',502);
     const item=reply.discussion;
     if(item&&isoDay(item.issueDate)&&item.issueDate<=asOf&&item.source==='NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION'&&
       item.publicationClockVerified===false&&item.originalArchiveRevisionVerified===false){
      datedEvidence={status:'ISSUE_DATED_ARCHIVE_PAGE_REVISION_UNVERIFIED',asOf,
       issueDate:item.issueDate,source:item.source,sourceUrl:item.sourceUrl,
       synopsis:item.synopsis,publicationClockVerified:false,archivedRevisionVerified:false};
      const node=graph.nodes.find(n=>n.id==='enso_outlook');
      node.observation={source:item.source,issueDate:item.issueDate,asOf,sourceUrl:item.sourceUrl,
       synopsis:item.synopsis,verifiedOriginalPublicationClock:false};
      node.evidenceStatus='ISSUE_DATED_DISCUSSION_ONLY';
     }else datedEvidence={status:'NO_ELIGIBLE_ISSUED_EVIDENCE',asOf,source:null};
    }catch(e){
     if(e.status===400)throw e;
     datedEvidence={status:'UPSTREAM_EVIDENCE_UNAVAILABLE',asOf,source:null};
    }
   }
   const observedNodes=graph.nodes.filter(n=>n.observation).length;
   return {...graph,asOf,methodVersion:'directed-economic-hypothesis-graph-v2-registry',datedEvidence,
    coverage:{totalNodes:graph.nodes.length,totalEdges:graph.edges.length,sourceDatedClimateNodes:observedNodes,
     empiricallyValidatedEdges:0,verifiedIssuerExposureEdges:0,quantifiedFinancialImpacts:0},
    researchReadiness:observedNodes?'PARTIAL_SOURCE_DATED_INPUT_NO_TRANSMISSION_PROOF':'HYPOTHESIS_ONLY',
    calibratedForecast:false,causalConclusion:false,issuerImpactVerified:false,estimatedIssuerReturn:null,riskProbability:null,
    limitations:['All transmission edges are conditional mechanisms pending geographic, historical and company exposure proof.',
     'The presence of a dated NOAA discussion supports a source issue, not a validated forecast, agricultural outcome, or company risk.',
     'Historical archive publication time and original website revision remain unverified.',
     'No measured causal effect, estimated timing, market direction, return, or issuer recommendation is generated.']};
  }
 };
}
export function createTransmissionApi({service=createTransmissionGraph()}={}){
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/transmission/'))return false;
  if(req.method!=='GET'){send(res,405,{error:'Economic transmission graph API is read-only'});return true;}
  if(url.pathname==='/api/transmission/catalog'){send(res,200,service.catalog());return true;}
  if(url.pathname==='/api/transmission/graph'){
   try{
    const names=[...url.searchParams.keys()];
    if(!names.includes('id')||names.some(x=>!['id','asOf'].includes(x)||url.searchParams.getAll(x).length!==1))
     throw err('Supply exactly one supported graph ID, optionally one asOf date');
    const result=await service.graph({id:url.searchParams.get('id'),asOf:url.searchParams.get('asOf')});
    send(res,200,result);
   }catch(e){
    const status=e.status&&[400,404,429,502,503,504].includes(e.status)?e.status:502;
    send(res,status,{error:e.status?e.message:'Transmission graph research failed'});
   }
   return true;
  }
  send(res,404,{error:'Unknown economic transmission endpoint'});return true;
 };
}
