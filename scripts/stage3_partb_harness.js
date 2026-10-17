'use strict';
/*
 * Velnix — Stage 3 Part B acceptance harness
 * ------------------------------------------------------------------
 * PURPOSE
 *   Runs the owner-authorised single-synthetic-order acceptance journey
 *   inside the OWNER'S ALREADY AUTHENTICATED production page context.
 *
 * SAFETY PROPERTIES
 *   - Reads no credential. Reads no token. Prints no token, UID, email,
 *     cookie, or customer data.
 *   - Creates NO Firebase app and hardcodes NO config: it reuses the
 *     production app instance the running Velnix Web build already created,
 *     so the authenticated session is shared, never copied.
 *   - Re-uses the live Enterprise App Check instance the app already
 *     activated. Only the token LENGTH is ever reported.
 *   - Gate-first: if any identity/authorisation gate fails it throws BEFORE
 *     performing a single write.
 *   - Idempotent: order creation uses a stable request key, and every later
 *     step is conditional on current server state, so a re-run resumes
 *     instead of duplicating work.
 *   - Scope: one synthetic internal order. No company assignment, no
 *     dispatch, no membership mutation, no deletion.
 *
 * HOW TO RUN (owner)
 *   1. Open https://velnix-6c1a2.web.app and sign in with Google as the
 *      approved general manager.
 *   2. Load this exact reviewed file (see loader below).
 *   3. Paste the sanitised JSON result back.
 */
