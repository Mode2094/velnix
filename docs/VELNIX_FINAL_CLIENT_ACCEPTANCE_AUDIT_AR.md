# VELNIX — تدقيق القبول النهائي للعميل (بوابة الإغلاق)

**المشروع:** `velnix-6c1a2` · https://velnix-6c1a2.web.app
**الفرع:** `main` · **Commit الكود المدقق:** `61c3967`
**CI:** https://github.com/Mode2094/velnix/actions/runs/40734399317 — ✅ نجح (flutter / firebase / android / emulator-ui)
**تاريخ التنفيذ:** 28 أكتوبر 2026
**بيانات الاختبار:** اصطناعية بالكامل — لا بيانات عملاء ولا شحنات Click حقيقية.

---

## 0. ملخص النتيجة

| المحور | النتيجة |
|---|---|
| إصلاحات البوابة (13 بنداً) | ✅ منفذة ومختبرة، ما عدا بنود العتاد/Click الخارجية |
| Flutter (Linux) | ✅ **487/487** |
| Functions unit | ✅ **195/195** |
| Functions emulator + rules | ✅ **241/241** |
| Emulator UI (Playwright، 5 أدوار) | ✅ **21/21** في CI |
| Demo browser smoke | ✅ 30 شاشة، 0 أخطاء صفحة |
| Code128 + QR | ✅ **45/45** على 203/300/600 DPI |
| النشر | ✅ Functions + Hosting، وبصمة الويب مطابقة للبناء |
| APK | ✅ `delivery/apk/Velnix-release.apk` — SHA-256 `307879499fc91ffb…388be8` |

الأدلة المنظمة في `docs/evidence/final-audit/`، وهذا الملف يربط كل بند بدليله.

---

## 1. إصلاحات البوابة

### 1) مصفوفة رتب خادمية كاملة لكلمات المرور — ✅ PASS

**الملفات:** `functions/src/policy.js` (`ROLE_RANK`, `canAdministerMember`)، `functions/src/index.js` (`resetEmployeePassword`)، `lib/live/gateway.dart` (`canGrantRole`).

- رتب صريحة: `generalManager 50 > manager 40 > sales 30 > warehouse 20 > dataEntry 10`.
- غير المدير العام: `manageEmployees` + هدف تشغيلي فقط + **رتبة أدنى بصرامة**؛ لا ذات، لا ند، لا أعلى.
- `sales`/`warehouse` يتطلبان `viewAllOrders` (أو منفّذ مستودع)، و`warehouse` إضافةً إلى `updateOrderStatus`.
- **`dataEntry` مع `manageEmployees` لا يستطيع إعادة تعيين `sales` ولا حتى `dataEntry` آخر.**
- الخادم والواجهة يستخدمان نفس القاعدة؛ لا يوجد تجاوز من الواجهة.
- تم التحقق من كل الخلايا الممكنة (5 أدوار منفّذة × 5 أهداف) في اختبار الوحدة، وسيناريوهات emulator حقيقية.

**الاختبارات:** `functions/test/policy.test.js` (مصفوفة كاملة)، `functions/test/emulator/phase3_password.test.js` (6 اختبارات: GM، منع الذات، الرتب، Google-only، الصلاحية).
**الدليل:** `docs/evidence/final-audit/functions-unit.log`, `functions-emulator.log`.

### 2) Pagination البحث بعد نافذة المرشحين الأولى — ✅ PASS

**الملف:** `functions/src/index.js` (`searchOrders`).

الخلل المؤكد: عندما تكون الصفحة **أقصر من pageSize** وكانت إحدى الاستعلامات الفرعية ما تزال تملك مرشحين، كان `nextCursor` يصبح `null` فنُعلن النهاية قبل استنفاد المصادر. كذلك كان المؤشر عند صفحة فارغة يستخدم آخر نتيجة **مطابقة** (لا وجود لها) فيعيد نفس النافذة.

