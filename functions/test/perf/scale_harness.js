'use strict';
// Scale harness (Task 6): measures the hot read paths over a controlled number
// of orders in the LOCAL Firestore emulator.
//
// THIS IS NOT A PRODUCTION BENCHMARK. Latency here excludes the Cloud Functions
// network layer, cold starts and the real multi-region Firestore backend, so the
// absolute numbers are a lower bound on the code+query cost only. It is used to
// (a) prove the code does not degrade catastrophically with 100 / 1,000 / 10,000
// orders and (b) find and fix a *proven* bottleneck.
//
// Run:
//   firebase emulators:exec --project demo-velnix --config /tmp/velnix-emu-config.json \
//     --only auth,firestore "node test/perf/scale_harness.js"
const {performance}=require('node:perf_hooks');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore(),auth=getAuth();

const SIZES=(process.env.PERF_SIZES||'100,1000,10000').split(',').map(Number);
const uid=n=>`perf_${n}`;
const call=(name,user,data)=>functions[name].run({auth:{uid:user.uid,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data});

function stats(samples){
  const s=[...samples].sort((a,b)=>a-b);
  const at=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
  return {n:s.length,min:+s[0].toFixed(1),p50:+at(0.5).toFixed(1),p95:+at(0.95).toFixed(1),max:+s[s.length-1].toFixed(1)};
}
async function timeIt(fn){const t0=performance.now();const out=await fn();return {ms:performance.now()-t0,out};}

const STATUSES=['created','review','preparing','ready','dispatched','inTransit','delivered','returned','cancelled'];
const INTERNAL=['created','review','preparing','ready','delivered','cancelled'];

async function seed(n,owner){
  const t0=performance.now();
  const batchSize=400;
  for(let start=0;start<n;start+=batchSize){
    const batch=db.batch();
    for(let i=start;i<Math.min(n,start+batchSize);i++){
      const accepted=i%5===0; // 20% confirmed carrier acceptance
      const ref=db.doc(`orders/perf_${n}_${String(i).padStart(6,'0')}`);
      const name=`Customer ${i%997}`;
      const status=STATUSES[i%STATUSES.length];
      const internalStatus=INTERNAL.includes(status)?status:'ready';
      batch.set(ref,{
        createdBy:owner,status,internalStatus,
        dispatchState:accepted?'sent':'idle',deliveryAccepted:accepted,hasDelivery:true,
        companyId:'perf_company',amountMinor:1000+(i%50)*100,revision:0,
        createdAt:Timestamp.fromMillis(1700000000000+i*1000),
        customerName:name,customerKey:`customer ${i%997}`,
        phoneDigits:String(7900000000+i).slice(0,10),
        searchText:`order perf ${i%997}`.toLowerCase(),
        searchTokens:[`order`,`perf`,`customer${i%997}`.toLowerCase()],
        searchPrefixes:[`custo`,`customer ${i%997}`.toLowerCase()],
      });
    }
    await batch.commit();
  }
  return performance.now()-t0;
}

async function pagesThroughAll(user){
  let cursor=null,pages=0,items=0;
  for(let guard=0;guard<500;guard++){
    const page=await call('listOrders',user,{pageSize:50,bucket:'all',...(cursor?{cursor}:{})});
    items+=page.items.length;pages++;
    if(!page.nextAfterId)break;
    cursor=page.nextAfterId;
  }
  return {items,pages};
}

async function main(){
  await db.doc('companies/perf_company').set({name:'Perf Carrier',provider:'generic_v1',apiUrl:'https://local-contract.example',enabled:true});
  const report={};
  for(const n of SIZES){
    const owner=uid(n);
    await auth.createUser({uid:owner}).catch(()=>{});
    await db.doc('members/'+owner).set({name:`Perf ${n}`,role:'manager',active:true,permissions:['updateOrderStatus','viewAmounts']});
    const chk=await db.doc('members/'+owner).get();
    if(!chk.exists||chk.data().active!==true)throw new Error('member setup failed for '+owner+': '+JSON.stringify(chk.data()));
    const seedMs=await seed(n,owner);
    const user={uid:owner};
    // Warm once (index/plan caches), then measure 5 rounds.
    await call('dashboardStats',user,{});
    await call('listOrders',user,{pageSize:50,bucket:'all'});
    await call('searchOrders',user,{query:'Customer 500'});
    const dash=[],first=[],search=[],pageAll=[];
    for(let r=0;r<5;r++){
      dash.push((await timeIt(()=>call('dashboardStats',user,{}))).ms);
      first.push((await timeIt(()=>call('listOrders',user,{pageSize:50,bucket:'all'}))).ms);
      search.push((await timeIt(()=>call('searchOrders',user,{query:'Customer 500'}))).ms);
      if(r<3)pageAll.push((await timeIt(()=>pagesThroughAll(user))).ms);
    }
    // One measured full page-through to capture page/item counts.
    const full=await pagesThroughAll(user);
    const stats1=await call('dashboardStats',user,{});
    report[n]={seedMs:+seedMs.toFixed(0),docs:n,
      dashboardStats:stats(dash),listFirstPage:stats(first),searchOrders:stats(search),
      listAllPages:{...stats(pageAll),pages:full.pages,items:full.items},
      counters:{all:Object.values(stats1.counters.all).reduce((s,v)=>s+v.count,0),
        internal:Object.values(stats1.counters.internal).reduce((s,v)=>s+v.count,0),
        delivery:Object.values(stats1.counters.delivery).reduce((s,v)=>s+v.count,0)}};
    console.log(`\n=== N=${n} ===`);
    console.log(JSON.stringify(report[n],null,2));
  }
  console.log('\nPERF_JSON='+JSON.stringify(report));
  await db.terminate();await deleteApp(getApp());
}
main().catch(e=>{console.error(e);process.exit(1);});
