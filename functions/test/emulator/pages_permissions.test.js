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

const orderBase={customer:'عميل اختبار',phone:'0791234567',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amount:'12.345'};

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
  await mk('dataEntry','entry',{allowedPageIds:['page_a']});
  await mk('dataEntry','entry2',{allowedPageIds:[]});
  // A manager who may administer pages but is NOT the general manager.
  await mk('manager','pageadmin',{permissions:['managePages'],allowedPageIds:[]});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('general manager creates, edits, disables, archives and restores a page',async()=>{
  const saved=await invoke('savePage','gm',{name:'تاج Market',facebookUrl:'https://facebook.com/tajmarket',phone:'0791111111',whatsapp:'0791111111',note:'صفحة رئيسية'});
  assert.ok(saved.id);
  const listed=(await invoke('listPages','gm',{})).items.find(p=>p.id===saved.id);
  assert.equal(listed.name,'تاج Market');
  assert.equal(listed.status,'active');
  assert.equal(listed.active,true);

  await invoke('savePage','gm',{id:saved.id,name:'تاج ماركت',active:true});
  assert.equal((await db.doc('pages/'+saved.id).get()).data().name,'تاج ماركت');

  await invoke('savePage','gm',{id:saved.id,name:'تاج ماركت',active:false});
  assert.equal((await db.doc('pages/'+saved.id).get()).data().status,'disabled');

  await invoke('archivePage','gm',{id:saved.id});
  let d=(await db.doc('pages/'+saved.id).get()).data();
  assert.equal(d.archived,true);assert.equal(d.active,false);

  await invoke('restorePage','gm',{id:saved.id});
  d=(await db.doc('pages/'+saved.id).get()).data();
  assert.equal(d.archived,false);assert.equal(d.active,true);
});

test('duplicate page names are refused and page administration needs the permission',async()=>{
  await invoke('savePage','gm',{name:'عروض الأردن'});
  await assert.rejects(invoke('savePage','gm',{name:'عروض الأردن'}),{code:'already-exists'});
  await db.doc('members/entry').update({permissions:[]});
  await assert.rejects(invoke('savePage','entry',{name:'صفحة غير مصرح'}),{code:'permission-denied'});
  await assert.rejects(invoke('archivePage','entry',{id:'page_a'}),{code:'permission-denied'});
  // The administration views are also gated server-side, not only in the UI.
  await assert.rejects(invoke('listPages','entry',{}),{code:'permission-denied'});
  await assert.rejects(invoke('pageStats','entry',{ids:['page_a']}),{code:'permission-denied'});
});

test('page logo uploads are validated (size and type)',async()=>{
  const ok='data:image/png;base64,'+Buffer.from('x'.repeat(64)).toString('base64');
  const saved=await invoke('savePage','gm',{name:'صفحة شعار',logoDataUri:ok});
  assert.equal((await db.doc('pages/'+saved.id).get()).data().logoDataUri,ok);
  await assert.rejects(invoke('savePage','gm',{name:'صفحة شعار2',logoDataUri:'data:text/plain;base64,AAAA'}),{code:'invalid-argument'});
  await assert.rejects(invoke('savePage','gm',{name:'صفحة شعار3',logoDataUri:'data:image/png;base64,'+Buffer.alloc(70000,1).toString('base64')}),{code:'invalid-argument'});
});

test('an employee may only create orders for pages allowed on their membership',async()=>{
  await db.doc('pages/page_a').set({name:'صفحة أ',nameLower:'صفحة أ',active:true,archived:false,status:'active'});
  await db.doc('pages/page_b').set({name:'صفحة ب',nameLower:'صفحة ب',active:true,archived:false,status:'active'});
  const ok=await invoke('createOrder','entry',{...orderBase,pageId:'page_a',requestKey:'page_a_allowed_order'});
  const doc=(await db.doc('orders/'+ok.id).get()).data();
  assert.equal(doc.pageId,'page_a');assert.equal(doc.pageName,'صفحة أ');
  await assert.rejects(invoke('createOrder','entry',{...orderBase,pageId:'page_b',requestKey:'page_b_denied_order'}),{code:'permission-denied'});
});

test('an order requires a page; archived/disabled/free-text-page ids are refused',async()=>{
  await assert.rejects(invoke('createOrder','gm',{...orderBase,requestKey:'missing_page_order'}),{code:'invalid-argument'});
  await db.doc('pages/page_arch').set({name:'مؤرشفة',nameLower:'مؤرشفة',active:false,archived:true,status:'archived'});
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'page_arch',requestKey:'archived_page_order'}),{code:'failed-precondition'});
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'does_not_exist',requestKey:'ghost_page_order'}),{code:'failed-precondition'});
});

