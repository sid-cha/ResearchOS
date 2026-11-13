/** Bounded, extractive SEC filing research. No generative model or raw archive.
 * The caller must select filing metadata from the issuer's SEC submissions list;
 * this reader is not an arbitrary URL fetch service.
 */
import {createHash} from 'node:crypto';

const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024; // SEC primary iXBRL forms can be multi-megabyte.
const MAX_TEXT_CHARS = 5_000_000; // Keep later 10-Q/10-K sections in scope.
const MAX_ITEMS = 16;
const MAX_PASSAGE_CHARS = 1600;
const CACHE_LIMIT = 20;
const CACHE_MS = 15 * 60 * 1000;
const METHOD = 'sec-filing-extractive-v1';
const err = (message, status = 400) => Object.assign(new Error(message), {status});
const bounded = (value, maximum) => typeof value === 'string' ? value.trim().slice(0, maximum) : null;
const symbolValid = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,11}$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const FORM_TYPES = new Set(['8-K', '8-K/A', '10-Q', '10-Q/A', '10-K', '10-K/A']);
const ITEM_8K = Object.freeze({
  '1.01': 'Entry into a Material Definitive Agreement',
  '1.02': 'Termination of a Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '1.05': 'Material Cybersecurity Incidents',
  '2.01': 'Completion of Acquisition or Disposition of Assets',
  '2.02': 'Results of Operations and Financial Condition',
  '2.03': 'Creation of a Direct Financial Obligation',
  '2.04': 'Triggering Events That Accelerate a Financial Obligation',
  '2.05': 'Costs Associated with Exit or Disposal Activities',
  '2.06': 'Material Impairments',
  '3.01': 'Notice of Delisting or Failure to Satisfy a Listing Rule',
  '3.02': 'Unregistered Sales of Equity Securities',
  '3.03': 'Material Modification to Rights of Security Holders',
  '4.01': 'Changes in Registrant’s Certifying Accountant',
  '4.02': 'Non-Reliance on Previously Issued Financial Statements',
  '5.01': 'Changes in Control of Registrant',
  '5.02': 'Directors, Officers and Compensatory Arrangements',
  '5.03': 'Amendments to Articles of Incorporation or Bylaws',
  '5.07': 'Submission of Matters to a Vote of Security Holders',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events',
  '9.01': 'Financial Statements and Exhibits'
});
const ITEM_10K = Object.freeze({
  '1': 'Business', '1A': 'Risk Factors', '1B': 'Unresolved Staff Comments',
  '1C': 'Cybersecurity', '2': 'Properties', '3': 'Legal Proceedings',
  '5': 'Market for Registrant’s Common Equity', '6': 'Reserved',
  '7': 'Management’s Discussion and Analysis',
  '7A': 'Quantitative and Qualitative Disclosures About Market Risk',
  '8': 'Financial Statements and Supplementary Data',
  '9': 'Changes in and Disagreements with Accountants',
  '9A': 'Controls and Procedures', '9B': 'Other Information',
  '9C': 'Disclosure Regarding Foreign Jurisdictions',
  '10': 'Directors, Executive Officers and Corporate Governance',
  '11': 'Executive Compensation', '12': 'Security Ownership',
  '13': 'Certain Relationships and Related Transactions',
  '14': 'Principal Accountant Fees and Services', '15': 'Exhibits and Financial Statement Schedules',
  '16': 'Form 10-K Summary'
});
const ITEM_10Q = Object.freeze({
  'I:1': 'Financial Statements', 'I:2': 'Management’s Discussion and Analysis',
  'I:3': 'Quantitative and Qualitative Disclosures About Market Risk',
  'I:4': 'Controls and Procedures', 'II:1': 'Legal Proceedings',
  'II:1A': 'Risk Factors', 'II:2': 'Unregistered Sales of Equity Securities',
  'II:3': 'Defaults Upon Senior Securities', 'II:4': 'Mine Safety Disclosures',
  'II:5': 'Other Information', 'II:6': 'Exhibits'
});

const ENTITIES = Object.freeze({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', bull: '•', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢'});
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]{1,8}|#\d{1,10}|[a-z][a-z0-9]{1,12});/gi, (original, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? original;
    const hexadecimal = entity[1]?.toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '�';
  });
}

/** Small conservative tokenizer: no HTML is executed or returned to the browser.
 * Quoted tag attributes and nested hidden regions are handled without a DOM or
 * regex HTML parser whose work could grow with a large malicious document.
 */
