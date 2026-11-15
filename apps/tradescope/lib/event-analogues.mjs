/** Bounded earthquake analogue research. Similarity describes historical attributes;
 * it is neither an impact probability nor a company/market exposure assertion.
 * Latest USGS catalogue versions cannot reconstruct historical first-alert knowledge.
 */
import {validEventTimestamp} from './market-events.mjs';

const USGS = 'https://earthquake.usgs.gov';
const DAY_MS = 86400000;
const METHOD_VERSION = 'earthquake-attributes-v1';
const OUTCOME_METHOD_VERSION = 'pre-event-close-daily-outcomes-v1';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY = 2000;
const LIMITATIONS = Object.freeze([
  'Retrospective USGS catalogue versions do not establish what was known at the original alert time; historical first-publication time is unknown.',
  'Attribute similarity is not a forecast probability or evidence that an earthquake caused a financial return.',
  'No company, facility, supplier, sector or security exposure is inferred from an epicentre alone.',
  'An earthquake or USGS tsunami flag is not a confirmed tsunami warning, observed tsunami or damage assessment.',
]);
const fail = (message, status = 502) => Object.assign(new Error(message), {status, safeEarthquakeError: true});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = (value, places = 4) => Number(value.toFixed(places));
const stamp = ms => new Date(ms).toISOString();
const text = (value, maximum = 240) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum) : '';

function eventId(value) {
  const match = typeof value === 'string' && /^(?:usgs:)?([a-z0-9]{2,32})$/.exec(value);
  if (!match) throw fail('Choose a valid USGS earthquake identifier from the event list.', 400);
  return match[1];
}

function validMilliseconds(value) {
  return Number.isSafeInteger(value) && value >= Date.UTC(1800, 0, 1) && value <= Date.UTC(2200, 0, 1);
}

function normalizeEvent(feature, receivedAt) {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) return null;
  let id;
  try { id = eventId(feature.id); } catch { return null; }
  const p = feature.properties, coordinates = feature.geometry?.coordinates;
  if (!p || typeof p !== 'object' || !Array.isArray(coordinates) || coordinates.length < 3) return null;
  if (p.type !== undefined && p.type !== 'earthquake') return null;
  const [longitude, latitude, depthKm] = coordinates;
  if (feature.geometry.type && feature.geometry.type !== 'Point') return null;
  if (!finite(longitude) || longitude < -180 || longitude > 180 || !finite(latitude) || latitude < -90 || latitude > 90 ||
      !finite(depthKm) || depthKm < -20 || depthKm > 1000 || !finite(p.mag) || p.mag < -3 || p.mag > 12 || !validMilliseconds(p.time)) return null;
  return {
    id, title: text(p.title) || `M ${p.mag} earthquake`, magnitude: p.mag, depthKm,
    occurredAt: stamp(p.time), updatedAt: validMilliseconds(p.updated) ? stamp(p.updated) : null,
    latitude, longitude, source: 'USGS', sourceUrl: `${USGS}/earthquakes/eventpage/${id}`,
    publishedAt: null, firstPublishedAt: null, historicalAvailableAt: null, ingestedAt: receivedAt,
    knowledgeStatus: 'retrospective_catalog',
    tsunamiFlag: p.tsunami === 1 ? true : p.tsunami === 0 ? false : null,
  };
}

function haversineKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const latitude = radians(b.latitude - a.latitude), longitude = radians(b.longitude - a.longitude);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.max(0, value)), Math.sqrt(Math.max(0, 1 - value)));
}

function uniqueEvents(events) {
  const map = new Map();
  for (const event of events) {
    const previous = map.get(event.id);
    if (!previous || String(event.updatedAt || '') > String(previous.updatedAt || '') ||
        (event.updatedAt === previous.updatedAt && JSON.stringify(event) < JSON.stringify(previous))) map.set(event.id, event);
  }
  return [...map.values()];
}

function collection(payload) {
  if (!payload || !Array.isArray(payload.features)) throw fail('USGS returned an invalid earthquake collection.');
  return payload.features;
}

async function boundedJson(response, maxBytes) {
  const declared = response.headers?.get?.('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel?.();
    throw fail('USGS response exceeded the local research size limit.');
  }
  let raw;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel(); throw fail('USGS response exceeded the local research size limit.'); }
        chunks.push(Buffer.from(value));
      }
      raw = Buffer.concat(chunks, total).toString('utf8');
    } finally { reader.releaseLock(); }
  } else {
    raw = await response.text();
    if (Buffer.byteLength(raw) > maxBytes) throw fail('USGS response exceeded the local research size limit.');
  }
  try { return JSON.parse(raw); } catch { throw fail('USGS returned an invalid JSON response.'); }
}

