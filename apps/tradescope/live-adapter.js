/* TradeScope IEX pilot. Provider credentials never enter the browser.
 * Sources: ALPACA_IEX real snapshots and historical trades.
 * Alerts: only VOL-01 exploratory threshold after at least 20 prior observed trades per symbol.
 */
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const symbols=['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const state={mode:'DEMO',events:[],seen:new Set(),snapshots:{},timer:null,busy:false};
const opts={timeZone:'America/New_York',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'};
const timeET=iso=>new Date(iso).toLocaleTimeString('en-US',opts);
function setStatus(msg,kind=''){const el=byId('connectionStatus');el.textContent=msg;el.className='connection-status '+kind;}
function setButtons(mode){['Demo','Live','History'].forEach(x=>byId('mode'+x).classList.toggle('active',x.toUpperCase()===mode));byId('historyControls').hidden=mode!=='HISTORY';}
async function read(path){const r=await fetch(path,{cache:'no-store'});const obj=await r.json().catch(()=>({}));if(!r.ok)throw Error(obj.error||`Request failed: ${r.status}`);return obj;}
function median(a){const x=[...a].sort((a,b)=>a-b);return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2;}
// These real events are deliberately NOT assigned fabricated risk scores.
// Only a correctly source-tagged, time-ordered observed-size threshold can generate a pilot alert.
function scoreEvents(rows){const samples=new Map();const sorted=[...rows].sort((a,b)=>a.eventTime.localeCompare(b.eventTime)||a.id.localeCompare(b.id));return sorted.map((event,i)=>{
  const x={...event,sequence:i,score:0,severity:'low',findings:[],volumeRatio:0,spreadRatio:0,cancelRatio:0,priceMove:0};
  if(x.type==='TRADE'&&x.quantity>0){const prev=samples.get(x.symbol)||[];if(prev.length>=20){const med=median(prev.slice(-50));const ratio=med>0?x.quantity/med:0;x.volumeRatio=ratio;if(ratio>3){x.severity=ratio>=6?'high':'medium';x.score=Math.min(99,Math.round(50+ratio*5));x.findings.push({code:'VOL-01',level:x.severity,observed:`${ratio.toFixed(2)}× median of ${Math.min(prev.length,50)} earlier IEX sampled trades (baseline ${med.toFixed(0)} shares)`});}}prev.push(x.quantity);samples.set(x.symbol,prev);}
  return x;
});}
function tradeEvent(t){if(!t||!symbols.includes(t.symbol)||!t.time||!Number.isFinite(t.price))return null;return {id:`${t.source==='ALPACA_SIP_HISTORY'?'SIP':'IEX'}-T-${t.symbol}-${t.sourceId}-${t.time}`,eventTime:t.time,time:timeET(t.time),symbol:t.symbol,type:'TRADE',price:t.price,quantity:t.quantity||0,venue:t.venue||'IEX',source:t.source||'ALPACA_IEX'};}
function quoteEvent(q){if(!q||!symbols.includes(q.symbol)||!q.time||!q.ask||!q.bid)return null;return {id:`IEX-Q-${q.symbol}-${q.time}`,eventTime:q.time,time:timeET(q.time),symbol:q.symbol,type:'QUOTE',price:(q.bid+q.ask)/2,quantity:q.askSize||0,venue:'IEX',source:'ALPACA_IEX',bid:q.bid,ask:q.ask};}
function resetMarketState(mode){clearInterval(state.timer);state.timer=null;state.events=[];state.seen.clear();state.snapshots={};state.mode=mode;setButtons(mode);if(mode==='DEMO'){window.TradeScope.setDataset('DEMO',[]);setStatus('DEMO / NO PROVIDER CONNECTION');}}
function addRows(rows){for(const e of rows){if(e&&!state.seen.has(e.id)){state.seen.add(e.id);state.events.push(e);}}state.events=state.events.sort((a,b)=>a.eventTime.localeCompare(b.eventTime)||a.id.localeCompare(b.id)).slice(-1000);const processed=scoreEvents(state.events);window.TradeScope.setDataset(state.mode,processed,state.snapshots);}
function updateSnapshot(s){for(const [symbol,info] of Object.entries(s)){if(!symbols.includes(symbol))continue;const t=info.trade;const b=info.previousClose;if(t&&t.price>0){state.snapshots[symbol]={price:t.price,change:b?((t.price-b)/b*100):null};}}}
function freshest(s){const times=Object.values(s).flatMap(a=>[a.trade?.time,a.quote?.time].filter(Boolean));return times.length?times.sort().at(-1):null;}
async function poll(){if(state.busy||state.mode!=='LIVE')return;state.busy=true;try{
  const data=await read('/api/live');if(state.mode!=='LIVE')return;
  updateSnapshot(data.snapshots);const rows=[];
  for(const info of Object.values(data.snapshots)){if(info.trade)rows.push(tradeEvent(info.trade));if(info.quote)rows.push(quoteEvent(info.quote));}
  addRows(rows);
  const last=freshest(data.snapshots);const age=last?Math.floor((Date.now()-Date.parse(last))/1000):null;
  setStatus(last?`IEX latest: ${timeET(last)} ET · ${age>=0?`${Math.floor(age/60)}m old`:'timestamp checked'} · ${state.events.length} distinct observations`:'IEX connected / no latest market observations','ok');
 }catch(e){setStatus('IEX ERROR: '+e.message,'failed');}finally{state.busy=false;}}
async function live(){resetMarketState('LIVE');window.TradeScope.setDataset('LIVE',[],{});setStatus('CONNECTING TO LOCAL IEX DATA SERVER…');await poll();state.timer=setInterval(poll,15000);}
async function history(){resetMarketState('HISTORY');window.TradeScope.setDataset('HISTORY',[],{});setStatus('Select a trading date and feed, then LOAD REAL TRADES');}
async function loadHistory(){if(state.busy)return;state.busy=true;const symbol=byId('historySymbol').value,date=byId('historyDate').value,feed=byId('historyFeed').value;try{if(!date)throw Error('Please choose a date');setStatus('FETCHING HISTORICAL '+feed.toUpperCase()+' TRADES…');const d=await read(`/api/history?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}&feed=${encodeURIComponent(feed)}`);if(state.mode!=='HISTORY')return;const rows=d.trades.map(t=>tradeEvent({...t,source:d.source})).filter(Boolean);state.snapshots[symbol]={price:rows.at(-1)?.price??null,change:null};addRows(rows);setStatus(`${rows.length} real ${feed.toUpperCase()} trades · ${symbol} · ${date}${d.hasMore?' · newest 1,000 only':''}`,'ok');}catch(e){setStatus('HISTORY ERROR: '+e.message,'failed');}finally{state.busy=false;}}
byId('modeDemo').addEventListener('click',()=>resetMarketState('DEMO'));
byId('modeLive').addEventListener('click',live);
byId('modeHistory').addEventListener('click',history);
byId('loadHistory').addEventListener('click',loadHistory);
const d=new Date();d.setDate(d.getDate()-1);byId('historyDate').value=d.toISOString().slice(0,10);byId('historyDate').max=new Date().toISOString().slice(0,10);
})();
