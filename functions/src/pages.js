'use strict';
const {documentId,validatePageFields} = require('./policy');
const PAGE_STATUS = Object.freeze({active:'active',disabled:'disabled',archived:'archived'});
const LOGO_MAX_BYTES = 64 * 1024;
const LOGO_MIME = new Set(['image/png','image/jpeg','image/webp','image/gif']);
// Accepts a bounded base64 data URI for the optional page logo. Anything that
// is not a small supported image is rejected so no arbitrary payload is stored.
function normalizeLogo(value){
  if(value==null||value==='')return '';
  if(typeof value!=='string'||value.length>Math.ceil(LOGO_MAX_BYTES*1.4))throw Error('invalid_logo');
  const m=/^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!m||!LOGO_MIME.has(m[1]))throw Error('invalid_logo');
  const bytes=Buffer.from(m[2],'base64');
  if(bytes.length===0||bytes.length>LOGO_MAX_BYTES)throw Error('invalid_logo');
  return value;
}

// Organization "electronic pages" (the client's Facebook pages). Namespaced
// inside the single-organization Velnix project under `pages/{id}`. Deletion is
// never performed: pages are archived so historical orders keep their snapshot.
module.exports = ({db,FieldValue,FieldPath,requireAuth,currentActor,audit,fail}) => {
  // Creating/editing/archiving pages requires either the explicit managePages
  // permission or the generalManager role (can() already covers the GM).
  const {can} = require('./policy');
  const manage = user => { if (!can(user, 'managePages')) fail('permission-denied', 'إدارة الصفحات الإلكترونية غير متاحة لحسابك'); };

  const pageView = (id, d) => ({
    id,
    name: d.name || '',
    facebookUrl: d.facebookUrl || '',
    logoPath: d.logoPath || '',
    logoDataUri: d.logoDataUri || '',
    phone: d.phone || '',
    whatsapp: d.whatsapp || '',
    note: d.note || '',
    status: d.status || (d.archived ? 'archived' : d.active === false ? 'disabled' : 'active'),
    active: d.active !== false && d.archived !== true,
    archived: d.archived === true,
    orderCount: d.orderCount || 0,
    createdBy: d.createdBy || null,
    createdByName: d.createdByName || null,
    updatedBy: d.updatedBy || null,
    updatedByName: d.updatedByName || null,
    createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  });

  async function listPages(req) {
    const user = await requireAuth(req);
    const size = req.data?.pageSize ?? 50;
    if (!Number.isSafeInteger(size) || size < 1 || size > 100) fail('invalid-argument', 'حجم صفحة غير صالح');
    const query = req.data?.query != null ? String(req.data.query).trim().slice(0, 80) : '';
    // Full list is small (per-organization); filter by name prefix when asked.
    let base = db.collection('pages');
    if (query) base = base.where('nameLower', '>=', query.toLocaleLowerCase('ar')).where('nameLower', '<=', query.toLocaleLowerCase('ar') + '\uf8ff').orderBy('nameLower');
    else base = base.orderBy('createdAt', 'desc');
    base = base.limit(size + 1);
    if (req.data?.afterId) base = base.startAfter(await db.doc('pages/' + documentId(req.data.afterId)).get());
    const result = await base.get();
    const page = result.docs.slice(0, size);
    return {
      items: page.map(d => pageView(d.id, d.data())),
      more: result.size > size,
      afterId: page.at(-1)?.id || null,
      canManage: can(user, 'managePages'),
      // The caller's own allowed page ids (GM sees all) so the form can filter.
      allowedPageIds: user.role === 'generalManager' ? null : (user.allowedPageIds || []),
    };
  }

  // Active pages the caller may create orders for. Used by the order form.
  async function listAllowedPages(req) {
    const user = await requireAuth(req);
    const snap = await db.collection('pages').where('archived', '!=', true).get();
    const all = snap.docs.map(d => pageView(d.id, d.data())).filter(p => p.active);
    const allowed = user.role === 'generalManager'
      ? all
      : all.filter(p => (user.allowedPageIds || []).includes(p.id));
    return {items: allowed, allPages: user.role === 'generalManager' || can(user, 'managePages') ? all : undefined};
  }

  async function savePage(req) {
    const user = await requireAuth(req);
    manage(user);
    let fields;
    let logoDataUri = '';
    try { fields = validatePageFields(req.data || {}); logoDataUri = normalizeLogo(req.data?.logoDataUri); } catch (e) {
      const map = {
        invalid_name: 'اسم الصفحة مطلوب ولا يتجاوز 120 حرفاً',
        invalid_page_url: 'رابط Facebook يجب أن يبدأ بـ http أو https',
        invalid_page_phone: 'رقم هاتف الصفحة غير صالح',
        invalid_page_whatsapp: 'رقم WhatsApp غير صالح',
        invalid_logo: 'شعار الصفحة غير صالح (صورة صغيرة PNG/JPEG/WebP/GIF فقط)',
      };
      fail('invalid-argument', map[e.message] || 'بيانات الصفحة غير صالحة');
    }
    const id = req.data?.id != null ? documentId(req.data.id) : null;
    const nameLower = fields.name.toLocaleLowerCase('ar');
    const result = await db.runTransaction(async tx => {
      await currentActor(tx, user);
      const ref = id ? db.doc('pages/' + id) : db.collection('pages').doc();
      if (id) {
        const existing = await tx.get(ref);
        if (!existing.exists) fail('not-found', 'الصفحة غير موجودة');
      }
      // Prevent duplicate active page names inside the organization.
      const dupes = await tx.get(db.collection('pages').where('nameLower', '==', nameLower).limit(2));
      const conflict = dupes.docs.find(d => d.id !== ref.id && d.data().archived !== true);
      if (conflict) fail('already-exists', 'توجد صفحة بنفس الاسم بالفعل');
      const base = {
        name: fields.name,
        nameLower,
        facebookUrl: fields.facebookUrl,
        logoPath: fields.logoPath,
        logoDataUri,
        phone: fields.phone,
        phoneDigits: fields.phoneDigits,
        whatsapp: fields.whatsapp,
        whatsappDigits: fields.whatsappDigits,
        note: fields.note,
        updatedBy: user.id,
        updatedByName: user.name || '',
        updatedAt: FieldValue.serverTimestamp(),
      };
      const archived = req.data?.archived === true;
      const active = req.data?.active !== false && !archived;
      Object.assign(base, {archived, active, status: archived ? 'archived' : active ? 'active' : 'disabled'});
      if (ref.id && (await db.doc('pages/' + ref.id).get()).exists) {
        tx.update(ref, base);
      } else {
        tx.create(ref, {...base, createdBy: user.id, createdByName: user.name || '', createdAt: FieldValue.serverTimestamp(), orderCount: 0});
      }
      await audit('page.saved', user, ref.id, {archived, active}, tx);
      return ref.id;
    });
    return {id: result};
  }

  async function archivePage(req) {
    const user = await requireAuth(req); manage(user);
    const id = documentId(req.data?.id);
    await db.runTransaction(async tx => {
      await currentActor(tx, user);
      const ref = db.doc('pages/' + id), snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'الصفحة غير موجودة');
      tx.update(ref, {archived: true, active: false, status: 'archived', updatedBy: user.id, updatedByName: user.name || '', updatedAt: FieldValue.serverTimestamp()});
      await audit('page.archived', user, id, {}, tx);
    });
    return {ok: true};
  }

  async function restorePage(req) {
    const user = await requireAuth(req); manage(user);
    const id = documentId(req.data?.id);
    await db.runTransaction(async tx => {
      await currentActor(tx, user);
      const ref = db.doc('pages/' + id), snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'الصفحة غير موجودة');
      tx.update(ref, {archived: false, active: true, status: 'active', updatedBy: user.id, updatedByName: user.name || '', updatedAt: FieldValue.serverTimestamp()});
      await audit('page.restored', user, id, {}, tx);
    });
    return {ok: true};
  }

  // Index-backed order counts per page (no client-side list scanning). Uses a
  // small number of count aggregations, one per page, respecting order scope.
  async function pageStats(req) {
    const user = await requireAuth(req);
    const ids = Array.isArray(req.data?.ids) ? req.data.ids.map(documentId).slice(0, 100) : [];
    const {AggregateField} = require('firebase-admin/firestore');
    const counts = {};
    for (const id of ids) {
      const agg = db.collection('orders').where('pageId', '==', id)
        .aggregate({count: AggregateField.count()});
      const snap = await agg.get();
      counts[id] = snap.data().count || 0;
    }
    return {counts};
  }

  return {listPages, listAllowedPages, savePage, archivePage, restorePage, pageStats};
};