/** Public official catalogue access only; no API secrets or arbitrary URLs. */
export function createEarthquakeResearch({fetchImpl = fetch, now = Date.now, timeoutMs = 12000,
  maxBytes = MAX_BYTES, cacheLimit = 20, historyLimit = MAX_HISTORY, searchRadiusKm = 3000} = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES || !Number.isInteger(cacheLimit) || cacheLimit < 1 || cacheLimit > 20 ||
      !Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > MAX_HISTORY || !finite(searchRadiusKm) || searchRadiusKm < 100 || searchRadiusKm > 10000) {
    throw new TypeError('Invalid bounded earthquake research configuration');
  }
  const cache = new Map(), pending = new Map();
  const clock = () => { const value = Number(now()); if (!Number.isFinite(value)) throw new TypeError('A valid research clock is required'); return value; };
  async function getJson(url, ttlMs) {
    if (url.origin !== USGS || url.username || url.password || !['/earthquakes/feed/v1.0/summary/4.5_week.geojson', '/fdsnws/event/1/query'].includes(url.pathname) &&
        !/^\/earthquakes\/feed\/v1\.0\/detail\/[a-z0-9]{2,32}\.geojson$/.test(url.pathname)) throw fail('Unsupported earthquake data source.', 400);
    const key = url.href, hit = cache.get(key);
    if (hit && hit.expires > clock()) return hit;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 6) throw fail('The local earthquake research request limit was reached; try again shortly.', 429);
    const task = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url.href, {headers: {Accept: 'application/geo+json, application/json'}, redirect: 'error', signal: controller.signal});
        if (!response.ok) {
          await response.body?.cancel?.();
          throw fail(response.status === 429 ? 'USGS temporarily rate limited earthquake requests.' : 'USGS earthquake data is temporarily unavailable.', response.status === 429 ? 429 : 502);
        }
        const payload = await boundedJson(response, maxBytes), fetchedAt = stamp(clock());
        const entry = {payload, fetchedAt, expires: clock() + ttlMs};
        cache.delete(key); cache.set(key, entry);
        while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
        return entry;
      } catch (error) {
        if (error.safeEarthquakeError) throw error;
        if (controller.signal.aborted || error.name === 'AbortError') throw fail('USGS earthquake request timed out.', 504);
        throw fail('USGS earthquake request failed; try again when the provider is available.');
      } finally { clearTimeout(timeout); }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }

  async function recentEvents() {
    const {payload, fetchedAt} = await getJson(new URL('/earthquakes/feed/v1.0/summary/4.5_week.geojson', USGS), 120000);
    const features = collection(payload), selected = features.slice(0, MAX_HISTORY);
    const normalized = selected.map(feature => normalizeEvent(feature, fetchedAt)).filter(event => event && event.magnitude >= 4.5 &&
      Date.parse(event.occurredAt) <= clock() && Date.parse(event.occurredAt) >= clock() - 7 * DAY_MS);
    const events = uniqueEvents(normalized).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
    return {events, fetchedAt, coverage: {provider: 'USGS', dataset: 'M4.5+ past-week summary', mode: 'retrospective_catalog',
      receivedCount: features.length, usableCount: events.length, rejectedCount: selected.length - normalized.length,
      duplicateCount: normalized.length - events.length, queryCapReached: features.length > MAX_HISTORY},
      limitations: [...LIMITATIONS], methodVersion: METHOD_VERSION};
  }

  async function findAnalogues({eventId: selectedId, limit = 5} = {}) {
    const id = eventId(selectedId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw fail('Choose between one and five historical analogue results.', 400);
    const detail = await getJson(new URL(`/earthquakes/feed/v1.0/detail/${id}.geojson`, USGS), 120000);
    const event = normalizeEvent(detail.payload, detail.fetchedAt);
    if (!event) throw fail('USGS returned an incomplete selected earthquake record.');
    if (event.id !== id) throw fail('The selected earthquake identifier changed; reload the recent event list.', 409);
    const occurrence = Date.parse(event.occurredAt);
    if (occurrence > clock()) throw fail('Historical comparison requires an earthquake that has already occurred.', 400);
    const start = new Date(occurrence), month = start.getUTCMonth();
    start.setUTCFullYear(start.getUTCFullYear() - 30);
    if (start.getUTCMonth() !== month) start.setUTCDate(0); // Clamp leap day to the earlier year's February end.
    const minimumMagnitude = Math.max(-3, event.magnitude - 1.5), maximumMagnitude = Math.min(12, event.magnitude + 1.5);
    const query = new URL('/fdsnws/event/1/query', USGS);
    query.search = new URLSearchParams({format: 'geojson', eventtype: 'earthquake', starttime: start.toISOString(),
      endtime: stamp(occurrence - 1), minmagnitude: String(minimumMagnitude), maxmagnitude: String(maximumMagnitude),
      latitude: String(event.latitude), longitude: String(event.longitude), maxradiuskm: String(searchRadiusKm),
      mindepth: String(Math.max(-20, event.depthKm - 150)), maxdepth: String(Math.min(1000, event.depthKm + 150)),
      orderby: 'time', limit: String(historyLimit)}).toString();
    const history = await getJson(query, 900000), raw = collection(history.payload);
    const selected = raw.slice(0, historyLimit), normalized = selected.map(feature => normalizeEvent(feature, history.fetchedAt));
    const valid = normalized.filter(Boolean), unique = uniqueEvents(valid), excluded = {
      malformed: selected.length - valid.length, duplicates: valid.length - unique.length,
      outsideWindow: 0, selectedCluster: 0, clustered: 0,
    };
    const eligible = unique.filter(candidate => {
      const candidateTime = Date.parse(candidate.occurredAt), distance = haversineKm(event, candidate);
      if (candidate.id === id || candidateTime >= occurrence || candidateTime < +start || distance > searchRadiusKm ||
          candidate.magnitude < minimumMagnitude || candidate.magnitude > maximumMagnitude || Math.abs(candidate.depthKm - event.depthKm) > 150) {
        excluded.outsideWindow++; return false;
      }
      if (occurrence - candidateTime <= 14 * DAY_MS && distance <= 250) { excluded.selectedCluster++; return false; }
      return true;
    });
    // Retain the strongest observed event in each declared local/time cluster.
    const representatives = [];
    for (const candidate of [...eligible].sort((a, b) => b.magnitude - a.magnitude || a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))) {
      if (representatives.some(previous => Math.abs(Date.parse(previous.occurredAt) - Date.parse(candidate.occurredAt)) <= 14 * DAY_MS && haversineKm(previous, candidate) <= 250)) {
        excluded.clustered++; continue;
      }
      representatives.push(candidate);
    }
    const weights = {magnitude: 0.5, depthKm: 0.2, distanceKm: 0.3};
    const matches = representatives.map(candidate => {
      const magnitudeDifference = Math.abs(candidate.magnitude - event.magnitude), depthDifference = Math.abs(candidate.depthKm - event.depthKm), distanceKm = haversineKm(event, candidate);
      const dimensions = [
        {feature: 'magnitude', weight: weights.magnitude, score: Math.max(0, 1 - magnitudeDifference / 1.5), selected: event.magnitude, candidate: candidate.magnitude, difference: magnitudeDifference, unit: 'magnitude'},
        {feature: 'depthKm', weight: weights.depthKm, score: Math.max(0, 1 - depthDifference / 150), selected: event.depthKm, candidate: candidate.depthKm, difference: depthDifference, unit: 'km'},
        {feature: 'distanceKm', weight: weights.distanceKm, score: Math.max(0, 1 - distanceKm / searchRadiusKm), difference: distanceKm, unit: 'km'},
      ];
      return {event: candidate, similarity: round(dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.score, 0)),
        similarityMeaning: 'Historical attribute similarity; not a forecast probability.',
        matchedFeatures: dimensions.map(dimension => ({...dimension, score: round(dimension.score), difference: round(dimension.difference)})),
        differences: [`Magnitude difference ${round(magnitudeDifference, 2)}.`, `Depth difference ${round(depthDifference, 1)} km.`, `Epicentre distance ${round(distanceKm, 1)} km; this is not a facility-exposure map.`],
        limitations: [...LIMITATIONS]};
    }).sort((a, b) => b.similarity - a.similarity || a.event.id.localeCompare(b.event.id)).slice(0, limit);
    return {event, matches, fetchedAt: history.fetchedAt, coverage: {provider: 'USGS', mode: 'retrospective_catalog', from: start.toISOString(), to: stamp(occurrence - 1),
      lookbackYears: 30, radiusKm: searchRadiusKm, magnitudeRange: [minimumMagnitude, maximumMagnitude],
      requestedLimit: historyLimit, receivedCount: raw.length, usableCount: valid.length, independentCandidateCount: representatives.length,
      returnedCount: matches.length, queryCapReached: raw.length >= historyLimit,
      selection: 'Most recent bounded catalogue query before the selected event; not a complete disaster catalogue.',
      grouping: {days: 14, radiusKm: 250, representative: 'largest magnitude, earliest occurrence, then source identifier'}, excluded},
      forecast: {status: 'unavailable', reason: 'Point-in-time exposure and calibrated outcome data are not available.'},
      exposures: {status: 'unverified', links: []}, limitations: [...LIMITATIONS,
        ...(raw.length >= historyLimit ? ['The catalogue query cap was reached; earlier eligible events may be absent.'] : [])],
      methodVersion: METHOD_VERSION};
  }
  return {recentEvents, findAnalogues};
}

