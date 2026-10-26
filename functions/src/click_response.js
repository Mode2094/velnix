'use strict';
/*
 * Click Delivery response envelopes, established from live read-only probes on
 * 2026-10-18 against https://admin.clickdelivery.org/Client.
 *
 * What was actually observed (no customer data was read):
 *   POST /getorder   without credentials, and with every malformed payload
 *                    tried -> 401 {"error":{"Message":"بيانات مستخدم غير صحيحة"}}
 *   POST /removeorder with the same payloads -> the same 401 envelope
 *   GET|PUT /getorder -> 405 {"Message":"The requested resource does not
 *                    support http method 'GET'."}
 *   POST /nonexistent -> 404 with an HTML body
 *
 * Final authentication diagnosis (same day, bounded probe matrix, published
 * sample credentials only, boundary Order_ID=0, no shipment touched):
 *   Authorization: client (exact, case-sensitive) -> 401
 *                    {"error":{"Message":"بيانات مستخدم غير صحيحة"}}
 *   Authorization absent                          -> 401 {"error":{"Message":"Unauthorized"}}
 *   Authorization: Client (capital C)             -> 401 {"error":{"Message":"Unauthorized"}}
 *   Authorization: sample (wrong literal)         -> 401 {"error":{"Message":"Unauthorized"}}
 *
 * Consequences encoded here:
 *   1. There are two distinct error envelopes: an application envelope wrapped
 *      in `error`, and a framework envelope that is a bare `Message`.
 *   2. The literal `Authorization: client` is a case-sensitive first gate; when
 *      it is absent or altered the request never reaches the credential check
 *      and the server answers the generic `Unauthorized` message instead.
 *   3. Credentials are evaluated before payload validation on the read paths,
 *      so a caller learns nothing about a payload until it authenticates.
 *   4. No success schema has ever been supplied by the provider. Therefore this
 *      module NEVER classifies a response as success - an unrecognised body is
 *      reported as unverified rather than assumed to be data.
 */

const ARABIC_INVALID_USER = 'بيانات مستخدم غير صحيحة';
// Confirmed 2026-10-18: returned when the `Authorization: client` gate is
// missing or altered, before any credential evaluation.
const ENGLISH_UNAUTHORIZED = 'Unauthorized';

/** The provider's only confirmed application-level error envelope. */
function applicationError(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const error = json.error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  // `Message` is the only key confirmed so far; other keys stay uninterpreted.
  return typeof error.Message === 'string' ? error : null;
}

/** The framework-level envelope observed on HTTP method rejections. */
function frameworkError(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (applicationError(json)) return null;
  return typeof json.Message === 'string' ? json : null;
}

/**
 * Classifies one provider response without ever inventing success.
 * Returns {kind, message} where kind is one of:
 *   'authentication_required' - confirmed invalid-credentials rejection
 *   'application_error'       - confirmed application error envelope
 *   'framework_error'         - confirmed framework-level error envelope
 *   'http_error'              - any non-2xx without a recognised envelope
 *   'unverified'              - a 2xx whose shape has no provider documentation
 */
function classifyClickResponse(status, json) {
  const app = applicationError(json);
  if (app) {
    return { kind: status === 401 ? 'authentication_required' : 'application_error', message: app.Message };
  }
  const framework = frameworkError(json);
  if (framework) return { kind: 'framework_error', message: framework.Message };
  if (!Number.isInteger(status) || status < 200 || status > 299) return { kind: 'http_error', message: null };
  // A 2xx is not evidence of anything: the provider has never documented a
  // success body, so it is deliberately not treated as data.
  return { kind: 'unverified', message: null };
}

/** True only for a confirmed authentication rejection. */
function isInvalidCredentials(status, json) {
  const result = classifyClickResponse(status, json);
  return result.kind === 'authentication_required' && result.message === ARABIC_INVALID_USER;
}

/**
 * Distinguishes the two confirmed 401 outcomes on the /Client/ read paths:
 *   'authorization_header_invalid' - the `Authorization: client` gate failed,
 *      the generic Unauthorized envelope was returned
 *   'credentials_invalid'          - the gate passed and the supplied
 *      User_Name/User_Pass pair was rejected
 * Returns null for anything else. Neither outcome is success.
 */
function authFailureReason(status, json) {
  if (status !== 401) return null;
  const app = applicationError(json);
  if (!app) return null;
  if (app.Message === ENGLISH_UNAUTHORIZED) return 'authorization_header_invalid';
  if (app.Message === ARABIC_INVALID_USER) return 'credentials_invalid';
  return null;
}

/*
 * The seven shipping states as the client named and explained them. These are
 * display vocabulary only. They are NOT Click API codes: no numeric or textual
 * carrier code has ever been confirmed, so no automatic mapping is derived from
 * this list.
 */
