import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_RULES,BUILTIN_SCREENS,evaluateRule,screenCompanies,validateRule,validateScreen} from '../lib/research-rules.mjs';

const clock='2026-11-12T20:00:00Z';
const metric=(id,value,overrides={})=>({id,value,status:'available',source:'ALPACA_IEX',unit:'number',asOf:'2026-11-11',availableAt:clock,methodVersion:'fixture-v1',sampleCount:252,requiredCount:20,...(id.startsWith('financial.')||id.startsWith('valuation.')?{periodEnd:'2026-09-30'}:{}),...(id.startsWith('valuation.')?{details:{priceAsOf:'2026-11-11'}}:{}),...overrides});
const condition=(metricId,operator='gt',value=0)=>({metricId,operator,value});
const definition=(conditions,match='all')=>({id:'test.conditions',name:'Controlled research conditions',description:'Deterministic test fixture',match,conditions});
const evaluate=(rule,observations,options={})=>evaluateRule(rule,{symbol:'AAPL',observations,now:clock,...options});

test('built-in conditions and screens are bounded explicit definitions with source evidence',()=>{
  assert(BUILTIN_RULES.length>=8);assert(BUILTIN_SCREENS.length>=3);
  for(const value of [...BUILTIN_RULES,...BUILTIN_SCREENS])assert.equal(validateRule(value).id,value.id);
  const rule=BUILTIN_RULES.find(value=>value.id==='technical.above-sma200');
  const result=evaluate(rule,[metric('price.close',105,{unit:'USD'}),metric('technical.sma200',100,{unit:'USD'})]);
  assert.equal(result.status,'triggered');assert.equal(result.triggered,true);
  assert.equal(result.evidence[0].value,105);assert.equal(result.evidence[0].threshold,100);
  assert.equal(result.evidence[0].source,'ALPACA_IEX');assert.equal(result.evidence[0].asOf,'2026-11-11');
  assert.equal(result.evidence[0].methodVersion,'fixture-v1');assert.equal(result.evidence[0].sampleCount,252);
  assert.match(result.interpretation,/not a directional forecast/);
});

test('three-valued all/any matching never converts missing history into a zero or a false observation',()=>{
  const known=metric('technical.macdHistogram',1);
  const unknown=metric('technical.sma200',null,{status:'insufficient_data',sampleCount:181,requiredCount:200});
  const conditions=[condition('technical.macdHistogram'),condition('technical.sma200')];
  const all=evaluate(definition(conditions),[known,unknown]);
  assert.equal(all.triggered,null);assert.equal(all.status,'warming_up');
  assert.equal(all.evidence[1].sampleCount,181);assert.equal(all.evidence[1].requiredCount,200);
  const any=evaluate(definition(conditions,'any'),[known,unknown]);assert.equal(any.triggered,true);
  const allFalse=evaluate(definition(conditions),[{...known,value:-1},unknown]);assert.equal(allFalse.triggered,false);assert.equal(allFalse.status,'ready');
  const anyUnknown=evaluate(definition(conditions,'any'),[{...known,value:-1},unknown]);assert.equal(anyUnknown.triggered,null);
});

test('available genuine zeros and booleans compare correctly, unavailable or coerced values do not',()=>{
  assert.equal(evaluate(definition([condition('technical.macdHistogram','eq',0)]),[metric('technical.macdHistogram',0)]).triggered,true);
  assert.equal(evaluate(definition([condition('technical.breakout20','eq',false)]),[metric('technical.breakout20',false,{unit:'boolean'})]).triggered,true);
  for(const value of [null,'35',NaN,Infinity,{},undefined]){
    const result=evaluate(definition([condition('technical.rsi14','lt',30)]),[metric('technical.rsi14',value)]);
    assert.equal(result.triggered,null);assert.equal(result.status,'unavailable');
  }
  const badBoolean=evaluate(definition([condition('technical.rsi14')]),[metric('technical.rsi14',true)]);
  assert.equal(badBoolean.evidence[0].reason,'type_mismatch');
});

