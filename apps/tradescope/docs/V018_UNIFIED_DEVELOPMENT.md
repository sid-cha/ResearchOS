# ResearchOS v0.18 — Unified development and release validation

**Decision:** Keep `main` unchanged; use `feature/tradescope-v018-unified-development` as the single active development branch and a single cumulative **draft PR targeting `main`**. Continue new features on the same branch until the planned release gate. Do not merge merely because unit tests pass.

## Verified branch-history ancestry (2026-11-13)

Comparison performed through GitHub's compare endpoint:
- `feature/tradescope-v010-discovery-case-workflow` → v0.18: **82 commits ahead, 0 behind** (as of the v0.18 structural-guard commit).
- `main` → v0.18: **139 commits ahead, 0 behind**; current branch includes every current main commit.
- Earlier feature branches `feature/tradescope-ai-showcase`, `feature/tradescope-v07-market-data-integrity`, `feature/tradescope-research-intelligence`, `feature/tradescope-monitoring-atlas`, `feature/tradescope-discovery-corporate-archive` and `feature/tradescope-regulatory-tax-foundation` are ancestors of the v0.17 base.
- Each of the v0.11, v0.12, v0.13, v0.14, v0.15, v0.16 and v0.17 development branch heads is an ancestor of this v0.18 branch.

The historical PRs may be closed as superseded by the single v0.18 PR. Closing is **not merging**. Their branch heads and review history remain in the repository; do not delete branches as part of this consolidation.

## What the v0.18 branch currently inherits

| Version | Modules and workflows in cumulative tree | Validation state |
| --- | --- | --- |
| v0.6–v0.9 | Terminal UI, IEX market stream, research metrics/screens, monitoring, event analogues, Market Atlas, case and Java bridge pilots | Prior unit checks; full product/browser/live-data release validation not complete |
| v0.10 | Issuer discovery, registered research universe/watchlists, archived cases and SEC regulatory/tax research pilots | Prior unit checks; full release validation pending |
| v0.11 | Larger SEC filing extraction, thematic analogues | CI/regression tests; historical first-seen/live verification pending |
| v0.12 | Signals dashboard, multiple hazard and analogue expansions | CI/regression tests; live provider UX verification pending |
| v0.13 | Completed-session candlestick/volume chart API | CI/regression tests; actual IEX entitlement verification pending |
| v0.14 | 1m/5m/15m/1h intraday charts; five Crisis & Climate case-study pathways | CI/regression tests; original historical warnings not yet established |
| v0.15 | FRED/ALFRED vintage snapshot adapters, deterministic research candidate thresholds | CI/regression tests; actual 2007/2020 source histories & publication timing unverified |
| v0.16 | Bounded replay of macro candidates, 2017 comparison, forward SPY outcomes and descriptive metrics | CI/regression tests; no validated predictive performance |
| v0.17 | Opt-in, licensed EODHD 2008-era SPY adjusted-close outcome source; data-quality/entitlement handling | CI/regression tests; real provider entitlement/2008 prices unverified |
| v0.18 | Unification branch and additional structural guards for inheritance and backend/UI presence | CI required; does not independently prove correct functionality |

This table describes **files and functionality present in the branch**, not an independently verified production-ready product.

## One-PR workflow

1. Open one draft PR from `feature/tradescope-v018-unified-development` directly to `main`.
2. After proving PR ancestry and the successful cumulative CI suite, close previous stacked draft PRs as **superseded**; keep their commits and branches.
3. Keep committing new features to this SAME v0.18 development branch so the single draft PR always includes them.
4. Periodically run unit tests, security/static allowlist and regression checks; record failed and fixed runs.
5. At near-feature-completeness, freeze the head SHA, run the full validation checklist, then review for merge. Never auto-merge.
6. Only after the approved merge, create a new feature branch from updated `main` for the next release.

## Deferred comprehensive validation (not waived)

Follow `docs/STACKED_RELEASE_VALIDATION_GATE.md` for all of:
- ALFRED historical original vintage dates and timing.
- IEX/Alpaca entitlement, intra-/daily bars, session handling, SEC filings/source provenance.
- EODHD rights and independent SPY 2008 historical pricing cross-check.
- Historical backtest leakage checks, statistical coverage, controls, calibration, lead-time measurements and genuine out-of-time studies.
- Climate and business exposure verifications as modules are developed.
- Real-browser/desktop/mobile acceptance, API security, authentication/workspace isolation, secret scans, licensing, deployment staging/rollback.

A passing CI suite establishes development-level regression quality only. **No production deployment or merged release has been authorized.**
