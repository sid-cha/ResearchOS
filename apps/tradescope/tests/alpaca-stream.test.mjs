import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketStream} from '../lib/alpaca-stream.mjs';

class Clock {
  time = Date.parse('2026-11-12T15:00:00.000Z');
  nextId = 1;
  timers = new Map();
  set = (fn, delay) => {
    const id = this.nextId++;
    this.timers.set(id, {fn, at:this.time + delay});
    return id;
  };
  clear = id => this.timers.delete(id);
  tick(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([,task]) => task.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.time = next[1].at;
      next[1].fn();
    }
    this.time = end;
  }
}

function harness(options = {}) {
  const clock = new Clock();
  const sockets = [];
  class Socket extends EventTarget {
    readyState = 0;
    sent = [];
    constructor(url) { super(); this.url = url; sockets.push(this); }
    open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
    message(data) { this.dispatchEvent(new MessageEvent('message', {data:typeof data === 'string' ? data : JSON.stringify(data)})); }
    send(data) { if (this.readyState !== 1) throw Error('Socket closed'); this.sent.push(JSON.parse(data)); }
    close(code = 1000, reason = '') {
      this.readyState = 3;
      const event = new Event('close'); Object.assign(event, {code,reason}); this.dispatchEvent(event);
    }
    fail() { this.dispatchEvent(new Event('error')); }
  }
  const stream = createMarketStream({key:'private-key',secret:'private-secret',symbols:['AAPL'],
    WebSocketImpl:Socket, now:() => clock.time, random:() => 0,
    setTimeoutFn:clock.set, clearTimeoutFn:clock.clear, ...options});
  const observations = [], health = [];
  stream.on('observation', event => observations.push(event));
  stream.on('health', event => health.push(event));
  return {clock,sockets,stream,observations,health};
}
function subscribe(socket) {
  socket.open();
  socket.message([{T:'success',msg:'connected'}]);
  socket.message([{T:'success',msg:'authenticated'}]);
  socket.message([{T:'subscription',trades:['AAPL'],quotes:['AAPL'],bars:['AAPL']}]);
}
const trade = {T:'t',S:'AAPL',i:1,p:255,s:100,x:'V',c:['@'],t:'2026-11-12T14:59:59.123456789Z'};
const quote = {T:'q',S:'AAPL',bp:254.99,ap:255.01,bs:20,as:30,bx:'V',ax:'V',t:trade.t};

test('one server-owned connection authenticates and validates subscriptions before emitting data', () => {
  const h = harness(); h.stream.start(); h.stream.start();
  assert.equal(h.sockets.length,1);
  const socket = h.sockets[0];
  assert.equal(socket.url,'wss://stream.data.alpaca.markets/v2/iex');
  socket.open(); assert.deepEqual(socket.sent,[],'TCP/WebSocket open does not authenticate before provider greeting');
  socket.message([trade]); assert.equal(h.observations.length,0);
  socket.message([{T:'success',msg:'connected'}]);
  assert.deepEqual(socket.sent[0],{action:'auth',key:'private-key',secret:'private-secret'});
  assert.equal(h.stream.getHealth().status,'authenticating');
  socket.message([{T:'success',msg:'authenticated'},trade]);
  assert.deepEqual(socket.sent[1],{action:'subscribe',trades:['AAPL'],quotes:['AAPL'],bars:['AAPL']});
  assert.equal(h.stream.getHealth().status,'subscribing');
  assert.equal(h.observations.length,0);
  socket.message([{T:'subscription',trades:['AAPL'],quotes:['AAPL'],bars:['AAPL']},trade,quote]);
  assert.equal(h.stream.getHealth().status,'streaming');
  assert.equal(h.observations.length,2);
  assert.equal(h.observations[0].exchangeEventTime,trade.t);
  assert.equal(h.observations[0].receivedAt,'2026-11-12T15:00:00.000Z');
  assert.equal(h.observations[0].ingestedAt,'2026-11-12T15:00:00.000Z');
  const publicData = JSON.stringify([h.health,h.observations,h.stream.getHealth()]);
  assert(!publicData.includes('private-key')); assert(!publicData.includes('private-secret'));
  h.stream.stop(); assert.equal(h.clock.timers.size,0);
});

