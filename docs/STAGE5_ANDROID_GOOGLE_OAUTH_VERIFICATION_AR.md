# Stage 5 — التحقق من Google Sign‑In / OAuth على Android

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · خط الأساس: `790e0c3ff6d53a16e5e2a3f68a76a1e6aa00e56d`
مشروع Firebase: `velnix-6c1a2` · Android App ID: `1:948196868655:android:4465def254bb941ac43cda` · الحزمة: `com.mode2094.velnix`

كل عمليات السحابة في هذه الجولة **قراءة فقط**. لم تُعدَّل أي إعدادات OAuth ولا بصمات SHA ولا مزوّدات المصادقة ولا App Check.

---

## 1. حالة المستودع

| الفحص | النتيجة |
|---|---|
| الفرع | `audit/production-readiness` |
| HEAD | `790e0c3ff6d53a16e5e2a3f68a76a1e6aa00e56d` (مطابق للخط الأساس) |
| ملفات غير مودعة | `M .github/workflows/ci.yml` فقط — **محفوظ ولم يُودَع** |

---

## 2. تدقيق OAuth (قراءة فقط)

### 2.1 عدد وأنواع العملاء

من `google-services.json` المسحوب رسمياً عبر `firebase apps:sdkconfig ANDROID`:

| النوع | `client_type` | معرّف العميل |
|---|---|---|
| Web | `1` | `948196868655-3uhu8nlhk5qk3gpbopm3gbsok93a7dn6.apps.googleusercontent.com` |
| **Android (Installed App)** | `3` | `948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2.apps.googleusercontent.com` |

> **مصحَّح في `STAGE5_ANDROID_OAUTH_EMULATOR_RECOVERY_AR.md`.** ما ورد هنا سابقاً كان **مقلوباً**. الدلالة الصحيحة: `client_type 1` = **Android** (وهو الوحيد الحامل لكتلة `android_info` بالحزمة وبصمة الشهادة)، `client_type 2` = iOS، `client_type 3` = **Web**، و`default_web_client_id` مشتق من النوع `3`. عميل Android هو `948196868655-3uhu8nlhk5qk3gpbopm3gbsok93a7dn6…` وبصمته تطابق شهادة APK تماماً.

### 2.2 تطابق الحزمة والمشروع

| الفحص | القيمة | النتيجة |
|---|---|---|
| `project_id` | `velnix-6c1a2` | ✓ |
| `project_number` | `948196868655` | ✓ |
| `package_name` (من `build.gradle.kts`) | `com.mode2094.velnix` | ✓ |
| `mobilesdk_app_id` | `1:948196868655:android:4465def254bb941ac43cda` | ✓ |

لا تُطبع أي مفاتيح أو أسرار في هذا التقرير.

### 2.3 حالة SHA‑1

بصمتا Debug مسجَّلتان ومُتحقَّق منهما في الجولة السابقة، وشهادة الـAPK تطابقهما:

```
SHA-1   2747340241e22a7d8b4f6b2c1b557fc87b4d6275
SHA-256 9bdabcf8c544b5ca09370f97cecc1e625660e1962fe2741821c7726453e5f932
```

### 2.4 قيمة `default_web_client_id` الناتجة عن Google Services

من الملف المولَّد `build/app/generated/res/processDebugGoogleServices/values/values.xml`:

```
default_web_client_id = 948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2.apps.googleusercontent.com
google_app_id         = 1:948196868655:android:4465def254bb941ac43cda
project_id            = velnix-6c1a2
```

إضافة `com.google.gms.google-services` (`4.4.4`) مفعَّلة بشكل صحيح: تُطبَّق شرطياً عند وجود الملف (`android/app/build.gradle.kts:8-10`)، ومُعلَنة في `settings.gradle.kts:24`. قيمة `default_web_client_id` تُولَّد من عميل Android، وهو السلوك الرسمي لإضافة Google Services (اسم المورد موروث من مفاتيح Web القديمة).

### 2.5 طريقة استعمال العميل في كود Flutter

`lib/live/live_app.dart:134-144`:

