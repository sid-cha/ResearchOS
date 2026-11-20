(()=>{'use strict';
const el=id=>document.getElementById(id),set=(id,v)=>{el(id).textContent=String(v??'—');};
const make=(parent,tag,text,css)=>{
 const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);
 if(css)e.className=css;parent.append(e);return e;
};
let report=null,config=null,pending=false;
async function api(url,{method='GET',data=null}={}){
 const res=await fetch('/api/corporate-precursor/'+url,{
  method,cache:'no-store',headers:data?{
   'Content-Type':'application/json','X-ResearchOS-Corporate-Precursor':'1'
  }:{},body:data?JSON.stringify(data):undefined
 });
 const payload=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(payload.error||'Corporate source endpoint unavailable');
 return payload;
}
function options(id,values,placeholder){
 const node=el(id),selected=node.value;node.replaceChildren();
 make(node,'option',placeholder).value='';
 for(const v of values){const opt=make(node,'option',v);opt.value=v;}
 if([...node.options].some(x=>x.value===selected))node.value=selected;
}
const validUtc=v=>!v||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&!Number.isNaN(Date.parse(v)));
function render(){
 const results=el('precursorResults'),health=el('precursorHealth');
 results.replaceChildren();health.replaceChildren();
 if(!report)return;
 set('precursorCounts',report.items.length+' ARTICLE CANDIDATES · '+report.alerts.length+' REVIEW ALERTS');
 set('precursorStatus','Local evidence as-of '+report.asOf+'; '+report.capturedSnapshots+
  ' capture snapshots. Published or provider-indexed times are not verified original first-publication clocks.');
 for(const s of report.sourceHealth){
  const card=make(health,'article',undefined,'precursor-card');
  make(card,'strong',s.symbol+' · '+s.provider);
  make(card,'p','Last captured '+s.capturedAt);
  make(card,'small',s.filtered+' retained / '+s.providerRows+' returned · '+s.coverage);
  make(card,'small','Response SHA-256 '+s.bodySha256);
 }
 if(!report.items.length)make(results,'p','No saved risk-relevant media titles or official keyword records at this cutoff. This does not establish no relevant reporting.');
 for(const item of report.items){
  const c=make(results,'article',undefined,'precursor-card');
  make(c,'strong',item.symbol+' · '+item.source+' · '+item.attention,
   item.attention==='PROMPT_HUMAN_REVIEW'?'urgent':'');
  make(c,'h3',item.headline);
  make(c,'small','First observed by ResearchOS: '+item.localFirstObservedAt);
  make(c,'small','Provider index time (not publisher time): '+(item.providerIndexedAt||'not provided'));
  make(c,'small','Official publication date (day only): '+(item.publisherPublicationDate||'not provided'));
  make(c,'small','Independently verified publisher publication instant: unavailable');
  make(c,'p','Research categories: '+(item.categories.length?item.categories.join(', '):'Official document search only'));
  make(c,'p','Evidence: '+item.sourceClaimStatus+' · human review required. Claim truth, entity relationship and stock impact not verified.');
  const a=make(c,'a','Open original source');a.href=item.url;a.rel='noopener noreferrer';a.target='_blank';
 }
 el('precursorExport').disabled=false;
}
async function refresh(){
 const at=el('precursorAsOf').value.trim();
 if(!validUtc(at)){set('precursorStatus','Provide a full UTC timestamp, e.g. 2026-10-29T13:00:00Z');return;}
 const p=new URLSearchParams();
 if(at)p.set('asOf',at);
 if(el('precursorFilter').value)p.set('symbol',el('precursorFilter').value);
 report=await api('view'+(p.size?'?'+p:''));
 render();
}
el('precursorForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(pending||!config?.enabled||!config?.rightsAcknowledged)return;
 const symbol=el('precursorSymbol').value,source=el('precursorProvider').value;
 if(!symbol)return;
 pending=true;el('precursorCapture').disabled=true;
 set('precursorCaptureStatus','Retrieving the requested fixed source. Headlines are classified for review only.');
 void api('capture',{method:'POST',data:{symbol,source}})
 .then(async r=>{
  set('precursorCaptureStatus',(r.deduplicated?'Same provider snapshot already captured':
   'New source observation saved')+' · '+r.record.capturedAt+
   ' · retained '+r.record.items.length+' risk/document candidates; SHA-256 '+r.record.bodySha256+
   '. No wrongdoing or market impact established.');
  await refresh();
 }).catch(e=>set('precursorCaptureStatus','Source capture failed: '+e.message))
 .finally(()=>{pending=false;el('precursorCapture').disabled=!config?.enabled||!config?.rightsAcknowledged;});
});
el('precursorRefresh').addEventListener('click',()=>void refresh().catch(e=>set('precursorStatus',e.message)));
el('precursorFilter').addEventListener('change',()=>void refresh().catch(e=>set('precursorStatus',e.message)));
el('precursorExport').addEventListener('click',()=>{
 if(!report)return;
 const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ResearchOS_v044_corporate_precursors.json';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
});
void(async()=>{
 try{
  config=await api('catalog');
  options('precursorSymbol',config.issuers,'Choose issuer');
  options('precursorFilter',config.issuers,'All captured issuers');
  el('precursorCapture').disabled=!config.enabled||!config.rightsAcknowledged;
  if(!config.enabled||!config.rightsAcknowledged)
   set('precursorCaptureStatus','Local issuer-news capture is not enabled or permitted-source retention has not been acknowledged in private .env. Read-only archived work may still be available on localhost.');
  await refresh();
 }catch(e){set('precursorStatus','Corporate precursor workspace unavailable: '+e.message);}
})();
})();