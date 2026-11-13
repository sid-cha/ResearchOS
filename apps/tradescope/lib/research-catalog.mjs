/** Local pilot instrument keys, not an authoritative permanent security master. */
import {TECHNICAL_DEFINITIONS} from './research-technical.mjs';
import {FINANCIAL_DEFINITIONS} from './research-fundamentals.mjs';
import {BUILTIN_RULES,BUILTIN_SCREENS} from './research-rules.mjs';

const pilot=[
 ['NVDA','NVIDIA','Semiconductors'],['AAPL','Apple','Consumer technology'],
 ['MSFT','Microsoft','Software and cloud'],['TSLA','Tesla','Automotive'],
 ['SPY','SPDR S&P 500 ETF','Broad-market ETF'],['AMD','Advanced Micro Devices','Semiconductors'],
 ['QQQ','Invesco QQQ ETF','Equity ETF'],['META','Meta Platforms','Communication services'],
 ['AMZN','Amazon','Commerce and cloud'],['PLTR','Palantir','Software']
];
export const INSTRUMENTS=Object.freeze(pilot.map(([symbol,name,sector])=>Object.freeze({
 instrumentId:`US_EQUITY:${symbol}`,symbol,name,sector,
 type:['SPY','QQQ'].includes(symbol)?'ETF':'equity',currency:'USD',marketTimeZone:'America/New_York',
 coverage:'Alpaca IEX single-venue pilot',classification:'pilot display category',
 secCompanySupported:!['SPY','QQQ'].includes(symbol)
})));
export const RESEARCH_SYMBOLS=Object.freeze(INSTRUMENTS.map(item=>item.symbol));
export const METRIC_DEFINITIONS=Object.freeze([...TECHNICAL_DEFINITIONS,...FINANCIAL_DEFINITIONS]);
export const METRIC_IDS=new Set(METRIC_DEFINITIONS.map(item=>item.id));

export function researchCatalog(){return {
 schemaVersion:1,instruments:INSTRUMENTS,definitions:METRIC_DEFINITIONS,rules:BUILTIN_RULES,presets:BUILTIN_SCREENS,
 features:{companyResearch:'implemented',technicalMetrics:'implemented',financialMetrics:'implemented',
  ruleEvaluations:'implemented',savedScreens:'local single-user store',alerts:'local single-user store',
  scheduledMonitoring:'opt-in saved-screen snapshots while the local server runs',
  marketAtlas:'requested ten-symbol breadth, display-category comparisons and aligned price curves',
  filingReader:'extractive source-linked passages',earthquakeAnalogues:'retrospective catalog comparison',
  globalExposures:'not available; no automatic company exposure claims',
  calibratedForecasts:'not implemented or validated',consensusEstimates:'provider required',
  javaPostgresIntegration:'optional authenticated dated-metric snapshot storage; local JSON workflows remain available'},
 limitations:['Ten requested US-listed pilot symbols; not a full-market screener.',
  'IEX is one venue, not the consolidated US tape.',
  'Unavailable metrics remain unknown; research conditions are not trade recommendations.',
  'Instrument keys and display categories require reconciliation before a broad security-master rollout.']
};}
