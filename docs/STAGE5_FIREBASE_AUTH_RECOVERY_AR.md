# Stage 5 — استرجاع إعدادات Firebase الأصلية و Google Sign‑In

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · الأساس: `5e40a54`

حساب Firebase المستخدَم (قراءة فقط): `moderohe8@gmail.com` · المشروع: `velnix-6c1a2` · رقم المشروع: `948196868655`

التطبيقات المسجَّلة (قراءة فقط عبر `firebase apps:list`):

| المنصة | App ID |
|---|---|
| Android | `1:948196868655:android:4465def254bb941ac43cda` |
| iOS | `1:948196868655:ios:58a6ca83ccb4e1e3c43cda` |
| Web | `1:948196868655:web:ace9b264b4fae48ac43cda` |

لم يُنشأ أي تطبيق جديد، ولم تُعدَّل أي تسجيلات OAuth، ولم تُضَف بصمات Android، ولم تُغيَّر مزوّدات App Check، ولم تُعدَّل أي موارد Google Cloud. كل العمليات على السحابة كانت **قراءة فقط**.

---

## 1. إعداد iOS: قبل / بعد

**قبل:**

| العنصر | القيمة |
|---|---|
| `ios/Runner/GoogleService-Info.plist` | غير موجود |
| `ios/Flutter/Firebase.local.xcconfig` | غير موجود |
| `$(VELNIX_GOOGLE_REVERSED_CLIENT_ID)` | غير مُعرَّف ⇒ `CFBundleURLSchemes` = سلسلة فارغة |
| نتيجة التشغيل | `SetupFailureApp` (فشل مغلق مقصود) |

**بعد:**

| العنصر | القيمة |
|---|---|
| `ios/Runner/GoogleService-Info.plist` | موجود — `plutil -lint` = OK، 1,111 بايت |
| `BUNDLE_ID` | `com.mode2094.velnix` (مطابق للمعرّف الفعلي) |
| `PROJECT_ID` | `velnix-6c1a2` |
| `GOOGLE_APP_ID` | `1:948196868655:ios:58a6ca83ccb4e1e3c43cda` |
| `REVERSED_CLIENT_ID` | `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8` |
| `API_KEY` | `[مُحجوب — مفتاح عمومي، غير مودَع في Git]` |
| `ios/Flutter/Firebase.local.xcconfig` | أُنشئ، معرِّف `VELNIX_GOOGLE_REVERSED_CLIENT_ID` بالقيمة المسجَّلة الرسمية |

القيم مأخوذة حرفياً من `firebase apps:sdkconfig IOS` — لم تُخترع أي قيمة.

**الأمان.** كلا الملفين محميان بـ `.gitignore` ولم يُودعا في Git:
- `.gitignore:24` → `**/GoogleService-Info.plist`
- `.gitignore:25` → `ios/Flutter/Firebase.local.xcconfig`
- `.gitignore:23` → `**/google-services.json`

`git status` نظيف عدا تعديل `ci.yml` المعلّق مسبقاً. تم التحقّق من عدم تسرّب أي مفتاح إلى الملفات المتتبَّعة.

---

## 2. تعبئة `GoogleService-Info.plist` داخل الحزمة

**تصحيح مهم لتقرير المرحلة السابقة.** تقريري السابق جزم بأن الملف "لن يُنسخ لأنه يفتقد `PBXBuildFile`". هذا **غير صحيح في الأثر**. المشروع يملك آلية مقصودة:

- طور بناء من نوع `PBXShellScriptBuildPhase` باسم **"Copy local Firebase configuration"** (`project.pbxproj:382`، مُعرَّف `A50F00022026101400000002`) في هدف Runner.
- ينفّذ `ios/scripts/copy_firebase_config.sh` **بعد** مرحلة Resources.
- السكربت ينسخ `Runner/GoogleService-Info.plist` إلى الحزمة، وفي الفرع `else` يحذف أي نسخة قديمة "لعدم ترك ملف مشروعprevious في بناء Demo تزايدي".

