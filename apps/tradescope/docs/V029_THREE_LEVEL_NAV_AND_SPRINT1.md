# TradeScope v0.29 — Three-tier navigation / Sprint 1 PRD review

**Branch:** feature/tradescope-v018-unified-development · **PR #19:** draft/unmerged · **Release scope:** shared local UI organization, no new market-data rights.

## Product decision / shipped in v0.29

All ten user-facing TradeScope pages use the same **Level 1 → Level 2 → Level 3** navigation shell. It replaces the overcrowded flat primary links with an explicit product hierarchy, while keeping all existing tools, server endpoints and current on-page tab controls.

- **Level 1 / Product:** Markets, Company Research, Global Events, Research Operations.
- **Level 2 / Module:** Market surveillance, market data, signals, issuer research, investigations, event radar, economic transmission, historical studies, source provenance.
- **Level 3 / Tool:** actual working routes and panels. The currently selected tool is visibly labeled and linked. Product/module selectors reveal the next level without auto-triggering a provider request.
- **Deep links:** \`/#monitor\`, \`/#feed-health\`, \`/#research/filings\`, \`/#research/crisis\`, \`/market-hub.html#financials\`, \`/event-portal.html#case-study\`, etc.
- **Browser back/forward:** root panel navigation and market view hash synchronization.
- **A11y:** native focusable controls, current-page identification, row labels, responsive overflow and screen-reader descriptions. The previously flat homepage navigation remains hidden to preserve existing legacy workspace event handlers during migration. The new navigation reads *only local static route definitions* and does not touch API keys or data sources.

**Implementation:** \`hierarchy-navigation.js\`, \`hierarchy-navigation.css\`, references in ten HTML pages, market-hub hash routing, explicit public static/server allowlists and regression suite \`tests/hierarchy-navigation.test.mjs\`.

### Sprint 1 PRD: two uses in the document

Located and reviewed the user-supplied working document **TradeScope_ResearchOS_Roadmap_with_CPZAI_Benchmark_2026-11-12.docx**, revision November 12, 2026.

1. **v0.4 / Sprint 1 — Company Intelligence:** Alpaca news, SEC 10-K/10-Q/8-K, XBRL revenue/EPS/margins; existing research pilots already implement bounded versions. This v0.29 release exposes those via **Company Research → Issuer Research → Company Metrics / SEC Filing Reader / Issuer Discovery**. It does not claim GAAP/coverage completion.
2. **v0.7 — Streaming Market Data & Integrity** is the next proposed streaming sprint, with TS-MDI-701–706. The prior v0.7–v0.9 research workstation already implements bounded IEX WebSocket, a normalized event/snapshot contract, SSE to browser and feed health display with mocked tests.
   - **TS-MDI-701** Ingestor: existing pilot; credentials/entitlements and live supervision still require verification.
   - **TS-MDI-702** Canonical observation contract: partial pilot; independent provider-neutral multi-source contract and durable event metadata remain pending.
   - **TS-MDI-703** Integrity monitor: existing feed health; v0.29 adds an explicit discoverable route **Markets → Surveillance → Feed Integrity** (source, venue, freshness, gaps, last exchange/ingestion times).
   - **TS-MDI-704** Capture/replay: synthetic replay and bounded samples exist, but no licensed durable full-session normalized live capture + deterministic replay parity is established.
   - **TS-MDI-705** UI event delivery: existing IEX backend SSE, single-venue coverage and source provenance; v0.29 makes this accessible from one unambiguous Markets navigation path. Live provider acceptance is pending.
   - **TS-MDI-706** Docker/test deployment: mocked integration tests exist; actual containerized multi-service ingestion and operational checks remain pending.

This is an **interface and navigation delivery**, not a claim that Sprint 1's historical market pipeline obligations have passed their provider or security gates. Do not present sampled IEX data as the consolidated market tape, or revised historic sources as pre-event knowledge.

## Acceptance
Run from \`apps/tradescope\`:

\`\`\`powershell
npm test
npm run build:static
npm start
\`\`\`

Open \`http://127.0.0.1:8000/\`, choose Markets → Surveillance → Feed Integrity, then navigate to Company Research → Issuer Research → SEC Filing Reader, Global Events → Event Radar → FAA Case & Precursors, and Research Operations → Sources & Provenance → Evidence Ledger. Check browser back, forward, keyboard focus, market \`#dashboard\` deep link, narrow mobile width, and that L1/L2 only changes menus.

Unfinished: remove transitional hidden legacy nav after consolidating in-page event handlers; full live-browser E2E acceptance, actual provider entitlement tests, durable normalized capture, and Docker validation. PR #19 remains draft.
