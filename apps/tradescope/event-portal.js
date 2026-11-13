/* ResearchOS Event Intelligence v0.28 — no automatic inference of issuer impacts. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const safeLink=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const link=(url,label)=>{const s=safeLink(url);return s?'<a href="'+esc(s)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'Source unavailable';};
const load=async(path)=>{const r=await fetch('/api/event-intelligence/'+path,{cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Research API unavailable');return j;};
let catalog=null,caseSeq=0,faaSeq=0;
const familyName=id=>catalog?.families.find(f=>f.id===id)?.label||id;
function renderCatalog(){
 if(!catalog)return;
 const theme=$('familyFilter').value,q=$('scenarioSearch').value.toLowerCase().trim();
 const items=catalog.scenarios.filter(s=>(theme==='all'||s.theme===theme)&&
  (s.title+' '+s.industry+' '+s.eventClass+' '+s.theme).toLowerCase().includes(q));
 $('matches').textContent=items.length+' / '+catalog.scenarios.length+' PATHWAYS';
 $('scenarioList').innerHTML=items.length?items.map(s=>'<article class="scenario-card '+(s.caseId?'active':'')+'"><div class="card-top"><span class="tiny-label">'+esc(familyName(s.theme))+'</span><span class="state-label">'+esc(s.status.replaceAll('_',' '))+'</span></div><h3>'+esc(s.title)+'</h3><p>'+esc(s.industry)+'</p><p>'+esc(s.limitations)+'</p><a href="'+(s.caseId?'#case-study':'/transmission-lab.html')+'">'+(s.caseId?'Inspect source-dated case':'Open transmission hypotheses')+' ↗</a></article>').join(''):'<div class="empty">No matching pathways. Change the filter.</div>';
}
async function initCatalog(){
 try{
  catalog=await load('catalog');
  $('familyCount').textContent=catalog.families.length;
  $('scenarioCount').textContent=catalog.scenarioCount;
  $('familyFilter').innerHTML='<option value="all">All event families</option>'+catalog.families.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.label)+'</option>').join('');
  $('catalogStatus').textContent=catalog.scenarioCount+' PATHWAYS · 1 SHARED REGISTRY';
  $('familyFilter').addEventListener('change',renderCatalog);
  $('scenarioSearch').addEventListener('input',renderCatalog);
  renderCatalog();
 }catch(e){$('catalogStatus').textContent='REGISTRY UNAVAILABLE';$('scenarioList').textContent='Cannot load catalog: '+e.message;}
}
function renderCase(data){
 const isReplay=data.mode==='PRECURSOR_REPLAY_RESTRICTED';
 const ev=data.event;
 $('caseOverview').innerHTML='<div class="status-row"><span class="tag '+(isReplay?'warning':'')+'">'+
  (isReplay?'PRE-EVENT / NO INCIDENT KNOWLEDGE':'RETROSPECTIVE / EVENT REPORTED')+'</span><span class="tag">PREDICTIVE VALIDATION: NOT ESTABLISHED</span></div>'+
  '<h3>'+esc(isReplay?'What was publicly documented before the incident?':ev.title)+'</h3>'+
  '<p>'+esc(isReplay?'The system hides post-event facts, outcomes and issuer pathways. Sources are filtered by conservative publication-day cutoffs; first-seen archival proof is still missing.':ev.description)+'</p>'+
  '<small>'+esc(data.precursorContext.statement)+'</small>';
 const e=data.precursorContext.observations;
 $('precursors').innerHTML=e.length?e.map(x=>'<article class="evidence-item"><div class="item-top"><span>'+esc(x.kind)+' / '+esc(x.publishedOn)+'</span><span class="unverified">First-seen unverified</span></div><h3 class="item-heading">'+esc(x.title)+'</h3><p class="item-body">'+esc(x.summary)+'</p><div class="item-foot">'+link(x.url,x.source)+'</div></article>').join(''):'<div class="empty">No dated precursor documents were eligible by this checkpoint. This is not evidence that no warnings existed.</div>';
 $('pathways').innerHTML=data.pathways.length?data.pathways.map(p=>'<article class="path-item"><div class="item-top"><span>'+esc(p.horizon.replaceAll('_',' '))+'</span><span>UNVERIFIED TRANSMISSION</span></div><h3 class="item-heading">'+esc(p.title)+'</h3><p class="item-body">'+esc(p.mechanism)+'</p><div class="item-foot">Investigate: '+esc(p.candidates.join(', ')||'No verified issuer candidates')+'</div><p class="item-body"><strong>Proof needed:</strong> '+esc(p.checks.join(' · '))+'</p></article>').join(''):'<div class="empty">Incident-dependent market impact pathways are intentionally hidden before the event. No future issuer information can be used as a precursor.</div>';
 $('challenges').innerHTML=data.challenges.map(c=>'<article class="challenge-item"><div class="item-top"><span>'+esc(c.code)+'</span><span>OPEN CHALLENGE</span></div><h3 class="item-heading">'+esc(c.question)+'</h3><p class="item-body">'+esc(c.required)+'</p></article>').join('');
 $('analogues').innerHTML=data.analogues.length?data.analogues.map(a=>'<article class="analogue-item"><div class="item-top"><span>'+esc(a.date)+'</span><span>'+esc(a.comparability)+'</span></div><h3 class="item-heading">'+esc(a.event)+'</h3><p class="item-body">'+esc(a.reason)+'</p></article>').join(''):'<div class="empty">Historical event analogues are hidden in this pre-event checkpoint to avoid selecting them with hindsight.</div>';
}
async function runCase(){
 const version=++caseSeq,button=$('loadCase'),selected=$('asOf').value;
 button.disabled=true;$('caseStatus').textContent='Checking dated evidence…';
 try{
  const d=await load('case?id=faa-national-ground-stop-2026-11-13'+(selected==='current'?'':'&asOf='+encodeURIComponent(selected)));
  if(version!==caseSeq)return;
  renderCase(d);
  $('caseStatus').textContent=selected==='current'?'Retrospective case · financial outcomes unverified':'Pre-event document-date cutoff applied · no historical first-seen proof';
 }catch(e){if(version===caseSeq){$('caseStatus').textContent='Case unavailable: '+e.message;}}
 finally{if(version===caseSeq)button.disabled=false;}
}
async function refreshFaa(){
 const version=++faaSeq,button=$('refreshFaa');
 button.disabled=true;$('faaStatus').textContent='Requesting FAA current airport events…';$('faaResults').innerHTML='';
 try{
  const d=await load('faa-live');if(version!==faaSeq)return;
  $('faaStatus').innerHTML='<strong>FAA current airport snapshot</strong> · Captured '+esc(d.fetchedAt)+
  ' · '+esc(d.counts.groundStops)+' ground stops / '+esc(d.counts.groundDelays)+' ground delay programs / '+esc(d.counts.airportClosures)+' closures. <strong>Nationwide order not verified from this feed.</strong> '+link('https://nasstatus.faa.gov/','Official FAA status');
  $('faaResults').innerHTML=d.events.length?d.events.slice(0,32).map(x=>
   '<article class="faa-item"><strong>'+esc(x.airport)+' · '+esc(x.type.replaceAll('_',' '))+'</strong><small>'+esc(x.reason||'Reason unavailable')+'</small></article>').join(''):'<div class="empty">No normalized ground stops, delays or closures in this response. This cannot establish systemwide normal operations.</div>';
 }catch(e){if(version===faaSeq){$('faaStatus').textContent='FAA status unavailable: '+e.message+'. No fallback live data is assumed.';}}
 finally{if(version===faaSeq)button.disabled=false;}
}
$('loadCase').addEventListener('click',runCase);
$('asOf').addEventListener('change',runCase);
$('refreshFaa').addEventListener('click',refreshFaa);
void initCatalog();void runCase();
})();