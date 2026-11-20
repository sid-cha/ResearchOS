# TradeScope v0.27 — Exposure Proof & Research Review Batch

**Development branch:** `feature/tradescope-v018-unified-development` · **Cumulative draft PR:** [#19](https://github.com/sid-cha/ResearchOS/pull/19) · **Engineering scope:** local source-evidence workflow; no merge or customer validation.

## Delivered batch: 15 operational capabilities

| # | Feature | Implemented behavior | Scientific/operating limit |
| --- | --- | --- | --- |
| 1 | **Official SEC registrant identity** | Server reads exact ten-digit CIK from fixed `data.sec.gov/submissions/CIK##########.json`, with bounded JSON, real-contact SEC_USER_AGENT and 5-minute cache | SEC registrant does not prove legal ownership of a plant |
| 2 | **Recent SEC filing discovery** | Normalize limited form/date/accession/official filing links from SEC submissions history | Filing links do not mean a cited subsidiary relationship has been checked |
| 3 | **Source-cited operator hypothesis intake** | Save legal operator name, user’s existing saved local facility ID, exact EPA FRS ID, falsifiable proposition | Human assertion, not independently verified |
| 4 | **Dated official operator evidence** | Require original-source government URL, publication date and excerpt | User-entered excerpt not automatically verified against actual source |
| 5 | **Dated SEC relationship evidence** | Independently require SEC-hosted filing URL, date and excerpt | Does not validate subsidiary-to-CIK chain |
| 6 | **Effective-dated operator relationship** | Store asserted effectiveFrom/effectiveTo and reject malformed/future start dates | Effective dates are asserted, not source authenticated |
| 7 | **Append-only case audit** | Local JSONL ordered SHA-256 hash chain, changed audit events, tamper/partial-file rejection and restart persistence | Not WORM, no independent timestamp or multi-process locking |
| 8 | **Government EPA source snapshot** | On-demand server fetches current FRS record for the exact ID and stores bounded metadata | Current lookup, not original historical vintage |
| 9 | **Government SEC snapshot** | On-demand server fetches SEC CIK identity and recent filing metadata | Registrant identity only |
| 10 | **Official source change comparison** | Record stable source-content hashes and compare successive current-source snapshots | Change is local observed drift, not authoritative provider revision history |
| 11 | **Evidence gap and contradiction queue** | Deterministic typed issues for absent FRS/SEC data, CIK mismatch, geographic discrepancy, missing legal operator bridge, financial-effect gap | Not an autonomous independent anti-agent and not a risk probability |
| 12 | **Historical as-of eligibility gates** | Check user-cited document dates, effective ownership assertions, expired windows, and local source dates against a historical cutoff | Current EPA/SEC records never receive original first-available certification |
| 13 | **Human adversarial challenges and rebuttals** | Record typed researcher objections and linked rebuttals, retaining open objection history | Neither counterclaim nor rebuttal is independently fact-checked |
| 14 | **Researcher dispositions and issuer filters** | Source-focused queue, issuer symbol filter, analyst rationale and limited statuses (NEEDS_EVIDENCE, CONTESTED, READY_FOR_INDEPENDENT_REVIEW, REJECTED_AS_UNSUPPORTED) | Analyst “ready” is not verified ownership |
| 15 | **Exportable proof packet and UI** | New responsive `/exposure-review.html`, original document links, audit, issue queue, source hashes and source-cited text export | Report is a research record, not investment advice or proof of operating-company impact |

These are 15 **usable bounded capabilities**, not 15 validated commercial data integrations. No NVIDIA key/model call, autonomous agent execution, stock trading, or financial-loss estimate occurs in this release.

## New source and server architecture

- `lib/sec-registrant.mjs`: server-only SEC EDGAR registrant API, user-agent-required, fixed official HTTPS host. SEC documents: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- `lib/exposure-proof.mjs`: local source-focused proof casebook and adjudication boundary. All externally sourced snapshots are fetched by trusted server providers, never sent as client-specified URLs or arbitrary provider payloads.
- `exposure-review.html`, `exposure-review.js`, `exposure-review.css`: integrated case queue, intake, source capture, conditional as-of research, challenges, rebuttals, disposition, audit and downloadable plain text.
- Existing v0.25 local asset registry + v0.26 EPA FRS lookup are reused. No new source route can mutate upstream EPA/SEC data.

### API endpoints

| HTTP | Local path | Purpose |
| --- | --- | --- |
| GET | `/api/exposure-proof/catalog` | Enabled status and allowed features |
| GET | `/api/exposure-proof/integrity` | Journal event and case counts, last hash |
| GET | `/api/exposure-proof/cases?symbol=MOS&limit=50` | Search case queue |
| GET | `/api/exposure-proof/case?id=case-...` | Source/issue summary, analyst dispositions |
| GET | `/api/exposure-proof/case?id=case-...&asOf=2020-02-15` | Conservative historic cutoff checks |
| GET | `/api/exposure-proof/history?id=case-...` | Ordered source and review history |
| GET | `/api/exposure-proof/report?id=case-...` | Source-cited plain-text export |
| POST | `/api/exposure-proof/cases` | Open a source-dated, explicitly unverified operator hypothesis |
| POST | `/api/exposure-proof/capture?id=case-...` | Fetch official EPA and SEC current snapshot, record diff |
| POST | `/api/exposure-proof/challenge?id=case-...` | Add human independent contradiction |
| POST | `/api/exposure-proof/rebuttal?id=case-...` | Append challenge-linked evidence response |
| POST | `/api/exposure-proof/review?id=case-...` | Append researcher disposition only |

All writes require loopback opt-in, a same-origin JSON browser request, and bounded payloads. Secrets remain in local .env, and live SEC is optional for case creation but necessary for complete official-source snapshot capture. Missing sources remain unavailable; no fallback values masquerade as facts.

## Local configuration — add only new/rotated secrets

In your ignored `apps/tradescope/.env`:

```dotenv
HOST=127.0.0.1
PORT=8001
RESEARCH_GEO_ASSET_REGISTRY_ENABLED=true
RESEARCH_EXPOSURE_PROOF_ENABLED=true
SEC_USER_AGENT=TradeScopeResearch YourActualContactEmail@example.com
```

The SEC field must contain a real application and contact email, not the example above. **Do not paste live secrets in chat or GitHub.** The official SEC public submissions API requires no API key. Neither EPA nor SEC ownership claims are automatically verified.

Before using the proof casebook, visit `/geo-exposure.html` and save a genuine two-source facility claim with an existing symbol/CIK; then open `/exposure-review.html`. All new operator assertions must cite distinct official operator and SEC documents. Capture official EPA/SEC metadata with the dedicated button, compare source hashes, try an historical as-of cutoff and record an independent objection and rebuttal. Finally export a report.

### Combined build acceptance

From `apps/tradescope` (Node 22.16+):

```powershell
npm test
npm run build:static
npm start
```

Check `http://127.0.0.1:8001/exposure-review.html`, `/geo-exposure.html`, `/transmission-lab.html`, `/fred-research.html`, `/source-control.html`, and `/market-hub.html`. Static `dist/` alone does not provide the backend APIs.

Automated tests use mocked SEC/EPA sources and disposable local journals; passing them **does not** demonstrate successful live connectivity, correct ownership, source licensing, authenticated multiuser storage or browser end-to-end acceptance.

## Remaining priorities after the 15-feature batch

**P0:** independent legal subsidiary/operator-to-CIK proof (e.g. original SEC entity roster and governmental operating permits), exact effective-date source validation and current-vs-first-available publication provenance; audited live-provider rights/contracts; hazard polygon/intensity joins; historized outcome/negative-control tests; analyst user trials.

**P1:** secure multi-tenant durable storage, source snapshots with access controls, expanded climate/sanctions/trade data and market breadth only when licensed. **Deferred:** six autonomous researcher workers, independent Red-Team/Anti-Agent source discovery, NVIDIA inference adapter, arbiter, budget/cancel and trace UX. The deterministic issue queue is the precursor, not the finished multi-agent system.

No merge of PR #19 is authorized by this document.
