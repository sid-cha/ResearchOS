# TradeScope v0.20 — Market Research Workspace (reference-inspired, original implementation)

> **Branch:** `feature/tradescope-v018-unified-development`  
> **Review:** [Cumulative draft PR #19](https://github.com/sid-cha/ResearchOS/pull/19)  
> **Scope:** A reusable research and market-context companion to the existing v0.19 commodity-disruption workflow. **No replacement, overwrite, public launch, or main-branch merge.**

## Design intent

The user supplied design references from Macrotrends Premium, Koyfin's markets overview and Seeking Alpha's ETF themes tables. The new UI adapts their *high-level usability patterns* — clear navigation, compact chart cards, sidebar ticker switching, normalized comparisons, readable annual statements, categorized fund tables and a macro chart wall — into an independently written light/dark TradeScope design. **No third-party HTML, CSS, JS, fonts, subscription data or proprietary site assets were copied.**

Use `http://127.0.0.1:8000/market-hub.html` when running the local Node server (or the configured `PORT`). The top-level terminal links to **Market Data**. Commodity Intelligence also links back to Markets.

## Eight delivered market tabs

| Tab | Local capability | Source and honest boundary |
|---|---|---|
| **Market Overview** | Grouped US equity, US sector, fixed income, global equity and commodity/currency ETF proxies; four quick-reference cards | Completed IEX daily ETF bar closes. **SPY is not the SPX index level; VIX is not silently approximated by an ETP** |
| **Stock Dashboard** | Search/register SEC-mapped companies, switch tickers, reusable chart metric layout, small/medium/large chart grid, local browser save | SEC annual XBRL for fundamentals and split-adjusted IEX daily prices. Only filed-supported metrics available |
| **Compare** | Up to 10 registered tickers; price-return lines normalized to each instrument's first observed price on/after the common start; save selections locally; export raw observed close series | Single-venue IEX, adjusted for splits but **not dividend total return**; missing observations are not interpolated |
| **Financials** | Annual SEC metric grid, fiscal-year headings, line-item chart and CSV download | SEC EDGAR companyfacts with latest filing at or before the requested calendar cutoff; available history varies, no 40-year guarantee |
| **Watchlists** | Read/create/edit/delete via existing revision-checked ResearchOS local issuer watchlists | Registered company symbols only; existing local store, no user accounts or cloud sync |
| **Screener** | Bounded eight seeded equity names filtered by sourced annual revenue, YoY growth and net margin | SEC-only pilot screen, **not 5,124 stocks or 80+ factors**. Missing input means excluded/unknown, never zero |
| **ETF Themes** | 60+ curated US-listed ETF/theme candidates in sector/subsector groups; completed-session close, 1d/5d/1m/YTD/1y/3y split-adjusted price changes, daily/52-week ranges, CSV | `/api/market-hub/series` based on IEX historical bars; no constituents/holdings validation and no live bid/ask |
| **Macro** | 12 registered FRED series in Markets/Rates/Economy/Commodities groups, or all charts together; configurable 1/5/10-year charts | Current-revision FRED, **not historical ALFRED vintage-as-of** or exchange-live feeds |

**Important:** These features have tests with simulated upstream responses, but are not yet browser-tested or live-provider-validated against every supported symbol and entitlement. A successful test suite is not proof of complete data coverage.

## New read-only API

- `GET /api/market-hub/catalog` — curated ETF themes, groups, eight seeded SEC research equities, eligible FRED series, metric definitions, configured-provider flags.
- `GET /api/market-hub/series?symbols=SPY,QQQ&range=1Y` — 1–10 curated ETF or **previously registered** equity ticker symbols. Supported ranges: `1M`, `3M`, `1Y`, `3Y`. Uses Alpaca multi-symbol historical daily bars, `feed=iex`, `adjustment=split`. Handles incomplete current ET session, missing/invalid values, upstream paging limits and missing lookbacks. Provider credentials remain server-side.
- `GET /api/market-hub/financials?symbol=AAPL` — SEC annual XBRL values and fiscal period dates. SEC exact source endpoint is cited; filed-after-asOf facts are excluded if cutoff provided. New issuers must be explicitly registered through the existing discovery API. USD/shares EPS input normalized to USD/share display.
- `GET /api/market-hub/macro?id=DGS10&years=10` — current-revision dated observations from allowed FRED series; server-side `FRED_API_KEY` only.

No flexible arbitrary URL fetch, database queries or server write endpoint is added. Requests remain bounded and the existing site CSP, loopback default and static public-file allowlist are preserved. The new web page stores **layout, theme mode, and comparison selection only** in browser localStorage; saved research watchlists use the pre-existing server-side revisioned store.

## Official dependencies

- `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`: Alpaca market-data credentials required for actual ETF and company bar history. IEX coverage and historical depth depend on the account's entitlements.
- `SEC_USER_AGENT`: app name and contact email for SEC companyfacts, issuer directory search, and registering additional US equities.
- `FRED_API_KEY`: for macro chart history.
- No credential is inserted into public HTML/JS/CSS or static build artifacts.

**Do not embed Macrotrends, Koyfin or Seeking Alpha subscription contents, cached markup or brand graphics** in TradeScope. New ETF/theme returns must be sourced from appropriately licensed APIs and marked unavailable when source coverage or 3-year lookback is insufficient.

## Explicitly out of scope for this increment

- 5,000+ supported fundamentals, 80 screener filters, 40 years of standardized vendor financial history, analyst projections or live index quotes
- ETF live holdings/exposure relationships and ETF total-return/dividend-adjusted calculations
- True intraday / consolidated SIP market data or options chain data
- Yield-curve and market-factor modeling across country bonds with licensed sovereign-yield coverage
- Public hosted multi-user SaaS accounts, subscriptions and enterprise security

The next commercial focus remains the **verified disruption → commodity → company → evidence-backed research brief** workflow. The market workspace makes that analysis easier to navigate, but does not replace the evidence-validation work or justify indiscriminate market-feature expansion.

## Local validation commands

```powershell
cd apps/tradescope
npm test
npm run build:static
$env:PORT = "8001"
npm start
```

Open `http://127.0.0.1:8001/market-hub.html`, inspect all eight tabs and switch to a registered issuer. With credentials set, test saved layouts, 10-stock comparison, the ETF groups (including missing price lookbacks), the FRED charts, and SEC annual fact accuracy. If required providers are unavailable, expect explicit unavailable states, not an auto-generated demo that masquerades as real markets.

As with all research services, confirm historical point-in-time publication/vintage evidence before claiming a predictive signal or backtesting an investment decision.
