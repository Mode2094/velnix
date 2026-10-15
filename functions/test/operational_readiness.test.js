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
  if(p.endsWith('/locations/europe-west1/functions'))return {functions:plan.functions.map(f=>({name:`projects/${project}/locations/europe-west1/functions/${f.name}`,state:'ACTIVE',environment:'GEN_2',buildConfig:{runtime:'nodejs22',environmentVariables:{secret:'SENSITIVE_SENTINEL'}},serviceConfig:{serviceAccountEmail:'runtime@'+project+'.iam.gserviceaccount.com',environmentVariables:{secret:'SENSITIVE_SENTINEL'}}}))};
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
  if(u.hostname==='serviceusage.googleapis.com')return {services:['identitytoolkit.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com','firebaseappcheck.googleapis.com','fcm.googleapis.com','run.googleapis.com','eventarc.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','cloudscheduler.googleapis.com'].map(name=>({config:{name}}))};
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
test('source manifest includes all 32 exports, existing scheduler, and deny-by-default rules; index normalization preserves real filters',()=>{
 assert.equal(plan.functions.length,32);assert.equal(plan.functions.filter(f=>f.kind==='onSchedule').length,1);assert.equal(plan.indexes.length,109);assert.equal(plan.bootstrapForbidden,true);
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
