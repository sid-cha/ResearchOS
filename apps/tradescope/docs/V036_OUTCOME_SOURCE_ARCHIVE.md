# ResearchOS / TradeScope v0.36 — Official-Source Snapshot Archive and Prospective Dataset Exports

**Branch:** feature/tradescope-v018-unified-development. **PR:** #19, draft/unmerged.
**UI:** http://127.0.0.1:8000/agent-validation.html#official-source-evidence and #dataset-export
**Navigation:** Research Agents → Research Review → Official Evidence Archive / Dataset Export.
**Scope:** Local single-user source-document retrieval and descriptive research reproducibility. This release does not certify reviewer identity, outcome truth, independent economic causal inference, predictive precision or false-positive rate.

## Official-source capture

A reviewer first registers an outcome, waits until the horizon completes and manually submits a dated public evidence URL through the existing v0.35 outcome-label workflow. Only then can v0.36 capture the document for that exact run/registration and previously submitted URL.

Approved fixed HTTPS hosts:
- www.sec.gov, data.sec.gov (SEC)
- earthquake.usgs.gov (USGS)
- eonet.gsfc.nasa.gov (NASA EONET)
- nasstatus.faa.gov, www.faa.gov (FAA)
- www.weather.gov (NWS)
- www.epa.gov (EPA)

No arbitrary user-selected DNS names, localhost/private IP addresses, credentials in URLs, plain HTTP, nonstandard ports or redirections are permitted. Only server-side GET with fixed input origin is allowed. Request is not issued by merely opening the page or reading the API. No trade or local-model tool is enabled.

A successful official response is streamed with a 120 KB maximum, no redirects, an eight-second timeout and a short list of text/JSON/XML content types. PDF, binary, over-limit or failed sources are explicitly rejected. The body SHA-256 is recorded with a bounded plaintext excerpt, provider response headers, timestamp **after** retrieval, source URL, run ID and registration ID. The full body is intentionally NOT redistributed in the dataset. SEC may require an appropriate SEC_USER_AGENT with real operator contact information in the private local .env; provider rate/retention rights still need verification.

Source content being retrieved and hashed proves neither the reviewer-reported outcome nor the document's original publication time. Content semantics are not independently adjudicated, even if two aliases agreed on the label. An HTTP 200 response also does not prove a provider is current, complete or free from future revisions. Capture timestamps are local, not independently notarized.

The private append-only logical journal is at apps/tradescope/.local-data/outcome-evidence-journal.json by default; optional override:

    HOST=127.0.0.1
    OUTCOME_EVIDENCE_STORE_PATH=C:/Users/you/ResearchOS-data/outcome-evidence-journal.json

It enforces a maximum 80 snapshots and 4 MB archive (defaults), atomic temporary-file rename, single-process serialization, SHA-256 linked records and fail-closed reopening on tampering. Unchanged content from the same run/registration/URL is deduplicated; changed content is a new linked capture. Hashes are not WORM or external timestamping, and cannot defend against a malicious user who rewrites and rehashes the local journal.

## Point-in-time prospective dataset

v0.36 exports the frozen v0.35 prospective registration and later manually attested outcomes with a caller-selected as-of UTC instant.

- Only registrations **saved** by as-of are included.
- Review status counts and shared verdicts use only reviewer events actually recorded by as-of. No first/solo reviewer decision is disclosed.
- Source document snapshots appear only if their local capture time is at or before as-of. An official source's own (possibly old) publication header cannot backdate first availability.
- Rows include registered question, criterion, horizon, operator-declared candidate/control cohort, immutable run hash, event ID, agreement state, evidence document hashes and source origin metadata.
- Reviewer identities, review rationales, raw page content, LLM prompts and private API credentials are excluded.
- The deterministic JSON export includes a stable SHA-256 manifest over the canonical core dataset; CSV includes the same manifest header and prevents spreadsheet formula-leading cells from executing as formulas.
- The dataset is descriptive: predictiveAccuracy, precision, recall, verifiedFalsePositiveRate, groundTruthCases and calibrated forecast probability remain null or zero. Operator-declared cohorts and unauthenticated agreement are NOT certified negative controls, truth labels or predictions.

The JSON and CSV exports are generated from the existing private local database at the time of request and may be downloaded in the browser. No data are uploaded to external sites by exporting.

## Endpoints

- GET /api/outcome-evidence/catalog — configured source host allowlist and release limits.
- GET /api/outcome-evidence/snapshots?runId=desk-UUID — locally captured source snapshot metadata only.
- GET /api/outcome-evidence/dataset?format=json&asOf=2026-11-15T18%3A00%3A00Z — deterministic JSON.
- GET /api/outcome-evidence/dataset?format=csv&asOf=... — CSV with matching manifest.
- POST /api/outcome-evidence/capture — explicit empty-query local POST with JSON fields runId, registrationId, sourceUrl and X-ResearchOS-Outcome-Capture: 1.

POST requires a loopback-bound Node server and same-origin request guard. The source URL must match a label already attached to the same registration; anything else is rejected. No external URL is ever fetched by the dataset endpoints or UI page load.

## Windows acceptance

From apps/tradescope:

    npm test
    npm run build:static
    npm start

1. Create a captured-source run in the Agent Desk.
2. Preregister a measurable outcome with a one-day horizon in Evidence Validation.
3. After that horizon completes, submit a dated official-source review with a supported URL.
4. Open the official-source section and click Capture & hash. Expect a local SHA digest, capture clock and bounded excerpt (or an honest error for an upstream outage/format/licensing issue).
5. Export JSON at a selected cutoff before capture and after capture; compare manifest and source evidence availability. Repeating the same explicit cutoff without new eligible data must reproduce the same manifest.
6. Download CSV and verify only descriptive counts appear, without reviewer aliases and without false-prediction accuracy.
7. Test a disallowed host, redirect, oversize source, changed document body and corrupt local journal in automated tests; do not use a real private host for SSRF experiments.

## Still pending

- Identity-backed independent reviewer verification, source-claim semantic checking and real adjudicated outcome ground truth.
- Independently verified company facility ownership, true exposure measurements, correct point-in-time revised source publication clocks, real market counterfactuals and outside negative controls.
- Credible out-of-sample predictive performance with confidence intervals and disclosed false positives.
- Full authenticated multi-tenant storage, process-independent locks, signed archival provenance, external timestamp attestation and rights/licensing checks.
- Actual live SEC/FAA/USGS/EPA/NASA/NWS server acceptance and real-browser UX tests are NOT established by mocked CI.
- No claim that an individual official page independently verifies the economic hypothesis or that ResearchOS is ready to advise or execute securities transactions.

Next logical build: v0.37 reviewer identity and independently adjudicated outcome quality, or industry/company exposure source crosswalk with historical point-in-time verification.
