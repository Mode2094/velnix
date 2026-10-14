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
