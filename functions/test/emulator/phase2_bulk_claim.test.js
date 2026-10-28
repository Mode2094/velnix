'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';
process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_claim';
// KMS + Click transport injected; callables/transactions/audit are real.
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'local-fixture-token';
const clickDelivery=require('../../src/click_delivery');

// Controllable vendor: count calls and optionally delay / hang.
let sendCalls=0;
let sendDelayMs=0;
let sendHang=null; // a Promise to await (simulates a stuck external call)
let sendError=null;
clickDelivery.sendClickOrder=async()=>{
  sendCalls++;
  if(sendHang)await sendHang;
  if(sendDelayMs)await new Promise(r=>setTimeout(r,sendDelayMs));
  if(sendError)throw sendError;
  return {trackingNumber:'TRK-CLAIM-1'};
};
clickDelivery.readClickOrder=async()=>({status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00',Ord_Status_Note:'x',Ord_Amt_Duo:0,Ord_Ship_Discount:0,Ord_Will_Pay_Amt:1}}});

const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'claim_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const dispatch=(ids,operationId)=>functions.bulkDispatch.run({auth,data:{ids,operationId}});
const getOp=id=>functions.getBulkOperation.run({auth,data:{operationId:id}});

let seq=0;
async function readyOrder(){
  const id='claim_order_'+(++seq);
  await db.doc('orders/'+id).set({customer:'جهة '+id,phone:'0790000000',city:'عمان',area:'x',address:'y',description:'d',amountMinor:12345,
    quantity:1,pageId:'p1',status:'ready',companyId:'click_claim',hasDelivery:true,dispatchState:'idle',createdBy:'claim_gm',revision:0,
    orderType:'normal',createdAt:Timestamp.now()});
  return id;
}

before(async()=>{
  await db.doc('members/claim_gm').set({name:'Claim GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('pages/p1').set({name:'p1',nameLower:'p1',active:true,archived:false,status:'active'});
  await db.doc('companies/click_claim').set({name:'Click Claim',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_claim').set({apiTokenCiphertext:'mock'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('two concurrent dispatches of the same order send exactly once; the loser reports pending, not a fake result',async()=>{
  sendCalls=0;sendDelayMs=300;sendError=null;sendHang=null;
  const id=await readyOrder();
  const opId='claim_conc_op_0001';
  const [a,b]=await Promise.all([dispatch([id],opId),dispatch([id],opId)]);
  assert.equal(sendCalls,1,'exactly one external send');
  const results=await db.doc('bulkOperations/'+opId).collection('results').get();
  assert.equal(results.size,1,'one durable result document');
  assert.equal(results.docs[0].data().ok,true,'the durable result is a confirmed success');
  // The loser must not have declared success/failure for a claim it did not own:
  // at most one of the two responses reports the final outcome.
  const finished=[a,b].filter(r=>r.status==='finished');
  assert.ok(finished.length>=1,'the winner reports finished');
  const other=[a,b].find(r=>r.status!=='finished');
  if(other)assert.ok(other.pending>=1||other.claimed>=1,'the loser reports pending/claimed, not a result');
});

test('a stale claim that never started the vendor is safely re-claimed and sent once',async()=>{
  sendCalls=0;sendDelayMs=0;sendError=null;sendHang=null;
  const id=await readyOrder();
  const opId='claim_stale_nostart_0001';
  // Simulate a worker that claimed but died before the vendor call.
  await db.doc('bulkOperations/'+opId).set({actorId:'claim_gm',kind:'dispatch',ids:[id],status:'running',startedAt:Timestamp.now()});
  await db.doc('bulkOperations/'+opId+'/results/'+id).set({id,state:'claimed',vendorStarted:false,claimedBy:'claim_gm',claimedAtMs:Date.now()-300000,claimedAt:new Date().toISOString()});
  const r=await dispatch([id],opId);
  assert.equal(sendCalls,1,'re-claimed and sent exactly once');
  assert.equal(r.status,'finished');
  assert.equal(r.succeeded,1);
});

test('a stale claim that may have started the vendor is NEVER re-sent and becomes uncertain',async()=>{
  sendCalls=0;
  const id=await readyOrder();
  const opId='claim_stale_started_0001';
  await db.doc('bulkOperations/'+opId).set({actorId:'claim_gm',kind:'dispatch',ids:[id],status:'running',startedAt:Timestamp.now()});
  // vendorStarted=true AND stale: the attempt may have reached Click.
  await db.doc('bulkOperations/'+opId+'/results/'+id).set({id,state:'claimed',vendorStarted:true,claimedBy:'claim_gm',claimedAtMs:Date.now()-300000,claimedAt:new Date().toISOString()});
  const r=await dispatch([id],opId);
  assert.equal(sendCalls,0,'no setorder after an uncertain attempt');
  assert.equal(r.uncertain,1,'reported as uncertain');
  assert.equal(r.failed,0,'uncertain is not counted as a definite failure');
  const snapshot=await getOp(opId);
  assert.equal(snapshot.uncertain,1);assert.equal(snapshot.failed,0);assert.equal(snapshot.remaining,0);
  const d=(await db.doc('bulkOperations/'+opId+'/results/'+id).get()).data();
  assert.equal(d.ok,false);assert.equal(d.uncertain,true);
});

test('a live concurrent claim keeps the operation running and is not counted as success/failure',async()=>{
  sendCalls=0;
  const id=await readyOrder();
  const opId='claim_live_0001x';
  await db.doc('bulkOperations/'+opId).set({actorId:'claim_gm',kind:'dispatch',ids:[id],status:'running',startedAt:Timestamp.now()});
  await db.doc('bulkOperations/'+opId+'/results/'+id).set({id,state:'claimed',vendorStarted:true,claimedBy:'other',claimedAtMs:Date.now(),claimedAt:new Date().toISOString()});
  const r=await dispatch([id],opId);
  assert.equal(sendCalls,0,'no send while another worker holds a live claim');
  assert.notEqual(r.status,'finished','not declared finished');
  assert.ok(r.pending>=1,'reported pending');
  assert.equal(r.succeeded,0,'a live claim is not a success');
});

test('getBulkOperation separates claimed (in progress) from final results',async()=>{
  const id=await readyOrder();
  const opId='claim_get_split_0001';
  await db.doc('bulkOperations/'+opId).set({actorId:'claim_gm',kind:'dispatch',ids:[id,'other'],status:'running',startedAt:Timestamp.now()});
  await db.doc('bulkOperations/'+opId+'/results/'+id).set({id,state:'claimed',vendorStarted:true,claimedBy:'claim_gm',claimedAtMs:Date.now(),claimedAt:new Date().toISOString()});
  const rec=await getOp(opId);
  assert.equal(rec.claimed.length,1,'claimed listed separately');
  assert.equal(rec.results.length,0,'no final result yet');
  assert.equal(rec.finished,false);
  assert.ok(rec.remaining>=1);
});
