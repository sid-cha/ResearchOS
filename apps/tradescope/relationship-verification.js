(()=>{'use strict';
const $=id=>document.getElementById(id);
const set=(id,value)=>{$(id).textContent=String(value??'—');};
const make=(parent,tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(cls)e.className=cls;parent.append(e);return e;};
const select=(id,items,placeholder,label,value)=>{
 const control=$(id),old=control.value;control.replaceChildren();
 make(control,'option',placeholder).value='';
 for(const x of items){const item=make(control,'option',label(x));item.value=value(x);}
 if([...control.options].some(x=>x.value===old))control.value=old;
};
async function api(path,{method='GET',body=null}={}){
 const response=await fetch('/api/relationship-verification/'+path,{
  method,cache:'no-store',headers:body?{
   'Content-Type':'application/json','X-ResearchOS-Relationship-Verification':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const obj=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(obj.error||'Relationship review is unavailable');
 return obj;
}
let state=null,working=false,ready=false;
const validTime=s=>!s||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)&&Number.isFinite(Date.parse(s)));
function currentLink(){
 return state?.relationships?.find(x=>x.relationshipId===$('relationshipChoice').value)||null;
}
function renderDocuments(){
 const box=$('documentList');box.replaceChildren();
 const selected=$('relationshipChoice').value;
 const docs=(state?.documents||[]).filter(x=>x.relationshipId===selected);
 for(const doc of docs){
  const card=make(box,'article',undefined,'evidence-card');
  make(card,'strong',doc.quoteMatched?'VERBATIM EXCERPT MATCHED':'EXCERPT NOT FOUND','');
  make(card,'small','Source captured: '+doc.capturedAt);
  make(card,'small','SHA-256: '+doc.sourceSha256);
  make(card,'p',doc.excerpt);
  if(doc.context)make(card,'p','Source context: '+doc.context);
  make(card,'small','The matching words do not validate issuer ownership, dates or facility identity.');
 }
 if(!docs.length)make(box,'p','No SEC filing capture recorded for this relationship.');
 select('documentChoice',docs.filter(x=>x.quoteMatched),'Choose matching captured document',
  x=>x.capturedAt+' · '+x.documentId.slice(0,16),x=>x.documentId);
 $('saveProposal').disabled=!ready||!$('relationshipChoice').value||
  !$('documentChoice').value||working;
}
function renderProposals(){
 const rows=state?.proposals||[],box=$('proposalResults');box.replaceChildren();
 if(!rows.length)make(box,'p','No effective-date proposals recorded for this cutoff.');
 for(const row of rows){
  const claim=state.relationships.find(x=>x.relationshipId===row.relationshipId);
  const c=make(box,'article',undefined,'evidence-card');
  make(c,'strong',(claim?.relationshipType||'RELATIONSHIP')+' · '+(claim?.cik||'Unknown CIK'));
  make(c,'small','Proposed interval: '+row.claimedEffectiveFrom+' → '+(row.claimedEffectiveTo||'open'));
  make(c,'small','Originally recorded: '+row.claimRecordedAt);
  make(c,'p',row.explanation);
  make(c,'small','Document: '+row.sourceSha256+' · matched: '+row.textMatchedInPreviouslyCapturedDocument);
  make(c,'p','Review: '+row.assessment.status+' ('+row.assessment.count+'/2 aliases)'+
   (row.assessment.agreedDecision?' · '+row.assessment.agreedDecision:''));
  make(c,'small','Independent ownership and effective dates NOT verified.');
  for(const flag of row.antiAgentFlags)make(c,'span',flag.replaceAll('_',' '),'flag');
 }
 const chosen=$('proposalChoice').value;
 select('proposalChoice',rows,'Choose proposal to review',
  p=>p.claimedEffectiveFrom+' · '+p.relationshipId.slice(0,17)+' · '+p.assessment.status,
  p=>p.proposalId);
 if([...$('proposalChoice').options].some(x=>x.value===chosen))$('proposalChoice').value=chosen;
 renderReviewStatus();
}
function renderReviewStatus(){
 const proposal=state?.proposals?.find(x=>x.proposalId===$('proposalChoice').value);
 set('proposalReviewState',proposal?
  'Review '+proposal.assessment.status+' · '+proposal.assessment.count+' of 2 aliases'+
  (proposal.assessment.agreedDecision?' · shared decision: '+proposal.assessment.agreedDecision:'')+
  '. No ownership certification.':'Choose an interval proposal.');
 $('submitReview').disabled=!ready||!proposal||proposal.assessment.count>=2||working;
}
function renderAll(){
 select('relationshipChoice',state.relationships,
  'Choose captured company–facility relationship',
  x=>x.registryId+' ← '+x.cik+' · '+x.relationshipType,x=>x.relationshipId);
 const requested=new URLSearchParams(window.location.search).get('relationship');
 if(requested&&[...$('relationshipChoice').options].some(x=>x.value===requested))
  $('relationshipChoice').value=requested;
 set('verificationCounts',state.relationships.length+' LINKS · '+state.documents.length+' CAPTURES · '+
  state.proposals.length+' DATE CLAIMS');
 const link=currentLink();
 set('sourceLink',link?'Registered SEC filing: '+link.filingUrl:
  'Select a v0.37 relationship with an official SEC filing link.');
 $('captureSource').disabled=!ready||!link||working;
 renderDocuments();renderProposals();
 set('verificationMessage',state.warning);
}
async function refresh(){
 const asOf=$('verificationAsOf').value.trim();
 if(!validTime(asOf)){set('verificationMessage','Provide a complete UTC ISO timestamp.');return;}
 const params=new URLSearchParams();if(asOf)params.set('asOf',asOf);
 const target=await api('view'+(params.size?'?'+params:''));
 state=target;renderAll();
}
async function mutate(op,data,id){
 if(working)return;
 working=true;const button=$(id);button.disabled=true;
 try{const result=await api(op,{method:'POST',body:data});await refresh();return result;}
 catch(e){throw e;}
 finally{
  working=false;
  renderReviewStatus();
  if(id==='captureSource')button.disabled=!ready||!currentLink();
  else if(id==='saveProposal')button.disabled=!ready||!$('documentChoice').value;
 }
}
$('relationshipChoice').addEventListener('change',()=>{
 const link=currentLink();set('sourceLink',link?'Registered SEC filing: '+link.filingUrl:
 'Select an existing company–facility claim.');
 $('captureSource').disabled=!ready||!link;
 renderDocuments();
});
$('proposalChoice').addEventListener('change',renderReviewStatus);
$('sourceCaptureForm').addEventListener('submit',event=>{
 event.preventDefault();
 if(!currentLink())return;
 set('sourceMessage','Fetching the existing SEC URL and comparing the supplied literal text…');
 void mutate('capture',{relationshipId:$('relationshipChoice').value,
  excerpt:$('sourceExcerpt').value},'captureSource')
  .then(result=>{if(result)set('sourceMessage',(result.deduplicated?'Already recorded':'Source captured')+
   ' · Exact quote found: '+result.record.exactExcerptFound+
   ' · SHA-256 '+result.record.sourceSha256+
   '. This is a text observation, not an ownership decision.');})
  .catch(e=>set('sourceMessage','Source retrieval failed: '+e.message));
});
$('proposalForm').addEventListener('submit',event=>{
 event.preventDefault();
 const start=$('relationshipFrom').value,end=$('relationshipTo').value;
 set('proposalMessage','Recording dates as a human hypothesis, not certified history…');
 void mutate('propose',{relationshipId:$('relationshipChoice').value,
  documentId:$('documentChoice').value,effectiveFrom:start,
  effectiveTo:end||null,explanation:$('proposalExplanation').value},'saveProposal')
  .then(result=>{if(result)set('proposalMessage','Proposed interval recorded at '+
    result.firstRecordedAt+'; dates remain unverified.');})
  .catch(e=>set('proposalMessage','Could not save interval: '+e.message));
});
$('reviewForm').addEventListener('submit',event=>{
 event.preventDefault();
 set('reviewMessage','Recording independent reviewer alias assessment…');
 void mutate('review',{proposalId:$('proposalChoice').value,
  reviewer:$('reviewerAlias').value,vote:$('reviewVote').value,
  rationale:$('reviewRationale').value},'submitReview')
  .then(result=>{if(result){
   $('reviewRationale').value='';
   set('reviewMessage','Review recorded: '+result.assessment.status+
    ' · '+result.assessment.count+'/2 aliases. First vote is hidden until second review.');
  }}).catch(e=>set('reviewMessage','Review rejected: '+e.message));
});
$('refreshVerification').addEventListener('click',()=>void refresh().catch(e=>set('verificationMessage',e.message)));
void(async()=>{
 try{const c=await api('catalog');ready=c.enabled;
  if(!ready){set('verificationMessage','Private relationship review is disabled on this nonloopback host.');return;}
  await refresh();
 }catch(e){set('verificationMessage','Review workspace unavailable: '+e.message);}
})();
})();