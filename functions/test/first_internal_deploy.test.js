'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {prepare,plan,forbidden}=require('../scripts/prepare_first_internal');
const {probe}=require('../scripts/probe_first_deploy_indexes');
const root=path.resolve(__dirname,'../..'),expected=require('../../config/firestore.first-acceptance.indexes.json').indexes;
function manifest(dir,file){
 const sdk=path.join(root,'functions/node_modules/firebase-functions/lib/bin/firebase-functions.js');
 const r=spawnSync(process.execPath,[sdk,dir,'unused'],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,NODE_PATH:path.join(root,'functions/node_modules'),GCLOUD_PROJECT:plan.projectId,FIREBASE_CONFIG:JSON.stringify({projectId:plan.projectId}),VELNIX_RUNTIME_SERVICE_ACCOUNT:plan.runtimeServiceAccount,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',METADATA_SERVER_DETECTION:'none',FUNCTIONS_MANIFEST_OUTPUT_PATH:file}});
 assert.equal(r.status,0,r.stderr);return JSON.parse(fs.readFileSync(file));
}
test('actual SDK discovery sees only 23 internal endpoints and no Scheduler required API',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'velnix-first-deploy-'));
 try{
  const dest=prepare(path.join(tmp,'bundle'));
  const full=manifest(path.join(root,'functions'),path.join(tmp,'full.json'));
  assert.equal(Object.keys(full.endpoints).length,35);assert.ok(full.requiredAPIs.some(a=>a.api==='cloudscheduler.googleapis.com'));
  const m=manifest(path.join(dest,'functions'),path.join(tmp,'internal.json'));
  assert.deepEqual(Object.keys(m.endpoints).sort(),[...plan.functions].sort());assert.equal(Object.keys(m.endpoints).length,23);
  assert.ok((m.requiredAPIs||[]).every(a=>!['cloudscheduler.googleapis.com','fcm.googleapis.com','cloudkms.googleapis.com'].includes(a.api)));
  assert.ok(forbidden.every(n=>!m.endpoints[n]));
  for(const endpoint of Object.values(m.endpoints)){assert.deepEqual(endpoint.region,['europe-west1']);assert.equal(endpoint.serviceAccountEmail,plan.runtimeServiceAccount);assert.equal(endpoint.platform,'gcfv2');}
  assert.equal(fs.existsSync(path.join(dest,'functions/node_modules')),false);
  assert.equal(fs.existsSync(path.join(dest,'functions/scripts')),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dest,'firebase.json'))).firestore.indexes,undefined);
  assert.throws(()=>prepare(dest),/destination_exists/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
function resource(i){return {...i,state:'READY',name:`projects/${plan.projectId}/databases/(default)/collectionGroups/${i.collectionGroup}/indexes/test`};}
test('400 fallback compares concrete groups without claiming a full project inventory',async()=>{
 const calls=[];const r=await probe({get:async input=>{const u=new URL(input);calls.push(u);if(u.pathname.includes('/-/')){const e=Error('PRIVATE_SENTINEL');e.status=400;e.diagnostic={apiStatus:'INVALID_ARGUMENT'};throw e;}return {indexes:expected.filter(i=>u.pathname.includes('/'+i.collectionGroup+'/')).map(resource)};}});
 assert.equal(r.fullProjectInventoryVerified,false);assert.equal(r.firstAcceptanceIndexesReady,true);assert.equal(r.coverage,'orders_and_notices_only');
 assert.ok(calls.every(u=>u.protocol==='https:'&&u.hostname==='firestore.googleapis.com'&&u.pathname.endsWith('/indexes')));
 assert.equal(calls[0].searchParams.has('pageSize'),false);assert.equal(JSON.stringify(r).includes('PRIVATE_SENTINEL'),false);assert.equal(r.resourcesChanged,false);
});
test('index probe rejects incomplete, repeated, cross-project or malformed pages rather than claiming readiness',async()=>{
 for(const page of [{nextPageToken:'repeated'}, {indexes:[{...resource(expected[0]),name:'projects/other/databases/(default)/collectionGroups/orders/indexes/x'}]}, {indexes:'not-array'}]){
  const r=await probe({get:async()=>page});assert.equal(r.firstAcceptanceIndexesReady,null);assert.equal(r.fullProjectInventoryVerified,false);
 }
 const r=await probe({get:async()=>({})});assert.equal(r.firstAcceptanceIndexesReady,false);assert.equal(r.fullProjectInventoryVerified,true);
});
test('two acceptance indexes are exact source subsets and exclude shipping/push retry indexes',()=>{
 const {indexKey}=require('../scripts/operational_readiness');const source=require('../../firestore.indexes.json').indexes.map(indexKey);
 assert.equal(expected.length,2);assert.ok(expected.every(i=>source.includes(indexKey(i))));
 assert.deepEqual(expected.map(i=>i.collectionGroup).sort(),['notices','orders']);
 assert.equal(JSON.stringify(expected).includes('nextPollAt'),false);assert.equal(JSON.stringify(expected).includes('pushState'),false);
});
