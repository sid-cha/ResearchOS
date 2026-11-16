# ResearchOS v0.45 — P0 Mechanism-First Radar

Development branch: feature/tradescope-v018-unified-development. PR #19 draft and unmerged.
Local workspace: http://127.0.0.1:8000/mechanism-radar.html
Menu: Global Events → Event Radar → Mechanism-First Radar.

## Why mechanisms rather than named corporations?

There is no scalable master list of all CEOs, suppliers, corporations, facilities, and geopolitical incidents. Separate discovery from exposure attribution:

1. Identify a new physical, legal, economic or network change from source-qualified signals, independently of any named issuer.
2. Map only conditional mechanism paths with measurable intermediate milestones, plus alternative explanations and missing evidence.
3. Geographically intersect the actual event with real exposed facilities, trade routes or crop areas.
4. Resolve affected assets, suppliers and issuers through independently sourced legal relations and dated economic data.
5. Generate human-review alerts and eventually measure true positives and false alarms from out-of-time prospective captures.

The first generic discovery module is a bounded implementation, not an open-world AI capable of discovering every new physical mechanism without a predefined ontology.

## Four registered themes

- ENSO circulation — tropical trade-wind/ocean heat, jet stream, California winter storm likelihood, coastal Peru upwelling/anchoveta/fishmeal, South American regional crop/seasonal rainfall and fertilizer demand.
- Export control and regulation — source reports, official legal scope, shipments/licenses, economic materiality, issuer impact.
- Transport chokepoints — actual operator notices, capacity restrictions, commodity flow, industry costs, issuer dependency.
- Energy supply — facility/grid outage, system reserve, energy price/substitution, industry costs, issuer dependency.

Every graph includes typed source nodes, explicit requirements and strictly conditional edges. No edge is marked verified by the upstream theme discovery.

### ENSO dynamics and early indicators

Pacific trade-wind anomalies, wind bursts, subsurface warm Kelvin waves and ocean thermocline changes may precede or accompany ocean-atmosphere coupling. Watch Pacific Niño-3.4 SST and Relative ONI (RONI), equatorial wind anomalies, Southern Oscillation, depth of warm subsurface waters, OLR/convection and published NOAA CPC forecasts. Different observations have different issued and measurement clocks and may be revised. They are not interchangeable.

The mechanism fans out into independent, region- and season-dependent branches:
- Coupled ENSO → jet-stream/teleconnection → changing probability of California winter precipitation → actual flood/storm footprints → confirmed site and insurer exposure. NOT a specific-storm prediction.
- Coupled ENSO → weaker eastern Pacific cold nutrient-rich upwelling → potential change in Peru anchoveta abundance, fishing seasons and catch → fishmeal supply/feed prices → aquaculture value chain. NOT a guaranteed anchoveta shortage.
- Coupled ENSO → heterogeneous southern and northern South America rainfall → specific crop calendar/yield outcomes → fertilizer/potash buying and import changes. NOT a direct El Niño-to-potash-price relationship.

The 2026 November NOAA CPC advisory reported unusually warm Pacific sea-surface temperatures, subsurface eastern warmth, low-level westerly anomalies and negative Southern Oscillation indices, plus a strong-to-very-strong outlook. Regional impacts remain uncertain. This release does NOT yet ingest direct daily wind/thermocline/RONI numeric time series.

Official references:
https://www.noaa.gov/understanding-el-nino
https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/
https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml
https://www.fao.org/climate-change/news/news-detail/el-ni%C3%B1o--climate-change-and-the-rising-risks-to-aquatic-food-systems/

## Source discovery and clocks

- GDELT DOC searches: fixed HTTPS theme query, one-week window, 40-record bound. News title screening is an unverified topic lead, NOT proof of ENSO, a policy action, company misconduct, or even a complete media sample.
- NOAA CPC: reuse the existing source-scoped dated discussion retrieval. Source-asserted issueDate remains distinct from the local capture time. A 2026 retrieval of a 2025 advisory CANNOT retroactively create a 2025 ResearchOS detection claim.
- GDELT seendate is provider indexing metadata, NOT a certified original publisher timestamp.
- Capture source SHA-256, local first-receipt time, source query and bounded observations. Hash-linked private JSON file has 100 snapshots / 6.5 MB default, atomic rename and restart integrity checks. This is not signed WORM provenance.

Only root source observations appear as source-observed. All other graph nodes require independent measurements. Real issuer exposures, loss, stock direction, calibrated probabilities, negative-control estimates and causal proof remain null/false.

## Local API and setup

GET /api/mechanism-radar/catalog
GET /api/mechanism-radar/view?themeId=enso-circulation&asOf=2026-11-16T18%3A00%3A00Z
POST /api/mechanism-radar/capture

Capture JSON uses themeId in enso-circulation, regulatory-export, logistics-bottleneck, energy-supply; provider in GDELT_MEDIA or (ENSO only) NOAA_CPC. Requires Content-Type application/json, loopback-only same-origin request, and header X-ResearchOS-Mechanism: 1.

Configure in ignored local apps/tradescope/.env only after confirming allowed source use:

    HOST=127.0.0.1
    MECHANISM_RADAR_CAPTURE_ENABLED=true
    MECHANISM_RADAR_RIGHTS_CONFIRMED=true
    # MECHANISM_RADAR_STORE_PATH=C:/Users/you/ResearchOS-data/mechanism-radar.json

Opening the UI or replaying stored results does NOT contact an external provider. There is no automatic polling or alert delivery in this increment.

Local commands:
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

## Independent acceptance gates

- Validate actual NOAA and GDELT responses, rate/retention/redistribution rights and live browser behavior. Tests use bounded source fixtures.
- Add first-vintage measured wind/SST/thermocline series and original NOAA issue/revision records with authenticated publication clocks.
- Link issued seasonal precipitation probability to real California basin and South American region/crop anomalies; measure forecast skill with holdouts and controls.
- Verify Peru fishery catch/quotas, fishmeal trade and independently identified downstream company exposure, instead of assuming a fishery loss.
- For fertilizer: verify crop, N/P/K product, local import, price, inventory and supplier links; separate supply from demand effects.
- Expand thematic ontology, cluster unknown event types from eligible source streams and independently audit generated hypotheses.
- Validate actual event detection latency, coverage, measured financial consequences and false-positive rate.

P0 engineering built does not mean P0 scientific or commercial acceptance passed. P1 remains deferred.
