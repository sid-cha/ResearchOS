import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
 GLOBAL_EVENT_SOURCES,normalizeUsgs,normalizeEonet,normalizeFaaCollection,
 createGlobalEventAdapters,createGlobalEventCollector,createGlobalEventApi
} from '../lib/global-event-collector.mjs';

const T1='2026-11-14T12:00:00.000Z',T2='2026-11-14T12:05:00.000Z';
const hit=(id='us7001',mag=5.2)=>({type:'Feature',id,geometry:{type:'Point',coordinates:[-120.5,38.2,8]},
 properties:{mag,place:'25 km N of test valley',time:Date.parse(T1)-1000,
  updated:Date.parse(T1)-500,url:'https://earthquake.usgs.gov/earthquakes/eventpage/'+id,status:'reviewed'}});
const usgs=(...features)=>({type:'FeatureCollection',metadata:{generated:Date.parse(T1)},features});
const eonet=(title='Wildfire alpha')=>({id:'EONET_123',title,description:'A wildfire',
 categories:[{id:'wildfires',title:'Wildfires'}],link:'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_123',
 geometry:[{date:'2026-11-14T08:00:00Z',type:'Point',coordinates:[-120,41]}],closed:null});
const faa=()=>({source:'FAA_NAS_STATUS',events:[{id:'A-32',airport:'JFK',type:'GROUND_STOP',
 reason:'Weather',startAt:T1,endAt:null}]});
const normalized=(title='First report')=>({id:'USGS:us7001',source:'USGS',family:'climate',type:'EARTHQUAKE',title,
 description:'Observed official fact only',eventTime:T1,providerUpdatedAt:T1,
 sourceUrl:'https://earthquake.usgs.gov/earthquakes/eventpage/us7001',location:[-120,38],status:'reviewed'});
