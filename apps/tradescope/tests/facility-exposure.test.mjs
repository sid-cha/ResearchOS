import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
 normalizeFrs,normalizeSec,fetchFrs,fetchSec,createFacilityExposure,
 createFacilityExposureApi,buildExposureCandidates,EXPOSURE_LIMIT_KM,RELATIONSHIP_TYPES
} from '../lib/facility-exposure.mjs';
const FRS='110015778176',CIK='0000000123',SEC_FILE='https://www.sec.gov/Archives/edgar/data/123/example-filing.htm';
const t0='2026-11-15T10:00:00.000Z',t1='2026-11-15T11:00:00.000Z',t2='2026-11-15T12:00:00.000Z',t3='2026-11-15T13:00:00.000Z';
const facilityRecord=(name='Research test facility')=>({RegistryId:FRS,FacilityName:name,
 Latitude83:'38.2',Longitude83:'-120.4',LocationAddress:'1 test street',CityName:'Testville',StateAbbr:'CA',ZipCode:'90000'});
const secRecord=(name='Example SEC Filer')=>({cik:123,name,tickers:['TEST','TEST.B'],exchanges:['NYSE']});
const event=(id='USGS:eq01',at=t0,lon=-120.45,lat=38.25)=>({
 id,source:'USGS',family:'climate',type:'EARTHQUAKE',title:'M5.2 earthquake',
 firstObservedAt:at,eventTime:at,location:[lon,lat]
});
const httpResponse=(object,{mime='application/json',size=null}={})=>{
 const body=Buffer.from(JSON.stringify(object));
 return {ok:true,status:200,headers:{get:key=>key==='content-type'?mime:
  key==='content-length'?String(size??body.length):null},
  body:Readable.from([body])};
};
async function fixture(t,{maxEntries=300,enabled=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'researchos-facility-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'crosswalk.json');
 const requests=[];
 let current=t1,facilityName='Research test facility',cname='Example SEC Filer';
 const fetchImpl=async(url,config)=>{
  requests.push({url,config});
  if(url.includes('ofmpub.epa.gov'))return httpResponse({FRSFacilities:{FRSFacility:[facilityRecord(facilityName)]}});
  if(url.includes('data.sec.gov'))return httpResponse(secRecord(cname));
  throw Error('unexpected network request');
 };
 const collector={list:async()=>({events:[event(),event('USGS:future',t3,-120.44,38.24),
  event('NASA_EONET:far',t0,10,10)],isPartial:false})};
 const service=createFacilityExposure({collector,filename,enabled,maxEntries,
  fetchImpl,now:()=>current});
 return {service,filename,requests,collector,fetchImpl,setTime:v=>{current=v;},
  setFacilityName:v=>{facilityName=v;},setCompanyName:v=>{cname=v;}};
}
const link=()=>({registryId:FRS,cik:'123',relationshipType:'POTENTIAL_OPERATOR',
 evidenceUrl:SEC_FILE,rationale:'The referenced filing may identify an operating subsidiary, which remains unconfirmed.'});
test('EPA FRS normalizer accepts one exact registry record with NAD83 coordinates',()=>{
 const record=normalizeFrs({FRSFacilities:{FRSFacility:[facilityRecord()]}},FRS);
 assert.equal(record.registryId,FRS);
 assert.equal(record.facilityName,'Research test facility');
 assert.deepEqual(record.location,[-120.4,38.2]);
 assert.equal(record.coordinateDatum,'NAD83_PROVIDER_REPORTED');
 assert.equal(record.ownershipVerified,false);
 assert.throws(()=>normalizeFrs({FRSFacilities:{FRSFacility:[
  facilityRecord(),facilityRecord('Duplicate')] }},FRS),{status:502});
 assert.throws(()=>normalizeFrs({FRSFacilities:{FRSFacility:[
  {...facilityRecord(),Latitude83:'invalid'}]}},FRS),{status:502});
});
test('SEC CIK normalizer returns SEC reported issuer metadata, never inferred site ownership',()=>{
 const record=normalizeSec(secRecord(),'123');
 assert.equal(record.cik,CIK);
 assert.deepEqual(record.tickers,['TEST','TEST.B']);
 assert.equal(record.ownershipOfAnyFacilityVerified,false);
 assert.throws(()=>normalizeSec({...secRecord(),cik:777},'123'),{status:502});
 assert.throws(()=>normalizeSec({...secRecord(),name:''},'123'),{status:502});
});
test('official network adapters use fixed URLs and forbid arbitrary provider host or query parameters',async()=>{
 const requests=[];
 const fetchImpl=async(url,config)=>{requests.push({url,config});
  return url.includes('ofmpub.epa.gov')?httpResponse([facilityRecord()]):httpResponse(secRecord());};
 await fetchFrs(FRS,{fetchImpl});
 await fetchSec('123',{fetchImpl});
 assert.equal(requests.length,2);
 assert.equal(requests[0].url,'https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities?registry_id='+FRS+'&output=JSON');
 assert.equal(requests[1].url,'https://data.sec.gov/submissions/CIK'+CIK+'.json');
 assert(requests.every(x=>x.config.redirect==='error'));
 assert(requests.every(x=>x.config.method==='GET'));
 let fetched=false;
 await assert.rejects(fetchFrs('https://localhost/private',{fetchImpl:async()=>{fetched=true;return httpResponse([]);}}),{status:400});
 assert.equal(fetched,false);
});
test('source adapter rejects oversized, corrupt, non-JSON, and unsuccessfully streamed responses',async()=>{
 await assert.rejects(fetchFrs(FRS,{fetchImpl:async()=>httpResponse([facilityRecord()],{size:10000000})}),{status:413});
 await assert.rejects(fetchSec('123',{fetchImpl:async()=>httpResponse(secRecord(),{mime:'text/html'})}),{status:502});
 await assert.rejects(fetchFrs(FRS,{fetchImpl:async()=>({ok:false,headers:{get:()=>null},body:null})}),{status:503});
});
test('captures both independent official identity records and stores only unverified company relation',async t=>{
 const h=await fixture(t);
 const f=await h.service.captureFacility({registryId:FRS});
 assert.equal(f.record.type,'FACILITY');
 assert.equal(f.record.capturedAt,t1);
 assert.equal(f.record.value.bodySha256.length,64);
 assert.equal((await h.service.captureFacility({registryId:FRS})).deduplicated,true);
 h.setTime(t2);
 const c=await h.service.captureCompany({cik:'123'});
 assert.equal(c.record.type,'COMPANY');
 assert.equal(c.record.value.cik,CIK);
 assert.equal((await h.service.captureCompany({cik:'123'})).deduplicated,true);
 h.setTime(t3);
 const saved=await h.service.linkCompany(link());
 assert.equal(saved.record.value.status,'HUMAN_CLAIM_UNVERIFIED');
 assert.equal(saved.record.value.ownershipVerified,false);
 assert.equal((await h.service.linkCompany(link())).deduplicated,true);
 const view=await h.service.view({});
 assert.equal(view.facilities.length,1);
 assert.equal(view.companies.length,1);
 assert.equal(view.relationships.length,1);
 assert.equal(view.candidates[0].links.length,1);
 assert.equal(view.candidates[0].links[0].ownershipVerified,false);
 assert.equal(view.candidates[0].siteDamageVerified,false);
 assert.equal(view.verifiedOwnershipCount,0);
 assert.equal(view.measuredEconomicImpact,null);
 assert.equal(h.requests.length,4,'no network calls during relationship or view');
});
test('source capture as-of clocks prevent historical ownership relationships leaking backward',async t=>{
 const h=await fixture(t);
 await h.service.captureFacility({registryId:FRS});
 h.setTime(t2);await h.service.captureCompany({cik:'123'});
 h.setTime(t3);await h.service.linkCompany(link());
 const before=await h.service.view({asOf:t0});
 assert.equal(before.facilities.length,0);
 assert.equal(before.candidates.length,0);
 const afterFacility=await h.service.view({asOf:t1});
 assert.equal(afterFacility.candidates.length,1);
 assert.equal(afterFacility.candidates[0].links.length,0);
 const afterLink=await h.service.view({asOf:t3,eventId:'USGS:eq01'});
 assert.equal(afterLink.candidates.length,1);
 assert.equal(afterLink.candidates[0].links.length,1);
 assert(!afterLink.candidates.some(c=>c.eventId==='USGS:future'),
  'events first locally captured after cutoff cannot enter historical candidate set');
 await assert.rejects(h.service.view({asOf:'2026-11-15T19:00:00.000Z'}),{status:400});
});
test('spatial engine handles near, far, unlocated events and explicit Anti-Agent objections',()=>{
 const facilities=[{registryId:FRS,facilityName:'Test',capturedAt:t1,location:[-120.4,38.2]}];
 const companies=[{cik:CIK,companyName:'SEC Filer',tickers:['TEST'],capturedAt:t2}];
 const relations=[{registryId:FRS,cik:CIK,capturedAt:t3,relationshipType:'POTENTIAL_OWNER',evidenceUrl:SEC_FILE}];
 const events=[event('USGS:near',t0),event('USGS:far',t0,-20,30),
  {...event('FAA_NAS_STATUS:missing',t0),location:null},event('USGS:future',t3)];
 const rows=buildExposureCandidates({facilities,companies,relationships:relations,events,asOf:t2});
 assert.equal(rows.length,1);
 assert(rows[0].distanceKm<15);
 assert.equal(rows[0].links.length,0);
 assert(rows[0].antiAgentFlags.includes('EPA_REGISTRY_NAME_DOES_NOT_PROVE_PUBLIC_ISSUER_OWNERSHIP'));
 assert(rows[0].antiAgentFlags.includes('NO_MATERIALITY_OR_SUPPLY_CHAIN_FLOW_PROOF'));
 assert.equal(buildExposureCandidates({facilities,companies,relationships:relations,events,asOf:t3}).length,2);
 assert.equal(EXPOSURE_LIMIT_KM,250);
});
test('relationship cannot be written before both official source identities; SEC proof link allowlisted',async t=>{
 const h=await fixture(t);
 await assert.rejects(h.service.linkCompany(link()),{status:409});
 await h.service.captureFacility({registryId:FRS});
 await assert.rejects(h.service.linkCompany(link()),{status:409});
 h.setTime(t2);await h.service.captureCompany({cik:'123'});
 await assert.rejects(h.service.linkCompany({...link(),evidenceUrl:'https://evil.example.com/paper'}),{status:400});
 await assert.rejects(h.service.linkCompany({...link(),rationale:'buy stocks'}),{status:400});
 await assert.rejects(h.service.linkCompany({...link(),relationshipType:'CERTIFIED_OWNER'}),{status:400});
 assert.equal(RELATIONSHIP_TYPES.length,4);
});
test('journal survives restart, source metadata revision and fails closed on tampering',async t=>{
 const h=await fixture(t);
 await h.service.captureFacility({registryId:FRS});
 h.setFacilityName('Updated source facility');
 h.setTime(t2);const revised=await h.service.captureFacility({registryId:FRS});
 assert.equal(revised.deduplicated,false);
 const v=await h.service.view({asOf:t2});
 assert.equal(v.facilities[0].facilityName,'Updated source facility');
 await h.service.close();
 const reopened=createFacilityExposure({collector:h.collector,filename:h.filename,
  fetchImpl:h.fetchImpl,now:()=>t3});
 assert.equal((await reopened.view({asOf:t2})).facilities[0].facilityName,'Updated source facility');
 await reopened.close();
 await writeFile(h.filename,(await readFile(h.filename,'utf8')).replace('Updated source facility','Tampered without digest'));
 const broken=createFacilityExposure({collector:h.collector,filename:h.filename,now:()=>t3});
 await assert.rejects(broken.view({asOf:t2}),{status:500});
});
test('private crosswalk access and provider requests disabled on nonloopback deployment',async t=>{
 const h=await fixture(t,{enabled:false});
 assert.equal(h.service.catalog().enabled,false);
 await assert.rejects(h.service.view(),{status:403});
 await assert.rejects(h.service.captureFacility({registryId:FRS}),{status:403});
 assert.equal(h.requests.length,0);
});
test('API rejects extra fields, cross-site POST and invalid filters and supports read-only candidate retrieval',async t=>{
 const h=await fixture(t);
 const handler=createFacilityExposureApi({service:h.service,host:'127.0.0.1'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/facility-exposure/';
 assert.equal((await fetch(url+'catalog')).status,200);
 assert.equal((await fetch(url+'view')).status,200);
 assert.equal((await fetch(url+'view?radiusKm=1000')).status,400);
 assert.equal((await fetch(url+'view?eventId=../../.env')).status,400);
 const payload=JSON.stringify({registryId:FRS});
 assert.equal((await fetch(url+'facility',{method:'POST',
  headers:{'Content-Type':'application/json'},body:payload})).status,403);
 assert.equal((await fetch(url+'facility',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Facility-Research':'1',
   Origin:'https://attacker.example'},body:payload})).status,403);
 assert.equal((await fetch(url+'facility',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Facility-Research':'1'},
  body:JSON.stringify({registryId:FRS,host:'localhost'})})).status,400);
 const good=await fetch(url+'facility',{method:'POST',
  headers:{'Content-Type':'application/json','X-ResearchOS-Facility-Research':'1'},
  body:payload});
 assert.equal(good.status,200);
 assert.equal((await good.json()).record.value.ownershipVerified,false);
});
test('v0.37 UI, public allowlist and L1/L2/L3 navigation are connected to one facility workspace',async()=>{
 const read=async file=>readFile(new URL('../'+file,import.meta.url),'utf8');
 const [html,js,server,nav,build]=await Promise.all([
  read('facility-exposure.html'),read('facility-exposure.js'),read('server.mjs'),
  read('hierarchy-navigation.js'),read('scripts/build-static.mjs')]);
 for(const id of ['facilityForm','companyForm','relationshipForm','event-matches',
  'candidateResults','facilityAsOf','anti-exposure'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes('/api/facility-exposure/'));
 assert(server.includes("if(await handleFacilityExposure(req,res,u))return;"));
 assert(nav.includes("href:'/facility-exposure.html'"));
 assert(build.includes("'facility-exposure.js'"));
 assert(!html.includes('APCA_API_SECRET_KEY'));
});
