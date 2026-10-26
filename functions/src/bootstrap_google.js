'use strict';
const {googleProfile}=require('./google_identity');
async function bootstrapGoogleAdmin({db,auth,FieldValue,uid,project,confirmedProject,apply=false}){
  if(!project||confirmedProject!==project||typeof uid!=='string'||!uid||uid.includes('/'))throw Error('Confirm project and the independently verified Google UID');
  const profile=googleProfile(await auth.getUser(uid));
  // Never discover or link an account by email and never create an Auth user.
  const inspect=async tx=>{
    const read=ref=>tx?tx.get(ref):ref.get();
    const lock=db.doc('settings/bootstrapState'),member=db.doc('members/'+uid),join=db.doc('joinRequests/'+uid);
    const guard=await read(lock),existing=await read(member),request=await read(join);
    const managers=await read(db.collection('members').where('role','==','generalManager').limit(1));
    if(guard.exists||existing.exists||!managers.empty)throw Error('Existing administration or membership found; bootstrap refused. Preserve existing UID and use the migration runbook.');
    if(request.exists&&request.data().status!=='pending')throw Error('Previously decided request cannot be bootstrapped');
    if(tx){
      tx.create(lock,{uid,createdAt:FieldValue.serverTimestamp()});
      tx.create(member,{...profile,role:'generalManager',active:true,permissions:[],salesSupervisorId:null,approvalStatus:'approved',approvedBy:'operator-bootstrap',authorizationVersion:1,createdAt:FieldValue.serverTimestamp()});
      if(request.exists)tx.update(join,{status:'approved',decidedBy:'operator-bootstrap',decidedAt:FieldValue.serverTimestamp()});
      tx.create(db.collection('auditEvents').doc(),{action:'member.google_bootstrap',actorId:'operator-bootstrap',actorName:'مشغل مخول',entityId:uid,extra:{},createdAt:FieldValue.serverTimestamp()});
    }
  };
  if(apply)await db.runTransaction(inspect);else await inspect(null);
  return {validated:true,applied:apply};
}
module.exports={bootstrapGoogleAdmin};
