# Research Intelligence Foundation

Implementation guide for `feature/tradescope-research-intelligence`, prepared November 12, 2026. This increment brings company metrics, manually evaluated conditions, saved screens, filing passages and retrospective earthquake comparisons into the existing local TradeScope workstation. It can be described as the v0.8 research foundation; the package/version and final verification result are recorded by the integrating change.

## What is implemented

Open **RESEARCH** for five tabs: **COMPANY RESEARCH**, **SIGNALS**, **SCREENER**, **FILING READER** and **HISTORICAL ANALOGUES**. The primary **SIGNALS** navigation opens the research signal workbench. MONITOR retains its separate experimental observed-trade-size Signal Monitor.

The supported universe is **NVDA, AAPL, MSFT, TSLA, SPY, AMD, QQQ, META, AMZN and PLTR**. These are ten requested US-listed instruments, not a market-wide screening universe. SEC companyfacts are mapped for the eight companies; SPY/QQQ do not acquire company financials by inference. The local `US_EQUITY:<symbol>` identifiers and display categories are pilot keys, not an authoritative global security master, exchange listing service or sector classification.

The shared catalog contains **65 metric definitions: 33 technical/price and 32 financial/valuation**. Definitions include method/version, unit, inputs and sample requirements. An observation contains a value or null, status/reason, source, dated period/as-of fields, calculation method and available input evidence. Catalog membership does not imply a value can be computed for every instrument.

| Family | Implemented examples | Important boundary |
|---|---|---|
| Trend and momentum | SMA/EMA20/50/200, price distances, rolling RSI14, MACD/signal/histogram | RSI uses rolling simple averages; EMA uses an SMA seed. These methods are named rather than assumed equivalent to every charting platform. |
| Activity, volatility and range | Simple ATR14/ATR%, relative volume, 1/5/20/63/252-session returns, 252-session high/low, gap, prior-20 breakout/breakdown, Bollinger, stochastic, OBV | Enough valid completed observations are required. OBV depends on the loaded start; price returns are not automatically dividend-reinvested total returns. |
| Growth and profitability | Quarterly revenue/EPS, comparable revenue YoY, margins, TTM revenue/income/EPS, ROE | Same issuer, units and compatible fiscal periods; no annualization of a latest quarter or unsafe EPS YTD subtraction. ROIC/ROCE and broader factor scores remain pending. |
| Cash flow and financial health | TTM operating cash flow/capex/free cash flow, FCF margin, cash/debt/equity/assets, liquidity/leverage | Supported tags and complete same-date borrowing components are required; custom/ambiguous facts remain unavailable. |
| Valuation | Supported trailing P/E, price/book, price/sales, estimated market capitalization and enterprise value | Dated market price and last disclosed accounting inputs are retained. No real-time share float assumption. EV/EBITDA, forward P/E and PEG are explicitly unsupported definitions. |

Company research requests approximately 800 calendar days of IEX daily bars with split adjustment. Retrieval is bounded to three pages of 1,000 bars, reports unfinished pagination, and never manufactures missing history. The current ET calendar date is excluded even after regular close; weekends are excluded, but exchange holidays, early closes and absent sessions are not reconstructed. Input quality, rejected records and coverage remain visible. Source entitlement, single-venue IEX coverage and corporate actions can affect comparisons with other platforms.

SEC calculations use supported reported company-level US-GAAP facts and preserve filing/period evidence. TTM dollar flows use a compatible reported annual value, four contiguous quarters, or aligned annual/YTD arithmetic where valid. EPS uses a reported full year or four reported standalone quarters. A missing ratio is not zero. These latest reported facts are not a complete historical point-in-time fundamentals archive.

## Signals and saved screens

Nine built-in conditions cover long-term trend, RSI below 30, positive MACD histogram, relative daily volume above 2×, prior-20 breakout, reported revenue growth above 10%, positive trailing free cash flow and debt/equity above 2×. They are transparent conditions, not recommendations or calibrated probabilities.

The common engine supports `gt`, `gte`, `lt`, `lte`, `eq`, `crosses_above` and `crosses_below`, with ALL/ANY combinations, one to twenty conditions and a literal or another allowed metric as comparator. Crossing conditions require dated earlier observations. Unknown inputs stay unknown; stale/missing metrics cannot pass as a zero-valued match. Default freshness gates are seven days for daily inputs and 550 days from financial period end, with dated price checks for valuation; these are configurable pilot gates, not exchange-calendar certification.

