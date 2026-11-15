/**
 * v0.35 Evidence Validation / Prospective Review.
 * The score evaluates citation traceability ONLY; not truth, causality, expected return,
 * calibration, scientific independence, or a probability.
 *
 * Reviews are local, manually attested, append-only, and NEVER modify v0.34 runs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createHash,randomUUID} from 'node:crypto';

const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const RID=/^desk-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const EID=/^validation-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const alias=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{3,36}$/.test(x);
const plain=(x,n=400)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const take=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const round=x=>Math.round(x*100)/100;
const reviewKinds=['SUPPORTS_ANALYST','SUPPORTS_CHALLENGER','BOTH_PLAUSIBLE','INSUFFICIENT_EVIDENCE'];
const labelKinds=['OBSERVED','NOT_OBSERVED','INCONCLUSIVE'];
const horizonOptions=[1,7,30,90];
const publicLink=value=>{
 try{
  const u=new URL(value);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href.length>650||
   host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
   host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.example')||
   net.isIP(host)||!host.includes('.'))return null;
  return u.href;
 }catch{return null;}
};
const signedByReviewer=x=>alias(x)&&x.toLowerCase()!=='automated'&&x.toLowerCase()!=='agent';
const claimID=(stage,kind,index)=>stage+'.'+kind+'.'+index;
export const VALIDATION_RULE='EVIDENCE-AUDIT-0.35.1';
export const OUTCOME_PROTOCOL='PROSPECTIVE-DUAL-REVIEW-0.35.1';
export function auditResearchRun(run){
 if(!run||!RID.test(run.id)||!instant(run.asOf)||!Array.isArray(run.evidence)||
  !Array.isArray(run.debate?.stages))throw failure('Verified v0.34 research run required');
 const byRef=new Map(run.evidence.map(e=>[e.ref,e]));
 const claims=[];
 for(const stage of run.debate.stages){
  if(typeof stage.id!=='string')continue;
  for(const [kind,entries] of [['observation',stage.facts],['hypothesis',stage.claims]]){
   if(!Array.isArray(entries))continue;
   for(const [index,c] of entries.entries()){
    if(index>=35)break;
    const refs=Array.isArray(c.refs)?[...new Set(c.refs.filter(x=>typeof x==='string'))]:[];
    const resolved=refs.map(x=>byRef.get(x)).filter(Boolean);
    const unknown=refs.filter(x=>!byRef.has(x));
    const beforeAsOf=resolved.length>0&&resolved.every(e=>instant(e.firstObservedAt)&&
      Date.parse(e.firstObservedAt)<=Date.parse(run.asOf));
    const official=resolved.length>0&&resolved.every(e=>e.sourceLinkVerified===true&&
      typeof e.sourceUrl==='string'&&e.sourceUrl.startsWith('https://'));
    const uniqueSources=new Set(resolved.map(e=>e.source)).size;
    const score=(refs.length>0&&unknown.length===0?40:0)+
      (official?25:0)+(beforeAsOf?20:0)+(uniqueSources>=2?15:0);
    const flags=[...(refs.length===0?['NO_EVIDENCE_REFERENCE']:[]),
      ...(unknown.length?['UNKNOWN_EVIDENCE_ID']:[]),
      ...(!official?['OFFICIAL_SOURCE_NOT_CONFIRMED']:[]),
      ...(!beforeAsOf?['CAPTURE_CLOCK_NOT_VERIFIED_AT_CUTOFF']:[]),
      ...(uniqueSources<2?['NO_INDEPENDENT_PROVIDER_CORROBORATION']:[])];
    claims.push({id:claimID(stage.id,kind,index),stage:stage.id,kind,
      text:plain(c.text,1000),refs,traceabilityScore:score,
      traceabilityBand:score>=80?'HIGH_METADATA_TRACEABILITY':score>=40?'PARTIAL_METADATA_TRACEABILITY':'LOW_METADATA_TRACEABILITY',
      evidenceStatus:kind==='hypothesis'?'UNVERIFIED_HYPOTHESIS':'LOCALLY_ARCHIVED_ASSERTION',
      independentlyVerified:false,probability:null,flags,
      components:{recognizedReferenceIds:refs.length>0&&unknown.length===0,
       approvedOriginalLinks:official,availableAtResearchCutoff:beforeAsOf,
       multipleIndependentProviderIds:uniqueSources>=2}});
   }
  }
 }
 const analyst=claims.filter(c=>c.stage==='transmission_analyst'&&c.kind==='hypothesis');
 const challenger=claims.filter(c=>c.stage==='anti_agent'&&c.kind==='hypothesis');
 const pairs=analyst.flatMap(a=>challenger.slice(0,3).map(b=>({
  id:a.id+'__'+b.id,analystClaimId:a.id,challengerClaimId:b.id,
  status:'OPEN_COMPARISON',semanticContradictionVerified:false,
  note:'Pairing competing propositions does not establish a logically proven contradiction.'
 }))).slice(0,12);
 return {runId:run.id,runIntegrity:run.integrity,ruleVersion:VALIDATION_RULE,claims,pairs,
  totals:{claims:claims.length,hypotheses:claims.filter(x=>x.kind==='hypothesis').length,
   withReferences:claims.filter(x=>x.refs.length>0).length,
   highMetadataTraceability:claims.filter(x=>x.traceabilityScore>=80).length},
  disclosure:'0–100 scores measure reference IDs, approved source links, local capture clocks and number of source providers. They do not measure accuracy, certainty, investment value or independent corroboration of the claim.'};
}
function assertEntry(e,index,prior){
 if(!e||!EID.test(e.id)||e.seq!==index||e.previousHash!==prior||
   !instant(e.at)||!RID.test(e.runId)||typeof e.runIntegrity!=='string'||
   !/^[a-f0-9]{64}$/.test(e.runIntegrity)||
   !['REGISTER','REVIEW_PAIR','LABEL_OUTCOME'].includes(e.kind)||
   !e.payload||typeof e.payload!=='object')throw failure('Validation journal structure invalid',500);
 const {hash,...base}=e;
 if(hash!==digest(base))throw failure('Validation journal integrity mismatch',500);
 return hash;
}
function summaryStatus(reviews,field,positiveStatuses){
 if(reviews.length===0)return 'NOT_REVIEWED';
 if(reviews.length===1)return 'AWAITING_SECOND_REVIEW';
 if(reviews[0].payload.reviewer.toLowerCase()===reviews[1].payload.reviewer.toLowerCase())return 'REVIEWER_ALIAS_CONFLICT';
 return reviews[0].payload[field]===reviews[1].payload[field]?
   'TWO_ALIASES_AGREE_UNVERIFIED':'DISPUTED';
}
export function createResearchValidation({desk,filename,now=()=>new Date().toISOString(),
 enabled=true,maxEntries=500,maxBytes=4000000}={}){
 if(!desk?.get||!desk?.runs||typeof filename!=='string'||!path.isAbsolute(filename)||
   !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>5000||
   !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('Validation requires an existing Agent Desk and private bounded absolute journal path');
 let doc=null,loading=null,queue=Promise.resolve();
 async function load(){
  if(doc)return doc;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>maxBytes)throw failure('Validation journal exceeds bounds',500);
    const data=JSON.parse(await fs.readFile(filename,'utf8'));
    if(data?.schemaVersion!==1||!Array.isArray(data.entries)||data.entries.length>maxEntries)
     throw failure('Validation journal schema invalid',500);
    let prior='GENESIS';const idSet=new Set();
    for(const [i,e] of data.entries.entries()){
     prior=assertEntry(e,i,prior);
     if(idSet.has(e.id)||i>0&&Date.parse(e.at)<Date.parse(data.entries[i-1].at))
      throw failure('Validation journal order invalid',500);
     idSet.add(e.id);
    }
    return doc=data;
   }catch(e){
    if(e.code==='ENOENT')return doc={schemaVersion:1,entries:[]};
    throw failure('Validation journal cannot be verified',500);
   }
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serial=fn=>{
  const result=queue.then(async()=>{await load();return fn();});
  queue=result.catch(()=>{});
  return result;
 };
 const timestamp=()=>{
  const value=now();
  if(!instant(value))throw failure('Local validation clock unavailable',503);
  return value;
 };
 async function write(kind,run,payload,at){
  if(doc.entries.length>=maxEntries)throw failure('Validation journal entry capacity reached',409);
  if(doc.entries.length&&Date.parse(at)<Date.parse(doc.entries.at(-1).at))
   throw failure('Validation journal clock moved backwards',409);
  const base={id:'validation-'+randomUUID(),seq:doc.entries.length,
   at,kind,runId:run.id,runIntegrity:run.integrity,
   previousHash:doc.entries.at(-1)?.hash||'GENESIS',payload};
  const entry={...base,hash:digest(base)};
  const next={schemaVersion:1,entries:[...doc.entries,entry]};
  const serialized=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(serialized)>maxBytes)throw failure('Validation journal storage full',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,serialized,{mode:0o600,flag:'wx'});await fs.rename(temp,filename);}
  catch{throw failure('Unable to persist validation journal',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  doc=next;return entry;
 }
 async function getRun(runId){
  if(!RID.test(runId||''))throw failure('Invalid research run ID');
  const run=await desk.get(runId);
  if(!/^[a-f0-9]{64}$/.test(run.integrity||''))throw failure('Research record integrity invalid',500);
  return run;
 }
 const withRun=(run)=>doc.entries.filter(e=>e.runId===run.id&&e.runIntegrity===run.integrity);
 const registration=(run)=>withRun(run).find(e=>e.kind==='REGISTER')||null;
 const groupReviews=(run,kind,key)=>{
  return withRun(run).filter(e=>e.kind===kind&&e.payload[key]!=null);
 };
 function resolvedReviews(items,id,key){
  const matching=items.filter(e=>e.payload[key]===id);
  return {count:matching.length,status:summaryStatus(matching,'decision'),
   reviewersClaimed:matching.length,reviewerIdentityAuthenticated:false,
   // Do not reveal the first reviewer result before the second review is complete.
   agreedDecision:matching.length===2&&matching[0].payload.decision===matching[1].payload.decision?
     matching[0].payload.decision:null,
   evidenceIndependentlyVerified:false};
 }
 async function catalog(){
  return {enabled,ruleVersion:VALIDATION_RULE,outcomeProtocol:OUTCOME_PROTOCOL,
   allowedHorizonDays:horizonOptions,reviewerAuthentication:false,maxEntries,
   notice:'Manual review aliases are not authenticated; labels are blinded before a second submission and never count as independently verified ground truth.'};
 }
 async function runAudit(runId){
  const run=await getRun(runId);
  await queue;await load();
  const audit=auditResearchRun(run);
  const reviews=withRun(run).filter(e=>e.kind==='REVIEW_PAIR');
  const registered=registration(run);
  const labels=registered?withRun(run).filter(e=>e.kind==='LABEL_OUTCOME'&&e.payload.registrationId===registered.id):[];
  const outcome=registered?{
   registrationId:registered.id,question:registered.payload.question,
   operationalCriterion:registered.payload.operationalCriterion,
   horizonDays:registered.payload.horizonDays,signalTag:registered.payload.signalTag,
   registeredAt:registered.at,windowEndsAt:registered.payload.windowEndsAt,
   status:summaryStatus(labels,'decision'),reviewsReceived:labels.length,
   agreedLabel:labels.length===2&&labels[0].payload.decision===labels[1].payload.decision?
    labels[0].payload.decision:null,
   reviewerIdentityAuthenticated:false,evidenceIndependentlyVerified:false,
   note:'This is a human-attested label, not independently adjudicated ground truth.'
  }:null;
  return {...audit,pairs:audit.pairs.map(pair=>({...pair,
   review:resolvedReviews(reviews,pair.id,'pairId')})),outcome};
 }
 async function register({runId,question,operationalCriterion,horizonDays,signalTag}={}){
  if(!enabled)throw failure('Validation writes are disabled',403);
  if(!take({runId,question,operationalCriterion,horizonDays,signalTag},
   ['runId','question','operationalCriterion','horizonDays','signalTag']))throw failure('Unexpected registration attributes');
  if(typeof question!=='string'||question.trim().length<18||question.length>240||
   typeof operationalCriterion!=='string'||operationalCriterion.trim().length<30||operationalCriterion.length>420||
   !horizonOptions.includes(horizonDays)||!['CANDIDATE','CONTROL'].includes(signalTag))
   throw failure('Register a measurable outcome question, criterion, horizon and declared candidate/control cohort');
  return serial(async()=>{
   const run=await getRun(runId);
   if(registration(run))throw failure('Run outcome protocol is already registered and immutable',409);
   const at=timestamp();
   if(Date.parse(at)<Date.parse(run.createdAt))throw failure('Cannot register before run creation');
   const end=new Date(Date.parse(at)+horizonDays*86400000).toISOString();
   const entry=await write('REGISTER',run,{question:plain(question,240),
    operationalCriterion:plain(operationalCriterion,420),horizonDays,
    signalTag,windowEndsAt:end,registrationBasis:'OPERATOR_PREDECLARED_NOT_MODEL_PREDICTION'},at);
   return {registrationId:entry.id,runId,registeredAt:at,windowEndsAt:end,
    status:'REGISTERED_NO_OUTCOME',signalTag,independentlyVerified:false};
  });
 }
 async function reviewPair({runId,pairId,reviewer,decision,rationale,evidenceRefIds=[]}={}){
  if(!enabled)throw failure('Validation writes are disabled',403);
  if(!signedByReviewer(reviewer)||!reviewKinds.includes(decision)||
   typeof rationale!=='string'||rationale.trim().length<20||rationale.length>500||
   !Array.isArray(evidenceRefIds)||evidenceRefIds.length>8||
   !evidenceRefIds.every(x=>typeof x==='string'))
   throw failure('Valid reviewer alias, decision, rationale and bounded evidence references required');
  return serial(async()=>{
   const run=await getRun(runId),audit=auditResearchRun(run);
   if(!audit.pairs.some(p=>p.id===pairId))throw failure('Unknown immutable contradiction pair');
   const allowed=new Set(run.evidence.map(e=>e.ref));
   if(evidenceRefIds.some(x=>!allowed.has(x)))throw failure('Review evidence must refer to captured source IDs');
   const existing=withRun(run).filter(e=>e.kind==='REVIEW_PAIR'&&e.payload.pairId===pairId);
   if(existing.length>=2||existing.some(e=>e.payload.reviewer.toLowerCase()===reviewer.toLowerCase()))
    throw failure('Pair already reviewed by this alias or maximum reviewers reached',409);
   await write('REVIEW_PAIR',run,{pairId,reviewer,decision,rationale:plain(rationale,500),
    evidenceRefIds:[...new Set(evidenceRefIds)],reviewerAuthentication:'NOT_VERIFIED'},timestamp());
   const results=withRun(run).filter(e=>e.kind==='REVIEW_PAIR'&&e.payload.pairId===pairId);
   return {runId,pairId,review:resolvedReviews(results,pairId,'pairId')};
  });
 }
 async function labelOutcome({runId,registrationId,reviewer,decision,rationale,
 evidenceUrl,evidencePublishedAt}={}){
  if(!enabled)throw failure('Validation writes are disabled',403);
  if(!EID.test(registrationId||'')||!signedByReviewer(reviewer)||!labelKinds.includes(decision)||
   typeof rationale!=='string'||rationale.trim().length<25||rationale.length>520||
   !publicLink(evidenceUrl)||!instant(evidencePublishedAt))
   throw failure('Review requires distinct reviewer alias, label, rationale, dated public HTTPS evidence link');
  return serial(async()=>{
   const run=await getRun(runId),reg=registration(run);
   if(!reg||reg.id!==registrationId)throw failure('No preregistered outcome for this research run',404);
   const at=timestamp();
   if(Date.parse(at)<Date.parse(reg.payload.windowEndsAt))
    throw failure('Evaluation horizon has not completed; do not label future results',409);
   if(Date.parse(evidencePublishedAt)>Date.parse(at)||
      Date.parse(evidencePublishedAt)<Date.parse(reg.at))
    throw failure('Outcome evidence date must fall between registration and review',400);
   const existing=withRun(run).filter(e=>e.kind==='LABEL_OUTCOME'&&e.payload.registrationId===registrationId);
   if(existing.length>=2||existing.some(e=>e.payload.reviewer.toLowerCase()===reviewer.toLowerCase()))
    throw failure('Outcome already reviewed by this alias or reviewer limit reached',409);
   const entry=await write('LABEL_OUTCOME',run,{registrationId,reviewer,decision,
    rationale:plain(rationale,520),evidenceUrl:publicLink(evidenceUrl),
    evidencePublishedAt,reviewerAuthentication:'NOT_VERIFIED',sourceContentFetched:false},at);
   const after=[...existing,entry];
   return {registrationId,runId,status:summaryStatus(after,'decision'),
    reviewsReceived:after.length,agreedLabel:after.length===2&&after[0].payload.decision===after[1].payload.decision?
     decision:null,
    independentlyVerified:false};
  });
 }
 async function report(){
  await queue;await load();
  const registrations=doc.entries.filter(x=>x.kind==='REGISTER');
  let awaiting=0,disputed=0,agree=0,candidateObserved=0,candidateNotObserved=0,
   controlObserved=0,controlNotObserved=0;
  for(const reg of registrations){
   const labels=doc.entries.filter(e=>e.kind==='LABEL_OUTCOME'&&e.payload.registrationId===reg.id);
   const state=summaryStatus(labels,'decision');
   if(state==='TWO_ALIASES_AGREE_UNVERIFIED'){
    agree++;
    const key=reg.payload.signalTag;
    const decision=labels[0].payload.decision;
    if(key==='CANDIDATE'&&decision==='OBSERVED')candidateObserved++;
    if(key==='CANDIDATE'&&decision==='NOT_OBSERVED')candidateNotObserved++;
    if(key==='CONTROL'&&decision==='OBSERVED')controlObserved++;
    if(key==='CONTROL'&&decision==='NOT_OBSERVED')controlNotObserved++;
   }else if(state==='DISPUTED')disputed++;
   else awaiting++;
  }
  return {protocol:OUTCOME_PROTOCOL,registered:registrations.length,
   awaitingTwoReviewers:awaiting,disputed,agreedUnverified:agree,
   descriptiveCounts:{candidateObserved,candidateNotObserved,controlObserved,controlNotObserved},
   measuredPrecision:null,measuredRecall:null,validatedFalsePositiveRate:null,
   predictionAccuracy:null,forecastProbability:null,
   limitations:['Cohorts are analyst-declared, not randomized or prospective forecast signals.',
    'Reviewers use unauthenticated aliases. Agreements are NOT independently verified outcomes.',
    'No certified negative sample, market counterfactual, sampling denominator or calibrated model.']};
 }
 async function close(){await queue;}
 return {catalog,runAudit,register,reviewPair,labelOutcome,report,close};
}
const response=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function createResearchValidationApi({service,host='127.0.0.1'}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/agent-validation/'))return false;
  try{
   const op=u.pathname.slice('/api/agent-validation/'.length);
   if(req.method==='GET'){
    if(op==='catalog'&&!u.searchParams.size)response(res,200,await service.catalog());
    else if(op==='report'&&!u.searchParams.size)response(res,200,await service.report());
    else if(op==='run'&&u.searchParams.size===1&&u.searchParams.getAll('id').length===1)
     response(res,200,await service.runAudit(u.searchParams.get('id')));
    else throw failure('Unknown validation read operation',404);
   }else if(req.method==='POST'){
    if(!['register','review-pair','label-outcome'].includes(op)||u.searchParams.size)
     throw failure('Unknown validation operation',404);
    if(!['127.0.0.1','localhost','::1'].includes(host)||
      req.headers['x-researchos-validation']!=='1'||
      req.headers['sec-fetch-site']==='cross-site'||
      (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
      throw failure('Local same-origin explicit validation request required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw failure('JSON validation input required',415);
    let text='',bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>2200)throw failure('Validation input too large',413);text+=chunk;}
    let args;try{args=JSON.parse(text);}catch{throw failure('Invalid JSON input');}
    if(!args||typeof args!=='object'||Array.isArray(args))throw failure('Expected JSON object');
    const schema=op==='register'?
     ['runId','question','operationalCriterion','horizonDays','signalTag']:
     op==='review-pair'?['runId','pairId','reviewer','decision','rationale','evidenceRefIds']:
     ['runId','registrationId','reviewer','decision','rationale','evidenceUrl','evidencePublishedAt'];
    if(!take(args,schema))throw failure('Unexpected validation fields');
    const payload=op==='register'?await service.register(args):
     op==='review-pair'?await service.reviewPair(args):await service.labelOutcome(args);
    response(res,200,payload);
   }else throw failure('Validation request method not supported',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,503].includes(e.status)?e.status:503;
   response(res,status,{error:e.status?e.message:'Research validation unavailable'});
  }
  return true;
 };
}
