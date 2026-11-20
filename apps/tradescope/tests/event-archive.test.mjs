import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEventArchive} from '../lib/event-archive.mjs';
import {analyzeFilingDocument} from '../lib/filing-intelligence.mjs';
import {classifyCorporateEvent} from '../lib/corporate-intelligence.mjs';

const BASE=Date.parse('2026-11-12T20:00:00Z');
const iso=value=>new Date(value).toISOString();
const quake=(changes={})=>({id:'usgs:fixture-quake',source:'USGS',title:'M 6.3 - Controlled earthquake fixture',type:'EARTHQUAKE',category:'NATURAL',
 occurredAt:'2020-03-10T04:00:00Z',updatedAt:'2026-11-12T19:00:00Z',publishedAt:'2026-11-12T19:00:00Z',providerFirstSeenAt:'2020-03-10T04:00:00Z',
 sourceUrl:'https://earthquake.usgs.gov/earthquakes/eventpage/fixture-quake',latitude:35,longitude:140,depthKm:20,magnitude:6.3,
 knowledgeStatus:'retrospective_catalog',tsunamiFlag:false,symbols:[],...changes});
const filing=(changes={})=>({id:'sec:0001193125-26-448357',source:'SEC EDGAR',headline:'Controlled issuer — 8-K filing',type:'FILING',category:'CORPORATE',
 sourceUrl:'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/fixture.htm',publishedAt:'2026-11-05T11:01:00Z',occurredAt:null,
 symbols:['MSFT'],accession:'0001193125-26-448357',form:'8-K',periodEnd:'2026-09-30',filingDate:'2026-11-05',...changes});
async function setup(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'event-archive-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const filename=join(directory,'events.json');let clock=BASE;
 return {filename,store:createEventArchive({filename,now:()=>clock,...options}),now:()=>clock,set:value=>{clock=value;},advance:milliseconds=>{clock+=milliseconds;}};
}

test('first knowledge is local capture, never provider publication, event time or a reported old observation',async t=>{
 const h=await setup(t),created=await h.store.ingest({event:quake(),observedAt:'2020-03-11T01:00:00Z'});
 assert.equal(created.action,'created');assert.equal(created.eventId,'usgs:fixture-quake');assert.equal(created.revision.capturedAt,iso(BASE));
 assert.equal(created.revision.reportedObservedAt,'2020-03-11T01:00:00Z');assert.equal(created.revision.knowledgeStatus,'retrospective_import');
 assert.equal(created.revision.event.publishedAt,null);assert.equal(created.revision.event.providerFirstSeenAt,null);assert.equal(created.revision.event.providerUpdatedAt,'2026-11-12T19:00:00Z');
 const record=await h.store.get(created.eventId);assert.equal(record.firstObservedAt,iso(BASE));assert.equal(record.lastObservedAt,iso(BASE));
 const before=await h.store.atCutoff(created.eventId,'2026-11-12T19:59:59Z');assert.equal(before.status,'not_observed');assert.equal(before.revision,null);
 assert.equal((await h.store.atCutoff(created.eventId,iso(BASE))).revision.id,created.revision.id);
});

test('repeat retrieval metadata does not create revisions or mutate the first captured snapshot',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:filing({symbols:['MSFT','MSFT','AAPL']})});
 h.advance(60000);
 const again=await h.store.ingest({event:filing({symbols:['AAPL','MSFT'],ingestedAt:iso(h.now()),fetchedAt:iso(h.now()),receivedAt:iso(h.now()),apiKey:'PRIVATE_KEY',rawHtml:'PRIVATE_RAW_HTML'})});
 assert.equal(again.action,'observed');assert.deepEqual(again.revision,first.revision);
 const record=await h.store.get(first.eventId);assert.equal(record.revisionCount,1);assert.equal(record.firstObservedAt,iso(BASE));assert.equal(record.lastObservedAt,iso(BASE+60000));
 const disk=await readFile(h.filename,'utf8');assert(!disk.includes('PRIVATE_KEY'));assert(!disk.includes('PRIVATE_RAW_HTML'));assert(!disk.includes('fetchedAt'));
 assert.deepEqual(await createEventArchive({filename:h.filename,now:h.now}).get(first.eventId),record);
});

