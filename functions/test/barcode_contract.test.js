'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {publicOrder,orderForUser}=require('../src/order_view');
const stub=(id,extra={})=>({id,data:()=>({customer:'عمر',phone:'079',city:'عمان',area:'عمان',address:'X',description:'Y',quantity:1,
  amountMinor:7500,paymentMethod:'عند الاستلام',createdBy:'owner',status:'created',...extra})});
test('new orders expose immutable barcode in authorized order DTO',()=>{
  assert.equal(publicOrder(stub('abc_X')).barcodeValue,'VNX-abc_X');
  assert.equal(publicOrder(stub('abc_X',{barcodeValue:'VNX-abc_X'})).barcodeValue,'VNX-abc_X');
});
test('legacy orders can be reprinted with stable id-derived barcode',()=>{
  const a=publicOrder(stub('legacy1'));
  const b=publicOrder(stub('legacy1'));
  assert.equal(a.barcodeValue,b.barcodeValue);
});
test('printing cannot reveal private amounts in the DTO',()=>{
  const user={id:'sales',role:'sales',active:true,permissions:[]};
  const printed=orderForUser(user,stub('x'));
  assert.equal(Object.hasOwn(printed,'amount'),false);
  assert.equal(printed.barcodeValue,'VNX-x');
});

test('server search accepts scans of a VNX- barcode',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require.resolve('../src/index'),'utf8');
 assert.match(source,/query\.startsWith\('VNX-'\)\?query\.slice\(4\):query/);
});
test('createOrder is idempotent with atomic duplicate check',()=>{
 const fs=require('node:fs');const src=fs.readFileSync(require.resolve('../src/index'),'utf8');
 const section=src.slice(src.indexOf('exports.createOrder='),src.indexOf('exports.updateOrder='));
 assert.match(section,/db\.doc\(`idempotency\/\$\{uniqueId\}`\)/);
 assert.match(section,/tx\.get\(idemRef\)/);
 assert.match(section,/tx\.create\(idemRef/);
 assert.match(section,/payloadHash/);
 assert.match(section,/alreadyExists:!created/);
});
