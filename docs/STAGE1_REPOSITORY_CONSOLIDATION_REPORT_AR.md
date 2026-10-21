# Velnix — المرحلة الأولى: توحيد المستودع واسترجاع الأدلة

**التاريخ:** 2026-10-16
**المستودع:** `Mode2094/velnix`
**الفرع:** `audit/production-readiness`
**مشروع Firebase:** `velnix-6c1a2`
**PR #1:** مفتوح — **Draft** — غير مدموج (مؤكد بعد الدفع)

> **نطاق المرحلة:** توحيد الحالة المحلية، توثيق التدقيق، استرجاع الأدلة، والتحقق.
> **لم يُنفَّذ:** نشر Firebase، تعديل IAM، تعديل المدير العام، تفعيل Push/Scheduler، التواصل مع Click، أو دمج PR #1.

---

## 1. الـSHA النهائي

| البند | القيمة |
|---|---|
| خط الأساس | `126fd612ebe7759aceaeb6589e89e76a2142b549` |
| **الـSHA النهائي بعد الدفع** | **`e8992d6fd11f32b2197449ab89d7168cb90dc043`** |
| الطويل المختصر | `e8992d6` |
| الفرع البعيد | مطابق تماماً (`git ls-remote` = نفس القيمة) |
| `main` | `0d10904ff6109096c0b361f2fca8719042160a1c` — **لم يُمس** |
| Ancestry | خط الأساس **سلف** فعلي للفرع الحالي ✅ |
| انزياح_remote | **لا يوجد** — لم تتغير الفروع البعيدة |

---

## 2. الـCommits الثلاثة والملفات

### Commit 1 — `2836011` — إصلاح توافق macOS

```
fix(qa): use platform-aware select-all in emulator UI browser harness
```

**ملف واحد:** `scripts/emulator-preview/browser.cjs` (+6/−3)

**التشخيص:** `Ctrl+A` على macOS هو «الانتقال لأول السطر» (ربط emacs) وليس تحديد الكل. التحديد هو `Cmd+A`. لذلك لم يُحذف النص الموجود مسبقاً بل أُلحق، وفشل سيناريو «UI edit, stale revision protection…».

**الإصلاح:** `selectAll()` تُعيد `Meta+A` على darwin و `Control+A` على غيرها.

**إثبات التوافق عبر المنصات (بتنفيذ node حقيقي):**

| المنصة | قبل | بعد |
|---|---|---|
| `darwin` | `Control+A` (خاطئ) | `Meta+A` ✅ |
| `linux` | `Control+A` | `Control+A` — **مطابق تماماً** |
| `win32` | `Control+A` | `Control+A` — **مطابق تماماً** |

⇒ **سلوك CI على Linux لم يتغير إطلاقاً.** لا يُضعِف أي تأكيد أمني.

### Commit 2 — `3004b4b` — تكامل CocoaPods

```
build(ios): track CocoaPods integration for reproducible iOS builds
```

**خمسة ملفات** (+199/−16): `ios/Podfile` (جديد)، `ios/Flutter/Debug.xcconfig` (+1)، `ios/Flutter/Release.xcconfig` (+1)، `ios/Runner.xcodeproj/project.pbxproj` (+165/−16)، `ios/Runner.xcworkspace/contents.xcworkspacedata` (+3)

**لماذا كان ضرورياً:** المستودع لم يتتبّع `ios/Podfile` ولا أي ربط CocoaPods. استنساخ نظيف لا يستطيع حلّ الـpods حتمياً؛ كان على `flutter build ios` توليد الـPodfile وعلى `pod install` إعادة كتابة مشروع Xcode قبل نجاح البناء.

