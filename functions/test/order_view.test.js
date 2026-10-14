'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {orderForUser}=require('../src/order_view');
const doc={id:'order-X',data:()=>({customer:'زبون',phone:'0790000000',city:'عمان',area:'الدوار',address:'شارع',description:'شحنة',
  quantity:1,amountMinor:12500,paymentMethod:'عند الاستلام',status:'created',createdBy:'author',createdByName:'كاتب',companyId:null})};
test('other team cannot see amounts without viewAmounts',()=>{
  const out=orderForUser({id:'other',role:'sales',active:true,permissions:[]},doc);
  assert.equal(Object.hasOwn(out,'amount'),false);
});
test('owner sees own order amount',()=>{
  const out=orderForUser({id:'author',role:'dataEntry',active:true,permissions:[]},doc);
  assert.equal(out.amount,12.5);
});
test('explicit viewAmounts and general manager see amounts',()=>{
  for(const user of [{id:'other',role:'manager',active:true,permissions:['viewAmounts']},{id:'gm',role:'generalManager',active:true,permissions:[]}]){
    assert.equal(orderForUser(user,doc).amount,12.5);
  }
});