test('age limits prevent old technical conditions becoming fresh alerts while reporting calendar uncertainty',()=>{
  const rule=definition([condition('technical.rsi14','lt',30)]);
  const observations=[metric('technical.rsi14',20,{asOf:'2026-10-01'})];
  const stale=evaluate(rule,observations);assert.equal(stale.triggered,null);assert.equal(stale.evidence[0].reason,'old_input');
  assert.match(stale.reasons[0],/market-session status is unknown/);
  const history=evaluate(rule,observations,{mode:'HISTORY'});assert.equal(history.triggered,true);assert.equal(history.mode,'HISTORY');
  assert.match(history.interpretation,/not a fresh alert/);
  const financial=evaluate(definition([condition('financial.revenueGrowthYoYPct','gt',10)]),[metric('financial.revenueGrowthYoYPct',18,{source:'SEC_EDGAR_XBRL',asOf:'2026-09-30'})]);
  assert.equal(financial.triggered,true,'reported fiscal periods use a different default age guard');
});

test('invalid/future/ambiguous input timestamps and duplicate metric identifiers cannot support a condition',()=>{
  const rule=definition([condition('technical.rsi14','lt',30)]);
  for(const override of [{asOf:'2026-02-31'},{asOf:'2026-02-31T00:00:00Z'},{asOf:'2026-11-13T20:00:00Z'},{availableAt:'2026-11-13T20:00:00Z'}]){
    const result=evaluate(rule,[metric('technical.rsi14',20,override)]);assert.equal(result.status,'unavailable');assert.equal(result.triggered,null);
  }
  const duplicate=evaluate(rule,[metric('technical.rsi14',20),metric('technical.rsi14',40)]);
  assert.equal(duplicate.evidence[0].reason,'ambiguous_metric');
});

test('crossover requires earlier comparable evidence rather than the current relationship alone',()=>{
  const rule=definition([{metricId:'price.close',operator:'crosses_above',otherMetricId:'technical.sma200'}]);
  const current=[metric('price.close',105,{unit:'USD'}),metric('technical.sma200',100,{unit:'USD'})];
  const prior=[metric('price.close',99,{unit:'USD',asOf:'2026-11-10'}),metric('technical.sma200',100,{unit:'USD',asOf:'2026-11-10'})];
  const warming=evaluate(rule,current);assert.equal(warming.status,'warming_up');assert.equal(warming.triggered,null);
  const crossed=evaluate(rule,current,{previousObservations:prior});assert.equal(crossed.triggered,true);
  assert.equal(crossed.evidence[0].previousValue,99);assert.equal(crossed.evidence[0].previousThreshold,100);
  const alreadyAbove=evaluate(rule,current,{previousObservations:[{...prior[0],value:101},prior[1]]});assert.equal(alreadyAbove.triggered,false);
  for(const changed of [{source:'OTHER_FEED'},{methodVersion:'new-method'},{asOf:'2026-11-11'}]){
    const value=evaluate(rule,current,{previousObservations:[{...prior[0],...changed},prior[1]]});assert.equal(value.triggered,null);assert.equal(value.status,'unavailable');
  }
});

test('comparison metrics must share source, units and as-of context',()=>{
  const rule=definition([{metricId:'price.close',operator:'gt',otherMetricId:'technical.sma200'}]);
  for(const changed of [{unit:'percent'},{source:'OTHER_FEED'},{asOf:'2026-11-10'}]){
    const value=evaluate(rule,[metric('price.close',105,{unit:'USD'}),metric('technical.sma200',100,{unit:'USD',...changed})]);
    assert.equal(value.status,'unavailable');assert.equal(value.triggered,null);
  }
});

test('screen results distinguish matches, nonmatches and missing-data instruments',()=>{
  const screen=definition([condition('financial.revenueGrowthYoYPct','gt',10)]);
  const result=screenCompanies([
    {symbol:'AAPL',company:'Company A',observations:[metric('financial.revenueGrowthYoYPct',20)]},
    {symbol:'MSFT',observations:[metric('financial.revenueGrowthYoYPct',5)]},
    {symbol:'SPY',observations:[]}
  ],screen,{now:clock});
  assert.equal(result.total,3);assert.equal(result.matchedCount,1);assert.equal(result.nonMatchedCount,1);assert.equal(result.unavailableCount,1);
  assert.equal(result.matches[0].symbol,'AAPL');assert.equal(result.nonMatches[0].symbol,'MSFT');assert.equal(result.unavailable[0].symbol,'SPY');
  assert.equal(result.matches[0].companyName,'Company A');
});

