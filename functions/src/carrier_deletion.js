'use strict';
// Carrier-deletion monitoring: pure helpers for the web-only control view that
// records orders whose shipment was deleted at the delivery company. This module
// never mutates anything by itself and never deletes an order: the caller keeps
// the order, its status, its amounts and `deliveryAccepted` untouched.
//
// A record is only ever created from an EXPLICIT, trusted signal (a documented
// human confirmation or a provider that states the shipment is gone). A network
// timeout, a 5xx, an auth failure or a single empty response is never a signal.

// Maps a trusted action to a monitoring state. There is deliberately no
// "auto-confirm": the integration records a review candidate, and only the
// accountable `confirm` action moves it to `confirmed`.
function deletionStateFor(action) {
  if (action === 'confirm') return 'confirmed';
  if (action === 'flag' || action === 'review') return 'needs_review';
  return null;
}

// Snapshot the carrier facts at detection time so the control card can keep
// showing them even after the order's own carrier fields change. Amounts are NOT
// copied — the order keeps its single financial record, and the monitoring view
// never recreates it.
function carrierSnapshot(order, preservedAt) {
  const o = order && typeof order === 'object' ? order : {};
  return {
    companyId: o.companyId || null,
    lastKnownShippingStatus: o.shippingStatus || null,
    lastKnownShippingStatusAt: o.shippingStatusUpdatedAt || null,
    trackingNumber: o.trackingNumber || null,
    shipmentReference: o.clickOrderRef || o.providerOrderId || null,
    detectedAt: preservedAt || null,
  };
}

// Whether a fresh alert should be written for an order that already has a record.
// A confirmed record is terminal for the automatic path (never downgraded), and a
// record already under review is not rewritten on every poll.
function shouldRecordReview(existing) {
  if (!existing || typeof existing !== 'object') return true;
  return existing.state !== 'confirmed' && existing.state !== 'needs_review';
}

module.exports = { deletionStateFor, carrierSnapshot, shouldRecordReview };
