'use strict';
// Velnix shipping vocabulary. These are DISPLAY business states, NOT Click API
// codes: the provider has never published a numeric/textual API status code, so
// nothing here is derived from an API code. They are separate from OrderStatus
// and never imply a collected amount.
//
// The twelve entries mirror the twelve states confirmed from the provider's own
// client portal on 2026-10-18 (owner's authorized session, client code 1603),
// with the exact Arabic labels. In addition, `awaitingPickup` has been observed
// verbatim in a real successful getorder response (2026-10-19).
//
// `confirmed` records whether the exact label has been seen in a real Click API
// response. Only confirmed labels are treated as API-verified; the rest are
// documented by the portal and are surfaced as "documented, not yet confirmed"
// rather than being presented as a proven API fact.
const SHIPPING_STATUSES = Object.freeze([
  'awaitingPickup',
  'carrierWarehouse',
  'outForDelivery',
  'delivered',
  'partiallyDelivered',
  'deferred',
  'cancelled',
  'returned',
  'partiallyReturned',
  'returnedWarehouse',
  'inShippingToSender',
  'clientReceivedReturn',
]);

// Exact portal Arabic label -> Velnix shipping state. Every value is a label the
// provider's own portal used verbatim; no label is inferred or reworded.
const SHIPPING_LABELS = Object.freeze({
  'قيد انتظار الموافقة': 'awaitingPickup',
  'في مخزن الشحن': 'carrierWarehouse',
  'مخزن الشحن': 'carrierWarehouse',
  'في الشحن': 'outForDelivery',
  'تم التسليم': 'delivered',
  'تسليم جزئي': 'partiallyDelivered',
  'مؤجل': 'deferred',
  'ملغي': 'cancelled',
  'مرتجع': 'returned',
  'مرتجع جزئي': 'partiallyReturned',
  'في مخزن المرتجعات': 'returnedWarehouse',
  'في الشحن للراسل': 'inShippingToSender',
  'تم استلام المرتجع': 'clientReceivedReturn',
});

// States whose exact labels have been seen in a real Click API response.
const CONFIRMED_API_STATES = Object.freeze(new Set(['awaitingPickup']));

// States that represent a return/exception rather than forward progress toward
// delivery. The UI must never render these as if the parcel is on its way.
const EXCEPTION_STATUSES = Object.freeze(new Set([
  'returned', 'partiallyReturned', 'returnedWarehouse', 'inShippingToSender',
  'clientReceivedReturn', 'cancelled', 'deferred', 'partiallyDelivered',
]));

function shippingStatus(value) {
  return SHIPPING_STATUSES.includes(value) ? value : null;
}

function isExceptionStatus(value) {
  return EXCEPTION_STATUSES.has(value);
}

function isApiConfirmed(value) {
  return CONFIRMED_API_STATES.has(value);
}

module.exports = {
  SHIPPING_STATUSES,
  SHIPPING_LABELS,
  CONFIRMED_API_STATES,
  EXCEPTION_STATUSES,
  shippingStatus,
  isExceptionStatus,
  isApiConfirmed,
};
