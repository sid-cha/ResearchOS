/* v0.25 geographically scoped research; no synthetic locations, ownership or damage. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const officialReview=async route=>{const res=await fetch('/api/facility-verification/'+route,{cache:'no-store'});
 const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||'EPA facility review unavailable');return d;};
const api=async(route,opts={})=>{const res=await fetch('/api/geo-exposure/'+route,{cache:'no-store',...opts});
 const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||'Source unavailable');return d;};
const official=s=>{try{const u=new URL(s);return u.protocol==='https:'&&
 ['earthquake.usgs.gov','www.sec.gov','www.eia.gov','www.usgs.gov','www.epa.gov',
 'echo.epa.gov','ofmpub.epa.gov','www.noaa.gov','www.nrcs.usda.gov'].includes(u.hostname)
 &&!u.search&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const link=(u,label)=>{const dest=official(u);return dest?'<a href="'+esc(dest)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':'';};
let observed=null,selected=null,registryEnabled=false,claims=[];
const status=x=>el('status').textContent=x;
function drawIssuers(rows){
 el('issuerCount').textContent=rows.length;
 el('issuers').innerHTML=rows.length?rows.map(r=>'<div class="issuer"><strong>'+esc(r.symbol)+' · '+esc(r.company)+'</strong>'+
  '<span class="pill">Business activity only</span><small>Referenced geographies: '+esc((r.geographies||[]).join(', '))+
  '</small><small>Commodities: '+esc((r.commodities||[]).join(', '))+'</small>'+
  '<small>Filing date: '+esc(r.filingDate)+'</small>'+link(r.sourceUrl,'Review SEC filing')+
  '<small>Site coordinates / specific event impact: NOT ESTABLISHED</small></div>').join(''):
  '<div class="empty">No matching source-anchored issuer business profiles.</div>';
}
function drawClaims(){
 el('reviewAsset').innerHTML='<option value="">Choose a saved asset claim</option>'+
  claims.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.symbol)+' · '+esc(x.assetName)+'</option>').join('');
 el('assetCount').textContent=claims.length;
 el('assets').innerHTML=claims.length?claims.map(a=>'<div class="asset"><strong>'+esc(a.symbol)+' · '+esc(a.assetName)+'</strong>'+
  '<span class="pill">Unverified local claim</span><small>'+esc(a.assetType)+' · '+esc(a.country)+'</small>'+
  '<small>Lat '+esc(a.latitude)+' · Lon '+esc(a.longitude)+'</small>'+
  '<small>SEC filed '+esc(a.issuerFilingDate)+' · coordinate source dated '+esc(a.geoEvidenceDate)+'</small>'+
  '<small>Site operation, damage, financial impact: NOT VERIFIED</small>'+
  link(a.issuerFilingUrl,'Issuer source')+' · '+link(a.geoEvidenceUrl,'Coordinate source')+'</div>').join(''):
  '<div class="empty">No geocoded asset claims exist. The three issuer filing profiles are not enough to establish a facility location.</div>';
}
async function refreshClaims(){
 const r=await api('assets');claims=r.assets||[];drawClaims();
}
function drawEvents(){
 el('eventCount').textContent=observed?.events?.length??0;
 el('events').innerHTML=observed?.events?.length?observed.events.map(x=>
  '<button class="event '+(x.id===selected?.id?'active':'')+'" type="button" data-event="'+esc(x.id)+'">'+
  '<span><strong>'+esc(x.place)+'</strong><small>'+esc(x.occurredAt)+' · '+esc(x.latitude)+'° / '+esc(x.longitude)+
  '°</small><small>USGS revised '+esc(x.providerUpdatedAt)+'</small></span><span class="mag">M'+
  esc(x.magnitude)+'</span></button>').join(''):
  '<div class="empty">No eligible events returned. This is not evidence that regional hazards are absent.</div>';
}
async function loadEvents(){
 el('loadEvents').disabled=true;status('Retrieving an approved official USGS recent-event feed…');
 try{
  observed=await api('events?tier='+encodeURIComponent(el('tier').value));selected=null;
  el('screen').disabled=true;drawEvents();
  el('selection').textContent='Choose one official event to screen.';
  el('matches').innerHTML='<div class="empty">No proximity analysis run.</div>';
  status('Official USGS feed retrieved: '+observed.coverage.displayed+
   ' events. Current feed revisions are not a historical first-available archive.');
 }catch(e){status('USGS source unavailable: '+e.message);}
 finally{el('loadEvents').disabled=false;}
}
async function screen(){
 if(!selected)return;
 el('screen').disabled=true;status('Computing bounded epicenter proximity against local unverified claims…');
 const q=new URLSearchParams({tier:el('tier').value,eventId:selected.id,radiusKm:el('radius').value});
 try{
  const r=await api('proximity?'+q.toString());
  el('matches').innerHTML=r.matches.length?r.matches.map(x=>
   '<div class="match"><strong>'+esc(x.symbol)+' · '+esc(x.assetName)+'</strong>'+
   '<span class="pill">Screening only</span><small>Epicenter distance '+esc(x.distanceKm)+' km · '+
   esc(x.assetEvidenceStatus.replace(/_/g,' '))+'</small><small>Shaking, damage, interruption and financial impact: NOT VERIFIED</small>'+
   link(x.issuerFilingUrl,'Issuer reference')+' · '+link(x.geoEvidenceUrl,'Site reference')+'</div>').join(''):
   '<div class="empty">No registered local asset claim is within the selected radius. This does not establish there are no businesses exposed.</div>';
  el('matches').insertAdjacentHTML('beforeend','<div class="match"><strong>Research pathway</strong><small>Earthquake → facilities → industry is a TEMPLATE ONLY; no connected issuer-risk model.</small>'+
  '<a href="/transmission-lab.html?scenario=earthquake-facility">Inspect earthquake hypothesis graph</a></div>');
  status(r.matches.length+' proximity candidates. Epicenter distance is not shaking intensity or financial loss. No verified site outcomes.');
 }catch(e){status('Proximity screen unavailable: '+e.message);}
 finally{el('screen').disabled=false;}
}
async function initialize(){
 try{
  const info=await api('catalog');
  drawIssuers(info.issuerBusinessProfiles||[]);
  const assets=await api('assets');registryEnabled=info.facilitiesRegisteredByAnalyst;
  claims=assets.assets||[];drawClaims();
  el('claimPanel').hidden=!registryEnabled;
  el('registryStatus').textContent=registryEnabled?
   'Local source-claim recording is enabled. Claims are never independently verified by being saved.':
   'Local recording is disabled. Set RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true on a loopback server. Official event browsing still works.';
  status('Ready. Public USGS observation lookup is keyless. Load official events to begin.');
 }catch(e){status('Geo research unavailable: '+e.message);}
}
async function submit(e){
 e.preventDefault();if(!registryEnabled)return;
 const ids=['assetName','assetType','country','issuerFilingUrl','issuerFilingDate',
  'issuerExcerpt','geoEvidenceUrl','geoEvidenceDate','geoExcerpt','notes'];
 const map={MOS:'0001285785',CF:'0001324404',IPI:'0001421461'};
 const symbol=el('issuerSymbol').value,claim={symbol,cik:map[symbol],
  latitude:Number(el('latitude').value),longitude:Number(el('longitude').value)};
 for(const id of ids)claim[id]=el(id).value;
 el('saveClaim').disabled=true;
 try{
  const r=await api('assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(claim)});
  status('Local record '+r.status+'. Facility, SEC relationship, and coordinates remain unverified until independent research.');
  await refreshClaims();el('claimForm').reset();
 }catch(err){status('Asset source claim rejected: '+err.message);}
 finally{el('saveClaim').disabled=false;}
}
async function lookupFacility(){
 const registryId=el('frsId').value.trim();
 if(!/^\d{10,14}$/.test(registryId)){el('frsResult').textContent='Enter an official 10–14 digit EPA FRS Registry ID.';return;}
 el('lookupFrs').disabled=true;
 el('frsResult').textContent='Checking the official EPA FRS Registry ID…';
 try{
  const d=await officialReview('lookup?registryId='+encodeURIComponent(registryId));
  if(!d.record){
   el('frsResult').innerHTML='<div class="source-result">No official record was returned for this exact Registry ID. This is not evidence that the facility does not exist.</div>';return;
  }
  const x=d.record;
  el('frsResult').innerHTML='<div class="source-record"><strong>'+esc(x.facilityName)+'</strong>'+
   '<small>EPA FRS Registry ID '+esc(x.registryId)+' · '+esc(x.coordinateStatus.replace(/_/g,' '))+'</small>'+
   '<small>'+esc(x.locationAddress||'Address not supplied')+', '+esc(x.city||'')+', '+esc(x.state||'')+'</small>'+
   '<small>Official NAD83 point: '+(x.latitude===null?'not available':esc(x.latitude))+
   ' / '+(x.longitude===null?'not available':esc(x.longitude))+'</small>'+
   '<small>Program links: '+esc(x.programLinks.length)+' government program identifiers; none are an SEC CIK.</small>'+
   '<small>Record retrieved at '+esc(d.fetchedAt)+' · original publication: NOT VERIFIED</small>'+
   link(d.sourceDocumentation,'EPA API documentation')+'</div>';
 }catch(e){el('frsResult').textContent='Official FRS source unavailable: '+e.message;}
 finally{el('lookupFrs').disabled=false;}
}
async function challengeFacility(){
 const registryId=el('frsId').value.trim(),assetId=el('reviewAsset').value,asOf=el('reviewAsOf').value;
 if(!assetId||!/^\d{10,14}$/.test(registryId)){
  el('challenges').textContent='Choose a saved local asset claim and valid EPA Registry ID.';return;
 }
 const q=new URLSearchParams({registryId,assetId});if(asOf)q.set('asOf',asOf);
 el('challengeClaim').disabled=true;
 el('challenges').textContent='Checking official source coordinates and open contradictions…';
 try{
  const d=await officialReview('challenge?'+q.toString());
  el('challenges').innerHTML='<div class="source-record"><strong>'+esc(d.locationStatus.replace(/_/g,' '))+'</strong>'+
   '<small>EPA location difference: '+(d.distanceKm===null?'not available':esc(d.distanceKm)+' km')+
   ' · Issuer/operator relationship: NOT VERIFIED</small>'+
   '<small>Open questions: '+esc(d.critic.issueCount)+' · Critical: '+esc(d.critic.critical)+'</small>'+
   '<small>Deterministic evidence challenger. No AI agent, internet search or claim adjudication was run.</small></div>'+
   d.critic.challenges.map(x=>'<article class="challenge"><span class="pill">'+esc(x.priority)+'</span>'+
    '<strong>'+esc(x.id.replace(/_/g,' '))+'</strong>'+
    '<p>'+esc(x.observation)+'</p><small>Required: '+esc(x.requiredProof)+'</small>'+
    '<small>Disposition: OPEN · Independently verified: NO</small></article>').join('');
 }catch(e){el('challenges').textContent='Evidence challenge unavailable: '+e.message;}
 finally{el('challengeClaim').disabled=false;}
}
el('loadEvents').addEventListener('click',()=>void loadEvents());
el('tier').addEventListener('change',()=>{observed=null;selected=null;el('screen').disabled=true;
 el('events').innerHTML='<div class="empty">Load this official feed to browse its events.</div>';});
el('events').addEventListener('click',e=>{
 const id=e.target.closest('[data-event]')?.dataset.event;
 const found=observed?.events?.find(x=>x.id===id);
 if(!found)return;
 selected=found;drawEvents();el('screen').disabled=false;
 el('selection').innerHTML='<strong>'+esc(found.place)+'</strong> · M'+esc(found.magnitude)+
  ' · '+esc(found.occurredAt)+'<br>'+link(found.sourceUrl,'Official USGS event')+
  '<br>Not a measured shaking or damage footprint.';
 el('matches').innerHTML='<div class="empty">Click Screen selected event to compare local evidence claims.</div>';
});
el('screen').addEventListener('click',()=>void screen());
el('claimForm').addEventListener('submit',e=>void submit(e));
el('lookupFrs').addEventListener('click',()=>void lookupFacility());
el('challengeClaim').addEventListener('click',()=>void challengeFacility());
void initialize();
})();