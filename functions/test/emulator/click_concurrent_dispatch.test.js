'use strict';
/*
 * Concurrent direct-dispatch audit: two devices pressing "send to Click" on the
 * same order at the same moment.
 *
 * `sendOrderToDelivery` is the single-order path used by the order details
 * screen. Its only guard against a duplicate carrier shipment is the Firestore
 * transaction that flips dispatchState idle -> sending under a unique lock id.
 * This test proves a second concurrent caller is rejected before any external
 * call, so setorder is performed exactly once. It complements the bulk-claim
 * test, which covers bulkDispatch.
 */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_concurrent';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');
let sendCalls=0,sendRelease;
// A controllable carrier call that blocks the first send until both callers have
// reached the dispatch path, modelling two humans tapping at nearly the same time.
clickDelivery.sendClickOrder=async()=>{
  sendCalls++;
  await new Promise(resolve=>{sendRelease=resolve;});
  return {trackingNumber:'TRK-CONCURRENT-1'};
};
clickDelivery.readClickOrder=async()=>({status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00',Ord_Status_Note:'x',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}});
const functions=require('../../src/index');
const {getFirestore}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'concurrent_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});

before(async()=>{
  await db.doc('members/concurrent_gm').set({name:'Concurrent GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('companies/click_concurrent').set({name:'Click Concurrent',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_concurrent').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('two concurrent direct dispatches of the same order reach Click exactly once',async()=>{
  sendCalls=0;sendRelease=undefined;
  const ref=db.doc('orders/concurrent_direct');
  await ref.set({customer:'عميل التزامن',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'concurrent_gm',status:'ready',dispatchState:'idle',companyId:'click_concurrent',orderType:'normal',revision:0});

  // Fire both send requests; the first acquires the dispatch lock, the second
  // must be refused by the transaction before it can reach Click.
  const first=dispatch(ref.id);
  // Give the first request time to win the transaction and enter sendClickOrder.
  await new Promise(resolve=>setTimeout(resolve,300));
  const second=dispatch(ref.id);
  const secondResult=await second.then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  assert.equal(secondResult.ok,false,'the second concurrent send must be refused');
  assert.equal(secondResult.code,'failed-precondition');
  assert.equal(sendCalls,1,'exactly one external setorder call while the first is in flight');

  // Release the carrier call and let the real sender finish.
  sendRelease();
  const firstResult=await first;
  assert.equal(firstResult.trackingNumber,'TRK-CONCURRENT-1');

  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'sent');
  assert.equal(data.status,'dispatched');
  assert.equal(sendCalls,1,'no duplicate shipment was created');
  assert.equal((await ref.collection('events').where('action','==','sent_to_delivery').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.sent_to_delivery').get()).size,1);

  // A later third attempt is also refused because the order is already sent.
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(sendCalls,1);
});
