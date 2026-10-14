'use strict';
const {documentId}=require('./policy');
const {remoteCanAdvance}=require('./delivery');
const optional=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
function createRemoteProcessor({db,FieldValue,addEvent,audit}) {
return async function processRemote(companyId, payload, eventId, source) {
  const companyDoc=await db.doc(`companies/${companyId}`).get();if(!companyDoc.exists)return {ignored:'unknown_company'};
  // Click has no documented webhook/response/status contract. Never feed
  // its payloads into generic field names or statusMap, even on a stale record.
  if(companyDoc.data().provider==='click_delivery_v1')return {ignored:'unconfirmed_provider_contract'};
  let orderId;try{orderId=documentId(payload.reference||payload.orderId);}catch(_){return {ignored:'invalid_reference'};}
  const raw=optional(payload.status,80),map=companyDoc.data().statusMap||{},mapped=Object.hasOwn(map,raw)?map[raw]:null;
  if(!orderId||!mapped)return {ignored:'unknown_order_or_status'};
  const orderRef=db.doc(`orders/${orderId}`),eventRef=db.doc(`deliveryInbox/${companyId}/events/${eventId}`);
  return db.runTransaction(async tx=>{
    const [event,order]=await Promise.all([tx.get(eventRef),tx.get(orderRef)]);
    const sameStatus=order.exists&&order.data().companyId===companyId&&order.data().status===mapped;
    const syncSuccess={lastSyncAt:FieldValue.serverTimestamp(),syncError:null};
    if(event.exists){
      // Poll IDs are stable per raw status. A fresh successful poll still
      // proves recovery; a replayed webhook does not prove a fresh connection.
      if(source==='poll'&&sameStatus)tx.update(orderRef,syncSuccess);
      return {ignored:'duplicate'};
    }
    if(order.exists&&order.data().companyId===companyId&&order.data().status==='ready'&&['sending','needs_review'].includes(order.data().dispatchState))return {deferred:'awaiting_dispatch_confirmation'};
    tx.create(eventRef,{companyId,orderId,raw,source,receivedAt:FieldValue.serverTimestamp()});
    if(!order.exists||order.data().companyId!==companyId)return {ignored:'unmatched_order'};
    if(!remoteCanAdvance(order.data().status,mapped))return {ignored:'out_of_order'};
    if(sameStatus){tx.update(orderRef,syncSuccess);return {ignored:'same_status'};}
    tx.update(orderRef,{revision:FieldValue.increment(1),status:mapped,...(mapped==='delivered'?{completionSource:'carrier'}:{}),remoteStatus:raw,updatedAt:FieldValue.serverTimestamp(),lastSyncAt:FieldValue.serverTimestamp(),syncError:null});
    const actor={id:`delivery:${companyId}`,name:'شركة التوصيل'};
    await addEvent(orderId,'remote_status',actor,{raw,mapped,source},tx);
    await audit('order.remote_status',actor,orderId,{raw,mapped,companyId},tx);
    return {updated:true};
  });
}
}
module.exports={createRemoteProcessor};
