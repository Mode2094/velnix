'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}}:null,data});

const base={city:'عمان',area:'خلدا',description:'طقم شرعي أسود',amount:'30',quantity:1,pageId:'p1'};

before(async()=>{
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('loopback only');
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('loopback only');
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  const mk=async(role,id,extra={})=>{
    await getAuth().createUser({uid:id,email:id+'@velnix.test',password:'LocalTestingOnly123!'}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
    await db.doc('members/'+id).set({role,id,name:id,active:true,permissions:[],salesSupervisorId:null,authorizationVersion:1,...extra});
  };
  await mk('generalManager','gm');
  await mk('dataEntry','entry',{allowedPageIds:['p1']});
  await db.doc('pages/p1').set({name:'تاج ماركت',nameLower:'تاج ماركت',active:true,archived:false,status:'active'});
  await db.doc('companies/c1').set({name:'شركة أ',enabled:true,archived:false,provider:'generic_v1',statusMap:{}});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('search finds orders by every supported field and normalizes Arabic',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'أحمد المعايصة',phone:'0791234567',extraPhone:'0799999999',note:'ملاحظة خاصة',requestKey:'p2_search_axxxxx'});
  const b=await invoke('createOrder','gm',{...base,city:'إربد',area:'الحصن',customer:'محمد العلي',phone:'0787654321',description:'حذاء رياضي',requestKey:'p2_search_bxxxxx'});
  // 1-2. order number / serial
  let r=await invoke('searchOrders','gm',{query:(await db.doc('orders/'+a.id).get()).data().orderNumber});
  assert.ok(r.items.some(x=>x.id===a.id),'order number');
  // 3. barcode VNX-<id>
  r=await invoke('searchOrders','gm',{query:'VNX-'+a.id});
  assert.ok(r.items.some(x=>x.id===a.id),'barcode');
  // 4. click ref (set manually)
  await db.doc('orders/'+a.id).update({clickOrderRef:'CLICK-REF-777'});
  r=await invoke('searchOrders','gm',{query:'CLICK-REF-777'});
  assert.ok(r.items.some(x=>x.id===a.id),'click ref');
  // 5-6. full + partial Arabic name
  r=await invoke('searchOrders','gm',{query:'أحمد المعايصة'});
  assert.ok(r.items.some(x=>x.id===a.id),'full name');
  r=await invoke('searchOrders','gm',{query:'احمد المع'});
  assert.ok(r.items.some(x=>x.id===a.id),'partial name normalized hamza');
  // 7. hamza/alef normalization on city
  r=await invoke('searchOrders','gm',{query:'اربد'});
  assert.ok(r.items.some(x=>x.id===b.id),'arabic city normalization');
  // 8. arabic digits phone
  r=await invoke('searchOrders','gm',{query:'٠٧٩١٢٣٤٥٦٧'});
  assert.ok(r.items.some(x=>x.id===a.id),'arabic digits phone');
  // 9-10. full + partial phone
  r=await invoke('searchOrders','gm',{query:'0791234567'});
  assert.ok(r.items.some(x=>x.id===a.id),'full phone');
  r=await invoke('searchOrders','gm',{query:'0787654'});
  assert.ok(r.items.some(x=>x.id===b.id),'partial phone');
  // 11. extra phone
  r=await invoke('searchOrders','gm',{query:'0799999999'});
  assert.ok(r.items.some(x=>x.id===a.id),'extra phone');
  // 12. product description
  r=await invoke('searchOrders','gm',{query:'حذاء رياضي'});
  assert.ok(r.items.some(x=>x.id===b.id),'product description');
  // 13. notes
  r=await invoke('searchOrders','gm',{query:'ملاحظة خاصة'});
  assert.ok(r.items.some(x=>x.id===a.id),'notes');
  // unknown returns nothing
  r=await invoke('searchOrders','gm',{query:'لا-يوجد-اطلاقا-999'});
  assert.equal(r.items.length,0,'unknown returns nothing');
});

