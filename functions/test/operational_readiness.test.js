'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {operationalReadiness,sourcePlan,indexKey}=require('../scripts/operational_readiness');
const {createGcloudSession}=require('../scripts/gcloud_session');
const project='velnix-6c1a2',owner='moderohe8@gmail.com',uid='verified_existing_uid',plan=sourcePlan();
const ids={android:'1:948196868655:android:4465def254bb941ac43cda',ios:'1:948196868655:ios:58a6ca83ccb4e1e3c43cda',web:'1:948196868655:web:ace9b264b4fae48ac43cda'};
function fixture(overrides={}){
 const calls=[];
 const get=async input=>{calls.push(input);const u=new URL(input),p=decodeURIComponent(u.pathname);
  if(overrides.get){const value=await overrides.get(p,u);if(value!==undefined)return value;}
  if(p.endsWith('/billingInfo'))return {billingEnabled:true,billingAccountName:'PRIVATE_BILLING_ACCOUNT'};
  if(p.endsWith('/defaultSupportedIdpConfigs/google.com'))return {enabled:true,clientId:'public-client',clientSecret:'SENSITIVE_SENTINEL'};
  if(p==='/v2/projects/'+project+'/config')return {authorizedDomains:[project+'.firebaseapp.com'],signIn:{email:{enabled:true,passwordRequired:true}}};
  if(p.endsWith('/documents/settings/bootstrapState'))return {name:'projects/'+project+'/databases/(default)/documents/settings/bootstrapState',fields:{uid:{stringValue:uid}}};
  if(p.endsWith('/documents/members/'+uid))return {name:'projects/'+project+'/databases/(default)/documents/members/'+uid,fields:{email:{stringValue:owner},role:{stringValue:'generalManager'},active:{booleanValue:true},approvalStatus:{stringValue:'approved'}}};
  if(p==='/v1/projects/'+project+'/databases/(default)')return {name:'projects/'+project+'/databases/(default)',locationId:'eur3',type:'FIRESTORE_NATIVE'};
  if(p.endsWith('/releases/cloud.firestore'))return {rulesetName:'projects/'+project+'/rulesets/fixture'};
  if(p.includes('/rulesets/'))return {source:{files:[{name:'firestore.rules',content:plan.rules}]}};
  if(p.endsWith('/collectionGroups/-/indexes'))return {indexes:plan.indexes.map((i,n)=>({...i,name:`projects/${project}/databases/(default)/collectionGroups/${i.collectionGroup}/indexes/${n}`,state:'READY',fields:[...i.fields,{fieldPath:'__name__',order:i.fields.filter(f=>f.order).at(-1)?.order||'ASCENDING'}]}))};
  if(p.endsWith('/functions'))return {functions:plan.functions.filter(f=>p.includes('/locations/'+f.region+'/')).map(f=>({name:`projects/${project}/locations/${f.region}/functions/${f.name}`,state:'ACTIVE',environment:'GEN_2',buildConfig:{runtime:'nodejs22',environmentVariables:{secret:'SENSITIVE_SENTINEL'}},serviceConfig:{serviceAccountEmail:'runtime@'+project+'.iam.gserviceaccount.com',environmentVariables:{secret:'SENSITIVE_SENTINEL'}}}))};
  if(p.endsWith('/documents/companies'))return {};
  for(const platform of ['android','ios','web']){
   if(p.endsWith('/'+platform+'Apps'))return {apps:[{appId:ids[platform],state:'ACTIVE',packageName:platform==='android'?'com.mode2094.velnix':undefined,bundleId:platform==='ios'?'com.mode2094.velnix':undefined}]};
   if(p.endsWith('/'+platform+'Apps/'+ids[platform]+'/config')){
    if(platform==='web')return {projectId:project,appId:ids.web,authDomain:project+'.firebaseapp.com',apiKey:'SENSITIVE_SENTINEL'};
    const text=platform==='android'?JSON.stringify({project_info:{project_id:project},client:[{client_info:{mobilesdk_app_id:ids.android,android_client_info:{package_name:'com.mode2094.velnix'}},oauth_client:[{client_type:3,client_id:'public.apps.googleusercontent.com'}]}]}):'<plist><key>PROJECT_ID</key><string>'+project+'</string><key>GOOGLE_APP_ID</key><string>'+ids.ios+'</string><key>BUNDLE_ID</key><string>com.mode2094.velnix</string><key>CLIENT_ID</key><string>public.apps.googleusercontent.com</string><key>REVERSED_CLIENT_ID</key><string>com.googleusercontent.apps.public</string></plist>';
    return {configFileContents:Buffer.from(text).toString('base64')};
   }
  }
  if(p.endsWith('/sha'))return {certificates:[{certType:'SHA_1'},{certType:'SHA_256'}]};
  if(/\/(playIntegrityConfig|deviceCheckConfig|recaptchaV3Config)$/.test(p))return {name:p,secret:'SENSITIVE_SENTINEL'};
  if(u.hostname==='firebaseappcheck.googleapis.com'&&p.endsWith('/services'))return {services:[{name:p+'/firestore.googleapis.com',enforcementMode:'ENFORCED'}]};
  if(u.hostname==='serviceusage.googleapis.com')return {services:['identitytoolkit.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com','firebaseappcheck.googleapis.com','fcm.googleapis.com','run.googleapis.com','eventarc.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','pubsub.googleapis.com','storage.googleapis.com','firebaserules.googleapis.com','cloudscheduler.googleapis.com'].map(name=>({config:{name}}))};
  if(p.endsWith('/locations/europe-west1/keyRings'))return {};
  if(p==='/v1beta1/projects/'+project)return {projectId:project,projectNumber:'948196868655',state:'ACTIVE'};
  throw Error('Unexpected read: '+p);
 };
 const auth={getUser:async actual=>{assert.equal(actual,uid);return {uid,email:owner,emailVerified:true,disabled:false,providerData:[{providerId:'google.com',email:owner}],...overrides.record};}};
 const readIam=async()=>({bindings:[{role:'roles/datastore.user',members:['serviceAccount:runtime@'+project+'.iam.gserviceaccount.com']},{role:'roles/owner',members:['user:PRIVATE_OTHER_USER']} ]});
 return {args:{get,auth,readIam,plan},calls};
}
test('post-bootstrap inventory verifies existing administration, source rules/indexes and platforms without bootstrap or writes',async()=>{
 const f=fixture(),r=await operationalReadiness(f.args);
 assert.deepEqual(r.blockers,[]);assert.equal(r.services.administrator.ownerEmailMatches,true);assert.equal(r.services.indexes.missingOrNotReady,0);assert.equal(r.services.rules.matchesSource,true);assert.equal(r.services.iosSdk.reverseSchemeConsistent,true);assert.equal(r.services.androidSdk.googleServerClientPresent,true);
 assert.equal(r.deployed,false);assert.equal(r.bootstrapExecuted,false);assert.equal(r.phaseComplete,false);assert.equal(r.deployment.authorized,false);
 for(const sentinel of ['SENSITIVE_SENTINEL','PRIVATE_BILLING_ACCOUNT','PRIVATE_OTHER_USER',uid])assert.equal(JSON.stringify(r).includes(sentinel),false);
 assert.ok(f.calls.every(url=>url.startsWith('https://')));assert.equal(f.calls.some(url=>/beginTransaction|commit|accounts:signUp|:send/.test(url)),false);
});
test('permission failures remain unverified and never become missing or absent services',async()=>{
 const f=fixture();f.args.get=async()=>{const e=Error('forbidden');e.status=403;throw e;};f.args.readIam=async()=>{throw Error('denied');};
 const r=await operationalReadiness(f.args);assert.equal(r.services.database.status,'unverified');assert.equal(r.services.billing.status,'unverified');assert.equal(r.fcm.apiEnabled,null);assert.ok(r.blockers.includes('database:unverified'));assert.equal(r.phaseComplete,false);
});
test('malformed and repeated list pages are not accepted as empty cloud state',async()=>{
 for(const response of [{unexpected:[]},{functions:[],unreachable:['europe-west1']},{functions:[],nextPageToken:'same'}]){
  const f=fixture({get:p=>p.endsWith('/functions')?response:undefined}),r=await operationalReadiness(f.args);assert.equal(r.services.functions.status,'unverified');
 }
});
test('rules drift, missing indexes, absent backend and disabled billing produce concrete blockers',async()=>{
 const f=fixture({get:p=>p.endsWith('/billingInfo')?{billingEnabled:false}:p.includes('/rulesets/')?{source:{files:[{content:'different'}]}}:p.endsWith('/indexes')?{}:p.endsWith('/functions')?{}:undefined});
 const r=await operationalReadiness(f.args);for(const blocker of ['published_rules_differ','indexes_missing_or_not_ready','backend_missing_or_inactive','functions_v2_deployment_requires_separate_blaze_approval'])assert.ok(r.blockers.includes(blocker));
});
test('disabled administrator is reported for review without any bootstrap recovery',async()=>{
 const f=fixture({record:{disabled:true}}),r=await operationalReadiness(f.args);assert.ok(r.blockers.includes('existing_administrator_requires_review_no_bootstrap'));assert.equal(r.bootstrapExecuted,false);
});
test('only the current registered web app and matching mobile packages qualify',async()=>{
 const f=fixture({get:p=>p.endsWith('/webApps')?{apps:[{appId:'old-web-app',state:'ACTIVE'}]}:p.endsWith('/androidApps')?{apps:[{appId:ids.android,state:'ACTIVE',packageName:'wrong.package'}]}:undefined});
 const r=await operationalReadiness(f.args);assert.equal(r.services.webApps.expectedRegistrationActive,false);assert.equal(r.services.androidApps.expectedRegistrationActive,false);assert.ok(r.blockers.includes('web:expected_registration_unverified_or_inactive'));
});
test('project IAM read uses the pinned official human session and redacts unrelated identities',()=>{
 const calls=[],s=createGcloudSession({env:{},expectedAccount:owner,run:args=>{calls.push(args);return args[0]==='projects'?'{}':args[0]==='config'?'(unset)':owner;}});assert.deepEqual(s.readProjectIam(),{});const args=calls.at(-1);assert.equal(args[1],'get-iam-policy');assert.ok(args.includes('--account='+owner));assert.ok(args.includes('--billing-project='+project));
});
test('source manifest includes all 38 exports, existing schedulers, and deny-by-default rules; index normalization preserves real filters',()=>{
 assert.equal(plan.functions.length,38);assert.equal(plan.functions.filter(f=>f.kind==='onSchedule').length,2);assert.equal(plan.indexes.length,109);assert.equal(plan.bootstrapForbidden,true);
 assert.notEqual(indexKey(plan.indexes[0]),indexKey({...plan.indexes[0],queryScope:'COLLECTION_GROUP'}));
 assert.notEqual(indexKey(plan.indexes[0]),indexKey({...plan.indexes[0],fields:[...plan.indexes[0].fields,{fieldPath:'__name__',order:'DESCENDING'}]}));
});

