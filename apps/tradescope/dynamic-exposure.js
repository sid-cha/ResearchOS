(()=>{'use strict';
const $=id=>document.getElementById(id);
const set=(id,value)=>{$(id).textContent=String(value??'—');};
const append=(parent,tag,value,className)=>{
 const element=document.createElement(tag);
 if(value!==undefined)element.textContent=String(value);
 if(className)element.className=className;
 parent.append(element);return element;
};
const validUtc=v=>!v||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&
 Number.isFinite(Date.parse(v)));
let catalog=null,report=null;
const node=id=>report?.nodes.find(n=>n.id===id);
async function api(route){
 const response=await fetch('/api/dynamic-exposure/'+route,{cache:'no-store'});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||'Dynamic source exposure unavailable');
 return body;
}
function summary(){
 const root=$('exposureSummary');root.replaceChildren();
 const counts=[
  ['NODES',report.nodes.length],
  ['EVIDENCE-TYPED EDGES',report.edges.length],
  ['EXPOSURE REVIEW PATHS',report.metrics.candidateExposurePaths],
  ['CLAIMED COMPANY PATHS',report.metrics.companyClaimedPaths],
  ['VERIFIED COMPANY–SITE OWNERSHIP',report.metrics.verifiedCompanyFacilityOwnership],
  ['VERIFIED FINANCIAL OUTCOMES',report.metrics.verifiedFinancialOutcomes]
 ];
 for(const [title,value] of counts){
  const card=append(root,'div',undefined,'exposure-card');
  append(card,'small',title);append(card,'h3',value);
 }
 set('exposureCounts',report.nodes.length+' NODES · '+report.edges.length+' EDGES');
 set('exposureStatus','Source replay: '+report.asOf+
  '. All upstream modules were read with the same cutoff. No external source fetch or implicit claims.');
 set('exposureDigest','Deterministic read-only graph SHA-256: '+report.replayDigest+
  ' · Source versions: '+Object.values(report.sourceCatalog).filter(Boolean).join(' / '));
}
function link(parent,url,label){
 if(typeof url!=='string'||!/^https:\/\//i.test(url))return;
 const a=append(parent,'a',label);a.href=url;a.rel='noopener noreferrer';a.target='_blank';
}
function sourceCard(parent,e,title){
 const box=append(parent,'article',undefined,'exposure-card');
 append(box,'strong',e.sourceKind||'LOCAL SOURCE OBSERVATION');
 append(box,'h3',title);
 append(box,'small','Locally observed: '+(e.firstSeenAt||'unknown'));
 append(box,'small','Original publisher release clock: UNVERIFIED');
 if(e.sourceSha256)append(box,'small','Source digest: '+e.sourceSha256);
 link(box,e.sourceUrl,'Open captured source reference');
 return box;
}
function renderSourceSummary(){
 const root=$('exposureSourceCards');root.replaceChildren();
 const src=report.nodes.filter(n=>n.evidence).sort((a,b)=>
  a.id.localeCompare(b.id));
 if(!src.length)append(root,'p','No locally captured source observations in the selected view. Mechanism templates alone do not imply current risk.');
 for(const n of src.slice(0,48))sourceCard(root,n.evidence,n.title);
 if(src.length>48)append(root,'p','Showing 48 of '+src.length+' evidence records. Export JSON for full source catalogue.');
}
function renderMechanism(){
 const root=$('exposureMechanismCards');root.replaceChildren();
 const stages=report.nodes.filter(n=>n.type==='MECHANISM_STAGE');
 const themes=[...new Set(stages.map(n=>n.themeId))];
 for(const theme of themes){
  const family=stages.filter(x=>x.themeId===theme);
  const rootNode=family[0];
  const card=append(root,'article',undefined,'exposure-card');
  append(card,'strong',theme.toUpperCase());
  append(card,'h3',family.length+' mechanism stages');
  append(card,'p','Captured source leads: '+family.filter(x=>x.proofStatus==='SOURCE_REPORTED_LEAD').length+
   ' · every transmission edge is conditional.');
  for(const stage of family.slice(0,9)){
   const line=append(card,'p',undefined);
   line.textContent=(stage.proofStatus==='SOURCE_REPORTED_LEAD'?'SOURCE REPORTED: ':'RESEARCH REQUIREMENT: ')+
    stage.title+' — '+stage.requirement;
  }
  if(family.length>9)append(card,'small','Additional stages available in the exported graph.');
 }
 if(!themes.length)append(root,'p','No mechanism stages for the current filter.');
}
function svgElem(parent,tag,attributes={},content=null){
 const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [k,v] of Object.entries(attributes))el.setAttribute(k,String(v));
 if(content!==null)el.textContent=String(content);
 parent.appendChild(el);return el;
}
function wrapTitle(name,length=24){
 const v=String(name||'').replace(/\s+/g,' ');
 if(v.length<=length)return v;
 return v.slice(0,length-1)+'…';
}
function diagram(pathItem){
 const root=$('exposureDiagram');root.replaceChildren();
 const a=node(pathItem.originNodeId),b=node(pathItem.siteNodeId),c=node(pathItem.issuerNodeId);
 const svg=svgElem(root,'svg',{viewBox:'0 0 900 210',
  role:'img','aria-label':'Research evidence path: '+(a?.title||'source')+
   ' to '+(b?.title||'EPA facility')+' to '+(c?.title||'unlinked issuer')});
 const labels=[
  {x:15,name:a?.title||'Source record',type:a?.type||'REPORTED SOURCE',
   note:pathItem.method},
  {x:320,name:b?.title||'EPA facility',type:'EPA SITE',note:'Reported point only'},
  {x:625,name:c?.title||'No verified issuer',type:c?'SEC FILER / ASSERTED LINK':'COMPANY LINK MISSING',
   note:c?'NOT OWNERSHIP PROOF':'REQUIRES RESEARCH'}
 ];
 for(let i=0;i<2;i++){
  svgElem(svg,'line',{x1:labels[i].x+258,y1:101,
   x2:labels[i+1].x-9,y2:101,stroke:'#b4c2c9','stroke-width':2,
   'stroke-dasharray':i?'5 5':'none'});
  svgElem(svg,'polygon',{points:(labels[i+1].x-15)+',95 '+(labels[i+1].x-4)+',101 '+
   (labels[i+1].x-15)+',107',fill:'#b4c2c9'});
 }
 for(const item of labels){
  svgElem(svg,'rect',{x:item.x,y:42,width:258,height:123,rx:10,
   fill:'#203a4a',stroke:'#789aa8','stroke-width':1.5});
  svgElem(svg,'text',{x:item.x+12,y:67,fill:'#b9d6df','font-size':11,
   'font-family':'ui-monospace,monospace'},wrapTitle(item.type,32));
  svgElem(svg,'text',{x:item.x+12,y:99,fill:'#f1f5f5','font-size':14,
   'font-weight':650},wrapTitle(item.name,27));
  svgElem(svg,'text',{x:item.x+12,y:130,fill:'#eac390','font-size':10},
   wrapTitle(item.note,33));
 }
 svgElem(svg,'text',{x:15,y:194,fill:'#bac6cb','font-size':12},
  'Recorded evidence → spatial/model screen → unverified legal relationship');
}
function showPath(){
 const id=$('exposurePath').value;
 const p=report?.paths.find(x=>x.id===id),detail=$('exposurePathDetails'),
  challenges=$('exposureChallenges');
 detail.replaceChildren();challenges.replaceChildren();
 if(!p){
  $('exposureDiagram').replaceChildren();
  append(detail,'p','No captured event/site research path for the selected filters. The mechanism graph is still visible, but it has no evidenced issuer outcome.');
  append(challenges,'p','No path to challenge. First capture a source event, facility and relevant hazard; then independently document company involvement.');
  return;
 }
 diagram(p);
 append(detail,'h3',p.title);
 append(detail,'strong',p.method+' · '+p.linkStatus,'exposure-uncertain');
 append(detail,'p',p.methodDescription);
 append(detail,'p','Source locally received '+(p.source?.firstSeenAt||'unknown')+
  ' · original source publication time independently verified: NO');
 append(detail,'p','Legal ownership verified: NO · physical damage verified: NO · issuer materiality: NO · stock forecast: NONE');
 append(detail,'small','Anti-Agent open proof gates: '+p.openProofGates.join(' / '));
 if(p.claimFilingMatched)append(detail,'p','A cited SEC filing excerpt was matched. Its legal meaning and effective dates are NOT independently verified.');
 link(detail,p.source?.sourceUrl,'Inspect original research source');
 for(const q of p.reviewQuestions){
  const card=append(challenges,'article',undefined,'exposure-card');
  append(card,'strong',q.type,'exposure-risk');
  append(card,'h3',q.question);
  append(card,'p',q.requiredEvidence);
  append(card,'small','Current answer: EVIDENCE NOT ESTABLISHED');
 }
}
function renderPaths(){
 const select=$('exposurePath'),old=select.value;
 select.replaceChildren();
 if(!report.paths.length){
  append(select,'option','No recorded source-to-facility paths').value='';
  select.disabled=true;
 }else{
  for(const p of report.paths){
   const name=(p.issuerNodeId?'Company claim · ':'Unlinked site · ')+p.method+' · '+p.title;
   const option=append(select,'option',name);option.value=p.id;
  }
  select.disabled=false;
  if(report.paths.some(x=>x.id===old))select.value=old;
 }
 showPath();
}
const validEvent=id=>!id||/^(USGS|NASA_EONET|FAA_NAS_STATUS):[A-Za-z0-9_.:-]{1,150}$/.test(id);
async function refresh(){
 const asOf=$('exposureAsOf').value.trim(),themeId=$('exposureTheme').value,
  registryId=$('exposureSite').value.trim(),eventId=$('exposureEvent').value.trim();
 if(!validUtc(asOf)||registryId&&!/^\d{12}$/.test(registryId)||!validEvent(eventId)){
  set('exposureStatus','Use a complete UTC cutoff, a 12-digit EPA ID and a captured USGS/NASA/FAA event identifier.');
  return;
 }
 const query=new URLSearchParams();
 if(asOf)query.set('asOf',asOf);
 if(themeId)query.set('themeId',themeId);
 if(registryId)query.set('registryId',registryId);
 if(eventId)query.set('eventId',eventId);
 const out=await api('view'+(query.size?'?'+query:''));
 report=out;summary();renderMechanism();renderSourceSummary();renderPaths();
 $('exposureExport').disabled=false;
}
$('exposurePath').addEventListener('change',showPath);
$('exposureRefresh').addEventListener('click',()=>{
 set('exposureStatus','Reading the captured source journals at one shared cutoff...');
 void refresh().catch(e=>set('exposureStatus','Graph replay failed: '+e.message));
});
$('exposureExport').addEventListener('click',()=>{
 if(!report)return;
 const data=JSON.stringify(report,null,2)+'\n';
 const blob=new Blob([data],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='ResearchOS_v048_evidence_graph_'+report.asOf.slice(0,10)+'.json';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  catalog=await api('catalog');
  const picker=$('exposureTheme');
  for(const t of catalog.themes){
   const opt=append(picker,'option',t.title);opt.value=t.id;
  }
  if(!catalog.enabled){
   $('exposureRefresh').disabled=true;
   set('exposureStatus','Private evidence graph is disabled for a nonloopback server.');
   return;
  }
  await refresh();
 }catch(e){
  set('exposureStatus','Dynamic exposure graph unavailable: '+e.message);
 }
})();
})();