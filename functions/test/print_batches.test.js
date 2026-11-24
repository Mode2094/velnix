'use strict';
// Unit tests for the durable, resumable print-batch backend. They use a tiny
// in-memory Firestore double so the invariants that matter for the Print Manager
// are pinned deterministically: no duplicate batch on a double-click, progress
// moving only to the sheet the operator actually confirmed, resume points,
// reprint bookkeeping, audit rows and per-user authorization. Nothing here
// stores customer data, so the tests also assert the stored record is metadata
// only.
const test = require('node:test');
const assert = require('node:assert/strict');

function makeDb() {
  const store = new Map();
  let clock = Date.now();
  const ts = () => { clock += 1; const v = clock; return { toMillis: () => v, toDate: () => new Date(v) }; };
  const apply = (doc, patch) => {
    for (const key of Object.keys(patch)) {
      const v = patch[key];
      if (v && v.__ts) doc[key] = ts();
      else if (v && v.__union) doc[key] = [...new Set([...(doc[key] || []), ...v.__union])];
      else if (v && v.__remove) doc[key] = (doc[key] || []).filter((x) => !v.__remove.includes(x));
      else doc[key] = v;
    }
  };
  const idOf = (p) => p.split('/')[1];
  const listDocs = (name) =>
    [...store.keys()]
      .filter((p) => p.startsWith(name + '/') && p.split('/').length === 2)
      .map((p) => snap(p));
  const snap = (p) => ({ id: idOf(p), exists: store.has(p), ref: ref(p), data: () => store.get(p) });
  const ref = (p) => ({
    id: idOf(p),
    path: p,
    get: async () => snap(p),
    set: async (data) => { const d = {}; apply(d, data); store.set(p, d); },
    update: async (patch) => { const d = store.get(p) || {}; apply(d, patch); store.set(p, d); },
    delete: async () => { store.delete(p); },
  });
  let auto = 0;
  const filterDocs = (name, preds) =>
    listDocs(name).filter((s) => preds.every(([f, , v]) => s.data()[f] === v));
  const collection = (name) => ({
    doc: (id) => ref(`${name}/${id || 'auto' + (++auto) + Date.now().toString(36)}`),
    where: (field, op, value) => ({
      limit: (n) => ({ get: async () => ({ docs: filterDocs(name, [[field, op, value]]).slice(0, n) }) }),
      get: async () => ({ docs: filterDocs(name, [[field, op, value]]) }),
    }),
    limit: (n) => ({ get: async () => ({ docs: listDocs(name).slice(0, n) }) }),
  });
  return {
    store,
    doc: (p) => ref(p),
    collection,
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    runTransaction: async (fn) => {
      const pending = [];
      const tx = {
        get: async (r) => snap(r.path),
        update: (r, patch) => pending.push(() => { const d = store.get(r.path) || {}; apply(d, patch); store.set(r.path, d); }),
        set: (r, data) => pending.push(() => { const d = {}; apply(d, data); store.set(r.path, d); }),
      };
      await fn(tx);
      pending.forEach((f) => f());
    },
  };
}

const FieldValue = {
  serverTimestamp: () => ({ __ts: true }),
  arrayUnion: (...values) => ({ __union: values }),
  arrayRemove: (...values) => ({ __remove: values }),
};

function harness({ visible = () => true, user } = {}) {
  const db = makeDb();
  const audits = [];
  const actor = user || { id: 'u1', name: 'مدير', role: 'generalManager', permissions: [] };
  const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
  const mod = require('../src/print_batches')({
    db,
    FieldValue,
    requireAuth: async () => actor,
    currentActor: async () => {},
    audit: async (action, a, entityId, extra) => audits.push({ action, entityId, extra }),
    fail,
    can: () => true,
    canSeeOrder: (_u, order) => visible(order),
  });
  return { db, audits, mod, actor };
}

const seedOrder = (db, id) => db.doc(`orders/${id}`).set({ id, status: 'created', customer: 'سري', phone: '0790' });

test('createPrintBatch stores a metadata-only record and never duplicates on a double-click', async () => {
  const { db, mod } = harness();
  await seedOrder(db, 'o1');
  await seedOrder(db, 'o2');
  const args = { orderIds: ['o1', 'o2'], paper: 'a4', template: 'professional', landscape: false, chunkSize: 5, source: 'bulk' };
  const first = await mod.createPrintBatch({ data: args });
  const second = await mod.createPrintBatch({ data: args });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.id, first.id);
  const batches = [...db.store.keys()].filter((p) => p.startsWith('printBatches/'));
  assert.equal(batches.length, 1);
  const stored = db.store.get(batches[0]);
  assert.deepEqual(stored.orderIds, ['o1', 'o2']);
  assert.equal(stored.total, 2);
  assert.equal(stored.confirmedCount, 0);
  assert.equal(stored.status, 'active');
  // No customer data or PDF may ever be persisted with the batch.
  const flat = JSON.stringify(stored);
  assert.equal(flat.includes('سري'), false);
  assert.equal(flat.includes('0790'), false);
  assert.equal('pdf' in stored, false);
});

test('only orders the caller may see enter the batch; the rest are reported skipped', async () => {
  const { db, mod } = harness({ visible: (order) => order.id !== 'hidden' });
  await seedOrder(db, 'keep');
  await seedOrder(db, 'hidden');
  const res = await mod.createPrintBatch({ data: { orderIds: ['keep', 'hidden', 'missing'], source: 'bulk' } });
  assert.deepEqual(res.orderIds, ['keep']);
  assert.equal(res.total, 1);
  assert.equal(res.skipped, 2);
});

