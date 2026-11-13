# TradeScope v0.24 — Durable Research Evidence Ledger

Branch: feature/tradescope-v018-unified-development
Cumulative review: https://github.com/sid-cha/ResearchOS/pull/19 (draft, unmerged)
Status: local research pilot; live-provider and browser acceptance still pending.

## Purpose

TradeScope could previously retrieve historic FRED/ALFRED observations and create economic dossiers, but did not persist an inspected, revision-aware record of what the application actually captured. The v0.24 ledger is an opt-in local single-process JSONL source journal with hash chaining, bounded normalization, revisions and a read-only inspection interface.

This is **not** a trusted independently signed timestamp, immutable/WORM storage, provider license certification, issuer-impact validation, or proof that a historical source was publicly available to an investor at a given moment.

## Delivered functionality

- NEW lib/evidence-ledger.mjs: source-allowlisted normalized captures, SHA-256 payload and record hashes, previous-record chaining, serial single-process append, sync on successful write, no silent repair, integrity verification before reads or writes.
- NEW evidence-ledger.html / CSS / JS: see capture count/integrity, filter by source and subject, inspect local revision status, record digest and capped normalized source facts.
- FRED explorer integration: when enabled, successful noncached provider requests write normalized series, search result, release mapping, revision-calendar, release-calendar and historically calendar-day as-of observations. Up to 500 observations per request.
- Economic transmission dossier integration: when enabled, persist SOURCE STATUS + graph coverage + up to 80 source-context rows taken from nodes. Example source contexts include NASA monthly observations, EIA v2 Henry Hub, USDA crop production, UN Comtrade annual flows, locally transcribed USGS statistics, disclosed issuer business activity, and issued NOAA source calendar dates. Do not persist entire untrusted report text.
- Duplicate same-scope normalized content is not re-appended; a changed later capture links to the previous same-scope sequence and is labeled CHANGED_SINCE_LOCAL_CAPTURE, which is a local comparison, NOT proof of the provider's own revision.
- HTTP read-only: GET /api/evidence-ledger/status ; GET /api/evidence-ledger/entries with optional source, subject and limit (1–100); GET /api/evidence-ledger/detail?seq=1 . No remote writes, arbitrary URL parameters or user-supplied source data.
- The journal is OFF BY DEFAULT, only enabled on 127.0.0.1, localhost or ::1 when RESEARCH_EVIDENCE_LEDGER_ENABLED=true, and stored at apps/tradescope/.local-data/evidence-journal.jsonl (ignored by Git).

## Source clocks — do not conflate

| Evidence field | Meaning | Not a guarantee of |
| --- | --- | --- |
| capturedAt | Local journal-write UTC timestamp | Independent clock notarization |
| requestedAsOf | Historic calendar-day cutoff requested in an ALFRED query | Source originally available at that date |
| sourceIssuedAt | Independently verified source issue time | Always NULL in this pilot |
| sourceReleaseDate | Independently matched publisher release calendar date | Always NULL at aggregate journal-record level |
| NOAA issueDate fact | Calendar date reported by an issued NOAA CPC archived document | Original revision/time-of-day verification |
| providerFetchedAt | Source-module fetch clock where available | Publisher's original publication clock |
| historicalEligibility | Historical first-available eligibility | Always UNVERIFIED_OR_NOT_APPLICABLE |
| sourcePublishedClockVerified | Independent original-publication verification | Always FALSE |
| licenseStatus | Provider use/redistribution review | Always NOT_REVIEWED |
| priorScopeSeq | Earlier local capture for same normalized query scope | Confirmation of upstream official revision |

Historical as-of replay must not use a record fetched in 2026 as proof of local capture in 2020. ALFRED calendar-day values and provider-native original publication times are not the same evidence.

## Persistence, security and limits

- File is created under the existing git-ignored .local-data/ directory, mode 0600 on supported filesystems.
- Bounded: 10,000 entries / 16 MB; max 105,000 characters per capture, approved official URLs and kinds.
- Every read and append verifies the complete ordered SHA-256 chain. Incomplete trailing lines, tampered facts, invalid records and oversize files fail explicitly.
- No original provider request URLs with API key parameters, browser-exposed tokens, arbitrary-source HTML or unrestricted third-party links are archived.
- This is SINGLE-PROCESS local development storage, not cross-process safe, tenant isolated, protected against administrative overwrite, backed up, or regulatory-grade retention. Independently retain a journal head hash to detect someone who rewrites an entire chain.
- Provider data license conditions and retention periods are not established. User must review redistribution and commercial usage rights before hosting the feature.

## Enable it locally only after reviewing source rights

Edit your own ignored apps/tradescope/.env:

    RESEARCH_EVIDENCE_LEDGER_ENABLED=true
    HOST=127.0.0.1
    PORT=8001

Fresh rotated data keys belong in the same local .env, never in GitHub or chat. Keys shared earlier should be treated as exposed and reissued.

Run from apps/tradescope:

    npm test
    npm run build:static
    npm start

Then browse:
- http://127.0.0.1:8001/evidence-ledger.html — inspect local journal and integrity state
- http://127.0.0.1:8001/fred-research.html — run historical FRED/ALFRED research; then return to inspect its capture
- http://127.0.0.1:8001/transmission-lab.html — run ENSO or gas research and inspect the stored, source-limited summary

Identical repeated content is deduplicated. A local server restart must preserve captures. Tamper-rejection tests use disposable temporary files, NOT your working journal.

## Deferred acceptance and next development

1. Source-specific original release-vintage checks, verified issue-date semantics, first-seen clock and provider rights review.
2. Transactional multi-process storage and optional immutable off-machine signed chain anchors, with scoped access controls.
3. Verified geography and issuer/facility/supplier IDs and exposure joins; measured transmission effects and negative controls.
4. Before commercial launch, implement authenticated users, access permissions, partitioned tenant storage and retention policies.
5. The deferred six-agent Research Desk may consume verified, permission-scoped evidence, but it must not invent publication clocks or causal relationships.

Tests added in tests/evidence-ledger.test.mjs cover durability, persistence, deduplication, revision chaining, concurrent serialization, corruption/partial-file rejection, source and URL validation, credentials exclusion, HTTP read-only access, FRED capture, dossier capture and UI assets. CI mocks do not replace live provider validation.
