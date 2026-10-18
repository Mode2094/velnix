'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {encryptSecret,decryptSecret,setKmsClientFactory}=require('../src/delivery');
const KEY_NAME='projects/velnix-test/locations/europe-west1/keyRings/velnix/cryptoKeys/secrets';
// An isolated reversible fake. It proves the wiring, base64 framing and
// fail-closed behaviour of our own code. It is NOT evidence that Cloud KMS
// itself works, and no test here claims that.
function fakeKms() {
  const calls={encrypt:0,decrypt:0};
  return {calls,client:{
    encrypt:async({name,plaintext})=>{calls.encrypt++;assert.equal(name,KEY_NAME);
      // XOR so the stored bytes genuinely do not contain the plaintext; the
      // real envelope is opaque too.
      return [{ciphertext:Buffer.from(plaintext.map(b=>b^0x5a))}];},
    decrypt:async({name,ciphertext})=>{calls.decrypt++;assert.equal(name,KEY_NAME);
      return [{plaintext:Buffer.from(Buffer.from(ciphertext).map(b=>b^0x5a))}];},
  }};
}
function withKey(fn){const prev=process.env.VELNIX_KMS_KEY;process.env.VELNIX_KMS_KEY=KEY_NAME;return Promise.resolve().then(fn).finally(()=>{if(prev===undefined)delete process.env.VELNIX_KMS_KEY;else process.env.VELNIX_KMS_KEY=prev;});}

test('missing KMS configuration fails closed instead of storing plaintext',async()=>{
  const prev=process.env.VELNIX_KMS_KEY;delete process.env.VELNIX_KMS_KEY;
  try{
    await assert.rejects(()=>encryptSecret('secret-value'),/kms_not_configured_or_bad_secret/);
    await assert.rejects(()=>decryptSecret('a2V5'),/kms_not_configured/);
  }finally{if(prev!==undefined)process.env.VELNIX_KMS_KEY=prev;}
});

test('empty and oversized secrets are refused before any KMS call',async()=>{
  await withKey(async()=>{
    const fake=fakeKms();setKmsClientFactory(()=>fake.client);
    for(const value of ['',null,undefined,0,{},'x'.repeat(2001)])
      await assert.rejects(()=>encryptSecret(value),/kms_not_configured_or_bad_secret/);
    assert.equal(fake.calls.encrypt,0);
  });
});

test('a secret round-trips and the stored ciphertext never contains it',async()=>{
  await withKey(async()=>{
    const fake=fakeKms();setKmsClientFactory(()=>fake.client);
    const secret='User_Pass:Abc123!حساس';
    const ciphertext=await encryptSecret(secret);
    assert.equal(Buffer.from(ciphertext,'base64').toString('utf8').includes(secret),false);
    assert.equal(await decryptSecret(ciphertext),secret);
    assert.equal(fake.calls.encrypt,1);assert.equal(fake.calls.decrypt,1);
  });
});

test('a decryption failure surfaces as an error and never as a credential',async()=>{
  await withKey(async()=>{
    setKmsClientFactory(()=>({encrypt:async()=>[{ciphertext:Buffer.from('x')}],decrypt:async()=>{throw new Error('kms_denied');}}));
    await assert.rejects(()=>decryptSecret(Buffer.from('not-ours').toString('base64')),/kms_denied/);
  });
});

test('the client is created lazily so an unconfigured call graph starts clean',async()=>{
  let built=0;setKmsClientFactory(()=>{built++;return fakeKms().client;});
  const prev=process.env.VELNIX_KMS_KEY;delete process.env.VELNIX_KMS_KEY;
  try{await assert.rejects(()=>encryptSecret('x'),/kms_not_configured_or_bad_secret/);assert.equal(built,0);}
  finally{if(prev!==undefined)process.env.VELNIX_KMS_KEY=prev;setKmsClientFactory(()=>{const g=require('@google-cloud/kms');return new g.KeyManagementServiceClient();});}
});
