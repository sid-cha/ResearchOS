import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createTransmissionGraph} from '../lib/transmission-graph.mjs';
import {createTransmissionDossier,createTransmissionDossierApi} from '../lib/transmission-dossier.mjs';
const now=()=>new Date('2026-11-13T12:00:00Z');
const archive={asOf:async(date)=>({asOf:date,discussion:{
 source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',issueDate:'2020-02-13',sourceUrl:
 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_feb2020/ensodisc.html',
 synopsis:'ENSO neutral is favored; no measured agricultural outcome.',
 publicationClockVerified:false,originalArchiveRevisionVerified:false}})};
const graph=()=>createTransmissionGraph({climate:archive,now});
const regional={monthly:async({regionId,year})=>({
 region:{id:regionId},year,source:'NASA_POWER_MONTHLY_CURRENT_REVISION',
 sourceDocumentation:'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/',
 months:[{month:'202501',precipitationMmPerDay:2.3,temperatureC:26.5},
  {month:'202502',precipitationMmPerDay:1.5,temperatureC:25},
  {month:'202503',precipitationMmPerDay:null,temperatureC:24}],
 provenance:{fetchedAt:'2026-11-13T12:00:00Z'}})};
const fundamentals={snapshot:async({commodity})=>({
 commodity,fetchedAt:'2026-11-13T12:00:00Z',sources:[
 {source:'GDELT_DOC_COMMODITY_EXPANDED',status:'AVAILABLE',results:[
  {title:'Regional potash shipping speculation',sourceUrl:'https://news.example.com/fake',
   providerFirstSeenAt:'2026-11-01T00:00:00Z'}]},
 {source:'EIA_API_V2',status:'AVAILABLE',unit:'USD/MMBtu',fetchedAt:'2026-11-13T12:00:00Z',
  observations:[{period:'2026-09',value:3.1,unit:'USD/MMBtu'},{period:'2026-10',value:null,unit:'USD/MMBtu'}]},
 {source:'UN_COMTRADE_PREVIEW',status:'AVAILABLE',rows:[
  {period:'2025',tradeValueUsd:12000000,reporter:'United States',flow:'M',
   commodityGroup:'potassic fertilizers',sourceUrl:'https://comtradeplus.un.org/en'}]},
 {source:'USDA_FAS_PSD_API',status:'AVAILABLE',records:[
  {marketYear:'2025/26',attribute:'PRODUCTION',value:300,unit:'million tonnes',crop:'corn',
   country:'Brazil',sourceUrl:'https://apps.fas.usda.gov/psdonline/app/index.html#/app/advQuery'},
  {marketYear:'2025/26',attribute:'ENDING STOCKS',value:50,unit:'million tonnes',crop:'corn',country:'Brazil'}]}
 ],usgs:{source:'USGS_MINERAL_STATISTICS_CAPTURE',status:'AVAILABLE',captures:[{
  capture:{officialUrl:'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-potash.pdf',
   statistics:[{period:'2025',value:46000,unit:'thousand tonnes',attribute:'Global potash production'}]},
  contentHash:'a'.repeat(64)}]}
})};
const issuerProfiles=()=>[{symbol:'MOS',company:'Mosaic',claim:'Potash business',
 filingDate:'2026-02-27',sourceUrl:'https://www.sec.gov/Archives/edgar/data/1285785/10-K'}];
