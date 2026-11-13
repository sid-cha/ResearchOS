import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const adapterSource = await readFile(new URL('../live-adapter.js',import.meta.url),'utf8');
const appSource = await readFile(new URL('../app.js',import.meta.url),'utf8');
const baseTime = Date.parse('2026-11-12T20:00:00Z');
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };
const response = body => ({ok:true,status:200,json:async()=>body});
const snapshot = (price=255,time='2026-11-12T19:59:59Z') => ({source:'ALPACA_IEX',fetchedAt:'2026-11-12T20:00:00Z',snapshots:{AAPL:{trade:{symbol:'AAPL',sourceId:'42',time,price,quantity:20,venue:'V'},previousClose:250}}});
const health = overrides => ({provider:'alpaca',feed:'iex',coverage:'single-venue',status:'streaming',observationsReceived:0,duplicatesDiscarded:0,reconnectionAttempts:0,...overrides});
const observation = overrides => ({schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',mode:'LIVE',symbol:'AAPL',instrumentId:'US_EQUITY:AAPL',eventType:'trade',sourceEventId:'73',exchange:'V',exchangeEventTime:'2026-11-12T20:00:00.123456789Z',receivedAt:'2026-11-12T20:00:00.125Z',ingestedAt:'2026-11-12T20:00:00.126Z',trade:{price:256,size:50,conditions:['@']},quote:null,bar:null,quality:{validation:'valid'},...overrides});

function harness({fetchImpl=async()=>response(snapshot()),withApp=false}={}) {
  let clock=baseTime, timerId=0;
  const timers=new Map(), elements=new Map(), selectors=new Map(), calls=[], requests=[], streams=[];
  class Element {
    constructor(){this.listeners=new Map();this.textContent='';this.innerHTML='';this.value='';this.hidden=false;this.className='';this.dataset={};this.classes=new Set();this.classList={toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name);}};}
    addEventListener(name,handler){this.listeners.set(name,handler);}
    click(){return this.listeners.get('click')?.({target:this});}
    appendChild(){}
    querySelectorAll(){return [];}
    querySelector(){return new Element();}
    scrollIntoView(){}
    focus(){}
  }
  const getElement = id => {if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const navigation=['monitor','blotter','signals','replay','intel','cases'].map(name=>{const button=getElement('nav'+name[0].toUpperCase()+name.slice(1));button.dataset.nav=name;return button;});
  const document={getElementById:getElement,createElement:()=>new Element(),querySelectorAll:selector=>selector==='.nav-link'?navigation:[],querySelector:selector=>{if(!selectors.has(selector))selectors.set(selector,new Element());return selectors.get(selector);}};
  getElement('historySymbol').value='AAPL';getElement('historyFeed').value='sip';
  class EventSource {
    constructor(url){this.url=url;this.handlers=new Map();this.closed=false;streams.push(this);}
    addEventListener(name,handler){this.handlers.set(name,handler);}
    emit(name,data){this.handlers.get(name)?.({data:JSON.stringify(data)});}
    close(){this.closed=true;}
  }
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const registerTimer=(fn,delay,repeat)=>{const id=++timerId;timers.set(id,{fn,at:clock+delay,delay,repeat});return id;};
  const window={TradeScope:{setDataset:(mode,entries,prices,meta)=>calls.push({mode,entries,prices,meta})},addEventListener(){},scrollTo(){},innerWidth:1440};
  const context=vm.createContext({document,window,EventSource,AbortController,Date:ClockDate,console,
    setTimeout:(fn,delay)=>registerTimer(fn,delay,false),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>registerTimer(fn,delay,true),clearInterval:id=>timers.delete(id),
    fetch:(url,options)=>{requests.push({url,options});return fetchImpl(url,options);}});
  if(withApp) vm.runInContext(appSource,context,{filename:'app.js'});
  vm.runInContext(adapterSource,context,{filename:'live-adapter.js'});
  async function advance(milliseconds){
    const target=clock+milliseconds;
    while(true){const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,timer]=next;clock=timer.at;if(timer.repeat)timer.at+=timer.delay;else timers.delete(id);timer.fn();await flush();}
    clock=target;await flush();
  }
  return {element:getElement,selector:selector=>document.querySelector(selector),streams,requests,calls,advance,window,
    click:async id=>{getElement(id).click();await flush();},latest:()=>calls.at(-1)};
}

