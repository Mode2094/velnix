# VELNIX — إغلاق مراجعة المرحلة الأولى (Independent Review Fixes)

- الفرع: `main`
- Commit المرجعي: `4e669be`
- CI Run: `40574709224` — 4/4 jobs خضراء
- المشروع: `velnix-6c1a2` · الويب: https://velnix-6c1a2.web.app

> كل نتيجة PASS قابلة للإثبات من الكود والاختبارات والنشر. لم تُبدأ المرحلة الثانية ولم تُضف ميزات جديدة.

---

## 1. جدول إغلاق الملاحظات السبع

| # | الملاحظة | الحالة | الدليل |
|---|---|---|---|
| 1 | `managePages` لا يجب أن يتجاوز `allowedPageIds` | PASS | `functions/src/index.js` `resolveOrderPage`؛ اختبار «a page administrator without the page on their list cannot create an order for it» |
| 2 | حماية قراءة بيانات الصفحات (`listPages`/`pageStats`) | PASS | `requireAuth + manage(user)`؛ اختبار «page administration reads require managePages…» |
| 3 | شركة التوصيل الافتراضية | PASS | `settings.defaultCompanyId` + `LiveSettings` + اختيار تلقائي في النموذج؛ اختبارات «default delivery company…» + widget |
| 4 | العودة للرئيسية بعد الحفظ | PASS | `live_app.dart` `onSaved → go(0)` + رسالة برقم الطلب؛ Playwright «dashboard after save» |
| 5 | رفع شعار الصفحة | PASS | `lib/core/page_logo.dart` (image_picker + تصغير + معاينة/تغيير/إزالة) + تحقق خادمي |
| 6 | Idempotency يشمل pageId/companyId/orderType | PASS | `payloadHash` موسّع؛ اختبار «reusing a request key… is a conflict» |
| 7 | إغلاق تعليق إرسال Click | PASS | `recoverStuckDispatch` + مُجدوِل يُعالج `sending` المنتهي؛ 4 اختبارات emulator |

---

## 2. تفاصيل كل إصلاح

### الملاحظة 1 — صلاحيات صفحات الطلب
- قبل: `if(user.role!=='generalManager'&&!can(user,'managePages'))` — أي حامل `managePages` يتخطى القائمة.
- بعد: **المدير العام فقط** يُعفى؛ أي موظف آخر (حتى مع `managePages`) يجب أن تكون الصفحة في `allowedPageIds`.
- الدالة: `resolveOrderPage` تُستخدم في `createOrder` و`updateOrder`.

### الملاحظة 2 — حماية قراءة البيانات
- `listPages` و`pageStats`: تتطلبان `managePages` (عبر `manage(user)`)، وإلا `permission-denied`.
- `listAllowedPages`: متاحة للجميع لكنها تُرجع **فقط** الصفحات المسموحة (GM يرى الكل)، وأُزيل `allPages` الحسّاس واستُبدل بعلم `canManage`.
- الواجهة: تبويب الإدارة يظهر لأصحاب `managePages` فقط (سبق)، والآن الخادم يفرضه أيضًا.

### الملاحظة 3 — الشركة الافتراضية
- إعداد جديد `settings.defaultCompanyId` في `getSettings`/`saveSettings`، يُتحقق أنه شركة موجودة ومُفعّلة وغير مؤرشفة.
- `LiveSettings`: قائمة منسدلة للشركة الافتراضية (من الشركات المفعّلة).
- `LiveOrderForm._loadOptions`: يقرأ الإعداد (fresh) ويختار الشركة تلقائيًا إن كانت متاحة، مع السماح بتغييرها.
- **لا إرسال تلقائي**: الإسناد يبقى منفصلًا عن `sendOrderToDelivery`.
- سحب الشركة/تعطيلها: لا تُختار تلقائيًا (اختبار الخادم + اختبار widget).

### الملاحظة 4 — العودة بعد الحفظ
- بعد الحفظ الناجح: رسالة «تم حفظ الطلب — رقم الطلب VNX-XXXXXX» ثم الانتقال إلى **لوحة التحكم** (`go(0)`) مع `invalidate('dashboard')`/`invalidate('orders')`.
- مفتاح `requestKey` الثابت يمنع الإنشاء المزدوج.

### الملاحظة 5 — شعار الصفحة
- `PageLogoService.pick()` يستخدم `image_picker` (معرض/كاميرا/ملف)، يُصغّر الصورة إلى 320px بجودة 80.
- معاينة + تغيير + إزالة داخل `LivePageForm`؛ يُخزَّن كـ data URI محدود.
- الخادم يتحقق من النوع (PNG/JPEG/WebP/GIF) والحجم (≤64KB) — اختبارات emulator.

### الملاحظة 6 — Idempotency
- `payloadHash = sha256({...fields, pageId, companyId})` (و`orderType` ضمن `fields`).
- نفس المفتاح + نفس البيانات → نفس الطلب (`alreadyExists:true`).
- نفس المفتاح + صفحة/شركة/نوع مختلف → `already-exists` (تعارض واضح)، لا إرجاع صامت.