```dart
final google = GoogleSignIn.instance;
await google.initialize(
  serverClientId: const String.fromEnvironment('GOOGLE_WEB_CLIENT_ID',
                                               defaultValue: '').isEmpty
      ? null
      : const String.fromEnvironment('GOOGLE_WEB_CLIENT_ID'),
);
final account = await google.authenticate();
```

على Android، تمرير `serverClientId = null` هو **السلوك الصحيح**: عندها تستخدم إضافة `google_sign_in_android` عميل Android الأصلي المشتق من (اسم الحزمة + شهادة التوقيع). قيمة `GOOGLE_WEB_CLIENT_ID` تُستخدم على iOS وWeb، لا على Android. **لا يوجد خطأ في استعمال العميل داخل الكود.**

### 2.6 نقطة عدم يقين صريحة

**لم يُثبَت** أن عميل Android `rhui5vqf…` مرتبط فعلاً بشهادة Debug الحالية. محاولة اشتقاق معرّف العميل من (اسم الحزمة + SHA‑1) عبر عشرات تركيبات التجزئة (SHA‑1/MD5/SHA‑256، ترتيبات وفواصل متعددة، ترميز base64 من ASCII أو من البصمة) لم تُنتج `rhui5vqf3h48ft5e1srln5fc9otm8ng2`، لأن اشتقاق Google الداخلي غير منشور. لذلك:

- **غير مُثبَت** أن الربط خاطئ.
- **غير مُثبَت** أنه صحيح.

الحسم يتطلب تدفّقاً مصادقاً فعلياً (غير متاح — راجع §4).

---

## 3. البناء

| الفحص | النتيجة |
|---|---|
| `flutter build apk --debug --dart-define=VELNIX_GOOGLE_ENABLED=true` | `exit 0` |
| توقيع الـAPK | `C=US, O=Android, CN=Android Debug` |
| SHA‑1 / SHA‑256 داخل الـAPK | يطابقان التسجيلَين تماماً |
| `adb install -r` | `Success` |
| تهيئة Firebase | `FirebaseInitProvider: FirebaseApp initialization successful` |
| العملية | PID `6570` — مستقرة |
| شاشة الدخول العربية RTL | تظهر بشكل صحيح (لقطة موثّقة) |
| زر Google | **ظاهر ومُفعَّل** (أزرق متين) |

زر Google مقيَّد براية بناء `--dart-define=VELNIX_GOOGLE_ENABLED` في `lib/live/live_app.dart:219`، ولهذا بدا معطَّلاً في الجولات السابقة. هذه راية مقصودة وليست عطلاً.

---

## 4. النقر الحقيقي والنتائج — بأدلة مستقلة

تم تنفيذ **نقر حقيقي** عبر `adb shell input tap 360 940` (بدون تجاوز أي صلاحية، وبدون رموز مزوّرة).

### المرحلة 1 — الزر مُفعَّل فقط
**مُثبَت بلقطة شاشة**: الزر أزرق متين. لا يثبت شيئاً عن OAuth.

### المرحلة 2 — بدء تدفّق Google الحقيقي
**مُثبَت من مكدّس الاستدعاء**: النقر وصل إلى `GoogleSignIn.authenticate` ← `GoogleSignInAndroid.authenticate` ← `GoogleSignInAndroid._authenticate`، أي أن الكود استدعى واجهة Google الفعلية.

### المرحلة 3 — Google Account Chooser
**لم تظهر.** السبب مثبت من سجلّ الأخطاء ومن حالة الجهاز:

```
flutter : Velnix: Google sign-in failed: GoogleSignInException(
           code GoogleSignInExceptionCode.unknownError,
           No credential available: No credentials available, null)
#0 GoogleSignInAndroid._authenticate (package:google_sign_in_android/...:219:9)
#1 GoogleSignInAndroid.authenticate   (package:google_sign_in_android/...:86:57)
#2 GoogleSignIn.authenticate         (package:google_sign_in/google_sign_in.dart:545:44)
#3 _LiveLoginState.signInWithGoogle  (package:velnix/live/live_app.dart:144:25)
```

