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

/*
 * MANDATORY gates must all PASS before the journey can be called accepted.
 * F1 is observational: it can only be witnessed in the owner's own browser
 * session, so it is reported but can never be satisfied from here.
 */
const MANDATORY = ['A1', 'A2', 'A3', 'B1', 'B2r', 'C0', 'C1', 'C2', 'C3', 'C4',
                   'D1', 'D2', 'E1', 'E2'];
const OBSERVATIONAL = ['F1'];

/*
 * Frontend-verified evidence for the observational gates.
 *
 * F1 cannot be observed from a server-side read: proving that the Firestore
 * client is denied requires an actual client SDK session. This accepts such
 * evidence, but only under strict conditions, and it can never manufacture a
 * PASS. Anything missing, malformed, or not an explicit denial stays
 * NOT TESTED. The evidence is treated as a claim, not as truth: it must name
 * the expected order, an authenticated session, and an explicit
 * permission-denied for every mandatory probe.
 */
const F1_REQUIRED_PROBES = ['A_direct_document_read', 'B_collection_query', 'C_write_nonexistent_probe_path'];

function verifyFrontendEvidence(evidence, orderId) {
  const reject = reason => ({ valid: false, reason });
  if (!evidence || typeof evidence !== 'object') return reject('no frontend evidence supplied');
  if (evidence.order !== orderId) return reject(`evidence names order ${evidence.order}, expected ${orderId}`);
  if (evidence.usedAdminSdk !== false) return reject('evidence was not produced by a client SDK session');
  if (evidence.remoteEvalUsed !== false) return reject('evidence relied on remote eval');
  if (!evidence.session || evidence.session.signedIn !== true) return reject('no authenticated client session');
  if (!Array.isArray(evidence.tests)) return reject('no probe results recorded');

  const results = new Map(evidence.tests.map(t => [t && t.name, t]));
  const missing = F1_REQUIRED_PROBES.filter(name => !results.has(name));
  if (missing.length) return reject('missing probes: ' + missing.join(','));

  const denied = [];
  for (const name of F1_REQUIRED_PROBES) {
    const t = results.get(name);
    // A denial must be an explicit permission-denied from the rules engine.
    // Any other failure is a network, App Check or auth problem and proves
    // nothing about authorization, so it must not be counted as a pass.
    if (t.outcome === 'unexpected_success' || t.code !== 'permission-denied') {
      return reject(`${name} was not denied by the rules (${t.outcome}/${t.code})`);
    }
    denied.push({ name, code: t.code });
  }
  return {
    valid: true,
    deniedProbes: denied,
    probeCount: evidence.tests.length,
    clientProject: evidence.clientProject || null,
    sessionProvider: evidence.session.provider || null
  };
}

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
  // A read that failed, or a page scan that hit its cap, makes the whole
  // verdict UNVERIFIED rather than silently reducing it to a PASS.
  finalise.ctx = { errors: input.errors || {}, complete: input.complete || {} };
  const rows = [];
  // Every row records where its evidence came from, so a backend readback can
  // never be mistaken for evidence driven through the real UI.
  const add = (id, gate, expected, actual, status, source = 'backend') =>
    rows.push({ id, gate, expected, actual, status, source });
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
  // A genuine Google identity is enabled, email-verified and google-linked.
  // The previous gate asserted "exactly one user" and never checked the verified
  // flag at all, so an unverified account would have passed.
  const genuine = users.filter(u => u.disabled !== true && u.emailVerified === true
    && (u.providerUserInfo || []).some(p => p.providerId === 'google.com'));
  // The property that matters is that a genuine, enabled, verified Google
  // identity exists. Demanding exactly one Auth user worldwide is not an
  // authorization property: it would wrongly fail any deployment that simply
  // has more than one legitimate employee. The observed count is still reported.
  add('A3', 'an enabled, verified, google-linked Auth user exists', '>=1, provider google.com',
      fail('users') ? 'read failed'
        : `${users.length} user(s), ${genuine.length} enabled+verified google-linked, providers=${providers.join('|') || 'none'}`,
      fail('users') ? 'NOT TESTED' : (genuine.length >= 1 ? 'PASS' : 'FAIL'));

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
  add('B2', 'idempotency total record count (informational)', 'counted',
      fail('idempotency') ? 'read failed' : `${idem.length} record(s)`, 'NOT TESTED');

  // Resolve the nominated order id before the early returns so the F1 row is
  // always present, including when the journey has not been executed yet.
  const nominatedId = n === 1 ? documentIdFromName(tagged[0].name) : null;

  // F1 is satisfied only by real client-session evidence. Without it the gate
  // stays NOT TESTED rather than being assumed from server-side reads.
  const frontend = verifyFrontendEvidence(input.frontendEvidence, nominatedId);
  if (input.frontendEvidence !== undefined && !frontend.valid) {
    add('F1', 'client-SDK Firestore denial', 'permission-denied for every mandatory probe',
        `evidence rejected: ${frontend.reason}`, 'FAIL', 'frontend');
  } else if (frontend.valid) {
    add('F1', 'client-SDK Firestore denial', 'permission-denied for every mandatory probe',
        `${frontend.deniedProbes.length}/${F1_REQUIRED_PROBES.length} probes denied in an authenticated client session`,
        'PASS', 'frontend');
  } else {
    add('F1', 'client-SDK Firestore denial (read / query / write)',
        'permission-denied observed in a real client session',
        'not observable server-side; no verified client evidence supplied', 'NOT TESTED');
  }



  if (n === 0) {
    add('B3', 'synthetic order journey', 'order created in the production UI',
        'no tagged order exists yet — journey not executed', 'NOT TESTED');
    add('B4', 'internal status workflow', 'created -> review -> preparing -> ready -> delivered',
        'no tagged order', 'NOT TESTED');
    add('B5', 'audit + event trail', 'created + edited + 4x status_changed', 'no tagged order', 'NOT TESTED');
    add('B6', 'internal notice read', 'notice exists and is read', 'no tagged order', 'NOT TESTED');
    return finalise({ rows, orderId: null });
  }

  if (n > 1) {
    add('B3', 'duplicate synthetic orders detected', 'exactly 1',
        `${n} orders carry the approved tag`, 'FAIL');
    add('B4', 'internal status workflow', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    add('B5', 'audit + event trail', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    add('B6', 'internal notice read', 'single order only', 'blocked by duplicate', 'NOT TESTED');
    return finalise({ rows, orderId: null });
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

  // B2 is decided here because it must reference THIS order id, not merely exist.
  {
    const mineIdem = idem.filter(d => field(d.fields, 'orderId')?.stringValue === orderId);
    add('B2r', 'idempotency record belongs to the approved order',
        'one record whose orderId equals this order',
        fail('idempotency') ? 'read failed' : `${mineIdem.length} record(s) point at this order`,
        fail('idempotency') ? 'NOT TESTED' : (mineIdem.length === 1 ? 'PASS' : 'FAIL'));
  }

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



  return finalise({ rows, orderId, orderStatus: of.status?.stringValue,
                    revision: num(of.revision?.integerValue) });
}


/**
 * Overall decision.
 * PASS is only reachable when every mandatory gate PASSED, every mandatory
 * row was evaluated, and no read was degraded or truncated. A NOT TESTED gate,
 * a failed read or an incomplete page scan can never yield PASS.
 */
function finalise({ rows, orderId, orderStatus, revision }) {
  const problems = (input = {}) => {
    const { errors = {}, complete = {} } = input;
    return Object.keys(errors).length > 0 ||
           Object.values(complete).some(v => v === false);
  };
  const degraded = problems(finalise.ctx || {});
  const mandatory = rows.filter(r => MANDATORY.includes(r.id));
  const missing = MANDATORY.filter(id => !rows.some(r => r.id === id));
  // A FAIL is always disqualifying, even on an observational gate: absent
  // evidence may be tolerated, but evidence that contradicts the expected
  // record must never be able to sit behind a PASS.
  const failed = rows.filter(r => r.status === 'FAIL');
  const untested = mandatory.filter(r => r.status !== 'PASS');
  const observational = rows.filter(r => OBSERVATIONAL.includes(r.id));

  let decision, why;
  if (degraded) { decision = 'UNVERIFIED'; why = 'a required read failed or was not fully paged'; }
  // A FAIL is conclusive and outranks the gates that never got evaluated:
  // a duplicate (B1 FAIL) short-circuits the rest and must stay a FAIL.
  else if (failed.length) { decision = 'FAIL'; why = 'failed gates: ' + failed.map(r => r.id).join(','); }
  else if (missing.length) { decision = 'NOT_EXECUTED'; why = 'mandatory gates not evaluated: ' + missing.join(','); }
  else if (untested.length) { decision = 'NOT_EXECUTED'; why = 'not verified: ' + untested.map(r => r.id).join(','); }
  else { decision = 'PASS'; why = 'every mandatory gate passed'; }

  return {
    rows, orderId, orderStatus, revision, decision, why,
    mandatoryGates: MANDATORY.length,
    mandatoryPassed: mandatory.filter(r => r.status === 'PASS').length,
    observationalOutstanding: observational.filter(r => r.status !== 'PASS').map(r => r.id)
  };
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

  const complete = {
    members: members.truncated !== true,
    orders: orders.truncated !== true,
    idempotency: idempotency.truncated !== true,
    notices: notices.truncated !== true,
    audit: audit.truncated !== true,
    users: (users || []).length < 1000
  };

  // Optional verified frontend evidence for the observational gates.
  let frontendEvidence;
  const evidenceArg = process.argv.slice(2).find(a => a.startsWith('--frontend-evidence='));
  if (evidenceArg) {
    frontendEvidence = JSON.parse(require('node:fs').readFileSync(evidenceArg.split('=').slice(1).join('='), 'utf8'));
  }

  const out = evaluate({
    frontendEvidence,
    members, users, orders, idempotency, notices, audit, orderEvents, errors, complete,
    orderPages: orders.truncated ? 'truncated' : 'complete'
  });

  console.log(JSON.stringify({
    project: PROJECT, tag: TAG, decision: out.decision,
    orderId: out.orderId, orderStatus: out.orderStatus, revision: out.revision,
    decision: out.decision, decisionReason: out.why,
    mandatoryGates: out.mandatoryGates, mandatoryPassed: out.mandatoryPassed,
    observationalOutstanding: out.observationalOutstanding,
    readsComplete: complete, readErrors: Object.keys(errors), rows: out.rows
  }, null, 2));
}

module.exports = { evaluate, documentIdFromName, listAll, verifyFrontendEvidence, F1_REQUIRED_PROBES, TAG, PROJECT, PAGE, MANDATORY, OBSERVATIONAL, finalise };

if (require.main === module) {
  main().catch(e => { console.error('verification failed:', e.message); process.exitCode = 1; });
}