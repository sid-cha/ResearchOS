import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../event-workspace.js',import.meta.url),'utf8');
const response=(body,{ok=true,status=200}={})=>({ok,status,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const indicators={close:255,sma20:250,sma50:245,rsi14:55,macd:1,macdSignal:.8,atr14:3,volumeRatio20:1.2,barsCount:120};
const technical=(symbol='AAPL',close=255)=>({symbol,source:'ALPACA_IEX',indicators:{...indicators,close},forecast:{status:'baseline',volatilityEstimatePct:2,walkForwardAbsReturnMaePct:1,validationSessions:25}});
const facts={symbol:'AAPL',source:'SEC EDGAR / XBRL',company:'Apple Inc.',quarterly:{revenue:{value:123000000,periodEnd:'2026-09-30',filingDate:'2026-10-30'}}};
const news={id:'alpaca:1',category:'CORPORATE',type:'COMPANY_NEWS',source:'Alpaca News',headline:'Sourced Apple news fixture',publishedAt:'2026-11-10T15:00:00Z',symbols:['AAPL'],evidenceLevel:'published_news'};
const filing={...news,id:'sec:1',source:'SEC EDGAR',type:'FILING',form:'10-Q',filingDate:'2026-10-30'};
const hazard={id:'usgs:1',category:'NATURAL',type:'EARTHQUAKE',source:'USGS',headline:'Observed earthquake fixture',occurredAt:'2026-11-10T14:00:00Z',symbols:[]};

function harness(fetchImpl=async()=>response({})){
 const elements=new Map(),requests=[];
 class Element{
  constructor(){this.handlers=new Map();this.textContent='';this.innerHTML='';this.value='';this.disabled=false;this.className='';this.classList={toggle(){}};}
  addEventListener(name,handler){this.handlers.set(name,handler);}
  querySelectorAll(){return [];}
  scrollIntoView(){}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 element('intelTechnicalSource').textContent='DEMO ONLY';element('intelFinancialSource').textContent='DEMO ONLY';
 element('intelSymbol').value='AAPL';element('intelTopic').value='sanctions';
 const document={getElementById:element,querySelector:()=>null};
 const window={};
 const context=vm.createContext({document,window,URL,Date,structuredClone,AbortController,setTimeout,clearTimeout,
  fetch:(url,options)=>{requests.push({url,options});return fetchImpl(url,options);}});
 vm.runInContext(source,context,{filename:'event-workspace.js'});
 return {element,requests,selection:()=>window.TradeScopeIntel.getSelection(),
  click:id=>Promise.resolve(element(id).handlers.get('click')?.()),
  change:(id,value)=>{element(id).value=value;return element(id).handlers.get('change')?.({target:{value}});},
  input:(id,value)=>{element(id).value=value;return element(id).handlers.get('input')?.({target:{value}});}};
}

test('technical-only success retains synthetic event scenarios and independent real panel provenance',async()=>{
 const h=harness(async()=>response(technical()));
 assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');
 await h.click('intelTechnical');
 assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');
 assert.equal(h.element('intelMode').textContent,'SYNTHETIC EXAMPLE');
 assert.match(h.element('intelTechnicalSource').textContent,/AAPL.*REAL BARS/);
 assert.equal(h.selection().technical.close,255);
 assert.match(h.selection().event.id,/^hypo:/);
 assert.match(h.element('intelStatus').textContent,/120 market bars loaded/);
 assert.match(h.element('intelFinancialSource').textContent,/DEMO ONLY/);
});

test('real event sources replace examples while unloaded research panels retain separate labels',async()=>{
 const h=harness(async()=>response({symbol:'AAPL',source:'ALPACA_NEWS',events:[news]}));
 await h.click('intelNews');
 assert.equal(h.element('intelCount').textContent,'1 / 1 RECORDS');
 assert.equal(h.element('intelMode').textContent,'SOURCED DATA · LOCAL');
 assert.equal(h.selection().event.id,'alpaca:1');assert.equal(h.selection().technical,null);
 assert.equal(h.element('intelTechnicalSource').textContent,'DEMO ONLY');
 assert.match(h.element('intelStatus').textContent,/1 sourced ALPACA_NEWS/);
 assert.doesNotMatch(h.element('intelEventRows').innerHTML,/HYPOTHETICAL/);
});

test('partial SEC results preserve error details and do not relabel synthetic events as sourced',async()=>{
 const h=harness(async url=>url.includes('/filings')?response({error:'Set SEC_USER_AGENT for the filings source.'},{ok:false,status:503}):response(facts));
 await h.click('intelFilings');
 assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');
 assert.equal(h.element('intelMode').textContent,'SYNTHETIC EXAMPLE');
 assert.match(h.element('intelStatus').textContent,/Partial SEC results.*SEC_USER_AGENT/);
 assert.match(h.element('intelStatus').className,/error/);
 assert.match(h.element('intelFinancialSource').textContent,/AAPL.*ACTUAL/);
 assert.equal(h.selection().fundamentals.company,'Apple Inc.');
});

test('partial hazard success retains source counts and failed-feed diagnostics',async()=>{
 const h=harness(async()=>response({source:'USGS_NASA',events:[hazard],errors:['NASA source timed out']}));
 await h.click('intelHazards');
 assert.equal(h.element('intelCount').textContent,'1 / 1 RECORDS');
 assert.equal(h.selection().event.id,'usgs:1');
 assert.match(h.element('intelStatus').textContent,/1 sourced USGS \/ NASA.*Partial hazard results.*NASA source timed out/);
 assert.match(h.element('intelStatus').className,/error/);
});

test('changing security clears issuer research and study instead of attaching AAPL context to NVDA',async()=>{
 const h=harness(async url=>response(url.includes('/technicals')?technical():url.includes('/filings')?{symbol:'AAPL',filings:[filing]}:url.includes('/fundamentals')?facts:{symbol:'AAPL',source:'ALPACA_IEX',study:{status:'insufficient_data',reason:'Need completed sessions'}}));
 await h.click('intelTechnical');await h.click('intelFilings');await h.click('intelImpact');
 assert.equal(h.selection().technical.close,255);assert.equal(h.selection().fundamentals.symbol,'AAPL');assert(h.selection().study);
 h.change('intelSymbol','NVDA');
 const selected=h.selection();
 assert.equal(selected.symbol,'NVDA');assert.equal(selected.technical,null);assert.equal(selected.fundamentals,null);assert.equal(selected.study,null);
 assert.equal(h.element('intelTechnicalSource').textContent,'NOT LOADED');
 assert.equal(h.element('intelFinancialSource').textContent,'NOT LOADED');
 assert.match(h.element('intelFilingRows').innerHTML,/No SEC filings loaded/);
 assert.doesNotMatch(h.element('intelIndicators').innerHTML,/>255(?:\.00)?</);
});

test('late prior-security responses are aborted and cannot overwrite a later request',async()=>{
 const pending=[];
 const h=harness((url,options)=>{const item=deferred();pending.push({...item,url,options});return item.promise;});
 const first=h.click('intelTechnical');
 assert.match(pending[0].url,/symbol=AAPL/);
 h.change('intelSymbol','NVDA');assert.equal(pending[0].options.signal.aborted,true);
 const second=h.click('intelTechnical');assert.match(pending[1].url,/symbol=NVDA/);
 pending[1].resolve(response(technical('NVDA',166)));await second;
 pending[0].resolve(response(technical('AAPL',354)));await first;
 assert.equal(h.selection().symbol,'NVDA');assert.equal(h.selection().technical.close,166);
 assert.match(h.element('intelTechnicalSource').textContent,/NVDA.*REAL BARS/);
 assert.match(h.element('intelStatus').textContent,/loaded for NVDA/);
});

test('DEMO reset cancels source requests and late data cannot replace restored examples',async()=>{
 const pending=deferred();let signal;
 const h=harness((url,options)=>{signal=options.signal;return pending.promise;});
 const request=h.click('intelNews');await h.click('intelDemo');assert.equal(signal.aborted,true);
 pending.resolve(response({symbol:'AAPL',source:'ALPACA_NEWS',events:[news]}));await request;
 assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');assert.equal(h.element('intelMode').textContent,'SYNTHETIC EXAMPLE');
 assert.match(h.element('intelStatus').textContent,/Synthetic scenarios restored/);assert.equal(h.selection().technical,null);
});

test('empty successful feed and filtering loaded records have different actionable states',async()=>{
 const h=harness(async()=>response({source:'GDELT_DOC',events:[]}));
 h.input('intelQuery','nonexistent fixture text');
 assert.equal(h.element('intelCount').textContent,'0 / 4 RECORDS');
 assert.match(h.element('intelEventRows').innerHTML,/Clear the category\/search filters/);
 await h.click('intelGeo');
 assert.equal(h.element('intelCount').textContent,'0 / 0 RECORDS');assert.equal(h.selection().event,null);
 assert.equal(h.element('intelMode').textContent,'SOURCE CHECKED · NO RECORDS');
 assert.match(h.element('intelEventRows').innerHTML,/No sourced event records loaded.*DEMO SCENARIOS/);
 assert.match(h.element('intelStatus').textContent,/0 sourced GDELT.*No records returned/);
 await h.click('intelDemo');assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');
});

test('empty market bars stay unavailable and missing credentials preserve clearly synthetic fixtures',async()=>{
 let fail=false;
 const h=harness(async()=>fail?response({error:'Alpaca credentials missing'},{ok:false,status:503}):response({symbol:'AAPL',source:'ALPACA_IEX',indicators:{barsCount:0,close:null},forecast:{status:'insufficient_data',observedBars:0,minimumBars:46}}));
 await h.click('intelTechnical');
 assert.equal(h.element('intelCount').textContent,'4 / 4 RECORDS');assert.match(h.element('intelTechnicalSource').textContent,/NO USABLE BARS/);
 assert.match(h.element('intelStatus').textContent,/No usable market bars returned/);assert.match(h.element('intelForecast').innerHTML,/Insufficient market bars/);
 assert.doesNotMatch(h.element('intelIndicators').innerHTML,/238\.15/);
 await h.click('intelDemo');fail=true;await h.click('intelTechnical');
 assert.equal(h.element('intelMode').textContent,'SYNTHETIC EXAMPLE');assert.match(h.element('intelStatus').textContent,/Alpaca credentials missing/);
 assert.equal(h.element('intelTechnicalSource').textContent,'DEMO ONLY');assert.equal(h.selection().technical,null);
});
