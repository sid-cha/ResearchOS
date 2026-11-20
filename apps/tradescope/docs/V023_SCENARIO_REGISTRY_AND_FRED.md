# TradeScope v0.23 — Generalized Scenario Registry and FRED Source Explorer

**Development branch:** `feature/tradescope-v018-unified-development` · **Review:** [Draft PR #19](https://github.com/sid-cha/ResearchOS/pull/19) · **Status:** local research pilot, not merged into `main`.

## Delivered v0.23 architecture

The existing three hand-coded v0.22 graphs are now preserved as curated definitions in a **versioned, validation-enforced scenario registry** (`lib/scenario-registry.mjs`). `lib/transmission-graph.mjs` and `lib/transmission-dossier.mjs` both use this shared registry, eliminating duplicated and disagreeing lists of supported scenarios.

The registry contains **12 cross-industry hypothesis templates**. It validates type ontology, directed topological stages, IDs, duplicate nodes/edges, allowed data-source references and regional/provider scope. Definitions cannot inject arbitrary remote URLs or trigger unconstrained provider calls.

### Coverage by current maturity

| Scenario | Classification | Current analysis status |
| --- | --- | --- |
| ENSO → fertilizer | Climate | `RESEARCH_CONTEXT` (NASA, official dated NOAA/commodity context) |
| Wildfire → insurance/rebuild | Natural hazard | `RESEARCH_CONTEXT` (meteorological point context only) |
| Snowpack → hydropower | Climate | `RESEARCH_CONTEXT` (rain/temp not misrepresented as snow-water equivalent) |
| Drought → agriculture | Climate | `DATA_PARTIAL` (NASA point rainfall/temp, not measured drought) |
| Natural gas → fertilizer input costs | Energy | `DATA_PARTIAL` (EIA v2 Henry Hub series) |
| Sanctions → commodity trade | Geopolitics | `TEMPLATE_ONLY` |
| Hurricane → infrastructure | Natural hazard | `TEMPLATE_ONLY` |
| Earthquake → industrial facility | Natural hazard | `TEMPLATE_ONLY` |
| Mineral supply concentration | Commodities | `TEMPLATE_ONLY` |
| Maritime chokepoint | Shipping | `TEMPLATE_ONLY` |
| Credit/liquidity/refinancing stress | Credit | `TEMPLATE_ONLY` |
| Public-health supply shock | Health | `TEMPLATE_ONLY` |

**A template is a bounded, directional causal research hypothesis, not a connected pipeline, verified event, inferred trade or forecast.** The new UI displays availability and allows filtering scenarios by event class and keywords. It does not manufacture source observations for template-only cases.

**Legacy compatibility:** `/api/transmission/catalog`, `/api/transmission/graph`, `/api/transmission-dossier/catalog` and `/api/transmission-dossier/analysis` remain available. The original three scenario IDs and graph semantics are preserved. The public `schemaVersion:1` response is retained and `registryVersion:scenario-registry-v1` is added. Historical as-of remains limited to original issue-dated ENSO archive material; adding an event definition does **not** make an historical forecast.

### Next critical engine gates

- Evidence ledger: immutable release/first-seen/fetched clocks, source revisions, geography and canonical entity identifiers
- Proper temporal joins, matching issuer facilities/counterparties, licensed data and source evidence
- Real measured effect sizes, lag measurement and false-discovery testing; abstain when not validated
- Durable data storage and repeatable incremental graph updates before automated agents

## New FRED/ALFRED research service

Open `http://127.0.0.1:8000/fred-research.html` or use the configured local `PORT`. It is a **server-side** source explorer backed by `lib/fred-explorer.mjs`. Client JavaScript never receives the FRED key, constructs provider URLs or directly accesses FRED.

Supported bounded official research endpoints:

| TradeScope local route | Official provider endpoint | Use |
| --- | --- | --- |
| `/api/fred-explorer/search?q=credit%20spread` | `/fred/series/search` | Find series and titles by phrase |
| `/api/fred-explorer/series?id=T10Y3M` | `/fred/series` | Units/frequency and observation coverage |
| `/api/fred-explorer/vintages?id=UNRATE` | `/fred/series/vintagedates` | Dates when series values were revised or added |
| `/api/fred-explorer/release?id=UNRATE` | `/fred/series/release` | Corresponding source release IDs |
| `/api/fred-explorer/releaseDates?releaseId=10` | `/fred/release/dates` | Historical release calendar; publisher date may differ from availability on FRED |
| `/api/fred-explorer/observations?id=T10Y3M&asOf=2020-02-15&months=18` | `/fred/series/observations` | Real-time period `realtime_start=realtime_end=2020-02-15` for historical calendar-day observations |

The service restricts all provider requests to `https://api.stlouisfed.org`, sets `file_type=json`, limits response size, enforces timeouts and masks upstream authentication errors. It does **not** verify intraday dissemination or historical original website revisions. Series releases and vintage dates are different concepts; a release calendar date does not guarantee it was available via FRED on that date.

Authoritative documentation:
- https://fred.stlouisfed.org/docs/api/fred/
- https://fred.stlouisfed.org/docs/api/fred/series_search.html
- https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html
- https://fred.stlouisfed.org/docs/api/fred/realtime_period.html
- https://fred.stlouisfed.org/docs/api/fred/release_dates.html

FRED API v2 supports bulk release observation downloads; those specialized APIs are not yet needed by the bounded single-series research explorer.

## Credentials — placeholders only

The user supplied secrets in chat. They were **not copied into the repository or used to authenticate any upstream sources**. Rotate/reissue those disclosed tokens before use. Put fresh values only in your local, ignored `apps/tradescope/.env`:

```dotenv
FRED_API_KEY=replace_with_rotated_fred_key
EIA_API_KEY=replace_with_rotated_eia_key_after_activation
USDA_FAS_API_KEY=replace_with_rotated_api_data_gov_key
COMTRADE_SUBSCRIPTION_KEY=replace_with_rotated_comtrade_primary
# COMTRADE_SUBSCRIPTION_KEY_SECONDARY=replace_with_rotated_backup_key
# NVIDIA_API_KEY=replace_with_rotated_nvidia_key_for_future_agent_desk
```

EIA verification/activation links are **not** EIA API keys: complete registration and obtain the actual key locally. Comtrade secondary is reserved as a **manual backup** and is not automatically cycled to bypass quotas. NVIDIA is a future inference adapter, not a v0.23 connector; no agent executes as part of this build.

## Local validation of v0.21–v0.23 together

```powershell
cd apps/tradescope
npm test
npm run build:static
$env:PORT='8001'
npm start
```

- `http://127.0.0.1:8001/source-control.html` — manually check configured providers and observed dates; no automatic polling
- `http://127.0.0.1:8001/transmission-lab.html` — choose among 12 scenarios; verify maturity labels, template abstention, EIA partial gas source and prior ENSO/wildfire/snow workflows
- `http://127.0.0.1:8001/fred-research.html` — search FRED, choose series, show metadata, vintage dates, releases and historical as-of samples
- `http://127.0.0.1:8001/market-hub.html` — ensure original equity, ETF, financial and macro cards still load

CI is run using controlled mocks. Live credential-based provider smoke tests, license review, browser end-to-end checks and real release-timing validation are **not** implied by a passing test suite. Keep PR #19 in draft until the user completes the joint release acceptance.