test('A to B to A preserves three capture-ordered revisions and flags provider-time regression',async t=>{
 const h=await setup(t),a=await h.store.ingest({event:quake()});
 h.advance(60000);const b=await h.store.ingest({event:quake({magnitude:6.6,updatedAt:'2026-11-12T19:30:00Z'})});
 h.advance(60000);const returned=await h.store.ingest({event:quake()});
 assert.equal(returned.action,'revised');assert.equal(returned.revision.version,3);assert.equal(returned.revision.contentHash,a.revision.contentHash);
 assert.notEqual(returned.revision.id,a.revision.id);assert.equal(returned.revision.providerTimeRegressed,true);assert(returned.revision.changedFields.includes('magnitude'));
 assert.equal((await h.store.get(a.eventId)).latest.id,returned.revision.id);
 assert.equal((await h.store.atCutoff(a.eventId,iso(BASE+60000))).revision.id,b.revision.id);
 assert.equal((await h.store.revisions(a.eventId)).revisions.length,3);
 assert.equal((await createEventArchive({filename:h.filename,now:h.now}).get(a.eventId)).latest.providerTimeRegressed,true);
});

test('SEC enrichment is a changed normalized observation rather than an official amendment claim',async t=>{
 const h=await setup(t),metadata=await h.store.ingest({event:filing(),historicalImport:true,captureKind:'metadata_observation'});
 h.advance(1000);
 const enrichment=await h.store.ingest({event:filing({classificationVersion:'corporate-v1',contentRevision:'doc-fixture-v1',
  classifications:[{code:'reported_results',label:'Reported results',evidenceIds:['EV-1']}],evidence:[{id:'EV-1',text:'Item 2.02 Results of Operations and Financial Condition',sourceUrl:filing().sourceUrl}]})});
 assert.equal(metadata.revision.captureKind,'metadata_observation');assert.equal(enrichment.revision.captureKind,'derived_enrichment');
 assert.equal(enrichment.revision.changeKind,'normalized_observation_changed');assert.equal(enrichment.revision.event.classificationVersion,'corporate-v1');
 assert(enrichment.revision.changedFields.includes('classifications'));assert.equal(enrichment.revision.event.publishedAt,filing().publishedAt);
 const reopened=await createEventArchive({filename:h.filename,now:h.now}).get(metadata.eventId);
 assert.equal(reopened.latest.captureKind,'derived_enrichment');assert(reopened.limitations.some(item=>item.includes('does not prove an official provider amendment')));
});

test('content-revision lookup finds the retained derived representation after later metadata capture',async t=>{
 const h=await setup(t),enriched=await h.store.ingest({event:filing({contentRevision:'doc-v1',classificationVersion:'corporate-v1',classifications:['reported_results']})});
 h.advance(1000);await h.store.ingest({event:filing()});
 const found=await h.store.findRevision(enriched.eventId,{contentRevision:'doc-v1'});assert.equal(found.id,enriched.revision.id);
 h.advance(1000);const returned=await h.store.ingest({event:filing({contentRevision:'doc-v1',classificationVersion:'corporate-v1',classifications:['reported_results']})});
 assert.equal((await h.store.findRevision(enriched.eventId,{contentRevision:'doc-v1'})).id,returned.revision.id);
 await assert.rejects(h.store.findRevision(enriched.eventId,{contentRevision:'missing'}),{status:404});
 await assert.rejects(h.store.findRevision(enriched.eventId,{}),{status:400});
});

test('corporate array summaries retain exact citation links and classification basis across restart',async t=>{
 const h=await setup(t),created=await h.store.ingest({event:filing({contentRevision:'classified-v1',classificationVersion:'corporate-v1',
  classifications:[{id:'results_disclosure',label:'Results disclosure',basis:'reported_filing_item',itemCode:'2.02',evidenceIds:['EV-1']}],
  summary:[{text:'The issuer reported quarterly results.',evidenceId:'EV-1'}],evidence:[{id:'EV-1',text:'The issuer reported quarterly results.',kind:'primary_passage',sourceUrl:filing().sourceUrl}]})});
 assert.equal(created.revision.event.summary,'The issuer reported quarterly results.');assert.equal(created.revision.event.summaries[0].evidenceId,'EV-1');
 assert.equal(created.revision.event.classifications[0].basis,'reported_filing_item');assert.equal(created.revision.event.classifications[0].itemCode,'2.02');
 assert.equal(created.revision.event.evidence[0].kind,'primary_passage');
 assert.deepEqual((await createEventArchive({filename:h.filename,now:h.now}).get(created.eventId)).latest,created.revision);
});

