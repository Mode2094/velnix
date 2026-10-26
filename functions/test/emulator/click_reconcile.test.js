'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_delivery_1603,click_fixture';
// KMS and the carrier transport are injected; callable handlers, Firestore
// transactions, audit and event records are real.
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');
const REAL_CLICK_RESPONSE={result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00',Ord_Status_Note:'شحنة قيد انتظار الموافقة',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}};
let clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};
let clickReadError=null;
let clickReadCalls=0;
clickDelivery.readClickOrder=async()=>{clickReadCalls++;if(clickReadError)throw clickReadError;return clickReadResponse;};
let clickSendError=null;
let clickSendCalls=0;
clickDelivery.sendClickOrder=async()=>{clickSendCalls++;if(clickSendError)throw clickSendError;return {trackingNumber:'SHOULD_NOT'};};
const providers=require('../../src/providers'),actualProvider=providers.requireOperationalProvider;
let clickCreateCalls=0;
providers.requireOperationalProvider=company=>{
  if(company.provider==='click_delivery_v1'){
    // Validate the exact documented Click base without invoking the blocked
    // production adapter, then inject the local Click-shaped transport.
    providers.providerFor(company);
    return {create:async()=>{clickCreateCalls++;throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'});}};
  }
  const adapter=actualProvider(company);
  return {...adapter,create:async()=>({trackingNumber:'LOCAL-1'})};
};
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'click_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});
const reconcile=data=>functions.reconcileClickShipment.run({auth,data});
const sync=id=>functions.syncClickOrder.run({auth,data:{id}});
const salesAuth={uid:'click_sales',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
before(async()=>{
  // Keep this file idempotent when a local emulator is reused between runs.
  for(const [field,values] of [
    ['clickOrderRef',['VNX-CLICK-TEST-20261019-d','REF-AMBIGUOUS-SEND','REF-UNIQUE-1','REF-UNIQUE-2','REF-API-CONFIRMED','REF-GENERIC']],
    ['providerOrderId',['1318368','7777777','7777778','8888888']],
  ]){
    for(const value of values){
      const stale=await db.collection('orders').where(field,'==',value).get();
      for(const doc of stale.docs)await doc.ref.delete();
    }
  }
  await db.doc('members/click_gm').set({name:'Fixture GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('members/click_sales').set({name:'Fixture Sales',role:'sales',active:true,permissions:[]});
  await db.doc('companies/click_fixture').set({name:'Click Fixture',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_fixture').set({apiTokenCiphertext:'mock-ciphertext'});
  await db.doc('companies/generic_fixture').set({name:'Generic Fixture',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/generic_fixture').set({apiTokenCiphertext:'mock-ciphertext'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
async function clickOrder(id,over={}){
  const ref=db.doc('orders/'+id);
  await ref.set({customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',
    quantity:1,amountMinor:1000,createdBy:'click_gm',status:'ready',dispatchState:'idle',companyId:'click_fixture',revision:0,...over});
  return ref;
}
test('an ambiguous Click create keeps needs_review, stores the exact merchant reference and blocks a resend',async()=>{
  clickSendCalls=0;
  clickSendError=Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation',clickOrderRef:'REF-AMBIGUOUS-SEND',clickClientSerial:'SERIAL-AMBIGUOUS-SEND'});
  const ref=await clickOrder('click_ambiguous');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  assert.equal(clickSendCalls,1,'exactly one carrier attempt is allowed');
  const afterFirst=(await ref.get()).data();
  assert.equal(afterFirst.dispatchState,'needs_review');
  assert.match(afterFirst.syncError,/Click قد يكون أنشأ الشحنة/);
  assert.equal(afterFirst.clickOrderRef,'REF-AMBIGUOUS-SEND');
  assert.equal(afterFirst.clickClientSerial,'SERIAL-AMBIGUOUS-SEND');
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(clickSendCalls,1,'the review state must block an automatic resend');
  assert.equal((await ref.collection('events').where('action','==','dispatch_attempt_failed').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.dispatch_attempt_failed').get()).size,1);
  clickSendError=null;
});
test('a pre-send credential failure never starts the carrier call and stays safe to retry',async()=>{
  clickSendCalls=0;clickReadCalls=0;
  // The company is allowed, but its credential doc is missing: the failure
  // happens while preparing the connection, before any external HTTP call.
  const secret=await db.doc('companySecrets/click_fixture').get();
  const backup=secret.data();
  await db.doc('companySecrets/click_fixture').delete();
  try {
    const ref=await clickOrder('click_pre_send_failure');
    await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
    assert.equal(clickSendCalls,0,'Click must never be contacted when credentials cannot be prepared');
    const data=(await ref.get()).data();
    assert.equal(data.dispatchState,'idle','a pre-send failure returns to idle, not needs_review');
    assert.equal(data.dispatchLockId,undefined);
    assert.equal(data.syncError,'تعذر تجهيز اتصال شركة التوصيل. لم تبدأ محاولة الإرسال. راجع المسؤول.');
    assert.equal((await ref.collection('events').where('action','==','dispatch_preparation_failed').get()).size,1);
    assert.equal((await ref.collection('events').where('action','==','dispatch_attempt_failed').get()).size,0);
  } finally {
    await db.doc('companySecrets/click_fixture').set(backup);
  }
});
test('a non-ambiguous dispatch failure still persists the deterministic merchant reference',async()=>{
  clickSendCalls=0;clickReadCalls=0;
  // A transport-style rejection (not the Int64 ambiguous case) must still keep
  // VNX-<docId> so the shipment can be verified later with a read-only getorder.
  clickSendError=Object.assign(new Error('click_send_rejected'),{code:'click_send_rejected',httpStatus:503});
  const ref=await clickOrder('click_rejected_ref');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'needs_review');
  assert.equal(data.clickOrderRef,'VNX-'+ref.id,'the deterministic reference is persisted before any read');
  assert.ok(data.nextClickSyncAt,'the failed dispatch is scheduled for automatic verification');
});
test('a confirmed read auto-resolves an uncertain dispatch without creating a shipment',async()=>{
  clickSendCalls=0;clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};
  const ref=await clickOrder('click_auto_resolve',{status:'ready',dispatchState:'needs_review',clickOrderRef:'VNX-click_auto_resolve',syncError:'نتيجة إرسال غير مؤكدة'});
  const result=await sync(ref.id);
  assert.equal(result.shippingStatus,'awaitingPickup');
  const data=(await ref.get()).data();
  // The shipment demonstrably exists (the read used our unique reference), so the
  // uncertain dispatch is resolved to sent — and no shipment was created here.
  assert.equal(data.dispatchState,'sent');
  assert.equal(data.status,'dispatched');
  assert.equal(data.syncError,null);
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(clickSendCalls,0,'auto-resolution never creates a shipment');
  assert.equal(clickReadCalls,1,'exactly one read call is used');
  assert.equal((await ref.collection('events').where('action','==','dispatch_exception_resolved').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.dispatch_review_auto_resolved').get()).size,1);
  // Once resolved, a second dispatch is refused.
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
});
test('a failed verification read keeps the uncertain dispatch protected',async()=>{
  clickSendCalls=0;clickReadCalls=0;
  clickReadError=Object.assign(new Error('timeout'),{name:'AbortError'});
  const ref=await clickOrder('click_review_unresolved',{status:'ready',dispatchState:'needs_review',clickOrderRef:'VNX-review-unresolved'});
  await assert.rejects(sync(ref.id),{code:'unavailable'});
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'needs_review','an inconclusive read never clears the review state');
  assert.equal(clickSendCalls,0);
});
test('the server-side Click send flag keeps the path blocked before any carrier call',async()=>{
  clickSendCalls=0;
  await db.doc('companies/click_fixture').update({clickSendEnabled:false});
  try {
    const ref=await clickOrder('click_send_disabled_flag');
    await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
    assert.equal(clickSendCalls,0,'no carrier call is attempted while the flag is off');
  } finally {
    await db.doc('companies/click_fixture').update({clickSendEnabled:true});
  }
});
test('reconciling the existing Click shipment keeps the policy number and merchant reference separate',async()=>{
  clickSendCalls=0;
  const ref=await clickOrder('click_reconcile',{dispatchState:'needs_review',syncError:'نتيجة إرسال غير مؤكدة'});
  await reconcile({id:ref.id,clickOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',clickClientSerial:'VNX-CLICK-TEST-20261019-d4a0f8fb',shippingStatus:'awaitingPickup',reason:'تحقق يدوي من بوابة Click Delivery'});
  const data=(await ref.get()).data();
  assert.equal(data.providerOrderId,'1318368');
  assert.equal(data.clickOrderRef,'VNX-CLICK-TEST-20261019-d');
  assert.equal(data.clickClientSerial,'VNX-CLICK-TEST-20261019-d4a0f8fb');
  assert.equal(data.shippingStatus,'awaitingPickup');
  assert.equal(data.shippingStatusSource,'manual');
  assert.equal(data.dispatchState,'sent');
  assert.equal(data.status,'dispatched');
  assert.equal(data.trackingNumber ?? null,null,'the Click order id is not copied into the carrier tracking field');
  assert.equal(data.nextPollAt ?? null,null,'no automatic Click poll is scheduled while its contract is unconfirmed');
  assert.equal((await ref.collection('events').where('action','==','click_reconciled').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.click_reconciled').get()).size,1);
  await reconcile({id:ref.id,clickOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',reason:'إعادة تأكيد نفس الربط'});
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.click_reconciled').get()).size,1,'an identical reconciliation is idempotent');
  await assert.rejects(reconcile({id:ref.id,clickOrderId:'9999999',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'delivered',reason:'محاولة استبدال المعرف'}),{code:'already-exists'});
  assert.equal((await ref.get()).data().providerOrderId,'1318368');
  assert.equal(clickSendCalls,0,'reconciliation never creates a shipment');
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(clickSendCalls,0);
});
test('the same Click policy number or merchant reference cannot be linked to two Velnix orders',async()=>{
  const first=await clickOrder('click_unique_first',{dispatchState:'needs_review'});
  await reconcile({id:first.id,clickOrderId:'7777777',clickOrderRef:'REF-UNIQUE-1',shippingStatus:'awaitingPickup',reason:'ربط أول لشحنة Click فريدة'});
  const second=await clickOrder('click_unique_second',{dispatchState:'needs_review'});
  await assert.rejects(reconcile({id:second.id,clickOrderId:'7777777',clickOrderRef:'REF-UNIQUE-2',shippingStatus:'awaitingPickup',reason:'محاولة تكرار رقم البوليصة'}),{code:'already-exists'});
  await assert.rejects(reconcile({id:second.id,clickOrderId:'7777778',clickOrderRef:'REF-UNIQUE-1',shippingStatus:'awaitingPickup',reason:'محاولة تكرار مرجع التاجر'}),{code:'already-exists'});
  assert.equal((await second.get()).data().providerOrderId ?? null,null);
  assert.equal((await second.get()).data().clickOrderRef ?? null,null);
});
test('a manual reconciliation cannot overwrite an API-confirmed Click state',async()=>{
  const ref=await clickOrder('click_api_confirmed',{dispatchState:'sent',status:'dispatched',providerOrderId:'8888888',clickOrderRef:'REF-API-CONFIRMED',shippingStatus:'delivered',shippingStatusSource:'click_api'});
  await assert.rejects(reconcile({id:ref.id,clickOrderId:'8888888',clickOrderRef:'REF-API-CONFIRMED',shippingStatus:'cancelled',reason:'محاولة استبدال حالة API يدويًا'}),{code:'failed-precondition'});
  let data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
  await reconcile({id:ref.id,clickOrderId:'8888888',clickOrderRef:'REF-API-CONFIRMED',shippingStatus:'delivered',reason:'تأكيد نفس الحالة المؤكدة'});
  data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
});
test('only a Click-linked order can be reconciled, and only by an authorized user',async()=>{
  const generic=db.doc('orders/generic_reconcile');
  await generic.set({customer:'x',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1000,createdBy:'click_gm',status:'ready',dispatchState:'idle',companyId:'generic_fixture',revision:0});
  await assert.rejects(reconcile({id:generic.id,clickOrderId:'1318368',clickOrderRef:'REF-GENERIC',shippingStatus:'awaitingPickup',reason:'محاولة ربط شركة عامة'}),{code:'failed-precondition'});
  await assert.rejects(functions.reconcileClickShipment.run({auth:salesAuth,data:{id:generic.id,clickOrderId:'1318368',clickOrderRef:'REF-GENERIC',shippingStatus:'awaitingPickup',reason:'محاولة غير مصرح بها'}}),{code:'permission-denied'});
  for(const shippingStatus of ['1','click_delivered','',null])await assert.rejects(reconcile({id:generic.id,clickOrderId:'1318368',clickOrderRef:'REF-GENERIC',shippingStatus,reason:'حالة غير موثقة'}),{code:'invalid-argument'});
  await assert.rejects(reconcile({id:generic.id,clickOrderId:'abc',clickOrderRef:'REF-GENERIC',shippingStatus:'awaitingPickup',reason:'معرف غير رقمي'}),{code:'invalid-argument'});
  await assert.rejects(reconcile({id:generic.id,clickOrderId:'1318368',clickOrderRef:'x'.repeat(26),shippingStatus:'awaitingPickup',reason:'مرجع أطول من 25'}),{code:'invalid-argument'});
});
test('a successful mock create stores the tracking id once and blocks a second dispatch',async()=>{
  const ref=db.doc('orders/generic_success');
  await ref.set({customer:'x',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1000,createdBy:'click_gm',status:'ready',dispatchState:'idle',companyId:'generic_fixture',revision:0});
  const result=await dispatch(ref.id);
  assert.equal(result.trackingNumber,'LOCAL-1');
  const data=(await ref.get()).data();
  assert.equal(data.dispatchState,'sent');assert.equal(data.status,'dispatched');assert.equal(data.trackingNumber,'LOCAL-1');
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.sent_to_delivery').get()).size,1);
});
test('syncClickOrder applies the real verified Click response and records click_api provenance',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};clickSendCalls=0;
  const ref=await clickOrder('click_sync_success',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',shippingStatusSource:'manual'});
  const result=await sync(ref.id);
  assert.equal(result.applied,true);assert.equal(result.shippingStatus,'awaitingPickup');assert.equal(result.rawStatus,'قيد انتظار الموافقة');
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'awaitingPickup');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(data.clickStatusRaw,'قيد انتظار الموافقة');
  assert.equal(data.clickStatusDate,'2026-10-19T00:00:00');
  assert.equal(data.clickStatusDateMs,Date.parse('2026-10-19T00:00:00Z'));
  assert.equal(data.clickStatusNote,'شحنة قيد انتظار الموافقة');
  assert.deepEqual(data.clickAmounts,{orderAmountDuo:0,shippingDiscount:0,willPay:1});
  assert.equal(data.clickSyncLockId,undefined);assert.equal(data.syncError ?? null,null);
  assert.equal(clickReadCalls,1,'exactly one read call is allowed');
  assert.equal(clickSendCalls,0,'sync never creates a shipment');
  assert.equal((await ref.collection('events').where('action','==','click_status_synced').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.click_status_synced').get()).size,1);
});
test('a stale Click status cannot replace a newer API-confirmed state',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};
  const ref=await clickOrder('click_sync_stale',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'delivered',shippingStatusSource:'click_api',clickStatusDate:'2026-10-20T00:00:00',clickStatusDateMs:Date.parse('2026-10-20T00:00:00Z')});
  const result=await sync(ref.id);
  assert.equal(result.applied,false);assert.equal(result.ignored,'stale_status');
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');assert.equal(data.shippingStatusSource,'click_api');
  assert.equal((await ref.collection('events').where('action','==','click_status_stale').get()).size,1);
});
test('the same Click status date with a different state is a conflict, not an overwrite',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};
  const ref=await clickOrder('click_sync_conflict',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'delivered',shippingStatusSource:'click_api',clickStatusDate:'2026-10-19T00:00:00',clickStatusDateMs:Date.parse('2026-10-19T00:00:00Z')});
  const result=await sync(ref.id);
  assert.equal(result.applied,false);assert.equal(result.ignored,'status_conflict');
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');assert.equal(data.shippingStatusSource,'click_api');
  assert.equal((await ref.collection('events').where('action','==','click_status_conflict').get()).size,1);
});
test('a missing status date cannot overwrite an API-confirmed state',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}};
  const ref=await clickOrder('click_sync_no_date',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'delivered',shippingStatusSource:'click_api',clickStatusDate:'2026-10-20T00:00:00',clickStatusDateMs:Date.parse('2026-10-20T00:00:00Z')});
  const result=await sync(ref.id);
  assert.equal(result.applied,false);assert.equal(result.ignored,'missing_status_date');
  assert.equal((await ref.get()).data().shippingStatus,'delivered');
});
test('a failed or timed-out Click read leaves the local state untouched and clears the lock',async()=>{
  clickReadCalls=0;clickReadError=Object.assign(new Error('timeout'),{name:'AbortError'});
  const ref=await clickOrder('click_sync_failure',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',shippingStatusSource:'click_api',clickStatusDate:'2026-10-19T00:00:00',clickStatusDateMs:Date.parse('2026-10-19T00:00:00Z')});
  await assert.rejects(sync(ref.id),{code:'unavailable'});
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'awaitingPickup');assert.equal(data.shippingStatusSource,'click_api');
  assert.equal(data.clickSyncLockId,undefined);assert.match(data.syncError,/تعذر الاتصال بشركة التوصيل|تعذرت مزامنة/);
  assert.equal((await ref.collection('events').where('action','==','click_sync_failed').get()).size,1);
  assert.equal(clickReadCalls,1,'no retry is attempted');
  clickReadError=null;
});
test('a live sync lock blocks a second sync before any Click read',async()=>{
  clickReadCalls=0;clickReadError=null;
  const ref=await clickOrder('click_sync_locked',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',shippingStatusSource:'manual',clickSyncLockUntil:Timestamp.fromMillis(Date.now()+60000)});
  await assert.rejects(sync(ref.id),{code:'aborted'});
  assert.equal(clickReadCalls,0);
});
test('sync requires a linked reference, a Click company and sendToDelivery permission',async()=>{
  clickReadCalls=0;clickReadError=null;
  const missing=await clickOrder('click_sync_missing_ref',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',shippingStatus:'manual',shippingStatusSource:'manual'});
  await assert.rejects(sync(missing.id),{code:'failed-precondition'});
  const generic=db.doc('orders/click_sync_generic');
  await generic.set({customer:'x',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1000,createdBy:'click_gm',status:'dispatched',dispatchState:'sent',companyId:'generic_fixture',clickOrderRef:'REF-GENERIC',revision:0});
  await assert.rejects(sync(generic.id),{code:'failed-precondition'});
  const click=await clickOrder('click_sync_permission',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',shippingStatusSource:'manual'});
  await assert.rejects(functions.syncClickOrder.run({auth:salesAuth,data:{id:click.id}}),{code:'permission-denied'});
  assert.equal(clickReadCalls,0);
});
test('the Click connection test reads through getorder and never sends a shipment',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};clickSendCalls=0;
  const ok=await functions.testCompanyConnection.run({auth,data:{id:'click_fixture'}});
  assert.equal(ok.connected,true);
  assert.equal(ok.verified,'getorder');
  assert.equal(ok.httpStatus,200);
  assert.equal(clickReadCalls,1,'one read-only Click request');
  assert.equal(clickSendCalls,0,'the connection test must never call setorder');
  assert.equal((await db.doc('companies/click_fixture').get()).data().lastHealthConnected,true);
  clickReadResponse={status:401,json:{}};
  const failed=await functions.testCompanyConnection.run({auth,data:{id:'click_fixture'}});
  assert.equal(failed.connected,false);
  assert.match(failed.error,/HTTP 401/);
  assert.equal((await db.doc('companies/click_fixture').get()).data().lastHealthConnected,false);
  assert.equal(clickSendCalls,0);
});
test('the scheduled Click sync processes a due order and schedules the next check',async()=>{
  clickReadCalls=0;clickReadError=null;clickReadResponse={status:200,json:REAL_CLICK_RESPONSE};
  const ref=await clickOrder('click_scheduled_due',{status:'dispatched',dispatchState:'sent',providerOrderId:'1318368',clickOrderRef:'VNX-CLICK-TEST-20261019-d',shippingStatus:'awaitingPickup',shippingStatusSource:'manual',nextClickSyncAt:Timestamp.fromMillis(Date.now()-1000)});
  await functions.syncClickStatuses.run({});
  const data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'awaitingPickup');
  assert.equal(data.shippingStatusSource,'click_api');
  assert.ok(data.nextClickSyncAt?.toMillis?.()>Date.now());
  assert.ok(clickReadCalls>=1);
});
