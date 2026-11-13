import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createExposureCasebook,createExposureProofService,createExposureProofApi,
 scoreProofReadiness,exposureReportText} from '../lib/exposure-proof.mjs';

const id='asset-550e8400-e29b-41d4-a716-446655440000';
const cik='0001285785',registryId='110000538525';
const now=()=>new Date('2026-11-13T17:00:00Z');
const localAsset=()=>({id,symbol:'MOS',cik,assetName:'Research-only pilot facility',
 latitude:40.01,longitude:-78.99,geoEvidenceDate:'2026-01-15',issuerFilingDate:'2026-02-15',
 source:'ANALYST_SUBMITTED_UNVERIFIED'});
const form=()=>({assetId:id,epaRegistryId:registryId,legalOperatorName:'Hypothetical Operating LLC',
 effectiveFrom:'2025-01-01',effectiveTo:null,
 operatorDocument:{url:'https://www.epa.gov/frs/frs-api',publishedDate:'2026-01-20',
  excerpt:'Published government source excerpt referencing an asserted operating entity, pending independent review.'},
 issuerRelationshipDocument:{url:'https://www.sec.gov/Archives/edgar/data/1285785/example.htm',
  publishedDate:'2026-02-25',
  excerpt:'Source-linked SEC document said to connect a legal entity and registrant; relationship not yet independently checked.'},
 thesis:'Investigate whether this specific permitted operating entity is legally affiliated with the CIK registrant.'});
const epa=()=>({status:'FOUND',registryId,
 record:{registryId,facilityName:'Research-only pilot facility',latitude:40.012,longitude:-78.99,
  coordinateStatus:'OFFICIAL_NAD83_REPORTED_POINT'},
 recordHash:'a'.repeat(64),fetchedAt:'2026-11-13T17:00:00Z'});
const sec=()=>({source:'SEC_EDGAR_SUBMISSIONS_JSON',cik,registrantName:'Illustrative SEC Registrant',
 tickers:['MOS'],latestFilingDate:'2026-02-25',identityScope:'CURRENT_SEC_REGISTRANT_ONLY',
 fetchedAt:'2026-11-13T17:00:00Z'});
