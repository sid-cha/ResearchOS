import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 CLIMATE_NUMERIC_VERSION,NUMERIC_DATASETS,parseCpcNumerical,
 numericalTrend,assessEnsoNumerics,createClimateNumeric,createClimateNumericApi
} from '../lib/climate-numeric.mjs';

const EARLY='2025-07-01T12:00:00.000Z',
 T1='2026-11-16T18:00:00.000Z',
 T2='2026-11-16T18:10:00.000Z',
 FUTURE='2026-11-16T18:20:00.000Z';
const month=m=>String(m).padStart(2,'0');
const roni=(override=null)=>[
 'SEAS   YR  ANOM',
 ...['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ']
   .map((x,i)=>x+'  2025 '+(-0.2+i*.05).toFixed(2)),
 ...['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND']
   .map((x,i)=>x+'  2026 '+(x==='OND'&&override!==null?override:.5+i*.08).toFixed(2))
].join('\n');
const relative=()=>[
 'YR   MTH   ANOM',
 ...Array.from({length:12},(_,i)=>'2025 '+(i+1)+' '+(i*.03).toFixed(2)),
 ...Array.from({length:11},(_,i)=>'2026 '+(i+1)+' '+(.5+i*.07).toFixed(2))
].join('\n');
const section=(type='850 MB TRADE WIND INDEX(175W-140W)5N 5S CENTRAL PACIFIC')=>[
 type,'                   ORIGINAL DATA',
 'YEAR   JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC',
 '2025  5.0 5.0 5.0 5.0 5.0 5.0 5.0 5.0 5.0 5.0 5.0 5.0',
 type,'                   ANOMALY',
 'YEAR   JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC',
 '2025  0.5 0.7 0.0 -0.5 -1.0 -1.2 -0.5 -0.8 -1.0 -1.0 -0.9 -0.6',
 '2026  0.5 0.0 -0.5 -0.5 -1.0 -1.2 -2.0 -3.0 -3.5 -2.0-999.9-999.9',
 '2027-999.9-999.9-999.9-999.9-999.9-999.9-999.9-999.9-999.9-999.9-999.9-999.9',
 type,'                   STANDARDIZED DATA',
 'YEAR   JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC',
 '2025  8.0 8.0 8.0 8.0 8.0 8.0 8.0 8.0 8.0 8.0 8.0 8.0'
].join('\n');
const response=(text,{mime='text/plain',advertised=null}={})=>{
 const bytes=Buffer.from(text);
 return {ok:true,status:200,headers:{get:k=>k==='content-type'?mime:
  k==='content-length'?String(advertised??bytes.length):null},body:Readable.from([bytes])};
};
async function fixture(t,{enabled=true,rightsAcknowledged=true}={}){
 const folder=await mkdtemp(path.join(tmpdir(),'researchos-cpc-numeric-'));
 t.after(async()=>rm(folder,{force:true,recursive:true}));
 const filename=path.join(folder,'noaa-numeric.json'),calls=[];
 let now=T1,roniBody=roni();
 const fetchImpl=async(url,config)=>{
  calls.push({url,config});
  assert.equal(config.redirect,'error');
  assert.equal(config.method,'GET');
  assert.equal(new URL(url).hostname,'www.cpc.ncep.noaa.gov');
  if(url.endsWith('/RONI.ascii.txt'))return response(roniBody);
  if(url.endsWith('/Rnino34.ascii.txt'))return response(relative());
  if(url.endsWith('/soi'))return response(section('(STAND TAHITI - STAND DARWIN) SEA LEVEL PRESS'));
  if(url.endsWith('/cpac850'))return response(section());
  if(url.endsWith('/wpac850'))return response(section('850 MB TRADE WIND INDEX(135E-180W)5N 5S WEST PACIFIC'));
  throw Error('Unexpected NOAA URL');
 };
 const service=createClimateNumeric({filename,fetchImpl,enabled,rightsAcknowledged,
  now:()=>now});
 return {service,filename,calls,fetchImpl,setTime:t=>{now=t;},
  setRoni:x=>{roniBody=x;}};
}
test('five source definitions use only official NOAA CPC fixed files',()=>{
 assert.equal(CLIMATE_NUMERIC_VERSION,'CLIMATE-NUMERIC-P0-0.46.1');
 assert.deepEqual(NUMERIC_DATASETS.map(x=>x.id),[
  'RONI','RELATIVE_NINO34','SOI','TRADE_WIND_CPAC','TRADE_WIND_WPAC']);
 assert(NUMERIC_DATASETS.every(x=>x.sourceUrl.startsWith('https://www.cpc.ncep.noaa.gov/data/indices/')));
});
test('RONI season → centered calendar month mapping is preserved, not annual or daily value',()=>{
 const data=parseCpcNumerical(roni(),'RONI');
 assert.equal(data.observations.length,23);
 assert.equal(data.observations[0].period,'2025-01');
 assert.equal(data.observations[11].period,'2025-12');
 assert.equal(data.observations[12].period,'2026-01');
 assert.equal(data.observations.at(-1).period,'2026-11');
 assert.equal(data.observations.at(-1).sourcePeriod,'OND 2026');
 assert.equal(data.observations[0].provisional,true);
});
test('monthly relative SST anomalies are not confused with seasonal RONI',()=>{
 const m=parseCpcNumerical(relative(),'RELATIVE_NINO34');
 assert.equal(m.observations.length,23);
 assert.equal(m.observations.at(-1).period,'2026-11');
 assert.equal(m.observations.at(-1).value,1.2);
 assert.equal(m.observations[0].period,'2025-01');
});
test('SOI anomaly section ignores original/standardized sections and contiguous sentinel values',()=>{
 const m=parseCpcNumerical(section(),'SOI');
 assert.equal(m.observations.length,22);
 assert.equal(m.observations[0].value,.5);
 assert.equal(m.observations[12].period,'2026-01');
 assert.equal(m.observations.at(-1).period,'2026-10');
 assert.equal(m.observations.at(-1).value,-2);
 assert.equal(m.observations.some(x=>x.value===8||x.value===-999.9),false);
});
test('trade wind feeds parse different regional sources without mixing up source sections',()=>{
 for(const id of ['TRADE_WIND_WPAC','TRADE_WIND_CPAC']){
  const m=parseCpcNumerical(section(),id);
  assert.equal(m.observations.at(-1).value,-2);
  assert.equal(m.observations.length,22);
 }
});
test('broken source format, duplicate months, wrong row counts and unbounded data fail closed',()=>{
 assert.throws(()=>parseCpcNumerical('junk','RONI'),{status:502});
 assert.throws(()=>parseCpcNumerical('SEAS YR ANOM\nDJF 2026 1.2\nDJF 2026 1.3','RONI'),{status:502});
 assert.throws(()=>parseCpcNumerical('YR MTH ANOM\n2026 13 1.0','RELATIVE_NINO34'),{status:502});
 assert.throws(()=>parseCpcNumerical(section().replace('-999.9-999.9','-999.9'),'SOI'),{status:502});
 assert.throws(()=>parseCpcNumerical('x'.repeat(350001),'RONI'),{status:502});
 assert.throws(()=>parseCpcNumerical(roni(),'RONI',{maxRows:12}),{status:413});
});
test('numeric slope uses same source metric with backward-only monthly comparisons',()=>{
 const samples=[
  {period:'2026-07',value:.1},{period:'2026-08',value:.2},
  {period:'2026-09',value:.5},{period:'2026-10',value:.6},
  {period:'2026-11',value:.9}
 ];
 const t=numericalTrend(samples);
 assert.equal(t.latest.period,'2026-11');
 assert.equal(t.delta3,.7);
 assert.equal(t.threeMonthMean,.67);
 assert.equal(t.lastThreeConsecutive,true);
 assert.equal(t.originalReleaseTimeVerified,false);
 assert.equal(numericalTrend([]).state,'NO_SOURCE_OBSERVATION');
});
test('ocean warming without atmospheric indices is no verified ENSO classification',()=>{
 const r={metricId:'RONI',trend:{latest:{period:'2026-10',value:.8,sourcePeriod:'SON 2026'}}};
 const a=assessEnsoNumerics([r]);
 assert.equal(a.status,'OCEAN_THRESHOLD_WITHOUT_TWO_ATMOSPHERIC_INDICATORS');
 assert.equal(a.noaaOfficialEpisodeClassificationVerified,false);
 assert.equal(a.falsePositiveRate,null);
 const b=assessEnsoNumerics([r,
  {metricId:'SOI',trend:{latest:{period:'2026-10',value:-1.5}}},
  {metricId:'TRADE_WIND_CPAC',trend:{latest:{period:'2026-09',value:-2}}}]);
 assert.equal(b.status,'MULTI_INDEX_WARM_CONTEXT');
 assert.equal(b.atmosphericSupportCount,2);
 assert.equal(b.regionalTeleconnectionVerified,false);
 assert.equal(b.issuerImpactVerified,false);
});
test('captures official RONI with local receipt, response digest and no historical first-release claim',async t=>{
 const h=await fixture(t);
 const r=await h.service.capture({metricId:'RONI'});
 assert.equal(r.deduplicated,false);
 assert.equal(r.record.capturedAt,T1);
 assert.equal(r.record.series.at(-1).period,'2026-11');
 assert.match(r.record.bodySha256,/^[a-f0-9]{64}$/);
 assert.equal(r.record.actualOriginalReleaseClockVerified,false);
 assert.equal(r.record.series[0].originalFirstReleaseVerified,false);
 assert.equal((await h.service.capture({metricId:'RONI'})).deduplicated,true);
 assert.equal((await h.service.view()).totalCapturedVersions,1);
 assert.equal(h.calls.length,2);
});
test('2025 measurement first captured in 2026 is absent from 2025 platform replay',async t=>{
 const h=await fixture(t);
 await h.service.capture({metricId:'RONI'});
 const old=await h.service.view({asOf:EARLY});
 assert.equal(old.metrics.length,0);
 assert.equal(old.assessment.status,'INSUFFICIENT_RONI_DATA');
 const current=await h.service.view({asOf:T1});
 assert.equal(current.metrics.length,1);
 assert.equal(current.metrics[0].capturedAt,T1);
 assert.equal(current.metrics[0].series.some(x=>x.period.startsWith('2025')),true);
 await assert.rejects(h.service.view({asOf:FUTURE}),{status:400});
});
test('source revisions are preserved with changed original monthly reading and correct cutoff replay',async t=>{
 const h=await fixture(t);
 await h.service.capture({metricId:'RONI'});
 h.setTime(T2);h.setRoni(roni(1.75));
 const updated=await h.service.capture({metricId:'RONI'});
 assert.equal(updated.deduplicated,false);
 assert(updated.record.changedSincePrevious.some(x=>x.period==='2026-11'&&x.before===1.3&&x.after===1.75));
 assert.equal((await h.service.view({asOf:T1})).metrics[0].trend.latest.value,1.3);
 assert.equal((await h.service.view({asOf:T2})).metrics[0].trend.latest.value,1.75);
 assert.equal((await h.service.view({asOf:T2})).totalCapturedVersions,2);
});
test('multi-index environmental context never marks California/Peru damage or issuer outcome established',async t=>{
 const h=await fixture(t);
 for(const metricId of ['RONI','RELATIVE_NINO34','SOI','TRADE_WIND_CPAC','TRADE_WIND_WPAC'])
  await h.service.capture({metricId});
 const view=await h.service.view();
 assert.equal(view.metrics.length,5);
 assert.equal(view.assessment.status,'MULTI_INDEX_WARM_CONTEXT');
 assert.equal(view.downstreamEvidenceVerified,false);
 assert.equal(view.assessment.issuerImpactVerified,false);
 assert.equal(view.assessment.falsePositiveRate,null);
 assert(view.metrics.every(x=>x.originalSourcePublicationVerified===false));
 assert.equal(h.calls.length,5);
});
test('read-only replay does not fetch network and source journal survives restart, rejects tampering',async t=>{
 const h=await fixture(t);
 await h.service.capture({metricId:'RONI'});
 const count=h.calls.length;
 await h.service.view();assert.equal(h.calls.length,count);
 await h.service.close();
 const revived=createClimateNumeric({filename:h.filename,enabled:true,
  rightsAcknowledged:true,now:()=>T2,fetchImpl:async()=>{throw Error('NO NETWORK ON REPLAY');}});
 assert.equal((await revived.view()).metrics.length,1);
 await revived.close();
 const existing=await readFile(h.filename,'utf8');
 await writeFile(h.filename,existing.replace('"value": 1.3','"value": 0.1'));
 const altered=createClimateNumeric({filename:h.filename,enabled:true,now:()=>T2});
 await assert.rejects(altered.view(),{status:500});
});
test('private local read/capture requires authorized host and explicit source-use acknowledgement',async t=>{
 const disabled=await fixture(t,{enabled:false});
 await assert.rejects(disabled.service.view(),{status:403});
 await assert.rejects(disabled.service.capture({metricId:'RONI'}),{status:403});
 assert.equal(disabled.calls.length,0);
 const noRights=await fixture(t,{rightsAcknowledged:false});
 await assert.rejects(noRights.service.capture({metricId:'RONI'}),{status:403});
 assert.equal(noRights.calls.length,0);
});
test('API refuses cross-site requests, arbitrary URLs, unsupported metrics and future as-of values',async t=>{
 const h=await fixture(t);
 const handle=createClimateNumericApi({service:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port+'/api/climate-numeric/';
 assert.equal((await fetch(root+'catalog')).status,200);
 assert.equal((await fetch(root+'view?asOf='+encodeURIComponent(FUTURE))).status,400);
 assert.equal((await fetch(root+'view?source=https://example.com')).status,400);
 assert.equal((await fetch(root+'capture',{method:'GET'})).status,404);
 const body=JSON.stringify({metricId:'RONI'});
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Climate-Numeric':'1',
   Origin:'https://attacker.example'},body})).status,403);
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Climate-Numeric':'1'},
  body:JSON.stringify({metricId:'RONI',url:'http://localhost/.env'})})).status,400);
 assert.equal((await fetch(root+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Climate-Numeric':'1'},
  body:JSON.stringify({metricId:'NOAA_ANYTHING'})})).status,400);
 const good=await fetch(root+'capture',{method:'POST',headers:{
  'Content-Type':'application/json','X-ResearchOS-Climate-Numeric':'1'},body});
 assert.equal(good.status,200);
 assert.equal((await good.json()).record.series.length,23);
 assert.equal((await fetch(root+'view?metricId=RONI')).status,200);
});
test('v0.46 front end and API routing appear in static asset allowlists and navigation',async()=>{
 const load=x=>readFile(new URL('../'+x,import.meta.url),'utf8');
 const [html,js,server,nav,staticBuild,security]=await Promise.all([
  load('climate-numeric.html'),load('climate-numeric.js'),
  load('server.mjs'),load('hierarchy-navigation.js'),
  load('scripts/build-static.mjs'),load('tests/security.test.mjs')
 ]);
 for(const id of ['numeric-capture','numericForm','numericMetric','numeric-asof',
 'numericResults','numericExport','numeric-causal-context'])assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/climate-numeric/'));
 assert(server.includes('if(await handleClimateNumeric(req,res,u))return;'));
 assert(nav.includes("href:'/climate-numeric.html'"));
 assert(staticBuild.includes("'climate-numeric.js'"));
 assert(security.includes("'climate-numeric.js'"));
});
