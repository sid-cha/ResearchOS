import test from 'node:test';
import assert from 'node:assert/strict';
import {TECHNICAL_DEFINITIONS,buildTechnicalMetrics} from '../lib/research-technical.mjs';

const options={symbol:'AAPL',source:'ALPACA_IEX',fetchedAt:'2026-11-12T20:00:00Z',now:Date.parse('2026-11-12T20:00:00Z'),adjustment:'all'};
function sessions(count,start='2024-01-02'){
  const result=[],date=new Date(start+'T00:00:00Z');
  while(result.length<count){const weekday=date.getUTCDay();if(weekday!==0&&weekday!==6)result.push(date.toISOString().slice(0,10));date.setUTCDate(date.getUTCDate()+1);}
  return result;
}
const bars=(count,{start='2024-01-02',base=100,step=1,volume=1000}={})=>sessions(count,start).map((t,index)=>{
  const close=base+step*index;return {t,o:close,h:close+2,l:close-2,c:close,v:volume};
});
const metrics=(source,extra={})=>buildTechnicalMetrics(source,{...options,...extra});
const indexed=result=>Object.fromEntries(result.observations.map(metric=>[metric.id,metric]));
const near=(actual,expected,tolerance=1e-9)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('metric catalog is unique, versioned and describes data requirements',()=>{
  assert.equal(TECHNICAL_DEFINITIONS.length,33);
  assert.equal(new Set(TECHNICAL_DEFINITIONS.map(def=>def.id)).size,33);
  for(const def of TECHNICAL_DEFINITIONS){
    assert.equal(def.group,'Technicals');assert.equal(def.methodVersion,'research-technicals-v1');
    assert(def.minimumBars>=1);assert(def.inputs.length);assert(def.description.length>20);
  }
  const catalog=Object.fromEntries(TECHNICAL_DEFINITIONS.map(def=>[def.id,def]));
  assert.equal(catalog['technical.sma200'].minimumBars,200);
  assert.equal(catalog['technical.return252dPct'].minimumBars,253);
  assert.equal(catalog['technical.breakout20'].unit,'boolean');
  assert.match(catalog['technical.rsi14'].description,/not Wilder/);
  assert.throws(()=>{TECHNICAL_DEFINITIONS[0].id='changed';},TypeError);
});

test('linear completed history gives known averages, seeded EMAs, MACD, ATR and returns',()=>{
  const result=metrics(bars(280)),m=indexed(result);
  assert.equal(m['price.close'].value,379);
  for(const [period,expected] of [[20,369.5],[50,354.5],[200,279.5]]){
    near(m[`technical.sma${period}`].value,expected);
    near(m[`technical.ema${period}`].value,expected);
    near(m[`technical.distanceSma${period}Pct`].value,(379/expected-1)*100);
  }
  assert.equal(m['technical.rsi14'].value,100);
  near(m['technical.macd'].value,7);near(m['technical.macdSignal'].value,7);near(m['technical.macdHistogram'].value,0);
  assert.equal(m['technical.atr14'].value,4);near(m['technical.atrPct'].value,4/379*100);
  assert.equal(m['technical.relativeVolume20'].value,1);
  near(m['technical.return1dPct'].value,(379/378-1)*100);
  near(m['technical.return5dPct'].value,(379/374-1)*100);
  near(m['technical.return20dPct'].value,(379/359-1)*100);
  near(m['technical.return63dPct'].value,(379/316-1)*100);
  near(m['technical.return252dPct'].value,(379/127-1)*100);
  assert.equal(m['technical.high252'].value,381);assert.equal(m['technical.low252'].value,126);
  assert.equal(m['technical.obv'].value,279000);
  assert.equal(m['price.close'].source,'ALPACA_IEX');assert.equal(m['price.close'].availableAt,options.fetchedAt);
  assert.equal(m['price.close'].periodEnd,bars(280).at(-1).t);
  assert.equal(m['technical.sma20'].sampleCount,280);assert.equal(m['technical.sma20'].requiredCount,20);
});

test('Bollinger bands use population deviation and stochastic uses reported ranges',()=>{
  const source=bars(20,{base:1,step:1});
  for(const row of source){row.h=row.c+0.5;row.l=row.c-0.5;}
  const m=indexed(metrics(source)),deviation=Math.sqrt(33.25),upper=10.5+2*deviation,lower=10.5-2*deviation;
  near(m['technical.bollingerUpper20'].value,upper);
  near(m['technical.bollingerLower20'].value,lower);
  near(m['technical.bollingerPosition20'].value,(20-lower)/(upper-lower)*100);
  near(m['technical.stochasticK14'].value,(20-6.5)/(20.5-6.5)*100);
  assert.match(m['technical.bollingerUpper20'].methodVersion,/v1$/);
});

