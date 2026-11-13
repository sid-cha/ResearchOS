import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../server.mjs';
import {createCaseStore} from '../lib/cases.mjs';
import {createResearchApi} from '../lib/research-api.mjs';
import {researchSourcesFixture,RESEARCH_NOW} from './helpers/research-fixtures.mjs';

test('actual server shares fresh investigation state with assistant across sequential creates and edits',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'research-server-'));
 const server=createServer({caseStore:createCaseStore(join(directory,'cases.json'))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeMarketData();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/.env','/.local-data/research.json','/lib/research-store.mjs','/server.mjs'])assert.equal((await fetch(base+path)).status,404,path);
 for(const path of ['/research-workspace.js','/research.css'])assert.equal((await fetch(base+path)).status,200,path);
 assert.equal((await fetch(base+'/api/assistant/cases/CASE-missing/brief')).status,404);
 const post=async(path,body,method='POST')=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(response.ok);return response.json();};
 const first=await post('/api/cases',{symbol:'MSFT',event:{id:'research:one',headline:'Research one',source:'TradeScope Research Rules',symbols:['MSFT']}});
 let response=await fetch(base+`/api/assistant/cases/${first.id}/brief`);assert.equal(response.status,200);assert.equal((await response.json()).caseId,first.id);
 const second=await post('/api/cases',{symbol:'AAPL',event:{id:'research:two',headline:'Research two',source:'TradeScope Research Rules',symbols:['AAPL']}});
 response=await fetch(base+`/api/assistant/cases/${second.id}/brief`);assert.equal(response.status,200);assert.equal((await response.json()).symbol,'AAPL');
 await post(`/api/cases/${second.id}`,{expectedRevision:1,status:'IN_REVIEW'},'PATCH');
 const brief=await post(`/api/assistant/cases/${second.id}/ask`,{question:'Explain the case'});assert.equal(brief.status,'IN_REVIEW');
});

test('server monitoring lifecycle has one owner and closing a server leaves another scheduler usable',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'research-lifecycle-')),servers=[];
 t.after(async()=>{for(const server of servers){server.closeResearch();server.closeMarketData();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(directory,{recursive:true,force:true});});
 for(const name of ['first','second']){
  const researchApi=createResearchApi({filename:join(directory,name+'.json'),monitorFilename:join(directory,name+'-monitors.json'),sources:researchSourcesFixture(),now:()=>RESEARCH_NOW});
  const server=createServer({researchApi,caseStore:createCaseStore(join(directory,name+'-cases.json'))});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
 }
 const url=server=>`http://127.0.0.1:${server.address().port}/api/research/monitors`;
 assert.equal((await(await fetch(url(servers[0]))).json()).health.started,true);
 servers[0].closeResearch();
 const second=await(await fetch(url(servers[1]))).json();assert.equal(second.health.started,true);assert.equal(second.health.closed,false);
 const first=await(await fetch(url(servers[0]))).json();assert.equal(first.health.closed,true);
});
