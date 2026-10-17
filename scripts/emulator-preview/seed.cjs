'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),load=id=>require(require.resolve(id,{paths:[path.join(root,'functions')]}));
const projectId='demo-velnix-preview';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
const {initializeApp}=load('firebase-admin/app'),{getFirestore,FieldValue}=load('firebase-admin/firestore'),{getAuth}=load('firebase-admin/auth');
process.env.METADATA_SERVER_DETECTION='none';
initializeApp({projectId});
const fixtures=[
 {role:'generalManager',name:'مدير عام اصطناعي',permissions:[]},
 {role:'manager',name:'مدير اصطناعي',permissions:['viewAllOrders','editAllOrders','updateOrderStatus','viewAmounts','viewReports','viewAudit','manageEmployees']},
 {role:'warehouse',name:'مستودع اصطناعي',permissions:[]},
 {role:'sales',name:'مبيعات اصطناعي',permissions:[]},
 {role:'dataEntry',name:'مدخل اصطناعي',permissions:[],salesSupervisorId:'qa-sales'},
 {role:'pending',name:'حساب معلق اصطناعي',pending:true},
 {role:'disabled',name:'حساب معطل اصطناعي',permissions:[],actualRole:'dataEntry',disabled:true},
];
async function main(){
 const users=fixtures.map(f=>({uid:'qa-'+f.role,email:f.role.toLowerCase()+'@velnix.test',emailVerified:true,displayName:f.name,providerData:[{uid:'google-qa-'+f.role,email:f.role.toLowerCase()+'@velnix.test',displayName:f.name,providerId:'google.com'}]}));
 const result=await getAuth().importUsers(users);assert.equal(result.errors.length,0);
 for(const f of fixtures){if(f.pending)continue;await getFirestore().doc('members/qa-'+f.role).set({name:f.name,email:f.role.toLowerCase()+'@velnix.test',role:f.actualRole||f.role,active:!f.disabled,permissions:f.permissions,approvalStatus:'approved',salesSupervisorId:f.salesSupervisorId||null,authorizationVersion:1,createdAt:FieldValue.serverTimestamp()});}
 // Markers are deliberately not real customer/company records and never leave demo- project.
 console.log(fixtures.length+' synthetic Google emulator identities ready. No bootstrap, real credentials, or external delivery configuration.');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1)});
module.exports={fixtures};