async function fixture(t,settings={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-global-events-'));
 const filename=path.join(dir,'events.json');
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 let clock=T1,usgsTitle='First report',usa=true,nasa=true,fa=true;
 const adapters={
  USGS:async()=>{if(!usa)throw Error('provider secret diagnostic');return [normalized(usgsTitle)];},
  NASA_EONET:async()=>nasa?normalizeEonet({events:[eonet()]}):[],
  FAA_NAS_STATUS:async()=>fa?normalizeFaaCollection(faa()):[]
 };
 const service=createGlobalEventCollector({filename,enabled:true,adapters,
  now:()=>clock,...settings});
 return {service,filename,dir,setClock:v=>clock=v,setTitle:v=>usgsTitle=v,
  setUsgsWorking:v=>usa=v,setNasa:v=>nasa=v,setFaa:v=>fa=v,adapters};
}
test('normalizes three independent official source schemas without inventing financial impact',()=>{
 const a=normalizeUsgs(usgs(hit(),hit('badlow',2.1)));
 assert.equal(a.length,1);
 assert.equal(a[0].source,'USGS');
 assert.equal(a[0].id,'USGS:us7001');
 assert.deepEqual(a[0].location,[-120.5,38.2]);
 assert.equal(a[0].issuerExposureVerified,false);
 assert.equal(a[0].forecastProbability,null);
 const b=normalizeEonet({events:[eonet()]});
 assert.equal(b.length,1);assert.equal(b[0].type,'WILDFIRE');
 assert.equal(b[0].eventTime,'2026-11-14T08:00:00.000Z');
 const c=normalizeFaaCollection(faa());
 assert.equal(c.length,1);assert.equal(c[0].type,'AVIATION_GROUND_STOP');
 assert.equal(c[0].sourceUrl,'https://nasstatus.faa.gov/');
 assert.equal(c[0].location,null);
 assert.equal(GLOBAL_EVENT_SOURCES.length,3);
});
test('adapters call only official fixed providers and reject malformed overbroad payloads',async()=>{
 const requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});
  let data;
  if(url.includes('earthquake.usgs.gov'))data=usgs(hit());
  else if(url.includes('eonet.gsfc.nasa.gov'))data={events:[eonet()]};
  else data=[{airportId:'JFK',groundStop:{id:'A-32',reason:'Weather',startTime:T1}}];
  return {ok:true,headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(data)};
 };
 const adapters=createGlobalEventAdapters({fetchImpl});
 assert.equal((await adapters.USGS())[0].source,'USGS');
 assert.equal((await adapters.NASA_EONET())[0].source,'NASA_EONET');
 assert.equal((await adapters.FAA_NAS_STATUS())[0].source,'FAA_NAS_STATUS');
 assert.deepEqual(requests.map(x=>x.url),GLOBAL_EVENT_SOURCES.map(x=>x.url));
 assert(requests.every(x=>x.options.redirect==='error'));
 assert.throws(()=>normalizeUsgs({features:[]}),{status:502});
 assert.throws(()=>normalizeEonet({events:Array(501).fill(eonet())}),{status:502});
});
test('capture timestamps, duplicate no-op, revisions and as-of replay survive service restart',async t=>{
 const h=await fixture(t);
 const a=await h.service.poll();
 assert.equal(a.results.filter(x=>x.status==='ok').length,3);
 assert.equal(a.results[0].added,1);
 let first=await h.service.list({});
 assert.equal(first.total,3);
 assert(first.events.every(x=>x.firstObservedAt===T1));
 assert.equal(first.events.find(x=>x.source==='USGS').revision,1);
 h.setClock(T2);await h.service.poll();
 const afterDedupe=await h.service.status();
 assert.equal(afterDedupe.revisionCount,3);
 h.setTitle('Revised description');h.setClock('2026-11-14T12:09:00Z');
 await h.service.poll();
 const revised=await h.service.detail('USGS:us7001');
 assert.equal(revised.revisions.length,2);
 assert.equal(revised.revisions[0].capturedAt,T1);
 assert.equal(revised.revisions[1].event.title,'Revised description');
 const old=await h.service.list({source:'USGS',asOf:T1});
 assert.equal(old.events[0].title,'First report');
 assert.equal(old.events[0].revision,1);
 assert.equal(old.events[0].lastObservedAt,T1);
 assert.equal((await h.service.list({asOf:'2026-11-14T11:59:59Z'})).total,0);
 await h.service.close();
 const reload=createGlobalEventCollector({filename:h.filename,enabled:false,
  adapters:h.adapters,now:()=>T2});
 assert.equal((await reload.status()).eventCount,3);
 assert.equal((await reload.detail('USGS:us7001')).revisions.length,2);
 const raw=await readFile(h.filename,'utf8');assert(!raw.includes('provider secret diagnostic'));
});
test('provider failures do not erase prior evidence, falsely resolve events, or reveal diagnostics',async t=>{
 const h=await fixture(t);
 await h.service.poll();
 h.setClock(T2);h.setUsgsWorking(false);h.setNasa(false);h.setFaa(false);
 const run=await h.service.poll();
 assert.equal(run.results[0].status,'failed');
 assert.equal(run.results[1].status,'ok');
 assert.equal((await h.service.list()).total,3,'absence from snapshot is not deletion');
 const stat=await h.service.status();
 assert.equal(stat.sources[0].status,'failed');
 assert.equal(stat.sources[0].lastSuccessAt,T1);
 assert(!JSON.stringify(run).includes('secret diagnostic'));
 assert(!JSON.stringify(stat).includes('secret diagnostic'));
});
test('a capacity error rolls back the entire offending provider batch',async t=>{
 const h=await fixture(t,{maxEvents:1});
 h.adapters.USGS=async()=>[normalized('A'),{...normalized('B'),id:'USGS:second'}];
 h.setNasa(false);h.setFaa(false);
 const run=await h.service.poll();
 assert.equal(run.results[0].status,'failed');
 const events=await h.service.list();
 assert.equal(events.total,0);
 assert.equal((await h.service.status()).sources[0].status,'failed');
});
test('invalid as-of/source/limit and corrupt stored revisions fail closed',async t=>{
 const h=await fixture(t);
 await h.service.poll();
 await assert.rejects(h.service.list({source:'UNKNOWN'}),{status:400});
 await assert.rejects(h.service.list({asOf:'tomorrow'}),{status:400});
 await assert.rejects(h.service.list({limit:300}),{status:400});
 await assert.rejects(h.service.detail('../../.env'),{status:400});
 await h.service.close();
 const text=await readFile(h.filename,'utf8');
 await writeFile(h.filename,text.replace('First report','Altered without new hash'));
 const reread=createGlobalEventCollector({filename:h.filename,adapters:h.adapters,enabled:true});
 await assert.rejects(reread.list(),{status:500});
});
test('manual refresh is opt-in loopback POST; readonly archive remains available',async t=>{
 const h=await fixture(t);
 const handler=createGlobalEventApi({collector:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await h.service.close();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port+'/api/global-events/';
 const catalog=await fetch(root+'status');assert.equal(catalog.status,200);
 assert.equal((await (await fetch(root+'events')).json()).total,0);
 const body='{}',headers={'Content-Type':'application/json'};
 assert.equal((await fetch(root+'refresh',{method:'POST',headers,body})).status,403);
 assert.equal((await fetch(root+'refresh',{method:'POST',headers:{...headers,
   'X-ResearchOS-Event-Refresh':'1',Origin:'https://attacker.example'},body})).status,403);
 const ok=await fetch(root+'refresh',{method:'POST',headers:{...headers,
  'X-ResearchOS-Event-Refresh':'1'},body});
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).eventCount,3);
 const results=await (await fetch(root+'events?asOf='+encodeURIComponent(T1))).json();
 assert.equal(results.total,3);
 assert.equal((await fetch(root+'detail?id=USGS%3Aus7001')).status,200);
 assert.equal((await fetch(root+'events?limit=1000')).status,400);
 assert.equal((await fetch(root+'detail?id=../../.env')).status,400);
});
test('disabled collector does not perform network requests or register an automatic scheduler',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-disabled-'));t.after(async()=>rm(dir,{recursive:true,force:true}));
 let calls=0,timers=0;
 const service=createGlobalEventCollector({filename:path.join(dir,'disabled.json'),enabled:false,autoPoll:true,
  adapters:Object.fromEntries(GLOBAL_EVENT_SOURCES.map(s=>[s.id,async()=>{calls++;return[];}])),
  setIntervalFn:()=>{timers++;return 1;},now:()=>T1});
 service.start();
 assert.equal(timers,0);assert.equal(calls,0);
 await assert.rejects(service.poll(),{status:403});
 assert.equal((await service.status()).enabled,false);
 await service.close();
});
test('portal exposes user-initiated refresh, as-of filter and L1/L2/L3 deep link without secret assets',async()=>{
 const read=p=>readFile(new URL(p,import.meta.url),'utf8');
 const [html,js,nav,server,css]=await Promise.all([
  read('../event-portal.html'),read('../event-portal.js'),read('../hierarchy-navigation.js'),
  read('../server.mjs'),read('../event-portal.css')]);
 assert.match(html,/id="global-feed"/);
 for(const id of ['globalPoll','globalSource','globalAsOf','globalEventList','globalEventDetail'])
  assert(html.includes('id="'+id+'"'));
 assert(js.includes('X-ResearchOS-Event-Refresh'));
 assert(js.includes('global-event'));
 assert(nav.includes("href:'/event-portal.html#global-feed'"));
 assert(server.includes('createGlobalEventApi'));
 assert(css.includes('.collector-grid'));
 assert(!html.includes('API_SECRET_KEY'));
});
