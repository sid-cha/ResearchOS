# ResearchOS authentication, regulatory intelligence and integration decision record

Status: planning contract; no production authentication has been implemented by this document.

## Integration picture

The current TradeScope Node workstation and ResearchOS Java API **must not** become two separate authoritative stores for the same account, investigation or archive. Continue the existing proposed sequence:

**M1 (now):** standardize SEC issuer CIK / instrument aliases, evidence references, capture-time knowledge, filing classifications and event-revision schemas. Preserve existing local flows. v0.10 branch contains this work but still requires complete integration and tests.

**M2 (next):** PostgreSQL/Flyway owns authoritative account/workspace membership, append-only event and evidence revisions, instrument identity and persisted alerts. Node retains bounded provider adapters and calculation modules. Enforce transactional audit/outbox writes.

**M3:** adopt an established OIDC identity provider (for example AWS Cognito or a vetted equivalent) with authorization-code + PKCE flow and verified email. The Java backend verifies identity and workspace authorization; browsers never select tenant IDs as a substitute for authorization. Use server-managed Secure, HttpOnly, SameSite session cookies; CSRF defenses; short-lived session policy; refresh/session revocation; login/signup throttling; MFA/recovery; secure secret management; request-level audit attribution.

**M4:** expose the signed-in TradeScope frontend, cases, alerts, watchlists, saved screens and compliance workspaces against authoritative Java APIs. Run tenant-isolation, anonymous-denial, user-role and IDOR tests. Do not make the local `.local-data/*.json` files multiuser by adding a login form.

**M5:** production controls: least-privilege deployment, provider entitlements and SEC access policies, observability, data retention, incident response, non-repudiation assessment, audit report generation, privacy and security review.

## User and workspace permissions

- `owner/admin`: manage workspace memberships, permissions, billing and policies.
- `analyst`: create research investigations, evidence notes, watchlists and approved captures.
- `reviewer`: review/acknowledge assigned evidence and regulatory findings, with workflow separation as appropriate.
- `viewer`: read permitted research snapshots and audit evidence.
- `service_ingest`: narrow machine principal to ingest source observations; no interactive signup or cross-tenant access.

All domain tables require `workspace_id`, stable user/source attribution, immutable `created_at` and revision/version fields. Never trust the browser's `workspace_id` without authenticated authorization. SEC public source events may be shared only when licensed and legally permitted; private annotations, audit notes and watchlists remain tenant-isolated.

## Regulatory research scope

Begin with SEC 10-K, 10-Q and 8-K filings, amendments, auditor changes (8-K Item 4.01), non-reliance (4.02), listing notices (3.01), revenue/earnings reporting and documented accounting controls. Later candidates include US PCAOB audit inspection reports, agency enforcement releases, FINRA disclosures, EDGAR XBRL reconciliation, and industry-specific regulators, after assessing licensing and authoritative APIs.

Represent a **disclosed event** separately from analyst interpretation, compliance hypothesis, confirmed legal finding, corrected filing and official amendment. Every classification must cite the source passage and first-available observation date. Record what was *known to ResearchOS* at capture time; historical retroactive analysis cannot claim earlier awareness.

## Public tax-disclosure analytics (not tax-return access)

Useful research signals include: effective tax-rate volatility; income-tax expense versus cash taxes paid; deferred tax asset/valuation allowance changes; uncertain-tax-position disclosures; earnings sensitivity to tax-rate normalization; and cross-company sector comparisons after harmonizing fiscal periods, issuer tag mappings and local tax regimes. Some data may be unavailable or not comparable.

Never claim to retrieve confidential company IRS returns, actual tax payments for every jurisdiction, or proof of noncompliance from accounting-tax disclosures. Point-in-time comparisons need statement period, filing acceptance date, amended-filing semantics and tags/units. Treat tax data as a **supporting fundamental factor**, not an autonomous legal-compliance verdict.

## Non-negotiable acceptance gates

1. Existing v0.9/v0.10 market/research tests pass, including broker entitlements and source labels.
2. Anonymous users cannot access workspace-private API data; every ID-based query is authorization-scoped.
3. Sessions resist CSRF, fixation, cookie theft exposure and basic credential stuffing (provider-side policies plus app-side controls).
4. Registration, login, password recovery and invitation flows are provider-backed; no passwords in local JSON, browser storage, logs or repository.
5. Archival corrections append versions and never mutate previously captured evidence.
6. Unauthorized or unentitled market data and private notes are never redistributed.
7. Full source provenance and limitations are visible in all regulatory/tax insights.
8. Migration has explicit rollback and coexistence gates; no silent dual-writing or silent local fallback on central-store failure.

These requirements are a design blueprint for a subsequent dedicated auth sprint, not proof of an audited security posture.