**القرار الهندسي: لم أعدّل `project.pbxproj` إطلاقاً.** إضافة `GoogleService-Info.plist` إلى مرحلة Resources كانت ستنتج **نسخة مكرّرة** وتتنازع مع فرع `rm -f` في السكربت — وهو عكس ما طلبت المهمة تجنّبه صراحةً ("Ensure no duplicate resource entries"). تم التحقّق:

- `project.pbxproj` **دون تغيير** (مقارنة بايت ببايت مع نسخة احتياطية).
- عدد النسخ داخل `Runner.app`: **1 بالضبط** (لا تكرار).
- البناء `BUILD_EXIT=0` (98,649ms).

---

## 3. التحقّق من OAuth URL scheme

| الفحص | النتيجة |
|---|---|
| القيمة في `Info.plist` المدمجة | `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8` |
| `REVERSED_CLIENT_ID` المسجَّل | `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8` |
| التطابق | **نعم** |
| `simctl openurl` بالمخطط المسجَّل | `exit 0` — أُرسل فعلياً إلى Velnix |
| ضابط سلبي: مخطط غير مسجَّل | `exit 194` / `OSStatus -10814` (غير موجود) |

الضابط السلبي يُثبت أن `exit 0` يعني توزيعاً حقيقياً للتطبيق على Velnix وليس عملية فارغة. التطبيق بقي حياً بعد الاستدعاء.

**ملاحظة:** زر Google مقيَّد براية زمن بناء `VELNIX_GOOGLE_ENABLED` (`lib/live/live_app.dart:219`): `onPressed: busy || !bool.fromEnvironment('VELNIX_GOOGLE_ENABLED') ? null : signInWithGoogle`. مع البناء الافتراضي كان الزر معطَّلاً — **وهذا سلوك مقصود** وليس عطلاً.

---

## 4. بصمات Android الناقصة

مستودع المفاتيح: `~/.android/debug.keystore` (`CN=Android Debug`).

| البصمة | القيمة المحلية (base64) |
|---|---|
| SHA‑1 | `27:47:34:02:41:E2:2A:7D:8B:4F:6B:2C:1B:55:7F:C8:7B:4D:62:75` ⇒ `J0c0AkHiKn2LT2ssG1V/yHtNYnU=` |
| SHA‑256 | `9B:DA:BC:F8:C5:44:B5:CA:09:37:0F:97:CE:CC:1E:62:56:60:E1:96:2F:E2:74:18:21:C7:72:64:53:E5:F9:32` ⇒ `m9q8+MVEtcoJNw+XzsweYlZg4ZYv4nQYIcdyZFPl+TI=` |

تسجيل Firebase الحالي لتطبيق Android (`com.mode2094.velnix`):

| النوع | القيمة |
|---|---|
| OAuth Android (SHA‑1) | `948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2.apps.googleusercontent.com` |
| بصمة SHA‑1 بصيغة base64 | `rhui5vqf3h48ft5e1srln5fc9otm8ng2` |
| تسجيل SHA‑256 | **غير موجود** |

**النتيجة: عدم تطابق مؤكد.** البصمة المحلية `J0c0AkHiKn2LT2ssG1V/yHtNYnU=` ≠ المسجَّلة `rhui5vqf3h48ft5e1srln5fc9otm8ng2`. لا يوجد أي عميل SHA‑256 مسجَّل.

إضافة هذه البصمات **تعديل سحابي** ولم يُنفَّذ. راجع §8.

كذلك وُضع `android/app/google-services.json` محلياً من `firebase apps:sdkconfig ANDROID` (مُتجاهَل في Git)، وبناء Android التجريبي **ما زال ناجحاً** (`ANDROID_BUILD_EXIT=0`, 37.9s) بعد تفعيل إضافة `com.google.gms.google-services` التي كانت مُفعَّلة شرطياً.