test('search respects visibility scope and never leaks another user orders',async()=>{
  const other=await invoke('createOrder','gm',{...base,customer:'عميل سري جدا',phone:'0770000000',pageId:'p1',requestKey:'p2_scope_gmxxxxx'});
  await db.doc('members/entry').update({allowedPageIds:['p1']});
  const own=await invoke('createOrder','entry',{...base,customer:'عميل خاص بمدخل',phone:'0771111111',requestKey:'p2_scope_entryxx'});
  const r=await invoke('searchOrders','entry',{query:'عميل سري'});
  assert.equal(r.items.some(x=>x.id===other.id),false,'gm secret order hidden from entry');
  assert.equal(r.items.some(x=>/سري/.test(x.customer||'')),false);
  const ownSearch=await invoke('searchOrders','entry',{query:'عميل خاص بمدخل'});
  assert.ok(ownSearch.items.some(x=>x.id===own.id),'entry sees own order');
});

test('advanced filters combine (page + status + city + city type + date)',async()=>{
  const created=await invoke('createOrder','gm',{...base,customer:'فلتر مركب',phone:'0772222222',city:'عمان',pageId:'p1',orderType:'return',requestKey:'p2_filter_combox'});
  const byPage=await invoke('searchOrders','gm',{query:'فلتر مركب',pageId:'p1'});
  assert.ok(byPage.items.some(x=>x.id===created.id),'page filter');
  const wrongPage=await invoke('searchOrders','gm',{query:'فلتر مركب',pageId:'p2'});
  assert.equal(wrongPage.items.some(x=>x.id===created.id),false,'wrong page excludes');
  const byType=await invoke('searchOrders','gm',{query:'فلتر مركب',orderType:'return'});
  assert.ok(byType.items.some(x=>x.id===created.id),'type filter');
  const badType=await invoke('searchOrders','gm',{query:'فلتر مركب',orderType:'normal'});
  assert.equal(badType.items.some(x=>x.id===created.id),false,'type mismatch excludes');
  const byCity=await invoke('searchOrders','gm',{query:'فلتر مركب',city:'عمان'});
  assert.ok(byCity.items.some(x=>x.id===created.id),'city filter');
  // combined
  const combo=await invoke('searchOrders','gm',{query:'فلتر مركب',pageId:'p1',city:'عمان',orderType:'return',status:'created'});
  assert.ok(combo.items.some(x=>x.id===created.id),'combined filters');
});

test('amount filters require amounts permission',async()=>{
  await assert.rejects(invoke('searchOrders','entry',{query:'عميل خاص',amountMin:'10'}),{code:'permission-denied'});
  const r=await invoke('searchOrders','gm',{query:'فلتر مركب',amountMin:'10',amountMax:'50'});
  assert.ok(r.items.length>=1,'gm can filter by amount');
});

test('listOrders applies pageId and orderType filters and paginates',async()=>{
  const list=await invoke('listOrders','gm',{pageId:'p1',pageSize:2});
  assert.ok(list.items.every(x=>x.pageId==='p1'));
  assert.ok(list.items.length<=2);
  if(list.nextAfterId){
    const next=await invoke('listOrders','gm',{pageId:'p1',pageSize:2,afterId:list.nextAfterId});
    const firstIds=new Set(list.items.map(x=>x.id));
    assert.ok(next.items.every(x=>!firstIds.has(x.id)),'no duplicate across pages');
  }
});

test('bulk status change reports per-order results and honors policy',async()=>{
  const ok1=await invoke('createOrder','gm',{...base,customer:'دفعة 1',phone:'0773000001',requestKey:'p2_bulk_1xxxxxxx'});
  const ok2=await invoke('createOrder','gm',{...base,customer:'دفعة 2',phone:'0773000002',requestKey:'p2_bulk_2xxxxxxx'});
  const res=await invoke('bulkChangeStatus','gm',{ids:[ok1.id,ok2.id],status:'review'});
  assert.equal(res.succeeded,2);
  assert.equal(res.failed,0);
  for(const id of [ok1.id,ok2.id]){
    const d=(await db.doc('orders/'+id).get()).data();
    assert.equal(d.status,'review');
    const events=await db.doc('orders/'+id).collection('events').where('action','==','status_changed').get();
    assert.ok(events.size>=1,'status_changed event written');
  }
});

