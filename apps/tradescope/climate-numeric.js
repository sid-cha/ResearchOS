(()=>{'use strict';
const $=id=>document.getElementById(id),put=(id,x)=>{$(id).textContent=String(x??'—');};
const add=(parent,tag,value,className)=>{
 const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);
 if(className)e.className=className;parent.append(e);return e;
};
let config=null,report=null,busy=false;
const utcOk=x=>!x||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x)));
async function api(route,{method='GET',body=null}={}){
 const response=await fetch('/api/climate-numeric/'+route,{method,cache:'no-store',
  headers:body?{'Content-Type':'application/json','X-ResearchOS-Climate-Numeric':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Numeric NOAA research unavailable');
 return data;
}
function fill(id,items,placeholder){
 const node=$(id),before=node.value;node.replaceChildren();
 add(node,'option',placeholder).value='';
 for(const item of items){const opt=add(node,'option',item.label);opt.value=item.id;}
 if([...node.options].some(x=>x.value===before))node.value=before;
}
function sparkline(parent,points){
 if(points.length<2)return;
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 310 74');svg.setAttribute('role','img');
 svg.setAttribute('aria-label','Last '+points.length+' source-reported monthly values, not predicted values');
 const values=points.map(x=>x.value),low=Math.min(...values,-0.5),high=Math.max(...values,0.5);
 const height=Math.max(high-low,0.2),stroke=high-low;
 const line=document.createElementNS(ns,'polyline');
 const coords=values.map((v,i)=>{
  const x=i*310/(values.length-1),y=65-(v-low)/height*56;
  return x.toFixed(1)+','+y.toFixed(1);
 }).join(' ');
 line.setAttribute('points',coords);line.setAttribute('fill','none');
 line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2.4');
 svg.append(line);
 if(low<=0&&high>=0){
  const zero=document.createElementNS(ns,'line');
  zero.setAttribute('x1','0');zero.setAttribute('x2','310');
  const y=(65-(0-low)/height*56).toFixed(1);
  zero.setAttribute('y1',y);zero.setAttribute('y2',y);
  zero.setAttribute('stroke','currentColor');zero.setAttribute('opacity','0.2');
  svg.prepend(zero);
 }
 parent.append(svg);
}
function render(){
 const node=$('numericResults'),consensus=$('numericConsensus');
 node.replaceChildren();consensus.replaceChildren();
 if(!report)return;
 const a=report.assessment;
 add(consensus,'small','CROSS-INDEX RESEARCH CONTEXT / NOT AN OFFICIAL ENSO DETERMINATION');
 add(consensus,'h3',a.status.replaceAll('_',' '));
 add(consensus,'p','RONI: '+(a.roni??'not captured')+
  ' °C · relative Niño 3.4: '+(a.relativeNino34??'not captured')+
  ' °C · atmosphere support: '+a.atmosphericSupportCount+
  ' of '+a.atmosphereCompared.length+' eligible indices');
 add(consensus,'p',a.interpretation);
 put('numericCounts',report.metrics.length+' CAPTURED INDICATORS / '+report.totalCapturedVersions+' SOURCE VERSIONS');
 put('numericStatus','As-of '+report.asOf+'. Only source versions actually captured before this instant are shown.');
 if(!report.metrics.length)add(node,'p','No captured NOAA numerical indices in this historical view. Missing data is not normal conditions.');
 for(const m of report.metrics){
  const card=add(node,'article',undefined,'numeric-card');
  add(card,'small',m.metricId+' · '+m.signal);
  add(card,'h3',m.label);
  add(card,'strong',m.trend.latest?m.trend.latest.value.toFixed(2)+' '+m.unit:'No value');
  add(card,'p','Latest source period '+(m.trend.latest?.sourcePeriod||'unknown')+
   ' · 3-month change '+(m.trend.delta3===null?'not available':m.trend.delta3+' '+m.unit));
  sparkline(card,m.series.slice(-24));
  add(card,'small','Local capture '+m.capturedAt);
  add(card,'small','SHA-256 '+m.bodySha256);
  add(card,'small','Period revision candidates since prior snapshot: '+m.revisions.length+
   ' · newly retained periods: '+m.addedPeriods.length,'numeric-revised');
  for(const r of m.revisions.slice(-5))
   add(card,'small',r.period+': '+r.before+' → '+r.after,'numeric-revised');
  add(card,'p','NOAA measurement dates are not original release timestamps. Recent values may be provisional. No regional/issuer outcome is inferred.');
  const link=add(card,'a','Official NOAA source file');link.href=m.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
 }
 $('numericExport').disabled=false;
}
async function refresh(){
 const t=$('numericAsOf').value.trim();
 if(!utcOk(t)){put('numericStatus','Use complete UTC instant such as 2026-11-16T18:00:00Z');return;}
 const params=new URLSearchParams();
 if(t)params.set('asOf',t);
 if($('numericFilter').value)params.set('metricId',$('numericFilter').value);
 report=await api('view'+(params.size?'?'+params:''));
 render();
}
$('numericForm').addEventListener('submit',event=>{
 event.preventDefault();if(busy||!config?.enabled||!config?.rightsAcknowledged)return;
 const metricId=$('numericMetric').value;if(!metricId)return;
 busy=true;$('numericCapture').disabled=true;
 put('numericCaptureStatus','Retrieving the selected NOAA numerical file. Future periods, unavailable values and malformed rows will not enter the archive.');
 void api('capture',{method:'POST',body:{metricId}}).then(async result=>{
  const r=result.record;
  put('numericCaptureStatus',(result.deduplicated?'Identical source response already captured':
   'New numerical source snapshot stored')+' · '+r.capturedAt+' · '+r.series.length+
   ' retained months · '+r.changedSincePrevious.length+' changed values · SHA-256 '+r.bodySha256);
  await refresh();
 }).catch(e=>put('numericCaptureStatus','NOAA numerical capture failed: '+e.message))
 .finally(()=>{busy=false;$('numericCapture').disabled=!config?.enabled||!config?.rightsAcknowledged;});
});
$('numericRefresh').addEventListener('click',()=>void refresh().catch(e=>put('numericStatus',e.message)));
$('numericFilter').addEventListener('change',()=>void refresh().catch(e=>put('numericStatus',e.message)));
$('numericExport').addEventListener('click',()=>{
 if(!report)return;
 const data=JSON.stringify(report,null,2)+'\n';
 const blob=new Blob([data],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;
 link.download='ResearchOS_v046_noaa_climate_numeric.json';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  config=await api('catalog');
  fill('numericMetric',config.metrics,'Choose NOAA numerical index');
  fill('numericFilter',config.metrics,'All captured indicators');
  $('numericCapture').disabled=!config.enabled||!config.rightsAcknowledged;
  if(!config.enabled||!config.rightsAcknowledged)
   put('numericCaptureStatus','Capture disabled: use the private .env source-retention acknowledgement and local capture switch.');
  await refresh();
 }catch(e){put('numericStatus','Numeric climate research unavailable: '+e.message);}
})();
})();