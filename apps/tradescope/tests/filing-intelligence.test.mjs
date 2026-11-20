import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFilingDocument, createFilingReader} from '../lib/filing-intelligence.mjs';

const filing = {id:'sec:0001193125-26-448357',accession:'0001193125-26-448357',cik:'789019',form:'8-K',
  headline:'Example issuer — 8-K filing',filingDate:'2026-11-05',periodEnd:'2026-11-04',publishedAt:'2026-11-05T11:01:00Z',
  sourceUrl:'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/example8k.htm'};
const html = `<!doctype html><html><head><title>Source title is not a summary</title><script>secret_script()</script></head><body>
 <div hidden><p>Item 1.03 Bankruptcy</p><p>Hidden metadata must not be classified as a bankruptcy event for this issuer.</p></div>
 <table><tr><td><b>Item&nbsp;2.02.</b></td><td><b>Results of Operations and Financial Condition</b></td></tr></table>
 <p>On November 4, 2026, Example Corporation issued a press release reporting quarterly results. The press release is furnished as Exhibit 99.1 and is incorporated by reference.</p>
 <p><strong>ITEM <span>5.02</span> — Directors and Officers</strong></p>
 <p>The board appointed an independent director. The appointment is described in the source document and does not establish a future market return.</p>
 <p>Item 9.01. Financial Statements and Exhibits</p><p>Exhibit 99.1 contains the issued press release. Readers should consult that exhibit for complete details of the results.</p>
 <p>SIGNATURES</p><p>Authorized signature block should not become a section summary.</p></body></html>`;
const context = {filing,symbol:'MSFT',fetchedAt:'2026-11-12T22:30:00Z'};
const env = {SEC_USER_AGENT:'TradeScopeResearch owner@example.com'};

test('8-K item extraction preserves supported sections and source-linked extractive evidence',()=>{
 const result=analyzeFilingDocument(html,context);
 assert.deepEqual(result.items.map(item=>item.code),['2.02','5.02','9.01']);
 assert.match(result.items[0].title,/Results of Operations/);
 assert.match(result.items[1].text,/independent director/);
 assert.equal(result.summary.length,3);
 for(const summary of result.summary){
  const evidence=result.evidence.find(item=>item.id===summary.evidenceId);assert(evidence);
  assert(evidence.text.startsWith(summary.text.replace(/…$/,'')));
  assert.equal(evidence.sourceUrl,filing.sourceUrl);
 }
 assert.equal(result.occurredAt,null,'do not infer a single event date from the filing publication or narrative');
 assert.equal(result.filing.publishedAt,filing.publishedAt);
 assert.equal(result.methodVersion,'sec-filing-extractive-v1');
 assert.equal(result.coverage.rawDocumentStored,false);
 assert(!JSON.stringify(result).includes('secret_script'));
 assert(!JSON.stringify(result).includes('bankruptcy event'));
 assert(!JSON.stringify(result).includes('Authorized signature'));
});

test('plain-text outputs remove executable/hidden content and safely decode bounded entities',()=>{
 const source=`<body><!-- Item 1.03 hidden comment --><div style="display:none"><div>Item 1.03</div><p>Hidden bankruptcy allegations are not source evidence and must be excluded entirely.</p></div>
 <script>Item 1.03\nMalicious content with a sufficiently long imaginary allegation must not enter the result.</script>
 <p>Item 8.01 Other Events</p><p>The issuer discussed research &amp; development. Literal encoded markup &lt;img src=x onerror=bad()&gt; remains plain text, with numeric &#x2014; and &#169; entities.</p></body>`;
 const result=analyzeFilingDocument(source,context);
 assert.equal(result.items.length,1);assert.equal(result.items[0].code,'8.01');
 assert.match(result.items[0].text,/research & development/);
 assert.match(result.items[0].text,/<img src=x onerror=bad\(\)>/,'literal escaped source text is plaintext, not browser HTML');
 assert.match(result.items[0].text,/— and ©/);
 assert(!JSON.stringify(result).includes('Hidden bankruptcy'));
 assert(!JSON.stringify(result).includes('Malicious content'));
});

test('10-Q sections keep Part I and Part II item identities separate',()=>{
 const result=analyzeFilingDocument(`<h1>PART I</h1><h2>Item 1. Financial Statements</h2><p>The financial statements describe reported financial position and cash flows. The source must be read for the full accounting notes and disclosure context.</p>
 <h1>PART II</h1><h2>Item 1. Legal Proceedings</h2><p>The issuer discusses ordinary-course legal proceedings. No conclusion about the outcome of any proceeding is inferred from this excerpt.</p>`,{...context,filing:{...filing,form:'10-Q'}});
 assert.equal(result.items.length,2);
 assert.deepEqual(result.items.map(item=>item.section),['Part I / Item 1','Part II / Item 1']);
 assert.notEqual(result.items[0].evidenceId,result.items[1].evidenceId);
});

