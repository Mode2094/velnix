'use strict';
// Emulator integration for unrestricted INTERNAL bulk status changes.
// Uses the real callables (bulkChangeStatus + Firestore transactions, events,
// audit). No vendor transport is involved because internal-only orders never
// carry a carrier contract.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const db=getFirestore(),auth=getAuth();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});

let seq=0;
async function internalOrder(status,extra={}){
  const id='int_bulk_'+(++seq);
  await db.doc('orders/'+id).set({
    customer:'عميل داخلي',phone:'0790000000',phoneDigits:'0790000000',customerKey:'عميل داخلي',
    city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:12345,
    pageId:'int_page',status,createdBy:'ops_gm',hasDelivery:false,companyId:null,dispatchState:'idle',
    revision:0,orderType:'normal',createdAt:Timestamp.now(),
    ...extra,
  });
  return id;
}
const doc=id=>db.doc('orders/'+id).get().then(s=>s.data());

before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  for(const uid of ['ops_gm','ops_warehouse','ops_manager','ops_entry','ops_other'])await auth.createUser({uid}).catch(()=>{});
  await db.doc('members/ops_gm').set({name:'GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('members/ops_warehouse').set({name:'WH',role:'warehouse',active:true,permissions:[]});
  await db.doc('members/ops_manager').set({name:'M',role:'manager',active:true,permissions:['updateOrderStatus']});
  // A data-entry member without updateOrderStatus, for the authorization check.
  await db.doc('members/ops_entry').set({name:'E',role:'dataEntry',active:true,permissions:[]});
  await db.doc('members/ops_other').set({name:'O',role:'manager',active:true,permissions:[]});
  await db.doc('pages/int_page').set({name:'int',nameLower:'int',active:true,archived:false,status:'active'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('every valid internal status is a legal bulk target, forward and backward',async()=>{
  // example transitions from the brief, each proving no direction restriction.
  const cases=[
    {from:'preparing',to:'created'},
    {from:'cancelled',to:'created'},
    {from:'ready',to:'preparing'},
    {from:'created',to:'cancelled'},
    {from:'delivered',to:'preparing'},   // completed -> another internal status
    {from:'cancelled',to:'ready'},       // reopen cancelled directly to ready
  ];
  for(const c of cases){
    const id=await internalOrder(c.from);
    const r=await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:c.to});
    assert.equal(r.succeeded,1,`${c.from} -> ${c.to} must succeed`);
    assert.equal((await doc(id)).status,c.to);
  }
});

test('mixed current statuses all move to one target',async()=>{
  const ids=[await internalOrder('created'),await internalOrder('preparing'),await internalOrder('cancelled'),await internalOrder('ready')];
  const r=await invoke('bulkChangeStatus','ops_gm',{ids,status:'review'});
  assert.equal(r.succeeded,4);
  for(const id of ids)assert.equal((await doc(id)).status,'review');
});

test('same-status change is an idempotent no-op: no event, no audit, no revision bump',async()=>{
  const id=await internalOrder('preparing');
  const before=await doc(id);
  const r=await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'preparing'});
  assert.equal(r.succeeded,1);
  assert.equal(r.unchanged,1,'a same-status change is reported as unchanged');
  const after=await doc(id);
  assert.equal(after.status,'preparing');
  assert.equal(after.revision,before.revision,'revision must not change for a no-op');
  assert.equal((await db.collection('orders/'+id+'/events').get()).size,0,'no transition event for a no-op');
  assert.equal((await db.collection('auditEvents').where('entityId','==',id).get()).size,0,'no audit for a no-op');
});

test('a real change writes one status_changed event and one audit with previous and new status',async()=>{
  const id=await internalOrder('ready');
  await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'created'});
  const events=await db.collection('orders/'+id+'/events').where('action','==','status_changed').get();
  assert.equal(events.size,1);
  const e=events.docs[0].data();
  assert.equal(e.actorId,'ops_gm');
  assert.equal(e.details.status,'created');
  assert.equal(e.details.previous,'ready');
  const audits=await db.collection('auditEvents').where('entityId','==',id).where('action','==','order.status_changed').get();
  assert.equal(audits.size,1);
  assert.equal(audits.docs[0].data().extra.status,'created');
});

