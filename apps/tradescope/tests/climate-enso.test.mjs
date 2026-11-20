import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createCpcEnsoArchive,createCpcEnsoApi,parseCpcIssuedDiscussion,cpcMonthlyUrl} from '../lib/climate-enso.mjs';
const now=()=>new Date('2026-11-13T12:00:00Z');
const discussion=(date,body='ENSO-neutral conditions are favored with regional uncertainty and monitoring of tropical Pacific sea surface temperatures.')=>
 '<html><head><title>NOAA ENSO Discussion</title></head><body>'+
 '<h1>EL NIÑO/SOUTHERN OSCILLATION (ENSO) DIAGNOSTIC DISCUSSION</h1>'+
 '<div>issued by CLIMATE PREDICTION CENTER / NCEP / NWS</div><p>'+date+'</p>'+
 '<h3>Synopsis:</h3><p>'+body+'</p><script>ignore this script</script></body></html>';
const html=(str,status=200)=>new Response(str,{status,headers:{'Content-Type':'text/html'}});
test('fixed-host CPC archive URL is deterministic and never accepts arbitrary URLs or unsupported months',()=>{
 assert.equal(cpcMonthlyUrl(2007,8),'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_aug2007/ensodisc.html');
 assert.throws(()=>cpcMonthlyUrl(2020,13),/Unsupported/);
 assert.throws(()=>cpcMonthlyUrl(2000,12),/Unsupported/);
});
test('historical ENSO discussion parser requires one matching source issue date and removes HTML/script',()=>{
 const sourceUrl=cpcMonthlyUrl(2020,2);
 const item=parseCpcIssuedDiscussion(discussion('13 February 2020'),{year:2020,month:2,sourceUrl});
 assert.equal(item.issueDate,'2020-02-13');
 assert.equal(item.source,'NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION');
 assert.match(item.synopsis,/ENSO-neutral/);
 assert(!JSON.stringify(item).includes('ignore this script'));
 assert.equal(item.originalArchiveRevisionVerified,false);
 assert.equal(item.publicationClockVerified,false);
 assert.equal(item.riskProbability,null);
 assert.throws(()=>parseCpcIssuedDiscussion(discussion('13 February 2020'),{year:2020,month:2,sourceUrl:'https://evil.test'}),/Unsupported/);
 assert.throws(()=>parseCpcIssuedDiscussion(discussion('11 March 2020'),{year:2020,month:2,sourceUrl}),/ambiguous/);
 assert.throws(()=>parseCpcIssuedDiscussion(discussion('12 February 2020 13 February 2020'),{year:2020,month:2,sourceUrl}),/ambiguous/);
});
test('as-of research cannot expose a future monthly issued outlook, falls back to previous issued discussion',async()=>{
 const calls=[],service=createCpcEnsoArchive({now,fetchImpl:async url=>{
  calls.push(url);
  return url.includes('feb2020')?html(discussion('13 February 2020')):html(discussion('9 January 2020'));
 }});
 const result=await service.asOf('2020-02-05');
 assert.equal(result.discussion.issueDate,'2020-01-09');
 assert.equal(result.attemptedMonths.join(','),'2020-02,2020-01');
 assert.equal(result.mode,'END_OF_CALENDAR_DAY');
 assert.equal(result.calibratedForecast,false);
 assert.equal(result.issuerImpactVerified,false);
 assert.equal(calls.length,2);
 const after=await service.asOf('2020-02-17');
 assert.equal(after.discussion.issueDate,'2020-02-13');
 assert.equal(calls.length,2);
});
test('missing discussion is explicit and never treated as forecast or zero risk',async()=>{
 const s=createCpcEnsoArchive({now,fetchImpl:async()=>html('Not Found',404)});
 const x=await s.asOf('2007-08-19');
 assert.equal(x.discussion,null);
 assert.equal(x.evidenceStatus,'NO_ELIGIBLE_ISSUED_DISCUSSION_IN_BOUNDED_WINDOW');
 assert.equal(x.marketRiskScore,null);
});
test('bad dates and future dates reject before network calls',async()=>{
 let calls=0;
 const s=createCpcEnsoArchive({now,fetchImpl:async()=>{calls++;return html('abc')}});
 for(const date of ['2000-12-31','2026-11-14','2020-02-30','now','2020/02/01'])
  await assert.rejects(s.asOf(date),e=>e.status===400);
 assert.equal(calls,0);
});
test('oversized, wrong MIME and failed provider responses reject safely',async()=>{
 const opts={now};
 const giant=createCpcEnsoArchive({...opts,fetchImpl:async()=>html(discussion('13 February 2020','X'.repeat(260100)))});
 await assert.rejects(giant.asOf('2020-02-15'),e=>e.status===502);
 const wrong=createCpcEnsoArchive({...opts,fetchImpl:async()=>new Response('{"data":"secret"}',{status:200,headers:{'Content-Type':'application/json'}})});
 await assert.rejects(wrong.asOf('2020-02-15'),e=>e.status===502);
 const fail=createCpcEnsoArchive({...opts,fetchImpl:async()=>html('private provider error',429)});
 await assert.rejects(fail.asOf('2020-02-15'),e=>e.status===429&&!e.message.includes('private provider error'));
});
test('historical climate API is read-only, bounded, explicitly sourced and invalid parameter safe',async t=>{
 const service=createCpcEnsoArchive({now,fetchImpl:async()=>html(discussion('13 February 2020'))});
 const api=createCpcEnsoApi({service});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const c=await fetch(base+'/api/climate/catalog');
 assert.equal(c.status,200);assert.equal((await c.json()).historicalHtmlRevisionVerified,false);
 const data=await fetch(base+'/api/climate/enso?asOf=2020-02-15');
 assert.equal(data.status,200);assert.equal((await data.json()).discussion.issueDate,'2020-02-13');
 assert.equal((await fetch(base+'/api/climate/enso?asOf=2020-02-15&asOf=2020-02-15')).status,400);
 assert.equal((await fetch(base+'/api/climate/enso?asOf=2020-02-15&url=https://evil.com')).status,400);
 assert.equal((await fetch(base+'/api/climate/catalog',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/climate/unknown')).status,404);
});
