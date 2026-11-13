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
  if(['enso-fertilizer','wildfire-insurance','snow-hydropower'].includes(item.id)){
   const options=item.id==='enso-fertilizer'?
    [['argentina-pampas','Argentina · Pampas point'],['brazil-south','Brazil · Southern point']]:
    item.id==='wildfire-insurance'?[['california-foothills','California foothills point']]:
    [['colorado-high-country','Colorado high-country point']];
   node.insertAdjacentHTML('beforeend','<section class="crisis-section" id="crisisGeoClimateSection">'+
    '<h4>Geographic climate history · monthly evidence</h4>'+
    '<p>NASA POWER currently revised model/reanalysis data at a <strong>single representative geographic point</strong>. It is not a region-wide rainfall index, a historically published forecast or proof of commodity/company impact.</p>'+
    '<div class="crisis-macro-controls"><label>RESEARCH POINT <select id="crisisGeoRegion">'+
     options.map(x=>'<option value="'+safe(x[0])+'">'+safe(x[1])+'</option>').join('')+
    '</select></label><label>HISTORICAL YEAR <input id="crisisGeoYear" type="number" min="1981" max="2025" value="'+(item.id==='enso-fertilizer'?'2007':'2020')+'"></label>'+
    '<label>OPTIONAL CALENDAR CUTOFF <input id="crisisGeoAsOf" type="date"></label>'+
    '<button type="button" id="crisisGeoRun">LOAD RETROSPECTIVE MONTHLY DATA</button></div>'+
    '<p id="crisisGeoStatus" role="status">Select a year to inspect sourced monthly precipitation and temperature; no release-time or company impact is inferred.</p>'+
    '<div id="crisisGeoResults"></div></section>');
  }
  if(['enso-fertilizer','wildfire-insurance','snow-hydropower'].includes(item.id)){
   node.insertAdjacentHTML('beforeend','<section class="crisis-section" id="crisisGraphSection">'+
    '<h4>Economic transmission graph · conditional research links</h4>'+
    '<p>Trace potential climate-to-industry mechanisms. No geography-specific effects, company exposure, market returns or causal relationships are confirmed by this graph.</p>'+
    '<div class="crisis-macro-controls"><button type="button" id="crisisGraphRun">EXPLORE TRANSMISSION GRAPH</button></div>'+
    '<p id="crisisGraphStatus" role="status">Load typed driver, hazard, resource, industry and company-exposure research stages.</p>'+
    '<div id="crisisGraphResults"></div></section>');
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

 function renderGraph(graph){
  const node=$('crisisGraphResults'),nodes=Array.isArray(graph.nodes)?graph.nodes:[],edges=Array.isArray(graph.edges)?graph.edges:[],
    sources=new Map((graph.sources||[]).map(x=>[x.id,x])),stages=[...new Set(nodes.map(n=>n.stage))].sort((a,b)=>a-b),
    names=new Map(nodes.map(n=>[n.id,n.label]));
  const state=graph.coverage||{};
  const stagesHtml=stages.map(stage=>'<section class="crisis-graph-stage"><h5>STAGE '+safe(stage+1)+'</h5><div class="crisis-graph-nodes">'+
   nodes.filter(n=>n.stage===stage).map(n=>'<article class="crisis-graph-node"><small>'+safe(n.type.replaceAll('_',' ').toUpperCase())+'</small>'+
    '<strong>'+safe(n.label)+'</strong><span>'+safe(n.evidenceStatus.replaceAll('_',' '))+'</span>'+
    '<details><summary>Evidence required</summary><p>'+safe(n.requiredEvidence)+'</p></details></article>').join('')+
   '</div></section>').join('');
  const edgesHtml=edges.map(e=>{
    const ref=sources.get(e.sourceId),href=ref?allowedUrl(ref.url):null;
    return '<article class="crisis-graph-edge"><strong>'+safe(names.get(e.from)||e.from)+' → '+safe(names.get(e.to)||e.to)+'</strong>'+
      '<p>'+safe(e.mechanism)+'</p><small>HYPOTHESIS · EFFECT '+safe(e.direction)+' · LAG '+safe(e.lag)+
      ' · '+(href?'<a target="_blank" rel="noopener noreferrer" href="'+safe(href)+'">'+safe(ref.name)+'</a>':'Reference unavailable')+'</small></article>';
   }).join('');
  const dated=graph.datedEvidence?.status==='ISSUE_DATED_ARCHIVE_PAGE_REVISION_UNVERIFIED'?
   '<p><strong>Eligible NOAA evidence:</strong> '+safe(graph.datedEvidence.issueDate)+' — '+safe(graph.datedEvidence.synopsis)+
   '</p><p>Archive revision and original intraday publication clock are not verified. This does not validate any edge.</p>':
   '<p><strong>Historical evidence:</strong> '+safe(graph.datedEvidence?.status||'NOT REQUESTED')+'</p>';
  node.innerHTML='<div class="crisis-replay-summary"><div><small>RESEARCH NODES</small><strong>'+safe(state.totalNodes)+'</strong></div>'+
   '<div><small>HYPOTHESIS LINKS</small><strong>'+safe(state.totalEdges)+'</strong></div>'+
   '<div><small>VALIDATED LINKS</small><strong>'+safe(state.empiricallyValidatedEdges)+'</strong></div>'+
   '<div><small>VERIFIED ISSUER EDGES</small><strong>'+safe(state.verifiedIssuerExposureEdges)+'</strong></div></div>'+
   dated+'<p><b>Geography:</b> '+safe(graph.regionScope)+'</p>'+
   '<div class="crisis-graph-stages">'+stagesHtml+'</div>'+
   '<h5>Conditional transmission links</h5><div class="crisis-graph-edges">'+edgesHtml+'</div>'+
   '<p class="crisis-warning">This is a research hypothesis graph, not a quantified risk model. Industry and issuer impacts remain unverified.</p>';
 }
 async function loadTransmissionGraph(){
  const button=$('crisisGraphRun'),message=$('crisisGraphStatus'),output=$('crisisGraphResults');
  if(!button||!message||!output)return;
  const token=requestId,id=selected;
  const asOf=id==='enso-fertilizer'?$('crisisClimateAsOf')?.value||'':null;
  const params=new URLSearchParams({id});if(asOf)params.set('asOf',asOf);
  button.disabled=true;message.textContent='Loading typed economic mechanism and evidence boundaries…';output.replaceChildren();
  try{
   const graph=await read('/api/transmission/graph?'+params.toString());
   if(token!==requestId||selected!==id||!$('crisisGraphResults'))return;
   if(graph.id!==id||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.calibratedForecast!==false)
    throw Error('Unexpected economic transmission graph payload');
   renderGraph(graph);
   message.textContent='Graph loaded: '+graph.coverage.totalNodes+' research nodes, '+graph.coverage.totalEdges+' conditional links. No validated causal edges.';
  }catch(error){if(token===requestId&&selected===id)message.textContent=error.message;}
  finally{if($('crisisGraphRun')===button)button.disabled=false;}
 }
 function renderGeoClimate(data){
  const target=$('crisisGeoResults'),rows=Array.isArray(data.months)?data.months:[];
  const pct=x=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(2):'—';
  const max=Math.max(1,...rows.map(x=>x.precipitationMmPerDay??0));
  const tableRows=rows.map(x=>'<tr><th>'+safe(x.month.slice(0,4)+'-'+x.month.slice(4))+'</th>'+
   '<td><span class="crisis-geo-meter"><span style="width:'+Math.min(100,Math.max(0,100*(x.precipitationMmPerDay??0)/max)).toFixed(1)+'%"></span></span> '+
   safe(pct(x.precipitationMmPerDay))+'</td><td>'+safe(pct(x.temperatureC))+'</td></tr>').join('');
  const cover=data.coverage||{},pr=data.provenance||{};
  target.innerHTML='<p><strong>'+safe(data.region?.label)+' · '+safe(data.year)+'</strong> · '+safe(data.geoScope)+'</p>'+
   '<p>Source state: '+safe(data.dataStatus)+' · '+safe(data.asOfSemantics)+'</p>'+
   '<div class="crisis-macro-table"><table><thead><tr><th>Month</th><th>Mean precipitation (mm/day)</th><th>Mean temperature (°C)</th></tr></thead>'+
   '<tbody>'+tableRows+'</tbody></table></div>'+
   '<p><strong>Coverage:</strong> '+safe(cover.precipitationMonths)+' precipitation and '+safe(cover.temperatureMonths)+' temperature months from '+
   safe(cover.monthsReturned)+' eligible months. A dash means missing, not zero.</p>'+
   '<p><strong>Provenance:</strong> '+safe(data.source)+' · retrieved '+safe(pr.fetchedAt)+' · received-snapshot SHA-256: <code>'+safe(pr.receipt?.digest)+'</code>.</p>'+
   '<p class="crisis-warning">The historical values are currently revised and cannot establish what an analyst knew on the selected date. Not an anomaly, forecast, insurance-loss estimate or equity signal.</p>'+
   '<p><a target="_blank" rel="noopener noreferrer" href="'+safe(allowedUrl(data.sourceDocumentation)||'#')+'">NASA POWER monthly methodology</a></p>';
 }
 async function loadGeoClimate(){
  const button=$('crisisGeoRun'),statusNode=$('crisisGeoStatus'),target=$('crisisGeoResults');
  if(!button||!statusNode||!target)return;
  const token=requestId,id=selected,region=$('crisisGeoRegion')?.value,year=$('crisisGeoYear')?.value,asOf=$('crisisGeoAsOf')?.value;
  const query=new URLSearchParams({region,year});if(asOf)query.set('asOf',asOf);
  button.disabled=true;statusNode.textContent='Checking NASA POWER historical point values…';target.replaceChildren();
  try{
   const data=await read('/api/geoclimate/monthly?'+query.toString());
   if(requestId!==token||selected!==id||!$('crisisGeoResults'))return;
   if(data.region?.id!==region||String(data.year)!==year||data.validForHistoricalExAnteSignal!==false||
      data.calibratedForecast!==false||!Array.isArray(data.months))
    throw Error('Unexpected retrospective geographic climate response');
   renderGeoClimate(data);
   statusNode.textContent='Retrieved monthly point history. Original historical publication and revised-source timing are not verified.';
  }catch(e){if(requestId===token&&selected===id)statusNode.textContent=e.message;}
  finally{if($('crisisGeoRun')===button)button.disabled=false;}
 }
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisGeoRun'))void loadGeoClimate();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisGraphRun'))void loadTransmissionGraph();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisClimateRun'))void loadClimateEvidence();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisReplayRun'))void replayWarningHistory();});
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisMacroRun'))void loadMacro();});
 $('crisisLoad')?.addEventListener('click',()=>void load());
 $('crisisOpen')?.addEventListener('click',()=>void open($('crisisSelect').value));
 $('crisisCases')?.addEventListener('click',event=>{const id=event.target.closest?.('[data-crisis-id]')?.dataset.crisisId;
  if(id){$('crisisSelect').value=id;void open(id);}});
 document.addEventListener('tradescope:research-tab',event=>{if(event.detail?.tab==='crisis'&&!catalog)void load();});
})();
