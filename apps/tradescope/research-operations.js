/* Pilot Atlas and opt-in local monitoring. Provider credentials remain server-side. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if(!$('researchPanelAtlas')||!$('researchPanelMonitoring'))return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const array=value=>Array.isArray(value)?value:[];
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const label=value=>String(value??'unknown').replaceAll('_',' ');
  const textOf=value=>typeof value==='string'?value:value?.message||value?.reason||value?.error||'';
  const count=value=>Number.isInteger(value)&&value>=0?String(value):'—';
  const percent=value=>finite(value)?(value>0?'+':'')+value.toLocaleString('en-US',{maximumFractionDigits:2})+'%':'—';
  const number=value=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
  const time=(value,fallback='Time unavailable')=>{
    if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return fallback;
    if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' ET';
  };
  const state={tab:null,navigation:0,atlasVersion:0,catalog:null,catalogPromise:null,atlas:null,
    atlasSymbols:new Set(),comparisonSymbols:new Set(),monitorSymbols:new Set(),screens:[],monitors:[],health:null,backend:null,
    requests:new Map(),busy:new Map()};
  const actionIds={atlas:'atlasLoad',refresh:'monitorRefresh',create:'monitorCreate',backend:'researchBackendRefresh',sync:'researchBackendSync'};
  const active=context=>context.navigation===state.navigation&&(context.atlas===undefined||context.atlas===state.atlasVersion);
  const cancelled=()=>Object.assign(Error('Selection changed; refresh the current view.'),{cancelled:true});
  function status(id,message,error=false){$(id).textContent=message;$(id).className='research-status'+(error?' is-error':'');}
  function busy(){
    for(const [key,id]of Object.entries(actionIds))$(id).disabled=state.busy.has(key);
    $('researchBackendSync').disabled=state.busy.has('sync')||!state.backend?.configured||state.backend?.status!=='available';
    $('monitorCreate').disabled=state.busy.has('create')||!state.screens.length;
  }
  async function read(path,{method='GET',body,key=path,context,timeoutMs=120000}={}){
    if(context&&!active(context))throw cancelled();
    const controller=new AbortController(),job={controller,context};state.requests.set(key,job);
    const timeout=setTimeout(()=>{job.timedOut=true;controller.abort();},timeoutMs);
    try{
      const response=await fetch(path,{method,cache:'no-store',signal:controller.signal,
        headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
      const data=await response.json().catch(()=>({}));
      if(context&&!active(context))throw cancelled();
      if(!response.ok)throw Error(textOf(data)||'Research operation failed (HTTP '+response.status+').');
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('The research response is incomplete.');
      return data;
    }catch(error){
      if(job.timedOut)throw Error('The request timed out. Retry a smaller selection or inspect provider status.');
      if(controller.signal.aborted||error.name==='AbortError')throw cancelled();
      throw error;
    }finally{clearTimeout(timeout);if(state.requests.get(key)===job)state.requests.delete(key);}
  }
  async function perform(key,statusId,message,task,{atlas=false}={}){
    if(state.busy.has(key))return;
    const context={navigation:state.navigation,...(atlas?{atlas:state.atlasVersion}:{})};
    state.busy.set(key,context);busy();status(statusId,message);
    try{await task(context);}catch(error){if(!error.cancelled&&active(context))status(statusId,error.message||'Research operation unavailable.',true);}
    finally{if(state.busy.get(key)===context)state.busy.delete(key);busy();}
  }
  function abortNavigation(){
    state.navigation++;
    for(const [key,job]of state.requests)if(job.context){job.controller.abort();state.requests.delete(key);}
    state.busy.clear();busy();
  }
  async function catalog(){
    if(state.catalog)return state.catalog;
    if(!state.catalogPromise)state.catalogPromise=read('/api/research/catalog',{key:'operations-catalog',timeoutMs:20000}).then(data=>{
      if(!array(data.instruments).length)throw Error('Supported instrument catalog is unavailable.');
      state.catalog=data;
      const instruments=data.instruments.slice(0,10);
      state.atlasSymbols=new Set(instruments.map(item=>item.symbol));
      state.comparisonSymbols=new Set(instruments.slice(0,3).map(item=>item.symbol));
      state.monitorSymbols=new Set(instruments.map(item=>item.symbol));renderUniverses();return data;
    }).finally(()=>{state.catalogPromise=null;});
    return state.catalogPromise;
  }
  function renderUniverses(){
    for(const [id,selection,key]of [['atlasSymbols',state.atlasSymbols,'atlasSymbol'],['atlasComparisonSymbols',state.comparisonSymbols,'atlasCompare'],['monitorSymbols',state.monitorSymbols,'monitorSymbol']]){
      $(id).innerHTML=array(state.catalog?.instruments).slice(0,10).map(item=>'<label><input type="checkbox" data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="'+esc(item.symbol)+'" '+(selection.has(item.symbol)?'checked':'')+'>'+esc(item.symbol)+'</label>').join('');
    }
  }
  function invalidateAtlas(){
    state.atlasVersion++;state.atlas=null;
    for(const [key,job]of state.requests)if(job.context?.atlas!==undefined){job.controller.abort();state.requests.delete(key);}
    state.busy.delete('atlas');busy();renderAtlas();
    status('atlasStatus','Selection changed. Load Market Atlas to calculate this selection.');
  }
  const available=metric=>metric?.status==='available'&&finite(metric.value);
  function metricCell(metric,{ratio=false,index=false}={}){
    const ready=available(metric),value=ready?(ratio?number(metric.value)+'×':index?number(metric.value):percent(metric.value)):'—';
    const tone=ready?(ratio||index?'neutral':metric.value>0?'positive':metric.value<0?'negative':'neutral'):'unavailable';
    const details=[metric?.source,metric?.asOf,textOf(metric?.reason)].filter(Boolean).join(' · ');
    return '<td class="research-number atlas-cell-'+tone+'" title="'+esc(details)+'"><strong>'+esc(value)+'</strong><small>'+esc(ready?metric.asOf||'Date unavailable':label(metric?.status||'unavailable'))+'</small></td>';
  }
  function trendHtml(trends){return [20,50,200].map(period=>{
    const item=trends?.['sma'+period],ready=item?.status==='available'&&['above','below','equal'].includes(item.relation);
    return '<small title="'+esc(textOf(item?.reason))+'">'+period+': '+esc(ready?item.relation.toUpperCase():label(item?.status||'unavailable').toUpperCase())+'</small>';
  }).join('');}
  function renderBreadth(data){
    const breadth=data?.breadth;
    if(!breadth){$('atlasBreadth').innerHTML='<div class="research-empty">No eligible breadth calculated. Missing or stale inputs are excluded rather than counted as unchanged.</div>';return;}
    const returns=breadth.return1d;
    let html='<article class="atlas-breadth-card"><small>DAILY RETURN BREADTH</small><strong>'+count(returns?.positive)+' UP / '+count(returns?.negative)+' DOWN</strong><p>'+count(returns?.unchanged)+' unchanged · '+count(returns?.eligible)+' eligible · '+count(returns?.unavailable)+' unavailable</p></article>';
    html+=[20,50,200].map(period=>{const item=breadth['sma'+period];return '<article class="atlas-breadth-card"><small>CLOSE / SMA '+period+'</small><strong>'+count(item?.above)+' ABOVE / '+count(item?.eligible)+' ELIGIBLE</strong><p>'+count(item?.below)+' below · '+count(item?.equal)+' equal · '+count(item?.unavailable)+' unavailable</p></article>';}).join('');
    $('atlasBreadth').innerHTML=html;
  }
  function renderGroups(groups){
    $('atlasGroups').innerHTML=groups.length?groups.map(group=>{
      const returns=group.returns||group.averages||{};
      return '<article class="atlas-group"><h4>'+esc(group.category||group.name||'Unclassified pilot category')+'</h4><p>'+esc(array(group.symbols||group.members).map(item=>typeof item==='string'?item:item.symbol).join(', '))+'</p>'+[1,5,20,63].map(days=>{
        const item=returns['return'+days+'dPct']||group['return'+days+'dPct'];
        const contributors=array(item?.contributors);
        return '<div><strong>'+days+' sessions: '+esc(item?.status==='available'&&finite(item.value)?percent(item.value):'Unavailable')+'</strong><small>'+esc(contributors.length?contributors.join(', '):'No eligible contributors')+' · '+count(item?.eligible??item?.count??contributors.length)+' contributors</small>'+(item?.reason?'<small>'+esc(textOf(item.reason))+'</small>':'')+'</div>';
      }).join('')+'<small>Equal-weight available pilot members only.</small></article>';
    }).join(''):'<div class="research-empty">No category averages are available for this selection.</div>';
  }
  function comparisonReason(value){
    const reason=textOf(value);
    const explanations={
      no_eligible_series:'No eligible price history is available for the selected comparison instruments.',
      no_eligible_inputs:'No fresh, compatible observations are available for this comparison.',
      unknown_comparison_context:'Source, currency or price adjustment details are missing, so the histories cannot be compared.',
      comparison_context_mismatch:'The histories use incompatible sources, currencies or price adjustments.',
      comparison_asof_mismatch:'The selected histories end on different observed dates and cannot be aligned safely.',
      insufficient_common_sessions:'There are not enough common observed sessions for the selected comparison window.',
      invalid_normalization:'The observed prices cannot produce a valid normalized comparison.',
      missing_or_oversized_series:'A bounded daily price history is not available for this instrument.',
      conflicting_series_session:'Conflicting prices were reported for the same session, so this history was excluded.',
      series_snapshot_mismatch:'The price history does not match the latest sourced research snapshot.',
      stale_input:'The latest observation is too old for this comparison.',
      missing_data:'The required price observations are missing.',
      insufficient_data:'There are not enough completed observations for this comparison.',
      ambiguous_symbol:'More than one snapshot was supplied for this instrument, so its history is ambiguous.',
      ambiguous_metric:'More than one observation was supplied for the same metric.',
      unknown_provenance:'The source or calculation method is missing.',
      unknown_asof:'The observation date is unavailable.',
      incomplete_or_future_session:'The latest session is incomplete or lies in the future.',
      future_availability:'The observation was not yet available at the evaluation time.',
      snapshot_context_mismatch:'The metric and its closing-price snapshot have incompatible source or calculation details.',
      unit_mismatch:'The observation has an incompatible measurement unit.',
      unknown_adjustment:'The price adjustment method is unknown.',
      unknown_available_at:'The time when this observation became available is unknown.',
      period_asof_mismatch:'The reporting period does not match the observation date.',
      invalid_period:'The observation has an invalid reporting period.',
      invalid_value:'A required price observation is invalid.',
      invalid_value_range:'A required observation lies outside its supported range.'
    };
    if(explanations[reason])return explanations[reason];
    return reason&&/^[a-z0-9_]+$/.test(reason)?'The price history does not meet comparison readiness requirements.':reason||'No compatible common-date comparison is available.';
  }
  function renderComparison(comparison){
    const dates=array(comparison?.dates).filter(date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)).slice(-64);
    const series=array(comparison?.series).slice(0,5).flatMap(item=>{
      const points=new Map(array(item.points).filter(point=>typeof point.date==='string'&&finite(point.index)&&point.index>0).map(point=>[point.date,point]));
      return dates.length>1&&dates.every(date=>points.has(date))?[{...item,points:dates.map(date=>points.get(date))}]:[];
    });
    const coverage=comparison?.coverage||{},excluded=array(comparison?.excluded).slice(0,10);
    const coverageHtml=comparison?'<div class="research-note">Comparison coverage: '+count(coverage.requested??array(comparison.requestedSymbols).length)+' requested · '+count(coverage.eligible??array(comparison.eligibleSymbols).length)+' eligible histories · '+count(coverage.excluded??excluded.length)+' excluded · '+count(coverage.commonSessions??dates.length)+' common sessions. Each curve starts at 100 on the same first observed date; missing prices are never forward-filled.</div>':'';
    const exclusionsHtml=excluded.length?'<div class="research-source-errors"><strong>Excluded comparison instruments</strong><ul>'+excluded.map(item=>'<li><strong>'+esc(item.symbol||'Unknown instrument')+'</strong>: '+esc(comparisonReason(item.reason))+'</li>').join('')+'</ul></div>':'';
    if(comparison?.status!=='available'||!series.length){$('atlasComparison').innerHTML=coverageHtml+exclusionsHtml+'<div class="research-empty">'+esc(comparison?comparisonReason(comparison.reason):'No compatible common-date comparison is available. Missing prices are not forward-filled.')+'</div>';return;}
    const colors=['#36b8cc','#f1aa3c','#9c82ed','#dc6589','#69a76e'];
    const values=series.flatMap(item=>item.points.map(point=>point.index)),minimum=Math.min(...values),maximum=Math.max(...values);
    const padding=Math.max((maximum-minimum)*.08,.5),low=minimum-padding,high=maximum+padding;
    const x=index=>48+index/(dates.length-1)*700,y=value=>225-(value-low)/(high-low)*195;
    const lines=series.map((item,index)=>'<polyline fill="none" stroke="'+colors[index]+'" stroke-width="2.5" points="'+item.points.map((point,i)=>x(i).toFixed(2)+','+y(point.index).toFixed(2)).join(' ')+'"/>').join('');
    const chart='<svg viewBox="0 0 800 270" role="img" aria-label="Normalized price comparison, base one hundred, on common observed dates"><path d="M48 20V225H750" fill="none" stroke="currentColor" opacity=".3"/><text x="8" y="30" fill="currentColor">'+esc(number(high))+'</text><text x="8" y="225" fill="currentColor">'+esc(number(low))+'</text><text x="48" y="250" fill="currentColor">'+esc(dates[0])+'</text><text x="665" y="250" fill="currentColor">'+esc(dates.at(-1))+'</text>'+lines+'</svg>';
    const keys=series.map((item,index)=>'<span class="atlas-series-key" style="--series-color:'+colors[index]+'">'+esc(item.symbol)+' · '+esc(item.source)+' · '+esc(item.adjustment||'adjustment unavailable')+'</span>').join('');
    const table='<div class="research-table-scroll"><table class="research-table" aria-label="Normalized comparison endpoints"><thead><tr><th>SECURITY</th><th>BASE DATE</th><th>LAST DATE</th><th class="research-number">LAST INDEX</th><th class="research-number">FROM BASE</th></tr></thead><tbody>'+series.map(item=>{const last=item.points.at(-1);return '<tr><td>'+esc(item.symbol)+'<small>'+esc(item.currency||'Currency unavailable')+'</small></td><td>'+esc(item.baseDate||dates[0])+'</td><td>'+esc(last.date)+'</td><td class="research-number">'+esc(number(last.index))+'</td><td class="research-number">'+esc(percent(last.returnPct))+'</td></tr>';}).join('')+'</tbody></table></div>';
    $('atlasComparison').innerHTML=coverageHtml+exclusionsHtml+'<div class="atlas-comparison">'+chart+'<div class="atlas-comparison-legend">'+keys+'</div></div>'+table;
  }
  function renderAtlas(){
    const data=state.atlas;
    if(!data){$('atlasCoverage').textContent='Coverage has not been evaluated.';$('atlasAsOf').textContent='NOT LOADED';$('atlasRows').innerHTML='<tr><td colspan="8" class="research-empty">Load sourced research to populate this table.</td></tr>';renderBreadth(null);renderGroups([]);renderComparison(null);return;}
    const coverage=data.coverage||{},rows=array(data.rows);
    $('atlasCoverage').textContent=count(coverage.requested??rows.length)+' requested · '+count(coverage.available??coverage.eligible)+' available · supported pilot only';
    $('atlasAsOf').textContent=data.asOf?'LATEST '+data.asOf:'SOURCE DATES UNAVAILABLE';
    $('atlasRows').innerHTML=rows.length?rows.map(row=>{
      const metrics=row.metrics||{};
      return '<tr><td><strong>'+esc(row.symbol)+'</strong><small>'+esc(row.category||row.name)+'</small><small>'+esc(row.source||'Source unavailable')+' · '+esc(row.asOf||'No source date')+'</small></td>'+[1,5,20,63].map(days=>metricCell(metrics['return'+days+'dPct'])).join('')+'<td>'+trendHtml(row.trends)+'</td>'+metricCell(metrics.rsi14,{index:true})+metricCell(metrics.relativeVolume20,{ratio:true})+'</tr>';
    }).join(''):'<tr><td colspan="8" class="research-empty">No observations returned for this selection.</td></tr>';
    renderBreadth(data);renderGroups(array(data.groups));renderComparison(data.comparison);
    $('atlasLimitations').innerHTML='<ul>'+array(data.limitations).map(item=>'<li>'+esc(textOf(item)||item)+'</li>').join('')+'</ul>';
  }
  async function loadAtlas(){
    return perform('atlas','atlasStatus','Loading bounded research snapshots for the selected pilot…',async context=>{
      await catalog();if(!active(context))throw cancelled();
      const symbols=[...state.atlasSymbols],comparisonSymbols=[...state.comparisonSymbols];
      if(!symbols.length||symbols.length>10)throw Error('Choose between one and ten Atlas instruments.');
      if(comparisonSymbols.length>5||comparisonSymbols.some(symbol=>!state.atlasSymbols.has(symbol)))throw Error('Choose up to five comparison instruments included in the Atlas selection.');
      const windowSessions=Number($('atlasWindow').value);
      if(![20,63].includes(windowSessions))throw Error('Choose a 20- or 63-session comparison window.');
      state.atlas=await read('/api/research/atlas',{method:'POST',body:{symbols,comparisonSymbols,windowSessions},key:'atlas',context});renderAtlas();
      status('atlasStatus','Market Atlas loaded. Inspect eligible contributors, dates and missing inputs before comparing.');
    },{atlas:true});
  }
  function renderScreens(){
    const previous=$('monitorScreen').value;
    $('monitorScreen').innerHTML='<option value="">Choose a saved screen…</option>'+state.screens.map(screen=>'<option value="'+esc(screen.id)+'">'+esc(screen.name)+' · revision '+esc(screen.revision)+'</option>').join('');
    $('monitorScreen').value=state.screens.some(screen=>screen.id===previous)?previous:state.screens[0]?.id||'';
    screenSnapshot();busy();
  }
  function screenSnapshot(){
    const screen=state.screens.find(item=>item.id===$('monitorScreen').value);
    $('monitorScreenSnapshot').textContent=screen?'Copies '+screen.name+', revision '+screen.revision+', with '+array(screen.conditions).length+' conditions. Later screen edits do not alter this monitor.':'Save a screen in Screener, then refresh this list. A monitor keeps an immutable copy of its criteria.';
  }
  function renderMonitors(){
    const health=state.health||{};
    const schedulerStatus=health.closed?'stopped':health.started===true?'running':health.started===false?'not started':'unknown';
    $('monitorHealth').textContent='LOCAL SCHEDULER · '+schedulerStatus.toUpperCase()+' · '+count(health.enabledCount)+' enabled / '+count(health.monitorCount)+' saved · '+(health.runningMonitorId?'scan in progress':'no active scan reported')+(health.lastSchedulerError?' · '+textOf(health.lastSchedulerError):'')+'. Runs require this local Node server; no catch-up replay is guaranteed.';
    $('monitorRows').innerHTML=state.monitors.length?state.monitors.map(monitor=>{
      const last=monitor.lastRun,summary=last?.summary||{},isBusy=state.busy.has('monitor:'+monitor.id),disabled=isBusy?' disabled':'';
      const summaryHtml=last?'<div class="operations-run-summary"><strong>LAST RUN / '+esc(label(last.status).toUpperCase())+'</strong><p>Started '+esc(time(last.startedAt))+' · Finished '+esc(time(last.finishedAt))+'</p><p>'+count(summary.evaluated)+' evaluated · '+count(summary.triggered)+' triggered · '+count(summary.ready)+' ready · '+count(summary.unavailable)+' unavailable · '+count(summary.warmingUp)+' warming up</p><p>'+count(summary.alertsCreated)+' alerts created · '+count(summary.alertsUpdated)+' updated · '+count(summary.alertsResolved)+' resolved · '+count(summary.suppressed)+' suppressed</p>'+(last.error||last.reason?'<p>'+esc(textOf(last.error||last.reason))+'</p>':'')+'</div>':'<p class="research-note">No run recorded. Missing evaluations are not a zero-risk result.</p>';
      return '<article class="operations-monitor-card"><header><div><h4>'+esc(monitor.name)+'</h4><p class="operations-monitor-meta">'+(monitor.enabled?'ENABLED':'DISABLED')+' · Every '+esc(monitor.intervalMinutes)+' minutes · '+esc(array(monitor.symbols).join(', '))+'</p><p class="operations-monitor-meta">Copied screen '+esc(monitor.screenId)+' / revision '+esc(monitor.screenRevision)+' · '+array(monitor.rule?.conditions).length+' conditions · Next '+esc(time(monitor.nextRunAt,'Not scheduled'))+'</p></div><div class="operations-monitor-actions"><button type="button" data-monitor-action="toggle" data-monitor-id="'+esc(monitor.id)+'"'+disabled+'>'+(monitor.enabled?'DISABLE':'ENABLE')+'</button><button type="button" data-monitor-action="run" data-monitor-id="'+esc(monitor.id)+'"'+disabled+'>RUN NOW</button><button type="button" data-monitor-action="delete" data-monitor-id="'+esc(monitor.id)+'"'+disabled+'>DELETE</button></div></header>'+summaryHtml+'</article>';
    }).join(''):'<div class="research-empty">No saved monitors. Create one from a saved screen, then enable it or run it explicitly.</div>';
  }
  async function refreshMonitors(){
    return perform('refresh','monitorStatus','Loading monitors and saved screens…',async context=>{
      await catalog();if(!active(context))throw cancelled();
      const results=await Promise.allSettled([read('/api/research/monitors',{key:'monitors',context,timeoutMs:20000}),read('/api/research/screens',{key:'monitor-screens',context,timeoutMs:20000})]);
      if(!active(context))throw cancelled();
      const errors=[];
      if(results[0].status==='fulfilled'){state.monitors=array(results[0].value.monitors);state.health=results[0].value.health;renderMonitors();}else errors.push(results[0].reason.message);
      if(results[1].status==='fulfilled'){state.screens=array(results[1].value.screens);renderScreens();}else errors.push(results[1].reason.message);
      if(errors.length)throw Error(errors.join(' '));
      status('monitorStatus',state.monitors.length+' local monitors loaded. Schedules run only while the local server stays running.');
    });
  }
  async function createMonitor(){
    return perform('create','monitorStatus','Creating a disabled monitor from the saved screen…',async context=>{
      const screenId=$('monitorScreen').value,name=$('monitorName').value.trim(),intervalMinutes=Number($('monitorInterval').value),symbols=[...state.monitorSymbols];
      if(!state.screens.some(screen=>screen.id===screenId))throw Error('Choose an existing saved screen.');
      if(!name)throw Error('Enter a monitor name.');
      if(!Number.isInteger(intervalMinutes)||intervalMinutes<5||intervalMinutes>1440)throw Error('Use a whole-minute interval between 5 and 1440.');
      if(!symbols.length||symbols.length>10)throw Error('Choose between one and ten supported monitor instruments.');
      const data=await read('/api/research/monitors',{method:'POST',body:{screenId,name,intervalMinutes,symbols,enabled:false},key:'monitor-create',context});
      const monitor=data.monitor||data;state.monitors=[...state.monitors.filter(item=>item.id!==monitor.id),monitor];renderMonitors();
      status('monitorStatus','Monitor saved disabled. Choose ENABLE to start its schedule or RUN NOW for one explicit scan.');
    });
  }
  async function monitorAction(id,action){
    const monitor=state.monitors.find(item=>item.id===id);if(!monitor)return;
    return perform('monitor:'+id,'monitorStatus',action==='run'?'Running the monitor against sourced research…':'Updating the saved monitor…',async context=>{
      renderMonitors();
      const path='/api/research/monitors/'+encodeURIComponent(id)+(action==='run'?'/run':'');
      const method=action==='run'?'POST':action==='delete'?'DELETE':'PATCH';
      const body=action==='run'?{}:{expectedRevision:monitor.revision,...(action==='toggle'?{enabled:!monitor.enabled}:{})};
      const data=await read(path,{method,body,key:'monitor:'+id,context});
      if(action==='delete')state.monitors=state.monitors.filter(item=>item.id!==id);
      else {const next=data.monitor||data;if(next?.id)state.monitors=state.monitors.map(item=>item.id===id?next:item);}
      renderMonitors();
      const runMessages={completed:'Run completed. Inspect readiness and saved alerts in Signals.',failed:'Run failed. Inspect the last run and provider readiness before retrying.',cancelled:'Run cancelled. Refresh monitor status before retrying.',busy:'Another local scan is active. Refresh its status before running again.'};
      status('monitorStatus',action==='delete'?'Monitor deleted.':action==='run'?runMessages[data.action]||'Run status is unavailable. Refresh the monitor list.':'Monitor '+(!monitor.enabled?'enabled':'disabled')+'.',data.action==='failed');
      if(action==='run'&&data.action==='completed')document.dispatchEvent(new CustomEvent('tradescope:research-alerts-changed'));
    }).finally(()=>renderMonitors());
  }
  function renderBackend(){
    const backend=state.backend;
    if(!backend){busy();return;}
    const detail=textOf(backend.message)||textOf(backend.error);
    $('researchBackendStatus').textContent=(backend.configured?'Configured Java storage · '+label(backend.status||'status unavailable')+(typeof backend.storage==='string'?' · '+label(backend.storage):''):backend.status==='invalid_configuration'?'Java research storage configuration is invalid. Check the local server connection using the setup guide.':'Java research storage is disabled. Configure the local server connection using the setup guide; no credentials are entered in this browser.')+(detail?' · '+detail:'');
    busy();
  }
  async function refreshBackend(){
    return perform('backend','researchBackendStatus','Checking optional Java storage…',async context=>{
      state.backend=await read('/api/research/backend',{key:'backend',context,timeoutMs:20000});renderBackend();
    });
  }
  async function syncBackend(){
    return perform('sync','researchBackendStatus','Syncing the selected security snapshot to configured Java storage…',async context=>{
      if(!state.backend?.configured||state.backend.status!=='available')throw Error('Check that configured Java research storage is available before syncing.');
      const symbol=$('researchSymbol').value;
      const data=await read('/api/research/backend/sync',{method:'POST',body:{symbol},key:'backend-sync',context});
      const receipt=data.receipt||data.result||data;
      const stored=receipt.upsertedCount??receipt.observationCount??receipt.savedCount??receipt.count;
      status('researchBackendStatus','Snapshot sync completed for '+symbol+(Number.isInteger(stored)?' · '+stored+' metric observations':'')+'. '+(textOf(receipt.message)||'Inspect the Java storage receipt for persistence details.'));
    });
  }
  function checkboxChange(event,key,selection,maximum){
    const symbol=event.target?.dataset?.[key];if(!symbol)return;
    if(event.target.checked){if(selection.size>=maximum){event.target.checked=false;status(key==='monitorSymbol'?'monitorStatus':'atlasStatus','Choose no more than '+maximum+' supported instruments.',true);return;}selection.add(symbol);}else selection.delete(symbol);
    if(key==='atlasSymbol'&&!selection.has(symbol)){
      state.comparisonSymbols.delete(symbol);
      for(const checkbox of $('atlasComparisonSymbols').querySelectorAll?.('[data-atlas-compare]')||[])if(checkbox.dataset.atlasCompare===symbol)checkbox.checked=false;
    }
    if(key!=='monitorSymbol')invalidateAtlas();
  }
  function on(id,type,handler){$(id).addEventListener(type,handler);}
  on('atlasLoad','click',loadAtlas);on('atlasWindow','change',invalidateAtlas);
  on('atlasSymbols','change',event=>checkboxChange(event,'atlasSymbol',state.atlasSymbols,10));
  on('atlasComparisonSymbols','change',event=>checkboxChange(event,'atlasCompare',state.comparisonSymbols,5));
  on('monitorSymbols','change',event=>checkboxChange(event,'monitorSymbol',state.monitorSymbols,10));
  on('monitorRefresh','click',refreshMonitors);on('monitorCreate','click',createMonitor);on('monitorScreen','change',screenSnapshot);
  on('monitorRows','click',event=>{const button=event.target.closest('[data-monitor-action]');if(button&&!button.disabled)void monitorAction(button.dataset.monitorId,button.dataset.monitorAction);});
  on('researchBackendRefresh','click',refreshBackend);on('researchBackendSync','click',syncBackend);
  document.addEventListener('tradescope:research-tab',event=>{
    const tab=['atlas','monitoring'].includes(event.detail?.tab)?event.detail.tab:null;
    if(state.tab===tab)return;abortNavigation();state.tab=tab;
    if(tab==='atlas')void perform('catalog','atlasStatus','Loading supported instrument catalog…',async context=>{await catalog();if(active(context))status('atlasStatus','Choose supported instruments, then load sourced Market Atlas observations.');});
    if(tab==='monitoring'){void refreshMonitors();void refreshBackend();}
  });
  document.addEventListener('tradescope:workspace',event=>{if(event.detail?.view!=='research'&&state.tab){abortNavigation();state.tab=null;}});
  renderAtlas();busy();
})();
