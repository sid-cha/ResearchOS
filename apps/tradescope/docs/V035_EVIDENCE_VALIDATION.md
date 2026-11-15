# ResearchOS / TradeScope v0.35 — Evidence Validation and Prospective Review

Branch: feature/tradescope-v018-unified-development. PR #19 draft/unmerged.
UI: http://127.0.0.1:8000/agent-validation.html
Navigation: Research Agents → Research Review → Evidence Validation / Prospective Review.
Scope: Single-user local research-validation pilot; no authenticated independent reviewers, verified impact labels, predictive calibration, or broker authority.

## 1. Claim-level metadata traceability audit

lib/research-validation.mjs audits the immutable v0.34 Agent Desk run without rewriting its evidence snapshot. Each stage assertion/hypothesis receives a deterministic claim ID and metadata traceability score (0–100) from rule EVIDENCE-AUDIT-0.35.1.

| Dimension | Points | Meaning |
| --- | ---: | --- |
| All cited EV-* reference IDs exist in saved run | 40 | Reference ID traceable, not proof of causal claim |
| Cited archived links on the original source's approved official host | 25 | Host metadata, not independently verified page contents |
| All cited events captured locally by run as-of time | 20 | Reduces local lookahead |
| Two or more upstream provider IDs among cited evidence | 15 | Provider count, not proof of independence |

An analyst hypothesis can score high while remaining UNVERIFIED_HYPOTHESIS. Accuracy, probability, and causality remain unverified or null. Uncited model claims score zero. v0.34 runs only include same-provider evidence by default, so independent-provider credit generally cannot be achieved.

## 2. Contradiction reviews

The audit pairs Transmission Analyst hypotheses with Anti-Agent counter-hypotheses. Pairing is not proof of semantic contradiction.

Human reviewers submit a capped rationale and archived EV-* evidence references. Accepted assessments: SUPPORTS_ANALYST, SUPPORTS_CHALLENGER, BOTH_PLAUSIBLE, INSUFFICIENT_EVIDENCE.

Two distinct reviewer aliases are required to expose an aggregate decision. Before that, only AWAITING_SECOND_REVIEW is returned; the first choice is concealed. Matching alias assessments become TWO_ALIASES_AGREE_UNVERIFIED and disagreements become DISPUTED.

Reviewer aliases are NOT authenticated identities, and the application cannot prove reviewers were independent of one another. Any agreement is manually attested, not verified research truth. The original Agent Desk arbiter remains HUMAN_REVIEW_REQUIRED.

## 3. Prospective outcome preregistration

A saved run can be associated with one immutable prospective protocol:
- measurable question: 18–240 characters
- operational criterion: 30–420 characters including a positive and negative boundary
- horizon: 1, 7, 30, or 90 days
- operator-declared CANDIDATE or CONTROL cohort, NOT a model-generated prediction

The window begins at registration, not the event or historical research timestamp. The original criterion and horizon cannot be revised after registration. Labels are blocked until the window ends.

After expiry, at most two distinct reviewer aliases may submit OBSERVED, NOT_OBSERVED or INCONCLUSIVE, a rationale, a public HTTPS link and an evidence-publication timestamp. The link is format-screened but NEVER fetched or independently verified by this service. Both labels are separate review attestations. Before two reviews, neither reviewer decision is exposed in the aggregate API response.

The report includes descriptive candidate/control counts only for agreed dual-alias labels. Precision, recall, calibrated probability, prediction accuracy, and verified false-positive rate are always null. A dual-alias agreement does not create independent outcome ground truth, a valid negative sampling frame or statistically meaningful forecast calibration.

## 4. Private local journal

Default path: apps/tradescope/.local-data/agent-validation-journal.json.
Optional path in ignored apps/tradescope/.env:

    HOST=127.0.0.1
    RESEARCH_VALIDATION_STORE_PATH=C:/Users/you/ResearchOS-data/agent-validation-journal.json

Independent journal events are REGISTER, REVIEW_PAIR and LABEL_OUTCOME, each tied to the immutable run integrity fingerprint, a previous-record hash and a SHA-256 payload hash. Serial single-process writes use a private temporary file and atomic rename. Default bounds: 500 records and 4MB. Malformed or tampered records fail closed. No signatures, WORM semantics, multi-user auth, trusted third-party timestamping, or malicious-admin protection.

Local REST:
- GET /api/agent-validation/catalog
- GET /api/agent-validation/run?id=desk-UUID
- GET /api/agent-validation/report
- POST /api/agent-validation/register
- POST /api/agent-validation/review-pair
- POST /api/agent-validation/label-outcome

POST requires loopback server, same-origin checks, JSON, X-ResearchOS-Validation: 1 and strict size/field limits. No arbitrary source fetch, claim submission, original-run mutation, protocol rewrite or trading tools.

## 5. How to test

From apps/tradescope:

    npm test
    npm run build:static
    npm start

Open /agent-desk.html and create a deterministic run for an already captured official-source event. Open /agent-validation.html, choose that saved run, review each citation traceability score, inspect Analyst/Anti-Agent comparisons, submit the first reviewer assessment and confirm no label is exposed. A second distinct alias produces agreement/disagreement aggregation.

Register an operationalized outcome and confirm no labeling is allowed before the horizon ends. Use the 1-day development horizon and only later provide dated public evidence from outside ResearchOS. The second outcome reviewer can agree or dispute; both remain human attestations. Test mobile and keyboard navigation locally.

## 6. Remaining validation gates

- Identity-backed independent adjudicators, no unauthenticated reviewer aliases.
- Certified source ingestion and snapshot archives for outcome references.
- Prospectively labeled negative controls and real denominator; no measured prediction metrics yet.
- Signed audit journal / trusted time / process-external locks.
- Provider data licensing, live acceptance, production authentication, browser E2E, hosted deployment readiness.
- Agent model evaluation for accuracy, challenge independence and out-of-sample outcomes.

Next sensible feature: authenticated outcome review, independent archived source snapshots, dataset exports for preregistered prospective evaluation; then validated false-positive rate after true controls are observed.
