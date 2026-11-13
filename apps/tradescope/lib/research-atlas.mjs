/** Descriptive analytics for an explicitly requested pilot, never market-wide breadth. */
import {INSTRUMENTS} from './research-catalog.mjs';
import {validEventTimestamp} from './market-events.mjs';

const VERSION='research-atlas-v1',DAY=86400000,MAX_SYMBOLS=10;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max):null;
const etDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const isoDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const instant=value=>isoDay(value)?Date.parse(value):validEventTimestamp(value)?Date.parse(value):null;
const session=value=>isoDay(value)?value:validEventTimestamp(value)?etDay.format(new Date(value)):null;
const ADJUSTMENTS=new Set(['raw','split','dividend','all']);
const METRICS=Object.freeze({close:['price.close','USD'],return1dPct:['technical.return1dPct','%'],
 return5dPct:['technical.return5dPct','%'],return20dPct:['technical.return20dPct','%'],return63dPct:['technical.return63dPct','%'],
 rsi14:['technical.rsi14','index'],relativeVolume20:['technical.relativeVolume20','ratio'],distanceHigh252Pct:['technical.distanceHigh252Pct','%']});
const RETURNS=Object.keys(METRICS).filter(key=>key.startsWith('return'));
const blank=(metricId,unit,reason='missing_data')=>({metricId,value:null,status:'unavailable',reason,source:null,asOf:null,
 availableAt:null,periodStart:null,periodEnd:null,unit,methodVersion:null,sampleCount:null,requiredCount:null,adjustment:null});
const publicEvidence=(input,id,unit)=>({metricId:id,value:finite(input.value)?input.value:null,status:input.status==='available'?'available':'unavailable',
 reason:text(input.reason,500)||text(input.status,40)||'missing_data',source:text(input.source,80),asOf:text(input.asOf,45),
 availableAt:text(input.availableAt,45),periodStart:isoDay(input.periodStart)?input.periodStart:null,periodEnd:isoDay(input.periodEnd)?input.periodEnd:null,
 unit:text(input.unit,20)||unit,methodVersion:text(input.methodVersion,100),sampleCount:finite(input.sampleCount)?input.sampleCount:null,
 requiredCount:finite(input.requiredCount)?input.requiredCount:null,adjustment:ADJUSTMENTS.has(input.details?.adjustment)?input.details.adjustment:null});

