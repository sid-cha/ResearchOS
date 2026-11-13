/* TradeScope v0.22: visible source-evidence states, no synthetic graph signals. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const req=async route=>{const r=await fetch('/api/transmission-dossier/'+route,{cache:'no-store'});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to load research evidence');return d;};
let catalog=null,last=null,selected=null,runId=0;
const setStatus=s=>el('status').textContent=s;
function regionOptions(){
 if(!catalog)return;
 const scope=catalog.scenarios.find(x=>x.id===el('scenario').value);
 if(!scope)return;
 const names={'argentina-pampas':'Argentina · Pampas grid point','brazil-south':'Brazil · Southern grid point',
  'california-foothills':'California · Foothills point','colorado-high-country':'Colorado · High-country point'};
 el('region').innerHTML=scope.regions.map(id=>'<option value="'+esc(id)+'">'+esc(names[id]||id)+'</option>').join('');
}
function settings(){
 if(!catalog)return;
 const scenario=el('scenario').value;
 const enso=scenario==='enso-fertilizer';
 const historical=el('mode').value==='historical';
 el('commodityWrap').hidden=!enso;
 el('yearWrap').hidden=historical;
 el('asOfWrap').hidden=!historical;
 const opt=[...el('mode').options].find(x=>x.value==='historical');
 opt.disabled=!enso;
 if(!enso&&historical){el('mode').value='current';el('yearWrap').hidden=false;el('asOfWrap').hidden=true;}
 el('export').disabled=true;
 last=null;
}
const goodUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&
  ['www.eia.gov','www.usgs.gov','pubs.usgs.gov','power.larc.nasa.gov','www.sec.gov','www.federalregister.gov',
  'comtradeplus.un.org','apps.fas.usda.gov','www.cpc.ncep.noaa.gov','cpc.ncep.noaa.gov',
  'www.gdeltproject.org','api.gdeltproject.org'].includes(u.hostname)?u.href:null}catch{return null}};
function inspectNode(id){
 if(!last)return;
 const node=last.nodes.find(n=>n.id===id);if(!node)return;
 selected=id;
 document.querySelectorAll('.node').forEach(x=>x.classList.toggle('active',x.dataset.node===id));
 const rows=node.researchInputs||[];
 const original=node.observation;
 const items=original?[{label:'NOAA CPC issued discussion; original archive revision remains unverified',
  sourceUrl:original.sourceUrl,period:original.issueDate,value:null,unit:null,
  dataClass:'ISSUE_DATED_PUBLICATION_CLOCK_UNVERIFIED',kind:'CLIMATE_ISSUED_DOCUMENT'}]:[];
 items.push(...rows);
 const html=items.length?'<ul class="evidence-list">'+items.map(x=>{
  const u=goodUrl(x.sourceUrl);
  return '<li><strong>'+esc(x.label)+'</strong>'+
   '<small>'+esc(x.period||'undated')+(x.value==null?'':' · '+esc(x.value)+' '+esc(x.unit||''))+'</small>'+
   '<small>'+esc(x.dataClass||x.kind||'research context')+'</small>'+
   (u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">View primary source</a>':'')+'</li>';
 }).join('')+'</ul>':
 '<div class="empty">No eligible input context is available for this node. Lack of evidence is not evidence of no impact.</div>';
 el('nodeInspector').innerHTML='<div class="inspector-type">'+esc(node.type)+' · STAGE '+esc(node.stage)+'</div>'+
  '<h3 class="inspector-title">'+esc(node.label)+'</h3><p class="inspector-sub"><strong>Evidence required:</strong> '+
  esc(node.requiredEvidence)+'</p><p class="inspector-sub">Status: '+esc(node.inputStatus||node.evidenceStatus)+'</p>'+html;
}
function drawGraph(d){
 const byStage=new Map();
 for(const n of d.nodes){const nodes=byStage.get(n.stage)||[];nodes.push(n);byStage.set(n.stage,nodes);}
 const stages=[...byStage.keys()].sort((a,b)=>a-b);
 el('pathways').innerHTML=stages.map((stage,i)=>{
  const nodes=byStage.get(stage);
  return '<div class="stage"><div class="stage-title">Stage '+esc(stage)+'</div>'+
   nodes.map(n=>{
    const count=(n.researchInputs||[]).length+(n.observation?1:0);
    return '<button type="button" class="node '+(count?'evidenced':'')+'" data-node="'+esc(n.id)+'">'+
     '<strong>'+esc(n.label)+'</strong><span class="node-type">'+esc(n.type.replace(/_/g,' '))+'</span>'+
     '<span>'+count+' source input'+(count===1?'':'s')+' · '+(count?'context only':'missing')+'</span></button>';
   }).join('')+'</div>'+(i<stages.length-1?'<span class="stage-arrow" aria-hidden="true">→</span>':'');
 }).join('');
}
function draw(d){
 last=d;
 el('totalNodes').textContent=String(d.coverage.totalNodes);
 el('coveredNodes').textContent=String(d.coverage.contextNodes);
 el('inputRows').textContent=String(d.coverage.contextEvidenceRows);
 el('verifiedEdges').textContent=String(d.coverage.validatedEdges);
 el('edgeCount').textContent=d.coverage.totalEdges+' edges';
 el('pathwaySubtitle').textContent=d.scenario.title+' · '+d.regionId+' · '+
  (d.mode==='historical'?'Issued-source historical view':'Retrospective data context');
 drawGraph(d);
 el('edges').innerHTML=d.edges.map(e=>'<tr><td><strong>'+esc(e.id)+'</strong><br>'+esc(e.mechanism)+'</td>'+
  '<td>'+esc(e.from)+' → '+esc(e.to)+'</td><td>'+esc(e.inputCoverage.replace(/_/g,' '))+'</td>'+
  '<td><span>'+esc(e.verification.replace(/_/g,' '))+'</span></td></tr>').join('');
 el('sources').innerHTML='<div class="sources-grid">'+d.sourceStatuses.map(x=>
  '<div class="source-row"><span>'+esc(x.source.replace(/_/g,' '))+' · '+esc(x.eligibleInputRows)+' rows</span>'+
  '<strong class="'+esc(x.status)+'">'+esc(x.status.replace(/_/g,' '))+'</strong></div>').join('')+'</div>';
 el('gaps').innerHTML=d.priorityGaps.length?d.priorityGaps.map(x=>
  '<article class="gap"><strong>'+esc(x.edgeId)+' · '+esc(x.from)+' → '+esc(x.to)+'</strong>'+
  '<p>'+esc(x.required)+'</p></article>').join(''):
  '<div class="empty">All nodes may have input context, but the mechanism edges remain UNVERIFIED.</div>';
 inspectNode(d.nodes.find(x=>x.id===selected)?.id||d.nodes[0]?.id);
 el('export').disabled=false;
 setStatus('Dossier generated '+d.generatedAt+' · '+d.coverage.contextEvidenceRows+
  ' contextual rows, '+d.coverage.validatedEdges+' causally validated edges. '+(d.mode==='historical'?
   'Historical view excludes revised economic series and model weather data.':
   'Current/revised datasets are not historical first-published vintages.'));
}
async function run(){
 if(!catalog)return;
 const token=++runId;
 const id=el('scenario').value,mode=el('mode').value,region=el('region').value,
  year=el('year').value.trim(),asOf=el('asOf').value;
 const p=new URLSearchParams({id,mode,region});
 if(id==='enso-fertilizer')p.set('commodity',el('commodity').value);
 if(mode==='historical'){
  if(!asOf){setStatus('Select an as-of date.');return;}p.set('asOf',asOf);
 }else{
  if(!/^\d{4}$/.test(year)){setStatus('Choose a valid complete four-digit historical meteorology year.');return;}
  p.set('year',year);
 }
 el('analyze').disabled=true;el('export').disabled=true;
 setStatus('Collecting bounded source observations; missing and unavailable providers remain explicit…');
 try{
  const d=await req('analysis?'+p);
  if(token===runId)draw(d);
 }catch(e){
  if(token===runId)setStatus('Research dossier unavailable: '+e.message);
 }finally{if(token===runId)el('analyze').disabled=false;}
}
function exportReport(){
 if(!last?.report)return;
 const blob=new Blob([last.report],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='tradescope-economic-transmission-'+last.scenario.id+'.txt';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function init(){
 try{
  catalog=await req('catalog');
  el('year').max=String(new Date().getUTCFullYear()-1);
  el('year').value=String(new Date().getUTCFullYear()-1);
  regionOptions();settings();
  setStatus('Ready. All paths are research hypotheses until validated with independent, time-aligned source evidence.');
 }catch(e){setStatus('Unable to initialize economic analysis: '+e.message);}
}
el('scenario').addEventListener('change',()=>{regionOptions();settings();});
el('mode').addEventListener('change',settings);
el('analyze').addEventListener('click',()=>void run());
el('export').addEventListener('click',exportReport);
el('pathways').addEventListener('click',e=>{
 const id=e.target.closest('[data-node]')?.dataset.node;
 if(id)inspectNode(id);
});
void init();
})();