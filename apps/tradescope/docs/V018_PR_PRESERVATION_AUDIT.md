# ResearchOS / TradeScope — Unified Branch Preservation Audit

Audit date: **2026-11-13**. Source: GitHub open pull requests and commit comparisons against `feature/tradescope-v018-unified-development`.

**Conclusion:** all 13 currently open, older TradeScope draft PR head commits are ancestors of the unified branch. Each GitHub comparison reported **`behind_by=0`**. The unified PR is **#19**, targeting repository default branch **`main`**. No historical draft PR was merged or closed during this audit.

## Exact inclusion verification

| Legacy draft PR | Feature / ancestry | Unified commits ahead of the PR head | Legacy PR commits missing from unified branch |
|---:|---|---:|---:|
| #2 | v0.6 terminal / evidence assistant | 136 | **0** |
| #3 | v0.7 IEX streaming and market data | 129 | **0** |
| #4 | v0.8 research metrics and screens | 127 | **0** |
| #5 | v0.9 monitoring and Market Atlas | 125 | **0** |
| #9 | SEC regulatory and tax pilots | 111 | **0** |
| #10 | v0.10 issuer discovery and archive | 84 | **0** |
| #11 | v0.11 large SEC filings and thematic analogues | 75 | **0** |
| #13 | v0.12 signals and multi-hazard analogues | 59 | **0** |
| #14 | v0.13 completed-session candlesticks | 45 | **0** |
| #15 | v0.14 intraday and Crisis & Climate | 27 | **0** |
| #16 | v0.15 historical ALFRED macro | 20 | **0** |
| #17 | v0.16 warning replay and outcomes | 13 | **0** |
| #18 | v0.17 long-history market outcomes | 3 | **0** |

*Counts are a Git commit-snapshot as of the audit, not immutable future counts. `ahead` describes additional commits in the unified branch after each older head. `behind=0` establishes that the entire older head history is reachable from the unified branch.*

## Verification boundaries

Commit ancestry proves that changes were incorporated into the cumulative branch history; it does **not** establish that every earlier behavior is unchanged. Subsequent commits may intentionally alter or supersede previous files. The v0.18 structural test guards critical module/API/UI wiring, and the complete Node regression suite is a development-level check.

**Not yet established:** original macro release timestamps, source-provider credentials/entitlement, 2008 adjusted market-price correctness, predictive skill, complete browser acceptance, production security, or deployment readiness. Use `V018_UNIFIED_DEVELOPMENT.md` and `STACKED_RELEASE_VALIDATION_GATE.md` for planned release gates.

## Closure recommendation

- Keep **only PR #19** active for future commits to `feature/tradescope-v018-unified-development`.
- Previous PRs #2, #3, #4, #5, #9, #10, #11, #13, #14, #15, #16, #17, and #18 can **later** be closed as `Superseded by #19 — commits preserved in unified branch` after user approval.
- **Do not merge or delete old branches** merely to simplify the PR list; closing unmerged draft PRs preserves their discussions and commit references. Deleting branches is unnecessary.
- Do **not** merge PR #19 into `main` until comprehensive validation is approved.
