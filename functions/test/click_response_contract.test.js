'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ARABIC_INVALID_USER,classifyClickResponse,isInvalidCredentials,CLIENT_SHIPPING_VOCABULARY}=require('../src/click_response');
const samples=require('./fixtures/click_response_samples');

test('the confirmed invalid-credentials envelope is recognised as an auth rejection',()=>{
  const {status,body}=samples.invalidCredentials401;
  assert.equal(classifyClickResponse(status,body).kind,'authentication_required');
  assert.equal(isInvalidCredentials(status,body),true);
});

test('a framework rejection uses a different envelope and is not read as app data',()=>{
  const {status,body}=samples.methodNotAllowed405;
  const result=classifyClickResponse(status,body);
  assert.equal(result.kind,'framework_error');
  // A bare Message must never be mistaken for a payload field.
  assert.equal('error' in body,false);
});

test('the empty-body setorder rejection is an application error, never a success',()=>{
  const {status,body}=samples.setOrderEmptyBody400;
  const result=classifyClickResponse(status,body);
  assert.equal(result.kind,'application_error');
  assert.notEqual(result.kind,'unverified');
});

test('an undocumented 2xx is unverified rather than treated as data',()=>{
  for(const body of [{},samples.emptyTwoHundred.body,{Order_ID:1},{status:'x'},{result:[]}]){
    const result=classifyClickResponse(200,body);
    assert.equal(result.kind,'unverified',`${JSON.stringify(body)} must not be treated as data`);
  }
});

test('non-2xx without a known envelope is an http error, not an application message',()=>{
  for(const status of [400,401,403,404,405,429,500,503]){
    const result=classifyClickResponse(status,{something:'else'});
    assert.equal(result.kind,'http_error',`status ${status}`);
  }
});

test('malformed inputs never throw and never classify as success',()=>{
  for(const value of [null,undefined,'text',0,[],['error'],[{error:[{Message:'x'}]}],{error:'x'},{error:null},{error:{Message:7}},{Message:7}]){
    const result=classifyClickResponse(200,value);
    assert.notEqual(result.kind,'authentication_required');
    assert.notEqual(result.kind,'application_error');
  }
});

test('an error envelope is never reported as authentication when the status is not 401',()=>{
  const {body}=samples.invalidCredentials401;
  const result=classifyClickResponse(400,body);
  assert.equal(result.kind,'application_error');
  assert.equal(isInvalidCredentials(400,body),false);
});

test('the provider example credentials are rejected, so they are not a usable secret',()=>{
  // The published example pair never authenticated in the live probe. This pins
  // that it stays a sample rather than being promoted to a working credential.
  const result=classifyClickResponse(401,{error:{Message:ARABIC_INVALID_USER}});
  assert.equal(result.kind,'authentication_required');
});

test('client shipping vocabulary is display text only and carries no carrier codes',()=>{
  assert.equal(CLIENT_SHIPPING_VOCABULARY.length,7);
  const keys=CLIENT_SHIPPING_VOCABULARY.map(s=>s.key);
  assert.deepEqual(keys,['awaitingPickup','carrierWarehouse','outForDelivery','delivered','partiallyDelivered','deferred','cancelled']);
  for(const entry of CLIENT_SHIPPING_VOCABULARY){
    assert.equal(typeof entry.label,'string');assert.ok(entry.label.length);
    // No numeric or text carrier code may be attached until the provider
    // supplies one; the vocabulary is deliberately code-free.
    assert.equal('code' in entry,false);
    assert.equal('clickCode' in entry,false);
    assert.equal('remoteCode' in entry,false);
  }
});

test('the vocabulary is frozen so no runtime mapping can be attached to it',()=>{
  assert.equal(Object.isFrozen(CLIENT_SHIPPING_VOCABULARY),true);
  for(const entry of CLIENT_SHIPPING_VOCABULARY)assert.equal(Object.isFrozen(entry),false);
});
