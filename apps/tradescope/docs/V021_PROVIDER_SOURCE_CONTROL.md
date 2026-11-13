# TradeScope v0.21 — Provider Reliability & Source Control Center

**Development:** `feature/tradescope-v018-unified-development` / [PR #19](https://github.com/sid-cha/ResearchOS/pull/19), still draft and not merged into `main`.

## Delivered increment

### EIA API v2 migration

The fertilizer research pipeline previously called deprecated EIA v1 `/series/`. The v0.21 code now uses:

- **Henry Hub monthly gas spot:** fixed, official `https://api.eia.gov/v2/natural-gas/pri/fut/data/` with `frequency=monthly`, `data[0]=value`, `facets[series][]=RNGWHHD` and bounded sorting/length.
- **U.S. dry gas production:** `https://api.eia.gov/v2/seriesid/NG.N9070US2.M`, using the documented v2 SeriesID compatibility route until native hierarchical metadata is confirmed with a real EIA API response.
- **Output source marker:** `EIA_API_V2`, `apiVersion=v2` and route/method provenance. Explicit missing values, future-period rejection, bounded rows, de-duplication and upstream mismatch checks.
- **Security:** `EIA_API_KEY` is read on the server only, never exposed in public HTML, API responses, static files or source-control status.

EIA v2 docs: https://www.eia.gov/opendata/documentation.php

**Remaining EIA validation:** Real response checks with a user API key (especially the dry-gas v2 SeriesID bridge), actual time-series availability, unit/release/seasonality reconciliation and entitlement review. Do not treat mocked-API tests as verification of upstream data.

### Source Control Center

Open **`http://127.0.0.1:8000/source-control.html`** with the local Node server running (replace `8000` with `PORT` if changed). Available through the Terminal, Market Data and Commodity Intelligence navigation.

- `GET /api/provider-control/catalog`: public-safe configured/unconfigured flags and latest observed in-process result for fourteen named sources. Returns configuration **names**, not credential values.
- `POST /api/provider-control/probe` with JSON `{"id":"eia"}`: **explicitly requested** single-source check for supported existing integrations (Alpaca, SEC, FRED, EIA, USDA, Comtrade, GDELT, Federal Register). Cross-origin request headers are rejected. Provider-level timeouts, response shape and upstream entitlements apply.
- Status values: `NOT_IMPLEMENTED`, `NOT_CONFIGURED`, `NOT_PROBED`, `SUCCESS`, `EMPTY`, `FAILED`. Failure categories distinguish rate limit, timeout, access/configuration or other upstream/schema failures. A failure **does not** erase the previous successful source date.
- The browser displays source categories, credential names, status chips, observed record counts and an in-memory, bounded attempt history. No automatic upstream polling on page load and no secret/token content in status responses.

**Limits:** In-memory status history is lost when the Node server restarts; this is not a durable audited operational ledger. The collector does **not** confirm source-license rights, current freshness SLAs, historical original release times or market correctness. NOAA CPC, NASA POWER and EODHD source summaries are listed but their live probes are **not implemented**; USGS is a locally transcribed research capture rather than an automated official-data feed. NVIDIA is a planned model provider, **not yet connected**.

The page is designed for locally bound `127.0.0.1` research development and lacks user authentication; **never deploy this API publicly as-is**.

### Credentials and keys

| Integration | Local `.env` configuration | Needed now? |
|---|---|---|
| Federal Register, GDELT, UN Comtrade preview | None for documented preview routes | No |
| SEC original issuer text | `SEC_USER_AGENT` (actual contact address) | Yes for SEC calls |
| Alpaca IEX | `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY` | Yes for live market data |
| FRED and ALFRED | `FRED_API_KEY` | Yes |
| EIA v2 | `EIA_API_KEY` | Yes for v0.21 live EIA check |
| USDA PSD | `USDA_FAS_API_KEY` | Yes |
| UN Comtrade registered quota | `COMTRADE_SUBSCRIPTION_KEY` | Optional |
| EODHD historical 2008 prices | `EODHD_API_TOKEN` plus `EODHD_INTERNAL_RESEARCH_ENABLED=true` | Optional licensed research |
| NVIDIA NIM API Catalog | Future `NVIDIA_API_KEY` | **No — deferred Agent Desk** |
| ECC and Jane Street GitHub OSS | None for reading public repositories | No |

Create `apps/tradescope/.env` from `.env.example` and fill your values on your own machine, not in chat/GitHub issues or browser JavaScript. An empty/missing key appears as `NOT_CONFIGURED`. **Some hosted model trial calls are free/limited, not guaranteed unlimited free production inference.**

## Deferred multi-agent Research Desk

The concept and six agent roles are recorded in [V018_PRIORITIZED_BACKLOG.md](V018_PRIORITIZED_BACKLOG.md). No NVIDIA model invocation, agent execution or multi-agent UI is implemented in this sprint. ECC remains a developer workflow review candidate, not a runtime dependency; Jane Street OSS is an engineering reference, not proprietary financial data.

## Verification

```powershell
cd apps/tradescope
npm test
npm run build:static
$env:PORT="8001"
npm start
```

Open `http://127.0.0.1:8001/source-control.html`. Initial states must read `NOT_PROBED` or `NOT_CONFIGURED`, and probe buttons must remain disabled when unsupported or missing credentials. Click an eligible provider explicitly and verify success/empty/failure distinctions. Test each configured source with actual provider credentials **without exposing them**.

Unit/API/static build CI uses controlled fixtures. Production and real-provider browser acceptance remain pending, and cumulative PR #19 must stay unmerged until release gates pass.
