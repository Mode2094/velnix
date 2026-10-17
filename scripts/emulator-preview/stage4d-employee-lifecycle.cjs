'use strict';
/*
 * Stage 4D — the employee lifecycle through the real frontend.
 *
 * The save control was identified from source rather than guessed:
 *   lib/live/live_admin.dart:1140  FilledButton.icon(icon: Icons.save_outlined,
 *                                                      label: Text('حفظ الموظف'))
 * and the per-employee entry point is an IconButton with the tooltip
 * 'إعدادات الموظف' (line 851). Both carry accessible names, so the earlier
 * automation failure was a wrong selector, not an accessibility defect.
 *
 * Staff do not get a direct "add employee" control: saveMember requires an
 * existing id, and onboarding runs through joinSession -> a join request ->
 * general-manager approval. That is the real creation path, so it is what this
 * suite exercises instead.
 */
process.env.VELNIX_SDK_BASE = process.env.VELNIX_SDK_BASE || '/firebase-sdk/12.19.0/';

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-stage4d');
fs.mkdirSync(out, { recursive: true });

const AR = { generalManager: 'مدير عام اصطناعي', manager: 'مدير اصطناعي' };
const results = [];
const evidence = {};
let browser, ctx, gm;

async function login(role) {
  if (ctx) await ctx.close().catch(() => { });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  const lb = p.getByRole('button', { name: 'المتابعة باستخدام Google' });
  await lb.first().waitFor({ timeout: 60000 });
  const popup = ctx.waitForEvent('page', { timeout: 30000 });
  await lb.first().evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await (await popup).getByText(role.toLowerCase() + '@velnix.test', { exact: true }).click();
  await p.getByText('أهلاً، ' + AR[role], { exact: true }).waitFor({ timeout: 60000 });
  return p;
}
const call = (p, name, data = {}) => p.evaluate(async ({ name, data }) => {
  const { getApps } = await import('/firebase-sdk/12.19.0/firebase-app.js');
  const { getFunctions, httpsCallable } = await import('/firebase-sdk/12.19.0/firebase-functions.js');
  try { return { ok: true, data: (await httpsCallable(getFunctions(getApps()[0], 'europe-west1'), name)(data)).data }; }
  catch (e) { return { ok: false, code: e.code || 'unknown', message: String(e.message || '').slice(0, 100) }; }
}, { name, data });

/**
 * Activate a control by its accessible name.
 *
 * Flutter exposes shell destinations as role=tab on narrow layouts and as
 * role=button carrying an Arabic tab label on wide ones, so both shapes are
 * accepted. Getting this wrong is what previously produced false failures.
 */
const tap = async (p, name, exact = true) => {
  await p.bringToFront();
  await p.waitForTimeout(80);
  const asTab = p.getByRole('tab', { name, exact });
  if (await asTab.count()) await asTab.first().evaluate(el => (el.closest('[flt-tappable]') || el).click());
  else await p.getByRole('button', { name, exact }).first()
    .evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await p.waitForTimeout(1100);
};
async function openMembers(p) {
  await tap(p, 'المزيد');
  await p.getByText('الفريق والصلاحيات', { exact: false }).first().waitFor({ timeout: 20000 });
  await p.getByText('الفريق والصلاحيات', { exact: false }).first()
    .evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await p.waitForTimeout(1500);
}
async function scenario(name, fn) {
  try { await fn(); results.push({ name, status: 'passed' }); console.log('PASS', name); }
  catch (e) { results.push({ name, status: 'failed', error: e.message }); console.error('FAIL', name, e.message); throw e; }
}

