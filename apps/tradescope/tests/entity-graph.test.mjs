import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 normalizeLei,normalizeGleifParent,normalizeGleifRelationship,fetchLei,fetchGleifParent,fetchGleifRelationship,
 createEntityGraph,createEntityGraphApi,buildGraph,ENTITY_GRAPH_SCHEMA,ENTITY_GRAPH_FLAGS
} from '../lib/entity-graph.mjs';

const LEI='5493001KJTIIGC8Y1R12',PARENT='213800QVXQAZLPZH1234',CIK='0000000123';
const FRS='110015778176';
const T0='2026-11-14T00:00:00.000Z',T1='2026-11-15T00:00:00.000Z',
 T2='2026-11-15T01:00:00.000Z',T3='2026-11-15T02:00:00.000Z',
 T4='2026-11-15T03:00:00.000Z';
const leiRecord=(id=LEI,name='Example Global Holdings')=>({
 data:{type:'lei-records',id,attributes:{entity:{legalName:{name},
  jurisdiction:'US-DE',legalAddress:{country:'US'}},registration:{status:'ISSUED'}}}});
const parentRecord=()=>leiRecord(PARENT,'Example Consolidating Parent');
const level2Record=(parent=PARENT)=>({data:{type:'relationship-records',id:'source-relationship-1',
 attributes:{relationship:{startNode:{id:LEI,type:'LEI'},endNode:{id:parent,type:'LEI'},
  relationshipType:'IS_DIRECTLY_CONSOLIDATED_BY',
  relationshipPeriods:[{type:'RELATIONSHIP_PERIOD',startDate:'2025-01-01',endDate:null},
   {type:'ACCOUNTING_PERIOD',startDate:'2025-01-01',endDate:'2025-12-31'}]},
 registration:{status:'PUBLISHED',corroborationLevel:'FULLY_CORROBORATED'}}}});
const frsJson=()=>({FRSFacilities:{FRSFacility:[{
 RegistryId:FRS,FacilityName:'EPA Test Facility',Latitude83:'38.2',
 Longitude83:'-120.4',StateAbbr:'CA',CityName:'Test City'}]}});
const secJson=()=>({cik:123,name:'Example SEC Filer',tickers:['EXM']});
function jsonResponse(data,{status=200,contentType='application/vnd.api+json',size=null}={}){
 const bytes=Buffer.from(JSON.stringify(data));
 return {ok:status===200,status,headers:{get:k=>k==='content-type'?contentType:
  k==='content-length'?String(size??bytes.length):null},body:Readable.from([bytes])};
}
async function fixture(t,{enabled=true,maxEntries=240}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-entity-graph-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'entity-graph.json'),requests=[];
 let now=T1,entityName='Example Global Holdings',parent404=false,level2Parent=PARENT,level2Missing=false;
 const fetchImpl=async(url,config)=>{
  requests.push({url,config});
  if(url.includes('/direct-parent-relationship'))return level2Missing?
   jsonResponse({errors:[{status:'404'}]},{status:404}):
   jsonResponse(level2Record(level2Parent));
  if(url.includes('/direct-parent'))return parent404?
   jsonResponse({errors:[{status:'404'}]},{status:404}):jsonResponse(parentRecord());
  if(url.includes('api.gleif.org'))return jsonResponse(leiRecord(LEI,entityName));
  if(url.includes('ofmpub.epa.gov'))return jsonResponse(frsJson(),{contentType:'application/json'});
  if(url.includes('data.sec.gov'))return jsonResponse(secJson(),{contentType:'application/json'});
  throw Error('Request did not use an approved fixed provider URL');
 };
 const facilityService={view:async({asOf})=>({
  companies:asOf<T1?[]:[{cik:CIK,companyName:'Example SEC Filer',
   tickers:['EXM'],capturedAt:T1}],
  facilities:asOf<T1?[]:[{registryId:FRS,facilityName:'EPA Test Facility',
   capturedAt:T1,location:[-120.4,38.2]}],
  relationships:asOf<T1?[]:[{registryId:FRS,cik:CIK,relationshipId:'crosswalk-00000000-0000-4000-8000-000000000001',
   relationshipType:'POTENTIAL_OWNER',capturedAt:T1,
   evidenceUrl:'https://www.sec.gov/Archives/edgar/data/123/x'}],
  events:[],candidates:[]
 })};
 const graph=createEntityGraph({facilityService,filename,fetchImpl,enabled,maxEntries,
  now:()=>now});
 return {graph,facilityService,filename,requests,fetchImpl,
  setNow:x=>{now=x;},setEntityName:x=>{entityName=x;},
  setParent404:x=>{parent404=x;},setLevel2Parent:x=>{level2Parent=x;},
  setLevel2Missing:x=>{level2Missing=x;}};
}
const link=()=>({lei:LEI,cik:'123',evidenceUrl:'https://api.gleif.org/api/v1/lei-records/'+LEI,
 rationale:'This is a candidate identifier association only; a separate authoritative CIK to LEI source is required.'});
