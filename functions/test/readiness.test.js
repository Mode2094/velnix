'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ROLES,STATUSES,canEditOrder,allowedTransition,validateOrderFields,canResolveDispatch,documentId,safeStatusMap}=require('../src/policy');
const {searchDigits,parseFilters,matchingFilters,normalizeCustomer}=require('../src/query');
const gm={id:'gm',role:'generalManager',active:true};
const fields={customer:'محمد',phone:'+962 (79) 123-4567',extraPhone:'٠٧٩١٢٣٤٥٦٧',city:'عمّان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amount:'12.345'};
test('shipment data is frozen during dispatch, uncertain dispatch and after sending',()=>{
  for(const state of ['sending','needs_review','sent'])for(const status of STATUSES){
    const order={createdBy:'gm',status,dispatchState:state};
    assert.equal(canEditOrder(gm,order),false);
    assert.equal(allowedTransition(gm,order,'cancelled'),false);
  }
  assert.equal(canEditOrder(gm,{createdBy:'gm',status:'inTransit'}),false);
  assert.equal(allowedTransition(gm,{createdBy:'gm',status:'ready',dispatchState:'idle'},'cancelled'),true);
});
test('expired sending lock can be manually resolved, live lock cannot',()=>{
  const base={status:'ready',dispatchState:'sending'};
  assert.equal(canResolveDispatch({...base,dispatchLockUntil:{toMillis:()=>200}},100),false);
  assert.equal(canResolveDispatch({...base,dispatchLockUntil:{toMillis:()=>100}},100),true);
  assert.equal(canResolveDispatch(base,100),false);
  assert.equal(canResolveDispatch({...base,status:'delivered'},100),false);
  assert.equal(canResolveDispatch({...base,dispatchState:'needs_review'}),true);
});
test('invalid money values cannot silently become zero or lose precision',()=>{
  for(const amount of ['',null,undefined,true,[],{},'1e2','0x10','12.3456',Infinity,NaN,-1,1000001])
    assert.throws(()=>validateOrderFields({...fields,amount}),/invalid_amount/);
  assert.equal(validateOrderFields({...fields,amount:'٠٫١٢٣'}).amountMinor,123);
  assert.equal(validateOrderFields({...fields,amount:0}).amountMinor,0);
});
test('phone fields require digits and normalize both Arabic and Persian',()=>{
  const out=validateOrderFields(fields);
  assert.equal(out.phone,'+962791234567');assert.equal(out.extraPhone,'0791234567');
  for(const phone of ['+++++++','-------','123456','1234567890123456','+12+345678'])
    assert.throws(()=>validateOrderFields({...fields,phone}),/invalid_phone/);
  assert.throws(()=>validateOrderFields({...fields,extraPhone:'oops'}),/invalid_phone/);
  assert.throws(()=>validateOrderFields({...fields,quantity:true}),/invalid_quantity/);
});
test('remote mapping rejects internal states and prototype keys',()=>{
  for(const target of ['created','review','preparing','ready','dispatched'])
    assert.throws(()=>safeStatusMap({remote:target}));
  assert.throws(()=>safeStatusMap(JSON.parse('{"__proto__":"delivered"}')));
});
test('document paths cannot escape their collection',()=>{
  for(const id of ['x/y/z','../orders','a.b','',null])assert.throws(()=>documentId(id));
  assert.equal(documentId('Abc_-9'),'Abc_-9');
});
test('Arabic and Persian phone search matches saved ASCII digits',()=>{
  assert.equal(searchDigits('٠٧٩-۱۲۳٤٥٦٧'),'0791234567');
  assert.equal(normalizeCustomer('  أحمد  آلاء '),'احمد الاء');
});
test('date, creator, company and status filters apply together with exclusive end',()=>{
  const filters=parseFilters({from:'2026-10-01T00:00:00Z',to:'2026-10-15T00:00:00Z',createdBy:'entry',companyId:'company',status:'ready',bucket:'delivery'});
  const order={createdAt:new Date('2026-10-14'),createdBy:'entry',companyId:'company',status:'ready'};
  assert.equal(matchingFilters(order,filters),true);
  for(const change of [{status:'review'},{companyId:null},{createdBy:'other'},{createdAt:new Date('2026-10-15')}])
    assert.equal(matchingFilters({...order,...change},filters),false);
  assert.throws(()=>parseFilters({from:'garbage'}));
  assert.throws(()=>parseFilters({from:'2026-10-15T00:00:00Z',to:'2026-10-01T00:00:00Z'}));
});
test('server action DTO matches roles and shipping locks',()=>{
  const {orderForUser}=require('../src/order_view');
  for(const role of ROLES){
    const doc={id:'order',data:()=>({createdBy:role,salesSupervisorId:'sales',status:'ready',companyId:'c',dispatchState:'sending'})};
    const actions=orderForUser({id:role,role,active:true,permissions:['editAllOrders','sendToDelivery']},doc).actions;
    assert.equal(actions.edit,false);assert.equal(actions.dispatch,false);assert.equal(actions.assign,false);assert.deepEqual(actions.statuses,[]);
  }
});
