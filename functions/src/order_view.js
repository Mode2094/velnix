'use strict';
const {can,canEditOrder,allowedTransition,STATUSES,dispatchBlocked,canResolveDispatch,correctionTargets}=require('./policy');
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
    syncError:o.syncError||null,lastSyncAt:safeDate(o.lastSyncAt),lastSyncAttemptAt:safeDate(o.lastSyncAttemptAt),dispatchState:o.dispatchState||'idle',revision:o.revision||0,
    createdAt:safeDate(o.createdAt),updatedAt:safeDate(o.updatedAt)};
}
function orderForUser(user,d) {
  const source=d.data();
  const data=publicOrder(d);
  if(!can(user,'viewAmounts') && source.createdBy!==user.id){delete data.amount;delete data.clickAmounts;}
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
  };
  return data;
}
module.exports={publicOrder,orderForUser};