test('existing carrier configuration and broad runtime IAM block unreviewed scheduler deployment',async()=>{
 const f=fixture({get:p=>p.endsWith('/documents/companies')?{documents:[{fields:{provider:{stringValue:'generic_v1'},enabled:{booleanValue:true}}}]}:undefined});
 f.args.readIam=async()=>({bindings:[{role:'roles/editor',members:['serviceAccount:runtime@'+project+'.iam.gserviceaccount.com']}]});
 const r=await operationalReadiness(f.args);assert.ok(r.blockers.includes('review_existing_delivery_configuration_before_scheduler'));assert.ok(r.blockers.includes('runtime_iam_requires_review'));assert.equal(r.services.deliverySafety.externalCallsPerformed,false);
});
test('missing native OAuth configuration is a blocker rather than invented client identifiers',async()=>{
 const f=fixture({get:p=>p.endsWith('/androidApps/'+ids.android+'/config')?{configFileContents:Buffer.from(JSON.stringify({project_info:{project_id:project},client:[{client_info:{mobilesdk_app_id:ids.android,android_client_info:{package_name:'com.mode2094.velnix'}},oauth_client:[{client_type:3}]}]})).toString('base64')}:undefined});
 const r=await operationalReadiness(f.args);assert.equal(r.services.androidSdk.googleServerClientPresent,false);assert.ok(r.blockers.includes('android_google_oauth_incomplete'));
});
test('index 400 and Functions 403 expose structured causes while billing stays unknown',async()=>{
 const {readGoogleJson}=require('../scripts/google_read');
 const f=fixture({get:async p=>{
  const code=p.endsWith('/indexes')?400:p.endsWith('/functions')||p.endsWith('/billingInfo')?403:null;
  if(code===null)return undefined;
  const error={code,status:code===400?'INVALID_ARGUMENT':'PERMISSION_DENIED',message:'PRIVATE_ERROR_BODY',details:[]};
  if(p.endsWith('/functions'))error.details.push({'@type':'type.googleapis.com/google.rpc.ErrorInfo',domain:'googleapis.com',reason:'SERVICE_DISABLED',metadata:{token:'PRIVATE_TOKEN'}});
  return readGoogleJson(new Response(JSON.stringify({error}),{status:code}));
 }});
 const r=await operationalReadiness(f.args);
 assert.equal(r.services.indexes.error.category,'invalid_request');assert.equal(r.services.functions.error.category,'service_disabled');
 assert.equal(r.services.billing.status,'unverified');assert.equal(Object.hasOwn(r.services.billing,'billingEnabled'),false);
 assert.equal(r.blockers.includes('functions_v2_deployment_requires_separate_blaze_approval'),false);
 assert.equal(JSON.stringify(r).includes('PRIVATE_ERROR_BODY'),false);assert.equal(JSON.stringify(r).includes('PRIVATE_TOKEN'),false);
});
test('published rules drift includes original hashes and source, with credentials withheld',()=>{
 const {publishedRules}=require('../scripts/published_rules'),crypto=require('node:crypto');
 const text='rules_version = "2";\n// changed source\nallow read: if false;';
 const r=publishedRules([{name:'firestore.rules',content:text}],plan.rulesSha256);
 assert.equal(r.matchesSource,false);assert.equal(r.publishedFileCount,1);assert.equal(r.files[0].content,text);
 assert.equal(r.publishedSha256,crypto.createHash('sha256').update(text).digest('hex'));
 const secret=publishedRules([{name:'firestore.rules',content:'password = "PRIVATE_PASSWORD";\n-----BEGIN '+ 'PRIVATE'+' KEY-----\nPRIVATE_KEY_BODY\n-----END '+ 'PRIVATE'+' KEY-----'},{name:'other.rules',content:'x'.repeat(300000)}],plan.rulesSha256);
 assert.equal(secret.publishedFileCount,2);assert.equal(secret.publishedSha256,null);assert.equal(secret.files[0].redacted,true);assert.equal(secret.files[1].truncated,true);assert.equal(JSON.stringify(secret).includes('PRIVATE_PASSWORD'),false);assert.equal(JSON.stringify(secret).includes('PRIVATE_KEY_BODY'),false);
 assert.throws(()=>publishedRules([{content:null}],plan.rulesSha256));
 assert.equal(Object.hasOwn(publishedRules([{content:plan.rules}],plan.rulesSha256),'files'),false);
});
test('entire readiness inventory uses GET-only Google transport and read-only IAM, never bootstrap transaction',async()=>{
 const f=fixture(),methods=[],commands=[];
 const session=createGcloudSession({env:{},expectedAccount:owner,run:args=>{
  commands.push(args);return args[0]==='projects'?'{}':args[0]==='config'?'(unset)':args[1]==='list'?owner:'PRIVATE_TOKEN';
 },fetchImpl:async(url,options)=>{methods.push(options.method);return new Response(JSON.stringify(await f.args.get(url)));}});
 const r=await operationalReadiness({...f.args,get:session.get,readIam:()=>({bindings:[]})});
 assert.ok(methods.length>20);assert.ok(methods.every(m=>m==='GET'));assert.equal(r.bootstrapExecuted,false);
 session.readProjectIam();assert.ok(commands.every(a=>a[0]==='auth'||a[0]==='config'||a[1]==='get-iam-policy'));
 assert.equal(JSON.stringify(r).includes('PRIVATE_TOKEN'),false);
});
test('transport diagnostics expose the fixed failing route, never request tokens or raw bodies',async()=>{
 const session=createGcloudSession({env:{},run:args=>args[0]==='config'?'(unset)':args[1]==='list'?owner:'PRIVATE_ACCESS_TOKEN',fetchImpl:async()=>new Response(JSON.stringify({error:{code:400,status:'INVALID_ARGUMENT',message:'PRIVATE_ERROR_BODY'}}),{status:400})});
 await assert.rejects(session.get('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/collectionGroups/-/indexes?pageSize=100&pageToken=PRIVATE_PAGE_TOKEN'),e=>{
  assert.equal(e.diagnostic.request.method,'GET');assert.equal(e.diagnostic.request.pageSize,100);assert.equal(e.diagnostic.request.route,'projects/{project}/databases/(default)/collectionGroups/-/indexes');assert.equal(JSON.stringify(e).includes('PRIVATE_'),false);return true;
 });
});

