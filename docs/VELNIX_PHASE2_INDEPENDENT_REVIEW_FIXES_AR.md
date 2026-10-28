# VELNIX — إغلاق المراجعة المستقلة للمرحلة الثانية

**الأمن + اكتمال البحث + Pagination + العمليات الجماعية + نتائج الباركود**

- الفرع: `main`
- Commit المراجَع: `647983a`
- Commit الإغلاق: `b48da9f`
- CI: `40623994117` — **4/4 خضراء**
- المشروع: `velnix-6c1a2` · الويب: https://velnix-6c1a2.web.app

---

## 1. السبب الجذري لكل خلل والإصلاح

| # | الخلل | السبب الجذري | الإصلاح |
|---|---|---|---|
| 1أ | `bulkDispatch` بلا فحص `sendToDelivery` | `dispatchOrder` كانت **تفترض** أن المستدعي فحصها؛ `bulk.js` اكتفى بـ`requireAuth` | `dispatchOrder` تفرض `requiredPerm(user,'sendToDelivery')` بنفسها؛ و`bulkDispatch` تفشل فورًا قبل أي إرسال |
| 1ب | `bulkAssignCompany` بلا تحقق | `applyCompanyAssignment` لم تفرض الصلاحية ولا تُتحقق الشركة مسبقًا | `applyCompanyAssignment` تفرض `sendToDelivery` + تحقق الشركة قبل/داخل المعاملة؛ `bulkAssignCompany` تتحقق مسبقًا |
| 2 | مهلة الإرسال الجماعي | 50 طلبًا تتابعيًا ضمن مهلة 60ث | حد `MAX_DISPATCH=10` لكل نداء + سجل دائم `bulkOperations/{opId}` لكل نتيجة + `getBulkOperation` للاسترجاع |
| 3 | لا Pagination في البحث | حد 50 نتيجة بلا Cursor | `nextCursor` مشفّر مبني على `(createdAt,id)`، ترتيب ثابت، بلا تكرار |
| 4 | `listOrders` تُسقط نتائج خارج النافذة | over-fetch 200 ثم فلترة | مسح متدرّج حتى امتلاء الصفحة أو نهاية البيانات، مع `nextAfterId` = آخر سجل **مقروء** |
| 5 | بحث جزئي داخل النص/الهاتف | `searchText` يطابق البداية فقط؛ `searchTokens` كلمات كاملة | `searchPrefixes` (بادئات كل كلمة) و`searchPhoneSuffixes` (لواحق الهاتف) مع `array-contains` |
| 6 | Backfill إنتاجي غير مُنفّذ | الاختبار داخل emulator فقط | تدقيق إنتاجي + نسخة احتياطية + تشغيل فعلي + إثبات Idempotency |
| 7 | تضارب 50/500 | البحث 50، Callable 50، الطباعة من `rows`، تحديد 500 | تجزئة موحّدة: تحديد حتى 200، عمليات عادية 50/دفعة، إرسال 10/دفعة، طباعة بجلب خادمي |
| 8 | الطباعة الجماعية من `rows` فقط | `_selectedOrders` من الصفحة المحمّلة | `getOrdersByIds` خادمي (تحقق صلاحية + إخفاء مبالغ) لجميع المعرّفات المختارة |
| 9 | شاشة نتائج الباركود بلا إجراءات | عرض فقط | تحديد + تحديد الكل + طباعة/حالة/إسناد/إرسال عبر نفس Callables |

---

## 2. الأدلة (الأمن أولًا)

### 2.1 ثغرة `bulkDispatch`
- **قبل:** مستخدم `dataEntry`/`sales` بلا `sendToDelivery` يستطيع استدعاء `bulkDispatch` مباشرة.
- **بعد:** `dispatchOrder` تفرض الصلاحية داخليًا (دفاع بعمق لأي مستدعٍ مستقبلي)، و`bulkDispatch` تفشل **قبل** الحلقة.
- **اختبار:** `bulkDispatch and bulkAssignCompany reject callers without sendToDelivery before any send` — يرفض `entry`/`noSend` ويؤكد أن `dispatchState:'idle'` و`trackingNumber:null` (لا إرسال خارجي).

### 2.2 ثغرة `bulkAssignCompany`
- **اختبار:** `a dataEntry cannot assign a company it is not allowed to send for, even via bulk` — رفض خادمي. و`sender` المخوّل ينجح لكن الحالات غير المسموحة (طلب مُرسل) تُرفض.

### 2.3 المهلات
- `bulkDispatch` ترفض >10 معرّفات (`invalid-argument`) وتكتب `bulkOperations/{opId}`.
- **اختبار:** `bulkDispatch writes a durable operation record…` + `getBulkOperation` يقرأ النتيجة لاحقًا.

---

## 3. جدول الإغلاق

