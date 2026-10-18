'use strict';
/*
 * Stage 4 Phase A/C — empirical Role x Operation permission matrix.
 *
 * Every callable is invoked as every implemented role and the real outcome is
 * recorded. The matrix is therefore observed behaviour, not an assumption read
 * off the policy module.
 *
 * Everything runs against the Firebase Emulator Suite with synthetic identities.
 * No production resource is touched, and the emulator entrypoint refuses any
 * non-loopback origin.
 */
process.env.VELNIX_SDK_BASE = process.env.VELNIX_SDK_BASE || '/firebase-sdk/12.19.0/';

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'build/qa/emulator-stage4');
fs.mkdirSync(out, { recursive: true });

const ROLES = ['generalManager', 'manager', 'warehouse', 'sales', 'dataEntry'];
const AR = {
  generalManager: 'مدير عام اصطناعي',
  manager: 'مدير اصطناعي',
  warehouse: 'مستودع اصطناعي',
  sales: 'مبيعات اصطناعي',
  dataEntry: 'مدخل اصطناعي'
};

let browser, ctx, gmOrderId;

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
  await p.getByRole('button', { name: 'المتابعة باستخدام Google' }).waitFor({ timeout: 60000 });
  const popup = ctx.waitForEvent('page', { timeout: 30000 });
  await p.mouse.click(720, 600);
  await (await popup).getByText(role.toLowerCase() + '@velnix.test', { exact: true }).click();
  await p.getByText('أهلاً، ' + AR[role], { exact: true }).waitFor({ timeout: 60000 });
  return p;
}

async function call(p, name, data = {}) {
  return p.evaluate(async ({ name, data }) => {
    const { getApps } = await import('/firebase-sdk/12.19.0/firebase-app.js');
    const { getFunctions, httpsCallable } = await import('/firebase-sdk/12.19.0/firebase-functions.js');
    try {
      const r = await httpsCallable(getFunctions(getApps()[0], 'europe-west1'), name)(data);
      return { ok: true, data: r.data };
    } catch (e) { return { ok: false, code: e.code || 'unknown', message: String(e.message || '').slice(0, 90) }; }
  }, { name, data });
}

// Outcome is classified against the real result, not guessed.
function classify(res) {
  if (res.ok) return { result: 'Allowed', detail: 'served' };
  if (res.code === 'functions/permission-denied') return { result: 'Denied', detail: res.code };
  if (res.code === 'functions/unauthenticated') return { result: 'Denied', detail: res.code };
  return { result: 'Other', detail: `${res.code}: ${res.message}` };
}

