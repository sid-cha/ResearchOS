import {EventEmitter} from 'node:events';
import {normalizeAlpacaEvent, marketEventIdentity} from './market-events.mjs';

const ENDPOINT = 'wss://stream.data.alpaca.markets/v2/iex';
const DEFAULT_SYMBOLS = ['NVDA','AAPL','MSFT','TSLA','SPY','AMD','QQQ','META','AMZN','PLTR'];
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_BATCH_MESSAGES = 1000;
const TERMINAL_ERRORS = new Map([
  [400, 'Provider rejected the stream request.'],
  [401, 'Provider authentication failed; check local Alpaca credentials.'],
  [402, 'Provider authentication failed; check local Alpaca credentials.'],
  [403, 'Provider authentication failed; check local Alpaca credentials.'],
  [405, 'Provider symbol subscription limit reached.'],
  [406, 'Provider connection limit reached; close another Alpaca stream before retrying.'],
  [408, 'Provider stream is not enabled for this account.'],
  [409, 'Provider subscription is not entitled to this feed.'],
  [410, 'Provider feed or subscription is not available for this account.'],
]);

// Date.parse retains milliseconds only. Include the remaining fractional digits
// when ordering RFC3339 observations, without rewriting the source timestamp.
function eventTimeOrder(value) {
  const extra = value.match(/\.(\d+)/)?.[1].padEnd(9, '0').slice(3, 9) || '0';
  return BigInt(Date.parse(value)) * 1000000n + BigInt(extra);
}

/** One process-owned, read-only IEX connection. All public diagnostics are
 * deliberately selected static messages: provider error text is never exposed.
 * No raw event archive is retained; the bounded identity cache survives reconnects.
 */
