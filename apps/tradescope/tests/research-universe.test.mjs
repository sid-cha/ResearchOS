import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createResearchUniverse} from '../lib/research-universe.mjs';

const NOW=Date.parse('2026-11-13T01:00:00Z'),URL='https://www.sec.gov/files/company_tickers_exchange.json';
const instrument=(symbol='COST',cik='0000909832')=>({instrumentId:'US_EQUITY:'+symbol,symbol,name:symbol+' Official Company',cik,issuerId:'SEC_CIK:'+cik,
 identitySource:'SEC_COMPANY_TICKERS_EXCHANGE',sourceUrl:URL,verifiedAt:'2026-11-13T00:00:00Z',exchange:'Nasdaq',type:'equity',sector:'DO_NOT_INFER',rawProvider:{secret:'PRIVATE'}});
async function harness(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'research-universe-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const filename=join(directory,'universe.json');let resolves=0;
 const create=more=>createResearchUniverse({filename,now:()=>NOW,searchDirectory:async()=>({results:[instrument()],fetchedAt:'2026-11-13T00:00:00Z'}),resolveDirectory:async symbol=>{resolves++;return instrument(symbol);},...options,...more});
 return {directory,filename,universe:create(),create,resolves:()=>resolves};
}

test('initial pilot stays available without directory calls and seed identity is not presented as newly verified',async t=>{
 const h=await harness(t),items=await h.universe.listInstruments();assert.equal(items.length,10);
 const msft=await h.universe.getInstrument('MSFT');assert.equal(msft.cik,'0000789019');assert.equal(msft.issuerId,'SEC_CIK:0000789019');
 assert.equal(msft.identitySource,'TRADESCOPE_SEED_MAPPING');assert.equal(msft.verifiedAt,null);
 assert.equal((await h.universe.getInstrument('SPY')).secCompanySupported,false);
 assert.deepEqual(await h.universe.register('MSFT'),msft);assert.equal(h.resolves(),0);
 await assert.rejects(h.universe.getInstrument('COST'),{status:404});await assert.rejects(h.universe.register('../COST'),{status:400});
});

test('search preserves official provenance, sanitizes optional metadata and degrades to local registered matches',async t=>{
 const h=await harness(t),result=await h.universe.search('cost');assert.equal(result.results[0].identitySource,'SEC_COMPANY_TICKERS_EXCHANGE');
 assert.equal(result.results[0].type,'unknown');assert.equal(result.results[0].sector,null);assert.equal(result.results[0].classification,'unavailable');
 assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes('DO_NOT_INFER'));
 assert.equal((await h.universe.listInstruments()).length,10,'search does not silently register matches');
 const degraded=h.create({searchDirectory:async()=>{throw Object.assign(Error('PRIVATE_PROVIDER_FAILURE'),{status:503});}});
 const local=await degraded.search('microsoft');assert.equal(local.results[0].symbol,'MSFT');assert.equal(local.errors[0].status,503);
 assert(!JSON.stringify(local).includes('PRIVATE_PROVIDER_FAILURE'));await assert.rejects(degraded.search(''),{status:400});await assert.rejects(degraded.search('x',{limit:21}),{status:400});
});

test('exact issuer registration survives restart and drops untrusted/raw fields',async t=>{
 const h=await harness(t),registered=await h.universe.register('COST');assert.equal(registered.registeredAt,new Date(NOW).toISOString());
 assert.equal(registered.issuerId,'SEC_CIK:0000909832');assert.equal(registered.type,'unknown');
 assert.equal((await h.create().getInstrument('COST')).sourceUrl,URL);assert.equal((await h.create().listInstruments()).length,11);
 const text=await readFile(h.filename,'utf8');assert(!text.includes('PRIVATE'));assert(!text.includes('rawProvider'));assert(!text.includes('DO_NOT_INFER'));
 if(process.platform!=='win32')assert.equal((await stat(h.filename)).mode&0o777,0o600);
});