test('GM sees every page; an employee without allowed pages gets none and cannot create',async()=>{
  await db.doc('pages/page_c').set({name:'صفحة ج',nameLower:'صفحة ج',active:true,archived:false,status:'active'});
  const gmPages=await invoke('listAllowedPages','gm');
  assert.ok(gmPages.items.length>=3);
  const entry2=await invoke('listAllowedPages','entry2');
  assert.equal(entry2.items.length,0);
  await assert.rejects(invoke('createOrder','entry2',{...orderBase,pageId:'page_a',requestKey:'entry2_no_page_order'}),{code:'permission-denied'});
});

test('revoking a page takes effect server-side without cache, and order snapshots survive renames',async()=>{
  const created=await invoke('createOrder','entry',{...orderBase,pageId:'page_a',requestKey:'snapshot_survives_rename'});
  await db.doc('pages/page_a').update({name:'صفحة أ (محدثة)',nameLower:'صفحة أ (محدثة)'});
  const got=(await invoke('getOrder','gm',{id:created.id})).order;
  // Snapshot keeps the historical name at creation time; pageId stays stable.
  assert.equal(got.pageId,'page_a');
  assert.equal(got.pageName,'صفحة أ');
  // Revoke page_a from entry; a fresh createOrder must now be refused.
  await db.doc('members/entry').update({allowedPageIds:[],authorizationVersion:5});
  await assert.rejects(invoke('createOrder','entry',{...orderBase,pageId:'page_a',requestKey:'after_revoke_order'}),{code:'permission-denied'});
});

test('order types are stored and validated; unsupported values are refused',async()=>{
  const ret=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',orderType:'return',requestKey:'order_type_return'});
  assert.equal((await db.doc('orders/'+ret.id).get()).data().orderType,'return');
  const normal=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',requestKey:'order_type_default'});
  assert.equal((await db.doc('orders/'+normal.id).get()).data().orderType,'normal');
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'page_a',orderType:'invented',requestKey:'order_type_invalid'}),{code:'invalid-argument'});
});

test('optional address and default quantity do not block Click-compatible creation',async()=>{
  const noAddress=await invoke('createOrder','gm',{customer:'بلا عنوان',phone:'0791234567',city:'عمان',area:'وسط',description:'طرد',amount:'5.000',pageId:'page_a',requestKey:'optional_address_order'});
  const doc=(await db.doc('orders/'+noAddress.id).get()).data();
  assert.equal(doc.address,'');assert.equal(doc.quantity,1);
});

test('a delivery company can be chosen at creation without sending the shipment',async()=>{
  await db.doc('companies/comp_x').set({name:'شركة اختبار',enabled:true,archived:false,provider:'generic_v1',statusMap:{}});
  const created=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',companyId:'comp_x',requestKey:'company_at_creation'});
  const doc=(await db.doc('orders/'+created.id).get()).data();
  assert.equal(doc.companyId,'comp_x');assert.equal(doc.hasDelivery,true);
  assert.equal(doc.status,'created');
  assert.equal(doc.dispatchState,'idle');
  assert.equal(doc.trackingNumber,null);
});

test('member updates store allowed pages and validate unknown page ids',async()=>{
  await invoke('saveMember','gm',{id:'entry',name:'entry',role:'dataEntry',permissions:[],active:true,allowedPageIds:['page_a','page_c']});
  const m=(await db.doc('members/entry').get()).data();
  assert.deepEqual([...m.allowedPageIds].sort(),['page_a','page_c']);
  await assert.rejects(invoke('saveMember','gm',{id:'entry',name:'entry',role:'dataEntry',permissions:[],active:true,allowedPageIds:['ghost']}),{code:'invalid-argument'});
});

test('pageStats counts orders per page without scanning client lists',async()=>{
  const stats=await invoke('pageStats','gm',{ids:['page_a','page_b']});
  assert.ok(stats.counts.page_a>=6);
  assert.equal(typeof stats.counts.page_b,'number');
});

