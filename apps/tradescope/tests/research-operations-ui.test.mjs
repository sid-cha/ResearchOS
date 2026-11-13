import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../research-operations.js',import.meta.url),'utf8');
const markup=await readFile(new URL('../index.html',import.meta.url),'utf8');
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(setImmediate);};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const catalog={instruments:[{symbol:'AAPL',name:'Apple'},{symbol:'MSFT',name:'Microsoft'}]};
const saved={id:'SCREEN-test',revision:3,name:'Price above SMA',conditions:[{metricId:'price.close',operator:'gt',otherMetricId:'technical.sma200'}]};
const metric=(value,status='available',reason=null)=>({value,status,reason,source:'ALPACA_IEX',asOf:'2026-11-11'});
const atlas={asOf:'2026-11-11',coverage:{requested:2,available:1},
 rows:[{symbol:'AAPL',category:'Consumer technology',source:'ALPACA_IEX',asOf:'2026-11-11',metrics:{return1dPct:metric(2),return5dPct:metric(null,'unavailable','Need six completed sessions'),return20dPct:metric(0),return63dPct:metric(-3),rsi14:metric(50),relativeVolume20:metric(1.2)},trends:{sma20:{status:'available',relation:'above'},sma50:{status:'unavailable',reason:'Missing average'},sma200:{status:'available',relation:'equal'}}},
 {symbol:'MSFT',category:'<img src=x onerror=bad()>',source:'ALPACA_IEX',asOf:null,metrics:{},trends:{}}],
 breadth:{return1d:{positive:1,negative:0,unchanged:0,eligible:1,unavailable:1},sma20:{above:1,below:0,equal:0,eligible:1,unavailable:1}},
 groups:[{name:'Pilot tech',symbols:['AAPL','MSFT'],returns:{return1dPct:{status:'available',value:2,contributors:['AAPL'],eligible:1},return5dPct:{status:'unavailable',value:null,contributors:[],eligible:0,reason:'period_mismatch'}}}],
 comparison:{status:'available',dates:['2026-11-10','2026-11-11'],series:[{symbol:'AAPL',source:'ALPACA_IEX',currency:'USD',adjustment:'split',baseDate:'2026-11-10',points:[{date:'2026-11-10',index:100,returnPct:0},{date:'2026-11-11',index:102,returnPct:2}]}]},
 limitations:['Pilot only; <script>bad()</script>']};
const monitor={id:'MONITOR-one',name:'Saved local monitor',screenId:saved.id,screenRevision:3,rule:saved,symbols:['AAPL'],enabled:false,intervalMinutes:15,revision:1,lastRun:null,nextRunAt:null};

function harness(route=async()=>response({})){
 const elements=new Map(),requests=[],listeners=new Map(),events=[];
 class Element{
  constructor(id){this.id=id;this.value='';this.disabled=false;this.hidden=false;this.innerHTML='';this.textContent='';this.className='';this.handlers=new Map();this.dataset={};}
  addEventListener(type,handler){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(handler);}
  async fire(type,event={}){await Promise.all((this.handlers.get(type)||[]).map(handler=>handler({target:this,...event})));await settle();}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 element('atlasWindow').value='20';element('monitorName').value='My local monitor';element('monitorInterval').value='15';element('researchSymbol').value='AAPL';
 const document={getElementById:element,addEventListener:(type,handler)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},dispatchEvent:event=>{events.push(event);for(const handler of listeners.get(event.type)||[])handler(event);return true;}};
 vm.runInNewContext(source,{document,AbortController,setTimeout,clearTimeout,Intl,Date,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},fetch:async(url,options)=>{requests.push({url,options});return url==='/api/research/catalog'?response(catalog):route(url,options);}}, {filename:'research-operations.js'});
 return {element,requests,events,document,open:async tab=>{document.dispatchEvent({type:'tradescope:research-tab',detail:{tab}});await settle();},click:id=>element(id).fire('click'),change:async(id,value)=>{element(id).value=value;await element(id).fire('change');},checkbox:async(id,key,symbol,checked)=>element(id).fire('change',{target:{dataset:{[key]:symbol},checked}}),action:async(action,id=monitor.id)=>element('monitorRows').fire('click',{target:{closest:()=>({dataset:{monitorAction:action,monitorId:id},disabled:false})}})};
}
function monitoringRoutes(extra=()=>null){return async(url,options)=>{
 const override=await extra(url,options);if(override)return override;
 if(url==='/api/research/monitors')return response({monitors:[monitor],health:{started:true,closed:false,monitorCount:1,enabledCount:0,runningMonitorId:null,queued:0,lastSchedulerError:null,localOnly:true,requiresRunningServer:true,minimumIntervalMinutes:5,maximumMonitors:20}});
 if(url==='/api/research/screens')return response({screens:[saved]});
 if(url==='/api/research/backend')return response({configured:false,status:'disabled'});
 return response({error:'Unexpected request'},404);
};}

