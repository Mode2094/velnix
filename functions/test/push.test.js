'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deviceId,deliverNotice}=require('../src/push');
test('push token identity is deterministic and malformed registrations are rejected',()=>{
  const token='local_device_token_1234567890';
  assert.equal(deviceId(token),deviceId(token));assert.equal(deviceId(token).length,64);
  for(const value of ['short','has spaces '.repeat(3),null,{},'x'.repeat(4097)])assert.throws(()=>deviceId(value));
});
test('push payload contains no customer data and checks scope and membership before send',async()=>{
  let active=true,visible=true,sent=null,removed=false;
  const db={
    doc:path=>({get:async()=>path.startsWith('members/')?{exists:true,id:'recipient',data:()=>({role:'sales',active})}:{exists:true,data:()=>({customer:'PRIVATE',phone:'PRIVATE',createdBy:'other'})}}),
    collection:()=>({where:()=>({limit:()=>({get:async()=>({empty:false,docs:[{data:()=>({token:'local_device_token_1234567890'}),ref:{delete:async()=>{removed=true;}}}]})})})}),
  };
  const admin={messaging:()=>({sendEachForMulticast:async payload=>{sent=payload;return {successCount:0,failureCount:1,responses:[{error:{code:'messaging/registration-token-not-registered'}}]};}})};
  const notice={recipientId:'recipient',orderId:'order',title:'PRIVATE',body:'PRIVATE'};
  visible=false;assert.equal((await deliverNotice(admin,db,'notice',notice,()=>visible)).ignored,'scope');assert.equal(sent,null);
  visible=true;active=false;assert.equal((await deliverNotice(admin,db,'notice',notice,()=>visible)).ignored,'inactive');assert.equal(sent,null);
  active=true;await deliverNotice(admin,db,'notice',notice,()=>visible);
  assert.equal(JSON.stringify(sent).includes('PRIVATE'),false);assert.deepEqual(sent.data,{noticeId:'notice',orderId:'order'});assert.equal(removed,true);
});
test('android payload targets the named channel declared by the app',async()=>{
  let sent=null;
  const db={
    doc:path=>({get:async()=>path.startsWith('members/')?{exists:true,id:'recipient',data:()=>({role:'manager',active:true})}:{exists:true,data:()=>({createdBy:'recipient'})}}),
    collection:()=>({where:()=>({limit:()=>({get:async()=>({docs:[{data:()=>({token:'local_device_token_1234567890'}),ref:{delete:async()=>{}}}]})})})}),
  };
  const admin={messaging:()=>({sendEachForMulticast:async payload=>{sent=payload;return {successCount:1,failureCount:0,responses:[{success:true}]};}})};
  await deliverNotice(admin,db,'notice',{recipientId:'recipient'},()=>true);
  assert.equal(sent.android.notification.channelId,'velnix_order_updates');
  assert.equal(sent.notification.title,'Velnix');
  assert.equal(JSON.stringify(sent).includes('customer'),false);
});
test('device identity is token scoped so two registrations cannot collide',()=>{
  const a=deviceId('token_a_1234567890abcd'),b=deviceId('token_b_1234567890abcd');
  assert.notEqual(a,b);
  assert.equal(a,deviceId('token_a_1234567890abcd'));
});
