'use strict';
const {can,canEditOrder,allowedTransition,STATUSES,dispatchBlocked,canResolveDispatch}=require('./policy');
const safeDate=v=>v?.toDate?.()?.toISOString?.() ?? null;
function publicOrder(d) {
  const o=d.data();
  return {id:d.id,barcodeValue:o.barcodeValue||`VNX-${d.id}`,customer:o.customer,phone:o.phone,extraPhone:o.extraPhone||'',city:o.city,area:o.area,
    address:o.address,description:o.description,quantity:o.quantity,amount:o.amountMinor/1000,
    paymentMethod:o.paymentMethod,note:o.note||'',status:o.status,createdBy:o.createdBy,createdByName:o.createdByName,
    companyId:o.companyId||null,trackingNumber:o.trackingNumber||null,remoteStatus:o.remoteStatus||null,
    syncError:o.syncError||null,dispatchState:o.dispatchState||'idle',revision:o.revision||0,
    createdAt:safeDate(o.createdAt),updatedAt:safeDate(o.updatedAt)};
}
function orderForUser(user,d) {
  const source=d.data();
  const data=publicOrder(d);
  if(!can(user,'viewAmounts') && source.createdBy!==user.id)delete data.amount;
  data.actions={
    edit:canEditOrder(user,source),
    statuses:STATUSES.filter(target=>allowedTransition(user,source,target)),
    assign:can(user,'sendToDelivery')&&!dispatchBlocked(source)&&['created','review','preparing','ready'].includes(source.status),
    dispatch:can(user,'sendToDelivery')&&source.status==='ready'&&!!source.companyId&&!dispatchBlocked(source),
    resolve:user.role==='generalManager'&&canResolveDispatch(source),
  };
  return data;
}
module.exports={publicOrder,orderForUser};
