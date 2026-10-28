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
const {can,canSeeOrder,canEditOrder,allowedTransition,validRole,validPermissions,validOrderType,validateOrderFields,safeStatusMap,dispatchBlocked,canResolveDispatch,documentId,arabicDigits}=require('./policy');
const {allowedUrl,encryptSecret,decryptSecret,vendorRequest,verifyWebhook,remoteCanAdvance}=require('./delivery');
const {orderForUser}=require('./order_view');
const {providerFor,requireOperationalProvider}=require('./providers');
const {CLICK_PROVIDER,readClickOrder,sendClickOrder}=require('./click_delivery');
const {parseClickOrderResponse}=require('./click_response');
const {shippingStatus,isApiConfirmed}=require('./shipping_status');
const {directoryPage}=require('./directory');
const {aggregateGroups}=require('./aggregations');
const {normalizeCustomer,searchDigits,parseFilters,applyFilters,matchingFilters}=require('./query');
const {buildSearchFields}=require('./search');
initializeApp();const db=getFirestore();
const REGION='europe-west1';
// Server-enforced allowlist for real Click sending. Flutter cannot change this.
const CLICK_SEND_ALLOWED_COMPANY_IDS=new Set((process.env.CLICK_SEND_ALLOWED_COMPANY_IDS||'click_delivery_1603').split(',').map(x=>x.trim()).filter(Boolean));
const callable=(fn)=>onCall({region:REGION, enforceAppCheck: true, maxInstances:15, timeoutSeconds:60},async req=>{try{return await fn(req);}catch(e){return firebaseError(e);}});
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const str=(v,max=120)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail('invalid-argument','قيمة غير صالحة');
const idValue=v=>{try{return documentId(v);}catch(e){return firebaseError(e);}};
const optional=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const requiredPerm=(user,perm)=>{if(!can(user,perm))fail('permission-denied','الصلاحية غير متاحة');};
const {requireSession}=require('./google_identity');
const requireAuth=async req=>{
  const uid=requireSession(req);
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
  if(!snap.exists||snap.data().active!==true||snap.data().role!==user.role||JSON.stringify(snap.data().permissions||[])!==JSON.stringify(user.permissions||[])||(snap.data().salesSupervisorId||null)!==(user.salesSupervisorId||null)||(snap.data().authorizationVersion||0)!==(user.authorizationVersion||0)||JSON.stringify([...(snap.data().allowedPageIds||[])].sort())!==JSON.stringify([...(user.allowedPageIds||[])].sort()))fail('permission-denied','تغيرت صلاحيات الحساب؛ أعد تحميل الجلسة');
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
// Single-order, permission-checked status change. Shared by changeOrderStatus
// and the bulk status operation so both honor the exact same policy.
async function applyStatusChange(ref,user,target){
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);
    if(!latest.exists)fail('not-found','الطلب غير موجود');
    if(!canSeeOrder(user,{...latest.data(),id:ref.id}))fail('permission-denied','لا يمكن الوصول للطلب');
    if(!allowedTransition(user,{...latest.data(),id:ref.id},target))fail('failed-precondition','هذا الانتقال غير مسموح');
    const completion=target==='delivered'?{completionSource:'internal',hasDelivery:false,completedBy:user.id,completedAt:FieldValue.serverTimestamp()}:{};
    tx.update(ref,{status:target,...completion,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    const detail={status:target,...(target==='delivered'?{completionSource:'internal'}:{})};
    await addEvent(ref.id,'status_changed',user,detail,tx);await audit('order.status_changed',user,ref.id,detail,tx);
  });
  return {ok:true};
}
// Single-order, permission-checked company assignment. Shared by
// assignCompany and the bulk assignment operation. It enforces sendToDelivery
// itself so no caller (present or future) can reach it without the permission.
async function applyCompanyAssignment(ref,user,id){
  requiredPerm(user,'sendToDelivery');
  if(id){const company=await db.doc('companies/'+id).get();if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','الشركة غير مفعلة');}
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const order=await tx.get(ref);
    if(!order.exists)fail('not-found','الطلب غير موجود');
    if(!canSeeOrder(user,{...order.data(),id:ref.id}))fail('permission-denied','لا يمكن الوصول للطلب');
    if(id){const company=await tx.get(db.doc('companies/'+id));if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','الشركة غير مفعلة');}
    if(!['created','review','preparing','ready'].includes(order.data().status)||dispatchBlocked(order.data()))fail('failed-precondition','لا يمكن تعديل شركة طلب مرسل');
    tx.update(ref,{revision:FieldValue.increment(1),companyId:id,hasDelivery:id!=null,updatedAt:FieldValue.serverTimestamp()});
    const action=id?'company_assigned':'company_unassigned';
    await addEvent(ref.id,action,user,{companyId:id},tx);
    await audit('order.'+action,user,ref.id,{companyId:id},tx);
  });
  return {ok:true};
}
function firebaseError(e){
  if(e instanceof HttpsError)throw e;
  const messages={invalid_page_size:'اختر حجم صفحة من 1 إلى 100',invalid_search:'أدخل بحثاً حتى 80 حرفاً',invalid_cursor:'تعذر متابعة القائمة؛ حدّثها',invalid_customer:'أدخل اسم مستلم صالحاً حتى 120 حرفاً',invalid_phone:'رقم الهاتف يجب أن يكون 10 أرقام إنجليزية',invalid_quantity:'الكمية يجب أن تكون عدداً صحيحاً من 1 إلى 10000',invalid_amount:'أدخل مبلغاً صالحاً حتى ثلاث منازل عشرية',invalid_city:'اختر محافظة أردنية من القائمة',invalid_area:'المنطقة مطلوبة',invalid_address:'العنوان مطلوب ولا يتجاوز 240 حرفاً',invalid_description:'وصف الطلب مطلوب ولا يتجاوز 500 حرف',invalid_paymentMethod:'اختر طريقة الدفع المتاحة',invalid_status_map:'اربط حالات الشركة بحالات الشحن الداخلية المسموحة',invalid_document_id:'معرف السجل غير صالح',invalid_date:'اختر تاريخاً صحيحاً',invalid_date_range:'نهاية الفترة يجب أن تلي بدايتها',invalid_status:'اختر حالة طلب صحيحة',invalid_bucket:'اختر مجموعة طلبات صحيحة',invalid_order_type:'اختر نوع طلب صحيحاً',invalid_dispatch:'اختر حالة إرسال صحيحة',invalid_amount_range:'نطاق المبلغ غير صالح',invalid_bulk:'العملية الجماعية غير صالحة',invalid_name:'اسم الصفحة مطلوب ولا يتجاوز 120 حرفاً',invalid_page_url:'رابط Facebook يجب أن يبدأ بـ http أو https',invalid_page_phone:'رقم هاتف الصفحة غير صالح',invalid_page_whatsapp:'رقم WhatsApp غير صالح',invalid_logo:'شعار الصفحة غير صالح',invalid_device_token:'تعذر تسجيل الجهاز للإشعارات',invalid_delivery_url:'أدخل رابط API صالحاً باستخدام HTTPS',click_send_disabled:'إرسال Click غير مفعّل لهذه الشركة',click_auth_failed:'فشل اعتماد Click عند الإرسال؛ لم تُعتمد الشحنة',click_send_rejected:'رفض Click طلب الإنشاء؛ راجع بيانات الشحنة',click_response_too_large:'استجابة Click أكبر من الحد المسموح',click_invalid_json:'استجابة Click غير صالحة',click_transport_unavailable:'تعذر الاتصال بـClick',invalid_click_client_serial:'مرجع الشحنة أطول من 25 حرفاً؛ قصّره أو أعد توليده',invalid_click_order_ref:'مرجع شحنة Click غير صالح',invalid_click_user_id:'User_ID الخاص بـClick غير صالح'};
  if(messages[e?.message])fail('invalid-argument',messages[e.message]);
  if(e?.code==='auth/email-already-exists')fail('already-exists','البريد الإلكتروني مستخدم بالفعل');
  if(e?.code==='auth/user-not-found')fail('unauthenticated','انتهت الجلسة أو الحساب غير موجود؛ سجّل الدخول من جديد');
  if(['delivery_host_not_allowed','kms_not_configured','kms_not_configured_or_bad_secret','unsupported_delivery_provider'].includes(e?.message))fail('failed-precondition','إعداد شركة التوصيل أو خدمة تشفير مفاتيحها غير مكتمل؛ راجع إعدادات المؤسسة');
  if(['click_contract_incomplete','click_requires_dedicated_adapter'].includes(e?.message))fail('failed-precondition','تكامل Click Delivery غير مفعّل: نحتاج استجابات API وأكواد الحالات وعقد المبالغ قبل تشغيله');
  if(e?.message==='invalid_click_url')fail('invalid-argument','رابط Click Delivery يجب أن يطابق العنوان الموثق للشركة');
  logger.error('velnix.error',{code:e?.code||'unknown'});
  fail('internal','تعذر إتمام العملية؛ أعد المحاولة أو راجع المسؤول');
}

