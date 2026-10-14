'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {applyOwnerBootstrap,OWNER}=require('../scripts/bootstrap_gcloud_apply');
const {createGcloudSession}=require('../scripts/gcloud_session');
const uid='verified_owner_uid',root='projects/velnix-6c1a2/databases/(default)/documents';
function fixture(options={}){
 const calls=[];let committed=false,writes;
 const auth={getUser:async actual=>({uid:actual,email:OWNER,emailVerified:true,disabled:false,providerData:[{providerId:'google.com',email:OWNER}],...options.record})};
 const session={account:OWNER,get:async url=>{
  calls.push(['get',url]);const path=new URL(url).pathname.split('/documents/')[1];
  if(!committed){if(options.readFailure)throw Error('denied');if(options.lock&&path==='settings/bootstrapState')return {name:root+'/'+path};if(options.join&&path.startsWith('joinRequests/'))return {name:root+'/'+path,fields:{status:{stringValue:options.join}}};const e=Error('missing');e.status=404;e.apiStatus='NOT_FOUND';throw e;}
  if(options.readbackFailure)throw Error('lost read');return writes.find(w=>w.update.name===root+'/'+path).update;
 },firestoreTransaction:async(action,body)=>{
  calls.push([action,body]);if(action==='beginTransaction')return {transaction:'fixture-tx'};
  if(action==='batchGet'){if(options.readFailure)throw Error('denied');return body.documents.map(name=>options.lock&&name.endsWith('/settings/bootstrapState')?{found:{name}}:options.join&&name.includes('/joinRequests/')?{found:{name,fields:{status:{stringValue:options.join}}}}:{missing:name});}
  if(action==='runQuery')return options.member?[{document:{name:root+'/members/old'}}]:[{readTime:'2026-10-15T00:00:00Z'}];
  if(action==='commit'){if(options.conflict)throw Error('ABORTED');committed=true;writes=body.writes;if(options.lostCommit)throw Error('connection lost');return {commitTime:'2026-10-15T00:00:00Z',writeResults:writes.map(()=>({}))};}
  return {};
 }};
 return {session,auth,calls,args:{session,auth,uid,approved:true},writes:()=>writes};
}
test('approved owner creates matching membership lock and audit in one transaction then reads all back',async()=>{
 const f=fixture({join:'pending'}),result=await applyOwnerBootstrap(f.args);
 assert.equal(result.membershipCreated,true);assert.equal(result.readbackVerified,true);
 const writes=f.writes();assert.equal(writes.length,4);assert.equal(writes[1].update.fields.role.stringValue,'generalManager');assert.equal(writes[1].update.fields.active.booleanValue,true);
 const {can,PERMISSIONS}=require('../src/policy');assert.ok(PERMISSIONS.every(permission=>can({active:true,role:'generalManager',permissions:[]},permission)));
 assert.ok(writes.slice(0,3).every(w=>w.currentDocument.exists===false));assert.equal(writes[3].currentDocument.exists,true);
 assert.ok(writes.every(w=>w.updateTransforms[0].setToServerValue==='REQUEST_TIME'));
 assert.equal(f.calls.filter(c=>c[0]==='commit').length,1);
 assert.equal(f.calls.find(c=>c[0]==='runQuery')[1].transaction,'fixture-tx');
 assert.equal(f.calls.find(c=>c[0]==='batchGet')[1].transaction,'fixture-tx');
});
test('wrong operator, missing approval, forged UID or mismatching Google profile refuses before Firestore',async()=>{
 for(const change of [f=>f.args.approved=false,f=>f.auth.getUser=async()=>({uid,email:'other@example.test',emailVerified:true,providerData:[{providerId:'google.com',email:'other@example.test'}]}),f=>f.auth.getUser=async()=>({uid,email:OWNER,emailVerified:true,disabled:true,providerData:[{providerId:'google.com',email:OWNER}]}),f=>f.auth.getUser=async()=>({uid,email:OWNER,emailVerified:true,providerData:[{providerId:'password',email:OWNER}]}),f=>f.args.uid='../forged',f=>f.session.account='other@example.test',f=>f.auth.getUser=async()=>({uid,email:OWNER,emailVerified:false,providerData:[]}),f=>f.auth.getUser=async()=>({uid:'other_uid',email:OWNER,emailVerified:true,providerData:[{providerId:'google.com',email:OWNER}]})]){
  const f=fixture();change(f);await assert.rejects(applyOwnerBootstrap(f.args));assert.equal(f.calls.length,0);
 }
});
for(const [label,options] of [['lock',{lock:true}],['any existing member',{member:true}],['rejected join',{join:'rejected'}],['permission failure',{readFailure:true}]])test(label+' rolls back without commit',async()=>{
 const f=fixture(options);await assert.rejects(applyOwnerBootstrap(f.args));assert.equal(f.calls.some(c=>c[0]==='commit'),false);assert.equal(f.calls.at(-1)[0],'rollback');
});
for(const [label,options] of [['conflict',{conflict:true}],['lost commit response',{lostCommit:true}],['readback failure',{readbackFailure:true}]])test(label+' never reports a created member or retries automatically',async()=>{
 const f=fixture(options);await assert.rejects(applyOwnerBootstrap(f.args),e=>e.outcomeUnknown===true);assert.equal(f.calls.filter(c=>c[0]==='commit').length,1);
});
test('transaction transport is HTTPS scoped, quota bound, no redirects and no credential persistence',async()=>{
 const calls=[],session=createGcloudSession({env:{},run:args=>args[0]==='config'?'(unset)':args[1]==='list'?OWNER:'fixture-token',fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith(':runQuery')?[{readTime:'now'}]:url.endsWith(':batchGet')?[{missing:'fixture'}]:{}));}});
 for(const action of ['beginTransaction','batchGet','runQuery','commit','rollback'])await session.firestoreTransaction(action,{});
 assert.ok(calls.every(({url,options})=>url.startsWith('https://firestore.googleapis.com/v1/projects/velnix-6c1a2/databases/(default)/documents:')&&options.method==='POST'&&options.redirect==='error'&&options.headers['X-Goog-User-Project']==='velnix-6c1a2'));
 await assert.rejects(session.firestoreTransaction('delete',{}));assert.equal(calls.length,5);
});
test('an incomplete or duplicated transaction snapshot is never treated as empty administration',async()=>{
 for(const rows of [[],[{missing:root+'/settings/bootstrapState'}],Array(3).fill({missing:root+'/settings/bootstrapState'}),[{missing:root+'/settings/bootstrapState'},{missing:root+'/members/'+uid},{missing:root+'/orders/forged'}]]){
  const f=fixture(),original=f.session.firestoreTransaction;f.session.firestoreTransaction=(action,body)=>action==='batchGet'?Promise.resolve(rows):original(action,body);
  await assert.rejects(applyOwnerBootstrap(f.args));assert.equal(f.calls.some(c=>c[0]==='commit'),false);assert.equal(f.calls.at(-1)[0],'rollback');
 }
});
test('missing begin-transaction permission cannot lead to any Firestore writes',async()=>{
 const f=fixture();f.session.firestoreTransaction=async()=>{throw Error('PERMISSION_DENIED');};await assert.rejects(applyOwnerBootstrap(f.args));assert.equal(f.calls.length,0);
});
test('a Google account disabled during transaction validation aborts before commit',async()=>{
 const f=fixture(),get=f.auth.getUser;let checks=0;
 f.auth.getUser=async id=>({...await get(id),disabled:++checks>1});
 await assert.rejects(applyOwnerBootstrap(f.args));assert.equal(checks,2);assert.equal(f.calls.some(c=>c[0]==='commit'),false);assert.equal(f.calls.at(-1)[0],'rollback');
});
