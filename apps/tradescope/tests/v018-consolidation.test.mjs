/**
 * v0.18 cumulative release guard.
 * Checks that previous modules and their active API/UI wiring survive refactoring.
 * Not a claim of live upstream, trading-model or browser validation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const load=path=>readFile(join(ROOT,path),'utf8');
const contracts=[
 {release:'v0.10',path:'lib/discovery-api.mjs',symbols:['createDiscoveryApi']},
 {release:'v0.11',path:'lib/filing-intelligence.mjs',symbols:['analyzeFilingDocument','createFilingReader']},
 {release:'v0.12',path:'lib/research-monitor.mjs',symbols:['createResearchMonitor']},
 {release:'v0.13',path:'lib/monitor-chart-api.mjs',symbols:['normalizeDailyCandles','createMonitorChartApi','/api/chart/daily']},
 {release:'v0.14',path:'lib/intraday-chart.mjs',symbols:['normalizeIntradayBars','createIntradayChartApi','/api/chart/intraday']},
 {release:'v0.14',path:'lib/crisis-atlas.mjs',symbols:['createCrisisAtlas','createCrisisAtlasApi','/api/crisis/catalog','/api/crisis/case']},
 {release:'v0.15',path:'lib/macro-vintage.mjs',symbols:['createMacroVintage','createMacroVintageApi','/api/macro/snapshot','realtime_start','realtime_end']},
 {release:'v0.16',path:'lib/historical-backtest.mjs',symbols:['createHistoricalBacktest','createHistoricalBacktestApi','/api/backtest/replay','forwardOutcome']},
 {release:'v0.17',path:'lib/long-history-market.mjs',symbols:['createLongHistoryMarket','normalizeEodhdDaily','EODHD_INTERNAL_RESEARCH_ENABLED','EODHD_API_TOKEN']}
];

test('v0.18 cumulative branch retains v0.10–v0.17 module entry points',async()=>{
 for(const contract of contracts){
  const source=await load(contract.path);
  for(const symbol of contract.symbols)
   assert(source.includes(symbol),contract.release+': missing '+symbol+' in '+contract.path);
 }
});

test('all historical research modules remain connected to the same server',async()=>{
 const server=await load('server.mjs');
 for(const name of [
  'createResearchApi','createRegulatoryApi','createDiscoveryApi','createMonitorChartApi',
  'createIntradayChartApi','createCrisisAtlasApi','createMacroVintageApi','createHistoricalBacktestApi',
  'createLongHistoryMarket','if(await backtestApi(req,res,u))return;'
 ])assert(server.includes(name),'server missing '+name);
});

test('research and crisis workspace preserve legacy research and recent replay controls',async()=>{
 const [research,crisis,index,build]=await Promise.all([
  load('research-workspace.js'),load('crisis-workspace.js'),load('index.html'),load('scripts/build-static.mjs')
 ]);
 for(const path of ['/api/research/catalog','/api/research/evaluate','/api/research/analogues'])
  assert(research.includes(path),'research UI missing '+path);
 for(const path of ['/api/crisis/catalog','/api/crisis/case','/api/macro/snapshot','/api/backtest/replay','crisisReplayRun'])
  assert(crisis.includes(path),'crisis UI missing '+path);
 assert(index.includes('crisis-workspace.js'));
 assert(build.includes('crisis-workspace.js'));
});

test('release gate and per-feature regression suites remain in repository',async()=>{
 for(const path of [
  'tests/historical-backtest.test.mjs','tests/macro-vintage.test.mjs','tests/long-history-market.test.mjs',
  'tests/crisis-atlas.test.mjs','tests/intraday-chart.test.mjs','tests/monitor-candles-ui.test.mjs',
  'docs/V014_CRISIS_CLIMATE_EARLY_WARNING_RESEARCH.md',
  'docs/V015_POINT_IN_TIME_MACRO_INTELLIGENCE.md',
  'docs/V016_HISTORICAL_WARNING_BACKTEST.md',
  'docs/V017_LONG_HISTORICAL_MARKET_DATA.md',
  'docs/STACKED_RELEASE_VALIDATION_GATE.md'
 ]){
  const content=await load(path);
  assert(content.length>50,'expected substantive source file '+path);
 }
});