const make=(overrides={})=>createTransmissionDossier({graph:graph(),fundamentals,regional,issuerProfiles,now,...overrides});
test('catalog limits scope and says all graph edges are hypotheses',()=>{
 const d=make().catalog();
 assert.equal(d.scenarios.length,12);
 assert.equal(d.historicalAsOfOnly,'enso-fertilizer');
 assert.deepEqual(d.scenarios[0].commodities,['potash','urea','phosphate']);
 assert(d.restrictions.some(x=>x.includes('Current-revision')));
});
test('current ENSO merges period-dated source context without upgrading any link or claiming market outcomes',async()=>{
 const d=await make().analyze({id:'enso-fertilizer',mode:'current',commodity:'potash',regionId:'argentina-pampas',year:2025});
 assert.equal(d.schemaVersion,1);
 assert.equal(d.coverage.validatedEdges,0);
 assert.equal(d.coverage.verifiedIssuerImpacts,0);
 assert.equal(d.coverage.measuredCausalEffects,0);
 assert.equal(d.historicalForecastValidated,false);
 assert.equal(d.estimatedReturn,null);
 assert.equal(d.replayEligibility,'NOT_HISTORICAL_AS_OF_REPLAY');
 assert(d.coverage.contextNodes>=5);
 assert.equal(d.nodes.find(x=>x.id==='rainfall').researchInputs.length,2);
 assert.equal(d.nodes.find(x=>x.id==='crop').researchInputs[0].label,'Brazil corn production');
 assert.equal(d.nodes.find(x=>x.id==='fert_market').researchInputs[0].value,12000000);
 assert.equal(d.nodes.find(x=>x.id==='fert_industry').researchInputs[0].value,3.1);
 assert.equal(d.nodes.find(x=>x.id==='fert_issuer').researchInputs[0].source,'SEC_EDGAR_XBRL');
 assert(d.edges.every(e=>e.verification==='NOT_VALIDATED'&&e.estimatedEffect===null));
 assert(d.report.includes('0 empirically verified edges'));
 assert(d.report.includes('EIA_API_V2'));
 assert(d.report.includes('## Research gaps'));
 assert(!JSON.stringify(d).includes('https://news.example.com'));
});
test('historical mode uses only issued NOAA CPC text, forbids revised current meteorology and economic data',async()=>{
 let revisions=0,reads=0;
 const s=make({fundamentals:{snapshot:async()=>{reads++;throw Error('must not call');}},
  regional:{monthly:async()=>{revisions++;throw Error('must not call');}}});
 const d=await s.analyze({id:'enso-fertilizer',mode:'historical',asOf:'2020-02-15',regionId:'brazil-south'});
 assert.equal(d.mode,'historical');assert.equal(d.coverage.contextEvidenceRows,0);
 assert.equal(d.coverage.contextNodes,1);
 assert.equal(d.nodes.find(x=>x.id==='enso_outlook').observation.issueDate,'2020-02-13');
 assert.equal(d.sourceStatuses.length,1);
 assert.equal(d.sourceStatuses[0].source,'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION');
 assert.equal(d.issuerImpactVerified,false);assert.equal(d.estimatedReturn,null);
 assert.equal(revisions,0);assert.equal(reads,0);
 assert(!d.report.includes('Henry Hub gas observation'));
});
test('unavailable sources and missing keys are disclosed as unavailable/NOT_CONFIGURED, not as zero impacts',async()=>{
 const service=make({regional:{monthly:async()=>{throw Object.assign(Error('upstream secret'),{status:502});}},
  fundamentals:{snapshot:async()=>({sources:[{source:'EIA_API_V2',status:'NOT_CONFIGURED'},
   {source:'USDA_FAS_PSD_API',status:'UNAVAILABLE'}],usgs:{source:'USGS_MINERAL_STATISTICS_CAPTURE',
    status:'AVAILABLE',captures:[]}})},issuerProfiles:()=>[]});
 const d=await service.analyze({id:'enso-fertilizer',mode:'current',year:2025});
 assert.equal(d.coverage.contextEvidenceRows,0);
 assert.equal(d.coverage.validatedEdges,0);
 assert(d.sourceStatuses.some(x=>x.source==='EIA_API_V2'&&x.status==='NOT_CONFIGURED'));
 assert(d.sourceStatuses.some(x=>x.source==='NASA_POWER_MONTHLY_CURRENT_REVISION'&&x.status==='UNAVAILABLE'));
 assert(!JSON.stringify(d).includes('upstream secret'));
});
test('wildfire scope attaches retrospective point context but never assumes insurers or damage',async()=>{
 let snap=0;
 const service=make({fundamentals:{snapshot:async()=>{snap++;throw Error('unexpected');}}});
 const d=await service.analyze({id:'wildfire-insurance',mode:'current',regionId:'california-foothills',year:2025});
 assert.equal(snap,0);
 assert(d.nodes.find(x=>x.id==='fire_weather').researchInputs.length>0);
 assert.equal(d.coverage.verifiedIssuerImpacts,0);
 assert(d.nodes.find(x=>x.id==='claims').researchInputs===undefined);
 assert.equal(d.edges.find(x=>x.id==='w03').verification,'NOT_VALIDATED');
});
test('snowpack scenario does NOT mislabel NASA rainfall as measured snow water equivalent',async()=>{
 const d=await make().analyze({id:'snow-hydropower',mode:'current',regionId:'colorado-high-country',year:2025});
 assert.equal(d.coverage.contextNodes,0);
 assert.equal(d.nodes.find(x=>x.id==='snow_observation').observation,null);
 assert(d.otherContext.length>0);
 assert(d.otherContext[0].dataClass==='CURRENT_REVISED_MONTHLY_NOT_HISTORICAL_AS_OF');
 assert.equal(d.issuerImpactVerified,false);
});
test('reject invalid graph, impossible day, mismatched region, future periods, unsupported combos and data leakage',async()=>{
 const s=make();
 await assert.rejects(s.analyze({id:'evil',mode:'current'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'current',regionId:'outside'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'current',commodity:'silver'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'current',year:2026}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'current',year:2025,asOf:'2025-01-01'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'wildfire-insurance',mode:'historical',asOf:'2020-02-15'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'historical',asOf:'2020-02-30'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'historical',asOf:'2027-01-01'}),e=>e.status===400);
 await assert.rejects(s.analyze({id:'enso-fertilizer',mode:'historical',asOf:'2020-02-15',year:2020}),e=>e.status===400);
});
test('bounded read-only API serves supported scenarios and plain-text reports with no cookie or token in public output',async t=>{
 const handler=createTransmissionDossierApi({service:make()});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port+'/api/transmission-dossier/';
 assert.equal((await fetch(root+'catalog')).status,200);
 const d=await (await fetch(root+'analysis?id=enso-fertilizer&mode=current&region=argentina-pampas&year=2025')).json();
 assert.equal(d.coverage.validatedEdges,0);
 assert.equal((await fetch(root+'analysis?id=enso-fertilizer&mode=historical&asOf=2020-02-15')).status,200);
 const txt=await fetch(root+'report.txt?id=enso-fertilizer&mode=historical&asOf=2020-02-15');
 assert.equal(txt.status,200);assert.match(txt.headers.get('content-type'),/text\/plain/);
 assert.match(await txt.text(),/Economic Transmission Evidence Dossier/);
 assert.equal((await fetch(root+'analysis?id=enso-fertilizer&mode=current&id=wildfire-insurance')).status,400);
 assert.equal((await fetch(root+'analysis?id=enso-fertilizer&mode=current&url=https://evil.invalid')).status,400);
 assert.equal((await fetch(root+'analysis?id=enso-fertilizer')).status,400);
 assert.equal((await fetch(root+'missing')).status,404);
 assert.equal((await fetch(root+'catalog',{method:'POST'})).status,405);
});
test('original transmission UI validates and ships matching static controls and sourced client endpoints',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,css,js]=await Promise.all(['transmission-lab.html','transmission-lab.css','transmission-lab.js']
  .map(name=>fs.readFile(path.join(root,name),'utf8')));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'transmission-lab.js'}));
 for(const id of ['scenario','mode','commodity','region','year','asOf','analyze','export','pathways',
  'nodeInspector','sources','gaps','edges','totalNodes','coveredNodes','inputRows','verifiedEdges','status'])
  assert(html.includes('id="'+id+'"'),'Missing UI node '+id);
 assert(html.includes('href="/transmission-lab.css"'));
 assert(html.includes('src="/transmission-lab.js"'));
 assert(css.includes('.node.evidenced'));
 assert(js.includes('/api/transmission-dossier/'));
 assert(!js.includes('Math.random'));
});
