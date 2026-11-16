# ResearchOS v0.43 — P0 Sprint 7 USGS ShakeMap Site MMI

Repository: sid-cha/ResearchOS. Branch: feature/tradescope-v018-unified-development. PR #19 draft, not merged.
Workspace: http://127.0.0.1:8000/usgs-shakemap.html
Navigation: Global Events → Economic Transmission → USGS ShakeMap Site Intensity / Shaking Source Revisions.

## Purpose

v0.42 screened EPA-reported facility points against NWS flood warning alert polygons and WFIGS mapped wildfire perimeters without implying real damage. v0.43 adds a third, independent official data class: **USGS ShakeMap estimated Modified Mercalli Intensity (MMI)** for earthquakes already captured in the local Global Event collector.

Unlike smoothed contour GeoJSON lines, an official ShakeMap gridded dataset contains estimated intensity at grid nodes. The new sampler uses the documented **legacy ShakeMap grid.xml** product when available. The legacy XML path is bounded, explicitly marked legacy and not an assurance that the product remains supported for every event. Future work should decode CoverageJSON/HDF as the recommended source and compare results with uncertainty bounds.

**MMI is a modeled intensity estimate, not actual ground-motion measurement at the facility, and never verifies structure damage, revenue/insurance losses or share-price effect.** Nearest-grid-node sampling deliberately uses no interpolation or structural loss function. The client shows sample distance, nearest node, source response digest and reported product update timestamp separately from local first-capture time.

Official documentation:
- https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php
- https://earthquake.usgs.gov/data/shakemap/
- https://ghsc.code-pages.usgs.gov/hazdev/pdl/userguide-3.5.5/products/known-types/shakemap.html
- https://earthquake.usgs.gov/product/shakemap/ci10347253/ci/1486572530060/about_formats.html

## Fixed official source discovery

1. Choose a locally captured USGS event matching the canonical ID USGS:sourceID from /event-portal.html#global-feed. Never accept an arbitrary event id or source URL.
2. Choose a locally captured EPA FRS site with provider-reported coordinates from /facility-exposure.html.
3. Only upon an explicit capture action fetch event details at the fixed derived URL:

    https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/{validatedSourceEventID}.geojson

4. Validate the exact event ID, select an official ShakeMap product, and find the advertised grid.xml URL. It must be HTTPS on earthquake.usgs.gov, under a strict /product/shakemap/.../download/grid.xml path, with no redirect, nonstandard port, credentials, query or fragment. An alternate provider URL is never accepted.
5. Stream a bounded source response (event detail at most 850 KB, XML grid at most 12 MB, request timeout 10 s each). Invalid response, unsupported content type and excessive data fail closed.

If no ShakeMap product is present, the saved result is NO_USGS_SHAKEMAP_PRODUCT. If a ShakeMap exists but does not have a supported official XML grid, the result is NO_SUPPORTED_USGS_GRID_XML. Both mean **unknown** shaking at the site, not zero intensity.

## Grid parsing and sample

The XML parser does **not** execute or resolve XML entities. It rejects DOCTYPE/ENTITY declarations. It parses only a strict bounded subset:
- One grid specification with geographic bounds, nominal spacing and declared nlat/nlon.
- Indexed grid_field descriptions for LON, LAT and MMI.
- Exactly nlat × nlon grid_data rows, numeric finite values with 0–12 MMI bound.
- Up to 200,000 grid cells, fixed small number of fields, fixed maximum 12 MB response.

If the facility lies outside declared ShakeMap bounds, return OUTSIDE_REPORTED_SHAKEMAP_GRID without sampling a zero. Inside-grid samples use nearest enumerated node. A missing node within roughly 1.5 grid-cell diagonal distance is NO_LOCAL_GRID_CELL rather than an extrapolated estimate.

For valid samples return USGS_MODEL_ESTIMATE_AT_NEAREST_GRID_NODE, MMI estimate, sample longitude/latitude, nearest-site distance in kilometers, grid bounds and dimensions. The 1.5 cell-bound and distance calculation are an approximate grid selection guard, not geodesic engineering accuracy. Neither local soil effects, facility building materials, fragility, liquefaction, depth, loss, uncertainty intervals nor policy details are quantified.

## Local journals, API, and privacy

Default private journal: apps/tradescope/.local-data/usgs-shakemap-observations.json.
Optional ignored .env settings:

    HOST=127.0.0.1
    GLOBAL_EVENT_COLLECTION_ENABLED=true
    USGS_SHAKEMAP_STORE_PATH=C:/Users/you/ResearchOS-data/usgs-shakemap-observations.json
    USGS_SOURCE_USER_AGENT=ResearchOS/0.43 your-real-research-contact

The existing Global Event collector is opt-in; the local USGS event must be captured before it becomes selectable. A captured earthquake detail does not create prior historical first-publication evidence.

Snapshots are hash-linked, atomic-write persisted with a maximum 150 records and 3 MB. Store local capture clock, original EPA site and USGS event local capture clocks, official detail/grid URLs, response hashes, USGS-reported ShakeMap product update time and a compact sample result. Deduplicate identical provider digests/site/event combinations. A newer grid capture never rewrites historical as-of results. Existing records remain readable without any upstream network request.

Local read:
- GET /api/shakemap-mmi/catalog
- GET /api/shakemap-mmi/choices
- GET /api/shakemap-mmi/view?asOf=2026-11-16T18%3A00%3A00Z

Explicit loopback-only write:
- POST /api/shakemap-mmi/capture
- JSON payload: {"registryId":"110015778176","eventId":"USGS:us500abc"}
- Header: X-ResearchOS-ShakeMap: 1

Write requests are same-origin, JSON only and bounded; nonloopback deployments cannot read or mutate private source journals. No arbitrary endpoint, external credentials, model actions or broker orders are exposed. The static preview does not bundle private journals.

## Windows acceptance

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open /event-portal.html#global-feed and explicitly capture USGS M4.5+ events where permitted. Open /facility-exposure.html, capture a real EPA facility. Open /usgs-shakemap.html, select the event/site and capture the USGS detail and ShakeMap grid. Confirm an actual source MMI value, or honest absent/outside/error state; do not invent an earthquake for demonstration.

Compare local history before and after an actual provider revision. Opening the page must not request external ShakeMaps. Displayed MMI values and grid nodes must retain source hashes, and no site damage or financial loss should appear.

## P0 exit gates still open

- Live actual USGS event detail/grid XML response contract, source update/revision provenance and permitted data usage.
- Grid interpolation and validation against USGS CoverageJSON/HDF or source-provided "Shaking at Points" independent reference.
- Real-world site boundary geometry, local ground-condition adjustment and event-specific damage inspection.
- Actual NWS flood-depth contours, WFIGS wildfire damage validation, historical source first publication and later response revisions.
- Company facility legal ownership, supplier exposure, audited insurance damage claims and economically measured outcomes.
- Browser/mobile end-to-end acceptance, independently labeled case studies and negative controls.

This is another v0.43 **engineering increment** within proposed P0 Sprint 7, not Sprint 7 real-world acceptance. P1 remains deferred.

Next P0 work: validate real hazard providers and first-vintage source publication timestamps, then implement independent event source revisions and negative-control studies in Sprints 8–10.
