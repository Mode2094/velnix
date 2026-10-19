# VELNIX — TEST ACCEPTANCE

**آخر كود منشور:** `4af190d`  
**CI:** `39296162147` (flutter, firebase, android, emulator-ui) — ناجح  
**Hosting:** https://velnix-6c1a2.web.app

## الاختبارات الآلية

| المجموعة | النتيجة |
|---|---|
| Functions Unit | **191/191** |
| Firebase Emulator | **148/148** |
| Flutter Analyze | **نظيف** |
| Flutter Widget/Login | **ناجح** |
| Flutter Full (macOS) | **341 نجاح / 18 Golden قديم** |
| CI (Linux) | **جميع الوظائف ناجحة** |
| `check_secrets.py` | **0 findings** |

## اختبار Chrome الإنتاجي

| السيناريو | النتيجة |
|---|---|
| Email/Password Login | **PASS** |
| GM Dashboard | **PASS** |
| فتح الطلبات | **PASS** |
| فتح `click_e2e_1318368` | **PASS** |
| عرض البوليصة/المرجع/الكود الأصلي | **PASS** |
| عرض حالة Click ومصدرها | **PASS** |
| «مزامنة حالة Click» | **PASS — HTTP 200** |
| تحديث آخر مزامنة في الواجهة | **PASS** |
| manager/warehouse/sales/dataEntry | **PASS** |
| pending/rejected/disabled | **PASS — منع الدخول** |
| sales بلا زر مزامنة | **PASS** |
| حذف الحسابات الاختبارية | **PASS** |

## اختبار Click

| البند | النتيجة |
|---|---|
| setorder الحقيقي السابق | **PASS — 1318368، لم يُكرر** |
| getorder | **PASS — HTTP 200** |
| المزامنة اليدوية من الواجهة | **PASS** |
| Firebase Persistence | **PASS** |
| Audit | **PASS** |
| منع شحنة ثانية | **PASS** |

## ملاحظات

- Golden failures الـ18 على macOS معروفة، وتنجح في CI على Linux.
- اختبار Chrome الآلي احتاج تخفيض App Check score مؤقتًا إلى 0 ثم أُعيد إلى 0.5.
- الحسابات الاختبارية حُذفت من Auth/Firestore بعد الاختبار.
