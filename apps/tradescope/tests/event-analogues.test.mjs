import test from 'node:test';
import assert from 'node:assert/strict';
import {createEarthquakeResearch, compareEventOutcomes} from '../lib/event-analogues.mjs';

const now = Date.parse('2026-11-15T20:00:00Z');
const quake = (id, date, {magnitude = 7, depth = 20, latitude = 35, longitude = 140, updated, title, tsunami = 0} = {}) => ({
  type: 'Feature', id, properties: {mag: magnitude, time: Date.parse(date), updated: Date.parse(updated || date),
    title: title || `Fixture ${id}`, tsunami, url: 'https://untrusted.example/ignored'},
  geometry: {type: 'Point', coordinates: [longitude, latitude, depth]},
});
const selected = quake('uscurrent', '2026-11-12T15:00:00Z', {tsunami: 1});
const collection = features => ({type: 'FeatureCollection', features});
const result = payload => new Response(JSON.stringify(payload), {headers: {'Content-Type': 'application/json'}});

function fixtureResearch({history = [], recent = [selected], detail = selected, ...options} = {}) {
  const requests = [];
  const research = createEarthquakeResearch({now: () => now, fetchImpl: async (raw, init) => {
    const url = new URL(raw); requests.push({url, init});
    assert.equal(url.origin, 'https://earthquake.usgs.gov');
    assert.equal(init.redirect, 'error');
    assert.deepEqual(Object.keys(init.headers), ['Accept']);
    if (url.pathname.includes('/summary/')) return result(collection(recent));
    if (url.pathname.includes('/detail/')) return result(detail);
    return result(collection(history));
  }, ...options});
  return {research, requests};
}

