# TradeScope v0.19 — Fertilizer Disruption Research Pilot (M1–M4)

> **Branch and PR:** `feature/tradescope-v018-unified-development` / [PR #19](https://github.com/sid-cha/ResearchOS/pull/19). This is a **local-first, single-analyst feature pilot**, not a deployed or validated investment product. All earlier TradeScope modules remain intact; these milestones add a focused primary workflow.

## Product promise within the delivered boundaries

A fertilizer analyst can capture original-source **regulatory documents that mention a selected commodity**, review each document and preserve its observation history, inspect **SEC-linked business activity of selected issuers**, optionally verify extracted passages from SEC filings, create a source-attributed brief, run opt-in local monitors, and record design-partner research timing feedback.

The terms **disruption**, **impact** and **exposure** are carefully scoped:
- A Federal Register search result is a *document candidate*, **not proof of an actual supply disruption or trade restriction**.
- A link from company to nutrient is **documented business activity**, **not proof that an event affected the company's revenues or securities**.
- Analyst dispositions are local human judgments, not independently verified facts.
- Historical publication metadata may be day-level only; `capturedAt` is a local observation clock, not the original historical first-publication time.
- No financial probability, return forecast, verified causal sensitivity, trading signal, or customer traction is inferred.

## M1 — Source-backed disruption research feed and evidence history

**Implemented:** fixed Federal Register search for `potash`, `urea fertilizer` and `phosphate fertilizer`, with a 15-result bound; issuer-neutral candidate event IDs, official publication date, original canonical URL and query provenance; missing-data/error handling; client preview and local capture; immutable revisions and content SHA-256; local observation clocks. Duplicate normalized records are ignored. Analysts may add append-only relevance assessments with a minimum explanation and source-bound review ID.

**Still absent:** non-US supply/export bulletins, globally complete crisis coverage, original intraday release stamps, automated verification of disruption occurrence, classification accuracy studies, enterprise retention.

Official primary API reference: https://www.federalregister.gov/developers/documentation/api/v1

## M2 — Evidence-linked issuer-to-commodity activity

**Implemented:** a small, explicit SEC-source-cited company pilot:
- **MOS — Mosaic:** Potash and phosphate; 2025 10-K dated February 27, 2026: https://www.sec.gov/Archives/edgar/data/1285785/000128578526000017/mos-20251231.htm
- **CF — CF Industries:** Nitrogen/urea; 2025 10-K dated February 25, 2026: https://www.sec.gov/Archives/edgar/data/1324404/000132440426000007/cf-20251231.htm
- **IPI — Intrepid Potash:** Potash; 2025 10-K dated March 5, 2026: https://www.sec.gov/Archives/edgar/data/1421461/000142146126000008/ipi-20251231.htm

The app surfaces typed issuer-to-commodity **business activity edges** with SEC citations and filing dates. Filing records issued after a selected document's date are excluded from historical briefs. A **Verify SEC filing excerpt** action uses the already-bounded SEC filing reader to extract matching source passages, requiring a declared `SEC_USER_AGENT` in local `.env`. Missing or unsupported source text remains unavailable.

**Still absent:** counterparty/supplier graph, facility footprint, verified local agricultural end-demand, customer exposure fractions, signed price impacts, production-site GIS and event-specific company impact.

## M3 — Integrated source-backed brief

**Implemented:** on locally captured documents, one-click Markdown-style text brief with original regulatory citation, publication date, first-local-observed time, content hash, latest analyst review, official SEC business references only where filed by that date, and up to five earlier locally captured regulatory documents of the same commodity (clearly **not** financial-market analogues). Direct downloadable `text/plain` export with no licensed raw provider payload embedded.

**Still absent:** complete market-returns attribution, causal or probabilistic modeling, advanced report permissions/collaboration, external distribution.

## M4 — Design-partner and monitoring pilot software

**Implemented:** create disabled watches, explicitly enable/disable via revision-checked updates, manually scan once, local in-process scheduled checks at 15–1,440 minute intervals while the Node server is running, first-run baseline, newly encountered official document candidates after baseline, retained run history, remove watches without erasing runs. Optional self-reported before/after research duration, source-quality rating and notes; metrics correctly show unverified status.

**Still absent:** actual recruitment, confirmed paying customers, independent time-to-insight measurements, external notification channels, cloud persistence, tenant permissions, billing, production uptime and operational SLAs. These outcomes cannot be completed solely through source code.

## Local API (all under `/api/commodity`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/catalog` | Supported commodity and issuer scope |
| GET | `/live?commodity=potash` | Preview official source candidates |
| POST | `/scan` | Capture source observations, preserve revisions |
| GET | `/events?commodity=potash` | Captured latest records |
| GET/POST | `/reviews?id=fr:...`, `/reviews` | Local review history / append disposition |
| GET | `/companies?commodity=potash` | SEC-cited commodity business activities |
| GET | `/verify?symbol=MOS` | On-demand original SEC excerpt verification |
| GET | `/brief?id=fr:...` | Research brief JSON |
| GET | `/brief.txt?id=fr:...` | Downloaded source-backed text |
| GET/POST | `/watches` | List/create disabled watches |
| PATCH/DELETE | `/watches/watch:UUID` | Revision-controlled enable/disable/remove |
| POST | `/watches/watch:UUID/scan` | One-off watch scan |
| GET/POST | `/metrics`, `/feedback` | Self-reported pilot evaluation |

All write operations require loopback server access, use JSON-bound request sizes, and reject a cross-origin browser Origin header. The full platform remains **unauthenticated**, so keep the server bound to `127.0.0.1` and never expose it publicly.

## Run and exercise

1. `cd apps/tradescope`; `npm test`; `npm run build:static`.
2. Copy `.env.example` to `.env` and supply `SEC_USER_AGENT=TradeScope YourContactEmail@example.com` (use a real contact) for filing excerpt verification.
3. `npm start`, then visit `http://127.0.0.1:8000/commodity.html` (or alternate configured `PORT`).
4. Select **Potash**, preview official document candidates, then **Capture source observations**; record relevance and prepare a cited brief. Verify original SEC filing passages where permitted.
5. Create a disabled Potash watch, explicitly enable, run once to establish baseline and check pilot metrics after entering actual task timings. The server must remain open for scheduled scans.

These are **manual acceptance steps**, not proof of completeness or payment intent. Mandatory release checks remain live-source URL/schema/rights verification, original publication-time controls, exposure validation, browser/security acceptance, and customer outcome studies.

## Next commercial acceptance gates

- Interview commodity analysts, show their actual documents and research tasks, measure repeated usage.
- Validate meaningful supply disruption coverage beyond keyword document mentions.
- Independently substantiate issuer/supplier exposure for the specific event and quantify research time saved.
- Audit regulated data redistribution, permissions, enterprise threat model and hosting architecture.
- Do not merge PR #19 into `main` automatically.
