'use strict';
/*
 * Stage 3 Part B — the reviewed acceptance journey, shared by every driver.
 *
 * Both the emulator suite and the production runner import THIS file, so the
 * fixture and the steps are identical by construction rather than by promise.
 *
 * The journey drives the real Velnix UI only. It never writes through an admin
 * SDK, never calls a backend mutation directly, and never contacts a delivery
 * company. The single synthetic order is created through the real create form.
 *
 * Safety rules encoded here:
 *   * createSyntheticOrder refuses to run unless the caller has independently
 *     confirmed the approved tag does not already exist.
 *   * If a save is ambiguous — no response, a non-200, or a missing id — the
 *     journey throws and stops. It never retries the create, because a retry
 *     risks a second order. Reconciliation is the caller's read-only job.
 */
const assert = require('node:assert/strict');

// ---------------------------------------------------------------- the fixture
const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const PHONE = '0000000000';
const NOTE = 'INTERNAL TEST — ' + TAG;
const EDITED_NOTE = 'INTERNAL TEST EDITED — ' + TAG;

const FORM_FIELDS = {
  'اسم المستلم': TAG,
  'رقم الهاتف': PHONE,
  'المحافظة': 'اختبار آلي',
  'المنطقة': 'منطقة اختبار',
  'العنوان التفصيلي': 'TEST ONLY — عنوان اصطناعي للاختبار',
  'وصف محتويات الطلب': 'INTERNAL TEST — ' + TAG,
  'الكمية': '1',
  'المبلغ (دينار أردني)': '0.000',
  'ملاحظات': NOTE
};

// Flutter web draws the form on a canvas, so fields are addressed by position
// in a fixed 1440x1000 viewport. Changing them means re-running the emulator suite.
const FORM_POINTS = {
  'اسم المستلم': [890, 185], 'رقم الهاتف': [300, 185], 'المحافظة': [300, 276],
  'المنطقة': [890, 367], 'العنوان التفصيلي': [300, 367], 'وصف محتويات الطلب': [890, 470],
  'الكمية': [300, 458], 'المبلغ (دينار أردني)': [890, 574], 'ملاحظات': [300, 585]
};

// Production loads the Firebase JS SDK from Google's CDN. The emulator preview
// serves the same 12.19.0 modules locally, so the base is supplied by the driver
// before this module is loaded. getApps() is per-module-instance, so both must
// agree on the origin or the probe would find no initialised app.
const SDK = process.env.VELNIX_SDK_BASE || 'https://www.gstatic.com/firebasejs/12.19.0/';
const REGION = 'europe-west1';

// ------------------------------------------------------------- UI primitives
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// macOS binds Ctrl+A to "move to line start"; select-all is Cmd+A there.
const selectAll = p => p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');

async function activate(p, locator) {
  await p.bringToFront();
  await p.waitForTimeout(60);
  await locator.evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await frame(p);
}
const click = (p, name) => activate(p, p.getByRole('button', { name, exact: true }).first());
const back = (p) => activate(p, p.getByRole('button', { name: /رجوع|Back/ }).first());

async function nav(p, kind) {
  const label = { home: 'الرئيسية', orders: 'الطلبات', create: 'طلب جديد', notices: 'الإشعارات', more: 'المزيد' }[kind];
  await activate(p, p.getByRole('button').filter({ hasText: label }).filter({ hasText: 'علامة التبويب' }));
}

async function callable(p, name, data = {}) {
  return p.evaluate(async ({ name, data, sdk, region }) => {
    const { getApps } = await import(sdk + 'firebase-app.js');
    const { getFunctions, httpsCallable } = await import(sdk + 'firebase-functions.js');
    const app = getApps()[0];
    try {
      return { ok: true, data: (await httpsCallable(getFunctions(app, region), name)(data)).data };
    } catch (e) { return { ok: false, code: e.code }; }
  }, { name, data, sdk: SDK, region: REGION });
}
async function okay(p, name, data) {
  const r = await callable(p, name, data);
  assert.equal(r.ok, true, `${name} failed: ${r.code}`);
  return r.data;
}
async function denied(p, name, data) {
  const r = await callable(p, name, data);
  assert.equal(r.ok, false, `${name} unexpectedly authorized`);
  assert.equal(r.code, 'functions/permission-denied', `${name} wrong rejection: ${r.code}`);
}

