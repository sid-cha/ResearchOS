/**
 * v0.38 — SEC-filed relationship evidence verification pilot.
 * A literal match in an archived filing is NOT proof that a relationship exists,
 * was effective on a stated date, or has a financially material exposure.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const problem=(message,status=400)=>Object.assign(Error(message),{status});
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const dateOnly=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const linkId=x=>typeof x==='string'&&/^crosswalk-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const evidenceId=x=>typeof x==='string'&&/^evidence-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const proposalId=x=>typeof x==='string'&&/^proposal-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const reviewAlias=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{3,36}$/.test(x)&&
 !['agent','automated','researchos'].includes(x.toLowerCase());
const tidy=(x,n=640)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const exactUrl=x=>{
 try{
  const u=new URL(x);
  return u.protocol==='https:'&&['www.sec.gov','sec.gov'].includes(u.hostname)&&!u.username&&!u.password&&
   !u.port&&!u.hash&&u.href.length<=650&&
   /^\/Archives\/edgar\/data\/\d+\/[A-Za-z0-9_.\/-]+$/.test(u.pathname)&&
   !u.pathname.includes('..')&&!u.pathname.includes('//')?u.href:null;
 }catch{return null;}
};
export const RELATIONSHIP_VERIFICATION_RULE='RELATIONSHIP-PROOF-0.38.1';
export const REVIEW_CHOICES=Object.freeze(['SUPPORTS_CLAIM','REFUTES_CLAIM','INSUFFICIENT_EVIDENCE']);
function normalizedDocument(s){
 return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/\s+/g,' ').trim();
}
export async function captureSecExcerpt(url,excerpt,{fetchImpl=globalThis.fetch,timeoutMs=9000,maxBytes=300000,
 userAgent='ResearchOS research pilot / contact from repository'}={}){
 const verifiedUrl=exactUrl(url),needle=tidy(excerpt,450);
 if(!verifiedUrl)throw problem('Only the registered SEC filing document URL is permitted',403);
 if(typeof excerpt!=='string'||excerpt.trim().length<40||excerpt.length>450||needle.length<35)
  throw problem('Supply a specific 40–450 character excerpt for exact source-text matching');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const res=await fetchImpl(verifiedUrl,{method:'GET',redirect:'error',cache:'no-store',
   signal:ctrl.signal,headers:{Accept:'text/html,text/plain,application/xml,text/xml',
    'User-Agent':userAgent}});
  if(!res?.ok)throw problem('SEC source request unavailable',503);
  const mime=(res.headers?.get?.('content-type')||'').toLowerCase().split(';')[0].trim();
  if(!['text/html','text/plain','application/xml','text/xml','application/xhtml+xml'].includes(mime))
   throw problem('SEC source is not a supported text document',415);
  if(Number(res.headers?.get?.('content-length')||0)>maxBytes)
   throw problem('SEC filing document exceeds bounded capture size',413);
  if(!res.body||typeof res.body[Symbol.asyncIterator]!=='function')
   throw problem('SEC source missing bounded response stream',503);
  const chunks=[];let length=0;
  for await(const piece of res.body){
   if(!(piece instanceof Uint8Array))throw problem('SEC source response chunk malformed',503);
   length+=piece.byteLength;
   if(length>maxBytes){ctrl.abort();throw problem('SEC filing exceeded streamed capture size',413);}
   chunks.push(Buffer.from(piece));
  }
  const bytes=Buffer.concat(chunks),text=normalizedDocument(bytes.toString('utf8'));
  const target=normalizedDocument(needle);
  const index=text.toLocaleLowerCase('en-US').indexOf(target.toLocaleLowerCase('en-US'));
  return {sourceUrl:verifiedUrl,sourceSha256:sha(bytes),bytesRead:bytes.length,
   sourceContentType:mime,excerpt:needle,normalizedExcerptSha256:sha(target.toLocaleLowerCase('en-US')),
   exactExcerptFound:index!==-1,
   context:index===-1?null:tidy(text.slice(Math.max(0,index-110),index+target.length+110),650),
   documentSemanticsVerified:false,issuerOwnershipVerified:false,
   originalPublicationTimeVerified:false};
 }catch(e){if(e?.status)throw e;throw problem('SEC document could not be retrieved',503);}
 finally{clearTimeout(timer);}
}
const empty=()=>({schemaVersion:1,entries:[]});
function validateJournal(x,maxEntries){
 if(x?.schemaVersion!==1||!Array.isArray(x.entries)||x.entries.length>maxEntries)
  throw problem('Relationship verification journal has invalid schema',500);
 const ids=new Set();let prev='GENESIS',previousAt=null;
 for(const [i,e] of x.entries.entries()){
  if(!e||typeof e!=='object'||!/^verification-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id)||
   ids.has(e.id)||e.seq!==i||e.previousHash!==prev||!timestamp(e.at)||
   (previousAt&&e.at<previousAt)||!['DOCUMENT','PROPOSAL','REVIEW'].includes(e.kind)||
   !e.payload||typeof e.payload!=='object')
   throw problem('Relationship verification journal cannot be validated',500);
  const {hash:existing,...base}=e;
  if(existing!==digest(base))throw problem('Relationship verification journal digest invalid',500);
  previousAt=e.at;ids.add(e.id);prev=existing;
 }
 return x;
}
export function summarizeRelationshipReview(proposal,reviews){
 const eligible=reviews.filter(r=>r.payload.proposalId===proposal.payload.proposalId);
 if(!eligible.length)return {status:'NO_REVIEW',count:0,agreedDecision:null,
  reviewerIdentityAuthenticated:false,ownershipVerified:false};
 if(eligible.length===1)return {status:'AWAITING_SECOND_REVIEW',count:1,agreedDecision:null,
  reviewerIdentityAuthenticated:false,ownershipVerified:false};
 const matched=eligible[0].payload.vote===eligible[1].payload.vote;
 return {status:matched?'TWO_UNAUTHENTICATED_ALIASES_AGREE':'DISPUTED',
  count:2,agreedDecision:matched?eligible[0].payload.vote:null,
  reviewerIdentityAuthenticated:false,ownershipVerified:false};
}
export function createRelationshipVerifier({facilityService,filename,enabled=true,
 fetchImpl=globalThis.fetch,now=()=>new Date().toISOString(),maxEntries=240,
 maxBytes=6000000,userAgent=process.env.SEC_USER_AGENT}={}){
 if(!facilityService?.view||typeof filename!=='string'||!path.isAbsolute(filename)||
  !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>1000||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>20000000)
  throw TypeError('Relationship verifier needs facility crosswalk and bounded private journal');
 let state=null,loading=null,queue=Promise.resolve();
 const clock=()=>{const t=now();if(!timestamp(t))throw problem('Local research clock invalid',503);return t;};
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{
   try{
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.size>maxBytes)throw problem('Relationship journal exceeds size limit',500);
    return state=validateJournal(JSON.parse(await fs.readFile(filename,'utf8')),maxEntries);
   }catch(e){if(e.code==='ENOENT')return state=empty();
    throw problem('Relationship journal cannot be verified',500);}
  })().catch(e=>{loading=null;throw e;});
  return loading;
 }
 const serialized=fn=>{const task=queue.then(async()=>{await load();return fn();});queue=task.catch(()=>{});return task;};
 async function append(kind,payload){
  if(state.entries.length>=maxEntries)throw problem('Relationship journal capacity reached',409);
  const at=clock(),last=state.entries.at(-1);
  if(last&&at<last.at)throw problem('Local journal clock reversed',409);
  const base={id:'verification-'+randomUUID(),seq:state.entries.length,
   kind,at,previousHash:last?.hash||'GENESIS',payload};
  const entry={...base,hash:digest(base)},doc={schemaVersion:1,entries:[...state.entries,entry]};
  const data=JSON.stringify(doc,null,2)+'\n';
  if(Buffer.byteLength(data)>maxBytes)throw problem('Private relationship journal is full',409);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,data,{flag:'wx',mode:0o600});await fs.rename(temp,filename);}
  catch{throw problem('Unable to persist relationship record',503);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  state=doc;return entry;
 }
 const catalog=()=>({enabled,version:RELATIONSHIP_VERIFICATION_RULE,
  reviewChoices:REVIEW_CHOICES,maxEntries,sourceHosts:['www.sec.gov'],
  textMatchNotSemanticVerification:true,reviewerIdentitiesAuthenticated:false,
  warnings:['Only the source URL already attached to an v0.37 relationship can be fetched.',
   'A matching quote is not proof of legal ownership, current control, supplier contracts or economic harm.',
   'Effective dates are analyst assertions, not certified corporate history.']});
 async function links(at){
  const view=await facilityService.view({asOf:at,radiusKm:1});
  return view.relationships;
 }
 async function getLink(id,at){
  if(!linkId(id))throw problem('Invalid company–facility relationship ID');
  const relations=await links(at),found=relations.find(x=>x.relationshipId===id);
  if(!found)throw problem('Captured company–facility relationship unavailable at selected cutoff',404);
  if(!exactUrl(found.evidenceUrl))throw problem('Relationship does not have an eligible SEC document URL',403);
  return found;
 }
 async function capture({relationshipId,excerpt}={}){
  if(!enabled)throw problem('Relationship verification disabled on nonloopback host',403);
  if(!linkId(relationshipId))throw problem('Invalid relationship identifier');
  return serialized(async()=>{
   const link=await getLink(relationshipId,clock());
   const result=await captureSecExcerpt(link.evidenceUrl,excerpt,{fetchImpl,
    userAgent:userAgent||'ResearchOS research pilot / contact via repository'});
   const val={relationshipId,registryId:link.registryId,cik:link.cik,
    relationshipType:link.relationshipType,...result};
   const prior=state.entries.findLast(e=>e.kind==='DOCUMENT'&&e.payload.relationshipId===relationshipId&&
    e.payload.sourceSha256===val.sourceSha256&&e.payload.normalizedExcerptSha256===val.normalizedExcerptSha256);
   if(prior)return {deduplicated:true,record:{id:prior.id,at:prior.at,...prior.payload}};
   const entry=await append('DOCUMENT',val);
   return {deduplicated:false,record:{id:entry.id,at:entry.at,...entry.payload}};
  });
 }
 async function propose({relationshipId,documentId,effectiveFrom,effectiveTo=null,explanation}={}){
  if(!enabled)throw problem('Relationship verification disabled on nonloopback host',403);
  if(!linkId(relationshipId)||!/^verification-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(documentId||'')||
   !dateOnly(effectiveFrom)||(effectiveTo!==null&&!dateOnly(effectiveTo))||
   (effectiveTo!==null&&effectiveTo<effectiveFrom)||
   typeof explanation!=='string'||explanation.trim().length<40||explanation.length>700)
   throw problem('A captured SEC quote, valid proposed effective dates and an explanation are required');
  return serialized(async()=>{
   const link=await getLink(relationshipId,clock());
   const entry=state.entries.find(e=>e.id===documentId&&e.kind==='DOCUMENT'&&
    e.payload.relationshipId===relationshipId);
   if(!entry||!entry.payload.exactExcerptFound)throw problem('A matching source excerpt for this relationship is required before proposing',409);
   if(entry.payload.cik!==link.cik||entry.payload.registryId!==link.registryId)
    throw problem('Captured SEC source and relationship identity mismatch',409);
   const proposalId='proposal-'+randomUUID(),payload={proposalId,relationshipId,documentId,
    effectiveFrom,effectiveTo,explanation:tidy(explanation,700),
    status:'HUMAN_PROPOSED_INTERVAL_NOT_VERIFIED',
    sourcePublicationDateVerified:false,legalOwnershipVerified:false};
   await append('PROPOSAL',payload);
   return {...payload,firstRecordedAt:state.entries.at(-1).at};
  });
 }
 async function review({proposalId:pid,reviewer,vote,rationale}={}){
  if(!enabled)throw problem('Relationship verification disabled on nonloopback host',403);
  if(!proposalId(pid)||!reviewAlias(reviewer)||!REVIEW_CHOICES.includes(vote)||
   typeof rationale!=='string'||rationale.trim().length<30||rationale.length>600)
   throw problem('Valid proposal ID, distinct review alias, vote and reason required');
  return serialized(async()=>{
   const proposal=state.entries.find(e=>e.kind==='PROPOSAL'&&e.payload.proposalId===pid);
   if(!proposal)throw problem('Unknown relationship interval proposal',404);
   const prior=state.entries.filter(e=>e.kind==='REVIEW'&&e.payload.proposalId===pid);
   if(prior.length>=2||prior.some(e=>e.payload.reviewer.toLowerCase()===reviewer.toLowerCase()))
    throw problem('This reviewer alias has already voted or the pair is complete',409);
   await append('REVIEW',{proposalId:pid,reviewer,vote,
    rationale:tidy(rationale,600),identityAuthentication:'NONE'});
   const updated=state.entries.filter(e=>e.kind==='REVIEW'&&e.payload.proposalId===pid);
   return {proposalId:pid,assessment:summarizeRelationshipReview(proposal,updated)};
  });
 }
 async function view({asOf=null}={}){
  if(!enabled)throw problem('Private relationship verification disabled on nonloopback host',403);
  const at=asOf||clock();
  if(!timestamp(at)||at>clock())throw problem('Relationship cutoff must be nonfuture UTC time');
  await queue;await load();
  const sourceRelationships=await links(at),known=new Set(sourceRelationships.map(x=>x.relationshipId));
  const visible=state.entries.filter(e=>e.at<=at);
  const docs=visible.filter(e=>e.kind==='DOCUMENT'&&known.has(e.payload.relationshipId));
  const proposals=visible.filter(e=>e.kind==='PROPOSAL'&&known.has(e.payload.relationshipId));
  const reviews=visible.filter(e=>e.kind==='REVIEW');
  const items=proposals.map(p=>{
   const document=docs.find(d=>d.id===p.payload.documentId);
   const matched=document?.payload.exactExcerptFound===true;
   const assessment=summarizeRelationshipReview(p,reviews);
   return {proposalId:p.payload.proposalId,relationshipId:p.payload.relationshipId,
    documentId:p.payload.documentId,claimedEffectiveFrom:p.payload.effectiveFrom,
    claimedEffectiveTo:p.payload.effectiveTo,claimRecordedAt:p.at,
    explanation:p.payload.explanation,
    textMatchedInPreviouslyCapturedDocument:matched,
    documentCapturedAt:document?.at||null,
    sourceUrl:document?.payload.sourceUrl||null,
    sourceSha256:document?.payload.sourceSha256||null,
    assessment,relationshipOwnershipIndependentlyVerified:false,
    effectiveDatesIndependentlyVerified:false,
    evaluatedHistoricalExistenceAtCutoff: matched&&p.at<=at,
    antiAgentFlags:['TEXT_MATCH_DOES_NOT_CONFIRM_MEANING',
     'REVIEWER_ALIASES_NOT_AUTHENTICATED','EFFECTIVE_DATE_RETROACTIVE_ASSERTION',
     'OWNERSHIP_SUPPLY_CHAIN_NOT_INDEPENDENTLY_PROVEN']};
  });
  return {version:RELATIONSHIP_VERIFICATION_RULE,asOf:at,
   relationships:sourceRelationships.map(x=>({relationshipId:x.relationshipId,
    cik:x.cik,registryId:x.registryId,relationshipType:x.relationshipType,
    capturedAt:x.capturedAt,filingUrl:x.evidenceUrl,status:'OPERATOR_LINK_UNVERIFIED'})),
   documents:docs.map(e=>({documentId:e.id,relationshipId:e.payload.relationshipId,
    capturedAt:e.at,sourceUrl:e.payload.sourceUrl,sourceSha256:e.payload.sourceSha256,
    sourceBytes:e.payload.bytesRead,excerpt:e.payload.excerpt,
    quoteMatched:e.payload.exactExcerptFound,context:e.payload.context,
    documentMeaningVerified:false,originalPublicationTimeVerified:false})),
   proposals:items,
   independentOwnershipCertifications:0,estimatedFinancialEffect:null,
   warning:'Matching SEC text plus two unauthenticated reviewers does not verify legal ownership, operational supply contracts, effective dates or market losses.'};
 }
 async function close(){await queue;}
 return {catalog,capture,propose,review,view,close};
}
const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function createRelationshipVerificationApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/relationship-verification/'))return false;
  const op=url.pathname.slice('/api/relationship-verification/'.length);
  try{
   if(req.method==='GET'){
    if(op==='catalog'&&!url.searchParams.size)respond(res,200,service.catalog());
    else if(op==='view'){
     if([...url.searchParams.keys()].some(k=>k!=='asOf'||url.searchParams.getAll(k).length!==1))
      throw problem('Unsupported verification query');
     respond(res,200,await service.view({asOf:url.searchParams.get('asOf')||null}));
    }else throw problem('Unknown relationship verification endpoint',404);
   }else if(req.method==='POST'&&['capture','propose','review'].includes(op)&&!url.searchParams.size){
    if(!['127.0.0.1','localhost','::1'].includes(host)||
     req.headers['x-researchos-relationship-verification']!=='1'||
     req.headers['sec-fetch-site']==='cross-site'||
     (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))
     throw problem('Explicit local same-origin research action required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
     throw problem('JSON input is required',415);
    let raw='',size=0;
    for await(const part of req){size+=part.length;if(size>1600)throw problem('Input exceeded size limit',413);raw+=part;}
    let args;try{args=JSON.parse(raw);}catch{throw problem('Invalid JSON request');}
    const valid=op==='capture'?['relationshipId','excerpt']:
     op==='propose'?['relationshipId','documentId','effectiveFrom','effectiveTo','explanation']:
      ['proposalId','reviewer','vote','rationale'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!valid.includes(k)))
     throw problem('Unsupported relationship verification input');
    const output=op==='capture'?await service.capture(args):
     op==='propose'?await service.propose(args):await service.review(args);
    respond(res,200,output);
   }else throw problem('Unsupported verification method or operation',405);
  }catch(e){
   const status=[400,403,404,405,409,413,415,500,503].includes(e?.status)?e.status:503;
   respond(res,status,{error:e?.status?e.message:'Relationship evidence service unavailable'});
  }
  return true;
 };
}
