/* TradeScope v0.27 — local evidence casebook, never a verified ownership engine. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const disp=x=>x===null||x===undefined?'—':String(x);
const proof=async(route,options={})=>{
 const res=await fetch('/api/exposure-proof/'+route,{cache:'no-store',...options});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'Exposure source service unavailable');return data;
};
const geo=async route=>{const res=await fetch('/api/geo-exposure/'+route,{cache:'no-store'});
 const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Asset registry unavailable');return data;};
const post=async(route,body)=>proof(route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
let enabled=false,selected=null,caseRows=[],assetRows=[],current=null;
const status=t=>$('status').textContent=t;
const buttons=()=>{for(const id of ['capture','assess','export','challengeBtn','rebutBtn','reviewBtn'])$(id).disabled=!selected;};
const safeOfficial=x=>{try{const u=new URL(x);
 return u.protocol==='https:'&&['www.sec.gov','www.epa.gov','ofmpub.epa.gov','echo.epa.gov','www.eia.gov',
  'www.usgs.gov','earthquake.usgs.gov'].includes(u.hostname)&&!u.search&&!u.hash?u.href:null;
 }catch{return null;}};
const link=(x,label)=>{const u=safeOfficial(x);return u?
 '<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':'';};
function casesUi(){
 $('cases').innerHTML=caseRows.length?caseRows.map(x=>'<button type="button" class="case-item '+(x.id===selected?'active':'')+
 '" data-id="'+esc(x.id)+'"><strong>'+esc(x.symbol)+' · '+esc(x.assetName)+'</strong>'+
 '<small>'+esc(x.legalOperatorName)+' / EPA '+esc(x.epaRegistryId)+'</small>'+
 '<small>Opened '+esc(x.createdAt)+' · '+esc(x.eventCount)+' events</small>'+
 '<span class="pill">'+esc(x.reviewStatus.replace(/_/g,' '))+'</span></button>').join(''):
 '<div class="empty">No saved proof cases. Start by recording a genuine local facility evidence claim in Geo Exposure.</div>';
}
function caseDetailUi(){
 if(!current)return;
 const a=current.opened,c=a.claim,r=current.analysis,s=current.lastSourceSnapshot;
 $('caseTitle').textContent=a.assetSymbol+' · '+a.assetName;
 $('caseDetail').innerHTML='<div class="summary-grid">'+[
  ['Local asset',a.assetName],['Issuer symbol / CIK',a.assetSymbol+' / '+a.assetCik],
  ['EPA Registry ID',c.epaRegistryId],['Claimed legal operator',c.legalOperatorName],
  ['Claimed ownership interval',c.effectiveFrom+' → '+(c.effectiveTo||'unspecified')],
  ['Human disposition',current.reviewDisposition.replace(/_/g,' ')],
  ['EPA identity',s?.epa?.status||'not captured'],['SEC identity',s?.sec?.registrantName||'not captured'],
  ['Evidence state','NOT VERIFIED']
 ].map(([k,v])=>'<div class="kv"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
  '<p><strong>Testable proposition:</strong> '+esc(c.thesis)+'</p><p>'+
  link(c.operatorDocument.url,'Operator document')+' ('+esc(c.operatorDocument.publishedDate)+') · '+
  link(c.issuerRelationshipDocument.url,'SEC relationship document')+' ('+
  esc(c.issuerRelationshipDocument.publishedDate)+')</p>'+
  '<p><strong>Official source snapshot:</strong> '+esc(s?.snapshotHash||'none yet')+
  (s?.previousSnapshotHash?'<small> Prior: '+esc(s.previousSnapshotHash)+
   ' · Changed: '+esc(String(s.changedFromPriorCapture))+'</small>':'')+'</p>'+
  '<p><strong>Historical eligibility:</strong> '+esc(String(r.historicalFirstAvailableEligible))+
  ' · Legal operator to CIK verified: '+esc(String(r.subsidiaryToCikVerified))+
  ' · Event-specific issuer impact: '+esc(String(r.issuerFinancialImpactVerified))+'</p>';
 $('critic').innerHTML=r.issues.length?r.issues.map(x=>
  '<article class="challenge"><span class="pill">'+esc(x.priority)+'</span><strong>'+esc(x.id.replace(/_/g,' '))+
  '</strong><p>'+esc(x.statement)+'</p><small>Needed: '+esc(x.missingEvidence)+'</small></article>').join(''):
  '<div class="empty">No deterministic gap returned. Do not interpret this as independent verification.</div>';
 const human=current.humanChallenges,replies=current.rebuttals;
 $('debate').innerHTML=human.length||replies.length?
  [...human.map(x=>({kind:'CHALLENGE',id:x.challengeId,reason:x.reason,category:x.category})),
   ...replies.map(x=>({kind:'REBUTTAL',id:x.challengeId,reason:x.reason,category:x.resolution}))]
   .map(x=>'<div class="debate-item"><strong>'+esc(x.kind)+' · '+esc(x.category)+'</strong><p>'+
    esc(x.reason)+'</p><small>Linked challenge '+esc(x.id)+' · NOT independently resolved</small></div>').join(''):
  '<div class="empty">No objections have been saved by a researcher.</div>';
 $('rebutChallenge').innerHTML='<option value="">Select challenge</option>'+human.map(x=>
  '<option value="'+esc(x.challengeId)+'">'+esc(x.category)+' · '+esc(x.reason.slice(0,55))+'</option>').join('');
 $('audit').innerHTML=current.auditEvents.map(x=>'<div class="audit-item"><div><strong>#'+esc(x.seq)+
  ' · '+esc(x.type.replace(/_/g,' '))+'</strong><small>'+esc(x.at)+'</small></div>'+
  '<span class="hash">'+esc(x.eventHash.slice(0,18))+'…</span></div>').join('');
}
async function refresh(){
 try{
  const cat=await proof('catalog');enabled=cat.enabled===true;
  if(!enabled){status(cat.reason||'Local proof casebook disabled');$('integrity').textContent='OFF';
   $('cases').innerHTML='<div class="empty">Set both RESEARCH_EXPOSURE_PROOF_ENABLED=true and RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true on a loopback server.</div>';return;}
  const [integrity,list,assets]=await Promise.all([
   proof('integrity'),proof('cases?limit=50'+($('symbolFilter').value.trim()?'&symbol='+encodeURIComponent($('symbolFilter').value.trim().toUpperCase()):'')),
   geo('assets')]);
  $('caseCount').textContent=integrity.caseCount;
  $('eventCount').textContent=integrity.recordCount;
  $('integrity').textContent=integrity.integrity==='LOCAL_HASH_CHAIN_VALID'?'VALID':'REVIEW';
  caseRows=list.cases||[];assetRows=assets.assets||[];
  $('assetId').innerHTML='<option value="">Choose saved local facility claim</option>'+
   assetRows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.symbol)+' · '+esc(x.assetName)+'</option>').join('');
  if(selected&&!caseRows.some(x=>x.id===selected))selected=null;
  casesUi();buttons();
  if(selected)await showCase(selected);
  else status('Ready. Cases require separate dated operator and SEC documentary evidence. No ownership is automatically certified.');
 }catch(e){status('Research casebook unavailable: '+e.message);$('integrity').textContent='ERROR';}
}
async function showCase(id){
 selected=id;buttons();casesUi();
 try{
  const q=new URLSearchParams({id});if($('asOf').value)q.set('asOf',$('asOf').value);
  current=await proof('case?'+q.toString());caseDetailUi();
  status('Review loaded. All operator/issuer relationships remain unverified pending independent evidence.');
 }catch(e){current=null;status('Could not load research case: '+e.message);}
}
async function create(e){
 e.preventDefault();if(!enabled)return;
 const claim={assetId:$('assetId').value,epaRegistryId:$('epaRegistryId').value.trim(),
  legalOperatorName:$('legalOperatorName').value.trim(),effectiveFrom:$('effectiveFrom').value,
  effectiveTo:$('effectiveTo').value||null,
  operatorDocument:{url:$('operatorUrl').value.trim(),publishedDate:$('operatorDate').value,excerpt:$('operatorExcerpt').value.trim()},
  issuerRelationshipDocument:{url:$('secUrl').value.trim(),publishedDate:$('secDate').value,excerpt:$('secExcerpt').value.trim()},
  thesis:$('thesis').value.trim()};
 $('createCase').disabled=true;
 try{
  const result=await post('cases',claim);
  selected=result.caseId;status('Unverified research hypothesis recorded in local audit chain.');
  $('createForm').reset();await refresh();
 }catch(err){status('Case intake rejected: '+err.message);}
 finally{$('createCase').disabled=false;}
}
async function capture(){
 if(!selected)return;
 $('capture').disabled=true;status('Capturing permitted official EPA and SEC current-source metadata…');
 try{
  const d=await post('capture?id='+encodeURIComponent(selected),{});
  status('Recorded official-source capture #'+d.record.seq+'; EPA '+d.snapshot.status.epa+
   ', SEC '+d.snapshot.status.sec+'. Change from prior: '+String(d.diff.changed)+
   '. Identity snapshots do not independently prove a legal operator.');
  await showCase(selected);
 }catch(e){status('Source capture unavailable: '+e.message);}
 finally{$('capture').disabled=false;}
}
async function exportReport(){
 if(!selected)return;const q=new URLSearchParams({id:selected});
 if($('asOf').value)q.set('asOf',$('asOf').value);
 try{
  const res=await fetch('/api/exposure-proof/report?'+q.toString(),{cache:'no-store'});
  if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||'Export unavailable');}
  const blob=await res.blob(),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download='tradescope-exposure-proof-'+selected+'.txt';a.click();URL.revokeObjectURL(u);
  status('Research report generated. This is not a verified ownership certificate.');
 }catch(e){status('Export error: '+e.message);}
}
async function challenge(e){
 e.preventDefault();if(!selected)return;
 try{await post('challenge?id='+encodeURIComponent(selected),
  {category:$('category').value,reason:$('challengeReason').value.trim()});
  $('challengeReason').value='';await refresh();status('Recorded unresolved challenge. No automatic claim promotion.');}
 catch(err){status('Challenge rejected: '+err.message);}
}
async function rebut(e){
 e.preventDefault();if(!selected)return;
 try{await post('rebuttal?id='+encodeURIComponent(selected),
  {challengeId:$('rebutChallenge').value,reason:$('rebutReason').value.trim()});
  $('rebutReason').value='';await refresh();status('Rebuttal recorded; the original objection remains visible.');}
 catch(err){status('Rebuttal rejected: '+err.message);}
}
async function review(){
 if(!selected)return;
 try{await post('review?id='+encodeURIComponent(selected),
  {disposition:$('disposition').value,rationale:$('rationale').value.trim()});
  $('rationale').value='';await refresh();status('Local analyst disposition appended. Independent ownership verification remains false.');}
 catch(e){status('Review rejected: '+e.message);}
}
$('reload').addEventListener('click',()=>void refresh());
$('symbolFilter').addEventListener('change',()=>void refresh());
$('cases').addEventListener('click',e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id)void showCase(id);});
$('createForm').addEventListener('submit',e=>void create(e));
$('capture').addEventListener('click',()=>void capture());
$('assess').addEventListener('click',()=>{if(selected)void showCase(selected);});
$('asOf').addEventListener('change',()=>{if(selected)void showCase(selected);});
$('export').addEventListener('click',()=>void exportReport());
$('challengeForm').addEventListener('submit',e=>void challenge(e));
$('rebutForm').addEventListener('submit',e=>void rebut(e));
$('reviewBtn').addEventListener('click',()=>void review());
void refresh();
})();