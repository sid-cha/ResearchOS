# ResearchOS v0.18 — Geographic Climate Evidence (first delivery)

**Status:** Implemented NASA POWER historical monthly **point** observations and source-provenance receipts, with API and Crisis & Climate integration. **Mocked provider tests only.** No original historical publication-time meteorology, region-wide crop weather, model anomaly, company exposure, commodity impact or financial predictor has been validated.

## API

- `GET /api/geoclimate/catalog` — registered research points and approved metrics
- `GET /api/geoclimate/monthly?region=argentina-pampas&year=2007`
- `GET /api/geoclimate/monthly?region=argentina-pampas&year=2007&asOf=2007-08-01`

The `asOf` argument is a **month-completion filter only**: for August 1, 2007, only January through July are returned. **It does not reconstruct which gridded measurements had been published by that date**. This is retrospective current-revision meteorology; never input it as a historically known warning without original publication-vintage evidence.

Registered representative research points:

| ID | Geography | Climate research link |
|---|---|---|
| `argentina-pampas` | Approx. Pergamino, Pampas, Argentina | ENSO / fertilizer research |
| `brazil-south` | Approx. Passo Fundo, southern Brazil | ENSO / fertilizer research |
| `california-foothills` | California foothills, United States | Wildfire / insurance research |
| `colorado-high-country` | Colorado high country, United States | Snowpack / hydropower research |

**The points are model grid cells, not legal administrative boundaries, a region-wide monthly climate mean, a crop polygon, a watershed, or a company facility location.** No causal relationship to the selected industry is asserted by the point association.

## Source, units and lineage

NASA POWER official monthly point API (`community=AG`) is queried over **one completed historical year**, only for `PRECTOTCORR` and `T2M`.

- `PRECTOTCORR`: monthly mean **daily precipitation rate** in **mm/day**; not monthly total, not an independently calculated rainfall anomaly.
- `T2M`: monthly mean 2-metre air temperature in °C.
- `-999`, missing months and absent fields are `null`, not filled or interpreted as zero.
- The response includes source URL, fetched-at UTC timestamp, geographic point and fixed source ID, coverage counts, and a SHA-256 digest of the **normalized complete-year snapshot**.
- `firstPublishedAt` and `sourceRevisionId` remain null. The hash is an integrity receipt of the fetched normalization, **not** proof of the originally issued historical revision or delivery.
- A date-filtered result retains the same complete-year receipt and exposes only eligible months; source values remain retrospectively revised.
- Fixed origin and ID allowlists, byte caps, content-type/unit/coordinate and data-value checks, read-only HTTP methods, cache isolation, 12-second timeout, no private API credentials.

Official NASA POWER monthly documentation:
https://power.larc.nasa.gov/docs/services/api/temporal/monthly/

NASA POWER describes meteorological monthly products as retrospective assimilation/model datasets, not original historical weather bulletin snapshots. Data coverage and unit schema require live provider verification before release.

## User experience

Research → Crisis & Climate → choose ENSO/Fertilizer, Wildfire/Insurance or Snowpack/Hydropower → **Geographic climate history** → select representative point/year and optionally a historical cutoff → **Load retrospective monthly data**.

The UI displays precipitation, temperature, missing coverage, source and receipt digest. Its graphs and results are not interpreted as industry/issuer predictions.

## Work not yet built

1. **Immutable evidence database**: durable append-only records, unique source IDs, first-seen and source-issued clocks, source content retention, corrections, replay and conflict handling.
2. **Regional geospatial data model**: crop growing zones, watershed polygons, insured property polygons, verified station inventory and coordinate reference systems.
3. **Original historical issued-vintage climate records**: NOAA station observations and official issued forecasts with publication cutoffs, revision history and archive integrity.
4. **Actual climate anomaly computation**: climatological normals, seasonal baselines, percentile methods and out-of-time validation.
5. **Commodity/crop evidence**: official dated USDA/local crop production and potash production/import datasets; measured supply/demand effects.
6. **Company exposure verification**: facility/revenue/insurance footprint and effective-date claims with SEC or company disclosures.
7. **Backtest integration**: only after source timing and geographic exposure are validated, with negative controls and deterministic as-of features.

**Development:** same `feature/tradescope-v018-unified-development` branch / PR #19. Keep `main` unchanged. CI is a regression gate; live NASA historical source checks and browser acceptance are deferred to release validation.
