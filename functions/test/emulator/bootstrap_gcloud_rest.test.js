'use strict';
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const {applyOwnerBootstrap,OWNER}=require('../../scripts/bootstrap_gcloud_apply');
const {createGcloudSession}=require('../../scripts/gcloud_session');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host||!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Loopback Firestore emulator required');
const live='velnix-6c1a2',demo='demo-velnix-owner-bootstrap',root=`http://${host}/v1/projects/${demo}/databases/(default)/documents`;
// Transport substitution only in this test: all writes go to a demo namespace on loopback.
const session=createGcloudSession({env:{},run:args=>args[0]==='config'?'(unset)':args[1]==='list'?OWNER:'fixture-token',fetchImpl:async(url,options)=>{
 assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/'+live+'/'));
 const result=await fetch(url.replace('https://firestore.googleapis.com','http://'+host).replace(live,demo),{...options,headers:{...options.headers,Authorization:'Bearer owner'},body:options.body?.replaceAll(live,demo)});
 return new Response((await result.text()).replaceAll(demo,live),{status:result.status,headers:{'Content-Type':'application/json'}});
}});
const uid='verified_owner_uid',auth={getUser:async id=>({uid:id,email:OWNER,emailVerified:true,providerData:[{providerId:'google.com',email:OWNER}]})};
const args={session,auth,uid,approved:true};
const read=async path=>{const response=await fetch(root+'/'+path,{headers:{Authorization:'Bearer owner'}});assert.equal(response.status,200);return response.json();};
const seed=async(path,fields)=>{const response=await fetch(root+'/'+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields})});assert.equal(response.status,200);};
beforeEach(async()=>{const response=await fetch(`http://${host}/emulator/v1/projects/${demo}/databases/(default)/documents`,{method:'DELETE'});assert.equal(response.status,200);});
test('REST bootstrap commits all records atomically, verifies server timestamps and refuses repetition',async()=>{
 await seed('joinRequests/'+uid,{status:{stringValue:'pending'},email:{stringValue:OWNER}});
 const result=await applyOwnerBootstrap(args);assert.equal(result.readbackVerified,true);
 const member=await read('members/'+uid),lock=await read('settings/bootstrapState'),join=await read('joinRequests/'+uid);
 assert.equal(member.fields.role.stringValue,'generalManager');assert.equal(member.fields.active.booleanValue,true);assert.ok(member.fields.createdAt.timestampValue);assert.equal(lock.fields.uid.stringValue,uid);assert.equal(join.fields.status.stringValue,'approved');assert.equal(join.fields.email.stringValue,OWNER);assert.ok(join.fields.decidedAt.timestampValue);
 await assert.rejects(applyOwnerBootstrap(args));
 const audits=await (await fetch(root+'/auditEvents',{headers:{Authorization:'Bearer owner'}})).json();assert.equal(audits.documents.length,1);
});
test('concurrent REST bootstrap attempts can never produce two administrators',async()=>{
  const results=await Promise.allSettled([applyOwnerBootstrap(args),applyOwnerBootstrap(args)]);
  const fulfilled=results.filter(r=>r.status==='fulfilled');
  // The invariant that protects the single-owner rule. Two concurrent
  // bootstraps must never both land.
  assert.ok(fulfilled.length<=1,`two concurrent bootstraps both succeeded (${fulfilled.length})`);
  // This script is retry-free by design: a contended commit is reported as an
  // unknown outcome rather than silently retried, so under load it is legitimate
  // for every attempt to abort. The operator then simply re-runs. Whatever
  // happened, the final state must still hold exactly one owner, one lock and
  // one audit.
  if(fulfilled.length===0){
    try{await applyOwnerBootstrap(args);}
    catch(error){
      // Only acceptable if the winner's lock is genuinely present.
      assert.equal((await fetch(root+'/settings/bootstrapState',{headers:{Authorization:'Bearer owner'}})).status,200);
    }
  }
  const member=await read('members/'+uid);
  assert.equal(member.fields.role.stringValue,'generalManager');
  assert.equal(member.fields.active.booleanValue,true);
  assert.ok(member.fields.createdAt.timestampValue);
  assert.equal((await read('settings/bootstrapState')).fields.uid.stringValue,uid);
  const audits=await (await fetch(root+'/auditEvents',{headers:{Authorization:'Bearer owner'}})).json();
  assert.equal(audits.documents.length,1,`expected exactly one audit, saw ${audits.documents.length}`);
  // A further attempt is always refused once the owner is established.
  await assert.rejects(applyOwnerBootstrap(args));
});
test('an existing non-administrator membership blocks bootstrap without a new lock or audit',async()=>{
 await seed('members/old',{role:{stringValue:'sales'},active:{booleanValue:false}});
 await assert.rejects(applyOwnerBootstrap(args));
 for(const path of ['settings/bootstrapState','members/'+uid])assert.equal((await fetch(root+'/'+path,{headers:{Authorization:'Bearer owner'}})).status,404);
 const audits=await (await fetch(root+'/auditEvents',{headers:{Authorization:'Bearer owner'}})).json();assert.equal(audits.documents?.length||0,0);
});
test('a failed commit precondition leaves no partial member, lock or audit',async()=>{
 const broken={...session,firestoreTransaction:async(action,body)=>{
  if(action==='commit')body={...body,writes:body.writes.map((write,index)=>index===2?{...write,currentDocument:{exists:true}}:write)};
  return session.firestoreTransaction(action,body);
 }};
 await assert.rejects(applyOwnerBootstrap({...args,session:broken}),e=>e.outcomeUnknown===true);
 for(const path of ['settings/bootstrapState','members/'+uid])assert.equal((await fetch(root+'/'+path,{headers:{Authorization:'Bearer owner'}})).status,404);
 const audits=await (await fetch(root+'/auditEvents',{headers:{Authorization:'Bearer owner'}})).json();assert.equal(audits.documents?.length||0,0);
});
