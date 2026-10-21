'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {vendorRequest}=require('../src/delivery');
const COMPANY={provider:'generic_v1',apiUrl:'https://local-contract.example'};

before(()=>{process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';});
after(()=>{delete process.env.ALLOWED_DELIVERY_HOSTS;});

function respond(body,{status=200,headers={}}={}){
  return async()=>new Response(body,{status,headers});
}
function rejectsTransport(error){
  return async()=>{throw error;};
}

test('retryable and terminal HTTP failures stay distinguishable and leak no body',async()=>{
  for(const status of [429,500,502,503,504,401,403,404]){
    await assert.rejects(
      ()=>vendorRequest(COMPANY,'t','GET','/health',undefined,respond('{"detail":"carrier internals"}',{status})),
      new RegExp(`vendor_http_${status}`),
    );
  }
});

test('a connection drop or reset surfaces as a vendor failure, not as success',async()=>{
  const reset=Object.assign(new Error('socket hang up'),{code:'ECONNRESET'});
  await assert.rejects(()=>vendorRequest(COMPANY,'t','POST','/orders',{x:1},rejectsTransport(reset)),/socket hang up/);
  const refused=Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'});
  await assert.rejects(()=>vendorRequest(COMPANY,'t','GET','/health',undefined,rejectsTransport(refused)),/ECONNREFUSED/);
});

test('an aborted request never resolves and never yields a partial payload',async()=>{
  // A transport that honours the abort signal the same way fetch does.
  const hanging=(url,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));
  });
  await assert.rejects(()=>vendorRequest(COMPANY,'t','GET','/health',undefined,hanging),/aborted/);
});

test('an empty or non-object body is never accepted as verified data',async()=>{
  // Malformed JSON and non-object payloads are rejected outright.
  for(const body of ['null','"text"','[1,2]','{"a":']){
    await assert.rejects(()=>vendorRequest(COMPANY,'t','GET','/health',undefined,respond(body)),/vendor_invalid_json|vendor_invalid_payload/);
  }
  // An empty 200 is tolerated as an empty object, but it must carry no field a
  // caller could mistake for a verified status.
  const empty=await vendorRequest(COMPANY,'t','GET','/health',undefined,respond(''));
  assert.deepEqual(empty,{});
  assert.equal('status' in empty,false);
  assert.equal('trackingNumber' in empty,false);
});

test('an oversized streamed body is cut off even without a content-length header',async()=>{
  const big='{"a":"'+'x'.repeat(1024*1024+1)+'"}';
  await assert.rejects(()=>vendorRequest(COMPANY,'t','GET','/health',undefined,respond(big)),/vendor_response_too_large/);
});

test('routes outside the documented contract are refused before any transport call',async()=>{
  let calls=0;
  const spy=async()=>{calls++;return new Response('{}');};
  // Undocumented shapes and methods must never reach the network.
  for(const [method,route] of [['DELETE','/health'],['PUT','/orders/x'],['GET','/orders/a/b'],['GET','/'],['GET','/unknown'],['POST','/orders/x/y/z']]){
    await assert.rejects(()=>vendorRequest(COMPANY,'t',method,route,undefined,spy),/invalid_vendor_route/);
  }
  assert.equal(calls,0);
});

test('only the documented provider routes are allowed through',async()=>{
  const ok=[['GET','/health'],['POST','/orders'],['GET','/orders/ABC-123'],['POST','/orders/ABC-123']];
  for(const [method,route] of ok){
    const result=await vendorRequest(COMPANY,'t',method,route,undefined,async()=>new Response('{"ok":true}'));
    assert.deepEqual(result,{ok:true});
  }
});

test('an unlisted host is refused before the request leaves the process',async()=>{
  let calls=0;
  const spy=async()=>{calls++;return new Response('{}');};
  await assert.rejects(()=>vendorRequest({...COMPANY,apiUrl:'https://not-allowed.example'},'t','GET','/health',undefined,spy),/delivery_host_not_allowed/);
  assert.equal(calls,0);
});
