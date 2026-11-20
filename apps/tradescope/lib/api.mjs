import {technicalIndicators,eventStudy,volatilityBaseline} from './analysis.mjs';
import {SYMBOLS} from './sources.mjs';
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
const choice=(value,valid,fallback)=>valid.includes(value)?value:fallback;
export function createIntelligenceApi(sources){
 return async function handle(req,res,u){
  if(!u.pathname.startsWith('/api/intelligence/'))return false;
  const symbol=(u.searchParams.get('symbol')||'AAPL').toUpperCase();
  const kind=u.pathname.split('/').at(-1);
  if(!SYMBOLS.includes(symbol)){json(res,400,{error:'Unsupported symbol; choose one of the tracked tickers.'});return true;}
  try{let data;
   if(kind==='news')data=await sources.news(symbol,Math.min(30,Math.max(1,Number(u.searchParams.get('limit')||20)||20)));
   else if(kind==='filings')data=await sources.filings(symbol);
   else if(kind==='fundamentals')data=await sources.fundamentals(symbol);
   else if(kind==='technicals'){const feed=choice(u.searchParams.get('feed'),['iex','sip'],'iex');const b=await sources.bars(symbol,{days:260,feed});data={symbol,source:b.source,fetchedAt:b.fetchedAt,indicators:technicalIndicators(b.bars),forecast:volatilityBaseline(b.bars),lastBars:b.bars.slice(-12).map(x=>({time:x.t,close:x.c,volume:x.v})),partialHistory:b.hasMore};}
   else if(kind==='hazards')data=await sources.hazards(choice(u.searchParams.get('source'),['all','usgs','nasa'],'all'));
   else if(kind==='geopolitics')data=await sources.geopolitics(choice(u.searchParams.get('topic'),['sanctions','conflict','supply'],'sanctions'));
   else if(kind==='impact'){
    const eventTime=u.searchParams.get('eventTime');if(!eventTime||!/^(20\d\d)-\d\d-\d\dT/.test(eventTime)||!Number.isFinite(Date.parse(eventTime))||Date.parse(eventTime)>Date.now()){json(res,400,{error:'Supply a past ISO eventTime.'});return true;}
    if(symbol==='SPY'){json(res,422,{error:'Choose a company or sector security rather than the SPY benchmark.'});return true;}
    const feed=choice(u.searchParams.get('feed'),['iex','sip'],'iex');const [s,b]=await Promise.all([sources.bars(symbol,{days:260,feed}),sources.bars('SPY',{days:260,feed})]);
    data={symbol,benchmark:'SPY',source:s.source,study:eventStudy(eventTime,s.bars,b.bars),marketCoverage:'Single venue IEX unless entitled SIP feed requested. Daily aggregate reactions are not transaction-attribution evidence.'};
   }else{json(res,404,{error:'Unknown intelligence endpoint'});return true;}
   json(res,200,data);
  }catch(e){const status=e.status||500;json(res,status,{error:status===500?'Intelligence service failed; check server logs.':e.message});if(status===500)console.error('[intelligence]',e);}
  return true;
 };
}
