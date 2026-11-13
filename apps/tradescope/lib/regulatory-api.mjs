/** Read-only SEC regulatory and tax research + explicitly enabled local capture.
 * This is NOT an authenticated, publicly deployable SaaS API.
 */
import {analyzePublicTaxDisclosures} from './tax-disclosures.mjs';
const VALID_SYMBOL=/^[A-Z][A-Z0-9.-]{0,11}$/;
const VALID_ACCESSION=/^\d{10}-\d{2}-\d{6}$/;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const fail=(text,status=400)=>Object.assign(new Error(text),{status});
const iso=()=>new Date().toISOString();
function send(res,status,body){if(res.writableEnded||res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});res.end(JSON.stringify(body));}
function loopback(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);}
function sameOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')return false;
 if(!req.headers.origin)return true;
 try{return new URL(req.headers.origin).host===req.headers.host&&new URL(req.headers.origin).protocol==='http:';}catch{return false;}}
async function body(req){if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail('Send application/json',415);
 const parts=[];let size=0;for await(const part of req){size+=part.byteLength;if(size>2048)throw fail('Capture request exceeds 2KB',413);parts.push(part);}
 try{const parsed=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{throw fail('Capture request must be a JSON object');}}
const symbolOf=u=>{const value=(u.searchParams.get('symbol')||'').toUpperCase();if(!VALID_SYMBOL.test(value))throw fail('Choose a valid registered issuer symbol');return value;};
const safeError=error=>{
 const status=[400,403,404,409,413,415,422,429,503,504].includes(error?.status)?error.status:502;
 return {status,message:status===502?'Regulatory research provider or local store is unavailable':String(error.message||'Request rejected').slice(0,240)};
};

export function createRegulatoryApi({sources,filingReader,classifyCorporateEvent,corporateStore,eventArchive,caseStore,captureEnabled=false,now=Date.now}={}){
 if(typeof sources?.companyFacts!=='function'||typeof sources?.filings!=='function'||typeof filingReader?.read!=='function'||typeof classifyCorporateEvent!=='function'||!corporateStore||!eventArchive)throw new TypeError('Regulatory source, filing reader, classifier, alerts and archive are required');
 async function getFiling(symbol,accession){if(!VALID_ACCESSION.test(accession||''))throw fail('Choose a valid SEC filing accession');
  const result=await sources.filings(symbol);const filing=result.filings.find(item=>item.accession===accession);
  if(!filing)throw fail('Filing is not in the issuer\'s current official submissions results',404);
  return filing;}
 async function classify(symbol,accession){const filing=await getFiling(symbol,accession);
  const document=await filingReader.read({filing,symbol});
  return classifyCorporateEvent({filing,document,symbol,now:now(),importMode:'discovery'});
 }
 return async function handle(req,res,u){
  if(!u.pathname.startsWith('/api/regulatory/'))return false;
  try{
   const endpoint=u.pathname.slice('/api/regulatory/'.length),method=req.method;
   if(method==='GET'&&endpoint==='tax'){
    const symbol=symbolOf(u),asOf=u.searchParams.get('asOf')||new Date(now()).toISOString().slice(0,10);
    if(!day(asOf)||asOf>new Date(now()).toISOString().slice(0,10))throw fail('asOf must be a past or present YYYY-MM-DD date');
    const data=await sources.companyFacts(symbol);
    send(res,200,analyzePublicTaxDisclosures(data,{symbol,asOf}));return true;
   }
   if(method==='GET'&&endpoint==='filings'){
    const symbol=symbolOf(u),data=await sources.filings(symbol);
    send(res,200,{source:'SEC_EDGAR',symbol,fetchedAt:data.fetchedAt,filings:data.filings,limitations:['Filing form and headline do not establish a regulatory violation. Use filing-analysis for cited passages.']});return true;
   }
   if(method==='GET'&&endpoint==='filing-analysis'){
    const symbol=symbolOf(u),accession=u.searchParams.get('accession');
    send(res,200,{analysis:await classify(symbol,accession),persisted:false,limitations:['Read-only analysis; GET never writes an alert or archive revision.']});return true;
   }
   if(method==='GET'&&endpoint==='alerts'){
    const symbol=u.searchParams.get('symbol')||undefined,status=u.searchParams.get('status')||'all';
    send(res,200,{alerts:await corporateStore.list({symbol,status}),source:'LOCAL_CORPORATE_ALERT_STORE'});return true;
   }
   if(method==='GET'&&endpoint==='archive'){
    const symbol=u.searchParams.get('symbol')||undefined;
    send(res,200,await eventArchive.list({source:'SEC_EDGAR',symbol,limit:Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||30)||30))}));return true;
   }

   if(method==='GET'&&endpoint==='archive/revisions'){
    const eventId=u.searchParams.get('eventId'),limit=Number(u.searchParams.get('limit')||50),cursor=u.searchParams.get('cursor')||undefined;
    send(res,200,await eventArchive.revisions(eventId,{limit,cursor}));return true;
   }
   if(method==='GET'&&endpoint==='archive/revision'){
    const eventId=u.searchParams.get('eventId'),revisionId=u.searchParams.get('revisionId');
    send(res,200,await eventArchive.getRevision(eventId,revisionId));return true;
   }
   if(method==='GET'&&endpoint==='archive/at-cutoff'){
    const eventId=u.searchParams.get('eventId'),cutoff=u.searchParams.get('cutoff');
    send(res,200,await eventArchive.atCutoff(eventId,cutoff));return true;
   }
   if(method==='POST'&&endpoint==='investigate'){
    if(!captureEnabled)throw fail('Investigation handoff requires explicitly enabled local capture',403);
    if(!loopback(req)||!sameOrigin(req))throw fail('Local investigation changes require loopback and same origin',403);
    if(!caseStore?.createFromArchivedRevision||!caseStore?.attachArchivedRevision)throw fail('Investigation store is not connected',503);
    const input=await body(req);
    if(!VALID_SYMBOL.test(input.symbol||'')||typeof input.eventId!=='string'||typeof input.revisionId!=='string')throw fail('Select an archived SEC revision and registered symbol');
    const archive=await eventArchive.getRevision(input.eventId,input.revisionId);
    if(archive.source!=='SEC_EDGAR'||!archive.revision?.event?.symbols?.includes(input.symbol))throw fail('Archived SEC revision does not match selected issuer symbol',422);
    if(input.caseId!==undefined){
     if(typeof input.caseId!=='string'||!/^CASE-[a-f0-9-]{36}$/.test(input.caseId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw fail('Existing case handoff requires case ID and expected revision');
     const record=await caseStore.attachArchivedRevision(input.caseId,{archive,symbol:input.symbol,expectedRevision:input.expectedRevision});
     send(res,200,{case:record,action:'attached_existing',source:'SEC_EDGAR',knowledgeBasis:'local_archived_revision'});return true;
    }
    const record=await caseStore.createFromArchivedRevision({archive,symbol:input.symbol});
    send(res,201,{case:record,action:'created_or_existing',source:'SEC_EDGAR',knowledgeBasis:'local_archived_revision'});return true;
   }
   if(method==='POST'&&endpoint==='capture'){
    if(!captureEnabled)throw fail('Local regulatory capture is disabled; set REGULATORY_LOCAL_CAPTURE_ENABLED=true only for loopback development',403);
    if(!loopback(req)||!sameOrigin(req))throw fail('Local capture requests must originate from loopback and the same origin',403);
    const input=await body(req);if(!VALID_SYMBOL.test(input.symbol||'')||!VALID_ACCESSION.test(input.accession||''))throw fail('Supply a registered uppercase symbol and SEC accession');
    const analysis=await classify(input.symbol,input.accession);
    // Archive first so that knowledge-time evidence survives an alert-store failure; retries are idempotent.
    const saved=await eventArchive.ingest({source:'SEC_EDGAR',event:{id:analysis.sourceEventId,source:'SEC_EDGAR',sourceUrl:analysis.sourceUrl,
      headline:analysis.headline,type:analysis.type,category:analysis.category,symbols:[analysis.symbol],cik:analysis.cik,
      publishedAt:analysis.publishedAt,filingDate:analysis.filingDate,periodEnd:analysis.periodEnd,form:analysis.form,
      accession:analysis.accession,classificationVersion:analysis.classificationVersion,contentRevision:analysis.contentRevision,
      classifications:analysis.classifications,evidence:analysis.evidence,summary:analysis.summary},
      historicalImport:analysis.retrospective,captureKind:'derived_enrichment'});
    const alert=await corporateStore.record(analysis);
    send(res,201,{archive:{action:saved.action,eventId:saved.eventId,revisionId:saved.revision.id,capturedAt:saved.revision.capturedAt},
      corporate:{action:alert.action,alert:alert.alert},source:'SEC_EDGAR',localCaptureOnly:true});return true;
   }
   send(res,405,{error:'Unsupported regulatory endpoint or method'});return true;
  }catch(error){const {status,message}=safeError(error);send(res,status,{error:message});return true;}
 };
}