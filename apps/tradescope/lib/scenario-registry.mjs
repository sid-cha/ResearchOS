/** Declarative TradeScope scenario registry, including preserved legacy scenario definitions.
 * Data definitions are curated hypotheses. No secret/provider key is stored here.
 */
const LEGACY_SPECS=[
 {
  id:'enso-fertilizer',caseId:'enso-fertilizer',title:'ENSO → agriculture → fertilizer market',regionScope:'Crop-growing regions in South America (specific geography unverified)',
  nodes:[
   ['enso_outlook','Issued ENSO outlook','climate_signal',0,'NOAA CPC original issue date and forecast revision'],
   ['rainfall','Regional rainfall and soil moisture','regional_hazard',1,'Georeferenced seasonal anomaly, issue/observation vintage and crop-calendar alignment'],
   ['crop','Crop planting and yield revisions','crop_production',2,'Region, crop, acreage, yield and dated USDA/local forecasts'],
   ['fert_demand','Fertilizer purchasing demand','commodity_demand',3,'N/P/K consumption volumes, delivery timing and importer inventory'],
   ['potash_supply','Global potash production and export supply','commodity_supply',2,'Dated USGS/exporter reports; separate supply shocks from demand shocks'],
   ['fert_market','Regional fertilizer import price and availability','market_balance',4,'Product-specific traded prices, tariffs, freight and volume'],
   ['fert_industry','Fertilizer and farm-input sector margins','industry_cashflow',5,'Segment disclosures, cost pass-through and baseline competition'],
   ['fert_issuer','Named issuer exposure (not established)','issuer_exposure',6,'Facility/supplier/revenue map with company IDs and period-valid evidence']
  ],
  edges:[
   ['e01','enso_outlook','rainfall','Forecast climate phase may correlate with location- and season-specific rainfall','ens'],
   ['e02','rainfall','crop','Regional water stress may change acreage, timing or crop yields','usda'],
   ['e03','crop','fert_demand','Acreage and expected crop economics may alter fertilizer purchase volumes','usda'],
   ['e04','fert_demand','fert_market','Regional fertilizer demand interacts with imported inventories and traded prices','potash'],
   ['e05','potash_supply','fert_market','Export availability and freight independently affect local fertilizer prices','potash'],
   ['e06','fert_market','fert_industry','Product-specific prices and input mix may change sector margins','potash'],
   ['e07','fert_industry','fert_issuer','Issuer-level impact requires proven revenues, supplies and contracts','potash']
  ]
 },
 {
  id:'wildfire-insurance',caseId:'wildfire-insurance',title:'Wildfire → insurance → reconstruction',regionScope:'Fire-perimeter and insured-property intersection (actual region unassigned)',
  nodes:[
   ['fire_weather','Regional fire-weather and drought','regional_hazard',0,'Issued weather forecasts and observed risk timestamps'],
   ['wildfire','Observed wildfire extent and intensity','regional_hazard',1,'NASA FIRMS detection/coverage, fire perimeter and observation timestamps'],
   ['insured_assets','Actual exposed insured property','asset_exposure',2,'Geocoded insured values, policies and valid coverage dates'],
   ['claims','Insurer and reinsurer net claims','insurance_balance_sheet',3,'Loss notices, attachment/retention layers and reinsurance share'],
   ['insurance_sector','Insurer capital, reserves and renewals','industry_cashflow',4,'Segment reserve filings, premium pricing and regulatory constraints'],
   ['rebuild','Repair/rebuild demand and material supply','commodity_demand',3,'Permits, repair orders and local material and labor constraints'],
   ['construction','Construction/materials sector net effects','industry_cashflow',4,'Regional revenue and cost exposure, backlog and timing'],
   ['wildfire_issuer','Named issuer impact (not established)','issuer_exposure',5,'Company policy, loss, operating asset or regional revenue evidence']
  ],
  edges:[
   ['w01','fire_weather','wildfire','Fire weather can affect wildfire likelihood and spread but does not establish occurrence','storm'],
   ['w02','wildfire','insured_assets','Burn extent must overlap verified insured property footprints','wildfire'],
   ['w03','insured_assets','claims','Policy terms, retentions and limits determine potential claims','insurance'],
   ['w04','claims','insurance_sector','Net loss and capital effects depend on insurer risk transfer and reporting','insurance'],
   ['w05','wildfire','rebuild','Damaged buildings can affect rebuilding demand and supply constraints','eonet'],
   ['w06','rebuild','construction','Local demand and material/labor costs can move construction margins differently','insurance'],
   ['w07','insurance_sector','wildfire_issuer','Named insurers require company-specific loss evidence','insurance'],
   ['w08','construction','wildfire_issuer','Named builders require actual geographic orders and margins','insurance']
  ]
 },
 {
  id:'snow-hydropower',caseId:'snow-hydropower',title:'Snowpack → hydrology → power and farming',regionScope:'Specific snow-fed watersheds and utility service territories (unassigned)',
  nodes:[
   ['snow_observation','Snow-water equivalent and temperature','climate_signal',0,'Date-stamped station/basin observations and source revisions'],
   ['runoff','Seasonal runoff and reservoir inflows','hydrology',1,'Watershed runoff forecasts, reservoir and melt timing'],
   ['hydro_supply','Hydropower generation availability','energy_system',2,'Utility generation dispatch and reservoir operating constraints'],
   ['fuel_mix','Thermal power and natural gas substitution','energy_system',3,'Fuel dispatch, market demand, gas prices and power-market rules'],
   ['irrigation','Crop irrigation water availability','asset_exposure',2,'Irrigation districts, watershed rights, storage and farm locations'],
   ['energy_sector','Power sector costs and revenue','industry_cashflow',4,'Utility fuel/power purchases, hedges and rate recovery'],
   ['farm_sector','Water-sensitive farming cash flow','industry_cashflow',3,'Crop/region yields and irrigation expenditure'],
   ['snow_issuer','Named issuer impact (not established)','issuer_exposure',5,'Verified utility operating assets, customers, farming footprint and disclosures']
  ],
  edges:[
   ['s01','snow_observation','runoff','Snow-water equivalent and temperature may affect melt and runoff','snow'],
   ['s02','runoff','hydro_supply','Reservoir and runoff changes may affect hydropower availability','snow'],
   ['s03','hydro_supply','fuel_mix','Reduced hydro generation may require substitute supply','gas'],
   ['s04','fuel_mix','energy_sector','Fuel/wholesale prices and hedges can change generation economics','gas'],
   ['s05','runoff','irrigation','Water timing and allocation may affect irrigation access','snow'],
   ['s06','irrigation','farm_sector','Crop and irrigation cost effects depend on regional exposure','usda'],
   ['s07','energy_sector','snow_issuer','Named utility impact requires verified geography and contracts','gas'],
   ['s08','farm_sector','snow_issuer','Named agriculture issuer requires crop/revenue geographic proof','usda']
  ]
 }
];

