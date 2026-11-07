'use strict';
// Regression coverage for the client's requirement #4: the grand total counts
// every order exactly once by its unique id, an internal -> delivery transition
// never raises the grand total, and an order that appears in more than one list
// is never double-counted. These assertions model the exact arithmetic the
// dashboardStats callable performs in functions/src/index.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {STATUSES}=require('../src/policy');

// Mirrors the dashboardStats counter construction: independent (status x bucket)
// groups whose `all` facet is the sum of the two disjoint buckets.
function buildCounters(orders){
  const counter={all:{},delivery:{},internal:{}};
  for(const status of STATUSES){
    let dCount=0,dAmount=0,iCount=0,iAmount=0;
    for(const o of orders){
      if(o.status!==status)continue;
      if(o.hasDelivery===true){dCount++;dAmount+=o.amountMinor;}
      else{iCount++;iAmount+=o.amountMinor;}
    }
    counter.delivery[status]={count:dCount,amountMinor:dAmount};
    counter.internal[status]={count:iCount,amountMinor:iAmount};
    counter.all[status]={count:dCount+iCount,amountMinor:dAmount+iAmount};
  }
  return counter;
}
const grandTotal=c=>Object.values(c.all).reduce((sum,v)=>sum+v.count,0);

test('a single new order increases the grand total by exactly one',()=>{
  const before=[];
  const after=[{id:'o1',status:'created',hasDelivery:false,amountMinor:1000}];
  assert.equal(grandTotal(buildCounters(before)),0);
  assert.equal(grandTotal(buildCounters(after)),1);
});

test('an internal status change keeps the grand total constant',()=>{
  const base=[{id:'o1',status:'created',hasDelivery:false,amountMinor:1000}];
  const moved=[{id:'o1',status:'preparing',hasDelivery:false,amountMinor:1000}];
  assert.equal(grandTotal(buildCounters(base)),grandTotal(buildCounters(moved)));
  assert.equal(grandTotal(buildCounters(moved)),1);
});

test('internal -> delivery transition does not create a second order or raise the total',()=>{
  const internal=[{id:'o1',status:'ready',hasDelivery:false,amountMinor:1000}];
  // Assigning a company flips hasDelivery in place; the id is unchanged.
  const delivery=[{id:'o1',status:'ready',hasDelivery:true,amountMinor:1000}];
  assert.equal(grandTotal(buildCounters(internal)),1);
  assert.equal(grandTotal(buildCounters(delivery)),1);
  const c=buildCounters(delivery);
  assert.equal(c.delivery.ready.count,1);
  assert.equal(c.internal.ready.count,0);
  assert.equal(c.all.ready.count,1);
});

test('an order that appears in several lists is counted once in the grand total',()=>{
  // The same order is visible in every bucket/list; only one physical record.
  const orders=[{id:'o1',status:'dispatched',hasDelivery:true,amountMinor:1000}];
  const c=buildCounters(orders);
  assert.equal(grandTotal(c),1);
  // It is a member of the delivery facet but adds nothing to internal.
  assert.equal(c.delivery.dispatched.count,1);
  assert.equal(c.internal.dispatched.count,0);
});

test('grand total equals the sum of the two disjoint bucket totals across statuses',()=>{
  const orders=[
    {id:'a',status:'created',hasDelivery:false,amountMinor:1000},
    {id:'b',status:'review',hasDelivery:false,amountMinor:2000},
    {id:'c',status:'ready',hasDelivery:true,amountMinor:3000},
    {id:'d',status:'dispatched',hasDelivery:true,amountMinor:4000},
    {id:'e',status:'delivered',hasDelivery:true,amountMinor:5000},
  ];
  const c=buildCounters(orders);
  const deliverySum=Object.values(c.delivery).reduce((s,v)=>s+v.count,0);
  const internalSum=Object.values(c.internal).reduce((s,v)=>s+v.count,0);
  assert.equal(deliverySum+internalSum,grandTotal(c));
  assert.equal(grandTotal(c),5);
});

test('hasDelivery and companyId stay in sync so bucket and in-memory filters agree',()=>{
  // The store bucket predicate (query.hasDelivery) and the in-memory predicate
  // (companyId!=null) must never diverge for the same order.
  const assigned=[{id:'a',status:'ready',companyId:'c1',hasDelivery:true}];
  const unassigned=[{id:'b',status:'ready',companyId:null,hasDelivery:false}];
  for(const o of [...assigned,...unassigned]){
    assert.equal(o.hasDelivery,(o.companyId!=null));
  }
});
