/* TradeScope market-data pilot: same-origin SSE, with explicit REST fallback.
 * Provider credentials remain on the server. DEMO/LIVE/HISTORY never share rows.
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const symbols = ['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
  const MAX_EVENTS = 1000;
  const POLL_MS = 15000;
  const HEARTBEAT_TIMEOUT_MS = 45000;
  const state = {
    mode:'DEMO', generation:0, events:[], seen:new Set(), snapshots:{},
    source:null, pollTimer:null, watchTimer:null, renderTimer:null,
    controllers:new Set(), pollRequest:null, historyRequest:null,
    transport:'synthetic', feed:'iex', health:null, lastHeartbeat:0, streamSerial:0,
    pollLastEvent:null, pollIngestedAt:null, pollError:null, streamError:null
  };
  const opts = {timeZone:'America/New_York',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'};
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const sortTime = value => validTime(value) ? new Date(value).toISOString().slice(0,19)+'.'+((/\.(\d{1,9})/.exec(value)||[])[1]||'').padEnd(9,'0')+'Z' : '';
  const timeET = value => validTime(value) ? new Date(value).toLocaleTimeString('en-US',opts) : '—';
  const count = value => Number.isFinite(value) && value >= 0 ? Math.floor(value).toLocaleString() : '0';
  const current = (generation, mode) => state.generation === generation && state.mode === mode;
  function setStatus(message, kind='') {
    const el = byId('connectionStatus');
    el.textContent = message;
    el.className = 'connection-status ' + kind;
  }
  function setButtons(mode) {
    ['Demo','Live','History'].forEach(name => byId('mode'+name).classList.toggle('active', name.toUpperCase() === mode));
    byId('historyControls').hidden = mode !== 'HISTORY';
  }
  async function read(url, controller) {
    const timeout = setTimeout(() => {controller.deadlineExpired=true;controller.abort();},14000);
    state.controllers.add(controller);
    try {
      const response = await fetch(url, {cache:'no-store',signal:controller.signal});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || `Request failed: ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
      state.controllers.delete(controller);
    }
  }
  function median(values) {
    const sorted = [...values].sort((a,b) => a-b);
    return sorted.length % 2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  }
  // Exploratory size threshold uses earlier observed trades only, never fabricated risk.
  function scoreEvents(rows) {
    const samples = new Map();
    return rows.map((event, sequence) => {
      const row = {...event,sequence,score:null,severity:'unassessed',findings:[],volumeRatio:null,spreadRatio:null,cancelRatio:null,priceMove:null,
        evaluation:{rule:'VOL-01',status:rowTypeStatus(event),baselineCount:0,minimumBaseline:20}};
      const previous = samples.get(row.symbol) || [];
      if (row.type === 'TRADE') row.evaluation.baselineCount = Math.min(previous.length,50);
      if (row.type === 'TRADE' && Number.isFinite(row.quantity) && row.quantity > 0) {
        if (previous.length >= 20) {
          const baseline = median(previous.slice(-50));
          const ratio = row.quantity / baseline;
          row.evaluation.status = 'evaluated';
          row.score = 0;
          row.severity = 'low';
          row.volumeRatio = ratio;
          if (ratio > 3) {
            row.severity = ratio >= 6 ? 'high' : 'medium';
            row.score = Math.min(99,Math.round(50+ratio*5));
            row.findings.push({code:'VOL-01',level:row.severity,observed:`${ratio.toFixed(2)}× median of ${Math.min(previous.length,50)} earlier ${state.feed.toUpperCase()} observed trades (baseline ${baseline.toFixed(0)} shares)`});
          }
        }
        previous.push(row.quantity);
        samples.set(row.symbol,previous);
      }
      return row;
    });
  }
  function rowTypeStatus(event) {
    if (event.type !== 'TRADE') return 'not_applicable';
    return Number.isFinite(event.quantity) && event.quantity > 0 ? 'warming_up' : 'missing_data';
  }
  function tradeEvent(trade, transport='polling') {
    if (!trade || !symbols.includes(trade.symbol) || !validTime(trade.time) || !Number.isFinite(trade.price) || trade.price <= 0) return null;
    const feed = trade.source === 'ALPACA_SIP_HISTORY' ? 'sip' : 'iex';
    return {
      id:JSON.stringify([feed,'trade',trade.symbol,trade.sourceId ?? null,trade.time,trade.venue ?? null,trade.price,trade.quantity ?? null,trade.conditions ?? null]),
      eventTime:trade.time,sortTime:sortTime(trade.time),time:timeET(trade.time),symbol:trade.symbol,type:'TRADE',price:trade.price,
      quantity:Number.isFinite(trade.quantity) ? trade.quantity : null,venue:trade.venue || '—',
      source:trade.source || 'ALPACA_IEX',transport,feed,
      marketData:{schemaVersion:1,provider:'alpaca',feed,coverage:feed==='iex'?'single-venue':'consolidated-historical-sample',mode:transport==='historical'?'HISTORY':'LIVE',instrumentId:`US_EQUITY:${trade.symbol}`,symbol:trade.symbol,eventType:'trade',sourceEventId:trade.sourceId ?? null,exchange:trade.venue ?? null,exchangeEventTime:trade.time,ingestedAt:trade.ingestedAt ?? null,trade:{price:trade.price,size:trade.quantity ?? null,conditions:trade.conditions ?? null},transport}
    };
  }
  function quoteEvent(quote) {
    if (!quote || !symbols.includes(quote.symbol) || !validTime(quote.time) || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.bid <= 0 || quote.ask <= 0) return null;
    return {
      id:JSON.stringify(['iex','quote',quote.symbol,quote.time,quote.bid,quote.ask,quote.bidSize ?? null,quote.askSize ?? null,quote.bidVenue ?? null,quote.askVenue ?? null]),
      eventTime:quote.time,sortTime:sortTime(quote.time),time:timeET(quote.time),symbol:quote.symbol,type:'QUOTE',price:(quote.bid+quote.ask)/2,
      quantity:Number.isFinite(quote.askSize) ? quote.askSize : null,venue:quote.bidVenue === quote.askVenue ? quote.bidVenue || '—' : [quote.bidVenue||'?',quote.askVenue||'?'].join('/'),
      source:'ALPACA_IEX',transport:'polling',feed:'iex',bid:quote.bid,ask:quote.ask,
      marketData:{schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',mode:'LIVE',instrumentId:`US_EQUITY:${quote.symbol}`,symbol:quote.symbol,eventType:'quote',exchangeEventTime:quote.time,ingestedAt:quote.ingestedAt ?? null,quote:{bidPrice:quote.bid,askPrice:quote.ask,bidSize:quote.bidSize ?? null,askSize:quote.askSize ?? null,bidExchange:quote.bidVenue ?? null,askExchange:quote.askVenue ?? null},transport:'polling'}
    };
  }
  function streamEvent(event) {
    if (!event || event.schemaVersion !== 1 || event.provider !== 'alpaca' || event.feed !== 'iex' || event.mode !== 'LIVE' || !symbols.includes(event.symbol)) return null;
    const orderingTime = validTime(event.exchangeEventTime) ? event.exchangeEventTime : validTime(event.ingestedAt) ? event.ingestedAt : event.receivedAt;
    if (!validTime(orderingTime)) return null;
    const identitySuffix = !event.sourceEventId && !event.exchangeEventTime ? ++state.streamSerial : null;
    const base = {eventTime:event.exchangeEventTime ?? null,sortTime:sortTime(orderingTime),time:timeET(event.exchangeEventTime),symbol:event.symbol,source:'ALPACA_IEX',transport:'streaming',feed:'iex',marketData:event};
    if (event.eventType === 'trade') {
      const trade = event.trade;
      if (!trade || !Number.isFinite(trade.price) || trade.price <= 0) return null;
      return {...base,id:JSON.stringify(['iex','trade',event.symbol,event.sourceEventId,event.exchangeEventTime,event.exchange,trade.price,trade.size,trade.conditions,identitySuffix]),type:'TRADE',price:trade.price,quantity:trade.size ?? null,venue:event.exchange || '—'};
    }
    if (event.eventType === 'quote') {
      const quote = event.quote;
      if (!quote || !Number.isFinite(quote.bidPrice) || !Number.isFinite(quote.askPrice) || quote.bidPrice <= 0 || quote.askPrice <= 0) return null;
      return {...base,id:JSON.stringify(['iex','quote',event.symbol,event.exchangeEventTime,quote,identitySuffix]),type:'QUOTE',price:(quote.bidPrice+quote.askPrice)/2,quantity:quote.askSize ?? null,venue:quote.bidExchange === quote.askExchange ? quote.bidExchange || '—' : [quote.bidExchange||'?',quote.askExchange||'?'].join('/'),bid:quote.bidPrice,ask:quote.askPrice};
    }
    // Bars retain their own semantics; they are not invented trade observations.
    return null;
  }
  function renderDataset() {
    state.renderTimer = null;
    window.TradeScope.setDataset(state.mode,scoreEvents(state.events),state.snapshots,{transport:state.transport,feed:state.feed,source:state.feed==='sip'?'ALPACA_SIP_HISTORY':'ALPACA_IEX'});
    renderHealth();
  }
  function scheduleRender() {
    if (state.renderTimer === null) state.renderTimer = setTimeout(renderDataset,250);
  }
  // REST omits some stream attributes (e.g. conditions). Reconcile only across
  // transports; distinct WebSocket events with different conditions remain intact.
  function overlapIdentity(row) {
    if (!validTime(row.eventTime)) return null;
    const data=row.marketData || {};
    if (row.type==='TRADE') return JSON.stringify([row.feed,row.symbol,row.type,sortTime(row.eventTime),data.sourceEventId ?? null,data.exchange ?? null,row.price,row.quantity]);
    if (row.type==='QUOTE') {
      const quote=data.quote || {};
      return JSON.stringify([row.feed,row.symbol,row.type,sortTime(row.eventTime),quote.bidPrice,quote.askPrice,quote.bidSize ?? null,quote.askSize ?? null,quote.bidExchange ?? null,quote.askExchange ?? null]);
    }
    return null;
  }
  function addRows(rows) {
    for (const row of rows) {
      if (!row || state.seen.has(row.id)) continue;
      const overlap=overlapIdentity(row);
      if (row.transport==='polling' && overlap && state.events.some(old=>old.transport==='streaming' && overlapIdentity(old)===overlap)) continue;
      if (row.transport==='streaming' && overlap) {
        state.events=state.events.filter(old=>{
          if (old.transport!=='polling' || overlapIdentity(old)!==overlap) return true;
          state.seen.delete(old.id);
          return false;
        });
      }
      state.seen.add(row.id);
      state.events.push(row);
    }
    state.events.sort((a,b) => a.sortTime.localeCompare(b.sortTime) || a.id.localeCompare(b.id));
    if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
    // A bounded retained-window dedupe set, not an unlimited history of identifiers.
    state.seen = new Set(state.events.map(row => row.id));
    scheduleRender();
  }
  function resetMarketState(mode) {
    state.generation++;
    if (state.source) state.source.close();
    state.source = null;
    clearInterval(state.pollTimer);
    clearInterval(state.watchTimer);
    clearTimeout(state.renderTimer);
    state.pollTimer = state.watchTimer = state.renderTimer = null;
    for (const controller of state.controllers) controller.abort();
    state.controllers.clear();
    state.pollRequest = state.historyRequest = null;
    state.events = [];
    state.seen.clear();
    state.snapshots = {};
    state.health = null;
    state.streamSerial = 0;
    state.pollLastEvent = state.pollIngestedAt = state.pollError = state.streamError = null;
    state.feed = 'iex';
    state.mode = mode;
    state.transport = mode === 'DEMO' ? 'synthetic' : mode === 'HISTORY' ? 'historical' : 'connecting';
    setButtons(mode);
    window.TradeScope.setDataset(mode,[],{},{transport:state.transport,feed:state.feed});
    if (mode === 'DEMO') setStatus('DEMO / NO PROVIDER CONNECTION');
    renderHealth();
    return state.generation;
  }
  function wallAge(time) {
    if (!validTime(time)) return 'No observation yet';
    const seconds = Math.floor((Date.now()-Date.parse(time))/1000);
    if (seconds < -5) return 'Future observation time · check clocks';
    return seconds < 60 ? `${Math.max(0,seconds)}s wall age` : `${Math.floor(seconds/60)}m wall age · session status unknown`;
  }
  function renderHealth() {
    const demo = state.mode === 'DEMO';
    const history = state.mode === 'HISTORY';
    const health = state.health || {};
    const exchangeTime = state.transport === 'streaming' ? health.lastExchangeEventTime : state.pollLastEvent;
    const ingestedAt = state.transport === 'streaming' ? health.lastIngestedAt : state.pollIngestedAt;
    byId('feedProvider').textContent = demo ? 'SYNTHETIC FIXTURE' : `ALPACA / ${state.feed.toUpperCase()}${state.feed==='iex'?' · SINGLE VENUE':' · HISTORICAL SAMPLE'}`;
    byId('feedTransport').textContent = demo ? 'DEMO · SYNTHETIC' : history ? 'HISTORY · REAL OBSERVATIONS' : state.transport === 'streaming' ? 'LIVE REQUESTED · WEBSOCKET → SSE' : 'LIVE REQUESTED · REST POLLING FALLBACK';
    byId('feedConnection').textContent = demo ? 'No provider connection' : history ? 'Historical request only' : `${health.status || 'connecting'}${health.message && health.status !== 'streaming' ? ' · '+health.message : ''}${state.streamError ? ' · '+state.streamError : ''}`;
    byId('feedExchangeTime').textContent = validTime(exchangeTime) ? exchangeTime : '—';
    byId('feedIngestedTime').textContent = validTime(ingestedAt) ? ingestedAt : '—';
    byId('feedFreshness').textContent = demo ? 'Synthetic observations' : history ? 'Historical · not a live feed' : wallAge(exchangeTime);
    byId('feedCounts').textContent = demo ? '—' : `${count(health.observationsReceived)} stream / ${count(state.events.length)} retained`;
    byId('feedDuplicates').textContent = demo || history ? '—' : `${count(health.duplicatesDiscarded)} discarded / ${count(health.reconnectionAttempts)} retries`;
    byId('feedContinuity').textContent = demo ? 'Deterministic demo replay' : history ? 'Capped historical sample; completeness unknown' : `Continuity unknown${health.nextRetryAt ? ' · next retry '+timeET(health.nextRetryAt)+' ET' : ''}${state.pollError ? ' · '+state.pollError : ''}`;
  }
  function updateSnapshot(snapshots) {
    for (const [symbol,info] of Object.entries(snapshots || {})) {
      if (!symbols.includes(symbol)) continue;
      const trade = info.trade;
      if (!trade || !Number.isFinite(trade.price) || trade.price <= 0) continue;
      const previous = state.snapshots[symbol];
      if (previous?.eventTime && validTime(trade.time) && sortTime(previous.eventTime) > sortTime(trade.time)) continue;
      const previousClose = Number.isFinite(info.previousClose) && info.previousClose > 0 ? info.previousClose : null;
      state.snapshots[symbol] = {price:trade.price,change:previousClose ? (trade.price-previousClose)/previousClose*100 : null,previousClose,eventTime:trade.time};
    }
  }
  function stopPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    if (state.pollRequest) state.pollRequest.abort();
    state.pollRequest = null;
  }
  function startFallback(generation) {
    if (!current(generation,'LIVE')) return;
    state.transport = 'polling';
    scheduleRender();
    if (state.pollTimer === null) {
      state.pollTimer = setInterval(() => poll(generation),POLL_MS);
      void poll(generation);
    }
    renderHealth();
  }
  async function poll(generation) {
    if (!current(generation,'LIVE') || state.pollRequest || state.transport === 'streaming') return;
    const controller = new AbortController();
    state.pollRequest = controller;
    try {
      const data = await read('/api/live',controller);
      if (!current(generation,'LIVE') || controller.signal.aborted || state.transport === 'streaming') return;
      updateSnapshot(data.snapshots);
      const rows = [];
      for (const info of Object.values(data.snapshots || {})) {
        if (info.trade) rows.push(tradeEvent({...info.trade,ingestedAt:data.fetchedAt}));
        if (info.quote) rows.push(quoteEvent({...info.quote,ingestedAt:data.fetchedAt}));
      }
      addRows(rows);
      const times = Object.values(data.snapshots || {}).flatMap(info => [info.trade?.time,info.quote?.time]).filter(validTime).sort();
      state.pollLastEvent = times.at(-1) || null;
      state.pollIngestedAt = data.fetchedAt || null;
      state.pollError = null;
      setStatus(`IEX REST POLLING FALLBACK · ${state.pollLastEvent ? 'latest '+timeET(state.pollLastEvent)+' ET' : 'no observations'} · ${state.events.length} retained observations`,'ok');
      renderHealth();
    } catch (error) {
      if (!current(generation,'LIVE') || (controller.signal.aborted && !controller.deadlineExpired)) return;
      state.pollError = controller.deadlineExpired ? 'Snapshot request timed out' : 'Snapshot request failed';
      setStatus('IEX REST FALLBACK ERROR: '+(controller.deadlineExpired ? 'Snapshot request timed out' : error.message),'failed');
      renderHealth();
    } finally {
      if (state.pollRequest === controller) state.pollRequest = null;
    }
  }
  function live() {
    const generation = resetMarketState('LIVE');
    setStatus('CONNECTING TO IEX STREAM · REST FALLBACK ENABLED');
    state.lastHeartbeat = Date.now();
    startFallback(generation);
    if (typeof EventSource === 'function') {
      try {
        const source = new EventSource('/api/stream');
        state.source = source;
        source.addEventListener('health',message => {
          if (!current(generation,'LIVE') || state.source !== source) return;
          let health;
          try { health = JSON.parse(message.data); } catch { return; }
          if (!health || typeof health !== 'object' || health.provider !== 'alpaca' || health.feed !== 'iex') return;
          state.lastHeartbeat = Date.now();
          state.health = health;
          state.streamError = null;
          if (health.status === 'streaming') {
            state.transport = 'streaming';
            stopPolling();
            setStatus('IEX WEBSOCKET → SSE · '+(health.lastExchangeEventTime ? 'last observation '+timeET(health.lastExchangeEventTime)+' ET' : 'subscribed; awaiting observations'),'ok');
            scheduleRender();
          } else {
            setStatus(`IEX STREAM ${String(health.status || 'PENDING').toUpperCase()} · REST POLLING FALLBACK`,health.status==='unavailable'?'failed':'');
            startFallback(generation);
          }
          renderHealth();
        });
        source.addEventListener('observation',message => {
          if (!current(generation,'LIVE') || state.source !== source) return;
          let event;
          try { event = JSON.parse(message.data); } catch { return; }
          const row = streamEvent(event);
          state.lastHeartbeat = Date.now();
          if (!row || state.health?.status !== 'streaming') return;
          // Use the actual observation clocks immediately; counters remain the
          // backend's latest heartbeat report, including discarded duplicates.
          if (validTime(event.exchangeEventTime) && (!validTime(state.health.lastExchangeEventTime) || sortTime(event.exchangeEventTime) > sortTime(state.health.lastExchangeEventTime))) state.health.lastExchangeEventTime = event.exchangeEventTime;
          if (validTime(event.ingestedAt)) state.health.lastIngestedAt = event.ingestedAt;
          if (validTime(event.receivedAt)) state.health.lastReceivedAt = event.receivedAt;
          if (row.type === 'TRADE') {
            const previous = state.snapshots[row.symbol];
            if (!previous?.eventTime || sortTime(previous.eventTime) <= row.sortTime) state.snapshots[row.symbol] = {price:row.price,change:previous?.previousClose ? (row.price-previous.previousClose)/previous.previousClose*100 : null,previousClose:previous?.previousClose ?? null,eventTime:row.eventTime || event.ingestedAt};
          }
          addRows([row]);
        });
        source.onerror = () => {
          if (!current(generation,'LIVE') || state.source !== source) return;
          state.streamError = 'browser stream disconnected';
          setStatus('IEX BROWSER STREAM DISCONNECTED · REST POLLING FALLBACK','failed');
          // Native EventSource retries one connection; never construct a retry loop.
          startFallback(generation);
        };
      } catch {
        state.streamError = 'browser stream unavailable';
      }
    } else state.streamError = 'browser does not support SSE';
    state.watchTimer = setInterval(() => {
      if (!current(generation,'LIVE')) return;
      if (Date.now()-state.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        state.streamError = 'server heartbeat overdue';
        startFallback(generation);
        setStatus('IEX SERVER HEARTBEAT OVERDUE · REST POLLING FALLBACK','failed');
      }
      renderHealth();
      window.TradeScope.refreshObservationAge?.();
    },5000);
    renderHealth();
  }
  function history() {
    resetMarketState('HISTORY');
    state.feed = byId('historyFeed').value;
    renderDataset();
    setStatus('Select a trading date and feed, then LOAD REAL TRADES');
    renderHealth();
  }
  async function loadHistory() {
    if (state.mode !== 'HISTORY') return;
    if (state.historyRequest) state.historyRequest.abort();
    const generation = state.generation;
    const controller = new AbortController();
    state.historyRequest = controller;
    const symbol = byId('historySymbol').value;
    const date = byId('historyDate').value;
    const feed = byId('historyFeed').value;
    try {
      if (!date) throw Error('Please choose a date');
      setStatus('FETCHING HISTORICAL '+feed.toUpperCase()+' TRADES…');
      const data = await read(`/api/history?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}&feed=${encodeURIComponent(feed)}`,controller);
      if (!current(generation,'HISTORY') || controller.signal.aborted || state.historyRequest !== controller) return;
      state.events = [];
      state.seen.clear();
      state.snapshots = {};
      state.feed = data.feed === 'sip' ? 'sip' : 'iex';
      const rows = (data.trades || []).map(trade => tradeEvent({...trade,source:data.source,ingestedAt:data.fetchedAt},'historical')).filter(Boolean);
      state.snapshots[symbol] = {price:rows.at(-1)?.price ?? null,change:null};
      state.pollLastEvent = rows.at(-1)?.eventTime || null;
      state.pollIngestedAt = data.fetchedAt || null;
      addRows(rows);
      setStatus(`${rows.length} real ${state.feed.toUpperCase()} historical trades · ${symbol} · ${date}${data.hasMore ? ' · newest 1,000 only' : ''}`,'ok');
      renderHealth();
    } catch (error) {
      if (current(generation,'HISTORY') && state.historyRequest===controller && (!controller.signal.aborted || controller.deadlineExpired)) setStatus('HISTORY ERROR: '+(controller.deadlineExpired ? 'Historical request timed out' : error.message),'failed');
    } finally {
      if (state.historyRequest === controller) state.historyRequest = null;
    }
  }
  byId('modeDemo').addEventListener('click',() => resetMarketState('DEMO'));
  byId('modeLive').addEventListener('click',live);
  byId('modeHistory').addEventListener('click',history);
  byId('loadHistory').addEventListener('click',loadHistory);
  window.addEventListener('pagehide',() => resetMarketState('DEMO'));
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate()-1);
  byId('historyDate').value = yesterday.toISOString().slice(0,10);
  byId('historyDate').max = new Date().toISOString().slice(0,10);
  renderHealth();
})();
