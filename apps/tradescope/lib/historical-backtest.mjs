/**
 * v0.16 bounded, no-hindsight macro replay and observational market outcome study.
 *
 * No trained model, probability, causal proof or verified publication timestamp.
 * Every decision uses its own historical ALFRED vintage, never today's revised data.
 * Outcomes are evaluated strictly AFTER the decision date, as research labels only.
 */
import {isoDay,MACRO_INDICATORS} from './macro-vintage.mjs';

const DAY=86_400_000;
const MIN='2005-01-01';
const MARKET_START='2016-01-01';
const CASES=Object.freeze([
 Object.freeze({id:'financial-2008',name:'2007 credit stress · before 2008 crisis',kind:'retrospective',
  rangeStart:'2006-01-01',rangeEnd:'2009-12-31',start:'2007-06-01',end:'2007-09-06',
  anchor:'2008-09-15',marketCoverageNote:'This Alpaca source is not supported before 2016. Macro warnings can be replayed; market return/false-alarm statistics are unavailable.'}),
 Object.freeze({id:'covid-2020',name:'COVID-19 market disruption · 2020',kind:'retrospective',
  rangeStart:'2019-01-01',rangeEnd:'2021-12-31',start:'2020-01-03',end:'2020-04-03',
  anchor:'2020-03-11',marketCoverageNote:'Market-price labels use completed Alpaca IEX SPY daily bars if provider coverage and credentials permit.'}),
 Object.freeze({id:'control-2017',name:'2017 comparison window · negative control',kind:'comparison',
  rangeStart:'2017-01-01',rangeEnd:'2018-12-31',start:'2017-06-02',end:'2017-09-01',
  anchor:null,marketCoverageNote:'A comparison period, not a claim that no volatility or crisis risk existed.'})
]);
const PRESETS=new Map(CASES.map(c=>[c.id,c]));
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const plusDays=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const difference=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY;
const copy=val=>structuredClone(val);
export function planReplayDates({caseId,start,end,cadenceDays=14,horizonSessions=20,lossThresholdPct=10},now=()=>new Date()){
 const preset=PRESETS.get(caseId);if(!preset)throw err('Choose a registered historical study preset');
 const first=start||preset.start,last=end||preset.end,today=now().toISOString().slice(0,10);
 if(!isoDay(first)||!isoDay(last)||first<MIN||first<preset.rangeStart||last>preset.rangeEnd||
    last>=today||last<first||difference(first,last)>112)throw err('Study window must be a bounded past date range within its registered historical regime');
 if(![7,14,28].includes(cadenceDays)||![5,20,63].includes(horizonSessions)||![5,10,20].includes(lossThresholdPct))
  throw err('Unsupported replay cadence, outcome horizon or drawdown threshold');
 const dates=[];for(let i=0;i<=difference(first,last);i+=cadenceDays)dates.push(plusDays(first,i));
 if(dates.length<2||dates.length>17)throw err('Study requires 2 to 17 historical decision dates');
 return {caseId,preset:{id:preset.id,name:preset.name,kind:preset.kind,anchor:preset.anchor,marketCoverageNote:preset.marketCoverageNote},
  start:first,end:last,cadenceDays,horizonSessions,lossThresholdPct,dates};
}
function dateET(instant){
 const t=Date.parse(instant);if(!Number.isFinite(t))return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));
 const get=part=>parts.find(p=>p.type===part)?.value;
 return [get('year'),get('month'),get('day')].join('-');
}
export function normalizeBenchmark(data){
 if(data?.source!=='ALPACA_IEX'||data.feed!=='iex'||data.adjustment!=='split'||
   data.hasMore||data.partialHistory||!Array.isArray(data.bars)||data.bars.length>900)
  throw err('SPY benchmark data is unverified, partial or incompatible',502);
 const seen=new Set(),bars=[];
 for(const bar of data.bars){
  const day=typeof bar?.t==='string'?dateET(bar.t):null;
  if(!isoDay(day)||typeof bar.c!=='number'||!Number.isFinite(bar.c)||bar.c<=0||bar.c>1e8||seen.has(day))
   throw err('Malformed or duplicate completed benchmark bar',502);
  seen.add(day);bars.push({date:day,close:bar.c});
 }
 bars.sort((a,b)=>a.date.localeCompare(b.date));
 for(let i=1;i<bars.length;i++)if(difference(bars[i-1].date,bars[i].date)>7)throw err('SPY bars have a gap too large for an outcome study',502);
 return bars;
}
/** First bar strictly AFTER the decision date is the entry close.
 * Forward returns start from that entry and use next horizonSessions closes;
 * this deliberately does not pretend the end-of-day signal was tradable today.
 */
