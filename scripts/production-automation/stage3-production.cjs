'use strict';
/*
 * Stage 3 Part B — the authorized production journey, executed exactly once.
 *
 * It imports the SAME reviewed journey the emulator suite runs
 * (scripts/acceptance/stage3-journey.cjs), so the fixture and every step are
 * identical by construction.
 *
 * Preconditions that must all hold before a single write is attempted:
 *   1. the dedicated loopback-only browser is attached;
 *   2. the origin is exactly https://velnix-6c1a2.web.app;
 *   3. the session is an active general manager with a verified Google identity;
 *   4. the read-only verifier reports ZERO orders carrying the approved tag.
 *
 * If any precondition fails the run aborts without touching production. If the
 * create is ambiguous the run also aborts and never resubmits; the caller
 * reconciles with read-only tooling instead.
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
const outDir = path.join(root, 'build/qa/production-journey');
const J = require(path.join(root, 'scripts/acceptance/stage3-journey.cjs'));
const { TAG } = J;

fs.mkdirSync(outDir, { recursive: true });
const evidence = { tag: TAG };
const steps = [];
const step = async (name, fn) => {
  try { const r = await fn(); steps.push({ name, status: 'passed' }); console.log(`PASS    ${name}`); return r; }
  catch (e) { steps.push({ name, status: 'failed', error: e.message }); console.error(`STOP    ${name} — ${e.message}`); throw e; }
};

/** Read-only: ask the verifier whether the approved tag is already present. */
function preflightDuplicateCheck() {
  const raw = execFileSync('node', [path.join(root, 'functions/scripts/stage3_partb_verify.js')], { encoding: 'utf8' });
  const v = JSON.parse(raw);
  const b1 = v.rows.find(r => r.id === 'B1');
  return {
    decision: v.decision, orderId: v.orderId, b1Status: b1 && b1.status, b1: b1 && b1.actual,
    readsComplete: Object.values(v.readsComplete || {}).every(Boolean), readErrors: v.readErrors
  };
}

(async () => {
  const report = { origin: ORIGIN, startedAt: new Date().toISOString(), steps, evidence, preflight: null, verifierAfter: null };
  const browser = await chromium.connectOverCDP(`http://${DEBUG_HOST}:${DEBUG_PORT}`);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // The journey addresses the Flutter canvas by coordinates proven at 1440x1000.
  // A CDP-attached window has no fixed viewport, so pin the metrics to match the
  // geometry the emulator suite verified instead of letting clicks miss silently.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false
  });

  try {
    // --- preconditions, all read-only --------------------------------------
    await step('origin is the registered production host', async () => {
      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 60000 });
      await page.waitForTimeout(12000);
      await page.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
      assert.equal(new URL(page.url()).origin, ORIGIN);
    });

    await step('session is an active general manager', async () => {
      const me = await J.okay(page, 'me', {});
      evidence.role = me.role;
      assert.equal(me.role, 'generalManager', `session role is ${me.role}`);
      assert.equal(me.active, true, 'the member profile must be active');
      evidence.memberName = me.name;
    });

    await step('approved tag does not already exist', async () => {
      const pre = preflightDuplicateCheck();
      report.preflight = pre;
      console.log(`        preflight: ${pre.b1}`);
      assert.equal(pre.readsComplete, true, 'reads were not fully paged; cannot trust the preflight');
      assert.deepEqual(pre.readErrors, [], 'read errors present; cannot trust the preflight');
      assert.equal(pre.b1Status, 'NOT TESTED', `unexpected: ${pre.b1}`);
      assert.equal(pre.orderId, null, `a tagged order already exists (${pre.orderId})`);
    });

    // --- the single authorized write ---------------------------------------
    await step('create one synthetic internal order through the UI', async () => {
      await J.createSyntheticOrder(page, {
        preflightConfirmedAbsent: true, evidence,
        shot: name => path.join(outDir, `${name}.png`)
      });
    });
    await step('stored order matches the approved fixture', () => J.assertApprovedFixture(page, evidence.orderId, evidence));
    await step('replaying the payload cannot create a duplicate', () => J.replayMustNotDuplicate(page, evidence.orderId, evidence));
    await step('notes edited through the UI', () => J.editNotes(page, evidence.orderId, evidence));
    await step('search by the exact approved tag', () => J.searchByTag(page, evidence));
    await step('four internal transitions with confirmation', () => J.fourInternalTransitions(page, evidence.orderId, evidence));
    await step('internal notice displayed and read', () => J.noticeDisplayedAndRead(page, evidence.orderId, evidence));
    await page.screenshot({ path: path.join(outDir, 'finished.png') });

    report.verifierAfter = preflightDuplicateCheck();
    console.log(`        verifier after: ${report.verifierAfter.decision} — ${report.verifierAfter.b1}`);
  } catch (e) {
    report.error = e.message;
    // Any failure after a save attempt is reconciled read-only, never by retrying.
    try { report.reconciliation = preflightDuplicateCheck(); } catch (inner) { report.reconciliation = { error: inner.message }; }
  } finally {
    delete evidence.payload; // the submitted create payload is never retained
    report.pageErrors = [];
    page.on('pageerror', e => report.pageErrors.push(e.message));
    fs.writeFileSync(path.join(outDir, 'journey.json'), JSON.stringify(report, null, 2));
    await page.close().catch(() => { });
    await browser.close().catch(() => { });
  }
  console.log(`\nJOURNEY ${report.error ? 'INCOMPLETE' : 'COMPLETE'} ${JSON.stringify({ orderId: evidence.orderId, steps: steps.length })}`);
  if (report.error) process.exitCode = 1;
})().catch(e => { console.error('DRIVER_ERROR', e); process.exitCode = 1; });