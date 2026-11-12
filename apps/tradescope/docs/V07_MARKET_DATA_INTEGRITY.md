# TradeScope AI v0.7 — Market Data Integrity

## Requirement provenance and scope

This increment continues the existing TradeScope application. It implements the market-data priority described in the November 12, 2026 startup brief, reconstructed conversation history, and engineering handoff supplied by the project owner. Those documents describe requirements and proposed direction; the repository and executed checks determine what is implemented. The companion roadmap DOCX was referenced in the history but was not supplied or required for this bounded increment.

The starting point is `feature/tradescope-ai-showcase` at `830fe813a715f4e1bcf47b54a4e72191fb5dbabf`, whose manifest identifies v0.6.0. The working tree was clean and all 22 existing Node tests passed before implementation. The review branch is `feature/tradescope-v07-market-data-integrity`, based on that feature branch rather than `main`.

Deliver a server-owned Alpaca IEX WebSocket adapter, provider-independent observations, browser delivery, and honest feed-health information. Preserve the existing REST snapshot and historical APIs, synthetic replay, Event Intelligence, Investigations, Evidence Assistant, themes, display density, and Windows local workflow.

This increment does not introduce trading execution, Java/PostgreSQL integration, Market Atlas, broad-market screening, paid infrastructure, deployment, or automatic merging. IEX remains a single-venue feed for the ten-symbol pilot, not a consolidated US tape.

## Acceptance criteria

| Requirement | Review evidence |
|---|---|
| Server-side authentication and subscriptions | A single local-server connector authenticates at the fixed `wss://stream.data.alpaca.markets/v2/iex` endpoint and verifies the requested trade/quote/bar subscriptions. Provider credentials never enter browser responses. |
| Provider-independent events | Validated trade, quote and bar envelopes preserve source identity, provider timestamps, receipt/ingestion times, optional fields, and explicit coverage. Malformed observations do not become fabricated market data. |
| Reconnection and deduplication | Bounded backoff with jitter, connection/handshake timeouts, safe provider-error handling, resubscription, bounded duplicate tracking, and clean shutdown are covered with mock sockets. |
| Browser delivery | Same-origin SSE shares the connector, emits named health/observation events, sends periodic health heartbeats, bounds client resources, and cleans up disconnected clients. |
| Availability and mode isolation | LIVE can use explicitly labeled REST snapshot fallback. DEMO and HISTORY cancel LIVE work; late asynchronous responses cannot populate another mode. Synthetic observations never appear under a live source label. |
| Feed-health display | Provider/feed/coverage, transport/connection, last exchange and ingestion times, wall-clock age, observation/duplicate counts, retry state, and continuity limitations are visible in both themes. |
| Existing workflow and security | Existing tests remain green, regression coverage includes modes and fallback, and the static build retains its public-asset allowlist without `.env` or backend code. |
| Review handoff | Tests and limitations are reported accurately, changes are committed on the review branch, and a draft PR targets `feature/tradescope-ai-showcase`. Live authentication remains a separate local verification when credentials are available. |

## Architecture and lifecycle

```text
Alpaca IEX WebSocket
  -> server-owned connector: authenticate / subscribe / validate / deduplicate
  -> canonical observations + safe feed health
  -> same-origin /api/stream (SSE)
  -> LIVE adapter: bounded observations / batched render / provenance

Existing /api/live snapshots -> explicitly labeled polling fallback
Existing /api/history       -> separate HISTORICAL mode
Synthetic fixtures         -> separate DEMO mode
```

The connector uses Node's native WebSocket client and the transport uses Node HTTP; no npm runtime dependencies are required. Browser tabs share one upstream connection within a local server process. The connector is started when an SSE client attaches and stopped when the last client leaves. Visiting `/api/health` alone does not authenticate to Alpaca. There is no subscription per browser tab and no external URL or arbitrary symbol subscription endpoint.

The browser uses `EventSource` in LIVE mode. Streaming becomes available only after authentication and subscription acknowledgement. While unavailable, connecting, or reconnecting, the existing approximately 15-second snapshot poll provides a visibly different fallback. A successful REST request does not imply a fresh trade or quote. Switching modes closes the SSE client, cancels polling and pending work, and resets the mode's displayed observations.

The SSE channel sends named `health` and `observation` events. Health heartbeats keep browser-to-server delivery separate from exchange-event activity. Slow/disconnected clients are bounded and released rather than allowed to accumulate an unbounded queue. The transport does not provide durable event storage, server-side tick replay, or `Last-Event-ID` recovery. Origin and Fetch Metadata checks reject cross-origin browser connections; an absent Origin is allowed for local CLI diagnostics. This local scope is not multi-user authentication.

