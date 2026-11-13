import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createRegulatoryApi} from '../lib/regulatory-api.mjs';
const NOW=Date.parse('2026-11-12T21:30:00Z'),ACCESSION='0000001234-26-000001';
const filing={accession:ACCESSION,sourceUrl:'https://www.sec.gov/Archives/edgar/data/1234/000000123426000001/filing.htm',form:'8-K'};
const data={cik:1234,entityName:'Sample issuer',facts:{'us-gaap':{IncomeTaxExpenseBenefit:{units:{USD:[{val:500,form:'10-K',accn:ACCESSION,start:'2025-01-01',end:'2025-12-31',filed:'2026-02-20'}]}}}}};
let reads=0,captures=0;const deps={now:()=>NOW,sources:{companyFacts:async()=>({facts:data}),filings:async()=>({filings:[filing],fetchedAt:'2026-11-12T20:00:00Z'})},
 filingReader:{read:async()=>{reads++;return {evidence:[],items:[]};}},classifyCorporateEvent:()=>({sourceEventId:'sec:'+ACCESSION,sourceUrl:filing.sourceUrl,headline:'Sample 8-K',type:'FILING',category:'CORPORATE',symbol:'EXM',form:'8-K',accession:ACCESSION,cik:'0000001234',filingDate:'2026-11-12',classifications:[],evidence:[],summary:[],retrospective:true,contentRevision:'a'.repeat(64),classificationVersion:'test'}),
 corporateStore:{list:async()=>[],record:async()=>({action:'imported',alert:null})},
 eventArchive:{list:async()=>({events:[]}),ingest:async()=>{captures++;return {action:'created',eventId:'sec:'+ACCESSION,revision:{id:'REV-1',capturedAt:'2026-11-12T21:30:00Z'}};}}};
async function call(handler,path,{method='GET',headers={},payload=null,remoteAddress='127.0.0.1'}={}){
 const req=Readable.from(payload===null?[]:[Buffer.from(JSON.stringify(payload))]);req.method=method;req.headers=headers;req.socket={remoteAddress};
 const res={writableEnded:false,destroyed:false,writeHead(s){this.status=s;},end(s){this.data=JSON.parse(s);this.writableEnded=true;}};
 const handled=await handler(req,res,new URL(path,'http://127.0.0.1:8000'));return {handled,...res};}
test('tax endpoint is read-only, evidence-backed and rejects future cutoffs',async()=>{
 const h=createRegulatoryApi(deps),result=await call(h,'/api/regulatory/tax?symbol=EXM&asOf=2026-11-12');
 assert.equal(result.status,200);assert.equal(result.data.observations.find(x=>x.metricId==='income_tax_expense').value,500);
 assert.equal((await call(h,'/api/regulatory/tax?symbol=EXM&asOf=2027-01-01')).status,400);
 assert.equal(captures,0);assert.equal(reads,0);
});
test('filing-analysis provides cited classifications without writing archive',async()=>{
 const h=createRegulatoryApi(deps),r=await call(h,'/api/regulatory/filing-analysis?symbol=EXM&accession='+ACCESSION);
 assert.equal(r.status,200);assert.equal(r.data.persisted,false);assert.equal(reads,1);assert.equal(captures,0);
 assert.equal((await call(h,'/api/regulatory/filing-analysis?symbol=EXM&accession=BAD')).status,400);
});
test('capture disabled by default; when enabled requires same-origin loopback and JSON',async()=>{
 const base='/api/regulatory/capture';const input={symbol:'EXM',accession:ACCESSION};const header={'content-type':'application/json',host:'127.0.0.1:8000',origin:'http://127.0.0.1:8000'};
 assert.equal((await call(createRegulatoryApi(deps),base,{method:'POST',headers:header,payload:input})).status,403,'capture is disabled unless explicitly enabled');
 // Remote and cross-site capture are independently blocked.
 const enabled=createRegulatoryApi({...deps,captureEnabled:true});
 assert.equal((await call(enabled,base,{method:'POST',headers:header,payload:input,remoteAddress:'192.0.2.10'})).status,403);
 assert.equal((await call(enabled,base,{method:'POST',headers:{...header,origin:'https://other.example'},payload:input})).status,403);
 const ok=await call(enabled,base,{method:'POST',headers:header,payload:input});assert.equal(ok.status,201);assert.equal(ok.data.archive.action,'created');assert.equal(captures,1);
});


test('exact archived revision can create and attach an SEC investigation only through local protected handoff',async()=>{
 const ref='REV-11111111-1111-4111-8111-111111111111',eventId='sec:'+ACCESSION,archive={source:'SEC_EDGAR',eventId,revision:{id:ref,event:{symbols:['EXM']}}};
 let created=0,attached=0;
 const secure=createRegulatoryApi({...deps,captureEnabled:true,
  eventArchive:{...deps.eventArchive,getRevision:async()=>archive,revisions:async()=>({revisions:[archive.revision]}),atCutoff:async()=>({status:'observed'})},
  caseStore:{createFromArchivedRevision:async()=>{created++;return {id:'CASE-11111111-1111-4111-8111-111111111111'};},
   attachArchivedRevision:async()=>{attached++;return {revision:2};}}});
 const body={eventId,revisionId:ref,symbol:'EXM'};
 const headers={'content-type':'application/json',host:'127.0.0.1:8000',origin:'http://127.0.0.1:8000'};
 const latest=await call(secure,'/api/regulatory/archive/revision?eventId='+eventId+'&revisionId='+ref);
 assert.equal(latest.status,200);assert.equal(latest.data.revision.id,ref);
 assert.equal((await call(secure,'/api/regulatory/archive/revisions?eventId='+eventId)).status,200);
 assert.equal((await call(secure,'/api/regulatory/archive/at-cutoff?eventId='+eventId+'&cutoff=2026-11-12T21:00:00Z')).status,200);
 const deny=await call(secure,'/api/regulatory/investigate',{method:'POST',payload:body,headers,remoteAddress:'192.0.2.12'});
 assert.equal(deny.status,403);
 const cross=await call(secure,'/api/regulatory/investigate',{method:'POST',payload:body,headers:{...headers,origin:'https://hostile.example'}});
 assert.equal(cross.status,403);
 const wrong=await call(secure,'/api/regulatory/investigate',{method:'POST',payload:{...body,symbol:'AAPL'},headers});
 assert.equal(wrong.status,422);
 const ok=await call(secure,'/api/regulatory/investigate',{method:'POST',payload:body,headers});
 assert.equal(ok.status,201);assert.equal(ok.data.case.id,'CASE-11111111-1111-4111-8111-111111111111');
 assert.equal(created,1);
 const attach=await call(secure,'/api/regulatory/investigate',{method:'POST',payload:{...body,caseId:ok.data.case.id,expectedRevision:1},headers});
 assert.equal(attach.status,200);assert.equal(attached,1);
 const disabled=createRegulatoryApi({...deps,eventArchive:{...deps.eventArchive,getRevision:async()=>archive},caseStore:{createFromArchivedRevision:async()=>{created++;}}});
 assert.equal((await call(disabled,'/api/regulatory/investigate',{method:'POST',payload:body,headers})).status,403);
 assert.equal(created,1);
});
