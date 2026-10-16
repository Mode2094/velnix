# Velnix — المرحلة الثانية: بوابة اعتماد نشر Web Hosting

**التاريخ:** 2026-10-16
**الفرع:** `audit/production-readiness`
**مشروع Firebase:** `velnix-6c1a2`
**التقرير:** ⏸️ **بانتظار موافقة صريحة — لم يُنشر شيء**

> ⛔ **لم يُنفَّذ أي نشر.** لم تُعدّل أي مورد سحابي. هذه الوثيقة تطلب موافقتك على إصدار Hosting محدّد بالـSHA والبصمات المذكورة أدناه.

---

## 1. الـSHA المعتمد

| البند | القيمة |
|---|---|
| خط الأساس المطلوب | `e8992d6fd11f32b2197449ab89d7168cb90dc043` |
| **الـSHA المحلي** | `e8992d6fd11f32b2197449ab89d7168cb90dc043` ✅ مطابق |
| **الـSHA البعيد** | `e8992d6fd11f32b2197449ab89d7168cb90dc043` ✅ مطابق |
| شجرة المتتبَّع | **نظيفة** عند البناء |
| `main` | `0d10904ff6109096c0b361f2fca8719042160a1c` — لم يُمس |

**البناء أُنتج من شجرة نظيفة عند الـSHA المعتمد بالضبط.**

---

## 2. معرّف موقع Hosting

| البند | القيمة |
|---|---|
| Hosting Site ID | **`velnix-6c1a2`** |
| Default URL | `https://velnix-6c1a2.web.app` |
| العنوان البديل | `https://velnix-6c1a2.firebaseapp.com` |
| App ID | `1:948196868655:web:ace9b264b4fae48ac43cda` |
| Project Number | `948196868655` |
| Display name للتطبيق | `Velnix Web` |

---

## 3. بصمات حزمة النشر (Build Artifact Checksums)

**مجلد النشر:** `build/web` — **41 ملفاً**

| الملف | SHA-256 |
|---|---|
| `build/web/main.dart.js` | `754eedf3462c026c1d42809f82695ce536c744c5b2180fee932d0d805e341378` |
| `build/web/index.html` | `87a741eb859ea30b84d11d9dbb447334a5c181a212624d2f813216295d0fb041` |
| `build/web/assets/FontManifest.json` | `e17c482ea05994c18a552b6d9595336cb538ac839418e3a0e530b8868f83fa52` |

**بصمة الحزمة الكاملة (41 ملفاً):**
```
d14e58425d5c9ac0815c7a239bf1a8d2896ef2b643c92b84685d42772863500b
```
*(SHA-256 قائمة الملفات مرتّباً + بصمة كل ملف)*

> هذه البصمة هي **هوية الإصدار**. إذا اختلف أي شيء عند النشر، يجب **إيقاف وطلب موافقة جديدة**.

### أمر البناء المستخدم (حرفياً)

```bash
flutter build web --release --no-web-resources-cdn --no-wasm-dry-run \
  --dart-define-from-file=config/firebase.stage3.production.public.json
```

---

## 4. نتائج الفحص السحابي للقراءة فقط (Read-Only Cloud Preflight)

جميع الفحوص **قراءة فقط**، عبر جلسة `gcloud` مصرَّح بها ومستخدم `moderohe8@gmail.com`. **لم تُغيَّر أي خدمة ولم يُفعَّل أي Google Cloud API جديد.**

