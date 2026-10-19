'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {CLICK_BASE,CLICK_PROVIDER,CLICK_CLIENT_SERIAL_MAX,CLICK_SETORDER_FIELDS,getOrderBody,getOrderBodyByUserId,setOrderBody,classifySetOrderResponse,isAmbiguousSetOrderOutcome,clickOrderIdFromSetOrderResponse,exerciseGetOrderRequest,readClickOrder,sendClickOrder}=require('../src/click_delivery');
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
test('setorder builder emits exactly the twelve supplied fields and refuses an overlong Client_Serial instead of silently truncating it',()=>{
  const serial='VNX-CLICK-TEST-20261019-d';
  const body=setOrderBody({id:'order-1',clientSerial:serial,customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',quantity:1,amountMinor:1000,note:'ملاحظة'},{User_Name:'local-user',User_Pass:'local-pass'});
  assert.deepEqual(Object.keys(body).sort(),[...CLICK_SETORDER_FIELDS].sort());
  assert.equal(body.Client_Serial,serial);
  assert.equal(body.Client_Serial.length,CLICK_CLIENT_SERIAL_MAX);
  assert.equal(body.Reciver_Address,'عمان - وسط - شارع اختبار');
  assert.equal(body.Ord_Amt,1);
  assert.equal(body.Ord_Quantity,1);
  assert.equal(body.Is_Ord_Exchange,false);
  assert.equal(body.Open_Shippment,false);
  assert.throws(()=>setOrderBody({id:'order-1',clientSerial:'VNX-CLICK-TEST-20261019-d4a0f8fb',customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',quantity:1,amountMinor:1000},{User_Name:'local-user',User_Pass:'local-pass'}),/invalid_click_client_serial/);
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
test('the verified read shape is exactly the 25-character Client_Serial as Order_ID plus numeric User_ID',()=>{
  assert.deepEqual(Object.keys(getOrderBodyByUserId('VNX-CLICK-TEST-20261019-d',1603)).sort(),['Order_ID','User_ID']);
  assert.deepEqual(getOrderBodyByUserId('VNX-CLICK-TEST-20261019-d',1603),{Order_ID:'VNX-CLICK-TEST-20261019-d',User_ID:1603});
  for(const ref of [1318368,'', 'x'.repeat(26)])assert.throws(()=>getOrderBodyByUserId(ref,1603),/invalid_click_order_ref/);
  for(const uid of [0,-1,'abc'])assert.throws(()=>getOrderBodyByUserId('VNX-CLICK-TEST-20261019-d',uid),/invalid_click_user_id/);
});
test('the live-verified read request is POST getorder with the exact serial and User_ID and no extra field',async()=>{
  const fixture={result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00',Ord_Status_Note:'شحنة قيد انتظار الموافقة',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}};
  let received;
  const transport=async(url,options)=>{received={url,options};return new Response(JSON.stringify(fixture),{status:200,headers:{'content-type':'application/json'}})};
  const out=await readClickOrder(company,'VNX-CLICK-TEST-20261019-d',1603,transport);
  assert.equal(out.status,200);assert.deepEqual(out.json,fixture);
  assert.equal(received.url,CLICK_BASE+'/getorder');
  assert.equal(received.options.method,'POST');assert.equal(received.options.redirect,'error');
  assert.equal(received.options.headers.Authorization,'client');
  assert.deepEqual(JSON.parse(received.options.body),{Order_ID:'VNX-CLICK-TEST-20261019-d',User_ID:1603});
});
test('the policy number and malformed identifiers are refused before any read transport call',async()=>{
  let calls=0;const spy=async()=>{calls++;return new Response('{}')};
  for(const [ref,uid] of [[1318368,1603],['',1603],['x'.repeat(26),1603],['VNX-CLICK-TEST-20261019-d',0]])await assert.rejects(readClickOrder(company,ref,uid,spy),/invalid_click_order_ref|invalid_click_user_id/);
  assert.equal(calls,0);
});
test('the production send path is refused by the server-side flag before any transport call',async()=>{
  let calls=0;const spy=async()=>{calls++;return new Response('{}')};
  await assert.rejects(sendClickOrder({...company,clickSendEnabled:false},{id:'o',customer:'c',phone:'0779557077',city:'c',area:'a',address:'x',description:'d',quantity:1,amountMinor:1},{User_Name:'u',User_Pass:'p'},spy),/click_send_disabled/);
  assert.equal(calls,0);
});
test('the observed setorder 400/200 outcomes are ambiguous creations that carry the exact merchant reference',async()=>{
  const enabled={...company,clickSendEnabled:true};
  const order={id:'order-1',clientSerial:'VNX-CLICK-TEST-20261019-d',customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',quantity:1,amountMinor:1000};
  const creds={User_Name:'local-user',User_Pass:'local-pass'};
  const observed={error:{Message:"The cast to value type 'System.Int64' failed because the materialized value is null."}};
  for(const [status,payload] of [[400,observed],[200,{}]]){
    let received;
    const transport=async(url,options)=>{received={url,options};return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}})};
    await assert.rejects(sendClickOrder(enabled,order,creds,transport),(e)=>{
      assert.equal(e.code,'click_ambiguous_creation');
      assert.equal(e.clickOrderRef,'VNX-CLICK-TEST-20261019-d');
      assert.equal(e.clickClientSerial,'VNX-CLICK-TEST-20261019-d');
      return true;
    });
    assert.equal(received.url,CLICK_BASE+'/setorder');
    assert.equal(received.options.headers.Authorization,'client');
    assert.deepEqual(JSON.parse(received.options.body).Client_Serial,'VNX-CLICK-TEST-20261019-d');
  }
});
test('setorder auth and validation rejections stay distinct and never report a created shipment',async()=>{
  const enabled={...company,clickSendEnabled:true};
  const order={id:'order-1',clientSerial:'VNX-CLICK-TEST-20261019-d',customer:'Velnix API Test',phone:'0779557077',city:'عمان',area:'وسط',address:'شارع اختبار',description:'طرد اختبار',quantity:1,amountMinor:1000};
  const creds={User_Name:'local-user',User_Pass:'local-pass'};
  const respond=(body,status)=>async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  await assert.rejects(sendClickOrder(enabled,order,creds,respond({error:{Message:'بيانات مستخدم غير صحيحة'}},401)),(e)=>{assert.equal(e.code,'click_auth_failed');assert.equal(e.clickOrderRef,undefined);return true;});
  await assert.rejects(sendClickOrder(enabled,order,creds,respond({error:{Message:'validation failed'}},400)),(e)=>{assert.equal(e.code,'click_send_rejected');return true;});
  await assert.rejects(sendClickOrder(enabled,order,creds,respond({error:{Message:'server error'}},500)),(e)=>{assert.equal(e.code,'click_send_rejected');return true;});
});
