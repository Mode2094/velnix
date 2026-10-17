const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const roles=[['generalManager','محمد أحمد'],['manager','أحمد خالد'],['warehouse','سارة علي'],['sales','عمر محمود'],['dataEntry','ليان يوسف']];
(async()=>{
 const dir=process.env.VELNIX_QA_SCREENSHOTS||path.resolve('build/qa/screenshots/improvements');fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
 const results=[];
 for(const width of [390,768,1440])for(const [role,name]of roles){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.VELNIX_DEMO_URL||'http://127.0.0.1:8767',{waitUntil:'networkidle'});
  await page.locator('flt-glass-pane').waitFor({state:'attached',timeout:60000});
  await page.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
  await page.getByRole('button',{name:new RegExp(name)}).waitFor({timeout:60000});
  await page.getByRole('button',{name:new RegExp(name)}).evaluate(el=>el.click());
  await page.getByRole('button',{name:/دخول/}).evaluate(el=>el.click());
  await page.getByText(/^أهلاً،/).first().waitFor({timeout:60000});
  await page.screenshot({path:`${dir}/${role}-dashboard-${width}.png`});
  results.push({role,width,screen:'dashboard',mode:'demo',pageErrors:[...errors]});
  // Navigation is activated through Flutter's accessibility actions.
  if(width >= 850) await page.mouse.click(width - 120, 188);
  else await page.mouse.click(width * .7, 875);
  await page.getByText('نوع الطلبات',{exact:true}).waitFor({timeout:30000});
  await page.screenshot({path:`${dir}/${role}-orders-${width}.png`});
  results.push({role,width,screen:'orders',mode:'demo',pageErrors:[...errors]});
  if(errors.length)throw Error(JSON.stringify(errors));
  await page.close();
 }
 await browser.close();fs.writeFileSync(`${dir}/browser-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
