'use strict';
const {test} = require('node:test'),
  assert = require('node:assert/strict');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw Error('Auth and Firestore emulators are required');
}
process.env.GCLOUD_PROJECT = 'demo-velnix';
const functions = require('../../src/index');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const db = getFirestore();
const auth = getAuth();
const invoke = (name, id, data = {}) =>
  functions[name].run({
    auth: id
      ? {
          uid: id,
          token: {email_verified: true, firebase: {sign_in_provider: 'google.com'}},
        }
      : null,
    data,
  });

const base = {
  city: 'عمان',
  area: 'وسط',
  address: 'شارع',
  description: 'طرد',
  quantity: 1,
  amount: '12.345',
  paymentMethod: 'عند الاستلام',
  pageId: 'search_page',
};

test('search and filters journey: number, name, phone, click ref and combined', async () => {
  // Self-contained: reset so the journey is order-independent across the suite.
  await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/accounts',{method:'DELETE'});
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-velnix/databases/(default)/documents',{method:'DELETE'});
  await auth.createUser({uid: 'gm'}).catch(() => {});
  await db.doc('members/gm').set({name: 'GM', role: 'generalManager', active: true});
  await db.doc('pages/search_page').set({name: 'صفحة البحث', nameLower: 'صفحة البحث', active: true, archived: false, status: 'active'});

  const created = [];
  for (let i = 0; i < 3; i++) {
    const r = await invoke('createOrder', 'gm', {
      ...base,
      customer: `عميل مميز ${i}`,
      phone: `079100000${i}`,
      requestKey: `search_filters_journey_${i}`,
    });
    created.push(r.id);
  }
  const [firstId] = created;
  const first = (await db.doc('orders/' + firstId).get()).data();
  await db.doc('orders/' + firstId).update({
    clickOrderRef: 'CLICKREF-9001',
    trackingNumber: 'TRK-123456',
  });

  const byNumber = await invoke('searchOrders', 'gm', {
    query: first.orderNumber,
  });
  assert.ok(
    byNumber.items.some(x => x.id === firstId),
    'search by VNX order number finds the order',
  );

  const byNameExact = await invoke('searchOrders', 'gm', {query: 'عميل مميز 0'});
  assert.ok(byNameExact.items.some(x => x.id === firstId), 'exact name');

  const byNamePartial = await invoke('searchOrders', 'gm', {query: 'عميل مم'});
  assert.ok(
    byNamePartial.items.some(x => x.id === firstId),
    'partial Arabic prefix name matches',
  );

  const byPhone = await invoke('searchOrders', 'gm', {query: '0791000000'});
  assert.ok(byPhone.items.some(x => x.id === firstId), 'phone');

  const byMissing = await invoke('searchOrders', 'gm', {query: 'VNX-999999'});
  assert.equal(byMissing.items.length, 0, 'missing number returns nothing');

  // Combined: query + status filter
  const combinedStatus = await invoke('searchOrders', 'gm', {
    query: 'عميل مميز',
    status: 'created',
  });
  assert.equal(combinedStatus.items.length, 3, 'name + status combined');

  const mismatchedStatus = await invoke('searchOrders', 'gm', {
    query: 'عميل مميز',
    status: 'delivered',
  });
  assert.equal(mismatchedStatus.items.length, 0, 'name + wrong status = none');

  // Combined: query + bucket internal
  const internal = await invoke('searchOrders', 'gm', {
    query: 'عميل مميز',
    bucket: 'internal',
  });
  assert.equal(internal.items.length, 3, 'name + internal bucket');

  // Combined: query + date range that includes and excludes
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const inRange = await invoke('searchOrders', 'gm', {
    query: 'عميل مميز',
    from: yesterday,
    to: tomorrow,
  });
  assert.equal(inRange.items.length, 3, 'name + date window includes recent');

  const outOfRange = await invoke('searchOrders', 'gm', {
    query: 'عميل مميز',
    from: tomorrow,
    to: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
  });
  assert.equal(outOfRange.items.length, 0, 'name + future window excludes');

  // listOrders with the same combined filters must respect them (pagination)
  const list = await invoke('listOrders', 'gm', {
    status: 'created',
    bucket: 'internal',
    pageSize: 30,
  });
  assert.equal(list.items.length, 3, 'listOrders respects combined filters');
});
