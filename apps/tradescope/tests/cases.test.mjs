import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCaseStore} from '../lib/cases.mjs';
import {createCaseApi} from '../lib/case-api.mjs';
import http from 'node:http';

const fixture = {
 symbol:'NVDA',
 event:{id:'news:100001',source:'ALPACA_NEWS',headline:'Illustrative source headline',type:'COMPANY_NEWS',category:'CORPORATE',publishedAt:'2026-10-02T14:00:00Z',sourceUrl:'https://example.com/filing',symbols:['NVDA'],summary:'Source record, not proof of price causality.'},
 context:{technicalSource:'ALPACA_IEX / REAL BARS',technical:{close:150,rsi14:55.2,sma20:146.9,notTrusted:99},financialSource:'SEC XBRL / ACTUAL',fundamentals:{source:'SEC EDGAR / XBRL',quarterly:{revenue:{value:123000000,periodEnd:'2026-09-30',filingDate:'2026-10-30',yoyPct:5.3}}},study:{study:{status:'observed',referenceSession:'2026-10-02',horizons:[{sessions:1,status:'observed',relativeReturnPct:-1.28,stockReturnPct:-1.4,benchmarkReturnPct:-.12}]}}}
};

test('investigation store persists cases, provenance, context, notes and audit across restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-cases-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'cases.json');
 const store=createCaseStore(path);const created=await store.create(fixture);
 assert.equal(created.event.source,'ALPACA_NEWS');assert.equal(created.relationship,'PROVIDER_TAGGED');assert.equal(created.context.technical.rsi14,55.2);assert.equal(created.context.technical.notTrusted,undefined);assert.equal(created.context.fundamentals.quarterly.revenue.periodEnd,'2026-09-30');assert.equal(created.context.study.study.horizons[0].relativeReturnPct,-1.28);
 assert.equal(created.evidence.length,1);assert.equal(created.audit[0].action,'CASE_CREATED');
 const updated=await store.update(created.id,{expectedRevision:1,status:'IN_REVIEW',priority:'HIGH',assignee:'Analyst',conclusion:'TEMPORAL_ASSOCIATION',summary:'A relationship may exist, not proven.'});
 const noted=await store.addNote(created.id,{expectedRevision:2,body:'Review competing sector news.',author:'Analyst'});
 const sourced=await store.addEvidence(created.id,{expectedRevision:3,label:'Original company statement',url:'https://example.com/source',kind:'FILING'});
 assert.equal(sourced.revision,4);assert.equal(sourced.audit.length,4);
 assert.equal(sourced.notes[0].body,'Review competing sector news.');assert.equal(sourced.status,'IN_REVIEW');
 const fromDisk=JSON.parse(await readFile(path,'utf8'));assert.equal(fromDisk.schema,1);assert.equal(fromDisk.cases[0].id,created.id);
 const reopened=await createCaseStore(path).get(created.id);assert.deepEqual(reopened,sourced);
 const list=await createCaseStore(path).list({status:'IN_REVIEW',search:'NVDA'});assert.equal(list.length,1);
 await assert.rejects(store.update(created.id,{expectedRevision:1,status:'CLOSED'}),{status:409});
 await assert.rejects(store.addEvidence(created.id,{expectedRevision:4,label:'Unsafe',url:'file:///etc/passwd'}),{status:400});
 await assert.rejects(store.create({...fixture,event:{...fixture.event,sourceUrl:null,headline:'',id:'bad'}}),{status:400});
 assert.equal(updated.priority,'HIGH');assert.equal(noted.notes.length,1);
});

test('case API supports create, browse, patch, note, evidence and JSON export',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-case-http-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const handle=createCaseApi({filename:join(dir,'cases.json')});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(!await handle(req,res,url)){res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const req=async (path,method='GET',payload)=>{const res=await fetch(base+path,{method,headers:payload?{'Content-Type':'application/json'}:undefined,body:payload?JSON.stringify(payload):undefined});return {status:res.status,body:await res.json()};};
 let r=await req('/api/cases','POST',fixture);assert.equal(r.status,201);const id=r.body.id;
 r=await req('/api/cases');assert.equal(r.body.cases.length,1);
 r=await req(`/api/cases/${id}`,'PATCH',{expectedRevision:1,status:'NEEDS_EVIDENCE',conclusion:'INCONCLUSIVE'});assert.equal(r.status,200);assert.equal(r.body.status,'NEEDS_EVIDENCE');
 r=await req(`/api/cases/${id}/notes`,'POST',{expectedRevision:2,body:'Independent verification required'});assert.equal(r.status,201);assert.equal(r.body.notes.length,1);
 r=await req(`/api/cases/${id}/evidence`,'POST',{expectedRevision:3,label:'Independent analyst citation',url:'https://example.org/citation',kind:'ANALYST_REFERENCE'});assert.equal(r.status,201);assert.equal(r.body.evidence.length,2);
 r=await req(`/api/cases/${id}/export`);assert.equal(r.status,200);assert.equal(r.body.revision,4);
 r=await req(`/api/cases/${id}`,'PATCH',{expectedRevision:1,status:'CLOSED'});assert.equal(r.status,409);
 r=await req('/api/cases?status=CLOSED');assert.equal(r.body.cases.length,0);
 r=await req('/api/cases/no-such-id');assert.equal(r.status,404);
});
