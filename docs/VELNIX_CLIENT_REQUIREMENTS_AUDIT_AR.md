# Velnix — تدقيق متطلبات العميل الستة مقابل المصدر والواجهة وFirebase والـAPK

- **المشروع:** `Mode2094/velnix` · **Firebase:** `velnix-6c1a2`
- **الإصدار:** `0.7.0+12` (versionCode 12 · versionName 0.7.0) · **applicationId:** `com.mode2094.velnix`
- **التاريخ:** 2026-11-22 · **الفرع:** `main`
- **القاعدة:** لا يُقبل وجود الكود ولا نجاح CI دليلاً على عمل الميزة؛ كل بند أدناه له (ملف+سطر) و(اختبار يثبت السلوك) و(دليل من التشغيل الفعلي).

---

## 0) الخلاصة التنفيذية

| # | مجموعة المتطلب | الحالة | الدليل البرمجي (ملف:سطر) | الاختبار المُثبِت | الإصلاح المُطبَّق |
|---|---|---|---|---|---|
| 1 | إرسال الطلب لشركة التوصيل من كل الحالات الداخلية الست (فردي وجماعي) | **FAIL ثم أُصلح → PASS** | `functions/src/index.js:951,1036-1041` · `lib/live/live_orders.dart:2585-2625,3450-3480` · `lib/live/live_barcode.dart:414` · `functions/src/order_view.js:26,31` · `functions/src/bulk.js:181` | `test/order_details_usability_test.dart` («طلب جديد يوفّر إرسالًا فرديًا») · `functions/test/emulator/dispatch_any_status.test.js` | **أُضيف إرسال فردي من أي حالة** على بطاقة الطلب، وصُحّح نص ماسح الباركود الذي كان يقول «الطلبات الجاهزة فقط» |
| 2 | دلالات القوائم والعدّادات (`جميع طلبات المتجر` = داخلية + توصيل) | **PASS** | `functions/src/query.js:19-30,131-132` · `functions/src/index.js:485-508` · `lib/live/live_dashboard.dart:237-258` | `functions/test/emulator/counters_100_20.test.js` (جديد: 100=80+20) · `functions/test/aggregations.test.js` · `test/order_filters_phase3_test.dart` | أُضيف اختبار انحدار 100/20 |
| 3 | تغيير الحالة مع خيار طباعة اختياري (افتراضيًا غير مفعّل) | **PASS** | `lib/live/live_orders.dart:846-874,1491-1600` · `lib/models/entities.dart:113-124` · `functions/src/policy.js:140-176` | `test/phase2_orders_bulk_test.dart` · `functions/test/emulator/bulk_internal_status.test.js` | لا خلل — السلوك مطابق |
| 4 | تصميم البوليصة: باركود فوق رقم الطلب بلا نص، بلا QR، اسم/شعار الصفحة، صفحة واحدة لكل طلب | **PASS** | `lib/printing/order_printing.dart:12,28,308-335,337-400,427-432` | `test/printing/order_printing_test.dart` · `order_printing_phase3_test.dart` · `scripts/verify_barcodes.py` (فك رموز حقيقي) | لا خلل — السلوك مطابق |
| 5 | إثبات عمل الـAPK الموقّع على جهاز فعلي/محاكي | **PASS** | — (تحقق تشغيلي) | تثبيت ترقية 7→12 على Android 14 + `apksigner verify` + لقطة الواجهة | بُني إصدار موقّع جديد `0.7.0+12` |
| 6 | فحص الموقع (Hosting) والـBackend | **FAIL ثم أُصلح** | `firebase.hosting.json:2-3` · `functions/src/index.js:484` | `firebasehosting.googleapis.com` releases API · `curl` بصمة `main.dart.js` | **نُشر بناء الموقع الحالي** (كان قديماً بتاريخ 2026-11-02) |

---

## 1) السبب الجذري الأرجح لشكوى العميل

- **الموقع الحيّ كان يقدّم بناءً قديماً.** سجل إصدارات Hosting أظهر أن آخر نشرٍ كان بتاريخ **2026-11-02T16:12:02Z**، بينما كل إصلاحات المتطلبات هذه تعود إلى commits بتاريخ **2026-11-07/08**. أي أن النسخة المعروضة على `https://velnix-6c1a2.web.app` كانت **تسبق** هذه الميزات (إرسال من أي حالة، البوليصة الجديدة، «طباعة بعد تغيير الحالة»، عدّادات القبول).
- **الدليل:** `GET v1beta1/sites/velnix-6c1a2/releases` ⇒ النشر الأحدث كان `2026-11-02T16:12:02Z`. بينما: `feat(dispatch)` = `898f1b4` 2026-11-08، `feat(print)` = `cc52a5a` 2026-11-08، `feat(orders)` = `9c3157d` 2026-11-07.
- **الإصلاح:** نُشر البناء الحالي. الإصدار الجديد: `2026-11-22T20:02:30Z` / `versions/359203553d62ec95`. بصمة `main.dart.js` الحيّة أصبحت مطابقة للبناء المحلي: `82d01bd6b3cd22f04013f85917062e7413914b812e1301347fa61fefe6df63e6`.
- **ملاحظة تشغيلية للعميل:** إن كان لديه APK قديم مثبّت (versionCode ≤ 8) فإن إصلاح App Check للأندرويد مطلوب أيضاً؛ أحدث إصدار موقّع هو `0.7.0+12`.

