'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {CLICK_BASE,CLICK_PROVIDER,getOrderBody,exerciseGetOrderRequest}=require('../src/click_delivery');
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