test('Atlas loads on explicit action and distinguishes sourced returns, unknowns and pilot contributions',async()=>{
 const h=harness(async url=>url==='/api/research/atlas'?response(atlas):response({}));
 assert.equal(h.requests.length,0);await h.open('atlas');assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/research/catalog');
 await h.click('atlasLoad');const request=h.requests.find(item=>item.url==='/api/research/atlas');
 assert.equal(request.options.method,'POST');assert.deepEqual(JSON.parse(request.options.body),{symbols:['AAPL','MSFT'],comparisonSymbols:['AAPL','MSFT'],windowSessions:20});
 assert.match(h.element('atlasRows').innerHTML,/\+2%/);assert.match(h.element('atlasRows').innerHTML,/>0%</);assert.match(h.element('atlasRows').innerHTML,/unavailable/);
 assert.match(h.element('atlasRows').innerHTML,/Need six completed sessions/);assert.match(h.element('atlasBreadth').innerHTML,/1 UP \/ 0 DOWN/);
 assert.match(h.element('atlasGroups').innerHTML,/AAPL · 1 contributors/);assert.match(h.element('atlasGroups').innerHTML,/period_mismatch/);
 assert.match(h.element('atlasRows').innerHTML,/&lt;img/);assert(!h.element('atlasRows').innerHTML.includes('<img'));
 assert(!h.element('atlasLimitations').innerHTML.includes('<script>'));
 assert.match(h.element('atlasComparison').innerHTML,/<polyline/);assert.match(h.element('atlasComparison').innerHTML,/102/);assert.match(h.element('atlasComparison').innerHTML,/base one hundred/);
});

test('Atlas selection invalidates in-flight first-generation responses without manufacturing a chart',async()=>{
 const pending=deferred(),h=harness(async url=>url==='/api/research/atlas'?pending.promise:response({}));
 await h.open('atlas');const running=h.click('atlasLoad');await settle();
 await h.checkbox('atlasSymbols','atlasSymbol','MSFT',false);
 pending.resolve(response(atlas));await running;
 assert.match(h.element('atlasRows').innerHTML,/Load sourced research/);assert(!h.element('atlasComparison').innerHTML.includes('<polyline'));
 const request=h.requests.find(item=>item.url==='/api/research/atlas');assert.equal(request.options.signal.aborted,true);
});

test('Atlas duplicate clicks coalesce and navigation ignores a delayed provider result',async()=>{
 const pending=deferred(),h=harness(async url=>url==='/api/research/atlas'?pending.promise:response({}));await h.open('atlas');
 const first=h.click('atlasLoad');await settle();const second=h.click('atlasLoad');await settle();
 assert.equal(h.requests.filter(item=>item.url==='/api/research/atlas').length,1);
 await h.open('company');pending.resolve(response(atlas));await Promise.all([first,second]);
 assert.match(h.element('atlasRows').innerHTML,/Load sourced research/);
});

