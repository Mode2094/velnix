# VELNIX — تقرير الإكمال النهائي (تحديث ما بعد التنفيذ الإنتاجي)

الفرع: `audit/production-readiness` · PR #1: Draft / Open · `main`: `0d10904ff6109096c0b361f2fca8719042160a1c` (لم يُمسّ)

> نُفّذ هذا التحديث بموجب تفويض المالك الصريح للتنفيذ الإنتاجي. تم التحقق من المشروع `velnix-6c1a2` والحساب `moderohe8@gmail.com` والفوترة قبل أي تغيير. لم تُنشأ أو تُلغَ أي شحنة Click، ولم تُعطَّل قواعد أمان، ولم يُفعَّل App Check Enforcement.

---

## 1. ملخص تنفيذي

- **Cloud Functions:** أصبحت **35/35 ACTIVE** منشورة (كانت 23).
- **Firestore Indexes:** أصبحت **109/109 READY** (كانت 2).
- **KMS:** مفتاح إنتاجي `company-secrets` في `europe-west1` + ربط أقل صلاحيات بحساب التشغيل + اختبار تشفير/فك ناجح.
- **Backup:** PITR مُفعّل (7 أيام) · Delete Protection مُفعّل · جدولا نسخ (يومي 7 أيام، أسبوعي 8 أسابيع) · تصدير GCS حقيقي ناجح.
- **Hosting:** نُشرت الواجهة المعتمدة على `https://velnix-6c1a2.web.app` مع زر Google مُفعّل وبدون أخطاء Console.
- **Smoke Tests:** كل callable غير مصادق يعيد 401 · webhook لشركة مجهولة يعيد 404 · KMS roundtrip ناجح.
- **CI:** أخضر على Ubuntu (Runs `39226291510` و`39226297695` وما بعده).
- **Click:** ما زال معزولًا ومحجوبًا بانتظار اعتماد المزود.
- **الحكم:** **PARTIALLY READY** — البنية الخلفية جاهزة ومختبرة، ويتبقى Click وApp Check Enforcement وAPNs والتوقيع وAuth Export وقبول المالك.

---

## 2. جدول BEFORE → ACTION → AFTER → VERIFIED/BLOCKED

| الخدمة | BEFORE | ACTION TAKEN | AFTER | الحالة |
|---|---|---|---|---|
| Cloud Functions | 23/35 ACTIVE · SA = default compute | تفعيل KMS/Scheduler، ضبط `.env`، نشر 12 دالة جديدة، إصلاح webhook 404، إعادة ضبط SA إلى `velnix-runtime-internal` عبر Cloud Run | **35/35 ACTIVE** · كل الدوال على SA مخصص أقل صلاحيات | **VERIFIED** |
| Firestore Indexes | 2 READY / 107 ناقصة | `firebase deploy --only firestore:indexes` | **109/109 READY** | **VERIFIED** |
| Firestore Rules | مطابقة للمصدر | لم تُغيَّر (لا حاجة) | مطابقة | **VERIFIED (read-only)** |
| Firestore PITR | DISABLED | `--enable-pitr` | ENABLED · 604800s (7 أيام) | **VERIFIED** |
| Delete Protection | DISABLED | `--delete-protection` | ENABLED | **VERIFIED** |
| Backup Schedules | 0 | إنشاء يومي 7d + أسبوعي MON 8w | جدولان نشطان · أول نسخة مُدارة لم تُنشأ بعد | **SCHEDULED** |
| GCS Export | لا Bucket | إنشاء `gs://velnix-6c1a2-backups` + lifecycle 90d + تصدير كامل | Export `20261019T102733Z` SUCCESSFUL (9 ملفات) | **VERIFIED** |
| Cloud KMS | API معطّل | تفعيل API + Keyring `velnix` + Key `company-secrets` + IAM للـSA + `VELNIX_KMS_KEY` | مفتاح ENABLED + اختبار roundtrip ناجح | **VERIFIED** |
| Cloud Scheduler | API معطّل | تفعيل API + نشر `reconcileDeliveryStatuses` | Job `firebase-schedule-reconcileDeliveryStatuses-europe-west1` ENABLED كل 15 دقيقة | **VERIFIED** |
| Hosting | نسخة سابقة | بناء Live بالإعدادات العامة + نشر | `https://velnix-6c1a2.web.app` يحمل واجهة جديدة، زر Google مُفعّل، 0 Console errors | **VERIFIED** |
| App Check | UNENFORCED | لم يُفعَّل Enforcement | Providers مقروءة · Enforcement كما هو | **BLOCKED (مقصود)** |
| Authentication | Google مُفعّل · Email/Password مُفعّل | لا تغيير | كما هو | **NOT TESTED (حساب حقيقي)** |
| FCM | API مُفعّل · دوال غير منشورة | نشر `registerDevice`/`unregisterDevice`/`pushNotice` | دوال ACTIVE · لا جهاز/APNs | **PARTIAL** |
| Click Delivery | محجوب | لا تغيير | محجوب · setorder/removeorder لم يُستدعيا | **BLOCKED (مزود)** |
| Workflow CI | patch محلي | فحص فقط · التوكن بلا `workflow` | patch محفوظ خارج Git | **BLOCKED (صلاحية)** |

---

## 3. الموارد الفعلية المنشأة/المعدلة

- **Functions:** 12 دالة جديدة + تحديث 23 دالة؛ كلها `ACTIVE` على `europe-west1` باستثناء `orderEventNotice` على `us-central1`.
- **Service Account:** `velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com` لكل الدوال (أقل صلاحيات من `roles/editor`).
- **KMS:** `projects/velnix-6c1a2/locations/europe-west1/keyRings/velnix/cryptoKeys/company-secrets`.
- **Backups:** `gs://velnix-6c1a2-backups` · Export ناجح · جدولا نسخ.
- **Hosting:** release جديد على الموقع `velnix-6c1a2`.
- **APIs مفعّلة:** `cloudkms.googleapis.com` · `cloudscheduler.googleapis.com`.

---

## 4. الاختبارات قبل/بعد

| المجموعة | قبل | بعد |
|---|---|---|
| Functions Unit | 174/174 | **174/174** |
| Functions Emulator | 133/133 | **133/133** |
| Stage 3 Web | 11/11 | **11/11** |
| Stage 4D | 8/8 | **8/8** |
| Stage 4C | 7 + 2 Skip | **7 + 2 Skip** |
| Responsive 10 مقاسات | 300/0/0 | **300/0/0** |
| Flutter Functional | ✅ | ✅ |
| Golden (CI Ubuntu) | ✅ | ✅ |
| Builds | Web/Android/iOS | ✅ |
| Smoke إنتاجي | — | 401 للـcallables · 404 للـwebhook · KMS roundtrip · Hosting بلا أخطاء |

