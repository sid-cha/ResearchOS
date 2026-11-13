/** Opt-in, single-process scheduled research. Stores bounded rule/config summaries,
 * never source payloads. Timers run only while the local Node server is running.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateScreen} from './research-rules.mjs';
import {RESEARCH_SYMBOLS,METRIC_IDS} from './research-catalog.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=value=>structuredClone(value);
const token=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const COUNTS=['evaluated','triggered','ready','unavailable','warmingUp','alertsCreated','alertsUpdated','alertsResolved','suppressed'];
const summaryOf=input=>Object.fromEntries(COUNTS.map(key=>[key,Number.isInteger(input?.[key])&&input[key]>=0&&input[key]<=1000?input[key]:0]));
const nameOf=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='string'||!value.trim()||value.trim().length>160)throw fail('Monitor name must contain between 1 and 160 characters');return value.trim();};
const intervalOf=value=>{if(!Number.isInteger(value)||value<5||value>1440)throw fail('Monitor interval must be between 5 and 1440 minutes');return value;};

export function createResearchMonitor({filename,evaluate,now=Date.now,setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout,
 allowedSymbols=RESEARCH_SYMBOLS,metricIds=METRIC_IDS,maxMonitors=20}={}){
 if(typeof filename!=='string'||!filename)throw fail('A monitor-store filename is required');
 if(typeof evaluate!=='function')throw fail('A research monitor evaluator is required');
 if(!Number.isInteger(maxMonitors)||maxMonitors<1||maxMonitors>20)throw fail('Invalid monitor bound');
 const allowed=new Set(allowedSymbols);
 if(!allowed.size||allowed.size>10||[...allowed].some(value=>!RESEARCH_SYMBOLS.includes(value)))throw fail('Choose supported monitor symbols');
 const symbolsOf=value=>{
  if(!Array.isArray(value)||!value.length||value.length>10||value.some(symbol=>!allowed.has(symbol)))throw fail('Choose between one and ten supported monitor symbols');
  return [...new Set(value)];
 };
 let state=null,loading=null,serial=Promise.resolve(),timer=null,active=null,started=false,closed=false,lastSchedulerError=null,retryNotBefore=0;
 const clock=()=>{const value=Number(now());if(!Number.isFinite(value))throw fail('Invalid monitor clock',500);return value;};
 const timestamp=()=>new Date(clock()).toISOString();
 const find=(document,id)=>{const monitor=document.monitors.find(item=>item.id===id);if(!monitor)throw fail('Research monitor not found',404);return monitor;};
 const snapshot=monitor=>({...copy(monitor),running:Boolean(active?.id===monitor.id&&!active.controller.signal.aborted)});
 function checkLastRun(input){
  if(input===null||input===undefined)return null;
  if(!object(input)||!['completed','failed'].includes(input.status)||!iso(input.startedAt)||!iso(input.finishedAt)||Date.parse(input.finishedAt)<Date.parse(input.startedAt))throw fail('Monitor run has an invalid schema',500);
  return {status:input.status,startedAt:input.startedAt,finishedAt:input.finishedAt,
   durationMs:Math.max(0,Math.min(604800000,Date.parse(input.finishedAt)-Date.parse(input.startedAt))),
   symbolCount:Number.isInteger(input.symbolCount)&&input.symbolCount>=1&&input.symbolCount<=10?input.symbolCount:null,
   summary:summaryOf(input.summary),error:input.status==='failed'?'Research scan failed; provider or local service unavailable.':null};
 }
 function checkDocument(input){
  if(!object(input)||input.schema!==1||!Array.isArray(input.monitors)||input.monitors.length>maxMonitors)throw fail('Monitor store has an invalid schema',500);
  const monitors=input.monitors.map(item=>{
   if(!object(item)||!token(item.id)||!token(item.screenId)||!Number.isSafeInteger(item.screenRevision)||item.screenRevision<1||!Number.isSafeInteger(item.revision)||item.revision<1||typeof item.enabled!=='boolean'||!iso(item.createdAt)||!iso(item.updatedAt)||item.enabled&&!iso(item.nextRunAt)||!item.enabled&&item.nextRunAt!==null)throw fail('Monitor record has an invalid schema',500);
   const rule=validateScreen(item.rule,{metricIds});
   if(rule.id!==`monitor:${item.id}`)throw fail('Monitor rule identity is invalid',500);
   delete rule.symbols; // Target selection belongs solely to the monitor, including on reload.
   return {id:item.id,name:nameOf(item.name,rule.name),screenId:item.screenId,screenRevision:item.screenRevision,
    rule,symbols:symbolsOf(item.symbols),intervalMinutes:intervalOf(item.intervalMinutes),enabled:item.enabled,
    revision:item.revision,createdAt:item.createdAt,updatedAt:item.updatedAt,nextRunAt:item.nextRunAt,lastRun:checkLastRun(item.lastRun)};
  });
  if(new Set(monitors.map(item=>item.id)).size!==monitors.length)throw fail('Monitor store contains duplicate identities',500);
  return {schema:1,monitors};
 }
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{
    const info=await fs.stat(filename);if(info.size>1048576)throw fail('Monitor store exceeds its size bound',500);
    state=checkDocument(JSON.parse(await fs.readFile(filename,'utf8')));
   }catch(error){if(error.code==='ENOENT')state={schema:1,monitors:[]};else throw fail('Monitor store could not be read safely',500);}
   return state;
  })().catch(error=>{loading=null;throw error;});
  return loading;
 }
 async function save(document){
  await fs.mkdir(path.dirname(filename),{recursive:true});
  const temporary=`${filename}.${randomUUID()}.tmp`;
  try{await fs.writeFile(temporary,JSON.stringify(document,null,2)+'\n',{encoding:'utf8',mode:0o600});await fs.rename(temporary,filename);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 }
 const write=operation=>{
  const pending=serial.then(async()=>{await load();const document=copy(state);const result=operation(document);await save(document);state=document;return copy(result);});
  serial=pending.catch(()=>{});return pending;
 };
 const read=async operation=>{await serial;await load();return copy(operation(state));};
 const ensureOpen=()=>{if(closed)throw fail('Research monitoring is closed',409);};
 const checkRevision=(input,item)=>{if(input?.expectedRevision!==item.revision)throw fail('Research monitor changed; refresh and retry',409);};
 function clearTimer(){if(timer!==null){clearTimeoutImpl(timer);timer=null;}}
 function schedule(){
  clearTimer();
  if(!started||closed||active||!state)return;
  const next=state.monitors.filter(item=>item.enabled).map(item=>Date.parse(item.nextRunAt)).sort((a,b)=>a-b)[0];
  if(next===undefined)return;
  const delay=Math.max(0,next-clock(),retryNotBefore-clock());
  timer=setTimeoutImpl(()=>{timer=null;void tick().catch(()=>{lastSchedulerError='Monitor scheduler could not read or save local state.';retryNotBefore=clock()+300000;schedule();});},delay);
  timer?.unref?.();
 }
 async function tick(){
  if(!started||closed||active)return;
  await serial;await load();
  if(!started||closed||active)return;
  const due=state.monitors.filter(item=>item.enabled&&Date.parse(item.nextRunAt)<=clock()).sort((a,b)=>a.nextRunAt.localeCompare(b.nextRunAt)||a.id.localeCompare(b.id))[0];
  if(due)await execute(due.id,true);
  else schedule();
 }
 async function execute(id,scheduled=false){
  ensureOpen();await serial;await load();ensureOpen();
  const item=find(state,id);
  if(active)return {action:'busy',monitor:snapshot(item)};
  if(scheduled&&(!started||!item.enabled||Date.parse(item.nextRunAt)>clock()))return {action:'skipped',monitor:snapshot(item)};
  const run={id,revision:item.revision,controller:new AbortController(),startedAt:timestamp()};active=run;clearTimer();
  let result=null,failed=false,action='completed';
  try{
   try{result=await evaluate({monitor:copy(item),signal:run.controller.signal});}catch{failed=true;}
   if(closed||run.controller.signal.aborted){action='cancelled';}
   else await write(document=>{
    const current=document.monitors.find(monitor=>monitor.id===id);
    if(closed||run.controller.signal.aborted||!current||current.revision!==run.revision){action='cancelled';return null;}
    const finishedAt=new Date(Math.max(clock(),Date.parse(run.startedAt))).toISOString();
    current.lastRun={status:failed?'failed':'completed',startedAt:run.startedAt,finishedAt,
     durationMs:Math.max(0,Math.min(604800000,Date.parse(finishedAt)-Date.parse(run.startedAt))),symbolCount:item.symbols.length,
     summary:summaryOf(result?.summary??result),error:failed?'Research scan failed; provider or local service unavailable.':null};
    current.nextRunAt=current.enabled?new Date(clock()+current.intervalMinutes*60000).toISOString():null;
    action=failed?'failed':'completed';lastSchedulerError=null;retryNotBefore=0;return null;
   });
  }catch(error){lastSchedulerError='Monitor scheduler could not read or save local state.';retryNotBefore=clock()+300000;throw error;}
  finally{if(active===run)active=null;schedule();}
  const record=state.monitors.find(monitor=>monitor.id===id);
  return {action,monitor:record?snapshot(record):null};
 }
 const health=()=>({started,closed,monitorCount:state?.monitors.length??null,enabledCount:state?state.monitors.filter(item=>item.enabled).length:null,
  runningMonitorId:active&&!active.controller.signal.aborted?active.id:null,queued:0,lastSchedulerError,
  localOnly:true,requiresRunningServer:true,minimumIntervalMinutes:5,maximumMonitors:maxMonitors});
 return {
  list(){return read(document=>document.monitors.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(snapshot));},
  get(id){return read(document=>snapshot(find(document,id)));},
  async create(input){
   ensureOpen();if(!object(input)||!object(input.screen))throw fail('Select a saved screen before creating a monitor');
   const screen=validateScreen(input.screen,{metricIds});
   if(!token(screen.id)||!Number.isSafeInteger(input.screen.revision)||input.screen.revision<1)throw fail('A saved screen identifier and revision are required');
   if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw fail('Monitor enabled state must be boolean');
   const symbols=symbolsOf(input.symbols??screen.symbols??[...allowed]),intervalMinutes=intervalOf(input.intervalMinutes??15),name=nameOf(input.name,screen.name),enabled=input.enabled??false;
   const saved=await write(document=>{
    ensureOpen();if(document.monitors.length>=maxMonitors)throw fail('Local monitor limit reached',409);
    const id=`MONITOR-${randomUUID()}`,stamp=timestamp();
    const {id:screenId,symbols:ignoredSymbols,...criteria}=screen;
    const monitor={id,name,screenId,screenRevision:input.screen.revision,rule:{...criteria,id:`monitor:${id}`,category:criteria.category||'Scheduled research'},
     symbols,intervalMinutes,enabled,revision:1,createdAt:stamp,updatedAt:stamp,nextRunAt:enabled?new Date(clock()+intervalMinutes*60000).toISOString():null,lastRun:null};
    document.monitors.push(monitor);return monitor;
   });schedule();return snapshot(saved);
  },
  async update(id,input){
   ensureOpen();if(!object(input))throw fail('Monitor update must be an object');
   if(Object.keys(input).some(key=>!['expectedRevision','name','enabled','intervalMinutes'].includes(key)))throw fail('Monitor criteria are immutable; create a new monitor from the saved screen');
   if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw fail('Monitor enabled state must be boolean');
   if(input.intervalMinutes!==undefined)intervalOf(input.intervalMinutes);
   if(input.name!==undefined)nameOf(input.name);
   let changed=false;
   const saved=await write(document=>{
    ensureOpen();const current=find(document,id);checkRevision(input,current);
    const name=nameOf(input.name,current.name),enabled=input.enabled??current.enabled,intervalMinutes=input.intervalMinutes??current.intervalMinutes;
    if(name===current.name&&enabled===current.enabled&&intervalMinutes===current.intervalMinutes)return current;
    changed=true;Object.assign(current,{name,enabled,intervalMinutes,revision:current.revision+1,updatedAt:timestamp(),nextRunAt:enabled?new Date(clock()+intervalMinutes*60000).toISOString():null});return current;
   });
   if(changed&&active?.id===id)active.controller.abort();schedule();return snapshot(saved);
  },
  async delete(id,input){
   ensureOpen();const saved=await write(document=>{ensureOpen();const current=find(document,id);checkRevision(input,current);document.monitors=document.monitors.filter(item=>item.id!==id);return {id,deleted:true};});
   if(active?.id===id)active.controller.abort();schedule();return saved;
  },
  runNow(id){return execute(id);},
  async start(){ensureOpen();await serial;await load();ensureOpen();started=true;schedule();return health();},
  close(){if(closed)return;closed=true;started=false;clearTimer();active?.controller.abort();},
  getHealth:health,
 };
}
