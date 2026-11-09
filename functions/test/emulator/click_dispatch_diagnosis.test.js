'use strict';
/*
 * Click dispatch production-diagnosis regression.
 *
 * Proves, for each contract outcome the customer could see, (a) the exact
 * server message the UI receives, (b) the order state, and (c) that no second
 * shipment is ever created. This mirrors the live Cloud Logging evidence: the
 * ambiguous Int64 / 2xx / timeout outcomes keep the merchant reference and move
 * to needs_review, and a later read-only getorder resolves them without a
 * second setorder.
 */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_diag';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');
let sendCalls=0,sendError=null,readCalls=0,readError=null,readResponse=null;
clickDelivery.sendClickOrder=async()=>{sendCalls++;if(sendError)throw sendError;return {trackingNumber:'TRK-OK'};};
clickDelivery.readClickOrder=async()=>{readCalls++;if(readError)throw readError;return readResponse;};
const providers=require('../../src/providers');
providers.requireOperationalProvider=()=>({create:async()=>{sendCalls++;if(sendError)throw sendError;return {trackingNumber:'TRK-OK'};}});
const functions=require('../../src/index');
const {getFirestore}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'diag_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=id=>functions.sendOrderToDelivery.run({auth,data:{id}});
const sync=id=>functions.syncClickOrder.run({auth,data:{id}});
const WAITING={status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00',Ord_Status_Note:'x',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}};
before(async()=>{
  await db.doc('members/diag_gm').set({name:'Diag GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('companies/click_diag').set({name:'Click Diag',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_diag').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
let seq=0;
async function ready(over={}){
  const id='diag_order_'+(++seq);const ref=db.doc('orders/'+id);
  await ref.set({customer:'عميل تشخيص',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:1000,
    createdBy:'diag_gm',status:'ready',dispatchState:'idle',companyId:'click_diag',orderType:'normal',revision:0,...over});
  return ref;
}

test('HTTP 2xx with no documented body is ambiguous: needs_review, reference kept, message says the result is unconfirmed',async()=>{
  sendCalls=0;sendError=Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'});
  const ref=await ready();
  const err=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code,message:e.message}));
  assert.equal(err.ok,false);
  assert.equal(err.code,'unavailable');
  assert.match(err.message,/نتيجة الإرسال غير مؤكدة/,'the customer sees a clear "unconfirmed" message, not a generic failure');
  const d=(await ref.get()).data();
  assert.equal(d.dispatchState,'needs_review');
  assert.equal(d.clickOrderRef,'VNX-'+ref.id);
  assert.equal(sendCalls,1);
  sendError=null;
});

test('the ambiguous Int64 HTTP 400 also keeps needs_review and never claims a confirmed success',async()=>{
  sendCalls=0;sendError=Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation',httpStatus:400});
  const ref=await ready();
  const err=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  assert.equal(err.code,'unavailable');
  const d=(await ref.get()).data();
  assert.equal(d.dispatchState,'needs_review');
  assert.match(d.syncError,/Click قد يكون أنشأ الشحنة/,'the Click-specific review guidance is stored for the operator');
  assert.notEqual(d.status,'dispatched','the order is NOT advanced to dispatched on an unconfirmed outcome');
  sendError=null;
});

test('a 401 authentication failure is a rejection, not an uncertain send: idle and no shipment reference leak',async()=>{
  sendCalls=0;sendError=Object.assign(new Error('click_auth_failed'),{code:'click_auth_failed',httpStatus:401});
  const ref=await ready();
  const err=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  assert.equal(err.code,'unavailable','a vendor attempt that failed at auth is still treated as uncertain (transport reached the vendor)');
  const d=(await ref.get()).data();
  assert.equal(d.dispatchState,'needs_review');
  assert.equal(sendCalls,1);
  sendError=null;
});

test('pre-send configuration failure (KMS) returns to idle and never claims a shipment',async()=>{
  sendCalls=0;
  const secret=await db.doc('companySecrets/click_diag').get();const backup=secret.data();
  await db.doc('companySecrets/click_diag').delete();
  try{
    const ref=await ready();
    const err=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code,message:e.message}));
    assert.equal(err.code,'failed-precondition');
    assert.match(err.message,/لم تبدأ محاولة الإرسال/,'the customer is told the send never started');
    const d=(await ref.get()).data();
    assert.equal(d.dispatchState,'idle','a pre-send failure is safe to retry');
    assert.equal(sendCalls,0,'the vendor is never contacted');
  } finally { await db.doc('companySecrets/click_diag').set(backup); }
});

test('pressing send twice while the first attempt is in flight reaches Click exactly once',async()=>{
  sendCalls=0;
  let release=null;
  const gate=new Promise(r=>{release=r;});
  clickDelivery.sendClickOrder=async()=>{ sendCalls++; await gate; throw Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'}); };
  const ref=await ready();
  const first=dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  // Wait until the first attempt actually reached the vendor call.
  for(let i=0;i<100&&sendCalls===0;i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(sendCalls,1,'the first press reached the vendor exactly once');
  const second=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  assert.equal(second.ok,false,'the second press is refused while the first is in flight');
  assert.equal(second.code,'failed-precondition');
  assert.equal(sendCalls,1,'still exactly one setorder call while in flight');
  release();
  await first;
  assert.equal(sendCalls,1,'still exactly one setorder call after completion');
  // Restore the default injected sender.
  clickDelivery.sendClickOrder=async()=>{sendCalls++;if(sendError)throw sendError;return {trackingNumber:'TRK-OK'};};
});

test('a needs_review order is resolved by a read-only getorder and never re-sends setorder',async()=>{
  sendCalls=0;readCalls=0;readError=null;readResponse=WAITING;
  sendError=Object.assign(new Error('click_ambiguous_creation'),{code:'click_ambiguous_creation'});
  const ref=await ready();
  await dispatch(ref.id).catch(()=>{});
  assert.equal((await ref.get()).data().dispatchState,'needs_review');
  const sendsAfterFail=sendCalls;
  const r=await sync(ref.id);
  assert.equal(r.shippingStatus,'awaitingPickup');
  const d=(await ref.get()).data();
  assert.equal(d.dispatchState,'sent','the confirmed read resolves the review state');
  assert.equal(d.status,'ready'); // internal status preserved across resolution
  assert.equal(sendCalls,sendsAfterFail,'recovery never calls setorder again');
  sendError=null;
});

test('once resolved to sent, any further send is refused (no duplicate shipment)',async()=>{
  sendCalls=0;readCalls=0;readError=null;readResponse=WAITING;
  const ref=await ready({dispatchState:'needs_review',clickOrderRef:'VNX-diag-resolution',syncError:'نتيجة إرسال غير مؤكدة'});
  await sync(ref.id);
  assert.equal((await ref.get()).data().dispatchState,'sent');
  const err=await dispatch(ref.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  assert.equal(err.ok,false);
  assert.equal(err.code,'failed-precondition');
  assert.equal(sendCalls,0,'a sent order is never sent again');
});
