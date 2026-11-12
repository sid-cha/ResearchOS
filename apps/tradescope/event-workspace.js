/* TradeScope Event Intelligence — display only; all external requests go through localhost. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const safeLink=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null;}};
const sample=[
 {id:'hypo:001',category:'CORPORATE',type:'COMPANY_NEWS',headline:'HYPOTHETICAL: consumer-device company lowers quarterly revenue guidance',publishedAt:'2026-10-16T14:00:00Z',occurredAt:null,source:'SYNTHETIC SCENARIO',sourceUrl:null,symbols:['AAPL'],summary:'Illustration only: the report could lead investors to revise growth assumptions. No actual claim about AAPL.',evidenceLevel:'synthetic'},
 {id:'hypo:002',category:'NATURAL',type:'EARTHQUAKE',headline:'HYPOTHETICAL: earthquake disrupts an industrial corridor',publishedAt:null,occurredAt:'2026-10-17T05:15:00Z',source:'SYNTHETIC SCENARIO',sourceUrl:null,symbols:[],summary:'Illustration only: no verified exposure to any listed company. A location-to-facility model would be needed.',evidenceLevel:'synthetic'},
 {id:'hypo:003',category:'GEOPOLITICAL',type:'GEOPOLITICAL_REPORT',headline:'HYPOTHETICAL: new technology export-control proposal',publishedAt:'2026-10-18T11:15:00Z',occurredAt:null,source:'SYNTHETIC SCENARIO',sourceUrl:null,symbols:[],summary:'Illustration only: do not associate a security with a policy announcement without verifiable commercial exposure.',evidenceLevel:'synthetic'},
 {id:'hypo:004',category:'CORPORATE',type:'FILING',headline:'HYPOTHETICAL: quarterly filing signals operating-margin contraction',publishedAt:'2026-10-19T20:30:00Z',occurredAt:null,source:'SYNTHETIC SCENARIO',sourceUrl:null,symbols:['AAPL'],summary:'Illustration only: a change in margins may affect valuation models depending on consensus expectations.',evidenceLevel:'synthetic'}
];
const defaults={close:238.15,sma20:241.32,sma50:232.19,rsi14:46.21,macd:-1.18,macdSignal:-0.62,atr14:4.31,volumeRatio20:1.52,barsCount:120};
// Event records and each research panel have independent source states.
const state={records:sample.slice(),eventGroups:new Map(),selection:sample[0].id,category:'ALL',query:'',symbol:'AAPL',mode:'SYNTHETIC',eventsCheckedAt:null,indicators:{...defaults},forecast:null,technicalSymbol:null,fundamentals:null,financialSymbol:null,filings:[],study:null,generation:0,activeRequest:null};
function setStatus(text,tone=''){const e=$('intelStatus');e.textContent=text;e.className='intel-status '+tone;}
function markMode(){const e=$('intelMode');e.textContent=state.mode==='SYNTHETIC'?'SYNTHETIC EXAMPLE':state.records.length?'SOURCED DATA · LOCAL':'SOURCE CHECKED · NO RECORDS';e.classList.toggle('real',state.mode!=='SYNTHETIC');$('intelUpdated').textContent=state.mode==='SYNTHETIC'?'Illustrative event scenarios; research panels identify their own sources':`Event sources checked ${dateTime(state.eventsCheckedAt)}`;}
const dateTime=t=>t&&Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):'Time unavailable';
const number=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'N/A';
const usd=v=>typeof v==='number'&&Number.isFinite(v)?(Math.abs(v)>=1e9?`$${number(v/1e9)}B`:Math.abs(v)>=1e6?`$${number(v/1e6)}M`:`$${number(v,2)}`):'Unavailable';
const fmtPct=v=>typeof v==='number'&&Number.isFinite(v)?`${v>=0?'+':''}${number(v)}%`:'N/A';
const selected=()=>state.records.find(x=>x.id===state.selection)||null;
const eventTime=e=>e?.publishedAt||e?.occurredAt||null;
function renderEvents(){const rows=state.records.filter(e=>(state.category==='ALL'||e.category===state.category)&&`${e.headline} ${e.source} ${(e.symbols||[]).join(' ')}`.toLowerCase().includes(state.query));$('intelCount').textContent=`${rows.length} / ${state.records.length} RECORDS`;
 $('intelEventRows').innerHTML=rows.length?rows.map(e=>`<button type="button" class="intel-event ${e.id===state.selection?'active':''}" data-intel-id="${esc(e.id)}"><span class="e-top"><span>${esc(e.category)} / ${esc(e.source)}</span><time>${esc(dateTime(eventTime(e)))}</time></span><span class="e-title">${esc(e.headline)}</span><span class="e-meta">${esc((e.symbols||[]).join(', ')||'NO VERIFIED TICKER LINK')} · ${esc(e.evidenceLevel||'unclassified')}</span></button>`).join(''):state.records.length?'<div class="intel-empty">No matching events. Clear the category/search filters to show loaded records.</div>':'<div class="intel-empty">No sourced event records loaded. Load news, SEC filings, hazards or GDELT reports, or choose DEMO SCENARIOS. Technical indicators and fundamentals load separately.</div>';
 $('intelEventRows').querySelectorAll('[data-intel-id]').forEach(b=>b.addEventListener('click',()=>{state.selection=b.dataset.intelId;state.study=null;render();}));}
function renderInspector(){const e=selected();if(!e){$('intelInvestigation').innerHTML='<div class="intel-empty">No event selected. Load an event source or choose DEMO SCENARIOS to inspect an illustration.</div>';return;}
 const url=safeLink(e.sourceUrl);const directlyLinked=(e.symbols||[]).includes(state.symbol);
 const rows=[['EVENT ID',e.id],['PUBLISHED / FIRST SEEN',dateTime(e.publishedAt)],['OCCURRED',dateTime(e.occurredAt)],['SOURCE',e.source],['SOURCE CONFIDENCE',e.evidenceLevel||'unclassified'],['VERIFIED SYMBOL LINK',directlyLinked?'Provider explicitly tags '+state.symbol:'Not established for '+state.symbol],['RESEARCH CONTEXT',e.summary||'No summary available']];
 $('intelInvestigation').innerHTML=`<div class="intel-investigation"><div class="intel-inspect-type">${esc(e.category)} / ${esc(e.type||'EVENT')}</div><h3>${esc(e.headline)}</h3>${rows.map(([k,v])=>`<div class="intel-fact-row"><label>${esc(k)}</label><strong>${esc(v)}</strong></div>`).join('')}<div class="intel-fact-row"><label>ORIGINAL SOURCE</label><strong>${url?`<a target="_blank" rel="noopener noreferrer" href="${esc(url)}">OPEN SOURCE ↗</a>`:'Unavailable / synthetic'}</strong></div><div class="intel-warning">${e.id.startsWith('hypo:')?'Illustrative scenario. Not a real event.': directlyLinked?'Symbol tagging indicates topical relevance only; it does not establish price causation.':'This event is NOT linked to the selected security by verified exposure. Running a study is exploratory, not an impact determination.'}</div></div>`;
}
function renderStudy(){const e=$('intelStudy');const s=state.study;if(!s){e.innerHTML='<div class="intel-empty">Event study not run. Choose a real timestamped event and click RUN REAL EVENT STUDY.</div>';return;}
 const study=s.study;if(study.status!=='observed'){e.innerHTML=`<div class="intel-empty">${esc(study.reason||'Insufficient completed market sessions.')}<br>Source: ${esc(s.source||'provider')}</div>`;return;}
 e.innerHTML=`<p class="intel-note">Reference close: ${esc(study.referenceSession)} · First subsequent completed session: ${esc(study.firstPostEventSession)} · ${esc(s.source)}</p><div class="intel-study-grid">${study.horizons.map(h=>`<div class="intel-study-card"><small>${h.sessions} SESSION${h.sessions===1?'':'S'} / RELATIVE</small><strong class="${h.relativeReturnPct>0?'intel-positive':h.relativeReturnPct<0?'intel-negative':'intel-neutral'}">${h.status==='observed'?fmtPct(h.relativeReturnPct):'PENDING'}</strong><span>${h.status==='observed'?`Stock ${fmtPct(h.stockReturnPct)} · SPY ${fmtPct(h.benchmarkReturnPct)}`:'Awaiting completed bars'}</span></div>`).join('')}</div><p class="intel-note">First subsequent session volume vs earlier ~20 sessions: ${study.firstSessionVolumeRelative20==null?'N/A':number(study.firstSessionVolumeRelative20)+'×'}</p><p class="intel-note">${esc(study.method)}</p><div class="intel-warning">${study.limitations.map(esc).join(' ')}</div>`;
}
function renderIndicators(){const forecast=state.forecast;$('intelForecast').innerHTML=forecast?.status==='baseline'?`<small>ONE-SESSION EWMA VOLATILITY BASELINE</small><strong>${number(forecast.volatilityEstimatePct)}%</strong><small>Walk-forward abs-return MAE: ${number(forecast.walkForwardAbsReturnMaePct)} pp / ${forecast.validationSessions} sessions · no direction forecast</small>`:forecast?.status==='insufficient_data'?`<small>Insufficient market bars for the volatility baseline: ${esc(forecast.observedBars??state.indicators.barsCount??0)} observed; ${esc(forecast.minimumBars??46)} required. No directional prediction is supplied.</small>`:'<small>One-session volatility baseline not yet loaded from market bars.</small>';const keys=[['CLOSE','close'],['SMA 20','sma20'],['SMA 50','sma50'],['RSI 14','rsi14'],['MACD','macd'],['SIGNAL','macdSignal'],['ATR 14','atr14'],['VOL / 20D','volumeRatio20'],['BAR COUNT','barsCount']];$('intelIndicators').innerHTML=keys.map(([name,k])=>`<div class="intel-indicator"><small>${name}</small><strong>${k==='barsCount'?state.indicators[k]??'N/A':number(state.indicators[k])}${k==='volumeRatio20'&&state.indicators[k]!=null?'×':''}</strong></div>`).join('');}
function renderFundamentals(){const f=state.fundamentals;if(!f){$('intelFundamentals').innerHTML='<div class="intel-empty">No real financial statement fetched yet. Click SEC FILINGS + FUNDAMENTALS to load reported financial results.</div>';return;}
 const q=f.quarterly||{},r=f.ratios||{};
 const rows=[['REVENUE / QUARTER',usd(q.revenue?.value)],['REVENUE / YOY',fmtPct(q.revenue?.yoyPct)],['NET INCOME / Q',usd(q.netIncome?.value)],['DILUTED EPS / Q',q.epsDiluted?.value==null?'N/A':'$'+number(q.epsDiluted.value)],['GROSS MARGIN / Q',fmtPct(r.quarterGrossMarginPct)],['OPERATING MARGIN / Q',fmtPct(r.quarterOperatingMarginPct)],['NET MARGIN / Q',fmtPct(r.quarterNetMarginPct)],['REPORTED PERIOD END',q.revenue?.periodEnd||'N/A'],['FILED',q.revenue?.filingDate||'N/A']];
 $('intelFundamentals').innerHTML=rows.map(([k,v])=>`<div class="intel-fin-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');}
function renderFilings(){$('intelFilingRows').innerHTML=state.filings.length?state.filings.map(f=>`<div class="intel-filing"><strong>${safeLink(f.sourceUrl)?`<a href="${esc(safeLink(f.sourceUrl))}" rel="noopener noreferrer" target="_blank">${esc(f.form)} · ${esc(f.filingDate)} ↗</a>`:`${esc(f.form)} · ${esc(f.filingDate)}`}</strong><span>${esc(f.headline||'Filing')} · period ${esc(f.periodEnd||'N/A')}</span></div>`).join(''):'<div class="intel-empty">No SEC filings loaded.</div>';}
function render(){markMode();renderEvents();renderInspector();renderStudy();renderIndicators();renderFundamentals();renderFilings();}
const current=context=>state.activeRequest===context&&state.generation===context.generation&&!context.controller.signal.aborted;
const cancelled=()=>Object.assign(new Error('Request no longer belongs to the selected security.'),{cancelled:true});
function invalidateRequests(){
 state.generation++;
 if(state.activeRequest){state.activeRequest.controller.abort();$(state.activeRequest.button).disabled=false;state.activeRequest=null;}
}
async function request(path,context){
 const timeout=setTimeout(()=>context.controller.abort(),14000);
 try{
  const response=await fetch(path,{cache:'no-store',signal:context.controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!current(context))throw cancelled();
  if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
  if(data.symbol&&data.symbol!==context.symbol)throw Error('Provider response does not match the selected security.');
  return data;
 }finally{clearTimeout(timeout);}
}
async function run(button,task){
 if(state.activeRequest)return;
 const context={button,symbol:state.symbol,generation:state.generation,controller:new AbortController()};
 state.activeRequest=context;$(button).disabled=true;setStatus(`REQUESTING EXTERNAL DATA / ${context.symbol}…`);
 try{
  const result=await task(context);
  if(current(context))setStatus(result?.message||'Source request completed. Review each panel source.',result?.tone||'ok');
 }catch(error){
  // A security/demo change owns the new status; late responses cannot overwrite it.
  if(state.activeRequest===context&&state.generation===context.generation){
   setStatus(`${context.controller.signal.aborted?'Source request timed out; retry when the provider is available.':error.message}. Other workspaces remain available.`,'error');
  }
 }finally{
  if(state.activeRequest===context){state.activeRequest=null;$(button).disabled=false;render();}
 }
}
function replaceEvents(records,group){
 const previous=state.records.filter(event=>!event.id.startsWith('hypo:')&&state.eventGroups.get(event.id)!==group);
 const map=new Map(previous.map(event=>[event.id,event]));
 state.eventGroups=new Map(previous.map(event=>[event.id,state.eventGroups.get(event.id)]));
 for(const event of records){map.set(event.id,event);state.eventGroups.set(event.id,group);}
 state.records=[...map.values()].sort((a,b)=>String(eventTime(b)||'').localeCompare(String(eventTime(a)||'')));
 state.selection=records[0]?.id||state.records[0]?.id||null;
 state.mode='SOURCED';state.eventsCheckedAt=new Date().toISOString();state.study=null;
}
function sourceResult(count,name){return `${count} sourced ${name} record${count===1?'':'s'} returned.${count===0?' No records returned for this request; try another source or DEMO SCENARIOS.':''}${state.records.length&&count===0?' Previously loaded records from other sources remain visible.':''}`;}
function clearResearch(){
 state.indicators={};state.forecast=null;state.technicalSymbol=null;state.fundamentals=null;state.financialSymbol=null;state.filings=[];state.study=null;
 $('intelTechnicalSource').textContent='NOT LOADED';$('intelFinancialSource').textContent='NOT LOADED';
}
$('intelSymbol').addEventListener('change',event=>{
 invalidateRequests();state.symbol=event.target.value;clearResearch();
 setStatus(`Selected ${state.symbol}. Load technical indicators or SEC fundamentals for this security. Existing event records retain their own ticker tags.`);render();
});
$('intelCategory').addEventListener('change',event=>{state.category=event.target.value;renderEvents();});
$('intelQuery').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();renderEvents();});
$('intelDemo').textContent='↺ DEMO SCENARIOS';
$('intelDemo').addEventListener('click',()=>{
 invalidateRequests();clearResearch();
 Object.assign(state,{records:sample.slice(),eventGroups:new Map(),selection:sample[0].id,category:'ALL',query:'',mode:'SYNTHETIC',eventsCheckedAt:null,indicators:{...defaults}});
 $('intelCategory').value='ALL';$('intelQuery').value='';$('intelTechnicalSource').textContent='DEMO ONLY';
 setStatus('Synthetic scenarios restored; no claims about actual issuer or market movements.');render();
});
$('intelNews').addEventListener('click',()=>run('intelNews',async context=>{
 const data=await request(`/api/intelligence/news?symbol=${context.symbol}`,context);
 const records=Array.isArray(data.events)?data.events:[];replaceEvents(records,'news');
 return {message:sourceResult(records.length,`${data.source||'news'} / ${context.symbol}`)};
}));
$('intelFilings').addEventListener('click',()=>run('intelFilings',async context=>{
 const [filings,facts]=await Promise.allSettled([
  request(`/api/intelligence/filings?symbol=${context.symbol}`,context),
  request(`/api/intelligence/fundamentals?symbol=${context.symbol}`,context)
 ]);
 if(!current(context))throw cancelled();
 const messages=[],errors=[];
 if(filings.status==='fulfilled'){
  state.filings=Array.isArray(filings.value.filings)?filings.value.filings:[];replaceEvents(state.filings,'filings');
  messages.push(sourceResult(state.filings.length,`SEC filing / ${context.symbol}`));
 }else errors.push(`Filings: ${filings.reason.message}`);
 if(facts.status==='fulfilled'){
  state.fundamentals=facts.value;state.financialSymbol=context.symbol;
  const available=Object.values(facts.value.quarterly||{}).some(value=>typeof value?.value==='number'&&Number.isFinite(value.value));
  $('intelFinancialSource').textContent=`SEC XBRL / ${context.symbol} / ${available?'ACTUAL':'NO QUARTERLY FACTS'}`;
  messages.push(available?'Reported SEC fundamentals loaded.':'No usable quarterly SEC fundamentals were returned.');
 }else errors.push(`Fundamentals: ${facts.reason.message}`);
 if(errors.length===2)throw Error(`SEC unavailable: ${errors.join(' ')}`);
 return {message:[...messages,...(errors.length?[`Partial SEC results: ${errors.join(' ')}`]:[])].join(' '),tone:errors.length?'error':'ok'};
}));
$('intelTechnical').addEventListener('click',()=>run('intelTechnical',async context=>{
 const data=await request(`/api/intelligence/technicals?symbol=${context.symbol}&feed=iex`,context);
 state.indicators=data.indicators&&typeof data.indicators==='object'?data.indicators:{};
 state.forecast=data.forecast||null;state.technicalSymbol=context.symbol;
 const available=state.indicators.barsCount>0&&typeof state.indicators.close==='number'&&Number.isFinite(state.indicators.close);
 $('intelTechnicalSource').textContent=`${data.source||'ALPACA_IEX'} / ${context.symbol} / ${available?'REAL BARS':'NO USABLE BARS'}`;
 return {message:available?`${state.indicators.barsCount} market bars loaded for ${context.symbol}. Event scenarios retain their separate source labels; this is not a directional prediction.`:`No usable market bars returned for ${context.symbol}. Indicators remain unavailable; event records are unchanged.`,tone:available?'ok':''};
}));
$('intelHazards').addEventListener('click',()=>run('intelHazards',async context=>{
 const data=await request('/api/intelligence/hazards?source=all',context);
 const records=Array.isArray(data.events)?data.events:[],errors=Array.isArray(data.errors)?data.errors:[];
 if(!records.length&&errors.length)throw Error(`Hazard sources unavailable: ${errors.join('; ')}`);
 replaceEvents(records,'hazards');
 return {message:sourceResult(records.length,'USGS / NASA')+(errors.length?` Partial hazard results: ${errors.join('; ')}`:''),tone:errors.length?'error':'ok'};
}));
$('intelGeo').addEventListener('click',()=>run('intelGeo',async context=>{
 const data=await request(`/api/intelligence/geopolitics?topic=${$('intelTopic').value}`,context);
 const records=Array.isArray(data.events)?data.events:[];replaceEvents(records,'geopolitics');
 return {message:sourceResult(records.length,'GDELT')};
}));
$('intelImpact').addEventListener('click',()=>run('intelImpact',async context=>{
 const event=selected();if(!event||event.id.startsWith('hypo:'))throw Error('First load a real news, filing, hazard or geopolitical record');
 const when=eventTime(event);if(!when)throw Error('Event lacks a usable publication or occurrence timestamp');
 const data=await request(`/api/intelligence/impact?symbol=${context.symbol}&eventTime=${encodeURIComponent(when)}&feed=iex`,context);
 if(state.selection!==event.id)throw Error('The selected event changed while the study loaded. Run the study again for the selected event.');
 state.study=data;
 return {message:data.study?.status==='observed'?`Historical event study loaded for ${context.symbol}: completed-session comparisons against SPY, not a prediction.`:`Historical event study unavailable: ${data.study?.reason||'insufficient completed matching sessions'}`};
}));
window.TradeScopeIntel=Object.freeze({getSelection:()=>({event:selected()?structuredClone(selected()):null,symbol:state.symbol,technicalSource:$('intelTechnicalSource').textContent||'',financialSource:$('intelFinancialSource').textContent||'',technical:state.technicalSymbol===state.symbol?structuredClone(state.indicators):null,fundamentals:state.financialSymbol===state.symbol&&state.fundamentals?structuredClone(state.fundamentals):null,study:state.study?structuredClone(state.study):null})});
const nav=document.querySelector('[data-nav="intel"]');if(nav)nav.addEventListener('click',()=>{$('eventIntel').scrollIntoView({behavior:'smooth',block:'start'});});
render();
})();