test('definition validation rejects executable/unknown/unbounded criteria and whitelists persistence fields',()=>{
  const rule=definition([condition('technical.rsi14','lt',30)]);
  const cleaned=validateScreen({...rule,secret:'do-not-retain',conditions:[{...rule.conditions[0],execute:'never-run'}]},{metricIds:['technical.rsi14']});
  assert.equal(cleaned.secret,undefined);assert.equal(cleaned.conditions[0].execute,undefined);
  for(const invalid of [
    {...rule,match:'eval'}, {...rule,conditions:[]}, {...rule,conditions:Array(21).fill(rule.conditions[0])},
    {...rule,conditions:[condition('technical.rsi14','eval',30)]}, {...rule,conditions:[condition('technical.rsi14','lt','30')]},
    {...rule,conditions:[{...rule.conditions[0],otherMetricId:'technical.sma200'}]},
    {...rule,symbols:Array(11).fill('AAPL')},{...rule,maxAgeDays:Infinity}
  ])assert.throws(()=>validateRule(invalid),{status:400});
  assert.throws(()=>validateScreen(rule,{metricIds:['financial.revenueTTM']}),{status:400});
  assert.throws(()=>screenCompanies([{symbol:'AAPL'},{symbol:'AAPL'}],rule),{status:400});
  assert.throws(()=>screenCompanies([null],rule),{status:400});
});

test('financial freshness uses the reported period rather than a current knowledge cutoff or fetch date',()=>{
  const rule=definition([condition('financial.revenueGrowthYoYPct','gt',10)]);
  const old=metric('financial.revenueGrowthYoYPct',20,{source:'SEC_EDGAR_XBRL',asOf:'2026-11-12',availableAt:clock,periodEnd:'2020-09-30'});
  const result=evaluate(rule,[old]);
  assert.equal(result.status,'unavailable');assert.equal(result.triggered,null);
  assert.equal(result.evidence[0].reason,'old_input');
  assert.equal(result.evidence[0].asOf,'2026-11-12');assert.equal(result.evidence[0].freshnessAsOf,'2020-09-30');
  assert.equal(result.evidence[0].freshnessBasis,'periodEnd');
  const dated=evaluate(rule,[{...old,periodEnd:'2026-09-30'}]);assert.equal(dated.triggered,true);
  const missing=evaluate(rule,[{...old,periodEnd:null,details:{knowledgeCutoff:'2026-11-12',filingDates:['2026-11-12']}}]);
  assert.equal(missing.triggered,null);assert.equal(missing.evidence[0].reason,'unknown_report_period','a recent filing/knowledge date cannot refresh an undated report');
});

test('financial fallback freshness requires actual dated input provenance and remains conservative',()=>{
  const rule=definition([condition('financial.freeCashFlowTTM','gt',0)]);
  const base=metric('financial.freeCashFlowTTM',100,{source:'SEC_EDGAR_XBRL',asOf:'2026-11-12',periodEnd:null});
  const fallback=evaluate(rule,[{...base,details:{inputs:[{periodEnd:'2026-09-30'},{periodEnd:'2025-12-31'}]}}]);
  assert.equal(fallback.triggered,true);assert.equal(fallback.evidence[0].freshnessBasis,'required_provenance');
  assert.equal(fallback.evidence[0].freshnessAsOf,'2025-12-31');
  const old=evaluate(rule,[{...base,details:{inputs:[{periodEnd:'2026-09-30'},{periodEnd:'2020-12-31'}]}}]);assert.equal(old.triggered,null);
  const unknown=evaluate(rule,[{...base,details:{inputs:[{periodEnd:null}],filingDates:['2026-11-12']}}]);assert.equal(unknown.triggered,null);
});

