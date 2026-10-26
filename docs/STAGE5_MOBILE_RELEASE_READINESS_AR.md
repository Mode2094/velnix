# Stage 5 — جاهزية الإصدار المحمول (Velnix)

## 1. Android
- Signing prerequisites: keystore غير موجود؛ release block فارغ. **BLOCKED**.
- AAB feasibility: BLOCKED (يتطلّب signing).
- App icons: ✅ (mipmap-hdpi..xxxhdpi).
- Launch screen: ✅ (launch_background.xml).
- Versioning: `0.7.0+7` ✅.
- Permissions: INTERNET, POST_NOTIFICATIONS. ✅.
- Play Store metadata/privacy: NOT TESTED (خارج النطاق).

## 2. iOS
- Signing: `Automatic`، `iPhone Developer`. **BLOCKED** (لا Apple Developer identity).
- Provisioning: غير موجود.
- Archive feasibility: BLOCKED (no identity).
- App icons: ✅.
- Launch screen: ✅ (LaunchScreen.storyboard + LaunchImage).
- Versioning: `0.7.0 (7)` ✅.
- Entitlements: App Check DeviceCheck (no special). Push requires `aps-environment` (غير مُضاف) → BLOCKED for push.
- App Store metadata/privacy: NOT TESTED.

## 3. Firebase config (prod)
- Web: `velnix-6c1a2` (stage3 config). 
- Mobile: apps registered (Android/iOS) but native config files gitignored; CI builds without them.
- Production KMS: NOT CONFIGURED (residual).

## 4. Push/FCM
- `firebase_messaging_auto_init_enabled=false`. Push غير مُفعَّل.
- Physical-device Push/FCM: BLOCKED (no device, no FCM registration).

## 5. عناصر Stage 4 المتبقية
- onboarding/join-request UI acceptance.
- notification pagination/empty-state.
- 9 exported undeployed Functions.
- Production KMS.
- Real Click Delivery integration.
- Physical-device Push/FCM.
- Pending ci.yml update.

## 6. خلاصة
- Android debug: PASS.
- Android release: BLOCKED (signing).
- iOS simulator build: BLOCKED (بيئة Xcode).
- iOS release: BLOCKED (signing).
- Store submission: BLOCKED (credentials).
