/**
 * Historical Crisis & Climate Atlas seed: researched hypotheses, NOT measured
 * point-in-time indicator observations. Vintage validation is a hard prerequisite
 * for backtests, probability estimates and alerts.
 */
const SOURCES=Object.freeze({
 nber:{name:'NBER Business Cycle Dating',url:'https://www.nber.org/research/business-cycle-dating'},
 fred:{name:'FRED 10y–3m Treasury Spread',url:'https://fred.stlouisfed.org/series/T10Y3M'},
 credit:{name:'FRED High Yield Credit Spread',url:'https://fred.stlouisfed.org/series/BAMLH0A0HYM2'},
 alf:{name:'ALFRED Vintage Data',url:'https://fred.stlouisfed.org/docs/api/fred/alfred.html'},
 who:{name:'WHO COVID-19 Timeline',url:'https://www.who.int/emergencies/diseases/novel-coronavirus-2019/interactive-timeline'},
 ens:{name:'NOAA CPC ENSO Monitoring',url:'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/'},
 oni:{name:'NOAA CPC Oceanic Niño Index',url:'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php'},
 usda:{name:'USDA World Agricultural Supply and Demand Estimates',url:'https://www.usda.gov/oce/commodity/wasde'},
 potash:{name:'USGS Potash Mineral Commodity Information',url:'https://www.usgs.gov/centers/national-minerals-information-center/potash-statistics-and-information'},
 eonet:{name:'NASA EONET',url:'https://eonet.gsfc.nasa.gov/'},
 wildfire:{name:'NASA FIRMS Wildfire Observations',url:'https://firms.modaps.eosdis.nasa.gov/'},
 storm:{name:'NOAA Storm Events Database',url:'https://www.ncdc.noaa.gov/stormevents/'},
 insurance:{name:'NOAA National Centers for Environmental Information',url:'https://www.ncei.noaa.gov/access/billions/'},
 snow:{name:'NOAA National Operational Hydrologic Remote Sensing Center',url:'https://www.nohrsc.noaa.gov/'},
 gas:{name:'US EIA Natural Gas',url:'https://www.eia.gov/naturalgas/'}
});
const cases=[
 {id:'financial-2008',kind:'retrospective_crisis',title:'Global financial crisis · 2007–2009',
  anchorDate:'2008-09-15',anchorMeaning:'Lehman Brothers bankruptcy date is a reference milestone, not the beginning of the recession or earliest warning',
  historicalOutcome:'Severe global credit disruption and equity-market drawdowns, not an automatically reproducible historical return calculated by this module',
  candidateSignals:[
   {name:'Treasury yield-curve inversion',sourceIds:['fred','alf'],lead:'2006–2007 observations must be reconstructed from period-available series',interpretation:'Slow-moving recession risk indicator; does not specify equity crash timing'},
   {name:'Mortgage-credit stress and interbank funding',sourceIds:['credit'],lead:'Deterioration was reported before September 2008',interpretation:'Transmission through leverage, liquidity, bank counterparties and real estate'},
   {name:'High-yield spreads and credit repricing',sourceIds:['credit','alf'],lead:'Earlier widening requires dated provider vintages and thresholds',interpretation:'Credit stress may rise without an immediate equity drawdown'}
  ],
  pathways:['credit-funding','insurance-realestate'],affectedSectors:['Banks','Insurers','Homebuilders','Real Estate','Broad Equities'],
  caveats:['Selected signals were NOT reconstructed from contemporary public-data vintages in this seed','Lehman is a reference shock milestone, not proof of an exact early-warning lead time']},
 {id:'covid-2020',kind:'retrospective_crisis',title:'COVID-19 global market disruption · 2020',
  anchorDate:'2020-02-24',anchorMeaning:'Reference date in the February equity selloff, not the date SARS-CoV-2 began or the global market trough',
  historicalOutcome:'Sharp global equity decline and differential sector responses in February–March 2020',
  candidateSignals:[
   {name:'Outbreak reporting and spread',sourceIds:['who'],lead:'Public reports began December 2019; subsequent dates must use contemporaneous bulletins',interpretation:'Public-health information does not directly imply a known financial-market drawdown'},
   {name:'Travel restrictions and industrial closures',sourceIds:['who'],lead:'January–February 2020 news and official actions require original timestamps',interpretation:'Travel, logistics, manufacturing and services disruptions can alter cash-flow expectations'},
   {name:'Liquidity and credit deterioration',sourceIds:['credit','alf'],lead:'Cross-asset repricing accelerated during the crisis',interpretation:'Many price-based indicators are contemporaneous, not reliably leading'}
  ],
  pathways:['pandemic-supply','credit-funding'],affectedSectors:['Travel','Healthcare','Retail','Technology','Insurance','Shipping'],
  caveats:['WHO pandemic declaration on March 11, 2020 is AFTER this reference selloff date and must never be backfilled into a January signal','No real-time warnings or prediction metrics reconstructed here']},
 {id:'enso-fertilizer',kind:'scenario',title:'ENSO → South American crops → fertilizer and potash exposure',
  anchorDate:null,anchorMeaning:'Forward research hypothesis, not a historical one-off crash date',
  historicalOutcome:'No return forecast: rainfall distributions, acreage, yield and fertilizer demand vary by crop, country, season and ENSO phase',
  candidateSignals:[
   {name:'NOAA ENSO diagnostics/outlooks',sourceIds:['ens','oni'],lead:'Seasonal monitoring is public, with forecast changes and revisions',interpretation:'Forecast probabilities require issue-date snapshots; ENSO is not deterministic rainfall'},
   {name:'Regional precipitation and soil-moisture anomalies',sourceIds:['ens','usda'],lead:'Compare forecast anomalies with realized conditions region by region',interpretation:'South American impacts are heterogeneous; do not assume continent-wide drying'},
   {name:'Crop planting, yield forecasts and demand',sourceIds:['usda'],lead:'Crop-season acreage and forecast revisions can affect input purchases',interpretation:'Fertilizer demand is mediated by economics, not just rainfall'},
   {name:'Global potash supply and trade restrictions',sourceIds:['potash'],lead:'Supply constraints and trade routes are distinct factors',interpretation:'South American demand can affect import markets without implying local potash production'}
  ],
  pathways:['enso-fertilizer'],affectedSectors:['Agriculture','Potash Producers','Fertilizer Distributors','Farm Equipment','Food Processing'],
  caveats:['Do not assume South American countries are major potash producers; many crop economies rely on imports','El Niño and La Niña differ by region, time of year, and background climate variability','Scenario has no calibrated security-level forecast']},
 {id:'wildfire-insurance',kind:'scenario',title:'Wildfire → insured losses → pricing → construction',
  anchorDate:null,anchorMeaning:'Weather hazard propagation template, not an observed insurer loss event',
  historicalOutcome:'Claims and premiums depend on insured footprint, attachment points, retentions, reinsurance, regulation and local building stock',
  candidateSignals:[
   {name:'Fire detections, spread and containment',sourceIds:['eonet','wildfire'],lead:'Satellite detections should be linked to initial observation times',interpretation:'Wildfire detection does not prove insured loss'},
   {name:'Drought, wind and heat anomalies',sourceIds:['storm','insurance'],lead:'Potential hazard amplifiers; spatial and seasonal controls needed',interpretation:'Weather anomalies do not by themselves quantify exposure'},
   {name:'Exposure and reconstruction costs',sourceIds:['insurance'],lead:'Building inventory, local costs and insurance terms are necessary',interpretation:'Contractors may gain repair demand while facing workforce and material constraints'}
  ],
  pathways:['wildfire-insurance'],affectedSectors:['Property Insurers','Reinsurers','Construction','Building Materials','Utilities','Municipal Bonds'],
  caveats:['Without insurer-specific insured values and terms, estimate neither claims nor share price outcomes','NOAA disaster loss figures are not issuer-level insured claims']},
 {id:'snow-hydropower',kind:'scenario',title:'Snowpack and water stress → power, agriculture and construction',
  anchorDate:null,anchorMeaning:'Seasonal environmental risk hypothesis',
  historicalOutcome:'Changes in run-off, electricity supply, irrigation demand and seasonal activity may alter operating costs',
  candidateSignals:[
   {name:'Snow-water equivalent and melt timing',sourceIds:['snow'],lead:'Seasonal measurements and historical revisions must retain vintage',interpretation:'Snow cover is not the same as reservoir inflow'},
   {name:'Power supply mix and demand',sourceIds:['gas'],lead:'Generation and fuel exposure mediate the financial impact',interpretation:'Energy prices also reflect demand, outages and market structure'},
   {name:'Regional construction and irrigation activity',sourceIds:['usda'],lead:'Separate seasonal weather sensitivity from baseline activity',interpretation:'Geographic exposure and contracts required'}
  ],
  pathways:['snow-water'],affectedSectors:['Utilities','Hydropower','Agriculture','Construction','Water Infrastructure','Insurers'],
  caveats:['No measured regional exposure or asset-specific earnings effects attached','Climate scenarios are not financial forecasts']}
];
const pathways=[
 {id:'credit-funding',name:'Credit stress propagation',driver:'Funding risk / leverage',nodes:['Lending standards and defaults','Counterparty funding spreads','Credit availability','Corporate refinancing costs','Earnings and equity sensitivity'],
  indicators:['High-yield spread','Funding stress','Yield curve','Loan-loss disclosures'],sectors:['Banks','Insurance','Homebuilders'],sources:['credit','fred','alf'],
  test:'Evaluate conditional drawdown distributions only from contemporaneously available, lagged data; compare against a no-signal baseline.'},
 {id:'pandemic-supply',name:'Public-health supply disruption',driver:'Outbreak and mobility restrictions',nodes:['Public outbreak evidence','Public-health policy responses','Supply-chain and labor disruptions','Sales and cash-flow revisions','Cross-asset market repricing'],
  indicators:['WHO bulletin vintage','Mobility restrictions','Industry shutdown announcements','Credit spreads'],sectors:['Travel','Logistics','Manufacturing','Retail','Healthcare'],sources:['who','credit'],
  test:'Use announcement timestamps, issuer facility/supplier exposures, market reaction windows and placebo periods.'},
 {id:'enso-fertilizer',name:'ENSO / regional crop / fertilizer demand',driver:'ENSO phase and location-specific rainfall',nodes:['Issued ENSO outlook','Regional rainfall anomaly','Crop acreage and yield forecasts','Fertilizer demand vs trade supply','Company revenues, margins and returns'],
  indicators:['ENSO outlook vintage','Precipitation percentile','WASDE forecast revisions','Potash supply / imports'],sectors:['Agriculture','Fertilizer','Farm Equipment','Food'],sources:['ens','oni','usda','potash'],
  test:'Season-specific lagged regressions with region/crop fixed effects, commodity controls, supply disruptions and out-of-time validation.'},
 {id:'wildfire-insurance',name:'Wildfire / insurance / rebuilding',driver:'Fire weather and exposed properties',nodes:['Wildfire detection and spread','Insured property intersection','Gross claims and retention/reinsurance','Premium pricing and capital changes','Construction and building-material demand'],
  indicators:['Hotspot timestamps','Fire perimeter','Exposure maps','Loss reports / premiums','Building material costs'],sectors:['Property & Casualty Insurance','Reinsurance','Construction','Utilities'],sources:['eonet','wildfire','storm','insurance'],
  test:'Spatially match hazard perimeters, reported exposures and loss notices before estimating sector or company outcomes.'},
 {id:'snow-water',name:'Snowpack / hydrology / energy',driver:'Snow-water equivalent and seasonal temperature',nodes:['Snowfall and temperature anomalies','Snowmelt and reservoir inflows','Hydropower vs gas generation','Energy prices / irrigation','Utilities and water-sensitive company margins'],
  indicators:['Snow-water equivalent','Reservoir levels','Generation mix','Regional rainfall'],sectors:['Utilities','Energy','Agriculture','Construction'],sources:['snow','gas','usda'],
  test:'Use water-basin seasonal models and local market prices before cross-company exposure regressions.'},
 {id:'insurance-realestate',name:'Credit / property / insurers',driver:'Property-price and credit deterioration',nodes:['Regional property distress','Lender portfolio impairment','Mortgage-backed exposures','Insurance guarantees and capital','Stock and debt repricing'],
  indicators:['Property defaults','Insurer capital filings','Credit spreads'],sectors:['Insurers','Banks','Real Estate'],sources:['credit','fred'],
  test:'Map actual holdings and policy exposure, not generic sector labels.'}
];
const copy=x=>structuredClone(x);
export function createCrisisAtlas(){
 return Object.freeze({
  list(){return {schemaVersion:1,methodVersion:'curated-mechanism-catalog-v1',cases:copy(cases.map(c=>({id:c.id,kind:c.kind,title:c.title,anchorDate:c.anchorDate,affectedSectors:c.affectedSectors}))),pathways:copy(pathways.map(p=>({id:p.id,name:p.name,driver:p.driver,sectors:p.sectors}))),
   sourceCount:Object.keys(SOURCES).length,coverage:{historicalVintagesReconstructed:false,calibratedPredictions:false,statisticalBacktest:false,liveWarningFeed:false},
   limitations:['Case studies and transmission pathways are curated research hypotheses, not a point-in-time reconstructed database.','No probability, security recommendation, validated early-warning lead time or causal relationship is inferred.']};},
  detail(id){const item=cases.find(c=>c.id===id);
   if(!item)return null;
   const linked=pathways.filter(p=>item.pathways.includes(p.id));
   const refs=[...new Set([...item.candidateSignals.flatMap(x=>x.sourceIds),...linked.flatMap(p=>p.sources)])];
   return {schemaVersion:1,methodVersion:'curated-mechanism-catalog-v1',case:copy(item),pathways:copy(linked),sources:refs.map(id=>({id,...SOURCES[id]})),
    evidenceStatus:'SOURCE_REFERENCES_ONLY_NOT_RECONSTRUCTED_POINT_IN_TIME',
    validationRequired:['Recover dated original source publications and revisions','Join region/crop/commodity to issuer exposure and financial period','Use lagged features and leakage-safe walk-forward/backtest','Report precision, false positives, conditional returns and baseline comparisons'],
    limitations:['All early-warning candidates are retrospective research leads, not verified ex-ante alerts.','No measured feature values, estimates, current risk level or forecast are provided.']};
  },
  pathway(id){const item=pathways.find(p=>p.id===id);return item?copy({...item,sources:item.sources.map(id=>({id,...SOURCES[id]}))}):null;}
 });
}
export function createCrisisAtlasApi({atlas=createCrisisAtlas()}={}){
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/crisis/'))return false;
  const reply=(status,result)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));}};
  if(req.method!=='GET'){reply(405,{error:'Read-only crisis and climate research'});return true;}
  const endpoint=url.pathname.slice('/api/crisis/'.length);
  if(endpoint==='catalog'){reply(200,atlas.list());return true;}
  if(endpoint==='case'){const id=url.searchParams.get('id');const item=atlas.detail(id);reply(item?200:404,item||{error:'Unknown case study'});return true;}
  if(endpoint==='pathway'){const id=url.searchParams.get('id');const item=atlas.pathway(id);reply(item?200:404,item||{error:'Unknown transmission pathway'});return true;}
  reply(404,{error:'Unknown crisis research endpoint'});return true;
 };
}
