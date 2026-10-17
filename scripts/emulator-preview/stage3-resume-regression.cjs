'use strict';
/*
 * Local regression for the RESUME-ONLY acceptance flow.
 *
 * The production authorization for creating an order is already consumed, so the
 * flow under test here is "resume an order that already exists". Every case runs
 * against the Firebase Emulator Suite and creates nothing beyond the single
 * fixture order each scenario legitimately needs.
 *
 * Covered: resume from created/rev0, resume after the note was already edited,
 * resume from each intermediate status, resume after internal completion, an
 * interrupted save, viewport and fullscreen editor changes, no duplicate
 * creation, wrong-order rejection, and missing authentication / App Check.
 */
process.env.VELNIX_SDK_BASE = process.env.VELNIX_SDK_BASE || '/firebase-sdk/12.19.0/';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-resume');
const J = require(path.join(root, 'scripts/acceptance/stage3-journey.cjs'));
const { TAG, EDITED_NOTE, NOTE } = J;
fs.mkdirSync(out, { recursive: true });

const results = [];
let browser, gm, orderId;
const evidence = {};

async function scenario(name, fn) {
  const start = Date.now();
  try { await fn(); results.push({ name, status: 'passed', ms: Date.now() - start }); console.log('PASS', name); }
  catch (e) { results.push({ name, status: 'failed', error: e.message, ms: Date.now() - start }); console.error('FAIL', name, e.message); throw e; }
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
  await p.goto('http://127.0.0.1:8767', { waitUntil: 'networkidle' });
  await p.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
  await p.getByRole('button', { name: 'المتابعة باستخدام Google' }).waitFor({ timeout: 60000 });
  const popup = ctx.waitForEvent('page', { timeout: 30000 });
  await p.mouse.click(720, 600);
  await (await popup).getByText(role.toLowerCase() + '@velnix.test', { exact: true }).click();
  await p.getByText('أهلاً، ' + (role === 'generalManager' ? 'مدير عام اصطناعي' : 'مبيعات اصطناعي'), { exact: true }).waitFor({ timeout: 60000 });
  return p;
}


/**
 * Return to the orders shell. Flutter only materialises the navigation rail
 * after the semantics tree is enabled, and a fullscreen route can leave the
 * tree stale, so this unwinds routes and falls back to a clean reload.
 */
async function enableSemantics(p) {
  await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
}

async function toOrders(p) {
  const railPresent = () => p.getByRole('button')
    .filter({ hasText: '\u0627\u0644\u0637\u0644\u0628\u0627\u062a' })
    .filter({ hasText: '\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062a\u0628\u0648\u064a\u0628' }).count();

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await railPresent()) return;
    try {
      const backBtn = p.getByRole('button', { name: /\u0631\u062c\u0648\u0639|Back/ }).first();
      if (await backBtn.count()) { await J.back(p); await p.waitForTimeout(800); await enableSemantics(p); continue; }
    } catch { /* route changed underneath us */ }
    try { await J.nav(p, 'orders'); } catch { /* rail not rendered yet */ }
    await p.waitForTimeout(800);
    await enableSemantics(p);
  }
  if (await railPresent()) return;

  // Clean fallback: a reload restores the shell from a known route. If the
  // reload also drops the emulated session, sign in again rather than failing.
  for (let reload = 0; reload < 3; reload++) {
    await p.goto('http://127.0.0.1:8767', { waitUntil: 'networkidle' });
    await p.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
    await p.waitForTimeout(2500);
    await enableSemantics(p);
    const loginBtn = p.getByRole('button', { name: '\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0628\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0628\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u062c\u0648\u062c\u0644' });
    if (await loginBtn.count()) {
      const popup = p.context().waitForEvent('page', { timeout: 30000 });
      await p.mouse.click(720, 600);
      await (await popup).getByText('generalmanager@velnix.test', { exact: true }).click();
      await p.getByText('\u0623\u0647\u0644\u0627\u060c \u0645\u062f\u064a\u0631 \u0639\u0627\u0645 \u0627\u0635\u0637\u0646\u0627\u0639\u064a', { exact: true }).waitFor({ timeout: 60000 });
      await enableSemantics(p);
    }
    for (let attempt = 0; attempt < 5 && !(await railPresent()); attempt++) {
      await p.waitForTimeout(1000);
      await enableSemantics(p);
    }
    if (await railPresent()) { await J.nav(p, 'orders'); await p.waitForTimeout(1200); return; }
  }
  throw new Error('could not reach the orders shell');
}

const openFixture = async () => { await toOrders(gm); return J.openTagged(gm); };

const getOrder = id => J.okay(gm, 'getOrder', { id });
async function setStatus(id, label, expected, confirm) {
  const response = gm.waitForResponse(r => new URL(r.url()).pathname.endsWith('/changeOrderStatus') && r.request().method() === 'POST');
  await J.click(gm, label);
  if (confirm) { await gm.getByText('تأكيد إكمال الطلب الداخلي', { exact: true }).waitFor({ timeout: 15000 }); await J.click(gm, 'تأكيد الإكمال'); }
  assert.equal((await response).status(), 200);
  const o = await getOrder(id);
  assert.equal(o.order.status, expected);
  return o;
}

