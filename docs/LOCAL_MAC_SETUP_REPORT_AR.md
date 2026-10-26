# تقرير تجهيز بيئة التطوير المحلية على macOS — Velnix

**التاريخ:** 2026-10-16
**الجهاز:** MacBook Pro (Intel)
**المستودع:** https://github.com/Mode2094/velnix
**الفرع:** `audit/production-readiness`
**مشروع Firebase:** `velnix-6c1a2`

> هذا التقرير يوثّق تجهيز بيئة العمل محلياً فقط. **لم يتم نشر أي مورد سحابي** (Hosting / Functions / Rules / Indexes)، ولم يتم تعديل IAM أو الفوترة أو مزوّدي المصادقة أو إنفاذ App Check، ولم يتم إنشاء أو تعديل المدير العام، ولم يتم تفعيل Push أو Scheduler، ولم يتم التواصل مع Click Delivery، ولم يتم دمج PR #1، ولم يتم أي force-push.

---

## 1. مواصفات Mac والإصدارات المدعومة

| البند | القيمة |
|---|---|
| نظام التشغيل | macOS 15.8.1 (Build 24H32) |
| البنية | `darwin-x64` — Intel (معالج i9-8950HK @ 2.90GHz) |
| الذاكرة | 32 GB |
| القرص المتاح | 156 GB من أصل 466 GB |
| الصدفة (Shell) | zsh (`/bin/zsh`) |

### إصدارات الأدوات (مُتحقَّق منها فعلياً)

| الأداة | الإصدار المثبّت | المصدر المعتمد |
|---|---|---|
| Flutter | **3.47.7** (مثبَّت على الوسم `3.47.7`) | مثبَّت مسبقاً في `~/flutter` ثم وُسِط على الوسم المطلوب |
| Dart SDK | **3.13.5** (DevTools 2.60.0) | مرافق لـ Flutter 3.47.7 |
| Node.js | **22.23.3** | ملف رسمي من nodejs.org، تم التحقق من بصمة SHA-256 |
| npm | **10.9.9** | مرافق لـ Node 22.23.3 |
| Java (JDK) | **21.0.12.1** | Homebrew `openjdk@21` (يطابق `java-version: 21` في CI) |
| Firebase CLI | **15.22.4** (عام) + `firebase-tools ^15.33.0` (محلي داخل `functions/`) | Homebrew / `package.json` |
| Xcode | **16.0** (Build 16A242d) | مُثبَّت مسبقاً |
| CocoaPods | **1.17.0** | Homebrew |
| Android SDK | Platform `android-37`، Build-Tools `37.0.0`، Command-line Tools | مُثبَّتة مسبقاً |
| Git | 2.39.5 (Apple Git-154) | مُثبَّت مسبقاً |
| Homebrew | 7.0.8 | مُثبَّت مسبقاً |
| Google Cloud SDK | 580.0.0 | مُثبَّت مسبقاً |
| Playwright | 1.64.0 | مُثبَّت في `/tmp` كما في CI |
| Chrome | Google Chrome 155.0.8059.82 | مُثبَّت مسبقاً |

### لماذا تم تعديل إصدارَي Flutter و Node

الملف `.flutter-version` و `.github/workflows/ci.yml` يحدّدان **Flutter 3.47.7** و **Node 22.23.3**، و `functions/package.json` يصرّح `engines.node = "22"`. كانت القيم الموجودة مسبقاً **Flutter 3.44.4** و **Node v24.15.0** — أي غير مطابقة. تم:

- تثبيت Flutter على الوسم `3.47.7` تماماً (لا `flutter upgrade`، لتفادي الانتقال إلى إصدار أحدث قد يكسر قفل التبعيات).
- تثبيت Node 22.23.3 من ملف nodejs.org الرسمي في مسار معزول `~/.local/node-v22.23.3` **دون المساس بـ Node 24 المثبَّت في النظام**، حفاظاً على المشاريع الأخرى.

### تفعيل البيئة

```bash
source ~/.config/velnix/env.sh
```

