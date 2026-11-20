import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assessPrecursorEvidence,createPrecursorEngine,createPrecursorApi,PRECURSOR_RULE_VERSION} from '../lib/precursor-intelligence.mjs';
import {createGlobalEventCollector} from '../lib/global-event-collector.mjs';

const H=3600000,W=6*H,E=Date.parse('2026-11-14T18:00:00Z');
const time=t=>new Date(t).toISOString();
const event=(k,start,{source='USGS',eventAt=start+H,firstAt=start+2*H,location=[-120,38],revisionCount=1}={})=>({
 id:source+':'+k,source,firstObservedAt:time(firstAt),eventTime:time(eventAt),
 latestRevisionAt:time(firstAt),type:'EARTHQUAKE',location,revisionCount
});
const poll=(source,start,{failures=0,successes=2,begin=H,last=5*H}={})=>({
 source,windowStart:time(start),successes,failures,
 firstSuccessAt:successes?time(start+begin):null,
 lastSuccessAt:successes?time(start+last):null
});
function fixture({burst=5,failAt=null,noCoverage=false,oldSourceTime=false,revisionOnly=false,
 future=false}={}){
 const pollWindows=[],events=[];
 for(let i=12;i>=1;i--){
  const start=E-i*W;
  if(!noCoverage||i!==3)pollWindows.push(poll('USGS',start,{failures:i===failAt?1:0}));
  const size=i===1?burst:1;
  for(let j=0;j<size;j++){
   if(revisionOnly&&i===1&&j>0)break;
   events.push(event('event-'+i+'-'+j,start,{
    eventAt:oldSourceTime&&i===1?start-W:start+H,
    location:[-120+j*0.15,38+j*0.05],
    revisionCount:revisionOnly&&i===1?20:1
   }));
  }
 }
 if(future){events.push(event('future',E+W,{eventAt:E+W+H,firstAt:E+W+2*H}));pollWindows.push(poll('USGS',E+W));}
 return {schemaVersion:1,asOf:time(E),events,pollWindows};
}
const evaluate=(options,asOf=time(E),source='USGS')=>
 assessPrecursorEvidence({evidence:fixture(options),asOf,source}).evaluations[0];

