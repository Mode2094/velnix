'use strict';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
async function readGoogleJson(response){
 let data;
 try{data=await response.json();}catch(_){const e=Error('invalid_google_json');e.status=response.status;throw e;}
 if(!object(data)||!response.ok||data.error){const e=Error('unverified_google_response');e.status=response.status;e.apiStatus=object(data)?data.error?.status:undefined;throw e;}
 return data;
}
function listPage(value,listKey,allowedKeys){
 return object(value)&&Object.keys(value).every(key=>allowedKeys.includes(key))&&
  (!Object.hasOwn(value,listKey)||Array.isArray(value[listKey]))&&
  (!Object.hasOwn(value,'nextPageToken')||typeof value.nextPageToken==='string');
}
module.exports={readGoogleJson,listPage};
