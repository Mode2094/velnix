# VELNIX — نتيجة النشر النهائي (Firebase DEPLOYED & PASS)

- **المشروع:** `Mode2094/velnix` · **Firebase Project:** `velnix-6c1a2` (رقم المشروع 948196868655)
- **الفرع:** `main` · **الوسم:** `v0.7.0+11` · **applicationId:** `com.mode2094.velnix`
- **حساب التنفيذ:** `moderohe8@gmail.com` · **آخر تحديث:** 2026-11-22

## الحالة: 🟢 DEPLOYED & PASS

> لم تُعلن هذه الحالة إلا بعد نجاح تسجيل الدخول الحقيقي واستجابة الوظائف الأساسية على النظام المنشور.

## 1) الفوترة

| الفحص | النتيجة |
|---|---|
| `billingEnabled` على `velnix-6c1a2` | **true** |
| حساب الفوترة المرتبط | `billingAccounts/01DA46-69544D-9934B7` (مفتوح) |
| نشر Cloud Functions | **متاح** (لا حاجة لأي ترحيل مشروع) |

المشروع الأصلي عاد للعمل — **لم يُنشأ مشروع جديد، ولم يُرحَّل أي بيانات، ولم يُحذف أي شيء**.

## 2) نشر Cloud Functions

- `firebase deploy --only functions --project velnix-6c1a2`: **56 دالة** محدّثة، **0 مُنشأة، 0 محذوفة**.
- استُخدم `--force` **فقط** لتجاوز بوابة سياسة إعادة المحاولة لوظيفتَي `pushNotice` و`orderEventNotice`؛ لم يُحذف أي وظيفة.
- الأسرار محفوظة كما هي: `VELNIX_KMS_KEY` · `VELNIX_RUNTIME_SERVICE_ACCOUNT` · `FIREBASE_CONFIG`.
- الوظيفتان المجدولتان **ENABLED** كل 15 دقيقة: `syncClickStatuses` · `reconcileDeliveryStatuses`.
- Firestore rules نُشرت دون تغيير.

## 3) الاختبار بعد النشر (تسجيل دخول حقيقي)

- تسجيل دخول فعلي عبر Identity Toolkit (حساب اختبار مصرّح به، حُذف بعد الاختبار) + App Check.
- كل الوظائف عادت **200**: `me` · `getSettings` · `listCompanies` · `listMembers` · `listOrders` · `listNotices` · `listAudit` · `listAllowedPages` · `dashboardStats` · `companyStats`.
- **إصلاح عيب مانع للتسليم:** كانت `dashboardStats` ترجع **500 INTERNAL** بسبب غياب فهارس مركّبة لتجميع `sum(amountMinor)`. أُضيفت **44 فهرسًا** إلى `firestore.indexes.json` ونُشرت (المجموع **204 READY**)، وأصبحت جميع متغيّرات لوحة المتابعة ترجع 200.
- حُصرت واجهة طلب اللوحة على أبعادها المعروضة فقط (النطاق الزمني، والشركة/المنشئ عند ورودها) لمنع تسرّب فلاتر القوائم (الصفحة/النوع) إلى التجميع.

## 4) تطابق البيانات

- الطلبات: **5** = **3 داخلية** + **2 توصيل**.
- الطلب `m4WlxZKsRSB7C35tPFy2` بقي `ready` / `dispatchState=needs_review` / `deliveryAccepted=false` — **لم يُعد إرساله**.
- الأعضاء: 12 (5 نشط) · الشركات: 1 (`click_delivery_1603`) · الصفحات: 2.
- لم تُنشأ أي شحنة Click حقيقية، ولم تُعدَّل أي بيانات عميل.

## 5) الاختبارات وCI

- Functions unit: **211/211** · Emulator (rules/auth/click/...) : **304/304**.
- `dart format` نظيف · `flutter analyze` : 0 ملاحظات · `check_secrets` : 0 نتائج (671 ملفًا).
- Flutter unit/widget: **495 ناجح**، وفروق **Golden** بصريًا (25) على macOS فقط لمصادرها المرسومة على Linux (ليست عيبًا برمجيًا؛ CI على Linux يمرّ).
- CI (`Validate Velnix`) على `main`.

## 6) الإصدار والتحقق

- الإصدار الجديد: **0.7.0+11** (versionName 0.7.0، versionCode 11، minSdk 24، targetSdk 36، compileSdk 36).
- التوقيع: `CN=Velnix, OU=Delivery, O=Velnix, L=Amman, C=JO` — SHA-256 للشهادة `6E:57:F9:…:16:01` (نفس مفتاح الإصدار المعتمد، بلا مفتاح جديد).
- APK: v2 موقّع (`Verifies`) · AAB: `jar verified`.

| الأصل | الحجم (بايت) | SHA-256 |
|---|---|---|
| `Velnix-0.7.0+11-release.apk` | 81,050,072 | `e89dab5adcdecdd19eead4fa7e520cca4b9a1089d2d5fe9a7492babf982360cf` |
| `Velnix-0.7.0+11-release.aab` | 73,681,803 | `bddf19b454abd09a112bf868a1ddcf415f0d40f89c65815e67599fc1dde9d0ad` |

## 7) القيود المتبقية

- Click الحي لم يُجرَّب (لم تُنشأ أي شحنة فعلية).
- الطلب `m4Wlx` بقي `needs_review` بلا إعادة إرسال.
- لم يُنشر إلى Google Play (يتطلب موافقة مستقلة).
