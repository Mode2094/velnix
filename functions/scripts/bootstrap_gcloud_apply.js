'use strict';
const crypto=require('node:crypto');
const {PROJECT}=require('./gcloud_session');
const {googleProfile}=require('../src/google_identity');
const OWNER='moderohe8@gmail.com';
const ROOT=`projects/${PROJECT}/databases/(default)/documents`;
const endpoint='https://firestore.googleapis.com/v1/'+ROOT;
// No retries after commit: a lost response is an unknown outcome, never a false failure/success.
async function applyOwnerBootstrap({session,auth,uid,approved=false}){
 if(!approved||session.account!==OWNER||typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('owner_bootstrap_not_authorized');
 const verify=async()=>{
  const record=await auth.getUser(uid),profile=googleProfile(record);
  if(record.uid!==uid||profile.email!==OWNER)throw Error('owner_identity_mismatch');return profile;
 };
 const profile=await verify();
 const begin=await session.firestoreTransaction('beginTransaction',{options:{readWrite:{}}});
 if(typeof begin.transaction!=='string'||!begin.transaction)throw Error('invalid_transaction');
 const transaction=begin.transaction;let commitAttempted=false;
 try{
  const paths=['settings/bootstrapState','members/'+uid,'joinRequests/'+uid];
  const snapshots=await session.firestoreTransaction('batchGet',{transaction,documents:paths.map(path=>ROOT+'/'+path)});
  if(snapshots.length!==paths.length)throw Error('incomplete_transaction_snapshot');
  const docs=new Map();
  for(const row of snapshots){
   const name=row.found?.name||row.missing;
   if(!paths.some(path=>ROOT+'/'+path===name)||docs.has(name)||Boolean(row.found)===Boolean(row.missing))throw Error('invalid_transaction_snapshot');
   docs.set(name,row.found||null);
  }
  const [lock,member,join]=paths.map(path=>docs.get(ROOT+'/'+path));
  const rows=await session.firestoreTransaction('runQuery',{transaction,structuredQuery:{from:[{collectionId:'members'}],limit:1}});
  if(lock||member||rows.some(row=>row.document))throw Error('existing_membership_or_administration');
  if(join&&join.fields?.status?.stringValue!=='pending')throw Error('previously_decided_request');
  await verify();
  const auditId=crypto.randomUUID();
  const value=x=>x===null?{nullValue:null}:Array.isArray(x)?{arrayValue:{values:x.map(value)}}:typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?{integerValue:String(x)}:typeof x==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]))}}:{stringValue:x};
  const write=(path,data,timeField,exists=false)=>({update:{name:ROOT+'/'+path,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]))},currentDocument:{exists},...(exists?{updateMask:{fieldPaths:Object.keys(data)}}:{}),updateTransforms:[{fieldPath:timeField,setToServerValue:'REQUEST_TIME'}]});
  const writes=[
   write('settings/bootstrapState',{uid},'createdAt'),
   write('members/'+uid,{...profile,role:'generalManager',active:true,permissions:[],salesSupervisorId:null,approvalStatus:'approved',approvedBy:'operator-bootstrap',authorizationVersion:1},'createdAt'),
   write('auditEvents/'+auditId,{action:'member.google_bootstrap',actorId:'operator-bootstrap',actorName:'مشغل مخول',entityId:uid,extra:{operatorEmail:session.account}},'createdAt')
  ];
  if(join)writes.push(write('joinRequests/'+uid,{status:'approved',decidedBy:'operator-bootstrap'},'decidedAt',true));
  commitAttempted=true;
  const result=await session.firestoreTransaction('commit',{transaction,writes});
  if(typeof result.commitTime!=='string'||!Array.isArray(result.writeResults)||result.writeResults.length!==writes.length)throw Error('invalid_commit_response');
  const checks=await Promise.all(['members/'+uid,'settings/bootstrapState','auditEvents/'+auditId].map(path=>session.get(endpoint+'/'+path)));
  if(checks[0].name!==ROOT+'/members/'+uid||checks[0].fields?.role?.stringValue!=='generalManager'||checks[0].fields?.active?.booleanValue!==true||checks[0].fields?.email?.stringValue!==OWNER||checks[0].fields?.approvalStatus?.stringValue!=='approved'||checks[1].name!==ROOT+'/settings/bootstrapState'||checks[1].fields?.uid?.stringValue!==uid||checks[2].name!==ROOT+'/auditEvents/'+auditId||checks[2].fields?.entityId?.stringValue!==uid||checks[2].fields?.action?.stringValue!=='member.google_bootstrap')throw Error('readback_failed');
  return {membershipCreated:true,readbackVerified:true,uid,commitTime:result.commitTime};
 }catch(error){
  if(commitAttempted){const uncertain=Error('bootstrap_commit_outcome_unknown');uncertain.outcomeUnknown=true;throw uncertain;}
  await session.firestoreTransaction('rollback',{transaction}).catch(()=>{});throw error;
 }
}
module.exports={applyOwnerBootstrap,OWNER};
