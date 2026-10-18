'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {initializeApp,getApp,deleteApp}=require('firebase-admin/app');
initializeApp({projectId:'demo-velnix'});
const db=getFirestore();
const tool=require('../../scripts/firestore_snapshot');
const SCRIPT=path.join(__dirname,'..','..','scripts','firestore_snapshot.js');
const PROJECT='demo-velnix',env=process.env;
const CIPHERTEXT='SYNTHETIC-LOCAL-CIPHERTEXT-NOT-A-KEY';
const TOKEN='SYNTHETIC-FCM-TOKEN-NOT-REAL';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'velnix-snapshot-'));
const snapshotFile=path.join(dir,'snapshot.json');
const truncatedFile=path.join(dir,'truncated.json');
let snapshotObject,createdPaths;
const CLI=(...args)=>spawnSync(process.execPath,[SCRIPT,...args],{encoding:'utf8',env:process.env});

function seedBatch(){
  const batch=db.batch();
  const stamp=Timestamp.fromMillis(1700000000000);
  const docs={
    'members/snap_gm':{name:'مدير تجريبي',role:'generalManager',active:true,permissions:[],approvalStatus:'approved'},
    'members/snap_entry':{name:'مدخل بيانات تجريبي',role:'dataEntry',active:true,permissions:[],salesSupervisorId:'snap_gm',approvalStatus:'approved'},
    'companies/snap_company':{name:'شركة توصيل تجريبية',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true,archived:false,statusMap:{in_transit:'inTransit',delivered:'delivered'}},
    'companySecrets/snap_company':{apiTokenCiphertext:CIPHERTEXT},
    'orders/snap_order_1':{createdBy:'snap_gm',customer:'عميل تجريبي',status:'ready',dispatchState:'needs_review',companyId:'snap_company',amountMinor:1250,revision:2,createdAt:stamp,updatedAt:stamp},
    'orders/snap_order_1/events/snap_evt_dispatch':{action:'dispatch_attempt_failed',actorId:'snap_gm',details:{reason:'synthetic',attempts:2},createdAt:stamp},
    'orders/snap_order_2':{createdBy:'snap_entry',customer:'عميل ثانٍ',status:'created',dispatchState:'idle',companyId:null,amountMinor:500,revision:1,createdAt:stamp},
    'notices/snap_notice_1':{recipientId:'snap_gm',title:'إشعار تجريبي',body:'نص الإشعار',orderId:'snap_order_1',read:false,pushState:'completed',pushAttempts:1,createdAt:stamp},
    'devices/snap_device_1':{uid:'snap_gm',token:TOKEN,platform:'android',createdAt:stamp},
    'auditEvents/snap_audit_1':{action:'order.created',actorId:'snap_gm',actorName:'مدير تجريبي',entityId:'snap_order_1',extra:{},createdAt:stamp},
    'deliveryInbox/snap_company/events/snap_inbox_evt_1':{companyId:'snap_company',orderId:'snap_order_1',raw:'in_transit',source:'webhook',receivedAt:stamp},
    'idempotency/snap_key_1':{orderId:'snap_order_1',requestKey:'snap_request_key_1',createdAt:stamp},
    'settings/snap_marker':{organizationName:'مؤسسة تجريبية',receiptFooter:'سند طلب',supportPhone:'000000000'},
  };
  for(const [docPath,data] of Object.entries(docs))batch.set(db.doc(docPath),data);
  return {batch,paths:Object.keys(docs)};
}
async function deletePaths(paths){
  const batch=db.batch();
  for(const docPath of paths)batch.delete(db.doc(docPath));
  await batch.commit();
}
const exists=async docPath=>(await db.doc(docPath).get()).exists;

before(async()=>{
  const {batch,paths}=seedBatch();
  await batch.commit();
  createdPaths=paths;
});
after(async()=>{
  await deletePaths(createdPaths);
  for(const file of [snapshotFile,truncatedFile])fs.rmSync(file,{force:true});
  fs.rmSync(dir,{recursive:true,force:true});
  await db.terminate();
  await deleteApp(getApp());
});