test('quarterly section citation IDs and all sixteen supported source passages survive archival',async t=>{
 const h=await setup(t),ids=Array.from({length:16},(_,index)=>'sec-doc:0001193125-26-448357:Part-I-/-Item-'+index+':aabbccdd0011');
 const passages=ids.map((id,index)=>({id,text:'Source passage '+index+' '+'.'.repeat(1200),section:'Part I / Item '+index,sourceUrl:filing().sourceUrl}));
 const created=await h.store.ingest({event:filing({classifications:[{id:'quarterly_report',basis:'reported_form',evidenceIds:ids}],
  summary:[{text:'Quarterly source summary.',evidenceId:ids[15]}],evidence:passages})});
 assert.equal(created.revision.event.evidence.length,16);assert.equal(created.revision.event.evidence[15].text,passages[15].text);
 assert.deepEqual(created.revision.event.classifications[0].evidenceIds,[...ids].sort());assert.equal(created.revision.event.summaries[0].evidenceId,ids[15]);
 assert.deepEqual((await createEventArchive({filename:h.filename,now:h.now}).get(created.eventId)).latest,created.revision);
});

test('actual 10-Q reader and corporate classifier keep their source citations through the archive',async t=>{
 const h=await setup(t),metadata=filing({form:'10-Q',headline:'Controlled issuer — 10-Q filing'});
 const document=analyzeFilingDocument('<h1>PART I</h1><h2>Item 1. Financial Statements</h2><p>The financial statements describe reported financial position and cash flows. The source must be read for full accounting notes and disclosure context.</p>'+
  '<h1>PART II</h1><h2>Item 1. Legal Proceedings</h2><p>The issuer discusses ordinary-course legal proceedings. No conclusion about the outcome of any proceeding is inferred from this excerpt.</p>',
  {filing:metadata,symbol:'MSFT',fetchedAt:iso(BASE)});
 assert(document.evidence.some(item=>item.id.includes('/')));
 const classified=classifyCorporateEvent({filing:metadata,document,symbol:'MSFT',now:BASE});
 const result=await h.store.ingest({event:{...classified,id:classified.sourceEventId,symbols:['MSFT']},source:'SEC EDGAR',captureKind:'derived_enrichment',historicalImport:true});
 const ids=new Set(result.revision.event.evidence.map(item=>item.id));
 for(const passage of classified.evidence)assert(ids.has(passage.id),passage.id);
 for(const tag of result.revision.event.classifications)for(const id of tag.evidenceIds)assert(ids.has(id),id);
 assert(ids.has(document.evidence[0].id));
 assert.equal((await h.store.findRevision(classified.sourceEventId,{contentRevision:classified.contentRevision})).id,result.revision.id);
 assert.deepEqual((await createEventArchive({filename:h.filename,now:h.now}).get(result.eventId)).latest,result.revision);
});

test('list pagination survives insertions and source/symbol filters cannot reuse another query cursor',async t=>{
 const h=await setup(t);
 await h.store.ingestBatch([{event:filing()},{event:{id:'eonet:fixture',source:'NASA EONET',headline:'NASA controlled event',type:'WILDFIRE',occurredAt:null}},
  {event:{id:'gdelt:fixture',source:'GDELT / publisher.example',headline:'Media coverage candidate',type:'GEOPOLITICAL_REPORT',evidenceLevel:'media_report'}}]);
 const first=await h.store.list({limit:1});assert.equal(first.events[0].source,'GDELT');assert(first.nextCursor);assert.equal(first.total,3);
 h.advance(1000);await h.store.ingest({event:quake()});
 const second=await h.store.list({limit:1,cursor:first.nextCursor});assert.equal(second.events[0].source,'NASA_EONET');
 const third=await h.store.list({limit:1,cursor:second.nextCursor});assert.equal(third.events[0].source,'SEC_EDGAR');assert.equal(third.nextCursor,null);
 assert.equal((await h.store.list({source:'SEC EDGAR',symbol:'MSFT'})).events.length,1);
 assert.equal((await h.store.list({source:'GDELT_DOC'})).events[0].latest.event.evidenceLevel,'media_report');
 assert.throws(()=>h.store.list({source:'USGS',cursor:first.nextCursor}),{status:400});assert.throws(()=>h.store.list({limit:101}),{status:400});
});

