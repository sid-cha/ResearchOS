# v0.9 Monitoring, Market Atlas and Java snapshot storage — verification

Executed November 12, 2026 (America/New_York), on `feature/tradescope-monitoring-atlas`, based on v0.8 commit `95c6b793707f13583eed98e4b70d74e92467acc5`. See [setup and methods](MONITORING_ATLAS_STORAGE.md), [feature inventory](FEATURE_STATUS.md) and [remaining requirements](NEXT_RESEARCH_INTELLIGENCE.md).

## Executed checks

| Check | Result |
|---|---|
| Complete Node suite, Node 24.22.1 | 258 passed; zero failures or skips |
| Complete Node suite, minimum supported Node 22.16.0 | 258 passed; zero failures or skips |
| Java 21.0.13 / Gradle 8.5 tests with temporary PostgreSQL 16 and pgvector | 9 passed; zero failures or skips |
| New Chromium scenario groups | 7 passed; no page JavaScript errors |
| Existing v0.7 and v0.8 Chromium scenario groups | 29 passed; no page JavaScript errors |
| Static build | Exactly 16 allowlisted browser assets; backend code and local stores excluded |
| Syntax and whitespace | Passed |

Execution used Linux. Windows setup commands are documented, but no Windows shell or operating-system service was executed. Node has no new runtime dependencies. Java database tests are explicitly enabled against a test database; a normal build without its test database settings does not establish database integration success.

## Monitoring and Atlas

Fake-clock engine tests cover cadence, overdue restart coalescing, serialization across monitors, duplicate-run rejection, config revisions, immutable criteria, disable/delete/close cancellation, failed writes and bounded retry. HTTP tests connect the monitor callback to actual research calculations and alert persistence, including suppression and a disabled pending scan that cannot write late alerts.

A browser scenario creates a saved screen, copies it into a disabled five-minute monitor, explicitly enables it and advances the controlled test clock. The real scheduler then loads provider-shaped research fixtures, evaluates the rule and creates a saved alert visible in Signals. Run-now deduplication, reload persistence, disabling and deletion are exercised. This uses a controlled clock rather than waiting five wall-clock minutes.

Signals refreshes saved alerts every fifteen seconds while visible and pauses while hidden. A regression test ensures a delayed refresh cannot revert a newer acknowledgement. The alert-store regression also confirms that a distinct observation deferred by cooldown remains eligible after cooldown; already captured observations stay deduplicated.

Atlas tests cover per-symbol source/readiness, eligible breadth, category contributors, dated/method/adjustment compatibility and common-session 20/63-session curves. Stale, missing, invalid and conflicting inputs remain unavailable. No dates are forward-filled. Browser checks cover ten sourced rows, changing windows, partial/missing history, both themes and an 800px layout without horizontal page overflow.

## Actual Java/PostgreSQL verification

A temporary loopback PostgreSQL 16/pgvector instance applied Flyway V1 and V2. The Java application booted with Hibernate schema validation. Tests cover typed contract validation, authentication, request-size limits, source-aware upsert/readback, older-capture protection, transaction rollback and the legacy screener's repeated/historical-metric handling.

The browser's explicit snapshot action traversed the real path **browser → Node API → authenticated Java HTTP service → PostgreSQL**. All **65 MSFT research observations** were stored and read back. Fiscal period provenance and unavailable/unsupported null values were preserved. Repeating synchronization retained 65 rows rather than creating duplicates. The shared token was supplied only server-to-server and was absent from page content. The Node suite separately checks that Java metric IDs/units match the workstation catalog.

Market and SEC inputs in that test were controlled fixtures, not authenticated market-provider responses. The Java HTTP service and PostgreSQL persistence were actual running components. Temporary browser servers, Java and PostgreSQL were stopped afterward and the private test connection file removed. Test services and credentials are not deployment infrastructure or committed application state.

## Scope and provider limits

No Alpaca credentials are configured in this environment. Authenticated streaming, historical market-data entitlement, current SEC/USGS availability and live numerical reconciliation were not newly verified. The previous provider limits remain documented in [v0.8 verification](V08_VERIFICATION.md).

Monitoring is opt-in and runs only while the local Node process runs. It evaluates completed-session research metrics; it does not add tick-price surveillance families, external notifications or an operating-system scheduler. Atlas covers the requested subset of ten pilot symbols and informal display categories, with equal-weight compatible observations; it is not full-market or authoritative sector breadth.

The optional Java integration persists instruments and dated metric observations. Screens, alerts, monitor schedules and investigations still use local JSON. It does not add multi-user accounts, migrate every workflow or create a complete point-in-time revision archive. Macro/earnings/ownership/options datasets, wider instruments and peer classifications, verified event exposures and calibrated forecasts remain pending.

## Local acceptance

Preserve `.env` and `.local-data` when updating a ZIP installation. Start Node, then use **RESEARCH → MARKET ATLAS** and **LOCAL MONITORING**. Save a screen before creating a monitor; enabling its schedule is explicit. Configure the optional loopback Java service only when database persistence is needed, then use **CHECK STORAGE** and **SYNC SELECTED SECURITY**. See the [setup guide](MONITORING_ATLAS_STORAGE.md) for the shared-token environment and database test procedure.