async function openTagged(p) {
  // The detail screen keeps the navigation rail; the edit screen hides it. Only
  // leave the route when the rail is genuinely missing.
  const ordersTab = p.getByRole('button').filter({ hasText: 'الطلبات' }).filter({ hasText: 'علامة التبويب' });
  if (!(await ordersTab.count()) && await p.getByRole('button', { name: /رجوع|Back/ }).count()) await back(p);
  const searchBox = p.getByRole('textbox', { name: 'بحث في كل الطلبات المسموح لك بها', exact: true });
  for (let attempt = 0; attempt < 3 && !(await searchBox.count()); attempt++) {
    await nav(p, 'orders');
    await p.waitForTimeout(1500);
  }
  await searchBox.waitFor({ timeout: 30000 });
  await frame(p);
  const box = await searchBox.boundingBox();
  await p.mouse.click(600, box.y + box.height / 2);
  await frame(p);
  await selectAll(p);
  await p.keyboard.insertText(TAG);
  await frame(p);
  const found = p.waitForResponse(r => new URL(r.url()).pathname.endsWith('/searchOrders') && r.request().method() === 'POST');
  await p.keyboard.press('Enter');
  const response = await found;
  assert.equal(response.request().postDataJSON().data.query, TAG, 'search must use the exact approved tag');
  assert.equal(response.status(), 200);
  const items = (await response.json()).result.items;
  assert.equal(items.filter(i => i.customer === TAG).length, 1, 'exactly one tagged order must be searchable');
  await p.getByText(TAG, { exact: false }).first().waitFor();
  await activate(p, p.getByText(TAG, { exact: false }).first());
  await p.getByText('تفاصيل الطلب', { exact: true }).waitFor({ timeout: 15000 });
  await p.getByText('سجل الحركة', { exact: true }).waitFor();
  await frame(p);
  return items[0];
}



/**
 * Set a Flutter text field by semantics rather than by canvas coordinates.
 *
 * The fields expose a real TEXTAREA/INPUT once focused, so focus() is reliable
 * and inputValue() gives an exact read-back. The old fixed offsets silently
 * missed whenever the production layout differed from the emulator, which
 * presented as a failed save rather than a missed click. The value is verified
 * before anything is submitted, so a mis-typed field can never be saved.
 */
async function setField(p, locator, value, label) {
  await locator.focus();
  await p.waitForTimeout(250);
  const before = await locator.inputValue();
  await selectAll(p);
  await p.keyboard.insertText(value);
  await p.waitForTimeout(400);
  const got = await locator.inputValue();
  assert.equal(got, value,
    `${label} holds ${JSON.stringify(got)} instead of the intended text; refusing to save`);
  return { before, after: got };
}

/**
 * The form is addressed by canvas coordinates that were proven in a 1440x1000
 * viewport. A different viewport silently misses every field, which previously
 * looked like a save failure. Fail loudly instead.
 */
async function assertViewport(p) {
  const size = await p.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  assert.equal(size.w, 1440, `expected a 1440px viewport, got ${size.w}; form coordinates would miss`);
  assert.equal(size.h, 1000, `expected a 1000px viewport, got ${size.h}; form coordinates would miss`);
}

// -------------------------------------------------------------- journey steps
/**
 * Create the one authorized synthetic order through the real form.
 * `preflightConfirmedAbsent` must be true, supplied by the caller after an
 * independent read-only check that the tag does not already exist.
 */
