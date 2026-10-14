'use strict';
// One-time admin setup. Use trusted local ADC; never check credentials into Git.
const {initializeApp,getApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,FieldPath}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
initializeApp();
const db=getFirestore();
async function main(){
  const project=getApp().options.projectId||process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
  if(!project||process.env.VELNIX_BOOTSTRAP_CONFIRM_PROJECT!==project)throw Error('Confirm the selected project using VELNIX_BOOTSTRAP_CONFIRM_PROJECT before bootstrap');
  const email=process.env.VELNIX_ADMIN_EMAIL;
  const password=process.env.VELNIX_ADMIN_PASSWORD;
  const name=process.env.VELNIX_ADMIN_NAME||'المدير العام';
  if(!email||!password||password.length<14)throw Error('Set VELNIX_ADMIN_EMAIL and a 14+ character VELNIX_ADMIN_PASSWORD in your protected shell');
  const all=await db.collection('members').where('role','==','generalManager').limit(1).get();
  if(!all.empty)throw Error('General manager already exists. Bootstrap refused.');
  let user;
  try{user=await getAuth().getUserByEmail(email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  const created=!user;
  if(!user)user=await getAuth().createUser({email,password,displayName:name,emailVerified:false});
  try{await db.runTransaction(async tx=>{
    const lock=db.doc('settings/bootstrapState');
    const guard=await tx.get(lock);
    const managers=await tx.get(db.collection('members').where('role','==','generalManager').limit(1));
    if(guard.exists||!managers.empty)throw Error('General manager already bootstrapped');
    tx.create(lock,{createdAt:FieldValue.serverTimestamp()});
    tx.create(db.doc('members/'+user.uid),{name,email,role:'generalManager',active:true,permissions:[],salesSupervisorId:null,createdAt:FieldValue.serverTimestamp()});
  });}
  catch(e){if(created)await getAuth().deleteUser(user.uid);throw e;}
  console.log('First general manager created:', user.uid, 'Change the initial password after signing in.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