const observedRows=(count,symbol='AAPL')=>Array.from({length:count},(_,index)=>({
  id:`observed-${index}`,eventTime:'2026-11-12T19:59:59Z',time:'14:59:59',symbol,
  type:'TRADE',price:255,quantity:20,venue:'V',source:'ALPACA_IEX',sequence:index,
  score:0,severity:'low',findings:[],volumeRatio:0,spreadRatio:0,cancelRatio:0,priceMove:0
}));

test('the Monitor flag shortcut filters observations and returning to MONITOR or BLOTTER restores unflagged rows',async()=>{
  const h=harness({withApp:true});
  h.window.TradeScope.setDataset('LIVE',observedRows(17),{AAPL:{price:255,change:0}},{transport:'polling',feed:'iex'});
  assert.equal(h.element('rowCount').textContent,'17 / 17 EVENTS SHOWN');
  await h.click('filterSignals');
  assert.equal(h.element('rowCount').textContent,'0 / 17 EVENTS SHOWN · FLAGS ONLY');
  assert.match(h.element('blotterBody').innerHTML,/No flagged observations/);
  assert.match(h.element('blotterBody').innerHTML,/ALL EVENTS or MONITOR/);
  await h.click('navMonitor');
  assert.equal(h.element('rowCount').textContent,'17 / 17 EVENTS SHOWN');
  assert(h.element('allEvents').classes.has('active'));
  await h.click('filterSignals');await h.click('navBlotter');
  assert.equal(h.element('rowCount').textContent,'17 / 17 EVENTS SHOWN');
});

test('navigation clears only the inherited flag filter and preserves deliberate symbol, type and search filters',async()=>{
  const h=harness({withApp:true});
  h.window.TradeScope.setDataset('LIVE',[...observedRows(16),{...observedRows(1,'MSFT')[0],id:'msft-1'}],{}, {transport:'polling',feed:'iex'});
  for(const [id,event,value] of [['symbolFilter','change','MSFT'],['eventFilter','change','TRADE'],['search','input','msft']]){
    const element=h.element(id);element.value=value;element.listeners.get(event)({target:element});
  }
  assert.equal(h.element('rowCount').textContent,'1 / 17 EVENTS SHOWN');
  await h.click('filterSignals');await h.click('navMonitor');
  assert.equal(h.element('rowCount').textContent,'1 / 17 EVENTS SHOWN');
  assert.equal(h.element('symbolFilter').value,'MSFT');assert.equal(h.element('eventFilter').value,'TRADE');assert.equal(h.element('search').value,'msft');
  await h.click('filterSignals');await h.click('navBlotter');
  assert.equal(h.element('rowCount').textContent,'1 / 17 EVENTS SHOWN');
  await h.click('clearFilters');assert.equal(h.element('rowCount').textContent,'17 / 17 EVENTS SHOWN');
});

test('signal diagnostics distinguish synthetic, LIVE and historical scope and explain baseline readiness',async()=>{
  const h=harness({withApp:true});
  assert.match(h.selector('.signals-subhead').innerHTML,/SYNTHETIC RULE EXAMPLES/);
  const search=h.element('search');search.value='no-such-event';search.listeners.get('input')({target:search});await h.click('flaggedOnly');
  assert.match(h.element('blotterBody').innerHTML,/synthetic replay/);
  h.window.TradeScope.setDataset('LIVE',observedRows(17),{},{transport:'streaming',feed:'iex'});
  assert.match(h.element('signalRows').innerHTML,/NO FLAGS IN LIVE IEX OBSERVATIONS/);
  assert.doesNotMatch(h.element('signalRows').innerHTML,/REPLAY/);
  assert.match(h.element('signalRows').innerHTML,/0\/10 symbols have 20 observed trades/);
  assert.match(h.element('signalRows').innerHTML,/above 3× the median/);
  assert.match(h.element('signalRows').innerHTML,/zero flags do not establish low risk/);
  assert.match(h.selector('.signals-subhead').innerHTML,/OBSERVED SIZE \/ EXPLORATORY/);
  h.window.TradeScope.setDataset('HISTORY',observedRows(21),{},{transport:'historical',feed:'sip',source:'ALPACA_SIP_HISTORY'});
  assert.match(h.element('signalRows').innerHTML,/NO FLAGS IN SIP HISTORICAL SAMPLE/);
  assert.match(h.element('signalRows').innerHTML,/1\/10 symbols have 20 observed trades/);
  assert.match(h.element('alertStream').innerHTML,/NO RULE ALERTS IN SIP HISTORICAL SAMPLE/);
});

