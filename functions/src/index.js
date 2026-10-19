'use strict';
const crypto=require('node:crypto');
const {setGlobalOptions}=require('firebase-functions/v2');
const {runtimeOptions}=require('./runtime_config');
setGlobalOptions(runtimeOptions(process.env.VELNIX_RUNTIME_SERVICE_ACCOUNT,process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,process.env.FUNCTIONS_EMULATOR==='true'));
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {deviceId,processPush,recoverPushes}=require('./push');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getMessaging}=require('firebase-admin/messaging');
const {getFirestore,AggregateField,FieldValue,Timestamp,FieldPath}=require('firebase-admin/firestore');
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {logger}=require('firebase-functions');
const {can,canSeeOrder,canEditOrder,allowedTransition,validRole,validPermissions,validateOrderFields,safeStatusMap,dispatchBlocked,canResolveDispatch,documentId,arabicDigits}=require('./policy');
const {allowedUrl,encryptSecret,decryptSecret,vendorRequest,verifyWebhook,remoteCanAdvance}=require('./delivery');
const {orderForUser}=require('./order_view');
const {providerFor,requireOperationalProvider}=require('./providers');
const {CLICK_PROVIDER,readClickOrder,sendClickOrder}=require('./click_delivery');
const {parseClickOrderResponse}=require('./click_response');
const {shippingStatus}=require('./shipping_status');
const {directoryPage}=require('./directory');
const {aggregateGroups}=require('./aggregations');
const {normalizeCustomer,searchDigits,parseFilters,applyFilters,matchingFilters}=require('./query');
initializeApp();const db=getFirestore();
const REGION='europe-west1';
const callable=(fn)=>onCall({region:REGION, enforceAppCheck: true, maxInstances:15, timeoutSeconds:60},async req=>{try{return await fn(req);}catch(e){return firebaseError(e);}});
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const str=(v,max=120)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail('invalid-argument','قيمة غير صالحة');
const idValue=v=>{try{return documentId(v);}catch(e){return firebaseError(e);}};
const optional=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const requiredPerm=(user,perm)=>{if(!can(user,perm))fail('permission-denied','الصلاحية غير متاحة');};
const {requireGoogleSession}=require('./google_identity');
const requireAuth=async req=>{
  const uid=requireGoogleSession(req);
  const snap=await db.doc(`members/${uid}`).get();
  if(!snap.exists || snap.data().active!==true || !validRole(snap.data().role))fail('permission-denied','الحساب غير مفعل');
  const user={...snap.data(),id:uid};
  if(user.role==='sales'&&!can(user,'viewAllOrders')){
    const team=await db.collection('members').where('role','==','dataEntry').where('salesSupervisorId','==',uid).get();
    user.authorizedCreatorIds=[...new Set([uid,...team.docs.map(d=>d.id)])];
  }
  return user;
};
async function currentActor(tx,user){
  const snap=await tx.get(db.doc('members/'+user.id));
  if(!snap.exists||snap.data().active!==true||snap.data().role!==user.role||JSON.stringify(snap.data().permissions||[])!==JSON.stringify(user.permissions||[])||(snap.data().salesSupervisorId||null)!==(user.salesSupervisorId||null)||(snap.data().authorizationVersion||0)!==(user.authorizationVersion||0))fail('permission-denied','تغيرت صلاحيات الحساب؛ أعد تحميل الجلسة');
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
async function notifyRecipients(recipientIds,title,body,orderId,eventKey){
  const order=orderId?(await db.doc('orders/'+orderId).get()).data():null;
  const creator=order?(await db.doc('members/'+order.createdBy).get()).data():null;
  for(const id of new Set(recipientIds.filter(Boolean)).values()){
    const member=await db.doc('members/'+id).get();
    if(!member.exists||member.data().active!==true||(order&&!canSeeOrder({...member.data(),id,authorizedCreatorIds:creator?.role==='dataEntry'&&creator.salesSupervisorId===id?[order.createdBy]:[]},order)))continue;
    const noticeId=crypto.createHash('sha256').update(orderId+':'+eventKey+':'+id).digest('hex');
    try{await db.doc('notices/'+noticeId).create({recipientId:id,title,body,orderId,read:false,createdAt:FieldValue.serverTimestamp()});}
    catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}
  }
}
function orderQueryable(user) {
  if(user.role==='generalManager'||user.role==='warehouse'||can(user,'viewAllOrders'))return [db.collection('orders')];
  const owners=user.role==='sales'?(user.authorizedCreatorIds||[user.id]):[user.id];
  const queries=[];for(let i=0;i<owners.length;i+=30){const ids=owners.slice(i,i+30);queries.push(db.collection('orders').where('createdBy',ids.length===1?'==':'in',ids.length===1?ids[0]:ids));}
  return queries;
}
function scopeQueries(user,filters){
  // When a creator is selected, use an exact authorized owner query instead of IN+equality.
  if(filters.createdBy&&user.role!=='generalManager'&&user.role!=='warehouse'&&!can(user,'viewAllOrders')){
    const allowed=user.role==='sales'?(user.authorizedCreatorIds||[user.id]):[user.id];
    if(!allowed.includes(filters.createdBy))fail('permission-denied','الموظف خارج نطاق حسابك');
    return [applyFilters(db.collection('orders').where('createdBy','==',filters.createdBy),{...filters,createdBy:null})];
  }
  return orderQueryable(user).map(query=>applyFilters(query,filters));
}
async function oneOrder(user,id) {
  const ref=db.collection('orders').doc(idValue(id));const snap=await ref.get();
  if(!snap.exists)fail('not-found','الطلب غير موجود');
  if(!canSeeOrder(user,{...snap.data(),id:snap.id}))fail('permission-denied','لا يمكن الوصول للطلب');
  return {ref,snap};
}
function firebaseError(e){
  if(e instanceof HttpsError)throw e;
  const messages={invalid_page_size:'اختر حجم صفحة من 1 إلى 100',invalid_search:'أدخل بحثاً حتى 80 حرفاً',invalid_cursor:'تعذر متابعة القائمة؛ حدّثها',invalid_customer:'أدخل اسم مستلم صالحاً حتى 120 حرفاً',invalid_phone:'رقم الهاتف يجب أن يحتوي 7 إلى 15 رقماً',invalid_quantity:'الكمية يجب أن تكون عدداً صحيحاً من 1 إلى 10000',invalid_amount:'أدخل مبلغاً صالحاً حتى ثلاث منازل عشرية',invalid_city:'المحافظة مطلوبة',invalid_area:'المنطقة مطلوبة',invalid_address:'العنوان مطلوب ولا يتجاوز 240 حرفاً',invalid_description:'وصف الطلب مطلوب ولا يتجاوز 500 حرف',invalid_paymentMethod:'اختر طريقة الدفع المتاحة',invalid_status_map:'اربط حالات الشركة بحالات الشحن الداخلية المسموحة',invalid_document_id:'معرف السجل غير صالح',invalid_date:'اختر تاريخاً صحيحاً',invalid_date_range:'نهاية الفترة يجب أن تلي بدايتها',invalid_status:'اختر حالة طلب صحيحة',invalid_bucket:'اختر مجموعة طلبات صحيحة',invalid_device_token:'تعذر تسجيل الجهاز للإشعارات',invalid_delivery_url:'أدخل رابط API صالحاً باستخدام HTTPS',click_send_disabled:'إرسال Click غير مفعّل لهذه الشركة',click_auth_failed:'فشل اعتماد Click عند الإرسال؛ لم تُعتمد الشحنة',click_send_rejected:'رفض Click طلب الإنشاء؛ راجع بيانات الشحنة',click_response_too_large:'استجابة Click أكبر من الحد المسموح',click_invalid_json:'استجابة Click غير صالحة',click_transport_unavailable:'تعذر الاتصال بـClick',invalid_click_client_serial:'مرجع الشحنة أطول من 25 حرفاً؛ قصّره أو أعد توليده',invalid_click_order_ref:'مرجع شحنة Click غير صالح',invalid_click_user_id:'User_ID الخاص بـClick غير صالح'};
  if(messages[e?.message])fail('invalid-argument',messages[e.message]);
  if(e?.code==='auth/email-already-exists')fail('already-exists','البريد الإلكتروني مستخدم بالفعل');
  if(['delivery_host_not_allowed','kms_not_configured','kms_not_configured_or_bad_secret','unsupported_delivery_provider'].includes(e?.message))fail('failed-precondition','إعداد شركة التوصيل أو خدمة تشفير مفاتيحها غير مكتمل؛ راجع إعدادات المؤسسة');
  if(['click_contract_incomplete','click_requires_dedicated_adapter'].includes(e?.message))fail('failed-precondition','تكامل Click Delivery غير مفعّل: نحتاج استجابات API وأكواد الحالات وعقد المبالغ قبل تشغيله');
  if(e?.message==='invalid_click_url')fail('invalid-argument','رابط Click Delivery يجب أن يطابق العنوان الموثق للشركة');
  logger.error('velnix.error',{code:e?.code||'unknown'});
  fail('internal','تعذر إتمام العملية؛ أعد المحاولة أو راجع المسؤول');
}

