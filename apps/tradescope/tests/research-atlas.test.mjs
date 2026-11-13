import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketAtlas} from '../lib/research-atlas.mjs';
import {buildTechnicalMetrics} from '../lib/research-technical.mjs';
import {INSTRUMENTS} from '../lib/research-catalog.mjs';
import {RESEARCH_NOW,dailyBars} from './helpers/research-fixtures.mjs';

const selected=symbols=>INSTRUMENTS.filter(item=>symbols.includes(item.symbol));
function company(symbol,{base=100,step=.1,source='ALPACA_IEX',adjustment='split',count=320}={}){
 const bars=dailyBars(count).map((bar,index)=>{const c=base+index*step;return {...bar,c,o:c,h:c+2,l:c-2};});
 const built=buildTechnicalMetrics(bars,{symbol,source,adjustment,now:RESEARCH_NOW,fetchedAt:new Date(RESEARCH_NOW).toISOString()});
 return {symbol,instrument:INSTRUMENTS.find(item=>item.symbol===symbol),observations:built.observations,series:built.series,methodology:{adjustment}};
}
const atlas=(records,extra={})=>buildMarketAtlas(records,{instruments:selected(records.map(item=>item.symbol)),now:RESEARCH_NOW,...extra});
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('pilot rows and equal-weight display groups retain dated sources and explain breadth',()=>{
 const records=[company('NVDA'),company('AMD',{base:200,step:-.1}),company('AAPL',{step:0})],result=atlas(records);
 assert.equal(result.rows.length,3);assert.equal(result.coverage.available,3);assert.equal(result.coverage.completeMarket,false);
 assert.equal(result.rows[0].metrics.close.value,131.9);assert.equal(result.rows[0].metrics.close.source,'ALPACA_IEX');
 const row=symbol=>result.rows.find(item=>item.symbol===symbol);
 assert.equal(row('NVDA').trends.sma200.relation,'above');assert.equal(row('AMD').trends.sma200.relation,'below');
 assert.equal(row('AAPL').trends.sma200.relation,'equal');
 assert.deepEqual([result.breadth.return1d.positive,result.breadth.return1d.negative,result.breadth.return1d.unchanged],[1,1,1]);
 assert.equal(result.breadth.sma20.eligible,3);assert.equal(result.breadth.sma50.above,1);assert.equal(result.breadth.sma200.equal,1);
 const group=result.groups.find(item=>item.name==='Semiconductors'),average=group.returns.return20dPct;
 near(average.value,(row('NVDA').metrics.return20dPct.value+row('AMD').metrics.return20dPct.value)/2);
 assert.deepEqual(average.contributors,['NVDA','AMD']);assert.equal(group.classification,'pilot display category');
 assert(result.limitations.some(value=>value.includes('not the US market')));
});

test('aligned price comparison starts at100 and uses exactly21 or64 common supplied dates',()=>{
 const records=[company('NVDA'),company('AMD',{base:200,step:.5})];
 const twenty=atlas(records).comparison,sixtyThree=atlas(records,{windowSessions:63}).comparison;
 assert.equal(twenty.status,'available');assert.equal(twenty.dates.length,21);assert.equal(sixtyThree.dates.length,64);
 for(const curve of twenty.series){assert.equal(curve.points[0].index,100);assert.equal(curve.points[0].returnPct,0);assert.equal(curve.adjustment,'split');assert.equal(curve.currency,'USD');}
 const latest=twenty.series[0].points.at(-1);near(latest.index,131.9/129.9*100);near(latest.returnPct,(131.9/129.9-1)*100);
 assert.equal(sixtyThree.series[0].points.at(-1).date,twenty.series[0].points.at(-1).date);
});

test('missing provider data stays unavailable and is excluded instead of zero-filled',()=>{
 const result=buildMarketAtlas([company('NVDA')],{instruments:selected(['NVDA','AMD']),now:RESEARCH_NOW});
 const missing=result.rows[1];assert.equal(missing.status,'unavailable');assert.equal(missing.metrics.return1dPct.value,null);
 assert.equal(result.breadth.return1d.eligible,1);assert.equal(result.breadth.return1d.unavailable,1);
 assert.equal(result.groups[0].returns.return5dPct.eligible,1);assert.equal(result.comparison.coverage.eligible,1);
 assert.deepEqual(result.comparison.excluded,[{symbol:'AMD',reason:'missing_data'}]);
 const empty=buildMarketAtlas(null,{instruments:selected(['NVDA']),now:RESEARCH_NOW});assert.equal(empty.breadth.return1d.status,'unavailable');assert.equal(empty.comparison.status,'unavailable');
});

