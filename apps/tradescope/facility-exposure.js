(()=>{'use strict';
const el=id=>document.getElementById(id);
const put=(id,value)=>{el(id).textContent=String(value??'—');};
const add=(parent,tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;parent.append(n);return n;};
async function api(route,{method='GET',data=null}={}){
 const res=await fetch('/api/facility-exposure/'+route,{method,cache:'no-store',
  headers:data?{'Content-Type':'application/json','X-ResearchOS-Facility-Research':'1'}:{},
  body:data?JSON.stringify(data):undefined});
 const value=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(value.error||'Facility research unavailable');
 return value;
}
const state={catalog:null,view:null,busy:false};
function validAsOf(value){
 return !value||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value)));
}
async function renderView(){
 const eventId=el('facilityEvent').value,asOf=el('facilityAsOf').value.trim();
 if(!validAsOf(asOf)){put('candidateStatus','Use complete UTC as-of time, such as 2026-11-15T18:00:00Z.');return;}
 const query=new URLSearchParams({radiusKm:el('facilityRadius').value});
 if(eventId)query.set('eventId',eventId);if(asOf)query.set('asOf',asOf);
 const data=await api('view?'+query.toString());
 state.view=data;
 put('facilityCount',data.facilities.length+' SITES · '+data.companies.length+' FILERS');
 for(const [id,source,valueKey,labelFn,initial] of [
  ['linkFacility',data.facilities,'registryId',x=>x.facilityName+' · '+x.registryId,'Choose captured site'],
  ['linkCompany',data.companies,'cik',x=>x.companyName+' · '+(x.tickers||[]).join('/'),'Choose captured company']
 ]){
  const selection=el(id),previous=selection.value;selection.replaceChildren();
  add(selection,'option',initial).value='';
  for(const item of source){const option=add(selection,'option',labelFn(item));option.value=item[valueKey];}
  if([...selection.options].some(x=>x.value===previous))selection.value=previous;
 }
 const eventSelection=el('facilityEvent'),previousEvent=eventSelection.value;
 eventSelection.replaceChildren();add(eventSelection,'option','All locally captured source events').value='';
 for(const e of data.events){const option=add(eventSelection,'option',e.title+' · '+e.source);option.value=e.id;}
 if([...eventSelection.options].some(x=>x.value===previousEvent))eventSelection.value=previousEvent;
 const results=el('candidateResults');results.replaceChildren();
 if(!data.candidates.length){
  add(results,'p','No nearby captured facility/events under this radius and cutoff. Missing source data or distance does not imply an area is safe.');
 }else{
  for(const x of data.candidates){
   const c=add(results,'article',undefined,'facility-candidate');
   add(c,'div',x.distanceKm+' km','distance');
   add(c,'h3',x.facilityName);
   add(c,'p','Event: '+x.eventId+' · '+x.eventType+' · first locally seen '+x.eventFirstSeenAt);
   add(c,'p','EPA FRS Registry ID '+x.facilityId+' · captured '+x.facilityCapturedAt);
   if(!x.links.length)add(c,'p','NO documented company–facility relationship claim in the local record.');
   for(const link of x.links){
    const box=add(c,'div',undefined,'claimed');
    add(box,'strong',link.companyName+' · '+link.cik);
    add(box,'p',(link.tickers||[]).join(', ')+' · '+link.claimedRelationship+
      ' (CLAIM ONLY — NOT VERIFIED OWNERSHIP)');
    if(link.evidenceUrl){
     const a=add(box,'a','Operator-supplied SEC filing reference');
     a.href=link.evidenceUrl;a.target='_blank';a.rel='noopener noreferrer';
     if(link.relationshipId){
      const verify=add(box,'a','Challenge relationship evidence & dates');
      verify.href='/relationship-verification.html?relationship='+encodeURIComponent(link.relationshipId);
     }
    }
   }
   add(c,'p','Assessment: '+x.resultClass+
    ' · Damage, company ownership, supply-chain losses and stock effect UNVERIFIED.');
   for(const flag of x.antiAgentFlags.slice(0,5))add(c,'span',flag.replaceAll('_',' '),'flag');
  }
 }
 put('candidateStatus',data.candidates.length+' geographic research candidates; '+data.relationships.length+
  ' recorded relationship claims. Measured issuer impact and verified ownership remain unavailable.');
}
async function runWrite(route,payload,statusId,buttonId){
 if(state.busy)return;
 state.busy=true;el(buttonId).disabled=true;put(statusId,'Requesting official provider metadata…');
 try{
  const output=await api(route,{method:'POST',data:payload});
  put(statusId,(output.deduplicated?'Previously captured':'Saved official response')+
   ' · '+output.record.capturedAt+
   '. Provider metadata is not ownership or damage proof.');
  await renderView();
 }catch(e){put(statusId,'Research request failed: '+e.message);}
 finally{el(buttonId).disabled=false;state.busy=false;}
}
el('facilityForm').addEventListener('submit',event=>{
 event.preventDefault();void runWrite('facility',{registryId:el('frsId').value.trim()},'facilityStatus','captureFacility');
});
el('companyForm').addEventListener('submit',event=>{
 event.preventDefault();void runWrite('company',{cik:el('secCik').value.trim()},'companyStatus','captureCompany');
});
el('relationshipForm').addEventListener('submit',event=>{
 event.preventDefault();
 void runWrite('link',{registryId:el('linkFacility').value,cik:el('linkCompany').value,
  relationshipType:el('linkType').value,evidenceUrl:el('linkSource').value.trim(),
  rationale:el('linkRationale').value.trim()},'linkStatus','linkSave');
});
el('evaluateFacility').addEventListener('click',()=>void renderView().catch(e=>put('candidateStatus',e.message)));
el('refreshFacility').addEventListener('click',()=>void renderView().catch(e=>put('candidateStatus',e.message)));
void (async()=>{
 try{
  state.catalog=await api('catalog');
  if(!state.catalog.enabled){
   for(const id of ['captureFacility','captureCompany','linkSave','evaluateFacility'])el(id).disabled=true;
   put('candidateStatus','Facility research is disabled on this host; use loopback Node for private data.');
   return;
  }
  await renderView();
 }catch(e){put('candidateStatus','Facility exposure service unavailable: '+e.message);}
})();
})();