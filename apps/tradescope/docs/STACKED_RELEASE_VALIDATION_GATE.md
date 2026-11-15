# ResearchOS — Stacked Draft PR Inheritance and Consolidated Release Validation Gate

## Branch ancestry (checked 2026-11-13)
- PR #15: `feature/tradescope-v014-intraday-crisis-climate-atlas` based on `feature/tradescope-v013-monitor-candlesticks` (18 incremental commits).
- PR #16: `feature/tradescope-v015-point-in-time-macro-warning` based on PR #15's head (7 additional commits).
- PR #17: `feature/tradescope-v016-historical-warning-backtest` based on PR #16's head (7 additional commits).
- PR #18 (this development branch when created): `feature/tradescope-v017-historical-market-expansion` based on PR #17's head.
- **Cumulative HEAD** contains ancestors of each stacked branch. **Individual GitHub PR diffs display only that PR against its immediate base**. PR #17 does not list all v0.14 and v0.15 files in its own changed-files view even though its branch tree inherits their changes.
- At the audit point, PR #17 HEAD was 128 commits ahead of main and zero behind; this may change if main advances.
- Other open experimental branches not in this ancestor graph are not automatically included and must be separately inspected during the consolidation gate.

## Current gate: development/test-only
Unit tests, static output allowlist, mocked provider contract tests and source validation are continuous. These are developer checks, **not** approval of historical performance, source entitlements, legal redistribution or production safety.

## Final release validation — defer execution until feature completeness

### Gate A — Branch consolidation
- Freeze target commit and compare it against `main`, every open PR head, and existing non-ancestor research branches. Reconcile overlapping changes.
- Require zero unresolved merge conflicts; retarget stacked PRs after merging or use one reviewed consolidation PR if the desired release strategy changes.
- Perform full regression, static build, dependency/secret scans, API contract and accessibility checks.

### Gate B — Market and macro evidence
- Verify exact original ALFRED real-time vintages and earliest released observations for T10Y3M, BAMLH0A0HYM2 and NFCI on 2007 and 2020 dates. Do not assume series existed at the time.
- Verify actual provider credentials, market entitlements, historical bar completeness, adjustment basis, exchange/session handling and first publication.
- Cross-check 2008 EODHD adjusted SPY returns with another legally licensed benchmark; test holiday gaps, split/dividend handling and no look-ahead into candidate macro signals.
- Verify source timestamp and release clock for weather, ENSO, fertilizer and other historical alerts when implemented.

### Gate C — Statistical validity
- Predefine crisis labels, decision times, benchmark, return horizon and publication lags.
- Quantify sample coverage, negative controls, confounders, false alarms, precision/recall, lead time and confidence intervals only at defensible sample sizes.
- Add multiple regimes, genuine out-of-time folds, baseline comparisons and calibration if predictive probabilities are introduced.
- Prevent leakage through current revisions, hindsight news, post-event issuer mappings and benchmark labels.

### Gate D — Product and security
- Live market Alpaca entitlement and feed provenance.
- Real-browser E2E and mobile UI checks, API contract testing, error/loading/credential-state accessibility, cross-origin and authentication review.
- Data licenses, storage/redistribution obligations, privacy and enterprise multi-tenant boundaries.
- Deployment staging, rollback and incident response.

## Release decision
**No merge or deployment is authorized by this document.** Keep PR #15–#18 as drafts until product scope and these validation gates are reviewed. Tests passing does not establish live historical validity.