test('Partial comparison shows requested coverage and explicit excluded instruments beside retained curves',async()=>{
 const partial={...atlas,comparison:{...atlas.comparison,requestedSymbols:['AAPL','MSFT','NVDA'],eligibleSymbols:['AAPL'],coverage:{requested:3,eligible:1,excluded:2,commonSessions:2},excluded:[{symbol:'MSFT',reason:'stale_input'},{symbol:'<img src=x>',reason:'<script>unsafe()</script>'}]}};
 const h=harness(async()=>response(partial));await h.open('atlas');await h.click('atlasLoad');
 const output=h.element('atlasComparison').innerHTML;
 assert.match(output,/3 requested · 1 eligible histories · 2 excluded · 2 common sessions/);assert.match(output,/<polyline/);
 assert.match(output,/Excluded comparison instruments/);assert.match(output,/MSFT/);assert.match(output,/latest observation is too old/);
 assert(!output.includes('stale_input'));assert(!output.includes('<img'));assert(!output.includes('<script>'));assert.match(output,/&lt;img/);assert.match(output,/&lt;script/);
 assert.match(output,/Each curve starts at 100/);
});

test('All-missing comparison gives a plain readiness explanation and no fabricated series',async()=>{
 const empty={...atlas,comparison:{status:'unavailable',reason:'no_eligible_series',requestedSymbols:['AAPL','MSFT'],eligibleSymbols:[],dates:[],series:[],coverage:{requested:2,eligible:0,excluded:2,commonSessions:0},excluded:[{symbol:'AAPL',reason:'missing_data'},{symbol:'MSFT',reason:'insufficient_data'}]}};
 const h=harness(async()=>response(empty));await h.open('atlas');await h.click('atlasLoad');
 const output=h.element('atlasComparison').innerHTML;
 assert.match(output,/No eligible price history is available/);assert.match(output,/2 requested · 0 eligible histories · 2 excluded · 0 common sessions/);
 assert.match(output,/required price observations are missing/);assert.match(output,/not enough completed observations/);assert(!output.includes('no_eligible_series'));assert(!output.includes('<polyline'));
});

test('Monitor creation stays disabled and enable/run preserve revisioned server state',async()=>{
 let createdBody,patchedBody;
 const h=harness(monitoringRoutes((url,options)=>{
  if(url==='/api/research/monitors'&&options.method==='POST'){createdBody=JSON.parse(options.body);return response({...monitor,id:'MONITOR-two',name:'My local monitor'});}
  if(url==='/api/research/monitors/'+monitor.id&&options.method==='PATCH'){patchedBody=JSON.parse(options.body);return response({...monitor,enabled:true,revision:2,nextRunAt:'2026-11-12T18:15:00Z'});}
  if(url.endsWith('/run'))return response({action:'completed',monitor:{...monitor,enabled:true,revision:2,lastRun:{status:'completed',startedAt:'2026-11-12T18:00:00Z',finishedAt:'2026-11-12T18:00:01Z',summary:{evaluated:1,triggered:1,ready:0,unavailable:0,warmingUp:0,alertsCreated:1,alertsUpdated:0,alertsResolved:0,suppressed:0}}}});
 }));
 await h.open('monitoring');assert.equal(h.element('monitorCreate').disabled,false);await h.click('monitorCreate');
 assert.equal(createdBody.enabled,false);assert.equal(createdBody.screenId,saved.id);assert.deepEqual(createdBody.symbols,['AAPL','MSFT']);assert.equal(createdBody.intervalMinutes,15);
 assert.match(h.element('monitorStatus').textContent,/saved disabled/);await h.action('toggle');
 assert.deepEqual(patchedBody,{expectedRevision:1,enabled:true});assert.match(h.element('monitorRows').innerHTML,/ENABLED/);assert.match(h.element('monitorRows').innerHTML,/revision 3/);
 await h.action('run');assert.match(h.element('monitorRows').innerHTML,/1 triggered/);assert.match(h.element('monitorRows').innerHTML,/1 alerts created/);
 assert(h.events.some(event=>event.type==='tradescope:research-alerts-changed'));
});

test('Monitor revision conflict and failed refresh retain last known state with an explicit error',async()=>{
 const h=harness(monitoringRoutes((url,options)=>url==='/api/research/monitors/'+monitor.id&&options.method==='PATCH'?response({error:'Monitor changed; refresh and retry'},409):null));
 await h.open('monitoring');await h.action('toggle');assert.match(h.element('monitorStatus').textContent,/changed; refresh/);assert.match(h.element('monitorRows').innerHTML,/DISABLED/);
 assert(!h.element('monitorRows').innerHTML.includes('ENABLED ·'));
});

