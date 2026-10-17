'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
// This test file runs in its own Node test process. Only KMS and the carrier
// transport are injected; callable handlers and transactions are real.
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>{if(kmsFails)throw Error('local_kms_failure');return 'local-fixture-token';};
const providers=require('../../src/providers'),actualProvider=providers.requireOperationalProvider;
providers.requireOperationalProvider=company=>{
 const adapter=actualProvider(company);
 return {...adapter,create:(c,t,o)=>adapter.create(c,t,o,(url,options)=>fetch(local+new URL(url).pathname,options))};
};
const functions=require('../../src/index');
const {getFirestore}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();let server,local,kmsFails=false,mode='disconnect',requests=0;
const invoke=id=>functions.sendOrderToDelivery.run({auth:{uid:'dispatch_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data:{id}});
before(async()=>{
 server=http.createServer(async(req,res)=>{
  requests++;let body='';for await(const chunk of req)body+=chunk;
  assert.ok(JSON.parse(body).idempotencyKey);
  if(mode==='disconnect')return req.socket.destroy();
  res.setHeader('Content-Type','application/json');res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));local='http://127.0.0.1:'+server.address().port;
 await db.doc('members/dispatch_gm').set({name:'Fixture GM',role:'generalManager',active:true,permissions:[]});
 await db.doc('companies/dispatch_fixture').set({name:'Local',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true});
 await db.doc('companySecrets/dispatch_fixture').set({apiTokenCiphertext:'mock-ciphertext'});
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.terminate();await deleteApp(getApp());});
async function order(id){
 const ref=db.doc('orders/'+id);await ref.set({createdBy:'dispatch_gm',status:'ready',dispatchState:'idle',companyId:'dispatch_fixture',amountMinor:1000,revision:0});return ref;
}
test('KMS failure before transport never claims an ambiguous shipment and leaves an audit trail',async()=>{
 kmsFails=true;const ref=await order('dispatch_kms_failure'),beforeCalls=requests;
 await assert.rejects(invoke(ref.id),{code:'failed-precondition'});
 assert.equal(requests,beforeCalls);assert.equal((await ref.get()).data().dispatchState,'idle');
 assert.equal((await ref.collection('events').where('action','==','dispatch_preparation_failed').get()).size,1);kmsFails=false;
});
for(const failure of ['disconnect','missing_tracking'])test('a '+failure+' after request keeps needs_review and prevents a duplicate shipment',async()=>{
 mode=failure;const ref=await order('dispatch_'+failure),beforeCalls=requests;
 await assert.rejects(invoke(ref.id),{code:'unavailable'});
 assert.equal(requests,beforeCalls+1);assert.equal((await ref.get()).data().dispatchState,'needs_review');
 await assert.rejects(invoke(ref.id),{code:'failed-precondition'});assert.equal(requests,beforeCalls+1);
 assert.equal((await ref.collection('events').where('action','==','dispatch_attempt_failed').get()).size,1);
 assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.dispatch_attempt_failed').get()).size,1);
});
