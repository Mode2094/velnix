'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {requireGoogleSession,requireSession,googleProfile,sessionProfile}=require('../src/google_identity');

test('the runtime session accepts verified email/password and Google, and rejects everything else',()=>{
  for(const provider of ['google.com','password']){
    assert.equal(requireSession({auth:{uid:'uid',token:{email_verified:true,firebase:{sign_in_provider:provider}}}}),'uid');
  }
  for(const provider of ['custom','anonymous','apple.com']){
    assert.throws(()=>requireSession({auth:{uid:'uid',token:{email_verified:true,firebase:{sign_in_provider:provider}}}}),(e)=>{assert.equal(e.code,'permission-denied');return true;});
  }
  assert.throws(()=>requireSession({auth:{uid:'uid',token:{email_verified:false,firebase:{sign_in_provider:'password'}}}}),(e)=>{assert.equal(e.code,'permission-denied');return true;});
  assert.throws(()=>requireSession({auth:null}),(e)=>{assert.equal(e.code,'unauthenticated');return true;});
  assert.throws(()=>requireGoogleSession({auth:{uid:'uid',token:{email_verified:true,firebase:{sign_in_provider:'password'}}}}),(e)=>{assert.equal(e.code,'permission-denied');return true;});
});
test('sessionProfile accepts a verified password identity but keeps the Google-only owner path strict',()=>{
  const passwordRecord={uid:'u',email:'User@Example.test',emailVerified:true,disabled:false,displayName:'Test User',providerData:[{providerId:'password',email:'User@Example.test'}]};
  assert.deepEqual(sessionProfile(passwordRecord),{email:'user@example.test',name:'Test User'});
  assert.throws(()=>googleProfile(passwordRecord),(e)=>{assert.equal(e.code,'failed-precondition');return true;});
  const googleRecord={uid:'u',email:'User@Example.test',emailVerified:true,disabled:false,providerData:[{providerId:'google.com',email:'User@Example.test',displayName:'Google User'}]};
  assert.deepEqual(googleProfile(googleRecord),{email:'user@example.test',name:'Google User'});
  assert.deepEqual(sessionProfile(googleRecord),{email:'user@example.test',name:'Google User'});
  for(const record of [
    {...passwordRecord,emailVerified:false},
    {...passwordRecord,disabled:true},
    {...passwordRecord,email:'other@example.test'},
    {...passwordRecord,providerData:[]},
  ])assert.throws(()=>sessionProfile(record),/يلزم حساب/);
});
