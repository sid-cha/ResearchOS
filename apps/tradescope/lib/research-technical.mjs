/**
 * Versioned daily-bar research metrics for the US equity pilot.
 * Calculations use supplied prices; this module never infers corporate actions,
 * provider entitlements, exchange holidays, or point-in-time availability.
 */
import {validEventTimestamp} from './market-events.mjs';

const VERSION = 'research-technicals-v1';
const MAX_INPUT_BARS = 10000;
const SERIES_LIMIT = 260;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const etDate = new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
});
const mean = values => {
  const anchor=values[0];
  return anchor + values.reduce((sum,value) => sum + (value-anchor)/values.length,0);
};
const percent = (value,reference) => reference > 0 ? (value / reference - 1) * 100 : null;

function definition(id,label,unit,minimumBars,description,inputs=['c']) {
  return Object.freeze({id,label,group:'Technicals',unit,description,
    inputs:Object.freeze([...inputs]),minimumBars,methodVersion:VERSION});
}

export const TECHNICAL_DEFINITIONS = Object.freeze([
  definition('price.close','Completed-session close','USD',1,'Last usable completed-session close supplied by the provider.'),
  ...[20,50,200].map(period => definition(`technical.sma${period}`,`SMA ${period}`,'USD',period,
    `Arithmetic mean of the latest ${period} usable completed-session closes.`)),
  ...[20,50,200].map(period => definition(`technical.ema${period}`,`EMA ${period}`,'USD',period,
    `EMA with alpha 2/(${period}+1), seeded by the first ${period}-bar SMA and updated over the loaded completed history.`)),
  ...[20,50,200].map(period => definition(`technical.distanceSma${period}Pct`,`Distance from SMA ${period}`,'%',period,
    `100 × (latest completed close / SMA${period} − 1).`)),
  definition('technical.rsi14','RSI 14 (rolling)','index',15,
    'RSI from simple rolling means of 14 close changes; flat changes map to 50. This is not Wilder smoothing.'),
  definition('technical.macd','MACD (12,26)','USD',26,
    'SMA-seeded EMA12 minus EMA26, calculated on supplied completed closes.'),
  definition('technical.macdSignal','MACD signal (9)','USD',34,
    'SMA-seeded EMA9 of MACD observations; 34 completed closes are required.'),
  definition('technical.macdHistogram','MACD histogram','USD',34,'MACD minus its EMA9 signal.'),
  definition('technical.atr14','ATR 14 (simple mean)','USD',15,
    'Simple mean of the latest 14 true ranges including previous-close gaps; not Wilder smoothing.',['h','l','c']),
  definition('technical.atrPct','ATR / close','%',15,'100 × simple ATR14 / latest completed close.',['h','l','c']),
  definition('technical.relativeVolume20','Relative volume / prior 20','ratio',21,
    'Latest completed-session volume divided by mean volume of the 20 earlier completed observations; current volume is excluded from its baseline.',['v']),
  ...[1,5,20,63,252].map(period => definition(`technical.return${period}dPct`,`${period}-session price return`,'%',period+1,
    `100 × (latest supplied close / close ${period} usable sessions earlier − 1). This is not automatically a dividend-reinvested total return.`)),
  definition('technical.high252','252-session high','USD',252,'Highest reported high of the latest 252 usable sessions; an approximate 52-week window.',['h']),
  definition('technical.low252','252-session low','USD',252,'Lowest reported low of the latest 252 usable sessions; an approximate 52-week window.',['l']),
  definition('technical.distanceHigh252Pct','Distance from 252-session high','%',252,
    '100 × (latest completed close / highest high over 252 usable sessions − 1).',['h','c']),
  definition('technical.gapPct','Opening gap vs prior close','%',2,
    '100 × (latest completed-session open / preceding completed close − 1). Requires a supplied open; no split adjustment is inferred.',['o','c']),
  definition('technical.breakout20','Close above prior 20-session high','boolean',21,
    'True only when latest completed close is strictly above highs of the 20 earlier usable sessions; excludes the current bar from the threshold.',['h','c']),
  definition('technical.breakdown20','Close below prior 20-session low','boolean',21,
    'True only when latest completed close is strictly below lows of the 20 earlier usable sessions; excludes the current bar from the threshold.',['l','c']),
  definition('technical.bollingerUpper20','Bollinger upper (20,2)','USD',20,
    '20-close SMA plus two population standard deviations of those 20 closes.'),
  definition('technical.bollingerLower20','Bollinger lower (20,2)','USD',20,
    '20-close SMA minus two population standard deviations of those 20 closes.'),
  definition('technical.bollingerPosition20','Bollinger position (20,2)','%',20,
    '100 × (close − lower band) / (upper band − lower band); may be outside 0–100; a zero-width band is unavailable.'),
  definition('technical.stochasticK14','Stochastic %K (14)','%',14,
    '100 × (latest close − 14-session lowest low) / (14-session highest high − lowest low); zero range is unavailable.',['h','l','c']),
  definition('technical.obv','OBV over loaded history','shares',2,
    'Cumulative signed session volume from zero at the first loaded close; no absolute level is comparable across different starting histories.',['c','v'])
]);

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}