function documentText(html) {
  const chunks = [];
  const blocks = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'tr', 'table',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'hr', 'br', 'pre']);
  const blocked = new Set(['script', 'style', 'noscript', 'template', 'head', 'svg', 'iframe',
    'object', 'ix:hidden', 'ix:header', 'xbrli:context', 'xbrli:unit']);
  let cursor = 0, tags = 0, skipped = null;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start === -1) { if (!skipped) chunks.push(html.slice(cursor)); break; }
    if (!skipped) chunks.push(html.slice(cursor, start));
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    let quote = null, end = start + 1;
    for (; end < html.length; end++) {
      const character = html[end];
      if (quote) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end >= html.length) { if (!skipped) chunks.push(html.slice(start)); break; }
    const tag = html.slice(start, end + 1);
    cursor = end + 1;
    if (++tags > 600000) throw err('SEC document structure exceeds the local analysis limit.', 413);
    const name = /^<\s*(\/?)\s*([a-z][a-z0-9:.-]*)\b/i.exec(tag);
    if (!name) continue;
    const closing = name[1] === '/', tagName = name[2].toLowerCase(), selfClosing = /\/\s*>$/.test(tag);
    if (skipped) {
      if (tagName === skipped.name) {
        if (closing) skipped.depth--;
        else if (!selfClosing) skipped.depth++;
        if (skipped.depth === 0) skipped = null;
      }
      continue;
    }
    const hidden = /\s(?:hidden|aria-hidden\s*=\s*(?:["']true["']|true)(?=\s|>))/i.test(tag) ||
      /\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(tag);
    if (!closing && (blocked.has(tagName) || hidden)) {
      if (!selfClosing) skipped = {name: tagName, depth: 1};
      continue;
    }
    if (blocks.has(tagName)) chunks.push('\n');
    else if (tagName === 'td' || tagName === 'th') chunks.push(' ');
  }
  const full = decodeEntities(chunks.join('')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\u00a0/g, ' ').replace(/[ \t\r\f]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return {text: full.slice(0, MAX_TEXT_CHARS), truncated: full.length > MAX_TEXT_CHARS};
}

function accessionFor(filing) {
  const accession = filing?.accession ?? (typeof filing?.id === 'string' && filing.id.startsWith('sec:') ? filing.id.slice(4) : null);
  if (typeof accession !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) throw err('A valid SEC filing accession is required.');
  return accession;
}

function archiveUrl(filing) {
  const value = filing?.sourceUrl;
  if (typeof value !== 'string' || value.length > 500 || value !== value.trim() || /[%\\\s?#]/.test(value) || /\/\.\.?(?:\/|$)/.test(value)) {
    throw err('Use the selected filing’s direct SEC archive document URL.');
  }
  let url;
  try { url = new URL(value); } catch { throw err('Use the selected filing’s direct SEC archive document URL.'); }
  if (url.origin !== 'https://www.sec.gov' || url.username || url.password || url.search || url.hash) {
    throw err('Only direct SEC archive filing documents are supported.');
  }
  const parts = /^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/([a-z0-9][a-z0-9_.-]{0,180}\.(?:html?|xhtml|txt))$/i.exec(url.pathname);
  if (!parts || parts[2] !== accessionFor(filing).replaceAll('-', '')) throw err('The SEC document URL does not match the selected accession.');
  if (filing.cik !== undefined && (!/^\d{1,10}$/.test(String(filing.cik)) || BigInt(filing.cik) !== BigInt(parts[1]))) {
    throw err('The SEC document URL does not match the selected issuer.');
  }
  if (!FORM_TYPES.has(filing.form)) throw err('Choose a supported 8-K, 10-Q or 10-K filing.');
  return url.href;
}

function filingMetadata(filing = {}) {
  if (!filing || typeof filing !== 'object' || Array.isArray(filing)) filing = {};
  let sourceUrl = null;
  try { sourceUrl = archiveUrl(filing); } catch { /* Parser never emits unsafe links. */ }
  let accession = null;
  try { accession = accessionFor(filing); } catch { /* Preserve unknown metadata. */ }
  return {id: accession ? `sec:${accession}` : null, accession, form: FORM_TYPES.has(filing.form) ? filing.form : null,
    headline: bounded(filing.headline, 350), source: 'SEC EDGAR', sourceUrl,
    filingDate: validDate(filing.filingDate) ? filing.filingDate : null,
    periodEnd: validDate(filing.periodEnd) ? filing.periodEnd : null,
    publishedAt: instant(filing.publishedAt), occurredAt: null};
}

function excerpt(value, maximum = MAX_PASSAGE_CHARS) {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= maximum) return flat;
  const end = flat.lastIndexOf(' ', maximum);
  return flat.slice(0, end > maximum * 0.7 ? end : maximum).trimEnd() + '…';
}

/** Pure section extraction. Summaries consist only of selected source text. */
export function analyzeFilingDocument(html, {filing = {}, symbol = null, fetchedAt = null} = {}) {
  if (typeof html !== 'string') throw err('A text SEC filing document is required.');
  if (Buffer.byteLength(html, 'utf8') > MAX_DOCUMENT_BYTES) throw err('SEC primary document exceeds the 24 MiB bounded reading limit; open the original SEC filing.', 413);
  const metadata = filingMetadata(filing);
  const {text, truncated} = documentText(html);
  const form = metadata.form?.replace('/A', '');
  const parts = [...text.matchAll(/^PART\s+(I{1,3}|IV)\b[^\n]*/gim)].map(match => ({part: match[1].toUpperCase(), index: match.index}));
  const expression = form === '8-K' ? /^[ \t]*ITEM[ \t\r\n]*([1-9]\.\d{2})[ \t]*[.:\-–—]?[ \t]*/gim :
    /^[ \t]*ITEM[ \t\r\n]*(1[0-6]|[1-9])([A-C])?\b[ \t]*[.:\-–—]?[ \t]*/gim;
  const headings = FORM_TYPES.has(metadata.form) ? [...text.matchAll(expression)] : [];
  const candidates = new Map();
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index], code = (heading[1] + (heading[2] || '')).toUpperCase();
    const part = parts.filter(value => value.index < heading.index).at(-1)?.part || (form === '10-Q' ? 'I' : null);
    const key = form === '10-Q' ? `${part}:${code}` : code;
    const nextPart = parts.find(value => value.index > heading.index)?.index ?? text.length;
    const end = Math.min(headings[index + 1]?.index ?? text.length, nextPart);
    let body = text.slice(heading.index + heading[0].length, end).replace(/^\s*[:.\-–—]\s*/, '').trim();
    // A TOC entry followed by cover-page prose is not an actual item section.
    if (/\.{2,}\s*\d+\s*$/.test(body.split('\n')[0])) continue;
    // Exclude the signing block when it follows the last substantive section.
    body = body.split(/\nSIGNATURES\b/i)[0].trim();
    const title = form === '8-K' ? ITEM_8K[code] : form === '10-K' ? ITEM_10K[code] : ITEM_10Q[key];
    if (!title || body.replace(/[^a-z]/gi, '').length < 45) continue;
    const section = `${form === '10-Q' ? `Part ${part} / ` : ''}Item ${code}`;
    const entry = {code, title, section, body};
    // Duplicate table-of-contents headings are weaker than the actual section.
    if (!candidates.has(key) || candidates.get(key).body.length < body.length) candidates.set(key, entry);
  }
  const selected = [...candidates.values()].slice(0, MAX_ITEMS);
  const evidence = selected.map(item => {
    const passage = excerpt(item.body);
    const hash = createHash('sha256').update(passage).digest('hex').slice(0, 12);
    return {id: `sec-doc:${metadata.accession || 'unknown'}:${item.section.replace(/\s+/g, '-')}:${hash}`,
      text: passage, section: item.section, sourceUrl: metadata.sourceUrl};
  });
  const items = selected.map((item, index) => ({code: item.code, title: item.title, text: evidence[index].text,
    evidenceId: evidence[index].id, sourceUrl: metadata.sourceUrl, section: item.section}));
  const summary = evidence.slice(0, 6).map(item => ({text: excerpt(item.text, 350), evidenceId: item.id, section: item.section}));
  const limitations = [
    'Extractive section excerpts, not a full filing review, investment recommendation or causal interpretation.',
    'Filing acceptance/publication is separate from the underlying event time; occurrence time has not been inferred.',
    'Financial figures in prose are not independently reconciled to XBRL or accounting periods.'
  ];
  if (!items.length) limitations.push('No supported substantive filing sections were identified; open the original document.');
  if (truncated) limitations.push('Document text was truncated at the local analysis limit; later sections may be missing.');
  if (candidates.size > MAX_ITEMS) limitations.push('Only the first supported sections are returned; open the original for remaining sections.');
  return {filing: metadata, symbol: symbolValid(symbol) ? symbol : null, fetchedAt: instant(fetchedAt),
    occurredAt: null, items, summary, evidence, limitations, methodVersion: METHOD,
    coverage: {documentBytes: Buffer.byteLength(html, 'utf8'), textCharacters: text.length, textTruncated: truncated,
      supportedSections: items.length, rawDocumentStored: false,
      documentByteLimit: MAX_DOCUMENT_BYTES, extractedTextCharacterLimit: MAX_TEXT_CHARS}};
}

