import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {classifyGdeltArticle,normalizeGdeltCommodityFeed,corroborateDocuments,gdeltUrl,
 normalizeEiaSeries,eiaKey,eiaV2Url,normalizeComtrade,comtradeUrl,normalizePsd,psdUrl,usdaKey,
 normalizeUsgsCapture,createUsgsLedger,createCommodityFundamentals,createCommodityFundamentalsApi} from '../lib/commodity-fundamentals.mjs';
import {normalizeOfficialDocs,createCommodityWorkbench,createOfficialCommodityFeed} from '../lib/commodity-platform.mjs';

const now=()=>new Date('2026-11-13T12:00:00Z');
const temp=async t=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'tradescope-fund-'));
 t.after(()=>fs.rm(d,{recursive:true,force:true}));
 return path.join(d,'fundamentals.json');
};
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const fetchOk=body=>async()=>json(body);
const listen=async handler=>{
 const server=http.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {port}=server.address();
 return {server,url:'http://127.0.0.1:'+port,close:()=>new Promise(r=>server.close(r))};
};
const article=(title,when='20261110120000',url='https://media.example.test/story')=>({title,seendate:when,url,domain:'media.example.test'});

test('GDELT commodity articles are classified into typed research categories',()=>{
 assert.equal(classifyGdeltArticle('Belarus potash sanctions tighten export controls'),'SANCTIONS_EXPORT_CONTROLS');
 assert.equal(classifyGdeltArticle('New potash import duty announced'),'TRADE_POLICY');
 assert.equal(classifyGdeltArticle('Potash mine outage cuts production capacity'),'PRODUCTION_SUPPLY');
 assert.equal(classifyGdeltArticle('Port congestion slows fertilizer shipping'),'TRANSPORT_LOGISTICS');
 assert.equal(classifyGdeltArticle('Potash spot price contract premium rises'),'PRICES_MARKETS');
 assert.equal(classifyGdeltArticle('Drought affects crop harvest and planting'),'WEATHER_AGRICULTURE');
 assert.equal(classifyGdeltArticle('Regional agricultural report published'),'UNCLASSIFIED_MEDIA_REPORT');
});

test('GDELT normalizer deduplicates, rejects non-https and future items, and never asserts a disruption',()=>{
 const feed=normalizeGdeltCommodityFeed({articles:[article('Potash mine outage','20261110120000'),
  article('Potash mine outage','20261110130000'),
  article('Potash prices surge after contract talks','20261111120000'),
  article('Potash sanctions','20261111130000','http://insecure.example.test/x'),
  article('Future potash report','20271111120000')]},{commodity:'potash',today:'2026-11-13'});
 assert.equal(feed.results.length,2);
 assert.equal(feed.coverage.returned,5);
 assert.equal(feed.coverage.accepted,2);
 for(const item of feed.results){
  assert.equal(item.confirmedDisruption,false);
  assert.equal(item.observedIssuerImpact,false);
  assert.equal(item.classification,'MEDIA_REPORT_CANDIDATE_NOT_VERIFIED_DISRUPTION');
  assert.match(item.id,/^gdelt:[0-9a-f]{20}$/);
 }
 assert.equal(feed.results[0].category,'PRODUCTION_SUPPLY');
 assert.throws(()=>normalizeGdeltCommodityFeed({articles:[]},{commodity:'gold'}),e=>e.status===400);
 assert.throws(()=>normalizeGdeltCommodityFeed(null,{commodity:'potash'}),e=>e.status===502);
});

test('GDELT query stays on fixed official host and corroboration remains a calendar-proximity candidate only',()=>{
 const url=new URL(gdeltUrl('urea'));
 assert.equal(url.origin,'https://api.gdeltproject.org');
 assert.equal(url.searchParams.get('query'),'urea fertilizer');
 const official=normalizeOfficialDocs({results:[{document_number:'2026-12345',publication_date:'2026-11-09',
  title:'Potash trade notice',abstract:'Import arrangements.',type:'NOTICE'}]},{commodity:'potash',today:'2026-11-13'});
 const media=normalizeGdeltCommodityFeed({articles:[article('Potash shipping report','20261110120000')]},
  {commodity:'potash',today:'2026-11-13'});
 const pairs=corroborateDocuments(media.results,official.results);
 assert.equal(pairs.length,1);
 assert.equal(pairs[0].documentId,'fr:2026-12345:potash');
 assert.equal(pairs[0].status,'CALENDAR_PROXIMITY_CANDIDATE');
 assert.equal(pairs[0].corroborationVerified,false);
 const far=corroborateDocuments(media.results,normalizeOfficialDocs({results:[{document_number:'2026-12345',
  publication_date:'2026-01-01',title:'Old notice',abstract:'x',type:'NOTICE'}]},{commodity:'potash',today:'2026-11-13'}).results);
 assert.equal(far.length,0);
});

