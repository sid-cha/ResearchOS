# ResearchOS v0.15 — Point-in-Time Macro Intelligence (initial implementation)

Status: **historical ALFRED series snapshot and deterministic research candidate rules implemented**. This release is NOT a verified financial-crisis early-warning backtest, probabilistic prediction engine, or proof of historical publication-time tradability.

## API and UI

- `GET /api/macro/catalog`: indicator metadata, credential readiness and as-of semantics.
- `GET /api/macro/snapshot?asOf=2007-08-01`: three source-vintage values and rule states. No user-supplied arbitrary series or upstream URL.
- Research → Crisis & Climate → select **2008 Financial Crisis** or **2020 COVID** → choose as-of date → **Reconstruct indicators**.
- `FRED_API_KEY` is optional, server-only. When absent, snapshot requests return 503; no invented demo metrics.
- `macro-vintage.test.mjs`: mocked ALFRED responses, date enforcement, missingness, strict parsing, cache isolation and read-only routes.

## Data specification

The provider is the FRED REST `fred/series/observations` endpoint with both `realtime_start` and `realtime_end` set to the requested as-of date; observation range is a bounded preceding 120 calendar days. All values are validated for observation date, vintage validity, missingness, staleness and finite numeric shape.

| ID | Official series | Rule (exploratory only) | Max data age |
| --- | --- | --- | --- |
| `yield_curve_10y_3m` | `T10Y3M` | 10Y minus 3M Treasury spread <= 0 percentage points | 10 days |
| `high_yield_oas` | `BAMLH0A0HYM2` | High-yield OAS >= 6 percentage points | 10 days |
| `financial_conditions_nfci` | `NFCI` | National Financial Conditions Index > 0 | 21 days |

Rule thresholds are **research placeholders**, not learned, optimized, economically validated, historically calibrated or production alerts. `candidate_triggered` describes the value relative to this static rule, not an estimated crash probability.

## Information-time caveats and limitations

- A request for 2007-08-01 represents the **end of that calendar day**. ALFRED real-time dates do not alone establish the time a release reached every market participant. Avoid intraday and same-day tradability claims.
- ALFRED real-time series availability must be checked for each date. Indicators introduced or first published later may be unavailable in older vintages. A current published series title is not proof that it existed on the historical decision date.
- Data from series vintages may be retroactively revised. The adapter **never falls back to today's values** and never interpolates missing observations.
- When one or more series fail source/date/schema checks, each is marked **unavailable**, not zero or false. The run remains partial; clients must inspect `availableRules` and individual provenance.
- The currently returned latest observation per series is appropriate for **snapshot research**, not for econometrically valid trend/velocity rules.
- No equity outcome, recession classification, false-positive rate, lead-time measurement, precision/recall, or walk-forward result has been computed.
- The three series can have different release schedules and histories, and there may be licensing/distribution restrictions before operating this commercially.

## Next development gates

1. Validate historical 2007/2020 series against real ALFRED responses with a server-side FRED key; independently verify first-series release and publication timing.
2. Persist immutably versioned, source-observed and ingestion timestamps (including original source-published time where available) before constructing a daily historical panel.
3. Build bounded walk-forward backtest with preset crisis milestones, negative controls, clear observation-window and overlap rules, and robust missingness/coverage diagnostics.
4. Add climate/NOAA issued outlook vintages and regional exposure graph, keeping reanalysis separate from contemporaneously known forecasts.
5. Keep v0.14 PR #15 unmerged until requested real browser, Alpaca entitlement, and source checks are complete.

Official methodology:
- https://fred.stlouisfed.org/docs/api/fred/realtime_period.html
- https://fred.stlouisfed.org/docs/api/fred/series_observations.html
- https://fred.stlouisfed.org/docs/api/api_key.html