const joins=require('./join_requests')({db,auth:getAuth(),FieldValue,FieldPath,requireAuth,currentActor,audit,fail});
for(const [name,handler] of Object.entries(joins))exports[name]=callable(handler);

exports.me=callable(async req=>{const user=await requireAuth(req);return {id:user.id,name:user.name,role:user.role,active:user.active,permissions:user.permissions||[],salesSupervisorId:user.salesSupervisorId||null,email:user.email||''};});
exports.listOrders=callable(async req=>{
  const user=await requireAuth(req);
  const size=Math.max(1,Math.min(50,Math.floor(Number(req.data?.pageSize)||30)));
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const sort=req.data?.sort||'desc';if(!['asc','desc'].includes(sort))fail('invalid-argument','ترتيب غير صالح');
  let previous=null;if(req.data?.afterId)previous=(await oneOrder(user,req.data.afterId)).snap;
  const results=await Promise.all(scopeQueries(user,filters).map(base=>{let query=base.orderBy('createdAt',sort).orderBy(FieldPath.documentId(),sort).limit(size);if(previous)query=query.startAfter(previous);return query.get();}));
  const docs=results.flatMap(result=>result.docs).filter(d=>canSeeOrder(user,d.data()));
  docs.sort((a,b)=>{const time=(a.data().createdAt?.toMillis?.()||0)-(b.data().createdAt?.toMillis?.()||0);const comparison=time||(a.id===b.id?0:a.id>b.id?1:-1);return comparison*(sort==='desc'?-1:1);});
  const page=docs.slice(0,size);return {items:page.map(d=>orderForUser(user,d)),nextAfterId:page.length===size?page.at(-1).id:null};
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
  const scoped=scopeQueries(user,filters);
  const searches=[];
  for(const base of scoped){
    if(digits.length>=7)searches.push(base.where('phoneDigits','==',digits).limit(50).get());
    searches.push(base.where('customerKey','>=',needle).where('customerKey','<=',needle+'\uf8ff').orderBy('customerKey').limit(50).get());
  }
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
  const base=scopeQueries(user,{...filters,status:null,bucket:'all'});
  const statuses=require('./policy').STATUSES;
  const showAmount=user.role==='generalManager'||can(user,'viewAmounts');
  const counter={all:{},delivery:{},internal:{}};
  // Use independent aggregations by state and bucket; avoid scanning client lists.
  const values=await aggregateGroups(statuses.flatMap(status=>[
    base.map(query=>query.where('status','==',status).where('hasDelivery','==',true)),
    base.map(query=>query.where('status','==',status).where('hasDelivery','==',false)),
  ]),query=>sumOrders(query,showAmount));
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
  const values=await aggregateGroups(statuses.map(status=>
    scopeQueries(user,{...filters,status:null,companyId:null,bucket:'all'}).map(query=>query.where('companyId','==',companyId).where('status','==',status))),query=>sumOrders(query,showAmount));
  const counts={};statuses.forEach((status,i)=>counts[status]=values[i]);
  return {counts,partial:false};
});
exports.getOrder=callable(async req=>{
  const user=await requireAuth(req), {snap}=await oneOrder(user,req.data?.id);
  const size=req.data?.eventsPageSize??80;
  if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم صفحة الأحداث غير صالح');
  let query=snap.ref.collection('events').orderBy('createdAt','desc');
  if(req.data?.eventsAfterId!=null){
    const id=idValue(req.data.eventsAfterId);
    const cursor=await snap.ref.collection('events').doc(id).get();
    if(!cursor.exists)fail('invalid-argument','مؤشر أحداث غير صالح');
    query=query.startAfter(cursor);
  }
  const page=await query.limit(size+1).get();
  const docs=page.docs.slice(0,size);
  const order=orderForUser(user,snap);if(order.companyId){const company=await db.doc('companies/'+order.companyId).get();order.companyName=company.data()?.name||null;order.companyProvider=company.data()?.provider||null;}
  return {order,events:docs.map(d=>({id:d.id,...d.data(),createdAt:safeDate(d.data().createdAt)})),eventsMore:page.size>size,eventsAfterId:docs.at(-1)?.id||null};
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
  // Durable event trigger delivers notices even if this process stops after commit.
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
    const completion=target==='delivered'?{completionSource:'internal',hasDelivery:false,completedBy:user.id,completedAt:FieldValue.serverTimestamp()}:{};
    tx.update(ref,{status:target,...completion,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    const detail={status:target,...(target==='delivered'?{completionSource:'internal'}:{})};
    await addEvent(ref.id,'status_changed',user,detail,tx);await audit('order.status_changed',user,ref.id,detail,tx);
  });
  return {ok:true};
});
exports.assignCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');const {ref}=await oneOrder(user,req.data?.id);
  const id=req.data?.companyId == null?null:idValue(req.data.companyId);
  if(id){const company=await db.collection('companies').doc(id).get();if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','شركة التوصيل غير مفعلة');}
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const order=await tx.get(ref);
    if(!order.exists)fail('not-found','الطلب غير موجود');
    if(id){const company=await tx.get(db.doc('companies/'+id));if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','الشركة غير مفعلة');}
    if(!['created','review','preparing','ready'].includes(order.data().status) || dispatchBlocked(order.data()))fail('failed-precondition','لا يمكن تعديل شركة طلب مرسل');
    tx.update(ref,{revision:FieldValue.increment(1),companyId:id,hasDelivery:id!=null,updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'company_assigned',user,{companyId:id},tx);
    await audit('order.company_assigned',user,ref.id,{companyId:id},tx);
  });return {ok:true};
});

