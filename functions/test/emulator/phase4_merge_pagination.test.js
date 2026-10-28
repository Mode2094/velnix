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
const base={customer:'دمج',phone:'0790000000',phoneDigits:'0790000000',city:'عمان',area:'وسط',address:'',
  description:'طلب دمج',quantity:1,amountMinor:1000,status:'created',createdBy:'gm',hasDelivery:false,
  companyId:null,orderType:'normal',revision:0,dispatchState:'idle'};
async function putRaw(id,extra={},index=1){
  const fields={...base,...extra};
  await db.doc('orders/'+id).set({...fields,...buildSearchFields(fields),
    orderNumber:extra.orderNumber||('VNX-'+String(index).padStart(6,'0')),
    barcodeValue:extra.barcodeValue||('VNX-'+id),revision:0,dispatchState:'idle',
    createdAt:extra.createdAt||Timestamp.now(),updatedAt:Timestamp.now(),sentAt:extra.sentAt||null});
}
async function putMany(items){
  let batch=db.batch(),pending=0;
  for(const [id,extra,index] of items){
    const fields={...base,...extra};
    batch.set(db.doc('orders/'+id),{...fields,...buildSearchFields(fields),
      orderNumber:extra.orderNumber||('VNX-'+String(index||1).padStart(6,'0')),
      barcodeValue:extra.barcodeValue||('VNX-'+id),revision:0,dispatchState:'idle',
      createdAt:extra.createdAt||Timestamp.now(),updatedAt:Timestamp.now(),sentAt:extra.sentAt||null});
    if(++pending===400){await batch.commit();batch=db.batch();pending=0;}
  }
  if(pending)await batch.commit();
}
before(async()=>{
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await db.doc('members/gm').set({id:'gm',name:'gm',role:'generalManager',active:true,permissions:[],authorizationVersion:1});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('5-digit query reaches an old clickOrderRef behind 130 newer phone matches',async()=>{
  const now=Date.now();
  const items=[];
  for(let i=0;i<130;i++)items.push(['phone_'+String(i).padStart(3,'0'),{
    customer:'هاتف '+i,phone:'0770012345',phoneDigits:'0770012345',
    createdAt:Timestamp.fromMillis(now-i*1000)},i+1]);
  // Older exact click reference source; its phone does not contain the digits.
  items.push(['click_old',{customer:'شحنة قديمة',phone:'0799999999',phoneDigits:'0799999999',
    clickOrderRef:'12345',createdAt:Timestamp.fromMillis(now-500000)},900]);
  await putMany(items);
  const seen=new Set();let cursor=null,pages=0;
  do{
    const page=await invoke('searchOrders','gm',{query:'12345',pageSize:17,cursor});
    for(const o of page.items){assert.equal(seen.has(o.id),false,'no duplicate');seen.add(o.id);}
    cursor=page.nextCursor;pages++;
  }while(cursor&&pages<20);
  assert.equal(seen.size,131,'all phone matches plus the old click reference');
  assert.ok(seen.has('click_old'),'old exact reference is not skipped by newer phone windows');
  assert.equal(cursor,null,'true end after every source is exhausted');
});

test('a later match behind a starved first window is still reachable',async()=>{
  const now=Date.now();
  const items=[];
  for(let i=0;i<130;i++)items.push(['irbid_m_'+String(i).padStart(3,'0'),{
    customer:'عميل متجر',description:'طرد متجر',city:'إربد',
    createdAt:Timestamp.fromMillis(now-i*1000)},i+1]);
  for(let i=0;i<7;i++)items.push(['amman_m_'+i,{
    customer:'عميل متجر',description:'طرد متجر',city:'عمان',
    createdAt:Timestamp.fromMillis(now-300000-i*1000)},500+i]);
  await putMany(items);
  const seen=new Set();let cursor=null,pages=0;
  do{
    const page=await invoke('searchOrders','gm',{query:'متجر',city:'عمان',pageSize:3,cursor});
    for(const o of page.items){assert.equal(seen.has(o.id),false,'no duplicate');seen.add(o.id);}
    cursor=page.nextCursor;pages++;
  }while(cursor&&pages<12);
  assert.equal(seen.size,7);
  assert.equal(cursor,null);
});

test('sales across 31 creators merges a large source and an older small source without loss',async()=>{
  const now=Date.now();
  await db.doc('members/salesboss').set({id:'salesboss',name:'sales',role:'sales',active:true,permissions:[],authorizationVersion:1});
  let batch=db.batch(),pending=0;
  for(let i=0;i<31;i++){
    batch.set(db.doc('members/creator_'+String(i).padStart(2,'0')),{
      id:'creator_'+i,name:'creator '+i,role:'dataEntry',active:true,permissions:[],
      salesSupervisorId:'salesboss',authorizationVersion:1});
    if(++pending===400){await batch.commit();batch=db.batch();pending=0;}
  }
  if(pending)await batch.commit();
  const items=[];
  // Big source: 30 creators x 5 = 150 newer orders in the first IN chunk.
  for(let i=0;i<30;i++)for(let k=0;k<5;k++)items.push(['big_'+i+'_'+k,{
    customer:'كبير',createdBy:'creator_'+String(i).padStart(2,'0'),
    createdAt:Timestamp.fromMillis(now-(i*5+k)*1000)},i*10+k+1]);
  // Small source: the 31st creator, older and far from the big window.
  for(let k=0;k<3;k++)items.push(['small_'+k,{
    customer:'صغير',createdBy:'creator_30',
    createdAt:Timestamp.fromMillis(now-900000-k*1000)},800+k]);
  await putMany(items);
  const expected=new Set(items.map(([id])=>id));
  const seen=new Set();let cursor=null,pages=0;
  do{
    const page=await invoke('listOrders','salesboss',{pageSize:7,afterId:cursor});
    assert.ok(page.items.length<=7);
    for(const o of page.items){assert.equal(seen.has(o.id),false,'no duplicate');assert.ok(expected.has(o.id),'only visible team orders');seen.add(o.id);}
    cursor=page.nextAfterId;pages++;
  }while(cursor&&pages<40);
  assert.equal(seen.size,153,'all 150 big-source and 3 older small-source orders');
  for(let k=0;k<3;k++)assert.ok(seen.has('small_'+k),'older small source is never skipped');
  assert.equal(cursor,null,'true end for every source');
});

test('listOrders cursor is bound to the current filters',async()=>{
  const first=await invoke('listOrders','gm',{pageSize:2});
  assert.ok(first.nextAfterId);
  await assert.rejects(invoke('listOrders','gm',{pageSize:2,afterId:first.nextAfterId,city:'إربد'}),{code:'invalid-argument'});
});