test('a batch the caller cannot even print from is rejected', async () => {
  const { db, mod } = harness({ visible: () => false });
  await seedOrder(db, 'x');
  await assert.rejects(mod.createPrintBatch({ data: { orderIds: ['x'] } }), /متاحة للطباعة/);
});

test('confirm advances progress only to the stated sheet and never past the total', async () => {
  const { db, mod, audits } = harness();
  for (const id of ['a', 'b', 'c', 'd', 'e']) await seedOrder(db, id);
  const batch = await mod.createPrintBatch({ data: { orderIds: ['a', 'b', 'c', 'd', 'e'], chunkSize: 2 } });
  const after = await mod.updatePrintBatch({ data: { id: batch.id, op: 'confirm', confirmedCount: 3 } });
  assert.equal(after.confirmedCount, 3);
  assert.equal(after.status, 'active');
  await assert.rejects(
    mod.updatePrintBatch({ data: { id: batch.id, op: 'confirm', confirmedCount: 6 } }),
    /عدد الورق المؤكد غير صالح/,
  );
  // 0 is not a confirmation of anything.
  await assert.rejects(
    mod.updatePrintBatch({ data: { id: batch.id, op: 'confirm', confirmedCount: 0 } }),
    /عدد الورق المؤكد غير صالح/,
  );
  assert.ok(audits.some((a) => a.action === 'print.batch_confirmed'));
});

test('record_issue records the sent range WITHOUT moving confirmed progress', async () => {
  const { db, mod } = harness();
  for (const id of ['a', 'b', 'c']) await seedOrder(db, id);
  const batch = await mod.createPrintBatch({ data: { orderIds: ['a', 'b', 'c'] } });
  const after = await mod.updatePrintBatch({ data: { id: batch.id, op: 'record_issue', fromIndex: 0, toIndex: 2 } });
  assert.equal(after.confirmedCount, 0);
  assert.equal(after.lastIssuedFrom, 0);
  assert.equal(after.lastIssuedTo, 2);
});

test('resume point, reprint bookkeeping, pause/resume and finish all persist', async () => {
  const { db, mod, audits } = harness();
  for (const id of ['a', 'b', 'c', 'd']) await seedOrder(db, id);
  const batch = await mod.createPrintBatch({ data: { orderIds: ['a', 'b', 'c', 'd'] } });
  const started = await mod.updatePrintBatch({ data: { id: batch.id, op: 'set_start', startIndex: 2 } });
  assert.equal(started.startIndex, 2);
  const reprinted = await mod.updatePrintBatch({ data: { id: batch.id, op: 'reprint', indices: [1, 3] } });
  assert.deepEqual(reprinted.reprintIndices, [1, 3]);
  assert.ok(audits.some((a) => a.action === 'print.batch_reprint'));
  const paused = await mod.updatePrintBatch({ data: { id: batch.id, op: 'pause' } });
  assert.equal(paused.status, 'paused');
  const resumed = await mod.updatePrintBatch({ data: { id: batch.id, op: 'resume' } });
  assert.equal(resumed.status, 'active');
  const finished = await mod.updatePrintBatch({ data: { id: batch.id, op: 'finish' } });
  assert.equal(finished.status, 'finished');
  await assert.rejects(mod.updatePrintBatch({ data: { id: batch.id, op: 'resume' } }), /الدفعة منتهية/);
});

test('confirming the final sheet finishes the batch automatically', async () => {
  const { db, mod } = harness();
  for (const id of ['a', 'b']) await seedOrder(db, id);
  const batch = await mod.createPrintBatch({ data: { orderIds: ['a', 'b'] } });
  const done = await mod.updatePrintBatch({ data: { id: batch.id, op: 'confirm', confirmedCount: 2 } });
  assert.equal(done.confirmedCount, 2);
  assert.equal(done.status, 'finished');
});

test('another user cannot read, operate or delete a batch they do not own', async () => {
  const owner = harness();
  await seedOrder(owner.db, 'a');
  const batch = await owner.mod.createPrintBatch({ data: { orderIds: ['a'] } });
  const intruder = require('../src/print_batches')({
    db: owner.db,
    FieldValue,
    requireAuth: async () => ({ id: 'u2', name: 'آخر', role: 'dataEntry', permissions: [] }),
    currentActor: async () => {},
    audit: async () => {},
    fail: (code, message) => { const e = new Error(message); e.code = code; throw e; },
    can: () => false,
    canSeeOrder: () => true,
  });
  await assert.rejects(intruder.getPrintBatch({ data: { id: batch.id } }), /صلاحية/);
  await assert.rejects(intruder.updatePrintBatch({ data: { id: batch.id, op: 'pause' } }), /صلاحية/);
  await assert.rejects(intruder.deletePrintBatch({ data: { id: batch.id } }), /صلاحية/);
});

test('listPrintBatches returns only the caller own batches, newest first', async () => {
  const { db, mod } = harness();
  await seedOrder(db, 'a');
  const b1 = await mod.createPrintBatch({ data: { orderIds: ['a'], source: 'single' } });
  const b2 = await mod.createPrintBatch({ data: { orderIds: ['a'], source: 'single', paper: 'a5' } });
  const listed = await mod.listPrintBatches({ data: { limit: 10 } });
  const ids = listed.batches.map((b) => b.id);
  assert.ok(ids.includes(b1.id) && ids.includes(b2.id));
  assert.equal(listed.batches[0].id, b2.id);
});
