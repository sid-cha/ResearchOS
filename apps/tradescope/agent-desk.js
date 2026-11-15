(()=>{'use strict';
const el=id=>document.getElementById(id);
const text=(id,x)=>{el(id).textContent=String(x??'—');};
function create(tag,content){const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);return n;}
function append(parent,tag,content,className){const n=create(tag,content);if(className)n.className=className;parent.append(n);return n;}
async function api(route,{method='GET',body=null}={}){
 const response=await fetch('/api/agent-desk/'+route,{
  method,cache:'no-store',headers:body?{'Content-Type':'application/json','X-ResearchOS-Agent-Run':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(json.error||'Local research request failed');
 return json;
}
let active=false,ready=false;
async function loadConfig(){
 const x=await api('catalog');
 ready=x.enabled===true;
 const m=x.localModel;
 text('deskMode',m.enabled?'LOCAL MODEL READY · '+m.provider:'DETERMINISTIC MODE');
 const mode=el('deskAnalysisMode');
 for(const option of mode.options)if(option.value==='local')option.disabled=!m.enabled;
 mode.value=mode.options[0].value;
 return x;
}
async function loadEvents(){
 const response=await fetch('/api/global-events/events?limit=200',{cache:'no-store'});
 const x=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(x.error||'Could not load locally captured events');
 const select=el('deskEvent'),before=select.value;
 select.replaceChildren();
 append(select,'option','Choose a source event').value='';
 for(const e of x.events||[]){
  const option=append(select,'option',(e.source+' · '+e.title).slice(0,150));
  option.value=e.id;
 }
 if(before&&Array.from(select.options).some(o=>o.value===before))select.value=before;
 el('deskRun').disabled=!ready||!select.value||active;
 if(x.isPartial)text('deskStatus','Archive contains more than 200 events. Narrow or archive older events before running agents.');
 else if(!x.events.length)text('deskStatus','No locally captured events. Collect a permitted source event in Global Event Intelligence first.');
 else text('deskStatus',x.events.length+' captured source events available; choose one to investigate.');
}
async function loadRuns(){
 const x=await api('runs'),box=el('deskRuns');box.replaceChildren();
 if(!x.runs.length){append(box,'p','No saved investigations yet.');return;}
 for(const run of x.runs){
  const row=append(box,'div',undefined,'desk-run-item'),meta=append(row,'div');
  append(meta,'strong',run.eventId);
  append(meta,'small',run.createdAt+' · '+run.mode);
  const button=append(row,'button','Open saved run','secondary');
  button.addEventListener('click',()=>void openRun(run.id));
 }
}
function list(parent,title,items,refs=[]){
 if(!items?.length)return;
 append(parent,'strong',title);
 const ul=append(parent,'ul');
 for(const it of items){
  const line=typeof it==='string'?it:it.text;
  const tail=typeof it==='string'?'':it.refs?.length?' ['+it.refs.join(', ')+']':'';
  append(ul,'li',line+tail);
 }
}
function displayRun(run){
 text('runDisposition',run.debate.arbiter.disposition);
 text('runSummary','Run '+run.id+' · event '+run.debate.focusEventId+
  ' · archive as-of '+run.asOf+' · '+run.mode+' · SHA-256 '+run.integrity.slice(0,16)+'…'+
  ' · ALL CONCLUSIONS REQUIRE HUMAN REVIEW');
 const refs=el('referenceList');refs.replaceChildren();
 for(const e of run.evidence){
  const div=append(refs,'div',undefined,'ref-item');
  append(div,'strong',e.ref+' · '+e.source+' · '+e.id);
  append(div,'small','Locally observed: '+e.firstObservedAt);
  append(div,'small','Source time: '+(e.eventTime||'unknown'));
  if(e.sourceUrl){
   const a=append(div,'a','Official provider link');a.href=e.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';
  }
 }
 const stages=el('agentStages');stages.replaceChildren();
 for(const [index,s] of run.debate.stages.entries()){
  const card=append(stages,'article',undefined,'stage'+(s.id==='anti_agent'?' anti':s.id==='research_arbiter'?' arbiter':''));
  append(card,'small','STAGE '+(index+1)+' / '+s.method);
  append(card,'h3',s.role);
  list(card,'Observations',s.facts);
  list(card,'Claims requiring verification',s.claims);
  list(card,'Questions / falsification checks',s.questions);
  if(s.flags?.length){append(card,'strong','Open evidence flags');
   const flags=append(card,'div');for(const f of s.flags)append(flags,'span',f,'flag');}
 }
}
async function openRun(id){
 try{displayRun(await api('run?id='+encodeURIComponent(id)));
  el('deskResult').scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){text('deskStatus',e.message);}
}
async function run(){
 if(active)return;
 const eventId=el('deskEvent').value,asOf=el('deskAsOf').value.trim(),mode=el('deskAnalysisMode').value;
 if(!eventId){text('deskStatus','Choose a captured source event.');return;}
 if(asOf&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(asOf)||!Number.isFinite(Date.parse(asOf)))){
  text('deskStatus','As-of must be a complete UTC timestamp such as 2026-11-14T18:00:00Z.');return;
 }
 active=true;el('deskRun').disabled=true;
 text('deskStatus','Running six evidence-first research stages locally. Model proposals, when enabled, remain unverified.');
 try{
  const run=await api('run',{method:'POST',body:{eventId,mode,...(asOf?{asOf}:{})}});
  displayRun(run);await loadRuns();
  text('deskStatus','Research run recorded. '+run.debate.arbiter.disposition+' · No trading action.');
  el('deskResult').scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){text('deskStatus','Research run could not complete: '+e.message);}
 finally{active=false;el('deskRun').disabled=!ready||!el('deskEvent').value;}
}
el('deskEvent').addEventListener('change',()=>{el('deskRun').disabled=!ready||!el('deskEvent').value||active;});
el('deskRun').addEventListener('click',()=>void run());
el('deskReloadEvents').addEventListener('click',()=>void loadEvents().catch(e=>text('deskStatus',e.message)));
void (async()=>{try{await loadConfig();await Promise.all([loadEvents(),loadRuns()]);}
 catch(e){text('deskStatus','Agent Desk initialization unavailable: '+e.message);}})();
})();