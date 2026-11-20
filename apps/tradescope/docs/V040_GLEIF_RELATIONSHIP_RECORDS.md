# ResearchOS v0.40 — P0 Sprint 6: GLEIF Level 2 relationship records and source conflicts

Branch: feature/tradescope-v018-unified-development. Cumulative PR #19 stays draft.

## Purpose

Continue the P0 evidence path from EPA FRS facility identifiers (v0.37), SEC CIK filers and source excerpts (v0.38), GLEIF LEI legal-entity and direct-parent identity snapshots (v0.39) to a **separately captured GLEIF Level 2 relationship record**.

GLEIF documents Level 2 relationships as reported accounting consolidation (not necessarily direct legal share ownership) with optional relationship/accounting/document filing periods, validation and reporting attributes. This increment uses the fixed official endpoint:

    GET https://api.gleif.org/api/v1/lei-records/{LEI}/direct-parent-relationship

A child LEI must already be captured. The returned JSON must identify the same child, a distinct LEI parent, the exact IS_DIRECTLY_CONSOLIDATED_BY relationship type and a bounded set of recognized period types. On 404, record RELATIONSHIP_RECORD_NOT_RETURNED, not absence of parent.

Accepted period categories retain their separate semantics:
- RELATIONSHIP_PERIOD: provider-reported duration of a relationship
- ACCOUNTING_PERIOD: covered accounting documents/financial period
- DOCUMENT_FILING_PERIOD: period associated with filing documents

The record stores source response SHA-256, local post-response timestamp, optional reported corroboration level and registration status. A GLEIF "FULLY_CORROBORATED" field describes GLEIF's source-level accounting relationship validation; it does not independently validate facility ownership, buyer/supplier relationships, real estate legal control or source's original historical first-publication date.

## Source conflict detection

An earlier captured direct-parent identity response and a later Level 2 relationship response are maintained **separately**. If both report a parent LEI and they disagree as of the selected local knowledge cutoff, the graph returns PARENT_SOURCES_CONFLICT with both raw identifiers and human-review-required warning. No automatic majority vote, merge or ownership certification occurs. These are from the same GLEIF provider, so neither is considered an independent second source.

Both source captures remain local, explicit and point-in-time; a relationship date printed in a newly fetched record does not backdate an earlier research snapshot.

## UI and API

The existing workspace http://127.0.0.1:8000/entity-graph.html now adds:
- Capture GLEIF Level 2 relationship record
- GLEIF Level 2 provider contract diagnostic
- Source-reported relationship/accounting/filing periods
- Anti-Agent source-parent conflict cards and capture timestamps

Local explicit POST:

    POST /api/entity-graph/relationship
    Content-Type: application/json
    X-ResearchOS-Entity-Graph: 1
    {"lei":"5493001KJTIIGC8Y1R12"}

A successful response may say no record was returned. That is not a verified corporate structure claim. Read-only GET /api/entity-graph/view includes level2Records, relationshipConflicts, and inventory.level2Records. The same loopback/same-origin restrictions, strict input bounds, private hash-chain file and API status guards apply.

## Source references

- https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-who-owns-whom
- https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-relationship-record-rr-cdf-2-1-format
- https://www.gleif.org/en/lei-data/gleif-api
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.epa.gov/frs/frs-api

## Acceptance

From apps/tradescope:

    npm test
    npm run build:static
    npm start

1. Start from captured LEI; retrieve direct-parent identity and then Level 2 relationship separately on explicit clicks.
2. Compare reported start/end/accounting periods and check no new record appears before the local capture clock.
3. Observe missing/404, malformed, mismatched child-parent, conflicting parent and invalid period in regression tests.
4. A conflict must remain unresolved; no issuer financial impact or legal owner may be inferred.
5. Confirm live upstream metadata, rights and browser UX separately; CI uses bounded fixtures.

## P0 work still incomplete

- An **independent** legal-entity CIK↔LEI mapping; no automatic match from names.
- An independently corroborated owner/operator or supplier relationship with a specific EPA site and real-effective legal dates.
- Authenticated independent reviewers; SEC exhibit/subsidiary contextual review.
- Actual live EPA/SEC/GLEIF acceptance, data-use rights, original issue/revision clocks.
- Hazard polygon intersection and measured facility damage, historical economic outcomes and negative controls.

This is an additional P0-6 **engineering increment**, not a claim that Sprint 6's independent-legal-proof exit gate is satisfied. Do not commence new P1 scope merely because mocked CI is green.
