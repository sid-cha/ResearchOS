/** Safe, deterministic research conditions. No scripts, SQL or directional forecasts.
 * Missing inputs use three-valued logic: unknown is not an observed zero/false.
 */
import {validEventTimestamp} from './market-events.mjs';

const OPERATORS = new Set(['gt','gte','lt','lte','eq','crosses_above','crosses_below']);
const own = (object,key) => Object.hasOwn(object,key);
const scalar = value => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const identifier = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(value);
const symbolValid = value => typeof value === 'string' && /^[A-Z][A-Z0-9.\-]{0,11}$/.test(value);
const error = message => Object.assign(new Error(message),{status:400});
const text = (value,max,label,required=false) => {
  if(value === undefined || value === null) { if(required)throw error(`${label} is required`); return ''; }
  if(typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw error(`Invalid ${label}`);
  return value.trim();
};

function validate(input,{metricIds}={}) {
  if(!input || typeof input !== 'object' || Array.isArray(input)) throw error('A condition definition must be an object');
  if(input.id !== undefined && !identifier(input.id)) throw error('Invalid definition identifier');
  const name=text(input.name,160,'definition name',true), description=text(input.description,1000,'description');
  const match=input.match ?? 'all';
  if(!['all','any'].includes(match))throw error('Choose all or any matching conditions');
  if(!Array.isArray(input.conditions) || !input.conditions.length || input.conditions.length>20) throw error('Choose between 1 and 20 conditions');
  const allowed=metricIds ? new Set(metricIds) : null;
  const conditions=input.conditions.map(condition=>{
    if(!condition || typeof condition!=='object' || Array.isArray(condition) || !identifier(condition.metricId)) throw error('Invalid condition metric');
    if(allowed && !allowed.has(condition.metricId))throw error('Unknown condition metric');
    if(!OPERATORS.has(condition.operator))throw error('Unsupported condition operator');
    const hasOther=condition.otherMetricId !== undefined && condition.otherMetricId !== null;
    const hasValue=own(condition,'value');
    if(hasOther === hasValue)throw error('Choose exactly one comparison metric or literal value');
    const result={metricId:condition.metricId,operator:condition.operator};
    if(hasOther){
      if(!identifier(condition.otherMetricId) || (allowed && !allowed.has(condition.otherMetricId)))throw error('Unknown or invalid comparison metric');
      result.otherMetricId=condition.otherMetricId;
    }else{
      if(!scalar(condition.value))throw error('Condition values must be finite numbers or booleans');
      if(condition.operator!=='eq' && typeof condition.value!=='number')throw error('Numeric operators require a numeric comparison');
      result.value=condition.value;
    }
    return result;
  });
  let symbols;
  if(input.symbols !== undefined){
    if(!Array.isArray(input.symbols) || !input.symbols.length || input.symbols.length>10 || !input.symbols.every(symbolValid))throw error('Choose 1 to 10 supported symbols');
    symbols=[...new Set(input.symbols)];
  }
  const result={...(input.id?{id:input.id}:{}),name,description,match,conditions};
  if(symbols)result.symbols=symbols;
  if(input.category!==undefined)result.category=text(input.category,80,'category');
  if(input.maxAgeDays!==undefined){
    if(typeof input.maxAgeDays!=='number' || !Number.isFinite(input.maxAgeDays) || input.maxAgeDays<1 || input.maxAgeDays>3650)throw error('Maximum input age must be between 1 and 3650 days');
    result.maxAgeDays=input.maxAgeDays;
  }
  if(input.cooldownSeconds!==undefined){
    if(!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds<0 || input.cooldownSeconds>86400*7)throw error('Invalid alert cooldown');
    result.cooldownSeconds=input.cooldownSeconds;
  }
  return result;
}
export const validateRule=(input,options)=>validate(input,options);
export const validateScreen=(input,options)=>validate(input,options);

function instant(value) {
  if(typeof value!=='string')return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const time=Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? time : null;
  }
  if(!validEventTimestamp(value))return null;
  const time=Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function indexObservations(values) {
  const map=new Map(), duplicates=new Set();
  for(const value of Array.isArray(values)?values:[]){
    if(!value || typeof value!=='object' || !identifier(value.id))continue;
    if(map.has(value.id))duplicates.add(value.id);
    else map.set(value.id,value);
  }
  return {map,duplicates};
}
const reportedMetric=id=>id.startsWith('financial.')||id.startsWith('valuation.');
// Financial asOf is a knowledge cutoff. It is not the age of the reported data.
// Prefer the output's fiscal endpoint; if absent, require dated input provenance
// and use the oldest required endpoint conservatively. Fetch/filing dates alone
// cannot establish how recently the underlying period ended.
function freshnessContext(metric,id){
  if(!reportedMetric(id))return {asOf:instant(metric?.asOf)!==null?metric.asOf:null,basis:'asOf',priceAsOf:null};
  if(instant(metric?.periodEnd)!==null)return {asOf:metric.periodEnd,basis:'periodEnd',priceAsOf:id.startsWith('valuation.')&&instant(metric?.details?.priceAsOf)!==null?metric.details.priceAsOf:null};
  const inputs=metric?.details?.inputs;
  const provenance=Array.isArray(inputs)&&inputs.length&&inputs.every(input=>instant(input?.periodEnd)!==null)
    ? inputs.map(input=>input.periodEnd).sort((a,b)=>instant(a)-instant(b))[0]
    : [metric?.details?.periodEnd,metric?.details?.reportPeriodEnd,metric?.details?.sharesAsOf].find(value=>instant(value)!==null)??null;
  return {asOf:provenance,basis:provenance?'required_provenance':null,priceAsOf:id.startsWith('valuation.')&&instant(metric?.details?.priceAsOf)!==null?metric.details.priceAsOf:null};
}
const ageLimit=(id,rule)=>id.startsWith('valuation.')?550:rule.maxAgeDays??(id.startsWith('financial.')?550:7);
function readiness(metric,id,index,rule,clock,mode) {
  if(index.duplicates.has(id))return {status:'unavailable',reason:'ambiguous_metric',message:'More than one input has this metric identifier.'};
  if(!metric)return {status:'unavailable',reason:'missing_data',message:'The requested metric has not been loaded.'};
  if(metric.status!=='available'){
    const warming=metric.status==='insufficient_data';
    return {status:warming?'warming_up':'unavailable',reason:typeof metric.reason==='string'?metric.reason:metric.status||'missing_data',message:warming?'More source observations are required.':'The source metric is not available.'};
  }
  if(!scalar(metric.value))return {status:'unavailable',reason:'invalid_value',message:'The source metric has no valid numeric or boolean value.'};
  const asOf=instant(metric.asOf);
  if(asOf===null)return {status:'unavailable',reason:'unknown_asof',message:'The source metric has no valid as-of timestamp.'};
  if(asOf>clock+300000)return {status:'unavailable',reason:'future_input',message:'The metric as-of time is ahead of the evaluation clock.'};
  if(mode!=='HISTORY'&&metric.availableAt!==undefined&&metric.availableAt!==null){
    const availableAt=instant(metric.availableAt);
    if(availableAt===null)return {status:'unavailable',reason:'unknown_available_at',message:'The supplied input availability timestamp is invalid.'};
    if(availableAt>clock+300000)return {status:'unavailable',reason:'future_availability',message:'The source metric was not available at the evaluation clock.'};
  }
  const freshness=freshnessContext(metric,id),periodTime=instant(freshness.asOf);
  if(periodTime===null)return {status:'unavailable',reason:'unknown_report_period',message:'The underlying reported period or required dated provenance is unavailable; a recent fetch is not a recent report.'};
  if(periodTime>clock+300000)return {status:'unavailable',reason:'future_report_period',message:'The underlying observation/report period is ahead of the evaluation clock.'};
  if(mode!=='HISTORY'&&clock-periodTime>ageLimit(id,rule)*86400000)return {status:'unavailable',reason:'old_input',message:`${reportedMetric(id)?'Reported period':'Input'} exceeds the ${ageLimit(id,rule)}-day elapsed-age guard; market-session status is unknown.`};
  if(id.startsWith('valuation.')){
    const priceTime=instant(freshness.priceAsOf),priceAgeLimit=Math.min(rule.maxAgeDays??7,7);
    if(priceTime===null)return {status:'unavailable',reason:'unknown_price_asof',message:'A valuation condition requires the actual market price timestamp.'};
    if(priceTime>clock+300000)return {status:'unavailable',reason:'future_price_input',message:'The valuation price is ahead of the evaluation clock.'};
    if(mode!=='HISTORY'&&clock-priceTime>priceAgeLimit*86400000)return {status:'unavailable',reason:'old_price_input',message:`The valuation price exceeds the ${priceAgeLimit}-day elapsed-age guard; a recent calculation does not refresh its price.`};
  }
  return {status:'ready',reason:null,message:null};
}
function currentEvidence(condition,metric,other){
  const freshness=freshnessContext(metric,condition.metricId),comparisonFreshness=condition.otherMetricId?freshnessContext(other,condition.otherMetricId):null;
  return {
    metricId:condition.metricId,operator:condition.operator,value:scalar(metric?.value)?metric.value:null,
    otherMetricId:condition.otherMetricId??null,threshold:condition.otherMetricId?(scalar(other?.value)?other.value:null):condition.value,
    previousValue:null,previousThreshold:null,
    source:typeof metric?.source==='string'?metric.source:null,asOf:typeof metric?.asOf==='string'?metric.asOf:null,
    periodStart:typeof metric?.periodStart==='string'?metric.periodStart:null,periodEnd:typeof metric?.periodEnd==='string'?metric.periodEnd:null,
    availableAt:typeof metric?.availableAt==='string'?metric.availableAt:null,unit:typeof metric?.unit==='string'?metric.unit:null,
    freshnessAsOf:freshness.asOf,freshnessBasis:freshness.basis,priceAsOf:freshness.priceAsOf,
    methodVersion:typeof metric?.methodVersion==='string'?metric.methodVersion:null,
    sampleCount:Number.isFinite(metric?.sampleCount)?metric.sampleCount:null,
    requiredCount:Number.isFinite(metric?.requiredCount)?metric.requiredCount:null,
    comparisonSource:typeof other?.source==='string'?other.source:null,
    comparisonAsOf:typeof other?.asOf==='string'?other.asOf:null,
    comparisonPeriodStart:typeof other?.periodStart==='string'?other.periodStart:null,comparisonPeriodEnd:typeof other?.periodEnd==='string'?other.periodEnd:null,
    comparisonFreshnessAsOf:comparisonFreshness?.asOf??null,comparisonPriceAsOf:comparisonFreshness?.priceAsOf??null,
  };
}
function incompatibleAccountingPeriods(left,right,leftId,rightId){
  if(!reportedMetric(leftId)||!reportedMetric(rightId))return false;
  const leftEnd=instant(left?.periodEnd),rightEnd=instant(right?.periodEnd);
  if(leftEnd===null||rightEnd===null||leftEnd!==rightEnd)return true;
  const leftDuration=left.periodStart!==undefined&&left.periodStart!==null;
  const rightDuration=right.periodStart!==undefined&&right.periodStart!==null;
  return leftDuration&&rightDuration&&(instant(left.periodStart)===null||instant(right.periodStart)===null||instant(left.periodStart)!==instant(right.periodStart));
}
function conditionResult(condition,index,previous,rule,clock,mode){
  const metric=index.map.get(condition.metricId), other=condition.otherMetricId?index.map.get(condition.otherMetricId):null;
  const evidence=currentEvidence(condition,metric,other);
  const ready=readiness(metric,condition.metricId,index,rule,clock,mode);
  const comparison=condition.otherMetricId?readiness(other,condition.otherMetricId,index,rule,clock,mode):{status:'ready'};
  const missing=[ready,comparison].find(state=>state.status==='unavailable') || [ready,comparison].find(state=>state.status!=='ready');
  if(missing)return {...evidence,passed:null,status:missing.status,reason:missing.reason,message:missing.message};
  const right=condition.otherMetricId?other.value:condition.value;
  if(typeof metric.value!==typeof right || (condition.operator!=='eq' && typeof metric.value!=='number'))return {...evidence,passed:null,status:'unavailable',reason:'type_mismatch',message:'Comparison inputs have incompatible value types.'};
  if(other && metric.unit && other.unit && metric.unit!==other.unit)return {...evidence,passed:null,status:'unavailable',reason:'unit_mismatch',message:'Comparison inputs have incompatible units.'};
  if(other && (metric.source!==other.source || instant(metric.asOf)!==instant(other.asOf)))return {...evidence,passed:null,status:'unavailable',reason:'comparison_context_mismatch',message:'Compared metrics require the same source and as-of time.'};
  if(other&&incompatibleAccountingPeriods(metric,other,condition.metricId,condition.otherMetricId))return {...evidence,passed:null,status:'unavailable',reason:'comparison_period_mismatch',message:'Financial comparison inputs require matching fiscal endpoints and matching start dates when both are duration measures.'};
  if(other&&condition.metricId.startsWith('valuation.')&&condition.otherMetricId.startsWith('valuation.')&&instant(evidence.priceAsOf)!==instant(evidence.comparisonPriceAsOf))return {...evidence,passed:null,status:'unavailable',reason:'comparison_price_context_mismatch',message:'Valuation comparison inputs require the same market-price timestamp.'};
  let passed;
  if(condition.operator.startsWith('crosses_')){
    const prior=previous.map.get(condition.metricId), priorOther=condition.otherMetricId?previous.map.get(condition.otherMetricId):null;
    if(!prior || (condition.otherMetricId && !priorOther))return {...evidence,passed:null,status:'warming_up',reason:'missing_previous_observation',message:'A crossover requires an earlier comparable observation.'};
    const priorReady=readiness(prior,condition.metricId,previous,rule,clock,'HISTORY');
    const priorOtherReady=condition.otherMetricId?readiness(priorOther,condition.otherMetricId,previous,rule,clock,'HISTORY'):{status:'ready'};
    const previousRight=condition.otherMetricId?priorOther.value:condition.value;
    const same=(current,past)=>current.source===past.source && current.methodVersion===past.methodVersion && current.unit===past.unit && instant(past.asOf)!==null && instant(past.asOf)<instant(current.asOf);
    if(priorReady.status!=='ready'||priorOtherReady.status!=='ready'||!same(metric,prior)||typeof prior.value!=='number'||typeof previousRight!=='number'||(other&&(!same(other,priorOther)||instant(prior.asOf)!==instant(priorOther.asOf)||incompatibleAccountingPeriods(prior,priorOther,condition.metricId,condition.otherMetricId))))return {...evidence,passed:null,status:'unavailable',reason:'incompatible_previous_observation',message:'Crossover inputs need earlier timestamps and matching sources, units, method versions and compatible fiscal comparisons.'};
    evidence.previousValue=prior.value;evidence.previousThreshold=previousRight;
    passed=condition.operator==='crosses_above'?prior.value<=previousRight&&metric.value>right:prior.value>=previousRight&&metric.value<right;
  }else passed=({gt:()=>metric.value>right,gte:()=>metric.value>=right,lt:()=>metric.value<right,lte:()=>metric.value<=right,eq:()=>metric.value===right})[condition.operator]();
  return {...evidence,passed,status:passed?'triggered':'ready',reason:null,message:null};
}

export function evaluateRule(input,{symbol,observations=[],previousObservations=[],now=Date.now(),mode='LIVE'}={}) {
  const rule=validateRule(input);
  if(!symbolValid(symbol))throw error('Invalid evaluation symbol');
  const clock=typeof now==='function'?Number(now()):typeof now==='string'?Date.parse(now):Number(now);
  if(!Number.isFinite(clock))throw error('Invalid evaluation clock');
  if(!['LIVE','HISTORY'].includes(mode))throw error('Choose LIVE or HISTORY evaluation mode');
  const base={ruleId:rule.id||'custom',ruleName:rule.name,category:rule.category||'Research conditions',ruleVersion:'research-rule-v1',symbol,
    mode,evaluatedAt:new Date(clock).toISOString(),interpretation:mode==='HISTORY'?'Retrospective condition evaluation; not a fresh alert or point-in-time backtest.':'Observed research conditions; not a directional forecast or recommendation.',cooldownSeconds:rule.cooldownSeconds??300};
  if(rule.symbols&&!rule.symbols.includes(symbol))return {...base,status:'ready',triggered:false,evidence:[],reasons:['The definition excludes this instrument.']};
  const index=indexObservations(observations),previous=indexObservations(previousObservations);
  const evidence=rule.conditions.map(condition=>conditionResult(condition,index,previous,rule,clock,mode));
  const truth=rule.match==='all'
    ? evidence.some(item=>item.passed===false)?false:evidence.every(item=>item.passed===true)?true:null
    : evidence.some(item=>item.passed===true)?true:evidence.every(item=>item.passed===false)?false:null;
  const status=truth===true?'triggered':truth===false?'ready':evidence.some(item=>item.status==='unavailable')?'unavailable':'warming_up';
  return {...base,status,triggered:truth,evidence,reasons:evidence.filter(item=>item.reason).map(item=>`${item.metricId}: ${item.message||item.reason}`)};
}

export function screenCompanies(companies,input,options={}) {
  const screen=validateScreen(input);
  if(!Array.isArray(companies)||companies.length>10)throw error('Screen up to 10 pilot companies per request');
  if(companies.some(company=>!company||typeof company!=='object'||Array.isArray(company)||!symbolValid(company.symbol))||new Set(companies.map(company=>company.symbol)).size!==companies.length)throw error('Screen companies require unique valid symbols');
  const clock=typeof options.now==='function'?Number(options.now()):typeof options.now==='string'?Date.parse(options.now):Number(options.now??Date.now());
  if(!Number.isFinite(clock))throw error('Invalid evaluation clock');
  const evaluatedAt=new Date(clock).toISOString();
  const mode=options.mode??'LIVE';
  const results=companies.map(company=>{
    const result=evaluateRule(screen,{symbol:company.symbol,observations:company.observations,previousObservations:company.previousObservations,...options,now:evaluatedAt});
    return {...result,companyName:typeof company.company==='string'?company.company:typeof company.name==='string'?company.name:null,match:result.triggered};
  });
  const matches=results.filter(item=>item.match===true),nonMatches=results.filter(item=>item.match===false),unavailable=results.filter(item=>item.match===null);
  return {screenId:screen.id||'custom',screenName:screen.name,mode,evaluatedAt,results,matches,nonMatches,unavailable,total:results.length,matchedCount:matches.length,nonMatchedCount:nonMatches.length,unavailableCount:unavailable.length};
}

const freezeDefinition=value=>Object.freeze({...value,conditions:Object.freeze(value.conditions.map(condition=>Object.freeze(condition)))});
export const BUILTIN_RULES=Object.freeze([
  {id:'technical.above-sma200',name:'Close above SMA200',category:'Trend',description:'The latest completed close is above its 200-session simple moving average.',conditions:[{metricId:'price.close',operator:'gt',otherMetricId:'technical.sma200'}]},
  {id:'technical.below-sma200',name:'Close below SMA200',category:'Trend',description:'The latest completed close is below its 200-session simple moving average.',conditions:[{metricId:'price.close',operator:'lt',otherMetricId:'technical.sma200'}]},
  {id:'technical.rsi-low',name:'RSI below 30',category:'Momentum',description:'A low rolling-RSI observation, not a buy recommendation.',conditions:[{metricId:'technical.rsi14',operator:'lt',value:30}]},
  {id:'technical.macd-positive',name:'Positive MACD histogram',category:'Momentum',description:'A positive completed-bar histogram; this does not establish a new crossover.',conditions:[{metricId:'technical.macdHistogram',operator:'gt',value:0}]},
  {id:'technical.relative-volume-high',name:'Relative daily volume above 2x',category:'Activity',description:'Completed daily volume exceeds twice the preceding baseline.',conditions:[{metricId:'technical.relativeVolume20',operator:'gt',value:2}]},
  {id:'technical.breakout20',name:'20-session closing breakout',category:'Price condition',description:'The supplied completed-bar breakout metric is true.',conditions:[{metricId:'technical.breakout20',operator:'eq',value:true}]},
  {id:'financial.revenue-growth',name:'Reported revenue growth above 10%',category:'Growth',description:'Available reported comparable-quarter revenue growth exceeds 10%.',maxAgeDays:550,conditions:[{metricId:'financial.revenueGrowthYoYPct',operator:'gt',value:10}]},
  {id:'financial.free-cash-flow-positive',name:'Positive trailing free cash flow',category:'Cash flow',description:'Available period-aligned trailing free cash flow is positive.',maxAgeDays:550,conditions:[{metricId:'financial.freeCashFlowTTM',operator:'gt',value:0}]},
  {id:'financial.leverage-high',name:'Debt to equity above 2x',category:'Financial health',description:'A reported ratio condition, not an issuer credit rating.',maxAgeDays:550,conditions:[{metricId:'financial.debtEquity',operator:'gt',value:2}]},
].map(value=>freezeDefinition({...value,match:'all',cooldownSeconds:300})));

export const BUILTIN_SCREENS=Object.freeze([
  {id:'screen.trend',name:'Above long-term trend',description:'Pilot instruments with an available close above SMA200.',conditions:[{metricId:'price.close',operator:'gt',otherMetricId:'technical.sma200'}]},
  {id:'screen.growth-cash-flow',name:'Reported growth and positive cash flow',description:'Requires both available reported growth and period-aligned trailing free cash flow.',maxAgeDays:550,conditions:[{metricId:'financial.revenueGrowthYoYPct',operator:'gt',value:10},{metricId:'financial.freeCashFlowTTM',operator:'gt',value:0}]},
  {id:'screen.activity',name:'High relative daily activity',description:'Completed relative daily volume above twice its baseline.',conditions:[{metricId:'technical.relativeVolume20',operator:'gt',value:2}]},
].map(value=>freezeDefinition({...value,match:'all'})));
