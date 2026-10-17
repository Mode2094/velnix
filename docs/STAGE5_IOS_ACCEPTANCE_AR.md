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
- xcodebuild -list (workspace): **INTERMITTENT** — hangs in `XcodebuildPreIDEHandler runWithArguments` → mach_msg (XPC/IDE service) on this Mac; succeeded once after cleaning DerivedData + `.swift_pm.lock`, then hung again.
- `flutter build ios --simulator --no-codesign`: **BLOCKED** — hang at `xcodebuild -list` (Xcode service) + Flutter build script phase.
- السبب (مُؤكَّد): 
  1. `debug_unpack_ios` fails: "No iOS frameworks found in .../Flutter.xcframework" (Flutter tool لا يعثر على إطار iOS simulator في xcframework على هذا Mac Intel، رغم وجود `ios-arm64_x86_64-simulator` slice).
  2. `flutter precache --ios` يكتمل في 105ms ويتجاهل artifacts (يعتبرها موجودة).
  3. Xcode build system يعلق عند resolving package graph (intermittent، network-dependent).
- `xcodebuild -workspace ... -list`: PASS (Runner scheme موجود).
- `flutter analyze`: PASS (0 issues).
- `flutter test`: 323 pass / 18 golden fail (macOS).

## 7. تشغيل المحاكي (iOS)
- **لم يُجرَّب** — بناء iOS تعذّر. BLOCKED (بيئة).
- smoke tests (إطلاق/RTL/مصادقة/...) غير مُنفَّذة.

## 8. Google Sign-In (iOS)
- `VELNIX_GOOGLE_REVERSED_CLIENT_ID` غير مُعرَّف (Info.plist placeholder). 
- REVERSED_CLIENT_ID معروف من GoogleService-Info.plist (أعلاه).
- BLOCKED: يتطلّب `Firebase.local.xcconfig` (gitignored) أو `--dart-define`/xcconfig. لم يُختبَر على simulator.

## 9. App Check (iOS)
- `AppleDeviceCheckProvider` (production) / `AppleDebugProvider` (debug). 
- غير مُختبَر (بناء BLOCKED).

## 10. عيوب مُؤكَّدة
- لا توجد (البناء لم يكتمل).

## 11. متطلبات التوقيع/المتجر (iOS)
- Apple Developer identity: غير موجود. BLOCKED (archive/TestFlight/App Store).
- Provisioning profiles: غير موجودة.
- App icons: موجودة (AppIcon.appiconset).
- Launch screen: LaunchScreen.storyboard + LaunchImage.
- Privacy/entitlements: App Check DeviceCheck (لا entitlement خاص). Push requires `aps-environment` (غير مُضاف).
- Version: `0.7.0 (7)`.

## 12. حكم Stage 5 (iOS)
- 编译: BLOCKED (بيئة Xcode)
- Runtime (محاكي): NOT TESTED
- Google Sign-In: NOT TESTED
- App Check: NOT TESTED
- Release signing: BLOCKED
- **ال verdict: BLOCKED (بيئة)**
