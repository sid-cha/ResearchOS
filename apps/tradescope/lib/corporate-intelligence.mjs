/** Extractive corporate filing observations and a bounded single-user alert store.
 * No provider requests, consensus estimates or market-impact forecasts are made here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validEventTimestamp} from './market-events.mjs';

const VERSION='corporate-filing-v1',DAY=86400000,FRESH_DAYS=7;
const FORMS=new Set(['8-K','8-K/A','10-Q','10-Q/A','10-K','10-K/A']);
const STATUSES=new Set(['active','acknowledged','resolved']);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>structuredClone(value);
const plain=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max):null;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
const instant=value=>validEventTimestamp(value)?new Date(value).toISOString():null;
const symbolOf=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(value)?value:null;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clockOf=value=>typeof value==='function'?Number(value()):typeof value==='string'?Date.parse(value):Number(value);
const excerpt=(value,max=350)=>{const flat=value.replace(/\s+/g,' ').trim();if(flat.length<=max)return flat;const end=flat.lastIndexOf(' ',max);return flat.slice(0,end>max*.7?end:max).trimEnd()+'…';};

export const CORPORATE_CLASSIFICATIONS=Object.freeze([
 {id:'results_disclosure',label:'Results disclosure',itemCode:'2.02'},
 {id:'regulation_fd',label:'Regulation FD disclosure',itemCode:'7.01'},
 {id:'material_agreement',label:'Material agreement disclosure',itemCode:'1.01'},
 {id:'agreement_termination',label:'Material agreement termination',itemCode:'1.02'},
 {id:'restructuring_costs',label:'Exit or restructuring costs disclosure',itemCode:'2.05'},
 {id:'leadership_change',label:'Director or officer change disclosure',itemCode:'5.02'},
 {id:'cybersecurity_incident',label:'Cybersecurity incident disclosure',itemCode:'1.05'},
 {id:'quarterly_report',label:'Quarterly report filed'},
 {id:'annual_report',label:'Annual report filed'},
 {id:'guidance_statement',label:'Source-reported guidance statement'},
 {id:'dividend_declaration',label:'Source-reported dividend declaration'}
].map(Object.freeze));
const definitions=new Map(CORPORATE_CLASSIFICATIONS.map(item=>[item.id,item]));

function sourceMetadata(filing,symbol){
 if(!object(filing)||!symbolOf(symbol))throw fail('Choose a valid issuer symbol and official filing metadata');
 const accession=filing.accession;
 if(typeof accession!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!FORMS.has(filing.form))throw fail('Choose a supported official SEC filing accession and form');
 let url;try{url=new URL(filing.sourceUrl);}catch{throw fail('An original SEC filing document URL is required');}
 const match=/^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/([a-z0-9][a-z0-9_.-]{0,180}\.(?:html?|xhtml|txt))$/i.exec(url.pathname);
 if(url.origin!=='https://www.sec.gov'||url.username||url.password||url.search||url.hash||!match||match[2]!==accession.replaceAll('-','')||/%|\\/.test(filing.sourceUrl))throw fail('Use the matching original SEC archive document');
 if(filing.cik!=null&&(!/^\d{1,10}$/.test(String(filing.cik))||Number(filing.cik)!==Number(match[1])))throw fail('Filing document does not match its issuer CIK');
 const publishedAt=instant(filing.publishedAt),filingDate=day(filing.filingDate);
 const declaredPrecision=filing.publicationTimePrecision||filing.publishedAtPrecision;
 const publicationTimePrecision=declaredPrecision==='date_only'||!publishedAt&&filingDate?'date_only':publishedAt&&/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(filing.publishedAt)&&filingDate===publishedAt.slice(0,10)&&declaredPrecision!=='provider_timestamp'?'date_only':publishedAt?'provider_timestamp':'unknown';
 return {accession,symbol,cik:String(Number(match[1])).padStart(10,'0'),form:filing.form,source:'SEC EDGAR',sourceEventId:'sec:'+accession,
  id:`corporate:sec:${accession}:${symbol}`,headline:plain(filing.headline,350)||`${symbol} — ${filing.form} filing`,
  sourceUrl:url.href,filingDate,periodEnd:day(filing.periodEnd),publishedAt:publicationTimePrecision==='provider_timestamp'?publishedAt:null,
  publicationTimePrecision,amendment:filing.form.endsWith('/A'),occurredAt:null};
}
function sourceEvidence(document,metadata){
 if(!object(document))return {evidence:[],items:[],documentRead:false};
 if(document.symbol&&document.symbol!==metadata.symbol||document.filing?.accession&&document.filing.accession!==metadata.accession||document.filing?.form&&document.filing.form!==metadata.form||document.filing?.sourceUrl&&document.filing.sourceUrl!==metadata.sourceUrl)throw fail('Parsed document does not match the selected filing');
 const evidence=[],seen=new Map(),conflicts=new Set();
 for(const raw of Array.isArray(document.evidence)?document.evidence.slice(0,32):[]){
  if(!object(raw))continue;
  const id=plain(raw.id,240),text=plain(raw.text,1600),section=plain(raw.section,140);
  if(!id||!text||raw.sourceUrl!==metadata.sourceUrl)continue;
  const entry={id,text,section,sourceUrl:metadata.sourceUrl,kind:'source_passage'};
  if(seen.has(id)&&seen.get(id).text!==text)conflicts.add(id);else if(!seen.has(id))seen.set(id,entry);
 }
 for(const [id,item]of seen)if(!conflicts.has(id))evidence.push(item);
 const byId=new Map(evidence.map(item=>[item.id,item]));
 const items=(Array.isArray(document.items)?document.items:[]).slice(0,16).flatMap(item=>{
  const cited=byId.get(item?.evidenceId);
  if(!cited||item.sourceUrl!==metadata.sourceUrl||typeof item.code!=='string')return [];
  // Item labels alone are not enough: require the returned passage to match it.
  const text=plain(item.text,1600),section=plain(item.section,140)||cited.section;
  if(!text||text!==cited.text||!section||section!==cited.section||!new RegExp('\\bItem\\s+'+item.code.replaceAll('.','\\.')+'(?:\\b|$)','i').test(section))return [];
  return [{code:item.code,section:plain(item.section,140)||cited.section,evidenceId:cited.id,text:cited.text}];
 });
 const selected=evidence.slice(0,16),ids=new Set(selected.map(item=>item.id));
 return {evidence:selected,items:items.filter(item=>ids.has(item.evidenceId)),documentRead:true};
}
const uncertain=/\b(?:if|may|might|could|would|plans? to|intends? to|expects? to|not|never|no|without|forward-looking statements)\b/i;
const guidanceAction=/\b(?:issued|provided|updated|reaffirmed|maintained|raised|increased|lowered|reduced|withdrew|suspended)\b.{0,85}\b(?:guidance|outlook)\b|\b(?:guidance|outlook)\b.{0,60}\b(?:was|has been)\s+(?:issued|provided|updated|reaffirmed|maintained|raised|increased|lowered|reduced|withdrawn|suspended)\b/i;
const dividendAction=/\b(?:board(?: of directors)?|company|issuer|we)\b.{0,70}\b(?:declared|approved|authorized)\b.{0,80}\bdividend\b|\bdividend\b.{0,55}\b(?:was|has been)\s+(?:declared|approved|authorized)\b/i;
function classification(id,evidenceIds,basis,itemCode=null){return {id,label:definitions.get(id).label,basis,itemCode,evidenceIds:[...new Set(evidenceIds)]};}
function contentRevision(event){return digest([event.symbol,event.sourceEventId,event.cik,event.headline,event.form,event.sourceUrl,event.filingDate,event.periodEnd,event.publishedAt,event.publicationTimePrecision,
 event.evidence.map(item=>[item.id,item.text,item.section,item.kind]),event.classifications.map(item=>[item.id,item.basis,item.itemCode,item.evidenceIds])]);}

/** Classification uses cited primary filing passages; source text is never an instruction. */
export function classifyCorporateEvent({filing,document=null,symbol,observedAt,now=Date.now(),importMode='discovery'}={}){
 const clock=clockOf(now);if(!Number.isFinite(clock))throw fail('A valid corporate research clock is required');
 const firstObservedAt=observedAt===undefined?new Date(clock).toISOString():instant(observedAt);
 if(!firstObservedAt||Math.abs(Date.parse(firstObservedAt)-clock)>300000)throw fail('Observed time must be the actual local observation time');
 if(!['discovery','historical','import'].includes(importMode))throw fail('Choose discovery or historical import mode');
 const metadata=sourceMetadata(filing,symbol),parsed=sourceEvidence(document,metadata),classifications=[];
 const evidence=[...parsed.evidence],summary=[];
 if(metadata.form.replace('/A','')==='8-K'){
  for(const definition of CORPORATE_CLASSIFICATIONS.filter(item=>item.itemCode)){
   const matches=parsed.items.filter(item=>item.code===definition.itemCode&&evidence.some(citation=>citation.id===item.evidenceId));
   if(matches.length)classifications.push(classification(definition.id,matches.map(item=>item.evidenceId),'reported_filing_item',definition.itemCode));
  }
 }
 const baseForm=metadata.form.replace('/A','');
 if(['10-Q','10-K'].includes(baseForm)){
  const id=`sec-meta:${metadata.accession}:form`;
  evidence.push({id,text:`SEC filing form: ${metadata.form}.`,section:'Official filing metadata',sourceUrl:metadata.sourceUrl,kind:'filing_metadata'});
  classifications.push(classification(baseForm==='10-Q'?'quarterly_report':'annual_report',[id],'reported_form'));
 }
 for(const [id,pattern]of [['guidance_statement',guidanceAction],['dividend_declaration',dividendAction]]){
  const eligible=parsed.items.filter(item=>metadata.form.startsWith('8-K')&&['2.02','7.01','8.01'].includes(item.code));
  const matches=eligible.flatMap(item=>item.text.split(/(?<=[.!?])\s+/).filter(sentence=>sentence.length>20&&!uncertain.test(sentence)&&pattern.test(sentence)).map(text=>({text,evidenceId:item.evidenceId})));
  if(matches.length){classifications.push(classification(id,matches.map(item=>item.evidenceId),'cited_passage'));summary.push(...matches.slice(0,2).map(item=>({text:excerpt(item.text),evidenceId:item.evidenceId})));}
 }
 for(const tag of classifications){
  const citation=evidence.find(item=>tag.evidenceIds.includes(item.id)&&item.kind==='source_passage');
  if(citation&&!summary.some(item=>item.evidenceId===citation.id))summary.push({text:excerpt(citation.text),evidenceId:citation.id});
 }
 const published=metadata.publishedAt?Date.parse(metadata.publishedAt):null;
 const freshnessReason=importMode!=='discovery'?'explicit_historical_import':published===null?'publication_time_unavailable':published>clock?'future_publication':clock-published>FRESH_DAYS*DAY?'older_filing_first_observed':null;
 const limitations=['Classifications describe source-reported filing content; they do not establish business outcomes, price impact or a recommendation.',
  'Underlying occurrence time is not inferred from filing acceptance or prose. Consensus, surprises and guidance targets are not calculated.',
  'The revision hash covers selected parsed passages and metadata, not the complete filing or exhibit archive.'];
 if(freshnessReason)limitations.push('This observation is retrospective/imported context, not a newly published filing alert.');
 if(!parsed.documentRead||!parsed.items.length)limitations.push('Supported primary-document passages are unavailable; generic filing titles do not establish earnings or guidance events.');
 if(document?.coverage?.textTruncated)limitations.push('The filing reader truncated the source; later disclosures may be missing.');
 const event={schemaVersion:1,...metadata,category:'CORPORATE',type:'FILING',firstObservedAt,lastObservedAt:firstObservedAt,
  retrospective:Boolean(freshnessReason),freshnessReason,classificationVersion:VERSION,classifications,summary:summary.slice(0,6),evidence,
  expectations:{consensus:null,surprisePct:null,forwardTarget:null,status:'unsupported'},
  coverage:{documentRead:parsed.documentRead,supportedItems:parsed.items.length,classifiedItems:classifications.length,rawDocumentStored:false},limitations};
 return {...event,contentRevision:contentRevision(event)};
}

