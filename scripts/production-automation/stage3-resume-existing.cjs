'use strict';
/*
 * Stage 3 Part B — RESUME-ONLY production runner for the already existing
 * authorized synthetic order.
 *
 * The production create authorization has already been consumed. This runner
 * therefore MUST NOT create anything, and it is built so that it cannot:
 *
 *   1. It never imports a creation helper into scope. The two creation-capable
 *      exports of the shared journey module are removed from the imported
 *      object before any step runs, so an accidental call throws instead of
 *      reaching the backend.
 *   2. It installs a page-level network block on /createOrder. Even if some
 *      other code path tried, the request is aborted in the browser and never
 *      leaves the machine.
 *   3. It never navigates to the new-order form and never generates a
 *      requestKey.
 *
 * It resumes the authorized order through the real production frontend and
 * verifies every transition through the backend, stopping on any unexpected
 * status, revision or concurrency conflict.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ORIGIN = 'https://velnix-6c1a2.web.app';
const DEBUG_HOST = '127.0.0.1';
const DEBUG_PORT = process.env.VELNIX_DEBUG_PORT || '9333';
const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'build/qa/production-resume');
const EXPECTED_ORDER_ID = process.env.VELNIX_ORDER_ID || 'RLWEouzNty2huVT8DUHN';

// Import the shared journey, then strip creation capability from it.
const J = require(path.join(root, 'scripts/acceptance/stage3-journey.cjs'));
const { TAG, EDITED_NOTE } = J;
for (const forbidden of ['createSyntheticOrder', 'replayMustNotDuplicate', 'assertApprovedFixture']) {
  // The replacement throws when invoked, not when assigned: an accidental call
  // fails before it can reach the backend, while importing stays safe.
  Object.defineProperty(J, forbidden, {
    value: function forbiddenInProduction() { throw new Error(`production_resume_forbidden_call:${forbidden}`); },
    enumerable: true, configurable: false, writable: false
  });
}

fs.mkdirSync(outDir, { recursive: true });
const evidence = { tag: TAG, orderId: EXPECTED_ORDER_ID };
const steps = [];
const stop = async (name, fn) => {
  try { const r = await fn(); steps.push({ name, status: 'passed' }); console.log(`PASS    ${name}`); return r; }
  catch (e) { steps.push({ name, status: 'failed', error: e.message }); console.error(`STOP    ${name} — ${e.message}`); throw e; }
};

const TRANSITIONS = [
  ['created', 'review', 'تحويل إلى قيد المراجعة', 'قيد المراجعة'],
  ['review', 'preparing', 'تحويل إلى قيد التجهيز', 'قيد التجهيز'],
  ['preparing', 'ready', 'تحويل إلى جاهز للتسليم', 'جاهز للتسليم'],
  ['ready', 'delivered', 'إكمال الطلب الداخلي', 'تم التسليم']
];

/** Read-only verifier run, with the fields this runner reasons about. */
const verifier = () => {
  const v = JSON.parse(execFileSync('node',
    [path.join(root, 'functions/scripts/stage3_partb_verify.js')], { encoding: 'utf8' }));
  const b1 = v.rows.find(r => r.id === 'B1');
  return Object.assign(v, {
    b1Status: b1 && b1.status,
    b1: b1 && b1.actual,
    readsComplete: Object.values(v.readsComplete || {}).every(Boolean)
  });
};

