# Next research-intelligence increment — proposal for review

Prepared November 12, 2026. This document turns the owner's expanded requirements into bounded work packages. It is a planning proposal, not approval or a claim that these features have shipped.

The owner's follow-up request for internet research is addressed in [the public-platform comparison](PLATFORM_RESEARCH_2026-11-12.md), using official documentation for Reflexivity, TradingView, Koyfin, RavenPack, AlphaSense, Dataminr, S&P Global and USGS. Those sources inform the proposed workflow; they do not validate our forecasting capability.

## Basis and present boundary

Inputs reviewed: the supplied startup brief, engineering handoff, reconstructed conversation history, current source, and the owner's MSFT/SEC/Signal Monitor examples. The history references a consolidated roadmap DOCX, but that DOCX was not supplied and is not represented as reviewed here.

The current application has IEX observations and fallback, a small technical/SEC snapshot, filing metadata, official hazard/media discovery, daily stock-versus-SPY event comparisons, and manually saved investigations. It has no general screen engine, historical analogue catalog, verified company exposure graph, or validated event-conditioned forecast.

The original proposed sequence is v0.7 data integrity, v0.8 Java/PostgreSQL integration and common research/instrument APIs, then macro/Market Atlas, corporate metrics, event exposure and broader screening. The owner now requests more analyst-visible value. Pulling a bounded metrics/alerts slice forward is recommended **alongside the v0.8 foundation**, because those features exercise the same dated metric, instrument, event and alert contracts. This does not silently replace the roadmap or authorize implementing every later module.

## Priority 0 — finish truthful v0.7 behavior

These corrections belong to the existing integrity review; their implementation and final checks are recorded separately.

- Distinguish unavailable/uncomputed observations from actual zero. A `0.00%` price move, `0.00x` factor or low score must not imply a calculation was performed when its inputs/baseline are missing.
- Show event age on selected observations. The owner's trade at `21:58:26Z` fetched around `22:18:36Z` was roughly 20 minutes 10 seconds old. A later successful poll does not make the trade fresh, nor does old trading activity alone prove an outage after hours.
- Distinguish source event time, backend retrieval/ingestion time and the timestamp/meaning of a calculated comparison.
- Expose polling versus streaming, pending authentication/subscription, retry status and sanitized fallback reasons. Diagnose the actual provider status before declaring live streaming verified.
- Compute a financial ratio only from compatible issuer, currency, accounting scope and fiscal periods; report missing or mismatched inputs instead of combining the newest unrelated facts.
- Reject malformed/non-numeric OHLCV inputs rather than converting null values to zero. Expose indicator calculation methods, usable-bar counts and rejected-input counts; valid-input RSI/ATR formulas remain unchanged in the integrity fix.
- Preserve DEMO/LIVE/HISTORY separation, Windows startup, private `.env`, public-asset allowlists and source-linked investigations.

Gate: existing tests plus focused missing-data, timestamp/freshness and financial-period tests pass; local authenticated IEX status is reported accurately. No sophisticated signal should be built on a fabricated zero or an unidentified period.

## Increment 1 — Research Intelligence Foundation

### Bounded outcome

For the supported pilot, an analyst can open a company research view, inspect a dated metric and its calculation/source, see useful conditions in a categorized signal workbench, and save the evidence in an investigation. A small reusable screening query can consume the same metrics. The initial implementation remains the existing ten-symbol market pilot and eight mapped SEC companies, not a full US/global universe.

Preserve the planned common instrument/research API direction. Define provider-independent repositories for instruments, dated metric observations, normalized events, rule evaluations and alerts. Map these to the ResearchOS Java/PostgreSQL boundary incrementally; retain the working Node adapter and Windows workflow during integration. Raw licensed high-frequency events remain a separate storage decision. No early Kafka/Kinesis/MSK or paid AWS provisioning is needed.

### Work packages and dependencies

| Package | Deliverable | Depends on |
|---|---|---|
| RI-101 | Instrument and dated-observation contracts; provider/feed/sector/region coverage inventory | v0.7 canonical/source contracts |
| RI-102 | Versioned metric catalog and explicit availability states | RI-101 |
| RI-103 | Longer bounded/paginated bar retrieval, completed-session and adjustment policy | RI-101; authorized historical data |
| RI-104 | SEC balance-sheet/cash-flow facts, aligned quarter/annual/TTM calculation inputs | RI-102; source-period validation |
| RI-105 | Expanded company research UI grouped by metric family | RI-102–104 |
| RI-106 | Reusable condition evaluation and categorized alert lifecycle | RI-102–104; freshness/readiness gates |
| RI-107 | Small saved-screen pilot using the same metric definitions | RI-102/106; persistence boundary |
| RI-108 | Filing-document evidence and event classification slice | Fixed SEC document fetching; source timestamps |

