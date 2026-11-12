import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch=global.fetch;
process.env.APCA_API_KEY_ID='';process.env.APCA_API_SECRET_KEY='';
const missing=await import('../server.mjs?missing-stream-credentials');

test('unconfigured LIVE remains unavailable, exposes safe health and protects backend assets',async t=>{
  const server=missing.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeMarketData();server.closeAllConnections();await new Promise(r=>server.close(r));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const ctrl=new AbortController();
  const response=await originalFetch(base+'/api/stream',{signal:ctrl.signal});
  const reader=response.body.getReader();let text='';
  const timer=setTimeout(()=>ctrl.abort(),2000);
  try{while(!text.includes('unavailable'))text+=new TextDecoder().decode((await reader.read()).value);}
  finally{clearTimeout(timer);ctrl.abort();}
  assert.match(text,/credentials are missing/);
  const snapshot=await originalFetch(base+'/api/live');assert.equal(snapshot.status,503);
  for(const asset of ['/.env','/server.mjs','/lib/alpaca-stream.mjs','/lib/market-events.mjs']){
    const res=await originalFetch(base+asset);assert.equal(res.status,404);
  }
});

test('snapshot auth failure never forwards provider bodies or local credentials',async t=>{
  process.env.APCA_API_KEY_ID='private-snapshot-key';process.env.APCA_API_SECRET_KEY='private-snapshot-secret';
  const configured=await import('../server.mjs?sanitized-provider-error');
  global.fetch=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://data.alpaca.markets');
    assert.equal(options.headers['APCA-API-SECRET-KEY'],'private-snapshot-secret');
    return new Response(JSON.stringify({message:'Echoed private-snapshot-key and private-snapshot-secret'}),{status:403});
  };
  const server=configured.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{global.fetch=originalFetch;delete process.env.APCA_API_KEY_ID;delete process.env.APCA_API_SECRET_KEY;server.closeMarketData();await new Promise(r=>server.close(r));});
  const res=await originalFetch(`http://127.0.0.1:${server.address().port}/api/live`);
  assert.equal(res.status,502);
  const body=await res.text();assert.match(body,/authentication or entitlement/);
  assert(!body.includes('private-snapshot-key'));assert(!body.includes('private-snapshot-secret'));assert(!body.includes('Echoed'));
});
