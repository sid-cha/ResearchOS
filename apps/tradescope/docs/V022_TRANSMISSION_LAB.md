# TradeScope v0.22 — Evidence-Backed Economic Transmission Lab

**Branch:** `feature/tradescope-v018-unified-development` · **PR:** [#19](https://github.com/sid-cha/ResearchOS/pull/19) · **Release status:** unmerged local research pilot.

## Delivered functionality

New read-only [Transmission Lab](../transmission-lab.html) shows a typed climate/economic mechanism graph, evidence cards, source statuses, node-level inspection and missing-evidence queue. It is an original TradeScope interface, not a derivative of a third-party site.

Three scenario families are **reused** from `lib/transmission-graph.mjs`:

1. `enso-fertilizer` — potential ENSO/weather/crop/fertilizer/supplier/issuer transmission.
2. `wildfire-insurance` — fire weather, damage, insurer/contract exposure, rebuilding.
3. `snow-hydropower` — snowpack, runoff, generation, fuel substitution, farming.

A new `lib/transmission-dossier.mjs` engine composes the established directed hypothesis graph with **contextual source observations**. It never promotes mechanism edges from hypotheses to empirically supported causality, even if both nodes have data.

### Current / retrospective evidence mode

The engine can collect the following existing TradeScope sources, subject to their credentials and upstream availability:

| Input | Node mapping | Important limit |
|---|---|---|
| NASA POWER monthly rainfall/temperature at one **representative model point** | ENSO regional rainfall; wildfire weather proxy | Retrospective model revision, **not** as-of forecast, true regional average, fire-risk metric or snow-water equivalent |
| USDA FAS PSD crop production | Crop production | Revised production estimate, **not** measured fertilizer consumption |
| EIA v2 Henry Hub | Fertilizer industry energy-cost context | Gas input prices, **not** measured issuer margin impact |
| UN Comtrade annual fertilizer flows | Commodity import/trade context | Aggregate annual trade value, **not** prices or individual shipments |
| Locally transcribed USGS mineral statistic | Potash production/supply context | Human-transcribed source attribution, **not** independently verified actual production |
| GDELT media candidates | Context outside the directed graph | Unverified media references, **not** confirmed shocks |
| SEC documented business activities | Fertilizer issuer business-activity node | Disclosure-backed activity, **not** exposure to the event or predicted return |

For snowpack, NASA's rainfall/temperature values appear as **unassigned external context**, not as observed snow-water equivalent. For wildfire, point weather context does not imply a fire occurred or insured property was damaged.

Data from missing providers does not become zero. Individual provider failures are disclosed without suppressing unrelated successful sources.

### Historical issue-dated mode

Only `enso-fertilizer` supports `mode=historical&asOf=YYYY-MM-DD`. The existing NOAA CPC source archive supplies original **issue calendar dates**, but original website-revision and intraday publication times remain unverified.

**Historical mode does not request USDA, EIA, Comtrade, USGS captures, SEC current issuer profiles or NASA POWER.** Revised and annual-period data are deliberately excluded instead of pretending they were historically available to an investor at that cutoff. This is an essential no-lookahead safety boundary, but is not a complete first-available macro historical backtest.

### Output guarantees

- Three bounded scenarios with explicit geography, associated commodity (only ENSO fertilizer), and complete meteorology year.
- Node evidence `researchInputs` capped at 12 per node; number and category of sources included and unavailable.
- Edge status remains `NOT_VALIDATED` with `estimatedEffect=null`, `measuredLag=null`.
- Consolidated counts: `contextNodes`, `contextEvidenceRows`, `validatedEdges=0`, `verifiedIssuerImpacts=0`, `predictionsTested=0`.
- Source-specific limitations, open evidence requirements and a downloadable, source-attributed text dossier.
- No model inference costs, model API keys, autonomous agents, trading decisions or broker order access.

## API contract

| Method | Endpoint |
|---|---|
| GET | `/api/transmission-dossier/catalog` |
| GET | `/api/transmission-dossier/analysis?id=enso-fertilizer&mode=current&commodity=potash&region=argentina-pampas&year=2025` |
| GET | `/api/transmission-dossier/analysis?id=enso-fertilizer&mode=historical&region=brazil-south&asOf=2020-02-15` |
| GET | `/api/transmission-dossier/report.txt?id=enso-fertilizer&mode=current&year=2025` |

The UI exports the already-retrieved report locally instead of repeating costly API calls. The API also offers a direct text export for clients, with the same source limitations.

All endpoints are GET-only and input-allowlisted. Neither a remote URL nor a model prompt is accepted from the browser.

## API keys — create them on the official sites

Set server-side values in `apps/tradescope/.env` (not GitHub or chat):

- EIA energy: `EIA_API_KEY` → https://www.eia.gov/opendata/register.php
- USDA crop forecasts: `USDA_FAS_API_KEY` → https://api.data.gov/signup/ (confirmed by https://apps.fas.usda.gov/opendatawebv2/)
- FRED and ALFRED: `FRED_API_KEY` → https://fred.stlouisfed.org/docs/api/api_key.html
- Alpaca market bar history: `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY` → https://app.alpaca.markets/account/login
- SEC filings: `SEC_USER_AGENT` containing a real application name and email.
- UN Comtrade: keyless public preview, or `COMTRADE_SUBSCRIPTION_KEY` from https://comtradeplus.un.org/MyComtrade/APIPortal
- NVIDIA: `NVIDIA_API_KEY` via https://build.nvidia.com/settings/keys — **not required for v0.22**; deferred to Research Agent Desk.

Data entitlement and distribution rules remain to be reviewed before commercial deployment.

## Local acceptance test alongside v0.21

```powershell
cd apps/tradescope
npm test
npm run build:static
$env:PORT="8001"
npm start
```

Open **http://127.0.0.1:8001/source-control.html** and manually check available source connections. Then open **http://127.0.0.1:8001/transmission-lab.html** and select ENSO / Potash / Argentina-Pampas / most recent completed meteorology year. Click **Generate evidence dossier**. Inspect the source status and nodes; review the graph arrows and evidence gaps; download the report.

For historical mode choose ENSO, `2020-02-15`; the page must **not** show 2025 revised NASA/USDA/EIA/Comtrade values. Other scenarios intentionally disallow as-of climate replay until actual first-issued source archives are integrated.

Check wildfire and snowpack as independent research scenarios. Confirm that wildfire does not claim insurer losses and snowpack does not mislabel rainfall as snow-water-equivalent.

## Remaining work / next validated release gates

- Real-provider smoke tests with all configured keys, schema verification and historical publication-time correctness.
- Durable evidence snapshot archive and release-vintage provenance, independently checked original documents and table-level citations.
- Regional, plant/facility and supplier geographic exposures from trustworthy, licensed sources.
- Actual crop/fertilizer demand, input cost sensitivities, traded price and issuer link tests; measured propagation lags and out-of-sample controls.
- Production auth, separated tenants and operating SLAs.
- Human-led testing with commodity/insurance research analysts before claiming productivity or model predictive performance.

This lab **does not** constitute a validated economic model or investment recommendation.
