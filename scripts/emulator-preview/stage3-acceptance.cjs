'use strict';
/*
 * Stage 3 Part B — automated frontend acceptance, driven against the Firebase
 * Emulator Suite.
 *
 * The fixture and every journey step live in scripts/acceptance/stage3-journey.cjs,
 * which the production runner imports too, so both environments execute the same
 * reviewed code.
 *
 * The real Velnix UI, the real Cloud Functions, the real Firestore rules and the
 * real authorization policy all run here. Only the identity provider is synthetic,
 * because the Auth emulator stands in for Google, so no real Google account,
 * cookie or token is ever involved. The preview entrypoint refuses any non-loopback
 * origin, so this file cannot reach production.
 */
process.env.VELNIX_SDK_BASE = process.env.VELNIX_SDK_BASE || '/firebase-sdk/12.19.0/';

const assert = require('node:assert/strict');
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function activate(p, locator) { await p.bringToFront(); await p.waitForTimeout(60); await locator.evaluate(el => (el.closest('[flt-tappable]') || el).click()); await frame(p); }
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-ui');
const load = id => require(require.resolve(id, { paths: [path.join(root, 'functions')] }));
const { evaluate } = require(path.join(root, 'functions/scripts/stage3_partb_verify.js'));
const J = require(path.join(root, 'scripts/acceptance/stage3-journey.cjs'));
const { TAG, PHONE } = J;

fs.mkdirSync(out, { recursive: true });
const PROJECT = 'demo-velnix-preview';

const results = [];
const pageErrors = [];
const evidence = { tag: TAG, phone: PHONE };
let browser;
let gm;
const shot = name => path.join(out, `stage3-${name}.png`);

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
  await activate(p, p.getByRole('button', { name: 'المتابعة باستخدام Google' }).first());
  await (await popup).getByText(role.toLowerCase() + '@velnix.test', { exact: true }).click();
  await p.getByText('أهلاً، ' + (role === 'generalManager' ? 'مدير عام اصطناعي' : 'مبيعات اصطناعي'), { exact: true }).waitFor({ timeout: 60000 });
  return p;
}

// --------------------------------------- emulator state in the verifier's shape
function toField(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object' && typeof v.path === 'string') return { referenceValue: v.path };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toField) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toField(x)])) } };
}
const doc = (id, coll, data) => ({ name: `projects/p/databases/(default)/documents/${coll}/${id}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toField(v)])) });

async function emulatorState(orderId) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.METADATA_SERVER_DETECTION = 'none';
  const { initializeApp, getApps } = load('firebase-admin/app');
  const { getFirestore } = load('firebase-admin/firestore');
  const { getAuth } = load('firebase-admin/auth');
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  const db = getFirestore();

  const orderEvents = {};
  if (orderId) {
    const ev = await db.doc('orders/' + orderId).collection('events').get();
    orderEvents[orderId] = ev.docs.map(d => doc(d.id, `orders/${orderId}/events`, d.data()));
  }
  // Only the flags the gate needs are carried forward: no uid, no email, no token.
  const listed = await getAuth().listUsers();
  return {
    members: (await db.collection('members').get()).docs.map(d => doc(d.id, 'members', d.data())),
    orders: (await db.collection('orders').get()).docs.map(d => doc(d.id, 'orders', d.data())),
    idempotency: (await db.collection('idempotency').get()).docs.map(d => doc(d.id, 'idempotency', d.data())),
    notices: (await db.collection('notices').get()).docs.map(d => doc(d.id, 'notices', d.data())),
    audit: (await db.collection('auditEvents').get()).docs.map(d => doc(d.id, 'auditEvents', d.data())),
    users: listed.users.map(u => ({
      disabled: u.disabled === true, emailVerified: u.emailVerified === true,
      providerUserInfo: (u.providerData || []).map(p => ({ providerId: p.providerId }))
    })),
    orderEvents, errors: {}, orderPages: 'complete',
    complete: { members: true, orders: true, idempotency: true, notices: true, audit: true, users: true }
  };
}

async function main() {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  await scenario('GM dashboard renders for the authenticated internal session', async () => {
    gm = await login('generalManager');
    await J.nav(gm, 'home');
    await gm.locator('flt-glass-pane').waitFor({ state: 'attached' });
    await gm.screenshot({ path: shot('dashboard') });
  });

  await scenario('one synthetic internal order is created through the real UI form', async () => {
    await J.createSyntheticOrder(gm, { preflightConfirmedAbsent: true, evidence, shot });
  });

  await scenario('the order carries exactly the approved synthetic fixture', async () => {
    await J.assertApprovedFixture(gm, evidence.orderId, evidence);
  });

  await scenario('replaying the identical UI payload does not create a second order', async () => {
    await J.replayMustNotDuplicate(gm, evidence.orderId, evidence);
  });

  await scenario('notes are edited through the UI and the revision advances', async () => {
    await J.editNotes(gm, evidence.orderId, evidence);
  });

  await scenario('search by the exact approved tag returns the single order', async () => {
    await J.searchByTag(gm, evidence);
    await gm.screenshot({ path: shot('searched') });
  });

  await scenario('four internal transitions complete the order and lock it', async () => {
    await J.fourInternalTransitions(gm, evidence.orderId, evidence);
    await gm.screenshot({ path: shot('completed') });
  });

  await scenario('the internal notice is displayed and marked read', async () => {
    await J.noticeDisplayedAndRead(gm, evidence.orderId, evidence);
    await gm.screenshot({ path: shot('notices') });
  });

  await scenario('an unprivileged role cannot complete or edit the internal order', async () => {
    const sales = await login('sales');
    await J.denied(sales, 'updateOrder', { id: evidence.orderId, revision: 1, note: 'محاولة تصعيد مرفوضة' });
    await J.denied(sales, 'markNoticeRead', { id: 'any' });
    await sales.context().close();
  });

  await scenario('the read-only verifier accepts the UI-produced journey', async () => {
    const result = evaluate(await emulatorState(evidence.orderId));
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
    const state = await emulatorState(evidence.orderId);
    assert.equal(state.orders.filter(o => o.fields.customer?.stringValue === TAG).length, 1, 'exactly one tagged order exists');
  });

  delete evidence.payload; // the submitted create payload is never retained

  const report = {
    projectId: PROJECT,
    sourceCommit: process.env.SOURCE_COMMIT || null,
    kind: 'stage3-automated-frontend-acceptance',
    journeyModule: 'scripts/acceptance/stage3-journey.cjs',
    results,
    passedScenarios: results.filter(r => r.status === 'passed').length,
    failedScenarios: results.filter(r => r.status !== 'passed').length,
    pageErrors, evidence, productionTouched: false,
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
      fs.writeFileSync(path.join(out, 'stage3-acceptance.json'),
        JSON.stringify({ kind: 'stage3-automated-frontend-acceptance', status: 'failed', error: e.message, results, pageErrors }, null, 2));
    } catch { }
    process.exitCode = 1;
  })
  .finally(async () => { if (browser) await browser.close(); });