'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('Loopback Auth and Firestore emulators required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {initializeApp,getApp,deleteApp}=require('firebase-admin/app');
const {bootstrapGoogleAdmin}=require('../../src/bootstrap_google');
const db=getFirestore(),auth=getAuth();
const invoke=(name,session,data={})=>functions[name].run({auth:session?{uid:session.uid,token:session}:null,data});
let gm,manager,newcomer,rejected,bootstrapApp,bootstrapDb;
async function google(label){
  // Auth emulator explicitly supports synthetic Google IDP assertions. No Google network call.
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=local-test-key',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:'join_'+label,email:'join_'+label+'@example.test',email_verified:true,name:'Google '+label})}).toString(),requestUri:'http://localhost',returnSecureToken:true})});
  assert.equal(response.status,200);
  const result=await response.json();return auth.verifyIdToken(result.idToken);
}
before(async()=>{
  gm=await google('gm');manager=await google('manager');newcomer=await google('new');rejected=await google('reject');
  for(const [session,role]of [[gm,'generalManager'],[manager,'manager']])await db.doc('members/'+session.uid).set({name:role,role,active:true,permissions:['manageEmployees']});
  bootstrapApp=initializeApp({projectId:'demo-velnix-bootstrap'},'bootstrap-test');bootstrapDb=getFirestore(bootstrapApp);
});
after(async()=>{await bootstrapDb.terminate();await deleteApp(bootstrapApp);await db.terminate();await deleteApp(getApp());});
test('verified local Google login creates one pending UID-bound request and no active membership',async()=>{
  const outcomes=await Promise.all([invoke('joinSession',newcomer,{uid:gm.uid,role:'generalManager',email:'spoof@example.test',active:true}),invoke('joinSession',newcomer)]);
  assert.deepEqual(outcomes,[{status:'pending'},{status:'pending'}]);
  const request=(await db.doc('joinRequests/'+newcomer.uid).get()).data();
  assert.equal(request.email,'join_new@example.test');assert.equal(request.name,'Google new');assert.equal(request.role,undefined);assert.equal(request.permissions,undefined);assert.equal(request.active,undefined);
  assert.equal((await db.doc('members/'+newcomer.uid).get()).exists,false);
  assert.equal((await db.collection('auditEvents').where('entityId','==',newcomer.uid).where('action','==','join.requested').get()).size,1);
});
test('pending users cannot access any privileged callable; provider and identity spoofing are refused',async()=>{
  const endpoints=['searchOrders','listOrderCreators','registerDevice','unregisterDevice','getSettings','saveSettings','me','listOrders','getOrder','createOrder','updateOrder','changeOrderStatus','assignCompany','sendOrderToDelivery','resolveDispatchException','dashboardStats','companyStats','listMembers','saveMember','listCompanies','saveCompany','archiveCompany','restoreCompany','testCompanyConnection','listNotices','markNoticeRead','listSyncEvents','listAudit','listJoinRequests','decideJoinRequest'];
  for(const name of endpoints)await assert.rejects(invoke(name,newcomer,{id:gm.uid,decision:'approved',role:'generalManager'}),{code:'permission-denied'},name);
  await assert.rejects(invoke('joinSession',null),{code:'unauthenticated'});
  for(const token of [{...newcomer,firebase:{sign_in_provider:'custom'}},{...newcomer,email_verified:false}])await assert.rejects(invoke('joinSession',token),{code:'permission-denied'});
  const noGoogle=await auth.createUser({email:'join_no_google@example.test',emailVerified:true});
  await assert.rejects(invoke('joinSession',{...newcomer,uid:noGoogle.uid}),{code:'failed-precondition'});
});
test('only a current general manager can list and decide; invalid grants leave request pending',async()=>{
  assert.ok((await invoke('listJoinRequests',gm)).items.some(item=>item.id===newcomer.uid));
  await assert.rejects(invoke('listJoinRequests',manager),{code:'permission-denied'});
  await assert.rejects(invoke('decideJoinRequest',manager,{id:newcomer.uid,decision:'approved',role:'dataEntry'}),{code:'permission-denied'});
  await assert.rejects(invoke('decideJoinRequest',gm,{id:gm.uid,decision:'approved',role:'generalManager'}),{code:'permission-denied'});
  for(const data of [{role:'owner'},{role:'dataEntry',permissions:['root']},{role:'dataEntry',salesSupervisorId:newcomer.uid},{role:'dataEntry',salesSupervisorId:'unavailable'}])await assert.rejects(invoke('decideJoinRequest',gm,{id:newcomer.uid,decision:'approved',...data}));
  assert.equal((await db.doc('members/'+newcomer.uid).get()).exists,false);
  assert.equal((await db.doc('joinRequests/'+newcomer.uid).get()).data().status,'pending');
});
test('concurrent approvals create exactly one membership and one audited decision',async()=>{
  const decision={id:newcomer.uid,decision:'approved',role:'sales',permissions:['viewReports']};
  const results=await Promise.allSettled([invoke('decideJoinRequest',gm,decision),invoke('decideJoinRequest',gm,decision)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'failed-precondition');
  const member=(await db.doc('members/'+newcomer.uid).get()).data();assert.equal(member.active,true);assert.equal(member.role,'sales');assert.deepEqual(member.permissions,['viewReports']);
  assert.equal((await db.doc('joinRequests/'+newcomer.uid).get()).data().status,'approved');
  assert.equal((await db.collection('auditEvents').where('entityId','==',newcomer.uid).where('action','==','join.approved').get()).size,1);
  const relogin=await google('new');assert.equal(relogin.uid,newcomer.uid);assert.deepEqual(await invoke('joinSession',relogin),{status:'approved'});assert.equal((await invoke('me',relogin)).role,'sales');
});
test('rejection persists across login and cannot be overridden or self-approved',async()=>{
  await invoke('joinSession',rejected);
  await invoke('decideJoinRequest',gm,{id:rejected.uid,decision:'rejected'});
  assert.deepEqual(await invoke('joinSession',await google('reject')),{status:'rejected'});
  await assert.rejects(invoke('me',rejected),{code:'permission-denied'});
  await assert.rejects(invoke('decideJoinRequest',gm,{id:rejected.uid,decision:'approved',role:'dataEntry'}),{code:'failed-precondition'});
  assert.equal((await db.doc('members/'+rejected.uid).get()).exists,false);
  assert.equal((await db.collection('auditEvents').where('entityId','==',rejected.uid).where('action','==','join.rejected').get()).size,1);
});
test('role and disable decisions take effect for the same already issued Google token',async()=>{
  await invoke('saveMember',gm,{id:newcomer.uid,name:'Changed',role:'dataEntry',active:true,permissions:[],salesSupervisorId:null});
  assert.equal((await invoke('me',newcomer)).role,'dataEntry');
  await assert.rejects(invoke('listAudit',newcomer),{code:'permission-denied'});
  await invoke('saveMember',gm,{id:newcomer.uid,name:'Changed',role:'dataEntry',active:false,permissions:[],salesSupervisorId:null});
  for(const endpoint of ['me','listOrders','listNotices','createOrder'])await assert.rejects(invoke(endpoint,newcomer),{code:'permission-denied'});
  await assert.rejects(invoke('joinSession',newcomer),{code:'failed-precondition'});
});
test('legacy Google membership keeps its UID and role; a different UID with matching email is never merged',async()=>{
  assert.equal((await invoke('joinSession',manager)).status,'approved');
  assert.equal((await invoke('me',manager)).role,'manager');
  const distinct=await google('separate');await db.doc('members/legacy_different_uid').set({email:'join_separate@example.test',role:'generalManager',active:true});
  assert.equal((await invoke('joinSession',distinct)).status,'pending');assert.equal((await db.doc('members/'+distinct.uid).get()).exists,false);
});
test('bootstrap is dry-run by default, validates Google identity and serializes first administrator creation',async()=>{
  const candidate=await google('bootstrap');
  const options={db:bootstrapDb,auth,FieldValue,uid:candidate.uid,project:'demo-velnix-bootstrap',confirmedProject:'demo-velnix-bootstrap'};
  assert.deepEqual(await bootstrapGoogleAdmin(options),{validated:true,applied:false});
  assert.equal((await bootstrapDb.collection('members').get()).size,0);
  await assert.rejects(bootstrapGoogleAdmin({...options,confirmedProject:'wrong'}));
  const results=await Promise.allSettled([bootstrapGoogleAdmin({...options,apply:true}),bootstrapGoogleAdmin({...options,apply:true})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await bootstrapDb.collection('members').get()).size,1);assert.equal((await bootstrapDb.collection('auditEvents').get()).size,1);
  await assert.rejects(bootstrapGoogleAdmin({...options,uid:gm.uid,apply:true}));
});
for(const role of ['generalManager','manager','warehouse','sales','dataEntry'])test('explicit approval supports role '+role+' without trusting claimed grants',async()=>{
  const applicant=await google('role_'+role);await invoke('joinSession',applicant,{role:'generalManager',permissions:['manageSettings']});
  await invoke('decideJoinRequest',gm,{id:applicant.uid,decision:'approved',role,permissions:[]});
  const result=await invoke('me',applicant);assert.equal(result.role,role);assert.deepEqual(result.permissions,[]);
});
test('approval/rejection race commits only one decision and team linkage is atomic',async()=>{
  const applicant=await google('decision_race');await invoke('joinSession',applicant);
  const sales=await google('team_sales');await db.doc('members/'+sales.uid).set({role:'sales',name:'Sales',active:true,permissions:[],authorizationVersion:0});
  const results=await Promise.allSettled([invoke('decideJoinRequest',gm,{id:applicant.uid,decision:'approved',role:'dataEntry',salesSupervisorId:sales.uid}),invoke('decideJoinRequest',gm,{id:applicant.uid,decision:'rejected'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const request=(await db.doc('joinRequests/'+applicant.uid).get()).data(),member=await db.doc('members/'+applicant.uid).get();
  assert.equal(member.exists,request.status==='approved');
  if(member.exists){assert.equal(member.data().salesSupervisorId,sales.uid);assert.equal((await db.doc('members/'+sales.uid).get()).data().authorizationVersion,1);}
});
test('pending directory pagination is stable and contains no approved or rejected users',async()=>{
  for(let i=0;i<4;i++)await invoke('joinSession',await google('pagination_'+i));
  const ids=[];let cursor;
  do {const result=await invoke('listJoinRequests',gm,{pageSize:2,afterId:cursor});ids.push(...result.items.map(x=>x.id));cursor=result.more?result.afterId:null;}while(cursor);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(ids.length,(await db.collection('joinRequests').where('status','==','pending').get()).size);
  assert.equal(ids.includes(rejected.uid),false);
});