---

## 2) تفصيل البنود وأدلّتها

### المتطلب 1 — الإرسال لشركة التوصيل من كل الحالات الداخلية الست

- **الحالات الست:** `created, review, preparing, ready, delivered, cancelled` — `functions/src/policy.js:140` (`INTERNAL_CORRECTION_STATUSES`) و`lib/models/entities.dart:113-124` (نفس الترتيب، مُقيَّد باختبار `internal_status_contract.test.js`).
- **لا يوجد شرط «جاهز فقط»:** `functions/src/index.js:1036` يقبل الإرسال من أي حالة داخلية (`INTERNAL_CORRECTION_STATUSES`) وكذلك الحالات القديمة (`dispatched`,`inTransit`). التعليق صريح: «Dispatch is allowed from ANY internal status … It is not limited to ready».
- **شرط الإسناد فقط:** `functions/src/index.js:1038` يطلب وجود `companyId` («عيّن شركة توصيل قبل الإرسال»).
- **منع الإرسال المكرر:** `functions/src/index.js:1039-1041` يرفض `needs_review` و`sent` («الطلب أُرسل بالفعل») و`sending`. القفل `dispatchLockId` + `deliveryAccepted` يمنع الشحنة المكررة.
- **الصلاحية:** `requiredPerm(user,'sendToDelivery')` داخل التدفق المشترك (`functions/src/index.js:954`) فيسري على الفردي والجماعي.
- **الجماعي بنفس الحماية:** `functions/src/bulk.js:181-190` (`bulkDispatch`) يستدعي نفس التدفق مع `requiredPerm('sendToDelivery')` و`operationId` ثابت لعدم التكرار.
- **الواجهة:** الزر يتبع علم الخادم `actions.dispatch` (`functions/src/order_view.js:26,31`).
- **إصلاح مثبَت (فرديًا):** كانت الواجهة الفردية تُظهر الإرسال فقط داخل «الرحلة» عند حالة «جاهز»، بينما المتطلب ينص صراحة على «فرديًا وجماعيًا» و«لا يُشترط نقل الطلب إلى جاهز». أُضيف زر **«إرسال إلى شركة التوصيل»** إلى بطاقة الطلب (`lib/live/live_orders.dart`) يظهر كلّما كان `actions.dispatch == true` — من أي حالة داخلية (جديد/مراجعة/تجهيز/جاهز/مكتمل/ملغي) — مع نافذة تأكيد، ويستدعي `VelnixGateway.dispatch` نفسه (لا تغيير للحالة الداخلية، منع تكرار، معالجة النتيجة غير المؤكدة).
- **إصلاح نصّي مثبَت:** نص تأكيد الإرسال الجماعي في ماسح الباركود كان يقول «للطلبات الجاهزة فقط» (`lib/live/live_barcode.dart:414`) رغم أن الخادم يرسل من أي حالة؛ صُحّح ليطابق المتطلب والقائمة الجماعية للطلبات.
- **الاختبارات:** `test/order_details_usability_test.dart` (جديد: طلب جديد بحالة «جديد» مع شركة مُعيّنة يعرض زر الإرسال الفردي بلا شرط «جاهز»)، `dispatch_any_status.test.js` (إرسال من كل حالة دون تغيير الحالة الداخلية)، `dispatch_contract.test.js`، `click_concurrent_dispatch.test.js` (تزامن)، `bulk_internal_status.test.js`.

### المتطلب 2 — دلالات القوائم والعدّادات

