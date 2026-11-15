# ResearchOS v0.16 — Historical Warning Replay and Forward Market Outcome Study

**Status:** Implementation in draft; validation through GitHub Actions and live-source checks is required. This is NOT a production crash-prediction model, probabilistic model, proven tradeable strategy or claim of 2008 predictive accuracy.

## Capabilities

- `GET /api/backtest/catalog`: presets, research limits, data-source readiness and model limitations.
- `GET /api/backtest/replay?case=financial-2008`: reconstruct historic macro indicator values at 7 sampled decision dates from June to August 2007. Historical 2008 SPY returns are **unavailable** in the existing provider-supported market history and therefore never fabricated.
- `GET /api/backtest/replay?case=covid-2020`: 2020 retrospective historical macro replay and source-permitting SPY daily market-outcome checks.
- `GET /api/backtest/replay?case=control-2017`: comparison period with the same signal and outcome rules. This is not an exhaustive negative-control cohort.
- `start`, `end`, `cadence=7|14|28`, `horizon=5|20|63`, `threshold=5|10|20`: bounded, validated research parameters. Start/end must lie within the registered case's research window; no arbitrary series or ticker access is exposed.
- Research → Crisis & Climate: independent replay controls for 2008 and 2020, macro coverage counters, forward-return timeline, missing-label status and methodology details.

## Candidate-warning definition

A **candidate macro warning** requires *at least two of three indicators to be usable and at least two threshold rules triggered*, based on **each decision date's own ALFRED real-time vintage**. Fewer than two usable series means `insufficient_data`, not a negative forecast.

Rules from v0.15: `T10Y3M <= 0`, `BAMLH0A0HYM2 >= 6`, `NFCI > 0`. These thresholds are predeclared exploratory rules and have no measured validity or calibration.

Each replay selects up to 17 decision dates at a fixed calendar-day cadence; the source adapter makes up to 3 historical ALFRED requests per decision. The v0.15 adapter caches vintage requests, and the v0.16 replay caches bounded study responses.

## Forward labels and chronological integrity

- For any decision date, use the next observed SPY IEX session's close as a **research-only entry reference**. Do not use a same-date close as an entry or infer that end-of-day data was tradable at the original session close.
- Evaluate the lowest future closing return versus entry over exactly 5, 20, or 63 *subsequent completed sessions*. A threshold breach is a **forward drawdown label**, not a verified crash occurrence or a fitted probability.
- Require a complete horizon; otherwise `market.status=unavailable`. A partial market history, duplicated bar date or long unexplained data gap is rejected.
- Backtest interpretation is subject to **survivorship bias, corporate actions, dividends, historical index membership, licensing, IEX coverage, non-executable close prices and trading friction**. The provider is single-venue Alpaca IEX, not a total-return consolidated benchmark.
- Windows that would overlap already counted forward outcome windows are excluded from **descriptive confusion counts**. This is a simple non-overlap subsampling design, not purged cross-validation. If fewer than 10 independent labelled samples exist, precision/recall/false-alarm rates are withheld.
- No training, calibration, out-of-time holdout or walk-forward retraining is performed; sample sizes and missingness are reported separately.
- `2008`: Alpaca market adapter restricts history to 2016 onward. Show macro candidates only; **no 2008 SPY outcomes or false-alarm rates**.
- `2020`: actual live ALFRED and Alpaca credentials must be checked to claim sourced results. Mocked tests are only code-validation fixtures.
- ALFRED vintage **calendar-day** constraints do not establish original intraday publication time or same-day information dissemination. True time-of-publication evidence still needs its own archival source.

## Live verification gates

1. Obtain optional server-side `FRED_API_KEY` and existing Alpaca credentials; never expose them to browsers or static build.
2. Run both 2007 and 2020 presets. Compare ALFRED observations against official historical vintage views, particularly first release dates for each indicator.
3. Verify SPY historical market coverage and IEX pricing against a second licensed data source.
4. Browser acceptance for rendering, invalid inputs, upstream errors and responsive layout.
5. For genuine 2008 market outcomes, integrate a licensed long-horizon benchmark source; then build a broader sampling panel with explicit missing-date and vintage coverage.
6. Establish a statistically defensible historical study with pre-registration, negative controls, genuinely independent holdout periods, comparison baselines and realistic transaction costs before any performance claim.

**Related:** `docs/V014_CRISIS_CLIMATE_EARLY_WARNING_RESEARCH.md`, `docs/V015_POINT_IN_TIME_MACRO_INTELLIGENCE.md`.
