# TradeScope v0.24 — Source Evidence & Provenance Journal

**New:** [Evidence Ledger](evidence-ledger.html) · [v0.24 provenance guide](docs/V024_EVIDENCE_PROVENANCE_LEDGER.md) · [12-scenario economic engine](transmission-lab.html) · [FRED/ALFRED explorer](fred-research.html).

A new optional local journal stores bounded normalized source observations from FRED/ALFRED and source-backed economic dossiers, with ordered SHA-256 record/payload hashes, revision/dedup detection, tamper rejection and persistent restart-safe JSONL storage. Enable explicitly with RESEARCH_EVIDENCE_LEDGER_ENABLED=true in your private local .env on a loopback server. The journal does not assert historical original publication clocks, independently notarize its hashes, or grant redistribution rights.

This release is a CI-tested **research pilot**; live-provider, browser, source-license and historical-clock acceptance remain pending. [Unified draft PR #19](https://github.com/sid-cha/ResearchOS/pull/19) remains unmerged.

---

# TradeScope v0.23 — Scenario Registry and FRED Research Explorer

**New:** [12-scenario transmission lab](transmission-lab.html) · [FRED/ALFRED source explorer](fred-research.html) · [Provider reliability center](source-control.html) · [v0.23 implementation guide](docs/V023_SCENARIO_REGISTRY_AND_FRED.md).

The three v0.22 economic pathways remain available. A versioned scenario registry now supports **12 research pathways** across climate, energy, geopolitics, shipping, credit, industrial supply and health. Only **3** have prior research-context pipelines, **2** have partial source bindings, and **7** are explicitly `TEMPLATE_ONLY`; all causal edges remain unvalidated. No additional template implies actual market impact, historical forecasting or an autonomous agent.

FRED/ALFRED explorer adds official server-only series discovery, metadata, vintage dates, economic releases and historical calendar-day as-of observations. Use **new/rotated credentials** in private `apps/tradescope/.env`; never commit or paste live keys into GitHub. This build is local-first, CI tested with mocked providers and **not yet live-provider/browser accepted**.

---

# TradeScope v0.22 — Evidence-Backed Economic Transmission Lab

**New:** [Economic Transmission Lab](transmission-lab.html) · [v0.22 evidence & validation guide](docs/V022_TRANSMISSION_LAB.md) · [Source Control Center](source-control.html) · [Unified draft PR #19](https://github.com/sid-cha/ResearchOS/pull/19).

The next research increment connects the existing climate/economic hypothesis graphs to **source-linked retrospective and current context** from NASA POWER, EIA v2, USDA FAS, UN Comtrade, locally transcribed USGS observations, GDELT candidates and SEC issuer business activity. Node inputs are labelled research context; **all causal edges remain unverified**. A separate NOAA CPC historical mode excludes later-revised economic/weather values so it cannot silently leak future information into historical tests.

Open `http://127.0.0.1:8000/transmission-lab.html` after `npm start` (or your configured `PORT`). Existing commodity, market and source diagnostics modules are preserved. Actual provider keys, browser acceptance, publication-vintage checks and issuer-level impact validation remain pending.

---

# TradeScope v0.21 — Data Source Control Center

**New:** [Source Control](source-control.html) · [v0.21 integration guide](docs/V021_PROVIDER_SOURCE_CONTROL.md) · [Six-agent concept and external repository research backlog](docs/V018_PRIORITIZED_BACKLOG.md). The EIA integration now uses v2 endpoints. This is a **local pilot**, not production-grade provider monitoring; source checks run only on user request. Live API credentials remain local and are not tested by CI.

---

# TradeScope v0.20 — Original Market Research Workspace

**New:** [Market Data workbench](market-hub.html) · [v0.20 technical guide](docs/V020_MARKET_RESEARCH_WORKSPACE.md) · [Cumulative PR #19](https://github.com/sid-cha/ResearchOS/pull/19).

TradeScope now offers an original, responsive light/dark stock-and-market research interface informed by the supplied Macrotrends, Koyfin and ETF sector table *UX patterns*. Tabs: **Market Overview**, **Stock Dashboard**, **Compare**, **Financials**, **Watchlists**, **Screener**, **ETF Themes** and **Macro**. The implementation uses existing registered SEC research identities, source-labeled Alpaca IEX completed-session daily bars, and FRED current-revision macro observations. Unavailable provider data is not replaced with synthetic values.

`http://127.0.0.1:8000/market-hub.html` after `npm start` (or change `PORT`). Configure `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`, `SEC_USER_AGENT` and `FRED_API_KEY` for corresponding live sources. The new research UI **supplements rather than replaces** the v0.19 commodity disruption application and existing surveillance terminal. It is not a source of consolidated real-time quotes, 5,000-stock screening or validated ETF holdings, and has not yet been live-provider/browser-accepted.

---

# TradeScope Commodity Intelligence — Focused v0.19 Research Pilot

**Current development:** [PR #19](https://github.com/sid-cha/ResearchOS/pull/19) on `feature/tradescope-v018-unified-development`; no changes merged to `main`.

The new [Commodity Intelligence workbench](commodity.html) is the narrow user-facing product experiment. **M1** previews and captures official Federal Register fertilizer regulatory-document keyword matches; **M2** presents source-anchored nutrient business activity for MOS, CF and IPI, with optional original SEC excerpt retrieval; **M3** prepares downloadable source-attributed briefs and analyst review history; **M4** adds local scheduled watches and self-reported design-partner metrics.

Open **`http://127.0.0.1:8000/commodity.html`** after `npm start`. Use `SEC_USER_AGENT` with an actual contact address for SEC excerpt verification; other third-party services have separate credentials. The official Federal Register discovery endpoint is keyless but requires network access. Panel **06 / Fundamentals & trade evidence** adds optional server-side sources — GDELT media candidates, EIA natural gas, UN Comtrade trade totals, USDA FAS PSD crops and a USGS transcribed-statistics capture ledger (keys: `EIA_API_KEY`, `USDA_FAS_API_KEY`, `COMTRADE_SUBSCRIPTION_KEY`; see [.env.example](.env.example) and the [v0.19 guide](docs/V019_COMMODITY_PILOT_M1_M4.md)).

**Critical boundaries:** A source keyword match does not prove a trade or supply disruption; an SEC issuer-to-commodity link does not establish loss, supplier dependence or share-price sensitivity; no research-time savings, paying customers or predictive efficacy have been independently verified. This remains a local single-user prototype, not a public web service.

Read the [M1–M4 implementation and acceptance guide](docs/V019_COMMODITY_PILOT_M1_M4.md), the [prioritized backlog](docs/V018_PRIORITIZED_BACKLOG.md), and the [release-validation gate](docs/STACKED_RELEASE_VALIDATION_GATE.md).

---

# TradeScope AI — ResearchOS Unified Development (v0.6–v0.18)

> **Current development source:** [cumulative draft PR #19](https://github.com/sid-cha/ResearchOS/pull/19), branch `feature/tradescope-v018-unified-development`. All earlier TradeScope PR heads were verified as included in this branch and their drafts closed as superseded. **Nothing has been merged into `main`**; full historical/live-source and browser validation is intentionally deferred.

**Newest research pilots (v0.10–v0.18):** issuer discovery and saved archives; SEC regulatory and thematic evidence; signals, IEX daily/intraday charts; Crisis & Climate Atlas; ALFRED as-of macro snapshots; retrospective warning replay; optional licensed long-history SPY outcomes; NOAA CPC historical ENSO issue-date evidence; conditional climate-to-industry transmission graphs; **NASA POWER monthly point precipitation/temperature history** with received-snapshot SHA-256 receipts.

These are **scoped development capabilities**, not production-verified financial predictions. NASA POWER values are retrospective currently revised point-model observations, not regional averages or point-in-time issued climate forecasts. A cited graph edge is not verified company exposure or estimated market impact.

**Current source-of-truth documents:** [prioritized backlog](docs/V018_PRIORITIZED_BACKLOG.md), [geographic climate evidence](docs/V018_GEOGRAPHIC_CLIMATE_EVIDENCE.md), [typed economic transmission](docs/V018_TRANSMISSION_GRAPH.md), [unified branch/release gate](docs/V018_UNIFIED_DEVELOPMENT.md), and [comprehensive validation checklist](docs/STACKED_RELEASE_VALIDATION_GATE.md).

---

# TradeScope AI v0.9 — Monitoring, Market Atlas and Optional Research Storage

**Status:** Local-first research workstation with server-side IEX streaming, snapshot fallback, investigations and professional light/dark workspaces. Authenticated live streaming requires local provider verification; this is **not** an institutional surveillance release or public licensed data product.

Built as the `apps/tradescope` bounded-context prototype in [ResearchOS](https://github.com/sid-cha/ResearchOS). The synthetic trade blotter, historical-trade playback, and IEX snapshot API remain available. Event Intelligence includes corporate news, SEC filings, fundamental financial data, natural hazards, geopolitical media coverage, technical indicators, and benchmark-relative event studies.

The **RESEARCH** workspace includes 65 metric definitions, explainable conditions, saved screens, persistent research alerts, an extractive SEC filing reader and historical earthquake comparisons. It now adds **MARKET ATLAS**, **LOCAL MONITORING** and explicit synchronization with an optional local Java/PostgreSQL research API. Availability depends on actual provider inputs; unsupported metrics stay unavailable. See [feature status and where to find each tool](docs/FEATURE_STATUS.md).

The [monitoring, Atlas and storage guide](docs/MONITORING_ATLAS_STORAGE.md), [foundation implementation](docs/RESEARCH_INTELLIGENCE_FOUNDATION.md) and [requirements mapping](docs/NEXT_RESEARCH_INTELLIGENCE.md) distinguish delivered features from the broader roadmap. The [official-platform research comparison](docs/PLATFORM_RESEARCH_2026-11-12.md) records external references and their practical implications.

## Quick start — Windows PowerShell

```powershell
cd apps/tradescope
node --version       # 22.16+ required
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env         # replace API credentials and SEC contact address
npm start
```

Open **http://127.0.0.1:8000**, click **RESEARCH**, select a company and choose **LOAD COMPANY RESEARCH**. Use **MARKET ATLAS** to load selected pilot returns and comparisons. Save criteria in **SCREENER**, then copy them into **LOCAL MONITORING** and explicitly enable a schedule. **EVENT INTELLIGENCE** retains news, hazards and earlier event studies. With no keys, Monitor opens a labeled synthetic replay; Research reports missing inputs. SEC requires a declared `SEC_USER_AGENT` with a real contact email. Alpaca News, market indicators and event outcomes require Alpaca paper-data keys. Run `npm test` (zero npm dependencies).

When updating a ZIP installation, stop the old server, extract the new ZIP into a new folder, and copy your local `apps/tradescope/.env` and `apps/tradescope/.local-data/` into the new installation before starting it. This preserves cases, screens, alerts and monitor configurations. Enabled monitor schedules resume with the local server; overdue runs are coalesced rather than replayed. A Git checkout can switch branches in place; these local files are ignored by Git.

Do **not** open `index.html` directly when testing actual APIs; use the local Node server. Its API binds to loopback by default. Do not expose the server to the public internet without authentication, per-user rate limits, licensing review and other security work.

## API secrets, local development, and Vercel deployment protection

**Do not commit Alpaca key IDs or secrets, even to a private repository.** Create a local-only `.env` from `.env.example` and paste your **rotated** paper-account credentials there. Key IDs and secrets use `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`. The paper-trading endpoint (`https://paper-api.alpaca.markets/v2`) is for order/account APIs; this read-only research app sends market-data requests to `https://data.alpaca.markets`.

Defense in depth:
- `.gitignore` excludes `.env` and `.env.*` (except the harmless template).
- `.vercelignore` excludes environment files from **Vercel CLI** uploads; that configuration does **not** protect arbitrary manually created ZIP archives.
- The local HTTP server serves only an explicit list of public assets, so `.env` cannot be requested over HTTP.
- `npm run build:static` generates **only** sixteen allowlisted HTML/CSS/JS files into `dist/`; it never packages `.env`, server source, or secrets. **Deploy the `dist/` content only for a static UI preview**, not the entire project directory.
- This static demo cannot execute the local `/api` endpoints. To offer live data on Vercel, deploy a secured backend, store credentials in server-side environment variables, and review market-data licensing and access controls first.

On Windows PowerShell, create and edit the local credentials file:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm test
npm run build:static
```

Never share the real `.env` file or include it in screenshots, bug reports, downloadable ZIPs, or Vercel Drop uploads. If a key was exposed in a conversation or log, revoke/rotate it in Alpaca before continuing.

## v0.9 — Monitoring, Market Atlas and Optional Storage

- **Local Monitoring:** copy a saved screen and its revision into an immutable monitor, choose one to ten symbols and a 5–1,440 minute interval, then explicitly enable it. A single scan runs at a time while the local Node server is open. Run summaries, next due times and scheduler health remain visible; resulting conditions use the existing saved-alert lifecycle. No OS service or external notification delivery is installed.
- **Market Atlas:** sourced 1/5/20/63-session returns, SMA trend breadth, RSI and relative volume for the requested pilot instruments, with eligible counts and equal-weight display-category averages. Up to five selected instruments can be compared on aligned base-100 price curves over 20 or 63 sessions. Missing/stale inputs are excluded, and categories do not represent full sectors.
- **Optional Java/PostgreSQL storage:** an authenticated loopback bridge explicitly saves calculated instrument/metric snapshots through a separate versioned API and Flyway tables. The shared token stays in local server configuration. Node continues working when Java is disabled or unavailable; screens, alerts, monitors and investigations keep their local JSON stores.
- **Review correction:** a new condition observation suppressed during a resolved alert's cooldown remains eligible to create an alert when that cooldown ends.

See [setup and delivery limits](docs/MONITORING_ATLAS_STORAGE.md) and [executed verification](docs/V09_VERIFICATION.md). Full-market classifications/constituents, external notifications, full Java workflow migration, macro/consensus/options/ownership datasets, verified event exposures and calibrated forecasts remain pending.

## v0.8 — Research Intelligence Foundation

- **Company Research:** 33 technical/price and 32 financial/valuation definitions, with units, method, fiscal dates, source, readiness and explicit missing reasons. Longer completed-session history supports SMA200, EMA, momentum, volatility, volume and return metrics; SEC facts support conservative cash-flow, balance-sheet, profitability and valuation calculations.
- **Signals:** nine manual research rules show ready, triggered, warming-up and unavailable results. Saved alerts support acknowledgement, resolution, cooldown and investigation capture. This is manual evaluation, not an unattended alert service.
- **Screener:** three presets and editable saved conditions evaluate up to the ten pilot symbols. Every result includes condition evidence. Saved criteria and alerts use `.local-data/research.json`, optionally changed with `RESEARCH_STORE_PATH`.
- **Filing Reader:** supported SEC 8-K/10-Q/10-K sections, extractive summaries and linked passages; no economic occurrence time is inferred from a filing date.
- **Historical Analogues:** bounded regional USGS earthquake comparisons with explained similarity, followed by available 1/5/20-session security-versus-SPY returns. Similarity is not a probability; the tool does not infer issuer exposure or forecast political, social or economic impacts.
- **Review safeguards:** stale report/price guards, compatible fiscal periods and revenue scopes, unknown values preserved, bounded same-origin APIs, whitelisted case evidence, and a shared investigation/assistant store.

This describes the v0.8 delivery boundary. Subsequent monitoring, Atlas and optional snapshot storage are documented above; see the [v0.8 verification report](docs/V08_VERIFICATION.md) for its original executed checks.

## v0.7 — Market Data Integrity

- **LIVE IEX streaming:** one server-owned, authenticated WebSocket connection at the fixed Alpaca IEX endpoint serves the ten-symbol pilot. The browser connects through same-origin `GET /api/stream` SSE. Authentication and full trade/quote/bar subscription acknowledgement precede observation delivery; no credentials reach clients.
- **Canonical events:** schema-v1 trade, quote and bar envelopes preserve provider identity, venue where supplied, original event-time precision, backend receipt and ingestion clocks, and quality metadata. Missing source fields stay unknown. Bars are normalized and counted without being presented as individual trades in the blotter.
- **Integrity and lifecycle:** bounded recent-event deduplication, out-of-order tracking, exponential reconnect backoff with jitter, handshake deadlines, bounded client buffering, heartbeats and disconnect cleanup. Browser delivery has no guaranteed replay or complete gap count.
- **Explicit fallback:** `/api/live` snapshot polling remains available every 15 seconds while streaming is unavailable. Each selected observation identifies its transport and provenance; a successful HTTP request does not establish freshness. DEMO remains synthetic and HISTORY retains separate IEX/SIP labels.
- **Feed health:** provider/feed, single-venue scope, connection/transport, exchange and ingestion timestamps, wall-clock age, counters, discarded duplicates and retry status. Quiet/closed markets are not automatically classified as outages; market-session assessment remains unknown.
- **Saved evidence:** explicitly creating an investigation retains whitelisted market provenance and exact source timestamps. This adds no automatic tick recording or licensed event archive.

See [v0.7 requirements, architecture, resource bounds and Windows verification](docs/V07_MARKET_DATA_INTEGRITY.md) and the [executed verification report and changed files](docs/V07_VERIFICATION.md). Node 22.16+ and the local `.env` workflow are preserved, with no runtime dependencies added. Without local Alpaca credentials, authenticated live streaming and provider entitlement remain unverified; automated tests use controlled mock providers.

## v0.6 — Professional terminal and research copilot

- **Dark / light themes:** toolbar toggle, follows OS preference by default, persists user preference in the browser. High-contrast neutral surfaces; cyan is for focus/actions, green/red for signed movement (always accompanied by plus/minus or explicit text), amber for review attention.
- **Comfortable / compact density:** adjust market rows and event/case spacing without rebuilding the app. Switch via the header.
- **Dedicated workspaces:** Monitor, Event Intelligence, and Investigations occupy the same professional desktop shell without a continuous page of unrelated panels. Signals, Blotter and Replay remain market-monitor subviews.
- **Evidence Assistant:** while reviewing a saved investigation, choose Brief / Market & Financials / Evidence Gaps / Sources. Ask a case-scoped question and copy a sourced briefing. The default deterministic analysis uses ONLY saved case context; missing evidence and synthetic data are explicitly identified. It never claims event-to-price causation.
- **Optional generative model:** set `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-6-luna` in the local-only `.env` to enable short model-assisted interpretations of the existing evidence brief. The API key is never sent to the browser. If the model is unavailable, the assistant falls back to the deterministic brief. **The selected evidence brief and user question are sent to the model provider when this is configured**; do not enable it for confidential customer data without a privacy review. This provider integration is covered by mocked tests, not an authenticated production test.
- **API:** `GET /api/assistant/cases/:id/brief?focus=overview|market|gaps|sources` and `POST /api/assistant/cases/:id/ask` (JSON `{ "question": "..." }`). Single-user local scope only.
- **Research-based design:** see `docs/V06_VISUAL_DESIGN.md` for references, palettes, contrast checks and future usability tests.
- **Static preview:** `npm run build:static` contains the theme and assistant interface but not the backend; local case actions and assistant answers need the running Node server.

## v0.5 — End-to-end investigation workbench

The **INVESTIGATIONS** workspace adds a persistent, single-analyst review process on top of v0.4's market-data and company-intelligence features.

- Select an event in **EVENT INTELLIGENCE**, then click **OPEN INVESTIGATION**. Or select a trade/quote in the market blotter and click **INVESTIGATE**.
- Save the event's original source, timestamp fields, symbol relationship, and any observed technical, SEC fundamental or completed-session study values that are already loaded in the event workspace. Synthetic examples are explicitly tagged.
- Track **OPEN**, **IN REVIEW**, **NEEDS EVIDENCE**, **CLOSED** statuses, case priority, analyst, conclusion, and written assessment. A causal finding is never inferred automatically.
- Attach independent source URLs, enter analyst notes, export the case as JSON, and inspect the chronological source/audit timeline.
- Cases persist across local server restarts in **`.local-data/cases.json`**. This path is excluded from Git and Vercel uploads. To use a different local path, set `CASE_STORE_PATH=/absolute/path/cases.json` in `.env`.
- Case updates require matching revision numbers; conflicting writes receive HTTP 409 rather than silently overwriting another update. The store writes atomically to a temporary file before renaming.

API routes: `GET/POST /api/cases`, `GET/PATCH /api/cases/:id`, `POST /api/cases/:id/notes`, `POST /api/cases/:id/evidence`, and `GET /api/cases/:id/export`.

**Boundary:** This is a local, single-user JSON store for product validation, not PostgreSQL multi-user case management. No authentication, workflow automation, facility exposure inference, automated misconduct determination, or validated event-causation model is implemented. A static Vercel frontend will render the UI, but case actions require a deployed backend; no local case history is uploaded to Vercel.

**Suggested manual smoke test:** `npm start` → EVENT INTELLIGENCE → select synthetic scenario → OPEN INVESTIGATION → edit assessment → save note and evidence → restart server → INVESTIGATIONS → reopen case → export JSON. Run `npm test` for repeatable backend API, persistence and regression checks.

## Sprint 1 — Company, news, filings and fundamentals

- `/api/intelligence/news?symbol=AAPL`: Alpaca News (timestamped linked headlines and original article URLs).
- `/api/intelligence/filings?symbol=AAPL`: recent SEC EDGAR 10-Q, 10-K and 8-K filing records and canonical links.
- `/api/intelligence/fundamentals?symbol=AAPL`: SEC companyfacts/XBRL standard US-GAAP revenue, net income, gross/operating profit, diluted EPS, prior-year comparators, quarterly/annual margins, as reported. Returns **null** for unavailable metrics rather than guessing values. The accounting parser only selects valid period-length facts and excludes future-filed facts.
- Supported individual-company mappings (static CIK allowlist): AAPL, NVDA, MSFT, TSLA, AMD, META, AMZN, PLTR. SPY/QQQ do not have company quarterly-filing reports in this scope.

## Sprint 2 — Natural and geopolitical events

- `/api/intelligence/hazards?source=all`: USGS M4.5+ past-week earthquakes and NASA EONET past-30-day active/recent natural events, normalized and source-tagged.
- `/api/intelligence/geopolitics?topic=sanctions|conflict|supply`: fixed-query GDELT article discovery (media coverage rather than authoritative proof of an event).
- Event inspector shows source, published vs occurred time, linked securities **only when provided by the data source**, and source URL. Natural hazards are **not automatically** linked to a company; real exposure requires independent facility/supplier GIS data.

## Sprint 3 — Quantitative and fundamental interpretation

- `/api/intelligence/technicals?symbol=AAPL`: Alpaca **IEX** daily price bars and derived SMA20, SMA50, RSI14, MACD(12/26/9), ATR14, 20-session relative volume, and EWMA one-session volatility baseline. The baseline includes past-only walk-forward error measurements; **not a trained directional-price predictor**.
- `/api/intelligence/impact?symbol=AAPL&eventTime=2026-10-02T14:00:00Z`: conservative daily close-to-close comparisons for 1, 3 and 5 completed sessions following a past event against SPY on aligned market sessions. Includes daily volume comparisons, data coverage, and limitations; **does not infer causal impact**. Insufficient data returns an explicit status rather than fabricated numbers.
- Event Intelligence UI supports selecting events, filters, source evidence, comparison analysis, technical/fundamental snapshots, filing drilldowns, and fallback demo scenarios.

## API and data provenance guarantees

- Alpaca keys remain server-only; **no credentials are sent to the browser**.
- Event feed URLs and source hosts are fixed and controlled (no arbitrary URL fetch or open proxy); symbol/topic enumerations are allowlisted.
- SEC calls are throttled (400 ms minimum between starts per local process), cached, and use a caller-specified declared User-Agent. Upstream data is not stored in the repo.
- Event ingestion retains `occurredAt`, `publishedAt`, `providerFirstSeenAt` (when available), and `ingestedAt`; fields not provided by a source remain `null`.
- SEC filing facts preserve report period and filing date. CIK mappings are a starting allowlist and must be periodically reconciled.
- Browser rendering escapes untrusted headline/body text, only opens HTTP(S) source URLs, and uses same-origin APIs.
- IEX market coverage is single-venue. Daily studies are descriptive approximations, not full consolidated-market attribution.
- The static Vercel demo cannot run these server-side adapters without a separately deployed, secured API and provider redistribution rights. The connected Hobby Vercel workspace may not allow commercial usage.

## Test and troubleshooting

```bash
npm test
curl http://127.0.0.1:8000/api/health
```

- Missing `APCA_API_KEY_ID` or `APCA_API_SECRET_KEY` → real news, indicators and studies return a deliberate 503.
- Missing `SEC_USER_AGENT` → SEC fundamentals and filings return a deliberate 503.
- HTTP 429 / provider timeouts → try after the provider limit; source data is cached briefly.
- `No data` / `insufficient_data` → the date/entitlement/session may not have corresponding completed bars.
- Company fundamentals for ETFs → unsupported by design, not a data error.

## Next production gates

Real company exposure graph (facilities / suppliers / commodities), normalized persisted event times, source licensing, cash-equity adjustment, full historical news, robust holiday/session calendars, data quality/error monitoring, structured alert lifecycle, authorized enterprise integrations, holdout validation of any ML model, and regulatory/commercial compliance review.

## v0.10 regulatory and public-tax pilot (review branch only)

Public SEC filings, cited audit-related disclosures and annual XBRL tax metrics are available from the **local Node API**, not yet as a released multi-user compliance UI:

- `GET /api/regulatory/tax?symbol=AAPL&asOf=2026-11-12`
- `GET /api/regulatory/filings?symbol=AAPL`
- `GET /api/regulatory/filing-analysis?symbol=AAPL&accession=...`
- `GET /api/regulatory/alerts?symbol=AAPL`
- `GET /api/regulatory/archive?symbol=AAPL`

Local capture via `POST /api/regulatory/capture` is disabled by default; it requires `REGULATORY_LOCAL_CAPTURE_ENABLED=true` in your **local-only** `.env` and enforces loopback/same-origin conditions. This is not account authentication, and it is **not safe to make available publicly**. SEC primary-document access also requires `SEC_USER_AGENT`.

See [v0.10 tax/audit scope](docs/V010_REGULATORY_TAX_FOUNDATION.md) and [authentication/ResearchOS architecture](../../docs/RESEARCHOS_AUTH_AND_REGULATORY_ARCHITECTURE.md). Corporate tax returns remain confidential; the API analyzes only official public financial-statement disclosures. Full v0.10 integration and suite verification are pending.


## v0.10 — Issuer Discovery, Watchlists and Immutable Case Evidence (draft)

Research → **Issuer Discovery** provides SEC issuer-directory search, sourced registration,
locally saved watchlists, public company financial statements, recent SEC filing analysis,
and source-cited 8-K disclosure classification. Where local capture is explicitly enabled,
an analyst can save a normalized SEC event revision with its actual system-observed time,
inspect exact historical versions, and create an investigation containing that **immutable
revision** (hash, accession, capture timestamp and supporting excerpts).

This extension preserves the original ten-symbol IEX live monitor, separate ResearchOS
pilot screener/Atlas, historical replay and pre-existing case records. Registered non-pilot
issuers currently gain **SEC fundamentals and filing research**, not automatic IEX
subscriptions or broad-market scanner coverage.

Source-backed local capture requires `REGULATORY_LOCAL_CAPTURE_ENABLED=true` in the
private local `.env` plus a valid `SEC_USER_AGENT`; the capture and case-handoff
POST endpoints require loopback and same-origin. They are **not public SaaS authentication**
and must not be hosted for external users. No login/signup has been implemented yet.

Details, APIs, evidence invariants, caveats and the manual walkthrough:
[Discovery / archive / investigation workflow](docs/V010_DISCOVERY_ARCHIVE_CASE_WORKFLOW.md).

## v0.13 — Monitor Completed Daily Candles (draft)

In MONITOR → PRICE & ACTIVITY, LIVE and HISTORICAL TRADES modes now display
**completed-session 1-day IEX candlesticks** for the selected pilot security,
with 20/60/120/250-session windows, historical OHLCV/volume, SMA20/SMA50,
and relative daily volume where available. The last observed LIVE trade price
remains separate from the last completed historical daily close.

The historical chart is served by the local Node API, not the static preview,
and requires working server-side Alpaca credentials/entitlements. It cannot
manufacture intraday candles from sparse REST snapshots. DEMO replay retains
its synthetic chart. No ML probability or consolidated-market claim is made.

Run `npm test` and `npm start` from this folder. Detailed architecture and
acceptance notes: [v0.13 monitor chart documentation](docs/V013_MONITOR_DAILY_CANDLES.md).

Draft PR #14 remains unmerged; real-provider and interactive-browser review
are outstanding, despite passing CI. The source ZIP is a review build, not a
packaged release.