يضبط: Node 22.23.3، `JAVA_HOME` لـ OpenJDK 21، `ANDROID_HOME`، مسار Flutter، و `LANG=en_US.UTF-8` (وإلا complained CocoaPods من ترميز الطرفية).
هذا الملف يقع خارج المستودع ولا يحتوي أي أسرار.

> **ملاحظة:** محاولة Homebrew `node@22` فشلت لأن تبعيتها `python@3.13` تحتاج بناءً من المصدر على Intel واستغرقت أكثر من 15 دقيقة دون اكتمال؛ تم التحوّل للملف الرسمي من nodejs.org وتم التحقق من بصمته عبر `SHASUMS256.txt` الرسمي.

---

## 2. حالة المستودع والفرع

| البند | الحالة |
|---|---|
| مجلد العمل | `/Users/mrik/Desktop/Velnix` (استنساخ مباشر، بدون مجلد `velnix/` متداخل) |
| الفرع الحالي | `audit/production-readiness` |
| **SHA المُفحص فعلياً** | **`126fd612ebe7759aceaeb6589e89e76a2142b549`** |
| مطابقة لآخر commit معروف | ✅ **مطابقة تامة** |
| الفرع `main` | لم يُمس — لا يزال عند `0d10904` |
| عمليات reset / force-push | **لا يوجد** |
| Commit محلي جديد | **لا يوجد** (لم يتم commit أو push) |

### ملاحظة عن مجلد العمل

كان المجلد يحتوي على `.git` فارغ من إنشاء OpenCode (صفر commits، بدون remote). تم التعامل معه **دون حذف**: أُضيف الـ remote ثم جُلبت الفروع وأُنشئت branche العمل من `origin/audit/production-readiness`. لم يُمحَ أي ملف مستخدم.

### حالة CI على هذا الـ commit

```
success | completed | Validate Velnix | 126fd612eb
```

CI **خضراء** على نفس الـ SHA المفحوص — وهذا مرجع حاسم لتفسير نتائج الاختبار في §6.

---

## 3. التبعيات المثبَّتة

| المرحلة | الأمر | النتيجة |
|---|---|---|
| Flutter | `flutter pub get --enforce-lockfile` | ✅ نجح — القفل مطابق لـ Flutter 3.47.7 |
| Functions | `npm --prefix functions ci` | ✅ 845 حزمة، `package-lock.json` سليم |
| Java للـ emulator | OpenJDK 21 | ✅ |
| CocoaPods | `pod install` (عبر `flutter build ios`) | ✅ بعد `pod repo update` |
| المتصفح | `npm install playwright@1.64.0` ×2 | ✅ |
| Python للباركود | venv + `zxing-cpp==3.1.1`, `Pillow==12.3.0` | ✅ |

> **مشكلة بيئية حُلّت:** فشل `pod install` أول مرة بالرسالة *"CocoaPods's specs repository is too out-of-date"*. تم تنفيذ `pod repo update` (عملية محلية آمنة) ثم نجح البناء.

---

## 4. Firebase — الجاهزية والمصادقة

| البند | الحالة |
|---|---|
| Firebase CLI مسجَّل الدخول | ✅ باسم `moderohe8@gmail.com` |
| Google Cloud SDK مسجَّل | ✅ باسم `moderohe8@gmail.com` |
| تطبيق Web مسجَّل | ✅ `1:948196868655:web:ace9b264b4fae48ac43cda` |
| Sender ID / Project Number | `948196868655` |
| Blaze / المدير العام / Functions | **لم يُمس** — لم تُنفَّذ أي إعادة تهيئة أو نشر |
| App Check | **لم يُمس** — لم يتم تعطيله أو تعديل إنفاذه |

### ملف الإعداد المحلي

الملف المطلوب `config/firebase.stage3.production.public.json` **لم يكن موجوداً** على الـ Mac (فهو git-ignored وقد كان متاحاً في Cloud Shell فقط). تم إنشاؤه من مصادر Firebase الرسمية **قراءة فقط**:

