import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../research-workspace.js',import.meta.url),'utf8');
const navigation=await readFile(new URL('../workspace-nav.js',import.meta.url),'utf8');
const markup=await readFile(new URL('../index.html',import.meta.url),'utf8');
const monitorSource=await readFile(new URL('../app.js',import.meta.url),'utf8');
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
const catalog={schemaVersion:1,instruments:[{symbol:'AAPL',name:'Apple'},{symbol:'NVDA',name:'Nvidia'}],
 definitions:[
  {id:'price.close',label:'Completed-session close',group:'Technicals',unit:'USD',minimumBars:1,description:'Provider closing price.',methodVersion:'test-v1'},
  {id:'technical.rsi14',label:'RSI 14',group:'Technicals',unit:'index',minimumBars:15,description:'Rolling RSI.',methodVersion:'test-v1'},
  {id:'technical.sma200',label:'SMA 200',group:'Technicals',unit:'USD',minimumBars:200,description:'200 completed sessions.',methodVersion:'test-v1'},
  {id:'financial.revenueTTM',label:'Revenue TTM',group:'Growth',unit:'USD',description:'Compatible trailing year.',methodVersion:'sec-test'},
  {id:'technical.breakout20',label:'20-session breakout',group:'Technicals',unit:'boolean',description:'Above earlier highs.',methodVersion:'test-v1'},
  {id:'valuation.forwardPE',label:'Forward P/E',group:'Valuation',unit:'ratio',description:'Needs consensus estimates.',methodVersion:'sec-test'}
 ],presets:[{id:'builtin:oversold',name:'Oversold',match:'all',conditions:[{metricId:'technical.rsi14',operator:'lt',value:30}]}]};
const company=(symbol='AAPL',close=200)=>({schemaVersion:1,symbol,company:symbol+' Inc.',asOf:'2026-11-11',observations:[
 {id:'price.close',value:close,status:'available',unit:'USD',source:'ALPACA_IEX',asOf:'2026-11-11',availableAt:'2026-11-12T10:00:00Z',sampleCount:181,requiredCount:1,methodVersion:'test-v1'},
 {id:'technical.rsi14',value:25,status:'available',unit:'index',source:'ALPACA_IEX',asOf:'2026-11-11',availableAt:'2026-11-12T10:00:00Z',sampleCount:181,requiredCount:15,methodVersion:'test-v1'},
 {id:'technical.sma200',value:null,status:'insufficient_data',reason:'Need 200 completed bars.',unit:'USD',source:'ALPACA_IEX',asOf:'2026-11-11',sampleCount:181,requiredCount:200},
 {id:'valuation.forwardPE',value:null,status:'unsupported',reason:'Consensus provider is not integrated.',unit:'ratio',source:'SEC_EDGAR_XBRL'},
 {id:'financial.revenueTTM',value:null,status:'period_mismatch',reason:'Fiscal periods do not match.',unit:'USD',source:'SEC_EDGAR_XBRL'}
 ],errors:[{source:'SEC_EDGAR_XBRL',message:'Limited filing fixture coverage.'}]});
const evidence={metricId:'technical.rsi14',operator:'lt',value:25,threshold:30,passed:true,status:'available',reason:null,
 source:'ALPACA_IEX',asOf:'2026-11-11',availableAt:'2026-11-12T10:00:00Z',unit:'index',methodVersion:'test-v1',sampleCount:181,requiredCount:15};
const trigger={ruleId:'oversold',name:'Observed RSI below 30',ruleVersion:'rules-v1',symbol:'AAPL',status:'triggered',triggered:true,reason:'RSI was below the threshold.',evidence:[evidence]};
const alert={id:'alert:1',revision:2,ruleId:'oversold',ruleName:trigger.name,ruleVersion:'rules-v1',symbol:'AAPL',status:'active',createdAt:'2026-11-12T10:00:00Z',evidence:[evidence]};

