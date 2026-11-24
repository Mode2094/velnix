'use strict';
// Carrier-deletion monitoring contract. It is a display-only control view: it
// must never delete an order, change its status/amounts/`deliveryAccepted`,
// resend it, or turn a connection failure into a confirmed deletion.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateCarrierDeletionSignal,canManageCarrierDeletion,CARRIER_DELETION_STATES}=require('../src/policy');
const {deletionStateFor,carrierSnapshot,shouldRecordReview}=require('../src/carrier_deletion');
const {parseFilters,matchingFilters}=require('../src/query');
const src=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');

test('only two monitoring states exist and an integration signal can never confirm',()=>{
  assert.deepEqual(CARRIER_DELETION_STATES,['needs_review','confirmed']);
  const review=validateCarrierDeletionSignal({state:'needs_review',source:'click_integration',reason:'لم تعد الشحنة'});
  assert.deepEqual(review,{state:'needs_review',source:'click_integration',reason:'لم تعد الشحنة',note:''});
  // A single missing provider response is a suspicion, never proof.
  assert.throws(()=>validateCarrierDeletionSignal({state:'confirmed',source:'click_integration',reason:'x'}),/integration_requires_manual_confirmation/);
  const confirmed=validateCarrierDeletionSignal({state:'confirmed',source:'manual',reason:'كشف الشركة'});
  assert.equal(confirmed.state,'confirmed');
});

test('a signal requires a state, a source, a reason, and bounded text',()=>{
  assert.throws(()=>validateCarrierDeletionSignal({state:'gone',reason:'x'}),/invalid_deletion_state/);
  assert.throws(()=>validateCarrierDeletionSignal({state:'needs_review',source:'rumor',reason:'x'}),/invalid_deletion_source/);
  assert.throws(()=>validateCarrierDeletionSignal({state:'needs_review',reason:'  '}),/invalid_deletion_reason/);
  assert.throws(()=>validateCarrierDeletionSignal({state:'needs_review',reason:'x'.repeat(201)}),/invalid_deletion_reason/);
  assert.throws(()=>validateCarrierDeletionSignal({state:'needs_review',reason:'x',note:'y'.repeat(301)}),/invalid_deletion_note/);
});

test('the manual confirmation actions map to the two states only',()=>{
  assert.equal(deletionStateFor('confirm'),'confirmed');
  assert.equal(deletionStateFor('flag'),'needs_review');
  assert.equal(deletionStateFor('review'),'needs_review');
  assert.equal(deletionStateFor('clear'),null);
  assert.equal(deletionStateFor('delete'),null);
});

test('the snapshot preserves carrier facts and never copies money',()=>{
  const snapshot=carrierSnapshot({companyId:'c1',shippingStatus:'outForDelivery',shippingStatusUpdatedAt:'t',trackingNumber:'TRK',clickOrderRef:'REF',providerOrderId:'P',amountMinor:5000});
  assert.deepEqual(snapshot,{companyId:'c1',lastKnownShippingStatus:'outForDelivery',lastKnownShippingStatusAt:'t',trackingNumber:'TRK',shipmentReference:'REF',detectedAt:null});
  assert.equal(Object.hasOwn(snapshot,'amountMinor'),false);
  assert.equal(carrierSnapshot(null).trackingNumber,null);
});

test('the automatic path never rewrites a resolved record',()=>{
  assert.equal(shouldRecordReview(undefined),true);
  assert.equal(shouldRecordReview({state:'confirmed'}),false);
  assert.equal(shouldRecordReview({state:'needs_review'}),false);
});

test('only control roles may manage deletions',()=>{
  assert.equal(canManageCarrierDeletion({role:'generalManager',active:true,permissions:[]}),true);
  assert.equal(canManageCarrierDeletion({role:'manager',active:true,permissions:[]}),true);
  assert.equal(canManageCarrierDeletion({role:'warehouse',active:true,permissions:['viewSync']}),true);
  assert.equal(canManageCarrierDeletion({role:'sales',active:true,permissions:['viewAllOrders']}),false);
  assert.equal(canManageCarrierDeletion({role:'warehouse',active:false,permissions:['viewSync']}),false);
  assert.equal(canManageCarrierDeletion(null),false);
});

test('the deletion filter is validated and applied in memory',()=>{
  assert.equal(parseFilters({deletion:'confirmed'}).deletion,'confirmed');
  assert.equal(parseFilters({deletion:'all'}).deletion,null);
  assert.equal(parseFilters({}).deletion,null);
  assert.throws(()=>parseFilters({deletion:'gone'}),/invalid_deletion_filter/);
  const confirmed={id:'a',status:'created',createdAt:new Date(),carrierDeletion:{state:'confirmed'}};
  const review={id:'b',status:'created',createdAt:new Date(),carrierDeletion:{state:'needs_review'}};
  const plain={id:'c',status:'created',createdAt:new Date()};
  const match=(o,deletion)=>matchingFilters(o,{deletion, bucket:'internal'});
  assert.equal(match(confirmed,'confirmed'),true);
  assert.equal(match(confirmed,'needs_review'),false);
  assert.equal(match(review,'needs_review'),true);
  assert.equal(match(plain,'confirmed'),false);
  assert.equal(match(plain,'any'),false);
  assert.equal(match(confirmed,'any'),true);
  // A deletion record never changes the acceptance bucket partition.
  assert.equal(matchingFilters({...confirmed,deliveryAccepted:true},{deletion:'confirmed',bucket:'delivery'}),true);
});

test('the callable is authenticated, permission-gated and display-only',()=>{
  const start=src.indexOf('exports.reportCarrierDeletion=');const end=src.indexOf('exports.dashboardStats=',start);
  assert.ok(start>0&&end>start);
  const section=src.slice(start,end);
  assert.match(section,/await requireAuth\(req\)/);
  assert.match(section,/canManageCarrierDeletion\(user\)/);
  assert.match(section,/canSeeOrder\(user,o\)/);
  assert.match(section,/currentActor\(tx,user\)/);
  assert.match(section,/carrierDeletion:record/);
  assert.match(section,/carrier_deletion_confirmed/);
  assert.match(section,/firebaseError\(e\)/);
  // It never writes the operational/financial fields.
  assert.equal(/tx\.update\(ref,\{status:/.test(section),false);
  assert.equal(/deliveryAccepted/.test(section),false);
  assert.equal(/amountMinor\s*:/.test(section),false);
});

test('the polling path only suspects an EXPLICIT not-found, never a connection error',()=>{
  const start=src.indexOf('exports.reconcileDeliveryStatuses=');const end=src.indexOf('exports.registerDevice=',start);
  const section=src.slice(start,end);
  assert.match(section,/e\?\.message==='vendor_http_404'/);
  assert.match(section,/shouldRecordReview\(o\.carrierDeletion\)/);
  assert.match(section,/state:'needs_review',source:'click_integration'/);
  assert.equal(/state:'confirmed'/.test(section),false);
});

test('the dashboard exposes a separate deletion counter and the view labels resolve',()=>{
  assert.match(src,/counter\.carrierDeletion=\{confirmed:deletionValues\[0\],needs_review:deletionValues\[1\]\}/);
  const app=fs.readFileSync(path.join(__dirname,'../../lib/live/live_app.dart'),'utf8');
  for(const key of ['carrier_deletion_confirmed','carrier_deletion_flagged','carrier_deletion_cleared'])assert.ok(app.includes("'"+key+"'"),key);
});