- `firebase apps:sdkconfig WEB <web-app-id>` → Project ID, App ID, API Key, Sender ID, Auth Domain.
- `gcloud auth print-access-token` + REST API الرسمي لـ `recaptchaenterprise` → مفتاح reCAPTCHA Enterprise المسجَّل للنطاق `velnix-6c1a2.web.app` (`displayName: velnix`، `integrationType: SCORE`).

**لم يتم اختلاق أي قيمة.** تم التحقق من مطابقة المخطط (13 حقلاً) لملف `config/firebase.production.public.example.json` المعتمد في المستودع، والحقول مستخرجة حرفياً من الاستجابات الرسمية.

### الأعلام المحفوظة (كما هو مطلوب)

| الحقل | القيمة |
|---|---|
| `VELNIX_MODE` | `live` |
| `VELNIX_ENVIRONMENT` | `production` |
| `VELNIX_GOOGLE_ENABLED` | `true` |
| `VELNIX_PUSH_ENABLED` | `false` |
| `VELNIX_DEBUG_APPCHECK` | `false` |

###Protection من Git — مؤكد

```
.gitignore:12:config/firebase.*.json   config/firebase.stage3.production.public.json
```

الملف **مُتجاهَل**؛ و `check_secrets.py` ما زال يبلّغ **0 نتائج** من 411 ملفاً متتبَّعاً. لم تُضَف أي مفاتيح أو مسارات خاصة إلى Git.

### فحص ما قبل الإنتاج (أداة المستودع نفسها)

```bash
python3 scripts/check_runtime_config.py config/firebase.stage3.production.public.json \
  --environment production --platform web --expected-project velnix-6c1a2
```
→ `Public configuration preflight passed` ✅

### حقل واحد فارغ عن قصد

`GOOGLE_WEB_CLIENT_ID` ترك فارغاً. **هذا ليس نقصاً** — بعد مراجعة `lib/live/live_app.dart:127-143`، مسار Web يستخدم `signInWithPopup(GoogleAuthProvider())` ولا يقرأ هذا الحقل إطلاقاً؛ هو مطلوب فقط لـ Android/iOS/ macOS. كما أن `check_runtime_config.py` لا يشترطه لمنصة `web`. **مطلوب لاحقاً لبناء Android/iOS** (انظر §8).

---

## 5. نتائج `flutter doctor -v`

| القسم | الحالة |
|---|---|
| Flutter 3.47.7 | ✅ (مع تحذير channel — see below) |
| Android toolchain | ✅ مع تحذير التراخيص |
| Xcode + CocoaPods | ✅ |
| Chrome | ✅ |
| Network resources | ✅ |

التحذيرات مفسَّرة في §8. **الأهم:** تحذير *"Flutter is deprecating support for Intel-based Macs"* — إصدار مستقبلي من Flutter سيشترط جهاز Apple Silicon لبناء التطبيقات. هذه مخاطرة استراتيجية يجب التخطيط لها.

---

## 6. نتائج الاختبارات — بالأوامر الدقيقة

### ناجحة

| الاختبار | الأمر | النتيجة |
|---|---|---|
| التنسيق | `dart format --output=none --set-exit-if-changed lib test` | ✅ 50 ملفاً، 0 تغيير |
| فحص الأسرار | `python3 scripts/check_secrets.py` | ✅ 411 ملفاً، **0 نتائج** |
| إعدادات التشغيل | `python3 scripts/test_runtime_config.py` | ✅ 7/7 |
| إعدادات Firebase | `python3 scripts/test_firebase_setup.py` | ✅ 7/7 |
| التحليل الساكن | `flutter analyze` | ✅ **No issues found** |
| الباركود | `/tmp/velnix-qa/bin/python scripts/verify_barcodes.py` | ✅ كل المقاسات (203/300/600 DPI) |
| Functions — صياغة | `npm --prefix functions run syntax` | ✅ |
| Functions — تدقيق إنتاجي | `npm --prefix functions audit --omit=dev --audit-level=high` | ✅ **0 ثغرات** |
| Functions — وحدات | `npm --prefix functions test` | ✅ **128/128** |
| Functions — emulator | `npm --prefix functions run test:emulator` | ✅ 68/68 (انظر عدم الاستقرار أدناه) |
| اختبار المتصفح | `NODE_PATH=… CHROME_EXECUTABLE=… node scripts/browser_smoke.cjs` | ✅ **30 مدخلاً، 0 أخطاء صفحة** (5 أدوار × 3 عروض × شاشتان) |
| عزل الإنتاج | `node scripts/emulator-preview/assert-production.cjs` | ✅ لا توجد علامات emulator-preview |
| واجهة المحاكي | `bash scripts/emulator-preview/run-qa.sh` | ✅ **21/21 سيناريو** |