exports.listCompanies=callable(async req=>{
  const user=await requireAuth(req);const collection=db.collection('companies');const page=await directoryPage(collection,collection,req.data);
  return {more:page.more,afterId:page.afterId,items:page.docs.map(d=>({id:d.id,name:d.data().name,apiUrl:can(user,'manageCompanies')?d.data().apiUrl:null,
    provider:d.data().provider,enabled:d.data().enabled,archived:d.data().archived||false,
    clickUserId:can(user,'manageCompanies')?(d.data().clickUserId??null):null,
    statusMap:d.data().statusMap||{},lastHealthCheck:safeDate(d.data().lastHealthCheck),lastHealthConnected:d.data().lastHealthConnected??null,lastHealthError:d.data().lastHealthError||null}))};
});
exports.saveCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=req.data?.id?idValue(req.data.id):db.collection('companies').doc().id;
  const ref=db.collection('companies').doc(id);
  const name=str(req.data?.name,140),apiUrl=allowedUrl(str(req.data?.apiUrl,300));
  const provider=req.data?.provider;
  if(typeof req.data?.enabled!=='boolean')fail('invalid-argument','حدد حالة تفعيل الشركة صراحةً');
  if(!req.data?.statusMap||typeof req.data.statusMap!=='object'||Array.isArray(req.data.statusMap))fail('invalid-argument','حدد خريطة حالات الشركة صراحةً');
  const patch={};
  if(!['generic_v1',CLICK_PROVIDER].includes(provider))fail('invalid-argument','اختر محول شركة التوصيل المتاح');
  providerFor({provider,apiUrl});
  let clickUserId=null;
  if(provider===CLICK_PROVIDER){
    if(req.data?.enabled===true)fail('failed-precondition','يمكن حفظ Click Delivery كمسودة معطلة فقط حتى استكمال عقد API');
    if(req.data?.apiToken||req.data?.webhookKey||Object.keys(req.data?.statusMap||{}).length)fail('invalid-argument','لا تستخدم token أو webhook أو أكواد حالات generic مع Click Delivery');
    if(req.data?.clickUserId!=null){
      clickUserId=Number(req.data.clickUserId);
      if(!Number.isSafeInteger(clickUserId)||clickUserId<1||clickUserId>2147483647)fail('invalid-argument','User_ID الخاص بـClick غير صالح');
    }
    // Server-side send gate. It stays off until the financial contract and
    // duplicate protection are explicitly approved; no API call may turn it on.
    if(req.data?.clickSendEnabled===true)fail('failed-precondition','إرسال Click ما زال معطلاً؛ لا يمكن تفعيله حتى اعتماد عقد المبالغ ومنع التكرار');
    if(req.data?.clickUserName)patch.clickUserNameCiphertext=await encryptSecret(str(req.data.clickUserName,2000));
    if(req.data?.clickUserPass)patch.clickUserPassCiphertext=await encryptSecret(str(req.data.clickUserPass,2000));
  }
  let statusMap;try{statusMap=safeStatusMap(req.data.statusMap);}catch(e){return firebaseError(e);}
  const existing=await ref.get();
  if(existing.exists&&existing.data().provider!==provider)fail('failed-precondition','لا يمكن تغيير محول شركة موجودة؛ أنشئ إعداداً مستقلاً لحماية الشحنات السابقة');
  if(existing.exists&&existing.data().archived)fail('failed-precondition','استعد الشركة المؤرشفة صراحةً قبل تعديلها');
  if(req.data?.apiToken)patch.apiTokenCiphertext=await encryptSecret(str(req.data.apiToken,2000));
  if(req.data?.webhookKey)patch.webhookKeyCiphertext=await encryptSecret(str(req.data.webhookKey,2000));
  if(req.data?.enabled===true){
    if(Object.keys(statusMap).length===0)fail('failed-precondition','اربط حالات التوصيل قبل تفعيل الشركة');
    const savedSecrets=await db.doc(`companySecrets/${id}`).get();
    if(!patch.apiTokenCiphertext&&!savedSecrets.data()?.apiTokenCiphertext)fail('failed-precondition','أدخل مفتاح API قبل تفعيل الشركة');
  }
  const newData={name,apiUrl,provider,enabled:req.data.enabled,
    ...(!existing.exists?{archived:false}:{}),statusMap,
    ...(provider===CLICK_PROVIDER&&clickUserId!==null?{clickUserId}:{}),
    ...(provider===CLICK_PROVIDER?{clickSendEnabled:false}:{}),updatedAt:FieldValue.serverTimestamp()};
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);
    if(latest.exists&&latest.data().provider!==provider)fail('failed-precondition','تغيّر محول الشركة؛ أعد تحميلها');
    if(latest.exists&&latest.data().archived)fail('failed-precondition','استعد الشركة المؤرشفة قبل تعديلها');
    tx.set(ref,newData,{merge:true});
    if(Object.keys(patch).length)tx.set(db.doc('companySecrets/'+id),patch,{merge:true});
    await audit('company.saved',user,id,{name},tx);
  });return {id};
});
exports.archiveCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id),ref=db.doc('companies/'+id);
  await db.runTransaction(async tx=>{await currentActor(tx,user);const company=await tx.get(ref);if(!company.exists)fail('not-found','الشركة غير موجودة');tx.update(ref,{archived:true,enabled:false,updatedAt:FieldValue.serverTimestamp()});await audit('company.archived',user,id,{},tx);});return {ok:true};
});
exports.restoreCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id),ref=db.doc('companies/'+id);
  await db.runTransaction(async tx=>{await currentActor(tx,user);const company=await tx.get(ref);if(!company.exists)fail('not-found','الشركة غير موجودة');if(company.data().archived!==true)fail('failed-precondition','الشركة غير مؤرشفة');tx.update(ref,{archived:false,enabled:false,updatedAt:FieldValue.serverTimestamp()});await audit('company.restored',user,id,{},tx);});return {ok:true};
});
async function companyCredentials(companyId,{allowInactive=false,requireSecrets=true}={}) {
  const [c,s]=await Promise.all([db.doc(`companies/${companyId}`).get(),db.doc(`companySecrets/${companyId}`).get()]);
  if(!c.exists||(!allowInactive&&(!c.data().enabled||c.data().archived))||(requireSecrets&&!s.exists))fail('failed-precondition','شركة التوصيل غير مجهزة');
  return {company:c.data(),secrets:s.data()||{}};
}
exports.testCompanyConnection=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id);const {company,secrets}=await companyCredentials(id,{allowInactive:true});
  requireOperationalProvider(company);
  try{const json=await providerFor(company).health(company,await decryptSecret(secrets.apiTokenCiphertext));
    await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp(),lastHealthConnected:true,lastHealthError:null});
    return {connected:true,provider:company.provider,serviceStatus:'ok'};
  }catch(e){await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp(),lastHealthConnected:false,lastHealthError:'تعذر الاتصال بالمزود؛ تحقق من إعداداته'});logger.warn('delivery health check failed',{companyId:id,code:e.code||'unknown'});return {connected:false,error:'فشل اختبار الاتصال بالمزود؛ تحقق من إعداداته'};}
});
async function deliverySendCredentials(companyId){
  const [c,s]=await Promise.all([db.doc('companies/'+companyId).get(),db.doc('companySecrets/'+companyId).get()]);
  if(!c.exists)fail('failed-precondition','شركة التوصيل غير موجودة');
  const company=c.data();
  if(company.provider===CLICK_PROVIDER){
    if(company.archived===true)fail('failed-precondition','شركة Click مؤرشفة');
  }else if(!company.enabled||company.archived)fail('failed-precondition','شركة التوصيل غير مفعلة');
  if(!s.exists)fail('failed-precondition','بيانات اعتماد شركة التوصيل غير موجودة');
  return {company,secrets:s.data()||{}};
}
async function createDeliveryShipment(company,secrets,order,onAttempt){
  if(company.provider===CLICK_PROVIDER){
    if(company.clickSendEnabled!==true)throw Error('click_send_disabled');
    const userName=await decryptSecret(secrets.clickUserNameCiphertext);
    const userPass=await decryptSecret(secrets.clickUserPassCiphertext);
    onAttempt();
    return sendClickOrder(company,order,{User_Name:userName,User_Pass:userPass});
  }
  const adapter=requireOperationalProvider(company);
  const token=await decryptSecret(secrets.apiTokenCiphertext);
  onAttempt();
  return adapter.create(company,token,order);
}
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
    const company=await tx.get(db.doc('companies/'+o.companyId));
    const c=company.data();
    if(!company.exists||!c)fail('failed-precondition','شركة التوصيل غير موجودة');
    if(c.provider===CLICK_PROVIDER){
      if(c.archived===true||c.clickSendEnabled!==true)fail('failed-precondition','إرسال Click غير مفعّل لهذه الشركة');
    }else{
      if(c.archived||c.enabled!==true)fail('failed-precondition','شركة التوصيل غير مفعلة؛ لم يبدأ إرسال الشحنة');
      requireOperationalProvider(c);
    }
    snapshot={...o,id:ref.id};
    tx.update(ref,{dispatchState:'sending',dispatchLockId:lockId,dispatchLockUntil:Timestamp.fromMillis(Date.now()+90000)});
  });
  let vendorAttempted=false;
  try {
    const {company,secrets}=await deliverySendCredentials(snapshot.companyId);
    const result=await createDeliveryShipment(company,secrets,snapshot,()=>{vendorAttempted=true;});
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
      if(o.data()?.dispatchLockId===lockId){
        // Click can create a shipment and still answer HTTP 400 (observed
        // 2026-10-19). The adapter signals that exact case so the UI keeps a
        // Click-specific review message and the exact merchant reference for
        // the later reconcile/sync instead of a generic transport message.
        const clickAmbiguous=vendorAttempted&&e?.code==='click_ambiguous_creation';
        const clickRef=typeof e?.clickOrderRef==='string'?e.clickOrderRef:null;
        const clickSerial=typeof e?.clickClientSerial==='string'?e.clickClientSerial:null;
        const failure=vendorAttempted?{dispatchState:'needs_review',...(clickRef?{clickOrderRef:clickRef}:{}),...(clickSerial?{clickClientSerial:clickSerial}:{}),syncError:clickAmbiguous?'Click قد يكون أنشأ الشحنة رغم رد غير محسوم. تحقق من البوابة أولاً واربط رقم الشحنة الموجود قبل أي إعادة إرسال.':'نتيجة إرسال الشحنة غير مؤكدة. تحقق من شركة التوصيل قبل أي محاولة أخرى، فقد تكون الشحنة قد أُنشئت.'}:{dispatchState:'idle',syncError:'تعذر تجهيز الاتصال بشركة التوصيل؛ لم يبدأ إرسال الشحنة.'};
        tx.update(ref,{...failure,dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete()});
        const action=vendorAttempted?'dispatch_attempt_failed':'dispatch_preparation_failed';
        await addEvent(ref.id,action,user,{},tx);await audit('order.'+action,user,ref.id,{},tx);
      }
    });
    fail(vendorAttempted?'unavailable':'failed-precondition',vendorAttempted?'فشل إرسال الطلب. تحقق من الشركة قبل إعادة المحاولة.':'تعذر تجهيز الاتصال بشركة التوصيل؛ لم يبدأ إرسال الشحنة.');
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