export function forwardOutcome({asOf,bars,horizonSessions=20,lossThresholdPct=10}){
 if(!isoDay(asOf)||!Array.isArray(bars)||![5,20,63].includes(horizonSessions)||![5,10,20].includes(lossThresholdPct))
  throw err('Invalid independent market outcome request');
 const entryIndex=bars.findIndex(b=>b.date>asOf);
 if(entryIndex<0||difference(asOf,bars[entryIndex].date)>7)return {status:'unavailable',reason:'No timely next-session benchmark close',entryIndex:null};
 const entry=bars[entryIndex],future=bars.slice(entryIndex+1,entryIndex+1+horizonSessions);
 if(future.length<horizonSessions)return {status:'unavailable',reason:'Insufficient complete future trading sessions',entryIndex};
 let low=Infinity,firstBreach=null;
 for(let i=0;i<future.length;i++){
  const loss=100*(future[i].close/entry.close-1);low=Math.min(low,loss);
  if(firstBreach===null&&loss<=-lossThresholdPct)firstBreach={date:future[i].date,sessions:i+1};
 }
 return {status:'measured',entryDate:entry.date,entryIndex,entryClose:entry.close,
  horizonSessions,lossThresholdPct,worstReturnPct:Number(low.toFixed(4)),
  endpointReturnPct:Number((100*(future.at(-1).close/entry.close-1)).toFixed(4)),
  eventOccurred:Boolean(firstBreach),firstBreachDate:firstBreach?.date||null,
  sessionsUntilBreach:firstBreach?.sessions??null,marketSource:'ALPACA_IEX_SPY_SPLIT_ADJUSTED'};
}
function validateSnapshot(snapshot,day){
 if(snapshot?.source!=='FRED_ALFRED_VINTAGE'||snapshot.asOf!==day||
  snapshot.earlyWarning?.asOf!==day||!Array.isArray(snapshot.earlyWarning.rules)||
  !Array.isArray(snapshot.observations))throw err('Historical replay received a mismatched macro vintage',502);
 const expected=new Set(MACRO_INDICATORS.map(x=>x.id)),seen=new Set();
 for(const rule of snapshot.earlyWarning.rules){
  if(!expected.has(rule.id)||seen.has(rule.id)||![null,true,false].includes(rule.triggered))throw err('Historical replay rule set is invalid',502);
  seen.add(rule.id);
  if(rule.triggered!==null){
   const obs=snapshot.observations.find(o=>o.id===rule.id);
   if(obs?.status!=='available'||typeof obs.value!=='number'||!Number.isFinite(obs.value)||
    !isoDay(obs.observationDate)||obs.observationDate>day||
    !isoDay(obs.vintageStart)||!isoDay(obs.vintageEnd)||obs.vintageStart>day||obs.vintageEnd<day)
    throw err('Rule has no valid contemporaneous source observation',502);
  }
 }
 if(seen.size!==expected.size)throw err('Historical replay is missing macro rules',502);
}
/** Fixed 2-of-3 composite is RESEARCH ONLY; evidence can be incomplete. */
export function buildHistoricalStudy({plan,snapshots,benchmarkBars=null,benchmarkStatus='not_requested'}){
 if(!plan||!Array.isArray(plan.dates)||!Array.isArray(snapshots)||snapshots.length!==plan.dates.length)
  throw err('Replay lacks the requested historical decision snapshots');
 const timeline=snapshots.map((snapshot,index)=>{
  const asOf=plan.dates[index];validateSnapshot(snapshot,asOf);
  const rules=snapshot.earlyWarning.rules;
  const usable=rules.filter(r=>r.triggered!==null).length,triggered=rules.filter(r=>r.triggered===true);
  const state=usable<2?'insufficient_data':triggered.length>=2?'candidate_warning':'no_composite_warning';
  const outcome=Array.isArray(benchmarkBars)?forwardOutcome({asOf,bars:benchmarkBars,horizonSessions:plan.horizonSessions,lossThresholdPct:plan.lossThresholdPct}):
   {status:'unavailable',reason:benchmarkStatus==='unsupported_before_2016'?'Market source unavailable before 2016':'No verified market benchmark bars'};
  return {asOf,signal:state,usableIndicators:usable,triggeredIndicators:triggered.length,
   ruleStates:rules.map(r=>({id:r.id,value:r.value,triggered:r.triggered,observationDate:r.observationDate||null,status:r.status})),
   market:outcome};
 });
 const triggered=timeline.filter(t=>t.signal==='candidate_warning').length,
  evaluable=timeline.filter(t=>t.signal!=='insufficient_data').length,
  measured=timeline.filter(t=>t.market.status==='measured').length;
 // Overlapping realized-return windows are not independent samples. Evaluate at
 // most one outcome per horizon; do not use the remaining overlapping labels.
 const independent=[];let ignoredOverlap=0,lastEntry=-Infinity;
 for(const item of timeline){
  if(item.signal==='insufficient_data'||item.market.status!=='measured')continue;
  if(item.market.entryIndex<=lastEntry+plan.horizonSessions){ignoredOverlap++;continue;}
  independent.push(item);lastEntry=item.market.entryIndex;
 }
 const confusion={trueWarning:0,falseWarning:0,missedDrop:0,trueNormal:0};
 for(const row of independent){
  const alert=row.signal==='candidate_warning',drop=row.market.eventOccurred;
  if(alert&&drop)confusion.trueWarning++;else if(alert&&!drop)confusion.falseWarning++;
  else if(!alert&&drop)confusion.missedDrop++;else confusion.trueNormal++;
 }
 const tp=confusion.trueWarning,fp=confusion.falseWarning,fn=confusion.missedDrop,tn=confusion.trueNormal;
 // Avoid displaying unstable rates from tiny samples as validated performance.
 const powered=independent.length>=10;
 const ratio=(a,b)=>b>0?Number((a/b).toFixed(4)):null;
 const lead=independent.filter(t=>t.signal==='candidate_warning'&&t.market.eventOccurred).map(t=>t.market.sessionsUntilBreach);
 return {version:'v016-exploratory',caseId:plan.caseId,caseName:plan.preset.name,
  window:{start:plan.start,end:plan.end,cadenceDays:plan.cadenceDays,decisionDates:plan.dates.length,
   horizonSessions:plan.horizonSessions,lossThresholdPct:plan.lossThresholdPct},
  decisionClock:'END_OF_HISTORICAL_CALENDAR_DAY',executionAssumption:'NEXT_AVAILABLE_SPY_SESSION_CLOSE',
  compositeRule:'at-least-two-candidate-thresholds-triggered-with-at-least-two-usable-series',
  indicators:MACRO_INDICATORS.map(x=>({id:x.id,seriesId:x.seriesId})),
  timeline,
  coverage:{evaluatedDecisions:evaluable,totalDecisions:timeline.length,warningDecisions:triggered,
   benchmarkLabelledDecisions:measured,independentLabelledDecisions:independent.length,overlappingOutcomesExcluded:ignoredOverlap,
   benchmarkStatus},
  outcomes:{descriptiveConfusion:independent.length?confusion:null,
   ratesStatus:!benchmarkBars?'UNAVAILABLE_NO_MARKET_DATA':powered?'DESCRIPTIVE_SMALL_OBSERVATIONAL_SAMPLE':'INSUFFICIENT_INDEPENDENT_SAMPLE',
   precision:powered?ratio(tp,tp+fp):null,recall:powered?ratio(tp,tp+fn):null,
   falseAlarmRate:powered?ratio(fp,fp+tn):null,
   leadSessionsToFirstDrawdown:lead.length?lead:null},
  sourceProvenance:{macro:'FRED_ALFRED_VINTAGE',market:benchmarkBars?'ALPACA_IEX_SPY_SPLIT_ADJUSTED':null},
  calibratedForecast:false,crashProbability:null,trainTestSplitPerformed:false,
  limitations:[
   'This is a fixed-rule retrospective replay and descriptive outcome study, not a trained or calibrated prediction model.',
   'ALFRED calendar-day vintages cannot alone verify intraday release publication clocks.',
   'Event labels use future realized SPY closes strictly after the signal date and are never used as model features.',
   'One sampled macro decision can overlap the next 5/20/63-session outcome window; overlapping windows are excluded from performance statistics.',
   'SPY IEX bars are single-venue market data. Results may differ from consolidated closing benchmarks or dividend-adjusted total returns.',
   'Historical index membership, broad market breadth, trading frictions, eligibility and external validation remain outstanding.'
  ]};
}
export function createHistoricalBacktest({macro,marketSources=null,now=()=>new Date()}={}){
 if(typeof macro?.snapshot!=='function'||typeof macro?.catalog!=='function')throw new TypeError('Historical backtest requires ALFRED macro service');
 const cache=new Map(),pending=new Map();
 async function run(input){
  const plan=planReplayDates(input,now);
  if(!macro.catalog().credentialsConfigured)throw err('FRED_API_KEY required for point-in-time replay',503);
  // Ensure a deterministic bounded number of historical API queries.
  const snapshots=[];
  for(const asOf of plan.dates)snapshots.push(await macro.snapshot(asOf));
  let benchmarkBars=null,benchmarkStatus='unsupported_before_2016';
  if(plan.start>=MARKET_START){
   benchmarkStatus='unavailable_provider';
   if(typeof marketSources?.researchBars==='function'){
    const today=now().toISOString().slice(0,10);
    const wantedEnd=plusDays(plan.end,Math.ceil(plan.horizonSessions*1.9)+14);
    const maxEnd=plusDays(today,-1),marketEnd=wantedEnd<maxEnd?wantedEnd:maxEnd;
    if(marketEnd>=plan.end){
     try{
      const bars=await marketSources.researchBars('SPY',{start:plan.start,end:marketEnd,feed:'iex',adjustment:'split'});
      benchmarkBars=normalizeBenchmark(bars);
      benchmarkStatus=benchmarkBars.length?'available':'unavailable_empty';
      if(!benchmarkBars.length)benchmarkBars=null;
     }catch(error){benchmarkStatus=error?.status===429?'unavailable_rate_limited':'unavailable_provider';}
    }else benchmarkStatus='unavailable_outcome_window';
   }
  }
  return buildHistoricalStudy({plan,snapshots,benchmarkBars,benchmarkStatus});
 }
 return {
  catalog(){return {version:'v016-exploratory',presets:copy(CASES),cadences:[7,14,28],horizons:[5,20,63],
   lossThresholds:[5,10,20],macroConfigured:macro.catalog().credentialsConfigured,
   marketSource:'Alpaca IEX SPY; available where provider permits, not before 2016',
   experimental:true,calibratedForecast:false};},
  async replay(input){
   const plan=planReplayDates(input,now),key=JSON.stringify({caseId:plan.caseId,start:plan.start,end:plan.end,
    cadenceDays:plan.cadenceDays,horizonSessions:plan.horizonSessions,lossThresholdPct:plan.lossThresholdPct});
   const hit=cache.get(key);if(hit?.expires>Date.now())return copy(hit.value);
   if(pending.has(key))return copy(await pending.get(key));
   const task=run(input).then(value=>{cache.set(key,{expires:Date.now()+300000,value});if(cache.size>8)cache.delete(cache.keys().next().value);return value});
   pending.set(key,task);try{return copy(await task)}finally{pending.delete(key)}
  }
 };
}
export function createHistoricalBacktestApi({service}={}){
 if(typeof service?.replay!=='function'||typeof service?.catalog!=='function')throw new TypeError('Historical study API requires service');
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/backtest/'))return false;
  if(req.method!=='GET'){send(res,405,{error:'Read-only historical backtest API'});return true;}
  if(url.pathname==='/api/backtest/catalog'){send(res,200,service.catalog());return true;}
  if(url.pathname==='/api/backtest/replay'){
   try{
    const allowed=new Set(['case','start','end','cadence','horizon','threshold']);
    if([...url.searchParams.keys()].some(key=>!allowed.has(key)||url.searchParams.getAll(key).length!==1))
     throw err('Unknown or duplicated replay parameter');
    const numberParam=(name,fallback)=>{
     const value=url.searchParams.get(name);if(value===null)return fallback;
     if(!/^\d+$/.test(value))throw err('Replay parameters must be unsigned integers');
     return Number(value);
    };
    const result=await service.replay({caseId:url.searchParams.get('case'),start:url.searchParams.get('start')||undefined,
     end:url.searchParams.get('end')||undefined,cadenceDays:numberParam('cadence',14),
     horizonSessions:numberParam('horizon',20),lossThresholdPct:numberParam('threshold',10)});
    send(res,200,result);
   }catch(error){const status=[400,429,502,503,504].includes(error?.status)?error.status:502;
    send(res,status,{error:error?.status?error.message:'Historical study service unavailable'});}
   return true;
  }
  send(res,404,{error:'Unknown historical backtest endpoint'});return true;
 };
}
