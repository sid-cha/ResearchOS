import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildResearchDebate} from '../lib/research-agent-desk.mjs';
import {auditResearchRun,createResearchValidation,createResearchValidationApi,
 VALIDATION_RULE,OUTCOME_PROTOCOL} from '../lib/research-validation.mjs';

const T0='2026-11-14T00:00:00.000Z',T1='2026-11-15T00:00:00.000Z',
 T2='2026-11-16T00:00:01.000Z';
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ref={ref:'EV-1',id:'USGS:quake9',source:'USGS',family:'climate',type:'EARTHQUAKE',
 title:'Local observation M5.2',eventTime:'2026-11-13T23:00:00.000Z',
 providerUpdatedAt:'2026-11-13T23:30:00.000Z',firstObservedAt:T0,
 lastRevisionCapturedAt:T0,sourceUrl:'https://earthquake.usgs.gov/earthquakes/eventpage/quake9',
 revision:1,sourceLinkVerified:true,issuerExposureVerified:false,financialImpactVerified:false};
function makeRun(){
 const debate=buildResearchDebate({evidence:[ref],focus:ref,asOf:T0});
 const core={id:'desk-00000000-0000-4000-8000-000000000001',createdAt:T0,
  asOf:T0,mode:'deterministic',evidence:[ref],debate};
 return {...core,integrity:SHA(core)};
}
async function setup(t,{run=makeRun(),maxEntries=500}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-validation-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'validation-journal.json');
 let current=T1;
 const desk={get:async id=>{
  if(id!==run.id)throw Object.assign(Error('Research run not found'),{status:404});
  return structuredClone(run);
 },runs:async()=>({runs:[]})};
 const service=createResearchValidation({desk,filename,maxEntries,now:()=>current});
 return {service,desk,filename,run,setNow:date=>{current=date;}};
}
const registration=run=>({runId:run.id,question:'Will a documented outage affect the selected area?',
 operationalCriterion:'At least one independently documented operational outage at a named public facility, with an external dated record.',
 horizonDays:1,signalTag:'CANDIDATE'});
const label=(run,registrationId,reviewer,decision='OBSERVED')=>({
 runId:run.id,registrationId,reviewer,decision,
 rationale:'The dated primary notice identifies the affected facility and operation in the registered window.',
 evidenceUrl:'https://www.sec.gov/Archives/edgar/data/123/filing.html',evidencePublishedAt:T1});
const pairReview=(run,pairId,reviewer,decision='INSUFFICIENT_EVIDENCE')=>({
 runId:run.id,pairId,reviewer,decision,
 rationale:'Current source records do not identify any relevant company facility or independently attributed consequence.',
 evidenceRefIds:['EV-1']});

