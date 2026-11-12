# TradeScope AI v0.7 — Market Data Integrity + Evidence-Grounded Research

**Status:** Local-first research workstation with server-side IEX streaming, snapshot fallback, investigations and professional light/dark workspaces. Authenticated live streaming requires local provider verification; this is **not** an institutional surveillance release or public licensed data product.

Built as the `apps/tradescope` bounded-context prototype in [ResearchOS](https://github.com/sid-cha/ResearchOS). The synthetic trade blotter, historical-trade playback, and IEX snapshot API remain available. Event Intelligence includes corporate news, SEC filings, fundamental financial data, natural hazards, geopolitical media coverage, technical indicators, and benchmark-relative event studies.

For the distinction between implemented tools and the proposed screeners, SignalDock-style research, advanced heatmaps and prediction work, see [feature status and where to find each tool](docs/FEATURE_STATUS.md).

## Quick start — Windows PowerShell

```powershell
cd apps/tradescope
node --version       # 22.16+ required
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env         # replace API credentials and SEC contact address
npm start
```

Open **http://127.0.0.1:8000**, click **EVENT INTELLIGENCE**, and use the source buttons. With no keys, the app opens an obviously labeled synthetic scenario, and USGS/NASA/GDELT may be queried independently. SEC requires a declared `SEC_USER_AGENT` with a real contact email. Alpaca News, indicators and event studies require Alpaca paper-data keys. Run `npm test` (zero npm dependencies).

Do **not** open `index.html` directly when testing actual APIs; use the local Node server. Its API binds to loopback by default. Do not expose the server to the public internet without authentication, per-user rate limits, licensing review and other security work.

## API secrets, local development, and Vercel deployment protection

**Do not commit Alpaca key IDs or secrets, even to a private repository.** Create a local-only `.env` from `.env.example` and paste your **rotated** paper-account credentials there. Key IDs and secrets use `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`. The paper-trading endpoint (`https://paper-api.alpaca.markets/v2`) is for order/account APIs; this read-only research app sends market-data requests to `https://data.alpaca.markets`.

Defense in depth:
- `.gitignore` excludes `.env` and `.env.*` (except the harmless template).
- `.vercelignore` excludes environment files from **Vercel CLI** uploads; that configuration does **not** protect arbitrary manually created ZIP archives.
- The local HTTP server serves only an explicit list of public assets, so `.env` cannot be requested over HTTP.
- `npm run build:static` generates **only** twelve allowlisted HTML/CSS/JS files into `dist/`; it never packages `.env`, server source, or secrets. **Deploy the `dist/` content only for a static UI preview**, not the entire project directory.
- This static demo cannot execute the local `/api` endpoints. To offer live data on Vercel, deploy a secured backend, store credentials in server-side environment variables, and review market-data licensing and access controls first.

On Windows PowerShell, create and edit the local credentials file:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm test
npm run build:static
```

Never share the real `.env` file or include it in screenshots, bug reports, downloadable ZIPs, or Vercel Drop uploads. If a key was exposed in a conversation or log, revoke/rotate it in Alpaca before continuing.

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
