'use strict';
const {execFileSync}=require('node:child_process');
const {readGoogleJson}=require('./google_read');
const PROJECT='velnix-6c1a2';
function createGcloudSession({run=args=>execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:20000,maxBuffer:1024*1024}).trim(),fetchImpl=fetch,env=process.env,expectedAccount}={}){
 if(env.FIREBASE_AUTH_EMULATOR_HOST||env.FIRESTORE_EMULATOR_HOST)throw Error('live_operator_emulator_override_refused');
 const invoke=args=>{try{return run(args).trim();}catch(_){throw Error('gcloud_human_session_unavailable');}};
 for(const key of ['CLOUDSDK_AUTH_ACCESS_TOKEN','CLOUDSDK_AUTH_ACCESS_TOKEN_FILE','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'])if(env[key])throw Error('gcloud_auth_override_refused');
 const account=invoke(['auth','list','--filter=status:ACTIVE','--format=value(account)']);
 const impersonation=invoke(['config','get-value','auth/impersonate_service_account']);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)||account.endsWith('.gserviceaccount.com')||(impersonation&&impersonation!=='(unset)')||(expectedAccount&&expectedAccount!==account))throw Error('gcloud_human_account_required');
 function accessToken(){
  const token=invoke(['auth','print-access-token','--account='+account,'--quiet']);
  if(!token||/\s/.test(token))throw Error('gcloud_token_unavailable');
  return token;
 }
 const credential={async getAccessToken(){
  // gcloud controls expiry and refresh. Do not invent a one-hour expiry for its cached token.
  // A short SDK cache lifetime requests the official session again at the next SDK call.
  return {access_token:accessToken(),expires_in:1};
 }};
 async function get(input){
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['identitytoolkit.googleapis.com','firebase.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com','firebaseappcheck.googleapis.com','firebaserules.googleapis.com','serviceusage.googleapis.com','cloudbilling.googleapis.com','cloudkms.googleapis.com'].includes(url.hostname))throw Error('google_read_destination_refused');
  const response=await fetchImpl(url.href,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+accessToken(),'X-Goog-User-Project':PROJECT},signal:AbortSignal.timeout(20000)});
  try{return await readGoogleJson(response);}catch(e){
   if(e.diagnostic){
    e.diagnostic.request={method:'GET',service:url.hostname};
    // Fixed route labels only: never URLs, UID paths, page tokens or arbitrary query values.
    if(url.pathname.endsWith('/collectionGroups/-/indexes'))e.diagnostic.request.route='projects/{project}/databases/(default)/collectionGroups/-/indexes';
    if(url.hostname==='cloudfunctions.googleapis.com'&&url.pathname.endsWith('/locations/europe-west1/functions'))e.diagnostic.request.route='projects/{project}/locations/europe-west1/functions';
    if(url.searchParams.get('pageSize')==='100')e.diagnostic.request.pageSize=100;
   }
   throw e;
  }
 }
 async function firestoreTransaction(action,body){
  if(!['beginTransaction','batchGet','runQuery','commit','rollback'].includes(action))throw Error('firestore_action_refused');
  const suffix='/documents:'+action;
  const response=await fetchImpl('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)'+suffix,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+accessToken(),'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(action==='runQuery'||action==='batchGet'){
   const data=await response.json();if(!response.ok||!Array.isArray(data)||!data.length||data.some(row=>!row||typeof row!=='object'||row.error||(action==='runQuery'?!row.document&&!row.readTime:!row.found&&!row.missing)))throw Error('unverified_query_response');return data;
  }
  return readGoogleJson(response);
 }
 function readProjectIam(){return JSON.parse(invoke(['projects','get-iam-policy',PROJECT,'--account='+account,'--billing-project='+PROJECT,'--format=json','--quiet']));}
 return {account,credential,get,firestoreTransaction,readProjectIam};
}
module.exports={PROJECT,createGcloudSession};
