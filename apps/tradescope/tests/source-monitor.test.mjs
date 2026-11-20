import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 createSourceMonitor,createSourceMonitorApi,SOURCE_MONITOR_VERSION,SOURCE_MONITOR_LIMITS
} from '../lib/source-monitor.mjs';

const T0='2026-11-16T17:00:00.000Z',HOUR=3600000;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function fixture(t,{enabled=true,rightsAcknowledged=true,climateRights=true}={}){
 const folder=await mkdtemp(path.join(tmpdir(),'researchos-source-monitor-'));
 t.after(async()=>rm(folder,{force:true,recursive:true}));
 const filename=path.join(folder,'monitor.json');
 let time=Date.parse(T0),version='a',failNext=false,permissions={climate:climateRights,corporate:true,mechanism:true};
 const calls=[],timers=new Map();let sequence=0;
 const later=()=>new Date(time).toISOString();
 const valid=kind=>({enabled:true,rightsAcknowledged:permissions[kind]});
 const climateNumeric={
  catalog:()=>valid('climate'),
  capture:async({metricId})=>{
   calls.push({kind:'NOAA',metricId});
   const disk=JSON.parse(await readFile(filename,'utf8'));
   assert.equal(disk.runs.at(-1).status,'RUNNING','attempt should persist before external source call');
   if(failNext){failNext=false;throw Error('Official NOAA unavailable');}
   return {deduplicated:calls.filter(x=>x.kind==='NOAA').length>1&&version==='a',
    record:{capturedAt:later(),bodySha256:version.repeat(64),
     series:[{period:'2026-10',value:.65}],
     changedSincePrevious:version==='b'?[{period:'2026-10',before:.65,after:.82}]:[],
     addedPeriods:version==='a'?['2026-10']:[]}};
  }
 };
 const corporatePrecursor={
  catalog:()=>valid('corporate'),
  capture:async({symbol,source})=>{
   calls.push({kind:'CORPORATE',symbol,source});
   const disk=JSON.parse(await readFile(filename,'utf8'));
   assert.equal(disk.runs.at(-1).status,'RUNNING');
   if(failNext){failNext=false;throw Error('News provider request rate-limited');}
   return {deduplicated:false,record:{capturedAt:later(),bodySha256:version.repeat(64),
    items:[{id:'article-a',headline:'Nvidia export control investigation report',
     attention:'PROMPT_HUMAN_REVIEW'}]}};
  }
 };
 const mechanismRadar={
  catalog:()=>valid('mechanism'),
  capture:async({themeId,provider})=>{
   calls.push({kind:'MECHANISM',themeId,provider});
   const disk=JSON.parse(await readFile(filename,'utf8'));
   assert.equal(disk.runs.at(-1).status,'RUNNING');
   return {deduplicated:false,snapshot:{capturedAt:later(),bodySha256:version.repeat(64),
    observations:[{id:'theme-story-1',title:'Pacific trade wind anomaly reported',
     contentStatus:'MEDIA_TITLE_TOPIC_MATCH_ONLY'}]}};
  }
 };
 const setTimeoutImpl=(fn,delay)=>{
  const id=++sequence;timers.set(id,{fn,delay});
  return {id,unref(){}};
 };
 const clearTimeoutImpl=obj=>{if(obj)timers.delete(obj.id);};
 const monitor=createSourceMonitor({filename,climateNumeric,corporatePrecursor,
  mechanismRadar,enabled,rightsAcknowledged,now:()=>time,setTimeoutImpl,clearTimeoutImpl});
 return {monitor,filename,climateNumeric,corporatePrecursor,mechanismRadar,calls,timers,
  setTime:t=>{time=typeof t==='string'?Date.parse(t):t;},now:()=>time,
  setVersion:x=>{version=x;},breakNext:()=>{failNext=true;},
  setRights:(k,v)=>{permissions[k]=v;},setTimeoutImpl,clearTimeoutImpl};
}
const corpSchedule={kind:'CORPORATE_PRECURSOR',target:'NVDA',provider:'GDELT_MEDIA',intervalMinutes:60};
const climateSchedule={kind:'NOAA_NUMERIC',target:'RONI',provider:'RONI',intervalMinutes:360};
const mechanismSchedule={kind:'MECHANISM_RADAR',target:'enso-circulation',provider:'NOAA_CPC',intervalMinutes:60};
test('v0.47 catalog exposes fixed rate caps, local inbox only, and no cloud or external notification claim',async t=>{
 const f=await fixture(t),c=f.monitor.catalog();
 assert.equal(SOURCE_MONITOR_VERSION,'SOURCE-MONITOR-0.47.1');
 assert.equal(c.maximumJobs,SOURCE_MONITOR_LIMITS.jobs);
 assert.equal(c.delivery.localInbox,true);
 assert.equal(c.delivery.externalPush,false);
 assert.equal(c.delivery.email,false);
 assert.equal(c.delivery.webhook,false);
 assert.equal(c.scheduleRules.find(x=>x.kind==='NOAA_NUMERIC').minIntervalMinutes,360);
 assert.equal(c.scheduleRules.find(x=>x.kind==='CORPORATE_PRECURSOR').minIntervalMinutes,60);
 assert.equal((await f.monitor.view()).jobs.length,0);
 assert.equal(f.calls.length,0);
});
test('source configuration allowlists all targets and enforces provider-specific minimum poll interval',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.monitor.configure({...climateSchedule,intervalMinutes:10}),{status:400});
 await assert.rejects(f.monitor.configure({...corpSchedule,target:'../../secrets'}),{status:400});
 await assert.rejects(f.monitor.configure({...corpSchedule,provider:'http://localhost'}),{status:400});
 await assert.rejects(f.monitor.configure({...mechanismSchedule,target:'regulatory-export'}),{status:400});
 await assert.rejects(f.monitor.configure({...corpSchedule,intervalMinutes:1500}),{status:400});
 const job=await f.monitor.configure(climateSchedule);
 assert.equal(job.nextRunAt,new Date(Date.parse(T0)+6*HOUR).toISOString());
 assert.equal(job.status,'IDLE');
 assert.equal(f.calls.length,0);
});
test('disabled scheduler does not run, and a job is never auto-created from source data',async t=>{
 const f=await fixture(t,{rightsAcknowledged:false});
 assert.equal((await f.monitor.start()).started,false);
 await assert.rejects(f.monitor.configure(corpSchedule),{status:403});
 assert.equal((await f.monitor.view()).jobs.length,0);
 assert.equal(f.calls.length,0);
 const remote=await fixture(t,{enabled:false});
 await assert.rejects(remote.monitor.view(),{status:403});
 await assert.rejects(remote.monitor.runNow('source-job-00000000-0000-4000-8000-000000000000'),{status:403});
 assert.equal(remote.calls.length,0);
});
test('collectors retain independent source rights; a schedule cannot override a revoked license',async t=>{
 const f=await fixture(t,{climateRights:false});
 await assert.rejects(f.monitor.configure(climateSchedule),{status:403});
 assert.equal(f.calls.length,0);
 const ready=await fixture(t);
 const job=await ready.monitor.configure(climateSchedule);
 ready.setRights('climate',false);
 const failed=await ready.monitor.runNow(job.id);
 assert.equal(failed.status,'FAILED');
 assert.equal((await ready.monitor.view()).recentRuns[0].status,'FAILED');
 assert.equal(ready.calls.length,0);
});
test('schedule is durable, keyed by kind/target/provider, and update does not duplicate it',async t=>{
 const f=await fixture(t);
 const first=await f.monitor.configure(corpSchedule);
 const second=await f.monitor.configure({...corpSchedule,intervalMinutes:120});
 assert.equal(first.id,second.id);
 assert.equal(second.intervalMinutes,120);
 assert.equal((await f.monitor.view()).jobs.length,1);
 const onDisk=JSON.parse(await readFile(f.filename,'utf8'));
 assert.equal(onDisk.jobs.length,1);
 assert.match(onDisk.checksum,/^[0-9a-f]{64}$/);
 assert.equal(onDisk.jobs[0].provider,'GDELT_MEDIA');
});
test('opted-in source monitor starts bounded timers for existing schedules, without immediate provider call',async t=>{
 const f=await fixture(t);
 await f.monitor.configure(corpSchedule);
 assert.equal(f.timers.size,0);
 const started=await f.monitor.start();
 assert.equal(started.started,true);
 assert.equal(f.timers.size,1);
 assert.equal(f.calls.length,0);
 await f.monitor.close();
 assert.equal(f.timers.size,0);
});
test('scheduled due work performs one collector check, writes source hash, then reschedules',async t=>{
 const f=await fixture(t),job=await f.monitor.configure(corpSchedule);
 f.setTime(Date.parse(T0)+HOUR);
 const run=await f.monitor.tick();
 assert.equal(run.status,'SUCCEEDED');
 assert.equal(run.manual,false);
 assert.equal(run.scheduledAt,new Date(Date.parse(T0)+HOUR).toISOString());
 const s=await f.monitor.view();
 assert.equal(s.jobs[0].status,'SUCCEEDED');
 assert.equal(s.jobs[0].nextRunAt,new Date(Date.parse(T0)+2*HOUR).toISOString());
 assert.equal(s.summary.pendingReview,1);
 assert.equal(s.alerts[0].type,'CORPORATE_REPORT_REVIEW');
 assert.equal(s.alerts[0].priority,'ELEVATED_REVIEW');
 assert.equal(s.alerts[0].originalPublisherPublicationVerified,false);
 assert.equal(s.alerts[0].deliveryStatus,'LOCAL_INBOX_ONLY');
 assert.equal(s.realTimePushDelivered,false);
 assert.equal(f.calls.length,1);
 assert.equal((await f.monitor.tick()).status,'NO_DUE_JOBS');
 assert.equal(f.calls.length,1);
});
test('unchanged observed article URL produces no duplicate inbox alert on the next run',async t=>{
 const f=await fixture(t),job=await f.monitor.configure(corpSchedule);
 const first=await f.monitor.runNow(job.id);
 assert.equal(first.alertCount,1);
 const second=await f.monitor.runNow(job.id);
 assert.equal(second.status,'SUCCEEDED');
 assert.equal(second.alertCount,0);
 const view=await f.monitor.view();
 assert.equal(view.alerts.length,1);
 assert.equal(view.recentRuns.length,2);
});
test('NOAA source baseline and threshold lead remain unverified and deduplicate by source digest',async t=>{
 const f=await fixture(t);
 const job=await f.monitor.configure(climateSchedule);
 const first=await f.monitor.runNow(job.id);
 assert.equal(first.status,'SUCCEEDED');
 assert.equal(first.alertCount,2);
 const view=await f.monitor.view();
 assert.equal(view.alerts.some(x=>x.type==='CLIMATE_THRESHOLD_REVIEW'),true);
 assert(view.alerts.every(x=>x.sourceMaterialityVerified===false));
 assert(view.alerts.every(x=>x.verifiedMarketImpact===false));
 assert(view.alerts.every(x=>x.originalPublisherPublicationVerified===false));
 assert.equal((await f.monitor.runNow(job.id)).alertCount,0);
});
test('revised NOAA source creates distinct, explicitly reviewable source revision alert',async t=>{
 const f=await fixture(t),job=await f.monitor.configure(climateSchedule);
 await f.monitor.runNow(job.id);
 f.setVersion('b');
 const revised=await f.monitor.runNow(job.id);
 assert.equal(revised.status,'SUCCEEDED');
 const view=await f.monitor.view();
 assert(view.alerts.some(x=>x.type==='SOURCE_REVISION'));
 assert(view.jobs[0].lastResult.newReviewItems>0);
 assert.equal(view.summary.pendingReview,view.alerts.length);
});
test('mechanism source report creates only a conditional theme review, no issuer return prediction',async t=>{
 const f=await fixture(t),job=await f.monitor.configure(mechanismSchedule);
 const run=await f.monitor.runNow(job.id);
 assert.equal(run.status,'SUCCEEDED');
 const alert=(await f.monitor.view()).alerts[0];
 assert.equal(alert.type,'MECHANISM_TOPIC_REVIEW');
 assert.equal(alert.verifiedMarketImpact,false);
 assert.match(alert.details,/research lead/);
});
test('persistent failure is visible and next due check is backed off without spinning',async t=>{
 const f=await fixture(t),job=await f.monitor.configure({...corpSchedule,intervalMinutes:240});
 f.breakNext();
 const failed=await f.monitor.runNow(job.id);
 assert.equal(failed.status,'FAILED');
 assert.match(failed.error,/News provider request rate-limited/);
 const view=await f.monitor.view();
 assert.equal(view.summary.recentFailureCount,1);
 assert.equal(view.jobs[0].failures,1);
 assert.equal(view.jobs[0].status,'FAILED');
 assert.equal(view.jobs[0].nextRunAt,new Date(Date.parse(T0)+HOUR).toISOString());
 assert.equal((await f.monitor.tick()).status,'NO_DUE_JOBS');
 f.setTime(Date.parse(T0)+HOUR);
 const recovered=await f.monitor.tick();
 assert.equal(recovered.status,'SUCCEEDED');
 assert.equal((await f.monitor.view()).jobs[0].failures,0);
});
test('consecutive failed runs use exponential backoff up to provider cap',async t=>{
 const f=await fixture(t);
 const job=await f.monitor.configure({...corpSchedule,intervalMinutes:240});
 f.breakNext();await f.monitor.runNow(job.id);
 let view=await f.monitor.view();
 assert.equal(view.jobs[0].nextRunAt,new Date(Date.parse(T0)+HOUR).toISOString());
 f.setTime(Date.parse(T0)+HOUR);
 f.breakNext();await f.monitor.tick();
 view=await f.monitor.view();
 assert.equal(view.jobs[0].failures,2);
 assert.equal(view.jobs[0].nextRunAt,new Date(Date.parse(T0)+3*HOUR).toISOString());
});
test('acknowledged alert remains acknowledged after restarting without further network calls',async t=>{
 const f=await fixture(t),job=await f.monitor.configure(corpSchedule);
 await f.monitor.runNow(job.id);
 const before=(await f.monitor.view()).alerts[0];
 const after=await f.monitor.acknowledge(before.id);
 assert.equal(after.status,'ACKNOWLEDGED');
 assert.equal((await f.monitor.acknowledge(before.id)).acknowledgedAt,after.acknowledgedAt);
 await f.monitor.close();
 const loaded=createSourceMonitor({
  filename:f.filename,climateNumeric:f.climateNumeric,
  corporatePrecursor:f.corporatePrecursor,mechanismRadar:f.mechanismRadar,
  enabled:true,rightsAcknowledged:true,now:f.now,
  setTimeoutImpl:f.setTimeoutImpl,clearTimeoutImpl:f.clearTimeoutImpl
 });
 assert.equal((await loaded.view()).alerts[0].status,'ACKNOWLEDGED');
 assert.equal(f.calls.length,1);
 await loaded.close();
});
test('journal restart recovers a persisted RUNNING attempt as interrupted, not successful',async t=>{
 const f=await fixture(t);
 const jobId='source-job-'+randomUUID(),runId='source-run-'+randomUUID();
 const body={schema:1,jobs:[{
  id:jobId,...corpSchedule,enabled:true,createdAt:T0,updatedAt:T0,nextRunAt:T0,
  failures:0,status:'RUNNING',lastResult:null
 }],runs:[{
  id:runId,jobId,kind:'CORPORATE_PRECURSOR',target:'NVDA',provider:'GDELT_MEDIA',
  status:'RUNNING',scheduledAt:T0,startedAt:T0,finishedAt:null,
  error:null,alertCount:0,deduplicated:null,sourceHash:null,manual:false
 }],alerts:[]};
 const ready={...body,checksum:sha(body)};
 await writeFile(f.filename,JSON.stringify(ready));
 const view=await f.monitor.view();
 assert.equal(view.recentRuns[0].status,'INTERRUPTED');
 assert.equal(view.jobs[0].status,'INTERRUPTED');
 assert.equal(view.jobs[0].failures,1);
 assert.equal(view.jobs[0].nextRunAt,new Date(Date.parse(T0)+HOUR).toISOString());
 assert.equal(f.calls.length,0);
});
test('tampering with a durable alert or run causes the source journal to fail closed',async t=>{
 const f=await fixture(t);
 const job=await f.monitor.configure(corpSchedule);
 await f.monitor.runNow(job.id);
 await f.monitor.close();
 const existing=await readFile(f.filename,'utf8');
 await writeFile(f.filename,existing.replace('ELEVATED_REVIEW','INFORMATIONAL'));
 const other=createSourceMonitor({filename:f.filename,climateNumeric:f.climateNumeric,
  corporatePrecursor:f.corporatePrecursor,mechanismRadar:f.mechanismRadar,
  enabled:true,rightsAcknowledged:true,now:f.now});
 await assert.rejects(other.view(),{status:500});
});
test('pause and resume modify scheduling without making network requests',async t=>{
 const f=await fixture(t);
 const job=await f.monitor.configure(corpSchedule);
 assert.equal((await f.monitor.toggle(job.id,false)).enabled,false);
 await assert.rejects(f.monitor.runNow(job.id),{status:409});
 assert.equal((await f.monitor.toggle(job.id,true)).enabled,true);
 assert.equal(f.calls.length,0);
});
test('public local API accepts strict configuration, manual run and acknowledgement only',async t=>{
 const f=await fixture(t),handler=createSourceMonitorApi({monitor:f.monitor,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>new Promise(done=>server.close(done)));
 const url='http://127.0.0.1:'+server.address().port+'/api/source-monitor/';
 const headers={'Content-Type':'application/json','X-ResearchOS-Source-Monitor':'1'};
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'status')).status,200);
 assert.equal((await fetch(url+'status?bad=1')).status,404);
 assert.equal((await fetch(url+'schedule',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(corpSchedule)})).status,403);
 assert.equal((await fetch(url+'schedule',{method:'POST',headers:{...headers,Origin:'https://attacker.example'},
  body:JSON.stringify(corpSchedule)})).status,403);
 assert.equal((await fetch(url+'schedule',{method:'POST',headers,
  body:JSON.stringify({...corpSchedule,url:'http://localhost/.env'})})).status,400);
 const scheduled=await fetch(url+'schedule',{method:'POST',headers,body:JSON.stringify(corpSchedule)});
 assert.equal(scheduled.status,200);
 const job=await scheduled.json();
 const run=await fetch(url+'run',{method:'POST',headers,body:JSON.stringify({jobId:job.id})});
 assert.equal(run.status,200);
 assert.equal((await run.json()).status,'SUCCEEDED');
 const statuses=await(await fetch(url+'status?alertStatus=NEW')).json();
 assert.equal(statuses.alerts.length,1);
 const ack=await fetch(url+'acknowledge',{method:'POST',headers,
  body:JSON.stringify({alertId:statuses.alerts[0].id})});
 assert.equal(ack.status,200);
 assert.equal((await ack.json()).status,'ACKNOWLEDGED');
 assert.equal((await(await fetch(url+'status?alertStatus=NEW')).json()).alerts.length,0);
});
test('v0.47 is wired to the server, private API, navigation and static-only allowlist',async()=>{
 const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,server,nav,build,security]=await Promise.all([
  read('source-monitor.html'),read('source-monitor.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs'),
  read('tests/security.test.mjs')
 ]);
 for(const id of ['monitor-configure','monitorForm','monitor-jobs',
  'monitor-alerts','monitor-audit','monitorExport','monitorRefresh'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/source-monitor/'));
 assert(server.includes('if(await handleSourceMonitor(req,res,u))return;'));
 assert(server.includes('await sourceMonitor.start();'));
 assert(server.includes('await server.closeSourceMonitor()'));
 assert(nav.includes("href:'/source-monitor.html'"));
 assert(build.includes("'source-monitor.js'"));
 assert(security.includes("'source-monitor.js'"));
});