test('returning from LIVE to DEMO selects an already visible synthetic replay event',async()=>{
  const h=harness({withApp:true});await h.click('modeLive');
  h.streams[0].emit('health',health());h.streams[0].emit('observation',observation());
  await h.advance(250);assert.equal(h.window.TradeScope.getSelection().synthetic,false);
  await h.click('modeDemo');
  assert.equal(h.window.TradeScope.getMode(),'DEMO');
  assert.equal(h.window.TradeScope.getSelection().synthetic,true);
  assert.equal(h.element('metricEvents').textContent,'68');
});

test('LIVE uses SSE when subscribed, labels REST fallback, and retains normalized provenance',async()=>{
  const h=harness();
  assert.equal(h.element('feedTransport').textContent,'DEMO · SYNTHETIC');
  await h.click('modeLive');await h.advance(250);
  assert.equal(h.streams.length,1);assert.equal(h.streams[0].url,'/api/stream');
  assert.equal(h.latest().meta.transport,'polling');
  assert.equal(h.latest().entries[0].source,'ALPACA_IEX');
  assert.match(h.element('connectionStatus').textContent,/REST POLLING FALLBACK/);
  h.streams[0].emit('health',health());
  h.streams[0].emit('observation',observation());await h.advance(250);
  assert.equal(h.latest().meta.transport,'streaming');
  assert.equal(h.latest().entries.at(-1).marketData.exchangeEventTime,'2026-11-12T20:00:00.123456789Z');
  assert.equal(h.latest().entries.at(-1).marketData.receivedAt,'2026-11-12T20:00:00.125Z');
  assert.equal(h.element('feedExchangeTime').textContent,'2026-11-12T20:00:00.123456789Z');
  assert.equal(h.element('feedIngestedTime').textContent,'2026-11-12T20:00:00.126Z');
  assert(h.latest().entries.every(row=>row.source!=='SYNTHETIC_FIXTURE_V2'));
  const fetched=h.requests.length;await h.advance(15000);assert.equal(h.requests.length,fetched);
  await h.click('modeDemo');assert.equal(h.streams[0].closed,true);assert.equal(h.latest().mode,'DEMO');
  const calls=h.calls.length;h.streams[0].emit('observation',observation({sourceEventId:'late'}));await h.advance(500);assert.equal(h.calls.length,calls);
});

test('late LIVE and HISTORY responses cannot populate another mode or a later LIVE generation',async()=>{
  const pending=[];
  const h=harness({fetchImpl:()=>{const item=deferred();pending.push(item);return item.promise;}});
  await h.click('modeLive');await h.click('modeDemo');
  assert.equal(h.requests[0].options.signal.aborted,true);
  await h.click('modeLive');assert.equal(h.streams.length,2);
  pending[0].resolve(response(snapshot(111)));await flush();await h.advance(250);
  assert.equal(h.latest().entries.length,0);
  pending[1].resolve(response(snapshot(222)));await flush();await h.advance(250);
  assert.equal(h.latest().entries[0].price,222);
  await h.click('modeHistory');await h.click('loadHistory');await h.click('modeDemo');
  pending[2].resolve(response({feed:'sip',source:'ALPACA_SIP_HISTORY',trades:[{symbol:'AAPL',time:'2026-11-11T15:00:00Z',sourceId:'old-history',price:333,quantity:2}]}));
  await flush();await h.advance(1000);
  assert.equal(h.latest().mode,'DEMO');assert.equal(h.latest().entries.length,0);
});

