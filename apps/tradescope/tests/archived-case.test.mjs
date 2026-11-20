import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCaseStore} from '../lib/cases.mjs';

const UUID='11111111-1111-4111-8111-111111111111';
const ACCESSION='0001193125-26-448357';
const sourceUrl='https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/filing.htm';
function source(version=1){
 return {eventId:'sec:'+ACCESSION,source:'SEC_EDGAR',firstObservedAt:'2026-11-12T22:15:00.000Z',revision:{
  id:'REV-'+(version===1?UUID:version===2?'22222222-2222-4222-8222-222222222222':'33333333-3333-4333-8333-333333333333'),version,contentHash:(version===1?'a':version===2?'b':'c').repeat(64),
  capturedAt:version===1?'2026-11-12T22:15:00.000Z':'2026-11-12T22:18:00.000Z',knowledgeStatus:'captured_observation',captureKind:'derived_enrichment',
  event:{id:'sec:'+ACCESSION,source:'SEC_EDGAR',sourceUrl,headline:'MSFT — SEC 8-K filing',type:'FILING',category:'CORPORATE',form:'8-K',accession:ACCESSION,
   symbols:['MSFT'],filingDate:'2026-11-12',publishedAt:'2026-11-12T21:30:00Z',occurredAt:null,
   classificationVersion:'corporate-filing-v1',contentRevision:'a'.repeat(64),classifications:[{code:'financial_statement_nonreliance',label:'Non-reliance',evidenceIds:['sec-passage-1']}],
   evidence:[{id:'sec-passage-1',section:'Item 4.02',text:'The audit committee reported non-reliance on prior statements.',sourceUrl}]
  }
 }};
}
async function storeFor(t){const dir=await mkdtemp(join(tmpdir(),'tradescope-revision-case-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'cases.json');return {store:createCaseStore(file),file};}
test('exact archive revision creates an auditable case snapshot, survives restart and is idempotent',async t=>{
 const {store,file}=await storeFor(t);
 const first=await store.createFromArchivedRevision({archive:source(),symbol:'MSFT'});
 assert.equal(first.revision,1);assert.equal(first.relationship,'PROVIDER_TAGGED');assert.equal(first.evidence.length,1);
 assert.equal(first.evidence[0].kind,'ARCHIVED_REVISION');assert.equal(first.evidence[0].archive.revisionId,'REV-'+UUID);
 assert.equal(first.evidence[0].archive.contentHash,'a'.repeat(64));assert.equal(first.evidence[0].archive.citations[0].section,'Item 4.02');
 assert.equal(first.evidence[0].archive.capturedAt,'2026-11-12T22:15:00.000Z');
 assert(first.audit.some(entry=>entry.action==='ARCHIVED_REVISION_ATTACHED'));
 const repeated=await store.createFromArchivedRevision({archive:source(),symbol:'MSFT'});
 assert.equal(repeated.id,first.id);assert.equal((await store.list()).length,1);
 const reopened=createCaseStore(file);assert.equal((await reopened.get(first.id)).evidence[0].archive.contentHash,'a'.repeat(64));
 assert(!(await readFile(file,'utf8')).includes('APCA_API_SECRET_KEY'));
});
test('different observed revisions attach to one case; stale writes fail and exact duplicates do not duplicate evidence',async t=>{
 const {store}=await storeFor(t),first=await store.createFromArchivedRevision({archive:source(),symbol:'MSFT'});
 const second=await store.attachArchivedRevision(first.id,{archive:source(2),symbol:'MSFT',expectedRevision:1});
 assert.equal(second.revision,2);assert.equal(second.evidence.length,2);
 const repeated=await store.attachArchivedRevision(first.id,{archive:source(2),symbol:'MSFT',expectedRevision:1});
 assert.equal(repeated.revision,2);assert.equal(repeated.evidence.length,2);
 await assert.rejects(store.attachArchivedRevision(first.id,{archive:source(3),symbol:'MSFT',expectedRevision:1}),{status:409});
 await assert.rejects(store.attachArchivedRevision(first.id,{archive:source(2),symbol:'AAPL',expectedRevision:2}),{status:422});
 const persisted=await store.get(first.id);assert.equal(persisted.evidence.length,2);
});
test('rejects mismatched issuer, forged provenance and public-path archive evidence kinds',async t=>{
 const {store}=await storeFor(t);
 await assert.rejects(store.createFromArchivedRevision({archive:source(),symbol:'AAPL'}),{status:422});
 const bad=source();bad.revision.event.sourceUrl='https://evil.example/synthetic';
 await assert.rejects(store.createFromArchivedRevision({archive:bad,symbol:'MSFT'}),{status:422});
 const created=await store.createFromArchivedRevision({archive:source(),symbol:'MSFT'});
 await assert.rejects(store.addEvidence(created.id,{kind:'ARCHIVED_REVISION',expectedRevision:1,url:sourceUrl,label:'Unverified'}),{status:400});
});