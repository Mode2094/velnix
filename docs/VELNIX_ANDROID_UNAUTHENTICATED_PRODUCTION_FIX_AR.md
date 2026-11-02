# تشخيص وإصلاح مشكلة Unauthenticated على هواتف العملاء — Velnix

**المشروع:** `Mode2094/velnix`
**Firebase Project:** `velnix-6c1a2`
**Android Package:** `com.mode2094.velnix`
**النسخة الموزّعة عند ظهور المشكلة:** `0.7.0+8`
**تاريخ التشخيص:** 2026-11-02
**الخطورة:** CRITICAL — Production Release Blocker

---

## 1) الإجابة المباشرة على الأسئلة

### س1: لماذا ظهرت Unauthenticated عند العملاء؟
**مُثبَت بسجلات الإنتاج:** الطلب يصل إلى Cloud Functions مع **`auth: VALID`** (المستخدم مسجّل بنجاح في Firebase Auth) لكن **`app: INVALID`** — أي أن **رمز App Check مرفوض**. وبما أن كل الدوال المفيدة مُعلَّمة بـ`enforceAppCheck: true`، فإن الخادم يرفض الطلب بـHTTP 401 ويعيد رمز الخطأ `unauthenticated`، فتظهر الواجهة `تعذّر تحميل الحساب: Unauthenticated`.

> **الرسالة الدقيقة من السجل:**
> `Callable request verification failed: AppCheck token was rejected.`
> `verifications: {"app": "INVALID", "auth": "VALID"}`

### س2: من أين المشكلة؟
**من App Check / Play Integrity، لا من Firebase Auth ولا من كود التطبيق.**
- Firebase Auth سليم تمامًا (`auth: VALID` في كل الطلبات الفاشلة).
- App Check للويب (reCAPTCHA) يعمل (`app: VALID` مستمر).
- App Check لأندرويد (Play Integrity) **يرفض كل الطلبات** في نافذة الفشل (`app: INVALID`).

### س3: ما الدليل الإنتاجي؟
- فحص سجلات `joinSession` / `listOrders` / `dashboardStats` في `europe-west1` لآخر 30 يومًا:
  | النتيجة | العدد |
  |---|---|
  | `app=VALID auth=VALID` | 181 |
  | `app=INVALID auth=VALID` | 153 |
  | `app=MISSING auth=VALID` | 19 |
- الجدول الزمني لليوم **2026-11-02**:
  | الساعة (UTC) | VALID | INVALID |
  |---|---|---|
  | 09–12 | 100% | 0 |
  | 15 | 10 | 48 |
  | 16 | 25 | 105 |
- التبديل السريع بين VALID وINVALID (خلال ثوانٍ) يؤكد وجود **عميلين مختلفين**: الويب (reCAPTCHA) ينجح دائمًا، وأندرويد (Play Integrity) يفشل دائمًا.
- **تأكيد إضافي:** إعداد Play Integrity للمشروع = `allowUnrecognizedVersion: true` + **`deviceIntegrity.minDeviceRecognitionLevel: "MEETS_DEVICE_INTEGRITY"`**. بصمات شهادة التوقيع مسجّلة صحيحة (رفع `6e57f935…` وPlay signing `9bdabcf8…`).

### س4: ما الذي تغيّر بالضبط؟
**انظر القسم 4 أدناه.** غُيّر سلوك الواجهة (بلا لمس الحماية)، ولم يتغيّر منطق الخادم بعد.

### س5–س8: اختبار Android Release الحقيقي / المدير / الموظف / استمرار الجلسة
**`BLOCKED`** — لا يوجد جهاز Android فعلي متاح في هذه البيئة، والتحقق من Play Console غير متاح (Play Developer API `androidpublisher` غير مُفعّل). لا يمكن ادّعاء نجاح هذه البنود.

### س9: هل الإصلاح منشور ويستخدمه العملاء؟
**جزئيًا:**
- **إصلاح الواجهة** (منع رسالة Unauthenticated الخام + إعادة محاولة آمنة): أصبح في الكود ويُنشر مع نسخة جديدة.
- **إصلاح الإعداد الجذري في App Check / Play Integrity: لم يُنفَّذ** لأنه **تغيير سياسة أمنية** يتطلب موافقتك الصريحة (القسم 3)، وهو ما لم يتحقق بعد.