test('revision pagination is chronological and binds its cursor to the selected event',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:quake()});
 h.advance(1000);await h.store.ingest({event:quake({magnitude:6.4})});h.advance(1000);await h.store.ingest({event:quake({magnitude:6.5})});await h.store.ingest({event:filing()});
 const page=await h.store.revisions(first.eventId,{limit:1});assert.equal(page.revisions[0].version,1);
 const next=await h.store.revisions(first.eventId,{limit:1,cursor:page.nextCursor});assert.equal(next.revisions[0].version,2);
 assert.throws(()=>h.store.revisions(filing().id,{cursor:page.nextCursor}),{status:400});assert.throws(()=>h.store.revisions(first.eventId,{cursor:'not a cursor'}),{status:400});
});

test('capacity fails without eviction or partial mutation while repeat observations remain admissible',async t=>{
 const h=await setup(t,{maxEvents:1,maxRevisions:2}),first=await h.store.ingest({event:quake()});h.advance(1000);await h.store.ingest({event:quake({magnitude:6.4})});
 const contents=await readFile(h.filename,'utf8');
 await assert.rejects(h.store.ingest({event:filing()}),{status:409});await assert.rejects(h.store.ingest({event:quake({magnitude:6.5})}),{status:409});
 assert.equal(await readFile(h.filename,'utf8'),contents);assert.equal((await h.store.get(first.eventId)).revisionCount,2);
 assert.equal((await h.store.ingest({event:quake({magnitude:6.4})})).action,'observed');
});

test('ingestion batches are atomic across invalid records and exhausted revision capacity',async t=>{
 const h=await setup(t,{maxRevisions:1});
 await assert.rejects(h.store.ingestBatch([{event:quake()},{event:{...filing(),id:'unsafe id'}}]),{status:400});assert.equal((await h.store.list()).total,0);
 await assert.rejects(h.store.ingestBatch([{event:quake()},{event:filing()}]),{status:409});assert.equal((await h.store.list()).total,0);
 await assert.rejects(h.store.ingestBatch([]),{status:400});await assert.rejects(h.store.ingestBatch(Array.from({length:201},()=>({event:quake()}))),{status:400});
});

test('concurrent captures serialize and returned data cannot mutate stored evidence',async t=>{
 const h=await setup(t),created=await Promise.all([h.store.ingest({event:quake()}),h.store.ingest({event:quake({magnitude:6.4})}),h.store.ingest({event:quake({magnitude:6.5})})]);
 assert.deepEqual(created.map(item=>item.revision.version),[1,2,3]);created[2].revision.event.magnitude=99;
 const record=await h.store.get(created[0].eventId);assert.equal(record.latest.event.magnitude,6.5);record.latest.event.headline='mutated';assert.notEqual((await h.store.get(record.id)).latest.event.headline,'mutated');
});

test('failed atomic writes preserve memory and previous evidence without exposing local paths',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:quake()}),contents=await readFile(h.filename,'utf8');await rm(h.filename);await mkdir(h.filename);h.advance(1000);
 await assert.rejects(h.store.ingest({event:quake({magnitude:6.4})}),error=>error.status===500&&!error.message.includes(h.filename));assert.equal((await h.store.get(first.eventId)).revisionCount,1);
 await rm(h.filename,{recursive:true});await writeFile(h.filename,contents,{mode:0o600});assert.equal((await createEventArchive({filename:h.filename,now:h.now}).get(first.eventId)).revisionCount,1);
 await h.store.ingest({event:quake({magnitude:6.4})});assert.equal((await h.store.get(first.eventId)).revisionCount,2);
});