export function createMarketStream({
  key = process.env.APCA_API_KEY_ID,
  secret = process.env.APCA_API_SECRET_KEY,
  symbols = DEFAULT_SYMBOLS,
  WebSocketImpl = globalThis.WebSocket,
  now = Date.now,
  random = Math.random,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  maxRetries = 6,
  connectTimeoutMs = 10000,
  subscriptionTimeoutMs = 10000,
  idleTimeoutMs = 120000,
  stableConnectionMs = 60000,
  dedupeLimit = 10000,
} = {}) {
  if (!Array.isArray(symbols) || !symbols.length || symbols.length > 100 ||
      symbols.some(symbol => typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) ||
      new Set(symbols).size !== symbols.length) {
    throw new TypeError('A bounded list of unique supported market symbols is required');
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 20 ||
      !Number.isInteger(dedupeLimit) || dedupeLimit < 1 || dedupeLimit > 100000 ||
      [connectTimeoutMs, subscriptionTimeoutMs, idleTimeoutMs, stableConnectionMs]
        .some(value => !Number.isFinite(value) || value < 1 || value > 3600000)) {
    throw new TypeError('Invalid market stream lifecycle bounds');
  }
  const supported = [...symbols];
  const configured = typeof key === 'string' && key.trim().length > 0 &&
    typeof secret === 'string' && secret.trim().length > 0;
  const events = new EventEmitter();
  const identities = new Map();
  const watermarks = new Map();
  let desired = false;
  let socket = null;
  let detach = null;
  let phase = 'idle';
  let retryStreak = 0;
  let phaseTimer = null;
  let idleTimer = null;
  let reconnectTimer = null;
  let stableTimer = null;
  const health = {
    provider: 'alpaca', feed: 'iex', coverage: 'single-venue', mode: 'LIVE',
    transport: 'websocket', configured, status: 'idle',
    symbols: supported,
    lastExchangeEventTime: null, lastIngestedAt: null, lastReceivedAt: null,
    observationsReceived: 0, observationsEmitted: 0, duplicatesDiscarded: 0,
    malformedMessages: 0, outOfOrderObservations: 0,
    reconnectionAttempts: 0, nextRetryAt: null,
    gaps: {status: 'unknown', interruptions: 0,
      message: 'IEX messages do not establish complete-market coverage or guaranteed sequence continuity.'},
    message: 'Stream starts when a browser subscribes.',
  };
  const msNow = () => Number(now());
  const timestamp = () => new Date(msNow()).toISOString();
  function getHealth() {
    const age = health.lastExchangeEventTime === null ? null :
      Math.max(0, Math.floor((msNow() - Date.parse(health.lastExchangeEventTime)) / 1000));
    return {...health, symbols: [...supported], gaps: {...health.gaps},
      retryAttempt: retryStreak, retryLimit: maxRetries,
      freshness: {
        ageSeconds: age, status: age === null ? 'no-observations' : 'observed',
        sessionAssessment: 'unknown',
        note: 'Observation age alone does not establish an outage; markets may be closed or quiet.',
      }};
  }
  function notify(status, message) {
    if (status) health.status = status;
    if (message) health.message = message;
    events.emit('health', getHealth());
  }
  function clearTimer(name) {
    if (name !== null) clearTimeoutFn(name);
    return null;
  }
  function releaseSocket() {
    phaseTimer = clearTimer(phaseTimer);
    idleTimer = clearTimer(idleTimer);
    stableTimer = clearTimer(stableTimer);
    if (detach) detach();
    detach = null;
    const old = socket;
    socket = null;
    if (old) {
      try { old.close(1000, 'Local market stream lifecycle'); } catch { /* closed */ }
    }
  }
  function unavailable(message) {
    releaseSocket();
    reconnectTimer = clearTimer(reconnectTimer);
    phase = 'unavailable';
    health.nextRetryAt = null;
    notify('unavailable', message);
  }
  function reconnect(message) {
    if (!desired || phase === 'unavailable' || reconnectTimer !== null) return;
    releaseSocket();
    health.gaps.interruptions += 1;
    if (retryStreak >= maxRetries) {
      unavailable('Stream retry limit reached; check provider access and reconnect from LIVE mode.');
      return;
    }
    retryStreak += 1;
    health.reconnectionAttempts += 1;
    const sample = Math.min(1, Math.max(0, Number(random()) || 0));
    const delay = Math.round(Math.min(30000, 1000 * (2 ** (retryStreak - 1))) * (0.5 + sample * 0.5));
    phase = 'reconnecting';
    health.nextRetryAt = new Date(msNow() + delay).toISOString();
    notify('reconnecting', message);
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      if (desired) connect();
    }, delay);
    reconnectTimer?.unref?.();
  }
  function deadline(duration, message) {
    phaseTimer = clearTimer(phaseTimer);
    phaseTimer = setTimeoutFn(() => reconnect(message), duration);
    phaseTimer?.unref?.();
  }
  function watchIdle() {
    idleTimer = clearTimer(idleTimer);
    idleTimer = setTimeoutFn(() => reconnect(
      'No provider frames within the transport check interval; reconnecting to verify connectivity. Quiet or closed markets remain possible.'
    ), idleTimeoutMs);
    idleTimer?.unref?.();
  }
  function send(payload) {
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      reconnect('Provider connection could not send the stream handshake.');
      return false;
    }
  }
  function subscriptionMatches(message) {
    return ['trades', 'quotes', 'bars'].every(channel => {
      const actual = message[channel];
      return Array.isArray(actual) && actual.length === supported.length &&
        new Set(actual).size === supported.length && supported.every(symbol => actual.includes(symbol));
    });
  }
  function handleControl(message) {
    if (message.T === 'error') {
      const code = Number(message.code);
      if (TERMINAL_ERRORS.has(code)) unavailable(TERMINAL_ERRORS.get(code));
      else reconnect('Provider reported a stream error; retrying the connection.');
      return true;
    }
    if (message.T === 'success') {
      if (message.msg === 'connected' && phase === 'connecting') {
        phase = 'authenticating';
        notify('authenticating', 'Connected to Alpaca IEX; authenticating on the server.');
        deadline(connectTimeoutMs, 'Provider authentication response timed out.');
        send({action: 'auth', key, secret});
      } else if (message.msg === 'authenticated' && phase === 'authenticating') {
        phase = 'subscribing';
        notify('subscribing', 'Authenticated; confirming the supported IEX subscriptions.');
        deadline(subscriptionTimeoutMs, 'Provider subscription acknowledgement timed out.');
        send({action: 'subscribe', trades: supported, quotes: supported, bars: supported});
      }
      return true;
    }
    if (message.T === 'subscription') {
      if (phase !== 'subscribing' && phase !== 'streaming') return true;
      if (!subscriptionMatches(message)) {
        unavailable('Provider did not confirm every requested trade, quote and bar subscription.');
        return true;
      }
      phaseTimer = clearTimer(phaseTimer);
      phase = 'streaming';
      health.nextRetryAt = null;
      stableTimer = clearTimer(stableTimer);
      stableTimer = setTimeoutFn(() => {
        stableTimer = null;
        retryStreak = 0;
        notify();
      }, stableConnectionMs);
      stableTimer?.unref?.();
      watchIdle();
      notify('streaming', 'Authenticated IEX trade, quote and bar subscriptions confirmed; single-venue coverage.');
      return true;
    }
    return false;
  }
  function acceptObservation(message, receivedAt) {
    if (phase !== 'streaming') return;
    const observation = normalizeAlpacaEvent(message, {
      symbols: supported, receivedAt, ingestedAt: timestamp(),
    });
    if (!observation) {
      health.malformedMessages += 1;
      return;
    }
    health.observationsReceived += 1;
    const identity = marketEventIdentity(observation);
    if (identity !== null && identities.has(identity)) {
      health.duplicatesDiscarded += 1;
      return;
    }
    if (identity !== null) {
      identities.set(identity, true);
      if (identities.size > dedupeLimit) identities.delete(identities.keys().next().value);
    }
    const time = observation.exchangeEventTime;
    if (time !== null) {
      const watermarkKey = `${observation.symbol}:${observation.eventType}`;
      const watermark = watermarks.get(watermarkKey);
      const outOfOrder = watermark !== undefined && eventTimeOrder(time) < eventTimeOrder(watermark);
      observation.quality = {...observation.quality, outOfOrder};
      if (outOfOrder) health.outOfOrderObservations += 1;
      else watermarks.set(watermarkKey, time);
      if (health.lastExchangeEventTime === null || eventTimeOrder(time) > eventTimeOrder(health.lastExchangeEventTime)) {
        health.lastExchangeEventTime = time;
      }
    }
    health.lastIngestedAt = observation.ingestedAt;
    health.observationsEmitted += 1;
    events.emit('observation', observation);
  }
  function receive(event) {
    const raw = event.data;
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_FRAME_BYTES) {
      health.malformedMessages += 1;
      if (typeof raw === 'string') reconnect('Provider frame exceeded the local stream size limit.');
      return;
    }
    let batch;
    try {
      batch = JSON.parse(raw, (field, value, context) => {
        // JSON numeric trade identifiers may exceed JS's exact integer range.
        // Modern Node provides the original token to revivers; preserve it when
        // available. Older runtimes leave an unsafe number for validation to
        // reject, rather than publishing an invented rounded identifier.
        if (field === 'i' && typeof value === 'number' && !Number.isSafeInteger(value) &&
            /^\d+$/.test(context?.source || '')) return context.source;
        return value;
      });
    } catch {
      health.malformedMessages += 1;
      return;
    }
    if (!Array.isArray(batch) || batch.length > MAX_BATCH_MESSAGES) {
      health.malformedMessages += 1;
      return;
    }
    const receivedAt = timestamp();
    health.lastReceivedAt = receivedAt;
    if (phase === 'streaming') watchIdle();
    for (const message of batch) {
      if (!desired || phase === 'unavailable' || phase === 'reconnecting') break;
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        health.malformedMessages += 1;
        continue;
      }
      if (!handleControl(message)) acceptObservation(message, receivedAt);
    }
  }
  function connect() {
    if (!desired) return;
    phase = 'connecting';
    health.nextRetryAt = null;
    notify('connecting', 'Connecting to the server-owned Alpaca IEX stream.');
    let created;
    try { created = new WebSocketImpl(ENDPOINT); } catch {
      reconnect('Could not open the provider stream connection.');
      return;
    }
    socket = created;
    const active = callback => event => {
      if (socket === created && desired) callback(event);
    };
    const handlers = {
      message: active(receive),
      error: active(() => reconnect('Provider transport error; reconnecting.')),
      close: active(event => {
        if ([1008, 4001, 4003].includes(event.code)) unavailable('Provider closed the stream for authentication or subscription policy.');
        else reconnect('Provider connection closed; reconnecting with bounded backoff.');
      }),
    };
    for (const [name, handler] of Object.entries(handlers)) created.addEventListener(name, handler);
    detach = () => {
      for (const [name, handler] of Object.entries(handlers)) created.removeEventListener(name, handler);
    };
    deadline(connectTimeoutMs, 'Provider connection handshake timed out.');
  }
  function start() {
    if (desired) return;
    desired = true;
    retryStreak = 0;
    if (!configured) {
      unavailable('Alpaca credentials are missing; add them to the local .env and restart the server.');
      return;
    }
    if (typeof WebSocketImpl !== 'function') {
      unavailable('This Node runtime does not support WebSocket streaming. Use a supported Node 22+ runtime or snapshot fallback.');
      return;
    }
    connect();
  }
  function stop() {
    desired = false;
    reconnectTimer = clearTimer(reconnectTimer);
    releaseSocket();
    health.nextRetryAt = null;
    phase = 'stopped';
    notify('stopped', 'No browser stream subscribers; upstream connection stopped.');
  }
  return Object.assign(events, {start, stop, getHealth});
}