function harness(fetchImpl=async()=>response({}),timerFunctions={setTimeout,clearTimeout}){
 const elements=new Map(),requests=[],events=[],listeners=new Map(),tabs=[],panels=[],nav=[];
 class Element{
  constructor(id=''){this.id=id;this.handlers=new Map();this.textContent='';this.innerHTML='';this.value='';this.disabled=false;this.hidden=false;this.className='';this.dataset={};this.attributes={};this.tabIndex=0;this.focused=false;this.classList={toggle:(name,active)=>{this.attributes['class:'+name]=active;}};}
  addEventListener(name,handler){if(!this.handlers.has(name))this.handlers.set(name,[]);this.handlers.get(name).push(handler);}
  setAttribute(name,value){this.attributes[name]=value;}
  focus(){this.focused=true;}
  click(){return this.fire('click');}
  scrollIntoView(){}
  async fire(name,event={}){return Promise.all((this.handlers.get(name)||[]).map(handler=>handler({target:this,...event})));}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 for(const tab of ['company','signals','screener','filings','analogues']){
  const button=new Element();button.dataset.researchTab=tab;tabs.push(button);
  const panel=new Element();panel.dataset.researchPanel=tab;panel.hidden=tab!=='company';panels.push(panel);
 }
 for(const name of ['monitor','blotter','research','signals','replay','intel','cases']){const button=new Element();button.dataset.nav=name;nav.push(button);}
 const document={documentElement:{dataset:{}},getElementById:element,
  querySelectorAll:selector=>selector==='[data-research-tab]'?tabs:selector==='[data-research-panel]'?panels:selector==='[data-nav]'?nav:[],
  querySelector:selector=>nav.find(button=>selector==='[data-nav="'+button.dataset.nav+'"]')||null,
  addEventListener:(name,handler)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);},
  dispatchEvent:event=>{events.push(event);for(const handler of listeners.get(event.type)||[])handler(event);return true;}
 };
 const window={addEventListener(){},scrollTo(){}};
 element('researchMetricGroup').value='ALL';element('researchMetricAvailability').value='ALL';
 element('researchScreenName').value='My research screen';element('researchScreenMatch').value='all';
 const context=vm.createContext({document,window,URL,Date,structuredClone,AbortController,...timerFunctions,
  CustomEvent:class {constructor(type,options={}){this.type=type;this.detail=options.detail;}},
  requestAnimationFrame:callback=>callback(),
  fetch:(url,options)=>{requests.push({url,options});return fetchImpl(url,options);}
 });
 vm.runInContext(source,context,{filename:'research-workspace.js'});
 return {element,requests,events,tabs,panels,nav,document,context,selection:()=>window.TradeScopeResearch.getSelection(),
  open:async(name='research')=>{document.dispatchEvent({type:'tradescope:workspace',detail:{view:'research',nav:name}});await settle();},
  click:id=>element(id).fire('click'),
  change:(id,value)=>{element(id).value=value;return element(id).fire('change');},
  input:(id,value)=>{element(id).value=value;return element(id).fire('input');},
  delegate:async(id,dataset,name='click',values={})=>{const target={dataset,...values,closest:()=>target};await element(id).fire(name,{target});await settle();},
  tab:async(name)=>{await tabs.find(tab=>tab.dataset.researchTab===name).fire('click');await settle();},
 };
}
function route(fn){return async(url,options)=>url==='/api/research/catalog'?response(catalog):fn(url,options);}

