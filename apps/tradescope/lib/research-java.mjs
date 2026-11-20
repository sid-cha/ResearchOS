/** Optional, explicitly invoked local Java bridge. No provider secrets cross it. */
import {METRIC_DEFINITIONS,RESEARCH_SYMBOLS} from './research-catalog.mjs';
import {validEventTimestamp} from './market-events.mjs';

const fail=(message,status=503)=>Object.assign(new Error(message),{status,safeBridgeError:true});
const units=new Map(METRIC_DEFINITIONS.map(item=>[item.id,item.unit]));
const statuses=new Set(['available','insufficient_data','missing_data','unsupported','period_mismatch']);
const scalar=value=>typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
const safeText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):null;
const validDate=value=>typeof value==='string'&&(/^\d{4}-\d{2}-\d{2}$/.test(value)?Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value:Boolean(validEventTimestamp(value)));
const DIRECTORY_SOURCE='SEC_COMPANY_TICKERS_EXCHANGE',DIRECTORY_URL='https://www.sec.gov/files/company_tickers_exchange.json';
const seedCik={NVDA:'0001045810',AAPL:'0000320193',MSFT:'0000789019',TSLA:'0001318605',AMD:'0000002488',META:'0001326801',AMZN:'0001018724',PLTR:'0001321655'};
function instrumentPayload(item,capturedAt){
 if(!item||!(/^[A-Z][A-Z0-9.\-]{0,11}$/).test(item.symbol||'')||item.instrumentId!=='US_EQUITY:'+item.symbol||!['equity','ETF','unknown'].includes(item.type)||item.currency!=='USD')throw fail('Choose a supported registered research instrument',400);
 const pilot=RESEARCH_SYMBOLS.includes(item.symbol),directory=item.identitySource===DIRECTORY_SOURCE;
 const cik=typeof item.cik==='string'&&/^\d{10}$/.test(item.cik)&&!/^0+$/.test(item.cik)?item.cik:null;
 if(directory){
  if(!cik||item.issuerId!=='SEC_CIK:'+cik||item.sourceUrl!==DIRECTORY_URL||!validDate(item.verifiedAt)||!item.verifiedAt.includes('T')||Date.parse(item.verifiedAt)<0||Date.parse(item.verifiedAt)>Date.parse(capturedAt)+300000)throw fail('Registered research identity requires dated SEC directory provenance',400);
  if(seedCik[item.symbol]&&seedCik[item.symbol]!==cik)throw fail('Registered identity conflicts with the compatibility seed issuer',400);
 }else{
  if(!pilot||item.identitySource!=null&&item.identitySource!=='TRADESCOPE_SEED_MAPPING')throw fail('New research symbols require registered SEC directory identity',400);
  if(item.cik!=null&&(!cik||cik!==seedCik[item.symbol])||item.issuerId!=null&&item.issuerId!=='SEC_CIK:'+seedCik[item.symbol]||item.verifiedAt!=null)throw fail('Pilot identity does not match the known seed mapping',400);
 }
 const instrument={};for(const [field,max] of [['instrumentId',80],['symbol',12],['name',255],['type',20],['currency',10],['coverage',255],['classification',100]])instrument[field]=safeText(item[field],max);
 if(!instrument.name)throw fail('Research instrument name is required',400);
 if(item.exchange!=null&&(typeof item.exchange!=='string'||!(/^[A-Za-z0-9 ._-]{1,40}$/).test(item.exchange)))throw fail('Invalid registered exchange metadata',400);
 if(directory||item.identitySource==='TRADESCOPE_SEED_MAPPING')Object.assign(instrument,{cik,issuerId:cik?'SEC_CIK:'+cik:null,identitySource:item.identitySource,sourceUrl:directory?DIRECTORY_URL:null,verifiedAt:directory?item.verifiedAt:null,exchange:item.exchange??null});
 return instrument;
}
function observation(input){
 if(!input||!units.has(input.id)||input.unit!==units.get(input.id)||!statuses.has(input.status)||!(/^[A-Za-z0-9._:/-]{1,100}$/).test(input.methodVersion||'')||!safeText(input.source,100))throw fail('Invalid research observation for optional backend',400);
 if(input.status==='available'?!scalar(input.value)||units.get(input.id)==='boolean'&&typeof input.value!=='boolean'||units.get(input.id)!=='boolean'&&typeof input.value!=='number':input.value!==null)throw fail('Research metric availability does not match its scalar',400);
 const result={id:input.id,value:input.value,status:input.status,unit:input.unit,source:safeText(input.source,100),reason:safeText(input.reason,500),methodVersion:input.methodVersion};
 for(const field of ['asOf','availableAt','periodStart','periodEnd']){
  if(input[field]!=null&&!validDate(input[field]))throw fail('Invalid research observation date',400);result[field]=input[field]??null;
 }
 if(input.status==='available'&&!result.asOf)throw fail('Available research metrics require an actual asOf date',400);
 for(const field of ['sampleCount','requiredCount']){const value=input[field];if(value!=null&&(!Number.isSafeInteger(value)||value<0||value>1e6))throw fail('Invalid research sample count',400);result[field]=value??null;}
 const details=input.details||{},safe={};
 for(const field of ['adjustment','calculation','knowledgePrecision'])if(typeof details[field]==='string')safe[field]=safeText(details[field],160);
 for(const field of ['knowledgeCutoff','priceAsOf','previousAsOf','previousPeriodEnd'])if(validDate(details[field]))safe[field]=details[field];
 if(Array.isArray(details.inputs)){
  if(details.inputs.length>30)throw fail('Too many dated filing input facts',400);
  safe.inputs=details.inputs.map(fact=>{
   const clean={};for(const field of ['namespace','tag','unit','form','accession'])if(typeof fact?.[field]==='string')clean[field]=safeText(fact[field],120);
   for(const field of ['periodStart','periodEnd','filingDate'])if(validDate(fact?.[field]))clean[field]=fact[field];
   clean.value=typeof fact?.value==='number'&&Number.isFinite(fact.value)?fact.value:null;return clean;
  });
 }result.details=safe;return result;
}
function makePayload(snapshot,now){
 const capturedAt=snapshot?.checkedAt||snapshot?.capturedAt||new Date(now()).toISOString();if(!validDate(capturedAt)||!capturedAt.includes('T'))throw fail('A research snapshot requires a full capture timestamp',400);
 const instrument=instrumentPayload(snapshot?.instrument,capturedAt);
 if(!Array.isArray(snapshot.observations)||!snapshot.observations.length||snapshot.observations.length>100)throw fail('Send one to one hundred research observations',400);
 return {schemaVersion:1,instrument,capturedAt,observations:snapshot.observations.map(observation)};
}
export function createJavaResearchAdapter({env=process.env,fetchImpl=fetch,now=Date.now,timeoutMs=8000,maxBytes=262144}={}){
 const token=env.RESEARCH_API_TOKEN;let origin,error=null;
 try{
  const url=new URL(env.RESEARCH_JAVA_ORIGIN||'http://127.0.0.1:8080');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();
  origin=url.origin;
 }catch{error='invalid_configuration';}
 if(token!=null&&(typeof token!=='string'||token.length<24||token.length>512||/[\r\n]/.test(token)))error='invalid_configuration';
 const configured=Boolean(token)&&!error;
 const disabled=()=>({configured:false,status:error||'disabled',storage:'postgresql',message:error?'Optional research backend configuration is invalid.':'Configure the optional Java backend token to enable synchronization.'});
 async function request(path,{method='GET',payload}={}){
  if(!configured)throw fail(disabled().message);
  const body=payload?JSON.stringify(payload):undefined;
  if(body&&Buffer.byteLength(body)>maxBytes)throw fail('Research snapshot exceeds the bridge payload limit',413);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let response;
  try{
   response=await fetchImpl(origin+'/api/research/v1/'+path,{method,redirect:'error',signal:controller.signal,headers:{'Accept':'application/json','X-Research-Token':token,...(body?{'Content-Type':'application/json'}:{})},body});
   if(!response.ok){await response.body?.cancel().catch(()=>{});throw fail([401,403].includes(response.status)?'Optional research backend authentication failed.':response.status===429?'Optional research backend is rate limited.':'Optional research backend rejected the request.',response.status===429?429:502);}
   if(Number(response.headers?.get('content-length'))>maxBytes){await response.body?.cancel().catch(()=>{});throw fail('Optional research backend response exceeds the limit',502);}
   let raw='';
   if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw fail('Optional research backend response exceeds the limit',502);}chunks.push(Buffer.from(value));}raw=Buffer.concat(chunks).toString('utf8');}
   else{raw=await response.text();if(Buffer.byteLength(raw)>maxBytes)throw fail('Optional research backend response exceeds the limit',502);}
   try{return JSON.parse(raw);}catch{throw fail('Optional research backend returned an invalid response',502);}
  }catch(reason){if(reason.name==='AbortError')throw fail('Optional research backend timed out',504);if(reason.safeBridgeError)throw reason;throw fail('Optional research backend is unavailable',502);}
  finally{clearTimeout(timer);}
 }
 return Object.freeze({
  async health(){
   if(!configured)return disabled();
   try{const value=await request('health');if(value.schemaVersion!==1||value.ready!==true||value.storage!=='postgresql')throw fail('Unsupported research backend contract',502);
    return {configured:true,status:'available',ready:true,schemaVersion:1,storage:'postgresql',metricCatalogVersion:1,
     identityContractVersion:value.identityContractVersion===1?1:0,maxInstruments:value.identityContractVersion===1&&value.maxInstruments===50?50:10};
   }catch{return {configured:true,status:'unavailable',ready:false,storage:'postgresql',message:'Optional Java backend is unavailable or rejected authentication.'};}
  },
  async syncSnapshot(snapshot){
   if(!configured)throw fail(disabled().message);
   const payload=makePayload(snapshot,now),receipt=await request('metric-snapshots',{method:'POST',payload});
   if(receipt.schemaVersion!==1||receipt.instrumentId!==payload.instrument.instrumentId||!Number.isSafeInteger(receipt.receivedCount)||receipt.receivedCount!==payload.observations.length||!Number.isSafeInteger(receipt.upsertedCount)||receipt.upsertedCount<0||receipt.upsertedCount>receipt.receivedCount||!validDate(receipt.capturedAt))throw fail('Optional research backend returned an invalid synchronization receipt',502);
   return {schemaVersion:1,storage:'postgresql',instrumentId:receipt.instrumentId,capturedAt:receipt.capturedAt,receivedCount:receipt.receivedCount,upsertedCount:receipt.upsertedCount};
  }
 });
}
