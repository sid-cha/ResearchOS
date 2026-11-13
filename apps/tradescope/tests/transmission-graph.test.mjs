import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createTransmissionGraph,createTransmissionApi} from '../lib/transmission-graph.mjs';

const now=()=>new Date('2026-11-13T12:00:00Z');
const archived=(day='2020-02-13')=>({asOf:'2020-02-15',discussion:{
 source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',issueDate:day,
 sourceUrl:'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_feb2020/ensodisc.html',
 synopsis:'ENSO neutral is favored, no geographic crop forecast proven.',
 publicationClockVerified:false,originalArchiveRevisionVerified:false
}});
const climate={asOf:async()=>archived()};
test('three typed transmission networks are directed, source-linked, bounded and have no fabricated company exposure',async()=>{
 const service=createTransmissionGraph({climate,now});
 const catalog=service.catalog();
 assert.deepEqual(catalog.graphs.slice(0,3).map(g=>g.id),['enso-fertilizer','wildfire-insurance','snow-hydropower']);
 assert.equal(catalog.graphs.length,12);
 assert.equal(catalog.predictionModel,false);
 for(const item of catalog.graphs){
  const graph=await service.graph({id:item.id});
  assert.equal(graph.nodes.length,item.graphNodes);
  assert.equal(graph.edges.length,item.graphEdges);
  assert.equal(graph.coverage.empiricallyValidatedEdges,0);
  assert.equal(graph.coverage.verifiedIssuerExposureEdges,0);
  assert.equal(graph.calibratedForecast,false);
  assert.equal(graph.issuerImpactVerified,false);
  assert.equal(graph.estimatedIssuerReturn,null);
  assert.equal(graph.riskProbability,null);
  assert(!graph.nodes.some(n=>n.observation));
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  assert.equal(nodes.size,graph.nodes.length);
  for(const edge of graph.edges){
   assert(nodes.has(edge.from)&&nodes.has(edge.to));
   assert(nodes.get(edge.from).stage<nodes.get(edge.to).stage);
   assert.equal(edge.evidenceStatus,'HYPOTHESIS_NOT_EMPIRICALLY_VALIDATED');
   assert.equal(edge.estimatedEffect,null);
   assert.equal(edge.lag,'UNMEASURED');
   assert.equal(edge.direction,'CONTEXT_DEPENDENT');
   assert(graph.sources.find(s=>s.id===edge.sourceId&&s.url.startsWith('https://')));
  }
  assert(graph.nodes.some(n=>n.type==='issuer_exposure'&&n.observation===null));
 }
});
test('ENSO graph attaches original issue-dated text only to climate node and never asserts link validity',async()=>{
 const service=createTransmissionGraph({climate,now});
 const data=await service.graph({id:'enso-fertilizer',asOf:'2020-02-15'});
 assert.equal(data.datedEvidence.issueDate,'2020-02-13');
 assert.equal(data.coverage.sourceDatedClimateNodes,1);
 assert.equal(data.coverage.empiricallyValidatedEdges,0);
 assert.equal(data.coverage.quantifiedFinancialImpacts,0);
 const climateNode=data.nodes.find(n=>n.id==='enso_outlook');
 assert.equal(climateNode.observation.issueDate,'2020-02-13');
 assert.equal(climateNode.evidenceStatus,'ISSUE_DATED_DISCUSSION_ONLY');
 assert(data.nodes.filter(n=>n.id!=='enso_outlook').every(n=>n.observation===null));
 assert.equal(data.researchReadiness,'PARTIAL_SOURCE_DATED_INPUT_NO_TRANSMISSION_PROOF');
 data.nodes[0].label='user mutation';
 assert.notEqual((await service.graph({id:'enso-fertilizer'})).nodes[0].label,'user mutation');
});
test('future-dated ENSO issue from upstream is never used as historical evidence',async()=>{
 const service=createTransmissionGraph({climate:{asOf:async()=>archived('2020-03-01')},now});
 const data=await service.graph({id:'enso-fertilizer',asOf:'2020-02-15'});
 assert.equal(data.datedEvidence.status,'NO_ELIGIBLE_ISSUED_EVIDENCE');
 assert.equal(data.coverage.sourceDatedClimateNodes,0);
 assert(data.nodes.every(n=>n.observation===null));
});
test('unavailable climate source remains explicitly unknown with no synthetic exposure',async()=>{
 const service=createTransmissionGraph({climate:{asOf:async()=>{throw Object.assign(Error('provider unavailable'),{status:502})}},now});
 const data=await service.graph({id:'enso-fertilizer',asOf:'2020-02-15'});
 assert.equal(data.datedEvidence.status,'UPSTREAM_EVIDENCE_UNAVAILABLE');
 assert.equal(data.coverage.empiricallyValidatedEdges,0);
 assert.equal(data.estimatedIssuerReturn,null);
});
test('reject non-ENSO dated lookups, invalid historical dates, arbitrary ids',async()=>{
 const svc=createTransmissionGraph({climate,now});
 await assert.rejects(svc.graph({id:'not-known'}),e=>e.status===404);
 await assert.rejects(svc.graph({id:'wildfire-insurance',asOf:'2020-02-15'}),e=>e.status===400);
 await assert.rejects(svc.graph({id:'enso-fertilizer',asOf:'2026-11-14'}),e=>e.status===400);
 await assert.rejects(svc.graph({id:'enso-fertilizer',asOf:'2020-02-30'}),e=>e.status===400);
});
test('transmission API remains read-only, validates query fields and returns no secret data',async t=>{
 const api=createTransmissionApi({service:createTransmissionGraph({climate,now})});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const base='http://127.0.0.1:'+server.address().port;
 const catalog=await fetch(base+'/api/transmission/catalog');
 assert.equal(catalog.status,200);
 assert.equal((await catalog.json()).graphs.length,12);
 const result=await fetch(base+'/api/transmission/graph?id=enso-fertilizer&asOf=2020-02-15');
 assert.equal(result.status,200);
 const graph=await result.json();
 assert.equal(graph.coverage.sourceDatedClimateNodes,1);
 assert.equal(graph.coverage.empiricallyValidatedEdges,0);
 assert.equal((await fetch(base+'/api/transmission/graph?id=enso-fertilizer&id=wildfire-insurance')).status,400);
 assert.equal((await fetch(base+'/api/transmission/graph?id=enso-fertilizer&url=https://evil.invalid')).status,400);
 assert.equal((await fetch(base+'/api/transmission/graph?id=wrong')).status,404);
 assert.equal((await fetch(base+'/api/transmission/catalog',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/transmission/missing')).status,404);
});