test('insufficient sample counts are explicit and previous values support crossing evaluation',()=>{
  const m=indexed(metrics(bars(181)));
  assert.equal(m['technical.sma200'].status,'insufficient_data');assert.equal(m['technical.sma200'].value,null);
  assert.equal(m['technical.sma200'].sampleCount,181);assert.equal(m['technical.sma200'].requiredCount,200);
  assert.match(m['technical.sma200'].reason,/200 completed bars; 181/);
  assert.equal(m['technical.high252'].value,null);
  const ready=indexed(metrics(bars(200)));
  assert.equal(ready['technical.sma200'].status,'available');assert.equal(ready['technical.sma200'].details.previousValue,null);
  assert.equal(ready['technical.sma200'].details.previousStatus,'insufficient_data');
  const later=indexed(metrics(bars(201)));
  near(later['technical.sma200'].details.previousValue,199.5);
  assert.equal(later['technical.sma200'].details.previousPeriodEnd,bars(201).at(-2).t);
  const signal=indexed(metrics(bars(34)));
  assert.equal(signal['technical.macd'].status,'available');assert.equal(signal['technical.macdSignal'].status,'available');
  assert.equal(signal['technical.macdSignal'].details.previousStatus,'insufficient_data');
});

test('current and future ET sessions are excluded and timestamps are calendar validated',()=>{
  const row={o:100,h:101,l:99,c:100,v:1000};
  const result=metrics([
    {...row,t:'2026-11-11T00:00:00-05:00'},
    {...row,t:'2026-11-12T05:00:00Z'},
    {...row,t:'2026-11-13T05:00:00Z'},
    {...row,t:'2026-11-08'},
    {...row,t:'2026-02-29T05:00:00Z'},
    {...row,t:'2026-11-10T00:00:00'}
  ],{now:Date.parse('2026-11-13T02:00:00Z')}); // Still November 12 in ET.
  assert.equal(result.series.length,1);assert.equal(result.series[0].session,'2026-11-11');
  assert.equal(result.inputQuality.currentSessionBars,1);assert.equal(result.inputQuality.futureBars,1);
  assert.equal(result.inputQuality.weekendBars,1);assert.equal(result.inputQuality.malformedBars,2);
  assert.equal(result.inputQuality.rejectedBars,5);
  assert.match(result.inputQuality.calendarAssessment,/holidays.*not inferred/);
});

test('timestamp-to-session mapping follows New York rather than an arbitrary source date prefix',()=>{
  const result=metrics([{t:'2026-11-12T00:30:00+05:30',o:100,h:101,l:99,c:100,v:1000}]);
  assert.equal(result.series[0].session,'2026-11-11');
  assert.equal(result.asOf,'2026-11-12T00:30:00+05:30','original supplied instant remains available');
});

test('out-of-order dates sort, identical duplicates collapse and conflicting sessions are excluded',()=>{
  const a={t:'2026-11-09',o:100,h:102,l:98,c:100,v:1000};
  const b={...a,t:'2026-11-10',c:101};
  const c={...a,t:'2026-11-11',c:101};
  const source=[c,b,{...b},a,{...c,c:102}];
  const result=metrics(source),reversed=metrics([...source].reverse());
  assert.deepEqual(result.series,reversed.series,'unknown conflicting revisions must not depend on input order');
  assert.deepEqual(result.series.map(bar=>bar.session),['2026-11-09','2026-11-10']);
  assert.equal(result.inputQuality.conflictingSessions,1);assert.equal(result.inputQuality.duplicateBars,2);
  assert.equal(result.inputQuality.rejectedBars,3);assert.equal(indexed(result)['price.close'].value,101);
});

test('malformed numeric inputs do not enter the engine, while absent open and real zero volume stay unknown/valid',()=>{
  const good={t:'2026-11-11',o:100,h:102,l:98,c:100,v:0};
  const bad=[null,{},[],{...good,c:'100'},{...good,h:null},{...good,l:NaN},
    {...good,v:null},{...good,v:''},{...good,v:-1},{...good,v:Infinity},
    {...good,v:Number.MAX_SAFE_INTEGER+1},{...good,h:97},{...good,c:103},{...good,o:'100'}];
  const result=metrics([...bad,good]);assert.equal(result.inputQuality.usableBars,1);
  assert.equal(result.inputQuality.malformedBars,bad.length);assert.equal(result.series[0].v,0);
  const source=bars(2);delete source.at(-1).o;
  const missing=indexed(metrics(source));assert.equal(missing['technical.gapPct'].status,'missing_data');
  assert.equal(missing['technical.gapPct'].value,null);assert.match(missing['technical.gapPct'].reason,/open was not supplied/);
  assert.equal(missing['price.close'].value,101);
});

