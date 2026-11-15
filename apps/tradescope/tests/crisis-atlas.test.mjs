import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createCrisisAtlas,createCrisisAtlasApi} from '../lib/crisis-atlas.mjs';
test('historical case studies and climate scenarios retain sourced candidates without fake risk scores',()=>{
 const atlas=createCrisisAtlas(),catalog=atlas.list();
 assert.equal(catalog.cases.length,5);assert(catalog.pathways.length>=5);
 assert.equal(catalog.coverage.calibratedPredictions,false);
 assert.equal(catalog.coverage.historicalVintagesReconstructed,false);
 for(const item of catalog.cases){
  const detailed=atlas.detail(item.id);
  assert.equal(detailed.case.id,item.id);
  assert.equal(detailed.evidenceStatus,'SOURCE_REFERENCES_ONLY_NOT_RECONSTRUCTED_POINT_IN_TIME');
  assert(detailed.pathways.length>=1);
  assert(detailed.sources.length>=1);
  assert(detailed.sources.every(x=>x.url.startsWith('https://')));
  assert(detailed.case.candidateSignals.every(x=>x.sourceIds.length>0));
  assert(!JSON.stringify(detailed).includes('probabilityPercent'));
 }
 const covid=atlas.detail('covid-2020');
 assert.match(covid.case.caveats.join(' '),/AFTER this reference selloff date/);
 const fert=atlas.detail('enso-fertilizer');
 assert(fert.pathways.some(p=>p.nodes.includes('Crop acreage and yield forecasts')));
 assert.match(fert.case.caveats.join(' '),/imports/);
 assert.equal(atlas.detail('unrecognized'),null);
});
test('catalog is defensive against consumer mutations',()=>{
 const atlas=createCrisisAtlas();const a=atlas.detail('financial-2008');
 a.case.title='USER_MUTATION';a.sources[0].name='USER_MUTATION';
 assert.notEqual(atlas.detail('financial-2008').case.title,'USER_MUTATION');
 assert.notEqual(atlas.detail('financial-2008').sources[0].name,'USER_MUTATION');
});
test('read-only crisis API routes serve cases and reject mutations and unknown entries',async t=>{
 const api=createCrisisAtlasApi();
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url,'http://localhost')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const base='http://127.0.0.1:'+server.address().port;
 const catalog=await fetch(base+'/api/crisis/catalog');assert.equal(catalog.status,200);
 assert.equal((await catalog.json()).cases.length,5);
 const result=await fetch(base+'/api/crisis/case?id=wildfire-insurance');assert.equal(result.status,200);
 assert((await result.json()).pathways.some(p=>p.id==='wildfire-insurance'));
 assert.equal((await fetch(base+'/api/crisis/case?id=unknown')).status,404);
 assert.equal((await fetch(base+'/api/crisis/catalog',{method:'POST'})).status,405);
});