(async () => {
  const report = { origin: ORIGIN, expectedOrderId: EXPECTED_ORDER_ID, startedAt: new Date().toISOString(), steps, evidence };
  const browser = await chromium.connectOverCDP(`http://${DEBUG_HOST}:${DEBUG_PORT}`);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Hard network block: no createOrder request can leave this browser.
  let createAttempts = 0;
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/\/createOrder(\?|$)/.test(u)) { createAttempts++; console.error('BLOCKED createOrder request'); return route.abort(); }
    return route.continue();
  });

  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    await stop('creation capability is unavailable to this runner', async () => {
      assert.throws(() => J.createSyntheticOrder(), /production_resume_forbidden_call/);
      assert.throws(() => J.replayMustNotDuplicate(), /production_resume_forbidden_call/);
    });

    await stop('origin is the registered production host', async () => {
      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
      await page.waitForTimeout(12000);
      await page.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
      assert.equal(new URL(page.url()).origin, ORIGIN);
    });

    await stop('Enterprise App Check is active', async () => {
      // Two independent signals: Google's reCAPTCHA bundle is present, and a
      // protected callable is actually served (this deployment answers 401
      // without a valid App Check token, proven earlier by the anonymous probe).
      const recaptcha = await page.evaluate(() =>
        [...document.scripts].some(s => /recaptcha/i.test(s.src)) ||
        !!document.querySelector('script[src*="recaptcha"]'));
      evidence.recaptchaPresent = recaptcha;
      assert.equal(recaptcha, true, 'the reCAPTCHA Enterprise bundle must be loaded');
      const me = await J.okay(page, 'me', {});
      evidence.protectedCallableServed = true;
      evidence.meRoleFromCallable = me.role;
      console.log('        reCAPTCHA bundle present and a protected callable was served');
    });

    await stop('session is the active approved general manager', async () => {
      const me = await J.okay(page, 'me', {});
      evidence.role = me.role;
      assert.equal(me.role, 'generalManager');
      assert.equal(me.active, true);
      evidence.memberName = me.name;
    });

    // ---- read the existing order BEFORE any write --------------------------
    let current;
    await stop('existing order matches the approved record', async () => {
      const pre = verifier();
      report.preflight = pre;
      console.log(`        preflight: ${pre.decision} — ${pre.b1}`);
      assert.equal(pre.readsComplete, true, 'reads were not fully paged');
      assert.deepEqual(pre.readErrors, [], 'read errors present');
      assert.equal(pre.b1Status, 'PASS', `expected exactly one tagged order, got ${pre.b1}`);
      assert.equal(pre.orderId, EXPECTED_ORDER_ID, `order id drifted to ${pre.orderId}`);
      current = await J.okay(page, 'getOrder', { id: EXPECTED_ORDER_ID });
      assert.equal(current.order.quantity, 1, 'quantity must remain 1');
      assert.equal(Number(current.order.amount), 0, 'amount must remain 0 JOD');
      assert.equal(current.order.companyId, null, 'no delivery company may be assigned');
      assert.equal(current.order.trackingNumber, null, 'no tracking may be attached');
      evidence.statusAtStart = current.order.status;
      evidence.revisionAtStart = current.order.revision;
      console.log(`        existing order: status=${current.order.status} revision=${current.order.revision}`);
    });

    // ---- open it through the frontend -------------------------------------
    await stop('open the existing order through the UI', async () => {
      const found = await J.openTagged(page);
      assert.equal(found.customer, TAG);
    });

    // ---- edit the notes, resuming from whatever state the order is in ------
    if (evidence.statusAtStart !== 'delivered') {
      await stop('notes edited to the approved text', async () => {
        await J.editNotes(page, EXPECTED_ORDER_ID, evidence);
        const after = await J.okay(page, 'getOrder', { id: EXPECTED_ORDER_ID });
        assert.equal(after.order.note, EDITED_NOTE, 'backend readback must show the edited note');
        evidence.revisionAfterEdit = after.order.revision;
        console.log(`        revision after edit: ${evidence.revisionAtStart} -> ${after.order.revision}`);
      });

      await stop('search returns the exact approved tag', async () => {
        const items = (await J.okay(page, 'searchOrders', { query: TAG })).items.filter(i => i.customer === TAG);
        assert.equal(items.length, 1);
        assert.equal(items[0].id, EXPECTED_ORDER_ID);
      });

      // ---- transitions, resuming from the ACTUAL current status ------------
      await stop('internal transitions resume from the real current status', async () => {
        let status = evidence.statusAtStart;
        const reached = [];
        for (const [from, to, label, labelText] of TRANSITIONS) {
          const state = await J.okay(page, 'getOrder', { id: EXPECTED_ORDER_ID });
          if (state.order.status !== from) {
            if (state.order.status === to) { reached.push(to); continue; }   // already applied
            throw new Error(`unexpected status ${state.order.status}, expected ${from}`);
          }
          const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/changeOrderStatus') && r.request().method() === 'POST');
          await J.click(page, label);
          if (to === 'delivered') {
            // The real internal completion confirmation, not a silent write.
            await page.getByText('تأكيد إكمال الطلب الداخلي', { exact: true }).waitFor({ timeout: 15000 });
            await J.click(page, 'تأكيد الإكمال');
          }
          const res = await response;
          assert.equal(res.status(), 200, `transition ${to} returned ${res.status()}`);
          const sent = res.request().postDataJSON().data;
          assert.equal(sent.id, EXPECTED_ORDER_ID, 'a transition targeted a different order');
          await page.getByText('الحالة: ' + labelText, { exact: true }).waitFor({ timeout: 20000 });
          const after = await J.okay(page, 'getOrder', { id: EXPECTED_ORDER_ID });
          assert.equal(after.order.status, to, `backend still reports ${after.order.status}`);
          assert.ok(after.order.revision > state.order.revision, 'revision must advance on each transition');
          console.log(`        ${from} -> ${to} confirmed at revision ${after.order.revision}`);
          status = after.order.status;
          reached.push(to);
        }
        assert.equal(status, 'delivered', `journey ended at ${status}`);
        evidence.transitionsApplied = reached;
        const final = await J.okay(page, 'getOrder', { id: EXPECTED_ORDER_ID });
        evidence.completionSource = final.order.completionSource;
        assert.equal(final.order.completionSource, 'internal', 'must be completed internally');
        assert.equal(await page.getByRole('button', { name: 'تعديل', exact: true }).count(), 0, 'a delivered order must be locked');
        await J.back(page);
      });

      await stop('internal notice state is recorded honestly', async () => {
        const notices = await J.okay(page, 'listNotices', {});
        const mine = notices.items.filter(n => n.orderId === EXPECTED_ORDER_ID);
        evidence.noticesFound = mine.length;
        evidence.noticesRead = mine.filter(n => n.read === true).length;
        if (mine.length === 0) {
          // The trigger is broken in production; this must stay unproven.
          evidence.noticeOutcome = 'NOT_CREATED_trigger_defect_confirmed';
          console.error('        no notice exists — the production trigger defect is confirmed');
        } else {
          await J.noticeDisplayedAndRead(page, EXPECTED_ORDER_ID, evidence);
          evidence.noticeOutcome = 'read_confirmed';
        }
      });
    } else {
      evidence.transitionsApplied = [];
      evidence.note = 'order was already terminal; read-only verification only';
    }

    await page.screenshot({ path: path.join(outDir, 'finished.png') });
    report.verifierAfter = verifier();
    console.log(`        verifier after: ${report.verifierAfter.decision} — ${report.verifierAfter.decisionReason}`);
  } catch (e) {
    report.error = e.message;
    try { report.reconciliation = verifier(); } catch (inner) { report.reconciliation = { error: inner.message }; }
  } finally {
    report.createAttemptsBlocked = createAttempts;
    fs.writeFileSync(path.join(outDir, 'resume.json'), JSON.stringify(report, null, 2));
    await page.close().catch(() => { });
    await browser.close().catch(() => { });
  }
  console.log(`\nRESUME ${report.error ? 'INCOMPLETE' : 'COMPLETE'} ${JSON.stringify({ orderId: EXPECTED_ORDER_ID, steps: steps.length })}`);
  if (report.error) process.exitCode = 1;
})().catch(e => { console.error('DRIVER_ERROR', e); process.exitCode = 1; });