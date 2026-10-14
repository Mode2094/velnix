'use strict';
const crypto=require('node:crypto');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {deviceId,deliverNotice}=require('./push');
const admin=require('firebase-admin');
const {AggregateField}=require('firebase-admin/firestore');
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {logger}=require('firebase-functions');
const {can,canSeeOrder,canEditOrder,allowedTransition,validRole,validPermissions,validateOrderFields,safeStatusMap,dispatchBlocked,canResolveDispatch,documentId}=require('./policy');
const {allowedUrl,encryptSecret,decryptSecret,vendorRequest,verifyWebhook,remoteCanAdvance}=require('./delivery');
const {orderForUser}=require('./order_view');
const {providerFor}=require('./providers');
const {normalizeCustomer,searchDigits,parseFilters,applyFilters,matchingFilters}=require('./query');
admin.initializeApp();const db=admin.firestore();
const {FieldValue,Timestamp}=admin.firestore;
const REGION='europe-west1';
const callable=(fn)=>onCall({region:REGION, enforceAppCheck: true, maxInstances:15, timeoutSeconds:60},fn);
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const str=(v,max=120)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail('invalid-argument','قيمة غير صالحة');
const idValue=v=>{try{return documentId(v);}catch(e){return firebaseError(e);}};
const optional=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const requiredPerm=(user,perm)=>{if(!can(user,perm))fail('permission-denied','الصلاحية غير متاحة');};
const requireAuth=async req=>{
  const uid=req.auth?.uid;
  if(!uid)fail('unauthenticated','يرجى تسجيل الدخول');
  const snap=await db.doc(`members/${uid}`).get();
  if(!snap.exists || snap.data().active!==true || !validRole(snap.data().role))fail('permission-denied','الحساب غير مفعل');
  return {...snap.data(),id:uid};
};
async function currentActor(tx,user){
  const snap=await tx.get(db.doc('members/'+user.id));
  if(!snap.exists||snap.data().active!==true||snap.data().role!==user.role||JSON.stringify(snap.data().permissions||[])!==JSON.stringify(user.permissions||[])||(snap.data().salesSupervisorId||null)!==(user.salesSupervisorId||null))fail('permission-denied','تغيرت صلاحيات الحساب؛ أعد تحميل الجلسة');
}
const safeDate=v=>v?.toDate?.()?.toISOString?.() ?? null;
async function audit(action,actor,entityId,extra={},tx=null) {
  const ref=db.collection('auditEvents').doc();
  const entry={action,actorId:actor.id,actorName:actor.name||'',entityId,extra,createdAt:FieldValue.serverTimestamp()};
  if(tx)tx.set(ref,entry);else await ref.set(entry);
}
async function addEvent(orderId,action,actor,details={},tx=null) {
  const ref=db.collection('orders').doc(orderId).collection('events').doc();
  const entry={action,actorId:actor.id,actorName:actor.name||'',details,createdAt:FieldValue.serverTimestamp()};
  if(tx)tx.set(ref,entry);else await ref.set(entry);
}
async function notifyRecipients(recipientIds,title,body,orderId){
  const batch=db.batch();
  const order=orderId?(await db.doc('orders/'+orderId).get()).data():null;
  for(const id of new Set(recipientIds.filter(Boolean)).values()){
    const member=await db.doc('members/'+id).get();
    if(!member.exists||member.data().active!==true||(order&&!canSeeOrder({...member.data(),id},order)))continue;
    const ref=db.collection('notices').doc();
    batch.set(ref,{recipientId:id,title,body,orderId,read:false,createdAt:FieldValue.serverTimestamp()});
  }
  await batch.commit();
}
async function notifyTeamNewOrder(order,user){
  try {
    const team=await db.collection('members').where('role','in',['generalManager','manager','warehouse']).get();
    await notifyRecipients([...team.docs.filter(d=>d.data().active!==false).map(d=>d.id), user.salesSupervisorId],
      'طلب جديد','تم إدخال طلب جديد من '+user.name,order.id);
  }catch(e){logger.warn('notice failed',{code:e.code||'unknown'});}
}
function orderQueryable(user) {
  if(user.role==='generalManager'||user.role==='warehouse'||can(user,'viewAllOrders')) return db.collection('orders');
  return db.collection('orders').where('visibleTo','array-contains',user.id);
}
async function oneOrder(user,id) {
  const ref=db.collection('orders').doc(idValue(id));const snap=await ref.get();
  if(!snap.exists)fail('not-found','الطلب غير موجود');
  if(!canSeeOrder(user,{...snap.data(),id:snap.id}))fail('permission-denied','لا يمكن الوصول للطلب');
  return {ref,snap};
}
function firebaseError(e){
  if(e instanceof HttpsError)throw e;
  logger.error('velnix.error',{code:e?.code||'unknown'});
  if(String(e.message).startsWith('invalid_'))fail('invalid-argument','بيانات غير صالحة: '+e.message);
  fail('internal','تعذر إتمام العملية');
}

