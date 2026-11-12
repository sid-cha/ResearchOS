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
- Research Intelligence Foundation adds `lib/research-catalog.mjs`, `research-technical.mjs`, `research-fundamentals.mjs`, `research-rules.mjs`, `research-store.mjs`, `research-api.mjs`, `filing-intelligence.mjs` and `event-analogues.mjs`, with `research-workspace.js` / `research.css`. It exposes local instrument/dated-observation/rule contracts without completing a Java migration.
- Screens/alerts persist in bounded `.local-data/research.json` through atomic single-process JSON writes. Cases remain separate in `.local-data/cases.json`. This is not background monitoring, PostgreSQL, a multi-user transaction boundary or a historical raw-source archive.
- Pending migration: reuse the canonical/research contracts with Java 21 Spring Boot and PostgreSQL domain APIs, then add production authentication and broader licensed subscriptions as needed. Durable archives and Kafka/Kinesis/MSK remain conditional choices, not required infrastructure for this pilot.

## Research Intelligence Foundation — current branch increment

The owner's request to inspect and finish pending work brings a bounded research slice forward from the broader roadmap. The implementation is on `feature/tradescope-research-intelligence`; v0.8 research foundation is a scope label, not a claim that the originally proposed Java/PostgreSQL integration is complete. See [RESEARCH_INTELLIGENCE_FOUNDATION.md](RESEARCH_INTELLIGENCE_FOUNDATION.md) for architecture, methods, APIs, Windows setup and verification.

| Package | Delivery status | Implemented evidence / remaining scope |
|---|---|---|
| RI-101 | Limited foundation | Ten pilot instruments with local keys; dated metric observations and `/api/research` boundary. Authoritative common security master and Java/PostgreSQL integration pending. |
| RI-102 / RI-105 | Built pilot | Company workspace and shared catalog of 65 definitions: 33 technical/price and 32 financial. Source, period, method and availability shown; count includes unsupported definitions. |
| RI-103 | Built pilot | Longer bounded/paginated IEX daily history, declared adjustments and completed-prior-session metrics. Missing history and rejected records disclosed; full exchange calendar not implemented. |
| RI-104 | Built pilot | Compatible SEC quarter/TTM/cash-flow/balance-sheet/ROE and supported trailing valuations. Forward P/E, PEG and EV/EBITDA explicitly unsupported; broader factors and custom tags pending. |
| RI-106 | Limited workflow | Nine built-in conditions, manual evaluation, freshness/readiness, deduplicated/cooldown alerts and acknowledge/resolve/investigate actions. Scheduled scans, notifications and additional live alert families pending. |
| RI-107 | Built pilot | Shared safe ALL/ANY condition engine, three presets, custom screen storage and manual scans of selected pilot symbols. Broader universe/database service pending. |
| RI-108 | Limited evidence reader | Official selected primary filing, supported headings, extractive source-linked passages/summaries and bounded parsing. Exhibit/transcript archive and comprehensive earnings classification pending. |
| HA-201 / HA-204 | Limited retrospective MVP | Official recent earthquakes, prior 30-year bounded candidates, magnitude/depth/distance ranking, aftershock grouping and up to five matches. Latest catalog revisions do not establish original alert knowledge. |
| HA-203 / HA-205 | Limited retrospective MVP | Selected-security vs SPY 1/5/20-session completed outcomes with pre-event reference and investigation evidence capture. Broader outcome series/verified impact channels pending. |
| HA-202 / Increment 3 | Pending | No verified company/facility exposure graph and no calibrated event-impact forecast. Similarity is a physical comparison, not a forecast probability. |

The expanded **SIGNALS** navigation opens the research workbench. The MONITOR card remains the separate observed-trade-size VOL-01 pilot. Research condition runs are explicit user actions, not always-on monitoring. Missing provider credentials, incomplete financial tags or unavailable historical outcomes remain explicit results; no generated values are substituted under real-data labels.

## Open work that must NOT be presented as complete

1. Streaming news and validated market/event correlation. v0.7's IEX connector is a single-venue observation transport, not a complete market tape, causal-correlation engine or live-provider certification.
2. Machine-learned event-to-market prediction with held-out historical evaluation and calibration. The EWMA volatility baseline and retrospective analogue/outcome comparisons are not such a predictor.
3. Authoritative entity-to-facility exposure graph. Natural hazards and geopolitical articles have no inferred stock association.
4. Full provider licensing, institution-level compliance and evidence-based causal attribution.
5. Production Vercel live-data deployment and server-side persistent case database; this branch is prepared for review and is not merged into the live site.
6. Multi-user authentication, role-based review permissions, and durable transactional PostgreSQL storage.
7. Complete SignalDock-style macro releases/briefings with vintages and consensus, earnings/guidance history, Form 4/13F ownership, licensed options/CFTC positioning and cross-asset data.
8. Market Atlas, authoritative sectors/peers/constituents, broad-market screen coverage, scheduled alert monitoring and external notification delivery.
9. Historical first-alert revision archive, tsunami-warning adapter, verified economic/political/social impacts and reproducible global exposure/outcome cohorts.

## Test procedure

`cd apps/tradescope && npm test`, then `npm run build:static`. Existing checks cover source normalization, SEC calculations, indicators, the volatility baseline, event studies, local cases, protected credentials, canonical observations, mocked provider lifecycle, SSE and mode separation. Foundation checks add metric readiness/completed bars, financial alignment, safe rule logic, persistence/revisions, source-constrained filing extraction, retrospective analogue cohort exclusions and outcome alignment. Record actual final results with the integrating change; fixture/mock tests do not certify authenticated live providers.

For Windows updates, preserve `apps/tradescope/.env` and `.local-data` before replacing an extracted ZIP. A ZIP is not a Git checkout; use a correct-branch ZIP or clone a repository before running `git fetch` / `git switch`. The detailed walkthrough is in the foundation guide. Do not commit or publish secrets/private JSON data.

## Proposed later priorities

The earlier version proposal placed Java/PostgreSQL before macro/Market Atlas, earnings/financial metrics, event investigation and broad screening/ownership/derivatives. The current research foundation brings a bounded metric/rule/screener/filing/earthquake slice forward. Remaining priorities are full common-instrument/Java integration; macro/calendar/Market Atlas; earnings/consensus and broader metrics; verified exposure/history; then evaluated forecasts and broader ownership/derivatives as suitable data becomes available. Version assignments remain proposals and are not completion evidence.

The expanded November 12 requirements and official-platform comparison are mapped in [NEXT_RESEARCH_INTELLIGENCE.md](NEXT_RESEARCH_INTELLIGENCE.md) and [PLATFORM_RESEARCH_2026-11-12.md](PLATFORM_RESEARCH_2026-11-12.md). The delivered subset and missing larger requirements are kept separate in [FEATURE_STATUS.md](FEATURE_STATUS.md). The referenced consolidated roadmap DOCX was not supplied; it is not represented as reviewed.
