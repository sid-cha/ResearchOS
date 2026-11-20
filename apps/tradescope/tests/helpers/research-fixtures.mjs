export const RESEARCH_NOW=Date.parse('2026-11-12T18:00:00Z');
export function dailyBars(count=320,price=100){
 const result=[];let day=new Date(RESEARCH_NOW-86400000);
 while(result.length<count){if(![0,6].includes(day.getUTCDay()))result.push({t:day.toISOString().slice(0,10)+'T05:00:00Z',o:price,c:price,h:price+2,l:price-2,v:1000});day=new Date(+day-86400000);}
 result.reverse();return result.map((bar,index)=>({...bar,o:price+index*.1,c:price+index*.1,h:price+index*.1+2,l:price+index*.1-2}));
}
const fact=(val,start,end,filed='2026-10-28',form='10-Q')=>({val,start,end,filed,form});
const flow=items=>({units:{USD:items}});
export function companyFactsFixture(){return {cik:789019,entityName:'Research Fixture Inc.',facts:{'us-gaap':{
 RevenueFromContractWithCustomerExcludingAssessedTax:flow([fact(120,'2026-07-01','2026-09-30'),fact(100,'2025-07-01','2025-09-30','2025-10-28'),fact(400,'2025-01-01','2025-12-31','2026-02-01','10-K'),fact(360,'2026-01-01','2026-09-30'),fact(300,'2025-01-01','2025-09-30','2025-10-28')]),
 NetIncomeLoss:flow([fact(24,'2026-07-01','2026-09-30'),fact(80,'2025-01-01','2025-12-31','2026-02-01','10-K'),fact(72,'2026-01-01','2026-09-30'),fact(60,'2025-01-01','2025-09-30','2025-10-28')]),
 GrossProfit:flow([fact(60,'2026-07-01','2026-09-30')]),OperatingIncomeLoss:flow([fact(36,'2026-07-01','2026-09-30')]),
 NetCashProvidedByUsedInOperatingActivities:flow([fact(100,'2025-01-01','2025-12-31','2026-02-01','10-K'),fact(90,'2026-01-01','2026-09-30'),fact(75,'2025-01-01','2025-09-30','2025-10-28')]),
 PaymentsToAcquirePropertyPlantAndEquipment:flow([fact(20,'2025-01-01','2025-12-31','2026-02-01','10-K'),fact(18,'2026-01-01','2026-09-30'),fact(15,'2025-01-01','2025-09-30','2025-10-28')]),
 Assets:flow([{val:500,end:'2026-09-30',filed:'2026-10-28',form:'10-Q'}]),
 StockholdersEquity:flow([{val:200,end:'2026-09-30',filed:'2026-10-28',form:'10-Q'}]),
 CashAndCashEquivalentsAtCarryingValue:flow([{val:50,end:'2026-09-30',filed:'2026-10-28',form:'10-Q'}]),
 AssetsCurrent:flow([{val:150,end:'2026-09-30',filed:'2026-10-28',form:'10-Q'}]),
 LiabilitiesCurrent:flow([{val:75,end:'2026-09-30',filed:'2026-10-28',form:'10-Q'}])
 }}};}
export const fixtureFiling={id:'sec:0001193125-26-448357',accession:'0001193125-26-448357',type:'FILING',category:'CORPORATE',form:'8-K',headline:'Research Fixture Inc. — 8-K',publishedAt:'2026-11-05T11:01:00Z',source:'SEC EDGAR',sourceUrl:'https://www.sec.gov/Archives/edgar/data/789019/000119312526448357/fixture.htm',symbols:['MSFT']};
export function researchSourcesFixture(){return {
 async researchBars(symbol){return {symbol,source:'ALPACA_IEX',bars:dailyBars(),adjustment:'split',partialHistory:false,fetchedAt:new Date(RESEARCH_NOW).toISOString()};},
 async companyFacts(symbol){return {symbol,source:'SEC_EDGAR_XBRL',facts:companyFactsFixture(),fetchedAt:new Date(RESEARCH_NOW).toISOString()};},
 async filings(){return {source:'SEC_EDGAR',filings:[fixtureFiling]};}
};}
