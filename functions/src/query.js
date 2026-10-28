'use strict';
const {arabicDigits, documentId, STATUSES, ORDER_TYPES, JORDAN_CITIES}=require('./policy');
function normalizeCustomer(value) {
  return String(value||'').normalize('NFKC').toLocaleLowerCase('ar').trim()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ');
}
function searchDigits(value) { return arabicDigits(value).replace(/\D/g,''); }
// Dispatch-state filter groups exposed to the UI, mapping to concrete
// `dispatchState` values. Kept in one place so the client and server agree.
const DISPATCH_GROUPS = Object.freeze({
  idle: ['idle'],
  sending: ['sending'],
  sent: ['sent'],
  review: ['needs_review'],
});
function parseFilters(data={}) {
  const filters={status:data.status||null,bucket:data.bucket||'all',companyId:data.companyId||null,createdBy:data.createdBy||null,
    pageId:data.pageId||null,orderType:data.orderType||null,city:data.city||null,area:data.area||null,
    dispatch:data.dispatch||null,phone:null,barcode:null,product:null,note:null};
  if(filters.status&&!STATUSES.includes(filters.status))throw Error('invalid_status');
  if(!['all','delivery','internal'].includes(filters.bucket))throw Error('invalid_bucket');
  for(const key of ['companyId','createdBy'])if(filters[key])documentId(filters[key]);
  if(filters.pageId)documentId(filters.pageId);
  if(filters.orderType&&!ORDER_TYPES.includes(filters.orderType))throw Error('invalid_order_type');
  if(filters.city&&!JORDAN_CITIES.has(filters.city))throw Error('invalid_city');
  if(filters.area){filters.area=String(filters.area).trim().slice(0,120);if(!filters.area)filters.area=null;}
  if(filters.dispatch&&!Object.keys(DISPATCH_GROUPS).includes(filters.dispatch))throw Error('invalid_dispatch');
  const textFilter=(key,max)=>{
    const raw=data[key];
    if(raw==null||raw==='')return null;
    const value=String(raw).trim();
    if(!value||value.length>max)throw Error('invalid_'+key+'_filter');
    return value;
  };
  filters.barcode=textFilter('barcode',140);
  filters.product=textFilter('product',120);
  filters.note=textFilter('note',120);
  const rawPhone=textFilter('phone',30);
  if(rawPhone){filters.phone=searchDigits(rawPhone);if(filters.phone.length<3)throw Error('invalid_phone_filter');}
  for(const key of ['from','to','sentFrom','sentTo']) {
    if(data[key]!=null) {
      if(typeof data[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(data[key])||!Number.isFinite(Date.parse(data[key])))throw Error('invalid_date');
      filters[key]=new Date(data[key]);
    }
  }
  if(filters.from&&filters.to&&filters.from>=filters.to)throw Error('invalid_date_range');
  if(filters.sentFrom&&filters.sentTo&&filters.sentFrom>=filters.sentTo)throw Error('invalid_date_range');
  // Amount range in JOD (converted to integer fils). Only applied when the
  // caller is authorized to view amounts (enforced by the callable, not here).
  for(const key of ['amountMin','amountMax']) {
    if(data[key]!=null&&data[key]!=='') {
      const n=Number(arabicDigits(data[key]));
      if(!Number.isFinite(n)||n<0||n>1000000)throw Error('invalid_amount');
      filters[key]=Math.round(n*1000);
    }
  }
  if(filters.amountMin!=null&&filters.amountMax!=null&&filters.amountMin>filters.amountMax)throw Error('invalid_amount_range');
  return filters;
}
function applyFilters(query,filters) {
  if(filters.status)query=query.where('status','==',filters.status);
  if(filters.bucket!=='all')query=query.where('hasDelivery','==',filters.bucket==='delivery');
  if(filters.companyId)query=query.where('companyId','==',filters.companyId);
  if(filters.createdBy)query=query.where('createdBy','==',filters.createdBy);
  // pageId/orderType are pushed down (indexed with createdAt). city/area/amount
  // and the dispatch group are applied in-memory by matchingFilters to avoid an
  // index explosion; they only narrow an already-scoped, bounded page.
  if(filters.pageId)query=query.where('pageId','==',filters.pageId);
  if(filters.orderType)query=query.where('orderType','==',filters.orderType);
  if(filters.from)query=query.where('createdAt','>=',filters.from);
  if(filters.to)query=query.where('createdAt','<',filters.to);
  return query;
}
function matchingFilters(order,filters) {
  if(filters.status&&order.status!==filters.status)return false;
  if(filters.bucket==='delivery'&&!order.companyId)return false;
  if(filters.bucket==='internal'&&order.companyId)return false;
  if(filters.companyId&&order.companyId!==filters.companyId)return false;
  if(filters.createdBy&&order.createdBy!==filters.createdBy)return false;
  if(filters.pageId&&order.pageId!==filters.pageId)return false;
  if(filters.orderType&&(order.orderType||'normal')!==filters.orderType)return false;
  if(filters.city&&order.city!==filters.city)return false;
  if(filters.area&&!(String(order.area||'').includes(filters.area)))return false;
  if(filters.dispatch&&!DISPATCH_GROUPS[filters.dispatch].includes(order.dispatchState||'idle'))return false;
  if(filters.amountMin!=null&&(Number(order.amountMinor)||0)<filters.amountMin)return false;
  if(filters.amountMax!=null&&(Number(order.amountMinor)||0)>filters.amountMax)return false;
  // Independent free-text conditions (phone digits / barcode / product / note).
  if(filters.phone){
    // Each phone is matched independently. Concatenating primary+extra would
    // let a query made of the primary's tail and the extra's head match a
    // number that exists in neither field.
    const primary=String(order.phone||'').replace(/\D/g,'');
    const extra=String(order.extraPhone||'').replace(/\D/g,'');
    if(!primary.includes(filters.phone)&&!extra.includes(filters.phone))return false;
  }
  if(filters.barcode){
    const refs=(String(order.barcodeValue||'')+' '+String(order.orderNumber||'')).toUpperCase();
    if(!refs.includes(String(filters.barcode).toUpperCase()))return false;
  }
  if(filters.product&&!normalizeCustomer(order.description).includes(normalizeCustomer(filters.product)))return false;
  if(filters.note&&!normalizeCustomer(order.note).includes(normalizeCustomer(filters.note)))return false;
  const time=order.createdAt?.toDate?.()||order.createdAt;
  if(filters.from&&(!time||time<filters.from))return false;
  if(filters.to&&(!time||time>=filters.to))return false;
  // Dispatch (send-to-carrier) time is only written on successful/linked
  // shipments; legacy orders without sentAt do not match a dispatch date range.
  if(filters.sentFrom||filters.sentTo){
    const sent=order.sentAt?.toDate?.()||order.sentAt;
    if(!sent)return false;
    if(filters.sentFrom&&sent<filters.sentFrom)return false;
    if(filters.sentTo&&sent>=filters.sentTo)return false;
  }
  return true;
}
module.exports={normalizeCustomer,searchDigits,parseFilters,applyFilters,matchingFilters,DISPATCH_GROUPS};

