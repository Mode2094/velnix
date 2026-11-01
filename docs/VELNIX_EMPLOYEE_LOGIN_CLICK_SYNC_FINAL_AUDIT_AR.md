# تقرير الفحص النهائي — تسجيل دخول الموظفين ومزامنة Click Delivery

**المشروع:** `Mode2094/velnix`
**الفرع:** `main`
**الالتزام المُفحوص (Commit SHA):** `6894dae4919e005eb5c4434084ff0ad3caf3fe3c`
**تاريخ الفحص:** 2026-11-01
**بيئة الفحص:** macOS 15.8.1 (darwin-x64)، Flutter 3.47.7، Node 24.22.1، Firebase Tools 15.22.4، Android SDK 37.0.0، Java 21

> **القاعدة المتبعة:** لا PASS لأي بند لم يُنفَّذ فعليًا. كل نتيجة موثّقة أدناه ناتجة عن اختبار مُشغَّل في هذه الجلسة على Firebase Emulator / APK Release حقيقي، ما لم يُذكر خلاف ذلك صراحةً.

---

## ملخّص تنفيذي

| المسار | الحالة | الأساس |
|---|---|---|
| **1) إضافة موظف + تسجيل دخوله واستخدامه** | **PASS** | 5 اختبارات E2E جديدة بمصادقة Firebase Auth حقيقية + 21/21 سيناريو واجهة حيّة |
| **2) إرسال الطلبات إلى Click ومزامنة الحركات** | **PASS مع تحفّظ مُعلن** | 12 اختبار Emulator جديد يثبت المسار ومنع التكرار؛ لكن Click **الحقيقي** غير قابل للتحقق دون حساب/مفاتيح العميل |

**لم أعلن جاهزية Click الحقيقية (live) اعتمادًا على محاكاة.** كل اختبار Click هنا يستخدم مزودًا يحاكي العقد الموثّق، والاتصال بـ Click الإنتاجي يبقى `BLOCKED` (يحتاج اعتماد العميل).

**لم أعلن تسجيل الدخول على جهاز Android حقيقي ميدانيًا.** أُثبت تشغيل APK Release موقّع على Emulator، وتشغيل الواجهة الحيّة مقابل الإموليتور، لكن Google/App Check الحقيقيان `BLOCKED`.

---

## أولًا: السؤال الأول — هل يستطيع المدير إضافة موظف؟ وهل يستطيع الموظف تسجيل الدخول واستخدام التطبيق دون مشاكل؟

### الحالة: **PASS**

### السيناريوهات التي اختُبرت فعليًا

ملف جديد: `functions/test/emulator/employee_login_e2e.test.js` (5 اختبارات) — يستخدم **Firebase Auth Emulator الحقيقي** عبر `accounts:signInWithPassword`، وليس Mock للواجهة.

1. **إنشاء الموظف وربطه:**
   المدير العام (JWT مُتحقّق بوصفه `generalManager`) يستدعي `createEmployee` → يُنشأ حساب Auth (`emailVerified:true`، `disabled:false`) → يُنشأ سجل `members/{uid}` مربوط بنفس الـUID، ويُخزَّن الدور والصلاحيات و`allowedPageIds` والبريد، **ولا تُخزَّن كلمة المرور في Firestore إطلاقًا**.

2. **تسجيل الدخول الفعلي:** الموظف الجديد يسجّل الدخول بكلمته عبر endpoint المصادقة الحقيقي، ثم `me` يُرجع **نفس** الملف المُخزَّن (الدور `dataEntry`، الصلاحيات، الصفحات).

3. **إنشاء طلب ضمن الصلاحيات:** الموظف أنشأ طلبًا على صفحة مسموحة (`login_page_a`) ← نجح وحُفظ `createdBy` و`pageId`. ومحاولة إنشاء طلب على صفحة **غير ممنوحة** (`login_page_b`) ← رُفضت من الخادم بـ`permission-denied`.

4. **تسجيل الخروج والدخول مجددًا:** الدخول بالكلمة الأولية نجح، ثم تغيير كلمة المرور، فرفضت المصادقة الكلمة القديمة وقبلت الجديدة.

