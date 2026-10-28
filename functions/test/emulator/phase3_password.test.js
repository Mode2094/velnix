'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth and Firestore emulators are required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const db=getFirestore();
const invoke=(name,id,data={})=>functions[name].run({auth:id?{uid:id,token:{email_verified:true,firebase:{sign_in_provider:'password'}}}:null,data});

before(async()=>{
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('loopback only');
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('loopback only');
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  const mk=async(role,id,extra={},password='LocalTestingOnly123!')=>{
    await getAuth().createUser({uid:id,email:id+'@velnix.test',...(password?{password}:{})}).catch(e=>{if(e.code!=='auth/uid-already-exists')throw e;});
    await db.doc('members/'+id).set({role,id,name:id,active:true,permissions:[],authorizationVersion:1,...extra});
  };
  await mk('generalManager','gm');
  await mk('manager','mgr',{permissions:['manageEmployees']});
  await mk('manager','peer',{permissions:['manageEmployees']});
  await mk('dataEntry','entry',{});
  await mk('dataEntry','entry2',{});
  await mk('dataEntry','entryboss',{permissions:['manageEmployees']});
  await mk('manager','managerfull',{permissions:['manageEmployees','viewAllOrders','updateOrderStatus']});
  await mk('sales','salesboss',{permissions:['manageEmployees']});
  await mk('sales','sales',{});
  await mk('warehouse','wh',{});
  await mk('warehouse','whboss',{permissions:['manageEmployees','viewAllOrders']});
  // Google-only account: no password provider.
  await mk('dataEntry','googleonly',{},null);
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('general manager resets an employee password and audits without the secret',async()=>{
  await invoke('resetEmployeePassword','gm',{id:'entry',password:'NewPassword123!'});
  const audit=await db.collection('auditEvents').where('action','==','member.password_reset').get();
  assert.equal(audit.size,1);
  const record=audit.docs[0].data();
  assert.equal(record.extra.targetRole,'dataEntry');
  assert.equal(record.entityId,'entry');
  assert.ok(!JSON.stringify(record).includes('NewPassword123!'));
});

test('reset rejects short passwords, missing ids and self-reset',async()=>{
  await assert.rejects(invoke('resetEmployeePassword','gm',{id:'entry',password:'short'}),{code:'invalid-argument'});
  await assert.rejects(invoke('resetEmployeePassword','gm',{id:'missing',password:'NewPassword123!'}),{code:'not-found'});
  await assert.rejects(invoke('resetEmployeePassword','gm',{id:'gm',password:'NewPassword123!'}),{code:'permission-denied'});
});

test('delegated manager cannot reset equal, higher or self accounts',async()=>{
  await assert.rejects(invoke('resetEmployeePassword','mgr',{id:'gm',password:'NewPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','mgr',{id:'peer',password:'NewPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','mgr',{id:'mgr',password:'NewPassword123!'}),{code:'permission-denied'});
});

test('delegated manager resets lower-ranked employees but not privileged warehouse',async()=>{
  await invoke('resetEmployeePassword','mgr',{id:'entry',password:'AnotherPassword123!'});
  await assert.rejects(invoke('resetEmployeePassword','mgr',{id:'wh',password:'AnotherPassword123!'}),{code:'permission-denied'});
});

test('employees without the permission are refused and Google-only accounts are refused',async()=>{
  await assert.rejects(invoke('resetEmployeePassword','entry',{id:'entry',password:'AnotherPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','gm',{id:'googleonly',password:'AnotherPassword123!'}),{code:'failed-precondition'});
});

test('rank matrix: dataEntry and sales cannot reset a higher or peer role',async()=>{
  // A data entry account holding manageEmployees still cannot reset sales.
  await assert.rejects(invoke('resetEmployeePassword','entryboss',{id:'sales',password:'AnotherPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','entryboss',{id:'entry2',password:'AnotherPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','entryboss',{id:'managerfull',password:'AnotherPassword123!'}),{code:'permission-denied'});
  // A sales lead may reset entry staff, but not a peer or warehouse.
  await invoke('resetEmployeePassword','salesboss',{id:'entry2',password:'AnotherPassword123!'});
  await assert.rejects(invoke('resetEmployeePassword','salesboss',{id:'sales',password:'AnotherPassword123!'}),{code:'permission-denied'});
  await assert.rejects(invoke('resetEmployeePassword','salesboss',{id:'wh',password:'AnotherPassword123!'}),{code:'permission-denied'});
  // A warehouse lead may reset entry staff only.
  await invoke('resetEmployeePassword','whboss',{id:'entry2',password:'AnotherPassword123!'});
  await assert.rejects(invoke('resetEmployeePassword','whboss',{id:'sales',password:'AnotherPassword123!'}),{code:'permission-denied'});
  // A fully delegated manager may reset sales and warehouse (cross-team rights).
  await invoke('resetEmployeePassword','managerfull',{id:'sales',password:'AnotherPassword123!'});
  await invoke('resetEmployeePassword','managerfull',{id:'wh',password:'AnotherPassword123!'});
  await assert.rejects(invoke('resetEmployeePassword','managerfull',{id:'mgr',password:'AnotherPassword123!'}),{code:'permission-denied'});
});
