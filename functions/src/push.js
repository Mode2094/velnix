'use strict';
const crypto=require('node:crypto');
const {Timestamp,FieldValue}=require('firebase-admin/firestore');
const MAX_ATTEMPTS=4,LEASE_MS=120000;
const TEMPORARY=new Set(['messaging/server-unavailable','messaging/internal-error','messaging/unknown-error','messaging/quota-exceeded','unavailable','resource-exhausted','ECONNRESET','ETIMEDOUT','EAI_AGAIN']);
const INVALID=new Set(['messaging/invalid-registration-token','messaging/registration-token-not-registered']);
function safeCode(error){return TEMPORARY.has(error?.code)||INVALID.has(error?.code)?error.code:'push_send_failed';}
function deviceId(token) {
  if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token))throw Error('invalid_device_token');
  return crypto.createHash('sha256').update(token).digest('hex');
}
async function deliverNotice(admin,db,noticeId,notice,canSeeOrder) {
  const profile=await db.doc('members/'+notice.recipientId).get();
  if(!profile.exists||profile.data().active!==true)return {ignored:'inactive',delivered:[]};
  if(notice.orderId){
    const order=await db.doc('orders/'+notice.orderId).get();
    if(!order.exists)return {ignored:'scope',delivered:[]};
    const creator=await db.doc('members/'+order.data().createdBy).get();
    const permitted=creator.data()?.role==='dataEntry'&&creator.data().salesSupervisorId===profile.id;
    if(!canSeeOrder({...profile.data(),id:profile.id,authorizedCreatorIds:permitted?[order.data().createdBy]:[]},order.data()))return {ignored:'scope',delivered:[]};
  }
  const snapshot=await db.collection('devices').where('uid','==',notice.recipientId).limit(20).get();
  const acknowledged=new Set(notice.pushDeliveredDevices||[]);
  const devices=snapshot.docs.filter(d=>!acknowledged.has(d.id||deviceId(d.data().token)));
  if(!devices.length)return {ignored:acknowledged.size?'already_delivered':'no_devices',delivered:[]};
  const result=await admin.messaging().sendEachForMulticast({
    tokens:devices.map(d=>d.data().token),
    notification:{title:'Velnix',body:'لديك تحديث جديد. افتح التطبيق لعرض التفاصيل.'},
    data:{noticeId,orderId:notice.orderId||''},
  });
  const delivered=[];let retryable=false,lastError=null;
  await Promise.all(result.responses.map(async(r,i)=>{
    if(r.success){delivered.push(devices[i].id||deviceId(devices[i].data().token));return;}
    lastError=safeCode(r.error);
    if(INVALID.has(r.error?.code))await devices[i].ref.delete();
    if(TEMPORARY.has(r.error?.code))retryable=true;
  }));
  return {success:result.successCount,failure:result.failureCount,delivered,retryable,lastError};
}
async function processPush({db,admin,ref,canSeeOrder,now=Date.now,deliver=deliverNotice}){
  const claim=crypto.randomUUID(),time=now();
  const notice=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)return null;const n=snap.data();
    if(['sent','failed'].includes(n.pushState)||(n.pushState==='completed'&&!n.pushOutcome?.failure))return null;
    if(n.pushState==='processing'&&n.pushLeaseUntil?.toMillis()>time)return null;
    if(n.pushState==='pending'&&n.pushNextAttemptAt?.toMillis()>time)return null;
    const attempts=(n.pushAttempts||0)+1;
    if(attempts>MAX_ATTEMPTS){tx.update(ref,{pushState:'failed',pushLastError:'attempts_exhausted',pushClaimId:FieldValue.delete(),pushLeaseUntil:FieldValue.delete(),pushNextAttemptAt:FieldValue.delete()});return null;}
    tx.update(ref,{pushState:'processing',pushAttempts:attempts,pushClaimId:claim,pushLeaseUntil:Timestamp.fromMillis(time+LEASE_MS),pushNextAttemptAt:Timestamp.fromMillis(time+LEASE_MS)});
    return {...n,pushAttempts:attempts};
  });
  if(!notice)return {ignored:'not_due_or_claimed'};
  let outcome;
  try{outcome=await deliver(admin,db,ref.id,notice,canSeeOrder);}
  catch(error){outcome={success:0,failure:1,delivered:[],retryable:TEMPORARY.has(error.code),lastError:safeCode(error)};}
  const retry=outcome.retryable&&notice.pushAttempts<MAX_ATTEMPTS;
  const successful=outcome.success>0||(notice.pushDeliveredDevices||[]).length>0||outcome.ignored==='already_delivered';
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(snap.data()?.pushClaimId!==claim)return;
    tx.update(ref,{pushState:retry?'pending':successful?'sent':'failed',
      pushDeliveredDevices:[...new Set([...(snap.data().pushDeliveredDevices||[]),...(outcome.delivered||[])])],
      pushLastError:outcome.lastError||outcome.ignored||null,
      pushOutcome:{success:outcome.success||0,failure:outcome.failure||0},pushProcessedAt:Timestamp.fromMillis(now()),
      pushNextAttemptAt:retry?Timestamp.fromMillis(now()+Math.min(30*60*1000,60000*2**(notice.pushAttempts-1))):FieldValue.delete(),
      pushLeaseUntil:FieldValue.delete(),pushClaimId:FieldValue.delete()});
  });
  return outcome;
}
async function recoverPushes(options){
  const {db}=options;
  const due=await db.collection('notices').where('pushState','in',['pending','processing']).where('pushNextAttemptAt','<=',Timestamp.fromMillis((options.now||Date.now)())).orderBy('pushNextAttemptAt').limit(25).get();
  const deadline=Date.now()+45000;
  for(const doc of due.docs){if(Date.now()>=deadline)break;await processPush({...options,ref:doc.ref});}
  // Compatibility: recover leases/failures left by the former at-most-once implementation.
  const legacy=await db.collection('notices').where('pushState','==','sending').limit(10).get();
  for(const doc of legacy.docs){if(Date.now()>=deadline)break;await processPush({...options,ref:doc.ref});}
  const failed=await db.collection('notices').where('pushState','==','completed').where('pushOutcome.failure','==',true).limit(10).get();
  for(const doc of failed.docs){if(Date.now()>=deadline)break;await processPush({...options,ref:doc.ref});}
  return {checked:due.size+legacy.size+failed.size};
}
module.exports={deviceId,deliverNotice,processPush,recoverPushes,MAX_ATTEMPTS,LEASE_MS};