function userAgent(env) {
  const agent = env?.SEC_USER_AGENT;
  const email = typeof agent === 'string' ? /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(agent)?.[0] : null;
  if (!email || agent.length > 200 || /[\r\n]/.test(agent) || !/[a-z]{2}/i.test(agent.replace(email, ''))) {
    throw err('Set SEC_USER_AGENT to an application name and contact email in the local .env.', 503);
  }
  return agent;
}

async function boundedResponseText(response, signal) {
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['text/html', 'application/xhtml+xml', 'text/plain'].includes(contentType)) throw err('SEC returned an unsupported document format.', 502);
  const declaredHeader = response.headers.get('content-length');
  const declared = declaredHeader && /^\d+$/.test(declaredHeader) ? Number(declaredHeader) : null;
  if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw err('SEC primary document exceeds the 24 MiB bounded reading limit; open the original SEC filing.', 413);
  }
  const reader = response.body?.getReader();
  if (!reader) throw err('SEC returned an empty filing document.', 502);
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      if (signal.aborted) throw err('SEC filing request timed out.', 504);
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DOCUMENT_BYTES) throw err('SEC primary document exceeds the 24 MiB bounded reading limit; open the original SEC filing.', 413);
      chunks.push(Buffer.from(value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, bytes).toString('utf8');
}

