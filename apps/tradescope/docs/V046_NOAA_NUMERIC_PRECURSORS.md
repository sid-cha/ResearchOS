# ResearchOS v0.46 — P0 NOAA Numerical ENSO Precursor Intelligence

**Branch:** feature/tradescope-v018-unified-development · **PR #19:** draft, not merged.
**Local workspace:** http://127.0.0.1:8000/climate-numeric.html
**Navigation:** Global Events → Event Radar → NOAA Numerical ENSO Signals / Numeric Source Revision Audit.

## Why this increment

v0.45 added mechanism-first GDELT/NOAA issued-discussion research. v0.46 implements **numerical, source-reported climate indicators** that may precede seasonal regional outcomes. It does not claim that an anomaly causes any storm, fishery shortage, fertilizer price change, or security return.

Five *fixed, official* NOAA Climate Prediction Center (CPC) index files:
- RONI: https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt (overlapping three-month seasonal Relative Oceanic Niño Index, center-month period, °C).
- Relative Niño 3.4: https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt (single calendar month relative SST anomaly in °C; not equivalent to three-month RONI).
- Southern Oscillation: https://www.cpc.ncep.noaa.gov/data/indices/soi (Tahiti–Darwin sea-level pressure **ANOMALY** section, not original/standardized section).
- Central Pacific 850mb trade wind: https://www.cpc.ncep.noaa.gov/data/indices/cpac850 (**ANOMALY** section).
- Western Pacific 850mb trade wind: https://www.cpc.ncep.noaa.gov/data/indices/wpac850 (**ANOMALY** section).

NOAA index table listing/format: https://www.cpc.ncep.noaa.gov/data/indices/.
NOAA RONI reference: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/.
NOAA explains recent RONI readings can change for up to two months, and monthly CPC indices are generally published/updated around the first ten days of each month. This is NOT a timestamp guarantee, and later revisions must be captured as newer local source versions.

## Source contracts and calculation

The source parser is bounded and format-specific: seasonal "SEAS YR ANOM" records, monthly "YR MTH ANOM" records, and year-by-month **ANOMALY** section only in winds/SOI. CPC compact missing-value blocks such as -999.9-999.9 are parsed numerically but rejected as sentinel values. Duplicate periods, malformed rows, future or out-of-range years, excessive data and unsupported source responses are rejected. Only a fixed HTTPS NOAA endpoint for a registered index is allowed; no redirects or arbitrary user URLs.

On explicit fetch the module:
1. Streams at most 350KB in 9 seconds, captures raw source SHA-256, never stores raw copyrighted page bodies or a provider secret.
2. Normalizes reported observation months, excluding future months and sentinel/missing readings.
3. Preserves at most the latest 48 monthly rows and the original seasonal label; recent months are explicitly **provisional**.
4. Computes backward-only latest value, three-month change, and consecutive-three-month mean. These are descriptive statistics, not a validated prediction.
5. Compares captured RONI warm/cool ±0.5°C threshold with atmospheric pressure and trade-wind supporting signals at periods within two months. It can flag MULTI_INDEX_WARM_CONTEXT or MULTI_INDEX_COOL_CONTEXT, but **never marks an official ENSO episode verified**.
6. Records per-period changes between two *locally observed* versions of the same source. No vintage is reconstructed by querying today's current NOAA values for the past.

Caution: SOI, trade wind and RONI are overlapping/correlated indicators; "two supporting indices" is a research cue, not independent confirmation or calibrated probabilistic estimate. A value exceeding ±0.5 is not by itself the NOAA episode definition (historical classification requires persistence and physical coupling). No uncertainty propagation or threshold optimization is implemented in v0.46.

## Security and point-in-time integrity

Private default journal:
    apps/tradescope/.local-data/climate-numeric.json

Opt-in in *ignored private .env* only, and only after examining NOAA source use/retention conditions:

    HOST=127.0.0.1
    CLIMATE_NUMERIC_CAPTURE_ENABLED=true
    CLIMATE_NUMERIC_RIGHTS_CONFIRMED=true
    # CLIMATE_NUMERIC_STORE_PATH=C:/Users/you/ResearchOS-data/climate-numeric.json

Read-only:
- GET /api/climate-numeric/catalog
- GET /api/climate-numeric/view?metricId=RONI&asOf=2026-11-16T18%3A00%3A00Z

Manual capture:
- POST /api/climate-numeric/capture
- Content-Type: application/json
- X-ResearchOS-Climate-Numeric: 1
- {"metricId":"RONI"}

The API is loopback-only. Capture requires explicit same-origin intent and source-rights opt-in. No automated polling, email alerts, brokerage orders or outbound provider request on page load/replay is enabled.

Snapshots form a hash-linked private journal written through atomic rename (max 100 versions / 6 MB); identical source body digests are deduplicated. Reads before a local capture timestamp do not show values from that capture. A source monthly measurement timestamp is **not** original publisher release time or ResearchOS first-seen. The journal is not externally notarized, signed WORM storage, process-safe multiwriter persistence or a legal data license.

## How to validate

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

1. Visit /climate-numeric.html and review the registered sources. No external NOAA download should happen until the explicit button is pressed.
2. Enable source rights and capture RONI, monthly relative Niño 3.4, SOI, central and western 850mb winds. Confirm dates and values match the actual NOAA source tables.
3. Compare the latest RONI threshold and atmospheric indices, but do not interpret the assessment as a verified official climate episode.
4. Capture the same source again after a genuine NOAA update and inspect per-month revisions and original first-local-receipt clocks.
5. Replay at a cutoff *before* initial capture: no historic source data should appear even if the file contains many decades of measurements.
6. Export JSON and verify hashes, source periods, provider URLs, nonfuture cutoff and no estimated business impact.
7. Independently confirm provider content types/availability, browser/mobile behavior, retention/distribution rights and user-facing units.

## P0 acceptance still pending

- Live NOAA endpoint data-format/rights acceptance (fixture tests do not prove ongoing service).
- USGS/NWS/WFIGS and EPA/SEC/GLEIF provider acceptance from earlier sprints.
- Historical original issue time and revision audit; point-in-time archive starts only at first platform capture. Data available for 2025 cannot be reconstructed from a 2026 fetch without separately authenticated 2025 snapshots.
- Climate subsurface heat content/Kelvin waves, real-time wind reanalyses, independent forecast verification for California/Peru, and regional rainfall/catch/crop/transport datasets.
- Region → facility → industry → issuer legal and economic exposure joins.
- Real scheduled monitoring, alert delivery, holdout experiments, negatives and measured false positives.
- Validation against actual 1997–98, 2015–16, 2023–24 ENSO cases using original release-vintage data without hindsight leakage.

**Next P0 engineering:** v0.47 bounded autonomous numerical/news source monitoring with durable scheduling, provider health, idempotent alert queue and delivery-time tracking. Live-source permissions and earlier scientific validation gates must remain explicit. P1 deferred.
