'use strict';
const crypto=require('node:crypto');
const {documentId,canSeeOrder,STATUSES,ORDER_TYPES}=require('./policy');
const {foldDigits}=require('./search');

// Bounded bulk operations. Each order is validated independently against the
// SAME policy the single-order callables use, and the result is reported per
// order so a partial success is never presented as a full success. No bulk
// operation bypasses a permission, a transition rule, the dispatch lock or the
// Click needs_review protection.
const MAX_BULK = 50;

// Resolves a scanned/pasted code to a single order id. The different reference
// kinds are deliberately kept distinct so a value is never misread:
//  - "VNX-000123"        : human sequence number (orderNumber)
//  - "VNX-<docId>"       : Velnix barcode / document id
//  - "<docId>"           : raw Firestore document id
// It never derives one kind from another beyond the explicit VNX- prefixes that
// the project itself uses. Returns {id} or throws not-found.
module.exports = ({db,auth,FieldValue,requireAuth,currentActor,audit,fail,requiredPerm,logger,applyStatusChange,applyCompanyAssignment,runDispatch,orderForUser}) => {
  function idList(raw){
    if(!Array.isArray(raw)||raw.length===0)fail('invalid-argument','حدّد طلباً واحداً على الأقل');
    if(raw.length>MAX_BULK)fail('invalid-argument',`الحد الأقصى ${MAX_BULK} طلباً في العملية الواحدة`);
    const ids=[];const seen=new Set();
    for(const v of raw){const id=documentId(v);if(!seen.has(id)){seen.add(id);ids.push(id);}}
    return ids;
  }

  // Resolves one scanned/pasted code to its order id using exact, read-only
  // lookups. Never guesses.
  async function resolveCodeToId(code){
    const raw=String(code||'').trim();
    if(!raw)throw new Error('empty_code');
    const upper=raw.toUpperCase();
    // Barcode / order number both use the "VNX-" prefix; try both shapes.
    if(upper.startsWith('VNX-')){
      const seq=await db.collection('orders').where('orderNumber','==',upper).limit(1).get();
      if(!seq.empty)return seq.docs[0].id;
      // barcodeValue is stored as `VNX-<docId>` with the document id's original
      // case, so query with the raw value (not the upper-cased one).
      const bc=await db.collection('orders').where('barcodeValue','==','VNX-'+raw.slice(4)).limit(1).get();
      if(!bc.empty)return bc.docs[0].id;
      const bcUpper=await db.collection('orders').where('barcodeValue','==',upper).limit(1).get();
      if(!bcUpper.empty)return bcUpper.docs[0].id;
      const docId=raw.slice(4);
      if(/^[a-zA-Z0-9_-]{1,140}$/.test(docId)){
        const doc=await db.doc('orders/'+docId).get();
        if(doc.exists)return doc.id;
      }
      throw new Error('not_found');
    }
    // Bare document id.
    if(/^[a-zA-Z0-9_-]{8,140}$/.test(raw)){
      const doc=await db.doc('orders/'+raw).get();
      if(doc.exists)return doc.id;
    }
    // A bare numeric string is only a sequence if it matches a VNX- number.
    const digits=foldDigits(raw).replace(/\D/g,'');
    if(digits){
      const padded=digits.padStart(6,'0');
      const byNum=await db.collection('orders').where('orderNumber','==','VNX-'+padded).limit(1).get();
      if(!byNum.empty)return byNum.docs[0].id;
    }
    throw new Error('not_found');
  }

  // Barcode scanner batch resolution. Returns per-code results WITHOUT leaking
  // whether an order exists but is not visible to the caller: an unauthorized
  // order is reported exactly like a not-found one.
  async function resolveBarcodes(req){
    const user=await requireAuth(req);
    const codes=Array.isArray(req.data?.codes)?req.data.codes:[];
    if(codes.length===0)fail('invalid-argument','لا توجد أكواد لمسحها');
    if(codes.length>20)fail('invalid-argument','الحد الأقصى 20 باركوداً في المسح الواحد');
    const results=[];const seenOrders=new Set();
    for(const code of codes.slice(0,20)){
      try{
        const id=await resolveCodeToId(code);
        const snap=await db.doc('orders/'+id).get();
        if(!snap.exists||!canSeeOrder(user,{...snap.data(),id})){results.push({code:String(code),status:'not_found'});continue;}
        if(seenOrders.has(id)){results.push({code:String(code),status:'duplicate',orderId:id});continue;}
        seenOrders.add(id);
        results.push({code:String(code),status:'ok',orderId:id,order:orderForUser(user,snap)});
      }catch(e){
        results.push({code:String(code),status:e.message==='empty_code'?'invalid':'not_found'});
      }
    }
    return {results};
  }

  async function loadVisible(user,id){
    const ref=db.collection('orders').doc(id);
    const snap=await ref.get();
    if(!snap.exists||!canSeeOrder(user,{...snap.data(),id}))return null;
    return ref;
  }

  async function bulkChangeStatus(req){
    const user=await requireAuth(req);
    const ids=idList(req.data?.ids);
    const target=typeof req.data?.status==='string'?req.data.status.trim():'';
    if(!STATUSES.includes(target))fail('invalid-argument','حالة غير صالحة');
    const results=[];
    for(const id of ids){
      try{
        const ref=await loadVisible(user,id);
        if(!ref){results.push({id,ok:false,code:'permission-denied'});continue;}
        await applyStatusChange(ref,user,target);
        results.push({id,ok:true});
      }catch(e){results.push({id,ok:false,code:e?.code||'failed-precondition',message:typeof e?.message==='string'?e.message.slice(0,200):''});}
    }
    const succeeded=results.filter(r=>r.ok).length;
    return {results,succeeded,failed:results.length-succeeded};
  }

  async function bulkAssignCompany(req){
    const user=await requireAuth(req);
    // Fail the whole call before touching any order when the caller cannot
    // assign companies. The shared applyCompanyAssignment enforces this again.
    requiredPerm(user,'sendToDelivery');
    const ids=idList(req.data?.ids);
    const companyId=req.data?.companyId==null?null:documentId(req.data.companyId);
    // Validate the company up-front so a bad id is rejected once, not per order.
    if(companyId){const c=await db.doc('companies/'+companyId).get();if(!c.exists||c.data().archived||!c.data().enabled)fail('failed-precondition','الشركة غير مفعلة');}
    const results=[];
    for(const id of ids){
      try{
        const ref=await loadVisible(user,id);
        if(!ref){results.push({id,ok:false,code:'permission-denied'});continue;}
        await applyCompanyAssignment(ref,user,companyId);
        results.push({id,ok:true});
      }catch(e){results.push({id,ok:false,code:e?.code||'failed-precondition',message:typeof e?.message==='string'?e.message.slice(0,200):''});}
    }
    const succeeded=results.filter(r=>r.ok).length;
    return {results,succeeded,failed:results.length-succeeded};
  }

  // Per-call dispatch budget. Each dispatch can take up to ~15s plus a read and
  // the callable's total budget is 60s, so we ALSO enforce a wall-clock deadline
  // below: the loop stops starting new sends before the deadline and reports the
  // operation as `partial` so the client can resume the remaining orders. A hard
  // batch cap (10) plus the deadline guarantees the function returns in time.
  const MAX_DISPATCH = 10;
  const DISPATCH_DEADLINE_MS = 45000; // leave headroom inside the 60s timeout

  // Fingerprints an operation's order-id set so the same operationId can only be
  // used with the same content. Order-independent and stable.
  function fingerprint(ids){
    const sorted=[...ids].sort();
    return crypto.createHash('sha256').update(sorted.join('|')).digest('hex');
  }

  // Runs (or resumes) a durable bulk dispatch. The CLIENT creates the
  // operationId and passes it in. Each order is CLAIMED atomically before any
  // external call, so two concurrent calls with the same operation/order can
  // never both send; the loser sees the winner's claim and skips. A transient
  // failure result never overwrites a confirmed success. `dispatchOrder` (the
  // single-order flow) still owns the Click lock and needs_review protection.
  async function bulkDispatch(req){
    const user=await requireAuth(req);
    requiredPerm(user,'sendToDelivery');
    const ids=idList(req.data?.ids);
    if(ids.length>MAX_DISPATCH)fail('invalid-argument',`الحد الأقصى ${MAX_DISPATCH} طلباً في دفعة الإرسال الواحدة`);
    const opId=typeof req.data?.operationId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(req.data.operationId)?req.data.operationId:null;
    if(!opId)fail('invalid-argument','معرّف العملية مطلوب (16 حرفاً على الأقل)');
    const fp=fingerprint(ids);
    const opRef=db.doc('bulkOperations/'+opId);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(opRef);
      if(snap.exists){
        const d=snap.data();
        if(d.actorId!==user.id)fail('permission-denied','معرّف العملية مستخدم من قبل حساب آخر');
        if(d.fingerprint&&d.fingerprint!==fp)fail('already-exists','معرّف العملية مستخدم ببيانات مختلفة');
        return;
      }
      tx.create(opRef,{actorId:user.id,actorName:user.name||'',kind:'dispatch',ids,fingerprint:fp,status:'running',
        startedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    const resultsRef=opRef.collection('results');
    const results=[];
    const deadline=Date.now()+DISPATCH_DEADLINE_MS;
    let stoppedEarly=false;
    for(const id of ids){
      // Resume: a durable result already exists.
      const existing=await resultsRef.doc(id).get();
      if(existing.exists){results.push(existing.data());continue;}
      // Deadline: stop starting new sends; leave the order for a resumed call.
      if(Date.now()>=deadline){stoppedEarly=true;break;}
      // Atomically CLAIM this order inside the operation before any send. If a
      // concurrent call wins the claim, skip it (its result will be read next).
      const claim=await db.runTransaction(async tx=>{
        const ref=resultsRef.doc(id);
        const cur=await tx.get(ref);
        if(cur.exists)return cur.data();
        tx.create(ref,{id,state:'claimed',claimedBy:user.id,claimedAt:new Date().toISOString()});
        return null;
      });
      if(claim){results.push(claim.id?claim:{id});continue;}
      let entry;
      try{
        const ref=await loadVisible(user,id);
        if(!ref){entry={id,ok:false,code:'permission-denied',at:new Date().toISOString()};}
        else{
          const out=await runDispatch(ref,user);
          entry={id,ok:true,trackingNumber:out?.trackingNumber||null,at:new Date().toISOString()};
        }
      }catch(e){
        const code=e?.code||'failed-precondition';
        entry={id,ok:false,code,uncertain:code==='unavailable',message:typeof e?.message==='string'?e.message.slice(0,200):'',at:new Date().toISOString()};
      }
      results.push(entry);
      // Monotonic result write inside a transaction: never overwrite a confirmed
      // success with a transient failure.
      await db.runTransaction(async tx=>{
        const ref=resultsRef.doc(id);
        const cur=await tx.get(ref);
        const prev=cur.data();
        if(prev&&prev.ok===true&&entry.ok!==true)return; // keep the success
        tx.set(ref,entry);
      });
    }
    const succeeded=results.filter(r=>r.ok).length;
    const uncertain=results.filter(r=>r.uncertain).length;
    const status=stoppedEarly?'partial':'finished';
    await opRef.set({status,finishedAt:stoppedEarly?null:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      succeeded,failed:results.length-succeeded,uncertain,remaining:stoppedEarly?ids.length-results.length:0},{merge:true});
    return {operationId:opId,status,results,succeeded,failed:results.length-succeeded,uncertain,dispatched:results.length,hasMore:stoppedEarly};
  }

  // Lists the caller's own bulk operations (newest first) so the app can recover
  // operation ids and statuses after a restart or a dropped connection. Scoped
  // strictly to the caller: sendToDelivery is not a licence to read others'.
  async function listBulkOperations(req){
    const user=await requireAuth(req);
    const size=Math.max(1,Math.min(20,Math.floor(Number(req.data?.pageSize)||10)));
    const snap=await db.collection('bulkOperations').where('actorId','==',user.id).orderBy('startedAt','desc').limit(size).get();
    const items=[];
    for(const d of snap.docs){
      const v=d.data();
      items.push({operationId:d.id,kind:v.kind,status:v.status||'running',ids:v.ids||[],
        succeeded:v.succeeded||0,failed:v.failed||0,uncertain:v.uncertain||0,remaining:v.remaining||0,
        startedAt:v.startedAt?.toDate?.()?.toISOString?.()||null});
    }
    return {items};
  }

  // Reads a durable bulk operation so the client can recover results after a
  // timeout, a network drop or an app restart — without re-dispatching anything.
  // Only the operator who started it may read it: sendToDelivery alone is NOT a
  // licence to read every user's operations.
  async function getBulkOperation(req){
    const user=await requireAuth(req);
    const opId=typeof req.data?.operationId==='string'?documentId(req.data.operationId):fail('invalid-argument','معرّف العملية مطلوب');
    const snap=await db.doc('bulkOperations/'+opId).get();
    if(!snap.exists)fail('not-found','لم يتم العثور على العملية');
    const d=snap.data();
    if(d.actorId!==user.id)fail('permission-denied','لا يمكنك الوصول لهذه العملية');
    const resultsSnap=await db.doc('bulkOperations/'+opId).collection('results').get();
    const results=resultsSnap.docs.map(x=>x.data());
    return {operationId:opId,kind:d.kind,status:d.status||'running',ids:d.ids||[],results,
      succeeded:d.succeeded||0,failed:d.failed||0,uncertain:d.uncertain||0,finished:d.status==='finished'};
  }

  return {resolveBarcodes,bulkChangeStatus,bulkAssignCompany,bulkDispatch,getBulkOperation,listBulkOperations,MAX_BULK,MAX_DISPATCH};
};
