'use strict';
// Run in the owner's Google Cloud Shell. GET-only; tokens stay in memory.
const PROJECT='velnix-6c1a2';
const {listPage}=require('./google_read');
const {createGcloudSession}=require('./gcloud_session');
async function inventory({get,candidateEmail}){
  const result={projectId:PROJECT,readOnly:true,authentication:{},firestore:{},bootstrapExecuted:false};
  async function read(label,path){
    try{return await get(path);}catch(e){result[label]={status:'unverified',httpStatus:Number.isInteger(e.status)?e.status:null};return undefined;}
  }
  const auth=await read('authConfiguration',`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config`);
  if(auth)result.authConfiguration={status:'read',emailPasswordEnabled:auth.signIn?.email?.enabled??null};
  const google=await read('googleProvider',`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`);
  if(google)result.googleProvider={status:'read',enabled:google.enabled===true,clientIdPresent:!!google.clientId};
  let count=0,pageToken,candidate=null,complete=true;const authPages=new Set();
  do{
    const url=new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`);
    url.searchParams.set('maxResults','1000');
    url.searchParams.set('fields','users(localId,email,emailVerified,disabled,providerUserInfo(providerId,email)),nextPageToken');
    if(pageToken)url.searchParams.set('nextPageToken',pageToken);
    const page=await read('authUserRead',url.href);
    if(!listPage(page,'users',['users','nextPageToken'])||(page.nextPageToken&&authPages.has(page.nextPageToken))){complete=false;result.authUserRead??={status:'unverified',reason:'unexpected_or_repeated_page'};break;}
    if(page.nextPageToken)authPages.add(page.nextPageToken);
    for(const user of page.users||[]){count++;if(user.email?.toLowerCase()===candidateEmail.toLowerCase())candidate={uidFromAuthRecordOnly:user.localId,emailVerified:user.emailVerified===true,disabled:user.disabled===true,googleProviderLinked:(user.providerUserInfo||[]).some(p=>p.providerId==='google.com'),googleSessionVerified:false};}
    pageToken=page.nextPageToken;
  }while(pageToken);
  result.authentication={status:complete?'read':'unverified',totalUsers:complete?count:null,candidate:complete?candidate:null};
  const database=await read('firestoreDatabase',`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
  if(!database){result.firestore={status:'unverified',members:null,joinRequests:null,bootstrapState:null};result.readyForBootstrap=false;return result;}
  result.firestore.database={status:'read',locationId:database.locationId||null};
  for(const collection of ['members','joinRequests']){
    let total=0,managers=0,next,ok=true;const seen=new Set();
    do{
      const url=new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`);
      url.searchParams.set('pageSize','300');url.searchParams.append('mask.fieldPaths','role');
      if(next)url.searchParams.set('pageToken',next);
      const page=await read(collection+'Read',url.href);
      if(!listPage(page,'documents',['documents','nextPageToken'])||(page.nextPageToken&&seen.has(page.nextPageToken))){ok=false;result[collection+'Read']??={status:'unverified',reason:'unexpected_or_repeated_page'};break;}
      if(page.nextPageToken)seen.add(page.nextPageToken);
      for(const doc of page.documents||[]){total++;if(doc.fields?.role?.stringValue==='generalManager')managers++;}
      next=page.nextPageToken;
    }while(next);
    result.firestore[collection]={status:ok?'read':'unverified',count:ok?total:null};
    if(collection==='members')result.firestore.generalManagersIncludingInactive=ok?managers:null;
  }
  try{
    await get(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/settings/bootstrapState?mask.fieldPaths=uid`);
    result.firestore.bootstrapState={status:'read',exists:true};
  }catch(e){
    // A structured NOT_FOUND from the API is distinguishable from access failure.
    result.firestore.bootstrapState=e.status===404&&e.apiStatus==='NOT_FOUND'?{status:'not-found',exists:false}:{status:'unverified',exists:null,httpStatus:e.status??null};
  }
  result.readyForBootstrap=false;
  result.next='Review inventory; perform real Firebase Google sign-in and verify its ID token/UID before bootstrap dry-run. No deployment or membership creation is authorized by this output.';
  return result;
}
async function main(){
  const email=process.argv[2];
  if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('candidate_email_required');
  const {get}=createGcloudSession();
  console.log(JSON.stringify(await inventory({get,candidateEmail:email}),null,2));
}
if(require.main===module)main().catch(()=>{console.error('Read-only inventory could not start. In Google Cloud Shell authorize your human Google account with access to velnix-6c1a2, then retry. No credentials or response bodies printed.');process.exitCode=1;});
module.exports={inventory};
