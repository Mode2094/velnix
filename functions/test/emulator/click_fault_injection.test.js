'use strict';
/*
 * Click fault-injection audit: the failure modes the user explicitly listed.
 *
 *  - Click receives the order and answers successfully (ambiguous, never trusted
 *    as a confirmed body) -> needs_review / reconcile, no resend.
 *  - Click receives the order but Velnix sees a 503 or a timeout -> needs_review
 *    with the persisted merchant reference, and the next read-only getorder
 *    resolves it without a second setorder.
 *  - The internet drops mid-request -> needs_review, never idle-success.
 *  - A shipment that is already delivered/cancelled stops being tracked.
 *
 * Every path proves setorder is called at most once per order.
 */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_faults';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');
let sendCalls=0,sendError=null,readCalls=0,readError=null,readResponse=null;
clickDelivery.sendClickOrder=async()=>{sendCalls++;if(sendError)throw sendError;throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation',clickOrderRef:'SHOULD_NOT_APPEAR'});};
clickDelivery.readClickOrder=async()=>{readCalls++;if(readError)throw readError;return readResponse;};
const providers=require('../../src/providers');
providers.requireOperationalProvider=()=>({create:async()=>{sendCalls++;throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'});}});
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'faults_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});
const sync=id=>functions.syncClickOrder.run({auth,data:{id}});

before(async()=>{
  await db.doc('members/faults_gm').set({name:'Faults GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('companies/click_faults').set({name:'Click Faults',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_faults').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
async function ready(id){
  const ref=db.doc('orders/'+id);
  await ref.set({customer:'عميل الأعطال',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'faults_gm',status:'ready',dispatchState:'idle',companyId:'click_faults',orderType:'normal',revision:0});
  return ref;
}
const WAITING={status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T09:00:00',Ord_Status_Note:'x',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}};

test('a 503 after potential receipt keeps needs_review, persists the reference, and never resends',async()=>{
  sendCalls=0;sendError=Object.assign(new Error('click_send_rejected'),{code:'click_send_rejected',httpStatus:503});
  const ref=await ready('fault_503');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  assert.equal(sendCalls,1);
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'needs_review');
  assert.equal(data.clickOrderRef,'VNX-fault_503','the deterministic reference is persisted for reconciliation');
  assert.ok(data.nextClickSyncAt,'a verification pass is scheduled');
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(sendCalls,1,'needs_review blocks every resend');
  sendError=null;
});

test('a timeout after potential receipt is recovered by a read-only getorder and never resends',async()=>{
  sendCalls=0;readCalls=0;readError=null;readResponse=WAITING;
  sendError=Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation',httpStatus:400});
  const ref=await ready('fault_timeout');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  assert.equal(sendCalls,1);
  assert.equal((await ref.get()).data().dispatchState,'needs_review');
  // The next verification read finds the shipment at Click.
  const r=await sync(ref.id);
  assert.equal(r.shippingStatus,'awaitingPickup');
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'sent','a confirmed read resolves the uncertain send');
  assert.equal(data.status,'dispatched');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(sendCalls,1,'recovery never calls setorder again');
  assert.equal(readCalls,1);
  sendError=null;
});

test('a connection drop mid-request keeps needs_review and is never treated as success',async()=>{
  sendCalls=0;readCalls=0;
  sendError=Object.assign(new Error('socket hang up'),{code:'ECONNRESET'});
  const ref=await ready('fault_drop');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'needs_review','a dropped connection is never recorded as sent');
  assert.notEqual(data.status,'dispatched');
  assert.match(data.syncError,/غير مؤكدة/);
  assert.equal(sendCalls,1);
  sendError=null;
});

test('a shipment that is already terminal is not polled again by the sweep',async()=>{
  readCalls=0;readError=null;readResponse=WAITING;
  const ref=db.doc('orders/fault_terminal');
  const due=Timestamp.fromMillis(Date.now()-1000);
  await ref.set({customer:'عميل',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'faults_gm',status:'dispatched',dispatchState:'sent',companyId:'click_faults',clickOrderRef:'VNX-fault_terminal',
    shippingStatus:'delivered',shippingStatusSource:'click_api',revision:0,nextClickSyncAt:due});
  const before=(await ref.get()).data();
  await functions.syncClickStatuses.run({});
  const after=(await ref.get()).data();
  assert.equal(after.lastSyncAttemptAt??null,before.lastSyncAttemptAt??null,'a terminal shipment is not read by the sweep');
  assert.equal(after.shippingStatus,'delivered');
  assert.equal(after.nextClickSyncAt.toMillis(),before.nextClickSyncAt.toMillis(),'the terminal order is left untouched');
});
