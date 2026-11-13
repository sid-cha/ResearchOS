import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createResearchMonitor} from '../lib/research-monitor.mjs';

const START=Date.parse('2026-11-12T18:00:00Z');
const screen=()=>({id:'SCREEN-fixture',revision:3,name:'Completed close threshold',match:'all',symbols:['AAPL'],
 conditions:[{metricId:'price.close',operator:'gt',value:200}]});
function fakeClock(){
 let time=START,serial=0;const tasks=new Map();
 return {now:()=>time,setTimeoutImpl(fn,delay){const handle={id:++serial,unref(){}};tasks.set(handle,{fn,at:time+delay});return handle;},clearTimeoutImpl(handle){tasks.delete(handle);},
  advance(ms){time+=ms;for(const [handle,task] of [...tasks].sort((a,b)=>a[1].at-b[1].at)){if(task.at<=time){tasks.delete(handle);task.fn();}}},get pending(){return tasks.size;}};
}
async function until(check){for(let index=0;index<500;index++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('Timed out waiting for monitor work');}
async function harness(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'research-monitor-')),filename=join(directory,'monitors.json'),clock=fakeClock(),instances=[];
 const open=(extra={})=>{const service=createResearchMonitor({filename,evaluate:async()=>({evaluated:1,triggered:1}),...clock,...options,...extra});instances.push(service);return service;};
 const service=open();t.after(async()=>{for(const instance of instances)instance.close();await rm(directory,{recursive:true,force:true});});
 return {service,open,clock,filename};
}

test('monitor creation snapshots safe saved criteria, defaults disabled and persists only bounded summaries',async t=>{
 const h=await harness(t,{evaluate:async({monitor,signal})=>{assert.equal(signal.aborted,false);assert.equal(monitor.rule.symbols,undefined);return {evaluated:1,triggered:1,alertsCreated:1,rawBars:['PRIVATE_RAW'],apiKey:'PRIVATE_KEY'};}});
 const original=screen();original.secret='PRIVATE_KEY';original.conditions[0].privateRaw='PRIVATE_RAW';
 const created=await h.service.create({screen:original,symbols:['MSFT'],extraSecret:'PRIVATE_KEY'});
 original.conditions[0].value=999;
 assert.equal(created.enabled,false);assert.equal(created.nextRunAt,null);assert.equal(created.rule.conditions[0].value,200);
 assert.equal(created.rule.id,'monitor:'+created.id);assert.equal(created.screenRevision,3);assert.deepEqual(created.symbols,['MSFT']);
 assert.equal(created.rule.symbols,undefined);created.rule.conditions[0].value=400;
 await h.service.start();h.clock.advance(3600000);assert.equal(h.clock.pending,0);
 const run=await h.service.runNow(created.id);assert.equal(run.action,'completed');assert.equal(run.monitor.lastRun.summary.alertsCreated,1);
 assert.equal(run.monitor.revision,1);assert.equal(run.monitor.lastRun.symbolCount,1);assert.equal(run.monitor.nextRunAt,null);
 const reopened=await h.open().get(created.id);assert.equal(reopened.rule.conditions[0].value,200);assert.equal(reopened.lastRun.status,'completed');
 const body=await readFile(h.filename,'utf8');assert(!body.includes('PRIVATE_'));assert(!body.includes('rawBars'));assert(!body.includes('apiKey'));
 assert.equal((await stat(h.filename)).mode&0o777,0o600);
});

test('enabled cadence runs once after missed intervals and restart resumes overdue work once',async t=>{
 let calls=0;const h=await harness(t,{evaluate:async()=>{calls++;return {evaluated:1,ready:1};}});
 const monitor=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});
 assert.equal(h.clock.pending,0);await h.service.start();assert.equal(h.clock.pending,1);
 h.clock.advance(299999);assert.equal(calls,0);h.clock.advance(1);
 await until(async()=>Boolean((await h.service.get(monitor.id)).lastRun));assert.equal(calls,1);
 assert.equal((await h.service.get(monitor.id)).nextRunAt,new Date(START+600000).toISOString());
 h.clock.advance(1500000);await until(()=>calls===2);await until(()=>h.service.getHealth().runningMonitorId===null);
 assert.equal((await h.service.get(monitor.id)).nextRunAt,new Date(h.clock.now()+300000).toISOString());
 h.service.close();h.clock.advance(1200000);assert.equal(calls,2);
 const restarted=h.open();await restarted.start();h.clock.advance(0);
 await until(()=>calls===3);await until(()=>restarted.getHealth().runningMonitorId===null);
 h.clock.advance(0);assert.equal(calls,3);assert.equal(h.clock.pending,1);
});

