/** Local-first, single-user investigation persistence. No external service or credentials.
 * For multi-user production, migrate this model behind a PostgreSQL repository and auth.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validEventTimestamp} from './market-events.mjs';

const STATUSES = new Set(['OPEN','IN_REVIEW','NEEDS_EVIDENCE','CLOSED']);
const PRIORITIES = new Set(['LOW','MEDIUM','HIGH']);
const CONCLUSIONS = new Set(['UNDETERMINED','TEMPORAL_ASSOCIATION','SUPPORTED_HYPOTHESIS','INCONCLUSIVE','NO_RELATIONSHIP']);
const MAX_CASES = 1000;
const copy = value => structuredClone(value);
const err = (message,status=400) => Object.assign(new Error(message),{status});
const string = (val,max=500) => typeof val==='string' ? val.trim().slice(0,max) : '';
const validUrl = value => {if(!value)return null;try {const u=new URL(value);return ['https:','http:'].includes(u.protocol) && u.username==='' && u.password==='' ? u.toString() : null;}catch{return null;}};
const validTime = value => typeof value==='string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const audit = (action,details='',timestamp=new Date().toISOString()) => ({id:randomUUID(),action,at:timestamp,details:string(details,700)});
const allowSymbol = s => /^(?:[A-Z][A-Z0-9.-]{0,11})$/.test(s);
const nonempty = (v,max,label) => {const result=string(v,max);if(!result)throw err(`${label} is required`);return result;};
const pickRevision = (input,current) => {if(input?.expectedRevision !== current.revision)throw err(`Case was updated elsewhere; refresh and retry (revision ${current.revision})`,409);};

// A selected observation's lineage is saved only when an analyst creates a case.
// This is neither a tick archive nor permission to retain raw licensed feeds.
function normalizeMarketData(input) {
 if(!input || typeof input!=='object' || Array.isArray(input) || input.schemaVersion!==1)return null;
 const token=(value,max=40)=>typeof value==='string' && value.length<=max && /^[A-Za-z0-9@#*?._:+/-]+$/.test(value)?value:null;
 const symbol=typeof input.symbol==='string' && allowSymbol(input.symbol)?input.symbol:null;
 const provider=token(input.provider),feed=token(input.feed),coverage=token(input.coverage),instrumentId=token(input.instrumentId,80);
 if(!symbol || !provider || !feed || !coverage || !instrumentId || !['trade','quote','bar'].includes(input.eventType) || !['LIVE','HISTORY','SYNTHETIC'].includes(input.mode))return null;
 const time=value=>validEventTimestamp(value)?value:null;
 return {schemaVersion:1,provider,feed,coverage,mode:input.mode,instrumentId,symbol,eventType:input.eventType,
  sourceEventId:token(input.sourceEventId,128),exchange:token(input.exchange,32),
  exchangeEventTime:time(input.exchangeEventTime),receivedAt:time(input.receivedAt),ingestedAt:time(input.ingestedAt)};
}

// Save only numeric market measurements, dated filing facts and bounded study outcomes.
// Never store raw provider responses, opaque tokens or arbitrary untrusted client objects.
function normalizeContext(input) {
 if(!input || typeof input!=='object' || Array.isArray(input))return null;
 const numerical=(obj,keys)=>Object.fromEntries(keys.flatMap(k=>typeof obj?.[k]==='number'&&Number.isFinite(obj[k])?[[k,obj[k]]]:[]));
 const technical=numerical(input.technical,['close','sma20','sma50','rsi14','macd','macdSignal','atr14','volumeRatio20','barsCount']);
 let fundamentals=null;
 const fields=['revenue','netIncome','grossProfit','operatingIncome','epsDiluted'];
 const summary={};for(const field of fields){const x=input.fundamentals?.quarterly?.[field];if(x&&typeof x==='object')summary[field]={...numerical(x,['value','yoyPct','priorYearValue']),periodEnd:validTime(x.periodEnd?`${x.periodEnd}T00:00:00Z`:null)?.slice(0,10)||null,filingDate:validTime(x.filingDate?`${x.filingDate}T00:00:00Z`:null)?.slice(0,10)||null};}
 if(Object.keys(summary).length)fundamentals={quarterly:summary,source:string(input.fundamentals?.source,80)};
 const rawStudy=input.study?.study;
 let study=null;
 if(rawStudy && typeof rawStudy==='object')study={study:{status:string(rawStudy.status,40),referenceSession:string(rawStudy.referenceSession,20),horizons:Array.isArray(rawStudy.horizons)?rawStudy.horizons.slice(0,5).map(h=>({sessions:Number.isInteger(h.sessions)?h.sessions:null,status:string(h.status,40),...numerical(h,['relativeReturnPct','stockReturnPct','benchmarkReturnPct'])})):[]}};
 return {capturedAt:new Date().toISOString(),technical:Object.keys(technical).length?technical:null,technicalSource:string(input.technicalSource,100),financialSource:string(input.financialSource,100),fundamentals,study};
}


export function createCaseStore(filename) {
 let cache=null;let initializing=null;let serial=Promise.resolve();
 async function load(){
  if(cache)return cache;
  if(!initializing)initializing=(async()=>{
   try {const body=await fs.readFile(filename,'utf8');const parsed=JSON.parse(body);
    if(!parsed || parsed.schema!==1 || !Array.isArray(parsed.cases))throw err('Case store has an invalid schema',500);
    cache=parsed;
   }catch(e){if(e.code==='ENOENT')cache={schema:1,cases:[]};else throw e;}
   return cache;
  })().catch(e=>{initializing=null;throw e});
  return initializing;
 }
 async function save(){
  await fs.mkdir(path.dirname(filename),{recursive:true});
  const temp=`${filename}.${randomUUID()}.tmp`;
  try{await fs.writeFile(temp,JSON.stringify(cache,null,2)+'\n',{encoding:'utf8',mode:0o600});await fs.rename(temp,filename);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 const write=fn=>{const p=serial.then(async()=>{await load();const result=fn(cache);await save();return copy(result);});serial=p.catch(()=>{});return p;};
 const read=async fn=>{await serial;await load();return copy(fn(cache));};
 const find=(d,id)=>{const c=d.cases.find(x=>x.id===id);if(!c)throw err('Investigation not found',404);return c;};
 function normalizeEvent(input){
  if(!input || typeof input!=='object' || Array.isArray(input))throw err('An event record is required');
  const id=nonempty(input.id,160,'Event ID');
  const source=nonempty(input.source,120,'Source');
  const synthetic=/^hypo:/i.test(id) || /SYNTHETIC|DEMO/i.test(source) || input.synthetic===true;
  const symbols=Array.isArray(input.symbols)?[...new Set(input.symbols.map(x=>string(x,20).toUpperCase()).filter(allowSymbol))].slice(0,20):[];
  const lineage=normalizeMarketData(input.marketData);
  const marketData=lineage && symbols.includes(lineage.symbol) && (synthetic?lineage.mode==='SYNTHETIC':lineage.mode!=='SYNTHETIC')?lineage:null;
  const publishedAt=validTime(input.publishedAt),occurredAt=marketData?marketData.exchangeEventTime:validTime(input.occurredAt);
  return {id,headline:nonempty(input.headline,350,'Event headline'),category:string(input.category,40)||'OTHER',type:string(input.type,70)||'UNCLASSIFIED',source,sourceUrl:validUrl(input.sourceUrl),publishedAt,occurredAt,providerFirstSeenAt:validTime(input.providerFirstSeenAt),ingestedAt:marketData?marketData.ingestedAt:validTime(input.ingestedAt),evidenceLevel:string(input.evidenceLevel,70)||'unclassified',symbols,summary:string(input.summary,1200),synthetic,...(marketData?{marketData}:{})};
 }
 return {
  async list({status='ALL',search=''}={}){return read(d=>d.cases.filter(c=>(status==='ALL'||c.status===status)&&`${c.title} ${c.symbol} ${c.event.source} ${c.id}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({id,title,symbol,status,priority,relationship,updatedAt,createdAt,revision,event,assignee})=>({id,title,symbol,status,priority,relationship,updatedAt,createdAt,revision,assignee,source:event.source,synthetic:event.synthetic,eventHeadline:event.headline})));},
  async get(id){return read(d=>find(d,id));},
  async create(input){return write(d=>{
   if(d.cases.length>=MAX_CASES)throw err('Local case storage is full',409);
   const symbol=nonempty(input?.symbol,12,'Symbol').toUpperCase();if(!allowSymbol(symbol))throw err('Invalid symbol');
   const event=normalizeEvent(input?.event);const now=new Date().toISOString();
   const id=`CASE-${randomUUID()}`;
   const relationship=event.synthetic?'SYNTHETIC_ONLY':event.symbols.includes(symbol)?'PROVIDER_TAGGED':'UNVERIFIED';
   const context=normalizeContext(input?.context);
   const item={id,title:string(input?.title,220)||event.headline,symbol,context,priority:'MEDIUM',status:'OPEN',relationship,assignee:'Unassigned',conclusion:'UNDETERMINED',summary:'',event,createdAt:now,updatedAt:now,revision:1,evidence:[],notes:[],audit:[audit('CASE_CREATED',`From ${event.source} event ${event.id}; relationship ${relationship}`,now)]};
   if(event.sourceUrl)item.evidence.push({id:randomUUID(),kind:'SOURCE',label:`Original ${event.source} record`,url:event.sourceUrl,source:event.source,claimedAt:event.publishedAt||event.occurredAt,addedAt:now});
   d.cases.unshift(item);return item;
  });},
  async update(id,input){return write(d=>{
   const c=find(d,id);pickRevision(input,c);
   const before={status:c.status,priority:c.priority,assignee:c.assignee,conclusion:c.conclusion,summary:c.summary};
   let changes=[];
   if(Object.hasOwn(input,'status')){if(!STATUSES.has(input.status))throw err('Unsupported case status');if(c.status!==input.status){c.status=input.status;changes.push(`status: ${input.status}`);}}
   if(Object.hasOwn(input,'priority')){if(!PRIORITIES.has(input.priority))throw err('Unsupported priority');if(c.priority!==input.priority){c.priority=input.priority;changes.push(`priority: ${input.priority}`);}}
   if(Object.hasOwn(input,'conclusion')){if(!CONCLUSIONS.has(input.conclusion))throw err('Unsupported conclusion');if(c.conclusion!==input.conclusion){c.conclusion=input.conclusion;changes.push(`conclusion: ${input.conclusion}`);}}
   if(Object.hasOwn(input,'assignee')){const name=nonempty(input.assignee,100,'Assignee');if(c.assignee!==name){c.assignee=name;changes.push(`assignee updated`);}}
   if(Object.hasOwn(input,'summary')){const note=string(input.summary,4000);if(c.summary!==note){c.summary=note;changes.push('analyst assessment updated');}}
   if(!changes.length)return c;
   const now=new Date().toISOString();c.updatedAt=now;c.revision++;c.audit.push(audit('CASE_UPDATED',changes.join('; '),now));return c;
  });},
  async addNote(id,input){return write(d=>{
   const c=find(d,id);pickRevision(input,c);
   if(c.notes.length>=250)throw err('Note limit reached',409);
   const body=nonempty(input.body,5000,'Note');const now=new Date().toISOString();const note={id:randomUUID(),body,author:string(input.author,80)||'Local analyst',createdAt:now};
   c.notes.push(note);c.updatedAt=now;c.revision++;c.audit.push(audit('NOTE_ADDED',`Note ${note.id}`,now));return c;
  });},
  async addEvidence(id,input){return write(d=>{
   const c=find(d,id);pickRevision(input,c);
   if(c.evidence.length>=200)throw err('Evidence limit reached',409);
   const url=validUrl(input.url);if(!url)throw err('Evidence must contain a valid HTTP(S) source URL');
   const kind=String(input.kind||'SOURCE').toUpperCase();if(!['SOURCE','FILING','MARKET_OBSERVATION','ANALYST_REFERENCE'].includes(kind))throw err('Unsupported evidence kind');
   const now=new Date().toISOString();const ev={id:randomUUID(),label:nonempty(input.label,220,'Evidence label'),kind,url,source:string(input.source,120)||'Analyst provided',claimedAt:validTime(input.claimedAt),addedAt:now};
   c.evidence.push(ev);c.updatedAt=now;c.revision++;c.audit.push(audit('EVIDENCE_ADDED',`Evidence ${ev.id}`,now));return c;
  });}
 };
}

export {STATUSES,PRIORITIES,CONCLUSIONS};
