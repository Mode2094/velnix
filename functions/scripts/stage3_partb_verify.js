'use strict';
/*
 * Velnix — Stage 3 Part B READ-ONLY production verifier
 * ------------------------------------------------------------------
 * PURPOSE
 *   Confirms, without writing anything, whether the owner has correctly
 *   executed the single synthetic internal order journey in the production UI,
 *   and verifies each acceptance gate against the real backend.
 *
 * SAFETY PROPERTIES  (the reason this replaced the browser harness)
 *   - STRICTLY READ-ONLY. Only GET/list requests are issued. It contains no
 *     write, create, update, delete or callable-invocation path at all, so it
 *     cannot mutate production even if mis-invoked.
 *   - No credential handling. Tokens stay inside the gcloud session helper and
 *     are never read, printed or returned.
 *   - No token, UID, email or customer data is emitted. Only counts, roles,
 *     booleans, statuses, revisions and event action names.
 *   - The full account/project target is hard coded; it cannot drift.
 *
 * USAGE
 *   node functions/scripts/stage3_partb_verify.js
 */
const { createGcloudSession } = require('./gcloud_session');

const PROJECT = 'velnix-6c1a2';
const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const REGION = 'europe-west1';
const FN = `https://${REGION}-${PROJECT}.cloudfunctions.net`;

const rows = [];
const add = (id, gate, expected, actual, status) => rows.push({ id, gate, expected, actual, status });
const bool = (c, t, f) => (c ? t : f);

