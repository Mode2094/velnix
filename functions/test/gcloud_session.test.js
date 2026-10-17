'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGcloudSession,PROJECT}=require('../scripts/gcloud_session');
function fakeRun(args){if(args[0]==='config')return '(unset)';if(args[1]==='list')return 'operator@example.test';if(args[1]==='print-access-token')return 'fixture-access-token';throw Error('Unexpected command');}
test('human gcloud session supplies both quota header and account-bound credentials without ADC',async()=>{
 const calls=[],headers=[];
 const session=createGcloudSession({env:{GOOGLE_APPLICATION_CREDENTIALS:'/never-read.json'},run:args=>{calls.push(args);return fakeRun(args);},fetchImpl:async(url,options)=>{headers.push(options);return new Response('{}');}});
 await session.get('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchGet');
 const credential=await session.credential.getAccessToken();
 assert.equal(credential.access_token,'fixture-access-token');assert.equal(credential.expires_in,1);
 assert.equal(headers[0].headers['X-Goog-User-Project'],PROJECT);assert.equal(headers[0].headers.Authorization,'Bearer fixture-access-token');assert.equal(headers[0].method,'GET');assert.equal(headers[0].redirect,'error');
 assert.ok(calls.filter(args=>args[1]==='print-access-token').every(args=>args.includes('--account=operator@example.test')));
 assert.equal(calls.some(args=>args.includes('application-default')||args.includes('login')),false);
});
test('gcloud is consulted again instead of assigning an invented long expiry or persisting a token',async()=>{
 let number=0;const session=createGcloudSession({env:{},run:args=>args[1]==='print-access-token'?'fixture-'+(++number):fakeRun(args)});
 assert.equal((await session.credential.getAccessToken()).access_token,'fixture-1');assert.equal((await session.credential.getAccessToken()).access_token,'fixture-2');
});
test('service accounts, impersonation, account changes and token overrides fail closed',()=>{
 for(const run of [args=>args[1]==='list'?'service@project.iam.gserviceaccount.com':fakeRun(args),args=>args[0]==='config'?'service@project.iam.gserviceaccount.com':fakeRun(args),args=>args[1]==='list'?'one@example.test\ntwo@example.test':fakeRun(args)])assert.throws(()=>createGcloudSession({env:{},run}));
 assert.throws(()=>createGcloudSession({env:{},run:fakeRun,expectedAccount:'different@example.test'}));
 for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','CLOUDSDK_AUTH_ACCESS_TOKEN','CLOUDSDK_AUTH_ACCESS_TOKEN_FILE','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'])assert.throws(()=>createGcloudSession({env:{[key]:'not accepted'},run:fakeRun}));
});
test('read transport rejects off-host URLs and strips CLI failures instead of exposing sensitive output',async()=>{
 let reads=0;const session=createGcloudSession({env:{},run:fakeRun,fetchImpl:async()=>{reads++;return new Response('{}');}});
 for(const url of ['http://firestore.googleapis.com/x','https://evil.example/x','https://user@firestore.googleapis.com/x'])await assert.rejects(session.get(url));
 assert.equal(reads,0);
 assert.throws(()=>createGcloudSession({env:{},run:()=>{throw Error('sensitive process output');}}),e=>!e.message.includes('sensitive'));
});
