import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePublicTaxDisclosures,TAX_DISCLOSURE_METRICS} from '../lib/tax-disclosures.mjs';
const row=(val,end,filed,accn='0000001234-26-000001',start='2025-01-01')=>({val,end,filed,accn,start,form:'10-K'});
const facts={cik:1234,entityName:'Example Inc',facts:{'us-gaap':{
  IncomeTaxExpenseBenefit:{units:{USD:[row(200,'2025-12-31','2026-02-20'),row(230,'2025-12-31','2026-09-20','0000001234-26-000002'),row(999,'2026-12-31','2027-02-20','0000001234-27-000001','2026-01-01')]}},
  EffectiveIncomeTaxRateContinuingOperations:{units:{pure:[row(.21,'2025-12-31','2026-02-20')]}},
  DeferredTaxAssetsNet:{units:{USD:[{val:340,form:'10-K',end:'2025-12-31',filed:'2026-02-20',accn:'0000001234-26-000001'}]}}
}}};
test('uses as-of cutoffs; never leaks a later amendment into earlier point in time',()=>{
 const early=analyzePublicTaxDisclosures(facts,{symbol:'EXM',asOf:'2026-03-01'});
 const late=analyzePublicTaxDisclosures(facts,{symbol:'EXM',asOf:'2026-10-01'});
 const expense=(a)=>a.observations.find(o=>o.metricId==='income_tax_expense');
 assert.equal(expense(early).value,200);assert.equal(expense(late).value,230);assert.equal(early.cutoffPrecision,'filing_date_only');
 assert.equal(early.taxReturnAvailable,false);assert.equal(early.derivedTaxRiskScore,null);
});
test('uses only annual 10-K tags, not quarterly facts or future filings',()=>{
 const changed=structuredClone(facts);changed.facts['us-gaap'].IncomeTaxExpenseBenefit.units.USD.push({...row(888,'2026-03-31','2026-05-01','0000001234-26-000003','2026-01-01'),form:'10-Q'});
 const result=analyzePublicTaxDisclosures(changed,{symbol:'EXM',asOf:'2026-11-12'});
 assert.equal(result.observations.find(x=>x.metricId==='income_tax_expense').value,230);
 assert.equal(result.observations.find(x=>x.metricId==='reported_effective_tax_rate').value,.21);
 assert.equal(result.observations.find(x=>x.metricId==='cash_taxes_paid').status,'unavailable');
 assert.equal(result.observations.find(x=>x.metricId==='deferred_tax_assets_net').value,340);
});
test('rejects invalid identity/dates and does not invent SEC facts',()=>{
 assert.throws(()=>analyzePublicTaxDisclosures(facts,{symbol:'EXM',asOf:'2026-02-30'}));
 assert.throws(()=>analyzePublicTaxDisclosures(facts,{symbol:'evil<script>'}));
 assert.throws(()=>analyzePublicTaxDisclosures({}, {symbol:'EXM'}));
 assert.equal(TAX_DISCLOSURE_METRICS.length,10);
});