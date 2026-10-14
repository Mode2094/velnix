'use strict';
// Bound RPCs across all state/bucket/creator groups, not just within one group.
async function aggregateGroups(groups,read) {
  const totals=groups.map(()=>({count:0,amountMinor:0}));
  const jobs=groups.flatMap((queries,index)=>queries.map(query=>({query,index})));
  let next=0;
  const worker=async()=>{
    while(next<jobs.length){
      const {query,index}=jobs[next++];
      const value=await read(query);
      totals[index].count+=value.count;
      totals[index].amountMinor+=value.amountMinor;
    }
  };
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));
  return totals;
}
module.exports={aggregateGroups};
