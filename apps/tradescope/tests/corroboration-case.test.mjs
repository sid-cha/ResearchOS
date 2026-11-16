import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {
 assembleCorroborationCase,createCorroborationDesk,createCorroborationCaseApi,
 CORROBORATION_CASE_RULE
} from '../lib/corroboration-case.mjs';

const RID='crosswalk-00000000-0000-4000-8000-000000000001';
const CIK='0000000123',FRS='110015778176',LEI='5493001KJTIIGC8Y1R12';
const SEC='https://www.sec.gov/Archives/edgar/data/123/filing.htm';
const T0='2026-11-15T00:00:00.000Z',T1='2026-11-15T01:00:00.000Z';
const T2='2026-11-15T02:00:00.000Z',T3='2026-11-15T03:00:00.000Z';
const T4='2026-11-15T04:00:00.000Z',T5='2026-11-15T05:00:00.000Z';
const digest='a'.repeat(64);
function snapshots(asOf=T4,{noDocuments=false,noGleif=false,dispute=false,conflict=false,
 mismatch=false,noPeriod=false}={}){
 const facility={
  relationships:asOf>=T1?[{relationshipId:RID,cik:CIK,registryId:FRS,
   relationshipType:'POTENTIAL_OPERATOR',capturedAt:T1,
   evidenceUrl:SEC}]:[],
  companies:asOf>=T1?[{cik:CIK,companyName:'Example SEC Corporation',
   tickers:['EXMP'],sourceUrl:'https://data.sec.gov/submissions/CIK0000000123.json',
   capturedAt:T1,bodySha256:digest}]:[],
  facilities:asOf>=T1?[{registryId:FRS,facilityName:'EPA Reported Operations Plant',
   capturedAt:T1,providerUrl:'https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities?registry_id='+FRS+
    '&output=JSON',bodySha256:digest,location:[-120.3,38.1]}]:[]
 };
 const graph={
  nodes:(!noGleif&&asOf>=T2)?[{id:'lei:'+LEI,kind:'LEGAL_ENTITY',
   lei:LEI,label:'Example Legal Entity LEI',capturedAt:T2}]:[],
  edges:(!noGleif&&asOf>=T2)?[{type:'OPERATOR_IDENTIFIER_CANDIDATE',
   from:'cik:'+CIK,to:'lei:'+LEI,capturedAt:T2,
   sourceEvidence:'https://api.gleif.org/api/v1/lei-records/'+LEI}]:[],
  level2Records:!noGleif&&asOf>=T3?[{
   childLei:LEI,parentLei:'213800QVXQAZLPZH1234',capturedAt:T3,
   sourceUrl:'https://api.gleif.org/api/v1/lei-records/'+LEI+'/direct-parent-relationship',
   bodySha256:digest,periods:[{type:'RELATIONSHIP_PERIOD',startDate:'2020-01-01',endDate:null}],
   independentProviderCorroboration:false}]:[],
  relationshipConflicts:conflict&&asOf>=T3?[{
   childLei:LEI,sourceIdentityParent:'213800QVXQAZLPZH1234',
   sourceLevel2Parent:'5493000IBP32UQZ0KL24',status:'PARENT_SOURCES_CONFLICT'}]:[]
 };
 const review={
  documents:!noDocuments&&asOf>=T2?[{
   documentId:'verification-00000000-0000-4000-8000-000000000001',
   relationshipId:RID,capturedAt:T2,sourceUrl:mismatch?'https://www.sec.gov/Archives/edgar/data/123/other.htm':SEC,
   sourceSha256:digest,quoteMatched:true,
   excerpt:'The company consolidated the separately named subsidiary on the statement.'
  }]:[],
  proposals:!noPeriod&&asOf>=T3?[{
   relationshipId:RID,proposalId:'proposal-00000000-0000-4000-8000-000000000001',
   documentId:'verification-00000000-0000-4000-8000-000000000001',
   claimedEffectiveFrom:'2020-01-01',claimedEffectiveTo:null,
   claimRecordedAt:T3,assessment:{status:dispute?'DISPUTED':'TWO_UNAUTHENTICATED_ALIASES_AGREE',
    agreedDecision:dispute?null:'SUPPORTS_CLAIM'}
  }]:[]
 };
 return {relationshipId:RID,asOf,facility,graph,review};
}
const mockServices=({options={},now=T4,readLog=[]}={})=>{
 const view=key=>async ({asOf})=>{
  readLog.push({key,asOf});
  return snapshots(asOf,options)[key];
 };
 return {facilityService:{view:view('facility')},entityGraph:{view:view('graph')},
  relationshipVerifier:{view:view('review')},now:()=>now};
};
test('dossier joins three source domains but never certifies legal ownership or financial exposure',()=>{
 const caseFile=assembleCorroborationCase(snapshots());
 assert.equal(caseFile.ruleVersion,CORROBORATION_CASE_RULE);
 assert.deepEqual(caseFile.sourceProvidersObserved,['GLEIF','US_EPA_FRS','US_SEC_EDGAR']);
 assert.equal(caseFile.subject.cik,CIK);
 assert.equal(caseFile.subject.frs,FRS);
 assert.equal(caseFile.decision.status,'UNVERIFIED_RESEARCH_LEAD');
 assert.equal(caseFile.decision.relationshipLegalOwnershipVerified,false);
 assert.equal(caseFile.decision.independentSamePropositionCorroboration,false);
 assert.equal(caseFile.decision.predictedSecurityReturn,null);
 assert.equal(caseFile.leiCandidates.length,1);
 assert.equal(caseFile.gleifLevel2.length,1);
 assert.equal(caseFile.gleifLevel2[0].originalEffectiveDatesVerified,false);
 assert.equal(caseFile.proposedIntervals[0].authenticatedReviewers,false);
 assert.equal(caseFile.corroborationMatrix.find(x=>x.code==='FACILITY_OWNERSHIP').state,'NOT_VERIFIED');
 assert.equal(caseFile.corroborationMatrix.find(x=>x.code==='SEC_FILING_QUOTE').state,'LITERAL_TEXT_OBSERVED');
 assert(caseFile.antiAgentObjections.includes('DISTINCT_SOURCE_PROVIDERS_DO_NOT_VALIDATE_SAME_PROPOSITION'));
 assert.match(caseFile.manifestSha256,/^[a-f0-9]{64}$/);
});
test('source evidence chain preserves local capture clock and source content digests',()=>{
 const caseFile=assembleCorroborationCase(snapshots());
 const doc=caseFile.providerEvidence.find(x=>x.id.startsWith('SEC_DOC:'));
 assert.equal(doc.firstCapturedAt,T2);
 assert.equal(doc.bodySha256,digest);
 assert.equal(doc.sourceUrl,SEC);
 const gleif=caseFile.providerEvidence.find(x=>x.id==='GLEIF:'+LEI);
 assert.equal(gleif.firstCapturedAt,T2);
 assert.equal(gleif.qualification,'CIK_TO_LEI_ASSOCIATION_REMAINS_OPERATOR_CANDIDATE');
 assert(caseFile.providerEvidence.every(x=>x.firstCapturedAt<=T4));
});
test('no SEC quote match and no LEI candidate stays incomplete, with no invented links',()=>{
 const f=assembleCorroborationCase(snapshots(T4,{noDocuments:true,noGleif:true,noPeriod:true}));
 assert.equal(f.sourceProvidersObserved.includes('GLEIF'),false);
 assert.equal(f.leiCandidates.length,0);
 assert.equal(f.gleifLevel2.length,0);
 assert.equal(f.proposedIntervals.length,0);
 assert.equal(f.corroborationMatrix.find(x=>x.code==='SEC_FILING_QUOTE').state,'INSUFFICIENT');
 assert.equal(f.corroborationMatrix.find(x=>x.code==='CIK_LEI_IDENTITY').state,'UNKNOWN');
 assert(f.antiAgentObjections.includes('NO_CIK_LEI_IDENTIFIER_CANDIDATE'));
 assert(f.antiAgentObjections.includes('NO_MATCHED_CAPTURABLE_SEC_DOCUMENT'));
});
test('different SEC filing URL is challenged even when quote-matched',()=>{
 const f=assembleCorroborationCase(snapshots(T4,{mismatch:true}));
 assert.equal(f.corroborationMatrix.find(x=>x.code==='SEC_FILING_QUOTE').state,'INSUFFICIENT');
 assert(f.antiAgentObjections.includes('CAPTURED_DOCUMENT_URL_MISMATCHES_RELATIONSHIP'));
 assert.equal(f.decision.relationshipLegalOwnershipVerified,false);
});
test('conflicting GLEIF parent records and disputed reviewers produce conflicted research lead',()=>{
 const f=assembleCorroborationCase(snapshots(T4,{dispute:true,conflict:true}));
 assert.equal(f.decision.status,'CONFLICTED_RESEARCH_LEAD');
 assert.equal(f.reportedParentConflicts.length,1);
 assert.equal(f.corroborationMatrix.find(x=>x.code==='ACCOUNTING_PARENT').state,'SOURCE_CONFLICT');
 assert(f.antiAgentObjections.includes('CONFLICTING_GLEIF_PARENT_RECORDS'));
 assert(f.antiAgentObjections.includes('HUMAN_REVIEWER_DISAGREEMENT'));
 assert.equal(f.proposedIntervals[0].aggregateAssessment,null);
});
test('as-of cutoffs are honored by every source service, with no backdated quote, LEI or period',async()=>{
 const log=[],desk=createCorroborationDesk(mockServices({readLog:log}));
 await assert.rejects(desk.dossier({relationshipId:RID,asOf:T0}),{status:404});
 const early=await desk.dossier({relationshipId:RID,asOf:T1});
 assert.equal(early.leiCandidates.length,0);
 assert.equal(early.providerEvidence.some(x=>x.provider==='GLEIF'),false);
 const later=await desk.dossier({relationshipId:RID,asOf:T2});
 assert.equal(later.leiCandidates.length,1);
 assert.equal(later.gleifLevel2.length,0);
 const now=await desk.dossier({relationshipId:RID,asOf:T4});
 assert.equal(now.gleifLevel2.length,1);
 assert.equal(now.proposedIntervals.length,1);
 assert(log.every(x=>x.asOf<=T4));
 assert(log.filter(x=>x.asOf===T2).length===3);
 await assert.rejects(desk.dossier({relationshipId:RID,asOf:T5}),{status:400});
});
test('defensive clock validation fails closed on data leaking after requested as-of',()=>{
 const input=snapshots();
 input.review.documents[0].capturedAt=T5;
 assert.throws(()=>assembleCorroborationCase(input),{status:500});
 const later=snapshots();
 later.facility.relationships[0].capturedAt=T5;
 assert.throws(()=>assembleCorroborationCase(later),{status:500});
});
test('the dossier is stable for the same cutoff and contains no reviewer identity, rationale or provider secret',()=>{
 const a=assembleCorroborationCase(snapshots(T4));
 const b=assembleCorroborationCase(snapshots(T4));
 assert.equal(a.manifestSha256,b.manifestSha256);
 assert.deepEqual(a,b);
 const full=JSON.stringify(a);
 assert(!full.includes('Reviewer_A'));
 assert(!full.includes('Provider secret'));
 assert(!full.includes('SUPPLY_CHAIN_VERIFIED'));
 assert(!full.includes('password'));
});
test('case inventory exposes only captured claim identifiers, no inferred ownership',async()=>{
 const desk=createCorroborationDesk(mockServices());
 const inv=await desk.inventory({asOf:T4});
 assert.equal(inv.relationships.length,1);
 assert.equal(inv.relationships[0].status,'HUMAN_RESEARCH_CLAIM_UNVERIFIED');
 assert.equal((await desk.inventory({asOf:T0})).relationships.length,0);
 assert.equal(desk.catalog().externalProviderRequests,false);
});
test('disabled private case service refuses inventory and case reads before upstream access',async()=>{
 let calls=0;
 const service={view:async()=>{calls++;throw Error('No access allowed');}};
 const desk=createCorroborationDesk({facilityService:service,entityGraph:service,
  relationshipVerifier:service,enabled:false});
 await assert.rejects(desk.inventory(),{status:403});
 await assert.rejects(desk.dossier({relationshipId:RID}),{status:403});
 assert.equal(calls,0);
});
test('read-only API handles explicit source cases, rejects POST and arbitrary query keys',async t=>{
 const desk=createCorroborationDesk(mockServices());
 const handle=createCorroborationCaseApi({desk});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port+'/api/corroboration-case/';
 assert.equal((await fetch(base+'catalog')).status,200);
 assert.equal((await fetch(base+'inventory')).status,200);
 assert.equal((await fetch(base+'case')).status,400);
 assert.equal((await fetch(base+'case?relationshipId=../.env')).status,400);
 assert.equal((await fetch(base+'case?relationshipId='+RID+'&scope=all')).status,400);
 assert.equal((await fetch(base+'case?relationshipId='+RID,{method:'POST'})).status,405);
 const response=await fetch(base+'case?relationshipId='+RID+'&asOf='+encodeURIComponent(T4));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.subject.frs,FRS);
 assert.equal(result.decision.relationshipLegalOwnershipVerified,false);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('v0.41 UI routes, explicit allowlists, hierarchy navigation and JSON export are wired',async()=>{
 const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
 const [html,js,server,nav,staticBuild,security]=await Promise.all([
  read('corroboration-case.html'),read('corroboration-case.js'),
  read('server.mjs'),read('hierarchy-navigation.js'),
  read('scripts/build-static.mjs'),read('tests/security.test.mjs')
 ]);
 for(const id of ['case-selection','caseRelationship','caseAsOf','case-matrix',
 'case-provenance','case-challenges','caseEvidence','exportCase'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/corroboration-case/'));
 assert(js.includes('JSON.stringify(state.case'));
 assert(server.includes('createCorroborationCaseApi'));
 assert(server.includes("if(await handleCorroborationCase(req,res,u))return;"));
 assert(nav.includes("href:'/corroboration-case.html'"));
 assert(staticBuild.includes("'corroboration-case.js'"));
 assert(security.includes("'corroboration-case.js'"));
 assert.equal(CORROBORATION_CASE_RULE,'SOURCE-CORROBORATION-0.41.1');
});