### Resource and timing defaults

| Boundary | Default and behavior |
|---|---|
| Upstream connection | One connection per local server process while clients are attached. |
| Handshake stages | 10 seconds each for connection, authentication and subscription acknowledgement. |
| Reconnection | At most 6 retries; the first jittered delay is 0.5–1 second, the exponential base delay caps at 30 seconds, and jitter is 50–100% of that base. The retry budget resets only after a subscription remains stable for 60 seconds. Terminal authentication/entitlement errors remain explicit. |
| Upstream inactivity | After 120 seconds without a provider message, reconnect to revalidate transport. This is an inconclusive liveness check, not a claim that missing market activity proves an outage. |
| Duplicate identities | At most 10,000 recent identities, retained across reconnect and connector stop/start. They do not retain a raw-tick archive or provide permanent uniqueness. |
| Provider payload | At most 1 MiB per accepted text frame and 1,000 messages per parsed batch; malformed/oversized payloads are not forwarded as observations. |
| SSE clients | At most 8 simultaneous clients; excess requests receive a deliberate unavailable response. |
| Slow-client buffering | Disconnect a response before a write would exceed 65,536 queued bytes. There is no additional unbounded per-client event queue. |
| SSE health heartbeat | Every 15 seconds; comment heartbeat plus health snapshot. The EventSource retry hint is 5 seconds. |
| Browser liveness | A watchdog checks every 5 seconds and activates snapshot fallback after more than 45 seconds without delivery health. |
| REST fallback | Poll approximately every 15 seconds with a 14-second browser request-abort deadline. Pending mode work is invalidated and aborted on a mode change. |
| Browser display | At most 1,000 retained observations with bounded duplicate tracking; stream rendering is batched at no more than 4 updates per second. |

These are local pilot bounds rather than capacity or latency guarantees. A disconnect can lose observations; no replay is promised.

## Canonical observation contract

| Field | Meaning |
|---|---|
| `schemaVersion` | `1`; a versioned envelope independent of Alpaca's wire message. |
| `provider`, `feed`, `coverage`, `mode` | `alpaca`, `iex`, `single-venue`, `LIVE` for this adapter. Other provider/feed adapters may be added later with accurate licensing and coverage labels. |
| `instrumentId`, `symbol` | An application-local symbol identifier and the allowlisted provider symbol. This is not a permanent security master ID; corporate actions and symbol reuse require a later instrument service. |
| `eventType` | `trade`, `quote`, or `bar`. |
| `sourceEventId` | Provider identity where supplied; otherwise `null`. |
| `exchange` | Source venue where supplied; otherwise `null`. Feed coverage is not used to invent the missing venue. Quotes retain their bid/ask venues separately. |
| `exchangeEventTime` | Provider event timestamp normalized to UTC while retaining up to nine fractional digits; `null` when absent. A bar timestamp denotes the provider's bar interval, not an individual execution time. |
| `receivedAt`, `ingestedAt` | Local receipt and normalized-ingestion instants, separate from event time. |
| `trade` | `price`, `size`, `conditions`, `tape`; `null` for non-trade events. |
| `quote` | `bidPrice`, `askPrice`, `bidSize`, `askSize`, `bidExchange`, `askExchange`, `conditions`, `tape`; `null` for non-quote events. |
| `bar` | `open`, `high`, `low`, `close`, `volume`, `tradeCount`, `vwap`; `null` for non-bar events. |
| `quality` | `validation`, `missingFields`, `timestampStatus`, `gapStatus`, applicable `crossedQuote` and connector `outOfOrder` flags. It does not certify complete market coverage or uninterrupted delivery. |

Absent optional values remain `null`; missing values are not replaced with invented prices, sizes, venues or source identifiers. Invalid calendar dates, ambiguous/invalid offsets, unsafe identifiers, unsupported symbols and malformed payloads are rejected. Deduplication includes provider identity where available and enough timestamp/content dimensions to preserve distinct trades and quote changes sharing a timestamp. With neither source identity nor event time, equal observations cannot safely be declared duplicates. It is a bounded recent-observation filter, not a permanent global uniqueness index. Out-of-order delivery does not change the source timestamp into ingestion time.

The existing blotter displays timestamped trades and quotes. Canonical bars remain available through the backend stream and health counters without being presented as fabricated trades; observations lacking source event time are likewise not given an invented blotter time. Consequently the backend observation count can exceed the retained blotter-row count.

The versioned envelope and explicit timestamp meanings provide a foundation for later deterministic replay. This increment deliberately adds no licensed tick archive or durable replay service. Any future storage, capture, export or redistribution must match the relevant provider rights. An explicitly saved investigation retains only its whitelisted observation/provenance fields as case evidence; that manual workflow is separate from continuous tick recording.