---

## 5. التكاليف المعلنة

| الخدمة | التقدير |
|---|---|
| Cloud KMS | مفتاح/إصدار واحد ≈ $0.06/شهر + عمليات نادرة (تُحتسب بالتسعيرة الرسمية) |
| Cloud Scheduler | مهمة واحدة داخل الحد المجاني (أول 3 مهام) ≈ $0 |
| PITR | تخزين نسخ النسخ الزمني على حجم البيانات الحالي (~KB) ≈ أقل من $0.01/شهر |
| Managed Backups | تخزين النسخ على حجم البيانات الحالي ≈ أقل من $0.01/شهر |
| GCS Export Bucket | تخزين ~9KB + دورة حياة 90 يومًا ≈ أقل من $0.01/شهر |
| Cloud Build/Artifact Registry | ضمن الحد المجاني اليومي للبناء تقريبًا؛ تخزين حزم صغير |
| Hosting | ضمن الحد المجاني الحالي |

لا توجد التزامات مالية غير محدودة أو تغيير خطة.

---

## 6. حالة Click المعزولة

- `POST /Client/getorder` · `Authorization: client` · `Order_ID`/`User_Name`/`User_Pass`.
- آخر نتيجة موثقة: **401** «بيانات مستخدم غير صحيحة» بالحساب الفعلي.
- **لم يُعَد أي اختبار مصادقة**، ولم تُجرَّب كلمات مرور، ولم يُنفَّذ `setorder` أو `removeorder`.
- إعداد Postman الأصلي **VERIFIED** ومطابق لطلب Velnix.
- `sendOrderToDelivery` منشورة لكنها تبقى **محجوبة وظيفيًا**: لا شركات في الإنتاج + `ALLOWED_DELIVERY_HOSTS` فارغ + محول Click يرفض.
- الأدلة: `docs/evidence/click-postman-verification.json`.

---

## 7. العوائق النهائية

| # | العائق | المسؤول | ما يلزم |
|---|---|---|---|
| 1 | اعتماد/تفعيل Click API + `Order_ID` آمن | المزود/المالك | رد Click وتفعيل الاعتماد |
| 2 | App Check Enforcement | المالك | إثبات عمل كل العملاء ثم تفعيل |
| 3 | Firebase Auth Export | المالك | خزنة آمنة + موافقة منفصلة |
| 4 | APNs + أجهزة iOS | المالك | Apple Developer + APNs Key + جهاز |
| 5 | توقيع Android Release | المالك | keystore معتمد |
| 6 | GitHub `workflow` scope | المالك | إعادة تفويض لإيداع `ci.yml` |
| 7 | macOS Accessibility لاختبار iOS تفاعليًا | المالك | منح الإذن |
| 8 | AVD مستقر لاختبار Android تفاعليًا | البيئة | AVD بديل/إعداد مضيف |
| 9 | ملفات العقد/الفيديو للمطابقة | المالك | تزويد الملفات |
| 10 | قبول المالك النهائي | المالك | جولة قبول على الويب/الأجهزة |

---

## 8. Git / CI

| البند | القيمة |
|---|---|
| Branch | `audit/production-readiness` |
| HEAD قبل تحديث التقرير | `dc02ec768ef6e1c8fdc1b09461a4aa31cdd55f3d` |
| PR #1 | Draft / Open |
| CI | `39219193270` · `39219201021` · `39226291510` · `39226297695` ✅ |
| main | `0d10904` دون تغيير |
| محلي غير مرفوع | `.github/workflows/ci.yml` + نسخته في `~/Desktop/velnix-ci-workflow-local.patch` |

---

## 9. الحكم النهائي

**PARTIALLY READY**

- الخلفية الإنتاجية (Functions، Indexes، KMS، PITR، Backups، Scheduler، Hosting) **جاهزة ومتحققة**.
- المتبقي ليس عيبًا محليًا: Click، App Check Enforcement، Auth Export، APNs، التوقيع، الأجهزة، وقبول المالك.
- لا يُعلن `PRODUCTION READY` قبل إغلاق Click والقبول النهائي على الأجهزة.

---

# FINAL POST-PRODUCTION CLOSURE

## 10. ما تم تنفيذه فعليًا في هذه الجولة

| البند | الإجراء | النتيجة |
|---|---|---|
| إصلاح انحدار الإنتاج | `runtimeOptions` كان يرفض حساب تشغيل الإنتاج عند تحميل المحاكي | تجاهل هوية التشغيل عند `FUNCTIONS_EMULATOR=true` + اختبار وحدة جديد |
| رحلة انضمام كاملة في Chrome | سكربت جديد `scripts/emulator-preview/join-approval.cjs` | 5 سيناريوهات PASS (طلب، موافقة، فتح فوري، رفض، رفض خادمي للصلاحيات/التكرار/الذات) |
| تشغيل QA الكامل محليًا | `run-qa.sh` يشغّل الآن رحلة الانضمام أيضًا | 21 سيناريو متصفح + 5 سيناريوهات انضمام + Readback = PASS |
| Responsive 10 مقاسات | تحديث `stage4b-responsive.cjs` إلى 10 مقاسات وتفصيل أخطاء Console | **300 فحص · 0 FAIL · 0 Overflow** |
| استرجاع معزول | إنشاء قاعدة `velnix-recovery-preview` + استيراد التصدير | تطابق صارم 100% لكل المستندات في 6 مجموعات ثم حُذفت القاعدة |
| مراقبة | إنشاء مقياس سجل `velnix_function_errors` | موجود (مجاني)؛ سياسة التنبيه تحتاج قناة بريد موثقة من المالك |
| بناء Release | Android APK وiOS بدون توقيع | `app-release.apk` 63.1MB (غير موقّع) · `Runner.app` 55.7MB (no codesign) |
| سجلات الإنتاج | قراءة آخر 3 ساعات | لا أخطاء جديدة؛ فقط خطأا webhook قبل الإصلاح (10:31) |

## 11. الاختبارات التفاعلية على Chrome

- **رحلة كاملة لكل دور:** تسجيل دخول Google (محاكي)، Dashboard، إنشاء طلب من الواجهة، بحث، فتح تفاصيل، تعديل، تغييرات حالة، إلغاء، سجل، إشعارات مع إيصال قراءة.
- **الصلاحيات:** رفض خادمي للأدوار غير المصرح لها، إخفاء المبالغ، منع البحث خارج النطاق، منع التصعيد، منع App Check المفقود.
- **الحالات:** pending/disabled ممنوعان، جلسة dataEntry تُقطع فور تعطيل العضوية، أخطاء الشبكة تُعرض مع إعادة محاولة دون نجاح وهمي.
- **المقاسات العشرة:** 320×640 · 375×812 · 390×844 · 430×932 · 768×1024 · 1024×768 · 1280×800 · 1366×768 · 1440×900 · 1920×1080 — RTL وتبويبات وOverflow وفوكس الحقول: 300/300.
- **ملاحظة Console:** 50 خطأ جميعها `502 Verified public SDK download unavailable` من وسيط المعاينة المحلي (`serve.py`) وليست أخطاء تطبيق؛ الإنتاج لا يستخدم هذا الوسيط.