exports.me=callable(async req=>{const user=await requireAuth(req);return {id:user.id,name:user.name,role:user.role,active:user.active,permissions:user.permissions||[],salesSupervisorId:user.salesSupervisorId||null,email:user.email||''};});
exports.listOrders=callable(async req=>{
  const user=await requireAuth(req);
  const size=Math.max(1,Math.min(50,Math.floor(Number(req.data?.pageSize)||30)));
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const sort=req.data?.sort||'desc';if(!['asc','desc'].includes(sort))fail('invalid-argument','ترتيب غير صالح');
  let query=applyFilters(orderQueryable(user),filters).orderBy('createdAt',sort).limit(size);
  if(req.data?.afterId) {
    const previous=await oneOrder(user,req.data.afterId);
    query=query.startAfter(previous.snap);
  }
  const result=await query.get();const items=result.docs.filter(d=>canSeeOrder(user,d.data())).map(d=>orderForUser(user,d));
  return {items,nextAfterId:result.size===size?result.docs.at(-1).id:null};
});
// Authenticated server-side search; never scan only the client's loaded page.
// Indexed exact phone / Arabic-normalized name prefix / exact document ID.
// Results are capped at 50 and MUST still pass canSeeOrder.
exports.searchOrders=callable(async req=>{
  const user=await requireAuth(req);
  const query=str(req.data?.query,120),needle=normalizeCustomer(query),digits=searchDigits(query);
  if(query.length<2)fail('invalid-argument','اكتب حرفين على الأقل للبحث');
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const matches=new Map();
  const accept=(doc)=>{
    if(!doc.exists||!canSeeOrder(user,{...doc.data(),id:doc.id})||!matchingFilters(doc.data(),filters))return;
    matches.set(doc.id,doc);
  };
  // A printed VNX- barcode resolves to the immutable Firestore document ID.
  const documentId=query.startsWith('VNX-')?query.slice(4):query;
  if(/^[a-zA-Z0-9_-]{8,140}$/.test(documentId))accept(await db.doc(`orders/${documentId}`).get());
  const scoped=applyFilters(orderQueryable(user),filters);
  const searches=[];
  if(digits.length>=7)searches.push(scoped.where('phoneDigits','==',digits).limit(50).get());
  searches.push(scoped.where('customerKey','>=',needle).where('customerKey','<=',needle+'\uf8ff')
    .orderBy('customerKey').limit(50).get());
  const results=await Promise.all(searches);
  for(const snap of results)for(const doc of snap.docs)accept(doc);
  const items=[...matches.values()].slice(0,50).map(doc=>orderForUser(user,doc));
  return {items,limited:results.some(r=>r.size===50)||matches.size>50};
});
// Exact index-backed counts: no silent 1,000-order truncation.
// Firestore aggregation pricing depends on scanned index entries.
async function sumOrders(query,showAmount){
  const aggregation=query.aggregate({count:AggregateField.count(),
    ...(showAmount?{amountMinor:AggregateField.sum('amountMinor')}:{}),
  });
  const result=(await aggregation.get()).data();
  return {count:result.count||0,amountMinor:showAmount?(result.amountMinor||0):0};
}
exports.dashboardStats=callable(async req=>{
  const user=await requireAuth(req);
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const base=applyFilters(orderQueryable(user),{...filters,status:null,bucket:'all'});
  const statuses=require('./policy').STATUSES;
  const showAmount=user.role==='generalManager'||can(user,'viewAmounts');
  const counter={all:{},delivery:{},internal:{}};
  // Use independent aggregations by state and bucket; avoid scanning client lists.
  const values=await Promise.all(statuses.flatMap(status=>[
    sumOrders(base.where('status','==',status).where('hasDelivery','==',true),showAmount),
    sumOrders(base.where('status','==',status).where('hasDelivery','==',false),showAmount),
  ]));
  for(let i=0;i<statuses.length;i++){
    const status=statuses[i],delivery=values[i*2],internal=values[i*2+1];
    counter.delivery[status]=delivery;counter.internal[status]=internal;
    counter.all[status]={count:delivery.count+internal.count,amountMinor:delivery.amountMinor+internal.amountMinor};
  }
  return {counters:counter,partial:false,amountsVisible:showAmount};
});
exports.companyStats=callable(async req=>{
  const user=await requireAuth(req),companyId=idValue(req.data?.id);
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const company=await db.doc(`companies/${companyId}`).get();
  if(!company.exists)fail('not-found','الشركة غير موجودة');
  const statuses=require('./policy').STATUSES;
  const showAmount=user.role==='generalManager'||can(user,'viewAmounts');
  const values=await Promise.all(statuses.map(status=>sumOrders(
    applyFilters(orderQueryable(user),{...filters,status:null,companyId:null,bucket:'all'}).where('companyId','==',companyId).where('status','==',status),showAmount)));
  const counts={};statuses.forEach((status,i)=>counts[status]=values[i]);
  return {counts,partial:false};
});
exports.getOrder=callable(async req=>{
  const user=await requireAuth(req), {snap}=await oneOrder(user,req.data?.id);
  const events=await snap.ref.collection('events').orderBy('createdAt','desc').limit(80).get();
  return {order:orderForUser(user,snap),events:events.docs.map(d=>({id:d.id,...d.data(),createdAt:safeDate(d.data().createdAt)}))};
});
exports.createOrder=callable(async req=>{
  const user=await requireAuth(req);if(!user.active)fail('permission-denied','الحساب معطل');
  let fields;try{fields=validateOrderFields(req.data||{});}catch(e){return firebaseError(e);}
  fields.phoneDigits=fields.phone.replace(/\D/g,'');
  fields.customerKey=normalizeCustomer(fields.customer);
  const visibleTo=[user.id];
  if(user.role==='dataEntry' && user.salesSupervisorId)visibleTo.push(user.salesSupervisorId);
  // Idempotency key stays unchanged for repeat submissions of the same form.
  // A request retry after an uncertain network response must return the
  // existing order, never create a duplicate shipment/order.
  const requestKey=str(req.data?.requestKey,80);
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey))fail('invalid-argument','مفتاح إنشاء الطلب غير صالح');
  const uniqueId=crypto.createHash('sha256').update(`${user.id}:${requestKey}`).digest('hex');
  const idemRef=db.doc(`idempotency/${uniqueId}`);
  const payloadHash=crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const ref=db.collection('orders').doc();
  let resolvedId=ref.id, created=false;
  await db.runTransaction(async tx=>{
    created=false; // Firestore can retry transaction callbacks.
    await currentActor(tx,user);
    const previous=await tx.get(idemRef);
    if(previous.exists){
      if(previous.data().payloadHash!==payloadHash)fail('already-exists','تم استخدام مفتاح هذا الطلب لبيانات أخرى');
      resolvedId=previous.data().orderId;
      return;
    }
    tx.create(ref,{...fields,barcodeValue:`VNX-${ref.id}`,createdBy:user.id,createdByName:user.name,createdByRole:user.role,
      salesSupervisorId:user.role==='dataEntry'?user.salesSupervisorId||null:null,visibleTo,
      companyId:null,hasDelivery:false,revision:0,status:'created',trackingNumber:null,remoteStatus:null,
      dispatchState:'idle',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    tx.create(idemRef,{orderId:ref.id,payloadHash,createdBy:user.id,createdAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'created',user,{},tx);await audit('order.created',user,ref.id,{},tx);
    created=true;
  });
  if(created)await notifyTeamNewOrder({id:ref.id},user);
  return {id:resolvedId,alreadyExists:!created};
});
exports.updateOrder=callable(async req=>{
  const user=await requireAuth(req);const {ref,snap}=await oneOrder(user,req.data?.id);
  if(!canEditOrder(user,snap.data()))fail('permission-denied','لا يسمح بتعديل الطلب بهذه الحالة');
  let fields;
  try {
    const old=snap.data();
    const financialAccess=user.role==='generalManager'||can(user,'viewAmounts')||old.createdBy===user.id;
    const payload={...req.data,amount:financialAccess?(req.data?.amount??old.amountMinor/1000):old.amountMinor/1000};
    fields=validateOrderFields(payload);
  }catch(e){return firebaseError(e);}
  fields.phoneDigits=fields.phone.replace(/\D/g,'');
  fields.customerKey=normalizeCustomer(fields.customer);
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);if(!latest.exists)fail('not-found','الطلب غير موجود');
    if(!Number.isSafeInteger(req.data?.revision)||req.data.revision!==(latest.data().revision||0))fail('aborted','تم تعديل الطلب بواسطة مستخدم آخر؛ أعد تحميله');
    if(!canEditOrder(user,latest.data()))fail('failed-precondition','تغيّرت حالة الطلب');
    if(user.role!=='generalManager'&&!can(user,'viewAmounts')&&latest.data().createdBy!==user.id)fields.amountMinor=latest.data().amountMinor;
    tx.update(ref,{...fields,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'edited',user,{},tx);await audit('order.edited',user,ref.id,{},tx);
  });return {ok:true};
});
exports.changeOrderStatus=callable(async req=>{
  const user=await requireAuth(req);const {ref}=await oneOrder(user,req.data?.id);
  const target=str(req.data?.status,30);
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);
    if(!latest.exists)fail('not-found','الطلب غير موجود');
    if(!allowedTransition(user,{...latest.data(),id:ref.id},target))fail('failed-precondition','هذا الانتقال غير مسموح');
    tx.update(ref,{status:target,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'status_changed',user,{status:target},tx);await audit('order.status_changed',user,ref.id,{status:target},tx);
  });
  const fresh=await ref.get();await notifyRecipients([fresh.data().createdBy,fresh.data().salesSupervisorId],
    'تغيير حالة الطلب',`تم تحديث الطلب ${ref.id} إلى ${target}`,ref.id).catch(e=>logger.warn('notice failed',{code:e.code||'unknown'}));
  return {ok:true};
});
exports.assignCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');const {ref}=await oneOrder(user,req.data?.id);
  const id=req.data?.companyId == null?null:idValue(req.data.companyId);
  if(id){const company=await db.collection('companies').doc(id).get();if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','شركة التوصيل غير مفعلة');}
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const order=await tx.get(ref);
    if(id){const company=await tx.get(db.doc('companies/'+id));if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','الشركة غير مفعلة');}
    if(!['created','review','preparing','ready'].includes(order.data().status) || dispatchBlocked(order.data()))fail('failed-precondition','لا يمكن تعديل شركة طلب مرسل');
    tx.update(ref,{revision:FieldValue.increment(1),companyId:id,hasDelivery:id!=null,updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'company_assigned',user,{companyId:id},tx);
    await audit('order.company_assigned',user,ref.id,{companyId:id},tx);
  });return {ok:true};
});