test('Actual scheduler health and failed monitor runs stay distinct from completed scans',async()=>{
 const h=harness(monitoringRoutes((url,options)=>{
  if(url==='/api/research/monitors')return response({monitors:[monitor],health:{started:true,closed:false,monitorCount:1,enabledCount:0,runningMonitorId:'MONITOR-other',lastSchedulerError:null}});
  if(url.endsWith('/run'))return response({action:'failed',monitor:{...monitor,lastRun:{status:'failed',startedAt:'2026-11-12T18:00:00Z',finishedAt:'2026-11-12T18:00:01Z',summary:{evaluated:0},error:'Research evaluation failed safely'}}});
 }));await h.open('monitoring');assert.match(h.element('monitorHealth').textContent,/RUNNING · 0 enabled \/ 1 saved · scan in progress/);
 await h.action('run');assert.match(h.element('monitorStatus').textContent,/Run failed/);assert.match(h.element('monitorRows').innerHTML,/LAST RUN \/ FAILED/);assert.match(h.element('monitorRows').innerHTML,/Research evaluation failed safely/);
 assert(!h.events.some(event=>event.type==='tradescope:research-alerts-changed'));
});

test('Monitor source failures and dangerous names remain safe and independent from optional backend state',async()=>{
 const h=harness(monitoringRoutes((url,options)=>{
  if(url==='/api/research/screens')return response({error:'Screen storage unavailable'},503);
  if(url==='/api/research/monitors')return response({monitors:[{...monitor,name:'<img src=x onerror=bad()>'}],health:{started:true,enabledCount:0,monitorCount:1}});
 }));await h.open('monitoring');
 assert.match(h.element('monitorStatus').textContent,/Screen storage unavailable/);assert.match(h.element('monitorRows').innerHTML,/&lt;img/);assert(!h.element('monitorRows').innerHTML.includes('<img'));
 assert.match(h.element('researchBackendStatus').textContent,/disabled/);assert.equal(h.element('researchBackendSync').disabled,true);
 await h.click('researchBackendSync');assert(!h.requests.some(item=>item.url==='/api/research/backend/sync'));
});

test('Configured Java sync sends the selected symbol only and renders bounded receipt counts',async()=>{
 const h=harness(monitoringRoutes((url,options)=>{
  if(url==='/api/research/backend')return response({configured:true,status:'available',storage:'postgresql'});
  if(url==='/api/research/backend/sync'){assert.deepEqual(JSON.parse(options.body),{symbol:'MSFT'});return response({receipt:{storage:'postgresql',receivedCount:65,upsertedCount:65}});}
 }));await h.open('monitoring');assert.equal(h.element('researchBackendSync').disabled,false);
 h.element('researchSymbol').value='MSFT';await h.click('researchBackendSync');assert.match(h.element('researchBackendStatus').textContent,/MSFT · 65 metric observations/);
 assert(!h.requests.some(item=>item.options.body?.includes('token')));
});

test('Configured but unreachable Java storage requires a new availability check before sync',async()=>{
 const h=harness(monitoringRoutes(url=>url==='/api/research/backend'?response({configured:true,status:'unavailable',storage:'postgresql',error:'Local Java service is unavailable'}):null));
 await h.open('monitoring');assert.equal(h.element('researchBackendSync').disabled,true);assert.match(h.element('researchBackendStatus').textContent,/unavailable/);
 await h.click('researchBackendSync');assert(!h.requests.some(item=>item.url==='/api/research/backend/sync'));
});

test('Operations shell has labeled tabs, disabled opt-in monitor and external setup link with safe relation',()=>{
 for(const id of ['researchTabAtlas','researchPanelAtlas','researchTabMonitoring','researchPanelMonitoring','atlasStatus','monitorStatus','monitorCreate','researchBackendSync'])assert(markup.includes('id="'+id+'"'));
 assert.match(markup,/CREATE DISABLED MONITOR/);assert.match(markup,/LOCAL MONITORING/);assert.match(markup,/MONITORING_ATLAS_STORAGE\.md/);assert.match(markup,/research-operations\.css/);assert.match(markup,/research-operations\.js/);
 assert.match(markup,/rel="noopener noreferrer">SETUP GUIDE/);
});
