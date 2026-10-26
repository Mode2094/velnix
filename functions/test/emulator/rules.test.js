'use strict';
const {test,before,after}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,collection,getDocs,deleteDoc}=require('firebase/firestore');
let env;
before(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator is required; this suite must not be skipped');
  env=await initializeTestEnvironment({projectId:'demo-velnix',firestore:{rules:fs.readFileSync('../firestore.rules','utf8')}});
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'members/entry'),{name:'مدخل',active:true});
    for(const path of ['orders/order','orders/order/events/event','companies/company','companySecrets/company','deliveryInbox/company/events/event','auditEvents/event','notices/notice','devices/device','idempotency/key','joinRequests/other'])
      await setDoc(doc(db,path),{value:'private'});
  });
});
after(async()=>{if(env)await env.cleanup();});
test('own profile is readable, other profiles and profile mutation are denied',async()=>{
  const db=env.authenticatedContext('entry').firestore();
  await assertSucceeds(getDoc(doc(db,'members/entry')));
  await assertFails(getDoc(doc(db,'members/other')));
  await assertFails(setDoc(doc(db,'members/entry'),{role:'generalManager'}));
  await assertFails(getDocs(collection(db,'members')));
});
for(const role of ['generalManager','manager','warehouse','sales','dataEntry']){
  test(role+' cannot access privileged collections through client SDK',async()=>{
    const db=env.authenticatedContext(role,{role}).firestore();
    for(const path of ['orders/order','orders/order/events/event','companies/company','companySecrets/company','deliveryInbox/company/events/event','auditEvents/event','notices/notice','devices/device','idempotency/key','joinRequests/other']){
      await assertFails(getDoc(doc(db,path)));
      await assertFails(setDoc(doc(db,path),{value:'tampered'}));
      await assertFails(deleteDoc(doc(db,path)));
    }
  });
}
test('unauthenticated users cannot read a profile or order',async()=>{
  const db=env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db,'members/entry')));
  await assertFails(getDoc(doc(db,'orders/order')));
});

test('pending rejected and disabled identities cannot read internal data or change their decision',async()=>{
  for(const status of ['pending','rejected','disabled']){
    const uid='join_rules_'+status;
    await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'joinRequests/'+uid),{status,email:'fixture@example.test'});});
    const db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
    await assertSucceeds(getDoc(doc(db,'joinRequests/'+uid)));
    await assertFails(setDoc(doc(db,'joinRequests/'+uid),{status:'approved'}));
    await assertFails(deleteDoc(doc(db,'joinRequests/'+uid)));
    await assertFails(getDocs(collection(db,'joinRequests')));
    await assertFails(getDoc(doc(db,'joinRequests/other')));
    await assertFails(getDoc(doc(db,'orders/order')));
    await assertFails(setDoc(doc(db,'members/'+uid),{role:'generalManager',active:true}));
  }
});