exports.listCompanies=callable(async req=>{
  const user=await requireAuth(req);const snap=await db.collection('companies').orderBy('name').limit(100).get();
  return {items:snap.docs.map(d=>({id:d.id,name:d.data().name,apiUrl:can(user,'manageCompanies')?d.data().apiUrl:null,
    provider:d.data().provider,enabled:d.data().enabled,archived:d.data().archived||false,
    statusMap:d.data().statusMap||{},lastHealthCheck:safeDate(d.data().lastHealthCheck)}))};
});
exports.saveCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=req.data?.id?idValue(req.data.id):db.collection('companies').doc().id;
  const ref=db.collection('companies').doc(id);
  const name=str(req.data?.name,140),apiUrl=allowedUrl(str(req.data?.apiUrl,300));
  if(req.data?.provider!=='generic_v1')fail('invalid-argument','المحول المتاح حالياً generic_v1 فقط');
  let statusMap;try{statusMap=safeStatusMap(req.data?.statusMap||{});}catch(e){return firebaseError(e);}
  const existing=await ref.get();
  if(existing.exists&&existing.data().archived)fail('failed-precondition','استعد الشركة المؤرشفة صراحةً قبل تعديلها');
  const patch={};
  if(req.data?.apiToken)patch.apiTokenCiphertext=await encryptSecret(str(req.data.apiToken,2000));
  if(req.data?.webhookKey)patch.webhookKeyCiphertext=await encryptSecret(str(req.data.webhookKey,2000));
  if(req.data?.enabled===true){
    if(Object.keys(statusMap).length===0)fail('failed-precondition','اربط حالات التوصيل قبل تفعيل الشركة');
    const savedSecrets=await db.doc(`companySecrets/${id}`).get();
    if(!patch.apiTokenCiphertext&&!savedSecrets.data()?.apiTokenCiphertext)fail('failed-precondition','أدخل مفتاح API قبل تفعيل الشركة');
  }
  const newData={name,apiUrl,provider:'generic_v1',enabled:req.data?.enabled===true,
    ...(!existing.exists?{archived:false}:{}),statusMap,updatedAt:FieldValue.serverTimestamp()};
  const batch=db.batch();batch.set(ref,newData,{merge:true});
  if(Object.keys(patch).length)batch.set(db.collection('companySecrets').doc(id),patch,{merge:true});
  await batch.commit();
  await audit('company.saved',user,id,{name});return {id};
});
exports.archiveCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id);await db.collection('companies').doc(id).update({archived:true,enabled:false,updatedAt:FieldValue.serverTimestamp()});
  await audit('company.archived',user,id);return {ok:true};
});
exports.restoreCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id);const ref=db.collection('companies').doc(id);
  const snap=await ref.get();if(!snap.exists)fail('not-found','الشركة غير موجودة');
  await ref.update({archived:false,enabled:false,updatedAt:FieldValue.serverTimestamp()});
  await audit('company.restored',user,id);return {ok:true};
});
async function companyCredentials(companyId,{allowInactive=false}={}) {
  const [c,s]=await Promise.all([db.doc(`companies/${companyId}`).get(),db.doc(`companySecrets/${companyId}`).get()]);
  if(!c.exists||(!allowInactive&&(!c.data().enabled||c.data().archived))||!s.exists)fail('failed-precondition','شركة التوصيل غير مجهزة');
  return {company:c.data(),secrets:s.data()};
}
exports.testCompanyConnection=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id);const {company,secrets}=await companyCredentials(id,{allowInactive:true});
  try{const json=await providerFor(company).health(company,await decryptSecret(secrets.apiTokenCiphertext));
    await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp()});
    return {connected:true,provider:company.provider,serviceStatus:json.status||'ok'};
  }catch(e){logger.warn('delivery health check failed',{companyId:id,code:e.code||'unknown'});return {connected:false,error:'فشل اختبار الاتصال بالمزود؛ تحقق من إعداداته'};}
});
exports.sendOrderToDelivery=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);const lockId=crypto.randomUUID();
  let snapshot;
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const doc=await tx.get(ref),o=doc.data();
    if(!o)fail('not-found','الطلب غير موجود');
    if(o.status!=='ready'||!o.companyId)fail('failed-precondition','الطلب غير جاهز للشحن');
    if(o.dispatchState==='needs_review')fail('failed-precondition','نتيجة الإرسال السابقة غير مؤكدة. تحقق من شركة التوصيل أولاً لمنع شحنة مكررة.');
    if(o.dispatchState==='sent')fail('failed-precondition','الطلب أُرسل بالفعل');
    // A timed-out request may have reached the vendor: never auto-resend it.
    if(o.dispatchState==='sending')fail('failed-precondition','يوجد إرسال سابق يحتاج مراجعة إذا لم يكتمل');
    snapshot={...o,id:ref.id};
    tx.update(ref,{dispatchState:'sending',dispatchLockId:lockId,dispatchLockUntil:Timestamp.fromMillis(Date.now()+90000)});
  });
  try {
    const {company,secrets}=await companyCredentials(snapshot.companyId);
    const result=await providerFor(company).create(company,await decryptSecret(secrets.apiTokenCiphertext),snapshot);
    const tracking=optional(result.trackingNumber||result.tracking,120);
    if(!tracking)throw new Error('vendor_missing_tracking');
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(current.data().dispatchLockId!==lockId)fail('aborted','تغيّر قفل الإرسال');
      tx.update(ref,{revision:FieldValue.increment(1),status:'dispatched',dispatchState:'sent',nextPollAt:Timestamp.now(),trackingNumber:tracking,dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp(),syncError:null});
      await addEvent(ref.id,'sent_to_delivery',user,{companyId:snapshot.companyId,tracking},tx);
      await audit('order.sent_to_delivery',user,ref.id,{companyId:snapshot.companyId},tx);
    });return {ok:true,trackingNumber:tracking};
  }catch(e){
    logger.error('delivery dispatch failed',{id:ref.id,code:e.code||'unknown'});
    await db.runTransaction(async tx=>{const o=await tx.get(ref);
      if(o.data()?.dispatchLockId===lockId)tx.update(ref,{dispatchState:'needs_review',syncError:'نتيجة إرسال الشحنة غير مؤكدة. تحقق من شركة التوصيل قبل أي محاولة أخرى، فقد تكون الشحنة قد أُنشئت.',dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete()});
    });
    fail('unavailable','فشل إرسال الطلب. تحقق من الشركة قبل إعادة المحاولة.');
  }
});