- **قاعدة التصنيف الموحّدة:** `functions/src/query.js:19-30` (`deliveryAccepted` هو الدليل الدائم الوحيد) و`131-132` (تقسيم الفلتر `delivery`/`internal`).
- **العدّادات:** `functions/src/index.js:497-508` — `all` لكل حالة (لا يُقسَّم)، و`delivery` = نفس الحالة + `deliveryAccepted == true`، و`internal = all − accepted`، لذا **دائمًا** `all = internal + delivery` بلا ازدواج.
- **بطاقات الواجهة:** `lib/live/live_dashboard.dart:244-258` ⇒ «جميع طلبات المتجر» (all) + «الطلبات الداخلية» + «طلبات شركة التوصيل».
- **اختبار الانحدار الجديد:** `functions/test/emulator/counters_100_20.test.js` — يسجّل 100 طلب، يؤكّد قبول 20 فقط، ثم يتحقق: `all=100`، `internal=80`، `delivery=20`، و`all = delivery + internal`، وأن الإرسال المؤكد ينقل طلبًا واحدًا فقط من الداخلية للتوصيل دون تغيير الإجمالي، وأن `clickOrderRef`/الإسناد وحده لا يُعَدّ قبولًا.
- **النتيجة:** 3/3 ناجحة.
- **ملاحظة على كتلة `shipping`:**
  تُعرض حالات التوصيل كوجهة إضافية مستقلة **لا تُضاف** إلى `all` (منع الازدواج) — `functions/src/index.js:509-513`.

### المتطلب 3 — تغيير الحالة مع خيار الطباعة

- **القائمة من كل الحالات:** `lib/live/live_orders.dart:852` يمرّر `internalChangeableStatuses` (الست) — بما فيها الرجوع وإعادة فتح الملغي.
- **الخادم يسمح من أي حالة (عدا إرسال معلّق):** `functions/src/policy.js:140-176` (`internalStatusChangeReason`) — يمنع فقط `sending`/`needs_review`، ويسمح بتعديل حالة طلب أُرسل ومؤكّد (`dispatchState='sent'`).
- **خيار الطباعة افتراضيًا غير مفعّل:** `lib/live/live_orders.dart:1563-1575` (CheckboxListTile بقيمة ابتدائية `false`، العنوان «طباعة الطلبات بعد تغيير الحالة»).
- **الطباعة بعد التغيير وبالمؤكَّد فقط:** `lib/live/live_orders.dart:862-873` — تُطبع فقط الطلبات التي أعاد الخادم `ok:true`، وكلٌّ ببوليصة منفصلة، وفشل الطباعة لا يعكس التغيير.
- **منع الإرسال المزدوج للنموذج:** `lib/live/live_orders.dart:1586-1595` (زر التأكيد معطّل حتى اختيار الحالة وأثناء الإرسال).
- **الاختبارات:** `test/phase2_orders_bulk_test.dart` (مربّع الاختيار + السلوك)، `functions/test/emulator/bulk_internal_status.test.js`.

### المتطلب 4 — تصميم البوليصة

- **باركود فوق رقم الطلب وبلا نص تحته:** `lib/printing/order_printing.dart:392-400` (الرمز ثم رقم الطلب أسفله)، و`326-332` (`drawText: false`).
- **بلا QR:** لا يوجد أي عنصر QR في البوليصة؛ الباركود واحد فقط (`order_printing.dart:308-335`، والتعليق صريح «No QR»).
- **هوية الصفحة لا Velnix/المتجر:** `lib/printing/order_printing.dart:353-372` (شعار الصفحة + اسمها كمصدر هوية؛ والبديل عند غياب الصفحة «بوليصة شحن» لا Velnix).
- **صفحة واحدة لكل طلب:** `order_printing.dart:427-432` (`pw.Page` وليس `MultiPage`) — فلا تتأثر مقاسات الباركود بطول المحتوى.
- **إثبات الفك الحقيقي:** `scripts/verify_barcodes.py` فكّ 17 ملف PDF × 3 دقّات (203/300/600 DPI) = **51/51 PASS** (`barcode=ok`, `1 pages`).
- **الاختبارات:** `test/printing/order_printing_test.dart`، `test/printing/order_printing_phase3_test.dart`.

### المتطلب 5 — إثبات الـAPK

