'use strict';
// Unit coverage for the derived free-text search index. The comprehensive
// search box must reach every human-searchable field a permitted user sees,
// while never exposing amounts through the index.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {buildSearchFields,normalizeSearch,STATUS_LABELS,SHIPPING_CODE_LABELS}=require('../src/search');

const order={
  customer:'سالم أحمد الطراونة', phone:'0790000001', extraPhone:'0790000002',
  description:'طقم شرعي أسود عدد 3', note:'اتصل قبل التسليم', city:'عمّان', area:'تلاع العلي',
  address:'شارع المدينة المنورة', orderNumber:'VNX-000123', barcodeValue:'VNX-abc123def',
  pageName:'صفحة الفيس بوك الرسمية', companyName:'أرامكس الأردن', createdByName:'منى القطب',
  clickOrderRef:'CLK-778899', providerOrderId:'556677', trackingNumber:'TRK-9911',
  status:'ready', internalStatus:'ready', shippingStatus:'outForDelivery', amountMinor:12500,
};

test('the index covers every searchable order field',()=>{
  const f=buildSearchFields(order);
  const text=`${f.searchText} ${f.searchTokens.join(' ')} ${f.searchPrefixes.join(' ')}`;
  const has=(needle)=>text.includes(normalizeSearch(needle));
  // recipient + product + place + source + refs + identifiers
  assert.ok(has('سالم'),'customer name');
  assert.ok(text.includes('0790000001'),'primary phone digits');
  assert.ok(text.includes('0790000002'),'extra phone digits');
  assert.ok(has('طقم شرعي'),'product/description');
  assert.ok(has('اتصل قبل'),'note');
  assert.ok(has('عمّان'),'city');
  assert.ok(has('تلاع العلي'),'area');
  assert.ok(has('المدينة المنورة'),'detailed address');
  assert.ok(has('VNX-000123'),'order number');
  assert.ok(text.includes('abc123def'),'barcode/order id');
  assert.ok(has('الفيس بوك'),'source page name');
  assert.ok(has('أرامكس'),'delivery company name');
  assert.ok(has('منى القطب'),'creator name');
  assert.ok(has('CLK-778899'),'shipment reference');
  assert.ok(text.includes('556677'),'carrier order id');
  assert.ok(text.includes('TRK-9911')||text.includes('trk'),'tracking number');
});

test('internal and carrier status labels are searchable',()=>{
  const f=buildSearchFields({...order});
  const text=`${f.searchText} ${f.searchTokens.join(' ')}`;
  assert.ok(text.includes(normalizeSearch(STATUS_LABELS.ready)),'internal status label');
  assert.ok(text.includes(normalizeSearch(SHIPPING_CODE_LABELS.outForDelivery)),'shipping status label');
});

test('amounts are deliberately never indexed',()=>{
  const f=buildSearchFields(order);
  const text=`${f.searchText} ${f.searchTokens.join(' ')} ${f.searchPrefixes.join(' ')} ${f.searchPhoneSuffixes.join(' ')}`;
  assert.ok(!text.includes('12500'),'raw amount value must not leak into the index');
  assert.ok(!text.includes('12.5'),'decimal amount must not leak into the index');
});

test('legacy orders without the new fields remain valid',()=>{
  const f=buildSearchFields({customer:'زبون',phone:'0790000000',orderNumber:'VNX-000001'});
  assert.ok(f.searchText.length>0);
  assert.equal(f.searchTokens.includes(''),false);
});