test('normalization retains bounded evidence and strips unsafe links, raw HTML and opaque fields',async t=>{
 const h=await setup(t),result=await h.store.ingest({event:filing({sourceUrl:'https://user:password@example.com/private',summary:'<script>untrusted()</script> Source text',apiKey:'PRIVATE_SECRET',html:'PRIVATE_RAW_HTML',
  classifications:[{code:'reported_results',evidenceIds:['EV-1'],raw:'PRIVATE_RAW_CLASS'}],evidence:[{id:'EV-1',text:'A cited passage',sourceUrl:'javascript:alert(1)',secret:'PRIVATE_SECRET'}],
  location:{latitude:200,longitude:140},magnitude:'6.3',symbols:['MSFT','MSFT','invalid symbol'],confidence:99})});
 assert.equal(result.revision.event.sourceUrl,null);assert.equal(result.revision.event.evidence[0].sourceUrl,null);assert.equal(result.revision.event.location,null);assert.equal(result.revision.event.magnitude,null);
 assert.deepEqual(result.revision.event.symbols,['MSFT']);assert(!result.revision.event.summary.includes('<script>'));
 const disk=await readFile(h.filename,'utf8');for(const text of ['PRIVATE_SECRET','PRIVATE_RAW_HTML','PRIVATE_RAW_CLASS','apiKey','javascript:','password@example'])assert(!disk.includes(text),text);
 const permissions=(await stat(h.filename)).mode&0o777;if(process.platform!=='win32')assert.equal(permissions,0o600);
});

test('invalid sources, observation clocks and cutoffs cannot invent historical availability',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:filing()});
 await assert.rejects(h.store.ingest({event:{...quake(),source:'ALPACA_IEX'}}),{status:400});await assert.rejects(h.store.ingest({event:quake(),observedAt:'2026-02-30T00:00:00Z'}),{status:400});
 await assert.rejects(h.store.ingest({event:quake(),observedAt:iso(BASE+3600000)}),{status:400});await assert.rejects(h.store.atCutoff(first.eventId,'2026-11-12'),{status:400});await assert.rejects(h.store.atCutoff(first.eventId,iso(BASE+1000)),{status:400});
 h.set(BASE-1000);await assert.rejects(h.store.ingest({event:filing({summary:'Changed'})}),{status:409});assert.equal((await h.store.get(first.eventId)).revisionCount,1);
});

test('malformed or tampered history is rejected without resetting or overwriting existing evidence',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:filing()}),original=await readFile(h.filename,'utf8'),tampered=JSON.parse(original);
 tampered.events[0].revisions[0].event.headline='Changed without recorded hash';await writeFile(h.filename,JSON.stringify(tampered));
 await assert.rejects(createEventArchive({filename:h.filename,now:h.now}).get(first.eventId),{status:500});assert.equal(await readFile(h.filename,'utf8'),JSON.stringify(tampered));
 const missingClock=JSON.parse(original);missingClock.lastCapturedAt=null;await writeFile(h.filename,JSON.stringify(missingClock));await assert.rejects(createEventArchive({filename:h.filename,now:h.now}).list(),{status:500});
 await writeFile(h.filename,'not JSON');await assert.rejects(createEventArchive({filename:h.filename,now:h.now}).list(),{status:500});
});

test('byte capacity fails explicitly and never leaves a half-written archive',async t=>{
 const h=await setup(t,{maxBytes:200});await assert.rejects(h.store.ingest({event:quake()}),{status:409});assert.equal((await h.store.list()).total,0);await assert.rejects(readFile(h.filename),{code:'ENOENT'});
 await writeFile(h.filename,'x'.repeat(201));await assert.rejects(createEventArchive({filename:h.filename,now:h.now,maxBytes:200}).list(),{status:500});
});


test('exact revision retrieval rejects fabricated IDs and preserves historical version even after revisions',async t=>{
 const h=await setup(t),first=await h.store.ingest({event:filing()});
 h.advance(60000);const next=await h.store.ingest({event:filing({headline:'Updated filing interpretation'})});
 const historical=await h.store.getRevision(first.eventId,first.revision.id);
 assert.equal(historical.revision.id,first.revision.id);assert.equal(historical.revision.version,1);
 assert.equal(historical.source,'SEC_EDGAR');assert.equal(historical.firstObservedAt,iso(BASE));
 assert.equal(historical.revision.event.headline,filing().headline);
 assert.equal((await h.store.getRevision(next.eventId,next.revision.id)).revision.version,2);
 historical.revision.event.headline='CLIENT_MUTATION';
 assert.equal((await h.store.getRevision(first.eventId,first.revision.id)).revision.event.headline,filing().headline);
 await assert.rejects(h.store.getRevision(first.eventId,'REV-'+ '0'.repeat(8)+'-0000-0000-0000-000000000000'),{status:404});
 await assert.rejects(h.store.getRevision(first.eventId,'REV-invalid'),{status:400});
});