test('visible Signals refreshes scheduled alerts without reverting acknowledgements and stops watching when hidden',async()=>{
 let serial=0,remote=[{...alert}],reads=0;const timers=new Map();
 const h=harness(route(async(url,options)=>{
  if(url==='/api/research/alerts'){reads++;return response({alerts:remote});}
  if(options?.method==='PATCH')return response({alert:{...alert,revision:3,status:'acknowledged'}});
  return response({});
 }),{setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
 h.document.visibilityState='visible';await h.open('signals');assert.equal(h.element('navCount').textContent,'01');
 await h.delegate('researchAlerts',{researchAlertState:'acknowledged',researchAlertIndex:'0'});assert.equal(h.element('navCount').textContent,'00');
 remote=[{...alert},{...alert,id:'alert:2',symbol:'NVDA'}];
 const timer=[...timers].find(([,job])=>job.delay===15000);assert(timer);timers.delete(timer[0]);await timer[1].fn();await settle();
 assert.equal(reads,2);assert.equal(h.element('navCount').textContent,'01');assert(h.element('researchAlerts').innerHTML.includes('ACKNOWLEDGED'));
 h.document.visibilityState='hidden';h.document.dispatchEvent({type:'visibilitychange'});
 assert(![...timers.values()].some(job=>job.delay===15000));
 h.document.visibilityState='visible';h.document.dispatchEvent({type:'visibilitychange'});assert([...timers.values()].some(job=>job.delay===15000));
 h.document.dispatchEvent({type:'tradescope:workspace',detail:{view:'monitor',nav:'monitor'}});assert(![...timers.values()].some(job=>job.delay===15000));
});

test('Research loads catalog separately and shows actual metric availability, readiness and provenance',async()=>{
 const h=harness(route(async()=>response(company())));
 assert.equal(h.requests.length,0);
 await h.open();
 assert.deepEqual(h.requests.map(row=>row.url),['/api/research/catalog']);
 assert.match(h.element('researchSummary').innerHTML,/NO|Load AAPL research/);
 await h.click('researchLoad');
 const rows=h.element('researchMetricRows').innerHTML;
 assert.match(rows,/\$200/);assert.match(rows,/181\/200 observations/);
 assert.match(rows,/UNSUPPORTED/);assert.match(rows,/Consensus provider is not integrated/);
 assert.match(rows,/PERIOD MISMATCH/);assert.match(rows,/2026-11-12T10:00:00Z/);
 assert.match(rows,/Definition and provenance/);assert.match(h.element('researchCompanyErrors').innerHTML,/Limited filing fixture coverage/);
 await h.input('researchMetricSearch','forward');
 assert.match(h.element('researchMetricCount').textContent,/1 SHOWN/);
 assert.doesNotMatch(h.element('researchMetricRows').innerHTML,/Completed-session close/);
 await h.input('researchMetricSearch','');await h.change('researchMetricAvailability','available');
 assert.match(h.element('researchMetricCount').textContent,/2 SHOWN/);
 assert.doesNotMatch(h.element('researchMetricRows').innerHTML,/UNSUPPORTED/);
});

test('a changed security aborts earlier company requests and cannot attach late prior-company data',async()=>{
 const pending=[];
 const h=harness(route((url,options)=>{const job=deferred();pending.push({...job,url,options});return job.promise;}));
 await h.open();
 const first=h.click('researchLoad');await settle();
 assert.match(pending[0].url,/symbol=AAPL/);
 await h.change('researchSymbol','NVDA');assert.equal(pending[0].options.signal.aborted,true);
 const second=h.click('researchLoad');await settle();
 pending[1].resolve(response(company('NVDA',166)));await second;
 pending[0].resolve(response(company('AAPL',999)));await first;
 assert.equal(h.selection().company.symbol,'NVDA');assert.equal(h.selection().company.observations[0].value,166);
 assert.doesNotMatch(h.element('researchSummary').innerHTML,/\$999/);
 assert.match(h.element('researchStatus').textContent,/NVDA/);
 assert.equal(h.element('researchLoad').disabled,false);
});

test('signal dashboard remains readable, filters preserve original action identity and correctly separate readiness states',async()=>{
 const signal=(name,status,id)=>({id,name,ruleId:id,status,triggered:status==='triggered',ruleVersion:'research-rule-v1',evidence:[{metricId:'technical.rsi14',value:28,operator:'lt',threshold:30,source:'ALPACA_IEX',asOf:'2026-11-11T05:00:00Z',sampleCount:80,requiredCount:15}]});
 const data=[
  signal('RSI under threshold','triggered','oversold'),
  signal('SMA non-trigger','ready','sma'),
  signal('Unready rule','warming_up','warm'),
  signal('Absent fiscal metric','unavailable','missing')
 ];
 const alerts=[
  {...alert,id:'alert:nvda',symbol:'NVDA',name:'NVDA trigger',status:'active'},
  {...alert,id:'alert:aapl',symbol:'AAPL',name:'AAPL trigger',status:'active'}
 ];
 const h=harness(route(async(url,options)=>{
  if(url==='/api/research/evaluate')return response({company:company(),evaluations:data,alerts});
  if(url==='/api/research/alerts')return response({alerts});
  if(url.includes('/api/research/alerts/')&&options.method==='PATCH')return response({alert:{...alerts[1],status:'acknowledged',revision:3}});
  throw Error('Unexpected '+url);
 }));
 await h.open('signals');await h.click('researchEvaluate');
 const overview=h.element('researchSignalOverview').innerHTML;
 for(const label of ['Triggered','Not triggered','Warming up','Unavailable'])assert.match(overview,new RegExp(label));
 assert.match(h.element('researchEvaluations').innerHTML,/research-rule-v1/);
 assert.match(h.element('researchEvaluations').innerHTML,/Evidence, readiness and methodology/);
 await h.change('researchSignalFilter','triggered');
 const shown=h.element('researchEvaluations').innerHTML;
 assert.match(shown,/RSI under threshold/);assert.doesNotMatch(shown,/SMA non-trigger/);
 await h.change('researchSignalFilter','unavailable');
 assert.match(h.element('researchEvaluations').innerHTML,/Absent fiscal metric/);
 await h.change('researchAlertFilter','active');
 await h.input('researchAlertSearch','AAPL');
 const rendered=h.element('researchAlerts').innerHTML;
 assert.match(rendered,/AAPL trigger/);assert.doesNotMatch(rendered,/NVDA trigger/);
 assert.match(rendered,/data-research-alert-index="1"/);
 await h.delegate('researchAlerts',{researchAlertState:'acknowledged',researchAlertIndex:'1'});
 const mutation=h.requests.filter(request=>request.options.method==='PATCH').at(-1);
 assert.match(mutation.url,/alert:aapl/);
 assert.deepEqual(JSON.parse(mutation.options.body),{expectedRevision:2,status:'acknowledged'});
 await h.change('researchAlertFilter','acknowledged');
 assert.match(h.element('researchAlerts').innerHTML,/ACKNOWLEDGED/);
 assert.equal(h.element('navCount').textContent,'01');
});

test('rule evaluations retain warming states, persist revisioned alert changes and pass grounded case context',async()=>{
 const h=harness(route(async(url,options)=>{
  if(url==='/api/research/alerts')return response({alerts:[alert,{...alert,id:'alert:2',symbol:'NVDA'}]});
  if(url==='/api/research/evaluate')return response({company:company(),evaluations:[trigger,{ruleId:'sma200',name:'SMA history',status:'warming_up',reason:'Need 200 observations.',triggered:null,evidence:[]}],alerts:[alert]});
  if(options.method==='PATCH')return response({alert:{...alert,status:'acknowledged',revision:3}});
  throw Error('Unexpected '+url);
 }));
 await h.open('signals');await h.click('researchEvaluate');
 assert.match(h.element('researchEvaluations').innerHTML,/WARMING UP/);
 assert.match(h.element('researchEvaluations').innerHTML,/RSI 14/);
 assert.match(h.element('researchEvaluations').innerHTML,/ALPACA_IEX/);
 assert.equal(h.element('navCount').textContent,'02','a symbol-filtered evaluate response must not replace the global active alert count');
 await h.delegate('researchAlerts',{researchAlertState:'acknowledged',researchAlertIndex:'0'});
 const mutation=h.requests.find(row=>row.options.method==='PATCH');
 assert.deepEqual(JSON.parse(mutation.options.body),{expectedRevision:2,status:'acknowledged'});
 assert.match(h.element('researchAlerts').innerHTML,/ACKNOWLEDGED/);
 assert.equal(h.element('navCount').textContent,'01');
 await h.delegate('researchEvaluations',{researchInvestigateEvaluation:'0'});
 const event=h.events.find(row=>row.type==='tradescope:research-investigate').detail;
 assert.equal(event.symbol,'AAPL');assert.equal(event.event.synthetic,false);
 assert.equal(event.event.occurredAt,null,'a daily bar date must not become an invented occurrence timestamp');
 assert.equal(event.context.research.ruleId,'oversold');
 assert.equal(event.context.research.observations[0].id,'technical.rsi14');
 assert.equal(event.context.research.observations[0].source,'ALPACA_IEX');
 assert.equal(event.context.research.observations[0].value,25);
});

test('screener copies colon-containing preset IDs, explains unknowns and never submits empty numeric values',async()=>{
 const h=harness(route(async(url,options)=>{
  if(url==='/api/research/screens'&&options.method==='GET')return response({screens:[],presets:catalog.presets});
  if(url==='/api/research/screens'&&options.method==='POST'){const input=JSON.parse(options.body);return response({...input.screen||input,id:'saved:1',revision:input.expectedRevision?input.expectedRevision+1:1});}
  if(url==='/api/research/screens/saved%3A1')return response({deleted:true});
  if(url==='/api/research/screen')return response({results:[{symbol:'AAPL',match:true,status:'triggered',evidence:[evidence]},{symbol:'NVDA',match:null,status:'unavailable',reason:'Required fiscal period is missing.',evidence:[]}],coverage:'Two selected pilot symbols.'});
  throw Error('Unexpected '+url);
 }));
 await h.open('screener');await h.change('researchScreenSelect','preset:builtin:oversold');
 assert.equal(h.element('researchScreenName').value,'Oversold');
 await h.click('researchSaveScreen');
 const saved=JSON.parse(h.requests.find(row=>row.options.method==='POST'&&row.url==='/api/research/screens').options.body);
 assert.equal(saved.id,undefined);assert.equal(saved.conditions[0].value,30);
 assert.deepEqual(saved.symbols,['AAPL','NVDA']);
 assert.equal(h.element('researchSaveScreen').textContent,'SAVE CHANGES');
 await h.click('researchSaveScreen');
 const update=JSON.parse(h.requests.filter(row=>row.options.method==='POST'&&row.url==='/api/research/screens').at(-1).options.body);
 assert.equal(update.screen.id,'saved:1');assert.equal(update.expectedRevision,1);
 await h.click('researchRunScreen');
 assert.match(h.element('researchScreenResultCount').textContent,/1 MATCHES \/ 2 EVALUATED/);
 assert.match(h.element('researchScreenResults').innerHTML,/Required fiscal period is missing/);
 assert.match(h.element('researchScreenResults').innerHTML,/UNAVAILABLE/);
 await h.delegate('researchConditions',{conditionValue:'0'},'input',{value:''});
 assert.equal(h.element('researchScreenResultCount').textContent,'NOT RUN');
 const before=h.requests.filter(row=>row.url==='/api/research/screen').length;
 await h.click('researchRunScreen');
 assert.equal(h.requests.filter(row=>row.url==='/api/research/screen').length,before);
 assert.match(h.element('researchStatus').textContent,/finite threshold/);
 await h.click('researchDeleteScreen');
 const deleted=h.requests.find(row=>row.options.method==='DELETE');
 assert.deepEqual(JSON.parse(deleted.options.body),{expectedRevision:2});
 await h.change('researchScreenSelect','');
 assert.equal(h.element('researchSaveScreen').textContent,'SAVE NEW SCREEN');
});

test('filing reader renders escaped exact passages, rejects unsafe links and clears issuer content on symbol change',async()=>{
 const filing={accession:'000123-26-001',form:'8-K',headline:'Issuer <script>filing</script>',filingDate:'2026-11-11',sourceUrl:'https://www.sec.gov/Archives/test.htm'};
 const h=harness(route(async url=>{
  if(url.startsWith('/api/intelligence/filings'))return response({filings:[filing]});
  if(url.startsWith('/api/research/filing?'))return response({filing,summary:[{text:'<img src=x onerror=alert(1)> reported event',evidenceId:'ev-1'}],items:[{code:'2.02',title:'Results',text:'<b>Actual quoted text</b>'}],evidence:[{id:'ev-1',section:'Item 2.02',text:'<script>source passage</script>',sourceUrl:'javascript:alert(1)'}],limitations:['Extraction is not legal interpretation.']});
  throw Error('Unexpected '+url);
 }));
 await h.open();await h.tab('filings');await h.click('researchLoadFilings');
 await h.delegate('researchFilingList',{researchFiling:'0'});
 const html=h.element('researchFilingDetail').innerHTML;
 assert.match(html,/&lt;script&gt;source passage/);
 assert.match(html,/&lt;img src=x onerror/);
 assert.match(html,/https:\/\/www.sec.gov\/Archives\/test.htm/);
 assert.doesNotMatch(html,/<script>|href="javascript:/);
 assert.match(html,/Occurred Not established/);
 await h.change('researchSymbol','NVDA');
 assert.doesNotMatch(h.element('researchFilingDetail').innerHTML,/Actual quoted text/);
 assert.match(h.element('researchFilingDetail').innerHTML,/Select a filing/);
});

test('analogue comparisons explain weighted features and pending horizons; changing event aborts stale outcomes',async()=>{
 const event={id:'usgs:current',title:'Official current event',magnitude:6,depthKm:10,occurredAt:'2026-11-10T15:00:00Z',updatedAt:'2026-11-10T15:10:00Z',sourceUrl:'https://earthquake.usgs.gov/test'};
 const historical={...event,id:'usgs:past',title:'Historical event',occurredAt:'2020-05-10T15:00:00Z'};
 const pending=deferred();let outcomeCalls=0;
 const h=harness(route(async(url)=>{
  if(url==='/api/research/earthquakes')return response({events:[event,{...event,id:'usgs:other',title:'Other current event'}]});
  if(url.startsWith('/api/research/analogues'))return response({event,matches:[{event:historical,similarity:.81,matchedFeatures:[{feature:'magnitude',selected:6,candidate:6.1,difference:.1,unit:'magnitude',weight:.5}],differences:['Different country and exposure.']}],limitations:['No calibrated forecast.']});
  if(url.startsWith('/api/research/event-outcomes')){
   outcomeCalls++;
   if(outcomeCalls>1)return pending.promise;
   return response({symbol:'AAPL',source:'ALPACA_IEX',study:{status:'observed',referenceSession:'2020-05-08',horizons:[{sessions:1,status:'observed',stockReturnPct:2,benchmarkReturnPct:1,relativeReturnPct:1},{sessions:20,status:'pending',stockReturnPct:null,benchmarkReturnPct:null,relativeReturnPct:null}]}});
  }
  throw Error('Unexpected '+url);
 }));
 await h.open();await h.tab('analogues');await h.change('researchTheme','earthquake');await h.click('researchLoadEarthquakes');await h.click('researchFindAnalogues');
 assert.match(h.element('researchAnalogues').innerHTML,/Magnitude: selected 6 magnitude, historical 6.1 magnitude/);
 assert.match(h.element('researchAnalogues').innerHTML,/weight 50%/);
 assert.match(h.element('researchAnalogues').innerHTML,/NOT A PROBABILITY/);
 assert.doesNotMatch(h.element('researchAnalogues').innerHTML,/\[object Object\]/);
 await h.delegate('researchAnalogues',{researchOutcome:'0'});
 assert.match(h.element('researchOutcomes').innerHTML,/PENDING/);
 assert.match(h.element('researchOutcomes').innerHTML,/1 pp/);
 await h.delegate('researchAnalogues',{researchOutcome:'0'});
 const request=h.requests.filter(row=>row.url.startsWith('/api/research/event-outcomes')).at(-1);
 await h.change('researchEarthquake','usgs:other');
 assert.equal(request.options.signal.aborted,true);
 pending.resolve(response({symbol:'AAPL',study:{status:'observed',horizons:[{sessions:1,status:'observed',stockReturnPct:99}]}}));await settle();
 assert.match(h.element('researchOutcomes').innerHTML,/Choose a historical match/);
 assert.doesNotMatch(h.element('researchOutcomes').innerHTML,/99%/);
});

test('research tabs support keyboard navigation and primary routes preserve Monitor, Replay, Intelligence and Investigations',async()=>{
 const h=harness(route(async()=>response({alerts:[]})));
 vm.runInContext(navigation,h.context,{filename:'workspace-nav.js'});
 assert.equal(h.document.documentElement.dataset.workspace,'monitor');
 for(const [name,workspace,tab] of [['research','research','company'],['signals','research','signals'],['blotter','monitor'],['replay','monitor'],['intel','intel'],['cases','cases']]){
  await h.nav.find(button=>button.dataset.nav===name).click();await settle();
  assert.equal(h.document.documentElement.dataset.workspace,workspace);
  if(tab)assert.equal(h.selection().tab,tab);
 }
 await h.tabs[0].fire('keydown',{key:'End',preventDefault(){}});
 assert.equal(h.selection().tab,'analogues');assert.equal(h.tabs.at(-1).focused,true);
 assert.equal(h.tabs.at(-1).attributes['aria-selected'],'true');
 assert.equal(h.panels.find(panel=>panel.dataset.researchPanel==='analogues').hidden,false);
});

test('historical investigations preserve the selected past event and its exact captured study without asserting symbol exposure',async()=>{
 const current={id:'current-quake',title:'Current quake',occurredAt:'2026-11-10T15:00:00Z',sourceUrl:'https://earthquake.usgs.gov/current'};
 const historical=[{id:'past-one',title:'First historical quake',occurredAt:'2011-03-11T05:46:00Z',sourceUrl:'https://earthquake.usgs.gov/past-one'},
  {id:'past-two',title:'Second historical quake',occurredAt:'2004-12-26T00:58:53Z',sourceUrl:'https://earthquake.usgs.gov/past-two'}];
 const studies=historical.map((event,index)=>({status:'observed',eventTime:event.occurredAt,referenceSession:index===0?'2011-03-10':'2004-12-23',
  horizons:[{sessions:1,status:'observed',stockReturnPct:index+2,benchmarkReturnPct:1,relativeReturnPct:index+1}]}));
 const h=harness(route(async url=>{
  if(url==='/api/research/earthquakes')return response({events:[current]});
  if(url.startsWith('/api/research/analogues'))return response({event:current,matches:historical.map((event,index)=>({event,similarity:.9-index*.1}))});
  if(url.startsWith('/api/research/event-outcomes')){const at=new URL(url,'http://localhost').searchParams.get('eventTime');return response({symbol:'AAPL',source:'ALPACA_IEX',study:studies[historical.findIndex(event=>event.occurredAt===at)]});}
  throw Error('Unexpected '+url);
 }));
 await h.open();await h.change('researchTheme','earthquake');await h.click('researchLoadEarthquakes');await h.click('researchFindAnalogues');
 assert.equal(h.element('researchInvestigateOutcome').hidden,true);
 await h.click('researchInvestigateOutcome');
 assert.equal(h.events.filter(event=>event.type==='tradescope:research-investigate').length,0);
 await h.delegate('researchAnalogues',{researchOutcome:'0'});
 await h.delegate('researchAnalogues',{researchOutcome:'1'});
 assert.equal(h.element('researchInvestigateOutcome').hidden,false);
 await h.click('researchInvestigateOutcome');
 const saved=h.events.filter(event=>event.type==='tradescope:research-investigate').at(-1).detail;
 assert.equal(saved.symbol,'AAPL');assert.equal(saved.event.id,'past-two');
 assert.equal(saved.event.occurredAt,historical[1].occurredAt);
 assert.equal(saved.event.source,'USGS');assert.equal(saved.event.sourceUrl,historical[1].sourceUrl);
 assert.equal(saved.event.publishedAt,null);assert.equal(saved.event.synthetic,false);
 assert.equal(saved.event.evidenceLevel,'retrospective_catalog_comparison');
 assert.deepEqual(Array.from(saved.event.symbols),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(saved.context.study.study)),studies[1]);
 assert.match(saved.event.summary,/current-quake.*past-two/);
 assert.match(saved.event.summary,/return windows belong to this historical event only/);
 assert.match(saved.context.research.description,/UNVERIFIED/);
 await h.change('researchSymbol','NVDA');
 assert.equal(h.element('researchInvestigateOutcome').hidden,true);
 await h.click('researchInvestigateOutcome');
 assert.equal(h.events.filter(event=>event.type==='tradescope:research-investigate').length,1);
});

test('unconfigured provider failures show actionable server errors and do not create company observations',async()=>{
 const h=harness(route(async()=>response({error:'Set ALPACA_API_KEY and ALPACA_SECRET_KEY on the server.'},503)));
 await h.open();await h.click('researchLoad');
 assert.equal(h.selection().company,null);
 assert.match(h.element('researchStatus').textContent,/Set ALPACA_API_KEY/);
 assert.match(h.element('researchStatus').className,/error/);
 assert.equal(h.element('researchLoad').disabled,false);
});

test('the checked-in document includes every direct research control and all five accessible tab panels',()=>{
 const ids=[...source.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]);
 for(const id of new Set(ids))assert(markup.includes('id="'+id+'"'),'Missing UI element '+id);
 for(const tab of ['company','signals','screener','filings','analogues']){
  assert(markup.includes('data-research-tab="'+tab+'"'));
  assert(markup.includes('data-research-panel="'+tab+'"'));
 }
 assert.match(markup,/data-nav="research"/);
 assert.doesNotMatch(monitorSource,/el\(['"]navCount['"]\)/,'Monitor surveillance counters must not overwrite saved research alert counts.');
});
