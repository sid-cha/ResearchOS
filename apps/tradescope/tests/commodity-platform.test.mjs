import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {commoditySearchUrl,normalizeOfficialDocs,createOfficialCommodityFeed,companyProfiles,
 createCommodityLedger,createCommodityWorkbench,createCommodityApi} from '../lib/commodity-platform.mjs';

const now=()=>new Date('2026-11-13T12:00:00Z');
const doc=(number='2026-12345',title='Potash import notice')=>({
 document_number:number,publication_date:'2026-10-21',title,
 abstract:'Government document discussing fertilizer import arrangements and trade.',
 type:'NOTICE',html_url:'https://www.federalregister.gov/d/'+number
});
const result=()=>({results:[doc()]});
const response=(body,status=200,contentType='application/json')=>new Response(
 typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':contentType}}
);
const fakeFeed=async commodity=>normalizeOfficialDocs(result(),{
 commodity,fetchedAt:'2026-11-13T12:00:00Z',today:'2026-11-13'
});
const temp=async t=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'tradescope-commodity-'));
 t.after(()=>fs.rm(d,{recursive:true,force:true}));
 return path.join(d,'pilot.json');
};
test('official query is restricted to commodity keyword families and fixed federalregister host',()=>{
 const url=new URL(commoditySearchUrl('potash'));
 assert.equal(url.origin,'https://www.federalregister.gov');
 assert.equal(url.pathname,'/api/v1/documents.json');
 assert.equal(url.searchParams.get('conditions[term]'),'potash');
 assert.equal(url.searchParams.get('per_page'),'15');
 assert.throws(()=>commoditySearchUrl('gold'),/supported/);
 assert.throws(()=>commoditySearchUrl('https://malicious.test'),/supported/);
});
test('official document parser retains issue date and provenance, never asserts a confirmed disruption',()=>{
 const output=normalizeOfficialDocs(result(),{commodity:'potash',today:'2026-11-13'});
 assert.equal(output.results.length,1);
 const event=output.results[0];
 assert.equal(event.id,'fr:2026-12345:potash');
 assert.equal(event.publishedDate,'2026-10-21');
 assert.equal(event.confirmedDisruption,false);
 assert.equal(event.observedIssuerImpact,false);
 assert.equal(event.actualCommodityPriceImpact,null);
 assert.equal(event.sourceUrl,'https://www.federalregister.gov/d/2026-12345');
 assert.equal(event.classification,'KEYWORD_MATCHED_REGULATORY_DOCUMENT');
});
test('future official records are excluded; malformed source document metadata fails closed',()=>{
 const later=doc('2027-10001');later.publication_date='2027-01-10';
 const d=normalizeOfficialDocs({results:[doc(),later,doc()]},{commodity:'urea',today:'2026-11-13'});
 assert.equal(d.results.length,1);
 assert.equal(d.results[0].commodity,'urea');
 assert.throws(()=>normalizeOfficialDocs({results:[{title:'Fake'}]},{commodity:'potash'}),e=>e.status===502);
 assert.throws(()=>normalizeOfficialDocs({results:Array(16).fill(doc())},{commodity:'potash'}),e=>e.status===502);
});
test('bounded source adapter enforces MIME, byte bounds, official dates and transparent errors',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});return response(result());};
 const feed=createOfficialCommodityFeed({fetchImpl,now});
 const one=await feed('phosphate'),two=await feed('phosphate');
 assert.equal(calls.length,1);
 assert.equal(one.commodity,'phosphate');
 assert.equal(two.results[0].confirmedDisruption,false);
 assert.equal(calls[0].opts.redirect,'error');
 const failed=createOfficialCommodityFeed({fetchImpl:async()=>response('private provider error',429),now});
 await assert.rejects(failed('potash'),e=>e.status===429&&!e.message.includes('private provider error'));
 const wrong=createOfficialCommodityFeed({fetchImpl:async()=>response('<html>login</html>',200,'text/html'),now});
 await assert.rejects(wrong('potash'),e=>e.status===502);
 const giant=createOfficialCommodityFeed({fetchImpl:async()=>response('x'.repeat(550100)),now});
 await assert.rejects(giant('potash'),e=>e.status===502);
});
test('SEC issuer profiles are source-linked with no invented event exposure and no future filing leakage',()=>{
 const old=companyProfiles('potash',{asOf:'2025-12-31'});
 assert.equal(old.length,0);
 const potash=companyProfiles('potash',{asOf:'2026-11-13'});
 assert.deepEqual(potash.map(x=>x.symbol),['MOS','IPI']);
 for(const item of potash){
  assert.equal(item.sourceType,undefined);
  assert.equal(item.claimType,'SOURCE_ANCHORED_DISCLOSED_ACTIVITY');
  assert.equal(item.issuerShockImpactVerified,false);
  assert.equal(item.filingCheckedByPrototype,false);
  assert.equal(item.modeledSensitivity,null);
  assert(item.sourceUrl.startsWith('https://www.sec.gov/Archives/edgar/data/'));
 }
 assert.deepEqual(companyProfiles('urea',{asOf:'2026-11-13'}).map(x=>x.symbol),['CF']);
 assert.deepEqual(companyProfiles('phosphate',{asOf:'2026-11-13'}).map(x=>x.symbol),['MOS']);
});
test('append-only local capture records first observed time, deduplicates and versions changed normalized source',async t=>{
 const filename=await temp(t);
 let clockTick=0;
 const ledger=createCommodityLedger({filename,clock:()=>new Date(Date.UTC(2026,10,13,12,0,clockTick++)).toISOString()});
 const initial=normalizeOfficialDocs(result(),{commodity:'potash'}).results[0];
 assert.equal((await ledger.capture([initial])).added,1);
 assert.equal((await ledger.capture([initial])).unchanged,1);
 const changed={...initial,summary:'Corrected official abstract from the source.'};
 assert.equal((await ledger.capture([changed])).changed,1);
 const revisions=await ledger.history(initial.id);
 assert.equal(revisions.length,2);
 assert.equal(revisions[1].firstObservedAt,revisions[0].firstObservedAt);
 assert.equal(revisions[1].previousRevisionId,revisions[0].revisionId);
 assert.match(revisions[1].contentHash,/^[a-f0-9]{64}$/);
 const again=createCommodityLedger({filename});
 assert.equal((await again.get(initial.id)).document.summary,changed.summary);
 assert.equal((await again.list()).length,1);
});
test('local pilot watches are disabled by default, revision controlled and first scan establishes baseline',async t=>{
 const filename=await temp(t),svc=createCommodityWorkbench({filename,feed:fakeFeed});
 const watch=await svc.ledger.createWatch({commodity:'potash',name:'Potash review',intervalMinutes:60});
 assert.equal(watch.enabled,false);
 assert.equal(watch.revision,1);
 const first=await svc.scanWatch(watch.id);
 assert.equal(first.summary.baselineEstablished,true);
 assert.equal(first.summary.newCandidates,0);
 const second=await svc.scanWatch(watch.id);
 assert.equal(second.summary.baselineEstablished,false);
 assert.equal(second.summary.newCandidates,0);
 await assert.rejects(svc.ledger.setWatch(watch.id,{enabled:true,expectedRevision:2}),e=>e.status===409);
 const enabled=await svc.ledger.setWatch(watch.id,{enabled:true,expectedRevision:1});
 assert.equal(enabled.enabled,true);
 assert.equal(enabled.revision,2);
 assert.equal((await svc.ledger.metrics()).completedWatchRuns,2);
});
test('source-backed brief cites exact local evidence and SEC disclosure, abstains from financial predictions',async t=>{
 const filename=await temp(t),svc=createCommodityWorkbench({filename,feed:fakeFeed});
 await svc.scan('potash');
 const event=(await svc.ledger.list('potash'))[0];
 const b=await svc.brief(event.document.id);
 assert.equal(b.coverage.companyDisclosureMatches,2);
 assert.equal(b.coverage.validatedDisruptionEvents,0);
 assert.equal(b.coverage.validatedIssuerImpactEdges,0);
 assert.equal(b.coverage.measuredReturns,0);
 assert.equal(b.predictiveAccuracyMeasured,false);
 assert(b.report.includes('https://www.federalregister.gov/d/2026-12345'));
 assert(b.report.includes('2025 10-K'));
 assert(b.report.includes('NOT VERIFIED'));
 assert(b.report.includes(event.contentHash));
 await assert.rejects(svc.brief('fr:unknown'),e=>e.status===404);
});
test('pilot feedback never invents revenue or verified research-time savings',async t=>{
 const filename=await temp(t),ledger=createCommodityLedger({filename});
 const empty=await ledger.metrics();
 assert.equal(empty.selfReportedSamples,0);
 assert.equal(empty.minutesBeforeMean,null);
 assert.equal(empty.confirmedPayingCustomers,null);
 await ledger.feedback({minutesBefore:90,minutesWith:45,sourceQuality:4,notes:'Useful, needs more sources'});
 const saved=await ledger.metrics();
 assert.equal(saved.selfReportedSamples,1);
 assert.equal(saved.minutesBeforeMean,90);
 assert.equal(saved.minutesWithMean,45);
 assert.equal(saved.independentTimeSavingValidation,false);
 assert.equal(saved.clientAdoptionEvidence,false);
 await assert.rejects(ledger.feedback({minutesBefore:-4,minutesWith:1,sourceQuality:5}),e=>e.status===400);
});
test('on-demand SEC disclosure reader extracts true 10-K passages but cannot assert event loss or trading alpha',async t=>{
 const filename=await temp(t);let reads=0;
 const reader={read:async({filing,symbol})=>{
  reads++;assert.equal(filing.form,'10-K');
  assert(filing.sourceUrl.startsWith('https://www.sec.gov/Archives/edgar/data/'));
  return {fetchedAt:'2026-11-13T12:00:00Z',evidence:[{
   id:'sec-excerpt-1',section:'Item 1',sourceUrl:filing.sourceUrl,
   text:symbol==='CF'?'CF operates major ammonia and urea production facilities in North America.':
    'The filing text describes an unrelated line of business without the expected product terminology.'
  }]};
 }};
 const svc=createCommodityWorkbench({filename,feed:fakeFeed,filingReader:reader});
 const cf=await svc.verifyIssuer('CF');
 assert.equal(cf.status,'PRIMARY_SEC_TEXT_MATCH_FOUND');
 assert.equal(cf.verifiedCommodityBusinessDisclosure,true);
 assert.equal(cf.verifiedSpecificEventExposure,false);
 assert.equal(cf.issuerMarketReturnVerified,false);
 assert.equal(cf.passages[0].section,'Item 1');
 const mos=await svc.verifyIssuer('MOS');
 assert.equal(mos.status,'NO_SUPPORTING_PASSAGE_IN_BOUNDED_EXTRACTION');
 assert.equal(mos.verifiedCommodityBusinessDisclosure,false);
 assert.equal(reads,2);
 await assert.rejects(svc.verifyIssuer('GOOG'),e=>e.status===404);
});
test('revision-safe watch removal does not erase pilot audit runs',async t=>{
 const filename=await temp(t),svc=createCommodityWorkbench({filename,feed:fakeFeed});
 const watch=await svc.ledger.createWatch({commodity:'potash',intervalMinutes:60});
 await svc.scanWatch(watch.id);
 await assert.rejects(svc.ledger.deleteWatch(watch.id,{expectedRevision:9}),e=>e.status===409);
 const removed=await svc.ledger.deleteWatch(watch.id,{expectedRevision:1});
 assert.equal(removed.deleted,true);
 assert.equal(removed.preservedHistoricalRuns,1);
 assert.equal((await svc.ledger.watches()).length,0);
 assert.equal((await svc.ledger.runs()).length,1);
});
test('analyst source reviews are immutable, anchored to captured revisions and do not assert independent validation',async t=>{
 const filename=await temp(t),svc=createCommodityWorkbench({filename,feed:fakeFeed});
 await svc.scan('potash');
 const event=(await svc.ledger.list('potash'))[0].document;
 const first=await svc.ledger.review({eventId:event.id,disposition:'NEEDS_EVIDENCE',
  rationale:'This is an official regulatory document mentioning fertilizer; the market effect is unknown.'});
 assert.equal(first.eventImpactVerified,false);
 assert.equal(first.independentlyValidated,false);
 assert.equal(first.sourceUrl,event.sourceUrl);
 assert.equal(first.revisionId,(await svc.ledger.get(event.id)).revisionId);
 await svc.ledger.review({eventId:event.id,disposition:'RELEVANT_RESEARCH_CANDIDATE',
  rationale:'The source mentions a commodity regulation, but it still needs an independent supply assessment.'});
 const history=await svc.ledger.reviews(event.id);
 assert.equal(history.length,2);
 assert.equal(history[0].disposition,'NEEDS_EVIDENCE');
 const brief=await svc.brief(event.id);
 assert(brief.report.includes('RELEVANT_RESEARCH_CANDIDATE'));
 assert.equal(brief.coverage.validatedDisruptionEvents,0);
 await assert.rejects(svc.ledger.review({eventId:event.id,disposition:'CONFIRMED_MARKET_CRASH',
  rationale:'This is entirely unverified.'}),e=>e.status===400);
 await assert.rejects(svc.ledger.review({eventId:'fr:unknown',disposition:'NEEDS_EVIDENCE',
  rationale:'A reason without an actual source document should not be accepted.'}),e=>e.status===404);
 const second=createCommodityLedger({filename});
 assert.equal((await second.reviews(event.id)).length,2);
});
test('standalone commodity UI assets are allowlisted, self-consistent and parse under Node',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const html=await fs.readFile(path.join(root,'commodity.html'),'utf8');
 const js=await fs.readFile(path.join(root,'commodity.js'),'utf8');
 const css=await fs.readFile(path.join(root,'commodity.css'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'commodity.js'}));
 for(const id of ['commoditySelect','preview','scan','events','candidateCount','revisionCount','companyCount',
  'profiles','briefArea','briefText','briefExport','briefStatus','reviewForm','reviewStatus','watchForm',
  'watches','pilotMetrics','feedbackForm','feedbackStatus','watchStatus','feedStatus']){
  assert(html.includes('id="'+id+'"'),'missing UI node '+id);
 }
 assert(html.includes('href="/commodity.css"'));
 assert(html.includes('src="/commodity.js"'));
 assert(css.includes('.review-form'));
});
test('end-to-end M1–M4 HTTP workflow persists official docs, serves a text brief and restricts writes',async t=>{
 const filename=await temp(t),service=createCommodityWorkbench({filename,feed:fakeFeed});
 const handler=createCommodityApi({service});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const get=(route)=>fetch(base+'/api/commodity/'+route);
 const post=(route,data,method='POST')=>fetch(base+'/api/commodity/'+route,{
  method,headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await get('catalog')).status,200);
 assert.equal((await get('live?commodity=potash')).status,200);
 assert.equal((await get('events')).status,200);
 const scan=await post('scan',{commodity:'potash'});
 assert.equal(scan.status,200);assert.equal((await scan.json()).capture.added,1);
 const events=await (await get('events?commodity=potash')).json();
 assert.equal(events.events.length,1);
 const id=events.events[0].document.id;
 const brief=await get('brief?id='+encodeURIComponent(id));
 assert.equal(brief.status,200);
 assert.equal((await brief.json()).coverage.validatedIssuerImpactEdges,0);
 const file=await get('brief.txt?id='+encodeURIComponent(id));
 assert.equal(file.status,200);
 assert.match(file.headers.get('content-disposition'),/attachment/);
 assert.match(await file.text(),/SEC 2025 10-K/);
 assert.equal((await get('companies?commodity=potash&asOf=2025-12-31')).status,200);
 const created=await post('watches',{commodity:'urea',intervalMinutes:60});
 assert.equal(created.status,201);
 const w=(await created.json()).watch;
 assert.equal(w.enabled,false);
 const patch=await post('watches/'+encodeURIComponent(w.id),{enabled:true,expectedRevision:1},'PATCH');
 assert.equal(patch.status,200);
 const run=await post('watches/'+encodeURIComponent(w.id)+'/scan',{});
 assert.equal(run.status,200);
 assert.equal((await run.json()).summary.baselineEstablished,true);
 assert.equal((await post('reviews',{eventId:id,disposition:'NEEDS_EVIDENCE',rationale:'Relevant source mention but no verified supply change.'})).status,201);
 const reviews=await get('reviews?id='+encodeURIComponent(id));
 assert.equal(reviews.status,200);assert.equal((await reviews.json()).reviews.length,1);
 assert.equal((await post('feedback',{minutesBefore:90,minutesWith:35,sourceQuality:4})).status,201);
 const removed=await post('watches/'+encodeURIComponent(w.id),{expectedRevision:2},'DELETE');
 assert.equal(removed.status,200);assert.equal((await removed.json()).deleted,true);
 assert.equal((await (await get('metrics')).json()).selfReportedSamples,1);
 assert.equal((await post('scan',{commodity:'potash'},'POST')).status,200);
 assert.equal((await get('brief?id=bad')).status,404);
 assert.equal((await get('live?commodity=https://evil.invalid')).status,400);
 assert.equal((await post('scan',{commodity:'potash'},'PATCH')).status,404);
 const badOrigin=await fetch(base+'/api/commodity/scan',{method:'POST',
  headers:{'Content-Type':'application/json','Origin':'https://evil.invalid'},
  body:JSON.stringify({commodity:'potash'})});
 assert.equal(badOrigin.status,403);
});