test('non-normal order types are stored but blocked from a misleading Click send',async()=>{
  await db.doc('companies/click_ph').set({name:'Click placeholder',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',enabled:true,archived:false,statusMap:{},clickUserId:'1603',clickSendEnabled:false});
  const ret=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',orderType:'return',companyId:'click_ph',requestKey:'return_type_click_block'});
  // Move it to ready so the dispatch path is reachable.
  await db.doc('orders/'+ret.id).update({status:'ready'});
  await assert.rejects(invoke('sendOrderToDelivery','gm',{id:ret.id}),{code:'failed-precondition'});
  const doc=(await db.doc('orders/'+ret.id).get()).data();
  assert.equal(doc.dispatchState,'idle');
  assert.equal(doc.trackingNumber,null);
});

// ---- Finding 1: managePages does NOT bypass allowedPageIds for staff ----
test('a page administrator without the page on their list cannot create an order for it',async()=>{
  await db.doc('pages/page_a').set({name:'صفحة أ',nameLower:'صفحة أ',active:true,archived:false,status:'active'});
  // pageadmin holds managePages but has no allowedPageIds.
  await assert.rejects(
    invoke('createOrder','pageadmin',{...orderBase,pageId:'page_a',requestKey:'pageadmin_denied_order'}),
    {code:'permission-denied'});
  // After granting the page on the membership, the same user succeeds.
  await db.doc('members/pageadmin').update({allowedPageIds:['page_a'],authorizationVersion:2});
  const ok=await invoke('createOrder','pageadmin',{...orderBase,pageId:'page_a',requestKey:'pageadmin_granted_order'});
  assert.ok(ok.id);
});

// ---- Finding 2: administration reads are gated; allowed list is scoped ----
test('page administration reads require managePages, allowed list stays scoped',async()=>{
  await db.doc('members/entry').update({allowedPageIds:['page_a'],authorizationVersion:9});
  await db.doc('pages/page_a').set({name:'صفحة أ',nameLower:'صفحة أ',active:true,archived:false,status:'active'});
  await db.doc('pages/page_b').set({name:'صفحة ب',nameLower:'صفحة ب',active:true,archived:false,status:'active'});
  // Entry holds no managePages: denied the admin list and stats.
  await assert.rejects(invoke('listPages','entry',{}),{code:'permission-denied'});
  await assert.rejects(invoke('pageStats','entry',{ids:['page_a']}),{code:'permission-denied'});
  // The pageadmin (managePages) may read them.
  assert.ok((await invoke('listPages','pageadmin',{})).items.length>=1);
  assert.ok((await invoke('pageStats','pageadmin',{ids:['page_a']})).counts);
  // The allowed list for entry exposes only its allowed pages, never page_b.
  const allowed=await invoke('listAllowedPages','entry',{});
  assert.ok(allowed.items.every(p=>p.id==='page_a'));
  assert.equal(allowed.allPages,undefined);
});

// ---- Finding 3: default delivery company setting ----
test('default delivery company is validated and surfaced by getSettings',async()=>{
  await db.doc('companies/comp_default').set({name:'شركة افتراضية',enabled:true,archived:false,provider:'generic_v1',statusMap:{}});
  await assert.rejects(invoke('saveSettings','gm',{organizationName:'V',defaultCompanyId:'missing'}),{code:'failed-precondition'});
  await db.doc('companies/comp_off').set({name:'معطلة',enabled:false,archived:false,provider:'generic_v1',statusMap:{}});
  await assert.rejects(invoke('saveSettings','gm',{organizationName:'V',defaultCompanyId:'comp_off'}),{code:'failed-precondition'});
  await invoke('saveSettings','gm',{organizationName:'مؤسسة',defaultCompanyId:'comp_default'});
  assert.equal((await invoke('getSettings','gm')).defaultCompanyId,'comp_default');
  // A disabled/archived company can never be set as the default.
  await db.doc('companies/comp_default').update({enabled:false});
  await assert.rejects(invoke('saveSettings','gm',{organizationName:'مؤسسة 2',defaultCompanyId:'comp_default'}),{code:'failed-precondition'});
  // Clearing the default is always allowed.
  await invoke('saveSettings','gm',{organizationName:'مؤسسة 3',defaultCompanyId:null});
  assert.equal((await invoke('getSettings','gm')).defaultCompanyId,null);
});

// ---- Finding 6: idempotency covers page/company/type ----
test('reusing a request key with a different page, company or type is a conflict',async()=>{
  await db.doc('pages/page_a').set({name:'صفحة أ',nameLower:'صفحة أ',active:true,archived:false,status:'active'});
  await db.doc('pages/page_b').set({name:'صفحة ب',nameLower:'صفحة ب',active:true,archived:false,status:'active'});
  await db.doc('companies/comp_x').set({name:'شركة',enabled:true,archived:false,provider:'generic_v1',statusMap:{}});
  const key='idem_conflict_key_0001';
  const first=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',requestKey:key});
  // Same key + identical data returns the same order.
  const same=await invoke('createOrder','gm',{...orderBase,pageId:'page_a',requestKey:key});
  assert.equal(same.id,first.id);assert.equal(same.alreadyExists,true);
  // Different page -> conflict.
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'page_b',requestKey:key}),{code:'already-exists'});
  // Different company -> conflict.
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'page_a',companyId:'comp_x',requestKey:key}),{code:'already-exists'});
  // Different order type -> conflict.
  await assert.rejects(invoke('createOrder','gm',{...orderBase,pageId:'page_a',orderType:'return',requestKey:key}),{code:'already-exists'});
});
