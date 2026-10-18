'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {initializeApp,getApp,deleteApp}=require('firebase-admin/app');
initializeApp({projectId:'demo-velnix-unit'});
const {getFirestore,Timestamp,GeoPoint}=require('firebase-admin/firestore');
const db=getFirestore();
const tool=require('../scripts/firestore_snapshot');
const SCRIPT=path.join(__dirname,'..','scripts','firestore_snapshot.js');
const LOOPBACK={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
const SECRET='SYNTHETIC-LOCAL-SECRET-DO-NOT-LOG';
const tmpFiles=[];
function writeTmp(text){const file=path.join(os.tmpdir(),`velnix-snapshot-unit-${process.pid}-${tmpFiles.length}.json`);fs.writeFileSync(file,text);tmpFiles.push(file);return file;}
function runCli(args,env={}){return spawnSync(process.execPath,[SCRIPT,...args],{encoding:'utf8',env:{...process.env,...LOOPBACK,...env}});}
after(async()=>{for(const file of tmpFiles)fs.rmSync(file,{force:true});await deleteApp(getApp());});

const SNAPSHOT_DOCS=[{path:'orders/unit_a',data:{status:'ready',dispatchState:'idle',revision:1,amountMinor:1250}},{path:'orders/unit_a/events/unit_e1',data:{action:'created',details:{source:'manual',tags:['a','b']}}},{path:'companySecrets/unit_company',data:{apiTokenCiphertext:SECRET}}];
const snapshot=()=>tool.buildSnapshot(JSON.parse(JSON.stringify(SNAPSHOT_DOCS)),{projectId:'demo-velnix-unit',env:LOOPBACK,now:()=>1700000000000});

test('isolated-environment guard refuses production, non-demo and non-loopback targets',()=>{
  for(const project of ['velnix-6c1a2','velnix-6c1a2-anything'])assert.throws(()=>tool.assertIsolatedEnvironment(project,LOOPBACK),{message:/production|non_demo/});
  assert.throws(()=>tool.assertIsolatedEnvironment('velnix-staging',LOOPBACK),{message:'non_demo_project_refused'});
  assert.throws(()=>tool.assertIsolatedEnvironment('',LOOPBACK),{message:'project_id_required'});
  assert.throws(()=>tool.assertIsolatedEnvironment('demo-velnix',{}),{message:'emulator_host_required'});
  assert.throws(()=>tool.assertIsolatedEnvironment('demo-velnix',{FIRESTORE_EMULATOR_HOST:'10.0.0.5:8080'}),{message:'emulator_host_required'});
  assert.throws(()=>tool.assertIsolatedEnvironment('demo-velnix',{FIRESTORE_EMULATOR_HOST:'localhost:8080'}),{message:'emulator_host_required'});
  assert.equal(tool.assertIsolatedEnvironment('demo-velnix',LOOPBACK),'demo-velnix');
});

test('the guards also cover snapshot creation and restoration directly',async()=>{
  const fakeDb={listCollections:async()=>[]};
  await assert.rejects(tool.createSnapshot(fakeDb,{projectId:'velnix-6c1a2',env:LOOPBACK}),{message:'production_project_refused'});
  await assert.rejects(tool.createSnapshot(fakeDb,{projectId:'not-demo',env:LOOPBACK}),{message:'non_demo_project_refused'});
  await assert.rejects(tool.restoreSnapshot(fakeDb,snapshot(),{projectId:'velnix-staging',env:LOOPBACK,apply:true}),{message:'non_demo_project_refused'});
  await assert.rejects(tool.restoreSnapshot(fakeDb,snapshot(),{projectId:'demo-other',env:LOOPBACK,apply:true}),{message:'snapshot_project_mismatch'});
});

test('values survive the encode/decode round trip, including typed values',()=>{
  const reference=db.doc('orders/unit_a');
  const input={text:'نص عربي',empty:'',flag:true,nothing:null,int:42,float:1.5,negative:-7,list:[1,'two',false,null],nested:{deep:{value:'x'}},stamp:new Timestamp(1700000000,123456789),ref:reference,point:new GeoPoint(24.7136,46.6753),bytes:Buffer.from('binary-payload')};
  const decoded=tool.decodeValue(tool.encodeValue(input),db);
  assert.equal(decoded.text,input.text);
  assert.equal(decoded.flag,input.flag);
  assert.equal(decoded.nothing,null);
  assert.equal(decoded.int,42);
  assert.equal(decoded.float,1.5);
  assert.deepEqual(decoded.list,[1,'two',false,null]);
  assert.deepEqual(decoded.nested,{deep:{value:'x'}});
  assert.ok(decoded.stamp instanceof Timestamp);
  assert.equal(decoded.stamp.seconds,1700000000);
  assert.equal(decoded.stamp.nanoseconds,123456789);
  assert.equal(decoded.ref.path,'orders/unit_a');
  assert.equal(decoded.point.latitude,24.7136);
  assert.equal(decoded.point.longitude,46.6753);
  assert.equal(Buffer.compare(decoded.bytes,Buffer.from('binary-payload')),0);
});

test('unsupported values and reserved field names are refused',()=>{
  assert.throws(()=>tool.encodeValue(new Date()),{message:'snapshot_unsupported_value'});
  assert.throws(()=>tool.encodeValue(Number.NaN),{message:'snapshot_unsupported_value'});
  assert.throws(()=>tool.encodeValue({bad:{__velnixType:'timestamp'}}),{message:'snapshot_reserved_field_name'});
});

test('a snapshot serializes, parses and verifies with a stable hash',()=>{
  const first=snapshot();
  const text=JSON.stringify(first);
  const parsed=tool.parseSnapshot(text);
  const report=tool.verifySnapshot(parsed);
  assert.equal(report.ok,true);
  assert.equal(report.documentCount,3);
  assert.deepEqual(report.patterns,{'orders/*':1,'orders/*/events/*':1,'companySecrets/*':1});
  assert.equal(report.sha256,first.manifest.sha256);
  assert.equal(tool.verifySnapshot(tool.parseSnapshot(text)).sha256,report.sha256);
});

test('tampering, truncation and structural damage are detected',()=>{
  const text=JSON.stringify(snapshot());
  const tampered=JSON.parse(text);
  tampered.documents[0].data.status='shipped';
  assert.throws(()=>tool.verifySnapshot(tampered),{message:'snapshot_hash_mismatch'});
  assert.throws(()=>tool.parseSnapshot(text.slice(0,text.length-20)),{message:'snapshot_not_json'});
  const noManifest=JSON.parse(text);delete noManifest.manifest;
  assert.throws(()=>tool.verifySnapshot(noManifest),{message:'snapshot_manifest_missing'});
  const countLie=JSON.parse(text);countLie.manifest.documentCount=99;
  assert.throws(()=>tool.verifySnapshot(countLie),{message:'snapshot_manifest_count_mismatch'});
  const duplicate=JSON.parse(text);duplicate.documents.push(JSON.parse(JSON.stringify(duplicate.documents[0])));duplicate.manifest.documentCount=4;
  assert.throws(()=>tool.verifySnapshot(duplicate),{message:'snapshot_duplicate_path'});
  for(const badPath of ['orders','orders/../x','orders//x','__reserved/doc','orders/doc/events']){
    const bad=JSON.parse(text);bad.documents.push({path:badPath,data:{ok:true}});bad.manifest.documentCount=4;
    assert.throws(()=>tool.verifySnapshot(bad),{message:'snapshot_path_invalid'},badPath);
  }
  const badFormat=JSON.parse(text);badFormat.format='something-else';
  assert.throws(()=>tool.verifySnapshot(badFormat),{message:'snapshot_format_unsupported'});
});

test('restore dry-run touches no database and refuses production or corrupt input before any write',async()=>{
  const exploding=new Proxy({},{get:(_,key)=>{if(key==='then')return undefined;throw Error('database_touched');}});
  const plan=await tool.restoreSnapshot(exploding,snapshot(),{projectId:'demo-velnix-unit',env:LOOPBACK,apply:false});
  assert.equal(plan.dryRun,true);
  assert.equal(plan.planned,3);
  await assert.rejects(tool.restoreSnapshot(exploding,snapshot(),{projectId:'velnix-6c1a2',env:LOOPBACK,apply:true}),{message:'production_project_refused'});
  const corrupted=snapshot();
  corrupted.documents[0].data.status='tampered';
  await assert.rejects(tool.restoreSnapshot(exploding,corrupted,{projectId:'demo-velnix-unit',env:LOOPBACK,apply:true}),{message:'snapshot_hash_mismatch'});
  const empty=tool.buildSnapshot([],{projectId:'demo-velnix-unit',env:LOOPBACK});
  await assert.rejects(tool.restoreSnapshot(exploding,empty,{projectId:'demo-velnix-unit',env:LOOPBACK,apply:true}),{message:'empty_snapshot_refused'});
});

test('implicit parent documents are recovered through the known subcollection ids',async()=>{
  // Firestore never stores a parent document created implicitly by a
  // subcollection write, so collection queries do not return it. The walk must
  // still capture its subcollection documents through collection-group reads.
  const eventDoc={ref:{path:'deliveryInbox/snap_company/events/snap_evt_1',listCollections:async()=>[]},data:()=>({raw:'in_transit'})};
  const fakeDb={
    listCollections:async()=>[],
    collectionGroup:id=>({get:async()=>({docs:id==='events'?[eventDoc]:[]})}),
  };
  const documents=await tool.collectDocuments(fakeDb);
  assert.deepEqual(tool.KNOWN_SUBCOLLECTION_IDS,['events']);
  assert.equal(documents.length,1);
  assert.equal(documents[0].path,'deliveryInbox/snap_company/events/snap_evt_1');
  assert.equal(documents[0].data.raw,'in_transit');
});

test('the CLI verifies from a file, defaults restore to dry-run and never echoes values',()=>{
  const file=writeTmp(JSON.stringify(snapshot()));
  const verified=runCli(['verify','--project','demo-velnix-unit','--file',file]);
  assert.equal(verified.status,0,verified.stderr);
  assert.equal(verified.stdout.includes(SECRET),false);
  assert.equal(verified.stderr.includes(SECRET),false);
  assert.equal(JSON.parse(verified.stdout).documentCount,3);
  const planned=runCli(['restore','--project','demo-velnix-unit','--file',file]);
  assert.equal(planned.status,0,planned.stderr);
  assert.equal(JSON.parse(planned.stdout).dryRun,true);
  assert.equal(planned.stdout.includes(SECRET),false);
});

test('the CLI refuses production, non-demo, missing arguments and corrupt files with static codes',()=>{
  const file=writeTmp(JSON.stringify(snapshot()));
  for(const [args,code] of [
    [['verify','--project','velnix-6c1a2','--file',file],'production_project_refused'],
    [['restore','--project','velnix-6c1a2','--file',file,'--apply'],'production_project_refused'],
    [['verify','--project','staging','--file',file],'non_demo_project_refused'],
    [['verify','--project','demo-velnix-unit'],'file_required'],
    [['verify','--file',file],'project_id_required'],
    [['frobnicate','--project','demo-velnix-unit','--file',file],'action_required'],
    [['verify','--project','demo-velnix-unit','--file',file,'--wat'],'unknown_argument'],
    [['verify','--project','demo-velnix-unit','--file',writeTmp('{"broken":')],'snapshot_not_json'],
  ]){
    const result=runCli(args);
    assert.equal(result.status,1,args.join(' '));
    const report=JSON.parse(result.stderr.trim().split('\n').pop());
    assert.equal(report.ok,false,args.join(' '));
    assert.equal(report.error,code,args.join(' '));
    assert.equal(result.stderr.includes(SECRET),false);
  }
  const missing=runCli(['verify','--project','demo-velnix-unit','--file',path.join(os.tmpdir(),'velnix-does-not-exist.json')]);
  assert.equal(missing.status,1);
  assert.equal(JSON.parse(missing.stderr.trim().split('\n').pop()).error,'operation_failed');
});
