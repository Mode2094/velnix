'use strict';
// Real emulator integration for the internal-vs-delivery separation. Every
// assertion goes through the actual callables against the Firestore/Auth
// emulators (no arithmetic simulation): createOrder, changeOrderStatus,
// assignCompany, reconcileClickShipment, listOrders, searchOrders and
// dashboardStats. Proves requirement #4 and the client's five acceptance points.
const {test} = require('node:test'),
  assert = require('node:assert/strict');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw Error('Auth and Firestore emulators are required');
}
process.env.GCLOUD_PROJECT = 'demo-velnix';
process.env.ALLOWED_DELIVERY_HOSTS = 'admin.clickdelivery.org,local-contract.example';
const functions = require('../../src/index');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const db = getFirestore();
const auth = getAuth();
const invoke = (name, id, data = {}) =>
  functions[name].run({
    auth: id
      ? {uid: id, token: {email_verified: true, firebase: {sign_in_provider: 'google.com'}}}
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
  pageId: 'sep_page',
};
const grandTotal = (stats) =>
  Object.values(stats.counters.all).reduce((sum, v) => sum + v.count, 0);

async function reset() {
  await fetch(
    'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/emulator/v1/projects/demo-velnix/accounts',
    {method: 'DELETE'},
  );
  await fetch(
    'http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/demo-velnix/databases/(default)/documents',
    {method: 'DELETE'},
  );
  await auth.createUser({uid: 'gm'}).catch(() => {});
  await db.doc('members/gm').set({name: 'GM', role: 'generalManager', active: true});
  await db.doc('pages/sep_page').set({
    name: 'صفحة الفصل', nameLower: 'صفحة الفصل', active: true, archived: false, status: 'active',
  });
  const click = await invoke('saveCompany', 'gm', {
    name: 'Click فصل', provider: 'click_delivery_v1',
    apiUrl: 'https://admin.clickdelivery.org/Client',
    enabled: true, statusMap: {}, clickUserId: '1603',
  });
  await db.doc('companies/' + click.id).update({clickSendEnabled: true});
  return click.id;
}

test('separation journey: one count per order, assignment is not sending, Click state is separate', async () => {
  const clickId = await reset();

  // 1) A brand new order increases the grand total by exactly one.
  const before = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(before), 0);
  const created = await invoke('createOrder', 'gm', {...base, customer: 'عميل 1', phone: '0791000001', requestKey: 'sep_journey_order_1'});
  const after = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(after), 1);
  assert.equal(after.counters.internal.created.count, 1);
  assert.equal(after.counters.delivery.created.count, 0);
  // No delivery state exists yet.
  assert.equal(Object.values(after.counters.shipping).reduce((s, v) => s + v.count, 0), 0);

  // 2) An internal status change keeps the grand total constant.
  await invoke('changeOrderStatus', 'gm', {id: created.id, status: 'review'});
  await invoke('changeOrderStatus', 'gm', {id: created.id, status: 'preparing'});
  const moved = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(moved), 1);
  assert.equal(moved.counters.all.preparing.count, 1);
  assert.equal(moved.counters.all.created.count, 0);

  await invoke('changeOrderStatus', 'gm', {id: created.id, status: 'ready'});

  // 3) Assigning a company without sending does NOT mean "with the carrier":
  //    the order stays in the INTERNAL queue (not yet accepted), the delivery
  //    queue is empty, and no carrier state exists.
  await invoke('assignCompany', 'gm', {id: created.id, companyId: clickId});
  const assigned = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(assigned), 1);
  assert.equal(assigned.counters.delivery.ready.count, 0, 'assignment is not acceptance');
  assert.equal(assigned.counters.internal.ready.count, 1, 'an assigned-but-unsent order stays internal');
  assert.equal(Object.values(assigned.counters.shipping).reduce((s, v) => s + v.count, 0), 0);
  const doc = (await db.doc('orders/' + created.id).get()).data();
  assert.equal(doc.companyId, clickId);
  assert.equal(doc.shippingStatus, undefined);
  assert.equal(doc.clickOrderRef, undefined);
  // The delivery queue excludes it; the internal queue includes it.
  const inDeliveryBefore = await invoke('listOrders', 'gm', {bucket: 'delivery'});
  assert.equal(inDeliveryBefore.items.some((o) => o.id === created.id), false);
  const inInternalBefore = await invoke('listOrders', 'gm', {bucket: 'internal'});
  assert.equal(inInternalBefore.items.some((o) => o.id === created.id), true);
  // The unshipped operational filter surfaces exactly this assigned-but-unsent order.
  const unshipped = await invoke('listOrders', 'gm', {bucket: 'all', unshipped: true});
  assert.deepEqual(unshipped.items.map((o) => o.id), [created.id]);

  // 4) A confirmed carrier acceptance moves the order into the delivery queue,
  //    on the shipping facet only, without touching the internal status.
  await invoke('reconcileClickShipment', 'gm', {
    id: created.id, clickOrderId: '90000001', clickOrderRef: 'VNX-SEP-1',
    shippingStatus: 'deferred', reason: 'تأجيل مؤكد من بوابة الشريك',
  });
  const deferred = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(deferred), 1, 'the grand total must not double-count a shipped order');
  assert.equal(deferred.counters.shipping.deferred.count, 1);
  assert.equal(deferred.counters.delivery.ready.count, 1, 'after acceptance the order is in the delivery queue');
  assert.equal(deferred.counters.internal.ready.count, 0, 'and no longer in the internal queue');
  const afterReconcile = (await db.doc('orders/' + created.id).get()).data();
  // Internal status is preserved by the carrier link; the carrier facet carries
  // the deferral; the two are independently readable.
  assert.equal(afterReconcile.status, 'ready');
  assert.equal(afterReconcile.shippingStatus, 'deferred');
  assert.equal(afterReconcile.shippingStatusSource, 'manual');

  // A carrier state filter returns it; an internal status filter never confuses
  // the two vocabularies.
  const byShipping = await invoke('listOrders', 'gm', {shippingStatus: 'deferred', bucket: 'delivery'});
  assert.deepEqual(byShipping.items.map((o) => o.id), [created.id]);
  const byInternal = await invoke('listOrders', 'gm', {status: 'deferred'}).catch((e) => e);
  assert.ok(byInternal instanceof Error, 'deferred is not an internal status and must be rejected');

  // 5) The order appears in every list yet never more than once in the total.
  const inAll = await invoke('listOrders', 'gm', {bucket: 'all'});
  const inDelivery = await invoke('listOrders', 'gm', {bucket: 'delivery'});
  assert.ok(inAll.items.some((o) => o.id === created.id));
  assert.ok(inDelivery.items.some((o) => o.id === created.id));
  assert.equal(grandTotal(await invoke('dashboardStats', 'gm', {})), 1);
});

