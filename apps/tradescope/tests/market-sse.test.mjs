import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {createMarketDelivery} from '../lib/market-sse.mjs';

class MockStream extends EventEmitter {
  starts = 0; stops = 0;
  start() { this.starts++; }
  stop() { this.stops++; }
  getHealth() { return {provider:'alpaca',feed:'iex',coverage:'single-venue',status:'streaming',observationsReceived:0}; }
}
function fakeResponse() {
  const res = new EventEmitter();
  Object.assign(res,{writableLength:0,frames:[],destroyed:false,writableEnded:false,
    writeHead(status,headers){this.status=status;this.headers=headers;},flushHeaders(){},
    write(frame){this.frames.push(frame);return true;},
    end(body){if(body)this.frames.push(body);this.writableEnded=true;this.emit('close');},
    destroy(){this.destroyed=true;this.emit('close');}});
  return res;
}
const request = (headers={}) => ({method:'GET',headers:{host:'127.0.0.1:8000',...headers}});
const url = new URL('http://127.0.0.1:8000/api/stream');

test('one shared provider, bounded clients, JSON framing, heartbeat and disconnect cleanup',()=>{
  const stream=new MockStream();let tick;let cleared=0;
  const delivery=createMarketDelivery({stream,maxClients:2,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>cleared++});
  const a=fakeResponse(),b=fakeResponse(),c=fakeResponse();
  assert.equal(delivery.handle(request(),a,url),true);
  delivery.handle(request(),b,url);delivery.handle(request(),c,url);
  assert.equal(stream.starts,1);assert.equal(c.status,503);assert.equal(delivery.getClientCount(),2);
  const event={symbol:'AAPL',sourceEventId:'id\nwith newline',trade:{price:251}};
  stream.emit('observation',event);
  const frame=a.frames.find(x=>x.startsWith('event: observation'));
  assert.deepEqual(JSON.parse(frame.split('\ndata: ')[1]),event);
  assert.equal(frame.split('\n').length,4); // JSON escapes source newlines.
  tick();assert(a.frames.includes(': heartbeat\n\n'));
  a.emit('close');assert.equal(stream.stops,0);
  b.emit('error',new Error('browser disconnected'));assert.equal(stream.stops,1);
  assert.equal(cleared,1);assert.equal(delivery.getClientCount(),0);
  delivery.close();assert.equal(stream.listenerCount('observation'),0);
});

test('slow browser is disconnected at the byte bound instead of accumulating ticks',()=>{
  const stream=new MockStream();const delivery=createMarketDelivery({stream,maxBufferedBytes:1024});
  const res=fakeResponse();delivery.handle(request(),res,url);res.writableLength=1000;
  stream.emit('observation',{symbol:'AAPL',trade:{price:251}});
  assert.equal(res.destroyed,true);assert.equal(delivery.getClientCount(),0);assert.equal(stream.stops,1);
  delivery.close();
});

test('SSE rejects cross-origin access and non-GET; shutdown ends clients',()=>{
  const stream=new MockStream();const delivery=createMarketDelivery({stream});
  for(const headers of [{origin:'https://external.example'},{'sec-fetch-site':'cross-site'},{origin:'invalid'}]){
    const res=fakeResponse();delivery.handle(request(headers),res,url);assert.equal(res.status,403);
  }
  const post=fakeResponse();delivery.handle({...request(),method:'POST'},post,url);assert.equal(post.status,405);
  const same=fakeResponse();delivery.handle(request({origin:'http://127.0.0.1:8000'}),same,url);assert.equal(same.status,200);
  delivery.close();assert.equal(same.writableEnded,true);
  const late=fakeResponse();delivery.handle(request(),late,url);assert.equal(late.status,503);
});

test('real HTTP SSE headers and observation delivery survive browser cancellation',async t=>{
  const stream=new MockStream();const delivery=createMarketDelivery({stream});
  const server=http.createServer((req,res)=>delivery.handle(req,res,new URL(req.url,'http://localhost')));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{delivery.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
  const ctrl=new AbortController();
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/stream`,{signal:ctrl.signal});
  assert.match(response.headers.get('content-type'),/^text\/event-stream/);
  assert.equal(response.headers.get('x-accel-buffering'),'no');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);assert.match(first,/event: health/);assert.match(first,/single-venue/);
  stream.emit('observation',{symbol:'AAPL',eventType:'trade',trade:{price:255}});
  const next=decoder.decode((await reader.read()).value);assert.match(next,/event: observation/);assert.match(next,/255/);
  ctrl.abort();
  // A new request acts as a round trip while the server receives the abort.
  await new Promise(resolve=>server.getConnections((_,n)=>resolve(n)));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(delivery.getClientCount(),0);assert.equal(stream.stops,1);
});
