# VELNIX — المرحلة الأولى من متطلبات العميل

**الصفحات الإلكترونية (Facebook Pages) + صلاحيات الموظفين + نموذج إنشاء الطلب + موثوقية إرسال Click**

- الفرع: `main`
- الكوميت المرجعي: `e8a1434` (الميزة الأساسية في `7d48f1f`)
- المشروع: `velnix-6c1a2`
- الويب المنشور: https://velnix-6c1a2.web.app

> كل نتيجة PASS في هذا التقرير قابلة للإثبات من الكود والاختبارات والفحص الفعلي على Firebase.

---

## 1. السبب الجذري للمشاكل التي عولجت

| المشكلة | السبب الجذري | الإصلاح |
|---|---|---|
| إرسال Click «يعلق» ويظهر خطأ غير واضح | الواجهة كانت تعرض رسالة عامة «تعذر الاتصال» و**تتجاهل** رسالة الخادم الدقيقة عن النتيجة غير المؤكدة، ولم يكن هناك مهلة على الواجهة، ولم تُحدَّث حالة الطلب بعد الخطأ | الحفاظ على رسالة الخادم العربية الآمنة فقط، مهلة 75 ثانية تعتبر النتيجة غير مؤكدة، إعادة تحميل الطلب بعد أي خطأ لعرض الحالة الحقيقية |
| إمكانية تكرار الشحنة عند 503/Timeout | (موجودة سابقًا في الخادم: قفل + `clickOrderRef` قبل الإرسال + `needs_review`) | أُبقي عليها وتحقّقنا منها بـ 21 اختبار emulator + منع إرسال الأنواع غير العادية إلى Click |
| نموذج الطلب لا يحتوي الصفحة/النوع/الشركة | غير موجود في النموذج ولا في نموذج البيانات | عمود `orderType` + `pageId` إلزامي + «شركة التوصيل» اختيارية عند الإنشاء |
| لا يوجد مفهوم «صفحات Facebook» | لا يوجد أي نموذج بيانات أو خدمة | مجموعة `pages` + 6 دوال خادمية + تبويب إدارة كامل |
| الموظف يستطيع استخدام أي صفحة | لا توجد صلاحية صفحة | `members.allowedPageIds` + تطبيق خادمي داخل `createOrder` |

---

## 2. جدول التنفيذ

| المطلب | PASS / FAIL / BLOCKED | الدليل |
|---|---|---|
| إضافة صفحات Facebook | PASS | `functions/src/pages.js` `savePage`؛ اختبار `pages_permissions.test.js` |
| تعديل وأرشفة الصفحات | PASS | `savePage/archivePage/restorePage`؛ اختبار «creates, edits, disables, archives, restores» |
| ربط الصفحات بالموظفين | PASS | `allowedPageIds` في `saveMember/createEmployee/decideJoinRequest`؛ واجهة `LiveMemberForm` |
| حماية صلاحيات الصفحات | PASS | اختبار «only create for allowed pages» + «revoking takes effect without cache» |
| اختيار الصفحة عند إنشاء الطلب | PASS | حقل إلزامي في `LiveOrderForm` + `resolveOrderPage` خادمي |
| حفظ بيانات الصفحة في الطلب | PASS | Snapshot `pageId/pageName/pageFacebookUrl`؛ اختبار «snapshot survives renames» |
| المحافظة على تبويب المتاجر | PASS | `LiveStores` لم يُلمس؛ ما زال «قريبًا...» |
| إضافة أنواع الطلبات | PASS | `OrderType` (عادي/إرجاع/تبديل/استلام جزئي)؛ اختبار «order types stored» |
| تطوير نموذج الطلب | PASS | ترتيب الحقول: النوع → الصفحة → الشركة → ... ؛ `LiveOrderForm` |
| إزالة خانة الكمية من الواجهة | PASS | لا خانة كمية؛ يُرسل `quantity=1` خادميًا؛ اختبار widget «hide quantity» |
| جعل العنوان التفصيلي اختياريًا | PASS | `validateOrderFields` يقبل عنوانًا فارغًا؛ اختبار «optional address» |
| اختيار شركة التوصيل | PASS | حقل اختياري في النموذج؛ `resolveOrderCompany` |
| الشركة الافتراضية | PASS | الشركة تُحفظ عند الإنشاء لكن **لا تُرسل** الشحنة؛ اختبار «company at creation» |
| الحفظ والعودة للرئيسية | PASS | `onSaved` → `go(1)`؛ رسالة «تم حفظ الطلب» |
| إدخال البيانات باللصق | PASS | `lib/core/order_paste.dart` + مراجعة قبل التطبيق؛ اختبارات paste |
| إصلاح تعليق إرسال Click | PASS | مهلة الواجهة + الحفاظ على رسالة الخادم + إعادة التحميل؛ `live_order_journey.dart` |
| منع إرسال شحنات مكررة | PASS | قفل خادمي + `needs_review`؛ 21 اختبار emulator |
| معالجة 503 وTimeout | PASS | `classifySetOrderResponse` → `click_ambiguous_creation` → `needs_review` |
| صحة حساب الخدمة وKMS | PASS | `velnix-runtime-internal@...`؛ اختبار `dispatch_contract` (فشل KMS قبل الاتصال) |
| استمرار getorder | PASS | `readClickOrder`؛ اختبار «connection test reads through getorder» |
| المزامنة التلقائية | PASS | `syncClickStatuses` كل 15 دقيقة؛ اختبار «scheduled Click sync» |
| Android UI | BLOCKED | لا جهاز موصول الآن؛ APK مبني وموقّع (انظر §7) |
| Chrome UI | PASS | 21/21 سيناريو Playwright محليًا (`browser.cjs`) |
| Firebase Tests | PASS | 194 اختبار unit + 171 اختبار emulator |
| Security Tests | PASS | `rules.test.js` + سيناريوهات الصلاحيات في `browser.cjs` |
| CI | PASS | Run `40563265355` (firebase/flutter/android/emulator-ui) |
| Firebase Production | PASS | Functions (47) + Hosting منشورة؛ التحقق بعد النشر |

