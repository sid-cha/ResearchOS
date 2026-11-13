import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {frsLookupUrl,normalizeFrsRecord,createEpaFrsLookup,adversarialFacilityReview,
 createFacilityVerificationApi} from '../lib/epa-frs.mjs';

const now=()=>new Date('2026-11-13T20:00:00Z');
const id='110000538525';
const frsRow=()=>({RegistryId:id,FacilityName:'Illustrative EPA-linked facility',
 LocationAddress:'Example Road',CityName:'Exampletown',StateAbbr:'PA',ZipCode:'12345',
 Latitude83:'40.659509',Longitude83:'-79.337818',
 ProgramFacilities:{ProgramFacility:[
  {ProgramSystemAcronym:'EIA-860',ProgramSystemId:'3136',ProgramFacilityName:'Illustrative power plant'}]}});
const epa=()=>({FRSFacilities:{FRSFacility:[frsRow()]}});
const asset=()=>({id:'asset-local-001',symbol:'MOS',cik:'0001285785',
 assetName:'Illustrative EPA-linked facility',latitude:40.6595,longitude:-79.3378,
 issuerFilingDate:'2026-02-25',geoEvidenceDate:'2026-02-21',
 issuerExcerpt:'A testing fixture only: legal ownership is deliberately not verified.'});
const fetchData=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});