test('dedupe preserves changed same-time quotes and nanosecond ordering across reconnects', () => {
  const h = harness(); h.stream.start(); subscribe(h.sockets[0]);
  h.sockets[0].message([trade,trade,quote,{...quote,bs:21},
    {...trade,i:2,t:'2026-11-12T14:59:59.123456788Z'}]);
  assert.equal(h.observations.length,4);
  assert.equal(h.stream.getHealth().observationsReceived,5);
  assert.equal(h.stream.getHealth().duplicatesDiscarded,1);
  assert.equal(h.observations.at(-1).quality.outOfOrder,true);
  assert.equal(h.stream.getHealth().lastExchangeEventTime,trade.t);
  assert.equal(h.stream.getHealth().outOfOrderObservations,1);
  h.sockets[0].close(1006,'this reason could contain private-secret');
  h.clock.tick(500); subscribe(h.sockets[1]);
  h.sockets[1].message([trade]);
  assert.equal(h.observations.length,4,'duplicate identity survives transport reconnect');
  assert.equal(h.stream.getHealth().duplicatesDiscarded,2);
  assert(!JSON.stringify(h.health).includes('private-secret'));
  h.stream.stop();
});

test('identity cache stays bounded and unidentified equal observations are retained', () => {
  const h = harness({dedupeLimit:2}); h.stream.start(); subscribe(h.sockets[0]);
  h.sockets[0].message([trade,{...trade,i:2},{...trade,i:3},trade,trade,
    {T:'t',S:'AAPL',p:255},{T:'t',S:'AAPL',p:255}]);
  assert.equal(h.observations.length,6);
  assert.equal(h.stream.getHealth().duplicatesDiscarded,1);
  assert.equal(h.observations.at(-1).sourceEventId,null);
  assert.equal(h.observations.at(-1).exchangeEventTime,null);
  h.stream.stop();
});

test('numeric provider identifiers beyond JS integer precision remain exact', () => {
  const h = harness(); h.stream.start(); subscribe(h.sockets[0]);
  h.sockets[0].message('[{"T":"t","S":"AAPL","i":18446744073709551615,"p":255,"s":100,"x":"V","t":"2026-11-12T14:59:59Z"}]');
  assert.equal(h.observations.length,1);
  assert.equal(h.observations[0].sourceEventId,'18446744073709551615');
  h.stream.stop();
});

test('malformed payloads and symbols are rejected; oversized frames trigger bounded reconnection', () => {
  const h = harness(); h.stream.start(); subscribe(h.sockets[0]);
  for (const data of ['bad-json','{}',[null],[{...trade,p:-1}],[{...trade,S:'MSFT'}],[{...trade,t:'2026-02-29T15:00:00Z'}]]) h.sockets[0].message(data);
  assert.equal(h.observations.length,0);
  assert.equal(h.stream.getHealth().malformedMessages,6);
  h.sockets[0].message('x'.repeat(1024*1024+1));
  assert.equal(h.stream.getHealth().status,'reconnecting');
  assert.equal(h.stream.getHealth().malformedMessages,7);
  h.stream.stop();
});

test('missing credentials or WebSocket support does not create a provider connection', () => {
  for (const options of [{key:null,secret:null},{key:'',secret:'private-secret'},{WebSocketImpl:null}]) {
    const h = harness(options); h.stream.start();
    assert.equal(h.sockets.length,0); assert.equal(h.stream.getHealth().status,'unavailable');
    assert.equal(h.clock.timers.size,0); h.stream.stop();
  }
});

test('authentication, entitlement, subscription and connection limits terminate without leaking provider text', () => {
  for (const code of [400,401,402,403,405,406,408,409,410]) {
    const h = harness(); h.stream.start(); h.sockets[0].open();
    h.sockets[0].message([{T:'error',code,msg:'provider echoed private-secret'}]);
    assert.equal(h.stream.getHealth().status,'unavailable',String(code));
    assert(!JSON.stringify(h.health).includes('private-secret'));
    h.clock.tick(100000); assert.equal(h.sockets.length,1);
    h.stream.stop();
  }
  for (const ack of [
    {trades:['AAPL'],quotes:[],bars:['AAPL']},
    {trades:['AAPL'],quotes:['AAPL'],bars:['MSFT']},
    {trades:['AAPL','MSFT'],quotes:['AAPL'],bars:['AAPL']},
  ]) {
    const h = harness(); h.stream.start(); const socket=h.sockets[0];
    socket.open(); socket.message([{T:'success',msg:'connected'},{T:'success',msg:'authenticated'},{T:'subscription',...ack},trade]);
    assert.equal(h.stream.getHealth().status,'unavailable');
    assert.equal(h.observations.length,0); assert.equal(h.clock.timers.size,0);
    h.stream.stop();
  }
});

