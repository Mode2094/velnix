# VELNIX — تقرير الإصدار النهائي وتوقيع APK/AAB

- **الفرع:** `release/velnix-completion` · **آخر Commit:** `210220d42cb6decd4fa2b964b4cea91009ebdb04`
- **مشروع Firebase:** `velnix-6c1a2` · **applicationId:** `com.mode2094.velnix`
- **الإصدار:** `0.7.0+10` (versionName 0.7.0، versionCode 10)

## الحالة: 🟢 READY للدمج والنشر (بانتظار موافقتك)

## 1. حاجز CI — أُصلح
- السبب: شبكة عدّاء GitHub أرجعت **HTTP 504** لأصول إصدارات GitHub (توزيعة Gradle 9.3.1 ثم `kotlin-compiler-embeddable` عبر `repo.maven.apache.org`→github). الأصل نفسه متاح (200) وحالة GitHub سليمة ⇒ مشكلة شبكة عدّاء عابرة.
- الحل (بلا تخفيض أي نسخة): تغليف بناءي APK التجريبيين بـ`nick-fields/retry` (8 محاولات، انتظار 60ث).
- **النتيجة: CI أخضر كامل على `210220d`** — flutter (+520) · firebase (211) · emulator (304) · android (بناء demo+live).

## 2. جرد الإنتاج (قراءة فقط، dry-run — صفر كتابة)
`scanned:5 · missingDeliveryAccepted:5 · wouldAccept:2 · wouldReject:3 · needsManualReview:1`

| id | status | dispatchState | التصنيف |
|---|---|---|---|
| `8gwKp…` | created | idle | false (مُعيّن، لم يُرسل) |
| `T3qON…` | created | idle | false (مُعيّن، لم يُرسل) |
| `m4Wlx…` | ready | needs_review | false (غير مؤكد — يحتاج مصالحة يدوية) |
| `s8h2d…` | dispatched | sent + click_api | **true** |
| `yrgCk…` | dispatched | sent + click_api | **true** |

`clickOrderRef` وحده لا يُعدّ قبولًا. الـbackfill معاملاتي/فعّال التكرار/قابل للاستئناف ولا يكتب فوق قبول أحدث. **لم يُنفَّذ `--apply`.**

## 3. الفهارس والدوال والقواعد
- فهارس `deliveryAccepted` موجودة (161 إجمالًا). القواعد deny-by-default بلا تغيير. App Check `recaptcha_enterprise`.
- ترتيب النشر: فهارس → backfill (بموافقة) → دوال → تطبيق. النشر إضافي ولا يكتب فوق حقول العملاء/المالية/الشحن.

## 4. الدمج
سلسلة parent نظيفة: `main 47fae75 → PR#8 1aeb1aa → PR#9 9c3157d → PR#10 210220d`. دمج سريع بلا تعارضات. **لم يُدمج.**

## 5. APK/AAB الموقّعان (مبنيّان محليًا وموثّقان)
| الأصل | الحجم | SHA-256 |
|---|---|---|
| `app-release.apk` | 81,033,688 بايت | `fa0a7baa1e84bc57a11d4e8f81e937ec568c315c46e076468643b5f74045b722` |
| `app-release.aab` | 73,685,690 بايت | `b9828d03665d1cd252987c855681a54314953ff2037a006cfd0bccf7acf6463f` |

- التوقيع: `CN=Velnix, OU=Delivery, O=Velnix, L=Amman, C=JO` · SHA-256 الشهادة `6E:57:F9:…:16:01` (نفس مفتاح الإصدار المعتمد). APK: v2 موقّع (`Verifies`). AAB: `jar verified`.
- applicationId `com.mode2094.velnix` · minSdk 24 · targetSdk 36 · versionCode 10.
- أذونات: INTERNET, CAMERA, POST_NOTIFICATIONS, WAKE_LOCK, ACCESS_NETWORK_STATE, biometric.

## 6. اختبار الجهاز الحقيقي (محاكي)
- `adb install` → **Success**. الإطلاق → `MainActivity` هو التركيز، العملية حيّة، **0 أعطال fatal**. أُزيل المحاكي بعد الاختبار.

## 7. خطوات الإصدار المتبقية (بموافقتك)
1. دمج PR #8 → #9 → #10.
2. `firebase deploy --only firestore:indexes`.
3. `node functions/scripts/backfill_delivery_accepted.js --apply` (بعد موافقة صريحة + نسخة احتياطية).
4. نشر الدوال.
5. رفع APK/AAB محليًا (المفتاح محلي؛ لا أسرار في CI). رفع لـPlay **يتطلب موافقة منفصلة**.

## 8. قيود
- لم يُشغَّل Click الإنتاجي.
- الـbackfill writing محدّد لم يُنفَّذ.
- لا نشر Firebase ولا دمج.
