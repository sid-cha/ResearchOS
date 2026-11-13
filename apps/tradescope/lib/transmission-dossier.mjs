/**
 * v0.22 evidence-scoped economic transmission dossier.
 * This service joins RESEARCH CONTEXT to typed hypothesis nodes; no edge ever becomes causal,
 * quantified, backtest-valid, issuer-risk-verified, or historically first-available.
 */
import {createTransmissionGraph} from './transmission-graph.mjs';
import {createRegionalClimate} from './regional-climate.mjs';
import {companyProfiles} from './commodity-platform.mjs';
import {SCENARIO_REGISTRY} from './scenario-registry.mjs';

const fail=(reason,status=400)=>Object.assign(new Error(reason),{status});
const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const dateOnly=d=>day(d)?d:null;
const positive=n=>typeof n==='number'&&Number.isFinite(n);
const safe=x=>String(x??'').trim().slice(0,260);
const idOf=x=>String(x??'').slice(0,110);
const SOURCE_RULES={
 GDELT_DOC_COMMODITY_EXPANDED:{node:null,kind:'MEDIA_CANDIDATE'},
 EIA_API_V2:{node:'fert_industry',kind:'ENERGY_INPUT_CONTEXT'},
 UN_COMTRADE_PREVIEW:{node:'fert_market',kind:'ANNUAL_TRADE_FLOW_CONTEXT'},
 USDA_FAS_PSD_API:{node:'crop',kind:'REVISABLE_CROP_ESTIMATE'},
 USGS_MINERAL_STATISTICS_CAPTURE:{node:'potash_supply',kind:'ANALYST_TRANSCRIBED_SOURCE'}
};
const APPROVED_HOSTS=new Set(['www.eia.gov','www.usgs.gov','pubs.usgs.gov','www.cpc.ncep.noaa.gov',
 'cpc.ncep.noaa.gov','power.larc.nasa.gov','apps.fas.usda.gov','comtradeplus.un.org',
 'www.sec.gov','www.federalregister.gov','www.gdeltproject.org','api.gdeltproject.org']);
const safeLink=value=>{try{const u=new URL(value);
 return u.protocol==='https:'&&APPROVED_HOSTS.has(u.hostname)&&!u.username&&!u.password?u.href:null;
 }catch{return null;}};
function readStatus(source){return source?.status==='AVAILABLE'?'AVAILABLE':
 source?.status==='NOT_CONFIGURED'?'NOT_CONFIGURED':source?.status==='UNAVAILABLE'?'UNAVAILABLE':'NOT_AVAILABLE';}
