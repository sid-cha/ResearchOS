/* v0.25 geographically scoped research; no synthetic locations, ownership or damage. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
void initialize();
})();