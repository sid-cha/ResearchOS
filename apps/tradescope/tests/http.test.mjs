import test from 'node:test';
import assert from 'node:assert/strict';
process.env.APCA_API_KEY_ID='test-key-not-a-secret';
process.env.APCA_API_SECRET_KEY='test-secret-not-a-secret';
const {createServer}=await import('../server.mjs?httpintegration=true');
const oldFetch=global.fetch;

test('live endpoint normalizes upstream snapshots and never returns auth headers',async()=>{
  global.fetch=async (url,opts)=>{
    if(String(url).includes('data.alpaca.markets')){
      assert.equal(opts.headers['APCA-API-KEY-ID'],process.env.APCA_API_KEY_ID);
      assert.equal(opts.headers['APCA-API-SECRET-KEY'],process.env.APCA_API_SECRET_KEY);
      return new Response(JSON.stringify({AAPL:{latestTrade:{i:42,t:'2026-11-11T16:00:00Z',p:255,s:100,x:'V'},latestQuote:{t:'2026-11-11T16:00:01Z',bp:254.99,ap:255.02,bs:20,as:30},prevDailyBar:{c:250}}}),{status:200});
    }
    return oldFetch(url,opts);
  };
  const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r));
  try{
    const response=await oldFetch(`http://127.0.0.1:${s.address().port}/api/live`);
    assert.equal(response.status,200);
    const body=await response.text();
    assert.ok(body.includes('ALPACA_IEX'));
    assert.ok(body.includes('255'));
    assert.ok(!body.includes('test-secret-not-a-secret'));
    const j=JSON.parse(body); assert.equal(j.snapshots.AAPL.trade.quantity,100);
  }finally{await new Promise(r=>s.close(r));global.fetch=oldFetch;}
});

test('historical SIP only accepts previous dates and response identifies the true feed',async()=>{
  const oldGlobalFetch=global.fetch;
  global.fetch=async (url,opts)=>{
    if(String(url).includes('data.alpaca.markets')){
      assert.ok(String(url).includes('feed=sip'));
      return new Response(JSON.stringify({trades:[{i:101,t:'2026-11-10T15:00:00Z',p:250.2,s:125,x:'V'}],next_page_token:null}),{status:200});
    }
    return oldGlobalFetch(url,opts);
  };
  const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
  try{
    const base=`http://127.0.0.1:${s.address().port}`;
    const r=await oldGlobalFetch(`${base}/api/history?symbol=AAPL&date=2026-11-10&feed=sip`);
    assert.equal(r.status,200);
    const data=await r.json();assert.equal(data.source,'ALPACA_SIP_HISTORY');assert.equal(data.trades[0].price,250.2);
    const invalid=await oldGlobalFetch(`${base}/api/history?symbol=AAPL&date=2099-11-10&feed=sip`);
    assert.equal(invalid.status,400);
  }finally{await new Promise(r=>s.close(r));global.fetch=oldGlobalFetch;}
});
