(()=>{'use strict';
const $=id=>document.getElementById(id),put=(id,value)=>{$(id).textContent=String(value??'—');};
const add=(parent,tag,content,className)=>{
 const el=document.createElement(tag);if(content!==undefined)el.textContent=String(content);
 if(className)el.className=className;parent.append(el);return el;
};
let catalogue=null,report=null,busy=false;
async function api(route,{method='GET',body=null}={}){
 const response=await fetch('/api/source-monitor/'+route,{method,cache:'no-store',
  headers:body?{'Content-Type':'application/json','X-ResearchOS-Source-Monitor':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const obj=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(obj.error||'Source scheduler unavailable');
 return obj;
}
function choices(id,items,caption,value){
 const node=$(id),saved=node.value;node.replaceChildren();
 const base=add(node,'option',caption);base.value='';
 for(const item of items){const option=add(node,'option',item.label||item);
  option.value=value?value(item):item;}
 if([...node.options].some(x=>x.value===saved))node.value=saved;
}
const rule=()=>catalogue?.scheduleRules.find(x=>x.kind===$('monitorKind').value);
function providers(){
 const def=rule();
 choices('monitorTarget',def?.targets||[],'Choose registered target');
 if($('monitorTarget').value==='')$('monitorTarget').value=def?.targets[0]||'';
 chooseProviders();
 $('monitorInterval').min=String(def?.minIntervalMinutes||60);
 $('monitorInterval').max=String(def?.maxIntervalMinutes||1440);
 $('monitorInterval').step=String(def?.minIntervalMinutes||60);
 $('monitorInterval').value=String(def?.minIntervalMinutes||360);
}
function chooseProviders(){
 const def=rule(),target=$('monitorTarget').value;
 let choicesArr=def?.providers||[];
 if(def?.kind==='NOAA_NUMERIC')choicesArr=choicesArr.filter(x=>x===target);
 if(def?.kind==='MECHANISM_RADAR'&&target!=='enso-circulation')
  choicesArr=choicesArr.filter(x=>x!=='NOAA_CPC');
 choices('monitorProvider',choicesArr,'Choose source provider');
 if(!$('monitorProvider').value)$('monitorProvider').value=choicesArr[0]||'';
}
async function action(route,data){
 if(busy)return;
 busy=true;
 put('monitorStatus','Updating durable local monitoring state…');
 try{
  const result=await api(route,{method:'POST',body:data});
  put('monitorConfigureStatus',route+' accepted; local record updated.');
  await refresh();
  return result;
 }catch(e){put('monitorConfigureStatus',route+' failed: '+e.message);}
 finally{busy=false;}
}
function actionButton(parent,label,callback,disabled=false){
 const btn=add(parent,'button',label);btn.type='button';
 btn.disabled=busy||disabled;btn.addEventListener('click',callback);return btn;
}
function render(){
 const jobs=$('monitorJobCards'),alerts=$('monitorAlertCards'),runs=$('monitorRuns');
 jobs.replaceChildren();alerts.replaceChildren();runs.replaceChildren();
 if(!report)return;
 put('monitorStatus',(report.running?'Local scheduled runner active':'Local scheduled runner not active')+
  ' · '+report.summary.jobs+' jobs · '+report.summary.recentFailureCount+
  ' failed attempts in recent history. No external alert delivery configured.');
 put('monitorJobsCount',report.summary.enabledJobs+' ENABLED / '+report.summary.jobs+' TOTAL');
 put('monitorAlertCount',report.summary.pendingReview+' UNREVIEWED');
 if(!report.jobs.length)add(jobs,'p','No schedules configured. Add an explicit permitted-source check above.');
 for(const j of report.jobs){
  const card=add(jobs,'article',undefined,'monitor-card');
  add(card,'strong',j.kind+' · '+j.provider);
  add(card,'h3',j.target+' · '+j.intervalMinutes+'-minute interval');
  add(card,'p','Status: '+j.status+' · '+(j.enabled?'Enabled':'Paused')+
   ' · consecutive failures '+j.failures,'');
  add(card,'small','Next eligible run: '+j.nextRunAt,'monitor-audit-time');
  if(j.lastResult){
   add(card,'small','Last result: '+j.lastResult.status+' · '+j.lastResult.finishedAt);
   if(j.lastResult.scheduledStartLagMs!==undefined)
    add(card,'small','Scheduled start delay: '+j.lastResult.scheduledStartLagMs+' ms; excludes prepublication time.');
   if(j.lastResult.sourceCapturedAt)
    add(card,'small','Source recorded locally: '+j.lastResult.sourceCapturedAt+
     '; newly queued reviews: '+j.lastResult.newReviewItems);
  }
  const controls=add(card,'div',undefined,'monitor-controls');
  actionButton(controls,'Run once now',()=>void action('run',{jobId:j.id}),!j.enabled);
  actionButton(controls,j.enabled?'Pause':'Resume',()=>void action('toggle',{jobId:j.id,enabled:!j.enabled}));
 }
 if(!report.alerts.length)add(alerts,'p','No locally queued research alerts. This is not proof of a quiet risk environment.');
 for(const a of report.alerts){
  const card=add(alerts,'article',undefined,'monitor-card');
  add(card,'strong',a.priority+' · '+a.type,a.priority==='ELEVATED_REVIEW'?'risk':'');
  add(card,'h3',a.title);
  add(card,'p',a.details);
  add(card,'small','Source locally observed: '+a.firstObservedAt);
  add(card,'small','Added to local inbox: '+a.inboxAt+
   ' · local capture-to-inbox delay: '+a.localInboxLatencyMs+' ms');
  add(card,'small','Delivery: '+a.deliveryStatus+' · source publication/market causality NOT verified');
  add(card,'small','Review status: '+a.status+(a.acknowledgedAt?' · '+a.acknowledgedAt:''));
  if(a.status==='NEW'){
   const controls=add(card,'div',undefined,'monitor-controls');
   actionButton(controls,'Acknowledge in inbox',()=>void action('acknowledge',{alertId:a.id}));
  }
 }
 if(!report.recentRuns.length)add(runs,'p','No source attempts recorded.');
 for(const r of report.recentRuns){
  const card=add(runs,'article',undefined,'monitor-card');
  add(card,'strong',r.status,r.status==='FAILED'||r.status==='INTERRUPTED'?'fail':'');
  add(card,'h3',r.kind+' · '+r.target+' · '+r.provider);
  add(card,'small','Scheduled '+r.scheduledAt+' · started '+r.startedAt+
   ' · finished '+(r.finishedAt||'interrupted'));
  add(card,'p','Local inbox events created: '+r.alertCount+
   ' · source response unchanged: '+(r.deduplicated===null?'unknown':r.deduplicated));
  if(r.error)add(card,'p',r.error,'fail');
 }
 $('monitorExport').disabled=false;
}
async function refresh(){
 report=await api('status');
 render();
}
$('monitorKind').addEventListener('change',providers);
$('monitorTarget').addEventListener('change',chooseProviders);
$('monitorForm').addEventListener('submit',e=>{
 e.preventDefault();if(!catalogue?.enabled||!catalogue?.rightsAcknowledged)return;
 const kind=$('monitorKind').value,target=$('monitorTarget').value,
  provider=$('monitorProvider').value,intervalMinutes=Number($('monitorInterval').value);
 if(!kind||!target||!provider)return;
 void action('schedule',{kind,target,provider,intervalMinutes,enabled:true});
});
$('monitorRefresh').addEventListener('click',()=>void refresh().catch(e=>put('monitorStatus',e.message)));
$('monitorExport').addEventListener('click',()=>{
 if(!report)return;
 const data=JSON.stringify(report,null,2)+'\n';
 const blob=new Blob([data],{type:'application/json;charset=utf-8'}),
  url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='ResearchOS_v047_source_monitor_audit.json';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  catalogue=await api('catalog');
  choices('monitorKind',catalogue.scheduleRules,
   'Choose collector family',x=>x.kind);
  if(!$('monitorKind').value)$('monitorKind').value=catalogue.scheduleRules[0]?.kind||'';
  providers();
  $('monitorSchedule').disabled=!catalogue.enabled||!catalogue.rightsAcknowledged;
  put('monitorAvailability',catalogue.enabled&&catalogue.rightsAcknowledged?
   'SOURCE SCHEDULER OPTED IN':'READ-ONLY OR DISABLED');
  if(!catalogue.enabled||!catalogue.rightsAcknowledged)
   put('monitorConfigureStatus','Source monitoring disabled. Check local .env flags and underlying provider permissions.');
  await refresh();
 }catch(e){
  put('monitorStatus','Local source monitor unavailable: '+e.message);
  $('monitorSchedule').disabled=true;
 }
})();
})();