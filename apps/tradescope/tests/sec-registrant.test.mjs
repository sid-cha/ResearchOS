import test from 'node:test';
import assert from 'node:assert/strict';
import {secSubmissionUrl,normalizeSecRegistrant,createSecRegistrantLookup} from '../lib/sec-registrant.mjs';
const cik='0001285785',now=()=>new Date('2026-11-13T17:00:00Z');
const raw=()=>({cik:1285785,name:'Example SEC Registrant',tickers:['MOS'],
 exchanges:['NYSE'],entityType:'operating',sic:'2870',filings:{recent:{
 form:['10-K','10-Q','8-K'],filingDate:['2026-02-25','2026-08-15','2026-10-02'],
 accessionNumber:['0001285785-26-000010','0001285785-26-000050','0001285785-26-000070'],
 primaryDocument:['form10k.htm','form10q.htm','form8k.htm']}}});
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
test('SEC submissions endpoint enforces fixed official origin and padded ten-digit CIK',()=>{
 const u=secSubmissionUrl(cik);
 assert.equal(u.origin,'https://data.sec.gov');assert.equal(u.pathname,'/submissions/CIK'+cik+'.json');
 assert.throws(()=>secSubmissionUrl('https://evil.invalid'),e=>e.status===400);
 assert.throws(()=>secSubmissionUrl('1285785'),e=>e.status===400);
});
test('official SEC normalization provides identity and bounded SEC filing links, not facility ownership',()=>{
 const n=normalizeSecRegistrant(raw(),{cik,fetchedAt:'2026-11-13T17:00:00Z'});
 assert.equal(n.cik,cik);assert.equal(n.registrantName,'Example SEC Registrant');
 assert.equal(n.tickers[0],'MOS');assert.equal(n.recentFilings.length,3);
 assert(n.recentFilings[0].url.startsWith('https://www.sec.gov/Archives/edgar/data/'));
 assert.equal(n.legalSubsidiaryOperatorVerified,false);
 assert.equal(n.historicalAsOfEligible,false);
 assert.equal(n.originalPublicationTimeVerified,false);
});
test('SEC source rejects mismatched CIK, absent recent filing columns and oversized ticker list',()=>{
 assert.throws(()=>normalizeSecRegistrant({...raw(),cik:654321},{cik}),e=>e.status===502);
 assert.throws(()=>normalizeSecRegistrant({...raw(),filings:{recent:{}}},{cik}),e=>e.status===502);
 assert.throws(()=>normalizeSecRegistrant({...raw(),tickers:Array(40).fill('MOS')},{cik}),e=>e.status===502);
});
test('SEC live client enforces contact user agent, caches normalized metadata and hides credential',async()=>{
 let calls=0,seen;
 const svc=createSecRegistrantLookup({env:{SEC_USER_AGENT:'TradeScope Research researcher@example.com'},
  now,fetchImpl:async(url,options)=>{calls++;seen={url,options};return response(raw());}});
 const a=await svc.lookup(cik),b=await svc.lookup(cik);
 assert.equal(calls,1);assert.equal(a.cik,b.cik);
 assert.equal(seen.url.hostname,'data.sec.gov');
 assert.equal(seen.options.redirect,'error');
 assert.equal(svc.catalog().configured,true);
 assert(!JSON.stringify(a).includes('researcher@example.com'));
});
test('SEC source fails clearly without configured user agent or for invalid upstream content',async()=>{
 const missing=createSecRegistrantLookup({env:{},now,fetchImpl:async()=>response(raw())});
 await assert.rejects(missing.lookup(cik),e=>e.status===503);
 const bad=createSecRegistrantLookup({env:{SEC_USER_AGENT:'TradeScope Research researcher@example.com'},
  fetchImpl:async()=>new Response('<html>',{status:200,headers:{'content-type':'text/html'}})});
 await assert.rejects(bad.lookup(cik),e=>e.status===502);
 const notReady=createSecRegistrantLookup({env:{SEC_USER_AGENT:'TradeScope Research researcher@example.com'},
  fetchImpl:async()=>response({error:'secret provider response'},429)});
 await assert.rejects(notReady.lookup(cik),e=>e.status===429&&!e.message.includes('secret'));
});