(async () => {
  browser = await chromium.launch();
  const matrix = {};
  let seq = 0;

  // A reference order owned by the GM, used as the target of per-order probes.
  const gm = await login('generalManager');
  const created = await call(gm, 'createOrder', {
    customer: `probe-owner-${seq++}`, phone: '0000000000', quantity: 1, amount: '0.000',
    city: 'probe', area: 'probe', address: 'probe', description: 'probe',
    note: 'probe', requestKey: 'stage4probeowner00000001'
  });
  gmOrderId = created.ok ? created.data.id : null;
  if (!gmOrderId) { console.error('could not create the reference order:', JSON.stringify(created)); process.exit(1); }
  const orderSnapshot = (await call(gm, 'getOrder', { id: gmOrderId })).data.order;
  const company = await call(gm, 'saveCompany', {
    name: 'شركة probe', apiUrl: 'https://local-contract.example', provider: 'generic_v1',
    enabled: false, statusMap: {}
  });
  const companyId = company.ok ? company.data.id : null;
  if (!companyId) console.error('  reference company not created:', JSON.stringify(company));
  const noticeId = ((await call(gm, 'listNotices', {})).data.items || [])[0]?.id || 'none';
  const memberId = ((await call(gm, 'listMembers', {})).data.items || [])[0]?.id || 'none';
  await call(gm, 'createOrder', {
    customer: `probe-own-${seq++}`, phone: '0000000000', quantity: 1, amount: '0.000',
    city: 'probe', area: 'probe', address: 'probe', description: 'probe',
    note: 'probe', requestKey: 'stage4probeown000000001'
  });

  for (const role of ROLES) {
    const p = role === 'generalManager' ? gm : await login(role);
    matrix[role] = { arabicLabel: AR[role], operations: {} };
    const put = (name, res) => { matrix[role].operations[name] = classify(res); };

    put('me', await call(p, 'me'));
    put('listOrders', await call(p, 'listOrders'));
    put('searchOrders', await call(p, 'searchOrders', { query: 'probe' }));
    put('dashboardStats', await call(p, 'dashboardStats'));
    put('companyStats', await call(p, 'companyStats', { id: companyId }));
    put('listOrderCreators', await call(p, 'listOrderCreators'));
    put('getOrder_otherOwner', await call(p, 'getOrder', { id: gmOrderId }));
    put('getSettings', await call(p, 'getSettings'));
    put('listCompanies', await call(p, 'listCompanies'));
    put('listNotices', await call(p, 'listNotices'));
    put('listMembers', await call(p, 'listMembers'));
    put('listAudit', await call(p, 'listAudit'));
    put('listSyncEvents', await call(p, 'listSyncEvents'));
    put('markNoticeRead', await call(p, 'markNoticeRead', { id: noticeId }));
    put('saveSettings', await call(p, 'saveSettings', { organizationName: 'probe' }));
    put('saveCompany', await call(p, 'saveCompany', { name: 'probe co', apiUrl: 'https://local-contract.example', provider: 'generic_v1', enabled: false, statusMap: {} }));
    put('archiveCompany', await call(p, 'archiveCompany', { id: companyId }));
    put('restoreCompany', await call(p, 'restoreCompany', { id: companyId }));
    put('testCompanyConnection', await call(p, 'testCompanyConnection', { id: companyId }));
    put('saveMember', await call(p, 'saveMember', { id: 'probe-member-x', role: 'sales', name: 'probe', permissions: [], active: true }));
    put('assignCompany', await call(p, 'assignCompany', { id: gmOrderId, companyId }));
    put('sendOrderToDelivery', await call(p, 'sendOrderToDelivery', { id: gmOrderId }));
    put('updateOrder_otherOwner', await call(p, 'updateOrder', { ...orderSnapshot, id: gmOrderId, note: 'probe edit' }));
    put('changeOrderStatus_otherOwner', await call(p, 'changeOrderStatus', { id: gmOrderId, status: 'review' }));
    put('registerDevice', await call(p, 'registerDevice', { token: 'probe-token' }));
    matrix[role].operations.registerDevice.note = 'requires a real FCM registration token; no FCM service is enabled';
    // A role may always create an order for itself; the payload is per-role so
    // idempotency keys never collide across the matrix.
    put('createOrder', await call(p, 'createOrder', {
    customer: `probe-${role}-${seq}`, phone: '0000000000', quantity: 1, amount: '0.000',
    city: 'probe', area: 'probe', address: 'probe', description: 'probe',
    note: 'probe', requestKey: `stage4probe${role}0000${seq}`
  }));

    console.log(`  ${role.padEnd(15)} ` + Object.entries(matrix[role].operations)
      .map(([k, v]) => `${k}=${v.result}`).join(' ').slice(0, 300));
  }

  const report = {
    kind: 'stage4-role-permission-matrix',
    sourceCommit: process.env.SOURCE_COMMIT || null,
    roles: ROLES, matrix, referenceOrder: gmOrderId, productionTouched: false
  };
  fs.writeFileSync(path.join(out, 'role-matrix.json'), JSON.stringify(report, null, 2));
  console.log('STAGE4_MATRIX_DONE', JSON.stringify({ roles: ROLES.length }));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exitCode = 1; });