test('registration coalesces a symbol and rejects mismatched or malformed official identities',async t=>{
 const h=await harness(t);await Promise.all(Array.from({length:8},()=>h.universe.register('COST')));assert.equal(h.resolves(),1);
 for(const modify of [value=>({...value,symbol:'OTHER',instrumentId:'US_EQUITY:OTHER'}),value=>({...value,sourceUrl:'https://external.example'}),value=>({...value,issuerId:'SEC_CIK:0000000001'}),value=>({...value,verifiedAt:null})]){
  const unsafe=h.create({resolveDirectory:async()=>modify(instrument('GOOG'))});await assert.rejects(unsafe.register('GOOG'),{status:502});
 }
});

test('watchlist create/edit/delete enforces revisions and persists only registered symbols',async t=>{
 const h=await harness(t);await h.universe.register('COST');
 const first=await h.universe.saveWatchlist({name:'My research',symbols:['MSFT','COST'],apiKey:'PRIVATE'});assert.equal(first.revision,1);
 const edited=await h.universe.saveWatchlist({...first,name:'Updated',symbols:['COST']},{expectedRevision:1});assert.equal(edited.id,first.id);assert.equal(edited.revision,2);
 const reopened=h.create();assert.equal((await reopened.getWatchlist(first.id)).name,'Updated');assert.deepEqual((await reopened.listWatchlists())[0].symbols,['COST']);
 await assert.rejects(h.universe.saveWatchlist({...first,symbols:['MSFT']},{expectedRevision:1}),{status:409});
 await assert.rejects(h.universe.saveWatchlist({name:'Unknown',symbols:['GOOG']}),{status:400});
 await assert.rejects(h.universe.deleteWatchlist(first.id,{expectedRevision:1}),{status:409});
 assert.deepEqual(await h.universe.deleteWatchlist(first.id,{expectedRevision:2}),{id:first.id,deleted:true});
 assert.equal((await h.universe.listWatchlists()).length,0);assert(!JSON.stringify(edited).includes('PRIVATE'));
});

test('bounded watchlists allow an empty draft but reject duplicates, invalid names and overflow',async t=>{
 const h=await harness(t,{maxWatchlists:1,maxWatchlistSymbols:2});const empty=await h.universe.saveWatchlist({name:'Draft',symbols:[]});assert.deepEqual(empty.symbols,[]);
 await assert.rejects(h.universe.saveWatchlist({name:'Another',symbols:[]}),{status:409});
 for(const value of [{name:'',symbols:[]},{name:'x'.repeat(121),symbols:[]},{name:'Duplicate',symbols:['MSFT','MSFT']},{name:'Too many',symbols:['MSFT','AAPL','NVDA']},{name:'Invalid',symbols:['msft']}])await assert.rejects(h.universe.saveWatchlist(value),{status:400});
});

test('registration storage limit is checked before another upstream lookup',async t=>{
 const h=await harness(t,{maxInstruments:11});await h.universe.register('COST');
 await assert.rejects(h.universe.register('GOOG'),{status:409});assert.equal(h.resolves(),1);
});

test('failed atomic persistence does not mutate cached instruments or watchlists',async t=>{
 const h=await harness(t);await h.universe.listInstruments();await mkdir(h.filename);
 await assert.rejects(h.universe.register('COST'));assert.equal((await h.universe.listInstruments()).length,10);
 await assert.rejects(h.universe.saveWatchlist({name:'Will fail',symbols:['MSFT']}));assert.equal((await h.universe.listWatchlists()).length,0);
 await rm(h.filename,{recursive:true});const good=await h.universe.register('COST');assert.equal(good.symbol,'COST');
});

test('malformed, oversized or foreign-source persistent state fails closed without exposing file paths',async t=>{
 const h=await harness(t);await writeFile(h.filename,'not-json');await assert.rejects(h.create().listInstruments(),error=>error.status===500&&!error.message.includes(h.filename));
 await writeFile(h.filename,'x'.repeat(524289));await assert.rejects(h.create().listInstruments(),{status:500});
 await rm(h.filename);await h.universe.register('COST');const body=JSON.parse(await readFile(h.filename,'utf8'));body.instruments.at(-1).sourceUrl='http://localhost/private';await writeFile(h.filename,JSON.stringify(body));
 await assert.rejects(h.create().listInstruments(),{status:500});
});
