'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {correctionTargets}=require('../../src/policy');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});
const base={customer:'تصحيح',phone:'0791234567',phoneDigits:'0791234567',customerKey:'تصحيح',city:'عمان',area:'وسط',
  address:'شارع',description:'طلب داخلي',quantity:1,amountMinor:1000,paymentMethod:'عند الاستلام',orderType:'normal',
  status:'created',createdBy:'gm',hasDelivery:false,companyId:null,revision:0,dispatchState:'idle',
  orderNumber:'VNX-700001',barcodeValue:'VNX-correct_1',createdAt:Timestamp.now(),updatedAt:Timestamp.now()};
const put=(id,extra={})=>db.collection('orders').doc(id).set({...base,...extra});
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  for(const [id,role,permissions] of [['gm','generalManager',[]],['mgr','manager',['manageEmployees','updateOrderStatus']],['entry','dataEntry',[]]])
    await db.doc('members/'+id).set({id,name:id,role,active:true,permissions,authorizationVersion:1});
  await put('correct_1');
  await put('correct_ready',{status:'ready'});
  await put('correct_click',{status:'ready',hasDelivery:true,companyId:'click'});
  await put('correct_sent',{status:'dispatched',dispatchState:'sent',hasDelivery:true,clickOrderRef:'C-1'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('general manager corrects an internal status with a reason and full audit',async()=>{
  await invoke('correctOrderStatus','gm',{id:'correct_1',status:'preparing',reason:'تصحيح إدخال خاطئ'});
  const snap=await db.doc('orders/correct_1').get();
  assert.equal(snap.data().status,'preparing');
  assert.equal(snap.data().hasDelivery,false);
  const events=await db.collection('orders/correct_1/events').where('action','==','status_corrected').get();
  assert.equal(events.size,1);
  assert.deepEqual(events.docs[0].data().details,{from:'created',to:'preparing',reason:'تصحيح إدخال خاطئ'});
  const audit=await db.collection('auditEvents').where('entityId','==','correct_1').where('action','==','order.status_corrected').get();
  assert.equal(audit.size,1);
  assert.equal(audit.docs[0].data().extra.from,'created');
  assert.equal(audit.docs[0].data().extra.to,'preparing');
  assert.equal(audit.docs[0].data().extra.reason,'تصحيح إدخال خاطئ');
});

test('correction is general-manager only and requires a real reason',async()=>{
  await assert.rejects(invoke('correctOrderStatus','mgr',{id:'correct_1',status:'ready',reason:'محاولة مدير'}),{code:'permission-denied'});
  await assert.rejects(invoke('correctOrderStatus','gm',{id:'correct_1',status:'ready',reason:'  '}),{code:'invalid-argument'});
  await assert.rejects(invoke('correctOrderStatus','gm',{id:'correct_1',status:'dispatched',reason:'حالة شركة'}),{code:'failed-precondition'});
});

test('correction refuses carrier/Click orders and only allows internal completion from ready',async()=>{
  await assert.rejects(invoke('correctOrderStatus','gm',{id:'correct_click',status:'cancelled',reason:'محاولة إلغاء'}),{code:'failed-precondition'});
  await assert.rejects(invoke('correctOrderStatus','gm',{id:'correct_sent',status:'delivered',reason:'محاولة تزوير'}),{code:'failed-precondition'});
  await assert.rejects(invoke('correctOrderStatus','gm',{id:'correct_1',status:'delivered',reason:'ليست جاهزة'}),{code:'failed-precondition'});
  assert.deepEqual(correctionTargets({status:'created',hasDelivery:false,dispatchState:'idle'}),['review','preparing','ready','cancelled']);
  assert.deepEqual(correctionTargets({status:'ready',hasDelivery:false,companyId:null,dispatchState:'idle'}),['created','review','preparing','cancelled','delivered']);
  assert.deepEqual(correctionTargets({status:'ready',companyId:'c',hasDelivery:false,dispatchState:'idle'}),['created','review','preparing','cancelled']);
  assert.deepEqual(correctionTargets({status:'ready',dispatchState:'sent'}),[]);
  await invoke('correctOrderStatus','gm',{id:'correct_ready',status:'delivered',reason:'إكمال داخلي مصحح'});
  const done=await db.doc('orders/correct_ready').get();
  assert.equal(done.data().status,'delivered');
  assert.equal(done.data().completionSource,'internal');
  assert.equal(done.data().hasDelivery,false);
});

test('a corrected delivered order can be reopened because it has no carrier contract',async()=>{
  await invoke('correctOrderStatus','gm',{id:'correct_ready',status:'created',reason:'إعادة فتح بعد خطأ'});
  assert.equal((await db.doc('orders/correct_ready').get()).data().status,'created');
});
