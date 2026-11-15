import test from 'node:test';
import assert from 'node:assert/strict';
import {FINANCIAL_DEFINITIONS,buildFinancialMetrics} from '../lib/research-fundamentals.mjs';

const AS_OF='2026-11-12';
const duration=(val,start,end,filed='2026-10-28',form='10-Q',extra={})=>({val,start,end,filed,form,...extra});
const instant=(val,end='2026-09-30',filed='2026-10-28',extra={})=>({val,end,filed,form:'10-Q',...extra});
const facts=(items,unit='USD')=>({units:{[unit]:items}});
const payload=(gaap={},dei={})=>({cik:789019,entityName:'Controlled Issuer',facts:{'us-gaap':gaap,dei}});
const run=(gaap,options={},dei={})=>buildFinancialMetrics(payload(gaap,dei),{symbol:'MSFT',asOf:AS_OF,fetchedAt:'2026-11-12T22:00:00Z',...options});
const metric=(result,id)=>result.observations.find(item=>item.id===id);
const values=result=>Object.fromEntries(result.observations.map(item=>[item.id,item.value]));
const fullYear=(value,start='2025-01-01',end='2025-12-31',filed='2026-02-15')=>duration(value,start,end,filed,'10-K');

test('catalog and empty input expose complete, unique, versioned metrics without fabricated values',()=>{
  const result=buildFinancialMetrics(null,{symbol:'MSFT',asOf:AS_OF});
  assert.equal(FINANCIAL_DEFINITIONS.length,32);
  assert.equal(result.observations.length,FINANCIAL_DEFINITIONS.length);
  assert.equal(new Set(FINANCIAL_DEFINITIONS.map(definition=>definition.id)).size,32);
  assert(result.observations.every(observation=>observation.value===null&&observation.status!=='available'&&observation.reason));
  assert.equal(metric(result,'valuation.forwardPE').status,'unsupported');
  assert.equal(metric(result,'valuation.peg').status,'unsupported');
  assert.equal(metric(result,'valuation.evEbitda').status,'unsupported');
  assert(result.observations.every(observation=>observation.methodVersion==='sec-research-v1'));
  assert.throws(()=>buildFinancialMetrics({}, {asOf:'2026-02-29'}),/valid YYYY-MM-DD/);
});

test('quarter metrics retain the existing SEC source selection and matched-margin policy',()=>{
  const result=run({
    Revenues:facts([duration(100,'2025-07-01','2025-09-30','2025-10-28'),duration(120,'2026-07-01','2026-09-30')]),
    NetIncomeLoss:facts([duration(24,'2026-07-01','2026-09-30')]),
    GrossProfit:facts([duration(60,'2026-07-01','2026-09-30')]),
    OperatingIncomeLoss:facts([duration(30,'2026-04-01','2026-06-30')]),
    EarningsPerShareDiluted:facts([duration(2,'2026-07-01','2026-09-30')],'USD/shares'),
  });
  assert.equal(metric(result,'financial.revenueQuarter').value,120);
  assert.equal(metric(result,'financial.revenueGrowthYoYPct').value,20);
  assert.equal(metric(result,'financial.grossMarginPct').value,50);
  assert.equal(metric(result,'financial.netMarginPct').value,20);
  assert.equal(metric(result,'financial.operatingMarginPct').status,'period_mismatch');
  assert.equal(metric(result,'financial.epsQuarter').value,2);
  const margin=metric(result,'financial.grossMarginPct');
  assert.deepEqual(new Set(margin.details.tags),new Set(['Revenues','GrossProfit']));
  assert.equal(margin.periodStart,'2026-07-01');assert.equal(margin.periodEnd,'2026-09-30');
  assert.equal(margin.availableAt,'2026-11-12T22:00:00Z');
});