### Metric catalog, not hundreds of isolated formulas

Each definition identifies formula/version, unit, supported instrument/accounting scope, required inputs, lookback and missing-data policy. Each observation carries value or null, availability reason, period start/end, fiscal period, source, source document, as-of/availability time and calculation version.

Research pages should group metrics into Overview, Technicals, Valuation, Growth, Profitability, Cash Flow and Financial Health. The compact current sidebar can remain a summary; the expanded catalog needs a readable detail view, definitions and coverage indicators.

| Family | Existing subset | Proposed next slice | Additional dependencies / later scope |
|---|---|---|---|
| Trend/momentum | SMA20/50, RSI14, MACD/signal | SMA200, distance from moving averages, defined crossing conditions | Adequate completed bars; explicit RSI smoothing method |
| Volatility/price activity | ATR14, EWMA baseline, relative daily volume | ATR-normalized movement, prior-close gaps, defined rolling highs/lows and breakouts | Same-feed/session inputs; corporate-action and adjustment policy |
| Valuation | No full valuation layer | Trailing valuation only when matching price, shares/EPS, debt and cash inputs exist | P/E, P/B, P/S, EV/EBITDA require more than the displayed income statement; negative/unavailable denominators have explicit semantics |
| Growth | Available reported YoY comparisons | Aligned quarterly/annual and TTM revenue, earnings and cash-flow growth | Comparable periods, restatements and duration handling |
| Profitability | Gross/operating/net margins | ROE from suitable income/equity inputs; later ROIC/ROCE with documented capital/tax definitions | Average balances, accounting scope and sector comparability |
| Cash flow | Not exposed | Operating cash flow, capital expenditure and free cash flow with correct flow/sign semantics | SEC cash-flow tags; distinguish year-to-date flows from standalone quarters |
| Financial health | Not exposed | Cash, debt, equity and supported leverage/liquidity ratios | Classified balance-sheet inputs; missing/custom tags remain unavailable |
| Expectations | Not implemented | Display unsupported until a source is integrated | Forward P/E, PEG, consensus, surprises and implied earnings moves need suitable estimates/options sources |

The current endpoint requests 260 **calendar** days, producing approximately 181 sessions in the owner's example. SMA200 requires 200 valid trading observations; a 52-week range needs the defined session/year coverage. Increase the requested range and handle pagination, but never label a shorter sample a completed long-horizon metric.

RSI currently uses a simple 14-period gain/loss average; ATR uses a simple average of true ranges. Other platforms may use Wilder smoothing. Preserve or explicitly version a method change rather than presenting incompatible values as identical indicators.

Financial tests must cover matched periods, year-to-date differencing, fiscal calendars, amended/restated filings, missing/custom tags, currency/units, zero/negative denominators and compatible TTM construction. Do not naively mix quarter EPS, current shares and differently dated balance-sheet values. Forward estimates cannot be invented from SEC reported facts.

### A useful signal screen

Show separate groups for market observations, technical conditions, corporate/filing changes, external events and data-quality notices. A stale-feed notice is operational information; it is not a bullish/bearish signal. Preserve the distinction between an observation, a research hypothesis and a trade recommendation.

Each row/card should expose:

- Instrument/sector/event, category, rule name/version and plain-language reason.
- Observed value, comparator/threshold, window and baseline sample count.
- Source/feed, coverage, event time, calculation time and freshness.
- Readiness: unavailable, warming up, ready, triggered or recovered; quality/staleness shown separately.
- First/last trigger, deduplication/cooldown state, acknowledgement and investigation action.
- Evidence links and missing inputs. Severity is a transparent rule priority, not a calibrated prediction probability.

| Condition | Feasible next implementation | Required limitation |
|---|---|---|
| Quote spread | Valid bid/ask spread in basis points; compare with a supported observed baseline | IEX/sampled quote condition, not full-market liquidity; reject or separately flag crossed/stale quotes |
| Observed price movement | Same-symbol source-time movement over a declared retained window | Sparse polling cannot reconstruct all intervening prices; unavailable baseline stays null |
| Daily technicals | Completed-bar moving-average crossings, prior-close gap and rolling breakout conditions | Defined session/adjustment policy; evaluate once per eligible observation/bar |
| Volume | Existing trade-size rule plus supported daily-bar relative volume | One trade's quantity is not total-market traded volume; intraday seasonality needs suitable bar history |
| Corporate change | Newly available filing, material fact changes or supported document classifications | Filing acceptance, report period and event time are different |
| External event | New official hazard record and evidence-backed exposure candidates | No automatic company loss or security linkage from a location/headline alone |
| Cancellation/order-book behavior | Unavailable with the current inputs | Trades/quotes do not provide the required order lifecycle/customer-order visibility |

