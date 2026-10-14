'use strict';
const {vendorRequest}=require('./delivery');
// Documented local reference contract; not a certified carrier.
const providers=Object.freeze({
  generic_v1:{
    health:(company,token,transport)=>vendorRequest(company,token,'GET','/health',undefined,transport),
    create:(company,token,order,transport)=>vendorRequest(company,token,'POST','/orders',{
      reference:order.id,idempotencyKey:order.id,customer:order.customer,phone:order.phone,
      extraPhone:order.extraPhone||'',city:order.city,area:order.area,address:order.address,
      description:order.description,quantity:order.quantity,amount:order.amountMinor/1000,
      paymentMethod:order.paymentMethod,notes:order.note||'',
    },transport),
    status:(company,token,tracking,transport)=>vendorRequest(company,token,'GET','/orders/'+encodeURIComponent(tracking),undefined,transport),
  },
});
function providerFor(company) {
  if(!Object.hasOwn(providers,company.provider))throw Error('unsupported_delivery_provider');
  return providers[company.provider];
}
module.exports={providerFor};
