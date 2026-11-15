# v0.7 verification and review handoff

Verified November 12, 2026 in Linux, starting from `feature/tradescope-ai-showcase` at `830fe813a715f4e1bcf47b54a4e72191fb5dbabf`. The initial working tree was clean and the existing 22 tests passed. Requirements came from the owner-supplied startup brief, engineering handoff and reconstructed history; repository code determined the implemented baseline. See [requirements and manual verification](V07_MARKET_DATA_INTEGRITY.md).

## Automated results

| Check | Actual result |
|---|---|
| Full Node test suite, Node 24.22.1 | 92 passed, 0 failed, 0 skipped |
| Full Node test suite, Node 22.16.0 | 92 passed, 0 failed, 0 skipped |
| `npm run build:static` | Passed; exactly 12 allowlisted public assets |
| `git diff --check` | Passed |
| Chromium browser smoke checks | Twenty-one scenarios passed; no page JavaScript errors |

The suite includes all pre-existing case/assistant/intelligence/security tests plus canonical trade/quote/bar validation, exact large trade IDs, nanosecond timestamps, malformed payloads, bounded deduplication, out-of-order observations, authentication/subscription failures, retry/timeout/shutdown lifecycle, SSE framing and client cleanup, slow clients, source labels, mode cancellation, snapshot/stream overlap and selected-case provenance.

A local RFC6455 provider fixture also exercised the **native Node WebSocket client -> authenticated subscription -> canonical normalization -> real HTTP SSE** path. It verified reconnect/resubscribe and duplicate suppression across reconnects. It did not connect to Alpaca.

## Browser evidence

Headless Chromium loaded the actual local HTML/CSS/scripts with the existing Content Security Policy. Controlled mock provider connections and one mocked historical API response supplied data for these flows:

1. DEMO replay advances and pauses.
2. Theme and density controls work; feed-health/provenance layout was inspected in both themes.
3. Missing credentials show unavailable/fallback failure and never populate LIVE with synthetic rows.
4. A mock provider produces canonical events, real SSE delivery and browser blotter/provenance updates.
5. A streaming observation becomes a saved investigation with whitelisted source lineage, an analyst note and a deterministic assistant briefing.
6. A provider disconnect switches to explicit fallback; restore/reconnect/resubscribe returns to streaming.
7. A mocked historical SIP response shows historical source labels and preserves the original nanosecond event time.
8. Returning to DEMO selects an already visible synthetic event; independent Event Intelligence can create a synthetic investigation.
9. Leaving LIVE stops the last subscriber's upstream connector; health responses contain no mock credentials.
10. SIGNALS explicitly exposes its flagged filter; returning to MONITOR restores unflagged observations.
11. Loading real technical bars preserves synthetic event examples with independent source labels.
12. Partial SEC failure details remain visible alongside successfully fetched fundamentals.
13. Changing security clears the previous issuer's financial/technical context.
14. Selecting a sourced event and requesting a mocked benchmark-relative study renders observed and pending horizons.
15. An empty real event source shows an explicit count and loading/demo instructions without inventing events.
16. Blocking browser SSE still permits explicitly labeled successful snapshot fallback using controlled data.
17. Warm-up metrics show NOT ASSESSED and cannot become flags or dilute assessed averages.
18. A selected old trade shows its own age even when another quote makes the global feed appear fresh.
19. Snapshot fetch time is labeled separately from the original event time and measured network latency.
20. Disabled/uncomputed price and size comparisons show unavailable values rather than fabricated zeros; source event IDs replace internal identities in the inspector.
21. Navigating through SIGNALS preserves zero true flags and restores loaded observations on MONITOR.

Browser checks found and prompted fixes for poll/stream overlap, missing polling/history case instrument identifiers, and DEMO selection outside the revealed replay window. Regression tests cover these cases. Exchange/ingestion times now update from received browser observations between health heartbeats; backend counters remain the latest backend report.

The owner's empty-tab report also prompted fixes for an inherited flagged-only navigation filter, misleading LIVE replay text, technical requests erasing event examples, prior-company research remaining after a security change, and overwritten partial-provider errors. Thirteen additional automated regressions cover these navigation/source-state cases, including cancellation of old requests and rejecting studies for a previously selected event. See [feature status](FEATURE_STATUS.md) for implemented versus proposed tools and prediction limits.

The expanded research discussion prompted sixteen further automated regressions for unassessed versus genuine-zero measurements, selected-observation age, public source identifiers, fiscal-period/unit-compatible margins, revenue-tag changes and strict noncoercing OHLCV validation. Indicator methods and input-quality counts are additive API metadata; valid-input RSI/ATR formulas were not changed. Proposed metrics/alerts/analogue features remain in [the next-increment specification](NEXT_RESEARCH_INTELLIGENCE.md), with [official platform references](PLATFORM_RESEARCH_2026-11-12.md); the proposal is not an implementation claim.

## Changed files

| Area | Created or modified files relative to `apps/tradescope` |
|---|---|
| Canonical model and provider | `lib/market-events.mjs`, `lib/alpaca-stream.mjs` |
| Delivery and existing REST fallback | `lib/market-sse.mjs`, `server.mjs` |
| Browser and source display | `live-adapter.js`, `app.js`, `index.html`, `terminal-theme.css` |
| Event Intelligence source-state fixes | `event-workspace.js` |
| Calculation integrity | `lib/analysis.mjs`, `lib/fundamentals.mjs` |
| Selected investigation lineage | `case-workspace.js`, `lib/cases.mjs` |
| New regression tests | `tests/market-events.test.mjs`, `tests/alpaca-stream.test.mjs`, `tests/market-sse.test.mjs`, `tests/market-flow.test.mjs`, `tests/market-security.test.mjs`, `tests/live-adapter.test.mjs`, `tests/market-case.test.mjs`, `tests/event-workspace.test.mjs`, `tests/fundamentals-integrity.test.mjs`, `tests/technical-integrity.test.mjs` |
| Existing test additions | `tests/server.test.mjs` |
| Version and documentation | `package.json`, `README.md`, `docs/SPRINTS.md`, `docs/V07_MARKET_DATA_INTEGRITY.md`, `docs/FEATURE_STATUS.md`, `docs/NEXT_RESEARCH_INTELLIGENCE.md`, `docs/PLATFORM_RESEARCH_2026-11-12.md`, this report |

## Remaining verification and boundaries

- **No Alpaca credentials were available here.** Real authentication, provider entitlement, live market observations and actual historical data remain unverified. The owner's existing local `.env` was neither retrieved nor changed.
- Windows commands are documented, but the runtime checks above ran on Linux. Run the supplied PowerShell procedure locally on Node 22.16+.
- IEX is one venue and ten supported symbols, not a consolidated market tape. Wall-clock age is separate from connectivity; there is no authoritative holiday/early-close calendar or inferred outage from quiet trading alone.
- No durable tick archive or server replay was added. SSE interruptions have unknown gaps, and browser reconnects cannot recover missed ticks. Deduplication covers a bounded recent window rather than all historical identities.
- Bars are normalized and counted without being rendered as individual trades. Missing event times stay unknown; receipt/ingestion may order display without becoming an exchange timestamp.
- The existing server remains a local single-user application. This increment adds no production deployment, multi-user authentication, trading execution, cloud resources or redistribution entitlement.

Next incremental task: run authenticated local IEX streaming/fallback and Windows verification, record observed entitlements and session behavior, then review v0.7 before beginning the proposed Java/PostgreSQL integration.