الإصلاح:
- `hasMore = anySubHasMore || filtered.length > pageSize` (لا شرط امتلاء الصفحة).
- عند صفحة قصيرة/فارغة، المؤشر يتقدم إلى **آخر مرشح فُحص فعلياً** في النافذة، لا آخر نتيجة مطابقة.
- إبقاء `limited` صادقاً عندما تكون إحدى الاستعلامات الفرعية ممتلئة.

**الاختبار:** `functions/test/emulator/phase3_search_window.test.js` — 130 نتيجة شائعة في محافظة أخرى + 7 مطابقات أقدم خارج النافذة الأولى، مع `pageSize=3`؛ يثبت أن الصفحة الأولى القصيرة تُرجع مؤشراً، وأن كل المطابقات السبع تُجمع بلا تكرار ثم تنتهي فعلاً.

### 3) سياسة `viewAmounts` واستثناء منشئ الطلب — ✅ PASS (قرار موثق)

**القرار المعتمد (مطابق لمتطلبات العميل الحالية و`ROLE_PERMISSION_MATRIX`):**
- المبلغ يظهر لمن يملك `viewAmounts` أو المدير العام.
- **استثناء المنشئ:** صاحب الطلب يرى مبلغ طلبه الذي أدخله (كان موجوداً ومختبراً في `order_view.test.js`؛ لم يُغيّر بصمت).
- كل قائمة/تفاصيل/طباعة/باركود لا تتلقى مبلغ طلب شخص آخر بدون الصلاحية؛ لا تُعاد كميات مالية في الإجماليات.

**الاختبارات الجديدة:** `functions/test/emulator/phase3_amounts.test.js` — المدير بلا `viewAmounts` يرى طلبات الفريق لكن بلا مبالغ، ومبلغ طلبه هو فقط ظاهر؛ `getOrdersByIds` و`searchOrders` و`dashboardStats` تلتزم بالقاعدة.
**الطباعة:** لا تُطبع قيمة المبلغ إلا إذا وصلت في الحمولة (اختبار `order_printing_phase3_test` للطلب المخفي).

### 4) بطاقة «جميع طلبات المتجر» — ✅ PASS (مع ملاحظة بصرية للقبول)

**الملف:** `lib/live/live_dashboard.dart`.

- البطاقة الآن تستخدم **نطاق المرجع**: كل طلبات المتجر (توصيل + داخلية) وكل الحالات، وليس النطاق الداخلي فقط.
- النقر ينقل إلى «كل الطلبات» (`all`).
- تبويب **المتاجر** بقي منفصلاً و«قريبًا...» دون تغيير.

**ملاحظة قبول بصري:** توجد أيضاً بطاقة «كل الطلبات» التي تعرض نفس الإجمالي (لأن المرجع يسمّي الإجمالي «جميع طلبات المتجر»). لم أحذف بطاقة قديمة دون طلب صريح. إن أراد العميل بطاقة واحدة فقط للإجمالي، فهذا قرار واجهة يحتاج تأكيداً (بند مفتوح في §6).
**الدليل البصري:** `screenshots/dashboard_390.png`, `dashboard_1440.png` (goldens حية)، و`dashboard_demo_*.png` (وضع العرض).

### 5) التصحيح الإداري المصرح للحالات الداخلية — ✅ PASS

**الملفات:** `functions/src/policy.js` (`canCorrectInternalStatus`/`correctionTargets`)، `functions/src/index.js` (`correctOrderStatus`)، `functions/src/order_view.js` (`actions.corrections`)، `lib/live/live_orders.dart` (قائمة + نافذة سبب)، `lib/live/gateway.dart`.

