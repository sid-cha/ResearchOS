/** SEC XBRL extraction. Report dates + filing timestamps retained; missing data is never imputed. */
const revenueKeys=['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','SalesRevenueGoodsNet'];
const fields={revenue:revenueKeys,netIncome:['NetIncomeLoss'],grossProfit:['GrossProfit'],operatingIncome:['OperatingIncomeLoss'],epsDiluted:['EarningsPerShareDiluted']};
const unitFor={epsDiluted:'USD/shares'};
const round=(v,n=2)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(n)):null;
const diffDays=(start,end)=>(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000;
// Evaluate all supported tags: issuers can change revenue tags between filings.
// Tag order breaks ties only after report period and filing recency are matched.
function factSeries(payload,names,unit){return names.flatMap((tag,priority)=>{
 const items=payload?.facts?.['us-gaap']?.[tag]?.units?.[unit];
 return Array.isArray(items)?items.flatMap((item,index)=>item&&typeof item==='object'&&!Array.isArray(item)?[{...item,tag,priority,index}]:[]):[];
});}
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
function validFact(x,asOf,period){
 if(!validDate(x.start)||!validDate(x.end)||!validDate(x.filed)||!Number.isFinite(x.val))return false;
 const days=diffDays(x.start,x.end),kind=period==='quarter'?days>=70&&days<=110:days>=330&&days<=380;
 return ['10-Q','10-K','10-Q/A','10-K/A'].includes(x.form)&&kind&&x.filed<=asOf&&x.end<=asOf;
}
const filingOrder=(a,b)=>b.filed.localeCompare(a.filed)||a.priority-b.priority||b.start.localeCompare(a.start)||a.index-b.index;
function latest(items,period,asOf){return items.filter(x=>validFact(x,asOf,period)).sort((a,b)=>b.end.localeCompare(a.end)||filingOrder(a,b))[0]||null;}
function priorYear(items,period,now,asOf){if(!now)return null;const target=new Date(`${now.end}T00:00:00Z`);target.setUTCFullYear(target.getUTCFullYear()-1);const targetDay=target.toISOString().slice(0,10);return items.filter(x=>validFact(x,asOf,period)&&Math.abs(diffDays(x.end,targetDay))<=12).sort((a,b)=>Math.abs(diffDays(a.end,targetDay))-Math.abs(diffDays(b.end,targetDay))||filingOrder(a,b))[0]||null;}
function capture(payload,field,period,asOf){const unit=unitFor[field]||'USD',items=factSeries(payload,fields[field],unit),current=latest(items,period,asOf),prior=priorYear(items,period,current,asOf);return {tag:current?.tag??null,unit:current?unit:null,value:current?.val??null,periodEnd:current?.end??null,periodStart:current?.start??null,filingDate:current?.filed??null,form:current?.form??null,priorYearValue:prior?.val??null,priorYearPeriodEnd:prior?.end??null,priorYearTag:prior?.tag??null,yoyPct:prior?.val>0?round((current.val/prior.val-1)*100):null};}
export function summarizeCompanyFacts(payload,asOf=new Date().toISOString().slice(0,10)){
  const quarterly={},annual={};for(const f of Object.keys(fields)){quarterly[f]=capture(payload,f,'quarter',asOf);annual[f]=capture(payload,f,'annual',asOf);}
  const ratios={},ratioQuality={};
  function margin(name,numerator,denominator){
   let reason=null,message='Matched source periods and units.';
   if(!Number.isFinite(numerator.value)||!Number.isFinite(denominator.value)){reason='missing_fact';message='A required reported source fact is unavailable.';}
   else if(numerator.periodStart!==denominator.periodStart||numerator.periodEnd!==denominator.periodEnd){reason='period_mismatch';message='Numerator and denominator have different reported periods.';}
   else if(!numerator.unit||numerator.unit!==denominator.unit){reason='unit_mismatch';message='Numerator and denominator require the same reported unit.';}
   else if(denominator.value<=0){reason='nonpositive_denominator';message='The reported denominator must be positive.';}
   ratios[name]=reason?null:round(numerator.value/denominator.value*100);
   ratioQuality[name]={status:reason?'unavailable':'available',reason,message,
    numeratorPeriod:{start:numerator.periodStart,end:numerator.periodEnd},denominatorPeriod:{start:denominator.periodStart,end:denominator.periodEnd},
    numeratorUnit:numerator.unit,denominatorUnit:denominator.unit};
  }
  margin('quarterGrossMarginPct',quarterly.grossProfit,quarterly.revenue);
  margin('quarterOperatingMarginPct',quarterly.operatingIncome,quarterly.revenue);
  margin('quarterNetMarginPct',quarterly.netIncome,quarterly.revenue);
  margin('annualNetMarginPct',annual.netIncome,annual.revenue);
  return {source:'SEC EDGAR / XBRL',cik:String(payload?.cik||''),company:payload?.entityName??null,asOf,quarterly,annual,ratios,ratioQuality,caveats:['Different GAAP tags and fiscal calendars can reduce comparability.','Only standard company-level US-GAAP facts are included; custom-tag figures may be missing.','YoY values require comparable duration and prior-year period.','Most recent available fiscal periods may differ between fields; margins are unavailable when periods or units do not match.']};
}
export function extractFilings(payload,max=12){const r=payload?.filings?.recent||{};const out=[];for(let i=0;i<(r.form||[]).length&&out.length<max;i++){const form=r.form[i];if(!['10-Q','10-K','8-K','10-Q/A','10-K/A'].includes(form))continue;const accession=r.accessionNumber?.[i];if(!accession)continue;const clean=accession.replaceAll('-','');const cik=String(payload.cik||'').replace(/^0+/,'');const filename=r.primaryDocument?.[i];const url=filename?`https://www.sec.gov/Archives/edgar/data/${cik}/${clean}/${encodeURIComponent(filename)}`:`https://www.sec.gov/Archives/edgar/data/${cik}/${clean}/`;
 out.push({id:`sec:${accession}`,type:'FILING',category:'CORPORATE',form,headline:`${payload.name||'Issuer'} — ${form} filing`,occurredAt:null,publishedAt:r.acceptanceDateTime?.[i]||`${r.filingDate?.[i]}T00:00:00Z`,source:'SEC EDGAR',sourceUrl:url,filingDate:r.filingDate?.[i]||null,periodEnd:r.reportDate?.[i]||null,accession,symbols:payload.tickers||[],evidenceLevel:'official_filing'});}
 return out;}
