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
 * Consequences encoded here:
 *   1. There are two distinct error envelopes: an application envelope wrapped
 *      in `error`, and a framework envelope that is a bare `Message`.
 *   2. Authentication is evaluated before payload validation on the read paths,
 *      so a caller learns nothing about a payload until it authenticates.
 *   3. No success schema has ever been supplied by the provider. Therefore this
 *      module NEVER classifies a response as success - an unrecognised body is
 *      reported as unverified rather than assumed to be data.
 */

const ARABIC_INVALID_USER = 'بيانات مستخدم غير صحيحة';

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

module.exports = {
  ARABIC_INVALID_USER,
  classifyClickResponse,
  isInvalidCredentials,
  CLIENT_SHIPPING_VOCABULARY,
  PORTAL_STATUS_VOCABULARY,
};