const ET = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
function etParts(value) {
  const parts = Object.fromEntries(ET.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {day: `${parts.year}-${parts.month}-${parts.day}`, seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)};
}
function dailySession(bar) {
  if (!bar || typeof bar !== 'object' || !finite(bar.c) || bar.c <= 0 || typeof bar.t !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(bar.t)) {
    return Number.isFinite(Date.parse(`${bar.t}T00:00:00Z`)) && new Date(`${bar.t}T00:00:00Z`).toISOString().slice(0, 10) === bar.t ? bar.t : null;
  }
  return validEventTimestamp(bar.t) ? etParts(bar.t).day : null;
}
function closesBySession(raw, today) {
  const prices = new Map(), conflicts = new Set(); let rejected = 0, duplicates = 0;
  for (const bar of Array.isArray(raw) ? raw : []) {
    const date = dailySession(bar);
    if (!date || date >= today) { rejected++; continue; }
    if (prices.has(date)) {
      duplicates++;
      if (prices.get(date) !== bar.c) conflicts.add(date);
    } else prices.set(date, bar.c);
  }
  for (const date of conflicts) prices.delete(date);
  return {prices, quality: {received: Array.isArray(raw) ? raw.length : 0, usable: prices.size, rejected, duplicates, conflictingSessions: conflicts.size}};
}

