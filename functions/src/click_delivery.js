'use strict';
const {vendorRequest}=require('./delivery');
const {classifyClickResponse}=require('./click_response');
const CLICK_PROVIDER='click_delivery_v1';
const CLICK_BASE='https://admin.clickdelivery.org/Client';
// Observed live on 2026-10-19: Click stored only the first 25 characters of the
// supplied Client_Serial. This local limit mirrors that provider behaviour; it
// is not a documented field constraint.
const CLICK_CLIENT_SERIAL_MAX=25;
// The provider's setorder field list, exactly as supplied. No extra field is
// added by the builder. The production route for Click remains blocked.
const CLICK_SETORDER_FIELDS=Object.freeze(['User_Name','User_Pass','Client_Serial','Reciver_Name','Reciver_Phone','Reciver_Address','Ord_Content','Ord_Quantity','Ord_Amt','Ord_Note','Is_Ord_Exchange','Open_Shippment']);
// Request-only evidence: collection /item/0/request. No response schema supplied.
function getOrderBody(orderId,credentials) {
  // A deliberately narrow local subset of the numeric example, not a claim
  // that Click has documented its complete ID range/type constraints.
  if(!Number.isSafeInteger(orderId)||orderId<1)throw Error('invalid_click_order_id');
  if(!credentials||!['User_Name','User_Pass'].every(k=>typeof credentials[k]==='string'&&credentials[k].length>0&&credentials[k].length<=2000))throw Error('invalid_click_credentials');
  return {Order_ID:orderId,User_Name:credentials.User_Name,User_Pass:credentials.User_Pass};
}
// The programmer-supplied read format reported on 2026-10-19. It is kept
// separate from the documented Postman shape and adds no other field.
function getOrderBodyByUserId(orderId,clientCode) {
  if(!Number.isSafeInteger(orderId)||orderId<1)throw Error('invalid_click_order_id');
  const userId=Number(clientCode);
  if(!Number.isSafeInteger(userId)||userId<1)throw Error('invalid_click_client_code');
  return {Order_ID:orderId,User_ID:userId};
}
const CLICK_AMBIGUOUS_CREATE_MESSAGE="The cast to value type 'System.Int64' failed";
function clickClientSerial(value,orderId){
  const raw=typeof value==='string'&&value.trim()?value.trim():`VNX-${orderId}`;
  return raw.slice(0,CLICK_CLIENT_SERIAL_MAX);
}
function clickText(value,max,error){
  const out=typeof value==='string'?value.trim():'';
  if(!out||out.length>max)throw Error(error);
  return out;
}
function clickPhone(value){
  const digits=String(value??'').replace(/\D/g,'');
  if(!/^[0-9]{9,15}$/.test(digits))throw Error('invalid_click_receiver_phone');
  return digits;
}
// Local, test-covered model of a future setorder payload. It is NOT wired to
// the live route: requireOperationalProvider still blocks Click creation until
// the financial and idempotency contract is confirmed.
function setOrderBody(order,credentials) {
  if(!order||typeof order!=='object'||Array.isArray(order))throw Error('invalid_click_order');
  if(!credentials||typeof credentials!=='object'||Array.isArray(credentials)||typeof credentials.User_Name!=='string'||typeof credentials.User_Pass!=='string'||!credentials.User_Name||!credentials.User_Pass)throw Error('invalid_click_credentials');
  const quantity=Number(order.quantity);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw Error('invalid_click_quantity');
  const amountMinor=Number(order.amountMinor);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<0)throw Error('invalid_click_amount');
  const address=[order.city,order.area,order.address].map(v=>typeof v==='string'?v.trim():'').filter(Boolean).join(' - ');
  if(!address)throw Error('invalid_click_receiver_address');
  return {
    User_Name:credentials.User_Name,
    User_Pass:credentials.User_Pass,
    Client_Serial:clickClientSerial(order.clientSerial,order.id),
    Reciver_Name:clickText(order.customer,120,'invalid_click_receiver_name'),
    Reciver_Phone:clickPhone(order.phone),
    Reciver_Address:address,
    Ord_Content:clickText(order.description,500,'invalid_click_content'),
    Ord_Quantity:quantity,
    // The financial meaning of Ord_Amt is NOT confirmed. The caller supplies
    // the local order amount only; this builder does not decide goods-vs-total.
    Ord_Amt:amountMinor/1000,
    Ord_Note:typeof order.note==='string'?order.note.trim().slice(0,600):'',
    Is_Ord_Exchange:order.isOrderExchange===true,
    Open_Shippment:order.openShipment===true,
  };
}
// Classifies a future setorder response without ever claiming a verified
// creation. The only live setorder response observed so far is HTTP 400 with a
// .NET Int64 message while the shipment was nevertheless created.
function classifySetOrderResponse(status,json){
  const base=classifyClickResponse(status,json);
  if(base.kind==='authentication_required')return {kind:'auth_required',message:base.message};
  if(base.kind==='application_error'){
    if(typeof base.message==='string'&&base.message.includes(CLICK_AMBIGUOUS_CREATE_MESSAGE))return {kind:'ambiguous_creation',message:base.message};
    return {kind:'rejected',message:base.message};
  }
  if(base.kind==='framework_error'||base.kind==='http_error')return {kind:'rejected',message:base.message};
  // Any 2xx without a documented success body may still have created a
  // shipment. It must never be presented as confirmed.
  return {kind:'ambiguous_creation',message:null};
}
function isAmbiguousSetOrderOutcome(status,json){
  return classifySetOrderResponse(status,json).kind==='ambiguous_creation';
}
// Order_ID is the only documented identifier name. Other names are not guessed.
function clickOrderIdFromSetOrderResponse(json){
  if(!json||typeof json!=='object'||Array.isArray(json))return null;
  const value=json.Order_ID;
  return Number.isSafeInteger(value)&&value>0?value:null;
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
module.exports={CLICK_PROVIDER,CLICK_BASE,CLICK_CLIENT_SERIAL_MAX,CLICK_SETORDER_FIELDS,assertClickUrl,getOrderBody,getOrderBodyByUserId,setOrderBody,classifySetOrderResponse,isAmbiguousSetOrderOutcome,clickOrderIdFromSetOrderResponse,exerciseGetOrderRequest,clickDelivery};
