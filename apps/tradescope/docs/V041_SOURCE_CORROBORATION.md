# ResearchOS v0.41 — P0 Sprint 6 Source Corroboration Dossier

Branch: feature/tradescope-v018-unified-development. PR #19 stays draft and unmerged.
Workspace: http://127.0.0.1:8000/corroboration-case.html
Navigation: Company Research → Facility Intelligence → Source Corroboration Dossier.

## Feature

This module composes previously captured EPA, SEC, GLEIF and human SEC filing-review observations into a deterministic point-in-time **research case**. It performs no upstream network requests or writes to source journals.

It combines:
- EPA FRS 12-digit Registry ID, reported facility name, original fixed source URL, capture time and response digest.
- SEC CIK filer identity, reported ticker, capture clock and digest.
- SEC document excerpt that literally matched an independently fetched v0.38 document from the exact URL already recorded with the human relationship hypothesis.
- GLEIF Level 1 LEI identity. The CIK↔LEI mapping remains a submitted operator **candidate**, never a certified same-entity link.
- GLEIF Level 2 direct accounting consolidation parent and periods: provider-reported, not proof of share ownership, site operation or supplier contracts.
- Analyst-proposed legal relationship intervals and two unauthenticated reviewer aliases (aggregates only).

Every proposition has a separate source, local capture time, statement and qualification. The evidence matrix reports SOURCE_REPORTED, LITERAL_TEXT_OBSERVED, ANALYST_CANDIDATE_ONLY, GLEIF_SOURCE_REPORTED_ONLY, SOURCE_CONFLICT, OPERATOR_PROPOSED_ONLY, UNKNOWN, INSUFFICIENT, NOT_AVAILABLE, NOT_VERIFIED and NOT_MEASURED as appropriate. Distinct official providers can describe **different propositions**; combining them is not independently corroborated legal ownership.

The dossier cannot certify the target owner/operator/supplier relationship. Conflicting GLEIF parents or disputed human reviews are preserved as a conflicted research lead, never resolved by artificial scores. Legal owner/operator, independently corroborated same-proposition proof, authenticated reviewer, historical original publication, issuer materiality and trading outcome fields remain false/null.

Each case includes a deterministic JSON SHA-256 manifest and can be exported from the browser. Reviewer aliases, original private notes and provider credentials are excluded. Same as-of cutoff is applied to all existing local source services, and the dossier independently checks every related observation's capture clock to block future-dated leakage.

## Read-only local API

- GET /api/corroboration-case/catalog
- GET /api/corroboration-case/inventory?asOf=2026-11-15T18%3A00%3A00Z
- GET /api/corroboration-case/case?relationshipId=crosswalk-UUID&asOf=2026-11-15T18%3A00%3A00Z

No POST, arbitrary web URL, model access, source fetch or journal mutation was added. Nonloopback private API reads are denied. Static builds allowlist UI assets and do not copy private source records.

## Local acceptance

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open /corroboration-case.html. If no saved claim exists, first use /facility-exposure.html to separately capture a genuine EPA facility and SEC filer. Never claim a link simply because names match. Capture relevant source excerpts through /relationship-verification.html and legal-entity/parent observations through /entity-graph.html. Compare the dossier as-of time before and after actual capture. Confirm that later information is absent from historical snapshots and that source diversity cannot produce a verified ownership verdict.

## User action needed only for real provider acceptance

1. Check a genuine SEC CIK and 12-digit EPA FRS Registry ID in the official registries; do not assume they refer to the same operating business.
2. Check a real GLEIF LEI, its reported direct accounting parent, and whether it represents the legal entity in the SEC document. LEI alone does not authorize a CIK mapping.
3. Set truthful SEC automation contact identification in ignored local .env and confirm EPA/SEC/GLEIF access/rate limits, data retention and redistribution rights. Never commit credentials or contact secrets.
4. Retrieve an actual relevant SEC filing and verify the matched text, document dates, named legal entities and independent supporting facility ownership/operator evidence.
5. Validate source original first-publication/revision clocks before any historical backtest.
6. Run the workstation browser flow and check mobile/keyboard behavior.

Mocked GitHub CI does not satisfy these live/legal/customer acceptance gates. Real provider acceptance and independently verified company→subsidiary→facility links are still open P0 work. Sprints 7–10 hazard footprint, historical leakage, economic transmission and negative controls remain ahead.

Next work order: capture/validate a real corroborated case with authorized provider access; build hazard-footprint integrations in P0 Sprint 7. P1 remains deferred.