const CLIENT_SHIPPING_VOCABULARY = Object.freeze([
  { key: 'awaitingPickup', label: 'قيد انتظار الموافقة', meaning: 'الطلب دخل عنا لكن لسه ما استلمه مندوب الاستلام' },
  { key: 'carrierWarehouse', label: 'مخزن الشحن', meaning: 'استلمه مندوب الاستلام وتم تسليمه للمستودع عنا' },
  { key: 'outForDelivery', label: 'في الشحن', meaning: 'تم تعيين الطلب على مندوب التوصيل' },
  { key: 'delivered', label: 'تم التسليم', meaning: 'تم التسليم' },
  { key: 'partiallyDelivered', label: 'تسليم جزئي', meaning: 'تم استلام جزء من الطلب ودفع جزء من قسمة الطلب الكلية او تم تسليم الطلب وارجاع مرتجع منه' },
  { key: 'deferred', label: 'مؤجل', meaning: 'مؤجل' },
  { key: 'cancelled', label: 'ملغي', meaning: 'الغاء الطلب بدون اجور توصيل او مع اجور توصيل في حال الوصول لموقع العميل وعدم استلامه الطلب وعدم دفعه لاجور التوصيل' },
]);

/*
 * The twelve shipping states confirmed from the provider's own client portal on
 * 2026-10-18 (read-only inspection of the owner's authorized session, client
 * code 1603). Arabic and English labels and the portal's internal LinkButton
 * tokens are evidence; they are NOT Click API status codes. No numeric or API
 * code is attached and no automatic mapping is derived from this list.
 */
const PORTAL_STATUS_VOCABULARY = Object.freeze([
  Object.freeze({key: 'waitingApproval', label: 'قيد انتظار الموافقة', english: null, portalToken: 'LnkWating'}),
  Object.freeze({key: 'inShippingStore', label: 'في مخزن الشحن', english: 'In shipping store', portalToken: 'LnkConfirmed'}),
  Object.freeze({key: 'inShipping', label: 'في الشحن', english: 'In shipping', portalToken: 'LnkInShipping'}),
  Object.freeze({key: 'delivered', label: 'تم التسليم', english: 'Delivered', portalToken: 'LnkDelivered'}),
  Object.freeze({key: 'partDelivered', label: 'تسليم جزئي', english: 'Part delivered', portalToken: 'LnkPartDeliverd'}),
  Object.freeze({key: 'postponed', label: 'مؤجل', english: 'Postponed', portalToken: 'LnkPostponed'}),
  Object.freeze({key: 'canceled', label: 'ملغي', english: 'Canceled', portalToken: 'LnkCanceled'}),
  Object.freeze({key: 'returned', label: 'مرتجع', english: 'Returned', portalToken: 'LnkReturned'}),
  Object.freeze({key: 'partReturned', label: 'مرتجع جزئي', english: 'Part returned', portalToken: 'LnkPartReturned'}),
  Object.freeze({key: 'inReturnedStore', label: 'في مخزن المرتجعات', english: 'In returned store', portalToken: 'LnkInStore'}),
  Object.freeze({key: 'inShippingToSender', label: 'في الشحن للراسل', english: 'In shipping to sender', portalToken: 'LnkInShippingReturned'}),
  Object.freeze({key: 'clientReceivedReturn', label: 'تم استلام المرتجع', english: 'Delivered to sender', portalToken: 'LnkClientReturned'}),
]);

/*
 * Exact Arabic labels confirmed in the real successful getorder response
 * (2026-10-19, order VNX-CLICK-TEST-20261019-d), in the owner's seven-state
 * list, and in the twelve states read from the provider's own client portal
 * (2026-10-18, client code 1603). Only exact labels are mapped; no numeric or
 * guessed carrier code is accepted.
 */
const CLICK_STATUS_LABELS = Object.freeze({
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

function clickDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Date.parse(value.trim() + 'Z');
  return Number.isFinite(parsed) ? { raw: value.trim(), ms: parsed } : null;
}

function clickNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Parses only the fields confirmed in the real getorder response. It never
 * assigns a financial meaning to the raw amounts and never invents a status
 * when the Arabic label is unknown.
 */
function parseClickOrderResponse(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, reason: 'invalid_payload' };
  const app = applicationError(json);
  if (app) return { ok: false, reason: 'application_error', message: app.Message };
  // The live "no data for this code" rejection uses a bare string envelope.
  if (typeof json.error === 'string' && json.error.trim()) return { ok: false, reason: 'application_error', message: json.error.trim() };
  const result = json.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { ok: false, reason: 'missing_result' };
  if (typeof result.Stat_App_Nm !== 'string' || !result.Stat_App_Nm.trim()) return { ok: false, reason: 'missing_status' };
  const rawStatus = result.Stat_App_Nm.trim();
  const shippingStatus = CLICK_STATUS_LABELS[rawStatus];
  if (!shippingStatus) return { ok: false, reason: 'unknown_status', rawStatus };
  const statusDate = clickDate(result.Status_Date);
  return {
    ok: true,
    rawStatus,
    shippingStatus,
    statusDate: statusDate ? statusDate.raw : null,
    statusDateMs: statusDate ? statusDate.ms : null,
    note: typeof result.Ord_Status_Note === 'string' ? result.Ord_Status_Note : null,
    amounts: {
      orderAmountDuo: clickNumber(result.Ord_Amt_Duo),
      shippingDiscount: clickNumber(result.Ord_Ship_Discount),
      willPay: clickNumber(result.Ord_Will_Pay_Amt),
    },
  };
}

module.exports = {
  ARABIC_INVALID_USER,
  ENGLISH_UNAUTHORIZED,
  classifyClickResponse,
  isInvalidCredentials,
  authFailureReason,
  CLICK_STATUS_LABELS,
  CLIENT_SHIPPING_VOCABULARY,
  PORTAL_STATUS_VOCABULARY,
  parseClickOrderResponse,
};
