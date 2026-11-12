import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createResearchStore} from '../lib/research-store.mjs';
import {evaluateRule} from '../lib/research-rules.mjs';

const time='2026-11-12T20:00:00Z';
const rule={id:'technical.activity',name:'Completed high activity',description:'Controlled research condition',match:'all',conditions:[{metricId:'technical.relativeVolume20',operator:'gt',value:2}]};
const observation=(value=3,asOf='2026-11-11')=>({id:'technical.relativeVolume20',value,status:'available',asOf,availableAt:time,source:'ALPACA_IEX',unit:'ratio',methodVersion:'fixture-v1',sampleCount:252,requiredCount:21});
const result=(value=3,asOf='2026-11-11',options={})=>evaluateRule(rule,{symbol:'AAPL',observations:[observation(value,asOf)],now:time,...options});
async function setup(t,options){const directory=await mkdtemp(join(tmpdir(),'research-domain-'));t.after(()=>rm(directory,{recursive:true,force:true}));const filename=join(directory,'research.json');return {filename,store:createResearchStore(filename,options)};}

test('saved screens persist across restart, drop unknown fields and enforce optimistic revision updates/deletes',async t=>{
  const {filename,store}=await setup(t);
  const created=await store.saveScreen({...rule,id:undefined,symbols:['AAPL'],secret:'do-not-retain',expectedRevision:99},{now:time});
  assert.match(created.id,/^SCREEN-/);assert.equal(created.revision,1);assert.equal(created.secret,undefined);
  assert.equal((await store.listScreens()).length,1);
  const reopened=await createResearchStore(filename).getScreen(created.id);assert.deepEqual(reopened,created);
  await assert.rejects(store.saveScreen({...rule,id:created.id},{expectedRevision:0}),{status:409});
  const updated=await store.saveScreen({...rule,id:created.id,name:'Updated screen'},{expectedRevision:1,now:'2026-11-12T20:01:00Z'});
  assert.equal(updated.revision,2);assert.equal(updated.createdAt,created.createdAt);assert.equal(updated.symbols,undefined,'removing a saved scope must not retain the previous restriction');
  await assert.rejects(store.deleteScreen(created.id,{expectedRevision:1}),{status:409});
  assert.deepEqual(await store.deleteScreen(created.id,{expectedRevision:2}),{id:created.id,deleted:true});
  assert.deepEqual(await createResearchStore(filename).listScreens(),[]);
  assert(!String(await readFile(filename,'utf8')).includes('do-not-retain'));
  const mode=(await stat(filename)).mode&0o777;if(process.platform!=='win32')assert.equal(mode,0o600);
});

