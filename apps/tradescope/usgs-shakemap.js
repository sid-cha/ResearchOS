(()=>{'use strict';
const $=id=>document.getElementById(id),set=(id,text)=>{$(id).textContent=String(text??'—');};
const add=(p,tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);
 if(cls)e.className=cls;p.append(e);return e;};
let report=null,choices=null,busy=false,enabled=false;
async function api(route,{method='GET',body=null}={}){
 const response=await fetch('/api/shakemap-mmi/'+route,{method,cache:'no-store',
  headers:body?{'Content-Type':'application/json','X-ResearchOS-ShakeMap':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const obj=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(obj.error||'USGS ShakeMap sampling unavailable');
 return obj;
}
function fill(id,items,placeholder,key,title){
 const control=$(id),prior=control.value;control.replaceChildren();
 add(control,'option',placeholder).value='';
 for(const item of items){const option=add(control,'option',title(item));option.value=key(item);}
 if([...control.options].some(x=>x.value===prior))control.value=prior;
}
const validCutoff=x=>!x||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x)));
async function refresh(){
 const cutoff=$('mmiAsOf').value.trim();
 if(!validCutoff(cutoff)){set('mmiStatus','Full UTC as-of timestamp required, e.g. 2026-11-16T18:00:00Z');return;}
 const params=cutoff?'?asOf='+encodeURIComponent(cutoff):'';
 report=await api('view'+params);
 const node=$('mmiResults');node.replaceChildren();
 if(!report.results.length)add(node,'p','No previously captured USGS shaking grid samples for this cutoff.');
 for(const r of report.results){
  const card=add(node,'article',undefined,'mmi-card'),s=r.sample;
  add(card,'h3',r.eventTitle+' / '+r.siteName);
  if(s.status==='USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE')
   add(card,'strong','MMI '+s.estimatedMmi.toFixed(2));
  else add(card,'strong',s.status.replaceAll('_',' '));
  add(card,'p','EPA coordinate: '+r.siteCoordinates[1]+', '+r.siteCoordinates[0]+
   (s.nearestGridPoint?' · nearest modeled node: '+s.nearestGridPoint[1]+', '+s.nearestGridPoint[0]:''));
  if(s.nearestDistanceKm!=null)
   add(card,'small','Nearest grid-point separation: '+s.nearestDistanceKm+' km');
  add(card,'small','Local capture '+r.capturedAt+
   ' · originally reported USGS product update '+(r.productUpdatedAtReported||'unknown'));
  add(card,'small','Event detail SHA-256 '+r.detailSha256);
  if(r.gridSha256)add(card,'small','Grid SHA-256 '+r.gridSha256);
  if(r.gridUrl){
   const a=add(card,'a','USGS grid source');a.href=r.gridUrl;
   a.target='_blank';a.rel='noopener noreferrer';
  }
  add(card,'p','Estimated source shaking only. No measured site damage, ownership, insurance or financial impact.','caveat');
 }
 set('mmiCounts',report.results.length+' CURRENT GRID SNAPSHOTS');
 set('mmiStatus','Observed revisions: '+report.capturedRevisions+' · local as-of '+report.asOf+
  '. USGS grid contents are source-model outputs; missing data is unknown.');
 $('mmiExport').disabled=!report.results.length;
}
async function inventory(){
 const c=await api('choices');choices=c;
 fill('mmiEvent',c.earthquakes,'Choose captured USGS event',
  x=>x.eventId,x=>x.title+' · '+x.eventId);
 fill('mmiFacility',c.facilities,'Choose captured EPA facility',
  x=>x.registryId,x=>x.facilityName+' · '+x.registryId);
 $('mmiCapture').disabled=!enabled||busy||!c.earthquakes.length||!c.facilities.length;
 if(!c.earthquakes.length||!c.facilities.length)set('mmiCaptureStatus',
  'Capture at least one USGS event and EPA FRS facility before requesting a ShakeMap grid.');
}
$('shakemapForm').addEventListener('submit',event=>{
 event.preventDefault();if(busy||!enabled||!$('mmiEvent').value||!$('mmiFacility').value)return;
 busy=true;$('mmiCapture').disabled=true;
 set('mmiCaptureStatus','Fetching a fixed USGS earthquake detail, checking available ShakeMap products and sampling the reported grid…');
 void api('capture',{method:'POST',
  body:{eventId:$('mmiEvent').value,registryId:$('mmiFacility').value}
 }).then(async result=>{
  const r=result.record;
  set('mmiCaptureStatus',(result.deduplicated?'Existing identical source capture reused':'New USGS grid observation saved')+
   ' · '+r.capturedAt+' · '+r.sample.status+
   (r.sample.estimatedMmi!==null&&r.sample.estimatedMmi!==undefined?
    ' · modeled MMI '+r.sample.estimatedMmi:'')+
   '. This is not verified facility damage.');
  await refresh();
 }).catch(e=>set('mmiCaptureStatus','USGS capture failed: '+e.message))
 .finally(()=>{busy=false;$('mmiCapture').disabled=!enabled||!choices?.earthquakes.length||!choices?.facilities.length;});
});
$('mmiRefresh').addEventListener('click',()=>void refresh().catch(e=>set('mmiStatus',e.message)));
$('mmiExport').addEventListener('click',()=>{
 if(!report||!report.results.length)return;
 const data=JSON.stringify(report,null,2)+'\n';
 const blob=new Blob([data],{type:'application/json;charset=utf-8'});
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download='ResearchOS_v043_USGS_ShakeMap_MMI.json';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  const cat=await api('catalog');enabled=cat.enabled;
  if(!enabled){
   set('mmiStatus','USGS source sampling is disabled outside a loopback Node host.');
   for(const id of ['mmiCapture','mmiRefresh','mmiExport'])$(id).disabled=true;
   return;
  }
  await inventory();await refresh();
 }catch(e){set('mmiStatus','Local USGS ShakeMap research unavailable: '+e.message);}
})();
})();