**EVALUATE SELECTED SECURITY** runs the built-ins manually. Triggered results may create saved alerts; repeat evidence is deduplicated and a five-minute cooldown applies. Alerts support active, acknowledged and resolved states with optimistic revisions; eligible recovered conditions resolve existing alerts. Unavailable/warming results do not create positive alerts. Historical observations do not create live alerts.

The screener uses the same catalog and engine, three presets and selected pilot symbols. Analysts can build conditions, save a new screen, edit a selected saved screen with revision-checked updates, delete it and run it. Selecting the blank screen choice keeps criteria as a new copy. Results distinguish matches, non-matches and unavailable inputs. There is **no scheduled scan, background monitor, push/email delivery or market-wide scan service**.

Screens and alert state persist in `.local-data/research.json` through bounded atomic JSON writes. Defaults are 50 screens, 500 alerts and 2,000 remembered evidence keys. Cases remain in `.local-data/cases.json`. This is a single-process, single-user store, not PostgreSQL, a raw market archive or a multi-user transactional service. Investigation actions capture bounded dated evidence; they do not preserve a complete raw source archive.

## Filing reader

Choose a security, load its official SEC filing list and select an accession. The reader only accepts a supported primary document from that issuer's current submissions metadata, validates the fixed SEC archive URL and returns recognized 8-K/10-Q/10-K item headings, passages and extractive summaries with evidence identifiers. HTML is converted to text rather than executed.

Limits include a 2 MiB document, 400,000 text characters, sixteen selected sections and bounded in-memory caching. The output states truncation and unrecognized sections. Raw documents are not persistently stored. It does not crawl exhibits/transcripts, infer an occurrence date, assert the truth of a company's statement or provide a complete structured earnings/guidance history. Open the original source when a passage is insufficient.

## Historical earthquake comparisons

Recent events come from the official USGS M4.5+ past-week feed. Choosing an event fetches its fixed official detail and queries up to thirty earlier years within 3,000 km, magnitude ±1.5 and depth ±150 km, capped at 2,000 candidate records. No later event is admitted. At most five matches are returned; missing/invalid geography or physical features are rejected.

The similarity score is a weighted physical-feature comparison: magnitude 50%, depth 20% and geographic distance 30%. The response exposes contributions, differences, query coverage and excluded counts. Events within fourteen days and 250 km of the selected earthquake are excluded as the same local episode; other candidate clusters use that same window and retain a deterministic representative. These are declared research heuristics, not proof that disasters are economically independent.

USGS returns latest catalog versions. Original publication/first-seen timestamps are unknown and remain null; the update time is not substituted for them. The result is labeled **retrospective_catalog**, with forecasts unavailable and company exposures unverified. Revised magnitudes may differ from the first alert. A tsunami flag does not establish a warning, observed tsunami or damage. No PAGER/ShakeMap integration, facility/supplier graph or tsunami-warning adapter is implemented.

For a selected case, a user may request the current pilot security's observed daily outcomes versus SPY over **1/5/20 completed sessions**. This deliberately selected security is not an automatically verified exposure. The API fetches the event's historical price window, requesting all-adjusted IEX daily bars; available dates, feed consistency and provider adjustment behavior remain relevant limits.

The reference is the last matching completed stock/benchmark session strictly before the event. An intraday event therefore uses the prior session and may include that day's close as its first outcome; an event after 16:00 ET may use that day's close as its reference. Weekends align with supplied benchmark sessions. Current ET date is excluded, missing stock horizon data stays pending, and missing reference data gives insufficient data. No independent holiday/early-close calendar is reconstructed. Results show stock return, benchmark return and their arithmetic difference; they do not identify causation, intraday execution or historical first-alert knowledge.

The older EVENT INTELLIGENCE study remains a separate 1/3/5-session event-day-close comparison. Its reference and horizons must not be silently equated with the new analogue outcome method.

## Local setup and Windows updates

Use an actual Git checkout to fetch/switch branches. A downloaded GitHub ZIP has no `.git` directory; select the correct branch before downloading its ZIP, extract it and locate `apps/tradescope`. Preserve local `.env` and `.local-data` when replacing an older extracted folder. Do not copy another user's data or place either directory in a public/static build.

