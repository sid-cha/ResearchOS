import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSources} from '../lib/sources.mjs';

const ENV={APCA_API_KEY_ID:'fixture-key',APCA_API_SECRET_KEY:'fixture-secret',SEC_USER_AGENT:'TradeScope test contact@example.com'};
const RANGE={start:'2025-01-01',end:'2025-02-01'};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const bar=index=>({t:`fixture-${index}`,o:100,h:102,l:98,c:101,v:index+1});
const errorIs=(status,message)=>error=>{
 assert.equal(error.status,status);assert.equal(error.message,message);return true;
};

test('research bar requests use fixed provider origins, explicit adjustment and bounded query parameters',async()=>{
 const calls=[];
 const sources=makeSources({env:ENV,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return response({bars:[bar(0)],next_page_token:null});}});
 const result=await sources.researchBars('MSFT',RANGE);
 const {url,options}=calls[0];
 assert.equal(url.origin,'https://data.alpaca.markets');assert.equal(url.pathname,'/v2/stocks/MSFT/bars');
 assert.equal(url.searchParams.get('timeframe'),'1Day');assert.equal(url.searchParams.get('limit'),'1000');
 assert.equal(url.searchParams.get('start'),'2025-01-01T00:00:00Z');assert.equal(url.searchParams.get('end'),'2025-02-01T23:59:59Z');
 assert.equal(url.searchParams.get('feed'),'iex');assert.equal(url.searchParams.get('adjustment'),'split');assert.equal(url.searchParams.get('sort'),'asc');
 assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
 assert.equal(options.headers['APCA-API-KEY-ID'],ENV.APCA_API_KEY_ID);assert.equal(options.headers['APCA-API-SECRET-KEY'],ENV.APCA_API_SECRET_KEY);
 assert.equal(result.source,'ALPACA_IEX');assert.equal(result.coverage,'single-venue');assert.equal(result.pages,1);
 assert.equal(result.hasMore,false);assert.equal(result.partialHistory,false);assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
 assert.equal(JSON.stringify(result).includes(ENV.APCA_API_SECRET_KEY),false);
 const cached=await sources.researchBars('MSFT',RANGE);assert.equal(calls.length,1);assert.equal(cached.fetchedAt,result.fetchedAt);
 const entitled=await sources.researchBars('MSFT',{...RANGE,feed:'sip',adjustment:'all'});
 assert.equal(entitled.source,'ALPACA_SIP');assert.equal(entitled.coverage,'entitled SIP');
 assert.equal(calls[1].url.searchParams.get('adjustment'),'all');
 await sources.researchBars('MSFT',{...RANGE,adjustment:'raw'});assert.equal(calls[2].url.searchParams.get('adjustment'),'raw');
});

test('research history stops after three 1000-row pages and identifies incomplete history',async()=>{
 const calls=[],tokens=['next +/&?','third-page','fourth-page'];
 const sources=makeSources({env:ENV,fetchImpl:async url=>{
  const page=calls.length;calls.push(new URL(url));
  return response({bars:Array.from({length:1000},(_,index)=>bar(page*1000+index)),next_page_token:tokens[page]});
 }});
 const result=await sources.researchBars('AAPL',RANGE);
 assert.equal(calls.length,3);assert.equal(result.pages,3);assert.equal(result.bars.length,3000);
 assert.equal(calls[0].searchParams.has('page_token'),false);assert.equal(calls[1].searchParams.get('page_token'),tokens[0]);
 assert.equal(calls[2].searchParams.get('page_token'),tokens[1]);
 assert.equal(result.hasMore,true);assert.equal(result.partialHistory,true);
 assert.equal(result.bars.at(-1).v,3000);
 await sources.researchBars('AAPL',RANGE);assert.equal(calls.length,3);
});

test('research history joins completed pages without claiming more data remains',async()=>{
 const calls=[];
 const sources=makeSources({env:ENV,fetchImpl:async url=>{calls.push(new URL(url));return response(calls.length===1?{bars:[bar(0)],next_page_token:'page2'}:{bars:[bar(1)],next_page_token:null});}});
 const result=await sources.researchBars('NVDA',RANGE);
 assert.deepEqual(result.bars,[bar(0),bar(1)]);assert.equal(result.pages,2);assert.equal(result.hasMore,false);assert.equal(result.partialHistory,false);
 assert.equal(calls[1].searchParams.get('page_token'),'page2');
});

test('repeated or unbounded page tokens and oversized/malformed bar pages fail explicitly',async()=>{
 for(const [name,payloads,count,message] of [
  ['repeated',[{bars:[],next_page_token:'same'},{bars:[],next_page_token:'same'}],2,'Invalid market bar pagination'],
  ['oversized token',[{bars:[],next_page_token:'x'.repeat(2049)}],1,'Invalid market bar pagination'],
  ['oversized page',[{bars:Array.from({length:1001},(_,index)=>bar(index))}],1,'Malformed market bar response'],
  ['missing bars',[{}],1,'Malformed market bar response'],
  ['object bars',[{bars:{}}],1,'Malformed market bar response'],
 ]){
  let calls=0;
  const sources=makeSources({env:ENV,fetchImpl:async()=>response(payloads[calls++])});
  await assert.rejects(sources.researchBars('MSFT',RANGE),errorIs(502,message),name);assert.equal(calls,count,name);
 }
});

