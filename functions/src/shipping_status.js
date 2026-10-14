'use strict';
// Velnix business vocabulary supplied by the client, NOT Click API codes.
// No response parser, external status mapping or financial calculation exists.
const SHIPPING_STATUSES=Object.freeze(['awaitingPickup','carrierWarehouse','outForDelivery','delivered','partiallyDelivered','deferred','cancelled']);
function shippingStatus(value){return SHIPPING_STATUSES.includes(value)?value:null;}
module.exports={SHIPPING_STATUSES,shippingStatus};