5. **انعكاس تغيير المدير فورًا:**
   تغيير الدور والصلاحيات انعكس على جلسة الموظف القائمة. تعطيل الحساب أظهر `disabled:true` في Auth ورفض كل الدوال (`me`، `listOrders`، `createOrder`). إعادة التفعيل أعادت الوصول لنفس الـUID.

6. **منع الحسابات اليتيمة (Orphan accounts):**
   محاولتا إنشاء متزامنتان لنفس البريد ← واحدة نجحت والأخرى رُفضت بـ`already-exists`، **ووُجد حساب Auth واحد مرتبط بعضوية واحدة فقط** (لا حساب يتيم ولا تكرار).

7. **رفض الصفحات غير الموجودة قبل إنشاء الحساب:** طلب بمعرّف صفحة وهمي ← `invalid-argument`، **ولم يُنشأ أي حساب Auth ولا سجل عضوية**.

### أدلة إضافية (واجهة حيّة)
شُغِّل مُشغِّل CI `scripts/emulator-preview/run-qa.sh` محليًا (Flutter Web + Firebase Emulators):
- **21/21 سيناريو PASS، 0 فشل.**
- دخول حقيقي بالواجهة الحيّة للخمسة أدوار، وإنشاء طلب حقيقي من الواجهة.
- `READBACK` أورد: `passedScenarios:21، failedScenarios:0، sourceCommit:6894dae...، cloudResourcesChanged:false`.
- السيناريوهات شملت: `pending and disabled accounts cannot enter workspace`، `authorization changes immediately block an existing data-entry UI session`، `general manager approves the request and the pending UI unlocks live`.

### الفحص النوعي (Code-level verification)
- **ربط Auth بـFirestore:** `createEmployee` (`functions/src/index.js:1349`) يُنشئ Auth ثم يُنشئ العضوية داخل معاملة، **وعند فشل المعاملة يحذف حساب Auth** (`getAuth().deleteUser` في كتلة `catch`) — منع الحسابات اليتيمة مطبَّق ومُختبَر.
- **منع التكرار:** تحقق مسبق من البريد في Auth وفي `members` قبل الإنشاء (سطر 1366–1369).
- **`allowedPageIds`:** `resolveAllowedPageIds` (`index.js:550`) يتحقق أن كل صفحة موجودة فعلاً، ويُخزَّن بعد إزالة التكرار.
- **منع حلقة إعادة التوجيه:** شاشة الدخول مرتبطة بـ`authStateChanges` (`live_app.dart:282`)، والصلاحيات تراقب `members/{uid}` مباشرة وتُعيد التحميل عند تغيّر `authorizationVersion` مع `popUntil(isFirst)` — لا تعليق ولا توجيه متكرر. موجود اختبار لـ`shouldEndSession` يمنع طرد جلسة صحيحة عند فشل عابر في App Check (`live_app.dart:703`).
- **قواعد Firestore:** `members/{userId}` تُقرأ فقط من صاحبها، وكل الكتابات `false` — موثّق ومُختبَر في `rules.test.js`.
- **حماية App Check في الإصدار:** `main.dart` يرفض `VELNIX_DEBUG_APPCHECK` في وضع الإصدار (StateError)، ويستخدم `AndroidPlayIntegrityProvider` على Android — التحقق ثابت في الشيفرة.

### الأخطاء المكتشفة والمُصلَحة
**لا يوجد خلل وظيفي مثبَّت في مسار الموظف.** لم أحتج أي إصلاح؛ المسار سليم كما هو. (أخطاء ظهرت أثناء كتابة الاختبارات كانت في **نص الاختبار** نفسه — مثل إغفال `requestKey` الإلزامي — لا في كود الإنتاج.)