test('rule audits every v0.34 assertion separately and cannot confuse traceability with truth',()=>{
 const run=makeRun(),audit=auditResearchRun(run);
 assert.equal(audit.ruleVersion,VALIDATION_RULE);
 assert.equal(audit.runIntegrity,run.integrity);
 assert.equal(audit.pairs.length,1);
 assert(audit.claims.length>=7);
 const analyst=audit.claims.find(c=>c.id==='transmission_analyst.hypothesis.0');
 const challenger=audit.claims.find(c=>c.id==='anti_agent.hypothesis.0');
 assert.equal(analyst.traceabilityScore,85);
 assert.equal(analyst.evidenceStatus,'UNVERIFIED_HYPOTHESIS');
 assert.equal(analyst.independentlyVerified,false);
 assert.equal(analyst.probability,null);
 assert.equal(challenger.traceabilityScore,0);
 assert(challenger.flags.includes('NO_EVIDENCE_REFERENCE'));
 assert.equal(audit.pairs[0].semanticContradictionVerified,false);
 assert.match(audit.disclosure,/do not measure accuracy/);
});
test('local immutable journal supports separate adversarial assessments and hides first decision',async t=>{
 const h=await setup(t),audit=await h.service.runAudit(h.run.id);
 const pair=audit.pairs[0].id;
 let result=await h.service.reviewPair(pairReview(h.run,pair,'Analyst_A','SUPPORTS_CHALLENGER'));
 assert.equal(result.review.count,1);
 assert.equal(result.review.status,'AWAITING_SECOND_REVIEW');
 assert.equal(result.review.agreedDecision,null);
 let single=await h.service.runAudit(h.run.id);
 assert.equal(single.pairs[0].review.agreedDecision,null);
 await assert.rejects(h.service.reviewPair(pairReview(h.run,pair,'analyst_a','SUPPORTS_ANALYST')),{status:409});
 await assert.rejects(h.service.reviewPair({...pairReview(h.run,pair,'Analyst_B'),evidenceRefIds:['EV-99']}),{status:400});
 result=await h.service.reviewPair(pairReview(h.run,pair,'Analyst_B','SUPPORTS_CHALLENGER'));
 assert.equal(result.review.status,'TWO_ALIASES_AGREE_UNVERIFIED');
 assert.equal(result.review.agreedDecision,'SUPPORTS_CHALLENGER');
 assert.equal(result.review.evidenceIndependentlyVerified,false);
 await assert.rejects(h.service.reviewPair(pairReview(h.run,pair,'ReviewerC')),{status:409});
 await h.service.close();
 const restarted=createResearchValidation({desk:h.desk,filename:h.filename,now:()=>T2});
 assert.equal((await restarted.runAudit(h.run.id)).pairs[0].review.count,2);
 assert.equal((await restarted.runAudit(h.run.id)).pairs[0].review.status,'TWO_ALIASES_AGREE_UNVERIFIED');
});
test('different reviewer assessments produce DISPUTED rather than synthesized endorsement',async t=>{
 const h=await setup(t),pair=(await h.service.runAudit(h.run.id)).pairs[0].id;
 await h.service.reviewPair(pairReview(h.run,pair,'Alice','SUPPORTS_ANALYST'));
 const result=await h.service.reviewPair(pairReview(h.run,pair,'Bob','SUPPORTS_CHALLENGER'));
 assert.equal(result.review.status,'DISPUTED');
 assert.equal(result.review.agreedDecision,null);
});
test('outcome registration freezes question and starts horizon at registration, never backdated to old event',async t=>{
 const h=await setup(t);
 const result=await h.service.register(registration(h.run));
 assert.equal(result.registeredAt,T1);
 assert.equal(result.windowEndsAt,'2026-11-16T00:00:00.000Z');
 assert.equal(result.status,'REGISTERED_NO_OUTCOME');
 assert.equal(result.independentlyVerified,false);
 assert.equal((await h.service.runAudit(h.run.id)).outcome.registeredAt,T1);
 await assert.rejects(h.service.register(registration(h.run)),{status:409});
 await assert.rejects(h.service.labelOutcome(label(h.run,result.registrationId,'Reviewer1')),{status:409});
 const report=await h.service.report();
 assert.equal(report.registered,1);
 assert.equal(report.awaitingTwoReviewers,1);
 assert.equal(report.validatedFalsePositiveRate,null);
 assert.equal(report.measuredPrecision,null);
});
test('two dated manual outcome attestations are blinded until agreement and remain unverified',async t=>{
 const h=await setup(t),reg=await h.service.register(registration(h.run));
 h.setNow(T2);
 let first=await h.service.labelOutcome(label(h.run,reg.registrationId,'Reviewer_A'));
 assert.equal(first.status,'AWAITING_SECOND_REVIEW');
 assert.equal(first.agreedLabel,null);
 assert.equal((await h.service.runAudit(h.run.id)).outcome.agreedLabel,null);
 await assert.rejects(h.service.labelOutcome(label(h.run,reg.registrationId,'reviewer_a')),{status:409});
 first=await h.service.labelOutcome(label(h.run,reg.registrationId,'Reviewer_B'));
 assert.equal(first.status,'TWO_ALIASES_AGREE_UNVERIFIED');
 assert.equal(first.agreedLabel,'OBSERVED');
 assert.equal(first.independentlyVerified,false);
 const audit=await h.service.runAudit(h.run.id);
 assert.equal(audit.outcome.status,'TWO_ALIASES_AGREE_UNVERIFIED');
 assert.equal(audit.outcome.evidenceIndependentlyVerified,false);
 const report=await h.service.report();
 assert.equal(report.registered,1);
 assert.equal(report.agreedUnverified,1);
 assert.equal(report.descriptiveCounts.candidateObserved,1);
 assert.equal(report.predictionAccuracy,null);
 assert.equal(report.validatedFalsePositiveRate,null);
});
test('disputed outcomes never enter agreed descriptive candidate or control counts',async t=>{
 const h=await setup(t),reg=await h.service.register({...registration(h.run),signalTag:'CONTROL'});
 h.setNow(T2);
 await h.service.labelOutcome(label(h.run,reg.registrationId,'IndA','OBSERVED'));
 const out=await h.service.labelOutcome(label(h.run,reg.registrationId,'IndB','NOT_OBSERVED'));
 assert.equal(out.status,'DISPUTED');
 const r=await h.service.report();
 assert.equal(r.disputed,1);
 assert.equal(r.agreedUnverified,0);
 assert.equal(r.descriptiveCounts.controlObserved,0);
});
test('outcome evidence forbids local URLs, future publication dates, and preregistration backfill',async t=>{
 const h=await setup(t),reg=await h.service.register(registration(h.run));
 h.setNow(T2);
 await assert.rejects(h.service.labelOutcome({...label(h.run,reg.registrationId,'ReviewerA'),
  evidenceUrl:'http://127.0.0.1/private'}),{status:400});
 await assert.rejects(h.service.labelOutcome({...label(h.run,reg.registrationId,'ReviewerA'),
  evidenceUrl:'https://localhost/private'}),{status:400});
 await assert.rejects(h.service.labelOutcome({...label(h.run,reg.registrationId,'ReviewerA'),
  evidencePublishedAt:'2026-11-19T00:00:00.000Z'}),{status:400});
 await assert.rejects(h.service.labelOutcome({...label(h.run,reg.registrationId,'ReviewerA'),
  evidencePublishedAt:'2026-11-14T23:00:00.000Z'}),{status:400});
 assert.equal((await h.service.runAudit(h.run.id)).outcome.reviewsReceived,0);
});
test('tamper detection on reviewer journal is fail-closed before reloading decisions',async t=>{
 const h=await setup(t);
 await h.service.register(registration(h.run));
 const content=await readFile(h.filename,'utf8');
 await writeFile(h.filename,content.replace('CANDIDATE','CONTROL'));
 const reopened=createResearchValidation({desk:h.desk,filename:h.filename,now:()=>T2});
 await assert.rejects(reopened.runAudit(h.run.id),{status:500});
 await assert.rejects(reopened.report(),{status:500});
});
test('journal limits do not evict existing preregistration and credentials are never written',async t=>{
 const h=await setup(t,{maxEntries:1});
 await h.service.register(registration(h.run));
 const pair=(await h.service.runAudit(h.run.id)).pairs[0].id;
 await assert.rejects(h.service.reviewPair(pairReview(h.run,pair,'First')),{status:409});
 const raw=await readFile(h.filename,'utf8');
 assert(raw.includes('registrationBasis'));
 assert(!raw.includes('APCA_API_SECRET_KEY'));
 assert(!raw.includes('RESEARCH_LOCAL_LLM'));
});
test('local validation HTTP requires write-intent header and rejects cross-origin and extra fields',async t=>{
 const h=await setup(t);
 const handle=createResearchValidationApi({service:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/agent-validation/';
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'report')).status,200);
 assert.equal((await fetch(url+'run?id='+h.run.id)).status,200);
 assert.equal((await fetch(url+'run?id=../../.env')).status,400);
 const body=JSON.stringify(registration(h.run));
 assert.equal((await fetch(url+'register',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url+'register',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Validation':'1',
   Origin:'https://attacker.invalid'},body})).status,403);
 assert.equal((await fetch(url+'register',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Validation':'1'},
  body:JSON.stringify({...registration(h.run),secret:'arbitrary'})})).status,400);
 const result=await fetch(url+'register',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Validation':'1'},body});
 assert.equal(result.status,200);
 assert.equal((await result.json()).windowEndsAt,'2026-11-16T00:00:00.000Z');
 assert.equal((await fetch(url+'register',{method:'GET'})).status,404);
});
test('validation UI is packaged as explicit public assets, with no private journal or model credentials',async()=>{
 const read=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,nav,server,build]=await Promise.all([
  read('agent-validation.html'),read('agent-validation.js'),read('hierarchy-navigation.js'),
  read('server.mjs'),read('scripts/build-static.mjs')]);
 for(const id of ['validationRun','claimAuditRows','validationPair','registerOutcomeForm',
  'outcomeReviewForm','validationReport','prospective-protocol'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/agent-validation/'));
 assert(nav.includes("href:'/agent-validation.html'"));
 assert(server.includes('createResearchValidationApi'));
 assert(build.includes("'agent-validation.js'"));
 assert(!html.includes('APCA_API_SECRET_KEY'));
 assert.equal(OUTCOME_PROTOCOL,'PROSPECTIVE-DUAL-REVIEW-0.35.1');
});
