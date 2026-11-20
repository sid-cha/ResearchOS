import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {graphForTheme} from '../lib/mechanism-radar.mjs';
import {
 DYNAMIC_EXPOSURE_VERSION,EXPOSURE_PROOF_GATES,buildDynamicGraph,
 createDynamicExposureGraph,createDynamicExposureApi
} from '../lib/dynamic-exposure.mjs';

const T0='2026-11-15T12:00:00.000Z';
const T1='2026-11-16T16:00:00.000Z';
const T2='2026-11-16T18:00:00.000Z';
const T3='2026-11-16T20:00:00.000Z';
const FRS='110015778176',CIK='0001045810';
const EVENT='USGS:us500test';
const D='a'.repeat(64);
const scenario=graphForTheme('enso-circulation');
const themeObs={id:'climate-1',title:'Trade winds change in Pacific',
 provider:'NOAA_CPC',sourceUrl:'https://www.cpc.ncep.noaa.gov/example',
 localFirstSeenAt:T1};
const site={registryId:FRS,facilityName:'Reported EPA Site',
 capturedAt:T0,location:[-120,38],providerUrl:'https://ofmpub.epa.gov/example',bodySha256:D};
const company={cik:CIK,companyName:'Nvidia Corporation',
 tickers:['NVDA'],capturedAt:T0,providerUrl:'https://data.sec.gov/submissions/CIK0001045810.json',
 bodySha256:D};
const claim={registryId:FRS,cik:CIK,relationshipType:'POTENTIAL_OPERATOR',
 relationshipId:'crosswalk-1',evidenceUrl:'https://www.sec.gov/Archives/source.htm',
 capturedAt:T2,status:'HUMAN_CLAIM_UNVERIFIED'};
const event={id:EVENT,source:'USGS',title:'Official earthquake record',
 firstObservedAt:T1,location:[-120,38],eventTime:T0};
const candidate={eventId:EVENT,eventSource:'USGS',eventType:'EARTHQUAKE',
 eventFirstSeenAt:T1,facilityId:FRS,facilityName:site.facilityName,
 distanceKm:0,searchRadiusKm:250};
const hazard={id:'footprint-test',provider:'NWS_FLOOD_ALERT',
 registryId:FRS,siteName:site.facilityName,capturedAt:T2,
 sourceUrl:'https://api.weather.gov/alerts/active?point=38,-120',
 bodySha256:D,features:[{
  id:'nws-1',name:'Flood Warning',relation:'INSIDE_REPORTED_POLYGON'
 },{
  id:'nws-2',name:'Distant flood warning',relation:'OUTSIDE_REPORTED_POLYGON'
 },{
  id:'nws-3',name:'Boundary flood warning',relation:'BOUNDARY_UNCERTAIN'
 }]};
const mm={registryId:FRS,eventId:EVENT,eventTitle:'M6.1 earthquake',
 capturedAt:T2,siteName:site.facilityName,siteCoordinates:[-120,38],
 eventDetailUrl:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us500test.geojson',
 detailSha256:D,
 gridUrl:'https://earthquake.usgs.gov/product/shakemap/abc/us/123/download/grid.xml',
 gridSha256:D,
 sample:{status:'USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE',
  estimatedMmi:5.7,nearestDistanceKm:2.3}};