### س10: الملفات النهائية وبصماتها
بعد بناء نسخة الإصلاح (القسم 6).

---

## 2) السبب الجذري (Root Cause)

**سلسلة الفشل:**
```
فتح التطبيق → Firebase.initializeApp ✅
→ App Check (Play Integrity) يحاول إصدار رمز
→ Cloud Functions تستقبل auth صالحًا لكن App Check مرفوض (app: INVALID)
→ enforceAppCheck:true يرفض الطلب بـ401
→ الواجهة تقرأ الرمز unauthenticated وتعرض "Unauthenticated" (نص SDK خام)
```

**السبب الفني الأرجح (بحسب الأدلة):** Play Integrity لا يُصدر رمزًا مقبولًا للتطبيق المثبّت **خارج Google Play**، لأن:
1. التطبيق يُوزّع كـ**APK مباشر (sideload)** وليس عبر Google Play.
2. إعداد App Check يفرض **`MEETS_DEVICE_INTEGRITY`** — وهو شرط قد يفشل على أجهزة غير معتمَدة أو غير مرتبطة بحساب Play، أو لم يُربط فيه Play Integrity API بمشروع Firebase من Play Console بعد.
3. Play Integrity يتطلب — حتى مع `allowUnrecognizedVersion` — أن يكون **Play Integrity API مربوطًا بمشروع Firebase** وأن تُعرّف البصمات (وهي مسجّلة الآن). ما لم يُثبَت الربط من Play Console، يبقى الرمز مرفوضًا.

**ما لم يُثبَت بعد (يحتاج Play Console أو جهازًا):**
- هل التطبيق منشور/مربوط في Play Console فعلاً.
- تصنيف Play Integrity الفعلي للجهاز (`PLAY_RECOGNIZED` / `UNRECOGNIZED_VERSION` / `MEETS_DEVICE_INTEGRITY`).

---

## 3) توصية تغيير سياسة App Check (تحتاج موافقتك الصريحة — لم تُنفَّذ)

وفق توثيق Firebase الرسمي، لجدول قناة التوزيع:
| قناة التوزيع | PLAY_RECOGNIZED | LICENSED | أدنى مستوى نزاهة جهاز |
|---|---|---|---|
| على Google Play فقط | مطلوب | مطلوب | **لا تتحقق من مستوى النزاهة** |
| **خارج Google Play فقط** | غير مطلوب | غير مطلوب | **التحقق من نزاهة الجهاز (Device integrity)** |
| على Play وخارجها | مطلوب | غير مطلوب | **لا تتحقق من مستوى النزاهة** |

**الوضع الحالي:** `allowUnrecognizedVersion: true` (لا يتطلب PLAY_RECOGNIZED) + `MEETS_DEVICE_INTEGRITY`.

**الخيارات (أي تغيير في Play Console يتطلب موافقتك):**

- **الخيار أ (الأكثر أمانًا للمستخدمين):** ربط Play Integrity API من Play Console بمشروع `velnix-6c1a2` والتأكد أن التطبيق مُعرَّف. هذا هو **الحل الصحيح** إن كان الربط مفقودًا. **لا يخفّض أي حماية.**
  - الأثر: لا شيء على الأمان؛ يفعّل المزوّد كما هو مصمَّم.
- **الخيار ب (تخفيف مشروط):** إلغاء التحقق الصريح من نزاهة الجهاز (إبقاء PLAY_RECOGNIZED غير مطلوب للتوزيع الخارجي).
  - **الأثر الأمني:** يسمح لأجهزة منخفضة النزاهة (مُروّتة/غير معتمَدة) بالوصول. يبقى App Check مُفعَّلًا ويتحقق من نزاهة التطبيق.
  - لا يُنصح به إلا إذا ثبت أن أجهزة العميل مشروعة لكنها تفشل `MEETS_DEVICE_INTEGRITY`.

