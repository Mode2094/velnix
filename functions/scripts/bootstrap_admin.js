'use strict';
// Trusted operator only. Dry-run by default. Never generates passwords or users.
const {initializeApp,getApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {bootstrapGoogleAdmin}=require('../src/bootstrap_google');
initializeApp();
bootstrapGoogleAdmin({db:getFirestore(),auth:getAuth(),FieldValue,
  project:getApp().options.projectId||process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,
  confirmedProject:process.env.VELNIX_BOOTSTRAP_CONFIRM_PROJECT,
  uid:process.env.VELNIX_ADMIN_GOOGLE_UID,apply:process.argv.includes('--apply')
}).then(result=>console.log(result.applied?'Google administrator bootstrapped; audit recorded.':'Read-only validation passed. No resources changed.'))
  .catch(()=>{console.error('Bootstrap refused. Verify project, Google UID and existing administration using the migration runbook; no automatic fallback.');process.exitCode=1;});
