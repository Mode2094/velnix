# تشغيل Android APK خارج Google Play — حل Unauthenticated عبر reCAPTCHA Enterprise

**المشروع:** `Mode2094/velnix`
**Firebase:** `velnix-6c1a2`
**Package:** `com.mode2094.velnix`
**تاريخ التنفيذ:** 2026-11-02

---

## 1) الحل المختار: مزوّد reCAPTCHA Enterprise على Android

**القرار:** الانتقال من **Play Integrity** إلى **reCAPTCHA Enterprise** كمزوّد App Check على Android.

**لماذا هو الحل الصحيح:**
- **موثّق رسميًا** من Firebase/Flutter: `AndroidReCaptchaProvider(siteKey)` مدعوم في حزمة `firebase_app_check` (الإصدار 0.4.8 المثبّت لدينا).
- **يعمل دون Google Play ودون Play Console:** مفتاح reCAPTCHA من نوع Android يُربط بـ **اسم الحزمة** (`com.mode2094.velnix`) مع دعم صريح **`supportNonGoogleAppStoreDistribution: true`** للتوزيع خارج المتجر.
- **لا يشترط نشر التطبيق** ولا تسجيله في Play Console خلافًا لـ Play Integrity.
- **لا يعتمد على أي سر ثابت داخل الـAPK:** مفتاح reCAPTCHA **عام** (مثل مفتاح الويب)، والأصالة تأتي من **تحليل مخاطر خادمي قائم على القيمة (score-based)** على سيرفرات Google. لا توجد بيانات اعتماد مخزّنة في التطبيق.

**حالة Preview:** استخدام reCAPTCHA Enterprise على المنصات المحمولة/Flutter **في مرحلة Preview** وفق توثيق Firebase (لا يخضع لـ SLA وقد يتغير بطرق غير متوافقة). أُعلن ذلك بوضوح؛ البديل المستقر (Play Integrity) لا يحقق الشرط غير القابل للتفاوض (تشغيل دون Play).

---

## 2) ما نُفِّذ فعليًا

### أ) على Firebase / Google Cloud (منفّذ ومنسّق)
1. **إنشاء مفتاح reCAPTCHA Enterprise من نوع Android:**
   - الاسم: `projects/948196868655/keys/6LeNIQ0uAAAAAAKWAcejQCpL5b63erSFzS9dOhCB`
   - **siteKey العام:** `6LeNIQ0uAAAAAAKWAcejQCpL5b63erSFzS9dOhCB`
   - مقيّد بالحزمة: `com.mode2094.velnix`
   - `supportNonGoogleAppStoreDistribution: true`
2. **تسجيل المزوّد في App Check لتطبيق Android:**
   - PATCH على `.../androidApps/1:948196868655:android:4465def254bb941ac43cda/recaptchaEnterpriseConfig`
   - النتيجة: `siteKey` مضبوط + `minValidScore: 0.5`.
3. **إبقاء App Check مُفعَّلًا:** لم يُعطَّل enforceAppCheck، ولم يُستخدم Debug Provider.
4. **بصمات الشهادة سليمة ومُنظّفة** (upload `6e57f935…` + Play signing `9bdabcf8…`).

### ب) في كود التطبيق (منفّذ ومُختبر)
- `lib/core/firebase_configuration.dart`:
  - `androidReCaptchaSiteKeyDefault` = المفتاح العام.
  - `usePlayIntegrityOnAndroid(String)` — يحدّد المزوّد.
- `lib/main.dart`:
  - Android يستخدم `AndroidReCaptchaProvider(siteKey)` **افتراضيًا**.
  - Play Integrity يبقى خيارًا صريحًا (`--dart-define=VELNIX_ANDROID_APPCHECK=play_integrity`) لمن يوزّع عبر المتجر.
  - Web يبقى على `ReCaptchaEnterpriseProvider` الحالي بلا تغيير.
- لا تغيير في: Firebase Auth، حسابات الموظفين، صلاحيات Firestore/Functions، وظائف Click، منطق الطلبات.

---

## 3) الأثر الأمني

| البند | Play Integrity (السابق) | reCAPTCHA Enterprise (الجديد) |
|---|---|---|
| يعمل خارج Google Play | لا (بدون ربط Play Console) | **نعم** |
| إثبات أصالة التطبيق | تصنيف Play الرسمي | تحليل مخاطر خادمي (score) + ربط اسم الحزمة |
| سر داخل الـAPK | لا | **لا** (المفتاح عام) |
| App Check مُفعَّل | نعم | **نعم** |
| مناسب لتوزيع مباشر APK | محدود | **مصمَّم له** |

**الخطر المتبقّي:** reCAPTCHA على الموبايل يعطي **درجة تقديرية** وليس ائتمانًا قاطعًا مثل Play Integrity. لذلك:
- `minValidScore = 0.5` (الموصى به) — ليس 0.
- **لا يزال يتطلب** تسجيل دخول Firebase Auth صالحًا + عضوية معتمدة + كل صلاحيات الخادم.
- Engineer/automation محتمل قد يمرر التطبيق لكن **لا يمتلك حساب الموظف**، فتبقى الحماية الفعلية على طبقة المصادقة والتفويض.

الأثر الأمني مقبول ومتجان مع متطلّب "تشغيل دون Play".

---

## 4) الاختبارات

