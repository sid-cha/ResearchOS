/** Pure analytics. No LLM-generated causal claims and no future data leakage. */
const valid = x => typeof x === 'number' && Number.isFinite(x);
const round = (n, places=4) => valid(n) ? Number(n.toFixed(places)) : null;
function sma(xs,n){return xs.length>=n? xs.slice(-n).reduce((a,b)=>a+b,0)/n:null;}
function emaSeries(xs,n){if(xs.length<n)return [];const k=2/(n+1);let out=xs.slice(0,n).reduce((a,b)=>a+b,0)/n;const series=[out];for(let i=n;i<xs.length;i++){out=xs[i]*k+out*(1-k);series.push(out);}return series;}
export function technicalIndicators(raw){
  const bars=[...raw].filter(x=>valid(Number(x.c))&&Number(x.c)>0&&valid(Number(x.h))&&valid(Number(x.l))&&valid(Number(x.v))).sort((a,b)=>String(a.t).localeCompare(String(b.t)));
  const c=bars.map(b=>Number(b.c)), v=bars.map(b=>Number(b.v));
  let rsi=null;
  if(c.length>=15){let gains=0,losses=0;for(let i=c.length-14;i<c.length;i++){const d=c[i]-c[i-1];gains+=Math.max(0,d);losses+=Math.max(0,-d);}rsi=losses===0?(gains===0?50:100):100-100/(1+gains/losses);}
  let macd=null,signal=null;
  if(c.length>=35){const fast=emaSeries(c,12),slow=emaSeries(c,26);const offset=26-12;const diff=slow.map((s,i)=>fast[i+offset]-s);const sig=emaSeries(diff,9);macd=diff.at(-1);signal=sig.at(-1);}
  let atr=null;if(bars.length>=15){const ranges=[];for(let i=1;i<bars.length;i++){const b=bars[i],prior=Number(bars[i-1].c);ranges.push(Math.max(Number(b.h)-Number(b.l),Math.abs(Number(b.h)-prior),Math.abs(Number(b.l)-prior)));}atr=sma(ranges,14);}
  const previous=v.length>=21?sma(v.slice(0,-1),20):null;
  return {asOf:bars.at(-1)?.t??null,barsCount:bars.length,close:round(c.at(-1)),sma20:round(sma(c,20)),sma50:round(sma(c,50)),rsi14:round(rsi,2),macd:round(macd),macdSignal:round(signal),atr14:round(atr),volumeRatio20:round(previous>0?v.at(-1)/previous:null,2),coverage:'Price/volume indicators calculated from provider bars; feed coverage may be incomplete.'};
}
function dayET(iso){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function dateKey(bar){return String(bar.t).slice(0,10);}
const pct=(a,b)=> b>0? (a/b-1)*100 : null;
/** Conservative close-to-close proxy: compares closes across *completed* sessions after an event's ET calendar day. */
export function eventStudy(eventTime, symbolBars, benchmarkBars, now=new Date()){
  const ts=new Date(eventTime);if(!Number.isFinite(+ts)||ts>now)throw new Error('Event time must be a past ISO timestamp');
  const eventDay=dayET(ts.toISOString()), today=dayET(now.toISOString());
  const good=raw=>raw.filter(b=>valid(Number(b.c))&&Number(b.c)>0&&dateKey(b)<today).sort((a,b)=>dateKey(a).localeCompare(dateKey(b)));
  const stock=good(symbolBars), bench=new Map(good(benchmarkBars).map(b=>[dateKey(b),b]));
  const paired=stock.filter(b=>bench.has(dateKey(b))).map(b=>({date:dateKey(b),s:Number(b.c),m:Number(bench.get(dateKey(b)).c),volume:Number(b.v)||0}));
  const prev=paired.filter(x=>x.date<=eventDay).at(-1);
  const later=paired.filter(x=>x.date>eventDay);
  if(!prev||!later.length){return {status:'insufficient_data',eventTime:ts.toISOString(),eventDay,reason:'Need a complete matching pre-event session and at least one completed post-event session for stock and benchmark.',horizons:[],method:'daily-close proxy'}}
  const horizons=[1,3,5].map(h=>{const k=later[h-1];if(!k)return {sessions:h,status:'pending'};const s=pct(k.s,prev.s),m=pct(k.m,prev.m);return {sessions:h,status:'observed',date:k.date,stockReturnPct:round(s,2),benchmarkReturnPct:round(m,2),relativeReturnPct:round(s-m,2)};});
  const baseline=paired.filter(x=>x.date<=eventDay).slice(-21,-1).map(x=>x.volume).filter(x=>x>0);
  const firstVolume=later[0].volume;const volAvg=baseline.length>=10? baseline.reduce((a,b)=>a+b,0)/baseline.length:null;
  return {status:'observed',eventTime:ts.toISOString(),eventDay,referenceSession:prev.date,firstPostEventSession:later[0].date,horizons,firstSessionVolumeRelative20:round(volAvg>0?firstVolume/volAvg:null,2),method:'Daily close-to-close proxy versus SPY; excludes current unfinished ET session; no causal attribution',limitations:['After-hours events and same-day intraday reactions are not resolved by daily bars.','Benchmarked returns are associations, not proof that an event caused a price move.','Corporate actions, contemporaneous news and changing market exposure may confound the result.']};
}
export function normalizeNews(payload){return (payload?.news||[]).map(x=>({id:`alpaca:${x.id}`,type:'COMPANY_NEWS',category:'CORPORATE',headline:String(x.headline||'Untitled'),occurredAt:null,publishedAt:x.created_at||null,providerFirstSeenAt:x.created_at||null,ingestedAt:new Date().toISOString(),source:'Alpaca News',sourceUrl:safeUrl(x.url),summary:String(x.summary||'').slice(0,480),symbols:Array.isArray(x.symbols)?x.symbols.slice(0,20):[],evidenceLevel:'published_news',location:null}));}
export function normalizeUsgs(data){return (data?.features||[]).map(x=>({id:`usgs:${x.id}`,type:'EARTHQUAKE',category:'NATURAL',headline:String(x.properties?.title||'Earthquake'),occurredAt:x.properties?.time?new Date(x.properties.time).toISOString():null,publishedAt:x.properties?.updated?new Date(x.properties.updated).toISOString():null,providerFirstSeenAt:null,ingestedAt:new Date().toISOString(),source:'USGS',sourceUrl:safeUrl(x.properties?.url),summary:`Magnitude ${x.properties?.mag??'unknown'}; depth ${x.geometry?.coordinates?.[2]??'?'} km.`,symbols:[],evidenceLevel:'authoritative_event',location:{latitude:x.geometry?.coordinates?.[1]??null,longitude:x.geometry?.coordinates?.[0]??null},magnitude:x.properties?.mag??null}));}
export function normalizeNasa(data){return (data?.events||[]).map(x=>({id:`eonet:${x.id}`,type:String(x.categories?.[0]?.title||'NATURAL_EVENT').toUpperCase().replace(/[^A-Z0-9]+/g,'_'),category:'NATURAL',headline:String(x.title||'Natural event'),occurredAt:x.geometry?.[0]?.date||null,publishedAt:null,providerFirstSeenAt:null,ingestedAt:new Date().toISOString(),source:'NASA EONET',sourceUrl:safeUrl(x.link),summary:String(x.description||x.sources?.[0]?.id||'NASA event record').slice(0,480),symbols:[],evidenceLevel:'authoritative_event',location: x.geometry?.[0]?.coordinates?.length===2?{longitude:x.geometry[0].coordinates[0],latitude:x.geometry[0].coordinates[1]}:null}));}
export function normalizeGdelt(data){return (data?.articles||[]).map((x,i)=>({id:`gdelt:${i}:${String(x.seendate||'')}`,type:'GEOPOLITICAL_REPORT',category:'GEOPOLITICAL',headline:String(x.title||'Report'),occurredAt:null,publishedAt:parseGdeltDate(x.seendate),providerFirstSeenAt:parseGdeltDate(x.seendate),ingestedAt:new Date().toISOString(),source:`GDELT / ${String(x.domain||'publisher')}`,sourceUrl:safeUrl(x.url),summary:'News coverage candidate. Not verified as an event or linked to a listed security.',symbols:[],evidenceLevel:'media_report',location:null}));}
function parseGdeltDate(value){if(typeof value!=='string')return null;const m=value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);return m?`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`:null;}
function safeUrl(x){try{const u=new URL(x);return u.protocol==='https:'||u.protocol==='http:'?u.href:null}catch{return null}}
/** P1 baseline forecast, NOT a trained directional model. EWMA volatility and walk-forward MAE. */
export function volatilityBaseline(raw,{lambda=0.94,validationSessions=25}={}){
 const bars=[...raw].filter(x=>Number.isFinite(Number(x.c))&&Number(x.c)>0).sort((a,b)=>String(a.t).localeCompare(String(b.t)));
 const returns=[];for(let i=1;i<bars.length;i++)returns.push(Math.log(Number(bars[i].c)/Number(bars[i-1].c)));
 if(returns.length<45)return {status:'insufficient_data',minimumBars:46,observedBars:bars.length};
 let variance=returns.slice(0,20).reduce((acc,r)=>acc+r*r,0)/20;
 const forecasts=[];for(let i=20;i<returns.length;i++){const projected=Math.sqrt(Math.max(variance,0));forecasts.push({predicted:projected,actual:Math.abs(returns[i])});variance=lambda*variance+(1-lambda)*returns[i]*returns[i];}
 // Forecast next-session sigma as of the final observed return, not using a future return.
 const validation=forecasts.slice(-Math.min(validationSessions,forecasts.length));
 const mae=validation.reduce((s,x)=>s+Math.abs(x.predicted-x.actual),0)/validation.length;
 return {status:'baseline',asOf:bars.at(-1).t,volatilityEstimatePct:round(Math.sqrt(variance)*100,2),validationSessions:validation.length,walkForwardAbsReturnMaePct:round(mae*100,2),method:'EWMA(0.94) one-session log-return volatility baseline',interpretation:'Volatility magnitude estimate, not a price direction or reliable probability of a specific event. MAE evaluated against subsequently observed absolute returns using past-only features.'};
}