### تفصيل ملاحظة npm

`npm ci` أبلغ عن **16 ثغرة (4 متوسطة، 12 عالية)**. فحص بوابة CI `--omit=dev --audit-level=high` أبلغ **0**. كلها في تبعيات التطوير فقط. **لم يُنفَّذ `npm audit fix --force`** (ممنوع، وكان سيكسر القفل).

### الفاشلة / غير المستقرة

#### أ) 18 اختبار Golden fails — فرق عرض بين macOS و Linux

```
flutter test --reporter expanded   →   +310 passed / 18 failed
```

**كل الـ18 فشل هي مقارنة بكسل للصور الذهبية فقط**، بنسب **0%–1%**:
`goldens/delivery_quality/*.png`, `goldens/arabic_controls_390.png`, `goldens/live_dashboard_390.png`. عدد markers `FAILURE:`/`BUILD FAILED` في البناء = **0**.

**التشخيص:** الأصول الذهبية مُولَّدة على `ubuntu-latest` (CI). على macOS يختلف تنعيم الحواف (antialiasing) وتشكيل الحروف العربية (CoreText مقابل FreeType/HarfBuzz). **هذا ليس عيباً في الكود.**

**الدليل القاطع:** CI **خضراء** على نفس الـ SHA `126fd612eb`، وجميع الاختبارات الـ18 هي مقارنات بصرية فقط بلا أي تأكيد منطقي.

**الإجراء المتخذ: لا شيء — ولم تُعَد توليد الصور الذهبية.** إعادة توليدها على macOS كانت ستكسر خط أساس Linux وتُضعف البوابة. **CI يبقى المرجع.** أما الاختبارات الـ310 الأخرى فنجحت.

#### ب) اختبار emulator غير مستقر تحت الحمل

```
npm --prefix functions run test:emulator
→ 2 من 4 تشغيلات للمجموعة الكاملة فشلت في:
  "concurrent REST bootstrap attempts produce exactly one administrator and audit"
```

عند الفشل كان عدد العمليات الناجحة **0 بدل 1** — أي أن **كلتا** المحاولتين أُلغيتا. هذا **اتجاه آمن (fail-closed)** وليس ثغرة (لم ينجح bootstrapping زائد).

بالتشغيل **منعزل** لهذا الملف فقط: **5/5 نجاح**. يتكرر فقط عند تشغيل المجموعة كاملة تحت حمل الجهاز (load average ≈ 9.4 / 12 نوى).

**الإجراء المتخذ: لم يُعدّل الاختبار.** تعديله_locale زمني سيفرض «إضعاف» اختبار أمني. موثّق كـ flaky معروف؛ **CI على Linux هو المرجع الحاكم**.

---

## 7. نتائج البناء

| البناء | الأمر | النتيجة |
|---|---|---|
| **Web — إنتاج (Live)** | `flutter build web --release --no-web-resources-cdn --no-wasm-dry-run --dart-define-from-file=config/firebase.stage3.production.public.json` | ✅ **نجح** — `build/web/main.dart.js` = 4,662,590 بايت |
| Web — Demo (طابقة CI) | `flutter build web --no-web-resources-cdn --no-wasm-dry-run --dart-define=VELNIX_MODE=demo` | ✅ |
| Web — Live (CI) | `… --dart-define=VELNIX_MODE=live` | ✅ |
| **Android — Demo** | `flutter build apk --debug --dart-define=VELNIX_MODE=demo` | ✅ |
| **Android — Live** | `flutter build apk --debug --dart-define=VELNIX_MODE=live` | ✅ — `app-debug.apk` = 168,536,100 بايت |
| **iOS** | `flutter build ios --debug --no-codesign` | ✅ **`build/ios/iphoneos/Runner.app`** — 0 أخطاء |

