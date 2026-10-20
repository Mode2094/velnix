'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/qa/emulator-ui');fs.mkdirSync(out,{recursive:true});
const roles=['generalManager','manager','warehouse','sales','dataEntry'];
const names={generalManager:'مدير عام اصطناعي',manager:'مدير اصطناعي',warehouse:'مستودع اصطناعي',sales:'مبيعات اصطناعي',dataEntry:'مدخل اصطناعي'};
const results=[],traffic=[],pageErrors=[],sessions={},orders={};let browser;
const stamp=Date.now();
async function scenario(name,fn){const start=Date.now();try{await fn();results.push({name,status:'passed',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'failed',error:e.message,ms:Date.now()-start});console.error('FAIL',name,e.message);throw e;}}
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
// macOS binds Ctrl+A to "move to line start"; select-all is Cmd+A, so the
// key must follow the host platform or existing field text is never replaced.
const selectAll=p=>p.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');
async function activate(p,locator){await p.bringToFront();await p.waitForTimeout(60);await locator.evaluate(el=>(el.closest('[flt-tappable]')||el).click());await frame(p);}
async function click(p,name){await activate(p,p.getByRole('button',{name,exact:true}).first());}
async function back(p){await activate(p,p.getByRole('button',{name:/رجوع|Back/}).first());}
async function callable(p,name,data={}){return p.evaluate(async({name,data})=>{const {getApp}=await import('/firebase-sdk/12.19.0/firebase-app.js');const {getFunctions,httpsCallable}=await import('/firebase-sdk/12.19.0/firebase-functions.js');try{return {ok:true,data:(await httpsCallable(getFunctions(getApp(),'europe-west1'),name)(data)).data};}catch(e){return{ok:false,code:e.code};}},{name,data});}
async function okay(p,name,data){const r=await callable(p,name,data);assert.equal(r.ok,true,`${name}: ${r.code}`);return r.data;}
async function denied(p,name,data){const r=await callable(p,name,data);assert.equal(r.ok,false,`${name} unexpectedly authorized`);assert.equal(r.code,'functions/permission-denied',`${name} wrong rejection: ${r.code}`);}
async function login(role){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());traffic.push({host:u.hostname,path:u.pathname,method:route.request().method()});
  if(u.hostname==='apis.google.com'||u.hostname==='fonts.gstatic.com'){const r=await fetch('http://127.0.0.1:8767/verified-public?url='+encodeURIComponent(u.href));return route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'text/javascript',body:Buffer.from(await r.arrayBuffer()),headers:{'access-control-allow-origin':'*'}});}
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
  return route.abort();
 });
 const p=await ctx.newPage();p.on('pageerror',e=>pageErrors.push({role,error:e.message,stack:e.stack}));
 await p.goto('http://127.0.0.1:8767',{waitUntil:'networkidle'});await p.locator('flt-glass-pane').waitFor({state:'attached',timeout:60000});await p.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
 await p.getByRole('button',{name:'المتابعة باستخدام Google'}).waitFor({timeout:60000});
 const popup=ctx.waitForEvent('page',{timeout:30000});await click(p,'المتابعة باستخدام Google');const pop=await popup;
 await pop.getByText(role.toLowerCase()+'@velnix.test',{exact:true}).click();
 if(names[role])await p.getByText('أهلاً، '+names[role],{exact:true}).waitFor({timeout:60000});
 else await p.getByText(role==='pending'?/بانتظار موافقة/:/معطل|موقوف/).first().waitFor({timeout:30000});
 sessions[role]={ctx,p};return p;
}
async function nav(p,kind){const label={home:'الرئيسية',orders:'الطلبات',create:'طلب جديد',companies:'شركات التوصيل',notices:'الإشعارات'}[kind];if(kind==='more'){const admin=p.getByRole('button').filter({hasText:/الفريق|العمليات/});if(await admin.count())await activate(p,admin.first());return;}await activate(p,p.getByRole('button').filter({hasText:label}).first());}
async function create(p,role){await nav(p,'create');await p.getByText('إضافة طلب جديد',{exact:true}).waitFor();
 const customer=`طلب اصطناعي ${role} ${stamp}`,amount={generalManager:'11.101',manager:'22.202',warehouse:'33.303',sales:'44.404',dataEntry:'55.505'}[role];
 const fields={'اسم المستلم':customer,'رقم الهاتف':'0790000000','المحافظة':'عمان','المنطقة':'اختبار محلي','العنوان التفصيلي':'عنوان اصطناعي فقط','وصف محتويات الطلب':'طرد اختبار دون شحن','الكمية':'2','المبلغ (دينار أردني)':amount,'ملاحظات':'محاكيات فقط'};
 for(const [label,value] of Object.entries(fields)){const field=p.getByRole('textbox',{name:label,exact:true}).first();await field.scrollIntoViewIfNeeded();const box=await field.boundingBox();assert.ok(box,label);await p.mouse.click(box.x+box.width/2,box.y+box.height/2);await frame(p);await selectAll(p);await p.keyboard.insertText(value);await frame(p);}
 const response=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/createOrder')&&r.request().method()==='POST',{timeout:60000});await click(p,'حفظ الطلب');const res=await response,body=await res.json();assert.equal(res.status(),200);assert.ok(body.result?.id);
 await p.getByText(customer,{exact:false}).first().waitFor({timeout:30000});
 orders[role]={id:body.result.id,customer,amount,payload:res.request().postDataJSON().data};await p.screenshot({path:path.join(out,role+'-created.png')});
}
async function search(p,customer){
 const directory=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/listOrderCreators')&&r.request().method()==='POST');await nav(p,'orders');await directory;await frame(p);await p.getByText('إدارة الطلبات',{exact:true}).waitFor();
 const box=await p.getByRole('textbox',{name:'بحث في كل الطلبات المسموح لك بها',exact:true}).boundingBox();await p.mouse.click(600,box.y+box.height/2);await frame(p);await selectAll(p);await p.keyboard.insertText(customer);await frame(p);
 const found=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/searchOrders')&&r.request().method()==='POST');await p.keyboard.press('Enter');const response=await found;assert.equal(response.request().postDataJSON().data.query,customer);assert.equal(response.status(),200);return (await response.json()).result.items;
}
async function openOrder(p,o){
 const items=await search(p,o.customer);assert.ok(items.some(i=>i.id===o.id));
 await p.getByText(o.customer,{exact:false}).first().waitFor();await p.screenshot({path:path.join(out,'searched-'+o.id+'.png')});
 await activate(p,p.getByText(o.customer,{exact:false}).first());await p.getByText('تفاصيل الطلب',{exact:true}).waitFor({timeout:15000});await p.getByText('سجل الحركة',{exact:true}).waitFor();await frame(p);
}

