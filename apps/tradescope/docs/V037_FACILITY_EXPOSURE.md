# ResearchOS v0.37 — Company & Facility Exposure Crosswalk

**Repository:** sid-cha/ResearchOS · **PR:** #19, draft/unmerged
**Workspace:** http://127.0.0.1:8000/facility-exposure.html
**Three-level navigation:** Company Research → Facility Intelligence → Company–Facility Crosswalk / Event Proximity Candidates.

## What v0.37 delivers

This is a source-first research crosswalk, not certified issuer ownership or investment advice. It preserves three separate facts or hypotheses:

1. **Site identity:** an exact 12-digit EPA Facility Registry Service (FRS) ID, with EPA-reported name, address and NAD83 coordinates from the public FRS API. The returned location may not accurately describe the size or full footprint of a facility.
2. **Issuer identity:** SEC Central Index Key (CIK), filer name and reported tickers from SEC EDGAR submissions metadata. SEC CIK and ticker do NOT prove any association with an EPA facility.
3. **Hypothesized relationship:** an explicit operator-entered POTENTIAL_OWNER, POTENTIAL_OPERATOR, POTENTIAL_SUPPLIER or POTENTIAL_CUSTOMER research claim, attached to an allowed SEC filing URL and a rationale, always marked HUMAN_CLAIM_UNVERIFIED. No filing contents are independently adjudicated.

All lookups are operator initiated, never automatic. No companies, facilities or damages are seeded or invented.

## Source endpoints and handling

The fixed EPA FRS lookup uses:

    https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities?registry_id=NNNNNNNNNNNN&output=JSON

The fixed SEC EDGAR lookup uses:

    https://data.sec.gov/submissions/CIK##########.json

Only validated digit identifiers enter these fixed URLs. Server-side GET requests reject redirects, non-JSON content, mismatched identifiers and unbounded/malformed responses. Provider body SHA-256 hashes and local post-response capture timestamps are retained. Both sources have distinct coverage and are NOT merged into a verified relationship.

References:
- EPA FRS API and data model: https://www.epa.gov/frs/frs-api
- EPA FRS source description: https://www.epa.gov/frs/frs-description
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces

Source usage/rate limits and SEC contact User-Agent requirements need review before production operation. No mass scraping, continuous polling, or backfill of historical site ownership is included. The live EPA and SEC response shapes have not been acceptance-tested against their production endpoints.

## Research relationships

Both FRS and CIK metadata must have been captured before an analyst records a company–facility relationship hypothesis. A link requires an SEC filing URL under an official SEC EDGAR archive path and 25–600 characters of explanation. It remains an unverified hypothesis and is never promoted into legal ownership, operational control or proof of a supplier relationship.

A bounded local JSON journal persists source snapshots and submitted hypotheses as hash-linked records, with a 300-entry / 7 MB default limit and serialized atomic temporary-file rename. It rejects corrupt records when reopened. This is not a signed WORM archive, notarized data, multiuser storage or a guarantee against a malicious operator editing and recomputing hashes.

Private storage default:

    apps/tradescope/.local-data/facility-exposure.json

Optional private settings:

    HOST=127.0.0.1
    FACILITY_EXPOSURE_STORE_PATH=C:/Users/you/ResearchOS-data/facility-exposure.json

Do not publish this journal or private provider configuration.

## Event-to-facility distance screening

The screen uses locally captured, coordinate-bearing USGS or NASA EONET events and FRS site coordinates. Airport advisories generally do not carry facility-comparable coordinates. The deterministic haversine distance uses 250 km by default, with a selectable 1–500 km radius.

Results are tagged GEOGRAPHIC_CANDIDATE_ONLY. Presence within a radius is not proof of physical damage, wildfire/flood/shake severity, operational interruption, issuer affiliation, revenue materiality, insured loss, commodity transmission or share-price effect. Candidate objects expose blocking Anti-Agent findings and set verified ownership, damage and issuer-impact flags to false and estimated loss to null.

The local as-of cutoff excludes facility snapshots, company snapshots, relationship claims and event observations first captured afterward. Provider event times and SEC filing dates never backdate the local research knowledge clock.

## Local API

Read-only:
- GET /api/facility-exposure/catalog
- GET /api/facility-exposure/view?radiusKm=50
- GET /api/facility-exposure/view?asOf=2026-11-15T18%3A00%3A00.000Z&eventId=USGS%3Aexample

Explicit write actions:
- POST /api/facility-exposure/facility with JSON registryId (12 digits)
- POST /api/facility-exposure/company with JSON cik (1–10 digits)
- POST /api/facility-exposure/link with registryId, cik, relationshipType, evidenceUrl and rationale

Writes require a loopback-hosted Node server, same-origin checks, application/json, explicit X-ResearchOS-Facility-Research: 1 header, bounded bodies and strict field validation. Private reads are disabled on nonloopback hosts. No trading or arbitrary external URL fetch is exposed.

## Local testing

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Visit /facility-exposure.html; enter a genuine FRS Registry ID and SEC CIK from their official searches. Capture both. Submit a source-linked *potential* affiliation and inspect event proximity candidates. Test the same data with an earlier as-of cutoff and verify that no future local observations leak into that view.

Automated tests use fixtures. Real provider lookup acceptance, licenses/rate limits, browser keyboard/UI checks, geospatial data quality, current ownership effective dates, independent evidence of financial impact and multi-tenant readiness remain outstanding.

## Next recommended milestone

v0.38 should add independent source-document relationship extraction, effective-date checks, human adjudication of real ownership chains and historical facility exposure, with explicit unresolved/no-proof states. Do not rank issuers for investment until actual affiliations, incident footprints and materiality have been sourced and assessed.
