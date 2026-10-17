'use strict';
// LOCAL FILES ONLY. This module never authenticates or invokes gcloud/firebase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'config/first-internal-deploy.json')));
const forbidden=['deliveryWebhook','reconcileDeliveryStatuses','pushNotice','registerDevice','unregisterDevice','assignCompany','saveCompany','archiveCompany','restoreCompany','testCompanyConnection','sendOrderToDelivery','resolveDispatchException'];
function prepare(destination=path.join(root,'build/first-internal')){
 assert.equal(plan.projectId,'velnix-6c1a2');assert.equal(plan.cloudChangesAuthorized,false);
 assert.equal(plan.functions.length,23);assert.equal(new Set(plan.functions).size,23);
 assert.ok(forbidden.every(n=>!plan.functions.includes(n)));
 assert.ok(plan.functions.every(n=>/^[A-Za-z][A-Za-z0-9]+$/.test(n)));
 if(fs.existsSync(destination))throw Error('destination_exists_refusing_overwrite');
 const target=path.join(destination,'functions');fs.mkdirSync(path.join(target,'src'),{recursive:true});
 // Explicit file allowlist: never copy node_modules, credentials, .env, logs, tests,
 // bootstrap tools, local SDK configs or a symlink to a different directory.
 for(const name of fs.readdirSync(path.join(root,'functions/src'))){
  const source=path.join(root,'functions/src',name);
  if(!name.endsWith('.js')||!fs.lstatSync(source).isFile())throw Error('unexpected_source_file');
  fs.copyFileSync(source,path.join(target,'src',name));
 }
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json')));
 pkg.main='src/first_internal.js';
 fs.writeFileSync(path.join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 fs.copyFileSync(path.join(root,'functions/package-lock.json'),path.join(target,'package-lock.json'));
 fs.writeFileSync(path.join(target,'src/first_internal.js'),"'use strict';\nconst api=require('./index');\nfor(const name of "+JSON.stringify(plan.functions)+") {\n if(typeof api[name]!=='function')throw Error('approved_handler_missing');\n exports[name]=api[name];\n}\n");
 fs.writeFileSync(path.join(target,'.env.'+plan.projectId),'VELNIX_RUNTIME_SERVICE_ACCOUNT='+plan.runtimeServiceAccount+'\nVELNIX_KMS_KEY=\nALLOWED_DELIVERY_HOSTS=\n');
 fs.copyFileSync(path.join(root,'firestore.rules'),path.join(destination,'firestore.rules'));
 fs.writeFileSync(path.join(destination,'firebase.json'),JSON.stringify({functions:[{source:'functions',codebase:'default',ignore:['node_modules','.git','*.log']}],firestore:{rules:'firestore.rules'}},null,2)+'\n');
 fs.writeFileSync(path.join(destination,'review.json'),JSON.stringify({...plan,sourceCommit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),forbiddenExports:forbidden,deployExecuted:false},null,2)+'\n');
 return destination;
}
if(require.main===module){try{console.log('Prepared local review bundle only: '+prepare());}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={prepare,plan,forbidden};
