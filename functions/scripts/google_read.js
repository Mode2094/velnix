'use strict';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Only official enumerations and fixed explanations may leave an error response.
const statuses=new Set(['INVALID_ARGUMENT','PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','FAILED_PRECONDITION','RESOURCE_EXHAUSTED','UNAVAILABLE','INTERNAL','DEADLINE_EXCEEDED']);
const errorDomains=new Set(['googleapis.com','iam.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com','serviceusage.googleapis.com','cloudbilling.googleapis.com']);
const reasons={
 SERVICE_DISABLED:['service_disabled','The API is disabled for the request consumer; no activation was attempted.'],
 IAM_PERMISSION_DENIED:['permission_denied','The API reports a missing IAM permission.'],
 ACCESS_TOKEN_SCOPE_INSUFFICIENT:['oauth_scope_insufficient','The human OAuth session lacks a required scope; this does not establish an IAM failure.'],
 BILLING_DISABLED:['billing_requirement','This API reports a billing prerequisite; project billing remains unknown unless billingInfo is readable.'],
 CONSUMER_INVALID:['invalid_consumer','The API rejected the quota consumer project.'],
 API_KEY_INVALID:['authentication_configuration','The API rejected its authentication configuration.']
};
function apiDiagnostic(data,httpStatus){
 const error=object(data?.error)?data.error:{};
 const status=statuses.has(error.status)?error.status:undefined;
 const info=Array.isArray(error.details)?error.details.find(d=>d?.['@type']==='type.googleapis.com/google.rpc.ErrorInfo'&&errorDomains.has(d.domain)&&Object.hasOwn(reasons,d.reason)):undefined;
 const bad=Array.isArray(error.details)&&error.details.some(d=>d?.['@type']==='type.googleapis.com/google.rpc.BadRequest'&&Array.isArray(d.fieldViolations)&&d.fieldViolations.length>0);
 let category='undetermined',technicalReason='No safe structured reason was supplied; HTTP status alone does not establish the cause.';
 if(info)[category,technicalReason]=reasons[info.reason];
 else if(status==='INVALID_ARGUMENT'){category='invalid_request';technicalReason=bad?'The API reports invalid request fields; raw field values and descriptions are withheld.':'The API rejected an argument; the exact field is not confirmed.';}
 else if(status==='UNAUTHENTICATED'){category='authentication_required';technicalReason='The API did not accept the authentication session.';}
 const result={httpStatus:Number.isInteger(httpStatus)?httpStatus:null,category,technicalReason};
 if(status)result.apiStatus=status;
 if(Number.isInteger(error.code)&&error.code>=100&&error.code<=599)result.apiCode=error.code;
 if(info)result.reason=info.reason;
 if(bad){
  const allowed=new Set(['parent','page_size','pageSize','page_token','pageToken','filter','fields']);
  result.invalidFields=[...new Set(error.details.filter(d=>d?.['@type']==='type.googleapis.com/google.rpc.BadRequest').flatMap(d=>Array.isArray(d.fieldViolations)?d.fieldViolations:[]).map(v=>v?.field).filter(f=>allowed.has(f)))];
 }
 return result;
}
async function readGoogleJson(response){
 let data;
 try{data=await response.json();}catch(_){const e=Error('invalid_google_json');e.status=response.status;e.diagnostic=apiDiagnostic(null,response.status);throw e;}
 if(!object(data)||!response.ok||data.error){const e=Error('unverified_google_response');e.status=response.status;e.diagnostic=apiDiagnostic(data,response.status);e.apiStatus=e.diagnostic.apiStatus;throw e;}
 return data;
}
function listPage(value,listKey,allowedKeys){
 return object(value)&&Object.keys(value).every(key=>allowedKeys.includes(key))&&
  (!Object.hasOwn(value,listKey)||Array.isArray(value[listKey]))&&
  (!Object.hasOwn(value,'nextPageToken')||typeof value.nextPageToken==='string');
}
module.exports={readGoogleJson,listPage};
