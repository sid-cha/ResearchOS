# ResearchOS P0-first execution register (proposed Sprint 5–16)

Snapshot date: 2026-11-16. Branch: feature/tradescope-v018-unified-development. PR #19 remains draft.

This is a forward **planning** register. Earlier engineering sprints 1–4 are in SPRINTS.md; versions v0.5–v0.39 are not sprint numbers. P0 work can have delivered code while independent release acceptance remains open. Do not proceed to P1 because unit tests pass.

| Sprint | Priority | Scope | Current engineering evidence | Independent acceptance still needed |
| --- | --- | --- | --- | --- |
| 5 / v0.39 | P0 | Source contract diagnostics and entity ownership graph | GLEIF, EPA, SEC identifiers + accounting-parent/candidate crosswalk code | Live source schema, rights/rate contracts, independent legal CIK↔LEI mapping, real browser |
| 6 / v0.40–0.41 | P0 | Legal parent/subsidiary/operator/supplier corroboration | GLEIF Level 2 source conflict plus v0.41 read-only SEC/EPA/GLEIF case, proof gaps and as-of JSON export | Still OPEN: independent CIK↔LEI/facility legal proof, effective dates, licensed/live source acceptance and authenticated adjudication |
| 7 / v0.42–0.43 | P0 | Hazard footprints and modeled seismic intensity | NWS flood warning areas, WFIGS current wildfire polygons, and v0.43 bounded USGS ShakeMap grid.xml MMI at captured EPA points | OPEN: real provider acceptance, CoverageJSON/HDF model validation, surveyed assets, actual flood/fire damage, insured loss |
| 8 / v0.44 | P0 | Historical first-release clocks, corporate/regulatory precursor monitoring | v0.44 explicit GDELT/Federal Register/Alpaca captures, conservative issuer headline risk alerts, local first-seen and revision journal, replay UI; NOAA/ALFRED pilots remain | OPEN: live publisher/agency original intraday timestamps, provider rights, counterparty graph, licensed continuous monitoring, alert-delivery SLA, historical hindsight-proof case |
| 9 | P0 | Two complete event–commodity–issuer case studies | Limited scenario and commodity research pilots | Verified mechanism, issuer materiality and independent outcome data |
| 10 | P0 | Prospective negative controls and historical performance | Preregistered unverified outcomes and limited studies | Certified positive/negative labels, holdout, error/false alarm estimates |
| 11 | P1 | Parallel source-scoped agent research | Six bounded sequential roles with separate challenger | Real independent tool workers, permissions/budgets/cancel and evaluation |
| 12 | P1 | Browser E2E and customer researcher UX | Many research screens and fixture tests | Validated workflows, mobile acceptance and design-partner studies |
| 13 | P1 | Full transactional persistence and jobs | Java/Postgres optional snapshots plus many private JSON journals | Schema migration, backups, recovery, locks and durable jobs |
| 14 | P1 | User authentication and reviewer isolation | Local single-user pilot | OIDC, reviewer independence, RBAC, tenant-safe data and audit |
| 15 | P1 | Licensed SaaS deployment and reliability | Nonroot local Docker pilot | Staging, provider rights, access control, observability and rollback |
| 16 | Beta/P2 | Private beta and commercial readiness | Concept only | Real design partners, willingness-to-pay and approved release |

**Workflow policy:** Validate v0.39 live EPA/SEC/GLEIF source responses and v0.40 Level 2 contract, finish P0-6 legal crosswalk, P0-7 hazard footprints, P0-8 historical source clocks, P0-9 economic case studies, and P0-10 scientific evaluation before starting new P1 scope. Current CI success and code labels are not real-world verification, source entitlements, prediction quality or commercial readiness.

Backlog references: docs/SPRINTS.md, docs/V018_PRIORITIZED_BACKLOG.md, docs/V025_PRODUCT_BACKLOG_AUDIT.md, docs/STACKED_RELEASE_VALIDATION_GATE.md. Do not merge PR #19 until the full gate is reviewed.


**Next P0 focus:** validate live v0.42 NWS/WFIGS and v0.43 USGS event grid captures, compare model intensity against USGS CoverageJSON/HDF, and proceed to P0 Sprint 8 original source publication chronology. P0-5/6 independent ownership and provider license gates remain OPEN; no P1 substitution.


**P0 Sprint 8 case benchmark (new): NVIDIA / Megaspeed regulatory and intelligence-allegation reporting.** Research objective: capture contemporaneous publication, GDELT provider indexing and local receipt separately, replay independently confirmed 2025 reporting against later reports without hindsight leakage, and evaluate whether bounded risk alerts could be generated *from the evidence then available*. Do NOT label any person as a spy, prefill the case as a factual intelligence conclusion, claim detection in 2025 from a 2026 archive or infer verified NVDA return causality. Added v0.44 engineering increment; real acceptance still OPEN.

**Forward order:** complete Sprint 8 source-first publication-clock verification and live provider acceptance; then Sprint 9 case studies and Sprint 10 negative controls. P0 Sprint 5–7 independent acceptance gaps stay open; P1 remains deferred.