- متاح **للمدير العام فقط**.
- سبب إلزامي (≥3 أحرف) يُسجّل في حدث الطلب `status_corrected` وسجل التدقيق `order.status_corrected` مع `from/to/reason`.
- انتقال مباشر بين الحالات الداخلية `created/review/preparing/ready/cancelled`، والإكمال الداخلي `delivered` فقط من `ready` وبلا شركة.
- **يرفض تماماً:** أي طلب عليه `dispatchState` نشط/مرسل/مراجعة، أو `hasDelivery`، أو `trackingNumber`، أو `clickOrderRef`، أو `providerOrderId`، أو `remoteStatus`، أو حالة `dispatched/inTransit/returned`.
- Revision guard يمنع الكتابة فوق تعديل متزامن.
- لا يُنشئ شحنة ولا يغيّر أي حقل Click.

**الاختبار:** `functions/test/emulator/phase3_correction.test.js` — 4 اختبارات (تدقيق كامل، منع غير GM/السبب، رفض طلبات Click/الإرسال، الإكمال الداخلي وإعادة الفتح لطلب داخلي).

### 6) هاتف Facebook وWhatsApp على البوليصة — ✅ PASS

**الملفات:** `functions/src/index.js` (لقطة `pagePhone/pageWhatsapp` عند الإنشاء وعند التعديل)، `functions/src/order_view.js` (DTO)، `lib/live/live_app.dart` (`decorateOrdersForPrint`)، `lib/printing/order_printing.dart`.

- يظهران في رأس البوليصة عند توفرهما فقط، بصيغة عربية آمنة.
- **سياسة الصفحة المؤرشفة:** لا استعلام حي عن صفحة مؤرشفة/معطلة. الطلب يحتفظ بلقطة الهاتف/واتساب المأخوذة وقت الإنشاء (سجل تاريخي)، والطلبات القديمة التي لا تملك لقطة لا يُخترع لها رقم.
- لا خلط بين صفحات المتجر: يُختار الاتصال بـ`pageId` الخاص بالطلب.

**الاختبارات:** `test/phase3_polish_test.dart` (active/archived/snapshot)، وظهور الأرقام في PDF مُثبت بـ`pdftotext` في `print/a4_*_contact.png` (0791111111 / 0792222222).

### 7) الفلاتر المستقلة الناقصة + شرائح الإزالة — ✅ PASS

**الملفات:** `functions/src/query.js`، `lib/live/order_filters.dart`.

أُضيف:
- **تاريخ الإرسال** (`sentFrom/sentTo`) على حقل `sentAt` الذي يُكتب عند الإرسال/الربط/الاستعادة.
- **الهاتف** (أرقام جزئية)، **الباركود/رقم الطلب**، **المنتج/المحتويات**، **الملاحظات** كشروط مستقلة قابلة للتركيب مع البحث والفلاتر الأخرى.
- حدود طول ورفض المدخلات غير الصالحة؛ لا استعلامات غير محدودة.
- **شريحة لكل شرط** مع زر حذف مستقل، و«مسح الكل» منفصل. الفلاتر المتقدمة قابلة للطي كي لا تدفن قائمة الطلبات.

**الاختبارات:** `functions/test/emulator/phase3_filters.test.js` (3)، `test/order_filters_phase3_test.dart` (إزالة شريحة واحدة تحفظ الباقي)، ولقطة `screenshots/filter_chips_760.png`.

### 8) توحيد العودة للرئيسية بعد إنشاء طلب — ✅ PASS

**الملفات:** `lib/live/live_app.dart`، `lib/live/live_orders.dart`.

- تبويب «طلب جديد»: يحفظ ثم `go(0)` (الرئيسية) مع إبطال الكاش.
- زر الإضافة من قائمة الطلبات: يحفظ، يحدّث القائمة، ثم `onCreated` → الرئيسية (نفس الوجهة).
- التعديل (ليس إنشاءً) يبقى في سياقه (رجوع/تحديث التفاصيل) عن قصد.
- رقم الطلب يظهر في رسالة نجاح النموذج قبل الانتقال.

### 9) البوليصات الطويلة جداً و`MultiPage/maxPages` — ✅ PASS

