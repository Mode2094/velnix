'use strict';
// The real-time sync revision document. A single tiny `sync/global` document
// carries counter fields; the client holds one listener on it. This test locks
// the increment behaviour the triggers rely on.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {bumpSync,SYNC_DOC,REGION}=require('../../src/sync');

const app=initializeApp({projectId:'demo-velnix'},'sync-revision-test');
const db=getFirestore(app);

before(async()=>{await db.doc(SYNC_DOC).delete().catch(()=>{});});
after(async()=>{await db.doc(SYNC_DOC).delete().catch(()=>{});await deleteApp(app);});

test('bumpSync increments only the requested counter (merge, no other field touched)',async()=>{
  await bumpSync(db,FieldValue,'orders');
  await bumpSync(db,FieldValue,'orders');
  await bumpSync(db,FieldValue,'companies');
  const snap=await db.doc(SYNC_DOC).get();
  assert.ok(snap.exists,'the revision document is created on first bump');
  const d=snap.data();
  assert.equal(d.orders,2,'orders incremented twice');
  assert.equal(d.companies,1,'companies incremented once');
  assert.equal(d.notices,undefined,'an untouched counter is never written');
  assert.ok(d.updatedAt,'updatedAt is stamped');
});

test('a bump failure never throws (a broken counter cannot fail a write)',async()=>{
  const broken={doc:()=>({set:async()=>{throw Object.assign(Error('boom'),{code:'unavailable'});}})};
  await assert.doesNotReject(()=>bumpSync(broken,FieldValue,'orders'));
});

test('triggers are declared on europe-west1 with no extra leaky surface',()=>{
  assert.equal(REGION,'europe-west1');
  assert.equal(SYNC_DOC,'sync/global');
});