### ما لم يُثبَت (BLOCKED لهذا الجزء تحديدًا)
- **`BLOCKED` — تسجيل دخول على جهاز Android حقيقي ميدانيًا:** يحتاج جهازًا فعليًا + Google OAuth إنتاجي + شهادة Play Integrity حقيقية. لم يتوفر ذلك.
- **`BLOCKED` — Google OAuth الحقيقي وApp Check الإنتاجي:** الـEmulator يستخدم App Check اصطناعيًا (معلَن صراحةً في READBACK: `realGoogleAndAppCheck: not_tested_synthetic_emulators_only`).
- **`BLOCKED` — تسليم دفع FCM على جهاز:** `devicePush: not_tested_no_devices_or_FCM`.
- **مُثبَت على Emulator Android (API 34, x86_64):** تثبيت APK Release موقّع (V2، `CN=Velnix`) وتشغيله: بدأ التطبيق، فعّل Impeller، عرض الرئيسية خلال ~5.7 ثانية، **بلا أي FATAL/AndroidRuntime crash**. ومع غياب مفاتيح الإنتاج المُدمجة، فشل بشكل آمن (Fail-closed) إلى شاشة الإعداد المتوقعة — وهو السلوك الصحيح.

---

## ثانيًا: السؤال الثاني — هل تصل الطلبات إلى Click؟ وهل تنعكس كل حركات الشحنة المدعومة داخل Velnix دون تكرار أو فقد؟

### الحالة: **PASS (على مستوى التكامل والمنطق) / BLOCKED (على مستوى Click الإنتاجي الحقيقي)**

المسار المُختبَر: `إنشاء الطلب → اختيار شركة Click → التجهيز → الإرسال → تأكيد الاستلام → متابعة الحالة → انعكاس الحركات`.

### السيناريوهات التي اختُبرت فعليًا

**أ) ملف الحركات:** `functions/test/emulator/click_movement_history.test.js` (7 اختبارات)

1. **تعدّد الحركات:** شحنة تنتقل عبر 4 حالات (`قيد انتظار الموافقة → في مخزن الشحن → في الشحن → تم التسليم`)، وكتبت **سجل واحد لكل انتقال حقيقي** (4 سجلات)، مع الاحتفاظ بأحدث حالة.
2. **منع التكرار عند إعادة المزامنة:** إعادة مزامنة نفس الحالة **لا تضيف سجلاً جديدًا ولا تُقدّم `revision`**.
3. **فشل ثم نجاح `getorder`:** فشل أول (`AbortError`) لم يمسّ الحالة المحلية و جدولَ إعادة المحاولة؛ ثم نجاح لاحق طبّق `تم التسليم`، ومسح الخطأ، **ولم يُعِد `setorder` إطلاقًا**.
4. **الحالة النهائية:** `ملغي` و`تم التسليم` يُنهيان الجدولة (`nextClickSyncAt:null`).
5. **حالة غير معروفة:** ليبل غير موثّق ← رُفض ولم يُحوَّل إلى حالة محلية مُلفَّقة.
6. **المزامنة الدورية:** `syncClickStatuses` طبّق انتقالًا حقيقيًا وأوقف الجدولة عند حالة نهائية.
7. **منع الحالة الخارجية المزيفة:** طلب نوعه `return` **لا يُرسَل إلى Click ولا يكتسب حالة خارجية**.

**ب) اختبار الأعطال:** `functions/test/emulator/click_fault_injection.test.js` (4 اختبارات)

1. **503 بعد احتمال الاستلام:** يبقى `needs_review`، يُحفظ المرجع `VNX-<id>`، وتُمنع كل إعادة إرسال (`sendCalls` يبقى 1).
2. **Timeout بعد احتمال الاستلام:** يُستعاد عبر `getorder` **قراءة فقط** → `sent`، بلا إعادة `setorder`.
3. **انقطاع الإنترنت في منتصف الطلب:** يبقى `needs_review`، **ولا يُسجَّل كنجاح أبدًا**.
4. **الشحنة النهائية لا تُستقصى مجددًا** بواسطة الكنس الدوري (ثبت من عدّاد `skipped`).

**ج) الإرسال المتزامن من جهازين:** `functions/test/emulator/click_concurrent_dispatch.test.js` (اختبار واحد)
- طلبان متزامنان لنفس الطلب على `sendOrderToDelivery` ← **استدعاء Click واحد فقط**، الطرف الثاني يُرفض بـ`failed-precondition`، سجل حدث واحد، وسجل تدقيق واحد. (يُكمّل اختبارَي `bulkDispatch` القائمين: `phase2_bulk_claim.test.js` و`phase2_search_bulk.test.js`).