const joins=require('./join_requests')({db,auth:getAuth(),FieldValue,FieldPath,requireAuth,currentActor,audit,fail});
for(const [name,handler] of Object.entries(joins))exports[name]=callable(handler);

const pages=require('./pages')({db,FieldValue,FieldPath,requireAuth,currentActor,audit,fail});
for(const [name,handler] of Object.entries(pages))exports[name]=callable(handler);

const bulk=require('./bulk')({db,auth:getAuth(),FieldValue,requireAuth,currentActor,audit,fail,requiredPerm,logger,applyStatusChange,applyCompanyAssignment,runDispatch:dispatchOrder,orderForUser});
for(const [name,handler] of Object.entries(bulk))if(typeof handler==='function')exports[name]=callable(handler);

exports.me=callable(async req=>{const user=await requireAuth(req);return {id:user.id,name:user.name,role:user.role,active:user.active,permissions:user.permissions||[],salesSupervisorId:user.salesSupervisorId||null,allowedPageIds:user.allowedPageIds||[],email:user.email||''};});
exports.listOrders=callable(async req=>{
  const user=await requireAuth(req);
  const size=Math.max(1,Math.min(50,Math.floor(Number(req.data?.pageSize)||30)));
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  const canViewAmounts=user.role==='generalManager'||can(user,'viewAmounts');
  if(!canViewAmounts){filters.amountMin=null;filters.amountMax=null;}
  const sort=req.data?.sort||'desc';if(!['asc','desc'].includes(sort))fail('invalid-argument','ترتيب غير صالح');
  // In-memory filters (city/area/dispatch/amount) may exclude many scanned docs,
  // so keep scanning in bounded chunks until the page is full or the data ends.
  // `afterId` is the last RAW document consumed (matched or not) so pagination
  // never skips or repeats: the client resumes exactly where scanning stopped.
  let previous=null;if(req.data?.afterId)previous=(await oneOrder(user,req.data.afterId)).snap;
  const CHUNK=Math.max(size,100);
  const MAX_SCAN=2000; // safety cap per call; continuation is still possible
  const queries=scopeQueries(user,filters);
  const collected=[];
  let scanned=0, exhausted=false, lastRaw=null;
  while(collected.length<size&&!exhausted&&scanned<MAX_SCAN){
    const results=await Promise.all(queries.map(base=>{
      let query=base.orderBy('createdAt',sort).orderBy(FieldPath.documentId(),sort).limit(CHUNK);
      if(previous)query=query.startAfter(previous);
      return query.get();
    }));
    const batch=results.flatMap(r=>r.docs);
    if(!batch.length){exhausted=true;break;}
    batch.sort((a,b)=>{const t=(a.data().createdAt?.toMillis?.()||0)-(b.data().createdAt?.toMillis?.()||0);const c=t||(a.id===b.id?0:a.id>b.id?1:-1);return c*(sort==='desc'?-1:1);});
    let broke=false;
    for(const d of batch){
      lastRaw=d;scanned++;
      if(canSeeOrder(user,d.data())&&matchingFilters(d.data(),filters))collected.push(d);
      previous=d;
      if(collected.length>=size){broke=true;break;}
    }
    // Only claim the data is exhausted when every scope returned a short chunk
    // AND we consumed the whole merged batch (not stopped early on a full page).
    if(!broke&&results.every(r=>r.size<CHUNK))exhausted=true;
  }
  const page=collected.slice(0,size);
  // `more` is true when a full page was returned, when the scan cap was reached
  // (there may still be unread data), or when the data is not exhausted. Never
  // report the end of the list while a cursor can continue.
  const capReached=scanned>=MAX_SCAN;
  const more=collected.length>size||capReached||(!exhausted&&lastRaw!=null);
  return {items:page.map(d=>orderForUser(user,d)),nextAfterId:more&&lastRaw?lastRaw.id:null,limited:capReached};
});
// Authenticated server-side search; never scan only the client's loaded page.
// Indexed exact phone / Arabic-normalized name prefix / exact document ID.
// Authenticated server-side search with stable pagination. Every candidate MUST
// pass canSeeOrder + matchingFilters + a strict query match. Results are sorted
// by (createdAt desc, id) and paged with an opaque cursor so more than 50
// matches can be browsed without loading them all in one call.
exports.searchOrders=callable(async req=>{
  const user=await requireAuth(req);
  const query=str(req.data?.query,120),needle=normalizeCustomer(query),digits=searchDigits(query);
  if(query.length<2)fail('invalid-argument','اكتب حرفين على الأقل للبحث');
  let filters;try{filters=parseFilters(req.data);}catch(e){return firebaseError(e);}
  if((filters.amountMin!=null||filters.amountMax!=null)&&!(user.role==='generalManager'||can(user,'viewAmounts')))fail('permission-denied','لا يمكنك التصفية حسب المبلغ');
  const {normalizeSearch,tokenize}=require('./search');
  const sort=req.data?.sort==='asc'?'asc':'desc';
  // A cursor is bound to the exact search conditions. Reusing it with a different
  // query/filters/sort is rejected so a stale cursor can never mix result sets.
  const cursorKey=fingerprintSearch(query,filters,sort,req.data?.companyId||null,req.data?.bucket||'all',req.data?.status||null);
  const searchPrefix=normalizeSearch(query);
  const tokens=tokenize(query);
  const pageSize=Math.max(1,Math.min(50,Math.floor(Number(req.data?.pageSize)||30)));
  const matchesQuery=(d)=>{
    if(tokens.length===0)return true;
    const orderTokens=Array.isArray(d.searchTokens)?d.searchTokens:[];
    const text=typeof d.searchText==='string'?d.searchText:'';
    if(searchPrefix&&text.startsWith(searchPrefix))return true;
    if(needle&&typeof d.customerKey==='string'&&d.customerKey.startsWith(needle))return true;
    if(digits.length>=5&&typeof d.phoneDigits==='string'&&d.phoneDigits.startsWith(digits))return true;
    if(digits.length>=5&&typeof d.phoneDigits==='string'&&d.phoneDigits.includes(digits))return true;
    return tokens.every(t=>orderTokens.some(ot=>typeof ot==='string'&&ot.startsWith(t)));
  };
  const scopes=scopeQueries(user,filters);
  // Every sub-query is an `array-contains` (or equality) predicate ordered by
  // (createdAt, id), so it pages with a TRUE Firestore cursor. No in-memory
  // re-scan of the first page on every page.
  const subs=[];
  const addSub=(key,builder,opts={})=>subs.push({key,builder,exact:opts.exact===true});
  const upper=query.toUpperCase();
  const orderNumber=upper.startsWith('VNX-')?upper:null;
  if(orderNumber){
    addSub('num',()=>db.collection('orders').where('orderNumber','==',orderNumber),{exact:true});
    addSub('bc',()=>db.collection('orders').where('barcodeValue','==',orderNumber),{exact:true});
    addSub('bc2',()=>db.collection('orders').where('barcodeValue','==','VNX-'+query.slice(4)),{exact:true});
  }
  addSub('clickref',()=>db.collection('orders').where('clickOrderRef','==',query),{exact:true});
  addSub('track',()=>db.collection('orders').where('trackingNumber','==',query),{exact:true});
  for(let si=0;si<scopes.length;si++){
    const base=scopes[si];
    if(digits.length>=5){
      addSub('ph'+si,()=>base.where('phoneDigits','==',digits));
      addSub('phs'+si,()=>base.where('searchPhoneSuffixes','array-contains',digits.slice(-Math.min(digits.length,12))));
    }
    // Full normalized name prefix and any-word prefixes are stored as tokens.
    if(searchPrefix.length>=2){
      addSub('sp'+si,()=>base.where('searchPrefixes','array-contains',searchPrefix));
      for(const token of tokens.filter(t=>t.length>=2).slice(0,4))addSub('spk'+si+':'+token,()=>base.where('searchPrefixes','array-contains',token));
    }
    for(const token of tokens.filter(t=>t.length>=4&&t!=='vnx').slice(0,4))addSub('tk'+si+':'+token,()=>base.where('searchTokens','array-contains',token));
  }
  const cursor=cursorFromRequest(req.data?.cursor,cursorKey,pageSize,sort,req.data?.direction);
  const PER=Math.max(pageSize,30);
  const STEP=Math.max(pageSize*4,120); // per-sub-query batch per page
  const matches=new Map();
  const accept=(doc,{strict=true}={})=>{
    if(!doc.exists)return;
    const d=doc.data();
    if(!canSeeOrder(user,{...d,id:doc.id})||!matchingFilters(d,filters))return;
    if(strict&&!matchesQuery(d))return;
    matches.set(doc.id,doc);
  };
  // Direct document-id hit (cheap, always included).
  const documentId=query.startsWith('VNX-')?query.slice(4):query;
  if(/^[a-zA-Z0-9_-]{8,140}$/.test(documentId))accept(await db.doc(`orders/${documentId}`).get(),{strict:false});
  // Each sub-query is ordered by (createdAt, documentId) and paged with a TRUE
  // Firestore compound cursor (startAfter(timestamp, docId)). This preserves ties
  // that share the same createdAt instead of dropping them.
  // Every sub-query shares the SAME (createdAt, documentId) order, so a single
  // global compound cursor (startAfter(timestamp, docId)) pages them all with no
  // loss — including ties with the same createdAt. `limit(STEP)` fetches enough
  // candidates past the boundary; the boundary filter removes anything already
  // returned (dedup across sub-queries).
  const g0=cursor.g;
  let anySubHasMore=false;
  for(const sub of subs){
    let q=sub.builder().orderBy('createdAt',sort).orderBy(FieldPath.documentId(),sort);
    if(g0)q=q.startAfter(Timestamp.fromMillis(g0.c),g0.i);
    q=q.limit(STEP);
    const snap=await q.get();
    for(const doc of snap.docs)accept(doc,{strict:!sub.exact});
    if(snap.size>=STEP)anySubHasMore=true;
  }
  const all=[...matches.values()];
  all.sort((a,b)=>{
    const at=a.data().createdAt?.toMillis?.()||0,bt=b.data().createdAt?.toMillis?.()||0;
    if(at!==bt)return sort==='asc'?(at-bt):(bt-at);
    if(a.id===b.id)return 0;
    return (a.id>b.id?1:-1)*(sort==='asc'?1:-1);
  });
  // Global (createdAt,id) boundary from the previous page removes any duplicate
  // that two sub-queries might both surface — without dropping same-timestamp
  // records (the boundary is inclusive of the id tie-break).
  const g=cursor.g;
  const afterBoundary=(d)=>{
    if(!g)return true;
    const c=d.data().createdAt?.toMillis?.()||0;
    if(sort==='desc')return c<g.c||(c===g.c&&d.id<g.i);
    return c>g.c||(c===g.c&&d.id>g.i);
  };
  const filtered=all.filter(afterBoundary);
  const page=filtered.slice(0,pageSize);
  const last=page.at(-1);
  // Accurate end detection: there is more only if a full page was returned AND
  // (a sub-query still has data OR the current window had extra matches).
  const hasMore=page.length===pageSize&&(anySubHasMore||filtered.length>pageSize);
  const nextCursor=hasMore?encodeCursor({
    key:cursorKey,
    sort,
    pageSize,
    direction:req.data?.direction??null,
    g:last?{c:last.data().createdAt?.toMillis?.()||0,i:last.id}:null,
  }):null;
  return {
    items:page.map(d=>orderForUser(user,d)),
    nextCursor,
    limited:anySubHasMore,
  };
});
// Binds a pagination cursor to the exact search conditions.
function fingerprintSearch(query,filters,sort,companyId,bucket,status){
  const norm=JSON.stringify({q:query,f:{...filters,from:filters.from?filters.from.toISOString():null,to:filters.to?filters.to.toISOString():null},sort,companyId,bucket,status});
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0,32);
}
// Reads + validates a cursor; rejects reuse with different search conditions.
function cursorFromRequest(raw,key,pageSize,sort,direction){
  const empty={key,sort,pageSize,g:null,subs:{}};
  if(typeof raw!=='string'||raw.length===0)return empty;
  let d=null;
  try{d=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch(e){fail('invalid-argument','مؤشر البحث غير صالح؛ أعد تنفيذ البحث');}
  if(!d||typeof d!=='object'||Array.isArray(d))fail('invalid-argument','مؤشر البحث غير صالح؛ أعد تنفيذ البحث');
  // A structurally valid cursor that belongs to a DIFFERENT search (query,
  // filters, sort, page size or direction) is rejected explicitly — never
  // silently restarted from page one.
  if(d.key!==key||d.sort!==sort||d.pageSize!==pageSize||(d.direction??null)!==(direction??null)){
    fail('invalid-argument','مؤشر البحث لا يطابق معايير البحث الحالية؛ أعد البحث');
  }
  const subs={};
  for(const [k,v] of Object.entries(d.subs||{})){
    if(typeof k==='string'&&k.length<=80&&v&&Number.isFinite(v.c)&&typeof v.i==='string'&&v.i.length<=140)subs[k]={c:v.c,i:v.i};
  }
  const g=(d.g&&Number.isFinite(d.g.c)&&typeof d.g.i==='string'&&d.g.i.length<=140)?{c:d.g.c,i:d.g.i}:null;
  return {key,sort,pageSize,g,subs};
}
function encodeCursor({key,sort,pageSize,direction,g,subs}){return Buffer.from(JSON.stringify({key,sort,pageSize,direction,g,subs}),'utf8').toString('base64url');}
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
// Batch DTO fetch for a set of ids. Each order is permission-checked and only
// visible ones are returned (unauthorized ids are silently omitted). Amounts are
// hidden by orderForUser when the caller lacks viewAmounts. Bounded to 60 ids.
exports.getOrdersByIds=callable(async req=>{
  const user=await requireAuth(req);
  const raw=Array.isArray(req.data?.ids)?req.data.ids:[];
  if(raw.length===0)return {items:[]};
  if(raw.length>60)fail('invalid-argument','الحد الأقصى 60 طلباً في الطلب الواحد');
  const ids=[...new Set(raw.map(v=>idValue(v)))];
  const refs=ids.map(id=>db.doc('orders/'+id));
  const snaps=await db.getAll(...refs);
  const items=[];
  for(const snap of snaps){
    if(!snap.exists)continue;
    const d=snap.data();
    if(!canSeeOrder(user,{...d,id:snap.id}))continue;
    const order=orderForUser(user,snap);
    if(order.companyId){const company=await db.doc('companies/'+order.companyId).get();order.companyName=company.data()?.name||null;order.companyProvider=company.data()?.provider||null;}
    items.push(order);
  }
  return {items};
});
// Resolves the electronic page for a new/edited order. Returns the immutable
// pageId plus a small snapshot. Throws when the page is missing, archived or
// outside the caller's allowed set (server-side enforcement; hiding the option
// in the UI is never sufficient).
async function resolveOrderPage(user,pageIdRaw){
  const pageId=idValue(pageIdRaw);
  const snap=await db.doc('pages/'+pageId).get();
  if(!snap.exists)fail('failed-precondition','الصفحة الإلكترونية غير موجودة');
  const page=snap.data();
  if(page.archived===true)fail('failed-precondition','لا يمكن استخدام صفحة مؤرشفة لإنشاء طلب');
  if(page.active===false)fail('failed-precondition','لا يمكن استخدام صفحة معطلة لإنشاء طلب');
  // Only the general manager is exempt. Holding managePages grants administration
  // of pages, NOT the right to create orders for a page that is not on the
  // employee's allowed list. This is enforced server-side.
  if(user.role!=='generalManager'){
    const allowed=Array.isArray(user.allowedPageIds)?user.allowedPageIds:[];
    if(!allowed.includes(pageId))fail('permission-denied','هذه الصفحة الإلكترونية غير مصرح لك بها');
  }
  return {pageId,pageName:page.name||'',pageFacebookUrl:page.facebookUrl||''};
}
// Optional delivery company chosen at creation time. Assigning here does NOT
// send the shipment; sending stays an explicit, separately guarded action.
async function resolveOrderCompany(companyIdRaw){
  if(companyIdRaw==null)return null;
  const companyId=idValue(companyIdRaw);
  const snap=await db.doc('companies/'+companyId).get();
  if(!snap.exists)fail('failed-precondition','شركة التوصيل غير موجودة');
  const c=snap.data();
  if(c.enabled!==true||c.archived===true)fail('failed-precondition','شركة التوصيل غير مفعلة');
  return companyId;
}
// Validates and de-duplicates an employee's allowed page ids. Unknown page ids
// are rejected so a client cannot attach a page that does not exist.
async function resolveAllowedPageIds(raw){
  if(raw==null)return [];
  if(!Array.isArray(raw)||raw.length>200)fail('invalid-argument','قائمة الصفحات المسموحة غير صالحة');
  const ids=[...new Set(raw.map(idValue))];
  if(!ids.length)return [];
  const refs=ids.map(id=>db.doc('pages/'+id));
  const snaps=await db.getAll(...refs);
  if(snaps.some(s=>!s.exists))fail('invalid-argument','إحدى الصفحات المحددة غير موجودة');
  return ids;
}
exports.createOrder=callable(async req=>{
  const user=await requireAuth(req);if(!user.active)fail('permission-denied','الحساب معطل');
  let fields;try{fields=validateOrderFields(req.data||{});}catch(e){return firebaseError(e);}
  // The electronic page is mandatory for new orders and must be an active page
  // the caller is allowed to use. The snapshot is copied onto the order so
  // history and printing survive later page renames/archival.
  const pageSnapshot=await resolveOrderPage(user,req.data?.pageId);
  const companyId=await resolveOrderCompany(req.data?.companyId);
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
  // The idempotency hash must cover every field that defines the order's
  // identity/content, including the electronic page, the delivery company and
  // the order type. Reusing the same requestKey with a different page/company/
  // type is a genuine conflict, never a silent return of the old order.
  const payloadHash=crypto.createHash('sha256').update(JSON.stringify({
    ...fields,
    pageId:pageSnapshot.pageId,
    companyId:companyId||null,
  })).digest('hex');
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
    const counterRef=db.doc('settings/orderCounter');
    const counter=await tx.get(counterRef);
    const nextNumber=Number(counter.data()?.value||0)+1;
    if(!Number.isSafeInteger(nextNumber)||nextNumber>999999)fail('resource-exhausted','نفد نطاق أرقام الطلبات');
    const orderNumber=`VNX-${String(nextNumber).padStart(6,'0')}`;
    tx.set(counterRef,{value:nextNumber,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(ref,{...fields,orderNumber,barcodeValue:`VNX-${ref.id}`,createdBy:user.id,createdByName:user.name,createdByRole:user.role,
      salesSupervisorId:user.role==='dataEntry'?user.salesSupervisorId||null:null,visibleTo,
      ...pageSnapshot,
      ...buildSearchFields({...fields,orderNumber,barcodeValue:`VNX-${ref.id}`,...pageSnapshot}),
      companyId:companyId||null,hasDelivery:companyId!=null,revision:0,status:'created',trackingNumber:null,remoteStatus:null,
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
    fields=validateOrderFields(payload,{legacyCity:old.city});
  }catch(e){return firebaseError(e);}
  // Page: keep the order's existing snapshot unless a new permitted page is
  // supplied. Legacy orders without a page stay valid and unmodified.
  const existingPageId=snap.data().pageId;
  const pageSnapshot=req.data?.pageId!=null
    ? await resolveOrderPage(user,req.data.pageId)
    : existingPageId
      ? {pageId:existingPageId,pageName:snap.data().pageName||'',pageFacebookUrl:snap.data().pageFacebookUrl||''}
      : {};
  fields.phoneDigits=fields.phone.replace(/\D/g,'');
  fields.customerKey=normalizeCustomer(fields.customer);
  const old=snap.data();
  // Recompute derived search fields on edit; keep the immutable identifiers.
  const searchFields=buildSearchFields({...fields,orderNumber:old.orderNumber,barcodeValue:old.barcodeValue||`VNX/${ref.id}`,...pageSnapshot,
    clickOrderRef:old.clickOrderRef,trackingNumber:old.trackingNumber,providerOrderId:old.providerOrderId});
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);if(!latest.exists)fail('not-found','الطلب غير موجود');
    if(!Number.isSafeInteger(req.data?.revision)||req.data.revision!==(latest.data().revision||0))fail('aborted','تم تعديل الطلب بواسطة مستخدم آخر؛ أعد تحميله');
    if(!canEditOrder(user,latest.data()))fail('failed-precondition','تغيّرت حالة الطلب');
    if(user.role!=='generalManager'&&!can(user,'viewAmounts')&&latest.data().createdBy!==user.id)fields.amountMinor=latest.data().amountMinor;
    tx.update(ref,{...fields,...pageSnapshot,...searchFields,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'edited',user,{},tx);await audit('order.edited',user,ref.id,{},tx);
  });return {ok:true};
});
exports.changeOrderStatus=callable(async req=>{
  const user=await requireAuth(req);const {ref}=await oneOrder(user,req.data?.id);
  const target=str(req.data?.status,30);
  return applyStatusChange(ref,user,target);
});
exports.assignCompany=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');const {ref}=await oneOrder(user,req.data?.id);
  const id=req.data?.companyId == null?null:idValue(req.data.companyId);
  if(id){const company=await db.collection('companies').doc(id).get();if(!company.exists||company.data().archived||!company.data().enabled)fail('failed-precondition','شركة التوصيل غير مفعلة');}
  return applyCompanyAssignment(ref,user,id);
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
  const name=str(req.data?.name,140);
  const provider=req.data?.provider;
  const rawApiUrl=str(req.data?.apiUrl,300);
  // Click has one exact pinned HTTPS base and is validated by assertClickUrl.
  // The generic host allowlist is only for generic_v1; a missing deployment
  // allowlist must not block saving or activating the already-verified Click
  // company.
  const apiUrl=provider===CLICK_PROVIDER?rawApiUrl:allowedUrl(rawApiUrl);
  if(typeof req.data?.enabled!=='boolean')fail('invalid-argument','حدد حالة تفعيل الشركة صراحةً');
  if(!req.data?.statusMap||typeof req.data.statusMap!=='object'||Array.isArray(req.data.statusMap))fail('invalid-argument','حدد خريطة حالات الشركة صراحةً');
  const patch={};
  if(!['generic_v1',CLICK_PROVIDER].includes(provider))fail('invalid-argument','اختر محول شركة التوصيل المتاح');
  providerFor({provider,apiUrl});
  let clickUserId=null,clickSendEnabled=null;
  if(provider===CLICK_PROVIDER){
    if(req.data?.apiToken||req.data?.webhookKey||Object.keys(req.data?.statusMap||{}).length)fail('invalid-argument','لا تستخدم token أو webhook أو أكواد حالات generic مع Click Delivery');
    if(req.data?.clickUserId!=null){
      clickUserId=Number(req.data.clickUserId);
      if(!Number.isSafeInteger(clickUserId)||clickUserId<1||clickUserId>2147483647)fail('invalid-argument','User_ID الخاص بـClick غير صالح');
    }
    if(req.data?.clickSendEnabled===true){
      if(!CLICK_SEND_ALLOWED_COMPANY_IDS.has(id))fail('failed-precondition','إرسال Click غير مصرح لهذه الشركة');
      clickSendEnabled=true;
    }else if(req.data?.clickSendEnabled===false)clickSendEnabled=false;
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
    if(provider===CLICK_PROVIDER){
      const effectiveUserId=clickUserId??Number(existing.data()?.clickUserId);
      if(!Number.isSafeInteger(effectiveUserId)||effectiveUserId<1)fail('failed-precondition','أدخل User_ID الخاص بـClick قبل تفعيل الشركة');
    }else{
      if(Object.keys(statusMap).length===0)fail('failed-precondition','اربط حالات التوصيل قبل تفعيل الشركة');
      const savedSecrets=await db.doc(`companySecrets/${id}`).get();
      if(!patch.apiTokenCiphertext&&!savedSecrets.data()?.apiTokenCiphertext)fail('failed-precondition','أدخل مفتاح API قبل تفعيل الشركة');
    }
  }
  if(provider===CLICK_PROVIDER&&clickSendEnabled===true){
    const savedSecrets=await db.doc(`companySecrets/${id}`).get();
    const hasUser=patch.clickUserNameCiphertext||savedSecrets.data()?.clickUserNameCiphertext;
    const hasPass=patch.clickUserPassCiphertext||savedSecrets.data()?.clickUserPassCiphertext;
    if(!hasUser||!hasPass)fail('failed-precondition','أدخل اعتماد Click قبل تفعيل الإرسال');
  }
  const newData={name,apiUrl,provider,enabled:req.data.enabled,
    ...(!existing.exists?{archived:false}:{}),statusMap,
    ...(provider===CLICK_PROVIDER&&clickUserId!==null?{clickUserId}:{}),
    ...(provider===CLICK_PROVIDER&&clickSendEnabled!==null?{clickSendEnabled}:{}),
    ...(provider===CLICK_PROVIDER&&!existing.exists&&clickSendEnabled===null?{clickSendEnabled:false}:{}),updatedAt:FieldValue.serverTimestamp()};
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(ref);
    if(latest.exists&&latest.data().provider!==provider)fail('failed-precondition','تغيّر محول الشركة؛ أعد تحميلها');
    if(latest.exists&&latest.data().archived)fail('failed-precondition','استعد الشركة المؤرشفة قبل تعديلها');
    tx.set(ref,newData,{merge:true});
    if(Object.keys(patch).length)tx.set(db.doc('companySecrets/'+id),patch,{merge:true});
    await audit('company.saved',user,id,{name,enabled:req.data.enabled},tx);
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
function clickHealthMessage(e){
  if(e?.message==='click_user_id_missing')return 'لم يُضبط User_ID لحساب Click؛ احفظ الإعداد أولاً';
  if(e?.message==='click_health_no_linked_order')return 'لا توجد شحنة Click مرتبطة بهذه الشركة لاختبار القراءة؛ اربط شحنة موجودة من البوابة أولاً';
  if(e?.message==='invalid_click_url')return 'رابط Click Delivery لا يطابق العنوان الموثق للشركة';
  if(e?.httpStatus)return `تعذر قراءة شحنة Click (HTTP ${e.httpStatus})؛ لم يتم إنشاء أو تعديل أي شحنة`;
  return 'تعذر الاتصال بـClick عبر getorder؛ تحقق من الشبكة وUser_ID';
}
async function testClickHealth(companyId,company){
  const userId=Number(company.clickUserId);
  if(!Number.isSafeInteger(userId)||userId<1)throw Error('click_user_id_missing');
  const snap=await db.collection('orders').where('companyId','==',companyId).limit(50).get();
  const linked=snap.docs.map(d=>d.data()).filter(o=>typeof o.clickOrderRef==='string'&&o.clickOrderRef.trim())
    .sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0))[0];
  if(!linked)throw Error('click_health_no_linked_order');
  const {status}=await readClickOrder(company,linked.clickOrderRef.trim(),userId);
  if(status!==200){const e=Error('click_health_http_error');e.httpStatus=status;throw e;}
  return {httpStatus:status};
}
exports.testCompanyConnection=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageCompanies');
  const id=idValue(req.data?.id);const {company,secrets}=await companyCredentials(id,{allowInactive:true});
  try{
    if(company.provider===CLICK_PROVIDER){
      const result=await testClickHealth(id,company);
      await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp(),lastHealthConnected:true,lastHealthError:null});
      return {connected:true,provider:company.provider,serviceStatus:'ok',verified:'getorder',httpStatus:result.httpStatus};
    }
    requireOperationalProvider(company);
    const json=await providerFor(company).health(company,await decryptSecret(secrets.apiTokenCiphertext));
    await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp(),lastHealthConnected:true,lastHealthError:null});
    return {connected:true,provider:company.provider,serviceStatus:'ok'};
  }catch(e){
    const error=company.provider===CLICK_PROVIDER?clickHealthMessage(e):'فشل اختبار الاتصال بالمزود؛ تحقق من إعداداته';
    await db.doc(`companies/${id}`).update({lastHealthCheck:FieldValue.serverTimestamp(),lastHealthConnected:false,lastHealthError:error});
    logger.warn('delivery health check failed',{companyId:id,code:e.code||e.message||'unknown',httpStatus:e.httpStatus||null});
    return {connected:false,error};
  }
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
    if(company.clickSendEnabled!==true||!CLICK_SEND_ALLOWED_COMPANY_IDS.has(order.companyId))throw Error('click_send_disabled');
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
// Core single-order dispatch flow. Shared by sendOrderToDelivery and the bulk
// dispatch operation so both honor the exact same lock/idempotency/needs_review
// protections. `user` must already hold sendToDelivery.
async function dispatchOrder(ref,user){
  // Enforce the permission inside the shared flow so bulkDispatch (and any
  // future caller) cannot reach an external send without sendToDelivery.
  requiredPerm(user,'sendToDelivery');
  const lockId=crypto.randomUUID();
  let snapshot;
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const doc=await tx.get(ref),o=doc.data();
    if(!o)fail('not-found','الطلب غير موجود');
    if(!canSeeOrder(user,{...o,id:ref.id}))fail('permission-denied','لا يمكن الوصول للطلب');
    if(o.status!=='ready'||!o.companyId)fail('failed-precondition','الطلب غير جاهز للشحن');
    if(o.dispatchState==='needs_review')fail('failed-precondition','نتيجة الإرسال السابقة غير مؤكدة. تحقق من شركة التوصيل أولاً لمنع شحنة مكررة.');
    if(o.dispatchState==='sent')fail('failed-precondition','الطلب أُرسل بالفعل');
    // A timed-out request may have reached the vendor: never auto-resend it.
    if(o.dispatchState==='sending')fail('failed-precondition','يوجد إرسال سابق يحتاج مراجعة إذا لم يكتمل');
    const company=await tx.get(db.doc('companies/'+o.companyId));
    const c=company.data();
    if(!company.exists||!c)fail('failed-precondition','شركة التوصيل غير موجودة');
    if(c.provider===CLICK_PROVIDER){
      if(c.archived===true||c.clickSendEnabled!==true||!CLICK_SEND_ALLOWED_COMPANY_IDS.has(o.companyId))fail('failed-precondition','إرسال Click غير مفعّل لهذه الشركة');
      // Only a normal order maps to a plain Click setorder. Return / exchange /
      // partial-receipt orders have no confirmed Click contract, so they must be
      // managed inside Velnix and never sent in a misleading payload.
      if((o.orderType||'normal')!=='normal')fail('failed-precondition','لا يمكن إرسال هذا النوع من الطلبات إلى Click؛ إدارته تتم داخل Velnix حتى تثبيت العقد');
    }else{
      if(c.archived||c.enabled!==true)fail('failed-precondition','شركة التوصيل غير مفعلة؛ لم يبدأ إرسال الشحنة');
      requireOperationalProvider(c);
    }
    snapshot={...o,id:ref.id};
    // Persist the deterministic Click merchant reference BEFORE the vendor call
    // so any outcome (transport error, timeout, ambiguous/rejected response) can
    // still be reconciled with a read-only getorder later. Click's Client_Serial
    // is `VNX-<docId>` by default (see clickClientSerial), so it is known up
    // front and never depends on the response.
    const preRef=c.provider===CLICK_PROVIDER
      ? (typeof o.clickOrderRef==='string'&&o.clickOrderRef.trim()?o.clickOrderRef.trim():`VNX-${ref.id}`)
      : null;
    tx.update(ref,{dispatchState:'sending',dispatchLockId:lockId,dispatchLockUntil:Timestamp.fromMillis(Date.now()+90000),
      // Schedule a verification pass shortly after the lock expires so the
      // scheduler can recover an interrupted send even if this instance dies.
      nextClickSyncAt:Timestamp.fromMillis(Date.now()+95000),
      ...(preRef?{clickOrderRef:preRef}:{})});
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
    // Log the real internal reason safely (message only; no credentials, no
    // customer data, no KMS material) plus the phase, so an operator can tell a
    // pre-send configuration/KMS failure apart from an uncertain carrier call.
    logger.error('delivery dispatch failed',{id:ref.id,code:e.code||'unknown',phase:vendorAttempted?'vendor':'pre_send',reason:typeof e.message==='string'?e.message.slice(0,200):'unknown'});
    await db.runTransaction(async tx=>{const o=await tx.get(ref);
      if(o.data()?.dispatchLockId===lockId){
        // Click can create a shipment and still answer HTTP 400 (observed
        // 2026-10-19). The adapter signals that exact case so the UI keeps a
        // Click-specific review message and the exact merchant reference for
        // the later reconcile/sync instead of a generic transport message.
        const clickAmbiguous=vendorAttempted&&e?.code==='click_ambiguous_creation';
        const clickRef=typeof e?.clickOrderRef==='string'?e.clickOrderRef:null;
        const clickSerial=typeof e?.clickClientSerial==='string'?e.clickClientSerial:null;
        const failure=vendorAttempted?{dispatchState:'needs_review',nextClickSyncAt:Timestamp.now(),...(clickRef?{clickOrderRef:clickRef}:{}),...(clickSerial?{clickClientSerial:clickSerial}:{}),syncError:clickAmbiguous?'Click قد يكون أنشأ الشحنة رغم رد غير محسوم. تحقق من البوابة أولاً واربط رقم الشحنة الموجود قبل أي إعادة إرسال.':'نتيجة إرسال الشحنة غير مؤكدة. تحقق من شركة التوصيل قبل أي محاولة أخرى، فقد تكون الشحنة قد أُنشئت.'}:{dispatchState:'idle',syncError:'تعذر تجهيز اتصال شركة التوصيل. لم تبدأ محاولة الإرسال. راجع المسؤول.'};
        tx.update(ref,{...failure,dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete()});
        const action=vendorAttempted?'dispatch_attempt_failed':'dispatch_preparation_failed';
        await addEvent(ref.id,action,user,{},tx);await audit('order.'+action,user,ref.id,{},tx);
      }
    });
    fail(vendorAttempted?'unavailable':'failed-precondition',vendorAttempted?'نتيجة الإرسال غير مؤكدة. يجري التحقق من الشحنة، ولا يلزم إعادة الإرسال.':'تعذر تجهيز اتصال شركة التوصيل. لم تبدأ محاولة الإرسال. راجع المسؤول.');
  }
}
exports.sendOrderToDelivery=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);
  return dispatchOrder(ref,user);
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
async function syncClickOrderForRef(ref,actor,{source='manual',checkActor=null}={}){
  const lockId=crypto.randomUUID();
  let snapshot;
  await db.runTransaction(async tx=>{
    if(checkActor)await currentActor(tx,checkActor);
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
    snapshot={...o,id:ref.id,clickOrderRef,clickUserId,clickSyncFailures:Number.isSafeInteger(o.clickSyncFailures)?o.clickSyncFailures:0,company:{...c,id:o.companyId}};
  });
  let parsed;
  try {
    const {status,json}=await readClickOrder(snapshot.company,snapshot.clickOrderRef,snapshot.clickUserId);
    if(status!==200){const e=new Error(`click_http_${status}`);e.reason=`http_${status}`;throw e;}
    parsed=parseClickOrderResponse(json);
    if(!parsed.ok){const e=new Error('click_response_'+parsed.reason);e.reason=parsed.reason;throw e;}
  } catch(e) {
    const reason=typeof e?.reason==='string'?e.reason:(typeof e?.name==='string'?e.name:'transport_error');
    const failures=snapshot.clickSyncFailures+1;
    const backoffMinutes=Math.min(15*Math.pow(2,Math.min(failures-1,4)),240);
    // A reason-aware, non-technical message so the UI can tell the cases apart.
    const reasonMessage=reason==='unknown_status'
      ? 'وصلت حالة غير معروفة من شركة التوصيل وتحتاج تحققًا. لم تُعدّل الحالة المحلية.'
      : (reason.startsWith('http_')||reason==='transport_error'||reason==='AbortError'||reason==='click_sync_locked')
      ? 'تعذر الاتصال بشركة التوصيل لمزامنة الحالة. ستُعاد المحاولة تلقائيًا.'
      : 'تعذرت مزامنة حالة الشحنة؛ لم تُعدّل الحالة المحلية وستُعاد المحاولة لاحقًا.';
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(current.data()?.clickSyncLockId===lockId){
        tx.update(ref,{clickSyncLockId:FieldValue.delete(),clickSyncLockUntil:FieldValue.delete(),lastSyncAttemptAt:FieldValue.serverTimestamp(),
          nextClickSyncAt:Timestamp.fromMillis(Date.now()+backoffMinutes*60*1000),clickSyncFailures:FieldValue.increment(1),
          syncError:reasonMessage});
        await addEvent(ref.id,'click_sync_failed',actor,{reason,source},tx);
        await audit('order.click_sync_failed',actor,ref.id,{reason,source},tx);
      }
    });
    logger.warn('click status sync failed',{id:ref.id,reason,source});
    fail('unavailable','تعذرت مزامنة حالة Click؛ لم تُعدّل الحالة المحلية.');
  }
  let applied=false,ignored=null;
  await db.runTransaction(async tx=>{
    if(checkActor)await currentActor(tx,checkActor);
    const current=await tx.get(ref),o=current.data();
    if(o?.clickSyncLockId!==lockId)fail('aborted','تغيّر قفل مزامنة Click');
    const now=FieldValue.serverTimestamp();
    const next=Timestamp.fromMillis(Date.now()+15*60*1000);
    const currentSource=o.shippingStatusSource;
    const currentMs=Number.isFinite(o.clickStatusDateMs)?o.clickStatusDateMs:null;
    const incomingMs=parsed.statusDateMs;
    const clearLock={clickSyncLockId:FieldValue.delete(),clickSyncLockUntil:FieldValue.delete(),lastSyncAttemptAt:now,lastSyncAt:now,syncError:null,clickSyncFailures:0,nextClickSyncAt:next};
    if(currentSource==='click_api'&&incomingMs===null){
      ignored='missing_status_date';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_conflict',actor,{rawStatus:parsed.rawStatus,statusDate:null,source},tx);
      await audit('order.click_status_conflict',actor,ref.id,{rawStatus:parsed.rawStatus,reason:'missing_status_date',source},tx);
      return;
    }
    if(currentSource==='click_api'&&currentMs!==null&&incomingMs!==null&&incomingMs<currentMs){
      ignored='stale_status';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_stale',actor,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,source},tx);
      await audit('order.click_status_stale',actor,ref.id,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,source},tx);
      return;
    }
    if(currentSource==='click_api'&&currentMs!==null&&incomingMs!==null&&incomingMs===currentMs&&o.shippingStatus!==parsed.shippingStatus){
      ignored='status_conflict';
      tx.update(ref,clearLock);
      await addEvent(ref.id,'click_status_conflict',actor,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,source},tx);
      await audit('order.click_status_conflict',actor,ref.id,{rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,source},tx);
      return;
    }
    const unchanged=currentSource==='click_api'&&o.shippingStatus===parsed.shippingStatus&&o.clickStatusDateMs===parsed.statusDateMs;
    const terminal=['delivered','cancelled'].includes(parsed.shippingStatus);
    const patch={...clearLock,nextClickSyncAt:terminal?null:next,shippingStatus:parsed.shippingStatus,shippingStatusSource:'click_api',
      shippingStatusUpdatedAt:parsed.statusDateMs!==null?Timestamp.fromMillis(parsed.statusDateMs):now,
      clickStatusRaw:parsed.rawStatus,clickStatusDate:parsed.statusDate,clickStatusDateMs:parsed.statusDateMs,clickStatusNote:parsed.note,clickAmounts:parsed.amounts,
      // Marks whether the exact label is API-confirmed (seen in a real Click
      // response) or only documented by the portal. Never a guessed meaning.
      clickStatusVerified:isApiConfirmed(parsed.shippingStatus),updatedAt:now};
    // A read-only getorder that returns a known status for THIS order proves the
    // shipment exists at Click (the read used our unique merchant reference).
    // That resolves an uncertain dispatch without ever creating a second
    // shipment and without inventing a policy number we did not receive.
    const resolvingReview=o.dispatchState==='needs_review';
    if(resolvingReview){
      patch.dispatchState='sent';
      patch.dispatchLockId=FieldValue.delete();
      patch.dispatchLockUntil=FieldValue.delete();
      patch.syncError=null;
      if(o.status==='ready')patch.status='dispatched';
    }
    if(!unchanged||resolvingReview){patch.revision=FieldValue.increment(1);applied=true;}
    tx.update(ref,patch);
    if(resolvingReview){
      await addEvent(ref.id,'dispatch_exception_resolved',actor,{outcome:'shipment_exists',rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,source},tx);
      await audit('order.dispatch_review_auto_resolved',actor,ref.id,{rawStatus:parsed.rawStatus,source},tx);
    }
    if(!unchanged){
      await addEvent(ref.id,'click_status_synced',actor,{rawStatus:parsed.rawStatus,shippingStatus:parsed.shippingStatus,statusDate:parsed.statusDate,source},tx);
      await audit('order.click_status_synced',actor,ref.id,{rawStatus:parsed.rawStatus,shippingStatus:parsed.shippingStatus,statusDate:parsed.statusDate,source},tx);
    }
  });
  return {ok:true,applied,ignored,shippingStatus:parsed.shippingStatus,rawStatus:parsed.rawStatus,statusDate:parsed.statusDate,note:parsed.note,amounts:parsed.amounts};
}
// Recovers a dispatch that was interrupted after the vendor call may have
// started (the function timed out, the instance died, or the client gave up).
// It NEVER re-sends: it only tries a read-only getorder using the reference
// persisted before the send, and falls back to a clear needs_review state.
// Returns 'resolved', 'needs_review' or 'skipped' (lock still live / not Click).
async function recoverStuckDispatch(ref,actor,{source='scheduled'}={}){
  const doc=await ref.get();const o=doc.data();
  if(!o)return 'skipped';
  if(o.dispatchState!=='sending')return 'skipped';
  const lockUntil=o.dispatchLockUntil?.toMillis?.()??0;
  // The lock (90s) must have expired before we touch an in-flight send.
  if(lockUntil>Date.now())return 'skipped';
  if(!o.companyId)return 'skipped';
  const company=await db.doc('companies/'+o.companyId).get();const c=company.data();
  if(!company.exists||!c)return 'skipped';
  const ref25=typeof o.clickOrderRef==='string'?o.clickOrderRef.trim():'';
  // For a Click order we can try a safe read-only verification when the exact
  // reference is known. Otherwise (or on any failure) we convert to a clear
  // review state so the UI is never stuck and no duplicate can be sent.
  if(c.provider===CLICK_PROVIDER&&ref25&&ref25.length<=25){
    const clickUserId=Number(c.clickUserId);
    if(Number.isSafeInteger(clickUserId)&&clickUserId>=1){
      try{
        const {status,json}=await readClickOrder({...c,id:o.companyId},ref25,clickUserId);
        if(status===200){
          const parsed=parseClickOrderResponse(json);
          if(parsed.ok){
            // The shipment exists at Click for our reference: resolve to sent.
            // Schedule the next status poll (15 min) unless the confirmed state
            // is terminal, in which case follow the existing stop policy. This
            // keeps the recovered order in the syncClickStatuses sweep instead
            // of stranding it with nextClickSyncAt:null.
            const pollNext=Timestamp.fromMillis(Date.now()+15*60*1000);
            const isTerminal=['delivered','cancelled'].includes(parsed.shippingStatus);
            await db.runTransaction(async tx=>{
              const cur=await tx.get(ref);if(cur.data()?.dispatchState!=='sending')return;
              tx.update(ref,{dispatchState:'sent',status:o.status==='ready'?'dispatched':o.status,revision:FieldValue.increment(1),
                shippingStatus:parsed.shippingStatus,shippingStatusSource:'click_api',shippingStatusUpdatedAt:Timestamp.now(),
                clickStatusRaw:parsed.rawStatus,clickStatusDate:parsed.statusDate,clickStatusDateMs:parsed.statusDateMs,clickStatusNote:parsed.note,clickAmounts:parsed.amounts,
                clickStatusVerified:isApiConfirmed(parsed.shippingStatus),nextClickSyncAt:isTerminal?null:pollNext,nextPollAt:Timestamp.now(),
                dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete(),syncError:null,updatedAt:FieldValue.serverTimestamp()});
              await addEvent(ref.id,'dispatch_exception_resolved',actor,{outcome:'shipment_exists',rawStatus:parsed.rawStatus,source},tx);
              await audit('order.dispatch_review_auto_resolved',actor,ref.id,{rawStatus:parsed.rawStatus,source},tx);
            });
            return 'resolved';
          }
        }
      }catch(e){logger.warn('stuck dispatch verify read failed',{id:ref.id,reason:typeof e?.reason==='string'?e.reason:'transport_error'});}
    }
  }
  // Unknown result: hand it to a manager as an explicit review. Never resend.
  await db.runTransaction(async tx=>{
    const cur=await tx.get(ref);if(cur.data()?.dispatchState!=='sending')return;
    tx.update(ref,{dispatchState:'needs_review',nextClickSyncAt:o.companyId?Timestamp.now():null,
      syncError:'توقفت محاولة الإرسال قبل تأكيد النتيجة. لا تُعد الإرسال؛ تحقق من شركة التوصيل أولاً.',
      dispatchLockId:FieldValue.delete(),dispatchLockUntil:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
    await addEvent(ref.id,'dispatch_attempt_failed',actor,{reason:'interrupted_recovered',source},tx);
    await audit('order.dispatch_attempt_failed',actor,ref.id,{reason:'interrupted_recovered',source},tx);
  });
  return 'needs_review';
}
exports.syncClickOrder=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);
  return syncClickOrderForRef(ref,user,{source:'manual',checkActor:user});
});
// Audited recovery for an interrupted dispatch. Any user who may send orders can
// trigger a safe recovery for one order; it never calls setorder.
exports.recoverStuckDispatch=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'sendToDelivery');
  const {ref}=await oneOrder(user,req.data?.id);
  const outcome=await recoverStuckDispatch(ref,user,{source:'manual'});
  return {ok:true,outcome};
});
// Low-frequency automatic status polling. Conservative caps because Click's
// rate-limit policy is not documented: every 15 minutes, at most 10 orders,
// 240-minute per-order backoff, and a stop after 5 consecutive failures.
exports.syncClickStatuses=onSchedule({schedule:'every 15 minutes',region:REGION,timeZone:'Etc/UTC',timeoutSeconds:180,maxInstances:1},async()=>{
  const deadline=Date.now()+150000;
  const actor={id:'scheduler:click',name:'مزامنة Click التلقائية'};
  let checked=0,updated=0,failed=0,skipped=0,recovered=0,consecutiveFailures=0;
  const snap=await db.collection('orders').where('nextClickSyncAt','<=',Timestamp.now()).orderBy('nextClickSyncAt').limit(10).get();
  for(const doc of snap.docs){
    if(Date.now()>=deadline)break;
    const o=doc.data();
    // Recover any interrupted send whose lock has expired before syncing, so a
    // timed-out dispatch never leaves the order stuck in 'sending'.
    if(o.dispatchState==='sending'){
      try{const outcome=await recoverStuckDispatch(doc.ref,actor,{source:'scheduled'});if(outcome!=='skipped')recovered++;}catch(e){logger.warn('stuck dispatch recovery failed',{id:doc.id});}
      continue;
    }
    if(!o.clickOrderRef||['delivered','cancelled'].includes(o.shippingStatus)){skipped++;continue;}
    try{
      const result=await syncClickOrderForRef(doc.ref,actor,{source:'scheduled'});
      checked++;if(result.applied)updated++;consecutiveFailures=0;
    }catch(e){
      failed++;consecutiveFailures++;
      logger.warn('click scheduled sync item failed',{id:doc.id,code:e?.code||'unknown'});
      if(consecutiveFailures>=5)break;
    }
  }
  logger.info('click scheduled sync',{checked,updated,failed,skipped,recovered});
});
exports.listMembers=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const data=req.data||{};
  if(typeof data!=='object'||Array.isArray(data))fail('invalid-argument','طلب غير صالح');
  const size=data.pageSize??30;
  if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم الصفحة غير صالح');
  // Soft-deleted (archived) members stay in Firestore for order/audit integrity
  // but never appear in the team list. Filtering is in-memory because a
  // Firestore inequality on `archived` cannot combine with the name orderBy
  // without a new composite index, and the team collection stays small.
  const snap=await db.collection('members').orderBy('name').get();
  if(data.query!=null&&typeof data.query!=='string')fail('invalid-argument','طلب غير صالح');
  const term=(data.query||'').trim();
  if(term.length>80)fail('invalid-argument','نص بحث طويل');
  let rows=snap.docs.filter(d=>d.data().archived!==true);
  if(term)rows=rows.filter(d=>String(d.data().name||'').includes(term));
  let start=0;
  if(data.afterId){const id=documentId(data.afterId);const at=rows.findIndex(d=>d.id===id);start=at<0?0:at+1;}
  const page=rows.slice(start,start+size);
  return {more:rows.length>start+size,afterId:page.at(-1)?.id||null,items:page.map(d=>({id:d.id,name:d.data().name,email:d.data().email,role:d.data().role,active:d.data().active,
    permissions:d.data().permissions||[],salesSupervisorId:d.data().salesSupervisorId||null,allowedPageIds:d.data().allowedPageIds||[]}))};
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
  // Pages the employee may create orders for. Only meaningful for roles that
  // create orders; validated as a unique list of existing page ids.
  const allowedPageIds=await resolveAllowedPageIds(req.data?.allowedPageIds);
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
      tx.update(target.ref,{name,role,permissions,active,salesSupervisorId:supervisor,allowedPageIds,authorizationVersion:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
      await audit('member.updated',user,id,{role,active},tx);
    });
    // DB authorization takes effect first, including during Auth API failure.
    await getAuth().updateUser(id,{disabled:!active,displayName:name});
    if(!active)await getAuth().revokeRefreshTokens(id);
    return {id};
  }
  fail('failed-precondition','إضافة الموظف تتطلب طلب انضمام Google وموافقة المدير العام');
});
// Soft-delete a member: archive the profile and disable the Auth account so
// the employee disappears from the team list without destroying orders or
// audit history. Orders store createdByName/createdByRole denormalised, so
// they still render, and the archived doc keeps createdBy references valid.
exports.deleteMember=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageEmployees');
  const id=idValue(req.data?.id);
  if(id===user.id)fail('permission-denied','لا يمكنك حذف حسابك');
  const target=await db.doc('members/'+id).get();
  if(!target.exists)fail('not-found','الموظف غير موجود');
  const role=target.data().role;
  // A general manager may delete anyone but the last active general manager.
  // Everyone else may only remove staff ranked below them.
  if(user.role!=='generalManager'&&['manager','generalManager'].includes(role))fail('permission-denied','لا يمكنك حذف هذا الحساب');
  await db.runTransaction(async tx=>{
    await currentActor(tx,user);
    const latest=await tx.get(target.ref);
    if(!latest.exists)fail('not-found','الموظف غير موجود');
    if(latest.data().archived===true)fail('failed-precondition','الموظف محذوف بالفعل');
    if(id===user.id)fail('permission-denied','لا يمكنك حذف حسابك');
    if(user.role!=='generalManager'&&['manager','generalManager'].includes(latest.data().role))fail('permission-denied','لا يمكنك حذف الإدارة');
    if(latest.data().role==='generalManager'&&latest.data().active===true){
      const managers=await tx.get(db.collection('members').where('role','==','generalManager').where('active','==',true));
      const others=managers.docs.filter(d=>d.id!==id&&d.data().archived!==true);
      if(others.length===0)fail('failed-precondition','لا يمكن حذف آخر مدير عام فعال');
    }
    tx.update(target.ref,{active:false,archived:true,deletedAt:FieldValue.serverTimestamp(),deletedBy:user.id,updatedAt:FieldValue.serverTimestamp()});
    await audit('member.deleted',user,id,{role},tx);
  });
  await getAuth().updateUser(id,{disabled:true}).catch(e=>{if(e.code!=='auth/user-not-found')throw e;});
  await getAuth().revokeRefreshTokens(id).catch(()=>{});
  return {ok:true};
});

