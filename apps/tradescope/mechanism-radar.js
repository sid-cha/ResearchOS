(()=>{'use strict';
const $=id=>document.getElementById(id),text=(id,s)=>{$(id).textContent=String(s??'—');};
const el=(node,tag,content,cls)=>{
 const x=document.createElement(tag);if(content!==undefined)x.textContent=String(content);
 if(cls)x.className=cls;node.append(x);return x;
};
let catalog=null,report=null,busy=false;
const validUtc=s=>!s||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&!Number.isNaN(Date.parse(s)));
async function api(route,{method='GET',data=null}={}){
 const r=await fetch('/api/mechanism-radar/'+route,{cache:'no-store',method,
  headers:data?{'Content-Type':'application/json','X-ResearchOS-Mechanism':'1'}:{},
  body:data?JSON.stringify(data):undefined});
 const result=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(result.error||'Mechanism evidence unavailable');
 return result;
}
function fill(id,values,placeholder){
 const node=$(id),prior=node.value;node.replaceChildren();
 el(node,'option',placeholder).value='';
 for(const x of values){const option=el(node,'option',x.title||x.id);option.value=x.id;}
 if([...node.options].some(x=>x.value===prior))node.value=prior;
}
function reconcileProviders(){
 const canNoaa=$('mechanismTheme').value==='enso-circulation',
  select=$('mechanismProvider');
 select.querySelector('option[value="NOAA_CPC"]').disabled=!canNoaa;
 if(!canNoaa&&select.value==='NOAA_CPC')select.value='GDELT_MEDIA';
}
function render(){
 const content=$('mechanismCases');content.replaceChildren();
 if(!report)return;
 text('mechanismCount',report.results.reduce((n,x)=>n+x.observations.length,0)+' SOURCE OBSERVATIONS');
 text('mechanismStatus','Local replay as-of '+report.asOf+'. Observations are leads; downstream graph edges are not established by headline matching.');
 for(const group of report.results){
  const card=el(content,'article',undefined,'mechanism-card');
  el(card,'small',group.class+' · '+group.readiness);
  el(card,'h3',group.title);
  el(card,'p',group.observations.length+' locally observed source records · '+
   group.nodes.length+' mechanism stages · '+group.edges.length+' CONDITIONAL edges');
  el(card,'h4','Source observations (not downstream proof)');
  if(!group.observations.length)el(card,'p','No captured source observations. This is not evidence the mechanism is absent.');
  for(const s of group.observations.slice(0,12)){
   const box=el(card,'div',undefined,'source-line');
   el(box,'p',s.title);
   el(box,'small',s.provider+' · ResearchOS first captured '+s.localFirstSeenAt+
    (s.issueDateClaimedByArchive?' · NOAA issue date claimed '+s.issueDateClaimedByArchive:''));
   if(s.sourceUrl){const a=el(box,'a','Original source');a.href=s.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';}
  }
  el(card,'h4','Causal hypothesis paths (never assumed verified)');
  for(const edge of group.edges){
   const box=el(card,'div',undefined,'conditional');
   const from=group.nodes.find(x=>x.id===edge.from),to=group.nodes.find(x=>x.id===edge.to);
   el(box,'strong',(from?.title||edge.from)+' → '+(to?.title||edge.to));
   el(box,'p',edge.mechanism);
   el(box,'small',edge.context+' · Conditional · Causally verified: NO');
  }
  el(card,'h4','Research requirements');
  for(const gap of group.missingEvidence.slice(0,10)){
   const p=el(card,'p');
   p.textContent='• '+gap.requirement+' — NOT ESTABLISHED BY THIS DISCOVERY';
  }
  el(card,'small','No named issuer mapping, stock impact forecast or causal probability is supplied.');
 }
 $('mechanismExport').disabled=!report.results.length;
}
async function replay(){
 const cutoff=$('mechanismAsOf').value.trim();
 if(!validUtc(cutoff)){text('mechanismStatus','Use a full UTC date and time such as 2026-11-16T18:00:00Z');return;}
 const params=new URLSearchParams();
 if(cutoff)params.set('asOf',cutoff);
 if($('mechanismFilter').value)params.set('themeId',$('mechanismFilter').value);
 report=await api('view'+(params.size?'?'+params:''));
 render();
}
$('mechanismTheme').addEventListener('change',reconcileProviders);
$('mechanismForm').addEventListener('submit',event=>{
 event.preventDefault();
 if(busy||!catalog?.enabled||!catalog?.rightsAcknowledged)return;
 const themeId=$('mechanismTheme').value,provider=$('mechanismProvider').value;
 if(!themeId)return;
 busy=true;$('mechanismCapture').disabled=true;
 text('mechanismCaptureStatus','Capturing selected source report; economic mechanism links will remain unverified.');
 void api('capture',{method:'POST',data:{themeId,provider}}).then(async r=>{
  text('mechanismCaptureStatus',(r.deduplicated?'Unchanged source already observed':'New source report saved')+
   ' · '+r.snapshot.capturedAt+' · '+r.snapshot.observations.length+' observations'+
   ' · SHA-256 '+r.snapshot.bodySha256+'.');
  await replay();
 }).catch(e=>text('mechanismCaptureStatus','Source capture failed: '+e.message))
 .finally(()=>{busy=false;$('mechanismCapture').disabled=!catalog?.enabled||!catalog?.rightsAcknowledged;});
});
$('mechanismReload').addEventListener('click',()=>void replay().catch(e=>text('mechanismStatus',e.message)));
$('mechanismFilter').addEventListener('change',()=>void replay().catch(e=>text('mechanismStatus',e.message)));
$('mechanismExport').addEventListener('click',()=>{
 if(!report)return;
 const body=JSON.stringify(report,null,2)+'\n',blob=new Blob([body],{type:'application/json'}),
  url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ResearchOS_v045_mechanism_discovery.json';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  catalog=await api('catalog');
  fill('mechanismTheme',catalog.themes,'Select a mechanism family');
  fill('mechanismFilter',catalog.themes,'All mechanism families');
  reconcileProviders();
  $('mechanismCapture').disabled=!catalog.enabled||!catalog.rightsAcknowledged;
  if(!catalog.enabled||!catalog.rightsAcknowledged)
   text('mechanismCaptureStatus','Local-only capture needs explicit source-use/retention acknowledgement in private .env.');
  await replay();
 }catch(e){text('mechanismStatus','Mechanism research unavailable: '+e.message);}
})();
})();