const folder=async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'researchos-proof-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 return path.join(dir,'proof.jsonl')};
const setup=async t=>{
 const store=createExposureCasebook({filename:await folder(t),now});
 let version=0;
 const sourceEpa={lookup:async x=>{assert.equal(x,registryId);return {...epa(),
  record:{...epa().record,latitude:40.012+version*.002},recordHash:String(version).padStart(64,'0')};}};
 const sourceSec={lookup:async x=>{assert.equal(x,cik);return sec();}};
 const assets=async()=>({assets:[localAsset()]});
 const service=createExposureProofService({store,assets,frs:sourceEpa,sec:sourceSec,now});
 return {store,service,setVersion:v=>{version=v}};
};
test('operator intake validates existing asset, exact legal/operator doc, SEC source, temporal interval and closed schema',async t=>{
 const {service}=await setup(t);
 const opened=await service.openCase(form());
 assert.equal(opened.type,'CASE_OPENED');
 assert.equal(opened.payload.claim.ownershipVerified,false);
 assert.equal(opened.payload.assetSymbol,'MOS');
 assert.equal(opened.payload.assetCik,cik);
 assert.equal(opened.payload.assetSnapshotHash.length,64);
 const bad={...form(),secret:'NEVER_ACCEPT'};
 await assert.rejects(service.openCase(bad),e=>e.status===400);
 await assert.rejects(service.openCase({...form(),assetId:'asset-550e8400-e29b-41d4-a716-446655440099'}),e=>e.status===404);
 await assert.rejects(service.openCase({...form(),effectiveFrom:'2027-01-01'}),e=>e.status===400);
 await assert.rejects(service.openCase({...form(),effectiveTo:'2024-01-01'}),e=>e.status===400);
 await assert.rejects(service.openCase({...form(),issuerRelationshipDocument:{
  ...form().issuerRelationshipDocument,url:'https://evil.invalid/claim'}}),e=>e.status===400);
 await assert.rejects(service.openCase({...form(),operatorDocument:{
  ...form().operatorDocument,url:'https://www.epa.gov/?api_key=secret'}}),e=>e.status===400);
});
test('local hash-chained proof cases are durable across reopen, exact case queries and filtering',async t=>{
 const filename=await folder(t),store=createExposureCasebook({filename,now});
 const service=createExposureProofService({store,assets:async()=>({assets:[localAsset()]}),
  frs:{lookup:async()=>epa()},sec:{lookup:async()=>sec()},now});
 const a=await service.openCase(form()),caseId=a.caseId;
 assert.match(caseId,/^case-[0-9a-f-]{36}$/);
 const second=createExposureCasebook({filename,now});
 const rows=await second.history(caseId);
 assert.equal(rows.events.length,1);
 assert.equal(rows.events[0].type,'CASE_OPENED');
 assert.equal((await second.integrity()).integrity,'LOCAL_HASH_CHAIN_VALID');
 assert.equal((await second.list({symbol:'MOS'})).cases.length,1);
 assert.equal((await second.list({symbol:'NVDA'})).cases.length,0);
 await assert.rejects(second.list({limit:500}),e=>e.status===400);
});
test('current EPA and SEC source captures are stored with no automatic operator-to-issuer validation',async t=>{
 const {service,store}=await setup(t),opened=await service.openCase(form()),caseId=opened.caseId;
 const captured=await service.sourceSnapshot(caseId);
 assert.equal(captured.record.type,'SOURCE_CAPTURED');
 assert.equal(captured.snapshot.epa.record.registryId,registryId);
 assert.equal(captured.snapshot.sec.cik,cik);
 assert.equal(captured.snapshot.sec.registrantName,'Illustrative SEC Registrant');
 assert.equal(captured.snapshot.status.sec,'CURRENT_REGISTRANT_ONLY');
 assert.equal(captured.snapshot.status.epa,'FOUND');
 const assessed=await service.assess(caseId);
 assert.equal(assessed.verifiedIssuerOwnership,false);
 assert.equal(assessed.validatedFinancialImpact,false);
 assert.equal(assessed.analysis.legalOperatorVerified,false);
 assert.equal(assessed.analysis.subsidiaryToCikVerified,false);
 assert(assessed.analysis.issues.some(x=>x.id==='LEGAL_OPERATOR_TO_PARENT_NOT_INDEPENDENTLY_PROVEN'));
 assert.equal((await store.integrity()).recordCount,2);
});
test('stable source content digest ignores repeat retrieval clock and reports real normalized changes',async t=>{
 const {service,setVersion}=await setup(t),id=(await service.openCase(form())).caseId;
 const first=await service.sourceSnapshot(id),same=await service.sourceSnapshot(id);
 assert.equal(first.diff.previousSnapshotHash,null);
 assert.equal(same.diff.changed,false);
 assert.equal(first.diff.currentSnapshotHash,same.diff.currentSnapshotHash);
 setVersion(2);
 const changed=await service.sourceSnapshot(id);
 assert.equal(changed.diff.changed,true);
 assert.notEqual(changed.diff.currentSnapshotHash,same.diff.currentSnapshotHash);
 assert.equal(changed.snapshot.epa.record.currentOwnerVerified,undefined);
 assert.equal((await service.history(id)).events.length,4);
});
test('historical as-of blocks future source dates, future ownership start and expired assertion',async t=>{
 const {service}=await setup(t),id=(await service.openCase(form())).caseId;
 await service.sourceSnapshot(id);
 const replay=await service.assess(id,{asOf:'2020-02-15'});
 assert.equal(replay.analysis.historicalFirstAvailableEligible,false);
 assert(replay.analysis.issues.some(x=>x.id==='AFTER_CUTOFF_OPERATOR_PERMIT'));
 assert(replay.analysis.issues.some(x=>x.id==='AFTER_CUTOFF_SEC_RELATIONSHIP'));
 assert(replay.analysis.issues.some(x=>x.id==='AFTER_CUTOFF_EFFECTIVE_OPERATOR_START'));
 await assert.rejects(service.assess(id,{asOf:'2020-02-30'}),e=>e.status===400);
 const expired=scoreProofReadiness({opened:{...form(),claim:{...form(),effectiveTo:'2025-12-31',
  operatorDocument:form().operatorDocument,issuerRelationshipDocument:form().issuerRelationshipDocument,
  effectiveFrom:'2024-01-01',epaRegistryId:registryId},assetCik:cik,assetSymbol:'MOS'},
  assets:localAsset(),asOf:'2026-03-01'});
 assert(expired.issues.some(x=>x.id==='OWNERSHIP_INTERVAL_EXPIRED'));
});
test('deterministic evidence critique names critical proof gaps and source conflicts without numerical risk confidence',()=>{
 const a=scoreProofReadiness({opened:{claim:{...form()},assetSymbol:'MOS',assetCik:cik},
  assets:localAsset(),frs:epa(),sec:sec()});
 assert.equal(a.sourceCompleteness.notAProbability,true);
 assert.equal(a.subsidiaryToCikVerified,false);
 assert.equal(a.issuerFinancialImpactVerified,false);
 assert.equal(a.evidenceState,'INDEPENDENT_OPERATOR_AND_HISTORICAL_PROOF_MISSING');
 assert(a.criticalIssueCount>0);
 const conflict=scoreProofReadiness({opened:{claim:form(),assetCik:'0009999999',assetSymbol:'NVDA'},
  assets:localAsset(),frs:{...epa(),record:{...epa().record,latitude:42.0}},sec:sec()});
 assert(conflict.issues.some(x=>x.id==='SITE_POINT_CONFLICT'));
 assert(conflict.issues.some(x=>x.id==='SEC_CIK_MISMATCH'));
 assert(conflict.issues.some(x=>x.id==='ASSET_IDENTITY_DRIFT'));
});
test('structured human counterclaims are append-only and cannot be resolved by unsupported rebuttal rhetoric',async t=>{
 const {service}=await setup(t),id=(await service.openCase(form())).caseId;
 const c=await service.challenge(id,{category:'SOURCE_CONFLICT',
  reason:'The official facility identity may refer to a similarly named operator with no documented public parent.'});
 assert.equal(c.type,'CHALLENGE_ADDED');
 assert.equal(c.payload.independentlyVerified,false);
 assert.equal(c.payload.status,'OPEN');
 await assert.rejects(service.rebut(id,{challengeId:'challenge-00000000-0000-0000-0000-000000000000',
  reason:'Unsupported statement'}),e=>e.status===404);
 const r=await service.rebut(id,{challengeId:c.payload.challengeId,
  reason:'New document is being sought; evidence has not independently established any owner.'});
 assert.equal(r.payload.resolution,'NOT_AUTOMATICALLY_RESOLVED');
 const assessment=await service.assess(id);
 assert.equal(assessment.humanChallenges.length,1);
 assert.equal(assessment.rebuttals.length,1);
 assert.equal(assessment.humanChallenges[0].status,'OPEN');
});
test('reviewer dispositions do not promote legal ownership and require substantive rationale',async t=>{
 const {service}=await setup(t),id=(await service.openCase(form())).caseId;
 await assert.rejects(service.review(id,{disposition:'VERIFIED',
  rationale:'This is deliberately not a permitted disposition.'}),e=>e.status===400);
 await assert.rejects(service.review(id,{disposition:'READY_FOR_INDEPENDENT_REVIEW',
  rationale:'too brief'}),e=>e.status===400);
 const outcome=await service.review(id,{disposition:'READY_FOR_INDEPENDENT_REVIEW',
  rationale:'Sources exist but operator-to-issuer relationship requires independent review.'});
 assert.equal(outcome.payload.actualOwnershipVerified,false);
 const assessment=await service.assess(id);
 assert.equal(assessment.reviewDisposition,'READY_FOR_INDEPENDENT_REVIEW');
 assert.equal(assessment.verifiedIssuerOwnership,false);
});
test('text report is source-cited, readable and explicitly denies certification',async t=>{
 const {service}=await setup(t),id=(await service.openCase(form())).caseId;
 await service.sourceSnapshot(id);
 const text=await service.report(id,{asOf:'2020-02-15'});
 assert(text.includes('EPA Registry ID '+registryId));
 assert(text.includes('https://www.sec.gov/Archives/edgar/data/'));
 assert(text.includes('NOT INDEPENDENTLY VERIFIED'));
 assert(text.includes('AFTER_CUTOFF_OPERATOR_PERMIT'));
 assert(text.includes('NO INVESTMENT RECOMMENDATION'));
 assert(!text.includes('RESEARCH_EXPOSURE_PROOF_ENABLED'));
});
test('tampering or truncation in case events rejects reads and future appends',async t=>{
 const filename=await folder(t),book=createExposureCasebook({filename,now});
 const service=createExposureProofService({store:book,assets:async()=>({assets:[localAsset()]}),
  frs:{lookup:async()=>epa()},sec:{lookup:async()=>sec()},now});
 await service.openCase(form());
 const bytes=await fs.readFile(filename,'utf8');
 await fs.writeFile(filename,bytes.replace('Hypothetical Operating LLC','Altered Operator LLC'),'utf8');
 await assert.rejects(book.integrity(),e=>e.status===409);
 await assert.rejects(service.openCase(form()),e=>e.status===409);
});
test('source connector failures are reported as source-unavailable without fabricating issuer proof',async t=>{
 const store=createExposureCasebook({filename:await folder(t),now});
 const svc=createExposureProofService({store,assets:async()=>({assets:[localAsset()]}),
  frs:{lookup:async()=>{throw Error('provider token must not be returned');}},
  sec:{lookup:async()=>{throw Error('provider outage');}},now});
 const id=(await svc.openCase(form())).caseId;
 const capture=await svc.sourceSnapshot(id);
 assert.equal(capture.snapshot.status.epa,'SOURCE_UNAVAILABLE');
 assert.equal(capture.snapshot.status.sec,'SOURCE_UNAVAILABLE');
 assert(!JSON.stringify(capture).includes('provider token'));
 const assessment=await svc.assess(id);
 assert(assessment.analysis.issues.some(x=>x.id==='OFFICIAL_FRS_NOT_OBSERVED'));
 assert(assessment.analysis.issues.some(x=>x.id==='SEC_CIK_NOT_OBSERVED'));
});
test('proof-case HTTP read/write contract is same-origin, source-owned and cannot accept custom snapshots',async t=>{
 const {service}=await setup(t),api=createExposureProofApi({service,enabled:true});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const base='http://127.0.0.1:'+server.address().port+'/api/exposure-proof/';
 const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,data,headers={})=>fetch(base+route,{method:'POST',headers:{
  origin,'content-type':'application/json',...headers},body:JSON.stringify(data)});
 const catalog=await (await fetch(base+'catalog')).json();
 assert.equal(catalog.enabled,true);
 assert(catalog.featureSet.length>=10);
 assert.equal(catalog.autonomousAgentsActive,false);
 assert.equal((await post('cases',form(),{origin:'https://evil.invalid'})).status,403);
 const opened=await (await post('cases',form())).json(),caseId=opened.caseId;
 assert.equal((await fetch(base+'cases?limit=30')).status,200);
 assert.equal((await fetch(base+'case?id='+caseId)).status,200);
 assert.equal((await post('capture?id='+caseId,{url:'https://evil.invalid'})).status,400);
 assert.equal((await post('capture?id='+caseId,{})).status,201);
 assert.equal((await fetch(base+'history?id='+caseId)).status,200);
 const report=await fetch(base+'report?id='+caseId);
 assert.equal(report.status,200);
 assert.match(report.headers.get('content-type'),/text\/plain/);
 assert.equal((await post('review?id='+caseId,{disposition:'NEEDS_EVIDENCE',
  rationale:'The documentary chain remains unsupported and source-limited.'})).status,201);
 assert.equal((await fetch(base+'case?id='+caseId+'&url=https://evil.invalid')).status,404);
 assert.equal((await fetch(base+'cases',{method:'PUT'})).status,405);
 const disabled=createExposureProofApi({});
 const off=http.createServer((req,res)=>void disabled(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>off.listen(0,'127.0.0.1',ok));
 t.after(async()=>{off.closeAllConnections();await new Promise(ok=>off.close(ok));});
 const d=await (await fetch('http://127.0.0.1:'+off.address().port+'/api/exposure-proof/catalog')).json();
 assert.equal(d.enabled,false);
});
test('review UI is responsive, syntax-valid and operates only through local source APIs',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,js,css]=await Promise.all(['exposure-review.html','exposure-review.js','exposure-review.css']
  .map(x=>fs.readFile(path.join(root,x),'utf8')));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'exposure-review.js'}));
 for(const id of ['cases','createForm','assetId','epaRegistryId','operatorUrl','secUrl','thesis',
  'capture','assess','critic','challengeForm','rebutForm','rebutChallenge','reviewBtn','audit','export'])
  assert(html.includes('id="'+id+'"'));
 assert(html.includes('href="/exposure-review.css"'));
 assert(html.includes('src="/exposure-review.js"'));
 assert(js.includes('/api/exposure-proof/'));
 assert(!js.includes('data.sec.gov/submissions'));
 assert(css.includes('.challenge'));
});
