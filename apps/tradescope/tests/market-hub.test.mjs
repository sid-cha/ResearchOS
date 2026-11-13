import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {ETF_CATALOG,FINANCIAL_METRICS,normalizeCompanyFinancials,createMarketHub,createMarketHubApi} from '../lib/market-hub.mjs';

const date=()=>new Date('2026-11-13T17:00:00Z');
const bar=(day,price,volume=100)=>({t:day+'T17:00:00Z',o:price,h:price+1,l:price-1,c:price,v:volume});
const bars={SPY:[
 bar('2026-11-09',100),bar('2026-11-10',102),bar('2026-11-11',105),
 bar('2026-11-12',110),bar('2026-11-13',500), // unfinished current session excluded
 {t:'bad',o:0,h:0,l:0,c:0,v:-5}
],QQQ:[bar('2026-11-09',200),bar('2026-11-10',210),bar('2026-11-11',210),bar('2026-11-12',220)]};
const resp=(body,status=200,type='application/json')=>new Response(typeof body==='string'?body:JSON.stringify(body),
 {status,headers:{'content-type':type}});
const env={APCA_API_KEY_ID:'testing-app-key',APCA_API_SECRET_KEY:'testing-secret',
 FRED_API_KEY:'1234567890abcdef1234567890abcdef'};
