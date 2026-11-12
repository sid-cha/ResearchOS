# ResearchOS / TradeScope Sprints 1–4 — Engineering delivery record

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

## Architecture

- Existing v0.3 read-only Node server retained for fast local portfolio demonstration. This is a standalone subapp under ResearchOS, not a replacement of the existing Java and Python services.
- New modules: `lib/sources.mjs` (fixed host provider adapters and caches), `lib/fundamentals.mjs` (SEC calculations), `lib/analysis.mjs` (pure normalization and market analytics), `lib/api.mjs` (local bounded API), `event-workspace.js` and `intelligence.css`.
- Case storage: `lib/cases.mjs` and `lib/case-api.mjs`, with UI `case-workspace.js` + `cases.css`, stored only in `.local-data/cases.json`. The snapshot is bounded and preserves source labels; individual report values remain identified as captured, not predictive.
- Future migration path: implement canonical event envelope in Java 21 Spring Boot; add Kafka ingest workers, PostgreSQL event time, versioned rules, Python ML calibration, rate-limited licensed subscriptions, and production auth.

## Open work that must NOT be presented as complete

1. True streaming news and market microstructure correlation (current UI is request-driven; trades are polled snapshots or historical samples).
2. Machine-learned event-to-market prediction with validation against held-out historical event labels. Only an EWMA volatility baseline is implemented.
3. Authoritative entity-to-facility exposure graph. Natural hazards and geopolitical articles have no inferred stock association.
4. Full provider licensing, institution-level compliance and evidence-based causal attribution.
5. Production Vercel live-data deployment and server-side persistent case database; this branch is prepared for review and is not merged into the live site.
6. Multi-user authentication, role-based review permissions, and durable transactional PostgreSQL storage.

## Test procedure

`cd apps/tradescope && npm test`. Tests cover market data read-only routes, source timestamp and URL normalization, SEC quarter extraction and YoY, indicators, walk-forward forecast, market study completed bars and absence of future leakage, restricted endpoints, protected credentials, v0.5 case lifecycle/persistence, write conflict checks and source provenance.
