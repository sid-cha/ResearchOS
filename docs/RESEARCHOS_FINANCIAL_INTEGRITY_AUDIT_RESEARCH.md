# Financial Integrity & Audit Intelligence — research and implementation assessment

Date: 2026-11-12. Status: **research backlog / NOT a completed audit or compliance certification feature**.
Purpose: establish a defensible company disclosure-monitoring and accounting-quality research module, separate from licensed external assurance or professional audit work.

## Verified ResearchOS baseline

In the TradeScope prototype, `apps/tradescope/lib/corporate-intelligence.mjs` classifies cited SEC Form 8-K Item 4.01 auditor changes, Item 4.02 non-reliance and Item 3.01 listing notices. The SEC filing reader extracts cited primary-file passages; the event archive preserves revisions and local first-observed time. `apps/tradescope/lib/tax-disclosures.mjs` extracts limited public annual SEC XBRL income-tax metrics.

**Not built:** extraction of PCAOB audit reports/partners/inspections, Form 10-K audit opinions or critical audit matters, Item 9A internal-control material-weakness changes, 10-K/A restatement reconciliation, confirmed enforcement mapping to specific firms, validated accounting-fraud statistical tests, regulatory obligation engines, audit workpaper/evidence testing or a professional audit opinion.

## Research-derived feature priorities

| ID | Research deliverable | Grounded signal and implementation guard |
|---|---|---|
| FIRA-01 | Auditor changes and non-reliance | Extend cited 8-K Item 4.01/4.02 extraction to circumstances, disagreement/related exhibit and subsequent amendments; deduplicate one underlying disclosure. No implication of fraud from resignation alone |
| FIRA-02 | 10-K / 10-Q controls | Recognize Item 9A, Item 4 of 10-Q, explicitly reported material weaknesses, remediation timelines, and effective/ineffective management and auditor control opinions; distinguish no passage from no weakness |
| FIRA-03 | Audit opinions and critical audit matters | Extract auditor name, report date, opinion type, company fiscal year and CAM title/context only when source passage supports each field; exemptions/applicability matter |
| FIRA-04 | PCAOB auditor provenance | Associate official Form AP audit firm and engagement partner through issuer CIK and audit-year data; add separate firm-level inspection flags only with verified source and scope. Inspection finding about a firm does not establish misconduct by each client |
| FIRA-05 | Accounting amendments/reconciliation | Align entity, fiscal reporting period, unit, US-GAAP taxonomy, accession and source availability; compare amended vs originally filed financial values and label changed/unchanged/missing without claiming cause |
| FIRA-06 | SEC enforcement linkage | Index official SEC AAER and other enforcement entries. Resolve correct issuer/legal entity and disposition; distinguish investigation/allegation/settlement/final order |
| FIRA-07 | Accounting-quality indicators | Explore accruals, cash-vs-earnings, revenue-recognition signals and peer comparisons with strict period/unit and industry constraints. Beneish M-score and Dechow F-score may be hypothesis-ranking candidates; no purported 'fraud probability' without temporal training and calibration |
| FIRA-08 | Analyst review and audit trail | Expose source excerpts, filing accession, first observed time, severity, status (unreviewed, reviewed, confirmed disclosure, false positive, remediated), role and revisions. An analyst acknowledgment must not mutate source evidence |
| FIRA-09 | Obligation-aware compliance | Later, jurisdiction-specific rules, issuer applicability, exemptions, rule effective dates, filing deadlines and official evidence. Do not display a pass/fail compliance verdict without complete obligations, date-effective reference text and validation |

## Academic / official support and caveats