### ما أُثبِت
- **Flutter:** 441 اختبارًا ناجحًا (يشمل اختبارًا جديدًا لمنطق اختيار المزوّد).
- **Functions (وحدات):** 195/195.
- **Firebase Emulator:** 273/273.
- **`flutter analyze`:** نظيف. **`dart format`:** نظيف.
- **بناء APK Release موقّع** ناجح مع المزوّد الجديد.
- **إثبات على إيميوليتور Android (Google APIs + Play Services):**
  - التطبيق أقلع بلا crash.
  - السجل: **`rCEAppCheckProvider: Initializing RecaptchaTasksClient for siteKey: 6LeNIQ0uAAAAAAKWAcejQCpL5b63erSFzS9dOhCB`** — أي أن التطبيق الذي نوزّعه تهيّأ فعليًا على مزوّد reCAPTCHA بالمفتاح الصحيح.
  - خدمة `recaptchabase` المرتبطة كُوِّنت وتهيّأت.
  - المفتاح العام مُدمج في `libapp.so`.

### ما لم يُثبَت — `BLOCKED`
- **تسجيل دخول كامل على جهاز/إيميوليتور بحساب حقيقي:** `BLOCKED` — لا توجد بيانات اعتماد صالحة، وممنوع تعديل/إنشاء حسابات المستخدمين. الإيميوليتور لا يكفي كدليل نهائي على قبول الخادم للرمز بحساب حقيقي.
- **جهاز Android فعلي بالعميل:** `BLOCKED` — غير متاح.

**لذلك لا أعلن PASS نهائيًا لتسجيل الدخول من البداية للنهاية حتى تُجرَّب بحساب حقيقي.**

---

## 5) قيود
- مزوّد reCAPTCHA Enterprise على الموبايل **Preview** (توثيق Firebase).
- التحقق النهائي من قبول الخادم (`app: VALID`) بحساب حقيقي ينتظر اختبارًا ميدانيًا.

---

## 6) الخطوات المطلوبة منك لإكمال التحقق الميداني
1. ثبّت الـAPK الجديد (بعد بنائه) على جهاز Android حقيقي.
2. سجّل الدخول بحساب **مدير عام** وحساب **موظف**.
3. أبلغني بالنتيجة؛ سأتحقق من سجلات الإنتاج أن الطلبات صارت **`app: VALID`**.

*(ملاحظة: بموجب تعليمك السابق "انتظر إعدادات App Check"، أضع الإصلاح في الكود وأجهّز البناء، لكنني أنتظر تأكيدك قبل نشر إصدار جديد.)*

---

## 7) الإغلاق النهائي — CI، الإصدار، والبصمات

### CI
| Commit | الوصف | النتيجة |
|---|---|---|
| `8f9e359` | إصلاح الواجهة (Unauthenticated) | ❌ فشل `emulator-ui` (انحدار اكتُشف وأُصلح) |
| `9ea9a84` | مزوّد reCAPTCHA على Android | ❌ فشل `emulator-ui` (نفس الانحدار) |
| `42fc852` | رفع البناء إلى +9 | ❌ فشل `emulator-ui` (نفس الانحدار) |
| **`2523860`** | **إصلاح انحدار رسائل الجلسة العربية** | **✅ نجاح (4/4 مهام)** |

- **رابط CI النهائي:** https://github.com/Mode2094/velnix/actions/runs/41498230825
- **الإصلاح الجذري للانحدار:** كان `sessionErrorMessage` يرفض رسالة الخادم العربية للتعطيل (لاحتوائها كلمة "Google")، فلا تظهر شاشة «حسابك معطل». صُحّح ليحتفظ برسائل خادمنا العربية ويرفض فقط نصوص SDK اللاتينية الخام.
- **تحقق محلي:** مُشغّل `run-qa.sh` (21 سيناريو، واجهة حيّة) → **21/21 PASS، 0 فشل** (كان 20/21). أُكِّد محليًا بعد الإصلاح.

### الإصدار المنشور
- **GitHub Release:** https://github.com/Mode2094/velnix/releases/tag/velnix-v0.7.0-build9
- **الـtag على:** `2523860` (الـcommit ذو CI الأخضر) — أُعيد بناء الحزم من هذا الـcommit.
- **لم يُحذف أي إصدار سابق** (build 7 وbuild 8 باقيان).

### الملفات والبصمات
| الملف | SHA-256 | الحجم |
|---|---|---|
| `Velnix-release.apk` | `1a3d95b0ea68c8ad7ae16f7eab727a95916a729a875dae94b75ef6df08858d3f` | 81.2 MB |
| `Velnix-release.aab` | `2392875557cb43e73eb48f04224bc7cb597cfd97953fec98ba2c55f04e2b159c` | 73.8 MB |

- Application ID: `com.mode2094.velnix` • versionCode **9** • versionName `0.7.0`
- Signer: `CN=Velnix` (V2) • Cert SHA-256: `6e57f935…e21601`
- **إثبات المزوّد:** الـAPK يحتوي `recaptcha_enterprise` + المفتاح العام `6LeNIQ0u…`؛ وعلى الإيميوليتور: `rCEAppCheckProvider: Initializing RecaptchaTasksClient for siteKey: 6LeNIQ0u…`.

### ما زال BLOCKED
- **تسجيل دخول كامل بحساب حقيقي على جهاز حقيقي:** غير متاح (لا بيانات اعتماد، وممنوع تعديل الحسابات). يلزم اختبارك الميداني + تأكيد سجلات الإنتاج (`app: VALID`).
