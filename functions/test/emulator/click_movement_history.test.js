'use strict';
/*
 * Click movement-history and recovery audit.
 *
 * This file complements click_reconcile.test.js by exercising the journeys the
 * user asked about that were not already asserted there:
 *
 *  - a shipment that moves through several states over time writes one history
 *    entry per real transition, keeps the newest state, and never duplicates an
 *    event when the same status is re-synced;
 *  - a getorder failure followed by a later success recovers the order without
 *    ever re-sending setorder;
 *  - a terminal state (delivered / cancelled) stops the tracking schedule;
 *  - a non-normal / unlinked order never fabricates an external Click state;
 *  - the periodic sweep (syncClickStatuses) applies the same protections.
 *
 * The Click adapter and KMS are injected; callable handlers, Firestore
 * transactions, events and audit records are real.
 */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_movement';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');
let clickReadCalls=0,clickSendCalls=0,clickReadError=null,clickReadResponse=null;
clickDelivery.readClickOrder=async()=>{clickReadCalls++;if(clickReadError)throw clickReadError;return clickReadResponse;};
clickDelivery.sendClickOrder=async()=>{clickSendCalls++;throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation',clickOrderRef:'SHOULD_NOT_BE_SENT'});};
const providers=require('../../src/providers');
providers.requireOperationalProvider=()=>({create:async()=>{clickSendCalls++;throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'});}});
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'movement_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const sync=id=>functions.syncClickOrder.run({auth,data:{id}});
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});
const response=(statusLabel,date)=>({status:200,json:{result:{Stat_App_Nm:statusLabel,Status_Date:date,Ord_Status_Note:'ملاحظة',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}});

before(async()=>{
  for(const field of ['clickOrderRef'])for(const value of ['VNX-MOVEMENT-1'])for(const stale of (await db.collection('orders').where(field,'==',value).get()).docs)await stale.ref.delete();
  await db.doc('members/movement_gm').set({name:'Movement GM',role:'generalManager',active:true,permissions:[],salesSupervisorId:null});
  await db.doc('companies/click_movement').set({name:'Click Movement',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_movement').set({apiTokenCiphertext:'mock-ciphertext'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
async function linkedOrder(id,over={}){
  const ref=db.doc('orders/'+id);
  await ref.set({customer:'عميل الحركة',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'movement_gm',status:'dispatched',dispatchState:'sent',companyId:'click_movement',clickOrderRef:'VNX-'+id,
    shippingStatus:'awaitingPickup',shippingStatusSource:'manual',revision:0,...over});
  return ref;
}
const events=async(ref,action)=>(await ref.collection('events').where('action','==',action).get()).size;

test('a shipment that moves through several states writes one history entry per real transition and keeps the newest state',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=await linkedOrder('movement_multi');
  // Step 1: waiting approval (API-confirmed for this order).
  clickReadResponse=response('قيد انتظار الموافقة','2026-10-19T08:00:00');
  let r=await sync(ref.id);
  assert.equal(r.applied,true);assert.equal(r.shippingStatus,'awaitingPickup');
  // Step 2: moved to the carrier warehouse.
  clickReadResponse=response('في مخزن الشحن','2026-10-19T12:00:00');
  r=await sync(ref.id);
  assert.equal(r.applied,true);assert.equal(r.shippingStatus,'carrierWarehouse');
  // Step 3: out for delivery.
  clickReadResponse=response('في الشحن','2026-10-20T09:00:00');
  r=await sync(ref.id);
  assert.equal(r.applied,true);assert.equal(r.shippingStatus,'outForDelivery');
  // Step 4: delivered (terminal).
  clickReadResponse=response('تم التسليم','2026-10-21T15:30:00');
  r=await sync(ref.id);
  assert.equal(r.applied,true);assert.equal(r.shippingStatus,'delivered');

  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(data.clickStatusRaw,'تم التسليم');
  assert.equal(data.clickStatusDateMs,Date.parse('2026-10-21T15:30:00Z'));
  assert.equal(data.nextClickSyncAt,null,'a terminal state stops the tracking schedule');
  assert.equal(await events(ref,'click_status_synced'),4,'one history entry per real transition');
  assert.equal(clickSendCalls,0,'status tracking never calls setorder');
});

test('re-syncing an unchanged status appends no new history entry and does not advance the revision',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=await linkedOrder('movement_idempotent');
  clickReadResponse=response('في الشحن','2026-10-20T09:00:00');
  const first=await sync(ref.id);
  assert.equal(first.applied,true);
  const revAfterFirst=(await ref.get()).data().revision;
  const second=await sync(ref.id);
  assert.equal(second.applied,false,'the same status date and state is a no-op');
  assert.equal((await ref.get()).data().revision,revAfterFirst,'an unchanged sync does not advance the revision');
  assert.equal(await events(ref,'click_status_synced'),1,'the duplicate sync adds no second history entry');
  assert.equal(clickSendCalls,0);
});

test('a getorder failure leaves the state untouched; a later success recovers it, and no shipment is ever re-sent',async()=>{
  clickReadCalls=0;clickSendCalls=0;
  const ref=await linkedOrder('movement_recover');
  // First sync fails at transport level.
  clickReadError=Object.assign(new Error('timeout'),{name:'AbortError'});
  await assert.rejects(sync(ref.id),{code:'unavailable'});
  let data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'awaitingPickup','a failed sync never modifies the local state');
  assert.match(data.syncError,/تعذر|تعذرت/);
  assert.ok(data.nextClickSyncAt,'a failed sync is scheduled for a retry');
  assert.equal(await events(ref,'click_sync_failed'),1);
  assert.equal(clickSendCalls,0);
  // Later the same day getorder succeeds.
  clickReadError=null;
  clickReadResponse=response('تم التسليم','2026-10-22T10:00:00');
  const r=await sync(ref.id);
  assert.equal(r.applied,true);assert.equal(r.shippingStatus,'delivered');
  data=(await ref.get()).data();
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(data.syncError,null,'a successful sync clears the previous error');
  assert.equal(await events(ref,'click_status_synced'),1);
  assert.equal(clickSendCalls,0,'recovery never re-sends setorder');
});

test('a cancelled shipment is terminal in the same way as delivered and stops polling',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=await linkedOrder('movement_cancelled',{shippingStatus:'inShippingToSender',shippingStatusSource:'click_api',clickStatusDate:'2026-10-20T00:00:00',clickStatusDateMs:Date.parse('2026-10-20T00:00:00Z')});
  clickReadResponse=response('ملغي','2026-10-23T11:00:00');
  const r=await sync(ref.id);
  assert.equal(r.shippingStatus,'cancelled');
  assert.equal((await ref.get()).data().nextClickSyncAt,null,'cancelled stops the schedule');
});

test('an unknown carrier label is never converted into a fabricated local state',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=await linkedOrder('movement_unknown',{shippingStatus:'awaitingPickup',shippingStatusSource:'click_api',clickStatusDate:'2026-10-19T00:00:00',clickStatusDateMs:Date.parse('2026-10-19T00:00:00Z')});
  clickReadResponse={status:200,json:{result:{Stat_App_Nm:'حالة غريبة غير موثقة',Status_Date:'2026-10-24T00:00:00',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}};
  await assert.rejects(sync(ref.id),{code:'unavailable'});
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'awaitingPickup','an unknown label never overwrites the confirmed local state');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.match(data.syncError,/غير معروفة/);
  assert.equal(await events(ref,'click_sync_failed'),1);
  assert.equal(clickSendCalls,0);
});

test('the scheduled sweep applies a real transition and a terminal state stops the schedule',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=await linkedOrder('movement_sweep',{nextClickSyncAt:Timestamp.fromMillis(Date.now()-1000)});
  clickReadResponse=response('تم التسليم','2026-10-25T08:00:00');
  await functions.syncClickStatuses.run({});
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(data.nextClickSyncAt,null,'the sweep also stops terminal orders');
  assert.ok(clickReadCalls>=1);
  assert.equal(clickSendCalls,0);
});

test('a non-normal order type can never be sent to Click and never acquires a fake external state',async()=>{
  clickReadCalls=0;clickSendCalls=0;clickReadError=null;
  const ref=db.doc('orders/movement_return_type');
  await ref.set({customer:'عميل الحركة',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'movement_gm',status:'ready',dispatchState:'idle',companyId:'click_movement',clickOrderRef:'VNX-movement_return_type',orderType:'return',revision:0});
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(clickSendCalls,0,'a return-order type is never sent to Click');
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,undefined,'no external state is manufactured for an unsent order');
  assert.equal(data.dispatchState,'idle');
});
