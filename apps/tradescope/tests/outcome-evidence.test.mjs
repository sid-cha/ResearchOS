import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 approvedSourceUrl,fetchOfficialSnapshot,createOutcomeEvidenceArchive,
 createOutcomeEvidenceApi,prospectiveDatasetCsv,OFFICIAL_SNAPSHOT_HOSTS
} from '../lib/outcome-evidence.mjs';

const RUN='desk-00000000-0000-4000-8000-000000000001';
const REG='validation-00000000-0000-4000-8000-000000000001';
const LINK='https://www.sec.gov/Archives/edgar/data/123/filing.html';
const T1='2026-11-14T00:00:00.000Z';
const T2='2026-11-16T00:00:00.000Z';
const T3='2026-11-17T00:00:00.000Z';
const H=x=>createHash('sha256').update(x).digest('hex');
const response=(body='<html><h1>Official regulatory statement</h1></html>',headers={})=>({
 ok:true,status:200,headers:{get:key=>({'content-type':'text/html',
  'content-length':String(Buffer.byteLength(body)),...headers})[key]||null},
 body:Readable.from([Buffer.from(body)])
});
async function fixture(t,options={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-official-evidence-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'source-journal.json');
 let now=T3,sourceContent='<html><h1>Official regulatory statement</h1></html>';
 const calls=[];
 const validation={
  evidenceLinks:async id=>{
   if(id!==RUN)throw Error('unrecognized run');
   return {runId:RUN,registrationId:REG,windowEndsAt:T2,links:[{url:LINK,publishedAt:T2}]};
  },
  datasetRows:async ({asOf})=>({asOf,rows:Date.parse(asOf)<Date.parse(T1)?[]:[{
   runId:RUN,runIntegrity:'f'.repeat(64),runCreatedAt:T1,
   runKnowledgeAsOf:T1,eventId:'USGS:quake-9',registrationId:REG,registeredAt:T1,
   horizonEndsAt:T2,criterion:'A dated source confirms a documented outage in the registered window',
   question:'Was an operational outage independently confirmed?',
   operatorDeclaredCohort:'CONTROL',reviewStatus:Date.parse(asOf)<Date.parse(T2)?
    'NOT_REVIEWED':'TWO_ALIASES_AGREE_UNVERIFIED',reviewCount:Date.parse(asOf)<Date.parse(T2)?0:2,
   reviewCompletedAt:Date.parse(asOf)<Date.parse(T2)?null:T2,
   agreedHumanAttestation:Date.parse(asOf)<Date.parse(T2)?null:'OBSERVED',
   groundTruthVerified:false,reviewerIdentityVerified:false,
   sourceDocumentSemanticsVerified:false
  }]})
 };
 const fetchImpl=async(url,init)=>{calls.push({url,init});
  return response(sourceContent);
 };
 const archive=createOutcomeEvidenceArchive({validation,filename,now:()=>now,
  fetchImpl,...options});
 return {archive,filename,validation,calls,setNow:x=>now=x,
  setSource:x=>sourceContent=x};
}
test('strict official HTTPS allowlist rejects SSRF, credentials, wrong schemes, redirect hosts and ports',()=>{
 assert(OFFICIAL_SNAPSHOT_HOSTS.includes('www.sec.gov'));
 assert.equal(approvedSourceUrl(LINK),LINK);
 for(const url of [
  'http://www.sec.gov/Archives/a','https://evil.example.org/a',
  'https://www.sec.gov.attacker.org/a','https://127.0.0.1/a',
  'https://user:pass@www.sec.gov/a','https://www.sec.gov:8443/a',
  'https://www.sec.gov/a#fragment','file:///etc/passwd',
  'https://localhost/a','https://nasstatus.faa.gov.evil.net/a'
 ])assert.equal(approvedSourceUrl(url),null,url);
});
test('bounded official GET saves content hash and normalized excerpt; no publication time verification',async()=>{
 const calls=[];
 const item=await fetchOfficialSnapshot(LINK,{fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return response('<html><script>alert(1)</script><h1>Actual outage notice</h1></html>',{
   'last-modified':'not-a-real-date','etag':'secret-version'
  });
 }});
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.method,'GET');
 assert.equal(item.sourceUrl,LINK);
 assert.equal(item.bodySha256,H(Buffer.from('<html><script>alert(1)</script><h1>Actual outage notice</h1></html>')));
 assert(!item.excerpt.includes('alert(1)'));
 assert.equal(item.sourceLastModified,null);
 assert.equal(item.originalPublishedAtVerified,false);
 assert.equal(item.documentMeaningVerified,false);
 assert(!JSON.stringify(item).includes('secret-version'));
});
test('stream response bounds and MIME allowlist block unsafe sources without complete buffering',async()=>{
 await assert.rejects(fetchOfficialSnapshot(LINK,{fetchImpl:async()=>response('X'.repeat(120001),{
  'content-length':'0'
 })}),{status:413});
 await assert.rejects(fetchOfficialSnapshot(LINK,{fetchImpl:async()=>response('PDF',{
  'content-type':'application/pdf'
 })}),{status:415});
 await assert.rejects(fetchOfficialSnapshot(LINK,{fetchImpl:async()=>({
  ok:false,status:302,headers:{get:()=>null},
  body:Readable.from([])
 })}),{status:503});
 let called=false;
 await assert.rejects(fetchOfficialSnapshot('https://127.0.0.1/metadata',{
  fetchImpl:async()=>{called=true;return response('bad');}
 }),{status:403});
 assert.equal(called,false);
});
test('requires a URL already attested in same registration, with horizon complete',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.archive.capture({runId:RUN,registrationId:REG,
  sourceUrl:'https://www.sec.gov/Archives/other'}),{status:403});
 await assert.rejects(h.archive.capture({runId:RUN,registrationId:REG,
  sourceUrl:'https://127.0.0.1/a'}),{status:400});
 h.setNow(T1);
 await assert.rejects(h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK}),{status:409});
 assert.equal(h.calls.length,0,'no network before permission checks');
});
test('captures after HTTP response, deduplicates unchanged bytes and retains revisions without deletion',async t=>{
 const h=await fixture(t);
 const first=await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 assert.equal(first.deduplicated,false);
 assert.equal(first.capturedAt,T3);
 assert.equal(h.calls.length,1);
 const second=await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 assert.equal(second.deduplicated,true);
 assert.equal(second.snapshotId,first.snapshotId);
 h.setSource('<html><h1>Updated regulatory notice</h1></html>');
 const third=await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 assert.notEqual(third.bodySha256,first.bodySha256);
 const saved=(await h.archive.snapshots({runId:RUN})).snapshots;
 assert.equal(saved.length,2);
 assert(saved.every(x=>x.documentMeaningVerified===false));
 await h.archive.close();
 const reopen=createOutcomeEvidenceArchive({validation:h.validation,filename:h.filename,
  now:()=>T3,fetchImpl:async()=>response('NO NETWORK SHOULD RUN ON READ')});
 assert.equal((await reopen.snapshots({runId:RUN})).snapshots.length,2);
});
test('source archive tampering fails closed before export and snapshot list',async t=>{
 const h=await fixture(t);
 await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 await h.archive.close();
 const raw=await readFile(h.filename,'utf8');
 await writeFile(h.filename,raw.replace('Official regulatory statement','Forged regulatory statement'));
 const reopen=createOutcomeEvidenceArchive({validation:h.validation,filename:h.filename,
  now:()=>T3,fetchImpl:async()=>response()});
 await assert.rejects(reopen.snapshots(),{status:500});
 await assert.rejects(reopen.dataset(),{status:500});
});
test('as-of exports include no future source snapshots; manifest is stable and status is not prediction accuracy',async t=>{
 const h=await fixture(t);
 const before=await h.archive.dataset({asOf:T2});
 assert.equal(before.rows.length,1);
 assert.equal(before.rows[0].sourceSnapshots.length,0);
 assert.equal(before.rows[0].groundTruthVerified,false);
 assert.equal(before.metrics.precision,null);
 assert.equal(before.metrics.verifiedFalsePositiveRate,null);
 await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 const old=await h.archive.dataset({asOf:T2});
 assert.deepEqual(old,before,'captured document after cutoff cannot alter historical dataset');
 const current=await h.archive.dataset({asOf:T3});
 assert.equal(current.rows[0].sourceSnapshots.length,1);
 assert.equal(current.rows[0].sourceSnapshots[0].bodySha256,H(Buffer.from('<html><h1>Official regulatory statement</h1></html>')));
 assert.equal((await h.archive.dataset({asOf:T3})).manifestSha256,current.manifestSha256);
 assert(!JSON.stringify(current).includes('Reviewer_A'));
 assert(!JSON.stringify(current).includes('private rationale'));
 const csv=prospectiveDatasetCsv(current);
 assert(csv.includes('manifestSha256='+current.manifestSha256));
 assert(csv.includes('sourceDigestList'));
 assert(!csv.includes('Reviewer_A'));
 const empty=await h.archive.dataset({asOf:'2026-11-13T00:00:00.000Z'});
 assert.equal(empty.rows.length,0);
 assert.equal(empty.metrics.groundTruthCases,0);
 await assert.rejects(h.archive.dataset({asOf:'2026-11-20T00:00:00.000Z'}),{status:400});
});
test('bounded snapshot capacity preserves stored evidence and rejects further capture',async t=>{
 const h=await fixture(t,{maxSnapshots:1});
 await h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK});
 h.setSource('<html>revision next</html>');
 await assert.rejects(h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK}),{status:409});
 assert.equal((await h.archive.snapshots()).snapshots.length,1);
});
test('HTTP requires local explicit write and exposes read-only JSON and CSV without arbitrary URL execution',async t=>{
 const h=await fixture(t);
 const handle=createOutcomeEvidenceApi({service:h.archive,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/outcome-evidence/';
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'snapshots')).status,200);
 const body=JSON.stringify({runId:RUN,registrationId:REG,sourceUrl:LINK});
 assert.equal((await fetch(url+'capture',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Outcome-Capture':'1',
   Origin:'https://attacker.invalid'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Outcome-Capture':'1'},
  body:JSON.stringify({runId:RUN,registrationId:REG,sourceUrl:LINK,arbitrary:'bad'})})).status,400);
 const ok=await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Outcome-Capture':'1'},body});
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).documentMeaningVerified,false);
 assert.equal((await fetch(url+'snapshots?runId=../.env')).status,400);
 const dataset=await (await fetch(url+'dataset?format=json&asOf='+encodeURIComponent(T3))).json();
 assert.equal(dataset.rows[0].sourceSnapshots.length,1);
 const csv=await fetch(url+'dataset?format=csv&asOf='+encodeURIComponent(T3));
 assert.equal(csv.status,200);
 assert.match(csv.headers.get('content-type'),/text\/csv/);
 assert((await csv.text()).includes(dataset.manifestSha256));
 assert.equal((await fetch(url+'dataset?format=xml')).status,400);
});
test('v0.36 workspace, route and Level 3 navigation are grounded in the same audited run',async()=>{
 const read=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,server,nav]=await Promise.all([
  read('agent-validation.html'),read('agent-validation.js'),read('server.mjs'),read('hierarchy-navigation.js')]);
 for(const id of ['official-source-evidence','captureSourceForm','captureOfficialSource',
  'dataset-export','downloadDatasetJson','downloadDatasetCsv','datasetStatus'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/outcome-evidence/'));
 assert(js.includes('URL.createObjectURL'));
 assert(server.includes('createOutcomeEvidenceApi'));
 assert(server.includes("if(await handleOutcomeEvidence(req,res,u))return;"));
 assert(nav.includes("href:'/agent-validation.html#dataset-export'"));
});

test('nonloopback-disabled archive refuses private dataset/snapshot reads as well as writes',async t=>{
 const h=await fixture(t,{enabled:false});
 assert.equal(h.archive.status().enabled,false);
 await assert.rejects(h.archive.dataset(),{status:403});
 await assert.rejects(h.archive.snapshots(),{status:403});
 await assert.rejects(h.archive.capture({runId:RUN,registrationId:REG,sourceUrl:LINK}),{status:403});
 assert.equal(h.calls.length,0);
});
test('CSV exporter neutralizes spreadsheet formula-leading cells in user-provided question fields',()=>{
 const dataset={version:'PROSPECTIVE-RESEARCH-DATASET-0.36.1',asOf:T3,manifestSha256:'abc',
 rows:[{runId:'=DANGEROUS()',eventId:'+42',sourceSnapshots:[],operatorDeclaredCohort:'CONTROL'}]};
 const csv=prospectiveDatasetCsv(dataset);
 assert(!csv.includes('"=DANGEROUS()"'));
 assert(csv.includes('\u200b=DANGEROUS()'));
 assert(csv.includes('\u200b+42'));
});
