/** One process-owned provider connector, bounded same-origin browser delivery.
 * No tick archive or Last-Event-ID replay: reconnect continuity is unknown.
 */
export function createMarketDelivery({stream, heartbeatMs = 15000, maxClients = 8,
  maxBufferedBytes = 65536, setIntervalFn = setInterval, clearIntervalFn = clearInterval} = {}) {
  const clients = new Set();
  let heartbeat = null;
  let closed = false;

  function remove(client) {
    if (!clients.delete(client)) return;
    client.res.off('close', client.cleanup);
    client.res.off('error', client.cleanup);
    if (!clients.size) {
      if (heartbeat !== null) clearIntervalFn(heartbeat);
      heartbeat = null;
      stream.stop();
    }
  }

  function write(client, frame) {
    const {res} = client;
    if (res.destroyed || res.writableEnded) { remove(client); return; }
    // Disconnect a slow reader instead of queuing an unbounded tick backlog.
    if (res.writableLength + Buffer.byteLength(frame) > maxBufferedBytes) {
      remove(client);
      res.destroy();
      return;
    }
    try { res.write(frame); } catch { remove(client); res.destroy(); }
  }

  function broadcast(event, value) {
    if (!clients.size) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    for (const client of clients) write(client, frame);
  }
  const observation = value => broadcast('observation', value);
  const health = value => broadcast('health', value);
  stream.on('observation', observation);
  stream.on('health', health);

  function reject(res, status, message) {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(JSON.stringify({error: message}));
  }

  function handle(req, res, url) {
    if (url.pathname !== '/api/stream') return false;
    if (req.method !== 'GET') { reject(res, 405, 'Method not allowed'); return true; }
    // EventSource sends no custom auth header. Preserve local same-origin scope.
    let sameOrigin = true;
    try {
      if (req.headers.origin) sameOrigin = new URL(req.headers.origin).origin === `http://${req.headers.host}`;
    } catch { sameOrigin = false; }
    if (!sameOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
      reject(res, 403, 'Use the same-origin TradeScope terminal'); return true;
    }
    if (closed) { reject(res, 503, 'Market stream is shutting down'); return true; }
    if (clients.size >= maxClients) { reject(res, 503, 'Local market stream client limit reached'); return true; }
    res.writeHead(200, {'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform', 'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff'});
    res.flushHeaders();
    const client = {res, cleanup: null};
    client.cleanup = () => remove(client);
    clients.add(client);
    res.on('close', client.cleanup);
    res.on('error', client.cleanup);
    write(client, 'retry: 5000\n: TradeScope live delivery; reconnect gaps are unknown\n\n');
    write(client, `event: health\ndata: ${JSON.stringify(stream.getHealth())}\n\n`);
    if (clients.size === 1) {
      heartbeat = setIntervalFn(() => {
        for (const c of clients) write(c, ': heartbeat\n\n');
        broadcast('health', stream.getHealth());
      }, heartbeatMs);
      heartbeat?.unref?.();
      stream.start();
    }
    return true;
  }

  function close() {
    if (closed) return;
    closed = true;
    for (const client of [...clients]) {
      remove(client);
      client.res.end();
    }
    if (heartbeat !== null) clearIntervalFn(heartbeat);
    heartbeat = null;
    stream.stop();
    stream.off('observation', observation);
    stream.off('health', health);
  }
  return {handle, close, getClientCount: () => clients.size};
}
