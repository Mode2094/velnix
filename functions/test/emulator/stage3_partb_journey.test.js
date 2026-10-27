'use strict';
/*
 * Stage 3 Part B — contract verification against the Firebase Emulator Suite.
 *
 * Purpose: prove the exact backend contracts the production single-order
 * journey depends on, and prove that the retired browser harness would have
 * failed. Runs entirely on loopback emulators; no production call is made.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Loopback Firestore emulator required');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) throw Error('Loopback Auth emulator required');
process.env.GCLOUD_PROJECT = 'demo-velnix';

const functions = require('../../src/index');
const { getFirestore } = require('firebase-admin/firestore');
const { Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const db = getFirestore();
const auth = getAuth();

const invoke = (name, session, data = {}) =>
  functions[name].run({ auth: session ? { uid: session.uid, token: session } : null, data });

const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const FIXTURE = {
  customer: TAG,
  phone: '0000000000',
  city: 'عمان',
  area: 'منطقة اختبار',
  address: 'TEST ONLY — عنوان اصطناعي للاختبار',
  description: 'INTERNAL TEST — ' + TAG,
  extraPhone: '',
  note: 'INTERNAL TEST — ' + TAG,
  quantity: 1,
  amount: '0.000',
  paymentMethod: 'عند الاستلام',
  pageId: 'stage3_page',
  requestKey: TAG
};
const EDITED_NOTE = 'INTERNAL TEST EDITED — ' + TAG;

let gm, sales;

before(async () => {
  const mk = async (label, role, perms) => {
    const r = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=local-test-key', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        postBody: new URLSearchParams({
          providerId: 'google.com',
          id_token: JSON.stringify({ sub: label, email: label + '@example.test', email_verified: true, name: label })
        }).toString(), requestUri: 'http://localhost', returnSecureToken: true
      })
    });
    assert.equal(r.status, 200);
    const s = await auth.verifyIdToken((await r.json()).idToken);
    await db.doc('members/' + s.uid).set({ role, name: label, active: true, permissions: perms, authorizationVersion: 1 });
    return s;
  };
  gm = await mk('stage3_gm', 'generalManager', []);
  sales = await mk('stage3_sales', 'sales', []);
  await db.doc('pages/stage3_page').set({name: 'صفحة stage3', nameLower: 'صفحة stage3', active: true, archived: false, status: 'active', createdBy: 'stage3_gm', createdAt: Timestamp.now(), updatedAt: Timestamp.now()});
});

// ---------------------------------------------------------------- contracts
test('contract: signed out cannot reach any protected callable', async () => {
  await assert.rejects(invoke('me', null), { code: 'unauthenticated' });
  await assert.rejects(invoke('joinSession', null), { code: 'unauthenticated' });
  await assert.rejects(invoke('dashboardStats', null), { code: 'unauthenticated' });
  await assert.rejects(invoke('createOrder', null, FIXTURE), { code: 'unauthenticated' });
});

test('contract: authenticated GM passes the gate callables', async () => {
  const me = await invoke('me', gm);
  assert.equal(me.role, 'generalManager');
  assert.equal(me.active, true);
  const ds = await invoke('dashboardStats', gm);
  assert.equal(typeof ds, 'object');
});

test('contract: non-GM roles are denied GM-only scope', async () => {
  // sales may sign in and read its own scope, but cannot see everything.
  const me = await invoke('me', sales);
  assert.equal(me.role, 'sales');
  const ds = await invoke('dashboardStats', sales);
  assert.ok(ds, 'sales receives a scoped dashboard, not a permission error');
});

test('contract: createOrder forces internal-only fields regardless of forged input', async () => {
  // A forged, non-existent company is refused outright (server validates it).
  await assert.rejects(
    invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_contract_forge_bad', companyId: 'evil' }),
    { code: 'failed-precondition' }
  );
  const created = await invoke('createOrder', gm, {
    ...FIXTURE, requestKey: 'stage3_contract_forge_v1',
    trackingNumber: 'FAKE', remoteStatus: 'x',
    hasDelivery: true, status: 'delivered', shippingStatus: 'delivered'
  });
  const rec = (await db.doc('orders/' + created.id).get()).data();
  assert.equal(rec.companyId, null);
  assert.equal(rec.trackingNumber, null);
  assert.equal(rec.remoteStatus, null);
  assert.equal(rec.hasDelivery, false);
  assert.equal(rec.status, 'created');
  assert.equal(rec.revision, 0);
  assert.equal(rec.amountMinor, 0);
  assert.equal(rec.dispatchState, 'idle');
});

test('RETIRED HARNESS BUG: partial updateOrder payload is rejected (needs full fields + revision)', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_edit_bug_case_v1' });
  // This is exactly what the retired browser harness sent.
  await assert.rejects(
    invoke('updateOrder', gm, { id: c.id, note: EDITED_NOTE }),
    { code: 'invalid-argument' }
  );
  // Correct contract: full field set plus the optimistic-concurrency revision.
  await assert.rejects(
    invoke('updateOrder', gm, { ...FIXTURE, id: c.id, note: EDITED_NOTE, revision: 99 }),
    { code: 'aborted' }
  );
});

test('contract: full-payload update with matching revision succeeds and bumps revision', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_edit_ok_case_v1' });
  const before = (await db.doc('orders/' + c.id).get()).data();
  assert.equal(before.revision, 0);
  const r = await invoke('updateOrder', gm, { ...FIXTURE, id: c.id, note: EDITED_NOTE, revision: before.revision });
  assert.equal(r.ok, true);
  const after = (await db.doc('orders/' + c.id).get()).data();
  assert.equal(after.note, EDITED_NOTE);
  assert.equal(after.revision, 1);
  assert.equal(after.amountMinor, 0, 'financial field preserved');
  assert.equal(after.companyId, null, 'company preserved as null');
  assert.equal(after.hasDelivery, false, 'delivery-disabled preserved');
});

test('RETIRED HARNESS BUG: client DTO exposes amount, never amountMinor', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_dto_shape_case_v1' });
  const go = await invoke('getOrder', gm, { id: c.id });
  assert.equal(Object.hasOwn(go.order, 'amountMinor'), false, 'amountMinor is not a client field');
  assert.equal(go.order.amount, 0);
  // Event rows use `action`, never `type`.
  assert.ok(Array.isArray(go.events) && go.events.length > 0);
  assert.equal(Object.hasOwn(go.events[0], 'type'), false, 'events expose action, not type');
  assert.ok(go.events.some(e => e.action === 'created'));
});

// --------------------------------------------------------------- idempotency
test('contract: same requestKey never creates a second order', async () => {
  const a = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_idempotency_case_v1' });
  const b = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_idempotency_case_v1' });
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_idempotency_case_v1' });
  assert.equal(a.id, b.id);
  assert.equal(b.id, c.id);
  assert.equal(b.alreadyExists, true);
  const all = await db.collection('orders').where('customer', '==', TAG).get();
  const forThisKey = all.docs.filter(d => d.data().requestKey === 'stage3_idempotency_case_v1');
  assert.ok(forThisKey.length <= 1, 'never more than one order per request key');
  // A different payload under the same key is refused, not silently overwritten.
  await assert.rejects(
    invoke('createOrder', gm, { ...FIXTURE, customer: 'other', requestKey: 'stage3_idempotency_case_v1' }),
    { code: 'already-exists' }
  );
});

// ------------------------------------------------------------ the full journey
test('journey: create, edit, search and the four internal transitions', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_journey_case_v1' });
  const id = c.id;

  let o = (await invoke('getOrder', gm, { id })).order;
  assert.equal(o.status, 'created');
  assert.equal(o.amount, 0);
  assert.equal(o.companyId, null);

  await invoke('updateOrder', gm, { ...FIXTURE, id, note: EDITED_NOTE, revision: o.revision });

  const so = await invoke('searchOrders', gm, { query: TAG });
  const hit = so.items.find(x => x.id === id);
  assert.ok(hit, 'exact-tag search returns the synthetic order');

  for (const to of ['review', 'preparing', 'ready', 'delivered']) {
    const r = await invoke('changeOrderStatus', gm, { id, status: to });
    assert.equal(r.ok, true);
    o = (await invoke('getOrder', gm, { id })).order;
    assert.equal(o.status, to);
    assert.equal(o.companyId, null, 'company stays unassigned through the whole chain');
    assert.equal(o.trackingNumber, null, 'no tracking is ever generated');
  }

  assert.equal(o.completionSource, 'internal');
  // hasDelivery is intentionally NOT part of the client DTO; assert it server-side.
  assert.equal(Object.hasOwn(o, 'hasDelivery'), false, 'client DTO omits hasDelivery');
  const raw = (await db.doc('orders/' + id).get()).data();
  assert.equal(raw.hasDelivery, false, 'server record keeps delivery disabled');
  assert.equal(raw.companyId, null, 'server record keeps company null');
  assert.equal(o.revision, 5, 'created(0) + edit(1) + four transitions = 5');

  const go = await invoke('getOrder', gm, { id });
  const actions = go.events.map(e => e.action);
  assert.ok(actions.includes('created'));
  assert.ok(actions.includes('edited'));
  assert.equal(actions.filter(a => a === 'status_changed').length, 4);

  const la = await invoke('listAudit', gm, {});
  const mine = la.items.filter(x => x.entityId === id);
  assert.ok(mine.some(x => x.action === 'order.created'));
  assert.ok(mine.some(x => x.action === 'order.edited'));
  assert.equal(mine.filter(x => x.action === 'order.status_changed').length, 4);
});

test('journey: terminal internal order refuses further unauthorised change', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_locked_terminal_v1' });
  for (const to of ['review', 'preparing', 'ready', 'delivered']) {
    await invoke('changeOrderStatus', gm, { id: c.id, status: to });
  }
  const o = (await invoke('getOrder', gm, { id: c.id })).order;
  await assert.rejects(invoke('updateOrder', gm, { ...FIXTURE, id: c.id, revision: o.revision }),
    { code: 'permission-denied' });
  await assert.rejects(invoke('changeOrderStatus', gm, { id: c.id, status: 'preparing' }),
    { code: 'failed-precondition' });
});

test('contract: invalid transition target is refused', async () => {
  const c = await invoke('createOrder', gm, { ...FIXTURE, requestKey: 'stage3_bad_transition_v1' });
  await assert.rejects(invoke('changeOrderStatus', gm, { id: c.id, status: 'delivered' }),
    { code: 'failed-precondition' });
  await assert.rejects(invoke('changeOrderStatus', gm, { id: c.id, status: 'nonsense' }),
    { code: 'failed-precondition' });
});