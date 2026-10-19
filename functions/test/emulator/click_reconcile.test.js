'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
// KMS and the carrier transport are injected; callable handlers, Firestore
// transactions, audit and event records are real.
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
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
const {getFirestore}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'click_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});
const reconcile=data=>functions.reconcileClickShipment.run({auth,data});
before(async()=>{
  await db.doc('members/click_gm').set({name:'Fixture GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('members/click_sales').set({name:'Fixture Sales',role:'sales',active:true,permissions:[]});
  await db.doc('companies/click_fixture').set({name:'Click Fixture',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',enabled:true,archived:false,statusMap:{}});
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
test('an ambiguous Click create keeps needs_review and a second dispatch is refused without another carrier call',async()=>{
  clickCreateCalls=0;
  const ref=await clickOrder('click_ambiguous');
  await assert.rejects(dispatch(ref.id),{code:'unavailable'});
  assert.equal(clickCreateCalls,1,'exactly one carrier attempt is allowed');
  const afterFirst=(await ref.get()).data();
  assert.equal(afterFirst.dispatchState,'needs_review');
  assert.match(afterFirst.syncError,/Click قد يكون أنشأ الشحنة/);
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(clickCreateCalls,1,'the review state must block an automatic resend');
  assert.equal((await ref.collection('events').where('action','==','dispatch_attempt_failed').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.dispatch_attempt_failed').get()).size,1);
});
test('reconciling the existing Click shipment links its id and one owner-confirmed business state without a second shipment',async()=>{
  clickCreateCalls=0;
  const ref=await clickOrder('click_reconcile',{dispatchState:'needs_review',syncError:'نتيجة إرسال غير مؤكدة'});
  await reconcile({id:ref.id,clickOrderId:'1318368',shippingStatus:'awaitingPickup',reason:'تحقق يدوي من بوابة Click Delivery'});
  const data=(await ref.get()).data();
  assert.equal(data.providerOrderId,'1318368');
  assert.equal(data.shippingStatus,'awaitingPickup');
  assert.equal(data.shippingStatusSource,'manual');
  assert.equal(data.dispatchState,'sent');
  assert.equal(data.status,'dispatched');
  assert.equal(data.trackingNumber ?? null,null,'the Click order id is not copied into the carrier tracking field');
  assert.equal(data.nextPollAt ?? null,null,'no automatic Click poll is scheduled while its contract is unconfirmed');
  assert.equal((await ref.collection('events').where('action','==','click_reconciled').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.click_reconciled').get()).size,1);
  await reconcile({id:ref.id,clickOrderId:'1318368',shippingStatus:'awaitingPickup',reason:'إعادة تأكيد نفس الربط'});
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.click_reconciled').get()).size,1,'an identical reconciliation is idempotent');
  await assert.rejects(reconcile({id:ref.id,clickOrderId:'9999999',shippingStatus:'delivered',reason:'محاولة استبدال المعرف'}),{code:'already-exists'});
  assert.equal((await ref.get()).data().providerOrderId,'1318368');
  assert.equal(clickCreateCalls,0,'reconciliation never creates a shipment');
  await assert.rejects(dispatch(ref.id),{code:'failed-precondition'});
  assert.equal(clickCreateCalls,0);
});
test('the same Click Order_ID cannot be linked to two different Velnix orders',async()=>{
  const first=await clickOrder('click_unique_first',{dispatchState:'needs_review'});
  await reconcile({id:first.id,clickOrderId:'7777777',shippingStatus:'awaitingPickup',reason:'ربط أول لشحنة Click فريدة'});
  const second=await clickOrder('click_unique_second',{dispatchState:'needs_review'});
  await assert.rejects(reconcile({id:second.id,clickOrderId:'7777777',shippingStatus:'awaitingPickup',reason:'محاولة تكرار نفس معرف Click'}),{code:'already-exists'});
  assert.equal((await second.get()).data().providerOrderId ?? null,null);
});
test('a manual reconciliation cannot overwrite an API-confirmed Click state',async()=>{
  const ref=await clickOrder('click_api_confirmed',{dispatchState:'sent',status:'dispatched',providerOrderId:'8888888',shippingStatus:'delivered',shippingStatusSource:'click_api'});
  await assert.rejects(reconcile({id:ref.id,clickOrderId:'8888888',shippingStatus:'cancelled',reason:'محاولة استبدال حالة API يدويًا'}),{code:'failed-precondition'});
  let data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
  await reconcile({id:ref.id,clickOrderId:'8888888',shippingStatus:'delivered',reason:'تأكيد نفس الحالة المؤكدة'});
  data=(await ref.get()).data();
  assert.equal(data.shippingStatus,'delivered');
  assert.equal(data.shippingStatusSource,'click_api');
});
test('only a Click-linked order can be reconciled, and only by an authorized user',async()=>{
  const generic=db.doc('orders/generic_reconcile');
  await generic.set({customer:'x',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1000,createdBy:'click_gm',status:'ready',dispatchState:'idle',companyId:'generic_fixture',revision:0});
  await assert.rejects(reconcile({id:generic.id,clickOrderId:'1318368',shippingStatus:'awaitingPickup',reason:'محاولة ربط شركة عامة'}),{code:'failed-precondition'});
  const salesAuth={uid:'click_sales',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
  await assert.rejects(functions.reconcileClickShipment.run({auth:salesAuth,data:{id:generic.id,clickOrderId:'1318368',shippingStatus:'awaitingPickup',reason:'محاولة غير مصرح بها'}}),{code:'permission-denied'});
  for(const shippingStatus of ['1','click_delivered','',null])await assert.rejects(reconcile({id:generic.id,clickOrderId:'1318368',shippingStatus,reason:'حالة غير موثقة'}),{code:'invalid-argument'});
  await assert.rejects(reconcile({id:generic.id,clickOrderId:'abc',shippingStatus:'awaitingPickup',reason:'معرف غير رقمي'}),{code:'invalid-argument'});
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
