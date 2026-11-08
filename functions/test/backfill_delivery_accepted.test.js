'use strict';
// Backfill/classification unit test (no Firestore). Proves the acceptance
// classifier used by the backfill tool and compatibility reads is correct for
// historical and edge records, and that a bare clickOrderRef is NOT shipping.
const test=require('node:test'),assert=require('node:assert/strict');
const {deliveryAccepted,legacyDeliveryAccepted}=require('../src/query');

test('deliveryAccepted reads only the durable boolean',()=>{
  assert.equal(deliveryAccepted({deliveryAccepted:true}),true);
  assert.equal(deliveryAccepted({deliveryAccepted:false}),false);
  // No boolean -> not accepted, even with carrier-looking markers.
  assert.equal(deliveryAccepted({dispatchState:'sent'}),false);
  assert.equal(deliveryAccepted({trackingNumber:'TRK'}),false);
  assert.equal(deliveryAccepted({}),false);
  assert.equal(deliveryAccepted(null),false);
});

test('a bare clickOrderRef is never acceptance',()=>{
  assert.equal(legacyDeliveryAccepted({clickOrderRef:'VNX-abc'}),false);
  assert.equal(legacyDeliveryAccepted({clickOrderRef:'VNX-abc',dispatchState:'idle'}),false);
});

test('a legacy confirmed send is accepted (dispatchState sent)',()=>{
  assert.equal(legacyDeliveryAccepted({dispatchState:'sent'}),true);
});

test('a legacy real carrier marker is accepted (api/provid/tracking)',()=>{
  assert.equal(legacyDeliveryAccepted({shippingStatusSource:'click_api'}),true);
  assert.equal(legacyDeliveryAccepted({providerOrderId:'1318368'}),true);
  assert.equal(legacyDeliveryAccepted({trackingNumber:'TRK-1'}),true);
});

test('unconfirmed attempts are never accepted',()=>{
  // A present but non-confirmed dispatch lifecycle is never acceptance, even
  // with a persisted reference (the reference may predate acceptance).
  for(const dispatchState of ['sending','needs_review','idle','']){
    assert.equal(legacyDeliveryAccepted({dispatchState,providerOrderId:'x',clickOrderRef:'VNX-abc'}),
      false,`${dispatchState} must not be accepted even with a persisted ref`);
  }
});

test('an explicit boolean always wins over legacy markers',()=>{
  assert.equal(legacyDeliveryAccepted({deliveryAccepted:false,dispatchState:'sent'}),false);
  assert.equal(legacyDeliveryAccepted({deliveryAccepted:true}),true);
});