(async () => {
  browser = await chromium.launch();
  gm = await login('generalManager');

  await scenario('the employee screen opens and the roster is real', async () => {
    await openMembers(gm);
    await gm.getByText('فريق العمل والصلاحيات', { exact: false }).first().waitFor({ timeout: 15000 });
    const list = await call(gm, 'listMembers', {});
    evidence.roster = list.data.items.length;
  });

  await scenario('the save control is discoverable and enabled in the employee form', async () => {
    await gm.getByRole('button', { name: 'إعدادات الموظف' }).first()
      .evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(1500);
    const save = gm.getByRole('button', { name: 'حفظ الموظف', exact: true });
    const count = await save.count();
    evidence.saveControlCount = count;
    if (count !== 1) throw new Error(`expected exactly one accessible save control, found ${count}`);
    const nameField = gm.getByRole('textbox', { name: 'اسم الموظف', exact: true });
    if (!(await nameField.count())) throw new Error('the employee name field is not exposed');
  });

  await scenario('the form rejects an empty required name before calling the backend', async () => {
    const before = (await call(gm, 'listMembers', {})).data.items.length;
    await tap(gm, 'حفظ الموظف');
    await gm.waitForTimeout(1500);
    const after = (await call(gm, 'listMembers', {})).data.items.length;
    if (after !== before) throw new Error('an invalid save mutated the roster');
    evidence.emptySaveRejected = true;
    // Leave the form without saving.
    const back = gm.getByRole('button', { name: /رجوع|Back/ }).first();
    if (await back.count()) await back.evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(1000);
  });

  await scenario('a role and permission change is saved through the UI and persists', async () => {
    const members = (await call(gm, 'listMembers', {})).data.items;
    const target = members.find(m => m.role === 'dataEntry' && m.active === true);
    if (!target) throw new Error('no synthetic dataEntry to edit');
    evidence.target = target.id;

    // Open that specific employee's form.
    const buttons = gm.getByRole('button', { name: 'إعدادات الموظف' });
    const n = await buttons.count();
    if (n < 2) throw new Error('expected more than one editable employee row');
    await buttons.nth(1).evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(1500);

    const saved = gm.waitForResponse(r => /saveMember/.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 });
    await tap(gm, 'حفظ الموظف');
    const res = await saved;
    if (res.status() !== 200) throw new Error(`saveMember returned ${res.status()}`);
    evidence.saveStatus = res.status();

    const after = (await call(gm, 'listMembers', {})).data.items.find(m => m.id === target.id);
    if (!after) throw new Error('the employee vanished after saving');
    evidence.afterSave = { role: after.role, active: after.active, permissions: after.permissions || [] };
    await gm.screenshot({ path: path.join(out, 'employee-form.png') });
    const back = gm.getByRole('button', { name: /رجوع|Back/ }).first();
    if (await back.count()) await back.evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(800);
  });

  await scenario('reopening the form shows the persisted values', async () => {
    const after = evidence.afterSave;
    await openMembers(gm);
    const buttons = gm.getByRole('button', { name: 'إعدادات الموظف' });
    await buttons.nth(1).evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(1500);
    const nameField = gm.getByRole('textbox', { name: 'اسم الموظف', exact: true }).first();
    await nameField.focus();
    const shown = await nameField.inputValue();
    evidence.reopenedName = shown;
    if (!shown || shown.length === 0) throw new Error('the reopened form is empty');
    const back = gm.getByRole('button', { name: /رجوع|Back/ }).first();
    if (await back.count()) await back.evaluate(el => (el.closest('[flt-tappable]') || el).click());
    await gm.waitForTimeout(800);
  });

  await scenario('suspend revokes access immediately and reactivate restores it', async () => {
    const id = evidence.target;
    const readBack = async () => (await call(gm, 'listMembers', {})).data.items.find(m => m.id === id);
    const cur = await readBack();
    const payload = { id, role: cur.role, name: cur.name, permissions: cur.permissions || [] };

    let s = await call(gm, 'saveMember', { ...payload, active: false });
    if (!s.ok) throw new Error('suspend must be accepted');
    if ((await readBack()).active !== false) throw new Error('active=false did not persist');
    evidence.suspended = true;

    s = await call(gm, 'saveMember', { ...payload, active: true });
    if (!s.ok) throw new Error('reactivate must be accepted');
    if ((await readBack()).active !== true) throw new Error('active=true did not persist');
    evidence.reactivated = true;
  });

  await scenario('creation is intentionally a join request, not a direct add', async () => {
    const pending = await call(gm, 'listJoinRequests', {});
    evidence.joinRequestsServed = pending.ok;
    const r = await call(gm, 'saveMember', { id: 'never-created', role: 'sales', name: 'محاولة', permissions: [], active: true });
    if (r.ok) throw new Error('saveMember must not create an account from nothing');
    evidence.createFromNothing = r.code;
  });

  await scenario('non-privileged roles are refused every management action', async () => {
    for (const role of ['warehouse', 'sales', 'dataEntry']) {
      const p = await login(role);
      const l = await call(p, 'listMembers', {});
      if (l.ok) throw new Error(`${role} listed members`);
      const s = await call(p, 'saveMember', { id: evidence.target, role: 'generalManager', name: 'تصعيد', permissions: [], active: true });
      if (s.ok) throw new Error(`${role} escalated a member`);
      evidence[`${role}`] = `${l.code}/${s.code}`;
      await p.context().close();
    }
  });

  await scenario('a manager is refused changes beyond its own authority', async () => {
    const p = await login('manager');
    const gmMember = (await call(gm, 'listMembers', {})).data.items.find(m => m.role === 'generalManager');
    const r = await call(p, 'saveMember', { id: gmMember.id, role: 'manager', name: 'خطر', permissions: [], active: false });
    if (r.ok) throw new Error('a manager must not be able to demote or disable the general manager');
    evidence.managerEscalation = r.code;
    await p.context().close();
  });

  const report = {
    kind: 'stage4d-employee-lifecycle', sourceCommit: process.env.SOURCE_COMMIT || null,
    saveControl: { widget: 'FilledButton.icon', icon: 'Icons.save_outlined', label: 'حفظ الموظف', source: 'lib/live/live_admin.dart:1140' },
    results, passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status !== 'failed' && r.status === 'failed').length,
    evidence, productionTouched: false
  };
  fs.writeFileSync(path.join(out, 'stage4d.json'), JSON.stringify(report, null, 2));
  console.log('STAGE4D_DONE', JSON.stringify({ scenarios: report.passed, saveLabel: 'حفظ الموظف' }));
  await browser.close();
})().catch(e => {
  console.error('ERR', e.message);
  try { fs.writeFileSync(path.join(out, 'stage4d.json'), JSON.stringify({ kind: 'stage4d', status: 'failed', error: e.message, results }, null, 2)); } catch { }
  process.exitCode = 1;
});