test('transient failures use capped exponential jitter and stop after the retry budget', () => {
  const h = harness({maxRetries:2}); h.stream.start();
  h.sockets[0].fail();
  assert.equal(h.stream.getHealth().nextRetryAt,'2026-11-12T15:00:00.500Z');
  h.clock.tick(499); assert.equal(h.sockets.length,1);
  h.clock.tick(1); assert.equal(h.sockets.length,2);
  h.sockets[1].close(1006);
  assert.equal(h.stream.getHealth().nextRetryAt,'2026-11-12T15:00:01.500Z');
  h.clock.tick(1000); h.sockets[2].open();
  h.sockets[2].message([{T:'error',code:500,msg:'raw private-secret'}]);
  assert.equal(h.stream.getHealth().status,'unavailable');
  assert.equal(h.stream.getHealth().reconnectionAttempts,2);
  assert.equal(h.clock.timers.size,0);
  h.clock.tick(60000); assert.equal(h.sockets.length,3);
  h.stream.stop(); h.stream.start(); assert.equal(h.sockets.length,4);
  h.stream.stop();
});

test('connection, authentication and subscription handshakes each have deadlines', () => {
  for (const setup of [
    () => {},
    socket => {socket.open(); socket.message([{T:'success',msg:'connected'}]);},
    socket => {socket.open(); socket.message([{T:'success',msg:'connected'},{T:'success',msg:'authenticated'}]);},
  ]) {
    const h = harness(); h.stream.start(); setup(h.sockets[0]);
    h.clock.tick(10000); assert.equal(h.stream.getHealth().status,'reconnecting');
    h.stream.stop(); assert.equal(h.clock.timers.size,0);
  }
});

test('flapping subscriptions do not reset the retry budget before a stable connection', () => {
  const h = harness(); h.stream.start(); h.sockets[0].fail(); h.clock.tick(500);
  subscribe(h.sockets[1]); assert.equal(h.stream.getHealth().retryAttempt,1);
  h.clock.tick(59000); assert.equal(h.stream.getHealth().retryAttempt,1);
  h.clock.tick(1000); assert.equal(h.stream.getHealth().retryAttempt,0);
  assert.equal(h.stream.getHealth().reconnectionAttempts,1);
  h.stream.stop();
});

test('idle transport checks keep observation freshness separate from closed-market uncertainty', () => {
  const h = harness(); h.stream.start(); subscribe(h.sockets[0]); h.sockets[0].message([trade]);
  h.clock.tick(60000);
  const health = h.stream.getHealth();
  assert.equal(health.status,'streaming'); assert.equal(health.freshness.ageSeconds,60);
  assert.equal(health.freshness.sessionAssessment,'unknown');
  assert.match(health.freshness.note,/closed or quiet/);
  h.clock.tick(60000); assert.equal(h.stream.getHealth().status,'reconnecting');
  assert.match(h.stream.getHealth().message,/Quiet or closed markets remain possible/);
  assert.equal(h.stream.getHealth().gaps.status,'unknown');
  h.stream.stop(); assert.equal(h.clock.timers.size,0);
  const count = h.health.length;
  h.sockets[0].message([trade]); h.sockets[0].fail(); h.clock.tick(1000000);
  assert.equal(h.health.length,count); assert.equal(h.sockets.length,1);
});

test('bounds and allowlist configuration reject unbounded or unsafe inputs', () => {
  for (const options of [{symbols:[]},{symbols:['AAPL','AAPL']},{symbols:['<img>']},{maxRetries:Infinity},{dedupeLimit:0},{connectTimeoutMs:0}]) {
    assert.throws(() => createMarketStream(options),TypeError);
  }
});