// Links an existing Click shipment to its Velnix order without ever creating a
// second shipment. The operator supplies the Click Order_ID and one of the
// seven owner-confirmed business states; no unconfirmed Click API code is
// interpreted and no financial settlement is derived.
exports.reconcileClickShipment=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);
  const clickOrderId=str(req.data?.clickOrderId,40);
  if(!/^[0-9]{1,20}$/.test(clickOrderId))fail('invalid-argument','رقم البوليصة في Click يجب أن يكون رقماً');
  const rawRef=typeof req.data?.clickOrderRef==='string'?req.data.clickOrderRef.trim():'';
  if(!rawRef||rawRef.length>25)fail('invalid-argument','مرجع Click (Order_ID) يجب أن يكون بين 1 و25 حرفاً');
  const clickOrderRef=rawRef;
  const rawSerial=typeof req.data?.clickClientSerial==='string'?req.data.clickClientSerial.trim():'';
  if(rawSerial.length>200)fail('invalid-argument','كود التاجر الأصلي أطول من الحد المسموح');
  const clickClientSerial=rawSerial||null;
  const state=shippingStatus(req.data?.shippingStatus);
  if(!state)fail('invalid-argument','اختر حالة شحنة صحيحة من الحالات السبع');
  const reason=str(req.data?.reason,400);
  if(reason.length<10)fail('invalid-argument','اكتب مرجع التحقق أو سبب الربط (10 أحرف على الأقل)');
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const doc=await tx.get(ref),o=doc.data();
    if(!o)fail('not-found','الطلب غير موجود');
    if(!o.companyId)fail('failed-precondition','لم يتم تعيين شركة توصيل للطلب');
    const company=await tx.get(db.doc('companies/'+o.companyId));
    if(!company.exists||company.data().provider!==CLICK_PROVIDER)fail('failed-precondition','الطلب غير مرتبط بـClick Delivery');
    if(o.providerOrderId&&o.providerOrderId!==clickOrderId)fail('already-exists','الطلب مرتبط بشحنة Click أخرى؛ لن يُستبدل المعرف');
    if(o.clickOrderRef&&o.clickOrderRef!==clickOrderRef)fail('already-exists','الطلب مرتبط بمرجع Click آخر؛ لن يُستبدل المرجع');
    // Click identifiers are globally unique. Never attach either the policy
    // number or the merchant reference to a second Velnix order.
    const linkedPolicy=await tx.get(db.collection('orders').where('providerOrderId','==',clickOrderId).limit(2));
    if(linkedPolicy.docs.some(d=>d.id!==ref.id))fail('already-exists','رقم شحنة Click مرتبط بطلب Velnix آخر؛ لن يُكرر الربط');
    const linkedRef=await tx.get(db.collection('orders').where('clickOrderRef','==',clickOrderRef).limit(2));
    if(linkedRef.docs.some(d=>d.id!==ref.id))fail('already-exists','مرجع Click مرتبط بطلب Velnix آخر؛ لن يُكرر الربط');
    // An API-confirmed state must not be silently downgraded to a manual one.
    if(o.shippingStatusSource==='click_api'){
      if(o.shippingStatus!==state)fail('failed-precondition','حالة الشحنة مؤكدة من Click API ولا يمكن استبدالها يدويًا');
      return;
    }
    if(o.providerOrderId===clickOrderId&&o.clickOrderRef===clickOrderRef&&o.shippingStatus===state&&o.shippingStatusSource==='manual')return;
    if(!['ready','dispatched','inTransit'].includes(o.status))fail('failed-precondition','لا يمكن ربط شحنة Click بهذه الحالة');
    tx.update(ref,{providerOrderId:clickOrderId,clickOrderRef,clickClientSerial,shippingStatus:state,shippingStatusSource:'manual',shippingStatusUpdatedAt:FieldValue.serverTimestamp(),dispatchState:'sent',
      status:o.status==='ready'?'dispatched':o.status,hasDelivery:true,nextPollAt:null,syncError:null,lastSyncAt:FieldValue.serverTimestamp(),revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'click_reconciled',user,{clickOrderId,clickOrderRef,shippingStatus:state,reason},tx);
    await audit('order.click_reconciled',user,ref.id,{clickOrderId,clickOrderRef,shippingStatus:state,reason},tx);
  });
  return {ok:true};
});

