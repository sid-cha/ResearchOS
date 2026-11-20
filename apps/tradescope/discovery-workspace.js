/* TradeScope issuer discovery -> watchlist -> SEC filing -> source archive -> investigation.
 * All writes remain explicitly local and server-side; never claim signup/auth.
 */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 if(!$('discoverySearch')||!$('researchPanelDiscovery'))return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeUrl=value=>{try{const u=new URL(value);return u.origin==='https://www.sec.gov'&&u.pathname.startsWith('/Archives/edgar/data/')?u.href:null;}catch{return null;}};
 const state={selected:null,registered:[],matches:[],watchlists:[],watchlist:null,filings:[],filing:null,analysis:null,archive:[],active:false,busy:false,version:0};
 const status=(message,error=false)=>{const node=$('discoveryStatus');node.textContent=message;node.className='research-status'+(error?' is-error':'');};
 async function request(url,{method='GET',data}={}){
  const response=await fetch(url,{method,cache:'no-store',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||`Local research request failed (${response.status})`);
  return result;
 }
 async function action(message,task){if(state.busy)return;state.busy=true;status(message);$('discoverySearchButton').disabled=true;
  try{await task();}catch(e){status(e.message||'Research operation unavailable.',true);}
  finally{state.busy=false;$('discoverySearchButton').disabled=false;}}
 const selectedSymbol=()=>state.selected?.symbol||'';
 const registered=()=>state.registered.some(item=>item.symbol===selectedSymbol());
 function renderSelection(){
  $('discoverySelected').textContent=state.selected?`${state.selected.symbol} · ${state.selected.name||'Issuer name unavailable'} · ${state.selected.identitySource||'Registered metadata'}`:'Select an issuer before researching filings.';
  $('discoveryRegister').disabled=!state.selected||registered();
  $('discoveryLoadIssuer').disabled=!registered();
  $('discoveryRegisteredCount').textContent=`${state.registered.length} REGISTERED / UP TO 50`;
  if(!state.watchlist && !$('discoveryWatchSymbols').value.trim()) $('discoveryWatchSymbols').value=selectedSymbol();
 }
 function renderMatches(){
  const results=$('discoveryMatches');
  results.innerHTML=state.matches.length?state.matches.map(x=>`<button type="button" data-discovery-symbol="${escape(x.symbol)}" class="discovery-match"><strong>${escape(x.symbol)}</strong><span>${escape(x.name)}</span><small>${escape(x.identitySource||'SEC issuer directory')}</small></button>`).join(''):'<div class="research-empty">No issuer matches loaded. Search by ticker or name.</div>';
  results.querySelectorAll('[data-discovery-symbol]').forEach(btn=>btn.addEventListener('click',()=>select(state.matches.find(item=>item.symbol===btn.dataset.discoverySymbol))));
 }
 function renderWatchlists(){
  const select=$('discoveryWatchlistSelect');const id=state.watchlist?.id||'';
  select.innerHTML='<option value="">Create new watchlist…</option>'+state.watchlists.map(w=>`<option value="${escape(w.id)}">${escape(w.name)} · ${w.symbols.length} symbols · rev ${w.revision}</option>`).join('');
  select.value=state.watchlists.some(w=>w.id===id)?id:'';
 }
 function select(item){state.selected=item;state.version++;state.filings=[];state.filing=null;state.analysis=null;state.archive=[];renderSelection();renderFilings();renderArchive();$('discoveryFilingDetail').textContent='Load an issuer and select a filing to read its cited evidence.';}
 async function syncCatalog(){const result=await request('/api/discovery/instruments');state.registered=result.instruments||[];renderSelection();}
 async function syncWatchlists(){const result=await request('/api/discovery/watchlists');state.watchlists=result.watchlists||[];if(state.watchlist)state.watchlist=state.watchlists.find(w=>w.id===state.watchlist.id)||null;renderWatchlists();}
 async function search(){const q=$('discoverySearch').value.trim();if(!q){status('Enter an issuer name or ticker.',true);return;}
  await action('Searching the SEC issuer directory…',async()=>{
   const result=await request('/api/discovery/search?q='+encodeURIComponent(q));state.matches=result.results||[];renderMatches();
   status(`${state.matches.length} displayed results · SEC directory coverage may be partial. Registration does not subscribe a symbol to a live feed.`);
  });
 }
 async function register(){if(!state.selected)return;await action('Registering sourced issuer identity…',async()=>{
  const result=await request('/api/discovery/register',{method:'POST',data:{symbol:selectedSymbol()}});await syncCatalog();
  select(result.instrument);status(`${result.instrument.symbol} registered. You can now load SEC filings or add it to a local watchlist.`);
 });}
 async function saveWatchlist(){const name=$('discoveryWatchName').value.trim(),symbols=$('discoveryWatchSymbols').value.toUpperCase().split(/[\s,]+/).filter(Boolean);
  if(!name||!symbols.length){status('Enter a watchlist name and at least one registered symbol.',true);return;}
  await action('Saving revision-controlled local watchlist…',async()=>{
   const current=state.watchlist;const result=await request('/api/discovery/watchlist',{method:current?'PATCH':'POST',data:{...current?.id?{id:current.id,expectedRevision:current.revision}:{},name,symbols}});
   state.watchlist=result.watchlist;await syncWatchlists();status(`${state.watchlist.name} saved · revision ${state.watchlist.revision}. Live feed subscriptions remain separate.`);
  });
 }
 async function loadIssuer(){if(!registered())return;const symbol=selectedSymbol(),generation=++state.version;
  await action('Loading official SEC filing metadata and local archive…',async()=>{
   const [filings,archive,fin]=await Promise.allSettled([
    request('/api/discovery/filings?symbol='+encodeURIComponent(symbol)),
    request('/api/regulatory/archive?symbol='+encodeURIComponent(symbol)),
    request('/api/discovery/fundamentals?symbol='+encodeURIComponent(symbol))]);
   if(generation!==state.version)return;
   if(filings.status==='fulfilled'){state.filings=filings.value.filings||[];renderFilings();}
   else{$('discoveryFilingList').textContent='SEC filing metadata unavailable: '+filings.reason.message;}
   if(archive.status==='fulfilled'){state.archive=archive.value.events||[];renderArchive();}
   else{$('discoveryArchiveList').textContent='Archive unavailable: '+archive.reason.message;}
   if(fin.status==='fulfilled'){
    const a=fin.value.annual||{},r=fin.value.ratios||{};
    const items=[['Revenue',a.revenue?.value],['Net income',a.netIncome?.value],['Annual net margin %',r.annualNetMarginPct]];
    $('discoveryCompanyFacts').textContent=items.map(([k,v])=>`${k}: ${Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:2}):'unavailable'}`).join(' · ')+' · SEC facts; not real-time market coverage';
   }else $('discoveryCompanyFacts').textContent='Company facts unavailable: '+fin.reason.message;
   status(`SEC issuer ${symbol}: ${state.filings.length} recent filing records and ${state.archive.length} captured events. Select one filing to inspect cited passages.`);
  });
 }
 function renderFilings(){const node=$('discoveryFilingList');node.innerHTML=state.filings.length?state.filings.map(f=>`<button type="button" data-accession="${escape(f.accession)}"><strong>${escape(f.form)}</strong> ${escape(f.filingDate||'Date unavailable')} · ${escape(f.accession)}</button>`).join(''):'<div class="research-empty">Load a registered issuer to retrieve its recent SEC filings.</div>';
  node.querySelectorAll('[data-accession]').forEach(btn=>btn.addEventListener('click',()=>{state.filing=state.filings.find(f=>f.accession===btn.dataset.accession);state.analysis=null;renderAnalysis();}));
 }
 function renderAnalysis(){const node=$('discoveryFilingDetail');if(!state.filing){node.textContent='Select a filing above.';return;}
  const a=state.analysis;
  node.innerHTML=`<p><strong>${escape(state.filing.form)} · ${escape(state.filing.accession)}</strong></p>`+
   (safeUrl(state.filing.sourceUrl)?`<p><a href="${escape(safeUrl(state.filing.sourceUrl))}" target="_blank" rel="noopener noreferrer">Official SEC filing</a></p>`:'')+
   (a?`<p>Classifications: ${a.classifications?.length?escape(a.classifications.map(c=>c.label).join(' · ')):'No supported source-cited classification'}</p><p>${a.evidence?.length||0} cited source passages. Reported publication precision: ${escape(a.publicationTimePrecision||'unavailable')}. Retrospective: ${a.retrospective?'yes':'no'}.</p>`:'<p>Read the source before capture. A form title alone is not evidence of misconduct.</p>')+
   '<div class="research-actions"><button type="button" id="discoveryAnalyze">ANALYZE SOURCE</button><button type="button" id="discoveryCapture" '+(!a?'disabled':'')+'>CAPTURE REVISION (LOCAL)</button></div>';
  $('discoveryAnalyze').addEventListener('click',analyze);$('discoveryCapture').addEventListener('click',capture);
 }
 async function analyze(){if(!state.filing)return;const accession=state.filing.accession,symbol=selectedSymbol(),generation=state.version;
  await action('Extracting source-cited filing evidence…',async()=>{
   const out=await request(`/api/regulatory/filing-analysis?symbol=${encodeURIComponent(symbol)}&accession=${encodeURIComponent(accession)}`);
   if(generation!==state.version)return;state.analysis=out.analysis;renderAnalysis();status(`Read ${state.filing.form}. Source classification is not a finding of regulatory wrongdoing.`);
  });
 }
 async function capture(){if(!state.filing||!state.analysis)return;const symbol=selectedSymbol(),accession=state.filing.accession;
  await action('Capturing the actual observation time and exact content revision…',async()=>{
   const out=await request('/api/regulatory/capture',{method:'POST',data:{symbol,accession}});
   const result=await request('/api/regulatory/archive?symbol='+encodeURIComponent(symbol));state.archive=result.events||[];renderArchive();
   status(`Archive ${out.archive.action}: revision ${out.archive.revisionId}. Alert: ${out.corporate.action}. Original filing and captured time retained.`);
  });
 }
 function renderArchive(){const node=$('discoveryArchiveList');node.innerHTML=state.archive.length?state.archive.map(entry=>`<article class="discovery-archive-entry"><strong>${escape(entry.latest?.event?.form||'SEC')} · ${escape(entry.latest?.event?.headline||entry.id)}</strong><small>Observed ${escape(entry.firstObservedAt||'unknown')} · ${escape(entry.revisionCount)} revisions · ${escape(entry.latest?.knowledgeStatus||'')}</small><button type="button" data-archive-event="${escape(entry.id)}" data-archive-revision="${escape(entry.latestRevisionId)}">OPEN EXACT REVISION IN INVESTIGATIONS</button><button type="button" data-archive-history="${escape(entry.id)}">VIEW REVISION HISTORY</button><div class="discovery-archive-detail" data-archive-detail="${escape(entry.id)}"></div></article>`).join(''):'<div class="research-empty">No SEC event revisions have been captured in this local workstation.</div>';
  node.querySelectorAll('[data-archive-event]').forEach(btn=>btn.addEventListener('click',()=>investigate(btn.dataset.archiveEvent,btn.dataset.archiveRevision)));
  node.querySelectorAll('[data-archive-history]').forEach(btn=>btn.addEventListener('click',()=>loadHistory(btn.dataset.archiveHistory)));
 }
 async function loadHistory(eventId){await action('Loading immutable archive revisions…',async()=>{
   const res=await request('/api/regulatory/archive/revisions?eventId='+encodeURIComponent(eventId));
   const target=[...$('discoveryArchiveList').querySelectorAll('[data-archive-detail]')].find(e=>e.dataset.archiveDetail===eventId);if(!target)return;
   target.innerHTML=(res.revisions||[]).map(rev=>`<div class="discovery-history-line"><span>v${rev.version} · captured ${escape(rev.capturedAt)} · ${escape(rev.knowledgeStatus)}</span><button type="button" data-pick-revision="${escape(rev.id)}">INVESTIGATE v${rev.version}</button></div>`).join('')||'No revisions available.';
   target.querySelectorAll('[data-pick-revision]').forEach(btn=>btn.addEventListener('click',()=>investigate(eventId,btn.dataset.pickRevision)));
   status('Knowledge-time revisions shown in the order this system captured them; source publication can predate capture.');
  });}
 async function investigate(eventId,revisionId){const symbol=selectedSymbol();await action('Saving immutable SEC evidence into an investigation…',async()=>{
   const out=await request('/api/regulatory/investigate',{method:'POST',data:{eventId,revisionId,symbol}});
   status('Investigation '+out.case.id+' opened from archived revision '+revisionId+'.');
   document.querySelector('[data-nav="cases"]')?.click();
   if(window.TradeScopeCases?.openById)await window.TradeScopeCases.openById(out.case.id);
  });}
 function chooseWatchlist(){const id=$('discoveryWatchlistSelect').value;state.watchlist=state.watchlists.find(item=>item.id===id)||null;
  $('discoveryWatchName').value=state.watchlist?.name||'';$('discoveryWatchSymbols').value=state.watchlist?.symbols.join(', ')||selectedSymbol();
 }
 $('discoverySearchButton').addEventListener('click',search);$('discoverySearch').addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();search();}});
 $('discoveryRegister').addEventListener('click',register);$('discoveryLoadIssuer').addEventListener('click',loadIssuer);
 $('discoveryWatchSave').addEventListener('click',saveWatchlist);$('discoveryWatchlistSelect').addEventListener('change',chooseWatchlist);
 document.addEventListener('tradescope:research-tab',ev=>{
  state.active=ev.detail?.tab==='discovery';if(!state.active)return;
  if(state.registered.length)return;
  void action('Loading registered issuer identities and local watchlists…',async()=>{await Promise.all([syncCatalog(),syncWatchlists()]);status('Search the SEC issuer directory and register the company before loading filings.');});
 });
 renderSelection();renderMatches();renderWatchlists();renderFilings();renderArchive();
})();