/* v0.23 scenario registry: curated mechanism hypotheses, never verified causal or trading data. */
const SAFE_ID=/^[a-z][a-z0-9_-]{1,63}$/;
const CLASSES=new Set(['climate','energy','geopolitical','natural_hazard','commodities','shipping','credit','health']);
const TYPES=new Set(['climate_signal','regional_hazard','asset_exposure','crop_production','commodity_demand',
 'commodity_supply','market_balance','hydrology','energy_system','insurance_balance_sheet',
 'industry_cashflow','issuer_exposure','regulatory_event','transport_network','credit_conditions',
 'health_event','labor_supply']);
const SOURCES=Object.freeze({
 eia:{id:'eia',url:'https://www.eia.gov/opendata/',label:'EIA energy statistics'},
 usda:{id:'usda',url:'https://apps.fas.usda.gov/opendatawebv2/',label:'USDA FAS crop estimates'},
 drought:{id:'drought',url:'https://droughtmonitor.unl.edu/',label:'US Drought Monitor issued maps'},
 noaa:{id:'noaa',url:'https://www.noaa.gov/',label:'NOAA observed and issued hazard research'},
 nrsc:{id:'nrsc',url:'https://www.nrcs.usda.gov/',label:'NRCS snow and watershed research'},
 nhc:{id:'nhc',url:'https://www.nhc.noaa.gov/',label:'NOAA National Hurricane Center bulletins'},
 sec:{id:'sec',url:'https://www.sec.gov/edgar.shtml',label:'SEC issuer filings'},
 ofac:{id:'ofac',url:'https://ofac.treasury.gov/sanctions-list-service',label:'OFAC dated sanctions lists'},
 trade:{id:'trade',url:'https://comtradeplus.un.org/',label:'UN Comtrade aggregate flows'},
 usgs:{id:'usgs',url:'https://www.usgs.gov/',label:'USGS mineral and earthquake sources'},
 ports:{id:'ports',url:'https://www.maritime.dot.gov/',label:'US maritime trade and ports research'},
 fred:{id:'fred',url:'https://fred.stlouisfed.org/',label:'FRED macro and ALFRED vintages'},
 health:{id:'health',url:'https://www.who.int/',label:'WHO public health bulletins'},
 cdc:{id:'cdc',url:'https://www.cdc.gov/',label:'CDC public health notices'}
});
const template=(id,title,eventClass,industry,region,notes,nodes,edges,sources)=>({
 id,caseId:null,title,regionScope:region,
 nodes:nodes.map(([name,label,type,stage])=>[name,label,type,stage,
  'Source-dated '+label.toLowerCase()+' and independent region/issuer exposure evidence required']),
 edges:edges.map(([name,from,to,mechanism,sourceId])=>[name,from,to,mechanism,sourceId]),
 eventClass,industry,regions:['global-research'],
 commodities:[],weatherNode:null,issuerNode:nodes.find(x=>x[2]==='issuer_exposure')?.[0]||null,
 historicalMode:false,currentMode:'TEMPLATE_ONLY',providerBindings:[],
 notes,sourceReferences:sources
});
const EXTRA=[
 template('drought-agriculture','Drought → irrigation → agricultural supply','climate','Agriculture',
  'Region-specific drought/irrigation district (not mapped)',
  'US Drought Monitor, station humidity, crop losses and farm footprint needed',
  [['drought_outlook','Observed/issued drought conditions','regional_hazard',0],
   ['water_stress','Irrigation and reservoir availability','hydrology',1],
   ['crop_output','Regional crop yields and acreage','crop_production',2],
   ['farm_cost','Agriculture input expenses','industry_cashflow',3],
   ['drought_issuer','Issuer crop and geography exposure','issuer_exposure',4]],
  [['d01','drought_outlook','water_stress','Drought may affect water availability','drought'],
   ['d02','water_stress','crop_output','Irrigation may affect regional yield','usda'],
   ['d03','crop_output','farm_cost','Crop economics may affect expenses','usda'],
   ['d04','farm_cost','drought_issuer','Issuer impacts require geographical operations','sec']],
  ['drought','usda','sec']),
 template('energy-gas-shock','Natural gas → nitrogen fertilizer economics','energy','Fertilizer / Chemicals',
  'U.S. Henry Hub price reference; issuer facilities not mapped',
  'EIA current release cost context only; gas hedge/cost basis not yet joined',
  [['gas_price','Natural gas spot input price','energy_system',0],
   ['feedstock','Ammonia production cost basis','commodity_supply',1],
   ['nitrogen_market','Nitrogen fertilizer supply and pricing','market_balance',2],
   ['chemical_margins','Chemical/fertilizer industry gross margin','industry_cashflow',3],
   ['energy_issuer','Named issuer cost exposure','issuer_exposure',4]],
  [['g01','gas_price','feedstock','Gas price may affect ammonia feedstock cost','eia'],
   ['g02','feedstock','nitrogen_market','Production costs may affect fertilizer supply','usda'],
   ['g03','nitrogen_market','chemical_margins','Price realization, hedges and contracts affect margins','sec'],
   ['g04','chemical_margins','energy_issuer','Issuer segment mix and sourcing must be proven','sec']],
  ['eia','usda','sec']),
 template('sanctions-export','Sanctions → supply alternatives → issuer costs','geopolitical','Global Commodities',
  'Country/entity restrictions and valid-at-date counterparties (unassigned)',
  'Sanctions announcement alone does not prove affected importer or market price',
  [['designation','Effective-dated sanctions change','regulatory_event',0],
   ['trade_routes','Restricted counterparties and shipments','transport_network',1],
   ['commodity_supply','Commodity market supply alternatives','market_balance',2],
   ['sector_costs','Sector input costs and revenue','industry_cashflow',3],
   ['sanction_issuer','Affected issuer and subsidiaries','issuer_exposure',4]],
  [['o01','designation','trade_routes','Restriction may prohibit specific transactions','ofac'],
   ['o02','trade_routes','commodity_supply','Trade rerouting may change commodity availability','trade'],
   ['o03','commodity_supply','sector_costs','Product substitution may change sector economics','trade'],
   ['o04','sector_costs','sanction_issuer','Issuer counterparties and operations need proof','sec']],
  ['ofac','trade','sec']),
 template('hurricane-infrastructure','Hurricane → ports/refineries → insurance','natural_hazard','Energy / Ports / Insurance',
  'Storm track, industrial footprint and insurance policies (unassigned)',
  'NHC track is not proven insured damage or refinery shutdown',
  [['storm_warning','Issued storm warning and forecast','climate_signal',0],
   ['landfall','Observed track, surge and flooding','regional_hazard',1],
   ['port_assets','Verified port/refinery asset footprint','asset_exposure',2],
   ['outages','Observed refinery/port interruption','commodity_supply',3],
   ['storm_issuer','Named issuer insured/operating exposure','issuer_exposure',4]],
  [['h01','storm_warning','landfall','Forecast and observed landfall are distinct','nhc'],
   ['h02','landfall','port_assets','Hazard and real facilities must intersect','noaa'],
   ['h03','port_assets','outages','Operational disruption requires independent confirmation','eia'],
   ['h04','outages','storm_issuer','Company specific impairment needs filings','sec']],
  ['nhc','noaa','eia','sec']),
 template('earthquake-facility','Earthquake → facility → supply','natural_hazard','Industrial Supply Chains',
  'USGS seismic event and facility operating footprint (unassigned)',
  'Earthquake epicenter alone cannot establish a manufacturing disruption',
  [['quake','Observed earthquake event revision','regional_hazard',0],
   ['affected_facilities','Mapped operating facilities','asset_exposure',1],
   ['plant_outage','Verified production outage','commodity_supply',2],
   ['industry_supply','Affected industrial supply','market_balance',3],
   ['quake_issuer','Named issuer asset/segment exposure','issuer_exposure',4]],
  [['q01','quake','affected_facilities','Seismic intensity and site location must overlap','usgs'],
   ['q02','affected_facilities','plant_outage','Damage and outage require company evidence','sec'],
   ['q03','plant_outage','industry_supply','Outage may affect a product market','trade'],
   ['q04','industry_supply','quake_issuer','Issuer economic impact requires segment sourcing','sec']],
  ['usgs','sec','trade']),
 template('critical-minerals','Mineral supply concentration → manufacturers','commodities','Metals / Technology',
  'Mining country, processing location, producer and buyer (unassigned)',
  'Annual mineral production is not an intraday export disruption',
  [['mine_disruption','Mine/export policy change','regulatory_event',0],
   ['mineral_flow','Mineral extraction and trade','commodity_supply',1],
   ['processing','Smelting and processing capacity','asset_exposure',2],
   ['component_market','Input/component availability','market_balance',3],
   ['minerals_issuer','Named downstream manufacturer exposure','issuer_exposure',4]],
  [['m01','mine_disruption','mineral_flow','Export policy may affect availability','usgs'],
   ['m02','mineral_flow','processing','Country processing concentration may constrain output','trade'],
   ['m03','processing','component_market','Refining capacity may affect supply','usgs'],
   ['m04','component_market','minerals_issuer','Company suppliers and prices require evidence','sec']],
  ['usgs','trade','sec']),
 template('maritime-chokepoint','Maritime chokepoint → freight → imported inputs','shipping','Transport / Industrial',
  'Specific route, vessel and unloading port (unassigned)',
  'Requires legally usable route/freight data, not unverified media reports',
  [['marine_event','Official maritime route disruption','transport_network',0],
   ['route_delay','Actual shipping delay and diversion','transport_network',1],
   ['freight_cost','Freight and insurance charges','market_balance',2],
   ['inventory','Importer inventories and lead times','commodity_supply',3],
   ['maritime_issuer','Importer and exporter company exposure','issuer_exposure',4]],
  [['s01','marine_event','route_delay','Shipper routes must actually use chokepoint','ports'],
   ['s02','route_delay','freight_cost','Freight response varies by route and contracts','ports'],
   ['s03','freight_cost','inventory','Lead times depend on alternative inventory','trade'],
   ['s04','inventory','maritime_issuer','Issuer import dependency must be verified','sec']],
  ['ports','trade','sec']),
 template('credit-stress','Credit spreads → refinancing → borrowers','credit','Banks / REITs / Cyclicals',
  'Credit market, issuer maturity calendar and lending counterparty (unassigned)',
  'ALFRED vintages are needed to test original historical credit signals',
  [['macro_credit','Dated credit spread and liquidity indicators','credit_conditions',0],
   ['lending','Borrowing conditions and refinancing availability','credit_conditions',1],
   ['debt_service','Interest expense and maturity obligations','industry_cashflow',2],
   ['credit_issuer','Issuer refinancing and covenant exposure','issuer_exposure',3]],
  [['c01','macro_credit','lending','Spreads may alter refinancing availability','fred'],
   ['c02','lending','debt_service','Terms and maturities determine issuer effects','sec'],
   ['c03','debt_service','credit_issuer','Company debt structure must be independently verified','sec']],
  ['fred','sec']),
 template('public-health-supply','Public health → labor/transport → industry','health','Healthcare / Transportation',
  'Official public-health bulletin and exposed logistics/production regions (unassigned)',
  'Avoid treating observed disease activity as an actual or future market crash',
  [['health_alert','Official issued public health bulletin','health_event',0],
   ['absenteeism','Observed labor availability','labor_supply',1],
   ['logistics','Verified logistics constraints','transport_network',2],
   ['sector_output','Sector sales and operating output','industry_cashflow',3],
   ['health_issuer','Issuer operations and demand exposure','issuer_exposure',4]],
  [['p01','health_alert','absenteeism','Health status may affect labor availability','health'],
   ['p02','absenteeism','logistics','Staffing constraints may change logistics','cdc'],
   ['p03','logistics','sector_output','Transport capacity affects operating economics','trade'],
   ['p04','sector_output','health_issuer','Issuer impacts require business-segment evidence','sec']],
  ['health','cdc','trade','sec'])
];
const LEGACY_META={
 'enso-fertilizer':{eventClass:'climate',industry:'Agriculture / Fertilizer',regions:['argentina-pampas','brazil-south'],commodities:['potash','urea','phosphate'],
  weatherNode:'rainfall',issuerNode:'fert_issuer',currentMode:'RESEARCH_CONTEXT',historicalMode:true,
  providerBindings:['NASA_POWER_MONTHLY_CURRENT_REVISION','FERTILIZER_FUNDAMENTALS_SNAPSHOT','NOAA_CPC_ENSO_DIAGNOSTIC_DISCUSSION']},
 'wildfire-insurance':{eventClass:'natural_hazard',industry:'Insurance / Construction',regions:['california-foothills'],commodities:[],
  weatherNode:'fire_weather',issuerNode:'wildfire_issuer',currentMode:'RESEARCH_CONTEXT',historicalMode:false,
  providerBindings:['NASA_POWER_MONTHLY_CURRENT_REVISION']},
 'snow-hydropower':{eventClass:'climate',industry:'Power / Water / Agriculture',regions:['colorado-high-country'],commodities:[],
  weatherNode:null,issuerNode:'snow_issuer',currentMode:'RESEARCH_CONTEXT',historicalMode:false,
  providerBindings:['NASA_POWER_MONTHLY_CURRENT_REVISION']}
};
const SPECS=Object.freeze([
 ...LEGACY_SPECS.map(x=>({...x,...LEGACY_META[x.id],
  notes:'Existing source-limited pilot. Attached inputs do not validate arrows.',sourceReferences:[]})),
 ...EXTRA.map(x=>{
  if(x.id==='energy-gas-shock')return {...x,regions:['us-energy-market'],currentMode:'DATA_PARTIAL',
   providerBindings:['EIA_API_V2']};
  if(x.id==='drought-agriculture')return {...x,regions:['california-foothills'],weatherNode:'drought_outlook',
   currentMode:'DATA_PARTIAL',providerBindings:['NASA_POWER_MONTHLY_CURRENT_REVISION']};
  return x;
 })
]);
const clone=x=>structuredClone(x);
export function validateScenarioSpec(spec){
 if(!spec||typeof spec!=='object'||!SAFE_ID.test(spec.id)||typeof spec.title!=='string'||!spec.title.trim()||
  !CLASSES.has(spec.eventClass)||!Array.isArray(spec.nodes)||spec.nodes.length<2||spec.nodes.length>24||
  !Array.isArray(spec.edges)||spec.edges.length<1||spec.edges.length>36||
  !Array.isArray(spec.regions)||spec.regions.length<1||spec.regions.length>10||
  !Array.isArray(spec.commodities)||spec.commodities.length>10||
  !['RESEARCH_CONTEXT','DATA_PARTIAL','TEMPLATE_ONLY'].includes(spec.currentMode)||
  typeof spec.historicalMode!=='boolean')throw new TypeError('Invalid bounded scenario definition');
 if(spec.nodes.some(n=>!Array.isArray(n)||n.length!==5||!SAFE_ID.test(n[0])||
  typeof n[1]!=='string'||!TYPES.has(n[2])||!Number.isInteger(n[3])||n[3]<0||n[3]>20||
  typeof n[4]!=='string'||n[4].length<10))throw new TypeError('Invalid typed scenario node');
 const nodes=new Map(spec.nodes.map(n=>[n[0],n]));if(nodes.size!==spec.nodes.length)throw new TypeError('Duplicate node ID');
 if(spec.edges.some(e=>!Array.isArray(e)||e.length!==5||!SAFE_ID.test(e[0])||!nodes.has(e[1])||
  !nodes.has(e[2])||nodes.get(e[1])[3]>=nodes.get(e[2])[3]||
  typeof e[3]!=='string'||e[3].length<10||!SAFE_ID.test(e[4])))throw new TypeError('Unsupported scenario edge');
 if(new Set(spec.edges.map(e=>e[0])).size!==spec.edges.length)throw new TypeError('Duplicate edge ID');
 if(spec.regions.some(x=>!SAFE_ID.test(x))||spec.commodities.some(x=>!SAFE_ID.test(x))||
  spec.weatherNode!==null&&!nodes.has(spec.weatherNode)||
  spec.issuerNode!==null&&!nodes.has(spec.issuerNode))throw new TypeError('Invalid scoped region/commodity/node mapping');
 if(!Array.isArray(spec.providerBindings)||spec.providerBindings.length>12||
  !Array.isArray(spec.sourceReferences)||spec.sourceReferences.some(x=>!SOURCES[x]))throw new TypeError('Invalid allowed provider references');
 if(!spec.caseId&&spec.edges.some(e=>!SOURCES[e[4]]))throw new TypeError('New scenario references an unsupported source');
 if(spec.currentMode==='TEMPLATE_ONLY'&&spec.providerBindings.length)throw new TypeError('Templates cannot claim connected providers');
 return true;
}
export function createScenarioRegistry({specs=SPECS}={}){
 if(!Array.isArray(specs)||specs.length>40)throw new TypeError('Scenario catalog size exceeds bounded limit');
 const items=specs.map(x=>clone(x));
 const ids=new Set();
 for(const item of items){validateScenarioSpec(item);if(ids.has(item.id))throw new TypeError('Duplicate scenario ID');ids.add(item.id);}
 const descriptions=items.map(item=>({
  id:item.id,title:item.title,eventClass:item.eventClass,industry:item.industry,
  regionScope:item.regionScope,regions:clone(item.regions),commodities:clone(item.commodities),
  currentMode:item.currentMode,historicalMode:item.historicalMode,
  providerBindings:clone(item.providerBindings),
  nodeCount:item.nodes.length,edgeCount:item.edges.length,
  notes:item.notes,availability:item.currentMode==='TEMPLATE_ONLY'?'TEMPLATE_ONLY':'SOURCE_CONTEXT_ONLY'
 }));
 return {
  catalog({eventClass=null,availability=null,industry=null}={}){
   if(eventClass!==null&&!CLASSES.has(eventClass))throw new TypeError('Unsupported event class');
   if(availability!==null&&!['TEMPLATE_ONLY','SOURCE_CONTEXT_ONLY'].includes(availability))throw new TypeError('Unsupported availability');
   if(industry!==null&&(typeof industry!=='string'||industry.length>70))throw new TypeError('Invalid industry filter');
   return {schemaVersion:1,registryVersion:'scenario-registry-v1',scenarioCount:items.length,
    eventClasses:[...new Set(items.map(x=>x.eventClass))],
    scenarios:clone(descriptions.filter(x=>(eventClass===null||x.eventClass===eventClass)&&
     (availability===null||x.availability===availability)&&
     (industry===null||x.industry.toLowerCase().includes(industry.toLowerCase())))),
    disclaimers:['A template is a planned causal research hypothesis, not an operational source pipeline.',
     'Current source context does not verify an event-specific causal edge, quantitative impact or backtested forecast.']};
  },
  get(id){const x=items.find(s=>s.id===id);return x?clone(x):null;},
  source(id){return SOURCES[id]?clone(SOURCES[id]):null;}
 };
}
export const SCENARIO_REGISTRY=createScenarioRegistry();
