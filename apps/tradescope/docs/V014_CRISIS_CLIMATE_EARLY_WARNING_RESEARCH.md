# ResearchOS v0.14 — Historical Crisis, Climate & Market Transmission Atlas

Status: **implemented bounded research-catalog foundation, NOT an operational early-warning model**. Draft PR #15 is based on v0.13. No production authentication, historical-vintage ingestion, calibrated crash forecasts or issuer-specific weather exposure yet.

## Objective and scope

The goal is to identify *what had become observable at each decision date*, investigate which observations could plausibly warn of a future disruption, and measure conditional financial outcomes through documented economic channels. Unlike a simple analogues cosine score, this must combine:

1. **Shock history:** known historical events, with clearly identified *reference milestones*, not retrospective market bottoms passed off as prediction dates.
2. **Leading observations:** independently dated, period-available data, e.g. macro vintages, climate outlooks, health bulletins, shipping disruptions, insurance filings, commodity prices.
3. **Transmission graphs:** directed, hypothesis-labeled paths linking risk driver → geography/assets → production/demand/trade → issuer/sector cash flow → market data.
4. **Evidence and uncertainty:** source provenance, coverage, issuer location / insured exposure, effective dates, revised vs original versions, and regional seasonality.
5. **Validated outcomes:** lagged factor models, event studies, false-positive rates, baseline comparisons, out-of-time holdouts, and calibration only if supported.

## What is implemented

- `GET /api/crisis/catalog`: historical cases and region/sector pathway catalogue, with `calibratedPredictions:false`.
- `GET /api/crisis/case?id=financial-2008`: source-linked candidate warning indicators, case anchor, affected sectors, transmission graph, proposed validation and acknowledged omissions.
- `GET /api/crisis/pathway?id=enso-fertilizer`: proposed lagged sequence and input requirements.
- **Research → Crisis & Climate**: research explorer with a documented 2008 credit-crisis reference, 2020 COVID selloff, ENSO/fertilizer, wildfire/insurance/rebuilding and snowpack/hydropower.
- **Monitor**: 1m/5m/15m/1h IEX historical bars alongside 1D; no sparse tick reconstruction or fabricated prices.
- Relevant modules: `lib/crisis-atlas.mjs`, `crisis-workspace.js`, `lib/intraday-chart.mjs`, `monitor-candles.js`.

**The seed scenarios intentionally have no historical model feature values or actual counterfactual alpha estimates.** These require a subsequent data sprint.

## Authoritative data-source ingestion backlog

| Layer | Candidate data | Availability-time / licensing considerations | Priority |
| --- | --- | --- | --- |
| Macro and financial stress | FRED/ALFRED Treasury curve, high-yield OAS, unemployment, inflation, funding stress, building permits | Use ALFRED `realtime_start/end` or actual first release date; later revised values unavailable to prior traders | P0 |
| Pandemic and public health | WHO situation reports and archived published public-health notices | Distinguish original notice vs later pandemic characterization; dated URL/capture required | P0 |
| ENSO | NOAA CPC seasonal forecast issue archives, Niño 3.4/ONI, forecast skill | Forecast issue-time data vs later reanalysis. ONI can be revised | P0 |
| Agriculture | USDA WASDE historic monthly reports, planting, acreage, crop progress | Monthly published vintages; region/crop/year and crop-season alignment | P0 |
| Global fertilizer and potash | USGS production/trade reports, UN Comtrade/FAOSTAT, fertilizer benchmarks, shipping routes | Report dates, embargoes, NPK-specific product categories, trade licensing; Brazil import dependence vs global production | P1 |
| Weather and hydrology | NOAA CPC/ERA5, station rainfall and temperature, snow-water equivalent, reservoirs, drought monitors | **Reanalysis is not the contemporaneous forecast**; geographic resolution and observed-time versions | P1 |
| Natural hazards | NASA EONET/FIRMS, NOAA Storm Events, FEMA disasters | Event detected / reported / loss declared times differ; avoid post-event backfill | P1 |
| Insurance | Insurer filings, quarterly losses, property risk/retentions, NFIP, reinsurance / catastrophe bonds | Insurer exposure data often proprietary. NOAA economic loss figures are not insurer-specific claims | P1 |
| Issuer and network mapping | SEC issuer CIK; location of facilities, suppliers, customers, trade / security exposures | Map legal entity to security; disclosure text alone does not prove local exposure | P1 |
| Markets | Point-in-time price/volume/volatility/credit/sector ETFs | Splits, survivorship bias, delistings, market hours, exchange coverage and costs; IEX != SIP | P1 |
| News/public warning sources | Official agencies and original archived dated reports; GDELT as media candidates | Original publication/knowledge clock; claims corroboration, dedup and follow-up corrections | P2 |

## Research requirements

### Crash alert validation: 2008 and 2020

**2008:** NBER ultimately dates the US recession from December 2007 to June 2009, but announced the peak determination only in December 2008. Do not train or backtest using today's NBER label as a December 2007 observable. Investigate yield-curve and mortgage/funding/credit-spread data with individual publication and observation dates.

**2020:** WHO reports and public restrictions evolved in stages. Do not allow the March 11, 2020 pandemic declaration into features for January or February decisions. Establish whether each warning observation had broad contemporaneous public dissemination; compare predictions to price-based, volatility-based and naive benchmarks.

### Climate / fertilizer research

ENSO influences climate with regional, seasonal and crop-specific differences. A recent multi-scale analysis reports weak/heterogeneous associations for Brazilian soybeans; some other regional research finds stronger relationships for Argentina. Therefore *ENSO alone* is not an adequate fertilizer demand or equity return predictor. Model issued ENSO forecasts → actual rainfall/soil moisture *by region* → relevant crop acreage/yield → fertilizer demand and importer inventory → N/P/K product price and global supply → named security margins, with season and lag controls.

