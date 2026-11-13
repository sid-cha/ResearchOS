# v0.8 Research Intelligence Foundation — verification

Executed November 12, 2026 on `feature/tradescope-research-intelligence`, based on v0.7 commit `26080ee59e5c77109be0764205eecf2e03b3e951`. See [feature inventory](FEATURE_STATUS.md) and [requirements mapping](NEXT_RESEARCH_INTELLIGENCE.md) for the delivered boundary and remaining work.

## Automated checks

- The complete **205-test** Node suite passes on Node **24.22.1** and the minimum supported **22.16.0**, with zero failures or skips. Execution used Linux; Windows setup instructions are documented but were not executed here.
- Static build produces exactly **14** allowlisted browser assets. Environment files, local stores and backend source are excluded; actual HTTP requests to private paths return 404.
- Syntax and whitespace checks pass. No runtime dependencies were added.

The suite covers completed-session calculations, strict data readiness, malformed/conflicting bars, fiscal alignment, revenue scope, conservative TTM/EPS arithmetic, valuation availability, stale report/price rejection, comparator and crossover provenance, missing-input logic, screen revisions, alert lifecycle/deduplication, store reopening and failed writes, fixed-host bounded sources, pagination, request validation and sanitization, filing extraction, earlier-only earthquake cohorts, aftershock grouping and event outcome alignment.

Integration tests exercise the real research HTTP API against controlled provider-shaped fixtures. Case creation/export retains bounded conditions and metrics while discarding opaque/raw inputs. The actual application server shares one case store with its assistant; tests first prime an empty assistant, then create and edit investigations and verify fresh assistant access.

## Browser verification

Headless Chromium through Python Playwright ran **eight new end-to-end scenario groups** with no page JavaScript errors:

1. Research navigation, company API, all 65 metric definitions, source/period/readiness and unavailable consensus.
2. Manual rule evaluation, saved alerts, acknowledgement and reload persistence.
3. Research condition to investigation, captured metric/condition evidence and deterministic assistant.
4. Preset copying, custom screen save, revisioned edit retaining one ID, ten-symbol scan, reload and delete.
5. Issuer-listed SEC document through the extractive parser to cited and safely rendered passages.
6. Earthquake feature explanations, historical comparison, 1/5/20-session outcome calculations and a saved historical investigation with the actual past occurrence time and unverified company exposure.
7. Both themes and an 800px research layout without horizontal page overflow.
8. The actual unconfigured server: explicit missing Alpaca/SEC inputs and no fabricated positive conditions.

The **21 existing v0.7 browser scenario groups** also pass for replay, streaming delivery, fallback/reconnect, historical mode, provenance, source errors, stale selections, case notes and assistant navigation. Surveillance flag shortcuts now use the Monitor's **VIEW ALL FLAGGED EVENTS** action; the primary **SIGNALS** navigation intentionally opens the new research rule workspace.

Provider-shaped market, SEC and earthquake fixtures establish application behavior, not authenticated provider success. Browser screenshots use controlled fixtures and are not evidence of current market prices or current disasters.

## Provider verification limits

No Alpaca credentials are configured in this execution environment. Real authenticated WebSocket subscriptions, IEX bars/trades/news and SIP entitlement must therefore be verified locally. Missing credentials are tested explicitly.

One bounded actual public USGS request was attempted. The adapter returned its static HTTP 502 failure and no event records. A historical analogue network lookup was consequently not attempted. Live USGS availability and parsing remain unverified here; fixture tests are a separate result. No new authenticated SEC filing/companyfacts network check was performed.

## Review fixes and delivery limits

Review corrected old financial facts appearing fresh merely because calculated today, incompatible fiscal comparisons, goods-only revenue leaking into company-total arithmetic, missing prior observations in screen crossovers, loss of condition/comparator evidence in cases, the separate assistant store cache and incorrect research navigation counts. Provider response sizes, pagination, queues, same-origin research writes and public error bodies are bounded.

The legacy Java API configuration now reads `FMP_API_KEY` from the environment rather than a tracked literal. Any previously exposed key requires provider-side rotation; removing a literal does not revoke it or erase Git history. This configuration fix does not complete Java/PostgreSQL integration, which was not executed or tested in this change.

This release remains a ten-symbol, single-user local research pilot. Background scans, notifications, broad instrument/sector/peer coverage, macro/earnings/ownership/options datasets, authoritative disaster exposures and calibrated impact forecasts are still pending. JSON persistence is not a multi-user database; physical earthquake similarity and retrospective returns do not establish causal exposure or future return probabilities.

## Local acceptance

Preserve `.env` and `.local-data` when updating an extracted ZIP. Start the local Node server and test **RESEARCH → LOAD COMPANY RESEARCH**, **SIGNALS → EVALUATE**, **SCREENER → SAVE / RUN**, **FILING READER** and **HISTORICAL ANALOGUES** with your authorized local providers. Check dates and unavailable-input reasons as well as positive results. A downloaded ZIP has no Git metadata and cannot run `git fetch` or `git switch`.