test('provider failures, browser disconnection and heartbeat timeout enter explicit polling fallback',async()=>{
  const h=harness();await h.click('modeLive');
  const stream=h.streams[0];stream.emit('health',health());await h.advance(250);
  stream.onerror();await flush();await h.advance(250);
  assert.equal(h.latest().meta.transport,'polling');
  assert.match(h.element('feedConnection').textContent,/browser stream disconnected/);
  stream.emit('health',health({status:'unavailable',message:'Check local credentials and restart the server.'}));await h.advance(250);
  assert.equal(h.latest().meta.transport,'polling');assert.match(h.element('feedConnection').textContent,/unavailable/);
  assert.match(h.element('feedConnection').textContent,/Check local credentials/);
  stream.emit('health',health());await h.advance(50000);
  assert.equal(h.latest().meta.transport,'polling');assert.match(h.element('feedConnection').textContent,/heartbeat overdue/);
  assert.equal(h.streams.length,1,'fallback must not create additional EventSource instances');
});

test('wall-clock age describes idle observations without declaring a market outage',async()=>{
  const h=harness();await h.click('modeLive');
  h.streams[0].emit('health',health({lastExchangeEventTime:'2026-11-06T21:00:00Z',lastIngestedAt:'2026-11-12T20:00:00Z',duplicatesDiscarded:7,reconnectionAttempts:2}));
  await h.advance(250);
  assert.match(h.element('feedFreshness').textContent,/wall age · session status unknown/);
  assert.doesNotMatch(h.element('feedFreshness').textContent,/outage|failed|offline/i);
  assert.equal(h.element('feedDuplicates').textContent,'7 discarded / 2 retries');
  assert.equal(h.element('feedIngestedTime').textContent,'2026-11-12T20:00:00Z');
});

test('stream retention and identifiers are bounded; distinct same-time quotes survive',async()=>{
  const h=harness();await h.click('modeLive');h.streams[0].emit('health',health());
  for(let i=0;i<1100;i++)h.streams[0].emit('observation',observation({sourceEventId:String(i)}));
  const quote=observation({exchangeEventTime:'2026-11-12T20:00:01Z',eventType:'quote',sourceEventId:null,trade:null,quote:{bidPrice:255,askPrice:256,bidSize:10,askSize:12,bidExchange:'V',askExchange:'V'}});
  h.streams[0].emit('observation',quote);h.streams[0].emit('observation',{...quote,quote:{...quote.quote,askSize:13}});
  await h.advance(250);
  assert.equal(h.latest().entries.length,1000);assert.equal(h.calls.filter(call=>call.entries.length===1000).length,1,'tick burst should render once');
  assert.equal(h.latest().entries.filter(row=>row.type==='QUOTE').length,2);
});

test('missing source fields stay unknown and ingest time is only a sort fallback',async()=>{
  const h=harness();await h.click('modeLive');h.streams[0].emit('health',health());
  const row=observation({sourceEventId:null,exchange:null,exchangeEventTime:null,trade:{price:256,size:null,conditions:null}});
  h.streams[0].emit('observation',row);h.streams[0].emit('observation',row);await h.advance(250);
  const missing=h.latest().entries.filter(event=>event.eventTime===null);
  assert.equal(missing.length,2,'no source identity means equal messages may be distinct observations');
  assert.equal(missing[0].quantity,null);assert.equal(missing[0].venue,'—');assert.equal(missing[0].time,'—');
  assert.equal(missing[0].marketData.exchangeEventTime,null);
});

