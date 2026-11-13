# TradeScope v0.25 — Geographic & Issuer Exposure Research (Local Pilot)

**Branch:** feature/tradescope-v018-unified-development
**Cumulative draft PR:** https://github.com/sid-cha/ResearchOS/pull/19 (must remain unmerged until acceptance)
**Status:** source-bound, guarded local research workflow, not production-grade verified exposure attribution.

## What shipped

**Official USGS observations:** lib/geo-exposure.mjs fetches a fixed allowlist of publicly documented, keyless USGS GeoJSON feeds (M4.5+ last week/month and significant events last month). All provider HTTP calls are server-side with a bounded payload size, timeout, limited event count, cache and fixed USGS hostname. Event records preserve event identity, provider updated timestamp, observed time, magnitude, source URL, epicenter coordinates, depth and fetchedAt. A recent feed is currently revised and does **not** establish as-of original first publication. Official format: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php.

**SEC referenced issuer business profiles:** An existing source-referenced issuer catalog (MOS, CF, IPI) is exposed to the geographic UI, preserving original business activity references and CIKs, but shows **no facility coordinates** and makes no asset-ownership inference. The old source-referenced filing associations remain unverified against live SEC filings and site-address records.

**Geographic claim model:** Analysts can optionally store a *separately cited local facility claim* containing an exact SEC CIK/ticker match, named facility/country/type, latitude/longitude, an official SEC filing URL/date/relevant text, and an independently sourced official geocoordinate URL/date/relevant text. These are **ANALYST_SUBMITTED_UNVERIFIED** even when accepted. They are not proof of ownership, operations, original historic availability, or company loss.

**Local data protections:**
- Registry capture is OFF by default. Enable only on loopback with RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true.
- Stored under ignored .local-data/issuer-asset-claims.json, mode 0600 where supported. Writes are serialized within one process; atomic temp-file rename and claim SHA-256 integrity on subsequent reads. Duplicate claims are not inserted twice. Corrupt records fail rather than being silently reset.
- No browser-supplied provider URL is fetched; official source URLs are recorded as references only and never used as proxy requests.
- POST /api/geo-exposure/assets requires both explicit server-side opt-in and a same-origin JSON browser request. This is still NOT production authentication; local access should be controlled.
- The HTTP API never elevates local analyst assertions into independently verified geo/issuer exposures, and has no edit/delete or mass import.
- Limited to MOS, CF, IPI as existing SEC-linked research identities; additional issuers require source-supported onboarding, not arbitrary text lookup.

**Event proximity:** Haversine great-circle distance between the selected USGS epicenter and each locally submitted site coordinate; bounded 25/50/100/250 km. Results explicitly say *EPICENTER_PROXIMITY_CANDIDATE_NOT_SHAKING_OR_LOSS*, provide issuer/geo evidence links, and refuse to estimate damage, operations, lost revenue or stock price. A historical cutoff cannot include events occurring in its future; proximity screens from the currently revised feed never qualify as historical first-available evidence. An absent result may mean **no validated local asset input**, not no industry exposure.

**Integration:** geo-exposure.html / JS / CSS, original TradeScope UI and navigation from Market Hub, Terminal, Ledger and Transmission Lab. The selected event can open the existing earthquake-facility hypothesis graph; that graph remains **TEMPLATE_ONLY** and contains no verified economic effects.

## Source and API contracts

- GET /api/geo-exposure/catalog — USGS connector metadata and source-referenced business profiles.
- GET /api/geo-exposure/events?tier=4.5_week — official fixed USGS public event feed.
- GET /api/geo-exposure/assets — analyst submitted local source-linked asset claims (or empty when disabled).
- GET /api/geo-exposure/proximity?eventId=<observed USGS event ID>&tier=4.5_week&radiusKm=100 — explicit proximity candidate screen.
- POST /api/geo-exposure/assets — optional same-origin local-only JSON claim, never enabled publicly.

**USGS key:** None is required for these public GeoJSON feeds. No NVIDIA, FRED, Alpaca, USDA or EIA credentials are used by the new feed. Broader enterprise facility geocoding and licensed insurance exposure data are not integrated.

## Local validation alongside v0.21–v0.24

From apps/tradescope:

    npm test
    npm run build:static

To test read-only event discovery:

    $env:PORT = "8001"
    npm start

Open http://127.0.0.1:8001/geo-exposure.html, then click Load USGS events. Check source/time/magnitude/geography. A screen with no local asset records must return zero **candidate matches**, not a statement that companies are safe.

For explicit local source-claim capture (requires you to review the license/retention implications), add to your own ignored .env:

    RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true
    HOST=127.0.0.1

Restart the server, then add an asset with real SEC filing and geocoordinate evidence. Do not fabricate a facility identity for testing live users; the isolated automated tests use fictitious clearly labelled data. Screen a nearby real USGS event only if one occurs and the local evidence is appropriately sourced. Keep direct source links and unverified markers visible.

## Important limitations / acceptance gates

- USGS epicenter distance is not ShakeMap ground shaking, damage probability, intensity or insured loss. Fetching ShakeMap/PAGER and independently verified location polygons is future work.
- No live facility point matching has been verified; newly captured analyst site claims remain unverified until source documents and coordinate authenticity receive an independent check.
- Facility-to-CIK crosswalk is an analyst hypothesis until original records corroborate legal operator/owner and time-specific asset validity.
- Event occurrence times, provider updates, fetch times, SEC filing dates and source publication clocks are distinct; historical as-of is not established.
- No automatic scenario-edge validation, quantitative earnings sensitivity, supplied shipping route, wildfire perimeter, drought polygon, no associated price change and no investment recommendation.
- Live API, browser E2E, geodata usage rights, historical event revision data, production security and independent asset checks are still pending.

## Recommended next milestone

**v0.26: Independently verified issuer/facility identity, location provenance and temporal relationships**, beginning with an official facility directory and exact CIK/company matching evidence; strengthen event hazard footprints beyond epicenter distance. Do not copy more UI modules before source quality is established. Secondary priority: live-provider contract audits and statistically sound crisis/commodity negative-control backtests.
