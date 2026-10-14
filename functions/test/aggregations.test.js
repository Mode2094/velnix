'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {aggregateGroups}=require('../src/aggregations');
test('all creator chunks across status and bucket groups share a four-RPC bound',async()=>{
  const groups=Array.from({length:18},(_,group)=>Array.from({length:3},(_,chunk)=>({id:group*3+chunk,group,count:chunk+1,amountMinor:100*(chunk+1)})));
  let active=0,peak=0;const calls=[];
  const result=await aggregateGroups(groups,async query=>{
    active++;peak=Math.max(peak,active);calls.push(query.id);
    await new Promise(resolve=>setImmediate(resolve));
    active--;return {count:query.count,amountMinor:query.amountMinor};
  });
  assert.equal(peak,4);assert.equal(active,0);
  assert.deepEqual(calls.sort((a,b)=>a-b),Array.from({length:54},(_,i)=>i));
  assert.deepEqual(result,Array.from({length:18},()=>({count:6,amountMinor:600})));
});
test('out-of-order completion preserves group association and exact totals',async()=>{
  const waiting=new Map();const started=[];
  const done=aggregateGroups([[0,1],[2],[],[3]],id=>new Promise(resolve=>{started.push(id);waiting.set(id,resolve);}));
  assert.deepEqual(started,[0,1,2,3]);
  for(const id of [3,1,2,0])waiting.get(id)({count:id+1,amountMinor:(id+1)*11});
  assert.deepEqual(await done,[{count:3,amountMinor:33},{count:3,amountMinor:33},{count:0,amountMinor:0},{count:4,amountMinor:44}]);
});
test('an aggregation failure rejects the entire result rather than returning partial counters',async()=>{
  const failure=new Error('fixture_query_failure');
  await assert.rejects(aggregateGroups([[1,2,3]],async id=>{if(id===2)throw failure;return {count:1,amountMinor:0};}),error=>error===failure);
});
test('empty scopes make no RPCs and hidden amounts remain zero',async()=>{
  assert.deepEqual(await aggregateGroups([],()=>{throw Error('must not read');}),[]);
  assert.deepEqual(await aggregateGroups([[],[1,2]],async()=>({count:1,amountMinor:0})),[{count:0,amountMinor:0},{count:2,amountMinor:0}]);
});