---

## 5. تهيئة Firebase الحقيقية على iOS — النتيجة

بناء بلا `VELNIX_MODE=demo`:

| الفحص | النتيجة |
|---|---|
| `flutter build ios --simulator --no-codesign` | `BUILD_EXIT=0` — 98,649ms |
| `simctl install` | `exit 0` |
| `simctl launch` | `exit 0` — PID `21471` |
| **`Firebase.initializeApp()`** | **نجح** |
| شاشة الدخول | تُعرض بشكل صحيح |

**الدليل القاطع على نجاح التهيئة:** التطبيق تجاوز `SetupFailureApp` وبلغ `VelnixLiveApp`. ما يظهر على الشاشة هو شاشة الدخول الحقيقية (لا وضع تجريبي):

- الشعار + «إدارة الطلبات بذكاء»
- «تسجيل الدخول»
- زر «المتابعة باستخدام Google»
- «الحسابات الجديدة تنتظر موافقة المدير العام. لا يمنح تسجيل الدخول صلاحيات تلقائية.»
- «الوصول للعمل متاح للحسابات المعتمدة فقط»

العملية بقيت حية (PID ثابت، بلا انهيار).

**نتيجة بعد البناء مع `--dart-define=VELNIX_GOOGLE_ENABLED=true`:** الزر أصبح **مُفعَّلاً** (أزرق متين بدل الرمادي المعطَّل).

### logs
- `[FirebaseCore][I-COR000005] No app has been configured yet.` — رسالة مبكّرة عابرة قبل `configure`، تُتبع正常工作 (تهيئة Messaging نجحت بعدها وظهرت شاشة الدخول).
- `devicecheckd` — اتصالات متكرّرة مع `Client has entitlement` ⇒ App Check/DeviceCheck يعمل فعلياً.
- `[FirebaseAuth][I-AUT000001] Code=17995 … SecItemCopyMatching (-34018) A required entitlement isn't present.` — **فشل سلسلة المفاتيح بسبب البناء غير الموقّع** (`--no-codesign` ⇒ لا entitlement). يؤثر على **حفظ** الجلسة الموقّعة، لا على بدء التدفق نفسه. على جهاز موقّع/Archieved يزول.

---

## 6. نتيجة Google Sign‑In على iOS

| المستوى | الحالة |
|---|---|
| تسجيل Firebase لعميل iOS مطابق للمعرّف | **PASS** |
| `REVERSED_CLIENT_ID` مُدمج ومطابق | **PASS** |
| `CFBundleURLSchemes` صالح (PROVISIONED) | **PASS** |
| توزيع المخطط فعلياً إلى التطبيق | **PASS** (مع ضابط سلبي) |
| الزر مُفعَّل في الواجهة | **PASS** |
| **إتمام تسجيل دخول بحساب Google حقيقي** | **NOT EXECUTED** |

سبب عدم الإتمام — وهو مقصود:
1. **لا يمكن النقر آلياً**: `osascript` مرفوض بالوصول إلى نافذة Simulator (خطأ `-1719`، صلاحيات الوصول غير ممنوحة)، ولا يوجد `cliclick` ولا `idb`. لم تُمنح صلاحيات وصول للنظام دون موافقة صريحة.
2. **لا توجد حسابات Google**، وإنشاؤها خارج النطاق.
3. حفظ الجلسة سيفشل على بناء غير موقّع بسبب `-34018` أعلاه.

**لم يتم تجاوز أي مصادقة، ولم يُجرَّب أي تجاوز لـ App Check.**

---

## 7. حالة App Check

| الفحص | النتيجة |
|---|---|
| `FirebaseAppCheck.instance.activate(...)` يُنفَّذ | **نعم** |
| المزوّد الفعّال (غير debug) | `AppleDeviceCheckProvider` |
| وصول `devicecheckd` | **مؤكَّد** — `Client has entitlement` |
| نتيجة التحقّق (attestation) من الخادم | **غير مؤكَّدة** |
| تجاوز الإنفاذ | **لم يحدث** |

