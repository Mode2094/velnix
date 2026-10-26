'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {CLICK_PROVIDER,CLICK_BASE,clickDelivery,getOrderBody,assertClickUrl}=require('../src/click_delivery');
const {providerFor,requireOperationalProvider}=require('../src/providers');
const {SHIPPING_STATUSES,shippingStatus}=require('../src/shipping_status');
const contract=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','docs','evidence','click-delivery-contract.json'),'utf8'));

const CLICK_COMPANY={provider:CLICK_PROVIDER,apiUrl:CLICK_BASE,name:'click'};

test('the four blocking ambiguities are recorded as undocumented, not decided',()=>{
  const gaps=contract.not_documented.join(' | ').toLowerCase();
  // D4 HTTP method for setorder
  assert.match(gaps,/setorder http method/);
  // D7 currency and fee semantics for Ord_Amt
  assert.match(gaps,/currency and ord_amt fee semantics/);
  // D9 carrier status codes
  assert.match(gaps,/status codes and their field name\/type/);
  // D10 Client_Serial / Order_ID / tracking / idempotency
  assert.match(gaps,/client_serial\/order_id\/tracking relationship and idempotency/);
});

test('setorder has no documented method, so shipment creation stays blocked',()=>{
  const setorder=contract.requests.find(r=>r.name==='setorder');
  assert.equal(setorder.method,null);
  assert.equal(setorder.operational,false);
  // The code must agree with the evidence file rather than guess.
  assert.throws(()=>clickDelivery.create(),/click_contract_incomplete/);
});

test('no Click request is marked operational and none ships a real call',()=>{
  for(const request of contract.requests){
    assert.equal(request.operational,false,`${request.name} must stay non-operational`);
    assert.equal(request.response_examples,0,`${request.name} has no verified response`);
  }
  assert.throws(()=>clickDelivery.status(),/click_contract_incomplete/);
  assert.throws(()=>clickDelivery.health(),/click_contract_incomplete/);
});

test('a Click carrier can be prepared but never becomes operational',()=>{
  // providerFor accepts the adapter for draft/health inspection of config only.
  assert.equal(typeof providerFor(CLICK_COMPANY).create,'function');
  // The operational gate must still refuse, which is what protects dispatch.
  assert.throws(()=>requireOperationalProvider(CLICK_COMPANY),/click_contract_incomplete/);
});

test('the generic adapter cannot impersonate Click and vice versa',()=>{
  assert.throws(()=>providerFor({provider:'generic_v1',apiUrl:CLICK_BASE+'/'}),/click_requires_dedicated_adapter/);
  assert.throws(()=>assertClickUrl({apiUrl:'https://evil.example.com/Client'}),/invalid_click_url/);
});

test('getorder body matches the documented shape and refuses malformed input',()=>{
  const creds={User_Name:'u',User_Pass:'p'};
  assert.deepEqual(getOrderBody(7,creds),{Order_ID:7,User_Name:'u',User_Pass:'p'});
  for(const bad of [0,-1,1.5,'7',Number.MAX_SAFE_INTEGER+1,NaN])
    assert.throws(()=>getOrderBody(bad,creds),/invalid_click_order_id/);
  for(const bad of [null,{}, {User_Name:'u'}, {User_Name:'',User_Pass:'p'}, {User_Name:'u',User_Pass:'x'.repeat(2001)}])
    assert.throws(()=>getOrderBody(7,bad),/invalid_click_credentials/);
});

test('carrier status codes are never invented and stay separate from Velnix states',()=>{
  // Numeric or unknown carrier codes must not resolve to a Velnix state. The
  // vocabulary accepts only the client-supplied business names.
  for(const raw of [1,2,3,'1','2','3','','DELIVERED','delivered_by_click','تم التسليم'])
    assert.equal(shippingStatus(raw),null,`${String(raw)} must not map silently`);
  for(const raw of [null,undefined,{},[],true])assert.equal(shippingStatus(raw),null);
  // The vocabulary itself is the client-supplied business set, unchanged.
  assert.deepEqual([...SHIPPING_STATUSES],['awaitingPickup','carrierWarehouse','outForDelivery','delivered','partiallyDelivered','deferred','cancelled']);
  assert.equal(shippingStatus('delivered'),'delivered');
});

test('no shipping fee or collection field exists, so no amount can be double counted',()=>{
  // With Ord_Amt semantics unresolved there is deliberately no second money
  // field to add to it. This asserts the model stays that way.
  const policy=fs.readFileSync(path.join(__dirname,'..','src','policy.js'),'utf8');
  for(const forbidden of ['shippingFee','deliveryFee','collectionAmount','codAmount'])
    assert.equal(policy.includes(forbidden),false,`${forbidden} must not exist while Ord_Amt is undecided`);
});
