/**
 * v0.34 Research Agent Desk: six deterministic, permission-free research stages;
 * optional independent local-only analyst/challenger proposals; tamper-evident local run book.
 *
 * Agents never execute tools, trade, browse user supplied URLs or certify impact/predictions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createLocalModelAdapter} from './local-llm-adapter.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const h=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const validTime=x=>typeof x==='string'&&ISO.test(x)&&Number.isFinite(Date.parse(x));
const runID=/^desk-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const publicHost={USGS:'earthquake.usgs.gov',NASA_EONET:'eonet.gsfc.nasa.gov',FAA_NAS_STATUS:'nasstatus.faa.gov'};
const clean=(s,n=200)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const safeSourceURL=(source,link)=>{
 try{const url=new URL(link);return url.protocol==='https:'&&url.hostname===publicHost[source]&&!url.username&&!url.password&&url.href.length<500?url.href:null;}
 catch{return null;}
};
export const RESEARCH_AGENT_ROLES=Object.freeze([
 {id:'evidence_scout',label:'Evidence Scout',description:'Inspect archived original-source records and availability'},
 {id:'chronology_auditor',label:'Timeline Auditor',description:'Separate original event times from independently captured knowledge times'},
 {id:'transmission_analyst',label:'Transmission Analyst',description:'Propose explicitly unverified causal mechanisms for research'},
 {id:'anti_agent',label:'Independent Anti-Agent',description:'Challenge attribution, coverage, timing, correlation and causal claims'},
 {id:'source_verifier',label:'Source Verifier',description:'Audit citations, clocks and missing independent corroboration'},
 {id:'research_arbiter',label:'Research Arbiter',description:'Publish bounded evidence summary and unresolved disagreements'}
]);
function stage(id,{facts=[],questions=[],claims=[],flags=[]}={}){
 return {id,role:RESEARCH_AGENT_ROLES.find(r=>r.id===id)?.label||id,
  method:'DETERMINISTIC_RULES',facts,questions,claims,flags,
  conclusionStatus:'UNVERIFIED_RESEARCH_ONLY'};
}
function boundedEvidence(rows,focus){
 const candidates=[focus,...rows.filter(x=>x.id!==focus.id&&x.source===focus.source&&x.family===focus.family)].slice(0,8);
 return candidates.map((x,i)=>({
  ref:'EV-'+(i+1),id:x.id,source:x.source,family:x.family,type:x.type,
  title:clean(x.title,170),eventTime:x.eventTime||null,
  providerUpdatedAt:x.providerUpdatedAt||null,firstObservedAt:x.firstObservedAt,
  lastRevisionCapturedAt:x.lastRevisionCapturedAt||null,
  revision:x.revision,sourceUrl:safeSourceURL(x.source,x.sourceUrl),
  sourceLinkVerified: Boolean(safeSourceURL(x.source,x.sourceUrl)),
  issuerExposureVerified:false,financialImpactVerified:false
 }));
}
export function buildResearchDebate({evidence,focus,asOf,modelProposals={}}={}){
 if(!Array.isArray(evidence)||!evidence.length||evidence.length>8||
   !focus||!validTime(asOf)||!evidence.some(x=>x.id===focus.id))
  throw fail('A bounded source-archived event and as-of checkpoint are required');
 const lead=evidence.find(x=>x.id===focus.id);
 const refs=evidence.map(x=>x.ref);
 const independentSources=new Set(evidence.map(x=>x.source)).size;
 const firstObserved=Date.parse(lead.firstObservedAt);
 const eventTime=lead.eventTime&&validTime(lead.eventTime)?Date.parse(lead.eventTime):null;
 const clockLag=eventTime!==null?Math.max(0,Math.round((firstObserved-eventTime)/60000)):null;
 const verifiedLinks=evidence.filter(x=>x.sourceLinkVerified).length;
 const stage1=stage('evidence_scout',{facts:[
  {text:'Archived event '+lead.id+' has '+evidence.length+' eligible local source records.',refs},
  {text:'Original source link matches its official provider domain: '+Boolean(lead.sourceLinkVerified)+'.',refs:[lead.ref]}],
  questions:['Can another independent primary source corroborate the mechanism?'],
  flags:[...(!lead.sourceLinkVerified?['MISSING_OFFICIAL_SOURCE_LINK']:[])]});
 const stage2=stage('chronology_auditor',{facts:[
  {text:'First locally captured at '+lead.firstObservedAt+'; event time supplied by provider '+(lead.eventTime||'unavailable')+'.',refs:[lead.ref]}],
  questions:['Was the original alert first public before local first observation?','Can the upstream provider revision history be authenticated?'],
  flags:['ORIGINAL_FIRST_PUBLICATION_UNVERIFIED',
   ...(clockLag!==null&&clockLag>60?['SOURCE_EVENT_PRECEDES_LOCAL_CAPTURE_OVER_60_MIN']:[])]});
 const mechanism=lead.family==='aviation'?
  'Airport-specific operational disruption could affect route reliability; airline, airport and network exposure is unverified.':
  'Localized natural hazard may create operating and insurance pressures; impacted facilities, claims and listed issuers are unverified.';
 const stage3=stage('transmission_analyst',{
  facts:[{text:'The source reports an event class '+lead.type+'; no issuer exposure is established.',refs:[lead.ref]}],
  claims:[{text:mechanism,refs:[lead.ref],verification:'HYPOTHESIS_NOT_OBSERVED'}],
  questions:['Which independently verified company facilities are physically exposed?',
   'Which contemporaneous operational or insurance-loss records corroborate a transmission mechanism?'],
  flags:['ISSUER_EXPOSURE_NOT_VERIFIED','CAUSAL_TRANSMISSION_NOT_VERIFIED']});
 const stage4=stage('anti_agent',{
  facts:[{text:'The archive provides '+independentSources+' independent source-provider families for this dossier.',refs}],
  claims:[{text:'Alternative explanation: the observed event may have no economically material listed-company transmission.',refs:[],verification:'COUNTER_HYPOTHESIS_NOT_OBSERVED'}],
  questions:[
   'Could late reporting, selection bias or provider truncation create the apparent observation pattern?',
   'What is the base rate of similar incidents with zero verified company or market impact?',
   'Is any downstream economic change independently attributable rather than merely coincident?'],
  flags:['NO_OUTCOME_LABELS','NO_CAUSAL_COUNTERFACTUAL',
    ...(independentSources<2?['NO_INDEPENDENT_PROVIDER_CORROBORATION']:[])]});
 const stage5=stage('source_verifier',{facts:[
  {text:verifiedLinks+'/'+evidence.length+' evidence links match an approved official provider hostname.',refs}],
  questions:['What additional source would test the competing explanation?',
   'Are provider timestamps and local capture clocks independently verifiable?'],
  flags:[...(!verifiedLinks?['NO_APPROVED_SOURCE_LINKS']:[]),
   'CONTENT_HASH_NOT_EXTERNALLY_NOTARIZED','SOURCE_LINK_DOES_NOT_PROVE_ECONOMIC_CLAIM']});
 const unresolved=[...new Set([...stage2.flags,...stage3.flags,...stage4.flags,...stage5.flags])];
 const stage6=stage('research_arbiter',{
  facts:[{text:'Research dossier has '+evidence.length+' archived references and '+unresolved.length+
   ' unresolved evidence limitations.',refs}],
  questions:['What observation would falsify the lead transmission claim?',
   'Can a future observation be labeled independently before evaluating research success?'],
  flags:unresolved});
 const stages=[stage1,stage2,stage3,stage4,stage5,stage6];
 for(const role of ['analyst','challenger']){
  const proposal=modelProposals[role];
  if(!proposal)continue;
  const dest=role==='analyst'?stage3:stage4;
  dest.method='DETERMINISTIC_PLUS_LOCAL_MODEL';
  dest.claims.push({text:clean(proposal.hypothesis,1000),refs:[],
   verification:'MODEL_PROPOSAL_UNVERIFIED',model:clean(proposal.model,100)});
  dest.questions.push(...(proposal.questions||[]).map(x=>clean(x,180)));
 }
 return {schemaVersion:1,methodVersion:'RESEARCH-DESK-0.34.1',
  focusEventId:lead.id,asOf,eventCount:evidence.length,referenceIds:refs,
  independentSourceProviders:independentSources,stages,
  arbiter:{disposition:'HUMAN_REVIEW_REQUIRED',verifiedTradeIdea:false,
   verifiedCausality:false,forecastProbability:null,issuerExposureVerified:false,
   unresolved,sourceFirst:false,
   nextAction:'Request independent source and issuer exposure verification; do not infer prices or issue trades.'},
  modelProposalStatus:{
   analyst:modelProposals.analyst?'UNVERIFIED_PROPOSAL':'NOT_PROVIDED',
   challenger:modelProposals.challenger?'UNVERIFIED_PROPOSAL':'NOT_PROVIDED'},
  notice:'Research agents create reproducible hypotheses and challenge questions, not verified predictions. Independent Anti-Agent has no access to other analyst output.'};
}
function ensureRun(run){
 if(!run||!runID.test(run.id)||!validTime(run.asOf)||!validTime(run.createdAt)||
  !Array.isArray(run.evidence)||run.evidence.length<1||run.evidence.length>8||
  !run.debate||run.debate.methodVersion!=='RESEARCH-DESK-0.34.1')
  throw fail('Stored research run is invalid',500);
 const core={id:run.id,asOf:run.asOf,createdAt:run.createdAt,mode:run.mode,
  evidence:run.evidence,debate:run.debate};
 if(run.integrity!==h(core))throw fail('Stored research run integrity failed',500);
 return run;
}
export function createResearchAgentDesk({collector,model=createLocalModelAdapter(),filename,
 enabled=true,now=()=>new Date().toISOString(),maxRuns=60,maxBytes=8000000}={}){
 if(typeof collector?.list!=='function'||typeof filename!=='string'||!path.isAbsolute(filename)||
  !Number.isInteger(maxRuns)||maxRuns<1||maxRuns>200||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)throw TypeError('Agent Desk requires a local archive and bounded private run path');
 let queue=Promise.resolve(),loaded=null,loading=null;
 async function load(){
  if(loaded)return loaded;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>maxBytes)throw fail('Research run archive size invalid',500);
    const json=JSON.parse(await fs.readFile(filename,'utf8'));
    if(json?.schemaVersion!==1||!Array.isArray(json.runs)||json.runs.length>maxRuns)
     throw fail('Research run archive format invalid',500);
    json.runs.forEach(ensureRun);
    return loaded=json;
   }catch(e){if(e.code==='ENOENT')return loaded={schemaVersion:1,runs:[]};
    throw fail('Research run archive cannot be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const enqueue=fn=>{const job=queue.then(async()=>{await load();return fn();});queue=job.catch(()=>{});return job;};
 async function persist(doc){
  const bytes=JSON.stringify(doc,null,2)+'\n';
  if(Buffer.byteLength(bytes)>maxBytes)throw fail('Research run store capacity reached',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw fail('Failed saving private research run',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 const config=()=>({enabled,localModel:model.config(),maxRuns,
  roles:RESEARCH_AGENT_ROLES.map(r=>({...r})),
  limitations:['Local archive only: upstream first-publication and economic outcomes unverified.',
   'Model proposals are never elevated to facts. There are no broker/trading tools.',
   'No independent external notarization or multi-user authentication.']});
 async function run({eventId,asOf=null,mode='deterministic'}={}){
  if(!enabled)throw fail('Agent Desk disabled on nonloopback host',403);
  if(typeof eventId!=='string'||!/^(?:USGS|NASA_EONET|FAA_NAS_STATUS):[A-Za-z0-9_.:-]{1,150}$/.test(eventId))
   throw fail('Choose a stored official-source event ID');
  if(!['deterministic','local'].includes(mode))throw fail('Unsupported research mode');
  if(mode==='local'&&!model.config().enabled)throw fail('Local LLM is not configured',409);
  const createdAt=now();
  if(!validTime(createdAt))throw fail('Local research clock is unavailable',503);
  const cutoff=asOf||createdAt;
  if(!validTime(cutoff)||Date.parse(cutoff)>Date.parse(createdAt))throw fail('As-of checkpoint must be a nonfuture UTC instant');
  return enqueue(async()=>{
   if(loaded.runs.length>=maxRuns)throw fail('Agent Desk run capacity reached; archive and migrate before continuing',409);
   const listing=await collector.list({asOf:cutoff,limit:200});
   if(listing.isPartial)throw fail('Event archive has more than 200 matches; narrow the archive before running',409);
   const focus=listing.events.find(x=>x.id===eventId);
   if(!focus)throw fail('Event was not captured by the selected local cutoff',404);
   const evidence=boundedEvidence(listing.events,focus);
   const models={},modelWarnings=[];
   if(mode==='local'){
    for(const role of ['analyst','challenger']){
     try{
      const proposal=await model.propose({role,objective:'Investigate source observation '+focus.id+
       ' with alternative economic explanations. Do not assert a financial effect.',evidence});
      if(proposal)models[role]=proposal;
     }catch{modelWarnings.push(role.toUpperCase()+'_MODEL_UNAVAILABLE');}
    }
   }
   const debate=buildResearchDebate({evidence,focus,asOf:cutoff,modelProposals:models});
   debate.arbiter.flags=modelWarnings;
   const core={id:'desk-'+randomUUID(),asOf:cutoff,createdAt,mode,evidence,debate};
   const record={...core,integrity:h(core)};
   ensureRun(record);
   const next={schemaVersion:1,runs:[...loaded.runs,record]};
   await persist(next);loaded=next;
   return record;
  });
 }
 async function runs(){
  await queue;await load();
  return {runs:loaded.runs.slice().reverse().map(r=>({id:r.id,eventId:r.debate.focusEventId,
   createdAt:r.createdAt,asOf:r.asOf,mode:r.mode,
   disposition:r.debate.arbiter.disposition,integrity:r.integrity}))};
 }
 async function get(id){
  if(!runID.test(id||''))throw fail('Invalid research run ID');
  await queue;await load();
  const record=loaded.runs.find(r=>r.id===id);
  if(!record)throw fail('Research run not found',404);
  return structuredClone(ensureRun(record));
 }
 async function close(){await queue;}
 return {config,run,runs,get,close};
}
const send=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
export function createResearchAgentDeskApi({desk,host='127.0.0.1'}={}){
 return async(req,res,u)=>{
  if(!u.pathname.startsWith('/api/agent-desk/'))return false;
  try{
   const op=u.pathname.slice('/api/agent-desk/'.length);
   if(op==='catalog'&&req.method==='GET'&&!u.searchParams.size)send(res,200,desk.config());
   else if(op==='runs'&&req.method==='GET'&&!u.searchParams.size)send(res,200,await desk.runs());
   else if(op==='run'&&req.method==='GET'&&u.searchParams.size===1&&u.searchParams.getAll('id').length===1)
    send(res,200,await desk.get(u.searchParams.get('id')));
   else if(op==='run'&&req.method==='POST'){
    if(u.searchParams.size)throw fail('Agent run query arguments not supported');
    if(!['127.0.0.1','localhost','::1'].includes(host)||
      req.headers['x-researchos-agent-run']!=='1'||
      req.headers['sec-fetch-site']==='cross-site'||
      (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
      throw fail('Same-origin explicit local research request required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
      throw fail('JSON request required',415);
    let raw='',total=0;
    for await(const part of req){total+=part.length;if(total>800)throw fail('Research request too large',413);raw+=part;}
    let args;try{args=JSON.parse(raw);}catch{throw fail('Invalid JSON');}
    if(!args||typeof args!=='object'||Array.isArray(args)||
     Object.keys(args).some(k=>!['eventId','asOf','mode'].includes(k)))throw fail('Invalid research run parameters');
    send(res,200,await desk.run(args));
   }else throw fail('Unsupported Research Agent Desk operation',404);
  }catch(e){send(res,[400,403,404,409,413,415,500,503].includes(e?.status)?e.status:503,
    {error:e?.status?e.message:'Research Agent Desk unavailable'});}
  return true;
 };
}
