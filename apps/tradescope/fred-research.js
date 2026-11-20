/* Official FRED researcher — all provider calls are routed through our server. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(n):'—';
const badge=(x)=>'<small>'+esc(x||'Not available')+'</small>';
const api=async(route)=>{const response=await fetch('/api/fred-explorer/'+route,{cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'FRED service unavailable');return data;};
let selected='T10Y3M';
function setId(id){selected=id;$('seriesId').value=id;}
const error=(id,e)=>{$(id).innerHTML='<div class="empty">'+esc(e.message)+'</div>';};
async function search(e){
 e?.preventDefault?.();const q=$('query').value.trim();$('searchStatus').textContent='Searching official FRED series metadata…';
 try{
  const d=await api('search?q='+encodeURIComponent(q));
  $('results').innerHTML=d.series.length?d.series.map(s=>'<button type="button" data-id="'+esc(s.id)+'"><strong>'+
   esc(s.id)+' · '+esc(s.title)+'</strong>'+badge(s.units)+'<small>'+esc(s.frequency)+'</small></button>').join(''):
   '<div class="empty">No matching official series were returned.</div>';
  $('searchStatus').textContent=d.series.length+' results; these are directory matches, not validated economic signals.';
 }catch(err){$('searchStatus').textContent=err.message;error('results',err);}
}
async function read(kind){
 const id=$('seriesId').value.trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9._-]{0,39}$/.test(id)){$('metadata').textContent='Enter a valid series ID.';return;}
 setId(id);
 const output=$('metadata');output.innerHTML='<div class="empty">Reading FRED source records…</div>';
 try{
  const d=await api(kind+'?id='+encodeURIComponent(id));
  if(kind==='series')output.innerHTML=d.series.map(x=>'<div class="row"><strong>'+esc(x.id)+' · '+esc(x.title)+'</strong>'+
    badge('Frequency: '+x.frequency)+' '+badge('Units: '+x.units)+'<small>Original span: '+esc(x.observationStart)+' to '+esc(x.observationEnd)+'</small>'+
    (x.sourceUrl?'<a target="_blank" rel="noopener noreferrer" href="'+esc(x.sourceUrl)+'">Official FRED series</a>':'')+'</div>').join('');
  else if(kind==='vintages')output.innerHTML='<div class="row"><strong>Recorded value revision dates</strong><p>'+esc(d.note)+'</p>'+
   '<div class="date-list">'+d.dates.map(date=>'<span>'+esc(date)+'</span>').join('')+'</div></div>';
  else{
   output.innerHTML=d.releases.map(r=>'<div class="row"><strong>'+esc(r.id)+' · '+esc(r.label)+'</strong>'+
    '<small>Calendar ID '+esc(r.id)+' · not a time-of-day availability guarantee</small>'+
    '<button type="button" data-release="'+esc(r.id)+'">Select release ID</button></div>').join('')||
    '<div class="empty">No source releases returned.</div>';
  }
 }catch(e){error('metadata',e);}
}
async function history(){
 const id=$('seriesId').value.trim().toUpperCase(),asOf=$('asOf').value,months=$('months').value;
 $('history').innerHTML='<div class="empty">Fetching historical as-of values…</div>';
 try{
  const d=await api('observations?id='+encodeURIComponent(id)+'&asOf='+encodeURIComponent(asOf)+'&months='+encodeURIComponent(months));
  $('history').innerHTML='<div class="row"><strong>'+esc(id)+' · available by calendar date '+esc(d.asOf)+'</strong><small>'+esc(d.note)+'</small></div>'+
   (d.observations.length?d.observations.slice(0,50).map(x=>'<div class="row"><strong>'+esc(x.date)+' · '+fmt(x.value)+'</strong>'+
    badge('Vintage '+x.vintageStart+' through '+x.vintageEnd)+'</div>').join(''):
    '<div class="empty">No released values in this calendar window.</div>');
 }catch(e){error('history',e);}
}
async function releaseDates(){
 const releaseId=$('releaseId').value;
 $('releaseDates').innerHTML='<div class="empty">Loading source release calendar…</div>';
 try{
  const d=await api('releaseDates?releaseId='+encodeURIComponent(releaseId));
  $('releaseDates').innerHTML='<div class="row"><strong>Official calendar</strong><small>'+esc(d.note)+'</small>'+
   '<div class="date-list">'+d.dates.map(x=>'<span>'+esc(x.date)+'</span>').join('')+'</div></div>';
 }catch(e){error('releaseDates',e);}
}
$('searchForm').addEventListener('submit',e=>void search(e));
$('results').addEventListener('click',e=>{
 const id=e.target.closest('[data-id]')?.dataset.id;
 if(id){setId(id);void read('series');}
});
$('metadata').addEventListener('click',e=>{const id=e.target.closest('[data-release]')?.dataset.release;
 if(id){$('releaseId').value=id;void releaseDates();}
});
$('loadSeries').addEventListener('click',()=>void read('series'));
$('loadVintages').addEventListener('click',()=>void read('vintages'));
$('loadRelease').addEventListener('click',()=>void read('release'));
$('loadHistory').addEventListener('click',()=>void history());
$('loadReleaseDates').addEventListener('click',()=>void releaseDates());
setId(selected);
void api('catalog').then(x=>{
 $('searchStatus').textContent=x.configured?'FRED key configured locally. Search official series to begin.':
 'FRED_API_KEY is not configured on the local server. Add a freshly issued key to .env.';
}).catch(e=>{$('searchStatus').textContent=e.message;});
})();