**تغيير Podfile المُدخَل:** فكّ تعليق `platform :ios, '15.0'` ليطابق `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.
⇒ **النتيجة المثبتة:** اختفى تحذير CocoaPods ‏*«Automatically assigning platform iOS with version 15.0 … Please specify a platform»*، وبناء iOS نجح.

**التحقق من أن diff الـpbxproj إضافي وليس حذفاً:**

| القسم | HEAD | بعد | الفرق |
|---|---:|---:|---:|
| `PBXFileReference` | 18 | 26 | **+8** (إطارات Pods) |
| `PBXShellScriptBuildPhase` | 3 | 7 | **+4** (مراحل `[CP]`) |
| `PBXGroup` | 5 | 7 | **+2** |
| `PBXNativeTarget` | 2 | 2 | 0 |
| `XCBuildConfiguration` | 9 | 9 | 0 |

⇒ **لم يُحذف شيء.** طُبّقت إعادة ترتيب فقط، وتأكدنا أن جميع ما يلي **ما زال موجوداً** بعد البناء:

- مرحلة `Copy local Firebase configuration` (3 إشارات، كما في HEAD)
- مرجع `GoogleService-Info.plist` (2، كما في HEAD)
- مرجع `FlutterGeneratedPluginSwiftPackage` (10، كما في HEAD)

**فحص الأمان:** لا مسارات جهاز، لا `DEVELOPMENT_TEAM`، لا مفاتيح، لا أسرار في الـdiff المُدرج.
`ios/Pods/` **يبقى مُتجاهَلاً** (تحقّق عبر `git check-ignore`).

### Commit 3 — `e8992d6` — توثيق التدقيق

```
docs: add requirements audit, traceability matrix and evidence recovery
```

**تسعة ملفات** (+1,978): خمسة تقارير `docs/VELNIX_*.md` + `docs/LOCAL_MAC_SETUP_REPORT_AR.md` + أربعة ملفات في `docs/evidence-import/`.

**الحجم الإجمالي للمرحلة:** **15 ملفاً، ‎+2,196/−19.**

### لم يُلتزم عمداً

| العنصر | السبب |
|---|---|
| ملفات `.DS_Store` (7) | أثر macOS؛ ليست مرتبطة بالمشروع |
| `config/firebase.stage3.production.public.json` | **إعداد إنتاج محلي** — مُتجاهَل، ومُتحقَّق أنه غير مُدرج |
| `build/` و`.dart_tool/` | مُتجاهَلة |
| الأصلان الخامّان لـClick | **يحتويان قيم اعتماد نموذجية** — محميان بـ`.gitignore` |

---

## 3. هل تم اعتماد Podfile وإصلاحات CocoaPods؟

**نعم — كـcommit مستقل (`3004b4b`) ومضغوط إلى GitHub.**

| الملف | مُلتزم؟ |
|---|---|
| `ios/Podfile` | ✅ **نعم — جديد في المستودع** |
| `ios/Flutter/Debug.xcconfig` | ✅ نعم |
| `ios/Flutter/Release.xcconfig` | ✅ نعم |
| `ios/Runner.xcodeproj/project.pbxproj` | ✅ نعم |
| `ios/Runner.xcworkspace/contents.xcworkspacedata` | ✅ نعم |
| `ios/Pods/` | ❌ لا (مُتجاهَل عمداً) |

**تأكيد:** البناء نجح **بعد** التغيير، والتحذير اختفى.

---

## 4. الاختبارات المحلية والنتائج الدقيقة

| # | البوابة | الأمر | النتيجة |
|---|---|---|---|
| 1 | تنسيق Dart | `dart format --output=none --set-exit-if-changed lib test` | ✅ **50 ملفاً، 0 تغيير** |
| 2 | فحص الأسرار | `python3 scripts/check_secrets.py` | ✅ **421 ملفاً، 0 نتائج** |
| 3 | إعدادات التشغيل | `python3 scripts/test_runtime_config.py` | ✅ **7/7** |
| 4 | إعدادات Firebase | `python3 scripts/test_firebase_setup.py` | ✅ **7/7** |
| 5 | تحليل ساكن | `flutter analyze` | ✅ **No issues found** |
| 6 | اختبارات Flutter | `flutter test --reporter json` | ⚠️ **329 ناجح / 18 فاشل** |
| 7 | تبعيات Functions | `npm --prefix functions ci` | ✅ 845 حزمة |
| 8 | صياغة JS | `npm --prefix functions run syntax` | ✅ |
| 9 | تدقيق إنتاجي | `npm --prefix functions audit --omit=dev --audit-level=high` | ✅ **0 ثغرة** |
| 10 | وحدات Functions | `npm --prefix functions test` | ✅ **128/128** |
| 11 | Firestore Emulator | `npm --prefix functions run test:emulator` | ✅ **68/68** |
| 12 | الباركود | `verify_barcodes.py` | ✅ **36/36** |
| 13 | **Chromium UI** | `bash scripts/emulator-preview/run-qa.sh` | ✅ **21/21 سيناريو** |
| 14 | بناء iOS | `flutter build ios --debug --no-codesign` | ✅ `Runner.app` |
| 15 | بناء Web إنتاجي | `flutter build web --release …` | ✅ `main.dart.js` |
| 16 | عزل الإنتاج | `node scripts/emulator-preview/assert-production.cjs` | ✅ لا علامات emulator |
| 17 | بناء Android | `flutter build apk --debug` (demo + live) | ✅ `app-debug.apk` |

### 4.1 الإخفاقات الـ18 — مُبلَّغ عنها دون إخفاء

**كل الـ18 هي مقارنة بكسل للصور الذهبية.** تحقّقت آلياً: **18 فشل ↔ 18 مرجع `Golden "goldens/…"`** (تطابق 1:1).

| النوع | العدد |
|---|---|
| `Arabic live visual regression` (5 شاشات × 3 عروض) | 15 |
| `Arabic controls … rendered baseline` | 1 |
| `live dashboard golden at phone width` | 1 |
| `loading error and empty states … 390.0 scale 1.0` | 1 |

**نسب الاختلاف المرصودة: 1.00% و 5.31% فقط.**

**الدليل الحاسم:** CI على `ubuntu-latest` **أخضر بالكامل** عند نفس الـSHA (انظر §5). هذا يثبت أنها فروق **rasterization** بين macOS (CoreText) و Linux (FreeType/HarfBuzz)، وليست عيب شيفرة.

**لم تُعَد توليد الصور الذهبية** — كان سيكسر خط أساس Linux. **CI هو المرجع.**

### 4.2 عدم استقرار اختبار المحاكي — لم يظهر في هذه الجولة

`concurrent REST bootstrap attempts produce exactly one administrator and audit`

- في الجولة السابقة: فشل في 2 من 4 تشغيلات للمجموعة الكاملة.
- **في هذه الجولة: 68/68 نجاح — لم يتكرر.**
- نجح أيضاً **5/5** معزولاً في الجولة السابقة.
- عند الفشل سابقاً كان عدد الناجحين **0 بدل 1** ⇒ اتجاه آمن (fail-closed).

**لم يُعدَّل الاختبار.** لم يُخفَف أي اختبار أمني لتحويله إلى «نجاح».

### 4.3 هل هناك انحدار حرج؟

**لا.** لم يظهر أي انحدر. الفارق الوحيد هو **إخفاقات goldens** المعروفة مسبقاً، و**تحذير CocoaPods اختفى** بفضل الـPodfile.

---

## 5. حالة CI على GitHub

### Push CI — `38933957464`

| الوظيفة | النتيجة |
|---|---|
| `flutter` | ✅ success |
| `firebase` | ✅ success |
| `android` | ✅ success |
| `emulator-ui` | ✅ success |
| **الإجمالي** | ✅ **success** |

### PR CI — `38933963165`

| الوظيفة | النتيجة |
|---|---|
| `flutter` | ✅ success |
| `firebase` | ✅ success |
| `android` | ✅ success |
| `emulator-ui` | ✅ success |
| **الإجمالي** | ✅ **success** |

**كلاهما عند `e8992d6fd1`.** ⇒ **CI أخضر ⇒ إخفاقات goldens خاصة بـmacOS فقط، وهذا مُثبَت آلياً وليست تقديراً.**

**PR #1 بعد الدفع:** `OPEN` · `isDraft: true` · `mergeable: MERGEABLE` · `headRefOid: e8992d6f…` — **لم يُدمج.**

---

## 6. إجمالي المتطلبات المحدَّث

**الإجمالي: 140 بنداً** — بلا تغيير في العدد.

| الحالة | العدد | التغيير |
|---|---:|---|
| PASS | **93** | — |
| PARTIAL | **11** | — |
| FAIL | **8** | — |
| NOT TESTED | **22** | — |
| NOT APPLICABLE | **6** | — |

**ما تغيّر هوSaving جودة الأدلة**، لا التصنيفات:

- البنود `D2`, `D11`, `D13` صارت **مُتحقَّقة من الأصل** لا مستنتَجة من ملخص.
- الفجوات `D4`, `D7`, `D10` **مؤكدة وموجودة في المستند الرسمي نفسه**.
- **لم يتغيّر أي حكم**: التكامل يبقى محجوباً عمداً.

---

## 7. استرجاع الأدلة — النتيجة الحاسمة

### 7.1 ما تم استرجاعه والتحقق منه 🎯

| الملف | الموقع | البصمة | النتيجة |
|---|---|---|---|
| `ClickApi.postman_collection.json` | `~/Downloads/` | `5070b1e14c4a6831c29bfba3c2f13267ca821b1e895215c109ed9639b0925061` | ✅ **مطابقة تماماً** |
| `clickdelivery api[1] (2).txt` | `~/Downloads/` | `bc1c465ff57a5f67550fab43b8812217d380e260652c285a20a542c0af6f405f` | ✅ **مطابقة تماماً** |

طابقت البصمتان `docs/evidence/click-delivery-contract.json` **بايت-ببايت** ⇒ **الأصلان الأصيلان**.

### 7.2 ما أكّده الفحص المباشر للأصل (لا استنتاج)

| البند | النتيجة |
|---|---|
| عناصر Postman | **2 فقط** — `getorder` و `removeorder` |
| `setorder` في Postman | ❌ **غير موجود** |
| طريقة `setorder` | ❌ **غير موثّقة** — `request name` فقط بلا `method` |
| رأس المصادقة | `Authorization: client` بنوع `text` — **حرفي وليس Bearer** |
| رأس `Content-Type` | ❌ **غير موجود** |
| استجابات محفوظة | **0** في Postman، **0** في النص |
| أمثلة JSON | **معطوبة بفواصل ناقصة** ⇒ توضيحية فقط |
| التباس اسم المزوّد | العربية «Click» مقابل الإنجليزية **«speed logistic»** |

**التعارضات المؤكدة بسطر محدَّد:**

| الحقل | العربية | الإنجليزية | الأثر |
|---|---|---|---|
| `Ord_Amt` | س14: خُصم التوصيل **منه** | س35: الطلب + الشحن | ⚠️ **يمنع الربط المالي** |
| `Client_Serial` | س8: كود التاجر | س29: رقم الطلب في نظامك | ⚠️ **يمنع idempotency** |

**القيم المنطقية:** `Is_Ord_Exchange` و `Open_Shippment` تظهر كنص **`"True or False"`** ⇒ نوع السلك غير محسوم.

⇒ **التعارضات موجودة في المستند الرسمي نفسه**، وليست سوء فهم في الملخص. لذلك لا يمكن تجاوزها هندسياً.

### 7.3 المواد التي لا تزال مفقودة محلياً

| المادة | الحالة | الأثر |
|---|---|---|
| **فيديو العميل (78.72 ث)** | ❌ **مفقود** | ⚠️ **لا يمكن تأكيد أي تطابق بصري** |
| **اتفاقية التطوير المحدَّثة** | ❌ **مفقودة** | ⚠️ النطاق التعاقدي غير مُثبت |
| **الملحق A** | ❌ **مفقود** | ⚠️ المرفق لا يقلّل الأول |
| لقطات الفيديو الـ79 | ❌ مفقودة | `10_VIDEO…` نصي فقط |
| Postman collection (بديل) | ❌ مفقود | غير لازم |

**البحث المُنفَّذ:** `~` حتى عمق 5 لكل `mp4/mov/webm/avi/m4v` ⇒ **لا يوجد فيديو** (الوحيد مطابق أصلاً من `pub-cache`). وبحث عن الاتفاقية والملحق ⇒ لا نتائج.

---

## 8. الإجراء المطلوب من المالك — بدقة

### 8.1 لتزويدنا بالمواد الناقصة

ضع الملفات في **`~/Downloads/`** (أين وُجد ملفا Click)، ثم أخبرنا:

1. **فيديو العميل** — `~/Downloads/*.mp4` (أو أي مسار)
2. **اتفاقية التحديث + الملحق A** — `~/Downloads/*.pdf` أو `*.docx`

المهندس سينقلها إلى `docs/evidence-import/` **محلياً فقط**، ويقارن البصمة بـ`KNOWN_GOOD.sha256`، ويُحدّث المصفوفة.

### 8.2 إجراء مطلوب من المالك قبل أي تكامل حقيقي

| # | الإجراء | السبب |
|---|---|---|
| 1 | **تدوير كلمة مرور حساب Click** | نُوقشت في محادثة سابقة — لا تفترض الطمأنينة |
| 2 | إرسال `CLICK_DELIVERY_QUESTIONS_AR.md` للشركة | 15 سؤالاً؛ 4 منها حرجة |
| 3 | زوّدنا استجابات Click **منزوعة الأسرار** | صفر استجابات موثّقة حالياً |

### 8.3 قرار مطلوب

**هل تكامل Click داخل النطاق المتفق عليه أم خارجه؟** هذا يحدد 4 مراحل كاملة.

---

## 9. البلوكرات المتبقية أمام نشر Hosting فقط

| # | البلوكر | النوع | المالك |
|---|---|---|---|
| 1 | **Authorized domains** تحتوي `velnix-6c1a2.web.app` و `velnix-6c1a2.firebaseapp.com` | إعداد | **المالك** |
| 2 | **تسجيل Google حقيقي** على النطاق المنشور | اختبار | **المالك** |
| 3 | **App Check يُصدر رمزاً** على النطاق الحقيقي | اختبار | **المالك** |
| 4 | **موافقة صريحة** على النشر | قرار | **المالك** |
| 5 | 109 فهارس Firestore تحتاج `READY` على المشروع الحقيقي | هندسي | — |

**⚠️ لا يُنشر Hosting قبل 1–3.** نجاح المحاكي **لا** يثبتها؛ `signInWithPopup` سيفشل في الإنتاج إذا لم يكن النطاق مسجّلاً.

**⚠️ لا Functions ولا قواعد ولا فهارس في هذه المرحلة** — Hosting وحده.

---

## 10. توصية Go/No-Go للمرحلة 2

### ✅ **GO — مع ثلاثة شروط سابقة**

المرحلة 1 اكتملت: المستودع نظيف، الحالة مُوثّقة، أدلة Click **مُسترجعة ومُتحقَّقة**، CI أخضر على 4 وظائف، PR #1 لا يزال Draft.

### الشرط 1 — إلزامي قبل النشر

تحقق من **Authorized domains** في Firebase Console. هذا أرخص فحص في القائمة وأكثره احتمالاً لإيقاف النشر.

### الشرط 2 — إلزامي قبل إعلان النجاح

تشغيل **تسجيل Google حقيقي** و **App Check على النطاق المنشور** بعد النشر. بدونهما لا يمكن إعلان نجاح Hosting.

### الشرط 3 — تشغيلي

**موافقة صريحة** على نشر Hosting وحده.

### ⛔ ما لا يشمله GO

المرحلة 2 **لن** تشمل: Functions غير المنشورة (12)، Push/FCM، Scheduler، Click، أجهزة، أو تعديل المدير العام.

---

## 11. حالة الموارد السحابية — لم تتغير

| المورد | الحالة |
|---|---|
| Functions | **23 منشورة** — لم يُنشر جديد |
| القواعد / الفهارس | لم تُعدّل |
| Hosting | **لم يُنشر** |
| IAM / الفوترة / Blaze | لم تُمس |
| المدير العام | لم يُمس |
| Push / Scheduler | لم يُفعَّل |
| Click | **لم يُتواصل معه** — لم يُنفَّذ أي اتصال |
| PR #1 | **لم يُدمج — لا يزال Draft** |
| `main` | **لم يُمس** |

---

## 12. ملاحظات

1. **هوية الـGit:** المستودع بلا `user.name`/`user.email` عالمياً. استخدمتُ هوية تاريخ المستودع `mohammad ahmmad <engmoderohe@gmail.com>` عبر `git -c` لكل commit **دون تعديل إعداد git**. غيّرها إن أردت.
2. **توقيتات البناء:** Flutter يعيد بناء `build/web` من الكاش مع الحفاظ على الطابع الزمني للملف. تحققتُ من **المحتوى** (مشروع الإنتاج، مفتاح Enterprise، لا علامات emulator، `fromEnvironment` محلول) بعد حذف المجلد وإعادة البناء.
3. **هذا التقرير محلياً فقط** — كُتب بعد الدفع والتحقق من CI، ولذلك لم يُضَف إلى آخر commit. يُدفع في مراجعة منفصلة إن رغبت.

---

**المراجع:**
[المصفوفة](VELNIX_REQUIREMENTS_TRACEABILITY_AR.md) ·
[الخطة الرئيسية](VELNIX_MASTER_REQUIREMENTS_AND_DELIVERY_PLAN_AR.md) ·
[قبول Click](VELNIX_CLICK_REAL_INTEGRATION_ACCEPTANCE_AR.md) ·
[قائمة الجاهزية](VELNIX_RELEASE_READINESS_CHECKLIST_AR.md) ·
[استيراد الأدلة](evidence-import/README_AR.md) ·
[تقرير تهيئة Mac](LOCAL_MAC_SETUP_REPORT_AR.md)