// Audited recovery for uncertain vendor requests: never silently resend.
// General manager must confirm the external shipment outcome first.
exports.resolveDispatchException=callable(async req=>{
  const user=await requireAuth(req);
  if(user.role!=='generalManager')fail('permission-denied','المراجعة الاستثنائية للمدير العام فقط');
  const {ref}=await oneOrder(user,req.data?.id);
  const outcome=str(req.data?.outcome,30);
  if(!['shipment_exists','not_created'].includes(outcome))fail('invalid-argument','نتيجة غير صالحة');
  const reason=str(req.data?.reason,400);
  if(reason.length<10)fail('invalid-argument','اكتب مرجع التحقق من الشركة أو سبب القرار (10 أحرف على الأقل)');
  const tracking=outcome==='shipment_exists'?str(req.data?.trackingNumber,120):null;
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const doc=await tx.get(ref),o=doc.data();
    if(!o)fail('not-found','الطلب غير موجود');
    if(!canResolveDispatch(o))fail('failed-precondition','الطلب لا يحتاج هذه المراجعة');
    const change=outcome==='shipment_exists'?{status:'dispatched',trackingNumber:tracking,dispatchState:'sent',nextPollAt:Timestamp.now()}
      :{dispatchState:'idle',trackingNumber:null};
    tx.update(ref,{...change,revision:FieldValue.increment(1),dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete(),syncError:null,updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'dispatch_exception_resolved',user,{outcome,trackingNumber:tracking,reason},tx);
    await audit('order.dispatch_exception_resolved',user,ref.id,{outcome,trackingNumber:tracking,reason},tx);
  });
  return {ok:true};
});

