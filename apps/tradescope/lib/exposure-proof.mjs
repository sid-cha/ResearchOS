/**
 * v0.27 Evidence review casebook: local-only, source-constrained, hash-chained claims,
 * snapshots, independent questions and rebuttals. No automatic SEC-CIK subsidiary proof,
 * automated investment advice, model-based adjudication or historical vintage verification.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {adversarialFacilityReview} from './epa-frs.mjs';

const fail=(m,status=400)=>Object.assign(new Error(m),{status});
const hash=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const ZERO='0'.repeat(64);
const CASE=/^case-[0-9a-f-]{36}$/;
const ENTITY=/^asset-[0-9a-f-]{36}$/;
const ID=/^\d{10,14}$/;
const STATUS=new Set(['NEEDS_EVIDENCE','CONTESTED','READY_FOR_INDEPENDENT_REVIEW','REJECTED_AS_UNSUPPORTED']);
const CHALLENGES=new Set(['OPERATOR_MISMATCH','WRONG_ISSUER','GEO_CONFLICT','SOURCE_CONFLICT','TIME_LEAKAGE',
 'MISSING_DOCUMENT','ALTERNATIVE_EXPLANATION','FALSIFICATION_TEST','OTHER']);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const iso=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))&&x.length<40;
const text=(x,max=400)=>typeof x==='string'&&x.trim().length>=3&&x.length<=max&&
 !/[\u0000-\u001f<>]/.test(x)?x.trim():null;
const url=x=>{try{
 const u=new URL(x);
 const ok=['www.sec.gov','www.epa.gov','ofmpub.epa.gov','echo.epa.gov','www.eia.gov','www.usgs.gov','earthquake.usgs.gov'];
 return u.protocol==='https:'&&ok.includes(u.hostname)&&!u.username&&!u.password&&!u.hash&&
  !u.search&&u.href.length<=480?u.href:null;
 }catch{return null;}};
const SEC=x=>typeof x==='string'&&x.startsWith('https://www.sec.gov/');
const document=(x,role)=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['url','publishedDate','excerpt'].includes(k)))throw fail('A dated official '+role+' document is required');
 const doc={url:url(x.url),publishedDate:x.publishedDate,excerpt:text(x.excerpt,650)};
 if(!doc.url||!day(doc.publishedDate)||!doc.excerpt||
  (role==='SEC relationship'&&!SEC(doc.url)))throw fail('An official source URL, actual publication day and excerpt are required for '+role);
 return doc;
};
function checkClaim(x,{now}={}){
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>![
  'assetId','epaRegistryId','legalOperatorName','effectiveFrom','effectiveTo',
  'operatorDocument','issuerRelationshipDocument','thesis'].includes(k)))throw fail('Unknown exposure claim field');
 if(!ENTITY.test(x.assetId)||!ID.test(x.epaRegistryId)||!text(x.legalOperatorName,160)||
  !day(x.effectiveFrom)||x.effectiveTo!=null&&!day(x.effectiveTo)||
  x.effectiveTo!=null&&x.effectiveTo<x.effectiveFrom||
  !text(x.thesis,550))throw fail('A dated legal-operator hypothesis with valid asset and FRS IDs is required');
 const a=document(x.operatorDocument,'legal operator'),b=document(x.issuerRelationshipDocument,'SEC relationship');
 const today=(now||new Date()).toISOString().slice(0,10);
 if(a.publishedDate>today||b.publishedDate>today||x.effectiveFrom>today)throw fail('Future-dated source or ownership assertion not allowed');
 return {assetId:x.assetId,epaRegistryId:x.epaRegistryId,
  legalOperatorName:text(x.legalOperatorName,160),effectiveFrom:x.effectiveFrom,effectiveTo:x.effectiveTo||null,
  operatorDocument:a,issuerRelationshipDocument:b,thesis:text(x.thesis,550),
  provenance:'ANALYST_DOCUMENT_ASSERTION_NOT_INDEPENDENTLY_VERIFIED',
  ownershipVerified:false,publicIssuerCikVerified:false,historicalFirstAvailableVerified:false};
}
function publicEvent(e){
 return {seq:e.seq,caseId:e.caseId,type:e.type,occurredAt:e.occurredAt,
  payloadHash:e.payloadHash,eventHash:e.eventHash,previousHash:e.previousHash,
  payload:structuredClone(e.payload)};
}
export function createExposureCasebook({filename,now=()=>new Date(),maxEntries=1500,maxBytes=8500000}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new TypeError('Absolute local evidence casebook file required');
 let serial=Promise.resolve();
 const run=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
 async function read(){
  let raw='';
  try{raw=await fs.readFile(filename,'utf8');}catch(e){
   if(e.code==='ENOENT')return [];throw fail('Cannot read local casebook',503);}
  if(Buffer.byteLength(raw)>maxBytes)throw fail('Local casebook full',507);
  if(raw&&!raw.endsWith('\n'))throw fail('Partial local casebook record',409);
  const lines=raw?raw.trimEnd().split('\n'):[];
  if(lines.length>maxEntries)throw fail('Casebook capacity exceeded',507);
  const rows=[];let previousHash=ZERO,ids=new Set();
  for(const line of lines){
   let row;try{row=JSON.parse(line);}catch{throw fail('Malformed casebook record',409);}
   const {eventHash,...rest}=row||{};
   if(row?.version!==1||row.seq!==rows.length+1||row.previousHash!==previousHash||
    typeof eventHash!=='string'||! /^[a-f0-9]{64}$/.test(eventHash)||
    row.payloadHash!==hash(row.payload)||hash(rest)!==eventHash||
    !CASE.test(row.caseId)||!['CASE_OPENED','SOURCE_CAPTURED','CHALLENGE_ADDED','REBUTTAL_ADDED','REVIEW_RECORDED'].includes(row.type)||
    !iso(row.occurredAt))throw fail('Casebook hash chain or schema invalid',409);
   if(row.type==='CASE_OPENED'){if(ids.has(row.caseId))throw fail('Duplicate case in journal',409);ids.add(row.caseId);}
   else if(!ids.has(row.caseId))throw fail('Orphan casebook event',409);
   previousHash=eventHash;rows.push(row);
  }
  return rows;
 }
 async function append(caseId,type,payload){
  return run(async()=>{
   const rows=await read();
   if(rows.length>=maxEntries)throw fail('Casebook capacity reached',507);
   if(type!=='CASE_OPENED'&&!rows.some(x=>x.caseId===caseId&&x.type==='CASE_OPENED'))
    throw fail('Research case does not exist',404);
   const base={version:1,seq:rows.length+1,caseId,type,occurredAt:now().toISOString(),
    payload,previousHash:rows.at(-1)?.eventHash||ZERO,payloadHash:hash(payload)};
   const row={...base,eventHash:hash(base)},line=JSON.stringify(row)+'\n';
   if(Buffer.byteLength(line)>9500)throw fail('Casebook event exceeds limit',413);
   const stat=await fs.stat(filename).catch(e=>{if(e.code==='ENOENT')return {size:0};throw e;});
   if(stat.size+Buffer.byteLength(line)>maxBytes)throw fail('Casebook storage limit',507);
   await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
   const fd=await fs.open(filename,'a',0o600);
   try{await fd.writeFile(line);await fd.sync();}finally{await fd.close();}
   return publicEvent(row);
  });
 }
 async function history(id){
  if(!CASE.test(id))throw fail('Invalid research case ID');
  return run(async()=>{
   const rows=(await read()).filter(x=>x.caseId===id);
   if(!rows.length)throw fail('Research case not found',404);
   return {id,events:rows.map(publicEvent),verifiedLegalRelationship:false,recordIntegrity:'LOCAL_HASH_CHAIN_VALID'};
  });
 }
 async function list({limit=50,symbol=null}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100||
   symbol!==null&&(typeof symbol!=='string'||!/^[A-Z0-9.-]{1,12}$/.test(symbol)))throw fail('Invalid casebook filters');
  return run(async()=>{
   const rows=await read(),opened=rows.filter(x=>x.type==='CASE_OPENED').reverse()
    .filter(x=>!symbol||x.payload.assetSymbol===symbol).slice(0,limit);
   return {version:1,caseCount:rows.filter(x=>x.type==='CASE_OPENED').length,entries:rows.length,
    cases:opened.map(x=>({id:x.caseId,createdAt:x.occurredAt,assetId:x.payload.claim.assetId,
     assetName:x.payload.assetName,symbol:x.payload.assetSymbol,cik:x.payload.assetCik,
     epaRegistryId:x.payload.claim.epaRegistryId,legalOperatorName:x.payload.claim.legalOperatorName,
     reviewStatus:[...rows].reverse().find(y=>y.caseId===x.caseId&&y.type==='REVIEW_RECORDED')?.payload.disposition||'NEEDS_EVIDENCE',
     evidenceStatus:'ANALYST_ASSERTION_UNVERIFIED',
     independentIssuerLinkVerified:false,
     eventCount:rows.filter(y=>y.caseId===x.caseId).length}))};
  });
 }
 async function integrity(){
  return run(async()=>{
   const rows=await read();
   return {enabled:true,recordCount:rows.length,caseCount:rows.filter(x=>x.type==='CASE_OPENED').length,
    headHash:rows.at(-1)?.eventHash||ZERO,integrity:'LOCAL_HASH_CHAIN_VALID',
    independentTimestampAnchor:false,productionMultitenant:false,
    caveat:'Entire local journal may be rewritten by a privileged administrator; not independently notarized.'};
  });
 }
 const addCase=async(input,assets)=>{
  const claim=checkClaim(input,{now});
  const matching=(await assets()).assets?.find(x=>x.id===claim.assetId);
  if(!matching)throw fail('Claim must refer to a real saved local facility assertion',404);
  const id='case-'+randomUUID();
  return append(id,'CASE_OPENED',{claim,assetSymbol:matching.symbol,assetCik:matching.cik,
   assetName:matching.assetName,assetSnapshotHash:hash(matching),
   openedAs:'SOURCE_REFERENCED_OPERATOR_HYPOTHESIS',operatorVerified:false,issuerVerified:false});
 };
 const addSource=async(id,data)=>{
  if(!data||typeof data!=='object'||Object.keys(data).some(x=>!['epa','sec','status'].includes(x)))
   throw fail('Source snapshot is server-owned only');
  return append(id,'SOURCE_CAPTURED',data);
 };
 const challenge=async(id,input)=>{
  if(!input||Object.keys(input).some(x=>!['category','reason','source'].includes(x))||
   !CHALLENGES.has(input.category)||!text(input.reason,750))throw fail('Structured adversarial challenge required');
  const evidence=input.source==null?null:document(input.source,'challenge');
  return append(id,'CHALLENGE_ADDED',{challengeId:'challenge-'+randomUUID(),category:input.category,
   reason:text(input.reason,750),source:evidence,reviewType:'HUMAN_ENTERED_NOT_AGENT_PROOF',
   status:'OPEN',independentlyVerified:false});
 };
 const rebut=async(id,input)=>{
  if(!input||Object.keys(input).some(x=>!['challengeId','reason','source'].includes(x))||
   typeof input.challengeId!=='string'||!/^challenge-[0-9a-f-]{36}$/.test(input.challengeId)||
   !text(input.reason,750))throw fail('A challenge ID and evidence response are required');
  const h=await history(id);
  if(!h.events.some(x=>x.type==='CHALLENGE_ADDED'&&x.payload.challengeId===input.challengeId))
   throw fail('Referenced challenge is not part of case',404);
  return append(id,'REBUTTAL_ADDED',{challengeId:input.challengeId,reason:text(input.reason,750),
   source:input.source?document(input.source,'rebuttal'):null,
   resolution:'NOT_AUTOMATICALLY_RESOLVED',independentlyVerified:false});
 };
 const review=async(id,input)=>{
  if(!input||Object.keys(input).some(x=>!['disposition','rationale'].includes(x))||
   !STATUS.has(input.disposition)||!text(input.rationale,750)||input.rationale.trim().length<20)
   throw fail('Review needs permitted disposition and substantive rationale');
  return append(id,'REVIEW_RECORDED',{disposition:input.disposition,rationale:text(input.rationale,750),
   reviewer:'LOCAL_ANALYST_NOT_INDEPENDENT_VERIFIER',actualOwnershipVerified:false});
 };
 return {history,list,integrity,addCase,addSource,challenge,rebut,review};
}
function challenge(id,priority,statement,proof){
 return {id,priority,statement,missingEvidence:proof,independentlyResolved:false};
}
export function scoreProofReadiness({opened,assets,frs=null,sec=null,asOf=null}={}){
 if(!opened||!opened.claim||!assets)throw fail('Opened claim and source asset required');
 if(asOf!==null&&!day(asOf))throw fail('Invalid historical as-of date');
 const {claim}=opened,issues=[],today=new Date().toISOString().slice(0,10);
 if(!assets||opened.assetCik!==assets.cik||opened.assetSymbol!==assets.symbol)
  issues.push(challenge('ASSET_IDENTITY_DRIFT','CRITICAL','Local asset identity differs from original case snapshot.',
   'Reconcile original stored asset claim and current local registry identity'));
 if(!frs?.record)issues.push(challenge('OFFICIAL_FRS_NOT_OBSERVED','HIGH','No matching current official FRS facility record is available.',
   'Fetch exact FRS Registry ID from official EPA source'));
 if(frs?.record){
  if(frs.record.coordinateStatus!=='OFFICIAL_NAD83_REPORTED_POINT')
   issues.push(challenge('OFFICIAL_COORDINATE_MISSING','HIGH','Official EPA site has no usable NAD83 location.',
    'Obtain official property coordinates'));
  if(frs.record.registryId!==claim.epaRegistryId)
   issues.push(challenge('REGISTRY_ID_CONFLICT','CRITICAL','Official EPA Registry ID differs from the submitted ID.',
    'Check exact EPA facility identifier'));
  if(frs.record.latitude!==null&&frs.record.longitude!==null){
   const lat=assets.latitude,lon=assets.longitude,
    dr=Math.PI/180,R=6371,dl=(frs.record.latitude-lat)*dr,du=(frs.record.longitude-lon)*dr;
   const v=2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+
    Math.cos(lat*dr)*Math.cos(frs.record.latitude*dr)*Math.sin(du/2)**2)));
   if(v>1)issues.push(challenge('SITE_POINT_CONFLICT','HIGH','EPA NAD83 and analyst facility points differ by '+v.toFixed(1)+' km.',
    'Verify geocoding precision, datum and official boundary coordinates'));
  }
 }
 if(!sec)issues.push(challenge('SEC_CIK_NOT_OBSERVED','HIGH','SEC registrant identity was unavailable at source inspection.',
  'Retrieve current SEC submissions metadata with configured user agent'));
 else if(sec.cik!==opened.assetCik)issues.push(challenge('SEC_CIK_MISMATCH','CRITICAL','SEC filing response CIK does not match original local asset identity.',
  'Use the exact CIK from the original SEC registrant'));
 else if(!sec.tickers.includes(opened.assetSymbol))issues.push(challenge('SEC_TICKER_NOT_MATCHED','MEDIUM',
  'Current SEC registrant tickers do not include the source-asserted symbol.',
  'Confirm issuer listing history and legal-entity identity'));
 issues.push(challenge('LEGAL_OPERATOR_TO_PARENT_NOT_INDEPENDENTLY_PROVEN','CRITICAL',
  'Official EPA site data and SEC current company metadata do not prove the submitted legal operator is the public issuer’s subsidiary.',
  'Obtain independently authenticated dated permit/owner operator and subsidiary-to-registrant SEC relationship'));
 issues.push(challenge('RELEASE_VINTAGES_UNVERIFIED','HIGH',
  'Current EPA/SEC sources and analyst-dated excerpts do not establish first-issued historical public availability.',
  'Capture original dated documents, receipt time and authoritative revision metadata'));
 issues.push(challenge('FINANCIAL_OUTCOME_NOT_VERIFIED','MEDIUM',
  'Even an operating facility does not establish earnings exposure or market return.',
  'Corroborate actual facility utilization, disruption, insurance and financial materiality'));
 if(asOf){
  const dated=[
   ['operator permit',claim.operatorDocument.publishedDate],
   ['SEC relationship',claim.issuerRelationshipDocument.publishedDate],
   ['effective operator start',claim.effectiveFrom],
   ['local geocoding evidence',assets.geoEvidenceDate],
   ['local SEC filing',assets.issuerFilingDate]];
  for(const [label,date] of dated)if(date>asOf)issues.push(challenge('AFTER_CUTOFF_'+label.toUpperCase().replace(/[^A-Z0-9]+/g,'_'),
   'CRITICAL',label+' becomes available only after cutoff ('+date+').','Exclude this record in historical replay'));
  if(claim.effectiveTo&&claim.effectiveTo<asOf)issues.push(challenge('OWNERSHIP_INTERVAL_EXPIRED','HIGH',
   'The analyst-asserted ownership interval ended before cutoff.','Provide a dated successor legal-entity source'));
 }
 const available=4+(frs?.record?1:0)+(sec?1:0);
 return {schemaVersion:1,reportKind:'SOURCE_CORROBORATION_NOT_OWNERSHIP_VERIFICATION',
  caseId:opened.caseId||null,asOf,sourceCompleteness:{availableSignals:available,requiredSignals:8,
   measuredCoverageFraction:available/8,notAProbability:true},
  historicalFirstAvailableEligible:false,legalOperatorVerified:false,
  subsidiaryToCikVerified:false,issuerFinancialImpactVerified:false,
  evidenceState:'INDEPENDENT_OPERATOR_AND_HISTORICAL_PROOF_MISSING',
  issues,criticalIssueCount:issues.filter(x=>x.priority==='CRITICAL').length,
  counterResearchProtocol:'DETERMINISTIC_EVIDENCE_CRITIC_NOT_AUTONOMOUS_AGENT',
  sourceStatuses:{epa:frs?.status||'NOT_QUERIED',sec:sec?'CURRENT_REGISTRANT_ONLY':'NOT_AVAILABLE'},
  notes:['All entered legal operator and parent relationships remain analyst assertions.',
   'Official EPA/SEC metadata does not validate an ownership chain. Score describes source-field coverage, not confidence.',
   'Never promote a review disposition, model agreement, or absence of objections into verified financial exposure.']};
}
export function exposureReportText({opened,events=[],readiness=null}={}){
 if(!opened?.claim)throw fail('Case required');
 const lines=[
 'TRADESCOPE — SOURCE-CITED FACILITY EXPOSURE PROOF PACKET',
 'Research case: '+(opened.caseId||'not assigned'),
 'Issuer: '+opened.assetSymbol+' (SEC CIK '+opened.assetCik+')',
 'Asset: '+opened.assetName+' / EPA Registry ID '+opened.claim.epaRegistryId,
 'Claimed operator: '+opened.claim.legalOperatorName,
 'Claimed interval: '+opened.claim.effectiveFrom+' to '+(opened.claim.effectiveTo||'open'),
 'Claim basis: '+opened.claim.thesis,
 'Operator source: '+opened.claim.operatorDocument.url+' ('+opened.claim.operatorDocument.publishedDate+')',
 'SEC relationship source: '+opened.claim.issuerRelationshipDocument.url+' ('+opened.claim.issuerRelationshipDocument.publishedDate+')',
 'LEGAL OWNERSHIP / CIK LINK / OPERATIONAL IMPACT: NOT INDEPENDENTLY VERIFIED','',
 'RESEARCH EVENTS'];
 for(const e of events.slice(0,100))lines.push('#'+e.seq+' '+e.occurredAt+' '+e.type+' | '+e.payloadHash);
 if(readiness){
  lines.push('','INDEPENDENT CHALLENGES (NOT AUTOMATED FACT CHECKING)');
  for(const x of readiness.issues)lines.push(x.priority+' / '+x.id+': '+x.statement+' | Needs: '+x.missingEvidence);
 }
 lines.push('','PROVENANCE WARNING: Source field coverage is not a probability of ownership or company risk.',
  'NO INVESTMENT RECOMMENDATION · NO HISTORICAL FIRST-AVAILABLE CERTIFICATION');
 return lines.join('\n')+'\n';
}
export function createExposureProofService({store,assets,frs,sec,now=()=>new Date()}={}){
 if(!store||!assets||!frs||!sec)throw new TypeError('Evidence store, saved assets and official source readers required');
 const caseOpened=async id=>{
  const h=await store.history(id),e=h.events.find(x=>x.type==='CASE_OPENED');
  return {h,opened:{...e.payload,caseId:id}};
 };
 async function sourceSnapshot(id){
  const {opened}=await caseOpened(id);
  const results=await Promise.allSettled([
   frs.lookup(opened.claim.epaRegistryId),sec.lookup(opened.assetCik)]);
  const e=results[0].status==='fulfilled'?results[0].value:null,
   s=results[1].status==='fulfilled'?results[1].value:null;
  // Source data is server-generated, not supplied by the client.
  const snapshot={epa:e?{status:e.status,registryId:e.registryId,record:e.record,sourceFetchedAt:e.fetchedAt,
   recordHash:e.recordHash||null}:null,
   sec:s?{source:s.source,cik:s.cik,registrantName:s.registrantName,tickers:s.tickers,
    fetchedAt:s.fetchedAt,latestFilingDate:s.latestFilingDate,identityScope:s.identityScope}:null,
   status:{epa:e?.status||'SOURCE_UNAVAILABLE',sec:s?'CURRENT_REGISTRANT_ONLY':'SOURCE_UNAVAILABLE'}};
  const prior=(await store.history(id)).events.filter(x=>x.type==='SOURCE_CAPTURED').at(-1);
  const priorHash=prior?.payload.snapshotHash||null,
   sourceHash=hash({epa:snapshot.epa?{status:snapshot.epa.status,
    registryId:snapshot.epa.registryId,recordHash:snapshot.epa.recordHash}:null,
    sec:snapshot.sec?{cik:snapshot.sec.cik,registrantName:snapshot.sec.registrantName,
     tickers:snapshot.sec.tickers,latestFilingDate:snapshot.sec.latestFilingDate}:null});
  const result=await store.addSource(id,{...snapshot,snapshotHash:sourceHash,previousSnapshotHash:priorHash,
   changedFromPriorCapture:priorHash!==null&&priorHash!==sourceHash,
   independentIssuerLinkVerified:false,pointInTimeEligible:false});
  return {record:result,snapshot,diff:{previousSnapshotHash:priorHash,currentSnapshotHash:sourceHash,
   changed:priorHash!==null&&priorHash!==sourceHash},
   warning:'Current source metadata only; SEC/EPA relationship and historical first-availability remain unproven'};
 }
 async function assess(id,{asOf=null,refresh=false}={}){
  if(refresh!==false&&refresh!==true)throw fail('Invalid refresh flag');
  const {h,opened}=await caseOpened(id);
  const asset=(await assets()).assets.find(x=>x.id===opened.claim.assetId);
  if(!asset)throw fail('Referenced local asset has disappeared',409);
  // Assessment is offline by default: use explicitly captured official evidence, never invisible provider reads.
  const last=h.events.filter(x=>x.type==='SOURCE_CAPTURED').at(-1);
  const snapshot=last?.payload||null;
  const readiness=scoreProofReadiness({opened,assets:asset,frs:snapshot?.epa,sec:snapshot?.sec,asOf});
  const human=h.events.filter(x=>['CHALLENGE_ADDED','REBUTTAL_ADDED','REVIEW_RECORDED'].includes(x.type));
  return {caseId:id,opened,officialEvidenceCaptured:Boolean(snapshot),lastSourceSnapshot:snapshot,
   sourceSnapshotHash:snapshot?.snapshotHash||null,analysis:readiness,
   reviewDisposition:human.filter(x=>x.type==='REVIEW_RECORDED').at(-1)?.payload.disposition||'NEEDS_EVIDENCE',
   humanChallenges:human.filter(x=>x.type==='CHALLENGE_ADDED').map(x=>x.payload),
   rebuttals:human.filter(x=>x.type==='REBUTTAL_ADDED').map(x=>x.payload),
   auditEvents:h.events.map(x=>({seq:x.seq,type:x.type,at:x.occurredAt,eventHash:x.eventHash})),
   verifiedIssuerOwnership:false,validatedFinancialImpact:false};
 }
 return {catalog:()=>({schemaVersion:1,enabled:true,featureSet:[
  'SEC_REGISTRANT_LOOKUP','EPA_FACILITY_SNAPSHOTS','SOURCE_DIFFS','LEGAL_OPERATOR_ASSERTIONS',
  'EFFECTIVE_DATES','SEC_SUBSIDIARY_CITATIONS','APPEND_ONLY_RESEARCH_AUDIT','SOURCE_CONFLICT_CHECKS',
  'HISTORICAL_ASOF_GATES','ANTAGONISTIC_ISSUE_QUEUE','HUMAN_CHALLENGES','SOURCE_CITED_REBUTTALS',
  'REVIEW_DISPOSITIONS','REPORT_EXPORT','CASE_FILTERS'],
  humanApprovalCanVerifyOwnership:false,autonomousAgentsActive:false,liveTradingEnabled:false,
  proofStatus:'UNVERIFIED_OPERATOR_CIK_LINK'}),
  list:options=>store.list(options),integrity:()=>store.integrity(),history:id=>store.history(id),
  openCase:input=>store.addCase(input,assets),sourceSnapshot,assess,
  challenge:(id,input)=>store.challenge(id,input),rebut:(id,input)=>store.rebut(id,input),
  review:(id,input)=>store.review(id,input),
  async report(id,{asOf=null}={}){const a=await assess(id,{asOf});return exposureReportText({
   opened:a.opened,events:(await store.history(id)).events,readiness:a.analysis});}
 };
}
const writeJson=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function createExposureProofApi({service=null,enabled=false}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/exposure-proof/'))return false;
  if(!enabled||!service){writeJson(res,200,{enabled:false,reason:'RESEARCH_EXPOSURE_PROOF_ENABLED is not enabled on loopback'});return true;}
  try{
   const name=url.pathname.slice('/api/exposure-proof/'.length),q=url.searchParams;
   const permitted={catalog:[],integrity:[],cases:['symbol','limit'],case:['id','asOf'],
    history:['id'],report:['id','asOf']};
   if(req.method==='GET'){
    if(!Object.hasOwn(permitted,name)||[...q.keys()].some(k=>!permitted[name].includes(k)||q.getAll(k).length!==1))
     throw fail('Unknown or invalid research case query',404);
    const id=q.get('id');
    if(name==='catalog'&&q.size===0){writeJson(res,200,service.catalog());return true;}
    if(name==='integrity'&&q.size===0){writeJson(res,200,await service.integrity());return true;}
    if(name==='cases'){writeJson(res,200,await service.list({
     limit:q.has('limit')?Number(q.get('limit')):50,symbol:q.get('symbol')}));return true;}
    if(!CASE.test(id||''))throw fail('Valid case ID required');
    if(name==='history'){writeJson(res,200,await service.history(id));return true;}
    if(name==='case'){writeJson(res,200,await service.assess(id,{asOf:q.get('asOf')}));return true;}
    if(name==='report'){const result=await service.report(id,{asOf:q.get('asOf')});
     res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store',
      'Content-Disposition':'attachment; filename="exposure-proof-report.txt"','X-Content-Type-Options':'nosniff'});
     res.end(result);return true;}
    throw fail('Unrecognized read-only research route',404);
   }
   if(req.method!=='POST')throw fail('Unsupported request method',405);
   if(!['cases','capture','challenge','rebuttal','review'].includes(name)||[...q.keys()].some(k=>k!=='id')||
    (name==='cases'&&q.size!==0)||(name!=='cases'&&(q.size!==1||!CASE.test(q.get('id')||''))))
    throw fail('Unsupported research case write route',404);
   const origin=req.headers.origin,host=req.headers.host;
   let o;try{o=new URL(origin);}catch{throw fail('Same-origin browser required',403);}
   if(!['http:','https:'].includes(o.protocol)||o.host!==host||
    req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    throw fail('Same-origin JSON required',403);
   let raw='';for await(const part of req){raw+=part.toString('utf8');
    if(Buffer.byteLength(raw)>7000)throw fail('Research request too large',413);}
   let body;try{body=JSON.parse(raw);}catch{throw fail('Research request needs JSON');}
   const id=q.get('id');
   if(name==='cases'){writeJson(res,201,await service.openCase(body));return true;}
   if(name==='capture'){if(!body||Object.keys(body).length!==0)throw fail('Source snapshot is strictly server-sourced');
    writeJson(res,201,await service.sourceSnapshot(id));return true;}
   if(name==='challenge'){writeJson(res,201,await service.challenge(id,body));return true;}
   if(name==='rebuttal'){writeJson(res,201,await service.rebut(id,body));return true;}
   if(name==='review'){writeJson(res,201,await service.review(id,body));return true;}
   throw fail('Unsupported case action',404);
  }catch(e){writeJson(res,[400,403,404,405,409,413,429,502,503,504,507].includes(e?.status)?e.status:502,
   {error:e?.status?e.message:'Casebook unavailable'});}
  return true;
 };
}
