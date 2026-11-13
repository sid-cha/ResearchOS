/* Completed-session candlesticks for the local TradeScope Monitor.
 * No external chart dependency, licensed price proxy, fake tick candles, or forecasts.
 * Demo mode retains the original explicitly synthetic replay plot.
 */
(() => {
 'use strict';
 const box=document.getElementById('marketChart');
 const meta=document.getElementById('chartHistoryMeta');
 const readWindow=document.getElementById('chartDayWindow');
 const refresh=document.getElementById('chartHistoryRefresh');
 if(!box||!meta||!readWindow||!refresh)return;
 let context=null,activeKey=null,generation=0,controller=null,shownKey=null;
 const cache=new Map();
 const datePattern=/^\d{4}-\d{2}-\d{2}$/;
 const money=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const volume=n=>Number(n).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1});
 const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function validData(value,symbol,sessions){
  if(value?.schemaVersion!==1||value.symbol!==symbol||value.mode!=='HISTORICAL_COMPLETED_DAILY_BARS'
   ||value.source!=='ALPACA_IEX'||value.feed!=='iex'||value.coverage!=='single-venue'
   ||value.interval!=='1Day'||value.includesLivePrice!==false||value.windowSessions!==sessions
   ||!Array.isArray(value.bars)||value.bars.length>sessions)return false;
  let prior='';
  for(const bar of value.bars){
   if(!datePattern.test(bar.time)||bar.time<=prior)return false;
   if(![bar.open,bar.high,bar.low,bar.close,bar.volume].every(Number.isFinite)
     ||Math.min(bar.open,bar.high,bar.low,bar.close)<=0||bar.low>Math.min(bar.open,bar.close)
     ||bar.high<Math.max(bar.open,bar.close)||bar.high<bar.low||bar.volume<0)return false;
   prior=bar.time;
  }
  return true;
 }
 function sourceLabel(s){
  if(!s){meta.textContent='No completed IEX daily bars loaded.';return;}
  const last=s.asOf||'unavailable',quality=s.quality||{};
  meta.textContent='HISTORICAL / COMPLETED 1D IEX BARS · '+s.bars.length+' SESSIONS · THROUGH '+last+
   ' · SPLIT ADJUSTED · SINGLE VENUE'+(quality.partialHistory||quality.incompleteWindow?' · PARTIAL COVERAGE':'')+
   '. Observed LIVE price above is independent of the daily close. No price prediction.';
 }
 function movingAverage(bars,period){
  return bars.map((b,i)=>{
   if(i+1<period)return null;
   const prev=bars.slice(i-period+1,i+1).reduce((sum,row)=>sum+row.close,0)/period;
   return Number.isFinite(prev)?prev:null;
  });
 }
 function draw(result){
  const bars=result.bars;
  if(!bars.length){
   box.innerHTML='<div class="candle-empty">NO COMPLETED DAILY IEX BARS AVAILABLE FOR THIS SECURITY. CHECK SOURCE ENTITLEMENTS AND PERIOD COVERAGE.</div>';
   sourceLabel(result);return;
  }
  const width=920,height=282,left=12,right=75,top=17,priceBottom=210,volumeTop=223,volumeBottom=252;
  const usable=width-left-right;
  const allHigh=Math.max(...bars.map(b=>b.high)),allLow=Math.min(...bars.map(b=>b.low));
  const spread=Math.max(.01,allHigh-allLow),lo=allLow-spread*.08,hi=allHigh+spread*.08;
  const y=v=>top+(hi-v)/(hi-lo)*(priceBottom-top);
  const x=i=>left+(i+.5)*usable/bars.length;
  const candleWidth=Math.max(1,Math.min(12,usable/bars.length*.63));
  const maxVolume=Math.max(1,...bars.map(b=>b.volume));
  const volumeY=v=>volumeBottom-(v/maxVolume)*(volumeBottom-volumeTop);
  const grid=Array.from({length:5},(_,i)=>{
   const tick=hi-(hi-lo)*i/4,axisY=y(tick);
   return '<line class="candle-grid" x1="'+left+'" x2="'+(width-right)+'" y1="'+axisY.toFixed(2)+'" y2="'+axisY.toFixed(2)+'"/>'+
    '<text class="candle-label" x="'+(width-right+7)+'" y="'+(axisY+3).toFixed(2)+'">'+tick.toFixed(2)+'</text>';
  }).join('');
  const candles=bars.map((b,i)=>{
   const rise=b.close>=b.open,color=rise?'candle-up':'candle-down',cx=x(i),bodyTop=Math.min(y(b.open),y(b.close));
   const bodyHeight=Math.max(1.25,Math.abs(y(b.open)-y(b.close))),title=escapeText(b.time+' · Open '+money(b.open)+
    ' · High '+money(b.high)+' · Low '+money(b.low)+' · Close '+money(b.close)+' · IEX volume '+volume(b.volume));
   return '<g class="'+color+'"><title>'+title+'</title>'+
    '<line x1="'+cx.toFixed(2)+'" x2="'+cx.toFixed(2)+'" y1="'+y(b.high).toFixed(2)+'" y2="'+y(b.low).toFixed(2)+'"/>'+
    '<rect x="'+(cx-candleWidth/2).toFixed(2)+'" y="'+bodyTop.toFixed(2)+'" width="'+candleWidth.toFixed(2)+'" height="'+bodyHeight.toFixed(2)+'"/>'+
    '<rect class="candle-volume" x="'+(cx-candleWidth/2).toFixed(2)+'" y="'+volumeY(b.volume).toFixed(2)+'" width="'+candleWidth.toFixed(2)+'" height="'+(volumeBottom-volumeY(b.volume)).toFixed(2)+'"/></g>';
  }).join('');
  const avg=(period,style)=>{
   const values=movingAverage(bars,period);
   const segments=[];let seq=[];
   for(let i=0;i<values.length;i++){
    if(values[i]===null){if(seq.length>1)segments.push(seq);seq=[];continue;}
    seq.push(x(i).toFixed(2)+','+y(values[i]).toFixed(2));
   }
   if(seq.length>1)segments.push(seq);
   return segments.map(points=>'<polyline class="'+style+'" points="'+points.join(' ')+'"/>').join('');
  };
  const last=bars.at(-1),sma20=movingAverage(bars,20).at(-1),sma50=movingAverage(bars,50).at(-1);
  const last20=bars.slice(-21,-1),avg20=last20.length===20?last20.reduce((sum,b)=>sum+b.volume,0)/20:null;
  const relativeVolume=avg20>0?(last.volume/avg20):null;
  const ticks=[0,.25,.5,.75,1].map(f=>{
   const index=Math.min(bars.length-1,Math.floor(f*(bars.length-1)));
   return '<text class="candle-label" x="'+x(index).toFixed(2)+'" y="271" text-anchor="middle">'+bars[index].time.slice(5)+'</text>';
  }).join('');
  box.innerHTML='<svg class="candle-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+escapeText(result.symbol)+
   ' historical daily IEX candlestick chart with completed sessions, volume, SMA20 and SMA50">'+
   grid+'<line class="candle-divider" x1="'+left+'" y1="217" x2="'+(width-right)+'" y2="217"/>'+
   candles+avg(20,'candle-sma20')+avg(50,'candle-sma50')+ticks+
   '<text class="candle-label" x="12" y="240">VOLUME</text></svg>'+
   '<div class="candle-metrics">'+
   '<span>LAST COMPLETED CLOSE <strong>'+money(last.close)+'</strong></span>'+
   '<span>SMA20 <strong>'+(sma20===null?'UNAVAILABLE':money(sma20))+'</strong></span>'+
   '<span>SMA50 <strong>'+(sma50===null?'UNAVAILABLE':money(sma50))+'</strong></span>'+
   '<span>DAILY VOLUME <strong>'+volume(last.volume)+'</strong></span>'+
   '<span>REL. VOLUME 20 <strong>'+(relativeVolume===null?'UNAVAILABLE':relativeVolume.toFixed(2)+'×')+'</strong></span>'+
   '</div>';
  sourceLabel(result);
 }
 function empty(message){
  box.innerHTML='<div class="candle-empty">'+escapeText(message)+'</div>';
  meta.textContent='Historical completed IEX bars only · no synthetic or inferred candles.';
 }
 async function load({force=false}={}){
  if(!context||context.mode==='DEMO')return;
  const symbol=context.symbol,sessions=Number(readWindow.value)||60,key=symbol+':'+sessions;
  activeKey=key;
  if(!force&&cache.has(key)&&Date.now()-cache.get(key).savedAt<60000){
   if(shownKey!==key){draw(cache.get(key).data);shownKey=key;}
   return;
  }
  controller?.abort();controller=new AbortController();
  const ctl=controller,token=++generation;
  shownKey=null;empty('LOADING COMPLETED DAILY IEX BARS FOR '+symbol+'…');
  try{
   const timeout=setTimeout(()=>ctl.abort(),14000);
   let response;
   try{response=await fetch('/api/chart/daily?'+new URLSearchParams({symbol,sessions:String(sessions)}),{signal:ctl.signal,cache:'no-store'});}
   finally{clearTimeout(timeout);}
   const data=await response.json().catch(()=>({}));
   if(token!==generation||key!==activeKey||ctl.signal.aborted)return;
   if(!response.ok)throw Error(data?.error||'Historical chart source unavailable');
   if(!validData(data,symbol,sessions))throw Error('Provider chart format is incomplete or inconsistent');
   cache.set(key,{data,savedAt:Date.now()});draw(data);shownKey=key;
  }catch(error){
   if(token!==generation||ctl.signal.aborted||key!==activeKey)return;
   empty('HISTORICAL CHART UNAVAILABLE. '+(error.message||'Check source configuration.')+' LIVE PRICE REMAINS AN OBSERVED TRADE, NOT A DAILY BAR.');
  }finally{if(controller===ctl)controller=null;}
 }
 function render(next){
  context=next;
  if(!next||next.mode==='DEMO'){
   controller?.abort();generation++;shownKey=null;activeKey=null;return;
  }
  const key=next.symbol+':'+readWindow.value;
  if(key===shownKey)return;
  if(key===activeKey&&controller)return;
  void load();
 }
 readWindow.addEventListener('change',()=>{shownKey=null;void load();});
 refresh.addEventListener('click',()=>{if(context&&context.mode!=='DEMO')void load({force:true});});
 window.addEventListener('pagehide',()=>{controller?.abort();generation++;});
 window.TradeScopeCandles=Object.freeze({render});
})();