exports.listMembers=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const snap=await db.collection('members').limit(100).get();
  return {items:snap.docs.map(d=>({id:d.id,name:d.data().name,email:d.data().email,role:d.data().role,active:d.data().active,
    permissions:d.data().permissions||[],salesSupervisorId:d.data().salesSupervisorId||null}))};
});
exports.saveMember=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const role=str(req.data?.role,30);if(!validRole(role))fail('invalid-argument','دور غير صالح');
  const permissions=req.data?.permissions||[];
  if(!validPermissions(permissions))fail('invalid-argument','صلاحيات غير صالحة');
  if(user.role!=='generalManager') {
    if(['manager','generalManager'].includes(role) || permissions.some(p=>!can(user,p)))fail('permission-denied','لا يمكن منح صلاحيات أعلى من صلاحيتك');
  }
  const name=str(req.data?.name,120),supervisor=req.data?.salesSupervisorId==null?null:idValue(req.data.salesSupervisorId);
  if(supervisor&&role!=='dataEntry')fail('invalid-argument','مشرف المبيعات خاص بمدخل البيانات');
  if(supervisor){const sup=await db.doc(`members/${supervisor}`).get();if(!sup.exists||sup.data().role!=='sales'||sup.data().active===false)fail('failed-precondition','مشرف المبيعات غير متاح');}
  if(req.data?.id){
    const id=idValue(req.data.id);const target=await db.doc(`members/${id}`).get();
    if(!target.exists)fail('not-found','الموظف غير موجود');
    if(id===user.id||target.data().role==='generalManager'&&user.role!=='generalManager')fail('permission-denied','لا يمكنك تعديل هذا الحساب');
    if(user.role!=='generalManager' && target.data().role==='manager')fail('permission-denied','لا يمكنك تعديل المدير');
    const active=req.data?.active!==false;
    // Serialize membership changes with order creation and other admin changes.
    await db.runTransaction(async tx=>{
      await currentActor(tx,user);
      const latest=await tx.get(target.ref);
      if(!latest.exists)fail('not-found','الموظف غير موجود');
      if(user.role!=='generalManager'&&['manager','generalManager'].includes(latest.data().role))fail('permission-denied','لا يمكنك تعديل الإدارة');
      if(latest.data().role!==role||(latest.data().salesSupervisorId||null)!==supervisor){
        const orders=await tx.get(db.collection('orders').where('createdBy','==',id).limit(1));
        if(!orders.empty)fail('failed-precondition','تغيير الدور أو الفريق مع طلبات سابقة يحتاج ترحيلاً رسمياً');
      }
      if(latest.data().role==='generalManager'&&latest.data().active===true&&(!active||role!=='generalManager')){
        const managers=await tx.get(db.collection('members').where('role','==','generalManager').where('active','==',true));
        if(managers.size<=1)fail('failed-precondition','لا يمكن تعطيل آخر مدير عام فعال');
      }
      if(supervisor){const sup=await tx.get(db.doc('members/'+supervisor));if(!sup.exists||sup.data().role!=='sales'||sup.data().active!==true)fail('failed-precondition','مشرف المبيعات غير متاح');}
      tx.update(target.ref,{name,role,permissions,active,salesSupervisorId:supervisor,updatedAt:FieldValue.serverTimestamp()});
      await audit('member.updated',user,id,{role,active},tx);
    });
    // DB authorization takes effect first, including during Auth API failure.
    await admin.auth().updateUser(id,{disabled:!active,displayName:name});
    if(!active)await admin.auth().revokeRefreshTokens(id);
    return {id};
  }
  const email=str(req.data?.email,240).toLowerCase(), password=str(req.data?.password,140);
  if(password.length<12)fail('invalid-argument','كلمة المرور الأولية يجب أن تحتوي 12 حرفاً على الأقل');
  const active=req.data?.active!==false;
  const authUser=await admin.auth().createUser({email,password,displayName:name,disabled:!active});
  try {await db.doc(`members/${authUser.uid}`).create({name,email,role,active,permissions,salesSupervisorId:supervisor,createdAt:FieldValue.serverTimestamp()});}
  catch(e){await admin.auth().deleteUser(authUser.uid);throw e;}
  await audit('member.created',user,authUser.uid,{role});return {id:authUser.uid};
});

