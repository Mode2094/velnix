'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inventory}=require('../scripts/read_cloud_inventory');
const email='candidate@example.test';
test('access errors never turn into empty Authentication or Firestore claims',async()=>{
 const result=await inventory({candidateEmail:email,get:async()=>{throw Object.assign(Error('denied'),{status:403});}});
 assert.equal(result.authentication.totalUsers,null);assert.equal(result.firestore.members,null);assert.equal(result.readyForBootstrap,false);assert.equal(result.bootstrapExecuted,false);
});
test('inventory follows all user/member pages and does not equate a provider record with a verified login',async()=>{
 const result=await inventory({candidateEmail:email,get:async input=>{
  const u=new URL(input);
  if(u.pathname.endsWith('/config'))return {signIn:{email:{enabled:true}}};
  if(u.pathname.endsWith('/google.com'))return {enabled:true,clientId:'public-id'};
  if(u.pathname.endsWith('accounts:batchGet'))return u.searchParams.has('nextPageToken')?{users:[{localId:'candidate_uid',email,emailVerified:true,providerUserInfo:[{providerId:'google.com'}]}]}:{users:[{localId:'old'}],nextPageToken:'next'};
  if(u.pathname.endsWith('/databases/(default)'))return {locationId:'europe-west1'};
  if(u.pathname.endsWith('/members'))return u.searchParams.has('pageToken')?{documents:[{fields:{role:{stringValue:'generalManager'}}}]}:{documents:[{fields:{role:{stringValue:'dataEntry'}}}],nextPageToken:'next'};
  if(u.pathname.endsWith('/joinRequests'))return {};
  if(u.pathname.endsWith('/bootstrapState'))return {name:'existing lock'};
  throw Error('Unexpected read');
 }});
 assert.equal(result.authentication.totalUsers,2);assert.equal(result.authentication.candidate.googleSessionVerified,false);
 assert.equal(result.firestore.members.count,2);assert.equal(result.firestore.generalManagersIncludingInactive,1);assert.equal(result.firestore.bootstrapState.exists,true);assert.equal(result.readyForBootstrap,false);
});
test('an accessible empty database and a structured missing lock are reported without granting bootstrap',async()=>{
 const result=await inventory({candidateEmail:email,get:async input=>{
  if(new URL(input).pathname.endsWith('/bootstrapState'))throw Object.assign(Error('missing'),{status:404,apiStatus:'NOT_FOUND'});
  return {};
 }});
 assert.equal(result.authentication.totalUsers,0);assert.equal(result.firestore.members.count,0);assert.equal(result.firestore.joinRequests.count,0);assert.equal(result.firestore.bootstrapState.exists,false);assert.equal(result.readyForBootstrap,false);
});
