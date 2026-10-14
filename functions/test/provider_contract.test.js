'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {providerFor}=require('../src/providers');
const {vendorRequest,verifyWebhook}=require('../src/delivery');
let server,base;const shipments=new Map();
before(async()=>{
  process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
  server=http.createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer local-test'){res.writeHead(401);return res.end('{}');}
    if(req.url==='/health')return res.end('{"status":"ok"}');
    if(req.method==='POST'&&req.url==='/orders'){
      let text='';for await(const chunk of req)text+=chunk;
      const order=JSON.parse(text);
      if(!order.reference||order.idempotencyKey!==order.reference||order.paymentMethod!=='عند الاستلام'){res.writeHead(400);return res.end('{}');}
      if(!shipments.has(order.idempotencyKey))shipments.set(order.idempotencyKey,{trackingNumber:'T-'+order.reference,status:'in_transit',order});
      return res.end(JSON.stringify(shipments.get(order.idempotencyKey)));
    }
    if(req.url==='/orders/T-order')return res.end(JSON.stringify(shipments.get('order')));
    res.writeHead(404);res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
// Transport injection is only used by tests. Production validates HTTPS/allowlist.
const transport=(url,options)=>fetch(base+new URL(url).pathname,options);
const company={provider:'generic_v1',apiUrl:'https://local-contract.example'};
test('reference adapter performs real local health/create/status requests with idempotency',async()=>{
  const adapter=providerFor(company);
  assert.equal((await adapter.health(company,'local-test',transport)).status,'ok');
  const order={id:'order',customer:'عميل',phone:'0791234567',city:'عمان',area:'وسط',address:'شارع',description:'طرد',quantity:1,amountMinor:12345,paymentMethod:'عند الاستلام'};
  const first=await adapter.create(company,'local-test',order,transport);
  const second=await adapter.create(company,'local-test',order,transport);
  assert.equal(first.trackingNumber,second.trackingNumber);assert.equal(shipments.size,1);
  assert.equal(first.order.amount,12.345);
  assert.equal((await adapter.status(company,'local-test',first.trackingNumber,transport)).status,'in_transit');
  await assert.rejects(adapter.health(company,'wrong',transport),/vendor_http_401/);
});
test('vendor errors, oversized bodies and malformed payloads fail closed',async()=>{
  for(const [response,error]of [[new Response('not json'),/vendor_invalid_json/],[new Response('[]'),/vendor_invalid_payload/],[new Response('{}',{status:429}),/vendor_http_429/],[new Response('{}',{headers:{'content-length':'1048577'}}),/vendor_response_too_large/]]){
    await assert.rejects(vendorRequest(company,'test','GET','/health',undefined,async()=>response),error);
  }
  await assert.rejects(vendorRequest(company,'test','GET','//evil.test'),/invalid_vendor_route/);
  assert.throws(()=>providerFor({provider:'unknown'}),/unsupported/);
  assert.equal(verifyWebhook(Buffer.alloc(256*1024+1),'1234567890','sha256='+'a'.repeat(64),'key'),false);
});