1. SEC Form 8-K disclosure interpretations specify Items 4.01 and 4.02 and the required filing form; these are useful documented triggers, **not** violations: https://www.sec.gov/answers/form8k.htm
2. SEC investor bulletin details auditor-change reportable circumstances and financial-statement non-reliance: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/how-read-8
3. PCAOB AS 2201 defines internal-control material weaknesses, integrated audit evidence and audit reporting. Effective date matters (some amendments effective 2026-12-15): https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201
4. PCAOB AS 3101 defines financial statement auditor reporting and CAMs; not all issuers/audits are subject to CAM requirements: https://pcaobus.org/oversight/standards/auditing-standards/details/AS3101
5. PCAOB AuditorSearch/Form AP public engagement partner/audit firm data: https://pcaobus.org/resources/auditorsearch
6. PCAOB public firm inspection findings and downloadable data: https://pcaobus.org/oversight/inspections/firm-inspection-reports
7. SEC AAER releases provide links to official actions but the index is not a complete list: https://www.sec.gov/enforcement-litigation/accounting-auditing-enforcement-releases
8. SEC EDGAR APIs: company submissions and standardized SEC XBRL financial statement facts; custom taxonomies, periods and units require verification: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
9. Beneish (1999), *The Detection of Earnings Manipulation*, Financial Analysts Journal. An accounting-based screening model, not a confirmation of manipulation: https://rpc.cfainstitute.org/research/financial-analysts-journal/1999/the-detection-of-earnings-manipulation
10. Dechow, Ge, Larson & Sloan (2011), *Predicting Material Accounting Misstatements*, Contemporary Accounting Research. Predictive classification research requiring point-in-time ground truth and careful out-of-time testing: https://onlinelibrary.wiley.com/doi/10.1111/j.1911-3846.2010.01041.x
11. Hedback (2025), *Identifying Going Concern Audit Opinions Using Supervised Machine Learning*. Literature supporting a bounded document-classification task, not automated audit assurance: https://onlinelibrary.wiley.com/doi/full/10.1002/isaf.70020

## Architecture recommendation

Build this as **Research → Financial Integrity**, with data models:
- `RegulatoryDisclosure`: issuer, source, form, accession, item, reported event, publication/acceptance date, system observed date, cited passage and parser version.
- `AuditObservation`: opinion/control/CAM/auditor item, effective fiscal period, disclosure type, source metadata, confidence *in extraction* (not misconduct) and evidence IDs.
- `IntegrityIndicator`: defined formula, date-eligible inputs, peer scheme, completeness, backtest/model version, score type and interpretation bounds.
- `ReviewFinding`: analyst status, reviewer identity, case and immutable evidence/revision ID, actions and authorized workspace.

Use an explicit distinction among:
1. **Official disclosed matter** (e.g. confirmed 8-K Item 4.02),
2. **Accounting anomaly** (numerical screening),
3. **Analyst hypothesis** (requires review),
4. **Regulatory action** (official authority, disposition), and
5. **Audit/compliance opinion** (professional assurance only, outside this automated tool).

Do not combine these into one uncalibrated opaque `fraud risk %`.

## Commercial decision

The strongest near-term use case is investor due diligence / research workflow for professionals reviewing many public companies. The differentiated offering is **source-backed change detection, issuer-level accounting-quality timelines, revision tracking and investigation handoff**. Prospective buyers may include investment analysts, credit researchers, fund risk teams, and diligence operations.

Enterprise audit or SOX/GRC software is a materially different business: buyer needs evidence collection from internal systems, controls testing, audit sign-off, segregation of duties, SOC 2/security, retention, user permissions and regulated review workflows. Avoid positioning a public EDGAR document classifier as an enterprise audit-certification platform.

## Acceptance tests and quality gates

- Historical backtests exclude reports/publications first available after each decision cutoff; companyfact amendments are versioned.
- Missing input ≠ compliant; absent control weakness ≠ effective controls; CAM ≠ qualified audit opinion.
- Real audited 10-K / 10-Q excerpts tested across financial services, technology, industrial and foreign private issuer forms; report unsupported forms honestly.
- Unit/period/CIK matching, duplicate filings, risk flag precision, reviewer agreement and document extraction precision/recall measured on annotated fixtures.
- Legal/regulatory rules carry explicit applicability, effective date and exception/exemption version.
- Separate compliance flags from economic event signals; preserve explainability and no unsupported causation.
- Before external distribution: provider licensing, professional positioning/legal review, source caching/redistribution and cybersecurity assessment.

## Planned order

**Next after existing v0.12 UI and hazard acceptance:** FIRA-01 (8-K audit narrative detail) + FIRA-02 (Item 9A controls) + FIRA-03 (audit opinions/CAMs), then FIRA-04 through FIRA-06 external source integration, then validated accounting-quality analytics with a properly labeled research UI.

No claims of completed audit testing or regulatory certification until the corresponding source and review gates pass.