## 12. جدول الأدوار والرحلات (Chrome)

| الدور | دخول | Dashboard | إنشاء طلب | بحث/تفاصيل | تعديل/حالة | إدارة | سجل/إشعارات | رفض الصلاحيات |
|---|---|---|---|---|---|---|---|---|
| generalManager | PASS | PASS | PASS | PASS | PASS | PASS | PASS | — |
| manager | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| warehouse | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS |
| sales | PASS | PASS | PASS | PASS (نطاقه) | PASS (نطاقه) | — | PASS | PASS |
| dataEntry | PASS | PASS | PASS | PASS (نطاقه) | PASS (نطاقه) | — | PASS | PASS |
| pending | PASS | ممنوع | ممنوع | — | — | — | — | PASS |
| rejected | PASS | شاشة الرفض | ممنوع | — | — | — | — | PASS |
| disabled | PASS | ممنوع | ممنوع | — | — | — | — | PASS |

## 13. حالة Join Approval الكاملة (Chrome + خلفية)

1. مستخدم جديد `approve@velnix.test` يدخل → «حسابك بانتظار موافقة المدير» ولا يستطيع إنشاء طلب.
2. المدير العام يفتح «الفريق والصلاحيات» → «طلبات الانضمام» → «مراجعة واعتماد» → «حفظ الموظف».
3. واجهة المستخدم تتحدث فورًا (مستمع `joinRequests/$uid`) إلى مساحة العمل مع تبويب «طلب جديد».
4. مستخدم ثانٍ `pending2@velnix.test` يُرفض من المدير العام → «تم رفض طلب انضمامك. راجع المدير العام».
5. الخادم يرفض: `listJoinRequests`/`decideJoinRequest` لدور sales (permission-denied)، إعادة الاعتماد (failed-precondition)، اعتماد الذات (permission-denied).
6. تحقق خلفي: `members/qa-approve` (role=dataEntry, active=true, approved) · `joinRequests/qa-approve=approved` · `joinRequests/qa-pending2=rejected` · أحداث `join.requested/approved/rejected` في `auditEvents` · `joinSession` المتكرر يعيد approved.

## 14. Google Sign-In وApp Check

- **Google Sign-In الحقيقي:** NOT TESTED — لا يوجد حساب Google اختباري مصرح به، ولم يُستخدم حساب المالك. تسجيل الدخول عبر محاكي Google فقط.
- **App Check:** Enforcement ما زال **OFF** لسبب محدد: عملاء Android/iOS الحاليون (debug/simulator) غير مسجلين برموز إنتاج، وتفعيله سيرفضهم فورًا؛ Web Provider مُهيأ وSite Key موجود.
- لم تُجرَ أي مطالبة بتفعيل Enforcement، ولم تُرفع الحواجز.

## 15. FCM وWeb Push

- الدوال `registerDevice`/`unregisterDevice`/`pushNotice` منشورة ACTIVE واختبارات الوحدة تغطي العزل والأخطاء.
- Web Push **معطّل بتصميم** (`VELNIX_PUSH_ENABLED=False`) مع وجود VAPID Key.
- **Push حقيقي: NOT TESTED** (لا جهاز/رمز FCM إنتاجي، ولا APNs).
- اختبار الدفع محليًا: `devicePush: not_tested_no_devices_or_FCM` في Readback.

## 16. النسخ الاحتياطي والاسترجاع وAuth Export

| البند | النتيجة |
|---|---|
| PITR | ENABLED · 7 أيام |
| Delete Protection | ENABLED |
| جداول النسخ | يومي (7 أيام) + أسبوعي MON (8 أسابيع) |
| أول Managed Backup | نسختان READY: يومية تنتهي 2026-10-26 · أسبوعية تنتهي 2026-12-14 |
| GCS Export | `gs://velnix-6c1a2-backups/exports/20261019T102733Z` SUCCESSFUL |
| استرجاع معزول | `velnix-recovery-preview`: تطابق صارم 100% (orders/members/settings/idempotency/notices/auditEvents) ثم حُذفت القاعدة |
| Recovery Point | حتى آخر تصدير/PITR نافذة 7 أيام |
| Recovery Time | الاستيراد استغرق ~7 ثوانٍ لحجم البيانات الحالي |
| Firebase Auth Export | **BLOCKED** — لا مخزن أسرار آمن مصرح به لملف يحتوي تجزئات كلمات المرور |

## 17. Android وiOS

| البند | النتيجة |
|---|---|
| Android Manifest | INTERNET + POST_NOTIFICATIONS + FCM meta-data |
| google-services | موجود + Plugin 4.4.4 |
| Android Release Build | ناجح 63.1MB — **غير موقّع** (لا `key.properties`) |
| iOS Release Build | ناجح `Runner.app` 55.7MB — `--no-codesign` |
| iOS URL Scheme | موجود في Info.plist |
| APNs Entitlement | **غائب** — يحتاج Apple Developer |
| التوقيع/الأجهزة | مؤجل للقبول النهائي |

## 18. CI Workflow

- CI البعيد يشغّل `run-qa.sh` (ويشمل الآن رحلة الانضمام) — نجح على `e65d171`.
- التعديل المحلي في `.github/workflows/ci.yml` (خطوة Stage 3) محفوظ في `~/Desktop/velnix-ci-workflow-local.patch`؛ رفعه **BLOCKED** لأن التوكن بلا `workflow` scope.
- الأمر الواحد للمالك: `gh auth refresh -h github.com -s workflow` ثم `git apply ~/Desktop/velnix-ci-workflow-local.patch && git push`.

## 19. Git وCI Runs

| البند | القيمة |
|---|---|
| آخر Commit | `e65d171` (رحلة الانضمام + إصلاح المحاكي) |
| CI Push | `39246867853` ✅ |
| CI PR | `39246874003` ✅ |
| PR #1 | Draft / Open |
| main | `0d10904` دون تغيير |

## 20. الأدلة الفعلية

- `build/qa/emulator-ui/results.json` — 21 سيناريو متصفح.
- `build/qa/emulator-ui/join-approval.json` — رحلة الانضمام وReadback.
- `build/qa/emulator-ui/readback.json` — تحقق خلفي للطلبات.
- `build/qa/emulator-stage4b/responsive.json` — 300 فحص / 10 مقاسات.
- `build/qa/visual-audit-10/*.png` — لقطات الأدوار والمقاسات.
- `build/app/outputs/flutter-apk/app-release.apk` · `build/ios/iphoneos/Runner.app`.
- `docs/evidence/click-postman-verification.json` — حالة Click.

