/**
 * v0.41 P0 Sprint 6 — point-in-time source corroboration case desk.
 * An evidence inventory is NOT independent legal ownership adjudication.
 * This module never requests external URLs or writes a source journal.
 */
import {createHash} from 'node:crypto';

const failure=(msg,status=400)=>Object.assign(new Error(msg),{status});
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const utc=v=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&
 Number.isFinite(Date.parse(v));
const ID=/^crosswalk-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
export const CORROBORATION_CASE_RULE='SOURCE-CORROBORATION-0.41.1';

const sum=(array,fn)=>array.filter(fn);
const row=(code,title,state,sourceIds=[],note='')=>({
 code,title,state,sourceIds,note
});
const evidence=(id,provider,subject,predicate,object,url,capturedAt,bodySha256=null,qualification='SOURCE_OBSERVATION_ONLY')=>({
 id,provider,subject,predicate,object,sourceUrl:url||null,firstCapturedAt:capturedAt||null,
 bodySha256:DIGEST.test(bodySha256||'')?bodySha256:null,qualification
});

export function assembleCorroborationCase({relationshipId,asOf,facility,graph,review}={}){
 if(!ID.test(relationshipId||'')||!utc(asOf)||!facility||!graph||!review)
  throw failure('Case requires a valid captured relationship, cutoff and three local source inventories');
 const relation=(facility.relationships||[]).find(x=>x.relationshipId===relationshipId);
 if(!relation)throw failure('Relationship not captured by the selected as-of cutoff',404);
 const captured=(row,name)=>{
  if(!utc(row?.capturedAt)||Date.parse(row.capturedAt)>Date.parse(asOf))
   throw failure(name+' lacks a valid source capture clock at this cutoff',500);
 };
 captured(relation,'Relationship claim');
 const company=(facility.companies||[]).find(x=>x.cik===relation.cik);
 const site=(facility.facilities||[]).find(x=>x.registryId===relation.registryId);
 if(!company||!site)throw failure('Local issuer/facility source identity missing at selected cutoff',409);
 captured(company,'SEC filer');captured(site,'EPA facility');
 const docs=(review.documents||[]).filter(x=>x.relationshipId===relationshipId);
 const proposals=(review.proposals||[]).filter(x=>x.relationshipId===relationshipId);
 const linking=(graph.edges||[]).filter(x=>x.type==='OPERATOR_IDENTIFIER_CANDIDATE'&&
  x.from==='cik:'+company.cik&&typeof x.to==='string'&&x.to.startsWith('lei:'));
 const leiCandidates=linking.map(edge=>{
  const node=(graph.nodes||[]).find(n=>n.id===edge.to&&n.kind==='LEGAL_ENTITY');
  return node?{lei:node.lei,name:node.label,capturedAt:node.capturedAt,
   associationCapturedAt:edge.capturedAt,
   status:'UNVERIFIED_ANALYST_IDENTIFIER_CANDIDATE',
   sourceUrl:edge.sourceEvidence||null,
   sourceDigest:null}:null;
 }).filter(Boolean).sort((a,b)=>a.lei.localeCompare(b.lei));
 const leiSet=new Set(leiCandidates.map(x=>x.lei));
 const sourceParents=(graph.level2Records||[]).filter(x=>leiSet.has(x.childLei));
 const graphConflicts=(graph.relationshipConflicts||[]).filter(x=>leiSet.has(x.childLei));
 const supportedDocs=docs.filter(d=>d.quoteMatched===true&&d.sourceUrl===relation.evidenceUrl&&
  DIGEST.test(d.sourceSha256||''));
 const mismatched=docs.filter(d=>d.sourceUrl!==relation.evidenceUrl);
 for(const d of docs)captured(d,'SEC filing capture');
 for(const p of proposals){
  if(!utc(p.claimRecordedAt)||Date.parse(p.claimRecordedAt)>Date.parse(asOf))
   throw failure('Proposed relationship interval is newer than cutoff',500);
 }
 for(const e of linking)captured(e,'Candidate identifier association');
 for(const g of sourceParents)captured(g,'GLEIF Level 2 relationship');
 const periodClaims=proposals.map(p=>({
  proposalId:p.proposalId,
  sourceDocumentId:p.documentId,
  operatorClaimedFrom:p.claimedEffectiveFrom,
  operatorClaimedThrough:p.claimedEffectiveTo,
  firstRecordedAt:p.claimRecordedAt,
  reviewStatus:p.assessment?.status||'NO_REVIEW',
  aggregateAssessment:p.assessment?.agreedDecision||null,
  authenticatedReviewers:false,effectiveDatesVerified:false,
  legalOwnershipVerified:false
 })).sort((a,b)=>a.firstRecordedAt.localeCompare(b.firstRecordedAt)||
  a.proposalId.localeCompare(b.proposalId));
 const providerEvidence=[
  evidence('EPA:'+site.registryId,'US_EPA_FRS','FRS:'+site.registryId,
   'SOURCE_REPORTS_PHYSICAL_SITE',site.facilityName,site.providerUrl,site.capturedAt,
   site.bodySha256,'EPA_REPORTED_LOCATION_NOT_TITLE_SURVEY'),
  evidence('SEC:'+company.cik,'US_SEC_EDGAR','CIK:'+company.cik,
   'SOURCE_REPORTS_FILINGS_ENTITY',company.companyName,company.sourceUrl,company.capturedAt,
   company.bodySha256,'SEC_FILER_IDENTITY_NOT_SITE_OWNERSHIP')
 ];
 for(const doc of docs){
  providerEvidence.push(evidence('SEC_DOC:'+doc.documentId,'US_SEC_EDGAR',
   'CIK:'+company.cik,doc.quoteMatched?'REQUESTED_QUOTE_MATCHED':'REQUESTED_QUOTE_NOT_FOUND',
   doc.excerpt,doc.sourceUrl,doc.capturedAt,doc.sourceSha256,
   'EXACT_TEXT_MATCH_NOT_DOCUMENT_MEANING_OR_LEGAL_PROOF'));
 }
 for(const item of leiCandidates){
  providerEvidence.push(evidence('GLEIF:'+item.lei,'GLEIF',
   'LEI:'+item.lei,'SOURCE_REPORTS_LEGAL_ENTITY_IDENTITY',item.name,
   item.sourceUrl,item.capturedAt,null,
   'CIK_TO_LEI_ASSOCIATION_REMAINS_OPERATOR_CANDIDATE'));
 }
 for(const item of sourceParents){
  providerEvidence.push(evidence('GLEIF_LEVEL2:'+item.childLei,'GLEIF',
   'LEI:'+item.childLei,'SOURCE_REPORTS_ACCOUNTING_CONSOLIDATION_PARENT',
   item.parentLei||'NONE_REPORTED',item.sourceUrl,item.capturedAt,
   item.bodySha256,'ACCOUNTING_PARENT_NOT_LEGAL_SHARE_OWNERSHIP'));
 }
 providerEvidence.sort((a,b)=>a.id.localeCompare(b.id));
 const matrix=[
  row('FACILITY_RECORD','Facility identity','SOURCE_REPORTED',['EPA:'+site.registryId],
   'EPA registry metadata describes a site; not verified legal site boundaries'),
  row('SEC_FILER_RECORD','SEC filer identity','SOURCE_REPORTED',['SEC:'+company.cik],
   'A CIK identifies a filing entity; not an owner of any EPA site'),
  row('SEC_FILING_QUOTE','Text captured from linked SEC filing',
   supportedDocs.length?'LITERAL_TEXT_OBSERVED':'INSUFFICIENT',
   supportedDocs.map(d=>'SEC_DOC:'+d.documentId),
   'Captured text is not independently adjudicated company-facility legal evidence'),
  row('CIK_LEI_IDENTITY','Authoritative CIK ↔ LEI identity',
   leiCandidates.length?'ANALYST_CANDIDATE_ONLY':'UNKNOWN',
   leiCandidates.map(x=>'GLEIF:'+x.lei),
   'Separate provider identifiers have no certified common-entity mapping'),
  row('ACCOUNTING_PARENT','GLEIF Level 2 parent',
   graphConflicts.length?'SOURCE_CONFLICT':
    sourceParents.some(x=>x.parentLei)?'GLEIF_SOURCE_REPORTED_ONLY':'UNKNOWN',
   sourceParents.map(x=>'GLEIF_LEVEL2:'+x.childLei),
   'Accounting consolidation is not legal stock ownership or a facility operator'),
  row('EFFECTIVE_INTERVAL','Independent legal relationship effective dates',
   periodClaims.length?'OPERATOR_PROPOSED_ONLY':'UNKNOWN',
   [],'Proposed dates cannot backdate local knowledge or prove legal effective dates'),
  row('INDEPENDENT_REVIEW','Authenticated independent adjudication',
   'NOT_AVAILABLE',[],'v0.38 reviewer aliases are not independently authenticated'),
  row('FACILITY_OWNERSHIP','Independently corroborated company–facility owner/operator',
   'NOT_VERIFIED',[],'No independent legal title / operating agreement / subsidiary-to-site chain'),
  row('FINANCIAL_EXPOSURE','Verified impact, revenue materiality and return attribution',
   'NOT_MEASURED',[],'No source-linked incident losses or market causal study')
 ];
 const objections=[];
 if(!supportedDocs.length)objections.push('NO_MATCHED_CAPTURABLE_SEC_DOCUMENT');
 if(mismatched.length)objections.push('CAPTURED_DOCUMENT_URL_MISMATCHES_RELATIONSHIP');
 if(!leiCandidates.length)objections.push('NO_CIK_LEI_IDENTIFIER_CANDIDATE');
 if(leiCandidates.length)objections.push('CIK_LEI_LINK_IS_NOT_AUTHORITATIVELY_VERIFIED');
 if(!sourceParents.some(x=>x.parentLei))objections.push('NO_GLEIF_REPORTED_PARENT_FOR_LINKED_LEI');
 if(graphConflicts.length)objections.push('CONFLICTING_GLEIF_PARENT_RECORDS');
 if(periodClaims.some(p=>p.reviewStatus==='DISPUTED'))objections.push('HUMAN_REVIEWER_DISAGREEMENT');
 if(periodClaims.some(p=>p.reviewStatus==='TWO_UNAUTHENTICATED_ALIASES_AGREE'))
  objections.push('REVIEWER_AGREEMENT_IS_NOT_AUTHENTICATED');
 if(!periodClaims.length)objections.push('NO_PROPOSED_EFFECTIVE_PERIOD');
 objections.push('INDEPENDENT_SITE_OWNER_OR_OPERATOR_EVIDENCE_REQUIRED');
 objections.push('DISTINCT_SOURCE_PROVIDERS_DO_NOT_VALIDATE_SAME_PROPOSITION');
 objections.push('HAZARD_AND_FINANCIAL_MATERIALITY_NOT_ESTABLISHED');
 const sources=[...new Set(providerEvidence.map(x=>x.provider))].sort();
 const core={schemaVersion:1,ruleVersion:CORROBORATION_CASE_RULE,
  relationshipId,asOf,
  subject:{cik:company.cik,companyName:company.companyName,tickers:company.tickers||[],
   frs:site.registryId,facilityName:site.facilityName,
   humanRelationshipType:relation.relationshipType,claimRecordedAt:relation.capturedAt,
   officialFacilityOwnershipVerified:false},
  leiCandidates,gleifLevel2:sourceParents.map(x=>({childLei:x.childLei,parentLei:x.parentLei,
   capturedAt:x.capturedAt,periods:x.periods||[],sourceUrl:x.sourceUrl,
   originalEffectiveDatesVerified:false,legalOwnerVerified:false})),
  reportedParentConflicts:graphConflicts.map(x=>({childLei:x.childLei,
   directParentIdentity:x.sourceIdentityParent,level2RelationshipParent:x.sourceLevel2Parent,
   status:'SOURCE_CONFLICT_UNRESOLVED'})),
  proposedIntervals:periodClaims,sourceProvidersObserved:sources,
  providerEvidence,corroborationMatrix:matrix,
  antiAgentObjections:objections,
  decision:{status:graphConflicts.length||periodClaims.some(x=>x.reviewStatus==='DISPUTED')?
    'CONFLICTED_RESEARCH_LEAD':'UNVERIFIED_RESEARCH_LEAD',
   relationshipLegalOwnershipVerified:false,facilityOperatorVerified:false,
   supplyChainRelationshipVerified:false,independentSamePropositionCorroboration:false,
   originalFirstPublishedAtVerified:false,financialMaterialityVerified:false,
   predictedSecurityReturn:null},
  disclosure:'Official identity records and matching SEC filing text do not prove a legal company-to-site relationship. Multiple providers observe different propositions; two unauthenticated reviewer aliases cannot establish ground truth.'};
 return {...core,manifestSha256:sha(core)};
}
export function createCorroborationDesk({facilityService,entityGraph,relationshipVerifier,
 enabled=true,now=()=>new Date().toISOString()}={}){
 if(!facilityService?.view||!entityGraph?.view||!relationshipVerifier?.view)
  throw TypeError('Corroboration desk requires three existing point-in-time local research services');
 const clock=()=>{const t=now();if(!utc(t))throw failure('Corroboration desk clock unavailable',503);return t;};
 const assertLocal=()=>{if(!enabled)throw failure('Corroboration desk disabled outside loopback host',403);};
 const cutoff=asOf=>{
  const t=asOf||clock();
  if(!utc(t)||Date.parse(t)>Date.parse(clock()))
   throw failure('As-of cutoff must be a nonfuture UTC instant');
  return t;
 };
 async function inventory({asOf=null}={}){
  assertLocal();const t=cutoff(asOf);
  const fac=await facilityService.view({asOf:t,radiusKm:1});
  return {ruleVersion:CORROBORATION_CASE_RULE,asOf:t,
   relationships:(fac.relationships||[]).map(x=>({
    relationshipId:x.relationshipId,registryId:x.registryId,cik:x.cik,
    relationshipType:x.relationshipType,capturedAt:x.capturedAt,
    status:'HUMAN_RESEARCH_CLAIM_UNVERIFIED'
   })).filter(x=>ID.test(x.relationshipId||'')),
   disclaimer:'Saved unverified relationship inventory; no claim of independent company facility ownership.'};
 }
 async function dossier({relationshipId,asOf=null}={}){
  assertLocal();const t=cutoff(asOf);
  if(!ID.test(relationshipId||''))throw failure('Choose a valid captured relationship ID');
  const [facility,graph,review]=await Promise.all([
   facilityService.view({asOf:t,radiusKm:1}),
   entityGraph.view({asOf:t}),
   relationshipVerifier.view({asOf:t})
  ]);
  return assembleCorroborationCase({relationshipId,asOf:t,facility,graph,review});
 }
 const catalog=()=>({enabled,version:CORROBORATION_CASE_RULE,
  sourceProviders:['US_EPA_FRS','US_SEC_EDGAR','GLEIF'],
  automaticLegalProof:false,externalProviderRequests:false,
  endpoints:['inventory','case'],
  note:'Read-only deterministic replay of captured source metadata; no new upstream fetch, no inferred legal ownership.'});
 return {catalog,inventory,dossier};
}
const send=(res,status,value)=>{res.writeHead(status,{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
 res.end(JSON.stringify(value));};
export function createCorroborationCaseApi({desk}={}){
 if(!desk?.inventory||!desk?.dossier)throw TypeError('Corroboration desk required');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/corroboration-case/'))return false;
  try{
   if(req.method!=='GET')throw failure('Corroboration cases are read-only',405);
   const operation=url.pathname.slice('/api/corroboration-case/'.length);
   if(operation==='catalog'&&!url.searchParams.size)send(res,200,desk.catalog());
   else if(operation==='inventory'){
    if([...url.searchParams.keys()].some(x=>x!=='asOf'||url.searchParams.getAll(x).length!==1))
     throw failure('Unexpected inventory filter');
    send(res,200,await desk.inventory({asOf:url.searchParams.get('asOf')||null}));
   }else if(operation==='case'){
    if([...url.searchParams.keys()].some(x=>!['relationshipId','asOf'].includes(x)||
       url.searchParams.getAll(x).length!==1))
     throw failure('Unexpected case filter');
    const id=url.searchParams.get('relationshipId');
    if(!ID.test(id||''))throw failure('Valid relationship ID is required');
    send(res,200,await desk.dossier({
     relationshipId:id,asOf:url.searchParams.get('asOf')||null}));
   }else throw failure('Unknown source-corroboration endpoint',404);
  }catch(e){
   const status=[400,403,404,405,409,500,503].includes(e?.status)?e.status:503;
   send(res,status,{error:e?.status?e.message:'Corroboration case unavailable'});
  }
  return true;
 };
}