test('coverage-qualified local event increase is an INVESTIGATION lead, never an outcome forecast',()=>{
 const e=evaluate({});
 assert.equal(e.source,'USGS');
 assert.equal(e.status,'INVESTIGATE_OBSERVED_ACTIVITY');
 assert.equal(e.eligible,true);
 assert.equal(e.counts.current,5);
 assert.equal(e.comparison.baselineMean,1);
 assert.equal(e.comparison.activityRatio,5);
 assert.equal(e.geoObservation.spatialCandidateCount,5);
 assert.equal(e.predictiveWarningIssued,false);
 assert.equal(e.verifiedFutureOutcome,false);
 assert.equal(e.probability,null);
 assert.equal(e.issuerExposureValidated,false);
 assert.equal(e.evidenceIds.length,5);
 assert.equal(PRECURSOR_RULE_VERSION,'PRECURSOR-0.33.1');
});
test('baseline must have successful distributed polling checks; absence is not quietness',()=>{
 for(const options of [{noCoverage:true},{failAt:3}]){
  const e=evaluate(options);
  assert.equal(e.status,'ABSTAIN_COVERAGE');
  assert.equal(e.comparison,null);
  assert.equal(e.evidenceIds.length,0);
  assert(e.coverage.missingWindows.length>0);
  assert.equal(e.controls.falsePositiveRate,null);
 }
});
test('source events known late or old source event timestamps do not become independent timely precursors',()=>{
 const old=evaluate({oldSourceTime:true});
 assert.equal(old.counts.newlyObserved,5);
 assert.equal(old.counts.current,0);
 assert.equal(old.counts.timestampIneligible,5);
 assert.equal(old.status,'NO_ACTIVITY_SPIKE');
 const revised=evaluate({revisionOnly:true});
 assert.equal(revised.counts.current,1);
 assert.equal(revised.status,'NO_ACTIVITY_SPIKE');
 assert.equal(revised.counts.providerUpdates,1);
});
test('flat activity produces no false alert; historical controls are descriptive and never ground-truth negatives',()=>{
 const e=evaluate({burst:1});
 assert.equal(e.status,'NO_ACTIVITY_SPIKE');
 assert(e.controls.evaluated>=1);
 assert.equal(e.controls.thresholdWindows,0);
 assert.equal(e.controls.falsePositiveRate,null);
 assert.equal(e.controls.precision,null);
 assert.equal(e.controls.recall,null);
});
test('as-of checkpoint selects only completed windows and future observations cannot affect comparison',()=>{
 const a=evaluate({future:true});
 const b=evaluate({});
 assert.deepEqual(a,b);
 const cutoff=time(E-1);
 const older=assessPrecursorEvidence({evidence:fixture({}),asOf:cutoff,source:'USGS'}).evaluations[0];
 assert.equal(older.evaluationEnd,time(E-W));
 assert.equal(older.counts.current,1);
 assert.notEqual(older.status,'INVESTIGATE_OBSERVED_ACTIVITY');
});
test('same source IDs are never crossed with other provider baselines',()=>{
 const all=assessPrecursorEvidence({evidence:fixture({}),asOf:time(E)});
 assert.equal(all.evaluations.length,3);
 assert.equal(all.evaluations[0].status,'INVESTIGATE_OBSERVED_ACTIVITY');
 assert.equal(all.evaluations[1].status,'ABSTAIN_COVERAGE');
 assert.equal(all.evaluations[2].status,'ABSTAIN_COVERAGE');
 assert.throws(()=>assessPrecursorEvidence({evidence:fixture(),asOf:'not-a-date'}),{status:400});
 assert.throws(()=>assessPrecursorEvidence({evidence:fixture(),asOf:time(E),source:'BAD'}),{status:400});
});
test('engine rejects future as-of times and never polls upstream during read-only analysis',async()=>{
 let reads=0;
 const collector={precursorEvidence:async()=>{reads++;return fixture();}};
 const engine=createPrecursorEngine({collector,now:()=>time(E)});
 const r=await engine.analyze({source:'USGS',asOf:time(E)});
 assert.equal(r.evaluations[0].eligible,true);
 assert.equal(reads,1);
 await assert.rejects(engine.analyze({source:'USGS',asOf:time(E+H)}),{status:400});
 await assert.rejects(engine.analyze({source:'INVALID'}),{status:400});
 assert.equal(reads,1);
 assert.equal(engine.catalog().validation,'NOT_PREDICTIVE');
});
test('read-only HTTP precursor API validates query parameters and returns abstention for unobserved providers',async t=>{
 const engine=createPrecursorEngine({collector:{precursorEvidence:async()=>fixture()},now:()=>time(E)});
 const handle=createPrecursorApi({engine});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/precursors/';
 assert.equal((await fetch(url+'catalog')).status,200);
 const report=await (await fetch(url+'analysis?source=USGS&asOf='+encodeURIComponent(time(E)))).json();
 assert.equal(report.evaluations.length,1);
 assert.equal(report.evaluations[0].status,'INVESTIGATE_OBSERVED_ACTIVITY');
 assert.equal((await fetch(url+'analysis?source=BAD')).status,400);
 assert.equal((await fetch(url+'analysis?source=USGS&source=USGS')).status,400);
 assert.equal((await fetch(url+'analysis?asOf='+encodeURIComponent(time(E+H)))).status,400);
 assert.equal((await fetch(url+'analysis',{method:'POST'})).status,405);
});
test('v0.32 stores migrate without invented coverage; post-response clock is used for first observed at',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'precursor-collector-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'events.json');
 let clock='2026-11-14T12:00:00.000Z';
 const eventData={id:'USGS:a',source:'USGS',family:'climate',type:'EARTHQUAKE',title:'Observed earthquake',
  description:'Source record',eventTime:'2026-11-14T10:00:00Z',providerUpdatedAt:null,
  sourceUrl:'https://earthquake.usgs.gov',location:[-120,38],status:'reported'};
 const adapters={
  USGS:async()=>{clock='2026-11-14T12:05:00.000Z';return[eventData];},
  NASA_EONET:async()=>[],
  FAA_NAS_STATUS:async()=>[]
 };
 const service=createGlobalEventCollector({filename,enabled:true,now:()=>clock,adapters});
 await service.poll();
 const detail=await service.detail('USGS:a');
 assert.equal(detail.firstObservedAt,clock,'post-network time, not pre-request instant');
 assert.equal((await service.status()).pollWindowCount,3);
 await service.close();
 const old=JSON.parse(await readFile(filename,'utf8'));
 delete old.pollWindows;
 await writeFile(filename,JSON.stringify(old));
 const reopened=createGlobalEventCollector({filename,enabled:true,now:()=>clock,adapters});
 assert.equal((await reopened.status()).pollWindowCount,0);
 assert.equal((await reopened.precursorEvidence({asOf:'2026-11-14T18:00:00Z'})).pollWindows.length,0);
 await reopened.poll();
 assert.equal((await reopened.status()).pollWindowCount,3);
 assert.equal((await reopened.precursorEvidence({asOf:'2026-11-14T18:00:00Z'})).pollWindows.length,3);
 await reopened.close();
});
test('corrupt polling checkpoint fails closed instead of establishing fabricated coverage',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'precursor-corruption-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'events.json');
 const adapters={USGS:async()=>[],NASA_EONET:async()=>[],FAA_NAS_STATUS:async()=>[]};
 const c=createGlobalEventCollector({filename,enabled:true,now:()=>time(E-W),adapters});
 await c.poll();await c.close();
 const raw=JSON.parse(await readFile(filename,'utf8'));
 raw.pollWindows[0].successes=-1;
 await writeFile(filename,JSON.stringify(raw));
 const corrupted=createGlobalEventCollector({filename,enabled:false,now:()=>time(E),adapters});
 await assert.rejects(corrupted.precursorEvidence(),{status:500});
});
test('portal includes complete Precursor Radar UI and correct Level 3 deep link',async()=>{
 const base=new URL('../',import.meta.url);
 const read=async name=>readFile(new URL(name,base),'utf8');
 const [html,js,css,nav,server]=await Promise.all([
  read('event-portal.html'),read('event-portal.js'),read('event-portal.css'),
  read('hierarchy-navigation.js'),read('server.mjs')
 ]);
 for(const id of ['precursor-radar','precursorSource','precursorAsOf','runPrecursor','precursorResults','precursorState'])
  assert(html.includes('id="'+id+'"'));
 assert(js.includes('/api/precursors/'));
 assert(js.includes('false-positive rate, precision and recall are unknown'));
 assert(css.includes('.precursor-grid'));
 assert(nav.includes("href:'/event-portal.html#precursor-radar'"));
 assert(server.includes('createPrecursorApi'));
});
