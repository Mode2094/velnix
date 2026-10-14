'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {processPush,deliverNotice,MAX_ATTEMPTS,LEASE_MS,recoverPushes}=require('../../src/push');
const app=initializeApp({projectId:'demo-velnix'},'push-recovery');const db=getFirestore(app);
let clock=2000000000000;const now=()=>clock;const options={db,admin:{},canSeeOrder:()=>true,now};
async function notice(id,extra={}){const ref=db.doc('notices/push_test_'+id);await ref.set({recipientId:'push_user',orderId:'push_order',read:false,...extra});return ref;}
after(async()=>{await db.terminate();await deleteApp(app);});
test('duplicate concurrent push triggers claim one send and preserve unread state',async()=>{
 const ref=await notice('duplicate');let sends=0;
 const deliver=async()=>{sends++;await new Promise(resolve=>setTimeout(resolve,30));return {success:1,failure:0,delivered:['device_a']};};
 await Promise.all([processPush({...options,ref,deliver}),processPush({...options,ref,deliver})]);
 const data=(await ref.get()).data();assert.equal(sends,1);assert.equal(data.pushState,'sent');assert.equal(data.pushAttempts,1);assert.equal(data.read,false);
 await processPush({...options,ref,deliver});assert.equal(sends,1);
});
test('temporary failure backs off then succeeds without retrying an acknowledged device',async()=>{
 const ref=await notice('temporary');let sends=0;
 const deliver=async(_a,_d,_id,n)=>{sends++;return sends===1?{success:1,failure:1,delivered:['a'],retryable:true,lastError:'messaging/server-unavailable'}:{success:1,failure:0,delivered:['b']};};
 await processPush({...options,ref,deliver});assert.equal((await ref.get()).data().pushState,'pending');
 await processPush({...options,ref,deliver});assert.equal(sends,1);
 clock+=60001;await processPush({...options,ref,deliver});const n=(await ref.get()).data();assert.equal(n.pushState,'sent');assert.deepEqual(n.pushDeliveredDevices,['a','b']);
});
test('expired processing lease is recovered and a previous completion is fenced',async()=>{
 const ref=await notice('lease');let resolveOld;let entered;
 const started=new Promise(resolve=>entered=resolve);
 const old=processPush({...options,ref,deliver:async()=>{entered();return new Promise(resolve=>resolveOld=resolve);}});
 await started;await processPush({...options,ref,deliver:async()=>{throw Error('active lease must not send');}});
 clock+=LEASE_MS+1;await processPush({...options,ref,deliver:async()=>({success:1,failure:0,delivered:['new']})});
 resolveOld({success:0,failure:1,retryable:true,delivered:[],lastError:'messaging/server-unavailable'});await old;
 assert.equal((await ref.get()).data().pushState,'sent');assert.deepEqual((await ref.get()).data().pushDeliveredDevices,['new']);
});
test('retry limit and permanent failures stop without storing raw error text',async()=>{
 const ref=await notice('limit');let sends=0;
 const deliver=async()=>{sends++;throw Object.assign(Error('PRIVATE TOKEN CUSTOMER'),{code:'messaging/server-unavailable'});};
 for(let i=0;i<MAX_ATTEMPTS+2;i++){await processPush({...options,ref,deliver});clock+=1800001;}
 const n=(await ref.get()).data();assert.equal(n.pushState,'failed');assert.equal(sends,MAX_ATTEMPTS);assert.equal(JSON.stringify(n).includes('PRIVATE'),false);
 const permanent=await notice('permanent');await processPush({...options,ref:permanent,deliver:async()=>{throw Object.assign(Error('secret'),{code:'messaging/authentication-error'});}});
 assert.equal((await permanent.get()).data().pushState,'failed');
});
test('per-device failures clean invalid tokens and retry only the temporary device with current scope',async()=>{
 await db.doc('members/push_user').set({active:true,role:'warehouse'});await db.doc('orders/push_order').set({createdBy:'push_creator'});await db.doc('members/push_creator').set({role:'dataEntry'});
 for(const id of ['a','b','invalid'])await db.doc('devices/push_'+id).set({uid:'push_user',token:'local_testing_device_token_'+id});
 let tokens=[];
 const admin={messaging:()=>({sendEachForMulticast:async p=>{tokens=p.tokens;return {successCount:1,failureCount:2,responses:[{success:true},{success:false,error:{code:'messaging/server-unavailable'}},{success:false,error:{code:'messaging/registration-token-not-registered'}}]};}})};
 const n={recipientId:'push_user',orderId:'push_order'};const first=await deliverNotice(admin,db,'notice',n,()=>true);
 assert.equal(first.retryable,true);assert.equal((await db.doc('devices/push_invalid').get()).exists,false);
 const secondAdmin={messaging:()=>({sendEachForMulticast:async p=>{tokens=p.tokens;return {successCount:1,failureCount:0,responses:[{success:true}]};}})};
 await deliverNotice(secondAdmin,db,'notice',{...n,pushDeliveredDevices:first.delivered},()=>true);assert.deepEqual(tokens,['local_testing_device_token_b']);
 await db.doc('members/push_user').update({active:false});assert.equal((await deliverNotice(secondAdmin,db,'notice',n,()=>true)).ignored,'inactive');
 await db.doc('members/push_user').update({active:true});assert.equal((await deliverNotice(secondAdmin,db,'notice',n,()=>false)).ignored,'scope');
});
test('existing schedule recovers due work and failures from old push implementation',async()=>{
 const ref=await notice('legacy',{pushState:'completed',pushOutcome:{failure:true}});
 const stuck=await notice('old_sending',{pushState:'sending'});
 await recoverPushes({...options,deliver:async()=>({success:1,failure:0,delivered:['device']})});
 assert.equal((await ref.get()).data().pushState,'sent');assert.equal((await stuck.get()).data().pushState,'sent');
});
