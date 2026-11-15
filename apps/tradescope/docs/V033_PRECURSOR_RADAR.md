# ResearchOS / TradeScope v0.33 — Precursor Radar

**Branch:** feature/tradescope-v018-unified-development · **PR:** #19 draft.  
**Scope:** Observational event research leads, not proven early warnings or financial predictions.

## Delivered
1. **Post-response capture clocks.** v0.32 stamped data before awaiting provider collection. v0.33 now stamps local firstObservedAt and revision evidence after the corresponding response arrives. These clocks are neither certified original first-publication nor independent timestamps.
2. **Six-hour UTC polling coverage.** Source-specific pollWindows retain success/failure counts and earliest/latest successful checks. Existing v0.32 stores migrate with empty coverage; historical checks are never invented. History is bounded to 4000 provider-window entries; archives fail closed when capacity is reached.
3. **Non-hindsight evidence snapshots.** The local precursorEvidence({asOf}) method returns only event revisions captured by the selected cutoff, and only fully completed polling windows. Older provider timestamps cannot backdate local knowledge.
4. **Rolling baseline.** A completed six-hour UTC window is compared with four preceding six-hour windows. Each of five windows requires at least two successful source polls, the first within two hours of bucket start and last within two hours of the end, and zero failed polls. Otherwise return ABSTAIN_COVERAGE.
5. **Source-specific observation threshold.** INVESTIGATE_OBSERVED_ACTIVITY requires at least three unique source IDs both first captured locally and source-timed inside the last completed window, a >=2.5x activity ratio compared with max(1, baselineMean), and >=2 observed events above the preceding four-window mean. Otherwise return NO_ACTIVITY_SPIKE. Rule: PRECURSOR-0.33.1.
6. **Geographic candidates.** A qualified source may show how many separately identified observations lie within 200 km of one observed event. This is not independently verified damage, source independence or future escalation.
7. **Prequential control windows.** Earlier fully covered windows are evaluated using their own four preceding reference windows. Count threshold crossings as *descriptive prior controls*, never as validated false positives; falsePositiveRate, precision, recall and forecastProbability remain NULL / unmeasured because independent ground-truth future outcomes and negative labels do not yet exist.
8. **User interface.** Global Events → Event Radar → Precursor Radar, at http://127.0.0.1:8000/event-portal.html#precursor-radar, shows coverage, source ratios, evidence IDs, candidate geographic concentration and prequential control counts. It requests local read-only evidence only, not live external collection.

## Local endpoints

| HTTP | Local route | Behavior |
|---|---|---|
| GET | /api/precursors/catalog | Rule version, fixed providers and validation status |
| GET | /api/precursors/analysis | Evaluate latest fully completed six-hour window |
| GET | /api/precursors/analysis?source=USGS&asOf=2026-11-14T18%3A00%3A00Z | Source-scoped, as-of analysis of locally captured evidence |

No mutation or AI/trade API is included. Future cutoffs, unknown providers and duplicate/unsupported query parameters are rejected.

## Run and testing

Use the ignored private apps/tradescope/.env:

    HOST=127.0.0.1
    GLOBAL_EVENT_COLLECTION_ENABLED=true
    # Optional: only after verifying each source's request and local retention terms:
    # GLOBAL_EVENT_AUTO_POLL_ENABLED=true
    # GLOBAL_EVENT_POLL_SECONDS=300

From apps/tradescope:

    npm test
    npm run build:static
    npm start

First collect authorized observations at /event-portal.html#global-feed. Open /event-portal.html#precursor-radar. The baseline requires five *completed and covered* six-hour windows: a minimum theoretical 30 hours of adequate history. Expect abstention when starting cold. Deterministic fixture tests are not proof of historical market or disaster prediction.

## Limitations and next validation
- Source IDs may be aftershocks, linked reports, provider revisions or independent incidents; causal independence is not established.
- The USGS recent 4.5+ earthquake feed, limited NASA open events, and FAA airport advisories have incompatible sampling/coverage. Their activity rates are never pooled.
- Successful HTTP requests do not prove complete upstream coverage; a missing current-feed item does not establish resolution.
- Source event-time consistency omits some late reports to avoid counting initial backfill as fresh.
- Local time is not certified first-publication time. This implementation does not produce real trading alerts, a validated event probability, lead-time forecast, verified issuer exposure or measured financial impacts.
- A statistically defensible false-positive rate requires independently adjudicated negative periods and observed prospective outcomes. Earlier threshold crossings alone cannot supply them.
- Local persistence remains bounded and single-process, without distributed locks, audit notarization, SQL or source-license certifications.
- Production readiness requires live-provider acceptance, data-use/retention checks, real browser acceptance, prospective evaluation and labeled outcome studies.

Next logical area: v0.34 independent Research Agent Desk and adversarial Anti-Agent; these must inspect cited sources, record decisions and challenge unsupported inferences without ever claiming predictive skill from this pilot.
