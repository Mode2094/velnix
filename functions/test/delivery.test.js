const {test}=require('node:test');const assert=require('node:assert/strict');
// delivery.js requires a Cloud KMS client at import time; unit test isolated policy via module mock
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){ if(name==='@google-cloud/kms')return {KeyManagementServiceClient:class{}};return load.call(this,name,...args);};
const {allowedUrl,verifyWebhook,remoteCanAdvance}=require('../src/delivery'); Module._load=load;
const crypto=require('node:crypto');
test('only deployment-configured HTTPS delivery hosts are accepted',()=>{
  process.env.ALLOWED_DELIVERY_HOSTS='api.partner.example';
  assert.equal(allowedUrl('https://api.partner.example/v1'),'https://api.partner.example/v1');
  assert.throws(()=>allowedUrl('http://api.partner.example/v1'));
  assert.throws(()=>allowedUrl('https://127.0.0.1'));
  assert.throws(()=>allowedUrl('https://api.partner.example.evil.test'));
});
test('HMAC requires unexpired timestamp and correct body',()=>{
  const raw=Buffer.from('{"tracking":"T1"}');const ts=String(Math.floor(Date.now()/1000));
  const sign='sha256='+crypto.createHmac('sha256','secret').update(`${ts}.`).update(raw).digest('hex');
  assert.equal(verifyWebhook(raw,ts,sign,'secret'),true);
  assert.equal(verifyWebhook(Buffer.from('bad'),ts,sign,'secret'),false);
  assert.equal(verifyWebhook(raw,'1',sign,'secret'),false);
});
test('late remote events never reopen delivered orders',()=>{
  assert.equal(remoteCanAdvance('dispatched','delivered'),true);
  assert.equal(remoteCanAdvance('delivered','inTransit'),false);
  assert.equal(remoteCanAdvance('inTransit','returned'),true);
});
