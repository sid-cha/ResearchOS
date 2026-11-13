# TradeScope v0.26 — EPA Facility Identity and Evidence Challenger

Branch: feature/tradescope-v018-unified-development
Cumulative review: https://github.com/sid-cha/ResearchOS/pull/19 (open draft, unmerged)
Status: bounded local research pilot, not validated live issuer attribution.

## Shipped implementation

1. Official EPA FRS government facility identifier lookup from a fixed host and documented public GET service:
   https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities
   Inputs: exact Registry ID, JSON output, optional EPA program IDs. Normalized fields: EPA FRS Registry ID, facility name/address, NAD83 latitude/longitude and government program-system IDs. Requests use strict ID allowlisting, bounded responses, HTTPS, disabled redirects, timeout, in-memory cache and no provider API key. Multiple response wrappers are handled in mocked tests; actual live results still require independent verification.
2. Read-only API: GET /api/facility-verification/catalog ; GET /api/facility-verification/lookup?registryId=110000538525 ; GET /api/facility-verification/challenge?registryId=110000538525&assetId=asset-id (optional asOf=YYYY-MM-DD). The example EPA Registry ID is NOT a claimed connection to any of MOS, CF or IPI.
3. Structured crosswalk **challenge**: compares separately cited local facility-claim coordinates against EPA's NAD83 point, reports distance and location consistency. Neither site-name agreement nor location agreement validates a company owner or publicly traded issuer CIK.
4. Deterministic Evidence Challenger: emits explicit unresolved objections about missing FRS site records, coordinate conflicts (>1km), missing coordinates, alternate names, missing SEC legal operator/subsidiary bridge, source dates after an as-of cutoff, original source publication uncertainty, and lack of operational/financial impact proof.
5. UI: existing /geo-exposure.html now includes EPA facility identity lookup and claim challenge panels, preserving v0.25 USGS screening. No independent AI reviewer or separate model inference is running.

## Proof boundary and anti-hallucination policy

| Claim | State in v0.26 |
| --- | --- |
| Official current EPA Registry ID | Current FRS observation, awaiting live schema verification |
| Official NAD83 facility coordinate | Reported EPA site point if present, not a legal parcel or event damage footprint |
| Local claim coordinate match | Spatial distance and discrepancy, NOT legal ownership proof |
| EPA program ID | Government program linkage, NOT an SEC CIK |
| Public-company subsidiary / owner / operator | NOT VERIFIED |
| Historical effective date of actual legal operator | NOT VERIFIED |
| Earthquake damage and facility operation interruption | NOT VERIFIED |
| Issuer earnings/stock impact or predictive return | NOT VERIFIED |
| Original source publication clock, historical first-available | NOT VERIFIED |

The challenger API always returns verifiedSecOperatorLink=false, verifiedCurrentOperations=false, verifiedHistoricalExposure=false, verifiedIssuerFinancialEffect=false, estimatedLoss=null and causalAttribution=null.

Authoritative public source references:
- https://www.epa.gov/frs/frs-api
- https://www.epa.gov/frs/search-frs-data
- https://www.epa.gov/frs/frs-data-download-options
- EPA maintained code example https://github.com/USEPA/FRS-getfacilities-samples/blob/master/EIA-EPA_Mashup.md

EPA FRS get_facilities REST requires NO separate API key. This is not the secured intergovernmental Query or Submit API, and it does not use the FRED, EIA, USDA, Comtrade or NVIDIA secrets.

## Local test

From apps/tradescope:
- npm test
- npm run build:static
- PORT=8001 npm start (or PowerShell $env:PORT="8001"; npm start)

Open http://127.0.0.1:8001/geo-exposure.html, enter an existing official EPA Registry ID and retrieve current FRS data. To compare it to a locally saved facility claim, enable RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true with HOST=127.0.0.1 in your ignored local .env, restart the server, and record a genuinely source-supported v0.25 facility claim.

The isolated tests use fictional claims, mocked EPA responses, conflicting coordinate and as-of cases. They do not establish live EPA response correctness, license entitlement, production security, issuer identification or successful user browser acceptance.

## Research Anti-Agent (Red-Team Agent) future plan

The user requested an independent adversarial agent to challenge the findings of 5–6 parallel specialist research agents. The v0.26 evidence challenge is a deterministic precursor only.

Proposed protocol:
- ResearchClaim: exact assertion, issuer, site, event, effective period, published/first-seen timestamps, supporting evidence IDs, assumptions, falsification conditions and confidence methodology.
- Research Challenger/Anti-Agent independently retrieves contrary primary evidence and tries to disprove the claims, check alternate explanations, different data vintages, geography/issuer joins, biased control selection, false positives, market adjustment and source credibility. It must not generate artificial opposition.
- CounterClaim: classification, source ID, uncertainty, severity, original source and as-of period, required validation test and links to researcher assertion. Researcher can rebut with new evidence, challenger can reopen dispute. Human-controlled arbiter assigns SUPPORTED, CHALLENGED, WITHDRAWN or INCONCLUSIVE, but never labels truth by simple LLM voting.
- UI: 5–6 parallel research lanes plus Challenger and Arbiter, live evidence and cost/budget meters, conflicts and source-by-source supporting/opposing panels, cancellation, explicit user approval.
- Governance: read-only bounded tools, source licensing, per-agent authorization, prompt-injection resistance, historical no-lookahead checks, rate limits, independent retrieval, full trace, offline seeded contradiction recall/precision tests, human final review, no trading execution.

Only the deterministic challenger contract is built now. Production agent runtime, autonomous NVIDIA inference, tool orchestration, independent contradiction searches and adjudicator remain deferred. See the corresponding new section in V018_PRIORITIZED_BACKLOG.md.

## Next milestone: v0.27

Independently corroborate named facility legal operator/subsidiary relationships to specific SEC CIK and effective ownership periods using source-dated official permits and original SEC property/subsidiary filings. Do not promote a mere EPA facility name, country-level issuer activity or spatial match to verified ownership. Extend official site source evidence, true vintage archiving, negative-control backtests and real-provider contract testing before predictive claims. Keep draft PR #19 unmerged until complete acceptance.
