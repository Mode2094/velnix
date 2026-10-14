'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const {initializeApp,getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-velnix'});
const db=getFirestore();
const processRemote=require('../../src/remote').createRemoteProcessor({
  db,FieldValue,
  addEvent:async(id,action,actor,details,tx)=>tx.create(db.collection('orders/'+id+'/events').doc(),{action,actorId:actor.id,details}),
  audit:async(action,actor,id,extra,tx)=>tx.create(db.collection('auditEvents').doc(),{action,actorId:actor.id,entityId:id,extra}),
});
before(async()=>{
  await db.doc('companies/remote_company').set({archived:true,enabled:false,statusMap:{shipping:'inTransit',done:'delivered',return:'returned'}});
  await db.doc('orders/remote_order').set({status:'dispatched',dispatchState:'sent',companyId:'remote_company',revision:0});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
test('real transactions handle duplicate concurrent webhooks and late states on archived carrier',async()=>{
  const payload={reference:'remote_order',status:'shipping'};
  const result=await Promise.all([processRemote('remote_company',payload,'remote_event1','webhook'),processRemote('remote_company',payload,'remote_event1','webhook')]);
  assert.equal(result.filter(r=>r.updated).length,1);assert.equal(result.filter(r=>r.ignored==='duplicate').length,1);
  await processRemote('remote_company',{...payload,status:'done'},'remote_event2','webhook');
  const late=await processRemote('remote_company',payload,'remote_event3','poll');assert.equal(late.ignored,'out_of_order');
  assert.equal((await db.doc('orders/remote_order').get()).data().status,'delivered');
  assert.equal((await db.collection('orders/remote_order/events').get()).size,2);
});
test('early provider update is retryable until shipment confirmation, not burned as duplicate',async()=>{
  await db.doc('orders/early_order').set({status:'ready',companyId:'remote_company',dispatchState:'sending'});
  const payload={reference:'early_order',status:'done'};
  assert.ok((await processRemote('remote_company',payload,'early_event','webhook')).deferred);
  assert.equal((await db.doc('deliveryInbox/remote_company/events/early_event').get()).exists,false);
  await db.doc('orders/early_order').update({status:'dispatched',dispatchState:'sent'});
  assert.equal((await processRemote('remote_company',payload,'early_event','webhook')).updated,true);
});
test('unmatched orders and path injection never mutate data',async()=>{
  assert.equal((await processRemote('remote_company',{reference:'../secrets',status:'done'},'bad_ref','webhook')).ignored,'invalid_reference');
  await db.doc('orders/unmatched_order').set({status:'dispatched',companyId:'someone_else'});
  assert.equal((await processRemote('remote_company',{reference:'unmatched_order',status:'done'},'mismatch_event','webhook')).ignored,'unmatched_order');
  assert.equal((await db.doc('orders/unmatched_order').get()).data().status,'dispatched');
});
