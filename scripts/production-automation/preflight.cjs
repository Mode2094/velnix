'use strict';
/*
 * Stage 3 production preflight — strictly READ-ONLY.
 *
 * Proves the automation path is sound BEFORE any production write is considered:
 * correct origin, genuine Enterprise App Check, enforced callables, and the
 * duplicate pre-check for the approved tag.
 *
 * This file performs no mutation. It never creates, edits, transitions or
 * deletes an order, and it never reads, copies or writes the owner's personal
 * browser profile, cookies or Google tokens. The dedicated profile starts empty
 * and only the owner's own manual Google sign-in can populate it.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://velnix-6c1a2.web.app';
const ALIAS_HOST = 'velnix-6c1a2.firebaseapp.com';
const FUNCTIONS_ORIGIN = 'https://europe-west1-velnix-6c1a2.cloudfunctions.net';
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const DEBUG_HOST = '127.0.0.1';
const DEBUG_PORT = process.env.VELNIX_DEBUG_PORT || '9333';
const outDir = path.resolve(__dirname, '../../build/qa/production-preflight');

const report = { origin: ORIGIN, checks: [], appCheck: {}, authState: {}, callableEnforcement: {}, verifier: null };
const record = (name, detail, passed) => {
  report.checks.push({ name, detail, status: passed ? 'PASS' : 'BLOCKED' });
  console.log(`${passed ? 'PASS   ' : 'BLOCKED'}  ${name} — ${detail}`);
  return passed;
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://${DEBUG_HOST}:${DEBUG_PORT}`);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  const hosts = new Set();
  const sdkLoaded = new Set();
  page.on('request', r => {
    try { hosts.add(new URL(r.url()).host); } catch { }
    if (r.url().includes('/firebasejs/')) sdkLoaded.add(new URL(r.url()).pathname.split('/').pop());
  });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000); // let reCAPTCHA Enterprise settle

  // ---- 1. correct origin, no silent redirect to the alias host -------------
  const landed = new URL(page.url());
  record('origin', `landed on ${landed.origin}`, landed.origin === ORIGIN);
  record('no alias redirect', `host is ${landed.host}`, landed.host !== ALIAS_HOST);

  // ---- 2. genuine Enterprise App Check ------------------------------------
  // Evidence: Google's reCAPTCHA bundle is fetched AND the App Check service is
  // actually contacted to exchange a token. A missing or stubbed provider shows
  // up here as an absent host.
  const recaptchaLoaded = [...hosts].some(h => h === 'www.gstatic.com') &&
    (await page.evaluate(() => [...document.scripts].some(s => /recaptcha/i.test(s.src)) ||
      !!document.querySelector('script[src*="recaptcha"]')));
  const appCheckService = [...hosts].filter(h => h.includes('firebaseappcheck.googleapis.com'));
  report.appCheck = {
    recaptchaScriptPresent: recaptchaLoaded,
    appCheckServiceHosts: appCheckService,
    firebaseModulesLoaded: [...sdkLoaded]
  };
  record('Enterprise reCAPTCHA loaded', recaptchaLoaded ? 'reCAPTCHA bundle present in the document' : 'absent', recaptchaLoaded);
  record('App Check service contacted', appCheckService.join(', ') || 'none observed', appCheckService.length > 0);

  // ---- 3. authentication state, read from the UI itself -------------------
  // The UI is the trustworthy signal: a login button means no session at all.
  let signedIn = false, marker = 'none';
  try {
    await page.locator('flt-glass-pane').waitFor({ state: 'attached', timeout: 30000 });
    await page.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
    const login = page.getByRole('button', { name: 'المتابعة باستخدام Google' });
    if (await login.count() > 0) { marker = 'login button present'; signedIn = false; }
    else { marker = 'no login button found'; }
  } catch (e) { marker = 'probe error: ' + (e && e.message); }
  report.authState = { signedIn, marker };
  record('authenticated GM session present', marker, signedIn);

  // ---- 4. callable enforcement, probed independently from Node -------------
  // No page SDK coupling and no credentials: this must be refused by the server.
  let enforced = { rejected: false };
  try {
    const res = await fetch(`${FUNCTIONS_ORIGIN}/listNotices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} })
    });
    const text = await res.text();
    enforced = { rejected: res.status !== 200, status: res.status, body: text.slice(0, 200) };
  } catch (e) { enforced = { rejected: false, error: String(e && e.message) }; }
  report.callableEnforcement = enforced;
  record('callable refuses anonymous callers',
    enforced.rejected ? `HTTP ${enforced.status}` : `returned ${enforced.status}`,
    enforced.rejected === true);

  await page.screenshot({ path: path.join(outDir, 'preflight.png') });
  await page.close();
  await browser.close();

  // ---- 5. duplicate pre-check for the approved tag ------------------------
  try {
    const { execFileSync } = require('node:child_process');
    const v = JSON.parse(execFileSync('node',
      [path.resolve(__dirname, '../../functions/scripts/stage3_partb_verify.js')],
      { encoding: 'utf8' }));
    const b1 = v.rows.find(r => r.id === 'B1');
    report.verifier = {
      decision: v.decision, orderId: v.orderId, b1Status: b1 && b1.status, b1: b1 && b1.actual,
      readsComplete: Object.values(v.readsComplete || {}).every(Boolean), readErrors: v.readErrors
    };
    record('duplicate pre-check for the approved tag',
      `${b1 && b1.actual}`, b1 && b1.status === 'NOT TESTED' && report.verifier.orderId === null);
  } catch (e) {
    report.verifier = { error: String(e && e.message) };
    record('duplicate pre-check for the approved tag', 'verifier did not run', false);
  }

  const blocked = report.checks.filter(c => c.status === 'BLOCKED');
  report.summary = { passed: report.checks.length - blocked.length, blocked: blocked.length };
  fs.writeFileSync(path.join(outDir, 'preflight.json'), JSON.stringify(report, null, 2));
  console.log(`\nPREFLIGHT ${blocked.length ? 'BLOCKED' : 'PASS'} ${JSON.stringify(report.summary)}`);
})().catch(e => { console.error('PREFLIGHT_ERROR', e); process.exitCode = 1; });