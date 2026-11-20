import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {fredResearchUrl,normalizeFredResearch,createFredExplorer,createFredExplorerApi} from '../lib/fred-explorer.mjs';
const env={FRED_API_KEY:'a'.repeat(32)};
const now=()=>new Date('2026-11-13T20:00:00Z');
const resp=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{'content-type':'application/json'}});
const sample={seriess:[{id:'T10Y3M',title:'10Y minus 3M',units:'Percent',frequency:'Daily',
 observation_start:'1982-01-01',observation_end:'2026-11-12'}]};
test('FRED supports only fixed official API hosts and documented bounded routes',()=>{
 const paths={search:'series/search',series:'series',vintages:'series/vintagedates',release:'series/release',
  releaseDates:'release/dates',observations:'series/observations'};
 for(const [type,path]of Object.entries(paths)){
  const options=type==='search'?{q:'credit spreads'}:type==='releaseDates'?{releaseId:10}:
   type==='observations'?{id:'T10Y3M',asOf:'2020-02-15',months:18}:{id:'T10Y3M'};
  const url=fredResearchUrl(type,options,env);
  assert.equal(url.origin,'https://api.stlouisfed.org');
  assert.equal(url.pathname,'/fred/'+path);
  assert.equal(url.searchParams.get('file_type'),'json');
  assert.equal(url.searchParams.get('api_key').length,32);
  if(type==='observations'){
   assert.equal(url.searchParams.get('realtime_start'),'2020-02-15');
   assert.equal(url.searchParams.get('realtime_end'),'2020-02-15');
   assert.equal(url.searchParams.get('observation_end'),'2020-02-15');
  }
 }
 assert.throws(()=>fredResearchUrl('search',{q:'a'},env),e=>e.status===400);
 assert.throws(()=>fredResearchUrl('series',{id:'https://attacker.invalid'},env),e=>e.status===400);
 assert.throws(()=>fredResearchUrl('series',{id:'UNRATE'},{FRED_API_KEY:''}),e=>e.status===503);
});
test('FRED source normalizers preserve issuer-known release identity and bound results',()=>{
 const meta=normalizeFredResearch('search',sample,{fetchedAt:'2026-11-13T20:00:00Z'});
 assert.equal(meta.series[0].sourceUrl,'https://fred.stlouisfed.org/series/T10Y3M');
 const vint=normalizeFredResearch('vintages',{vintage_dates:['2019-11-13','2020-02-13']});
 assert.equal(vint.dates[1],'2020-02-13');
 const rel=normalizeFredResearch('release',{releases:[{id:10,name:'Economic Data Release'}]});
 assert.equal(rel.releases[0].id,10);
 const days=normalizeFredResearch('releaseDates',{release_dates:[{release_id:10,date:'2020-02-13'}]});
 assert.equal(days.dates[0].date,'2020-02-13');
});
test('ALFRED as-of observations reject future and vintage-incompatible facts',()=>{
 const observation={realtime_start:'2020-02-15',realtime_end:'2020-02-15',observations:[
  {date:'2020-01-01',value:'2.10',realtime_start:'2019-12-01',realtime_end:'2020-03-01'},
  {date:'2020-02-01',value:'.',realtime_start:'2019-12-01',realtime_end:'2020-03-01'}
 ]};
 const d=normalizeFredResearch('observations',observation,{id:'T10Y3M',asOf:'2020-02-15'});
 assert.equal(d.observations[0].value,2.1);
 assert.equal(d.observations[1].value,null);
 assert.equal(d.originalIntradayReleaseVerified,false);
 assert.throws(()=>normalizeFredResearch('observations',{...observation,realtime_end:'2020-02-16'},
  {id:'T10Y3M',asOf:'2020-02-15'}),e=>e.status===502);
 assert.throws(()=>normalizeFredResearch('observations',{...observation,observations:[{
  date:'2020-02-16',value:'2',realtime_start:'2019-12-01',realtime_end:'2020-03-01'}]},
  {id:'T10Y3M',asOf:'2020-02-15'}),e=>e.status===502);
});
test('FRED explorer never returns API secret and caches bounded official series requests',async()=>{
 let calls=0,seen=null;
 const service=createFredExplorer({env,now,fetchImpl:async(url,opts)=>{
  calls++;seen={url,opts};return resp(sample);
 }});
 const d=await service.query('search',{q:'treasury spread'});
 assert.equal(d.series.length,1);
 assert(!JSON.stringify(d).includes(env.FRED_API_KEY));
 assert.equal(service.catalog().configured,true);
 await service.query('search',{q:'treasury spread'});
 assert.equal(calls,1);
 assert.equal(seen.opts.redirect,'error');
});
test('FRED upstream failures redact provider response, bad entitlements and future dates',async()=>{
 const fail=createFredExplorer({env,now,fetchImpl:async()=>resp({error:'upstream private data'},401)});
 await assert.rejects(fail.query('series',{id:'UNRATE'}),e=>e.status===503&&!e.message.includes('private data'));
 const svc=createFredExplorer({env,now,fetchImpl:async()=>resp({observations:[]})});
 await assert.rejects(svc.query('observations',{id:'UNRATE',asOf:'2027-01-01'}),e=>e.status===400);
 await assert.rejects(svc.query('series',{id:'UNRATE'}),e=>e.status===502);
});
test('FRED discovery API requires valid query keys and is GET-only',async t=>{
 const service=createFredExplorer({env,now,fetchImpl:async()=>resp(sample)});
 const handler=createFredExplorerApi({service});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>{server.closeAllConnections();await new Promise(done=>server.close(done));});
 const base='http://127.0.0.1:'+server.address().port+'/api/fred-explorer/';
 assert.equal((await fetch(base+'catalog')).status,200);
 const search=await (await fetch(base+'search?q=credit%20spread')).json();
 assert.equal(search.series[0].id,'T10Y3M');
 assert(!JSON.stringify(search).includes(env.FRED_API_KEY));
 assert.equal((await fetch(base+'search?q=credit&q=spread')).status,400);
 assert.equal((await fetch(base+'series?id=UNRATE&evil=1')).status,400);
 assert.equal((await fetch(base+'observations?id=UNRATE')).status,400);
 assert.equal((await fetch(base+'missing')).status,400);
 assert.equal((await fetch(base+'search?q=credit',{method:'POST'})).status,405);
});
test('FRED source explorer frontend is static, syntax valid and does not expose credentials',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,css,js]=await Promise.all(['fred-research.html','fred-research.css','fred-research.js'].map(x=>fs.readFile(path.join(root,x),'utf8')));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'fred-research.js'}));
 for(const id of ['searchForm','query','results','seriesId','loadVintages','loadRelease','asOf','history','loadReleaseDates','releaseId'])
  assert(html.includes('id="'+id+'"'));
 assert(html.includes('href="/fred-research.css"'));
 assert(html.includes('src="/fred-research.js"'));
 assert(!js.includes('api.stlouisfed.org'));
 assert(css.includes('.results'));
});