وتأكيد مباشر: `dumpsys account` ⇒ **`Accounts: 0`**، أي لا يوجد أي حساب على المحاكي.

### المرحلة 4 — إتمام Firebase Auth
**لم يحدث.** لا يوجد حساب Google للاختيار، ولم تُنشأ حسابات (خارج النطاق)، ولم يُستخدم حساب شخصي (ممنوع). التطبيق عرض رسالة عربية صحيحة: «تعذّر تسجيل الدخول بواجهة Google. تحقّق من إعدادات Firebase وربط حساب الموظف.» وبقي حيّاً بلا انهيار.

### المرحلة 5 — قبول App Check من الخادم
**غير مُختبَر.** التدفق توقّف قبل إنتاج رمز، فلم يصل إلى طبقة App Check. لم يُعطَّل App Check ولا تُغيّرت إعداداته، ولا توجد أخطاء App Check في السجل.

### قيد بيئي ثانٍ في المحاكي

```
GooglePlayServicesUtil: Google Play services out of date for com.mode2094.velnix.
Requires 261200000 but found 231818047
versionName=23.18.18 (190800-535401451)
```

خدمات Google Play على صورة المحاكي `palladium_test` **قديمة**. هذا قيد على صورة المحاكي، وليس عيباً في المشروع.

### ملاحظة مهمّة عن غياب أخطاء التطابق
**لم يظهر** أي من أخطاء عدم التطابق المعروفة (`DEVELOPER_ERROR`، `ApiException status 10`، `Error 1256002`)، وهي الأخطاء التي تظهر عادةً عند اختلاف الحزمة أو الشهادة عن عميل OAuth. غيابها **دليل إيجابي غير قاطع**، لكنه **ليس إثباتاً**، لأن التدفق فشل قبل مرحلة التحقّق من الرمز.

---

## 5. التغييرات المحلية المنفَّذة

**ملف واحد:** `lib/live/live_app.dart`

**العيب المُثبَت:** كتلة `catch (e)` كانت تلتقط الاستثناء وتُهمله تماماً، فلا يظهر أي رمز خطأ في السجل — وهو ما أعاق التشخيص في هذه الجولة تحديداً.

**الإصلاح:** التقاط `st` أيضاً، وطباعة الاستثناء ومكدّس التتبّع **في وضع التصحيح فقط**:

```dart
} catch (e, st) {
  if (kDebugMode) {
    debugPrint('Velnix: Google sign-in failed: $e');
    debugPrintStack(stackTrace: st, label: 'Velnix Google sign-in');
  }
  ... // الرسالة العربية المعروضة للمستخدم لم تتغيّر
```

تغيير تشخيصي بحت: **لا يغيّر منطق المصادقة ولا يخفّض مستوى التحقّق من الهوية**، ورسالة المستخدم لم تتغيّر، وهو ما مكّن من توثيق رمز الخطأ أعلاه.

**التحقّق من عدم الانحدار:**

| الفحص | النتيجة |
|---|---|
| `flutter analyze` (المشروع كامل) | `No issues found` |
| `flutter test` | `+323 / -18` — مطابق تماماً للخط الأساسي |
| الفشل غير الذهبي | **0** (الـ18 كلها golden pixel) |

---

## 6. هل يحتاج المشروع تغييراً سحابياً جديداً؟

> **مصحَّح:** النتيجة الآن **محسومة، ولا حاجة لأي تغيير سحابي.** راجع `STAGE5_ANDROID_OAUTH_EMULATOR_RECOVERY_AR.md` §1.

| الفرضية | الحالة |
|---|---|
| عميل Android موجود | **نعم** — وحيد، ضمن مشروع `velnix-6c1a2`، وبالحزمة الصحيحة |
| مولَّد منه `default_web_client_id` | **نعم** — التكامل سليم |
| ارتباطه بشهادة Debug الحالية | ~~غير مثبَت~~ ⇒ **مُثبَت مطابق** (راجع التصحيح) |
| خطأ OAuth بسبب عدم التطابق | **لا يوجد دليل** — التدفق فشل بـ«لا توجد بيانات اعتماد» قبل أي تحقّق |