| المطلب | النتيجة | الدليل |
|---|---|---|
| ثغرة `bulkDispatch` | PASS | `requiredPerm` في `dispatchOrder` + اختبار رفض قبل الإرسال |
| ثغرة `bulkAssignCompany` | PASS | `requiredPerm` في `applyCompanyAssignment` + اختبار رفض |
| مهلات الإرسال الجماعي | PASS | `MAX_DISPATCH=10` + `bulkOperations` + `getBulkOperation` + اختبارات |
| Pagination في البحث | PASS | `nextCursor` + اختبار «>50 بلا تكرار» |
| Pagination مع الفلاتر | PASS | `listOrders` مسح متدرّج + اختبار «مطابق بعد 220 غير مطابق» |
| البحث الجزئي داخل النص | PASS | `searchPrefixes` + اختبار «الرحمن/المومني/شرعي/الاتصال» |
| البحث الجزئي داخل الهاتف | PASS | `searchPhoneSuffixes` + اختبار «239876» |
| Backfill الإنتاجي | PASS | 8/8 طلب مُعبّأ؛ إعادة التشغيل 0؛ لا تغيير على الحقول المحمية |
| تحديد جميع النتائج | PASS | تحديد عبر الصفحات حتى 200 + عدّ دقيق |
| التعامل مع الحد 50/500 | PASS | تجزئة 50 لعمليات، 10 للإرسال، توضيح الدفعات |
| الطباعة الجماعية من عدة صفحات | PASS | `getOrdersByIds` + اختبار «getOrdersByIds يحترم الصلاحيات ويخفي المبالغ» |
| إجراءات نتائج الباركود | PASS | تحديد + طباعة/حالة/إسناد/إرسال عبر نفس الخدمات |
| الاختبارات الأمنية | PASS | 5 اختبارات رفض قبل أي اتصال خارجي |
| منع إرسال Click المكرر | PASS | عدم تغيير `dispatchOrder`/القفل؛ 203 اختبار emulator |
| الأداء | PASS | مسح محدود (SCAN=200/استعلام، سقف 2000/نداء)، لا Full Scan |
| النشر | PASS | Functions (56) + Indexes (124) + Hosting + APK |
| Android الحقيقي | BLOCKED | لا جهاز؛ الكاميرا/المسح لم تُختبر فعليًا |

---

## 4. نتائج الاختبارات الجديدة

- `bulkDispatch`/`bulkAssignCompany` رفض غير المخوّلين (dataEntry/sales) قبل الإرسال. ✅
- `bulkChangeStatus` لا يتجاوز `needs_review` (نجاح جزئي). ✅
- حد دفعة الإرسال (11 ⇒ رفض). ✅
- البحث > 50 نتيجة عبر عدة صفحات بلا تكرار. ✅
- `listOrders` فلاتر داخل الذاكرة تجد مطابقًا بعد 220 غير مطابق. ✅
- بحث وسط النص ووسط الهاتف. ✅
- Backfill آمن و Idempotent (داخل emulator). ✅
- `getOrdersByIds` صلاحيات + إخفاء مبالغ. ✅
- سجل `bulkOperations` + `getBulkOperation`. ✅

### الحزم
| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **461** |
| functions unit | **194** |
| functions emulator + rules | **203** |
| Playwright E2E | **21/21** |
| CI `40623994117` | 4/4 |

---

## 5. Firestore Indexes وBackfill

- **Indexes**: 124 (أُضيفت `searchPrefixes` و`searchPhoneSuffixes` + `createdAt` و`createdBy` variants) — منشورة.
- **Backfill إنتاجي**:
  1. تدقيق قبل: `total=8, missingText=8, missingTokens=8, missingPrefixes=8, missingPhoneSuffixes=8`.
  2. نسخة احتياطية: `/tmp/velnix-backup/orders.json` (8 سجلات).
  3. Dry-run: `changed=8, written=0`.
  4. Apply: `written=8, failed=0`.
  5. إعادة تشغيل: `changed=0` (Idempotent).
  6. تدقيق بعد: **كل الحقول 0 مفقودة**.
  7. الحقول المحمية (customer/amount/status/orderNumber/createdBy/phone/barcodeValue/pageId/companyId/revision): **0 تغيير**.

---

## 6. النشر

- **Functions**: منشورة (56؛ منها `getOrdersByIds`, `getBulkOperation`, إصلاح `bulkDispatch`/`bulkAssignCompany`).
- **Indexes**: 124 منشورة.
- **Hosting**: منشور (bundle نظيف).
- **APK**: `delivery/apk/Velnix-release.apk` موقّع `CN=Velnix` (SHA-256 `01c0298c…`)، App Check = Play Integrity.
- **Commit**: `b48da9f` · **CI**: `40623994117`.

## 7. قيود غير مثبتة

- **Android على جهاز حقيقي: BLOCKED** — تجربة كاميرا/مسح الباركود تحتاج جهازًا فعليًا (لم تُعلن PASS).
- **الإرسال الجماعي لـ Click**: اختُبر بـ Mock/Emulator؛ لم تُرسَل شحنات حقيقية.
