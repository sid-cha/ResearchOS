import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 PRECURSOR_VERSION,PRECURSOR_PROVIDERS,classifyCorporateHeadline,
 corporateSourceUrl,normalizeCorporateNews,createCorporatePrecursor,
 createCorporatePrecursorApi
} from '../lib/corporate-precursor.mjs';

const EARLY='2025-10-14T15:00:00.000Z',LATE='2026-11-16T17:00:00.000Z',
 AFTER='2026-11-16T17:10:00.000Z',FUTURE='2026-11-16T19:00:00.000Z';
const ARTICLE='https://example-news.com/investigation/nvidia-export-control';
const pub={articles:[
 {title:'Nvidia export controls investigation prompts questions',url:ARTICLE,seendate:'20251014T140000Z'},
 {title:'Unrelated technology investigation in another market',
  url:'https://example-news.com/unrelated',seendate:'20251014T130000Z'},
 {title:'Nvidia earnings outlook is positive',url:'https://example-news.com/earnings',seendate:'20251014T100000Z'}
]};
const federal={results:[
 {document_number:'2026-12345',title:'Nvidia export licensing document search result',
  html_url:'https://www.federalregister.gov/documents/2026/11/01/2026-12345/nvidia-export-licensing',
  publication_date:'2026-11-01',type:'Notice'},
 {title:'Unrelated agency notice',html_url:'https://www.federalregister.gov/documents/2026/11/02/x',
  publication_date:'2026-11-02'}]};
