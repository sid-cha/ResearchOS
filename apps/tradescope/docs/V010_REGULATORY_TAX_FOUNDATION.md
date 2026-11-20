# v0.10 regulatory, audit and public-tax foundation — review branch

Status: **incremental implementation, not a released v0.10 build**. Based on `feature/tradescope-discovery-corporate-archive`, not `main`.

## Verified scope

- SEC 10-K/10-K/A public annual XBRL tax metrics: pre-tax income, reported income-tax expense, current/deferred tax expense, cash taxes paid, reported effective tax rate, deferred tax assets/liabilities, valuation allowance, and unrecognized tax benefits (where populated by the issuer).
- Each value retains its SEC accession, form, filing date, reporting period, GAAP tag, unit and source URL. Missing or unmatched values return `unavailable` rather than a fabricated estimate.
- Explicit `asOf` cutoff to prevent using future-filed revisions for historical research (day-level knowledge precision).
- SEC 8-K classifications based on source-cited Item 4.01 (auditor change), 4.02 (non-reliance on prior financial statements), and 3.01 (listing compliance), alongside previously supported corporate reporting classifications.
- An isolated regulatory HTTP controller; read-only requests have no archive writes. Deliberate local capture uses the v0.10 revision archive and corporate alert store.

## Local API (Node :8000)

- `GET /api/regulatory/tax?symbol=AAPL&asOf=2026-11-12`: SEC annual public tax disclosures; only 10-K/10-K/A facts that had been filed by the selected calendar date.
- `GET /api/regulatory/filings?symbol=AAPL`: recent official SEC filing metadata; **not** a regulatory verdict.
- `GET /api/regulatory/filing-analysis?symbol=AAPL&accession=XXXXXXXXXX-XX-XXXXXX`: extracts cited primary-document passages and classifications; **does not persist on GET**.
- `GET /api/regulatory/alerts?symbol=AAPL`: locally captured corporate alerts.
- `GET /api/regulatory/archive?symbol=AAPL`: locally observed SEC event/revision summaries.
- `POST /api/regulatory/capture` with JSON `{"symbol":"AAPL","accession":"XXXXXXXXXX-XX-XXXXXX"}`: explicitly capture an official filing into the archive and alert store. **Disabled by default.**

Set `REGULATORY_LOCAL_CAPTURE_ENABLED=true` in local-only `.env` to enable POST during loopback development. POST requires loopback connection, same-origin when Origin is supplied, and JSON body <= 2 KiB. The caller cannot provide an arbitrary URL, evidence or event body. Do not expose this to the public internet or treat the loopback checks as login/signup.

SEC access requires a valid `SEC_USER_AGENT`; issuer coverage in this incremental API still uses the original pilot symbols and existing source mapping. This does **not** implement market-wide compliance coverage.

## Test approach

```bash
cd apps/tradescope
npm test
```

Added focused tests for as-of revisions, missing-data behavior, read-only routes, local-capture controls and cited audit classifications. **Six targeted Node tests passed in an isolated development harness.** Full repository suite and authentic SEC network integration have not yet been run against this branch.

## Interpretation boundaries

Public IRS corporate tax returns are generally confidential. SEC financial reporting supplies financial-statement income-tax disclosures, not the company's complete federal/state tax returns. Reported effective tax rates and deferred-tax accounts may support valuation and financial-risk research, but do not establish tax-code compliance or tax evasion.

A source-cited Item 4.02 is a disclosure about non-reliance; it is not proof of fraudulent financial reporting. Similarly, a changed auditor is not evidence of fraud.

## Known issues and next gates

1. **Existing v0.10 discovery/universe/archive branch has not completed all UI wiring or comprehensive acceptance tests.** These new endpoints are a bounded pilot integration only.
2. Event archive and corporate alert store are separate local JSON files; cross-file writes are not transactional. Archive is written first; retry is designed to be idempotent. Move both to a single PostgreSQL transaction/outbox as part of ResearchOS integration.
3. SEC filing URL validation intentionally rejects unsupported document paths, formats or schemas; some filings may be unavailable to the pilot parser.
4. SEC companyfacts tax data is annual and date-granular; do not claim intraday availability or cross-company comparability without additional normalization.
5. `login/signup` is **not implemented**. Implement verified identity, authorization and durable user/workspace scoping **before** public hosting or multi-user data sharing.
6. No paid cloud deployment, email/SMS delivery, tax-liability conclusion, regulatory adjudication or trading functionality.

See `docs/RESEARCHOS_INTEGRATION_STRATEGY.md` and `docs/RESEARCHOS_AUTH_AND_REGULATORY_ARCHITECTURE.md`.
