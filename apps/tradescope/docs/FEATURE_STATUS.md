# TradeScope feature status and where to find it

This is an implementation inventory, not a claim that the full proposed ResearchOS roadmap has shipped. The latest development increment is on `feature/tradescope-v07-market-data-integrity`, reviewed in PR #3 against `feature/tradescope-ai-showcase`. The original feature branch still identifies v0.6 until reviewed changes are incorporated.

| Feature | Implemented scope | Where / requirements |
|---|---|---|
| Demo replay | Synthetic deterministic market events, charts and illustrative rule flags; replay, pause, reset and speed controls | MONITOR / REPLAY LAB -> DEMO REPLAY. No provider credentials needed. |
| Live snapshot polling | Latest available IEX trade/quote snapshots for ten symbols, about every 15 seconds; deduplicated samples, not all intervening trades | v0.6 LIVE IEX · POLLED; retained as v0.7 fallback. Local Alpaca keys required. |
| Live streaming | Server-owned authenticated Alpaca IEX WebSocket, canonical events, browser SSE, reconnect/dedupe and feed health | v0.7 review branch -> LIVE IEX · STREAM / FALLBACK. Mock/integration-tested; real provider authentication requires local verification. |
| Historical trades | Up to 1,000 newest requested-day trades for one allowed symbol; true IEX or eligible prior-day SIP source labels | HISTORICAL TRADES -> symbol, prior trading date, entitled feed -> LOAD REAL TRADES. This is a capped price/trade sample, not a historical event database. |
| Signal Monitor / SIGNALS | Experimental volume-size threshold using at least 20 earlier observed trades per symbol; triggers above 3x recent median. SIGNALS filters the blotter to flags. | MONITOR signal card / SIGNALS. Zero flags can mean insufficient baseline or no rule trigger. It does not establish low risk. Spread/cancellation/price-move detectors are disabled for real data. No buy/sell recommendation engine. |
| Company news | Timestamped Alpaca news with source URLs and provider-tagged symbols | EVENT INTELLIGENCE -> ALPACA NEWS; Alpaca credentials/entitlements. |
| Technical snapshot | SMA20/50, RSI14, MACD and signal, ATR14, relative volume, close/bar count | EVENT INTELLIGENCE -> select SECURITY -> TECHNICAL INDICATORS. Calculated from fetched daily bars; availability depends on history and feed. |
| Fundamental snapshot | Reported SEC revenue, net income, EPS, gross/operating/net margins and available YoY comparisons; 10-K/10-Q/8-K filing links | EVENT INTELLIGENCE -> SEC FILINGS + FUNDAMENTALS. Set a declared app/contact `SEC_USER_AGENT` locally. Eight mapped companies; SPY/QQQ are not supported SEC company mappings. Full valuation/factor metrics are not implemented. |
| Natural/geopolitical records | USGS earthquakes, NASA EONET and fixed-topic GDELT media reports | EVENT INTELLIGENCE -> USGS / NASA or GDELT REPORTS. These do not automatically establish company exposure. |
| Historical event study | Stock vs SPY close-to-close returns after the event's ET calendar day for 1, 3 and 5 completed sessions; available volume comparison | EVENT INTELLIGENCE -> load/select a real timestamped record -> RUN REAL EVENT STUDY. Requires entitled daily bars, completed matching sessions and an event covered by the available recent bar window (about 260 calendar days requested). |
| Volatility baseline | EWMA one-session volatility estimate with a past-only walk-forward absolute-return error measurement | Technical snapshot, after loading enough bars. It estimates magnitude, not up/down direction or the probability of an event causing a return. |
| Investigations / assistant | Explicitly saved case evidence, source/timestamp lineage, notes, revisions, exports and deterministic case briefs; optional server-side model interpretation | INVESTIGATIONS / ASSIST. This does not train a price predictor or produce validated trading recommendations. |
| Advanced stock/ETF screeners | **Not implemented** | Reusable metric calculation/rule engine, saved screens and strategy presets remain proposed later work. |
| SignalDock-style research | **Mostly planned** | Economic calendar with vintages/consensus, daily macro briefing, earnings calendar/reactions, regime/stress methodology, insider/13F, CFTC/positioning and licensed options intelligence are not shipped. Existing news, SEC facts and event comparisons are limited foundations. |
| Market Atlas / advanced heatmaps | **Not implemented** | The existing small watchlist performance map is not a market-cap-weighted sector/industry atlas, full-market breadth product, factor matrix or event-overlay engine. |
| Event-conditioned directional prediction | **Not implemented or validated** | A historical comparison is descriptive evidence. An actual predictor needs many comparable point-in-time events, appropriately licensed history, pre-event features and expectations, costs/corporate-action handling, chronological out-of-sample tests and comparison with simple baselines. |

The current integrity follow-up shows uncomputed real-data metrics as unavailable/NOT ASSESSED, preserves genuine evaluated zero values, exposes selected-observation age and snapshot-fetch timing, and checks compatible SEC ratio periods. The technical API rejects malformed numeric OHLCV and identifies its existing rolling RSI/simple ATR methods. Broader metrics, alert families and analogue retrieval remain proposed in [the next build specification](NEXT_RESEARCH_INTELLIGENCE.md), informed by [official-platform research](PLATFORM_RESEARCH_2026-11-12.md).

## Reading an empty screen

- **Events ingested > 0 but blotter rows = 0:** inspect flags-only, symbol, type and search filters. In the older UI, visiting SIGNALS and then MONITOR can leave an inherited flags-only filter. TRADE BLOTTER or CLEAR restores the unflagged rows; the review branch corrects navigation and empty-state guidance.
- **Signal Monitor empty:** a small collection of latest snapshots often has too few trades per symbol for the volume rule. One trade for each of ten symbols is not ten observations of the same instrument. Synthetic replay signals are illustrative, not proof that the real-data rule has a usable baseline.
- **Chart says insufficient samples:** the selected symbol needs multiple retained trade observations; the ten-symbol ticker/watchlist can be populated while an individual chart still has one point.
- **Event Intelligence has no real events:** source APIs are requested separately from MONITOR's LIVE mode. Use the source buttons and read their result/error status. Examples remain explicitly synthetic; technical/fundamental requests should not be mistaken for event-feed subscriptions.
- **Historical load returns no data or entitlement error:** try a prior trading date and an authorized feed; a holiday, unavailable coverage or credentials failure is not a reason to substitute synthetic trades under a real label.

## What historical event analysis contributes

If a stock rose 3% while SPY rose 1%, the current study can report a relative move of roughly +2 percentage points for the chosen completed-session horizon. It does not establish causality or imply that the next similar headline will produce +2%.

The intended later workflow is to collect comparable timestamped events, preserve what was knowable before each event, measure subsequent outcomes, evaluate candidate features and test predictions on later unseen periods. Current event studies and saved investigations provide research evidence and a future dataset foundation. They are not that trained and validated forecasting system.

The agreed direction remains v0.7 data integrity review, then proposed ResearchOS integration, macro/Market Atlas, corporate/earnings and event research, followed by broader screeners/ownership/options. Version assignments after v0.7 are proposals and can be reprioritized explicitly.
