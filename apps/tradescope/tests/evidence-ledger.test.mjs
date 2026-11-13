import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createEvidenceLedger,captureFredEvidence,captureDossierEvidence,createEvidenceLedgerApi}
 from '../lib/evidence-ledger.mjs';
import {createFredExplorer} from '../lib/fred-explorer.mjs';
import {createTransmissionDossierApi} from '../lib/transmission-dossier.mjs';

const now=()=>new Date('2026-11-13T20:00:00Z');
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tradescope-evidence-'));
 t.after(()=>fs.rm(dir,{force:true,recursive:true}));
 return path.join(dir,'journal.jsonl');
}
const fred=(value='2.1')=>({source:'FRED_ALFRED_OFFICIAL_API',type:'observations',
 seriesId:'T10Y3M',fetchedAt:'2026-11-13T20:00:00Z',asOf:'2020-02-15',
 sourceUrl:'https://fred.stlouisfed.org/series/T10Y3M',
 observations:[{date:'2020-01-01',value:Number(value),vintageStart:'2019-12-01',vintageEnd:'2020-03-01'}]});
const options={id:'T10Y3M',asOf:'2020-02-15',months:18};
const dossier={scenario:{id:'enso-fertilizer'},mode:'historical',asOf:'2020-02-15',
 regionId:'brazil-south',commodity:'potash',year:null,registryVersion:'scenario-registry-v1',
 coverage:{totalNodes:8,contextNodes:1,contextEvidenceRows:0,totalEdges:7,validatedEdges:0,verifiedIssuerImpacts:0},
 sourceStatuses:[{source:'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION',status:'ISSUE_DATED_ARCHIVE_PAGE_REVISION_UNVERIFIED',eligibleInputRows:1}],
 edges:[{id:'e01',verification:'NOT_VALIDATED',inputCoverage:'ONE_NODE_HAS_CONTEXT'}],
 report:'No observed issuer exposure or return.'};

