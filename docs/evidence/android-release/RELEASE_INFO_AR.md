# VELNIX — معلومات إصدار Android

## الهوية
- **اسم التطبيق:** Velnix
- **Application ID / Package:** `com.mode2094.velnix`
- **Version Name:** `0.7.0`
- **Version Code:** `7`
- **Source Commit (بناء):** `7977dbf` (يحتوي كود المراجعة `fcd727c`)
- **تاريخ البناء (UTC):** 2026-10-31
- **Firebase Project:** `velnix-6c1a2`
- **البيئة:** Production (Live) — App Check = Play Integrity على Android

## الملفان
| الملف | الحجم | SHA-256 |
|---|---:|---|
| `Velnix-release.apk` | 81,131,692 بايت | `8fcbcaf02fb60f37f8c4fd2d815268b887b49c0f994a0f2df56861601092ddfb` |
| `Velnix-release.aab` | 73,791,120 بايت | `21ecd0e91672979e023b716d124e2507de75059d3d123649502ef9548ede16a8` |

- **شهادة التوقيع (APK وAAB):** `CN=Velnix, OU=Delivery, O=Velnix, L=Amman, C=JO`
- **SHA-256 للشهادة:** `6e57f935d4c7417029452b2d48b2d07520e8945d2ec51c54b77bb03dfde21601`
- **APK:** موقّع APK Signature Scheme v2، Release (ليس Debug)، وتم التحقق بـ`apksigner verify`.
- **AAB:** موقّع بمفتاح الرفع نفسه، واجتاز `bundletool validate`، وأُشتق منه Universal APK صالح بنفس الإصدار والشهادة.

## التثبيت
1. انقل `Velnix-release.apk` إلى هاتف Android (Android 7.0 / API 24 أو أحدث).
2. اسمح بتثبيت التطبيقات من هذا المصدر إن طُلب.
3. ثبّت التطبيق وافتحه، ثم سجّل الدخول بحساب Google/بريد مصرح.

AAB مخصص لـ **Google Play Console** عبر رفع الحزمة (Upload key). لا يُثبّت مباشرة على الهاتف.
لا تُرفع الحزمة إلى Play تلقائياً — القرار للمالك.

## الاختبارات المنفذة
- Flutter: **493/493**، Analyze نظيف، Format مطابق.
- Functions Unit: **195/195**.
- Firebase Emulator + Rules: **249/249**.
- Playwright (5 أدوار): **21/21** في CI.
- Code128 + QR: **51/51** على 203/300/600 DPI.
- APK: تثبيت وتشغيل على Android Emulator، ووصل إلى شاشة تسجيل الدخول بلا أخطاء Fatal.

## غير المنفذ (BLOCKED)
- اختبار هاتف Android حقيقي (كاميرا QR / Play Integrity الفعلي / إشعارات Push).
- اختبار طابعة ورقية فعلية.
- شحنة Click حقيقية (لم تُرسل أي شحنة).
- نشر AAB على Google Play (لم يُرسل للمراجعة).

## ملاحظات
- لا توجد صلاحية ميكروفون أو Speech Recognition.
- مفاتيح التوقيع و`key.properties` خارج Git.
- هذه النسخة **Release Candidate** قابلة لتسليم التثبيت/الاختبار؛ القبول الميداني النهائي يتطلب البنود المحجوبة أعلاه.