/** Retrospective daily-session proxy. The caller supplies supported same-basis
 * stock/benchmark bars; this helper does not certify adjustment or entitlement.
 */
export function compareEventOutcomes(eventTime, stockBars, benchmarkBars, {now = Date.now()} = {}) {
  const instant = typeof now === 'function' ? now() : now, clock = +new Date(instant);
  if (!Number.isFinite(clock)) throw new TypeError('A valid outcome-comparison clock is required');
  if (!validEventTimestamp(eventTime) || Date.parse(eventTime) > clock) throw fail('Choose a valid past ISO event timestamp.', 400);
  const event = etParts(eventTime), today = etParts(clock).day;
  const stock = closesBySession(stockBars, today), benchmark = closesBySession(benchmarkBars, today);
  const dates = [...benchmark.prices.keys()].sort();
  const referenceSession = dates.filter(date => date < event.day || date === event.day && event.seconds > 16 * 3600).at(-1) || null;
  const postDates = dates.filter(date => event.seconds < 16 * 3600 ? date >= event.day : date > event.day);
  const limitations = [
    'Retrospective daily-close approximation, not an intraday event-attribution or predictive backtest.',
    'Intraday event-day outcomes also contain price movement before the event; unrelated news and market factors may confound outcomes.',
    'Horizon indexing uses the supplied benchmark sessions; missing benchmark sessions and holidays are not independently reconstructed.',
    'Current ET calendar-day bars are conservatively excluded, including after the regular close.',
    'The caller must provide consistent currency, feed and corporate-action adjustment bases; these are not inferred from price values.',
    'No company exposure, causality or future return probability is established by these comparisons.',
  ];
  const base = {eventTime, eventDay: event.day, referenceSession, firstPostEventSession: postDates[0] || null,
    benchmark: 'SPY', marketCalendar: 'America/New_York / observed benchmark sessions',
    method: 'Pre-event completed close to post-event daily closes; stock return minus SPY return in percentage points.',
    methodVersion: OUTCOME_METHOD_VERSION, limitations, inputQuality: {stock: stock.quality, benchmark: benchmark.quality}};
  if (!referenceSession || !stock.prices.has(referenceSession)) return {...base, status: 'insufficient_data',
    reason: 'A matching stock and benchmark close from the last completed pre-event session is required.', horizons: []};
  const stockReference = stock.prices.get(referenceSession), benchmarkReference = benchmark.prices.get(referenceSession);
  const horizons = [1, 5, 20].map(sessions => {
    const date = postDates[sessions - 1];
    if (!date || !stock.prices.has(date)) return {sessions, status: 'pending', date: date || null,
      stockReturnPct: null, benchmarkReturnPct: null, relativeReturnPct: null,
      reason: date ? 'Stock close is missing for this exact benchmark-session horizon.' : 'Not enough completed benchmark sessions are available.'};
    const stockReturnPct = (stock.prices.get(date) / stockReference - 1) * 100;
    const benchmarkReturnPct = (benchmark.prices.get(date) / benchmarkReference - 1) * 100;
    return {sessions, status: 'observed', date, stockReturnPct: round(stockReturnPct), benchmarkReturnPct: round(benchmarkReturnPct),
      relativeReturnPct: round(stockReturnPct - benchmarkReturnPct)};
  });
  const observed = horizons.some(horizon => horizon.status === 'observed');
  return {...base, status: observed ? 'observed' : 'insufficient_data',
    ...(observed ? {} : {reason: 'At least one matching completed post-event session is required.'}), horizons};
}
