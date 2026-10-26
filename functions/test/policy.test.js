const {test}=require('node:test'); const assert=require('node:assert/strict');
const {canSeeOrder,canEditOrder,allowedTransition,validateOrderFields,safeStatusMap,can}=require('../src/policy');
const users={ gm:{id:'admin',role:'generalManager',active:true}, manager:{id:'mgr',role:'manager',active:true,permissions:['viewAllOrders','updateOrderStatus']}, warehouse:{id:'wh',role:'warehouse',active:true}, sales:{id:'sales',role:'sales',active:true}, entry:{id:'entry',role:'dataEntry',active:true}, other:{id:'other',role:'dataEntry',active:true} };
const order={createdBy:'entry',salesSupervisorId:'sales',status:'created'};
test('five distinct roles and visible scopes',()=>{
  assert.equal(canSeeOrder(users.gm,order),true);
  assert.equal(canSeeOrder(users.manager,order),true);
  assert.equal(canSeeOrder(users.warehouse,order),true);
  assert.equal(canSeeOrder(users.sales,order),true);
  assert.equal(canSeeOrder(users.entry,order),true);
  assert.equal(canSeeOrder(users.other,order),false);
});
test('no remote status can be set manually',()=>{
  assert.equal(allowedTransition(users.gm,order,'delivered'),false);
  assert.equal(allowedTransition(users.gm,order,'inTransit'),false);
  assert.equal(allowedTransition(users.gm,order,'review'),true);
  assert.equal(allowedTransition(users.warehouse,order,'review'),true);
  assert.equal(allowedTransition(users.entry,order,'review'),false);
});
test('closed orders cannot be edited',()=>{
  assert.equal(canEditOrder(users.entry, {...order,status:'delivered'}),false);
  assert.equal(canEditOrder(users.gm, {...order,status:'cancelled'}),false);
});
test('invalid payloads rejected and integer fils used',()=>{
  const input={customer:'test',phone:'0791234567',city:'عمان',area:'X',address:'street',description:'box',amount:'12.345',quantity:1};
  assert.equal(validateOrderFields(input).amountMinor,12345);
  assert.throws(()=>validateOrderFields({...input,city:'Amman'}),/invalid_city/);
  assert.throws(()=>validateOrderFields({...input,amount:-1}));
  assert.throws(()=>validateOrderFields({...input,quantity:0}));
});
test('unknown shipping states cannot be mapped',()=>{
  assert.deepEqual(safeStatusMap({'delivered':'delivered'}),{delivered:'delivered'});
  assert.throws(()=>safeStatusMap({'delivered':'super-admin'}));
});
test('disabled member loses all permissions',()=>assert.equal(can({...users.gm,active:false},'manageEmployees'),false));
test('Arabic numeral input is normalized for amounts and quantity, while phones require 10 English digits',()=>{
  const {validateOrderFields}=require('../src/policy');
  const entry={customer:'محمد',phone:'0791234567',city:'عمان',area:'وسط البلد',address:'شارع',
    description:'طرد',quantity:'٢',amount:'١٢٫٥٠٠',paymentMethod:'عند الاستلام'};
  const order=validateOrderFields(entry);
  assert.equal(order.phone,'0791234567');
  assert.equal(order.quantity,2);
  assert.equal(order.amountMinor,12500);
  // Arabic-digit phones are rejected: exactly 10 English digits are required.
  assert.throws(()=>validateOrderFields({...entry,phone:'٠٧٩١٢٣٤٥٦٧'}),/invalid_phone/);
  assert.throws(()=>validateOrderFields({...entry,phone:'079123456'}),/invalid_phone/);
  assert.throws(()=>validateOrderFields({...entry,phone:'07912345678'}),/invalid_phone/);
  assert.throws(()=>validateOrderFields({...entry,phone:'0791234567',extraPhone:'٠٧٩١٢٣٤٥٦٧'}),/invalid_phone/);
});

test('internal completion is ready-only and never bypasses carrier or terminal states',()=>{
  for(const role of ['generalManager','warehouse','manager','sales','dataEntry']) {
    const actor={id:'owner',role,active:true,permissions:role==='manager'?['updateOrderStatus']:[]};
    const permitted=['generalManager','warehouse','manager'].includes(role);
    const ready={createdBy:'owner',status:'ready',companyId:null};
    assert.equal(allowedTransition(actor,ready,'delivered'),permitted);
    for(const dispatchState of ['sending','sent','needs_review'])assert.equal(allowedTransition(actor,{...ready,dispatchState},'delivered'),false);
    for(const marker of [{companyId:'carrier'},{hasDelivery:true},{trackingNumber:'tracking'},{remoteStatus:'delivered'}])assert.equal(allowedTransition(actor,{...ready,...marker},'delivered'),false);
    for(const status of ['created','review','preparing','dispatched','inTransit','delivered','returned','cancelled'])assert.equal(allowedTransition(actor,{...ready,status},'delivered'),false);
    for(const status of ['delivered','returned','cancelled'])for(const target of ['created','review','preparing','ready','dispatched','inTransit','delivered','returned','cancelled'])assert.equal(allowedTransition(actor,{...ready,status},target),false);
  }
});
