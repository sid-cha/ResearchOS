# ResearchOS / TradeScope v0.30–v0.31 — capture and Docker foundation

Status: single-analyst local development, cumulative PR #19 draft. No commercial license, upstream entitlement, live feed continuity or hosted deployment is established by CI.

## v0.30 — TS-MDI-704 private normalized IEX capture

Enable recording only after confirming your provider permits retaining normalized observations. In the private ignored apps/tradescope/.env, set:

    HOST=127.0.0.1
    MARKET_CAPTURE_ENABLED=true
    MARKET_CAPTURE_RIGHTS_CONFIRMED=true
    # Optional absolute private path:
    # MARKET_CAPTURE_PATH=C:/Users/you/ResearchOS-data/market-captures

A true acknowledgement is user-declared, NOT programmatic verification of an Alpaca data-retention license. Missing flags or Alpaca keys leave capture disabled. No capture happens on page load.

The recorder in lib/market-capture.mjs subscribes to the existing process-owned authenticated Alpaca IEX stream, never a second socket. Accepted observations are normalized trade, quote and bar events with exchange, received and ingested clocks; provider-only fields and credentials are not stored. The recorder does not accept arbitrary client-provided observations, external URLs or file paths.

Private files are saved under ignored .local-data/market-captures by default, with a server-generated session UUID, an original-source header and per-entry SHA-256 linked hashes. The default bounds are 20 sessions, 10000 observations and 6MB per session. A reached record limit seals the file; tampered, truncated, or malformed sessions are refused. Interrupted but structurally valid unsealed files remain visibly INCOMPLETE. These hashes are not independently timestamped, certified WORM, encrypted, or safe for concurrent writers.

Capture survives browser SSE disconnection while the Node server is running. Unknown provider transport gaps are recorded as interruptions, not interpolated data. Only observed IEX messages are retained; the stream does not establish a complete US-market tape, guaranteed original sequence or a verified event first-publication clock.

Market UI: Markets → Surveillance → Capture & Replay, at http://127.0.0.1:8000/market-capture.html. The local page permits explicit start/stop, session verification, replay paging and inspection of source timestamps. Replay applies a documented read-only VOL-01 research rule (20 prior observed trades minimum; trade-size ratio >3 = medium, >=6 = high). It does not certify equivalence with every live UI detector or the accuracy of real market surveillance outcomes.

API routes:
- GET /api/market-capture/catalog — enablement and connection status without keys.
- GET /api/market-capture/sessions — bounded session summaries, integrity statuses.
- GET /api/market-capture/session?id=cap-UUID — verify entire journal and return digest.
- GET /api/market-capture/replay?id=cap-UUID&offset=0&limit=100 — deterministic paged results.
- POST /api/market-capture/start and /stop — local loopback only; empty JSON object and X-TradeScope-Local-Capture: 1 intent header.

Validation from apps/tradescope: npm test, npm run build:static, npm start. Capture a permitted IEX session, stop the recording, reopen, verify the digest and replay. Disconnect the browser while recording to test process ownership.

## v0.31 — TS-MDI-706 local Docker packaging

The root compose.tradescope.yml builds apps/tradescope/Dockerfile and runs one Node workstation. Credentials are excluded from image build by .dockerignore and can enter at runtime only through the optional local env_file. Container runs nonroot, drops Linux capabilities, uses a read-only filesystem, mounts a persistent .local-data volume and restricts the published host port to 127.0.0.1:8000. The healthcheck verifies /api/health.

From repository root (Docker Compose 2.24+):

    docker compose -f compose.tradescope.yml config --quiet
    docker compose -f compose.tradescope.yml up --build -d tradescope
    docker compose -f compose.tradescope.yml ps
    docker compose -f compose.tradescope.yml logs --tail=100 tradescope
    docker compose -f compose.tradescope.yml down

Normal down preserves named volumes; never run down -v when you need retained data. Stop npm start before Docker if both would bind port 8000.

Docker bridge networking requires binding Node to 0.0.0.0 *inside* the container. The compose service therefore FORCES market capture disabled to preserve its loopback-only write protection. Run the v0.30 recorder under a direct local Node process with HOST=127.0.0.1 instead. Existing PostgreSQL/Redis services remain in docker-compose.yml and are not silently started with this standalone Compose file. Java and Python apps are separate; this is not full-stack Docker orchestration.

## Remaining validation / next milestones

- User must confirm Alpaca stream entitlements, storage duration, market-data license and permitted usage.
- Real browser tests, true live IEX session and provider disconnect simulation must be accepted.
- Live monitor and replay should eventually use exactly the same versioned shared detector. The current read-only replay implements VOL-01 semantics and is deterministic over captured observations.
- Persistent store is single-writer and not a transaction-safe multi-user event database. Missing provider sequence numbers do not prove continuous coverage.
- Run Docker Desktop on Windows and exercise restart, persistent volume, health failure, service network and recovery. Repository CI checks code/packaging, not production readiness.