function employeePassword(value){
  if(typeof value!=='string'||value.length<8||value.length>128)fail('invalid-argument','كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  return value;
}
exports.createEmployee=callable(async req=>{
  const user=await requireAuth(req);
  if(user.role!=='generalManager')fail('permission-denied','إضافة الموظفين متاحة للمدير العام فقط');
  const name=str(req.data?.name,120);
  const email=str(req.data?.email,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('invalid-argument','أدخل بريداً إلكترونياً صالحاً');
  const password=employeePassword(req.data?.password);
  const role=str(req.data?.role,30);
  if(!validRole(role))fail('invalid-argument','دور غير صالح');
  const permissions=req.data?.permissions;
  if(!Array.isArray(permissions)||!validPermissions(permissions))fail('invalid-argument','صلاحيات غير صالحة');
  if(typeof req.data?.active!=='boolean')fail('invalid-argument','حدد حالة تفعيل الحساب صراحةً');
  const active=req.data.active;
  const supervisor=req.data?.salesSupervisorId==null?null:idValue(req.data.salesSupervisorId);
  if(supervisor&&role!=='dataEntry')fail('invalid-argument','مشرف المبيعات خاص بمدخل البيانات');
  const allowedPageIds=await resolveAllowedPageIds(req.data?.allowedPageIds);
  let existingAuth=null;
  try{existingAuth=await getAuth().getUserByEmail(email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  if(existingAuth)fail('already-exists','البريد الإلكتروني مستخدم بالفعل');
  const existingMember=await db.collection('members').where('email','==',email).limit(1).get();
  if(!existingMember.empty)fail('already-exists','يوجد ملف موظف بهذا البريد؛ راجع البيانات قبل الإنشاء');
  const created=await getAuth().createUser({email,password,emailVerified:true,displayName:name,disabled:!active});
  try{
    await db.runTransaction(async tx=>{
      await currentActor(tx,user);
      if(supervisor){
        const sup=await tx.get(db.doc('members/'+supervisor));
        if(!sup.exists||sup.data().role!=='sales'||sup.data().active!==true)fail('failed-precondition','مشرف المبيعات غير متاح');
        tx.update(sup.ref,{authorizationVersion:FieldValue.increment(1)});
      }
      tx.create(db.doc('members/'+created.uid),{name,email,role,permissions:[...new Set(permissions)],active,
        salesSupervisorId:supervisor,allowedPageIds,approvalStatus:'approved',createdBy:user.id,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),authorizationVersion:1});
      await audit('member.created',user,created.uid,{role,active},tx);
    });
  }catch(e){
    await getAuth().deleteUser(created.uid).catch(()=>{});
    throw e;
  }
  return {id:created.uid};
});
exports.resetEmployeePassword=callable(async req=>{
  const user=await requireAuth(req);
  requiredPerm(user,'manageEmployees');
  const id=idValue(req.data?.id);
  if(id===user.id)fail('permission-denied','استخدم "تغيير كلمة المرور" لتغيير كلمة مرورك');
  const password=employeePassword(req.data?.password);
  const member=await db.doc('members/'+id).get();
  if(!member.exists)fail('not-found','الموظف غير موجود');
  const target=member.data();
  // Mirror saveMember's privilege ceiling: only a general manager may reset a
  // general manager or a manager; a delegated manager may reset roles that rank
  // below them and may not touch an equal/higher or a general manager.
  if(user.role!=='generalManager'){
    if(['generalManager','manager'].includes(target.role)||target.role===user.role)fail('permission-denied','لا يمكنك إعادة تعيين كلمة مرور هذا الحساب');
    if(target.role==='warehouse'&&!can(user,'updateOrderStatus')&&user.role!=='warehouse')fail('permission-denied','لا يمكنك إعادة تعيين كلمة مرور هذا الحساب');
  }
  const record=await getAuth().getUser(id).catch(e=>{if(e.code==='auth/user-not-found')fail('not-found','حساب الدخول غير موجود');throw e;});
  if(!record.providerData.some(p=>p.providerId==='password'))fail('failed-precondition','هذا الحساب لا يستخدم الدخول بالبريد وكلمة المرور');
  await getAuth().updateUser(id,{password});
  await getAuth().revokeRefreshTokens(id);
  // Audit records the event and actor only; the password value is never stored.
  await audit('member.password_reset',user,id,{targetRole:target.role},null);
  return {ok:true};
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
    items.push({id:d.id,action:event.action,actorName:event.actorName,entityId:event.entityId,extra:event.extra||null,createdAt:safeDate(event.createdAt)});
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
  // Fetch and filter archived in-memory alongside the existing in-memory cursor
  // semantics; the members collection is small. A Firestore `archived != true`
  // would silently drop members whose field is absent, so filter locally.
  const snap=await query.get();
  let rows=snap.docs.filter(d=>d.data().archived!==true);
  if(req.data?.query!=null&&typeof req.data.query!=='string')fail('invalid-argument','طلب غير صالح');
  const term=(req.data?.query||'').trim();
  if(term)rows=rows.filter(d=>(d.data().name||'').includes(term));
  rows.sort((a,b)=>String(a.data().name||'').localeCompare(String(b.data().name||''),'ar'));
  let start=0;
  if(req.data?.afterId){const id=documentId(req.data.afterId);const at=rows.findIndex(d=>d.id===id);start=at<0?0:at+1;}
  const size=req.data?.pageSize??30;
  if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم الصفحة غير صالح');
  const page=rows.slice(start,start+size);
  const items=page.map(d=>({id:d.id,name:d.data().name}));
  // A sales supervisor's own name is available on page one without duplicating team cursors.
  if(user.role==='sales'&&!req.data?.afterId&&!term&&!items.some(m=>m.id===user.id))items.unshift({id:user.id,name:user.name});
  return {items,more:rows.length>start+size,afterId:page.at(-1)?.id||null};
});

exports.getSettings=callable(async req=>{await requireAuth(req);const snap=await db.doc('settings/system').get();const d=snap.data()||{};return {organizationName:d.organizationName||'Velnix',receiptFooter:d.receiptFooter||'',supportPhone:d.supportPhone||'',defaultCompanyId:d.defaultCompanyId||null};});
exports.saveSettings=callable(async req=>{
  const user=await requireAuth(req);requiredPerm(user,'manageSettings');
  const organizationName=str(req.data?.organizationName,120),receiptFooter=optional(req.data?.receiptFooter,200),supportPhone=arabicDigits(optional(req.data?.supportPhone,30)).replace(/[ ()-]/g,'');
  if(supportPhone&&!/^\+?[0-9]{7,15}$/.test(supportPhone))fail('invalid-argument','هاتف دعم غير صالح');
  // Optional default delivery company. Must reference an existing, enabled,
  // non-archived company so the form can preselect it safely.
  let defaultCompanyId=null;
  if(req.data?.defaultCompanyId!=null&&req.data.defaultCompanyId!==''){
    defaultCompanyId=idValue(req.data.defaultCompanyId);
    const company=await db.doc('companies/'+defaultCompanyId).get();
    if(!company.exists)fail('failed-precondition','شركة التوصيل الافتراضية غير موجودة');
    const c=company.data();
    if(c.enabled!==true||c.archived===true)fail('failed-precondition','الشركة الافتراضية يجب أن تكون مفعلة وغير مؤرشفة');
  }
  await db.runTransaction(async tx=>{await currentActor(tx,user);tx.set(db.doc('settings/system'),{organizationName,receiptFooter,supportPhone,defaultCompanyId,updatedAt:FieldValue.serverTimestamp()},{merge:true});await audit('settings.updated',user,'system',{defaultCompanyId},tx);});return {ok:true};
});

exports.orderEventNotice=onDocumentCreated({document:'orders/{orderId}/events/{eventId}',region:'us-central1',retry:true},async event=>{
  if(!event.data)return;
  const order=await db.doc('orders/'+event.params.orderId).get();if(!order.exists)return;
  const members=await db.collection('members').where('role','in',['generalManager','manager','warehouse']).get();
  const creator=await db.doc('members/'+order.data().createdBy).get();
  const recipients=[order.data().createdBy,creator.data()?.role==='dataEntry'?creator.data().salesSupervisorId:null,...members.docs.map(d=>d.id)];
  await notifyRecipients(recipients,event.data.data().action==='created'?'طلب جديد':'تحديث طلب','افتح الطلب لعرض آخر تغيير.',order.id,event.params.eventId);
});