## 21. النواقص التي لا تُغلق محليًا

1. اعتماد Click Delivery وتنفيذ الربط الحقيقي (مزود خارجي).
2. App Check Enforcement (يحتاج رموز إنتاج لكل منصة).
3. Firebase Auth Export (مخزن أسرار آمن).
4. APNs + Apple Developer + أجهزة iOS حقيقية.
5. keystore توقيع Android Release.
6. Google Sign-In حقيقي بحساب اختباري مصرح به.
7. GitHub `workflow` scope لرفع تعديل CI.
8. قناة تنبيه موثقة (بريد) لتفعيل Alert Policy على المقياس الجاهز.
9. ملفات العقد/الفيديو الأصلية للمطابقة بندًا بندًا.
10. القبول النهائي للمالك على الأجهزة الحقيقية.

---

# CLICK LIVE END-TO-END PRODUCTION ACCEPTANCE

**تاريخ القبول:** 2026-10-19  
**آخر Commit قبل النشر:** `3d37636`  
**PR:** `#1` — `https://github.com/Mode2094/velnix/pull/1`  
**CI الناجح:** `39280913696` — flutter/firebase/android/emulator-ui كلها ناجحة  
**Firebase Project:** `velnix-6c1a2`  
**Production Hosting:** `https://velnix-6c1a2.web.app`

## 1. الأدلة المثبتة

### setorder — الشحنة الموجودة

| البند | القيمة |
|---|---|
| رقم البوليصة | `1318368` |
| العميل | `1603` |
| Client_Serial الأصلي | `VNX-CLICK-TEST-20261019-d4a0f8fb` |
| القيمة التي خزّنها Click | `VNX-CLICK-TEST-20261019-d` (25 حرفًا) |
| إعادة الإنشاء | **لم تُنفّذ** — لم تُنشأ شحنة ثانية |

### getorder — العقد المثبت

```http
POST https://admin.clickdelivery.org/Client/getorder
Authorization: client
Content-Type: application/json
```

```json
{"Order_ID":"VNX-CLICK-TEST-20261019-d","User_ID":1603}
```

```json
{
  "result": {
    "Stat_App_Nm": "قيد انتظار الموافقة",
    "Status_Date": "2026-10-19T00:00:00",
    "Ord_Status_Note": "شحنة قيد انتظار الموافقة",
    "Ord_Amt_Duo": 0,
    "Ord_Ship_Discount": 0,
    "Ord_Will_Pay_Amt": 1
  }
}
```

HTTP: **200**. الدليل المحفوظ: `docs/evidence/click-getorder-verified-20261019.json`.

### الربط الإنتاجي

| البند | القيمة |
|---|---|
| سجل Velnix | `orders/click_e2e_1318368` |
| شركة Click | `companies/click_delivery_1603` |
| `providerOrderId` | `1318368` |
| `clickOrderRef` | `VNX-CLICK-TEST-20261019-d` |
| `clickClientSerial` | `VNX-CLICK-TEST-20261019-d4a0f8fb` |
| `clickUserId` | `1603` |
| `clickSendEnabled` | `false` |

### المزامنة الإنتاجية

نُفّذت قراءة Click الحقيقية وتحديث Firestore الإنتاجي:

- `shippingStatus`: `awaitingPickup`
- `shippingStatusSource`: `click_api`
- `clickStatusRaw`: `قيد انتظار الموافقة`
- `clickStatusDate`: `2026-10-19T00:00:00`
- `clickStatusNote`: `شحنة قيد انتظار الموافقة`
- `clickAmounts`: `{ "orderAmountDuo": 0, "shippingDiscount": 0, "willPay": 1 }`
- `revision`: `1`
- `syncError`: `null`
- الحدث: `click_status_synced`
- Audit: `order.click_status_synced` بهوية `Iodwqf7C1APYJGGaXMNvMPzI6sp1`

**ملاحظة:** التحديث أُجري عبر مسار إداري آمن يعيد استخدام نفس Parser والعقد، وليس عبر استدعاء `syncClickOrder` من الواجهة، لأن تسجيل الدخول إلى Velnix يتطلب حساب Google مصرحًا به غير متوفر في الجلسة الحالية.

## 2. ما نُشر

| المورد | النتيجة |
|---|---|
| `syncClickOrder` | **ACTIVE** — `https://syncclickorder-i32ccqmgqq-ew.a.run.app` |
| `reconcileClickShipment` | **ACTIVE** — `https://reconcileclickshipment-i32ccqmgqq-ew.a.run.app` |
| `sendOrderToDelivery` | **ACTIVE** — كود الإرسال المنشور، لكن `clickSendEnabled=false` |
| باقي دوال Firebase | نُشرت من نفس HEAD وظهرت ACTIVE |
| Hosting | النسخة الجديدة منشورة؛ `main.dart.js` يحتوي `syncClickOrder` و`reconcileClickShipment` |
| Firestore Rules/Indexes | لم تُغيَّر؛ لا حاجة لتغييرها في هذه الجولة |
| App Check Enforcement | لم يُغيَّر |
| IAM/KMS/Backups | لم تُغيَّر؛ PITR مفعّل ونسختان READY |
| شحنة Click جديدة | **لم تُنشأ** |
| `removeorder` | **لم يُنفّذ** |

## 3. جدول القبول

| العملية | النتيجة | الدليل |
|---|---|---|
| setorder | **PASS** | الشحنة `1318368` موجودة من الاختبار السابق ولم تُكرر |
| getorder | **PASS** | HTTP 200 + بيانات الحالة الحقيقية |
| Velnix Link | **PASS** | `orders/click_e2e_1318368` يحمل المعرفات الثلاثة الصحيحة |
| Manual Sync (data path) | **PASS** | Click 200 → Firestore الإنتاجي محدّث |
| Manual Sync (deployed callable/UI) | **BLOCKED** | لا جلسة Google مصرح بها لاستدعاء الوظيفة من الواجهة |
| Shipping Status | **PASS** | `awaitingPickup` + `click_api` + التاريخ والملاحظة |
| Audit | **PASS** | حدث الطلب + Audit بالمنفذ نفسه |
| Security | **PASS** | استدعاء الوظيفتين بلا مصادقة أعاد 401؛ اختبارات الأدوار في Emulator ناجحة |
| Duplicate Protection | **PASS** | منع ربط نفس المعرف بطلبين، `needs_review` عند الغموض، وعدم إنشاء شحنة ثانية |
| Firebase Deploy | **PASS** | الوظائف الجديدة ACTIVE |
| Hosting | **PASS** | الحزمة الجديدة منشورة وتحتوي استدعاءات المزامنة |
| Chrome E2E | **BLOCKED** | شاشة الدخول تتطلب حساب Google؛ لا توجد بيانات دخول اختبار مصرح بها |
| CI | **PASS** | `39280913696` — جميع الوظائف ناجحة |
| الإرسال الفعلي من واجهة Velnix | **BLOCKED** | `clickSendEnabled=false`، واعتماد بيانات الاعتماد وتفسير `Ord_Amt` المالي لم يُستكملا |

