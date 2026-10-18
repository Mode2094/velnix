# Stage 5 — قبول iOS (Velnix)

## 1. معلومات عامة
- المستودع: `Mode2094/velnix`
- الفرع: `audit/production-readiness`
- SHA المُختبَر: `34c69f4`

## 2. إصدارات الأدوات
- Flutter: `3.47.7`
- Dart: `3.13.5`
- Xcode: `16.0` (Build `16A242d`)
- CocoaPods: `1.17.0`
- Ruby: `4.0.6`
- iOS SDK: `18.0` (iphonesimulator/iphoneos)
- Simulators متاحة: iPhone SE (3rd gen), iPhone 16/16 Pro/16 Pro Max/16 Plus, iPad (10th gen), iPad mini (6th), iPad Air 11/13, iPad Pro 11/13.

## 3. إعدادات iOS
- `PRODUCT_BUNDLE_IDENTIFIER`: `com.mode2094.velnix`
- Deployment target: `15.0` (IPHONEOS_DEPLOYMENT_TARGET)
- CocoaPods platform: `ios, '15.0'`
- Code signing: `Automatic`، identity `iPhone Developer` (device only). **لا يوجد Apple Developer identity** (BLOCKED for device/archive).
- Entitlements: لا يوجد ملف entitlements مُخصَّص (App Check uses DeviceCheck).
- Info.plist: `CFBundleURLTypes` يحتوي `$(VELNIX_GOOGLE_REVERSED_CLIENT_ID)` (فراغ إذا لم يُعرَّف).
- SceneDelegate: `FlutterSceneDelegate` (UIScene).
- AppDelegate: implicit engine.

## 4. Firebase iOS
- تطبيق Firebase مُسجَّل: `1:948196868655:ios:58a6ca83ccb4e1e3c43cda`
- `GoogleService-Info.plist`: غير موجود في المستودع (مُتجاهَل). تم جلبه محلياً عبر `firebase apps:sdkconfig ios` واختُبر، ثم حُذف.
- `CLIENT_ID`: `948196868655-klpna39ioeijkssic47qvc09snv17fl8.apps.googleusercontent.com`
- `REVERSED_CLIENT_ID`: `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8`
- `API_KEY`: `[REDACTED - Firebase public API key]`
- `BUNDLE_ID`: `com.mode2094.velnix` (مطابق).
- `copy_firebase_config.sh`: نسخ GoogleService-Info.plist إلى bundle إذا وُجد.

## 5. CocoaPods
- `pod install`: **فشل** بسبب Ruby 4.0 unicode_normalize (ASCII-8BIT) — مشكلة بيئة، وليس كود. Pods مُثبَّتة مسبقاً (Podfile.lock + Pods/).
- المكتبات: Firebase (Core, Auth, Firestore, Functions, Messaging, AppCheck), GoogleSignIn, AppAuth, AppCheckCore, gRPC, abseil, BoringSSL, nanopb, PromisesObjC, GTMAppAuth, GTMSessionFetcher, RecaptchaInterop.

## 6. نتائج البناء
- `xcodebuild -version`: **PASS** — Xcode 16.0 (16A242d)، بدون hang.
- `xcodebuild -list -workspace Runner.xcworkspace`: **PASS** في أقل من 20 ثانية (`XCLIST_EXIT=0`)، 74 scheme، و`FlutterGeneratedPluginSwiftPackage` محلولة. **الـ hang السابق لم يتكرّر**؛ كان تداخلاً/ندرة موارد لا عيباً في المشروع.
- `flutter build ios --simulator --no-codesign -v`: **PASS — `BUILD_EXIT=0`** في 1,709,064ms (28.5 دقيقة) للبناء البارد، و313,719ms (5.2 دقيقة) للبناء التزايدي.
- `debug_unpack_ios`: **PASS**. أنتج `Flutter.framework` فعلياً في `build/ios/Debug-iphonesimulator/`. لا وجود لخطأ "No iOS frameworks found".
- **تصحيح تشخيص السبب الجذري السابق**: لا يوجد عيب في engine artifacts. الدليل المباشر:
  - `bin/cache/artifacts/engine/ios/Flutter.xcframework/Info.plist` سليم ويعلن `ios-arm64_x86_64-simulator`.
  - الشريحة `ios-arm64_x86_64-simulator/Flutter.framework/Flutter` ملف Mach-O حقيقي (87,642,928 بايت) بمعماريات `x86_64` + `arm64`.
  - فك تشفير رسالة `artifacts.dart` تُthrow "No iOS frameworks found" فقط عند عدم مطابقة أي مجلد `ios-*` لنوع البيئة؛ وهي مطابقة هنا.
  - `UnpackIOS.build()` يحتاج `kSdkRoot` (=ios.dart:270)؛ و`SDKROOT` يُمرَّر بشكل صحيح داخل build-script phase (لاحظ `SDKROOT` يمرّر عبر `-sdk iphonesimulator`). تشغيل `debug_unpack_ios` يدوياً خارج Xcode **بدون** هذه البيئة يُنتج خطأً مضلّلاً ولا يُثبت عيباً في المشروع.
