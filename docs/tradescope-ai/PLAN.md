# TradeScope AI — Market Surveillance / Transaction Intelligence

**Status:** Proposed MVP, engineering branch `feature/tradescope-ai-showcase`.
**Primary tracking issue:** [#1 — Codex-ready MVP](https://github.com/sid-cha/ResearchOS/issues/1).

## Product hypothesis
An evidence-first blotter for public market events that combines deterministic replay, statistical anomaly detection, investigative context and eventually properly evaluated prediction models. Initial release uses **synthetic replay**, not a live market feed.

## MVP user experience
1. Command Center: event counts, flagged signals, high-risk review queue and data-source health.
2. Event Blotter: sortable, searchable events; symbol/venue/severity filters; source and event time.
3. Detection Center: four configurable threshold rules (volume, spread, cancellation concentration and price dislocation), explicit rule ID/version and observed-to-threshold evidence.
4. Event Investigation: full details, historical baseline, evidence, analyst-reviewed state and CSV export.
5. Replay Lab: deterministic pause/resume/reset historical stream.
6. Persistent synthetic-data disclosure; no real-money trading, account-specific surveillance or trained predictive accuracy claims.

## Architecture
Keep ResearchOS existing Java 21 / Spring Boot, Next.js/React and Python structure. Implement surveillance as a **bounded context**, not a wholesale replatform. Proposed backend: canonical typed events, validation and deduplication, Kafka Streams when warranted, PostgreSQL storage, idempotent source IDs and cursor API. Python ML is a later bounded component. A public static demo must not require private APIs or credentials.

### Canonical envelope
```json
{
  "eventId":"evt_demo_001",
  "source":"synthetic_demo",
  "sourceEventId":"synth_001",
  "schemaVersion":"1.0.0",
  "eventKind":"MARKET_TRADE",
  "symbol":"AAPL",
  "venue":"SIM",
  "eventTime":"2026-11-11T14:30:00Z",
  "ingestTime":"2026-11-11T14:30:01Z",
  "sourceCoverage":"SYNTHETIC",
  "payload":{"price":"250.12","quantity":"100"}
}
```

Do not conflate MARKET_TRADE with PAPER_ORDER_LIFECYCLE or PRIVATE_CLIENT_ORDER.

## Engineering acceptance
- Same fixture + detector version yields identical alerts.
- Provider/source identifiers are deduplicated, event and processing timestamps separate.
- All scoring results expose supporting event IDs, threshold, actual value and rule version.
- Search/filter/replay/export and keyboard interaction work.
- Test thresholds, missing inputs, duplicate events and no-future-leakage feature computation.
- No secrets/client data in public bundle. No misleading live-data badges.

## Delivery sequence
TS-001 canonical schemas + synthetic fixtures → TS-002 persistence/replay APIs → TS-003 rules/evidence → TS-004 Next.js UI → TS-005 permissioned Alpaca read-only market adapter → TS-006 approved Nasdaq ITCH historical parser → TS-007 out-of-sample forecasting validation.

## Codex first task
Implement TS-001 and TS-002 in a **draft pull request**. Read the issue, inspect the repository before coding, preserve its build conventions, and include automated tests. Do not merge or deploy without review.

## Launch gates
Public, working URL; clear synthetic/live distinction; mobile/keyboard smoke test; hosting commercial-use compliance; data-source redistribution permissions before real feeds; time-split model validation before prediction performance claims.
