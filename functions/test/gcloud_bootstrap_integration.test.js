'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
const {readonlyBootstrapDb,gcloudBootstrapDryRun}=require('../scripts/bootstrap_readonly');
test('readonly adapter has no transaction or mutation methods and rejects apply before reading',async()=>{
 let reads=0;const session={get:async()=>{reads++;return {};}};
 const db=readonlyBootstrapDb(session.get,'verified_uid');assert.equal(db.runTransaction,undefined);assert.equal(db.doc('settings/bootstrapState').set,undefined);
 assert.throws(()=>readonlyBootstrapDb(session.get,'..'));assert.throws(()=>db.doc('orders/forbidden'));assert.throws(()=>db.collection('orders'));
 await assert.rejects(gcloudBootstrapDryRun({session,uid:'verified_uid',project:'velnix-6c1a2',confirmedProject:'velnix-6c1a2',apply:true}));assert.equal(reads,0);
});
test('actual bootstrap CLI and Firebase Admin Auth use gcloud plus quota header with ADC absent',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'velnix-gcloud-integration-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let lock=false,manager=false,requests=0;
 const server=http.createServer(async(req,res)=>{
  requests++;assert.equal(req.headers.authorization,'Bearer fixture-access-token');assert.equal(req.headers['x-goog-user-project'],'velnix-6c1a2');
  res.setHeader('content-type','application/json');
  if(req.url.includes('accounts:lookup')){
   assert.equal(req.method,'POST');let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body).localId,['verified_uid']);
   res.end(JSON.stringify({users:[{localId:'verified_uid',email:'owner@example.test',emailVerified:true,disabled:false,providerUserInfo:[{providerId:'google.com',email:'owner@example.test',rawId:'google-owner'}]}]}));return;
  }
  assert.equal(req.method,'GET');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('/members')){res.end(JSON.stringify(manager?{documents:[{name:'projects/velnix-6c1a2/databases/(default)/documents/members/old',fields:{role:{stringValue:'generalManager'}}}]}:{}));return;}
  if(url.pathname.endsWith('/settings/bootstrapState')&&lock){res.end(JSON.stringify({name:'projects/velnix-6c1a2/databases/(default)/documents/settings/bootstrapState'}));return;}
  res.statusCode=404;res.end('{"error":{"status":"NOT_FOUND"}}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const host='127.0.0.1:'+server.address().port;
 const fakeCli=path.join(root,'gcloud');
 await fs.writeFile(fakeCli,`#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='config')console.log('(unset)');else if(args[1]==='list')console.log('operator@example.test');else if(args[1]==='print-access-token')console.log('fixture-access-token');else process.exit(9);\n`,{mode:0o700});
 const preload=path.join(root,'transport.cjs');
 await fs.writeFile(preload,`const original=global.fetch;global.fetch=(input,options)=>{const u=new URL(input);if(u.hostname!=='firestore.googleapis.com')throw Error('Unexpected external request');return original('http://${host}'+u.pathname+u.search,options);};const https=require('node:https'),http=require('node:http');https.request=(options,callback)=>{if((options.hostname||options.host)!=='identitytoolkit.googleapis.com')throw Error('Unexpected SDK destination');return http.request({...options,protocol:'http:',hostname:'127.0.0.1',host:'127.0.0.1',port:${server.address().port},agent:undefined},callback);};\n`);
 const env={...process.env,PATH:root+path.delimiter+process.env.PATH,GOOGLE_APPLICATION_CREDENTIALS:path.join(root,'ADC_DOES_NOT_EXIST.json'),VELNIX_BOOTSTRAP_CONFIRM_PROJECT:'velnix-6c1a2',VELNIX_ADMIN_GOOGLE_UID:'verified_uid',VELNIX_OPERATOR_ACCOUNT:'operator@example.test'};
 for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','CLOUDSDK_AUTH_ACCESS_TOKEN','CLOUDSDK_AUTH_ACCESS_TOKEN_FILE','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'])delete env[key];
 const command=['--require',preload,path.resolve(__dirname,'../scripts/bootstrap_admin.js'),'--gcloud-session'];
 const success=await execute(process.execPath,command,{env});assert.match(success.stdout,/Read-only validation passed/);assert.equal(success.stdout.includes('fixture-access-token'),false);assert.ok(requests>=5);
 const defaultDry=await execute(process.execPath,command.filter(arg=>arg!=='--gcloud-session'),{env});assert.match(defaultDry.stdout,/Read-only validation passed/);
 lock=true;await assert.rejects(execute(process.execPath,command,{env}),e=>!e.stderr.includes('fixture-access-token'));lock=false;
 manager=true;await assert.rejects(execute(process.execPath,command,{env}));manager=false;
 const before=requests;await assert.rejects(execute(process.execPath,[...command,'--managed-adc'],{env}));await assert.rejects(execute(process.execPath,[...command,'--apply'],{env}));assert.equal(requests,before);
});
