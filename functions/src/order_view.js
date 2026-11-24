'use strict';
const {can,canEditOrder,allowedTransition,STATUSES,dispatchBlocked,canResolveDispatch,correctionTargets,CARRIER_DELETION_STATES,canManageCarrierDeletion}=require('./policy');
const {shippingStatus,isApiConfirmed,isExceptionStatus}=require('./shipping_status');
const safeDate=v=>v?.toDate?.()?.toISOString?.() ?? null;
function publicOrder(d) {
  const o=d.data();
  return {id:d.id,orderNumber:o.orderNumber||null,barcodeValue:o.barcodeValue||`VNX-${d.id}`,customer:o.customer,phone:o.phone,extraPhone:o.extraPhone||'',city:o.city,area:o.area,
    address:o.address,description:o.description,quantity:o.quantity,amount:o.amountMinor/1000,
    pageId:o.pageId||null,pageName:o.pageName||null,pageFacebookUrl:o.pageFacebookUrl||null,
    pagePhone:o.pagePhone||'',pageWhatsapp:o.pageWhatsapp||'',orderType:o.orderType||'normal',
    paymentMethod:o.paymentMethod,note:o.note||'',status:o.status,internalStatus:require('./policy').internalStatusOf(o),createdBy:o.createdBy,createdByName:o.createdByName,
    companyId:o.companyId||null,trackingNumber:o.trackingNumber||null,remoteStatus:o.remoteStatus||null,providerOrderId:o.providerOrderId||null,
    clickOrderRef:o.clickOrderRef||null,clickClientSerial:o.clickClientSerial||null,clickStatusRaw:o.clickStatusRaw||null,clickStatusDate:o.clickStatusDate||null,
    clickStatusNote:o.clickStatusNote||null,clickAmounts:o.clickAmounts||null,shippingStatus:shippingStatus(o.shippingStatus),shippingStatusSource:o.shippingStatusSource||null,shippingStatusUpdatedAt:safeDate(o.shippingStatusUpdatedAt),
    clickStatusVerified:o.clickStatusVerified===true||isApiConfirmed(o.shippingStatus),shippingStatusIsException:isExceptionStatus(o.shippingStatus),completionSource:o.completionSource||null,
    // Manual accounting confirmation of «تم التسليم» (who/when + optional
    // statement reference, note and financial difference). Never derived from a
    // carrier status; null when the order was not manually confirmed.
    internalCompletion:o.internalCompletion&&typeof o.internalCompletion==='object'
      ? {source:o.internalCompletion.source||'internal_review',confirmedBy:o.internalCompletion.confirmedBy||null,
        confirmedByName:o.internalCompletion.confirmedByName||'',confirmedAt:safeDate(o.internalCompletion.confirmedAt),
        statementRef:o.internalCompletion.statementRef||null,note:o.internalCompletion.note||null,
        differenceMinor:Number.isSafeInteger(o.internalCompletion.differenceMinor)?o.internalCompletion.differenceMinor:null}
      : null,
    syncError:o.syncError||null,lastSyncAt:safeDate(o.lastSyncAt),lastSyncAttemptAt:safeDate(o.lastSyncAttemptAt),dispatchState:o.dispatchState||'idle',revision:o.revision||0,
    // Carrier-deletion monitoring (control view). A snapshot of the carrier facts
    // kept at detection time; null when the order was never flagged. Display only
    // — it never changes the order's status, amounts or `deliveryAccepted`.
    carrierDeletion:o.carrierDeletion&&typeof o.carrierDeletion==='object'&&CARRIER_DELETION_STATES.includes(o.carrierDeletion.state)
      ? {state:o.carrierDeletion.state,source:o.carrierDeletion.source||'manual',reason:o.carrierDeletion.reason||'',note:o.carrierDeletion.note||'',
        companyId:o.carrierDeletion.companyId||null,lastKnownShippingStatus:o.carrierDeletion.lastKnownShippingStatus||null,
        lastKnownShippingStatusAt:safeDate(o.carrierDeletion.lastKnownShippingStatusAt),trackingNumber:o.carrierDeletion.trackingNumber||null,
        shipmentReference:o.carrierDeletion.shipmentReference||null,detectedAt:safeDate(o.carrierDeletion.detectedAt),
        confirmedAt:safeDate(o.carrierDeletion.confirmedAt),confirmedBy:o.carrierDeletion.confirmedBy||null,confirmedByName:o.carrierDeletion.confirmedByName||''}
      : null,
    createdAt:safeDate(o.createdAt),updatedAt:safeDate(o.updatedAt)};
}
function orderForUser(user,d) {
  const source=d.data();
  const data=publicOrder(d);
  if(!can(user,'viewAmounts') && source.createdBy!==user.id){delete data.amount;delete data.clickAmounts;
    // The recorded financial difference is an amount too: hide it for callers
    // who may not see amounts, keeping the statement reference/note visible.
    if(data.internalCompletion)delete data.internalCompletion.differenceMinor;}
  const internal=require('./policy').internalStatusOf(source);
  // Dispatch is offered from ANY internal status once a company is assigned and
  // no send is in flight/undetermined. It is not limited to 'ready'.
  const canDispatch=can(user,'sendToDelivery')&&!!source.companyId&&!dispatchBlocked(source)&&!['sending','needs_review'].includes(source.dispatchState);
  data.actions={
    edit:canEditOrder(user,source),
    statuses:STATUSES.filter(target=>allowedTransition(user,source,target)),
    assign:can(user,'sendToDelivery')&&!dispatchBlocked(source)&&internal!==null,
    dispatch:canDispatch,
    resolve:user.role==='generalManager'&&canResolveDispatch(source),
    corrections:user.role==='generalManager'?correctionTargets(source):[],
    carrierDeletion:canManageCarrierDeletion(user),
  };
  return data;
}
module.exports={publicOrder,orderForUser};
