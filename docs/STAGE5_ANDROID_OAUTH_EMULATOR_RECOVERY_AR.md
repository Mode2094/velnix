# Stage 5 — تدقيق OAuth على Android واستعادة المحاكي

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · خط الأساس: `8f9316784a8b0029564288d2619293bb7a18e0ba`
مشروع Firebase: `velnix-6c1a2` · Android App ID: `1:948196868655:android:4465def254bb941ac43cda` · الحزمة: `com.mode2094.velnix`

**لم يُعدَّل أي إعداد في Firebase أو Google Cloud.** كل عمليات هذه الجولة قراءة فقط.

---

## 1. تصحيح الاستنتاجات التقنية السابقة

### 1.1 دلالات `client_type` — كان استنتاجي السابق **مقلوباً**

الدليل الحاسم لم يأتِ من الافتراض بل من بنية الملف نفسه: العميل من نوع **Android** وحده هو الذي يحمل كتلة `android_info` (باسم الحزمة وبصمة الشهادة)، بينما لا تحملها عملاء Web.

```
client_type = 1
  client_id = 948196868655-3uhu8nlhk5qk3gpbopm3gbsok93a7dn6...
  keys      = ['android_info', 'client_id', 'client_type']   ← يحمل android_info
  android_info.package_name     = com.mode2094.velnix
  android_info.certificate_hash = 2747340241e22a7d8b4f6b2c1b557fc87b4d6275

client_type = 3
  client_id = 948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2...
  keys      = ['client_id', 'client_type']                    ← بلا android_info
```

| النوع | المعنى | رقم التعريف |
|---|---|---|
| `1` | **Android (تطبيق مثبَّت)** | `3uhu8nlhk5qk3gpbopm3gbsok93a7dn6` |
| `2` | iOS | — |
| `3` | **Web** | `rhui5vqf3h48ft5e1srln5fc9otm8ng2` |

**ما جاء في تقريري السابق كان خاطئاً** حين وصفت النوع `3` بأنه عميل Android وسمّيته «العميل المطلوب». الصواب: النوع `1` هو عميل Android، والنوع `3` هو عميل Web.

### 1.2 `default_web_client_id`

```
default_web_client_id = 948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2...
```

يساوي عميل النوع `3` **بالضبط** (تحقّق برمجي: مطابقة تامة). هذا يؤكّد الاستنتاج: النوع `3` هو Web، والاسم الموروث `default_web_client_id` مشتق منه — كما هو موثَّق في إضافة Google Services.

وهذا يفسّر أيضاً لماذا فشلت محاولاتي السابقة لاشتقاق `rhui5vqf…` رياضياً من (الحزمة + الشهادة): كنت أحاول اشتقاق معرّف **Web**، ومعرّفات Web عشوائية ولا تُشتق من الحزمة/الشهادة. لا حاجة لأي اشتقاق رياضي (وقد أوقفت هذه المحاولات كما طُلب).

### 1.3 ربط شهادة Android — أصبح **مؤكَّداً** بعد أن كان «غير محسوم»

| الفحص | القيمة | النتيجة |
|---|---|---|
| `android_info.package_name` | `com.mode2094.velnix` | **مطابق** |
| `android_info.certificate_hash` | `2747340241E22A7D8B4F6B2C1B557FC87B4D6275` | **مطابق تماماً** |
| SHA‑1 في شهادة APK الموقَّع | `2747340241e22a7d8b4f6b2c1b557fc87b4d6275` | — |

**تطابق تام بين بصمة الشهادة المسجَّلة في عميل Android OAuth وبصمة شهادة الـAPK الموقَّع فعلياً.** هذا انتقل من «غير محسوم» إلى **مُثبَت**.

---

## 2. تشخيص خدمات Google Play والاستعادة

| البند | AVD الحالي `palladium_test` |
|---|---|
| الصورة | `system-images/android-34/google_apis/x86_64` |
| مستوى API | 34 |
| النوع | `google_apis` (**بدون** Play Store — `PlayStore.enabled = no`) |
| إصدار GMS | `23.18.18` (versionCode `231818047`) |
| المطلوب من المكتبة | `261200000` |
| Play Store | `com.android.vending` موجود لكنه محدود في صورة `google_apis` |

### ما تم تنفيذه (بآليات رسمية فقط)

1. نُزِّلت صورة **رسمية** عبر `sdkmanager`:
   `system-images;android-34;google_apis_playstore;x86_64` ⇒ نجحت.
