/** Opt-in, single-process local IEX observation capture. No raw frames, credentials, or licensed redistribution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const problem=(message,status=400)=>Object.assign(Error(message),{status});
const idRe=/^cap-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const clockOk=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const token=(v,n=40)=>typeof v==='string'&&v.length<=n&&/^[A-Za-z0-9@#._:+/-]*$/.test(v)?v:null;
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function captureObservation(v){
 if(!v||v.schemaVersion!==1||v.provider!=='alpaca'||v.feed!=='iex'||v.coverage!=='single-venue'||v.mode!=='LIVE'||
   !['trade','quote','bar'].includes(v.eventType)||!(/^[A-Z][A-Z0-9.-]{0,9}$/).test(v.symbol)||
   !clockOk(v.receivedAt)||!clockOk(v.ingestedAt)||
   v.exchangeEventTime!=null&&!clockOk(v.exchangeEventTime))return null;
 const o={schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',mode:'LIVE',
  instrumentId:'US_EQUITY:'+v.symbol,symbol:v.symbol,eventType:v.eventType,
  sourceEventId:token(v.sourceEventId,128),exchange:token(v.exchange),
  exchangeEventTime:v.exchangeEventTime||null,receivedAt:v.receivedAt,ingestedAt:v.ingestedAt,
  quality:{validation:'valid',gapStatus:'unknown',outOfOrder:v.quality?.outOfOrder===true,
   missingFields:Array.isArray(v.quality?.missingFields)?v.quality.missingFields.filter(z=>token(z,40)).slice(0,20):[]},
  trade:null,quote:null,bar:null};
 if(v.eventType==='trade'){
  if(!Number.isFinite(v.trade?.price)||v.trade.price<=0)return null;
  o.trade={price:v.trade.price,size:number(v.trade.size),
    conditions:Array.isArray(v.trade.conditions)?v.trade.conditions.filter(z=>token(z,32)).slice(0,32):null,
    tape:token(v.trade.tape)};
 }else if(v.eventType==='quote'){
  if(!Number.isFinite(v.quote?.bidPrice)||v.quote.bidPrice<=0||
     !Number.isFinite(v.quote?.askPrice)||v.quote.askPrice<=0)return null;
  o.quote={bidPrice:v.quote.bidPrice,askPrice:v.quote.askPrice,bidSize:number(v.quote.bidSize),
    askSize:number(v.quote.askSize),bidExchange:token(v.quote.bidExchange),
    askExchange:token(v.quote.askExchange)};
 }else{
  if(!v.bar||![v.bar.open,v.bar.high,v.bar.low,v.bar.close].every(z=>Number.isFinite(z)&&z>0)||
    v.bar.low>v.bar.high||v.bar.high<Math.max(v.bar.open,v.bar.close)||
    v.bar.low>Math.min(v.bar.open,v.bar.close))return null;
  o.bar={open:v.bar.open,high:v.bar.high,low:v.bar.low,close:v.bar.close,
    volume:number(v.bar.volume),tradeCount:number(v.bar.tradeCount),vwap:number(v.bar.vwap)};
 }
 return Buffer.byteLength(JSON.stringify(o))<=4096?o:null;
}
function volSignals(items){
 const bySymbol=new Map();
 return items.map((row,i)=>{
  const o=row.observation,history=bySymbol.get(o.symbol)||[];
  const evaluation={rule:'VOL-01',ruleVersion:'v0.30-replay-1',baselineCount:Math.min(50,history.length),
   status:o.eventType==='trade'?'warming_up':'not_applicable',severity:'unassessed',ratio:null};
  if(o.eventType==='trade'){
   const size=o.trade?.size;
   if(typeof size==='number'&&size>0){
    if(history.length>=20){
     const sorted=[...history].sort((a,b)=>a-b),m=sorted.length>>1;
     const median=sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;
     const ratio=size/median;
     evaluation.status='evaluated';evaluation.ratio=Number(ratio.toFixed(6));
     evaluation.severity=ratio>3?(ratio>=6?'high':'medium'):'low';
    }
    history.push(size);if(history.length>50)history.shift();bySymbol.set(o.symbol,history);
   }else evaluation.status='missing_data';
  }
  return {...row,index:i,evaluation};
 });
}
export function createMarketCapture({stream,dir,enabled=false,rightsAcknowledged=false,
 now=()=>new Date().toISOString(),maxSessions=20,maxRows=10000,maxBytes=6000000,onIdle=()=>{}}={}){
 if(!stream?.on||!stream?.start||!stream?.getHealth||!path.isAbsolute(dir||''))throw TypeError('Valid stream and absolute local path required');
 if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>100||
  !Number.isInteger(maxRows)||maxRows<1||maxRows>100000||
  !Number.isInteger(maxBytes)||maxBytes<100000||maxBytes>50000000)throw TypeError('Invalid capture bounds');
 const enabledHere=enabled===true&&rightsAcknowledged===true;
 let current=null,lastStop=Promise.resolve();
 const file=id=>{if(!idRe.test(id))throw problem('Invalid capture ID');return path.join(dir,id+'.jsonl');};
 const state=()=>({enabled:enabledHere,configured:stream.getHealth().configured===true,
  provider:'alpaca',feed:'iex',coverage:'single-venue',marketCompleteness:false,
  providerRetentionUnverified:true,
  active:current?{id:current.id,startedAt:current.startedAt,observations:current.rows,
   interruptions:current.interruptions,connector:stream.getHealth().status}:null,
  limits:{maxSessions,maxRows,maxBytes},
  note:'Only observed IEX messages; reconnect gaps unknown. This is a single-process local research archive.'});
 async function allNames(){
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  return (await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&e.name.endsWith('.jsonl')&&idRe.test(e.name.slice(0,-6))).map(e=>e.name).sort();
 }
 async function append(s,entry,first=false){
  const base={schemaVersion:1,seq:s.seq,previousHash:s.hash,entry};
  const record={...base,hash:sha(JSON.stringify(base))},data=JSON.stringify(record)+'\n';
  if(s.bytes+Buffer.byteLength(data)>maxBytes)throw problem('Capture size bound reached',507);
  if(first)await fs.writeFile(file(s.id),data,{flag:'wx',mode:0o600});
  else await fs.appendFile(file(s.id),data,'utf8');
  s.bytes+=Buffer.byteLength(data);s.hash=record.hash;s.seq++;
 }
 function detach(s){stream.off('observation',s.observer);stream.off('health',s.healthListener);}
 function seal(s,reason){
  if(s.ending)return s.queue;
  s.ending=true;detach(s);
  s.queue=s.queue.then(()=>append(s,{kind:'stop',at:now(),reason,count:s.rows,interruptions:s.interruptions}))
   .finally(()=>{if(current===s)current=null;onIdle();});
  return s.queue;
 }
 function queue(s,entry){
  if(s.ending)return;
  s.queue=s.queue.then(async()=>{
   try{
    await append(s,entry);
    if(entry.kind==='observation')s.rows++;
    if(entry.kind==='interruption')s.interruptions++;
   }catch{
    s.ending=true;detach(s);if(current===s)current=null;onIdle();
   }
  });
  if(entry.kind==='observation'&&++s.enqueued>=maxRows)void seal(s,'record_limit').catch(()=>{});
 }
 async function start(){
  if(!enabledHere)throw problem('Enable capture and acknowledge provider retention rights locally',403);
  if(current)throw problem('One session is already recording',409);
  if(stream.getHealth().configured!==true)throw problem('Alpaca credentials are not configured',503);
  await lastStop;
  if((await allNames()).length>=maxSessions)throw problem('Local session capacity reached; export/retire files manually',409);
  const s={id:'cap-'+randomUUID(),startedAt:now(),seq:0,hash:'GENESIS',bytes:0,
   rows:0,enqueued:0,interruptions:0,ending:false,queue:Promise.resolve(),lastHealth:null};
  await append(s,{kind:'start',at:s.startedAt,source:'ALPACA_IEX',captureSchema:1,
   symbols:(stream.getHealth().symbols||[]).slice(0,100),scope:'local_research_only',
   completeness:'observed_messages_only'},true);
  s.observer=o=>{const clean=captureObservation(o);if(clean)queue(s,{kind:'observation',at:now(),observation:clean});};
  s.healthListener=h=>{
   if(s.ending)return;
   const status=token(h?.status)||'unknown',interruptions=h?.gaps?.interruptions||0;
   if(s.lastHealth!==null&&status!==s.lastHealth&&(status==='reconnecting'||status==='unavailable'))
    queue(s,{kind:'interruption',at:now(),status,continuity:'UNKNOWN'});
   s.lastHealth=status;
  };
  current=s;stream.on('observation',s.observer);stream.on('health',s.healthListener);stream.start();
  return state();
 }
 async function stop(reason='operator'){
  if(!enabledHere)throw problem('Capture disabled',403);
  if(current)lastStop=seal(current,reason);
  await lastStop;return state();
 }
 async function readSession(id){
  if(!enabledHere)throw problem('Capture disabled',403);
  let stat;try{stat=await fs.lstat(file(id));}catch(e){if(e.code==='ENOENT')throw problem('Session not found',404);throw e;}
  if(!stat.isFile()||stat.size>maxBytes)throw problem('Invalid capture file',422);
  const raw=await fs.readFile(file(id),'utf8');
  if(!raw||!raw.endsWith('\n'))throw problem('Truncated capture file',422);
  const lines=raw.slice(0,-1).split('\n');
  if(lines.length>maxRows*3+100)throw problem('Unexpected record volume',422);
  let previous='GENESIS',records=[];
  for(const [i,line] of lines.entries()){
   let row;try{row=JSON.parse(line);}catch{throw problem('Invalid capture JSON',422);}
   const {hash:actual,...base}=row||{};
   if(base.schemaVersion!==1||base.seq!==i||base.previousHash!==previous||
    typeof base.entry!=='object'||sha(JSON.stringify(base))!==actual)throw problem('Capture integrity mismatch',422);
   if(i===0&&(base.entry.kind!=='start'||base.entry.source!=='ALPACA_IEX'))throw problem('Invalid source metadata',422);
   if(!['start','observation','interruption','stop'].includes(base.entry.kind)||
    base.entry.kind==='observation'&&!captureObservation(base.entry.observation)||
    records.at(-1)?.entry.kind==='stop')throw problem('Invalid capture sequence',422);
   previous=actual;records.push(row);
  }
  const observations=records.filter(x=>x.entry.kind==='observation');
  return {id,records,observations,startedAt:records[0].entry.at,
   status:records.at(-1).entry.kind==='stop'?'COMPLETE':'INTERRUPTED_UNSEALED',
   endedAt:records.at(-1).entry.kind==='stop'?records.at(-1).entry.at:null,
   interruptions:records.filter(x=>x.entry.kind==='interruption').length,
   count:observations.length,terminalHash:previous,verified:true};
 }
 async function sessions(){
  if(!enabledHere)throw problem('Capture disabled',403);
  return Promise.all((await allNames()).reverse().map(async n=>{
   const id=n.slice(0,-6);
   try{const s=await readSession(id);return {id,status:s.status,observations:s.count,
    interruptions:s.interruptions,startedAt:s.startedAt,endedAt:s.endedAt,verified:true};}
   catch{return {id,status:'CORRUPT_OR_UNREADABLE',verified:false};}
  }));
 }
 async function replay(id,{offset=0,limit=100}={}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>250)
   throw problem('Invalid replay window');
  const s=await readSession(id);
  const scored=volSignals(s.observations.map(x=>({sourceSequence:x.seq,sourceHash:x.hash,
   observation:x.entry.observation})));
  return {id,source:'ALPACA_IEX_CAPTURE',ruleVersion:'v0.30-replay-1',status:s.status,
   verified:s.verified,terminalHash:s.terminalHash,total:s.count,offset,limit,
   nextOffset:offset+limit<s.count?offset+limit:null,interruptions:s.interruptions,
   coverage:'single-venue',continuity:'unknown',observations:scored.slice(offset,offset+limit),
   note:'Deterministic VOL-01 replay from captured IEX messages; not a consolidated market tape.'};
 }
 async function close(){if(current)await stop('server_shutdown');}
 return {state,start,stop,readSession,sessions,replay,close,isRecording:()=>Boolean(current&&!current.ending)};
}
const reply=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
export function createMarketCaptureApi({service,host='127.0.0.1'}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/market-capture/'))return false;
  const op=url.pathname.slice('/api/market-capture/'.length);
  try{
   if(!['catalog','sessions','session','replay','start','stop'].includes(op))throw problem('Unknown capture operation',404);
   if(op==='catalog'&&req.method==='GET'){reply(res,200,service.state());return true;}
   if(!service.state().enabled)throw problem('Local capture disabled or provider retention not acknowledged',403);
   if(op==='start'||op==='stop'){
    if(req.method!=='POST')throw problem('Use POST for capture controls',405);
    const origin=req.headers.origin,expected='http://'+req.headers.host;
    if(!['127.0.0.1','localhost','::1'].includes(host)||origin&&origin!==expected||
     req.headers['sec-fetch-site']==='cross-site'||req.headers['x-tradescope-local-capture']!=='1')
     throw problem('Local same-origin capture control required',403);
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw problem('Expected JSON',415);
    let raw='',size=0;
    for await(const part of req){size+=part.length;if(size>256)throw problem('Request too large',413);raw+=part;}
    let data;try{data=JSON.parse(raw);}catch{throw problem('Invalid JSON request',400);}
    if(!data||Array.isArray(data)||Object.keys(data).length)throw problem('Expected empty JSON object');
    reply(res,200,op==='start'?await service.start():await service.stop());return true;
   }
   if(req.method!=='GET')throw problem('Read-only capture query',405);
   if(op==='sessions'){if(url.searchParams.size)throw problem('Unexpected query');reply(res,200,{sessions:await service.sessions()});return true;}
   if(!['session','replay'].includes(op)||url.searchParams.getAll('id').length!==1||
    [...url.searchParams.keys()].some(k=>!['id','offset','limit'].includes(k)||url.searchParams.getAll(k).length!==1)||
    op==='session'&&url.searchParams.size!==1)throw problem('Invalid capture query');
   const id=url.searchParams.get('id');
   if(op==='session'){const x=await service.readSession(id);reply(res,200,{id,status:x.status,
    observations:x.count,interruptions:x.interruptions,terminalHash:x.terminalHash,verified:x.verified});return true;}
   const value=(k,d)=>url.searchParams.has(k)?Number(url.searchParams.get(k)):d;
   reply(res,200,await service.replay(id,{offset:value('offset',0),limit:value('limit',100)}));
  }catch(e){const status=[400,403,404,405,409,413,415,422,503,507].includes(e?.status)?e.status:503;
   reply(res,status,{error:e?.status?e.message:'Local capture store unavailable'});}
  return true;
 };
}