**Important correction:** A South American crop demand shock is not automatically a shock to South American potash mining. USGS and Purdue sources indicate highly concentrated global potash production and strong fertilizer-import dependence in Brazil. Test global supply/export availability separately from weather-driven crop demand.

### Wildfire / snow / monsoon

- Wildfire: spatial fire footprint and intensity → insured properties → policy/reinsurance retention → claim reserves/premium changes → insurer/reinsurer equity and rebuilding demand. Construction firms can simultaneously face project damage, materials inflation and rebuilding demand.
- Snow: regional snow-water equivalent → runoff/reservoirs → hydro generation, gas/electricity prices → utility margins and irrigated farming, by watershed and season.
- Monsoon: seasonal forecast *issue date* → regional rain/heat anomaly → crop planting and yield, logistics, infrastructure, food prices → regionally exposed importers, fertilizer sellers, infrastructure and insurance.
- Hurricanes, floods, droughts: model geographical exposure before inferring any individual issuer or bond impact.

### Anti-leakage backtesting protocol

1. Define a decision clock and information-availability clock **before** calculating signals. Capture `source_published_at`, `data_observed_at`, `first_seen_at`, `revision_received_at`, `source_vintage`, and `effective_period` separately.
2. Version raw signals and normalize region/product/industry/security identities.
3. Fit the feature pipeline on training periods only; use rolling / purged out-of-time evaluation rather than random-shuffling dates.
4. Include placebo/negative control events, alternative commodity/weather narratives, time-of-day and data lag.
5. Define multiple outcome horizons (1, 5, 20, 63 sessions) and return distributions versus SPY and sector benchmarks.
6. Report precision/recall, false-warning rates, lead-time distribution, forecast calibration and comparison with simple credit/volatility baseline signals *when estimable*.
7. Attribute the forecast to actual contemporaneous observed data. An algorithm's `confidence` is not a market-probability estimate.
8. Ensure any price feed redistribution and historical archiving comply with provider licensing.

## Proposed database tables (future central PostgreSQL)

- `source_observation(id,provider,external_id,first_seen_at,source_published_at,valid_at,vintage_hash,unit,geo,raw_ref,license)`
- `shock_event(id,kind,region,event_time,reference_milestone,assertion_source,assertion_status)`
- `pathway_edge(id,driver_id,outcome_id,mechanism,sign_hypothesis,lag_range,source_id,validation_status)`
- `issuer_exposure(id,issuer_cik,security_id,geo_asset,sector,exposure_basis,valid_start,valid_end,confidence_basis)`
- `research_signal(id,model_version,as_of,inputs_hash,readiness,triggered,provenance)`
- `outcome_study(id,shock_id,security_id,benchmark,time_horizon,market_feed,return,missingness)`
- `backtest_run(id,train_window,holdout_window,method,baseline,calibration,limitations)`

Add review-role and revision history per the broader ResearchOS Java/PostgreSQL/OIDC integration plan. No public write API for this prototype.

## Source references and literature (official and research)

- NBER turning points and announcement timing: https://www.nber.org/research/business-cycle-dating/business-cycle-dating-procedure-frequently-asked-questions
- ALFRED vintage and real-time economic data: https://fred.stlouisfed.org/docs/api/fred/realtime_period.html
- Federal Reserve NY yield curve/recession model: https://www.newyorkfed.org/research/capital_markets/ycfaq
- WHO outbreak timeline: https://www.who.int/emergencies/diseases/novel-coronavirus-2019/interactive-timeline
- NOAA CPC ENSO advisories: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/
- Iizumi et al., *Impacts of ENSO on global yields of major crops* (2014): https://doi.org/10.1038/ncomms4712
- BIS, *Soybean yield prediction in Argentina using climate data* (2025): https://www.bis.org/publications/working-paper-1278-soybean-yield-prediction-argentina-using-climate-data
- Multi-scale Brazilian soybean ENSO study (2026): https://link.springer.com/article/10.1007/s00704-026-06266-z
- Purdue, Brazilian fertilizer-import dependency (2026): https://ag.purdue.edu/commercialag/home/resource/2026/04/middle-east-conflict-revives-concerns-over-fertilizer-dependence-in-the-u-s-and-brazil/
- USGS, potash market outlook (2026): https://pubs.usgs.gov/publication/sir20265081/full
- Federal Reserve SF, extreme weather and financial uncertainty (2024): https://www.frbsf.org/research-and-insights/publications/economic-letter/2024/01/extreme-weather-and-financial-market-uncertainty/
- IMF, cross-border natural disaster supply-chain shocks: https://www.elibrary.imf.org/view/journals/053/0024/002/article-A004-en.xml
- Congressional Budget Office, climate disaster risk and homeowners insurance: https://www.cbo.gov/publication/60674
- Alpaca historical stock bars and supported timeframes: https://docs.alpaca.markets/us/reference/stockbars

## Next implementation gates

1. Verify latest PR branch with complete Node CI/static build. Live Alpaca/real-browser tests user-deferred.
2. Connect **FRED/ALFRED and NOAA CPC/issued forecast vintages** as separately authorized and bounded source adapters. Until then the 'warning' list is a research prompt only.
3. Implement historical case evaluation with explicit `asOf` and a no-leakage source-availability validator; reject missing/vintage-unknown observations.
4. Expand real issuer-sector/geographical exposure mapping before economic scenario outcomes.
5. Build automated walk-forward evaluation, calibration and false-alarm dashboards **only after labeled observations are available**.