test('unsupported symbols, feeds, adjustments and calendar ranges fail before a provider request',async()=>{
 let calls=0;
 const sources=makeSources({env:ENV,fetchImpl:async()=>{calls++;throw Error('Provider must not be reached');}});
 const invalid=[
  ['GOOG',RANGE],['msft',RANGE],['MSFT/../../secret',RANGE],[null,RANGE],
  ['MSFT',{...RANGE,feed:'nasdaq'}],['MSFT',{...RANGE,adjustment:'dividend'}],
  ...[0,1101,1.5,'800',NaN].map(days=>['MSFT',{...RANGE,days}]),
  ['MSFT',{start:'2025-02-30',end:'2025-03-01'}],['MSFT',{start:'2025-01-01T00:00:00Z',end:'2025-02-01'}],
  ['MSFT',{start:'2025-02-01',end:'2025-01-01'}],['MSFT',{start:'2015-12-31',end:'2016-01-01'}],
  ['MSFT',{start:'2016-01-01',end:'2020-01-01'}],['MSFT',{start:'2999-01-01',end:'2999-01-02'}],
 ];
 for(const [symbol,options] of invalid)await assert.rejects(sources.researchBars(symbol,options),error=>{assert.equal(error.status,400);return true;});
 assert.equal(calls,0);
});

test('company facts retain their original fetchedAt through cached reads and the legacy summary adapter',async()=>{
 const calls=[],facts={cik:789019,entityName:'Fixture Company',facts:{'us-gaap':{}}};
 const sources=makeSources({env:ENV,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return response(facts);}});
 const first=await sources.companyFacts('MSFT');
 await new Promise(resolve=>setTimeout(resolve,5));
 const second=await sources.companyFacts('MSFT'),summary=await sources.fundamentals('MSFT');
 assert.equal(calls.length,1);assert.equal(first,second);assert.deepEqual(first.facts,facts);
 assert.equal(second.fetchedAt,first.fetchedAt);assert.equal(summary.fetchedAt,first.fetchedAt);
 assert.equal(calls[0].url.href,'https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json');
 assert.equal(calls[0].options.headers['User-Agent'],ENV.SEC_USER_AGENT);
 assert.equal(calls[0].options.headers['APCA-API-KEY-ID'],undefined);
 await assert.rejects(sources.companyFacts('SPY'),error=>{assert.equal(error.status,422);return true;});assert.equal(calls.length,1);
});

test('missing local credentials do not start provider requests',async()=>{
 let calls=0;
 const sources=makeSources({env:{},fetchImpl:async()=>{calls++;throw Error('Unexpected request');}});
 await assert.rejects(sources.researchBars('MSFT',RANGE),error=>{assert.equal(error.status,503);return true;});
 await assert.rejects(sources.companyFacts('MSFT'),error=>{assert.equal(error.status,503);return true;});
 assert.equal(calls,0);
});

test('rejected HTTP responses cancel their bodies and expose status without provider text',async()=>{
 for(const [status,publicStatus,cancelRejects] of [[500,502,false],[429,429,false],[403,502,true]]){
  let cancellations=0,reads=0;
  const sources=makeSources({env:ENV,fetchImpl:async()=>({ok:false,status,body:{async cancel(){cancellations++;if(cancelRejects)throw Error('private cancellation detail');}},async text(){reads++;return 'private upstream body fixture-secret';}})});
  await assert.rejects(sources.researchBars('MSFT',RANGE),errorIs(publicStatus,`Upstream returned HTTP ${status}`));
  assert.equal(cancellations,1);assert.equal(reads,0);
 }
});

test('declared oversized responses cancel without reading or exposing response/cancellation text',async()=>{
 for(const cancelRejects of [false,true]){
  let cancellations=0,reads=0;
  const sources=makeSources({env:ENV,fetchImpl:async()=>({ok:true,headers:new Headers({'content-length':'12000001'}),
   body:{async cancel(){cancellations++;if(cancelRejects)throw Error('private cancellation detail');},getReader(){reads++;throw Error('Must not consume oversized body');}},
   async text(){reads++;return 'private oversized response';}})});
  await assert.rejects(sources.researchBars('MSFT',RANGE),errorIs(502,'Upstream payload exceeds limit'));
  assert.equal(cancellations,1);assert.equal(reads,0);
 }
});

test('streamed size bounds cancel a body even without a declared content length',async()=>{
 let cancellations=0;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6000000));controller.enqueue(new Uint8Array(6000001));},cancel(){cancellations++;}});
 const sources=makeSources({env:ENV,fetchImpl:async()=>({ok:true,headers:new Headers(),body:stream})});
 await assert.rejects(sources.researchBars('MSFT',RANGE),errorIs(502,'Upstream payload exceeds limit'));
 assert.equal(cancellations,1);assert.equal(stream.locked,false);
});

test('malformed provider JSON has a static error and does not poison subsequent successful reads',async()=>{
 let calls=0;
 const sources=makeSources({env:ENV,fetchImpl:async()=>++calls===1?new Response('private upstream body fixture-secret'):response({bars:[]})});
 await assert.rejects(sources.researchBars('MSFT',RANGE),errorIs(502,'Upstream did not return JSON'));
 const recovered=await sources.researchBars('MSFT',RANGE);assert.equal(calls,2);assert.deepEqual(recovered.bars,[]);assert.equal(recovered.partialHistory,false);
});
