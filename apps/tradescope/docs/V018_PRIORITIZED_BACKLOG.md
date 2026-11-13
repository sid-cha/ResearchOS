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

## v0.22 delivery — evidence-backed economic transmission (pilot built)

**Code:** `lib/transmission-dossier.mjs`, `transmission-lab.html`, `transmission-lab.js`, `transmission-lab.css` and `tests/transmission-dossier.test.mjs`.

- **Built:** read-only three-scenario dossier API; node-by-node research context from existing NASA POWER, USDA FAS, EIA v2, UN Comtrade, GDELT, locally captured USGS statistics and SEC issuer activity. Live provider keys and upstream quality have not yet been acceptance-tested.
- **Built:** a distinct issue-dated NOAA CPC historical ENSO mode that refuses to mix later-revised economic or meteorology datasets into the evidence for an earlier as-of date.
- **Built:** inspectable transmission stages, per-source coverage, unvalidated edge queue, evidence gaps and a downloadable source-attributed text dossier. Verified market/issuer causal effects and predictive accuracy remain **zero/not established**.
- **Pending:** original release-vintage archives and verification, actual geographic/economic exposure joins, event-specific cost/demand quantification, measured propagation lags, 2008/2020 historical negative controls and live browser/provider acceptance.
- **Next technical focus:** make provenance archival durable, validate primary upstream source schemas and historical release clocks, and extend evidence-sourced region/facility links only when observed.

Full scope and manual checks: [V022_TRANSMISSION_LAB.md](V022_TRANSMISSION_LAB.md). **Do not present conditional graph edges as risk probabilities or investment advice.**

## Next architectural milestone — v0.23 Generalized Event-to-Economy Scenario Engine (P0)

