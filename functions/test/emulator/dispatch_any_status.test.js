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
  await ref.set({createdBy:'any_gm',status,internalStatus:status,dispatchState:'idle',companyId:'any_fixture',amountMinor:1000,revision:0,...extra});
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
  assert.equal(d.hasDelivery,undefined,'a dispatch does not fabricate hasDelivery');
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
  const ref=await order('any_legacy','dispatched',{internalStatus:'ready',dispatchState:'sent',trackingNumber:'OLD-1',hasDelivery:true});
  const r=await bulkChange([ref.id],'cancelled');
  assert.equal(r.succeeded,1);
  const d=(await ref.get()).data();
  assert.equal(d.status,'cancelled');
  assert.equal(d.internalStatus,'cancelled');
  assert.equal(d.trackingNumber,'OLD-1','legacy carrier data preserved');
});
