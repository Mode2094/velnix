'use strict';
const ROLES = ['generalManager','manager','warehouse','sales','dataEntry'];
const STATUSES = ['created','review','preparing','ready','dispatched','inTransit','delivered','returned','cancelled'];
// Business intent of an order. Kept separate from STATUSES (operational state)
// and from Click shipment states; only 'normal' maps to a plain Click setorder.
const ORDER_TYPES = ['normal','return','exchange','partial_receipt'];
const PERMISSIONS = ['viewAllOrders','editAllOrders','updateOrderStatus','sendToDelivery','viewReports','viewAmounts','manageEmployees','manageCompanies','managePages','viewSync','viewAudit','manageSettings'];
const JORDAN_CITIES = new Set(['عمان','عمّان','إربد','الزرقاء','البلقاء','المفرق','جرش','عجلون','مادبا','الكرك','الطفيلة','معان','العقبة','الأغوار الشمالية','الأغوار الجنوبية']);
const CLOSED = new Set(['delivered','returned','cancelled']);
const REMOTE = new Set(['inTransit','delivered','returned']);
const TRANSITIONS = Object.freeze({
  created:['review','cancelled'], review:['preparing','cancelled'],
  preparing:['ready','cancelled'], ready:['delivered','cancelled'], dispatched:[],
  inTransit:[], delivered:[], returned:[], cancelled:[],
});
function can(user, perm) {return !!(user && user.active === true && (user.role === 'generalManager' || (Array.isArray(user.permissions)&&user.permissions.includes(perm))));}
function validRole(role) {return ROLES.includes(role);}
function validPermissions(perms) {return Array.isArray(perms) && perms.length <= PERMISSIONS.length && perms.every(p=>PERMISSIONS.includes(p));}
function canSeeOrder(user, order) {
  if (!user || user.active !== true) return false;
  if (user.role === 'generalManager' || user.role === 'warehouse' || can(user,'viewAllOrders')) return true;
  return order.createdBy === user.id || (user.role === 'sales' && (Array.isArray(user.authorizedCreatorIds)?user.authorizedCreatorIds.includes(order.createdBy):order.salesSupervisorId === user.id));
}
function canEditOrder(user, order) {
  if (!canSeeOrder(user, order) || !['created','review','preparing','ready'].includes(order.status) || dispatchBlocked(order)) return false;
  if (can(user, 'editAllOrders')) return true;
  return order.createdBy === user.id && ['created','review'].includes(order.status);
}
function allowedTransition(user, order, target) {
  if (!STATUSES.includes(target) || !canSeeOrder(user, order) || dispatchBlocked(order)) return false;
  if (!can(user,'updateOrderStatus') && !['generalManager','warehouse'].includes(user.role)) return false;
  if (target === 'delivered' && (order.status !== 'ready' || order.companyId || order.hasDelivery === true || order.trackingNumber || order.remoteStatus)) return false;
  return (TRANSITIONS[order.status] || []).includes(target);
}
function arabicDigits(value) {
  return String(value??'').replace(/[٠-٩۰-۹]/g,ch=>{
    const code=ch.charCodeAt(0);return String.fromCharCode(48+ (code>=0x6f0 ? code-0x6f0 : code-0x660));
  }).replace(/٫/g,'.');
}
function moneyMinor(value) {
  // Jordanian dinar has 3 decimal units (fils), keep an integer in Firestore.
  if (!['string','number'].includes(typeof value) || !/^\d+(?:\.\d{1,3})?$/.test(arabicDigits(value).trim())) throw new Error('invalid_amount');
  const n = Number(arabicDigits(value));
  if (!Number.isFinite(n) || n < 0 || n > 1000000) throw new Error('invalid_amount');
  return Math.round(n * 1000);
}
function validateOrderFields(data, {legacyCity=null} = {}) {
  const text = (key, max, required=true) => {
    const v = typeof data[key] === 'string' ? data[key].trim() : '';
    if (v.length > max || (required && !v)) throw new Error(`invalid_${key}`);
    return v;
  };
  const customer=text('customer',120), phone=text('phone',30), city=text('city',80),
    // The detailed street address is optional per the client form; the shipper
    // address is composed from city/area/address only when it is present.
    area=text('area',120), address=text('address',240,false), description=text('description',500);
  if(!JORDAN_CITIES.has(city) && city!==legacyCity) throw new Error('invalid_city');
  const extraPhone=text('extraPhone',30,false), note=text('note',600,false);
  // Quantity is hidden in the client form; the data field is retained for the
  // Click contract and defaults to 1 when the form does not send one.
  const rawQuantity = data.quantity == null || data.quantity === '' ? 1 : data.quantity;
  if (!['string','number'].includes(typeof rawQuantity)) throw new Error('invalid_quantity');
  const quantity = Number(arabicDigits(rawQuantity));
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('invalid_quantity');
  // English digits only, exactly 10, for both the primary and the optional phone.
  const phonePattern=/^[0-9]{10}$/;
  const cleanPhone=phone.replace(/[^0-9]/g,'');
  const cleanExtra=extraPhone.replace(/[^0-9]/g,'');
  // Reject any non-English/extra characters so the stored value is exactly 10 English digits.
  if (phone.replace(/[ ()-]/g,'') !== cleanPhone || !phonePattern.test(cleanPhone)) throw new Error('invalid_phone');
  // An empty extra phone is allowed; anything else must be 10 English digits.
  const extraRaw=extraPhone.replace(/[ ()-]/g,'');
  if (extraRaw !== '' && (extraRaw !== cleanExtra || !phonePattern.test(cleanExtra))) throw new Error('invalid_phone');
  const paymentMethod=text('paymentMethod',40,false)||'عند الاستلام';
  if (!['عند الاستلام','مدفوع مسبقاً'].includes(paymentMethod)) throw new Error('invalid_paymentMethod');
  const orderType=text('orderType',40,false)||'normal';
  if(!ORDER_TYPES.includes(orderType)) throw new Error('invalid_order_type');
  return {customer,phone:cleanPhone,city,area,address,description,extraPhone:cleanExtra,note,quantity,amountMinor:moneyMinor(data.amount),paymentMethod,orderType};
}
function validOrderType(value) { return ORDER_TYPES.includes(value); }
// Organization "electronic pages" (Facebook pages the client receives orders on).
// Only name is mandatory; the rest are optional free text/URLs.
function validatePageFields(data={}) {
  const text = (key, max, required=false) => {
    const v = typeof data[key] === 'string' ? data[key].trim() : '';
    if (v.length > max || (required && !v)) throw new Error(`invalid_${key}`);
    return v;
  };
  const name = text('name', 120, true);
  const facebookUrl = text('facebookUrl', 300, false);
  if (facebookUrl && !/^https?:\/\/[^\s]+$/i.test(facebookUrl)) throw new Error('invalid_page_url');
  const logoPath = text('logoPath', 400, false);
  const phone = text('phone', 30, false);
  const whatsapp = text('whatsapp', 30, false);
  const note = text('note', 600, false);
  const cleanDigits = v => v.replace(/[^0-9]/g, '');
  const phoneDigits = cleanDigits(phone), whatsappDigits = cleanDigits(whatsapp);
  if (phone && phoneDigits.length < 7) throw new Error('invalid_page_phone');
  if (whatsapp && whatsappDigits.length < 7) throw new Error('invalid_page_whatsapp');
  return {name, facebookUrl, logoPath, phone, whatsapp, note, phoneDigits, whatsappDigits};
}
function safeStatusMap(obj) {
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid_status_map');
  const entries = Object.entries(obj);
  if(entries.length > 100) throw new Error('invalid_status_map');
  const map={};
  for(const [key,val] of entries) {
    if(key.length > 80 || !/^[a-zA-Z0-9_.-]{1,80}$/.test(key) || ['__proto__','constructor','prototype'].includes(key) || !['inTransit','delivered','returned','cancelled'].includes(val)) throw new Error('invalid_status_map');
    map[key] = val;
  }
  return map;
}
function dispatchBlocked(order) { return ['sending','sent','needs_review'].includes(order?.dispatchState); }
function canResolveDispatch(order, now=Date.now()) {
  return order?.status==='ready' && (order.dispatchState==='needs_review' ||
    (order.dispatchState==='sending' && Number.isFinite(order.dispatchLockUntil?.toMillis?.()) && order.dispatchLockUntil.toMillis()<=now));
}
function documentId(value) {
  if (typeof value!=='string' || !/^[a-zA-Z0-9_-]{1,140}$/.test(value)) throw new Error('invalid_document_id');
  return value;
}
module.exports={ROLES,STATUSES,ORDER_TYPES,PERMISSIONS,CLOSED,REMOTE,TRANSITIONS,JORDAN_CITIES,can,canSeeOrder,canEditOrder,allowedTransition,validRole,validPermissions,validOrderType,validateOrderFields,validatePageFields,safeStatusMap,arabicDigits,dispatchBlocked,canResolveDispatch,documentId};
