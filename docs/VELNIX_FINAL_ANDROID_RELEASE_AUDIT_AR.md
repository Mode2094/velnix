# VELNIX — التدقيق الهندسي النهائي وتسليم Android

**المشروع:** `velnix-6c1a2` · **الفرع:** `main`
**Commit المصدر المبني منه:** `7977dbf` (يحتوي كود المراجعة `fcd727c`)
**تاريخ البناء:** 2026-10-31
**CI للكود:** https://github.com/Mode2094/velnix/actions/runs/40770291098 — ناجح
**GitHub Release:** https://github.com/Mode2094/velnix/releases/tag/velnix-v0.7.0-build7
**القرار:** **B — RELEASE CANDIDATE**

> لم تُنفذ اختبارات هاتف Android حقيقي (كاميرا/Play Integrity)، ولا طابعة ورقية، ولا شحنة Click حقيقية. البناء والاختبارات البرمجية ناجحة، لكن القبول الميداني النهائي يبقى على المالك.

---

## 1. تدقيق الصور السبع

| # | الصورة | النتيجة | الدليل |
|---|---|---|---|
| 1 | البحث والفلاتر والباركود | PASS برمجياً | `docs/evidence/final-audit/screenshots/filter_chips_390/760/1440.png`, `barcode_scanner_900.png`, `barcode_results_900.png`; اختبارات `phase3_filters`, `phase5_direct_id`, `phase4_merge_pagination`, `phase3_barcode_limit` |
| 2 | قائمة الطلبات على الويب | PASS | `orders_390.png`, `orders_1440.png`; بحث `searchOrders` وترقيم `listOrders` بمؤشرات مستقلة |
| 3 | التعديلات الـ13 | PASS (ما عدا الميداني) | `docs/VELNIX_FINAL_CLIENT_ACCEPTANCE_AUDIT_AR.md` §1 + سجلات الاختبار |
| 4 | التحديد المتعدد | PASS | `orders_multi_select_900.png`; طباعة/حالة/إسناد/إرسال بحدود الصلاحيات |
| 5 | البوليصة البيضاء | PASS وظيفي + قبول بصري مطلوب | `print/a4_white_page.png`, `pdf/a4_white_page.pdf` |
| 6 | البوليصة الملونة | PASS وظيفي + قبول بصري مطلوب | `print/a4_colored_page.png`, `pdf/a4_colored_page.pdf` |
| 7 | إنشاء الطلب | PASS | `create_order_900.png`; الكمية 1 خادمياً، الصفحة إلزامية، لا إرسال تلقائي |

**فروق بصرية معلنة (ليست FAIL وظيفي):** ازدواج بطاقة الإجمالي «كل الطلبات/جميع طلبات المتجر»؛ شكل كاميرا الماسح يعتمد الجهاز؛ الفلاتر المتقدمة قابلة للطي؛ الشعارات ملوّنة في القالب الأبيض؛ توزيع حقول الإنشاء على عمودين. لا تُعد هذه موافقة بصرية من العميل.

---

## 2. Backend وFirestore

| الفحص | النتيجة | الدليل |
|---|---|---|
| Cloud Functions / Syntax | PASS | 195/195 unit + `npm run syntax` |
| Firestore Rules | PASS | 249/249 emulator (يتضمن `rules.test.js`) |
| Firestore Indexes | بلا تغيير | لم تُنشر تغييرات فهارس |
| Authentication/App Check/KMS | لم تُعطّل | `AndroidPlayIntegrityProvider` في `lib/main.dart` |
| الصلاحيات | PASS | مصفوفة الرتب 5×5 + اختبارات emulator |
| Idempotency والتسلسل | PASS | `workflow.test.js` واختبارات التكرار |
| الطلبات القديمة والكمية | PASS | `phase3_quantity` (جديد=1، قديم محفوظ) |
| عدم فقد الطلبات | PASS | `phase4_merge_pagination` + `phase5_direct_id` |
| العمليات الجماعية | PASS | نتيجة مستقلة لكل طلب، `uncertain` ليس فشلاً |

**إصلاح البحث المباشر:** قبل الإصلاح أُعيد إنتاج 3/7 ثم نهاية كاذبة (`direct-id-before-fix.log`)؛ بعد الإصلاح 7/7 (`direct-id-after-fix.log`).

---

## 3. اختبارات Click بالمحاكي

لم تُمس مسارات الإرسال أو الأقفال. ضمن **249/249**:
`click_reconcile`, `click_delivery`, `dispatch_contract`, `phase2_bulk_claim`, `phase2_bulk_deadline`, `vendor_transport_resilience`, `shipping_status`.
يشمل ذلك `dispatchLock`، `needs_review`، `vendorStarted`، `claimed`، `getBulkOperation`، `uncertain`، ومنع `setorder` مكرر. **لا شحنة حقيقية أُرسلت.**

---

## 4. اختبارات Flutter وEmulator وPlaywright

| الحزمة | النتيجة |
|---|---|
| `flutter analyze` / format | PASS |
| Flutter tests (Linux) | **493/493** |
| Functions unit | **195/195** |
| Firebase Emulator + Rules | **249/249** |
| Playwright (5 أدوار) | **21/21** (CI) |
| Secret scan | 0 نتائج / 639 ملفاً |
| Runtime/Firebase config checks | PASS |

