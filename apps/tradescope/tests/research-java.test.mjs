import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJavaResearchAdapter} from '../lib/research-java.mjs';
import {INSTRUMENTS,METRIC_DEFINITIONS} from '../lib/research-catalog.mjs';
import {buildTechnicalMetrics} from '../lib/research-technical.mjs';
import {buildFinancialMetrics} from '../lib/research-fundamentals.mjs';
import {dailyBars,companyFactsFixture,RESEARCH_NOW} from './helpers/research-fixtures.mjs';
const TOKEN='controlled-test-token-000000000000';
const env={RESEARCH_API_TOKEN:TOKEN};
const snapshot=()=>({instrument:INSTRUMENTS.find(item=>item.symbol==='MSFT'),checkedAt:new Date(RESEARCH_NOW).toISOString(),observations:[...buildTechnicalMetrics(dailyBars(),{symbol:'MSFT',now:RESEARCH_NOW,fetchedAt:new Date(RESEARCH_NOW).toISOString()}).observations,...buildFinancialMetrics(companyFactsFixture(),{symbol:'MSFT',asOf:'2026-11-12',fetchedAt:new Date(RESEARCH_NOW).toISOString()}).observations]});
const receipt=payload=>({schemaVersion:1,instrumentId:payload.instrument.instrumentId,capturedAt:payload.capturedAt,receivedCount:payload.observations.length,upsertedCount:payload.observations.length});
const registeredInstrument=()=>({instrumentId:'US_EQUITY:COST',symbol:'COST',name:'COSTCO WHOLESALE CORP',type:'unknown',currency:'USD',classification:'unavailable',cik:'0000909832',issuerId:'SEC_CIK:0000909832',identitySource:'SEC_COMPANY_TICKERS_EXCHANGE',sourceUrl:'https://www.sec.gov/files/company_tickers_exchange.json',verifiedAt:'2026-11-12T17:00:00Z',exchange:'Nasdaq'});

test('registered SEC identities beyond the seed preserve unknown type and dated issuer provenance',async()=>{
 const input=snapshot();input.instrument=registeredInstrument();input.instrument.privateField='PRIVATE';let sent;
 const adapter=createJavaResearchAdapter({env,fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return Response.json(receipt(sent));}});
 assert.equal((await adapter.syncSnapshot(input)).instrumentId,'US_EQUITY:COST');
 assert.equal(sent.instrument.type,'unknown');assert.equal(sent.instrument.cik,'0000909832');assert.equal(sent.instrument.issuerId,'SEC_CIK:0000909832');
 assert.equal(sent.instrument.verifiedAt,'2026-11-12T17:00:00Z');assert(!JSON.stringify(sent).includes('PRIVATE'));
});

test('new symbols require matching directory attestation and reject arbitrary issuer reassignment before network',async()=>{
 let calls=0;const adapter=createJavaResearchAdapter({env,fetchImpl:async()=>{calls++;throw Error();}});
 const changes=[item=>delete item.identitySource,item=>item.cik='909832',item=>item.cik='0000000000',item=>item.issuerId='SEC_CIK:0000123456',item=>item.sourceUrl='https://foreign.example/company_tickers_exchange.json',item=>item.verifiedAt='2099-01-01T00:00:00Z',item=>item.symbol='COST?secret',item=>item.exchange='Nasdaq\nprivate'];
 for(const change of changes){const input=snapshot();input.instrument=registeredInstrument();change(input.instrument);await assert.rejects(adapter.syncSnapshot(input),{status:400});}
 const mismatch=snapshot();mismatch.instrument={...registeredInstrument(),symbol:'MSFT',instrumentId:'US_EQUITY:MSFT'};await assert.rejects(adapter.syncSnapshot(mismatch),{status:400});
 assert.equal(calls,0);
});

test('bridge health reports broader identity support only when the Java service advertises it',async()=>{
 const current=createJavaResearchAdapter({env,fetchImpl:async()=>Response.json({schemaVersion:1,ready:true,storage:'postgresql',identityContractVersion:1,maxInstruments:50})});
 assert.equal((await current.health()).maxInstruments,50);
 const legacy=createJavaResearchAdapter({env,fetchImpl:async()=>Response.json({schemaVersion:1,ready:true,storage:'postgresql'})});
 assert.equal((await legacy.health()).maxInstruments,10);assert.equal((await legacy.health()).identityContractVersion,0);
});

test('Java metric identifiers and units stay compatible with the workstation catalog',async()=>{
 const resource=await readFile(new URL('../../api/src/main/resources/research-metrics-v1.tsv',import.meta.url),'utf8');
 const actual=resource.trim().split(/\r?\n/).map(line=>line.split(/\t|\\t/));
 assert(actual.every(pair=>pair.length===2));assert.equal(new Set(actual.map(pair=>pair[0])).size,actual.length);
 const sorted=pairs=>pairs.sort((left,right)=>left[0].localeCompare(right[0]));
 assert.deepEqual(sorted(actual),sorted(METRIC_DEFINITIONS.map(metric=>[metric.id,metric.unit])));
});

