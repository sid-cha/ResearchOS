# ResearchOS v0.47 — Autonomous Source Monitor (P0)

Branch: feature/tradescope-v018-unified-development. Draft PR #19, not merged.
Local workspace: http://127.0.0.1:8000/source-monitor.html
Navigation: Research Operations → Sources & Provenance → Autonomous Source Monitoring.

## Scope

v0.47 adds an opt-in **single-process local scheduler** for the bounded collectors built in v0.44–0.46. It records every source attempt before the provider call, distinguishes a successful source observation from an interrupted run, and queues human-review alerts in a private **local inbox**. It does NOT deploy an always-on cloud worker or send email, SMS, Slack, push notifications or webhooks.

| Collector | Registered targets | Minimum check interval |
|---|---|---|
| NOAA_NUMERIC | RONI, RELATIVE_NINO34, SOI, TRADE_WIND_CPAC, TRADE_WIND_WPAC | 360 min |
| CORPORATE_PRECURSOR | NVDA, AMD, MSFT, AAPL, META, AMZN, TSLA, PLTR; GDELT/Federal Register/entitled Alpaca | 60 min |
| MECHANISM_RADAR | ENSO, export policy, logistics and energy; GDELT or ENSO-only NOAA CPC | 60 min |

Maximum 16 registered schedules, single-process concurrency of 1. All providers and targets are allowlisted. No arbitrary URL, code, shell command, unlimited cron string or external recipient can be scheduled. Jobs must be manually added. Source rights remain separately guarded by each underlying collector.

## Activation

After reviewing and confirming all applicable source terms and retention/redistribution permissions, explicitly configure the ignored local environment file at apps/tradescope/.env:

    HOST=127.0.0.1
    SOURCE_MONITOR_ENABLED=true
    SOURCE_MONITOR_RIGHTS_CONFIRMED=true
    # SOURCE_MONITOR_STORE_PATH=C:/Users/you/ResearchOS-data/source-monitor.json

Additionally enable the underlying collector before using a corresponding schedule:
- NOAA: CLIMATE_NUMERIC_CAPTURE_ENABLED=true and CLIMATE_NUMERIC_RIGHTS_CONFIRMED=true
- Corporate news: CORPORATE_PRECURSOR_CAPTURE_ENABLED=true and CORPORATE_PRECURSOR_RIGHTS_CONFIRMED=true
- Mechanism topics: MECHANISM_RADAR_CAPTURE_ENABLED=true and MECHANISM_RADAR_RIGHTS_CONFIRMED=true

These flags are self-attested settings, NOT legal license verification. Alpaca additionally requires authorized news entitlements. Never commit source credentials or private journals.

The scheduler only starts when the local server is running and the monitor's two environment switches have been enabled. When a new schedule is added, the first automatic check is one full interval in the future; a user can deliberately request an immediate one-off run.

## Durable execution protocol

Private journal: apps/tradescope/.local-data/source-monitor.json unless overridden.

1. Persist a RUNNING attempt with scheduled and actual start timestamps before fetching source data.
2. Delegate to the underlying source module, which keeps its own capture clock and SHA-256 digest.
3. Persist SUCCEEDED or FAILED with bounded provider error text, latest source hash, scheduled-start delay and next eligible timestamp.
4. Failures retry with bounded backoff. Source permission revocation is treated as failure; it is never bypassed.
5. On startup, a persisted RUNNING attempt is converted to INTERRUPTED and rescheduled rather than assumed successful.
6. Repeated article/topic identifiers and source digest observations are deduplicated in the bounded local inbox.
7. A user can acknowledge an alert without certifying it as true.

The private JSON journal is atomically rewritten with an integrity checksum, at most 240 run records and 300 local alerts (approx. 4.5 MB total). It is NOT cryptographically notarized WORM provenance or multi-process transaction isolation. Alert keys older than retained history can reappear after pruning; complete global deduplication will need a production database.

The local inbox records capture-to-inbox and scheduled-start delay only. Neither measures the publisher's first public release, an investor's receipt or an actual external push delivery. The local Node process must remain running; no uptime SLA exists in this release.

## Evidence and epistemic controls

- NOAA index updates, RONI thresholds and source revisions are REVIEW CUES, not official ENSO confirmation, California flood forecasts, fishery/fertilizer outcomes or security-return signals.
- A corporate allegation headline documents reporting, not personal wrongdoing or verified government findings.
- A GDELT mechanism title is a topic lead, not verified physical causation.
- No provider-index time is silently promoted to verified publisher publication time.
- Alert importance is a review label, not an independently measured probability of economic impact.

## API and manual checks

Local read:
- GET /api/source-monitor/catalog
- GET /api/source-monitor/status
- GET /api/source-monitor/status?alertStatus=NEW

Same-origin loopback POST, JSON only, explicit header X-ResearchOS-Source-Monitor: 1:
- POST /api/source-monitor/schedule with kind, target, provider, intervalMinutes, enabled.
- POST /api/source-monitor/toggle with jobId, enabled.
- POST /api/source-monitor/run with jobId.
- POST /api/source-monitor/acknowledge with alertId.

Manual example:
    {"kind":"NOAA_NUMERIC","target":"RONI","provider":"RONI","intervalMinutes":360,"enabled":true}

Local acceptance:
    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Confirm an idle startup, manually scheduled source, delay to first automatic attempt, deliberate Run Once, source hash, alert review and restart persistence. Check permission-revoked failures and deliberate process interruption using disposable private data. Validate live provider schemas, rate/usage rights and mobile/browser controls independently.

## Remaining P0 gates

- Real provider acceptance, source permission audits and NOAA/news original release-vintage verification.
- Always-on job hosting, database transactions, distributed leases, global rate limits, dead-letter jobs, back-pressure and complete deduplication retention.
- Authenticated, opt-in external notifications with independent deliver/ack/retry outcomes and measured provider-to-recipient latency.
- Verified region/facility/industry/corporate evidence joins and prospective false-positive/lead-time evaluation.
- Production authentication, secure multi-tenant isolation, operational monitoring and resilience.

P0 live/scientific acceptance remains OPEN. P1 remains deferred. Next engineering focus: region-to-industry/issuer source proofs, first-release chronology and economic case studies.
