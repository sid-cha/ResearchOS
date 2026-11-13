# ResearchOS / TradeScope — Prioritized development backlog (2026-11-13)

**Development policy:** all new features go directly to `feature/tradescope-v018-unified-development`, and the only cumulative draft PR is [#19](https://github.com/sid-cha/ResearchOS/pull/19) against `main`. Versions below are *work packages*, not reasons to create additional branches or pull requests. Never infer production readiness from CI or docs alone.

Legend: **Built pilot** = modules/UI or logic exists in current branch but coverage remains bounded; **In progress** = partial implementation; **Pending** = no confirmed complete delivered implementation; **Validation** = final release gate is deliberately deferred.

## Focused commodity research product — M1–M4 (v0.19 delivery)

The new narrow product experiment lives at `/commodity.html` and is documented in [V019_COMMODITY_PILOT_M1_M4.md](V019_COMMODITY_PILOT_M1_M4.md). Its development scope is intentionally separate from the legacy broad trading terminal.

| Milestone | Engineering delivery | Limit still requiring research/commercial evidence |
| --- | --- | --- |
| **M1: Source-first disruption feed** | **Local pilot delivered** — Federal Register fertilizer keyword discovery, canonical source/date, captured content revisions, analyst assessments | Keyword document mentions do not establish verified supply disruptions, international coverage or first intraday issue time |
| **M2: Issuer evidence** | **Limited pilot delivered** — MOS, CF and IPI SEC-10-K-linked business/activity edges and on-demand original SEC excerpt reader | No verified event-specific company impact, named supplier relationship or quantified exposure |
| **M3: Research workbench** | **Local pilot delivered** — original citations, source-observation timeline, as-of filing cutoff, prior-document context, exportable brief | No verified historical market analogue model or end-to-end financial causality |
| **M4: Pilot monitoring and feedback** | **Local pilot delivered** — revision-controlled opt-in watches, baseline/new candidates, audit history, self-reported time/usefulness metrics | No confirmed client trials, revenue, independent time saving, email delivery, multi-user or SaaS reliability |

**Product freeze:** do not add unrelated chart indicators, equity screening features, trading execution, generic chat or mobile functionality until target users show a recurring need. Finish actual source quality, specific commodity/company exposure proof, end-to-end usability, licensing and meaningful design-partner evaluation before expanding.

## Future concept — Research Agent Desk (deferred; design discovery only)

**User-requested concept (Nov 13, 2026):** a one-click mission launches up to **six specialist research agents** that visibly work in parallel in TradeScope, each showing a live phase/status, source citations, observations, open questions, costs and confidence limits, then produce a single consolidated report. Human research tasks should eventually be delegated to explicit tools. **Do not implement this now**; revisit after provider validation, evidenced company exposure and source-licensed datasets.

### Proposed agents (roles, not deployed workers)
1. **Global Event Scout:** scan dated official sources and GDELT; cluster candidate disruptions, report ambiguity and source quality.
2. **Macro & Climate Analyst:** as-of ALFRED, original NOAA/ENSO vintages, weather/climate observations and relevant baselines.
3. **Commodity & Supply Chain Analyst:** EIA, USDA, USGS and UN Comtrade; measure commodity fundamentals, sources, lags and missingness.
4. **Issuer Exposure Analyst:** SEC filings, facilities, commodity-linked business activity, period-valid issuer relationships; abstain from unverified exposure.
5. **Market History & Risk Analyst:** licensed price/outcome labels, event chronology, negative controls, benchmark attribution, false alarms; no prediction without validation.
6. **Synthesis & Critic Agent:** independently check citations and contradictions; refuse unsupported causal claims, produce cited summary and user review queue.

**Visual workflow design:** project → create research mission → choose an explicit research question and capped source/model budget → six independent status cards (queued/running/blocked/review-needed/done) → streaming timeline of source-backed findings and cross-agent disagreements → final human-approved evidence report. Include stop/cancel, retry, error and uncertainty states; never fabricate running workers or completed research.

**Security/production gates:** human-approved mission limits and tools; scoped per-provider read-only credentials; deterministic source snapshots; tenant isolation; bounded parallelism, timeout, rate limits, concurrency/budget quotas, prompt-injection defenses, trace logs and immutable provenance; license checks and redacted secrets. Disallow autonomous financial trades, external communication, file/code modification or deployments by default. Ensure agent work remains distinguishable from validated observations. User must explicitly authorize any high-impact write action.

**NVIDIA candidate:** [NVIDIA API Catalog](https://build.nvidia.com/models) NIM-hosted inference and/or self-hosted NIM for specialized language, reasoning, extraction and embedding/rerank workers. Trial access may be no-cost but is quota-limited and not a production entitlement. Need server-side `NVIDIA_API_KEY` (model-specific hosted API entitlement), model whitelist, cost/rate accounting, endpoint validation, data-residency and production license review. Never put token in public JS. **No key needed until we choose to prototype the agent desk.**

**ECC research:** [affaan-m/ECC](https://github.com/affaan-m/ECC), MIT licensed; workflow/configuration toolkit (plan → test → implement → review → verify, skills, hooks, AgentShield). High value for TradeScope **development quality**, not a market data feed or an orchestration backend to embed unreviewed. Evaluate a minimal reviewed subset (test/review/security practices) only; audit plugin/hook code and installation permissions before adoption.

**Jane Street OSS research:** [magic-trace](https://github.com/janestreet/magic-trace) (Linux/Intel PT diagnostics, later performance); [incremental](https://github.com/janestreet/incremental) (dependency-driven recomputation model, concept reference); [async](https://github.com/janestreet/async) (OCaml concurrency, conceptual); [bonsai](https://github.com/janestreet/bonsai) (reactive OCaml web UI, design reference); [agent_skills](https://github.com/janestreet/agent_skills) (Socratic tutor, not a finance research agent). No justification currently for migrating the Node.js/Java platform to OCaml, and these OSS projects do not provide Jane Street's proprietary trading technology.

### Proposed acceptance criteria for future agent prototype
- Replayable source-evidence record for each tool call and claim; explicit original publication/fetched clocks and commercial source rights.
- Demonstrate six independent tasks completing with truthful state (including cancelled/failing), deduplicated results and bounded cost.
- Score citation support, disagreement detection, source quality and research time saved on pre-registered real tasks.
- Human review and escalation on low-quality/restricted data; no unmanaged external side effects.

## Immediate next build — v0.21 Provider Reliability & Source Control Center

- Migrate the EIA natural-gas research source from deprecated v1 to explicitly documented v2, with stable series provenance, response schema verification, missing-value handling, bounded history and test fixtures.
- Add read-only source status/health for Alpaca, SEC, FRED, EIA, USDA FAS, UN Comtrade, GDELT, Federal Register, NOAA CPC, NASA POWER, USGS capture and optional EODHD. Show **configured vs unconfigured vs not probed vs successful vs failed** separately, without exposing tokens.
- Provide explicit opt-in single-provider live probes, bounded timeouts and server-side status history; never automatically run expensive sources on page load.
- Run CI, static public-file allowlist and mock-provider regression tests. Real keys, license review and external browser acceptance remain a separate gate.

## Critical path (P0) — make the existing terminal scientifically useful

| Workstream | Status | Next deliverable | Gate |
| --- | --- | --- | --- |
| Single cumulative branch + PR | Built | Continue PR #19, preserve all earlier commits, no merge until accepted | Verify CI after every push |
| Point-in-time macro replay | Built pilot | Persist original observations and source publication/ingestion clocks; optimize bounded timeline fetch | Live ALFRED original vintages and release timing |
| Historical outcome validation | Built pilot | Licensed benchmark cross-check; additional independent market regimes and control periods | Entitlement, adjusted basis, missingness, look-ahead leakage, false alarms |
| Climate outlook evidence | **Initial v0.18 implementation** | Source-dated NOAA CPC monthly historical ENSO discussions and as-of UI, rejecting future issues | Live archive HTML and original issue/revision verification still deferred |
| Versioned research provenance | **Partial** — normalized NASA POWER climate snapshots carry retrieval times and content SHA-256 receipts; no durable evidence ledger | Immutable source/event/assertion records, original source publication/first-seen clocks, corrections, replay and audit diffs | Chronology, source auth, durable storage and migrations |
| Signal quality and negative controls | In progress | More honest baseline comparisons, independently sampled decisions, coverage-weighted diagnostics, randomized-control alternatives | Research design, holdout and error analysis |
| Unified data-quality status | In progress | Shared provider health/coverage/entitlement statuses, no silent stale/future imputation | Provider contract and failure injection |

## Economic and climate intelligence (P1) — main differentiation

| Workstream | Status | Next deliverable |
| --- | --- | --- |
| ENSO and rainfall | **Partial** — dated CPC ENSO discussion and NASA POWER monthly representative-point precipitation / temperature with current-revision provenance | Original-issued ENSO probabilities, dated regional precipitation polygons, NOAA weather stations, publication-time archives and historical normals |
| Drought, snowpack and monsoon | **Pending** — representative Colorado temperature/precipitation point is not snowpack, drought or monsoon measurement | NOAA/US Drought Monitor/NRCS and regional monsoon agency archives with original issue dates, watersheds and crop regions |
| Wildfire and catastrophe | Built event pilot only | Historic perimeter/intensity, insured location and catastrophe loss evidence, time-specific publication and region matching |
| Commodity and supply chain | Pending | USDA crop reports, USGS potash, trade data, shipping and inventory shock pathways with versioned source evidence |
| Transmission graph | **Typed research-graph foundation implemented** | Three directed scenario graphs, read-only API and Crisis & Climate stage UI, with conditional lag/sign placeholders; add georeferenced dated evidence, measured causal edges and named issuer verification |
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

1. Extend the new v0.18 NASA POWER point-history pilot into an immutable, versioned evidence ledger and geographically verified station/area climate observations; do not equate current-revision data with original historical knowledge.
2. Build an evidence-backed industry transmission graph, starting ENSO → crop season/region → fertilizer demand/transport → issuer revenue, and wildfire → insured locations/reinsurance → rebuilding.
3. Add issuer exposure proof, geographic/sector mapping and scenario-to-company coverage.
4. Expand historical backtesting, benchmark coverage and contamination controls across multiple shocks and negative controls.
5. Add universal persistence and cloud operations; authentication and billing when multi-user product workflows are mature.

The aim is a verified economic-risk intelligence platform, not simply a collection of historical crisis narratives.