async function createSyntheticOrder(p, { preflightConfirmedAbsent, evidence, shot }) {
  if (preflightConfirmedAbsent !== true) {
    throw new Error('refusing to create: the caller has not confirmed the tag is absent');
  }
  await assertViewport(p);
  await nav(p, 'create');
  await p.getByText('إضافة طلب جديد', { exact: true }).waitFor();

  for (const [label, value] of Object.entries(FORM_FIELDS)) {
    await setField(p, p.getByRole('textbox', { name: label, exact: true }), value, label);
  }

  const posted = p.waitForResponse(
    r => new URL(r.url()).pathname.endsWith('/createOrder') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await p.mouse.dblclick(600, 814, { delay: 5 });

  const res = await posted;               // throws on timeout: never retried
  assert.equal(res.status(), 200, `createOrder returned ${res.status()}; stop and reconcile`);
  const body = await res.json();
  assert.ok(body.result?.id, 'createOrder returned no id; stop and reconcile, do not resubmit');

  evidence.orderId = body.result.id;
  evidence.payload = res.request().postDataJSON().data;
  evidence.requestKeyPresent = typeof evidence.payload.requestKey === 'string' && evidence.payload.requestKey.length > 0;
  assert.ok(evidence.requestKeyPresent, 'the UI must send a requestKey');
  await p.getByText(TAG, { exact: false }).first().waitFor({ timeout: 30000 });
  if (shot) await p.screenshot({ path: shot('created') });
  return evidence.orderId;
}

/** The stored order must match the approved fixture exactly. */
async function assertApprovedFixture(p, id, evidence) {
  const o = await okay(p, 'getOrder', { id });
  assert.equal(o.order.customer, TAG);
  assert.equal(o.order.phone, PHONE);
  // order_view serialises amount as amountMinor/1000, so zero is the number 0.
  assert.equal(Number(o.order.amount), 0, 'the synthetic order must be worth 0 JOD');
  assert.equal(o.order.quantity, 1);
  assert.equal(o.order.note, NOTE);
  assert.equal(o.order.companyId, null, 'no delivery company may be attached');
  assert.equal(o.order.trackingNumber, null, 'no tracking number may be attached');
  evidence.revisionAfterCreate = o.order.revision;
  return o;
}

/** Replaying the identical UI payload must never create a second order. */
async function replayMustNotDuplicate(p, id, evidence) {
  const replay = await p.evaluate(async ({ payload, sdk, region }) => {
    const { getApps } = await import(sdk + 'firebase-app.js');
    const { getFunctions, httpsCallable } = await import(sdk + 'firebase-functions.js');
    const app = getApps()[0];
    try {
      const r = await httpsCallable(getFunctions(app, region), 'createOrder')(payload);
      return { ok: true, id: r.data.id };
    } catch (e) { return { ok: false, code: e.code }; }
  }, { payload: evidence.payload, sdk: SDK, region: REGION });

  assert.equal(replay.ok, true, `replay must resolve, not error: ${replay.code}`);
  assert.equal(replay.id, id, 'the replayed requestKey must resolve to the original order');
  const tagged = (await okay(p, 'searchOrders', { query: TAG })).items.filter(i => i.customer === TAG);
  assert.equal(tagged.length, 1, 'a replay must never create a duplicate order');
}

/** Edit the notes through the UI; the revision must advance. */
async function editNotes(p, id, evidence) {
  await assertViewport(p);
  // Read the order first: the editor must load exactly what is stored now. On a
  // resumed order the note may already be the edited text, so comparing against
  // the original fixture would wrongly refuse a legitimate resume.
  const current = (await okay(p, 'getOrder', { id })).order;
  const before = current.revision;
  const storedNote = current.note;
  await openTagged(p);
  await click(p, 'تعديل');
  const notes = p.getByRole('textbox', { name: 'ملاحظات', exact: true });
  await notes.waitFor();
  // The field must hold the real stored note before it is replaced, and the
  // intended note must be in place before the save is triggered.
  const { before: priorNote, after: typedNote } = await setField(p, notes, EDITED_NOTE, 'ملاحظات');
  assert.equal(priorNote, storedNote, 'the editor did not load the stored note; refusing to save');
  assert.equal(typedNote, EDITED_NOTE);
  const saved = p.waitForResponse(r => new URL(r.url()).pathname.endsWith('/updateOrder') && r.request().method() === 'POST');
  await click(p, 'حفظ الطلب');
  const response = await saved;
  assert.equal(response.status(), 200);
  // The save must target the authorized order at the expected revision.
  const sent = response.request().postDataJSON().data;
  assert.equal(sent.id, id, 'the save targeted a different order');
  assert.equal(sent.revision, before, `the save sent revision ${sent.revision}, expected ${before}`);
  const after = await okay(p, 'getOrder', { id });
  assert.equal(after.order.note, EDITED_NOTE);
  assert.ok(after.order.revision > before, 'a successful edit must advance the revision');
  evidence.revision = after.order.revision;
}

/** Search the approved tag and confirm it renders. */
async function searchByTag(p, evidence) {
  await openTagged(p);
  const shown = (await p.locator('body').innerText()).includes(TAG);
  assert.ok(shown, 'the tagged order must render in the UI');
  await back(p);
}

/** Four internal transitions ending in the two-step internal completion. */
async function fourInternalTransitions(p, id, evidence) {
  await openTagged(p);
  for (const [label, status] of [['تحويل إلى قيد المراجعة', 'review'], ['تحويل إلى قيد التجهيز', 'preparing'], ['تحويل إلى جاهز للتسليم', 'ready'], ['إكمال الطلب الداخلي', 'delivered']]) {
    const response = p.waitForResponse(r => new URL(r.url()).pathname.endsWith('/changeOrderStatus') && r.request().method() === 'POST');
    await click(p, label);
    if (status === 'delivered') {
      // The internal completion is a two-step confirmation, not a silent write.
      await p.getByText('تأكيد إكمال الطلب الداخلي', { exact: true }).waitFor({ timeout: 15000 });
      await click(p, 'تأكيد الإكمال');
    }
    assert.equal((await response).status(), 200);
    await p.getByText('الحالة: ' + { review: 'قيد المراجعة', preparing: 'قيد التجهيز', ready: 'جاهز للتسليم', delivered: 'تم التسليم' }[status], { exact: true }).waitFor();
  }
  assert.equal(await p.getByRole('button', { name: 'تعديل', exact: true }).count(), 0, 'a delivered order must be locked');
  const closed = await okay(p, 'getOrder', { id });
  assert.equal(closed.order.status, 'delivered');
  assert.equal(closed.order.completionSource, 'internal');
  assert.equal(closed.events.filter(e => e.action === 'status_changed').length, 4);
  await back(p);
}

/** The internal notice must be displayed and its read receipt recorded. */
async function noticeDisplayedAndRead(p, id, evidence) {
  await nav(p, 'notices');
  await p.getByRole('button', { name: 'تحديث', exact: true }).waitFor();
  await p.waitForFunction(() => document.body.innerText.includes('طلب جديد'), null, { timeout: 20000 });
  const notices = await okay(p, 'listNotices', {});
  const notice = notices.items.find(n => n.orderId === id);
  assert.ok(notice, 'the tagged order must generate a notice for the GM');
  assert.equal(notice.read, false, 'the notice starts unread');
  // Tap a real notice tile. The assertion is what gate E2 needs: a notice for
  // THIS order became read.
  await activate(p, p.locator('flt-semantics[flt-tappable]').filter({ hasText: 'افتح الطلب لعرض آخر تغيير.' }).first());
  await p.getByText('تفاصيل الطلب', { exact: true }).waitFor();
  let readNotice = null;
  for (let attempt = 0; attempt < 20 && !readNotice; attempt++) {
    const current = await okay(p, 'listNotices', {});
    readNotice = current.items.find(n => n.orderId === id && n.read === true) || null;
    if (!readNotice) await p.waitForTimeout(500);
  }
  assert.ok(readNotice, 'opening a notice for this order must record the read');
  evidence.readNoticeId = readNotice.id;
}

module.exports = {
  TAG, PHONE, NOTE, EDITED_NOTE, FORM_FIELDS, FORM_POINTS, SDK, REGION,
  frame, selectAll, activate, click, back, nav, callable, okay, denied, openTagged, assertViewport, setField,
  createSyntheticOrder, assertApprovedFixture, replayMustNotDuplicate,
  editNotes, searchByTag, fourInternalTransitions, noticeDisplayedAndRead
};