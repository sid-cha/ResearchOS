/** Source-backed exploratory thematic analogues, never causal, predictive or cross-provider exposure inference.
 * This module uses bounded LIVE provider result lists, not a complete archival backtest.
 */
const THEMES=Object.freeze(['corporate','news','geopolitical','natural']);
const TOPICS=Object.freeze(['sanctions','conflict','supply']);
const stop=new Set(['the','and','for','with','from','that','this','company','corporation','inc','incorporated','filing','report','reports','official','issued','financial','results','form','issuer','group','during','current','other']);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validSymbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(value);
const timeOf=event=>{
 const occurred=event.occurredAt;
 if(typeof occurred==='string'&&Number.isFinite(Date.parse(occurred)))return {value:new Date(occurred).toISOString(),basis:'occurred_at'};
 const published=event.publishedAt;
 if(typeof published==='string'&&Number.isFinite(Date.parse(published)))return {value:new Date(published).toISOString(),basis:'publication_or_acceptance'};
 return null;
};
const tokens=value=>new Set((String(value||'').toLowerCase().match(/[a-z]{4,}/g)||[]).filter(word=>!stop.has(word)).slice(0,60));
const overlap=(a,b)=>{
 const left=tokens(a),right=tokens(b);let matched=0;
 for(const word of left)if(right.has(word))matched++;
 return left.size&&right.size?matched/Math.max(left.size,right.size):0;
};
const safeLink=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const normalize=(item,theme)=>{
 if(!item||typeof item!=='object'||typeof item.id!=='string'||item.id.length>180||!item.id||typeof(item.headline??item.title)!=='string')return null;
 const date=timeOf(item);if(!date)return null;
 const title=String(item.headline??item.title).slice(0,350);
 const type=String(item.form||item.type||'UNCLASSIFIED').slice(0,70);
 return {id:item.id,title,headline:title,type,form:item.form||null,category:theme.toUpperCase(),
  source:String(item.source||'SOURCE').slice(0,120),sourceUrl:safeLink(item.sourceUrl),
  occurredAt:date.basis==='occurred_at'?date.value:null,publishedAt:date.basis==='publication_or_acceptance'?date.value:null,
  comparisonTime:date.value,timeBasis:date.basis,
  symbols:Array.isArray(item.symbols)?item.symbols.filter(validSymbol).slice(0,12):[],
  evidenceLevel:String(item.evidenceLevel||'metadata_or_report').slice(0,80),
  limitations:theme==='corporate'?'Filing form and metadata do not establish a specific disclosed economic event.':theme==='geopolitical'?'Media coverage does not prove a reported event occurred.':null};
};
export function rankThematicAnalogues(events,{eventId,theme,limit=5,now=Date.now()}={}){
 if(!THEMES.includes(theme)||!Number.isSafeInteger(limit)||limit<1||limit>10)throw fail('Choose a supported theme and a bounded match limit.');
 if(typeof eventId!=='string'||eventId.length>180||!eventId)throw fail('Select a source-backed theme event.');
 const clock=Number(now);if(!Number.isFinite(clock))throw fail('Research clock is unavailable',500);
 const seen=new Map();let total=0;
 for(const item of (Array.isArray(events)?events:[]).slice(0,100)){
  total++;const entry=normalize(item,theme);if(!entry||Date.parse(entry.comparisonTime)>clock)continue;
  if(!seen.has(entry.id)||seen.get(entry.id).comparisonTime<entry.comparisonTime)seen.set(entry.id,entry);
 }
 const clean=[...seen.values()].sort((a,b)=>b.comparisonTime.localeCompare(a.comparisonTime)||a.id.localeCompare(b.id));
 const selected=clean.find(item=>item.id===eventId);
 if(!selected)throw fail('Selected event is not present in the current sourced theme list; reload.',404);
 const candidates=clean.filter(item=>item.id!==selected.id&&item.comparisonTime<selected.comparisonTime);
 const matches=candidates.map(item=>{
  const sameType=item.type===selected.type,similarity=Number((0.65*(sameType?1:0)+0.35*overlap(selected.headline,item.headline)).toFixed(3));
  return {event:item,similarity,matchedFeatures:[
   {feature:'reported_source_type',selected:selected.type,candidate:item.type,weight:0.65,score:sameType?1:0},
   {feature:'title_token_overlap',selected:'Sourced headlines',candidate:'Sourced headlines',weight:0.35,score:Number(overlap(selected.headline,item.headline).toFixed(3))}
  ],differences:[item.timeBasis!==selected.timeBasis?'Event time basis differs between records.':'Both records share a timestamp basis.'],
   limitations:[theme==='corporate'?'A common SEC form (10-Q, 10-K or 8-K) is not proof that the underlying disclosures are similar.':'A shared theme or phrase does not establish equivalent economic impact.',
    'No issuer exposure, causal influence, calibrated probability or trade recommendation is inferred.']};
 }).sort((a,b)=>b.similarity-a.similarity||b.event.comparisonTime.localeCompare(a.event.comparisonTime)||a.event.id.localeCompare(b.event.id)).slice(0,limit);
 return {event:selected,matches,source:'SOURCED_THEME_EVENTS',theme,methodVersion:'thematic-metadata-similarity-v1',
  fetchedAt:new Date(clock).toISOString(),coverage:{provider:'Source-specific recent observations',selection:'Only records from the returned bounded provider list, strictly earlier than selected event',
    receivedCount:total,usableCount:clean.length,independentCandidateCount:candidates.length,returnedCount:matches.length,
    incompleteHistory:true,mode:'retrospective_recent_source_list',queryCapReached:total>=100},
  limitations:['Exploratory retrospective source-record comparison only, not a statistically validated or comprehensive historical analogue database.',
   'Publication time is used when occurrence time is unavailable; no source revision is backdated to original knowledge.',
   'Source coverage is limited to currently returned records and can omit earlier or unindexed events.',
   'Similarity is a descriptive ranking, never a calibrated likelihood of direction, magnitude or causation.']};
}
export function createThematicResearch({sources,now=Date.now}={}){
 if(!sources||typeof sources.filings!=='function')throw new TypeError('Thematic research requires a sourced SEC adapter');
 async function list({theme='corporate',symbol='AAPL',topic='sanctions'}={}){
  if(!THEMES.includes(theme))throw fail('Unsupported research event theme.');
  if(!validSymbol(symbol))throw fail('Choose a supported uppercase instrument symbol.');
  if(!TOPICS.includes(topic))throw fail('Choose a supported geopolitical topic.');
  let data,items;
  if(theme==='corporate'){data=await sources.filings(symbol);items=data.filings;}
  else if(theme==='news'){if(typeof sources.news!=='function')throw fail('Company news source is not configured.',503);data=await sources.news(symbol,30);items=data.events;}
  else if(theme==='natural'){if(typeof sources.hazards!=='function')throw fail('Natural hazard source is not configured.',503);data=await sources.hazards('all');items=data.events;}
  else{if(typeof sources.geopolitics!=='function')throw fail('Geopolitical media source is not configured.',503);data=await sources.geopolitics(topic);items=data.events;}
  const instant=Number(now());
  const normalized=(Array.isArray(items)?items:[]).slice(0,100).map(item=>normalize(item,theme)).filter(item=>item&&Date.parse(item.comparisonTime)<=instant)
   .sort((a,b)=>b.comparisonTime.localeCompare(a.comparisonTime)||a.id.localeCompare(b.id));
  return {theme,symbol,topic,events:normalized,source:theme==='corporate'?'SEC_EDGAR':theme==='news'?'ALPACA_NEWS':theme==='natural'?'USGS_NASA':'GDELT_MEDIA',
   fetchedAt:data?.fetchedAt||new Date(instant).toISOString(),coverage:{receivedCount:items?.length||0,usableCount:normalized.length,maxEvents:100,historicalCompleteness:'NOT_COMPLETE'},
   limitations:['The returned source list is not a complete historical catalogue; use the archive for true as-observed revision history.',
    theme==='geopolitical'?'GDELT entries are media coverage candidates, not independent confirmation of the reported event.':'No source title alone confirms company exposure or economic impact.']};
 }
 async function analogues(options={}){
  const data=await list(options);
  const ranked=rankThematicAnalogues(data.events,{theme:data.theme,eventId:options.eventId,limit:options.limit??5,now:now()});
  return {...ranked,source:data.source,coverage:{...ranked.coverage,provider:data.source,receivedCount:data.coverage.receivedCount}};
 }
 return {list,analogues};
}