---

## 5. PDF وBarcode وQR

- 51/51 PASS: Code128 + QR على 203/300/600 DPI لكل المقاسات (A3/A4/A5/A6/Letter/Legal/58/80/مخصص/بوليصة صفحة demo/بوليصة طويلة A6).
- `a6_long`: 6 صفحات دون قص، والرموز تُفك.
- الرموز تحمل `VNX-<id>` فقط، ولا بيانات عميل.

---

## 6. Android

| البند | النتيجة |
|---|---|
| Application ID | `com.mode2094.velnix` |
| Version Name / Code | `0.7.0` / `7` |
| Min / Target SDK | 24 / 36 |
| Compile SDK | 36 |
| ABI | arm64-v8a, armeabi-v7a, x86_64 |
| الأذونات | INTERNET, POST_NOTIFICATIONS, CAMERA, WAKE_LOCK, ACCESS_NETWORK_STATE, USE_BIOMETRIC/FINGERPRINT, FCM/GSF — **لا ميكروفون ولا Speech** |
| Firebase | `velnix-6c1a2` (google-services.json) |
| App Check | Play Integrity في Release |
| Emulator | Android 14 x86_64: تثبيت وتشغيل وصول لشاشة الدخول بلا Fatal |
| هاتف حقيقي | **BLOCKED** — لا جهاز متصل؛ كاميرا QR وPlay Integrity الحقيقيان لم يُختبرا |
| طابعة ورقية | **BLOCKED** — لا طابعة متصلة |
| شحنة Click حقيقية | **BLOCKED** — لا تفويض/اعتماد إنتاجي |

**دليل الإقلاع على Emulator:** `docs/evidence/android-release/emulator-login.png`.

---

## 7. نسختا التسليم

| الخاصية | APK | AAB |
|---|---|---|
| Application ID | `com.mode2094.velnix` | `com.mode2094.velnix` |
| Version Name | `0.7.0` | `0.7.0` |
| Version Code | `7` | `7` |
| Source Commit | `7977dbf` | `7977dbf` |
| Release/Debug | Release | Release |
| Signing cert SHA-256 | `6e57f935d4c7417029452b2d48b2d07520e8945d2ec51c54b77bb03dfde21601` | نفسها |
| File Size | 81,131,692 بايت | 73,791,120 بايت |
| File SHA-256 | `8fcbcaf02fb60f37f8c4fd2d815268b887b49c0f994a0f2df56861601092ddfb` | `21ecd0e91672979e023b716d124e2507de75059d3d123649502ef9548ede16a8` |
| Firebase | Production `velnix-6c1a2` | نفسها |
| Validation | `apksigner verify` (v2) | `bundletool validate` + `jarsigner` + Universal APK مطابق |

**التوقيع:** مفتاح الإصدار المعتمد `CN=Velnix`، بدون debug. لم يُنشأ Keystore جديد، ولم تُرفع أسرار أو `key.properties` إلى Git.

**روابط التحميل:**
- APK: https://github.com/Mode2094/velnix/releases/download/velnix-v0.7.0-build7/Velnix-release.apk
- AAB: https://github.com/Mode2094/velnix/releases/download/velnix-v0.7.0-build7/Velnix-release.aab
- معلومات الإصدار: https://github.com/Mode2094/velnix/releases/download/velnix-v0.7.0-build7/RELEASE_INFO_AR.md
- البصمات: https://github.com/Mode2094/velnix/releases/download/velnix-v0.7.0-build7/SHA256SUMS.txt

ملفات Git المحلية: `delivery/android/` (APK/AAB/RELEASE_INFO/SHA256SUMS). بقي `delivery/apk/Velnix-release.apk` محدثاً لنفس النسخة لتجنب تعارض الأسماء.

---

## 8. القيود والمخاطر

1. **BLOCKED:** كاميرا QR وPlay Integrity على هاتف حقيقي (Emulator لا يثبت Play Integrity).
2. **BLOCKED:** طباعة ورقية فعلية (التحقق رقمي 203/300/600 DPI).
3. **BLOCKED:** شحنة Click حقيقية (كل اختبارات Click على المحاكي فقط).
4. **قبول بصري:** اختلاف تصميم بعض الشاشات عن صور العميل (مذكورة أعلاه) — ليست موافقة ضمنية.
5. **Play:** لم يُرفع AAB إلى Google Play؛ يجب التحقق من تطابق شهادة الرفع مع Play App Signing في حساب المتجر قبل النشر.
6. **npm audit:** 4 تنبيهات moderate في تبعيات غير مباشرة؛ لا توجد ثغرات high/critical (بوابة `--audit-level=high` ناجحة).

---

## 9. القرار

### B — RELEASE CANDIDATE

- كل الاختبارات البرمجية ناجحة.
- APK وAAB موقّعان، متطابقان في الإصدار والهوية، ومُنشران كأصول Release.
- اختبار Android الحقيقي، الطابعة، وClick الإنتاجي **لم تُنفذ**، ولا يمكن إعلان PASS الميداني.

**التالي للمالك:** تثبيت APK على هاتف Android، اختبار QR/كاميرا، تشغيل طابعة فعلية، وتفويض شحنة Click تجريبية واحدة، ثم قبول الإصدار.