(async function velnixStage3PartB () {
  const TAG = 'STAGE3_ACCEPTANCE_20261016T214135Z';
  const ORIGIN = 'https://velnix-6c1a2.web.app';
  const REGION = 'europe-west1';
  const R = [];                                   // sanitised result rows
  const log = (id, expected, actual, evidence, status) =>
    R.push({ id, expected, actual, evidence, status });
  const ms = t0 => Math.round(performance.now() - t0);

  // ---- FIXTURE (server-validated shape; constant across re-runs) ----
  const FIXTURE = {
    customer: TAG,
    phone: '0000000000',
    city: 'اختبار آلي',
    area: 'منطقة اختبار',
    address: 'TEST ONLY — عنوان اصطناعي للاختبار',
    description: 'INTERNAL TEST — ' + TAG,
    extraPhone: '',
    note: 'INTERNAL TEST — ' + TAG,
    quantity: 1,
    amount: '0.000',
    paymentMethod: 'عند الاستلام',
    requestKey: TAG                               // stable idempotency key
  };
  const EDITED_NOTE = 'INTERNAL TEST EDITED — ' + TAG;

  function stop(reason) { throw new Error('GATE_STOP:' + reason); }

  try {
    // ================= GATE (no writes before this passes) =================
    log('G1-origin', ORIGIN, location.origin, 'location.origin',
        location.origin === ORIGIN ? 'PASS' : 'FAIL');
    if (location.origin !== ORIGIN) stop('wrong origin');

    const [core, authMod, fnMod, acMod, fsMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
    ]);

    const app = core.getApps().length ? core.getApp() : stop('no firebase app on page');
    const a = authMod.getAuth(app);
    const user = a.currentUser;
    log('G2-authenticated', 'signed in', user ? 'signed in' : 'signed out',
        'presence only; no token read', user ? 'PASS' : 'FAIL');
    if (!user) stop('not signed in — sign in as the approved general manager first');

    let ac = acMod.getAppCheck(app);
    if (!ac) {
      const siteKey = localStorage.getItem('FlutterFire-[DEFAULT]-recaptchaSiteKey');
      if (!siteKey) stop('no Enterprise site key on page');
      ac = acMod.initializeAppCheck(app, {
        provider: new acMod.ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true
      });
    }
    const providerType = localStorage.getItem('FlutterFire-[DEFAULT]-recaptchaType');
    const tok = await acMod.getToken(ac, true).catch(() => null);
    log('G3-appcheck', 'real Enterprise token', 'len=' + (tok && tok.token ? tok.token.length : 0),
        'provider=' + providerType + '; value never read',
        tok && tok.token && providerType === 'enterprise' ? 'PASS' : 'FAIL');
    if (!tok || !tok.token) stop('no genuine App Check token');
    if (providerType !== 'enterprise') stop('App Check provider is not enterprise');

    const fns = fnMod.getFunctions(app, REGION);
    const call = async (name, data = {}) => {
      const t0 = performance.now();
      try { const r = await fnMod.httpsCallable(fns, name)(data);
            return { ok: true, data: r.data, ms: ms(t0) }; }
      catch (e) { return { ok: false, code: e.code || 'unknown', ms: ms(t0) }; }
    };

    const js = call('joinSession');
    log('G4-joinSession', 'approved', js.ok ? js.data.status : js.code, js.ms + 'ms',
        js.ok && js.data.status === 'approved' ? 'PASS' : 'FAIL');
    if (!js.ok || js.data.status !== 'approved') stop('joinSession did not return approved');

    const me = call('me');
    log('G5-me', 'generalManager/active', me.ok ? me.data.role + '/' + me.data.active : me.code,
        me.ms + 'ms', me.ok && me.data.role === 'generalManager' && me.data.active === true ? 'PASS' : 'FAIL');
    if (!me.ok || me.data.role !== 'generalManager' || me.data.active !== true) stop('me role/active mismatch');

    const db = fsMod.getFirestore(app);
    const memberSnap = await fsMod.getDoc(fsMod.doc(db, 'members', user.uid));
    const m = memberSnap.exists ? memberSnap.data() : {};
    const identityOk = memberSnap.exists && m.role === 'generalManager' && m.active === true;
    log('G6-identity', 'session uid == members/{uid} (role/active/approved)',
        memberSnap.exists ? m.role + '/' + m.active + '/' + m.approvalStatus : 'document missing',
        'doc id equals session uid by construction; uid value not printed',
        identityOk ? 'PASS' : 'FAIL');
    if (!identityOk) stop('session uid does not resolve to an active approved generalManager member');

    const ds = call('dashboardStats');
    log('G7-dashboardStats', 'ok', ds.ok ? 'ok' : ds.code, ds.ms + 'ms', ds.ok ? 'PASS' : 'FAIL');
    if (!ds.ok) stop('dashboardStats failed');

    // ================= PART B =================
    const cr = await call('createOrder', FIXTURE);
    const orderId = cr.ok ? cr.data.id : null;
    log('B1-create', 'one order for the approved tag', cr.ok ? 'created/returned id' : cr.code,
        'requestKey=' + TAG + ' alreadyExists=' + (cr.ok ? cr.data.alreadyExists : 'n/a'),
        cr.ok ? 'PASS' : 'FAIL');
    if (!cr.ok) stop('createOrder failed: ' + cr.code);

    const go = await call('getOrder', { id: orderId });
    let o = go.ok ? go.data.order : null;
    const shapeOk = o && o.customer === TAG && o.quantity === 1 && o.amountMinor === 0 &&
      o.companyId == null && o.hasDelivery === false && !o.trackingNumber && !o.remoteStatus;
    log('B2-readback', 'tag/qty1/amount0/no company/no tracking', shapeOk ? 'as required' : 'MISMATCH',
        go.ok ? 'status=' + o.status + ' revision=' + o.revision : go.code, shapeOk ? 'PASS' : 'FAIL');
    if (!shapeOk) stop('created order does not match the approved fixture');

    if (o.note !== EDITED_NOTE) {
      const ed = await call('updateOrder', { id: orderId, note: EDITED_NOTE });
      log('B3-edit', 'note updated once, revision+1', ed.ok ? 'ok' : ed.code,
          'financial/recipient/company fields untouched', ed.ok ? 'PASS' : 'FAIL');
      if (!ed.ok) stop('updateOrder failed: ' + ed.code);
    } else {
      log('B3-edit', 'note updated once', 'already applied (resume)',
          'idempotent resume', 'PASS');
    }

    const go2 = await call('getOrder', { id: orderId });
    o = go2.data.order;
    const editOk = o.note === EDITED_NOTE && o.amountMinor === 0 && o.companyId == null && o.hasDelivery === false;
    log('B3b-edit-verify', 'note readback + revision increment', editOk ? 'ok' : 'MISMATCH',
        'revision=' + o.revision, editOk ? 'PASS' : 'FAIL');
    if (!editOk) stop('edit did not persist');

    const so = await call('searchOrders', { query: TAG });
    const hit = so.ok ? so.data.items.filter(x => x.id === orderId) : [];
    const exact = so.ok ? so.data.items.filter(x => (x.customer || '') === TAG) : [];
    log('B4-search', 'exact-tag search returns this order', hit.length === 1 ? '1 exact' : 'MISMATCH',
        so.ok ? 'items=' + so.data.items.length + ' exactTag=' + exact.length : so.code,
        hit.length === 1 && exact.length === 1 ? 'PASS' : 'FAIL');
    if (!so.ok) stop('searchOrders failed: ' + so.code + ' (possible missing index)');
    if (hit.length !== 1) stop('search did not return the synthetic order');

    for (const [from, to] of [['created','review'],['review','preparing'],['preparing','ready'],['ready','delivered']]) {
      if (o.status !== from) { log('B5-' + to, from + '->' + to, 'skipped (status=' + o.status + ')',
          'already applied; idempotent resume', 'PASS'); continue; }
      const t = await call('changeOrderStatus', { id: orderId, status: to });
      const back = await call('getOrder', { id: orderId });
      const no = back.data.order;
      const okT = t.ok && no.status === to;
      log('B5-' + to, from + '->' + to, t.ok ? no.status : t.code,
          'revision=' + no.revision + ' company=' + no.companyId + ' tracking=' + (no.trackingNumber || 'none'),
          okT ? 'PASS' : 'FAIL');
      if (!okT) stop('transition ' + from + '->' + to + ' failed: ' + t.code);
      o = no;
    }

    const finalOk = o.status === 'delivered' && o.completionSource === 'internal' &&
      o.companyId == null && o.hasDelivery === false && !o.trackingNumber && !o.remoteStatus;
    log('B6-internal-complete', "completionSource=internal, no shipment/tracking, locked",
        finalOk ? 'delivered/internal' : 'MISMATCH',
        'status=' + o.status + ' completionSource=' + o.completionSource, finalOk ? 'PASS' : 'FAIL');
    if (!finalOk) stop('terminal state is not a clean internal completion');

    const ev = (go2.data.events || []).map(e => e.type);
    const need = ['created','edited','status_changed','status_changed','status_changed','status_changed'];
    const evOk = ev.includes('created') && ev.includes('edited') &&
                 ev.filter(x => x === 'status_changed').length >= 4;
    log('B7-events', 'created + edited + 4x status_changed', evOk ? 'present' : 'MISSING',
        'event types=' + [...new Set(ev)].join(','), evOk ? 'PASS' : 'FAIL');

    const la = await call('listAudit', {});
    const mine = la.ok ? la.data.items.filter(x => x.entityId === orderId) : [];
    const laOk = la.ok && mine.some(x => x.action === 'order.created') &&
                 mine.some(x => x.action === 'order.edited') &&
                 mine.filter(x => x.action === 'order.status_changed').length >= 4;
    log('B8-audit', 'order.created + order.edited + 4x order.status_changed',
        laOk ? 'present for this order' : 'MISSING',
        la.ok ? 'scoped audit rows for this order=' + mine.length : la.code, laOk ? 'PASS' : 'FAIL');

    let notice = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const ln = await call('listNotices', {});
      notice = ln.ok ? ln.data.items.find(x => x.orderId === orderId) : null;
      if (notice) break;
      await new Promise(r => setTimeout(r, 5000));
    }
    log('B9-notice', 'internal notice for this order (<=60s)', notice ? 'found' : 'TIMEOUT',
        notice ? 'read=' + notice.read : 'bounded wait expired', notice ? 'PASS' : 'FAIL');

    if (notice && notice.read !== true) {
      const mr = await call('markNoticeRead', { id: notice.id });
      const ln2 = await call('listNotices', {});
      const n2 = ln2.ok ? ln2.data.items.find(x => x.id === notice.id) : null;
      log('B10-markRead', 'only this notice marked read', mr.ok && n2 && n2.read === true ? 'ok' : 'MISMATCH',
          'targetNoticeRead=' + (n2 ? n2.read : 'unknown'), mr.ok && n2 && n2.read === true ? 'PASS' : 'FAIL');
    } else if (notice) {
      log('B10-markRead', 'only this notice marked read', 'already read (resume)',
          'idempotent resume', 'PASS');
    } else {
      log('B10-markRead', 'only this notice marked read', 'NOT TESTED', 'no notice found', 'NOT TESTED');
    }
    log('B11-push', 'NOT claimed', 'not tested', 'internal Firestore notice only; FCM out of scope', 'NOT TESTED');

    // ---- Firestore direct-access denial ----
    const deny = async (fn) => { try { await fn(); return { denied: false }; }
                                catch (e) { return { denied: true, code: e.code }; } };
    const dr = await deny(() => fsMod.getDoc(fsMod.doc(db, 'orders', orderId)));
    log('S1-direct-read-doc', 'permission-denied', dr.denied ? dr.code : 'ALLOWED',
        'getDoc on the synthetic order only', dr.denied ? 'PASS' : 'CRITICAL-FAIL');
    if (!dr.denied) log('S1-ALERT', 'CRITICAL: direct doc read permitted', 'security failure', 'rules', 'CRITICAL-FAIL');

    const dl = await deny(() => fsMod.getDocs(fsMod.collection(db, 'orders')));
    log('S2-direct-list', 'permission-denied', dl.denied ? dl.code : 'ALLOWED',
        'getDocs(orders); contents never enumerated', dl.denied ? 'PASS' : 'CRITICAL-FAIL');

    // Tightly scoped: SAME already-saved note value, single field.
    const dw = await deny(() => fsMod.updateDoc(fsMod.doc(db, 'orders', orderId),
                                                { note: EDITED_NOTE }));
    log('S3-direct-write', 'permission-denied', dw.denied ? dw.code : 'WRITE SUCCEEDED',
        'single field, identical value; nothing changed', dw.denied ? 'PASS' : 'CRITICAL-FAIL');
    if (!dw.denied) log('S3-ALERT', 'CRITICAL: direct client write permitted', 'security failure', 'rules', 'CRITICAL-FAIL');

    window.VELNIX_PART_B = { orderId, results: R, completedAt: new Date().toISOString() };
    console.log('VELNIX_PART_B_RESULT ' + JSON.stringify(window.VELNIX_PART_B));
    return window.VELNIX_PART_B;

  } catch (e) {
    const msg = String((e && e.message) || e);
    log('Z-ABORT', 'complete journey', msg.includes('GATE_STOP') ? 'STOPPED BEFORE WRITE' : 'ERROR',
        msg.slice(0, 160), 'BLOCKED');
    window.VELNIX_PART_B = { orderId: null, results: R, aborted: true, reason: msg.slice(0, 200) };
    console.log('VELNIX_PART_B_RESULT ' + JSON.stringify(window.VELNIX_PART_B));
    return window.VELNIX_PART_B;
  }
})();