**الملف:** `lib/printing/order_printing.dart`.

- `maxPages: 1` كان مضللاً (لا يحدّ الصفحات فعلياً). استُبدل بحارس `50` مع تعليق صريح.
- النصوص الحرة الطويلة تُقسَّم إلى مقاطع bounded (~220 حرفاً) كعناصر مستقلة، فيستطيع `MultiPage` ترحيلها بدل قصّ فقرة واحدة.
- الباركود وQR عنصران كاملان لا يُشطران.
- عيّنة A6 بوصف وملاحظات 80 تكراراً لكل منهما: **6 صفحات**، بلا استثناء، وكل الأكواد تُفك. لا يوجد مسار قصّ صامت.

**الدليل:** `build/qa/pdf/a6_long.pdf` (يُعاد توليده بالاختبار)، `print/a6_long.png`، ونتائج `a6_long` في `barcode-decode-results.json` (PASS على 3 كثافات).

### 10) القوالب البيضاء والملونة — ✅ PASS (مع ملاحظة قبول)

**الملف:** `lib/printing/order_printing.dart` — `OrderTemplate.professional` (ملونة) + `OrderTemplate.plain` (بيضاء) + `thermal`.

- نفس ترتيب البيانات في القالبين: الشعارات ← هوية الصفحة والاتصال ← رقم الطلب/النوع ← المستلم ← المحتويات/المالي ← الرموز ← التذييل، وهوامش 12مم على A4.
- الملونة: شريط رأس فاتح + لون العلامة. البيضاء: خلفية بيضاء ونص أسود/رمادي.
- القالب الحراري يبقى للبكرات 58/80مم.
- **ملاحظة:** الشعارات تبقى ملوّنة في القالب الأبيض (لم تُحوّل إلى رمادي). إن طلب العميل أبيض/أسود بالكامل للشعارات فهذا تعديل بصري إضافي.

**الأدلة:** `print/a4_colored_contact.png`، `print/a4_white_contact.png`، `print/thermal80.png`، واختبارات `order_printing_phase3_test.dart`.

### 11) التحديد المتعدد والماسح ونتائج الباركود — ✅ PASS (فروق قبول محددة)

**الأدلة الحية:** `screenshots/orders_multi_select_900.png` (شريط التحديد: عدد، تحديد الظاهر/عكس/إلغاء، طباعة/تغيير حالة/إسناد/إرسال/سجل)، `screenshots/barcode_results_900.png` (النتائج + إجراءات جماعية)، `screenshots/create_order_900.png`.

**فروق شكلية تحتاج قبول العميل (لا تمنع الوظائف):**
1. لوحة الفلاتر عند العرض المكتبي تظهر كأقسام قابلة للطي وليست أزراراً أفقية كما في الصور المرجعية.
2. الماسح يستخدم كاميرا الجهاز + إدخال يدوي + قائمة أكواد (حتى 30)؛ الشكل الدقيق لواجهة الكاميرا يتبع المتصفح/الجهاز ولا يمكن تثبيته في لقطة ويب.
3. بطاقتا «كل الطلبات» و«جميع طلبات المتجر» تعرضان نفس الإجمالي (بند §1.4).
4. القالب الأبيض يحتفظ بشعارات ملوّنة.

### 12) حد الباركود «20 أو أكثر» — ✅ PASS

**الملفات:** `lib/live/live_barcode.dart` (`maxCodes = 30`)، `functions/src/bulk.js` (`≤30`، رفض 31+).

- الحد الأدنى المطلوب (20) مدعوم بالكامل، والسقف 30 يمنع الاستعلامات غير المحدودة.
- الحل خادمي دقيق لكل كود (VNX/رقم/معرّف)، بلا مسح واسع.

**الاختبار:** `functions/test/emulator/phase3_barcode_limit.test.js` — 20 و30 مقبولة، 31 مرفوضة.

### 13) فرض الكمية 1 على الطلبات الجديدة — ✅ PASS

