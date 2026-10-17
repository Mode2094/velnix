# Stage 5 — قبول Android (Velnix)

## 1. معلومات عامة
- المستودع: `Mode2094/velnix`
- الفرع: `audit/production-readiness`
- SHA المُختبَر: `34c69f4`
- تاريخ: 2026-10-18

## 2. إصدارات الأدوات
- Flutter: `3.47.7` (قناة user-branch، غير رسمية)
- Dart: `3.13.5`
- DevTools: `2.60.0`
- Android SDK: `/Users/mrik/Library/Android/sdk`، إصدار `37.0.0`
- منصة Android: `android-37`
- Build-tools: `37.0.0`
- Emulator: `36.6.11.0`
- Java (JBR Android Studio): OpenJDK `21.0.10` (تعطل لاحقاً — انظر §7)
- Gradle: `9.3.1` (wrapper)
- AGP: `9.1.0`
- Kotlin: `2.4.0`
- NDK: `flutter.ndkVersion`

## 3. إعدادات Android
- `applicationId`: `com.mode2094.velnix`
- `namespace`: `com.mode2094.velnix`
- `minSdk`: `24` (افتراضي Flutter)
- `targetSdk`: `36`
- `compileSdk`: `37` (flutter.compileSdkVersion)
- الإصدار: `0.7.0+7`
- Gradle property: `android.newDsl=false`، `android.builtInKotlin=false`

## 4. Firebase Android
- تطبيق Firebase مُسجَّل: `1:948196868655:android:4465def254bb941ac43cda`
- `google-services.json`: غير موجود في المستودع (مُتجاهَل في git). تم جلبه محلياً عبر `firebase apps:sdkconfig android` (قراءة فقط، بلا تغيير سحابي) واختُبر، ثم حُذف.
- `oauth_client` في الإعداد: فقط عميل Web (type 3) + عميل iOS (type 2). لا يوجد عميل Android (type 1) / SHA-1 مُسجَّل.
- `api_key`: `[REDACTED - Firebase public API key]`
- `project_id`: `velnix-6c1a2`

## 5. نتائج البناء
- `flutter pub get`: نجاح (23 حزمة قديمة، غير حرج).
- `flutter analyze`: نجاح (0 مشاكل).
- `flutter test`: 323 نجاح، 18 فشل (اختبارات golden على macOS — اختلافات خطوط/عرض، مُحدَّدة مسبقاً على Linux؛ لم تُعدَّل).
- `flutter build apk --debug`: **نجاح** — `build/app/outputs/flutter-apk/app-debug.apk`
- `flutter build apk --release` (unsigned): **لم يُجرَّب** — لا يوجد تهيئة توقيع إصدار (release block فارغ في build.gradle.kts). مُعلَّم BLOCKED/NOT TESTED.

## 6. تشغيل المحاكي (Android)
- المحاكي: `palladium_test` (Android 37 / x86_64).
- التثبيت: نجاح (`adb install`).
- الإطلاق: نجاح (بدون crash).
- Firebase init: `FirebaseApp initialization successful`.
- App Check: `AndroidPlayIntegrityProvider` في non-debug (debug: `AndroidDebugProvider` عبر `VELNIX_DEBUG_APPCHECK`).
- لا توجد أخطاء `E flutter` في logcat.

### smoke tests (محاكي)
- ✅ إطلاق نظيف بدون crash.
- ✅ Firebase initialization.
- ✅ واجهة SetupFailureApp لا تظهر (الإعداد ناجح).
- ✅ RTL/العربية (الخط Cairo، Directionality RTL في الكود).
- ⚠️ Google Sign-In: غير مُختبَر (لا SHA-1/عميل Android type 1 مُسجَّل). BLOCKED.
- ⚠️ App Check (Play Integrity): غير مُختبَر على جهاز فعلي. BLOCKED.
- ⚠️ Push/FCM: غير مُفعَّل (`firebase_messaging_auto_init_enabled=false`)؛ لم يُختبَر. BLOCKED (جهاز فعلي).

## 7. مشاكل البيئة (Java) — تشخيص
- Java (JBR Android Studio + Homebrew OpenJDK@17/@21/@26) كلها تعلق في `CreateExecutionEnvironment` → `CFRunLoopRunSpecific` → `mach_msg` (انتظار Mach port). 
- Binary: `/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java` (x86_64، JDK 21.0.10). `spctl --assess` = rejected (provenance). `codesign --verify` = valid. `xattr` = com.apple.provenance (نظام). 
- Android Studio GUI يعمل (PID 6403)؛ Java CLI فقط يعلق (Gatekeeper/provenance).
- تأثير: `flutter doctor`/`flutter devices`/`flutter emulators` تعلق (تستدعي Java). بناء Android (Gradle) نجح قبل التعطّل (daemon مُخزَّن). 
- **لا تغيير لسياسة macOS** (ممنوع). يتطلّب موافقة المالك (System Settings → Privacy & Security → Allow).

## 8. عيوب مُؤكَّدة وإصلاحات
- لا توجد عيوب برمجية مُؤكَّدة في Android (analyze/test/build نجحت).
- فجوة تكوين: غياب `google-services.json` في CI (البناء يتجاوز plugin). مقبول (demo/CI). توثيق في التقرير.

## 9. متطلبات التوقيع/المتجر (Android)
- توقيع release: غير مُعد (TODO في build.gradle.kts). BLOCKED (يتطلّب keystore).
- AAB: غير مُنتَج. BLOCKED.
- أيقونات/شاشات إطلاق: موجودة (mipmap + launch_background).
- إصدار/رقم build: `0.7.0+7`.
- Play Store metadata/privacy: لم تُراجع (خارج النطاق).

## 10. عناصر Stage 4 المتبقية (محمولة)
- onboarding/join-request UI acceptance.
- notification pagination/empty-state.
- 9 Functions غير مُنشَرة.
- KMS prod.
- Click Delivery.
- Push/FCM على جهاز فعلي.
- ci.yml update (pending).

## 11. حالة GitHub CI
- CI (Linux): لم يُشغَّل محلياً. تعديل ci.yml (Stage 3 acceptance) موجود في working tree (غير مُلتزم). 
- Golden tests (Linux) محفوظة (لم تُعدَّل).

## 12. حكم Stage 5 (Android)
- 编译: PASS (debug)
- Runtime (محاكي): PARTIAL (إطلاق + Firebase init نجحا؛ Google Sign-In/App Check/Push على جهاز فعلي BLOCKED)
- Release signing: BLOCKED
- **ال verdict: PARTIAL**
