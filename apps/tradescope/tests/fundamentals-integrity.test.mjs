import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCompanyFacts} from '../lib/fundamentals.mjs';

const fact=(val,start='2026-07-01',end='2026-09-30',filed='2026-10-28',form='10-Q')=>({val,start,end,filed,form});
const usd=items=>({units:{USD:items}});
const payload=facts=>({cik:789019,entityName:'Test Issuer',facts:{'us-gaap':facts}});
const summary=facts=>summarizeCompanyFacts(payload(facts),'2026-11-12');

test('margins are unavailable when latest reported facts belong to different quarters',()=>{
 const value=summary({
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([fact(100)]),
  NetIncomeLoss:usd([fact(20,'2026-04-01','2026-06-30','2026-07-29')]),
  GrossProfit:usd([fact(60)]),
  OperatingIncomeLoss:usd([fact(30,'2026-07-02')])
 });
 assert.equal(value.quarterly.netIncome.value,20,'reported facts remain available on their own terms');
 assert.equal(value.quarterly.netIncome.periodEnd,'2026-06-30');
 assert.equal(value.ratios.quarterNetMarginPct,null,'do not divide Q2 profit by Q3 revenue');
 assert.equal(value.ratioQuality.quarterNetMarginPct.reason,'period_mismatch');
 assert.deepEqual(value.ratioQuality.quarterNetMarginPct.numeratorPeriod,{start:'2026-04-01',end:'2026-06-30'});
 assert.equal(value.ratios.quarterOperatingMarginPct,null,'matching end date alone is insufficient');
 assert.equal(value.ratioQuality.quarterOperatingMarginPct.reason,'period_mismatch');
 assert.equal(value.ratios.quarterGrossMarginPct,60);
 assert.equal(value.ratioQuality.quarterGrossMarginPct.status,'available');
 assert.equal(value.quarterly.grossProfit.unit,'USD');
});

test('annual margins use matching fiscal-year periods and preserve unavailable annual mismatches',()=>{
 const annual=(val,start='2025-07-01',end='2026-06-30')=>fact(val,start,end,'2026-07-29','10-K');
 const good=summary({Revenues:usd([annual(400)]),NetIncomeLoss:usd([annual(100)])});
 assert.equal(good.ratios.annualNetMarginPct,25);
 assert.equal(good.ratioQuality.annualNetMarginPct.reason,null);
 assert.equal(good.ratios.quarterNetMarginPct,null,'annual values are not fabricated as quarterly facts');
 const bad=summary({Revenues:usd([annual(400)]),NetIncomeLoss:usd([fact(100,'2024-07-01','2025-06-30','2025-07-29','10-K')])});
 assert.equal(bad.ratios.annualNetMarginPct,null);
 assert.equal(bad.ratioQuality.annualNetMarginPct.reason,'period_mismatch');
});

test('latest valid revenue fact is selected across supported aliases with source tag and YoY provenance',()=>{
 const value=summary({
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([
   fact(100,'2025-07-01','2025-09-30','2025-10-28')
  ]),
  Revenues:usd([fact(120)]),
  SalesRevenueNet:usd([fact(999,'2026-01-01','2026-09-30')])
 });
 assert.equal(value.quarterly.revenue.value,120);
 assert.equal(value.quarterly.revenue.tag,'Revenues');
 assert.equal(value.quarterly.revenue.periodStart,'2026-07-01');
 assert.equal(value.quarterly.revenue.priorYearValue,100);
 assert.equal(value.quarterly.revenue.priorYearTag,'RevenueFromContractWithCustomerExcludingAssessedTax');
 assert.equal(value.quarterly.revenue.yoyPct,20);
});

test('revenue alias ties prefer later known filings and then deterministic configured tag priority',()=>{
 const restated=summary({
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([fact(100)]),
  Revenues:usd([fact(110,'2026-07-01','2026-09-30','2026-11-01','10-Q/A')])
 });
 assert.equal(restated.quarterly.revenue.value,110);
 assert.equal(restated.quarterly.revenue.tag,'Revenues');
 const tied=summary({
  Revenues:usd([fact(110)]),
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([fact(100)])
 });
 assert.equal(tied.quarterly.revenue.value,100);
 assert.equal(tied.quarterly.revenue.tag,'RevenueFromContractWithCustomerExcludingAssessedTax');
});

test('as-of selection excludes future-filed aliases and restatements from current facts and prior-year comparisons',()=>{
 const facts={
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([
   fact(100,'2025-07-01','2025-09-30','2025-10-28'),
   fact(120),
   fact(200,'2025-07-01','2025-09-30','2026-12-01','10-Q/A')
  ]),
  Revenues:usd([fact(999,'2026-07-01','2026-09-30','2026-12-01','10-Q/A')])
 };
 const before=summarizeCompanyFacts(payload(facts),'2026-11-12');
 assert.equal(before.quarterly.revenue.value,120);assert.equal(before.quarterly.revenue.priorYearValue,100);
 assert.equal(before.quarterly.revenue.yoyPct,20);
 const after=summarizeCompanyFacts(payload(facts),'2026-12-02');
 assert.equal(after.quarterly.revenue.value,999);assert.equal(after.quarterly.revenue.priorYearValue,200);
 assert.equal(after.quarterly.revenue.tag,'Revenues');
 const preReport=summarizeCompanyFacts(payload(facts),'2026-10-01');
 assert.equal(preReport.quarterly.revenue.value,100,'newer end period is unavailable until a filing is known');
});

test('missing units, malformed facts and nonpositive denominators do not produce fabricated margins',()=>{
 const missingCurrency=summary({Revenues:{units:{EUR:[fact(100)]}},NetIncomeLoss:usd([fact(20)])});
 assert.equal(missingCurrency.quarterly.revenue.value,null);
 assert.equal(missingCurrency.quarterly.revenue.unit,null);
 assert.equal(missingCurrency.ratios.quarterNetMarginPct,null);
 assert.equal(missingCurrency.ratioQuality.quarterNetMarginPct.reason,'missing_fact');
 for(const invalid of [fact(Infinity),fact(NaN),fact('100'),fact(100,'2026-02-29','2026-05-31'),fact(100,'2026-07-01','2026-09-30','2026-11-31')]){
  const value=summary({Revenues:usd([invalid]),NetIncomeLoss:usd([fact(20)])});
  assert.equal(value.quarterly.revenue.value,null);
  assert.equal(value.ratios.quarterNetMarginPct,null);
 }
 for(const revenue of [0,-100]){
  const value=summary({Revenues:usd([fact(revenue)]),NetIncomeLoss:usd([fact(20)])});
  assert.equal(value.ratios.quarterNetMarginPct,null);
  assert.equal(value.ratioQuality.quarterNetMarginPct.reason,'nonpositive_denominator');
 }
 for(const profit of [0,-20]){
  const value=summary({Revenues:usd([fact(100)]),NetIncomeLoss:usd([fact(profit)])});
  assert.equal(value.ratios.quarterNetMarginPct,profit,'a real zero or negative profit is not treated as missing');
  assert.equal(value.ratioQuality.quarterNetMarginPct.status,'available');
 }
 const noPrior=summary({Revenues:usd([fact(100)])});
 assert.equal(noPrior.quarterly.revenue.priorYearValue,null);
 assert.equal(noPrior.quarterly.revenue.yoyPct,null);
 const zeroPrior=summary({Revenues:usd([fact(100),fact(0,'2025-07-01','2025-09-30','2025-10-28')])});
 assert.equal(zeroPrior.quarterly.revenue.yoyPct,null,'a zero prior denominator does not imply a fabricated growth rate');
});
