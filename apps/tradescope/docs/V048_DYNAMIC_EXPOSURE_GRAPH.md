# ResearchOS v0.48 — Dynamic Causal & Economic Exposure Graph (P0)

Branch: feature/tradescope-v018-unified-development. PR #19 remains draft and unmerged.
Local workspace: http://127.0.0.1:8000/dynamic-exposure.html
Navigation: Global Events → Economic Transmission → Dynamic Causal Exposure Graph
Backend: apps/tradescope/lib/dynamic-exposure.mjs

## Design goal

Move beyond lists of named corporations or headlines. Identify a potentially important physical, policy, logistics or energy mechanism, then separately examine measured regional effects, infrastructure, SEC/EPA/GLEIF identities and issuer business exposure. **Do not infer an issuer effect from a template edge.**

The graph is READ ONLY, cannot initiate source collection, and accepts one exact UTC local knowledge cutoff. It composes seven existing as-of local views:

- mechanismRadar.view: four conditional mechanisms, NOAA discussion and news-title source reports
- climateNumeric.view: source-reported NOAA RONI, relative SST, SOI and trade-wind measurements
- facilityService.view: EPA site metadata, SEC company identity, analyst facility claims, captured USGS/NASA/FAA event proximity
- entityGraph.view: official LEI identity, source-reported GLEIF accounting consolidation and candidate CIK–LEI mappings
- relationshipService.view: SEC excerpt search and unauthenticated human reviewer aliases
- hazardService.view: NWS flood-warning polygons, WFIGS current wildfire perimeters, and spatial screening
- shakeMapService.view: USGS legacy source-grid modeled intensity samples

All source outputs must declare the same cutoff, and future-captured evidence fails closed. No private records are copied into the public static build. Graph output includes deterministic SHA-256 replay digest; this is a local reproducibility fingerprint, NOT independent provider/notary authentication.

## Source versus conjecture

Conditional mechanism stages:
  REPORTED_SOURCE_OBSERVATION -> CONDITIONAL_MECHANISM -> region/industry research hypotheses.
  Numeric CPC index observations may support a root climate research context, not specific storms.

Geographic site pathways:
  CAPTURED_EVENT_POINT -> GEOGRAPHIC_PROXIMITY -> EPA_REPORTED_SITE.
  NWS/WFIGS_REPORTED_POLYGON -> SPATIAL_SCREEN -> EPA_REPORTED_SITE.
  USGS_SHAKEMAP_MODELED_MMI -> GRID_ESTIMATE -> EPA_REPORTED_SITE.
  EPA_REPORTED_SITE -> ANALYST_SUBMITTED_LINK -> SEC_REGISTERED_FILER.

These branches are independent until true source evidence joins them. In particular, the graph does not infer that ENSO caused a particular California flood warning, that an earthquake harmed a plant, or that a SEC filer owns the EPA facility. A GLEIF accounting parent is not automatically an asset owner. A matched SEC filing excerpt does not independently certify company ownership or contract effectiveness.

The graph models three distinct reported polygon relationships: inside, boundary uncertain, and outside. Outside a single reported warning polygon does not establish safety. When filtering to a specific captured earthquake, unmatched NWS/WFIGS hazard polygons are not attached to that event.

A source-to-site-to-company research path contains exact source type, local first-seen timestamp, original provider URL where available, source digest where available, spatial/model method, link confidence label and human-review proof gaps. It never returns confirmed company ownership, site damage, supply contract, revenue loss, stock-price direction, predictive accuracy or economic forecast.

## Anti-Agent and research prioritization

For each candidate path, deterministic independent-proof questions examine:
- Original provider publication and source revision clocks, distinct from local capture time
- Competing causes and relevant counterfactuals
- Surveyed site boundaries, actual damage and operations
- Legal operator, owner or customer/supplier contract identity
- Reviewer independence and unauthenticated aliases
- Dated revenue/insurance cost materiality and industry substitution

Paths are ordered for manual review by evidence-screen specificity, NOT by likelihood or return. No probabilistic impact score or investment trade recommendation is claimed. The UI shows an interactive selected-path SVG diagram, source evidence, staged causal templates, exact open questions and JSON export.

## Local API

GET /api/dynamic-exposure/catalog
GET /api/dynamic-exposure/view

Optional validated view filters: asOf (UTC), themeId (curated mechanism ID), registryId (12-digit EPA FRS), eventId (source-qualified USGS/NASA/FAA event ID). No POST, arbitrary URL, download-from-network, cloud account, trade or sourced-data mutation. Nonloopback access to private graph replay is forbidden.

## Run and inspect

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open http://127.0.0.1:8000/dynamic-exposure.html. Capture event, hazard, FRS site or SEC filing through their earlier explicit local workspaces as permitted, then inspect graph at a cutoff before and after each source capture. Check that earlier cutoffs never show later source claims, and that all unverified financial/ownership fields remain null or false.

## Scientific and production acceptance still open

- Actual NOAA/GDELT/EPA/SEC/GLEIF/NWS/WFIGS/USGS provider live-schema and commercial-use-rights acceptance.
- Authenticated legal company site ownership, surveyed parcels, contracts, valid effective dates and independent counterparties; no automatic data join when absent.
- Historical official first-publication clocks, source revision records and a defensible original historical vintage replay (v0.49).
- Measured regional ENSO weather teleconnections, Peru fishery/crop/fertilizer outcomes, energy/shipping flows, verified issuer revenue sensitivity and independent loss/price responses.
- General open-world causal discovery beyond four curated mechanism families, regional geocoding and precise infrastructure dependency mapping.
- Browser end-to-end/mobile checks, large graph scaling, authenticated SaaS users, concurrent transactional persistence and operational monitoring.
- Two fully evidenced economic studies (Sprint 9), prospective negative controls and calibrated false positives/lead time (Sprint 10).

v0.48 delivers a reproducible, bounded read-only integration; it does NOT close real-world proof, source rights, or P0 scientific evaluation gates. PR #19 remains draft. Do not begin P1 from passing unit tests alone.
