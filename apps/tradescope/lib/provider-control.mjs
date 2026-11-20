/* Read-only source diagnostics, explicit opt-in probes. Do not expose keys or raw source records. */
const SOURCES=Object.freeze([
 {id:'alpaca',label:'Alpaca IEX market data',config:['APCA_API_KEY_ID','APCA_API_SECRET_KEY'],area:'Markets',method:'API'},
 {id:'sec',label:'SEC EDGAR XBRL',config:['SEC_USER_AGENT'],area:'Financials',method:'Official API'},
 {id:'fred',label:'FRED macro',config:['FRED_API_KEY'],area:'Macroeconomics',method:'Official API'},
 {id:'alfred',label:'ALFRED historical vintages',config:['FRED_API_KEY'],area:'Macroeconomics',method:'Official API'},
 {id:'eia',label:'EIA v2 gas indicators',config:['EIA_API_KEY'],area:'Commodity research',method:'Official API'},
 {id:'usda',label:'USDA FAS PSD crop series',config:['USDA_FAS_API_KEY'],area:'Commodity research',method:'Official API'},
 {id:'comtrade',label:'UN Comtrade fertilizer trade',config:[],area:'Commodity research',method:'Keyless preview'},
 {id:'gdelt',label:'GDELT event candidates',config:[],area:'Events',method:'Open API'},
 {id:'federal-register',label:'Federal Register documents',config:[],area:'Events',method:'Open API'},
 {id:'noaa-cpc',label:'NOAA CPC ENSO discussion',config:[],area:'Climate',method:'Public archive'},
 {id:'nasa-power',label:'NASA POWER monthly weather',config:[],area:'Climate',method:'Public API'},
 {id:'usgs',label:'USGS mineral data',config:[],area:'Commodity research',method:'Manual local capture'},
 {id:'eodhd',label:'EODHD 2008 historical outcomes',config:['EODHD_API_TOKEN','EODHD_INTERNAL_RESEARCH_ENABLED'],area:'Historical outcomes',method:'Licensed API'},
 {id:'nvidia',label:'NVIDIA NIM hosted model (future)',config:['NVIDIA_API_KEY'],area:'Future agent desk',method:'Not integrated'}
]);
const safeDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:null;
const publicState=s=>structuredClone(s);
export function createProviderControl({env=process.env,probes={},now=()=>new Date(),maxHistory=80}={}){
 const history=[],latest=new Map(),pending=new Set();
 const state=(def)=>{
  const configured=def.config.every(k=>k==='EODHD_INTERNAL_RESEARCH_ENABLED'?env[k]==='true':typeof env[k]==='string'&&env[k].trim().length>0);
  const supported=typeof probes[def.id]==='function';
  const prior=latest.get(def.id)||null;
  return {id:def.id,label:def.label,area:def.area,method:def.method,
   credentialRequired:def.config.some(k=>k!=='EODHD_INTERNAL_RESEARCH_ENABLED'),
   envNames:def.config,configured,probeSupported:supported,
   status:!supported?'NOT_IMPLEMENTED':!configured?'NOT_CONFIGURED':prior?.status||'NOT_PROBED',
   lastCheckedAt:prior?.checkedAt||null,lastSuccessAt:prior?.successAt||null,
   latestObservationDate:prior?.observationDate||null,observedRecords:prior?.observedRecords??null,
   failureCategory:prior?.failureCategory||null};
 };
 function catalog(){
  return {version:1,readOnlyResearchProbes:true,checksNeverAutomatic:true,
   sources:SOURCES.map(state),history:history.map(publicState).slice(-40).reverse(),
   note:'Configured indicates presence of local credentials, not an active subscription or valid data license. Only manual probes test live upstream access. No raw credentials or source responses are returned.'};
 }
 async function probe(id){
  const def=SOURCES.find(x=>x.id===id);
  if(!def)throw Object.assign(new Error('Select a known source'),{status:400});
  if(typeof probes[id]!=='function')throw Object.assign(new Error('Live probe is not implemented for this source'),{status:409});
  if(!state(def).configured)throw Object.assign(new Error('Provider credentials are not configured'),{status:503});
  if(pending.has(id))throw Object.assign(new Error('A probe is already running for this source'),{status:409});
  pending.add(id);
  const checkedAt=now().toISOString(),previous=latest.get(id);
  let result;
  try{
   const source=await probes[id]();
   if(!source||typeof source!=='object')throw Object.assign(new Error('Source response has no structured content'),{status:502});
   const count=Number.isSafeInteger(source.count)&&source.count>=0?source.count:null;
   const observationDate=safeDate(source.observationDate);
   const status= count===0?'EMPTY':'SUCCESS';
   result={id,status,checkedAt,successAt:checkedAt,observationDate,observedRecords:count,
    failureCategory:null,sourceLabel:def.label,verified:false};
  }catch(error){
   const code=error?.status;
   result={id,status:'FAILED',checkedAt,successAt:previous?.successAt||null,
    observationDate:previous?.observationDate||null,observedRecords:previous?.observedRecords??null,
    failureCategory:code===429?'RATE_LIMITED':code===504?'TIMEOUT':code===503?'ENTITLEMENT_OR_CONFIGURATION':'UPSTREAM_OR_SCHEMA_ERROR',
    sourceLabel:def.label,verified:false};
  }finally{pending.delete(id);}
  latest.set(id,result);history.push(result);
  if(history.length>maxHistory)history.splice(0,history.length-maxHistory);
  return publicState(result);
 }
 return {catalog,probe};
}
const json=(res,status,data)=>{
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});
 res.end(JSON.stringify(data));
};
async function input(req){
 if(Number(req.headers['content-length']||0)>1500)throw Object.assign(new Error('Request too large'),{status:413});
 let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>1500)throw Object.assign(new Error('Request too large'),{status:413});}
 let data;try{data=JSON.parse(body);}catch{throw Object.assign(new Error('Expected JSON object'),{status:400});}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(x=>x!=='id'))throw Object.assign(new Error('Only provider ID is accepted'),{status:400});
 return data;
}
export function createProviderControlApi({service}={}){
 if(!service)throw new TypeError('Provider control service required');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/provider-control/'))return false;
  try{
   const operation=url.pathname.slice('/api/provider-control/'.length);
   if(req.method==='GET'&&operation==='catalog'&&url.search==='')json(res,200,service.catalog());
   else if(req.method==='POST'&&operation==='probe'&&url.search===''){
    if(req.headers.origin){
     let origin;try{origin=new URL(req.headers.origin);}catch{throw Object.assign(new Error('Invalid origin'),{status:403});}
     if(origin.host!==req.headers.host||!['http:','https:'].includes(origin.protocol))throw Object.assign(new Error('Cross-origin probes denied'),{status:403});
    }
    const {id}=await input(req);
    json(res,200,await service.probe(id));
   }else throw Object.assign(new Error('Unknown provider diagnostic route'),{status:404});
  }catch(e){
   json(res,[400,403,404,409,413,429,503].includes(e?.status)?e.status:502,
    {error:e?.status?e.message:'Source diagnostic unavailable'});
  }
  return true;
 };
}