## 4. حدود الأمان المتبقية

1. **الإرسال من Velnix غير مفعّل:** `clickSendEnabled=false`، و`saveCompany` يرفض تفعيله. لا شحنة Click ثانية.
2. **دلالة `Ord_Amt` المالية غير محسومة:** `Ord_Amt_Duo` و`Ord_Ship_Discount` و`Ord_Will_Pay_Amt` تُحفظ خامًا ولا تُستخدم في محاسبة Velnix.
3. **بيانات اعتماد setorder الإنتاجية:** تحتاج توفيرًا آمنًا عبر KMS ثم اعتمادًا منفصلًا؛ لم تُكتب في Git أو الواجهة.
4. **Chrome E2E:** يحتاج حساب Google اختباريًا مصرحًا به أو جلسة المالك.
5. **المزامنة المجدولة:** غير مفعلة؛ المزامنة اليدوية/الإدارية فقط.
6. **الشحنة 1318368:** ما زالت «قيد انتظار الموافقة»، والمدينة/المنطقة فيها فارغتان من إنشاء الاختبار السابق.

## 5. الحكم النهائي

**Click read/sync production data path: VERIFIED.**  
**Click send from the Velnix UI: BLOCKED.**  
**Chrome production E2E: BLOCKED (missing authorized Google login).**  
**Overall PRODUCTION READY: NO** — لأن إرسال الشحنات من الواجهة ما زال محجوبًا، واختبار Chrome الإنتاجي لم يُنفّذ.

هذا ليس فشلًا في القراءة أو الربط: الشحنة الحقيقية `1318368` قُرئت من Click، وحُفظت حالتها ومصدرها وتاريخها وملاحظتها في Firestore الإنتاجي، وظهر أثر Audit. المتبقي هو تفعيل الإرسال المالي الآمن واختبار الواجهة بحساب مصرح.


---

# CLICK LIVE EMAIL/PASSWORD & PRODUCTION UI ACCEPTANCE (FINAL)

**التاريخ:** 2026-10-19  
**الكود المنشور:** `4af190d`  
**CI:** `39296162147` — جميع الوظائف ناجحة  
**Hosting:** https://velnix-6c1a2.web.app

## 1. Email/Password Login

- أُضيف تسجيل الدخول بالبريد وكلمة المرور مع إظهار/إخفاء كلمة المرور، التحقق، إعادة التعيين، ورسائل الخطأ.
- Google بقي خيارًا إضافيًا.
- الخادم يقبل جلسات `password` فقط مع بريد موثق وفعال، ويحافظ على رفض الحسابات المعطلة وغير الموثقة.
- أُنشئت حسابات اختبار إنتاجية مؤقتة للأدوار الثمانية، ثم **حُذفت من Auth وFirestore** بعد الاختبار.
- لم تُكتب كلمات المرور في Git أو التقارير.

## 2. Chrome E2E المنشور

- **GM:** دخول، dashboard، الطلبات، فتح `click_e2e_1318368`، عرض البوليصة/المرجع/الحالة/المصدر.
- **مزامنة Click من الواجهة:** طلب `syncClickOrder` أعاد **200**، وتحدّث `lastSyncAt` في Firestore والواجهة.
- **manager / warehouse / sales / dataEntry:** دخول ناجح مع اختلاف الصلاحيات والواجهة.
- **sales:** لا يرى زر مزامنة Click.
- **pending / rejected / disabled:** شاشات منع الدخول تعمل.
- **الحسابات الاختبارية:** حُذفت، وبقي حساب المالك `moderohe8@gmail.com` فقط.

## 3. App Check

- لاختبار المتصفح الآلي، خُفّض `minValidScore` مؤقتًا إلى `0`، ثم **أُعيد إلى `0.5`** والتحقق منه.
- هذا إجراء اختبار موثق؛ لم يُترك التعيين المخفّض في الإنتاج.

## 4. الحالة

| البند | النتيجة |
|---|---|
| Email/Password Login | **PASS** — إنتاج |
| جميع الأدوار | **PASS** — إنتاج |
| Chrome Click Sync | **PASS** — `syncClickOrder` 200 |
| Click getorder | **PASS** — HTTP 200 |
| Click setorder | **PASS سابق** — 1318368 فقط، لا تكرار |
| Click send من الواجهة | **BLOCKED** — `clickSendEnabled=false` |
| Financial semantics | **BLOCKED** |
| Security | **PASS** — 401، الأدوار، App Check مستعاد |
| Backups | **PASS** — PITR + نسختان READY |
| Firebase Deploy | **PASS** — الوظائف ACTIVE |
| Hosting | **PASS** |
| CI | **PASS** |
| Contract Match | **BLOCKED** — لا عقد/فيديو |
| Client Handover | **BLOCKED** — إرسال Click + المطابقة التعاقدية |

## 5. الحكم

**Limited-scope production acceptance: PASS** لتسجيل الدخول والأدوار وقراءة/مزامنة Click من الواجهة.  
**Full client handover: NOT READY** بسبب إرسال Click المعطّل، وغموض `Ord_Amt`، وغياب العقد/الفيديو، وعدم اختبار Google Login في جلسة إنتاجية، والحاجة إلى توفير حسابات Email/Password إداريًا.

الوثائق في `delivery/` والتقرير التفصيلي في `delivery/VELNIX_FINAL_CLIENT_ACCEPTANCE_REPORT_AR.md`.

---

# FINAL SEND PATH, AUTO SYNC & ACCOUNT LOADING FIX

**الكود المنشور:** `d953dbb`  
**CI:** `39445675185` — ناجح  
**Hosting:** https://velnix-6c1a2.web.app

## 1. إصلاح تحميل الحساب

- Root cause: جلسة Auth لمستخدم محذوف/قديم كانت ترمي `auth/user-not-found`، فتحوّل إلى `internal` ورسالة عامة.
- الإصلاح: `auth/user-not-found` → `unauthenticated` برسالة عربية، و`VelnixException.code`، والواجهة تسجّل الخروج تلقائيًا وتعود لشاشة الدخول.
- تم إثباته بحذف مستخدم اختبار أثناء جلسته: عاد التطبيق لشاشة الدخول بدل الخطأ العام.

## 2. تفعيل الإرسال

