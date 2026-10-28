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
const base={customer:'عميل متجر',phone:'0791234567',phoneDigits:'0791234567',description:'طرد متجر شائع',note:'',
  quantity:1,amountMinor:1000,status:'created',createdBy:'gm',hasDelivery:false,companyId:null,orderType:'normal'};
function order(id,{city,createdAt}) {
  const fields={...base,city};
  return {id,data:{...fields,...buildSearchFields(fields),createdAt:Timestamp.fromMillis(createdAt),
    orderNumber:'VNX-'+id.slice(-6),barcodeValue:'VNX-'+id,revision:0}};
}
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
  const now=Date.now();
  let batch=db.batch(),pending=0;
  // 130 newer candidates in another governorate starve the first 120-candidate window.
  for(let i=0;i<130;i++){
    const o=order('irbid_'+String(i).padStart(3,'0'),{city:'إربد',createdAt:now-i*1000});
    batch.set(db.doc('orders/'+o.id),o.data);pending++;
    if(pending===400){await batch.commit();batch=db.batch();pending=0;}
  }
  // 7 older matches in Amman, beyond the first candidate window.
  for(let i=0;i<7;i++){
    const o=order('amman_'+String(i).padStart(3,'0'),{city:'عمان',createdAt:now-200000-i*1000});
    batch.set(db.doc('orders/'+o.id),o.data);pending++;
  }
  if(pending)await batch.commit();
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('search keeps paging past a starved first candidate window instead of declaring the end',async()=>{
  const seen=new Set();let cursor=null,pages=0,sawShortPageWithCursor=false;
  do{
    const page=await invoke('searchOrders','gm',{query:'متجر',city:'عمان',pageSize:3,cursor});
    for(const o of page.items){assert.equal(seen.has(o.id),false,'no duplicate across pages');seen.add(o.id);}
    if(page.items.length<3&&page.nextCursor)sawShortPageWithCursor=true;
    cursor=page.nextCursor;pages++;
  }while(cursor&&pages<12);
  assert.equal(seen.size,7,'all older matches are reachable across pages');
  assert.equal(cursor,null,'the search ends only after the older matches are consumed');
  assert.ok(pages>=3);
  assert.equal(sawShortPageWithCursor,true,'the starved first window returned a cursor, not a false end');
});

test('search still ends exactly when every source is exhausted',async()=>{
  const page=await invoke('searchOrders','gm',{query:'عنصر غير موجود إطلاقا',pageSize:5});
  assert.equal(page.items.length,0);
  assert.equal(page.nextCursor,null);
});