2. أُنشئ AVD **منفصل** `velnix_gsi_test` (بـ`avdmanager`) لعدم المساس بالـAVD الحالي.
3. **لم يُمَس أو يُصفَّر `palladium_test`** — تحقّق: لا يزال يعمل.
4. لم تُثبَّت أي حزمة GMS غير رسمية، ولم يُخفَّض أي اعتماد لإخفاء المشكلة.

### نتيجة الاستعادة — قيد بيئي لم يُحَلّ

| الفحص | النتيجة |
|---|---|
| GMS في صورة Play Store (r14، API 34) | **`23.18.18`** — **نفس الإصدار** |
| تحديث GMS عبر Play Store | يحتاج تسجيل دخول لحساب Google ⇒ حلقة مغلقة بلا حساب |
| إقلاع AVD الجديد (برسم برمجي) | أقلع، لكن اللقطة استغرقت **> 300 ثانية** ⇒ غير قابل للاستخدام |
| إقلاع AVD الجديد (GPU عتادي) | `adb` ⇒ **`offline`** تحت الحمل ⇒ أوقفتُ التجربة ونظّفتُها |

**الخلاصة:** الصورة الرسمية بـPlay Store **متاحة ومثبَّتة**، لكنها **لا تُصلح القيد**، لأن إصدار GMS في هذه المراجعة (r14/API 34) **مطابق تماماً** للصورة الحالية. وتحديث GMS نفسه يتطلّب حساب Google. وبناءً على ذلك، فإن تحذير `Play services out of date` **قيد بيئي على صورة المحاكي**، وليس عيباً في المشروع ولا في تسجيل OAuth.

**ملاحظة مهمّة:** التدفق لم يتوقّف عند هذا التحذير — بل وصل التطبيق فعلاً إلى واجهة Google عبر `GoogleSignIn.authenticate`. أي أن إصدار GMS لم يمنع بدء الاستدعاء.

---

## 3. إعادة البناء والتشغيل

| الفحص | النتيجة |
|---|---|
| `flutter build apk --debug --dart-define=VELNIX_GOOGLE_ENABLED=true` | `exit 0` (Gradle 13.0s) |
| توقيع الـAPK | `C=US, O=Android, CN=Android Debug` |
| SHA‑1 في الـAPK | `2747340241e22a7d8b4f6b2c1b557fc87b4d6275` — مطابق للمسجَّل |
| `adb install -r` | `Success` |
| تشغيل التطبيق | PID `6929` — مستقر، بلا انهيار |
| زر Google | **مُفعَّل** |
| نقر حقيقي عبر `adb shell input tap` | نجح، ووصل إلى واجهة Google |

---

## 4. نتيجة تدفّق Google — تمييز دقيق للأسباب

النتائج مرتّبة كما طُلب، كلٌّ بدليل مستقل:

| # | المرحلة | النتيجة | الدليل |
|---|---|---|---|
| 1 | الزر مُفعَّل | **نعم** | لقطة شاشة (زر أزرق متين) |
| 2 | بدء تدفّق Google | **نعم** | `GoogleSignIn.authenticate` ← `GoogleSignInAndroid.authenticate` ← `_authenticate` |
| 3 | Account Chooser يظهر | **لا** | راجع أدناه |
| 4 | إتمام Firebase Auth | **لا** | لم يصل أي رمز |
| 5 | قبول App Check من الخادم | **غير مُختبَر** | لم يُعرض أي رمز |

### تمييز السبب — لماذا لم تظهر شاشة اختيار الحساب

| الفرضية | الحكم | الدليل |
|---|---|---|
| **لا يوجد حساب Google على الجهاز** | **هي السبب** | `dumpsys account` ⇒ **`Accounts: 0`**، وإصدار `google_sign_in_android` يرفع «لا توجد بيانات اعتماد» |
| عدم توافق خدمات Play | **مساهم، غير حاسم** | GMS `231818047` < المطلوب `261200000`، **لكن** الاستدعاء وصل إلى واجهة Google فعلاً |
| عدم تطابق إعداد OAuth | **مستبعَد** | `certificate_hash` و`package_name` **متطابقان تماماً** (§1.3)، ولم يظهر أي `DEVELOPER_ERROR` |
| فشل Firebase Auth | **غير قابل للتقييم** | لم يصل أي رمز لتمريره إلى Firebase |

**لا أصنّف OAuth كـPASS** بمجرد غياب `DEVELOPER_ERROR`. التصنيف الدقيق: **إعداد OAuth = سليم مُثبَت**، أما **تدفّق Google الكامل = محجوب لغياب حساب معتمد**.