test('breakout thresholds exclude the current bar and preserve actual false conditions',()=>{
  const source=bars(21),normal=indexed(metrics(source));
  assert.equal(normal['technical.breakout20'].value,false);assert.equal(normal['technical.breakout20'].status,'available');
  const previousHigh=Math.max(...source.slice(0,-1).map(bar=>bar.h));
  source.at(-1).o=previousHigh+1;source.at(-1).c=previousHigh+2;source.at(-1).h=previousHigh+3;source.at(-1).l=previousHigh;
  const breakout=indexed(metrics(source))['technical.breakout20'];
  assert.equal(breakout.value,true);assert.equal(breakout.details.threshold,previousHigh);
  assert.equal(breakout.details.currentExcludedFromBaseline,true);
  const breakdownSource=bars(21),previousLow=Math.min(...breakdownSource.slice(0,-1).map(bar=>bar.l));
  Object.assign(breakdownSource.at(-1),{o:previousLow-1,c:previousLow-2,h:previousLow,l:previousLow-3});
  assert.equal(indexed(metrics(breakdownSource))['technical.breakdown20'].value,true);
});

test('measured zeros and flat-series conventions are distinct from undefined denominators',()=>{
  const source=bars(34,{base:50,step:0,volume:100});for(const bar of source){bar.h=50;bar.l=50;}
  const m=indexed(metrics(source));
  assert.equal(m['technical.rsi14'].value,50);assert.equal(m['technical.atr14'].value,0);
  assert.equal(m['technical.macd'].value,0);assert.equal(m['technical.macdSignal'].value,0);assert.equal(m['technical.macdHistogram'].value,0);
  assert.equal(m['technical.obv'].value,0);assert.equal(m['technical.return1dPct'].value,0);
  assert.equal(m['technical.bollingerPosition20'].value,null);assert.match(m['technical.bollingerPosition20'].reason,/zero width/);
  assert.equal(m['technical.stochasticK14'].value,null);assert.match(m['technical.stochasticK14'].reason,/range is zero/);
  source.at(-1).v=0;assert.equal(indexed(metrics(source))['technical.relativeVolume20'].value,0);
  for(const bar of source)bar.v=0;
  assert.equal(indexed(metrics(source))['technical.relativeVolume20'].value,null);
});

test('price adjustment is declared rather than inferred from a split-shaped price change',()=>{
  const source=[{t:'2026-11-10',o:100,h:102,l:98,c:100,v:1000},{t:'2026-11-11',o:50,h:52,l:48,c:50,v:2000}];
  const result=metrics(source,{adjustment:'raw'}),m=indexed(result);
  assert.equal(m['technical.gapPct'].value,-50);assert.equal(m['technical.return1dPct'].value,-50);
  assert.equal(result.methodology.declaredAdjustment,'raw');assert.equal(result.methodology.adjustmentVerified,false);
  assert.match(result.methodology.adjustmentPolicy,/no split\/dividend adjustment/);
  assert.equal(m['technical.gapPct'].details.adjustment,'raw');
});

test('series output is bounded and sanitized, and source inputs are not modified',()=>{
  const source=bars(400);source.at(-1).secret='not-public';source.at(-1).headers={Authorization:'not-public'};
  const before=structuredClone(source),result=metrics(source);
  assert.equal(result.series.length,260);assert.equal(result.inputQuality.usableBars,400);
  assert(!JSON.stringify(result).includes('not-public'));assert.deepEqual(source,before);
  assert.deepEqual(Object.keys(result.series[0]).sort(),['c','h','l','o','session','t','v']);
  result.series[0].c=999;assert.deepEqual(source,before);
  const duplicate=bars(1)[0],bounded=metrics(Array.from({length:10002},()=>({...duplicate})));
  assert.equal(bounded.inputQuality.truncatedBars,2);assert.equal(bounded.inputQuality.inspectedBars,10000);
});

test('empty inputs keep a complete unavailable catalog without invented as-of/fetch clocks',()=>{
  for(const input of [[],null,undefined,{}]){
    const result=buildTechnicalMetrics(input,{now:options.now});
    assert.equal(result.observations.length,33);assert.equal(result.asOf,null);assert.deepEqual(result.series,[]);
    assert(result.observations.every(metric=>metric.value===null&&metric.status==='missing_data'&&metric.availableAt===null));
    assert.equal(result.inputQuality.validation,Array.isArray(input)?'valid':'invalid-input');
  }
  assert.throws(()=>metrics([],{now:'not-a-clock'}),TypeError);
});
