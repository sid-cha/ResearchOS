# Public-platform research for the next TradeScope increment

Reviewed November 12, 2026 using official product/help pages. These are documented capabilities and design references, not independent validation of vendor prediction accuracy, an implementation inside ResearchOS, or access to their licensed datasets. No accounts were created or paid services provisioned.

## Relevant existing products

| Product | What its public documentation supports | Implication for TradeScope |
|---|---|---|
| [Reflexivity Scenario Analysis](https://support.reflexivity.com/hc/en-us/articles/27023105377556-What-is-Scenario-Analysis-and-how-does-it-work) | User-defined historical conditions can be evaluated against asset baskets, watchlists and screens, with aggregate return profiles. | The closest documented analogue to the requested historical-pattern workflow: specify an event/condition, choose instruments and horizons, inspect previous instances and outcomes. It does not establish that every future disaster is predictable. |
| [Reflexivity Knowledge Graph](https://reflexivity.com/en/knowledge-graph) | Describes company/theme/geographic/supplier relationships and historical pattern context, with multiple external data sources. | Exposure relationships and broad data coverage are separate components; the current ten-symbol IEX adapter cannot substitute for them. |
| [TradingView Stock Screener](https://www.tradingview.com/support/solutions/43000718866-tradingview-stock-screener-trade-smarter-not-harder/) | Combines technical and financial filters, customizable columns, saved screens and period-specific financial metrics. | Build one versioned metric catalog and query/rule engine, then reuse them in company views, screens and alerts. |
| [Koyfin Alerts](https://www.koyfin.com/features/alerts/) and [historical metrics](https://www.koyfin.com/help/release-notes/v3-67-historic-data-in-watchlist-screener/) | Documents price, valuation, technical and news/document alert workflows, plus historical financial/valuation data in research tables and screeners. | Replace the single narrow signal feed with categorized conditions and dated metric history. Notification delivery is a later user-configured feature; current planning does not authorize sending messages. |
| [RavenPack research datasets](https://www.ravenpack.com/solutions/research/wrds) | Describes entity/event tagging, relevance, novelty, temporal metadata and historical news analytics for point-in-time research. | Normalize event types and entities, separate repeated reporting from new information, preserve knowledge timestamps and make the research cohort reproducible. Vendor sentiment/impact scores cannot simply be copied or presented as our validated model. |
| [AlphaSense document-scoped research](https://help.alpha-sense.com/hc/en-us/articles/41670845561619-Using-Generative-Search-on-Select-Documents) | Supports questions grounded in selected company documents, including supported filing and transcript types. | An 8-K title is only metadata. Fetch/parse the actual permitted document, preserve passages and sections, and ground summaries in that evidence. |
| [Dataminr supply-chain intelligence](https://www.dataminr.com/use-cases/supply-chain-management/) | Describes real-time incidents, route disruption and supplier/network risk workflows using event context and monitored assets. | Join a verified event footprint to sourced facilities, routes and suppliers before claiming a company's operational exposure. Geographical proximity alone does not prove loss. |
| [S&P Global country-risk scenarios](https://www.spglobal.com/market-intelligence/en/solutions/products/country-risk-scenarios-analysis) | Describes quantitative/qualitative scenario pathways, exposure-specific impacts and monitored indicators for political/economic risks. | Political, social and economic pathways need their own evidence, indicators and evaluation targets. A historical stock-return chart does not validate all those outcomes. |

These references support a combined research workflow; they do not show that a single unlicensed feed or a general-purpose LLM can reproduce the products' coverage. Availability, current subscription scope and redistribution rights must be verified before any provider integration.

## Official earthquake-impact sources

[USGS PAGER](https://earthquake.usgs.gov/data/pager/) publishes modeled fatality/economic-loss impact estimates after significant earthquakes. Its [scientific background](https://earthquake.usgs.gov/data/pager/background.php) describes country-specific exposure/vulnerability modeling. These can be ingested as attributed, versioned **USGS estimates**, separately from confirmed losses and from any TradeScope financial-outcome model. They are not company loss estimates or equity-return forecasts.

[USGS GeoJSON detail](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php) provides event/update metadata and product links. An update timestamp is not necessarily the original public issue time. The [PAGER FAQ](https://earthquake.usgs.gov/data/pager/faq.php) distinguishes related hazards and points to official tsunami warnings. Earthquake detection or an event flag alone must not be displayed as a confirmed damaging tsunami.

The [IMF study on cross-border disaster spillovers](https://www.elibrary.imf.org/abstract/journals/053/0024/002/article-A004-en.xml) illustrates research that combines disaster histories and trade/supply-chain links with market event studies. It supports investigating transmission channels; it is not a ready-made prediction model for ResearchOS.

## Product decisions supported by this research

1. **Research Metrics and Signals:** expanded technical/financial history, reusable conditions, availability/readiness and source-linked alert evidence. This supplies the inputs for screeners and sector views as well as the current screen.
2. **Filing Intelligence:** document/item extraction and cited event descriptions, preserving occurrence versus filing/knowledge timestamps. Do not manufacture a summary from a generic form name.
3. **Historical Analogue and Exposure pilot:** official event versions, a bounded verified exposure graph, supported outcome series and transparent similarity retrieval.
4. **Scenario evaluation:** conditional pathways and monitored evidence first; calibrated forecasts only after a defined target and chronological unseen-period testing.

The proposed work packages and acceptance gates are in [NEXT_RESEARCH_INTELLIGENCE.md](NEXT_RESEARCH_INTELLIGENCE.md). That document distinguishes the proposal from the v0.7 integrity fixes actually implemented in this branch.

## Example planned investigation output

For a **hypothetical** large coastal earthquake, the screen would present these independently:

| Panel | Planned output |
|---|---|
| Confirmed event | Official source/version, occurrence/issue times, magnitude/depth and available shaking footprint; tsunami warning only from an appropriate authority. |
| Attributed estimates | Available USGS PAGER estimates and uncertainties, clearly distinguished from observed damage. |
| Verified exposures | Facilities/ports/suppliers actually linked by dated evidence; unsupported company links remain unknown. |
| Historical analogues | Earlier eligible events, why they match, differences, known-at-time features and sample count. |
| Measured outcomes | Supported instruments/benchmarks, individual return paths and available 1/5/20-session outcomes; missing markets stay unavailable. |
| Scenario channels | Conditional production, shipping, insurance, reconstruction, policy and social-service pathways, with evidence needed to support or reject each. |
| Uncertainty and actions | Missing history/exposure, revised facts, competing explanations; save investigation and monitor supported instruments. |

This is a proposed interface/output contract, not a claim that the earthquake/analogue/forecast engine has been built.