// Read-only Click status sync. It never calls setorder/removeorder and never
// creates a shipment. The manual path stays available as a fallback.
exports.syncClickOrder=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);
  const lockId=crypto.randomUUID();
  let snapshot;
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const doc=await tx.get(ref),o=doc.data();
    if(!o)fail('not-found','الطلب غير موجود');
    if(!o.companyId)fail('failed-precondition','لم يتم تعيين شركة توصيل للطلب');
    const company=await tx.get(db.doc('companies/'+o.companyId)),c=company.data();
    if(!company.exists||c.provider!==CLICK_PROVIDER||c.archived===true)fail('failed-precondition','الطلب غير مرتبط بشركة Click Delivery نشطة');
    const clickUserId=Number(c.clickUserId);
    if(!Number.isSafeInteger(clickUserId)||clickUserId<1)fail('failed-precondition','لم يُضبط User_ID لحساب Click');
    const clickOrderRef=typeof o.clickOrderRef==='string'?o.clickOrderRef.trim():'';
    if(!clickOrderRef||clickOrderRef.length>25)fail('failed-precondition','لا يوجد مرجع Click مرتبط بالطلب؛ اربط الشحنة يدويًا أولًا');
    if(o.clickSyncLockUntil?.toMillis?.()>Date.now())fail('aborted','مزامنة Click قيد التنفيذ؛ انتظر انتهاءها');
    tx.update(ref,{clickSyncLockId:lockId,clickSyncLockUntil:Timestamp.fromMillis(Date.now()+60000)});
    snapshot={...o,id:ref.id,clickOrderRef,clickUserId,company:{...c,id:o.companyId}};
  });
  let parsed;
  try {
    const {status,json}=await readClickOrder(snapshot.company,snapshot.clickOrderRef,snapshot.clickUserId);
    if(status!==200){const e=new Error(`click_http_${status}`);e.reason=`http_${status}`;throw e;}
    parsed=parseClickOrderResponse(json);
    if(!parsed.ok){const e=new Error('click_response_'+parsed.reason);e.reason=parsed.reason;throw e;}
  } catch(e) {
    const reason=typeof e?.reason==='string'?e.reason:(typeof e?.name==='string'?e.name:'transport_error');
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(current.data()?.clickSyncLockId===lockId){
        tx.update(ref,{clickSyncLockId:FieldValue.delete(),clickSyncLockUntil:FieldValue.delete(),lastSyncAttemptAt:FieldValue.serverTimestamp(),syncError:'تعذرت مزامنة حالة Click؛ لم تُعدّل الحالة المحلية.'});
        await addEvent(ref.id,'click_sync_failed',user,{reason},tx);
        await audit('order.click_sync_failed',user,ref.id,{reason},tx);
      }
    });
    logger.warn('click status sync failed',{id:ref.id,reason});
    fail('unavailable','تعذرت مزامنة حالة Click؛ لم تُعدّل الحالة المحلية.');
  }
  let applied=false,ignored=null;
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const current=await tx.get(ref),o=current.data();
    if(o?.clickSyncLockId!==lockId)fail('aborted','تغيّر قفل مزامنة Click');
    const now=FieldValue.serverTimestamp();
    const currentSource=o.shippingStatusSource;
    const currentMs=Number.isFinite(o.clickStatusDateMs)?o.clickStatusDateMs:null;
    const incomingMs=parsed.statusDateMs;
    const clearLock={clickSyncLockId:FieldValue.delete(),clickSyncLockUntil:FieldValue.delete(),lastSyncAttemptAt:now,lastSyncAt:now,syncError:null};
    if(currentSource==='click_api'&&incomingMs===null){
      ignored='missing_status_date';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_conflict',user,{rawStatus:parsed.rawStatus,statusDate:null},tx);
      await audit('order.click_status_conflict',user,ref.id,{rawStatus:parsed.rawStatus,reason:'missing_status_date'},tx);
      return;
    }
    if(currentSource==='click_api'&&currentMs!==null&&incomingMs!==null&&incomingMs<currentMs){
      ignored='stale_status';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_stale',user,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate},tx);
      await audit('order.click_status_stale',user,ref.id,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate},tx);
      return;
    }
    if(currentSource==='click_api'&&currentMs!==null&&incomingMs!==null&&incomingMs===currentMs&&o.shippingStatus!==parsed.shippingStatus){
      ignored='status_conflict';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_conflict',user,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate},tx);
      await audit('order.click_status_conflict',user,ref.id,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate},tx);
      return;
    }
    const unchanged=currentSource==='click_api'&&o.shippingStatus===parsed.shippingStatus&&o.clickStatusDateMs===parsed.statusDateMs;
    const patch={...clearLock,shippingStatus:parsed.shippingStatus,shippingStatusSource:'click_api',
      shippingStatusUpdatedAt:parsed.statusDateMs!==null?Timestamp.fromMillis(parsed.statusDateMs):now,
      clickStatusRaw:parsed.rawStatus,clickStatusDate:parsed.statusDate,clickStatusDateMs:parsed.statusDateMs,clickStatusNote:parsed.note,clickAmounts:parsed.amounts,updatedAt:now};
    if(!unchanged){patch.revision=FieldValue.increment(1);applied=true;}
    tx.update(ref,patch);
    if(!unchanged){
      await addEvent(ref.id,'click_status_synced',user,{rawStatus:parsed.rawStatus,shippingStatus:parsed.shippingStatus,statusDate:parsed.statusDate},tx);
      await audit('order.click_status_synced',user,ref.id,{rawStatus:parsed.rawStatus,shippingStatus:parsed.shippingStatus,statusDate:parsed.statusDate},tx);
    }
  });
  return {ok:true,applied,ignored,shippingStatus:parsed.shippingStatus,rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,note:parsed.note,amounts:parsed.amounts};
});

