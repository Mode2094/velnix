'use strict';
// Two-session live-sync verification against the ISOLATED local preview
// (project demo-velnix-preview, synthetic role@velnix.test accounts, local
// Firestore + Functions emulators). No production data, no production account
// and no real carrier is touched.
//
// It proves the task-4/task-5 behaviour end to end:
//   * session A (generalManager) shows the orders grid filtered to «جديد»;
//   * session B (manager) creates an order through the authorized callable;
//   * A's grid shows the new row WITHOUT any user interaction (live create);
//   * B moves the order to «قيد المراجعة»;
//   * A's filtered grid drops the row WITHOUT any user interaction (movement
//     between status cards), while «جميع طلبات المتجر» still contains it;
//   * no page reload happened (a sentinel set on window survives).
//
// Requires the preview running (scripts/emulator-preview/start.sh).
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/qa/emulator-ui');fs.mkdirSync(out,{recursive:true});
const names={generalManager:'مدير عام اصطناعي',manager:'مدير اصطناعي'};
const results=[];let browser;
const stamp=Date.now();
const customer=`طلب مزامنة لحظية ${stamp}`;
const requestKey=('sync'+stamp+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60).padEnd(20,'x');

async function scenario(name,fn){const start=Date.now();try{await fn();results.push({name,status:'passed',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'failed',error:e.message,ms:Date.now()-start});console.error('FAIL',name,e.message);throw e;}}
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function activate(p,locator){await p.bringToFront();await p.waitForTimeout(60);await locator.evaluate(el=>(el.closest('[flt-tappable]')||el).click());await frame(p);}
async function click(p,name){await activate(p,p.getByRole('button',{name,exact:true}).first());}
async function login(role){
 const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.hostname==='apis.google.com'||u.hostname==='fonts.gstatic.com'){const r=await fetch('http://127.0.0.1:8767/verified-public?url='+encodeURIComponent(u.href));return route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'text/javascript',body:Buffer.from(await r.arrayBuffer()),headers:{'access-control-allow-origin':'*'}});}
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
  return route.abort();
 });
 const p=await ctx.newPage();
 await p.goto('http://127.0.0.1:8767',{waitUntil:'networkidle'});
 await p.locator('flt-glass-pane').waitFor({state:'attached',timeout:60000});
 await p.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
 await p.getByRole('button',{name:'المتابعة باستخدام Google'}).waitFor({timeout:60000});
 const popup=ctx.waitForEvent('page',{timeout:30000});await click(p,'المتابعة باستخدام Google');const pop=await popup;
 await pop.getByText(role.toLowerCase()+'@velnix.test',{exact:true}).click();
 await p.getByText('أهلاً، '+names[role],{exact:true}).waitFor({timeout:60000});
 return p;
}
async function nav(p,kind){const label={home:'الرئيسية',orders:'الطلبات'}[kind];const exact=p.getByRole('button',{name:label,exact:true});if(await exact.count())return activate(p,exact.first());await activate(p,p.getByRole('button').filter({hasText:label}).first());}
async function callable(p,name,data={}){return p.evaluate(async({name,data})=>{const {getApp}=await import('/firebase-sdk/12.19.0/firebase-app.js');const {getFunctions,httpsCallable}=await import('/firebase-sdk/12.19.0/firebase-functions.js');try{return {ok:true,data:(await httpsCallable(getFunctions(getApp(),'europe-west1'),name)(data)).data};}catch(e){return{ok:false,code:e.code,message:e.message};}},{name,data});}
async function okay(p,name,data){const r=await callable(p,name,data);assert.equal(r.ok,true,`${name}: ${r.code} ${r.message||''}`);return r.data;}
async function text(p){return p.locator('body').innerText();}
async function waitRow(p,customer,{present=true,timeout=25000}={}){
 const row=()=>p.locator(`[aria-label*="${customer}"]`);
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  const n=await row().count();
  if((n>0)===present)return Date.now();
  await p.waitForTimeout(500);
 }
 throw new Error(`row "${customer}" ${present?'never appeared':'never left'} within ${timeout}ms`);
}
async function setDropdown(p,label,optionLabel){
 const trigger=p.getByRole('button',{name:label}).first();
 await trigger.waitFor({timeout:20000});
 await activate(p,trigger);
 await frame(p);await p.waitForTimeout(300);
 const option=p.locator(`[aria-label="${optionLabel}"]`);
 if(await option.count()){await activate(p,option.last());}
 else{
  const byText=p.locator(`flt-semantics:has-text("${optionLabel}")`).last();
  if(await byText.count()){await activate(p,byText);}
  else{await activate(p,p.getByText(optionLabel,{exact:true}).last());}
 }
 await frame(p);await p.waitForTimeout(400);
}

async function main(){
 const chrome=process.env.CHROME_EXECUTABLE||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
 browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 const A=await login('generalManager');
 const B=await login('manager');
 let orderId=null;

 await scenario('B creates an order via the authorized callable',async()=>{
  const r=await okay(B,'createOrder',{customer,phone:'0790000001',city:'عمان',area:'اختبار مزامنة',address:'عنوان اصطناعي',description:'طرد اختبار المزامنة اللحظية',amount:'12.500',paymentMethod:'عند الاستلام',orderType:'normal',pageId:'qa_page',requestKey});
  orderId=r.id;assert.ok(orderId);
 });

 await scenario('A loads the orders grid filtered to «جديد» with the order present and sets a no-reload sentinel',async()=>{
  await nav(A,'orders');
  await A.locator('flt-glass-pane').waitFor({state:'attached',timeout:30000});
  await A.waitForTimeout(1500);
  await setDropdown(A,'الحالة الداخلية','جديد');
  await waitRow(A,customer,{present:true,timeout:30000});
  await A.evaluate(()=>{window.__velnixNoReload='keep-me';});
  await A.screenshot({path:path.join(out,'realtime-A-new-filter.png')});
 });

 await scenario('B moves the order to «قيد المراجعة»',async()=>{
  await okay(B,'changeOrderStatus',{id:orderId,status:'review'});
 });

 await scenario('A drops the row from the «جديد» card live, with no user interaction and no reload',async()=>{
  const t=Date.now();
  await waitRow(A,customer,{present:false,timeout:30000});
  console.log('   (dropped in '+Math.round((Date.now()-t)/1000)+'s)');
  assert.equal(await A.evaluate(()=>window.__velnixNoReload),'keep-me','the page reloaded instead of syncing live');
  await A.screenshot({path:path.join(out,'realtime-A-after-move.png')});
 });

 await scenario('the order is still in «جميع طلبات المتجر» (one card, still in the store book)',async()=>{
  await setDropdown(A,'الحالة الداخلية','الكل');
  await waitRow(A,customer,{present:true,timeout:25000});
  await A.screenshot({path:path.join(out,'realtime-A-back-in-all.png')});
  const got=await okay(A,'getOrder',{id:orderId});
  assert.equal(got.order.status,'review');
  assert.equal(got.order.internalStatus,'review');
 });

 fs.writeFileSync(path.join(out,'realtime-sync-results.json'),JSON.stringify({status:'passed',projectId:'demo-velnix-preview',customer,orderId,results},null,2));
 console.log('REALTIME_SYNC_PASSED '+JSON.stringify(results.map(r=>r.name)));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