test('recent official events preserve unknown first-publication time and do not equate tsunami flag with a warning', async () => {
  const malformed = quake('usinvalid', '2026-11-11T00:00:00Z'); malformed.geometry.coordinates[0] = '140';
  const newer = {...selected, properties: {...selected.properties, updated: Date.parse('2026-11-14T10:00:00Z'), title: 'Revised fixture'}};
  const h = fixtureResearch({recent: [selected, malformed, newer, quake('usfuture', '2027-01-01T00:00:00Z')]});
  const value = await h.research.recentEvents();
  assert.equal(value.events.length, 1);
  const event = value.events[0];
  assert.equal(event.id, 'uscurrent'); assert.equal(event.title, 'Revised fixture');
  assert.equal(event.publishedAt, null); assert.equal(event.firstPublishedAt, null); assert.equal(event.historicalAvailableAt, null);
  assert.equal(event.knowledgeStatus, 'retrospective_catalog');
  assert.equal(event.ingestedAt, '2026-11-15T20:00:00.000Z');
  assert.equal(event.updatedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(event.sourceUrl, 'https://earthquake.usgs.gov/earthquakes/eventpage/uscurrent');
  assert.equal(event.tsunamiFlag, true); assert(value.limitations.some(text => /not a confirmed tsunami warning/.test(text)));
  assert.equal(value.coverage.rejectedCount, 2); assert.equal(value.coverage.duplicateCount, 1);
  assert(!JSON.stringify(value).includes('untrusted.example'));
});

test('analogue search uses a bounded earlier official catalogue and explains dimensions, exclusions and unknown exposure', async () => {
  const near = quake('usnearpast', '2011-03-11T05:00:00Z', {magnitude: 7.1, depth: 25, latitude: 36, longitude: 139});
  const aftershock = quake('usaftershock', '2011-03-12T05:00:00Z', {magnitude: 6.7, depth: 25, latitude: 36.05, longitude: 139.05});
  const other = quake('usotherpast', '2008-08-15T00:00:00Z', {magnitude: 6, depth: 100, latitude: 38, longitude: 145});
  const currentEpisode = quake('usforeshock', '2026-11-10T15:00:00Z', {magnitude: 6.8});
  const bad = quake('usmalformed', '2010-01-01T00:00:00Z'); bad.properties.mag = null;
  const h = fixtureResearch({history: [other, aftershock, selected, currentEpisode, bad, near,
    quake('usfuture', '2026-11-13T15:00:00Z'), quake('usold', '1990-01-01T00:00:00Z'),
    quake('usfar', '2010-01-01T00:00:00Z', {latitude: -30, longitude: -70})]});
  const value = await h.research.findAnalogues({eventId: 'usgs:uscurrent'});
  assert.deepEqual(value.matches.map(match => match.event.id), ['usnearpast', 'usotherpast']);
  assert(value.matches[0].similarity > value.matches[1].similarity);
  assert(value.matches.every(match => match.similarity >= 0 && match.similarity <= 1));
  assert.equal(value.matches[0].matchedFeatures.length, 3);
  assert.deepEqual(value.matches[0].matchedFeatures.map(x => x.feature), ['magnitude', 'depthKm', 'distanceKm']);
  assert.equal(value.coverage.excluded.selectedCluster, 1);
  assert.equal(value.coverage.excluded.clustered, 1);
  assert.equal(value.coverage.excluded.outsideWindow, 4);
  assert.equal(value.coverage.excluded.malformed, 1);
  assert.equal(value.exposures.status, 'unverified'); assert.deepEqual(value.exposures.links, []);
  assert.equal(value.forecast.status, 'unavailable');
  assert.match(value.matches[0].similarityMeaning, /not a forecast probability/);
  const query = h.requests[1].url;
  assert.equal(query.pathname, '/fdsnws/event/1/query'); assert.equal(query.searchParams.get('limit'), '2000');
  assert.equal(query.searchParams.get('starttime'), '1996-11-12T15:00:00.000Z');
  assert.equal(query.searchParams.get('endtime'), '2026-11-12T14:59:59.999Z');
  assert.equal(query.searchParams.get('maxradiuskm'), '3000'); assert.equal(query.searchParams.get('eventtype'), 'earthquake');
});

test('duplicate revisions, independent ties and ranking are deterministic rather than input-order dependent', async () => {
  const a = quake('usalpha', '2000-01-01T00:00:00Z');
  const z = quake('uszulu', '2010-01-01T00:00:00Z');
  const revised = quake('usrevision', '2005-01-01T00:00:00Z', {magnitude: 6.7, updated: '2026-11-14T00:00:00Z'});
  const outdated = quake('usrevision', '2005-01-01T00:00:00Z', {magnitude: 7, updated: '2005-01-01T00:00:00Z'});
  const history = [z, outdated, a, revised];
  const first = await fixtureResearch({history}).research.findAnalogues({eventId: 'uscurrent'});
  const reverse = await fixtureResearch({history: [...history].reverse()}).research.findAnalogues({eventId: 'uscurrent'});
  assert.deepEqual(first, reverse);
  assert.deepEqual(first.matches.map(match => match.event.id), ['usalpha', 'uszulu', 'usrevision']);
  assert.equal(first.matches[2].event.magnitude, 6.7);
  assert.equal(first.matches[2].event.knowledgeStatus, 'retrospective_catalog', 'a later revision is not falsely represented as original-alert knowledge');
  assert.equal(first.coverage.excluded.duplicates, 1);
});

test('query caps and no comparable history remain explicit instead of manufacturing matches or forecasts', async () => {
  const h = fixtureResearch({historyLimit: 1, history: [quake('usfirst', '2010-01-01T00:00:00Z'), quake('ussecond', '2015-01-01T00:00:00Z')]});
  const value = await h.research.findAnalogues({eventId: 'uscurrent', limit: 1});
  assert.equal(value.matches.length, 1); assert.equal(value.coverage.queryCapReached, true);
  assert.equal(h.requests[1].url.searchParams.get('limit'), '1');
  assert(value.limitations.some(text => /query cap/.test(text)));
  const empty = await fixtureResearch().research.findAnalogues({eventId: 'uscurrent'});
  assert.deepEqual(empty.matches, []); assert.equal(empty.forecast.status, 'unavailable');
});

test('invalid identifiers and limits cannot become requests or arbitrary URLs', async () => {
  const h = fixtureResearch();
  for (const id of ['../../private', 'https://example.com/a', 'uscurrent?token=secret', 'us%2Fcurrent', '', 'A'.repeat(100), null]) {
    await assert.rejects(h.research.findAnalogues({eventId: id}), {status: 400});
  }
  for (const limit of [0, 6, -1, 1.5, '5']) await assert.rejects(h.research.findAnalogues({eventId: 'uscurrent', limit}), {status: 400});
  assert.equal(h.requests.length, 0);
  const changed = fixtureResearch({detail: quake('usnewidentifier', '2026-11-12T15:00:00Z')});
  await assert.rejects(changed.research.findAnalogues({eventId: 'uscurrent'}), {status: 409});
});

test('missing spatial/magnitude data and future selected events are not guessed', async () => {
  for (const change of [feature => feature.geometry.coordinates.pop(), feature => feature.geometry.coordinates[1] = 91,
    feature => feature.properties.mag = '7', feature => feature.properties.time = NaN]) {
    const detail = structuredClone(selected); change(detail);
    await assert.rejects(fixtureResearch({detail}).research.findAnalogues({eventId: 'uscurrent'}), {status: 502});
  }
  await assert.rejects(fixtureResearch({detail: quake('uscurrent', '2027-01-01T00:00:00Z')}).research.findAnalogues({eventId: 'uscurrent'}), {status: 400});
});

test('provider errors, malformed/oversized payloads and timeouts return bounded safe diagnostics', async () => {
  const make = fetchImpl => createEarthquakeResearch({fetchImpl, now: () => now});
  await assert.rejects(make(async () => new Response('echo private-provider-body', {status: 403})).recentEvents(), error => error.status === 502 && !error.message.includes('private-provider-body'));
  await assert.rejects(make(async () => new Response('not json')).recentEvents(), {status: 502});
  await assert.rejects(make(async () => result({message: 'private-provider-body'})).recentEvents(), error => error.status === 502 && !error.message.includes('private-provider-body'));
  await assert.rejects(createEarthquakeResearch({fetchImpl: async () => new Response('x'.repeat(100)), maxBytes: 32}).recentEvents(), /size limit/);
  await assert.rejects(createEarthquakeResearch({fetchImpl: async () => new Response('{}', {headers: {'Content-Length': '100000'}}), maxBytes: 32}).recentEvents(), /size limit/);
  const timeout = createEarthquakeResearch({timeoutMs: 5, fetchImpl: async (_url, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('private-abort-detail'), {name: 'AbortError'}))))});
  await assert.rejects(timeout.recentEvents(), error => error.status === 504 && !error.message.includes('private-abort-detail'));
  await assert.rejects(make(async () => { throw Error('private-fetch-detail'); }).recentEvents(), error => error.status === 502 && !error.message.includes('private-fetch-detail'));
});

