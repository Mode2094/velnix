'use strict';
const {listPage}=require('./google_read');
const {bootstrapGoogleAdmin}=require('../src/bootstrap_google');
const {PROJECT}=require('./gcloud_session');
function readonlyBootstrapDb(get,uid){
 if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('verified_uid_required');
 const root=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
 return {
  doc(path){
   if(!['settings/bootstrapState','members/'+uid,'joinRequests/'+uid].includes(path))throw Error('bootstrap_read_path_refused');
   return {async get(){
    try{
     const result=await get(root+'/'+path.split('/').map(encodeURIComponent).join('/'));
     if(typeof result.name!=='string'||!result.name.endsWith('/'+path))throw Error('invalid_document_response');
     return {exists:true,data:()=>({status:result.fields?.status?.stringValue})};
    }catch(e){if(e.status===404&&e.apiStatus==='NOT_FOUND')return {exists:false};throw e;}
   }};
  },
  collection(name){
   if(name!=='members')throw Error('bootstrap_read_collection_refused');
   return {where(field,op,value){
    if(field!=='role'||op!=='=='||value!=='generalManager')throw Error('bootstrap_read_query_refused');
    return {limit(size){
     if(size!==1)throw Error('bootstrap_read_limit_refused');
     return {async get(){
      let next;const seen=new Set();
      do{
       const url=new URL(root+'/members');url.searchParams.set('pageSize','300');url.searchParams.set('mask.fieldPaths','role');if(next)url.searchParams.set('pageToken',next);
       const page=await get(url.href);
       if(!listPage(page,'documents',['documents','nextPageToken'])||(page.nextPageToken&&seen.has(page.nextPageToken)))throw Error('invalid_members_page');
       if((page.documents||[]).some(d=>d.fields?.role?.stringValue==='generalManager'))return {empty:false};
       next=page.nextPageToken;if(next)seen.add(next);
      }while(next);
      return {empty:true};
     }};
    }};
   }};
  }
 };
}
async function gcloudBootstrapDryRun({session,auth,uid,project,confirmedProject,apply=false}){
 if(apply)throw Error('gcloud_bootstrap_is_readonly');
 if(project!==PROJECT||confirmedProject!==PROJECT)throw Error('bootstrap_project_mismatch');
 return bootstrapGoogleAdmin({db:readonlyBootstrapDb(session.get,uid),auth,uid,project,confirmedProject,apply:false});
}
module.exports={readonlyBootstrapDb,gcloudBootstrapDryRun};
