# ResearchOS / TradeScope — Prioritized development backlog (2026-11-13)

**Development policy:** all new features go directly to `feature/tradescope-v018-unified-development`, and the only cumulative draft PR is [#19](https://github.com/sid-cha/ResearchOS/pull/19) against `main`. Versions below are *work packages*, not reasons to create additional branches or pull requests. Never infer production readiness from CI or docs alone.

Legend: **Built pilot** = modules/UI or logic exists in current branch but coverage remains bounded; **In progress** = partial implementation; **Pending** = no confirmed complete delivered implementation; **Validation** = final release gate is deliberately deferred.

## Critical path (P0) — make the existing terminal scientifically useful

| Workstream | Status | Next deliverable | Gate |
| --- | --- | --- | --- |
| Single cumulative branch + PR | Built | Continue PR #19, preserve all earlier commits, no merge until accepted | Verify CI after every push |
| Point-in-time macro replay | Built pilot | Persist original observations and source publication/ingestion clocks; optimize bounded timeline fetch | Live ALFRED original vintages and release timing |
| Historical outcome validation | Built pilot | Licensed benchmark cross-check; additional independent market regimes and control periods | Entitlement, adjusted basis, missingness, look-ahead leakage, false alarms |
| Climate outlook evidence | **Initial v0.18 implementation** | Source-dated NOAA CPC monthly historical ENSO discussions and as-of UI, rejecting future issues | Live archive HTML and original issue/revision verification still deferred |
| Versioned research provenance | Pending | Immutable source-observation/event/assertion records with publication, first-seen and vintage clocks, schemas, replay and audit diffs | Chronology, storage durability and migrations |
| Signal quality and negative controls | In progress | More honest baseline comparisons, independently sampled decisions, coverage-weighted diagnostics, randomized-control alternatives | Research design, holdout and error analysis |
| Unified data-quality status | In progress | Shared provider health/coverage/entitlement statuses, no silent stale/future imputation | Provider contract and failure injection |

## Economic and climate intelligence (P1) — main differentiation

| Workstream | Status | Next deliverable |
| --- | --- | --- |
| ENSO and rainfall | In progress | CPC historical discussion retrieval is a starting point; add original-issued probabilities where archived, reanalysis separated from forecasts, NOAA monthly climate measurements and timestamped region definitions |
| Drought, snowpack and monsoon | Pending | NOAA/US Drought Monitor/NRCS or region-specific official archives; original issue dates and explicit geography |
| Wildfire and catastrophe | Built event pilot only | Historic perimeter/intensity, insured location and catastrophe loss evidence, time-specific publication and region matching |
| Commodity and supply chain | Pending | USDA crop reports, USGS potash, trade data, shipping and inventory shock pathways with versioned source evidence |
| Transmission graph | Scenario hypotheses only | Directed typed edges: driver → georegion → resource/commodity → sector → named issuer with lag, sign and evidence quality |
| Issuer exposure | Pending | SEC facility/subsidiary, supplier, property, revenue and insurance exposure mapping with effective dates and source excerpts |
| Corporate event attribution | Built pilot | Join validated occurrence sources, issuer exposure and benchmark-adjusted outcome studies, distinguishing association from causation |
| Global events | Partial pilot | Regulatory, sanctions, macro and political evidence from original dated sources; first-seen and correction logs |

## Product breadth and operational usefulness (P1–P2)

| Workstream | Status | Next deliverable |
| --- | --- | --- |
| Broad-market universe and sectors | Issuer directory/watchlist pilot | Durable securities IDs, authoritative sector classification, ETF constituents, historical delistings and corporate actions |
| Market Atlas visualization | Requested-symbol pilot | Sector heatmaps, historical relative performance, thematic maps and event overlays, with complete coverage diagnostics |
| Signals/alerts | Local pilot | Signed source evidence, delivery channels, user-defined rules, repeatable evaluation/audit state and multi-security coverage |
| Market data/live charting | Implemented bounded IEX charts | Verified SIP/venue entitlement, exchange sessions, gaps, corporate actions, delayed vs live status and reliable recovery |
| Company research | ~65 definitions as pilot | Further GAAP normalization, consensus estimates/options/ownership only when licensed; richer filings and audit-tax intelligence |
| Research assistant | Local deterministic and optional model pilot | RAG with source-specific citations, evidence abstention, incremental indexing, systematic evaluation and permissions |
| Case workflow | Local case store | Analyst collaboration, export/reporting, immutable audit trail and versioned evidence attachments |
| Enterprise storage | Partial Java/PostgreSQL bridge | Replace disconnected local stores with consistent schemas, migrations, indexing, retention and backup |
| Accounts, security, billing | Pending | OIDC login, tenant isolation, workspace roles, audit logs, rate limits, billing and licensed entitlements |
| Production operations | Pending | Secured server deployment, monitoring/alerts, scheduled workers, rollback, disaster recovery and observability |
| Mobile/responsive UX | Partial | Real-device accessibility and data-density tests; polishing information hierarchy and latency |
| Pricing and monetization | Research concept | SKU/plan entitlement by data source, license-compliant distribution, billing and target segment testing |

## Release acceptance — deferred, not waived

- Keep **unit tests, static allowlist, API contracts, and bounded mock-provider tests** mandatory during development.
- Close no substantive validation gap by fabricating inputs or declaring synthetic test data a historical record.
- At near feature-complete: verify live Alpaca/IEX, EODHD, SEC, ALFRED, NOAA source coverage and commercial data rights; independent 2008/2020 price/indicator checks; browser E2E and source publication clocks.
- Benchmark false alarms, risk-screening accuracy, real forward lead times, uncertainty bounds and confidence intervals in genuine out-of-time samples before marketing predictive efficacy.
- Security review: authentication, tenant separation, storage authorization, API credentials, open-proxy/SSRF, user permissions and provider redistribution.
- Freeze a commit, perform full cross-feature integration/regression, staging, rollback and release review. **Do not merge PR #19 automatically.**

## Recommended next implementation order

1. Extend v0.18 historical climate evidence with immutable/dated source observation provenance and a bounded climate source catalog, then add official weather/hydrology observations.
2. Build an evidence-backed industry transmission graph, starting ENSO → crop season/region → fertilizer demand/transport → issuer revenue, and wildfire → insured locations/reinsurance → rebuilding.
3. Add issuer exposure proof, geographic/sector mapping and scenario-to-company coverage.
4. Expand historical backtesting, benchmark coverage and contamination controls across multiple shocks and negative controls.
5. Add universal persistence and cloud operations; authentication and billing when multi-user product workflows are mature.

The aim is a verified economic-risk intelligence platform, not simply a collection of historical crisis narratives.