test('EIA series are period-dated with missing values explicit and future periods excluded',()=>{
 const series=normalizeEiaSeries({response:{data:[
  {period:'2026-10',value:'3.42'},{period:'2026-11',value:'.'},{period:'2027-01',value:'9.99'},
  {period:'2026-09',value:3.1}] }},{indicatorId:'henry_hub_spot',today:'2026-11-13'});
 assert.equal(series.source,'EIA_API_V2');
 assert.equal(series.apiVersion,'v2');
 assert.equal(series.observations.length,3);
 assert.equal(series.observations[0].period,'2026-11');
 assert.equal(series.observations[0].status,'MISSING_OR_WITHHELD_SOURCE_VALUE');
 assert.equal(series.observations[1].period,'2026-10');
 assert.equal(series.observations[1].value,3.42);
 assert.match(series.limitations.join(' '),/original historical publication timestamps/);
 assert.throws(()=>normalizeEiaSeries({series:[{series_id:'OTHER',data:[]}]},{indicatorId:'henry_hub_spot'}),e=>e.status===502);
 assert.throws(()=>normalizeEiaSeries({response:{data:[]}},{indicatorId:'nope'}),e=>e.status===502);
 assert.throws(()=>eiaKey({}),e=>e.status===503);
});

test('EIA v2 fixed routes never use deprecated /series and do not reveal credentials in catalog output',()=>{
 const env={EIA_API_KEY:'a'.repeat(32)};
 const henry=eiaV2Url('henry_hub_spot',{env}),dry=eiaV2Url('us_dry_gas_production',{env});
 assert.equal(henry.origin,'https://api.eia.gov');
 assert.equal(henry.pathname,'/v2/natural-gas/pri/fut/data/');
 assert.equal(henry.searchParams.get('frequency'),'monthly');
 assert.equal(henry.searchParams.get('data[0]'),'value');
 assert.equal(henry.searchParams.get('facets[series][]'),'RNGWHHD');
 assert.equal(dry.pathname,'/v2/seriesid/NG.N9070US2.M');
 assert(!dry.pathname.includes('/series/'));
 assert.throws(()=>eiaV2Url('not_a_series',{env}),e=>e.status===400);
 const rows=normalizeEiaSeries({response:{data:[
  {period:'2026-08',value:'12',series:'N9070US2'},
  {period:'2026-09',value:'25',series:'NG.N9070US2.M'},
  {period:'2027-01',value:'200',series:'NG.N9070US2.M'}]}},
  {indicatorId:'us_dry_gas_production',today:'2026-11-13'});
 assert.equal(rows.observations.length,1);
 assert.equal(rows.observations[0].value,25);
 assert(rows.limitations.some(s=>s.includes('bridge')||s.includes('compatibility')));
});
test('Comtrade fertilizer flows are annual totals on the fixed preview host',()=>{
 const url=comtradeUrl('potash','M','842',{period:'2025'});
 assert.match(url,/comtradeapi\.un\.org\/public\/v1\/preview\/C\/A\/HS/);
 assert.match(url,/cmdCode=3104/);assert.match(url,/reporterCode=842/);assert.match(url,/period=2025/);
 assert.throws(()=>comtradeUrl('gold','M','842'),e=>e.status===400);
 assert.throws(()=>comtradeUrl('potash','Q','842'),/import/);
 assert.throws(()=>comtradeUrl('potash','M','999'),/reporter/);
 const rows=normalizeComtrade({data:[
  {period:'2025',cmdCode:'3104',partnerCode:643,partnerDesc:'Russia',tradeValue:1234567.5,netWgt:890000},
  {period:'bad',tradeValue:1},{period:'2024',tradeValue:null,netWgt:null}]},
  {commodity:'potash',flow:'M',reporter:'842'});
 assert.equal(rows.rows.length,1);
 assert.equal(rows.rows[0].period,'2025');
 assert.equal(rows.rows[0].classification,'ANNUAL_TRADE_FLOW_TOTAL');
 assert.equal(rows.rows[0].commodityGroup,'potassic fertilizers');
 assert.match(rows.rows[0].sourceUrl,/comtradeplus\.un\.org/);
 assert.match(rows.limitations.join(' '),/not shipment-level/);
 assert.throws(()=>normalizeComtrade({data:'no'},{commodity:'potash',flow:'M',reporter:'842'}),e=>e.status===502);
});