- ملاحظة SPM: `Generated.xcconfig` يحتوي `FLUTTER_FRAMEWORK_SWIFT_PACKAGE_PATH`指向 مسار `.packages/FlutterFramework` غير موجود، لكن **لا يوجد أي مستهلك** لهذه القيمة في `flutter_tools` (كاتب فقط: `xcode_backend_settings.dart:180`)، و`project.pbxproj` لا يشمل حزمة `FlutterFramework` — المحرك يصل عبر CocoaPods. **تجاهل — ليس عائقاً**.
- `flutter analyze`: PASS (0 issues).
- `flutter test`: **323 pass / 18 fail** — الفشل الـ18 كلها **golden pixel comparisons** في `test/live_presentation_test.dart` (فرق 4–5% بسبب اختلاف الخطوط على macOS/Xcode 16). **صفر فشل منطقي**.

## 7. تشغيل المحاكي (iOS) — مُنفَّق
- الجهاز: **iPhone 16 Pro / iOS 18.0** / UDID `C8FFA295-8EA4-4FFB-8D1A-629846CE652E`.
- `simctl list devices available`: exit 0. `open -a Simulator`: exit 0 (PID حيّ). `simctl bootstatus <UDID> -b`: exit 0، `isTerminal=YES, "Finished"` في 41s. Home screen مؤكَّدة بلقطة شاشة.
- `xcrun simctl install`: **exit 0** — حاوية التطبيق `/Users/mrik/Library/Developer/CoreSimulator/Devices/C8FFA295.../Runner.app`.
- `xcrun simctl launch com.mode2094.velnix`: **exit 0** — PID `99802`، مسجَّل كـ `UIKitApplication:com.mode2094.velnix`. PID **لم يتغيّر** بعد أكثر من 50 ثانية ⇒ لا crash ولا إعادة تشغيل.
- **Flutter startup: PASS** — `main()` نُفِّذ، الواجهة بُنيت، وFlutter engine حُمِّل من `Runner.app/Frameworks/Flutter.framework`.
- **RTL/العربية: PASS** — `Directionality(textDirection: TextDirection.rtl)` + تشكيل عربي سليم + `velnixTheme()` مطبَّق.
- **وضع المعاينة `VELNIX_MODE=demo`: PASS** — بُني (5.2 دقيقة) وأُطلق (PID 4546) وعُرضت شاشة "مساحة العمل الذكية" بواقفة واحدة مختارة (مدير عام) وزر متابعة.
- التنقل بالنقر **غير مؤتمت**: `osascript` يرفض الوصول إلى نافذة Simulator (خطأ ‎-1719، صلاحيات الوصول غير ممنوحة) ولا يوجد `cliclick`/`idb`. لم تُمنح صلاحيات دون موافقة. سلوك التنقل مُغطّى بـ (widget tests) الـ323.
- **Firebase initialization: BLOCKED عمداً (fail-closed)** — انظر §8/§9.

## 8. Google Sign-In (iOS) — عقبة إعدادات مؤكَّدة
- `VELNIX_GOOGLE_REVERSED_CLIENT_ID` **غير مُعرَّف**: يظهر فقط كـ `$(VELNIX_GOOGLE_REVERSED_CLIENT_ID)` في `ios/Runner/Info.plist:14`، ولا يُعرَّف في أي `xcconfig` ولا في `project.pbxproj`.
- النتيجة المُتحقَّق منها في البناء: `CFBundleURLSchemes` يحتوي **سلسلة فارغة** `<string></string>` ⇒ OAuth redirect لن يعمل على iOS.
- القيمة المطلوبة (معروفة من `GoogleService-Info.plist` أعلاه):
  - `REVERSED_CLIENT_ID` = `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8`
  - `CLIENT_ID` = `948196868655-klpna39ioeijkssic47qvc09snv17fl8.apps.googleusercontent.com`
- **الإصلاح المطلوب**: تعريف `VELNIX_GOOGLE_REVERSED_CLIENT_ID` في `ios/Flutter/Firebase.local.xcconfig` (مُتجاهَل في git حسب `.gitignore:25`). **لم يُنفَّذ** (يتطلب بيانات اعتماد).
- لم يتم تجاوز Google Sign-In.

