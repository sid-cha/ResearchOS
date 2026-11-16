import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 MECHANISM_RULE,MECHANISMS,graphForTheme,classifyMechanismText,
 themeSourceUrl,normalizeThemeMedia,createMechanismRadar,createMechanismApi
} from '../lib/mechanism-radar.mjs';

const T0='2026-11-15T00:00:00.000Z',
 T1='2026-11-16T18:00:00.000Z',T2='2026-11-16T18:10:00.000Z',
 T3='2026-11-16T18:20:00.000Z';
const ensopayload={articles:[
 {title:'Pacific trade winds weaken as El Nino develops',
  url:'https://climate.example.org/wind'},
 {title:'A shipping disruption occurs at major ocean port',
  url:'https://news.example.org/port'},
 {title:'Unrelated celebrity movie opens this week',url:'https://news.example.org/film'},
 {title:'Malformed Pacific trade winds',url:'not-a-url'}
]};
const exportpayload={articles:[{title:'New export controls introduced for semiconductor equipment',
 url:'https://news.example.org/export-controls'}]};
const cpcSource={
 asOf:async date=>({
  asOf:date,evidenceStatus:'DATED_ISSUE_VISIBLE_ARCHIVE_REVISION_NOT_VERIFIED',
  archiveUrl:'https://www.cpc.ncep.noaa.gov/products/expert_assessment/ENSO_DD_archive.php',
  discussion:{
   archiveMonth:'2026-11',issueDate:'2026-11-12',
   synopsis:'El Nino strengthens as easterly trade winds weaken, Pacific ocean temperatures rise, and upper winds shift.',
   sourceUrl:'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_nov2026/ensodisc.shtml'
  },fetchedAt:'2026-11-16T18:01:00.000Z'
 })
};
const response=json=>{
 const body=Buffer.from(JSON.stringify(json));
 return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/json':
  k==='content-length'?String(body.length):null},body:Readable.from([body])};
};
async function fixture(t,{enabled=true,rightsAcknowledged=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-mechanism-radar-'));
 t.after(async()=>rm(dir,{force:true,recursive:true}));
 const filename=path.join(dir,'radar.json'),calls=[];
 let now=T1,payload=ensopayload,cpcPayload=cpcSource;
 const cpc={asOf:async date=>{calls.push({provider:'NOAA',date});return cpcPayload.asOf(date);}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(new URL(url).hostname,'api.gdeltproject.org');
  return response(payload);
 };
 const radar=createMechanismRadar({filename,fetchImpl,cpc,enabled,rightsAcknowledged,now:()=>now});
 return {radar,filename,cpc,fetchImpl,calls,
  setNow:x=>{now=x;},setPayload:x=>{payload=x;},
  setCpc:x=>{cpcPayload=x;}};
}
test('mechanism ontology discovers environmental and regulatory themes without issuer names',()=>{
 assert.equal(MECHANISM_RULE,'GENERIC-CAUSAL-RADAR-0.45.1');
 assert.equal(MECHANISMS.length,4);
 assert(classifyMechanismText('Pacific trade winds weaken before ENSO conditions').includes('enso-circulation'));
 assert(classifyMechanismText('Export controls expand to semiconductor tooling').includes('regulatory-export'));
 assert(classifyMechanismText('Freight delays after a port closure').includes('logistics-bottleneck'));
 assert(classifyMechanismText('Gas pipeline outage announced').includes('energy-supply'));
 assert.equal(classifyMechanismText('Nvidia CEO spoke at conference').length,0);
});
test('ENSO pathway includes California, Peruvian fisheries, and agriculture as separate conditional branches',()=>{
 const s=graphForTheme('enso-circulation');
 assert(s.nodes.some(x=>x.id==='california-storms'));
 assert(s.nodes.some(x=>x.id==='peru-anchoveta'));
 assert(s.nodes.some(x=>x.id==='fert-market'));
 assert(s.edges.some(x=>x.from==='coastal-upwelling'&&x.to==='peru-anchoveta'));
 assert(s.edges.some(x=>x.from==='crop-farming'&&x.to==='fert-market'));
 assert(s.edges.every(x=>x.conditional&&x.causallyVerified===false));
 assert.equal(s.nodes.at(-1).kind,'issuer_exposure');
 assert.throws(()=>graphForTheme('company-name'),{status:400});
});
test('fixed GDELT theme query is independent of issuer name and has a bounded window',()=>{
 const u=new URL(themeSourceUrl('enso-circulation'));
 assert.equal(u.hostname,'api.gdeltproject.org');
 assert.equal(u.searchParams.get('timespan'),'1week');
 assert.equal(u.searchParams.get('maxrecords'),'40');
 assert(!u.searchParams.get('query').includes('Nvidia'));
 assert.throws(()=>themeSourceUrl('http://localhost'),{status:400});
});
test('media themes retain only matching headlines as unverified topic candidates',()=>{
 const p=normalizeThemeMedia(ensopayload,'enso-circulation');
 assert.equal(p.items.length,1);
 assert.equal(p.skipped.unrelated,2);
 assert.equal(p.skipped.invalid,1);
 assert.equal(p.items[0].underlyingMechanismVerified,false);
 assert.equal(p.items[0].publisherOriginalTimeVerified,false);
 assert.equal(p.items[0].contentStatus,'MEDIA_TITLE_TOPIC_MATCH_ONLY');
 assert.match(p.items[0].id,/^[a-f0-9]{24}$/);
});
test('full GDELT page and malformed provider records fail closed rather than claim complete discovery',()=>{
 assert.throws(()=>normalizeThemeMedia({articles:Array(40).fill(ensopayload.articles[0])},
  'enso-circulation'),{status:409});
 assert.throws(()=>normalizeThemeMedia({articles:'malformed'},'enso-circulation'),{status:502});
});
test('theme-specific GDELT capture saves local first-seen and no artificial economic findings',async t=>{
 const h=await fixture(t);
 const first=await h.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'});
 assert.equal(first.deduplicated,false);
 assert.equal(first.snapshot.capturedAt,T1);
 assert.equal(first.snapshot.observations.length,1);
 assert.match(first.snapshot.bodySha256,/^[a-f0-9]{64}$/);
 const view=await h.radar.view({asOf:T1,themeId:'enso-circulation'});
 assert.equal(view.results.length,1);
 assert.deepEqual(view.results[0].observedNodes,['climate-observation']);
 assert.equal(view.results[0].namedIssuerExposure,null);
 assert.equal(view.results[0].expectedFinancialReturns,null);
 assert.equal(view.results[0].edges.every(x=>x.causallyVerified===false),true);
 assert.equal(view.results[0].missingEvidence.length,view.results[0].nodes.length-1);
 const before=h.calls.length;await h.radar.view();
 assert.equal(h.calls.length,before);
 assert.equal((await h.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'})).deduplicated,true);
});
test('NOAA CPC issued discussion is source context, not authenticated original publication clock',async t=>{
 const h=await fixture(t);
 const r=await h.radar.capture({themeId:'enso-circulation',provider:'NOAA_CPC'});
 assert.equal(r.snapshot.provider,'NOAA_CPC');
 assert.equal(r.snapshot.observations.length,1);
 assert.equal(r.snapshot.observations[0].issueDateClaimedByArchive,'2026-11-12');
 assert.equal(r.snapshot.observations[0].availableOriginalPublicationClockVerified,false);
 const research=await h.radar.view({asOf:T1,themeId:'enso-circulation'});
 assert.equal(research.results[0].observations[0].localFirstSeenAt,T1);
 assert.equal(research.results[0].causalEffectVerified,false);
 await assert.rejects(h.radar.capture({themeId:'regulatory-export',provider:'NOAA_CPC'}),{status:400});
 assert.equal(h.calls.filter(x=>x.provider==='NOAA').length,1);
});
test('2026 locally captured NOAA archive cannot masquerade as a 2025 ResearchOS alert',async t=>{
 const h=await fixture(t);
 await h.radar.capture({themeId:'enso-circulation',provider:'NOAA_CPC'});
 const historic=await h.radar.view({asOf:T0,themeId:'enso-circulation'});
 assert.equal(historic.results[0].observations.length,0);
 assert.equal(historic.results[0].readiness,'NO_LOCALLY_CAPTURED_SIGNAL');
 assert.equal((await h.radar.view({asOf:T1})).results.filter(x=>x.observations.length).length,1);
 await assert.rejects(h.radar.view({asOf:T3}),{status:400});
});
test('new media revision observed later does not overwrite earlier as-of result',async t=>{
 const h=await fixture(t);
 await h.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'});
 h.setNow(T2);
 h.setPayload({articles:[{title:'Pacific trade winds weakened with El Nino forecast',
  url:'https://climate.example.org/wind'}]});
 const second=await h.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'});
 assert.equal(second.deduplicated,false);
 const earlier=await h.radar.view({asOf:T1,themeId:'enso-circulation'});
 const later=await h.radar.view({asOf:T2,themeId:'enso-circulation'});
 assert.equal(earlier.results[0].sourceCaptures,1);
 assert.equal(later.results[0].sourceCaptures,2);
 assert.equal(earlier.results[0].observations.length,1);
 assert.equal(later.results[0].observations.length,2);
});
test('missing NOAA issued discussion is not replaced with an ENSO forecast',async t=>{
 const h=await fixture(t);
 h.setCpc({asOf:async date=>({
  asOf:date,evidenceStatus:'NO_ELIGIBLE_DISCUSSION',
  archiveUrl:'https://www.cpc.ncep.noaa.gov/products/expert_assessment/ENSO_DD_archive.php',
  discussion:null
 })});
 const r=await h.radar.capture({themeId:'enso-circulation',provider:'NOAA_CPC'});
 assert.equal(r.snapshot.observations.length,0);
 assert.equal((await h.radar.view({themeId:'enso-circulation'})).results[0].readiness,
  'NO_LOCALLY_CAPTURED_SIGNAL');
});
test('journal restart validates digest and rejects altered causes/evidence',async t=>{
 const h=await fixture(t);
 await h.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'});
 await h.radar.close();
 const restored=createMechanismRadar({filename:h.filename,cpc:h.cpc,
  enabled:true,rightsAcknowledged:true,now:()=>T2,
  fetchImpl:async()=>{throw Error('NETWORK ON READ');}});
 assert.equal((await restored.view()).results.find(x=>x.id==='enso-circulation').observations.length,1);
 await restored.close();
 await writeFile(h.filename,(await readFile(h.filename,'utf8')).replace('Pacific trade winds weaken','Pacific trade winds increase'));
 const broken=createMechanismRadar({filename:h.filename,cpc:h.cpc,enabled:true,now:()=>T2});
 await assert.rejects(broken.view(),{status:500});
});
test('local-use and rights gates block all source actions before any external network',async t=>{
 const a=await fixture(t,{enabled:false});
 await assert.rejects(a.radar.view(),{status:403});
 await assert.rejects(a.radar.capture({themeId:'enso-circulation',provider:'GDELT_MEDIA'}),{status:403});
 assert.equal(a.calls.length,0);
 const b=await fixture(t,{rightsAcknowledged:false});
 await assert.rejects(b.radar.capture({themeId:'enso-circulation',provider:'NOAA_CPC'}),{status:403});
 assert.equal(b.calls.length,0);
});
test('local API disallows arbitrary source URL, unknown theme and cross-origin capture',async t=>{
 const h=await fixture(t),handler=createMechanismApi({radar:h.radar,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/mechanism-radar/';
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'view?themeId=energy-supply')).status,200);
 assert.equal((await fetch(url+'view?source=http://127.0.0.1')).status,400);
 const body=JSON.stringify({themeId:'enso-circulation',provider:'GDELT_MEDIA'});
 assert.equal((await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Mechanism':'1',
    Origin:'https://attacker.example'},body})).status,403);
 assert.equal((await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Mechanism':'1'},
  body:JSON.stringify({themeId:'enso-circulation',provider:'GDELT_MEDIA',url:'http://localhost/.env'})})).status,400);
 const r=await fetch(url+'capture',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Mechanism':'1'},body});
 assert.equal(r.status,200);
 assert.equal((await r.json()).snapshot.observations.length,1);
});
test('page, navigation, API routing and static asset allowlist wired for v0.45',async()=>{
 const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
 const [html,js,server,nav,build,security]=await Promise.all([
  read('mechanism-radar.html'),read('mechanism-radar.js'),
  read('server.mjs'),read('hierarchy-navigation.js'),
  read('scripts/build-static.mjs'),read('tests/security.test.mjs')
 ]);
 for(const id of ['mechanism-capture','mechanismForm','mechanismTheme','mechanism-replay',
  'mechanismCases','mechanismExport','mechanism-guardrails'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/mechanism-radar/'));
 assert(server.includes('if(await handleMechanismRadar(req,res,u))return;'));
 assert(nav.includes("href:'/mechanism-radar.html'"));
 assert(build.includes("'mechanism-radar.js'"));
 assert(security.includes("'mechanism-radar.js'"));
});
