'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const indexes=JSON.parse(fs.readFileSync(path.join(__dirname,'../../firestore.indexes.json'),'utf8')).indexes;
test('new orders and edits index names and phone for backend search',()=>{
  assert.match(src,/fields\.phoneDigits=fields\.phone\.replace/);
  assert.match(src,/fields\.customerKey=normalizeCustomer\(fields\.customer\)/);
});
test('search is authenticated and filtered through the visibility policy',()=>{
  const start=src.indexOf('exports.searchOrders=');const end=src.indexOf('exports.dashboardStats=',start);
  const search=src.slice(start,end);
  assert.match(search,/await requireAuth\(req\)/);
  assert.match(search,/canSeeOrder\(user/);
  assert.match(search,/scopeQueries\(user,filters\)/);
  assert.match(search,/matchingFilters/);
});
test('required indexes for scoped search are recorded',()=>{
  const indexed=(paths)=>indexes.some(i=>i.collectionGroup==='orders'&&paths.every(p=>i.fields.some(f=>f.fieldPath===p)));
  assert.ok(indexed(['createdBy','customerKey']));
  assert.ok(indexed(['createdBy','phoneDigits']));
});
test('ambiguous dispatch is blocked from automatic re-send',()=>{
  assert.match(src,/o\.dispatchState==='needs_review'/);
  assert.match(src,/dispatchState:'needs_review'/);
});
test('uncertain dispatch has audited manager-only recovery',()=>{
  const begin=src.indexOf('exports.resolveDispatchException=');const end=src.indexOf('exports.listMembers=',begin);
  const section=src.slice(begin,end);
  assert.ok(begin>0);
  assert.match(section,/user\.role!=='generalManager'/);
  assert.match(section,/canResolveDispatch\(o\)/);
  assert.match(section,/order\.dispatch_exception_resolved/);
  assert.match(section,/trackingNumber/);
});
test('archiving does not stop incoming updates for previously sent shipments',()=>{
  assert.match(src,/companyCredentials\(companyId,\{allowInactive:true\}\)/);
  assert.match(src,/companyCredentials\(o\.companyId,\{allowInactive:true\}\)/);
});