| # | الفحص | النتيجة | الدليل |
|---|---|---|---|
| B1 | مشروع Firebase موجود | ✅ **PASS** | `velnix-6c1a2` / projectNumber `948196868655` |
| B2 | تطبيق Web مسجَّل | ✅ **PASS** | `1:948196868655:web:ace9b264b4fae48ac43cda` — «Velnix Web» |
| B3 | **هل Hosting منشور؟** | ❌ **FAIL — غير منشور** | كلا النطاقين يعيدان **HTTP 404 «Site Not Found»** |
| B4 | موقع Hosting في سجل المشروع | ✅ **PASS** | Site ID `velnix-6c1a2` |
| B5 | مزوّد Google للمصادقة | ✅ **PASS** | `google.com` `enabled: true` + `clientId` موجود |
| B6 | **Authorized domains** | ✅ **PASS** | `velnix-6c1a2.web.app` ✅ · `velnix-6c1a2.firebaseapp.com` ✅ · `localhost` |
| B7 | تسجيل App Check للتطبيق | ⚠️ **UNVERIFIED** | `firebaseappcheck.googleapis.com` غير قابل للوصول من هذه الشبكة (404). لم يُبلَّغ عنه كـPASS |
| B8 | مفتاح reCAPTCHA Enterprise | ✅ **PASS** | `displayName: velnix` · `integrationType: SCORE` · `allowAllDomains: false` |
| B9 | **قيود المضيف على المفتاح** | ⚠️ **تحذير حرج** | `allowedDomains = ["velnix-6c1a2.web.app"]` فقط — انظر §5 |
| B10 | الدوال المنشورة | ✅ **PASS** | **23** دالة: **22** في `europe-west1` + **1** `orderEventNotice` في `us-central1` |
| B11 | مطابقة السجل للمستودع | ✅ **PASS** | مجموعFunctions المنشورة == `config/first-internal-deploy.json` تماماً |
| B12 | حساب تشغيل الخدمات | ✅ **PASS** | `velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com` |
| B13 | `VELNIX_KMS_KEY` | ✅ **PASS** | المفتاح **مضبوط** (القيمة لم تُقرأ) |
| B14 | مكان Firestore | ✅ **PASS** | `nam5` |
| B15 | **فهارس رحلة GM** | ✅ **PASS** | `firstAcceptanceIndexesReady: true` — الفهرسان المطلوبان READY |
| B16 | عضوية المدير العام | ✅ **PASS** | 1 عضو: `role=generalManager`, `active=true`, `approvalStatus=approved` |
| B17 | حالة bootstrap | ✅ **PASS** | `settings/bootstrapState` موجود · سجل تدقيق واحد `member.google_bootstrap` |
| B18 | عدد مستخدمي Auth | ℹ️ **1** | لا يوجد أعضاء جدد |
| B19 | طلبات الانضمام | ℹ️ **0** | لا طلبات معلّقة |

### 4.1 ملاحظات منهجية

- فحوص Firestore وApp Check نُفِّذت عبر سكربتات المستودع للقراءة فقط
  (`probe_first_deploy_indexes.js`, `read_cloud_inventory.js`) بعد فشل REST المباشر من هذه الشبكة.
- الفهارس: الفهرسة العامة أظهرت **2 فهارس READY** وهي بالضبط المطلوبتان لرحلة القبول الأولى.
  (طلبات `pageSize` لكل مجموعة أظهرت 400 — عيب في الطلب، لا في الفهرسة؛ التغطية الكلية نجحت.)
- **Firestore `firestore.indexes.json` يحتوي 109 مدخلاً، لكن المنشور على المشروع هو 2 فقط.**
  هذا كافٍ لرحلة GM المحدودة، و**غير كافٍ** للرحلات الأوسع.

---

## 5. ⚠️ المخاطر غير المحلولة (Unresolved Risks)

### R1 — حرج: `firebaseapp.com` لن يعمل

| العنصر | القيمة |
|---|---|
| مفتاح Enterprise يسمح بـ | `velnix-6c1a2.web.app` **فقط** |
| كل الـcallables تستخدم | `enforceAppCheck: true` |
| **النتيجة** | على `https://velnix-6c1a2.firebaseapp.com` لن يُصدر reCAPTCHA Enterprise رمزاً ⇒ App Check يفشل ⇒ **التطبيق معطّل كلياً** |

**التوصية:**
- ✅ استخدم **`https://velnix-6c1a2.web.app`** حصراً.
- أو أضف `velnix-6c1a2.firebaseapp.com` إلى `allowedDomains` في مفتاح Enterprise (**تغيير سحابي — يتطلب موافقة منفصلة**).

### R2 — App Check لم يُثبت على نطاق حقيقي

تسجيل App Check للتطبيق **UNVERIFIED**. الدليل غير المباشر قوي (مفتاح Enterprise موجود ومقيَّد بالمضيف الصحيح)، لكنه **ليس إثباتاً**. التحقق الحقيقي يحدث **بعد** النشر (§8).

### R3 — Firestorenotin list

قائمة الفهارس الكاملة غير قابلة للقراءة من هذه الشبكة؛ تم التحقق من الفهرسين المطلوبين فقط عبر سكربت المستودع.

### R4 — النشر الأول لم يُختبر