---

## 3. تفاصيل التنفيذ

### الجزء الأول — الصفحات الإلكترونية
- **مجموعة `pages/{id}`**: `name, nameLower, facebookUrl, logoDataUri, phone, whatsapp, note, active, archived, status, orderCount, createdBy/At, updatedBy/At`.
- **الدوال (6)**: `listPages, listAllowedPages, savePage, archivePage, restorePage, pageStats`.
- **الشعار**: يُحفظ كـ data URI محدود (≤64KB، PNG/JPEG/WebP/GIF فقط) — لا حاجة لـ Firebase Storage، وتُتحقق منه البنية خادميًا.
- **الأرشفة**: لا حذف إطلاقًا؛ الطلبات التاريخية تحفظ `pageName` snapshot.
- **تبويب `الصفحات الإلكترونية`** (`lib/live/live_pages.dart`): إضافة/تعديل/تعطيل/أرشفة/استعادة، بحث بالاسم، عدد الطلبات لكل صفحة.
- **`المتاجر` بقي «قريبًا»** كما هو مطلوب.

### الجزء الثاني — صلاحيات الموظفين
- `members.allowedPageIds: string[]`.
- يُحفظ عبر `createEmployee` / `saveMember` / `decideJoinRequest`، ويُتحقق أن كل معرّف موجود فعلًا.
- `currentActor` يفشل الطلب إن تغيّرت الصفحات المسموحة (إبطال الجلسة/Cache فورًا).
- `createOrder` يرفض **خادميًا** أي صفحة غير مسموحة/معطلة/مؤرشفة (إخفاء الواجهة غير كافٍ).
- واجهة `LiveMemberForm` تضيف قسم «الصفحات الإلكترونية المسموح بها» مع تحديد الكل/إزالة.

### الجزء الثالث — نموذج إنشاء الطلب
- الترتيب: نوع الطلب → الصفحة الإلكترونية* → شركة التوصيل (اختياري) → المحافظة → المنطقة → اسم العميل → الهاتف → هاتف احتياطي → الوصف → العنوان التفصيلي → المبلغ → الملاحظات.
- **الأنواع**: `normal / return / exchange / partial_receipt` (الافتراضي `normal`)، محفوظة وتُعرض في التفاصيل.
- **إزالة الكمية**: الحقل مخفي؛ الخادم يستخدم `1` افتراضيًا؛ `Ord_Quantity` يبقى صحيحًا في تكامل Click.
- **العنوان اختياري**: يُبنى عنوان الشحن بأمان من `city - area - address` عند توفره فقط.
- **اللصق**: اقتراح قيم محلي فقط (بلا خدمة خارجية)، مع نافذة مراجعة؛ لا إدخال صوتي.

