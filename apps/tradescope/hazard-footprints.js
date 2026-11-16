(()=>{'use strict';
const el=id=>document.getElementById(id),put=(id,v)=>{el(id).textContent=String(v??'—');};
const make=(parent,tag,value,cls)=>{
 const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);
 if(cls)e.className=cls;parent.append(e);return e;
};
let facilities=[],report=null,disabled=false,pending=false;
const validTime=x=>!x||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x)));
async function request(endpoint,{method='GET',data=null}={}){
 const res=await fetch('/api/hazard-footprints/'+endpoint,{
  method,cache:'no-store',headers:data?{
   'Content-Type':'application/json','X-ResearchOS-Hazard-Capture':'1'
  }:{},body:data?JSON.stringify(data):undefined
 });
 const json=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(json.error||'Hazard evidence unavailable');
 return json;
}
function selectOptions(id,items,label,value,placeholder){
 const node=el(id),prior=node.value;node.replaceChildren();
 make(node,'option',placeholder).value='';
 for(const item of items){const opt=make(node,'option',label(item));opt.value=value(item);}
 if([...node.options].some(x=>x.value===prior))node.value=prior;
}
async function loadSites(){
 const f=await request('facilities');
 facilities=f.facilities;
 selectOptions('hazardFacility',facilities,
  x=>x.facilityName+' · '+x.registryId,x=>x.registryId,'Choose EPA FRS facility');
 selectOptions('hazardFilter',facilities,
  x=>x.facilityName+' · '+x.registryId,x=>x.registryId,'All captured sites');
 el('captureHazard').disabled=disabled||!facilities.length||pending;
 if(!facilities.length)put('captureHazardStatus',
  'No EPA FRS facility coordinates are locally captured. Start from Facility Crosswalk.');
}
function draw(){
 const container=el('hazardResults');container.replaceChildren();
 if(!report||!report.snapshots.length){
  make(container,'p','No bounded official source polygon snapshots are stored for this cutoff. Missing data is not a safe-area finding.');
  el('downloadFootprints').disabled=true;return;
 }
 for(const s of report.snapshots){
  const card=make(container,'article',undefined,'hazard-card');
  make(card,'strong',s.provider.replaceAll('_',' '));
  make(card,'h3',s.siteName+' · EPA '+s.registryId);
  make(card,'small','Locally captured: '+s.capturedAt);
  make(card,'small','FRS coordinate: '+s.siteCoordinates[1]+', '+s.siteCoordinates[0]+
   ' (datum: '+s.siteCoordinateDatum+')');
  make(card,'small','Provider payload SHA-256: '+s.bodySha256);
  make(card,'small','Returned '+s.providerFeatureCount+' features · discarded: '+
   Object.entries(s.skipped).filter(([k,v])=>v).map(([k,v])=>k+'='+v).join(', '));
  const link=make(card,'a','Original provider query');link.href=s.sourceUrl;
  link.target='_blank';link.rel='noopener noreferrer';
  if(!s.features.length){
   make(card,'p','No supported flood-warning or wildfire-perimeter polygon was returned. Alert geometry can be unavailable; no exposure conclusion follows.');
  }
  for(const feature of s.features){
   const kind=feature.relation==='INSIDE_REPORTED_POLYGON'?'inside':
    feature.relation==='BOUNDARY_UNCERTAIN'?'boundary':'outside';
   make(card,'h3',feature.name+' · '+feature.kind);
   make(card,'p',feature.relation.replaceAll('_',' '),kind);
   make(card,'small','Polygon coordinates: '+feature.coordinatesCount+
    ' · provider event time: '+(feature.providerReportedTime||'unavailable'));
   make(card,'p','Physical damage, flood depth, operating interruption and financial impact NOT verified.');
  }
 }
 el('downloadFootprints').disabled=false;
}
async function refresh(){
 const asOf=el('hazardAsOf').value.trim();
 if(!validTime(asOf)){put('hazardReviewStatus','Supply a complete UTC timestamp, for example 2026-11-16T18:00:00Z');return;}
 const params=new URLSearchParams();
 if(asOf)params.set('asOf',asOf);
 const id=el('hazardFilter').value;if(id)params.set('registryId',id);
 report=await request('view'+(params.size?'?'+params:''));
 draw();
 put('hazardCounts',report.snapshots.length+' SOURCE SNAPSHOTS');
 put('hazardReviewStatus','As of '+report.asOf+' · '+
  report.totalCapturedRevisions+' locally captured revisions, '+report.snapshots.length+
  ' latest site/provider snapshots. All are unverified damage hypotheses.');
}
el('hazardForm').addEventListener('submit',event=>{
 event.preventDefault();
 if(pending||disabled)return;
 const registryId=el('hazardFacility').value,provider=el('hazardProvider').value;
 if(!registryId)return;
 pending=true;el('captureHazard').disabled=true;
 put('captureHazardStatus','Querying the selected official hazard source by EPA FRS point. Oversized or partial geometries are rejected.');
 void request('capture',{method:'POST',data:{registryId,provider}}).then(async result=>{
  const s=result.snapshot;
  put('captureHazardStatus',(result.deduplicated?'Identical source response already captured':
   'New immutable source observation stored')+' · '+s.capturedAt+
   ' · features retained '+s.features.length+' · SHA-256 '+s.bodySha256+
   '. Point containment is not proof of damage.');
  await refresh();
 }).catch(e=>put('captureHazardStatus','Official source capture failed: '+e.message))
 .finally(()=>{pending=false;el('captureHazard').disabled=disabled||!facilities.length;});
});
el('refreshHazards').addEventListener('click',()=>void refresh().catch(e=>put('hazardReviewStatus',e.message)));
el('hazardFilter').addEventListener('change',()=>void refresh().catch(e=>put('hazardReviewStatus',e.message)));
el('downloadFootprints').addEventListener('click',()=>{
 if(!report)return;
 const features=report.snapshots.flatMap(s=>s.features.map(f=>({
  type:'Feature',id:f.id,geometry:f.geometry,
  properties:{sourceProvider:s.provider,siteFrsId:s.registryId,
   siteName:s.siteName,siteCoordinates:s.siteCoordinates,
   relationToSite:f.relation,reportedFeatureName:f.name,
   localCapturedAt:s.capturedAt,bodySha256:s.bodySha256,
   actualDamageVerified:false,sourceCompletenessVerified:false}
 })));
 const body=JSON.stringify({type:'FeatureCollection',
  researchAsOf:report.asOf,provenance:'ResearchOS v0.42 bounded snapshots; not certified hazard damage',
  features},null,2)+'\n';
 const file=new Blob([body],{type:'application/geo+json'});
 const url=URL.createObjectURL(file),a=document.createElement('a');
 a.href=url;a.download='ResearchOS_v042_hazard_footprints.geojson';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  const cat=await request('catalog');disabled=!cat.enabled;
  if(disabled){
   for(const id of ['captureHazard','refreshHazards','downloadFootprints'])el(id).disabled=true;
   put('hazardReviewStatus','Private hazard source access disabled on nonloopback host.');
   return;
  }
  await loadSites();await refresh();
 }catch(e){put('hazardReviewStatus','Local hazard research unavailable: '+e.message);}
})();
})();