> **ملاحظة Android:** ظهر stack trace أثناء البناء الأول، لكن الفحص الفعلي أكّد **0** markers لـ `FAILURE:`/`BUILD FAILED`. السبب تحذير *Built-in Kotlin* من إضافة خارجية، وهو تنبيه توافق مستقبلي لا خطأ. البناءان نجحا بـ exit code 0.

### التحقق من بناء Web الإنتاج (متطلب §G)

| الفحص | النتيجة |
|---|---|
| `build/web/main.dart.js` موجود | ✅ |
| لا تسريب سلوك emulator/demo | ✅ لا `demo-velnix*`، لا `useEmulators`، لا `127.0.0.1:(9099\|8080\|5001)` |
| `VELNIX_MODE` مضمّن فعلياً كـ `live` | ✅ **مُثبَّت وقت الترجمة** — `String.fromEnvironment` اختفى من الحزمة، وبقي جدول الثوابت `["demo","live"]` فقط |
| تسجيل Google مفعّل | ✅ `VELNIX_GOOGLE_ENABLED=true`، و `lib/live/live_app.dart` يمرّ بمسار Live |
| App Check من نوع Enterprise | ✅ `ReCaptchaEnterpriseProvider` (`lib/core/firebase_configuration.dart:12`) + مفتاح SCOPE مدمج |
| Debug App Check معطّل | ✅ لا `DebugAppCheckProvider`، و `main.dart:53` يرفضه في وضع release |
| المشروع والمناطق مطابقة لـ Velnix | ✅ `velnix-6c1a2` + `europe-west1` |
| Hosting يستهدف `build/web` | ✅ `firebase.hosting.json` → site `velnix-6c1a2`, public `build/web`, rewrite → `/index.html` |

**لم يتم نشر Hosting.** البناء جاهز للنشر فقط.

---

## 8. العوائق غير المحلولة

| # | العائق | الأثر | التوصية |
|---|---|---|---|
| 1 | **18 اختبار Golden يفشل على macOS** (اختلاف rasterization) | فشل مجموعة Flutter محلياً؛ **CI خضراء** | لا تُعِد توليد الأصول الذهنية. استخدم CI كمصدر حقيقة للعوائق البصرية. |
| 2 | **اختبار emulator غير مستقر** تحت الحمل | فشل متقطّع في 2 من 4 تشغيلات | لا تعديل. يُقصد به التشغيل على CI؛ محلياً أعد التشغيل أو شغّله منفرداً. |
| 3 | **توقيع iOS غير مُعد** | لا يمكن بناء جهاز/Archive/TestFlight | يلزم Apple Developer Team في Xcode → Signing & Capabilities + Certification. **أمر يدوي لا يمكن أتمتته.** |
| 4 | **Flutter يعلن_DEPRECATION لـ Intel** | لا يعطّل شيئاً الآن؛ **إصدار مستقبلي سيفشل على Intel** | خطّط للانتقال إلى Apple Silicon (كل Apple Silicon يدعمه). |
| 5 | `flutter doctor`: Android licenses not accepted | **تجمّلي** — ملفات التراخيص موجودة في `~/Library/Android/sdk/licenses/` وبناءا Android نجحا عملياً | للتFormal: `flutter doctor --android-licenses` |
| 6 | **`GOOGLE_WEB_CLIENT_ID` فارغ** | لا يؤثر على Web إطلاقاً | مطلوب لبناء Android/iOS بتوقيع Google. يُقرأ من Google Cloud Console → Credentials → OAuth 2.0 Web client |
| 7 | **Flutter على "unknown channel"** | تحذير تجميلي ناتج عن intentional pinning على الوسم `3.47.7` | مقصود للمطابقة مع CI. |
| 8 | **لم يتم اختبار الإنتاج الحقيقي** (تسجيل Google + App Check فعلي على `velnix-6c1a2`) | غير مُختبَر عمداً | يتطلب **موافقة صريحة** — سيتصل بoving Firebase الإنتاج. **لم يُنفَّذ.** |

