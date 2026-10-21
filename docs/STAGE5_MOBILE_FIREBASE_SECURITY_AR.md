# Stage 5 — أمان Firebase المحمول (Velnix)

## 1. بيئة Firebase
- Project: `velnix-6c1a2` (project number `948196868655`).
- تطبيقات مُسجَّلة: Android `1:...:android:4465def254bb941ac43cda`، iOS `1:...:ios:58a6ca83ccb4e1e3c43cda`، Web `1:...:web:ace9b264b4fae48ac43cda`.
- Emulator Suite: متاح (Firestore/Auth/Functions) — استُخدم في مراحل سابقة.
- FCM: `firebase_messaging_auto_init_enabled=false` (opt-in). Push غير مُفعَّل.

## 2. تهيئة Firebase (mobile)
- `Firebase.initializeApp()` بدون خيارات على native (يعتمد على google-services.json / GoogleService-Info.plist).
- إذا وُجد `FIREBASE_API_KEY` (dart-define) → `FirebaseConfiguration.supplied` (تحقق صارم: appId prefix `1:sender:android|ios:`، iosBundleId = `com.mode2094.velnix`).
- App Check: Android `PlayIntegrity`/`Debug`، iOS `DeviceCheck`/`Debug`، Web `ReCaptchaEnterprise`.
- `VELNIX_DEBUG_APPCHECK` ممنوع في release/production.

## 3. App Check
- Android: Play Integrity (prod) / Debug (dev). 
- iOS: DeviceCheck (prod) / Debug (dev).
- Web: reCAPTCHA Enterprise.
- ⚠️ Device App Check (Play Integrity/DeviceCheck) غير مُختبَر (يتطلّب جهاز فعلي + إعداد console). BLOCKED.

## 4. Firebase Emulator (اختبارات)
- Auth init: مُختبَر في unit tests (demo/live).
- Role retrieval: مُختبَر (Stage 4).
- Cloud Functions authorized: مُختبَر (Stage 4).
- Direct Firestore denial: مُختبَر (rules).
- Active/inactive enforcement: مُختبَر.
- Cross-role order access denial: مُختبَر.
- App Check enforcement: Web (reCAPTCHA) مُختبَر؛ mobile DeviceCheck/PlayIntegrity NOT TESTED (جهاز فعلي).
- No production writes: ضمان عبر `VELNIX_ENVIRONMENT=development` + emulator. ✅

## 5. التمييز (Proven/Unverified)
1. **Proven emulator behavior**: Auth init, roles, Functions auth, Firestore denial, active/inactive, cross-role denial (Stage 4 emulator tests).
2. **Proven simulator behavior**: Android emulator — Firebase init successful, app launch without crash. iOS simulator — NOT TESTED (build BLOCKED).
3. **Proven physical-device behavior**: NONE (no device).
4. **Unverified production identity/App Check**: Play Integrity (Android), DeviceCheck (iOS), real Google Sign-In (both), FCM push.

## 6. Google Sign-In
- Android: لا يوجد عميل OAuth type 1 / SHA-1 مُسجَّل. BLOCKED (يتطلّب إضافة SHA-1/SHA-256 في Firebase Console + google-services.json regeneration).
- iOS: عميل iOS موجود (type 2). REVERSED_CLIENT_ID معروف. BLOCKED (يتطلّب `Firebase.local.xcconfig` أو dart-define + simulator build).
- Web: مُفعَّل (`VELNIX_GOOGLE_ENABLED=true` في stage3 config).

## 7. OAuth clients / fingerprints
- Web client: `948196868655-rhui5vqf3h48ft5e1srln5fc9otm8ng2.apps.googleusercontent.com` (type 3).
- iOS client: `948196868655-klpna39ioeijkssic47qvc09snv17fl8.apps.googleusercontent.com` (type 2).
- Android: لا يوجد (type 1). SHA-1/SHA-256 غير مُسجَّل.

## 8. URL schemes / reversed client ID
- iOS Info.plist: `CFBundleURLTypes` → `$(VELNIX_GOOGLE_REVERSED_CLIENT_ID)` (فارغ default).
- REVERSED_CLIENT_ID الفعلي: `com.googleusercontent.apps.948196868655-klpna39ioeijkssic47qvc09snv17fl8`.

## 9. تفتيش الأمان (محمول)
- لا توجد مفاتيح/أسرار مُلتزمة (google-services.json/GoogleService-Info.plist/Firebase.local.xcconfig/ firebase_options.dart كلها gitignored).
- CI builds without native config (plugin skipped) — مقبول.
- App Check debug غير مسموح في release/production (RuntimeConfig.validate).
- `VELNIX_DEBUG_APPCHECK` في release → throw.

## 10. عناصر Stage 4 المتبقية (محمولة)
- 9 Functions غير مُنشَرة، KMS prod، Click Delivery، Push/FCM جهاز فعلي، ci.yml.

## 11. حكم
- Emulator security: PASS (proven).
- Simulator (Android): PARTIAL (Firebase init + launch proven; App Check Play Integrity NOT TESTED).
- Simulator (iOS): NOT TESTED (build BLOCKED).
- Physical device: BLOCKED (no device).
- **ال verdict: PARTIAL**
