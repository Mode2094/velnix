'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runtimeOptions,defaultRuntimeAccount}=require('../src/runtime_config');
test('unconfigured runtime keeps existing defaults for non-production projects',()=>{
  assert.deepEqual(runtimeOptions(undefined,'demo-velnix'),{});
  assert.deepEqual(runtimeOptions(undefined,'some-other-project'),{});
});
test('the production project falls back to its non-secret runtime identity so KMS-backed paths never silently use the default compute account',()=>{
  assert.equal(defaultRuntimeAccount('velnix-6c1a2'),'velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com');
  assert.deepEqual(runtimeOptions(undefined,'velnix-6c1a2'),{serviceAccount:'velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com'});
  // An explicit account still wins.
  assert.deepEqual(runtimeOptions('velnix-runtime@velnix-6c1a2.iam.gserviceaccount.com','velnix-6c1a2'),{serviceAccount:'velnix-runtime@velnix-6c1a2.iam.gserviceaccount.com'});
});
test('explicit runtime identity stays in the selected project',()=>{
  const account='velnix-runtime@velnix-staging.iam.gserviceaccount.com';
  assert.deepEqual(runtimeOptions(account,'velnix-staging'),{serviceAccount:account});
  assert.throws(()=>runtimeOptions(account,'different-project'),/invalid_runtime_service_account/);
});
test('emulator keeps defaults even when a production account is exported',()=>{
  const account='velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com';
  assert.deepEqual(runtimeOptions(account,'demo-velnix-preview',true),{});
  assert.throws(()=>runtimeOptions(account,'demo-velnix-preview'),/invalid_runtime_service_account/);
});
test('runtime metadata rejects private key text and malformed account values',()=>{
  for(const value of ['PRIVATE KEY','user@example.org','user@other.iam.gserviceaccount.com',{},' velnix-runtime@velnix-staging.iam.gserviceaccount.com'])assert.throws(()=>runtimeOptions(value,'velnix-staging'),/invalid_runtime_service_account/);
});
