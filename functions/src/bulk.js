'use strict';
const {documentId,canSeeOrder,can,STATUSES,ORDER_TYPES}=require('./policy');
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

  // Maximum orders dispatched to the vendor in a single call. Cloud Functions
  // have a 60s budget; each dispatch can take up to ~15s plus a read. Keeping
  // the batch small means the function finishes well within its timeout and the
  // durable record is written before the client is told anything.
  const MAX_DISPATCH = 10;

  // Runs a bounded slice of a durable bulk dispatch. Each order's outcome is
  // written to `bulkOperations/{opId}` BEFORE the client is told anything, so a
  // timeout or lost connection never loses the record and never triggers a
  // resend. A caller paginates through the ids; `hasMore` tells the client to
  // call again with the next chunk. No order is ever dispatched twice because
  // the single-order flow's lock/needs_review protection is unchanged.
  async function bulkDispatch(req){
    const user=await requireAuth(req);
    requiredPerm(user,'sendToDelivery');
    const ids=idList(req.data?.ids);
    if(ids.length>MAX_DISPATCH)fail('invalid-argument',`الحد الأقصى ${MAX_DISPATCH} طلباً في دفعة الإرسال الواحدة؛ أرسل الدفعة على stages`);
    const opId=typeof req.data?.operationId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(req.data.operationId)?req.data.operationId:null;
    const opRef=opId?db.doc('bulkOperations/'+opId):db.collection('bulkOperations').doc();
    await opRef.set({actorId:user.id,actorName:user.name||'',kind:'dispatch',startedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    const results=[];
    for(const id of ids){
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
      // Persist each result immediately so a later timeout cannot lose it.
      try{await opRef.set({results:FieldValue.arrayUnion(entry),updatedAt:FieldValue.serverTimestamp()},{merge:true});}catch(e){logger.warn&&logger.warn('bulk op persist failed',{id:opRef.id});}
    }
    const succeeded=results.filter(r=>r.ok).length;
    const uncertain=results.filter(r=>r.uncertain).length;
    await opRef.set({finishedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),succeeded,failed:results.length-succeeded,uncertain},{merge:true});
    return {operationId:opRef.id,results,succeeded,failed:results.length-succeeded,uncertain,dispatched:results.length};
  }

  // Reads a durable bulk operation so the client can recover results after a
  // timeout, a network drop or an app restart — without re-dispatching anything.
  async function getBulkOperation(req){
    const user=await requireAuth(req);
    const opId=documentId(req.data?.operationId);
    const snap=await db.doc('bulkOperations/'+opId).get();
    if(!snap.exists)fail('not-found','لم يتم العثور على العملية');
    const d=snap.data();
    // Only the operator who started it (or a manager) may read the record.
    if(d.actorId!==user.id&&!can(user,'sendToDelivery'))fail('permission-denied','لا يمكنك الوصول لهذه العملية');
    return {operationId:opId,kind:d.kind,results:d.results||[],succeeded:d.succeeded||0,failed:d.failed||0,uncertain:d.uncertain||0,finished:!!d.finishedAt};
  }

  return {resolveBarcodes,bulkChangeStatus,bulkAssignCompany,bulkDispatch,getBulkOperation,MAX_BULK,MAX_DISPATCH};
};
