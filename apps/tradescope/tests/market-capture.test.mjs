import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createMarketCapture,createMarketCaptureApi,captureObservation} from '../lib/market-capture.mjs';
import {createMarketDelivery} from '../lib/market-sse.mjs';
const timestamp='2026-11-12T15:00:00.123456789Z';
class Stream extends EventEmitter {
 configured=true;starts=0;stops=0;status='idle';
 getHealth(){return {configured:this.configured,status:this.status,symbols:['AAPL'],
  gaps:{interruptions:0},provider:'alpaca',feed:'iex'};}
 start(){this.starts++;this.status='streaming';this.emit('health',this.getHealth());}
 stop(){this.stops++;this.status='stopped';this.emit('health',this.getHealth());}
}
const observation=(size=5)=>({schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',
 mode:'LIVE',instrumentId:'US_EQUITY:AAPL',symbol:'AAPL',eventType:'trade',sourceEventId:'test',
 exchange:'V',exchangeEventTime:timestamp,receivedAt:timestamp,ingestedAt:timestamp,
 trade:{price:125,size,conditions:['@'],tape:'C'},quality:{outOfOrder:false,missingFields:[]}});
async function make(t,opts={}){
 const dir=await mkdtemp(path.join(tmpdir(),'market-capture-fixture-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const stream=new Stream(),capture=createMarketCapture({stream,dir,enabled:true,
  rightsAcknowledged:true,now:()=>timestamp,maxRows:100,...opts});
 return {dir,stream,capture};
}
test('no capture without explicit enablement and rights acknowledgement',async t=>{
 const {dir,stream}=await make(t);
 for(const cfg of [{enabled:false,rightsAcknowledged:true},{enabled:true,rightsAcknowledged:false}]){
  const c=createMarketCapture({stream,dir,...cfg});
  assert.equal(c.state().enabled,false);
  await assert.rejects(c.start(),{status:403});
  await assert.rejects(c.sessions(),{status:403});
 }
 stream.configured=false;await assert.rejects(createMarketCapture({stream,dir,enabled:true,rightsAcknowledged:true}).start(),{status:503});
});
test('captures only normalized IEX data; verifies and replays repeatable VOL-01 outcomes',async t=>{
 const {stream,capture}=await make(t);
 const started=await capture.start();assert.equal(started.active.observations,0);
 for(let i=0;i<20;i++)stream.emit('observation',observation(5));
 stream.emit('observation',observation(40));
 stream.emit('observation',{...observation(),provider:'synthetic',secret:'must never appear'});
 stream.status='reconnecting';stream.emit('health',stream.getHealth());
 const stopped=await capture.stop();
 assert.equal(stopped.active,null);
 assert.equal(stream.starts,1);
 const [saved]=await capture.sessions();
 assert.equal(saved.observations,21);assert.equal(saved.interruptions,1);
 const data=await capture.readSession(saved.id);assert.equal(data.status,'COMPLETE');assert.equal(data.verified,true);
 assert.equal(data.count,21);
 const a=await capture.replay(saved.id,{limit:100});
 const b=await capture.replay(saved.id,{limit:100});
 assert.deepEqual(a,b);assert.equal(a.observations.at(-1).evaluation.status,'evaluated');
 assert.equal(a.observations.at(-1).evaluation.severity,'high');
 assert.equal(a.observations.at(-1).evaluation.ratio,8);
 assert(!JSON.stringify(a).includes('must never appear'));
 assert.equal(a.gaps,'unknown');
 const first=await capture.replay(saved.id,{offset:0,limit:10});
 assert.equal(first.nextOffset,10);assert.equal(first.observations.length,10);
 const second=await capture.replay(saved.id,{offset:10,limit:10});
 assert.equal(second.observations.length,10);
});
test('tampering, truncation and invalid IDs are rejected before any replay',async t=>{
 const {dir,stream,capture}=await make(t);
 const id=(await capture.start()).active.id;
 stream.emit('observation',observation(5));await capture.stop();
 const file=path.join(dir,id+'.jsonl');
 const raw=await readFile(file,'utf8');await writeFile(file,raw.replace('"price":125','"price":999'));
 await assert.rejects(capture.replay(id),{status:422});
 assert.equal((await capture.sessions())[0].status,'CORRUPT_OR_UNREADABLE');
 await writeFile(file,raw.slice(0,-1));
 await assert.rejects(capture.readSession(id),{status:422});
 await assert.rejects(capture.readSession('../../.env'),{status:400});
});
test('bounded capture count automatically seals the journal and disallows new writes after capacity',async t=>{
 const {stream,capture}=await make(t,{maxRows:2,maxSessions:1});
 const id=(await capture.start()).active.id;
 stream.emit('observation',observation(5));stream.emit('observation',observation(6));
 await new Promise(setImmediate);
 const data=await capture.readSession(id);
 assert.equal(data.status,'COMPLETE');assert.equal(data.count,2);
 await assert.rejects(capture.start(),{status:409});
});
test('server-side API refuses cross-origin and unauthenticated mutation intent',async t=>{
 const {stream,capture}=await make(t);
 const handle=createMarketCaptureApi({service:capture});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await capture.close();await new Promise(resolve=>server.close(resolve));});
 const url='http://127.0.0.1:'+server.address().port+'/api/market-capture/';
 let response=await fetch(url+'catalog');assert.equal(response.status,200);
 response=await fetch(url+'start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(response.status,403);
 response=await fetch(url+'start',{method:'POST',headers:{'Content-Type':'application/json',
  'X-TradeScope-Local-Capture':'1','Origin':'https://foreign.invalid'},body:'{}'});
 assert.equal(response.status,403);
 const headers={'Content-Type':'application/json','X-TradeScope-Local-Capture':'1'};
 response=await fetch(url+'start',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);
 const started=await response.json();assert(started.active.id);
 stream.emit('observation',observation(11));
 response=await fetch(url+'stop',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);
 response=await fetch(url+'replay?id='+started.active.id);assert.equal(response.status,200);
 const replay=await response.json();assert.equal(replay.total,1);assert.equal(replay.verified,true);
 response=await fetch(url+'replay?id='+started.active.id+'&limit=300');assert.equal(response.status,400);
 response=await fetch(url+'session?id=../.env');assert.equal(response.status,400);
});
test('live SSE disconnect does not stop provider while manual capture is active',()=>{
 const stream=new Stream();let active=true;
 const d=createMarketDelivery({stream,keepAlive:()=>active});
 const fake=new EventEmitter();
 Object.assign(fake,{writableLength:0,destroyed:false,writableEnded:false,writeHead(){},flushHeaders(){},write(){},end(){},destroy(){}});
 d.handle({method:'GET',headers:{host:'127.0.0.1:8000'}},fake,new URL('http://127.0.0.1/api/stream'));
 fake.emit('close');assert.equal(stream.stops,0);
 active=false;d.close();assert(stream.stops>0);
});
test('source normalization excludes unknown provider fields and disallows synthetic rows',()=>{
 const input={...observation(17),apiKey:'do-not-record',providerMetadata:{private:true}};
 const clean=captureObservation(input);
 assert.equal(clean.trade.size,17);assert(!JSON.stringify(clean).includes('apiKey'));
 assert.equal(captureObservation({...input,mode:'SYNTHETIC'}),null);
 assert.equal(captureObservation({...input,provider:'not-alpaca'}),null);
});