test('GLEIF normalizer preserves separate LEI identity, status and jurisdiction with no ownership claim',()=>{
 const r=normalizeLei(leiRecord(),LEI);
 assert.equal(r.lei,LEI);
 assert.equal(r.name,'Example Global Holdings');
 assert.equal(r.legalCountry,'US');
 assert.equal(r.legalOwnershipVerified,false);
 assert.equal(r.secCikVerified,false);
 assert.throws(()=>normalizeLei(leiRecord(PARENT),LEI),{status:502});
 assert.throws(()=>normalizeLei({data:{id:LEI,attributes:{}}},LEI),{status:502});
});
test('GLEIF direct accounting-consolidating parent is not legal-owner evidence; missing is unknown',()=>{
 const parent=normalizeGleifParent({json:parentRecord()},LEI);
 assert.equal(parent.childLei,LEI);
 assert.equal(parent.parentLei,PARENT);
 assert.equal(parent.relationshipType,'GLEIF_REPORTED_DIRECT_ACCOUNTING_CONSOLIDATION');
 assert.equal(parent.legalShareOwnershipVerified,false);
 assert.equal(parent.relationshipEffectiveDatesVerified,false);
 const none=normalizeGleifParent({notFound:true},LEI);
 assert.equal(none.parentLei,null);
 assert.equal(none.status,'NO_GLEIF_PARENT_RECORD_RETURNED');
 assert.throws(()=>normalizeGleifParent({json:leiRecord(LEI)},LEI),{status:502});
});
test('official GLEIF GET uses fixed source, bounded streaming, no redirect or credentials',async()=>{
 const calls=[];
 const fetchImpl=async(url,config)=>{calls.push({url,config});return jsonResponse(leiRecord());};
 const entry=await fetchLei(LEI,{fetchImpl});
 assert.equal(entry.lei,LEI);
 assert.match(entry.bodySha256,/^[a-f0-9]{64}$/);
 assert.equal(calls[0].url,'https://api.gleif.org/api/v1/lei-records/'+LEI);
 assert.equal(calls[0].config.redirect,'error');
 assert.equal(calls[0].config.method,'GET');
 const parent=await fetchGleifParent(LEI,{fetchImpl:async()=>jsonResponse(parentRecord())});
 assert.equal(parent.parentLei,PARENT);
 await assert.rejects(fetchLei('https://localhost/abc',{fetchImpl:async()=>{throw Error('must not fetch');}}),{status:400});
 await assert.rejects(fetchLei(LEI,{fetchImpl:async()=>jsonResponse(leiRecord(),{
  contentType:'text/html'})}),{status:502});
 await assert.rejects(fetchLei(LEI,{fetchImpl:async()=>jsonResponse(leiRecord(),{
  size:999999})}),{status:413});
});
test('captures LEI and parent as independent official observations, without promoting any legal ownership',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.graph.capturedParent({lei:LEI}),{status:409});
 const id=await h.graph.capturedLei({lei:LEI});
 assert.equal(id.deduplicated,false);
 assert.equal(id.record.type,'LEI');
 assert.equal(id.record.value.bodySha256.length,64);
 assert.equal((await h.graph.capturedLei({lei:LEI})).deduplicated,true);
 h.setNow(T2);
 const parent=await h.graph.capturedParent({lei:LEI});
 assert.equal(parent.record.type,'DIRECT_PARENT');
 assert.equal(parent.record.value.parentLei,PARENT);
 assert.equal(parent.record.value.legalShareOwnershipVerified,false);
 const view=await h.graph.view();
 assert.equal(view.inventory.leis,1);
 assert.equal(view.inventory.reportedParents,1);
 assert.equal(view.verifiedCompanyFacilityOwnershipEdges,0);
 assert.equal(view.edges.some(e=>e.type==='REPORTED_ACCOUNTING_CONSOLIDATION'),true);
 assert.equal(view.nodes.some(n=>n.kind==='GLEIF_PARENT_REFERENCE'),true);
 assert(view.antiAgentFlags.includes('ACCOUNTING_CONSOLIDATION_IS_NOT_LEGAL_OWNERSHIP'));
});
test('no source reported parent produces no invented parent edge',async t=>{
 const h=await fixture(t);
 h.setParent404(true);
 await h.graph.capturedLei({lei:LEI});
 const parent=await h.graph.capturedParent({lei:LEI});
 assert.equal(parent.record.value.status,'NO_GLEIF_PARENT_RECORD_RETURNED');
 assert.equal((await h.graph.view()).edges.filter(x=>x.type==='REPORTED_ACCOUNTING_CONSOLIDATION').length,0);
});
test('CIK↔LEI candidate requires both separately captured ids and exact official identity source',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.graph.candidateLink(link()),{status:409});
 await h.graph.capturedLei({lei:LEI});
 await assert.rejects(h.graph.candidateLink({...link(),evidenceUrl:'https://attacker.invalid/lei'}),{status:400});
 const r=await h.graph.candidateLink(link());
 assert.equal(r.record.value.status,'ANALYST_IDENTIFIER_CANDIDATE_UNVERIFIED');
 assert.equal(r.record.value.secCikLeiBindingVerified,false);
 assert.equal((await h.graph.candidateLink(link())).deduplicated,true);
 const graph=await h.graph.view();
 assert.equal(graph.inventory.identifierCandidates,1);
 assert.equal(graph.edges.filter(x=>x.type==='OPERATOR_IDENTIFIER_CANDIDATE').length,1);
 assert.equal(graph.edges.find(x=>x.type==='OPERATOR_IDENTIFIER_CANDIDATE').identityVerified,false);
});
test('as-of earlier than provider capture cannot contain later LEI, parent or CIK candidate',async t=>{
 const h=await fixture(t);
 await h.graph.capturedLei({lei:LEI});
 h.setNow(T2);await h.graph.capturedParent({lei:LEI});
 h.setNow(T3);await h.graph.candidateLink(link());
 assert.equal((await h.graph.view({asOf:T0})).nodes.length,0);
 const first=await h.graph.view({asOf:T1});
 assert.equal(first.inventory.leis,1);
 assert.equal(first.inventory.reportedParents,0);
 assert.equal(first.inventory.identifierCandidates,0);
 const second=await h.graph.view({asOf:T2});
 assert.equal(second.inventory.reportedParents,1);
 assert.equal(second.inventory.identifierCandidates,0);
 assert.equal((await h.graph.view({asOf:T3})).inventory.identifierCandidates,1);
 await assert.rejects(h.graph.view({asOf:T4}),{status:400});
});
test('source contract diagnostic checks only three fixed official services; never persists a result automatically',async t=>{
 const h=await fixture(t);
 const a=await h.graph.checkSource({source:'EPA_FRS',id:FRS});
 const b=await h.graph.checkSource({source:'SEC_EDGAR',id:'123'});
 const c=await h.graph.checkSource({source:'GLEIF_LEI',id:LEI});
 assert.deepEqual([a.provider,b.provider,c.provider],['EPA_FRS','SEC_EDGAR','GLEIF_LEI']);
 assert(a.ok&&b.ok&&c.ok);
 assert.equal(a.persisted,false);
 assert.equal(b.verifiedLegalOwnership,false);
 assert.equal((await h.graph.view()).inventory.leis,0);
 assert.equal(h.requests.length,3);
 assert(h.requests[0].url.includes('registry_id='+FRS));
 assert(h.requests[1].url==='https://data.sec.gov/submissions/CIK'+CIK+'.json');
 assert(h.requests[2].url==='https://api.gleif.org/api/v1/lei-records/'+LEI);
 await assert.rejects(h.graph.checkSource({source:'ARBITRARY',id:'12'}),{status:400});
 await assert.rejects(h.graph.checkSource({source:'EPA_FRS',id:'localhost'}),{status:400});
});
test('source revisions create additional journal entries and historical earlier snapshot retains prior name',async t=>{
 const h=await fixture(t);
 await h.graph.capturedLei({lei:LEI});
 h.setEntityName('Revised GLEIF Legal Entity Name');
 h.setNow(T2);await h.graph.capturedLei({lei:LEI});
 assert.equal((await h.graph.view({asOf:T1})).nodes.find(x=>x.id==='lei:'+LEI).label,'Example Global Holdings');
 assert.equal((await h.graph.view({asOf:T2})).nodes.find(x=>x.id==='lei:'+LEI).label,'Revised GLEIF Legal Entity Name');
});
test('graph journal restart verifies hash chain and fails closed after modified content',async t=>{
 const h=await fixture(t);
 await h.graph.capturedLei({lei:LEI});
 await h.graph.close();
 const reopened=createEntityGraph({facilityService:h.facilityService,filename:h.filename,
  now:()=>T3,fetchImpl:async()=>{throw Error('NO NETWORK ON READ');}});
 assert.equal((await reopened.view()).inventory.leis,1);
 await reopened.close();
 const raw=await readFile(h.filename,'utf8');
 await writeFile(h.filename,raw.replace('Example Global Holdings','Tampered company name'));
 const corrupted=createEntityGraph({facilityService:h.facilityService,filename:h.filename,now:()=>T3});
 await assert.rejects(corrupted.view(),{status:500});
});
test('graph is not readable or writable off loopback and makes no provider requests',async t=>{
 const h=await fixture(t,{enabled:false});
 assert.equal(h.graph.catalog().enabled,false);
 await assert.rejects(h.graph.view(),{status:403});
 await assert.rejects(h.graph.capturedLei({lei:LEI}),{status:403});
 await assert.rejects(h.graph.checkSource({source:'GLEIF_LEI',id:LEI}),{status:403});
 assert.equal(h.requests.length,0);
});
test('graph renderer exposes typed source nodes and never infers legal ownership from a path',()=>{
 const graph=buildGraph({leiNodes:[{lei:LEI,name:'GLEIF Entity',sourceUrl:'https://api.gleif.org',
  capturedAt:T1,registrationStatus:'ISSUED'}],
 secFilers:[{cik:CIK,companyName:'Filer',tickers:['EXM'],capturedAt:T1}],
 facilities:[{registryId:FRS,facilityName:'Site',location:[1,2],capturedAt:T1}],
 parents:[{childLei:LEI,parentLei:PARENT,capturedAt:T2,sourceUrl:'https://api.gleif.org'}],
 candidates:[{cik:CIK,lei:LEI,capturedAt:T3,evidenceUrl:'https://api.gleif.org'}],
 relationshipClaims:[{cik:CIK,registryId:FRS,capturedAt:T1,
   relationshipId:'crosswalk-0',evidenceUrl:'https://www.sec.gov'}],asOf:T3});
 assert.equal(graph.edges.length,3);
 assert.deepEqual(new Set(graph.edges.map(x=>x.type)),new Set([
  'REPORTED_ACCOUNTING_CONSOLIDATION','OPERATOR_IDENTIFIER_CANDIDATE',
  'HUMAN_FACILITY_RELATIONSHIP_CLAIM']));
 assert.equal(graph.verifiedCompanyFacilityOwnershipEdges,0);
 assert.equal(graph.edges.every(e=>e.legalOwnershipVerified!==true),true);
 assert.equal(ENTITY_GRAPH_FLAGS.length,5);
});
test('entity graph API requires explicit local actions and rejects arbitrary keys, URLs and filters',async t=>{
 const h=await fixture(t);
 const handler=createEntityGraphApi({graph:h.graph,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port+'/api/entity-graph/';
 assert.equal((await fetch(root+'catalog')).status,200);
 assert.equal((await fetch(root+'view')).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(T4))).status,400);
 const body=JSON.stringify({lei:LEI});
 assert.equal((await fetch(root+'lei',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(root+'lei',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Entity-Graph':'1',
   Origin:'https://evil.invalid'},body})).status,403);
 assert.equal((await fetch(root+'lei',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Entity-Graph':'1'},
  body:JSON.stringify({lei:LEI,url:'http://127.0.0.1/private'})})).status,400);
 const okay=await fetch(root+'lei',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Entity-Graph':'1'},body});
 assert.equal(okay.status,200);
 assert.equal((await okay.json()).record.value.legalOwnershipVerified,false);
});
test('v0.39 graph UI and Level 3 navigation remain in the static package',async()=>{
 const read=async file=>readFile(new URL('../'+file,import.meta.url),'utf8');
 const [html,js,server,nav,build]=await Promise.all([
  read('entity-graph.html'),read('entity-graph.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs')]);
 for(const id of ['leiForm','captureDirectParent','sourceCheckForm','identifierForm',
 'entity-network','entityNodes','entityEdges','entityAsOf'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/entity-graph/'));
 assert(server.includes("if(await handleEntityGraph(req,res,u))return;"));
 assert(nav.includes("href:'/entity-graph.html'"));
 assert(build.includes("'entity-graph.js'"));
 assert.equal(ENTITY_GRAPH_SCHEMA,'ENTITY-GRAPH-0.40.1');
});

test('P0 Level 2 relationship endpoint validates child, parent, accounting type, periods and corroboration separately',async()=>{
 const value=normalizeGleifRelationship({json:level2Record()},LEI);
 assert.equal(value.childLei,LEI);
 assert.equal(value.parentLei,PARENT);
 assert.equal(value.corroborationLevel,'FULLY_CORROBORATED');
 assert.deepEqual(value.periods.map(p=>p.type),['RELATIONSHIP_PERIOD','ACCOUNTING_PERIOD']);
 assert.equal(value.effectivePeriodOriginalPublicationVerified,false);
 assert.equal(value.legalOwnershipVerified,false);
 assert.equal(value.independentProviderCorroboration,false);
 assert.throws(()=>normalizeGleifRelationship({json:level2Record('5493000IBP32UQZ0KL24')},PARENT),{status:502});
 assert.throws(()=>normalizeGleifRelationship({json:{data:{attributes:{relationship:{
  startNode:{id:LEI},endNode:{id:PARENT},relationshipType:'IS_LEGALLY_OWNED_BY'
 }}}}},LEI),{status:502});
 const fetched=await fetchGleifRelationship(LEI,{fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.gleif.org/api/v1/lei-records/'+LEI+'/direct-parent-relationship');
  assert.equal(init.redirect,'error');return jsonResponse(level2Record());
 }});
 assert.equal(fetched.bodySha256.length,64);
});
test('captured GLEIF direct-parent record remains a source claim with distinct as-of timestamp',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.graph.capturedRelationship({lei:LEI}),{status:409});
 await h.graph.capturedLei({lei:LEI});
 h.setNow(T2);
 const first=await h.graph.capturedRelationship({lei:LEI});
 assert.equal(first.deduplicated,false);
 assert.equal(first.record.type,'GLEIF_RELATIONSHIP');
 assert.equal(first.record.value.registrationStatus,'PUBLISHED');
 assert.equal(first.record.value.legalOwnershipVerified,false);
 const duplicate=await h.graph.capturedRelationship({lei:LEI});
 assert.equal(duplicate.deduplicated,true);
 assert.equal((await h.graph.view({asOf:T1})).inventory.level2Records,0);
 const after=await h.graph.view({asOf:T2});
 assert.equal(after.inventory.level2Records,1);
 assert.equal(after.level2Records[0].periods.length,2);
 assert.equal(after.edges.some(e=>e.type==='GLEIF_LEVEL2_RECORDED_CONSOLIDATION'),true);
 assert.equal(after.verifiedCompanyFacilityOwnershipEdges,0);
 assert.equal(after.level2Records[0].independentProviderCorroboration,false);
});
test('conflicting direct-parent observation and Level 2 relationship is surfaced instead of averaged or auto-accepted',async t=>{
 const h=await fixture(t);
 await h.graph.capturedLei({lei:LEI});
 h.setNow(T2);await h.graph.capturedParent({lei:LEI});
 h.setLevel2Parent('5493000IBP32UQZ0KL24');
 h.setNow(T3);await h.graph.capturedRelationship({lei:LEI});
 const before=await h.graph.view({asOf:T2});
 assert.equal(before.relationshipConflicts.length,0);
 const after=await h.graph.view({asOf:T3});
 assert.equal(after.relationshipConflicts.length,1);
 assert.equal(after.relationshipConflicts[0].status,'PARENT_SOURCES_CONFLICT');
 assert.equal(after.relationshipConflicts[0].claimVerified,false);
 assert.equal(after.verifiedCompanyFacilityOwnershipEdges,0);
});
test('missing Level 2 record never creates a fictional consolidation edge',async t=>{
 const h=await fixture(t);
 await h.graph.capturedLei({lei:LEI});
 h.setLevel2Missing(true);
 const r=await h.graph.capturedRelationship({lei:LEI});
 assert.equal(r.record.value.parentLei,null);
 assert.equal(r.record.value.status,'RELATIONSHIP_RECORD_NOT_RETURNED');
 const report=await h.graph.view();
 assert.equal(report.level2Records.length,1);
 assert.equal(report.edges.filter(x=>x.type==='GLEIF_LEVEL2_RECORDED_CONSOLIDATION').length,0);
});
test('independent Level 2 source diagnostic does not append identity or relationship automatically',async t=>{
 const h=await fixture(t);
 const checked=await h.graph.checkSource({source:'GLEIF_LEVEL2_RELATIONSHIP',id:LEI});
 assert.equal(checked.provider,'GLEIF_LEVEL2_RELATIONSHIP');
 assert.equal(checked.ok,true);
 assert.equal(checked.persisted,false);
 assert.equal(checked.verifiedLegalOwnership,false);
 assert.equal((await h.graph.view()).inventory.level2Records,0);
});
test('record invalid relationship period is rejected before persistence',async()=>{
 const r=level2Record();
 r.data.attributes.relationship.relationshipPeriods=[{
  type:'UNSUPPORTED_PERIOD',startDate:'2025-01-01'}];
 assert.throws(()=>normalizeGleifRelationship({json:r},LEI),{status:502});
 const q=level2Record();
 q.data.attributes.relationship.relationshipPeriods=[{
  type:'RELATIONSHIP_PERIOD',startDate:'2026-01-01',endDate:'2025-01-01'}];
 assert.throws(()=>normalizeGleifRelationship({json:q},LEI),{status:502});
});
test('v0.40 Level 2 source controls and conflicts are present on existing entity graph page',async()=>{
 const read=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,backend]=await Promise.all([
  read('entity-graph.html'),read('entity-graph.js'),read('lib/entity-graph.mjs')]);
 assert(html.includes('id="captureLevel2"'));
 assert(html.includes('id="entityConflicts"'));
 assert(html.includes('GLEIF_LEVEL2_RELATIONSHIP'));
 assert(js.includes("mutate('relationship'"));
 assert(backend.includes("['lei','parent','relationship','link','check']"));
});
