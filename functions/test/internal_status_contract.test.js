'use strict';
// Cross-layer contract: the internal status vocabulary must be identical, in the
// same order, between the Flutter app and the backend. If either list changes
// without the other, this test fails. It also pins the Arabic labels shown in the
// bulk dialog so a label cannot silently drift or be dropped.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {INTERNAL_CORRECTION_STATUSES}=require('../src/policy');

const dart=fs.readFileSync(path.resolve(__dirname,'../../lib/models/entities.dart'),'utf8');

function dartInternalList(){
  const m=/const\s+List<OrderStatus>\s+internalChangeableStatuses\s*=\s*\[([\s\S]*?)\];/.exec(dart);
  assert.ok(m,'internalChangeableStatuses list must exist in entities.dart');
  return [...m[1].matchAll(/OrderStatus\.(\w+)/g)].map(x=>x[1]);
}
function dartLabels(){
  // OrderStatusUI.label switch: match `OrderStatus.<name> => '<label>'`.
  const map={};
  for(const x of dart.matchAll(/OrderStatus\.(\w+)\s*=>\s*'([^']*)'/g))map[x[1]]=x[2];
  return map;
}

test('Flutter and backend internal status lists are identical and in the same order',()=>{
  const app=dartInternalList();
  const server=[...INTERNAL_CORRECTION_STATUSES];
  assert.deepEqual(app,server,'the app list and the backend list must match exactly (values and order)');
});

test('the internal vocabulary is exactly the six store statuses, never a carrier state',()=>{
  const app=dartInternalList();
  assert.deepEqual(app,['created','review','preparing','ready','delivered','cancelled']);
  for(const carrier of ['dispatched','inTransit','returned']){
    assert.ok(!app.includes(carrier),`${carrier} is a carrier/dispatch state and must not be an internal bulk target`);
  }
});

test('every internal status has a non-empty Arabic label in the app',()=>{
  const labels=dartLabels();
  const expected={
    created:'جديد',review:'قيد المراجعة',preparing:'قيد التجهيز',
    ready:'جاهز للتسليم',delivered:'تم التسليم',cancelled:'ملغي',
  };
  for(const status of dartInternalList()){
    assert.ok(labels[status]&&labels[status].trim().length>0,`${status} needs an Arabic label`);
    assert.equal(labels[status],expected[status],`${status} label drifted`);
  }
});