**الملف:** `functions/src/index.js`.

- `createOrder` يفرض `quantity = 1` بعد التحقق، ويتضمنها في hash الـidempotency (لا يمكن تجاوزها من العميل).
- `updateOrder` يحافظ على كمية الطلب التاريخية كما هي؛ الطلبات القديمة لا تُعاد كتابتها.
- العرض يظل بلا حقل كمية.

**الاختبار:** `functions/test/emulator/phase3_quantity.test.js` — إنشاء بـ9 يخزّن 1، وتعديل طلب قديم بكمية 4 يبقيها 4.

---

## 2. مصفوفة الصور السبع المرجعية

| # | الشاشة المرجعية | الحالة | الدليل |
|---|---|---|---|
| 1 | الرئيسية / البطاقات | ✅ PASS (ملاحظة إجمالي مكرر) | `screenshots/dashboard_390.png`, `dashboard_1440.png` |
| 2 | إنشاء طلب جديد | ✅ PASS | `screenshots/create_order_900.png` |
| 3 | قائمة الطلبات والفلاتر | ✅ PASS | `screenshots/orders_390.png`, `orders_1440.png`, `filter_chips_760.png` |
| 4 | التحديد المتعدد | ✅ PASS | `screenshots/orders_multi_select_900.png` |
| 5 | الماسح ونتائج الباركود | ✅ PASS (شكل الكاميرا يتبع الجهاز) | `screenshots/barcode_results_900.png` |
| 6 | بوليصة بيضاء | ✅ PASS | `print/a4_white_contact.png` |
| 7 | بوليصة ملونة | ✅ PASS | `print/a4_colored_contact.png` |

خريطة الصور السبع مبنية على مجموعة الشاشات التي راجعها العميل. الفروق الشكلية المحددة في §1.11 تحتاج قبولاً بصرياً صريحاً، وليست إخفاقات وظيفية.

---

## 3. الأدلة الأمنية وسلامة البيانات

- **مصفوفة الصلاحيات:** `functions/test/emulator/phase3_password.test.js` + `functions/test/policy.test.js` (5×5) — **لا تصعيد من dataEntry/sales/warehouse**.
- **عدم تكرار Click:** لم تُمس مسارات القفل/`needs_review`/`clickOrderRef`؛ الاختبارات القائمة (`click_reconcile`, `dispatch_contract`, `phase2_*`) نجحت ضمن **241/241**. أُضيف فقط `sentAt` عند الإرسال الناجح/الربط، ولا يُكتب عند الفشل.
- **التصحيح الإداري:** يرفض أي أثر Click/شحنة؛ لا يستطيع تزوير `dispatched/inTransit/returned`.
- **المبالغ:** لا مبالغ لغريب؛ الاستثناء الوحيد هو منشئ الطلب، موثق أعلاه.
- **البحث:** لا يتخطى نهاية المصادر ولا يكرر النتائج؛ مؤشرات مربوطة بمعايير البحث.
- **الطباعة:** QR/Code128 = `VNX-<id>` فقط؛ لا بيانات عميل أو أسرار داخل الرمز.
- **App Check / Rules / KMS:** لم تتعطل ولم تتغير.

---

## 4. النشر والتطابق

| البند | الدليل |
|---|---|
| Functions | 55 دالة محدثة على `europe-west1` — `docs/evidence/final-audit/deploy-functions.log` |
| Hosting | HTTP 200، وبصمة `main.dart.js` المنشورة = البناء المحلي (`c1d7830ba5aa949988af…`) — `deploy-hosting.log`, `deployment.json` |
| حارس الدالة الجديدة | `correctOrderStatus` بلا مصادقة يعيد `UNAUTHENTICATED` |
| APK | `delivery/apk/Velnix-release.apk` — 81,131,692 بايت — SHA-256 `307879499fc91ffbf211bbad5ec01ec772731e681747ad9b8246f4c1aa388be8` — `apk-sha256.txt` |
| قواعد/فهارس Firestore | بلا تغيير في هذه الجولة — لم تُنشر |