exports.listMembers=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const collection=db.collection('members');const page=await directoryPage(collection,collection,req.data);
  return {more:page.more,afterId:page.afterId,items:page.docs.map(d=>({id:d.id,name:d.data().name,email:d.data().email,role:d.data().role,active:d.data().active,
    permissions:d.data().permissions||[],salesSupervisorId:d.data().salesSupervisorId||null}))};
});
exports.saveMember=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const role=str(req.data?.role,30);if(!validRole(role))fail('invalid-argument','دور غير صالح');
  const permissions=req.data?.permissions;
  if(!Array.isArray(permissions))fail('invalid-argument','حدد صلاحيات الموظف صراحةً');
  if(!validPermissions(permissions))fail('invalid-argument','صلاحيات غير صالحة');
  if(typeof req.data?.active!=='boolean')fail('invalid-argument','حدد حالة تفعيل الحساب صراحةً');
  if(user.role!=='generalManager') {
    if(['manager','generalManager'].includes(role) || (['sales','warehouse'].includes(role)&&user.role!=='warehouse'&&!can(user,'viewAllOrders')) || (role==='warehouse'&&user.role!=='warehouse'&&!can(user,'updateOrderStatus')) || permissions.some(p=>!can(user,p)))fail('permission-denied','لا يمكن منح صلاحيات أعلى من صلاحيتك');
  }
  const name=str(req.data?.name,120),supervisor=req.data?.salesSupervisorId==null?null:idValue(req.data.salesSupervisorId);
  if(supervisor&&role!=='dataEntry')fail('invalid-argument','مشرف المبيعات خاص بمدخل البيانات');
  if(supervisor){const sup=await db.doc(`members/${supervisor}`).get();if(!sup.exists||sup.data().role!=='sales'||sup.data().active===false)fail('failed-precondition','مشرف المبيعات غير متاح');}
  if(req.data?.id){
    const id=idValue(req.data.id);const target=await db.doc(`members/${id}`).get();
    if(supervisor===id)fail('invalid-argument','لا يمكن أن يكون الموظف مشرفاً على نفسه');
    if(!target.exists)fail('not-found','الموظف غير موجود');
    if(id===user.id||target.data().role==='generalManager'&&user.role!=='generalManager')fail('permission-denied','لا يمكنك تعديل هذا الحساب');
    if(user.role!=='generalManager' && target.data().role==='manager')fail('permission-denied','لا يمكنك تعديل المدير');
    const active=req.data.active;
    // Serialize membership changes with order creation and other admin changes.
    await db.runTransaction(async tx=>{
      await currentActor(tx,user);
      const latest=await tx.get(target.ref);
      if(!latest.exists)fail('not-found','الموظف غير موجود');
      if(user.role!=='generalManager'&&['manager','generalManager'].includes(latest.data().role))fail('permission-denied','لا يمكنك تعديل الإدارة');
      if(user.role!=='generalManager'&&user.role!=='warehouse'&&!can(user,'viewAllOrders')&&(latest.data().role!==role||(latest.data().salesSupervisorId||null)!==supervisor))fail('permission-denied','نقل الدور أو فريق الموظف يحتاج صلاحية مشاهدة كل الطلبات');
      if(latest.data().role==='generalManager'&&latest.data().active===true&&(!active||role!=='generalManager')){
        const managers=await tx.get(db.collection('members').where('role','==','generalManager').where('active','==',true));
        if(managers.size<=1)fail('failed-precondition','لا يمكن تعطيل آخر مدير عام فعال');
      }
      if(supervisor){const sup=await tx.get(db.doc('members/'+supervisor));if(!sup.exists||sup.data().role!=='sales'||sup.data().active!==true)fail('failed-precondition','مشرف المبيعات غير متاح');}
      const supervisors=new Map();
      for(const owner of new Set([latest.data().salesSupervisorId,supervisor].filter(Boolean))){const profile=await tx.get(db.doc('members/'+owner));if(profile.exists)supervisors.set(owner,profile.ref);}
      for(const reference of supervisors.values())tx.update(reference,{authorizationVersion:FieldValue.increment(1)});
      tx.update(target.ref,{name,role,permissions,active,salesSupervisorId:supervisor,updatedAt:FieldValue.serverTimestamp()});
      await audit('member.updated',user,id,{role,active},tx);
    });
    // DB authorization takes effect first, including during Auth API failure.
    await getAuth().updateUser(id,{disabled:!active,displayName:name});
    if(!active)await getAuth().revokeRefreshTokens(id);
    return {id};
  }
  fail('failed-precondition','إضافة الموظف تتطلب طلب انضمام Google وموافقة المدير العام');
});

