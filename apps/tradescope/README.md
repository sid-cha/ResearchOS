# TradeScope AI v0.4 — Event Intelligence + Market Surveillance Workstation

**Status:** Three vertically integrated research sprints; local preview, **not** an institutional surveillance release or public licensed data product.

Built as the `apps/tradescope` bounded-context prototype in [ResearchOS](https://github.com/sid-cha/ResearchOS). The prior synthetic trade blotter, historical-trade playback, and IEX snapshot polling remain intact. New Event Intelligence adds corporate news, SEC filings, fundamental financial data, natural hazards, geopolitical media coverage, technical indicators, and benchmark-relative event studies.

## Quick start — Windows PowerShell

```powershell
cd apps/tradescope
node --version       # 22.16+ required
Copy-Item .env.example .env
notepad .env         # replace API credentials and SEC contact address
npm start
```

Open **http://127.0.0.1:8000**, click **EVENT INTELLIGENCE**, and use the source buttons. With no keys, the app opens an obviously labeled synthetic scenario, and USGS/NASA/GDELT may be queried independently. SEC requires a declared `SEC_USER_AGENT` with a real contact email. Alpaca News, indicators and event studies require Alpaca paper-data keys. Run `npm test` (zero npm dependencies).

Do **not** open `index.html` directly when testing actual APIs; use the local Node server. Its API binds to loopback by default. Do not expose the server to the public internet without authentication, per-user rate limits, licensing review and other security work.

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