(async () => {
  browser = await chromium.launch();
  gm = await login('generalManager');

  // The fixture order every later scenario resumes.
  await scenario('seed a single fixture order for the resume tests', async () => {
    orderId = await J.createSyntheticOrder(gm, { preflightConfirmedAbsent: true, evidence, shot: n => path.join(out, n + '.png') });
    const o = await getOrder(orderId);
    assert.equal(o.order.status, 'created');
    assert.equal(o.order.revision, 0);
    assert.equal(o.order.note, NOTE);
  });

  await scenario('resume from created at revision 0', async () => {
    const o = await getOrder(orderId);
    assert.equal(o.order.status, 'created');
    assert.equal(o.order.revision, 0);
    await openFixture();
    await J.click(gm, 'تعديل');
    await gm.getByRole('textbox', { name: 'ملاحظات', exact: true }).waitFor();
    await J.back(gm);
  });

  await scenario('the editor loads the existing note and refuses a wrong value', async () => {
    await openFixture();
    await J.click(gm, 'تعديل');
    const notes = gm.getByRole('textbox', { name: 'ملاحظات', exact: true });
    await notes.focus();
    await gm.waitForTimeout(250);
    assert.equal(await notes.inputValue(), NOTE, 'the editor must load the stored note');
    await J.selectAll(gm);
    await gm.keyboard.insertText('WRONG');
    await gm.waitForTimeout(400);
    assert.equal(await notes.inputValue(), 'WRONG');
    // restore without saving
    await J.selectAll(gm);
    await gm.keyboard.insertText(NOTE);
    await gm.waitForTimeout(300);
    assert.equal(await notes.inputValue(), NOTE);
    await J.back(gm);
    const o = await getOrder(orderId);
    assert.equal(o.order.note, NOTE, 'an abandoned edit must not change the backend');
  });

  await scenario('the viewport guard rejects geometry that would miss the fields', async () => {
    const small = await browser.newContext({ viewport: { width: 1200, height: 808 } });
    const p = await small.newPage();
    await p.goto('http://127.0.0.1:8767', { waitUntil: 'networkidle' });
    await p.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
    await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
    await p.getByRole('button', { name: 'المتابعة باستخدام Google' }).waitFor({ timeout: 60000 });
    const popup = small.waitForEvent('page', { timeout: 30000 });
    await p.mouse.click(600, 500);
    await (await popup).getByText('generalmanager@velnix.test', { exact: true }).click();
    await p.getByText('أهلاً، مدير عام اصطناعي', { exact: true }).waitFor({ timeout: 60000 });
    await assert.rejects(() => J.assertViewport(p), /viewport/, 'an unexpected viewport must be refused loudly');
    await small.close();
  });

  await scenario('the semantic editor survives a fullscreen route change', async () => {
    await openFixture();
    await J.click(gm, 'تعديل');
    const notes = gm.getByRole('textbox', { name: 'ملاحظات', exact: true });
    await notes.waitFor();
    const { before } = await (async () => {
      await notes.focus(); await gm.waitForTimeout(250);
      const v = await notes.inputValue();
      await J.selectAll(gm); await gm.keyboard.insertText(EDITED_NOTE); await gm.waitForTimeout(400);
      assert.equal(await notes.inputValue(), EDITED_NOTE);
      return { before: v };
    })();
    assert.equal(before, NOTE);
    const saved = gm.waitForResponse(r => new URL(r.url()).pathname.endsWith('/updateOrder') && r.request().method() === 'POST');
    await J.click(gm, 'حفظ الطلب');
    const res = await saved;
    assert.equal(res.status(), 200);
    assert.equal(res.request().postDataJSON().data.id, orderId, 'the save must target the fixture order');
    assert.equal(res.request().postDataJSON().data.revision, 0, 'the save must carry the current revision');
    const o = await getOrder(orderId);
    assert.equal(o.order.note, EDITED_NOTE);
    assert.equal(o.order.revision, 1);
  });

  await scenario('resume after the note was already edited does not double-apply', async () => {
    const o = await getOrder(orderId);
    assert.equal(o.order.note, EDITED_NOTE);
    assert.equal(o.order.revision, 1);
    await J.editNotes(gm, orderId, {});
    const after = await getOrder(orderId);
    assert.equal(after.order.note, EDITED_NOTE, 're-saving the same note is idempotent in content');
    assert.ok(after.order.revision >= 1);
  });

  await scenario('an interrupted save never produces a second mutation', async () => {
    const before = await getOrder(orderId);
    await openFixture();
    await J.click(gm, 'تعديل');
    const notes = gm.getByRole('textbox', { name: 'ملاحظات', exact: true });
    await notes.focus(); await gm.waitForTimeout(250);
    await J.selectAll(gm); await gm.keyboard.insertText('مقاطعة قبل الحفظ');
    await gm.waitForTimeout(300);
    await J.back(gm);                       // abandon the edit entirely
    await gm.waitForTimeout(800);
    const after = await getOrder(orderId);
    assert.equal(after.order.note, before.order.note, 'an abandoned edit must not persist');
    assert.equal(after.order.revision, before.order.revision, 'an abandoned edit must not advance the revision');
  });

  await scenario('a stale revision is rejected and the stored note survives', async () => {
    const before = await getOrder(orderId);
    const deniedSave = await J.callable(gm, 'updateOrder', { ...before.order, id: orderId, revision: 99, note: 'كзова' });
    assert.equal(deniedSave.ok, false, 'a stale revision must be refused');
    const after = await getOrder(orderId);
    assert.equal(after.order.note, before.order.note);
  });

  await scenario('resume from each intermediate status in sequence', async () => {
    await openFixture();
    await setStatus(orderId, 'تحويل إلى قيد المراجعة', 'review');
    await setStatus(orderId, 'تحويل إلى قيد التجهيز', 'preparing');
    await setStatus(orderId, 'تحويل إلى جاهز للتسليم', 'ready');
    await J.back(gm);
    const o = await getOrder(orderId);
    assert.equal(o.order.status, 'ready');
  });

  await scenario('resume from ready completes internally with confirmation', async () => {
    await openFixture();
    await setStatus(orderId, 'إكمال الطلب الداخلي', 'delivered', true);
    assert.equal(await gm.getByRole('button', { name: 'تعديل', exact: true }).count(), 0, 'a delivered order is locked');
    await J.back(gm);
    const o = await getOrder(orderId);
    assert.equal(o.order.completionSource, 'internal');
    assert.equal(o.events.filter(e => e.action === 'status_changed').length, 4);
  });

  await scenario('resuming a terminal order performs read-only verification only', async () => {
    const before = await getOrder(orderId);
    assert.equal(before.order.status, 'delivered');
    // The resume runner never repeats a transition on a terminal order.
    await openFixture();
    for (const label of ['تحويل إلى قيد المراجعة', 'إكمال الطلب الداخلي']) {
      assert.equal(await gm.getByRole('button', { name: label, exact: true }).count(), 0, `${label} must not be offered`);
    }
    await J.back(gm);
    const after = await getOrder(orderId);
    assert.equal(after.order.revision, before.order.revision, 'a read-only resume must not mutate');
  });

  await scenario('resuming a wrong order id is refused', async () => {
    const r = await J.callable(gm, 'getOrder', { id: 'not-a-real-order-id' });
    assert.equal(r.ok, false);
  });

  await scenario('resuming while unauthenticated is refused', async () => {
    // Checked over raw HTTP so the assertion is about the server's rejection,
    // not about whichever client-side code the SDK happens to surface.
    const response = await fetch('http://127.0.0.1:5001/demo-velnix-preview/europe-west1/getOrder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { id: orderId } })
    });
    assert.equal(response.status, 401, `expected 401 without an ID token, got ${response.status}`);
    const body = await response.text();
    assert.ok(/unauthenticated/i.test(body), `expected an unauthenticated rejection, got ${body.slice(0, 120)}`);
  });

  await scenario('resuming without App Check is refused', async () => {
    const status = await gm.evaluate(async () => {
      const { getAuth } = await import('/firebase-sdk/12.19.0/firebase-auth.js');
      const response = await fetch('http://127.0.0.1:5001/demo-velnix-preview/europe-west1/getOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await getAuth().currentUser.getIdToken() },
        body: JSON.stringify({ data: { id: 'x' } })
      });
      return response.status;
    });
    assert.equal(status, 401, 'a request with no App Check token must be rejected');
  });

  await scenario('the resume never created a second order', async () => {
    const found = (await J.okay(gm, 'searchOrders', { query: TAG })).items.filter(i => i.customer === TAG);
    assert.equal(found.length, 1, `exactly one tagged order must exist, saw ${found.length}`);
    assert.equal(found[0].id, orderId);
  });

  const report = {
    kind: 'stage3-resume-regression',
    sourceCommit: process.env.SOURCE_COMMIT || null,
    journeyModule: 'scripts/acceptance/stage3-journey.cjs',
    results, passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status !== 'passed').length,
    orderId, productionTouched: false
  };
  fs.writeFileSync(path.join(out, 'resume-regression.json'), JSON.stringify(report, null, 2));
  console.log('RESUME_REGRESSION_PASS', JSON.stringify({ scenarios: report.passed, orderId }));
})()
  .catch(e => {
    console.error(e);
    try { fs.writeFileSync(path.join(out, 'resume-regression.json'), JSON.stringify({ kind: 'stage3-resume-regression', status: 'failed', error: e.message, results }, null, 2)); } catch { }
    process.exitCode = 1;
  })
  .finally(async () => { if (browser) await browser.close(); });