test('a legacy carrier status is refused and nothing on the order changes',async()=>{
  // A legacy order whose `status` is a carrier value (dispatched) and which has
  // no resolvable internal status must not be silently overwritten.
  const id=await internalOrder('dispatched',{companyId:'c1',hasDelivery:true,trackingNumber:'TRK-1',clickOrderRef:'VNX-1',providerOrderId:'777',shippingStatus:'outForDelivery',shippingStatusSource:'click_api'});
  const before=await doc(id);
  const r=await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'created'});
  assert.equal(r.failed,1,'an order with an unknown internal status is not changed');
  assert.equal(r.results[0].ok,false);
  const after=await doc(id);
  assert.deepEqual(after, before,'no field may change when the internal status is unknown');
});

test('an in-flight or undetermined dispatch is refused, but a confirmed send stays editable',async()=>{
  // Only sending/needs_review block an internal edit (a send is unresolved).
  for(const dispatchState of ['sending','needs_review']){
    const id=await internalOrder('ready',{companyId:'c1',hasDelivery:true,dispatchState});
    const r=await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'created'});
    assert.equal(r.failed,1,`dispatchState ${dispatchState} must be refused`);
    assert.equal((await doc(id)).status,'ready');
  }
  // A CONFIRMED send (dispatchState sent) with a carrier contract IS editable:
  // the internal status is separate from the carrier lifecycle.
  const sentId=await internalOrder('ready',{companyId:'c1',hasDelivery:true,dispatchState:'sent',trackingNumber:'TRK-9',internalStatus:'ready'});
  const r2=await invoke('bulkChangeStatus','ops_gm',{ids:[sentId],status:'preparing'});
  assert.equal(r2.succeeded,1,'a confirmed shipment still allows an internal edit');
  const after=await doc(sentId);
  assert.equal(after.status,'preparing');
  assert.equal(after.internalStatus,'preparing');
  // Critically, the carrier data is untouched.
  assert.equal(after.dispatchState,'sent');
  assert.equal(after.trackingNumber,'TRK-9');
  assert.equal(after.companyId,'c1');
  assert.equal(after.hasDelivery,true);
});

test('unauthorized member is rejected and a permitted member is accepted',async()=>{
  // The acting member must own the order to pass the visibility policy, so the
  // only variable under test is the permission itself.
  const id=await internalOrder('created',{createdBy:'ops_other'});
  // manager WITHOUT updateOrderStatus cannot change status.
  const noPerm=await invoke('bulkChangeStatus','ops_other',{ids:[id],status:'review'});
  assert.equal(noPerm.failed,1);
  assert.equal(noPerm.results[0].code,'permission-denied');
  assert.equal((await doc(id)).status,'created');
  // warehouse (implicitly permitted, sees all) succeeds.
  const wh=await invoke('bulkChangeStatus','ops_warehouse',{ids:[id],status:'review'});
  assert.equal(wh.succeeded,1);
  assert.equal((await doc(id)).status,'review');
  // manager WITH updateOrderStatus on their own order succeeds, backward.
  const own=await internalOrder('review',{createdBy:'ops_manager'});
  const ok=await invoke('bulkChangeStatus','ops_manager',{ids:[own],status:'created'});
  assert.equal(ok.succeeded,1);
  assert.equal((await doc(own)).status,'created');
});

test('an out-of-scope order is omitted per-order (permission-denied), not silently changed',async()=>{
  // dataEntry owns their own orders; the GM-created order is out of scope.
  const id=await internalOrder('created');
  const r=await invoke('bulkChangeStatus','ops_entry',{ids:[id],status:'review'});
  assert.equal(r.results[0].ok,false);
  assert.equal(r.results[0].code,'permission-denied');
  assert.equal((await doc(id)).status,'created');
});

