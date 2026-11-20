import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createScenarioRegistry,SCENARIO_REGISTRY,validateScenarioSpec} from '../lib/scenario-registry.mjs';
import {createTransmissionGraph} from '../lib/transmission-graph.mjs';
import {createTransmissionDossier,createTransmissionDossierApi} from '../lib/transmission-dossier.mjs';

const now=()=>new Date('2026-11-13T18:00:00Z');
test('twelve versioned scenario definitions pass strict ontology and retain three pilot pathways',()=>{
 const c=SCENARIO_REGISTRY.catalog();
 assert.equal(c.scenarioCount,12);
 assert.equal(c.scenarios.length,12);
 assert.deepEqual(c.scenarios.slice(0,3).map(x=>x.id),
  ['enso-fertilizer','wildfire-insurance','snow-hydropower']);
 assert.equal(c.scenarios.filter(x=>x.currentMode==='TEMPLATE_ONLY').length,7);
 assert.equal(c.scenarios.filter(x=>x.currentMode==='DATA_PARTIAL').length,2);
 assert.equal(c.scenarios.filter(x=>x.currentMode==='RESEARCH_CONTEXT').length,3);
 assert(c.eventClasses.includes('health'));
 assert(c.eventClasses.includes('geopolitical'));
 for(const x of c.scenarios){
  const spec=SCENARIO_REGISTRY.get(x.id);
  assert.equal(validateScenarioSpec(spec),true);
  assert(spec.nodes.every(n=>n.length===5));
  assert(spec.edges.every(e=>e.length===5));
  assert.equal(spec.regions.length>0,true);
 }
 assert.equal(SCENARIO_REGISTRY.catalog({eventClass:'energy'}).scenarios.length,1);
 assert.equal(SCENARIO_REGISTRY.catalog({availability:'TEMPLATE_ONLY'}).scenarios.length,7);
 assert.equal(SCENARIO_REGISTRY.catalog({industry:'Insurance'}).scenarios.length>=1,true);
});
test('registry cannot be mutated by caller and fails closed on invalid graphs',()=>{
 const legacy=SCENARIO_REGISTRY.get('enso-fertilizer');
 legacy.nodes[0][1]='user mutation';
 assert.notEqual(SCENARIO_REGISTRY.get('enso-fertilizer').nodes[0][1],'user mutation');
 const duplicate=[SCENARIO_REGISTRY.get('enso-fertilizer'),SCENARIO_REGISTRY.get('enso-fertilizer')];
 assert.throws(()=>createScenarioRegistry({specs:duplicate}),/Duplicate scenario ID/);
 const unknown=SCENARIO_REGISTRY.get('energy-gas-shock');
 unknown.edges[0][2]='unregistered_node';
 assert.throws(()=>validateScenarioSpec(unknown),/Unsupported scenario edge/);
 const outOfOrder=SCENARIO_REGISTRY.get('energy-gas-shock');
 outOfOrder.edges[0][1]='energy_issuer';
 assert.throws(()=>validateScenarioSpec(outOfOrder),/Unsupported scenario edge/);
 const source=SCENARIO_REGISTRY.get('energy-gas-shock');
 source.edges[0][4]='invented_provider';
 assert.throws(()=>validateScenarioSpec(source),/unsupported source/i);
 assert.throws(()=>SCENARIO_REGISTRY.catalog({eventClass:'unknown'}),/Unsupported event class/);
});
test('new graph families compile from curated registry with all edge effects unverified',async()=>{
 const graph=createTransmissionGraph({now});
 for(const id of ['drought-agriculture','energy-gas-shock','sanctions-export','hurricane-infrastructure',
  'earthquake-facility','critical-minerals','maritime-chokepoint','credit-stress','public-health-supply']){
  const g=await graph.graph({id});
  assert(g.nodes.length>=4);assert(g.edges.length>=3);
  assert(g.sources.every(x=>x.url.startsWith('https://')));
  assert(g.edges.every(x=>x.estimatedEffect===null&&x.lag==='UNMEASURED'));
  assert.equal(g.coverage.empiricallyValidatedEdges,0);
 }
 await assert.rejects(graph.graph({id:'energy-gas-shock',asOf:'2020-02-15'}),e=>e.status===400);
});
test('seven research templates never contact real providers or claim any measured effect',async()=>{
 let called=0;
 const graph=createTransmissionGraph({now});
 const d=createTransmissionDossier({graph,now,regional:{monthly:async()=>{called++;throw Error('should not fetch');}},
  fundamentals:{eia:async()=>{called++;throw Error('should not fetch');},snapshot:async()=>{called++;throw Error('should not fetch');}}});
 const result=await d.analyze({id:'sanctions-export',mode:'current'});
 assert.equal(result.availability,'TEMPLATE_ONLY');
 assert.equal(result.coverage.contextEvidenceRows,0);
 assert.equal(result.coverage.validatedEdges,0);
 assert.equal(result.sourceStatuses.every(x=>x.status==='NOT_CONNECTED'),true);
 assert.equal(result.issuerImpactVerified,false);
 assert.equal(result.estimatedReturn,null);
 assert.equal(called,0);
 assert(result.report.includes('Scenario availability: TEMPLATE_ONLY'));
});
test('EIA partial gas pathway attaches actual bounded provider observations but never estimates issuer impact',async()=>{
 let calls=0;
 const graph=createTransmissionGraph({now});
 const d=createTransmissionDossier({graph,now,fundamentals:{eia:async({indicatorId})=>{
  calls++;assert.equal(indicatorId,'henry_hub_spot');return {
   source:'EIA_API_V2',unit:'USD per million Btu',fetchedAt:'2026-11-13T18:00:00Z',
   observations:[{period:'2026-09',value:2.9,unit:'USD per million Btu'}]};
 }}});
 const result=await d.analyze({id:'energy-gas-shock',mode:'current'});
 assert.equal(result.availability,'DATA_PARTIAL');
 assert.equal(calls,1);
 assert.equal(result.nodes.find(x=>x.id==='gas_price').researchInputs[0].value,2.9);
 assert.equal(result.coverage.contextNodes,1);
 assert.equal(result.coverage.validatedEdges,0);
 assert.equal(result.coverage.verifiedIssuerImpacts,0);
});
test('energy missing EIA key is not zero gas cost or zero issuer impact',async()=>{
 const d=createTransmissionDossier({graph:createTransmissionGraph({now}),now,
  fundamentals:{eia:async()=>{throw Object.assign(new Error('secret never leak'),{status:503});}}});
 const r=await d.analyze({id:'energy-gas-shock',mode:'current'});
 assert.equal(r.sourceStatuses[0].status,'NOT_CONFIGURED');
 assert.equal(r.coverage.contextEvidenceRows,0);
 assert(!JSON.stringify(r).includes('secret never leak'));
});
test('drought uses pre-registered point rainfall as retrospective context, never as drought severity',async()=>{
 const d=createTransmissionDossier({graph:createTransmissionGraph({now}),now,
  regional:{monthly:async({regionId,year})=>{
   assert.equal(regionId,'california-foothills');assert.equal(year,2025);
   return {months:[{month:'202501',precipitationMmPerDay:3.4,temperatureC:20}],
    provenance:{fetchedAt:'2026-11-13T18:00:00Z'},
    sourceDocumentation:'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/'};
  }}});
 const result=await d.analyze({id:'drought-agriculture',mode:'current',year:2025});
 const x=result.nodes.find(x=>x.id==='drought_outlook');
 assert.equal(x.researchInputs[0].dataClass,'CURRENT_REVISED_MONTHLY_NOT_HISTORICAL_AS_OF');
 assert.equal(result.coverage.validatedEdges,0);
 assert(!result.historicalForecastValidated);
});
test('all scenarios support schema-constrained read-only graph API and no template historic leakage',async t=>{
 const api=createTransmissionDossierApi({service:createTransmissionDossier({
  graph:createTransmissionGraph({now}),now})});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const root='http://127.0.0.1:'+server.address().port+'/api/transmission-dossier/';
 const catalog=await (await fetch(root+'catalog')).json();
 assert.equal(catalog.scenarios.length,12);
 assert.equal((await fetch(root+'analysis?id=sanctions-export&mode=current')).status,200);
 assert.equal((await fetch(root+'analysis?id=sanctions-export&mode=historical&asOf=2020-02-15')).status,400);
 assert.equal((await fetch(root+'analysis?id=credit-stress&mode=current&url=https://evil.invalid')).status,400);
});
test('transmission UI includes dynamic scenario filters and syntax-valid graph code',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const html=await fs.readFile(path.join(root,'transmission-lab.html'),'utf8');
 const js=await fs.readFile(path.join(root,'transmission-lab.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert(html.includes('id="eventClass"'));
 assert(html.includes('id="scenarioSearch"'));
 assert(html.includes('id="scenarioMaturity"'));
 assert(js.includes('catalog.scenarios.filter'));
 assert(js.includes('TEMPLATE_ONLY'));
});
