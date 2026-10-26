'use strict';
/*
 * Sanitized fixtures captured from live read-only probes on 2026-10-18.
 * Every byte here is a provider error envelope or a framework rejection. No
 * order field, customer value, credential or identifier appears in any fixture.
 */
module.exports = Object.freeze({
  // POST /getorder and POST /removeorder, observed with no credentials and with
  // every malformed payload tried. Authentication is checked first.
  invalidCredentials401: {
    status: 401,
    body: { error: { Message: 'بيانات مستخدم غير صحيحة' } },
  },
  // POST /getorder with the Authorization: client gate absent or altered
  // (case variant or wrong literal). The generic gate rejection, returned
  // before any credential evaluation.
  missingAuthorization401: {
    status: 401,
    body: { error: { Message: 'Unauthorized' } },
  },
  // GET|PUT on a POST-only route.
  methodNotAllowed405: {
    status: 405,
    body: { Message: "The requested resource does not support http method 'GET'." },
  },
  // POST /setorder with an empty body: a .NET null-reference message, i.e. the
  // route exists and accepts POST but the body was unusable. No shipment was
  // created and no further setorder probe was made.
  setOrderEmptyBody400: {
    status: 400,
    body: { error: { Message: 'لم يتم تعيين مرجع السلسلة لمثيل سلسلة.' } },
  },
  // An unauthenticated 2xx has never been observed; retained to pin that an
  // empty success envelope must still not be treated as verified data.
  emptyTwoHundred: { status: 200, body: {} },
});
