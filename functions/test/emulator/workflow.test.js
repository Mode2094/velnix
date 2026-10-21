'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
process.env.ALLOWED_DELIVERY_HOSTS='admin.clickdelivery.org,local-contract.example';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});
const payload={customer:'عميل عربي',phone:'٠٧٩١٢٣٤٥٦٧',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amount:'12.345'};
const users={generalManager:'gm',manager:'manager',warehouse:'warehouse',sales:'sales',dataEntry:'entry'};
let orderId;
test('disabled carrier and unconfirmed Click fail before claiming a shipment lock',async()=>{
  for(const [id,company] of Object.entries({disabled_carrier:{provider:'generic_v1',enabled:false,apiUrl:'https://local-contract.example'},click_carrier:{provider:'click_delivery_v1',enabled:true,apiUrl:'https://admin.clickdelivery.org/Client'}})){
    await db.doc('companies/'+id).set(company);
    const ref=db.doc('orders/'+id);await ref.set({status:'ready',companyId:id,createdBy:'gm',dispatchState:'idle',revision:0});
    await assert.rejects(invoke('sendOrderToDelivery','gm',{id}),{code:'failed-precondition'});
    const order=(await ref.get()).data();assert.equal(order.dispatchState,'idle');assert.equal(order.dispatchLockId,undefined);assert.equal(order.revision,0);
  }
});
test('missing credentials before a vendor attempt return to idle and retain an audited order',async()=>{
  await db.doc('companies/missing_credentials').set({enabled:true,provider:'generic_v1',apiUrl:'https://local-contract.example'});
  const ref=db.doc('orders/no_vendor_attempt');await ref.set({status:'ready',companyId:'missing_credentials',createdBy:'gm',dispatchState:'idle'});
  await assert.rejects(invoke('sendOrderToDelivery','gm',{id:ref.id}),{code:'failed-precondition'});
  const order=(await ref.get()).data();assert.equal(order.dispatchState,'idle');assert.equal(order.status,'ready');assert.equal(order.dispatchLockId,undefined);
  assert.ok(order.syncError.includes('لم يبدأ'));
  assert.equal((await ref.collection('events').where('action','==','dispatch_preparation_failed').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==',ref.id).where('action','==','order.dispatch_preparation_failed').get()).size,1);
});
test('Click company activates with User_ID, stays assignable, and sending remains separately gated',async()=>{
  process.env.ALLOWED_DELIVERY_HOSTS='admin.clickdelivery.org,local-contract.example';
  const data={name:'Click fixture',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',enabled:false,statusMap:{},clickUserId:'1603'};
  const saved=await invoke('saveCompany','gm',data);
  const created=(await db.doc('companies/'+saved.id).get()).data();
  assert.equal(created.enabled,false);
  assert.equal(created.clickSendEnabled,false);
  await assert.rejects(invoke('saveCompany','gm',{name:'Click without User_ID',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',enabled:true,statusMap:{}}),{code:'failed-precondition'});
  await assert.rejects(invoke('saveCompany','gm',{...data,id:saved.id,enabled:true,clickSendEnabled:true}),{code:'failed-precondition'});
  await assert.rejects(invoke('saveCompany','gm',{...data,id:saved.id,apiToken:'not-a-click-token'}),{code:'invalid-argument'});
  await assert.rejects(invoke('saveCompany','gm',{...data,id:saved.id,statusMap:{invented:'delivered'}}),{code:'invalid-argument'});
  await assert.rejects(invoke('saveCompany','entry',data),{code:'permission-denied'});
  const {clickUserId:_savedUserId,...withoutUser}=data;
  await invoke('saveCompany','gm',{...withoutUser,id:saved.id,enabled:true});
  const enabled=(await db.doc('companies/'+saved.id).get()).data();
  assert.equal(enabled.enabled,true);
  assert.equal(enabled.clickSendEnabled,false);
  assert.equal(enabled.clickUserId,1603);
  assert.equal((await db.doc('companySecrets/'+saved.id).get()).exists,false);
  await db.doc('orders/click_assign').set({status:'ready',companyId:null,createdBy:'gm',visibleTo:['gm'],dispatchState:'idle',revision:0});
  await invoke('assignCompany','gm',{id:'click_assign',companyId:saved.id});
  assert.equal((await db.doc('orders/click_assign').get()).data().companyId,saved.id);
  assert.equal((await db.doc('orders/click_assign').collection('events').where('action','==','company_assigned').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==','click_assign').where('action','==','order.company_assigned').get()).size,1);
  await invoke('assignCompany','gm',{id:'click_assign',companyId:null});
  assert.equal((await db.doc('orders/click_assign').get()).data().companyId,null);
  assert.equal((await db.doc('orders/click_assign').collection('events').where('action','==','company_unassigned').get()).size,1);
  assert.equal((await db.collection('auditEvents').where('entityId','==','click_assign').where('action','==','order.company_unassigned').get()).size,1);
  await db.doc('companies/'+saved.id).update({enabled:false});
  await assert.rejects(invoke('assignCompany','gm',{id:'click_assign',companyId:saved.id}),{code:'failed-precondition'});
  let code,body;
  const response={status(value){code=value;return this;},send(value){body=value;return this;}};
  await functions.deliveryWebhook({method:'POST',query:{companyId:saved.id}},response);
  assert.equal(code,409);assert.equal(body,'provider_contract_unconfirmed');
  await assert.rejects(invoke('saveCompany','gm',{...data,id:saved.id,provider:'generic_v1',apiUrl:'https://local-contract.example'}),{code:'failed-precondition'});
});
test('Click activation uses its pinned URL and does not depend on the generic host allowlist',async()=>{
  const previous=process.env.ALLOWED_DELIVERY_HOSTS;
  delete process.env.ALLOWED_DELIVERY_HOSTS;
  try{
    const saved=await invoke('saveCompany','gm',{name:'Pinned Click',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',enabled:true,statusMap:{},clickUserId:'1603'});
    const company=(await db.doc('companies/'+saved.id).get()).data();
    assert.equal(company.enabled,true);
    assert.equal(company.clickSendEnabled,false);
    assert.equal(company.clickUserId,1603);
  }finally{
    process.env.ALLOWED_DELIVERY_HOSTS=previous;
  }
});
test('company and member updates require explicit state and cannot silently wipe, disable or reactivate',async()=>{
  await db.doc('companies/state_guard').set({name:'State guard',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true,archived:false,statusMap:{delivered:'delivered'}});
  for(const data of [
    {id:'state_guard',name:'State guard',apiUrl:'https://local-contract.example',provider:'generic_v1',statusMap:{delivered:'delivered'}},
    {id:'state_guard',name:'State guard',apiUrl:'https://local-contract.example',provider:'generic_v1',enabled:true}
  ])await assert.rejects(invoke('saveCompany','gm',data),{code:'invalid-argument'});
  const company=(await db.doc('companies/state_guard').get()).data();
  assert.equal(company.enabled,true);assert.deepEqual(company.statusMap,{delivered:'delivered'});
  await assert.rejects(invoke('restoreCompany','gm',{id:'state_guard'}),{code:'failed-precondition'});
  assert.equal((await db.doc('companies/state_guard').get()).data().enabled,true);
  await db.doc('companies/state_guard').update({archived:true,enabled:false});
  await invoke('restoreCompany','gm',{id:'state_guard'});
  const restored=(await db.doc('companies/state_guard').get()).data();
  assert.equal(restored.archived,false);assert.equal(restored.enabled,false);

  await getAuth().createUser({uid:'state_member',email:'state-member@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
  await db.doc('members/state_member').set({name:'State member',role:'dataEntry',active:false,permissions:['viewReports'],salesSupervisorId:null});
  await assert.rejects(invoke('saveMember','gm',{id:'state_member',name:'State member',role:'dataEntry',permissions:['viewReports']}),{code:'invalid-argument'});
  await assert.rejects(invoke('saveMember','gm',{id:'state_member',name:'State member',role:'dataEntry',active:true}),{code:'invalid-argument'});
  const member=(await db.doc('members/state_member').get()).data();
  assert.equal(member.active,false);assert.deepEqual(member.permissions,['viewReports']);
});
test('no permanent order-delete or Click-remove callable exists; rules deny deletion for every role',()=>{
  assert.equal(functions.deleteOrder,undefined);assert.equal(functions.removeorder,undefined);
  // Actual SDK deletion denials for all five roles are exercised in rules.test.js.
});
test('order creation cannot forge carrier status, identifiers or unverified financial fields',async()=>{
  const created=await invoke('createOrder','entry',{...payload,requestKey:'forged_carrier_fields',status:'delivered',shippingStatus:'partiallyDelivered',companyId:'click_carrier',trackingNumber:'FAKE',Order_ID:1,amountMinor:0,collectedAmount:999});
  const record=(await db.doc('orders/'+created.id).get()).data();
  assert.equal(record.status,'created');assert.equal(record.companyId,null);assert.equal(record.trackingNumber,null);assert.equal(record.amountMinor,12345);
  for(const field of ['shippingStatus','Order_ID','collectedAmount'])assert.equal(Object.hasOwn(record,field),false);
  await assert.rejects(invoke('changeOrderStatus','gm',{id:created.id,status:'partiallyDelivered'}),{code:'failed-precondition'});
});
before(async()=>{
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('Only loopback test database may be reset');
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Only loopback test Auth may be reset');
  const resetAuth=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});if(!resetAuth.ok)throw Error('Auth emulator reset failed');
  const reset=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});if(!reset.ok)throw Error('Emulator reset failed');
  for(const [role,id]of Object.entries(users)){
    await getAuth().createUser({uid:id,email:id+'@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
    await db.doc('members/'+id).set({role,id,name:id,active:true,permissions:[],salesSupervisorId:role==='dataEntry'?'sales':null});
  }
  await db.doc('companies/company').set({name:'Local contract',enabled:true,archived:false,provider:'generic_v1',statusMap:{delivered:'delivered'}});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});
test('legacy password authentication remains enabled but cannot authorize Velnix; Google policy preserves roles',async()=>{
  for(const [role,id]of Object.entries(users)){
    const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:id+'@velnix.test',password:'LocalTestingOnly123!',returnSecureToken:true})});
    assert.equal(response.status,200);
    const session=await response.json();
    const verified=await getAuth().verifyIdToken(session.idToken);
    assert.equal(verified.uid,id);
    await assert.rejects(functions.me.run({auth:{uid:verified.uid,token:verified},data:{}}),{code:'permission-denied'});
    assert.equal((await invoke('me',verified.uid)).role,role);
  }
  const denied=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'entry@velnix.test',password:'WrongLocalPassword',returnSecureToken:true})});
  assert.equal(denied.status,400);
});
for(const [role,id]of Object.entries(users))test(role+' creates a real persisted order and sees it',async()=>{
  const result=await invoke('createOrder',id,{...payload,requestKey:'create_order_for_'+id});
  const doc=await db.doc('orders/'+result.id).get();
  assert.equal(doc.data().createdBy,id);assert.equal(doc.data().amountMinor,12345);
  assert.equal(doc.data().barcodeValue,'VNX-'+result.id);
  assert.match(doc.data().orderNumber,/^VNX-\d{6}$/);
  const searched=await invoke('searchOrders','gm',{query:doc.data().orderNumber});
  assert.ok(searched.items.some(item=>item.id===result.id));
  assert.equal(searched.items.find(item=>item.id===result.id).orderNumber,doc.data().orderNumber);
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
test('concurrent distinct orders receive unique sequence numbers',async()=>{
  const input=(n)=>({...payload,customer:`Concurrent order ${n}`,requestKey:`concurrent_numbers_${n}`});
  const results=await Promise.all([invoke('createOrder','entry',input(1)),invoke('createOrder','entry',input(2))]);
  const docs=await Promise.all(results.map(r=>db.doc('orders/'+r.id).get()));
  const numbers=docs.map(d=>d.data().orderNumber);
  assert.equal(new Set(numbers).size,2);
  for(const number of numbers)assert.match(number,/^VNX-\d{6}$/);
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
  await ref.update({dispatchState:'sending',dispatchLockId:'old-lock',dispatchLockUntil:Timestamp.fromMillis(Date.now()-1000)});
  await invoke('resolveDispatchException','gm',{id:orderId,outcome:'shipment_exists',trackingNumber:'TRACK-1',reason:'Vendor confirmed shipment'});
  const resolved=(await ref.get()).data();assert.equal(resolved.status,'dispatched');assert.equal(resolved.trackingNumber,'TRACK-1');assert.equal(resolved.dispatchLockId,undefined);
});
test('Arabic phone search and exact aggregates exceed 10000 records',async()=>{
  const batch=db.bulkWriter();
  for(let i=0;i<10005;i++)batch.set(db.doc('orders/load_'+i),{...payload,amountMinor:12345,phone:'0791234567',phoneDigits:'0791234567',customerKey:'عميل عربي',createdBy:'bulk',visibleTo:['bulk'],status:'created',hasDelivery:false,companyId:null,createdAt:Timestamp.now()});
  await batch.close();
  const search=await invoke('searchOrders','entry',{query:'٠٧٩١٢٣٤٥٦٧'});assert.ok(search.items.some(o=>o.id===orderId));
  const stats=await invoke('dashboardStats','gm');const count=stats.counters.all.created.count;
  assert.ok(count>=10005);assert.equal(stats.partial,false);
  assert.equal(count,stats.counters.internal.created.count+stats.counters.delivery.created.count);
});
test('settings are persisted by authorized administrators and forbidden for ordinary staff',async()=>{
  await assert.rejects(invoke('saveSettings','entry',{organizationName:'Unauthorized'}),{code:'permission-denied'});
  await invoke('saveSettings','gm',{organizationName:'المؤسسة المحلية',supportPhone:'0791234567',receiptFooter:'سند طلب'});
  const settings=await invoke('getSettings','entry');
  assert.equal(settings.organizationName,'المؤسسة المحلية');assert.equal(settings.receiptFooter,'سند طلب');
});
test('removed sales role cannot use historical team arrays for lists or aggregate counts',async()=>{
  await db.doc('members/sales').update({role:'manager',permissions:[]});
  const list=await invoke('listOrders','sales');
  assert.ok(list.items.every(item=>item.createdBy==='sales'));
  const stats=await invoke('dashboardStats','sales');
  const count=Object.values(stats.counters.all).reduce((n,item)=>n+item.count,0);
  assert.equal(count,1);
  await assert.rejects(invoke('getOrder','sales',{id:orderId}),{code:'permission-denied'});
  await db.doc('members/sales').update({role:'sales'});
});
test('historical orders transfer immediately with current employee membership without rewriting orders',async()=>{
  await getAuth().createUser({uid:'sales2',email:'sales2@velnix.test',password:'LocalTestingOnly123!'});
  await db.doc('members/sales2').set({name:'Sales 2',role:'sales',active:true,permissions:[]});
  const before=(await db.doc('orders/'+orderId).get()).data();
  await invoke('saveMember','gm',{id:'entry',name:'Transferred employee',role:'dataEntry',permissions:[],active:true,salesSupervisorId:'sales2'});
  await assert.rejects(invoke('getOrder','sales',{id:orderId}),{code:'permission-denied'});
  assert.equal((await invoke('getOrder','sales2',{id:orderId})).order.id,orderId);
  const after=(await db.doc('orders/'+orderId).get()).data();
  assert.equal(after.barcodeValue,before.barcodeValue);assert.equal(after.salesSupervisorId,before.salesSupervisorId);
  assert.ok((await db.doc('members/sales').get()).data().authorizationVersion>0);
  await invoke('saveMember','gm',{id:'entry',name:'Warehouse employee',role:'warehouse',permissions:[],active:true,salesSupervisorId:null});
  await assert.rejects(invoke('getOrder','sales2',{id:orderId}),{code:'permission-denied'});
  await invoke('saveMember','gm',{id:'entry',name:'Entry employee',role:'dataEntry',permissions:[],active:true,salesSupervisorId:'sales'});
});
test('team queries spanning more than 30 creators paginate without loss or duplication',async()=>{
  const batch=db.bulkWriter(),now=Date.now();
  for(let i=0;i<35;i++){
    batch.set(db.doc('members/team_'+i),{name:'Team '+i,role:'dataEntry',active:true,permissions:[],salesSupervisorId:'sales'});
    batch.set(db.doc('orders/team_order_'+i),{...payload,createdBy:'team_'+i,createdByName:'Team',status:'created',companyId:null,hasDelivery:false,amountMinor:1000,createdAt:Timestamp.fromMillis(now+i)});
  }
  await batch.close();
  let afterId=null;const ids=[];
  for(let page=0;page<10;page++){
    const result=await invoke('listOrders','sales',{pageSize:7,afterId});
    ids.push(...result.items.map(item=>item.id));afterId=result.nextAfterId;
    if(!afterId)break;
  }
  assert.equal(new Set(ids).size,ids.length);
  for(let i=0;i<35;i++)assert.ok(ids.includes('team_order_'+i));
  assert.equal(ids[0],'team_order_34');
  const stats=await invoke('dashboardStats','sales');
  assert.equal(Object.values(stats.counters.all).reduce((count,item)=>count+item.count,0),ids.length);
});
test('password employee creation is refused and delegated managers cannot escalate',async()=>{
  await assert.rejects(invoke('saveMember','gm',{name:'Disabled test',email:'disabled-test@velnix.test',password:'LocalTestingOnly123!',role:'dataEntry',active:false,permissions:[]}),{code:'failed-precondition'});
  await assert.rejects(getAuth().getUserByEmail('disabled-test@velnix.test'),{code:'auth/user-not-found'});
  await db.doc('members/manager').update({permissions:['manageEmployees']});
  await assert.rejects(invoke('saveMember','manager',{name:'Escalation',email:'escalation@velnix.test',password:'LocalTestingOnly123!',role:'generalManager',active:true,permissions:[]}),{code:'permission-denied'});
  await assert.rejects(invoke('saveMember','manager',{name:'Escalation',email:'warehouse-escalation@velnix.test',password:'LocalTestingOnly123!',role:'warehouse',active:true,permissions:[]}),{code:'permission-denied'});
  await assert.rejects(invoke('saveMember','manager',{name:'Escalation',email:'escalation@velnix.test',password:'LocalTestingOnly123!',role:'dataEntry',active:true,permissions:['manageCompanies']}),{code:'permission-denied'});
});
test('durable notices survive duplicate event delivery without resetting read state or leaking scope',async()=>{
  await db.doc('members/manager').update({permissions:[]});
  const snap=await db.collection('orders/'+orderId+'/events').limit(1).get();
  const data=snap.docs[0],event={data,params:{orderId,eventId:data.id}};
  await functions.orderEventNotice.run(event);
  let notices=await db.collection('notices').where('orderId','==',orderId).get();
  const recipients=notices.docs.map(d=>d.data().recipientId);
  assert.ok(recipients.includes('entry'));assert.ok(recipients.includes('sales'));assert.ok(recipients.includes('warehouse'));
  assert.equal(recipients.includes('manager'),false);
  await notices.docs[0].ref.update({read:true});
  await functions.orderEventNotice.run(event);
  const repeated=await db.collection('notices').where('orderId','==',orderId).get();
  assert.equal(repeated.size,notices.size);
  assert.equal((await notices.docs[0].ref.get()).data().read,true);
});
test('a sales employee cannot become their own supervisor during a role change',async()=>{
  await getAuth().createUser({uid:'self_supervisor',email:'self-supervisor@velnix.test',password:'LocalTestingOnly123!'});
  await db.doc('members/self_supervisor').set({name:'Sales',role:'sales',active:true,permissions:[]});
  await assert.rejects(invoke('saveMember','gm',{id:'self_supervisor',name:'Entry',role:'dataEntry',active:true,permissions:[],salesSupervisorId:'self_supervisor'}),{code:'invalid-argument'});
  assert.equal((await db.doc('members/self_supervisor').get()).data().role,'sales');
  assert.equal((await getAuth().getUser('self_supervisor')).displayName,undefined);
});

test('concurrent mutual administrator deactivation preserves an active administrator',async()=>{
  for(const id of ['gmA','gmB']){
    await getAuth().createUser({uid:id,email:id+'@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
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

test('authorized internal completion records provenance and protects assigned and locked shipments',async()=>{
  const created=await invoke('createOrder','warehouse',{...payload,requestKey:'internal_completion_journey'});
  for(const status of ['review','preparing','ready','delivered'])await invoke('changeOrderStatus','warehouse',{id:created.id,status});
  const doc=await db.doc('orders/'+created.id).get();assert.equal(doc.data().completionSource,'internal');assert.equal(doc.data().completedBy,'warehouse');assert.ok(doc.data().completedAt);
  const view=(await invoke('getOrder','warehouse',{id:created.id})).order;assert.equal(view.completionSource,'internal');assert.deepEqual(view.actions.statuses,[]);
  const events=await db.collection('orders/'+created.id+'/events').where('details.completionSource','==','internal').get();assert.equal(events.size,1);
  await assert.rejects(invoke('changeOrderStatus','gm',{id:created.id,status:'ready'}),{code:'failed-precondition'});
  for(const patch of [{companyId:'company'},{hasDelivery:true},{dispatchState:'sending'},{dispatchState:'sent'},{dispatchState:'needs_review'}]){
    const ref=db.collection('orders').doc();await ref.set({createdBy:'warehouse',status:'ready',amountMinor:1000,...patch});
    await assert.rejects(invoke('changeOrderStatus','gm',{id:ref.id,status:'delivered'}),{code:'failed-precondition'});
  }
});

test('directories paginate more than 100 records with stable name ties and scoped creator search',async()=>{
 const batch=db.batch();
 for(let i=0;i<137;i++){
  const number=String(i).padStart(3,'0');
  batch.set(db.doc('companies/directory_'+number),{name:'صفحة شركة '+number,enabled:false});
  batch.set(db.doc('members/directory_'+number),{name:'صفحة موظف '+number,role:'dataEntry',active:true,salesSupervisorId:i<120?'sales':'other_sales',permissions:[],email:number+'@example.test'});
 }
 await batch.commit();
 for(const [endpoint,query,total,actor]of [['listCompanies','صفحة شركة',137,'entry'],['listMembers','صفحة موظف',137,'gm'],['listOrderCreators','صفحة موظف',120,'sales']]){
  let afterId;const ids=[];let page;
  do{page=await invoke(endpoint,actor,{query,pageSize:23,afterId});ids.push(...page.items.map(x=>x.id));afterId=page.afterId;}while(page.more);
  assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
 }
 await assert.rejects(invoke('listMembers','entry',{pageSize:100}),{code:'permission-denied'});
 await assert.rejects(invoke('listCompanies','gm',{pageSize:101}),{code:'invalid-argument'});
 const a=db.doc('companies/directory_tie_a'),b=db.doc('companies/directory_tie_b');await a.set({name:'متساوي'});await b.set({name:'متساوي'});
 const first=await invoke('listCompanies','gm',{query:'متساوي',pageSize:1});const next=await invoke('listCompanies','gm',{query:'متساوي',pageSize:1,afterId:first.afterId});assert.notEqual(first.items[0].id,next.items[0].id);
});

test('audit pagination is stable, bounded and rejects an unknown cursor',async()=>{
  const batch=db.batch();
  for(let i=0;i<5;i++)batch.set(db.doc('auditEvents/audit_page_'+i),{action:'settings.updated',actorName:'اختبار',entityId:'system',createdAt:Timestamp.fromMillis(9999999999900+i)});
  await batch.commit();
  const seen=[];let afterId,more=true;
  for(let page=0;page<3&&more;page++){
    const result=await invoke('listAudit','gm',{pageSize:2,afterId});
    assert.equal(result.items.length<=2,true);
    seen.push(...result.items.map(item=>item.id));
    afterId=result.afterId;more=result.more;
  }
  for(let i=0;i<5;i++)assert.ok(seen.includes('audit_page_'+i));
  assert.equal(new Set(seen).size,seen.length);
  await assert.rejects(invoke('listAudit','gm',{afterId:'missing_cursor'}),{code:'invalid-argument'});
  await assert.rejects(invoke('listAudit','entry',{}),{code:'permission-denied'});
});

test('sync center reports a bounded view instead of silently truncating',async()=>{
  const created=await invoke('createOrder','gm',{...payload,requestKey:'sync_bounded_view_1'});
  const batch=db.batch();
  for(let i=0;i<31;i++)batch.set(db.doc('companies/000_sync_'+String(i).padStart(2,'0')),{name:'Sync '+i,enabled:false});
  for(let i=0;i<7;i++)batch.set(db.doc('deliveryInbox/000_sync_00/events/e'+i),{companyId:'000_sync_00',orderId:created.id,raw:'r'+i,source:'poll',receivedAt:Timestamp.fromMillis(1700000000000+i)});
  await batch.commit();
  const result=await invoke('listSyncEvents','gm');
  assert.equal(result.limited,true);
  assert.ok(result.items.some(item=>item.companyName==='Sync 0'));
  await assert.rejects(invoke('listSyncEvents','entry',{}),{code:'permission-denied'});
});

test('order event history paginates without loss or duplicates',async()=>{
  const created=await invoke('createOrder','gm',{...payload,requestKey:'order_event_pagination_1'});
  const batch=db.batch();
  for(let i=0;i<85;i++)batch.set(db.doc(`orders/${created.id}/events/bulk_${String(i).padStart(3,'0')}`),{action:'remote_status',actorId:'delivery:probe',actorName:'شركة',details:{i},createdAt:Timestamp.fromMillis(1700000000000+i)});
  await batch.commit();
  const first=await invoke('getOrder','gm',{id:created.id,eventsPageSize:80});
  assert.equal(first.events.length,80);
  assert.equal(first.eventsMore,true);
  assert.ok(first.eventsAfterId);
  const second=await invoke('getOrder','gm',{id:created.id,eventsPageSize:80,eventsAfterId:first.eventsAfterId});
  assert.ok(second.events.length>=6);
  assert.equal(second.eventsMore,false);
  const ids=[...first.events,...second.events].map(event=>event.id);
  assert.equal(new Set(ids).size,ids.length);
  await assert.rejects(invoke('getOrder','gm',{id:created.id,eventsAfterId:'missing_event'}),{code:'invalid-argument'});
  await assert.rejects(invoke('getOrder','gm',{id:created.id,eventsPageSize:101}),{code:'invalid-argument'});
});

test('webhook rejects an unknown company with 404 before signature checks',async()=>{
  let code,body;
  const response={status(value){code=value;return this;},send(value){body=value;return this;}};
  await functions.deliveryWebhook({method:'POST',query:{companyId:'missing_company_123'},rawBody:Buffer.from('{}'),headers:{},body:{}},response);
  assert.equal(code,404);
  assert.equal(body,'unknown_company');
});