test('historical SIP labels and selected event source remain accurate in the complete app',async()=>{
  const h=harness({withApp:true,fetchImpl:async()=>response({feed:'sip',source:'ALPACA_SIP_HISTORY',fetchedAt:'2026-11-12T20:00:00Z',trades:[{symbol:'AAPL',sourceId:'1',time:'2026-11-11T16:00:00Z',price:252,quantity:null,venue:null}]})});
  await h.click('modeHistory');await h.click('loadHistory');await h.advance(250);
  assert.equal(h.selector('.env-badge').textContent,'● SIP / HISTORICAL');
  assert.equal(h.selector('.chart-info small').textContent,'SIP OBSERVED TRADE / USD');
  const selected=h.window.TradeScope.getSelection();assert.equal(selected.source,'ALPACA_SIP_HISTORY');assert.equal(selected.marketData.feed,'sip');assert.equal(selected.marketData.instrumentId,'US_EQUITY:AAPL');assert.equal(selected.quantity,null);
  assert.match(h.element('blotterBody').innerHTML,/class="venue">—/);
  await h.click('modeLive');h.streams[0].emit('health',health());h.streams[0].emit('observation',observation());await h.advance(250);
  assert.equal(h.selector('.env-badge').textContent,'● IEX / STREAM SUBSCRIBED');
  assert.equal(h.window.TradeScope.getSelection().marketData.feed,'iex');
});

test('provider identities are escaped before entering blotter HTML',async()=>{
  const h=harness({withApp:true,fetchImpl:async()=>response({feed:'iex',source:'ALPACA_IEX',trades:[{symbol:'AAPL',sourceId:'\"><img src=x onerror=alert(1)>',time:'2026-11-11T16:00:00Z',price:252,quantity:5,venue:'<svg onload=alert(1)>'}]})});
  h.element('historyFeed').value='iex';await h.click('modeHistory');await h.click('loadHistory');await h.advance(250);
  assert(!h.element('blotterBody').innerHTML.includes('<img'));
  assert(!h.element('blotterBody').innerHTML.includes('<svg'));
  assert(h.element('blotterBody').innerHTML.includes('&lt;svg'));
});


test('overlapping snapshot rows reconcile with streaming observations without dropping source changes',async()=>{
  const time='2026-11-12T19:59:59.1Z';
  const h=harness({fetchImpl:async()=>response(snapshot(255,time))});await h.click('modeLive');await h.advance(250);
  assert.equal(h.latest().entries.length,1);
  h.streams[0].emit('health',health());
  const streamed=observation({sourceEventId:'42',exchangeEventTime:'2026-11-12T19:59:59.100000000Z',trade:{price:255,size:20,conditions:['@']}});
  h.streams[0].emit('observation',streamed);await h.advance(250);
  assert.equal(h.latest().entries.length,1);assert.equal(h.latest().entries[0].transport,'streaming');
  h.streams[0].emit('observation',{...streamed,trade:{...streamed.trade,conditions:['F']}});await h.advance(250);
  assert.equal(h.latest().entries.length,2,'conditions distinguish stream events even at the same time');
  h.streams[0].onerror();await flush();await h.advance(250);
  assert.equal(h.latest().entries.length,2,'later polling must not reintroduce an overlapping streamed trade');

  const quotes=harness({fetchImpl:async()=>response({fetchedAt:time,snapshots:{AAPL:{quote:{symbol:'AAPL',time,bid:255,ask:256,bidSize:2,askSize:3,bidVenue:'V',askVenue:'V'}}}})});
  await quotes.click('modeLive');await quotes.advance(250);
  quotes.streams[0].emit('health',health());
  const quote=observation({eventType:'quote',sourceEventId:null,exchangeEventTime:'2026-11-12T19:59:59.100Z',trade:null,quote:{bidPrice:255,askPrice:256,bidSize:2,askSize:3,bidExchange:'V',askExchange:'V',conditions:['R']}});
  quotes.streams[0].emit('observation',quote);quotes.streams[0].emit('observation',{...quote,quote:{...quote.quote,askSize:4}});await quotes.advance(250);
  assert.equal(quotes.latest().entries.length,2);assert(quotes.latest().entries.every(row=>row.transport==='streaming'));
});


