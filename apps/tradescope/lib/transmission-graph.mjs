/**
 * Typed climate -> economy transmission research graphs.
 * Graph edges are CONDITIONAL hypotheses, never demonstrated causality.
 * Real dated CPC evidence is attached only to the climate signal node.
 */
import {createCrisisAtlas} from './crisis-atlas.mjs';
import {createCpcEnsoArchive} from './climate-enso.mjs';
import {isoDay} from './macro-vintage.mjs';

const err=(message,status=400)=>Object.assign(new Error(message),{status});
const clone=x=>structuredClone(x);
const TYPES=new Set(['climate_signal','regional_hazard','asset_exposure','crop_production','commodity_demand',
 'commodity_supply','market_balance','hydrology','energy_system','insurance_balance_sheet',
 'industry_cashflow','issuer_exposure']);
const graphSpecs=[
 {
  id:'enso-fertilizer',caseId:'enso-fertilizer',title:'ENSO → agriculture → fertilizer market',regionScope:'Crop-growing regions in South America (specific geography unverified)',
  nodes:[
   ['enso_outlook','Issued ENSO outlook','climate_signal',0,'NOAA CPC original issue date and forecast revision'],
   ['rainfall','Regional rainfall and soil moisture','regional_hazard',1,'Georeferenced seasonal anomaly, issue/observation vintage and crop-calendar alignment'],
   ['crop','Crop planting and yield revisions','crop_production',2,'Region, crop, acreage, yield and dated USDA/local forecasts'],
   ['fert_demand','Fertilizer purchasing demand','commodity_demand',3,'N/P/K consumption volumes, delivery timing and importer inventory'],
   ['potash_supply','Global potash production and export supply','commodity_supply',2,'Dated USGS/exporter reports; separate supply shocks from demand shocks'],
   ['fert_market','Regional fertilizer import price and availability','market_balance',4,'Product-specific traded prices, tariffs, freight and volume'],
   ['fert_industry','Fertilizer and farm-input sector margins','industry_cashflow',5,'Segment disclosures, cost pass-through and baseline competition'],
   ['fert_issuer','Named issuer exposure (not established)','issuer_exposure',6,'Facility/supplier/revenue map with company IDs and period-valid evidence']
  ],
  edges:[
   ['e01','enso_outlook','rainfall','Forecast climate phase may correlate with location- and season-specific rainfall','ens'],
   ['e02','rainfall','crop','Regional water stress may change acreage, timing or crop yields','usda'],
   ['e03','crop','fert_demand','Acreage and expected crop economics may alter fertilizer purchase volumes','usda'],
   ['e04','fert_demand','fert_market','Regional fertilizer demand interacts with imported inventories and traded prices','potash'],
   ['e05','potash_supply','fert_market','Export availability and freight independently affect local fertilizer prices','potash'],
   ['e06','fert_market','fert_industry','Product-specific prices and input mix may change sector margins','potash'],
   ['e07','fert_industry','fert_issuer','Issuer-level impact requires proven revenues, supplies and contracts','potash']
  ]
 },
 {
  id:'wildfire-insurance',caseId:'wildfire-insurance',title:'Wildfire → insurance → reconstruction',regionScope:'Fire-perimeter and insured-property intersection (actual region unassigned)',
  nodes:[
   ['fire_weather','Regional fire-weather and drought','regional_hazard',0,'Issued weather forecasts and observed risk timestamps'],
   ['wildfire','Observed wildfire extent and intensity','regional_hazard',1,'NASA FIRMS detection/coverage, fire perimeter and observation timestamps'],
   ['insured_assets','Actual exposed insured property','asset_exposure',2,'Geocoded insured values, policies and valid coverage dates'],
   ['claims','Insurer and reinsurer net claims','insurance_balance_sheet',3,'Loss notices, attachment/retention layers and reinsurance share'],
   ['insurance_sector','Insurer capital, reserves and renewals','industry_cashflow',4,'Segment reserve filings, premium pricing and regulatory constraints'],
   ['rebuild','Repair/rebuild demand and material supply','commodity_demand',3,'Permits, repair orders and local material and labor constraints'],
   ['construction','Construction/materials sector net effects','industry_cashflow',4,'Regional revenue and cost exposure, backlog and timing'],
   ['wildfire_issuer','Named issuer impact (not established)','issuer_exposure',5,'Company policy, loss, operating asset or regional revenue evidence']
  ],
  edges:[
   ['w01','fire_weather','wildfire','Fire weather can affect wildfire likelihood and spread but does not establish occurrence','storm'],
   ['w02','wildfire','insured_assets','Burn extent must overlap verified insured property footprints','wildfire'],
   ['w03','insured_assets','claims','Policy terms, retentions and limits determine potential claims','insurance'],
   ['w04','claims','insurance_sector','Net loss and capital effects depend on insurer risk transfer and reporting','insurance'],
   ['w05','wildfire','rebuild','Damaged buildings can affect rebuilding demand and supply constraints','eonet'],
   ['w06','rebuild','construction','Local demand and material/labor costs can move construction margins differently','insurance'],
   ['w07','insurance_sector','wildfire_issuer','Named insurers require company-specific loss evidence','insurance'],
   ['w08','construction','wildfire_issuer','Named builders require actual geographic orders and margins','insurance']
  ]
 },
 {
  id:'snow-hydropower',caseId:'snow-hydropower',title:'Snowpack → hydrology → power and farming',regionScope:'Specific snow-fed watersheds and utility service territories (unassigned)',
  nodes:[
   ['snow_observation','Snow-water equivalent and temperature','climate_signal',0,'Date-stamped station/basin observations and source revisions'],
   ['runoff','Seasonal runoff and reservoir inflows','hydrology',1,'Watershed runoff forecasts, reservoir and melt timing'],
   ['hydro_supply','Hydropower generation availability','energy_system',2,'Utility generation dispatch and reservoir operating constraints'],
   ['fuel_mix','Thermal power and natural gas substitution','energy_system',3,'Fuel dispatch, market demand, gas prices and power-market rules'],
   ['irrigation','Crop irrigation water availability','asset_exposure',2,'Irrigation districts, watershed rights, storage and farm locations'],
   ['energy_sector','Power sector costs and revenue','industry_cashflow',4,'Utility fuel/power purchases, hedges and rate recovery'],
   ['farm_sector','Water-sensitive farming cash flow','industry_cashflow',3,'Crop/region yields and irrigation expenditure'],
   ['snow_issuer','Named issuer impact (not established)','issuer_exposure',5,'Verified utility operating assets, customers, farming footprint and disclosures']
  ],
  edges:[
   ['s01','snow_observation','runoff','Snow-water equivalent and temperature may affect melt and runoff','snow'],
   ['s02','runoff','hydro_supply','Reservoir and runoff changes may affect hydropower availability','snow'],
   ['s03','hydro_supply','fuel_mix','Reduced hydro generation may require substitute supply','gas'],
   ['s04','fuel_mix','energy_sector','Fuel/wholesale prices and hedges can change generation economics','gas'],
   ['s05','runoff','irrigation','Water timing and allocation may affect irrigation access','snow'],
   ['s06','irrigation','farm_sector','Crop and irrigation cost effects depend on regional exposure','usda'],
   ['s07','energy_sector','snow_issuer','Named utility impact requires verified geography and contracts','gas'],
   ['s08','farm_sector','snow_issuer','Named agriculture issuer requires crop/revenue geographic proof','usda']
  ]
 }
];
function compileSpec(spec,atlas){
 const detail=atlas.detail(spec.caseId);
 if(!detail||detail.case.kind!=='scenario')throw new TypeError('Transmission graph requires an existing scenario case');
 const refs=new Map(detail.sources.map(s=>[s.id,s]));
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
  nodes,edges,sources,affectedSectors:detail.case.affectedSectors});
}
export function createTransmissionGraph({atlas=createCrisisAtlas(),climate=createCpcEnsoArchive(),now=()=>new Date()}={}){
 const compiled=new Map(graphSpecs.map(spec=>[spec.id,compileSpec(spec,atlas)]));
 const minimal=g=>({id:g.id,caseId:g.caseId,title:g.title,regionScope:g.regionScope,
  graphNodes:g.nodes.length,graphEdges:g.edges.length,verifiedEdges:0,verifiedIssuerExposures:0});
 return {
  catalog(){return {schemaVersion:1,methodVersion:'directed-economic-hypothesis-graph-v1',graphs:[...compiled.values()].map(minimal),
   edgeStatus:'HYPOTHESIS_NOT_EMPIRICALLY_VALIDATED',predictionModel:false,probabilitiesAvailable:false,
   limitations:['Source links document candidate mechanisms, not validated edges or company exposures.',
    'Company, physical-asset and financial-return nodes remain unsupported without dated issuer-specific evidence.']};},
  async graph({id,asOf=null}={}){
   const spec=compiled.get(id);if(!spec)throw err('Unknown economic transmission graph',404);
   const today=now().toISOString().slice(0,10);
   if(asOf!==null&&(!isoDay(asOf)||asOf<'2001-01-01'||asOf>today))throw err('Invalid past asOf calendar date');
   if(asOf&&id!=='enso-fertilizer')throw err('Only ENSO currently supports dated original-source evidence');
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
   return {...graph,asOf,methodVersion:'directed-economic-hypothesis-graph-v1',datedEvidence,
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
