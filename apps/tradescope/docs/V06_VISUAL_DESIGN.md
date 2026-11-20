# TradeScope AI v0.6 — Visual design and evidence assistant

**Purpose:** A professional, dense, legible equities-research and transaction-investigation workstation, not a stylized consumer finance landing page.

## Research basis and practical implications

1. William S. Cleveland & Robert McGill, *Graphical Perception*, JASA 79 (1984), DOI: 10.1080/01621459.1984.10478080. Position on common axes is preferable to relying on area or color shade when users need quantitative comparison. **In TradeScope:** keep aligned price charts, right-aligned numeric tables, fixed tabular numerals, explicit percentage changes and magnitudes; do not rely on a heatmap alone.
2. Tamara Munzner, *Visualization Analysis and Design* (CRC Press, 2015), https://www.routledge.com/Visualization-Analysis-and-Design/Munzner/p/book/9781466508910. Prioritize the analyst's task, linked views and details on demand. **In TradeScope:** Monitor, Event Intelligence and Investigations are distinct, task-scoped workspaces; selected evidence is progressively disclosed.
3. Edward R. Tufte, *The Visual Display of Quantitative Information* (2nd ed., 2001), https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/. Favor data density over chartjunk. **In TradeScope:** subdued chrome, restrained borders and limited accent usage, mini-charts only for trend context.
4. Bang Wong, *Color blindness*, Nature Methods 8, 441 (2011), DOI: 10.1038/nmeth.1618; and *Avoiding color* 8, 525 (2011), DOI: 10.1038/nmeth.1642. **In TradeScope:** risk statuses have text labels and numeric scores; positive and negative moves use both sign and hue. Source provenance is textual.
5. W3C, *WCAG 2.2*, https://www.w3.org/TR/WCAG22/: regular text targets 4.5:1; large text and important boundaries 3:1; never use color alone. **In TradeScope:** strong text-on-surface ratios, visible focus rings, semantic status labels and reduced-motion support.
6. A publicly described trading interface redesign for Bank of America shows that some desk users prefer lighter screens in daytime while others select dark mode. This is a field design anecdote, not controlled perceptual research: https://www.lametriataylor.com/?work=bank-of-america. **In TradeScope:** support persistent light/dark preferences rather than declaring a universal winner.

## Colors (tokenized, not arbitrary brand gradients)

| Token / purpose | Dark | Light |
|---|---|---|
| Canvas | `#0b1118` | `#f2f5f8` |
| Panel | `#131f2a` | `#ffffff` |
| Primary text | `#e9f1f7` | `#162937` |
| Secondary text | `#a8bccb` | `#40596a` |
| Tertiary text | `#92a8b8` | `#50697b` |
| Active control/focus | `#7bd8e9` | `#08789d` |
| Positive | `#61ddc3` | `#08775c` |
| Negative/high risk | `#ff8e92` | `#b33342` |
| Needs review | `#ffd07c` | `#91530d` |

Measured representative WCAG contrast ratios:
- Dark primary on canvas: **16.60:1**; secondary on panel: **8.53:1**; tertiary on elevated panel: **6.16:1**.
- Light primary on panel: **14.93:1**; secondary on panel: **7.36:1**; tertiary on near-white: **5.39:1**.
- Amber on caution background: dark **8.93:1**, light **5.42:1**.

These are representative tokens, **not** certification of every pixel and state. A complete accessibility review must inspect all colors, icons, chart labels and user zoom conditions.

## Interaction specification

- Persistent light/dark mode follows the operating system until overridden, then saves the user's selection to localStorage.
- Compact/comfortable density toggle changes table rows and case/event spacing without altering values.
- Distinct Monitor, Event Intelligence and Investigations workspaces; `ASSIST` opens the evidence assistant in Investigations.
- Assistant provides **Overview**, **Market & Financials**, **Evidence Gaps**, and **Source Provenance** views, plus a scoped question input and copyable brief.
- A rule-grounded evidence engine is available without an AI provider. It only summarizes saved, explicitly labeled case context and does **not** make causal claims.
- Optional **OpenAI Responses API** inference is server-side only, controlled by `OPENAI_API_KEY` and `OPENAI_MODEL`. With no key, the user sees `EVIDENCE ENGINE · NO AI KEY`; with a successful model response, the badge becomes `AI MODEL`. Missing fields, contradictory data and provenance are still visible.
- This service uses case summaries and evidence metadata, not raw brokerage secrets. **Configuring optional AI sends the selected case evidence brief and user question to the model provider.** It is opt-in, and production privacy review is still required.

## Limits and next evaluations

- Synthetic screenshot data are tagged as illustrative; screenshots are **not** evidence of an authenticated exchange session or real SEC results.
- Rule-grounded observations are distinct from generative model commentary; a response is not an investment decision.
- Before public release, evaluate 5–10 active traders and research analysts: complete a source-backed investigation, find abnormal rows in the blotter, identify source coverage at a glance, use keyboard-only navigation and 200% zoom, and compare readability of both themes.
- Static Vercel output intentionally lacks local case storage and API endpoints; live hosted operation requires authenticated backend and appropriate data redistribution permissions.
