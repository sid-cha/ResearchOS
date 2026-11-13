# Research intelligence — requirements and delivery boundary

Prepared November 12, 2026; updated for `feature/tradescope-monitoring-atlas`. This document retains the broader requirements and records the bounded implementation now present. **Built** means implemented in this branch, subject to final integration checks and local provider verification; **limited** means a narrower pilot than the full requirement; **pending** means no shipped implementation. The full proposed roadmap has not shipped. See [the foundation guide](RESEARCH_INTELLIGENCE_FOUNDATION.md), [monitoring/Atlas/storage guide](MONITORING_ATLAS_STORAGE.md) and [feature inventory](FEATURE_STATUS.md).

The owner's follow-up request for internet research is addressed in [the public-platform comparison](PLATFORM_RESEARCH_2026-11-12.md), using official documentation for Reflexivity, TradingView, Koyfin, RavenPack, AlphaSense, Dataminr, S&P Global and USGS. Those sources inform the proposed workflow; they do not validate our forecasting capability.

## Basis and present boundary

Inputs reviewed: the supplied startup brief, engineering handoff, reconstructed conversation history, current source, and the owner's MSFT/SEC/Signal Monitor examples. The history references a consolidated roadmap DOCX, but that DOCX was not supplied and is not represented as reviewed here.

The application retains IEX observations/fallback, event discovery, daily event studies and local investigations. The foundation adds a shared 65-definition catalog (33 technical/price and 32 financial), company research, a safe rule/screen engine, saved alerts and extractive filing/earthquake research. The next increment adds optional saved-screen schedules, requested-pilot Market Atlas comparisons and explicit Java/PostgreSQL metric snapshot synchronization. Coverage remains ten US-listed pilot instruments and eight mapped SEC companies. Catalog definitions can be unavailable or unsupported; no verified company exposure graph or validated event-conditioned forecast exists.

The original sequence proposed Java/PostgreSQL integration after v0.7, then macro/Market Atlas, corporate metrics, event exposure and broader screening. The owner's follow-up requests bring useful bounded slices forward. The optional versioned Java API now persists pilot instruments and dated metric snapshots in separate PostgreSQL tables; screens, alerts, monitors and cases remain local JSON. **Full authenticated multi-user workflow migration is still pending.** The remaining roadmap is recorded below.

## Current delivery against work packages

| Package | Current branch status | Remaining boundary |
|---|---|---|
| RI-101 | **Limited:** local instrument/dated-observation contracts plus optional authenticated Java/PostgreSQL snapshot persistence | Authoritative security master, broader coverage, original-revision archive and full authenticated workflow migration |
| RI-102 | **Built pilot:** 65 versioned definitions and explicit availability/reasons | Additional factors and provider-dependent metrics; forward P/E, PEG and EV/EBITDA are unsupported definitions |
| RI-103 | **Built pilot:** bounded paginated daily history, completed prior sessions, declared split/all adjustment paths | Complete market calendar, licensed wider history and retained point-in-time corporate-action/revision data |
| RI-104 | **Built pilot:** compatible reported SEC cash flow/balance sheet/TTM, ROE and supported valuation | Custom tags, broader accounting regimes, ROIC/ROCE, consensus and ambiguous share classes |
| RI-105 | **Built:** grouped company research with methods, source dates, quality and unavailable states | Peer/sector comparisons and broader universe |
| RI-106 | **Limited:** nine built-ins, saved alert lifecycle and opt-in local scheduling of immutable saved-screen criteria | Additional quote/corporate/external alert families, external notifications and hosted/OS-service monitoring |
| RI-107 | **Built pilot:** three presets, custom ALL/ANY screens, revision-checked persistence, manual scans and local scheduled copies | Full-market scan service, database-backed multi-user operation and broader scheduling infrastructure |
| Atlas pilot | **Limited:** requested-symbol returns/trend breadth, compatible equal-weight display-category averages and normalized common-date comparisons | Authoritative sectors/peers/constituents, broad-market rotation/treemaps, cross-asset data and verified event overlays |
| RI-108 | **Limited:** selected fixed-host primary filing reader, recognized headings and source-linked extractive passages | Exhibit/transcript crawling, structured earnings/guidance history and comprehensive semantic classification |
| HA-201 | **Limited:** official current catalog/detail plus earlier bounded historical query; unknown historical publication remains null | Persisted original revisions and known-at-time historical archive |
| HA-202 | **Pending:** exposures explicitly unverified | Sourced facility/port/supplier/issuer/sector/region graph with effective dates |
| HA-203 | **Limited:** retrospective selected US-security/SPY daily 1/5/20-session outcomes with pre-event reference | Point-in-time knowledge, complete calendars, broad asset classes and licensed global outcomes |
| HA-204 | **Limited:** transparent magnitude/depth/distance ranking, prior-only candidates, aftershock grouping, capped five matches | Verified exposure/pre-event economic context and evaluated cohort representativeness |
| HA-205 | **Limited:** historical analogue workspace, selected-case outcomes and investigation evidence actions | Verified impact-channel view and fully reproducible historical source/revision snapshots |
| Increment 3 | **Pending:** no calibrated event forecast | Chronological evaluation, baseline comparison, point-in-time features, uncertainty and abstention methodology |

