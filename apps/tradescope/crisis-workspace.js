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
 $('crisisDetail')?.addEventListener('click',event=>{if(event.target.closest?.('#crisisMacroRun'))void loadMacro();});
 $('crisisLoad')?.addEventListener('click',()=>void load());
 $('crisisOpen')?.addEventListener('click',()=>void open($('crisisSelect').value));
 $('crisisCases')?.addEventListener('click',event=>{const id=event.target.closest?.('[data-crisis-id]')?.dataset.crisisId;
  if(id){$('crisisSelect').value=id;void open(id);}});
 document.addEventListener('tradescope:research-tab',event=>{if(event.detail?.tab==='crisis'&&!catalog)void load();});
})();