test('old, future and incompletely dated observations cannot enter breadth or curves',()=>{
 const record=company('NVDA'),old=atlas([record],{now:RESEARCH_NOW+9*86400000});
 assert.equal(old.rows[0].metrics.close.reason,'stale_input');assert.equal(old.breadth.return1d.eligible,0);assert.equal(old.comparison.status,'unavailable');
 const unknown=structuredClone(record);unknown.observations.find(item=>item.id==='price.close').asOf='not-a-date';
 assert.equal(atlas([unknown]).rows[0].metrics.close.reason,'unknown_asof');
 const current=structuredClone(record);for(const item of current.observations){item.asOf='2026-11-12T05:00:00Z';item.periodEnd='2026-11-12';}
 assert.equal(atlas([current]).rows[0].metrics.close.reason,'incomplete_or_future_session');
 const future=structuredClone(record);future.observations.find(item=>item.id==='technical.return1dPct').availableAt='2026-11-13T18:00:00Z';
 assert.equal(atlas([future]).rows[0].metrics.return1dPct.reason,'future_availability');assert.equal(atlas([future]).breadth.return1d.eligible,0);
});

test('different source, fiscal window or method context blocks aggregate claims',()=>{
 const records=[company('NVDA'),company('AMD',{source:'ALPACA_SIP'})];
 let result=atlas(records);assert.equal(result.groups[0].returns.return1dPct.reason,'comparison_context_mismatch');assert.equal(result.breadth.return1d.eligible,0);assert.equal(result.comparison.reason,'comparison_context_mismatch');
 const periods=[company('NVDA'),company('AMD')];periods[1].observations.find(item=>item.id==='technical.return5dPct').periodStart='2026-11-03';
 result=atlas(periods);assert.equal(result.groups[0].returns.return5dPct.status,'unavailable');assert.equal(result.groups[0].returns.return1dPct.status,'available');
 const method=[company('NVDA'),company('AMD')];for(const metric of method[1].observations)metric.methodVersion='research-technicals-v2';
 assert.equal(atlas(method).breadth.return1d.reason,'comparison_context_mismatch');
});

test('metric adjustments and methods cannot silently disagree with their own snapshot',()=>{
 const records=[company('NVDA'),company('AMD')];
 records[1].observations.find(item=>item.id==='technical.return1dPct').details.adjustment='all';
 let result=atlas(records);assert.equal(result.rows[1].metrics.return1dPct.reason,'snapshot_context_mismatch');assert.equal(result.breadth.return1d.eligible,1);
 records[1].observations.find(item=>item.id==='technical.return20dPct').methodVersion='other-method-v1';
 result=atlas(records);assert.equal(result.rows[1].metrics.return20dPct.reason,'snapshot_context_mismatch');assert.equal(result.groups[0].returns.return20dPct.eligible,1);
});

test('ambiguous company records and duplicate metric IDs are quarantined',()=>{
 const record=company('NVDA'),duplicateMetric=structuredClone(record);
 duplicateMetric.observations.push({...duplicateMetric.observations.find(item=>item.id==='price.close'),value:999});
 assert.equal(atlas([duplicateMetric]).rows[0].metrics.close.reason,'ambiguous_metric');
 const duplicate=buildMarketAtlas([record,structuredClone(record)],{instruments:selected(['NVDA']),now:RESEARCH_NOW});
 assert.equal(duplicate.rows[0].status,'unavailable');assert.deepEqual(duplicate.coverage.ambiguousSymbols,['NVDA']);
 assert.equal(duplicate.comparison.status,'unavailable');
});

