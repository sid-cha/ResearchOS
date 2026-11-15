# ResearchOS / TradeScope v0.34 — Research Agent Desk & Independent Anti-Agent

**Branch:** feature/tradescope-v018-unified-development · **PR:** #19 draft/unmerged
**Surface:** http://127.0.0.1:8000/agent-desk.html
**Navigation:** Level 1 Research Agents → Level 2 Agent Workbench / Research Review → Level 3 Research Agent Desk / Independent Anti-Agent / Saved Research Runs.

## Scope implemented

Six bounded **research roles** execute on one selected, already-captured official source event. No open-ended autonomous web browsing, trading tools, job queues or external services are implied.

| Stage | Responsibility | Evidence rule |
| --- | --- | --- |
| Evidence Scout | Capture bounded original-source references | Data only from existing local v0.32 Global Event Collection archive |
| Timeline Auditor | Separate event time, source-updated and local first-seen clocks | Never assert original historical first public availability |
| Transmission Analyst | Propose a testable economic mechanism | Mark mechanism as hypothesis; no verified ticker loss or company location |
| Independent Anti-Agent | Try to falsify with alternate explanations and base rates | Receives the original evidence set; never sees analyst model output |
| Source Verifier | Audit canonical official-host links, supporting sources and missing corroboration | A URL link does not prove its economic interpretation |
| Research Arbiter | Record unresolved challenges and human review gate | Causality, exposure, trade idea and predictive probability remain unverified |

The end result is always HUMAN_REVIEW_REQUIRED. Deterministic execution works without any LLM, network inference, or new keys.

A selectable optional local model can suggest separate **unverified** analyst and challenger hypotheses. The server accepts exactly two formats:

- Ollama: http://127.0.0.1:11434/api/chat (nonstreaming).
- LM Studio: http://127.0.0.1:1234/v1/chat/completions (OpenAI-compatible, nonstreaming).

You must explicitly enable a *local* provider in the ignored private apps/tradescope/.env. Default is off:

    HOST=127.0.0.1
    RESEARCH_LOCAL_LLM_ENABLED=true
    RESEARCH_LOCAL_LLM_PROVIDER=ollama
    RESEARCH_LOCAL_LLM_ORIGIN=http://127.0.0.1:11434
    RESEARCH_LOCAL_LLM_MODEL=your_installed_model_id

For LM Studio change the provider to lmstudio, origin to http://127.0.0.1:1234, and use the local model ID loaded in LM Studio.

Only loopback HTTP origins with no credentials, path, query or URL fragment are accepted. Provider endpoints are fixed in code, not chosen by a user or model. No tool calling, streaming, access to broker keys, external citation search or arbitrary URL fetch is permitted. Each model reply is capped, timed out, and marked MODEL_PROPOSAL_UNVERIFIED; neither role receives the other's answer. A failed local model produces a source-first deterministic report, with an explicit model warning.

**The older Evidence Assistant (apps/tradescope/lib/assistant.mjs) still uses its optional OpenAI API mechanism. This release does not secretly redirect that legacy feature to the local model. The new dedicated Research Agent Desk provides the separate local integration.**

## Run records and API

- Private journal: apps/tradescope/.local-data/agent-desk-runs.json unless RESEARCH_AGENT_STORE_PATH names an absolute private local file.
- Each run stores a generated UUID, UTC as-of cutoff and created time, the selected event and up to eight same-provider captured references, all six deterministic stages, optional bounded model proposals, an integrity SHA-256 digest, and human-review disposition.
- No unknown provider links are rendered as official; official source hosts are strictly fixed: earthquake.usgs.gov, eonet.gsfc.nasa.gov, nasstatus.faa.gov.
- Limits: 60 runs, 8 MB local store. Atomic temporary-file rename, single process; no reindex, cross-process lock, independent notarization, backup or multi-user authentication. Records that fail digest validation are rejected.
- Historical as-of runs must select an event actually captured by that cutoff; provider publication dates never override this local knowledge boundary.
- The entire archive response is capped at 200 locally captured events; if larger, the run fails rather than silently omit potentially eligible evidence.
- No automatic periodic agent runs; models are invoked only by explicit local runs.

Local API:
GET /api/agent-desk/catalog — capabilities and six roles, never keys.
GET /api/agent-desk/runs — saved run metadata.
GET /api/agent-desk/run?id=desk-UUID — verified saved run.
POST /api/agent-desk/run — JSON body with eventId, optional asOf and deterministic|local mode; requires X-ResearchOS-Agent-Run: 1, local loopback server and same-origin checks.

Example JSON for POST:

    {"eventId":"USGS:some_source_event","mode":"deterministic"}

The ID must already appear in the local Global Event Collection archive. No direct URL, credentials, arbitrary text prompt, trading command or external source upload is accepted.

## Local execution and acceptance

1. Confirm you can use the existing Global Events captured feed and the source provider’s permitted retention.
2. Open the app on loopback; collect an event under Global Events → Event Radar → Captured Global Feed.
3. Navigate Research Agents → Agent Workbench → Research Agent Desk.
4. Run deterministic investigation, inspect the six roles, evidence references, independent Anti-Agent contradictions and the HUMAN_REVIEW_REQUIRED arbiter status. Reload the saved run to verify persisted source snapshots.
5. If an actual local model server is already running, configure the optional flags, restart Node, select Local model mode and inspect separate unverified analyst and challenger proposals.
6. Attempt remote-origin model URL or cross-site POST: fail closed. Confirm no provider secrets or raw model request text are included in public static assets.

Commands from apps/tradescope:

    npm test
    npm run build:static
    npm start

Draft PR #19 is not merged or deployed. CI runs no live local LLM; actual Ollama/LM Studio inference and Windows UI visual acceptance require separate local tests.

## Critical research and compliance boundaries

The engine is intentionally not a predictive financial agent:
- Event classification and event times may be incomplete, revised or incorrectly linked to unrelated economic changes.
- A hypothesis, model-generated sentence, source URL or a disagreement is NOT fact verification.
- No independent hedge-fund analyst data, insured-loss records, issuer asset exposure crosswalk, materiality threshold or stock-return counterfactual is currently certified.
- An unsourced model statement must never be promoted into a cited fact, even if its wording resembles a primary source.
- Real-world trading execution and broker authority remain unavailable.
- No LLM model-prompt history and no arbitrary remote host can be accessed through the new server route.
- Proof of anti-agent independence is structural within the code and mocked tests; independent-model weights and statistically demonstrated falsification quality have not been evaluated.
- A hash stored alongside a mutable JSON record is tamper-evident only against accidental edits, not a signed external audit trail.

**Next build candidates:** prospectively labeled validation cases; stronger independent source matching, historical timestamp notarization and company facility-exposure proofs; provider entitlement/retention checks; multi-source research dossier ranking and local UI browser E2E tests.