test('valuation conditions require independently current price and accounting provenance',()=>{
  const rule=definition([condition('valuation.peTTM','lt',20)]);
  const base=metric('valuation.peTTM',15,{source:'SEC_EDGAR_XBRL + ALPACA_IEX',asOf:'2026-11-12',periodStart:'2025-10-01',periodEnd:'2026-09-30',details:{priceAsOf:'2026-11-11'}});
  const ready=evaluate(rule,[base]);assert.equal(ready.triggered,true);
  assert.equal(ready.evidence[0].priceAsOf,'2026-11-11');assert.equal(ready.evidence[0].periodStart,'2025-10-01');
  const stale=evaluate({...rule,maxAgeDays:550},[{...base,details:{priceAsOf:'2026-09-30'}}]);
  assert.equal(stale.triggered,null);assert.equal(stale.evidence[0].reason,'old_price_input','a permissive financial-period policy does not permit an ancient price');
  const unknown=evaluate(rule,[{...base,details:{}}]);assert.equal(unknown.evidence[0].reason,'unknown_price_asof');
  const future=evaluate(rule,[{...base,details:{priceAsOf:'2026-11-13'}}]);assert.equal(future.evidence[0].reason,'future_price_input');
  const oldFacts=evaluate(rule,[{...base,periodEnd:'2020-09-30'}]);assert.equal(oldFacts.triggered,null);assert.equal(oldFacts.evidence[0].reason,'old_input');
  const tight=evaluate({...rule,maxAgeDays:1},[{...base,details:{priceAsOf:'2026-11-10'}}]);assert.equal(tight.evidence[0].reason,'old_price_input');
});

test('historical evaluation permits dated old financial and valuation data but never claims a fresh alert',()=>{
  for(const [id,details] of [['financial.revenueGrowthYoYPct',{}],['valuation.peTTM',{priceAsOf:'2020-10-01'}]]){
    const value=evaluate(definition([condition(id,'gt',0)]),[metric(id,10,{asOf:'2026-11-12',periodEnd:'2020-09-30',details})],{mode:'HISTORY'});
    assert.equal(value.triggered,true);assert.equal(value.mode,'HISTORY');assert.match(value.interpretation,/not a fresh alert/);
  }
});

test('financial metric comparisons require compatible report endpoints and duration starts',()=>{
  const rule=definition([{metricId:'financial.cash',operator:'gt',otherMetricId:'financial.debt'}]);
  const cash=metric('financial.cash',200,{asOf:'2026-11-12',periodEnd:'2026-09-30',source:'SEC_EDGAR_XBRL',unit:'USD'});
  const debt=metric('financial.debt',100,{asOf:'2026-11-12',periodEnd:'2026-06-30',source:'SEC_EDGAR_XBRL',unit:'USD'});
  const wrong=evaluate(rule,[cash,debt]);assert.equal(wrong.triggered,null);assert.equal(wrong.evidence[0].reason,'comparison_period_mismatch');
  assert.equal(wrong.evidence[0].periodEnd,'2026-09-30');assert.equal(wrong.evidence[0].comparisonPeriodEnd,'2026-06-30');
  assert.equal(evaluate(rule,[cash,{...debt,periodEnd:'2026-09-30'}]).triggered,true);
  const duration=definition([{metricId:'financial.revenueQuarter',operator:'gt',otherMetricId:'financial.netIncomeQuarter'}]);
  const revenue=metric('financial.revenueQuarter',100,{source:'SEC_EDGAR_XBRL',unit:'USD',asOf:'2026-11-12',periodStart:'2026-07-01',periodEnd:'2026-09-30'});
  const income=metric('financial.netIncomeQuarter',20,{...revenue,id:'financial.netIncomeQuarter',value:20,periodStart:'2026-04-01'});
  assert.equal(evaluate(duration,[revenue,income]).triggered,null);
  assert.equal(evaluate(duration,[revenue,{...income,periodStart:'2026-07-01'}]).triggered,true);
});

test('valuation comparisons require a shared price timestamp as well as fiscal context',()=>{
  const rule=definition([{metricId:'valuation.peTTM',operator:'gt',otherMetricId:'valuation.priceBook'}]);
  const pe=metric('valuation.peTTM',20,{source:'SEC_EDGAR_XBRL + ALPACA_IEX',asOf:'2026-11-12',periodStart:'2025-10-01',periodEnd:'2026-09-30',details:{priceAsOf:'2026-11-11'}});
  const book=metric('valuation.priceBook',5,{...pe,id:'valuation.priceBook',value:5,periodStart:null,details:{priceAsOf:'2026-11-10'}});
  const wrong=evaluate(rule,[pe,book]);assert.equal(wrong.triggered,null);assert.equal(wrong.evidence[0].reason,'comparison_price_context_mismatch');
  assert.equal(evaluate(rule,[pe,{...book,details:{priceAsOf:'2026-11-11'}}]).triggered,true);
});
