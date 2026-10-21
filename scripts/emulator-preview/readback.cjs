'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/qa/emulator-ui');
const load=id=>require(require.resolve(id,{paths:[path.join(root,'functions')]}));
// No credentials or fallback project: this verification can only reach loopback emulators.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.METADATA_SERVER_DETECTION='none';
const {initializeApp}=load('firebase-admin/app'),{getFirestore}=load('firebase-admin/firestore');initializeApp({projectId:'demo-velnix-preview'});
(async()=>{
 const r=JSON.parse(fs.readFileSync(path.join(out,'results.json')));assert.equal(r.projectId,'demo-velnix-preview');assert.equal(r.results.length,21);assert.equal(r.status,'passed');assert.ok(r.results.every(t=>t.status==='passed'));assert.deepEqual(r.pageErrors,[]);
 const db=getFirestore(),verified=[];
 for(const [role,o] of Object.entries(r.orders)){
  const ref=db.doc('orders/'+o.id),data=(await ref.get()).data();assert.ok(data);assert.equal(data.createdBy,'qa-'+role);assert.equal(data.amountMinor,Math.round(Number(o.amount)*1000));assert.equal(data.quantity,2);assert.equal(data.companyId,null);assert.equal(data.trackingNumber,null);
  const events=await ref.collection('events').get(),creates=events.docs.filter(d=>d.data().action==='created');assert.equal(creates.length,1);
  const audit=await db.collection('auditEvents').where('entityId','==',o.id).get();assert.equal(audit.docs.filter(d=>d.data().action==='order.created').length,1);
  if(role==='generalManager'){assert.equal(data.status,'delivered');assert.equal(data.completionSource,'internal');assert.equal(events.docs.filter(d=>d.data().action==='status_changed').length,4);assert.equal(data.note,'تعديل متزامن معتمد');}
  if(role==='manager')assert.equal(data.status,'cancelled');
  verified.push({role,orderId:o.id,status:data.status,amountMinor:data.amountMinor,creationEvents:creates.length,auditEvents:audit.size});
 }
 assert.equal((await db.doc('members/qa-dataEntry').get()).data().active,false);assert.equal((await db.doc('joinRequests/qa-pending').get()).data().status,'rejected');assert.equal((await db.doc('members/qa-pending').get()).exists,false);
 assert.equal((await db.collection('companies').get()).size,0);assert.equal((await db.collection('devices').get()).size,0);
 const notices=await db.collection('notices').where('recipientId','==','qa-dataEntry').get();assert.ok(notices.docs.some(d=>d.data().orderId===r.orders.dataEntry.id&&d.data().read===true));
 const report={projectId:r.projectId,sourceCommit:r.sourceCommit,passedScenarios:r.results.length,failedScenarios:0,verifiedOrders:verified,localNoticeReadVerified:true,devicePush:'not_tested_no_devices_or_FCM',realGoogleAndAppCheck:'not_tested_synthetic_emulators_only',cloudResourcesChanged:false};
 fs.writeFileSync(path.join(out,'readback.json'),JSON.stringify(report,null,2));console.log('READBACK_PASS',JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1});
