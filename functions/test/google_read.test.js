'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readGoogleJson}=require('../scripts/google_read');
test('HTTP 200 empty JSON remains a valid account-list response',async()=>{
 assert.deepEqual(await readGoogleJson(new Response('{}')) ,{});
});
test('HTTP 200 invalid JSON, arrays, null and error payloads fail closed',async()=>{
 for(const body of ['not JSON','[]','null','{"error":{"status":"PERMISSION_DENIED"}}'])await assert.rejects(readGoogleJson(new Response(body)));
});
test('only a structured API not-found preserves NOT_FOUND; proxy HTML is not evidence of absence',async()=>{
 await assert.rejects(readGoogleJson(new Response('{"error":{"status":"NOT_FOUND"}}',{status:404})),e=>e.status===404&&e.apiStatus==='NOT_FOUND');
 await assert.rejects(readGoogleJson(new Response('<html>blocked</html>',{status:404})),e=>e.apiStatus===undefined);
});
test('structured Google causes are classified without arbitrary messages, metadata or credentials',async()=>{
 for(const [reason,category] of [['SERVICE_DISABLED','service_disabled'],['IAM_PERMISSION_DENIED','permission_denied'],['ACCESS_TOKEN_SCOPE_INSUFFICIENT','oauth_scope_insufficient'],['BILLING_DISABLED','billing_requirement']]){
  const body={error:{code:403,status:'PERMISSION_DENIED',message:'SECRET_MESSAGE',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason,domain:'googleapis.com',metadata:{activationUrl:'SECRET_URL',token:'SECRET_TOKEN'}}]}};
  await assert.rejects(readGoogleJson(new Response(JSON.stringify(body),{status:403})),e=>{
   assert.equal(e.diagnostic.category,category);assert.equal(e.diagnostic.reason,reason);assert.equal(e.diagnostic.apiCode,403);assert.equal(JSON.stringify(e).includes('SECRET'),false);return true;
  });
 }
});
test('invalid request details do not expose field values and bare 403 remains ambiguous',async()=>{
 const body={error:{code:400,status:'INVALID_ARGUMENT',message:'SECRET',details:[{'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[{field:'SECRET',description:'SECRET'}]}]}};
 await assert.rejects(readGoogleJson(new Response(JSON.stringify(body),{status:400})),e=>e.diagnostic.category==='invalid_request'&&!JSON.stringify(e).includes('SECRET'));
 for(const body of ['{}','<html>SECRET</html>',JSON.stringify({error:{status:'SECRET',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',domain:'googleapis.com',reason:'SECRET'}]}})])await assert.rejects(readGoogleJson(new Response(body,{status:403})),e=>e.diagnostic.category==='undetermined'&&!JSON.stringify(e).includes('SECRET'));
});
test('an untrusted ErrorInfo domain cannot establish that an API is disabled',async()=>{
 const body={error:{code:403,status:'PERMISSION_DENIED',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'SERVICE_DISABLED',domain:'untrusted.invalid'}]}};
 await assert.rejects(readGoogleJson(new Response(JSON.stringify(body),{status:403})),e=>e.diagnostic.category==='undetermined');
});
test('BadRequest identifies only allowlisted field names without their values',async()=>{
 const body={error:{code:400,status:'INVALID_ARGUMENT',details:[{'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[{field:'pageSize',description:'SECRET'},{field:'PRIVATE_TOKEN',description:'SECRET'}]}]}};
 await assert.rejects(readGoogleJson(new Response(JSON.stringify(body),{status:400})),e=>{
  assert.deepEqual(e.diagnostic.invalidFields,['pageSize']);assert.equal(JSON.stringify(e).includes('PRIVATE_TOKEN'),false);assert.equal(JSON.stringify(e).includes('SECRET'),false);return true;
 });
});