function sessionFor(timestamp) {
  if (validDate(timestamp)) return timestamp;
  if (!validEventTimestamp(timestamp)) return null;
  return etDate.format(new Date(timestamp));
}

function normalizeBars(rawBars,today) {
  const received = Array.isArray(rawBars) ? rawBars : [];
  const inspected = received.slice(0,MAX_INPUT_BARS);
  const bySession = new Map(), conflicts = new Set();
  let malformedBars=0,currentSessionBars=0,futureBars=0,weekendBars=0,duplicateBars=0;
  for (const input of inspected) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { malformedBars++; continue; }
    const session = sessionFor(input.t);
    const hasOpen = input.o !== undefined && input.o !== null;
    if (!session || !['c','h','l'].every(key => finite(input[key]) && input[key] > 0) ||
      !finite(input.v) || input.v < 0 || input.v > Number.MAX_SAFE_INTEGER ||
      input.h < input.l || input.c > input.h || input.c < input.l ||
      (hasOpen && (!finite(input.o) || input.o <= 0 || input.o > input.h || input.o < input.l))) {
      malformedBars++; continue;
    }
    if (session === today) { currentSessionBars++; continue; }
    if (session > today) { futureBars++; continue; }
    const weekday = new Date(`${session}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) { weekendBars++; continue; }
    const bar = {t:input.t,session,o:hasOpen?input.o:null,h:input.h,l:input.l,c:input.c,v:input.v};
    if (conflicts.has(session)) { duplicateBars++; continue; }
    const prior = bySession.get(session);
    if (prior) {
      duplicateBars++;
      if (['o','h','l','c','v'].some(key => prior[key] !== bar[key])) {
        bySession.delete(session);conflicts.add(session);
      } else if (bar.t < prior.t) {
        // Equivalent daily values retain a deterministic supplied timestamp.
        bySession.set(session,bar);
      }
    } else bySession.set(session,bar);
  }
  const bars = [...bySession.values()].sort((a,b) => a.session.localeCompare(b.session));
  const rejectedBars = received.length - bars.length;
  return {bars,inputQuality:{
    validation:!Array.isArray(rawBars)?'invalid-input':rejectedBars?'partial':'valid',
    receivedBars:received.length,inspectedBars:inspected.length,usableBars:bars.length,rejectedBars,
    malformedBars,currentSessionBars,futureBars,weekendBars,duplicateBars,
    conflictingSessions:conflicts.size,truncatedBars:received.length-inspected.length,
    completionPolicy:'Exclude current and later America/New_York session dates, even after the close.',
    calendarAssessment:'Weekends excluded; exchange holidays, early closes and missing market sessions are not inferred.'
  }};
}

function ema(values,period) {
  if (values.length < period) return [];
  let previous = mean(values.slice(0,period));
  const result = [previous], alpha = 2 / (period + 1);
  for (let i=period;i<values.length;i++) {
    previous += alpha * (values[i]-previous);
    result.push(previous);
  }
  return result;
}

function calculateAll(bars) {
  const count=bars.length,last=bars.at(-1),closes=bars.map(bar=>bar.c);
  const averages=new Map(),emas=new Map();let macd,bands;
  const average=period=>{if(!averages.has(period))averages.set(period,mean(closes.slice(-period)));return averages.get(period);};
  const exponential=period=>{if(!emas.has(period))emas.set(period,ema(closes,period));return emas.get(period);};
  const macdValues=()=>{
    if(!macd){const fast=exponential(12),slow=exponential(26);macd=slow.map((value,i)=>fast[i+14]-value);}
    return macd;
  };
  const bollinger=()=>{
    if(!bands){const values=closes.slice(-20),center=average(20);
      const deviation=Math.hypot(...values.map(value=>value-center))/Math.sqrt(20);
      bands={center,deviation,upper:center+2*deviation,lower:center-2*deviation};}
    return bands;
  };
  const latestBars=length=>bars.slice(-length);
  const priorBars=length=>bars.slice(-length-1,-1);
  const rangeHigh=rows=>Math.max(...rows.map(bar=>bar.h));
  const rangeLow=rows=>Math.min(...rows.map(bar=>bar.l));
  const calculate=definition=>{
    const id=definition.id;
    let value=null,details={};
    if(id==='price.close')value=last.c;
    else if(/^technical\.sma\d+$/.test(id))value=average(Number(id.slice(13)));
    else if(/^technical\.ema\d+$/.test(id))value=exponential(Number(id.slice(13))).at(-1);
    else if(/^technical\.distanceSma\d+Pct$/.test(id)){
      const period=Number(id.match(/Sma(\d+)/)[1]);value=percent(last.c,average(period));details.referenceValue=average(period);
    }else if(id==='technical.rsi14'){
      const changes=latestBars(15).slice(1).map((bar,i)=>bar.c-bars[count-15+i].c);
      const gain=mean(changes.map(change=>Math.max(0,change))),loss=mean(changes.map(change=>Math.max(0,-change)));
      value=loss===0?(gain===0?50:100):100-100/(1+gain/loss);details={averaging:'simple rolling 14 returns',wilderSmoothing:false};
    }else if(id==='technical.macd')value=macdValues().at(-1);
    else if(id==='technical.macdSignal')value=ema(macdValues(),9).at(-1);
    else if(id==='technical.macdHistogram')value=macdValues().at(-1)-ema(macdValues(),9).at(-1);
    else if(id==='technical.atr14'||id==='technical.atrPct'){
      const rows=latestBars(15),ranges=rows.slice(1).map((bar,i)=>Math.max(bar.h-bar.l,Math.abs(bar.h-rows[i].c),Math.abs(bar.l-rows[i].c)));
      const atr=mean(ranges);value=id==='technical.atr14'?atr:atr/last.c*100;details={averaging:'simple mean of 14 true ranges',wilderSmoothing:false};
    }else if(id==='technical.relativeVolume20'){
      const baseline=mean(priorBars(20).map(bar=>bar.v));
      if(baseline===0)return {value:null,status:'missing_data',reason:'Prior 20-session average volume is zero; relative volume is undefined.',details:{baseline}};
      value=last.v/baseline;details={baseline,sampleWindow:20,currentExcludedFromBaseline:true};
    }else if(/^technical\.return\d+dPct$/.test(id)){
      const period=Number(id.match(/return(\d+)/)[1]),reference=bars[count-period-1];
      value=percent(last.c,reference.c);details={referenceValue:reference.c,referenceSession:reference.session};
    }else if(id==='technical.high252')value=rangeHigh(latestBars(252));
    else if(id==='technical.low252')value=rangeLow(latestBars(252));
    else if(id==='technical.distanceHigh252Pct'){
      const reference=rangeHigh(latestBars(252));value=percent(last.c,reference);details.referenceValue=reference;
    }else if(id==='technical.gapPct'){
      if(last.o===null)return {value:null,status:'missing_data',reason:'Latest completed-session open was not supplied.',details:{}};
      value=percent(last.o,bars[count-2].c);details={referenceValue:bars[count-2].c,referenceSession:bars[count-2].session,open:last.o};
    }else if(id==='technical.breakout20'||id==='technical.breakdown20'){
      const rows=priorBars(20),threshold=id==='technical.breakout20'?rangeHigh(rows):rangeLow(rows);
      value=id==='technical.breakout20'?last.c>threshold:last.c<threshold;
      details={threshold,baselineCount:20,currentExcludedFromBaseline:true};
    }else if(id==='technical.bollingerUpper20')value=bollinger().upper;
    else if(id==='technical.bollingerLower20')value=bollinger().lower;
    else if(id==='technical.bollingerPosition20'){
      const {lower,upper}=bollinger();
      if(upper===lower)return {value:null,status:'missing_data',reason:'The 20-session Bollinger band has zero width.',details:{standardDeviation:0}};
      value=(last.c-lower)/(upper-lower)*100;
    }else if(id==='technical.stochasticK14'){
      const rows=latestBars(14),high=rangeHigh(rows),low=rangeLow(rows);
      if(high===low)return {value:null,status:'missing_data',reason:'The 14-session high/low range is zero.',details:{high,low}};
      value=(last.c-low)/(high-low)*100;details={high,low};
    }else if(id==='technical.obv'){
      value=0;
      for(let i=1;i<count;i++)value+=Math.sign(bars[i].c-bars[i-1].c)*bars[i].v;
      if(Math.abs(value)>Number.MAX_SAFE_INTEGER)return {value:null,status:'missing_data',reason:'Cumulative volume exceeds supported numeric precision.',details:{}};
      details={initialValue:0,historyStart:bars[0].session,historyDependent:true};
    }
    if(typeof value!=='boolean'&&!finite(value))return {value:null,status:'missing_data',reason:'The supplied inputs did not produce a finite calculation.',details};
    return {value:Object.is(value,-0)?0:value,status:'available',reason:null,details};
  };
  return new Map(TECHNICAL_DEFINITIONS.map(def=>{
    if(count<def.minimumBars)return [def.id,{value:null,status:count?'insufficient_data':'missing_data',
      reason:count?`Need ${def.minimumBars} completed bars; ${count} available.`:'No usable completed-session bars are available.',details:{}}];
    return [def.id,calculate(def)];
  }));
}

/** Pure metrics. `fetchedAt` is supplied retrieval metadata, not invented event time. */
export function buildTechnicalMetrics(rawBars,{
  symbol,source='ALPACA_IEX',fetchedAt,now=Date.now(),adjustment='unspecified'
}={}) {
  const clock=new Date(typeof now==='function'?now():now);
  if(!Number.isFinite(+clock))throw new TypeError('A valid research calculation clock is required');
  const {bars,inputQuality}=normalizeBars(rawBars,etDate.format(clock));
  const values=calculateAll(bars),previousValues=calculateAll(bars.slice(0,-1));
  const last=bars.at(-1),previous=bars.at(-2);
  const safeSymbol=typeof symbol==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)?symbol:null;
  const safeSource=typeof source==='string'&&/^[A-Z0-9_ .:/-]{1,80}$/i.test(source)?source:'UNKNOWN';
  const availableAt=validEventTimestamp(fetchedAt)?fetchedAt:null;
  const declaredAdjustment=['raw','split','dividend','all','unspecified'].includes(adjustment)?adjustment:'unspecified';
  const observations=TECHNICAL_DEFINITIONS.map(def=>{
    const result=values.get(def.id),prior=previousValues.get(def.id);
    const historyDependent=/^technical\.ema|^technical\.macd|^technical\.obv/.test(def.id);
    const windowStart=historyDependent?bars[0]:bars[Math.max(0,bars.length-def.minimumBars)];
    return {id:def.id,value:result.value,status:result.status,reason:result.reason,unit:def.unit,
      source:safeSource,asOf:last?.t??null,availableAt,periodStart:windowStart?.session??null,periodEnd:last?.session??null,
      methodVersion:VERSION,sampleCount:bars.length,requiredCount:def.minimumBars,
      details:{symbol:safeSymbol,...result.details,previousValue:prior.value,previousStatus:prior.status,
        previousAsOf:previous?.t??null,previousPeriodEnd:previous?.session??null,
        adjustment:declaredAdjustment,inputQuality:inputQuality.validation}};
  });
  return {observations,asOf:last?.t??null,inputQuality,
    methodology:{version:VERSION,sessionTimezone:'America/New_York',completionPolicy:inputQuality.completionPolicy,
      ema:'SMA seeded; alpha 2/(period+1); depends on loaded history.',
      rsi14:'Simple rolling 14-return gains/losses; flat RSI=50; not Wilder smoothing.',
      atr14:'Simple mean of 14 true ranges; not Wilder smoothing.',
      bollinger:'20-session close population standard deviation; bands SMA ± 2σ.',
      yearWindow:'252 usable supplied sessions is an approximate 52-week window.',
      duplicatePolicy:'Identical same-session OHLCV collapses; conflicting same-session values are excluded.',
      declaredAdjustment,adjustmentVerified:false,
      adjustmentPolicy:'Prices are used as supplied; no split/dividend adjustment or total-return series is inferred.',
      limitations:['Only supplied dated US-equity daily bars are evaluated.','Holiday/early-close calendars and missing sessions are not reconstructed.','Current ET date is excluded even after regular close.','Available values from partially rejected input may have incomplete coverage.']},
    series:bars.slice(-SERIES_LIMIT).map(bar=>({...bar}))};
}