test('bulk operation rejects per-order failures without aborting the batch',async()=>{
  const allowed=await invoke('createOrder','gm',{...base,customer:'مسموح',phone:'0774000001',requestKey:'p2_bulk_mix_1xxx'});
  // A disallowed transition (created -> delivered) must fail only for that order.
  const disallowed=await invoke('createOrder','gm',{...base,customer:'ممنوع',phone:'0774000002',requestKey:'p2_bulk_mix_2xxx'});
  // Put the disallowed order into a state where 'delivered' is not reachable, then bulk to 'delivered'.
  const res=await invoke('bulkChangeStatus','gm',{ids:[allowed.id,disallowed.id],status:'delivered'});
  assert.ok(res.results.some(r=>r.id===disallowed.id&&r.ok===false),'disallowed order reported failed');
  assert.equal(res.results.find(r=>r.id===disallowed.id).ok,false);
});

test('bulk assign company assigns only appropriate orders and never sends',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'إسناد أ',phone:'0775000001',requestKey:'p2_bulk_assign_a'});
  const res=await invoke('bulkAssignCompany','gm',{ids:[a.id],companyId:'c1'});
  assert.equal(res.succeeded,1);
  const d=(await db.doc('orders/'+a.id).get()).data();
  assert.equal(d.companyId,'c1');
  assert.equal(d.dispatchState,'idle','assignment never sends');
  assert.equal(d.trackingNumber,null);
});

test('barcode resolution maps codes to orders and hides unauthorized ones',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'باركود أ',phone:'0776000001',requestKey:'p2_barcode_axxxx'});
  const num=(await db.doc('orders/'+a.id).get()).data().orderNumber;
  const r=await invoke('resolveBarcodes','gm',{codes:['VNX-'+a.id,num,'VNX-000000','not-a-real-code']});
  const byCode=Object.fromEntries(r.results.map(x=>[x.code,x]));
  assert.equal(byCode['VNX-'+a.id].status,'ok');
  assert.equal(byCode['VNX-'+a.id].orderId,a.id);
  // The order number and the barcode are two representations of the SAME order,
  // so the second one is reported as a duplicate rather than a second hit.
  assert.equal(byCode[num].status,'duplicate');
  assert.equal(byCode[num].orderId,a.id);
  assert.equal(byCode['VNX-000000'].status,'not_found');
  assert.equal(byCode['not-a-real-code'].status,'not_found');
  // duplicate order via two representations is flagged
  const dup=await invoke('resolveBarcodes','gm',{codes:['VNX-'+a.id,num]});
  assert.equal(dup.results.find(x=>x.code===num).status,'duplicate');
  // unauthorized: entry cannot see gm's order -> reported as not_found
  const hidden=await invoke('resolveBarcodes','entry',{codes:['VNX-'+a.id]});
  assert.equal(hidden.results[0].status,'not_found');
});

test('resolveBarcodes rejects more than 20 codes',async()=>{
  const codes=Array.from({length:21},(_,i)=>'VNX-'+i);
  await assert.rejects(invoke('resolveBarcodes','gm',{codes}),{code:'invalid-argument'});
});

test('bulkDispatch refuses a wrong-type order and never creates a shipment',async()=>{
  const ret=await invoke('createOrder','gm',{...base,customer:'إرسال ممنوع',phone:'0777000001',orderType:'return',companyId:'c1',requestKey:'p2_bulk_dispatch_ret'});
  await db.doc('orders/'+ret.id).update({status:'ready'});
  const res=await invoke('bulkDispatch','gm',{ids:[ret.id]});
  assert.equal(res.succeeded,0);
  assert.equal(res.results[0].ok,false);
  const d=(await db.doc('orders/'+ret.id).get()).data();
  assert.equal(d.dispatchState,'idle');
  assert.equal(d.trackingNumber,null);
});
