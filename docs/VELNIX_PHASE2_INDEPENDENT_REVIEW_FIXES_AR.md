# VELNIX — إغلاق المراجعة النهائية للمرحلة الثانية

- الفرع: `main`
- Commit المراجَع: `9596bce`
- Commit الإغلاق: `146c1a2`
- CI: `40629519011` — **4/4 خضراء**
- المشروع: `velnix-6c1a2` · https://velnix-6c1a2.web.app

> لم يُعد بناء مساري `sendToDelivery` في `dispatchOrder`/`applyCompanyAssignment` — تم التأكد من إغلاقهما فقط.

---

## 1. جدول إغلاق الملاحظات

| المطلب | النتيجة | دليل التنفيذ |
|---|---|---|
| معرف العملية يُنشأ قبل الإرسال ويُمرر للخادم | PASS | `bulkDispatch` يتحقق من `operationId` (16–80 حرفاً)؛ العميل يولّده في `_bulkDispatch`/`_dispatch` |
| حفظ هوية المنشئ + قائمة الطلبات + البصمة + الحالة | PASS | `bulkOperations/{opId}: {actorId, ids, fingerprint, status, ...}` داخل معاملة |
| منع استيلاء مستخدم آخر على المعرف | PASS | `actorId!==user.id` → رفض؛ اختبار «another user cannot take over» |
| تكرار نفس العملية ونفس البيانات لا يبدأ إرسالًا | PASS | تخطي أي `orderId` له نتيجة دائمة؛ اختبار «reusing … never re-dispatches» |
| نفس المعرف ببيانات مختلفة مرفوض | PASS | مطابقة `fingerprint` → `already-exists`؛ اختبار مخصّص |
| نتيجة كل طلب ثابتة ومميزة حسب `orderId` | PASS | مجموعة فرعية `results/{orderId}` (لا تكرار)؛ اختبار «exactly one durable result» |
| عرض معرف العملية وحالتها بعد إعادة الفتح | PASS | `getBulkOperation` يعيد `operationId/status/results`؛ العميل يعرض المعرّفات |
| الاستعلام قبل الاكتمال وبعده | PASS | `getBulkOperation` يقرأ `results/{orderId}` أثناء/بعد التنفيذ |
| لا إعادة `setorder` لطلب وصل/ربما وصل | PASS | لم يُمس `dispatchOrder`؛ الاسترجاع قراءة فقط؛ اختبارات Click سليمة |
| المهلة أثناء شحنة غير محسومة → `needs_review` | PASS | سلوك `dispatchOrder` كما هو؛ لاافتراض فشل |
| منع نجاح وهمي عند فشل حفظ النتائج | PASS | حفظ `results/{orderId}` إلزامي قبل الملخّص (بلا try/catch كاتم) |
| حدّ زمني/تنفيذي واقعي | PASS | `MAX_DISPATCH=10` لكل نداء + تجزئة العميل |
| Pagination حقيقية للبحث | PASS | Cursor لكل استعلام فرعي + حدّ عام `(createdAt,id)` مدفوع داخل الاستعلام |
| دمج عدة استعلامات بلا تكرار | PASS | حدّ عام يمنع تكرار المستند بين الصفحات |
| عدم إعادة فحص أول 200 عنصر | PASS | `where('createdAt','<',g)` لكل استعلام فرعي |
| ربط المؤشر بالبحث والفلاتر | PASS | المؤشر يُبنى داخل `searchOrders` من نفس الاستعلام؛ لا يعاد استخدامه مع شروط مختلفة |
| عدم إعلان انتهاء قبل نهاية المصادر | PASS | `hasMore` = صفحة كاملة؛ آخر نداء يعيد `nextCursor:null` |
| 300 نتيجة عبر صفحات بلا فقد/تكرار | PASS | اختبار «search returns all 300 matches» |
| حد `listOrders` 2000 لا يتحول لنهاية وهمية | PASS | `capReached` يبقي `nextAfterId`؛ اختبار «2001 + مطابق» |
| توحيد حدود التحديد/الطباعة (200 لا 500) | PASS | النص والحد 200؛ الطباعة تُجزّأ بحد 100 لكل ملف |
| طباعة 150/200 بلا إسقاط صامت | PASS | تأكيد صريح + ملفات متعددة مسمّاة |
| منع تسرّب المبالغ المحجوبة | PASS | `getOrdersByIds` يستخدم `orderForUser` (يخفي المبالغ) |
| صلاحيات `getBulkOperation` | PASS | المنشئ فقط؛ `sendToDelivery` ليست إذناً عاماً |
| منع إرسال Click مكرر | PASS | القفل و`needs_review` دون تغيير؛ 209 اختبار emulator |
| الاختبارات الأمنية الجديدة | PASS | 6 اختبارات مخصّصة |
| عدم التراجع (المرحلتان 1 و2) | PASS | 462 Flutter + 203→209 emulator + 21 Playwright |