// CLI prepare.js requires Pub/Sub and Storage for every v2 deployment. Rules
// publishing also needs Rules API; missing services must not produce a green gate.
test('v2 deployment and rules APIs are inventoried read-only and missing services block readiness',async()=>{
 for(const missing of ['pubsub.googleapis.com','storage.googleapis.com','firebaserules.googleapis.com']){
  const f=fixture();const base=f.args.get;
  f.args.get=async url=>{const response=await base(url);return new URL(url).hostname==='serviceusage.googleapis.com'?{services:response.services.filter(s=>s.config.name!==missing)}:response;};
  const r=await operationalReadiness(f.args);
  assert.equal(r.services.enabledApis.requiredApiState[missing],false);
  assert.ok(r.blockers.includes('api_not_enabled:'+missing));
  assert.equal(r.deployed,false);assert.equal(r.deployment.resourcesChanged,false);
  assert.ok(f.calls.every(url=>!/:enable|:batchEnable|:setIamPolicy/.test(url)));
 }
});

test('offline manifest matches actual deployed exports, including protected join callables',()=>{
 const {spawnSync}=require('node:child_process');
 const r=spawnSync(process.execPath,['-e',"const api=require('./src/index'); console.log(JSON.stringify(Object.keys(api).sort()));"],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',env:{PATH:process.env.PATH,GCLOUD_PROJECT:'demo-velnix',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',METADATA_SERVER_DETECTION:'none'}});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(plan.functions.map(f=>f.name).sort(),JSON.parse(r.stdout));
 for(const name of ['joinSession','listJoinRequests','decideJoinRequest'])assert.equal(plan.functions.find(f=>f.name===name).kind,'callable');
});
test('unrecognized dynamic source exports fail offline planning instead of silently disappearing',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'velnix-manifest-'));
 try{
  fs.mkdirSync(path.join(dir,'functions/src'),{recursive:true});
  for(const name of ['index.js','join_requests.js'])fs.copyFileSync(path.join(__dirname,'../src',name),path.join(dir,'functions/src',name));
  fs.appendFileSync(path.join(dir,'functions/src/index.js'),"\nexports['unexpectedHandler']=callable(()=>{});\n");
  assert.throws(()=>sourcePlan(dir),/source_manifest_requires_review/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a missing join callable remains a concrete Backend blocker even when every other function is active',async()=>{
 const f=fixture();const base=f.args.get;
 f.args.get=async url=>{const response=await base(url);return new URL(url).pathname.endsWith('/functions')?{functions:response.functions.filter(fn=>!fn.name.endsWith('/joinSession'))}:response;};
 const r=await operationalReadiness(f.args);assert.deepEqual(r.services.functions.missing,['joinSession']);assert.ok(r.blockers.includes('backend_missing_or_inactive'));
});

test('source plan and read-only inventory preserve the nam5 trigger region exception',async()=>{
 assert.equal(plan.functions.find(f=>f.name==='orderEventNotice').region,'us-central1');
 assert.ok(plan.functions.filter(f=>f.kind==='callable').every(f=>f.region==='europe-west1'));
 const f=fixture(),r=await operationalReadiness(f.args);
 assert.deepEqual(r.services.functions.missing,[]);
 assert.equal(f.calls.filter(url=>new URL(url).pathname.endsWith('/functions')).length,2);
 assert.equal(r.services.functions.functions.find(f=>f.name==='orderEventNotice').region,'us-central1');
 const bad=fixture({get:p=>p.includes('/locations/us-central1/functions')?{functions:[{name:`projects/${project}/locations/europe-west1/functions/orderEventNotice`,state:'ACTIVE'}]}:undefined});
 const result=await operationalReadiness(bad.args);
 assert.deepEqual(result.services.functions.missing,['orderEventNotice']);
});
