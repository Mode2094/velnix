'use strict';
// One-off, idempotent migration for human-readable order numbers.
// Default is dry-run. --apply writes a backup first, then one Firestore
// transaction updates missing numbers and the shared counter without touching
// Click refs, barcodes, document IDs or any other order field.
const fs = require('node:fs');
const path = require('node:path');
const {createGcloudSession, PROJECT} = require('./gcloud_session');

const BASE = `projects/${PROJECT}/databases/(default)/documents`;
const NUMBER = /^VNX-(\d{6})$/;

function value(fields, key) {
  const raw = fields && fields[key];
  if (!raw) return null;
  return Object.values(raw)[0];
}
function createdAt(fields) {
  return String(value(fields, 'createdAt') || '');
}
function nextNumber(n) {
  if (n > 999999) throw Error('order_number_range_exhausted');
  return `VNX-${String(n).padStart(6, '0')}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const {get, firestoreTransaction} = createGcloudSession();
  const listing = await get(`https://firestore.googleapis.com/v1/${BASE}/orders?pageSize=300`);
  const docs = (listing.documents || []).filter(d => d && d.name);
  if (!docs.length) throw Error('no_orders');
  const missing = docs.filter(d => !value(d.fields, 'orderNumber'));
  const existing = docs.filter(d => value(d.fields, 'orderNumber'));
  const used = new Set();
  let max = 0;
  for (const doc of existing) {
    const number = value(doc.fields, 'orderNumber');
    const match = NUMBER.exec(number);
    if (!match) throw Error('invalid_existing_order_number');
    const n = Number(match[1]);
    if (used.has(n)) throw Error('duplicate_existing_order_number');
    used.add(n);
    max = Math.max(max, n);
  }
  const assignments = missing
    .sort((a, b) => createdAt(a.fields).localeCompare(createdAt(b.fields)) ||
      a.name.localeCompare(b.name))
    .map(doc => {
      let n = max + 1;
      while (used.has(n)) n++;
      used.add(n);
      max = n;
      return {name: doc.name, orderNumber: nextNumber(n)};
    });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(__dirname, '../../.local/evidence');
  fs.mkdirSync(out, {recursive: true});
  const backup = path.join(out, `orders-backup-order-numbers-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    projectId: PROJECT,
    createdAt: new Date().toISOString(),
    orderCount: docs.length,
    orders: docs,
  }, null, 2));

  console.log(JSON.stringify({
    projectId: PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    backup,
    existingNumbers: existing.length,
    missingNumbers: missing.length,
    assignments: assignments.map(a => ({id: a.name.split('/').pop(), orderNumber: a.orderNumber})),
    nextCounter: max,
  }, null, 2));

  if (!apply || !assignments.length) return;

  const begin = await firestoreTransaction('beginTransaction', {});
  const transaction = begin.transaction;
  if (!transaction) throw Error('transaction_not_started');
  const names = docs.map(d => d.name);
  const counterName = `${BASE}/settings/orderCounter`;
  const read = await firestoreTransaction('batchGet', {
    documents: [...names, counterName],
    transaction,
  });
  if (!Array.isArray(read) || read.length !== names.length + 1) throw Error('transaction_read_shape');
  const counterRow = read[names.length];
  const currentCounter = Number(value(counterRow.found && counterRow.found.fields, 'value') || 0);
  const finalCounter = Math.max(max, currentCounter);
  if (finalCounter > 999999) throw Error('order_number_range_exhausted');
  const writes = assignments.map(a => ({
    update: {
      name: a.name,
      fields: {orderNumber: {stringValue: a.orderNumber}},
    },
    updateMask: {fieldPaths: ['orderNumber']},
  }));
  writes.push({
    update: {
      name: counterName,
      fields: {
        value: {integerValue: String(finalCounter)},
        updatedAt: {timestampValue: new Date().toISOString()},
      },
    },
    updateMask: {fieldPaths: ['value', 'updatedAt']},
  });
  await firestoreTransaction('commit', {transaction, writes});
  console.log(JSON.stringify({applied: assignments.length, counter: finalCounter}));
}

if (require.main === module) {
  main().catch(e => {
    console.error('order_number_backfill_failed', e.message);
    process.exitCode = 1;
  });
}
module.exports = {main, nextNumber, NUMBER};
