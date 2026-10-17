'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runtimeOptions}=require('../src/runtime_config');
test('unconfigured runtime keeps existing defaults without pretending IAM was configured',()=>{
  assert.deepEqual(runtimeOptions(undefined,'demo-velnix'),{});
});
test('explicit runtime identity stays in the selected project',()=>{
  const account='velnix-runtime@velnix-staging.iam.gserviceaccount.com';
  assert.deepEqual(runtimeOptions(account,'velnix-staging'),{serviceAccount:account});
  assert.throws(()=>runtimeOptions(account,'different-project'),/invalid_runtime_service_account/);
});
test('runtime metadata rejects private key text and malformed account values',()=>{
  for(const value of ['PRIVATE KEY','user@example.org','user@other.iam.gserviceaccount.com',{},' velnix-runtime@velnix-staging.iam.gserviceaccount.com'])assert.throws(()=>runtimeOptions(value,'velnix-staging'),/invalid_runtime_service_account/);
});
