'use strict';
// Emulator integration: the client brief's 100/20 counter example, verbatim.
//
//   "جميع طلبات المتجر = 100 · الطلبات الداخلية = 80 · طلبات شركة التوصيل = 20"
//
// A dedicated owner keeps the scope exactly its own orders, so the lists and the
// dashboard counters are compared over a controlled 100-order set:
//   * all      = every order entered in Velnix (sent or not, every status)
//   * internal = NOT confirmed accepted by the carrier (deliveryAccepted !== true)
//   * delivery = ONLY confirmed carrier acceptance (deliveryAccepted === true)
// A confirmed send moves one order internal -> delivery without changing the
// total. A `clickOrderRef`/assignment alone is not acceptance, and a
// needs_review (uncertain) send stays internal.
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
const {Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const auth=getAuth();
const db=getFirestore();let server,local,requests=0;

const OWNER='counters_owner';
const call=(name,data)=>functions[name].run({auth:{uid:OWNER,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});
const sumCounts=map=>Object.values(map).reduce((s,v)=>s+v.count,0);
// The list page is capped at 50, so a 100-order scope is paged to exhaustion.
const ids=async bucket=>{
  const out=[];let cursor=null;
  for(let guard=0;guard<10;guard++){
    const page=await call('listOrders',{pageSize:50,bucket,...(cursor?{cursor}:{})});
    out.push(...page.items.map(o=>o.id));
    if(!page.nextAfterId)break;
    cursor=page.nextAfterId;
  }
  return out;
};

before(async()=>{
  server=http.createServer(async(req,res)=>{requests++;for await(const _ of req){/* drain */}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({trackingNumber:'TRK-'+(requests)}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));local='http://127.0.0.1:'+server.address().port;
  await auth.createUser({uid:OWNER}).catch(()=>{});
  await db.doc('members/'+OWNER).set({name:'Counters Owner',role:'manager',active:true,permissions:['sendToDelivery','updateOrderStatus']});
  await db.doc('companies/counters_fixture').set({name:'Local',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true});
  await db.doc('companySecrets/counters_fixture').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.terminate();await deleteApp(getApp());});

async function seed(id,extra={}){
  await db.doc('orders/'+id).set({createdBy:OWNER,status:'ready',internalStatus:'ready',dispatchState:'idle',
    companyId:'counters_fixture',hasDelivery:true,amountMinor:1000,revision:0,createdAt:Timestamp.now(),...extra});
  return id;
}

test('100 orders, 20 confirmed accepted: all=100, internal=80, delivery=20',async()=>{
  const batch=db.batch();
  for(let i=0;i<100;i++){
    const ref=db.doc('orders/c100_'+String(i).padStart(3,'0'));
    batch.set(ref,{createdBy:OWNER,status:'ready',internalStatus:'ready',dispatchState:'idle',
      companyId:'counters_fixture',hasDelivery:true,amountMinor:1000,revision:0,createdAt:Timestamp.now()});
  }
  await batch.commit();

  // Exactly 20 orders carry the durable proof of CONFIRMED carrier acceptance.
  const accepted=[];for(let i=0;i<20;i++)accepted.push('c100_'+String(i).padStart(3,'0'));
  await Promise.all(accepted.map(id=>db.doc('orders/'+id).update({deliveryAccepted:true,dispatchState:'sent',trackingNumber:'TRK-'+id})));

  const stats=await call('dashboardStats',{});
  const all=await ids('all'),internal=await ids('internal'),deliveryList=await ids('delivery');

  assert.equal(all.length,100,'جميع طلبات المتجر = 100');
  assert.equal(internal.length,80,'الطلبات الداخلية = 80');
  assert.equal(deliveryList.length,20,'طلبات شركة التوصيل = 20');
  assert.equal(sumCounts(stats.counters.all),100,'dashboard all = 100');
  assert.equal(sumCounts(stats.counters.internal),80,'dashboard internal = 80');
  assert.equal(sumCounts(stats.counters.delivery),20,'dashboard delivery = 20');
  assert.equal(sumCounts(stats.counters.all),sumCounts(stats.counters.delivery)+sumCounts(stats.counters.internal),'all = delivery + internal');
  assert.equal(deliveryList.length+internal.length,all.length,'the two queues partition the store book');
});

test('a confirmed send moves one order internal->delivery; the total never changes',async()=>{
  const before={all:sumCounts((await call('dashboardStats',{})).counters.all),
    internal:sumCounts((await call('dashboardStats',{})).counters.internal),
    delivery:sumCounts((await call('dashboardStats',{})).counters.delivery)};
  const target='c100_099'; // seeded, still internal
  await call('sendOrderToDelivery',{id:target});
  const after={all:sumCounts((await call('dashboardStats',{})).counters.all),
    internal:sumCounts((await call('dashboardStats',{})).counters.internal),
    delivery:sumCounts((await call('dashboardStats',{})).counters.delivery)};
  assert.equal(after.all,before.all,'the store total is unchanged by acceptance');
  assert.equal(after.internal,before.internal-1,'a confirmed send leaves the internal queue');
  assert.equal(after.delivery,before.delivery+1,'a confirmed send enters the delivery queue');
  assert.ok((await ids('delivery')).includes(target),'the confirmed order is listed as delivery');
  assert.equal((await ids('internal')).includes(target),false,'it is no longer internal');
});

test('a clickOrderRef / assignment alone is NOT acceptance; needs_review stays internal',async()=>{
  // A merchant reference plus an assigned company, but no durable acceptance.
  await seed('c100_ref_only',{clickOrderRef:'VNX-c100_ref_only',shippingStatusSource:'click_api',shippingStatus:'awaitingPickup'});
  // An uncertain send: needs_review.
  await seed('c100_uncertain',{dispatchState:'needs_review',clickOrderRef:'VNX-c100_uncertain',syncError:'غير مؤكد'});
  const deliveryList=await ids('delivery'),internal=await ids('internal');
  for(const id of ['c100_ref_only','c100_uncertain']){
    assert.equal(deliveryList.includes(id),false,`${id} is not accepted`);
    assert.ok(internal.includes(id),`${id} stays internal`);
  }
  const stats=await call('dashboardStats',{});
  assert.equal(stats.counters.operations.needs_review.count>=1,true,'the uncertain send is still surfaced');
});