test('goods-only revenue cannot become company revenue, margins or valuation denominators',()=>{
  const current=duration(100,'2026-07-01','2026-09-30');
  const result=run({
    SalesRevenueGoodsNet:facts([fullYear(400),current]),
    SalesRevenueServicesNet:facts([fullYear(200),{...current,val:50}]),
    GrossProfit:facts([{...current,val:60}]),OperatingIncomeLoss:facts([{...current,val:30}]),NetIncomeLoss:facts([{...current,val:20}]),
    NetCashProvidedByUsedInOperatingActivities:facts([fullYear(100)]),PaymentsToAcquirePropertyPlantAndEquipment:facts([fullYear(40)]),
    CommonStockSharesOutstanding:facts([instant(100)],'shares'),
  },{price:50,priceAsOf:'2026-11-11'});
  for(const id of ['financial.revenueQuarter','financial.revenueTTM','financial.grossMarginPct','financial.operatingMarginPct',
    'financial.netMarginPct','financial.freeCashFlowMarginPct','valuation.priceSalesTTM']){
    const observation=metric(result,id);
    assert.equal(observation.value,null,id);assert.notEqual(observation.status,'available',id);
  }
  assert.equal(metric(result,'financial.freeCashFlowTTM').value,60,'supported cash-flow inputs remain usable');
  assert.equal(metric(result,'valuation.marketCap').value,5000,'a revenue gap does not invent or erase the separately sourced share estimate');
  assert.equal(result.methodology.revenue.scope,'company-total');
  assert(!result.methodology.revenue.supportedTags.includes('SalesRevenueGoodsNet'));
});

test('mixed goods-only and company-total reports cannot fill missing TTM or YoY inputs',()=>{
  const result=run({
    SalesRevenueGoodsNet:facts([fullYear(100),duration(70,'2025-01-01','2025-09-30','2025-10-28'),
      duration(20,'2025-07-01','2025-09-30','2025-10-28')]),
    RevenueFromContractWithCustomerExcludingAssessedTax:facts([
      duration(150,'2026-01-01','2026-09-30'),duration(60,'2026-07-01','2026-09-30')]),
  });
  assert.equal(metric(result,'financial.revenueQuarter').value,60);
  assert.equal(metric(result,'financial.revenueTTM').value,null,'goods FY100 + total YTD150 - goods YTD70 must not produce 180');
  assert.equal(metric(result,'financial.revenueTTM').status,'insufficient_data');
  assert.equal(metric(result,'financial.revenueGrowthYoYPct').value,null,'goods-only prior-quarter revenue is not a comparable total-revenue base');
  const periods=[['2025-10-01','2025-12-31'],['2026-01-01','2026-03-31'],['2026-04-01','2026-06-30'],['2026-07-01','2026-09-30']];
  const quarters=periods.map(([start,end])=>duration(100,start,end));
  const incomplete=run({Revenues:facts(quarters.slice(1)),SalesRevenueGoodsNet:facts([quarters[0]])});
  assert.equal(metric(incomplete,'financial.revenueTTM').value,null,'a partial-scope quarter cannot complete a four-quarter total-revenue chain');
});

test('recognized company-total aliases remain compatible and partial sales cannot override them',()=>{
  const result=run({
    Revenues:facts([fullYear(400),duration(100,'2025-07-01','2025-09-30','2025-10-28')]),
    SalesRevenueNet:facts([duration(270,'2025-01-01','2025-09-30','2025-10-28')]),
    RevenueFromContractWithCustomerExcludingAssessedTax:facts([
      duration(330,'2026-01-01','2026-09-30'),duration(120,'2026-07-01','2026-09-30')]),
    SalesRevenueGoodsNet:facts([duration(999,'2026-07-01','2026-09-30','2026-11-01')]),
    GrossProfit:facts([duration(60,'2026-07-01','2026-09-30')]),
  });
  assert.equal(metric(result,'financial.revenueQuarter').value,120);
  assert.equal(metric(result,'financial.revenueGrowthYoYPct').value,20);
  assert.equal(metric(result,'financial.grossMarginPct').value,50);
  const trailing=metric(result,'financial.revenueTTM');
  assert.equal(trailing.value,460);
  assert.equal(trailing.details.calculation,'annual-plus-current-ytd-minus-prior-ytd');
  assert.deepEqual(new Set(trailing.details.tags),new Set(['Revenues','SalesRevenueNet','RevenueFromContractWithCustomerExcludingAssessedTax']));
  assert(result.observations.every(observation=>!observation.details.tags.includes('SalesRevenueGoodsNet')));
});

test('annual plus current YTD less prior YTD constructs a trailing year without annualizing nine months',()=>{
  const flow=([annual,priorYtd,currentYtd])=>facts([
    fullYear(annual),duration(priorYtd,'2025-01-01','2025-09-30','2025-10-28'),duration(currentYtd,'2026-01-01','2026-09-30'),
  ]);
  const result=run({Revenues:flow([400,270,330]),NetIncomeLoss:flow([40,27,33]),
    NetCashProvidedByUsedInOperatingActivities:flow([100,60,90]),PaymentsToAcquirePropertyPlantAndEquipment:flow([40,25,30])});
  const v=values(result);
  assert.equal(v['financial.revenueTTM'],460);assert.equal(v['financial.netIncomeTTM'],46);
  assert.equal(v['financial.operatingCashFlowTTM'],130);assert.equal(v['financial.capexTTM'],45);
  assert.equal(v['financial.freeCashFlowTTM'],85);
  assert.equal(v['financial.freeCashFlowMarginPct'],18.478261);
  const cash=metric(result,'financial.operatingCashFlowTTM');
  assert.equal(cash.periodStart,'2025-10-01');assert.equal(cash.periodEnd,'2026-09-30');
  assert.equal(cash.details.calculation,'annual-plus-current-ytd-minus-prior-ytd');
  assert.equal(cash.sampleCount,3);assert.equal(cash.details.inputs.length,3);
});