exports.listNotices=callable(async req=>{
  const user=await requireAuth(req);
  const snap=await db.collection('notices').where('recipientId','==',user.id).orderBy('createdAt','desc').limit(50).get();
  return {items:snap.docs.map(d=>({id:d.id,title:d.data().title,body:d.data().body,
    orderId:d.data().orderId,read:d.data().read===true,createdAt:safeDate(d.data().createdAt)}))};
});
exports.markNoticeRead=callable(async req=>{
  const user=await requireAuth(req);
  const ref=db.collection('notices').doc(idValue(req.data?.id));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists||snap.data().recipientId!==user.id)fail('permission-denied','الإشعار غير متاح');
    tx.update(ref,{read:true});
  });return {ok:true};
});
exports.listSyncEvents=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'viewSync');
  const companies=await db.collection('companies').limit(30).get();
  const events=[];
  for(const c of companies.docs){
    const docs=await db.collection('deliveryInbox').doc(c.id).collection('events').orderBy('receivedAt','desc').limit(6).get();
    for(const d of docs.docs)events.push({id:d.id,companyName:c.data().name,orderId:d.data().orderId,
      rawStatus:d.data().raw,source:d.data().source,receivedAt:safeDate(d.data().receivedAt)});
  }
  events.sort((a,b)=>(b.receivedAt||'').localeCompare(a.receivedAt||''));
  return {items:events.slice(0,80)};
});
exports.listAudit=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'viewAudit');
  const snap=await db.collection('auditEvents').orderBy('createdAt','desc').limit(100).get();
  return {items:snap.docs.map(d=>({id:d.id,...d.data(),createdAt:safeDate(d.data().createdAt)}))};
});

