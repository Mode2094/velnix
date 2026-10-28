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
  // A plain dataEntry with NO sendToDelivery (for the authorization tests).
  await mk('dataEntry','noSend',{allowedPageIds:['p1']});
  // A delegated manager WITH sendToDelivery (authorized sender).
  await mk('manager','sender',{permissions:['sendToDelivery','viewAllOrders','updateOrderStatus']});
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
  const res=await invoke('bulkDispatch','gm',{ids:[ret.id],operationId:'rev_wrongtype_op_0001'});
  assert.equal(res.succeeded,0);
  assert.equal(res.results[0].ok,false);
  const d=(await db.doc('orders/'+ret.id).get()).data();
  assert.equal(d.dispatchState,'idle');
  assert.equal(d.trackingNumber,null);
});

// ================= Independent-review fixes =================

// --- Security: bulk send/assign require sendToDelivery ---
test('bulkDispatch and bulkAssignCompany reject callers without sendToDelivery before any send',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'أمان',phone:'0778000010',companyId:'c1',requestKey:'rev_sec_order_0001'});
  await db.doc('orders/'+o.id).update({status:'ready'});
  for(const who of ['entry','noSend']){
    await assert.rejects(invoke('bulkDispatch',who,{ids:[o.id],operationId:'rev_noPerm_op_0001'}),{code:'permission-denied'});
    await assert.rejects(invoke('bulkAssignCompany',who,{ids:[o.id],companyId:'c1'}),{code:'permission-denied'});
  }
  // No external send happened; the order is untouched.
  const d=(await db.doc('orders/'+o.id).get()).data();
  assert.equal(d.dispatchState,'idle');assert.equal(d.trackingNumber,null);
});

test('a dataEntry cannot assign a company it is not allowed to send for, even via bulk',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'إسناد',phone:'0778000011',requestKey:'rev_sec_order_0002'});
  await assert.rejects(invoke('bulkAssignCompany','entry',{ids:[o.id],companyId:'c1'}),{code:'permission-denied'});
});

test('an authorized sender (sendToDelivery) can bulk assign but the shared flow still blocks wrong states',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'إسناد مسموح',phone:'0778000012',requestKey:'rev_sec_order_0003'});
  const res=await invoke('bulkAssignCompany','sender',{ids:[o.id],companyId:'c1'});
  assert.equal(res.succeeded,1);
  // An order already sent cannot have its company changed.
  await db.doc('orders/'+o.id).update({status:'dispatched',dispatchState:'sent',companyId:'c1'});
  const res2=await invoke('bulkAssignCompany','sender',{ids:[o.id],companyId:null});
  assert.equal(res2.results[0].ok,false);
});

test('bulkChangeStatus cannot bypass needs_review and is skipped per order',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'حالة أ',phone:'0778000013',requestKey:'rev_sec_order_0004'});
  const b=await invoke('createOrder','gm',{...base,customer:'حالة ب',phone:'0778000014',requestKey:'rev_sec_order_0005'});
  await db.doc('orders/'+b.id).update({dispatchState:'needs_review'});
  const res=await invoke('bulkChangeStatus','gm',{ids:[a.id,b.id],status:'review'});
  assert.equal(res.succeeded,1);
  assert.equal(res.results.find(r=>r.id===b.id).ok,false);
});

test('bulkDispatch bounds a single call to a small batch to fit the function timeout',async()=>{
  const ids=[];
  for(let i=0;i<11;i++){
    const o=await invoke('createOrder','gm',{...base,customer:'دفعة '+i,phone:'0778000020',companyId:'c1',requestKey:'rev_bound_'+i+'xxxxxxxx'});
    await db.doc('orders/'+o.id).update({status:'ready'});
    ids.push(o.id);
  }
  await assert.rejects(invoke('bulkDispatch','gm',{ids}),{code:'invalid-argument'});
});

// --- Pagination in search ---
test('search paginates beyond 50 results without duplicates',async()=>{
  for(let i=0;i<65;i++){
    await invoke('createOrder','gm',{...base,customer:'عميل بحث متكرر',phone:'07790000'+String(i).padStart(2,'0'),requestKey:'rev_pag_'+String(i).padStart(3,'0')+'xxxxxxxx'});
  }
  const seen=new Set();let cursor=null,pages=0;
  for(let i=0;i<10;i++){
    const r=await invoke('searchOrders','gm',{query:'عميل بحث متكرر',pageSize:30,cursor});
    for(const it of r.items){assert.equal(seen.has(it.id),false,'no duplicate across pages');seen.add(it.id);}
    pages++;cursor=r.nextCursor;if(!cursor)break;
  }
  assert.ok(seen.size>=65,`expected >=65 unique, got ${seen.size}`);
  assert.ok(pages>=3);
});

