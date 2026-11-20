# ResearchOS v0.32 — Global Event Collection Engine (local pilot)

**Location:** TradeScope → Global Events → Event Radar → Captured Global Feed  
**PR:** #19 draft; not merged or commercially deployed  
**Implementation:** lib/global-event-collector.mjs; Global Events portal; server.mjs.

## Delivered

Three bounded read-only public-source adapters, each using a fixed HTTPS URL and no client-provided upstream path:

| Provider | Official feed | Coverage |
| --- | --- | --- |
| USGS | https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson | M4.5+ past-day earthquake summary; not all hazards or all historic earthquakes |
| NASA EONET v3 | https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100 | Up to 100 currently open curated natural events; no guaranteed closure history |
| FAA NAS Status | https://nasstatus.faa.gov/api/airport-events | Airport ground-stop, delay and closure snapshots; **not** nationwide order archive |

The adapters produce canonical \`source:id\` identifiers, event families, classes, original links, source event/update times where available, bounded coordinates, and caveats. They do not infer issuer exposure or financial impact.

Local data lives in **ignored, private** \`.local-data/global-events.json\` by default. Writes use single-process serialization, temporary-file write/atomic rename and bounded event/revision counts (600 events, 3,000 revisions, 12 MB maximum by default). If the capacity is reached, the collector **stops retaining new observations** rather than evicting source evidence. A source that fails during a collection cycle is rolled back as a unit while other providers can succeed.

Every event stores:
- **firstObservedAt:** timestamp when this process first captured that normalized event;
- **lastObservedAt:** last successful local observation in a source snapshot;
- **revisions[]:** a SHA-256 content digest and local capture time each time normalized content changes;
- **eventTime / providerUpdatedAt:** provider-supplied timestamps, which never backdate local first-seen knowledge.

Deduplication occurs *within each source ID*. NASA events and USGS earthquakes are not automatically merged just because they resemble the same disaster. The system does **not** assert source-upstream first publication time, completeness, facility damage, market reaction, predictions or validated precursor alerts. An event missing from a subsequent current-feed response is **not** automatically deleted or marked resolved.

The as-of view chooses the last locally captured revision at or before the requested UTC instant. This supports *future real archival replay from the time local collection starts*. It cannot reconstruct what ResearchOS would have known before the collector was first enabled.

## Local startup

In \`apps/tradescope/.env\`, after reviewing provider terms:

    HOST=127.0.0.1
    PORT=8000
    GLOBAL_EVENT_COLLECTION_ENABLED=true

To enable periodic collection while the server runs, explicitly add:

    GLOBAL_EVENT_AUTO_POLL_ENABLED=true
    GLOBAL_EVENT_POLL_SECONDS=300

Auto polling is off by default. Poll intervals have enforced minimum 60 seconds and maximum 3,600 seconds. The daemon runs only inside this local Node process; there is no cloud schedule, guaranteed delivery or background task when the app is stopped. Failed sources are labeled failed and preserve their earlier evidence. Keep collection disabled if source license terms or request-rate rules don't allow it.

Optional local data path override:

    GLOBAL_EVENT_STORE_PATH=C:/Users/you/ResearchOS-data/global-events.json

Keep this path outside public Git repositories and static deployments.

Run:

    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open \`http://127.0.0.1:8000/event-portal.html#global-feed\`. The page loads **stored** source observations and provider health without fetching external data from the browser. To request actual fixed upstream feeds, click **Collect permitted sources now**. Failed provider calls never become synthetic healthy snapshots.

## Local-only APIs

- \`GET /api/global-events/status\` — collector enabled state, source coverage/health, event and revision counts;
- \`GET /api/global-events/events?source=USGS&family=climate&asOf=2026-11-14T12%3A00%3A00Z&limit=100\` — locally known events at the capture cutoff;
- \`GET /api/global-events/detail?id=USGS%3Aus7001\` — verified local revision history for an ID;
- \`POST /api/global-events/refresh\` — an empty JSON object plus \`X-ResearchOS-Event-Refresh: 1\`, only on a loopback-hosted server with same-origin request checks and \`GLOBAL_EVENT_COLLECTION_ENABLED=true\`.

The same source data are **not** injected into the retrospective Nov 13 FAA national-ground-stop case, because they do not certify a signed nationwide notice or an original historical first-seen timestamp.

## Testing and acceptance gaps

Mocked tests cover fixed-host provider requests, normalization and input bounds; initial/revised content, deduplication and cross-restart persistence; failure isolation and storage limits; as-of cutoffs, tamper rejection and API control restrictions. Existing v0.28 Event Intelligence and market capture tests remain mandatory.

**Still required:** run a live-provider acceptance session; verify FAA response schema actually served from the upstream today; review each source's data use/retention rules; longer running backoff, stale-source alert policy, rate limits across restarts, process-external locking, geographically attributed company/facility crosswalk, feeds for other six event families, source-published firstSeen evidence and independent prediction/false-positive validation. No claim of production hardening or historical predictive accuracy.

**Next proposed release:** v0.33 Precursor Radar built on this locally captured timeline, using negative controls and independently evaluated warning lead times rather than retroactive hindsight.