test('USDA PSD records are dated crop supply/demand estimates with explicit proxy limitation',()=>{
 const url=psdUrl('corn');
 assert.equal(url,'https://api.fas.usda.gov/api/psd/commodity/0440000');
 assert.throws(()=>psdUrl('potash'),e=>e.status===400);
 const records=normalizePsd([
  {country:'Brazil',marketYear:'2025/26',attribute:'Production',value:130,unit:'million tonnes'},
  {country:'Brazil',marketYear:'2027/28',attribute:'Production',value:140},
  {country:'Brazil',marketYear:'2025/26',attribute:'UNMAPPED',value:1},
  {country:'Brazil',marketYear:'2025/26',attribute:'Production',value:null}],
  {crop:'corn',today:'2026-11-13'});
 assert.equal(records.records.length,1);
 assert.equal(records.records[0].crop,'corn');
 assert.equal(records.records[0].classification,'CROP_SUPPLY_DEMAND_ESTIMATE');
 assert.match(records.limitations.join(' '),/demand-side proxy/);
 assert.throws(()=>normalizePsd('bad',{crop:'corn'}),e=>e.status===502);
 assert.throws(()=>usdaKey({}),e=>e.status===503);
});

test('USGS captures are transcribed, source-dated annual statistics with revision history',async t=>{
 const file=await temp(t);
 const ledger=createUsgsLedger({filename:file,clock:now});
 const input={title:'Mineral Commodity Summaries 2025 — Potash',releaseDate:'2026-01-24',
  officialUrl:'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-potash.pdf',
  statistics:[{commodity:'potash',attribute:'US production',period:'2025',value:480,unit:'thousand tonnes',
   anchor:'Table 1'}]};
 const first=await ledger.capture(input);
 assert.equal(first.added,true);
 const again=await ledger.capture(input);
 assert.equal(again.added,false);
 const revised=await ledger.capture({...input,statistics:[{commodity:'potash',attribute:'US production',
  period:'2025',value:490,unit:'thousand tonnes',anchor:'Table 1'}]});
 assert.equal(revised.changed,true);
 const list=await ledger.list('potash');
 assert.equal(list.length,1);
 assert.equal(list[0].capture.classification,'ANNUAL_TRANSCRIBED_STATISTIC_CAPTURE');
 assert.equal(list[0].capture.confirmedDisruption,false);
 assert.match(list[0].contentHash,/^[0-9a-f]{64}$/);
 const history=await ledger.history(list[0].capture.id);
 assert.equal(history.length,2);
 assert.equal(history[0].previousRevisionId,null);
 await assert.rejects(()=>ledger.capture({...input,officialUrl:'https://evil.test/potash.pdf'}),/usgs\.gov/);
 await assert.rejects(()=>ledger.capture({...input,releaseDate:'2027-01-01'}),/past calendar date/);
 await assert.rejects(()=>ledger.capture({...input,statistics:[{commodity:'potash',attribute:'Production',period:'2025',value:null,unit:'t'}]}),/numeric value/);
 const empty=await ledger.list('urea');
 assert.equal(empty.length,0);
});

test('fundamentals snapshot reports per-source status without inventing data',async t=>{
 const file=await temp(t);
 const noKeys=createCommodityFundamentals({env:{},fetchImpl:async()=>{throw new Error('offline')},
  usgsFile:file,clock:now});
 const snapshot=await noKeys.snapshot({commodity:'potash'});
 const bySource=Object.fromEntries(snapshot.sources.map(s=>[s.source,s.status]));
 assert.equal(bySource.GDELT_DOC_COMMODITY_EXPANDED,'UNAVAILABLE');
 assert.equal(bySource.EIA_API_V2,'NOT_CONFIGURED');
 assert.equal(bySource.UN_COMTRADE_PREVIEW,'UNAVAILABLE');
 assert.equal(bySource.USDA_FAS_PSD_API,'NOT_CONFIGURED');
 assert.equal(snapshot.usgs.status,'AVAILABLE');
 assert.equal(snapshot.predictiveAccuracyMeasured,false);
});