function pickObservations(source,kind){
 if(!source)return [];
 const sourceUrl=safeLink(source.sourceUrl);
 const common={source:source.source,kind,sourceStatus:'SOURCE_CONTEXT_NOT_CAUSAL_EVIDENCE',
  fetchedAt:source.fetchedAt||null,sourceUrl,publicationTimeVerified:false};
 if(kind==='ENERGY_INPUT_CONTEXT'){
  return (source.observations||[]).filter(x=>positive(x.value)&&/^\d{4}-\d{2}$/.test(x.period)).slice(0,3)
   .map(x=>({...common,period:x.period,value:x.value,unit:safe(x.unit||source.unit),
    label:'Henry Hub gas observation (input-cost context)',dataClass:'CURRENT_RELEASE_NOT_HISTORICAL_VINTAGE'}));
 }
 if(kind==='ANNUAL_TRADE_FLOW_CONTEXT'){
  return (source.rows||[]).filter(x=>/^\d{4}$/.test(x.period)&&positive(x.tradeValueUsd)).slice(0,3)
   .map(x=>({...common,sourceUrl:safeLink(x.sourceUrl),period:x.period,value:x.tradeValueUsd,unit:'USD annual trade value',
    label:safe(x.reporter)+' '+(x.flow==='M'?'imports':'exports')+' '+safe(x.commodityGroup),
    dataClass:'ANNUAL_TOTAL_NOT_CURRENT_SHIPMENT'}));
 }
 if(kind==='REVISABLE_CROP_ESTIMATE'){
  return (source.records||[]).filter(x=>positive(x.value)&&x.attribute==='PRODUCTION')
   .slice(0,3).map(x=>({...common,sourceUrl:safeLink(x.sourceUrl),period:safe(x.marketYear),
    value:x.value,unit:safe(x.unit),label:safe(x.country)+' '+safe(x.crop)+' production',
    dataClass:'REVISED_ESTIMATE_NOT_FERTILIZER_USE'}));
 }
 if(kind==='MEDIA_CANDIDATE'){
  return (source.results||[]).slice(0,3).map(x=>({...common,period:safe(x.providerFirstSeenAt?.slice(0,10)),
   label:safe(x.title),sourceUrl:safeLink(x.url||x.sourceUrl),value:null,unit:null,
   dataClass:'MEDIA_MENTION_NOT_VALIDATED_DISRUPTION'}));
 }
 if(kind==='ANALYST_TRANSCRIBED_SOURCE'){
  return (source.captures||[]).slice(0,3).flatMap(x=>(x.capture?.statistics||[]).slice(0,2).filter(z=>positive(z.value))
   .map(z=>({...common,sourceUrl:safeLink(x.capture.officialUrl),period:safe(z.period),value:z.value,
    unit:safe(z.unit),label:safe(z.attribute),dataClass:'ANALYST_TRANSCRIBED_NOT_INDEPENDENTLY_VERIFIED',
    captureHash:x.contentHash||null})));
 }
 return [];
}
function addEvidence(graph,nodeId,items){
 if(!nodeId||!items.length)return;
 const node=graph.nodes.find(x=>x.id===nodeId);
 if(!node)return;
 node.researchInputs=(node.researchInputs||[]).concat(items).slice(0,12);
 node.inputStatus='CONTEXT_ONLY_NO_TRANSMISSION_PROOF';
}
function summarize(graph,collector){
 const covered=graph.nodes.filter(n=>(n.researchInputs||[]).length||n.observation).length;
 const gaps=graph.edges.map(e=>{
  const upstream=graph.nodes.find(n=>n.id===e.from),downstream=graph.nodes.find(n=>n.id===e.to);
  const fromEvidence=Boolean(upstream?.observation||(upstream?.researchInputs||[]).length),
   toEvidence=Boolean(downstream?.observation||(downstream?.researchInputs||[]).length);
  return {...e,inputCoverage:fromEvidence&&toEvidence?'BOTH_NODES_HAVE_CONTEXT':
   fromEvidence||toEvidence?'ONE_NODE_HAS_CONTEXT':'NO_NODE_INPUT_CONTEXT',
   verification:'NOT_VALIDATED',estimatedEffect:null,measuredLag:null};
 });
 const priority=gaps.filter(e=>e.inputCoverage!=='BOTH_NODES_HAVE_CONTEXT').slice(0,7)
  .map(e=>({edgeId:e.id,from:e.from,to:e.to,required:'Provide matched location, time, baseline and independent issuer/supply evidence for '+e.mechanism}));
 return {coverage:{totalNodes:graph.nodes.length,contextNodes:covered,contextEvidenceRows:graph.nodes.reduce((sum,n)=>sum+(n.researchInputs||[]).length,0),
   missingContextNodes:graph.nodes.length-covered,totalEdges:gaps.length,validatedEdges:0,
   verifiedIssuerImpacts:0,measuredCausalEffects:0,predictionsTested:0},
  edges:gaps,priorityGaps:priority,sourceStatus:collector};
}
function buildReport(dossier){
 const lines=['# TradeScope — Economic Transmission Evidence Dossier','','Scenario: '+dossier.scenario.title,
  'Research mode: '+dossier.mode,'Commodity: '+(dossier.commodity||'not applicable'),
  'Region: '+dossier.regionId,'Historical year: '+(dossier.year||'not applicable'),
  'Research as-of: '+(dossier.asOf||'not a point-in-time historical replay'),
  'Created: '+dossier.generatedAt,'Scenario availability: '+(dossier.availability||'RESEARCH_CONTEXT'),'',
  '## Mandatory interpretation',
  'This is a directed chain of hypotheses, not verified causal transmission.',
  'Source observations do NOT establish event-specific loss, market direction, investment opportunity, or predictive performance.',
  'Historical mode excludes current-revision economic and meteorological series from the as-of evidence set.',
  '','## Inputs and provider status'];
 for(const s of dossier.sourceStatuses)lines.push('- '+s.source+': '+s.status+'; '+s.eligibleInputRows+' eligible contextual observations');
 lines.push('','## Evidence by hypothesis node');
 for(const n of dossier.nodes){
  lines.push('','### '+n.label+' ['+n.id+']',n.requiredEvidence);
  if(n.observation)lines.push('NOAA source-issued climate document: '+(n.observation.sourceUrl||'unknown')+'; issued '+n.observation.issueDate);
  const entries=n.researchInputs||[];
  if(!entries.length&&!n.observation)lines.push('Evidence: NOT AVAILABLE');
  for(const x of entries)lines.push('- '+x.label+': '+(x.value??'not numeric')+' '+(x.unit||'')+' ('+x.period+') | '+x.dataClass+
    (x.sourceUrl?' | '+x.sourceUrl:''));
 }
 lines.push('','## Edge validation','0 empirically verified edges. All '+dossier.coverage.totalEdges+' relationships are conditional hypotheses.','',
  '## Research gaps');
 for(const p of dossier.priorityGaps)lines.push('- '+p.edgeId+': '+p.required);
 lines.push('','## Outcome','Verified issuer-specific impact: NO','Calibrated forecast: NO','Estimated return: UNAVAILABLE',
  'Market recommendation: NONE','Original historical publication times: INCOMPLETE/UNVERIFIED');
 return lines.join('\n');
}
export function createTransmissionDossier({
 graph=createTransmissionGraph(),fundamentals,regional=createRegionalClimate(),
 now=()=>new Date(),issuerProfiles=companyProfiles,registry=SCENARIO_REGISTRY
}={}){
 if(!graph?.graph||!graph?.catalog)throw new TypeError('Economic transmission graph required');
 const catalog=()=>({
  version:2,method:'DATA_DRIVEN_HYPOTHESIS_REGISTRY_WITH_SOURCE_CONTEXT',
  scenarios:registry.catalog().scenarios,
  eventClasses:registry.catalog().eventClasses,
  modes:['current','historical'],historicalAsOfOnly:'enso-fertilizer',
  restrictions:['Historical replay uses NOAA CPC original issue-dated discussion only, not modern-revised annual statistics.',
   'Current-revision NASA POWER / USDA / EIA / trade totals cannot be promoted to historical-as-of indicators.',
   'All transmission edges remain unverified even if both related nodes have source observations.']
 });
 async function analyze({id,commodity='potash',regionId=null,year=null,mode='current',asOf=null}={}){
  const scenario=registry.get(id);
  if(!scenario)throw fail('Choose a supported transmission scenario');
  if(!['current','historical'].includes(mode))throw fail('Choose current or historical analysis');
  if(scenario.commodities.length&&!scenario.commodities.includes(commodity))throw fail('Unsupported commodity for this scenario');
  const region=regionId||scenario.regions[0];
  if(!scenario.regions.includes(region))throw fail('Unsupported region for this scenario');
  const current=now(),today=current.toISOString().slice(0,10);
  if(mode==='historical'){
   if(!scenario.historicalMode)throw fail('Only issue-dated supported scenarios can run historical research');
   if(!day(asOf)||asOf<'2001-01-01'||asOf>today)throw fail('A valid past historical asOf date is required');
   if(year!==null&&year!==undefined)throw fail('Historical replay does not accept retrospective meteorology year');
   const g=await graph.graph({id,asOf});
   const enriched=summarize(g,[{source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',
    status:g.datedEvidence?.status||'UNAVAILABLE',eligibleInputRows:g.coverage.sourceDatedClimateNodes}]);
   const dossier={schemaVersion:2,scenario:{id,title:scenario.title},availability:scenario.currentMode,mode,commodity,regionId:region,year:null,asOf,
    generatedAt:current.toISOString(),sourceStatuses:enriched.sourceStatus,nodes:g.nodes,edges:enriched.edges,
    coverage:enriched.coverage,priorityGaps:enriched.priorityGaps,
    replayEligibility:'ISSUE_DATED_NOAA_TEXT_ONLY_ARCHIVE_REVISION_NOT_VERIFIED',historicalForecastValidated:false,
    causalConclusion:false,issuerImpactVerified:false,estimatedReturn:null,
    limitations:['Current-vintage economic and NASA POWER data are intentionally excluded to prevent lookahead leakage.']};
   return {...dossier,report:buildReport(dossier)};
  }
  if(asOf!==null&&asOf!==undefined)throw fail('Historical asOf is only allowed in historical mode');
  const selectedYear=year??current.getUTCFullYear()-1;
  if(!Number.isInteger(selectedYear)||selectedYear<1981||selectedYear>=current.getUTCFullYear())
   throw fail('Choose a completed retrospective NASA year since 1981');
  const g=await graph.graph({id});
  if(scenario.currentMode==='TEMPLATE_ONLY'){
   const statuses=[...new Set(scenario.edges.map(x=>x[4]))].map(source=>({
    source,status:'NOT_CONNECTED',eligibleInputRows:0}));
   const summary=summarize(g,statuses);
   const dossier={schemaVersion:2,scenario:{id,title:scenario.title},availability:'TEMPLATE_ONLY',
    mode,commodity:scenario.commodities.length?commodity:null,regionId:region,
    year:selectedYear,asOf:null,generatedAt:current.toISOString(),nodes:g.nodes,edges:summary.edges,
    coverage:summary.coverage,priorityGaps:summary.priorityGaps,sourceStatuses:statuses,
    otherContext:[],replayEligibility:'NOT_HISTORICAL_AS_OF_REPLAY',
    historicalForecastValidated:false,causalConclusion:false,issuerImpactVerified:false,estimatedReturn:null,
    limitations:['Scenario graph is a reviewed mechanism template; no source observations were queried.',
     'No live exposure, event occurrence, forecast or issuer outcome is established.']};
   return {...dossier,report:buildReport(dossier)};
  }
  // Never alter original graph topology. Attach separate context payloads with no causal promotion.
  const work=[];
  if(scenario.providerBindings.includes('NASA_POWER_MONTHLY_CURRENT_REVISION'))
   work.push({source:'NASA_POWER_MONTHLY_CURRENT_REVISION',task:()=>regional.monthly({regionId:region,year:selectedYear})});
  if(scenario.providerBindings.includes('EIA_API_V2')&&fundamentals?.eia)
   work.push({source:'EIA_API_V2',task:()=>fundamentals.eia({indicatorId:'henry_hub_spot'})});
  if(scenario.providerBindings.includes('FERTILIZER_FUNDAMENTALS_SNAPSHOT')&&fundamentals?.snapshot)
   work.push({source:'FERTILIZER_FUNDAMENTALS_SNAPSHOT',task:()=>fundamentals.snapshot({commodity})});
  const settled=await Promise.allSettled(work.map(x=>x.task()));
  const statuses=[],extraContext=[];
  for(let i=0;i<settled.length;i++){
   const item=settled[i],provider=work[i].source;
   if(item.status==='rejected'){statuses.push({source:provider,status:item.reason?.status===503?'NOT_CONFIGURED':'UNAVAILABLE',eligibleInputRows:0});continue;}
   const data=item.value;
   if(provider==='EIA_API_V2'){
    const contextual=pickObservations(data,'ENERGY_INPUT_CONTEXT');
    statuses.push({source:provider,status:contextual.length?'AVAILABLE':'EMPTY',eligibleInputRows:contextual.length});
    addEvidence(g,'gas_price',contextual);
   }else if(provider==='NASA_POWER_MONTHLY_CURRENT_REVISION'){
    const entries=(data.months||[]).filter(x=>positive(x.precipitationMmPerDay)&&positive(x.temperatureC)).slice(0,12);
    statuses.push({source:provider,status:entries.length?'AVAILABLE':'EMPTY',eligibleInputRows:entries.length});
    const evidence=entries.map(x=>({source:provider,sourceStatus:'RETROSPECTIVE_GRID_POINT_CONTEXT',
     kind:'CLIMATE_MODEL_POINT_CONTEXT',period:x.month,value:x.precipitationMmPerDay,unit:'mm/day',
     label:'Model point monthly daily precipitation average; temperature '+x.temperatureC+' °C',
     fetchedAt:data.provenance?.fetchedAt,sourceUrl:safeLink(data.sourceDocumentation),
     publicationTimeVerified:false,dataClass:'CURRENT_REVISED_MONTHLY_NOT_HISTORICAL_AS_OF'}));
    if(scenario.weatherNode)addEvidence(g,scenario.weatherNode,evidence);
    else extraContext.push(...evidence); // Retrospective precipitation is not snow-water equivalent.
   }else if(provider==='FERTILIZER_FUNDAMENTALS_SNAPSHOT'){
    for(const entry of [...(data.sources||[]),...(data.usgs?[data.usgs]:[])]){
     const rule=SOURCE_RULES[entry.source];if(!rule)continue;
     const list=readStatus(entry)==='AVAILABLE'?pickObservations(entry,rule.kind):[];
     statuses.push({source:entry.source,status:readStatus(entry)==='AVAILABLE'&&!list.length?'EMPTY':readStatus(entry),
      eligibleInputRows:list.length});
     if(rule.node)addEvidence(g,rule.node,list);
     else extraContext.push(...list);
    }
    const profiles=issuerProfiles(commodity,{asOf:today});
    const issuers=profiles.slice(0,5).map(p=>({kind:'SEC_BUSINESS_ACTIVITY',
     source:'SEC_EDGAR_XBRL',sourceStatus:'DISCLOSED_BUSINESS_NOT_EVENT_EXPOSURE',
     label:safe(p.symbol)+' — '+safe(p.company)+' activity: '+safe(p.claim),
     period:p.filingDate,value:null,unit:null,
     sourceUrl:safeLink(p.sourceUrl),publicationTimeVerified:false,dataClass:'ISSUER_ACTIVITY_NO_SHOCK_ESTIMATE'}));
    addEvidence(g,scenario.issuerNode,issuers);
    statuses.push({source:'SEC_DISCLOSED_BUSINESS_ACTIVITIES',status:issuers.length?'AVAILABLE':'EMPTY',eligibleInputRows:issuers.length});
   }
  }
  const summary=summarize(g,statuses);
  const dossier={schemaVersion:2,scenario:{id,title:scenario.title},availability:scenario.currentMode,mode,commodity:scenario.commodities.length?commodity:null,
   regionId:region,year:selectedYear,asOf:null,generatedAt:current.toISOString(),nodes:g.nodes,
   edges:summary.edges,coverage:summary.coverage,priorityGaps:summary.priorityGaps,sourceStatuses:summary.sourceStatus,
   otherContext:extraContext.slice(0,12),
   replayEligibility:'NOT_HISTORICAL_AS_OF_REPLAY',historicalForecastValidated:false,
   causalConclusion:false,issuerImpactVerified:false,estimatedReturn:null,
   limitations:['The diagram displays source-linked observations near hypothesized nodes, not evidence of tested causal links.',
    'USDA, EIA, UN Comtrade and NASA POWER are current/revised or annual-period data and may have long publication lags.',
    'No company-specific earnings sensitivity, fertilizer consumption, facility location or security return is established.']};
  return {...dossier,report:buildReport(dossier)};
 }
 return {catalog,analyze};
}
const response=(res,status,body,plain=false)=>{
 res.writeHead(status,{'Content-Type':plain?'text/plain; charset=utf-8':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(plain?{'Content-Disposition':'attachment; filename="tradescope-economic-transmission.txt"'}:{})});
 res.end(plain?body:JSON.stringify(body));
};
export function createTransmissionDossierApi({service}={}){
 if(!service)throw new TypeError('Transmission evidence service required');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/transmission-dossier/'))return false;
  try{
   if(req.method!=='GET')throw fail('Evidence dossier API is read-only',405);
   const op=url.pathname.slice('/api/transmission-dossier/'.length),params=url.searchParams;
   if(op==='catalog'&&params.size===0){response(res,200,service.catalog());return true;}
   if(!['analysis','report.txt'].includes(op))throw fail('Unknown economic transmission endpoint',404);
   const keys=[...params.keys()];
   if(keys.some(k=>!['id','mode','commodity','region','year','asOf'].includes(k)||params.getAll(k).length!==1)
    ||params.getAll('id').length!==1||params.getAll('mode').length!==1)throw fail('Supply one scenario, mode and optional approved fields');
   const y=params.get('year');
   if(y!==null&&!/^\d{4}$/.test(y))throw fail('Year must be four digits');
   const result=await service.analyze({id:params.get('id'),mode:params.get('mode'),
    commodity:params.get('commodity')||'potash',regionId:params.get('region'),
    year:y===null?null:Number(y),asOf:params.get('asOf')});
   response(res,200,op==='report.txt'?result.report:result,op==='report.txt');
  }catch(e){response(res,[400,404,405,429,502,503,504].includes(e?.status)?e.status:502,
   {error:e?.status?e.message:'Source-backed economic dossier unavailable'});}
  return true;
 };
}
