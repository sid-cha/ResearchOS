/* TradeScope Market Hub — original data-bound research UI.
 * No fabricated quote, chart, fundamental, return or coverage records.
 * Market values come only from same-origin source-labelled APIs.
 */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const enc=encodeURIComponent;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validNum=x=>typeof x==='number'&&Number.isFinite(x);
const compact=n=>!validNum(n)?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(n);
const fmt=(n,d=2)=>validNum(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';
const money=n=>validNum(n)?'$'+fmt(n,2):'—';
const financialValue=(n,unit)=>!validNum(n)?'—':unit==='USD'?('$'+compact(n)):unit==='USD/share'?money(n):unit==='%'?fmt(n,2)+'%':fmt(n,2);
const pct=n=>!validNum(n)?'—':(n>0?'+':'')+fmt(n,2)+'%';
const tone=n=>!validNum(n)?'neutral':n<0?'negative':'positive';
const setStatus=s=>el('notice').textContent=s;
const stored=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback;}catch{return fallback;}};
const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const DEFAULT_METRICS=['price','revenue','revenueGrowth','netIncome','netMargin','eps','grossProfit','assets','operatingCashFlow'];
const state={catalog:null,instruments:[],symbol:'AAPL',view:'overview',activeWatch:null,
 watchlists:[],comparison:stored('ts-compare-selection-v1',['AAPL','MSFT','NVDA','AMZN','META']),
 layout:stored('ts-market-layout-v1',DEFAULT_METRICS),savedSize:stored('ts-chart-size-v1','S'),latestChart:null};