Saved screens/alerts use bounded `.local-data/research.json`, monitor configurations and run summaries use `.local-data/monitors.json`, and cases use `.local-data/cases.json`. Schedules run only while the local Node process runs; no external notifications or OS service are installed. Optional explicit snapshot synchronization uses separate Java/PostgreSQL tables without replacing those local stores. Preserve both `.env` and `.local-data` during Windows folder/ZIP updates.

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

The following table preserves the metric requirements behind the work packages; the delivery table above identifies the implemented subset and remaining limitations.

| Family | Earlier subset | Requirement / expanded slice | Additional dependencies / later scope |
|---|---|---|---|
| Trend/momentum | SMA20/50, RSI14, MACD/signal | SMA200, distance from moving averages, defined crossing conditions | Adequate completed bars; explicit RSI smoothing method |
| Volatility/price activity | ATR14, EWMA baseline, relative daily volume | ATR-normalized movement, prior-close gaps, defined rolling highs/lows and breakouts | Same-feed/session inputs; corporate-action and adjustment policy |
| Valuation | No full valuation layer | Trailing valuation only when matching price, shares/EPS, debt and cash inputs exist | P/E, P/B, P/S, EV/EBITDA require more than the displayed income statement; negative/unavailable denominators have explicit semantics |
| Growth | Available reported YoY comparisons | Aligned quarterly/annual and TTM revenue, earnings and cash-flow growth | Comparable periods, restatements and duration handling |
| Profitability | Gross/operating/net margins | ROE from suitable income/equity inputs; later ROIC/ROCE with documented capital/tax definitions | Average balances, accounting scope and sector comparability |
| Cash flow | Not exposed | Operating cash flow, capital expenditure and free cash flow with correct flow/sign semantics | SEC cash-flow tags; distinguish year-to-date flows from standalone quarters |
| Financial health | Not exposed | Cash, debt, equity and supported leverage/liquidity ratios | Classified balance-sheet inputs; missing/custom tags remain unavailable |
| Expectations | Not implemented | Display unsupported until a source is integrated | Forward P/E, PEG, consensus, surprises and implied earnings moves need suitable estimates/options sources |

The earlier snapshot endpoint requests about 260 **calendar** days, producing approximately 181 sessions in the owner's example. The new company research path requests about 800 calendar days with bounded pagination and partial-history disclosure. SMA200 still requires 200 valid completed observations; the defined 252-session metrics require their full window. A shorter sample remains unavailable rather than being labeled complete.

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

The EVENT INTELLIGENCE SEC list remains metadata: accession, form, acceptance/filing date and URL. The new FILING READER adds bounded extractive document evidence; a generic list title alone still does not classify the economic event.

RI-108 now fetches a supported primary SEC filing selected from the issuer's official list, normalizes text and preserves section/evidence identifiers with extractive passages. Exhibit traversal and comprehensive economic fact classification remain pending. Optional later model-generated summaries must cite those passages and abstain when the document cannot support a claim.

Retain occurrence date only when explicitly established, document publication/acceptance date, local ingestion time and the time/version available to the application. An unknown occurrence time remains unknown; a generic 8-K label is not an earnings or loss event by itself.

### Increment 1 acceptance

These are acceptance targets for the broader package, not a statement that every later data family or background service has shipped. Use the current delivery table and final executed checks for the bounded branch.

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

The full requirement is to show similar earlier events, why they match, what was known then, evidenced exposures and measured outcomes. The current earthquake MVP implements physical-feature comparison and selected-security outcomes only. It labels current catalog versions retrospective, original knowledge unknown, exposures unverified and forecasts unavailable. A verified exposure inventory, historical knowledge archive, tsunami-warning adapter and broader hazard classes remain separate additions; an earthquake does not itself establish that a damaging tsunami occurred.

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

The older event-discovery USGS representation includes an update timestamp in publication metadata. The new analogue path instead preserves `updatedAt` separately and leaves original publication/first-seen/known-at-time fields null. A latest catalog response does not reconstruct what an analyst first knew. Persist available revisions going forward or obtain a suitable historical revision source before claiming historical point-in-time replay; today's retrieval and a later revision are not substitutes.

Retrieve by the event's actual historical window, not the current endpoint's trailing 260-day sample. Respect data retention/redistribution rights and preserve corporate actions, session alignment, missing coverage and overlapping-event confounders. Daily bar results remain daily approximations; intraday event reactions require suitable intraday data.

The existing EVENT INTELLIGENCE study uses the event-day close as its reference, which can already include an intraday reaction. The new analogue outcome path uses a completed pre-event stock/SPY reference and 1/5/20-session horizons; unavailable matches stay pending. Both remain retrospective daily approximations, with the current ET date excluded and no complete holiday/early-close calendar reconstructed. Neither supplies point-in-time event knowledge or an executable intraday predictive backtest.

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

The full historical-knowledge/exposure acceptance below is **not met by the retrospective MVP**. Physical-feature rankings and supported outcomes are available; original revision replay, verified exposure edges and complete historical snapshots remain pending.

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

The Research Intelligence Foundation, local schedules, requested-pilot Atlas and optional dated-snapshot storage are implemented within the boundaries above. Full Java workflow integration, broad-market Atlas, macro/SignalDock coverage, verified exposure intelligence and evaluated forecasting remain pending. Version labels alone must not imply those broader requirements are complete; use delivered scope and final verification evidence.
