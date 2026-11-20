import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createCaseStore} from '../lib/cases.mjs';
import {buildBrief,interpretQuestion,askModel} from '../lib/assistant.mjs';
import {createAssistantApi} from '../lib/assistant-api.mjs';
const fixture={symbol:'NVDA',event:{id:'news:example',source:'ALPACA_NEWS',headline:'Illustrative corporate release',category:'CORPORATE',type:'NEWS',publishedAt:'2026-11-02T16:00:00Z',sourceUrl:'https://example.org/story',symbols:['NVDA'],summary:'Reported news, not proof of market impact.'},context:{technical:{close:190,rsi14:56,volumeRatio20:1.8},technicalSource:'ALPACA_IEX',fundamentals:{quarterly:{revenue:{value:1e9,yoyPct:18.2,periodEnd:'2026-09-30'}}},study:{study:{horizons:[{status:'observed',sessions:1,relativeReturnPct:-1.2}]}}}};
test('evidence brief draws exclusively from source-linked case context and does not infer causation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-assist-'));try{const store=createCaseStore(join(dir,'cases.json'));const c=await store.create(fixture);const r=buildBrief(c);assert.equal(r.symbol,'NVDA');assert.equal(r.synthetic,false);assert.equal(r.refs[0].url,'https://example.org/story');assert(r.observations.some(x=>x.text.includes('190.00')));assert(r.observations.some(x=>x.text.includes('18.2%')));assert(r.observations.some(x=>x.text.includes('-1.20')));assert.match(r.notice,/causality/);assert(!JSON.stringify(r).includes('BUY'));const synthetic=await store.create({...fixture,event:{...fixture.event,id:'hypo:a',synthetic:true,sourceUrl:null}});const b=buildBrief(synthetic,'gaps');assert.equal(b.synthetic,true);assert(b.observations.some(x=>x.type==='gap'));assert(!b.refs.some(x=>x.url===undefined));}finally{await rm(dir,{recursive:true,force:true})}
});
test('assistant focus interprets the request but does not invent market values',()=>{assert.equal(interpretQuestion('show earnings and RSI'),'market');assert.equal(interpretQuestion('what sources are available'),'sources');assert.equal(interpretQuestion('what is missing'),'gaps');assert.equal(interpretQuestion('explain this case'),'overview');});
test('assistant GET and POST are scoped to an existing saved case',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tradescope-assist-http-'));t.after(()=>rm(dir,{recursive:true,force:true}));const filename=join(dir,'cases.json');const c=await createCaseStore(filename).create(fixture);const handle=createAssistantApi({filename,env:{}});
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');if(!await handle(req,res,u)){res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;let r=await fetch(`${base}/api/assistant/cases/${c.id}/brief?focus=market`);assert.equal(r.status,200);let body=await r.json();assert.equal(body.mode,'EVIDENCE_ENGINE');assert.equal(body.focus,'market');
 r=await fetch(`${base}/api/assistant/cases/${c.id}/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'What is missing evidence?'})});body=await r.json();assert.equal(r.status,200);assert.equal(body.focus,'gaps');assert.equal(body.answer,null);
 r=await fetch(`${base}/api/assistant/cases/${c.id}/brief?focus=unverified`);assert.equal(r.status,400);
 r=await fetch(`${base}/api/assistant/cases/not-a-case/brief`);assert.equal(r.status,404);
});
test('optional model request remains server-side and uses only the evidence brief',async()=>{
 const brief={heading:'Case',observations:[{text:'Sample'}],synthetic:true};let called=0;
 const result=await askModel({brief,question:'What evidence is missing?',env:{OPENAI_API_KEY:'PLACEHOLDER_TEST_ONLY',OPENAI_MODEL:'gpt-6-luna'},fetchImpl:async(url,req)=>{called++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(req.headers.Authorization,'Bearer PLACEHOLDER_TEST_ONLY');const d=JSON.parse(req.body);assert.equal(d.store,false);assert(!JSON.stringify(d).includes('APCA_API'));return {ok:true,json:async()=>({model:'gpt-6-luna',output:[{type:'message',content:[{type:'output_text',text:'Missing independent evidence.'}]}]})};}});
 assert.equal(called,1);assert.equal(result.text,'Missing independent evidence.');
});
test('theme shell includes user-facing switches and both source-aware research surfaces',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8');for(const id of ['themeToggle','densityToggle','assistPanel','assistAskForm','caseWorkspace','eventIntel'])assert(html.includes(`id="${id}"`));const css=await readFile(new URL('../terminal-theme.css',import.meta.url),'utf8');assert(css.includes('[data-theme=light]'));assert(css.includes('[data-theme=dark]'));});