test('intersected curves never forward-fill an absent session',()=>{
 const records=[company('NVDA'),company('AMD')],removed=records[1].series.at(-5).session;
 records[1].series=records[1].series.filter(item=>item.session!==removed);
 const result=atlas(records).comparison;assert.equal(result.status,'available');assert.equal(result.dates.length,21);assert(!result.dates.includes(removed));
 for(const series of result.series)assert.deepEqual(series.points.map(item=>item.date),result.dates);
 assert.equal(result.coverage.commonSessions,259);
});

test('conflicting daily closes exclude the affected curve and preserve explicit coverage',()=>{
 const records=[company('NVDA'),company('AMD')],bad=records[1].series.at(-3);
 records[1].series.push({...bad,c:bad.c+1});
 const result=atlas(records).comparison;
 assert.equal(result.status,'available');assert.equal(result.coverage.eligible,1);assert.deepEqual(result.excluded,[{symbol:'AMD',reason:'missing_or_oversized_series'}]);
 records[1].series.shift();
 const conflict=atlas(records).comparison;assert.deepEqual(conflict.excluded,[{symbol:'AMD',reason:'conflicting_series_session'}]);
});

test('insufficient common history and series-snapshot disagreements remain unknown',()=>{
 const records=[company('NVDA',{count:20}),company('AMD',{count:20})];
 assert.equal(atlas(records).comparison.reason,'insufficient_common_sessions');
 const wrong=company('NVDA');wrong.series.at(-1).c+=1;
 assert.deepEqual(atlas([wrong]).comparison.excluded,[{symbol:'NVDA',reason:'series_snapshot_mismatch'}]);
});

test('unknown or mixed adjustment and currency inputs cannot create a comparison curve',()=>{
 const mixed=[company('NVDA'),company('AMD',{adjustment:'all'})];assert.equal(atlas(mixed).comparison.reason,'comparison_context_mismatch');
 const unknown=company('NVDA');delete unknown.methodology.adjustment;for(const item of unknown.observations)delete item.details.adjustment;
 assert.equal(atlas([unknown]).comparison.status,'unavailable');assert.equal(atlas([unknown]).breadth.return1d.reason,'unknown_comparison_context');
 const disagreement=company('NVDA');disagreement.methodology.adjustment='all';
 assert.equal(atlas([disagreement]).comparison.reason,'no_eligible_series');
 const currency=company('NVDA');currency.instrument={...currency.instrument,currency:'EUR'};
 assert.equal(atlas([currency]).rows[0].metrics.close.reason,'instrument_currency_mismatch');
});

test('bounded inputs and source-shaped output reject unsupported windows and omit opaque payloads',()=>{
 const record=company('NVDA');record.apiKey='PRIVATE_FIXTURE_SECRET';record.observations[0].raw={key:'PRIVATE_FIXTURE_SECRET'};
 const result=atlas([record]);assert(!JSON.stringify(result).includes('PRIVATE_FIXTURE_SECRET'));
 assert.throws(()=>atlas([record],{windowSessions:252}),RangeError);assert.throws(()=>atlas([record],{comparisonSymbols:['OTHER']}),TypeError);
 assert.throws(()=>atlas([record],{now:NaN}),TypeError);assert.throws(()=>buildMarketAtlas(Array.from({length:11},()=>record),{now:RESEARCH_NOW}),RangeError);
 assert.throws(()=>buildMarketAtlas([record],{instruments:[record.instrument,record.instrument],now:RESEARCH_NOW}),TypeError);
});

test('invalid value domains and overflowing normalization do not produce finite-looking results',()=>{
 const record=company('NVDA');
 record.observations.find(item=>item.id==='technical.rsi14').value=101;
 record.observations.find(item=>item.id==='technical.relativeVolume20').value=-1;
 record.observations.find(item=>item.id==='technical.return1dPct').value=-100;
 const row=atlas([record]).rows[0];
 for(const key of ['rsi14','relativeVolume20','return1dPct']){assert.equal(row.metrics[key].value,null);assert.equal(row.metrics[key].reason,'invalid_value_range');}
 const overflow=company('NVDA');overflow.series.at(-21).c=Number.MIN_VALUE;
 const result=atlas([overflow]).comparison;assert.equal(result.status,'unavailable');assert.equal(result.reason,'invalid_normalization');assert.deepEqual(result.series,[]);
});
