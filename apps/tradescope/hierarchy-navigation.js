/* ResearchOS unified three-tier navigation: one information architecture across the local terminal and research portals.
 * Level 1 chooses a product area, Level 2 chooses a module, Level 3 opens an existing tool.
 * No additional data source, model call, or user secret is required.
 */
(()=>{
'use strict';
const TREE=[
 {id:'markets',label:'Markets',sections:[
  {id:'surveillance',label:'Surveillance',tools:[
   {id:'monitor',label:'Market Monitor',href:'/#monitor'},
   {id:'blotter',label:'Trade Blotter',href:'/#blotter'},
   {id:'feed-health',label:'Feed Integrity',href:'/#feed-health'},
   {id:'recordings',label:'Capture & Replay',href:'/market-capture.html'},
   {id:'replay',label:'Replay Lab',href:'/#replay'}]},
  {id:'market-data',label:'Market Data',tools:[
   {id:'overview',label:'Market Overview',href:'/market-hub.html#overview'},
   {id:'dashboard',label:'Stock Dashboard',href:'/market-hub.html#dashboard'},
   {id:'compare',label:'Compare',href:'/market-hub.html#compare'},
   {id:'financials',label:'Financials',href:'/market-hub.html#financials'},
   {id:'watchlists',label:'Watchlists',href:'/market-hub.html#watchlists'},
   {id:'etfs',label:'ETF Themes',href:'/market-hub.html#themes'},
   {id:'macro',label:'Macro',href:'/market-hub.html#macro'}]},
  {id:'signals',label:'Signals & Screens',tools:[
   {id:'signals',label:'Signal Research',href:'/#research/signals'},
   {id:'screener',label:'Screener',href:'/#research/screener'},
   {id:'atlas',label:'Market Atlas',href:'/#research/atlas'},
   {id:'monitoring',label:'Local Monitoring',href:'/#research/monitoring'},
   {id:'market-screener',label:'Market Screener',href:'/market-hub.html#screener'}]}]},
 {id:'companies',label:'Company Research',sections:[
  {id:'issuer',label:'Issuer Research',tools:[
   {id:'company',label:'Company Metrics',href:'/#research/company'},
   {id:'filings',label:'SEC Filing Reader',href:'/#research/filings'},
   {id:'discovery',label:'Issuer Discovery',href:'/#research/discovery'},
   {id:'corporate-precursors',label:'Corporate Precursor Monitor',href:'/corporate-precursor.html'},
   {id:'news-first-seen',label:'News First-Seen Replay',href:'/corporate-precursor.html#precursor-chronology'}]},
  {id:'investigations',label:'Investigations',tools:[
   {id:'cases',label:'Case Queue',href:'/#cases'},
   {id:'assistant',label:'Evidence Assistant',href:'/#assist'},
   {id:'proof',label:'Exposure Proof',href:'/exposure-review.html'}]},
  {id:'facilities',label:'Facility Intelligence',tools:[
   {id:'facility-crosswalk',label:'Company–Facility Crosswalk',href:'/facility-exposure.html'},
   {id:'facility-candidates',label:'Event Proximity Candidates',href:'/facility-exposure.html#event-matches'},
   {id:'relationship-verification',label:'Relationship Evidence Review',href:'/relationship-verification.html'},
   {id:'effective-timeline',label:'Effective-Date Timeline',href:'/relationship-verification.html#relationship-timeline'},
   {id:'entity-graph',label:'Official Entity Graph',href:'/entity-graph.html'},
   {id:'source-contracts',label:'Source Contract Diagnostics',href:'/entity-graph.html#provider-contracts'},
   {id:'source-corroboration',label:'Source Corroboration Dossier',href:'/corroboration-case.html'},
   {id:'source-challenges',label:'Anti-Agent Evidence Challenges',href:'/corroboration-case.html#case-challenges'}]}]},
 {id:'events',label:'Global Events',sections:[
  {id:'event-radar',label:'Event Radar',tools:[
   {id:'terminal-events',label:'Event Stream',href:'/#intel'},
   {id:'global-event-universe',label:'Event Universe',href:'/event-portal.html'},
   {id:'global-feed',label:'Captured Global Feed',href:'/event-portal.html#global-feed'},
   {id:'precursor-radar',label:'Precursor Radar',href:'/event-portal.html#precursor-radar'},
   {id:'mechanism-radar',label:'Mechanism-First Radar',href:'/mechanism-radar.html'},
   {id:'mechanism-ensopath',label:'ENSO Economic Mechanisms',href:'/mechanism-radar.html#mechanism-replay'},
   {id:'aviation',label:'FAA Case & Precursors',href:'/event-portal.html#case-study'}]},
  {id:'transmission',label:'Economic Transmission',tools:[
   {id:'transmission-lab',label:'Transmission Lab',href:'/transmission-lab.html'},
   {id:'commodity',label:'Commodity Disruptions',href:'/commodity.html'},
   {id:'geo-exposure',label:'Geographic Exposure',href:'/geo-exposure.html'},
   {id:'hazard-footprints',label:'Official Hazard Polygons',href:'/hazard-footprints.html'},
   {id:'hazard-revisions',label:'Hazard Source Revisions',href:'/hazard-footprints.html#hazard-history'},
   {id:'usgs-shakemap-mmi',label:'USGS ShakeMap Site Intensity',href:'/usgs-shakemap.html'},
   {id:'usgs-mmi-history',label:'Shaking Source Revisions',href:'/usgs-shakemap.html#shakemap-history'}]},
  {id:'historical',label:'Historical Research',tools:[
   {id:'analogues',label:'Event Analogues',href:'/#research/analogues'},
   {id:'crisis',label:'Crisis & Climate',href:'/#research/crisis'},
   {id:'vintage',label:'FRED / ALFRED',href:'/fred-research.html'}]}]},
 {id:'agents',label:'Research Agents',sections:[
  {id:'agent-workbench',label:'Agent Workbench',tools:[
   {id:'agent-desk',label:'Research Agent Desk',href:'/agent-desk.html'},
   {id:'anti-agent',label:'Independent Anti-Agent',href:'/agent-desk.html#anti-agent'}]},
  {id:'agent-review',label:'Research Review',tools:[
   {id:'agent-runs',label:'Saved Research Runs',href:'/agent-desk.html#saved-runs'},
   {id:'agent-validation',label:'Evidence Validation',href:'/agent-validation.html'},
   {id:'prospective-review',label:'Prospective Review',href:'/agent-validation.html#prospective-protocol'},
   {id:'outcome-evidence',label:'Official Evidence Archive',href:'/agent-validation.html#official-source-evidence'},
   {id:'dataset-export',label:'Dataset Export',href:'/agent-validation.html#dataset-export'}]}]},
 {id:'operations',label:'Research Operations',sections:[
  {id:'sources',label:'Sources & Provenance',tools:[
   {id:'source-control',label:'Source Control',href:'/source-control.html'},
   {id:'evidence-ledger',label:'Evidence Ledger',href:'/evidence-ledger.html'}]}
 ]}
];
const tools=[];
for(const group of TREE)for(const section of group.sections)for(const tool of section.tools){
 tools.push({group:group.id,section:section.id,groupLabel:group.label,sectionLabel:section.label,...tool});
}
const rootPath=p=>p==='/index.html'?'/':p||'/';
function resolve(pathname='/',hash=''){
 const route=rootPath(pathname)+(hash||'');
 return tools.find(x=>x.href===route)
   ||tools.find(x=>rootPath(x.href.split('#')[0])===rootPath(pathname))
   ||tools[0];
}
const model={tree:TREE,tools,resolve};
if(typeof window!=='undefined')window.TradeScopeNavigationModel=model;
if(typeof document==='undefined'||!document.body)return;
const header=document.querySelector('header');
if(!header)return;
const isRoot=()=>rootPath(window.location.pathname)==='/';
const nativeNav=header.querySelector('nav:not(.ts-hierarchy-nav)');
if(nativeNav){nativeNav.hidden=true;nativeNav.setAttribute('aria-hidden','true');}
const shell=document.createElement('section');shell.className='ts-hierarchy';shell.setAttribute('aria-label','ResearchOS three-level navigation');
shell.id='researchosNavigation';
header.insertAdjacentElement('afterend',shell);
let selectedGroup=null,selectedSection=null;
const $=(selector)=>document.querySelector(selector);
const findGroup=id=>TREE.find(x=>x.id===id)||TREE[0];
function makeNav(title,items,selected,onClick,{links=false,active=null}={}){
 const row=document.createElement('div');row.className='ts-hierarchy-row';
 const label=document.createElement('span');label.className='ts-hierarchy-row-label';label.textContent=title;row.append(label);
 const nav=document.createElement('nav');nav.className='ts-hierarchy-nav';nav.setAttribute('aria-label',title);
 for(const item of items){
  const control=document.createElement(links?'a':'button');
  control.className='ts-hierarchy-tab';
  control.textContent=item.label;
  control.dataset.navItem=item.id;
  if(links){control.href=item.href; if(item.id===active)control.setAttribute('aria-current','page');}
  else {control.type='button';control.setAttribute('aria-pressed',String(item.id===selected));}
  if(item.id===selected || links&&item.id===active)control.classList.add('is-selected');
  control.addEventListener('click',event=>onClick(item,event));
  nav.append(control);
 }
 row.append(nav);return row;
}
function render(){
 const group=findGroup(selectedGroup),section=group.sections.find(x=>x.id===selectedSection)||group.sections[0];
 const active=resolve(window.location.pathname,window.location.hash);
 shell.replaceChildren(
  makeNav('LEVEL 1 · PRODUCT',TREE,group.id,item=>{selectedGroup=item.id;selectedSection=item.sections[0].id;render();}),
  makeNav('LEVEL 2 · MODULE',group.sections,section.id,item=>{selectedSection=item.id;render();}),
  makeNav('LEVEL 3 · TOOLS',section.tools,null,(item,event)=>{
   const target=new URL(item.href,window.location.origin);
   // Let native hash navigation activate existing standalone view-tab controllers and anchor scrolling.
   // The terminal uses controlled in-page workspaces, so it handles its own hash route explicitly.
   if(isRoot()&&rootPath(target.pathname)===rootPath(window.location.pathname)){
    event.preventDefault();
    if(window.location.pathname+window.location.hash!==target.pathname+target.hash){
     window.history.pushState(null,'',target.pathname+target.hash);
    }
    applyLocalRoute();selectFromLocation();
   }
  },{links:true,active:active.group===group.id&&active.section===section.id?active.id:null})
 );
 const detail=document.createElement('p');detail.className='ts-hierarchy-caption';
 detail.textContent='ACTIVE WORKSPACE  /  '+active.groupLabel+'  ›  '+active.sectionLabel+'  ›  '+active.label+
  '  ·  Provider coverage is source-specific; pilot and simulated results remain labeled.';
 shell.append(detail);
}
function selectFromLocation(){
 const current=resolve(window.location.pathname,window.location.hash);
 selectedGroup=current.group;selectedSection=current.section;render();
}
function applyLocalRoute(){
 if(!isRoot())return;
 const value=window.location.hash.replace(/^#/,'');
 let nav='monitor',tab=null,focus=null;
 if(['blotter','replay','intel','cases'].includes(value))nav=value;
 else if(value==='assist'){nav='cases';focus='#assistPanel';}
 else if(value==='feed-health'){nav='monitor';focus='.feed-health';}
 else if(value.startsWith('research/')){
  const part=value.slice('research/'.length);
  if(!/^(company|signals|screener|atlas|monitoring|filings|discovery|crisis|analogues)$/.test(part))return;
  nav='research';tab=part;
 }else if(value&&value!=='monitor')return;
 const legacy=$('.legacy-navigation [data-nav="'+nav+'"]');
 legacy?.click();
 if(tab)$('[data-research-tab="'+tab+'"]')?.click();
 if(focus&&typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(()=>{
  $(focus)?.scrollIntoView?.({block:'start',behavior:'smooth'});
  if(value==='assist')$('#assistQuestion')?.focus?.({preventScroll:true});
 });
}
function onLocationChange(){applyLocalRoute();selectFromLocation();}
window.addEventListener('popstate',onLocationChange);
window.addEventListener('hashchange',onLocationChange);
document.addEventListener('click',event=>{
 const tab=event.target.closest?.('[data-research-tab]');const market=event.target.closest?.('#navTabs [data-view]');
 if(isRoot()&&tab){
  const dest='/#research/'+tab.dataset.researchTab;
  if(window.location.pathname+window.location.hash!==dest)window.history.replaceState(null,'',dest);
  selectFromLocation();
 }else if(market){window.requestAnimationFrame?.(selectFromLocation);}
});
selectFromLocation();
applyLocalRoute();
})();