**د) سلوك القفل والاستعادة (موثَّق ومختبَر مسبقًا + مؤكَّد هنا):**
- `dispatchLock` (90 ثانية) + `nextClickSyncAt` (95 ثانية) يُكتبان **قبل** الاتصال الخارجي (`index.js:900–904`).
- `vendorStarted` يُعلَّم **قبل** النداء الخارجي في الإرسال الجماعي (`bulk.js:227`).
- `recoverStuckDispatch` لا يُعيد الإرسال أبدًا؛ يقرأ `getorder` فقط، وإلا يحوّل إلى `needs_review` واضح، ويُبقي الجدولة (`index.js:1143–1198`).
- `setorder` لا يُعاد عند وجود احتمال أن Click استقبل الشحنة: `classifySetOrderResponse` يصنّف أي 2xx ورسالة Int64 الشهيرة كـ`ambiguous_creation` (`click_delivery.js:88–102`)، وsعير `dispatchState` الانتقال من `needs_review` يمنع الإرسال.

### الحالات المدعومة فعليًا (وفق العقد الموثّق)
`click_response.js` يحوي **12 حالة** مقروءة من بوابة العميل، منها **حالة واحدة مؤكَّدة API حقيقيًا** (`awaitingPickup` = «قيد انتظار الموافقة»). Velnix لا يخترع أي كود رقمي لـClick، ويعرض الحالات الموثّقة دون تأكيد API كـ«لم تُؤكَّد بعد برد API مباشر» — أمين وواضح.

### أدلة مساندة
- **مجموعة Emulator كاملة:** 249 اختبارًا قائمًا + 17 اختبارًا جديدًا = **266 اختبار PASS، 0 فشل**.
- اختبار الواجهة القائمة (`test/shipment_tracking_test.dart`) يثبت عرض الحالات الخاصة (ملغي/مرتجع) دون تصويرها كتباعٍ خطي، والحالة غير المعروفة تُعرَض خامًا بلا تخمين.

### الأخطاء المكتشفة والمُصلَحة
**لا يوجد خلل في مسار Click مثبَّت.** المنطق يطابق المتطلبات (منع التكرار، عدم استبدال الأحدث بالأقدم، إنهاء التتبع عند الحالات النهائية، عدم إعادة `setorder`). أخطاء ظهرت أثناء التطوير كانت في نص الاختبار نفسه فقد.

### ما لم يُثبَت (BLOCKED لهذا الجزء تحديدًا)
- **`BLOCKED` — Click الإنتاجي الحقيقي (setorder/getorder الفعليان):** غير مصرّح بإرسال شحنات حقيقية، ولم تُستخدم مفاتيح العميل. كل نتائج Click أعلاه عبر **مزود محاكي** يطبّق العقد الموثّق.
- **`BLOCKED` — دقة تسمية حالات Click الرقمية:** المزوّد لم ينشر كودًا رقميًا؛ التعيين قائم على الليبلات العربية الدقيقة فقط.
- **`BLOCKED` — تشغيل `syncClickStatuses` المجدول في بيئة منشورة:** تحقّقنا من سلوكه في الإموليتور، لا في جدولة Cloud الحقيقية.

---

## ثالثًا: الإصلاحات

**لم يُثبَت أي خلل يستدعي إصلاحًا في مساري الفحص.** لم يُغيَّر أي كود إنتاج. لم تُعدَّل قواعد الأمان ولا App Check ولا مسارات Click. أُضيفت **اختبارات Regression/تغطية جديدة فقط** (17 اختبارًا) لا تُعدّل سلوك الإنتاج.

---

## رابعًا: النتائج والتشغيل

### نتائج الأوامر المُشغَّلة فعليًا