// Notices are ordered by createdAt desc, so the cursor is a document position
// rather than a name. The cursor must belong to the caller, otherwise one
// employee could probe another employee's notice ids.
async function noticePage(recipientId,data={}){
  if(!data||typeof data!=='object'||Array.isArray(data))fail('invalid-argument','طلب غير صالح');
  const size=data.pageSize??50;
  if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم الصفحة غير صالح');
  let query=db.collection('notices').where('recipientId','==',recipientId).orderBy('createdAt','desc');
  if(data.afterId!=null){
    const id=idValue(data.afterId);
    const cursor=await db.doc('notices/'+id).get();
    if(!cursor.exists||cursor.data().recipientId!==recipientId)fail('invalid-argument','مؤشر ترقيم غير صالح');
    query=query.startAfter(cursor);
  }
  const result=await query.limit(size+1).get();
  const docs=result.docs.slice(0,size);
  return {docs,more:result.size>size,afterId:docs.at(-1)?.id||null};
}
exports.listNotices=callable(async req=>{
  const user=await requireAuth(req);
  const page=await noticePage(user.id,req.data);
  return {items:page.docs.map(d=>({id:d.id,title:d.data().title,body:d.data().body,
    orderId:d.data().orderId,read:d.data().read===true,createdAt:safeDate(d.data().createdAt)})),more:page.more,afterId:page.afterId};
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
  const companyLimit=30,eventLimit=6,resultLimit=80;
  const companies=await db.collection('companies').limit(companyLimit+1).get();
  let limited=companies.size>companyLimit;
  const events=[];
  for(const c of companies.docs.slice(0,companyLimit)){
    const docs=await db.collection('deliveryInbox').doc(c.id).collection('events').orderBy('receivedAt','desc').limit(eventLimit+1).get();
    if(docs.size>eventLimit)limited=true;
    for(const d of docs.docs.slice(0,eventLimit)){
      const order=await db.doc('orders/'+idValue(d.data().orderId)).get();
      if(!order.exists||!canSeeOrder(user,order.data()))continue;
      events.push({id:d.id,companyName:c.data().name,orderId:d.data().orderId,rawStatus:d.data().raw,source:d.data().source,receivedAt:safeDate(d.data().receivedAt)});
    }
  }
  events.sort((a,b)=>(b.receivedAt||'').localeCompare(a.receivedAt||''));
  if(events.length>resultLimit)limited=true;
  return {items:events.slice(0,resultLimit),limited};
});
exports.listAudit=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'viewAudit');
  const size=req.data?.pageSize??50;
  if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم صفحة غير صالح');
  let query=db.collection('auditEvents').orderBy('createdAt','desc');
  if(req.data?.afterId!=null){
    const id=idValue(req.data.afterId);
    const cursor=await db.doc('auditEvents/'+id).get();
    if(!cursor.exists)fail('invalid-argument','مؤشر ترقيم غير صالح');
    query=query.startAfter(cursor);
  }
  const snap=await query.limit(size+1).get();
  const page=snap.docs.slice(0,size);
  const items=[];
  for(const d of page){
    const event=d.data();
    if(event.action?.startsWith('order.')){
      const order=await db.doc('orders/'+idValue(event.entityId)).get();
      if(!order.exists||!canSeeOrder(user,order.data()))continue;
    }
    items.push({id:d.id,action:event.action,actorName:event.actorName,entityId:event.entityId,createdAt:safeDate(event.createdAt)});
  }
  return {items,more:snap.size>size,afterId:page.at(-1)?.id||null};
});