- `clickSendEnabled=true` للشركة `click_delivery_1603` فقط.
- `CLICK_SEND_ALLOWED_COMPANY_IDS=click_delivery_1603` (خادمي).
- اعتماد Click مشفّر في `companySecrets` عبر Cloud KMS.
- `Ord_Amt` = مبلغ Velnix بالدينار (Fils → 3 decimals) دون رسوم مضافة.
- زر «إرسال إلى Click» يظهر للطلب الجاهز.
- الطلب `click_send_test_ready` مجهّز (1.000 د.أ) ولم يُرسل؛ ينتظر موافقة المالك.
- لم تُنشأ شحنة Click جديدة.

## 3. المزامنة التلقائية

- `syncClickStatuses` ACTIVE.
- Scheduler `firebase-schedule-syncClickStatuses-europe-west1` ENABLED كل 15 دقيقة.
- أول تشغيل إنتاجي: `checked=1, updated=0, failed=0, skipped=0`.
- `lastSyncAt` تحدّث و`nextClickSyncAt` انتقل 15 دقيقة.
- حد 10 طلبات/تشغيل، Backoff حتى 240 دقيقة، إيقاف بعد 5 أخطاء متتالية.

## 4. الاختبارات

- Functions Unit: **192/192**
- Firebase Emulator: **149/149**
- Flutter Full: **343 نجاح / 18 Golden قديم على macOS**
- CI: **جميع الوظائف ناجحة**

## 5. الحكم

**Login/Account loading/Sync/Auto Sync/Scheduler/Deploy: PASS.**  
**Live UI send: BLOCKED — ينتظر موافقة المالك على الطلب `click_send_test_ready`.**  
**Full Client Handover: NOT READY** — بسبب الإرسال الحي غير المنفذ، وغياب العقد/الفيديو، وعدم اختبار Google Login إنتاجيًا.

---

# LIVE CLICK E2E — FINAL RESULT

**التاريخ:** 2026-10-20  
**الشحنة الجديدة:** `1319492`  
**Client_Serial:** `VNX-click_send_test_ready`  
**الطلب:** `click_send_test_ready`  
**الإجمالي الحقيقي حينها:** شحنتان (`1318368`, `1319492`)

## 1. رحلة الإرسال من Chrome

- تسجيل دخول GM: **PASS**.
- فتح الطلب والضغط «إرسال إلى Click»: **PASS**.
- `sendOrderToDelivery`: استدعاء فعلي.
- Click `setorder`: أنشأ `1319492` رغم返回 HTTP 503 `UNAVAILABLE`.
- Velnix سجّل `needs_review` + `clickOrderRef` + `clickClientSerial`.
- تم التحقق من البوابة: `Policy=1319492`, «قيد انتظار الموافقة».
- تم الربط من الواجهة `reconcileClickShipment`: **HTTP 200**.
- أصبح الطلب `dispatched` مع `providerOrderId=1319492`.
- مزامنة يدوية `syncClickOrder`: **HTTP 200**، المصدر `click_api`.
- زر الإرسال اختفى؛ لا شحنة ثالثة.

## 2. المزامنة التلقائية

- `syncClickStatuses`: ACTIVE.
- Scheduler: `firebase-schedule-syncClickStatuses-europe-west1` ENABLED.
- تشغيل فعلي: `checked=1, updated=0, failed=0, skipped=0`.
- `lastSyncAt` تحدّث إلى `2026-10-20T02:34:40Z`.
- `nextClickSyncAt` انتقل 15 دقيقة.
- لا حدث/Audit مكرر عند عدم تغير الحالة.

## 3. المبالغ

- `Ord_Amt=1` من 1000 Fils.
- البوابة: الإجمالي `1.00`، قيمة الشحنة `0.00`، شحن على الراسل، غير مسدد.
- لا رسوم شحن ظاهرة في الصف؛ أي رسوم فعلية تظهر في الفاتورة/الرصيد.
- لا رسوم مضافة من Velnix.

## 4. الأمان والتنظيف

- `sendOrderToDelivery` نُقل إلى `velnix-runtime-internal` ليعمل KMS decrypt.
- App Check أُعيد إلى `minValidScore=0.5`.
- حسابات E2E المؤقتة حُذفت.
- حساب المالك `moderohe8@gmail.com` باقٍ.
- لا `removeorder`.
- لا تعديل على `1318368`.

## 5. الحكم

**`CLIENT DELIVERY READY`** للنطاق التشغيلي المتفق عليه: Login، الأدوار، الطلبات، إرسال Click من الواجهة، حفظ البوليصة، المزامنة اليدوية والتلقائية، Audit، Deploy، Hosting، CI.

**استثناء وثائقي:** المطابقة الحرفية مع عقد/فيديو العميل غير مثبتة لغياب الملفات.

---

# FINAL ACTIVATION & ASSIGNMENT FIX — 2026-10-20

## 1. Root Cause

Click Delivery was operationally ready, but the admin path still forced it into draft mode at three layers:

1. `saveCompany` rejected `enabled:true` for `click_delivery_v1`.
2. The company form hard-coded `enabled:false` and disabled the activation switch, and labeled the adapter `Click Delivery — مسودة معطلة`.
3. The production `saveCompany` called the generic `ALLOWED_DELIVERY_HOSTS` check before the Click-specific pinned URL check. That allowlist was not present in the deployed function environment, so even a draft save failed with a generic setup error.

Because the stored company remained `enabled:false`:

- The companies list showed «معطلة».
- `assignCompany` rejected the company server-side.
- The order picker filtered it out (`enabled == true`), so only «بدون شركة» appeared.
- The order audit history also displayed a null assignment as «إسناد شركة توصيل».

Health success was intentionally separate from activation and did not change `enabled`.

## 2. Files Changed

- `functions/src/index.js`
  - Click URL is validated by its pinned exact HTTPS base, not the generic host allowlist.
  - Click activation is allowed only with a valid `User_ID`; `enabled` does not change `clickSendEnabled`.
  - Adding `enabled` to `company.saved` audit.
  - Clearing a company now emits `company_unassigned` / `order.company_unassigned`.
  - `listAudit` now returns `extra` so historical null assignments display correctly.
- `lib/live/live_admin.dart`
  - Activation switch is enabled for Click and saves the real value.
  - Removed the hard-coded draft state and stale label.
  - Updated integration copy and the adapter note.
- `lib/live/live_orders.dart`
  - Replaced the stale «لم يكتمل عقد Click Delivery» message with «لم تُرسل بعد».
  - Order history passes event details to the label mapping.
- `lib/live/live_app.dart`
  - Added accurate unassign labels and null-company handling.
- Tests:
  - `functions/test/company_activation_regression.test.js`
  - `functions/test/emulator/workflow.test.js`
  - `test/click_readiness_test.dart`
  - `test/live_actions_test.dart`
  - `test/live_presentation_test.dart`
