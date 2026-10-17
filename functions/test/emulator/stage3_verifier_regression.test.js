'use strict';
/*
 * Regression tests for the Stage 3 Part B read-only verifier.
 *
 * The evaluator is a pure function over synthetic fixtures, so every edge case
 * is provable without touching production, emulators or the network.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluate, documentIdFromName, listAll } = require('../../scripts/stage3_partb_verify');

const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const NAME = id => `projects/p/databases/(default)/documents/orders/${id}`;

const doc = (fields, name = NAME('x')) => ({ name, fields });

// A complete, healthy synthetic order.
const goodOrder = () => doc({
  customer: { stringValue: TAG },
  phone: { stringValue: '0000000000' },
  quantity: { integerValue: 1 },
  amountMinor: { integerValue: 0 },
  hasDelivery: { booleanValue: false },
  companyId: { nullValue: null },
  trackingNumber: { nullValue: null },
  remoteStatus: { nullValue: null },
  status: { stringValue: 'delivered' },
  completionSource: { stringValue: 'internal' },
  revision: { integerValue: 5 },
  note: { stringValue: 'INTERNAL TEST EDITED — ' + TAG }
}, NAME('order1'));

const gmDoc = () => doc({
  role: { stringValue: 'generalManager' },
  active: { booleanValue: true },
  approvalStatus: { stringValue: 'approved' }
}, 'projects/p/databases/(default)/documents/members/m1');

const users = [{ disabled: false, emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }] }];

const events = () => ([
  doc({ action: { stringValue: 'created' } }),
  doc({ action: { stringValue: 'edited' } }),
  doc({ action: { stringValue: 'status_changed' } }),
  doc({ action: { stringValue: 'status_changed' } }),
  doc({ action: { stringValue: 'status_changed' } }),
  doc({ action: { stringValue: 'status_changed' } })
]);

const audit = id => ([
  doc({ action: { stringValue: 'order.created' }, entityId: { stringValue: id } }),
  doc({ action: { stringValue: 'order.edited' }, entityId: { stringValue: id } }),
  ...Array.from({ length: 4 }, () =>
    doc({ action: { stringValue: 'order.status_changed' }, entityId: { stringValue: id } }))
]);

const notice = (orderId, read) => doc({
  orderId: { stringValue: orderId }, read: { booleanValue: read }
}, 'projects/p/databases/(default)/documents/notices/n1');


// The mandatory B2r gate requires an idempotency record that points at THIS order,
// so one-order fixtures must carry a matching record rather than an empty stub.
const idemFor = (orderId, fields = {}) =>
  doc({ orderId: { stringValue: orderId }, payloadHash: { stringValue: 'h' }, createdBy: { stringValue: 'u1' }, ...fields },
       'projects/p/databases/(default)/documents/idempotency/i1');

const base = (over = {}) => ({
  members: [gmDoc()], users, orders: [], idempotency: [],
  notices: [], audit: [], orderEvents: {}, errors: {}, ...over
});
const row = (out, id) => out.rows.find(r => r.id === id);

// ------------------------------------------------------- 1. zero / one / many
test('B1: zero tagged orders is NOT TESTED, never PASS', () => {
  const out = evaluate(base());
  assert.equal(row(out, 'B1').status, 'NOT TESTED');
  assert.equal(out.decision, 'NOT_EXECUTED');
  assert.equal(row(out, 'B3').status, 'NOT TESTED');
});

test('B1: exactly one tagged order is PASS', () => {
  const out = evaluate(base({ orders: [goodOrder()], idempotency: [idemFor('order1')] }));
  assert.equal(row(out, 'B1').status, 'PASS');
  assert.equal(row(out, 'B2r').status, 'PASS', 'the idempotency record belongs to this order');
});

test('B1: more than one tagged order is FAIL and blocks every later gate', () => {
  const out = evaluate(base({
    orders: [goodOrder(), goodOrder(NAME('order2'))],
    idempotency: [idemFor('order1')]
  }));
  assert.equal(row(out, 'B1').status, 'FAIL');
  // A conclusive FAIL outranks the gates that short-circuited, so the verdict
  // is FAIL rather than NOT_EXECUTED.
  assert.equal(out.decision, 'FAIL');
  assert.equal(row(out, 'B3').status, 'FAIL', 'B3 is the duplicate detector row itself');
  for (const id of ['B4', 'B5', 'B6']) assert.equal(row(out, id).status, 'NOT TESTED');
  assert.equal(out.orderId, null, 'no single order is nominated when a duplicate exists');
});

// ---------------------------------------------------------------- 2. paging
test('pagination: listAll follows nextPageToken to exhaustion', async () => {
  const pages = [
    { documents: [{ name: 'a' }], nextPageToken: 't1' },
    { documents: [{ name: 'b' }], nextPageToken: 't2' },
    { documents: [{ name: 'c' }] }
  ];
  let call = 0;
  const get = async () => pages[call++];
  const out = await listAll(get, 'http://x/orders');
  assert.deepEqual(out.map(d => d.name), ['a', 'b', 'c']);
  assert.equal(call, 3, 'third page was requested, so completeness is proven');
});

test('pagination: a repeated page token is rejected rather than silently trusted', async () => {
  const get = async () => ({ documents: [], nextPageToken: 'same' });
  await assert.rejects(listAll(get, 'http://x/orders'), /repeated page token/);
});

// --------------------------------------------- 3. notice read is observed
test('E1/E2: missing notice is NOT TESTED, not PASS', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1')
  }));
  assert.equal(row(out, 'E1').status, 'FAIL');
  assert.equal(row(out, 'E2').status, 'NOT TESTED');
});

test('E2: notice present but unread is NOT TESTED, never an unconditional PASS', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', false)]
  }));
  assert.equal(row(out, 'E1').status, 'PASS');
  assert.equal(row(out, 'E2').status, 'NOT TESTED');
  assert.match(row(out, 'E2').actual, /0 of 1 read/);
});

test('E2: notice present and read is PASS from the observed flag', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)]
  }));
  assert.equal(row(out, 'E2').status, 'PASS');
  assert.match(row(out, 'E2').actual, /1 of 1 read/);
});

test('E2: a notice belonging to another order is not counted', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('someoneElse', true)]
  }));
  assert.equal(row(out, 'E1').status, 'FAIL');
});

// ------------------------------------------- 4. id extraction + field schema
test('documentIdFromName: only orders/<id> is accepted', () => {
  assert.equal(documentIdFromName(NAME('abc123')), 'abc123');
  assert.equal(documentIdFromName('projects/p/databases/(default)/documents/notices/n1'), null);
  assert.equal(documentIdFromName('projects/p/databases/(default)/documents/orders'), null);
  assert.equal(documentIdFromName('projects/p/databases/(default)/documents/orders/a/b'), null);
  assert.equal(documentIdFromName(null), null);
});

test('C0: a document whose name cannot be parsed is FAIL, not silently accepted', () => {
  const bad = { name: 'not/a/document/name', fields: { customer: { stringValue: TAG } } };
  const out = evaluate(base({ orders: [bad], idempotency: [idemFor('order1')] }));
  assert.equal(row(out, 'C0').status, 'FAIL');
});

test('C1: a wrong fixture amount or quantity is FAIL', () => {
  const wrong = doc({
    customer: { stringValue: TAG }, phone: { stringValue: '0000000000' },
    quantity: { integerValue: 5 }, amountMinor: { integerValue: 250 },
    hasDelivery: { booleanValue: false }
  }, NAME('o1'));
  const out = evaluate(base({ orders: [wrong], idempotency: [idemFor('o1')] }));
  assert.equal(row(out, 'C1').status, 'FAIL');
});

test('C1: a real-looking phone number would be FAIL, never reported', () => {
  const leaky = doc({
    customer: { stringValue: TAG }, phone: { stringValue: '0791234567' },
    quantity: { integerValue: 1 }, amountMinor: { integerValue: 0 },
    hasDelivery: { booleanValue: false }
  }, NAME('o1'));
  const out = evaluate(base({ orders: [leaky], idempotency: [idemFor('o1')] }));
  assert.equal(row(out, 'C1').status, 'FAIL');
  assert.match(row(out, 'C1').actual, /phone=UNEXPECTED/);
});

// ------------------------------------ 5. incomplete / partial workflows
test('C3/C4: a half-finished workflow is NOT TESTED, never PASS', () => {
  const partial = doc({
    customer: { stringValue: TAG }, phone: { stringValue: '0000000000' },
    quantity: { integerValue: 1 }, amountMinor: { integerValue: 0 },
    hasDelivery: { booleanValue: false }, status: { stringValue: 'ready' },
    revision: { integerValue: 2 }, note: { stringValue: TAG }
  }, NAME('o1'));
  const out = evaluate(base({
    orders: [partial], idempotency: [idemFor('o1')],
    orderEvents: { o1: [doc({ action: { stringValue: 'created' } })] }
  }));
  assert.equal(row(out, 'C3').status, 'NOT TESTED');
  assert.equal(row(out, 'C4').status, 'NOT TESTED');
  assert.equal(row(out, 'D1').status, 'FAIL');
  assert.equal(row(out, 'D2').status, 'FAIL');
});

test('D1/D2: a complete workflow is PASS', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)]
  }));
  for (const id of ['B1', 'C0', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'E1', 'E2']) {
    assert.equal(row(out, id).status, 'PASS', `${id} should PASS`);
  }
  assert.equal(out.decision, 'PASS');
});

test('audit for a different order does not satisfy this order gates', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('someOtherOrder')
  }));
  assert.equal(row(out, 'D2').status, 'FAIL');
});

// --------------------------------------------------- degraded reads stay honest
test('a failed read is NOT TESTED, never a silent PASS', () => {
  const out = evaluate(base({ orders: [goodOrder()], errors: { events: 'permission denied', audit: 'timeout' } }));
  assert.equal(row(out, 'D1').status, 'NOT TESTED');
  assert.equal(row(out, 'D2').status, 'NOT TESTED');
});

test('identity failures are FAIL, and the report never echoes member PII', () => {
  const out = evaluate(base({ members: [gmDoc(), { ...gmDoc(), name: 'x' }] }));
  assert.equal(row(out, 'A1').status, 'FAIL');
  const dump = JSON.stringify(out);
  assert.equal(/m1/.test(dump), false, 'no document ids are emitted');
  assert.equal(/velnix\.test|@/.test(dump), false, 'no emails are emitted');
});

test('the client-SDK gate is always reported, even before an order exists', () => {
  for (const input of [base(), base({ orders: [goodOrder()] })]) {
    const f1 = row(evaluate(input), 'F1');
    assert.ok(f1, 'F1 row is always present');
    assert.equal(f1.status, 'NOT TESTED');
  }
});

test('FCM is never claimed as tested; only the internal notice is assessed', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)]
  }));
  assert.match(row(out, 'E2').actual, /FCM not claimed/);
  assert.equal(/push|FCM|fcm/i.test(JSON.stringify(out.rows).replace(/FCM not claimed/g, '')), false,
    'no push/FCM capability is asserted anywhere');
});
// ------------------------------------------- 5/6. production UI contract
const fs = require('node:fs');
const path = require('node:path');
const UI = path.resolve(__dirname, '../../../lib/live/live_orders.dart');

test('UI generates the idempotency requestKey itself, with a random secure value', () => {
  const src = fs.readFileSync(UI, 'utf8');
  assert.match(src, /final String _requestKey = List\.generate\(/,
    'the UI owns the requestKey; it is not supplied by the owner');
  assert.match(src, /Random\.secure\(\)/,
    'the UI requestKey is random per form instance, NOT the test tag');
  assert.doesNotMatch(src, new RegExp(`_requestKey[^\\n]*${TAG}`),
    'the requestKey is provably not the approved test tag');
  assert.match(src, /'requestKey': _requestKey/,
    'the UI sends its own requestKey on create');
});

test('UI sends a full field set plus revision on edit, matching the server contract', () => {
  const src = fs.readFileSync(UI, 'utf8');
  assert.match(src, /updateOrder\(\s*widget\.initial!\['id'\]\.toString\(\),\s*\{\.\.\.map, 'revision':/,
    'edit sends the whole form map plus the optimistic-concurrency revision');
  assert.match(src, /widget\.initial == null[\s\S]{0,200}createOrder\(/,
    'create and edit are distinct code paths, so create uses requestKey and edit uses revision');
});

test('UI exposes the internal-completion confirmation the journey depends on', () => {
  const src = fs.readFileSync(UI, 'utf8');
  assert.match(src, /تأكيد إكمال الطلب الداخلي/, 'terminal completion is explicitly confirmed');
  assert.match(src, /إكمال الطلب الداخلي/, 'the internal-completion action is labelled');
});

// -------------------------------------------- 9. honest overall reporting
test('reporting: all gates unverified can never produce an overall PASS', () => {
  const out = evaluate(base());
  assert.equal(out.decision, 'NOT_EXECUTED');
  assert.ok(out.decision !== 'PASS');
  assert.ok(out.mandatoryPassed < out.mandatoryGates);
  assert.match(out.why, /not evaluated/);
});

test('reporting: identity gates passing is still not an overall PASS', () => {
  const out = evaluate(base());
  for (const id of ['A1', 'A2', 'A3']) assert.equal(row(out, id).status, 'PASS');
  assert.equal(out.decision, 'NOT_EXECUTED', 'passing identity alone must not accept the journey');
});

test('reporting: a failed read makes the verdict UNVERIFIED', () => {
  const out = evaluate(base({ errors: { orders: 'permission denied' } }));
  assert.equal(out.decision, 'UNVERIFIED');
  assert.match(out.why, /failed or was not fully paged/);
});

test('reporting: an incomplete page scan makes the verdict UNVERIFIED', () => {
  const out = evaluate(base({ complete: { orders: false } }));
  assert.equal(out.decision, 'UNVERIFIED');
});

test('reporting: an idempotency record pointing at another order is a FAIL', () => {
  const out = evaluate(base({
    orders: [goodOrder()],
    idempotency: [idemFor('some-other-order')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)]
  }));
  assert.equal(row(out, 'B2r').status, 'FAIL');
  assert.equal(out.decision, 'FAIL');
});

test('reporting: a fully verified journey is PASS despite F1 outstanding', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)]
  }));
  assert.equal(out.decision, 'PASS');
  assert.equal(out.mandatoryPassed, out.mandatoryGates);
  assert.deepEqual(out.observationalOutstanding, ['F1'],
    'F1 is reported as outstanding but does not block acceptance');
});

test('reporting: every row states whether it is frontend or backend evidence', () => {
  const out = evaluate(base({ orders: [goodOrder()], idempotency: [idemFor('order1')] }));
  for (const r of out.rows) {
    assert.ok(['frontend', 'backend'].includes(r.source), `${r.id} has source ${r.source}`);
  }
});

test('reporting: the duplicate verdict is FAIL even though later gates never ran', () => {
  const out = evaluate(base({ orders: [goodOrder(), goodOrder(NAME('order2'))] }));
  assert.equal(out.decision, 'FAIL');
  assert.ok(!out.mandatoryGates || out.mandatoryPassed < out.mandatoryGates,
    'short-circuited gates must not be counted as satisfied');
});

test('A3: a genuine google-linked verified user is required, not a single user globally', () => {
  const many = Array.from({ length: 4 }, () => users[0]);
  assert.equal(row(evaluate(base({ users: many })), 'A3').status, 'PASS',
    'several legitimate employees must not fail the identity gate');
  assert.equal(row(evaluate(base({ users: [] })), 'A3').status, 'FAIL',
    'no Google-linked identity must still fail');
  const unverified = [{ disabled: false, emailVerified: false, providerUserInfo: [{ providerId: 'google.com' }] }];
  assert.equal(row(evaluate(base({ users: unverified })), 'A3').status, 'FAIL',
    'an unverified identity must fail');
});

// ------------------------------------- 10. frontend evidence for the F1 gate
const { verifyFrontendEvidence, F1_REQUIRED_PROBES } = require('../../scripts/stage3_partb_verify');

const goodFrontend = (over = {}) => ({
  order: 'order1',
  clientProject: 'demo-velnix-preview',
  usedAdminSdk: false,
  remoteEvalUsed: false,
  session: { signedIn: true, provider: 'google.com' },
  tests: F1_REQUIRED_PROBES.map(name => ({ name, outcome: 'error', code: 'permission-denied' })),
  ...over
});

test('F1: verified client evidence turns the observational gate into PASS', () => {
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'),
    notices: [notice('order1', true)], frontendEvidence: goodFrontend()
  }));
  const f1 = row(out, 'F1');
  assert.equal(f1.status, 'PASS');
  assert.equal(f1.source, 'frontend', 'F1 evidence must be attributed to the frontend, not the backend');
  assert.equal(out.decision, 'PASS');
  assert.deepEqual(out.observationalOutstanding, [], 'a verified F1 clears the outstanding list');
});

test('F1: absent evidence stays NOT TESTED and never becomes an assumed PASS', () => {
  const out = evaluate(base({ orders: [goodOrder()] }));
  assert.equal(row(out, 'F1').status, 'NOT TESTED');
});

test('F1: evidence naming another order is rejected', () => {
  const e = goodFrontend({ order: 'some-other-order' });
  assert.equal(verifyFrontendEvidence(e, 'order1').valid, false);
  const out = evaluate(base({
    orders: [goodOrder()], idempotency: [idemFor('order1')],
    orderEvents: { order1: events() }, audit: audit('order1'), notices: [notice('order1', true)],
    frontendEvidence: e
  }));
  assert.equal(row(out, 'F1').status, 'FAIL', 'mismatched evidence must fail loudly, not pass');
  assert.equal(out.decision, 'FAIL');
});

test('F1: admin-SDK or unauthenticated evidence is rejected', () => {
  assert.equal(verifyFrontendEvidence(goodFrontend({ usedAdminSdk: true }), 'order1').valid, false);
  assert.equal(verifyFrontendEvidence(goodFrontend({ session: { signedIn: false } }), 'order1').valid, false);
  assert.equal(verifyFrontendEvidence(goodFrontend({ remoteEvalUsed: true }), 'order1').valid, false);
});

test('F1: a non-permission failure never counts as a denial', () => {
  for (const code of ['unavailable', 'unauthenticated', 'failed-precondition', 'internal']) {
    const e = goodFrontend({ tests: F1_REQUIRED_PROBES.map(name => ({ name, outcome: 'error', code })) });
    assert.equal(verifyFrontendEvidence(e, 'order1').valid, false, `${code} must not satisfy F1`);
  }
});

test('F1: a probe that unexpectedly succeeded is a hard failure', () => {
  const e = goodFrontend({
    tests: F1_REQUIRED_PROBES.map((name, i) => i === 0
      ? { name, outcome: 'unexpected_success' }
      : { name, outcome: 'error', code: 'permission-denied' })
  });
  assert.equal(verifyFrontendEvidence(e, 'order1').valid, false);
});

test('F1: missing probes are rejected rather than partially accepted', () => {
  const e = goodFrontend({ tests: [{ name: 'A_direct_document_read', outcome: 'error', code: 'permission-denied' }] });
  assert.equal(verifyFrontendEvidence(e, 'order1').valid, false);
  assert.equal(verifyFrontendEvidence(null, 'order1').valid, false);
});