function cleanEvent(input){
 if(!object(input)||input.classificationVersion!==VERSION)throw fail('Use a supported classified corporate observation');
 const metadata=sourceMetadata(input,input.symbol),firstObservedAt=instant(input.firstObservedAt),lastObservedAt=instant(input.lastObservedAt);
 if(!firstObservedAt||!lastObservedAt||lastObservedAt<firstObservedAt)throw fail('Corporate observation timestamps are invalid');
 const evidence=(Array.isArray(input.evidence)?input.evidence:[]).slice(0,17).flatMap(raw=>{
  const id=plain(raw?.id,240),text=plain(raw?.text,1600);if(!id||!text||raw.sourceUrl!==metadata.sourceUrl||!['source_passage','filing_metadata'].includes(raw.kind))return [];
  return [{id,text,section:plain(raw.section,140),sourceUrl:metadata.sourceUrl,kind:raw.kind}];
 });
 if(new Set(evidence.map(item=>item.id)).size!==evidence.length)throw fail('Corporate citations are ambiguous');
 const byId=new Map(evidence.map(item=>[item.id,item]));
 const classifications=(Array.isArray(input.classifications)?input.classifications:[]).slice(0,12).map(item=>{
  if(!definitions.has(item?.id)||!['reported_filing_item','reported_form','cited_passage'].includes(item.basis)||!Array.isArray(item.evidenceIds)||!item.evidenceIds.length||item.evidenceIds.length>16||item.evidenceIds.some(id=>!byId.has(id)))throw fail('Corporate classifications require valid cited evidence');
  return classification(item.id,item.evidenceIds,item.basis,definitions.get(item.id).itemCode||null);
 });
 if(new Set(classifications.map(item=>item.id)).size!==classifications.length)throw fail('Corporate classifications are duplicated');
 const summary=(Array.isArray(input.summary)?input.summary:[]).slice(0,6).flatMap(item=>{
  const text=plain(item?.text,351),citation=byId.get(item?.evidenceId),quoted=text?.replace(/…$/,'');
  return text&&citation&&citation.text.replace(/\s+/g,' ').includes(quoted)?[{text,evidenceId:citation.id}]:[];
 });
 const event={schemaVersion:1,...metadata,category:'CORPORATE',type:'FILING',firstObservedAt,lastObservedAt,
  retrospective:input.retrospective===true,freshnessReason:plain(input.freshnessReason,100),classificationVersion:VERSION,classifications,summary,evidence,
  expectations:{consensus:null,surprisePct:null,forwardTarget:null,status:'unsupported'},
  coverage:{documentRead:input.coverage?.documentRead===true,supportedItems:Number.isSafeInteger(input.coverage?.supportedItems)?Math.min(16,Math.max(0,input.coverage.supportedItems)):0,classifiedItems:classifications.length,rawDocumentStored:false},
  limitations:(Array.isArray(input.limitations)?input.limitations:[]).slice(0,8).map(value=>plain(value,500)).filter(Boolean)};
 const revision=contentRevision(event);if(input.contentRevision!==revision)throw fail('Corporate observation content revision is invalid');
 return {...event,contentRevision:revision};
}
const eventKey=event=>digest([event.source,event.sourceEventId,event.symbol,event.classificationVersion,event.contentRevision,event.classifications.map(item=>item.id).sort()]);

