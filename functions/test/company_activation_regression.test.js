'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/index'),'utf8');
test('company secret patch is declared before it is checked when enabled',()=>{
 const code=source.slice(source.indexOf('exports.saveCompany='),source.indexOf('exports.archiveCompany='));
 assert.notEqual(code.indexOf('const patch={}'),-1);
 assert.ok(code.indexOf('const patch={}')<code.indexOf('if(req.data?.enabled===true)'));
});
test('Firestore rules disable direct order write and Firebase routes require App Check',()=>{
 const rules=fs.readFileSync(require('node:path').join(__dirname,'../../firestore.rules'),'utf8');
 assert.match(rules,/allow read, write: if false/);
 assert.match(source,/enforceAppCheck:\s*true/);
});
test('dashboard counts use index-backed aggregates rather than 1,000 order sample',()=>{
 const code=source.slice(source.indexOf('exports.dashboardStats='),source.indexOf('exports.getOrder='));
 assert.match(code,/sumOrders/);
 assert.doesNotMatch(code,/limit\(1001\)/);
 assert.match(code,/partial:false/);
});