test('nanosecond event order is independent of source fractional formatting',async()=>{
  const h=harness();await h.click('modeLive');h.streams[0].emit('health',health());
  h.streams[0].emit('observation',observation({sourceEventId:'later',exchangeEventTime:'2026-11-12T20:00:00.120000000Z'}));
  h.streams[0].emit('observation',observation({sourceEventId:'earlier',exchangeEventTime:'2026-11-12T20:00:00.1Z'}));await h.advance(250);
  const sourceIds=h.latest().entries.filter(row=>row.transport==='streaming').map(row=>row.marketData.sourceEventId);
  assert.deepEqual(Array.from(sourceIds),['earlier','later']);
});

test('real observations distinguish baseline warmup, evaluated zero and the unchanged size alert',async()=>{
  const h=harness({fetchImpl:async()=>response({snapshots:{}})});await h.click('modeLive');h.streams[0].emit('health',health());
  for(let i=0;i<20;i++)h.streams[0].emit('observation',observation({sourceEventId:'baseline-'+i,exchangeEventTime:new Date(baseTime-30000+i*1000).toISOString(),trade:{price:255,size:100,conditions:['@']}}));
  const normal=observation({sourceEventId:'normal',exchangeEventTime:'2026-11-12T19:59:50Z',trade:{price:255,size:100,conditions:['@']}});
  const large=observation({sourceEventId:'large',exchangeEventTime:'2026-11-12T19:59:51Z',trade:{price:255,size:400,conditions:['@']}});
  h.streams[0].emit('observation',normal);h.streams[0].emit('observation',large);await h.advance(250);
  const rows=h.latest().entries;
  for(const [i,row] of rows.slice(0,20).entries()){
    assert.equal(row.score,null);assert.equal(row.severity,'unassessed');assert.equal(row.volumeRatio,null);assert.equal(row.priceMove,null);
    assert.equal(row.evaluation.status,'warming_up');assert.equal(row.evaluation.baselineCount,i);
  }
  assert.equal(rows[20].evaluation.status,'evaluated');assert.equal(rows[20].evaluation.baselineCount,20);
  assert.equal(rows[20].volumeRatio,1);assert.equal(rows[20].score,0);assert.equal(rows[20].findings.length,0);
  assert.equal(rows[21].volumeRatio,4);assert.equal(rows[21].score,70);assert.equal(rows[21].severity,'medium');
  assert.equal(rows[21].findings[0].code,'VOL-01');assert.equal(rows[21].spreadRatio,null);assert.equal(rows[21].cancelRatio,null);assert.equal(rows[21].priceMove,null);
});

test('quotes and unavailable trade sizes are unassessed rather than fabricated zero-risk measurements',async()=>{
  const h=harness({fetchImpl:async()=>response({snapshots:{}})});await h.click('modeLive');h.streams[0].emit('health',health());
  h.streams[0].emit('observation',observation({eventType:'quote',sourceEventId:null,trade:null,quote:{bidPrice:255,askPrice:256,bidSize:10,askSize:12,bidExchange:'V',askExchange:'V'}}));
  h.streams[0].emit('observation',observation({sourceEventId:'missing-size',exchangeEventTime:'2026-11-12T20:00:01Z',trade:{price:255,size:null,conditions:['@']}}));
  await h.advance(250);
  const rows=h.latest().entries;
  assert.equal(rows[0].evaluation.status,'not_applicable');assert.equal(rows[1].evaluation.status,'missing_data');
  for(const row of rows){assert.equal(row.score,null);assert.equal(row.severity,'unassessed');assert.equal(row.volumeRatio,null);assert.equal(row.priceMove,null);assert.equal(row.findings.length,0);}
});