test('one global active scan rejects duplicate and other manual runs without queuing',async t=>{
 let release,calls=0,blocked=true;const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{evaluate:async()=>{calls++;if(blocked)await gate;return {evaluated:1,triggered:1};}});
 const first=await h.service.create({screen:screen()}),second=await h.service.create({screen:screen(),name:'Other monitor'});
 const pending=h.service.runNow(first.id);await until(()=>calls===1);
 assert.equal((await h.service.get(first.id)).running,true);
 assert.equal((await h.service.runNow(first.id)).action,'busy');assert.equal((await h.service.runNow(second.id)).action,'busy');
 assert.equal(h.service.getHealth().queued,0);assert.equal(calls,1);
 blocked=false;release();assert.equal((await pending).action,'completed');
 assert.equal((await h.service.runNow(second.id)).action,'completed');assert.equal(calls,2);
});

test('multiple due monitors remain serial without catch-up queues while one provider scan is pending',async t=>{
 let release,calls=0,active=0,maximum=0;const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{evaluate:async()=>{calls++;active++;maximum=Math.max(maximum,active);if(calls===1)await gate;active--;return {evaluated:1};}});
 const first=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});
 const second=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});
 await h.service.start();await h.service.start();assert.equal(h.clock.pending,1);
 h.clock.advance(300000);await until(()=>calls===1);h.clock.advance(900000);assert.equal(calls,1);assert.equal(h.clock.pending,0);
 release();await until(()=>h.service.getHealth().runningMonitorId===null);h.clock.advance(0);await until(()=>calls===2);await until(()=>h.service.getHealth().runningMonitorId===null);
 assert.equal(maximum,1);assert((await h.service.get(first.id)).lastRun);assert((await h.service.get(second.id)).lastRun);
 h.clock.advance(0);assert.equal(calls,2);
});

test('revisioned disable aborts active scan and prevents its late result from changing persisted state',async t=>{
 let release,signal;const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{evaluate:async input=>{signal=input.signal;await gate;return {evaluated:1,triggered:1};}});
 const monitor=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});await h.service.start();
 const pending=h.service.runNow(monitor.id);await until(()=>Boolean(signal));
 const updated=await h.service.update(monitor.id,{expectedRevision:1,enabled:false});assert.equal(updated.revision,2);assert.equal(signal.aborted,true);
 release();assert.equal((await pending).action,'cancelled');
 const current=await h.service.get(monitor.id);assert.equal(current.enabled,false);assert.equal(current.nextRunAt,null);assert.equal(current.lastRun,null);assert.equal(h.clock.pending,0);
 await assert.rejects(h.service.update(monitor.id,{expectedRevision:1,enabled:true}),{status:409});
 const enabled=await h.service.update(monitor.id,{expectedRevision:2,enabled:true,intervalMinutes:10});assert.equal(enabled.revision,3);assert.equal(enabled.nextRunAt,new Date(START+600000).toISOString());
});

test('delete during a scan aborts it and removes the configuration without resurrecting it',async t=>{
 let release,signal;const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{evaluate:async input=>{signal=input.signal;await gate;return {evaluated:1};}});
 const monitor=await h.service.create({screen:screen()});const pending=h.service.runNow(monitor.id);await until(()=>Boolean(signal));
 await h.service.delete(monitor.id,{expectedRevision:1});assert.equal(signal.aborted,true);release();
 assert.deepEqual(await pending,{action:'cancelled',monitor:null});assert.deepEqual(await h.service.list(),[]);
 await assert.rejects(h.service.get(monitor.id),{status:404});
});

test('close cancels timers and ignores pending callback completion, keeping failure details private',async t=>{
 let release,signal;const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{evaluate:async input=>{signal=input.signal;await gate;throw Error('PRIVATE_PROVIDER_SECRET');}});
 const monitor=await h.service.create({screen:screen(),enabled:true});await h.service.start();
 const pending=h.service.runNow(monitor.id);await until(()=>Boolean(signal));h.service.close();assert.equal(signal.aborted,true);release();
 assert.equal((await pending).action,'cancelled');assert.equal((await h.service.get(monitor.id)).lastRun,null);assert.equal(h.clock.pending,0);
 assert.equal(h.service.getHealth().closed,true);assert.equal(h.service.getHealth().runningMonitorId,null);
 await assert.rejects(h.service.runNow(monitor.id),{status:409});await assert.rejects(h.service.create({screen:screen()}),{status:409});
 assert(!(await readFile(h.filename,'utf8')).includes('PRIVATE_PROVIDER'));
});