test('TTM handles a non-calendar fiscal year and leaves isolated YTD flows unavailable',()=>{
  const records=[fullYear(120,'2024-07-01','2025-06-30','2025-08-01'),
    duration(80,'2024-07-01','2025-03-31','2025-05-01'),duration(95,'2025-07-01','2026-03-31','2026-05-01')];
  const result=run({NetCashProvidedByUsedInOperatingActivities:facts(records)});
  const cash=metric(result,'financial.operatingCashFlowTTM');
  assert.equal(cash.value,135);assert.equal(cash.periodStart,'2025-04-01');assert.equal(cash.periodEnd,'2026-03-31');
  const incomplete=run({NetCashProvidedByUsedInOperatingActivities:facts([records[2]])});
  assert.equal(metric(incomplete,'financial.operatingCashFlowTTM').value,null);
  assert.equal(metric(incomplete,'financial.operatingCashFlowTTM').status,'insufficient_data');
});

test('four contiguous standalone quarters support TTM; gaps and EPS annual/YTD subtraction do not',()=>{
  const periods=[['2025-10-01','2025-12-31'],['2026-01-01','2026-03-31'],['2026-04-01','2026-06-30'],['2026-07-01','2026-09-30']];
  const earnings=periods.map(([start,end],index)=>duration(index+1,start,end));
  const result=run({Revenues:facts(earnings.map(item=>({...item,val:item.val*100}))),EarningsPerShareDiluted:facts(earnings,'USD/shares')});
  assert.equal(metric(result,'financial.revenueTTM').value,1000);
  assert.equal(metric(result,'financial.epsTTM').value,10);
  assert.equal(metric(result,'financial.epsTTM').details.calculation,'sum-four-reported-quarter-eps');
  const gap=run({EarningsPerShareDiluted:facts(earnings.filter((_,index)=>index!==1),'USD/shares')});
  assert.equal(metric(gap,'financial.epsTTM').value,null);
  const cumulative=run({EarningsPerShareDiluted:facts([fullYear(10),duration(6,'2025-01-01','2025-09-30','2025-10-28'),duration(9,'2026-01-01','2026-09-30')],'USD/shares')});
  assert.equal(metric(cumulative,'financial.epsTTM').value,null,'do not produce EPS 10+9-6 with changing diluted weights');
  assert.match(metric(cumulative,'financial.epsTTM').reason,/not safely subtracted/);
});

test('fiscal YTD differencing can derive additive dollar quarters, including a fourth quarter',()=>{
  const result=run({Revenues:facts([
    duration(10,'2025-10-01','2025-12-31','2026-02-15'),
    duration(30,'2025-10-01','2026-03-31','2026-05-01'),
    duration(60,'2025-10-01','2026-06-30','2026-08-01'),
    fullYear(100,'2025-10-01','2026-09-30','2026-10-28'),
    duration(50,'2026-10-01','2026-12-31','2027-01-28'),
  ])},{asOf:'2027-02-01'});
  assert.equal(metric(result,'financial.revenueTTM').value,140);
  assert.equal(metric(result,'financial.revenueTTM').periodStart,'2026-01-01');
});

test('annual-minus-nine-months quarter derivation completes a contiguous dollar-flow TTM chain',()=>{
  const result=run({Revenues:facts([
    fullYear(400),duration(270,'2025-01-01','2025-09-30','2025-10-28'),
    duration(150,'2026-01-01','2026-03-31','2026-05-01'),
    duration(160,'2026-04-01','2026-06-30','2026-08-01'),
    duration(200,'2026-07-01','2026-09-30'),
  ])});
  const revenue=metric(result,'financial.revenueTTM');
  assert.equal(revenue.value,640);assert.equal(revenue.periodStart,'2025-10-01');
  assert.equal(revenue.details.calculation,'sum-four-compatible-derived-quarters');
  assert.equal(revenue.sampleCount,4);
  assert.equal(revenue.details.inputs.length,5,'four quarters require the two source facts used for derived Q4');
});