> **لم يُطلب منك أي تثبيت عبر App Store أو Gatekeeper ولم يتم تجاوز أي حارس أمني.** Xcode كان مُثبَّتاً مسبقاً.

---

## 9. التغييرات في شجرة العمل (غير مُلتزَم / غير مُرسَل)

**لم يتم إنشاء أي commit ولا أي push.** `main` غير مُسّ.

### أ) إصلاح حقيقي مطلوب — `scripts/emulator-preview/browser.cjs`

كان اختبار واجهة المحاكي **مكسوراً على macOS**، وليس معطوباً في الكود:

```
FAIL UI edit, stale revision protection, internal transitions and terminal lock
+ actual   'تم تعديل الطلب عبر الواجهةمحاكيات فقط'
- expected 'تم تعديل الطلب عبر الواجهة'
```

**السبب الجذري:** السكربت كان يستدعي `Control+A` لتحديد الكل. على macOS `Ctrl+A` هو **«الانتقال لأول السطر»** (ربط emacs) وليس تحديد الكل — التحديد على macOS هو **`Cmd+A`**. لم يُحذف النص الموجود مسبقاً، بل أُلحق. (نفس الخلل كان في 3 مواضع.)

**الإصلاح:** دالة `selectAll`_follow المنصّة — **لا تُضعِف أي تأكيد**:

```js
// macOS binds Ctrl+A to "move to line start"; select-all is Cmd+A, so the
// key must follow the host platform or existing field text is never replaced.
const selectAll=p=>p.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');
```

**النتيجة بعد الإصلاح:** **21/21 سيناريو ناجح** (كان 20/21). لم يُعدَّل أي منطق أو نص أو تحقق.

**السلوك على Linux لم يتغير** — يبقى `Control+A` كما في CI.

### ب) تعديلات مولَّدة من الأدوات (CocoaPods / Flutter)

| الملف | التغيير |
|---|---|
| `ios/Flutter/Debug.xcconfig` | `+1` سطر: `#include? "Pods/…/Pods-Runner.debug.xcconfig"` |
| `ios/Flutter/Release.xcconfig` | `+1` سطر: نفس سطرPods لكن لإعداد Release |
| `ios/Runner.xcodeproj/project.pbxproj` | +165/-19 (تكامل CocoaPods) |
| `ios/Runner.xcworkspace/contents.xcworkspacedata` | +3 |

هذه **مطلوبة** لبناء iOS، وولّدتها `pod install` تلقائياً. ملاحظة: `ios/Podfile` **غير متتبَّع في المستودع الأصلي** (لم يلتزم به أحد) — أنشأه Flutter محلياً.

**اقتراح لهذه الأربعة:**  إما الالتزام بها على الفرع (وهي تكامل CocoaPods القياسي) أو `git checkout --` عنها بعد الانتهاء من بناء iOS — لكن **البناء سيفشل** بدونها.

### ج) ملفات غير متتبَّعة غير مهمة
`.DS_Store` (7 ملفات) — أثر macOS. **لم تُحذف** احتراماً لملفات المستخدم.

---

## 10. هل الجهاز جاهز بالكامل لمتابعة تطوير Velnix؟

**نعم — جاهز للتطوير، والبناء، والاختبار، وتشغيل عمليات Firebase محلياً.**

| القدرة | الحالة |
|---|---|
| Flutter / Dart / Node / Java / Android / Xcode / CocoaPods | ✅ كلها مطابقة لـ CI |
| `flutter analyze` + تنسيق + فحص أسرار | ✅ نظيف |
| اختبارات Dart (310) | ✅ غير الـ18 البصرية |
| Functions (128 وحدة + 68 emulator) | ✅ |
| اختبار متصفح + واجهة محاكي (21 سيناريو) | ✅ |
| بناء Web / Android / iOS | ✅ الثلاثة |
| Firebase CLI + gcloud مُصادَقَين | ✅ |
| إعداد الإنتاج المحلي جاهز ومُتحقَّق منه | ✅ |

