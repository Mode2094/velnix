'use strict';
// One-time admin setup. Use trusted local ADC; never check credentials into Git.
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
async function main(){
  const email=process.env.VELNIX_ADMIN_EMAIL;
  const password=process.env.VELNIX_ADMIN_PASSWORD;
  const name=process.env.VELNIX_ADMIN_NAME||'المدير العام';
  if(!email||!password||password.length<14)throw Error('Set VELNIX_ADMIN_EMAIL and a 14+ character VELNIX_ADMIN_PASSWORD in your protected shell');
  const all=await db.collection('members').where('role','==','generalManager').limit(1).get();
  if(!all.empty)throw Error('General manager already exists. Bootstrap refused.');
  let user;
  try{user=await admin.auth().getUserByEmail(email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  const created=!user;
  if(!user)user=await admin.auth().createUser({email,password,displayName:name,emailVerified:false});
  try{await db.doc(`members/${user.uid}`).create({name,email,role:'generalManager',active:true,
    permissions:[],salesSupervisorId:null,createdAt:admin.firestore.FieldValue.serverTimestamp()});}
  catch(e){if(created)await admin.auth().deleteUser(user.uid);throw e;}
  console.log('First general manager created:', user.uid, 'Change the initial password after signing in.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
