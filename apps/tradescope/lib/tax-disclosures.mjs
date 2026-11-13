/** ResearchOS SEC tax-disclosure research. Public SEC XBRL, never IRS tax returns.
 * No invented figures, tax-compliance verdicts, or implicit time-travel through amendments.
 */
const METRICS=Object.freeze([
  {id:'income_tax_expense',label:'Income tax expense (benefit)',tags:['IncomeTaxExpenseBenefit'],unit:'USD',period:'duration'},
  {id:'pretax_income',label:'Income before income taxes',tags:['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'],unit:'USD',period:'duration'},
  {id:'current_tax_expense',label:'Current income tax expense (benefit)',tags:['CurrentIncomeTaxExpenseBenefit'],unit:'USD',period:'duration'},
  {id:'deferred_tax_expense',label:'Deferred income tax expense (benefit)',tags:['DeferredIncomeTaxExpenseBenefit'],unit:'USD',period:'duration'},
  {id:'cash_taxes_paid',label:'Income taxes paid (net of refunds)',tags:['IncomeTaxesPaidNet'],unit:'USD',period:'duration'},
  {id:'reported_effective_tax_rate',label:'Reported effective income tax rate',tags:['EffectiveIncomeTaxRateContinuingOperations'],unit:'pure',period:'duration'},
  {id:'deferred_tax_assets_net',label:'Deferred tax assets (net)',tags:['DeferredTaxAssetsNet'],unit:'USD',period:'instant'},
  {id:'deferred_tax_liabilities_net',label:'Deferred tax liabilities (net)',tags:['DeferredIncomeTaxLiabilitiesNet'],unit:'USD',period:'instant'},
  {id:'deferred_tax_valuation_allowance',label:'Deferred tax asset valuation allowance',tags:['DeferredTaxAssetsValuationAllowance'],unit:'USD',period:'instant'},
  {id:'unrecognized_tax_benefits',label:'Unrecognized tax benefits',tags:['UnrecognizedTaxBenefits'],unit:'USD',period:'instant'}
]);
export const TAX_DISCLOSURE_METRICS=METRICS;
const VALID_FORMS=new Set(['10-K','10-K/A']);
const validDate=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const daysBetween=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
const normalizeCik=(v)=>{const x=typeof v==='number'&&Number.isSafeInteger(v)?String(v):typeof v==='string'?v:'';return /^\d{1,10}$/.test(x)&&Number(x)>0?x.padStart(10,'0'):null;};
const fin=(x)=>typeof x==='number'&&Number.isFinite(x);
function eligible(raw,metric,asOf){
  if(!raw||typeof raw!=='object'||!fin(raw.val)||!VALID_FORMS.has(raw.form)||!validDate(raw.filed)||raw.filed>asOf||!validDate(raw.end)||raw.end>asOf||!/^\d{10}-\d{2}-\d{6}$/.test(raw.accn||''))return false;
  if(metric.period==='instant')return !raw.start;
  return validDate(raw.start)&&daysBetween(raw.start,raw.end)>=330&&daysBetween(raw.start,raw.end)<=380;
}
function selectLatest(facts,metric,asOf){
  const byGaap=facts?.facts?.['us-gaap'];if(!byGaap||typeof byGaap!=='object')return null;
  const choices=[];
  for(const tag of metric.tags){const values=byGaap?.[tag]?.units?.[metric.unit];if(!Array.isArray(values))continue;
    for(const record of values){if(!eligible(record,metric,asOf))continue;
      choices.push({value:record.val,unit:metric.unit,tag,form:record.form,accession:record.accn,filingDate:record.filed,
        periodStart:record.start||null,periodEnd:record.end,source:'SEC_EDGAR_XBRL'});
    }
  }
  choices.sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)||b.filingDate.localeCompare(a.filingDate)||b.accession.localeCompare(a.accession));
  return choices[0]||null;
}
/** No cross-period/issuer comparison or tax-evasion inference. Date granularity = SEC filing day. */
export function analyzePublicTaxDisclosures(source,{symbol,asOf=new Date().toISOString().slice(0,10)}={}){
  if(!validDate(asOf))throw Object.assign(new Error('Use a valid asOf date (YYYY-MM-DD)'),{status:400});
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))throw Object.assign(new Error('Use a registered uppercase symbol'),{status:400});
  const facts=source?.facts?.['us-gaap']?source:source?.facts;
  const cik=normalizeCik(facts?.cik);
  if(!cik)throw Object.assign(new Error('Official issuer XBRL facts are unavailable'),{status:422});
  const observations=METRICS.map(metric=>{
    const evidence=selectLatest(facts,metric,asOf);
    return {metricId:metric.id,label:metric.label,status:evidence?'reported':'unavailable',value:evidence?.value??null,
      unit:metric.unit,periodType:metric.period,sourceEvidence:evidence?{...evidence,sourceUrl:`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`}:null};
  });
  return {schemaVersion:1,source:'SEC_EDGAR_XBRL',symbol,cik,issuer:facts.entityName||null,asOf,cutoffPrecision:'filing_date_only',
    coverage:{reported:observations.filter(x=>x.status==='reported').length,total:observations.length,annual10KOnly:true},observations,
    derivedTaxRiskScore:null,taxReturnAvailable:false,
    limitations:[
      'Values are publicly disclosed US-GAAP XBRL facts from SEC annual filings, not confidential IRS returns or tax assessments.',
      'Only 10-K/10-K/A annual facts filed on or before the as-of calendar date are eligible; intraday acceptance time is not available in this feed.',
      'A later restatement is excluded from an earlier as-of date. Comparability and issuer-specific extensions require analyst review.',
      'Reported effective rate is not inferred from unmatched pre-tax income and tax-expense records. Missing tags remain unavailable.',
      'These observations do not establish tax compliance, fraud, tax liability due, or investment recommendations.'
    ]};
}