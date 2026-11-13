import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createResearchApi} from '../lib/research-api.mjs';
import {createResearchStore} from '../lib/research-store.mjs';
import {RESEARCH_NOW,researchSourcesFixture,fixtureFiling} from './helpers/research-fixtures.mjs';

async function harness(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'research-api-')),filename=join(directory,'research.json');
 const handler=createResearchApi({filename,sources:researchSourcesFixture(),now:()=>RESEARCH_NOW,...options});
 const server=http.createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,headers={})=>{const response=await fetch(base+'/api/research/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 return {request,base,filename};
}

test('research catalog and company combine real-shaped metrics with readiness and no provider payloads',async t=>{
 const h=await harness(t);const catalog=await h.request('catalog');assert.equal(catalog.status,200);assert.equal(catalog.body.instruments.length,10);assert(catalog.body.definitions.length>=60);
 const company=await h.request('company?symbol=MSFT');assert.equal(company.status,200);assert.equal(company.body.company,'Research Fixture Inc.');
 const metric=id=>company.body.observations.find(item=>item.id===id);
 assert.equal(metric('technical.sma200').status,'available');assert.equal(metric('financial.revenueGrowthYoYPct').value,20);
 assert.equal(metric('financial.currentRatio').value,2);assert.equal(metric('valuation.forwardPE').status,'unsupported');
 assert.equal(company.body.series.length,260);assert.equal(company.body.facts,undefined);assert.equal(company.body.errors.length,0);
 assert.equal((await h.request('company?symbol=NOT_REAL')).status,400);
});

test('missing provider credentials yield explicit unavailable metrics and sanitized partial errors',async t=>{
 const h=await harness(t,{sources:{...researchSourcesFixture(),async researchBars(){throw Object.assign(new Error('secret-bearing provider error'),{status:503});},async companyFacts(){throw Object.assign(new Error('private SEC input'),{status:503});}}});
 const response=await h.request('company?symbol=AAPL');assert.equal(response.status,200);assert.equal(response.body.errors.length,2);assert.equal(response.body.quality.partial,true);
 assert(!response.body.observations.some(metric=>metric.status==='available'));assert(!JSON.stringify(response.body).includes('secret-bearing'));assert(!JSON.stringify(response.body).includes('private SEC input'));
});

test('screen save/run/delete and alert evaluation/acknowledgement survive store reopening',async t=>{
 const h=await harness(t);
 const screen={name:'Positive trend',match:'all',conditions:[{metricId:'price.close',operator:'gt',otherMetricId:'technical.sma200'}]};
 let response=await h.request('screens','POST',screen);assert.equal(response.status,201);const saved=response.body;assert.equal(saved.revision,1);
 response=await h.request('screen','POST',{symbols:['MSFT'],screen:saved});assert.equal(response.status,200);assert.equal(response.body.results[0].match,true);
 response=await h.request('evaluate','POST',{symbol:'MSFT'});assert.equal(response.status,200);assert(response.body.evaluations.some(item=>item.status==='triggered'));assert(response.body.alerts.length>0);
 const alert=response.body.alerts[0];response=await h.request('alerts/'+alert.id,'PATCH',{expectedRevision:alert.revision,status:'acknowledged'});assert.equal(response.status,200);assert.equal(response.body.alert.status,'acknowledged');
 const reopened=createResearchStore(h.filename);assert.equal((await reopened.getScreen(saved.id)).name,screen.name);assert.equal((await reopened.getAlert(alert.id)).status,'acknowledged');
 const disk=await readFile(h.filename,'utf8');assert(!disk.includes('"bars"'));assert(!disk.includes('APCA_API'));
 response=await h.request('screens/'+saved.id,'DELETE',{expectedRevision:9});assert.equal(response.status,409);
 response=await h.request('screens/'+saved.id,'DELETE',{expectedRevision:1});assert.equal(response.status,200);
});

test('research API rejects cross-origin writes, unknown metrics, unsafe symbols and unsupported JSON',async t=>{
 const h=await harness(t),screen={name:'Bad',conditions:[{metricId:'unknown.metric',operator:'gt',value:1}]};
 assert.equal((await h.request('screens','POST',screen)).status,400);
 assert.equal((await h.request('evaluate','POST',{symbol:'MSFT'},{Origin:'https://external.example'})).status,403);
 assert.equal((await h.request('screen','POST',{symbols:['AAPL','EVIL'],screen:{name:'x',conditions:[{metricId:'price.close',operator:'gt',value:0}]}})).status,400);
 const response=await fetch(h.base+'/api/research/screens',{method:'POST',body:'{}'});assert.equal(response.status,415);
});

test('filing API selects the accession from the issuer list before reading content; earthquake methods remain bounded',async t=>{
 let reads=0;const h=await harness(t,{filingReader:{async read({filing,symbol}){reads++;return {filing,symbol,items:[],evidence:[],summary:[],limitations:['No supported passage']};}},earthquakes:{async recentEvents(){return {events:[],limitations:['Fixture only']};},async findAnalogues({eventId,limit}){assert.equal(limit,5);return {event:{id:eventId},matches:[],limitations:['No comparable fixtures']};}}});
 assert.equal((await h.request('filing?symbol=MSFT&accession=0001193125-26-448358')).status,404);assert.equal(reads,0);
 const response=await h.request('filing?symbol=MSFT&accession='+fixtureFiling.accession);assert.equal(response.status,200);assert.equal(reads,1);
 assert.equal((await h.request('earthquakes')).body.events.length,0);assert.equal((await h.request('analogues?eventId=usgs-fixture')).body.matches.length,0);
 assert.equal((await h.request('event-outcomes?symbol=MSFT&eventTime=2099-01-01T00:00:00Z')).status,400);
});

test('custom crossover screen receives the prior completed-session observation',async t=>{
 const h=await harness(t);
 const response=await h.request('screen','POST',{symbols:['MSFT'],screen:{name:'Price crossover',conditions:[{metricId:'price.close',operator:'crosses_above',value:131.85}]}});
 assert.equal(response.status,200);assert.equal(response.body.results[0].match,true);
 const evidence=response.body.results[0].evidence[0];assert.equal(evidence.previousValue,131.8);assert.equal(evidence.value,131.9);
});

test('concurrent company requests share work and cap provider company jobs at two',async t=>{
 const sources=researchSourcesFixture();let active=0,maximum=0,calls=0;
 const h=await harness(t,{sources:{...sources,async researchBars(symbol){
  calls++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,15));
  active--;return sources.researchBars(symbol);
 }}});
 const paths=['AAPL','AAPL','AAPL','MSFT','NVDA','TSLA'].map(symbol=>h.request('company?symbol='+symbol));
 const responses=await Promise.all(paths);assert(responses.every(result=>result.status===200));
 assert.equal(calls,4);assert.equal(maximum,2);
});

test('filing, event and outcome failures never return upstream exception text',async t=>{
 const reject=async()=>{throw Object.assign(new Error('FIXTURE_PRIVATE_UPSTREAM_TEXT'),{status:502});};
 const h=await harness(t,{sources:{...researchSourcesFixture(),filings:reject,researchBars:reject},earthquakes:{recentEvents:reject,findAnalogues:reject}});
 for(const path of ['filing?symbol=MSFT&accession='+fixtureFiling.accession,'earthquakes','analogues?eventId=usgs:fixture','event-outcomes?symbol=MSFT&eventTime=2026-09-01T13:00:00Z']){
  const response=await h.request(path);assert.equal(response.status,502);assert(!JSON.stringify(response.body).includes('FIXTURE_PRIVATE'));
 }
});
