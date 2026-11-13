import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createRegulatoryApi} from '../regulatory-api.mjs';
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