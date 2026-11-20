import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAlpacaEvent,marketEventIdentity,validEventTimestamp} from '../lib/market-events.mjs';

const context = {
  symbols:['AAPL','SPY'],
  receivedAt:'2026-11-12T15:01:00.101Z',
  ingestedAt:'2026-11-12T15:01:00.102Z'
};
const trade = {T:'t',S:'AAPL',i:19,x:'V',p:255.01,s:123,c:['@','I'],z:'C',t:'2026-11-12T15:01:00.123456789Z'};
const quote = {T:'q',S:'AAPL',bp:255.00,ap:255.02,bs:10,as:20,bx:'V',ax:'V',c:['R'],t:trade.t};
const bar = {T:'b',S:'SPY',o:600,h:602,l:599,c:601,v:1200,n:72,vw:600.5,t:'2026-11-12T15:00:00Z'};

test('canonical trade preserves nanosecond event time, source fields and independent local clocks',()=>{
  const value = normalizeAlpacaEvent({...trade,key:'not-public',secret:'never-copy-this'},context);
  assert.equal(value.schemaVersion,1);
  assert.equal(value.provider,'alpaca');
  assert.equal(value.feed,'iex');
  assert.equal(value.coverage,'single-venue');
  assert.equal(value.mode,'LIVE');
  assert.equal(value.instrumentId,'US_EQUITY:AAPL');
  assert.equal(value.eventType,'trade');
  assert.equal(value.sourceEventId,'19');
  assert.equal(value.exchange,'V');
  assert.equal(value.exchangeEventTime,trade.t);
  assert.equal(value.receivedAt,context.receivedAt);
  assert.equal(value.ingestedAt,context.ingestedAt);
  assert.deepEqual(value.trade,{price:255.01,size:123,conditions:['@','I'],tape:'C'});
  assert.equal(value.quote,null);
  assert.equal(value.bar,null);
  assert.equal(value.quality.validation,'valid');
  assert(!JSON.stringify(value).includes('never-copy-this'));
  value.trade.conditions.push('T');
  assert.deepEqual(trade.c,['@','I']);
});

test('quotes retain separate bid/ask prices, sizes and venues; bars retain reported OHLCV',()=>{
  const q = normalizeAlpacaEvent(quote,context);
  assert.equal(q.eventType,'quote');
  assert.equal(q.sourceEventId,null);
  assert.equal(q.exchange,null);
  assert.deepEqual(q.quote,{bidPrice:255,askPrice:255.02,bidSize:10,askSize:20,bidExchange:'V',askExchange:'V',conditions:['R'],tape:null});
  assert.equal(q.quality.crossedQuote,false);
  const crossed = normalizeAlpacaEvent({...quote,bp:256},context);
  assert.equal(crossed.quality.crossedQuote,true);
  const b = normalizeAlpacaEvent(bar,context);
  assert.equal(b.eventType,'bar');
  assert.deepEqual(b.bar,{open:600,high:602,low:599,close:601,volume:1200,tradeCount:72,vwap:600.5});
  assert.equal(b.exchange,null);
  assert.equal(b.trade,null);
});

test('missing optional provider values stay null, including event time and venue',()=>{
  const minimal = normalizeAlpacaEvent({T:'t',S:'AAPL',p:12},context);
  assert.deepEqual(minimal.trade,{price:12,size:null,conditions:null,tape:null});
  assert.equal(minimal.exchangeEventTime,null);
  assert.equal(minimal.sourceEventId,null);
  assert.equal(minimal.exchange,null);
  assert.equal(minimal.quality.timestampStatus,'missing');
  for(const field of ['sourceEventId','exchangeEventTime','exchange','trade.size','trade.conditions']) assert(minimal.quality.missingFields.includes(field));
  assert.equal(marketEventIdentity(minimal),null,'equal values without source identity cannot safely be deduplicated');
  const noTime = normalizeAlpacaEvent({...trade,t:null},context);
  assert.equal(noTime.exchangeEventTime,null);
  assert.equal(typeof marketEventIdentity(noTime),'string');
});

