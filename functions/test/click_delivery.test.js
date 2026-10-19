'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {CLICK_BASE,CLICK_PROVIDER,CLICK_CLIENT_SERIAL_MAX,CLICK_SETORDER_FIELDS,getOrderBody,getOrderBodyByUserId,setOrderBody,classifySetOrderResponse,isAmbiguousSetOrderOutcome,clickOrderIdFromSetOrderResponse,exerciseGetOrderRequest}=require('../src/click_delivery');
const {providerFor,requireOperationalProvider}=require('../src/providers');
const {vendorRequest}=require('../src/delivery');
const company={provider:CLICK_PROVIDER,apiUrl:CLICK_BASE};
const credentials={User_Name:'local-fixture-user',User_Pass:'local-fixture-password'};
let server,local,received;
before(async()=>{
  process.env.ALLOWED_DELIVERY_HOSTS='admin.clickdelivery.org,local-contract.example';
  server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    received={method:req.method,path:req.url,authorization:req.headers.authorization,contentType:req.headers['content-type'],accept:req.headers.accept,body:JSON.parse(raw)};
    // This fixture intentionally invents NO Click success schema.
    res.setHeader('Content-Type','application/json');res.end('{"unverified_fixture":true}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));local='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));});
test('documented getorder POST and credential fields travel only to a local fixture; HTTP 200 is not success',async()=>{
  let calls=0;
  const transport=(url,options)=>{calls++;assert.equal(url,CLICK_BASE+'/getorder');assert.equal(options.redirect,'error');return fetch(local+new URL(url).pathname,options);};
  await assert.rejects(exerciseGetOrderRequest(company,credentials,1,transport),/click_response_contract_incomplete/);
  assert.equal(calls,1);
  // The wire format is pinned to the documented contract: POST, the literal
  // Authorization gate, JSON body with exactly the three documented fields.
  assert.deepEqual(received,{method:'POST',path:'/Client/getorder',authorization:'client',contentType:'application/json',accept:'application/json',body:{Order_ID:1,...credentials}});
});
test('Click operational adapter cannot create, poll, test fictitious health or use default live transport',async()=>{
  const adapter=providerFor(company);
  for(const method of ['health','create','status'])assert.throws(()=>adapter[method](),/click_contract_incomplete/);
  assert.throws(()=>requireOperationalProvider(company),/click_contract_incomplete/);
  await assert.rejects(exerciseGetOrderRequest(company,credentials,1),/click_live_calls_disabled/);
  await assert.rejects(vendorRequest(company,null,'POST','/getorder',{Order_ID:1,...credentials}),/click_live_calls_disabled/);
  let calls=0;
  for(const route of ['/removeorder','/setorder','/health','/orders']){
    await assert.rejects(vendorRequest(company,null,'POST',route,{},async()=>{calls++;}),/invalid_vendor_route/);
  }
  assert.equal(calls,0);
});
test('exact HTTPS Click host/base and allowlist remain mandatory; generic contract cannot impersonate Click',async()=>{
  for(const apiUrl of ['http://admin.clickdelivery.org/Client','https://other.example/Client',CLICK_BASE+'?key=hidden',CLICK_BASE+'#x','https://user:pass@admin.clickdelivery.org/Client',CLICK_BASE+'/other'])assert.throws(()=>providerFor({...company,apiUrl}),/invalid_click_url/);
  assert.throws(()=>providerFor({...company,provider:'generic_v1'}),/click_requires_dedicated_adapter/);
  const old=process.env.ALLOWED_DELIVERY_HOSTS;process.env.ALLOWED_DELIVERY_HOSTS='';
  try{await assert.rejects(exerciseGetOrderRequest(company,credentials,1,async()=>{throw Error('must not call');}),/delivery_host_not_allowed/);}finally{process.env.ALLOWED_DELIVERY_HOSTS=old;}
});
test('invalid IDs/credentials, HTTP errors and malformed/oversized responses do not become verified data',async()=>{
  for(const id of [0,-1,'1',1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>getOrderBody(id,credentials),/invalid_click_order_id/);
  assert.throws(()=>getOrderBody(1,{User_Name:'user',User_Pass:''}),/invalid_click_credentials/);
  assert.equal(getOrderBody(1,{...credentials,User_Pass:' password with spaces '}).User_Pass,' password with spaces ');
  for(const [response,error] of [[new Response('{}',{status:401}),/vendor_http_401/],[new Response('not JSON'),/vendor_invalid_json/],[new Response('[]'),/vendor_invalid_payload/],[new Response('{}',{headers:{'content-length':'1048577'}}),/vendor_response_too_large/]])await assert.rejects(exerciseGetOrderRequest(company,credentials,1,async()=>response),error);
});
test('setorder builder emits exactly the twelve supplied fields and mirrors the observed 25-character Client_Serial limit',()=>{
  const body=setOrderBody({id:'order-1',clientSerial:'VNX-CLICK-TEST-20261019-d4a0f8fb',customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',quantity:1,amountMinor:1000,note:'ملاحظة'},{User_Name:'local-user',User_Pass:'local-pass'});
  assert.deepEqual(Object.keys(body).sort(),[...CLICK_SETORDER_FIELDS].sort());
  assert.equal(body.Client_Serial.length,CLICK_CLIENT_SERIAL_MAX);
  assert.equal(body.Client_Serial,'VNX-CLICK-TEST-20261019-d');
  assert.equal(body.Reciver_Address,'عمان - وسط - شارع اختبار');
  assert.equal(body.Ord_Amt,1);
  assert.equal(body.Ord_Quantity,1);
  assert.equal(body.Is_Ord_Exchange,false);
  assert.equal(body.Open_Shippment,false);
});
test('setorder builder rejects missing or invalid values instead of inventing them',()=>{
  const creds={User_Name:'u',User_Pass:'p'};
  const base={id:'o',customer:'c',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1};
  for(const [patch,error] of [[{customer:''},/invalid_click_receiver_name/],[{phone:'123'},/invalid_click_receiver_phone/],[{city:'',area:'',address:''},/invalid_click_receiver_address/],[{quantity:0},/invalid_click_quantity/],[{amountMinor:-1},/invalid_click_amount/]])assert.throws(()=>setOrderBody({...base,...patch},creds),error);
  assert.throws(()=>setOrderBody(base,{User_Name:'u'}),/invalid_click_credentials/);
  assert.throws(()=>setOrderBody(null,creds),/invalid_click_order/);
});
test('the observed HTTP 400 Int64 response is an ambiguous creation, never a success or a plain rejection',()=>{
  const observed={error:{Message:"The cast to value type 'System.Int64' failed because the materialized value is null. Either the result type's generic parameter or the query must use a nullable type."}};
  assert.equal(classifySetOrderResponse(400,observed).kind,'ambiguous_creation');
  assert.equal(isAmbiguousSetOrderOutcome(400,observed),true);
  assert.equal(classifySetOrderResponse(401,{error:{Message:'بيانات مستخدم غير صحيحة'}}).kind,'auth_required');
  assert.equal(classifySetOrderResponse(400,{error:{Message:'validation failed'}}).kind,'rejected');
  assert.equal(classifySetOrderResponse(500,{error:{Message:'boom'}}).kind,'rejected');
  assert.equal(classifySetOrderResponse(200,{}).kind,'ambiguous_creation');
  assert.equal(classifySetOrderResponse(200,{Order_ID:1318368}).kind,'ambiguous_creation');
});
test('only a numeric positive Order_ID is extracted; no other identifier key is invented',()=>{
  assert.equal(clickOrderIdFromSetOrderResponse({Order_ID:1318368}),1318368);
  for(const value of [{},{orderId:1318368},{Order_ID:'1318368'},{Order_ID:0},{Order_ID:-1},null,[],'1318368'])assert.equal(clickOrderIdFromSetOrderResponse(value),null);
});
test('the programmer-supplied read shape is exactly Order_ID plus User_ID and nothing else',()=>{
  assert.deepEqual(Object.keys(getOrderBodyByUserId(1318368,1603)).sort(),['Order_ID','User_ID']);
  assert.deepEqual(getOrderBodyByUserId(1318368,1603),{Order_ID:1318368,User_ID:1603});
  assert.throws(()=>getOrderBodyByUserId(0,1603),/invalid_click_order_id/);
  assert.throws(()=>getOrderBodyByUserId(1318368,'abc'),/invalid_click_client_code/);
});
