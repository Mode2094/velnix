'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
  await db.doc('orders/scan_one').set({id:'scan_one',customer:'مسح',phone:'0791234567',city:'عمان',area:'وسط',address:'',description:'طرد',
    quantity:1,amountMinor:1000,status:'created',createdBy:'gm',hasDelivery:false,companyId:null,orderNumber:'VNX-000777',
    barcodeValue:'VNX-scan_one',revision:0,dispatchState:'idle',createdAt:Timestamp.now()});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('a batch of at least 20 codes is accepted and bounded at 30',async()=>{
  const codes=Array.from({length:20},(_,i)=>i===0?'VNX-scan_one':'missing_'+i);
  const ok=await invoke('resolveBarcodes','gm',{codes});
  assert.equal(ok.results.length,20);
  assert.equal(ok.results[0].status,'ok');
  const max=await invoke('resolveBarcodes','gm',{codes:Array.from({length:30},(_,i)=>'missing_'+i)});
  assert.equal(max.results.length,30);
  await assert.rejects(invoke('resolveBarcodes','gm',{codes:Array.from({length:31},(_,i)=>'missing_'+i)}),{code:'invalid-argument'});
});
