/* TradeScope Terminal / Professional blotter UI v0.2
 * Demo mode is synthetic. Real IEX data only enters through the local read-only adapter.
 * Synthetic examples never mix with source-labeled real market observations.
 */
(() => {
  'use strict';
  const tickers = [
    {symbol:'NVDA',base:190.43,delta:1.42,sector:'Semiconductors'},
    {symbol:'AAPL',base:256.20,delta:-.38,sector:'Consumer Tech'},
    {symbol:'MSFT',base:506.15,delta:.86,sector:'Cloud'},
    {symbol:'TSLA',base:419.28,delta:-2.14,sector:'Auto'},
    {symbol:'SPY',base:685.34,delta:.31,sector:'ETF'},
    {symbol:'AMD',base:245.82,delta:2.38,sector:'Semiconductors'},
    {symbol:'QQQ',base:618.71,delta:.64,sector:'ETF'},
    {symbol:'META',base:703.85,delta:1.75,sector:'Social'},
    {symbol:'AMZN',base:239.72,delta:-1.06,sector:'Commerce'},
    {symbol:'PLTR',base:176.38,delta:3.18,sector:'Software'}
  ];
  const bySymbol=Object.fromEntries(tickers.map(t=>[t.symbol,t]));
  const el = (id) => document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'—':'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const qfmt=v=>v==null?'—':Math.round(v).toLocaleString('en-US');
  const signed=v=>(v>=0?'+':'')+v.toFixed(2)+'%';
  const rules={
    'VOL-01':{name:'Unusual volume',threshold:'Size / baseline > 3.0×',unit:'× baseline'},
    'SPR-02':{name:'Spread expansion',threshold:'Spread / baseline > 2.5×',unit:'× spread'},
    'CAN-03':{name:'Cancel concentration',threshold:'Cancellation ratio > 65%',unit:'% cancellations'},
    'MOV-04':{name:'Price dislocation',threshold:'Absolute return > 1.8%',unit:'% move'}
  };
  function time(i) { const n = 9*3600+30*60+i*8; return [Math.floor(n/3600), Math.floor(n%3600/60), n%60].map(v=>String(v).padStart(2,'0')).join(':'); }
  const eventKinds=['TRADE','QUOTE','TRADE','ADD','CANCEL','TRADE','QUOTE','TRADE','ADD','TRADE','CANCEL'];
  const venueCodes=['IEX','XNAS','ARCX','BATS','SIM'];
  let fixture=Array.from({length:128},(_,i)=>{
    const symbol=tickers[(i*7+Math.floor(i/11))%tickers.length].symbol;
    const type=eventKinds[(i*3+Math.floor(i/9))%eventKinds.length];
    const base=bySymbol[symbol].base;
    const px=base*(1+Math.sin(i*.66+symbol.length)*.0041+Math.cos(i*.21)*.0017+(i%23===0?.022:0)-(i%31===0?.024:0));
    const quantity= Math.round(180+(i*131)%1500+(i%9===0?7400:0)+(i%17===0?3950:0));
    const baseline=1750+((i*71)%150);
    const volumeRatio=quantity/baseline;
    const spreadRatio=1.07+(i%11===0?3.7:i%19===0?2.5:((i*3)%13)*.09);
    const cancelRatio=type==='CANCEL' ? (i%4===0?.84:i%3===0?.73:.35) : .12+(i%5)*.04;
    const priceMove=i%23===0?2.83:i%31===0?-2.48:Math.sin(i*.39)*.68;
    const findings=[];
    if(type==='TRADE'&&volumeRatio>3) findings.push({code:'VOL-01',level:volumeRatio>4?'high':'medium',observed:volumeRatio.toFixed(2)+'× baseline'});
    if(type==='QUOTE'&&spreadRatio>2.5) findings.push({code:'SPR-02',level:spreadRatio>4?'high':'medium',observed:spreadRatio.toFixed(2)+'× spread'});
    if(type==='CANCEL'&&cancelRatio>.65) findings.push({code:'CAN-03',level:cancelRatio>.8?'high':'medium',observed:(cancelRatio*100).toFixed(0)+'% cancellations'});
    if(Math.abs(priceMove)>1.8) findings.push({code:'MOV-04',level:Math.abs(priceMove)>2.6?'high':'medium',observed:signed(priceMove)});
    const severity=findings.some(f=>f.level==='high')?'high':findings.length?'medium':'low';
    const score=severity==='high'?83+(i*7)%16:severity==='medium'?58+(i*13)%23:13+(i*11)%36;
    return {id:'EVT-'+String(630001+i),time:time(i),symbol,type,price:px,quantity,venue:venueCodes[(i*3)%venueCodes.length],score,severity,findings,volumeRatio,spreadRatio,cancelRatio,priceMove,source:'SYNTHETIC_FIXTURE_V2',sequence:i};
  });
  const syntheticFixture=fixture;
  const originalTickerData=tickers.map(t=>({...t}));
  const fmtDelta=t=>Number.isFinite(t.delta)?signed(t.delta):'—';
  const state={mode:'DEMO',revealed:68,running:false,speed:1,symbol:'NVDA',symbolFilter:'ALL',eventFilter:'ALL',flagsOnly:false,search:'',selectedId:null,reviewed:new Set(),timer:null,sort:'newest',nav:'monitor',range:'1M'};
  const now=()=>fixture.slice(0,state.revealed);
  const flagged=()=>now().filter(x=>x.severity!=='low');
  const currentSelection=()=>now().find(x=>x.id===state.selectedId);
  const filtered=()=>now().filter(x=>(state.symbolFilter==='ALL'||x.symbol===state.symbolFilter)&&(state.eventFilter==='ALL'||x.type===state.eventFilter)&&(!state.flagsOnly||x.severity!=='low')&&(!state.search||[x.id,x.symbol,x.type,x.venue,...x.findings.map(f=>rules[f.code].name)].join(' ').toLowerCase().includes(state.search))).sort((a,b)=>state.sort==='newest'?b.sequence-a.sequence:a.sequence-b.sequence);
  function chooseEvent(id,focus=false){const item=fixture.find(x=>x.id===id);if(!item)return;state.selectedId=id;state.symbol=item.symbol;render();if(focus&&window.innerWidth<761)el('inspector').scrollIntoView({behavior:'smooth',block:'nearest'});}
  function chooseSymbol(symbol){state.symbol=symbol;state.symbolFilter=symbol;el('symbolFilter').value=symbol;state.flagsOnly=false;updateToggle();render();}
  function renderTickers(){el('tickerTape').innerHTML=tickers.map(t=>`<div class="ticker-item"><b>${t.symbol}</b><span class="ticker-price">${t.base==null?'—':t.base.toFixed(2)}</span><span class="${t.delta==null?'':t.delta>=0?'pos':'neg'}">${fmtDelta(t)}</span></div>`).join('');}
  function renderWatch(){el('watchRows').innerHTML=tickers.map(t=>`<button type="button" class="watch-row ${state.symbol===t.symbol?'active':''}" data-symbol="${t.symbol}" title="View ${t.symbol}"><span><strong>${t.symbol}</strong><small>${t.sector.toUpperCase()}</small></span><span class="num">${t.base==null?'—':t.base.toFixed(2)}</span><span class="pct ${t.delta==null?'':t.delta>=0?'pos':'neg'}">${fmtDelta(t)}</span></button>`).join('');el('watchRows').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>chooseSymbol(b.dataset.symbol)));}
  function heatColor(value){if(value==null)return '#293944';if(value>=2.2)return '#196a55';if(value>=1)return '#185342';if(value>=0)return '#244b40';if(value>=-1)return '#5a3337';return '#77363b';}
  function renderHeatmap(){const tiles=[['NVDA',3,2],['AAPL',3,1],['AMD',2,1],['TSLA',2,1],['PLTR',2,1],['MSFT',2,1],['META',2,1],['AMZN',2,1],['SPY',2,1],['QQQ',2,1]];el('heatmap').innerHTML=tiles.map(([s,c,r])=>{const t=bySymbol[s];return `<button type="button" data-symbol="${s}" class="heat-tile ${state.symbol===s?'active':''}" style="--col:${c};--row:${r};--tile-bg:${heatColor(t.delta)}"><strong>${s}</strong><span>${fmtDelta(t)}</span></button>`}).join('');el('heatmap').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>chooseSymbol(b.dataset.symbol)));}
  function renderMetrics(){
    const events=now(), alerts=flagged(), high=alerts.filter(e=>e.severity==='high');
    const avg=Math.round(events.reduce((sum,e)=>sum+e.score,0)/(events.length||1));
    const demo=state.mode==='DEMO', live=state.mode==='LIVE', feed=(state.feed||'iex').toUpperCase();
    const streaming=state.transport==='streaming';
    el('metricEvents').textContent=events.length.toLocaleString();
    el('metricAlerts').textContent=String(alerts.length).padStart(2,'0');
    el('metricCritical').textContent=String(high.length).padStart(2,'0');
    el('metricScore').innerHTML=`${avg}<span class="muted-fraction">/100</span>`;
    el('metricAlertRate').textContent=`${Math.round(alerts.length/(events.length||1)*100)}% of observed events`;
    el('navCount').textContent=String(alerts.length).padStart(2,'0');
    el('signalCount').textContent=String(alerts.length).padStart(2,'0')+' ACTIVE';
    el('streamProgress').textContent=`${events.length} / ${fixture.length} EVENTS`;
    el('blotterCount').textContent=events.length+' EVENTS';
    el('streamState').textContent=demo?(state.revealed>=fixture.length?'REPLAY COMPLETE':state.running?'REPLAY RUNNING':'REPLAY PAUSED'):live?(streaming?'IEX / STREAM SUBSCRIBED':'IEX / REST FALLBACK'):`${feed} / HISTORICAL SESSION`;
    el('streamState').classList.toggle('running',state.running);
    document.querySelector('.stream-ring').classList.toggle('running',state.running);
    el('footerEngine').textContent=demo?(state.running?'RUNNING':state.revealed===fixture.length?'COMPLETE':'READY'):live?(streaming?'STREAMING':'POLLING FALLBACK'):'SESSION LOADED';
    el('play').textContent=demo?(state.revealed>=fixture.length?'↺ RESTART REPLAY':state.running?'Ⅱ PAUSE REPLAY':'▶ RUN REPLAY'):'REPLAY: DEMO ONLY';
    el('play').disabled=!demo;
    el('reset').disabled=!demo;
    document.querySelector('.env-badge').textContent=demo?'● SYNTHETIC DATA':live?(streaming?'● IEX / STREAM SUBSCRIBED':'● IEX / POLLING FALLBACK'):`● ${feed} / HISTORICAL`;
    document.querySelector('.data-source').textContent='SOURCE: '+(demo?'SYNTHETIC_FIXTURE_V2':state.realSource||'ALPACA_IEX');
    document.querySelector('.disclaimer-icon').textContent=demo?'SIM':feed;
    document.querySelector('.heatmap-panel .panel-meta').textContent=demo?'SYNTHETIC':`${feed} / OBSERVED`;
    el('tickerTape').ariaLabel=demo?'Synthetic watchlist prices':`${feed} observed watchlist prices`;
    document.querySelector('.blotter-scroll table').ariaLabel=demo?'Synthetic market event blotter':`${feed} observed market event blotter`;
    document.querySelector('.statusbar span:nth-child(3) b').textContent=demo?'SYNTHETIC':state.realSource||'ALPACA IEX';
    document.querySelector('.statusbar span:nth-child(4) b').textContent=demo?'DETERMINISTIC':'LIMITED PILOT';
    document.querySelector('.disclaimer strong').textContent=demo?'SIMULATED DATA ENVIRONMENT':live?(streaming?'IEX STREAM + OBSERVED SNAPSHOTS':'IEX SNAPSHOT FALLBACK'):`REAL ${feed} / HISTORICAL DATA`;
    document.getElementById('sourceWarning').textContent=demo?'All displayed prices, trades, order events, anomaly signals and charts are generated for demonstration. Not connected to live markets or brokerage accounts.':live?(streaming?'Backend IEX WebSocket observations delivered by SSE. Previously polled observations may remain; each selected row identifies its transport. IEX covers one venue, not consolidated US trading. A connected stream does not prove fresh observations.':'Latest available IEX snapshots polled every 15 seconds while streaming is unavailable. Observations may be old; successful HTTP requests do not prove fresh data. IEX is one venue, not the consolidated US market.'):`Actual historical ${feed} trades from Alpaca. This is a capped sample, not a complete market tape. Detection is exploratory.`;
    document.querySelector('.chart-info small').textContent=demo?'SIMULATED MID / USD':`${feed} OBSERVED TRADE / USD`;
    document.querySelectorAll('.chart-tabs button').forEach(b=>{b.disabled=!demo;});
    document.querySelector('.kpi-grid .kpi:first-child .kpi-foot').textContent=demo?'↑ 12.8% vs. earlier replay segment':'Retained provider observations, deduplicated';
    document.querySelector('.kpi-grid .kpi:last-child .kpi-foot').textContent=demo?'Simulated venues / US equities':feed==='IEX'?'10 requested / single venue IEX':'Historical SIP / capped symbol sample';
    document.querySelectorAll('.rule-list > div').forEach((row,i)=>{row.querySelector('.rule-on').textContent=demo?'ON':i===0?'PILOT':'OFF';});
    document.querySelector('.healthy-tag').textContent=demo?'● ACTIVE':'● EXPERIMENTAL';
    el('clock').textContent=demo?'ET '+(events.at(-1)?.time||'09:30:00'):'ET '+new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York',hour12:false});
    const heights=[9,15,12,18,13,23,19,17,29,24];
    document.querySelector('.score-bars').innerHTML=heights.map((height,i)=>`<i style="--h:${Math.max(3,Math.round(height*avg/40))}px;opacity:${i<=avg/11?'1':'.27'}"></i>`).join('');
  }
  function chartSeries(symbol){if(state.mode!=='DEMO')return fixture.filter(e=>e.symbol===symbol&&e.type==='TRADE').slice(-72).map(e=>({value:e.price,activity:Math.min(60,Math.log10((e.quantity??0)+1)*7),time:e.eventTime}));const base=bySymbol[symbol].base;return Array.from({length:72},(_,i)=>{const wave=Math.sin(i*.13+.4)*1.7+Math.cos(i*.31)*.74+Math.sin(i*.065)*1.1;const drift=i*.052*(symbol.length%3===0?-1:1);return {value:base+wave+drift,activity:5+Math.abs(Math.sin(i*.31+symbol.length))*17+(i%13===0?14:0)};});}
  function renderChart(){const t=bySymbol[state.symbol];el('chartSymbol').textContent=t.symbol;el('chartPrice').textContent=money(t.base);el('chartChange').textContent=fmtDelta(t);el('chartChange').className=t.delta==null?'':t.delta>=0?'pos':'neg';const baseSeries=chartSeries(t.symbol);if(baseSeries.length<2){el('marketChart').innerHTML='<div class="empty">NOT ENOUGH REAL TRADE SAMPLES FOR A CHART. SELECT HISTORICAL MODE OR WAIT FOR NEW IEX TRADES.</div>';return;}const series=baseSeries.slice(-(state.mode==='DEMO'?({ '1M':24,'5M':42,'15M':58,'1H':72 }[state.range]||72):72)),values=series.map(x=>x.value),min=Math.min(...values)-.6,max=Math.max(...values)+.6,W=870,H=151,L=12,R=65,T=10,B=21,X=i=>L+i*(W-L-R)/(series.length-1),Y=v=>T+(max-v)/(max-min)*(H-T-B-24),points=series.map((p,i)=>`${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' '),baseY=H-B-9;
    const area=`M${points.replaceAll(' ',' L')} L${X(series.length-1)},${baseY} L${X(0)},${baseY} Z`;
    const lines=[0,.25,.5,.75,1].map(f=>{const y=T+f*(H-T-B-24);return `<line class="grid-line" x1="0" y1="${y}" x2="${W-R}" y2="${y}"/><text class="axis-text" x="${W-R+7}" y="${y+4}">${(max-(max-min)*f).toFixed(2)}</text>`}).join('');
    const bars=series.map((p,i)=>`<rect x="${X(i)-2}" y="${baseY-p.activity*.58}" width="4.3" height="${p.activity*.58}" fill="${i%5===0?'#375e68':'#294a56'}" opacity=".72"/>`).join('');
    const labels=(state.mode==='DEMO'?[['09:30',0],['09:35',.23],['09:40',.46],['09:45',.69],['09:50',.92]]:series.filter((_,i)=>i%Math.max(1,Math.floor(series.length/5))===0).slice(0,5).map((p,i)=>[p.time?new Date(p.time).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour12:false,hour:'2-digit',minute:'2-digit'}):'IEX',i/5])).map(([s,f])=>`<text class="axis-text" x="${L+(W-L-R)*f}" y="${H-2}">${s}</text>`).join('');
    el('marketChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${state.mode==='DEMO'?'Simulated':'Observed '+(state.feed||'iex').toUpperCase()} ${esc(t.symbol)} price chart with activity"><defs><linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#50d4b4" stop-opacity=".23"/><stop offset="1" stop-color="#50d4b4" stop-opacity=".005"/></linearGradient></defs>${lines}${bars}<path class="chart-area" d="${area}"/><polyline class="chart-line" points="${points}"/><circle cx="${X(series.length-1)}" cy="${Y(series.at(-1).value)}" r="3.7" fill="#74e9c9" stroke="#0e1519" stroke-width="2"/>${labels}</svg>`;
  }
  function renderTable(){const rows=filtered();el('blotterBody').innerHTML=rows.length?rows.map(e=>`<tr data-event="${esc(e.id)}" tabindex="0" class="${state.selectedId===e.id?'selected':''}" aria-label="Inspect ${esc(e.id)} ${esc(e.symbol)}"><td class="row-time">${esc(e.time)}</td><td class="row-sym">${esc(e.symbol)}</td><td class="event-kind ${e.type.toLowerCase()}">${esc(e.type)}</td><td class="num">${e.price.toFixed(2)}</td><td class="num">${qfmt(e.quantity)}</td><td class="venue">${esc(e.venue)}</td><td class="num anomaly-val ${e.severity}">${e.score}</td><td><span class="risk-label ${e.severity}">${e.severity==='high'?'HIGH':e.severity==='medium'?'MED':'NORMAL'}</span></td></tr>`).join(''):'<tr><td colspan="8" class="empty">NO MATCHING EVENTS — ADJUST FILTERS</td></tr>';el('rowCount').textContent=`${rows.length} / ${now().length} EVENTS SHOWN`;el('blotterBody').querySelectorAll('tr[data-event]').forEach(tr=>{tr.addEventListener('click',()=>chooseEvent(tr.dataset.event));tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseEvent(tr.dataset.event);}})});}
  function renderFlow(){const freq={TRADE:0,QUOTE:0,ADD:0,CANCEL:0};now().forEach(e=>freq[e.type]++);const max=Math.max(...Object.values(freq),1);el('eventMix').innerHTML=Object.entries(freq).map(([kind,n])=>`<div class="flow-row"><span>${kind}</span><div class="flow-track"><span class="flow-fill" style="width:${n/max*100}%;background:${{TRADE:'#58cdb0',QUOTE:'#6797b5',ADD:'#957db3',CANCEL:'#d7a55f'}[kind]}"></span></div><b>${n}</b></div>`).join('');}
  function renderSignals(){const a=flagged().slice().reverse().slice(0,4);el('signalRows').innerHTML=a.length?a.map(e=>`<button type="button" data-event="${esc(e.id)}" class="signal-row"><span class="signal-marker ${e.severity}"></span><span class="signal-copy"><b>${esc(e.symbol)} · ${e.findings[0]?rules[e.findings[0].code].name:'Event exception'}</b><small>${esc(e.time)} ET · ${esc(e.venue)} · ${esc(e.id)}</small></span><span class="signal-score ${e.severity}">${e.score}/100</span></button>`).join(''):'<div class="empty">NO FLAGS IN REPLAY</div>';el('signalRows').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>chooseEvent(b.dataset.event)));el('alertStream').innerHTML=a.slice(0,3).map(e=>`<div class="alert-entry"><span>${esc(e.time)}</span><b>${esc(e.symbol)}</b><em>${rules[e.findings[0].code].name} · ${e.findings[0].observed}</em><strong class="${e.severity==='high'?'alert-high':'alert-med'}">${e.severity.toUpperCase()}</strong></div>`).join('')||'<div class="empty">NO ALERTS</div>';}
  function renderInspector(){const e=currentSelection();if(!e){el('inspectorStatus').textContent='AWAITING SELECTION';el('inspector').innerHTML='<div class="inspector-placeholder">Select an event in the blotter to inspect rules, source provenance, and supporting evidence.</div>';return}el('inspectorStatus').textContent=e.id;const desc=e.findings.length?e.findings.map(f=>`<div class="evidence-rule"><b>${f.code} / ${rules[f.code].name.toUpperCase()}</b><span>Observed: <strong>${esc(f.observed)}</strong><br>Threshold: ${esc(rules[f.code].threshold)}<br>Rule version: v2.1 · event: ${esc(e.id)}</span></div>`).join(''):'<div class="evidence-normal">✓ No active detection rules were exceeded for this event.</div>';el('inspector').innerHTML=`<div class="inspect-symbol"><div><strong>${esc(e.symbol)}</strong><small>${esc(e.type)} / ${esc(e.venue)} / ${esc(e.time)} ET</small></div><div class="inspect-score">${e.score}<small>ANOMALY / 100</small></div></div><div class="inspector-divider"></div><div class="inspect-fields"><div class="inspect-field"><small>EVENT ID</small><b>${esc(e.id)}</b></div><div class="inspect-field"><small>SEVERITY</small><b class="${e.severity==='high'?'neg':e.severity==='medium'?'':'pos'}">${e.severity.toUpperCase()}</b></div><div class="inspect-field"><small>LAST PRICE</small><b>${money(e.price)}</b></div><div class="inspect-field"><small>${e.type==='QUOTE'?'ASK SIZE':'EVENT SIZE'}</small><b>${qfmt(e.quantity)}</b></div><div class="inspect-field"><small>VOLUME FACTOR</small><b>${e.volumeRatio.toFixed(2)}×</b></div><div class="inspect-field"><small>PRICE MOVE</small><b class="${e.priceMove>=0?'pos':'neg'}">${signed(e.priceMove)}</b></div></div><div class="inspector-divider"></div><div class="evidence-head">DETECTION EVIDENCE <span style="color:#7f929b">/ ${e.findings.length} TRIGGER${e.findings.length===1?'':'S'}</span></div>${desc}${e.marketData?`<div class="market-provenance"><strong>OBSERVATION PROVENANCE</strong><dl><div><dt>PROVIDER / FEED</dt><dd>${esc(e.marketData.provider)} / ${esc(e.marketData.feed)} · ${esc(e.transport||'unknown')}</dd></div><div><dt>EXCHANGE EVENT TIME</dt><dd>${esc(e.marketData.exchangeEventTime||'Not supplied')}</dd></div><div><dt>BACKEND INGESTION</dt><dd>${esc(e.marketData.ingestedAt||'Not supplied')}</dd></div><div><dt>COVERAGE</dt><dd>${esc(e.marketData.coverage||'Unknown')}</dd></div></dl></div>`:''}<div class="inspect-bottom"><span>SOURCE: ${esc(e.source)} · ${state.mode==='DEMO'?'RULESET V2.1':'EXPLORATORY VOL RULE V1'}</span><button type="button" id="blotterOpenCase" class="review-button">↗ INVESTIGATE</button><button type="button" id="review" class="review-button ${state.reviewed.has(e.id)?'done':''}">${state.reviewed.has(e.id)?'✓ REVIEWED':'MARK REVIEWED'}</button></div>`;el('blotterOpenCase').addEventListener('click',()=>window.TradeScopeCases?.createFromBlotter?.());el('review').addEventListener('click',()=>{state.reviewed.has(e.id)?state.reviewed.delete(e.id):state.reviewed.add(e.id);renderInspector()});}
  function updateToggle(){el('allEvents').classList.toggle('active',!state.flagsOnly);el('flaggedOnly').classList.toggle('active',state.flagsOnly);}
  function render(){renderMetrics();renderWatch();renderHeatmap();renderFlow();renderChart();renderTable();renderSignals();renderInspector();updateToggle();}
  function stop(){if(state.timer!==null){clearInterval(state.timer);state.timer=null;}}
  function schedule(){stop();if(!state.running||state.revealed>=fixture.length)return;state.timer=setInterval(()=>{state.revealed=Math.min(fixture.length,state.revealed+1);if(state.revealed===fixture.length){state.running=false;stop();}render();},Math.max(100,550/state.speed));}
  function reset(){if(state.mode!=='DEMO')return;stop();state.revealed=68;state.running=false;state.selectedId=now().filter(e=>e.severity==='high').at(-1)?.id||now().at(-1)?.id;state.reviewed.clear();render();}
  function exportCsv(){const head=['id','time_et','symbol','event_type','price_usd','quantity','venue','anomaly_score','severity','trigger_codes','reviewed','source'];const items=filtered().map(x=>[x.id,x.time,x.symbol,x.type,x.price.toFixed(4),x.quantity,x.venue,x.score,x.severity,x.findings.map(f=>f.code).join('|'),state.reviewed.has(x.id)?'yes':'no',x.source]);const csv=[head,...items].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tradescope-terminal-'+state.mode.toLowerCase()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),250);}
  function activateNav(v){state.nav=v;document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.nav===v));if(v==='signals'){state.flagsOnly=true;updateToggle();renderTable();el('blotterPanel').scrollIntoView({behavior:'smooth',block:'center'});}else if(v==='blotter'){state.flagsOnly=false;updateToggle();renderTable();el('blotterPanel').scrollIntoView({behavior:'smooth',block:'center'});}else if(v==='replay'){el('play').focus();}else{window.scrollTo({top:0,behavior:'smooth'});}}
  tickers.forEach(t=>{const option=document.createElement('option');option.value=t.symbol;option.textContent=t.symbol;el('symbolFilter').appendChild(option);});
  el('search').addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();renderTable();});
  el('symbolFilter').addEventListener('change',e=>{state.symbolFilter=e.target.value;if(state.symbolFilter!=='ALL')state.symbol=state.symbolFilter;render();});
  el('eventFilter').addEventListener('change',e=>{state.eventFilter=e.target.value;renderTable()});
  el('clearFilters').addEventListener('click',()=>{state.symbolFilter='ALL';state.eventFilter='ALL';state.search='';state.flagsOnly=false;el('symbolFilter').value='ALL';el('eventFilter').value='ALL';el('search').value='';render();});
  el('allEvents').addEventListener('click',()=>{state.flagsOnly=false;render()});
  el('flaggedOnly').addEventListener('click',()=>{state.flagsOnly=true;render()});
  el('filterSignals').addEventListener('click',()=>activateNav('signals'));
  el('speed').addEventListener('change',e=>{state.speed=Number(e.target.value);schedule()});
  el('play').addEventListener('click',()=>{if(state.mode!=='DEMO')return;if(state.revealed===fixture.length){reset();}state.running=!state.running;renderMetrics();schedule()});
  el('reset').addEventListener('click',reset);
  el('export').addEventListener('click',exportCsv);
  document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>activateNav(b.dataset.nav)));
  document.querySelectorAll('.chart-tabs button').forEach(b=>b.addEventListener('click',()=>{state.range=b.dataset.range;document.querySelectorAll('.chart-tabs button').forEach(n=>n.classList.toggle('active',n===b));renderChart()}));
  function setDataset(mode,entries,snapshotPrices={},metadata={}){stop();state.transport=metadata.transport||'polling';state.feed=metadata.feed||'iex';state.realSource=metadata.source||entries.at(-1)?.source||(mode==='DEMO'?'SYNTHETIC_FIXTURE_V2':'ALPACA_IEX');const changed=state.mode!==mode;state.running=false;state.mode=mode;fixture=mode==='DEMO'?syntheticFixture:entries;state.revealed=mode==='DEMO'?68:fixture.length;if(changed){state.reviewed.clear();state.symbolFilter='ALL';state.eventFilter='ALL';state.flagsOnly=false;state.search='';el('symbolFilter').value='ALL';el('eventFilter').value='ALL';el('search').value='';}tickers.forEach((t,i)=>{if(mode==='DEMO'){Object.assign(t,originalTickerData[i]);}else{t.base=snapshotPrices[t.symbol]?.price??null;t.delta=snapshotPrices[t.symbol]?.change??null;}});if(mode!=='DEMO'&&fixture.length){const last=fixture.at(-1);if(last&&bySymbol[last.symbol].base==null){bySymbol[last.symbol].base=last.price;}}const visible=now();const selected=visible.find(e=>e.id===state.selectedId);if(changed||!selected){state.selectedId=visible.at(-1)?.id||null;state.symbol=visible.at(-1)?.symbol||'NVDA';}renderTickers();render();}
  window.TradeScope={setDataset,getMode:()=>state.mode,getSelection:()=>{const e=currentSelection();return e?{...e,findings:(e.findings||[]).map(x=>({...x})),synthetic:state.mode==='DEMO'}:null;}};
  renderTickers();state.selectedId=now().filter(e=>e.severity==='high').at(-1)?.id || now().at(-1)?.id;state.symbol=now().find(e=>e.id===state.selectedId)?.symbol || 'NVDA';render();
})();
