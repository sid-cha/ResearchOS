import test from 'node:test';
import assert from 'node:assert/strict';
import {technicalIndicators} from '../lib/analysis.mjs';

const bars=(count=30)=>Array.from({length:count},(_,index)=>({t:new Date(Date.UTC(2026,8,1+index)).toISOString(),o:100+index,c:100+index,h:102+index,l:98+index,v:1000}));

test('null OHLCV values are rejected instead of becoming invented zero inputs or inflated ATR',()=>{
 const source=bars(16);
 const valid=source.slice(0,-1);
 source.at(-1).h=null;source.at(-1).l=null;source.at(-1).v=null;
 const value=technicalIndicators(source),expected=technicalIndicators(valid);
 assert.equal(value.barsCount,15);assert.equal(value.close,114);
 assert.equal(value.atr14,4);assert.equal(value.atr14,expected.atr14);
 assert.equal(value.asOf,valid.at(-1).t);
 assert.deepEqual(value.inputQuality,{validation:'partial',receivedBars:16,usableBars:15,rejectedBars:1});
 assert.equal(source.at(-1).h,null,'source records are not rewritten');
});

test('non-numeric, nonfinite, inconsistent and malformed bars do not enter technical calculations',()=>{
 const good=bars(1)[0];
 const bad=[null,[],{},'',
  ...['c','h','l','v','o'].flatMap(key=>[null,'',String(good[key]),NaN,Infinity].map(value=>({...good,[key]:value}))),
  {...good,c:0},{...good,h:0},{...good,l:0},{...good,v:-1},
  {...good,h:97},{...good,l:103},{...good,c:103},{...good,o:97}];
 const value=technicalIndicators([good,...bad]);
 assert.equal(value.barsCount,1);assert.equal(value.close,100);assert.equal(value.atr14,null);
 assert.equal(value.inputQuality.receivedBars,bad.length+1);
 assert.equal(value.inputQuality.rejectedBars,bad.length);
 assert.equal(value.inputQuality.usableBars,1);
});

test('real zero volume is accepted and can produce a measured zero relative-volume ratio',()=>{
 const source=bars(21);source.at(-1).v=0;
 const value=technicalIndicators(source);
 assert.equal(value.barsCount,21);assert.equal(value.volumeRatio20,0);
 assert.equal(value.inputQuality.validation,'valid');assert.equal(value.inputQuality.rejectedBars,0);
 const allZero=technicalIndicators(source.map(bar=>({...bar,v:0})));
 assert.equal(allZero.barsCount,21);assert.equal(allZero.volumeRatio20,null,'zero baseline volume has no defined ratio');
});

test('methodology exposes the existing rolling RSI and simple ATR without changing their formulas',()=>{
 const source=bars(30);delete source[0].o;
 const value=technicalIndicators(source);
 assert.equal(value.barsCount,30,'open remains optional for the existing indicator contract');
 assert.equal(value.rsi14,100);assert.equal(value.atr14,4);
 assert.equal(value.methodology.version,'technical-snapshot-v1');
 assert.deepEqual(value.methodology.rsi14,{period:14,averaging:'simple-rolling-gains-losses',wilderSmoothing:false});
 assert.deepEqual(value.methodology.atr14,{period:14,averaging:'simple-mean-of-true-range',wilderSmoothing:false});
 assert.match(value.coverage,/not Wilder/);
});

test('empty or malformed input containers return unavailable metrics with explicit input quality',()=>{
 for(const input of [null,undefined,{},'not-bars']){
  const value=technicalIndicators(input);
  assert.equal(value.barsCount,0);assert.equal(value.close,null);assert.equal(value.atr14,null);
  assert.equal(value.inputQuality.validation,'invalid-input');
  assert.equal(value.inputQuality.receivedBars,0);
 }
 const empty=technicalIndicators([]);
 assert.equal(empty.barsCount,0);assert.equal(empty.inputQuality.validation,'valid');
});
