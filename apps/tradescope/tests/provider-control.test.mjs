import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProviderControl,createProviderControlApi} from '../lib/provider-control.mjs';

const date=()=>new Date('2026-11-13T20:00:00Z');
const env={APCA_API_KEY_ID:'demo-key',APCA_API_SECRET_KEY:'demo-secret',SEC_USER_AGENT:'ResearchOS test@example.com',
 FRED_API_KEY:'f'.repeat(32),EIA_API_KEY:'e'.repeat(32),USDA_FAS_API_KEY:'u'.repeat(32),
 EODHD_API_TOKEN:'private-token',EODHD_INTERNAL_RESEARCH_ENABLED:'false',NVIDIA_API_KEY:'future-only-token'};
test('catalog shows 14 source integrations, separates configured and supported, never includes secrets',()=>{
 const svc=createProviderControl({env,now:date,probes:{
  alpaca:async()=>({count:2,observationDate:'2026-11-12'}),
  sec:async()=>({count:4}),
  gdelt:async()=>({count:0})
 }});
 const x=svc.catalog();
 assert.equal(x.sources.length,14);
 const by=new Map(x.sources.map(s=>[s.id,s]));
 assert.equal(by.get('eia').configured,true);
 assert.equal(by.get('alpaca').status,'NOT_PROBED');
 assert.equal(by.get('nvidia').status,'NOT_IMPLEMENTED');
 assert.equal(by.get('eodhd').configured,false);
 assert.equal(by.get('gdelt').status,'NOT_PROBED');
 assert.equal(by.get('fred').status,'NOT_IMPLEMENTED');
 assert.equal(by.get('usgs').method,'Manual local capture');
 assert(x.checksNeverAutomatic);
 assert(!JSON.stringify(x).includes('demo-secret'));
 assert(!JSON.stringify(x).includes('future-only-token'));
 assert(x.sources.every(s=>s.envNames.every(name=>!name.includes('secret-token'))));
});
test('provider checks distinguish successful observation from valid but empty observations',async()=>{
 const svc=createProviderControl({env:{},now:date,probes:{
  gdelt:async()=>({count:0}),comtrade:async()=>({count:3,observationDate:'2025-12-31'})
 }});
 const zero=await svc.probe('gdelt');
 assert.equal(zero.status,'EMPTY');
 assert.equal(zero.observedRecords,0);
 const observed=await svc.probe('comtrade');
 assert.equal(observed.status,'SUCCESS');
 assert.equal(observed.observedRecords,3);
 assert.equal(svc.catalog().sources.find(s=>s.id==='comtrade').latestObservationDate,'2025-12-31');
 assert.equal(svc.catalog().history.length,2);
 assert.equal(svc.catalog().history[0].id,'comtrade');
});
test('failed probe retains previous success and never echoes upstream secrets',async()=>{
 let calls=0;
 const svc=createProviderControl({env:{},now:date,probes:{
  gdelt:async()=>{if(++calls===1)return {count:5,observationDate:'2026-11-11'};
   throw Object.assign(new Error('secret leaked from provider abc-123'),{status:429});}
 }});
 const first=await svc.probe('gdelt');
 const last=await svc.probe('gdelt');
 assert.equal(first.status,'SUCCESS');
 assert.equal(last.status,'FAILED');
 assert.equal(last.failureCategory,'RATE_LIMITED');
 assert.equal(last.successAt,first.successAt);
 assert.equal(last.observationDate,'2026-11-11');
 assert.equal(svc.catalog().sources.find(x=>x.id==='gdelt').status,'FAILED');
 assert(!JSON.stringify(last).includes('secret leaked'));
});
test('unconfigured, unknown and unsupported providers cannot trigger upstream probes',async()=>{
 let calls=0;
 const svc=createProviderControl({env:{},probes:{eia:async()=>{calls++;return {count:1}}}});
 await assert.rejects(svc.probe('eia'),e=>e.status===503);
 await assert.rejects(svc.probe('nvidia'),e=>e.status===409);
 await assert.rejects(svc.probe('evil'),e=>e.status===400);
 assert.equal(calls,0);
});
test('duplicate source checks cannot run concurrently and in-memory status history is bounded',async()=>{
 let finish;
 const gate=new Promise(resolve=>finish=resolve);
 const svc=createProviderControl({env:{},maxHistory:3,probes:{gdelt:()=>gate}});
 const pending=svc.probe('gdelt');
 await assert.rejects(svc.probe('gdelt'),e=>e.status===409);
 finish({count:1});
 await pending;await svc.probe('gdelt');await svc.probe('gdelt');await svc.probe('gdelt');
 assert.equal(svc.catalog().history.length,3);
});
test('provider control HTTP API requires explicit POST, rejects cross-origin writes and never exposes credentials',async t=>{
 const svc=createProviderControl({env,now:date,probes:{alpaca:async()=>({count:5,observationDate:'2026-11-12'})}});
 const handler=createProviderControlApi({service:svc});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port+'/api/provider-control/';
 const c=await fetch(root+'catalog');assert.equal(c.status,200);
 assert(!JSON.stringify(await c.json()).includes('demo-secret'));
 assert.equal((await fetch(root+'probe')).status,404);
 const probe=async(headers,body={id:'alpaca'})=>fetch(root+'probe',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await probe({Origin:'https://malicious.invalid'})).status,403);
 assert.equal((await probe({},{id:'alpaca',private:'extra'})).status,400);
 assert.equal((await probe({},{id:'not-real'})).status,400);
 const result=await probe({Origin:'http://127.0.0.1:'+server.address().port});
 assert.equal(result.status,200);
 assert.equal((await result.json()).status,'SUCCESS');
 const after=await (await fetch(root+'catalog')).json();
 assert.equal(after.history.length,1);
 assert.equal(after.history[0].observedRecords,5);
 assert(!JSON.stringify(after).includes('demo-secret'));
});
test('source control frontend assets are syntax valid, controls exist, no client-side external API calls',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,js,css]=await Promise.all(['source-control.html','source-control.js','source-control.css'].map(name=>fs.readFile(path.join(root,name),'utf8')));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'source-control.js'}));
 for(const id of ['sourceRows','sourceCount','configuredCount','successCount','failedCount','status','refresh','history'])
  assert(html.includes('id="'+id+'"'),'Missing '+id);
 assert(html.includes('href="/source-control.css"'));
 assert(html.includes('src="/source-control.js"'));
 assert(!js.includes('api.eia.gov'));assert(!js.includes('api.stlouisfed.org'));assert(!js.includes('data.alpaca.markets'));
 assert(css.includes('.status.SUCCESS'));
});