---

## 5. مراجعة التسجيل التشخيصي

**العيب السابق:** `catch (e)` كان يُهمل الاستثناء، ثم نسختي الأولى من الإصلاح طبعت `$e` **خاماً** — وهو خطر تسريب حقيقي لأن:

- `GoogleSignInException.toString()` يتضمّن `details` وهو `Object?` غير محدَّد المحتوى.
- `FirebaseAuthException` يحمل حقلاً `credential` قد يحتوي رموزاً.

**الإصلاح المُنقّى المعتمد الآن** (`lib/live/live_app.dart`):

```dart
} catch (e, st) {
  if (kDebugMode) {
    final codes = <String>['${e.runtimeType}'];
    if (e is GoogleSignInException) codes.add('google=${e.code}');
    if (e is FirebaseAuthException) codes.add('firebase=${e.code}');
    debugPrint('Velnix: Google sign-in failed (${codes.join('; ')})');
    debugPrintStack(stackTrace: st, label: 'Velnix Google sign-in');
  }
```

- **لا يُطبع الكائن الخام** ولا `details` ولا `credential` ولا `description`.
- يُطبع فقط: نوع الاستثناء + رمز الخطأ (تصنيف غير حسّاس) + مكدّس التتبّع (إطارات فقط، بلا قيم).
- المخرج الفعلي المُتحقَّق منه:
  `Velnix: Google sign-in failed (GoogleSignInException; google=GoogleSignInExceptionCode.unknownError)`
- **تدقيق التسريب:** بحث في سجلّ التطبيق عن `ya29.` و`id_token` و`access_token` و`refresh_token` و`Bearer` و`client_secret` ⇒ **لا نتائج**.
- رسالة المستخدم العربية لم تتغيّر، ومنطق المصادقة ومستوى التحقّق لم يتغيّرا.

---

## 6. المطلوب من المالك

| # | المتطلب | النوع |
|---|---|---|
| 1 | **حساب Google اختبار معتمد** مُسجَّل على المحاكي — **الشرط الوحيد المتبقي لتصديق Google Sign‑In** | إذن + حساب معتمد |
| 2 | صورة محاكي بإصدار GMS ≥ `261200000` (لإزالة تحذير الإصدار) | تحديث بيئة |

**لا حاجة لأي تغيير سحابي.** عميل Android OAuth سليم ومربوط بالشهادة الصحيحة، و`google-services.json` وGradle سليمان.

---

## 7. حالة المستودع

- `main` **لم يُمسّ**.
- PR #1 **مفتوح / Draft**.
- تعديل `ci.yml` **محفوظ ولم يُودَع**.
- لم تُودَع أي أسرار أو مفاتيح أو رموز.
- صورة النظام الرسمية والـAVD الجديد محليان فقط؛ `palladium_test` لم يُمَس.

---

## 8. الخلاصة

| # | السؤال | الإجابة |
|---|---|---|
| 1 | أنواع OAuth الصحيحة والربط بالشهادة | النوع `1` = **Android** (`certificate_hash` = `2747340241e22a7d8b4f6b2c1b557fc87b4d6275` = بصمة APK تماماً) · النوع `3` = **Web** |
| 2 | هل عميل Android OAuth صالح؟ | **صالح — مُثبَت** (تطابق الحزمة والبصمة). كان «غير محسوم» في تقريري السابق، والصواب الآن مؤكَّد. |
| 3 | إصدار Play Services ونتيجة الاستعادة | GMS `23.18.18` (`231818047`)، المطلوب `261200000`. نُزِّلت صورة `google_apis_playstore` رسمياً في AVD منفصل، لكنها **بنفس إصدار GMS** ⇒ **لم يُحَلّ**، وهو قيد بيئي. |
| 4 | نتيجة Account Chooser | **لم يظهر** — `Accounts: 0` |
| 5 | نتيجة Firebase Authentication | **لم تكتمل** — لا رمز، ولا حساب |
| 6 | المطلوب: حساب اختبار معتمد | **نعم** — الشرط الوحيد المتبقي لتصديق Google Sign‑In |
| 7 | آخر SHA ونتيجة CI | يُحدَّث أدناه |
| 8 | عوائق Stage 5 المتبقية | حساب اختبار معتمد · إثبات App Check على الخادم · توقيع Apple لـiOS |

**لم يُعلن Stage 5 PASS.** التصديق الحقيقي للمصادقة وApp Check لم يتحقّق، ولا يُعلن PASS بدونه.