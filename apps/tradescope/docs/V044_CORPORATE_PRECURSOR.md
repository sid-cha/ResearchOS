# ResearchOS v0.44 — P0 Sprint 8 Corporate & Regulatory Precursor Monitor

**Branch:** feature/tradescope-v018-unified-development · **PR:** #19 draft/unmerged
**Workspace:** http://127.0.0.1:8000/corporate-precursor.html
**Navigation:** Company Research → Issuer Research → Corporate Precursor Monitor / News First-Seen Replay.

## Problem / research objective

A corporate event may develop through investigative reporting, official inquiries, changing export-control rules and verified filings over a long period. Detecting a source-backed regulatory **risk precursor** is distinct from predicting confidential intelligence activity or claiming any named person engaged in wrongdoing. The platform should issue an accountable review alert from documented evidence, not a sensational allegation classifier presented as ground truth.

**NVIDIA / Megaspeed case protocol** (research candidate only, no automatically preloaded incident or assumed verified espionage):
1. Review the October 2025 contemporaneous investigative reporting about NVIDIA chip exports, its relevant counterparties and any independently documented regulatory inquiries; verify the original full-text publication dates against source archives and contemporaneous agency communications.
2. Treat any later 2026 reporting about an alleged intelligence-targeting operation as **a separate, attributed media claim**, neither a proved intelligence finding nor retroactive evidence for earlier alerts.
3. Replay the case at each source clock using **only what was actually observed by ResearchOS at that time**. A story dated 2025 but first discovered from a retrospective feed in 2026 MUST NOT be marked as "ResearchOS alerted in 2025".
4. Only after independent legal entity resolution link counterparty, issuer and any named individual to a specific business relationship. Do not classify anyone as a spy from a headline.
5. Before evaluating economic importance, check the market session, other contemporaneous NVDA events, stock/benchmark adjustments, materiality and precommitted negative controls. No calibrated price impact prediction currently exists.

## Built functionality

**Explicit, bounded, manual captures** for a small registered issuer watch universe:

- GDELT public DOC article-list results: fixed validated issuer query on a one-week window, 40-row cap, source URL/domain/headline, GDELT seendate stored ONLY as **providerIndexedAt** (not verified publisher clock).
- Federal Register published document API keyword searches: fixed issuer term; source-host validated official document URL; only a keyword **candidate**. Returned publication_date retained at **day precision**—not arbitrarily set to 00:00 UTC as a public announcement time.
- Alpaca issuer news: existing credentials/entitlement-aware source adapter, registered issuer symbols, 30-row cap. Provider created_at retained as provider metadata, not independent original publisher time.

Data normalization deliberately keeps only titles, original source links, provider indices/filing day, risk categories and small metadata; no copyrighted article bodies are retained or redistributed. Strict company name or ticker must appear in the headline for media records. This avoids easy false-positive source matching but will miss some relevant articles about counterparties, aliases and subsidiaries until P0 entity-graph expansion.

Media risk keywords classify REVIEW TRIAGE only:
- NATIONAL_SECURITY_ALLEGATION → PROMPT_HUMAN_REVIEW
- EXPORT_CONTROL, REGULATORY_SCRUTINY → ELEVATED_HUMAN_REVIEW
- EXECUTIVE_GOVERNANCE, SUPPLY_CHAIN → RESEARCH_QUEUE
- Federal Register keyword hits → OFFICIAL_DOCUMENT_SEARCH_CANDIDATE, **never an automatic media alert or independently verified government action**

A title mentioning espionage does **not** establish wrongdoing, foreign agency connection, personal involvement, possession of nonpublic information, or future corporate performance.

## Point-in-time provenance and security

Each manual capture records its own local UTC receipt clock, source-response SHA-256, provider count, filtered items and skipped reasons. Hash-linked, atomically saved, private JSON journal is limited to 120 capture snapshots / 7 MB, and tampered records fail closed on restart. Duplicate response digests are idempotent. A repeated article URL is tracked with local first-seen and revision times, not backdated to GDELT indexing or Federal Register publication date.

Default journal: apps/tradescope/.local-data/corporate-precursor.json.
Private ignored .env:

    HOST=127.0.0.1
    CORPORATE_PRECURSOR_CAPTURE_ENABLED=true
    CORPORATE_PRECURSOR_RIGHTS_CONFIRMED=true
    # CORPORATE_PRECURSOR_STORE_PATH=C:/Users/you/ResearchOS-data/corporate-precursor.json
    # APCA_API_KEY_ID=...
    # APCA_API_SECRET_KEY=...

Both capture controls must be explicitly true. They are operator attestations, NOT independent evidence of legal data rights. Verify GDELT/Federal Register rate terms and Alpaca licensing before storing or commercializing source data. No credentials should be committed, pasted into PRs or exposed in the browser.

**API**:
- GET /api/corporate-precursor/catalog
- GET /api/corporate-precursor/view?symbol=NVDA&asOf=2026-11-16T17%3A00%3A00Z
- POST /api/corporate-precursor/capture; JSON {"symbol":"NVDA","source":"GDELT_MEDIA"} or FEDERAL_REGISTER or ALPACA_MEDIA. Strict same-origin, loopback and X-ResearchOS-Corporate-Precursor: 1 request intent.

Opening the UI or replaying the archive causes no external provider request. No autonomous polling, push notification, risk probability, brokerage tool, allegation adjudication or live market prediction is implemented here.

## Tests and independent acceptance

From apps/tradescope:

    npm test
    npm run build:static
    npm start

Open /corporate-precursor.html. Set only permitted local controls, manually capture NVDA GDELT, Federal Register or Alpaca observations, inspect the provider-indexed versus LOCAL first-seen clocks, and replay older cutoffs. Confirm a historical GDELT source date from 2025 captured now NEVER appears in a 2025 local ResearchOS view.

Fixture tests cover source URL restrictions, provider schema bounds/truncation, nonissuer title filtering, allegations never equaling wrongdoing, official keyword hits never equaling official action, source revisions, restart tamper failure and CSRF boundaries.

**P0 Sprint 8 gates still open**: live GDELT/Alpaca/Federal Register schema acceptance and rate/data-rights review; verified original NYT publication timestamps; publisher article revision tracking; true full-market early-news coverage; independently verified company/counterparty relationship graph; official agency-document corroboration; real push/notification delivery; well-defined detection latency SLA; retrospective outcome/negative-control evaluation. These are not solved by green mocked CI.

**Next P0:** validate real indexed/live sources, add first-publication/vintage evidence archive with reliable timestamps and adjudicated source links; then P0 Sprint 9 end-to-end case evidence and Sprint 10 bias-aware scoring. P1 remains deferred.
