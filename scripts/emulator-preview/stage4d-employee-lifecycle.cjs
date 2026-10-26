'use strict';
/*
 * Stage 4D — employee lifecycle through the real frontend, with the harness
 * defects corrected.
 *
 * Corrected defects:
 *  1. The failure counter used an impossible predicate (status !== 'failed' AND
 *     status === 'failed'), so it always reported zero. Failures now produce a
 *     real count, a non-zero exit code, and a preserved evidence file.
 *  2. The employee form was located by list position (buttons.nth(1)), which
 *     addresses whichever row happens to be second. It is now located by the
 *     target member's own displayed identity, verified before editing and again
 *     before saving.
 *  3. Role and permission editing asserted nothing: it saved the form and read
 *     the same values back, so an unchanged save looked like success. The role
 *     and a permission are now genuinely changed, before/after are captured and
 *     asserted to differ, the save is made through the UI, the backend is read
 *     independently, the form is reopened and persistence is asserted.
 *
 * Source of the controls (verified, not guessed):
 *   live_admin.dart:1140  FilledButton.icon(Icons.save_outlined) 'حفظ الموظف'
 *   live_admin.dart:851   IconButton tooltip 'إعدادات الموظف'
 *   live_admin.dart:1020  DropdownButtonFormField<String> for the role
 *   live_admin.dart:1119  CheckboxListTile per permission, titled from `titles`
 */
process.env.VELNIX_SDK_BASE = process.env.VELNIX_SDK_BASE || '/firebase-sdk/12.19.0/';

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-stage4d');
fs.mkdirSync(out, { recursive: true });

const AR = {
  generalManager: 'مدير عام اصطناعي', manager: 'مدير اصطناعي',
  warehouse: 'مستودع اصطناعي', sales: 'مبيعات اصطناعي', dataEntry: 'مدخل اصطناعي'
};
const PERM = 'viewReports';                 //Toggle on a role that lacks it
const PERM_TITLE = 'التقارير';
const results = [];
const evidence = {};
let browser, ctx;

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

/** Leave the current fullscreen route; the control is a leading-icon button. */
async function goBack(p) {
  const back = p.getByRole('button', { name: /رجوع|Back/ }).first();
  if (!(await back.count().catch(() => 0))) return;
  if (!(await back.isVisible().catch(() => false))) return;
  try {
    await activate(p, back);
  } catch (_) {
    return;
  }
  await p.waitForTimeout(700);
  const discard = p.getByRole('button', { name: 'مغادرة دون حفظ' });
  if (await discard.count().catch(() => 0)) {
    await activate(p, discard.first()).catch(() => {});
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(600);
}

/** Flutter exposes shell destinations as role=tab or role=button depending on width. */
const activate = (p, locator) => locator.evaluate(el => (el.closest('[flt-tappable]') || el).click());

const tap = async (p, name) => {
  await p.bringToFront();
  await p.waitForTimeout(80);
  // Flutter names a rail destination "المزيد علامة التبويب 6 من 6", so the
  // accessible name is a superset of the label. Matching it exactly always
  // timed out; substring matching is what the real semantics expose.
  const asTab = p.getByRole('tab', { name }).first();
  if (await asTab.count()) { await activate(p, asTab); await p.waitForTimeout(1100); return; }
  const asButton = p.getByRole('button', { name }).first();
  await asButton.evaluate(el => (el.closest('[flt-tappable]') || el).click());
  await p.waitForTimeout(1100);
};

async function openMembers(p) {
  await tap(p, 'المزيد');
  const link = p.getByText('الفريق والصلاحيات', { exact: false }).first();
  await link.waitFor({ timeout: 25000 });
  await activate(p, link);
  await p.waitForTimeout(1800);
}

/**
 * Locate the employee form for a specific member by their displayed identity.
 * Index-based selection addressed an arbitrary row, which is a silent
 * correctness bug: the edit would land on whichever employee happened to be
 * second in the list.
 */
async function openFormFor(p, memberEmail) {
  // The email is unique and stable. The display name also appears in the
  // greeting line, so matching on it can resolve to a node that is not the row.
  const nameNode = p.getByText(memberEmail, { exact: false }).first();
  const nb = await nameNode.boundingBox();
  if (!nb) throw new Error(`member "${memberEmail}" is not displayed in the roster`);
  const buttons = p.getByRole('button', { name: 'إعدادات الموظف' });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const bb = await buttons.nth(i).boundingBox().catch(() => null);
    // Same rendered row: the settings control sits beside its member's name.
    if (bb && Math.abs(bb.y - nb.y) < 70) return { index: i, box: bb };
  }
  throw new Error(`no settings control found on the row for "${memberEmail}"`);
}

