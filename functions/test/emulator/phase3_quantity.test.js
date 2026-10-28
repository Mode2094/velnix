'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});
const input={customer:'عميل كمية',phone:'0791234567',city:'عمان',area:'وسط',address:'شارع',
  description:'طرد واحد فقط',quantity:9,amount:'10.000',paymentMethod:'عند الاستلام',orderType:'normal'};
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
  await db.doc('pages/page_a').set({name:'صفحة الكمية',active:true,archived:false,status:'active',createdAt:Timestamp.now()});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('a new order always stores quantity 1 even when the payload sends another value',async()=>{
  const created=await invoke('createOrder','gm',{...input,quantity:9,pageId:'page_a',requestKey:'quantity-key-0000001'});
  const snap=await db.doc('orders/'+created.id).get();
  assert.equal(snap.data().quantity,1);
});

test('editing an existing order preserves its historical quantity',async()=>{
  const ref=db.collection('orders').doc('legacy_multi_qty');
  await ref.set({customer:'قديم',phone:'0791234567',phoneDigits:'0791234567',customerKey:'قديم',
    city:'عمان',area:'وسط',address:'شارع',description:'طرد قديم',quantity:4,amountMinor:10000,
    paymentMethod:'عند الاستلام',orderType:'normal',status:'created',createdBy:'gm',hasDelivery:false,
    companyId:null,orderNumber:'VNX-900001',barcodeValue:'VNX-legacy_multi_qty',revision:0,
    pageId:'page_a',pageName:'صفحة الكمية',pageFacebookUrl:'',dispatchState:'idle',
    createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  await invoke('updateOrder','gm',{id:'legacy_multi_qty',revision:0,...input,quantity:99});
  const after=(await ref.get()).data();
  assert.equal(after.quantity,4);
});
