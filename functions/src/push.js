'use strict';
const crypto=require('node:crypto');
function deviceId(token) {
  if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token))throw Error('invalid_device_token');
  return crypto.createHash('sha256').update(token).digest('hex');
}
async function deliverNotice(admin,db,noticeId,notice,canSeeOrder) {
  const profile=await db.doc('members/'+notice.recipientId).get();
  if(!profile.exists||profile.data().active!==true)return {ignored:'inactive'};
  if(notice.orderId){
    const order=await db.doc('orders/'+notice.orderId).get();
    if(!order.exists||!canSeeOrder({...profile.data(),id:profile.id},order.data()))return {ignored:'scope'};
  }
  const devices=await db.collection('devices').where('uid','==',notice.recipientId).limit(20).get();
  if(devices.empty)return {ignored:'no_devices'};
  const result=await admin.messaging().sendEachForMulticast({
    tokens:devices.docs.map(d=>d.data().token),
    notification:{title:'Velnix',body:'لديك تحديث جديد. افتح التطبيق لعرض التفاصيل.'},
    data:{noticeId,orderId:notice.orderId||''},
  });
  await Promise.all(result.responses.map((r,i)=>{
    if(['messaging/invalid-registration-token','messaging/registration-token-not-registered'].includes(r.error?.code))return devices.docs[i].ref.delete();
    return Promise.resolve();
  }));
  return {success:result.successCount,failure:result.failureCount};
}
module.exports={deviceId,deliverNotice};