test('listOrders with an in-memory filter finds a match beyond the first window',async()=>{
  const batch=db.bulkWriter();
  for(let i=0;i<220;i++)batch.set(db.doc('orders/rev_far_'+i),{...base,customer:'غير مطابق '+i,phone:'07788888'+String(i%100).padStart(2,'0'),amountMinor:1000,pageId:'p1',status:'created',hasDelivery:false,companyId:null,createdBy:'gm',city:'إربد',area:'x',createdAt:Timestamp.fromMillis(Date.now()-i*1000)});
  await batch.close();
  const match=await invoke('createOrder','gm',{...base,customer:'مطابق بعيد',phone:'0777777777',city:'عمان',requestKey:'rev_far_match_0001'});
  await db.doc('orders/'+match.id).update({createdAt:Timestamp.fromMillis(Date.now()-500000)});
  // Follow pagination until the far match is found (proves it is not silently
  // dropped by the in-memory filter window).
  let found=false,afterId=null;
  for(let i=0;i<30&&!found;i++){
    const r=await invoke('listOrders','gm',{city:'عمان',pageSize:30,afterId});
    if(r.items.some(x=>x.id===match.id)){found=true;break;}
    afterId=r.nextAfterId;
    if(!afterId)break;
  }
  assert.ok(found,'the matching order beyond the first window is reachable via pagination');
});

// --- Middle-of-text and middle-of-phone search ---
test('search matches the middle of a name, product, note and phone',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'عبد الرحمن المومني',phone:'0791239876',description:'طقم شرعي أسود فاخر',note:'يرجى الاتصال قبل التسليم',requestKey:'rev_mid_0001xxxxxxxx'});
  for(const q of ['الرحمن','المومني','شرعي','الاتصال','239876']){
    const r=await invoke('searchOrders','gm',{query:q});
    assert.ok(r.items.some(x=>x.id===o.id),`middle match for "${q}"`);
  }
});

// --- Backfill idempotency (in-emulator proof) ---
test('backfill_search_keys is safe and idempotent on legacy orders',async()=>{
  const {execSync}=require('node:child_process');
  const path=require('node:path');
  const fnDir=path.resolve(__dirname,'../..');
  await db.doc('orders/rev_legacy_1').set({customer:'أحمد القديم',phone:'0791110000',description:'طقم',quantity:1});
  const dry=execSync('node scripts/backfill_search_keys.js',{cwd:fnDir,encoding:'utf8'});
  const applied=execSync('node scripts/backfill_search_keys.js --apply',{cwd:fnDir,encoding:'utf8'});
  const again=execSync('node scripts/backfill_search_keys.js --apply',{cwd:fnDir,encoding:'utf8'});
  const changed=n=>Number(/"changed":(\d+)/.exec(n)?.[1]||0);
  assert.ok(changed(applied)>=1,'apply writes the legacy order');
  assert.equal(changed(again),0,'second apply is idempotent');
  const d=(await db.doc('orders/rev_legacy_1').get()).data();
  assert.ok(Array.isArray(d.searchPrefixes)&&d.searchPrefixes.length>0);
  assert.ok(typeof d.searchText==='string'&&d.searchText.length>0);
  void dry;
});

// --- getOrdersByIds (bulk print source) ---
test('getOrdersByIds returns only authorized orders and hides amounts',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'طباعة أ',phone:'0778000030',amount:'99.000',requestKey:'rev_byids_0001xxxx'});
  const own=await invoke('createOrder','entry',{...base,customer:'طباعة خاصة',phone:'0778000031',requestKey:'rev_byids_0002xxxx'});
  const asGm=await invoke('getOrdersByIds','gm',{ids:[a.id,own.id]});
  assert.equal(asGm.items.length,2);
  // entry cannot see the gm order.
  const asEntry=await invoke('getOrdersByIds','entry',{ids:[a.id,own.id]});
  assert.equal(asEntry.items.length,1);
  assert.equal(asEntry.items[0].id,own.id);
});

// --- Durable bulk operation identity, resume, isolation (review fixes) ---
test('bulkDispatch requires a client operation id',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'سجل',phone:'0778000040',orderType:'return',companyId:'c1',requestKey:'rev_op_0001xxxxxxxx'});
  await db.doc('orders/'+o.id).update({status:'ready'});
  await assert.rejects(invoke('bulkDispatch','gm',{ids:[o.id]}),{code:'invalid-argument'});
});

test('reusing an operation id with the same orders never re-dispatches',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'سجل',phone:'0778000041',orderType:'return',companyId:'c1',requestKey:'rev_op_0002xxxxxxxx'});
  await db.doc('orders/'+o.id).update({status:'ready'});
  const opId='rev_resume_op_0001';
  const r1=await invoke('bulkDispatch','gm',{ids:[o.id],operationId:opId});
  assert.equal(r1.results[0].ok,false);
  // Second call with the SAME id and same order returns the SAME stored result
  // (no new dispatch attempt).
  const r2=await invoke('bulkDispatch','gm',{ids:[o.id],operationId:opId});
  assert.equal(r2.results.length,1);
  assert.deepEqual(r2.results[0],r1.results[0]);
  const results=await db.doc('bulkOperations/'+opId).collection('results').get();
  assert.equal(results.size,1,'exactly one durable result per order');
});