async function main(){
 browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=2']});
 for(const role of roles)await scenario(role+': Google emulator login, dashboard and UI order creation',async()=>{const p=await login(role);await p.screenshot({path:path.join(out,role+'-dashboard.png')});await create(p,role);});
 for(const role of roles)await scenario(role+': visibility, financial redaction and forbidden APIs',async()=>{
  const p=sessions[role].p,list=await okay(p,'listOrders',{}),ids=list.items.map(o=>o.id);assert.ok(ids.includes(orders[role].id));
  assert.equal(ids.includes(orders.generalManager.id),['generalManager','manager','warehouse'].includes(role));
  if(role==='sales')assert.ok(ids.includes(orders.dataEntry.id));
  if(['sales','dataEntry'].includes(role))await denied(p,'getOrder',{id:orders.generalManager.id});
  const own=await okay(p,'getOrder',{id:orders[role].id});assert.equal(own.order.actions.edit,true);assert.equal(own.order.actions.statuses.length>0,['generalManager','manager','warehouse'].includes(role));
  if(role==='warehouse'){const other=await okay(p,'getOrder',{id:orders.generalManager.id});assert.equal(Object.hasOwn(other.order,'amount'),false);}
  if(!['generalManager','manager'].includes(role)){for(const endpoint of ['listMembers','listAudit','listSyncEvents'])await denied(p,endpoint,{});}
  await openOrder(p,orders[role]);assert.equal(await p.getByRole('button',{name:'تعديل',exact:true}).count(),1);
  assert.equal(await p.getByRole('button',{name:'تحويل إلى قيد المراجعة',exact:true}).count(),['generalManager','manager','warehouse'].includes(role)?1:0);
  assert.equal(await p.getByText(/حذف الطلب|حذف نهائي/).count(),0);await p.screenshot({path:path.join(out,role+'-permissions.png')});
  await back(p); // Detail app-bar back in RTL.
 });
 await scenario('UI hides out-of-scope search results, other amounts and administration',async()=>{
  for(const role of ['sales','dataEntry']){const p=sessions[role].p;assert.deepEqual(await search(p,orders.generalManager.customer),[]);await p.getByText('لا توجد طلبات مطابقة',{exact:false}).first().waitFor();
   await nav(p,'more');assert.equal(await p.getByText('الفريق والصلاحيات',{exact:true}).count(),0);assert.equal(await p.getByText('سجل العمليات',{exact:true}).count(),0);await p.mouse.click(600,200);}
  for(const [role,target] of [['warehouse','generalManager'],['sales','dataEntry']]){const p=sessions[role].p;await openOrder(p,orders[target]);assert.equal((await p.locator('body').innerText()).includes(orders[target].amount),false);assert.equal(await p.getByRole('button',{name:'تعديل',exact:true}).count(),0);await p.screenshot({path:path.join(out,role+'-other-amount-hidden.png')});await back(p);}
  for(const role of ['sales','dataEntry']){const r=await callable(sessions[role].p,'changeOrderStatus',{id:orders[role].id,status:'review'});assert.equal(r.ok,false);assert.equal(r.code,'functions/failed-precondition');}
 });
 await scenario('pending and disabled accounts cannot enter workspace',async()=>{for(const role of ['pending','disabled']){const p=await login(role);await denied(p,'dashboardStats',{});assert.equal(await p.getByText('إضافة طلب جديد',{exact:true}).count(),0);await p.screenshot({path:path.join(out,role+'-blocked.png')});}});
 await scenario('idempotent Backend retry preserves one order and rejects changed payload',async()=>{
  for(const role of roles){const o=orders[role],r=await okay(sessions[role].p,'createOrder',o.payload);assert.equal(r.id,o.id);assert.equal(r.alreadyExists,true);}
  const o=orders.dataEntry,r=await callable(sessions.dataEntry.p,'createOrder',{...o.payload,amount:'999.999'});assert.equal(r.ok,false);assert.equal(r.code,'functions/already-exists');
 });
 await scenario('concurrent Backend edits accept one revision and reject the stale writer',async()=>{
  const p=sessions.generalManager.p,o=(await okay(p,'getOrder',{id:orders.warehouse.id})).order;
  const updates=await Promise.all(['أ','ب'].map(label=>callable(p,'updateOrder',{...o,id:o.id,description:'مراجعة متزامنة '+label})));
  assert.equal(updates.filter(r=>r.ok).length,1);assert.equal(updates.find(r=>!r.ok).code,'functions/aborted');
 });
 await scenario('UI edit, stale revision protection, internal transitions and terminal lock',async()=>{
  const p=sessions.generalManager.p,o=orders.generalManager;
  await openOrder(p,o);await click(p,'تعديل');await p.getByRole('textbox',{name:'ملاحظات',exact:true}).waitFor();
  await p.screenshot({path:path.join(out,'editing.png')});
  // Full-screen edit route has a 56px app bar and no navigation rail.
  const noteBox=await p.getByRole('textbox',{name:'ملاحظات',exact:true}).boundingBox();await p.mouse.click(300,noteBox.y+noteBox.height/2);await frame(p);await selectAll(p);await p.keyboard.insertText('تم تعديل الطلب عبر الواجهة');await frame(p);
  let changed=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/updateOrder')&&r.request().method()==='POST');await click(p,'حفظ الطلب');assert.equal((await changed).status(),200);
  let latest=await okay(p,'getOrder',{id:o.id});assert.equal(latest.order.note,'تم تعديل الطلب عبر الواجهة');
  await p.getByText('تفاصيل الطلب',{exact:true}).waitFor();
  await click(p,'تعديل');await p.getByRole('textbox',{name:'ملاحظات',exact:true}).waitFor();
  const current=(await okay(sessions.manager.p,'getOrder',{id:o.id})).order;
  await okay(sessions.manager.p,'updateOrder',{...current,id:o.id,note:'تعديل متزامن معتمد'});
  changed=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/updateOrder')&&r.request().method()==='POST');await click(p,'حفظ الطلب');assert.equal((await changed).status(),409);
  await p.getByText(/تم تعديل الطلب بواسطة مستخدم آخر|تغيرت بيانات الطلب/).first().waitFor();
  latest=await okay(p,'getOrder',{id:o.id});assert.equal(latest.order.note,'تعديل متزامن معتمد');
  await back(p);await p.getByText('تفاصيل الطلب',{exact:true}).waitFor();await click(p,'تحديث');
  for(const [label,status] of [['تحويل إلى قيد المراجعة','review'],['تحويل إلى قيد التجهيز','preparing'],['تحويل إلى جاهز للتسليم','ready'],['إكمال الطلب الداخلي','delivered']]){
   const response=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/changeOrderStatus')&&r.request().method()==='POST');
   await click(p,label);if(status==='delivered')await click(p,'تأكيد الإكمال');assert.equal((await response).status(),200);
   await p.getByText('الحالة: '+({'review':'قيد المراجعة','preparing':'قيد التجهيز','ready':'جاهز للتسليم','delivered':'تم التسليم'}[status]),{exact:true}).waitFor();
  }
  assert.equal(await p.getByRole('button',{name:'تعديل',exact:true}).count(),0);
  const closed=await okay(p,'getOrder',{id:o.id});assert.equal(closed.order.completionSource,'internal');assert.deepEqual(closed.order.actions.statuses,[]);
  assert.ok(closed.events.some(e=>e.action==='edited'));assert.equal(closed.events.filter(e=>e.action==='status_changed').length,4);
  await p.screenshot({path:path.join(out,'completed-order.png')});await back(p);
 });
 await scenario('UI cancellation retains order and history',async()=>{
  const p=sessions.manager.p,o=orders.manager;await openOrder(p,o);
  const response=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/changeOrderStatus')&&r.request().method()==='POST');
  await click(p,'تحويل إلى ملغي');await click(p,'تأكيد الإلغاء');assert.equal((await response).status(),200);
  const r=await okay(p,'getOrder',{id:o.id});assert.equal(r.order.status,'cancelled');assert.ok(r.events.some(e=>e.action==='status_changed'));await p.screenshot({path:path.join(out,'cancelled-order.png')});await back(p);
 });
 await scenario('Firestore denies direct order reads, deletes and profile escalation for every role',async()=>{
  for(const role of roles){const p=sessions[role].p;const checks=await p.evaluate(async ({id,role})=>{
   const {getFirestore,doc,getDoc,deleteDoc,updateDoc}=await import('/firebase-sdk/12.19.0/firebase-firestore-pipelines.js');const db=getFirestore();
   const outcomes=[];for(const work of [()=>getDoc(doc(db,'orders',id)),()=>deleteDoc(doc(db,'orders',id)),()=>updateDoc(doc(db,'members','qa-'+role),{role:'generalManager'})]){try{await work();outcomes.push('unexpected_success');}catch(e){outcomes.push(e.code);}}return outcomes;
  },{id:orders[role].id,role});assert.deepEqual(checks,['permission-denied','permission-denied','permission-denied']);}
 });
 await scenario('forged administration, identities and missing App Check are rejected',async()=>{
  await denied(sessions.manager.p,'saveMember',{id:'qa-manager',role:'generalManager',name:'تصعيد مرفوض',permissions:[],active:true});
  for(const role of ['sales','dataEntry','warehouse'])await denied(sessions[role].p,'saveMember',{id:'qa-'+role,role:'generalManager',name:'انتحال مرفوض',permissions:[],active:true});
  const p=sessions.pending.p,forged=await okay(p,'joinSession',{uid:'qa-generalManager',email:'fake@velnix.test',role:'generalManager',active:true});assert.equal(forged.status,'pending');
  const missing=await sessions.generalManager.p.evaluate(async()=>{const {getAuth}=await import('/firebase-sdk/12.19.0/firebase-auth.js');const response=await fetch('http://127.0.0.1:5001/demo-velnix-preview/europe-west1/me',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getAuth().currentUser.getIdToken()},body:JSON.stringify({data:{}})});return response.status;});assert.equal(missing,401);
 });
 await scenario('UI audit log and locally generated notifications with read receipt',async()=>{
  const gm=sessions.generalManager.p;await nav(gm,'more');const displayed=gm.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/listAudit')&&r.request().method()==='POST');await activate(gm,gm.getByText('سجل العمليات',{exact:true}));assert.equal((await displayed).status(),200);await gm.getByText('سجل العمليات',{exact:true}).waitFor();
  const audit=await okay(gm,'listAudit',{});assert.ok(audit.items.some(a=>a.entityId===orders.generalManager.id&&a.action==='order.status_changed'));await gm.screenshot({path:path.join(out,'audit-ui.png')});
  const p=sessions.dataEntry.p;await nav(p,'notices');await p.getByRole('button',{name:'تحديث',exact:true}).waitFor();
  await p.waitForFunction(()=>document.body.innerText.includes('طلب جديد'),null,{timeout:20000});
  const notices=await okay(p,'listNotices',{}),notice=notices.items.find(n=>n.orderId===orders.dataEntry.id);assert.ok(notice);assert.equal(notice.read,false);
  await p.screenshot({path:path.join(out,'notifications-ui.png')});
  await activate(p,p.locator('flt-semantics[flt-tappable]').filter({hasText:'طلب جديد'}).filter({hasText:'افتح الطلب لعرض آخر تغيير.'}).first());await p.getByText('تفاصيل الطلب',{exact:true}).waitFor();
  const read=await okay(p,'listNotices',{});assert.equal(read.items.find(n=>n.id===notice.id).read,true);await back(p);
  await denied(sessions.sales.p,'markNoticeRead',{id:notice.id});
  await nav(p,'notices');await click(p,'تفعيل إشعارات الجهاز');await p.getByText(/إشعارات الجهاز تحتاج تهيئة المؤسسة/).last().waitFor();
 });
 await scenario('UI network error and retry recover without fabricated success',async()=>{
  const p=sessions.sales.p;await p.route('**/europe-west1/dashboardStats',route=>route.abort());await nav(p,'home');await p.getByText(/تعذر الاتصال|تعذر إتمام العملية/).first().waitFor({timeout:20000});
  await p.screenshot({path:path.join(out,'offline-ui.png')});await p.unroute('**/europe-west1/dashboardStats');await click(p,'إعادة المحاولة');await p.getByText('كل الطلبات',{exact:true}).waitFor();
 });
 await scenario('authorization changes immediately block an existing data-entry UI session',async()=>{
  const p=sessions.dataEntry.p;await nav(p,'orders');
  // Reproduce a background tab: the policy refresh completes before Flutter's
  // next frame can subscribe to its future. No sleep and no error filtering.
  await p.evaluate(()=>{
   const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Map();let id=0;
   window.requestAnimationFrame=callback=>{pending.set(--id,callback);return id;};
   window.cancelAnimationFrame=key=>{if(!pending.delete(key))cancel(key);};
   window.resumeAuthorizationFrames=()=>{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;for(const callback of pending.values())request(callback);delete window.resumeAuthorizationFrames;};
  });
  let releaseRefresh;const memberSaved=new Promise(resolve=>{releaseRefresh=resolve;});
  const refreshRoute=async route=>{await memberSaved;await route.continue();};
  await p.route('**/europe-west1/joinSession',refreshRoute);
  try{
   const refreshed=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/joinSession')&&r.request().method()==='POST');
   await okay(sessions.generalManager.p,'saveMember',{id:'qa-dataEntry',name:names.dataEntry,role:'dataEntry',permissions:[],salesSupervisorId:'qa-sales',active:false});
   releaseRefresh();const response=await refreshed;assert.equal(response.status(),400);await response.finished();
  }finally{releaseRefresh();await p.unroute('**/europe-west1/joinSession',refreshRoute);await p.evaluate(()=>window.resumeAuthorizationFrames());}
  await p.getByText(/حسابك معطل|يلزم حساب (?:Google )?موثق وفعال/).first().waitFor({timeout:15000});await denied(p,'getOrder',{id:orders.dataEntry.id});assert.equal(await p.getByText('إدارة الطلبات',{exact:true}).count(),0);await p.screenshot({path:path.join(out,'disabled-live-session.png')});
  await okay(sessions.generalManager.p,'decideJoinRequest',{id:'qa-pending',decision:'rejected'});await sessions.pending.p.getByText('تم رفض طلب انضمامك. راجع المدير العام',{exact:true}).waitFor({timeout:15000});await denied(sessions.pending.p,'getOrder',{id:orders.generalManager.id});
 });
 assert.equal(results.length,21);assert.deepEqual(pageErrors,[]);
 assert.equal(traffic.some(r=>/^(identitytoolkit|securetoken|firestore|cloudfunctions|firebaseappcheck)\.googleapis\.com$/.test(r.host)),false);
}
main().catch(async e=>{console.error(e.stack);for(const [role,s] of Object.entries(sessions))await s.p.screenshot({path:path.join(out,role+'-last.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:process.exitCode?'failed':'passed',sourceCommit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),projectId:'demo-velnix-preview',results,orders,pageErrors,traffic},null,2));if(browser)await browser.close();});