test('evaluator failures produce a static failed summary and continue the next scheduled interval',async t=>{
 let calls=0;const h=await harness(t,{evaluate:async()=>{calls++;throw Object.assign(Error('PRIVATE_PROVIDER_SECRET'),{status:429});}});
 const monitor=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});await h.service.start();
 const result=await h.service.runNow(monitor.id);assert.equal(result.action,'failed');assert.equal(result.monitor.lastRun.status,'failed');
 assert.equal(result.monitor.nextRunAt,new Date(START+300000).toISOString());assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER'));
 h.clock.advance(300000);await until(()=>calls===2);await until(()=>h.service.getHealth().runningMonitorId===null);
 assert.equal((await h.service.get(monitor.id)).lastRun.summary.triggered,0);assert.equal(h.clock.pending,1);
});

test('validation enforces saved identities, allowed metrics/symbols, finite intervals, immutable criteria and bounds',async t=>{
 const h=await harness(t,{maxMonitors:2});
 for(const input of [{},{screen:{...screen(),id:undefined}},{screen:{...screen(),revision:undefined}},{screen:screen(),enabled:'yes'},
  {screen:screen(),symbols:['UNKNOWN']},{screen:screen(),symbols:[]},{screen:screen(),intervalMinutes:4},{screen:screen(),intervalMinutes:1441},
  {screen:{...screen(),conditions:[{metricId:'unknown.metric',operator:'gt',value:1}]}},{screen:screen(),name:'x'.repeat(161)}]){
  await assert.rejects(h.service.create(input),{status:400});
 }
 const monitor=await h.service.create({screen:screen()});
 await assert.rejects(h.service.update(monitor.id,{expectedRevision:1,rule:screen()}),{status:400});
 await assert.rejects(h.service.update(monitor.id,{expectedRevision:1,intervalMinutes:0}),{status:400});
 await h.service.create({screen:screen()});await assert.rejects(h.service.create({screen:screen()}),{status:409});
 assert.equal((await h.service.list()).length,2);
});

test('failed atomic writes preserve the in-memory configuration and can be retried',async t=>{
 const h=await harness(t);const monitor=await h.service.create({screen:screen()});const original=await readFile(h.filename,'utf8');
 await rm(h.filename);await mkdir(h.filename);
 await assert.rejects(h.service.update(monitor.id,{expectedRevision:1,enabled:true}));
 const unchanged=await h.service.get(monitor.id);assert.equal(unchanged.revision,1);assert.equal(unchanged.enabled,false);
 await rm(h.filename,{recursive:true});await writeFile(h.filename,original);
 const updated=await h.service.update(monitor.id,{expectedRevision:1,enabled:true});assert.equal(updated.revision,2);
});

test('scheduled persistence failure backs off rather than retrying an overdue job in a tight loop',async t=>{
 let calls=0;const h=await harness(t,{evaluate:async()=>{calls++;return {evaluated:1,ready:1};}});
 const monitor=await h.service.create({screen:screen(),enabled:true,intervalMinutes:5});const original=await readFile(h.filename,'utf8');
 await h.service.start();await rm(h.filename);await mkdir(h.filename);h.clock.advance(300000);
 await until(()=>h.service.getHealth().lastSchedulerError!==null);assert.equal(calls,1);assert.equal((await h.service.get(monitor.id)).lastRun,null);
 await rm(h.filename,{recursive:true});await writeFile(h.filename,original);
 h.clock.advance(299999);assert.equal(calls,1);h.clock.advance(1);await until(()=>calls===2);await until(()=>h.service.getHealth().runningMonitorId===null);
 assert.equal((await h.service.get(monitor.id)).lastRun.status,'completed');assert.equal(h.service.getHealth().lastSchedulerError,null);
});

test('malformed, oversized and invalid persisted configuration fails safely without starting timers',async t=>{
 const h=await harness(t);
 for(const input of ['PRIVATE_BAD_JSON',JSON.stringify({schema:1,monitors:[{id:'PRIVATE_BAD_RECORD'}]}),' '.repeat(1048577)]){
  await writeFile(h.filename,input);const broken=h.open();
  await assert.rejects(broken.start(),error=>error.status===500&&!error.message.includes('PRIVATE_'));
  assert.equal(broken.getHealth().started,false);assert.equal(h.clock.pending,0);
 }
});
