/** Bounded issuer discovery and local watchlists. Not a public multi-tenant API. */
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,11}$/;
const WATCHLIST=/^WATCHLIST-[a-f0-9-]{36}$/;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const loopback=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
function sameOrigin(req){
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 if(!req.headers.origin)return true;
 try{return new URL(req.headers.origin).origin===`http://${req.headers.host}`;}catch{return false;}
}
function send(res,status,data){if(res.writableEnded||res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});res.end(JSON.stringify(data));}
async function jsonBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail('Content-Type must be application/json',415);
 const parts=[];let length=0;
 for await(const part of req){length+=part.length;if(length>4096)throw fail('Discovery request exceeds 4 KiB',413);parts.push(part);}
 try{const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}
 catch{throw fail('Discovery request must contain one JSON object');}
}
function querySymbol(u){const v=u.searchParams.get('symbol');if(!SYMBOL.test(v||''))throw fail('Choose a registered uppercase issuer symbol');return v;}
function queryWatchlist(u){const v=u.searchParams.get('id');if(!WATCHLIST.test(v||''))throw fail('Choose a saved watchlist ID');return v;}
const safeError=e=>({status:[400,403,404,409,413,415,422,429,503,504].includes(e?.status)?e.status:502,
 message:[400,403,404,409,413,415,422,429,503,504].includes(e?.status)?e.message:'Issuer discovery provider or local store is unavailable.'});

export function createDiscoveryApi({universe,sources}={}){
 if(!universe||typeof universe.search!=='function'||typeof universe.register!=='function'||typeof universe.saveWatchlist!=='function'||typeof sources?.filings!=='function')throw new TypeError('A research universe and official issuer sources are required');
 return async function handle(req,res,u){
  if(!u.pathname.startsWith('/api/discovery/'))return false;
  try{
   if(!sameOrigin(req))throw fail('Use the same-origin local TradeScope workstation',403);
   const resource=u.pathname.slice('/api/discovery/'.length),method=req.method;
   if(method!=='GET'&&!loopback(req))throw fail('Local issuer and watchlist changes require loopback access',403);
   if(method==='GET'&&resource==='search'){
    const query=u.searchParams.get('q')||'',limit=u.searchParams.has('limit')?Number(u.searchParams.get('limit')):15;
    send(res,200,await universe.search(query,{limit}));return true;
   }
   if(method==='GET'&&resource==='instruments'){
    send(res,200,{instruments:await universe.listInstruments(),coverage:'bounded registered US equity research universe; not a live market subscription'});return true;
   }
   if(method==='POST'&&resource==='register'){
    const body=await jsonBody(req);if(!SYMBOL.test(body.symbol||''))throw fail('Choose an official uppercase symbol');
    send(res,201,{instrument:await universe.register(body.symbol),source:'SEC_COMPANY_TICKERS_EXCHANGE'});return true;
   }
   if(method==='GET'&&resource==='watchlists'){
    send(res,200,{watchlists:await universe.listWatchlists(),scope:'single-user-local'});return true;
   }
   if(method==='GET'&&resource==='watchlist'){
    send(res,200,{watchlist:await universe.getWatchlist(queryWatchlist(u))});return true;
   }
   if((method==='POST'||method==='PATCH')&&resource==='watchlist'){
    const body=await jsonBody(req);
    if(method==='PATCH'&&!WATCHLIST.test(body.id||''))throw fail('PATCH requires a saved watchlist ID');
    if(method==='POST'&&body.id!==undefined)throw fail('POST creates a new watchlist without an ID');
    const watchlist=await universe.saveWatchlist(body,{expectedRevision:body.expectedRevision});
    send(res,method==='POST'?201:200,{watchlist});return true;
   }
   if(method==='DELETE'&&resource==='watchlist'){
    const id=queryWatchlist(u),expectedRevision=Number(u.searchParams.get('expectedRevision'));
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw fail('Expected revision is required');
    send(res,200,await universe.deleteWatchlist(id,{expectedRevision}));return true;
   }
   if(method==='GET'&&resource==='fundamentals'){
    const symbol=querySymbol(u);await universe.getInstrument(symbol);
    const data=await sources.fundamentals(symbol);
    send(res,200,{...data,limitations:[...(data?.caveats||[]),'Official SEC company facts are not a full market-data subscription, sector mapping or earnings forecast.']});return true;
   }
   if(method==='GET'&&resource==='filings'){
    const symbol=querySymbol(u);await universe.getInstrument(symbol);
    const data=await sources.filings(symbol);
    send(res,200,{...data,coverage:'recent SEC filing metadata; classifications require source passage analysis'});return true;
   }
   throw fail('Unknown discovery resource or HTTP method',405);
  }catch(e){const {status,message}=safeError(e);send(res,status,{error:message});return true;}
 };
}