### الملاحظة 7 — تعليق إرسال Click
- العلاقات الزمنية: مهلة الدالة 60s < قفل الإرسال 90s < مهلة الواجهة 75s (الواجهة تعالج انتهاءها كنتيجة غير مؤكدة).
- عند الدخول إلى `sending` يُضبط `nextClickSyncAt = now+95s` ليُعاد فحصه.
- `recoverStuckDispatch`: عند انتهاء القفل →
  - إن وُجد `clickOrderRef` وشركة Click: قراءة **getorder** للقراءة فقط؛ إن أكدت وجود الشحنة → `sent` (بلا بوليصة مُختلقة)؛ وإلا →
  - `needs_review` مع رسالة «لا تُعد الإرسال».
  - **لا استدعاء setorder إطلاقًا**.
- المُجدوِل يستدعي الاستعادة لأي طلب `sending` منتهي القفل، وزر «تحقق من نتيجة الإرسال» متاح في الواجهة.

---

## 3. الملفات المعدلة

**Backend**
- `functions/src/index.js` — `resolveOrderPage`, `payloadHash`, `resolveOrderCompany`, `settings.defaultCompanyId`, `recoverStuckDispatch` + المُجدوِل، حجز `nextClickSyncAt` عند الإرسال.
- `functions/src/pages.js` — `manage()` على `listPages`/`pageStats`، وتقليص `listAllowedPages`.
- `functions/test/emulator/pages_permissions.test.js` — 5 اختبارات جديدة (F1/F2/F3/F6).
- `functions/test/emulator/click_reconcile.test.js` — 4 اختبارات جديدة (F7).
- `functions/test/{operational_readiness,first_internal_deploy}.test.js` — تحديث عدد الدوال (48).

**Frontend**
- `lib/core/page_logo.dart` (جديد) — خدمة اختيار/تصغير الشعار.
- `lib/live/live_pages.dart` — منتقي شعار + معاينة.
- `lib/live/live_orders.dart` — الشركة الافتراضية + رسالة برقم الطلب.
- `lib/live/live_app.dart` — `onSaved → dashboard`.
- `lib/live/live_settings.dart` — الشركة الافتراضية.
- `lib/live/live_order_journey.dart` — زر «تحقق من نتيجة الإرسال».
- `lib/live/gateway.dart` — `settings()`, `recoverStuckDispatch()`.
- `pubspec.yaml` — إضافة `image_picker`.

**QA**
- `scripts/emulator-preview/browser.cjs` — تأكيد العودة للرئيسية بعد الحفظ.

---

## 4. نتائج الاختبارات

| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **455 ناجح** |
| functions unit | **194 ناجح** |
| functions emulator + rules | **180 ناجح** (منها 41 صفحة/صلاحيات/Click) |
| Playwright Chrome E2E | **21/21 PASS** |
| `readback.cjs` | 21 سيناريو، 0 فشل |
| `join-approval.cjs` | PASS |
| CI `40574709224` | **4/4 jobs خضراء** |

### السيناريوهات السبعة (اختبارات مخصّصة)
1. موظف بـ`managePages` بلا الصفحة → إنشاء مرفوض خادميًا؛ وبعد المنح ينجح. ✅
2. قارئ بلا `managePages` → `listPages`/`pageStats` مرفوضان؛ صاحب الصلاحية يقرأ؛ `listAllowedPages` محدود. ✅
3. تعطيل الشركة الافتراضية/تغييرها/إعادة التحميل. ✅ (خادم + widget)
4. الحفظ → الرئيسية + الرقم + التحديث. ✅ (Playwright + كود)
5. اختيار الشعار/المعاينة/الإزالة + تحقق النوع/الحجم. ✅
6. تكرار المفتاح: نفس البيانات→نفس الطلب؛ بيانات مختلفة→تعارض. ✅
7. توقف بعد الإرسال قبل حفظ النتيجة؛ 503/Timeout/انقطاع. ✅ (4 اختبارات)

---

## 5. النشر

- **Functions**: 48 دالة منشورة (منها `recoverStuckDispatch`, `listPages`, `pageStats`, `listAllowedPages`, `savePage`).
- **Hosting**: منشور (bundle 4,829,057B، بلا علامات emulator).
- **APK**: `delivery/apk/Velnix-release.apk` — موقّع `CN=Velnix` (SHA-256 `34ced310…b4e321`)، App Check = Play Integrity.
- **Release**: `velnix-v0.7.1-ui-polish` مُحدَّث بالأصول الجديدة.
- تحقق حي: `listPages`/`pageStats`/`recoverStuckDispatch`/`listAllowedPages` تُرجع 401 بلا مصادقة (منشورة + App Check).

---

## 6. قيود غير محسومة

- **Android UI على جهاز حقيقي**: لم يُوصَل جهاز في هذه الجولة؛ APK مبني وموقّع، واختبار منتقي الصور (image_picker) على Android يحتاج جهازًا.
- **Click الحي**: بلا شحنات حقيقية؛ السيناريوهات بـ Mock/Emulator كما هو مطلوب؛ لم تُغيَّر عقود Click.