/** SEC-only reader; cached values are parsed excerpts, never raw filing HTML.
 * sleepImpl is injectable for deterministic request-start throttling tests.
 */
export function createFilingReader({fetchImpl = fetch, env = process.env, now = Date.now,
  sleepImpl = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))} = {}) {
  const cache = new Map(), inFlight = new Map();
  let queue = Promise.resolve(), lastStarted = -Infinity;
  async function read({filing, symbol} = {}) {
    if (!symbolValid(symbol)) throw err('Choose a supported issuer symbol.');
    const url = archiveUrl(filing), agent = userAgent(env);
    const stamp = Number(now());
    if (!Number.isFinite(stamp)) throw err('Local filing clock is unavailable.', 500);
    for (const [key, value] of cache) if (value.until <= stamp) cache.delete(key);
    const hit = cache.get(url);
    if (hit) return structuredClone({...hit.value, symbol});
    if (inFlight.has(url)) return structuredClone({...await inFlight.get(url), symbol});
    if (inFlight.size >= CACHE_LIMIT) throw err('Local filing reader is busy; retry after pending documents complete.', 429);
    const operation = queue.then(async () => {
      const wait = Math.max(0, lastStarted + 400 - Number(now()));
      if (wait) await sleepImpl(wait);
      lastStarted = Number(now());
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetchImpl(url, {headers: {'User-Agent': agent, Accept: 'text/html, text/plain;q=0.9'},
          redirect: 'error', signal: controller.signal});
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw err(response.status === 429 ? 'SEC request limit reached; retry later.' :
            'SEC filing request was rejected; verify the declared User-Agent and provider access.', response.status === 429 ? 429 : 502);
        }
        if (response.url && response.url !== url) throw err('SEC returned an unexpected document location.', 502);
        const html = await boundedResponseText(response, controller.signal);
        const value = analyzeFilingDocument(html, {filing, symbol, fetchedAt: new Date(Number(now())).toISOString()});
        cache.set(url, {value, until: Number(now()) + CACHE_MS});
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        return value;
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw err('SEC filing request timed out.', 504);
        if (error?.status && [400, 413, 429, 502, 503, 504].includes(error.status)) throw error;
        throw err('SEC filing provider could not be reached.', 502);
      } finally { clearTimeout(timeout); }
    });
    queue = operation.catch(() => {});
    inFlight.set(url, operation);
    try { return structuredClone(await operation); }
    finally { inFlight.delete(url); }
  }
  return {read};
}
