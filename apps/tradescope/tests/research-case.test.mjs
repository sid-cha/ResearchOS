import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCaseStore} from '../lib/cases.mjs';
import {buildBrief} from '../lib/assistant.mjs';

test('research investigation retains bounded metric provenance and builds a source-backed brief after restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'research-case-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const filename=join(directory,'cases.json'),store=createCaseStore(filename);
 const observation={id:'technical.sma200',value:123.45,status:'available',unit:'USD',source:'ALPACA_IEX',asOf:'2026-11-11',availableAt:'2026-11-12T18:00:00Z',periodEnd:'2026-11-11',methodVersion:'technical-v1',sampleCount:320,requiredCount:200,secret:'DO_NOT_PERSIST',details:{rawBars:[1,2,3]}};
 const saved=await store.create({symbol:'MSFT',event:{id:'research:trend:fixture',source:'TradeScope Research Rules',headline:'Price above 200-session SMA',category:'RESEARCH',type:'RESEARCH_CONDITION',evidenceLevel:'derived_metric_condition',symbols:['MSFT'],sourceUrl:'https://www.sec.gov/edgar/search/'},context:{research:{ruleId:'technical.trend',ruleVersion:'v1',observations:[observation,{id:'financial.currentRatio',value:null,status:'missing_data',reason:'No comparable balance sheet facts',unit:'ratio',source:'SEC_EDGAR_XBRL'}],apiKey:'DO_NOT_PERSIST'}}});
 const reopened=await createCaseStore(filename).get(saved.id),research=reopened.context.research;
 assert.equal(research.ruleId,'technical.trend');assert.equal(research.observations[0].periodEnd,'2026-11-11');
 assert.equal(reopened.relationship,'DERIVED_RESEARCH');
 assert.equal(research.observations[0].value,123.45);assert(!JSON.stringify(reopened).includes('DO_NOT_PERSIST'));assert(!JSON.stringify(reopened).includes('rawBars'));
 const brief=buildBrief(reopened);assert(brief.observations.some(item=>item.text.includes('123.45')&&item.text.includes('ALPACA_IEX')));
 assert(brief.observations.some(item=>item.text.includes('technical.trend')));
 assert(brief.observations.some(item=>item.text.includes('does not assert an external economic event')));
});

test('case restart and export retain bounded condition thresholds, crossover inputs and comparator provenance',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'research-case-evidence-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const filename=join(directory,'cases.json');
 const condition={metricId:'price.close',operator:'crosses_above',value:210,threshold:200,otherMetricId:'technical.sma200',
  previousValue:190,previousThreshold:195,passed:true,status:'triggered',reason:null,message:'Price crossed the comparable moving average.',
  source:'ALPACA_IEX',asOf:'2026-11-11',availableAt:'2026-11-12T18:00:00Z',unit:'USD',periodStart:'2026-01-02',periodEnd:'2026-11-11',
  freshnessAsOf:'2026-11-11',freshnessBasis:'asOf',priceAsOf:'2026-11-11',methodVersion:'technical-v1',sampleCount:320,requiredCount:200,
  comparisonSource:'ALPACA_IEX',comparisonAsOf:'2026-11-11',comparisonFreshnessAsOf:'2026-11-11',comparisonPriceAsOf:'2026-11-11',
  comparisonPeriodStart:'2026-01-02',comparisonPeriodEnd:'2026-11-11',rawBars:['PRIVATE_RAW_ARCHIVE'],apiKey:'PRIVATE_SECRET',details:{raw:'PRIVATE_RAW_DETAILS'}};
 const invalid={metricId:'secret.credentials',value:1,apiKey:'PRIVATE_SECRET'};
 const saved=await createCaseStore(filename).create({symbol:'MSFT',event:{id:'research:crossover:fixture',source:'TradeScope Research Rules',headline:'Price crossed the 200-session SMA',category:'RESEARCH',symbols:['MSFT']},
  context:{research:{ruleId:'technical.trend',ruleVersion:'v1',observations:[],evidence:[invalid,condition,...Array.from({length:25},(_,index)=>({...condition,operator:'gt',value:index}))]}}});
 const reopened=await createCaseStore(filename).get(saved.id),evidence=reopened.context.research.evidence;
 assert.equal(evidence.length,19); // Only the first twenty submitted entries are considered; invalid entries are discarded.
 const first=evidence[0];
 for(const key of ['metricId','operator','value','threshold','otherMetricId','previousValue','previousThreshold','passed','status','message','source','asOf','availableAt','unit','periodStart','periodEnd','freshnessAsOf','freshnessBasis','priceAsOf','methodVersion','sampleCount','requiredCount','comparisonSource','comparisonAsOf','comparisonFreshnessAsOf','comparisonPriceAsOf','comparisonPeriodStart','comparisonPeriodEnd'])assert.equal(first[key],condition[key],key);
 const exported=JSON.stringify(reopened),persisted=await readFile(filename,'utf8');
 assert(!Object.hasOwn(first,'details'));
 for(const text of ['PRIVATE_SECRET','PRIVATE_RAW_ARCHIVE','PRIVATE_RAW_DETAILS','rawBars','apiKey','secret.credentials']){
  assert(!exported.includes(text),text);assert(!persisted.includes(text),text);
 }
});

test('brief recognizes captured research groups without false legacy snapshot gaps',()=>{
 const observation=(id,value,status='available')=>({id,value,status,unit:'ratio',source:id.startsWith('financial.')?'SEC_EDGAR_XBRL':'ALPACA_IEX',asOf:'2026-11-11',methodVersion:'research-v1'});
 const record=observations=>({id:'CASE-test',symbol:'MSFT',event:{source:'TradeScope Research Rules',category:'RESEARCH',symbols:['MSFT']},context:{research:{observations}}});
 const brief=buildBrief(record([observation('technical.sma200',123.45),observation('financial.currentRatio',2.1)]));
 assert(!brief.gaps.some(item=>item.text.includes('No actual technical-bar snapshot')));
 assert(!brief.gaps.some(item=>item.text.includes('No comparable SEC quarterly financial snapshot')));
 assert(brief.observations.some(item=>item.text.includes('technical.sma200')&&item.text.includes('123.4500')));
 assert(brief.observations.some(item=>item.text.includes('financial.currentRatio')&&item.text.includes('2.1000')));
 const missing=buildBrief(record([observation('technical.rsi14',null,'insufficient_data'),observation('financial.currentRatio',null,'missing_data')]));
 assert(missing.gaps.some(item=>item.text.includes('No actual technical-bar snapshot')));
 assert(missing.gaps.some(item=>item.text.includes('No comparable SEC quarterly financial snapshot')));
 assert(missing.gaps.some(item=>item.text.includes('2 captured research metrics were unavailable')));
});