test('optional backend is disabled without token and invalid configuration never fetches or crashes the app',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not fetch');};
 assert.equal((await createJavaResearchAdapter({env:{},fetchImpl}).health()).status,'disabled');
 for(const RESEARCH_JAVA_ORIGIN of ['https://127.0.0.1:8080','http://external.example','http://127.0.0.1:8080/path','http://user:pass@127.0.0.1:8080','http://127.0.0.1?query=private']){
  const adapter=createJavaResearchAdapter({env:{...env,RESEARCH_JAVA_ORIGIN},fetchImpl});assert.deepEqual((await adapter.health()).configured,false);await assert.rejects(adapter.syncSnapshot(snapshot()),{status:503});
 }
 assert.equal((await createJavaResearchAdapter({env:{RESEARCH_API_TOKEN:'short'},fetchImpl}).health()).status,'invalid_configuration');assert.equal(calls,0);
});
test('health uses fixed authenticated loopback path and exposes no configuration secrets',async()=>{
 const adapter=createJavaResearchAdapter({env,fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:8080/api/research/v1/health');assert.equal(options.redirect,'error');assert.equal(options.headers['X-Research-Token'],TOKEN);return Response.json({schemaVersion:1,ready:true,storage:'postgresql',token:TOKEN});
 }});const status=await adapter.health();assert.equal(status.status,'available');assert(!JSON.stringify(status).includes(TOKEN));
});
test('explicit snapshot sync preserves typed metrics and fiscal provenance but strips raw inputs and secret fields',async()=>{
 const input=snapshot();input.observations[0].apiKey='PRIVATE';input.observations[0].details.rawBars=['PRIVATE'];
 let sent;const adapter=createJavaResearchAdapter({env,fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:8080/api/research/v1/metric-snapshots');assert.equal(options.method,'POST');sent=JSON.parse(options.body);assert(!options.body.includes('PRIVATE'));return Response.json({...receipt(sent),secret:'PRIVATE'});
 }});const result=await adapter.syncSnapshot(input);assert.equal(sent.observations.length,65);assert.equal(result.upsertedCount,65);assert(!JSON.stringify(result).includes('PRIVATE'));
 const financial=sent.observations.find(item=>item.id==='financial.revenueQuarter');assert.equal(financial.periodEnd,'2026-09-30');assert.equal(financial.details.inputs[0].namespace,'us-gaap');assert.equal(financial.details.inputs[0].periodEnd,'2026-09-30');
 assert.equal(sent.observations.find(item=>item.id==='technical.breakout20').value,false);assert.equal(sent.observations.find(item=>item.id==='valuation.forwardPE').value,null);
});
test('invalid metrics, dates, units, scalar readiness and payload bounds fail before network',async()=>{
 let calls=0;const adapter=createJavaResearchAdapter({env,fetchImpl:async()=>{calls++;throw Error();}});
 const changes=[item=>item.observations[0].id='unknown.metric',item=>item.observations[0].unit='percent',item=>item.observations[0].value=Infinity,item=>item.observations[0].asOf='2026-02-30',item=>item.observations[0].asOf=null,item=>item.observations[0].status='unsupported'];
 for(const change of changes){const input=snapshot();change(input);await assert.rejects(adapter.syncSnapshot(input),{status:400});}
 const input=snapshot();input.observations=Array.from({length:101},()=>input.observations[0]);await assert.rejects(adapter.syncSnapshot(input),{status:400});assert.equal(calls,0);
});
test('provider exceptions and rejected bodies are sanitized for both health and explicit sync',async()=>{
 const adapter=createJavaResearchAdapter({env,fetchImpl:async()=>new Response('PRIVATE_UPSTREAM_TOKEN',{status:401})});
 assert.equal((await adapter.health()).status,'unavailable');await assert.rejects(adapter.syncSnapshot(snapshot()),error=>error.status===502&&!error.message.includes('PRIVATE'));
 const broken=createJavaResearchAdapter({env,fetchImpl:async()=>{throw Error('PRIVATE_NETWORK_ERROR');}});await assert.rejects(broken.syncSnapshot(snapshot()),error=>error.status===502&&!error.message.includes('PRIVATE'));
});
test('oversized response and malformed success receipts are rejected',async()=>{
 for(const fetchImpl of [async()=>new Response('x'.repeat(300000)),async()=>Response.json({schemaVersion:1,upsertedCount:999}),async()=>new Response('not json')]){
  const adapter=createJavaResearchAdapter({env,fetchImpl});await assert.rejects(adapter.syncSnapshot(snapshot()),{status:502});
 }
});
test('request deadline aborts an unresponsive backend without leaking provider details',async()=>{
 const adapter=createJavaResearchAdapter({env,timeoutMs:5,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('PRIVATE','AbortError'))))});
 await assert.rejects(adapter.syncSnapshot(snapshot()),{status:504});
});