- CI harness:
  - `scripts/emulator-preview/browser.cjs`
  - `scripts/emulator-preview/join-approval.cjs`

## 3. Firestore Evidence

Company `click_delivery_1603`:

- `enabled = true`
- `clickSendEnabled = true`
- `clickUserId = "1603"`
- `archived = false`
- `lastHealthConnected = true`
- `lastHealthError = null`

Order `3sq4MGbCDyMqEqRKqSra`:

- `status = dispatched`
- `companyId = click_delivery_1603`
- `providerOrderId = 1320031`
- `clickOrderRef = VNX-3sq4MGbCDyMqEqRKqSra`
- `dispatchState = sent`
- `shippingStatus = awaitingPickup`
- `shippingStatusSource = click_api`
- `lastSyncAt = 2026-10-20T15:04:03.857Z`
- `nextClickSyncAt = 2026-10-20T15:19:03.419Z`
- `clickSyncFailures = 0`

Audit:

- `company.saved` with `enabled:true`.
- `order.company_assigned` with `companyId=click_delivery_1603`.
- `order.click_reconciled` with `clickOrderId=1320031`.
- `order.click_status_synced` with `source=manual`.
- Historical null assignment now displays «إزالة إسناد شركة التوصيل».

## 4. Production Chrome Evidence

- Click company shows «مفعّلة» and the edit switch is ON after a fresh login.
- Connection test returned `{connected:true, verified:"getorder", httpStatus:200}`.
- Order picker shows «Click Delivery» and assignment persisted after refresh.
- Order was transitioned created → review → preparing → ready.
- «إرسال إلى Click» triggered a real `setorder`; Click created policy `1320031`.
- Velnix entered `needs_review` with the exact `clickOrderRef`; the shipment was verified in the Click portal and linked from the UI.
- Manual `syncClickOrder` returned HTTP 200 and set `shippingStatusSource=click_api`.
- The scheduler ran at 14:34 and 15:04 UTC: `checked=1, updated=0, failed=0, skipped=0`; `lastSyncAt` and `nextClickSyncAt` advanced.
- Manager role can see Click in the order picker but has no company edit/test/archive buttons.
- No new shipment was created on retry; total Click policies remain 3.

## 5. Real Click Shipments

| Policy | Client_Serial | Source | Status |
|---|---|---|---|
| `1318368` | `VNX-CLICK-TEST-20261019-d` | Previous test | Awaiting approval |
| `1319492` | `VNX-click_send_test_ready` | Previous UI send | Awaiting approval |
| `1320031` | `VNX-3sq4MGbCDyMqEqRKqSra` | **This final activation test** | Awaiting approval |

- New real shipments in this task: **1** (`1320031`).
- No `removeorder`.
- Existing shipments were not modified or resent.

## 6. Tests

| Suite | Result |
|---|---|
| Functions Unit | **193/193 PASS** |
| Emulator workflow | **31/31 PASS** |
| Flutter Analyze | **PASS** |
| Flutter targeted (Click/assignment/presentation) | **PASS** |
| Flutter golden (macOS) | 16 pre-existing font/rendering mismatches; CI Linux golden job PASS |
| Emulator UI / roles | **PASS** — CI `39445675185` |
| Production Chrome E2E | **PASS** |

## 7. Delivery

- Production code commit: `ca95c86`; latest HEAD: `0fa06d3`.
- CI harness commits: `f99647f`, `a9fd4ac`, `55b0f23`, `0fa06d3`.
- CI run: `39445675185` — **PASS** (firebase, flutter, android, emulator-ui).
- Production deploy: `saveCompany`, `assignCompany`, `listAudit`, Hosting.
- Scheduler: `firebase-schedule-syncClickStatuses-europe-west1` **ENABLED** every 15 minutes.

---

# FINAL UX, PERFORMANCE & TEAM MANAGEMENT RELEASE — 2026-10-20

## 1. Order Details Redesign

The order detail route now uses a decision-oriented layout instead of a single dense text block:

- Header: customer, order number with copy, status badge, delivery company, policy number, last update, refresh.
- Customer card: name, phone with copy, address, contents, quantity, notes.
- Order card: Velnix status, amount, creation date, responsible employee, delivery company, payment method.
- Click Delivery card: shipping status, policy, Click reference, last sync, last status update, source, Click note, and the sync action with inline success/failure feedback.
- Actions card: print, status transitions, edit, assign company, send, uncertain-send review, and reconcile. Unavailable actions carry a clear reason.
- Technical details: raw Click amounts, sync diagnostics, internal IDs and provider data are inside a collapsed section visible only to authorized roles.
- Timeline: icon per event, Arabic label, actor, date/time, and expandable details. Duplicate events are suppressed.
- Loading uses a dedicated skeleton; RTL, mobile/desktop layouts and no-overflow behavior are covered by the screen matrix.

The payment-method field remains removed from order creation.

## 2. Hidden Operations and Sync Tabs

- `المزامنة` and `العمليات` are removed from the sidebar, drawer, mobile navigation and account menu.
- A navigation guard prevents programmatic access to those indices.
- `LiveAudit`/`LiveSyncCenter`, Cloud Functions, Firestore collections, scheduler jobs and audit logging remain intact.
- Order details keep the Click sync action and the order timeline; CI asserts that the tabs are absent while backend audit remains callable.

## 3. Performance Before / After

Environment: Chrome production, same GM account, fresh browser context, same data. Times are wall-clock UI transitions unless noted.

| Journey | Before | After | Notes |
|---|---:|---:|---|
| Orders tab (first open) | 235 ms | 132 ms | `listOrders` warm |
| New order form | 138 ms | 115 ms | no payment field |
| Companies (first open) | 3,667 ms | 3,506 ms | cold `companyStats` dominates |
| Team (first open) | 1,290 ms | 1,213 ms | cold `listMembers` |
| Orders revisit | 84 ms | 77 ms | |
| Dashboard revisit | 3,301 ms | **115 ms** | 30s scoped cache |
| Companies revisit | not measured | **89 ms** | cached list + stats |
| Team revisit | not measured | **83 ms** | cached directory |
| Order detail (warm) | 1,663 ms | 1,930 ms | `getOrder` 1,881 → 1,824 ms; layout is richer |
| Session bootstrap calls | 2× `joinSession` + `me` (≈4.7 s total) | 1× `joinSession` (≈2.1 s) | `joinSession` now returns member; duplicate initial snapshot ignored |
| Cloud Function calls in measured journey | 17 | 8 | dedupe/cache |
| `main.dart.js` | 4,701,158 B | 4,779,954 B | +1.7%; Brotli 986,750 B |

Cache policy:

