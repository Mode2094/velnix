'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index'),admin=require('firebase-admin');
const db=admin.firestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id}:null,data});
const payload={customer:'عميل عربي',phone:'٠٧٩١٢٣٤٥٦٧',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amount:'12.345'};
const users={generalManager:'gm',manager:'manager',warehouse:'warehouse',sales:'sales',dataEntry:'entry'};
let orderId;
before(async()=>{
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('Only loopback test database may be reset');
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Only loopback test Auth may be reset');
  const resetAuth=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});if(!resetAuth.ok)throw Error('Auth emulator reset failed');
  const reset=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});if(!reset.ok)throw Error('Emulator reset failed');
  for(const [role,id]of Object.entries(users)){
    await admin.auth().createUser({uid:id,email:id+'@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
    await db.doc('members/'+id).set({role,id,name:id,active:true,permissions:[],salesSupervisorId:role==='dataEntry'?'sales':null});
  }
  await db.doc('companies/company').set({name:'Local contract',enabled:true,archived:false,provider:'generic_v1',statusMap:{delivered:'delivered'}});
});
after(async()=>{await db.terminate();await admin.app().delete();});
for(const [role,id]of Object.entries(users))test(role+' creates a real persisted order and sees it',async()=>{
  const result=await invoke('createOrder',id,{...payload,requestKey:'create_order_for_'+id});
  const doc=await db.doc('orders/'+result.id).get();
  assert.equal(doc.data().createdBy,id);assert.equal(doc.data().amountMinor,12345);
  assert.equal(doc.data().barcodeValue,'VNX-'+result.id);
  const read=await invoke('getOrder',id,{id:result.id});assert.equal(read.order.id,result.id);
  if(id==='entry')orderId=result.id;
});
test('concurrent duplicate requests produce one order and one creation event',async()=>{
  const input={...payload,requestKey:'concurrent_request_key'};
  const results=await Promise.all([invoke('createOrder','entry',input),invoke('createOrder','entry',input),invoke('createOrder','entry',input)]);
  assert.equal(new Set(results.map(r=>r.id)).size,1);
  assert.equal(results.filter(r=>!r.alreadyExists).length,1);
  const events=await db.collection('orders/'+results[0].id+'/events').get();assert.equal(events.size,1);
  await assert.rejects(invoke('createOrder','entry',{...input,customer:'Different'}),{code:'already-exists'});
});
test('roles, private amounts and disabled accounts enforced by handlers',async()=>{
  const team=await invoke('getOrder','sales',{id:orderId});assert.equal('amount'in team.order,false);
  await assert.rejects(invoke('getOrder','manager',{id:orderId}),{code:'permission-denied'});
  await assert.rejects(invoke('createOrder',null,{...payload,requestKey:'unauthenticated_key'}),{code:'unauthenticated'});
  await db.doc('members/entry').update({active:false});
  await assert.rejects(invoke('getOrder','entry',{id:orderId}),{code:'permission-denied'});
  await db.doc('members/entry').update({active:true});
});
test('workflow blocks forged carrier states and revisions prevent lost updates',async()=>{
  await assert.rejects(invoke('changeOrderStatus','entry',{id:orderId,status:'review'}),{code:'failed-precondition'});
  await invoke('changeOrderStatus','warehouse',{id:orderId,status:'review'});
  await assert.rejects(invoke('changeOrderStatus','gm',{id:orderId,status:'delivered'}),{code:'failed-precondition'});
  const original=(await invoke('getOrder','entry',{id:orderId})).order;
  await invoke('updateOrder','entry',{...payload,id:orderId,revision:original.revision});
  await assert.rejects(invoke('updateOrder','entry',{...payload,id:orderId,revision:original.revision}),{code:'aborted'});
  await invoke('changeOrderStatus','warehouse',{id:orderId,status:'preparing'});
  await invoke('changeOrderStatus','warehouse',{id:orderId,status:'ready'});
  await invoke('assignCompany','gm',{id:orderId,companyId:'company'});
  const ref=db.doc('orders/'+orderId);
  await ref.update({dispatchState:'needs_review'});
  await assert.rejects(invoke('assignCompany','gm',{id:orderId,companyId:null}),{code:'failed-precondition'});
  const blocked=(await invoke('getOrder','gm',{id:orderId})).order;
  await assert.rejects(invoke('updateOrder','gm',{...payload,id:orderId,revision:blocked.revision}),{code:'permission-denied'});
  await assert.rejects(invoke('resolveDispatchException','manager',{id:orderId,outcome:'not_created',reason:'Verified locally'}),{code:'permission-denied'});
  await ref.update({dispatchState:'sending',dispatchLockId:'old-lock',dispatchLockUntil:admin.firestore.Timestamp.fromMillis(Date.now()-1000)});
  await invoke('resolveDispatchException','gm',{id:orderId,outcome:'shipment_exists',trackingNumber:'TRACK-1',reason:'Vendor confirmed shipment'});
  const resolved=(await ref.get()).data();assert.equal(resolved.status,'dispatched');assert.equal(resolved.trackingNumber,'TRACK-1');assert.equal(resolved.dispatchLockId,undefined);
});
test('Arabic phone search and exact aggregates exceed 1000 records',async()=>{
  const batch=db.bulkWriter();
  for(let i=0;i<1005;i++)batch.set(db.doc('orders/load_'+i),{...payload,amountMinor:12345,phone:'0791234567',phoneDigits:'0791234567',customerKey:'عميل عربي',createdBy:'bulk',visibleTo:['bulk'],status:'created',hasDelivery:false,companyId:null,createdAt:admin.firestore.Timestamp.now()});
  await batch.close();
  const search=await invoke('searchOrders','entry',{query:'٠٧٩١٢٣٤٥٦٧'});assert.ok(search.items.some(o=>o.id===orderId));
  const stats=await invoke('dashboardStats','gm');const count=stats.counters.all.created.count;
  assert.ok(count>=1005);assert.equal(stats.partial,false);
  assert.equal(count,stats.counters.internal.created.count+stats.counters.delivery.created.count);
});
test('employee creation honors inactive state and delegated managers cannot escalate',async()=>{
  const result=await invoke('saveMember','gm',{name:'Disabled test',email:'disabled-test@velnix.test',password:'LocalTestingOnly123!',role:'dataEntry',active:false,permissions:[]});
  assert.equal((await db.doc('members/'+result.id).get()).data().active,false);
  assert.equal((await admin.auth().getUser(result.id)).disabled,true);
  await db.doc('members/manager').update({permissions:['manageEmployees']});
  await assert.rejects(invoke('saveMember','manager',{name:'Escalation',email:'escalation@velnix.test',password:'LocalTestingOnly123!',role:'generalManager',permissions:[]}),{code:'permission-denied'});
  await assert.rejects(invoke('saveMember','manager',{name:'Escalation',email:'escalation@velnix.test',password:'LocalTestingOnly123!',role:'dataEntry',permissions:['manageCompanies']}),{code:'permission-denied'});
});
test('concurrent mutual administrator deactivation preserves an active administrator',async()=>{
  for(const id of ['gmA','gmB']){
    await admin.auth().createUser({uid:id,email:id+'@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
    await db.doc('members/'+id).set({name:id,role:'generalManager',active:true,permissions:[]});
  }
  await db.doc('members/gm').update({active:false});
  const decision=(target)=>({id:target,name:target,role:'generalManager',active:false,permissions:[]});
  const results=await Promise.allSettled([invoke('saveMember','gmA',decision('gmB')),invoke('saveMember','gmB',decision('gmA'))]);
  assert.ok(results.some(r=>r.status==='rejected'));
  const remaining=await db.collection('members').where('role','==','generalManager').where('active','==',true).get();
  assert.ok(remaining.size>=1);
  await db.doc('members/gm').update({active:true});
});