test('missing or unsupported sections do not manufacture summaries from metadata or headline',()=>{
 const result=analyzeFilingDocument('<p>Cover page only.</p>',{...context,filing:{...filing,secret:'never-copy-this'}});
 assert.deepEqual(result.items,[]);assert.deepEqual(result.summary,[]);assert.deepEqual(result.evidence,[]);
 assert.match(result.limitations.join(' '),/No supported substantive/);
 assert(!JSON.stringify(result).includes('never-copy-this'));
 assert(!result.summary.some(item=>item.text===filing.headline));
 assert.throws(()=>analyzeFilingDocument('x'.repeat(24*1024*1024+1),context),{status:413});
 assert.deepEqual(analyzeFilingDocument('<p>Cover only.</p>',{filing:null}).summary,[]);
});

test('TOC duplicates do not replace substantive sections and output remains bounded',()=>{
 const source='<p>Item 2.02 Results of Operations ........ 3</p><p>Item 5.02 Directors ........ 4</p><p>Cover page information about the registrant and its principal executive offices is not a director appointment disclosure.</p>' +
  '<h2>Item 2.02 Results of Operations and Financial Condition</h2><p>'+('Reported source results and the financial statements require context. '.repeat(100))+'</p>';
 const result=analyzeFilingDocument(source,context);
 const section=result.items.find(item=>item.code==='2.02');assert(section);
 assert.match(section.text,/Reported source results/);
 assert(section.text.length<=1601);assert(result.summary.every(item=>item.text.length<=351));
 assert(result.items.length<=16);
 assert(!result.items.some(item=>item.code==='5.02'),'TOC-plus-cover prose cannot become a fabricated item disclosure');
});

test('reader permits only selected direct SEC archive metadata and requires declared app/contact',async()=>{
 let calls=0;
 const reader=createFilingReader({env,fetchImpl:async()=>{calls++;return new Response(html,{headers:{'content-type':'text/html'}});}});
 const badUrls=[
  'http://www.sec.gov/Archives/edgar/data/789019/000119312526448357/example8k.htm',
  'https://evil.example/Archives/edgar/data/789019/000119312526448357/example8k.htm',
  'https://www.sec.gov@evil.example/Archives/edgar/data/789019/000119312526448357/example8k.htm',
  'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/%2e%2e/example8k.htm',
  'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/../000119312526448357/example8k.htm',
  filing.sourceUrl+'?url=https://evil.example',filing.sourceUrl+'#fragment',
  filing.sourceUrl.replace('000119312526448357','000119312526448358'),
  filing.sourceUrl.replace('/789019/','/789020/'),
  filing.sourceUrl.replace('example8k.htm','directory/other.htm')
 ];
 for(const sourceUrl of badUrls)await assert.rejects(reader.read({filing:{...filing,sourceUrl},symbol:'MSFT'}),{status:400});
 assert.equal(calls,0);
 await assert.rejects(createFilingReader({env:{},fetchImpl:async()=>{throw Error('must not call');}}).read({filing,symbol:'MSFT'}),{status:503});
 await assert.rejects(createFilingReader({env:{SEC_USER_AGENT:'owner@example.com'}}).read({filing,symbol:'MSFT'}),{status:503});
 await assert.rejects(reader.read({filing,symbol:'../../PRIVATE'}),{status:400});
});

