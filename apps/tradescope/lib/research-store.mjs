/** Bounded local research domain records. This stores screen definitions and small
 * derived alert evidence, never raw market ticks, bar archives or provider payloads.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateScreen} from './research-rules.mjs';

const error=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=value=>structuredClone(value);
const token=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(value);
const symbolValid=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.\-]{0,11}$/.test(value);
const scalar=value=>typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value));
const bounded=(value,max=500)=>typeof value==='string'?value.slice(0,max):null;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const clockValue=value=>typeof value==='function'?Number(value()):typeof value==='string'?Date.parse(value):Number(value??Date.now());
const STATUSES=new Set(['active','acknowledged','resolved']);

function evidenceItem(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!token(input.metricId))return null;
  return {
    metricId:input.metricId,operator:bounded(input.operator,30),value:scalar(input.value)?input.value:null,
    threshold:scalar(input.threshold)?input.threshold:null,otherMetricId:token(input.otherMetricId)?input.otherMetricId:null,
    previousValue:scalar(input.previousValue)?input.previousValue:null,previousThreshold:scalar(input.previousThreshold)?input.previousThreshold:null,
    passed:typeof input.passed==='boolean'?input.passed:null,status:bounded(input.status,40),reason:bounded(input.reason,180),message:bounded(input.message,500),
    source:bounded(input.source,100),asOf:bounded(input.asOf,45),availableAt:bounded(input.availableAt,45),unit:bounded(input.unit,40),
    periodStart:bounded(input.periodStart,45),periodEnd:bounded(input.periodEnd,45),
    freshnessAsOf:bounded(input.freshnessAsOf,45),freshnessBasis:bounded(input.freshnessBasis,30),priceAsOf:bounded(input.priceAsOf,45),
    methodVersion:bounded(input.methodVersion,100),sampleCount:Number.isFinite(input.sampleCount)?input.sampleCount:null,
    requiredCount:Number.isFinite(input.requiredCount)?input.requiredCount:null,comparisonSource:bounded(input.comparisonSource,100),comparisonAsOf:bounded(input.comparisonAsOf,45),
    comparisonFreshnessAsOf:bounded(input.comparisonFreshnessAsOf,45),comparisonPriceAsOf:bounded(input.comparisonPriceAsOf,45),
    comparisonPeriodStart:bounded(input.comparisonPeriodStart,45),comparisonPeriodEnd:bounded(input.comparisonPeriodEnd,45),
  };
}
function evaluationSnapshot(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!token(input.ruleId)||!symbolValid(input.symbol))throw error('Invalid research evaluation');
  if(!['triggered','ready','warming_up','unavailable'].includes(input.status))throw error('Invalid research evaluation status');
  if(!['LIVE','HISTORY'].includes(input.mode))throw error('Invalid research evaluation mode');
  if(!iso(input.evaluatedAt))throw error('A research evaluation timestamp is required');
  if(input.status==='triggered'&&input.triggered!==true)throw error('A triggered evaluation requires an observed condition');
  if(input.status==='ready'&&input.triggered!==false)throw error('A ready evaluation requires a non-triggering condition');
  if(!Array.isArray(input.evidence)||input.evidence.length>20)throw error('Invalid research evidence');
  const evidence=input.evidence.map(evidenceItem).filter(Boolean);
  if(input.status==='triggered'&&!evidence.some(item=>item.passed===true))throw error('A triggered alert requires supporting condition evidence');
  return {ruleId:input.ruleId,ruleName:bounded(input.ruleName,160)||input.ruleId,category:bounded(input.category,80)||'Research conditions',
    ruleVersion:bounded(input.ruleVersion,100)||'research-rule-v1',symbol:input.symbol,mode:input.mode,
    status:input.status,triggered:input.triggered===true?true:input.triggered===false?false:null,
    evaluatedAt:iso(input.evaluatedAt),evidence,reasons:Array.isArray(input.reasons)?input.reasons.filter(value=>typeof value==='string').slice(0,20).map(value=>value.slice(0,500)):[]};
}
function evaluationKey(evaluation){
  return createHash('sha256').update(JSON.stringify([evaluation.ruleId,evaluation.ruleVersion,evaluation.symbol,
    evaluation.evidence.map(item=>[item.metricId,item.operator,item.value,item.threshold,item.otherMetricId,item.previousValue,item.previousThreshold,item.source,item.freshnessAsOf??item.asOf,item.periodStart,item.periodEnd,item.priceAsOf,item.comparisonSource,item.comparisonFreshnessAsOf??item.comparisonAsOf,item.comparisonPeriodStart,item.comparisonPeriodEnd,item.comparisonPriceAsOf,item.unit,item.methodVersion]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])).digest('hex');
}

export function createResearchStore(filename,{maxScreens=50,maxAlerts=500,maxSeenKeys=2000}={}){
  if(typeof filename!=='string'||!filename)throw error('A research-store filename is required');
  for(const [name,value,maximum] of [['screens',maxScreens,50],['alerts',maxAlerts,500],['identities',maxSeenKeys,2000]]){
    if(!Number.isInteger(value)||value<1||value>maximum)throw error(`Invalid research ${name} bound`);
  }
  let state=null,loading=null,serial=Promise.resolve();
  function checkDocument(parsed){
    if(!parsed||parsed.schema!==1||!Array.isArray(parsed.screens)||!Array.isArray(parsed.alerts)||!Array.isArray(parsed.seenKeys))throw error('Research store has an invalid schema',500);
    if(parsed.screens.length>maxScreens||parsed.alerts.length>maxAlerts||parsed.seenKeys.length>maxSeenKeys)throw error('Research store exceeds configured bounds',500);
    const screens=parsed.screens.map(item=>{
      if(!token(item?.id)||!Number.isInteger(item.revision)||item.revision<1||!iso(item.createdAt)||!iso(item.updatedAt))throw error('Research screen has an invalid schema',500);
      return {...validateScreen(item),revision:item.revision,createdAt:item.createdAt,updatedAt:item.updatedAt};
    });
    const alerts=parsed.alerts.map(item=>{
      if(!token(item?.id)||!STATUSES.has(item.status)||!Number.isInteger(item.revision)||item.revision<1||!iso(item.createdAt)||!iso(item.updatedAt)||!iso(item.firstTriggeredAt)||!iso(item.lastTriggeredAt))throw error('Research alert has an invalid schema',500);
      const snapshot=evaluationSnapshot({...item,status:'triggered',triggered:true});
      return {...snapshot,id:item.id,status:item.status,revision:item.revision,createdAt:item.createdAt,updatedAt:item.updatedAt,
        firstTriggeredAt:item.firstTriggeredAt,lastTriggeredAt:item.lastTriggeredAt,
        acknowledgedAt:iso(item.acknowledgedAt),resolvedAt:iso(item.resolvedAt),resolutionReason:bounded(item.resolutionReason,180),
        triggerCount:Number.isInteger(item.triggerCount)&&item.triggerCount>0?item.triggerCount:1,
        evaluationKey:typeof item.evaluationKey==='string'&&/^[a-f0-9]{64}$/.test(item.evaluationKey)?item.evaluationKey:null,
        latestEvaluationKey:typeof item.latestEvaluationKey==='string'&&/^[a-f0-9]{64}$/.test(item.latestEvaluationKey)?item.latestEvaluationKey:null};
    });
    if(new Set(screens.map(item=>item.id)).size!==screens.length||new Set(alerts.map(item=>item.id)).size!==alerts.length||!parsed.seenKeys.every(key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)))throw error('Research store contains invalid identities',500);
    return {schema:1,screens,alerts,seenKeys:[...new Set(parsed.seenKeys)]};
  }
  async function load(){
    if(state)return state;
    if(!loading)loading=(async()=>{
      try{state=checkDocument(JSON.parse(await fs.readFile(filename,'utf8')));}
      catch(reason){if(reason.code==='ENOENT')state={schema:1,screens:[],alerts:[],seenKeys:[]};else if(reason.status===500)throw reason;else throw error('Research store could not be read safely',500);}
      return state;
    })().catch(reason=>{loading=null;throw reason;});
    return loading;
  }
  async function save(document){
    await fs.mkdir(path.dirname(filename),{recursive:true});
    const temporary=`${filename}.${randomUUID()}.tmp`;
    try{await fs.writeFile(temporary,JSON.stringify(document,null,2)+'\n',{encoding:'utf8',mode:0o600});await fs.rename(temporary,filename);}
    finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  }
  const write=operation=>{
    const pending=serial.then(async()=>{await load();const candidate=copy(state);const result=operation(candidate);await save(candidate);state=candidate;return copy(result);});
    serial=pending.catch(()=>{});return pending;
  };
  const read=async operation=>{await serial;await load();return copy(operation(state));};
  const find=(items,id,label)=>{const item=items.find(value=>value.id===id);if(!item)throw error(`${label} not found`,404);return item;};
  const revision=(expected,item)=>{if(expected!==item.revision)throw error(`Research record changed; refresh and retry (revision ${item.revision})`,409);};
  const nowIso=value=>{const time=clockValue(value);if(!Number.isFinite(time))throw error('Invalid research record clock');return new Date(time).toISOString();};

  return {
    listScreens(){return read(document=>document.screens.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));},
    getScreen(id){return read(document=>find(document.screens,id,'Screen'));},
    saveScreen(input,options={}){
      const screen=validateScreen(input,{metricIds:options.metricIds});
      return write(document=>{
        const timestamp=nowIso(options.now);
        if(screen.id){
          const existing=find(document.screens,screen.id,'Screen');revision(options.expectedRevision??input.expectedRevision,existing);
          const updated={...screen,id:existing.id,revision:existing.revision+1,createdAt:existing.createdAt,updatedAt:timestamp};
          document.screens[document.screens.indexOf(existing)]=updated;return updated;
        }
        if(document.screens.length>=maxScreens)throw error('Local saved-screen limit reached',409);
        const created={...screen,id:`SCREEN-${randomUUID()}`,revision:1,createdAt:timestamp,updatedAt:timestamp};
        document.screens.unshift(created);return created;
      });
    },
    deleteScreen(id,options={}){return write(document=>{
      const item=find(document.screens,id,'Screen');revision(options.expectedRevision,item);
      document.screens=document.screens.filter(value=>value.id!==id);return {id,deleted:true};
    });},
    listAlerts({status='all',symbol}={}){
      if(status!=='all'&&!STATUSES.has(status))throw error('Invalid alert status');
      if(symbol!==undefined&&!symbolValid(symbol))throw error('Invalid alert symbol');
      return read(document=>document.alerts.filter(item=>(status==='all'||item.status===status)&&(!symbol||item.symbol===symbol)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    },
    getAlert(id){return read(document=>find(document.alerts,id,'Alert'));},
    recordEvaluation(input,{cooldownSeconds=input?.cooldownSeconds??300,now}={}){
      const evaluation=evaluationSnapshot(input);
      if(!Number.isInteger(cooldownSeconds)||cooldownSeconds<0||cooldownSeconds>86400*7)throw error('Invalid alert cooldown');
      return write(document=>{
        const timestamp=nowIso(now),clock=Date.parse(timestamp);
        const related=document.alerts.filter(item=>item.ruleId===evaluation.ruleId&&item.symbol===evaluation.symbol);
        const open=related.find(item=>item.status!=='resolved');
        if(evaluation.mode!=='LIVE')return {action:'ignored_historical',created:false,suppressed:false,alert:null};
        if(evaluation.status==='ready'&&evaluation.triggered===false){
          if(!open)return {action:'not_triggered',created:false,suppressed:false,alert:null};
          for(const item of related.filter(item=>item.status!=='resolved'))Object.assign(item,{status:'resolved',resolvedAt:timestamp,resolutionReason:'condition_recovered',updatedAt:timestamp,revision:item.revision+1});
          return {action:'recovered',created:false,suppressed:false,alert:open};
        }
        if(evaluation.status!=='triggered')return {action:'ignored_unavailable',created:false,suppressed:false,alert:null};
        const key=evaluationKey(evaluation);
        if(document.seenKeys.includes(key))return {action:'duplicate',created:false,suppressed:true,alert:related.find(item=>item.evaluationKey===key||item.latestEvaluationKey===key)||open||null};
        document.seenKeys.push(key);document.seenKeys=document.seenKeys.slice(-maxSeenKeys);
        if(open){
          const cooling=clock-Date.parse(open.lastTriggeredAt)<cooldownSeconds*1000;
          Object.assign(open,{...evaluation,status:open.status,latestEvaluationKey:key,lastTriggeredAt:timestamp,updatedAt:timestamp,triggerCount:open.triggerCount+1,revision:open.revision+1});
          return {action:cooling?'cooldown':'updated',created:false,suppressed:cooling,alert:open};
        }
        const latest=related.slice().sort((a,b)=>b.lastTriggeredAt.localeCompare(a.lastTriggeredAt))[0];
        if(latest&&clock-Date.parse(latest.lastTriggeredAt)<cooldownSeconds*1000)return {action:'cooldown',created:false,suppressed:true,alert:latest};
        const created={...evaluation,id:`ALERT-${randomUUID()}`,status:'active',revision:1,createdAt:timestamp,updatedAt:timestamp,
          firstTriggeredAt:timestamp,lastTriggeredAt:timestamp,acknowledgedAt:null,resolvedAt:null,resolutionReason:null,triggerCount:1,evaluationKey:key,latestEvaluationKey:key};
        document.alerts.unshift(created);
        if(document.alerts.length>maxAlerts){
          const oldestResolved=document.alerts.map((item,index)=>({item,index})).reverse().find(({item})=>item.status==='resolved');
          document.alerts.splice(oldestResolved?.index??document.alerts.length-1,1);
        }
        return {action:'created',created:true,suppressed:false,alert:created};
      });
    },
    updateAlert(id,input){return write(document=>{
      const item=find(document.alerts,id,'Alert');revision(input?.expectedRevision,item);
      if(!STATUSES.has(input.status))throw error('Invalid alert status');
      if(item.status==='resolved'&&input.status!=='resolved')throw error('A resolved alert cannot be reopened without a new condition observation',409);
      if(item.status===input.status)return item;
      const timestamp=new Date().toISOString();
      item.status=input.status;item.revision++;item.updatedAt=timestamp;
      if(input.status==='acknowledged')item.acknowledgedAt=timestamp;
      if(input.status==='resolved'){item.resolvedAt=timestamp;item.resolutionReason='analyst_resolved';}
      return item;
    });},
  };
}