test('concurrent screen mutations serialize and allow only one writer at the same revision',async t=>{
  const {store}=await setup(t);
  const created=await store.saveScreen({...rule,id:undefined});
  const outcomes=await Promise.allSettled([
    store.saveScreen({...created,name:'Writer A'},{expectedRevision:1}),
    store.saveScreen({...created,name:'Writer B'},{expectedRevision:1})
  ]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(outcomes.find(item=>item.status==='rejected').reason.status,409);
  assert.equal((await store.getScreen(created.id)).revision,2);
});

test('alert identity survives restart and repeated polls do not create duplicate alerts',async t=>{
  const {filename,store}=await setup(t);
  const evaluation=result();evaluation.secret='never-save-this';evaluation.evidence[0].rawProvider={secret:'opaque-provider-payload'};
  const first=await store.recordEvaluation(evaluation,{now:time});
  assert.equal(first.created,true);assert.equal(first.action,'created');assert.equal(first.alert.status,'active');
  assert.equal(first.alert.evidence[0].value,3);assert.equal(first.alert.evidence[0].threshold,2);
  assert.equal(first.alert.ruleName,rule.name);assert.equal(first.alert.firstTriggeredAt,new Date(time).toISOString());assert.equal(first.alert.evaluatedAt,new Date(time).toISOString());
  const reopened=createResearchStore(filename);
  const repeated=await reopened.recordEvaluation(evaluation,{now:'2026-11-12T20:01:00Z'});
  assert.equal(repeated.action,'duplicate');assert.equal(repeated.alert.id,first.alert.id);
  assert.equal((await reopened.listAlerts()).length,1);
  const persisted=String(await readFile(filename,'utf8'));
  assert(!persisted.includes('never-save-this'));assert(!persisted.includes('opaque-provider-payload'));assert(!persisted.includes('rawProvider'));
});

test('acknowledgement, distinct triggering inputs, cooldown and recovery preserve one active episode',async t=>{
  const {store}=await setup(t);
  const first=await store.recordEvaluation(result(),{now:time});
  const acknowledged=await store.updateAlert(first.alert.id,{expectedRevision:1,status:'acknowledged'});
  assert.equal(acknowledged.status,'acknowledged');assert.equal(acknowledged.revision,2);assert(acknowledged.acknowledgedAt);
  await assert.rejects(store.updateAlert(first.alert.id,{expectedRevision:1,status:'resolved'}),{status:409});
  const updated=await store.recordEvaluation(result(4),{now:'2026-11-12T20:01:00Z'});
  assert.equal(updated.action,'cooldown');assert.equal(updated.created,false);assert.equal(updated.alert.status,'acknowledged');assert.equal(updated.alert.triggerCount,2);assert.equal(updated.alert.evidence[0].value,4);
  const unavailable=result();unavailable.status='unavailable';unavailable.triggered=null;
  assert.equal((await store.recordEvaluation(unavailable,{now:'2026-11-12T20:02:00Z'})).action,'ignored_unavailable');
  assert.equal((await store.getAlert(first.alert.id)).status,'acknowledged','missing data cannot establish recovery');
  const recovered=await store.recordEvaluation(result(1),{now:'2026-11-12T20:03:00Z'});
  assert.equal(recovered.action,'recovered');assert.equal(recovered.alert.status,'resolved');assert.equal(recovered.alert.resolutionReason,'condition_recovered');
  await assert.rejects(store.updateAlert(first.alert.id,{expectedRevision:recovered.alert.revision,status:'active'}),{status:409});
  const sameVersion=await store.recordEvaluation(result(4),{now:'2026-11-12T20:20:00Z'});
  assert.equal(sameVersion.action,'duplicate','the same old version cannot become a new fresh alert after recovery');
  const newVersion=await store.recordEvaluation(result(5),{now:'2026-11-12T20:21:00Z'});
  assert.equal(newVersion.created,true);assert.notEqual(newVersion.alert.id,first.alert.id);
});

test('historical and unavailable evaluations cannot create fresh alert records',async t=>{
  const {store}=await setup(t);
  const history=result(3,'2020-03-10',{mode:'HISTORY'});
  assert.equal(history.triggered,true);
  assert.equal((await store.recordEvaluation(history,{now:time})).action,'ignored_historical');
  const missing=evaluateRule(rule,{symbol:'AAPL',observations:[],now:time});
  assert.equal((await store.recordEvaluation(missing,{now:time})).action,'ignored_unavailable');
  assert.deepEqual(await store.listAlerts(),[]);
});

test('screen, alert and identity capacity remains bounded and resolved records are evicted first',async t=>{
  const {filename,store}=await setup(t,{maxScreens:1,maxAlerts:2,maxSeenKeys:2});
  await store.saveScreen({...rule,id:undefined});
  await assert.rejects(store.saveScreen({...rule,id:undefined,name:'Second'}),{status:409});
  const first=await store.recordEvaluation(result(3),{now:time,cooldownSeconds:0});
  await store.updateAlert(first.alert.id,{expectedRevision:1,status:'resolved'});
  const second=await store.recordEvaluation({...result(4),symbol:'MSFT'},{now:'2026-11-12T20:01:00Z',cooldownSeconds:0});
  await store.recordEvaluation({...result(5),symbol:'NVDA'},{now:'2026-11-12T20:02:00Z',cooldownSeconds:0});
  const alerts=await store.listAlerts();assert.equal(alerts.length,2);assert(!alerts.some(item=>item.id===first.alert.id));assert(alerts.some(item=>item.id===second.alert.id));
  const disk=JSON.parse(await readFile(filename,'utf8'));assert.equal(disk.seenKeys.length,2);assert.equal(disk.alerts.length,2);
});

test('malformed persisted schema is rejected without replacing the user file',async t=>{
  const {filename}=await setup(t);
  const original=JSON.stringify({schema:9,screens:[],alerts:[],seenKeys:[]});await writeFile(filename,original);
  const store=createResearchStore(filename);
  await assert.rejects(store.listScreens(),{status:500});
  assert.equal(await readFile(filename,'utf8'),original);
});

test('invalid evaluations and unsafe screen payloads are rejected before persistence',async t=>{
  const {store}=await setup(t);
  assert.throws(()=>store.recordEvaluation({...result(),evaluatedAt:null}),{status:400});
  assert.throws(()=>store.recordEvaluation({...result(),evidence:[]}),{status:400});
  assert.throws(()=>store.saveScreen({...rule,id:undefined,conditions:[{metricId:'technical.rsi14',operator:'eval',value:'process.env'}]}),{status:400});
  assert.throws(()=>store.listAlerts({status:'unknown'}),{status:400});
});

test('stored financial evidence retains fiscal/price provenance and a new fetch alone is not a new input',async t=>{
  const {filename,store}=await setup(t);
  const condition={id:'financial.growth-check',name:'Growth observation',conditions:[{metricId:'financial.revenueGrowthYoYPct',operator:'gt',value:10}]};
  const observed={id:'financial.revenueGrowthYoYPct',value:20,status:'available',source:'SEC_EDGAR_XBRL',unit:'percent',asOf:'2026-11-12',availableAt:time,periodStart:'2026-07-01',periodEnd:'2026-09-30',methodVersion:'financial-v1',sampleCount:2,requiredCount:2};
  const first=evaluateRule(condition,{symbol:'AAPL',observations:[observed],now:time});
  const stored=await store.recordEvaluation(first,{now:time});assert.equal(stored.created,true);
  const next=evaluateRule(condition,{symbol:'AAPL',observations:[{...observed,asOf:'2026-11-13',availableAt:'2026-11-13T20:00:00Z'}],now:'2026-11-13T20:00:00Z'});
  assert.equal((await store.recordEvaluation(next,{now:'2026-11-13T20:00:00Z'})).action,'duplicate');
  const reopened=await createResearchStore(filename).getAlert(stored.alert.id);
  assert.equal(reopened.evidence[0].asOf,'2026-11-12');assert.equal(reopened.evidence[0].freshnessAsOf,'2026-09-30');
  assert.equal(reopened.evidence[0].periodStart,'2026-07-01');assert.equal(reopened.evidence[0].periodEnd,'2026-09-30');
  const old=evaluateRule(condition,{symbol:'MSFT',observations:[{...observed,periodEnd:'2020-09-30'}],now:time});
  assert.equal((await store.recordEvaluation(old,{now:time})).action,'ignored_unavailable');
  assert.equal((await store.listAlerts()).length,1);
  const valuation={id:'valuation.price-check',name:'Valuation observation',conditions:[{metricId:'valuation.peTTM',operator:'lt',value:25}]};
  const price=evaluateRule(valuation,{symbol:'AAPL',observations:[{...observed,id:'valuation.peTTM',value:20,source:'SEC_EDGAR_XBRL + ALPACA_IEX',details:{priceAsOf:'2026-11-11'}}],now:time});
  const saved=await store.recordEvaluation(price,{now:time});assert.equal(saved.alert.evidence[0].priceAsOf,'2026-11-11');
  assert.equal((await createResearchStore(filename).getAlert(saved.alert.id)).evidence[0].priceAsOf,'2026-11-11');
});
