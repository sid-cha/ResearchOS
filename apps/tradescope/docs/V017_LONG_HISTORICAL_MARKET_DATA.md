# ResearchOS v0.17 — Long-History Market Outcomes for 2008 Research

Status: **optional provider adapter, historical-study integration, and offline regression fixtures**. Not live-provider verified, not a full equity price-vintage reconstruction, and not licensed for unreviewed public redistribution.

## Scope
- Existing v0.16 historical macro case replay unchanged for indicator thresholds and ALFRED calendar-day vintage semantics.
- Optional, explicitly enabled server-side **EODHD daily historical SPY.US** retrieval for windows before the 2016 start of the existing Alpaca adapter.
- 2007/2008 crisis studies can now compute a **real-data-based outcome study if and only if** licensed EODHD historical coverage is successfully retrieved.
- 2016 onward continues using the existing Alpaca IEX research bar source.
- No raw EODHD daily history API endpoint or browser token.
- Strict maximum 825-day calendar request, fixed SPY.US symbol and fixed HTTPS provider origin, max 650 rows, bounded response size, duplicate/invalid-date and long-gap rejection, in-memory response cache.
- All provider failures report explicit unavailable status. No substitute prices and no interpolation.

## Optional setup
```env
FRED_API_KEY=<server-only-ALFRED-key>
EODHD_API_TOKEN=<server-only-entitled-EODHD-key>
EODHD_INTERNAL_RESEARCH_ENABLED=true
```
Do not commit actual tokens. Free EODHD keys may not cover 2008. Confirm provider terms, subscription permissions, retention requirements and redistribution rights before production use.

## Source semantics
- Provider: EODHD `GET https://eodhd.com/api/eod/SPY.US` with `from`, `to`, `period=d`, `fmt=json`, and `api_token` supplied server-side.
- Outcome price: `adjusted_close` field (split-and-dividend adjusted, **currently revised**); raw close is not silently substituted.
- The *macro signals* remain sourced only from ALFRED as-of snapshots. Adjusted SPY prices are only future realized **labels**, never contemporaneous warning features.
- This source differs from single-venue Alpaca IEX split-adjusted price basis. Cross-source comparisons are not an apples-to-apples total-return backtest.
- Backtest definition from v0.16 remains **next available close** as an entry reference followed by 5/20/63 complete future sessions; non-overlapping label windows only for descriptive counts. Does not reconstruct actual executed positions, market-open availability or point-in-time tradability.
- Historical bars have no original first-publication time. Future split/dividend adjustments are not contemporaneously known; they are deliberately used only for outcome labeling.

## API
Existing `GET /api/backtest/replay?case=financial-2008` returns optional 2008 labels when entitled data is present. The response includes:
- `coverage.benchmarkStatus` (e.g. `available_long_history_adjusted`, `unavailable_long_history_not_configured`, `unavailable_long_history_entitlement`)
- `sourceProvenance.market` = `EODHD_SPY_DIVIDEND_SPLIT_ADJUSTED_CURRENT_REVISION` only when sourced
- `benchmarkPriceBasis`
- `timeline[].market` summaries, not raw bars
- Explicit null/indeterminate metrics for missing coverage or inadequate independent samples.

## Validation still required
- Live EODHD 2007/2008 API entitlement, dates, data quality and response schema.
- Independently cross-check SPY adjusted and raw historical closes with another trusted licensed source, including dividends, splits, calendar and holiday conventions.
- Live ALFRED 2007 snapshots must be verified for actual original series coverage and original release timing.
- Browser/UI, security/authentication, benchmarks, full integration, CI and legal/redistribution checks before public release.

Reference: https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
