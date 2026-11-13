# ResearchOS / TradeScope — Product Backlog Audit After v0.25

**Audit date:** 2026-11-13
**Source:** current implementation on feature/tradescope-v018-unified-development, original V018_PRIORITIZED_BACKLOG.md, FEATURE_STATUS.md, v0.19 M1–M4, v0.20–v0.25 release docs and the cumulative draft PR #19. This is a scope audit, NOT a user-acceptance or production-compliance signoff.

## Scope delivered as local engineering pilots

| Workstream | Engineering status | Remaining acceptance limitation |
| --- | --- | --- |
| Branch and PR management | Built cumulative branch; PR #19 still draft/unmerged | Single full release gate remains deferred |
| Commodity disruption source pilot M1–M4 | Built limited Federal Register → issuer business evidence → research brief → watch/feedback workflow | User interviews, document/event correctness, real quantified exposures, consented customers/revenue |
| Live US equity and research terminal | Bounded Alpaca IEX streaming/polling, daily/intraday charts, SEC financials, signal engine, watchlists, market hub | Actual subscription coverage, market data licensing, adjusted returns, breadth, browser UX |
| Macro research & historical vintage lookup | FRED/ALFRED baseline and v0.23 metadata/vintage/release/as-of explorer | Live provider verification, original first-available and exact publication clocks |
| Climate/commodity source connectors | NOAA CPC discussion, NASA POWER revised monthly points, USDA FAS, EIA v2, UN Comtrade public/optional subscription, USGS mineral transcription, GDELT/Federal Register | Keys/provider health, historical release origins, correct weather area/polygon, authoritative commodity exposure |
| Event-to-economy transmission models | 12 registry scenarios: 3 research-context, 2 partial-source, 7 template-only | Zero independently validated causal edges; no quantified issuer effect or predictive accuracy |
| Research evidence persistence | v0.24 optional local hash-chained source journal | Not WORM, not independently timestamped, not multi-user or production license cleared |
| Geographic issuer exposure | v0.25 public USGS recent GeoJSON + optional source-cited local candidate facility records + distance screen | No independently verified operating facility coordinates/ownership; no site intensity or measured financial damage |
| AI research workflow | Existing bounded deterministic / optional model-assisted source research | Six parallel agents + NVIDIA model runtime are **backlog only**, not built |

## Remaining milestones, prioritized

| Priority | Milestone | What must be implemented or proven | Why before feature expansion |
| --- | --- | --- | --- |
| **P0-1** | Provider credentials, rights and real-source acceptance | Rotated local FRED/EIA/USDA/Comtrade/Alpaca keys; verify upstream response schemas, permissions, rate/retention/redistribution rights, source freshness, missing periods | Pilot correctness/paid distribution |
| **P0-2** | Real facility/issuer crosswalk | Official facility directories, validated identity & CIK or legal subsidiary matches, dated operator/asset ownership, exact source addresses or polygon coordinates, independent source excerpts and review workflow | v0.25 inputs remain analyst-unverified |
| **P0-3** | Historical release and geography provenance | Independently verified first release/first seen/revision times, area weather stations & gridded polygons, chain evidence, true historical as-of excludes updated sources | No lookahead or retrospective data leakage |
| **P0-4** | Geospatial hazard and issuer event join | Event-specific observed hazard polygons/intensity (ShakeMap, actual fire perimeters, wind/flood footprints), asset effective-date intersections, source mismatches/missingness and uncertainty | Distance from USGS epicenter is insufficient |
| **P0-5** | Econometric validation | Historical outcome labels/benchmark adjustments, multiple shocks & control periods, measurable sector/issuer effects, lag/uncertainty, false positives and held-out study | No credible prediction/impact claims yet |
| **P0-6** | Product/customer acceptance | Actual live browser testing, end-to-end 1–2 verified economic case studies, 8–10 analyst interviews, 2–3 research design partners, measured research time saved and customer willingness to pay | Prevent unused feature development |
| **P1** | Broader scenario source connectors | Drought Monitor/NRCS snowpack, issued tropical cyclone maps, USGS ShakeMap/perimeter products, OFAC sanctions with legally effective dates, facility directory joins, permitted maritime feeds | Turns 7 templates into usable evidence-supported workflows |
| **P1** | Durable operational storage and access | Transactional entity/evidence store, record versioning/migrations/backup, users, OIDC, roles/tenant isolation, audit log and secrets management | Required before a public SaaS |
| **P1** | Research case & alert effectiveness | Repeated alert scoring, source evidence/analyst approvals, licensed delivery, audit trails, collaborative cases, RAG citations and missing-evidence abstention | Paid researcher workflow |
| **P2** | Market breadth | Accurate standardized 5k stock universe, licensed ETF holdings, earnings/dividends, benchmark/provider adjustment, advanced screener/heatmaps | Not a first commercial wedge |
| **Deferred** | Six-specialist Research Agent Desk and NVIDIA NIM | Model provider adapter + scoped read-only tools, six concurrent actual workers, traces, budget/cancel/human review and prompt-injection safeguards | Depends on the above evidence and access model |
| **Deferred** | Subscription billing / hosted scale | Plan packaging, priced data rights, enterprise operations, billing and deployment | Only after design partner signal |

## Proposed next build: v0.26 Verified Company Exposure Contracts

One narrow end-to-end workflow:
1. Obtain documented *official* facility directory observations (e.g. a bounded US EPA/EIA dataset), including exact government-issued facility IDs and coordinates.
2. Match a facility to a SEC CIK only with an independently documented legal operator/owner/subsidiary relationship (not normalized company names alone).
3. Maintain effective dates and separately captured issuer document/coordinate/directory evidence. Never mark a human-entered claim as verified merely because it passed syntactic validation.
4. Show source diff, alternative identifiers, missing records and analyst approval, retaining explicit unverified states and refusal to estimate lost earnings.
5. Reuse the same proof contract for fertilizer plants, mines, power assets, refineries, ports and insured locations.

**Do not build a wider catalog, 80 screener filters, or generic autonomous agents before this verification wedge is useful to analysts.**

## Actual release blockers

Tests using mocked provider responses are not live entitlement, price-vintage, spatial integrity, production security or visual acceptance. Existing PR #19 must remain draft and unmerged pending those gates. The old FEATURE_STATUS.md describes earlier v0.7–v0.9 pilots; its claims are not a reliable current top-level audit without the later v0.19–v0.25 documentation.

For implementation docs: V019_COMMODITY_PILOT_M1_M4.md; V020_MARKET_RESEARCH_WORKSPACE.md; V021_PROVIDER_SOURCE_CONTROL.md; V022_TRANSMISSION_LAB.md; V023_SCENARIO_REGISTRY_AND_FRED.md; V024_EVIDENCE_PROVENANCE_LEDGER.md; V025_GEO_ISSUER_EXPOSURE.md.
