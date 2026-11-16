# ResearchOS P0-first execution register (proposed Sprint 5–16)

Snapshot date: 2026-11-16. Branch: feature/tradescope-v018-unified-development. PR #19 remains draft.

This is a forward **planning** register. Earlier engineering sprints 1–4 are in SPRINTS.md; versions v0.5–v0.39 are not sprint numbers. P0 work can have delivered code while independent release acceptance remains open. Do not proceed to P1 because unit tests pass.

| Sprint | Priority | Scope | Current engineering evidence | Independent acceptance still needed |
| --- | --- | --- | --- | --- |
| 5 / v0.39 | P0 | Source contract diagnostics and entity ownership graph | GLEIF, EPA, SEC identifiers + accounting-parent/candidate crosswalk code | Live source schema, rights/rate contracts, independent legal CIK↔LEI mapping, real browser |
| 6 / v0.40 | P0 | Legal parent/subsidiary/operator/supplier corroboration | v0.40 GLEIF Level 2 accounting relationship periods and source-conflict UI added to v0.37–39 pilots | Still OPEN: independent CIK↔LEI/facility legal proof, effective dates and authenticated adjudication |
| 7 | P0 | Incident hazard footprints and facility intersections | USGS epicenter proximity pilot | USGS intensity polygons, wildfire perimeters, flood/wind regional footprints |
| 8 | P0 | Historical first-release/revision provenance | Local capture receipts and selected ALFRED/NOAA pilots | Actual original issue timestamps, source revisions and no hindsight leakage |
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