### الجزء الرابع — إرسال Click
- إبقاء منظومة القفل/`needs_review`/`clickOrderRef` كما هي (مثبتة باختبارات).
- الحفاظ على رسالة الخادم العربية في `callableErrorMessage` — مع حاجز يمنع أي نص SDK إنجليزي.
- مهلة 75 ثانية على `dispatch` تُعالَج كنتيجة غير مؤكدة.
- إعادة تحميل الطلب بعد أي خطأ في الواجهة.
- **رفض إرسال الأنواع غير العادية** إلى Click (لا عقد مثبت): `failed-precondition` مع رسالة واضحة.

---

## 4. قاعدة البيانات والصلاحيات

| المجموعة | التغيير |
|---|---|
| `pages/{id}` | **جديدة**: بيانات الصفحات + snapshot الشعار |
| `members/{uid}` | `allowedPageIds: string[]` (جديد) |
| `orders/{id}` | `pageId, pageName, pageFacebookUrl, orderType` (جديدة) |
| `pages` rules | مغطاة بـ deny-by-default؛ كل الوصول عبر Callable |
| Storage | غير مستخدَم (الشعار data URI محدود) |

---

## 5. نتائج الاختبارات

| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **453 ناجح** |
| `functions` unit | **194 ناجح** |
| `functions` emulator + rules | **171 ناجح** (منها 13 صفحة/صلاحيات + 21 سيناريو Click) |
| Playwright `browser.cjs` | **21/21 PASS** محليًا ونفس السيناريو في CI |
| CI | Run `40563265355` — 4/4 jobs |

### اختبارات منع التكرار (الجزء الرابع)
`click_reconcile.test.js`: ambiguous create keeps `needs_review`; pre-send failure→`idle`; confirmed read auto-resolves; failed read keeps review; policy number/merchant ref uniqueness; no API downgrade; sync apply/stale/conflict/missing-date/failure/lock; scheduled sync.

---

## 6. مراجعة ذاتية

- **الأمان**: كل الصلاحيات مطبّقة خادميًا؛ لا أسرار في الكود/السجلات؛ رفض إرسال الأنواع غير المثبتة.
- **سلامة البيانات**: لا حذف صفحات؛ snapshots تاريخية؛ الأرشفة لا تكسر الطلبات القديمة.
- **منع التكرار**: القفل + `clickOrderRef` قبل الإرسال + `needs_review` + رفض إرسال ثانٍ.
- **الشبكة**: مهلة + معالجة انقطاع + استعادة الحالة من Firestore.
- **التوافق القديم**: الطلبات بدون `pageId` تُفتح/تُطبع/تُعدّل؛ الصفحة إلزامية للجديد فقط.
- **الأداء**: لا استعلامات زائدة؛ `listAllowedPages` غير مخزّن مؤقتًا (كي يسري سحب الصلاحية فورًا).

---

## 7. النشر والحالة

- **Functions**: نُشرت (47 دالة منها 6 صفحات) على `europe-west1`.
- **Hosting**: منشور على https://velnix-6c1a2.web.app
- **Rules/Indexes**: بلا تغيير (الصفحات عبر Callable؛ الاستعلامات بحقول فردية).
- **APK**: `delivery/apk/Velnix-release.apk` — موقّع `CN=Velnix` (SHA-256 `eb9aeb6c…4c3e`)؛ App Check = Play Integrity.
- **Commit**: `e8a1434`.

---

## 8. قيود ونقاط غير مثبتة

- **Android UI**: BLOCKED — لم يُوصَل جهاز أثناء هذه المرحلة؛ الـ APK مبني وموقّع لكن لم يُختبر تشغيليًا على جهاز في هذه الجولة (App Check/Play Integrity يحتاج جهازًا).
- **Click الحي**: لم تُرسَل شحنات حقيقية؛ كل اختبر بـ Mock/Emulator كما هو مطلوب.
- **اللصق**: استخراج محلي تقديري؛ الموظف يراجع دائمًا قبل الحفظ.
