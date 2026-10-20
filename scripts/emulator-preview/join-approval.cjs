'use strict';
// Chrome journey for the full join-request lifecycle against the local emulator stack:
// pending login -> GM approval -> live workspace unlock -> second request -> rejection,
// plus server-side rejection of unauthorized, duplicate and self decisions.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/qa/emulator-ui');fs.mkdirSync(out,{recursive:true});
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.METADATA_SERVER_DETECTION='none';
const load=id=>require(require.resolve(id,{paths:[path.join(root,'functions')]}));
const {initializeApp}=load('firebase-admin/app'),{getFirestore}=load('firebase-admin/firestore'),{getAuth}=load('firebase-admin/auth');
const {chromium}=require('playwright');
initializeApp({projectId:'demo-velnix-preview'});
const evidence={scenarios:[],readback:{}};
let browser;
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const selectAll=p=>p.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');
async function activate(p,locator){await p.bringToFront();await p.waitForTimeout(60);await locator.evaluate(el=>(el.closest('[flt-tappable]')||el).click());await frame(p);}
async function nav(p,kind){const label={home:'الرئيسية',orders:'الطلبات',create:'طلب جديد',companies:'شركات التوصيل',notices:'الإشعارات',team:'الفريق'}[kind];if(kind==='more'){const admin=p.getByRole('button').filter({hasText:/الفريق|العمليات/});if(await admin.count())await activate(p,admin.first());return;}await activate(p,p.getByRole('button').filter({hasText:label}).first());}
async function callable(p,name,data={}){return p.evaluate(async({name,data})=>{const {getApp}=await import('/firebase-sdk/12.19.0/firebase-app.js');const {getFunctions,httpsCallable}=await import('/firebase-sdk/12.19.0/firebase-functions.js');try{return {ok:true,data:(await httpsCallable(getFunctions(getApp(),'europe-west1'),name)(data)).data};}catch(e){return{ok:false,code:e.code};}},{name,data});}
async function denied(p,name,data,expected='functions/permission-denied'){const r=await callable(p,name,data);assert.equal(r.ok,false,`${name} unexpectedly authorized`);assert.equal(r.code,expected,`${name} wrong rejection: ${r.code}`);}
async function login(role,email,expect){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.hostname==='apis.google.com'||u.hostname==='fonts.gstatic.com'){const r=await fetch('http://127.0.0.1:8767/verified-public?url='+encodeURIComponent(u.href));return route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'text/javascript',body:Buffer.from(await r.arrayBuffer()),headers:{'access-control-allow-origin':'*'}});}
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
  return route.abort();
 });
 const p=await ctx.newPage();
 await p.goto('http://127.0.0.1:8767',{waitUntil:'networkidle'});await p.locator('flt-glass-pane').waitFor({state:'attached',timeout:60000});await p.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
 await p.getByRole('button',{name:'المتابعة باستخدام Google'}).waitFor({timeout:60000});
 const popup=ctx.waitForEvent('page',{timeout:30000});await activate(p,p.getByRole('button',{name:'المتابعة باستخدام Google'}).first());const pop=await popup;
 await pop.getByText(email,{exact:true}).click();
 await p.getByText(expect,{exact:true}).waitFor({timeout:60000});
 return p;
}
async function scenario(name,fn){const start=Date.now();try{await fn();evidence.scenarios.push({name,status:'passed',ms:Date.now()-start});console.log('PASS',name);}catch(e){evidence.scenarios.push({name,status:'failed',error:e.message,ms:Date.now()-start});console.error('FAIL',name,e.message);throw e;}}
async function openJoinRequests(gm){
 await nav(gm,'team');await gm.getByText('الفريق والصلاحيات',{exact:true}).waitFor({timeout:30000});
 await activate(gm,gm.getByText('الفريق والصلاحيات',{exact:true}));await gm.getByText('طلبات الانضمام',{exact:true}).waitFor({timeout:30000});
 await activate(gm,gm.getByRole('button',{name:'طلبات الانضمام',exact:true}));await gm.getByText('طلبات الانضمام',{exact:true}).first().waitFor({timeout:30000});
}
async function main(){
 const extra=await getAuth().importUsers([
  {uid:'qa-approve',email:'approve@velnix.test',emailVerified:true,displayName:'حساب اعتماد اصطناعي',providerData:[{uid:'google-qa-approve',email:'approve@velnix.test',displayName:'حساب اعتماد اصطناعي',providerId:'google.com'}]},
  {uid:'qa-pending2',email:'pending2@velnix.test',emailVerified:true,displayName:'حساب معلق اثنان اصطناعي',providerData:[{uid:'google-qa-pending2',email:'pending2@velnix.test',displayName:'حساب معلق اثنان اصطناعي',providerId:'google.com'}]},
]);
 assert.equal(extra.errors.filter(e=>e.error.code!=='auth/uid-already-exists').length,0);
 browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=2']});
 let pending,gm,pending2,sales;
 await scenario('pending user sees the waiting screen and cannot enter the workspace',async()=>{
  pending=await login('approve','approve@velnix.test','حسابك بانتظار موافقة المدير');
  assert.equal(await pending.getByText('إضافة طلب جديد',{exact:true}).count(),0);
  await pending.screenshot({path:path.join(out,'join-pending-waiting.png')});
 });
 await scenario('general manager approves the request and the pending UI unlocks live',async()=>{
  gm=await login('generalManager','generalmanager@velnix.test','أهلاً، مدير عام اصطناعي');
  await openJoinRequests(gm);
  await gm.getByText('حساب اعتماد اصطناعي',{exact:true}).waitFor({timeout:30000});
  await gm.screenshot({path:path.join(out,'join-request-listed.png')});
  await activate(gm,gm.getByText('مراجعة واعتماد',{exact:true}).first());
  await gm.getByText('اعتماد طلب الانضمام',{exact:true}).waitFor({timeout:30000});
  await gm.screenshot({path:path.join(out,'join-approval-form.png')});
  const decided=gm.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/decideJoinRequest')&&r.request().method()==='POST');
  await activate(gm,gm.getByText('حفظ الموظف',{exact:true}));
  assert.equal((await decided).status(),200);
  await pending.getByText('أهلاً، حساب اعتماد اصطناعي',{exact:true}).waitFor({timeout:60000});
  await nav(pending,'create');await pending.getByText('إضافة طلب جديد',{exact:true}).waitFor({timeout:30000});
  await pending.screenshot({path:path.join(out,'join-approved-workspace.png')});await nav(pending,'home');
 });
 await scenario('second request is rejected by the manager and the requester sees the decision',async()=>{
  pending2=await login('pending2','pending2@velnix.test','حسابك بانتظار موافقة المدير');
  await activate(gm,gm.getByRole('button',{name:/رجوع|Back/}).first());
  const reopen=gm.getByRole('button',{name:'طلبات الانضمام',exact:true});
  if(await reopen.count()===0)await openJoinRequests(gm);else{await reopen.waitFor({timeout:30000});await activate(gm,reopen);}
  await gm.getByText('حساب معلق اثنان اصطناعي',{exact:true}).waitFor({timeout:30000});
  const rejected=gm.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/decideJoinRequest')&&r.request().method()==='POST');
  await activate(gm,gm.getByText('رفض',{exact:true}).first());
  await gm.getByText('رفض طلب الانضمام؟',{exact:true}).waitFor({timeout:15000});
  await activate(gm,gm.getByText('تأكيد الرفض',{exact:true}));
  assert.equal((await rejected).status(),200);
  await pending2.getByText('تم رفض طلب انضمامك. راجع المدير العام',{exact:true}).waitFor({timeout:60000});
  await pending2.screenshot({path:path.join(out,'join-rejected-screen.png')});
 });
 await scenario('unauthorized roles, duplicate and self decisions are rejected by the server',async()=>{
  sales=await login('sales','sales@velnix.test','أهلاً، مبيعات اصطناعي');
  await denied(sales,'listJoinRequests',{});
  await denied(sales,'decideJoinRequest',{id:'qa-pending2',decision:'approved',role:'dataEntry',permissions:[]});
  await denied(gm,'decideJoinRequest',{id:'qa-approve',decision:'approved',role:'dataEntry',permissions:[]},'functions/failed-precondition');
  await denied(gm,'decideJoinRequest',{id:'qa-generalManager',decision:'approved',role:'dataEntry',permissions:[]});
  const orders=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8')).orders;
  const delivery=await callable(gm,'sendOrderToDelivery',{id:orders.warehouse.id});
  assert.equal(delivery.ok,false,'delivery must stay disabled without an approved provider');
  assert.equal(delivery.code,'functions/failed-precondition');
 });
 await scenario('backend state, audit trail and idempotent joinSession match the Chrome journey',async()=>{
  const db=getFirestore(),member=await db.doc('members/qa-approve').get(),approved=await db.doc('joinRequests/qa-approve').get(),rejected=await db.doc('joinRequests/qa-pending2').get();
  assert.equal(member.exists,true);assert.equal(member.data().active,true);assert.equal(member.data().role,'dataEntry');assert.equal(member.data().approvalStatus,'approved');
  assert.equal(approved.data().status,'approved');assert.equal(rejected.data().status,'rejected');
  const audit=await db.collection('auditEvents').get(),actions=audit.docs.map(d=>d.data().action);
  assert.ok(actions.includes('join.requested'));assert.ok(actions.includes('join.approved'));assert.ok(actions.includes('join.rejected'));
  const again=await callable(pending,'joinSession',{});assert.equal(again.ok,true);assert.equal(again.data.status,'approved');
  evidence.readback={member:{role:member.data().role,active:member.data().active,approvalStatus:member.data().approvalStatus},approvedStatus:approved.data().status,rejectedStatus:rejected.data().status,auditActions:actions.filter(a=>a.startsWith('join.')),idempotentJoinSession:again.data.status};
 });
 fs.writeFileSync(path.join(out,'join-approval.json'),JSON.stringify(evidence,null,2));
 console.log('JOIN_APPROVAL_PASS',JSON.stringify(evidence.readback));
 await browser.close();
}
main().catch(async e=>{fs.writeFileSync(path.join(out,'join-approval.json'),JSON.stringify({...evidence,error:e.message},null,2));console.error('JOIN_APPROVAL_FAIL',e.message);try{await browser?.close();}catch{}process.exit(1);});
