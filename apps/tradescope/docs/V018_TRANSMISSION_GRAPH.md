# ResearchOS — Typed Climate/Economic Transmission Graph (v0.18 increment)

Status: **implemented conditional mechanism-graph foundation with API, UI and tests**. This is NOT an exposure-verified issuer signal, causal model, quantified scenario forecast or validated financial warning.

## UI and API

- Research → Crisis & Climate → ENSO/Fertilizer, Wildfire/Insurance, or Snowpack/Hydropower → **Explore Transmission Graph**.
- `GET /api/transmission/catalog`: bounded scenario graph summaries.
- `GET /api/transmission/graph?id=enso-fertilizer`
- `GET /api/transmission/graph?id=enso-fertilizer&asOf=2020-02-15`: attaches an eligible source-dated NOAA discussion only to the ENSO outlook node, when one is available. Future-dated issues are not accepted.
- `GET /api/transmission/graph?id=wildfire-insurance` and `id=snow-hydropower`: hypothesis-only research graphs. Dated source retrieval for these is deliberately unavailable rather than silently simulated.

## Domain and research integrity

Every graph contains typed `nodes` and directed `edges`: `climate_signal`, `regional_hazard`, `asset_exposure`, `crop_production`, `commodity_demand`, `commodity_supply`, `market_balance`, `hydrology`, `energy_system`, `insurance_balance_sheet`, `industry_cashflow`, and `issuer_exposure`.

Each edge provides an authored economic mechanism, source reference and explicit status `HYPOTHESIS_NOT_EMPIRICALLY_VALIDATED`. The effect direction is `CONTEXT_DEPENDENT`, its lag is `UNMEASURED`, and its estimated effect is `null` until independent evidence is integrated. A link to a research source is not proof of the directed causal mechanism.

The three initial pathways are:
1. **ENSO → rainfall → crop conditions → fertilizer demand + independent potash supply → market balance → margins → issuer**. Geographic crop impacts are heterogeneous, and imports/demand must not be equated with local potash mining.
2. **Fire weather → observed wildfire → insured property → net claims → insurers**, with a separate fire/rebuilding → construction/materials route. Satellite detection alone does not establish insured loss.
3. **Snowpack → runoff/reservoirs → hydropower and substitute generation → utility economics**, with a separate runoff → irrigation → farming exposure.

## Evidence and data quality

- The only integrated dated evidence in this increment is source-claimed NOAA CPC ENSO issue-date text; original page revision and intraday release clock remain **unverified**.
- It attaches only to the ENSO climate input node, never to rainfall, crop response, fertilizer demand, industry margins or specific issuers.
- All issuer exposure and quantified economic nodes have no observations. The response explicitly reports zero validated edges, zero company exposure edges and zero estimated company returns.
- Requests are read-only, source- and ID-allowlisted, and date validated. The original NOAA CPC adapter has fixed URLs and bounded responses; source failures remain unknown, not false or zero.
- Client rendering escapes all source data and shows separate stage cards and conditional links.

## Next increments on the SAME branch / PR #19

1. Add historical, publication-time-aware **georeferenced weather observations** and watershed/crop-region normalization.
2. Link region/crop to signed revisions of USDA WASDE/local acreage and yield reports with original issue dates.
3. Introduce typed issuer-exposure claims with CIK/asset IDs, evidence excerpts, effective periods and conflict handling; do not fill generic sector exposure with invented issuer links.
4. Add versioned evidence persistence and recalculation of graph readiness, followed by conditional returns tested against out-of-time controls.
5. At release candidate, run original archive/market/source verification, acceptance testing and licensing/legal review.

References: `V014_CRISIS_CLIMATE_EARLY_WARNING_RESEARCH.md`, `V018_PRIORITIZED_BACKLOG.md`, `STACKED_RELEASE_VALIDATION_GATE.md`.

Automated tests: `tests/transmission-graph.test.mjs`, plus cumulative regression suite. Passing fixtures are code verification, not proof of economic predictive performance.