function snapshots(asOf,{withClaim=true,withHazards=true,withMmi=true,withEvents=true,withTheme=true}={}){
 const late=asOf>=T2;
 const params={asOf};
 return structuredClone({
  ...params,
  mechanism:{asOf,ruleVersion:'RADAR',
   results:[{...scenario,observedNodes:withTheme?['climate-observation']:[],
    observations:withTheme&&asOf>=T1?[themeObs]:[]}]},
  climate:{asOf,version:'NUMERIC',metrics:asOf>=T1?[{
   metricId:'RONI',label:'Relative Oceanic Niño Index',
   capturedAt:T1,sourceUrl:'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt',
   bodySha256:D,trend:{latest:{value:0.85,period:'2026-10'}}}]:[]},
  facility:{asOf,ruleVersion:'FACILITY',
   facilities:[site],companies:[company],
   relationships:withClaim&&late?[claim]:[],
   events:withEvents&&asOf>=T1?[event]:[],
   candidates:withEvents&&asOf>=T1?[candidate]:[]},
  entity:{asOf,ruleVersion:'ENTITY',nodes:[
   {id:'lei:12345678901234567890',kind:'LEGAL_ENTITY',lei:'12345678901234567890',
    label:'Test legal entity',capturedAt:T0,source:'https://api.gleif.org/api/v1/lei-records/12345678901234567890'}
   ],edges:[]},
  relationship:{asOf,version:'RELATIONSHIP',
   proposals:withClaim&&late?[{
    relationshipId:'crosswalk-1',textMatchedInPreviouslyCapturedDocument:true
   }]:[]},
  hazard:{asOf,version:'HAZARD',
   snapshots:withHazards&&late?[hazard]:[]},
  shakemap:{asOf,version:'SHAKEMAP',
   results:withMmi&&late?[mm]:[]}
 });
}
function input(asOf,opts={}){
 const a=snapshots(asOf,opts);
 return {...a,themeId:null,registryId:null,eventId:null};
}
function fixture(t,{enabled=true,options={}}={}){
 let requests=0;
 const data=asOf=>snapshots(asOf,options);
 const adapter=(key)=>({view:async({asOf})=>{
  requests++;
  return structuredClone(data(asOf)[key]);
 }});
 const service=createDynamicExposureGraph({
  facilityService:adapter('facility'),entityGraph:adapter('entity'),
  relationshipService:adapter('relationship'),hazardService:adapter('hazard'),
  shakeMapService:adapter('shakemap'),mechanismRadar:adapter('mechanism'),
  climateNumeric:adapter('climate'),enabled,now:()=>T3
 });
 return {service,count:()=>requests};
}
test('v0.48 graph uses evidence-typed stages and zero certified owner/economic-loss claims',()=>{
 const graph=buildDynamicGraph(input(T2));
 assert.equal(graph.version,DYNAMIC_EXPOSURE_VERSION);
 assert(graph.nodes.some(n=>n.type==='MECHANISM_STAGE'));
 assert(graph.nodes.some(n=>n.type==='NUMERIC_SOURCE_OBSERVATION'));
 assert(graph.nodes.some(n=>n.type==='EPA_REPORTED_SITE'));
 assert(graph.nodes.some(n=>n.type==='SEC_REGISTERED_FILER'));
 assert(graph.nodes.some(n=>n.type==='GLEIF_LEGAL_ENTITY'));
 assert(graph.edges.some(e=>e.relation==='CONDITIONAL_MECHANISM'));
 assert(graph.edges.some(e=>e.relation==='OPERATOR_RELATIONSHIP_CLAIM'));
 assert(graph.edges.some(e=>e.relation==='GEOGRAPHIC_PROXIMITY'));
 assert(graph.edges.some(e=>e.relation==='REPORTED_HAZARD_POLYGON_SCREEN'));
 assert(graph.edges.some(e=>e.relation==='USGS_MMI_GRID_SAMPLE'));
 assert.equal(graph.metrics.verifiedCompanyFacilityOwnership,0);
 assert.equal(graph.metrics.verifiedDamage,0);
 assert.equal(graph.metrics.verifiedFinancialOutcomes,0);
 assert.equal(graph.antiAgent.trueIndependentAdjudication,false);
});
test('reported NWS overlap, boundary and outside are never equated with actual damage',()=>{
 const g=buildDynamicGraph(input(T2));
 const paths=g.paths.filter(x=>x.method.startsWith('REPORTED_HAZARD')||
  x.method==='HAZARD_BOUNDARY_UNCERTAIN');
 assert.equal(paths.length,2);
 assert(paths.some(p=>p.method==='REPORTED_HAZARD_OVERLAP'));
 assert(paths.some(p=>p.method==='HAZARD_BOUNDARY_UNCERTAIN'));
 assert(!g.paths.some(p=>p.title.includes('Distant flood')));
 assert(g.edges.some(e=>e.status==='OUTSIDE_POLYGON_NOT_SAFETY_PROOF'));
 assert(g.paths.every(p=>p.verifiedPhysicalDamage===false));
 assert(g.paths.every(p=>p.stockReturnForecast===null));
});
test('USGS model intensity is a review path but never a verified structure or issuer loss',()=>{
 const g=buildDynamicGraph(input(T2));
 const m=g.paths.find(p=>p.method==='MODELED_MMI_NEARBY');
 assert(m);
 assert.equal(m.source.sourceKind,'USGS_SHAKEMAP_GRID');
 assert.equal(m.verifiedPhysicalDamage,false);
 assert.equal(m.measuredEconomicImpact,null);
 assert(m.reviewQuestions.some(q=>q.type==='REAL_WORLD_DAMAGE'));
 const node=g.nodes.find(n=>n.id.startsWith('mmi:'));
 assert.equal(node.estimatedMmi,5.7);
 assert.equal(node.siteDamageVerified,false);
});
test('a human-asserted SEC relationship can create a path but never verified legal ownership',()=>{
 const g=buildDynamicGraph(input(T2));
 assert(g.paths.some(p=>p.issuerNodeId==='cik:'+CIK));
 assert(g.paths.every(p=>p.linkStatus==='HUMAN_ASSERTED_RELATIONSHIP_ONLY'));
 assert(g.paths.every(p=>p.verifiedLegalOwnership===false));
 assert(g.paths.some(p=>p.claimFilingMatched===true));
 assert(g.paths.every(p=>p.reviewQuestions.some(q=>q.type==='REVIEW_INDEPENDENCE')));
 assert(g.paths.every(p=>p.reviewQuestions.some(q=>q.type==='ECONOMIC_MATERIALITY')));
 assert(g.edges.some(e=>e.relation==='OPERATOR_RELATIONSHIP_CLAIM'&&
   e.status==='HUMAN_CLAIM_UNVERIFIED'));
});
test('if no captured human company link, the graph retains site observations but no inferred issuer',()=>{
 const g=buildDynamicGraph(input(T2,{withClaim:false}));
 assert(g.paths.length>0);
 assert(g.paths.every(p=>p.issuerNodeId===null));
 assert(g.paths.every(p=>p.linkStatus==='NO_CAPTURED_ISSUER_LINK'));
 assert(!g.nodes.some(x=>x.id==='cik:'+CIK));
 assert(g.paths.every(p=>p.reviewQuestions.some(q=>q.type==='MISSING_COMPANY_LINK')));
});
test('historical cutoff excludes 2026 source work and never backdates company claim/hazard',()=>{
 const early=buildDynamicGraph(input(T0));
 assert(!early.nodes.some(n=>n.type==='REPORTED_SOURCE_OBSERVATION'));
 assert(!early.nodes.some(n=>n.type==='NUMERIC_SOURCE_OBSERVATION'));
 assert(!early.nodes.some(n=>n.type==='PROVIDER_HAZARD_POLYGON'));
 assert(!early.nodes.some(n=>n.type==='MODELED_SITE_INTENSITY'));
 assert.equal(early.paths.length,0);
 const middle=buildDynamicGraph(input(T1));
 assert(middle.paths.some(p=>p.method==='EVENT_POINT_PROXIMITY'));
 assert(middle.paths.every(p=>p.issuerNodeId===null));
 assert(!middle.paths.some(p=>p.method==='MODELED_MMI_NEARBY'));
 const later=buildDynamicGraph(input(T2));
 assert(later.paths.length>middle.paths.length);
});
test('filtered USGS event never implies causal connection to unrelated wildfire/NWS alert polygon',()=>{
 const g=buildDynamicGraph({...input(T2),eventId:EVENT});
 assert(g.paths.some(x=>x.method==='EVENT_POINT_PROXIMITY'));
 assert(g.paths.some(x=>x.method==='MODELED_MMI_NEARBY'));
 assert(!g.paths.some(x=>x.method==='REPORTED_HAZARD_OVERLAP'));
 assert(!g.nodes.some(x=>x.type==='PROVIDER_HAZARD_POLYGON'));
});
test('filter by facility and mechanism avoids creating arbitrary company or region joins',()=>{
 const g=buildDynamicGraph({...input(T2),themeId:'enso-circulation',registryId:FRS});
 assert(g.nodes.some(n=>n.themeId==='enso-circulation'));
 assert(g.nodes.some(n=>n.type==='SEC_REGISTERED_FILER'));
 assert(!g.edges.some(e=>e.relation==='VERIFIED_FINANCIAL_LOSS'));
 assert(!g.edges.some(e=>e.relation==='ENSO_CAUSED_HAZARD'));
 assert.equal(g.metrics.verifiedFinancialOutcomes,0);
});
test('unavailable source cutoff or future-captured root is rejected rather than silently leaked',()=>{
 const x=input(T1);
 x.mechanism.results[0].observations=[{...themeObs,localFirstSeenAt:T2}];
 assert.throws(()=>buildDynamicGraph(x),{status:502});
 const y=input(T2);y.hazard.asOf=T1;
 assert.throws(()=>buildDynamicGraph(y),{status:502});
 const z=input(T2);z.facility.relationships[0].capturedAt=T3;
 assert.throws(()=>buildDynamicGraph(z),{status:502});
});
test('invalid cutoffs, unbounded source graph, unknown spatial relation fail closed',()=>{
 const one=input(T2);one.asOf='2026-02-30T00:00:00Z';
 assert.throws(()=>buildDynamicGraph(one),{status:400});
 const huge=input(T2);huge.facility.candidates=Array(2501).fill(candidate);
 assert.throws(()=>buildDynamicGraph(huge),{status:502});
 const bad=input(T2);bad.hazard.snapshots[0].features[0].relation='MAYBE_INTERSECTION';
 assert.throws(()=>buildDynamicGraph(bad),{status:502});
});
test('graph replay digest is deterministic for equal inputs, changes when later evidence arrives',()=>{
 const a=buildDynamicGraph(input(T2)),b=buildDynamicGraph(input(T2));
 assert.equal(a.replayDigest,b.replayDigest);
 assert.match(a.replayDigest,/^[a-f0-9]{64}$/);
 assert.notEqual(a.replayDigest,buildDynamicGraph(input(T1)).replayDigest);
});
test('missing mechanism observations show only hypothesis stages, not invented source warnings',()=>{
 const g=buildDynamicGraph(input(T2,{withTheme:false}));
 assert(g.nodes.some(n=>n.type==='MECHANISM_STAGE'));
 assert(!g.nodes.some(n=>n.type==='REPORTED_SOURCE_OBSERVATION'));
 assert(g.edges.filter(e=>e.relation==='CONDITIONAL_MECHANISM').every(e=>
   e.status==='UNVERIFIED_HYPOTHESIS'));
});
test('graph endpoint performs read-only source journal views, never provider capture',async t=>{
 const f=fixture(t),r=await f.service.view({asOf:T2});
 assert.equal(f.count(),7);
 assert(r.metrics.candidateExposurePaths>0);
 assert.equal(r.asOf,T2);
 assert.equal(r.replayDigest.length,64);
 const a=await f.service.view({asOf:T1});
 assert(a.paths.every(p=>p.issuerNodeId===null));
 assert.equal(f.count(),14);
});
test('remote host gate prohibits private graph reads before collector calls',async t=>{
 const f=fixture(t,{enabled:false});
 assert.equal(f.service.catalog().enabled,false);
 await assert.rejects(f.service.view({asOf:T2}),{status:403});
 assert.equal(f.count(),0);
});
test('read-only loopback API supports exact filters, rejects unknown queries and POST',async t=>{
 const f=fixture(t),handle=createDynamicExposureApi({service:f.service});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>new Promise(done=>server.close(done)));
 const root='http://127.0.0.1:'+server.address().port+'/api/dynamic-exposure/';
 assert.equal((await fetch(root+'catalog')).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(T2))).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(T3))).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent('2026-11-17T00:00:00Z'))).status,400);
 assert.equal((await fetch(root+'view?bad=1')).status,400);
 assert.equal((await fetch(root+'view?registryId=../../secret')).status,400);
 assert.equal((await fetch(root+'view?asOf='+T2+'&asOf='+T1)).status,400);
 assert.equal((await fetch(root+'view?themeId=unknown')).status,400);
 assert.equal((await fetch(root+'view',{method:'POST',headers:{'Content-Type':'application/json'},
  body:'{}'})).status,405);
 assert.equal((await fetch(root+'unknown')).status,404);
});
test('UI, graph route, research navigation and static asset allowlist all use v0.48',async()=>{
 const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,server,nav,build,security]=await Promise.all([
  read('dynamic-exposure.html'),read('dynamic-exposure.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs'),read('tests/security.test.mjs')
 ]);
 for(const id of ['exposure-controls','exposureTheme','exposure-network',
  'exposurePath','exposureDiagram','exposure-mechanisms','exposure-adversarial',
  'exposure-sources','exposureExport'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/dynamic-exposure/'));
 assert(js.includes('document.createElementNS'));
 assert(server.includes('createDynamicExposureApi'));
 assert(server.includes('if(await handleDynamicExposure(req,res,u))return;'));
 assert(nav.includes("href:'/dynamic-exposure.html'"));
 assert(build.includes("'dynamic-exposure.js'"));
 assert(security.includes("'dynamic-exposure.js'"));
 assert(EXPOSURE_PROOF_GATES.includes('NO_ISSUER_REVENUE_MATERIALITY_OR_STOCK_CAUSALITY'));
});