function metric(index,id,unit,clock,today,recordReason){
 if(recordReason)return blank(id,unit,recordReason);
 if(index.duplicates.has(id))return blank(id,unit,'ambiguous_metric');
 const input=index.values.get(id);if(!input)return blank(id,unit);
 const result=publicEvidence(input,id,unit);
 const reject=reason=>({...result,value:null,status:'unavailable',reason});
 if(input.status!=='available')return reject(text(input.reason,500)||text(input.status,40)||'missing_data');
 if(!finite(input.value))return reject('invalid_value');
 if((id==='price.close'||/^technical\.sma\d+$/.test(id))&&input.value<=0||id==='technical.rsi14'&&(input.value<0||input.value>100)||id==='technical.relativeVolume20'&&input.value<0||/^technical\.return\d+dPct$/.test(id)&&input.value<=-100)return reject('invalid_value_range');
 if(!result.source||!result.methodVersion)return reject('unknown_provenance');
 if(input.unit!==unit)return reject('unit_mismatch');
 const timestamp=instant(input.asOf),day=session(input.asOf);
 if(timestamp===null||!day)return reject('unknown_asof');
 if(timestamp>clock||day>=today)return reject('incomplete_or_future_session');
 if(clock-timestamp>7*DAY)return reject('stale_input');
 if(input.availableAt!==undefined&&input.availableAt!==null){
  const available=instant(input.availableAt);
  if(available===null)return reject('unknown_available_at');
  if(available>clock)return reject('future_availability');
 }
 if(result.periodEnd&&result.periodEnd!==day)return reject('period_asof_mismatch');
 if(result.periodStart&&result.periodEnd&&result.periodStart>result.periodEnd)return reject('invalid_period');
 return {...result,value:input.value,status:'available',reason:null};
}
function indexMetrics(record){
 const values=new Map(),duplicates=new Set();
 for(const item of Array.isArray(record?.observations)?record.observations.slice(0,100):[]){
  if(!item||typeof item.id!=='string')continue;
  if(values.has(item.id))duplicates.add(item.id);else values.set(item.id,item);
 }
 return {values,duplicates};
}
function trend(close,sma){
 let reason=close.status!=='available'?close.reason:sma.status!=='available'?sma.reason:null;
 if(!reason&&(!close.adjustment||!sma.adjustment))reason='unknown_adjustment';
 if(!reason&&(close.source!==sma.source||instant(close.asOf)!==instant(sma.asOf)||close.unit!==sma.unit||close.methodVersion!==sma.methodVersion||close.adjustment!==sma.adjustment))reason='comparison_context_mismatch';
 return {status:reason?'unavailable':'available',above:reason?null:close.value>sma.value,
  relation:reason?null:close.value>sma.value?'above':close.value<sma.value?'below':'equal',reason,close,sma};
}
const contextKey=(row,value,includeStart=false)=>JSON.stringify([value.source,instant(value.asOf),includeStart?value.periodStart:null,value.periodEnd,row.currency,row.adjustment,value.adjustment,value.methodVersion]);
function compatible(items,includeStart=false){
 if(!items.length)return {status:'unavailable',reason:'no_eligible_inputs'};
 if(items.some(({row,value})=>!row.currency||!row.source||!row.adjustment||!value.adjustment||!value.methodVersion||!value.periodEnd||includeStart&&!value.periodStart))return {status:'unavailable',reason:'unknown_comparison_context'};
 if(items.some(({row,value})=>row.adjustment!==value.adjustment||row.source!==value.source))return {status:'unavailable',reason:'comparison_context_mismatch'};
 if(new Set(items.map(({row,value})=>contextKey(row,value,includeStart))).size!==1)return {status:'unavailable',reason:'comparison_context_mismatch'};
 return {status:'available',reason:null};
}
function average(rows,key){
 const inputs=rows.flatMap(row=>row.metrics[key].status==='available'?[{row,value:row.metrics[key]}]:[]),ready=compatible(inputs,true);
 const eligible=ready.status==='available'?inputs:[];
 return {...ready,value:eligible.length?eligible.reduce((sum,item)=>sum+item.value.value/eligible.length,0):null,unit:'%',
  eligible:eligible.length,availableInputs:inputs.length,unavailable:rows.length-eligible.length,
  contributors:eligible.map(({row})=>row.symbol),asOf:eligible[0]?.value.asOf??null,
  source:eligible[0]?.value.source??null,currency:eligible[0]?.row.currency??null,adjustment:eligible[0]?.row.adjustment??null,methodVersion:eligible[0]?.value.methodVersion??null,
  periodStart:eligible[0]?.value.periodStart??null,periodEnd:eligible[0]?.value.periodEnd??null,
  method:'Arithmetic equal-weight average of compatible requested pilot price-return observations; not a sector benchmark.'};
}
function breadth(rows){
 const inputs=rows.flatMap(row=>row.metrics.return1dPct.status==='available'?[{row,value:row.metrics.return1dPct}]:[]),ready=compatible(inputs,true);
 const eligible=ready.status==='available'?inputs:[];
 const result={return1d:{...ready,positive:eligible.filter(item=>item.value.value>0).length,negative:eligible.filter(item=>item.value.value<0).length,
  unchanged:eligible.filter(item=>item.value.value===0).length,eligible:eligible.length,unavailable:rows.length-eligible.length,
  contributors:eligible.map(({row})=>row.symbol),asOf:eligible[0]?.value.asOf??null,source:eligible[0]?.value.source??null}};
 for(const period of [20,50,200]){
  const key=`sma${period}`,candidates=rows.flatMap(row=>row.trends[key].status==='available'?[{row,value:row.metrics.close}]:[]),state=compatible(candidates);
  const members=state.status==='available'?candidates.map(item=>item.row):[];
  result[key]={...state,above:members.filter(row=>row.trends[key].relation==='above').length,below:members.filter(row=>row.trends[key].relation==='below').length,
   equal:members.filter(row=>row.trends[key].relation==='equal').length,eligible:members.length,unavailable:rows.length-members.length,
   contributors:members.map(row=>row.symbol),asOf:members[0]?.metrics.close.asOf??null,source:members[0]?.metrics.close.source??null};
 }
 return result;
}
function normalizeSeries(record,row,today){
 if(row.metrics.close.status!=='available')return {reason:row.metrics.close.reason};
 if(!row.currency||!row.source||!row.adjustment)return {reason:'unknown_comparison_context'};
 if(!Array.isArray(record?.series)||record.series.length>260)return {reason:'missing_or_oversized_series'};
 const prices=new Map();let rejected=0,duplicates=0;
 for(const bar of record.series){
  const day=session(bar?.t),declared=bar?.session;
  if(!day||declared!==undefined&&declared!==day||!finite(bar?.c)||bar.c<=0||day>=today||[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay())){rejected++;continue;}
  if(prices.has(day)){
   duplicates++;if(prices.get(day)!==bar.c)return {reason:'conflicting_series_session'};
  }else prices.set(day,bar.c);
 }
 const dates=[...prices.keys()].sort(),latest=dates.at(-1);
 if(!latest||latest!==session(row.metrics.close.asOf)||prices.get(latest)!==row.metrics.close.value)return {reason:'series_snapshot_mismatch'};
 return {prices,dates,rejected,duplicates};
}
function comparison(rows,records,symbols,windowSessions,today){
 const excluded=[],inputs=[];
 for(const symbol of symbols){
  const row=rows.find(item=>item.symbol===symbol),record=records.get(symbol),series=normalizeSeries(record,row,today);
  if(series.reason)excluded.push({symbol,reason:series.reason});else inputs.push({row,...series});
 }
 const base={windowSessions,requestedSymbols:symbols,eligibleSymbols:inputs.map(item=>item.row.symbol),excluded,dates:[],series:[],
  coverage:{requested:symbols.length,eligible:inputs.length,excluded:excluded.length,commonSessions:0},
  method:'Each security starts at index 100 on the first common supplied completed session; intersect dates without forward filling. Price returns exclude automatic dividend reinvestment.'};
 if(!inputs.length)return {...base,status:'unavailable',reason:'no_eligible_series'};
 if(new Set(inputs.map(({row})=>JSON.stringify([row.source,row.currency,row.adjustment]))).size!==1)return {...base,status:'unavailable',reason:'comparison_context_mismatch'};
 if(new Set(inputs.map(item=>item.dates.at(-1))).size!==1)return {...base,status:'unavailable',reason:'comparison_asof_mismatch'};
 const common=inputs[0].dates.filter(day=>inputs.every(item=>item.prices.has(day)));
 base.coverage.commonSessions=common.length;
 if(common.length<windowSessions+1)return {...base,status:'unavailable',reason:'insufficient_common_sessions'};
 const dates=common.slice(-(windowSessions+1)),baseDate=dates[0];
 if(inputs.some(({prices})=>dates.some(date=>!Number.isFinite(prices.get(date)/prices.get(baseDate)*100))))return {...base,status:'unavailable',reason:'invalid_normalization'};
 return {...base,status:'available',reason:null,dates,series:inputs.map(({row,prices,rejected,duplicates})=>({symbol:row.symbol,source:row.source,
  currency:row.currency,adjustment:row.adjustment,baseDate,basePrice:prices.get(baseDate),rejectedRecords:rejected,duplicateRecords:duplicates,
  points:dates.map(date=>({date,index:prices.get(date)/prices.get(baseDate)*100,returnPct:(prices.get(date)/prices.get(baseDate)-1)*100}))}))};
}