test('normalized FRED capture records as-of request separate from original release time and no secrets',()=>{
 const x=captureFredEvidence(fred(),options);
 assert.equal(x.requestedAsOf,'2020-02-15');
 assert.equal(x.sourceIssuedAt,null);
 assert.equal(x.sourcePublishedClockVerified,false);
 assert.equal(x.historicalEligibility,'UNVERIFIED_OR_NOT_APPLICABLE');
 assert.equal(x.licenseStatus,'NOT_REVIEWED');
 assert.equal(x.facts[0].value,2.1);
 assert.equal(x.query.months,18);
 assert(!JSON.stringify(x).includes('api_key'));
 const d=captureDossierEvidence(dossier);
 assert.equal(d.facts[0].validatedEdges,0);
 assert(d.facts.find(x=>x.kind==='GRAPH_EDGE').verification==='NOT_VALIDATED');
 assert(!JSON.stringify(d).includes(dossier.report));
});
test('local journal persists across instances and verifies its hash chain',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const first=await ledger.captureFred(fred(),options);
 assert.equal(first.status,'CAPTURED');
 assert.equal(first.record.seq,1);
 assert.equal(first.record.changeStatus,'FIRST_LOCAL_CAPTURE');
 assert.equal(first.record.previousHash,'0'.repeat(64));
 const after=createEvidenceLedger({filename,now});
 const status=await after.status();
 assert.equal(status.entries,1);
 assert.equal(status.integrity,'HASH_CHAIN_VALID');
 assert.equal(status.tamperProof,false);
 const detail=await after.get(1);
 assert.equal(detail.facts[0].value,2.1);
 assert.equal(detail.sourcePublishedClockVerified,false);
 assert(!detail.capturedAt.startsWith('2020'));
});
test('deduplicated unchanged evidence and changed captures link to an earlier same-scope record',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const a=await ledger.captureFred(fred('2.1'),options);
 const same=await ledger.captureFred(fred('2.1'),options);
 const changed=await ledger.captureFred(fred('2.2'),options);
 assert.equal(a.status,'CAPTURED');
 assert.equal(same.status,'UNCHANGED');
 assert.equal(changed.status,'CAPTURED');
 assert.equal(changed.record.seq,2);
 assert.equal(changed.record.priorScopeSeq,1);
 assert.equal(changed.record.changeStatus,'CHANGED_SINCE_LOCAL_CAPTURE');
 assert.equal((await ledger.status()).entries,2);
 assert.equal((await ledger.list({subjectId:'T10Y3M'})).entries.length,2);
 assert.equal(changed.record.previousHash,a.record.recordHash);
 assert.notEqual(changed.record.payloadHash,a.record.payloadHash);
});
test('journal serializes concurrent captures, preserving contiguous hashes and no duplicate scope row',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const results=await Promise.all(Array.from({length:10},()=>ledger.captureFred(fred('1.3'),options)));
 assert.equal(results.filter(r=>r.status==='CAPTURED').length,1);
 assert.equal((await ledger.status()).entries,1);
 const other=await Promise.all([ledger.captureFred(fred('1.5'),options),
  ledger.captureDossier(dossier),ledger.captureFred(fred('1.9'),options)]);
 assert.equal(other.filter(r=>r.status==='CAPTURED').length,3);
 assert.equal((await ledger.status()).entries,4);
});
test('tampering with a captured normalized numeric fact fails verification and prevents further writes',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 await ledger.captureFred(fred('2.1'),options);
 const raw=await fs.readFile(filename,'utf8');
 assert(raw.includes('"value":2.1'));
 await fs.writeFile(filename,raw.replace('"value":2.1','"value":3.9'),'utf8');
 await assert.rejects(ledger.status(),e=>e.status===409);
 await assert.rejects(ledger.captureFred(fred('2.4'),options),e=>e.status===409);
});
test('truncated journal is not silently reset or rewritten',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 await ledger.captureFred(fred(),options);
 await fs.appendFile(filename,'{"partial":', 'utf8');
 await assert.rejects(ledger.list(),e=>e.status===409);
 await assert.rejects(ledger.captureFred(fred('3.1'),options),e=>e.status===409);
});
test('unsupported provider source, arbitrary external URL and large payload fail closed before any persistence',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const fake=captureFredEvidence(fred(),options);
 fake.sourceUrl='https://evil.invalid/steal?api_key=abc';
 await assert.rejects(ledger.append(fake),e=>e.status===400);
 const bad=captureFredEvidence(fred(),options);bad.source='GDELT_UNKNOWN';
 await assert.rejects(ledger.append(bad),e=>e.status===400);
 const large=captureFredEvidence(fred(),options);large.facts=[{value:'a'.repeat(106000)}];
 await assert.rejects(ledger.append(large),e=>e.status===413);
 assert.equal((await ledger.status()).entries,0);
});
test('query filters and read-only HTTP facade never expose persistence paths, credentials or allow remote writes',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 await ledger.captureFred(fred('5.1'),options);
 await ledger.captureDossier(dossier);
 const handler=createEvidenceLedgerApi({ledger});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const root='http://127.0.0.1:'+server.address().port+'/api/evidence-ledger/';
 const status=await (await fetch(root+'status')).json();
 assert.equal(status.entries,2);
 assert(!JSON.stringify(status).includes(filename));
 const bySource=await (await fetch(root+'entries?source=FRED_ALFRED_OFFICIAL_API&subject=T10Y3M&limit=10')).json();
 assert.equal(bySource.entries.length,1);
 const detail=await (await fetch(root+'detail?seq=1')).json();
 assert.equal(detail.facts[0].value,5.1);
 assert(!JSON.stringify(detail).includes('api_key'));
 assert.equal((await fetch(root+'entries?source=unknown')).status,400);
 assert.equal((await fetch(root+'detail?seq=-1')).status,400);
 assert.equal((await fetch(root+'entries?limit=999')).status,400);
 assert.equal((await fetch(root+'status?token=test')).status,400);
 assert.equal((await fetch(root+'status',{method:'POST'})).status,405);
 const disabled=createEvidenceLedgerApi({});
 const offServer=http.createServer((req,res)=>void disabled(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>offServer.listen(0,'127.0.0.1',ok));
 t.after(async()=>{offServer.closeAllConnections();await new Promise(ok=>offServer.close(ok));});
 const off=await (await fetch('http://127.0.0.1:'+offServer.address().port+'/api/evidence-ledger/status')).json();
 assert.equal(off.enabled,false);
});
test('FRED explorer journals an actual normalized historical query only when an opt-in ledger is provided',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const env={FRED_API_KEY:'a'.repeat(32)};
 const observed={realtime_start:'2020-02-15',realtime_end:'2020-02-15',
  observations:[{date:'2020-01-01',value:'2.10',realtime_start:'2019-12-01',realtime_end:'2020-03-01'}]};
 const service=(on)=>createFredExplorer({env,now,ledger:on,fetchImpl:async()=>new Response(JSON.stringify(observed),
  {status:200,headers:{'content-type':'application/json'}})});
 const reply=await service(ledger).query('observations',options);
 assert.equal(reply.observations[0].value,2.1);
 assert.equal((await ledger.status()).entries,1);
 await service(null).query('observations',options);
 assert.equal((await ledger.status()).entries,1);
 const x=await ledger.get(1);assert.equal(x.requestedAsOf,'2020-02-15');
});
test('transmission dossier HTTP request can opt in to summary-only persistent capture',async t=>{
 const filename=await fixture(t),ledger=createEvidenceLedger({filename,now});
 const handler=createTransmissionDossierApi({service:{analyze:async()=>dossier,catalog:()=>({version:1})},ledger});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/transmission-dossier/analysis?id=enso-fertilizer&mode=historical&asOf=2020-02-15');
 assert.equal(response.status,200);
 assert.equal((await ledger.status()).entries,1);
 const details=await ledger.get(1);
 assert.equal(details.kind,'ANALYSIS_SUMMARY');
 assert.equal(details.facts[0].validatedEdges,0);
 assert(!JSON.stringify(details).includes(dossier.report));
});
test('evidence ledger browser is static, read-only and never exposes provider credentials',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const files=await Promise.all(['evidence-ledger.html','evidence-ledger.css','evidence-ledger.js']
  .map(name=>fs.readFile(path.join(root,name),'utf8')));
 const [html,css,js]=files;
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'evidence-ledger.js'}));
 for(const id of ['ledgerMode','entryCount','integrity','lastCaptured','refresh','source','subject',
  'limit','entries','detail','status'])assert(html.includes('id="'+id+'"'));
 assert(html.includes('href="/evidence-ledger.css"'));
 assert(html.includes('src="/evidence-ledger.js"'));
 assert(js.includes('/api/evidence-ledger/'));
 assert(!/method:\s*['"]POST['"]/.test(js));
 assert(!js.includes('api.stlouisfed.org'));
 assert(css.includes('.detail-grid'));
});
