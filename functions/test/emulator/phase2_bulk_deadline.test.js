'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-velnix';
process.env.ALLOWED_DELIVERY_HOSTS='local-contract.example';
process.env.CLICK_SEND_ALLOWED_COMPANY_IDS='click_dl';
// Force an immediate deadline so the loop stops starting new sends deterministically.
process.env.VELNIX_DISPATCH_DEADLINE_MS='1';
const delivery=require('../../src/delivery');
delivery.decryptSecret=async()=>'tok';
const clickDelivery=require('../../src/click_delivery');
let sendCalls=0;
clickDelivery.sendClickOrder=async()=>{sendCalls++;return {trackingNumber:'TRK'};};
clickDelivery.readClickOrder=async()=>({status:200,json:{result:{Stat_App_Nm:'قيد انتظار الموافقة',Status_Date:'2026-10-19T00:00:00'}}});
const functions=require('../../src/index');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApp,deleteApp}=require('firebase-admin/app');
const db=getFirestore();
const auth={uid:'dl_gm',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};

before(async()=>{
  await db.doc('members/dl_gm').set({name:'DL GM',role:'generalManager',active:true,permissions:[]});
  await db.doc('pages/p1').set({name:'p1',nameLower:'p1',active:true,archived:false,status:'active'});
  await db.doc('companies/click_dl').set({name:'Click DL',provider:'click_delivery_v1',apiUrl:'https://admin.clickdelivery.org/Client',clickUserId:1603,clickSendEnabled:true,enabled:true,archived:false,statusMap:{}});
  await db.doc('companySecrets/click_dl').set({apiTokenCiphertext:'m'});
});
after(async()=>{await db.terminate();await deleteApp(getApp());});

test('an expired deadline stops starting sends, marks partial and never fakes completion',async()=>{
  sendCalls=0;
  const ids=[];
  for(let i=0;i<3;i++){const id='dl_order_'+i;await db.doc('orders/'+id).set({customer:'dl '+i,phone:'0790000000',city:'عمان',area:'x',address:'y',description:'d',amountMinor:1000,quantity:1,pageId:'p1',status:'ready',companyId:'click_dl',hasDelivery:true,dispatchState:'idle',createdBy:'dl_gm',revision:0,orderType:'normal',createdAt:Timestamp.now()});ids.push(id);}
  const r=await functions.bulkDispatch.run({auth,data:{ids,operationId:'dl_deadline_op_0001'}});
  // With a 1ms deadline the loop stops before sending anything.
  assert.equal(sendCalls,0,'no send after the deadline');
  assert.equal(r.status,'partial','not declared finished');
  assert.ok(r.remaining>=1,'remaining reported');
  assert.equal(r.succeeded,0);
  // No order was dispatched and setorder was never called.
  const d0=(await db.doc('orders/dl_order_0').get()).data();
  assert.equal(d0.dispatchState,'idle');
  assert.ok(d0.trackingNumber == null,'no tracking number was generated');
});
