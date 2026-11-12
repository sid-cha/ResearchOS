# ResearchOS / TradeScope — Engineering delivery and sprint register

## Product objective
One evidence-first interface combining market-event ingestion, external world events, issuer financial performance and measured market responses. Keep human review and explicit limits; do not generate causal conclusions without validated support.

| Sprint | Ticket | Implementation | Acceptance evidence |
|---|---|---|---|
| 1 | TS-EV-101 | Alpaca News historical list with symbol matching | Sourced report URLs and publish times; 503 without credentials |
| 1 | TS-EV-102 | SEC submissions/10-Q/10-K/8-K records | Filings with accession URL and period end |
| 1 | TS-EV-103 | SEC companyfacts quarterly and annual metrics | Quarter-duration extraction, prior-year comparison, missing-data coverage |
| 2 | TS-EV-201 | USGS normalized earthquake feed | Magnitude/time/geolocation; no automatic ticker linkage |
| 2 | TS-EV-202 | NASA EONET event feed | Source/geometry/time; unknown fields remain null |
| 2 | TS-EV-203 | GDELT report search | Fixed topic categories; media evidence not verified event |
| 3 | TS-EV-301 | Technicals and price-data adapter | SMA/RSI/MACD/ATR from historical bars |
| 3 | TS-EV-302 | Event-study engine | Stock vs SPY 1/3/5 completed sessions, no look-ahead |
| 3 | TS-EV-303 | Forecast baseline | EWMA volatility, walk-forward absolute error, not directional advice |
| 3 | TS-EV-304 | Integrated terminal workspace | Event selection, explanation, financial summary, source links, analyst filters |

| 4 | TS-CAS-401 | Local-first case record and atomic JSON storage | Persist/reopen and JSON export after restart |
| 4 | TS-CAS-402 | Timeline and evidence inventory | Original source timestamp plus auditable case actions and attached evidence URLs |
| 4 | TS-CAS-403 | Analyst workflow | Priority, conclusion, status, assignee, assessment, notes, optimistic revision checks |
| 4 | TS-CAS-404 | Trade- and event-to-investigation linkage | Launch case from source event or selected market transaction; synthetic origin clearly labeled |
| 4 | TS-CAS-405 | Regression and HTTP integration tests | Complete create/review/note/evidence/reopen/export test with no external keys |

## v0.7 — Market Data Integrity increment

The November 12, 2026 owner-supplied startup brief and reconstructed conversation history select this increment before Java integration, market heatmaps or screeners. The inspected baseline is v0.6 at `830fe813a715f4e1bcf47b54a4e72191fb5dbabf`, with 22 existing tests passing before implementation. Source and executed checks, rather than reconstructed conversation claims, establish delivered behavior. See [V07_MARKET_DATA_INTEGRITY.md](V07_MARKET_DATA_INTEGRITY.md) for the acceptance criteria, event contract, lifecycle and Windows verification procedure.

| Ticket | Increment scope | Required verification |
|---|---|---|
| TS-MDI-701 | Native server-side Alpaca IEX WebSocket with fixed pilot-symbol subscriptions | Mock authentication, complete subscription acknowledgement, provider errors, timeout, bounded reconnect/backoff and shutdown. |
| TS-MDI-702 | Versioned provider-independent trade/quote/bar observations and bounded deduplication | Valid/malformed records, missing optional fields, source IDs, sub-millisecond event time, distinct same-time records and duplicate suppression. |
| TS-MDI-703 | Shared same-origin SSE delivery with lifecycle and resource limits | Named event framing, health heartbeat, client disconnect/slow client cleanup, shared upstream and secret isolation. |
| TS-MDI-704 | Streaming/polling provenance and compact feed health | LIVE fallback, timestamps, wall-clock age, counts/retries, continuity limits, dark/light readability and DEMO/LIVE/HISTORY isolation. |
| TS-MDI-705 | Preserve existing workflows, API contracts and static packaging | Existing regression suite, static public-file allowlist, mode/manual checks and explicit live-verification limitations. |

This is a local review increment. Provider tests use mock connections; authenticated Alpaca streaming and real historical requests require the owner's local credentials and remain a separate verification. No raw-tick archive, durable event replay, full-market coverage, deployment, merge or paid infrastructure is included.

## Architecture

- Existing v0.3 read-only Node server retained for fast local portfolio demonstration. This is a standalone subapp under ResearchOS, not a replacement of the existing Java and Python services.
- New modules: `lib/sources.mjs` (fixed host provider adapters and caches), `lib/fundamentals.mjs` (SEC calculations), `lib/analysis.mjs` (pure normalization and market analytics), `lib/api.mjs` (local bounded API), `event-workspace.js` and `intelligence.css`.
- Case storage: `lib/cases.mjs` and `lib/case-api.mjs`, with UI `case-workspace.js` + `cases.css`, stored only in `.local-data/cases.json`. The snapshot is bounded and preserves source labels; individual report values remain identified as captured, not predictive.
- v0.7 separates the canonical observation contract, server-owned connector, browser transport and presentation while retaining the Node local application and REST fallback. It introduces no durable tick storage.
- Proposed future migration: reuse the canonical contract with Java 21 Spring Boot and PostgreSQL domain APIs, then add versioned rules, validated analytics, licensed subscriptions and production authentication as needed. Durable archives and Kafka/Kinesis/MSK are conditional future choices, not required infrastructure for the current pilot.

## Open work that must NOT be presented as complete

1. Streaming news and validated market/event correlation. v0.7's IEX connector is a single-venue observation transport, not a complete market tape, causal-correlation engine or live-provider certification.
2. Machine-learned event-to-market prediction with validation against held-out historical event labels. Only an EWMA volatility baseline is implemented.
3. Authoritative entity-to-facility exposure graph. Natural hazards and geopolitical articles have no inferred stock association.
4. Full provider licensing, institution-level compliance and evidence-based causal attribution.
5. Production Vercel live-data deployment and server-side persistent case database; this branch is prepared for review and is not merged into the live site.
6. Multi-user authentication, role-based review permissions, and durable transactional PostgreSQL storage.

## Test procedure

`cd apps/tradescope && npm test`, then `npm run build:static`. Existing tests cover market data read-only routes, source timestamp and URL normalization, SEC quarter extraction and YoY, indicators, walk-forward forecast, market study completed bars and absence of future leakage, restricted endpoints, protected credentials, v0.5 case lifecycle/persistence, write conflict checks and source provenance. The v0.7 acceptance scope adds mocked canonical-event, provider-lifecycle, SSE and browser-mode/fallback checks; record actual final outcomes with the review commit rather than inferring them from this scope table.

## Proposed later priorities

v0.8: Java/PostgreSQL integration and common instruments. v0.9: macro briefing/calendar and scoped Market Atlas. v1.0: earnings and financial metrics. v1.1: event/thematic investigation. v1.2+: reusable screeners, ownership and licensed derivatives. These remain proposed and may be reprioritized after v0.7 review; no later item is delivered by the current increment.