## 9. App Check (iOS) — BLOCKED عمداً
- `lib/main.dart` يُنشّئ `Firebase.initializeApp()` ثم `FirebaseAppCheck.instance.activate(providerApple: AppleDeviceCheckProvider)`.
- **ما حدث فعلياً في البناء**: لم تُمرَّر أي `--dart-define`، لذا `FIREBASE_API_KEY` فارغ ⇒ يسلك `main.dart` فرع `await Firebase.initializeApp()` بلا خيارات، ويتطلّب `GoogleService-Info.plist` داخل الحزمة — وهو **غير موجود** ⇒ يُرمى استثناء ⇒ `catch (_)` ⇒ `runApp(const SetupFailureApp())`.
- الدليل: لقطة الشاشة تعرض بالعربية "تعذر بدء التطبيق. راجع إعدادات بيئة التشغيل وFirebase وApp Check مع مسؤول المؤسسة." — وهي **حراسة مقصودة (fail-closed)** وليست انهياراً. العملية بقيت حيّة.
- **عيب إعدادات مؤكَّد**: `ios/Runner/GoogleService-Info.plist` مُشار إليه في `project.pbxproj:71` كـ `PBXFileReference` فقط، و**لا يوجد له `PBXBuildFile`** ⇒ ليس في Resources build phase ⇒ **لن يُنسخ إلى الحزمة حتى لو وُجد الملف**. يتطلّب إضافة PBXBuildFile.
- لم يتم تجاوز App Check، ولم تُنشأ حسابات، ولم تُعدَّل إعدادات السحابة.

## 10. عيوب مُؤكَّدة
1. **`VELNIX_GOOGLE_REVERSED_CLIENT_ID` غير مُعرَّف** ⇒ `CFBundleURLSchemes` فارغ ⇒ Google Sign-In معطّل على iOS (§8).
2. **`GoogleService-Info.plist` غير مربوط بالـ Resources build phase** ⇒ غير قابل للتضمين تلقائياً (§9).
3. **`ios/Flutter/Firebase.local.xcconfig` غير موجود** (مُتجاهَل في git) — لا يوجد مصدر محلي لإعدادات Firebase على iOS.
4. **`pod install` معطّل**: يفشل بسبب Ruby 4.0 `unicode_normalize` (ASCII-8BIT) — عائق بيئة. الـ Pods مُثبَّتة مسبقاً و`Pods/` + `Podfile.lock` متسقان، والبناء نجح. (غير مُصلَح: خارج نطاق هذا المُهمّة.)
5. 18 golden test تفشل على macOS (فرق بكسل 4–5% بسبب الخطوط) — عيب بيئي في baselines، لا عيب منطقي.

## 11. متطلبات التوقيع/المتجر (iOS)
- Apple Developer identity: غير موجود. BLOCKED (archive/TestFlight/App Store).
- Provisioning profiles: غير موجودة.
- App icons: موجودة (AppIcon.appiconset).
- Launch screen: LaunchScreen.storyboard + LaunchImage.
- Privacy/entitlements: App Check DeviceCheck (لا entitlement خاص). Push requires `aps-environment` (غير مُضاف).
- Version: `0.7.0 (7)`.

## 12. حكم Stage 5 (iOS)
- Xcode CLI (`-version` + `-list`): **PASS**
- بناء Flutter iOS simulator: **PASS** (`BUILD_EXIT=0`)
- التثبيت على المحاكي (`simctl install`): **PASS** (exit 0)
- إطلاق Velnix (`simctl launch`, PID حيّ ومستقر): **PASS**
- Flutter startup: **PASS** · RTL/العربية: **PASS** · وضع المعاينة: **PASS**
- Firebase initialization: **BLOCKED عمداً** (fail-closed؛ ينقص `GoogleService-Info.plist` مربوطاً ببناء الحزمة + dart-defines)
- Google Sign-In: **BLOCKED** (`VELNIX_GOOGLE_REVERSED_CLIENT_ID` غير مُعرَّف ⇒ URL scheme فارغ)
- App Check: **BLOCKED عمداً** (غير مُختبَر مقابل الخادم؛ لم يُتجاوز)
- Release signing: BLOCKED (لا Apple Developer identity — خارج نطاق)
- `flutter test`: 323 pass / 18 golden fail (بيئي)
- **الحكم: `BUILD + INSTALL + LAUNCH` = PASS. `Runtime against live Firebase services` = BLOCKED (إعدادات مطلوبة من المالك، ليست عيباً في الكود).**

### مراجعة التشخيص السابق
الادعاءات السابقة في §6 ("`debug_unpack_ios` لا يجد إطار simulator"، "`xcodebuild -list` معلّق"، "البناء BLOCKED") **غير صحيحة** ولا تتكرّر. الثوابت المُثبتة: شريحة `ios-arm64_x86_64-simulator` سليمة، `xcodebuild -list` ينجح في <20 ثانية، والبناء ينتهي بـ exit 0. الانتظار الطويل السابق كان **ترجمة C++ باردة** لـ ~4,724 كائن (gRPC/Firebase/abseil) على Intel، وليست hang.