const palette=['#2263e5','#ed7c34','#15918e','#885bc9','#c99526','#ce4b6e','#34868b','#607bb7','#5a9561','#99614c'];
const cache=new Map();
const asset=rec=>rec&&rec.last?rec.last.close:null;
const textIf=v=>v==null?'—':String(v);
async function json(route,opts={}){
 const response=await fetch(route,{cache:'no-store',...opts});
 const parsed=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(parsed.error||'Provider unavailable');
 return parsed;
}
const hub=(route)=>json('/api/market-hub/'+route);
const series=(symbols,range)=>hub('series?symbols='+enc(symbols.join(','))+'&range='+enc(range));
const fin=async(symbol)=>{
 const key='fin:'+symbol;if(cache.has(key))return cache.get(key);
 const p=hub('financials?symbol='+enc(symbol));cache.set(key,p);
 try{return await p;}catch(e){cache.delete(key);throw e;}
};
const recent=(rows)=>Array.isArray(rows)?rows.filter(x=>validNum(x?.value)&&x.fiscalEnd).at(-1)||null:null;
const allowed=()=>new Set([...state.catalog?.equities.map(x=>x.symbol)||[],...state.instruments.map(x=>x.symbol)]);
function plotLines(collection,{height=190,normalized=false}={}){
 const lines=collection.filter(x=>Array.isArray(x.points)&&x.points.length>=2)
  .map(x=>({...x,points:x.points.filter(p=>validNum(p.value)&&typeof p.date==='string').sort((a,b)=>a.date.localeCompare(b.date))}))
  .filter(x=>x.points.length>=2);
 if(!lines.length)return '<div class="empty">Not enough sourced observations to draw a chart.</div>';
 const all=lines.flatMap(x=>x.points.map(p=>p.value));let min=Math.min(...all),max=Math.max(...all);
 if(max===min){min-=Math.max(.5,Math.abs(min)*.02);max+=Math.max(.5,Math.abs(max)*.02);}
 const pad=(max-min)*.075;min-=pad;max+=pad;
 const W=850,H=height,L=49,R=19,T=15,B=31,x0=L,x1=W-R,y0=T,y1=H-B;
 const times=lines.flatMap(x=>x.points.map(p=>Date.parse(p.date+'T00:00:00Z'))).filter(Number.isFinite);
 let lo=Math.min(...times),hi=Math.max(...times);if(lo===hi)hi+=86400000;
 const x=t=>x0+(t-lo)/(hi-lo)*(x1-x0),y=v=>y1-(v-min)/(max-min)*(y1-y0);
 const ticks=[0,1,2,3,4].map(i=>{const yy=y0+(y1-y0)*i/4;const value=max-(max-min)*i/4;
  return '<line class="grid-line" x1="'+x0+'" x2="'+x1+'" y1="'+yy+'" y2="'+yy+'"/>'+
   '<text class="plot-label" x="'+(x0-6)+'" y="'+(yy+3)+'" text-anchor="end">'+esc(normalized?fmt(value,0)+'%':compact(value))+'</text>';
 }).join('');
 const timeLabels=[0,.25,.5,.75,1].map(frac=>{const t=lo+(hi-lo)*frac;
  return '<text class="plot-label" x="'+x(t)+'" y="'+(H-8)+'" text-anchor="middle">'+new Date(t).getUTCFullYear()+
   (hi-lo<370*86400000?' / '+String(new Date(t).getUTCMonth()+1).padStart(2,'0'):'')+'</text>';
 }).join('');
 const paths=lines.map((line,i)=>{
  const color=line.color||palette[i%palette.length];
  const points=line.points.map(p=>x(Date.parse(p.date+'T00:00:00Z')).toFixed(2)+','+y(p.value).toFixed(2));
  const d='M'+points.join('L');
  return '<path fill="none" stroke="'+esc(color)+'" stroke-width="'+(collection.length>1?2:2.7)+'" vector-effect="non-scaling-stroke" d="'+d+'"/>';
 }).join('');
 const last=lines[0].points.at(-1),foot=last?last.date:'';
 const legend=collection.length>1?'<div class="plot-legend">'+lines.map((l,i)=>'<span><i class="legend-dot" style="background:'+
  esc(l.color||palette[i%palette.length])+'"></i>'+esc(l.name||l.symbol||('Series '+(i+1)))+'</span>').join('')+'</div>':'';
 return legend+'<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="'+esc(lines.map(x=>x.name||x.symbol||'Series').join(', '))+
  ' historical observed data ending '+esc(foot)+'">'+ticks+timeLabels+paths+'</svg>';
}
function selectSymbol(symbol){
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))return;
 if(!allowed().has(symbol)){setStatus(symbol+' is not registered. Use the search dropdown to register it first.');return;}
 state.symbol=symbol;renderTickers();
 if(state.view==='dashboard')void dashboard();
 else if(state.view==='financials')void financials();
 else if(state.view==='compare'&&!state.comparison.includes(symbol))addComparison(symbol);
 else changeView('dashboard');
}
function renderTickers(){
 const items=state.instruments.length?state.instruments:state.catalog?.equities||[];
 el('universeCount').textContent=String(items.length);
 el('tickerButtons').innerHTML=items.slice(0,85).map(x=>'<button type="button" data-ticker="'+esc(x.symbol)+'" class="'+
  (x.symbol===state.symbol?'active':'')+'"><span>'+esc(x.symbol)+'</span><small>'+esc((x.name||x.symbol).slice(0,15))+'</small></button>').join('');
}
async function findTickers(input){
 const q=input.trim();if(q.length<2){el('tickerMatches').innerHTML='';return;}
 const locally=state.instruments.filter(x=>(x.symbol+' '+x.name).toLowerCase().includes(q.toLowerCase())).slice(0,10);
 let data=locally;
 try{const results=await json('/api/discovery/search?q='+enc(q)+'&limit=12');
  if(el('tickerSearch').value.trim()!==q)return;
  const merged=new Map(locally.map(x=>[x.symbol,x]));
  for(const item of (results.results||[]))merged.set(item.symbol,item);
  data=[...merged.values()].slice(0,12);
 }catch{}
 const registered=allowed();
 el('tickerMatches').innerHTML=data.length?data.map(x=>'<button type="button" data-search-symbol="'+esc(x.symbol)+'" data-registered="'+
  String(registered.has(x.symbol))+'"><strong>'+esc(x.symbol)+'</strong><small>'+esc(x.name||'Company')+
  (registered.has(x.symbol)?' · Open':' · Register SEC issuer')+'</small></button>').join(''):
 '<div class="micro">No issuer matches found. Search needs the SEC directory connection.</div>';
}
function changeView(key){
 if(!['overview','dashboard','compare','financials','watchlists','screener','themes','macro'].includes(key))return;
 state.view=key;
 document.querySelectorAll('#navTabs [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===key));
 document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+key));
 const load={overview, dashboard,compare,financials,watchlists, themes,macro};
 if(load[key])void load[key]();
 else if(key==='screener')setStatus('The screener covers registered pilot issuers; run it to fetch filed company metrics.');
}
function groupRows(group,symLimit=10){
 const items=state.catalog.etfs.filter(x=>x.group===group).slice(0,symLimit);
 return items;
}
function marketRow(item,bar){
 const ret=bar?.returns?.d1,price=asset(bar);
 return '<div class="market-row"><div><strong>'+esc(item.label)+'</strong><small>'+esc(item.symbol)+'</small></div>'+
  '<div class="price">'+(price!=null?money(price):'—')+'</div><div class="price '+tone(ret)+'">'+pct(ret)+'</div></div>';
}
async function overview(){
 setStatus('Loading sourced, completed-session market proxies…');
 const groups=['US Equity','US Sectors','Fixed Income','Global Markets','Commodities & Currency'];
 el('overviewGroups').innerHTML=groups.map((g,i)=>'<div class="surface"><h3>'+esc(g)+'<small id="groupAsOf'+i+'">Data source pending</small></h3>'+
  '<div id="marketGroup'+i+'" class="market-rows"><div class="empty">Loading…</div></div></div>').join('');
 const all=[];
 for(let i=0;i<groups.length;i++){
  const items=groupRows(groups[i],10);
  try{
   const data=await series(items.map(x=>x.symbol),'1Y');const rows=items.map(x=>marketRow(x,data.values[x.symbol]));
   el('marketGroup'+i).innerHTML=rows.join('');
   el('groupAsOf'+i).textContent='IEX · latest completed session';
   all.push(...items.map(x=>({item:x,bar:data.values[x.symbol]})));
  }catch(e){
   el('marketGroup'+i).innerHTML='<div class="empty">'+esc(e.message)+'</div>';
   el('groupAsOf'+i).textContent='Unavailable';
  }
 }
 const priority=['SPY','QQQ','TLT','GLD'];
 el('overviewStats').innerHTML=priority.map(s=>{
  const o=all.find(x=>x.item.symbol===s),bar=o?.bar;
  return '<article><small>'+esc(o?.item.label||s)+' · '+esc(s)+'</small><strong>'+money(asset(bar))+'</strong><em class="'+
   tone(bar?.returns?.d1)+'">'+pct(bar?.returns?.d1)+'</em><small>'+esc(bar?.asOf||'No source data')+'</small></article>';
 }).join('');
 setStatus(all.length?'Overview shows split-adjusted IEX completed-session ETF proxies. Prices are not index levels or consolidated real-time quotes.':
  'Market-data provider is not configured or is unavailable. No values have been invented.');
}
function card(metric,price,financial){
 const id=metric;let points=[],label=id,unit='',source='',value=null,asOf=null;
 if(id==='price'){
  label='Stock price · completed IEX';points=(price?.bars||[]).map(x=>({date:x.date,value:x.close}));
  const last=price?.last;value=last?.close;asOf=last?.date;unit='USD';source='ALPACA_IEX';
 }else{
  const def=state.catalog.financialMetrics.find(x=>x.id===id);
  label=def?.label||id;unit=def?.unit||'';
  const s=financial?.series?.[id]||[];
  points=s.filter(x=>validNum(x.value)).map(x=>({date:x.fiscalEnd,value:x.value}));const last=s.at(-1);
  value=last?.value;asOf=last?.fiscalEnd;source='SEC_EDGAR_XBRL';
 }
 const shown=id==='price'?money(value):financialValue(value,unit);
 return '<article class="chart-box"><header><h3>'+esc(label)+'</h3><button data-remove="'+esc(id)+
  '" title="Remove chart from layout" aria-label="Remove '+esc(label)+' chart">×</button></header>'+
  '<strong>'+shown+'</strong><small>'+esc(source)+' · '+esc(asOf||'not available')+'</small>'+
  '<div class="plot">'+plotLines([{name:label,points}],{height:170})+'</div></article>';
}
async function dashboard(){
 el('dashboardSymbol').textContent=state.symbol;
 el('dashboardCharts').className='chart-grid size-'+(el('chartSize').value||'S');
 el('dashboardCharts').innerHTML='<div class="empty">Loading data without synthetic fillers…</div>';
 const range=el('dashboardRange').value;
 const [a,b]=await Promise.allSettled([series([state.symbol],range),fin(state.symbol)]);
 const data=a.status==='fulfilled'?a.value.values[state.symbol]:null;
 const facts=b.status==='fulfilled'?b.value:null;
 el('dashboardCharts').innerHTML=state.layout.map(id=>card(id,data,facts)).join('');
 el('dashboardProvenance').textContent='Price: '+(a.status==='fulfilled'?'Alpaca IEX single-venue, completed split-adjusted daily bars.':a.reason.message)+
  ' · Financials: '+(b.status==='fulfilled'?'Annual SEC XBRL observations, filed no later than today.':b.reason.message)+
  ' · Missing records remain unavailable.';
 setStatus('Reusable chart layout; source dates and unavailable metrics are displayed in every card.');
}
async function financials(){
 el('financialSymbol').textContent=state.symbol;
 el('financialTable').innerHTML='<div class="empty">Loading SEC annual XBRL filings…</div>';
 const symbol=state.symbol;
 try{
  const d=await fin(symbol);if(symbol!==state.symbol)return;
  el('financialSource').textContent=esc(d.company||symbol)+' · '+d.source+
   ' · '+d.sourceUrl+' · historical annual periods limited to what SEC reports and filing dates support.';
  const years=[...new Set(Object.values(d.series).flatMap(arr=>arr.map(x=>x.fiscalEnd)))].sort().reverse().slice(0,12);
  const header='<tr><th>Reported metric</th>'+years.map(y=>'<th>'+esc(y)+'</th>').join('')+'</tr>';
  const body=d.metrics.map(metric=>{
   const values=new Map((d.series[metric.id]||[]).map(x=>[x.fiscalEnd,x]));
   return '<tr><td><button type="button" data-finmetric="'+esc(metric.id)+'">'+esc(metric.label)+'</button></td>'+
    years.map(y=>{const val=values.get(y);return '<td title="'+esc(val?.filedAt?'Filed '+val.filedAt+' · '+val.tag:'No compatible filing')+'">'+
     financialValue(val?.value,metric.unit)+'</td>';}).join('')+'</tr>';
  }).join('');
  el('financialTable').innerHTML='<table class="data-table"><thead>'+header+'</thead><tbody>'+body+'</tbody></table>';
  state.latestFinancial=d;renderFinancialDetail('revenue');
  setStatus('Financial statements show SEC filing dates and annual fiscal periods; no analyst consensus or intraday values.');
 }catch(e){el('financialTable').innerHTML='<div class="empty">'+esc(e.message)+'</div>';el('financialSource').textContent='SEC original data unavailable.';}
}
function renderFinancialDetail(metricId){
 const d=state.latestFinancial,metric=d?.metrics?.find(x=>x.id===metricId);if(!metric)return;
 el('financialDetailTitle').textContent=metric.label+' · '+state.symbol+' · annual reported observations';
 el('financialDetailPlot').innerHTML=plotLines([{name:metric.label,points:(d.series[metricId]||[]).filter(x=>validNum(x.value)).map(x=>({date:x.fiscalEnd,value:x.value}))}],{height:205});
}
function addComparison(symbol){
 if(state.comparison.includes(symbol)){setStatus('Already included: '+symbol);return;}
 if(state.comparison.length>=10){setStatus('Compare up to 10 instruments. Remove a symbol first.');return;}
 if(!allowed().has(symbol)){setStatus('Register a supported issuer before comparing '+symbol);return;}
 state.comparison.push(symbol);void compare();
}
function renderCompareControls(){
 el('compareChips').innerHTML=state.comparison.map(s=>'<button type="button" data-compare-remove="'+esc(s)+'">'+esc(s)+' ×</button>').join('');
 const collection=state.instruments.length?state.instruments:state.catalog.equities;
 el('compareAdd').innerHTML='<option value="">Add registered ticker…</option>'+collection.filter(x=>!state.comparison.includes(x.symbol)).
  map(x=>'<option value="'+esc(x.symbol)+'">'+esc(x.symbol)+'</option>').join('');
}
async function compare(){
 renderCompareControls();el('compareChart').innerHTML='<div class="empty">Building a sourced comparison from a shared observation window…</div>';
 if(state.comparison.length<2){el('compareChart').innerHTML='<div class="empty">Select two or more instruments.</div>';return;}
 try{
  const d=await series(state.comparison,el('compareRange').value),raw=state.comparison.map(s=>({symbol:s,bars:d.values[s]?.bars||[]}));
  state.latestComparison={data:d,commonStart:null};
  const present=raw.filter(x=>x.bars.length>1);
  if(present.length<2)throw Error('At least two eligible market histories are required.');
  const commonStart=present.map(x=>x.bars[0].date).sort().at(-1);state.latestComparison.commonStart=commonStart;
  const datasets=present.map((x,i)=>{
   const arr=x.bars.filter(b=>b.date>=commonStart);
   if(arr.length<2)return {name:x.symbol,points:[]};
   const base=arr[0].close;
   return {name:x.symbol,color:palette[i%palette.length],points:arr.map(b=>({date:b.date,value:(b.close/base-1)*100}))};
  });
  const excluded=raw.filter(x=>!present.includes(x)).map(x=>x.symbol);
  el('compareChart').innerHTML=plotLines(datasets,{height:330,normalized:true});
  el('compareSource').textContent='Observed common-start price comparison · '+commonStart+
   ' · IEX single venue · split-adjusted, not dividends/total-return. '+
   (excluded.length?'Missing data: '+excluded.join(', '):'')+(d.hasMore?' Provider pagination is incomplete.':'');
  setStatus('Comparison uses actual available completed-session bar observations, without price interpolation.');
 }catch(e){el('compareChart').innerHTML='<div class="empty">'+esc(e.message)+'</div>';el('compareSource').textContent='Comparison data unavailable.';}
}
async function watchlists(){
 el('savedWatchlists').innerHTML='<div class="empty">Loading local watchlists…</div>';
 try{
  const d=await json('/api/discovery/watchlists');state.watchlists=d.watchlists||[];
  el('savedWatchlists').innerHTML=state.watchlists.length?state.watchlists.map(w=>'<button type="button" data-watch="'+esc(w.id)+
   '" class="'+(state.activeWatch?.id===w.id?'active':'')+'">'+esc(w.name)+
   ' · '+esc(w.symbols.length)+' symbols</button>').join(''):'<div class="empty">No saved lists. Create your first collection.</div>';
 }catch(e){el('savedWatchlists').innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
}
async function watchSave(e){
 e.preventDefault();
 const name=el('watchName').value.trim(),symbols=[...new Set(el('watchSymbols').value.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
 if(!name||symbols.length>100||symbols.some(s=>!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s))){el('watchStatus').textContent='Choose a name and at most 100 valid symbols.';return;}
 const body={name,symbols};
 const existing=state.activeWatch;
 if(existing)Object.assign(body,{id:existing.id,expectedRevision:existing.revision});
 try{
  const r=await json('/api/discovery/watchlist',{method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  state.activeWatch=r.watchlist;el('watchStatus').textContent='Saved to the existing local universe store · revision '+r.watchlist.revision;
  el('watchDelete').disabled=false;await watchlists();
 }catch(err){el('watchStatus').textContent=err.message;}
}
function newWatch(){state.activeWatch=null;el('watchName').value='';el('watchSymbols').value='';el('watchDelete').disabled=true;el('watchStatus').textContent='Create a new collection of registered symbols.';}
async function deleteWatch(){
 const w=state.activeWatch;if(!w)return;
 try{
  await json('/api/discovery/watchlist?id='+enc(w.id)+'&expectedRevision='+w.revision,{method:'DELETE'});
  newWatch();await watchlists();el('watchStatus').textContent='Watchlist deleted from local universe store.';
 }catch(e){el('watchStatus').textContent=e.message;}
}
async function screen(){
 const floorRevenue=Number(el('screenRevenue').value),floorGrowth=Number(el('screenGrowth').value),floorMargin=Number(el('screenMargin').value);
 if(![floorRevenue,floorGrowth,floorMargin].every(Number.isFinite)){el('screenStatus').textContent='Choose numeric screen limits.';return;}
 const symbols=state.catalog.equities.map(x=>x.symbol);let index=0,results=[];
 el('screenStatus').textContent='Checking '+symbols.length+' registered pilot issuers against SEC annual filings…';
 async function worker(){while(index<symbols.length){
  const symbol=symbols[index++];
  try{
   const data=await fin(symbol),rev=recent(data.series.revenue)?.value,gr=recent(data.series.revenueGrowth)?.value,
     margin=recent(data.series.netMargin)?.value;
   results.push({symbol,name:data.company||symbol,rev,growth:gr,margin,
    complete:validNum(rev)&&validNum(gr)&&validNum(margin)});
  }catch(e){results.push({symbol,name:symbol,rev:null,growth:null,margin:null,error:e.message,complete:false});}
 }}
 await Promise.all([worker(),worker()]);
 const matched=results.filter(x=>x.complete&&x.rev/1e9>=floorRevenue&&x.growth>=floorGrowth&&x.margin>=floorMargin);
 const missing=results.filter(x=>!x.complete);
 const rows=matched.sort((a,b)=>b.rev-a.rev).map(x=>'<tr><td><button data-screen-symbol="'+esc(x.symbol)+'" class="symbol">'+
  esc(x.symbol)+'</button> · '+esc(x.name)+'</td><td>$'+compact(x.rev)+'</td><td class="'+tone(x.growth)+'">'+
  pct(x.growth)+'</td><td>'+pct(x.margin)+'</td></tr>').join('');
 el('screenResult').innerHTML='<table class="data-table"><thead><tr><th>Issuer</th><th>Annual Revenue</th><th>Revenue YoY</th>'+
  '<th>Net Margin</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  (!rows?'<div class="empty">No complete-data issuers meet all three filters.</div>':'');
 el('screenStatus').textContent=matched.length+' of '+symbols.length+' pilot issuers met the criteria; '+
  missing.length+' had incomplete or unavailable SEC fields and were excluded (not treated as zero).';
 setStatus('Screener evaluated only SEC-filing facts for the 8 seeded companies, not 5,000 public securities.');
}
const tablePerf=(item,data)=>{
 const bar=data?.values?.[item.symbol],r=bar?.returns||{},last=bar?.last;
 const stats=['d1','d5','m1','ytd','y1','y3'].map(k=>'<td class="'+tone(r[k])+'">'+pct(r[k])+'</td>').join('');
 const price=asset(bar),week=bar?.range52w;
 const low=week?.low,high=week?.high;
 const pos=validNum(low)&&validNum(high)&&high>low&&validNum(price)?Math.min(100,Math.max(0,100*(price-low)/(high-low))):0;
 return '<tr><td><strong>'+esc(item.label)+'</strong><div class="micro">'+esc(item.symbol)+'</div></td><td>'+
  (validNum(price)?money(price):'—')+'</td>'+stats+
  '<td>'+ (bar?.dayRange?money(bar.dayRange.low)+' – '+money(bar.dayRange.high):'—')+'</td>'+
  '<td>'+(week?money(week.low)+' – '+money(week.high):'—')+
  '<div class="cell-bar" style="--bar:'+pos.toFixed(0)+'%"></div></td></tr>';
};
async function themes(){
 const group=el('themeGroup').value||state.catalog.groups[0],items=state.catalog.etfs.filter(x=>x.group===group);
 el('themeTable').innerHTML='<div class="empty">Loading historical ETF price returns…</div>';
 if(!items.length)return;
 try{
  const d=await series(items.map(x=>x.symbol),'3Y');state.latestThemes={group,items,data:d};
  el('themeSource').textContent='Source: Alpaca '+d.feed+' single-venue historical bars · split-adjusted close returns, not dividend total returns. Last completed session only · '+
   (d.hasMore?'Provider data truncated; some long lookbacks unavailable.':'No intraday quote claimed.')+
   ' · ETF categories are editorial proxies.';
  const header='<tr><th>Theme / ETF</th><th>Close</th><th>1 day</th><th>5 days</th><th>1 month</th><th>YTD</th><th>1 year</th><th>3 years</th><th>Day range</th><th>52-week range</th></tr>';
  el('themeTable').innerHTML='<table class="data-table"><thead>'+header+'</thead><tbody>'+
   items.map(x=>tablePerf(x,d)).join('')+'</tbody></table>';
  setStatus(group+' ETFs show actual completed-session observations. Missing provider history remains blank.');
 }catch(e){
  el('themeTable').innerHTML='<div class="empty">'+esc(e.message)+'</div>';
  el('themeSource').textContent='ETF returns unavailable. Source licensing and API entitlements are required.';
 }
}
async function macro(){
 const group=el('macroGroup').value,years=Number(el('macroYears').value);
 const metrics=state.catalog.macroSeries.filter(x=>x.group===group);
 el('macroCards').innerHTML=metrics.map(m=>'<article class="chart-box"><header><h3>'+esc(m.label)+
  '</h3></header><strong id="macroValue-'+m.id+'">—</strong><small id="macroDate-'+m.id+'">Loading official observations…</small>'+
  '<div class="plot" id="macroPlot-'+m.id+'"></div></article>').join('');
 await Promise.all(metrics.map(async m=>{
  try{
   const d=await hub('macro?id='+enc(m.id)+'&years='+years),value=d.latest?.value;
   el('macroValue-'+m.id).textContent=validNum(value)?fmt(value,2)+(m.unit==='%'?'%':''):'—';
   el('macroDate-'+m.id).textContent='FRED current revision · '+(d.latest?.date||'No observations')+' · '+m.unit;
   el('macroPlot-'+m.id).innerHTML=plotLines([{name:m.label,points:d.history.map(x=>({date:x.date,value:x.value}))}],{height:175});
  }catch(e){
   el('macroDate-'+m.id).textContent=e.message;el('macroPlot-'+m.id).innerHTML='<div class="empty">No sourced history available.</div>';
  }
 }));
 setStatus('FRED macro history is current-revision data, not historical ALFRED published-vintage replay.');
}
async function init(){
 try{
  state.catalog=await hub('catalog');
  const instrument=await json('/api/discovery/instruments').catch(()=>({instruments:state.catalog.equities}));
  state.instruments=instrument.instruments||state.catalog.equities;
  state.layout=(Array.isArray(state.layout)?state.layout:DEFAULT_METRICS).filter(x=>x==='price'||state.catalog.financialMetrics.some(y=>y.id===x));
  state.comparison=(Array.isArray(state.comparison)?state.comparison:[]).filter((x,i,arr)=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(x)&&arr.indexOf(x)===i).slice(0,10);
  if(!state.comparison.length)state.comparison=['AAPL','MSFT'];
  if(!state.layout.length)state.layout=[...DEFAULT_METRICS];
  if(!['S','M','L'].includes(state.savedSize))state.savedSize='S';
  el('chartSize').value=state.savedSize;
  el('dashboardAdd').innerHTML='<option value="">Choose metric…</option><option value="price">Stock price</option>'+
   state.catalog.financialMetrics.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.label)+'</option>').join('');
  el('themeGroup').innerHTML=state.catalog.groups.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('');
  el('themeGroup').value='Technology Themes';
  el('compareAdd').innerHTML='<option value="">Add ticker…</option>';
  el('providerStatus').textContent='IEX '+(state.catalog.credentials.marketDataConfigured?'configured':'not configured')+
   ' · FRED '+(state.catalog.credentials.fredConfigured?'configured':'not configured');
  el('sourceMode').textContent='SEC · IEX · FRED';
  renderTickers();changeView('overview');
 }catch(e){setStatus('Market hub initialization failed: '+e.message);}
}

function downloadCsv(filename,headers,rows){
 const csv=[headers,...rows].map(row=>row.map(v=>{
  const raw=v==null?'':String(v);return '"'+raw.replace(/"/g,'""')+'"';
 }).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCompare(){
 const entry=state.latestComparison;if(!entry?.data){setStatus('Load a comparison before exporting.');return;}
 const {data,commonStart}=entry;
 const symbols=data.requested||state.comparison,days=[...new Set(symbols.flatMap(s=>(data.values[s]?.bars||[]).filter(b=>!commonStart||b.date>=commonStart).map(b=>b.date)))].sort();
 const index=new Map(symbols.map(s=>[s,new Map((data.values[s]?.bars||[]).map(b=>[b.date,b.close]))]));
 downloadCsv('tradescope-compare-'+data.range+'.csv',['Date',...symbols.map(x=>x+' split-adjusted IEX close')],
  days.map(day=>[day,...symbols.map(s=>index.get(s)?.get(day)??null)]));
 setStatus('Exported sourced daily prices (not normalized returns). Market-data redistribution rights remain provider-dependent.');
}
function exportFinancial(){
 const d=state.latestFinancial;if(!d){setStatus('Load an SEC financial statement before exporting.');return;}
 const days=[...new Set(Object.values(d.series).flatMap(arr=>arr.map(x=>x.fiscalEnd)))].sort();
 const indexed=new Map(d.metrics.map(m=>[m.id,new Map((d.series[m.id]||[]).map(x=>[x.fiscalEnd,x]))]));
 downloadCsv('tradescope-sec-'+d.symbol+'.csv',['Fiscal end',...d.metrics.map(m=>m.label+' ['+m.unit+']'), 'SEC source'],
  days.map(day=>[day,...d.metrics.map(m=>indexed.get(m.id)?.get(day)?.value??null),d.sourceUrl]));
 setStatus('Exported filed SEC annual records, with dates and source URL; missing metrics remain empty.');
}
function exportThemes(){
 const entry=state.latestThemes;if(!entry){setStatus('Load a theme group before exporting.');return;}
 const {group,items,data}=entry;const columns=['d1','d5','m1','ytd','y1','y3'];
 downloadCsv('tradescope-etfs-'+group.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.csv',
  ['ETF theme','Symbol','IEX last completed date','IEX close USD',...columns.map(x=>x+' price change %'),'Day low','Day high','52-week low','52-week high','Source'],
  items.map(x=>{const v=data.values[x.symbol];return [x.label,x.symbol,v?.asOf||null,v?.last?.close??null,
   ...columns.map(k=>v?.returns?.[k]??null),v?.dayRange?.low??null,v?.dayRange?.high??null,
   v?.range52w?.low??null,v?.range52w?.high??null,data.source]}));
 setStatus('Exported sourced ETF price research, with missing values blank. Do not redistribute without provider authorization.');
}
el('compareSave').addEventListener('click',()=>{
 persist('ts-compare-selection-v1',state.comparison);
 setStatus('Comparison symbols saved in this browser for future research sessions.');
});
el('compareExport').addEventListener('click',exportCompare);
el('financialExport').addEventListener('click',exportFinancial);
el('themeExport').addEventListener('click',exportThemes);
el('navTabs').addEventListener('click',e=>{const target=e.target.closest('[data-view]');if(target)changeView(target.dataset.view);});
el('tickerButtons').addEventListener('click',e=>{const x=e.target.closest('[data-ticker]');if(x)selectSymbol(x.dataset.ticker);});
let searchTimeout=null;
el('tickerSearch').addEventListener('input',e=>{clearTimeout(searchTimeout);searchTimeout=setTimeout(()=>{void findTickers(e.target.value);},330);});
el('tickerMatches').addEventListener('click',async e=>{
 const b=e.target.closest('[data-search-symbol]');if(!b)return;
 const symbol=b.dataset.searchSymbol;
 if(b.dataset.registered!=='true'){
  setStatus('Registering '+symbol+' from SEC directory…');
  try{const d=await json('/api/discovery/register',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({symbol})});
   state.instruments=[...state.instruments.filter(x=>x.symbol!==d.instrument.symbol),d.instrument];
  }catch(e){setStatus(e.message);return;}
 }
 el('tickerSearch').value='';el('tickerMatches').innerHTML='';selectSymbol(symbol);
});
el('modeSwitch').addEventListener('click',()=>{
 const root=document.documentElement;const next=root.dataset.theme==='dark'?'light':'dark';
 root.dataset.theme=next;persist('ts-market-theme-v1',next);
});
document.documentElement.dataset.theme=stored('ts-market-theme-v1','light')==='dark'?'dark':'light';
el('refreshOverview').addEventListener('click',()=>void overview());
el('dashboardRange').addEventListener('change',()=>void dashboard());
el('chartSize').addEventListener('change',()=>{state.savedSize=el('chartSize').value;persist('ts-chart-size-v1',state.savedSize);void dashboard();});
el('dashboardAdd').addEventListener('change',e=>{const id=e.target.value;if(!id||state.layout.includes(id))return;
 state.layout.push(id);e.target.value='';void dashboard();});
el('dashboardCharts').addEventListener('click',e=>{const id=e.target.closest('[data-remove]')?.dataset.remove;
 if(!id)return;state.layout=state.layout.filter(x=>x!==id);void dashboard();});
el('dashboardSave').addEventListener('click',()=>{persist('ts-market-layout-v1',state.layout);setStatus('Dashboard metric layout saved in this browser and reused across supported tickers.');});
el('financialRefresh').addEventListener('click',()=>{cache.delete('fin:'+state.symbol);void financials();});
el('financialTable').addEventListener('click',e=>{const id=e.target.closest('[data-finmetric]')?.dataset.finmetric;if(id)renderFinancialDetail(id);});
el('compareAdd').addEventListener('change',e=>{if(e.target.value)addComparison(e.target.value);e.target.value='';});
el('compareChips').addEventListener('click',e=>{const id=e.target.closest('[data-compare-remove]')?.dataset.compareRemove;
 if(id){state.comparison=state.comparison.filter(s=>s!==id);void compare();}});
el('compareRange').addEventListener('change',()=>void compare());el('compareRefresh').addEventListener('click',()=>void compare());
el('watchEditForm').addEventListener('submit',watchSave);el('watchNew').addEventListener('click',newWatch);
el('watchReload').addEventListener('click',()=>void watchlists());el('watchDelete').addEventListener('click',()=>void deleteWatch());
el('savedWatchlists').addEventListener('click',e=>{const id=e.target.closest('[data-watch]')?.dataset.watch;
 const w=state.watchlists.find(x=>x.id===id);if(!w)return;state.activeWatch=w;
 el('watchName').value=w.name;el('watchSymbols').value=w.symbols.join(', ');el('watchDelete').disabled=false;void watchlists();});
el('screenRun').addEventListener('click',()=>void screen());el('screenResult').addEventListener('click',e=>{
 const symbol=e.target.closest('[data-screen-symbol]')?.dataset.screenSymbol;if(symbol)selectSymbol(symbol);});
el('themeGroup').addEventListener('change',()=>void themes());el('themeRefresh').addEventListener('click',()=>void themes());
el('macroGroup').addEventListener('change',()=>void macro());el('macroYears').addEventListener('change',()=>void macro());
el('macroRefresh').addEventListener('click',()=>void macro());
void init();
})();