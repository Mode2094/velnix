'use strict';
// gcloud mode is strictly read-only. Managed ADC apply remains a separate operator action.
async function main(){
 const apply=process.argv.includes('--apply'),explicitGcloud=process.argv.includes('--gcloud-session'),managed=process.argv.includes('--managed-adc');
 if(explicitGcloud&&managed)throw Error('conflicting_operator_auth_modes');
 const gcloud=explicitGcloud||(!apply&&!managed);
 if(gcloud&&apply)throw Error('gcloud_bootstrap_is_readonly');
 const {initializeApp,getApp}=require('firebase-admin/app');
 const {getAuth}=require('firebase-admin/auth');
 let result;
 if(gcloud){
  const {PROJECT,createGcloudSession}=require('./gcloud_session');
  const {gcloudBootstrapDryRun}=require('./bootstrap_readonly');
  const session=createGcloudSession({expectedAccount:process.env.VELNIX_OPERATOR_ACCOUNT});
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT=PROJECT;
  initializeApp({projectId:PROJECT,credential:session.credential});
  result=await gcloudBootstrapDryRun({session,auth:getAuth(),project:PROJECT,confirmedProject:process.env.VELNIX_BOOTSTRAP_CONFIRM_PROJECT,uid:process.env.VELNIX_ADMIN_GOOGLE_UID});
 }else{
  const {getFirestore,FieldValue}=require('firebase-admin/firestore');
  const {bootstrapGoogleAdmin}=require('../src/bootstrap_google');
  initializeApp();
  result=await bootstrapGoogleAdmin({db:getFirestore(),auth:getAuth(),FieldValue,project:getApp().options.projectId||process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,confirmedProject:process.env.VELNIX_BOOTSTRAP_CONFIRM_PROJECT,uid:process.env.VELNIX_ADMIN_GOOGLE_UID,apply});
 }
 console.log(result.applied?'Google administrator bootstrapped; audit recorded.':'Read-only validation passed. No resources changed.');
}
if(require.main===module)main().catch(()=>{console.error('Bootstrap refused. Verify the human gcloud session, project, Google UID and existing administration. No credentials printed; no automatic fallback.');process.exitCode=1;});
module.exports={main};