const alpaca={source:'ALPACA_NEWS',events:[{
 id:'alpaca:1',headline:'Nvidia investigated over chip export controls',
 publishedAt:'2026-11-16T16:00:00.000Z',providerFirstSeenAt:'2026-11-16T16:00:00.000Z',
 sourceUrl:'https://another-news.example/nvda-probe'
}]};
const response=(obj,mime='application/json')=>{
 const b=Buffer.from(JSON.stringify(obj));
 return {ok:true,status:200,headers:{get:k=>k==='content-type'?mime:
  k==='content-length'?String(b.length):null},body:Readable.from([b])};
};
async function fixture(t,{enabled=true,rightsAcknowledged=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-corporate-precursor-'));
 t.after(async()=>rm(dir,{force:true,recursive:true}));
 const filename=path.join(dir,'corporate.json'),calls=[];
 let now=LATE,gdelt=pub,fr=federal,alp=alpaca;
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.redirect,'error');
  assert.equal(options.method,'GET');
  if(url.startsWith('https://api.gdeltproject.org/'))return response(gdelt);
  if(url.startsWith('https://www.federalregister.gov/'))return response(fr);
  throw Error('Unexpected corporate source URL');
 };
 const newsSources={news:async(symbol,limit)=>{
  calls.push({alpaca:true,symbol,limit});return alp;
 }};
 const monitor=createCorporatePrecursor({filename,fetchImpl,newsSources,
  enabled,rightsAcknowledged,now:()=>now});
 return {monitor,filename,calls,fetchImpl,newsSources,
  setTime:x=>{now=x;},setMedia:x=>{gdelt=x;},setFederal:x=>{fr=x;},
  setAlpaca:x=>{alp=x;}};
}
test('issuer risk taxonomy triages evidence without finding person wrongdoing',()=>{
 const espionage=classifyCorporateHeadline('Nvidia executive allegedly targeted in espionage investigation','NVDA');
 assert.equal(espionage.attention,'PROMPT_HUMAN_REVIEW');
 assert(espionage.categories.includes('NATIONAL_SECURITY_ALLEGATION'));
 assert(espionage.categories.includes('REGULATORY_SCRUTINY'));
 assert.equal(espionage.personMisconductEstablished,false);
 assert.equal(espionage.allegationVerified,false);
 assert.equal(espionage.marketImpactVerified,false);
 assert.equal(classifyCorporateHeadline('Nvidia export-control probe','NVDA').attention,'ELEVATED_HUMAN_REVIEW');
 assert.equal(classifyCorporateHeadline('AMD export control probe','NVDA').attention,'NO_SIGNAL');
});
test('source URLs are fixed by issuer and provider; no arbitrary URL parameters are accepted',()=>{
 const g=corporateSourceUrl('NVDA','GDELT_MEDIA'),f=corporateSourceUrl('NVDA','FEDERAL_REGISTER');
 assert.equal(new URL(g).hostname,'api.gdeltproject.org');
 assert.equal(new URL(g).searchParams.get('timespan'),'1week');
 assert.equal(new URL(g).searchParams.get('maxrecords'),'40');
 assert.equal(new URL(f).hostname,'www.federalregister.gov');
 assert.equal(new URL(f).searchParams.get('conditions[term]'),'Nvidia');
 assert.equal(corporateSourceUrl('NVDA','ALPACA_MEDIA'),null);
 assert.throws(()=>corporateSourceUrl('../../etc','GDELT_MEDIA'),{status:400});
 assert.throws(()=>corporateSourceUrl('NVDA','http://localhost'),{status:400});
});
test('GDELT candidate archive keeps provider-indexed clock separate from verified publisher date',()=>{
 const n=normalizeCorporateNews(pub,{symbol:'NVDA',source:'GDELT_MEDIA'});
 assert.equal(n.items.length,1);
 assert.equal(n.skipped.unrelated,1);
 assert.equal(n.skipped.noRiskTerms,1);
 assert.equal(n.items[0].providerIndexedAt,'2025-10-14T14:00:00Z');
 assert.equal(n.items[0].publishedAtVerified,null);
 assert.equal(n.items[0].sourceClaimStatus,'MEDIA_REPORT_NOT_VERIFIED_ALLEGATION');
 assert.equal(n.items[0].personMisconductVerified,false);
 assert.equal(n.items[0].attention,'ELEVATED_HUMAN_REVIEW');
});
test('Federal Register search hit remains official keyword candidate, not government investigation finding',()=>{
 const n=normalizeCorporateNews(federal,{symbol:'NVDA',source:'FEDERAL_REGISTER'});
 assert.equal(n.items.length,1);
 assert.equal(n.items[0].attention,'OFFICIAL_DOCUMENT_SEARCH_CANDIDATE');
 assert.equal(n.items[0].publisherPublicationDate,'2026-11-01');
 assert.equal(n.items[0].providerIndexedAt,null);
 assert.equal(n.items[0].publishedAtVerified,null);
 assert.equal(n.items[0].independentlyConfirmed,false);
 assert.equal(n.items[0].sourceClaimStatus,'OFFICIAL_DOCUMENT_KEYWORD_HIT_NOT_ISSUER_LINK');
});
test('full/truncated provider result pages fail closed rather than imply complete coverage',()=>{
 assert.throws(()=>normalizeCorporateNews({articles:Array(40).fill(pub.articles[0])},
  {symbol:'NVDA',source:'GDELT_MEDIA'}),{status:409});
 assert.throws(()=>normalizeCorporateNews({results:Array(25).fill(federal.results[0])},
  {symbol:'NVDA',source:'FEDERAL_REGISTER'}),{status:409});
 assert.throws(()=>normalizeCorporateNews({articles:'bad'},
  {symbol:'NVDA',source:'GDELT_MEDIA'}),{status:502});
});
test('GDELT source capture records local clock, digest and no invented historical publish time',async t=>{
 const h=await fixture(t);
 const first=await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'});
 assert.equal(first.deduplicated,false);
 assert.equal(first.record.capturedAt,LATE);
 assert.match(first.record.bodySha256,/^[a-f0-9]{64}$/);
 assert.equal(first.record.items.length,1);
 assert.equal(first.record.items[0].providerIndexedAt,'2025-10-14T14:00:00Z');
 assert.equal(first.record.publisherTimeVerified,false);
 assert.equal((await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'})).deduplicated,true);
 assert.equal((await h.monitor.view()).capturedSnapshots,1);
 assert.equal(h.calls.length,2);
});
test('2025 article retrieved in 2026 cannot be present in a 2025 ResearchOS replay',async t=>{
 const h=await fixture(t);
 await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'});
 assert.equal((await h.monitor.view({asOf:EARLY})).items.length,0);
 assert.equal((await h.monitor.view({asOf:EARLY})).alerts.length,0);
 const replay=await h.monitor.view({asOf:LATE});
 assert.equal(replay.items.length,1);
 assert.equal(replay.items[0].localFirstObservedAt,LATE);
 assert.equal(replay.items[0].publishedAtVerified,null);
 assert.equal(replay.alerts[0].allegationVerified,false);
 assert.equal(replay.alerts[0].priceImpact,null);
 await assert.rejects(h.monitor.view({asOf:FUTURE}),{status:400});
});
test('source content revisions preserve first locally observed time and newest metadata',async t=>{
 const h=await fixture(t);
 await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'});
 h.setTime(AFTER);
 h.setMedia({articles:[{...pub.articles[0],title:'Nvidia export controls probe reviewed by senator'}]});
 const next=await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'});
 assert.equal(next.deduplicated,false);
 const earlier=await h.monitor.view({asOf:LATE});
 assert.equal(earlier.items[0].headline,pub.articles[0].title);
 const revised=await h.monitor.view({asOf:AFTER});
 assert.equal(revised.items[0].revisions,2);
 assert.equal(revised.items[0].localFirstObservedAt,LATE);
 assert.equal(revised.items[0].localLastObservedAt,AFTER);
 assert.match(revised.items[0].headline,/senator/);
});
test('Alpaca source adapter captured independently, preserving provider metadata and licensing caveat',async t=>{
 const h=await fixture(t);
 const result=await h.monitor.capture({symbol:'NVDA',source:'ALPACA_MEDIA'});
 assert.equal(result.record.source,'ALPACA_MEDIA');
 assert.equal(result.record.queryUrl,null);
 assert.equal(result.record.items.length,1);
 const data=await h.monitor.view();
 assert.equal(data.items[0].providerIndexedAt,'2026-11-16T16:00:00.000Z');
 assert.equal(data.items[0].publishedAtVerified,null);
 assert(h.calls.some(x=>x.alpaca===true&&x.symbol==='NVDA'&&x.limit===30));
});
test('manual official federal source keyword capture does not produce investigation alert',async t=>{
 const h=await fixture(t);
 await h.monitor.capture({symbol:'NVDA',source:'FEDERAL_REGISTER'});
 const view=await h.monitor.view();
 assert.equal(view.items.length,1);
 assert.equal(view.alerts.length,0);
 assert.equal(view.sourceHealth[0].coverage,'FEDERAL_REGISTER_LIMITED_SEARCH');
});
test('rights and remote-host gates block source reads/writes without any upstream request',async t=>{
 const a=await fixture(t,{rightsAcknowledged:false});
 await assert.rejects(a.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'}),{status:403});
 assert.equal((await a.monitor.view()).items.length,0);
 assert.equal(a.calls.length,0);
 const b=await fixture(t,{enabled:false});
 await assert.rejects(b.monitor.view(),{status:403});
 await assert.rejects(b.monitor.capture({symbol:'NVDA',source:'ALPACA_MEDIA'}),{status:403});
 assert.equal(b.calls.length,0);
});
test('restart verifies hash-linked journal; modified evidence fails closed',async t=>{
 const h=await fixture(t);
 await h.monitor.capture({symbol:'NVDA',source:'GDELT_MEDIA'});
 await h.monitor.close();
 const restarted=createCorporatePrecursor({filename:h.filename,newsSources:h.newsSources,
  now:()=>AFTER,enabled:true,rightsAcknowledged:true,
  fetchImpl:async()=>{throw Error('NETWORK ON READ');}});
 assert.equal((await restarted.view()).items.length,1);
 await restarted.close();
 const data=await readFile(h.filename,'utf8');
 await writeFile(h.filename,data.replace('Nvidia export controls investigation','Nvidia misleadingly modified investigation'));
 const corrupt=createCorporatePrecursor({filename:h.filename,newsSources:h.newsSources,
  now:()=>AFTER,enabled:true,rightsAcknowledged:true});
 await assert.rejects(corrupt.view(),{status:500});
});
test('local API only supports bounded strict issuer captures; CSRF and URL injection denied',async t=>{
 const h=await fixture(t),handle=createCorporatePrecursorApi({monitor:h.monitor,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port+'/api/corporate-precursor/';
 assert.equal((await fetch(root+'catalog')).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(FUTURE))).status,400);
 assert.equal((await fetch(root+'view?symbol=NVDA&bad=x')).status,400);
 const body=JSON.stringify({symbol:'NVDA',source:'GDELT_MEDIA'});
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Corporate-Precursor':'1',
  Origin:'https://evil.example'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Corporate-Precursor':'1'},
  body:JSON.stringify({symbol:'NVDA',source:'GDELT_MEDIA',url:'http://localhost/secrets'})})).status,400);
 const okay=await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Corporate-Precursor':'1'},body});
 assert.equal(okay.status,200);
 assert.equal((await okay.json()).record.items.length,1);
 assert.equal((await fetch(root+'capture',{method:'GET'})).status,404);
});
test('UI, navigation, server route and static/public allowlists contain v0.44 research page',async()=>{
 const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
 const [html,js,nav,server,build,security]=await Promise.all([
  read('corporate-precursor.html'),read('corporate-precursor.js'),
  read('hierarchy-navigation.js'),read('server.mjs'),
  read('scripts/build-static.mjs'),read('tests/security.test.mjs')]);
 for(const id of ['precursor-capture','precursorForm','precursor-chronology',
  'precursorResults','precursorExport','precursor-challenge'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/corporate-precursor/'));
 assert(nav.includes("href:'/corporate-precursor.html'"));
 assert(server.includes('if(await handleCorporatePrecursor(req,res,u))return;'));
 assert(build.includes("'corporate-precursor.js'"));
 assert(security.includes("'corporate-precursor.js'"));
 assert.equal(PRECURSOR_VERSION,'CORPORATE-PRECURSOR-0.44.1');
 assert.deepEqual(PRECURSOR_PROVIDERS,['GDELT_MEDIA','FEDERAL_REGISTER','ALPACA_MEDIA']);
});
