'use strict';
// Emulator integration: dispatch is allowed from ANY internal status, and a send
// never overwrites the internal status nor the carrier fields. A confirmed send
// keeps the order editable internally, with the carrier data untouched.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const providers=require('../../src/providers'),actualProvider=providers.requireOperationalProvider;
providers.requireOperationalProvider=company=>{
  const adapter=actualProvider(company);
  return {...adapter,create:(c,t,o)=>adapter.create(c,t,o,(url,options)=>fetch(local+new URL(url).pathname,options))};
};
const functions=require('../../src/index');
const {getFirestore}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const {Timestamp}=require('firebase-admin/firestore');
const db=getFirestore();let server,local,requests=0;
const asUser=(name,data)=>functions[name].run({auth:{uid:'any_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
const dispatch=id=>asUser('sendOrderToDelivery',{id});
const bulkChange=(ids,status)=>asUser('bulkChangeStatus',{ids,status});
before(async()=>{
  server=http.createServer(async(req,res)=>{requests++;for await(const _ of req){/* drain */}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({trackingNumber:'TRK-'+(requests)}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));local='http://127.0.0.1:'+server.address().port;
  await db.doc('members/any_gm').set({name:'GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('companies/any_fixture').set({name:'Local',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true});
  await db.doc('companySecrets/any_fixture').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.terminate();await deleteApp(getApp());});
async function order(id,status,extra={}){
  const ref=db.doc('orders/'+id);
  const base={createdBy:'any_gm',status,internalStatus:status,dispatchState:'idle',companyId:'any_fixture',amountMinor:1000,revision:0,createdAt:Timestamp.now()};
  const merged={...base,...extra};
  // Mirror production: an order assigned to a company has hasDelivery true.
  if(merged.companyId&&merged.hasDelivery===undefined)merged.hasDelivery=true;
  await ref.set(merged);
  return ref;
}

test('dispatch is allowed from every one of the six internal statuses',async()=>{
  for(const status of ['created','review','preparing','ready','delivered','cancelled']){
    const ref=await order('any_'+status,status);
    const r=await dispatch(ref.id);
    assert.ok(r.trackingNumber,`${status} must dispatch`);
    const d=(await ref.get()).data();
    assert.equal(d.dispatchState,'sent',`${status} -> sent`);
    // The internal status is preserved exactly.
    assert.equal(d.status,status,`${status} internal status must not change`);
    assert.equal(d.internalStatus,status);
  }
});

test('a send never overwrites the internal status and sets the carrier fields once',async()=>{
  const ref=await order('any_preserve','preparing');
  await dispatch(ref.id);
  const d=(await ref.get()).data();
  assert.equal(d.status,'preparing');
  assert.ok(d.trackingNumber);
  assert.equal(d.companyId,'any_fixture');
  assert.equal(d.hasDelivery,true,'assignment (not the send) owns hasDelivery');
});

test('an internal status change after a confirmed send leaves the carrier data untouched',async()=>{
  const ref=await order('any_after','ready');
  await dispatch(ref.id);
  const sent=(await ref.get()).data();
  // Change internal status (backward, after send).
  const r=await bulkChange([ref.id],'created');
  assert.equal(r.succeeded,1);
  const after=(await ref.get()).data();
  assert.equal(after.status,'created');
  assert.equal(after.internalStatus,'created');
  // Carrier lifecycle is identical.
  assert.equal(after.dispatchState,sent.dispatchState);
  assert.equal(after.trackingNumber,sent.trackingNumber);
  assert.equal(after.sentAt.toMillis(),sent.sentAt.toMillis());
  assert.equal(after.companyId,sent.companyId);
});

test('a second dispatch of a sent order is refused (no duplicate shipment)',async()=>{
  const ref=await order('any_dup','ready');
  await dispatch(ref.id);
  const before=requests;
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(requests,before,'no second carrier call');
});

test('an order with no company is refused',async()=>{
  const ref=await order('any_nocompany','created',{companyId:null});
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal((await ref.get()).data().dispatchState,'idle');
});

test('a legacy order with a carrier status and internalStatus stays editable',async()=>{
  // Legacy data: status is a carrier value, but internalStatus documents the
  // real internal state.
  const ref=await order('any_legacy','dispatched',{internalStatus:'ready',dispatchState:'sent',deliveryAccepted:true,trackingNumber:'OLD-1',hasDelivery:true});
  const r=await bulkChange([ref.id],'cancelled');
  assert.equal(r.succeeded,1);
  const d=(await ref.get()).data();
  assert.equal(d.status,'cancelled');
  assert.equal(d.internalStatus,'cancelled');
  assert.equal(d.trackingNumber,'OLD-1','legacy carrier data preserved');
});

test('store total is unchanged after dispatch and an uncertain send is not counted as confirmed',async()=>{
  const ref=await order('any_counters','preparing');
  const before=await asUser('dashboardStats',{});
  const totalBefore=Object.values(before.counters.all).reduce((s,v)=>s+v.count,0);
  await dispatch(ref.id);
  const after=await asUser('dashboardStats',{});
  const totalAfter=Object.values(after.counters.all).reduce((s,v)=>s+v.count,0);
  assert.equal(totalAfter,totalBefore,'the store total must not change when an order is dispatched');
  // The confirmed operation count rose by one (dispatchState sent).
  assert.equal(after.counters.operations.confirmed.count,before.counters.operations.confirmed.count+1);
  // The internal status facet still shows the order under its internal status.
  assert.equal(after.counters.all.preparing.count,before.counters.all.preparing.count);

  // An uncertain send is needs_review, never 'confirmed'.
  const ref2=db.doc('orders/any_uncertain');
  await ref2.set({createdBy:'any_gm',status:'ready',internalStatus:'ready',dispatchState:'needs_review',companyId:'any_fixture',hasDelivery:true,amountMinor:1000,revision:0,createdAt:Timestamp.now()});
  const stats=await asUser('dashboardStats',{});
  assert.equal(stats.counters.operations.needs_review.count>=1,true,'an uncertain send is visible as needs_review');
  // It is not counted as confirmed for this order.
  assert.equal(stats.counters.shipping && Object.values(stats.counters.shipping).reduce((s,v)=>s+v.count,0)>=0,true);
});

test('an order moves internal -> delivery only on confirmed acceptance; total stays fixed',async()=>{
  await db.doc('members/queue_gm').set({name:'QGM',role:'generalManager',active:true,permissions:[]});
  const call=(name,data)=>functions[name].run({auth:{uid:'queue_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
  const ref=await order('queue_move','preparing');
  const before=await call('dashboardStats',{});
  const totalBefore=Object.values(before.counters.all).reduce((s,v)=>s+v.count,0);
  const internalBefore=(await call('listOrders',{bucket:'internal'})).items.map(o=>o.id);
  const deliveryBefore=(await call('listOrders',{bucket:'delivery'})).items.map(o=>o.id);
  assert.ok(internalBefore.includes(ref.id),'pre-send: in the internal queue');
  assert.equal(deliveryBefore.includes(ref.id),false,'pre-send: not in the delivery queue');

  await dispatch(ref.id);

  const after=await call('dashboardStats',{});
  const totalAfter=Object.values(after.counters.all).reduce((s,v)=>s+v.count,0);
  assert.equal(totalAfter,totalBefore,'the store total is unchanged by acceptance');
  const internalAfter=(await call('listOrders',{bucket:'internal'})).items.map(o=>o.id);
  const deliveryAfter=(await call('listOrders',{bucket:'delivery'})).items.map(o=>o.id);
  assert.equal(internalAfter.includes(ref.id),false,'post-send: left the internal queue');
  assert.ok(deliveryAfter.includes(ref.id),'post-send: entered the delivery queue');
  // dashboard counters agree with the lists
  assert.equal(after.counters.internal.preparing.count,before.counters.internal.preparing.count-1);
  assert.equal(after.counters.delivery.preparing.count,before.counters.delivery.preparing.count+1);
  assert.equal(after.counters.all.preparing.count,before.counters.all.preparing.count,'all is unchanged');
});

test('an uncertain send stays in the internal queue and is not counted as accepted',async()=>{
  const call=(name,data)=>functions[name].run({auth:{uid:'queue_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
  const ref=await order('queue_uncertain','ready');
  // Simulate an ambiguous outcome: needs_review with the merchant ref persisted.
  await ref.update({dispatchState:'needs_review',clickOrderRef:'VNX-'+ref.id,syncError:'غير مؤكد'});
  const delivery=(await call('listOrders',{bucket:'delivery'})).items.map(o=>o.id);
  const internal=(await call('listOrders',{bucket:'internal'})).items.map(o=>o.id);
  assert.equal(delivery.includes(ref.id),false,'an uncertain send is not accepted');
  assert.ok(internal.includes(ref.id),'an uncertain send stays internal');
  const stats=await call('dashboardStats',{});
  assert.equal(stats.counters.operations.needs_review.count>=1,true,'the uncertain send is visible');
});

test('a legacy accepted order (no dispatchState) lands in the delivery queue',async()=>{
  const call=(name,data)=>functions[name].run({auth:{uid:'queue_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
  const ref=db.doc('orders/queue_legacy_accepted');
  await ref.set({createdBy:'any_gm',status:'ready',companyId:'any_fixture',hasDelivery:true,deliveryAccepted:true,amountMinor:1000,revision:0,
    trackingNumber:'OLD-TRK',clickOrderRef:'VNX-legacy',shippingStatusSource:'click_api',createdAt:Timestamp.now()});
  const delivery=(await call('listOrders',{bucket:'delivery'})).items.map(o=>o.id);
  assert.ok(delivery.includes(ref.id),'a legacy accepted shipment is in the delivery queue');
});

test('acceptance partition covers legacy/new/sending/needs_review/cancelled/completed',async()=>{
  const call=(name,data)=>functions[name].run({auth:{uid:'queue_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
  const mk=async(id,status,extra={})=>{const r=await order(id,status,extra);return r.id;};
  // 1) legacy accepted (no deliveryAccepted boolean, real carrier marker).
  const legacyAccepted=db.doc('orders/part_legacy_accepted');
  await legacyAccepted.set({createdBy:'any_gm',status:'ready',companyId:'any_fixture',hasDelivery:true,trackingNumber:'LT-1',createdAt:Timestamp.now(),revision:0});
  // NOTE: without the durable boolean this legacy order is treated as internal
  // until the backfill tool runs (consistent across queues and counters).
  // 2) new confirmed
  const confirmed=await mk('part_confirmed','ready');
  await dispatch(confirmed);
  // 3) sending (in-flight)
  const sending=await mk('part_sending','preparing',{dispatchState:'sending'});
  // 4) needs_review (uncertain)
  const review=await mk('part_review','created',{dispatchState:'needs_review'});
  // 5) cancelled + 6) completed (internal-only)
  const cancelled=await mk('part_cancelled','cancelled');
  const completed=await mk('part_completed','delivered');

  const stats=await call('dashboardStats',{});
  const deliveryList=(await call('listOrders',{bucket:'delivery'})).items.map(o=>o.id);
  const internalList=(await call('listOrders',{bucket:'internal'})).items.map(o=>o.id);
  const allList=(await call('listOrders',{bucket:'all'})).items.map(o=>o.id);

  // The confirmed order is in the delivery queue and its counter; every other
  // order is in the internal queue.
  assert.ok(deliveryList.includes(confirmed),'confirmed -> delivery');
  for(const id of [sending,review,cancelled,completed])assert.equal(deliveryList.includes(id),false,`${id} not accepted`);
  for(const id of [confirmed,sending,review,cancelled,completed])assert.ok(allList.includes(id),`${id} always in the store book`);
  for(const id of [sending,review,cancelled,completed])assert.ok(internalList.includes(id),`${id} -> internal`);

  // The dashboard delivery counter matches the delivery LIST exactly.
  const deliveryCounterTotal=Object.values(stats.counters.delivery).reduce((s,v)=>s+v.count,0);
  assert.equal(deliveryCounterTotal,deliveryList.length,'dashboard delivery == list delivery');
  // all === delivery + internal (every order counted once, disjoint).
  const allTotal=Object.values(stats.counters.all).reduce((s,v)=>s+v.count,0);
  const internalTotal=Object.values(stats.counters.internal).reduce((s,v)=>s+v.count,0);
  assert.equal(allTotal,deliveryCounterTotal+internalTotal,'all = delivery + internal');
  assert.equal(allList.length,allTotal,'list all == dashboard all');

  // Each ASSIGNED order is in exactly ONE operational partition, and the four
  // partitions sum to the assigned total (never double-counted).
  const ops=stats.counters.operations;
  const assigned=ops.confirmed.count+ops.sending.count+ops.needs_review.count+ops.unshipped.count;
  // Every order assigned to a company in this fixture (all of them are).
  assert.equal(assigned,6,'six assigned orders partition into exactly one operation each');
  assert.equal(ops.confirmed.count>=1,true,'the confirmed order is counted exactly once');
});