test('scenarios 1-2: the snapshot is saved, verified and covers relationships and subcollections',async()=>{
  snapshotObject=await tool.createSnapshot(db,{projectId:PROJECT,env});
  fs.writeFileSync(snapshotFile,JSON.stringify(snapshotObject));
  const report=tool.verifySnapshot(tool.parseSnapshot(fs.readFileSync(snapshotFile,'utf8')));
  assert.equal(report.documentCount,snapshotObject.documents.length);
  assert.ok(report.documentCount>=createdPaths.length);
  const byPath=new Map(snapshotObject.documents.map(d=>[d.path,d.data]));
  for(const docPath of createdPaths)assert.ok(byPath.has(docPath),'missing '+docPath);
  const order=byPath.get('orders/snap_order_1');
  assert.equal(order.dispatchState,'needs_review');
  assert.equal(order.companyId,'snap_company');
  assert.equal(typeof order.createdAt.seconds,'number');
  assert.equal(byPath.get('companySecrets/snap_company').apiTokenCiphertext,CIPHERTEXT);
  assert.ok(snapshotObject.manifest.patterns['orders/*/events/*']>=1);
  assert.ok(snapshotObject.manifest.patterns['deliveryInbox/*/events/*']>=1);
  const backup=CLI('backup','--project',PROJECT,'--file',path.join(dir,'second.json'),'--force');
  assert.equal(backup.status,0,backup.stderr);
  const verified=CLI('verify','--project',PROJECT,'--file',snapshotFile);
  assert.equal(verified.status,0,verified.stderr);
  for(const output of [backup.stdout,backup.stderr,verified.stdout,verified.stderr]){
    assert.equal(output.includes(CIPHERTEXT),false);
    assert.equal(output.includes(TOKEN),false);
  }
  assert.equal(fs.readFileSync(snapshotFile,'utf8').includes(CIPHERTEXT),true);
});

test('scenarios 3-6: deletion then restore reproduces the source, relations and subcollections',async()=>{
  await deletePaths(createdPaths);
  for(const docPath of createdPaths)assert.equal(await exists(docPath),false);
  const result=await tool.restoreSnapshot(db,snapshotObject,{projectId:PROJECT,env,apply:true});
  assert.equal(result.verified,true);
  assert.deepEqual(result.missing,[]);
  assert.deepEqual(result.mismatched,[]);
  for(const docPath of createdPaths)assert.equal(await exists(docPath),true,docPath);
  for(const document of snapshotObject.documents){
    const stored=await db.doc(document.path).get();
    assert.equal(JSON.stringify(tool.encodeValue(stored.data())),JSON.stringify(document.data),document.path);
  }
  assert.equal((await db.doc('orders/snap_order_1').get()).data().companyId,'snap_company');
  assert.equal((await db.doc('orders/snap_order_1/events/snap_evt_dispatch').get()).data().details.attempts,2);
  assert.equal((await db.doc('deliveryInbox/snap_company/events/snap_inbox_evt_1').get()).data().raw,'in_transit');
  assert.equal((await db.doc('members/snap_entry').get()).data().salesSupervisorId,'snap_gm');
});

test('scenario 11: a repeated restore is idempotent and produces no duplicate side effects',async()=>{
  const auditsBefore=(await db.collection('auditEvents').get()).size;
  const noticesBefore=(await db.collection('notices').get()).size;
  const result=await tool.restoreSnapshot(db,snapshotObject,{projectId:PROJECT,env,apply:true});
  assert.equal(result.verified,true);
  assert.equal((await db.collection('auditEvents').get()).size,auditsBefore);
  assert.equal((await db.collection('notices').get()).size,noticesBefore);
  assert.equal((await db.doc('orders/snap_order_1').get()).data().dispatchState,'needs_review');
  assert.equal((await db.doc('idempotency/snap_key_1').get()).data().requestKey,'snap_request_key_1');
  assert.equal((await db.doc('devices/snap_device_1').get()).data().token,TOKEN);
});