---

## 5. الاختبارات — الأعداد والملفات

| الحزمة | النتيجة | الملف |
|---|---|---|
| Flutter | **487** | `flutter test` (Linux container) |
| Functions unit | **195** | `docs/evidence/final-audit/functions-unit.log` |
| Functions emulator + rules | **241** | `docs/evidence/final-audit/functions-emulator.log` |
| Playwright 5 أدوار | **21/21** | CI run `40734399317` (job `emulator-ui`) |
| Demo smoke | 30 شاشة / 0 أخطاء | `docs/evidence/final-audit/demo-browser-results.json` |
| Barcode/QR | **45/45** | `barcode-decode.log`, `barcode-decode-results.json` |

اختبارات مخصصة جديدة للفروق: `phase3_password`, `phase3_search_window`, `phase3_amounts`, `phase3_correction`, `phase3_filters`, `phase3_quantity`, `phase3_barcode_limit` (كلها emulator)، و`order_filters_phase3_test`, `final_audit_visuals_test`, وتوسعات `order_printing_phase3_test` / `phase3_polish_test`.

---

## 6. FAIL / BLOCKED

| البند | الحالة | السبب / المطلوب |
|---|---|---|
| شحنة Click حقيقية | ⛔ **BLOCKED** | لا تفويض/اعتماد إنتاجي. لم تُرسل أي شحنة. يلزم تفويض شحنة تجريبية واحدة. |
| جهاز Android حقيقي (كاميرا QR / Play Integrity) | ⛔ **BLOCKED** | لا جهاز موصول. APK موقّع وجاهز، لكن مسح الكاميرا والتحقق الميداني يحتاج جهازاً. |
| طباعة ورقية فعلية | ⛔ **BLOCKED** | لا طابعة متصلة. التحقق رقمي (203/300/600 DPI) وليس ورقياً. |
| بطاقة الإجمالي المكررة | ⚠️ **قبول بصري** | «كل الطلبات» و«جميع طلبات المتجر» بنفس النطاق. لم يُحذف أي عنصر دون قرار العميل. |
| شكل الماسح/الكاميرا | ⚠️ **قبول بصري** | يعتمد على الجهاز؛ اللقطة المتاحة لشاشة النتائج فقط. |

**لا يوجد FAIL وظيفي في الكود.**

---

## 7. إعادة الإنتاج

```bash
# Flutter
docker run --rm -v "$PWD":/w -w /w velnix-flutter:3.47.7 sh -c \
  'rm -f .dart_tool/package_config.json .dart_tool/package_config_subset; flutter pub get; flutter analyze; flutter test'

# Functions
cd functions && npm test
npx firebase-tools emulators:exec --project demo-velnix --config ../.firebase-e2e-local.json \
  --only auth,firestore "node --test --test-concurrency=1 test/emulator/*.test.js"

# PDF + decode
flutter test test/live_readiness_test.dart --plain-name "generate real Arabic PDFs"
python3 scripts/verify_barcodes.py
```

> ملاحظة بيئة: اختبارات `BulkWriter` أُبقيت حتمية داخل Docker عبر `WriteBatch` مقسّمة (مشكلة ساعة حاوية معروفة، ليست عيب منتج).

---

## 8. الملفات الرئيسية المعدلة

- الخادم: `functions/src/policy.js`, `index.js`, `query.js`, `order_view.js`, `bulk.js`.
- الواجهة: `lib/live/gateway.dart`, `live_app.dart`, `live_orders.dart`, `live_dashboard.dart`, `order_filters.dart`, `live_barcode.dart`.
- الطباعة: `lib/printing/order_printing.dart`.
- الاختبارات: الملفات المذكورة أعلاه + goldens `test/goldens/final_audit/`.
- الأدلة: `docs/evidence/final-audit/`.