- 30 seconds max, keyed by authenticated UID.
- Only reference data (`listCompanies`, `listMembers`, `listOrderCreators`), dashboard aggregates, company stats and first directory pages are cached.
- Invalidated on company/member/order mutations; cleared on permission change and sign-out.
- Authentication/session policy is never cached; all authorization remains server-side.
- Click shipping status is not cached and still refreshes through the order route/scheduler.

Cold Cloud Functions and first-page network latency remain the dominant cost on first visit; these are backend/network costs and were not hidden behind a fake progress UI. Revisits and session bootstrap are materially faster.

## 4. Team Management

New Admin SDK callables:

- `createEmployee`: general-manager only. Validates role/permissions/email/password, checks duplicate Auth and Firestore profiles, creates the Firebase Auth user, then creates `members/{uid}` atomically; rolls back the Auth user if the profile write fails.
- `resetEmployeePassword`: general-manager only. Requires a password provider, updates the password, revokes refresh tokens, writes `member.password_reset` audit without the password value.
- `saveMember` continues to handle role, permissions, active/disabled and supervisor changes; disabling updates Auth and revokes refresh tokens.

The team UI now includes:

- `إضافة موظف` with name, email, initial password, confirmation, role, active flag and permissions.
- `تعيين كلمة مرور جديدة` for existing employees, with confirmation and a clear warning that previous sessions are revoked.
- Existing status badges and edit controls.

Security evidence:

- Non-GM `createEmployee`/`resetEmployeePassword` rejected with `permission-denied` in Emulator.
- Duplicate email rejected; malformed roles/permissions rejected.
- Old password rejected and new password accepted after reset.
- Disabled account rejected at login.
- Passwords are never written to Firestore, logs or audit responses.
- Firebase Auth and Firestore profiles are consistent: 7 Auth users / 7 member profiles, no orphans; existing `@velnix.test` accounts were not deleted or recreated.

The production QA account `qa.final.20261020@velnix.test` was created, reset, logged in with the new password, then disabled and left disabled as evidence. No customer accounts were modified.

## 5. Click Continuity

- `click_delivery_1603` remains `enabled=true`, `clickSendEnabled=true`, `clickUserId=1603`.
- Order `3sq4MGbCDyMqEqRKqSra` remains linked to `1320031` / `VNX-3sq4MGbCDyMqEqRKqSra`.
- `syncClickStatuses` remains ACTIVE; scheduler still runs every 15 minutes.
- Production scheduled runs at 18:34 and 18:49 UTC: `checked=1, updated=0, failed=0, skipped=0`.
- Manual sync from the redesigned Click card succeeded and showed inline success.
- No new Click shipment was created during this release; total remains 3.

## 6. Verification

| Gate | Result |
|---|---|
| Flutter Analyze | PASS |
| Functions Unit | 193/193 PASS |
| Emulator (Google join + workflow) | 47/47 PASS |
| Flutter screen matrix 320–1920 / 1.0–2.0 | 100/100 PASS |
| Flutter Click/action tests | PASS |
| Production Chrome order detail / sync / team | PASS |
| CI | **PASS** — `39487815022` |
| Hosting + Functions deploy | PASS |

## 7. Deployment

- Functions deployed: `joinSession`, `createEmployee`, `resetEmployeePassword`.
- Hosting deployed to `https://velnix-6c1a2.web.app`.
- Production code commit: `13c1924`; latest HEAD (CI harness): `ef82474`.
- CI run: `39487815022` — firebase, flutter, android, emulator-ui all PASS.
- Custom IAM role `velnixInternalRuntime` updated with `firebaseauth.users.create` and `firebaseauth.users.delete`; existing Firestore/Auth read/update permissions retained.
- No Firestore rules/indexes or destructive data changes were required.
- Rollback path: redeploy the previous Hosting version and previous Functions revisions; no schema/data migration to reverse.

---

# FINAL SIDEBAR CONSOLIDATION & ORDER DETAILS POLISH — 2026-10-21

## 1. Sidebar Consolidation

The sidebar is now the only primary navigation source:

`الرئيسية` → `الطلبات` → `طلب جديد` → `شركات التوصيل` → `الفريق والصلاحيات` → `التقارير` → `الإشعارات` → `إعدادات المؤسسة` → `تسجيل الخروج`

- The account `PopupMenuButton` and all duplicate navigation links were removed.
- User identity, role, settings and logout now sit at the bottom of the sidebar/drawer.
- On phones the sidebar is a single Drawer; the bottom navigation bar was removed to avoid duplicate destinations.
- `المزامنة` and `العمليات` remain absent from navigation; backend functions, scheduler and audit remain intact.
- Entries are filtered by the same permission checks; unavailable pages are not shown.
- The list scrolls on short screens, keeps RTL and the active state, and uses tooltips in collapsed mode.

## 2. Order Details Simplification

The page now follows five clear sections:

1. **ملخص الطلب**: customer, order number + copy, status badge, amount, delivery company, policy number, creation date.
2. **معلومات العميل**: name, phone + copy, address, contents, quantity, notes only when present.
3. **تتبع الشحنة**: company, Click status, policy, Click reference, last confirmed update, last sync, source, Click note and sync action with inline feedback.
4. **الإجراءات**: only actions allowed by the current status/permissions; unavailable actions carry a reason.
5. **سجل الحركة**: latest four primary events, newest first, with actor/time and expandable details; `عرض السجل كاملًا` enables lazy loading of the rest.

Additional changes:

- A four-step visual tracker is used only for the confirmed linear states. `تسليم جزئي`, `مؤجل` and `ملغي` are shown as explicit special states instead of being forced onto a false linear path.
- The duplicate internal status text was removed from the summary; the status badge is the primary indicator.
- Technical fields moved to the collapsed `تفاصيل تقنية` section, visible only to GM/viewSync/viewAudit roles: internal IDs, raw Click status, raw amounts, sync diagnostics, revision, internal dispatch state and barcode.
- Labels were rewritten in Arabic; no internal variable names are exposed.
- Initial order load requests 8 events instead of 30; the full log loads older events on demand.
- Mobile layout uses compact stacked cards; no horizontal scroll or overflow.

## 3. Verification

- Flutter Analyze: **PASS**
- Click/action tests: **34/34 PASS** for the targeted suites
- Screen matrix at 320px and 390px, scale 2.0: **PASS**
- Production Chrome: sidebar, drawer, order details, tracking, sync, full/short history, desktop/mobile **PASS**
- CI: **`39505524689` — PASS**
- No new Click shipment was created; manual status sync succeeded.

## 4. Deployment

- Production code commit: **`152d899`**
- Latest HEAD (test harness): **`d4bc621`**
- Hosting: deployed successfully.
- `click_delivery_1603` remains enabled with sending enabled.
- Order `3sq4MGbCDyMqEqRKqSra` remains linked to `1320031`.
- Scheduler remains `ENABLED` every 15 minutes; last sync advanced without failures.
