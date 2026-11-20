# ResearchOS v0.39 — P0 Sprint 5 Official Entity Identifier Graph

Repository: sid-cha/ResearchOS · Branch: feature/tradescope-v018-unified-development · PR #19 remains draft.

Workspace: http://127.0.0.1:8000/entity-graph.html
Navigation: Company Research → Facility Intelligence → Official Entity Graph / Source Contract Diagnostics.

## Evidence contract

The v0.39 local pilot reconciles three **distinct** classes of reported identifiers: EPA FRS Registry ID (physical facility metadata), SEC CIK (issuer/reporting filer), and GLEIF LEI (legal entity metadata). It stores only a source-reported GLEIF direct **accounting consolidation** relationship, not a proven beneficial owner or subsidiary contract. A CIK-to-LEI match is an explicit analyst research candidate, never created automatically from similar names. An existing v0.37 filer-to-site edge is likewise unverified. Every graph edge retains source and local capture time; no legal ownership, incident damage, revenue exposure or market effect is inferred.

## Official source contracts

Requested only from explicit operator action, using fixed HTTPS URLs with strict validated IDs:

    https://api.gleif.org/api/v1/lei-records/{20-character-LEI}
    https://api.gleif.org/api/v1/lei-records/{LEI}/direct-parent
    https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities?registry_id={12-digit-FRS}&output=JSON
    https://data.sec.gov/submissions/CIK{10-digit-CIK}.json

GLEIF responses must have an exact matching LEI and reported legal name. An optional direct-parent response must contain a distinct LEI. A 404 means no direct-parent record was returned, not proof the entity has no ultimate shareholder. HTTP data are read with redirects disabled, streaming response/timeout bounds, content-type checks and SHA-256 response hashes. EPA/SEC adapter contract diagnostics reuse the v0.37 connectors; checks do not persist data or certify license/redistribution/retention terms. Mock tests do not constitute live provider acceptance.

Official references:
- EPA FRS: https://www.epa.gov/frs/frs-api
- SEC EDGAR: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- GLEIF API: https://www.gleif.org/en/lei-data/gleif-api
- GLEIF parent reports: https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-who-owns-whom

## Private journal, time discipline and API

Local default: apps/tradescope/.local-data/entity-graph.json. Optional ignored local .env override:

    HOST=127.0.0.1
    ENTITY_GRAPH_STORE_PATH=C:/Users/you/ResearchOS-data/entity-graph.json

Each saved LEI, direct-parent or candidate CIK↔LEI observation has a capture timestamp, sequenced hash-linked record and provider body digest. Atomic temporary-file rename and bounded private storage (default 240 records, 5 MB) are available; a broken hash chain fails closed on restart. This is neither independent timestamp notarization nor WORM storage.

Read-only:
- GET /api/entity-graph/catalog
- GET /api/entity-graph/view?asOf=2026-11-15T18:00:00Z

Explicit loopback/same-origin POST, JSON and X-ResearchOS-Entity-Graph: 1:
- /api/entity-graph/lei — a LEI
- /api/entity-graph/parent — a previously captured child LEI
- /api/entity-graph/check — source = EPA_FRS, SEC_EDGAR or GLEIF_LEI with ID
- /api/entity-graph/link — saved LEI and SEC CIK with the exact GLEIF source URL and a 30–480 character research rationale

No generic external URL, secret, network model tool or broker action is exposed. Private graph read/write endpoints fail closed when the Node server is not bound to loopback. Source capture after a historical as-of timestamp cannot leak into the earlier graph, regardless of the date printed in the original document.

## Windows acceptance

    git fetch origin
    git switch feature/tradescope-v018-unified-development
    git pull --ff-only
    cd apps/tradescope
    npm test
    npm run build:static
    npm start

Open /entity-graph.html. Check a real EPA FRS ID, SEC CIK and GLEIF LEI through explicit source contract requests, recording actual upstream outcomes and rate/usage terms. Capture a real LEI, and if returned its direct accounting-consolidation parent. Register a CIK↔LEI candidate only after its SEC filer identity exists. Inspect the as-of graph before and after capture and ensure no ownership edge becomes proven by identifier proximity.

## P0 Sprint 5 acceptance blockers

- Live official EPA, SEC and GLEIF response and API permissions still need to be verified; mocked CI tests do not establish reachability or correctness of actual provider responses.
- Independently supported CIK↔LEI mapping, legal owner/operator and facility-specific documentary evidence remain outstanding.
- True legal subsidiary/ownership effective dates are not supplied by the GLEIF direct-parent identity endpoint.
- Source original publication clocks, historical revisions, rate/retention/redistribution rights, and secure hosted deployment remain separate research/release gates.
- Hazard footprint, financial materiality, actual false alarms and real-browser E2E remain incomplete.

Do not rank issuers, claim causal return impacts, or mark real P0 completion without those facts.