هذا **أول نشر ناجح** لـHosting في تاريخ المشروع. محاولات Cloud Shell السابقة فشلت بسبب غياب مجلد البناء.

### R5 — بوابة فوترة Blaze مفعّلة

المشروع على Blaze. نشر Hosting ثابت التكلفة تقريباً، لكن **لا يمكن ضمان صفر تكلفة** على مستوى المشروع ككل.

---

## 6. نتائج البناء الإنتاجي

### 6.1 الإعدادات (دون طباعة المحتوى)

| المتطلب | القيمة | النتيجة |
|---|---|---|
| `VELNIX_MODE` | `live` | ✅ PASS |
| `VELNIX_ENVIRONMENT` | `production` | ✅ PASS |
| `VELNIX_GOOGLE_ENABLED` | `true` | ✅ PASS |
| `VELNIX_PUSH_ENABLED` | `false` | ✅ PASS |
| `VELNIX_DEBUG_APPCHECK` | `false` | ✅ PASS |
| `FIREBASE_PROJECT_ID` | `velnix-6c1a2` | ✅ PASS |
| `FIREBASE_APP_ID` | تسجيل `1:948196868655:web:…` | ✅ PASS |
| مفتاح API | صيغة `AIza`+35 | ✅ PASS |
| Sender ID | `948196868655` | ✅ PASS |
| Auth domain | موجود | ✅ PASS |
| مفتاح App Check Enterprise | موجود (40 محرفاً) | ✅ PASS |
| الملف مُتجاهَل في Git | نعم | ✅ PASS |

**الفحص الرسمي:** `Public configuration preflight passed` ✅

### 6.2 محتوى الحزمة المُصرَّف

| الفحص | النتيجة |
|---|---|
| المشروع `velnix-6c1a2` داخل الحزمة | ✅ PASS |
| تسجيل Web الصحيح | ✅ PASS |
| مفتاح Enterprise مدمج | ✅ PASS |
| مزوّد Enterprise | ✅ PASS |
| منطقة `europe-west1` | ✅ PASS |
| لا مشروع demo | ✅ PASS |
| لا `useEmulators` | ✅ PASS |
| لا منافذ محاكي | ✅ PASS |
| `VELNIX_MODE` مُثبَّت وقت الترجمة | ✅ PASS |
| لا مزوّد App Check تصحيحي | ✅ PASS |

**عزل الإنتاج:** `Standard Live artifact contains no emulator-preview markers` ✅

**الحكم على الحزمة: `PRODUCTION-READY`**

---

## 7. أثر النشر المتوقع

### 7.1 ما سيتغيّر

| المورد | التأثير |
|---|---|
| Hosting `velnix-6c1a2` | **نشر أول إصدار.** `https://velnix-6c1a2.web.app` سيبدأ يخدم التطبيق |

### 7.2 ما لن يتغيّر إطلاقاً

| المورد | الحالة بعد النشر |
|---|---|
| Functions (23) | **بلا تغيير** — لا نشر Functions |
| قواعد Firestore | **بلا تغيير** |
| الفهارس | **بلا تغيير** |
| Storage / Database | **بلا تغيير** |
| App Check التسجيل | **بلا تغيير** |
| IAM / حساب التشغيل | **بلا تغيير** |
| المدير العام | **بلا تغيير** |
| Auth / المزوّدون | **بلا تغيير** |
| Scheduler / Push | **بلا تغيير** |

### 7.3 إثبات الاحتواء

`firebase.hosting.json` يحتوي **مفتاحاً واحداً فقط** — `hosting`:

```
top-level keys: ['hosting']
site   : velnix-6c1a2
public : build/web
rewrites: ** -> /index.html
targets: (none) -> الموقع الافتراضي فقط
```

**غير موجود:** `functions` · `firestore` · `storage` · `database` · `extensions` · `emulators` · `remoteConfig` · `projectAliases`

⇒ `--only hosting` مع هذا الملف **لا يمكنه** نشر أي مورد آخر.

---

## 8. التكاليف المحتملة على Blaze

| البند | التكلفة المتوقعة |
|---|---|
| استضافة 41 ملفاً (~8 MB) | هامشية |
| التخزين | هامشي |
| التكلفة على مستوى المشروع | **غير مضمونة الصفر** — الفواتير على مستوى المشروع |

**التوصية:** راجع تنبيهات ميزانية GCP قبل النشر، واضبط حدّ إنذار.