const processRemote=require('./remote').createRemoteProcessor({db,FieldValue,addEvent,audit});
exports.deliveryWebhook=onRequest({region:REGION,invoker:'public',maxInstances:10,timeoutSeconds:30},async(req,res)=>{
  if(req.method!=='POST'){res.status(405).send('method_not_allowed');return;}
  try {
    const companyId=optional(req.query.companyId,140);
    if(!/^[\w-]{3,140}$/.test(companyId)){res.status(400).send('invalid_company');return;}
    const company=await db.doc('companies/'+companyId).get();
    if(!company.exists){res.status(404).send('unknown_company');return;}
    const credentials=await companyCredentials(companyId,{allowInactive:true,requireSecrets:false});
    if(credentials.company.provider===CLICK_PROVIDER){res.status(409).send('provider_contract_unconfirmed');return;}
    const secret=await decryptSecret(credentials.secrets.webhookKeyCiphertext);
    if(!verifyWebhook(req.rawBody,req.headers['x-velnix-timestamp'],req.headers['x-velnix-signature'],secret)){
      res.status(401).send('invalid_signature');return;
    }
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){res.status(400).send('invalid_body');return;}
    const eventId=crypto.createHash('sha256').update(req.rawBody).digest('hex');
    const result=await processRemote(companyId,req.body,eventId,'webhook');
    res.status(result.deferred?503:200).json(result);
  }catch(e){logger.error('deliveryWebhook failed',{code:e.code||'unknown'});res.status(500).send('processing_error');}
});
// Bounded reconciliation for missed webhooks. Firebase Scheduler requires billing.
exports.reconcileDeliveryStatuses=onSchedule({schedule:'every 15 minutes',region:REGION,timeZone:'Etc/UTC',timeoutSeconds:300},async()=>{
  // Reuse the existing reconciliation schedule; no additional billed scheduler is created.
  const reconcileDeadline=Date.now()+240000;
  await recoverPushes({db,admin:{messaging:getMessaging},canSeeOrder});
  const snap=await db.collection('orders').where('status','in',['dispatched','inTransit'])
    .where('nextPollAt','<=',Timestamp.now()).orderBy('nextPollAt','asc').limit(100).get();
  let checked=0,errors=0;const deadline=reconcileDeadline;
  for(const doc of snap.docs){
    if(Date.now()>=deadline)break;
    const o=doc.data();
    // Round-robin backoff prevents the first 100 orders starving newer shipments.
    const nextPollAt=Timestamp.fromMillis(Date.now()+15*60*1000);
    await doc.ref.update({nextPollAt});
    if(!o.companyId||!o.trackingNumber)continue;
    try {
      const {company,secrets}=await companyCredentials(o.companyId,{allowInactive:true});
      const adapter=requireOperationalProvider(company);
      const token=await decryptSecret(secrets.apiTokenCiphertext);
      const data=await adapter.status(company,token,o.trackingNumber);
      const rawStatus=optional(data.status,80);
      if(rawStatus)await processRemote(o.companyId,{reference:doc.id,status:rawStatus},crypto.createHash('sha256').update(doc.id+':'+rawStatus).digest('hex'),'poll');
      checked++;
    }catch(e){errors++;await doc.ref.update({syncError:'تعذر تحديث حالة الشحنة؛ ستعاد المزامنة لاحقاً',lastSyncAttemptAt:FieldValue.serverTimestamp()});logger.warn('reconcile item failed',{id:doc.id,code:e.code||'unknown'});}
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
exports.pushNotice=onDocumentCreated({document:'notices/{noticeId}',region:REGION,retry:true},async event=>{
  if(event.data)await processPush({db,admin:{messaging:getMessaging},ref:event.data.ref,canSeeOrder});
});

exports.listOrderCreators=callable(async req=>{
  const user=await requireAuth(req);const collection=db.collection('members');
  let query=collection;
  if(user.role!=='generalManager'&&user.role!=='warehouse'&&!can(user,'viewAllOrders')){
    if(user.role==='sales')query=query.where('salesSupervisorId','==',user.id).where('role','==','dataEntry');
    else query=query.where(FieldPath.documentId(),'==',user.id);
  }
  const page=await directoryPage(collection,query,req.data);
  const items=page.docs.map(d=>({id:d.id,name:d.data().name}));
  // A sales supervisor's own name is available on page one without duplicating team cursors.
  if(user.role==='sales'&&!req.data?.afterId&&!(req.data?.query||'').trim()&& !items.some(m=>m.id===user.id))items.unshift({id:user.id,name:user.name});
  return {items,more:page.more,afterId:page.afterId};
});

exports.getSettings=callable(async req=>{await requireAuth(req);const snap=await db.doc('settings/system').get();return {organizationName:snap.data()?.organizationName||'Velnix',receiptFooter:snap.data()?.receiptFooter||'',supportPhone:snap.data()?.supportPhone||''};});
exports.saveSettings=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageSettings');
  const organizationName=str(req.data?.organizationName,120),receiptFooter=optional(req.data?.receiptFooter,200),supportPhone=arabicDigits(optional(req.data?.supportPhone,30)).replace(/[ ()-]/g,'');
  if(supportPhone&&!/^\+?[0-9]{7,15}$/.test(supportPhone))fail('invalid-argument','هاتف دعم غير صالح');
  await db.runTransaction(async tx=>{await currentActor(tx,user);tx.set(db.doc('settings/system'),{organizationName,receiptFooter,supportPhone,updatedAt:FieldValue.serverTimestamp()});await audit('settings.updated',user,'system',{},tx);});return {ok:true};
});

exports.orderEventNotice=onDocumentCreated({document:'orders/{orderId}/events/{eventId}',region:'us-central1',retry:true},async event=>{
  if(!event.data)return;
  const order=await db.doc('orders/'+event.params.orderId).get();if(!order.exists)return;
  const members=await db.collection('members').where('role','in',['generalManager','manager','warehouse']).get();
  const creator=await db.doc('members/'+order.data().createdBy).get();
  const recipients=[order.data().createdBy,creator.data()?.role==='dataEntry'?creator.data().salesSupervisorId:null,...members.docs.map(d=>d.id)];
  await notifyRecipients(recipients,event.data.data().action==='created'?'طلب جديد':'تحديث طلب','افتح الطلب لعرض آخر تغيير.',order.id,event.params.eventId);
});
