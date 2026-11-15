import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createDiscoveryApi} from '../lib/discovery-api.mjs';
const saved={id:'WATCHLIST-11111111-1111-1111-1111-111111111111',revision:1,name:'Semiconductors',symbols:['NVDA']};
const stub={
 search:async(query)=>({results:[{symbol:'NVDA',name:'NVIDIA'}],query}),
 register:async(symbol)=>({symbol,issuerId:'SEC_CIK:0001045810'}),
 listInstruments:async()=>[{symbol:'NVDA'}],getInstrument:async(symbol)=>({symbol}),
 listWatchlists:async()=>[saved],getWatchlist:async()=>saved,
 saveWatchlist:async(data)=>({...saved,...data,revision:data.expectedRevision?data.expectedRevision+1:1}),
 deleteWatchlist:async()=>({deleted:true})
};
const sources={filings:async(symbol)=>({symbol,filings:[]}),fundamentals:async(symbol)=>({symbol,ratios:{}})};
const api=createDiscoveryApi({universe:stub,sources});
async function call(route,{method='GET',data,host='127.0.0.1:8000',origin,remoteAddress='127.0.0.1'}={}){
 const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);req.method=method;req.headers={host,...(origin?{origin}:{}),...(data?{'content-type':'application/json'}:{})};req.socket={remoteAddress};
 const res={writableEnded:false,destroyed:false,writeHead(status){this.status=status;},end(serialized){this.body=JSON.parse(serialized);this.writableEnded=true;}};
 const handled=await api(req,res,new URL(route,'http://127.0.0.1:8000'));return {handled,...res};
}
test('search, register and watchlist operations preserve source and revision',async()=>{
 assert.equal((await call('/api/discovery/search?q=NVIDIA')).body.results[0].symbol,'NVDA');
 assert.equal((await call('/api/discovery/register',{method:'POST',data:{symbol:'NVDA'}})).status,201);
 assert.equal((await call('/api/discovery/watchlists')).body.watchlists[0].revision,1);
 assert.equal((await call('/api/discovery/watchlist',{method:'PATCH',data:{...saved,expectedRevision:1}})).body.watchlist.revision,2);
 assert.equal((await call('/api/discovery/fundamentals?symbol=NVDA')).body.symbol,'NVDA');
});
test('local changes reject cross-site and non-loopback traffic',async()=>{
 assert.equal((await call('/api/discovery/register',{method:'POST',data:{symbol:'NVDA'},origin:'https://other.example'})).status,403);
 assert.equal((await call('/api/discovery/register',{method:'POST',data:{symbol:'NVDA'},remoteAddress:'192.0.2.4'})).status,403);
 assert.equal((await call('/api/discovery/register',{method:'POST',data:{symbol:'Nvda'}})).status,400);
 assert.equal((await call('/api/discovery/watchlist?id='+saved.id+'&expectedRevision=0',{method:'DELETE'})).status,400);
});