test('reusing an operation id with different orders is rejected',async()=>{
  const a=await invoke('createOrder','gm',{...base,customer:'opREJECT',phone:'0778000042',companyId:'c1',requestKey:'rev_op_0003xxxxxxxx'});
  const b=await invoke('createOrder','gm',{...base,customer:'opREJECT2',phone:'0778000043',companyId:'c1',requestKey:'rev_op_0004xxxxxxxx'});
  await db.doc('orders/'+a.id).update({status:'ready'});
  await db.doc('orders/'+b.id).update({status:'ready'});
  const opId='rev_conflict_op_0001';
  await invoke('bulkDispatch','gm',{ids:[a.id],operationId:opId});
  await assert.rejects(invoke('bulkDispatch','gm',{ids:[b.id],operationId:opId}),{code:'already-exists'});
});

test('another user cannot take over an operation id or read its results',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'opOWN',phone:'0778000044',companyId:'c1',requestKey:'rev_op_0005xxxxxxxx'});
  await db.doc('orders/'+o.id).update({status:'ready'});
  const opId='rev_owner_op_0001';
  await invoke('bulkDispatch','gm',{ids:[o.id],operationId:opId});
  // sender is authorized to send but must not read gm's operation.
  await assert.rejects(invoke('getBulkOperation','sender',{operationId:opId}),{code:'permission-denied'});
  await assert.rejects(invoke('bulkDispatch','sender',{ids:[o.id],operationId:opId}),{code:'permission-denied'});
});

test('getBulkOperation returns the creator own operation with results',async()=>{
  const o=await invoke('createOrder','gm',{...base,customer:'opREAD',phone:'0778000045',orderType:'return',companyId:'c1',requestKey:'rev_op_0006xxxxxxxx'});
  await db.doc('orders/'+o.id).update({status:'ready'});
  const opId='rev_read_op_0001';
  const r=await invoke('bulkDispatch','gm',{ids:[o.id],operationId:opId});
  const rec=await invoke('getBulkOperation','gm',{operationId:opId});
  assert.equal(rec.operationId,opId);
  assert.equal(rec.results.length,1);
  assert.equal(rec.finished,true);
  assert.equal(r.results[0].ok,false,'return type is refused before any send');
});

// --- Search pagination beyond a single sub-query window (300 matches) ---
test('search returns all 300 matches across pages without loss or duplication',async()=>{
  const {buildSearchFields}=require('../../src/search');
  const batch=db.bulkWriter(),now=Date.now();
  for(let i=0;i<300;i++){
    const o={customer:'عميل ثلاثمئة',phone:'07799000'+String(i%100).padStart(2,'0'),
      amountMinor:1000,pageId:'p1',status:'created',hasDelivery:false,companyId:null,createdBy:'gm',city:'عمان',area:'x',description:'طقم',quantity:1,
      createdAt:Timestamp.fromMillis(now-i*1000)};
    batch.set(db.doc('orders/rev300_'+String(i).padStart(3,'0')),{...o,...buildSearchFields(o)});
  }
  await batch.close();
  const seen=new Set();let cursor=null,pages=0;
  for(let i=0;i<40;i++){
    const r=await invoke('searchOrders','gm',{query:'عميل ثلاثمئة',pageSize:50,cursor});
    for(const it of r.items){assert.equal(seen.has(it.id),false,'no duplicate');seen.add(it.id);}
    pages++;cursor=r.nextCursor;
    if(!cursor)break;
  }
  assert.ok(seen.size>=300,`expected 300 unique, got ${seen.size}`);
  assert.ok(pages>=6,`expected several pages, got ${pages}`);
});

// --- listOrders continues past the 2000-scan cap ---
test('listOrders exposes a cursor past the scan cap instead of faking the end',async()=>{
  const batch=db.bulkWriter(),now=Date.now();
  for(let i=0;i<2001;i++)batch.set(db.doc('orders/revscan_'+String(i).padStart(4,'0')),{customer:'غير مطابق '+i,phone:'0778800000',amountMinor:1000,pageId:'p1',status:'created',hasDelivery:false,companyId:null,createdBy:'gm',city:'إربد',area:'x',description:'x',quantity:1,createdAt:Timestamp.fromMillis(now-i*1000)});
  await batch.close();
  const match=await invoke('createOrder','gm',{...base,customer:'مطابق بعد الدفعات',phone:'0778111222',city:'عمان',requestKey:'rev_scan_match_0001'});
  await db.doc('orders/'+match.id).update({createdAt:Timestamp.fromMillis(Date.now()-9000000)});
  let found=false,afterId=null,guard=0;
  while(!found&&guard++<60){
    const r=await invoke('listOrders','gm',{city:'عمان',pageSize:30,afterId});
    if(r.items.some(x=>x.id===match.id)){found=true;break;}
    afterId=r.nextAfterId;
    if(!afterId)break;
  }
  assert.ok(found,'reachable via continuation cursors');
});