Default thresholds are documented and versioned. Add configurable conditions through a shared rule representation; do not create a separate hardcoded mini-engine for every screener preset. Saved screens can begin with a small supported universe and explain every match/non-match/missing value.

### Filing intelligence beyond a filing title

The existing SEC list is metadata: accession, form, acceptance/filing date and URL. It does not read an 8-K or know the economic event described inside it.

RI-108 should fetch fixed-host SEC documents/exhibits safely, normalize text, preserve document/section identifiers and classify supported 8-K items or reported 10-Q facts. Provide extractive summaries and source passages first. Optional model-generated summaries must cite those passages and abstain when the document cannot support a claim.

Retain occurrence date only when explicitly established, document publication/acceptance date, local ingestion time and the time/version available to the application. An unknown occurrence time remains unknown; a generic 8-K label is not an earnings or loss event by itself.

### Increment 1 acceptance

1. Every displayed metric has a definition/version, source, period/as-of time and supported/unavailable status.
2. An insufficient SMA200 sample explicitly reports the missing coverage, rather than a guessed number.
3. New financial measures use compatible periods and pass the calculation cases above.
4. Conditions explain their inputs/window/readiness; stale or duplicate polling observations do not create repeated fresh alerts.
5. Trigger/non-trigger/warm-up/recovery, cooldown, mode switching and company switching have regression coverage.
6. An alert or screen match can open an investigation with the exact metric/event evidence and rule version.
7. The pilot universe and unavailable provider-dependent fields remain visible; no market-wide claim is made.
8. Existing v0.7 workflows, native tests, static packaging and Windows startup remain functional.

## Increment 2 — Historical Analogues and Exposure pilot

### Bounded outcome

For one supported event class, show similar earlier events, why they match, what was known then, which exposures are evidenced, and measured subsequent outcomes. Start with earthquakes in a bounded geography and a small verified exposure inventory. A tsunami-warning adapter and broader hazard classes are separate additions; an earthquake does not itself establish that a damaging tsunami occurred.

```text
Official event and revisions
  -> known-at-time event features and physical footprint
  -> sourced facilities / ports / suppliers / country-sector exposure
  -> mapped instruments and supported outcome series
  -> comparable historical events and measured distributions
  -> analyst scenarios and saved investigation
```

### Data and work packages

| Package | Data / deliverable | Dependency |
|---|---|---|
| HA-201 | Historical event catalog with original identifiers, revisions, occurred/published/known/ingested times and geography | Official historical sources; RI-101 event repository |
| HA-202 | Versioned exposure graph: facility, port, supplier, issuer, sector, region and effective dates | Verified source documents/geospatial data; common instruments |
| HA-203 | Point-in-time historical outcome retrieval and event windows | Authorized adjusted daily history, calendars and benchmarks |
| HA-204 | Explainable analogue retrieval with declared feature weights and cohort rules | HA-201–203 |
| HA-205 | Analyst event-comparison and impact-channel view | HA-204; existing investigations |

A similarity query can use event class, magnitude/intensity/depth, geography/physical footprint, affected infrastructure and pre-event economic/market context. Show each contributing feature and differences. Do not use final damage totals, revised magnitudes, later news, subsequent returns or other unavailable future facts to make an earlier event look predictably similar.

Group related aftershocks and repeated media records so a single disaster is not counted as many independent examples or split across training/evaluation periods. Where available, attributed USGS ShakeMap/PAGER products can provide physical-impact estimates with their original versions and uncertainty; they do not supply verified company loss or security-return predictions.

The current USGS adapter uses an update timestamp as publication metadata. A latest catalog response does not establish the time of the original alert or reconstruct what an analyst first knew. Store available revisions/knowledge timestamps going forward, obtain a suitable historical revision source, or explicitly mark point-in-time availability unknown. Never replace an unknown historical first-seen time with today's ingestion time or a later revision date.

Retrieve by the event's actual historical window, not the current endpoint's trailing 260-day sample. Respect data retention/redistribution rights and preserve corporate actions, session alignment, missing coverage and overlapping-event confounders. Daily bar results remain daily approximations; intraday event reactions require suitable intraday data.

