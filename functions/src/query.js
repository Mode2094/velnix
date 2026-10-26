'use strict';
const {arabicDigits, documentId, STATUSES}=require('./policy');
function normalizeCustomer(value) {
  return String(value||'').normalize('NFKC').toLocaleLowerCase('ar').trim()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ');
}
function searchDigits(value) { return arabicDigits(value).replace(/\D/g,''); }
function parseFilters(data={}) {
  const filters={status:data.status||null,bucket:data.bucket||'all',companyId:data.companyId||null,createdBy:data.createdBy||null};
  if(filters.status&&!STATUSES.includes(filters.status))throw Error('invalid_status');
  if(!['all','delivery','internal'].includes(filters.bucket))throw Error('invalid_bucket');
  for(const key of ['companyId','createdBy'])if(filters[key])documentId(filters[key]);
  for(const key of ['from','to']) {
    if(data[key]!=null) {
      if(typeof data[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(data[key])||!Number.isFinite(Date.parse(data[key])))throw Error('invalid_date');
      filters[key]=new Date(data[key]);
    }
  }
  if(filters.from&&filters.to&&filters.from>=filters.to)throw Error('invalid_date_range');
  return filters;
}
function applyFilters(query,filters) {
  if(filters.status)query=query.where('status','==',filters.status);
  if(filters.bucket!=='all')query=query.where('hasDelivery','==',filters.bucket==='delivery');
  if(filters.companyId)query=query.where('companyId','==',filters.companyId);
  if(filters.createdBy)query=query.where('createdBy','==',filters.createdBy);
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
  const time=order.createdAt?.toDate?.()||order.createdAt;
  if(filters.from&&(!time||time<filters.from))return false;
  if(filters.to&&(!time||time>=filters.to))return false;
  return true;
}
module.exports={normalizeCustomer,searchDigits,parseFilters,applyFilters,matchingFilters};
