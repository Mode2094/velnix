'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {buildSearchFields}=require('../../src/search');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});
const base={customer:'عميل فلاتر',phone:'0791111111',phoneDigits:'0791111111',phoneKey:'0791111111',
  city:'عمان',area:'وسط',address:'شارع',quantity:1,amountMinor:1000,status:'created',createdBy:'gm',
  hasDelivery:false,companyId:null,orderType:'normal',revision:0,dispatchState:'idle'};
async function put(id,extra={}){
  const fields={...base,customer:'عميل فلاتر',phone:'0791111111',phoneDigits:'0791111111',description:'طرد قميص أزرق',note:'ملاحظة عاجلة',city:'عمان',...extra};
  await db.doc('orders/'+id).set({...fields,...buildSearchFields(fields),
    orderNumber:extra.orderNumber||('VNX-'+(extra.seq||1)),barcodeValue:extra.barcodeValue||('VNX-'+id),
    createdAt:extra.createdAt||Timestamp.now(),sentAt:extra.sentAt||null});
}
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
  await put('f1');
  await put('f2',{phone:'0782222222',phoneDigits:'0782222222',description:'حقيبة جلد',note:'يسلم مساء',customer:'سارة'});
  await put('f3',{phone:'0793333333',phoneDigits:'0793333333',description:'قميص أبيض',note:'',sentAt:Timestamp.fromMillis(Date.parse('2026-10-20T10:00:00Z')),status:'dispatched',hasDelivery:true,dispatchState:'sent'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
const ids=page=>page.items.map(o=>o.id).sort();

test('phone, barcode, product and note are independent combines conditions',async()=>{
  assert.deepEqual(ids(await invoke('listOrders','gm',{phone:'0782'})),['f2']);
  assert.deepEqual(ids(await invoke('listOrders','gm',{product:'قميص'})),['f1','f3']);
  assert.deepEqual(ids(await invoke('listOrders','gm',{note:'مساء'})),['f2']);
  assert.deepEqual(ids(await invoke('listOrders','gm',{barcode:'VNX-f2'})),['f2']);
  // Combined with a common search token still respects the text conditions.
  assert.deepEqual(ids(await invoke('searchOrders','gm',{query:'قميص',product:'أبيض'})),['f3']);
});

test('dispatch date filters only orders that were actually sent',async()=>{
  assert.deepEqual(ids(await invoke('listOrders','gm',{sentFrom:'2026-10-19T00:00:00Z',sentTo:'2026-10-21T00:00:00Z'})),['f3']);
  assert.deepEqual(ids(await invoke('listOrders','gm',{sentFrom:'2026-10-21T00:00:00Z'})),[]);
});

test('invalid text filters are rejected instead of scanning unbounded input',async()=>{
  await assert.rejects(invoke('listOrders','gm',{phone:'07'}),{code:'invalid-argument'});
  await assert.rejects(invoke('listOrders','gm',{product:'x'.repeat(121)}),{code:'invalid-argument'});
  await assert.rejects(invoke('searchOrders','gm',{query:'قميص',barcode:'x'.repeat(141)}),{code:'invalid-argument'});
});
