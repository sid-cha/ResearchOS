import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeSources} from './lib/sources.mjs';
import {createIntelligenceApi} from './lib/api.mjs';
import {createCaseApi} from './lib/case-api.mjs';
import {createAssistantApi} from './lib/assistant-api.mjs';
import {createMarketStream} from './lib/alpaca-stream.mjs';
import {createMarketDelivery} from './lib/market-sse.mjs';
import {createMarketCapture,createMarketCaptureApi} from './lib/market-capture.mjs';
import {createResearchApi} from './lib/research-api.mjs';
import {createCaseStore} from './lib/cases.mjs';
import {createRegulatoryApi} from './lib/regulatory-api.mjs';
import {createFilingReader} from './lib/filing-intelligence.mjs';
import {classifyCorporateEvent,createCorporateAlertStore} from './lib/corporate-intelligence.mjs';
import {createEventArchive} from './lib/event-archive.mjs';
import {createResearchUniverse} from './lib/research-universe.mjs';
import {createDiscoveryApi} from './lib/discovery-api.mjs';
import {createMonitorChartApi} from './lib/monitor-chart-api.mjs';
import {createIntradayChartApi} from './lib/intraday-chart.mjs';
import {createCrisisAtlasApi} from './lib/crisis-atlas.mjs';
import {createMacroVintage,createMacroVintageApi} from './lib/macro-vintage.mjs';
import {createHistoricalBacktest,createHistoricalBacktestApi} from './lib/historical-backtest.mjs';
import {createLongHistoryMarket} from './lib/long-history-market.mjs';
import {createCpcEnsoApi} from './lib/climate-enso.mjs';
import {createTransmissionGraph,createTransmissionApi} from './lib/transmission-graph.mjs';
import {createTransmissionDossier,createTransmissionDossierApi} from './lib/transmission-dossier.mjs';
import {createRegionalClimateApi} from './lib/regional-climate.mjs';
import {createCommodityWorkbench,createCommodityApi} from './lib/commodity-platform.mjs';
import {createCommodityFundamentals,createCommodityFundamentalsApi} from './lib/commodity-fundamentals.mjs';
import {createMarketHub,createMarketHubApi} from './lib/market-hub.mjs';
import {createProviderControl,createProviderControlApi} from './lib/provider-control.mjs';
import {createFredExplorer,createFredExplorerApi} from './lib/fred-explorer.mjs';
import {createEvidenceLedger,createEvidenceLedgerApi} from './lib/evidence-ledger.mjs';
import {createExposureRegistry,createGeoExposureService,createGeoExposureApi} from './lib/geo-exposure.mjs';
import {createEpaFrsLookup,createFacilityVerificationApi} from './lib/epa-frs.mjs';
import {createSecRegistrantLookup} from './lib/sec-registrant.mjs';
import {createEventIntelligenceApi} from './lib/event-intelligence.mjs';
import {createGlobalEventCollector,createGlobalEventApi} from './lib/global-event-collector.mjs';
import {createPrecursorEngine,createPrecursorApi} from './lib/precursor-intelligence.mjs';
import {createResearchAgentDesk,createResearchAgentDeskApi} from './lib/research-agent-desk.mjs';
import {createResearchValidation,createResearchValidationApi} from './lib/research-validation.mjs';
import {createOutcomeEvidenceArchive,createOutcomeEvidenceApi} from './lib/outcome-evidence.mjs';
import {createFacilityExposure,createFacilityExposureApi} from './lib/facility-exposure.mjs';
import {createRelationshipVerifier,createRelationshipVerificationApi} from './lib/relationship-verification.mjs';
import {createEntityGraph,createEntityGraphApi} from './lib/entity-graph.mjs';
import {createCorroborationDesk,createCorroborationCaseApi} from './lib/corroboration-case.mjs';
import {createHazardFootprints,createHazardFootprintApi} from './lib/hazard-footprints.mjs';
import {createShakeMapSampler,createShakeMapApi} from './lib/usgs-shakemap.mjs';
import {createCorporatePrecursor,createCorporatePrecursorApi} from './lib/corporate-precursor.mjs';
import {createMechanismRadar,createMechanismApi} from './lib/mechanism-radar.mjs';
import {createClimateNumeric,createClimateNumericApi} from './lib/climate-numeric.mjs';
import {createSourceMonitor,createSourceMonitorApi} from './lib/source-monitor.mjs';
import {createCpcEnsoArchive} from './lib/climate-enso.mjs';
import {createExposureCasebook,createExposureProofService,createExposureProofApi} from './lib/exposure-proof.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || '8000');
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.APCA_API_KEY_ID;
const SECRET = process.env.APCA_API_SECRET_KEY;
const ORIGIN = 'https://data.alpaca.markets';
const DEFAULT_SYMBOLS = ['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
let cachedSnapshot = {expires:0, value:null};
const directorySources=makeSources();
const universeFile=process.env.RESEARCH_UNIVERSE_PATH||path.join(ROOT,'.local-data','universe.json');
const sharedUniverse=createResearchUniverse({filename:universeFile,searchDirectory:directorySources.searchInstruments,resolveDirectory:directorySources.resolveInstrument});
const sharedSources=makeSources({instrumentResolver:symbol=>sharedUniverse.getInstrument(symbol)});
const handleIntelligence = createIntelligenceApi(sharedSources);
const defaultDiscoveryApi=createDiscoveryApi({universe:sharedUniverse,sources:sharedSources});
const defaultMonitorChartApi=createMonitorChartApi({sources:sharedSources});
const defaultIntradayChartApi=createIntradayChartApi({sources:sharedSources});
const defaultCrisisAtlasApi=createCrisisAtlasApi();
const defaultCpcEnsoApi=createCpcEnsoApi();
const defaultTransmissionApi=createTransmissionApi();
const defaultRegionalClimateApi=createRegionalClimateApi();
const commodityFile=process.env.COMMODITY_PILOT_STORE_PATH||path.join(ROOT,'.local-data','commodity-pilot.json');
const fundamentalsFile=process.env.COMMODITY_FUNDAMENTALS_STORE_PATH||path.join(ROOT,'.local-data','commodity-fundamentals.json');
const defaultCommodityWorkbench=createCommodityWorkbench({filename:commodityFile,fundamentals:createCommodityFundamentals({usgsFile:fundamentalsFile,officialDocuments:()=>defaultCommodityWorkbench.ledger.list(null)})});
const defaultFundamentalsApi=createCommodityFundamentalsApi({service:defaultCommodityWorkbench.fundamentals});
const evidenceLedgerEnabled=process.env.RESEARCH_EVIDENCE_LEDGER_ENABLED==='true'&&
 ['127.0.0.1','localhost','::1'].includes(HOST);
const defaultEvidenceLedger=evidenceLedgerEnabled?createEvidenceLedger({
 filename:path.join(ROOT,'.local-data','evidence-journal.jsonl')}):null;
const defaultEvidenceLedgerApi=createEvidenceLedgerApi({ledger:defaultEvidenceLedger});
const geoRegistryEnabled=process.env.RESEARCH_GEO_ASSET_REGISTRY_ENABLED==='true'&&
 ['127.0.0.1','localhost','::1'].includes(HOST);
const defaultGeoExposureService=createGeoExposureService({
 registry:geoRegistryEnabled?createExposureRegistry({
 filename:path.join(ROOT,'.local-data','issuer-asset-claims.json')}):null
});
const defaultGeoExposureApi=createGeoExposureApi({service:defaultGeoExposureService,writeEnabled:geoRegistryEnabled});
const defaultEpaLookup=createEpaFrsLookup();
const defaultSecRegistrant=createSecRegistrantLookup();
const defaultFacilityVerificationApi=createFacilityVerificationApi({
 lookup:defaultEpaLookup,assets:()=>defaultGeoExposureService.listing()
});
const proofEnabled=process.env.RESEARCH_EXPOSURE_PROOF_ENABLED==='true'&&
 geoRegistryEnabled&&['127.0.0.1','localhost','::1'].includes(HOST);
const defaultExposureProofApi=createExposureProofApi({
 enabled:proofEnabled,service:proofEnabled?createExposureProofService({
  store:createExposureCasebook({filename:path.join(ROOT,'.local-data','exposure-proof-journal.jsonl')}),
  assets:()=>defaultGeoExposureService.listing(),frs:defaultEpaLookup,sec:defaultSecRegistrant
 }):null
});
const defaultTransmissionDossierApi=createTransmissionDossierApi({service:createTransmissionDossier({
 graph:createTransmissionGraph(),fundamentals:defaultCommodityWorkbench.fundamentals}),ledger:defaultEvidenceLedger});
const defaultCommodityApi=createCommodityApi({service:defaultCommodityWorkbench});
const defaultMarketHub=createMarketHub({companyFacts:sharedSources.companyFacts,validateSymbol:async symbol=>{
 try{await sharedUniverse.getInstrument(symbol);return true;}catch{return false;}
}});
const defaultMarketHubApi=createMarketHubApi({service:defaultMarketHub});
const defaultFredExplorerApi=createFredExplorerApi({service:createFredExplorer({ledger:defaultEvidenceLedger})});
const defaultProviderControl=createProviderControl({probes:{
 alpaca:async()=>{const r=await defaultMarketHub.series(['SPY'],'1M');const v=r.values.SPY;
  return {count:v.bars.length,observationDate:v.asOf};},
 sec:async()=>{const r=await sharedSources.companyFacts('AAPL');
  const facts=r?.facts?.['us-gaap']||r?.facts?.facts?.['us-gaap']||null;
  return {count:facts?Object.keys(facts).length:null};},
 fred:async()=>{const r=await defaultMarketHub.macro('DGS10',1);
  return {count:r.history.length,observationDate:r.latest?.date||null};},
 eia:async()=>{const r=await defaultCommodityWorkbench.fundamentals.eia({indicatorId:'henry_hub_spot'});
  return {count:r.observations.filter(x=>x.status==='AVAILABLE').length,observationDate:r.observations.at(0)?.period+'-01'};},
 usda:async()=>{const r=await defaultCommodityWorkbench.fundamentals.usda({crop:'corn'});
  return {count:r.records.length};},
 comtrade:async()=>{const r=await defaultCommodityWorkbench.fundamentals.comtrade({commodity:'potash',flow:'M',reporter:'842'});
  return {count:r.rows.length};},
 gdelt:async()=>{const r=await defaultCommodityWorkbench.fundamentals.gdelt({commodity:'potash'});
  return {count:r.results.length};},
 'federal-register':async()=>{const r=await defaultCommodityWorkbench.feed('potash');
  return {count:r.results.length};}
}});
const defaultProviderControlApi=createProviderControlApi({service:defaultProviderControl});
const sharedMacroVintage=createMacroVintage();
const defaultMacroVintageApi=createMacroVintageApi({service:sharedMacroVintage});
const sharedLongHistoryMarket=createLongHistoryMarket();
const defaultBacktestApi=createHistoricalBacktestApi({service:createHistoricalBacktest({macro:sharedMacroVintage,marketSources:directorySources,longHistoryMarket:sharedLongHistoryMarket})});
const caseFile = process.env.CASE_STORE_PATH || path.join(ROOT,'.local-data','cases.json');
const defaultCaseStore = createCaseStore(caseFile);
const researchFile=process.env.RESEARCH_STORE_PATH||path.join(ROOT,'.local-data','research.json');
const monitorFile=process.env.MONITOR_STORE_PATH||path.join(ROOT,'.local-data','monitors.json');
const corporateFile=process.env.CORPORATE_STORE_PATH||path.join(ROOT,'.local-data','corporate-alerts.json');
const archiveFile=process.env.EVENT_ARCHIVE_PATH||path.join(ROOT,'.local-data','event-revisions.json');
const defaultRegulatoryApi=createRegulatoryApi({sources:sharedSources,filingReader:createFilingReader(),classifyCorporateEvent,
 corporateStore:createCorporateAlertStore({filename:corporateFile}),eventArchive:createEventArchive({filename:archiveFile}),
 caseStore:defaultCaseStore,
 captureEnabled:process.env.REGULATORY_LOCAL_CAPTURE_ENABLED==='true'});

function json(res,status,body){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});
  res.end(JSON.stringify(body));
}
function isoDateValid(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false; const [y,m,day]=d.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,day));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===day;}
function nextUTCDate(d){const dt=new Date(`${d}T00:00:00Z`);dt.setUTCDate(dt.getUTCDate()+1);return dt.toISOString().slice(0,10);}
async function alpacaGet(endpoint){
  if(!KEY||!SECRET) throw Object.assign(new Error('Credentials not set. Add Alpaca paper-data keys to .env and restart the server.'),{status:503});
  const url = new URL(endpoint,ORIGIN);
  if(url.origin!==ORIGIN)throw new Error('Invalid upstream URL');
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(url,{method:'GET',headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET,'Accept':'application/json'},signal:ctrl.signal});
    // Never echo arbitrary provider error bodies: they can contain credentials.
    if(!r.ok){await r.body?.cancel();throw Object.assign(new Error(r.status===401||r.status===403?'Market data authentication or entitlement failed':`Market data request failed (HTTP ${r.status})`),{status:r.status===429?429:502});}
    const raw=await r.text();let payload;try{payload=JSON.parse(raw)}catch{throw Object.assign(new Error('Invalid market data response'),{status:502});}
    return payload;
  }catch(e){if(e.name==='AbortError')throw Object.assign(new Error('Market data provider timed out'),{status:504});throw e;}finally{clearTimeout(timeout)}
}
const numberOrNull=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const quantityOrNull=value=>numberOrNull(value)!==null&&value>=0?value:null;
const venueOrNull=value=>typeof value==='string'&&/^[A-Za-z0-9@#*?._:+/-]{1,32}$/.test(value)?value:null;
function publicTrade(symbol,t){if(!t||numberOrNull(t.p)===null||t.p<=0||typeof t.t!=='string')return null;return {symbol,sourceId:typeof t.i==='string'||Number.isSafeInteger(t.i)?String(t.i):null,time:t.t,price:t.p,quantity:quantityOrNull(t.s),venue:venueOrNull(t.x),conditions:Array.isArray(t.c)?t.c.filter(c=>typeof c==='string'&&/^[A-Za-z0-9@#*?._:+/-]{1,32}$/.test(c)).slice(0,32):null};}
function publicQuote(symbol,q){if(!q||typeof q.t!=='string')return null;return {symbol,time:q.t,bid:numberOrNull(q.bp),ask:numberOrNull(q.ap),bidSize:quantityOrNull(q.bs),askSize:quantityOrNull(q.as),bidVenue:venueOrNull(q.bx),askVenue:venueOrNull(q.ax)};}
function sanitizeSnapshots(snapshots){const result={};for(const sym of DEFAULT_SYMBOLS){const a=snapshots?.[sym];if(!a)continue;result[sym]={trade:publicTrade(sym,a.latestTrade),quote:publicQuote(sym,a.latestQuote),minuteBar:a.minuteBar?{time:a.minuteBar.t,open:a.minuteBar.o,high:a.minuteBar.h,low:a.minuteBar.l,close:a.minuteBar.c,volume:a.minuteBar.v}:null,previousClose:Number(a.prevDailyBar?.c)||null};}return result;}

const defaultEventIntelligenceApi=createEventIntelligenceApi();
const defaultGlobalEvents=createGlobalEventCollector({
 filename:process.env.GLOBAL_EVENT_STORE_PATH||path.join(ROOT,'.local-data','global-events.json'),
 enabled:process.env.GLOBAL_EVENT_COLLECTION_ENABLED==='true'&&['127.0.0.1','localhost','::1'].includes(HOST),
 autoPoll:process.env.GLOBAL_EVENT_AUTO_POLL_ENABLED==='true',
 intervalMs:Math.max(60000,Math.min(3600000,(Number(process.env.GLOBAL_EVENT_POLL_SECONDS)||300)*1000))
});

export function createServer({marketStream = createMarketStream({key:KEY,secret:SECRET,symbols:DEFAULT_SYMBOLS}), deliveryOptions = {}, researchApi = createResearchApi({filename:researchFile,monitorFilename:monitorFile,sources:sharedSources}), intelligenceApi = handleIntelligence, caseStore = defaultCaseStore, regulatoryApi = defaultRegulatoryApi, discoveryApi=defaultDiscoveryApi, monitorChartApi=defaultMonitorChartApi, intradayChartApi=defaultIntradayChartApi, crisisAtlasApi=defaultCrisisAtlasApi, macroVintageApi=defaultMacroVintageApi,backtestApi=defaultBacktestApi,climateApi=defaultCpcEnsoApi,transmissionApi=defaultTransmissionApi,regionalClimateApi=defaultRegionalClimateApi,commodityApi=defaultCommodityApi,commodityWorkbench=defaultCommodityWorkbench,fundamentalsApi=defaultFundamentalsApi,marketHubApi=defaultMarketHubApi,providerControlApi=defaultProviderControlApi,transmissionDossierApi=defaultTransmissionDossierApi,fredExplorerApi=defaultFredExplorerApi,evidenceLedgerApi=defaultEvidenceLedgerApi,geoExposureApi=defaultGeoExposureApi,facilityVerificationApi=defaultFacilityVerificationApi,exposureProofApi=defaultExposureProofApi,eventIntelligenceApi=defaultEventIntelligenceApi,captureService=null,globalEvents=defaultGlobalEvents,precursorApi=null,agentDesk=null,agentValidation=null,outcomeArchive=null,facilityExposure=null,relationshipVerifier=null,entityGraph=null} = {}){
 const capture=captureService||createMarketCapture({stream:marketStream,
  dir:process.env.MARKET_CAPTURE_PATH||path.join(ROOT,'.local-data','market-captures'),
  enabled:process.env.MARKET_CAPTURE_ENABLED==='true'&&['127.0.0.1','localhost','::1'].includes(HOST),
  rightsAcknowledged:process.env.MARKET_CAPTURE_RIGHTS_CONFIRMED==='true',
  onIdle:()=>{if(delivery.getClientCount()===0)marketStream.stop();}
 });
 const delivery=createMarketDelivery({...deliveryOptions,stream:marketStream,keepAlive:()=>capture.isRecording()});
 const captureApi=createMarketCaptureApi({service:capture,host:HOST});
 const globalEventApi=createGlobalEventApi({collector:globalEvents,host:HOST});
 const handlePrecursors=precursorApi||createPrecursorApi({engine:createPrecursorEngine({collector:globalEvents})});
 const researchDesk=agentDesk||createResearchAgentDesk({collector:globalEvents,
  filename:process.env.RESEARCH_AGENT_STORE_PATH||path.join(ROOT,'.local-data','agent-desk-runs.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleAgentDesk=createResearchAgentDeskApi({desk:researchDesk,host:HOST});
 const validation=agentValidation||createResearchValidation({desk:researchDesk,
  filename:process.env.RESEARCH_VALIDATION_STORE_PATH||path.join(ROOT,'.local-data','agent-validation-journal.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleAgentValidation=createResearchValidationApi({service:validation,host:HOST});
 const officialArchive=outcomeArchive||createOutcomeEvidenceArchive({validation,
  filename:process.env.OUTCOME_EVIDENCE_STORE_PATH||path.join(ROOT,'.local-data','outcome-evidence-journal.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleOutcomeEvidence=createOutcomeEvidenceApi({service:officialArchive,host:HOST});
 const facilityService=facilityExposure||createFacilityExposure({collector:globalEvents,
  filename:process.env.FACILITY_EXPOSURE_STORE_PATH||path.join(ROOT,'.local-data','facility-exposure.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleFacilityExposure=createFacilityExposureApi({service:facilityService,host:HOST});
 const relationshipService=relationshipVerifier||createRelationshipVerifier({
  facilityService,
  filename:process.env.RELATIONSHIP_VERIFICATION_STORE_PATH||
   path.join(ROOT,'.local-data','relationship-verifications.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleRelationshipVerification=createRelationshipVerificationApi({service:relationshipService,host:HOST});
 const entityGraphService=entityGraph||createEntityGraph({facilityService,
  filename:process.env.ENTITY_GRAPH_STORE_PATH||
   path.join(ROOT,'.local-data','entity-graph.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleEntityGraph=createEntityGraphApi({graph:entityGraphService,host:HOST});
 const caseDesk=createCorroborationDesk({
  facilityService,entityGraph:entityGraphService,relationshipVerifier:relationshipService,
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleCorroborationCase=createCorroborationCaseApi({desk:caseDesk});
 const hazardService=createHazardFootprints({facilityService,
  filename:process.env.HAZARD_FOOTPRINT_STORE_PATH||
   path.join(ROOT,'.local-data','hazard-footprints.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleHazardFootprints=createHazardFootprintApi({service:hazardService,host:HOST});
 const shakeMapService=createShakeMapSampler({facilityService,globalEvents,
  filename:process.env.USGS_SHAKEMAP_STORE_PATH||
   path.join(ROOT,'.local-data','usgs-shakemap-observations.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)});
 const handleShakeMap=createShakeMapApi({service:shakeMapService,host:HOST});
 const corporatePrecursor=createCorporatePrecursor({
  filename:process.env.CORPORATE_PRECURSOR_STORE_PATH||
   path.join(ROOT,'.local-data','corporate-precursor.json'),
  newsSources:sharedSources,
  enabled:['127.0.0.1','localhost','::1'].includes(HOST),
  rightsAcknowledged:process.env.CORPORATE_PRECURSOR_RIGHTS_CONFIRMED==='true'&&
   process.env.CORPORATE_PRECURSOR_CAPTURE_ENABLED==='true'
 });
 const handleCorporatePrecursor=createCorporatePrecursorApi({monitor:corporatePrecursor,host:HOST});
 const mechanismRadar=createMechanismRadar({
  filename:process.env.MECHANISM_RADAR_STORE_PATH||
   path.join(ROOT,'.local-data','mechanism-radar.json'),
  cpc:createCpcEnsoArchive(),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST),
  rightsAcknowledged:process.env.MECHANISM_RADAR_CAPTURE_ENABLED==='true'&&
   process.env.MECHANISM_RADAR_RIGHTS_CONFIRMED==='true'
 });
 const handleMechanismRadar=createMechanismApi({radar:mechanismRadar,host:HOST});
 const climateNumeric=createClimateNumeric({
  filename:process.env.CLIMATE_NUMERIC_STORE_PATH||
   path.join(ROOT,'.local-data','climate-numeric.json'),
  enabled:['127.0.0.1','localhost','::1'].includes(HOST),
  rightsAcknowledged:process.env.CLIMATE_NUMERIC_CAPTURE_ENABLED==='true'&&
   process.env.CLIMATE_NUMERIC_RIGHTS_CONFIRMED==='true'
 });
 const handleClimateNumeric=createClimateNumericApi({service:climateNumeric,host:HOST});
 const sourceMonitor=createSourceMonitor({
  filename:process.env.SOURCE_MONITOR_STORE_PATH||
   path.join(ROOT,'.local-data','source-monitor.json'),
  climateNumeric,corporatePrecursor,mechanismRadar,
  enabled:['127.0.0.1','localhost','::1'].includes(HOST)&&
   process.env.SOURCE_MONITOR_ENABLED==='true',
  rightsAcknowledged:process.env.SOURCE_MONITOR_RIGHTS_CONFIRMED==='true'
 });
 const handleSourceMonitor=createSourceMonitorApi({monitor:sourceMonitor,host:HOST});
 const handleCases=createCaseApi({store:caseStore}),handleAssistant=createAssistantApi({store:caseStore});
 const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${HOST}:${PORT}`);
    if(delivery.handle(req,res,u))return;
    if(await captureApi(req,res,u))return;
    if(await monitorChartApi(req,res,u))return;
    if(await intradayChartApi(req,res,u))return;
    if(await crisisAtlasApi(req,res,u))return;
    if(await climateApi(req,res,u))return;
    if(await globalEventApi(req,res,u))return;
    if(await handlePrecursors(req,res,u))return;
    if(await handleAgentDesk(req,res,u))return;
    if(await handleAgentValidation(req,res,u))return;
    if(await handleOutcomeEvidence(req,res,u))return;
    if(await handleFacilityExposure(req,res,u))return;
    if(await handleRelationshipVerification(req,res,u))return;
    if(await handleEntityGraph(req,res,u))return;
    if(await handleCorroborationCase(req,res,u))return;
    if(await handleHazardFootprints(req,res,u))return;
    if(await handleShakeMap(req,res,u))return;
    if(await handleCorporatePrecursor(req,res,u))return;
    if(await handleMechanismRadar(req,res,u))return;
    if(await handleClimateNumeric(req,res,u))return;
    if(await handleSourceMonitor(req,res,u))return;
    if(await eventIntelligenceApi(req,res,u))return;
    if(await exposureProofApi(req,res,u))return;
    if(await facilityVerificationApi(req,res,u))return;
    if(await geoExposureApi(req,res,u))return;
    if(await evidenceLedgerApi(req,res,u))return;
    if(await transmissionDossierApi(req,res,u))return;
    if(await transmissionApi(req,res,u))return;
    if(await regionalClimateApi(req,res,u))return;
    if(await providerControlApi(req,res,u))return;
    if(await fundamentalsApi(req,res,u))return;
    if(await marketHubApi(req,res,u))return;
    if(await commodityApi(req,res,u))return;
    if(await fredExplorerApi(req,res,u))return;
    if(await macroVintageApi(req,res,u))return;
    if(await backtestApi(req,res,u))return;
    if(await discoveryApi(req,res,u))return;
    if(await regulatoryApi(req,res,u))return;
    if(await researchApi(req,res,u))return;
    if(await handleCases(req,res,u))return;
    if(await handleAssistant(req,res,u))return;
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
    if(await intelligenceApi(req,res,u))return;
    if(u.pathname==='/api/health'){json(res,200,{ready:true,configured:Boolean(KEY&&SECRET),feed:'iex',pollSeconds:15,source:'ALPACA_IEX',marketData:marketStream.getHealth(),marketCapture:capture.state(),marketDataDisclaimer:'Single-venue IEX data; not the consolidated US market.'});return;}
    if(u.pathname==='/api/live'){
      if(Date.now()<cachedSnapshot.expires&&cachedSnapshot.value){json(res,200,{...cachedSnapshot.value,cacheHit:true});return;}
      const symbols=DEFAULT_SYMBOLS.join(',');const response=await alpacaGet(`/v2/stocks/snapshots?symbols=${symbols}&feed=iex`);
      const output={source:'ALPACA_IEX',mode:'LATEST_AVAILABLE',transport:'snapshot-polling',provider:'alpaca',feed:'iex',coverage:'single-venue',fetchedAt:new Date().toISOString(),snapshots:sanitizeSnapshots(response)};
      cachedSnapshot={expires:Date.now()+14000,value:output};json(res,200,{...output,cacheHit:false});return;
    }
    if(u.pathname==='/api/history'){
      const symbol=(u.searchParams.get('symbol')||'AAPL').toUpperCase();const day=u.searchParams.get('date')||'';const feed=(u.searchParams.get('feed')||'iex').toLowerCase();
      if(!DEFAULT_SYMBOLS.includes(symbol)||!isoDateValid(day)||!['iex','sip'].includes(feed)){json(res,400,{error:'Choose a supported symbol and valid YYYY-MM-DD date'});return;}
      const today=new Date().toISOString().slice(0,10);
      if(day>today||day<'2016-01-01'||(feed==='sip'&&day>=today)){json(res,400,{error:'Historical date is outside supported range'});return;}
      const upstream=await alpacaGet(`/v2/stocks/${symbol}/trades?feed=${feed}&start=${day}T00%3A00%3A00Z&end=${nextUTCDate(day)}T00%3A00%3A00Z&sort=desc&limit=1000`);
      const trades=(upstream.trades||[]).map(t=>publicTrade(symbol,t)).filter(Boolean).reverse();
      json(res,200,{source:feed==='sip'?'ALPACA_SIP_HISTORY':'ALPACA_IEX',mode:'HISTORICAL_TRADES',feed,symbol,date:day,fetchedAt:new Date().toISOString(),trades,hasMore:Boolean(upstream.next_page_token),limit:1000});return;
    }
    const ALLOWED={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/live-adapter.js':'live-adapter.js','/event-workspace.js':'event-workspace.js','/intelligence.css':'intelligence.css','/cases.css':'cases.css','/case-workspace.js':'case-workspace.js','/assistant-workspace.js':'assistant-workspace.js','/theme-controls.js':'theme-controls.js','/terminal-theme.css':'terminal-theme.css','/workspace-nav.js':'workspace-nav.js','/research-workspace.js':'research-workspace.js','/research.css':'research.css','/research-operations.js':'research-operations.js','/research-operations.css':'research-operations.css','/discovery-workspace.js':'discovery-workspace.js','/discovery-workspace.css':'discovery-workspace.css','/monitor-candles.js':'monitor-candles.js','/monitor-candles.css':'monitor-candles.css','/crisis-workspace.js':'crisis-workspace.js','/crisis-workspace.css':'crisis-workspace.css','/commodity.html':'commodity.html','/commodity.js':'commodity.js','/commodity.css':'commodity.css','/market-hub.html':'market-hub.html','/market-hub.js':'market-hub.js','/market-hub.css':'market-hub.css','/source-control.html':'source-control.html','/source-control.js':'source-control.js','/source-control.css':'source-control.css','/transmission-lab.html':'transmission-lab.html','/transmission-lab.js':'transmission-lab.js','/transmission-lab.css':'transmission-lab.css','/fred-research.html':'fred-research.html','/fred-research.js':'fred-research.js','/fred-research.css':'fred-research.css','/evidence-ledger.html':'evidence-ledger.html','/evidence-ledger.js':'evidence-ledger.js','/evidence-ledger.css':'evidence-ledger.css','/geo-exposure.html':'geo-exposure.html','/geo-exposure.js':'geo-exposure.js','/geo-exposure.css':'geo-exposure.css','/exposure-review.html':'exposure-review.html','/exposure-review.js':'exposure-review.js','/exposure-review.css':'exposure-review.css','/event-portal.html':'event-portal.html','/event-portal.js':'event-portal.js','/event-portal.css':'event-portal.css','/hierarchy-navigation.js':'hierarchy-navigation.js','/hierarchy-navigation.css':'hierarchy-navigation.css','/market-capture.html':'market-capture.html','/market-capture.js':'market-capture.js','/market-capture.css':'market-capture.css','/agent-desk.html':'agent-desk.html','/agent-desk.js':'agent-desk.js','/agent-desk.css':'agent-desk.css','/agent-validation.html':'agent-validation.html','/agent-validation.js':'agent-validation.js','/agent-validation.css':'agent-validation.css','/facility-exposure.html':'facility-exposure.html','/facility-exposure.js':'facility-exposure.js','/facility-exposure.css':'facility-exposure.css','/relationship-verification.html':'relationship-verification.html','/relationship-verification.js':'relationship-verification.js','/relationship-verification.css':'relationship-verification.css','/entity-graph.html':'entity-graph.html','/entity-graph.js':'entity-graph.js','/entity-graph.css':'entity-graph.css','/corroboration-case.html':'corroboration-case.html','/corroboration-case.js':'corroboration-case.js','/corroboration-case.css':'corroboration-case.css','/hazard-footprints.html':'hazard-footprints.html','/hazard-footprints.js':'hazard-footprints.js','/hazard-footprints.css':'hazard-footprints.css','/usgs-shakemap.html':'usgs-shakemap.html','/usgs-shakemap.js':'usgs-shakemap.js','/usgs-shakemap.css':'usgs-shakemap.css','/corporate-precursor.html':'corporate-precursor.html','/corporate-precursor.js':'corporate-precursor.js','/corporate-precursor.css':'corporate-precursor.css','/mechanism-radar.html':'mechanism-radar.html','/mechanism-radar.js':'mechanism-radar.js','/mechanism-radar.css':'mechanism-radar.css','/climate-numeric.html':'climate-numeric.html','/climate-numeric.js':'climate-numeric.js','/climate-numeric.css':'climate-numeric.css','/source-monitor.html':'source-monitor.html','/source-monitor.js':'source-monitor.js','/source-monitor.css':'source-monitor.css'};
    const file=ALLOWED[u.pathname];if(!file){json(res,404,{error:'Not found'});return;}
    const data=await fs.readFile(path.join(ROOT,file));
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(data);
  }catch(e){const status=e.status||500;json(res,status,{error:status===500?'Local data service error':e.message});}
 });
 // Close delivery before HTTP shutdown because SSE connections are long-lived.
 server.closeMarketData=()=>delivery.close();
 server.closeCapture=()=>capture.close();
 server.closeGlobalEvents=()=>globalEvents.close?.();
 server.closeAgentDesk=()=>researchDesk.close?.();
 server.closeAgentValidation=()=>validation.close?.();
 server.closeOutcomeEvidence=()=>officialArchive.close?.();
 server.closeFacilityExposure=()=>facilityService.close?.();
 server.closeRelationshipVerification=()=>relationshipService.close?.();
 server.closeEntityGraph=()=>entityGraphService.close?.();
 server.closeHazardFootprints=()=>hazardService.close?.();
 server.closeShakeMap=()=>shakeMapService.close?.();
 server.closeCorporatePrecursor=()=>corporatePrecursor.close?.();
 server.closeMechanismRadar=()=>mechanismRadar.close?.();
 server.closeClimateNumeric=()=>climateNumeric.close?.();
 server.closeSourceMonitor=()=>sourceMonitor.close?.();
 server.closeResearch=()=>{researchApi.close?.();commodityWorkbench.close?.();};
 server.once('listening',async()=>{try{globalEvents.start?.();}catch{console.error('Global event collector could not start.');}
  try{await researchApi.start?.();}catch{console.error('Local research monitoring could not start; check the monitor store.');}
  try{await commodityWorkbench.start?.();}catch{console.error('Local commodity pilot scheduler could not start; check its store.');}
  try{await sourceMonitor.start();}catch{console.error('Local source monitoring did not start; inspect private journal and opt-in settings.');}});
 server.once('close',()=>{delivery.close();void capture.close();void globalEvents.close?.();void researchDesk.close?.();void validation.close?.();void officialArchive.close?.();void facilityService.close?.();void relationshipService.close?.();void entityGraphService.close?.();void hazardService.close?.();void shakeMapService.close?.();void corporatePrecursor.close?.();void mechanismRadar.close?.();void climateNumeric.close?.();void sourceMonitor.close?.();server.closeResearch();});
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createServer();
  server.listen(PORT,HOST,()=>{console.log(`TradeScope local: http://${HOST}:${PORT}`);console.log(`Alpaca credentials: ${KEY&&SECRET?'configured':'missing (demo is still available)'}`);});
  const shutdown=async()=>{server.closeResearch();await server.closeGlobalEvents();await server.closeSourceMonitor();await server.closeClimateNumeric();await server.closeMechanismRadar();await server.closeCorporatePrecursor();await server.closeShakeMap();await server.closeHazardFootprints();await server.closeEntityGraph();await server.closeRelationshipVerification();await server.closeFacilityExposure();await server.closeOutcomeEvidence();await server.closeAgentValidation();await server.closeAgentDesk();await server.closeCapture();server.closeMarketData();server.close();};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
export {isoDateValid,sanitizeSnapshots,publicTrade,publicQuote};
