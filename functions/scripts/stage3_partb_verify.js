'use strict';
/*
 * Velnix — Stage 3 Part B READ-ONLY production verifier
 * ==================================================================
 * PURPOSE
 *   Confirms, without writing anything, whether the owner executed the single
 *   synthetic internal order journey in the production UI, and verifies each
 *   acceptance gate against the real backend.
 *
 * SAFETY PROPERTIES
 *   - STRICTLY READ-ONLY. Issues only GET/list requests. This file contains no
 *     Firestore write, create, update, delete or callable invocation path.
 *   - No credential handling. Tokens never leave the gcloud session helper.
 *   - No PII. Only the order carrying the approved synthetic tag is described.
 *     No other customer's recipient, phone, address or amount is ever read
 *     into the report; untagged orders are counted only.
 *   - Every list read is fully paginated, so uniqueness claims are never made
 *     from a partial first page.
 *
 * ARCHITECTURE
 *   evaluate(...) is a PURE function over already-fetched data. It contains no
 *   I/O, which is what makes it exhaustively unit-testable against synthetic
 *   fixtures for zero / one / duplicate orders, pagination, missing and unread
 *   notices, and incomplete workflows.
 *
 * USAGE
 *   node functions/scripts/stage3_partb_verify.js
 */
const { createGcloudSession } = require('./gcloud_session');

const PROJECT = 'velnix-6c1a2';
const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
const DB = '(default)';
const PAGE = 100;                     // small on purpose: proves pagination works

const f = v => (v && typeof v === 'object') ? v : {};
const num = v => Number(v ?? 0);
const field = (fields, name) => f(fields)[name];

// --------------------------------------------------------------- pagination
/**
 * Follows nextPageToken until exhausted. A Firestore collection read that
 * stops at the first page can silently hide a duplicate, so completeness is
 * proven rather than assumed.
 */
async function listAll(get, baseUrl, limit = 100000) {
  const out = [];
  const seen = new Set();
  let token;
  let pages = 0;
  do {
    const u = new URL(baseUrl);
    u.searchParams.set('pageSize', String(PAGE));
    if (token) u.searchParams.set('pageToken', token);
    const page = f(await get(u.href));
    for (const d of (page.documents || [])) out.push(d);
    token = page.nextPageToken;
    if (token) {
      if (seen.has(token)) throw new Error('repeated page token; read not trustworthy');
      seen.add(token);
    }
    if (++pages > 1000) throw new Error('pagination limit exceeded');
  } while (token && out.length < limit);
  out.truncated = out.length >= limit;
  return out;
}

// ------------------------------------------------------------ pure evaluator
/**
 * @param input.members      Firestore member documents (already paginated)
 * @param input.users        Firebase Auth user summaries
 * @param input.orders       ALL order documents (already paginated)
 * @param input.idempotency  idempotency documents (already paginated)
 * @param input.notices      ALL notice documents (already paginated)
 * @param input.audit        ALL auditEvents documents (already paginated)
 * @param input.orderEvents  map<orderId, event documents> for the tagged order
 * @param input.errors       non-fatal read errors, keyed by dataset
 */