test('fundamentals API serves catalog, sources, USGS capture and rejects bad writes',async t=>{
 const file=await temp(t);
 const service=createCommodityFundamentals({env:{EIA_API_KEY:'a'.repeat(32)},
  fetchImpl:fetchOk({response:{data:[{period:'2026-09',value:'3.10',series:'RNGWHHD'}]}}),
  usgsFile:file,clock:now});
 const api=createCommodityFundamentalsApi({service});
 const {server,url,close}=await listen(async(req,res)=>{const done=await api(req,res,new URL(req.url,'http://x'));if(!done){res.writeHead(404);res.end();}});
 t.after(close);
 const get=async p=>{const r=await fetch(url+p);return {status:r.status,body:await r.json().catch(()=>({}))};};
 const catalog=await get('/api/commodity/fundamentals/catalog');
 assert.equal(catalog.status,200);
 assert.deepEqual(catalog.body.sources.length,5);
 const eia=await get('/api/commodity/fundamentals/eia');
 assert.equal(eia.status,200);
 assert.equal(eia.body.observations[0].value,3.10);
 assert.equal((await get('/api/commodity/fundamentals/gdelt?commodity=potash&extra=1')).status,400);
 assert.equal((await get('/api/commodity/fundamentals/nope')).status,404);
 const capture=await fetch(url+'/api/commodity/fundamentals/usgs',{method:'POST',
  headers:{'Content-Type':'application/json','Origin':url},
  body:JSON.stringify({title:'USGS Potash Statistics 2025',releaseDate:'2026-01-24',
   officialUrl:'https://www.usgs.gov/centers/national-minerals-information-center/potash-statistics-and-information',
   statistics:[{commodity:'potash',attribute:'World production',period:'2025',value:46000,unit:'thousand tonnes'}]})});
 assert.equal(capture.status,201);
 const stored=await get('/api/commodity/fundamentals/usgs?commodity=potash');
 assert.equal(stored.body.captures.length,1);
 assert.equal(stored.body.captures[0].capture.statistics[0].provenance,'ANALYST_TRANSCRIBED_FROM_OFFICIAL_PUBLICATION');
 const badWrite=await fetch(url+'/api/commodity/fundamentals/usgs',{method:'POST',
  headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});
 assert.equal(badWrite.status,403);
 const usda=await get('/api/commodity/fundamentals/usda?crop=wheat');
 assert.equal(usda.status,503);
 const missingKey=await get('/api/commodity/fundamentals/eia?indicator=us_dry_gas_production');
 assert.equal(missingKey.status,502);
});

test('workbench briefs include captured USGS fundamentals and explicit exposure-join status',async t=>{
 const file=await temp(t);
 const fundamentals=createCommodityFundamentals({env:{},usgsFile:file,clock:now});
 await fundamentals.usgs.capture({title:'Mineral Commodity Summaries 2025 — Potash',releaseDate:'2026-01-24',
  officialUrl:'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-potash.pdf',
  statistics:[{commodity:'potash',attribute:'US production',period:'2025',value:480,unit:'thousand tonnes'}]});
 const workbench=createCommodityWorkbench({filename:await temp(t),
  feed:createOfficialCommodityFeed({fetchImpl:fetchOk({results:[{document_number:'2026-12345',
   publication_date:'2026-10-21',title:'Potash import notice',abstract:'Trade notice.',type:'NOTICE'}]}),now}),
  fundamentals,clock:now,schedulerMs:60000});
 const scan=await workbench.scan('potash');
 const captured=scan.capture.added;
 const list=await workbench.ledger.list('potash');
 const brief=await workbench.brief(list[0].document.id);
 assert.equal(captured,1);
 assert.match(brief.report,/Captured USGS mineral statistics/);
 assert.match(brief.report,/US production \[2025\] = 480 thousand tonnes/);
 assert.match(brief.report,/Exposure join status/);
 assert.match(brief.report,/not live supply alerts/);
 assert.equal(brief.coverage.usgsCapturesReferenced,1);
 assert.equal(brief.fundamentals.length,1);
 workbench.close();
});
