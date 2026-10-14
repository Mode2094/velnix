'use strict';
// Ephemeral owner-operated Cloud Shell portal. No deployment or membership writes.
const http=require('node:http'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {inventory}=require('./read_cloud_inventory');
const {createGcloudSession}=require('./gcloud_session');
const {requireGoogleSession,googleProfile}=require('../src/google_identity');
const PROJECT='velnix-6c1a2',WEB_APP='1:948196868655:web:ace9b264b4fae48ac43cda';
function assertInventory(data,uid){
  const count=data.authentication?.totalUsers,candidate=data.authentication?.candidate;
  if(data.authentication?.status!=='read'||!(count===0||count===1&&candidate?.googleProviderLinked===true&&(!uid||candidate.uidFromAuthRecordOnly===uid)))throw Error('auth_inventory_not_clear');
  if(data.firestore?.database?.status!=='read'||data.firestore?.members?.status!=='read'||data.firestore?.joinRequests?.status!=='read'||data.firestore?.bootstrapState?.status!=='not-found'||data.firestore?.members?.count!==0||data.firestore?.joinRequests?.count!==0||data.firestore?.generalManagersIncludingInactive!==0||data.firestore?.bootstrapState?.exists!==false)throw Error('firestore_inventory_not_clear');
  if(uid&&(count!==1||candidate?.uidFromAuthRecordOnly!==uid))throw Error('uid_record_mismatch');
}
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
function createPortal({candidateEmail,publicConfig,authorizedDomains,auth,checkInventory,runDryRun,refreshDomains,now=()=>Date.now()}){
  const csrf=crypto.randomBytes(32).toString('hex');let completed=null,busy=false;
  function origin(req){
    const forwarded=req.headers['x-forwarded-host'];
    const host=forwarded||req.headers.host||'';
    // Cloud Shell HTTPS preview only; do not trust arbitrary forwarded origins.
    if(!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.cloudshell\.dev$/.test(host))throw Error('preview_host_required');
    return 'https://'+host.toLowerCase();
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
    const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try{
      const base=origin(req),host=new URL(base).hostname;
      if(req.method==='GET'&&req.url==='/'&&refreshDomains)await refreshDomains();
      if(!authorizedDomains.includes(host)){
        if(req.method==='GET'&&req.url==='/'){
          res.writeHead(409,{'Content-Type':'text/plain; charset=utf-8'});
          res.end('يلزم إعداد نطاق الدخول أولاً. في Firebase Console → Authentication → Settings → Authorized domains أضف هذا النطاق فقط، ثم حدّث الصفحة:\n'+host+'\nلا تعدّل أي إعداد آخر أو تنشر خدمات.');return;
        }
        return send(403,{error:'domain_not_authorized'});
      }
      if(req.method==='GET'&&req.url==='/'){
        const nonce=crypto.randomBytes(20).toString('hex');
        res.setHeader('Set-Cookie',`velnix_owner=${csrf}; Secure; HttpOnly; SameSite=Strict; Path=/`);
        res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; style-src 'unsafe-inline'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.google.com; frame-src https://*.firebaseapp.com https://accounts.google.com https://*.google.com; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://shell.cloud.google.com https://console.cloud.google.com`);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>توثيق مدير Velnix</title><style>body{font:18px system-ui;max-width:620px;margin:12vh auto;padding:24px;line-height:1.8;background:#f4f7fa;color:#10283e}button{font:inherit;padding:14px;border:0;border-radius:10px;background:#12636b;color:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}button:disabled{opacity:.5}</style><h1>توثيق حساب المدير المرشح</h1><p>اختر حساب Google المحدد فقط. سيُنشأ حساب Firebase حقيقي عند أول تسجيل. لن تُنشأ عضوية مدير ولن ينفذ أي نشر.</p><p id="candidate"></p><button id="login">المتابعة باستخدام Google</button><pre id="result" role="status"></pre><script type="module" nonce="${nonce}">
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,inMemoryPersistence,setPersistence} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const email=${json(candidateEmail)}, auth=getAuth(initializeApp(${json(publicConfig)}));
document.querySelector('#candidate').textContent=email;
const button=document.querySelector('#login'),result=document.querySelector('#result');
button.onclick=async()=>{button.disabled=true;result.textContent='جارٍ التحقق…';try{
 await setPersistence(auth,inMemoryPersistence);const provider=new GoogleAuthProvider();provider.setCustomParameters({login_hint:email,prompt:'select_account'});
 const credential=await signInWithPopup(auth,provider);
 if(credential.user.email?.toLowerCase()!==email.toLowerCase())throw Error('wrong-account');
 const idToken=await credential.user.getIdToken(true);
 const response=await fetch('/verify',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-CSRF':${json(csrf)}},body:JSON.stringify({idToken})});
 const data=await response.json();if(!response.ok)throw Error('verification-failed');
 result.textContent=JSON.stringify(data,null,2);
}catch(error){result.textContent='لم يكتمل التحقق. تأكد من الحساب ومزود Google وApp Check والنطاق المصرح. لا ترسل أي token.';button.disabled=false;}finally{await signOut(auth).catch(()=>{});}};
</script></html>`);return;
      }
      if(req.method!=='POST'||req.url!=='/verify')return send(404,{error:'not_found'});
      const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).includes('velnix_owner='+csrf);
      if(req.headers.origin!==base||req.headers['x-owner-csrf']!==csrf||!cookie||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'invalid_origin_or_session'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>20000)return send(413,{error:'too_large'});}
      const input=JSON.parse(body);
      if(typeof input.idToken!=='string'||Object.keys(input).length!==1)return send(400,{error:'invalid_input'});
      if(busy)return send(409,{error:'verification_in_progress'});
      busy=true;
      try{
        const token=await auth.verifyIdToken(input.idToken,true);
        requireGoogleSession({auth:{uid:token.uid,token}});
        if(token.email?.toLowerCase()!==candidateEmail.toLowerCase()||!Number.isFinite(token.auth_time)||Math.abs(now()/1000-token.auth_time)>300)throw Error('wrong_or_stale_identity');
        const profile=googleProfile(await auth.getUser(token.uid));
        if(profile.email!==candidateEmail.toLowerCase())throw Error('google_record_mismatch');
        if(completed){if(completed.uid!==token.uid)throw Error('uid_changed');return send(200,completed);}
        assertInventory(await checkInventory(),token.uid);
        await runDryRun(token.uid);
        completed={projectId:PROJECT,uid:token.uid,candidateAccountMatched:true,googleSessionVerified:true,bootstrapDryRun:'passed',membershipCreated:false,deployed:false,next:'انتظار موافقة محددة على إنشاء عضوية generalManager؛ لا تشغّل --apply قبلها.'};
        // Only a redacted result; no ID token, ADC or Google access token.
        console.log(JSON.stringify(completed,null,2));return send(200,completed);
      }finally{busy=false;}
    }catch(_){return send(403,{error:'verification_or_preflight_failed',membershipCreated:false});}
  });
  return server;
}
async function main(){
  const candidateEmail=process.argv[2];if(!candidateEmail||!/^\S+@\S+\.\S+$/.test(candidateEmail))throw Error('candidate_required');
  const {initializeApp}=require('firebase-admin/app');
  const {getAuth}=require('firebase-admin/auth');
  const session=createGcloudSession();
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT=PROJECT;
  initializeApp({projectId:PROJECT,credential:session.credential});
  const get=session.get;
  const checkInventory=()=>inventory({get,candidateEmail});
  const first=await checkInventory();assertInventory(first);
  console.log(JSON.stringify({authentication:first.authentication,firestore:first.firestore,readOnlyInventory:true},null,2));
  if(first.googleProvider?.status!=='read'||first.googleProvider.enabled!==true||first.googleProvider.clientIdPresent!==true)throw Error('enable_google_provider_in_console_first');
  const base=`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps/${encodeURIComponent(WEB_APP)}`;
  const registration=await get(base);
  if(registration.appId!==WEB_APP||registration.projectId!==PROJECT||registration.state!=='ACTIVE')throw Error('web_registration_not_active');
  const sdk=await get(base+'/config');if(sdk.projectId!==PROJECT||sdk.appId!==WEB_APP||!sdk.apiKey||!sdk.authDomain)throw Error('web_configuration_unverified');
  const publicConfig=Object.fromEntries(['apiKey','authDomain','projectId','appId','messagingSenderId','storageBucket'].filter(k=>sdk[k]).map(k=>[k,sdk[k]]));
  let config=await get(`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config`);
  const domains=config.authorizedDomains;if(!Array.isArray(domains))throw Error('authorized_domains_unverified');
  const server=createPortal({candidateEmail,publicConfig,authorizedDomains:domains,auth:getAuth(),checkInventory,runDryRun:async uid=>{
    execFileSync(process.execPath,[require('node:path').join(__dirname,'bootstrap_admin.js'),'--gcloud-session'],{env:{...process.env,GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,VELNIX_BOOTSTRAP_CONFIRM_PROJECT:PROJECT,VELNIX_ADMIN_GOOGLE_UID:uid,VELNIX_OPERATOR_ACCOUNT:session.account},stdio:['ignore','pipe','pipe'],timeout:60000});
  },refreshDomains:async()=>{
    config=await get(`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config`);
    if(!Array.isArray(config.authorizedDomains))throw Error('authorized_domains_unverified');
    domains.splice(0,domains.length,...config.authorizedDomains);
  }});
  server.listen(8080,'127.0.0.1',()=>console.log('افتح Web Preview في Cloud Shell على المنفذ8080. إن كان النطاق غير مصرح ستظهر خطوة Console الدقيقة. لا روابط localhost عامة ولا نشر.'));
  setTimeout(()=>server.close(),30*60*1000).unref();
}
if(require.main===module)main().catch(e=>{const reason=['auth_inventory_not_clear','firestore_inventory_not_clear','enable_google_provider_in_console_first','web_registration_not_active','web_configuration_unverified','authorized_domains_unverified','candidate_required','gcloud_human_session_unavailable','gcloud_human_account_required','gcloud_auth_override_refused','gcloud_token_unavailable','live_operator_emulator_override_refused'].includes(e.message)?e.message:'google_access_or_configuration_required';console.error('توقف آمن: '+reason+'. لا إنشاء عضوية أو نشر أو تفعيل فوترة.');
 if(reason==='enable_google_provider_in_console_first')console.error('يلزم تفعيل Google من Firebase Console → Authentication → Sign-in method فقط، مع إبقاء Email/Password كما هو: https://console.firebase.google.com/project/velnix-6c1a2/authentication/providers');
 else console.error('راجع نتائج الجرد وصلاحية المشغل والتسجيل الحالي. لا تمسح العضويات أو القفل لتجاوز التوقف.');process.exitCode=1;});
module.exports={createPortal,assertInventory};
