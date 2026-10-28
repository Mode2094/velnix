'use strict';
// Owner-operated, read-only inventory AFTER bootstrap. Never imports or runs bootstrap.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PROJECT,createGcloudSession}=require('./gcloud_session');
const {publishedRules}=require('./published_rules');
const OWNER='moderohe8@gmail.com';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const APP_IDS={android:'1:948196868655:android:4465def254bb941ac43cda',ios:'1:948196868655:ios:58a6ca83ccb4e1e3c43cda',web:'1:948196868655:web:ace9b264b4fae48ac43cda'};
const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;
function sourcePlan(root=path.resolve(__dirname,'../..')){
 const text=fs.readFileSync(path.join(root,'functions/src/index.js'),'utf8');
 const functions=[...text.matchAll(/exports\.(\w+)=(callable|onRequest|onSchedule|onDocumentCreated)\(/g)].map(m=>({name:m[1],kind:m[2],region:m[1]==='orderEventNotice'?'us-central1':'europe-west1'}));
 if(!functions.length||functions.length!==[...text.matchAll(/exports\.\w+\s*=/g)].length)throw Error('source_manifest_requires_review');
 // These callables are exported through the existing join factory, not exports.foo.
 // Fail closed if the factory binding or export shape changes; never import handlers
 // (or initialize Admin SDK) merely to produce an offline source plan.
 const joins=fs.readFileSync(path.join(root,'functions/src/join_requests.js'),'utf8');
 const factory="const joins=require('./join_requests')({db,auth:getAuth(),FieldValue,FieldPath,requireAuth,currentActor,audit,fail});";
 const binding='for(const [name,handler] of Object.entries(joins))exports[name]=callable(handler);';
 const returned=/return\s*\{([A-Za-z0-9_,\s]+)\};\s*\};?\s*$/.exec(joins);
 // The pages factory mirrors the join factory shape and is validated the same way.
 const pages=fs.readFileSync(path.join(root,'functions/src/pages.js'),'utf8');
 const pagesFactory="const pages=require('./pages')({db,FieldValue,FieldPath,requireAuth,currentActor,audit,fail});";
 const pagesBinding='for(const [name,handler] of Object.entries(pages))exports[name]=callable(handler);';
 const pagesReturned=/return\s*\{([A-Za-z0-9_,\s]+)\};\s*\};?\s*$/.exec(pages);
 // The bulk factory exposes bounded multi-order operations the same way.
 const bulkSrc=fs.readFileSync(path.join(root,'functions/src/bulk.js'),'utf8');
 const bulkFactory="const bulk=require('./bulk')({db,auth:getAuth(),FieldValue,requireAuth,currentActor,audit,fail,requiredPerm,logger,applyStatusChange,applyCompanyAssignment,runDispatch:dispatchOrder,orderForUser});";
 const bulkBinding='for(const [name,handler] of Object.entries(bulk))if(typeof handler===\'function\')exports[name]=callable(handler);';
 const bulkReturned=/return\s*\{([A-Za-z0-9_,\s]+)\};\s*\};?\s*$/.exec(bulkSrc);
 if(!text.includes(factory)||!text.includes(binding)||!text.includes(pagesFactory)||!text.includes(pagesBinding)||!text.includes(bulkFactory)||!text.includes(bulkBinding)||[...text.matchAll(/exports\s*\[/g)].length!==3||!returned||!pagesReturned||!bulkReturned)throw Error('source_manifest_requires_review');
 const names=returned[1].split(',').map(n=>n.trim());
 if(names.length!==3||new Set(names).size!==names.length||names.some(n=>!['joinSession','listJoinRequests','decideJoinRequest'].includes(n)))throw Error('source_manifest_requires_review');
 const pageNames=pagesReturned[1].split(',').map(n=>n.trim());
 if(pageNames.length!==6||new Set(pageNames).size!==pageNames.length||pageNames.some(n=>!['listPages','listAllowedPages','savePage','archivePage','restorePage','pageStats'].includes(n)))throw Error('source_manifest_requires_review');
 const bulkNames=bulkReturned[1].split(',').map(n=>n.trim()).filter(n=>!['MAX_BULK','MAX_DISPATCH'].includes(n));
 if(bulkNames.length!==5||new Set(bulkNames).size!==bulkNames.length||bulkNames.some(n=>!['resolveBarcodes','bulkChangeStatus','bulkAssignCompany','bulkDispatch','getBulkOperation'].includes(n)))throw Error('source_manifest_requires_review');
 functions.push(...names.map(name=>({name,kind:'callable',region:'europe-west1'})));
 functions.push(...pageNames.map(name=>({name,kind:'callable',region:'europe-west1'})));
 functions.push(...bulkNames.map(name=>({name,kind:'callable',region:'europe-west1'})));
 if(new Set(functions.map(f=>f.name)).size!==functions.length)throw Error('source_manifest_requires_review');
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),indexes=JSON.parse(fs.readFileSync(path.join(root,'firestore.indexes.json'),'utf8'));
 return {functions,backendSha256:hash(text),joinHandlersSha256:hash(joins),pageHandlersSha256:hash(pages),bulkHandlersSha256:hash(bulkSrc),searchHandlersSha256:hash(fs.readFileSync(path.join(root,'functions/src/search.js'),'utf8')),indexesSha256:hash(JSON.stringify(indexes)),rulesSha256:hash(rules),indexes:indexes.indexes,rules,clickEnabled:false,deployAuthorized:false,bootstrapForbidden:true};
}
function indexKey(index){return JSON.stringify({collectionGroup:index.collectionGroup,queryScope:index.queryScope,documentNameOrder:(index.fields||[]).find(f=>f.fieldPath==='__name__')?.order||(index.fields||[]).filter(f=>f.order).at(-1)?.order||'ASCENDING',fields:(index.fields||[]).filter(f=>f.fieldPath!=='__name__').map(({fieldPath,order,arrayConfig})=>({fieldPath,...(order?{order}:{}),...(arrayConfig?{arrayConfig}:{})}))});}
async function operationalReadiness({get,auth,readIam,plan}){
 const report={projectId:PROJECT,readOnly:true,bootstrapExecuted:false,deployed:false,services:{},blockers:[],externalAcceptance:'not_executed'};
 async function check(name,work){try{const data=await work();report.services[name]={status:'read',...data};}catch(e){report.services[name]={status:'unverified',httpStatus:Number.isInteger(e.status)?e.status:null,...(e.diagnostic?{error:e.diagnostic}:{})};}return report.services[name];}
 async function pages(url,key){const items=[],seen=new Set();let token;
  do{const u=new URL(url);if(token)u.searchParams.set('pageToken',token);const page=await get(u.href);
   if(!page||typeof page!=='object'||Array.isArray(page)||Object.keys(page).some(k=>![key,'nextPageToken','totalSize','unreachable'].includes(k))||(page.unreachable?.length)||(page[key]!==undefined&&!Array.isArray(page[key]))||(page.nextPageToken!==undefined&&typeof page.nextPageToken!=='string')||(page.nextPageToken&&seen.has(page.nextPageToken)))throw Error('invalid_or_repeated_page');
   items.push(...(page[key]||[]));token=page.nextPageToken;if(token)seen.add(token);if(seen.size>30)throw Error('inventory_page_limit');
  }while(token);return items;
 }
 const project=await check('project',async()=>{const p=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`);if(p.projectId!==PROJECT||!/^\d+$/.test(String(p.projectNumber))||p.state!=='ACTIVE')throw Error('wrong_or_inactive_project');return {projectNumber:String(p.projectNumber),state:p.state};});
 await check('billing',async()=>{const b=await get(`https://cloudbilling.googleapis.com/v1/projects/${PROJECT}/billingInfo?fields=billingEnabled`);if(typeof b.billingEnabled!=='boolean')throw Error('invalid_billing_response');return {billingEnabled:b.billingEnabled,firebasePlan:'confirm_in_console',costEstimate:'not_determined'};});
 await check('authentication',async()=>{const [a,g]=await Promise.all([get(`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config?fields=authorizedDomains,signIn(email(enabled,passwordRequired))`),get(`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com?fields=name,enabled,clientId`)]);
  if(typeof g.enabled!=='boolean'||!Array.isArray(a.authorizedDomains))throw Error('invalid_auth_configuration');
  return {googleEnabled:g.enabled,googleClientIdPresent:typeof g.clientId==='string'&&!!g.clientId,emailProviderEnabled:a.signIn?.email?.enabled??null,passwordRequired:a.signIn?.email?.passwordRequired??null,authorizedDomains:a.authorizedDomains,temporaryCloudShellDomainPresent:a.authorizedDomains.some(d=>d.endsWith('.cloudshell.dev')),emailPasswordDisableAuthorized:false};});
 await check('administrator',async()=>{
  const lock=await get(ROOT+'/documents/settings/bootstrapState?mask.fieldPaths=uid'),uid=lock.fields?.uid?.stringValue;
  if(lock.name!==`projects/${PROJECT}/databases/(default)/documents/settings/bootstrapState`||!/^[A-Za-z0-9_-]{1,128}$/.test(uid||''))throw Error('unverified_existing_bootstrap');
  const [member,record]=await Promise.all([get(ROOT+'/documents/members/'+uid+'?mask.fieldPaths=role&mask.fieldPaths=active&mask.fieldPaths=email&mask.fieldPaths=approvalStatus'),auth.getUser(uid)]);
  if(member.name!==`projects/${PROJECT}/databases/(default)/documents/members/${uid}`)throw Error('wrong_member_document');
  const google=record.providerData?.find(p=>p.providerId==='google.com');
  return {existingMembershipRead:true,lockedUidMatches:record.uid===uid,ownerEmailMatches:record.email?.toLowerCase()===OWNER&&member.fields?.email?.stringValue===OWNER,googleLinked:google?.email?.toLowerCase()===OWNER,emailVerified:record.emailVerified===true,authDisabled:record.disabled===true,role:member.fields?.role?.stringValue||null,active:member.fields?.active?.booleanValue===true,approved:member.fields?.approvalStatus?.stringValue==='approved',freshGoogleLoginTest:'owner_reported_previously; not repeated by inventory'};
 });
 await check('database',async()=>{const db=await get(ROOT);if(db.name!==`projects/${PROJECT}/databases/(default)`||!db.locationId)throw Error('invalid_database_response');return {location:db.locationId,type:db.type||null,deleteProtection:db.deleteProtectionState||null,pointInTimeRecovery:db.pointInTimeRecoveryEnablement||null};});
 await check('rules',async()=>{const release=await get(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);if(typeof release.rulesetName!=='string'||!release.rulesetName.startsWith('projects/'+PROJECT+'/rulesets/'))throw Error('invalid_rules_release');const set=await get('https://firebaserules.googleapis.com/v1/'+release.rulesetName);if(!Array.isArray(set.source?.files)||!set.source.files.length)throw Error('invalid_ruleset');return publishedRules(set.source.files,plan.rulesSha256);});
 await check('indexes',async()=>{const indexes=await pages(ROOT+'/collectionGroups/-/indexes?pageSize=100','indexes');const ready=new Set(indexes.filter(i=>i.state==='READY').map(i=>indexKey({...i,collectionGroup:i.name?.split('/collectionGroups/')[1]?.split('/')[0]})));return {expected:plan.indexes.length,published:indexes.length,ready:indexes.filter(i=>i.state==='READY').length,missingOrNotReady:plan.indexes.filter(i=>!ready.has(indexKey(i))).length};});
 await check('functions',async()=>{const regions=[...new Set(plan.functions.map(f=>f.region))].sort();
  const items=(await Promise.all(regions.map(region=>pages(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${region}/functions?pageSize=100&fields=functions(name,state,environment,buildConfig(runtime),serviceConfig(serviceAccountEmail,ingressSettings),eventTrigger(triggerRegion),updateTime),nextPageToken,unreachable`,'functions')))).flat();
  const functions=items.map(f=>({name:f.name?.split('/').at(-1)||null,region:f.name?.split('/locations/')[1]?.split('/')[0]||null,state:f.state||null,environment:f.environment||null,runtime:f.buildConfig?.runtime||null,runtimeServiceAccount:f.serviceConfig?.serviceAccountEmail||null,triggerRegion:f.eventTrigger?.triggerRegion||null,ingress:f.serviceConfig?.ingressSettings||null,updateTime:f.updateTime||null}));
  return {scope:regions.join(','),expected:plan.functions.length,functions,missing:plan.functions.filter(f=>!functions.some(p=>p.name===f.name&&p.region===f.region)).map(f=>f.name),sourceCommitMatch:'not_proven_by_name_or_state'};
 });
 await check('deliverySafety',async()=>{const companies=await pages(ROOT+'/documents/companies?pageSize=100&mask.fieldPaths=provider&mask.fieldPaths=enabled','documents');return {companyCount:companies.length,enabledCount:companies.filter(d=>d.fields?.enabled?.booleanValue===true).length,clickAdapterBlockedInSource:true,externalCallsPerformed:false};});
 const apps=[];
 for(const platform of ['android','ios','web'])await check(platform+'Apps',async()=>{const list=await pages(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/${platform}Apps?pageSize=100`,'apps');const registrations=list.map(a=>({appId:a.appId,state:a.state,identifier:a.packageName||a.bundleId||null}));for(const app of list)if(app.state==='ACTIVE'&&app.appId===APP_IDS[platform])apps.push({...app,platform});return {registrations,expectedRegistrationActive:list.some(a=>a.state==='ACTIVE'&&a.appId===APP_IDS[platform]&&(platform==='web'||(a.packageName||a.bundleId)==='com.mode2094.velnix'))};});
 if(project.status==='read'){
  const number=project.projectNumber;
  await check('enabledApis',async()=>{const services=await pages(`https://serviceusage.googleapis.com/v1/projects/${number}/services?filter=state:ENABLED&pageSize=200`,'services');const enabled=services.map(s=>s.config?.name||s.name?.split('/').at(-1));return {requiredApiState:Object.fromEntries(['identitytoolkit.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com','firebaseappcheck.googleapis.com','fcm.googleapis.com','run.googleapis.com','eventarc.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','pubsub.googleapis.com','storage.googleapis.com','firebaserules.googleapis.com','cloudscheduler.googleapis.com'].map(name=>[name,enabled.includes(name)]))};});
  await check('appCheck',async()=>{const services=await pages(`https://firebaseappcheck.googleapis.com/v1/projects/${number}/services?pageSize=100`,'services');return {enforcement:services.map(s=>({name:s.name?.split('/').at(-1),mode:s.enforcementMode||null})),callableEnforcementInSource:true,realAttestationTest:'not_executed'};});
  for(const app of apps){
   await check(app.platform+'Sdk',async()=>{
    const c=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/${app.platform}Apps/${encodeURIComponent(app.appId)}/config${app.platform==='web'?'?fields=projectId,appId,authDomain':''}`);
    if(app.platform==='web'){if(c.projectId!==PROJECT||c.appId!==APP_IDS.web||!c.authDomain)throw Error('wrong_web_registration');return {matchesProject:true,activeExpectedApp:true,authDomain:c.authDomain};}
    if(typeof c.configFileContents!=='string')throw Error('unverified_sdk_config');
    const text=Buffer.from(c.configFileContents,'base64').toString('utf8');
    if(app.platform==='android'){const config=JSON.parse(text),client=config.client?.find(c=>c.client_info?.mobilesdk_app_id===app.appId&&c.client_info?.android_client_info?.package_name==='com.mode2094.velnix');if(config.project_info?.project_id!==PROJECT||!client)throw Error('wrong_android_sdk');return {matchesProject:true,googleServerClientPresent:client.oauth_client?.some(c=>c.client_type===3&&typeof c.client_id==='string'&&/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(c.client_id))===true};}
    const field=key=>new RegExp('<key>'+key+'</key>\\s*<string>([^<]*)</string>').exec(text)?.[1];
    if(field('PROJECT_ID')!==PROJECT||field('GOOGLE_APP_ID')!==app.appId||field('BUNDLE_ID')!=='com.mode2094.velnix')throw Error('wrong_ios_sdk');
    const id=field('CLIENT_ID'),reverse=field('REVERSED_CLIENT_ID');return {matchesProject:true,googleClientPresent:typeof id==='string'&&/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(id),reverseSchemeConsistent:!!id&&reverse==='com.googleusercontent.apps.'+id.replace(/\.apps\.googleusercontent\.com$/,'')};
   });
   const provider={android:'playIntegrityConfig',ios:'deviceCheckConfig',web:'recaptchaV3Config'}[app.platform];
   await check(app.platform+'AppCheckProvider',async()=>{const c=await get(`https://firebaseappcheck.googleapis.com/v1/projects/${number}/apps/${encodeURIComponent(app.appId)}/${provider}?fields=name`);if(!c.name)throw Error('invalid_provider_response');return {appId:app.appId,provider,registrationRead:true,realAttestationTest:'not_executed'};});
   if(app.platform==='android')await check('androidCertificates',async()=>{const certs=await pages(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps/${encodeURIComponent(app.appId)}/sha?fields=certificates(certType)`,'certificates');return {appId:app.appId,sha1Count:certs.filter(c=>c.certType==='SHA_1').length,sha256Count:certs.filter(c=>c.certType==='SHA_256').length,installedSigningCertificateMatch:'requires_owner_certificate'};});
  }
 }
 await check('runtimeIam',async()=>{const policy=await readIam();if(!Array.isArray(policy.bindings))throw Error('invalid_iam_policy');const runtime=[...new Set((report.services.functions.functions||[]).map(f=>f.runtimeServiceAccount).filter(Boolean))];return {scope:'project bindings only; inherited and key policies require separate review',accounts:runtime.map(account=>({account,roles:policy.bindings.filter(b=>b.members?.includes('serviceAccount:'+account)).map(b=>({role:b.role,conditional:!!b.condition}))})),broadRuntimeRolePresent:policy.bindings.some(b=>['roles/owner','roles/editor'].includes(b.role)&&runtime.some(a=>b.members?.includes('serviceAccount:'+a)))};});
 await check('kms',async()=>{const rings=await pages(`https://cloudkms.googleapis.com/v1/projects/${PROJECT}/locations/europe-west1/keyRings?pageSize=100`,'keyRings');let keys=0;for(const ring of rings){if(!ring.name?.startsWith(`projects/${PROJECT}/locations/europe-west1/keyRings/`))throw Error('invalid_kms_reference');keys+=(await pages(`https://cloudkms.googleapis.com/v1/${ring.name}/cryptoKeys?pageSize=100`,'cryptoKeys')).length;}return {scope:'europe-west1 only',keyRings:rings.length,keys,cryptoOperationsPerformed:false,requiredForInternalOrders:false,keyIamVerified:false};});
 const s=report.services;
 for(const name of ['project','billing','authentication','administrator','database','rules','indexes','functions','enabledApis','appCheck','runtimeIam'])if(s[name]?.status!=='read')report.blockers.push(name+':unverified');
 if(s.authentication.status==='read'&&(!s.authentication.googleEnabled||!s.authentication.googleClientIdPresent))report.blockers.push('google_provider_incomplete');
 const a=s.administrator;if(a.status==='read'&&(!a.lockedUidMatches||!a.ownerEmailMatches||!a.googleLinked||!a.emailVerified||a.authDisabled||a.role!=='generalManager'||!a.active||!a.approved))report.blockers.push('existing_administrator_requires_review_no_bootstrap');
 if(s.rules.status==='read'&&!s.rules.matchesSource)report.blockers.push('published_rules_differ');
 if(s.indexes.status==='read'&&s.indexes.missingOrNotReady)report.blockers.push('indexes_missing_or_not_ready');
 if(s.functions.status==='read'&&(s.functions.missing.length||s.functions.functions.some(f=>f.state!=='ACTIVE'||f.runtime!=='nodejs22')))report.blockers.push('backend_missing_or_inactive');
 if(s.billing.status==='read'&&!s.billing.billingEnabled)report.blockers.push('functions_v2_deployment_requires_separate_blaze_approval');
 if(s.runtimeIam.status==='read'&&s.runtimeIam.broadRuntimeRolePresent)report.blockers.push('runtime_iam_requires_review');
 if(s.deliverySafety.status!=='read'||s.deliverySafety.enabledCount)report.blockers.push('review_existing_delivery_configuration_before_scheduler');
 for(const platform of ['android','ios','web']){
  if(s[platform+'Apps']?.expectedRegistrationActive!==true)report.blockers.push(platform+':expected_registration_unverified_or_inactive');
  if(s[platform+'Sdk']?.status!=='read'||s[platform+'AppCheckProvider']?.status!=='read')report.blockers.push(platform+':sdk_or_app_check_unverified');
 }
 if(s.androidSdk?.status==='read'&&!s.androidSdk.googleServerClientPresent)report.blockers.push('android_google_oauth_incomplete');
 if(s.iosSdk?.status==='read'&&(!s.iosSdk.googleClientPresent||!s.iosSdk.reverseSchemeConsistent))report.blockers.push('ios_google_oauth_incomplete');
 if(s.enabledApis?.status==='read')for(const [api,enabled] of Object.entries(s.enabledApis.requiredApiState))if(!enabled)report.blockers.push('api_not_enabled:'+api);
 report.fcm={apiEnabled:s.enabledApis?.requiredApiState?.['fcm.googleapis.com']??null,apnsAndVapid:'console_or_device_verification_required',realPushTest:'not_executed'};
 report.deployment={authorized:false,resourcesChanged:false,source:plan.functions,scheduledFunctionRequiresBilling:plan.functions.some(f=>f.kind==='onSchedule'),firestoreTriggerLocationRequiresReview:true};
 report.phaseComplete=false;report.next='Review read-only evidence, deployment diff, cost and rollback before a separate explicit deployment approval. Never run bootstrap again.';
 return report;
}
async function main(){
 if(process.argv[2]==='--source-plan'){const {rules,indexes,...plan}=sourcePlan();console.log(JSON.stringify({...plan,indexCount:indexes.length},null,2));return;}
 if(process.argv.length>2)throw Error('invalid_arguments');
 const session=createGcloudSession({expectedAccount:OWNER});
 const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth');
 process.env.GOOGLE_CLOUD_QUOTA_PROJECT=PROJECT;initializeApp({projectId:PROJECT,credential:session.credential});
 const report=await operationalReadiness({get:session.get,auth:getAuth(),readIam:session.readProjectIam,plan:sourcePlan()});
 console.log(JSON.stringify(report,null,2));if(report.blockers.length)process.exitCode=2;
}
if(require.main===module)main().catch(()=>{console.error('Read-only readiness could not start. Use the authorized human gcloud session in Cloud Shell. No bootstrap, deploy or credential output.');process.exitCode=1;});
module.exports={operationalReadiness,sourcePlan,indexKey};