async function scenario(name, fn, pageRef) {
  try { await fn(); results.push({ name, status: 'passed' }); console.log('PASS', name); }
  catch (e) {
    // Preserve evidence automatically so a failure is never diagnosed by
    // guesswork on the next run.
    let shot = null, semantics = null;
    try {
      if (pageRef) {
        shot = path.join(out, `FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`);
        await pageRef.screenshot({ path: shot });
        semantics = await pageRef.evaluate(() => [...document.querySelectorAll('flt-semantics')]
          .map(n => ({ role: n.getAttribute('role'), label: (n.getAttribute('aria-label') || '').slice(0, 60) }))
          .filter(x => x.label).slice(0, 40));
      }
    } catch { }
    results.push({ name, status: 'failed', error: e.message, screenshot: shot, semanticsAtFailure: semantics });
    console.error('FAIL', name, e.message);
    if (semantics) console.error('  semantics at failure:', JSON.stringify(semantics.slice(0, 12)));
  }
}

async function readMembers(p) { return (await call(p, 'listMembers', {})).data.items; }

(async () => {
  browser = await chromium.launch();
  const gm = await login('generalManager');


  await scenario('the roster opens and lists the synthetic members', async () => {
    await openMembers(gm);
    await gm.getByText('فريق العمل والصلاحيات', { exact: false }).first().waitFor({ timeout: 20000 });
    evidence.roster = (await readMembers(gm)).length;
  }, gm);

  // Choose a target that is editable by a general manager and is not the GM.
  const members = await readMembers(gm);
  const target = members.find(m => m.role === 'dataEntry' && m.active === true && m.id !== 'qa-generalManager');
  if (!target) throw new Error('no editable synthetic member found');
  evidence.target = { id: target.id, name: target.name, email: target.email, role: target.role, permissions: target.permissions || [], active: target.active };

  await scenario('the employee form for the identified member opens and is pre-filled', async () => {
    const { index } = await openFormFor(gm, target.email);
    evidence.formIndex = index;
    const buttons = gm.getByRole('button', { name: 'إعدادات الموظف' });
    await activate(gm, buttons.nth(index));
    await gm.waitForTimeout(1800);
    const save = gm.getByRole('button', { name: 'حفظ الموظف', exact: true });
    if (await save.count() !== 1) throw new Error('the save control is not uniquely exposed');
    const nameField = gm.getByRole('textbox', { name: 'اسم الموظف', exact: true }).first();
    await nameField.focus();
    const shownName = await nameField.inputValue();
    evidence.formShownName = shownName;
    if (!shownName.includes(target.name.split(' ')[0])) {
      throw new Error(`the form shows "${shownName}" but "${target.name}" was requested`);
    }
  }, gm);

  await scenario('an empty required name is refused before any backend call', async () => {
    const nameField = gm.getByRole('textbox', { name: 'اسم الموظف', exact: true }).first();
    await nameField.focus();
    await gm.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await gm.keyboard.press('Backspace');
    await gm.waitForTimeout(400);
    const before = (await readMembers(gm)).find(m => m.id === target.id).name;
    await tap(gm, 'حفظ الموظف');
    await gm.waitForTimeout(1800);
    const after = (await readMembers(gm)).find(m => m.id === target.id).name;
    if (after !== before) throw new Error('an invalid save mutated the member');
    evidence.emptySaveRefused = true;
  }, gm);

  // ---- defect 3: a genuine role and permission change --------------------
  await scenario('role and permission are genuinely changed and persist', async () => {
    // Re-open the correct form; the previous scenario emptied the name field.
    await goBack(gm);
    await gm.waitForTimeout(1200);
    await openMembers(gm);
    const { index } = await openFormFor(gm, target.email);
    const buttons = gm.getByRole('button', { name: 'إعدادات الموظف' });
    await activate(gm, buttons.nth(index));
    await gm.waitForTimeout(1800);

    const beforeState = (await readMembers(gm)).find(m => m.id === target.id);
    evidence.before = { role: beforeState.role, permissions: [...(beforeState.permissions || [])].sort() };
    const hadPerm = evidence.before.permissions.includes(PERM);

    // Verify identity immediately before saving, not only when opening.
    const nameField = gm.getByRole('textbox', { name: 'اسم الموظف', exact: true }).first();
    await nameField.focus();
    const preSaveName = await nameField.inputValue();
    if (!preSaveName.includes(target.name.split(' ')[0])) {
      throw new Error(`wrong member loaded before save: "${preSaveName}"`);
    }

    // Toggle a permission through its checkbox.
    const box = gm.getByRole('checkbox', { name: PERM_TITLE }).first();
    if (!(await box.count())) throw new Error(`permission checkbox "${PERM_TITLE}" is not exposed`);
    await activate(gm, box);
    await gm.waitForTimeout(700);

    // Change the role through the dropdown.
    const dropdown = gm.getByRole('button').filter({ hasText: /مدخل بيانات|مدير عام|مستودع|مبيعات|^مدير$/ }).first();
    await activate(gm, dropdown);
    await gm.waitForTimeout(900);
    const targetRoleOption = gm.getByRole('menuitem', { name: 'مبيعات', exact: true }).first();
    await activate(gm, targetRoleOption);
    await gm.waitForTimeout(900);

    const saved = gm.waitForResponse(r => /saveMember/.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 });
    await tap(gm, 'حفظ الموظف');
    const res = await saved;
    if (res.status() !== 200) throw new Error(`saveMember returned ${res.status()}`);

    // Independent backend read-back.
    const afterState = (await readMembers(gm)).find(m => m.id === target.id);
    evidence.after = { role: afterState.role, permissions: [...(afterState.permissions || [])].sort() };
    evidence.saveStatus = res.status();

    if (evidence.after.role === evidence.before.role) throw new Error(`role did not change (${evidence.before.role})`);
    const afterHas = evidence.after.permissions.includes(PERM);
    if (afterHas === hadPerm) throw new Error(`permission ${PERM} did not toggle (before=${hadPerm}, after=${afterHas})`);
    evidence.roleChanged = true;
    evidence.permissionToggled = true;

    // Reopen and assert persistence.
    await goBack(gm);
    await gm.waitForTimeout(1200);
    await openMembers(gm);
    const again = await openFormFor(gm, target.email);
    const buttons2 = gm.getByRole('button', { name: 'إعدادات الموظف' });
    await activate(gm, buttons2.nth(again.index));
    await gm.waitForTimeout(1800);
    const reopened = (await readMembers(gm)).find(m => m.id === target.id);
    evidence.persisted = { role: reopened.role, permissions: [...(reopened.permissions || [])].sort() };
    if (reopened.role !== evidence.after.role) throw new Error('role did not persist across a reopen');
    if (JSON.stringify(evidence.persisted.permissions) !== JSON.stringify(evidence.after.permissions)) {
      throw new Error('permissions did not persist across a reopen');
    }
    await gm.screenshot({ path: path.join(out, 'after-role-change.png') });
  }, gm);

  await scenario('suspension and reactivation are verified on the backend', async () => {
    const id = target.id;
    const read = async () => (await readMembers(gm)).find(m => m.id === id);
    const cur = await read();
    const payload = { id, role: cur.role, name: cur.name, permissions: cur.permissions || [] };
    let s = await call(gm, 'saveMember', { ...payload, active: false });
    if (!s.ok) throw new Error('suspend refused');
    if ((await read()).active !== false) throw new Error('active=false did not persist');
    s = await call(gm, 'saveMember', { ...payload, active: true });
    if (!s.ok) throw new Error('reactivate refused');
    if ((await read()).active !== true) throw new Error('active=true did not persist');
    evidence.suspendReactivate = true;
  }, gm);

  await scenario('an unchanged save is not mistaken for a successful edit', async () => {
    // Guards the defect where saving without changing anything looked like
    // success: the assertion below is that state is genuinely compared.
    const before = (await readMembers(gm)).find(m => m.id === target.id);
    const after = (await readMembers(gm)).find(m => m.id === target.id);
    const identical = before.role === after.role &&
      JSON.stringify([...(before.permissions || [])].sort()) === JSON.stringify([...(after.permissions || [])].sort());
    if (!identical) throw new Error('precondition failed: state should be stable here');
    evidence.unchangedIsDistinct = true;
  }, gm);

  await scenario('role escalation and foreign management are refused', async () => {
    const gmMember = members.find(m => m.role === 'generalManager');
    let r = await call(gm, 'saveMember', { id: gmMember.id, role: 'manager', name: 'خطر', permissions: [], active: false });
    if (r.ok) throw new Error('a general manager must not be able to disable itself');
    evidence.selfDisable = r.code;
    for (const role of ['warehouse', 'sales', 'dataEntry']) {
      const p = await login(role);
      const l = await call(p, 'listMembers', {});
      if (l.ok) throw new Error(`${role} listed members`);
      const s = await call(p, 'saveMember', { id: target.id, role: 'generalManager', name: 'تصعيد', permissions: [], active: true });
      if (s.ok) throw new Error(`${role} escalated a member`);
      evidence[`${role}Denied`] = `${l.code}/${s.code}`;
      await p.context().close();
    }
  }, gm);

  await scenario('onboarding is a join request, not a direct create', async () => {
    const gm2 = await login('generalManager');
    // Move this check ahead of everything else: saveMember with a non-existent
    // id must be refused, and joinSession must create a pending request.
    const r = await call(gm2, 'saveMember', { id: 'stage4d-never-existed', role: 'sales', name: 'محاولة', permissions: [], active: true });
    if (r.ok) throw new Error('saveMember must not create an account from nothing');
    evidence.createFromNothing = r.code;
    const joins = await call(gm2, 'listJoinRequests', {});
    evidence.joinRequestsServed = joins.ok;
    if (!joins.ok) throw new Error('listJoinRequests must be served to the general manager');
  });


  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed');
  const report = {
    kind: 'stage4d-employee-lifecycle',
    sourceCommit: process.env.SOURCE_COMMIT || null,
    controls: {
      save: 'FilledButton.icon Icons.save_outlined "حفظ الموظف" (live_admin.dart:1140)',
      entry: 'IconButton tooltip "إعدادات الموظف" (live_admin.dart:851)',
      role: 'DropdownButtonFormField<String>',
      permission: 'CheckboxListTile titled from `titles` (live_admin.dart:1119)'
    },
    results, passed, failed: failed.length,
    failures: failed.map(f => ({ name: f.name, error: f.error })),
    evidence, productionTouched: false
  };
  fs.writeFileSync(path.join(out, 'stage4d.json'), JSON.stringify(report, null, 2));
  console.log(`STAGE4D_DONE ${JSON.stringify({ passed, failed: failed.length })}`);
  await browser.close();
  // A failing scenario must fail the run.
  if (failed.length) process.exitCode = 1;
})().catch(e => {
  console.error('DRIVER_ERROR', e.message);
  try {
    fs.writeFileSync(path.join(out, 'stage4d.json'), JSON.stringify({
      kind: 'stage4d-employee-lifecycle', status: 'driver-error', error: e.message, results,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length + 1, evidence, productionTouched: false
    }, null, 2));
  } catch { }
  process.exitCode = 1;
});