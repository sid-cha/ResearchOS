# v0.9 — Local monitoring, Market Atlas and research storage

Implementation guide for `feature/tradescope-monitoring-atlas`, prepared November 12, 2026. This increment builds on the v0.8 research foundation. It adds scheduled evaluation of saved screen criteria, requested-pilot market comparisons and an optional local Java/PostgreSQL snapshot bridge. The [feature inventory](FEATURE_STATUS.md), [requirements mapping](NEXT_RESEARCH_INTELLIGENCE.md) and [verification report](V09_VERIFICATION.md) separate implemented behavior, executed checks and remaining work.

## Start the local workstation

Node 22.16 or later remains sufficient for the standalone app; the optional Java service is not required to load research, run screens, save investigations or use local monitors. The Signals workspace refreshes saved alerts every fifteen seconds while visible, pauses its refresh when hidden, and preserves newer acknowledgement revisions over delayed responses. Monitor summaries have an explicit refresh control.

```powershell
cd apps/tradescope
node --version
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm.cmd start
```

Open `http://127.0.0.1:8000` → **RESEARCH**. Configure your local Alpaca credentials for real daily market bars and `SEC_USER_AGENT` with your declared contact address for SEC facts. Missing inputs remain unavailable; no sample values are inserted into sourced research. A static `dist/` preview cannot run these APIs or schedules.

The default local files are `.local-data/research.json` for screens/alerts, `.local-data/monitors.json` for monitor configurations and last-run summaries, and `.local-data/cases.json` for investigations. Optional `RESEARCH_STORE_PATH`, `MONITOR_STORE_PATH` and `CASE_STORE_PATH` override them. The files are private local state excluded from Git and static builds. Run one local server process against a store; these JSON files are not a multi-process database.

When updating a downloaded ZIP, stop the old server, extract the new branch into a new directory and copy both `.env` and `.local-data` into the new `apps/tradescope` before restarting. This preserves schedules as well as cases, screens and alerts. Enabled schedules resume after startup; disable a monitor first if it should stay paused. A ZIP has no `.git` metadata and cannot run Git fetch/switch commands.

## Scheduled local research

1. In **SCREENER**, choose a preset or build conditions, select supported symbols and save the screen.
2. In **LOCAL MONITORING**, choose the saved screen, set a label, target symbols and an interval, then choose **CREATE DISABLED MONITOR**.
3. Inspect its copied screen revision and criteria. Choose **ENABLE** when ready, or **RUN NOW** for an explicit one-off evaluation.
4. Inspect next-run time, last-run status, readiness counts and scheduler health. Open **SIGNALS** to acknowledge, resolve or investigate captured positive conditions.

Each monitor keeps an immutable copy of its source screen's criteria, identifier and revision. Editing or deleting the saved screen does not change that copy. Create a new monitor to adopt different criteria or target symbols. Monitor label, enabled state and interval can be revision-checked updates; a conflicting update receives HTTP 409 and requires refresh.

There are at most twenty monitors, with one to ten pilot symbols each and an integer interval from **5 to 1,440 minutes**. Only one scan runs at a time across the local scheduler; overlapping manual runs return `busy` and are not queued. After a completed or failed run, the next due time is based on completion plus the interval. An overdue enabled monitor runs once after restart, with no replay of every missed interval. Disable/delete and server shutdown abort the active run and suppress late completion state.

Schedules run inside the local Node process. The browser may close while Node continues, but stopping Node stops the schedule. This does not install a Windows service, OS task, cloud scheduler, push notification, email delivery or unattended hosted deployment. The interval is an evaluation cadence for completed daily research observations, not an intraday data frequency or a promise that new data exists every five minutes.

Last-run summaries contain evaluated, triggered, ready, unavailable/warming and alert-action counts. `completed` means evaluation finished, not that all providers or inputs were available. Unknown data cannot make a positive match, and an unavailable result does not prove low risk. Conditions use the existing source/date/readiness gates and alert deduplication/cooldown lifecycle. Repeated captured evidence is not a new alert; a genuinely new observation deferred by a resolved episode's cooldown remains eligible after the cooldown expires.

## Market Atlas

Choose **MARKET ATLAS**, select up to ten supported instruments and choose **LOAD MARKET ATLAS**. The view consumes the same sourced company research snapshots as the company page; it does not use the Monitor's synthetic replay prices.

The table exposes 1/5/20/63-session price returns, SMA20/50/200 position, RSI14 and relative daily volume with source/as-of/readiness. The underlying analysis also retains completed close and distance from the 252-session high. Current ET calendar-date bars are excluded. Seven elapsed days is the pilot freshness guard; it is not an exchange-calendar determination that a feed is live or a market session is complete.

Breadth reports positive/negative/unchanged returns and above/below/equal moving-average conditions only for eligible observations. Stale, missing and incompatible inputs have their own excluded counts and reasons; they are not counted as zero returns or unchanged prices. An aggregate requires compatible source, dates, units, adjustment and calculation context. A conflicting context returns unavailable instead of silently mixing observations.

Display-category averages are equal-weight averages of the compatible requested members, with contributor symbols and counts. The catalog's categories are informal **pilot display categories**. An average of the selected semiconductor names is not the return of the semiconductor sector, a capital-weighted index or an authoritative peer universe.

Select up to five requested instruments for a base-100 comparison over **20 or 63 completed sessions**. A curve requires 21 or 64 shared valid observations, including its base date. Curves intersect actual supplied dates, require compatible currency/feed/adjustment context and never forward-fill absent prices. Conflicting daily closes, inadequate common history or unknown context produce explicit exclusions/unavailable results. Declared split adjustment is not independently verified total return; dividends, holidays and early closes are not reconstructed.

