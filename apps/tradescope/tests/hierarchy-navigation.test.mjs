import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const js=await read('hierarchy-navigation.js');
const css=await read('hierarchy-navigation.css');
const ctx={window:{},URL};
vm.runInNewContext(js,ctx,{timeout:1000});
const model=ctx.window.TradeScopeNavigationModel;
const pages=['index.html','market-hub.html','commodity.html','source-control.html',
 'transmission-lab.html','fred-research.html','evidence-ledger.html',
 'geo-exposure.html','exposure-review.html','event-portal.html','market-capture.html'];
const rootTools=new Set(['monitor','blotter','replay','intel','cases','assist','feed-health']);
const researchTabs=new Set(['company','signals','screener','atlas','monitoring','filings','discovery','crisis','analogues']);
const marketTabs=new Set(['overview','dashboard','compare','financials','watchlists','screener','themes','macro']);

test('shared data model contains three explicit levels, unique identifiers and meaningful complete areas',()=>{
 assert(model);
 assert.deepEqual(Array.from(model.tree,x=>x.id),['markets','companies','events','operations']);
 assert(model.tree.every(g=>g.sections.length>0&&g.sections.every(s=>s.tools.length>0)));
 assert.equal(new Set(model.tools.map(x=>x.href)).size,model.tools.length);
 assert(model.tools.length>=25);
 assert(model.tools.every(x=>x.group&&x.section&&x.label&&x.href.startsWith('/')));
 assert(model.tools.some(x=>x.href==='/#feed-health'));
 assert(model.tools.some(x=>x.href==='/event-portal.html#case-study'));
});
test('every third-level destination is an existing page or supported first-party panel',async()=>{
 const [html,market,server]=await Promise.all([read('index.html'),read('market-hub.html'),read('server.mjs')]);
 for(const leaf of model.tools){
  const [path,hash='']=leaf.href.split('#');
  if(path==='/'){
   if(rootTools.has(hash))continue;
   assert(hash.startsWith('research/'),leaf.href);
   assert(researchTabs.has(hash.slice('research/'.length)),leaf.href);
   assert(html.includes('data-research-tab="'+hash.split('/')[1]+'"'),leaf.href);
  }else{
   assert(pages.includes(path.slice(1)),leaf.href);
   assert(server.includes("'"+path+"'"),leaf.href);
   if(path==='/market-hub.html'){
    assert(marketTabs.has(hash),leaf.href);
    assert(market.includes('data-view="'+hash+'"'),leaf.href);
   }
  }
 }
});
test('URL matching, market hash tabs and legacy home aliases are deterministic',()=>{
 assert.equal(model.resolve('/','#research/filings').id,'filings');
 assert.equal(model.resolve('/index.html','#research/filings').id,'filings');
 assert.equal(model.resolve('/','#feed-health').id,'feed-health');
 assert.equal(model.resolve('/market-hub.html','#financials').id,'financials');
 assert.equal(model.resolve('/event-portal.html','#case-study').id,'aviation');
 assert.equal(model.resolve('/event-portal.html','#event-library').id,'global-event-universe');
 assert.equal(model.resolve('/','#bogus').id,'monitor');
});
test('all ten user-facing pages share the same source-controlled global navigation',async()=>{
 for(const name of pages){
  const html=await read(name);
  assert.match(html,/<link rel="stylesheet" href="\/hierarchy-navigation\.css">/,name);
  assert.match(html,/<script src="\/hierarchy-navigation\.js"><\/script>/,name);
 }
 const home=await read('index.html');
 assert.match(home,/class="primary-nav legacy-navigation"[^>]*hidden/);
 assert.match(home,/<button[^>]*data-nav="research"/);
 assert.match(home,/id="feedProvider"/);
 assert.match(home,/id="feedFreshness"/);
 const server=await read('server.mjs'),staticBuild=await read('scripts/build-static.mjs');
 for(const asset of ['hierarchy-navigation.css','hierarchy-navigation.js']){
  assert(server.includes("'/"+asset+"':'"+asset+"'"));
  assert(staticBuild.includes("'"+asset+"'"));
 }
});
test('hierarchy is rendered as three selectable levels with native accessible links and buttons',()=>{
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.classList={add:()=>{}};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(event,fn){this.listeners[event]=fn;}
 }
 const header=new Element('header'),oldNav=new Element('nav');
 header.querySelector=()=>oldNav;
 header.insertAdjacentElement=(pos,node)=>{assert.equal(pos,'afterend');header.inserted=node;};
 const document={body:{},createElement:name=>new Element(name),
  querySelector:selector=>selector==='header'?header:null,addEventListener:()=>{}};
 const window={location:{pathname:'/',hash:'#monitor',origin:'http://127.0.0.1:8000'},
  addEventListener:()=>{},requestAnimationFrame:fn=>fn(),history:{pushState(){},replaceState(){}}};
 vm.runInNewContext(js,{window,document,URL},{timeout:1000});
 const shell=header.inserted;
 assert(shell);
 assert.equal(shell.children.length,4);
 assert.deepEqual(Array.from(shell.children.slice(0,3),x=>x.children[0].textContent),
  ['LEVEL 1 · PRODUCT','LEVEL 2 · MODULE','LEVEL 3 · TOOLS']);
 const l1=shell.children[0].children[1];
 assert.equal(l1.tag,'nav');
 assert.equal(l1.attributes['aria-label'],'LEVEL 1 · PRODUCT');
 assert(l1.children.every(x=>x.tag==='button'));
 assert.equal(shell.children[2].children[1].children[0].tag,'a');
 assert.equal(shell.children[2].children[1].children[0].attributes['aria-current'],'page');
 // Browsing Level 1 and Level 2 changes the menu without triggering market data requests.
 l1.children.find(x=>x.dataset.navItem==='events').listeners.click();
 assert.equal(shell.children[1].children[1].children[0].textContent,'Event Radar');
 assert(shell.children[2].children[1].children.some(x=>x.href==='/event-portal.html#case-study'));
 assert.equal(oldNav.hidden,true);
});
test('market view supports deep-link initialization, hash changes and history synchronization',async()=>{
 const code=await read('market-hub.js');
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/window\.history\.replaceState/);
 assert.match(js,/if\(isRoot\(\)&&rootPath\(target\.pathname\)===rootPath\(window\.location\.pathname\)\)/);
 assert.match(code,/addEventListener\('hashchange'/);
 assert.match(code,/changeView\(\['overview'/);
});
test('shared navigation remains responsive and keyboard accessible',()=>{
 assert.match(css,/\.ts-hierarchy-row/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
