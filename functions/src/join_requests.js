'use strict';
const {requireSession,sessionProfile}=require('./google_identity');
const {validRole,validPermissions,documentId}=require('./policy');
module.exports=({db,auth,FieldValue,FieldPath,requireAuth,currentActor,audit,fail})=>{
  const admin=async req=>{const user=await requireAuth(req);if(user.role!=='generalManager')fail('permission-denied','موافقة الانضمام للمدير العام فقط');return user;};
  async function joinSession(req){
    const uid=requireSession(req);
    // Never trust caller-supplied UID, email, name, status, role or permissions.
    let record;
    try { record=await auth.getUser(uid); }
    catch(e){
      if(e?.code==='auth/user-not-found')fail('unauthenticated','انتهت الجلسة أو الحساب غير موجود؛ سجّل الدخول من جديد');
      throw e;
    }
    const profile=sessionProfile(record);
    return db.runTransaction(async tx=>{
      const member=await tx.get(db.doc('members/'+uid));
      const ref=db.doc('joinRequests/'+uid),join=await tx.get(ref);
      if(member.exists){
        const m=member.data();
        return {status:m.active===true&&validRole(m.role)?'approved':'disabled',
          member:{id:uid,name:m.name||'',email:m.email||'',role:m.role,active:m.active===true,permissions:m.permissions||[],salesSupervisorId:m.salesSupervisorId||null}};
      }
      if(join.exists)return {status:join.data().status};
      tx.create(ref,{...profile,status:'pending',createdAt:FieldValue.serverTimestamp()});
      await audit('join.requested',{id:uid,name:profile.name},uid,{},tx);
      return {status:'pending'};
    });
  }
  async function listJoinRequests(req){
    await admin(req);
    const size=req.data?.pageSize??30;
    if(!Number.isSafeInteger(size)||size<1||size>100)fail('invalid-argument','حجم صفحة غير صالح');
    let query=db.collection('joinRequests').where('status','==','pending').orderBy(FieldPath.documentId());
    if(req.data?.afterId)query=query.startAfter(documentId(req.data.afterId));
    const result=await query.limit(size+1).get(),page=result.docs.slice(0,size);
    return {items:page.map(d=>({id:d.id,name:d.data().name,email:d.data().email})),more:result.size>size,afterId:page.at(-1)?.id||null};
  }
  async function decideJoinRequest(req){
    const actor=await admin(req),id=documentId(req.data?.id),decision=req.data?.decision;
    if(id===actor.id)fail('permission-denied','لا يمكن اعتماد حسابك بنفسك');
    if(!['approved','rejected'].includes(decision))fail('invalid-argument','قرار غير صالح');
    const role=req.data?.role,permissions=req.data?.permissions??[],supervisor=req.data?.salesSupervisorId==null?null:documentId(req.data.salesSupervisorId);
    if(decision==='approved'&&(!validRole(role)||!validPermissions(permissions)||supervisor&&(role!=='dataEntry'||supervisor===id)))fail('invalid-argument','دور أو صلاحيات أو فريق غير صالح');
    const profile=decision==='approved'?sessionProfile(await auth.getUser(id)):null;
    await db.runTransaction(async tx=>{
      await currentActor(tx,actor);
      const ref=db.doc('joinRequests/'+id),join=await tx.get(ref),member=await tx.get(db.doc('members/'+id));
      if(!join.exists||join.data().status!=='pending'||member.exists)fail('failed-precondition','تمت معالجة الطلب أو يوجد حساب بالفعل؛ حدّث القائمة');
      if(profile&&profile.email!==join.data().email)fail('failed-precondition','تغيرت هوية الحساب؛ يلزم مراجعة المسؤول');
      let sup;
      if(decision==='approved'&&supervisor){sup=await tx.get(db.doc('members/'+supervisor));if(!sup.exists||sup.data().role!=='sales'||sup.data().active!==true)fail('failed-precondition','مشرف المبيعات غير متاح');}
      if(decision==='approved'){
        tx.create(db.doc('members/'+id),{...profile,role,permissions:[...new Set(permissions)],salesSupervisorId:supervisor,active:true,approvalStatus:'approved',approvedBy:actor.id,createdAt:FieldValue.serverTimestamp(),authorizationVersion:1});
        if(sup)tx.update(sup.ref,{authorizationVersion:FieldValue.increment(1)});
      }
      tx.update(ref,{status:decision,decidedBy:actor.id,decidedAt:FieldValue.serverTimestamp()});
      await audit('join.'+decision,actor,id,decision==='approved'?{role}: {},tx);
    });
    return {ok:true};
  }
  return {joinSession,listJoinRequests,decideJoinRequest};
};
