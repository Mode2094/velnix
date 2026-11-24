'use strict';
// Durable, resumable PRINT BATCHES (web Print Manager).
//
// A batch is a permanent, user-scoped record of a print job: which orders, in
// which order, how far the operator actually confirmed paper came out, the
// paper/template/orientation and the small-chunk size. It is deliberately
// metadata-only: NO customer data and NO PDF ever leave the server for storage
// here — the manager re-reads the current orders through the normal permission
// checks every time it prints or resumes.
//
// The browser cannot know whether paper physically came out, so a batch never
// advances by itself: progress moves ONLY when the operator confirms the last
// sheet that printed. Closing the window, a printer stall or a reload can never
// lose the queue or the resume point, because the record is server-side.
const crypto = require('node:crypto');

const PAPERS = ['a3', 'a4', 'a5', 'a6', 'letter', 'legal', 'thermal80', 'thermal58', 'custom'];
const TEMPLATES = ['professional', 'plain', 'thermal'];
const OPS = ['confirm', 'record_issue', 'pause', 'resume', 'finish', 'set_start', 'reprint', 'clear_reprint'];
const MAX_BATCH = 500;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

module.exports = ({ db, FieldValue, requireAuth, currentActor, audit, fail, can, canSeeOrder }) => {
  const COLLECTION = 'printBatches';

  const safeDate = (v) => v?.toDate?.()?.toISOString?.() ?? null;
  const intIn = (v, lo, hi, label) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) fail('invalid-argument', `${label} غير صالح`);
    return n;
  };
  const allow = (v, list, fallback, label) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v !== 'string' || !list.includes(v)) fail('invalid-argument', `${label} غير صالح`);
    return v;
  };
  const indexList = (raw, total) => {
    if (!Array.isArray(raw) || raw.length === 0) fail('invalid-argument', 'لا توجد طلبات محددة');
    if (raw.length > MAX_BATCH) fail('invalid-argument', 'عدد كبير غير مسموح');
    const out = [...new Set(raw.map((x) => Number(x)))];
    for (const n of out) {
      if (!Number.isInteger(n) || n < 0 || n >= total) fail('invalid-argument', 'مؤشر ورقة غير صالح');
    }
    return out.sort((a, b) => a - b);
  };
  const isRecent = (ts, now, windowMs) => {
    const ms = ts?.toMillis?.() ?? 0;
    return ms > 0 && now - ms <= windowMs;
  };
  // The owner, a general manager, or anyone holding the org-wide view right may
  // read/operate a batch. Nobody else ever sees another user's queue.
  const authorizedFor = (user, b) =>
    b.actorId === user.id || user.role === 'generalManager' || can(user, 'viewAllOrders');

  const serialize = (id, d) => ({
    id,
    orderIds: d.orderIds || [],
    total: d.total || 0,
    confirmedCount: d.confirmedCount || 0,
    status: d.status || 'active',
    paper: d.paper || 'a4',
    template: d.template || 'professional',
    landscape: d.landscape === true,
    chunkSize: d.chunkSize || 10,
    source: d.source || 'bulk',
    startIndex: d.startIndex || 0,
    lastIssuedFrom: d.lastIssuedFrom ?? null,
    lastIssuedTo: d.lastIssuedTo ?? null,
    reprintIndices: d.reprintIndices || [],
    actorId: d.actorId || '',
    actorName: d.actorName || '',
    createdAt: safeDate(d.createdAt),
    updatedAt: safeDate(d.updatedAt),
    lastConfirmedAt: safeDate(d.lastConfirmedAt || null),
    finishedAt: safeDate(d.finishedAt || null),
  });

  // ---- create --------------------------------------------------------------
  async function createPrintBatch(req) {
    const user = await requireAuth(req);
    const raw = Array.isArray(req.data?.orderIds) ? req.data.orderIds : [];
    const ids = [
      ...new Set(raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())),
    ];
    if (ids.length === 0) fail('invalid-argument', 'حدّد طلباً واحداً على الأقل');
    if (ids.length > MAX_BATCH) fail('invalid-argument', `لا يمكن تجاوز ${MAX_BATCH} طلب في الدفعة`);
    const paper = allow(req.data?.paper, PAPERS, 'a4', 'حجم الورق');
    const template = allow(req.data?.template, TEMPLATES, 'professional', 'نوع البوليصة');
    const landscape = req.data?.landscape === true;
    const chunkSize = intIn(req.data?.chunkSize ?? 10, 1, 100, 'حجم الدفعة الصغيرة');
    const source = (typeof req.data?.source === 'string' ? req.data.source.trim().slice(0, 40) : '') || 'bulk';
    const dedupeKey =
      typeof req.data?.dedupeKey === 'string' && req.data.dedupeKey.trim()
        ? req.data.dedupeKey.trim().slice(0, 120)
        : null;

    // Only orders the caller may actually see ever enter the batch; the rest are
    // reported back as `skipped` rather than silently substituted.
    const visible = [];
    let skipped = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const snaps = await db.getAll(...chunk.map((pid) => db.doc(`orders/${pid}`)));
      snaps.forEach((s, idx) => {
        if (s.exists && canSeeOrder(user, { ...s.data(), id: chunk[idx] })) visible.push(chunk[idx]);
        else skipped++;
      });
    }
    if (visible.length === 0) fail('failed-precondition', 'لا توجد طلبات متاحة للطباعة ضمن تحديدك');

    // Never mint a duplicate batch for a double-click or an impatient re-tap:
    // the same actor, same orders and same options within a few minutes reuse
    // the still-open batch.
    const signature = crypto
      .createHash('sha256')
      .update([user.id, paper, template, landscape ? '1' : '0', source, visible.join(',')].join('|'))
      .digest('hex')
      .slice(0, 32);
    const now = Date.now();
    const recent = await db.collection(COLLECTION).where('signature', '==', signature).limit(8).get();
    const existing = recent.docs.find((doc) => {
      const b = doc.data();
      return (
        ['active', 'paused'].includes(b.status) &&
        (!dedupeKey || b.dedupeKey === dedupeKey) &&
        isRecent(b.createdAt, now, DEDUPE_WINDOW_MS)
      );
    });
    if (existing) return { ...serialize(existing.id, existing.data()), skipped, created: false };

    const ref = db.collection(COLLECTION).doc();
    await ref.set({
      actorId: user.id,
      actorName: user.name || '',
      orderIds: visible,
      total: visible.length,
      confirmedCount: 0,
      status: 'active',
      paper,
      template,
      landscape,
      chunkSize,
      source,
      signature,
      dedupeKey,
      startIndex: 0,
      lastIssuedFrom: null,
      lastIssuedTo: null,
      reprintIndices: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await audit('print.batch_created', user, ref.id, { total: visible.length, source, skipped });
    const snap = await ref.get();
    return { ...serialize(ref.id, snap.data()), skipped, created: true };
  }

  // ---- read ----------------------------------------------------------------
  async function getPrintBatch(req) {
    const user = await requireAuth(req);
    const id = String(req.data?.id ?? '').trim();
    if (!id) fail('invalid-argument', 'معرّف الدفعة مطلوب');
    const snap = await db.doc(`${COLLECTION}/${id}`).get();
    if (!snap.exists) fail('not-found', 'الدفعة غير موجودة');
    if (!authorizedFor(user, snap.data())) fail('permission-denied', 'لا تملك صلاحية هذه الدفعة');
    return serialize(snap.id, snap.data());
  }

  async function listPrintBatches(req) {
    const user = await requireAuth(req);
    const limit = Math.max(1, Math.min(50, Math.floor(Number(req.data?.limit) || 20)));
    const includeFinished = req.data?.includeFinished !== false;
    const all = req.data?.scope === 'all' && user.role === 'generalManager';
    // No composite index required: a single-field equality (or a plain scan for
    // a general manager) then an in-memory sort by createdAt.
    const base = all
      ? db.collection(COLLECTION)
      : db.collection(COLLECTION).where('actorId', '==', user.id);
    const snap = await base.limit(Math.min(limit * 4, 200)).get();
    const rows = snap.docs
      .map((doc) => ({ doc, b: doc.data() }))
      .filter((o) => includeFinished || o.b.status !== 'finished');
    rows.sort((x, y) => (y.b.createdAt?.toMillis?.() ?? 0) - (x.b.createdAt?.toMillis?.() ?? 0));
    return { batches: rows.slice(0, limit).map((o) => serialize(o.doc.id, o.b)) };
  }

  // ---- update (one control channel) ---------------------------------------
  async function updatePrintBatch(req) {
    const user = await requireAuth(req);
    const id = String(req.data?.id ?? '').trim();
    if (!id) fail('invalid-argument', 'معرّف الدفعة مطلوب');
    const op = typeof req.data?.op === 'string' ? req.data.op.trim() : '';
    if (!OPS.includes(op)) fail('invalid-argument', 'عملية غير معروفة');
    const ref = db.doc(`${COLLECTION}/${id}`);
    let confirmedNow = null;
    let reprintNow = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'الدفعة غير موجودة');
      const b = snap.data();
      if (!authorizedFor(user, b)) fail('permission-denied', 'لا تملك صلاحية هذه الدفعة');
      const total = b.total || 0;
      const patch = { updatedAt: FieldValue.serverTimestamp() };
      if (op === 'record_issue') {
        // The range was SENT to the print dialog; this is not proof of paper.
        const from = intIn(req.data?.fromIndex, 0, Math.max(0, total - 1), 'بداية النطاق');
        const to = intIn(req.data?.toIndex, 0, Math.max(0, total - 1), 'نهاية النطاق');
        if (from > to) fail('invalid-argument', 'نطاق غير صالح');
        patch.lastIssuedFrom = from;
        patch.lastIssuedTo = to;
      } else if (op === 'confirm') {
        // The operator states the LAST SHEET that actually printed. Progress
        // never moves past this, and never jumps to a page not issued.
        const count = intIn(req.data?.confirmedCount, 1, Math.max(1, total), 'عدد الورق المؤكد');
        patch.confirmedCount = count;
        patch.lastConfirmedAt = FieldValue.serverTimestamp();
        if (count >= total) {
          patch.status = 'finished';
          patch.finishedAt = FieldValue.serverTimestamp();
        }
        confirmedNow = count;
      } else if (op === 'pause') {
        if (b.status === 'finished') fail('failed-precondition', 'الدفعة منتهية');
        patch.status = 'paused';
      } else if (op === 'resume') {
        if (b.status === 'finished') fail('failed-precondition', 'الدفعة منتهية');
        patch.status = 'active';
      } else if (op === 'finish') {
        patch.status = 'finished';
        patch.finishedAt = FieldValue.serverTimestamp();
      } else if (op === 'set_start') {
        patch.startIndex = intIn(req.data?.startIndex, 0, Math.max(0, total), 'نقطة البداية');
      } else if (op === 'reprint') {
        const idx = indexList(req.data?.indices, total);
        patch.reprintIndices = FieldValue.arrayUnion(...idx);
        reprintNow = idx;
      } else if (op === 'clear_reprint') {
        const idx = indexList(req.data?.indices, total);
        patch.reprintIndices = FieldValue.arrayRemove(...idx);
      }
      await currentActor(tx, user);
      tx.update(ref, patch);
    });
    if (op === 'confirm') {
      await audit('print.batch_confirmed', user, id, { confirmedCount: confirmedNow });
    }
    if (op === 'reprint') {
      await audit('print.batch_reprint', user, id, { indices: reprintNow });
    }
    const snap = await ref.get();
    return serialize(ref.id, snap.data());
  }

  async function deletePrintBatch(req) {
    const user = await requireAuth(req);
    const id = String(req.data?.id ?? '').trim();
    if (!id) fail('invalid-argument', 'معرّف الدفعة مطلوب');
    const ref = db.doc(`${COLLECTION}/${id}`);
    const snap = await ref.get();
    if (!snap.exists) return { removed: false };
    const b = snap.data();
    if (b.actorId !== user.id && user.role !== 'generalManager') {
      fail('permission-denied', 'لا تملك صلاحية هذه الدفعة');
    }
    await ref.delete();
    await audit('print.batch_deleted', user, id, {});
    return { removed: true };
  }

  return { createPrintBatch, getPrintBatch, listPrintBatches, updatePrintBatch, deletePrintBatch };
};
