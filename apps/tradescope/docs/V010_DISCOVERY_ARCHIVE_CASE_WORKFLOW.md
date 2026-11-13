# v0.10 issuer discovery → filing revisions → investigations

Status: **review build, not released / not authenticated**. This work branches from
`feature/tradescope-regulatory-tax-foundation`; do not merge directly into `main`.

## End-to-end workflow

1. Start the local Node server (`cd apps/tradescope && npm start`) and use
   `http://127.0.0.1:8000`.
2. Open **Research → Issuer Discovery**.
3. Search a company/ticker using the dated SEC company/exchange directory. Select and
   explicitly **Register Official Identity**. An official CIK identifies an **issuer**;
   it is not permanent share-class/security identity, industry membership or proof of
   feed entitlement. Local registration capacity: 50 issuers including seed entries.
4. Create a named local watchlist from registered symbols. Updates require the saved
   revision; a watchlist does **not** subscribe to Alpaca streaming.
5. **Load Issuer Research** to retrieve recent SEC filing metadata and, where present,
   SEC public financial-statement facts. This supports registered non-pilot issuers
   without expanding the existing ten-symbol market monitoring/Atlas coverage.
6. Select one SEC filing and **Analyze Source**. Classifications such as 8-K Items
   4.01, 4.02 and 3.01 require primary-source cited passages; no automatic misconduct
   conclusion is made.
7. Optional local-only **Capture Revision** archives a bounded normalized evidence
   record with the actual local `capturedAt` and content hash. Official amendment vs
   data enrichment is distinguished; historical backfill cannot claim earlier
   ResearchOS knowledge.
8. From the saved archive, select **Open Exact Revision in Investigations**, or
   display its revision history and select an older captured version. An exact source
   snapshot (revision UUID, content hash, capturedAt, filing accession and cited
   passages) is saved with the investigation, never a mutable latest pointer.
   Repeated case creation/attachment of the same revision is idempotent.

## Local-only config

Add to local `.env` only if you want to capture official source observations:

```text
SEC_USER_AGENT=TradeScopeResearch your-real-contact@example.com
REGULATORY_LOCAL_CAPTURE_ENABLED=true
```

Do not commit the actual `.env`, any Alpaca keys, account tokens, or other secrets.
Capture and case-handoff writes require loopback, same-origin, JSON-only requests.
These controls are **not** login/signup or a production authorization boundary.

## API contract (Node :8000)

| Method | Resource | Function |
| --- | --- | --- |
| GET | `/api/discovery/search?q=<name>` | Directory + locally registered matches |
| POST | `/api/discovery/register` | Official issuer registration (`{symbol}`) |
| GET | `/api/discovery/instruments` | Local registry |
| GET | `/api/discovery/watchlists` | Saved local watchlists |
| POST | `/api/discovery/watchlist` | Create (`{name,symbols}`) |
| PATCH | `/api/discovery/watchlist` | Edit (`{id,expectedRevision,name,symbols}`) |
| DELETE | `/api/discovery/watchlist?id=...&expectedRevision=...` | Delete with revision check |
| GET | `/api/discovery/fundamentals?symbol=...` | Public SEC financial metrics |
| GET | `/api/discovery/filings?symbol=...` | Recent official SEC filings |
| GET | `/api/regulatory/filing-analysis?symbol=...&accession=...` | Source-cited classification |
| POST | `/api/regulatory/capture` | Disabled-by-default local event capture |
| GET | `/api/regulatory/archive?symbol=...` | Locally captured SEC events |
| GET | `/api/regulatory/archive/revisions?eventId=...` | Captured immutable versions |
| GET | `/api/regulatory/archive/revision?eventId=...&revisionId=...` | Exact verified revision |
| GET | `/api/regulatory/archive/at-cutoff?eventId=...&cutoff=<ISO>` | Locally known revision at UTC cutoff |
| POST | `/api/regulatory/investigate` | `{eventId,revisionId,symbol}`; optional existing `caseId,expectedRevision` |

All endpoints are local single-user prototypes. GET analysis never silently writes an
archive/alert. Store failures are explicit. Case references are populated from the trusted
server archive, **not arbitrary client-supplied evidence metadata**. Case changes and
archive writes are individually atomic, but the separate corporate-alert / archive /
case JSON files are **not one transaction**; for hosted production migrate to the
PostgreSQL shared transaction/outbox design.

## Source and security boundaries

- IEX quotes/stream remain a *single-venue* market-data pilot limited to the original
  monitored symbols; no cross-provider attribution or consolidated exchange claim.
- SEC XBRL tax-disclosure data is not a confidential IRS tax return, and financial
  statement disclosures are not evidence of tax evasion.
- Registered symbols currently support SEC public fundamentals, filings and archival
  investigations. Broader market screening and Atlas remain separately gated until
  provider entitlements and quantitative-data coverage are validated.
- Historic knowledge cutoffs use local archive capture time, **never** backdated
  provider publication or issuer filing period.
- The public Vercel static preview has no Node API or persistent backend.
- Existing local cases created before the archive extension remain readable; new
  `ARCHIVED_REVISION` evidence adds fields without rewriting old records.

## Acceptance / tests

Run:

```powershell
cd apps/tradescope
npm test
npm run build:static
npm start
```

Add `SEC_USER_AGENT` to enable authenticated SEC user-agent requests. New local
tests cover issuer API, origin/loopback guards, revisioned watchlists, captured-case
idempotency and provenance, exact revision retrieval, protected handoff and a mocked
browser workflow. Full authenticated SEC integration and full interactive browser
acceptance **must be checked on this branch** before marking v0.10 complete.

## Verified CI checkpoint (2026-11-12 / 2026-11-13 UTC)

- GitHub Actions **TradeScope Node checks** completed successfully on the draft branch.
- `npm test`: **323 tests passed; 0 failed** (Node 22, mocked provider and local tests).
- `npm run build:static`: succeeded; exactly **18 allowlisted public assets**, no private environment files.
- Verified run: https://github.com/sid-cha/ResearchOS/actions/runs/43348800863
- This does **not** establish live authenticated SEC/API performance, real-browser cross-device compatibility, PostgreSQL multi-writer safety or public-authentication readiness.

## Next gates

1. CI, local and real-browser regression checks, including provider rate-limit and
   SEC form availability, browser logout/refresh of static-only preview and archive
   capacity errors.
2. Migrate the local registry, revision archive, alerts and investigations into
   authoritative Java/Postgres storage with transactions and append-only evidence.
3. Implement verified OIDC login/signup and workspace authorization before enabling
   any publicly reachable mutable/private API.
4. Expand SEC issuer coverage to quantified screener/Atlas only when market-data
   coverage and entity/security identifiers are fit for purpose.
