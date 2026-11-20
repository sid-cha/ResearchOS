/**
 * Current SEC EDGAR registrant identity, not a subsidiary ownership verifier.
 * https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const CIK=/^\d{10}$/;
const secName=x=>typeof x==='string'&&x.length<=240?x.trim():null;
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const SEC='https://data.sec.gov/submissions/';
export function secSubmissionUrl(cik){
 if(typeof cik!=='string'||!CIK.test(cik))throw fail('SEC CIK must contain exactly ten digits');
 return new URL(SEC+'CIK'+cik+'.json');
}
export function normalizeSecRegistrant(raw,{cik,fetchedAt}={}){
 secSubmissionUrl(cik);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.cik===undefined||
  !Number.isSafeInteger(Number(raw.cik))||String(raw.cik).padStart(10,'0')!==cik||
  !secName(raw.name)||!Array.isArray(raw.tickers)||raw.tickers.length>30||
  !Array.isArray(raw.exchanges)||raw.exchanges.length>30)throw fail('SEC submissions identity schema mismatch',502);
 const recent=raw.filings?.recent||{},arrays=['form','filingDate','accessionNumber','primaryDocument'];
 if(arrays.some(k=>!Array.isArray(recent[k])||recent[k].length>5000))throw fail('SEC filing array schema mismatch',502);
 const filings=[];
 const count=Math.min(25,...arrays.map(k=>recent[k].length));
 for(let i=0;i<count;i++){
  const accession=recent.accessionNumber[i],form=recent.form[i],file=recent.primaryDocument[i];
  if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!day(recent.filingDate[i])||
    !/^[A-Za-z0-9-]{1,20}$/.test(form)||typeof file!=='string'||
    !/^[A-Za-z0-9._-]{1,120}$/.test(file))continue;
  const noDash=accession.replaceAll('-',''),plainCik=String(Number(cik));
  filings.push({form,filingDate:recent.filingDate[i],accessionNumber:accession,
   primaryDocument:file,url:'https://www.sec.gov/Archives/edgar/data/'+plainCik+'/'+noDash+'/'+file});
 }
 return {source:'SEC_EDGAR_SUBMISSIONS_JSON',cik,registrantName:secName(raw.name),
  entityType:secName(raw.entityType),sic:typeof raw.sic==='string'?raw.sic:String(raw.sic||''),
  tickers:raw.tickers.filter(x=>typeof x==='string'&&/^[A-Z0-9.-]{1,20}$/.test(x)),
  exchanges:raw.exchanges.filter(x=>typeof x==='string').map(x=>x.slice(0,60)),
  recentFilings:filings,fetchedAt,
  sourceUrl:secSubmissionUrl(cik).href,latestFilingDate:filings[0]?.filingDate||null,
  originalPublicationTimeVerified:false,legalSubsidiaryOperatorVerified:false,
  historicalAsOfEligible:false,identityScope:'CURRENT_SEC_REGISTRANT_ONLY',
  warnings:['An official SEC CIK identifies a registrant, not the legal operator of a specific EPA-registered facility.',
   'Current SEC submission metadata is revised and must not be silently treated as an historical original filing record.']};
}
async function limitedJson(response,limit=700000){
 const type=response.headers?.get?.('content-type')||'';
 const length=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(length)&&length>limit)throw fail('SEC response exceeds size limit',502);
 if(type&&!type.toLowerCase().includes('json'))throw fail('SEC returned non-JSON data',502);
 let s='';
 if(response.body?.getReader){
  const reader=response.body.getReader();let n=0;const chunks=[];
  try{for(;;){const r=await reader.read();if(r.done)break;n+=r.value.byteLength;
   if(n>limit){await reader.cancel();throw fail('SEC response exceeds size limit',502);}
   chunks.push(Buffer.from(r.value));}}finally{reader.releaseLock();}
  s=Buffer.concat(chunks).toString('utf8');
 }else{s=await response.text();if(Buffer.byteLength(s)>limit)throw fail('SEC response exceeds size limit',502);}
 try{return JSON.parse(s);}catch{throw fail('SEC JSON invalid',502);}
}
export function createSecRegistrantLookup({fetchImpl=fetch,env=process.env,now=()=>new Date(),timeoutMs=12000}={}){
 const cache=new Map(),pending=new Map();
 async function lookup(cik){
  const url=secSubmissionUrl(cik);
  const agent=env.SEC_USER_AGENT;
  if(typeof agent!=='string'||agent.length<10||agent.length>180||
   !/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(agent))throw fail('SEC_USER_AGENT must specify a real application and contact email',503);
  const hit=cache.get(cik);if(hit?.expiry>Date.now())return structuredClone(hit.data);
  if(pending.has(cik))return structuredClone(await pending.get(cik));
  const pendingFetch=(async()=>{
   const control=new AbortController(),timer=setTimeout(()=>control.abort(),timeoutMs);
   try{
    const res=await fetchImpl(url,{method:'GET',signal:control.signal,redirect:'error',
     headers:{'User-Agent':agent,Accept:'application/json'}});
    if(!res.ok){await res.body?.cancel?.();throw fail(res.status===429?'SEC rate limit':'SEC registry metadata unavailable',res.status===429?429:502);}
    const data=normalizeSecRegistrant(await limitedJson(res),{cik,fetchedAt:now().toISOString()});
    cache.set(cik,{data,expiry:Date.now()+300000});
    if(cache.size>40)cache.delete(cache.keys().next().value);
    return data;
   }catch(e){if(e?.name==='AbortError')throw fail('SEC request timeout',504);
    if(e?.status)throw e;throw fail('SEC data source unavailable',502);
   }finally{clearTimeout(timer);}
  })();
  pending.set(cik,pendingFetch);
  try{return structuredClone(await pendingFetch);}finally{pending.delete(cik);}
 }
 return {lookup,catalog(){return {source:'SEC_EDGAR_SUBMISSIONS_JSON',configured:Boolean(env.SEC_USER_AGENT&&/@/.test(env.SEC_USER_AGENT)),
  sourceDocumentation:'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
  keyRequired:false,requiredHeader:'SEC_USER_AGENT (application plus real contact address)',
  scope:'Current SEC registrant metadata and recent filing links, NOT facility owner/subsidiary proof'};}};
}