test('an invalid target status is rejected before any order is touched',async()=>{
  const id=await internalOrder('created');
  for(const bad of ['partiallyDelivered','outForDelivery','bogus','', 'dispatched','inTransit','returned']){
    await assert.rejects(invoke('bulkChangeStatus','ops_gm',{ids:[id],status:bad}),{code:'invalid-argument'},`${bad} must be rejected`);
  }
  assert.equal((await doc(id)).status,'created');
});

test('an order whose CURRENT status is outside the internal set is refused and never overwritten',async()=>{
  // Carrier/dispatch statuses and unknown/legacy values must be left untouched:
  // the internal flow does not own them.
  for(const current of ['dispatched','inTransit','returned','pending','','weird_state']){
    const id=await internalOrder(current);
    const before=await doc(id);
    const r=await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'created'});
    assert.equal(r.failed,1,`current status "${current}" must be refused`);
    assert.equal(r.results[0].ok,false);
    assert.deepEqual(await doc(id),before,`order with current status "${current}" must be untouched`);
  }
});

test('partial failure keeps the successful updates and reports both accurately',async()=>{
  const good=await internalOrder('created');
  const locked=await internalOrder('ready',{companyId:'c1',hasDelivery:true,dispatchState:'sending'});
  const r=await invoke('bulkChangeStatus','ops_gm',{ids:[good,locked],status:'preparing'});
  assert.equal(r.succeeded,1);
  assert.equal(r.failed,1);
  assert.equal((await doc(good)).status,'preparing','the valid order is still changed');
  assert.equal((await doc(locked)).status,'ready','the locked order is unchanged');
  const ids=r.results.map(x=>x.id);
  assert.ok(ids.includes(good)&&ids.includes(locked),'every requested id is reported');
});

test('internal status change never alters shipping, payment or amount fields',async()=>{
  const id=await internalOrder('ready',{paymentMethod:'مدفوع مسبقاً',amountMinor:98765});
  const snapshot={...await doc(id)};
  await invoke('bulkChangeStatus','ops_gm',{ids:[id],status:'created'});
  const after=await doc(id);
  assert.equal(after.status,'created');
  assert.equal(after.amountMinor,snapshot.amountMinor,'amount unchanged');
  assert.equal(after.paymentMethod,snapshot.paymentMethod,'payment unchanged');
  assert.equal(after.shippingStatus,snapshot.shippingStatus,'shipping status unchanged');
  assert.equal(after.companyId,snapshot.companyId,'company unchanged');
  assert.equal(after.trackingNumber,snapshot.trackingNumber,'tracking unchanged');
  assert.equal(after.dispatchState,snapshot.dispatchState,'dispatch state unchanged');
});

test('a selection larger than the 50-order chunk limit is applied in full across batches',async()=>{
  const ids=[];
  for(let i=0;i<60;i++)ids.push(await internalOrder('created'));
  // The client chunks to 50; simulate that here against the real handler.
  let succeeded=0;
  for(let i=0;i<ids.length;i+=50){
    const chunk=ids.slice(i,i+50);
    const r=await invoke('bulkChangeStatus','ops_gm',{ids:chunk,status:'preparing'});
    succeeded+=r.succeeded;
  }
  assert.equal(succeeded,60);
  for(const id of ids)assert.equal((await doc(id)).status,'preparing');
});

test('completing internally sets provenance and leaving it clears it',async()=>{
  const ready=await internalOrder('ready');
  await invoke('changeOrderStatus','ops_warehouse',{id:ready,status:'delivered'});
  const completed=await doc(ready);
  assert.equal(completed.status,'delivered');
  assert.equal(completed.completionSource,'internal');
  assert.equal(completed.completedBy,'ops_warehouse');
  // Moving it away from delivered via the unrestricted bulk path clears the
  // provenance so a completed-internally marker never lingers on another status.
  await invoke('bulkChangeStatus','ops_gm',{ids:[ready],status:'preparing'});
  const reopened=await doc(ready);
  assert.equal(reopened.status,'preparing');
  assert.equal(reopened.completionSource,undefined,'completion provenance is cleared');
});