test('SEC reader throttles request starts, caches parsed results, and isolates returned metadata',async()=>{
 let clock=Date.parse(context.fetchedAt),calls=0;const starts=[],delays=[];
 const reader=createFilingReader({env,now:()=>clock,sleepImpl:async ms=>{delays.push(ms);clock+=ms;},fetchImpl:async(url,options)=>{
  starts.push(clock);calls++;assert.equal(options.redirect,'error');assert.equal(options.headers['User-Agent'],env.SEC_USER_AGENT);
  assert.match(url,/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
  clock+=25;return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
 }});
 const [first,duplicate]=await Promise.all([reader.read(context),reader.read(context)]);
 assert.equal(calls,1);assert.deepEqual(first,duplicate);
 first.items[0].text='client mutation';
 const cached=await reader.read(context);assert.notEqual(cached.items[0].text,'client mutation');assert.equal(calls,1);
 const other={...filing,sourceUrl:filing.sourceUrl.replace('example8k.htm','another8k.htm')};
 await reader.read({filing:other,symbol:'MSFT'});
 assert.equal(calls,2);assert(starts[1]-starts[0]>=400);assert.deepEqual(delays,[375]);
 clock+=15*60*1000+1;await reader.read(context);assert.equal(calls,3);
 assert(!JSON.stringify(cached).includes('owner@example.com'));
});

test('SEC provider failures are static and never forward provider text or declared contact',async()=>{
 for(const fetchImpl of [
  async()=>new Response('Provider echoed owner@example.com and private-key',{status:403,headers:{'content-type':'text/plain'}}),
  async()=>{throw Error('private-key owner@example.com');}
 ]){
  const reader=createFilingReader({env,fetchImpl});
  await assert.rejects(reader.read(context),error=>error.status===502&&!error.message.includes('owner@example.com')&&!error.message.includes('private-key'));
 }
 const limited=createFilingReader({env,fetchImpl:async()=>new Response('private-key',{status:429})});
 await assert.rejects(limited.read(context),{status:429});
});

test('parsed-document cache evicts oldest entries at its fixed bound',async()=>{
 let clock=Date.parse(context.fetchedAt),calls=0;
 const reader=createFilingReader({env,now:()=>clock,sleepImpl:async ms=>{clock+=ms;},fetchImpl:async()=>{calls++;return new Response(html,{headers:{'content-type':'text/html'}});}});
 for(let index=0;index<21;index++)await reader.read({symbol:'MSFT',filing:{...filing,sourceUrl:filing.sourceUrl.replace('example8k.htm',`fixture${index}.htm`)}});
 assert.equal(calls,21);
 await reader.read({symbol:'MSFT',filing:{...filing,sourceUrl:filing.sourceUrl.replace('example8k.htm','fixture20.htm')}});
 assert.equal(calls,21,'recent parsed document stays cached');
 await reader.read({symbol:'MSFT',filing:{...filing,sourceUrl:filing.sourceUrl.replace('example8k.htm','fixture0.htm')}});
 assert.equal(calls,22,'oldest parsed document was evicted');
});

test('declared and streamed document limits abort before oversized HTML can be analyzed',async()=>{
 let cancelled=false;
 const oversized=()=>new ReadableStream({start(controller){controller.enqueue(new Uint8Array(12*1024*1024));controller.enqueue(new Uint8Array(12*1024*1024));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 const reader=createFilingReader({env,fetchImpl:async()=>new Response(oversized(),{headers:{'content-type':'text/html'}})});
 await assert.rejects(reader.read(context),{status:413});assert.equal(cancelled,true);
 cancelled=false;
 const declared=createFilingReader({env,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'text/html','content-length':String(24*1024*1024+1)}})});
 await assert.rejects(declared.read(context),{status:413});assert.equal(cancelled,true);
 const binary=createFilingReader({env,fetchImpl:async()=>new Response('%PDF fake',{headers:{'content-type':'application/pdf'}})});
 await assert.rejects(binary.read(context),{status:502});
});

test('large 9 MiB SEC 10-Q primary HTML is processed with bounded citations and no raw HTML retention',async()=>{
 const report={...filing,form:'10-Q'};
 const large='<html><head><title>10-Q</title><script>'+('var x=0;'.repeat(1_200_000))+'</script></head><body>'
  +'<h2>PART I</h2><h2>Item 1. Financial Statements</h2><p>Financial statements contain the unaudited balance sheets, operating results, and consolidated statements of cash flows for the issuer in the quarterly reporting period.</p>'
  +'<h2>Item 2. Management Discussion and Analysis</h2><p>The issuer describes its operating performance, revenues, funding and risk factors in a cited source passage with a clear fiscal period.</p></body></html>';
 assert(Buffer.byteLength(large)>9*1024*1024);
 const result=analyzeFilingDocument(large,{...context,filing:report});
 assert.equal(result.coverage.documentBytes,Buffer.byteLength(large));
 assert.equal(result.coverage.documentByteLimit,24*1024*1024);
 assert.equal(result.coverage.rawDocumentStored,false);
 assert(result.items.some(item=>item.section==='Part I / Item 1'));
 assert(result.items.some(item=>item.section==='Part I / Item 2'));
 assert(!JSON.stringify(result).includes('var x=0;'));
 assert(result.evidence.every(item=>item.sourceUrl===report.sourceUrl));
});
