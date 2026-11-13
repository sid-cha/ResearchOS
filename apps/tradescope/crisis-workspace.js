/* Source-linked historical risk case studies; curated hypotheses only. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowedUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
 let catalog=null,selected=null,requestId=0;
 const status=(msg,bad=false)=>{const el=$('crisisStatus');if(el){el.textContent=msg;el.classList.toggle('is-error',bad);}};
 async function read(url){
  const res=await fetch(url,{cache:'no-store'});const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'Historical research service unavailable');return data;
 }
 const links=ids=>ids.map(s=>{const href=allowedUrl(s.url);return href?'<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(s.name)+'</a>':safe(s.name);}).join(' · ');
 function detail(data){
  const node=$('crisisDetail'),item=data.case||{},pathways=Array.isArray(data.pathways)?data.pathways:[],sources=Array.isArray(data.sources)?data.sources:[];
  const sourceMap=new Map(sources.map(x=>[x.id,x]));
  node.innerHTML='<div class="crisis-section"><span class="crisis-label">'+safe(item.kind==='retrospective_crisis'?'RETROSPECTIVE CRISIS':'CLIMATE / ECONOMIC SCENARIO')+'</span>'+
   '<h4>'+safe(item.title)+'</h4>'+
   (item.anchorDate?'<p><strong>REFERENCE MILESTONE:</strong> '+safe(item.anchorDate)+' · '+safe(item.anchorMeaning)+'</p>':'<p><strong>SCENARIO:</strong> '+safe(item.anchorMeaning)+'</p>')+
   '<p>'+safe(item.historicalOutcome)+'</p></div>'+
   '<div class="crisis-section"><h4>Warning candidates · not reconstructed historical alerts</h4>'+
   (item.candidateSignals||[]).map(signal=>'<article class="crisis-signal"><strong>'+safe(signal.name)+'</strong>'+
    '<p><b>Potential lead:</b> '+safe(signal.lead)+'</p><p><b>Interpretation:</b> '+safe(signal.interpretation)+'</p>'+
    '<div class="crisis-citations">'+links((signal.sourceIds||[]).map(x=>sourceMap.get(x)).filter(Boolean))+'</div></article>').join('')+'</div>'+
   '<div class="crisis-section"><h4>Potential transmission pathways</h4>'+
   pathways.map(path=>'<article class="crisis-pathway"><h5>'+safe(path.name)+'</h5><div class="crisis-chain">'+
    path.nodes.map((node,index)=>'<span>'+safe(node)+'</span>').join('<span aria-hidden="true">→</span>')+
    '</div><p><strong>Indicators to investigate:</strong> '+safe((path.indicators||[]).join(' · '))+'</p>'+
    '<p><strong>Validation design:</strong> '+safe(path.test)+'</p></article>').join('')+'</div>'+
   '<div class="crisis-section"><h4>Research integrity and next data requirements</h4>'+
   '<p class="crisis-warning">No crash risk score is available: '+safe(data.evidenceStatus||'Not measured')+'. Source references do not prove what an analyst could see at the time.</p>'+
   '<ul>'+(data.validationRequired||[]).map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul>'+
   '<div class="crisis-citations"><strong>Source references:</strong> '+links(sources)+'</div></div>';
  if(item.kind==='retrospective_crisis'){
   const initial=item.id==='financial-2008'?'2007-08-01':'2020-02-01';
   node.insertAdjacentHTML('beforeend','<section class="crisis-section" id="crisisMacroSection"><h4>Point-in-time macro intelligence · research preview</h4>'+
    '<p>Inspect ALFRED observations as visible at the end of a historical calendar date. These are exploratory rules, not validated crash forecasts. Original intraday release timestamps are not verified.</p>'+
    '<div class="crisis-macro-controls"><label for="crisisMacroDate">HISTORICAL AS-OF DATE</label><input id="crisisMacroDate" type="date" min="2005-01-01" value="'+initial+'">'+
    '<button type="button" id="crisisMacroRun">RECONSTRUCT INDICATORS</button></div><p id="crisisMacroStatus" role="status">Choose a date to request sourced macro vintages. Server FRED_API_KEY required.</p><div id="crisisMacroResults"></div></section>');
  }
  if(item.kind==='retrospective_crisis'){
   const is2008=item.id==='financial-2008';
   node.insertAdjacentHTML('beforeend','<section class="crisis-section" id="crisisReplaySection">'+
    '<h4>Historical early-warning replay · v0.16</h4><p>Replay fixed candidate macro-warning rules over a bounded series of historical dates, then compare with strictly subsequent SPY market outcomes where sourced. This is not a trained forecast.</p>'+
    '<div class="crisis-macro-controls"><label>START <input type="date" id="crisisReplayStart" value="'+(is2008?'2007-06-01':'2020-01-03')+'"></label>'+
    '<label>END <input type="date" id="crisisReplayEnd" value="'+(is2008?'2007-09-06':'2020-04-03')+'"></label>'+
    '<label>CADENCE <select id="crisisReplayCadence"><option value="7">7 calendar days</option><option value="14" selected>14 calendar days</option><option value="28">28 calendar days</option></select></label>'+
    '<label>FORWARD HORIZON <select id="crisisReplayHorizon"><option value="5">5 sessions</option><option value="20" selected>20 sessions</option><option value="63">63 sessions</option></select></label>'+
    '<label>LOSS THRESHOLD <select id="crisisReplayThreshold"><option value="5">5%</option><option value="10" selected>10%</option><option value="20">20%</option></select></label>'+
    '<button type="button" id="crisisReplayRun">REPLAY WARNING HISTORY</button></div>'+
    '<p id="crisisReplayStatus" role="status">Historical source credentials are required. The 2008 preset requires separately entitled, server-side long-history SPY data for market outcome labels.</p>'+
    '<div id="crisisReplayResults"></div></section>');
  }
  if(item.kind!=='retrospective_crisis'){
   node.insertAdjacentHTML('beforeend','<section class="crisis-section" id="crisisClimateSection">'+
    '<h4>NOAA CPC historical ENSO evidence</h4><p>View the latest eligible original-dated ENSO discussion visible in the official archive on your selected historical calendar date. Archive page revision and intraday first-publication time have not been independently authenticated.</p>'+
    '<div class="crisis-macro-controls"><label for="crisisClimateAsOf">HISTORICAL AS-OF DATE</label><input id="crisisClimateAsOf" type="date" min="2001-01-01" value="2020-02-15">'+
    '<button type="button" id="crisisClimateRun">LOAD NOAA DISCUSSION</button></div>'+
    '<p id="crisisClimateStatus" role="status">Select a date to inspect sourced ENSO discussion evidence; no crop or equity impact is inferred.</p><div id="crisisClimateResults"></div></section>');
  }
  selected=item.id||null;
 }
 async function open(id){
  if(!id)return;const token=++requestId;status('Loading source references and transmission hypotheses…');
  try{const data=await read('/api/crisis/case?id='+encodeURIComponent(id));if(token!==requestId)return;detail(data);
   status('Loaded '+(data.case?.title||'case')+'. Dated original releases, model validation and company exposure are not yet ingested.');
  }catch(error){if(token===requestId)status(error.message,true);}
 }
 async function load(){
  const token=++requestId;status('Loading historical crisis and climate research catalog…');
  try{
   const result=await read('/api/crisis/catalog');if(token!==requestId)return;
   if(!Array.isArray(result.cases)||result.coverage?.calibratedPredictions!==false)throw Error('Unexpected historical case metadata');
   catalog=result;
   $('crisisSelect').innerHTML=result.cases.map(c=>'<option value="'+safe(c.id)+'">'+safe(c.title)+'</option>').join('');
   $('crisisCases').innerHTML=result.cases.map(c=>'<button type="button" data-crisis-id="'+safe(c.id)+'" class="crisis-case">'+
    '<strong>'+safe(c.title)+'</strong><small>'+safe(c.kind==='retrospective_crisis'?'Historical crisis · retrospective':'Mechanism scenario · not an observed crisis')+'</small></button>').join('');
   status(result.cases.length+' research cases loaded · no verified vintage replay or calibrated predictions.');
   const chosen=result.cases.find(c=>c.id===selected)?.id||result.cases[0]?.id;
   if(chosen){$('crisisSelect').value=chosen;await open(chosen);}
  }catch(error){if(token===requestId)status(error.message,true);}
 }

 async function loadMacro(){
  const date=$('crisisMacroDate')?.value,button=$('crisisMacroRun'),output=$('crisisMacroResults'),message=$('crisisMacroStatus');
  if(!button||!output||!message)return;
  const caseId=selected,token=requestId;button.disabled=true;message.textContent='Checking historical ALFRED vintages…';output.replaceChildren();
  try{
   const data=await read('/api/macro/snapshot?asOf='+encodeURIComponent(date));
   if(requestId!==token||selected!==caseId||!$('crisisMacroResults'))return;
   if(data.asOf!==date||!Array.isArray(data.observations)||!Array.isArray(data.earlyWarning?.rules))throw Error('Unexpected macro vintage payload');
   const byId=new Map(data.observations.map(x=>[x.id,x]));
   const rows=data.earlyWarning.rules.map(rule=>{
    const obs=byId.get(rule.id),valid=obs?.status==='available'&&typeof obs.value==='number';
    return '<tr><th>'+safe(rule.label)+'</th><td>'+safe(valid?obs.value+' '+rule.unit:'UNAVAILABLE')+'</td><td>'+safe(valid?obs.observationDate:'—')+'</td><td>'+safe(rule.status.replaceAll('_',' ').toUpperCase())+'</td></tr>';
   }).join('');
   output.innerHTML='<p><strong>'+safe(data.earlyWarning.availableRules)+' / '+safe(data.earlyWarning.totalRules)+' usable indicators · '+safe(data.earlyWarning.triggeredRules)+' exploratory warning candidates</strong></p>'+
    '<div class="crisis-macro-table"><table><thead><tr><th>Indicator</th><th>As-of value</th><th>Observed</th><th>Rule state</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p>'+safe(data.earlyWarning.warning)+'</p><p>Source: <a target="_blank" rel="noopener noreferrer" href="https://fred.stlouisfed.org/docs/api/fred/realtime_period.html">ALFRED real-time vintage methodology</a>. Values are end-of-calendar-day snapshots, not timed release-event reconstruction.</p>';
   message.textContent='Historical as-of snapshot retrieved for '+date+'. No forward-filled values or calibrated prediction.';
  }catch(error){if(requestId===token&&selected===caseId)message.textContent=error.message;}
  finally{if($('crisisMacroRun')===button)button.disabled=false;}
 }

 function renderReplay(data){
  const node=$('crisisReplayResults');
  const coverage=data.coverage||{},stats=data.outcomes||{},timeline=Array.isArray(data.timeline)?data.timeline:[];
  const label=state=>String(state||'unavailable').replaceAll('_',' ').toUpperCase();
  const percent=value=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(2)+'%':'—';
  const rows=timeline.map(row=>{
   const signal=row.signal==='candidate_warning'?'CANDIDATE WARNING':row.signal==='insufficient_data'?'INSUFFICIENT':'NO COMPOSITE WARNING';
   const market=row.market?.status==='measured'?percent(row.market.worstReturnPct):
    'UNAVAILABLE';
   return '<tr><td>'+safe(row.asOf)+'</td><td>'+safe(signal)+'</td><td>'+safe(row.triggeredIndicators+'/'+row.usableIndicators)+'</td>'+
    '<td>'+safe(market)+'</td><td>'+safe(row.market?.status==='measured'?(row.market.eventOccurred?'DRAW DOWN REACHED':'NOT REACHED'):row.market?.reason||'No outcome')+'</td></tr>';
  }).join('');
  const values=timeline.filter(r=>r.market?.status==='measured').map(r=>({date:r.asOf,loss:r.market.worstReturnPct,warning:r.signal==='candidate_warning'}));
  const min=values.length?Math.min(-1,...values.map(x=>x.loss)):null;
  const plot=values.length?'<div class="crisis-replay-plot" role="img" aria-label="Worst forward SPY close return after each historical decision date.">'+
   values.map(v=>'<div class="crisis-replay-point"><span class="crisis-replay-date">'+safe(v.date.slice(5))+'</span>'+
    '<span class="crisis-replay-track"><span class="crisis-replay-bar '+(v.warning?'is-warning':'')+'" style="width:'+Math.min(100,Math.max(0,Math.abs(Math.min(v.loss,0))/Math.abs(min)*100)).toFixed(1)+'%"></span></span>'+
    '<strong>'+safe(percent(v.loss))+'</strong></div>').join('')+'</div>':'<p class="crisis-warning">No verified market outcome bars for this window. Signal replay can still be inspected without inferred returns.</p>';
  node.innerHTML='<div class="crisis-replay-summary"><div><small>SAMPLED DECISIONS</small><strong>'+safe(coverage.totalDecisions)+'</strong></div>'+
   '<div><small>WARNING CANDIDATES</small><strong>'+safe(coverage.warningDecisions)+'</strong></div>'+
   '<div><small>MARKET-LABELLED</small><strong>'+safe(coverage.benchmarkLabelledDecisions)+'</strong></div>'+
   '<div><small>INDEPENDENT SAMPLES</small><strong>'+safe(coverage.independentLabelledDecisions)+'</strong></div></div>'+
   '<p><strong>Outcome rate status:</strong> '+safe(label(stats.ratesStatus))+'. Precision, recall and false-alarm rates are withheld unless sufficient non-overlapping observations exist.</p>'+
   '<h5>Worst subsequent SPY closing return by sampled decision</h5>'+plot+
   '<div class="crisis-macro-table"><table><thead><tr><th>Decision</th><th>Signal</th><th>Triggered / usable</th><th>Worst forward</th><th>Outcome</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<p><strong>Definitions:</strong> '+safe(data.compositeRule)+'. Labels use the next available session close as entry, then '+safe(data.window?.horizonSessions)+' subsequent closing sessions. Threshold '+safe(data.window?.lossThresholdPct)+'%.</p>'+
   '<p><strong>Data:</strong> ALFRED historical calendar-day macro vintages; '+safe(coverage.benchmarkStatus)+'. No trading strategy, crash probability, or model training is claimed.</p>'+
   '<details><summary>Study limitations</summary><ul>'+(data.limitations||[]).map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul></details>';
 }
 async function replayWarningHistory(){
  const node=$('crisisReplayResults'),button=$('crisisReplayRun'),message=$('crisisReplayStatus');
  if(!node||!button||!message)return;
  const caseId=selected,token=requestId;
  const params=new URLSearchParams({case:caseId,start:$('crisisReplayStart').value,end:$('crisisReplayEnd').value,
   cadence:$('crisisReplayCadence').value,horizon:$('crisisReplayHorizon').value,threshold:$('crisisReplayThreshold').value});
  button.disabled=true;message.textContent='Reconstructing point-in-time macro decisions and checking market label coverage…';
  node.replaceChildren();
  try{
   const data=await read('/api/backtest/replay?'+params);
   if(token!==requestId||selected!==caseId||!$('crisisReplayResults'))return;
   if(data.caseId!==caseId||!Array.isArray(data.timeline)||data.calibratedForecast!==false)
    throw Error('Unexpected historical study payload');
   renderReplay(data);
   message.textContent='Historical replay complete · '+data.coverage.totalDecisions+' sampled decision dates. Results are retrospective research only.';
  }catch(error){if(token===requestId&&selected===caseId)message.textContent=error.message;}
  finally{if($('crisisReplayRun')===button)button.disabled=false;}
 }

 async function loadClimateEvidence(){
  const button=$('crisisClimateRun'),message=$('crisisClimateStatus'),output=$('crisisClimateResults'),date=$('crisisClimateAsOf')?.value;
  if(!button||!message||!output)return;
  const token=requestId,caseId=selected;button.disabled=true;message.textContent='Retrieving historical NOAA CPC discussion…';
  output.replaceChildren();
  try{
   const data=await read('/api/climate/enso?asOf='+encodeURIComponent(date));
   if(token!==requestId||selected!==caseId||!$('crisisClimateResults'))return;
   if(data.asOf!==date||data.calibratedForecast!==false||!Array.isArray(data.attemptedMonths))throw Error('Unexpected NOAA historical evidence response');
   const item=data.discussion;
   output.innerHTML=item?
    '<article class="crisis-signal"><strong>'+safe(item.source)+' · issued '+safe(item.issueDate)+'</strong>'+
    '<p>'+safe(item.synopsis)+'</p><p><b>Evidence status:</b> '+safe(data.evidenceStatus)+
    '</p><p>Original intraday release and HTML revision verified: NO. No verified issuer exposure, crop yield, or market forecast.</p>'+
    '<div class="crisis-citations"><a href="'+safe(allowedUrl(item.sourceUrl)||'#')+'" target="_blank" rel="noopener noreferrer">Official NOAA CPC source</a></div></article>':
    '<p class="crisis-warning">No eligible official historical discussion was retrieved. No forecast was fabricated.</p>';
   message.textContent=item?'Found source-dated NOAA discussion for '+item.issueDate+'. Publication clock and historical page version are not independently verified.':
    'No eligible source discussion found for '+date+'.';
  }catch(error){if(requestId===token&&selected===caseId)message.textContent=error.message;}
  finally{if($('crisisClimateRun')===button)button.disabled=false;}
 }
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisClimateRun'))void loadClimateEvidence();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisReplayRun'))void replayWarningHistory();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisMacroRun'))void loadMacro();});
 $('crisisLoad')?.addEventListener('click',()=>void load());
 $('crisisOpen')?.addEventListener('click',()=>void open($('crisisSelect').value));
 $('crisisCases')?.addEventListener('click',event=>{const id=event.target.closest?.('[data-crisis-id]')?.dataset.crisisId;
  if(id){$('crisisSelect').value=id;void open(id);}});
 document.addEventListener('tradescope:research-tab',event=>{if(event.detail?.tab==='crisis'&&!catalog)void load();});
})();