/** Compact local observations/alerts, not the immutable original-revision archive. */
export function createCorporateAlertStore({filename,now=Date.now,maxEvents=200,maxAlerts=500}={}){
 if(typeof filename!=='string'||!filename||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>200||!Number.isSafeInteger(maxAlerts)||maxAlerts<1||maxAlerts>500)throw fail('Choose a bounded corporate store file');
 let state=null,loading=null,serial=Promise.resolve();
 const stamp=()=>{const clock=clockOf(now);if(!Number.isFinite(clock))throw fail('Corporate observation clock is unavailable',500);return new Date(clock).toISOString();};
 function check(parsed){
  if(!object(parsed)||parsed.schemaVersion!==1||!Array.isArray(parsed.events)||!Array.isArray(parsed.alerts)||parsed.events.length>maxEvents||parsed.alerts.length>maxAlerts)throw fail('Corporate store schema is invalid',500);
  const events=parsed.events.map(item=>({key:eventKey(cleanEvent(item.event)),event:cleanEvent(item.event)}));
  const alerts=parsed.alerts.map(item=>{
   if(typeof item?.id!=='string'||!/^CORP-[a-f0-9-]{36}$/.test(item.id)||!STATUSES.has(item.status)||!Number.isSafeInteger(item.revision)||item.revision<1||!instant(item.createdAt)||!instant(item.updatedAt))throw fail('Corporate alert schema is invalid',500);
   const event=cleanEvent(item.event);
   return alertSnapshot({...item,event,key:eventKey(event)});
  });
  if(new Set(events.map(item=>item.key)).size!==events.length||new Set(alerts.map(item=>item.id)).size!==alerts.length||new Set(alerts.map(item=>item.key)).size!==alerts.length)throw fail('Corporate store has duplicate records',500);
  return {schemaVersion:1,events,alerts};
 }
 async function load(){
  if(state)return state;
  if(!loading)loading=(async()=>{try{state=check(JSON.parse(await fs.readFile(filename,'utf8')));}catch(error){if(error.code==='ENOENT')state={schemaVersion:1,events:[],alerts:[]};else throw fail('Corporate store could not be read safely',500);}return state;})().catch(error=>{loading=null;throw error;});
  return loading;
 }
 async function save(candidate){
  await fs.mkdir(path.dirname(filename),{recursive:true});const temp=`${filename}.${randomUUID()}.tmp`;
  try{await fs.writeFile(temp,JSON.stringify(candidate,null,2)+'\n',{encoding:'utf8',mode:0o600});await fs.rename(temp,filename);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 const write=operation=>{const pending=serial.then(async()=>{await load();const candidate=copy(state),result=operation(candidate);await save(candidate);state=candidate;return copy(result);});serial=pending.catch(()=>{});return pending;};
 const read=async operation=>{await serial;await load();return copy(operation(state));};
 function alertSnapshot(item){return {id:item.id,key:item.key,status:item.status,revision:item.revision,createdAt:instant(item.createdAt),updatedAt:instant(item.updatedAt),
  acknowledgedAt:instant(item.acknowledgedAt),resolvedAt:instant(item.resolvedAt),eventId:item.event.id,symbol:item.event.symbol,headline:item.event.headline,source:item.event.source,sourceUrl:item.event.sourceUrl,accession:item.event.accession,
  form:item.event.form,classifications:item.event.classifications,summary:item.event.summary,firstObservedAt:item.event.firstObservedAt,contentRevision:item.event.contentRevision,event:item.event};}
 const filters=({symbol,status='all'}={})=>{if(symbol!==undefined&&!symbolOf(symbol)||status!=='all'&&!STATUSES.has(status))throw fail('Choose a supported corporate alert filter');return {symbol,status};};
 return {
  record(input,{importMode}={}){
   const normalized=cleanEvent(input);
   if(importMode!==undefined&&!['discovery','historical','import'].includes(importMode))throw fail('Choose discovery or historical import mode');
   return write(document=>{
    const key=eventKey(normalized),timestamp=stamp(),prior=document.events.find(item=>item.key===key),existing=document.alerts.find(item=>item.key===key);
    if(Date.parse(normalized.firstObservedAt)>Date.parse(timestamp)+300000||Date.parse(normalized.lastObservedAt)>Date.parse(timestamp)+300000)throw fail('Corporate observations cannot be recorded ahead of the local clock');
    if(prior||existing){
     const event=prior?.event||existing.event;event.lastObservedAt=timestamp>event.lastObservedAt?timestamp:event.lastObservedAt;
     if(prior){prior.event=event;document.events.splice(document.events.indexOf(prior),1);document.events.unshift(prior);}
     else{document.events.unshift({key,event});if(document.events.length>maxEvents)document.events.pop();}
     if(existing)existing.event=event;
     return {action:'duplicate',event,alert:existing?alertSnapshot(existing):null};
    }
    const event=copy(normalized),published=event.publishedAt?Date.parse(event.publishedAt):null;
    const old=published===null||Date.parse(timestamp)-published>FRESH_DAYS*DAY||published>Date.parse(timestamp);
    if(importMode&&importMode!=='discovery'||old){event.retrospective=true;event.freshnessReason=event.freshnessReason||'historical_import';}
    document.events.unshift({key,event});if(document.events.length>maxEvents)document.events.pop();
    if(!event.classifications.length)return {action:'unclassified',event,alert:null};
    if(event.retrospective)return {action:'imported',event,alert:null};
    const item=alertSnapshot({id:`CORP-${randomUUID()}`,key,status:'active',revision:1,createdAt:timestamp,updatedAt:timestamp,event});
    document.alerts.unshift(item);
    if(document.alerts.length>maxAlerts){const resolved=document.alerts.map((alert,index)=>({alert,index})).reverse().find(item=>item.alert.status==='resolved');document.alerts.splice(resolved?.index??document.alerts.length-1,1);}
    return {action:'created',event,alert:item};
   });
  },
  list(options={}){const {symbol,status}=filters(options);return read(document=>document.alerts.filter(item=>(!symbol||item.event.symbol===symbol)&&(status==='all'||item.status===status)).map(alertSnapshot));},
  get(id){return read(document=>{const item=document.alerts.find(item=>item.id===id);if(!item)throw fail('Corporate alert not found',404);return alertSnapshot(item);});},
  listEvents({symbol,limit=50,includeRevisions=false}={}){
   filters({symbol});if(!Number.isSafeInteger(limit)||limit<1||limit>200||typeof includeRevisions!=='boolean')throw fail('Choose a bounded corporate event list');
   return read(document=>{const seen=new Set();return document.events.filter(item=>{if(symbol&&item.event.symbol!==symbol||!includeRevisions&&seen.has(item.event.id))return false;seen.add(item.event.id);return true;}).slice(0,limit).map(item=>item.event);});
  },
  getEvent(id,{contentRevision:revision}={}){return read(document=>{const event=document.events.find(item=>item.event.id===id&&(!revision||item.event.contentRevision===revision))?.event;if(!event)throw fail('Corporate observation not found',404);return event;});},
  update(id,input){return write(document=>{
   const item=document.alerts.find(item=>item.id===id);if(!item)throw fail('Corporate alert not found',404);
   if(input?.expectedRevision!==item.revision)throw fail('Corporate alert changed; refresh and retry',409);
   if(!STATUSES.has(input?.status))throw fail('Choose active, acknowledged or resolved corporate alert status');
   if(item.status==='resolved'&&input.status!=='resolved')throw fail('Resolved corporate alerts cannot be reopened without a new observation',409);
   if(item.status===input.status)return alertSnapshot(item);
   item.status=input.status;item.revision++;item.updatedAt=stamp();if(input.status==='acknowledged')item.acknowledgedAt=item.updatedAt;if(input.status==='resolved')item.resolvedAt=item.updatedAt;
   return alertSnapshot(item);
  });}
 };
}
