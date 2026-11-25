'use strict';
// Orders-page filter-bar layout probe against the ISOLATED local preview
// (project demo-velnix-preview, synthetic role@velnix.test accounts).
//
// For every desktop/laptop width it records where the FIRST data row starts
// (the vertical space the header + filters + toolbars consume) and verifies
// that EVERY filter control is present and reachable — nothing hidden behind a
// «المزيد من الفلاتر» button and no option removed. Screenshots are written for
// a visual before/after comparison.
//
//   node scripts/emulator-preview/orders-layout.cjs --phase before [--out DIR]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const argv=process.argv.slice(2);
const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const phase=arg('--phase','before');
const out=path.join(root,arg('--out',`build/qa/orders-layout/${phase}`));fs.mkdirSync(out,{recursive:true});
const names={generalManager:'مدير عام اصطناعي'};
const stamp=Date.now();
const WIDTHS=[1600,1440,1280,1152,1024,900,834];
const FILTER_LABELS=['المجموعة','الحالة الداخلية','حالة الشحنة','شركة التوصيل','المحافظة','المنطقة','مصدر الطلب','المنشئ','نوع الطلب','حالة الإرسال','الهاتف (أرقام)','الباركود / رقم الطلب','المنتج / المحتويات','الملاحظات','المبلغ من','المبلغ إلى','ترتيب الإنشاء','الفترة الزمنية','تاريخ الإرسال','مسح الفلاتر','بحث شامل'];
const OPS_LABELS=['تحديد الظاهر','تحديد كل النتائج','إلغاء التحديد','طباعة','تغيير الحالة','إرسال إلى شركة التوصيل','سجل عمليات الإرسال','مسح باركود'];
let browser;
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function activate(p,locator){await p.bringToFront();await p.waitForTimeout(40);await locator.evaluate(el=>(el.closest('[flt-tappable]')||el).click());await frame(p);}
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
async function nav(p,label){const exact=p.getByRole('button',{name:label,exact:true});if(await exact.count())return activate(p,exact.first());await activate(p,p.getByRole('button').filter({hasText:label}).first());}
async function callable(p,name,data={}){return p.evaluate(async({name,data})=>{const {getApp}=await import('/firebase-sdk/12.19.0/firebase-app.js');const {getFunctions,httpsCallable}=await import('/firebase-sdk/12.19.0/firebase-functions.js');try{return{ok:true,data:(await httpsCallable(getFunctions(getApp(),'europe-west1'),name)(data)).data};}catch(e){return{ok:false,code:e.code,message:e.message};}},{name,data});}
async function present(p,label){
 const checks=[
  p.locator(`[aria-label="${label}"]`).count(),
  p.locator(`[aria-label*="${label}"]`).count(),
  p.getByRole('button',{name:label}).count(),
  p.getByText(label,{exact:false}).count(),
 ];
 const vals=await Promise.all(checks);
 return vals.some(v=>v>0);
}
async function measure(p,width){
 await p.setViewportSize({width,height:1000});
 await p.waitForTimeout(900);
 const m=await p.evaluate((filterLabels)=>{
  const tops=sel=>[...document.querySelectorAll(sel)].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>r.top);
  const firstRow=[...document.querySelectorAll('[aria-label*="VNX-"]')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
  const sortHeader=[...document.querySelectorAll('[aria-label*="رقم الطلب"]')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
  // Every filter control, grouped into visual rows by its top edge.
  const fields=[...document.querySelectorAll('[aria-label]')]
   .filter(e=>filterLabels.some(l=>e.getAttribute('aria-label').includes(l)))
   .map(e=>({label:e.getAttribute('aria-label'),r:e.getBoundingClientRect()}))
   .filter(x=>x.r.width>0&&x.r.height>2);
  const byTop={};
  for(const f of fields){const k=Math.round(f.r.top/6)*6;(byTop[k]=byTop[k]||[]).push(`${f.label}@${Math.round(f.r.width)}x${Math.round(f.r.height)}`);}
  const filterRows=Object.keys(byTop).map(Number).sort((a,b)=>a-b)
   .map(t=>({top:t,count:byTop[t].length,labels:byTop[t]}));
  const lefts=fields.map(f=>f.r.left),rights=fields.map(f=>f.r.right);
  const rectOf=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left),w:Math.round(r.width),top:Math.round(r.top)};};
  const probe={
   search:rectOf('[aria-label*="بحث شامل"]'),
   clear:rectOf('[aria-label*="مسح الفلاتر"]'),
   opsLog:rectOf('[aria-label*="سجل عمليات الإرسال"]'),
   select0:rectOf('[aria-label*="المحدد"]'),
  };
  return {
   viewportH:window.innerHeight,viewportW:window.innerWidth,
   firstRowTop:firstRow.length?Math.min(...firstRow.map(r=>r.top)):null,
   headerTop:sortHeader.length?Math.min(...sortHeader.map(r=>r.top)):null,
   pageHScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
   docW:document.documentElement.clientWidth,
   filterSpan:lefts.length?{left:Math.round(Math.min(...lefts)),right:Math.round(Math.max(...rights))}:null,
   filterRows,
   probe,
  };
 },FILTER_LABELS);
 const missing=[];
 for(const l of FILTER_LABELS){ if(!(await present(p,l))) missing.push(l); }
 const missingOps=[];
 for(const l of OPS_LABELS){ if(!(await present(p,l))) missingOps.push(l); }
 await p.screenshot({path:path.join(out,`orders-${width}.png`),fullPage:false});
 return {...m,width,missingFilters:missing,missingOps};
}
async function main(){
 const chrome=process.env.CHROME_EXECUTABLE||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
 browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await login('generalManager');
 // Seed enough synthetic rows so the table has a body to measure. Emulator only.
 for(let i=1;i<=18;i++){
  const r=await callable(p,'createOrder',{customer:`عميل القياس ${stamp}-${i}`,phone:`07900000${String(i).padStart(2,'0')}`,city:'عمان',area:'قياس التخطيط',address:'عنوان اصطناعي',description:`منتج قياس ${i}`,amount:(10+i).toFixed(3),paymentMethod:'عند الاستلام',orderType:'normal',pageId:'qa_page',requestKey:`layout${stamp}${i}`.padEnd(20,'x')});
  assert.equal(r.ok,true,`seed createOrder ${i}: ${r.code} ${r.message||''}`);
 }
 await nav(p,'الطلبات');
 await p.waitForTimeout(1500);
 const refresh=p.getByRole('button',{name:'تحديث القائمة',exact:true});
 if(await refresh.count())await activate(p,refresh.first());
 await p.locator('[aria-label*="VNX-"]').first().waitFor({timeout:30000});
 const rows=[];
 for(const w of WIDTHS) rows.push(await measure(p,w));
 for(const r of rows) console.log(`${r.width}px  firstRowTop=${r.firstRowTop?.toFixed(0)}  docW=${r.docW}  filterRows=${r.filterRows.length}  span=${r.filterSpan?r.filterSpan.right-r.filterSpan.left:0}px  missingFilters=${JSON.stringify(r.missingFilters)}  missingOps=${JSON.stringify(r.missingOps)}  pageHScroll=${r.pageHScroll}`);
 if(process.env.VNX_DEBUG)for(const r of rows){console.log(`   ${r.width}px  probe=${JSON.stringify(r.probe)}`);for(const fr of r.filterRows)console.log(`   ${r.width}px  y=${fr.top}  n=${fr.count}  ${JSON.stringify(fr.labels)}`);}
 const report={phase,stamp,widths:WIDTHS,rows};
 fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify(report,null,2));
 const anyMissing=rows.some(r=>r.missingFilters.length||r.missingOps.length);
 console.log('ORDERS_LAYOUT_'+phase.toUpperCase()+(anyMissing?'_MISSING_FILTERS':'')+' '+JSON.stringify({firstRowTop:Object.fromEntries(rows.map(r=>[r.width,Math.round(r.firstRowTop||-1)]))}));
 if(anyMissing)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
