/* Source-grounded research UI. All data and saved-domain requests are same-origin. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('researchWorkspace')) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => {
    try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  };
  const array = value => Array.isArray(value) ? value : [];
  const message = value => typeof value === 'string' ? value : value?.message || value?.reason || value?.text || '';
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const time = value => validTime(value) ? value : 'Not supplied';
  const tabs = ['company','signals','screener','filings','discovery','analogues','atlas','monitoring'];
  const state = {
    tab:'company',symbol:'AAPL',generation:0,screenGeneration:0,eventGeneration:0,
    catalog:null,catalogPromise:null,company:null,evaluations:[],alerts:null,screens:[],presets:[],
    screenName:'My research screen',screenMatch:'all',conditions:[],selectedSymbols:new Set(),selectedScreen:null,screenResults:null,
    filings:[],filing:null,selectedAccession:null,earthquakes:[],eventId:'',analogues:null,outcomes:null,outcomeEvent:null,
    requests:new Map(),actions:new Map()
  };
  const actionButtons = {catalog:'researchCatalogRetry',company:'researchLoad',evaluate:'researchEvaluate',alerts:'researchRefreshAlerts',
    screens:'researchScreenSelect',saveScreen:'researchSaveScreen',deleteScreen:'researchDeleteScreen',scan:'researchRunScreen',
    filings:'researchLoadFilings',earthquakes:'researchLoadEarthquakes',analogues:'researchFindAnalogues'};
  let alertsTimer=null,workspaceActive=false;
  function watchAlerts(){
    clearTimeout(alertsTimer);alertsTimer=null;
    if(!workspaceActive||state.tab!=='signals'||document.visibilityState!=='visible')return;
    alertsTimer=setTimeout(async()=>{
      alertsTimer=null;
      if(workspaceActive&&state.tab==='signals'&&document.visibilityState==='visible'){
        if(!state.actions.has('alerts')&&!state.actions.has('evaluate'))await loadAlerts({quiet:true});
        watchAlerts();
      }
    },15000);
    alertsTimer?.unref?.();
  }
  const scopeVersion = scope => scope === 'symbol' ? state.generation : scope === 'screen' ? state.screenGeneration : scope === 'event' ? state.eventGeneration : scope === 'outcome' ? state.generation+':'+state.eventGeneration : 0;
  const cancelled = () => Object.assign(Error('The selection changed; this response was ignored.'),{cancelled:true});
  function guard(context) { if (context && scopeVersion(context.scope) !== context.version) throw cancelled(); }
  function status(text,tone='') { $('researchStatus').textContent = text; $('researchStatus').className = 'research-status' + (tone ? ' is-'+tone : ''); }
  function updateBusy() {
    for (const [key,id] of Object.entries(actionButtons)) if ($(id)) $(id).disabled = state.actions.has(key);
    $('researchDeleteScreen').disabled = state.actions.has('deleteScreen') || !state.selectedScreen;
    $('researchSaveScreen').textContent=state.selectedScreen?'SAVE CHANGES':'SAVE NEW SCREEN';
  }
  function abortScope(scope) {
    const matches=context=>context?.scope===scope||context?.scope==='outcome'&&['symbol','event'].includes(scope);
    for (const [key,job] of state.requests) if (matches(job.context)) { job.controller.abort(); state.requests.delete(key); }
    for (const [key,context] of state.actions) if (matches(context)) state.actions.delete(key);
    updateBusy();
  }
  async function read(path,{method='GET',body,key=path,context={scope:'global',version:0},timeoutMs=90000}={}) {
    guard(context);
    state.requests.get(key)?.controller.abort();
    const controller = new AbortController(),job={controller,context};
    state.requests.set(key,job);
    const timer = setTimeout(() => { job.timedOut=true; controller.abort(); },timeoutMs);
    try {
      const response = await fetch(path,{method,cache:'no-store',signal:controller.signal,
        headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      guard(context);
      if (controller.signal.aborted) throw cancelled();
      if (!response.ok) throw Error(data.error || data.message || 'Research request failed (HTTP '+response.status+').');
      return data;
    } catch(error) {
      if (job.timedOut) throw Error('The research request timed out. Retry a smaller selection or check the provider status.');
      if (controller.signal.aborted || error.name === 'AbortError') throw cancelled();
      throw error;
    } finally {
      clearTimeout(timer);
      if (state.requests.get(key) === job) state.requests.delete(key);
    }
  }
  async function action(key,scope,loading,task) {
    if (state.actions.has(key)) return;
    const context={scope,version:scopeVersion(scope)};
    state.actions.set(key,context);updateBusy();status(loading,'loading');
    try { await task(context); }
    catch(error) { if (!error.cancelled && scopeVersion(scope)===context.version) status(error.message+' The existing Monitor and other research tools remain available.','error'); }
    finally { if (state.actions.get(key) === context) { state.actions.delete(key);updateBusy(); } }
  }
  const definitions = () => array(state.catalog?.definitions);
  const definition = id => definitions().find(d => d.id === id) || {id,label:id,group:'Other',unit:'',description:''};
  const observations = () => array(state.company?.observations);
  const observation = id => observations().find(o => o.id === id);
  function format(value,unit='',id='') {
    if (value === null || value === undefined || (typeof value==='number' && !Number.isFinite(value))) return '—';
    if (typeof value==='boolean') return value ? 'Yes' : 'No';
    if (typeof value!=='number') return String(value);
    const percent = unit==='%' || /pct|percent/i.test(unit);
    const signed = percent && /return|distance|growth|gap|histogram/i.test(id) && value>0 ? '+' : '';
    const money = /^(USD|currency|USD\/shares?|USD_per_share)$/i.test(unit);
    const compact = Math.abs(value)>=1e6 && !percent;
    const rendered = value.toLocaleString('en-US',{minimumFractionDigits:compact?2:0,maximumFractionDigits:2,...(compact?{notation:'compact'}:{})});
    return signed+(money?'$':'')+rendered+(percent?'%':unit==='pp'?' pp':unit==='ratio'||unit==='x'||unit==='multiple'?'×':'');
  }
  function stateBadge(value) {
    const allowed=['available','ready','triggered','warming_up','pending','missing_data','insufficient_data','unsupported','period_mismatch','unavailable','matched','not_matched','unknown','active','acknowledged','resolved','stale'];
    const kind=allowed.includes(value)?value:'unknown';
    return '<span class="research-state is-'+kind+'">'+esc(String(value||'unknown').replaceAll('_',' ').toUpperCase())+'</span>';
  }
  const link = (url,label) => safeUrl(url) ? '<a href="'+esc(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>' : '';
  function reasonOf(obs) {
    if (!obs) return 'No observation loaded for this metric.';
    const reason=message(obs.reason);
    return reason || (obs.status==='available'?'Calculated from the stated source and period.':'Required inputs are unavailable.');
  }
  function readiness(obs,def={}) {
    const required=obs?.requiredCount ?? def.minimumBars;
    const count=obs?.sampleCount;
    return Number.isFinite(count) && Number.isFinite(required) && required>0 ? count+'/'+required+' observations' : '';
  }
  function periodOf(obs) {
    if (!obs) return 'Not loaded';
    return obs.periodStart && obs.periodEnd ? obs.periodStart+' → '+obs.periodEnd : obs.periodEnd || obs.asOf || 'Period not supplied';
  }
  async function ensureCatalog(force=false) {
    if (state.catalog && !force) return state.catalog;
    if (state.catalogPromise && !force) return state.catalogPromise;
    state.catalogPromise = read('/api/research/catalog',{key:'catalog',timeoutMs:20000}).then(data => {
      if (!Array.isArray(data.definitions) || !Array.isArray(data.instruments)) throw Error('The research catalog response is incomplete.');
      state.catalog=data;state.presets=array(data.presets);
      if (!data.instruments.some(item => item.symbol===state.symbol) && data.instruments[0]) state.symbol=data.instruments[0].symbol;
      if (!state.selectedSymbols.size) data.instruments.forEach(item => state.selectedSymbols.add(item.symbol));
      if (!state.conditions.length && data.definitions.length) state.conditions=[{metricId:data.definitions.find(d=>d.id==='technical.rsi14')?.id||data.definitions[0].id,operator:'lt',value:30}];
      renderCatalog();return data;
    }).catch(error => {state.catalogPromise=null;throw error;});
    return state.catalogPromise;
  }
  function renderCatalog() {
    const instruments=array(state.catalog?.instruments);
    $('researchSymbol').innerHTML=instruments.map(item=>'<option value="'+esc(item.symbol)+'">'+esc(item.symbol)+' · '+esc(item.name||item.symbol)+'</option>').join('');
    $('researchSymbol').value=state.symbol;
    $('researchCoverage').textContent=instruments.length+' supported instruments · provider coverage and metric availability are explicit';
    const groups=[...new Set(definitions().map(item=>item.group||'Other'))];
    const selectedGroup=$('researchMetricGroup').value||'ALL';
    $('researchMetricGroup').innerHTML='<option value="ALL">All groups</option>'+groups.map(group=>'<option value="'+esc(group)+'">'+esc(group)+'</option>').join('');
    $('researchMetricGroup').value=groups.includes(selectedGroup)?selectedGroup:'ALL';
    $('researchScreenSymbols').innerHTML=instruments.map(item=>'<label><input type="checkbox" data-research-symbol="'+esc(item.symbol)+'" '+(state.selectedSymbols.has(item.symbol)?'checked':'')+'>'+esc(item.symbol)+'</label>').join('');
    renderCompany();renderConditions();renderScreenChoices();
  }
  function metricDetail(obs,def) {
    const items=[['Definition',def.description||'Definition not supplied'],['Metric ID',def.id],['Unit',obs?.unit||def.unit||'Not supplied'],
      ['Calculation version',obs?.methodVersion||def.methodVersion||'Not supplied'],['Source',obs?.source||'Not loaded'],['As of',time(obs?.asOf)],
      ['Available / fetched at',time(obs?.availableAt)],['Readiness',readiness(obs,def)||'See availability reason']];
    return '<details><summary>Definition and provenance</summary><dl class="research-definition">'+items.map(item=>'<dt>'+esc(item[0])+'</dt><dd>'+esc(item[1])+'</dd>').join('')+'</dl></details>';
  }
  function renderCompany() {
    const defs=definitions(),rows=observations();
    if (!state.company) {
      $('researchSummary').innerHTML='<div class="research-empty">Load '+esc(state.symbol)+' research to inspect actual observations. The catalog defines '+defs.length+' metrics; unavailable values are never filled with examples.</div>';
      $('researchMetricCount').textContent=defs.length+' DEFINITIONS · NO COMPANY LOADED';
      $('researchMetricRows').innerHTML='<tr><td colspan="5" class="research-empty">Select a security and choose LOAD COMPANY RESEARCH.</td></tr>';
      $('researchGroups').innerHTML='';$('researchCompanyErrors').innerHTML='';$('researchAsOf').textContent='No company snapshot loaded';
      $('researchMode').textContent='NO COMPANY DATA LOADED';return;
    }
    const available=rows.filter(row=>row.status==='available').length;
    $('researchMode').textContent='SOURCED RESEARCH / '+state.symbol;
    const asOf=state.company.asOf||observation('price.close')?.asOf;
    $('researchAsOf').textContent=available+'/'+rows.length+' available · latest market observation '+time(asOf);
    const highlights=['price.close','technical.rsi14','technical.sma200','financial.revenueTTM','financial.freeCashFlowTTM','financial.currentRatio'];
    $('researchSummary').innerHTML=highlights.map(id=>{
      const def=definition(id),obs=observation(id);
      return '<div class="research-metric-card '+(obs?.status==='available'?'':'is-unavailable')+'"><small>'+esc(def.label||id)+'</small><strong>'+esc(format(obs?.value,obs?.unit||def.unit,id))+'</strong><span>'+esc(obs?.status==='available'?periodOf(obs):readiness(obs,def)||reasonOf(obs))+'</span></div>';
    }).join('');
    const group=$('researchMetricGroup').value||'ALL',query=$('researchMetricSearch').value.trim().toLowerCase(),availability=$('researchMetricAvailability').value||'ALL';
    const grouped=[...new Set(defs.map(def=>def.group||'Other'))];
    $('researchGroups').innerHTML='<button type="button" data-research-group="ALL" class="'+(group==='ALL'?'is-active':'')+'">ALL METRICS</button>'+grouped.map(name=>{
      const ids=defs.filter(def=>(def.group||'Other')===name).map(def=>def.id);
      const ready=rows.filter(row=>ids.includes(row.id)&&row.status==='available').length;
      return '<button type="button" data-research-group="'+esc(name)+'" class="'+(group===name?'is-active':'')+'">'+esc(name.toUpperCase())+' '+ready+'/'+ids.length+'</button>';
    }).join('');
    const visible=defs.filter(def=>{
      const obs=observation(def.id),ready=obs?.status==='available';
      return (group==='ALL'||def.group===group)&&(availability==='ALL'||(availability==='available'?ready:!ready))&&(!query||[def.id,def.label,def.description,obs?.source].join(' ').toLowerCase().includes(query));
    });
    $('researchMetricCount').textContent=visible.length+' SHOWN / '+defs.length+' METRICS · '+available+' AVAILABLE';
    $('researchMetricRows').innerHTML=visible.length?visible.map(def=>{
      const obs=observation(def.id),ready=obs?.status==='available';
      return '<tr><td><strong>'+esc(def.label||def.id)+'</strong><small>'+esc(def.group||'Other')+'</small>'+metricDetail(obs,def)+'</td><td class="research-number"><strong>'+esc(format(obs?.value,obs?.unit||def.unit,def.id))+'</strong></td><td>'+stateBadge(obs?.status||'missing_data')+'<small>'+esc(readiness(obs,def))+'</small><small>'+esc(reasonOf(obs))+'</small></td><td>'+esc(periodOf(obs))+'<small>Available: '+esc(time(obs?.availableAt))+'</small></td><td>'+esc(obs?.source||'Not loaded')+'<small>'+esc(obs?.methodVersion||def.methodVersion||'Method not supplied')+'</small></td></tr>';
    }).join(''):'<tr><td colspan="5" class="research-empty">No metrics match the selected group, availability or search filters.</td></tr>';
    const errors=array(state.company.errors);
    $('researchCompanyErrors').innerHTML=errors.length?'<ul>'+errors.map(error=>'<li>'+esc((error.source?error.source+': ':'')+message(error))+'</li>').join('')+'</ul>':'';
  }
  async function loadCompany() {
    return action('company','symbol','Loading sourced research for '+state.symbol+'…',async context=>{
      const symbol=state.symbol;await ensureCatalog();guard(context);
      const data=await read('/api/research/company?symbol='+encodeURIComponent(symbol),{key:'company',context});
      if(data.symbol && data.symbol!==symbol) throw Error('The company response does not match the selected security.');
      state.company=data;renderCompany();
      status('Research loaded for '+symbol+'. '+observations().filter(item=>item.status==='available').length+' metrics available; review source dates and unavailable-input reasons.',array(data.errors).length?'':'success');
    });
  }
  function evidenceList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value==='object') return Object.values(value);
    return [];
  }
  function evidenceHtml(value) {
    const rows=evidenceList(value);
    if (!rows.length) return '<p>No detailed input evidence was supplied.</p>';
    return '<div class="research-evidence">'+rows.slice(0,20).map(item=>{
      if(typeof item==='string')return '<div>'+esc(item)+'</div>';
      const obs=item.observation||item.metric||item,metricId=item.metricId||obs.id||item.condition?.metricId;
      const def=definition(metricId||''),threshold=item.threshold??item.expected??item.condition?.value;
      const actual=obs.value??item.observedValue;
      const comparison=(item.operator||item.condition?.operator||'')+(threshold!==undefined?' '+format(threshold,obs.unit||def.unit,metricId):'')+(item.otherMetricId?' '+definition(item.otherMetricId).label:'');
      return '<div><strong>'+esc(def.label||metricId||item.label||'Source evidence')+'</strong> '+esc(format(actual,obs.unit||def.unit,metricId))+(comparison?' · '+esc(comparison):'')+'<small>'+esc(message(item.reason)||item.message||item.status||'')+'</small><small>'+esc(obs.source||item.source||'Source not supplied')+' · '+esc(time(obs.asOf||item.asOf))+(Number.isFinite(obs.sampleCount)?' · '+esc(readiness(obs,def)):'')+'</small></div>';
    }).join('')+'</div>';
  }
  function renderEvaluations() {
    const rows=array(state.evaluations);
    const triggered=rows.filter(row=>row.triggered||row.status==='triggered').length;
    $('researchEvaluationSummary').textContent=rows.length?rows.length+' conditions evaluated for '+state.symbol+' · '+triggered+' triggered. Readiness, source coverage and rule results are distinct from prediction confidence.':'No research rules evaluated for this security. Choose EVALUATE SELECTED SECURITY.';
    $('researchEvaluations').innerHTML=rows.length?rows.map((row,index)=>'<article class="research-evaluation"><div class="research-evaluation-heading"><h4>'+esc(row.name||row.ruleName||row.ruleId||'Research condition')+'</h4>'+stateBadge(row.status||(row.triggered?'triggered':'unavailable'))+'</div><p>'+esc(message(row.reason)||row.description||'Review the inputs and rule readiness.')+'</p>'+evidenceHtml(row.evidence||row.conditions)+'<p>'+esc(row.ruleVersion||row.version||'')+(row.asOf?' · '+esc(time(row.asOf)):'')+'</p>'+((row.triggered||row.status==='triggered')?'<button type="button" data-research-investigate-evaluation="'+index+'">OPEN INVESTIGATION ↗</button>':'')+'</article>').join(''):'<div class="research-empty">No condition results loaded. Conditions without sufficient history remain unavailable or warming up.</div>';
  }
  function renderAlerts() {
    if(state.alerts===null){$('navCount').textContent='—';$('navCount').setAttribute('title','Saved research alerts have not loaded.');return;}
    const alerts=array(state.alerts);$('researchAlertCount').textContent=alerts.length+' SAVED / '+alerts.filter(row=>row.status==='active').length+' ACTIVE';
    $('navCount').textContent=String(alerts.filter(row=>row.status==='active').length).padStart(2,'0');$('navCount').setAttribute('title','Active saved research alerts across supported symbols.');
    $('researchAlerts').innerHTML=alerts.length?alerts.map((alert,index)=>'<article class="research-alert"><div><h4>'+esc(alert.symbol||'')+' · '+esc(alert.name||alert.ruleName||alert.ruleId||'Research alert')+'</h4><p><span class="research-alert-state">'+stateBadge(alert.status||'active')+'</span>'+esc(message(alert.reason)||alert.description||'Saved rule trigger')+'</p><p>First '+esc(time(alert.firstTriggeredAt||alert.createdAt))+' · Last '+esc(time(alert.lastTriggeredAt||alert.updatedAt||alert.asOf))+'</p>'+evidenceHtml(alert.evidence||alert.evaluation?.evidence)+'</div><div class="research-actions">'+(alert.status==='active'?'<button type="button" data-research-alert-state="acknowledged" data-research-alert-index="'+index+'">ACKNOWLEDGE</button>':'')+(alert.status!=='resolved'?'<button type="button" data-research-alert-state="resolved" data-research-alert-index="'+index+'">RESOLVE</button>':'')+'<button type="button" data-research-investigate-alert="'+index+'">INVESTIGATE ↗</button></div></article>').join(''):'<div class="research-empty">No saved triggers. Normal, unavailable and warming-up conditions are shown above; they are not fabricated into alerts.</div>';
  }
  async function evaluate() {
    return action('evaluate','symbol','Evaluating source-backed conditions for '+state.symbol+'…',async context=>{
      const symbol=state.symbol;await ensureCatalog();guard(context);
      const data=await read('/api/research/evaluate',{method:'POST',body:{symbol},key:'evaluate',context});
      if(data.company?.symbol && data.company.symbol!==symbol)throw Error('The rule evidence does not match the selected security.');
      if(data.company){state.company=data.company;renderCompany();}
      state.evaluations=array(data.evaluations);renderEvaluations();
      const saved=await read('/api/research/alerts',{key:'alerts',context});acceptAlerts(saved.alerts);
      renderAlerts();status('Conditions evaluated for '+symbol+'. Unavailable inputs do not create positive matches.','success');
    });
  }
  function acceptAlerts(incoming){
    const current=new Map(array(state.alerts).map(item=>[item.id,item]));
    state.alerts=array(incoming).map(item=>current.get(item.id)?.revision>item.revision?current.get(item.id):item);
    renderAlerts();
  }
  async function loadAlerts({quiet=false}={}) {
    if(quiet){
      try{const data=await read('/api/research/alerts',{key:'alerts'});acceptAlerts(data.alerts);}
      catch(error){if(!error.cancelled)status('Saved alerts could not refresh. Use REFRESH SAVED ALERTS to retry.','error');}
      return;
    }
    return action('alerts','global','Loading locally saved research alerts…',async context=>{
      const data=await read('/api/research/alerts',{key:'alerts',context});acceptAlerts(data.alerts);status(state.alerts.length+' saved research alerts loaded.','success');
    });
  }
  async function updateAlert(index,newStatus) {
    const alert=state.alerts?.[index];if(!alert?.id)return;
    return action('alert:'+alert.id,'global','Updating the saved alert…',async context=>{
      const data=await read('/api/research/alerts/'+encodeURIComponent(alert.id),{method:'PATCH',body:{expectedRevision:alert.revision,status:newStatus},key:'alert:'+alert.id,context});
      const next=data.alert||data;
      state.alerts=state.alerts.map(row=>row.id===alert.id?next:row);renderAlerts();status('Alert '+newStatus+'.','success');
    });
  }
  function metricOptions(selected) {return definitions().map(def=>'<option value="'+esc(def.id)+'" '+(def.id===selected?'selected':'')+'>'+esc(def.label||def.id)+' · '+esc(def.group||'Other')+'</option>').join('');}
  function renderConditions() {
    $('researchConditions').innerHTML=state.conditions.length?state.conditions.map((condition,index)=>{
      const def=definition(condition.metricId),boolean=def.unit==='boolean',metric=Boolean(condition.otherMetricId);
      const operators=boolean?['eq']:['gt','gte','lt','lte','eq','crosses_above','crosses_below'];
      const labels={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'=',crosses_above:'Crosses above',crosses_below:'Crosses below'};
      const rhs=metric?'<select data-condition-other="'+index+'" aria-label="Comparison metric">'+metricOptions(condition.otherMetricId)+'</select>':boolean?'<select data-condition-value="'+index+'" aria-label="Boolean threshold"><option value="true" '+(condition.value===true?'selected':'')+'>True</option><option value="false" '+(condition.value!==true?'selected':'')+'>False</option></select>':'<input data-condition-value="'+index+'" type="number" step="any" value="'+esc(Number.isFinite(condition.value)?condition.value:'')+'" aria-label="Numeric threshold">';
      return '<div class="research-condition"><label>METRIC<select data-condition-metric="'+index+'">'+metricOptions(condition.metricId)+'</select></label><label>OPERATOR<select data-condition-operator="'+index+'">'+operators.map(operator=>'<option value="'+operator+'" '+(condition.operator===operator?'selected':'')+'>'+labels[operator]+'</option>').join('')+'</select></label><label>COMPARE WITH<select data-condition-kind="'+index+'"><option value="value" '+(!metric?'selected':'')+'>Value</option><option value="metric" '+(metric?'selected':'')+'>Metric</option></select></label><label>'+ (metric?'OTHER METRIC':'THRESHOLD')+rhs+'</label><button type="button" data-condition-remove="'+index+'" aria-label="Remove condition '+(index+1)+'">×</button></div>';
    }).join(''):'<div class="research-empty">The metric catalog must load before conditions can be added.</div>';
  }
  function renderScreenChoices() {
    const selected=$('researchScreenSelect').value;
    $('researchScreenSelect').innerHTML='<option value="">New screen / copy current criteria…</option>'+state.presets.map(item=>'<option value="preset:'+esc(item.id)+'">'+esc(item.name)+' · preset</option>').join('')+state.screens.map(item=>'<option value="screen:'+esc(item.id)+'">'+esc(item.name)+' · saved</option>').join('');
    $('researchScreenSelect').value=selected;updateBusy();
  }
  async function loadScreens() {
    return action('screens','global','Loading saved screens and presets…',async context=>{
      await ensureCatalog();guard(context);
      const data=await read('/api/research/screens',{key:'screens',context});state.screens=array(data.screens);if(Array.isArray(data.presets))state.presets=data.presets;
      renderScreenChoices();status('Saved screens and presets loaded.','success');
    });
  }
  function clearScreenResults() {state.screenGeneration++;abortScope('screen');state.screenResults=null;renderScreenResults();}
  function screenPayload() {
    const name=$('researchScreenName').value.trim(),match=$('researchScreenMatch').value;
    if(!name)throw Error('Enter a screen name.');
    if(!state.conditions.length||state.conditions.length>20)throw Error('Use between one and twenty conditions.');
    const ids=new Set(definitions().map(def=>def.id));
    const conditions=state.conditions.map(condition=>{
      if(!ids.has(condition.metricId))throw Error('Choose a supported metric.');
      if(!['gt','gte','lt','lte','eq','crosses_above','crosses_below'].includes(condition.operator))throw Error('Choose a supported comparison.');
      if(condition.otherMetricId){if(!ids.has(condition.otherMetricId))throw Error('Choose a supported comparison metric.');return {metricId:condition.metricId,operator:condition.operator,otherMetricId:condition.otherMetricId};}
      if(typeof condition.value!=='boolean'&&!Number.isFinite(condition.value))throw Error('Every numeric condition needs a finite threshold.');
      return {metricId:condition.metricId,operator:condition.operator,value:condition.value};
    });
    return {name,match:match==='any'?'any':'all',conditions};
  }
  function selectScreen(value) {
    if(!value){state.selectedScreen=null;updateBusy();return;}
    const separator=String(value).indexOf(':'),kind=String(value).slice(0,separator),id=String(value).slice(separator+1);const found=(kind==='screen'?state.screens:state.presets).find(item=>String(item.id)===id);
    if(!found)return;
    state.selectedScreen=kind==='screen'?found:null;state.conditions=array(found.conditions).slice(0,20).map(item=>({...item}));
    $('researchScreenName').value=found.name||'My research screen';$('researchScreenMatch').value=found.match||'all';
    if(Array.isArray(found.symbols)&&found.symbols.length){state.selectedSymbols=new Set(found.symbols);renderCatalog();}
    clearScreenResults();renderConditions();updateBusy();
  }
  async function saveScreen() {
    return action('saveScreen','screen','Saving the screen criteria locally…',async context=>{
      const payload=screenPayload();payload.symbols=[...state.selectedSymbols];
      const selected=state.selectedScreen;
      const body=selected?{screen:{...payload,id:selected.id},expectedRevision:selected.revision}:payload;
      const data=await read('/api/research/screens',{method:'POST',body,key:'saveScreen',context});
      const saved=data.screen||data;state.screens=[...state.screens.filter(item=>item.id!==saved.id),saved];state.selectedScreen=saved;
      renderScreenChoices();$('researchScreenSelect').value='screen:'+saved.id;status('Screen saved locally. It contains criteria, not a raw market-data archive.','success');
    });
  }
  async function deleteScreen() {
    const selected=state.selectedScreen;if(!selected)return;
    return action('deleteScreen','screen','Deleting the selected saved screen…',async context=>{
      await read('/api/research/screens/'+encodeURIComponent(selected.id),{method:'DELETE',body:{expectedRevision:selected.revision},key:'deleteScreen',context});
      state.screens=state.screens.filter(item=>item.id!==selected.id);state.selectedScreen=null;renderScreenChoices();status('Saved screen deleted.','success');
    });
  }
  function renderScreenResults() {
    if(!state.screenResults){$('researchScreenResultCount').textContent='NOT RUN';$('researchScreenResults').innerHTML='<div class="research-empty">Run the current criteria to inspect explained matches. Changing a condition clears the previous result.</div>';return;}
    const results=array(state.screenResults.results),matches=results.filter(item=>item.match===true||item.matched===true);
    $('researchScreenResultCount').textContent=matches.length+' MATCHES / '+results.length+' EVALUATED';
    const coverage=state.screenResults.coverage;
    $('researchScreenCoverage').textContent=typeof coverage==='string'?coverage:message(coverage)||results.length+' supported symbols evaluated; missing source inputs remain unknown.';
    $('researchScreenResults').innerHTML=(results.length?results.map((result,index)=>{
      const matched=result.match??result.matched,kind=matched===true?'matched':matched===false?'not_matched':'unknown';
      return '<article class="research-screen-result"><div class="research-screen-result-heading"><h4>'+esc(result.symbol||'')+' '+stateBadge(result.status||kind)+'</h4>'+(matched===true?'<button type="button" data-research-investigate-screen="'+index+'">OPEN INVESTIGATION ↗</button>':'')+'</div><p>'+esc(message(result.reason)||result.message||(matched===true?'All required matching conditions passed.':matched===false?'The requested conditions did not match.':'The required inputs do not establish a match.'))+'</p><details><summary>Inspect condition evidence</summary>'+evidenceHtml(result.evidence||result.conditions||result.evaluation?.evidence)+'</details></article>';
    }).join(''):'<div class="research-empty">No screen results were returned.</div>')+
      (array(state.screenResults.errors).length?'<div class="research-source-errors"><ul>'+state.screenResults.errors.map(error=>'<li>'+esc((error.symbol?error.symbol+': ':'')+message(error))+'</li>').join('')+'</ul></div>':'');
  }
  async function runScreen() {
    return action('scan','screen','Screening selected pilot symbols. Provider requests may take a moment…',async context=>{
      await ensureCatalog();guard(context);const screen=screenPayload(),symbols=[...state.selectedSymbols];
      if(!symbols.length||symbols.length>10)throw Error('Select between one and ten supported symbols.');
      const data=await read('/api/research/screen',{method:'POST',body:{symbols,screen},key:'scan',context,timeoutMs:120000});
      state.screenResults=data;renderScreenResults();status('Screen complete. Review non-matches and unavailable inputs alongside positive matches.','success');
    });
  }
  function renderFilings() {
    $('researchFilingCount').textContent=state.filings.length+' RECORDS';
    $('researchFilingList').innerHTML=state.filings.length?state.filings.map((filing,index)=>'<button type="button" class="research-filing-option '+(filing.accession===state.selectedAccession?'is-active':'')+'" data-research-filing="'+index+'"><strong>'+esc(filing.form||'Filing')+' · '+esc(filing.filingDate||'Date unavailable')+'</strong><small>'+esc(filing.headline||'SEC filing')+'</small><small>Reported period '+esc(filing.periodEnd||'Not supplied')+'</small></button>').join(''):'<div class="research-empty">No filings loaded for this security. ETFs and unmapped issuers may not have supported company filings.</div>';
  }
  async function loadFilings() {
    return action('filings','symbol','Loading SEC filing metadata for '+state.symbol+'…',async context=>{
      const symbol=state.symbol;
      const data=await read('/api/intelligence/filings?symbol='+encodeURIComponent(symbol),{key:'filings',context});
      state.filings=array(data.filings);state.filing=null;state.selectedAccession=null;renderFilings();renderFilingDetail();
      status(state.filings.length+' SEC filing records loaded for '+symbol+'. Select a document to read its supported evidence.','success');
    });
  }
  function limitationsHtml(items) {
    return array(items).length?'<div class="research-limitations"><ul>'+array(items).map(item=>'<li>'+esc(message(item)||item)+'</li>').join('')+'</ul></div>':'';
  }
  function renderFilingDetail() {
    const data=state.filing;
    if(!data){$('researchFilingMode').textContent='NO DOCUMENT SELECTED';$('researchFilingDetail').innerHTML='<div class="research-empty">Select a filing to inspect parsed content and exact source passages.</div>';return;}
    const filing=data.filing||{},summary=Array.isArray(data.summary)?data.summary:typeof data.summary==='string'?[data.summary]:[];
    $('researchFilingMode').textContent='EXTRACTED DOCUMENT EVIDENCE';
    $('researchFilingDetail').innerHTML='<div class="research-document"><h3>'+esc(filing.headline||filing.form||'SEC filing')+'</h3><p>'+esc(filing.form||'')+' · Filed '+esc(filing.filingDate||'Unknown')+' · Occurred '+esc(filing.occurredAt||'Not established')+'</p><p>'+link(filing.sourceUrl||data.sourceUrl,'OPEN ORIGINAL SEC DOCUMENT ↗')+'</p><h4>EXTRACTED SUMMARY</h4>'+
      (summary.length?summary.map(item=>'<p>'+esc(typeof item==='string'?item:item.text||item.summary||'')+(item.evidenceId?' <small>[Evidence '+esc(item.evidenceId)+']</small>':'')+'</p>').join(''):'<p>No supported summary could be extracted. Review the original document and available passages.</p>')+
      '<h4>CLASSIFIED FILING ITEMS</h4>'+array(data.items).slice(0,30).map(item=>'<details><summary>'+esc(item.code||item.item||'Item')+' · '+esc(item.title||item.label||'Source section')+'</summary><pre>'+esc(String(item.text||item.excerpt||'No text supplied').slice(0,16000))+'</pre></details>').join('')+
      '<h4>SOURCE PASSAGES</h4>'+(array(data.evidence).length?array(data.evidence).slice(0,25).map(item=>'<p><strong>'+esc(item.id||'Evidence')+' · '+esc(item.section||item.title||'Document')+'</strong></p><blockquote>'+esc(String(item.text||item.quote||'').slice(0,10000))+'</blockquote><p>'+link(item.sourceUrl||filing.sourceUrl,'VERIFY SOURCE ↗')+'</p>').join(''):'<p>No passage evidence returned.</p>')+limitationsHtml(data.limitations)+'</div>';
  }
  async function loadFiling(index) {
    const filing=state.filings[index];if(!filing?.accession)return;
    return action('filing','symbol','Reading the selected SEC document…',async context=>{
      const accession=filing.accession,symbol=state.symbol;
      const data=await read('/api/research/filing?symbol='+encodeURIComponent(symbol)+'&accession='+encodeURIComponent(accession),{key:'filing',context});
      state.filing=data;state.selectedAccession=accession;renderFilings();renderFilingDetail();status('Filing content loaded. Extracted passages and stated limitations support each description.','success');
    });
  }
  function eventFacts(event) {
    if(!event)return 'No event selected.';
    return (event.title||event.headline||event.id||'Official event')+' · magnitude '+(event.magnitude??event.mag??'unknown')+' · depth '+(event.depthKm??'unknown')+' km · occurred '+time(event.occurredAt||event.time)+' · updated '+time(event.updatedAt)+'. Source updates are not assumed to be original publication times. No company exposure is inferred.';
  }
  function selectedEvent() {return state.earthquakes.find(event=>event.id===state.eventId)||state.analogues?.event||null;}
  function describeFeature(item) {
    if(typeof item==='string')return item;
    if(!item||typeof item!=='object')return '';
    if(item.feature){
      const label=({depthKm:'Depth',distanceKm:'Epicentre distance',magnitude:'Magnitude'})[item.feature]||String(item.feature).replaceAll('_',' '),unit=item.unit?' '+item.unit:'';
      return label+': '+(item.selected!==undefined?'selected '+format(item.selected)+unit+', historical '+format(item.candidate)+unit:'comparison distance')+
        (Number.isFinite(item.difference)?', difference '+format(item.difference)+unit:'')+
        (Number.isFinite(item.weight)?' · weight '+format(item.weight*100,'%'):'');
    }
    return message(item)||item.label||'Feature details unavailable';
  }
  async function loadEarthquakes() {
    state.eventGeneration++;abortScope('event');
    return action('earthquakes','event','Loading official earthquake records…',async context=>{
      const data=await read('/api/research/earthquakes',{key:'earthquakes',context});
      state.earthquakes=array(data.events);state.eventId=state.earthquakes[0]?.id||'';state.analogues=null;state.outcomes=null;
      $('researchEarthquake').innerHTML=state.earthquakes.length?state.earthquakes.map(event=>'<option value="'+esc(event.id)+'">'+esc(event.title||event.headline||event.id)+'</option>').join(''):'<option value="">No records returned</option>';
      $('researchEarthquake').value=state.eventId;$('researchEventFacts').textContent=eventFacts(selectedEvent());renderAnalogues();renderOutcomes();
      status(state.earthquakes.length+' official earthquake records loaded. Select an event to request historical analogues.','success');
    });
  }
  function renderAnalogues() {
    const data=state.analogues;
    if(!data){$('researchAnalogues').innerHTML='<div class="research-empty">Select an official event, then request historical analogues. No comparison has been calculated.</div>';return;}
    const matches=array(data.matches),coverage=data.coverage;
    const coverageText=coverage&&typeof coverage==='object'?[coverage.provider||'Historical catalog',coverage.independentCandidateCount!==undefined?coverage.independentCandidateCount+' independent candidates':'',coverage.radiusKm!==undefined?coverage.radiusKm+' km query radius':'',coverage.from&&coverage.to?coverage.from+' → '+coverage.to:'',coverage.queryCapReached?'Query cap reached; earlier events may be absent.':'',coverage.selection||''].filter(Boolean).join(' · '):typeof coverage==='string'?coverage:'';
    $('researchAnalogues').innerHTML=(coverageText?'<div class="research-note">'+esc(coverageText)+'</div>':'')+(matches.length?'<div class="research-analogue-list">'+matches.map((match,index)=>{
      const event=match.event||match,score=typeof match.similarity==='number'?match.similarity:match.similarity?.score;
      const features=array(match.matchedFeatures||match.reasons),differences=array(match.differences);
      return '<article class="research-analogue"><h4>'+esc(event.title||event.headline||event.id||'Historical event')+'</h4><span class="research-analogue-score">SIMILARITY RANKING '+esc(Number.isFinite(score)?score.toFixed(3):'Not supplied')+' · NOT A PROBABILITY</span><p>'+esc(eventFacts(event))+'</p><ul>'+features.map(item=>'<li>'+esc(describeFeature(item))+'</li>').join('')+'</ul>'+(differences.length?'<p>Differences: '+esc(differences.map(describeFeature).join('; '))+'</p>':'')+'<p>'+link(event.sourceUrl,'VERIFY OFFICIAL EVENT ↗')+'</p><button type="button" data-research-outcome="'+index+'">COMPARE '+esc(state.symbol)+' OUTCOMES</button>'+limitationsHtml(match.limitations)+'</article>';
    }).join('')+'</div>':'<div class="research-empty">No comparable historical events were returned. Insufficient history is not a zero-impact forecast.</div>')+limitationsHtml(data.limitations);
  }
  async function findAnalogues() {
    return action('analogues','event','Finding explainable historical earthquake comparisons…',async context=>{
      const eventId=state.eventId;if(!eventId)throw Error('Load and select an official earthquake first.');
      const data=await read('/api/research/analogues?eventId='+encodeURIComponent(eventId),{key:'analogues',context});
      state.analogues=data;state.outcomes=null;$('researchEventFacts').textContent=eventFacts(data.event||selectedEvent());renderAnalogues();renderOutcomes();
      status(array(data.matches).length+' historical comparisons loaded. Inspect differences, data coverage and exposure limitations.','success');
    });
  }
  function renderOutcomes() {
    const data=state.outcomes;
    $('researchInvestigateOutcome').hidden=!(data?.study&&state.outcomeEvent);
    if(!data){$('researchOutcomeLabel').textContent='NO COMPARISON LOADED';$('researchOutcomes').innerHTML='<div class="research-empty">Choose a historical match to request outcomes for the selected supported security. Historical comparison does not establish causal exposure.</div>';return;}
    const study=data.study||data;
    $('researchOutcomeLabel').textContent=(data.symbol||state.symbol)+' / '+(data.benchmark||'SPY')+' · '+(data.source||'Source not supplied');
    if(study.status!=='observed'){$('researchOutcomes').innerHTML='<div class="research-empty">'+esc(study.reason||'Insufficient matching completed-session observations.')+'</div>'+limitationsHtml(study.limitations||data.limitations);return;}
    $('researchOutcomes').innerHTML='<div class="research-outcome-meta">Reference session '+esc(study.referenceSession||'Not supplied')+' · '+esc(study.method||'Historical daily comparison')+'</div><div class="research-table-scroll"><table class="research-table" aria-label="Historical event market outcomes"><thead><tr><th>HORIZON</th><th>STATUS</th><th class="research-number">SECURITY RETURN</th><th class="research-number">BENCHMARK RETURN</th><th class="research-number">RELATIVE RETURN (PP)</th></tr></thead><tbody>'+array(study.horizons).map(item=>'<tr><td>'+esc(item.sessions)+' sessions</td><td>'+stateBadge(item.status==='observed'?'available':item.status||'unknown')+'</td><td class="research-number">'+esc(format(item.stockReturnPct,'%'))+'</td><td class="research-number">'+esc(format(item.benchmarkReturnPct,'%'))+'</td><td class="research-number">'+esc(format(item.relativeReturnPct,'pp'))+'</td></tr>').join('')+'</tbody></table></div>'+limitationsHtml(study.limitations||data.limitations);
  }
  async function loadOutcomes(index) {
    const match=state.analogues?.matches?.[index],event=match?.event||match;
    if(!event)return;
    return action('outcomes','outcome','Loading supported historical market outcomes…',async context=>{
      const eventTime=event.occurredAt||event.time;
      if(!validTime(eventTime))throw Error('The selected historical event has no usable occurrence time.');
      const data=await read('/api/research/event-outcomes?symbol='+encodeURIComponent(state.symbol)+'&eventTime='+encodeURIComponent(eventTime),{key:'outcomes',context});
      state.outcomeEvent=event;state.outcomes=data;renderOutcomes();status('Historical outcome request completed. Unsupported or unfinished horizons remain unavailable.','success');
    });
  }
  function createHistoricalInvestigation() {
    const historical=state.outcomeEvent,data=state.outcomes;
    if(!historical||!data?.study||data.symbol&&data.symbol!==state.symbol)return;
    const current=state.analogues?.event||selectedEvent();
    const match=array(state.analogues?.matches).find(row=>(row.event||row).id===historical.id);
    const similarity=typeof match?.similarity==='number'?match.similarity:match?.similarity?.score;
    const description=('Retrospective comparison: selected current event '+(current?.id||'unknown')+'; historical event '+historical.id+
      '. Captured return windows belong to this historical event only. Attribute similarity '+(Number.isFinite(similarity)?similarity.toFixed(3):'unavailable')+
      ' is not a prediction probability. Company exposure and economic linkage remain UNVERIFIED; returns do not establish causation.').slice(0,1200);
    const payload={symbol:state.symbol,event:{id:historical.id,headline:historical.title||historical.headline||'Historical earthquake',category:'NATURAL',type:'EARTHQUAKE',source:'USGS',sourceUrl:safeUrl(historical.sourceUrl),occurredAt:validTime(historical.occurredAt)?historical.occurredAt:null,publishedAt:null,ingestedAt:null,symbols:[],evidenceLevel:'retrospective_catalog_comparison',synthetic:false,summary:description},context:{study:{study:structuredClone(data.study)},research:{description,observations:[],evidence:[]}}};
    document.dispatchEvent(new CustomEvent('tradescope:research-investigate',{detail:payload}));
    status('Opening the historical USGS event and its captured return windows in Investigations…');
  }
  function createInvestigation(kind,index) {
    const item=kind==='alert'?state.alerts?.[index]:kind==='screen'?state.screenResults?.results?.[index]:state.evaluations[index];
    if(!item)return;
    const symbol=item.symbol||state.symbol,evidence=evidenceList(item.evidence||item.conditions||item.evaluation?.evidence);
    const sourceReference=evidence.map(row=>row?.sourceUrl||row?.observation?.sourceUrl).find(safeUrl)||null;
    const dated=evidence.find(row=>validTime(row?.asOf||row?.observation?.asOf));
    const when=item.asOf||dated?.asOf||dated?.observation?.asOf||null;
    const captured=evidence.flatMap(row=>{
      if(!row||typeof row!=='object')return [];
      const obs=row.observation||row.metric||row,id=row.metricId||obs.id;
      if(!id)return [];
      return [{id,value:obs.value??row.observedValue??null,status:obs.status==='available'||row.passed!==null&&row.passed!==undefined?'available':obs.status||'unknown',reason:message(obs.reason)||message(row.reason),unit:obs.unit||definition(id).unit,source:obs.source||row.source,asOf:obs.asOf||row.asOf,availableAt:obs.availableAt||row.availableAt,periodStart:obs.periodStart,periodEnd:obs.periodEnd,methodVersion:obs.methodVersion||row.methodVersion,sampleCount:obs.sampleCount,requiredCount:obs.requiredCount}];
    });
    const label=kind==='screen'?'Screen match: '+$('researchScreenName').value:item.name||item.ruleName||item.ruleId||'Research condition';
    const payload={symbol,event:{id:'research:'+(item.id||item.ruleId||kind+':'+index)+':'+(when||'undated'),headline:label,category:'RESEARCH',type:kind==='screen'?'SCREEN_MATCH':'RESEARCH_CONDITION',source:'TradeScope Research Rules',sourceUrl:sourceReference,occurredAt:validTime(when)&&when.includes('T')?when:null,publishedAt:null,ingestedAt:null,symbols:[symbol],evidenceLevel:'derived_metric_condition',synthetic:false,summary:(message(item.reason)||'Source-backed research conditions matched; review individual inputs and methodology.')+' Association does not establish causation.'},context:{research:{kind,ruleId:item.ruleId||null,ruleVersion:item.ruleVersion||item.version||null,description:message(item.reason),observations:captured,evidence}}};
    document.dispatchEvent(new CustomEvent('tradescope:research-investigate',{detail:payload}));
    status('Opening source-linked research evidence in Investigations…');
  }
  function showTab(tab) {
    if(!tabs.includes(tab))tab='company';state.tab=tab;
    document.querySelectorAll('[data-research-tab]').forEach(button=>{const selected=button.dataset.researchTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    document.querySelectorAll('[data-research-panel]').forEach(panel=>{panel.hidden=panel.dataset.researchPanel!==tab;});
    if(tab==='signals'){renderEvaluations();void loadAlerts();}
    if(tab==='screener')void loadScreens();
    watchAlerts();
    document.dispatchEvent(new CustomEvent('tradescope:research-tab',{detail:{tab}}));
  }
  function changeSymbol(value) {
    if(value===state.symbol)return;
    state.generation++;abortScope('symbol');state.symbol=value;
    state.company=null;state.evaluations=[];state.filings=[];state.filing=null;state.selectedAccession=null;state.outcomes=null;
    renderCompany();renderEvaluations();renderFilings();renderFilingDetail();renderOutcomes();renderAnalogues();
    status('Selected '+value+'. Previous-company metrics, rule evidence and document content were cleared; load this security to continue.');
  }
  function on(id,name,handler) {$(id)?.addEventListener(name,handler);}
  function delegated(container,handler){on(container,'click',event=>{const target=event.target.closest?.('button');if(target)handler(target.dataset,event);});}
  on('researchLoad','click',loadCompany);
  on('researchCatalogRetry','click',()=>action('catalog','global','Refreshing the metric and instrument catalog…',async()=>{await ensureCatalog(true);status('Research catalog loaded. Sources remain requested explicitly.','success');}));
  on('researchSymbol','change',event=>changeSymbol(event.target.value));
  for(const id of ['researchMetricSearch','researchMetricGroup','researchMetricAvailability'])on(id,id==='researchMetricSearch'?'input':'change',renderCompany);
  delegated('researchGroups',data=>{if(data.researchGroup!==undefined){$('researchMetricGroup').value=data.researchGroup;renderCompany();}});
  on('researchEvaluate','click',evaluate);on('researchRefreshAlerts','click',loadAlerts);
  delegated('researchEvaluations',data=>{if(data.researchInvestigateEvaluation!==undefined)createInvestigation('evaluation',Number(data.researchInvestigateEvaluation));});
  delegated('researchAlerts',data=>{if(data.researchAlertState)void updateAlert(Number(data.researchAlertIndex),data.researchAlertState);else if(data.researchInvestigateAlert!==undefined)createInvestigation('alert',Number(data.researchInvestigateAlert));});
  on('researchScreenSelect','change',event=>selectScreen(event.target.value));
  on('researchScreenMatch','change',clearScreenResults);
  on('researchAddCondition','click',()=>{if(!definitions().length){status('Load the metric catalog first.','error');return;}if(state.conditions.length>=20){status('The pilot supports up to twenty conditions per screen.','error');return;}state.conditions.push({metricId:definitions()[0].id,operator:'gt',value:0});clearScreenResults();renderConditions();});
  delegated('researchConditions',data=>{if(data.conditionRemove!==undefined){state.conditions.splice(Number(data.conditionRemove),1);clearScreenResults();renderConditions();}});
  function updateCondition(event) {
    const target=event.target,data=target.dataset||{};
    for(const [key,property] of [['conditionMetric','metricId'],['conditionOperator','operator'],['conditionOther','otherMetricId'],['conditionValue','value'],['conditionKind','kind']]){
      if(data[key]===undefined)continue;
      const row=state.conditions[Number(data[key])];if(!row)return;
      if(property==='kind'){if(target.value==='metric'){row.otherMetricId=definitions().find(def=>def.id!==row.metricId)?.id||row.metricId;delete row.value;}else{delete row.otherMetricId;row.value=definition(row.metricId).unit==='boolean'?false:0;}}
      else if(property==='value')row.value=target.value==='true'?true:target.value==='false'?false:target.value.trim()===''?NaN:Number(target.value);
      else row[property]=target.value;
      if(property==='metricId'){if(definition(row.metricId).unit==='boolean'){row.operator='eq';row.value=false;delete row.otherMetricId;}else if(typeof row.value==='boolean'){row.value=0;row.operator='gt';}}
      clearScreenResults();if(property!=='value')renderConditions();return;
    }
  }
  on('researchConditions','change',updateCondition);on('researchConditions','input',event=>{if(event.target.dataset?.conditionValue!==undefined)updateCondition(event);});
  on('researchScreenSymbols','change',event=>{const symbol=event.target.dataset?.researchSymbol;if(!symbol)return;if(event.target.checked)state.selectedSymbols.add(symbol);else state.selectedSymbols.delete(symbol);clearScreenResults();});
  on('researchSaveScreen','click',saveScreen);on('researchDeleteScreen','click',deleteScreen);on('researchRunScreen','click',runScreen);
  delegated('researchScreenResults',data=>{if(data.researchInvestigateScreen!==undefined)createInvestigation('screen',Number(data.researchInvestigateScreen));});
  on('researchLoadFilings','click',loadFilings);delegated('researchFilingList',data=>{if(data.researchFiling!==undefined)void loadFiling(Number(data.researchFiling));});
  on('researchLoadEarthquakes','click',loadEarthquakes);on('researchFindAnalogues','click',findAnalogues);
  on('researchEarthquake','change',event=>{state.eventGeneration++;abortScope('event');state.eventId=event.target.value;state.analogues=null;state.outcomes=null;$('researchEventFacts').textContent=eventFacts(selectedEvent());renderAnalogues();renderOutcomes();});
  delegated('researchAnalogues',data=>{if(data.researchOutcome!==undefined)void loadOutcomes(Number(data.researchOutcome));});
  on('researchInvestigateOutcome','click',createHistoricalInvestigation);
  document.querySelectorAll('[data-research-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.researchTab)));
  document.querySelectorAll('[data-research-tab]').forEach((button,index,buttons)=>button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;showTab(buttons[next].dataset.researchTab);buttons[next].focus();}));
  document.addEventListener('tradescope:workspace',event=>{
    workspaceActive=event.detail?.view==='research';
    if(!workspaceActive){watchAlerts();return;}
    showTab(event.detail.nav==='signals'?'signals':event.detail.nav==='screener'?'screener':'company');
    void action('catalog','global','Loading research catalog…',async()=>{await ensureCatalog();status('Research catalog ready. Choose a security and load sources, or open a research tool.','success');});
  });
  document.addEventListener('tradescope:research-investigation-result',event=>{if(event.detail?.error)status(event.detail.error,'error');else if(event.detail?.id)status('Research evidence saved in investigation '+event.detail.id+'.','success');});
  document.addEventListener('tradescope:research-alerts-changed',()=>{void loadAlerts();});
  document.addEventListener('visibilitychange',watchAlerts);
  window.addEventListener('pagehide',()=>{clearTimeout(alertsTimer);for(const job of state.requests.values())job.controller.abort();state.requests.clear();});
  window.TradeScopeResearch=Object.freeze({openTab:showTab,getSelection:()=>({symbol:state.symbol,tab:state.tab,company:state.company?structuredClone(state.company):null})});
})();