**التحفّظ الوحيد:** بوابة الاختبارات البصرية الكاملة تبقى على CI (لا يمكن تشغيلها محلياً على Intel دون كسر خط الأساس).

---

## 11. هل بناء Web الإنتاج جاهز بأمان للنشر عبر Hosting فقط؟

**نعم — جاهز، ومُتحقَّق منه بالكامل، ولم يُنشر.**

**ما تم التحقق منه:** البناء ناجح، لا تسريب emulator/demo، المشروع `velnix-6c1a2` ومنطقة `europe-west1` مطابقة، App Check Enterprise مفعّل بمفتاحه العام الصحيح، Debug App Check معطّل، تسجيل Google مفعّل، `VELNIX_PUSH_ENABLED=false`، و `firebase.hosting.json` يستهدف `build/web` على site `velnix-6c1a2`.

**⚠️ تحذير جوهري:** نجاح الـ emulator **ليس إثباتاً لنجاح الإنتاج**. لم يتم بعد:
1. تسجيل Google الحقيقي على `velnix-6c1a2`.
2. التحقق من أن مفتاح App Check يُصدر رمزاً صالحاً على النطاق `velnix-6c1a2.web.app` بعد النشر.
3. التحقق من قبول Google Cloud authorizes `velnix-6c1a2.firebaseapp.com` و `velnix-6c1a2.web.app` في **Authorized domains** (وإلا سيفشل تسجيل GooglePopup على الإنتاج رغم نجاحه في المحاكي).

**يُنصح بهذه الخطوات الثلاث أولاً عبر حساب Google الحالي قبل أي نشر**، لأنها لا تحتاج نشراً.

---

## 12. الخطوات التالية الموصى بها بالضبط

**لا تُنفّذ أياً منها تلقائياً — تتطلب موافقتك.**

### الخطوة التالية (رقم 1 فقط، موصى به بشدة):

```bash
cd /Users/mrik/Desktop/Velnix
source ~/.config/velnix/env.sh
git diff                     # راجع تعديلات iOS + إصلاح macOS
git add ios/Flutter/Debug.xcconfig ios/Flutter/Release.xcconfig \
        ios/Runner.xcodeproj/project.pbxproj \
        ios/Runner.xcworkspace/contents.xcworkspacedata \
        scripts/emulator-preview/browser.cjs
git commit -m "fix: support macOS select-all in emulator UI QA and track CocoaPods integration"
# ثم: افتح/حدّث PR جديد — **لا** تدمج PR #1، واتركه Draft
```

**لا تنشر Hosting بعد.** بعد ذلك:

1. **تحقق من Authorized domains** في Firebase Console → Authentication → Settings.
2. **اختبر تسجيل Google الحقيقي** + إصدار رمز App Check على نطاق الاستضافة.
3. **عندها فقط** — وبموافقة صريحة منفصلة — انشر Hosting فقط:
   ```bash
   firebase deploy --only hosting --config firebase.hosting.json --project velnix-6c1a2
   ```

**أوامر يجب ألّا تُنفَّذ في هذه المرحلة:** `firebase deploy --only functions` / `firestore` / `hosting`، تعديل IAM، إعادة تهيئة المدير، تفعيل Push، دمج PR #1، أي `git push --force`.

---

## ملخص حالة الموارد السحابية

| المورد | الحالة بعد هذا العمل |
|---|---|
| Functions (23 دالة) | **لم يُمس** |
| Firestore Rules / Indexes | **لم يُمس** |
| Firebase Hosting | **لم يُنشر** |
| IAM / الفوترة / Blaze | **لم يُمس** |
| مزودو المصادقة | **لم يُمس** |
| App Check (إنفاذ/تسجيل) | **لم يُمس** |
| المدير العام | **لم يُمس** |
| Push / Scheduler | **لم يُمس** |
| Click Delivery | **لم يُتواصل معه** |
| PR #1 | **لم يُدمج — لا يزال Draft** |
| `main` | **لم يُمس** |