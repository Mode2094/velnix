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
const base={customer:'مالية',phone:'0791234567',phoneDigits:'0791234567',city:'عمان',area:'وسط',address:'',
  description:'طرد مالي',quantity:1,status:'created',hasDelivery:false,companyId:null,orderType:'normal',
  revision:0,dispatchState:'idle'};
async function put(id,createdBy,amountMinor){
  const fields={...base,createdBy,amountMinor};
  await db.doc('orders/'+id).set({...fields,...buildSearchFields(fields),orderNumber:'VNX-'+id,
    barcodeValue:'VNX-'+id,createdAt:Timestamp.now()});
}
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
  await db.doc('members/entry').set({id:'entry',name:'entry',role:'dataEntry',active:true,permissions:[],authorizationVersion:1});
  await db.doc('members/manager').set({id:'manager',name:'manager',role:'manager',active:true,permissions:['manageEmployees','viewAllOrders'],authorizationVersion:1});
  await put('own_entry','entry',12345);
  await put('other_order','manager',54321);
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('the creator exception shows only the creator their own amount; lists and printing payloads redact others',async()=>{
  // The manager can see every order (viewAllOrders) but not amounts.
  const rows=(await invoke('listOrders','manager',{pageSize:50})).items;
  assert.equal(rows.find(o=>o.id==='own_entry').amount,undefined);
  assert.equal(rows.find(o=>o.id==='other_order').amount,54.321);
  assert.equal(Object.hasOwn(rows.find(o=>o.id==='own_entry'),'amount'),false);
  const byIds=(await invoke('getOrdersByIds','manager',{ids:['own_entry','other_order']})).items;
  assert.equal(Object.hasOwn(byIds.find(o=>o.id==='own_entry'),'amount'),false);
  assert.equal(byIds.find(o=>o.id==='other_order').amount,54.321);
  const searched=(await invoke('searchOrders','manager',{query:'مالية'})).items;
  assert.equal(Object.hasOwn(searched.find(o=>o.id==='own_entry'),'amount'),false);
  // A data entry account still sees the amount it typed on its own order.
  const own=(await invoke('listOrders','entry',{pageSize:50})).items;
  assert.equal(own.length,1);
  assert.equal(own[0].amount,12.345);
});

test('an explicit viewAmounts holder sees every visible order amount',async()=>{
  await db.doc('members/manager').update({permissions:['manageEmployees','viewAllOrders','viewAmounts']});
  const rows=(await invoke('listOrders','manager',{pageSize:50})).items;
  assert.equal(rows.find(o=>o.id==='other_order').amount,54.321);
  assert.equal(rows.find(o=>o.id==='own_entry').amount,12.345);
});

test('aggregates never expose amounts without the permission',async()=>{
  const entry=await invoke('dashboardStats','entry',{});
  assert.equal(entry.amountsVisible,false);
  const gm=await invoke('dashboardStats','gm',{});
  assert.equal(gm.amountsVisible,true);
});