**Decision following user feedback (Nov 13, 2026):** v0.22 supports exactly three hard-coded scenario definitions in \`lib/transmission-graph.mjs\` and an independent fixed \`SCOPES\` map in \`lib/transmission-dossier.mjs\`. These were vertical-slice pilots, **not the intended product scope**. Do not copy/paste three more graph arrays as the product's scalability strategy. Prioritize a **data-driven, typed scenario registry** that can load extensible scenarios without changing API routing or the analysis engine.

### Delivery phases

| Phase | Proposed implementation | Acceptance gate |
| --- | --- | --- |
| **A — Scenario registry** | Versioned JSON/schema definitions for scenario ID, event classes, geographies, commodities, industries, entities, node types, directional links, expected mechanisms, source contracts, mandatory evidence types and confidence state. Graph builder loads registry, preserves v0.22 scenarios as fixtures, validates cycles/unknown references/duplicate IDs/source rights, supports tenant-neutral catalog filters | Existing three scenarios remain deterministic, backward-compatible and never become causally verified by registry membership |
| **B — Evidence and time model** | Reusable observation contracts including authoritative URL, provider, metric, period/frequency/unit, geography, issuer ID, releasedAt, firstSeenAt, fetchedAt, asOfEligibility, correction/revision and normalized content hash; original vintage and current revision as separate types | No revised 2026 values enter a 2020 historical simulation; explicit unavailable/not verified statuses |
| **C — Scenario composability** | Shared transformation and candidate-edge framework that matches event→hazard→commodity/asset→industry→issuer using temporal and geographic constraints, joins only when real source coordinates and company evidence exist, exposes missing nodes, lag and data age | No edge marked confirmed due solely to two correlated or adjacent context datapoints; coverage and unresolved evidence observable |
| **D — Scenario catalog UX** | Search/browse/filter scenario templates by event class, region, affected industry, ticker, time horizon and evidence coverage; dynamic graph visualization and source inspector; create new research dossier from selected template | 10+ catalog templates can be shown without API code duplication; only supported cases can run live research; others explicitly say PLANNED / NOT CONNECTED |
| **E — Confidence and validation** | Hypothesis vs source-observed vs event-linked vs independently validated states; candidate comparison studies against controls and publication-time leakage tests; conservative abstention on issuer impact or predicted market outcome | No implied predictive probability, market return or investment recommendation without independent validation and licensing |

### Candidate event taxonomy for an expandable catalog

These are **hypothesis templates to research, not connected pipelines or verified economic effects**:

| Scenario family | Candidate pathway | Relevant evidence classes / potential source |
| --- | --- | --- |
| 1. ENSO/monsoon | Issued seasonal outlook → crop-region precipitation → acreage/yields → fertilizer trade/use → producers | NOAA CPC, IMD/other meteorological agencies, USDA FAS, UN Comtrade, SEC |
| 2. Extreme drought | Drought classification → reservoir/irrigation constraints → farm and power output → commodity and utility exposure | US Drought Monitor, NOAA, water agencies, EIA, SEC |
| 3. Snow and hydropower | Basin snow-water equivalent → runoff → hydropower availability → fuel substitution/power rates | NRCS SNOTEL, watershed operators, EIA, SEC |
| 4. Wildfire | Verified fire perimeter → insured footprint → claims/reinsurance → contractor/material demand | NASA FIRMS, fire-perimeter archive, NOAA, public insurer reports; private insured-location data required |
| 5. Hurricanes/floods | Issued track warning → port/property exposure → shipping/refining outages → losses and replacement demand | NOAA NHC/NCEI, port/plant status, insurers, SEC |
| 6. Energy shock | Natural-gas/oil capacity and trade disruption → energy feedstock costs → fertilizer/chemicals/transport margins | EIA API v2, firm filing disclosures, trade data |
| 7. Geopolitical sanctions | Effective-dated designation or trade restriction → restricted counterparties/routes → supply alternatives → issuer revenue/cost | OFAC Sanctions List Service, Federal Register, trade authorities, SEC |
| 8. Maritime chokepoint | Verified route/port disruption → freight and delivery lags → commodity input shortage → issuer exposure | Official port advisories, publicly permitted maritime feeds, trade statistics, SEC |
| 9. Earthquake | USGS observed event → validated site/plant footprint → operating disruption → industry supply constraint | USGS ComCat event revisions, disclosed facilities and verified outage announcements |
| 10. Mineral supply concentration | Mine/permit/export change → lithium/copper/rare-earth availability → electronics/renewable capital goods costs | USGS mineral series, government permits/trade data, company supply filings |
| 11. Disease/biological shock | Official public-health alert → absenteeism/transport/sector demand → business disruption | WHO/CDC dated reports and independent industry indicators; major confounding risk |
| 12. Macro/credit stress | Rates/credit spreads and lending indicators → refinancing/capital availability → cyclicals/banks/REITs | ALFRED vintages, regulatory releases, company maturity schedules |

**Prioritization:** First deliver registry mechanics and historical evidence contracts. Then fully connect 2–3 additional scenario families where the existing data providers are strongest: **energy shock**, **drought/agriculture**, and **sanctions/commodity trade**. Use wildfire or hurricane loss mapping only after credible insured-location/asset-footprint data are available. Avoid unlicensed vessel, insurance and proprietary exposure datasets.

### Product guardrails

- Catalog count ≠ connected/validated scenario count. Show \`TEMPLATE\`, \`DATA_PARTIAL\`, \`RESEARCH_CONTEXT\`, \`SOURCE_VALIDATED\`, \`EDGE_VALIDATED\` separately.
- Reuse existing \`/api/transmission\` and \`/api/transmission-dossier\` contracts through explicit compatibility adapters; keep v0.22 testing history.
- Keep human-authored, source-attributed causal hypotheses separate from observations, measured effects and model-generated claims. No arbitrary external URL fetch, no automatic financial trades, no model-generated financial impact without evidence.
- Run provider entitlement/coverage tests and full regression CI on the unified development branch; keep PR #19 draft until release acceptance.
- The six-agent Research Desk remains deferred: it will eventually consume this registry and evidence graph, rather than generating unconstrained claims from scratch.

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
| Transmission graph | **v0.22 three-scenario pilot built** | v0.23 versioned multi-domain scenario registry, documented provenance contracts, reusable evidence joins and honest scenario availability; next validate georeferenced issuer relationships |
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
