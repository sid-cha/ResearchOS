(()=>{'use strict';
const $=id=>document.getElementById(id),set=(id,value)=>{$(id).textContent=String(value??'—');};
const add=(p,tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(cls)e.className=cls;p.append(e);return e;};
async function api(route,{method='GET',body=null}={}){
 const res=await fetch('/api/entity-graph/'+route,{method,cache:'no-store',
  headers:body?{'Content-Type':'application/json','X-ResearchOS-Entity-Graph':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const json=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(json.error||'Entity graph unavailable');
 return json;
}
const state={enabled:false,graph:null,busy:false};
const validCutoff=s=>!s||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&Number.isFinite(Date.parse(s)));
function fillSelect(id,options,placeholder,key,label){
 const select=$(id),old=select.value;select.replaceChildren();
 add(select,'option',placeholder).value='';
 for(const x of options){const option=add(select,'option',label(x));option.value=key(x);}
 if([...select.options].some(x=>x.value===old))select.value=old;
}
function renderGraph(graph){
 state.graph=graph;
 set('entityCounts',graph.nodes.length+' NODES · '+graph.edges.length+' EDGES');
 set('graphStatus','Snapshot as-of '+graph.asOf+' · 0 independently verified company–facility ownership edges. Graph is descriptive, not a predicted exposure map.');
 const nodes=$('entityNodes');nodes.replaceChildren();
 if(!graph.nodes.length)add(nodes,'p','No GLEIF, SEC or EPA identity records captured. Begin with explicit source retrieval above.');
 for(const node of graph.nodes){
  const card=add(nodes,'article',undefined,'entity-node');card.dataset.kind=node.kind;
  add(card,'strong',node.kind.replaceAll('_',' '));
  add(card,'h3',node.label);
  add(card,'small',node.id);
  if(node.capturedAt)add(card,'small','Locally captured '+node.capturedAt);
  if(node.tickers?.length)add(card,'small','SEC tickers: '+node.tickers.join(', '));
  if(node.registryStatus)add(card,'small','GLEIF registration: '+node.registryStatus);
  if(node.kind==='GLEIF_PARENT_REFERENCE')add(card,'small','Parent identity not separately captured');
 }
 const diagnostics=$('entityConflicts');diagnostics.replaceChildren();
 for(const record of graph.level2Records||[]){
  const card=add(diagnostics,'article',undefined,'entity-edge');
  add(card,'h3','GLEIF Level 2 · '+record.childLei);
  add(card,'p','Direct accounting consolidation parent: '+(record.parentLei||'No record returned'));
  add(card,'p','Observed locally: '+record.capturedAt);
  add(card,'p','Reported periods: '+(record.periods?.length?record.periods.map(p=>p.type+
   ' ('+(p.startDate||'unknown')+' → '+(p.endDate||'unknown')+')').join('; '):'Unreported'));
  add(card,'p','Accounting consolidation is not legal ownership, site operation or independently verified effective dates.','unverified');
 }
 for(const conflict of graph.relationshipConflicts||[]){
  const card=add(diagnostics,'article',undefined,'entity-edge');
  add(card,'h3','SOURCE CONFLICT · '+conflict.childLei);
  add(card,'p','Parent identity record: '+conflict.sourceIdentityParent);
  add(card,'p','Level 2 relationship record: '+conflict.sourceLevel2Parent);
  add(card,'p','Human review required. Both records are from GLEIF and are not independent providers.','unverified');
 }
 if(!(graph.level2Records?.length||graph.relationshipConflicts?.length))
  add(diagnostics,'p','No GLEIF Level 2 period records or reported conflicts captured.');
 const edges=$('entityEdges');edges.replaceChildren();
 if(!graph.edges.length)add(edges,'p','No source-reported accounting parents or captured relationship hypotheses yet.');
 for(const edge of graph.edges){
  const card=add(edges,'article',undefined,'entity-edge');
  add(card,'h3',edge.type.replaceAll('_',' '));
  add(card,'p',edge.from+' → '+edge.to);
  add(card,'p','Locally captured: '+edge.capturedAt);
  add(card,'p','Relationship remains unverified as legal ownership, operational control and financial exposure.','unverified');
  if(edge.evidenceUrl){
   const a=add(card,'a','Original-source reference');a.href=edge.evidenceUrl;
   a.target='_blank';a.rel='noopener noreferrer';
  }
  if(edge.sourceEvidence){
   const a=add(card,'a','GLEIF identity reference');a.href=edge.sourceEvidence;
   a.target='_blank';a.rel='noopener noreferrer';
  }
 }
 const ilis=graph.nodes.filter(n=>n.kind==='LEGAL_ENTITY');
 const filers=graph.nodes.filter(n=>n.kind==='SEC_FILER');
 fillSelect('candidateLei',ilis,'Select captured LEI',x=>x.lei,x=>x.label+' · '+x.lei);
 fillSelect('candidateCik',filers,'Select captured SEC filer',x=>x.cik,x=>x.label+' · '+x.cik);
 $('submitCandidate').disabled=!state.enabled||!$('candidateLei').value||!$('candidateCik').value||state.busy;
}
async function refresh(){
 const cutoff=$('entityAsOf').value.trim();
 if(!validCutoff(cutoff)){set('graphStatus','As-of requires a full UTC timestamp such as 2026-11-15T18:00:00Z');return;}
 const q=cutoff?'?asOf='+encodeURIComponent(cutoff):'';
 renderGraph(await api('view'+q));
}
async function mutate(op,body,status,button){
 if(state.busy)return;
 state.busy=true;$(button).disabled=true;set(status,'Requesting official data or validating archived identifiers…');
 try{
  const result=await api(op,{method:'POST',body});
  set(status,op==='check'?
   'Provider contract responded: '+result.provider+' · '+result.contract+
   ' · '+result.bodySha256+' · '+result.bytes+' bytes. Source ownership/rights acceptance is separate.':
   (result.deduplicated?'Already captured':'Saved')+
   ' · '+result.record.capturedAt+' · no legal ownership inferred.');
  await refresh();
 }catch(e){set(status,'Action failed: '+e.message);}
 finally{state.busy=false;$(button).disabled=false;}
}
$('leiForm').addEventListener('submit',e=>{
 e.preventDefault();void mutate('lei',{lei:$('gleifLei').value.trim()},'leiStatus','captureLei');
});
$('captureLevel2').addEventListener('click',()=>void mutate('relationship',
 {lei:$('gleifLei').value.trim()},'leiStatus','captureLevel2'));
$('captureDirectParent').addEventListener('click',()=>void mutate('parent',
 {lei:$('gleifLei').value.trim()},'leiStatus','captureDirectParent'));
$('sourceCheckForm').addEventListener('submit',e=>{
 e.preventDefault();void mutate('check',{source:$('sourceKind').value,id:$('sourceIdentifier').value.trim()},
  'sourceStatus','runSourceCheck');
});
$('candidateLei').addEventListener('change',()=>{$('submitCandidate').disabled=!$('candidateLei').value||!$('candidateCik').value;});
$('candidateCik').addEventListener('change',()=>{$('submitCandidate').disabled=!$('candidateLei').value||!$('candidateCik').value;});
$('identifierForm').addEventListener('submit',e=>{
 e.preventDefault();
 const lei=$('candidateLei').value;
 void mutate('link',{lei,cik:$('candidateCik').value,
  evidenceUrl:'https://api.gleif.org/api/v1/lei-records/'+lei,
  rationale:$('candidateRationale').value.trim()},'candidateStatus','submitCandidate');
});
$('loadGraph').addEventListener('click',()=>void refresh().catch(e=>set('graphStatus','Graph refresh failed: '+e.message)));
void(async()=>{
 try{
  const data=await api('catalog');state.enabled=data.enabled===true;
  if(!state.enabled){
   set('graphStatus','Entity graph is disabled outside a local loopback Node server.');
   for(const id of ['captureLei','captureDirectParent','captureLevel2','runSourceCheck','submitCandidate','loadGraph'])$(id).disabled=true;
   return;
  }
  await refresh();
 }catch(e){set('graphStatus','Graph initialization unavailable: '+e.message);}
})();
})();