test('recent requests share a bounded cache without exposing mutable cached responses', async () => {
  let clock = now, calls = 0;
  const research = createEarthquakeResearch({now: () => clock, cacheLimit: 1, fetchImpl: async () => { calls++; return result(collection([selected])); }});
  const [a, b] = await Promise.all([research.recentEvents(), research.recentEvents()]);
  assert.equal(calls, 1); a.events[0].title = 'Changed by caller'; assert.equal(b.events[0].title, 'Fixture uscurrent');
  clock += 60000;
  const cached = await research.recentEvents(); assert.equal(calls, 1); assert.equal(cached.events[0].title, 'Fixture uscurrent');
  assert.equal(cached.fetchedAt, '2026-11-15T20:00:00.000Z');
  assert.equal(cached.events[0].ingestedAt, '2026-11-15T20:00:00.000Z', 'cache lookup does not invent a new provider-fetch time');
  clock += 60001; const fresh = await research.recentEvents(); assert.equal(calls, 2);
  assert.equal(fresh.fetchedAt, new Date(clock).toISOString());
});

test('the recent-event pilot excludes old, low-magnitude and explicitly non-earthquake records', async () => {
  const explosion = quake('usexplosion', '2026-11-13T00:00:00Z'); explosion.properties.type = 'quarry blast';
  const value = await fixtureResearch({recent: [selected, explosion,
    quake('usolder', '2026-11-01T00:00:00Z'), quake('ussmall', '2026-11-13T00:00:00Z', {magnitude: 4.4})]}).research.recentEvents();
  assert.deepEqual(value.events.map(event => event.id), ['uscurrent']);
  assert.equal(value.coverage.rejectedCount, 3);
});

test('thirty-year historical bounds clamp leap day without excluding the earlier February end', async () => {
  const leap = quake('uscurrent', '2024-02-29T15:00:00Z');
  const h = fixtureResearch({detail: leap});
  await h.research.findAnalogues({eventId: 'uscurrent'});
  assert.equal(h.requests[1].url.searchParams.get('starttime'), '1994-02-28T15:00:00.000Z');
});

const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
const priceBars = prices => prices.map((c, index) => ({t: dates[index] + 'T05:00:00Z', c}));
const stock = priceBars([99, 100, 103, 104, 105, 106, 107, 108]);
const benchmark = priceBars([99, 100, 101, 101.25, 101.5, 101.75, 102, 102.25]);
const laterNow = new Date('2026-12-01T15:00:00Z');

test('intraday event outcomes use the prior completed close and retain event-day reaction in the first outcome', () => {
  const value = compareEventOutcomes('2026-11-05T15:00:00Z', stock, benchmark, {now: laterNow});
  assert.equal(value.status, 'observed'); assert.equal(value.referenceSession, '2026-11-04');
  assert.equal(value.firstPostEventSession, '2026-11-05');
  assert.deepEqual(value.horizons[0], {sessions: 1, status: 'observed', date: '2026-11-05', stockReturnPct: 3, benchmarkReturnPct: 1, relativeReturnPct: 2});
  assert.equal(value.horizons[1].date, '2026-11-11'); assert.equal(value.horizons[1].relativeReturnPct, 5);
  assert.equal(value.horizons[2].status, 'pending');
  assert(value.limitations.some(text => /before the event/.test(text)));
});