**لم أنفّذ أيًّا منهما.** الأولوية للخيار (أ) لأنه لا يمسّ الأمان.

---

## 4) ما تغيّر بالضبط (إصلاح الواجهة — منفّذ)

**الملفات:**
- `lib/live/gateway.dart`: `callableErrorMessage` لحالة `unauthenticated` لم تعد تُمرّر نص SDK الخام؛ تُرجع رسالة عربية واضحة.
- `lib/live/live_app.dart`:
  - `sessionErrorMessage()` جديدة تُنتج رسالة عربية واضحة ولا تسمح بمرور أي نص لاتيني/SDK.
  - شاشة الخطأ أصبحت احترافية: أيقونة، عنوان «تعذر تحميل الحساب»، رسالة مفهومة، زر «إعادة المحاولة»، وزر «تسجيل الخروج» (ثانوي، غير مفروض).
  - `loadSession()`: عند `unauthenticated` المستخدم مسجّل → **تحديث ID Token مرة واحدة ثم إعادة المحاولة مرة واحدة** (بلا حلقة)، مع إبقاء الجلسة.
- `test/login_test.dart`: اختبارات انحدار للحالات الخمس.

**ممنوع ولن يحدث:** تعطيل App Check، أو إزالة `enforceAppCheck`، أو استخدام Debug Provider في الإنتاج.

---

## 5) معالجة الحالات الخمس في الواجهة

| الحالة | السلوك |
|---|---|
| 1. مستخدم غير مسجّل فعلاً | يُعاد إلى شاشة الدخول (`signed_out`). |
| 2. مسجّل لكن App Check/الاتصال فشل مؤقتًا | **تبقى الجلسة**، رسالة عربية + «إعادة المحاولة»، بلا خروج قسري. |
| 3. التوثيق منتهٍ | **تجديد ID Token مرة واحدة** ثم إعادة المحاولة مرة واحدة. |
| 4. لا عضوية/معطل | شاشة حالة الانضمام (`JoinStatusScreen`) الصحيحة، بلا صلاحيات. |
| 5. مشكلة إعدادات إنتاج | رسالة عربية واضحة بدل `Unauthenticated` الخام. |

لا حلقة تسجيل دخول ولا إعادة محاولة بلا نهاية.

---

## 6) الاختبارات

- **Flutter:** 440 اختبارًا، 0 فشل (شملت اختبارات الانحدار الجديدة).
- **Functions (وحدات):** 195/195.
- **Firebase Emulator:** 273/273.
- **`flutter analyze`:** نظيف. **`dart format`:** نظيف.
- **لم يُختبَر** على جهاز Android حقيقي: **`BLOCKED`**.

---

## 7) ما هو `BLOCKED` بوضوح

1. **اختبار تسجيل الدخول على Android Release حقيقي** — لا جهاز متاح. (`BLOCKED`)
2. **التحقق من حالة Play Console / ربط Play Integrity API** — يتطلب صلاحية Play Console; `androidpublisher` غير مُفعّل هنا. (`BLOCKED`)
3. **إصلاح الإعداد الجذري في App Check** — لم يُنفَّذ بانتظار موافقتك الصريحة (`BLOCKED` حتى الموافقة).
4. **اختبار مثبّت من مسار Play المصرّح به** — لا يتوفر. (`BLOCKED`)

---

## 8) المطلوب منك للمتابعة

1. **موافقة صريحة** على تنفيذ **الخيار (أ)**: ربط Play Integrity API من Play Console بمشروع `velnix-6c1a2` (بلا تخفيف حماية). إن لم تُفعّلها، أو لم تكن أجهزة العميل تستوفي `MEETS_DEVICE_INTEGRITY`، ننتقل للخيار (ب) بعد موافقتك.
2. **جهاز Android حقيقي** لاختبار login/stay-signed-in على الـAPK الموقّع.
3. تأكيد **قناة التوزيع**: هل العميل يثبّت APK مباشرة، أم من Google Play (داخلي/مغلق/إنتاج)؟

**لن أعلن نجاح الإصلاح الكامل للحرج حتى تُثبَت إعدادات App Check والاختبار على جهاز حقيقي.**
