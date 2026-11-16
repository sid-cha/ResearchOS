# ResearchOS v0.38 — SEC Relationship Evidence and Effective-Date Review

**Repository:** sid-cha/ResearchOS
**Development:** cumulative branch feature/tradescope-v018-unified-development, draft PR #19
**Workspace:** http://127.0.0.1:8000/relationship-verification.html
**Navigation:** Company Research → Facility Intelligence → Relationship Evidence Review / Effective-Date Timeline.

## Release boundary

v0.38 builds a *document-evidence and human-review workflow*, **not** automatic certification of company–facility ownership.

The v0.37 source records identify an EPA FRS physical site and, independently, a SEC EDGAR filer. A submitted potential owner/operator/customer/supplier relationship is not supported simply by either record. v0.38 can examine the submitted SEC document text, preserve its observed contents fingerprint, record a proposed effective interval, and gather adversarial reviewer opinions. It deliberately never marks the connection VERIFIED_BY_SEC, OWNERSHIP_CONFIRMED, MATERIALITY_VERIFIED, or commercially actionable.

SEC provides public EDGAR submissions and the public archive of filings; its submissions API does not supply a normalized facility-ownership ledger. For true subsidiary relationships, a filing's exhibit lists, schedules, narrative and filing effective dates need independent contextual analysis. An excerpt in a current document may describe a prior transaction, a named subsidiary, a former owner, a counterparty, or a hypothetical. A date asserted by an operator is not a certified historical effective date.

Official references:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
- https://www.sec.gov/about/webmaster-frequently-asked-questions

## New functionality

### 1. SEC filing text capture

Select a previously recorded v0.37 relationship by stable journal ID. Supply a **specific 40–450-character verbatim excerpt** from its pre-registered SEC filing URL. The application uses that exact URL, never a new browser-supplied target. Requests are server-only GET on an approved HTTPS SEC archive host and are not performed by merely opening the page.

Responses must be successful text/html, text/plain, XML or XHTML with:
- redirects rejected,
- a 9-second deadline,
- streamed body limited to 300 KB,
- no arbitrary external host,
- no server-side model tools or executable downloaded content.

HTML scripts/styles/tags are stripped for deterministic whitespace-normalized, case-insensitive literal matching. Each saved source observation records the SHA-256 of original response bytes, read length, time **after** receipt, the supplied excerpt and a short matching context (when found). The whole filing body is not redistributed or exposed through the UI; it is not treated as a secure archive of the full original filing. Oversized filings and PDFs are declined rather than partially summarized as if complete. A literal match makes no semantic assertion about legal ownership or supply-chain contracts.

Note: SEC automated requests require a declared contact-bearing User-Agent and compliance with SEC access policies. Live filing formats and permissions require external acceptance. Use a real authorized contact in the ignored private environment configuration.

### 2. Claimed effective dates

After an excerpt is found, a human analyst can register a bounded explanation with a proposed YYYY-MM-DD effective-from date and optional effective-through date. This is a **new timestamped assertion** in a private evidence journal, not proof that the relationship really began/ended then.

The as-of view always uses the **local record-creation timestamp**, not a backdated proposed effective date, SEC filing date, or source-document Last-Modified header. Reconstructing historical beliefs by the retroactive date is prohibited.

### 3. Independent Anti-Agent / dual review

Each effective-date proposal can receive two separate reviewer-alias submissions, each with:
- one of SUPPORTS_CLAIM, REFUTES_CLAIM or INSUFFICIENT_EVIDENCE;
- a 30–600-character rationale focused on alternate entity identity, subsidiary legal structure, filing context, date limitations or missing site-specific corroboration.

The first reviewer vote is not disclosed by the API until a second alias votes. Once two aliases have voted, the status is either TWO_UNAUTHENTICATED_ALIASES_AGREE or DISPUTED, and the only disclosed decision is a matching aggregate. Reviewers are **not authenticated** and no claim of true reviewer independence is made. A matching SUPPORTS_CLAIM pair does **not** automatically qualify an event/facility link as independently verified ownership. The original v0.37 relation and its financial flags remain untouched.

### 4. Private, bounded, append-only logical journal

Default path: apps/tradescope/.local-data/relationship-verifications.json
Optional local private configuration:

    HOST=127.0.0.1
    RELATIONSHIP_VERIFICATION_STORE_PATH=C:/Users/you/ResearchOS-data/relationship-verifications.json
    SEC_USER_AGENT=ResearchOS Research Team your-real-contact@example.com

All DOCUMENT, PROPOSAL and REVIEW entries are sequenced, timestamped, SHA-256 hash-linked, and stored with temporary-file atomic rename. Default maximum: 240 entries, 6 MB. Corrupt/mutated journals fail closed on restart.

This is not WORM storage, legal evidence certification, secure reviewer identity, distributed transaction locking or external timestamp notarization. It is a single-process local pilot.

## API

Read-only, loopback-bound:
- GET /api/relationship-verification/catalog
- GET /api/relationship-verification/view
- GET /api/relationship-verification/view?asOf=2026-11-15T18%3A00%3A00Z

Explicit loopback same-origin POST with Content-Type application/json and the request-intent header X-ResearchOS-Relationship-Verification: 1:
- POST /api/relationship-verification/capture with relationshipId and excerpt;
- POST /api/relationship-verification/propose with relationshipId, documentId, effectiveFrom, optional effectiveTo and explanation;
- POST /api/relationship-verification/review with proposalId, reviewer, vote and rationale.

Requests have strict key allowlists and small JSON body limits. No arbitrary URL, company ID, server command, external model, or broker order can be supplied to these routes.

## Test locally

From apps/tradescope:

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

1. Visit /facility-exposure.html. Capture a real 12-digit FRS Registry ID and SEC CIK with permitted provider access.
2. Record a potential relationship and official SEC archive document link.
3. Follow **Challenge relationship evidence & dates**, or open /relationship-verification.html.
4. Paste a specific excerpt from that registered document and request capture; verify literal match/miss and digest. If upstream refuses the request or the source is too large, the app must fail without assuming proof.
5. Only when an excerpt matches, submit an effective-date proposal and inspect the first- and second-review aggregate statuses.
6. Set a local as-of cutoff before the first source capture or proposal. Verify that later records and reviews are absent even if the proposed effective-from date precedes that cutoff.
7. Try a non-SEC URL, unauthorized cross-site POST, invalid date interval or tampered local journal in the mocked tests; these should fail closed.

## Remaining work

- Actual provider acceptance against SEC documents and rate/rights checks; mock CI alone cannot validate the upstream.
- Authenticating independent reviewers and verifying that both were genuinely independent.
- A second independent source with credible facility/legal-entity corroboration, plus explicit legal subsidiary parent-child chains and SEC exhibit parsing.
- Independently verified contract start/end dates and the distinction between owner, operator, subsidiary, customer and supplier relationships.
- Historical FRS site boundaries, disaster footprint models, confirmed loss records, financial-materiality models and negative controls.
- Production durable DB, authentication, backups, locking, E2E browser/device tests and secure deployment.

**Next suggested milestone:** v0.39 independent multi-source entity resolution and reviewer-authenticated legal ownership case building. No issuer risk scores until genuine relationship and impact ground truth exists.
