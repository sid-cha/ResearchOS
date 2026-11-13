import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createResearchApi} from '../lib/research-api.mjs';
import {RESEARCH_NOW,researchSourcesFixture} from './helpers/research-fixtures.mjs';

async function harness(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'research-operations-'));
 const filename=join(directory,'research.json'),monitorFilename=join(directory,'monitors.json');
 const handler=createResearchApi({filename,monitorFilename,sources:researchSourcesFixture(),now:()=>RESEARCH_NOW,...options});
 await handler.start();
 const server=http.createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{handler.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,headers={})=>{const response=await fetch(base+'/api/research/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 return {request,handler,filename,monitorFilename};
}
const screen={name:'Completed close over 100',match:'all',conditions:[{metricId:'price.close',operator:'gt',value:100}],symbols:['MSFT']};
async function createMonitor(h,enabled=false){
 const saved=await h.request('screens','POST',screen);assert.equal(saved.status,201);
 const result=await h.request('monitors','POST',{screenId:saved.body.id,intervalMinutes:5,enabled});assert.equal(result.status,201);
 return {monitor:result.body,screen:saved.body};
}

test('Atlas HTTP workflow uses sourced company metrics and common-session curves with explicit subset coverage',async t=>{
 const h=await harness(t);
 const response=await h.request('atlas','POST',{symbols:['MSFT','AAPL'],comparisonSymbols:['MSFT','AAPL'],windowSessions:20});
 assert.equal(response.status,200);assert.equal(response.body.rows.length,2);assert.equal(response.body.coverage.completeMarket,false);
 assert.equal(response.body.breadth.return1d.eligible,2);assert.equal(response.body.comparison.status,'available');
 assert.equal(response.body.comparison.series.length,2);assert.equal(response.body.comparison.series[0].points.length,21);
 assert.equal(response.body.comparison.series[0].points[0].index,100);
 assert.equal((await h.request('atlas','POST',{symbols:['AAPL'],comparisonSymbols:['MSFT']})).status,400);
 assert.equal((await h.request('atlas','POST',{symbols:['AAPL'],windowSessions:1})).status,400);
});

test('saved screen creates a disabled immutable monitor and manual run persists deduplicated alerts',async t=>{
 const h=await harness(t),created=await createMonitor(h),id=created.monitor.id;
 assert.equal(created.monitor.enabled,false);assert.equal(created.monitor.nextRunAt,null);
 assert.equal(created.monitor.screenRevision,1);
 let response=await h.request('monitors/'+id+'/run','POST',{});assert.equal(response.body.action,'completed');
 assert.equal(response.body.monitor.lastRun.summary.triggered,1);assert.equal(response.body.monitor.lastRun.summary.alertsCreated,1);
 let alerts=(await h.request('alerts')).body.alerts;assert.equal(alerts.length,1);assert.equal(alerts[0].category,'Scheduled research');
 await h.request('screens','POST',{screen:{...created.screen,conditions:[{metricId:'price.close',operator:'gt',value:999}]},expectedRevision:1});
 response=await h.request('monitors/'+id+'/run','POST',{});assert.equal(response.body.monitor.lastRun.summary.triggered,1);assert.equal(response.body.monitor.lastRun.summary.suppressed,1);
 assert.equal((await h.request('monitors/'+id,'PATCH',{expectedRevision:1,enabled:true})).body.enabled,true);
 assert.equal((await h.request('monitors/'+id,'PATCH',{expectedRevision:1,enabled:false})).status,409);
 response=await h.request('monitors');assert.equal(response.body.health.enabledCount,1);assert.equal(response.body.monitors[0].rule.conditions[0].value,100);
 const disk=await readFile(h.monitorFilename,'utf8');assert(!disk.includes('"bars"'));assert(!disk.includes('APCA_API'));
 assert.equal((await h.request('monitors/'+id,'DELETE',{expectedRevision:2})).status,200);
});

test('one monitor scan runs at a time and disabling a pending scan prevents late alert writes',async t=>{
 let unblock,started;const gate=new Promise(resolve=>{unblock=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const sources=researchSourcesFixture();
 const h=await harness(t,{sources:{...sources,async researchBars(symbol){started();await gate;return sources.researchBars(symbol);}}});
 const {monitor}=await createMonitor(h,true),path='monitors/'+monitor.id;
 const pending=h.request(path+'/run','POST',{});await entered;
 const busy=await h.request(path+'/run','POST',{});assert.equal(busy.body.action,'busy');
 assert.equal((await h.request(path,'PATCH',{expectedRevision:1,enabled:false})).status,200);
 unblock();assert.equal((await pending).body.action,'cancelled');
 assert.equal((await h.request('alerts')).body.alerts.length,0);
});

test('monitor writes validate source screen, interval, revision, symbols and same-origin policy',async t=>{
 const h=await harness(t),created=await createMonitor(h);
 assert.equal((await h.request('monitors','POST',{screenId:'SCREEN-missing'})).status,404);
 assert.equal((await h.request('monitors','POST',{screenId:created.screen.id,intervalMinutes:1})).status,400);
 assert.equal((await h.request('monitors','POST',{screenId:created.screen.id,symbols:['EVIL']})).status,400);
 assert.equal((await h.request('monitors','POST',{screenId:created.screen.id},{Origin:'https://external.example'})).status,403);
 assert.equal((await h.request('monitors/'+created.monitor.id,'PATCH',{expectedRevision:1,rule:screen})).status,400);
});

test('optional Java snapshot synchronization is explicit, sanitized and never fetches provider data while disabled',async t=>{
 const sources=researchSourcesFixture();let reads=0,writes=0;
 const disabled=await harness(t,{sources:{...sources,async researchBars(symbol){reads++;return sources.researchBars(symbol);}},javaAdapter:{async health(){return {configured:false,status:'disabled',storage:'postgresql'};},async syncSnapshot(){writes++;}}});
 assert.equal((await disabled.request('backend')).body.status,'disabled');assert.equal((await disabled.request('backend/sync','POST',{symbol:'MSFT'})).status,503);
 assert.equal(reads,0);assert.equal(writes,0);
 const enabled=await harness(t,{javaAdapter:{async health(){return {configured:true,status:'available',storage:'postgresql'};},async syncSnapshot(record){writes++;assert.equal(record.symbol,'MSFT');assert.equal(record.instrument.instrumentId,'US_EQUITY:MSFT');assert.equal(record.observations.length,65);return {saved:true,observationCount:65};}}});
 assert.equal((await enabled.request('backend/sync','POST',{symbol:'MSFT'})).body.saved,true);assert.equal(writes,1);
 const failed=await harness(t,{javaAdapter:{async health(){throw Error('PRIVATE_TOKEN_FIXTURE');}}});
 const result=await failed.request('backend');assert.equal(result.body.status,'unavailable');assert(!JSON.stringify(result.body).includes('PRIVATE_TOKEN'));
});