const processRemote=require('./remote').createRemoteProcessor({db,FieldValue,addEvent,audit});
exports.deliveryWebhook=onRequest({region:REGION,invoker:'public',maxInstances:10,timeoutSeconds:30},async(req,res)=>{
  if(req.method!=='POST'){res.status(405).send('method_not_allowed');return;}
  try {
    const companyId=optional(req.query.companyId,140);
    if(!/^[\w-]{3,140}$/.test(companyId)){res.status(400).send('invalid_company');return;}
    const credentials=await companyCredentials(companyId,{allowInactive:true});
    const secret=await decryptSecret(credentials.secrets.webhookKeyCiphertext);
    if(!verifyWebhook(req.rawBody,req.headers['x-velnix-timestamp'],req.headers['x-velnix-signature'],secret)){
      res.status(401).send('invalid_signature');return;
    }
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){res.status(400).send('invalid_body');return;}
    const eventId=crypto.createHash('sha256').update(req.rawBody).digest('hex');
    const result=await processRemote(companyId,req.body,eventId,'webhook');
    if(result.updated){const doc=await db.doc(`orders/${optional(req.body.reference||req.body.orderId,140)}`).get();
      if(doc.exists)await notifyRecipients([doc.data().createdBy,doc.data().salesSupervisorId],
        'تحديث شركة التوصيل',`وصل تحديث للطلب ${doc.id}: ${optional(req.body.status,80)}`,doc.id).catch(e=>logger.warn('notice failed',{code:e.code||'unknown'}));}
    res.status(result.deferred?503:200).json(result);
  }catch(e){logger.error('deliveryWebhook failed',{code:e.code||'unknown'});res.status(500).send('processing_error');}
});
// Bounded reconciliation for missed webhooks. Firebase Scheduler requires billing.
exports.reconcileDeliveryStatuses=onSchedule({schedule:'every 15 minutes',region:REGION,timeZone:'Etc/UTC',timeoutSeconds:300},async()=>{
  const snap=await db.collection('orders').where('status','in',['dispatched','inTransit'])
    .where('nextPollAt','<=',Timestamp.now()).orderBy('nextPollAt','asc').limit(100).get();
  let checked=0,errors=0;
  for(const doc of snap.docs){
    const o=doc.data();
    // Round-robin backoff prevents the first 100 orders starving newer shipments.
    const nextPollAt=Timestamp.fromMillis(Date.now()+15*60*1000);
    await doc.ref.update({nextPollAt});
    if(!o.companyId||!o.trackingNumber)continue;
    try {
      const {company,secrets}=await companyCredentials(o.companyId,{allowInactive:true});
      const token=await decryptSecret(secrets.apiTokenCiphertext);
      const data=await providerFor(company).status(company,token,o.trackingNumber);
      const rawStatus=optional(data.status,80);
      if(rawStatus)await processRemote(o.companyId,{reference:doc.id,status:rawStatus},crypto.createHash('sha256').update(doc.id+':'+rawStatus).digest('hex'),'poll');
      checked++;
    }catch(e){errors++;logger.warn('reconcile item failed',{id:doc.id,code:e.code||'unknown'});}
  }
  logger.info('delivery reconcile',{checked,errors});
});

