'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SHIPPING_STATUSES,shippingStatus}=require('../src/shipping_status');
const {orderForUser}=require('../src/order_view');
const {allowedTransition}=require('../src/policy');
test('seven client business states stay separate from preparation and never manufacture carrier money',()=>{
  assert.equal(SHIPPING_STATUSES.length,7);
  const user={id:'gm',active:true,role:'generalManager',permissions:[]};
  for(const state of SHIPPING_STATUSES){
    const source={createdBy:'owner',status:'dispatched',dispatchState:'sent',companyId:'click',shippingStatus:state,shippingStatusSource:'manual',clickAmounts:{orderAmountDuo:0,shippingDiscount:0,willPay:1},amountMinor:12345,collectedAmount:999,deliveryFee:12,refundAmount:5};
    const dto=orderForUser(user,{id:'order',data:()=>source});
    assert.equal(dto.status,'dispatched');assert.equal(dto.shippingStatus,state);assert.equal(dto.shippingStatusSource,'manual');assert.equal(dto.amount,12.345);
    assert.deepEqual(dto.clickAmounts,{orderAmountDuo:0,shippingDiscount:0,willPay:1},'raw Click amounts are visible to authorized users only');
    for(const field of ['collectedAmount','deliveryFee','refundAmount','netSettlement'])assert.equal(Object.hasOwn(dto,field),false);
    assert.equal(allowedTransition(user,source,state),false);
    assert.deepEqual(dto.actions.statuses,[]);
    const hidden=orderForUser({id:'sales',role:'sales',active:true,permissions:[]},{id:'order',data:()=>source});assert.equal(Object.hasOwn(hidden,'amount'),false);assert.equal(Object.hasOwn(hidden,'clickAmounts'),false);
  }
});
test('external codes and unknown states cannot pass as canonical business states',()=>{
  for(const value of [1,'1','shipping','partial',null,{},'__proto__'])assert.equal(shippingStatus(value),null);
});
