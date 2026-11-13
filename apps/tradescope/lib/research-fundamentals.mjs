/** Dated SEC research metrics. No raw companyfacts records or credentials leave
 * this module. Unknown, incompatible and unsupported inputs remain unavailable.
 */
import {summarizeCompanyFacts} from './fundamentals.mjs';
import {validEventTimestamp} from './market-events.mjs';

const VERSION = 'sec-research-v1';
const DAY = 86400000;
const SOURCE = 'SEC_EDGAR_XBRL';
const FORMS = new Set(['10-Q','10-K','10-Q/A','10-K/A']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
const dateMs = value => Date.parse(`${value}T00:00:00Z`);
const days = (start,end) => (dateMs(end)-dateMs(start))/DAY;
const addDays = (value,count) => new Date(dateMs(value)+count*DAY).toISOString().slice(0,10);
const previousYear = value => {const date=new Date(`${value}T00:00:00Z`);date.setUTCFullYear(date.getUTCFullYear()-1);return date.toISOString().slice(0,10);};
const round = value => finite(value) ? Number(value.toFixed(6)) : null;
const safeText = (value,max=200) => typeof value === 'string' ? value.slice(0,max) : null;
// Only these standard company-total revenue aliases may share an arithmetic
// series. Goods-only/service-only sales are a different scope, even when their
// units, fiscal dates and filing dates match a total-revenue observation.
const TOTAL_REVENUE_TAGS = Object.freeze(['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet']);
const tags = {
  revenue:TOTAL_REVENUE_TAGS,
  netIncome:['NetIncomeLoss'], eps:['EarningsPerShareDiluted'],
  operatingCashFlow:['NetCashProvidedByUsedInOperatingActivities'],
  capex:['PaymentsToAcquirePropertyPlantAndEquipment'],
  cash:['CashAndCashEquivalentsAtCarryingValue'],
  equity:['StockholdersEquity'], assets:['Assets'],
  currentAssets:['AssetsCurrent'], currentLiabilities:['LiabilitiesCurrent'],
  totalDebt:['DebtAndFinanceLeaseObligations','DebtAndCapitalLeaseObligations'],
  currentDebt:['DebtCurrent'],
  shortDebt:['ShortTermBorrowings'],
  longDebt:['LongTermDebt'], longCurrent:['LongTermDebtCurrent'], longNoncurrent:['LongTermDebtNoncurrent'],
};

const definitions = [
  ['financial.revenueQuarter','Quarterly revenue','Growth','USD','Most recent reported standalone fiscal-quarter company-total revenue; goods-only sales are excluded.',['revenue_quarter']],
  ['financial.revenueGrowthYoYPct','Quarterly revenue YoY','Growth','percent','Company-total revenue change from a comparable prior-year quarter; a nonpositive base is unavailable.',['revenue_quarter','revenue_prior_year_quarter']],
  ['financial.netIncomeQuarter','Quarterly net income','Profitability','USD','Most recent reported standalone fiscal-quarter net income.',['net_income_quarter']],
  ['financial.epsQuarter','Quarterly diluted EPS','Growth','USD/share','Reported standalone quarterly diluted earnings per share.',['diluted_eps_quarter']],
  ['financial.grossMarginPct','Gross margin','Profitability','percent','Gross profit divided by revenue for identical fiscal periods and units.',['gross_profit_quarter','revenue_quarter']],
  ['financial.operatingMarginPct','Operating margin','Profitability','percent','Operating profit divided by revenue for identical fiscal periods and units.',['operating_income_quarter','revenue_quarter']],
  ['financial.netMarginPct','Net margin','Profitability','percent','Net income divided by revenue for identical fiscal periods and units.',['net_income_quarter','revenue_quarter']],
  ['financial.revenueTTM','Revenue TTM','Growth','USD','Latest compatible trailing-year company-total revenue; partial goods/service sales are excluded.',['revenue_duration_facts']],
  ['financial.netIncomeTTM','Net income TTM','Profitability','USD','Latest compatible trailing-year reported net income.',['net_income_duration_facts']],
  ['financial.epsTTM','Diluted EPS TTM','Growth','USD/share','Reported full-year diluted EPS or four reported standalone-quarter EPS values; annual/YTD EPS is not subtracted.',['diluted_eps_duration_facts']],
  ['financial.operatingCashFlowTTM','Operating cash flow TTM','Cash Flow','USD','Trailing-year cash from operations using compatible annual/YTD or contiguous-quarter facts.',['operating_cash_flow_duration_facts']],
  ['financial.capexTTM','Capital expenditure TTM','Cash Flow','USD','Positive cash payments for property, plant and equipment over a compatible trailing year.',['capex_duration_facts']],
  ['financial.freeCashFlowTTM','Free cash flow TTM','Cash Flow','USD','Operating cash flow less capital expenditure for the same trailing period.',['operating_cash_flow_ttm','capex_ttm']],
  ['financial.freeCashFlowMarginPct','Free cash flow margin','Cash Flow','percent','Free cash flow divided by positive revenue for exactly the same trailing period.',['free_cash_flow_ttm','revenue_ttm']],
  ['financial.cash','Cash and equivalents','Financial Health','USD','Latest reported unrestricted cash and cash equivalents; restricted cash is not silently substituted.',['cash_instant']],
  ['financial.debt','Supported total debt','Financial Health','USD','Supported reported aggregate debt or complete, non-overlapping current/noncurrent borrowing components.',['debt_instant_facts']],
  ['financial.netDebt','Net debt','Financial Health','USD','Supported debt less unrestricted cash at the same balance-sheet date.',['debt_instant','cash_instant']],
  ['financial.equity','Shareholders equity','Financial Health','USD','Latest reported parent-company shareholders equity.',['equity_instant']],
  ['financial.assets','Total assets','Financial Health','USD','Latest reported total assets.',['assets_instant']],
  ['financial.currentAssets','Current assets','Financial Health','USD','Latest reported current assets.',['current_assets_instant']],
  ['financial.currentLiabilities','Current liabilities','Financial Health','USD','Latest reported current liabilities.',['current_liabilities_instant']],
  ['financial.currentRatio','Current ratio','Financial Health','ratio','Current assets divided by positive current liabilities at the same balance-sheet date.',['current_assets_instant','current_liabilities_instant']],
  ['financial.debtEquity','Debt / equity','Financial Health','ratio','Supported debt divided by positive parent-company equity at the same date.',['debt_instant','equity_instant']],
  ['financial.roePct','Return on average equity','Profitability','percent','Trailing-year net income divided by the mean of positive beginning and ending equity at matching endpoints.',['net_income_ttm','equity_beginning','equity_ending']],
  ['valuation.peTTM','P/E TTM','Valuation','ratio','Provided dated closing price divided by positive compatible trailing diluted EPS.',['dated_price','diluted_eps_ttm']],
  ['valuation.priceBook','Price / book','Valuation','ratio','Dated price times last disclosed unambiguous shares divided by positive latest book equity. Input dates remain explicit.',['dated_price','shares','equity']],
  ['valuation.priceSalesTTM','Price / sales TTM','Valuation','ratio','Dated price times last disclosed unambiguous shares divided by positive trailing revenue.',['dated_price','shares','revenue_ttm']],
  ['valuation.marketCap','Estimated market capitalization','Valuation','USD','Provided dated price times the last disclosed unambiguous share count; not real-time float or enterprise value.',['dated_price','shares']],
  ['valuation.enterpriseValue','Estimated enterprise value','Valuation','USD','Estimated market capitalization plus supported debt less cash, with matching debt/cash dates.',['market_cap','debt','cash']],
  ['valuation.evEbitda','EV / EBITDA','Valuation','ratio','Unavailable until a compatible, versioned EBITDA definition and source inputs are integrated.',['enterprise_value','compatible_ebitda']],
  ['valuation.forwardPE','Forward P/E','Valuation','ratio','Requires a separately sourced and dated forward earnings estimate.',['dated_price','forward_consensus_eps']],
  ['valuation.peg','PEG','Valuation','ratio','Requires a defined earnings-growth horizon and a compatible consensus-estimates source.',['pe','compatible_consensus_growth']],
];

export const FINANCIAL_DEFINITIONS = Object.freeze(definitions.map(([id,label,group,unit,description,inputs]) =>
  Object.freeze({id,label,group,unit,description,inputs:Object.freeze(inputs),methodVersion:VERSION})));
const DEFINITION_MAP = new Map(FINANCIAL_DEFINITIONS.map(definition=>[definition.id,definition]));

function collect(payload,names,unit,asOf,{namespace='us-gaap',instant=false}={}) {
  return names.flatMap((tag,priority)=>{
    const records=payload?.facts?.[namespace]?.[tag]?.units?.[unit];
    if(!Array.isArray(records))return [];
    return records.flatMap((record,index)=>{
      if(!record || typeof record!=='object' || Array.isArray(record) || !finite(record.val) ||
          !validDate(record.end) || !validDate(record.filed) || record.end>asOf || record.filed>asOf ||
          !FORMS.has(record.form) || record.segment || record.dimensions || record.dimension)return [];
      if(instant){if(record.start)return [];}
      else if(!validDate(record.start) || record.start>record.end || days(record.start,record.end)>380)return [];
      return [{val:record.val,start:instant?null:record.start,end:record.end,filed:record.filed,
        form:record.form,accn:typeof record.accn==='string'&&/^\d{10}-\d{2}-\d{6}$/.test(record.accn)?record.accn:null,
        tag,namespace,unit,priority,index}];
    });
  });
}
const sortFact=(a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed)||a.priority-b.priority||a.index-b.index;
const sortKnown=(a,b)=>b.filed.localeCompare(a.filed)||a.priority-b.priority||a.index-b.index;
function uniquePeriods(records) {
  const selected=new Map();
  for(const record of [...records].sort(sortKnown)){
    const key=`${record.start}|${record.end}`;
    if(!selected.has(key))selected.set(key,record);
  }
  return [...selected.values()].sort(sortFact);
}
function inputDetails(facts) {
  const unique=new Map();
  for(const fact of facts||[])if(fact)unique.set(`${fact.namespace}|${fact.tag}|${fact.start}|${fact.end}|${fact.filed}|${fact.accn}`,fact);
  return [...unique.values()].map(fact=>({namespace:fact.namespace,tag:fact.tag,unit:fact.unit,
    periodStart:fact.start,periodEnd:fact.end,filingDate:fact.filed,form:fact.form,accession:fact.accn}));
}
function reported(fact,method='reported-fact') {
  return fact?{value:fact.val,start:fact.start,end:fact.end,inputFacts:[fact],method,sampleCount:1,requiredCount:1}:null;
}
function annualFact(record){return record.start && days(record.start,record.end)>=330 && days(record.start,record.end)<=380;}
function quarterFact(record){return record.start && days(record.start,record.end)>=70 && days(record.start,record.end)<=110;}

/** Quarter derivation applies only to additive dollar flows, never to EPS. */
function quarterCandidates(records,allowDerived) {
  const quarters=uniquePeriods(records.filter(quarterFact)).map(fact=>({...reported(fact),derived:false}));
  if(!allowDerived)return quarters;
  for(const current of records){
    if(days(current.start,current.end)<=110)continue;
    const prior=records.filter(candidate=>candidate.start===current.start && candidate.end<current.end &&
      days(addDays(candidate.end,1),current.end)>=70 && days(addDays(candidate.end,1),current.end)<=110).sort(sortFact)[0];
    if(!prior)continue;
    const start=addDays(prior.end,1);
    if(quarters.some(quarter=>quarter.start===start && quarter.end===current.end && !quarter.derived))continue;
    quarters.push({value:current.val-prior.val,start,end:current.end,inputFacts:[current,prior],
      method:annualFact(current)?'annual-minus-ytd':'ytd-difference',sampleCount:2,requiredCount:2,derived:true});
  }
  return quarters;
}
function contiguousFour(quarters,latestEnd) {
  const byEnd=new Map();
  for(const quarter of quarters){
    if(!byEnd.has(quarter.end))byEnd.set(quarter.end,[]);
    byEnd.get(quarter.end).push(quarter);
  }
  for(const group of byEnd.values())group.sort((a,b)=>Number(a.derived)-Number(b.derived)||
    Math.max(...b.inputFacts.map(f=>dateMs(f.filed)))-Math.max(...a.inputFacts.map(f=>dateMs(f.filed))));
  function walk(end,chain){
    if(chain.length===4){
      const ordered=[...chain].reverse(),span=days(ordered[0].start,ordered[3].end);
      return span>=330&&span<=380?ordered:null;
    }
    for(const quarter of (byEnd.get(end)||[]).slice(0,12)){
      const found=walk(addDays(quarter.start,-1),[...chain,quarter]);if(found)return found;
    }
    return null;
  }
  return walk(latestEnd,[]);
}
function trailingYear(records,{eps=false}={}) {
  const series=uniquePeriods(records.filter(record=>days(record.start,record.end)>=70));
  if(!series.length)return null;
  const end=series[0].end;
  const annual=series.find(record=>record.end===end&&annualFact(record));
  if(annual)return {...reported(annual,'reported-full-year'),requiredCount:1};
  const direct=contiguousFour(quarterCandidates(series,false),end);
  if(direct)return {value:direct.reduce((sum,q)=>sum+q.value,0),start:direct[0].start,end,
    inputFacts:direct.flatMap(q=>q.inputFacts),method:eps?'sum-four-reported-quarter-eps':'sum-four-reported-quarters',sampleCount:4,requiredCount:4};
  // EPS annual/YTD subtraction is invalid when diluted weighted shares change.
  if(eps)return null;
  const annuals=series.filter(record=>annualFact(record)&&record.end<end);
  for(const base of annuals){
    const current=series.find(record=>record.start===addDays(base.end,1)&&record.end===end&&days(record.start,record.end)<=330);
    if(!current)continue;
    const priorTarget=previousYear(current.end);
    const prior=series.filter(record=>record.start===base.start&&record.end<base.end&&
      Math.abs(days(record.end,priorTarget))<=14&&Math.abs(days(record.start,record.end)-days(current.start,current.end))<=14)
      .sort((a,b)=>Math.abs(days(a.end,priorTarget))-Math.abs(days(b.end,priorTarget))||sortKnown(a,b))[0];
    if(!prior)continue;
    const start=addDays(prior.end,1);
    if(days(start,end)<330||days(start,end)>380)continue;
    return {value:base.val+current.val-prior.val,start,end,inputFacts:[base,current,prior],
      method:'annual-plus-current-ytd-minus-prior-ytd',sampleCount:3,requiredCount:3};
  }
  const chain=contiguousFour(quarterCandidates(series,true),end);
  return chain?{value:chain.reduce((sum,q)=>sum+q.value,0),start:chain[0].start,end,inputFacts:chain.flatMap(q=>q.inputFacts),
    method:'sum-four-compatible-derived-quarters',sampleCount:4,requiredCount:4}:null;
}

function compatible(a,b){return a&&b&&a.start===b.start&&a.end===b.end;}
function combine(a,b,operation,method){
  if(!compatible(a,b))return null;
  return {value:operation(a.value,b.value),start:a.start,end:a.end,inputFacts:[...a.inputFacts,...b.inputFacts],method,
    sampleCount:a.sampleCount+b.sampleCount,requiredCount:a.requiredCount+b.requiredCount};
}
function reportedDebt(series) {
  const all=Object.values(series).flat().sort(sortFact);
  if(!all.length)return null;
  // Do not fall back to a stale aggregate if a newer partial debt report exists.
  const end=all[0].end;
  const at=key=>(series[key]||[]).filter(fact=>fact.end===end).sort(sortKnown)[0]||null;
  const aggregate=at('totalDebt');
  if(aggregate&&aggregate.val>=0)return reported(aggregate,'reported-total-debt');
  const combinations=[['currentDebt','longNoncurrent'],['shortDebt','longDebt'],['shortDebt','longCurrent','longNoncurrent']];
  for(const components of combinations){
    const facts=components.map(at);
    if(facts.every(fact=>fact&&fact.val>=0))return {value:facts.reduce((sum,fact)=>sum+fact.val,0),start:null,end,
      inputFacts:facts,method:`non-overlapping-debt-components:${components.join('+')}`,sampleCount:facts.length,requiredCount:facts.length};
  }
  return null;
}
function sharesRecord(payload,asOf) {
  const records=[...collect(payload,['CommonStockSharesOutstanding'],'shares',asOf,{instant:true}),
    ...collect(payload,['EntityCommonStockSharesOutstanding'],'shares',asOf,{namespace:'dei',instant:true})]
    .filter(fact=>fact.val>0&&Number.isSafeInteger(fact.val)).sort(sortFact);
  if(!records.length)return {record:null,reason:'A positive, unambiguous reported share count is unavailable.'};
  const latest=records[0],sameDisclosure=records.filter(fact=>fact.end===latest.end&&fact.filed===latest.filed);
  if(new Set(sameDisclosure.map(fact=>fact.val)).size>1)return {record:null,reason:'Conflicting share counts at the same disclosure date may represent different share classes.'};
  return {record:latest,reason:null};
}

/** Returned as-of is a date-level knowledge cutoff, not an intraday backtest.
 * Supplied market price must have its own valid date; no latest-price guess.
 */
export function buildFinancialMetrics(companyFacts,{symbol,asOf=new Date().toISOString().slice(0,10),price=null,priceAsOf=null,
  fetchedAt=null,priceSource='PROVIDED_MARKET_PRICE'}={}) {
  if(!validDate(asOf))throw new TypeError('Financial asOf must be a valid YYYY-MM-DD date');
  const payload=companyFacts&&typeof companyFacts==='object'&&!Array.isArray(companyFacts)?companyFacts:{};
  const summaryInput={cik:payload.cik,entityName:payload.entityName,facts:{'us-gaap':{}}};
  for(const [names,unit] of [[tags.revenue,'USD'],[tags.netIncome,'USD'],[tags.eps,'USD/shares'],[['GrossProfit'],'USD'],[['OperatingIncomeLoss'],'USD']]){
    for(const tag of names)summaryInput.facts['us-gaap'][tag]={units:{[unit]:collect(payload,[tag],unit,asOf)}};
  }
  const summary=summarizeCompanyFacts(summaryInput,asOf),observations=[];
  const flow={};
  for(const key of ['revenue','netIncome','eps','operatingCashFlow','capex'])flow[key]=collect(payload,tags[key],key==='eps'?'USD/shares':'USD',asOf);
  const instant={};
  for(const key of ['cash','equity','assets','currentAssets','currentLiabilities'])instant[key]=collect(payload,tags[key],'USD',asOf,{instant:true});
  const debtSeries={};for(const key of ['totalDebt','currentDebt','shortDebt','longDebt','longCurrent','longNoncurrent'])debtSeries[key]=collect(payload,tags[key],'USD',asOf,{instant:true});
  function put(id,result,{status='missing_data',reason='Required compatible reported facts are unavailable.',details={},source=SOURCE,sampleCount=0,requiredCount=1}={}) {
    const definition=DEFINITION_MAP.get(id);
    const value=result&&finite(result.value)?round(result.value):null;
    const inputs=inputDetails(result?.inputFacts||[]);
    observations.push({id,value,status:value!==null?'available':status,reason:value!==null?null:reason,unit:definition.unit,source,
      asOf,availableAt:validEventTimestamp(fetchedAt)||validDate(fetchedAt)?fetchedAt:null,periodStart:result?.start??null,periodEnd:result?.end??null,
      methodVersion:VERSION,sampleCount:result?.sampleCount??sampleCount,requiredCount:result?.requiredCount??requiredCount,
      details:{symbol:typeof symbol==='string'?symbol:null,knowledgeCutoff:asOf,knowledgePrecision:'filing-date',
        calculation:result?.method??null,inputs,tags:[...new Set(inputs.map(input=>input.tag))],
        filingDates:[...new Set(inputs.map(input=>input.filingDate))],...details}});
  }
  function quarterResult(field,seriesKey){
    const selected=summary.quarterly[field];if(!finite(selected?.value))return null;
    const fact=flow[seriesKey]?.find(fact=>fact.tag===selected.tag&&fact.start===selected.periodStart&&fact.end===selected.periodEnd&&fact.filed===selected.filingDate);
    return fact?reported(fact,'reported-standalone-quarter'):null;
  }
  const revenueQuarter=quarterResult('revenue','revenue'),netQuarter=quarterResult('netIncome','netIncome'),epsQuarter=quarterResult('epsDiluted','eps');
  put('financial.revenueQuarter',revenueQuarter);put('financial.netIncomeQuarter',netQuarter);put('financial.epsQuarter',epsQuarter);
  const revenue=summary.quarterly.revenue;
  const priorRevenue=revenueQuarter&&[...flow.revenue].sort(sortKnown).find(fact=>fact.tag===revenue.priorYearTag&&fact.end===revenue.priorYearPeriodEnd&&quarterFact(fact)&&fact.val===revenue.priorYearValue);
  const comparable=priorRevenue&&Math.abs(days(priorRevenue.start,priorRevenue.end)-days(revenueQuarter.start,revenueQuarter.end))<=14;
  const growth=comparable&&priorRevenue.val>0?{...revenueQuarter,value:(revenueQuarter.value/priorRevenue.val-1)*100,
    inputFacts:[...revenueQuarter.inputFacts,priorRevenue],method:'comparable-quarter-yoy',sampleCount:2,requiredCount:2}:null;
  put('financial.revenueGrowthYoYPct',growth,{status:priorRevenue&&!comparable?'period_mismatch':'missing_data',
    reason:priorRevenue?.val<=0?'Prior-year revenue must be positive.':'A comparable prior-year revenue quarter is unavailable.',
    sampleCount:revenueQuarter?1:0,requiredCount:2});
  const marginPairs=[['financial.grossMarginPct','quarterGrossMarginPct','grossProfit'],['financial.operatingMarginPct','quarterOperatingMarginPct','operatingIncome'],['financial.netMarginPct','quarterNetMarginPct','netIncome']];
  for(const [id,key,numerator] of marginPairs){
    const quality=summary.ratioQuality[key],value=summary.ratios[key],fact=summary.quarterly[numerator];
    const numeratorFact=fact.tag?collect(payload,[fact.tag],fact.unit,asOf).find(item=>item.start===fact.periodStart&&item.end===fact.periodEnd&&item.filed===fact.filingDate):null;
    const result=finite(value)&&revenueQuarter&&numeratorFact?{...revenueQuarter,value,inputFacts:[...revenueQuarter.inputFacts,numeratorFact],method:'matched-quarter-margin',sampleCount:2,requiredCount:2}:null;
    put(id,result,{status:quality.reason==='period_mismatch'?'period_mismatch':'missing_data',reason:quality.message,
      details:{numerator:{tag:fact.tag,periodStart:fact.periodStart,periodEnd:fact.periodEnd,filingDate:fact.filingDate,unit:fact.unit},denominator:{tag:revenue.tag,periodStart:revenue.periodStart,periodEnd:revenue.periodEnd,filingDate:revenue.filingDate,unit:revenue.unit}}});
  }
  const ttm={};
  const ttmIDs={revenue:'financial.revenueTTM',netIncome:'financial.netIncomeTTM',eps:'financial.epsTTM',operatingCashFlow:'financial.operatingCashFlowTTM',capex:'financial.capexTTM'};
  for(const [key,id] of Object.entries(ttmIDs)){
    let result=trailingYear(flow[key],{eps:key==='eps'});
    if(key==='capex'&&result&&result.value<0)result=null;
    ttm[key]=result;
    put(id,result,{status:flow[key].length?'insufficient_data':'missing_data',requiredCount:4,sampleCount:Math.min(3,flow[key].filter(quarterFact).length),
      reason:key==='eps'?'Need a reported full-year diluted EPS or four contiguous reported standalone EPS quarters; annual/YTD EPS is not safely subtracted.':key==='capex'?'Need a compatible trailing year of nonnegative reported PP&E cash payments.':'Need a reported full year, compatible annual/current-YTD/prior-YTD facts, or four contiguous fiscal quarters.'});
  }
  const fcf=combine(ttm.operatingCashFlow,ttm.capex,(cash,capex)=>cash-capex,'operating-cash-flow-minus-capex');
  put('financial.freeCashFlowTTM',fcf,{status:ttm.operatingCashFlow&&ttm.capex?'period_mismatch':'missing_data',reason:'Operating cash flow and capital expenditure need the same trailing fiscal period.'});
  const fcfMargin=ttm.revenue?.value>0?combine(fcf,ttm.revenue,(cash,sales)=>cash/sales*100,'matched-ttm-free-cash-flow-margin'):null;
  put('financial.freeCashFlowMarginPct',fcfMargin,{status:fcf&&ttm.revenue&&!compatible(fcf,ttm.revenue)?'period_mismatch':'missing_data',reason:'Free cash flow needs a matching positive trailing revenue denominator.'});
  const balance={};
  for(const [key,id] of Object.entries({cash:'financial.cash',equity:'financial.equity',assets:'financial.assets',currentAssets:'financial.currentAssets',currentLiabilities:'financial.currentLiabilities'})){
    const fact=[...instant[key]].sort(sortFact)[0];
    balance[key]=reported(fact,'reported-balance-sheet-instant');put(id,balance[key]);
  }
  balance.debt=reportedDebt(debtSeries);
  put('financial.debt',balance.debt,{reason:'Need a reported total-debt aggregate or complete non-overlapping debt components at one date; missing short-term borrowing is not assumed zero.'});
  const netDebt=combine(balance.debt,balance.cash,(debt,cash)=>debt-cash,'same-date-debt-minus-unrestricted-cash');
  put('financial.netDebt',netDebt,{status:balance.debt&&balance.cash?'period_mismatch':'missing_data',reason:'Supported debt and cash must use the same balance-sheet date.'});
  const currentRatio=balance.currentLiabilities?.value>0?combine(balance.currentAssets,balance.currentLiabilities,(assets,liabilities)=>assets/liabilities,'same-date-current-ratio'):null;
  put('financial.currentRatio',currentRatio,{status:balance.currentAssets&&balance.currentLiabilities&&!compatible(balance.currentAssets,balance.currentLiabilities)?'period_mismatch':'missing_data',reason:'Current assets and positive current liabilities are required at the same date.'});
  const debtEquity=balance.equity?.value>0?combine(balance.debt,balance.equity,(debt,equity)=>debt/equity,'same-date-debt-to-equity'):null;
  put('financial.debtEquity',debtEquity,{status:balance.debt&&balance.equity&&!compatible(balance.debt,balance.equity)?'period_mismatch':'missing_data',reason:'Supported debt and positive equity are required at the same date.'});
  let roe=null;
  if(ttm.netIncome){
    const beginning=instant.equity.filter(fact=>fact.end===addDays(ttm.netIncome.start,-1)).sort(sortKnown)[0];
    const ending=instant.equity.filter(fact=>fact.end===ttm.netIncome.end).sort(sortKnown)[0];
    if(beginning?.val>0&&ending?.val>0)roe={...ttm.netIncome,value:ttm.netIncome.value/((beginning.val+ending.val)/2)*100,
      inputFacts:[...ttm.netIncome.inputFacts,beginning,ending],method:'ttm-net-income-over-average-endpoint-equity',sampleCount:ttm.netIncome.sampleCount+2,requiredCount:ttm.netIncome.requiredCount+2};
  }
  put('financial.roePct',roe,{reason:'Need compatible trailing net income and positive equity at the exact beginning and ending balance-sheet dates.'});
  const priceDate=validDate(priceAsOf)?priceAsOf:validEventTimestamp(priceAsOf)?new Date(priceAsOf).toISOString().slice(0,10):null;
  const validPrice=finite(price)&&price>0&&priceDate&&priceDate<=asOf;
  const valuationSource=`${SOURCE} + ${safeText(priceSource,100)||'PROVIDED_MARKET_PRICE'}`;
  const priceDetails={price:validPrice?price:null,priceAsOf:priceDate,priceSource:safeText(priceSource,100),priceBasis:'provided dated market price; last disclosed accounting inputs, not live share float'};
  const shares=sharesRecord(payload,asOf);
  const marketCap=validPrice&&shares.record?{...reported(shares.record),value:price*shares.record.val,method:'dated-price-times-last-disclosed-shares'}:null;
  put('valuation.marketCap',marketCap,{source:valuationSource,reason:!validPrice?'A positive market price with a valid nonfuture as-of date is required.':shares.reason,details:{...priceDetails,shares:shares.record?.val??null,sharesAsOf:shares.record?.end??null}});
  const pe=validPrice&&ttm.eps?.value>0?{...ttm.eps,value:price/ttm.eps.value,method:'dated-price-over-positive-trailing-diluted-eps'}:null;
  put('valuation.peTTM',pe,{source:valuationSource,reason:'A dated positive price and compatible positive trailing diluted EPS are required.',details:priceDetails});
  const book=marketCap&&balance.equity?.value>0?{...balance.equity,value:marketCap.value/balance.equity.value,inputFacts:[...marketCap.inputFacts,...balance.equity.inputFacts],method:'estimated-market-cap-over-last-reported-equity',sampleCount:2,requiredCount:2}:null;
  put('valuation.priceBook',book,{source:valuationSource,reason:'Need dated market price, an unambiguous reported share count and positive book equity.',details:priceDetails});
  const sales=marketCap&&ttm.revenue?.value>0?{...ttm.revenue,value:marketCap.value/ttm.revenue.value,inputFacts:[...marketCap.inputFacts,...ttm.revenue.inputFacts],method:'estimated-market-cap-over-trailing-revenue',sampleCount:ttm.revenue.sampleCount+1,requiredCount:ttm.revenue.requiredCount+1}:null;
  put('valuation.priceSalesTTM',sales,{source:valuationSource,reason:'Need dated market price, an unambiguous share count and positive trailing revenue.',details:priceDetails});
  const ev=marketCap&&netDebt?{...netDebt,value:marketCap.value+netDebt.value,inputFacts:[...marketCap.inputFacts,...netDebt.inputFacts],method:'estimated-market-cap-plus-same-date-net-debt',sampleCount:netDebt.sampleCount+1,requiredCount:netDebt.requiredCount+1}:null;
  put('valuation.enterpriseValue',ev,{source:valuationSource,reason:'Need an estimated market capitalization and supported debt/cash at a matching balance-sheet date.',details:priceDetails});
  put('valuation.evEbitda',null,{status:'unsupported',reason:'A compatible, versioned EBITDA calculation and depreciation/amortization inputs are not integrated.'});
  put('valuation.forwardPE',null,{status:'unsupported',reason:'No dated analyst-consensus or forward earnings provider is configured; reported quarter EPS is not a forward estimate.'});
  put('valuation.peg',null,{status:'unsupported',reason:'No compatible forward earnings-growth horizon/consensus provider is configured; reported YoY growth is not substituted.'});
  return {observations,company:{symbol:typeof symbol==='string'?symbol:null,cik:/^\d+$/.test(String(payload.cik??''))?String(payload.cik):null,name:safeText(payload.entityName)},asOf,
    quality:{source:SOURCE,available:observations.filter(observation=>observation.status==='available').length,total:observations.length,
      knowledgePrecision:'filing-date',notes:['Only supported company-level US-GAAP facts and units are used.','Revenue arithmetic uses supported company-total tags; goods-only and services-only sales are excluded.','Latest balance-sheet dates may differ; combined balance-sheet ratios require exact matching dates.','TTM is not a latest-quarter annualization; missing fiscal history remains unavailable.','Estimates and ambiguous share classes are not fabricated.']},
    methodology:{version:VERSION,ttmDollarFlows:['reported-full-year','sum-four-reported-quarters','annual-plus-current-ytd-minus-prior-ytd','sum-four-compatible-derived-quarters'],
      revenue:{scope:'company-total',supportedTags:[...TOTAL_REVENUE_TAGS],excludedScopes:['goods-only','services-only','custom or dimensional revenue']},
      eps:'Reported full-year or sum of four reported standalone diluted quarters; no annual/YTD EPS subtraction.',debt:'Supported total aggregate or complete, non-overlapping same-date borrowing components.',roe:'Trailing income divided by average positive beginning/end equity.',valuation:'Provided dated price and last disclosed inputs; all input dates are preserved.'}};
}
