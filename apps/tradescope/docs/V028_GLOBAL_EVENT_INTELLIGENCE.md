# TradeScope v0.28 — Global Event Intelligence / Aviation Ground Stop Case

**Branch:** feature/tradescope-v018-unified-development · **PR:** #19 (draft, not merged) · **Status:** local engineering pilot, no live-provider acceptance or release authorization.

## Product decision
One **Global Event Intelligence** portal at \`/event-portal.html\`, not one portal per incident or a market "theme" with identical outcomes. The existing surveillance "EVENT INTELLIGENCE" view remains a separately scoped event/stock research workspace; the new portal is the cross-domain entry point. Aviation is the first specific live-source case.

The portal combines **8 event families** (aviation, climate, energy, geopolitics, industrial/supply chain, macro, cyber, health) and **13 catalog pathways**: twelve existing v0.23 transmission registry scenarios plus the FAA ground-stop case. Existing v0.23 registry semantics are unchanged and its 12-case tests remain valid. Opening a non-aviation scenario routes to the existing Transmission Lab, explicitly not a fake live case.

## Delivered
1. Typed cross-domain event taxonomy and centralized searchable catalog.
2. FAA nationwide-ground-stop **retrospective case**, with original AP reporting link and event-time label; the live FAA feed is *not* the historic national notice.
3. Historical **as-of knowledge checkpoints** at full UTC timestamps, excluding the incident and post-event investment hypotheses from pre-event views.
4. Conservative dated warning leads (2024/2026 GAO systems, communications/cyber resilience, November 10 FAA SMART release) with original links and explicit missing first-seen history.
5. Three historical analogues with causal-mechanism comparability rather than popularity/rareness ranking.
6. Six aviation economic transmission pathways with evidence contracts and industry/issuer candidates, **zero** verified loss/causal claims.
7. Six deterministic adversarial challenge types, including wrong causal attribution, baseline contamination, 9/11 analogue mismatch, issuer exposure and publication-time lookahead.
8. Fixed-host read-only FAA live source connector: \`https://nasstatus.faa.gov/api/airport-events\`, strict bounded JSON, 5.5-second timeout, provider failure abstention.
9. Typed airport-level status counts and original FAA source provenance, **not** automatic "nationwide ground stop" classification.
10. Responsive visual workbench with filters, investigation cutoffs, citations, impact evidence gaps and an explicit refresh control.
11. Read-only API contracts with input allowlists and no client-chosen upstream URLs.
12. Server/static allowlist, navigation and regression coverage.

### Local use
\`\`\`bash
cd apps/tradescope
npm test
npm run build:static
npm start
\`\`\`
Open \`http://127.0.0.1:8000/event-portal.html\` (or your configured port). No API key is required to request the public FAA status source; internet access is required. The demo displays a sourced retrospective case even when a live request fails, but does not pretend it has a current FAA status snapshot.

### API
- GET \`/api/event-intelligence/catalog\`
- GET \`/api/event-intelligence/case?id=faa-national-ground-stop-2026-11-13\`
- GET \`/api/event-intelligence/case?id=faa-national-ground-stop-2026-11-13&asOf=2026-11-13T20%3A53%3A00Z\`
- GET \`/api/event-intelligence/faa-live\`

Only current FAA **airport** programs are normalized; absence/presence does not verify national orders, historical source clocks or individual cancellations. This connector is on-demand; not a 24/7 unattended event collector or alert delivery mechanism.

## Precursor rigor
The GAO evidence was published ahead of the event but the **true first-seen clock is not archived here**. We cannot prove the software *would have* flagged it. The UI calls it a *document-date rehearsal*, not a measured prediction. FAA November 10 SMART deployment is a research lead, **not** a causal explanation for November 13 failure. Cyberattack speculation is not an established incident cause. Event date is drawn from contemporaneous reporting and publicly circulated FAA notice times; the original notice is not independently archived and verified by this pilot.

## Unfinished / next acceptance gates
- Upstream provider schema and rights verification with live FAA calls; independent source artifact capture, original first-seen clocks and correction history.
- Real-time nationally scoped ATCSCC advisories, exact issue and rescission clocks; on-call collection and incident deduplication.
- Historical 2001, 2023, 2026 incident-cause/duration/outcome datasets, matched controls, falsifiable calibrated escalation warnings and false-positive measurement.
- Airline/airport flight schedules and exposure joins, cancelled vs delayed baseline, airline recovery, cargo, hotel and energy economics with licensed sources.
- Real market benchmarks, publication-time event study with after-hours coverage and adjustment; no automatic share-price recommendation.
- Proper model-driven independent Research Challenger with source retrieval, rebuttal and arbiter; current challenger is **deterministic open research questions only**.
- Multi-tenant authentication, durable backed-up archival service, source contracts, rate limits and hosted deployment. No autonomous trades.

The goal is **discoverable precursor risk**, not a post-hoc claim that the system predicted a one-off failure. An actionable prospective warning requires stronger evidence than thematic proximity or shared event categories.