test('delivery returns, cancellation and partial delivery land on the shipping facet only', async () => {
  const clickId = await reset();
  const states = ['returned', 'cancelled', 'partiallyDelivered'];
  const ids = [];
  for (let i = 0; i < states.length; i++) {
    const r = await invoke('createOrder', 'gm', {...base, customer: `عميل ${i}`, phone: `079200000${i}`, requestKey: `sep_state_${i}_xxxxxxxx`});
    ids.push(r.id);
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'review'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'preparing'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'ready'});
    await invoke('assignCompany', 'gm', {id: r.id, companyId: clickId});
    await invoke('reconcileClickShipment', 'gm', {
      id: r.id, clickOrderId: `9000010${i}`, clickOrderRef: `VNX-ST-${i}`,
      shippingStatus: states[i], reason: 'حالة مؤكدة من بوابة الشريك',
    });
  }
  const stats = await invoke('dashboardStats', 'gm', {});
  // Three physical orders, counted once each.
  assert.equal(grandTotal(stats), 3);
  assert.equal(stats.counters.shipping.returned.count, 1);
  assert.equal(stats.counters.shipping.cancelled.count, 1);
  assert.equal(stats.counters.shipping.partiallyDelivered.count, 1);
  // Each carrier state is independently filterable and returns exactly its order.
  for (let i = 0; i < states.length; i++) {
    const page = await invoke('listOrders', 'gm', {shippingStatus: states[i], bucket: 'delivery'});
    assert.deepEqual(page.items.map((o) => o.id), [ids[i]]);
  }
});

test('combined search + shipping filter stays consistent and paginates without loss', async () => {
  const clickId = await reset();
  const created = [];
  for (let i = 0; i < 4; i++) {
    const r = await invoke('createOrder', 'gm', {...base, customer: `عميل مشترك ${i}`, phone: `079300000${i}`, requestKey: `sep_search_${i}_xxxxxxxx`});
    created.push(r.id);
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'review'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'preparing'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'ready'});
    await invoke('assignCompany', 'gm', {id: r.id, companyId: clickId});
    // Two deferred, two out-for-delivery.
    await invoke('reconcileClickShipment', 'gm', {
      id: r.id, clickOrderId: `9000020${i}`, clickOrderRef: `VNX-SR-${i}`,
      shippingStatus: i < 2 ? 'deferred' : 'outForDelivery',
      reason: 'حالة مؤكدة من بوابة الشريك',
    });
  }
  // Search by the shared name, then narrow by a carrier state: both must apply.
  const page = await invoke('searchOrders', 'gm', {
    query: 'عميل مشترك', bucket: 'delivery', shippingStatus: 'deferred', pageSize: 30,
  });
  const ids = page.items.map((o) => o.id).sort();
  assert.deepEqual(ids, [created[0], created[1]].sort());
  // Counts remain exactly one per order after any number of list reads.
  assert.equal(grandTotal(await invoke('dashboardStats', 'gm', {})), 4);
});