**الخلاصة:** لا يوجد ما يبرّر طلب تعديل سحابي الآن. إنشاء عميل Android OAuth جديد أو تعديل تسجيلات OAuth **ممنوع** دون موافقة جديدة، ولا يبرّره أي دليل متاح.

### ما يلزم لإكمال التحقق (خارج النطاق الحالي)

| # | المتطلب | النوع |
|---|---|---|
| 1 | حساب Google **معتمد** على المحاكي أو جهاز حقيقي | حساب اختبار معتمد |
| 2 | صورة محاكي بخدمات Google Play محدثة (`≥ 261200000`) | تحديث بيئة |
| 3 | **عندها فقط**: إن ظهر `DEVELOPER_ERROR`، تُطلب مواءمة عميل OAuth مع شهادة Debug | سحابي — بموافقة |

لم يُنشأ أي حساب Google ولا مستخدم Firebase Auth.

---

## 7. حالة المستودع

- `main` **لم يُمسّ**.
- PR #1 **مفتوح / Draft**.
- تعديل `ci.yml` **محفوظ ولم يُودَع**.
- `android/app/google-services.json` محلي ومشمول بـ `.gitignore:23`.
- لا مفاتيح ولا أسرار OAuth ولا رموز وصول ولا معلومات حساب شخصي في هذا المستند.

---

## 8. الخلاصة

| # | السؤال | الإجابة |
|---|---|---|
| 1 | هل عميل Android OAuth الصحيح موجود؟ | **موجود وصالح ومُثبَت** — بصمة الشهادة مطابقة تماماً لبصمة APK |
| 2 | هل SHA‑1 مطابقة؟ | **نعم، مطابقة مؤكَّدة** — على مستوى التسجيل وعلى مستوى عميل OAuth معاً |
| 3 | هل عميل Web OAuth صالح للاستخدام المقصود؟ | عميل Web (النوع 1) موجود لكنه **غير مطلوب على Android**؛ استعماله كـ `serverClientId` غير مطلوب وليس خطأً. |
| 4 | هل زر Google يعمل؟ | **نعم** — مُفعَّل، والنقر استدعى واجهة Google الفعلية (بِدليل مكدّس الاستدعاء). |
| 5 | هل ظهرت Google Account Chooser؟ | **لا** — `Accounts: 0` على المحاكي ⇒ `No credentials available`. |
| 6 | هل اكتملت مصادقة Firebase؟ | **لا** — لا يوجد حساب Google معتمد؛ إنشاء حساب أو استخدام حساب شخصي ممنوع. |
| 7 | هل ظهرت أخطاء App Check؟ | **لا** — والتدفق لم يصل إلى طبقة App Check. لم يُعطَّل ولا عُدِّل. |
| 8 | هل يحتاج تغييراً سحابياً جديداً؟ | **لا** — الإعداد سليم ومُثبَت |
| 9 | آخر Commit ونتيجة CI؟ | `6a4bd04b890427bde41e654df86863859a6e0bc6` — Push CI ✅ `success` (39107685665)، PR CI ✅ `success` (39107688281) |
| 10 | هل Stage 5 جاهزة للإغلاق؟ | **لا** — تصديق Google Sign‑In الحقيقي لم يكتمل. |

### 9.1 حالة المستودع النهائية

| البند | القيمة |
|---|---|
| آخر Commit | `6a4bd04b890427bde41e654df86863859a6e0bc6` |
| Push CI | `success` — 39107685665 |
| PR CI | `success` — 39107688281 |
| `main` | لم يُمسّ — `0d10904` |
| PR #1 | `OPEN` / `Draft` |
| `ci.yml` المعلّق | محفوظ غير مُودَع |

**لم يُعلن Google Sign‑In PASS** — لا توجد مصادقة حقيقية ناجحة بحساب اختبار معتمد، وهو شرط صريح للقبول.