test('FRS lookup constructs only official fixed HTTPS endpoint and exact government registry ID',()=>{
 const url=frsLookupUrl(id);
 assert.equal(url.origin,'https://ofmpub.epa.gov');
 assert.equal(url.pathname,'/frs_public2/frs_rest_services.get_facilities');
 assert.equal(url.searchParams.get('registry_id'),id);
 assert.equal(url.searchParams.get('program_output'),'yes');
 assert.equal(url.searchParams.get('output'),'JSON');
 assert.throws(()=>frsLookupUrl('https://evil.invalid/path'),e=>e.status===400);
 assert.throws(()=>frsLookupUrl('11001234&output=XML'),e=>e.status===400);
 assert.throws(()=>frsLookupUrl('1234'),e=>e.status===400);
});
test('official facility identity includes normalized NAD83 coordinates but never public issuer CIK owner',()=>{
 const r=normalizeFrsRecord(epa(),{registryId:id,fetchedAt:'2026-11-13T19:00:00Z'});
 assert.equal(r.status,'FOUND');
 assert.equal(r.record.registryId,id);
 assert.equal(r.record.facilityName,'Illustrative EPA-linked facility');
 assert.equal(r.record.latitude,40.659509);
 assert.equal(r.record.longitude,-79.337818);
 assert.equal(r.record.horizontalDatum,'NAD83');
 assert.equal(r.record.programLinks.length,1);
 assert.equal(r.record.programLinks[0].system,'EIA-860');
 assert.equal(r.record.publicCompanyCikVerified,false);
 assert.equal(r.record.currentOwnerVerified,false);
 assert.equal(r.record.facilityOperatingVerified,false);
 assert.equal(r.recordHash.length,64);
 assert.equal(r.originalPublicationClockVerified,false);
 assert.equal(r.historicalAsOfEligible,false);
 assert(!JSON.stringify(r).includes('EIA_API_KEY'));
});
test('FRS public API wrapper variants and missing coordinates remain explicit source states',()=>{
 const direct=normalizeFrsRecord({FRSFacility:frsRow()},{registryId:id});
 assert.equal(direct.status,'FOUND');
 const empty=normalizeFrsRecord({FRSFacilities:{FRSFacility:[]}},{registryId:id});
 assert.equal(empty.status,'NO_MATCH');
 const missing=normalizeFrsRecord({FRSFacility:{...frsRow(),Latitude83:null,Longitude83:null}},{registryId:id});
 assert.equal(missing.record.coordinateStatus,'UNAVAILABLE');
 assert.equal(missing.record.latitude,null);
 assert.equal(missing.record.longitude,null);
});
test('FRS response rejects mismatched schema, duplicates and injection-like field values',()=>{
 assert.throws(()=>normalizeFrsRecord({foo:'bar'},{registryId:id}),e=>e.status===502);
 assert.throws(()=>normalizeFrsRecord({FRSFacility:[frsRow(),frsRow()]},{registryId:id}),e=>e.status===502);
 assert.throws(()=>normalizeFrsRecord({FRSFacility:{...frsRow(),FacilityName:'<script>'}},{registryId:id}),e=>e.status===502);
 assert.throws(()=>normalizeFrsRecord({FRSFacility:[...Array(16)].map(()=>frsRow())},{registryId:id}),e=>e.status===502);
});
test('official EPA lookup uses bounded server-only JSON request, caching and no user-controlled hostname',async()=>{
 let calls=0,seen;
 const lookup=createEpaFrsLookup({now,fetchImpl:async(u,options)=>{calls++;seen={u,options};return fetchData(epa());}});
 const result=await lookup.lookup(id);
 assert.equal(result.record.latitude,40.659509);
 assert.equal(calls,1);
 assert.equal(seen.u.hostname,'ofmpub.epa.gov');
 assert.equal(seen.options.redirect,'error');
 await lookup.lookup(id);assert.equal(calls,1);
 assert.equal(lookup.catalog().keyRequired,false);
 assert.equal(lookup.catalog().historicalAsOfEligible,false);
 await assert.rejects(lookup.lookup('evil.invalid'),e=>e.status===400);
});
test('EPA outage, malformed JSON and unsupported MIME never masquerade as matched source evidence',async()=>{
 const outage=createEpaFrsLookup({fetchImpl:async()=>new Response('down',{status:503})});
 await assert.rejects(outage.lookup(id),e=>e.status===502);
 const invalid=createEpaFrsLookup({fetchImpl:async()=>new Response('<html>',{status:200,
  headers:{'content-type':'text/html'}})});
 await assert.rejects(invalid.lookup(id),e=>e.status===502);
 const malformed=createEpaFrsLookup({fetchImpl:async()=>new Response('{bad',{status:200,
  headers:{'content-type':'application/json'}})});
 await assert.rejects(malformed.lookup(id),e=>e.status===502);
});
test('deterministic critic questions issuer ownership even when official EPA point matches local coordinate',()=>{
 const report=adversarialFacilityReview({asset:asset(),frs:normalizeFrsRecord(epa(),{registryId:id})});
 assert.equal(report.officialFacilityIdentityObserved,true);
 assert.equal(report.locationStatus,'OFFICIAL_SITE_COORDINATE_CONSISTENT');
 assert(report.distanceKm<1);
 assert.equal(report.verifiedSecOperatorLink,false);
 assert.equal(report.verifiedHistoricalExposure,false);
 assert.equal(report.estimatedLoss,null);
 assert.equal(report.causalAttribution,null);
 assert.equal(report.critic.mode,'DETERMINISTIC_EVIDENCE_CHALLENGER_NOT_AI_AGENT');
 assert(report.critic.challenges.some(x=>x.id==='ISSUER_OPERATOR_NOT_PROVEN'));
 assert(report.critic.challenges.some(x=>x.id==='HISTORICAL_FIRST_AVAILABLE_UNKNOWN'));
 assert(report.critic.challenges.every(x=>x.disposition==='OPEN'));
});
test('critic surfaces facility coordinate conflict, alternative name, unobserved identity and time leakage',()=>{
 const moved=asset();moved.latitude=40.75;moved.longitude=-80.11;moved.assetName='Different plant label';
 const report=adversarialFacilityReview({asset:moved,frs:normalizeFrsRecord(epa(),{registryId:id}),asOf:'2020-01-01'});
 assert.equal(report.locationStatus,'OFFICIAL_SITE_COORDINATE_CONFLICT');
 assert(report.critic.challenges.some(x=>x.id==='SITE_COORDINATE_CONFLICT'));
 assert(report.critic.challenges.some(x=>x.id==='FACILITY_NAME_VARIANT'));
 assert(report.critic.challenges.some(x=>x.id==='SOURCE_DATE_AFTER_AS_OF'));
 assert(report.critic.critical>=3);
 const missing=adversarialFacilityReview({asset:asset(),frs:normalizeFrsRecord({FRSFacility:[]},{registryId:id})});
 assert.equal(missing.locationStatus,'EPA_REGISTRY_ID_NOT_RESOLVED');
 assert(missing.critic.challenges.some(x=>x.id==='EPA_ID_NOT_FOUND'));
});
test('FRS HTTP routes are GET-only, bounded and never accept user-provided issuer result or external URL',async t=>{
 const lookup=createEpaFrsLookup({now,fetchImpl:async()=>fetchData(epa())});
 const assets=async()=>({assets:[asset()]});
 const handler=createFacilityVerificationApi({lookup,assets});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const root='http://127.0.0.1:'+server.address().port+'/api/facility-verification/';
 assert.equal((await fetch(root+'catalog')).status,200);
 const official=await (await fetch(root+'lookup?registryId='+id)).json();
 assert.equal(official.record.registryId,id);
 assert.equal((await fetch(root+'lookup?registryId='+id+'&url=https://evil.invalid')).status,404);
 assert.equal((await fetch(root+'lookup?registryId=foobar')).status,400);
 assert.equal((await fetch(root+'lookup?registryId='+id,{method:'POST'})).status,405);
 assert.equal((await fetch(root+'challenge?registryId='+id+'&assetId=unknown')).status,404);
 const reviewed=await (await fetch(root+'challenge?registryId='+id+'&assetId=asset-local-001')).json();
 assert.equal(reviewed.verifiedSecOperatorLink,false);
 assert.equal(reviewed.critic.mode,'DETERMINISTIC_EVIDENCE_CHALLENGER_NOT_AI_AGENT');
 assert.equal((await fetch(root+'challenge?registryId='+id+'&assetId=asset-local-001&asOf=2020-01-01')).status,200);
 assert.equal((await fetch(root+'challenge?registryId='+id+'&assetId=asset-local-001&assetId=other')).status,404);
});
test('Geo Exposure UI includes EPA source inspector and source-critic interactions, with no direct provider secret',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const [html,js,css]=await Promise.all(['geo-exposure.html','geo-exposure.js','geo-exposure.css']
  .map(x=>fs.readFile(path.join(root,x),'utf8')));
 for(const x of ['frsId','lookupFrs','frsResult','reviewAsset','reviewAsOf','challengeClaim','challenges'])
  assert(html.includes('id="'+x+'"'));
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'geo-exposure.js'}));
 assert(js.includes('/api/facility-verification/'));
 assert(!js.includes('ofmpub.epa.gov/frs_public2'));
 assert(css.includes('.challenge-list'));
});