The existing study uses the event-day close as its reference, which can already include an intraday event reaction. That retrospective reference must not be reused as a pre-event feature or baseline in a predictive backtest. Define a reference observable before the event/knowledge cutoff and the available first post-event execution/bar window separately.

Outcomes may include supported equity/sector/country returns, relative returns, volatility, volume and drawdown. Currency, interest rates, commodities, shipping measures and macroeconomic outcomes require separate provider/series adapters; the current ten-symbol IEX feed cannot supply them by inference.

The initial comparable-case output reports cohort size, individual cases, selection method, available horizons and distribution/uncertainty. No comparables means insufficient history. A small analogue set must not become an invented probability or confident causal conclusion.

### Financial, economic, political and social channels

| Channel | Example hypothesis | Evidence needed before presenting it as observed |
|---|---|---|
| Physical/business | Factory or port interruption; supplier dependence | Hazard footprint plus verified location and closure/operational reports |
| Financial | Insurer exposure, issuer earnings sensitivity, sector/FX response | Sourced business exposure and observed licensed market/company data |
| Economic | Production/import disruption, reconstruction demand, inflation changes | Official dated output/trade/price series and a supported transmission mechanism |
| Political | Emergency declarations, public spending or policy response | Dated official actions; media coverage alone is not the action |
| Social | Displacement, casualties, service interruption | Official observations with publication/revision times and appropriate uncertainty |

For example, a coastal earthquake may suggest investigating ports, manufacturing, energy and insurers. Reconstruction could support some activities while disruption harms others. Neither direction nor affected securities should be declared from the headline alone. Each exposure/impact edge carries a source, effective date and a fact/hypothesis/model label.

LLMs can help retrieve and summarize evidence or describe competing scenarios. They cannot supply missing facility links, historical data, numerical confidence or a validated causal effect. Source reliability, exposure evidence, similarity quality and predictive uncertainty are separate quantities.

### Increment 2 acceptance

1. Historical replay at a chosen knowledge cutoff excludes later information and shows event revisions.
2. Every linked issuer/facility/asset has a sourced effective exposure edge; candidate-only links remain explicitly unverified.
3. Similar-case rankings explain their inputs, cohort definition, missing features and differences.
4. Outcomes show data availability, benchmark, window, adjusted-price policy and individual comparable cases.
5. No-history, sparse-cohort, overlapping-event and unavailable-market outcomes abstain appropriately.
6. The analyst can save the comparison and evidence as a reproducible investigation.
7. A curated earthquake pilot works before expanding to tsunami, other hazards or global multi-asset claims.

## Increment 3 — Scenarios and evaluated forecasts

Prediction follows the event/exposure/outcome foundation, not the other way around. First implement a repeatable evaluation harness and simple baselines. Define target, horizon, available-at-time inputs and the decision the estimate supports before choosing a model.

Use chronological out-of-sample evaluation, event-family/geographic holdouts where appropriate, calibrated intervals/probabilities only when supported, and comparison against unconditional/event-class/market baselines. Evaluate data revisions, regime changes, small samples, overlapping shocks and selection bias. Report errors and abstention rates as well as successful examples.

Keep analyst scenarios separate from forecasts: plausible pathways can be useful without claiming a tested probability. Political/social scenarios require their own evidence and evaluation targets; a stock-return model does not validate predictions of human or policy outcomes.

## Mapping the broader discussed backlog

| Earlier discussion | Required foundation / proposed placement |
|---|---|
| Screener.in/Finviz metric breadth and presets | RI metric catalog and reusable screen/query rules; expand coverage after pilot correctness |
| SignalDock daily briefing and economic calendar | Official release times and actual/prior/revised/consensus/vintage data; source-grounded briefing after dated-series integration |
| Earnings intelligence and implied/realized moves | Filing/document classification, earnings/guidance history, suitable consensus/options data and point-in-time event outcomes |
| Form 4 / 13F and institutional positioning | Dedicated parsers, reporting lags/amendments and holdings periods; disclosures are not live institutional trading |
| Sector rotation, breadth and Market Atlas | Common instruments/classification/constituents, broader authorized coverage and consistent return/metric windows |
| Event-impact overlays and thematic research | Exposure graph, historical analogue/outcome records and investigations |
| Options, CFTC/positioning and cross-asset intelligence | Separate licensed/official datasets, schemas, update cadence and methodology |
| CPZAI-style reproducibility and agents | Versioned evidence, calculations, rules, saved studies and evaluation; no broker execution implied |

Version numbers after v0.7 remain proposals. Review the current integrity corrections, then select the bounded Research Intelligence Foundation slice and its data dependencies. Do not represent the complete forecasting/screener/SignalDock backlog as one completed or approved sprint.