In an existing checkout, with no conflicting local edits:

```powershell
git fetch origin
git switch feature/tradescope-research-intelligence
git pull --ff-only
cd apps/tradescope
node --version
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm.cmd start
```

Node 22.16 or later is required. The startup script loads the local `.env` if present; restart the server after edits. If `npm.cmd` is unrecognized, install Node.js and reopen PowerShell so its PATH is refreshed. The workstation uses native Node modules and needs no paid infrastructure.

Replace the example placeholders locally:

```dotenv
APCA_API_KEY_ID=your_alpaca_market_data_key
APCA_API_SECRET_KEY=your_alpaca_market_data_secret
SEC_USER_AGENT=TradeScopeResearch your-contact@example.com
HOST=127.0.0.1
PORT=8000
```

Alpaca keys enable entitled market data; a declared SEC contact enables EDGAR requests. Official USGS research does not require an API key. `OPENAI_API_KEY` is optional for the existing assistant, not required for metrics, rules, filing extraction or analogues. Optional `RESEARCH_STORE_PATH` changes the server-side research JSON path. Keep credentials server-side and retain `.env` plus `.local-data` across updates. The local API has no multi-user authentication and is intended for the loopback workstation.

## Research API boundary

| Method and path | Purpose |
|---|---|
| `GET /api/research/catalog` | Pilot instruments, 65 definitions, rules, presets and limitations |
| `GET /api/research/company?symbol=MSFT` | Dated company metrics, history quality, methods and partial-source errors |
| `POST /api/research/evaluate` | Manually evaluate built-ins for `{symbol}` and update eligible local alerts |
| `POST /api/research/screen` | Run a preset or validated screen over selected pilot symbols |
| `GET /api/research/screens` | Saved screens and presets |
| `POST /api/research/screens` | Create/update a validated screen; updates require `expectedRevision` |
| `DELETE /api/research/screens/:id` | Delete with `expectedRevision` |
| `GET /api/research/alerts` | List saved alerts; optional `status` and `symbol` filters |
| `PATCH /api/research/alerts/:id` | Update lifecycle status with `expectedRevision` |
| `GET /api/research/filing?symbol=MSFT&accession=...` | Read a supported accession from the issuer's official filing list |
| `GET /api/research/earthquakes` | Recent official M4.5+ records |
| `GET /api/research/analogues?eventId=...` | Bounded earlier retrospective catalog matches |
| `GET /api/research/event-outcomes?symbol=MSFT&eventTime=...` | Observed daily selected-security/SPY outcomes |

Requests use the same-origin local server. Symbols, metric IDs, JSON condition sizes, request bodies, queues, source hosts, response sizes and caches are bounded. There is no arbitrary URL fetch, executable expression or SQL input endpoint. Static packaging serves the UI assets, not credentials, private data or a working server API.

## Verification and remaining requirements

Run `npm test` and `npm run build:static`; record actual final results with the integration change. Deterministic tests use fixtures/mocks and do not prove authenticated Alpaca access or current SEC availability.

For a local walkthrough, load MSFT company research, inspect available and unavailable metric reasons, evaluate conditions, run a preset and save a custom screen. Restart and confirm saved state; acknowledge an alert if a real condition triggers. Open an official filing and follow a cited passage. Load recent earthquakes, select an analogue, inspect its physical-feature evidence and request a supported security's outcomes. Missing coverage is an acceptable explicit result, not a reason to invent records. Verify DEMO/LIVE/HISTORY and existing investigations still work independently.

Still pending: full Java/PostgreSQL integration and security master; scheduled monitoring/notifications; broad universes and peer/sector comparisons; macro releases with vintages/consensus and daily briefing; earnings/guidance/consensus history; ownership/Form 4/13F; options/CFTC/other asset classes; Market Atlas; verified exposure graph; historical revision/knowledge archive; and a chronologically evaluated calibrated forecast. See [FEATURE_STATUS.md](FEATURE_STATUS.md), [NEXT_RESEARCH_INTELLIGENCE.md](NEXT_RESEARCH_INTELLIGENCE.md) and [SPRINTS.md](SPRINTS.md) for the delivery boundary.
