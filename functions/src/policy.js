'use strict';
const ROLES = ['generalManager','manager','warehouse','sales','dataEntry'];
const STATUSES = ['created','review','preparing','ready','dispatched','inTransit','delivered','returned','cancelled'];
const PERMISSIONS = ['viewAllOrders','editAllOrders','updateOrderStatus','sendToDelivery','viewReports','viewAmounts','manageEmployees','manageCompanies','viewSync','viewAudit','manageSettings'];
const CLOSED = new Set(['delivered','returned','cancelled']);
const REMOTE = new Set(['inTransit','delivered','returned']);
const TRANSITIONS = Object.freeze({
  created:['review','cancelled'], review:['preparing','cancelled'],
  preparing:['ready','cancelled'], ready:[], dispatched:[],
  inTransit:[], delivered:[], returned:[], cancelled:[],
});
function can(user, perm) {return !!(user && user.active !== false && (user.role === 'generalManager' || (user.permissions || []).includes(perm)));}
function validRole(role) {return ROLES.includes(role);}
function validPermissions(perms) {return Array.isArray(perms) && perms.length <= PERMISSIONS.length && perms.every(p=>PERMISSIONS.includes(p));}
function canSeeOrder(user, order) {
  if (!user || user.active === false) return false;
  if (user.role === 'generalManager' || user.role === 'warehouse' || can(user,'viewAllOrders')) return true;
  return order.createdBy === user.id || (user.role === 'sales' && order.salesSupervisorId === user.id);
}
function canEditOrder(user, order) {
  if (!canSeeOrder(user, order) || CLOSED.has(order.status)) return false;
  if (can(user, 'editAllOrders')) return true;
  return order.createdBy === user.id && ['created','review'].includes(order.status);
}
function allowedTransition(user, order, target) {
  if (!STATUSES.includes(target) || !canSeeOrder(user, order)) return false;
  if (!can(user,'updateOrderStatus') && !['generalManager','warehouse'].includes(user.role)) return false;
  return (TRANSITIONS[order.status] || []).includes(target);
}
function arabicDigits(value) {
  return String(value??'').replace(/[٠-٩۰-۹]/g,ch=>{
    const code=ch.charCodeAt(0);return String.fromCharCode(48+ (code>=0x6f0 ? code-0x6f0 : code-0x660));
  }).replace(/٫/g,'.');
}
function moneyMinor(value) {
  // Jordanian dinar has 3 decimal units (fils), keep an integer in Firestore.
  const n = Number(arabicDigits(value));
  if (!Number.isFinite(n) || n < 0 || n > 1000000) throw new Error('invalid_amount');
  return Math.round(n * 1000);
}
function validateOrderFields(data) {
  const text = (key, max, required=true) => {
    const v = typeof data[key] === 'string' ? data[key].trim() : '';
    if (v.length > max || (required && !v)) throw new Error(`invalid_${key}`);
    return v;
  };
  const customer=text('customer',120), phone=arabicDigits(text('phone',30)), city=text('city',80),
    area=text('area',120), address=text('address',240), description=text('description',500);
  const extraPhone=text('extraPhone',30,false), note=text('note',600,false);
  const quantity = Number(arabicDigits(data.quantity));
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('invalid_quantity');
  if (!/^[+0-9 ()\-]{7,30}$/.test(phone)) throw new Error('invalid_phone');
  return {customer,phone,city,area,address,description,extraPhone,note,quantity,amountMinor:moneyMinor(data.amount),paymentMethod: text('paymentMethod',40,false)||'عند الاستلام'};
}
function safeStatusMap(obj) {
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid_status_map');
  const entries = Object.entries(obj);
  if(entries.length > 100) throw new Error('invalid_status_map');
  const map={};
  for(const [key,val] of entries) {
    if(key.length > 80 || !/^[a-zA-Z0-9_.-]{1,80}$/.test(key) || !STATUSES.includes(val)) throw new Error('invalid_status_map');
    map[key] = val;
  }
  return map;
}
module.exports={ROLES,STATUSES,PERMISSIONS,CLOSED,REMOTE,TRANSITIONS,can,canSeeOrder,canEditOrder,allowedTransition,validRole,validPermissions,validateOrderFields,safeStatusMap,arabicDigits};