---

## 9. نتائج CI ذات الصلة

| التشغيل | SHA | النتيجة |
|---|---|---|
| Push CI `38933957464` | `e8992d6fd1` | ✅ **success** |
| PR CI `38933963165` | `e8992d6fd1` | ✅ **success** |

**وظائف CI الأربع في كليهما:** `flutter` · `firebase` · `android` · `emulator-ui` — كلها ✅

**CI على Linux أخضر ⇒ إخفاقات الـ18 golden خاصة بـmacOS فقط، ومثبتة آلياً.**

> بعد دفع وثائق هذه المرحلة سيُطلب CI جديد على الـSHA الجديد. **لن أنشر إلا بعد نجاحه.**

---

## 10. تعليمات التراجع (Rollback)

Hosting **أسهل** مورد في المشروع تراجعاً — ملفات ثابتة بلا قاعدة بيانات.

| الخطوة | الإجراء |
|---|---|
| 1 | احتفظ بـrelease manifest أعلاه (SHA + بصمات) |
| 2 | **قبل أول نشر:** التراجع = تعطيل أو حذف الإصدار المنشور |
| 3 | بعد إصدارات متعددة: `firebase hosting:clone <source> <targetChannel>` لإرجاع إصدار سابق |
| 4 | ⚠️ Hosting لا يتراجع عن **قاعدة بيانات** — Firestore لا يتراجع |
| ⚠️ | ⚠️ لا Functions ولا قواعد ولا فهارس في هذا الإصدار — لذا **لا أثر للتراجع عليها** |

**الخطر في هذا الإصدار ≈ صفر** لأن Hosting ثابت ولا يحمل بيانات.

---

## 11. ⏸️ بوابة الموافقة

### الأمر الذي **سيم** تنفيذه بعد موافقتك (وليس قبلها)

```bash
cd <velnix-repo>
functions/node_modules/.bin/firebase deploy \
  --project velnix-6c1a2 \
  --account moderohe8@gmail.com \
  --config firebase.hosting.json \
  --only hosting \
  --non-interactive
```

**نطاق هذا الأمر: Hosting فقط.** لن ينشر Functions ولا قواعد ولا فهارس ولا أي مورد آخر.

### ⛔ لن أفعل ما يلي تحت هذا التصريح

- نشر Functions أو قواعد Firestore أو الفهارس
- تغيير IAM أو حساب التشغيل
- تعديل أو إعادة اعتماد المدير العام
- تفعيل Push أو Scheduler
- إضافة نطاقات إلى مفتاح Enterprise
- التواصل مع Click Delivery

### شرط إيقاف

إذا اختلف الـSHA أو بصمة الحزمة عن القيم في §1 و §3 — **أوقف واطلب موافقة جديدة**.

---

## 12. ما يحدث بعد النشر (بالترتيب)

1. تأكيد نجاح النشر ومُعرّف الإصدار/الإصدار
2. تأكيد استجابة HTTPS وبدء تطبيق Flutter
3. التحقق من إعدادات المشروع والتطبيق
4. **تسجيل Google حقيقي** من نطاق Hosting الرسمي — **بموافقتك التفاعلية**
5. **إصدار رمز App Check Enterprise حقيقي** عبر SDK — دون كشف الرمز
6. **جلسة GM الحالية**: العضوية والدور المعتمد
7. التأكيد أن الـcallables المحمية للقراءة تعمل
8. **signed-out و App Check غير الصالح يفشلان مغلقين (fail-closed)**

**لن يُنشأ أي طلب تلقائياً أثناء اختبار الدخان.** procedure القبول الداخلي للطلب الصناعي الواحد يبقى **خطوة منفصلة تُعتمد لاحقاً**.

---

## 13. قرار مطلوب من المالك

| # | القرار | الحالة |
|---|---|---|
| 1 | **الموافقة الصريحة على نشر Hosting وحده** لهذا الـSHA وهذه البصمات | ⏸️ **بانتظارك** |
| 2 | استخدام `web.app` حصراً (R1) | موصى به بشدة |
| 3 | الموافقة على Stage 3 بعد نجاح النشر | لاحقاً |
| 4 | تدوير كلمة مرور Click (من Stage 1) | لم يُنفَّذ |

**لم يُمنح أي تفويض نشر في هذه الجلسة. سأنتظر موافقتك الصريحة قبل تنفيذ §11.**