test('free cash flow never mixes trailing periods or assumes unknown capex equals zero',()=>{
  const result=run({
    NetCashProvidedByUsedInOperatingActivities:facts([fullYear(100)]),
    PaymentsToAcquirePropertyPlantAndEquipment:facts([fullYear(40,'2024-01-01','2024-12-31','2025-02-15')]),
  });
  assert.equal(metric(result,'financial.freeCashFlowTTM').value,null);
  assert.equal(metric(result,'financial.freeCashFlowTTM').status,'period_mismatch');
  const missing=run({NetCashProvidedByUsedInOperatingActivities:facts([fullYear(100)])});
  assert.equal(metric(missing,'financial.freeCashFlowTTM').value,null);
  const negativeCapex=run({PaymentsToAcquirePropertyPlantAndEquipment:facts([fullYear(-40)])});
  assert.equal(metric(negativeCapex,'financial.capexTTM').value,null,'do not silently absolute-value a negative cash-flow input');
});

test('balance sheet ratios require matched dates and debt aggregates are not double-counted',()=>{
  const result=run({
    DebtAndFinanceLeaseObligations:facts([instant(100)]),DebtCurrent:facts([instant(30)]),
    LongTermDebtNoncurrent:facts([instant(70)]),ShortTermBorrowings:facts([instant(10)]),
    LongTermDebt:facts([instant(90)]),LongTermDebtCurrent:facts([instant(20)]),
    CashAndCashEquivalentsAtCarryingValue:facts([instant(20)]),StockholdersEquity:facts([instant(200)]),
    Assets:facts([instant(500)]),AssetsCurrent:facts([instant(150)]),LiabilitiesCurrent:facts([instant(75)]),
  });
  const v=values(result);
  assert.equal(v['financial.debt'],100);assert.equal(v['financial.netDebt'],80);
  assert.equal(v['financial.currentRatio'],2);assert.equal(v['financial.debtEquity'],0.5);
  assert.equal(metric(result,'financial.debt').details.inputs.length,1);
  const mismatched=run({DebtCurrent:facts([instant(10)]),LongTermDebtNoncurrent:facts([instant(30)]),
    CashAndCashEquivalentsAtCarryingValue:facts([instant(20,'2026-06-30')]),
    AssetsCurrent:facts([instant(150)]),LiabilitiesCurrent:facts([instant(75,'2026-06-30')])});
  assert.equal(metric(mismatched,'financial.debt').value,40);
  assert.equal(metric(mismatched,'financial.netDebt').status,'period_mismatch');
  assert.equal(metric(mismatched,'financial.currentRatio').status,'period_mismatch');
  const missingShortDebt=run({LongTermDebt:facts([instant(40)])});
  assert.equal(metric(missingShortDebt,'financial.debt').value,null,'missing short-term borrowing is not a reported zero');
});

test('ROE requires exact beginning and ending positive equity, not a single latest balance',()=>{
  const income=[fullYear(50,'2025-10-01','2026-09-30','2026-10-28')];
  const result=run({NetIncomeLoss:facts(income),StockholdersEquity:facts([instant(100,'2025-09-30','2025-10-28'),instant(150)])});
  assert.equal(metric(result,'financial.roePct').value,40);
  const noBeginning=run({NetIncomeLoss:facts(income),StockholdersEquity:facts([instant(150)])});
  assert.equal(metric(noBeginning,'financial.roePct').value,null);
  const wrongDate=run({NetIncomeLoss:facts(income),StockholdersEquity:facts([instant(100,'2025-09-29','2025-10-28'),instant(150)])});
  assert.equal(metric(wrongDate,'financial.roePct').value,null);
});