test('unassessed UI rows have no low-risk assertion, no flags and do not dilute assessed averages',async()=>{
  const h=harness({withApp:true});
  const unknown={...observedRows(1)[0],score:null,severity:'unassessed',volumeRatio:null,spreadRatio:null,cancelRatio:null,priceMove:null,evaluation:{rule:'VOL-01',status:'warming_up',baselineCount:3,minimumBaseline:20}};
  h.window.TradeScope.setDataset('LIVE',[unknown],{}, {transport:'polling',feed:'iex'});
  assert.equal(h.element('metricScore').innerHTML,'—');assert.match(h.element('blotterBody').innerHTML,/NOT ASSESSED/);
  assert.match(h.element('inspector').innerHTML,/3 are available/);assert.doesNotMatch(h.element('inspector').innerHTML,/No active detection rules were exceeded|\+0\.00%|0\.00×/);
  assert.equal(h.element('metricAlerts').textContent,'00');await h.click('filterSignals');assert.match(h.element('rowCount').textContent,/0 \/ 1 EVENTS/);
  const evaluated={...unknown,id:'assessed-size-flag',score:70,severity:'medium',volumeRatio:4,evaluation:{...unknown.evaluation,status:'evaluated',baselineCount:20},findings:[{code:'VOL-01',level:'medium',observed:'4× earlier observed trade size'}]};
  h.window.TradeScope.setDataset('LIVE',[unknown,evaluated],{}, {transport:'polling',feed:'iex'});
  assert.match(h.element('metricScore').innerHTML,/^70</);assert.equal(h.element('metricAlerts').textContent,'01');
  assert.match(h.element('rowCount').textContent,/1 \/ 2 EVENTS/);assert.match(h.selector('.kpi-grid .kpi:nth-child(4) .kpi-foot').textContent,/1\/2 assessed/);
});

test('selected observation age stays visible when the global feed has a newer quote',async()=>{
  const h=harness({withApp:true,fetchImpl:async()=>response({snapshots:{}})});await h.click('modeLive');
  h.streams[0].emit('health',health({lastExchangeEventTime:'2026-11-12T20:00:00Z',lastIngestedAt:'2026-11-12T20:00:00Z'}));await h.advance(250);
  const old={...observedRows(1)[0],id:'old-trade',eventTime:'2026-11-12T19:39:50Z',time:'14:39:50',score:null,severity:'unassessed',volumeRatio:null,priceMove:null,transport:'polling',evaluation:{status:'warming_up',baselineCount:0,minimumBaseline:20},marketData:{provider:'alpaca',feed:'iex',coverage:'single-venue',exchangeEventTime:'2026-11-12T19:39:50Z',ingestedAt:'2026-11-12T20:00:00Z'}};
  h.window.TradeScope.setDataset('LIVE',[old],{}, {transport:'streaming',feed:'iex'});
  h.window.TradeScope.setDataset('LIVE',[old,{...old,id:'fresh-quote',type:'QUOTE',eventTime:'2026-11-12T20:00:00Z'}],{}, {transport:'streaming',feed:'iex'});
  assert.equal(h.window.TradeScope.getSelection().id,'old-trade');assert.match(h.element('feedFreshness').textContent,/0s wall age/);
  assert.match(h.element('inspector').innerHTML,/BACKEND SNAPSHOT FETCH/);assert.match(h.element('inspector').innerHTML,/20m 10s wall age · session status unknown/);
  assert.match(h.element('inspector').innerHTML,/AGE AT FETCH/);assert.doesNotMatch(h.element('inspector').innerHTML,/provider outage|feed outage/i);
  await h.advance(5000);assert.match(h.element('inspector').innerHTML,/20m 15s wall age/);
  h.window.TradeScope.setDataset('HISTORY',[old],{}, {transport:'historical',feed:'iex'});
  assert.match(h.element('inspector').innerHTML,/Historical observation; not a live freshness assessment/);
  assert.doesNotMatch(h.element('inspector').innerHTML,/20m 15s wall age/);
});

test('inspector shows the provider event identifier while internal identity remains available for selection',async()=>{
  const h=harness({withApp:true,fetchImpl:async()=>response({snapshots:{}})});await h.click('modeLive');
  h.streams[0].emit('health',health());h.streams[0].emit('observation',observation({sourceEventId:'210686'}));await h.advance(250);
  assert.equal(h.element('inspectorStatus').textContent,'AAPL TRADE 210686');
  assert.match(h.element('inspector').innerHTML,/SOURCE EVENT ID<\/small><b>210686<\/b>/);
  assert(!h.element('inspector').innerHTML.includes('[&quot;iex&quot;'));
  assert.match(h.window.TradeScope.getSelection().id,/210686/);
});
