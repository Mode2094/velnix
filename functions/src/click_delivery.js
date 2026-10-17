'use strict';
const {vendorRequest}=require('./delivery');
const CLICK_PROVIDER='click_delivery_v1';
const CLICK_BASE='https://admin.clickdelivery.org/Client';
// Request-only evidence: collection /item/0/request. No response schema supplied.
function getOrderBody(orderId,credentials) {
  // A deliberately narrow local subset of the numeric example, not a claim
  // that Click has documented its complete ID range/type constraints.
  if(!Number.isSafeInteger(orderId)||orderId<1)throw Error('invalid_click_order_id');
  if(!credentials||!['User_Name','User_Pass'].every(k=>typeof credentials[k]==='string'&&credentials[k].length>0&&credentials[k].length<=2000))throw Error('invalid_click_credentials');
  return {Order_ID:orderId,User_Name:credentials.User_Name,User_Pass:credentials.User_Pass};
}
function assertClickUrl(company){
  let url;try{url=new URL(company.apiUrl);}catch(_){throw Error('invalid_click_url');}
  if(url.href.replace(/\/$/,'')!==CLICK_BASE)throw Error('invalid_click_url');
}
const blocked=()=>{throw Error('click_contract_incomplete');};
// Quarantined adapter: there is no production path for shipment creation,
// polling, removal or an invented /health endpoint while responses are unknown.
const clickDelivery=Object.freeze({health:blocked,create:blocked,status:blocked});
async function exerciseGetOrderRequest(company,credentials,orderId,transport){
  if(typeof transport!=='function')throw Error('click_live_calls_disabled');
  assertClickUrl(company);
  await vendorRequest({...company,provider:CLICK_PROVIDER},null,'POST','/getorder',getOrderBody(orderId,credentials),transport);
  // HTTP 200 and an object are not evidence of business success. Discard the
  // unverified response: no IDs/statuses/amounts are guessed or persisted.
  throw Error('click_response_contract_incomplete');
}
module.exports={CLICK_PROVIDER,CLICK_BASE,assertClickUrl,getOrderBody,exerciseGetOrderRequest,clickDelivery};