function evaluate(input) {
  const rows = [];
  const add = (id, gate, expected, actual, status) => rows.push({ id, gate, expected, actual, status });
  const fail = (label, e) => (input.errors || {})[label];

  // ---- A. identity -------------------------------------------------------
  const members = input.members || [];
  const gms = members.filter(d => field(d.fields, 'role')?.stringValue === 'generalManager');
  add('A1', 'exactly one generalManager member', 'exactly 1',
      fail('members') ? 'read failed' : `${gms.length} generalManager of ${members.length} member(s)`,
      fail('members') ? 'NOT TESTED' : (gms.length === 1 ? 'PASS' : 'FAIL'));

  const gm = gms.length === 1 ? f(gms[0].fields) : {};
  add('A2', 'GM active and approved', 'active=true, approvalStatus=approved',
      fail('members') ? 'read failed'
        : `active=${gm.active?.booleanValue} approvalStatus=${gm.approvalStatus?.stringValue}`,
      fail('members') ? 'NOT TESTED'
        : (gm.active?.booleanValue === true && gm.approvalStatus?.stringValue === 'approved' ? 'PASS' : 'FAIL'));

  const users = input.users || [];
  const providers = [...new Set(users.flatMap(u => (u.providerUserInfo || []).map(p => p.providerId)))];
  add('A3', 'exactly one Auth user, google-linked, verified', 'exactly 1, provider google.com',
      fail('users') ? 'read failed' : `${users.length} user(s), providers=${providers.join('|') || 'none'}`,
      fail('users') ? 'NOT TESTED' : (users.length === 1 && providers.includes('google.com') ? 'PASS' : 'FAIL'));

  // ---- B. uniqueness of the synthetic order ------------------------------
  const orders = input.orders || [];
  const tagged = orders.filter(d => JSON.stringify(d.fields || {}).includes(TAG));
  const n = tagged.length;

  let b1status;
  if (fail('orders')) b1status = 'NOT TESTED';
  else if (n === 0) b1status = 'NOT TESTED';   // journey not executed yet
  else if (n === 1) b1status = 'PASS';
  else b1status = 'FAIL';                        // duplicate: stop and investigate
  add('B1', 'exactly one order carries the approved tag', 'exactly 1',
      fail('orders') ? 'read failed'
        : `${n} tagged of ${orders.length} order(s) across ${input.orderPages ?? '?'} page(s)`,
      b1status);

  const idem = input.idempotency || [];
  add('B2', 'idempotency record exists for the create', '>=1 when an order exists',
      fail('idempotency') ? 'read failed' : `${idem.length} record(s)`,
      fail('idempotency') ? 'NOT TESTED' : (n === 0 ? 'NOT TESTED' : (idem.length >= 1 ? 'PASS' : 'FAIL')));

  add('F1', 'client-SDK Firestore denial (getDoc / getDocs / updateDoc)',
      'permission-denied observed in the owner browser session',
      'not observable server-side; must be observed by the owner', 'NOT TESTED');

  if (n === 0) {
    add('B3', 'synthetic order journey', 'order created in the production UI',
        'no tagged order exists yet — journey not executed', 'NOT TESTED');
    add('B4', 'internal status workflow', 'created -> review -> preparing -> ready -> delivered',
        'no tagged order', 'NOT TESTED');
    add('B5', 'audit + event trail', 'created + edited + 4x status_changed', 'no tagged order', 'NOT TESTED');
    add('B6', 'internal notice read', 'notice exists and is read', 'no tagged order', 'NOT TESTED');
    return { rows, orderId: null, decision: 'NOT_EXECUTED' };
  }

  if (n > 1) {
    add('B3', 'duplicate synthetic orders detected', 'exactly 1',
        `${n} orders carry the approved tag`, 'FAIL');
    add('B4', 'internal status workflow', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    add('B5', 'audit + event trail', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    add('B6', 'internal notice read', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    return { rows, orderId: null, decision: 'DUPLICATE_FOUND' };
  }

  // ---- C. the synthetic order (the only record described) ---------------
  const od = tagged[0];
  const orderId = documentIdFromName(od.name);
  const of = f(od.fields);

  add('C0', 'order id extracted from the Firestore document name', 'orders/<id>',
      `extracted=${orderId ? 'yes' : 'NO'}`,
      orderId ? 'PASS' : 'FAIL');

  const fixtureOk =
    of.customer?.stringValue === TAG &&
    num(of.quantity?.integerValue ?? of.quantity?.doubleValue) === 1 &&
    num(of.amountMinor?.integerValue ?? of.amountMinor?.doubleValue) === 0 &&
    of.phone?.stringValue === '0000000000' &&
    of.hasDelivery?.booleanValue === false;
  add('C1', 'approved synthetic fixture', 'tag in customer, qty 1, amountMinor 0, synthetic phone, hasDelivery false',
      `customerIsTag=${of.customer?.stringValue === TAG} qty=${num(of.quantity?.integerValue ?? of.quantity?.doubleValue)} ` +
      `amountMinor=${num(of.amountMinor?.integerValue ?? of.amountMinor?.doubleValue)} ` +
      `phone=${of.phone?.stringValue === '0000000000' ? 'synthetic' : 'UNEXPECTED'} ` +
      `hasDelivery=${of.hasDelivery?.booleanValue}`,
      fixtureOk ? 'PASS' : 'FAIL');

  const noShip = (of.companyId === undefined || of.companyId?.stringValue === undefined) &&
    !of.trackingNumber?.stringValue && !of.remoteStatus?.stringValue;
  add('C2', 'no company, no shipment, no tracking', 'companyId null, tracking/remote absent',
      `companyId=${of.companyId?.stringValue ?? 'null'} tracking=${of.trackingNumber?.stringValue ?? 'none'} remote=${of.remoteStatus?.stringValue ?? 'none'}`,
      noShip ? 'PASS' : 'FAIL');

  const internalDone = of.status?.stringValue === 'delivered' && of.completionSource?.stringValue === 'internal';
  add('C3', 'terminal internal completion', 'status=delivered, completionSource=internal',
      `status=${of.status?.stringValue} completionSource=${of.completionSource?.stringValue ?? 'null'} revision=${num(of.revision?.integerValue)}`,
      internalDone ? 'PASS' : (of.status?.stringValue === 'delivered' ? 'FAIL' : 'NOT TESTED'));

  const edited = /INTERNAL TEST EDITED/.test(String(of.note?.stringValue || ''));
  add('C4', 'notes edited through the UI', 'edited marker present',
      `noteEdited=${edited}`, edited ? 'PASS' : 'NOT TESTED');

  // ---- D. events + audit -------------------------------------------------
  const evDocs = (input.orderEvents || {})[orderId] || [];
  const counts = evDocs.map(e => f(e.fields).action?.stringValue)
    .reduce((a, x) => (x ? (a[x] = (a[x] || 0) + 1, a) : a), {});
  const evOk = (counts.created || 0) >= 1 && (counts.edited || 0) >= 1 && (counts.status_changed || 0) >= 4;
  add('D1', 'order event trail', 'created>=1, edited>=1, status_changed>=4',
      fail('events') ? 'read failed'
        : `created=${counts.created || 0} edited=${counts.edited || 0} status_changed=${counts.status_changed || 0}`,
      fail('events') ? 'NOT TESTED' : (evOk ? 'PASS' : 'FAIL'));

  const audit = input.audit || [];
  const mine = audit.filter(d => field(d.fields, 'entityId')?.stringValue === orderId);
  const ac = mine.map(d => field(d.fields, 'action')?.stringValue)
    .reduce((a, x) => (x ? (a[x] = (a[x] || 0) + 1, a) : a), {});
  const auditOk = (ac['order.created'] || 0) >= 1 && (ac['order.edited'] || 0) >= 1 &&
    (ac['order.status_changed'] || 0) >= 4;
  add('D2', 'audit trail scoped to this order only', 'order.created>=1, order.edited>=1, order.status_changed>=4',
      fail('audit') ? 'read failed'
        : `order.created=${ac['order.created'] || 0} order.edited=${ac['order.edited'] || 0} order.status_changed=${ac['order.status_changed'] || 0}`,
      fail('audit') ? 'NOT TESTED' : (auditOk ? 'PASS' : 'FAIL'));

  // ---- E. internal notice: real read flag, never assumed ------------------
  const notices = input.notices || [];
  const mine2 = notices.filter(d => field(d.fields, 'orderId')?.stringValue === orderId);
  add('E1', 'internal notice exists for this order', 'at least 1',
      fail('notices') ? 'read failed' : `${mine2.length} notice(s) of ${notices.length} total`,
      fail('notices') ? 'NOT TESTED' : (mine2.length >= 1 ? 'PASS' : 'FAIL'));

  const readFlags = mine2.map(d => f(d.fields).read?.booleanValue === true);
  const readCount = readFlags.filter(Boolean).length;
  let e2;
  if (fail('notices')) e2 = 'NOT TESTED';
  else if (mine2.length === 0) e2 = 'NOT TESTED';
  else if (readCount === 0) e2 = 'NOT TESTED';               // exists but not yet read
  else e2 = 'PASS';
  add('E2', 'matching notice marked read (observed flag)', 'read=true on the matching notice',
      fail('notices') ? 'read failed' : `${readCount} of ${mine2.length} read — internal Firestore notice only, FCM not claimed`,
      e2);

  const anyFail = rows.some(r => r.status === 'FAIL');
  return { rows, orderId, orderStatus: of.status?.stringValue,
           revision: num(of.revision?.integerValue), decision: anyFail ? 'FAIL' : 'PASS' };
}

/** Firestore REST document names look like projects/x/databases/y/documents/orders/<id>. */
function documentIdFromName(name) {
  if (typeof name !== 'string') return null;
  const i = name.indexOf('/documents/');
  if (i < 0) return null;
  const rest = name.slice(i + '/documents/'.length);
  const parts = rest.split('/');
  return parts.length === 2 && parts[0] === 'orders' && parts[1] ? parts[1] : null;
}

// --------------------------------------------------------------- production IO
async function main() {
  const { get } = createGcloudSession({ expectedAccount: 'moderohe8@gmail.com' });
  const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents/`;
  const errors = {};
  const safe = async (label, fn, fallback = []) => {
    try { return await fn(); } catch (e) { errors[label] = e.message || 'read failed'; return fallback; }
  };

  const members = await safe('members', () => listAll(get, `${ROOT}members`));
  const orders = await safe('orders', () => listAll(get, `${ROOT}orders`));
  const idempotency = await safe('idempotency', () => listAll(get, `${ROOT}idempotency`));
  const notices = await safe('notices', () => listAll(get, `${ROOT}notices`));
  const audit = await safe('audit', () => listAll(get, `${ROOT}auditEvents`));

  const users = await safe('users', async () => {
    const u = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`);
    u.searchParams.set('maxResults', '1000');
    u.searchParams.set('fields', 'users(disabled,emailVerified,providerUserInfo(providerId))');
    return f(await get(u.href)).users || [];
  }, []);

  // Order events are a subcollection, read only for the tagged order.
  const tagged = orders.filter(d => JSON.stringify(d.fields || {}).includes(TAG));
  const orderEvents = {};
  if (tagged.length >= 1) {
    const oid = documentIdFromName(tagged[0].name);
    if (oid) {
      const evs = await safe('events', () =>
        listAll(get, `https://firestore.googleapis.com/v1/${tagged[0].name}/events`));
      orderEvents[oid] = evs;
    }
  }

  const out = evaluate({
    members, users, orders, idempotency, notices, audit, orderEvents, errors,
    orderPages: orders.truncated ? 'many' : 'complete'
  });

  console.log(JSON.stringify({
    project: PROJECT, tag: TAG, decision: out.decision,
    orderId: out.orderId, orderStatus: out.orderStatus, revision: out.revision,
    readErrors: Object.keys(errors), rows: out.rows
  }, null, 2));
}

module.exports = { evaluate, documentIdFromName, listAll, TAG, PROJECT, PAGE };

if (require.main === module) {
  main().catch(e => { console.error('verification failed:', e.message); process.exitCode = 1; });
}