test('normalizer rejects unrequested symbols, unknown message types and malformed market values',()=>{
  const bad = [
    null,[],{}, {...trade,T:'success'}, {...trade,S:'MSFT'}, {...trade,S:'aapl'},
    {...trade,S:'<img>'}, {...trade,p:'255'}, {...trade,p:NaN}, {...trade,p:Infinity},
    {...trade,p:0}, {...trade,p:-1}, {...trade,s:-1}, {...trade,s:'123'},
    {...trade,s:Number.MAX_SAFE_INTEGER+1}, {...trade,c:'@'}, {...trade,c:['<script>']},
    {...trade,c:Array(33).fill('@')}, {...trade,x:'<svg>'}, {...trade,z:3},
    {...trade,i:{}}, {...trade,i:Number.MAX_SAFE_INTEGER+1}, {...trade,i:-1},
    {...quote,bp:0}, {...quote,ap:null}, {...quote,bs:-1}, {...quote,ax:'<script>'},
    {...bar,l:603}, {...bar,o:603}, {...bar,c:598}, {...bar,v:-1}, {...bar,vw:0},
    {...bar,n:'72'}
  ];
  for(const value of bad) assert.equal(normalizeAlpacaEvent(value,context),null,JSON.stringify(value));
  assert(normalizeAlpacaEvent(trade,{...context,symbols:new Set(['AAPL'])}));
  assert.equal(normalizeAlpacaEvent(trade),null,'caller must explicitly allowlist instruments');
});

test('RFC3339 validation rejects calendar rollover, ambiguous offsets and malformed local clocks',()=>{
  for(const timestamp of [
    '2026-02-29T15:01:00Z','2026-04-31T15:01:00Z','2026-13-01T15:01:00Z',
    '2026-00-01T15:01:00Z','2026-11-00T15:01:00Z','2026-11-12T24:01:00Z',
    '2026-11-12T15:60:00Z','2026-11-12T15:01:60Z','2026-11-12T15:01:00',
    '2026-11-12','2026-11-12T15:01:00-00:00','2026-11-12T15:01:00+24:00',
    '2026-11-12T15:01:00+05:60','2026-11-12T15:01:00.1234567890Z',123
  ]){
    assert.equal(validEventTimestamp(timestamp),false,String(timestamp));
    assert.equal(normalizeAlpacaEvent({...trade,t:timestamp},context),null,String(timestamp));
  }
  assert(validEventTimestamp('2024-02-29T15:01:00Z'));
  assert.equal(normalizeAlpacaEvent(trade,{...context,receivedAt:'not-a-time'}),null);
  assert.equal(normalizeAlpacaEvent(trade,{...context,ingestedAt:'2026-02-29T15:00:00Z'}),null);
});

test('event times normalize offset to UTC without losing nanoseconds or inventing precision',()=>{
  const precise = normalizeAlpacaEvent({...trade,t:'2026-11-12T10:01:00.123456789-05:00'},context);
  assert.equal(precise.exchangeEventTime,trade.t);
  const seconds = normalizeAlpacaEvent({...trade,t:'2026-11-12T10:01:00-05:00'},context);
  assert.equal(seconds.exchangeEventTime,'2026-11-12T15:01:00Z');
  const priorDay = normalizeAlpacaEvent({...trade,t:'2026-11-12T00:01:00.1+01:00'},context);
  assert.equal(priorDay.exchangeEventTime,'2026-11-11T23:01:00.1Z');
  assert.equal(marketEventIdentity(normalizeAlpacaEvent({...trade,t:'2026-11-12T15:01:00.100Z'},context)),marketEventIdentity(normalizeAlpacaEvent({...trade,t:'2026-11-12T15:01:00.1Z'},context)));
});

test('source identifiers preserve exact large strings and reject rounded numeric identifiers',()=>{
  const large = '18446744073709551615';
  assert.equal(normalizeAlpacaEvent({...trade,i:large},context).sourceEventId,large);
  assert.equal(normalizeAlpacaEvent({...trade,i:18446744073709551615},context),null);
  assert.equal(normalizeAlpacaEvent({...trade,i:0},context).sourceEventId,'0');
});

test('deduplication identity ignores ingestion but preserves distinct same-time observations',()=>{
  const identity = value => marketEventIdentity(normalizeAlpacaEvent(value,context));
  const original = identity(trade);
  const repeat = normalizeAlpacaEvent(trade,{...context,receivedAt:'2026-11-12T15:02:00Z',ingestedAt:'2026-11-12T15:02:01Z'});
  assert.equal(marketEventIdentity(repeat),original);
  for(const changed of [{...trade,i:20},{...trade,x:'Q'},{...trade,p:255.02},{...trade,s:124},{...trade,c:['@','T']},{...trade,t:'2026-11-12T15:01:00.123456788Z'}]) assert.notEqual(identity(changed),original);
  const quoteIdentity = identity(quote);
  for(const changed of [{...quote,bp:254.99},{...quote,ap:255.03},{...quote,bs:11},{...quote,as:21},{...quote,bx:'Q'},{...quote,c:['Y']}]) assert.notEqual(identity(changed),quoteIdentity);
  assert.notEqual(identity({...bar,c:600.8}),identity(bar),'updated bar values are distinct observations');
});