- **الإصدار `0.7.0+12`** (versionCode 12، versionName 0.7.0، applicationId `com.mode2094.velnix`):
  - `apksigner verify -v` ⇒ **Verifies** (APK Signature Scheme v2)، الموقّع `CN=Velnix, OU=Delivery, O=Velnix, L=Amman, C=JO`، بصمة الشهادة `6e57f935…601` (نفس مفتاح الإصدار، بلا إعادة توقيع).
  - التثبيت على محاكي **Android 14** كترقية فوق `versionCode 11` ⇒ **Success**، وتُقرأ الحزمة `versionCode=12` مع بقاء `firstInstallTime` من نسخة 11 (`dataDir` محفوظ، لا فقدان بيانات).
  - التشغيل: `MainActivity` في المقدّمة، والعملية حيّة (`pid` موجود)، والواجهة تُرسم فعليًا (`build/qa/android-evidence/10_release12_launch.png`).
  - **إثبات أن الإصلاح داخل الـAPK المُسلَّم نفسه:** باستخراج `lib/arm64-v8a/libapp.so` من APK الإصدار والبحث في نصوصه (UTF-16LE) ⇒ وُجد النص الجديد `إرسال إلى شركة التوصيل`، و**لم** يُوجد النص المُزال `للطلبات الجاهزة فقط`. هذا يثبت أن الإصلاح الذي يراه العميل هو داخل الملف المُنزَّل، لا في المصدر فقط.
  - **جولة لقطات واجهة الإصدار الموقّع (عن طريق محاكي، مع App Check debug):** تسجيل الدخول، الداشبورد بالعدّادات الثلاثة، قائمة الطلبات، تفاصيل طلب داخلية، نافذة تغيير الحالة الجماعي (القائمة السداسية + مربّع طباعة غير مفعّل)، معاينة البوليصة (`build/qa/android-evidence/10..22_*.png`).
  - **ملاحظة شفافية (App Check):** نسخة الإنتاج تستخدم reCAPTCHA Enterprise لـApp Check، وهي لا تُصدر attestation على المحاكي (`403 App attestation failed`). لذلك استُخدم لالتقاط واجهة المحاكي بناء `--profile` بمزوّد App Check التشخيصي، وهو **قيد على المحاكي فقط**. الإصدار المُسلَّم يبقى على مسار الإنتاج؛ الدليل على أنه يبدأ ويثبّت ويوقّع صحيحًا مأخوذ من الإصدار الموقّع نفسه.
- **بصمات الملفات (بعد الإصلاح):** APK `3d1a2a1de6bfe2794d670cb8a3a06003393984a14aeaa57b3f743c82a86f6750` (81,050,068 بايت) · AAB `3e12281b6ec23ac45ad230e845cefac2e55389664b9031caec9e6121329a0768` (73,685,466 بايت).

### المتطلب 6 — الموقع والـBackend

- **الـBackend:** الوظائف منشورة (56 دالة)، ودالة `dashboardStats` تعمل على بيانات حقيقية (كان خطأ 500 بسبب فهارس تجميع ناقصة، أُصلح بـ44 فهرسًا مركّبًا منشورة).
- **الموقع:** أُعيد نشر البناء الحالي — راجع القسم 1.

---

## 3) أدلة تشغيلية (أوامر ونواتج)

| الفحص | النتيجة |
|---|---|
| `dart format --set-exit-if-changed lib test` | 0 ملفات متغيّرة |
| `flutter analyze` | No issues found |
| `flutter test` | **497 ناجح / 25 فروقات ذهبية** (المجموع 522). الفروقات الـ25 **كلها** في 4 ملفات Golden بصرية، مصدرها اختلاف تنقيط الخطوط macOS≠Linux؛ الاختبارات المنطقية/الواجهية **466/466 ناجحة**، وCI (Linux) يمرّ بها بلا فروق |
| `functions: npm test` | **211/211** |
| `functions: npm run test:emulator` | **307/307** (يشمل اختبار 100/20 الجديد) |
| `scripts/check_secrets.py` | 0 findings (672 ملفًا) |
| `scripts/test_runtime_config.py` / `test_firebase_setup.py` | OK |
| `scripts/verify_barcodes.py` | **51/51 PASS** |
| Hosting releases API | أحدث نشر قبل الإصلاح: `2026-11-02T16:12:02Z` ← بعد الإصلاح: `2026-11-22T20:02:30Z` |

---

## 4) قيود مثبَتة (لا تُدَّعى كنجاح)

1. **شحنة Click حقيقية:** لم تُجرَّب شحنة فعلية (لا يُسمح بإرسال شحنات حقيقية في هذه الجولة). دورة الإرسال مُغطّاة باختبارات emulator بعقد محلي فقط.
2. **طباعة ورقية فعلية:** فُكّت الرموز برمجيًا من ملفات PDF بمقاسات الورق؛ لم تُطبع على طابعة ورقية حقيقية.
3. **قبول بصري للبوليصة:** التصميم مُثبَت برمجيًا؛ القبول البصري النهائي بأسلوب العميل يبقى بندًا مفتوحًا.
4. **جهاز Android حقيقي:** الاستخدام على جهاز حقيقي (لا محاكي) لم يُنفَّذ.
5. **فروقات Golden البصرية:** 25 اختبارًا ذهبيًا يفشل محليًا على macOS بسبب اختلاف رسم النص/الأيقونات عن Linux؛ ناجحة في CI على Linux.
6. **حساب المدير المؤقت للتجربة:** `web.admin@velnix.test` (دور generalManager) أُنشئ لاختبار الويب الحيّ؛ يجب حذفه/استبداله بعد التسليم.
