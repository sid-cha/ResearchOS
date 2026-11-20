import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createCaseStore} from '../lib/cases.mjs';
import {createCaseApi} from '../lib/case-api.mjs';
import {normalizeAlpacaEvent} from '../lib/market-events.mjs';

const eventTime='2026-11-12T15:00:00.123456789Z';
const receivedAt='2026-11-12T15:00:00.133Z';
const ingestedAt='2026-11-12T15:00:00.134Z';
const canonical=normalizeAlpacaEvent({T:'t',S:'AAPL',i:'4593901',t:eventTime,p:255.2,s:100,x:'V',c:['@']},{symbols:['AAPL'],receivedAt,ingestedAt});
const payload=marketData=>({symbol:'AAPL',event:{id:'market:IEX-AAPL-4593901',source:'ALPACA_IEX',headline:'AAPL observed trade',type:'TRADE',category:'MARKET',symbols:['AAPL'],occurredAt:eventTime,marketData}});

test('selected market provenance survives save, restart and HTTP export without raw payloads',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-market-case-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const filename=join(dir,'cases.json');
 const store=createCaseStore(filename),handle=createCaseApi({store});
 const server=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost'))){res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(`${base}/api/cases`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload({...canonical,secret:'must-not-persist',auth:{key:'must-not-persist'}}))});
 assert.equal(response.status,201);const created=await response.json();
 assert.deepEqual(created.event.marketData,{schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',mode:'LIVE',instrumentId:'US_EQUITY:AAPL',symbol:'AAPL',eventType:'trade',sourceEventId:'4593901',exchange:'V',exchangeEventTime:eventTime,receivedAt,ingestedAt});
 assert.equal(created.event.occurredAt,eventTime);assert.equal(created.event.ingestedAt,ingestedAt);
 assert.equal(created.event.providerFirstSeenAt,null);
 assert.equal(created.event.marketData.trade,undefined);
 const reopened=await createCaseStore(filename).get(created.id);assert.deepEqual(reopened,created);
 const exported=await fetch(`${base}/api/cases/${created.id}/export`);assert.equal(exported.status,200);
 const body=await exported.text();assert(!body.includes('must-not-persist'));assert.deepEqual(JSON.parse(body).event.marketData,created.event.marketData);
 assert(!String(await readFile(filename)).includes('must-not-persist'));
});

test('missing source times remain unknown and invalid or mismatched lineage is not stored',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-market-case-validation-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createCaseStore(join(dir,'cases.json'));
 const unknown=await store.create(payload({...canonical,sourceEventId:null,exchange:null,exchangeEventTime:null,receivedAt:null,ingestedAt:'2026-02-30T10:00:00Z'}));
 assert.equal(unknown.event.occurredAt,null);assert.equal(unknown.event.ingestedAt,null);
 assert.equal(unknown.event.marketData.receivedAt,null);assert.equal(unknown.event.marketData.sourceEventId,null);
 for(const invalid of [{...canonical,schemaVersion:2},{...canonical,symbol:'MSFT'},{...canonical,provider:'x'.repeat(100)},{...canonical,instrumentId:{unexpected:'object'}}]){
  const c=await store.create(payload(invalid));assert.equal(c.event.marketData,undefined);
 }
 const synthetic=payload(canonical);synthetic.event.synthetic=true;
 assert.equal((await store.create(synthetic)).event.marketData,undefined);
 const older=await store.create(payload(undefined));assert.equal(older.event.marketData,undefined);
 assert.equal(older.event.occurredAt,'2026-11-12T15:00:00.123Z');
});
