'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('Loopback Auth and Firestore emulators required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {initializeApp,getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore(),auth=getAuth();
const invoke=(name,session,data={})=>functions[name].run({auth:session?{uid:session.uid,token:session}:null,data});
let reader,other;
const readers='notice_paging_reader',others='notice_paging_other';

async function google(label){
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=local-test-key',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:label,email:label+'@example.test',email_verified:true,name:label})}).toString(),requestUri:'http://localhost',returnSecureToken:true})});
  assert.equal(response.status,200);
  return auth.verifyIdToken((await response.json()).idToken);
}

before(async()=>{
  reader=await google(readers);other=await google(others);
  await db.doc('members/'+reader.uid).set({name:'reader',role:'manager',active:true,permissions:[]});
  await db.doc('members/'+other.uid).set({name:'other',role:'manager',active:true,permissions:[]});
  // 120 notices: more than one page at the default size and more than the
  // previous hard cap of 50.
  const base=Timestamp.fromMillis(1700000000000);
  const batch=db.batch();
  for(let i=0;i<120;i++){
    batch.set(db.doc('notices/n'+String(i).padStart(3,'0')),{recipientId:reader.uid,title:'t'+i,body:'b'+i,orderId:null,read:false,createdAt:Timestamp.fromMillis(base.toMillis()+i*1000)});
  }
  batch.set(db.doc('notices/foreign'),{recipientId:other.uid,title:'secret',body:'secret',orderId:null,read:false,createdAt:Timestamp.fromMillis(base.toMillis()+999999)});
  await batch.commit();
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('notices paginate past the old 50 cap and never expose another employee',async()=>{
  const seen=new Set();let cursor,page=0,total=0;
  for(;;){
    const result=await invoke('listNotices',reader,{pageSize:25,afterId:cursor});
    page++;
    for(const item of result.items){assert.equal(seen.has(item.id),false,`duplicate ${item.id}`);seen.add(item.id);}
    total+=result.items.length;
    assert.equal(result.items.some(i=>i.id==='foreign'),false,'foreign notice leaked');
    if(!result.more)break;
    cursor=result.afterId;assert.ok(cursor);
    assert.ok(page<20,'pagination did not terminate');
  }
  assert.equal(total,120);
  assert.equal(seen.size,120);
});

test('the cursor belongs to the caller and a foreign id is refused',async()=>{
  const first=await invoke('listNotices',reader,{pageSize:10});
  assert.equal(first.more,true);
  // A notice owned by someone else must not be usable as a cursor.
  await assert.rejects(()=>invoke('listNotices',reader,{pageSize:10,afterId:'foreign'}),{code:'invalid-argument'});
  await assert.rejects(()=>invoke('listNotices',reader,{pageSize:10,afterId:'does-not-exist'}),{code:'invalid-argument'});
  // The caller's own cursor is accepted and returns strictly older notices.
  const second=await invoke('listNotices',reader,{pageSize:10,afterId:first.afterId});
  assert.equal(second.items.length,10);
  const overlap=second.items.filter(i=>first.items.some(f=>f.id===i.id));
  assert.equal(overlap.length,0);
});

test('page size is bounded and malformed requests are refused',async()=>{
  for(const pageSize of [0,-1,1.5,101,1000,'10','abc',NaN,{},[]])
    await assert.rejects(()=>invoke('listNotices',reader,{pageSize}),{code:'invalid-argument'});
  // An omitted or explicit null size falls back to the documented default.
  assert.equal((await invoke('listNotices',reader,{pageSize:null})).items.length,50);
  assert.equal((await invoke('listNotices',reader,{})).items.length,50);
  assert.equal((await invoke('listNotices',reader,{pageSize:1})).items.length,1);
  assert.equal((await invoke('listNotices',reader,{pageSize:100})).items.length,100);
});

test('the newest notice is first so the inbox order is stable',async()=>{
  const result=await invoke('listNotices',reader,{pageSize:3});
  assert.deepEqual(result.items.map(i=>i.id),['n119','n118','n117']);
});
