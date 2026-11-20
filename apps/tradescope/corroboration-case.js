(()=>{'use strict';
const $=id=>document.getElementById(id),put=(id,text)=>{$(id).textContent=String(text??'—');};
const add=(parent,tag,text,className)=>{
 const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);
 if(className)el.className=className;parent.append(el);return el;
};
const validTime=value=>!value||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value)));
const state={case:null,inventory:[],busy:false};
async function read(route){
 const response=await fetch('/api/corroboration-case/'+route,{cache:'no-store'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Source corroboration unavailable');
 return result;
}
const timeParams=()=>{
 const asOf=$('caseAsOf').value.trim();
 if(!validTime(asOf))throw Error('Use a full UTC as-of timestamp such as 2026-11-15T18:00:00Z');
 const params=new URLSearchParams();if(asOf)params.set('asOf',asOf);
 return params;
};
async function reloadInventory(){
 const params=timeParams(),data=await read('inventory'+(params.size?'?'+params:''));
 state.inventory=data.relationships||[];
 const select=$('caseRelationship'),prior=select.value;select.replaceChildren();
 add(select,'option','Choose a saved relationship').value='';
 for(const r of state.inventory){
  const opt=add(select,'option',r.cik+' / '+r.registryId+' · '+r.relationshipType);
  opt.value=r.relationshipId;
 }
 const requested=new URLSearchParams(location.search).get('relationship');
 const selected=(state.inventory.some(x=>x.relationshipId===prior)?prior:
  state.inventory.some(x=>x.relationshipId===requested)?requested:'');
 select.value=selected;
 put('caseMessage',state.inventory.length+' saved research claims at this cutoff. No upstream network requests performed.');
 $('loadCase').disabled=!state.inventory.length;
 if(!selected&&state.inventory.length===1)select.value=state.inventory[0].relationshipId;
}
function card(parent,title,status,description,small){
 const div=add(parent,'article',undefined,'case-card');
 add(div,'h3',title);
 add(div,'strong',status,'status-warning');
 if(description)add(div,'p',description);
 if(small)add(div,'small',small);
 return div;
}
function render(result){
 state.case=result;put('caseRule',result.ruleVersion);
 const facts=$('caseFacts');facts.replaceChildren();
 for(const [label,value] of [
  ['Issuer / CIK',result.subject.companyName+' · '+result.subject.cik],
  ['EPA site / FRS',result.subject.facilityName+' · '+result.subject.frs],
  ['Operator claim',result.subject.humanRelationshipType],
  ['GLEIF LEI candidates',result.leiCandidates.length],
  ['Different source providers',result.sourceProvidersObserved.join(', ')],
  ['Legal ownership verified','NO']
 ]){
  const item=add(facts,'div',undefined,'case-fact');add(item,'small',label);add(item,'strong',value);
 }
 put('caseDecision',result.decision.status+
  ' · independently verified company-to-site ownership: NO. '+
  'This dossier includes historical capture evidence, but is not legal adjudication or a trading signal.');
 const matrix=$('caseMatrix');matrix.replaceChildren();
 for(const m of result.corroborationMatrix){
  card(matrix,m.title,m.state,m.note,m.sourceIds.length?
   'Source records: '+m.sourceIds.join(', '):'No qualifying proof records');
 }
 const provenance=$('caseEvidence');provenance.replaceChildren();
 for(const e of result.providerEvidence){
  const item=card(provenance,e.predicate.replaceAll('_',' '),e.provider,
   e.subject+' → '+e.object,
   'Captured '+(e.firstCapturedAt||'unknown')+' · '+e.qualification+
   (e.bodySha256?' · SHA-256 '+e.bodySha256:''));
  if(e.sourceUrl){
   const a=add(item,'a','Original provider reference');a.href=e.sourceUrl;
   a.target='_blank';a.rel='noopener noreferrer';
  }
 }
 const objections=$('caseIssues');objections.replaceChildren();
 for(const issue of result.antiAgentObjections)card(objections,
  issue.replaceAll('_',' '),'RESEARCH PROOF GAP','Must be resolved independently before any legal or market conclusion');
 for(const conflict of result.reportedParentConflicts||[]){
  card(objections,'GLEIF parent disagreement','SOURCE CONFLICT',
   conflict.childLei+' · direct parent '+conflict.directParentIdentity+
   ' vs Level 2 parent '+conflict.level2RelationshipParent);
 }
 put('caseMessage','Built point-in-time case as of '+result.asOf+' · '+result.providerEvidence.length+
  ' source observations · '+result.antiAgentObjections.length+
  ' Anti-Agent blockers · manifest SHA-256 '+result.manifestSha256);
 $('exportCase').disabled=false;
}
async function showCase(){
 const relationshipId=$('caseRelationship').value;
 if(!relationshipId){put('caseMessage','Select a captured relationship first.');return;}
 let params;
 try{params=timeParams();}catch(e){put('caseMessage',e.message);return;}
 params.set('relationshipId',relationshipId);
 $('loadCase').disabled=true;put('caseMessage','Replaying saved evidence at the selected local knowledge cutoff…');
 try{render(await read('case?'+params));}
 catch(e){put('caseMessage','Case unavailable: '+e.message);state.case=null;$('exportCase').disabled=true;}
 finally{$('loadCase').disabled=!state.inventory.length;}
}
$('caseRelationship').addEventListener('change',()=>{state.case=null;$('exportCase').disabled=true;});
$('caseAsOf').addEventListener('change',()=>{
 state.case=null;$('exportCase').disabled=true;
 void reloadInventory().catch(e=>put('caseMessage',e.message));
});
$('loadCase').addEventListener('click',()=>void showCase());
$('reloadCases').addEventListener('click',()=>void reloadInventory().catch(e=>put('caseMessage',e.message)));
$('exportCase').addEventListener('click',()=>{
 if(!state.case)return;
 const body=JSON.stringify(state.case,null,2)+'\n',
  blob=new Blob([body],{type:'application/json;charset=utf-8'}),
  url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='ResearchOS_v041_'+state.case.relationshipId+'_'+
  state.case.asOf.replace(/[^0-9A-Za-z_-]/g,'_')+'.json';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  const catalog=await read('catalog');
  if(!catalog.enabled){put('caseMessage','Private case evidence unavailable off loopback.');return;}
  await reloadInventory();
 }catch(e){put('caseMessage','Local source dossier unavailable: '+e.message);}
})();
})();