This is the requested subset of the existing ten-symbol US-listed IEX pilot. It is not full-market breadth, sector rotation, a complete treemap/constituent service, cross-asset research or a verified exposure map.

## Optional Java/PostgreSQL snapshot storage

The Node workstation can explicitly save a calculated company snapshot to a local Java API. This is a separate dated instrument/metric persistence boundary, not migration of every workstation feature. Cases, screens, alerts and monitor schedules still use their local JSON stores, and Node does not require Java to operate.

The Java service requires **Java 21**, **Gradle 8.5** or its supplied wrapper, and a compatible PostgreSQL database. The repository's `docker-compose.yml` provides a local PostgreSQL 16 image with pgvector for the existing schema. From the repository root, start that dependency with `docker compose up -d postgres`, then start the API from `apps/api`. The Windows launcher is `gradlew.bat`; Linux requires a working Gradle installation if no Unix wrapper launcher is supplied.

Add optional settings to the workstation's local `.env`:

```dotenv
RESEARCH_JAVA_ORIGIN=http://127.0.0.1:8080
RESEARCH_API_TOKEN=your_new_private_random_token_at_least_24_characters
```

Use a newly generated private unquoted token of 24–512 characters. Set that same value as `RESEARCH_API_TOKEN` in the Java process environment; Spring does not automatically read `apps/tradescope/.env`. Do not put it into browser fields, URLs, committed files or bug reports. The bridge sends it server-to-server in `X-Research-Token`. The optional Node adapter accepts loopback HTTP origins only, without user information, paths, queries or fragments, and refuses redirects. Invalid optional configuration leaves the rest of the Node app usable.

For Windows, after setting the unquoted token in `.env`, this launches Java using the same value without printing it:

```powershell
cd apps/api
$researchTokenLine = Get-Content ../tradescope/.env | Where-Object { $_ -match '^RESEARCH_API_TOKEN=' } | Select-Object -First 1
if (!$researchTokenLine) { throw 'Set RESEARCH_API_TOKEN in apps/tradescope/.env first.' }
$env:RESEARCH_API_TOKEN = $researchTokenLine.Substring('RESEARCH_API_TOKEN='.Length).Trim()
./gradlew.bat bootRun --args="--server.address=127.0.0.1"
```

Start Node in another terminal after its `.env` is saved. In **LOCAL MONITORING**, choose **CHECK STORAGE**. When the service is configured and ready, choose a security in the Research toolbar and **SYNC SELECTED SECURITY**. This explicit action loads its current calculated research and sends a bounded snapshot; missing data is not replaced with examples. A configured but unreachable/rejected service reports unavailable and leaves local research intact.

The versioned Java endpoint and Flyway V2 tables keep these observations separate from the legacy Java fractional metrics. A write admits one allowlisted pilot instrument and one to one hundred validated metric observations, bounded to 256 KiB. Available values must have compatible numeric/boolean types, catalog units, source, method version and actual as-of dates; unavailable values remain null. Dated filing inputs and selected calculation provenance are whitelisted, not opaque raw provider responses.

The repository upserts by instrument, metric, source, as-of identity and method version, accepting the newest capture for a matching identity. A null as-of uses an internal unknown identity and remains null in the returned observation. Repeated synchronization updates a matching identity instead of creating duplicate metric rows. This is not a complete history of every correction, original filing revision, historical known-at-time state or raw data archive. The read endpoint is a bounded list of stored observations, not a complete multi-user research repository or a point-in-time backtest interface.

## HTTP boundary

All workstation routes below are same-origin under `/api/research/`. Credentials stay in server configuration.

| Method / path | Request / behavior |
|---|---|
| `POST atlas` | `{symbols, windowSessions:20\|63, comparisonSymbols}`; up to ten requested symbols and five comparison symbols from that set |
| `GET monitors` | Configurations, last-run summaries and scheduler health |
| `POST monitors` | `{screenId, symbols?, name?, intervalMinutes?, enabled?}`; copies a saved screen, disabled by default |
| `PATCH monitors/:id` | `{expectedRevision, name?, enabled?, intervalMinutes?}`; criteria/targets remain immutable |
| `DELETE monitors/:id` | `{expectedRevision}` |
| `POST monitors/:id/run` | JSON `{}`; explicit one-off run, including when the monitor is disabled; may return `busy`, `failed` or `cancelled` |
| `GET backend` | Sanitized optional storage status; no request when unconfigured |
| `POST backend/sync` | `{symbol}`; explicit current calculated snapshot save, not an automatic provider archive |

The Java service exposes `GET /api/research/v1/health`, `GET /api/research/v1/instruments`, `POST /api/research/v1/metric-snapshots` and `GET /api/research/v1/metric-snapshots?symbol=MSFT&limit=100`. All require the shared token; reads are bounded to one hundred observations and writes preserve the versioned schema. New endpoints do not add end-user accounts or protect unrelated legacy endpoints. Keep the service bound locally for this setup.

## Verification and remaining work

The integrating change records actual Node/Java/PostgreSQL/browser execution in [V09_VERIFICATION.md](V09_VERIFICATION.md). Fixture-driven market/SEC tests do not establish successful authenticated provider access; storage health and database execution are separate from provider entitlement. No real token or provider key is needed in a screenshot or verification report.

Still pending: broader instruments and authoritative classifications/constituents/peers; quote/corporate/external alert families and external notifications; full authenticated multi-user Java migration of screens, alerts, monitors and cases; macro releases with vintages/consensus; earnings guidance/estimates; ownership/Form 4/13F; options/CFTC/cross-asset feeds; verified event exposures and original revision archives; and chronologically evaluated calibrated forecasting. Scheduled evaluation and requested-pilot comparisons do not by themselves validate prediction or causation.
