# VELNIX — إغلاق آخر نقاط مراجعة المرحلة الثانية

- الفرع: `main`
- Commit المراجَع: `cd92ea2`
- Commit الإغلاق: `234d975`
- CI: `40651622120` — **4/4 خضراء**
- المشروع: `velnix-6c1a2` · https://velnix-6c1a2.web.app

> ثلاثة نقاط فقط. لم يُعد بناء الأمن/الصفحات/الفلاتر/الماسح/الطباعة. لم تُبدأ المرحلة الثالثة، ولم يتغيّر تبويب «المتاجر»، ولا إدخال صوتي.

---

## 1. Root Cause والإصلاح

### النقطة 1 — Cursor البحث عند تطابق `createdAt`
- **السبب الجذري:** كان الحد يُدفع كـ`where('createdAt','<',cursorTime)`، والترتيب الفعلي `(createdAt, documentId)`. فكل سجل يشارك نفس `createdAt` وكان `id` بعد مؤشر الصفحة يُسقط صامتًا.
- **الإصلاح (`functions/src/index.js`):** استُبدل الحد الزمني بـ**Cursor مركّب حقيقي** `startAfter(Timestamp, documentId)` يُطبّق على **كل استعلام فرعي** بالترتيب نفسه `(createdAt, id)` (ASC/DESC حسب `sort`). يُدمج المصدر ثم يُطبّق حدّ عام `(createdAt,id)` لإزالة أي تكرار بين المصادر دون إسقاط التوائم الزمنية. المؤشر مُربوط بـ`(query, filters, sort, pageSize, direction)` عبر `fingerprintSearch`، ويُرفض إن تغيّر أي منها.

### النقطة 2 — استرجاع العمليات + حماية التزامن
- **السبب الجذري:** `bulkDispatch` كانت تقرأ النتيجة ثم تُرسل (سباق read-then-write)، ولا واجهة لعرض العمليات بعد إعادة التشغيل، وكتابة النتيجة قد تستبدل نجاحًا مؤكدًا بفشل عابر.
- **الإصلاح (`functions/src/bulk.js`):**
  - **حجز ذرّي** لكل طلب داخل معاملة `bulkOperations/{opId}/results/{orderId}` قبل أي إرسال؛ الخاسر يقرأ نتيجة الفائز ويتخطاه → لا إرسال مزدوج.
  - **كتابة مونوتونية** داخل معاملة: لا تُستبدل نتيجة `ok:true` بفشل عابر.
  - **`listBulkOperations`** (للمنشئ فقط) + **`BulkOperationsScreen`** لعرض الحالة ونتائج كل طلب بعد الانقطاع/إعادة الفتح دون أي إرسال جديد.
  - يميّز الواجهة بين «نجح» و«غير مؤكد (لا تُعد الإرسال)» و«لم يُرسل».
- **الإصلاح (`lib/live/gateway.dart`, `live_orders.dart`, `live_bulk_ops.dart`):** `bulkOperations()` + شاشة سجل العمليات + زر «سجل عمليات الإرسال».

### النقطة 3 — مهلة إرسال الدفعات
- **السبب الجذري:** `MAX_DISPATCH=10` وحده لا يضمن الانتهاء خلال 60 ثانية.
- **الإصلاح (`functions/src/bulk.js`):** **موعد نهائي حقيقي** `DISPATCH_DEADLINE_MS=45000`: الحلقة تتوقف عن بدء أي إرسال جديد عند تجاوز الموعد، وتُعلن العملية `status:'partial'` مع `remaining`. الاستئناف يعالج **فقط** الطلبات التي لم تبدأ (ذات نتيجة دائمة موجودة تُقرأ؛ `setorder` لا يُعاد تلقائيًا).

---

## 2. الأدلة — الاختبارات الجديدة

| الدليل المطلوب | الاختبار | النتيجة |
|---|---|---|
| 300 طلب بنفس `createdAt` بالضبط، تنازلي | `300 orders sharing the exact same createdAt … desc & asc` | PASS (300 مرة واحدة) |
| نفس الحالة تصاعدي | ✔ (نفس الاختبار) | PASS |
| رفض إعادة استخدام Cursor مع ترتيب/فلاتر مختلفة | `search cursor is rejected when the filters or sort change` | PASS |
| استدعاءان متزامنان → إرسال واحد | `two concurrent bulkDispatch calls send an order only once` | PASS (نتيجة دائمة واحدة) |
| استرجاع العملية بعد إعادة التشغيل | `listBulkOperations returns the caller own operations` | PASS |
| حالة جزئية + استئناف | `bulkDispatch reports partial status … can resume` | PASS |
| تمرير `operationId` من الواجهة | `test/phase2_orders_bulk_test.dart` | PASS |
| شاشة سجل العمليات | `the bulk operations screen recovers operation status` | PASS |

### الحزم
| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **463** |
| functions unit | **194** |
| functions emulator + rules | **214** |
| Playwright E2E | **21/21** |
| CI `40651622120` | 4/4 |

---

## 3. النشر
- **Functions**: منشورة (55؛ `listBulkOperations` جديدة، `bulkDispatch` المحدّث).
- **Indexes**: 139 منشورة (`bulkOperations actorId+startedAt`).
- **Hosting**: منشور (bundle نظيف بلا علامات emulator).
- **APK**: `delivery/apk/Velnix-release.apk` موقّع `CN=Velnix` (SHA-256 `8766bcd0…`).
- **Click**: لم يُعد بناء `dispatchOrder`/القفل/`needs_review`؛ 214 اختبار emulator خضراء.
- الدوال الجديدة تُرجع 401 بلا مصادقة (منشورة + App Check).

## 4. قيود لم تُختبر
- **Android على جهاز حقيقي: BLOCKED** — كاميرا/مسح الباركود لم تُختبر فعليًا.
- **إرسال Click جماعي حقيقي**: Mock/Emulator فقط؛ لم تُرسَل شحنات حقيقية.