---

## 2. Root Cause والإصلاح (الملفات والأسطر)

### 1. موثوقية الإرسال الجماعي — `functions/src/bulk.js`
- **السبب الجذري:** `operationId` كان اختيارياً؛ الخادم يولّده بعد الرد؛ إعادة الاستخدام تدمج النتائج؛ فشل حفظ النتيجة كان مكتوماً.
- **الإصلاح:**
  - `operationId` مطلوب ومُتحقَّق (سطر التحقق من النمط).
  - معاملة `create-or-validate`: `{actorId, ids, fingerprint, status}` + رفض الاستيلاء/التعارض.
  - نتائج كل طلب في `bulkOperations/{opId}/results/{orderId}` (كتابة دائمة إلزامية).
  - تخطي الطلبات ذات النتيجة مسبقاً (استئناف آمن).
  - `getBulkOperation`: المنشئ فقط + قراءة النتائج.

### 2. Pagination البحث — `functions/src/index.js` (`searchOrders`)
- **السبب الجذري:** `limit(200)` + ترتيب في الذاكرة + مؤشر على المجموعة المحمّلة فقط.
- **الإصلاح:** كل استعلام فرعي يُرتّب `(createdAt, id)` مع حدّ عام `where('createdAt','<',g)` مدفوع للاستعلام؛ المؤشر `{__g}` يضمن لا فقد ولا تكرار. (14 فهرس جديد.)

### 3. حد `listOrders` 2000 — `functions/src/index.js`
- **السبب الجذري:** عند بلوغ `MAX_SCAN` كان `nextAfterId` يصبح `null`.
- **الإصلاح:** `capReached` يبقي المؤشر؛ الحالة تُعلَن عبر `limited`.

### 4. حدود التحديد/الطباعة — `lib/live/live_orders.dart`, `lib/printing/bulk_printing.dart`
- **السبب الجذري:** نص «حتى 500» مع حد فعلي 200؛ الطباعة من الصفحة المحمّلة فقط؛ بلا تأكيد للتجزئة.
- **الإصلاح:** توحيد 200 + تأكيد + تجزئة 100 ملف مع `getOrdersByIds`.

---

## 3. الاختبارات الجديدة

| الاختبار | الملف |
|---|---|
| `operationId` مطلوب | `phase2_search_bulk.test.js` |
| إعادة الاستخدام بنفس الطلبات لا تعيد الإرسال | ✔ |
| إعادة الاستخدام بطلبات مختلفة مرفوضة | ✔ |
| لا يمكن لمستخدم آخر الاستيلاء أو القراءة | ✔ |
| `getBulkOperation` يعيد النتائج للمنشئ | ✔ |
| 300 نتيجة عبر صفحات بلا فقد/تكرار | ✔ |
| `listOrders` يستكمل بعد 2001 غير مطابق | ✔ |
| تمرير `operationId` من الواجهة | `test/phase2_orders_bulk_test.dart` |

### الحزم
| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **462** |
| functions unit | **194** |
| functions emulator + rules | **209** |
| Playwright E2E | **21/21** |
| CI `40629519011` | 4/4 |

---

## 4. النشر وإثبات عدم تراجع Click

- **Functions**: منشورة (56؛ `bulkDispatch` المحدّث، `getBulkOperation`، `getOrdersByIds`).
- **Indexes**: 138 منشورة.
- **Hosting**: منشور (bundle نظيف).
- **APK**: `delivery/apk/Velnix-release.apk` موقّع `CN=Velnix` (SHA-256 `4f62319a…`).
- **Click**: لم يُعد بناء `dispatchOrder`/`applyCompanyAssignment`/القفل/`recoverStuckDispatch`؛ 209 اختبار emulator تشمل القفل و`needs_review` ومنع التكرار — كلها خضراء.

## 5. Backfill الإنتاجي (مُراجَع مسبقاً)
8/8 طلب مُعبّأ؛ إعادة التشغيل 0؛ 0 تغيير على الحقول المحمية (customer/amount/status/owner/number). لا تُشارك بيانات عملاء.

## 6. قيود غير مثبتة
- **Android على جهاز حقيقي: BLOCKED** — كاميرا/مسح الباركود لم تُختبر فعلياً.
- **إرسال Click جماعي حقيقي**: Mock/Emulator فقط.