const fact=(start,end,filed,val,form='10-K')=>({start,end,filed,val,form,fp:'FY'});
const sec={
 cik:320193,entityName:'Example Corp',
 facts:{'us-gaap':{
  RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[
   fact('2023-01-01','2023-12-31','2024-02-20',100e9),
   fact('2024-01-01','2024-12-31','2025-02-20',120e9),
   fact('2025-01-01','2025-12-31','2026-02-20',900e9),
   fact('2024-01-01','2024-12-31','2026-01-20',125e9)
  ]}},
  NetIncomeLoss:{units:{USD:[
   fact('2023-01-01','2023-12-31','2024-02-20',15e9),
   fact('2024-01-01','2024-12-31','2025-02-20',24e9)
  ]}},
  EarningsPerShareDiluted:{units:{'USD/shares':[
   fact('2024-01-01','2024-12-31','2025-02-20',8.50)
  ]}}
 }}
};
const dataEndpoint=async(url)=>{
 if(url.includes('data.alpaca.markets'))return resp({bars,next_page_token:null});
 if(url.includes('api.stlouisfed.org'))return resp({observations:[
  {date:'2026-11-10',value:'3.5'},
  {date:'2026-11-11',value:'.'},
  {date:'2026-11-12',value:'3.7'}
 ]});
 throw Error('Unexpected official endpoint');
};
test('catalog is a finite curated research reference, not 5,000 stocks or claims of holdings exposure',()=>{
 const service=createMarketHub({fetchImpl:dataEndpoint,env,now:date});
 const c=service.catalog();
 assert.equal(c.schemaVersion,1);
 assert(c.etfs.length>=40);
 assert(c.groups.includes('Technology Themes'));
 assert(c.groups.includes('Materials & Mining'));
 assert(c.groups.includes('Financial Themes'));
 assert(c.financialMetrics.some(m=>m.id==='revenue'));
 assert(c.macroSeries.some(m=>m.id==='DGS10'));
 assert.equal(c.capacity.maxSymbolsPerQuery,10);
 assert.equal(c.capacity.equityFinancials,8);
 assert(c.limitations.some(x=>x.includes('5,000')));
 assert(ETF_CATALOG.every(x=>x.classification==='CURATED_RESEARCH_GROUP_NOT_LIVE_HOLDINGS'));
 assert(FINANCIAL_METRICS.find(x=>x.id==='revenue').unit==='USD');
});
test('market history restricts source, symbols and range; excludes unfinished session and never invents missing long return',async()=>{
 const requests=[];
 const service=createMarketHub({fetchImpl:async(url,opts)=>{requests.push({url,opts});return dataEndpoint(url)},env,now:date});
 const result=await service.series(['SPY','QQQ'],'3Y');
 assert.equal(result.source,'ALPACA_IEX');
 assert.equal(result.adjustment,'SPLIT_ONLY_NOT_DIVIDENDS');
 assert.equal(result.values.SPY.bars.length,4);
 assert.equal(result.values.SPY.last.close,110);
 assert.equal(result.values.SPY.last.date,'2026-11-12');
 assert.equal(result.values.SPY.returns.d1,Number(((110/105-1)*100).toFixed(4)));
 assert.equal(result.values.SPY.returns.y1,null);
 assert.equal(result.values.SPY.returns.y3,null);
 assert.equal(result.values.SPY.returns.ytd,null);
 assert.equal(result.values.SPY.range52w,null);
 assert.equal(requests.length,1);
 const u=new URL(requests[0].url);
 assert.equal(u.origin,'https://data.alpaca.markets');
 assert.equal(u.pathname,'/v2/stocks/bars');
 assert.equal(u.searchParams.get('feed'),'iex');
 assert.equal(u.searchParams.get('adjustment'),'split');
 assert.equal(u.searchParams.get('symbols'),'SPY,QQQ');
 assert.equal(requests[0].opts.redirect,'error');
 assert(!JSON.stringify(result).includes('testing-secret'));
 await service.series(['SPY','QQQ'],'3Y');
 assert.equal(requests.length,1);
 await assert.rejects(service.series(['SPY','SPY'],'1Y'),e=>e.status===400);
 await assert.rejects(service.series(['NOT_REGISTERED'],'1Y'),e=>e.status===400);
 await assert.rejects(service.series(['SPY'],'20Y'),e=>e.status===400);
 await assert.rejects(service.series(Array(11).fill('AAPL'),'3Y'),e=>e.status===400);
});
test('explicitly registered issuers can be researched, while unregistered symbols cannot access market source',async()=>{
 let validated=0;
 const service=createMarketHub({fetchImpl:dataEndpoint,env,now:date,
  validateSymbol:async symbol=>{validated++;return symbol==='JPM';}});
 const result=await service.series(['JPM'],'1Y');
 assert.equal(result.values.JPM.last,null);
 assert.equal(result.values.JPM.returns.d1,null);
 assert.equal(validated,1);
 await assert.rejects(service.series(['ABC'],'1Y'),e=>e.status===400);
});
test('malformed provider history, entitlement and response size failure never turn into plausible price values',async()=>{
 const base={env,now:date};
 const noKey=createMarketHub({now:date,env:{},fetchImpl:dataEndpoint});
 await assert.rejects(noKey.series(['SPY'],'1Y'),e=>e.status===503);
 const bad=createMarketHub({...base,fetchImpl:async()=>resp({bars:[]})});
 await assert.rejects(bad.series(['SPY'],'1Y'),e=>e.status===502);
 const denied=createMarketHub({...base,fetchImpl:async()=>resp('upstream SECRET',401)});
 await assert.rejects(denied.series(['SPY'],'1Y'),e=>e.status===503&&!e.message.includes('SECRET'));
 const massive=createMarketHub({...base,fetchImpl:async()=>resp('x'.repeat(2100100))});
 await assert.rejects(massive.series(['SPY'],'1Y'),e=>e.status===502);
});
test('SEC annual financial history respects filing cutoff and never treats latest revision as historic point-in-time',()=>{
 const out=normalizeCompanyFinancials(sec,{symbol:'AAPL',asOf:'2025-12-31',now:date});
 assert.equal(out.source,'SEC_EDGAR_XBRL');
 assert.equal(out.company,'Example Corp');
 assert.deepEqual(out.series.revenue.map(x=>x.value),[100e9,120e9]);
 assert.equal(out.series.revenue.at(-1).filedAt,'2025-02-20');
 assert.equal(out.series.revenueGrowth.at(-1).value,20);
 assert.equal(out.series.netMargin.at(-1).value,20);
 assert.equal(out.series.eps.at(-1).value,8.5);
 assert(!out.series.revenue.some(x=>x.value===900e9));
 assert.equal(out.metrics.find(x=>x.id==='eps').unit,'USD/share');
 assert(out.limitations.some(x=>x.includes('calendar')));
 const now=normalizeCompanyFinancials(sec,{symbol:'AAPL',asOf:'2026-11-12',now:date});
 assert.equal(now.series.revenue.at(-1).value,900e9);
 assert.equal(now.series.revenue.find(x=>x.fiscalEnd==='2024-12-31').value,125e9);
 assert.throws(()=>normalizeCompanyFinancials(sec,{symbol:'AAPL',asOf:'2027-01-01',now:date}),e=>e.status===400);
});
test('registered SEC historical source adapter and FRED latest/current-revision semantics',async()=>{
 const service=createMarketHub({fetchImpl:dataEndpoint,now:date,env,
  companyFacts:async symbol=>({symbol,facts:sec}),validateSymbol:async x=>x==='JPM'});
 const f=await service.financials('JPM','2025-12-31');
 assert.equal(f.series.revenue.at(-1).value,120e9);
 assert.equal(f.source,'SEC_EDGAR_XBRL');
 const macro=await service.macro('DGS10',10);
 assert.equal(macro.source,'FRED_CURRENT_REVISION');
 assert.equal(macro.latest.value,3.7);
 assert.equal(macro.latest.date,'2026-11-12');
 assert.equal(macro.history.length,2);
 assert.equal(macro.history.at(-1).value,3.7);
 await assert.rejects(service.macro('EVIL',10),e=>e.status===400);
 await assert.rejects(service.macro('DGS10',100),e=>e.status===400);
 await assert.rejects(service.financials('EVIL','2026-01-01'),e=>e.status===400);
});
test('market-hub read-only API delivers catalog/history/SEC/FRED and rejects unknown or duplicated query params',async t=>{
 const service=createMarketHub({fetchImpl:dataEndpoint,now:date,env,companyFacts:async()=>({facts:sec})});
 const handler=createMarketHubApi({service});
 const server=http.createServer((req,res)=>void handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port+'/api/market-hub/';
 assert.equal((await fetch(root+'catalog')).status,200);
 const bars=await (await fetch(root+'series?symbols=SPY&range=1Y')).json();
 assert.equal(bars.values.SPY.asOf,'2026-11-12');
 assert.equal((await fetch(root+'financials?symbol=AAPL')).status,200);
 assert.equal((await fetch(root+'macro?id=DGS10&years=1')).status,200);
 assert.equal((await fetch(root+'series?symbols=SPY&symbols=QQQ&range=1Y')).status,400);
 assert.equal((await fetch(root+'series?symbols=SPY&range=1Y&url=https://evil.invalid')).status,400);
 assert.equal((await fetch(root+'financials?symbol=AAPL&asOf=2050-01-01')).status,400);
 assert.equal((await fetch(root+'unknown')).status,400);
 assert.equal((await fetch(root+'catalog',{method:'POST'})).status,405);
});
test('original market UI is self-contained, complete and JS syntax-valid; all controls have static counterpart',async()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const html=await fs.readFile(path.join(root,'market-hub.html'),'utf8');
 const css=await fs.readFile(path.join(root,'market-hub.css'),'utf8');
 const js=await fs.readFile(path.join(root,'market-hub.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'market-hub.js'}));
 assert(html.includes('href="/market-hub.css"'));
 assert(html.includes('src="/market-hub.js"'));
 for(const id of ['tickerSearch','tickerMatches','tickerButtons','navTabs','view-overview','view-dashboard','view-compare',
  'view-financials','view-watchlists','view-screener','view-themes','view-macro','overviewGroups','dashboardCharts',
  'financialTable','themeTable','macroCards','watchEditForm','savedWatchlists','compareChart','compareAdd']){
  assert(html.includes('id="'+id+'"'),'Missing controlled market UI node '+id);
 }
 assert(css.includes('[data-theme=dark]'));
 assert(!js.includes('Math.random('));
});
