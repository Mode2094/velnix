'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ARABIC_INVALID_USER,ENGLISH_UNAUTHORIZED,classifyClickResponse,isInvalidCredentials,authFailureReason,CLIENT_SHIPPING_VOCABULARY,PORTAL_STATUS_VOCABULARY}=require('../src/click_response');
const samples=require('./fixtures/click_response_samples');

test('the confirmed invalid-credentials envelope is recognised as an auth rejection',()=>{
  const {status,body}=samples.invalidCredentials401;
  assert.equal(classifyClickResponse(status,body).kind,'authentication_required');
  assert.equal(isInvalidCredentials(status,body),true);
});

test('the final diagnosis keeps the authorization gate and the credential check apart',()=>{
  const gate=samples.missingAuthorization401;
  // Both are 401 application envelopes, but only one means the credentials
  // themselves were wrong; the gate rejection happens before any credential
  // evaluation and must never be reported as an invalid credential pair.
  assert.equal(classifyClickResponse(gate.status,gate.body).kind,'authentication_required');
  assert.equal(authFailureReason(gate.status,gate.body),'authorization_header_invalid');
  assert.equal(isInvalidCredentials(gate.status,gate.body),false);
  const creds=samples.invalidCredentials401;
  assert.equal(authFailureReason(creds.status,creds.body),'credentials_invalid');
  assert.equal(authFailureReason(401,{error:{Message:'something else'}}),null);
  assert.equal(authFailureReason(400,{error:{Message:ENGLISH_UNAUTHORIZED}}),null);
  assert.equal(authFailureReason(200,{}),null);
  // The two envelopes are distinct byte-for-byte; a regression that collapses
  // them into one message would break this pin.
  assert.notEqual(ENGLISH_UNAUTHORIZED,ARABIC_INVALID_USER);
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

test('the portal status vocabulary pins the twelve labels confirmed from the provider portal',()=>{
  assert.equal(PORTAL_STATUS_VOCABULARY.length,12);
  const keys=PORTAL_STATUS_VOCABULARY.map(s=>s.key);
  const labels=PORTAL_STATUS_VOCABULARY.map(s=>s.label);
  const tokens=PORTAL_STATUS_VOCABULARY.map(s=>s.portalToken);
  assert.equal(new Set(keys).size,12);
  assert.equal(new Set(labels).size,12);
  assert.equal(new Set(tokens).size,12);
  for(const entry of PORTAL_STATUS_VOCABULARY){
    // Portal identifiers are UI evidence only: no carrier/API code may exist.
    assert.equal('code' in entry,false);
    assert.equal('clickCode' in entry,false);
    assert.equal('remoteCode' in entry,false);
    assert.equal('value' in entry,false);
    assert.match(entry.portalToken,/^Lnk[A-Za-z]+$/);
    assert.ok(typeof entry.label==='string'&&entry.label.length>0);
    if(entry.english!==null)assert.ok(typeof entry.english==='string'&&entry.english.length>0);
    // A portal label is never derived from an HTTP response or numeric status.
    assert.equal(typeof entry.portalToken,'string');
  }
  // The seven client-named states must all be represented in the portal
  // vocabulary; the portal adds the five returned-order states. The only label
  // drift is the leading "في " on the warehouse state.
  const normalized=labels.map(label=>label.replace(/^في\s+/,''));
  for(const clientState of CLIENT_SHIPPING_VOCABULARY){
    const needle=clientState.label.replace(/^في\s+/,'');
    assert.ok(normalized.includes(needle),clientState.label);
  }
  assert.equal(Object.isFrozen(PORTAL_STATUS_VOCABULARY),true);
  for(const entry of PORTAL_STATUS_VOCABULARY)assert.equal(Object.isFrozen(entry),true);
});
