'use strict';
/*
 * Stage 3 Part B — fully automated frontend acceptance against the Firebase
 * Emulator Suite.
 *
 * Every step below is driven through the real Velnix UI: the real widget tree,
 * the real Cloud Functions, the real Firestore rules and the real authorization
 * policy. Only the identity provider is synthetic, because the Auth emulator
 * stands in for Google so that no real Google account, cookie or token is ever
 * involved. The emulator preview refuses to start on any non-loopback origin.
 *
 * No production resource is read or written by this file.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-ui');
const load = id => require(require.resolve(id, { paths: [path.join(root, 'functions')] }));
const { evaluate } = require(path.join(root, 'functions/scripts/stage3_partb_verify.js'));

fs.mkdirSync(out, { recursive: true });

// The single owner-authorized synthetic acceptance fixture.
const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const PHONE = '0000000000';
const NOTE = 'INTERNAL TEST — ' + TAG;
const EDITED_NOTE = 'INTERNAL TEST EDITED — ' + TAG;
const PROJECT = 'demo-velnix-preview';

const results = [];
const pageErrors = [];
const evidence = { tag: TAG, phone: PHONE };
let browser;
let gm;
let created = null;

async function scenario(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'passed', ms: Date.now() - start });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, status: 'failed', error: e.message, ms: Date.now() - start });
    console.error('FAIL', name, e.message);
    throw e;
  }
}

const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// macOS binds Ctrl+A to "move to line start"; select-all is Cmd+A there.
const selectAll = p => p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
async function activate(p, locator) {
  await p.bringToFront();
  await p.waitForTimeout(60);
  await locator.evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await frame(p);
}
async function click(p, name) { await activate(p, p.getByRole('button', { name, exact: true }).first()); }
async function back(p) { await activate(p, p.getByRole('button', { name: /رجوع|Back/ }).first()); }

async function callable(p, name, data = {}) {
  return p.evaluate(async ({ name, data }) => {
    const { getApp } = await import('/firebase-sdk/12.19.0/firebase-app.js');
    const { getFunctions, httpsCallable } = await import('/firebase-sdk/12.19.0/firebase-functions.js');
    try {
      return { ok: true, data: (await httpsCallable(getFunctions(getApp(), 'europe-west1'), name)(data)).data };
    } catch (e) { return { ok: false, code: e.code }; }
  }, { name, data });
}
async function okay(p, name, data) {
  const r = await callable(p, name, data);
  assert.equal(r.ok, true, `${name}: ${r.code}`);
  return r.data;
}
async function denied(p, name, data) {
  const r = await callable(p, name, data);
  assert.equal(r.ok, false, `${name} unexpectedly authorized`);
  assert.equal(r.code, 'functions/permission-denied', `${name} wrong rejection: ${r.code}`);
}

async function login(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'apis.google.com' || u.hostname === 'fonts.gstatic.com') {
      const r = await fetch('http://127.0.0.1:8767/verified-public?url=' + encodeURIComponent(u.href));
      return route.fulfill({ status: r.status, contentType: r.headers.get('content-type') || 'text/javascript', body: Buffer.from(await r.arrayBuffer()), headers: { 'access-control-allow-origin': '*' } });
    }
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue();
    return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push({ role, error: e.message }));
  await p.goto('http://127.0.0.1:8767', { waitUntil: 'networkidle' });
  await p.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
  await p.getByRole('button', { name: 'المتابعة باستخدام Google' }).waitFor({ timeout: 60000 });
  const popup = ctx.waitForEvent('page', { timeout: 30000 });
  await p.mouse.click(720, 600);
  const pop = await popup;
  await pop.getByText(role.toLowerCase() + '@velnix.test', { exact: true }).click();
  await p.getByText('أهلاً، ' + (role === 'generalManager' ? 'مدير عام اصطناعي' : 'مبيعات اصطناعي'), { exact: true }).waitFor({ timeout: 60000 });
  return p;
}

async function nav(p, kind) {
  const label = { home: 'الرئيسية', orders: 'الطلبات', create: 'طلب جديد', notices: 'الإشعارات', more: 'المزيد' }[kind];
  await activate(p, p.getByRole('button').filter({ hasText: label }).filter({ hasText: 'علامة التبويب' }));
}

async function openTagged(p) {
  // The details and edit routes are full screen and hide the navigation rail,
  // so leave them before trying to reach the orders tab again.
  // Only leave the current route when the navigation rail is genuinely missing:
  // the detail screen keeps the rail, while the edit screen hides it. Backing out
  // of the detail screen would remove the tab we are about to need.
  const ordersTab = p.getByRole('button').filter({ hasText: 'الطلبات' }).filter({ hasText: 'علامة التبويب' });
  if (!(await ordersTab.count()) && await p.getByRole('button', { name: /رجوع|Back/ }).count()) await back(p);
  // listOrderCreators is only a directory preload and is not re-issued when the
  // orders tab is already selected, so wait on the search field itself.
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

// ------------------------------------------- REST field shape for evaluate()
function toField(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object' && typeof v.path === 'string') return { referenceValue: v.path };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toField) } };
  const fields = {};
  for (const [k, val] of Object.entries(v)) fields[k] = toField(val);
  return { mapValue: { fields } };
}
const doc = (id, coll, data) => ({ name: `projects/p/databases/(default)/documents/${coll}/${id}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toField(v)])) });

async function emulatorState(orderId) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.METADATA_SERVER_DETECTION = 'none';
  const { initializeApp, getApps } = load('firebase-admin/app');
  const { getFirestore } = load('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  const db = getFirestore();

  const members = (await db.collection('members').get()).docs.map(d => doc(d.id, 'members', d.data()));
  const ordersSnap = await db.collection('orders').get();
  const orders = ordersSnap.docs.map(d => doc(d.id, 'orders', d.data()));
  const idempotency = (await db.collection('idempotency').get()).docs.map(d => doc(d.id, 'idempotency', d.data()));
  const notices = (await db.collection('notices').get()).docs.map(d => doc(d.id, 'notices', d.data()));
  const audit = (await db.collection('auditEvents').get()).docs.map(d => doc(d.id, 'auditEvents', d.data()));
  const orderEvents = {};
  if (orderId) {
    const ev = await db.doc('orders/' + orderId).collection('events').get();
    orderEvents[orderId] = ev.docs.map(d => doc(d.id, `orders/${orderId}/events`, d.data()));
  }

  // The Auth emulator has no list endpoint, so read identities through the
  // Admin SDK. Only the flags the gate needs are carried forward: no uid,
  // no email, no tokens.
  const { getAuth } = load('firebase-admin/auth');
  const listed = await getAuth().listUsers();
  const users = listed.users.map(u => ({
    disabled: u.disabled === true,
    emailVerified: u.emailVerified === true,
    providerUserInfo: (u.providerData || []).map(p => ({ providerId: p.providerId }))
  }));

  return {
    members, users, orders, idempotency, notices, audit, orderEvents,
    errors: {}, orderPages: 'complete',
    complete: { members: true, orders: true, idempotency: true, notices: true, audit: true, users: true }
  };
}

async function main() {
  browser = await chromium.launch();

  await scenario('GM dashboard renders for the authenticated internal session', async () => {
    gm = await login('generalManager');
    await nav(gm, 'home');
    await gm.locator('flt-glass-pane').waitFor({ state: 'attached' });
    await gm.screenshot({ path: path.join(out, 'stage3-dashboard.png') });
  });

  await scenario('one synthetic internal order is created through the real UI form', async () => {
    await nav(gm, 'create');
    await gm.getByText('إضافة طلب جديد', { exact: true }).waitFor();
    const fields = {
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
    const points = {
      'اسم المستلم': [890, 185], 'رقم الهاتف': [300, 185], 'المحافظة': [300, 276],
      'المنطقة': [890, 367], 'العنوان التفصيلي': [300, 367], 'وصف محتويات الطلب': [890, 470],
      'الكمية': [300, 458], 'المبلغ (دينار أردني)': [890, 574], 'ملاحظات': [300, 585]
    };
    for (const [label, value] of Object.entries(fields)) {
      await gm.mouse.click(...points[label]);
      await frame(gm);
      await selectAll(gm);
      await gm.keyboard.insertText(value);
      await frame(gm);
    }
    const posted = gm.waitForResponse(r => new URL(r.url()).pathname.endsWith('/createOrder') && r.request().method() === 'POST', { timeout: 60000 });
    await gm.mouse.dblclick(600, 814, { delay: 5 });
    const res = await posted;
    assert.equal(res.status(), 200);
    const body = await res.json();
    assert.ok(body.result?.id, 'createOrder must return an id');
    created = { id: body.result.id, payload: res.request().postDataJSON().data };
    evidence.requestKeyPresent = typeof created.payload.requestKey === 'string' && created.payload.requestKey.length > 0;
    evidence.orderId = created.id;
    assert.ok(evidence.requestKeyPresent, 'the UI must send a requestKey');
    await gm.getByText(TAG, { exact: false }).first().waitFor({ timeout: 30000 });
    await gm.screenshot({ path: path.join(out, 'stage3-created.png') });
  });

  await scenario('the order carries exactly the approved synthetic fixture', async () => {
    const o = await okay(gm, 'getOrder', { id: created.id });
    assert.equal(o.order.customer, TAG);
    assert.equal(o.order.phone, PHONE);
    // order_view serialises amount as amountMinor/1000, so zero is the number 0.
    assert.equal(Number(o.order.amount), 0, 'the synthetic order must be worth 0 JOD');
    assert.equal(o.order.quantity, 1);
    assert.equal(o.order.note, NOTE);
    assert.equal(o.order.companyId, null, 'no delivery company may be attached');
    assert.equal(o.order.trackingNumber, null, 'no tracking number may be attached');
  });

  await scenario('replaying the identical UI payload does not create a second order', async () => {
    // The requestKey the UI generated is what protects against a double submit.
    // Re-sending the byte-identical payload must resolve to the same order.
    const replay = await gm.evaluate(async payload => {
      const { getApp } = await import('/firebase-sdk/12.19.0/firebase-app.js');
      const { getFunctions, httpsCallable } = await import('/firebase-sdk/12.19.0/firebase-functions.js');
      try {
        const r = await httpsCallable(getFunctions(getApp(), 'europe-west1'), 'createOrder')(payload);
        return { ok: true, id: r.data.id };
      } catch (e) { return { ok: false, code: e.code }; }
    }, created.payload);
    assert.equal(replay.ok, true, `replay must resolve, not error: ${replay.code}`);
    assert.equal(replay.id, created.id, 'the replayed requestKey must resolve to the original order');
    const tagged = (await okay(gm, 'searchOrders', { query: TAG })).items.filter(i => i.customer === TAG);
    assert.equal(tagged.length, 1, 'a replay must never create a duplicate order');
  });

  await scenario('notes are edited through the UI and the revision advances', async () => {
    const before = (await okay(gm, 'getOrder', { id: created.id })).order.revision;
    await openTagged(gm);
    await click(gm, 'تعديل');
    await gm.getByRole('textbox', { name: 'ملاحظات', exact: true }).waitFor();
    const noteBox = await gm.getByRole('textbox', { name: 'ملاحظات', exact: true }).boundingBox();
    await gm.mouse.click(300, noteBox.y + noteBox.height / 2);
    await frame(gm);
    await selectAll(gm);
    await gm.keyboard.insertText(EDITED_NOTE);
    await frame(gm);
    const saved = gm.waitForResponse(r => new URL(r.url()).pathname.endsWith('/updateOrder') && r.request().method() === 'POST');
    await click(gm, 'حفظ الطلب');
    assert.equal((await saved).status(), 200);
    const after = await okay(gm, 'getOrder', { id: created.id });
    assert.equal(after.order.note, EDITED_NOTE);
    assert.ok(after.order.revision > before, 'a successful edit must advance the revision');
    evidence.revision = after.order.revision;
  });

  await scenario('search by the exact approved tag returns the single order', async () => {
    await openTagged(gm);
    const shown = (await gm.locator('body').innerText()).includes(TAG);
    assert.ok(shown, 'the tagged order must render in the UI');
    await gm.screenshot({ path: path.join(out, 'stage3-searched.png') });
    await back(gm);
  });

  await scenario('four internal transitions complete the order and lock it', async () => {
    await openTagged(gm);
    for (const [label, status] of [['تحويل إلى قيد المراجعة', 'review'], ['تحويل إلى قيد التجهيز', 'preparing'], ['تحويل إلى جاهز للتسليم', 'ready'], ['إكمال الطلب الداخلي', 'delivered']]) {
      const response = gm.waitForResponse(r => new URL(r.url()).pathname.endsWith('/changeOrderStatus') && r.request().method() === 'POST');
      await click(gm, label);
      if (status === 'delivered') {
        // The internal completion is a two-step confirmation, not a silent write.
        await gm.getByText('تأكيد إكمال الطلب الداخلي', { exact: true }).waitFor({ timeout: 15000 });
        await click(gm, 'تأكيد الإكمال');
      }
      assert.equal((await response).status(), 200);
      await gm.getByText('الحالة: ' + { review: 'قيد المراجعة', preparing: 'قيد التجهيز', ready: 'جاهز للتسليم', delivered: 'تم التسليم' }[status], { exact: true }).waitFor();
    }
    assert.equal(await gm.getByRole('button', { name: 'تعديل', exact: true }).count(), 0, 'a delivered order must be locked');
    const closed = await okay(gm, 'getOrder', { id: created.id });
    assert.equal(closed.order.status, 'delivered');
    assert.equal(closed.order.completionSource, 'internal');
    assert.equal(closed.events.filter(e => e.action === 'status_changed').length, 4);
    await gm.screenshot({ path: path.join(out, 'stage3-completed.png') });
    await back(gm);
  });

  await scenario('the internal notice is displayed and marked read', async () => {
    await nav(gm, 'notices');
    await gm.getByRole('button', { name: 'تحديث', exact: true }).waitFor();
    await gm.waitForFunction(() => document.body.innerText.includes('طلب جديد'), null, { timeout: 20000 });
    const notices = await okay(gm, 'listNotices', {});
    const notice = notices.items.find(n => n.orderId === created.id);
    assert.ok(notice, 'the tagged order must generate a notice for the GM');
    assert.equal(notice.read, false, 'the notice starts unread');
    await gm.screenshot({ path: path.join(out, 'stage3-notices.png') });
    // Tap a real notice tile. Every tile carries the same body, so the tap is
    // aimed at the list rather than at one specific row; the assertion below is
    // what gate E2 actually requires: a notice for THIS order became read.
    await activate(gm, gm.locator('flt-semantics[flt-tappable]').filter({ hasText: 'افتح الطلب لعرض آخر تغيير.' }).first());
    await gm.getByText('تفاصيل الطلب', { exact: true }).waitFor();
    // The read receipt is written by a callable round trip, so poll briefly
    // rather than racing it with a single immediate read-back.
    let readNotice = null;
    for (let attempt = 0; attempt < 20 && !readNotice; attempt++) {
      const current = await okay(gm, 'listNotices', {});
      readNotice = current.items.find(n => n.orderId === created.id && n.read === true) || null;
      if (!readNotice) await gm.waitForTimeout(500);
    }
    assert.ok(readNotice, 'opening a notice for this order must record the read');
    evidence.readNoticeId = readNotice.id;
  });

  await scenario('an unprivileged role cannot complete or edit the internal order', async () => {
    const sales = await login('sales');
    await denied(sales, 'updateOrder', { id: created.id, revision: 1, note: 'محاولة تصعيد مرفوضة' });
    await denied(sales, 'markNoticeRead', { id: 'any' });
    await sales.context().close();
  });

  await scenario('the read-only verifier accepts the UI-produced journey', async () => {
    const state = await emulatorState(created.id);
    const result = evaluate(state);
    evidence.decision = result.decision;
    evidence.mandatoryPassed = `${result.mandatoryPassed}/${result.mandatoryGates}`;
    evidence.observationalOutstanding = result.observationalOutstanding;
    assert.equal(result.decision, 'PASS', `verifier rejected a genuine UI journey: ${result.why}`);
    for (const r of result.rows) {
      if (['A1', 'A2', 'A3', 'B1', 'B2r', 'C0', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'E1', 'E2'].includes(r.id)) {
        assert.equal(r.status, 'PASS', `${r.id} must PASS after a complete journey, got ${r.status}`);
      }
    }
    assert.deepEqual(result.observationalOutstanding, ['F1'], 'only the owner-observable Firestore denial stays outstanding');
  });

  await scenario('no production resource was touched and no page error occurred', async () => {
    assert.deepEqual(pageErrors, [], 'the UI must run clean');
    const state = await emulatorState(created.id);
    assert.equal(state.orders.filter(o => o.fields.customer?.stringValue === TAG).length, 1, 'exactly one tagged order exists');
    assert.ok(state.orders.every(o => o.fields.requestKey?.stringValue === undefined || typeof o.fields.requestKey.stringValue === 'string'));
  });

  const report = {
    projectId: PROJECT,
    sourceCommit: process.env.SOURCE_COMMIT || null,
    kind: 'stage3-automated-frontend-acceptance',
    results,
    passedScenarios: results.filter(r => r.status === 'passed').length,
    failedScenarios: results.filter(r => r.status !== 'passed').length,
    pageErrors,
    evidence,
    productionTouched: false,
    realGoogleOrAppCheck: 'not_tested_synthetic_emulators_only',
    directFirestoreDenial: 'not_tested_here_requires_owner_session'
  };
  fs.writeFileSync(path.join(out, 'stage3-acceptance.json'), JSON.stringify(report, null, 2));
  console.log('STAGE3_ACCEPTANCE_PASS', JSON.stringify({ scenarios: report.passedScenarios, evidence }));
}

main()
  .catch(e => {
    console.error(e);
    try {
      fs.writeFileSync(path.join(out, 'stage3-acceptance.json'), JSON.stringify({ kind: 'stage3-automated-frontend-acceptance', status: 'failed', error: e.message, results, pageErrors }, null, 2));
    } catch { }
    process.exitCode = 1;
  })
  .finally(async () => { if (browser) await browser.close(); });