test('after-hours and exact-close events never use a future post-event close as their reference', () => {
  const after = compareEventOutcomes('2026-11-05T21:30:00Z', stock, benchmark, {now: laterNow});
  assert.equal(after.referenceSession, '2026-11-05'); assert.equal(after.firstPostEventSession, '2026-11-06');
  assert.equal(after.horizons[0].date, '2026-11-06');
  const exact = compareEventOutcomes('2026-11-05T21:00:00Z', stock, benchmark, {now: laterNow});
  assert.equal(exact.referenceSession, '2026-11-04', 'close coincident with event is not strictly pre-event');
  assert.equal(exact.firstPostEventSession, '2026-11-06');
  const weekend = compareEventOutcomes('2026-11-07T16:00:00Z', stock, benchmark, {now: laterNow});
  assert.equal(weekend.referenceSession, '2026-11-06'); assert.equal(weekend.firstPostEventSession, '2026-11-09');
});

test('current ET day and future bars are excluded, even after the regular close', () => {
  const value = compareEventOutcomes('2026-11-05T15:00:00Z', stock, benchmark, {now: '2026-11-11T23:00:00Z'});
  assert.equal(value.horizons[0].status, 'observed'); assert.equal(value.horizons[1].status, 'pending');
  assert.equal(value.inputQuality.stock.usable, 6); assert.equal(value.inputQuality.stock.rejected, 2);
  const utcDifferentDay = compareEventOutcomes('2026-11-05T15:00:00Z', stock, benchmark, {now: '2026-11-12T02:00:00Z'});
  assert.equal(utcDifferentDay.inputQuality.stock.usable, 6);
});

test('missing exact session prices do not shift outcome horizons or silently move the pre-event baseline', () => {
  const missingFirst = stock.filter(bar => !bar.t.startsWith('2026-11-05'));
  const value = compareEventOutcomes('2026-11-05T15:00:00Z', missingFirst, benchmark, {now: laterNow});
  assert.equal(value.horizons[0].status, 'pending'); assert.equal(value.horizons[0].date, '2026-11-05');
  assert.equal(value.horizons[1].date, '2026-11-11'); assert.equal(value.horizons[1].status, 'observed');
  const missingReference = stock.filter(bar => !bar.t.startsWith('2026-11-04'));
  const absent = compareEventOutcomes('2026-11-05T15:00:00Z', missingReference, benchmark, {now: laterNow});
  assert.equal(absent.status, 'insufficient_data'); assert.equal(absent.referenceSession, '2026-11-04'); assert.deepEqual(absent.horizons, []);
});

test('outcome inputs reject coercion and conflicting duplicates, preserve identical duplicates and empty states', () => {
  const corrupt = stock.map(bar => ({...bar})); corrupt[1].c = null;
  assert.equal(compareEventOutcomes('2026-11-05T15:00:00Z', corrupt, benchmark, {now: laterNow}).status, 'insufficient_data');
  for (const c of ['100', 0, NaN, Infinity]) {
    const bad = stock.map(bar => ({...bar})); bad[1].c = c;
    assert.equal(compareEventOutcomes('2026-11-05T15:00:00Z', bad, benchmark, {now: laterNow}).status, 'insufficient_data');
  }
  const duplicate = compareEventOutcomes('2026-11-05T15:00:00Z', [...stock, stock[1]], benchmark, {now: laterNow});
  assert.equal(duplicate.status, 'observed'); assert.equal(duplicate.inputQuality.stock.duplicates, 1);
  const conflict = compareEventOutcomes('2026-11-05T15:00:00Z', [...stock, {...stock[1], c: 200}], benchmark, {now: laterNow});
  assert.equal(conflict.status, 'insufficient_data'); assert.equal(conflict.inputQuality.stock.conflictingSessions, 1);
  const empty = compareEventOutcomes('2026-11-05T15:00:00Z', [], [], {now: laterNow});
  assert.equal(empty.status, 'insufficient_data'); assert.equal(empty.referenceSession, null);
});

test('outcome timestamp validation and short samples never manufacture predicted returns', () => {
  for (const time of ['2026-02-30T15:00:00Z', '2026-11-05T15:00:00', '2027-01-01T00:00:00Z', null]) {
    assert.throws(() => compareEventOutcomes(time, stock, benchmark, {now: laterNow}), {status: 400});
  }
  const dateOnly = compareEventOutcomes('2026-11-05T15:00:00Z', [{t: '2026-11-04', c: 100}], [{t: '2026-11-04', c: 100}], {now: laterNow});
  assert.equal(dateOnly.status, 'insufficient_data'); assert.equal(dateOnly.horizons[0].relativeReturnPct, null);
  assert.equal(dateOnly.horizons[0].status, 'pending');
  assert.match(dateOnly.methodVersion, /pre-event-close/);
});