test('valuation preserves source dates and uses reported shares instead of inventing market capitalization',()=>{
  const gaap={
    Revenues:facts([fullYear(1000)]),EarningsPerShareDiluted:facts([fullYear(4)],'USD/shares'),
    StockholdersEquity:facts([instant(500)]),DebtCurrent:facts([instant(10)]),LongTermDebtNoncurrent:facts([instant(30)]),
    CashAndCashEquivalentsAtCarryingValue:facts([instant(20)]),CommonStockSharesOutstanding:facts([instant(100)],'shares'),
  };
  const result=run(gaap,{price:50,priceAsOf:'2026-11-11T05:00:00Z',priceSource:'ALPACA_IEX_DAILY'});
  const v=values(result);
  assert.equal(v['valuation.peTTM'],12.5);assert.equal(v['valuation.marketCap'],5000);
  assert.equal(v['valuation.priceBook'],10);assert.equal(v['valuation.priceSalesTTM'],5);assert.equal(v['valuation.enterpriseValue'],5020);
  const cap=metric(result,'valuation.marketCap');
  assert.equal(cap.details.priceAsOf,'2026-11-11');assert.equal(cap.details.sharesAsOf,'2026-09-30');
  assert.match(cap.source,/ALPACA_IEX_DAILY/);
  const noShares=run({...gaap,CommonStockSharesOutstanding:undefined},{price:50,priceAsOf:'2026-11-11'});
  assert.equal(metric(noShares,'valuation.marketCap').value,null);assert.equal(metric(noShares,'valuation.peTTM').value,12.5);
  for(const priceAsOf of [null,'2026-02-30T05:00:00Z','2026-11-13']){
    const invalid=run(gaap,{price:50,priceAsOf});assert.equal(metric(invalid,'valuation.marketCap').value,null);
  }
});

test('ambiguous classes, dimensions and unsupported units cannot become company share counts or cash',()=>{
  const result=run({CashAndCashEquivalentsAtCarryingValue:facts([instant(50)],'EUR')},
    {price:50,priceAsOf:'2026-11-11'},
    {EntityCommonStockSharesOutstanding:facts([instant(100),instant(40)],'shares')});
  assert.equal(metric(result,'financial.cash').value,null);assert.equal(metric(result,'valuation.marketCap').value,null);
  assert.match(metric(result,'valuation.marketCap').reason,/different share classes/);
  const segmented=run({Revenues:facts([duration(100,'2026-07-01','2026-09-30','2026-10-28','10-Q',{segment:{region:'US'}})]),
    CommonStockSharesOutstanding:facts([instant(100,'2026-09-30','2026-10-28',{dimensions:{class:'A'}})],'shares')},{price:50,priceAsOf:'2026-11-11'});
  assert.equal(metric(segmented,'financial.revenueQuarter').value,null);assert.equal(metric(segmented,'valuation.marketCap').value,null);
});

test('future filings and restatements cannot rewrite a historical knowledge cutoff',()=>{
  const source={Revenues:facts([fullYear(400),fullYear(999,'2025-01-01','2025-12-31','2026-12-01')]),
    StockholdersEquity:facts([instant(150),instant(999,'2026-09-30','2026-12-01')])};
  const before=run(source),after=run(source,{asOf:'2026-12-02'});
  assert.equal(metric(before,'financial.revenueTTM').value,400);assert.equal(metric(before,'financial.equity').value,150);
  assert.equal(metric(after,'financial.revenueTTM').value,999);assert.equal(metric(after,'financial.equity').value,999);
  assert(before.observations.flatMap(item=>item.details.filingDates).every(date=>date<=AS_OF));
});

test('real zero and negative measurements remain measured; invalid denominators and malformed records stay unknown',()=>{
  const result=run({Revenues:facts([duration(100,'2026-07-01','2026-09-30')]),NetIncomeLoss:facts([duration(0,'2026-07-01','2026-09-30')]),
    NetCashProvidedByUsedInOperatingActivities:facts([fullYear(-10)]),PaymentsToAcquirePropertyPlantAndEquipment:facts([fullYear(5)]),
    DebtAndFinanceLeaseObligations:facts([instant(0)]),StockholdersEquity:facts([instant(100)]),LiabilitiesCurrent:facts([instant(0)]),AssetsCurrent:facts([instant(100)])});
  assert.equal(metric(result,'financial.netMarginPct').value,0);assert.equal(metric(result,'financial.netMarginPct').status,'available');
  assert.equal(metric(result,'financial.freeCashFlowTTM').value,-15);assert.equal(metric(result,'financial.debtEquity').value,0);
  assert.equal(metric(result,'financial.currentRatio').value,null);
  const malformed=run({Revenues:facts([null,[],duration(Infinity,'2026-07-01','2026-09-30'),duration('100','2026-07-01','2026-09-30'),duration(100,'2026-02-30','2026-05-31')])});
  assert.equal(metric(malformed,'financial.revenueQuarter').value,null);
  const secretPayload={...payload({}),token:'never-copy-token',password:'never-copy-password'};
  const text=JSON.stringify(buildFinancialMetrics(secretPayload,{symbol:'MSFT',asOf:AS_OF}));
  assert(!text.includes('never-copy-token'));assert(!text.includes('never-copy-password'));
});