## Health and freshness semantics

`GET /api/health` preserves the existing local-service/configuration fields and adds market-stream health under `marketData`. `GET /api/stream` delivers the same kind of health alongside observations. `/api/live` retains the snapshot response contract and adds `transport: "snapshot-polling"`, `provider`, `feed` and `coverage`. Connection states distinguish connecting, authentication, subscription, streaming, reconnecting, unavailable and stopped; the absence of credentials is an actionable unavailable state rather than a synthetic live feed.

The health component reports the last exchange observation separately from backend ingestion and browser delivery. Event age is elapsed wall time, not a market-session outage detector or an entitlement guarantee. A connected stream may legitimately be quiet overnight, on holidays, or for infrequently traded IEX symbols. This increment has no authoritative exchange holiday/early-close calendar, and does not label idle observations as proof of provider failure. A feed can be connected while its latest observation is old.

Reconnects and browser interruptions imply potential missed observations. Without provider sequence/continuity guarantees, gap size and a complete tape cannot be established; the UI must retain that limitation. No fabricated gap count, full-market status, or market-delay classification is inferred from a successful socket or HTTP request.

## Windows PowerShell verification

From an existing repository checkout, preserve any local changes before updating:

```powershell
git fetch origin
git switch feature/tradescope-v07-market-data-integrity
git pull --ff-only
cd apps/tradescope
node --version             # Node 22.16+; native WebSocket support required
npm.cmd test
npm.cmd run build:static

# Only if .env does not already exist:
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit local credentials privately if needed, then restart the server.
npm.cmd start
```

In another terminal:

```powershell
curl.exe -i http://127.0.0.1:8000/api/health
curl.exe -N http://127.0.0.1:8000/api/stream
```

1. Open `http://127.0.0.1:8000`. Confirm DEMO starts with synthetic labels and replay still runs. Check light/dark themes and both density settings.
2. Select LIVE. With authorized local Alpaca credentials, verify authentication/subscription progresses to streaming; the source remains Alpaca IEX/single venue. During a session with observations, verify trade/quote rows, exchange timestamps, backend ingestion timestamps and counters update.
3. Inspect browser Network responses for `/api/stream`, `/api/health` and `/api/live`. Credentials, auth messages and raw provider errors must not be present. Keep `.env` out of screenshots and exports.
4. Test fallback with absent/invalid credentials or an unavailable stream in a local test configuration. Verify explicit unavailable/reconnect and snapshot-polling labels. REST can also fail for missing credentials; that must be shown rather than filled with synthetic data. Restore credentials privately and restart afterwards.
5. Switch LIVE -> DEMO -> LIVE and LIVE -> HISTORY while requests are pending. Confirm there is one SSE request per LIVE tab, old requests cannot overwrite the current mode, and DEMO contains only synthetic observations.
6. In HISTORY, choose an authorized feed and a prior trading date, then load the capped trade sample. Verify historical feed labels, not streaming labels; no-data/entitlement failures must remain explicit. Return to DEMO and verify replay again.
7. Close the last LIVE tab or return all tabs to DEMO. Confirm SSE requests close and the server remains responsive. Mock transport tests cover bounded slow-client behavior without requiring a real market session.
8. Open Event Intelligence, create/reopen a synthetic investigation, add a note, and use the deterministic Evidence Assistant. These separate workspaces must continue to identify their own evidence sources.

Automated provider/transport tests use mocked sockets and data. This environment has no Alpaca credentials, so authenticated live streaming and a real historical-data request remain unverified until performed locally. Passing mocked tests does not establish provider entitlement, complete exchange coverage, or production readiness. Windows commands are supplied for the user's local verification; execution in the Linux development environment does not establish a Windows runtime test.

## Proposed roadmap after v0.7 review

| Version | Proposed direction |
|---|---|
| v0.8 | ResearchOS Java/Spring Boot integration, PostgreSQL domain persistence and shared instruments/research APIs. |
| v0.9 | Official macro release vintages/calendar, daily market briefing and the first accurately scoped Market Atlas views. |
| v1.0 | Earnings/corporate research, expanded SEC fundamentals and a versioned financial-metrics layer. |
| v1.1 | Point-in-time event comparisons, thematic/security exposure and investigation-linked overlays. |
| v1.2+ | Reusable stock/ETF screening, ownership disclosures, appropriately licensed options/volatility and broader geography. |

These are candidate priorities, not implemented capabilities or fixed release commitments. AWS, durable licensed archives and distributed streaming are future choices when workload and rights justify them; no Kafka/Kinesis/MSK platform is needed for this increment. Competitor material informs research workflows and usability, not permission to copy proprietary code or data.