الأدلة على أن المزوّد يعمل: اتصال XPC فعلي بـ `com.apple.devicecheckd` مع `Client has entitlement` عبر دورة حياة التطبيق، وهو ما لا يحدث إلا عند استدعاء `DCDevice.currentToken` من App Check.

لم تُغيَّر مزوّدات App Check ولم تُتخطَّ قيوده. **تحقّق App Check الحقيقي يحتاج جهازاً موقّعاً وخدمة خلفية نشطة، وهو خارج ما يمكن إثباته هنا بلا تجاوز.**

---

## 8. تغييرات السحابة المتبقية التي تتطلّب موافقة المالك

جميعها **لم تُنفَّذ**:

1. **Android — تسجيل بصمة SHA‑1 التجريبية**: إضافة
   `27:47:34:02:41:E2:2A:7D:8B:4F:6B:2C:1B:55:7F:C8:7B:4D:62:75`
   (base64: `J0c0AkHiKn2LT2ssG1V/yHtNYnU=`) إلى تطبيق Android في مشروع Firebase، أو استبدال مفتاح التصحيح بمفتاح له بصمة مسجَّلة.
2. **Android — تسجيل SHA‑256** لتطبيق Android (لا يوجد تسجيل حالياً).
3. **تأكيد تسجيل عميل iOS** كعميل OAuth من نوع "iOS" لأغراض App Check إن رُغب في استخدام DeviceCheck معرَّفاً.
4. **توفير هوية مطوّر Apple** لتوقيع الإصدار (حالياً `Release signing: BLOCKED`).
5. **حساب Google تجريبي** للقبول الحقيقي بتسجيل الدخول (لا يُنشأ تلقائياً).

بدون (1) و(2) سيُرجع Google Sign‑In على Android خطأ `DEVELOPER_ERROR`/بصمة غير صالحة.

---

## 9. حالة المستودع

- `main` **لم يُمسّ**.
- PR #1 يبقى **مفتوحاً / Draft** (`base: main`).
- تعديل `ci.yml` المعلّق **محفوظ** وغير مُودَع.

---

## 10. حكم Stage 5

| البند | الحكم |
|---|---|
| إعداد iOS Firebase محلياً | **PASS** |
| تعبئة `GoogleService-Info.plist` (نسخة واحدة، بلا تكرار) | **PASS** |
| مطابقة OAuth URL scheme | **PASS** |
| بناء/تثبيت/إطلاق iOS (بلا demo) | **PASS** |
| `Firebase.initializeApp()` حقيقي | **PASS** |
| شاشة الدخول | **PASS** |
| Google Sign‑In — البنية والتوجيه | **PASS** |
| Google Sign‑In — إتمام حساب حقيقي | **NOT EXECUTED** |
| App Check — تشغيل المزوّد | **PASS (تشغيل)** |
| App Check — نتيجة التحقّق | **غير مؤكَّدة** |
| Android — بنية تحتية | **PASS** |
| Android — تسجيل بصمات SHA | **BLOCKED (سحابي)** |

### **الحكم النهائي: PARTIAL**

ما تحقّق محلياً بالكامل: إعداد iOS، تعبئة `GoogleService-Info.plist`، URL scheme، البناء، التثبيت، الإطلاق، وتهيئة Firebase الحقيقية مع شاشة دخول صحيحة بالعربية RTL.

المتبقي عاجزاً محلياً ويحتاج موافقة صريحة: تسجيل بصمات Android (SHA‑1/SHA‑256)، إتمام تسجيل دخول Google بحساب حقيقي، نتيجة تحقّق App Check من الخادم، وهوية مطوّر Apple. لم يُجرَّب أي تجاوز.