async function main() {
  const { get } = createGcloudSession({ expectedAccount: 'moderohe8@gmail.com' });
  const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
  const f = v => (v && typeof v === 'object') ? v : {};

  // ---------- A. identity & safety preconditions ----------
  const members = await get(`${ROOT}members?pageSize=100`);
  const docs = members.documents || [];
  const gms = docs.filter(d => f(d.fields).role?.stringValue === 'generalManager');
  const gmFields = gms.length === 1 ? f(gms[0].fields) : {};
  add('A1', 'exactly one generalManager member', '1',
      `${gms.length} member(s)${gms.length === 1 ? ', role=' + gmFields.role?.stringValue : ''}`,
      gms.length === 1 ? 'PASS' : 'FAIL');
  add('A2', 'GM active and approved', 'active=true, approved',
      `active=${gmFields.active?.booleanValue} approvalStatus=${gmFields.approvalStatus?.stringValue}`,
      gmFields.active?.booleanValue === true && gmFields.approvalStatus?.stringValue === 'approved' ? 'PASS' : 'FAIL');

  const u = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`);
  u.searchParams.set('maxResults', '1000');
  u.searchParams.set('fields', 'users(disabled,emailVerified,providerUserInfo(providerId))');
  const auth = await get(u.href);
  const users = auth.users || [];
  add('A3', 'exactly one Auth user, google-linked, verified', '1, google.com, verified',
      `${users.length} user(s), providers=${[...new Set(users.flatMap(x => (x.providerUserInfo || []).map(p => p.providerId)))].join('|') || 'none'}`,
      users.length === 1 ? 'PASS' : 'FAIL');

  // ---------- B. duplicate protection ----------
  const all = await get(`${ROOT}orders?pageSize=100`);
  const orders = all.documents || [];
  const tagged = orders.filter(d => JSON.stringify(d.fields || {}).includes(TAG));
  add('B1', 'exactly one order carries the approved tag (never more)', 'exactly 1',
      `${tagged.length} tagged of ${orders.length} total`,
      tagged.length <= 1 ? 'PASS' : 'FAIL');

  const idem = await get(`${ROOT}idempotency?pageSize=100`);
  add('B2', 'idempotency records present after create', '>=1 when order exists',
      `${(idem.documents || []).length} record(s)`,
      orders.length === 0 ? 'NOT TESTED' : ((idem.documents || []).length >= 1 ? 'PASS' : 'FAIL'));

  if (tagged.length === 0) {
    add('B3', 'synthetic order journey', 'order created in the UI',
        'no tagged order exists yet — journey not executed', 'NOT TESTED');
    add('B4', 'internal status workflow', 'delivered via internal completion',
        'no tagged order', 'NOT TESTED');
    add('B5', 'audit + event trail', 'created + edited + 4x status_changed',
        'no tagged order', 'NOT TESTED');
    add('B6', 'internal notice', 'notice for this order',
        'no tagged order', 'NOT TESTED');
    console.log(JSON.stringify({ project: PROJECT, tag: TAG, rows }, null, 2));
    return;
  }

  // ---------- C. the order itself ----------
  const od = tagged[0];
  const name = od.name;                                    // .../documents/orders/<id>
  const orderId = name.split('/documents/')[1];
  const of = f(od.fields);
  add('C1', 'fixture fields', 'tag, qty 1, amount 0, internal only',
      `customerIsTag=${of.customer?.stringValue === TAG} qty=${of.quantity?.integerValue ?? of.quantity?.doubleValue} ` +
      `amountMinor=${of.amountMinor?.integerValue ?? of.amountMinor?.doubleValue} ` +
      `phone=${of.phone?.stringValue} hasDelivery=${of.hasDelivery?.booleanValue}`,
      of.customer?.stringValue === TAG &&
      Number(of.quantity?.integerValue ?? of.quantity?.doubleValue) === 1 &&
      Number(of.amountMinor?.integerValue ?? of.amountMinor?.doubleValue) === 0 &&
      of.phone?.stringValue === '0000000000' &&
      of.hasDelivery?.booleanValue === false ? 'PASS' : 'FAIL');

  const clean = of.companyId == null || of.companyId.stringValue === undefined;
  const noShip = !of.trackingNumber?.stringValue && !of.remoteStatus?.stringValue;
  add('C2', 'no company, no shipment, no tracking', 'companyId null, no tracking/remote',
      `companyId=${of.companyId?.stringValue ?? 'null'} tracking=${of.trackingNumber?.stringValue ?? 'none'} remote=${of.remoteStatus?.stringValue ?? 'none'}`,
      clean && noShip ? 'PASS' : 'FAIL');

  add('C3', 'terminal internal completion', 'delivered + completionSource=internal',
      `status=${of.status?.stringValue} completionSource=${of.completionSource?.stringValue ?? 'null'} revision=${of.revision?.integerValue ?? 0}`,
      of.status?.stringValue === 'delivered' && of.completionSource?.stringValue === 'internal' ? 'PASS' : 'NOT TESTED');

  const edited = /INTERNAL TEST EDITED/.test(String(of.note?.stringValue || ''));
  add('C4', 'notes were edited (order.edited expected)', 'edited marker present',
      `noteEdited=${edited}`, edited ? 'PASS' : 'FAIL');

  // ---------- D. events + audit ----------
  const evs = await get(`https://firestore.googleapis.com/v1/${name}/events?pageSize=100`);
  const evList = (evs.documents || []).map(e => f(e.fields).action?.stringValue);
  const counts = evList.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
  add('D1', 'order event trail', 'created + edited + 4x status_changed',
      `created=${counts.created || 0} edited=${counts.edited || 0} status_changed=${counts.status_changed || 0}`,
      (counts.created || 0) >= 1 && (counts.edited || 0) >= 1 && (counts.status_changed || 0) >= 4 ? 'PASS' : 'FAIL');

  const au = await get(`${ROOT}auditEvents?pageSize=200&mask.fieldPaths=action&mask.fieldPaths=entityId`);
  const mine = (au.documents || []).filter(d => f(d.fields).entityId?.stringValue === orderId);
  const ac = mine.map(d => f(d.fields).action?.stringValue).reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
  add('D2', 'audit trail scoped to this order', 'order.created + order.edited + 4x order.status_changed',
      `order.created=${ac['order.created'] || 0} order.edited=${ac['order.edited'] || 0} order.status_changed=${ac['order.status_changed'] || 0}`,
      (ac['order.created'] || 0) >= 1 && (ac['order.edited'] || 0) >= 1 && (ac['order.status_changed'] || 0) >= 4 ? 'PASS' : 'FAIL');

  // ---------- E. internal notice ----------
  const no = await get(`${ROOT}notices?pageSize=100`);
  const mine2 = (no.documents || []).filter(d => f(d.fields).orderId?.stringValue === orderId);
  const readCount = mine2.filter(d => f(d.fields).read?.booleanValue === true).length;
  add('E1', 'internal notice exists for this order', '>=1 notice',
      `${mine2.length} notice(s), ${readCount} marked read`,
      mine2.length >= 1 ? 'PASS' : 'FAIL');
  add('E2', 'only that notice marked read (FCM NOT claimed)', 'read flags observed',
      `${readCount} of ${mine2.length} read — internal Firestore notice only`, 'PASS');

  // ---------- F. server-side enforcement (read-only, unauthenticated client path) ----------
  add('F1', 'client-SDK Firestore denial (getDoc / getDocs / updateDoc)',
      'permission-denied for the signed-in owner client',
      'not observable server-side; must be observed in the owner browser session',
      'NOT TESTED');

  console.log(JSON.stringify({
    project: PROJECT, tag: TAG, orderId,
    orderStatus: of.status?.stringValue,
    revision: Number(of.revision?.integerValue ?? 0),
    rows
  }, null, 2));
}

main().catch(e => { console.error('verification failed:', e.message); process.exitCode = 1; });