export function buildMarketAtlas(companies,{instruments=INSTRUMENTS,now=Date.now(),windowSessions=20,comparisonSymbols}={}){
 const clock=typeof now==='function'?Number(now()):typeof now==='string'?Date.parse(now):Number(now);
 if(!Number.isFinite(clock))throw new TypeError('A valid Atlas clock is required');
 if(![20,63].includes(windowSessions))throw new RangeError('Choose a 20- or 63-session comparison window');
 if(!Array.isArray(instruments)||!instruments.length||instruments.length>MAX_SYMBOLS||instruments.some(item=>!item||!(/^[A-Z][A-Z0-9.-]{0,11}$/).test(item.symbol))||new Set(instruments.map(item=>item.symbol)).size!==instruments.length)throw new TypeError('Choose one to ten unique pilot instruments');
 if(Array.isArray(companies)&&companies.length>MAX_SYMBOLS)throw new RangeError('Atlas accepts at most ten company snapshots');
 const symbols=comparisonSymbols??instruments.map(item=>item.symbol);
 if(!Array.isArray(symbols)||!symbols.length||symbols.length>MAX_SYMBOLS||new Set(symbols).size!==symbols.length||symbols.some(symbol=>!instruments.some(item=>item.symbol===symbol)))throw new TypeError('Choose supported unique comparison symbols');
 const today=etDay.format(new Date(clock)),records=new Map(),duplicates=new Set();let ignoredRecords=0;
 for(const item of Array.isArray(companies)?companies:[]){
  if(!item||!instruments.some(instrument=>instrument.symbol===item.symbol)){ignoredRecords++;continue;}
  if(records.has(item.symbol))duplicates.add(item.symbol);else records.set(item.symbol,item);
 }
 const rows=instruments.map(instrument=>{
  const record=records.get(instrument.symbol),index=indexMetrics(record);
  const currency=/^[A-Z]{3}$/.test(instrument.currency||'')?instrument.currency:null;
  const mismatch=record?.instrument?.currency&&record.instrument.currency!==currency;
  const reason=duplicates.has(instrument.symbol)?'ambiguous_company_record':mismatch?'instrument_currency_mismatch':null;
  const metrics=Object.fromEntries(Object.entries(METRICS).map(([key,[id,unit]])=>[key,metric(index,id,unit,clock,today,reason)]));
  const close=metrics.close,declared=record?.methodology?.adjustment??record?.methodology?.technical?.declaredAdjustment;
  const adjustment=ADJUSTMENTS.has(declared)&&(!close.adjustment||close.adjustment===declared)?declared:!declared&&ADJUSTMENTS.has(close.adjustment)?close.adjustment:null;
  if(close.status==='available')for(const key of Object.keys(metrics).filter(key=>key!=='close')){
   const value=metrics[key];
   if(value.status==='available'&&(value.source!==close.source||instant(value.asOf)!==instant(close.asOf)||value.methodVersion!==close.methodVersion||value.adjustment!==close.adjustment))metrics[key]={...value,value:null,status:'unavailable',reason:'snapshot_context_mismatch'};
  }
  const trends=Object.fromEntries([20,50,200].map(period=>[`sma${period}`,trend(close,metric(index,`technical.sma${period}`,'USD',clock,today,reason))]));
  const count=Object.values(metrics).filter(value=>value.status==='available').length+Object.values(trends).filter(value=>value.status==='available').length;
  return {symbol:instrument.symbol,name:text(instrument.name,100)||instrument.symbol,category:text(instrument.sector,100)||'Unclassified pilot',
   classification:'pilot display category',type:text(instrument.type,30),currency,source:close.source,adjustment,asOf:close.asOf,
   status:count===11?'available':count?'partial':'unavailable',metrics,trends};
 });
 const groups=[...new Set(rows.map(row=>row.category))].map(name=>{
  const members=rows.filter(row=>row.category===name);
  return {name,classification:'pilot display category',symbols:members.map(row=>row.symbol),requested:members.length,
   returns:Object.fromEntries(RETURNS.map(key=>[key,average(members,key)])),breadth:breadth(members)};
 });
 const dates=[...new Set(rows.flatMap(row=>row.metrics.close.status==='available'?[row.metrics.close.asOf]:[]))];
 return {schemaVersion:1,methodVersion:VERSION,generatedAt:new Date(clock).toISOString(),asOf:dates.length===1?dates[0]:null,
  rows,groups,breadth:breadth(rows),comparison:comparison(rows,records,symbols,windowSessions,today),
  coverage:{requested:instruments.length,loaded:records.size,available:rows.filter(row=>row.status==='available').length,
   partial:rows.filter(row=>row.status==='partial').length,unavailable:rows.filter(row=>row.status==='unavailable').length,
   ignoredRecords,ambiguousSymbols:[...duplicates],completeMarket:false,universe:'Explicitly requested subset of the ten-symbol pilot',freshnessDays:7},
  limitations:['This is descriptive breadth of requested pilot instruments, not the US market or an investable sector index.',
   'Display categories are informal pilot labels, not an authoritative sector taxonomy or constituent universe.',
   'Averages are equal-weight compatible price-return observations; missing or stale observations are excluded, never zero-filled.',
   'Comparison curves intersect supplied completed sessions without forward filling; missing sessions, exchange holidays and early closes are not reconstructed.',
   'Current ET date is excluded. Seven elapsed days is a freshness guard, not an exchange-session assessment.',
   'Provider adjustment is declared, not independently verified; results do not imply total return, exposure or prediction.']};
}
