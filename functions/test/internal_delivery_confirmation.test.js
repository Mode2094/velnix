'use strict';
// Task 2 contract: «تم التسليم» is a MANUAL internal accounting confirmation.
//   * A carrier status change must never auto-confirm it (no carrier module
//     writes `internalStatus`/`internalCompletion`, and the only writer of
//     `internalCompletion` is the human internal-status change).
//   * A manual confirmation must never touch the shipment (shipping status,
//     dispatchState, deliveryAccepted, tracking or provider identifiers).
//   * The optional statement reference / note / difference are bounded, and the
//     financial difference is hidden from callers who may not view amounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateDeliveryConfirmation,
  internalStatusChangeReason,
  DELIVERY_CONFIRMATION_SOURCE,
  MAX_STATEMENT_REF,
  MAX_CONFIRMATION_NOTE,
} = require('../src/policy');
const { orderForUser } = require('../src/order_view');

const read = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing ${endMarker}`);
  return source.slice(start, end);
}

// ---------------------------------------------------------------- validation

test('delivery confirmation fields are optional, trimmed and bounded', () => {
  assert.deepEqual(validateDeliveryConfirmation(undefined), {
    statementRef: '',
    note: '',
    differenceMinor: null,
  });
  assert.deepEqual(validateDeliveryConfirmation({ statementRef: ' ST-1 ', note: ' ok ' }), {
    statementRef: 'ST-1',
    note: 'ok',
    differenceMinor: null,
  });
  assert.equal(validateDeliveryConfirmation({ differenceMinor: -500 }).differenceMinor, -500);
  assert.equal(validateDeliveryConfirmation({ differenceMinor: '0' }).differenceMinor, 0);
  assert.throws(() => validateDeliveryConfirmation({ statementRef: 'x'.repeat(MAX_STATEMENT_REF + 1) }), /invalid_statement_ref/);
  assert.throws(() => validateDeliveryConfirmation({ note: 'x'.repeat(MAX_CONFIRMATION_NOTE + 1) }), /invalid_confirmation_note/);
  assert.throws(() => validateDeliveryConfirmation({ differenceMinor: 1.5 }), /invalid_difference/);
  assert.throws(() => validateDeliveryConfirmation({ differenceMinor: 1e12 }), /invalid_difference/);
});

test('the confirmation source constant is the explicit manual marker', () => {
  assert.equal(DELIVERY_CONFIRMATION_SOURCE, 'internal_review');
});

// ---------------------------------------------------------------- permissions

test('only staff who may change internal status may confirm delivery; an in-flight send blocks it', () => {
  const base = { id: 'o', status: 'ready', internalStatus: 'ready', createdBy: 'creator', createdByName: 'c' };
  const gm = { id: 'gm', role: 'generalManager', active: true, permissions: [] };
  const warehouse = { id: 'w', role: 'warehouse', active: true, permissions: [] };
  const sales = { id: 's', role: 'sales', active: true, permissions: [] };
  assert.equal(internalStatusChangeReason(gm, base, 'delivered'), null);
  assert.equal(internalStatusChangeReason(warehouse, base, 'delivered'), null);
  assert.equal(internalStatusChangeReason(sales, base, 'delivered'), 'permission-denied');
  assert.equal(internalStatusChangeReason(gm, { ...base, dispatchState: 'sending' }, 'delivered'), 'dispatch_active');
  assert.equal(internalStatusChangeReason(gm, { ...base, dispatchState: 'needs_review' }, 'delivered'), 'dispatch_active');
  // After a confirmed carrier acceptance the order stays internally confirmable:
  // the accounting step is independent of the shipping lifecycle.
  assert.equal(
    internalStatusChangeReason(gm, { ...base, hasDelivery: true, dispatchState: 'sent', shippingStatus: 'delivered' }, 'delivered'),
    null,
  );
});

// ---------------------------------------------------------------- independence

test('no carrier module can auto-confirm the internal delivery', () => {
  for (const file of ['remote.js', 'click_delivery.js', 'click_response.js', 'shipping_status.js', 'providers.js']) {
    const source = read(file);
    assert.ok(!/internalStatus/.test(source), `${file} must never write internalStatus`);
    assert.ok(!/internalCompletion/.test(source), `${file} must never write internalCompletion`);
  }
});

test('applyInternalStatusChange is the only writer of internalCompletion, and it never touches the shipment', () => {
  const index = read('index.js');
  const start = index.indexOf('async function applyInternalStatusChange');
  assert.ok(start >= 0);
  const body = functionBody(index, 'async function applyInternalStatusChange', '// Single-order, permission-checked company assignment');
  // The single tx.update in this function must only write the internal status,
  // completion provenance, the manual confirmation and bookkeeping — never a
  // carrier/dispatch field.
  const update = /tx\.update\(ref,\{([\s\S]*?)\}\)/.exec(body);
  assert.ok(update, 'expected a tx.update in applyInternalStatusChange');
  assert.ok(/internalCompletion/.test(body), 'the manual confirmation must be recorded');
  assert.ok(
    !/shippingStatus|dispatchState|deliveryAccepted|trackingNumber|clickOrderRef|providerOrderId|remoteStatus|hasDelivery\s*:/.test(update[1]),
    'a manual confirmation must never modify shipment/carrier fields',
  );
  // `internalCompletion` may be written ONLY inside this function across index.js.
  let idx = -1;
  let seen = 0;
  while ((idx = index.indexOf('internalCompletion', idx + 1)) !== -1) {
    seen += 1;
    assert.ok(
      idx > start && idx < start + body.length,
      'internalCompletion is written outside the manual internal-status change',
    );
  }
  assert.ok(seen >= 1);
});

test('the Click sync preserves the internal status and only writes carrier fields', () => {
  const index = read('index.js');
  const body = functionBody(index, 'async function syncClickOrderForRef', '// Recovers a dispatch that was interrupted');
  assert.ok(/internalStatus[:=]internalStatusOf\(o\)\|\|o\.internalStatus/.test(body));
  assert.ok(!/internalCompletion/.test(body));
  assert.ok(/shippingStatus:parsed\.shippingStatus/.test(body));
});

// ---------------------------------------------------------------- DTO

const stub = (id, extra = {}) => ({
  id,
  data: () => ({
    customer: 'عمر',
    phone: '0790000000',
    city: 'عمان',
    area: 'عمان',
    address: 'X',
    description: 'Y',
    quantity: 1,
    amountMinor: 7500,
    paymentMethod: 'عند الاستلام',
    createdBy: 'owner',
    status: 'delivered',
    internalStatus: 'delivered',
    ...extra,
  }),
});

test('the manual confirmation is exposed to authorized readers and hides the amount from the rest', () => {
  const doc = stub('x', {
    internalCompletion: {
      source: 'internal_review',
      confirmedBy: 'gm1',
      confirmedByName: 'المدير',
      confirmedAt: { toDate: () => new Date('2026-11-25T10:00:00Z') },
      statementRef: 'ST-9',
      note: 'مطابق',
      differenceMinor: -500,
    },
  });
  const gm = { id: 'gm', role: 'generalManager', active: true, permissions: [] };
  const sales = { id: 'sales', role: 'sales', active: true, permissions: [] };
  const visible = orderForUser(gm, doc).internalCompletion;
  assert.equal(visible.statementRef, 'ST-9');
  assert.equal(visible.differenceMinor, -500);
  assert.equal(visible.confirmedBy, 'gm1');
  assert.ok(visible.confirmedAt);
  const hidden = orderForUser(sales, doc).internalCompletion;
  assert.equal(Object.hasOwn(hidden, 'differenceMinor'), false);
  assert.equal(hidden.statementRef, 'ST-9');
});
