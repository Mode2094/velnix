# VELNIX — TEST ACCEPTANCE

**الكود المنشور:** `d953dbb`  
**CI:** `39320802815` — ناجح  
**Hosting:** https://velnix-6c1a2.web.app

## الاختبارات الآلية

| المجموعة | النتيجة |
|---|---|
| Functions Unit | **192/192** |
| Firebase Emulator | **149/149** |
| Flutter Analyze | **نظيف** |
| Flutter Full (macOS) | **343 نجاح / 18 Golden قديم** |
| CI (Linux) | **جميع الوظائف ناجحة** |
| check_secrets.py | **0 findings** |

## Chrome الإنتاجي

| السيناريو | النتيجة |
|---|---|
| Email/Password Login | **PASS** |
| لوحة التحكم | **PASS** |
| تحميل الحساب بعد جلسة محذوفة | **PASS** — خروج تلقائي لشاشة الدخول |
| الطلبات والتفاصيل | **PASS** |
| زر «إرسال إلى Click» للطلب الجاهز | **PASS** — ظاهر |
| إرسال حي للطلب | **BLOCKED** — ينتظر موافقة المالك على `click_send_test_ready` |
| مزامنة Click اليدوية | **PASS** — 200 |
| المزامنة التلقائية | **PASS** — Scheduler run: checked=1 |
| 8 أدوار | **PASS** |
| منع الأدوار غير المخوّلة | **PASS** |

## Click

| البند | النتيجة |
|---|---|
| setorder السابق | **PASS — 1318368 فقط** |
| getorder | **PASS — HTTP 200** |
| حفظ البوليصة/المرجع | **PASS** |
| منع التكرار | **PASS** |
| Scheduler | **ENABLED كل 15 دقيقة** |
| أول تشغيل إنتاجي | **PASS — checked=1, failed=0** |

## ملاحظات

- Golden failures الـ18 على macOS معروفة وتنجح في CI على Linux.
- App Check `minValidScore=0.5`؛ خُفّض مؤقتًا لاختبار المتصفح الآلي ثم أُعيد.
- حسابات E2E المؤقتة حُذفت.
- لم تُنشأ شحنة Click جديدة.
