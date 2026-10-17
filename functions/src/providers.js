'use strict';
const {vendorRequest,allowedUrl}=require('./delivery');
const {CLICK_PROVIDER,assertClickUrl,clickDelivery}=require('./click_delivery');
// Documented local reference contract; not a certified carrier.
const providers=Object.freeze({
  [CLICK_PROVIDER]:clickDelivery,
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
  if(company.provider===CLICK_PROVIDER)assertClickUrl(company);
  else if(new URL(company.apiUrl).hostname==='admin.clickdelivery.org')throw Error('click_requires_dedicated_adapter');
  return providers[company.provider];
}
function requireOperationalProvider(company){
  const adapter=providerFor(company);
  if(company.provider===CLICK_PROVIDER)throw Error('click_contract_incomplete');
  allowedUrl(company.apiUrl);
  return adapter;
}
module.exports={providerFor,requireOperationalProvider};