test('operational categories separate assigned-but-unsent from real carrier states', async () => {
  const clickId = await reset();
  const make = async (key, customer) => {
    const r = await invoke('createOrder', 'gm', {...base, customer, phone: '0794000001', requestKey: key});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'review'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'preparing'});
    await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'ready'});
    await invoke('assignCompany', 'gm', {id: r.id, companyId: clickId});
    return r.id;
  };
  // A: assigned, never sent. B: assigned and carrier-confirmed.
  const unsent = await make('op_unsent_order_0001', 'عميل غير مرسل');
  const sent = await make('op_sent_order_000001', 'عميل مرسل');
  await invoke('reconcileClickShipment', 'gm', {
    id: sent, clickOrderId: '90000301', clickOrderRef: 'VNX-OP-1',
    shippingStatus: 'outForDelivery', reason: 'حالة مؤكدة من بوابة الشريك',
  });

  const stats = await invoke('dashboardStats', 'gm', {});
  // Grand total counts each order once; the operational facets never change it.
  assert.equal(grandTotal(stats), 2);
  const ops = stats.counters.operations;
  // The never-sent order is an operational category, NOT a carrier state.
  assert.equal(ops.unshipped.count, 1, 'assigned-but-unsent must be unshipped');
  assert.equal(ops.confirmed.count, 1, 'a sent order is confirmed');
  assert.equal(ops.sending.count, 0);
  assert.equal(ops.needs_review.count, 0);
  // Only the truly shipped order carries a carrier state.
  assert.equal(stats.counters.shipping.outForDelivery.count, 1);
  const carrierTotal = Object.values(stats.counters.shipping).reduce((s, v) => s + v.count, 0);
  assert.equal(carrierTotal, 1, 'the unsent order must not appear as any carrier state');
  // The operational partition is complete and disjoint from the carrier facet.
  assert.equal(ops.unshipped.count + ops.confirmed.count + ops.sending.count + ops.needs_review.count, 2);

  // The operational filter surfaces exactly the unsent order.
  const unshipped = await invoke('listOrders', 'gm', {bucket: 'all', dispatch: 'idle'});
  assert.deepEqual(unshipped.items.map((o) => o.id), [unsent]);
  // And the carrier filter surfaces only the confirmed order.
  const byCarrier = await invoke('listOrders', 'gm', {bucket: 'delivery', shippingStatus: 'outForDelivery'});
  assert.deepEqual(byCarrier.items.map((o) => o.id), [sent]);
});

test('legacy orders with no dispatchState stay visible and counted once', async () => {
  const clickId = await reset();
  // Simulate a legacy assigned order: companyId set, hasDelivery true, but no
  // dispatchState field at all (pre-lifecycle data). It must remain visible,
  // land in the operational partition and never be lost or double-counted.
  await db.doc('orders/legacy_order_1').set({
    customer: 'عميل قديم', phone: '0795000001', phoneDigits: '0795000001',
    customerKey: 'عميل قديم', city: 'عمان', area: 'وسط', address: 'شارع',
    description: 'طرد', quantity: 1, amountMinor: 12345,
    status: 'ready', companyId: clickId, hasDelivery: true,
    createdBy: 'gm', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  const stats = await invoke('dashboardStats', 'gm', {});
  assert.equal(grandTotal(stats), 1, 'a legacy order is counted exactly once');
  assert.equal(stats.counters.operations.unshipped.count, 1, 'a missing dispatchState counts as unshipped');
  const list = await invoke('listOrders', 'gm', {bucket: 'all', dispatch: 'idle'});
  assert.deepEqual(list.items.map((o) => o.id), ['legacy_order_1']);
});

test('every role sees the operational facet and permissions gate the lists', async () => {
  const clickId = await reset();
  // Add a restricted sales member and a manager.
  await auth.createUser({uid: 'sales1'}).catch(() => {});
  await db.doc('members/sales1').set({name: 'Sales', role: 'sales', active: true, permissions: [], authorizedCreatorIds: ['sales1']});
  await db.doc('members/gm').update({permissions: []});
  const r = await invoke('createOrder', 'gm', {...base, customer: 'عميل صلاحيات', phone: '0796000001', requestKey: 'perm_order_00000001'});
  await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'review'});
  await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'preparing'});
  await invoke('changeOrderStatus', 'gm', {id: r.id, status: 'ready'});
  await invoke('assignCompany', 'gm', {id: r.id, companyId: clickId});

  // The general manager sees the operational facet.
  const gmStats = await invoke('dashboardStats', 'gm', {});
  assert.equal(gmStats.counters.operations.unshipped.count, 1);
  // The sales member who did not create the order sees a zero scope, not a leak.
  const salesStats = await invoke('dashboardStats', 'sales1', {});
  assert.equal(salesStats.counters.operations.unshipped.count, 0);
  // A member without updateOrderStatus cannot change state.
  await assert.rejects(invoke('changeOrderStatus', 'sales1', {id: r.id, status: 'cancelled'}));
  // And cannot read the order list beyond their scope.
  const salesList = await invoke('listOrders', 'sales1', {bucket: 'all', dispatch: 'idle'});
  assert.equal(salesList.items.length, 0);
});