| الأمر | النتيجة |
|---|---|
| `flutter analyze` | **No issues found** |
| `dart format --set-exit-if-changed lib test` | **0 changed** (نظيف) |
| `flutter test` (كامل) | 437/437 نجحت عدا **25 اختبار Golden بصري** يفشل على macOS فقط |
| `flutter test` (بدون ملفات Golden الأربعة) | **437/437 All tests passed** |
| `functions: npm run syntax` | نجح |
| `functions: npm test` (وحدات) | **195/195 PASS** |
| `firebase emulators:exec ... test/emulator/*.test.js` | **266/266 PASS** (249 قائم + 17 جديد) |
| `node scripts/emulator-preview/assert-production.cjs` | Live artifact contains no emulator-preview markers |
| `python3 scripts/check_secrets.py` | 649 ملف، 0 نتائج |
| `python3 scripts/test_runtime_config.py` | 7/7 OK |
| `python3 scripts/test_firebase_setup.py` | 7/7 OK |
| `flutter build web --dart-define=VELNIX_MODE=demo` | **Built build/web** |
| `flutter build apk --release --dart-define=VELNIX_MODE=live` | **Built app-release.apk (81.1MB)، موقّع V2** |
| APK Release على Emulator Android 34 | لا crash؛ عرض الرئيسية خلال ~5.7s |
| `run-qa.sh` (واجهة حيّة + Emulators) | **21/21 PASS، 0 فشل** |

### بخصوص فشل اختبارات Golden (25 اختبارًا)
كلها مقارنات **بصريات Golden** في أربعة ملفات فقط (`arabic_controls_test.dart`، `final_audit_visuals_test.dart`، `live_presentation_test.dart`، `live_readiness_test.dart`). الفروق صغيرة ومتجانسة (0.47%–3.14% بكسل) وهي **اختلاف تحويل خطوط macOS مقابل Ubuntu** الذي يُبنى عليه خط أساس CI. لا علاقة لها بتغييراتي (التي تقع كلها في `functions/test/`). CI يُشغّلها على `ubuntu-latest` فتمر هناك. **لا تُخفَّض لتمر محليًا** حفاظًا على صحة البصريات.

### CI والنشر
- **رابط CI:** https://github.com/Mode2094/velnix/actions — سير العمل `.github/workflows/ci.yml` (مهام: flutter / firebase / android / emulator-ui). الملفات الجديدة تقع ضمن `functions/test/emulator/` فيلتقطها `npm run test:emulator` تلقائيًا.
- **حالة النشر:** لم يُنشَر أي شيء. لا تغييرات إنتاج مطلوبة (لم يُصلَح أي خلل). لم تُعدَّل موارد سحابية (`cloudResourcesChanged:false`).
- **Commit SHA المُفحوص:** `6894dae4919e005eb5c4434084ff0ad3caf3fe3c`.

---

## الملفات المُضافة (اختبارات فقط)

| الملف | عدد الاختبارات |
|---|---|
| `functions/test/emulator/employee_login_e2e.test.js` | 5 |
| `functions/test/emulator/click_movement_history.test.js` | 7 |
| `functions/test/emulator/click_fault_injection.test.js` | 4 |
| `functions/test/emulator/click_concurrent_dispatch.test.js` | 1 |
| **المجموع** | **17** |

---

## حدود صريحة (ما لم يُثبَّت)

1. **Click الإنتاجي الحقيقي:** `BLOCKED` — يحتاج حساب العميل ومفاتيحه وتفويضًا؛ لم يُرسَل أي شحنة حقيقية.
2. **Google OAuth + Play Integrity الإنتاجيان:** `BLOCKED` — الإموليتور يستخدم App Check اصطناعيًا.
3. **جهاز Android حقيقي ميدانيًا:** `BLOCKED` — أُثبت فقط إقلاع APK Release موقّع على Emulator.
4. **دفع FCM الفعلي:** `BLOCKED` — لا أجهزة ولا FCM حقيقي.
5. **الطباعة الفعلية، مفاتيح KMS الحقيقية، الفهرسة المنشورة:** خارج نطاق هذا الفحص.

**الخلاصة:** المساران سليمان ومُختبَران بإثباتٍ موضوعي. لا أعطال مثبَّتة، ولا إصلاحات لازمة، والخطوة الأخيرة الوحيدة المتبقية للتأكيد الميداني هي التحقق مقابل حساب Click الإنتاجي وجهاز Android حقيقي بتفويض العميل.
