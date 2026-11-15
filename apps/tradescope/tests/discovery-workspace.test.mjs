import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=await readFile(new URL('../discovery-workspace.js',import.meta.url),'utf8');
const ACCESSION='0001193125-26-448357',REV='REV-11111111-1111-4111-8111-111111111111';
const URL_SEC='https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/filing.htm';
const stock={symbol:'EXM',name:'Example Corporation',identitySource:'SEC_COMPANY_TICKERS_EXCHANGE'};
const filings=[{symbol:'EXM',accession:ACCESSION,form:'8-K',filingDate:'2026-11-12',sourceUrl:URL_SEC}];
const events=[{id:'sec:'+ACCESSION,firstObservedAt:'2026-11-12T22:00:00Z',revisionCount:1,latestRevisionId:REV,
 latest:{knowledgeStatus:'captured_observation',event:{headline:'Example filing',form:'8-K'}}}];
class Elem{
 constructor(id=''){this.id=id;this.value='';this.disabled=false;this.className='';this.handlers=new Map();this.dataset={};this.textContent='';this._html='';this.children=new Map();}
 set innerHTML(v){this._html=String(v);this.children.clear();}get innerHTML(){return this._html;}
 addEventListener(kind,cb){const a=this.handlers.get(kind)||[];a.push(cb);this.handlers.set(kind,a);}
 async fire(kind,event={}){const actions=[...(this.handlers.get(kind)||[])];for(const fn of actions)await fn({target:this,key:event.key,preventDefault(){},...event});}
 click(){return this.fire('click');}
 querySelectorAll(selector){let cached=this.children.get(selector);if(cached)return cached;
  const attribute=selector.match(/^\[data-([a-z-]+)\]$/)?.[1];if(!attribute)return [];
  const regex=new RegExp('data-'+attribute+'="([^"]+)"','g'),children=[];let result;
  while((result=regex.exec(this.innerHTML))){const n=new Elem();const start=this.innerHTML.lastIndexOf('<button',result.index);const end=this.innerHTML.indexOf('>',result.index);const markup=this.innerHTML.slice(Math.max(0,start),end);for(const attr of markup.matchAll(/data-([a-z-]+)="([^"]+)"/g)){n.dataset[attr[1].replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=attr[2];}children.push(n);}
  this.children.set(selector,children);return children;
 }
}
function harness(){
 const nodes=new Map(),listeners=new Map(),requests=[];let registered=[],watchlist=null,opened=null,captured=false;
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Elem(id));return nodes.get(id);};
 const document={getElementById:el,addEventListener:(event,fn)=>{const a=listeners.get(event)||[];a.push(fn);listeners.set(event,a);},
  querySelector:()=>({click(){}})};
 const fetch=async(url,opts={})=>{const path=String(url),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;requests.push({path,method,body});let data={},status=200;
  if(path.startsWith('/api/discovery/search'))data={results:[stock]};
  else if(path==='/api/discovery/instruments')data={instruments:registered};
  else if(path==='/api/discovery/watchlists')data={watchlists:watchlist?[watchlist]:[]};
  else if(path==='/api/discovery/register'){registered=[{...stock,instrumentId:'US_EQUITY:EXM'}];data={instrument:registered[0]};status=201;}
  else if(path==='/api/discovery/watchlist'&&method==='POST'){watchlist={id:'WATCHLIST-11111111-1111-4111-8111-111111111111',revision:1,...body};data={watchlist};status=201;}
  else if(path.startsWith('/api/discovery/filings'))data={filings};
  else if(path.startsWith('/api/discovery/fundamentals'))data={annual:{revenue:{value:1000},netIncome:{value:80}},ratios:{annualNetMarginPct:8}};
  else if(path.startsWith('/api/regulatory/filing-analysis'))data={analysis:{form:'8-K',accession:ACCESSION,retrospective:false,publicationTimePrecision:'provider_timestamp',classifications:[{label:'Auditor change'}],evidence:[{id:'sec-pass'}]}};
  else if(path==='/api/regulatory/capture'){captured=true;data={archive:{action:'created',revisionId:REV},corporate:{action:'created'}};status=201;}
  else if(path.startsWith('/api/regulatory/archive/revisions'))data={revisions:[{id:REV,version:1,capturedAt:'2026-11-12T22:00:00Z'}]};
  else if(path.startsWith('/api/regulatory/archive'))data={events:captured?events:[]};
  else if(path==='/api/regulatory/investigate'){opened=body;data={case:{id:'CASE-11111111-1111-4111-8111-111111111111'}};status=201;}
  else throw new Error('Unexpected mock API: '+method+' '+path);
  return {status,ok:status<400,json:async()=>data};
 };
 const window={TradeScopeCases:{openById:async()=>{}},location:{}};
 vm.runInNewContext(code,{document,window,fetch,URL,console}, {filename:'discovery-workspace.js'});
 const dispatch=async(tab)=>{for(const fn of listeners.get('tradescope:research-tab')||[])await fn({detail:{tab}});await settle();};
 return {el,dispatch,requests,get opened(){return opened;},get registered(){return registered;},get watchlist(){return watchlist;},get captured(){return captured;}};
}
async function settle(){for(let i=0;i<8;i++)await new Promise(setImmediate);}
test('discovery tab loads local registry and can reach sourced company registration, watchlist, capture, investigation',async()=>{
 const h=harness();await h.dispatch('discovery');
 h.el('discoverySearch').value='Example';await h.el('discoverySearchButton').click();
 assert.match(h.el('discoveryMatches').innerHTML,/EXM/);
 await h.el('discoveryMatches').querySelectorAll('[data-discovery-symbol]')[0].click();
 await h.el('discoveryRegister').click();assert.equal(h.registered[0].symbol,'EXM');
 h.el('discoveryWatchName').value='Example watch';h.el('discoveryWatchSymbols').value='EXM';
 await h.el('discoveryWatchSave').click();assert.equal(h.watchlist.name,'Example watch');
 await h.el('discoveryLoadIssuer').click();assert.match(h.el('discoveryFilingList').innerHTML,/8-K/);
 await h.el('discoveryFilingList').querySelectorAll('[data-accession]')[0].click();
 await h.el('discoveryAnalyze').click();assert.match(h.el('discoveryFilingDetail').innerHTML,/Auditor change/);
 await h.el('discoveryCapture').click();assert.equal(h.captured,true);
 assert.match(h.el('discoveryArchiveList').innerHTML,/EXACT REVISION/);
 await h.el('discoveryArchiveList').querySelectorAll('[data-archive-event]')[0].click();
 assert.deepEqual(JSON.parse(JSON.stringify(h.opened)),{symbol:'EXM',eventId:'sec:'+ACCESSION,revisionId:REV});
 assert.match(h.el('discoveryStatus').textContent,/Investigation/);
});