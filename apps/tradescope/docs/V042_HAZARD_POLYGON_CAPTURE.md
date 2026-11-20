# ResearchOS v0.42 — P0 Sprint 7 NWS Flood Alerts and WFIGS Wildfire Polygons

Repository: sid-cha/ResearchOS · branch feature/tradescope-v018-unified-development · draft PR #19
Workspace: http://127.0.0.1:8000/hazard-footprints.html
Navigation: Global Events → Economic Transmission → Official Hazard Polygons / Hazard Source Revisions.

## Scope and evidence boundary

This increment screens **one previously captured EPA FRS coordinate** against actual GeoJSON polygons returned by two external official-source services, only when an analyst explicitly initiates a capture.

1. **NWS active flood alerts:** a fixed URL under https://api.weather.gov/alerts/active?point={lat},{lon}. Only Flood Warning, Flash Flood Warning and Flood Advisory features with valid GeoJSON polygons are eligible. These represent *warning/alert service polygons*, not observed inundation or flood depth. Some NWS products are zone-based and do not include geographic polygons; such features are counted as missing geometry, not transformed into guessed polygons.
2. **WFIGS current interagency wildfire perimeters:** a fixed query under https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query. The ArcGIS geometry query uses only the existing EPA facility point, EPSG:4326, spatialRel=esriSpatialRelIntersects, outSR=4326, f=geojson, and fixed field list including incident category. Features with attr_IncidentTypeCategory != WF are excluded (e.g. prescribed fire RX). Local code still tests the returned geometry independently, without accepting provider intersection claims as definitive.

These official data products are fundamentally different. A wildfire perimeter may be incomplete or revised; NWS polygons are forecasts/warning service areas. Both are poor substitutes for actual flood-water extent, structure-level fire damage or geotechnical hazard models.

**No USGS ShakeMap MMI raster/coverage is implemented in v0.42.** USGS documented intensity contour GeoJSON represents line contours, not reliable polygon coverage; it must not be converted naively into within/outside or loss estimates. A separate ShakeMap coverage-grid decoder and independent quality evaluation are planned.

## Geometric screening

Each provider result must be a bounded GeoJSON FeatureCollection. Only Polygon and MultiPolygon geometries with closed WGS84 longitude/latitude rings are accepted. The deterministic ray-casting test handles:
- inside a source polygon;
- outside the polygon (including true holes);
- on a polygon or hole boundary (reported BOUNDARY_UNCERTAIN, not inside);
- disconnected MultiPolygon pieces;
- invalid, overlarge or unavailable geometry (reported as skipped, not proof of no hazard).

The source query and storage are bounded: single fixed provider URL per request, no redirects, HTTP stream max 900 KB, 9-second timeout, max 50 returned features, max 24 retained matched polygons, max 5,000 vertices per polygon and 16,000 total vertices. A WFIGS response at the 50-feature query limit is treated as potentially truncated and rejected. A provider transport error, invalid root schema or partial transfer fails closed without writing a misleading archive record. The response is SHA-256 hashed, and local capture timestamp is recorded **after retrieval**. No start-time claims are backdated based on published alert times or wildfire incident ages.

EPA FRS site coordinates are reported site points, not surveyed facility parcel polygons, and datum differences may matter near boundaries. A point inside a fire perimeter or NWS warning polygon is **not proof of actual asset damage, disruption, legal company ownership, risk pricing, revenue, policy losses or securities movements**. Provider metadata and source dataset may be revised after capture; the locally saved observations do not provide independent historical publication history.

## Local journal

Default:
    apps/tradescope/.local-data/hazard-footprints.json

Optional ignored local .env:

    HOST=127.0.0.1
    HAZARD_FOOTPRINT_STORE_PATH=C:/Users/you/ResearchOS-data/hazard-footprints.json
    HAZARD_SOURCE_USER_AGENT=ResearchOS-LocalResearch/0.42 (your real support contact)

Each immutable source-observation record includes the source URL, raw response digest, EPA facility ID, originally captured EPA point, coordinate datum, normalized bounded polygons, source-reported timestamps when provided, skipped-feature reasons, screening result and local receipt time. Snapshot revisions are hash-linked and atomically written. Default capacity is 90 snapshots / 6 MB. Repeated identical site/source payload digests are deduplicated. A malformed/tampered chain fails closed on restart.

The on-disk journal is **not signed WORM storage**, not externally timestamped, not process-safe for concurrent server replicas and not a guarantee against a malicious local operator rewriting/re-hashing the file. It is intentionally private and not included in static web assets.

## Local API

Read-only (nonloopback access blocked):
- GET /api/hazard-footprints/catalog
- GET /api/hazard-footprints/facilities
- GET /api/hazard-footprints/view?asOf=2026-11-16T18%3A00%3A00Z&registryId=110015778176

Explicit local POST:
- POST /api/hazard-footprints/capture
- JSON payload: {"registryId":"110015778176","provider":"NWS_FLOOD_ALERT"}
- Or provider: WFIGS_WILDFIRE

POST requires loopback bound host, Origin and fetch-site checks, Content-Type application/json, a small strict JSON body, and request-intent header X-ResearchOS-Hazard-Capture: 1. It accepts only captured FRS IDs, not arbitrary coordinates or external URL strings. No network request is executed by opening the page or reading source history. No automatic financial order/trade or incident forecast tool exists in the service.

A source's latest observation per site/provider is shown at a selected as-of cutoff. Earlier locally captured versions are preserved in the journal; exporting GeoJSON includes only the selected, already captured snapshots. No historical hindsight from current source geometry is allowed into earlier as-of views.

## Testing locally

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open http://127.0.0.1:8000/hazard-footprints.html and choose a site saved in /facility-exposure.html. Choose the NWS or WFIGS polygon source and click capture. Check what the actual provider returned and its geometry/skipped counters; a missing polygon is not a negative exposure signal. Compare the same site/source at cutoffs before and after a new revision. Export GeoJSON for external map review, but do not use it as a damage/loss estimate.

### Independent acceptance gates

- Real NWS and WFIGS request response format, location-filter completeness, dataset licensing and reuse terms have not been validated by fixture CI.
- Run live-area acceptance for at least one *actual* NWS flood-warning polygon, one fire perimeter, and a known nonintersection/hole/boundary case.
- Verify FRS coordinates and site boundaries through an independent source before using proximity for portfolio research.
- Real USGS ShakeMap MMI intensity coverage, not just epicenter distance or misleading smoothed contours, remains pending.
- Flood-water/depth footprints, operational damage, legal entity site ownership, insured loss and source original release clock remain unverified.
- Browser/mobile access, event/facility source case histories, incident-specific accuracy and negative controls remain P0 acceptance requirements.

Official documentation:
- NWS weather alerts API: https://www.weather.gov/documentation/services-web-alerts
- NWS alert polygon vs zone geolocation: https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf
- WFIGS current interagency perimeters: https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0
- USGS ShakeMap coverage and contour caveats: https://ghsc.code-pages.usgs.gov/esi/shakemap/docs2020/manual4_0/ug_products.html

**Next P0 Sprint 7 increment:** bounded USGS ShakeMap intensity coverage at a captured facility, and an original-source historical publication/revision audit. Do not mark P0 Sprint 7 complete or start P1 just because simulated CI passed.
