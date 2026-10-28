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
const base={customer:'بحث مباشر',phone:'0791234567',phoneDigits:'0791234567',city:'عمان',area:'وسط',
  address:'',quantity:1,amountMinor:1000,status:'created',createdBy:'gm',hasDelivery:false,companyId:null,
  orderType:'normal',revision:0,dispatchState:'idle'};
async function put(id,description,createdAt,index){
  const fields={...base,description};
  await db.doc('orders/'+id).set({...fields,...buildSearchFields(fields),orderNumber:'VNX-'+String(index).padStart(6,'0'),
    barcodeValue:'VNX-'+id,createdAt:Timestamp.fromMillis(createdAt),updatedAt:Timestamp.fromMillis(createdAt)});
}
async function pageAll(query,pageSize,sort){
  const seen=new Set();const rows=[];let cursor=null,pages=0;
  do{
    const page=await invoke('searchOrders','gm',{query,pageSize,sort,cursor});
    for(const o of page.items){assert.equal(seen.has(o.id),false,`duplicate ${o.id}`);seen.add(o.id);rows.push(o.id);}
    cursor=page.nextCursor;pages++;
  }while(cursor&&pages<20);
  return {ids:rows,seen,pages};
}
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('descending: a direct old id plus six newer content matches are all returned',async()=>{
  const now=Date.now();
  await put('ABCDEFGH','طلب قديم بمعرّف مطابق',now-1000000,1);
  for(let i=0;i<6;i++)await put('newer_'+i,'يحتوي ABCDEFGH في المحتويات',now-i*1000,i+2);
  const {ids,seen,pages}=await pageAll('ABCDEFGH',3,'desc');
  assert.equal(seen.size,7,`expected 7 unique results, got ${seen.size} across ${pages} pages: ${ids}`);
  assert.ok(ids.includes('ABCDEFGH'));
  for(let i=0;i<6;i++)assert.ok(ids.includes('newer_'+i),`missing newer_${i}`);
});

test('descending with equal createdAt: tie order loses nothing',async()=>{
  const now=Date.now();
  await db.doc('orders/ABCDEFGH').delete().catch(()=>{});
  for(let i=0;i<6;i++)await db.doc('orders/newer_'+i).delete().catch(()=>{});
  await put('ABCDEFGH','طلب قديم',now-1000000,1);
  for(let i=0;i<6;i++)await put('newer_'+i,'ABCDEFGH مشترك',now-5000,i+2); // same timestamp for all six
  const {seen,pages}=await pageAll('ABCDEFGH',3,'desc');
  assert.equal(seen.size,7,`equal timestamps must not drop results (got ${seen.size} in ${pages})`);
});

test('ascending: the old direct id is first and all six newer matches follow',async()=>{
  const now=Date.now();
  await db.doc('orders/ABCDEFGH').delete().catch(()=>{});
  for(let i=0;i<6;i++)await db.doc('orders/newer_'+i).delete().catch(()=>{});
  await put('ABCDEFGH','طلب قديم',now-1000000,1);
  for(let i=0;i<6;i++)await put('newer_'+i,'ABCDEFGH تصاعدي',now-i*1000,i+2);
  const {ids,seen}=await pageAll('ABCDEFGH',3,'asc');
  assert.equal(seen.size,7);
  assert.equal(ids[0],'ABCDEFGH','ascending starts with the oldest direct id');
});