exports.registerDevice=callable(async req=>{
  const user=await requireAuth(req);let id;try{id=deviceId(req.data?.token);}catch(e){return firebaseError(e);}
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const devices=await tx.get(db.collection('devices').where('uid','==',user.id));
    if(devices.size>=20&&!devices.docs.some(d=>d.id===id))fail('resource-exhausted','احذف جهازاً قديماً قبل إضافة جهاز جديد');
    tx.set(db.doc('devices/'+id),{uid:user.id,token:req.data.token,updatedAt:FieldValue.serverTimestamp()});
  });return {ok:true};
});
exports.unregisterDevice=callable(async req=>{
  const user=await requireAuth(req);let id;try{id=deviceId(req.data?.token);}catch(e){return firebaseError(e);}
  await db.runTransaction(async tx=>{const ref=db.doc('devices/'+id),device=await tx.get(ref);if(device.exists&&device.data().uid===user.id)tx.delete(ref);});return {ok:true};
});
exports.pushNotice=onDocumentCreated({document:'notices/{noticeId}',region:REGION,retry:false},async event=>{
  if(!event.data)return;
  try{const outcome=await deliverNotice(admin,db,event.params.noticeId,event.data.data(),canSeeOrder);await event.data.ref.update({pushOutcome:outcome,pushProcessedAt:FieldValue.serverTimestamp()});}
  catch(e){logger.warn('push failed',{code:e.code||'unknown'});await event.data.ref.update({pushOutcome:{failure:true},pushProcessedAt:FieldValue.serverTimestamp()});}
});

exports.listOrderCreators=callable(async req=>{
  const user=await requireAuth(req);const items=new Map([[user.id,{id:user.id,name:user.name}]]);
  let query=null;
  if(user.role==='generalManager'||user.role==='warehouse'||can(user,'viewAllOrders'))query=db.collection('members');
  else if(user.role==='sales')query=db.collection('members').where('salesSupervisorId','==',user.id).where('role','==','dataEntry');
  if(query){const result=await query.limit(100).get();for(const d of result.docs)items.set(d.id,{id:d.id,name:d.data().name});}
  return {items:[...items.values()]};
});