test('scenario 7: an interrupted restore only keeps complete batches and is safely re-runnable',async()=>{
  const managed=snapshotObject.documents.filter(document=>document.path.startsWith('orders/snap_')||document.path.startsWith('members/snap_')||document.path.startsWith('notices/snap_')||document.path.startsWith('devices/snap_')||document.path.startsWith('auditEvents/snap_')||document.path.startsWith('idempotency/snap_')||document.path.startsWith('settings/snap_')||document.path.startsWith('companySecrets/snap_')||document.path.startsWith('companies/snap_')||document.path.startsWith('deliveryInbox/snap_'));
  const small=tool.buildSnapshot(managed,{projectId:PROJECT,env});
  const smallPaths=managed.map(document=>document.path);
  await deletePaths(smallPaths);
  let seen=0;
  await assert.rejects(
    tool.restoreSnapshot(db,small,{projectId:PROJECT,env,apply:true,batchSize:2,onBeforeWrite:async()=>{seen+=1;if(seen===3)throw Error('synthetic_interruption');}}),
    {message:'synthetic_interruption'});
  const presentAfterAbort=[];
  for(const docPath of smallPaths)if(await exists(docPath))presentAfterAbort.push(docPath);
  assert.equal(seen,3);
  assert.equal(presentAfterAbort.length,2,'only the first complete batch may survive');
  const recovered=await tool.restoreSnapshot(db,small,{projectId:PROJECT,env,apply:true});
  assert.equal(recovered.verified,true);
  for(const docPath of smallPaths)assert.equal(await exists(docPath),true,docPath);
});

test('scenario 8: corrupted or truncated files are detected and refused before any write',async()=>{
  const corrupted=JSON.parse(JSON.stringify(snapshotObject));
  corrupted.documents.find(document=>document.path==='orders/snap_order_2').data.amountMinor=999999;
  await deletePaths(['orders/snap_order_2']);
  await assert.rejects(tool.restoreSnapshot(db,corrupted,{projectId:PROJECT,env,apply:true}),{message:'snapshot_hash_mismatch'});
  assert.equal(await exists('orders/snap_order_2'),false);
  fs.writeFileSync(truncatedFile,JSON.stringify(snapshotObject).slice(0,Math.floor(JSON.stringify(snapshotObject).length/2)));
  assert.throws(()=>tool.parseSnapshot(fs.readFileSync(truncatedFile,'utf8')),{message:'snapshot_not_json'});
  const cli=CLI('restore','--project',PROJECT,'--file',truncatedFile,'--apply');
  assert.equal(cli.status,1);
  assert.equal(JSON.parse(cli.stderr.trim().split('\n').pop()).error,'snapshot_not_json');
  assert.equal(cli.stdout.includes(CIPHERTEXT),false);
  const recovered=await tool.restoreSnapshot(db,snapshotObject,{projectId:PROJECT,env,apply:true});
  assert.equal(recovered.verified,true);
});

test('scenario 9: restore to the production project is refused with no writes and no secrets in output',async()=>{
  await assert.rejects(tool.restoreSnapshot(db,snapshotObject,{projectId:'velnix-6c1a2',env,apply:true}),{message:'production_project_refused'});
  await assert.rejects(tool.restoreSnapshot(db,snapshotObject,{projectId:'velnix-6c1a2',env,apply:false}),{message:'production_project_refused'});
  const cli=CLI('restore','--project','velnix-6c1a2','--file',snapshotFile,'--apply');
  assert.equal(cli.status,1);
  assert.equal(JSON.parse(cli.stderr.trim().split('\n').pop()).error,'production_project_refused');
  assert.equal((cli.stdout+cli.stderr).includes(CIPHERTEXT),false);
});

test('scenario 10: an older snapshot rolls its documents back and reports newer drift without deleting it',async()=>{
  await db.doc('orders/snap_order_2').update({status:'dispatched',revision:99});
  await db.doc('orders/snap_newer').set({createdBy:'snap_gm',status:'ready',dispatchState:'idle',revision:0});
  const result=await tool.restoreSnapshot(db,snapshotObject,{projectId:PROJECT,env,apply:true});
  assert.equal(result.verified,true);
  assert.equal((await db.doc('orders/snap_order_2').get()).data().status,'created');
  assert.equal((await db.doc('orders/snap_order_2').get()).data().revision,1);
  assert.equal(await exists('orders/snap_newer'),true,'restore never deletes documents newer than the snapshot');
  assert.ok(result.extraInTarget.count>=1);
  for(const samplePath of result.extraInTarget.samplePaths)assert.equal(typeof samplePath,'string');
  await deletePaths(['orders/snap_newer']);
  const recovered=await tool.restoreSnapshot(db,snapshotObject,{projectId:PROJECT,env,apply:true});
  assert.equal(recovered.verified,true);
});
